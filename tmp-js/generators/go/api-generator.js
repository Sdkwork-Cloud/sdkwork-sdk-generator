import { createUniqueIdentifierMap, toSafeCamelIdentifier } from '../../framework/identifiers.js';
import { normalizeOperationId, resolveScopedMethodNames, resolveSimplifiedTagNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { GO_CONFIG, getGoType } from './config.js';
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
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
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
        const structName = `${GO_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
        const fileName = GO_CONFIG.namingConventions.fileName(resolvedTagName);
        const methodNames = resolveScopedMethodNames(operations, (op) => this.generateOperationId(op.method, op.path, op, tag));
        const moduleName = this.getModuleName(config);
        const needsFmt = operations.some((op) => this.extractPathParams(op.path).length > 0);
        const referencedModels = new Set();
        const methods = operations
            .map((op) => {
            const generated = this.generateMethod(op, structName, config, methodNames.get(op) || 'Operation', knownModels);
            generated.referencedModels.forEach((modelName) => referencedModels.add(modelName));
            return generated.content;
        })
            .join('\n\n');
        const fmtImport = needsFmt ? '    "fmt"\n' : '';
        const typesImport = referencedModels.size > 0 ? `    sdktypes "${moduleName}/types"\n` : '';
        return {
            path: `api/${fileName}.go`,
            content: this.format(`package api

import (
${fmtImport}${typesImport}    sdkhttp "${moduleName}/http"
)

type ${structName} struct {
    client *sdkhttp.Client
}

func New${structName}(client *sdkhttp.Client) *${structName} {
    return &${structName}{client: client}
}

${methods}
`),
            language: 'go',
            description: `${tag} API module`,
        };
    }
    generateMethod(op, structName, config, methodName, knownModels) {
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
        const requestBodyMediaType = (requestBodyInfo?.mediaType || '').toLowerCase();
        const isMultipartBody = requestBodyMediaType === 'multipart/form-data';
        const rawRequestType = requestBodySchema
            ? getGoType(requestBodySchema, GO_CONFIG)
            : 'interface{}';
        const requestType = this.qualifyGoType(rawRequestType, knownModels);
        const responseSchema = this.extractResponseSchema(op);
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
            hasHeaders ? 'headers' : '',
        ]);
        const pathParams = rawPathParams.map((rawName) => ({
            rawName,
            safeName: pathParamNames.get(rawName) || rawName,
        }));
        const params = [];
        if (pathParams.length > 0) {
            params.push(...pathParams.map((param) => `${param.safeName} string`));
        }
        if (hasBody) {
            const bodyType = requestBodyRequired ? requestType : this.toOptionalGoType(requestType);
            params.push(`body ${bodyType}`);
        }
        if (hasQuery) {
            params.push('query map[string]interface{}');
        }
        if (hasHeaders) {
            params.push('headers map[string]string');
        }
        const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
        const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, '%s');
        const formattedPath = pathParams.length > 0
            ? `fmt.Sprintf("${pathTemplate}", ${pathParams.map((param) => param.safeName).join(', ')})`
            : `"${pathTemplate}"`;
        const prefixedPath = `${GO_CONFIG.namingConventions.modelName(config.sdkType)}ApiPath(${formattedPath})`;
        let call = '';
        switch (method) {
            case 'get':
                if (hasQuery && hasHeaders) {
                    call = `a.client.Get(${prefixedPath}, query, headers)`;
                }
                else if (hasQuery) {
                    call = `a.client.Get(${prefixedPath}, query, nil)`;
                }
                else if (hasHeaders) {
                    call = `a.client.Get(${prefixedPath}, nil, headers)`;
                }
                else {
                    call = `a.client.Get(${prefixedPath}, nil, nil)`;
                }
                break;
            case 'post':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = isMultipartBody
                            ? `a.client.Post(${prefixedPath}, body, query, headers, "multipart/form-data")`
                            : `a.client.Post(${prefixedPath}, body, query, headers, "")`;
                    }
                    else if (hasQuery) {
                        call = isMultipartBody
                            ? `a.client.Post(${prefixedPath}, body, query, nil, "multipart/form-data")`
                            : `a.client.Post(${prefixedPath}, body, query, nil, "")`;
                    }
                    else if (hasHeaders) {
                        call = isMultipartBody
                            ? `a.client.Post(${prefixedPath}, body, nil, headers, "multipart/form-data")`
                            : `a.client.Post(${prefixedPath}, body, nil, headers, "")`;
                    }
                    else {
                        call = isMultipartBody
                            ? `a.client.Post(${prefixedPath}, body, nil, nil, "multipart/form-data")`
                            : `a.client.Post(${prefixedPath}, body, nil, nil, "")`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = `a.client.Post(${prefixedPath}, nil, query, headers, "")`;
                }
                else if (hasQuery) {
                    call = `a.client.Post(${prefixedPath}, nil, query, nil, "")`;
                }
                else if (hasHeaders) {
                    call = `a.client.Post(${prefixedPath}, nil, nil, headers, "")`;
                }
                else {
                    call = `a.client.Post(${prefixedPath}, nil, nil, nil, "")`;
                }
                break;
            case 'put':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = isMultipartBody
                            ? `a.client.Put(${prefixedPath}, body, query, headers, "multipart/form-data")`
                            : `a.client.Put(${prefixedPath}, body, query, headers, "")`;
                    }
                    else if (hasQuery) {
                        call = isMultipartBody
                            ? `a.client.Put(${prefixedPath}, body, query, nil, "multipart/form-data")`
                            : `a.client.Put(${prefixedPath}, body, query, nil, "")`;
                    }
                    else if (hasHeaders) {
                        call = isMultipartBody
                            ? `a.client.Put(${prefixedPath}, body, nil, headers, "multipart/form-data")`
                            : `a.client.Put(${prefixedPath}, body, nil, headers, "")`;
                    }
                    else {
                        call = isMultipartBody
                            ? `a.client.Put(${prefixedPath}, body, nil, nil, "multipart/form-data")`
                            : `a.client.Put(${prefixedPath}, body, nil, nil, "")`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = `a.client.Put(${prefixedPath}, nil, query, headers, "")`;
                }
                else if (hasQuery) {
                    call = `a.client.Put(${prefixedPath}, nil, query, nil, "")`;
                }
                else if (hasHeaders) {
                    call = `a.client.Put(${prefixedPath}, nil, nil, headers, "")`;
                }
                else {
                    call = `a.client.Put(${prefixedPath}, nil, nil, nil, "")`;
                }
                break;
            case 'delete':
                if (hasQuery && hasHeaders) {
                    call = `a.client.Delete(${prefixedPath}, query, headers)`;
                }
                else if (hasQuery) {
                    call = `a.client.Delete(${prefixedPath}, query, nil)`;
                }
                else if (hasHeaders) {
                    call = `a.client.Delete(${prefixedPath}, nil, headers)`;
                }
                else {
                    call = `a.client.Delete(${prefixedPath}, nil, nil)`;
                }
                break;
            case 'patch':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = isMultipartBody
                            ? `a.client.Patch(${prefixedPath}, body, query, headers, "multipart/form-data")`
                            : `a.client.Patch(${prefixedPath}, body, query, headers, "")`;
                    }
                    else if (hasQuery) {
                        call = isMultipartBody
                            ? `a.client.Patch(${prefixedPath}, body, query, nil, "multipart/form-data")`
                            : `a.client.Patch(${prefixedPath}, body, query, nil, "")`;
                    }
                    else if (hasHeaders) {
                        call = isMultipartBody
                            ? `a.client.Patch(${prefixedPath}, body, nil, headers, "multipart/form-data")`
                            : `a.client.Patch(${prefixedPath}, body, nil, headers, "")`;
                    }
                    else {
                        call = isMultipartBody
                            ? `a.client.Patch(${prefixedPath}, body, nil, nil, "multipart/form-data")`
                            : `a.client.Patch(${prefixedPath}, body, nil, nil, "")`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = `a.client.Patch(${prefixedPath}, nil, query, headers, "")`;
                }
                else if (hasQuery) {
                    call = `a.client.Patch(${prefixedPath}, nil, query, nil, "")`;
                }
                else if (hasHeaders) {
                    call = `a.client.Patch(${prefixedPath}, nil, nil, headers, "")`;
                }
                else {
                    call = `a.client.Patch(${prefixedPath}, nil, nil, nil, "")`;
                }
                break;
            default:
                call = `a.client.Get(${prefixedPath}, nil, nil)`;
        }
        const docComment = op.summary ? `// ${op.summary}\n` : '';
        return {
            content: `${docComment}func (a *${structName}) ${methodName}(${params.join(', ')}) (${responseType}, error) {
    raw, err := ${call}
    if err != nil {
        var zero ${responseType}
        return zero, err
    }
    return decodeResult[${responseType}](raw)
}`,
            referencedModels,
        };
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
            const modelName = GO_CONFIG.namingConventions.modelName(refName ?? '');
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
        if (typeName.startsWith('*') || typeName.startsWith('[]') || typeName.startsWith('map[') || typeName === 'interface{}') {
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
