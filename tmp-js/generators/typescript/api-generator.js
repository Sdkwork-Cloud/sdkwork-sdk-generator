import { createUniqueIdentifierMap, toSafeCamelIdentifier } from '../../framework/identifiers.js';
import { TYPESCRIPT_CONFIG, getTypeScriptType } from './config.js';
import { buildTypeScriptTagMetadata } from './tag-metadata.js';
import { buildTypeScriptResourceTree, resolveTypeScriptMethodNames, usesNestedResourceSurfaceForOperations, } from './usage-planner.js';
import { supportsRequestBodyByDefault, toHttpMethodLiteral } from '../../framework/http-methods.js';
import { collectSchemaReferences, resolveMediaTypeSchema } from '../../framework/schema.js';
import { extractEventStreamResponseInfo } from '../../framework/responses.js';
import { extractOpenApiParameterContentSchema, requiresExplicitOpenApiQuerySerialization, resolveOpenApiParameterSerialization, } from '../../framework/parameter-serialization.js';
const TYPESCRIPT_RESERVED_WORDS = new Set([
    'abstract',
    'any',
    'as',
    'asserts',
    'async',
    'await',
    'bigint',
    'boolean',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'declare',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'finally',
    'for',
    'from',
    'function',
    'get',
    'if',
    'implements',
    'import',
    'in',
    'infer',
    'instanceof',
    'interface',
    'is',
    'keyof',
    'let',
    'module',
    'namespace',
    'never',
    'new',
    'null',
    'number',
    'object',
    'package',
    'private',
    'protected',
    'public',
    'readonly',
    'require',
    'return',
    'set',
    'static',
    'string',
    'super',
    'switch',
    'symbol',
    'this',
    'throw',
    'true',
    'try',
    'type',
    'typeof',
    'undefined',
    'unique',
    'unknown',
    'var',
    'void',
    'while',
    'with',
    'yield',
]);
export class ApiGenerator {
    generate(ctx, config) {
        const files = [];
        const tags = Object.keys(ctx.apiGroups);
        const tagMetadataList = buildTypeScriptTagMetadata(tags, config);
        const tagMetadataMap = new Map(tagMetadataList.map((meta) => [meta.tag, meta]));
        const knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => TYPESCRIPT_CONFIG.namingConventions.modelName(schemaName)));
        for (const tag of tags) {
            const group = ctx.apiGroups[tag];
            const metadata = tagMetadataMap.get(tag);
            if (!metadata) {
                continue;
            }
            files.push(this.generateApiFile(metadata, group.operations, config, knownModels));
        }
        files.push(this.generateBaseApi());
        files.push(this.generatePaths(config));
        files.push(this.generateApiIndex(tagMetadataList, config));
        return files;
    }
    generateApiFile(metadata, operations, config, knownModels) {
        const className = metadata.className;
        const fileName = metadata.fileName;
        const referencedModels = new Set();
        const resourceTree = usesNestedResourceSurfaceForOperations(config, operations)
            ? buildTypeScriptResourceTree(metadata.tag, operations, metadata, config)
            : undefined;
        const methods = resourceTree
            ? this.generateResourceClasses(resourceTree, config, knownModels, referencedModels)
            : this.generateFlatApiClass(metadata, operations, config, knownModels, referencedModels);
        const needsRequestHeaderHelpers = operations.some((op) => {
            const allParameters = op.allParameters || op.parameters || [];
            return allParameters.some((param) => param?.in === 'header' || param?.in === 'cookie');
        });
        const needsPathSerializationHelpers = operations.some((op) => this.extractPathParams(op.path).length > 0);
        const needsQuerySerializationHelpers = operations.some((op) => {
            const allParameters = op.allParameters || op.parameters || [];
            return allParameters.some((param) => param?.in === 'query' && requiresExplicitOpenApiQuerySerialization(param));
        });
        const needsQueryParamsImport = operations.some((op) => {
            const allParameters = op.allParameters || op.parameters || [];
            const queryParameters = allParameters.filter((param) => param?.in === 'query');
            return queryParameters.length > 0
                && !queryParameters.some((param) => requiresExplicitOpenApiQuerySerialization(param));
        });
        const typeImports = referencedModels.size > 0
            ? `import type { ${Array.from(referencedModels).sort((a, b) => a.localeCompare(b)).join(', ')} } from '../types';\n`
            : '';
        return {
            path: `src/api/${fileName}.ts`,
            content: this.format(`import { ${config.sdkType}ApiPath } from './paths';
import type { HttpClient } from '../http/client';
${needsQueryParamsImport ? "import type { QueryParams } from '../types/common';" : ''}
${typeImports}

${methods}

function appendQueryString(path: string, rawQueryString: string): string {
  const query = rawQueryString.replace(/^\\?+/, '');
  if (!query) {
    return path;
  }
  return path.includes('?') ? \`\${path}&\${query}\` : \`\${path}?\${query}\`;
}

${needsPathSerializationHelpers ? this.generatePathSerializationHelpers() : ''}
${needsQuerySerializationHelpers ? this.generateQuerySerializationHelpers() : ''}
${needsRequestHeaderHelpers ? this.generateRequestHeaderHelpers() : ''}
`),
            language: 'typescript',
            description: `${metadata.tag} API module`,
        };
    }
    generateFlatApiClass(metadata, operations, config, knownModels, referencedModels) {
        const methodNames = this.resolveMethodNames(operations, metadata.tag, config);
        const generatedMethods = operations
            .map((op) => {
            const generated = this.generateMethod(op, config, metadata.className, methodNames.get(op) || 'operation', knownModels);
            generated.referencedModels.forEach((modelName) => referencedModels.add(modelName));
            return generated;
        });
        const typeDefinitions = generatedMethods.flatMap((generated) => generated.typeDefinitions).join('\n\n');
        const methods = generatedMethods.map((generated) => generated.content).join('\n\n');
        return `${typeDefinitions ? `${typeDefinitions}\n\n` : ''}export class ${metadata.className} {
  private client: HttpClient;
  
  constructor(client: HttpClient) { 
    this.client = client; 
  }

${methods}
}

export function create${metadata.className}(client: HttpClient): ${metadata.className} {
  return new ${metadata.className}(client);
}`;
    }
    generateResourceClasses(root, config, knownModels, referencedModels) {
        const classes = this.flattenResourceNodes(root)
            .reverse()
            .map((node) => this.generateResourceClass(node, config, knownModels, referencedModels))
            .join('\n\n');
        return `${classes}

export function create${root.className}(client: HttpClient): ${root.className} {
  return new ${root.className}(client);
}`;
    }
    generateResourceClass(node, config, knownModels, referencedModels) {
        const methodNames = this.resolveMethodNames(node.operations, node.propertyName, config, node.resourcePathSegments);
        const childProperties = node.children
            .map((child) => `  public readonly ${child.propertyName}: ${child.className};`)
            .join('\n');
        const childInitializers = node.children
            .map((child) => `    this.${child.propertyName} = new ${child.className}(client);`)
            .join('\n');
        const generatedMethods = node.operations
            .map((op) => {
            const generated = this.generateMethod(op, config, node.className, methodNames.get(op) || 'operation', knownModels);
            generated.referencedModels.forEach((modelName) => referencedModels.add(modelName));
            return generated;
        });
        const typeDefinitions = generatedMethods.flatMap((generated) => generated.typeDefinitions).join('\n\n');
        const methods = generatedMethods.map((generated) => generated.content).join('\n\n');
        return `${typeDefinitions ? `${typeDefinitions}\n\n` : ''}export class ${node.className} {
  private client: HttpClient;${childProperties ? `\n${childProperties}` : ''}
  
  constructor(client: HttpClient) { 
    this.client = client;${childInitializers ? `\n${childInitializers}` : ''} 
  }
${methods ? `\n\n${methods}` : ''}
}`;
    }
    flattenResourceNodes(root) {
        return [
            root,
            ...root.children.flatMap((child) => this.flattenResourceNodes(child)),
        ];
    }
    generateMethod(op, config, className, methodName, knownModels) {
        const rawPathParams = this.extractPathParams(op.path);
        const allParameters = op.allParameters || op.parameters || [];
        const queryParams = allParameters.filter((param) => param?.in === 'query');
        const queryStringParams = allParameters.filter((param) => param?.in === 'querystring');
        const headerParams = allParameters.filter((param) => param?.in === 'header');
        const cookieParams = allParameters.filter((param) => param?.in === 'cookie');
        const pathOpenApiParams = allParameters.filter((param) => param?.in === 'path');
        const method = String(op.method || '').toLowerCase();
        const httpMethod = String(op.httpMethod || op.method || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const supportsRequestBody = supportsRequestBodyByDefault(method);
        const hasQuery = queryParams.length > 0;
        const hasRawQueryString = queryStringParams.length > 0;
        const hasHeaders = headerParams.length > 0 || cookieParams.length > 0;
        const requestBodyInfo = this.extractRequestBodyInfo(op);
        const requestBodySchema = supportsRequestBody ? requestBodyInfo?.schema : undefined;
        const requestBodyMediaType = (requestBodyInfo?.mediaType || '').toLowerCase();
        const hasBody = supportsRequestBody && requestBodyInfo !== undefined;
        const requestBodyRequired = hasBody && Boolean(op.requestBody?.required);
        const hasExplicitQuerySerialization = queryParams.some((param) => requiresExplicitOpenApiQuerySerialization(param));
        const requestType = requestBodySchema
            ? getTypeScriptType(requestBodySchema, TYPESCRIPT_CONFIG, knownModels)
            : undefined;
        const contentTypeArg = requestBodyInfo?.mediaType
            ? `, '${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
            : '';
        const eventStreamInfo = extractEventStreamResponseInfo(op);
        const isEventStreamResponse = Boolean(eventStreamInfo);
        const responseSchema = eventStreamInfo?.schema ?? this.extractResponseSchema(op);
        const responseType = responseSchema
            ? getTypeScriptType(responseSchema, TYPESCRIPT_CONFIG, knownModels)
            : this.inferFallbackResponseType(op);
        const referencedModels = new Set();
        if (hasBody && requestBodySchema) {
            this.collectReferencedModels(requestBodySchema, knownModels, referencedModels);
        }
        if (responseSchema) {
            this.collectReferencedModels(responseSchema, knownModels, referencedModels);
        }
        for (const parameter of [...pathOpenApiParams, ...queryParams, ...headerParams, ...cookieParams]) {
            this.collectParameterReferencedModels(parameter, knownModels, referencedModels);
        }
        const pathParamNames = createUniqueIdentifierMap(rawPathParams, (value) => toSafeCamelIdentifier(value, TYPESCRIPT_RESERVED_WORDS), [
            hasBody ? 'body' : '',
            hasQuery ? 'params' : '',
            hasRawQueryString ? 'rawQueryString' : '',
            hasHeaders ? 'requestHeaders' : '',
        ]);
        const pathParams = rawPathParams.map((rawName) => {
            const parameter = pathOpenApiParams.find((candidate) => candidate?.name === rawName);
            const serialization = resolveOpenApiParameterSerialization(parameter || { name: rawName, in: 'path' });
            return {
                rawName,
                safeName: pathParamNames.get(rawName) || rawName,
                type: parameter?.schema
                    ? getTypeScriptType(parameter.schema, TYPESCRIPT_CONFIG, knownModels)
                    : 'string | number',
                style: serialization.style,
                explode: serialization.explode,
            };
        });
        const parameterReservedNames = [
            ...pathParams.map((param) => param.safeName),
            hasBody ? 'body' : '',
            hasQuery ? 'params' : '',
            hasRawQueryString ? 'rawQueryString' : '',
            hasHeaders ? 'requestHeaders' : '',
        ];
        const queryBindings = hasExplicitQuerySerialization
            ? this.createQueryParameterBindings(queryParams, knownModels, parameterReservedNames)
            : [];
        const headerBindings = this.createHeaderParameterBindings(headerParams, knownModels, [
            ...parameterReservedNames,
            ...queryBindings.map((binding) => binding.safeName),
        ]);
        const cookieBindings = this.createHeaderParameterBindings(cookieParams, knownModels, [
            ...parameterReservedNames,
            ...queryBindings.map((binding) => binding.safeName),
            ...headerBindings.map((binding) => binding.safeName),
        ]);
        const operationParametersType = this.createOperationParametersType(className, methodName, queryBindings, headerBindings, cookieBindings);
        const params = [];
        if (pathParams.length) {
            params.push(...pathParams.map((param) => `${param.safeName}: ${param.type}`));
        }
        if (hasBody && requestType && requestBodyRequired) {
            params.push(requestBodyRequired ? `body: ${requestType}` : `body?: ${requestType}`);
        }
        if (hasRawQueryString)
            params.push('rawQueryString: string');
        if (operationParametersType?.required) {
            params.push(`params: ${operationParametersType.typeName}`);
        }
        if (hasBody && requestType && !requestBodyRequired) {
            params.push(`body?: ${requestType}`);
        }
        if (hasQuery && !hasExplicitQuerySerialization)
            params.push('params?: QueryParams');
        if (operationParametersType && !operationParametersType.required) {
            params.push(`params?: ${operationParametersType.typeName}`);
        }
        const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
        const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, (_match, paramName) => {
            const binding = pathParams.find((param) => param.rawName === paramName);
            const safeName = binding?.safeName || pathParamNames.get(paramName) || toSafeCamelIdentifier(paramName, TYPESCRIPT_RESERVED_WORDS);
            const style = binding?.style || 'simple';
            const explode = binding?.explode ? 'true' : 'false';
            return `\${serializePathParameter(${safeName}, { name: '${this.escapeSingleQuoted(paramName)}', style: '${this.escapeSingleQuoted(style)}', explode: ${explode} })}`;
        });
        const pathExpression = `${config.sdkType}ApiPath(\`${pathTemplate}\`)`;
        const requestPathExpression = hasRawQueryString
            ? `appendQueryString(${pathExpression}, rawQueryString)`
            : hasExplicitQuerySerialization
                ? `appendQueryString(${pathExpression}, query)`
                : pathExpression;
        let call = '';
        switch (method) {
            case 'get':
                if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `this.client.get<${responseType}>(${requestPathExpression}, undefined, requestHeaders)`
                        : `this.client.get<${responseType}>(${requestPathExpression}, params, requestHeaders)`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `this.client.get<${responseType}>(${requestPathExpression})`
                        : `this.client.get<${responseType}>(${requestPathExpression}, params)`;
                }
                else if (hasHeaders) {
                    call = `this.client.get<${responseType}>(${requestPathExpression}, undefined, requestHeaders)`;
                }
                else {
                    call = `this.client.get<${responseType}>(${requestPathExpression})`;
                }
                break;
            case 'post':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = hasExplicitQuerySerialization
                            ? `this.client.post<${responseType}>(${requestPathExpression}, body, undefined, requestHeaders${contentTypeArg})`
                            : `this.client.post<${responseType}>(${requestPathExpression}, body, params, requestHeaders${contentTypeArg})`;
                    }
                    else if (hasQuery) {
                        call = hasExplicitQuerySerialization
                            ? `this.client.post<${responseType}>(${requestPathExpression}, body, undefined, undefined${contentTypeArg})`
                            : `this.client.post<${responseType}>(${requestPathExpression}, body, params, undefined${contentTypeArg})`;
                    }
                    else if (hasHeaders) {
                        call = `this.client.post<${responseType}>(${requestPathExpression}, body, undefined, requestHeaders${contentTypeArg})`;
                    }
                    else {
                        call = `this.client.post<${responseType}>(${requestPathExpression}, body, undefined, undefined${contentTypeArg})`;
                    }
                }
                else {
                    if (hasQuery && hasHeaders) {
                        call = hasExplicitQuerySerialization
                            ? `this.client.post<${responseType}>(${requestPathExpression}, undefined, undefined, requestHeaders)`
                            : `this.client.post<${responseType}>(${requestPathExpression}, undefined, params, requestHeaders)`;
                    }
                    else if (hasQuery) {
                        call = hasExplicitQuerySerialization
                            ? `this.client.post<${responseType}>(${requestPathExpression})`
                            : `this.client.post<${responseType}>(${requestPathExpression}, undefined, params)`;
                    }
                    else if (hasHeaders) {
                        call = `this.client.post<${responseType}>(${requestPathExpression}, undefined, undefined, requestHeaders)`;
                    }
                    else {
                        call = `this.client.post<${responseType}>(${requestPathExpression})`;
                    }
                }
                break;
            case 'put':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = hasExplicitQuerySerialization
                            ? `this.client.put<${responseType}>(${requestPathExpression}, body, undefined, requestHeaders${contentTypeArg})`
                            : `this.client.put<${responseType}>(${requestPathExpression}, body, params, requestHeaders${contentTypeArg})`;
                    }
                    else if (hasQuery) {
                        call = hasExplicitQuerySerialization
                            ? `this.client.put<${responseType}>(${requestPathExpression}, body, undefined, undefined${contentTypeArg})`
                            : `this.client.put<${responseType}>(${requestPathExpression}, body, params, undefined${contentTypeArg})`;
                    }
                    else if (hasHeaders) {
                        call = `this.client.put<${responseType}>(${requestPathExpression}, body, undefined, requestHeaders${contentTypeArg})`;
                    }
                    else {
                        call = `this.client.put<${responseType}>(${requestPathExpression}, body, undefined, undefined${contentTypeArg})`;
                    }
                }
                else {
                    if (hasQuery && hasHeaders) {
                        call = hasExplicitQuerySerialization
                            ? `this.client.put<${responseType}>(${requestPathExpression}, undefined, undefined, requestHeaders)`
                            : `this.client.put<${responseType}>(${requestPathExpression}, undefined, params, requestHeaders)`;
                    }
                    else if (hasQuery) {
                        call = hasExplicitQuerySerialization
                            ? `this.client.put<${responseType}>(${requestPathExpression})`
                            : `this.client.put<${responseType}>(${requestPathExpression}, undefined, params)`;
                    }
                    else if (hasHeaders) {
                        call = `this.client.put<${responseType}>(${requestPathExpression}, undefined, undefined, requestHeaders)`;
                    }
                    else {
                        call = `this.client.put<${responseType}>(${requestPathExpression})`;
                    }
                }
                break;
            case 'delete':
                if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `this.client.delete<${responseType}>(${requestPathExpression}, undefined, requestHeaders)`
                        : `this.client.delete<${responseType}>(${requestPathExpression}, params, requestHeaders)`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `this.client.delete<${responseType}>(${requestPathExpression})`
                        : `this.client.delete<${responseType}>(${requestPathExpression}, params)`;
                }
                else if (hasHeaders) {
                    call = `this.client.delete<${responseType}>(${requestPathExpression}, undefined, requestHeaders)`;
                }
                else {
                    call = `this.client.delete<${responseType}>(${requestPathExpression})`;
                }
                break;
            case 'patch':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = hasExplicitQuerySerialization
                            ? `this.client.patch<${responseType}>(${requestPathExpression}, body, undefined, requestHeaders${contentTypeArg})`
                            : `this.client.patch<${responseType}>(${requestPathExpression}, body, params, requestHeaders${contentTypeArg})`;
                    }
                    else if (hasQuery) {
                        call = hasExplicitQuerySerialization
                            ? `this.client.patch<${responseType}>(${requestPathExpression}, body, undefined, undefined${contentTypeArg})`
                            : `this.client.patch<${responseType}>(${requestPathExpression}, body, params, undefined${contentTypeArg})`;
                    }
                    else if (hasHeaders) {
                        call = `this.client.patch<${responseType}>(${requestPathExpression}, body, undefined, requestHeaders${contentTypeArg})`;
                    }
                    else {
                        call = `this.client.patch<${responseType}>(${requestPathExpression}, body, undefined, undefined${contentTypeArg})`;
                    }
                }
                else {
                    if (hasQuery && hasHeaders) {
                        call = hasExplicitQuerySerialization
                            ? `this.client.patch<${responseType}>(${requestPathExpression}, undefined, undefined, requestHeaders)`
                            : `this.client.patch<${responseType}>(${requestPathExpression}, undefined, params, requestHeaders)`;
                    }
                    else if (hasQuery) {
                        call = hasExplicitQuerySerialization
                            ? `this.client.patch<${responseType}>(${requestPathExpression})`
                            : `this.client.patch<${responseType}>(${requestPathExpression}, undefined, params)`;
                    }
                    else if (hasHeaders) {
                        call = `this.client.patch<${responseType}>(${requestPathExpression}, undefined, undefined, requestHeaders)`;
                    }
                    else {
                        call = `this.client.patch<${responseType}>(${requestPathExpression})`;
                    }
                }
                break;
            default:
                call = `this.client.request<${responseType}>(${requestPathExpression}, { method: '${toHttpMethodLiteral(httpMethod)}' as any${hasBody ? ', body' : ''}${hasQuery && !hasExplicitQuerySerialization ? ', params' : ''}${hasHeaders ? ', headers: requestHeaders' : ''}${hasBody && requestBodyInfo?.mediaType ? `, contentType: '${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : ''} })`;
        }
        const docComment = op.summary ? `/** ${op.summary} */\n  ` : '';
        const queryBlock = hasExplicitQuerySerialization
            ? `    const query = buildQueryString([
${this.renderQueryParameterSpecs(queryBindings, operationParametersType)}
    ]);
`
            : '';
        const requestHeaderBlock = hasHeaders
            ? `    const requestHeaders = buildRequestHeaders(
${this.renderNamedParameterRecord(headerBindings, operationParametersType)},
${this.renderNamedParameterRecord(cookieBindings, operationParametersType)}
    );
`
            : '';
        if (isEventStreamResponse) {
            const streamOptions = [
                `method: '${toHttpMethodLiteral(httpMethod)}' as any`,
                hasBody ? 'body' : '',
                hasQuery && !hasExplicitQuerySerialization ? 'params' : '',
                hasHeaders ? 'headers: requestHeaders' : '',
                hasBody && requestBodyInfo?.mediaType ? `contentType: '${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : '',
            ].filter(Boolean).join(', ');
            return {
                content: `${docComment}async ${methodName}(${params.join(', ')}): Promise<AsyncIterable<${responseType}>> {
${queryBlock}${requestHeaderBlock}    return this.client.streamJson<${responseType}>(${requestPathExpression}, { ${streamOptions} });
  }`,
                referencedModels,
                typeDefinitions: this.renderOperationTypeDefinitions(operationParametersType),
            };
        }
        return {
            content: `${docComment}async ${methodName}(${params.join(', ')}): Promise<${responseType}> {
${queryBlock}${requestHeaderBlock}    return ${call};
  }`,
            referencedModels,
            typeDefinitions: this.renderOperationTypeDefinitions(operationParametersType),
        };
    }
    createOperationParametersType(className, methodName, queryBindings, headerBindings, cookieBindings) {
        const bindings = [...queryBindings, ...headerBindings, ...cookieBindings];
        if (bindings.length === 0) {
            return undefined;
        }
        const ownerName = className.endsWith('Api') ? className.slice(0, -3) : className;
        return {
            typeName: `${ownerName}${TYPESCRIPT_CONFIG.namingConventions.modelName(methodName)}Params`,
            required: bindings.some((binding) => binding.required),
            queryBindings,
            headerBindings,
            cookieBindings,
        };
    }
    renderOperationTypeDefinitions(parametersType) {
        if (!parametersType) {
            return [];
        }
        const bindings = [
            ...parametersType.queryBindings,
            ...parametersType.headerBindings,
            ...parametersType.cookieBindings,
        ];
        const fields = bindings.map((binding) => {
            const optional = binding.required ? '' : '?';
            return `  ${binding.safeName}${optional}: ${binding.type};`;
        });
        return [`export interface ${parametersType.typeName} {
${fields.join('\n')}
}`];
    }
    createQueryParameterBindings(parameters, knownModels, reservedNames) {
        return this.createNamedParameterBindings(parameters, knownModels, reservedNames).map((binding) => {
            const serialization = resolveOpenApiParameterSerialization(binding.parameter);
            return {
                ...binding,
                style: serialization.style,
                explode: serialization.explode,
                allowReserved: serialization.allowReserved,
                contentType: serialization.contentType,
            };
        });
    }
    createHeaderParameterBindings(parameters, knownModels, reservedNames) {
        return this.createNamedParameterBindings(parameters, knownModels, reservedNames).map((binding) => {
            const serialization = resolveOpenApiParameterSerialization(binding.parameter);
            return {
                ...binding,
                style: serialization.style,
                explode: serialization.explode,
                contentType: serialization.contentType,
            };
        });
    }
    createNamedParameterBindings(parameters, knownModels, reservedNames) {
        const keys = parameters.map((parameter, index) => `${parameter?.in || 'parameter'}:${parameter?.name || 'value'}:${index}`);
        const rawNameByKey = new Map(keys.map((key, index) => [key, String(parameters[index]?.name || `value${index + 1}`)]));
        const safeNameByKey = createUniqueIdentifierMap(keys, (key) => toSafeCamelIdentifier(rawNameByKey.get(key) || 'value', TYPESCRIPT_RESERVED_WORDS), reservedNames);
        return parameters.map((parameter, index) => {
            const key = keys[index];
            return {
                parameter,
                safeName: safeNameByKey.get(key) || `value${index + 1}`,
                required: Boolean(parameter?.required),
                type: this.getNamedParameterType(parameter, knownModels),
            };
        });
    }
    getNamedParameterType(parameter, knownModels) {
        const contentSchema = extractOpenApiParameterContentSchema(parameter);
        if (contentSchema) {
            return getTypeScriptType(contentSchema, TYPESCRIPT_CONFIG, knownModels);
        }
        if (!parameter?.schema) {
            return 'unknown';
        }
        return getTypeScriptType(parameter.schema, TYPESCRIPT_CONFIG, knownModels);
    }
    renderNamedParameterRecord(bindings, parametersType) {
        if (bindings.length === 0) {
            return '      {}';
        }
        const lines = bindings.map((binding) => {
            const parts = [
                `value: ${this.renderOperationParameterValue(binding, parametersType)}`,
                `style: '${this.escapeSingleQuoted(binding.style)}'`,
                `explode: ${binding.explode ? 'true' : 'false'}`,
            ];
            if (binding.contentType) {
                parts.push(`contentType: '${this.escapeSingleQuoted(binding.contentType)}'`);
            }
            return `        ${this.formatObjectKey(String(binding.parameter?.name || binding.safeName))}: { ${parts.join(', ')} },`;
        });
        return ['      {', ...lines, '      }'].join('\n');
    }
    formatObjectKey(rawName) {
        return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(rawName)
            ? rawName
            : `'${rawName.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    }
    renderQueryParameterSpecs(bindings, parametersType) {
        return bindings.map((binding) => {
            const parts = [
                `name: '${this.escapeSingleQuoted(String(binding.parameter?.name || binding.safeName))}'`,
                `value: ${this.renderOperationParameterValue(binding, parametersType)}`,
                `style: '${this.escapeSingleQuoted(binding.style)}'`,
                `explode: ${binding.explode ? 'true' : 'false'}`,
                `allowReserved: ${binding.allowReserved ? 'true' : 'false'}`,
            ];
            if (binding.contentType) {
                parts.push(`contentType: '${this.escapeSingleQuoted(binding.contentType)}'`);
            }
            return `      { ${parts.join(', ')} },`;
        }).join('\n');
    }
    renderOperationParameterValue(binding, parametersType) {
        if (!parametersType) {
            return binding.safeName;
        }
        return parametersType.required
            ? `params.${binding.safeName}`
            : `params?.${binding.safeName}`;
    }
    generateQuerySerializationHelpers() {
        return `interface QueryParameterSpec {
  name: string;
  value: unknown;
  style: string;
  explode: boolean;
  allowReserved: boolean;
  contentType?: string;
}

function buildQueryString(parameters: QueryParameterSpec[]): string {
  const pairs: string[] = [];
  for (const parameter of parameters) {
    appendSerializedParameter(pairs, parameter);
  }
  return pairs.join('&');
}

function appendSerializedParameter(pairs: string[], parameter: QueryParameterSpec): void {
  if (parameter.value === undefined || parameter.value === null) {
    return;
  }

  if (parameter.contentType) {
    pairs.push(\`\${encodeQueryComponent(parameter.name)}=\${encodeQueryValue(JSON.stringify(parameter.value), parameter.allowReserved)}\`);
    return;
  }

  const style = parameter.style || 'form';
  if (style === 'deepObject') {
    appendDeepObjectParameter(pairs, parameter.name, parameter.value, parameter.allowReserved);
    return;
  }

  if (Array.isArray(parameter.value)) {
    appendArrayParameter(pairs, parameter.name, parameter.value, style, parameter.explode, parameter.allowReserved);
    return;
  }

  if (typeof parameter.value === 'object') {
    appendObjectParameter(pairs, parameter.name, parameter.value as Record<string, unknown>, style, parameter.explode, parameter.allowReserved);
    return;
  }

  pairs.push(\`\${encodeQueryComponent(parameter.name)}=\${encodeQueryValue(serializePrimitive(parameter.value), parameter.allowReserved)}\`);
}

function appendArrayParameter(
  pairs: string[],
  name: string,
  value: unknown[],
  style: string,
  explode: boolean,
  allowReserved: boolean,
): void {
  const values = value
    .filter((item) => item !== undefined && item !== null)
    .map((item) => serializePrimitive(item));
  if (values.length === 0) {
    return;
  }

  if (style === 'form' && explode) {
    for (const item of values) {
      pairs.push(\`\${encodeQueryComponent(name)}=\${encodeQueryValue(item, allowReserved)}\`);
    }
    return;
  }

  pairs.push(\`\${encodeQueryComponent(name)}=\${encodeQueryValue(values.join(','), allowReserved)}\`);
}

function appendObjectParameter(
  pairs: string[],
  name: string,
  value: Record<string, unknown>,
  style: string,
  explode: boolean,
  allowReserved: boolean,
): void {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null);
  if (entries.length === 0) {
    return;
  }

  if (style === 'form' && explode) {
    for (const [key, entryValue] of entries) {
      pairs.push(\`\${encodeQueryComponent(key)}=\${encodeQueryValue(serializePrimitive(entryValue), allowReserved)}\`);
    }
    return;
  }

  const serialized = entries.flatMap(([key, entryValue]) => [key, serializePrimitive(entryValue)]).join(',');
  pairs.push(\`\${encodeQueryComponent(name)}=\${encodeQueryValue(serialized, allowReserved)}\`);
}

function appendDeepObjectParameter(
  pairs: string[],
  name: string,
  value: unknown,
  allowReserved: boolean,
): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    pairs.push(\`\${encodeQueryComponent(name)}=\${encodeQueryValue(serializePrimitive(value), allowReserved)}\`);
    return;
  }

  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (entryValue === undefined || entryValue === null) {
      continue;
    }
    pairs.push(\`\${encodeQueryComponent(\`\${name}[\${key}]\`)}=\${encodeQueryValue(serializePrimitive(entryValue), allowReserved)}\`);
  }
}

function serializePrimitive(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function encodeQueryComponent(value: string): string {
  return encodeURIComponent(value);
}

function encodeQueryValue(value: string, allowReserved: boolean): string {
  const encoded = encodeURIComponent(value);
  if (!allowReserved) {
    return encoded;
  }
  return encoded.replace(/%3A/gi, ':')
    .replace(/%2F/gi, '/')
    .replace(/%3F/gi, '?')
    .replace(/%23/gi, '#')
    .replace(/%5B/gi, '[')
    .replace(/%5D/gi, ']')
    .replace(/%40/gi, '@')
    .replace(/%21/gi, '!')
    .replace(/%24/gi, '$')
    .replace(/%26/gi, '&')
    .replace(/%27/gi, "'")
    .replace(/%28/gi, '(')
    .replace(/%29/gi, ')')
    .replace(/%2A/gi, '*')
    .replace(/%2B/gi, '+')
    .replace(/%2C/gi, ',')
    .replace(/%3B/gi, ';')
    .replace(/%3D/gi, '=');
}`;
    }
    generatePathSerializationHelpers() {
        return `interface PathParameterSpec {
  name: string;
  style: string;
  explode: boolean;
}

function serializePathParameter(value: unknown, spec: PathParameterSpec): string {
  if (value === undefined || value === null) {
    return '';
  }

  const style = spec.style || 'simple';
  if (Array.isArray(value)) {
    return serializePathArray(spec.name, value, style, spec.explode);
  }
  if (typeof value === 'object') {
    return serializePathObject(spec.name, value as Record<string, unknown>, style, spec.explode);
  }
  return pathPrefix(spec.name, style, false) + encodePathValue(serializePathPrimitive(value));
}

function serializePathArray(name: string, values: unknown[], style: string, explode: boolean): string {
  const serialized = values
    .filter((item) => item !== undefined && item !== null)
    .map((item) => encodePathValue(serializePathPrimitive(item)));
  if (serialized.length === 0) {
    return pathPrefix(name, style, false);
  }
  if (style === 'matrix') {
    return explode
      ? serialized.map((item) => \`;\${name}=\${item}\`).join('')
      : \`;\${name}=\${serialized.join(',')}\`;
  }
  return pathPrefix(name, style, false) + serialized.join(explode ? '.' : ',');
}

function serializePathObject(name: string, value: Record<string, unknown>, style: string, explode: boolean): string {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null);
  if (entries.length === 0) {
    return pathPrefix(name, style, true);
  }
  if (style === 'matrix') {
    return explode
      ? entries.map(([key, entryValue]) => \`;\${encodePathValue(key)}=\${encodePathValue(serializePathPrimitive(entryValue))}\`).join('')
      : \`;\${name}=\${entries.flatMap(([key, entryValue]) => [encodePathValue(key), encodePathValue(serializePathPrimitive(entryValue))]).join(',')}\`;
  }
  const serialized = explode
    ? entries.map(([key, entryValue]) => \`\${encodePathValue(key)}=\${encodePathValue(serializePathPrimitive(entryValue))}\`).join(style === 'label' ? '.' : ',')
    : entries.flatMap(([key, entryValue]) => [encodePathValue(key), encodePathValue(serializePathPrimitive(entryValue))]).join(',');
  return pathPrefix(name, style, true) + serialized;
}

function pathPrefix(name: string, style: string, _objectValue: boolean): string {
  if (style === 'label') return '.';
  if (style === 'matrix') return \`;\${name}\`;
  return '';
}

function encodePathValue(value: string): string {
  return encodeURIComponent(value);
}

function serializePathPrimitive(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}`;
    }
    generateRequestHeaderHelpers() {
        return `function buildRequestHeaders(
  headers: Record<string, HeaderParameterSpec | undefined>,
  cookies: Record<string, HeaderParameterSpec | undefined> = {},
): Record<string, string> | undefined {
  const requestHeaders: Record<string, string> = {};

  for (const [name, parameter] of Object.entries(headers)) {
    const serialized = serializeParameterValue(parameter);
    if (serialized !== undefined) {
      requestHeaders[name] = serialized;
    }
  }

  const cookieHeader = buildCookieHeader(cookies);
  if (cookieHeader) {
    requestHeaders.Cookie = requestHeaders.Cookie
      ? \`\${requestHeaders.Cookie}; \${cookieHeader}\`
      : cookieHeader;
  }

  return Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined;
}

interface HeaderParameterSpec {
  value: unknown;
  style: string;
  explode: boolean;
  contentType?: string;
}

function buildCookieHeader(cookies: Record<string, HeaderParameterSpec | undefined>): string | undefined {
  const pairs: string[] = [];
  for (const [name, parameter] of Object.entries(cookies)) {
    const serialized = serializeParameterValue(parameter);
    if (serialized !== undefined) {
      pairs.push(\`\${encodeURIComponent(name)}=\${encodeURIComponent(serialized)}\`);
    }
  }
  return pairs.length > 0 ? pairs.join('; ') : undefined;
}

function serializeParameterValue(parameter: HeaderParameterSpec | undefined): string | undefined {
  const value = parameter?.value;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (parameter?.contentType) {
    return JSON.stringify(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeHeaderPrimitive(item)).join(',');
  }
  if (typeof value === 'object' && value !== null) {
    return serializeHeaderObject(value as Record<string, unknown>, parameter?.explode === true);
  }
  return serializeHeaderPrimitive(value);
}

function serializeHeaderObject(value: Record<string, unknown>, explode: boolean): string {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null);
  if (explode) {
    return entries.map(([key, entryValue]) => \`\${key}=\${serializeHeaderPrimitive(entryValue)}\`).join(',');
  }
  return entries.flatMap(([key, entryValue]) => [key, serializeHeaderPrimitive(entryValue)]).join(',');
}

function serializeHeaderPrimitive(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}`;
    }
    extractRequestBodyInfo(op) {
        const content = op?.requestBody?.content;
        if (!content || typeof content !== 'object') {
            return undefined;
        }
        const mediaType = this.pickRequestBodyMediaType(content);
        if (!mediaType) {
            return undefined;
        }
        const schema = resolveMediaTypeSchema(content[mediaType]);
        if (!schema) {
            return undefined;
        }
        return { schema, mediaType };
    }
    pickRequestBodyMediaType(content) {
        const mediaTypes = Object.keys(content);
        if (mediaTypes.length === 0) {
            return undefined;
        }
        const priority = ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded'];
        for (const preferred of priority) {
            const matched = mediaTypes.find((mediaType) => mediaType.toLowerCase() === preferred);
            if (matched) {
                return matched;
            }
        }
        const jsonLike = mediaTypes.find((mediaType) => mediaType.toLowerCase().endsWith('+json'));
        return jsonLike || mediaTypes[0];
    }
    extractResponseSchema(op) {
        const responses = op?.responses;
        if (!responses || typeof responses !== 'object') {
            return undefined;
        }
        const statusCodes = Object.keys(responses).sort();
        const preferred = statusCodes.filter((code) => /^2\d\d$/.test(code));
        const candidates = preferred.length > 0 ? preferred : statusCodes;
        for (const code of candidates) {
            const content = responses[code]?.content;
            if (!content || typeof content !== 'object') {
                continue;
            }
            const mediaType = this.pickJsonMediaType(content);
            if (mediaType) {
                const schema = resolveMediaTypeSchema(content[mediaType]);
                if (schema) {
                    return schema;
                }
            }
        }
        return undefined;
    }
    pickJsonMediaType(content) {
        const mediaTypes = Object.keys(content);
        const jsonLike = mediaTypes.find((mediaType) => {
            const normalized = mediaType.toLowerCase();
            return normalized === 'application/json' || normalized.endsWith('+json');
        });
        return jsonLike || mediaTypes[0];
    }
    inferFallbackResponseType(op) {
        const responses = op?.responses;
        if (!responses || typeof responses !== 'object') {
            return 'unknown';
        }
        const statusCodes = Object.keys(responses);
        if (statusCodes.length === 0) {
            return 'unknown';
        }
        const allNoContent = statusCodes.every((code) => {
            const content = responses[code]?.content;
            return !content || typeof content !== 'object' || Object.keys(content).length === 0;
        });
        if (allNoContent || responses['204']) {
            return 'void';
        }
        return 'unknown';
    }
    collectReferencedModels(schema, knownModels, refs) {
        collectSchemaReferences(schema, TYPESCRIPT_CONFIG.namingConventions.modelName, knownModels, refs);
    }
    collectParameterReferencedModels(parameter, knownModels, refs) {
        const contentSchema = extractOpenApiParameterContentSchema(parameter);
        if (contentSchema) {
            this.collectReferencedModels(contentSchema, knownModels, refs);
            return;
        }
        if (parameter?.schema) {
            this.collectReferencedModels(parameter.schema, knownModels, refs);
        }
    }
    resolveMethodNames(operations, tag, config, resourcePathSegments) {
        return resolveTypeScriptMethodNames(tag, operations, config, resourcePathSegments);
    }
    extractPathParams(path) {
        const matches = path.match(/\{([^}]+)\}/g) || [];
        return matches.map(m => m.replace(/[{}]/g, ''));
    }
    normalizeOperationPath(path, apiPrefix) {
        const normalizedPathRaw = String(path || '').trim();
        if (!normalizedPathRaw) {
            return '/';
        }
        const normalizedPath = normalizedPathRaw.startsWith('/') ? normalizedPathRaw : `/${normalizedPathRaw}`;
        const prefixRaw = String(apiPrefix || '').trim();
        if (!prefixRaw || prefixRaw === '/') {
            return normalizedPath;
        }
        const normalizedPrefix = `/${prefixRaw.replace(/^\/+|\/+$/g, '')}`;
        if (normalizedPath === normalizedPrefix) {
            return '/';
        }
        if (normalizedPath.startsWith(`${normalizedPrefix}/`)) {
            const withoutPrefix = normalizedPath.slice(normalizedPrefix.length);
            return withoutPrefix.startsWith('/') ? withoutPrefix : `/${withoutPrefix}`;
        }
        return normalizedPath;
    }
    generateBaseApi() {
        return {
            path: 'src/api/base.ts',
            content: this.format(`import type { QueryParams } from '../types/common';
import type { HttpClient } from '../http/client';

export abstract class BaseApi {
  constructor(
    protected http: HttpClient,
    protected basePath: string
  ) {}

  protected async get<T>(path: string, params?: QueryParams, headers?: Record<string, string>): Promise<T> {
    return this.http.get<T>(\`\${this.basePath}\${path}\`, params, headers);
  }

  protected async post<T>(
    path: string,
    body?: unknown,
    params?: QueryParams,
    headers?: Record<string, string>,
    contentType?: string,
  ): Promise<T> {
    return this.http.post<T>(\`\${this.basePath}\${path}\`, body, params, headers, contentType);
  }

  protected async put<T>(
    path: string,
    body?: unknown,
    params?: QueryParams,
    headers?: Record<string, string>,
    contentType?: string,
  ): Promise<T> {
    return this.http.put<T>(\`\${this.basePath}\${path}\`, body, params, headers, contentType);
  }

  protected async delete<T>(path: string, params?: QueryParams, headers?: Record<string, string>): Promise<T> {
    return this.http.delete<T>(\`\${this.basePath}\${path}\`, params, headers);
  }

  protected async patch<T>(
    path: string,
    body?: unknown,
    params?: QueryParams,
    headers?: Record<string, string>,
    contentType?: string,
  ): Promise<T> {
    return this.http.patch<T>(\`\${this.basePath}\${path}\`, body, params, headers, contentType);
  }

  protected async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: QueryParams,
    headers?: Record<string, string>,
    contentType?: string,
  ): Promise<T> {
    return this.http.request<T>(\`\${this.basePath}\${path}\`, { method: method as any, body, params, headers, contentType });
  }
}
`),
            language: 'typescript',
            description: 'Base API class',
        };
    }
    generatePaths(config) {
        const prefix = config.sdkType.toUpperCase() + '_API_PREFIX';
        return {
            path: 'src/api/paths.ts',
            content: this.format(`export const ${prefix} = '${config.apiPrefix}';

export function ${config.sdkType}ApiPath(path: string): string {
  if (!path) {
    return ${prefix};
  }
  if (/^https?:\\/\\//i.test(path)) {
    return path;
  }
  const normalizedPrefixRaw = (${prefix} || '').trim();
  const normalizedPrefix = normalizedPrefixRaw
    ? \`/\${normalizedPrefixRaw.replace(/^\\/+|\\/+$/g, '')}\`
    : '';
  const normalizedPath = path.startsWith('/') ? path : \`/\${path}\`;

  if (!normalizedPrefix || normalizedPrefix === '/') {
    return normalizedPath;
  }
  if (normalizedPath === normalizedPrefix || normalizedPath.startsWith(\`\${normalizedPrefix}/\`)) {
    return normalizedPath;
  }
  return \`\${normalizedPrefix}\${normalizedPath}\`;
}
`),
            language: 'typescript',
            description: 'API path utilities',
        };
    }
    generateApiIndex(tagMetadataList, config) {
        const exports = tagMetadataList.map((metadata) => {
            return `export { ${metadata.className}, create${metadata.className} } from './${metadata.fileName}';`;
        }).join('\n');
        return {
            path: 'src/api/index.ts',
            content: this.format(`export { BaseApi } from './base';
export { ${config.sdkType}ApiPath } from './paths';
${exports}
`),
            language: 'typescript',
            description: 'API module exports',
        };
    }
    format(content) {
        return content
            .trim()
            .split(/\r?\n/u)
            .map((line) => line.trimEnd())
            .join('\n') + '\n';
    }
    escapeSingleQuoted(value) {
        return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }
}
