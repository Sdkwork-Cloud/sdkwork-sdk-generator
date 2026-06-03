import { createUniqueIdentifierMap, toSafeCamelIdentifier } from '../../framework/identifiers.js';
import { normalizeOperationId, resolveScopedMethodNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { resolveOpenAIStyleMethodNames, resolveSdkTagNames, selectCanonicalOpenAIStyleOperations } from '../../framework/openai-surface.js';
import { supportsRequestBodyByDefault, toHttpMethodLiteral } from '../../framework/http-methods.js';
import { collectSchemaReferences, resolveMediaTypeSchema } from '../../framework/schema.js';
import { extractEventStreamResponseInfo } from '../../framework/responses.js';
import { GO_CONFIG, getGoType } from './config.js';
import { extractOpenApiParameterContentSchema, requiresExplicitOpenApiQuerySerialization, resolveOpenApiParameterSerialization, } from '../../framework/parameter-serialization.js';
const GO_RESERVED_WORDS = new Set([
    'break',
    'case',
    'chan',
    'const',
    'continue',
    'default',
    'defer',
    'else',
    'fallthrough',
    'for',
    'func',
    'go',
    'goto',
    'if',
    'import',
    'interface',
    'map',
    'package',
    'range',
    'return',
    'select',
    'struct',
    'switch',
    'type',
    'var',
]);
export class ApiGenerator {
    generate(ctx, config) {
        const files = [];
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSdkTagNames(tags, config);
        const knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => GO_CONFIG.namingConventions.modelName(schemaName)));
        for (const tag of tags) {
            const group = ctx.apiGroups[tag];
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            files.push(this.generateApiFile(tag, resolvedTagName, group.operations, config, knownModels));
        }
        files.push(this.generateBaseApi(config));
        files.push(this.generatePaths(config));
        files.push(this.generateApiIndex(config));
        return files;
    }
    getModuleName(config) {
        return config.packageName || `github.com/sdkwork/${config.sdkType}-sdk`;
    }
    generateApiFile(tag, resolvedTagName, operations, config, knownModels) {
        operations = selectCanonicalOpenAIStyleOperations(tag, operations, config);
        const structName = `${GO_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
        const fileName = GO_CONFIG.namingConventions.fileName(resolvedTagName);
        const methodNames = resolveOpenAIStyleMethodNames(tag, operations, config, GO_CONFIG, 'pascal')
            || resolveScopedMethodNames(operations, (op) => this.generateOperationId(op.method, op.path, op, tag));
        const moduleName = this.getModuleName(config);
        const needsPathSerializationHelpers = operations.some((op) => this.extractPathParams(op.path).length > 0);
        const needsFmt = needsPathSerializationHelpers;
        const needsRequestHeaderHelpers = operations.some((op) => {
            const allParameters = op.allParameters || op.parameters || [];
            return allParameters.some((param) => param?.in === 'header' || param?.in === 'cookie');
        });
        const needsQuerySerializationHelpers = operations.some((op) => {
            const allParameters = op.allParameters || op.parameters || [];
            return allParameters.some((param) => param?.in === 'query' && requiresExplicitOpenApiQuerySerialization(param));
        });
        const referencedModels = new Set();
        const methods = operations
            .map((op) => {
            const generated = this.generateMethod(op, structName, config, methodNames.get(op) || 'Operation', knownModels);
            generated.referencedModels.forEach((modelName) => referencedModels.add(modelName));
            return generated.content;
        })
            .join('\n\n');
        const encodingJsonImport = (needsQuerySerializationHelpers || needsRequestHeaderHelpers) ? '    "encoding/json"\n' : '';
        const fmtImport = (needsFmt || needsRequestHeaderHelpers || needsQuerySerializationHelpers) ? '    "fmt"\n' : '';
        const netUrlImport = (needsPathSerializationHelpers || needsRequestHeaderHelpers || needsQuerySerializationHelpers) ? '    "net/url"\n' : '';
        const stringsImport = (needsPathSerializationHelpers || needsRequestHeaderHelpers || needsQuerySerializationHelpers) ? '    "strings"\n' : '';
        const typesImport = referencedModels.size > 0 ? `    sdktypes "${moduleName}/types"\n` : '';
        return {
            path: `api/${fileName}.go`,
            content: this.format(`package api

import (
${encodingJsonImport}${fmtImport}${netUrlImport}${stringsImport}${typesImport}    sdkhttp "${moduleName}/http"
)

type ${structName} struct {
    client *sdkhttp.Client
}

func New${structName}(client *sdkhttp.Client) *${structName} {
    return &${structName}{client: client}
}

${methods}

${needsPathSerializationHelpers ? this.generatePathSerializationHelpers() : ''}
${needsQuerySerializationHelpers ? this.generateQuerySerializationHelpers() : ''}
${needsRequestHeaderHelpers ? this.generateRequestHeaderHelpers() : ''}
${needsPathSerializationHelpers || needsQuerySerializationHelpers || needsRequestHeaderHelpers ? this.generateCollectionConversionHelpers() : ''}
`),
            language: 'go',
            description: `${tag} API module`,
        };
    }
    generateMethod(op, structName, config, methodName, knownModels) {
        const rawPathParams = this.extractPathParams(op.path);
        const allParameters = op.allParameters || op.parameters || [];
        const queryParams = allParameters.filter((param) => param?.in === 'query');
        const queryStringParams = allParameters.filter((param) => param?.in === 'querystring');
        const headerParams = allParameters.filter((param) => param?.in === 'header');
        const cookieParams = allParameters.filter((param) => param?.in === 'cookie');
        const pathOpenApiParams = allParameters.filter((param) => param?.in === 'path');
        const hasQuery = queryParams.length > 0;
        const hasRawQueryString = queryStringParams.length > 0;
        const hasHeaders = headerParams.length > 0 || cookieParams.length > 0;
        const method = String(op.method || '').toLowerCase();
        const httpMethod = String(op.httpMethod || op.method || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const supportsRequestBody = supportsRequestBodyByDefault(method);
        const requestBodyInfo = supportsRequestBody ? this.extractRequestBodyInfo(op) : undefined;
        const hasBody = Boolean(requestBodyInfo);
        const requestBodyRequired = hasBody && Boolean(op.requestBody?.required);
        const requestBodySchema = requestBodyInfo?.schema;
        const hasExplicitQuerySerialization = queryParams.some((param) => requiresExplicitOpenApiQuerySerialization(param));
        const contentTypeArg = requestBodyInfo?.mediaType
            ? `"${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
            : '""';
        const rawRequestType = requestBodySchema
            ? getGoType(requestBodySchema, GO_CONFIG)
            : 'interface{}';
        const requestType = this.qualifyGoType(rawRequestType, knownModels);
        const eventStreamInfo = extractEventStreamResponseInfo(op);
        const isEventStreamResponse = Boolean(eventStreamInfo);
        const responseSchema = eventStreamInfo?.schema ?? this.extractResponseSchema(op);
        const rawResponseType = responseSchema
            ? getGoType(responseSchema, GO_CONFIG)
            : this.inferFallbackResponseType(op);
        const responseType = this.qualifyGoType(rawResponseType, knownModels);
        const referencedModels = new Set();
        if (requestBodySchema) {
            this.collectReferencedModels(requestBodySchema, knownModels, referencedModels);
        }
        if (responseSchema) {
            this.collectReferencedModels(responseSchema, knownModels, referencedModels);
        }
        const pathParamNames = createUniqueIdentifierMap(rawPathParams, (value) => toSafeCamelIdentifier(value, GO_RESERVED_WORDS), [
            hasBody ? 'body' : '',
            hasQuery ? 'query' : '',
            hasRawQueryString ? 'rawQueryString' : '',
            hasHeaders ? 'headers' : '',
            hasHeaders ? 'requestHeaders' : '',
        ]);
        const pathParams = rawPathParams.map((rawName) => {
            const parameter = pathOpenApiParams.find((candidate) => candidate?.name === rawName);
            const serialization = resolveOpenApiParameterSerialization(parameter || { name: rawName, in: 'path' });
            return {
                rawName,
                safeName: pathParamNames.get(rawName) || rawName,
                type: parameter?.schema ? this.qualifyGoType(getGoType(parameter.schema, GO_CONFIG), knownModels) : 'string',
                style: serialization.style,
                explode: serialization.explode,
            };
        });
        const parameterReservedNames = [
            ...pathParams.map((param) => param.safeName),
            hasBody ? 'body' : '',
            hasQuery ? 'query' : '',
            hasRawQueryString ? 'rawQueryString' : '',
            hasHeaders ? 'headers' : '',
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
        const requiredQueryBindings = queryBindings.filter((binding) => binding.required);
        const optionalQueryBindings = queryBindings.filter((binding) => !binding.required);
        const requiredHeaderBindings = [...headerBindings, ...cookieBindings].filter((binding) => binding.required);
        const optionalHeaderBindings = [...headerBindings, ...cookieBindings].filter((binding) => !binding.required);
        const params = [];
        if (pathParams.length > 0) {
            params.push(...pathParams.map((param) => `${param.safeName} ${param.type}`));
        }
        if (hasBody && requestBodyRequired) {
            const bodyType = requestBodyRequired ? requestType : this.toOptionalGoType(requestType);
            params.push(`body ${bodyType}`);
        }
        if (hasRawQueryString) {
            params.push('rawQueryString string');
        }
        params.push(...requiredQueryBindings.map((binding) => this.renderMethodParameter(binding)));
        params.push(...requiredHeaderBindings.map((binding) => this.renderMethodParameter(binding)));
        if (hasBody && !requestBodyRequired) {
            params.push(`body ${this.toOptionalGoType(requestType)}`);
        }
        if (hasQuery && !hasExplicitQuerySerialization) {
            params.push('query map[string]interface{}');
        }
        params.push(...optionalQueryBindings.map((binding) => this.renderMethodParameter(binding)));
        params.push(...optionalHeaderBindings.map((binding) => this.renderMethodParameter(binding)));
        const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
        const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, '%s');
        const formattedPath = pathParams.length > 0
            ? `fmt.Sprintf("${pathTemplate}", ${pathParams.map((param) => {
                return `SerializePathParameter(${param.safeName}, PathParameterSpec{Name: ${this.formatGoString(param.rawName)}, Style: ${this.formatGoString(param.style)}, Explode: ${param.explode ? 'true' : 'false'}})`;
            }).join(', ')})`
            : `"${pathTemplate}"`;
        const prefixedPath = `${GO_CONFIG.namingConventions.modelName(config.sdkType)}ApiPath(${formattedPath})`;
        const requestPath = hasRawQueryString
            ? `AppendQueryString(${prefixedPath}, rawQueryString)`
            : hasExplicitQuerySerialization
                ? `AppendQueryString(${prefixedPath}, query)`
                : prefixedPath;
        let call = '';
        switch (method) {
            case 'get':
                if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `a.client.Get(${requestPath}, nil, headers)`
                        : `a.client.Get(${requestPath}, query, headers)`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `a.client.Get(${requestPath}, nil, nil)`
                        : `a.client.Get(${requestPath}, query, nil)`;
                }
                else if (hasHeaders) {
                    call = `a.client.Get(${requestPath}, nil, headers)`;
                }
                else {
                    call = `a.client.Get(${requestPath}, nil, nil)`;
                }
                break;
            case 'post':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = hasExplicitQuerySerialization
                            ? `a.client.Post(${requestPath}, body, nil, headers, ${contentTypeArg})`
                            : `a.client.Post(${requestPath}, body, query, headers, ${contentTypeArg})`;
                    }
                    else if (hasQuery) {
                        call = hasExplicitQuerySerialization
                            ? `a.client.Post(${requestPath}, body, nil, nil, ${contentTypeArg})`
                            : `a.client.Post(${requestPath}, body, query, nil, ${contentTypeArg})`;
                    }
                    else if (hasHeaders) {
                        call = `a.client.Post(${requestPath}, body, nil, headers, ${contentTypeArg})`;
                    }
                    else {
                        call = `a.client.Post(${requestPath}, body, nil, nil, ${contentTypeArg})`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `a.client.Post(${requestPath}, nil, nil, headers, "")`
                        : `a.client.Post(${requestPath}, nil, query, headers, "")`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `a.client.Post(${requestPath}, nil, nil, nil, "")`
                        : `a.client.Post(${requestPath}, nil, query, nil, "")`;
                }
                else if (hasHeaders) {
                    call = `a.client.Post(${requestPath}, nil, nil, headers, "")`;
                }
                else {
                    call = `a.client.Post(${requestPath}, nil, nil, nil, "")`;
                }
                break;
            case 'put':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = hasExplicitQuerySerialization
                            ? `a.client.Put(${requestPath}, body, nil, headers, ${contentTypeArg})`
                            : `a.client.Put(${requestPath}, body, query, headers, ${contentTypeArg})`;
                    }
                    else if (hasQuery) {
                        call = hasExplicitQuerySerialization
                            ? `a.client.Put(${requestPath}, body, nil, nil, ${contentTypeArg})`
                            : `a.client.Put(${requestPath}, body, query, nil, ${contentTypeArg})`;
                    }
                    else if (hasHeaders) {
                        call = `a.client.Put(${requestPath}, body, nil, headers, ${contentTypeArg})`;
                    }
                    else {
                        call = `a.client.Put(${requestPath}, body, nil, nil, ${contentTypeArg})`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `a.client.Put(${requestPath}, nil, nil, headers, "")`
                        : `a.client.Put(${requestPath}, nil, query, headers, "")`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `a.client.Put(${requestPath}, nil, nil, nil, "")`
                        : `a.client.Put(${requestPath}, nil, query, nil, "")`;
                }
                else if (hasHeaders) {
                    call = `a.client.Put(${requestPath}, nil, nil, headers, "")`;
                }
                else {
                    call = `a.client.Put(${requestPath}, nil, nil, nil, "")`;
                }
                break;
            case 'delete':
                if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `a.client.Delete(${requestPath}, nil, headers)`
                        : `a.client.Delete(${requestPath}, query, headers)`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `a.client.Delete(${requestPath}, nil, nil)`
                        : `a.client.Delete(${requestPath}, query, nil)`;
                }
                else if (hasHeaders) {
                    call = `a.client.Delete(${requestPath}, nil, headers)`;
                }
                else {
                    call = `a.client.Delete(${requestPath}, nil, nil)`;
                }
                break;
            case 'patch':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = hasExplicitQuerySerialization
                            ? `a.client.Patch(${requestPath}, body, nil, headers, ${contentTypeArg})`
                            : `a.client.Patch(${requestPath}, body, query, headers, ${contentTypeArg})`;
                    }
                    else if (hasQuery) {
                        call = hasExplicitQuerySerialization
                            ? `a.client.Patch(${requestPath}, body, nil, nil, ${contentTypeArg})`
                            : `a.client.Patch(${requestPath}, body, query, nil, ${contentTypeArg})`;
                    }
                    else if (hasHeaders) {
                        call = `a.client.Patch(${requestPath}, body, nil, headers, ${contentTypeArg})`;
                    }
                    else {
                        call = `a.client.Patch(${requestPath}, body, nil, nil, ${contentTypeArg})`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `a.client.Patch(${requestPath}, nil, nil, headers, "")`
                        : `a.client.Patch(${requestPath}, nil, query, headers, "")`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `a.client.Patch(${requestPath}, nil, nil, nil, "")`
                        : `a.client.Patch(${requestPath}, nil, query, nil, "")`;
                }
                else if (hasHeaders) {
                    call = `a.client.Patch(${requestPath}, nil, nil, headers, "")`;
                }
                else {
                    call = `a.client.Patch(${requestPath}, nil, nil, nil, "")`;
                }
                break;
            default:
                call = `a.client.Request("${toHttpMethodLiteral(httpMethod)}", ${requestPath}, ${hasBody ? 'body' : 'nil'}, ${hasQuery && !hasExplicitQuerySerialization ? 'query' : 'nil'}, ${hasHeaders ? 'headers' : 'nil'}, ${hasBody ? contentTypeArg : '""'})`;
        }
        const docComment = op.summary ? `// ${op.summary}\n` : '';
        const requestHeaderBlock = hasHeaders
            ? `    headers := BuildRequestHeaders(
${this.renderNamedParameterMap(headerBindings, 8)},
${this.renderNamedParameterMap(cookieBindings, 8)},
    )
`
            : '';
        const queryBlock = hasExplicitQuerySerialization
            ? `    query := BuildQueryString([]QueryParameterSpec{
${this.renderQueryParameterSpecs(queryBindings, 8)}
    })
`
            : '';
        if (isEventStreamResponse) {
            const streamCall = `sdkhttp.Stream[${responseType}](a.client, "${toHttpMethodLiteral(httpMethod)}", ${requestPath}, ${hasBody ? 'body' : 'nil'}, ${hasQuery && !hasExplicitQuerySerialization ? 'query' : 'nil'}, ${hasHeaders ? 'headers' : 'nil'}, ${hasBody ? contentTypeArg : '""'})`;
            return {
                content: `${docComment}func (a *${structName}) ${methodName}(${params.join(', ')}) (*sdkhttp.SSEStream[${responseType}], error) {
${queryBlock}${requestHeaderBlock}    return ${streamCall}
}`,
                referencedModels,
            };
        }
        return {
            content: `${docComment}func (a *${structName}) ${methodName}(${params.join(', ')}) (${responseType}, error) {
${queryBlock}${requestHeaderBlock}    raw, err := ${call}
    if err != nil {
        var zero ${responseType}
        return zero, err
    }
    return decodeResult[${responseType}](raw)
}`,
            referencedModels,
        };
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
        const safeNameByKey = createUniqueIdentifierMap(keys, (key) => toSafeCamelIdentifier(rawNameByKey.get(key) || 'value', GO_RESERVED_WORDS), reservedNames);
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
            return this.qualifyGoType(getGoType(contentSchema, GO_CONFIG), knownModels);
        }
        if (!parameter?.schema) {
            return 'interface{}';
        }
        return this.qualifyGoType(getGoType(parameter.schema, GO_CONFIG), knownModels);
    }
    renderMethodParameter(binding) {
        return `${binding.safeName} ${binding.required ? binding.type : this.toOptionalGoType(binding.type)}`;
    }
    renderNamedParameterMap(bindings, indentation) {
        const indent = ' '.repeat(indentation);
        if (bindings.length === 0) {
            return `${indent}map[string]ParameterSpec{}`;
        }
        const lines = bindings.map((binding) => {
            const valueExpression = binding.required ? binding.safeName : this.optionalHeaderValueExpression(binding.safeName);
            return `${indent}map[string]ParameterSpec{${this.formatGoString(String(binding.parameter?.name || binding.safeName))}: ${this.renderParameterSpec(binding, valueExpression)},}`;
        });
        return bindings.length === 1
            ? lines[0]
            : [`${indent}map[string]ParameterSpec{`, ...bindings.map((binding) => {
                    const valueExpression = binding.required ? binding.safeName : this.optionalHeaderValueExpression(binding.safeName);
                    return `${indent}    ${this.formatGoString(String(binding.parameter?.name || binding.safeName))}: ${this.renderParameterSpec(binding, valueExpression)},`;
                }), `${indent}}`].join('\n');
    }
    renderParameterSpec(binding, valueExpression) {
        const parts = [
            `Value: ${valueExpression}`,
            `Style: ${this.formatGoString(binding.style)}`,
            `Explode: ${binding.explode ? 'true' : 'false'}`,
        ];
        if (binding.contentType) {
            parts.push(`ContentType: ${this.formatGoString(binding.contentType)}`);
        }
        return `ParameterSpec{${parts.join(', ')}}`;
    }
    optionalHeaderValueExpression(identifier) {
        return `func() interface{} { if ${identifier} == nil { return nil }; return *${identifier} }()`;
    }
    formatGoString(value) {
        return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    renderQueryParameterSpecs(bindings, indentation) {
        const indent = ' '.repeat(indentation);
        return bindings.map((binding) => {
            const parts = [
                `Name: ${this.formatGoString(String(binding.parameter?.name || binding.safeName))}`,
                `Value: ${this.renderQueryValueExpression(binding)}`,
                `Style: ${this.formatGoString(binding.style)}`,
                `Explode: ${binding.explode ? 'true' : 'false'}`,
                `AllowReserved: ${binding.allowReserved ? 'true' : 'false'}`,
            ];
            if (binding.contentType) {
                parts.push(`ContentType: ${this.formatGoString(binding.contentType)}`);
            }
            return `${indent}{${parts.join(', ')}},`;
        }).join('\n');
    }
    renderQueryValueExpression(binding) {
        if (binding.required) {
            return binding.safeName;
        }
        return `func() interface{} { if ${binding.safeName} == nil { return nil }; return *${binding.safeName} }()`;
    }
    generateQuerySerializationHelpers() {
        return `type QueryParameterSpec struct {
    Name          string
    Value         interface{}
    Style         string
    Explode       bool
    AllowReserved bool
    ContentType   string
}

func BuildQueryString(parameters []QueryParameterSpec) string {
    pairs := make([]string, 0)
    for _, parameter := range parameters {
        AppendSerializedParameter(&pairs, parameter)
    }
    return strings.Join(pairs, "&")
}

func AppendSerializedParameter(pairs *[]string, parameter QueryParameterSpec) {
    if parameter.Value == nil {
        return
    }

    if parameter.ContentType != "" {
        encoded, _ := json.Marshal(parameter.Value)
        *pairs = append(*pairs, url.QueryEscape(parameter.Name)+"="+EncodeQueryValue(string(encoded), parameter.AllowReserved))
        return
    }

    style := parameter.Style
    if style == "" {
        style = "form"
    }

    switch value := parameter.Value.(type) {
    case []string:
        AppendArrayParameter(pairs, parameter.Name, stringSliceToInterface(value), style, parameter.Explode, parameter.AllowReserved)
    case []int:
        AppendArrayParameter(pairs, parameter.Name, intSliceToInterface(value), style, parameter.Explode, parameter.AllowReserved)
    case []interface{}:
        AppendArrayParameter(pairs, parameter.Name, value, style, parameter.Explode, parameter.AllowReserved)
    case map[string]int:
        AppendObjectParameter(pairs, parameter.Name, intMapToInterface(value), style, parameter.Explode, parameter.AllowReserved)
    case map[string]string:
        AppendObjectParameter(pairs, parameter.Name, stringMapToInterface(value), style, parameter.Explode, parameter.AllowReserved)
    case map[string]interface{}:
        if style == "deepObject" {
            AppendDeepObjectParameter(pairs, parameter.Name, value, parameter.AllowReserved)
        } else {
            AppendObjectParameter(pairs, parameter.Name, value, style, parameter.Explode, parameter.AllowReserved)
        }
    default:
        *pairs = append(*pairs, url.QueryEscape(parameter.Name)+"="+EncodeQueryValue(fmt.Sprint(value), parameter.AllowReserved))
    }
}

func AppendArrayParameter(pairs *[]string, name string, value []interface{}, style string, explode bool, allowReserved bool) {
    values := make([]string, 0, len(value))
    for _, item := range value {
        if item != nil {
            values = append(values, fmt.Sprint(item))
        }
    }
    if len(values) == 0 {
        return
    }
    if style == "form" && explode {
        for _, item := range values {
            *pairs = append(*pairs, url.QueryEscape(name)+"="+EncodeQueryValue(item, allowReserved))
        }
        return
    }
    *pairs = append(*pairs, url.QueryEscape(name)+"="+EncodeQueryValue(strings.Join(values, ","), allowReserved))
}

func AppendObjectParameter(pairs *[]string, name string, value map[string]interface{}, style string, explode bool, allowReserved bool) {
    entries := make([]string, 0, len(value)*2)
    for key, item := range value {
        if item == nil {
            continue
        }
        if style == "form" && explode {
            *pairs = append(*pairs, url.QueryEscape(key)+"="+EncodeQueryValue(fmt.Sprint(item), allowReserved))
            continue
        }
        entries = append(entries, key, fmt.Sprint(item))
    }
    if len(entries) == 0 {
        return
    }
    if !(style == "form" && explode) {
        *pairs = append(*pairs, url.QueryEscape(name)+"="+EncodeQueryValue(strings.Join(entries, ","), allowReserved))
    }
}

func AppendDeepObjectParameter(pairs *[]string, name string, value map[string]interface{}, allowReserved bool) {
    for key, item := range value {
        if item == nil {
            continue
        }
        *pairs = append(*pairs, url.QueryEscape(fmt.Sprintf("%s[%s]", name, key))+"="+EncodeQueryValue(fmt.Sprint(item), allowReserved))
    }
}

func EncodeQueryValue(value string, allowReserved bool) string {
    encoded := url.QueryEscape(value)
    if !allowReserved {
        return encoded
    }
    replacements := map[string]string{
        "%3A": ":", "%2F": "/", "%3F": "?", "%23": "#",
        "%5B": "[", "%5D": "]", "%40": "@", "%21": "!",
        "%24": "$", "%26": "&", "%27": "'", "%28": "(",
        "%29": ")", "%2A": "*", "%2B": "+", "%2C": ",",
        "%3B": ";", "%3D": "=",
    }
    for escaped, reserved := range replacements {
        encoded = strings.ReplaceAll(encoded, escaped, reserved)
    }
    return encoded
}

`;
    }
    generatePathSerializationHelpers() {
        return `type PathParameterSpec struct {
    Name    string
    Style   string
    Explode bool
}

func SerializePathParameter(value interface{}, spec PathParameterSpec) string {
    if value == nil {
        return ""
    }
    style := spec.Style
    if style == "" {
        style = "simple"
    }

    switch typed := value.(type) {
    case []string:
        return SerializePathArray(spec.Name, stringSliceToInterface(typed), style, spec.Explode)
    case []int:
        return SerializePathArray(spec.Name, intSliceToInterface(typed), style, spec.Explode)
    case []interface{}:
        return SerializePathArray(spec.Name, typed, style, spec.Explode)
    case map[string]string:
        return SerializePathObject(spec.Name, stringMapToInterface(typed), style, spec.Explode)
    case map[string]int:
        return SerializePathObject(spec.Name, intMapToInterface(typed), style, spec.Explode)
    case map[string]interface{}:
        return SerializePathObject(spec.Name, typed, style, spec.Explode)
    default:
        return PathPrefix(spec.Name, style) + url.PathEscape(fmt.Sprint(value))
    }
}

func SerializePathArray(name string, values []interface{}, style string, explode bool) string {
    serialized := make([]string, 0, len(values))
    for _, item := range values {
        if item != nil {
            serialized = append(serialized, url.PathEscape(fmt.Sprint(item)))
        }
    }
    if len(serialized) == 0 {
        return PathPrefix(name, style)
    }
    if style == "matrix" {
        if explode {
            parts := make([]string, 0, len(serialized))
            for _, item := range serialized {
                parts = append(parts, ";"+name+"="+item)
            }
            return strings.Join(parts, "")
        }
        return ";" + name + "=" + strings.Join(serialized, ",")
    }
    separator := ","
    if explode {
        separator = "."
    }
    return PathPrefix(name, style) + strings.Join(serialized, separator)
}

func SerializePathObject(name string, values map[string]interface{}, style string, explode bool) string {
    entries := make([]string, 0, len(values)*2)
    exploded := make([]string, 0, len(values))
    for key, value := range values {
        if value == nil {
            continue
        }
        escapedKey := url.PathEscape(key)
        escapedValue := url.PathEscape(fmt.Sprint(value))
        if explode {
            if style == "matrix" {
                exploded = append(exploded, ";"+escapedKey+"="+escapedValue)
            } else {
                exploded = append(exploded, escapedKey+"="+escapedValue)
            }
        } else {
            entries = append(entries, escapedKey, escapedValue)
        }
    }
    if style == "matrix" {
        if explode {
            return strings.Join(exploded, "")
        }
        return ";" + name + "=" + strings.Join(entries, ",")
    }
    if explode {
        separator := ","
        if style == "label" {
            separator = "."
        }
        return PathPrefix(name, style) + strings.Join(exploded, separator)
    }
    return PathPrefix(name, style) + strings.Join(entries, ",")
}

func PathPrefix(name string, style string) string {
    if style == "label" {
        return "."
    }
    if style == "matrix" {
        return ";" + name
    }
    return ""
}`;
    }
    generateRequestHeaderHelpers() {
        return `type ParameterSpec struct {
    Value       interface{}
    Style       string
    Explode     bool
    ContentType string
}

func BuildRequestHeaders(headers map[string]ParameterSpec, cookies map[string]ParameterSpec) map[string]string {
    requestHeaders := map[string]string{}
    for name, parameter := range headers {
        if serialized, ok := SerializeParameterValue(parameter); ok {
            requestHeaders[name] = serialized
        }
    }

    if cookieHeader := BuildCookieHeader(cookies); cookieHeader != "" {
        if existing, ok := requestHeaders["Cookie"]; ok && existing != "" {
            requestHeaders["Cookie"] = existing + "; " + cookieHeader
        } else {
            requestHeaders["Cookie"] = cookieHeader
        }
    }

    if len(requestHeaders) == 0 {
        return nil
    }
    return requestHeaders
}

func BuildCookieHeader(cookies map[string]ParameterSpec) string {
    pairs := make([]string, 0, len(cookies))
    for name, parameter := range cookies {
        if serialized, ok := SerializeParameterValue(parameter); ok {
            pairs = append(pairs, url.QueryEscape(name)+"="+url.QueryEscape(serialized))
        }
    }
    return strings.Join(pairs, "; ")
}

func SerializeParameterValue(parameter ParameterSpec) (string, bool) {
    value := parameter.Value
    if value == nil {
        return "", false
    }
    if parameter.ContentType != "" {
        encoded, _ := json.Marshal(value)
        return string(encoded), true
    }
    switch typed := value.(type) {
    case string:
        return typed, true
    case fmt.Stringer:
        return typed.String(), true
    case []string:
        return strings.Join(typed, ","), true
    case []int:
        values := make([]string, 0, len(typed))
        for _, item := range typed {
            values = append(values, fmt.Sprint(item))
        }
        return strings.Join(values, ","), true
    case map[string]string:
        return SerializeHeaderObject(stringMapToInterface(typed), parameter.Explode), true
    case map[string]int:
        return SerializeHeaderObject(intMapToInterface(typed), parameter.Explode), true
    case map[string]interface{}:
        return SerializeHeaderObject(typed, parameter.Explode), true
    default:
        return fmt.Sprint(value), true
    }
}

func SerializeHeaderObject(values map[string]interface{}, explode bool) string {
    serialized := make([]string, 0, len(values)*2)
    for key, value := range values {
        if value == nil {
            continue
        }
        if explode {
            serialized = append(serialized, key+"="+fmt.Sprint(value))
        } else {
            serialized = append(serialized, key, fmt.Sprint(value))
        }
    }
    return strings.Join(serialized, ",")
}`;
    }
    generateCollectionConversionHelpers() {
        return `func stringSliceToInterface(values []string) []interface{} {
    result := make([]interface{}, 0, len(values))
    for _, value := range values {
        result = append(result, value)
    }
    return result
}

func intSliceToInterface(values []int) []interface{} {
    result := make([]interface{}, 0, len(values))
    for _, value := range values {
        result = append(result, value)
    }
    return result
}

func stringMapToInterface(values map[string]string) map[string]interface{} {
    result := make(map[string]interface{}, len(values))
    for key, value := range values {
        result[key] = value
    }
    return result
}

func intMapToInterface(values map[string]int) map[string]interface{} {
    result := make(map[string]interface{}, len(values))
    for key, value := range values {
        result[key] = value
    }
    return result
}`;
    }
    generateOperationId(method, path, op, tag) {
        if (op.operationId) {
            const normalized = normalizeOperationId(op.operationId);
            return GO_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
        }
        const pathParts = path.split('/').filter(Boolean);
        const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
        const actionMap = {
            get: path.includes('{') ? 'Get' : 'List',
            post: 'Create',
            put: 'Update',
            patch: 'Patch',
            delete: 'Delete',
            options: 'Options',
            head: 'Head',
            trace: 'Trace',
            query: 'Query',
        };
        return `${actionMap[method] || GO_CONFIG.namingConventions.modelName(method)}${GO_CONFIG.namingConventions.modelName(resource)}`;
    }
    extractPathParams(path) {
        const matches = path.match(/\{([^}]+)\}/g) || [];
        return matches.map((m) => m.replace(/[{}]/g, ''));
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
        return {
            mediaType,
            schema,
        };
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
            return 'interface{}';
        }
        const statusCodes = Object.keys(responses);
        if (statusCodes.length === 0) {
            return 'interface{}';
        }
        const allNoContent = statusCodes.every((code) => {
            const content = responses[code]?.content;
            return !content || typeof content !== 'object' || Object.keys(content).length === 0;
        });
        if (allNoContent || responses['204']) {
            return 'struct{}';
        }
        return 'interface{}';
    }
    collectReferencedModels(schema, knownModels, refs) {
        collectSchemaReferences(schema, GO_CONFIG.namingConventions.modelName, knownModels, refs);
    }
    qualifyGoType(typeName, knownModels) {
        let result = typeName;
        const sortedModels = Array.from(knownModels).sort((a, b) => b.length - a.length);
        for (const modelName of sortedModels) {
            const escaped = modelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`(?<![\\w.])${escaped}(?![\\w])`, 'g');
            result = result.replace(pattern, `sdktypes.${modelName}`);
        }
        return result;
    }
    toOptionalGoType(typeName) {
        if (typeName.startsWith('*') || typeName.startsWith('[]') || typeName === 'interface{}') {
            return typeName;
        }
        return `*${typeName}`;
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
    generateBaseApi(config) {
        const moduleName = this.getModuleName(config);
        return {
            path: 'api/base.go',
            content: this.format(`package api

import (
    "encoding/json"

    sdkhttp "${moduleName}/http"
)

type BaseApi struct {
    http     *sdkhttp.Client
    basePath string
}

func NewBaseApi(http *sdkhttp.Client, basePath string) *BaseApi {
    return &BaseApi{http: http, basePath: basePath}
}

func decodeResult[T any](raw interface{}) (T, error) {
    var zero T
    if raw == nil {
        return zero, nil
    }
    payload, err := json.Marshal(raw)
    if err != nil {
        return zero, err
    }
    var parsed T
    if err := json.Unmarshal(payload, &parsed); err != nil {
        return zero, err
    }
    return parsed, nil
}

func (b *BaseApi) Get(path string, query map[string]interface{}, headers map[string]string) (interface{}, error) {
    return b.http.Get(b.basePath+path, query, headers)
}

func (b *BaseApi) Post(
    path string,
    body interface{},
    query map[string]interface{},
    headers map[string]string,
    contentType string,
) (interface{}, error) {
    return b.http.Post(b.basePath+path, body, query, headers, contentType)
}

func (b *BaseApi) Put(
    path string,
    body interface{},
    query map[string]interface{},
    headers map[string]string,
    contentType string,
) (interface{}, error) {
    return b.http.Put(b.basePath+path, body, query, headers, contentType)
}

func (b *BaseApi) Delete(path string, query map[string]interface{}, headers map[string]string) (interface{}, error) {
    return b.http.Delete(b.basePath+path, query, headers)
}

func (b *BaseApi) Patch(
    path string,
    body interface{},
    query map[string]interface{},
    headers map[string]string,
    contentType string,
) (interface{}, error) {
    return b.http.Patch(b.basePath+path, body, query, headers, contentType)
}

func (b *BaseApi) Request(
    method string,
    path string,
    body interface{},
    query map[string]interface{},
    headers map[string]string,
    contentType string,
) (interface{}, error) {
    return b.http.Request(method, b.basePath+path, body, query, headers, contentType)
}
`),
            language: 'go',
            description: 'Base API class',
        };
    }
    generatePaths(config) {
        return {
            path: 'api/paths.go',
            content: this.format(`package api

import "strings"

const ${config.sdkType.toUpperCase()}_API_PREFIX = "${config.apiPrefix}"

func ${GO_CONFIG.namingConventions.modelName(config.sdkType)}ApiPath(path string) string {
    if path == "" {
        return ${config.sdkType.toUpperCase()}_API_PREFIX
    }
    if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
        return path
    }

    normalizedPrefix := strings.TrimSpace(${config.sdkType.toUpperCase()}_API_PREFIX)
    if normalizedPrefix != "" && normalizedPrefix != "/" {
        normalizedPrefix = "/" + strings.Trim(normalizedPrefix, "/")
    } else {
        normalizedPrefix = ""
    }

    normalizedPath := path
    if !strings.HasPrefix(normalizedPath, "/") {
        normalizedPath = "/" + normalizedPath
    }

    if normalizedPrefix == "" {
        return normalizedPath
    }
    if normalizedPath == normalizedPrefix || strings.HasPrefix(normalizedPath, normalizedPrefix+"/") {
        return normalizedPath
    }
    return normalizedPrefix + normalizedPath
}

func AppendQueryString(path string, rawQueryString string) string {
    query := strings.TrimLeft(rawQueryString, "?")
    if query == "" {
        return path
    }
    if strings.Contains(path, "?") {
        return path + "&" + query
    }
    return path + "?" + query
}
`),
            language: 'go',
            description: 'API path utilities',
        };
    }
    generateApiIndex(config) {
        return {
            path: 'api/doc.go',
            content: this.format(`package api

// API modules for ${config.name}
`),
            language: 'go',
            description: 'API module exports',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
