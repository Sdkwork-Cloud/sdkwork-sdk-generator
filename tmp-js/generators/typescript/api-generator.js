import { normalizeOperationId, resolveScopedMethodNames, stripTagPrefixFromOperationId } from '../../framework/naming.js';
import { TYPESCRIPT_CONFIG, getTypeScriptType } from './config.js';
import { buildTypeScriptTagMetadata } from './tag-metadata.js';
export class ApiGenerator {
    generate(ctx, config) {
        const files = [];
        const tags = Object.keys(ctx.apiGroups);
        const tagMetadataList = buildTypeScriptTagMetadata(tags);
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
        const methodNames = this.resolveMethodNames(operations, metadata.tag);
        const referencedModels = new Set();
        const methods = operations
            .map((op) => {
            const generated = this.generateMethod(op, config, methodNames.get(op) || 'operation', knownModels);
            generated.referencedModels.forEach((modelName) => referencedModels.add(modelName));
            return generated.content;
        })
            .join('\n\n');
        const typeImports = referencedModels.size > 0
            ? `import type { ${Array.from(referencedModels).sort((a, b) => a.localeCompare(b)).join(', ')} } from '../types';\n`
            : '';
        return {
            path: `src/api/${fileName}.ts`,
            content: this.format(`import { ${config.sdkType}ApiPath } from './paths';
import type { HttpClient } from '../http/client';
import type { QueryParams } from '../types/common';
${typeImports}

export class ${className} {
  private client: HttpClient;
  
  constructor(client: HttpClient) { 
    this.client = client; 
  }

${methods}
}

export function create${className}(client: HttpClient): ${className} {
  return new ${className}(client);
}
`),
            language: 'typescript',
            description: `${metadata.tag} API module`,
        };
    }
    generateMethod(op, config, methodName, knownModels) {
        const pathParams = this.extractPathParams(op.path);
        const allParameters = op.allParameters || op.parameters || [];
        const queryParams = allParameters.filter((param) => param?.in === 'query');
        const headerParams = allParameters.filter((param) => param?.in === 'header');
        const cookieParams = allParameters.filter((param) => param?.in === 'cookie');
        const method = String(op.method || '').toLowerCase();
        const supportsRequestBody = method === 'post' || method === 'put' || method === 'patch';
        const hasQuery = queryParams.length > 0;
        const hasHeaders = headerParams.length > 0 || cookieParams.length > 0;
        const requestBodyInfo = this.extractRequestBodyInfo(op);
        const requestBodySchema = supportsRequestBody ? requestBodyInfo?.schema : undefined;
        const requestBodyMediaType = (requestBodyInfo?.mediaType || '').toLowerCase();
        const isMultipartBody = requestBodyMediaType === 'multipart/form-data';
        const hasBody = supportsRequestBody && requestBodyInfo !== undefined;
        const requestBodyRequired = hasBody && Boolean(op.requestBody?.required);
        const requestType = isMultipartBody
            ? 'FormData'
            : requestBodySchema
                ? getTypeScriptType(requestBodySchema, TYPESCRIPT_CONFIG, knownModels)
                : undefined;
        const responseSchema = this.extractResponseSchema(op);
        const responseType = responseSchema
            ? getTypeScriptType(responseSchema, TYPESCRIPT_CONFIG, knownModels)
            : this.inferFallbackResponseType(op);
        const referencedModels = new Set();
        if (hasBody && requestBodySchema && !isMultipartBody) {
            this.collectReferencedModels(requestBodySchema, knownModels, referencedModels);
        }
        if (responseSchema) {
            this.collectReferencedModels(responseSchema, knownModels, referencedModels);
        }
        const params = [];
        if (pathParams.length) {
            params.push(...pathParams.map(p => `${p}: string | number`));
        }
        if (hasBody && requestType) {
            params.push(requestBodyRequired ? `body: ${requestType}` : `body?: ${requestType}`);
        }
        if (hasQuery)
            params.push('params?: QueryParams');
        if (hasHeaders)
            params.push('headers?: Record<string, string>');
        const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
        const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, '${$1}');
        const pathExpression = `${config.sdkType}ApiPath(\`${pathTemplate}\`)`;
        let call = '';
        switch (method) {
            case 'get':
                if (hasQuery && hasHeaders) {
                    call = `this.client.get<${responseType}>(${pathExpression}, params, headers)`;
                }
                else if (hasQuery) {
                    call = `this.client.get<${responseType}>(${pathExpression}, params)`;
                }
                else if (hasHeaders) {
                    call = `this.client.get<${responseType}>(${pathExpression}, undefined, headers)`;
                }
                else {
                    call = `this.client.get<${responseType}>(${pathExpression})`;
                }
                break;
            case 'post':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = `this.client.post<${responseType}>(${pathExpression}, body, params, headers)`;
                    }
                    else if (hasQuery) {
                        call = `this.client.post<${responseType}>(${pathExpression}, body, params)`;
                    }
                    else if (hasHeaders) {
                        call = `this.client.post<${responseType}>(${pathExpression}, body, undefined, headers)`;
                    }
                    else {
                        call = `this.client.post<${responseType}>(${pathExpression}, body)`;
                    }
                }
                else {
                    if (hasQuery && hasHeaders) {
                        call = `this.client.post<${responseType}>(${pathExpression}, undefined, params, headers)`;
                    }
                    else if (hasQuery) {
                        call = `this.client.post<${responseType}>(${pathExpression}, undefined, params)`;
                    }
                    else if (hasHeaders) {
                        call = `this.client.post<${responseType}>(${pathExpression}, undefined, undefined, headers)`;
                    }
                    else {
                        call = `this.client.post<${responseType}>(${pathExpression})`;
                    }
                }
                break;
            case 'put':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = `this.client.put<${responseType}>(${pathExpression}, body, params, headers)`;
                    }
                    else if (hasQuery) {
                        call = `this.client.put<${responseType}>(${pathExpression}, body, params)`;
                    }
                    else if (hasHeaders) {
                        call = `this.client.put<${responseType}>(${pathExpression}, body, undefined, headers)`;
                    }
                    else {
                        call = `this.client.put<${responseType}>(${pathExpression}, body)`;
                    }
                }
                else {
                    if (hasQuery && hasHeaders) {
                        call = `this.client.put<${responseType}>(${pathExpression}, undefined, params, headers)`;
                    }
                    else if (hasQuery) {
                        call = `this.client.put<${responseType}>(${pathExpression}, undefined, params)`;
                    }
                    else if (hasHeaders) {
                        call = `this.client.put<${responseType}>(${pathExpression}, undefined, undefined, headers)`;
                    }
                    else {
                        call = `this.client.put<${responseType}>(${pathExpression})`;
                    }
                }
                break;
            case 'delete':
                if (hasQuery && hasHeaders) {
                    call = `this.client.delete<${responseType}>(${pathExpression}, params, headers)`;
                }
                else if (hasQuery) {
                    call = `this.client.delete<${responseType}>(${pathExpression}, params)`;
                }
                else if (hasHeaders) {
                    call = `this.client.delete<${responseType}>(${pathExpression}, undefined, headers)`;
                }
                else {
                    call = `this.client.delete<${responseType}>(${pathExpression})`;
                }
                break;
            case 'patch':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = `this.client.patch<${responseType}>(${pathExpression}, body, params, headers)`;
                    }
                    else if (hasQuery) {
                        call = `this.client.patch<${responseType}>(${pathExpression}, body, params)`;
                    }
                    else if (hasHeaders) {
                        call = `this.client.patch<${responseType}>(${pathExpression}, body, undefined, headers)`;
                    }
                    else {
                        call = `this.client.patch<${responseType}>(${pathExpression}, body)`;
                    }
                }
                else {
                    if (hasQuery && hasHeaders) {
                        call = `this.client.patch<${responseType}>(${pathExpression}, undefined, params, headers)`;
                    }
                    else if (hasQuery) {
                        call = `this.client.patch<${responseType}>(${pathExpression}, undefined, params)`;
                    }
                    else if (hasHeaders) {
                        call = `this.client.patch<${responseType}>(${pathExpression}, undefined, undefined, headers)`;
                    }
                    else {
                        call = `this.client.patch<${responseType}>(${pathExpression})`;
                    }
                }
                break;
            default:
                call = `this.client.get<${responseType}>(${pathExpression})`;
        }
        const docComment = op.summary ? `/** ${op.summary} */\n  ` : '';
        return {
            content: `${docComment}async ${methodName}(${params.join(', ')}): Promise<${responseType}> {
    return ${call};
  }`,
            referencedModels,
        };
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
        const schema = content[mediaType]?.schema;
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
            if (mediaType && content[mediaType]?.schema) {
                return content[mediaType].schema;
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
    collectReferencedModels(schema, knownModels, refs, visited = new Set()) {
        if (!schema || typeof schema !== 'object') {
            return;
        }
        if (visited.has(schema)) {
            return;
        }
        visited.add(schema);
        if (schema.$ref) {
            const refName = schema.$ref.split('/').pop();
            const modelName = TYPESCRIPT_CONFIG.namingConventions.modelName(refName ?? '');
            if (knownModels.has(modelName)) {
                refs.add(modelName);
            }
            return;
        }
        for (const key of ['oneOf', 'anyOf', 'allOf']) {
            const values = schema[key];
            if (Array.isArray(values)) {
                values.forEach((value) => this.collectReferencedModels(value, knownModels, refs, visited));
            }
        }
        if (schema.items) {
            this.collectReferencedModels(schema.items, knownModels, refs, visited);
        }
        if (schema.properties && typeof schema.properties === 'object') {
            Object.values(schema.properties).forEach((value) => this.collectReferencedModels(value, knownModels, refs, visited));
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            this.collectReferencedModels(schema.additionalProperties, knownModels, refs, visited);
        }
    }
    resolveMethodNames(operations, tag) {
        return resolveScopedMethodNames(operations, (op) => this.generateOperationId(op.method, op.path, op, tag));
    }
    generateOperationId(method, path, op, tag) {
        if (op.operationId) {
            const normalized = normalizeOperationId(op.operationId);
            return TYPESCRIPT_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
        }
        const pathParts = path.split('/').filter(Boolean);
        const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
        const actionMap = {
            get: path.includes('{') ? 'get' : 'list',
            post: 'create',
            put: 'update',
            patch: 'patch',
            delete: 'delete',
        };
        return `${actionMap[method] || method}${TYPESCRIPT_CONFIG.namingConventions.modelName(resource)}`;
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

  protected async post<T>(path: string, body?: unknown, params?: QueryParams, headers?: Record<string, string>): Promise<T> {
    return this.http.post<T>(\`\${this.basePath}\${path}\`, body, params, headers);
  }

  protected async put<T>(path: string, body?: unknown, params?: QueryParams, headers?: Record<string, string>): Promise<T> {
    return this.http.put<T>(\`\${this.basePath}\${path}\`, body, params, headers);
  }

  protected async delete<T>(path: string, params?: QueryParams, headers?: Record<string, string>): Promise<T> {
    return this.http.delete<T>(\`\${this.basePath}\${path}\`, params, headers);
  }

  protected async patch<T>(path: string, body?: unknown, params?: QueryParams, headers?: Record<string, string>): Promise<T> {
    return this.http.patch<T>(\`\${this.basePath}\${path}\`, body, params, headers);
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
        return content.trim() + '\n';
    }
}
