import { createUniqueIdentifierMap, toSafeCamelIdentifier } from '../../framework/identifiers.js';
import { normalizeOperationId, resolveScopedMethodNames, resolveSimplifiedTagNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { CSHARP_CONFIG, getCSharpNamespace, getCSharpType } from './config.js';
const CSHARP_RESERVED_WORDS = new Set([
    'abstract',
    'as',
    'base',
    'bool',
    'break',
    'byte',
    'case',
    'catch',
    'char',
    'checked',
    'class',
    'const',
    'continue',
    'decimal',
    'default',
    'delegate',
    'do',
    'double',
    'else',
    'enum',
    'event',
    'explicit',
    'extern',
    'false',
    'finally',
    'fixed',
    'float',
    'for',
    'foreach',
    'goto',
    'if',
    'implicit',
    'in',
    'int',
    'interface',
    'internal',
    'is',
    'lock',
    'long',
    'namespace',
    'new',
    'null',
    'object',
    'operator',
    'out',
    'override',
    'params',
    'private',
    'protected',
    'public',
    'readonly',
    'ref',
    'return',
    'sbyte',
    'sealed',
    'short',
    'sizeof',
    'stackalloc',
    'static',
    'string',
    'struct',
    'switch',
    'this',
    'throw',
    'true',
    'try',
    'typeof',
    'uint',
    'ulong',
    'unchecked',
    'unsafe',
    'ushort',
    'using',
    'virtual',
    'void',
    'volatile',
    'while',
]);
export class ApiGenerator {
    generate(ctx, config) {
        const files = [];
        const namespace = getCSharpNamespace(config);
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => CSHARP_CONFIG.namingConventions.modelName(schemaName)));
        for (const tag of tags) {
            const group = ctx.apiGroups[tag];
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            files.push(this.generateApiClass(tag, resolvedTagName, group.operations, namespace, config, knownModels));
        }
        files.push(this.generatePaths(namespace, config));
        files.push(this.generateApiIndex(tags, resolvedTagNames, namespace, config));
        return files;
    }
    generateApiClass(tag, resolvedTagName, operations, namespace, config, knownModels) {
        const className = `${CSHARP_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
        const methodNames = resolveScopedMethodNames(operations, (op) => this.generateOperationId(op.method, op.path, op, tag));
        const methods = operations
            .map((op) => this.generateMethod(op, config, methodNames.get(op) || 'Operation', knownModels))
            .join('\n\n');
        return {
            path: `Api/${className}.cs`,
            content: this.format(`using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using ${namespace}.Models;
using SdkHttpClient = ${namespace}.Http.HttpClient;

namespace ${namespace}.Api
{
    public class ${className}
    {
        private readonly SdkHttpClient _client;

        public ${className}(SdkHttpClient client)
        {
            _client = client;
        }

${methods}
    }
}
`),
            language: 'csharp',
            description: `${tag} API module`,
        };
    }
    generateMethod(op, config, methodName, knownModels) {
        const rawPathParams = this.extractPathParams(op.path);
        const allParameters = op.allParameters || op.parameters || [];
        const hasQuery = allParameters.some((param) => param?.in === 'query');
        const hasHeaders = allParameters.some((param) => param?.in === 'header' || param?.in === 'cookie');
        const method = String(op.method || '').toLowerCase();
        const supportsRequestBody = method === 'post' || method === 'put' || method === 'patch';
        const requestBodyInfo = supportsRequestBody ? this.extractRequestBodyInfo(op) : undefined;
        const hasBody = Boolean(requestBodyInfo);
        const requestBodyRequired = hasBody && Boolean(op.requestBody?.required);
        const requestBodySchema = requestBodyInfo?.schema;
        const contentTypeArg = requestBodyInfo?.mediaType
            ? `, "${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
            : '';
        const requestType = requestBodySchema
            ? this.ensureKnownType(getCSharpType(requestBodySchema, CSHARP_CONFIG), knownModels)
            : 'object';
        const responseSchema = this.extractResponseSchema(op);
        const responseType = responseSchema
            ? this.ensureKnownType(getCSharpType(responseSchema, CSHARP_CONFIG), knownModels)
            : this.inferFallbackResponseType(op);
        const pathParamNames = createUniqueIdentifierMap(rawPathParams, (value) => toSafeCamelIdentifier(value, CSHARP_RESERVED_WORDS), [
            hasBody ? 'body' : '',
            hasQuery ? 'query' : '',
            hasHeaders ? 'headers' : '',
        ]);
        const pathParams = rawPathParams.map((rawName) => ({
            rawName,
            safeName: pathParamNames.get(rawName) || rawName,
        }));
        const params = [];
        if (pathParams.length) {
            params.push(...pathParams.map((param) => `string ${param.safeName}`));
        }
        if (hasBody) {
            if (requestBodyRequired) {
                params.push(`${requestType} body`);
            }
            else {
                params.push(`${requestType}? body = null`);
            }
        }
        if (hasQuery) {
            params.push('Dictionary<string, object>? query = null');
        }
        if (hasHeaders) {
            params.push('Dictionary<string, string>? headers = null');
        }
        const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
        const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, (_match, paramName) => {
            const safeName = pathParamNames.get(paramName) || toSafeCamelIdentifier(paramName, CSHARP_RESERVED_WORDS);
            return `{${safeName}}`;
        });
        const pathExpression = pathParams.length > 0 ? `$\"${pathTemplate}\"` : `\"${pathTemplate}\"`;
        const pathCall = `ApiPaths.${CSHARP_CONFIG.namingConventions.modelName(config.sdkType)}Path(${pathExpression})`;
        let call = '';
        switch (method) {
            case 'get':
                if (hasQuery && hasHeaders) {
                    call = `await _client.GetAsync<${responseType}>(${pathCall}, query, headers)`;
                }
                else if (hasQuery) {
                    call = `await _client.GetAsync<${responseType}>(${pathCall}, query)`;
                }
                else if (hasHeaders) {
                    call = `await _client.GetAsync<${responseType}>(${pathCall}, null, headers)`;
                }
                else {
                    call = `await _client.GetAsync<${responseType}>(${pathCall})`;
                }
                break;
            case 'post':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = `await _client.PostAsync<${responseType}>(${pathCall}, body, query, headers${contentTypeArg})`;
                    }
                    else if (hasQuery) {
                        call = `await _client.PostAsync<${responseType}>(${pathCall}, body, query, null${contentTypeArg})`;
                    }
                    else if (hasHeaders) {
                        call = `await _client.PostAsync<${responseType}>(${pathCall}, body, null, headers${contentTypeArg})`;
                    }
                    else {
                        call = `await _client.PostAsync<${responseType}>(${pathCall}, body, null, null${contentTypeArg})`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = `await _client.PostAsync<${responseType}>(${pathCall}, null, query, headers)`;
                }
                else if (hasQuery) {
                    call = `await _client.PostAsync<${responseType}>(${pathCall}, null, query)`;
                }
                else if (hasHeaders) {
                    call = `await _client.PostAsync<${responseType}>(${pathCall}, null, null, headers)`;
                }
                else {
                    call = `await _client.PostAsync<${responseType}>(${pathCall}, null)`;
                }
                break;
            case 'put':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = `await _client.PutAsync<${responseType}>(${pathCall}, body, query, headers${contentTypeArg})`;
                    }
                    else if (hasQuery) {
                        call = `await _client.PutAsync<${responseType}>(${pathCall}, body, query, null${contentTypeArg})`;
                    }
                    else if (hasHeaders) {
                        call = `await _client.PutAsync<${responseType}>(${pathCall}, body, null, headers${contentTypeArg})`;
                    }
                    else {
                        call = `await _client.PutAsync<${responseType}>(${pathCall}, body, null, null${contentTypeArg})`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = `await _client.PutAsync<${responseType}>(${pathCall}, null, query, headers)`;
                }
                else if (hasQuery) {
                    call = `await _client.PutAsync<${responseType}>(${pathCall}, null, query)`;
                }
                else if (hasHeaders) {
                    call = `await _client.PutAsync<${responseType}>(${pathCall}, null, null, headers)`;
                }
                else {
                    call = `await _client.PutAsync<${responseType}>(${pathCall}, null)`;
                }
                break;
            case 'delete':
                if (hasQuery && hasHeaders) {
                    call = `await _client.DeleteAsync<${responseType}>(${pathCall}, query, headers)`;
                }
                else if (hasQuery) {
                    call = `await _client.DeleteAsync<${responseType}>(${pathCall}, query)`;
                }
                else if (hasHeaders) {
                    call = `await _client.DeleteAsync<${responseType}>(${pathCall}, null, headers)`;
                }
                else {
                    call = `await _client.DeleteAsync<${responseType}>(${pathCall})`;
                }
                break;
            case 'patch':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = `await _client.PatchAsync<${responseType}>(${pathCall}, body, query, headers${contentTypeArg})`;
                    }
                    else if (hasQuery) {
                        call = `await _client.PatchAsync<${responseType}>(${pathCall}, body, query, null${contentTypeArg})`;
                    }
                    else if (hasHeaders) {
                        call = `await _client.PatchAsync<${responseType}>(${pathCall}, body, null, headers${contentTypeArg})`;
                    }
                    else {
                        call = `await _client.PatchAsync<${responseType}>(${pathCall}, body, null, null${contentTypeArg})`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = `await _client.PatchAsync<${responseType}>(${pathCall}, null, query, headers)`;
                }
                else if (hasQuery) {
                    call = `await _client.PatchAsync<${responseType}>(${pathCall}, null, query)`;
                }
                else if (hasHeaders) {
                    call = `await _client.PatchAsync<${responseType}>(${pathCall}, null, null, headers)`;
                }
                else {
                    call = `await _client.PatchAsync<${responseType}>(${pathCall}, null)`;
                }
                break;
            default:
                call = `await _client.GetAsync<${responseType}>(${pathCall})`;
        }
        const docComment = op.summary ? `        /// <summary>\n        /// ${op.summary}\n        /// </summary>\n` : '';
        const effectiveCall = responseType === 'void'
            ? call.replace('<void>', '<object>')
            : call;
        if (responseType === 'void') {
            return `${docComment}        public async Task ${methodName}Async(${params.join(', ')})
        {
            ${effectiveCall};
        }`;
        }
        return `${docComment}        public async Task<${responseType}?> ${methodName}Async(${params.join(', ')})
        {
            return ${effectiveCall};
        }`;
    }
    generateOperationId(method, path, op, tag) {
        if (op.operationId) {
            const normalized = normalizeOperationId(op.operationId);
            return CSHARP_CONFIG.namingConventions.modelName(stripTagPrefixFromOperationId(normalized, tag));
        }
        const pathParts = path.split('/').filter(Boolean);
        const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
        const actionMap = {
            get: path.includes('{') ? 'Get' : 'List',
            post: 'Create',
            put: 'Update',
            patch: 'Patch',
            delete: 'Delete',
        };
        return `${actionMap[method] || CSHARP_CONFIG.namingConventions.modelName(method)}${CSHARP_CONFIG.namingConventions.modelName(resource)}`;
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
        const schema = content[mediaType]?.schema;
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
            return 'void';
        }
        const statusCodes = Object.keys(responses);
        if (statusCodes.length === 0) {
            return 'void';
        }
        const allNoContent = statusCodes.every((code) => {
            const content = responses[code]?.content;
            return !content || typeof content !== 'object' || Object.keys(content).length === 0;
        });
        if (allNoContent || responses['204']) {
            return 'void';
        }
        return 'object';
    }
    ensureKnownType(typeName, _knownModels) {
        return typeName;
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
    generatePaths(namespace, config) {
        return {
            path: 'Api/ApiPaths.cs',
            content: this.format(`namespace ${namespace}.Api
{
    public static class ApiPaths
    {
        public const string ApiPrefix = "${config.apiPrefix}";

        public static string ${CSHARP_CONFIG.namingConventions.modelName(config.sdkType)}Path(string path = "")
        {
            if (string.IsNullOrEmpty(path)) return ApiPrefix;
            if (path.StartsWith("http://") || path.StartsWith("https://")) return path;

            var normalizedPrefix = (ApiPrefix ?? string.Empty).Trim();
            if (!string.IsNullOrEmpty(normalizedPrefix) && normalizedPrefix != "/")
            {
                normalizedPrefix = "/" + normalizedPrefix.Trim('/');
            }
            else
            {
                normalizedPrefix = string.Empty;
            }

            var normalizedPath = path.StartsWith("/") ? path : "/" + path;
            if (string.IsNullOrEmpty(normalizedPrefix)) return normalizedPath;
            if (normalizedPath == normalizedPrefix || normalizedPath.StartsWith(normalizedPrefix + "/")) return normalizedPath;
            return normalizedPrefix + normalizedPath;
        }
    }
}
`),
            language: 'csharp',
            description: 'API path utilities',
        };
    }
    generateApiIndex(tags, resolvedTagNames, namespace, config) {
        return {
            path: 'Api/Api.cs',
            content: this.format(`namespace ${namespace}.Api
{
    /// <summary>
    /// API modules for ${config.name}
    /// </summary>
    public static class Api
    {
${tags.map((tag) => {
                const resolvedTagName = resolvedTagNames.get(tag) || tag;
                return `        public static ${CSHARP_CONFIG.namingConventions.modelName(resolvedTagName)}Api? ${CSHARP_CONFIG.namingConventions.propertyName(resolvedTagName)} { get; set; }`;
            }).join('\n')}
    }
}
`),
            language: 'csharp',
            description: 'API module exports',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
