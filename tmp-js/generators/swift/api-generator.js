import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import { normalizeOperationId, resolveScopedMethodNames, resolveSimplifiedTagNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { SWIFT_CONFIG, getSwiftType } from './config.js';
export class ApiGenerator {
    generate(ctx, config) {
        const files = [];
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => SWIFT_CONFIG.namingConventions.modelName(schemaName)));
        for (const tag of tags) {
            const group = ctx.apiGroups[tag];
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            files.push(this.generateApiFile(tag, resolvedTagName, group.operations, config, knownModels));
        }
        files.push(this.generatePaths(config));
        files.push(this.generateApiIndex(tags, resolvedTagNames, config));
        return files;
    }
    generateApiFile(tag, resolvedTagName, operations, config, knownModels) {
        const className = `${SWIFT_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
        const methodNames = resolveScopedMethodNames(operations, (op) => this.generateOperationId(op.method, op.path, op, tag));
        const methods = operations
            .map((op) => this.generateMethod(op, config, methodNames.get(op) || 'operation', knownModels))
            .join('\n\n');
        return {
            path: `Sources/API/${className}.swift`,
            content: this.format(`import Foundation

public class ${className} {
    private let client: HttpClient
    
    public init(client: HttpClient) {
        self.client = client
    }

${methods}
}
`),
            language: 'swift',
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
            ? `, contentType: "${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
            : '';
        const requestType = requestBodySchema
            ? this.ensureKnownType(getSwiftType(requestBodySchema, SWIFT_CONFIG), knownModels)
            : 'Any';
        const responseSchema = this.extractResponseSchema(op);
        const responseType = responseSchema
            ? this.ensureKnownType(getSwiftType(responseSchema, SWIFT_CONFIG), knownModels)
            : this.inferFallbackResponseType(op);
        const typedResponseArg = responseType !== 'Any' && responseType !== 'Void'
            ? `, responseType: ${responseType}.self`
            : '';
        const pathParamNames = createUniqueIdentifierMap(rawPathParams, (value) => SWIFT_CONFIG.namingConventions.propertyName(value), [
            hasBody ? 'body' : '',
            hasQuery ? 'params' : '',
            hasHeaders ? 'headers' : '',
        ]);
        const pathParams = rawPathParams.map((rawName) => ({
            rawName,
            safeName: pathParamNames.get(rawName) || rawName,
        }));
        const params = [];
        if (pathParams.length) {
            params.push(...pathParams.map((param) => `${param.safeName}: String`));
        }
        if (hasBody) {
            if (requestBodyRequired) {
                params.push(`body: ${requestType}`);
            }
            else {
                params.push(`body: ${requestType}? = nil`);
            }
        }
        if (hasQuery) {
            params.push('params: [String: Any]? = nil');
        }
        if (hasHeaders) {
            params.push('headers: [String: String]? = nil');
        }
        const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
        const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, (_match, paramName) => {
            const safeName = pathParamNames.get(paramName) || SWIFT_CONFIG.namingConventions.propertyName(paramName);
            return `\\(${safeName})`;
        });
        const pathCall = `ApiPaths.${SWIFT_CONFIG.namingConventions.methodName(config.sdkType)}Path("${pathTemplate}")`;
        let call = '';
        switch (method) {
            case 'get':
                if (hasQuery && hasHeaders) {
                    call = `try await client.get(${pathCall}, params: params, headers: headers${typedResponseArg})`;
                }
                else if (hasQuery) {
                    call = `try await client.get(${pathCall}, params: params${typedResponseArg})`;
                }
                else if (hasHeaders) {
                    call = `try await client.get(${pathCall}, params: nil, headers: headers${typedResponseArg})`;
                }
                else {
                    call = `try await client.get(${pathCall}${typedResponseArg})`;
                }
                break;
            case 'post':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = `try await client.post(${pathCall}, body: body, params: params, headers: headers${contentTypeArg}${typedResponseArg})`;
                    }
                    else if (hasQuery) {
                        call = `try await client.post(${pathCall}, body: body, params: params, headers: nil${contentTypeArg}${typedResponseArg})`;
                    }
                    else if (hasHeaders) {
                        call = `try await client.post(${pathCall}, body: body, params: nil, headers: headers${contentTypeArg}${typedResponseArg})`;
                    }
                    else {
                        call = `try await client.post(${pathCall}, body: body, params: nil, headers: nil${contentTypeArg}${typedResponseArg})`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = `try await client.post(${pathCall}, body: nil, params: params, headers: headers${typedResponseArg})`;
                }
                else if (hasQuery) {
                    call = `try await client.post(${pathCall}, body: nil, params: params${typedResponseArg})`;
                }
                else if (hasHeaders) {
                    call = `try await client.post(${pathCall}, body: nil, params: nil, headers: headers${typedResponseArg})`;
                }
                else {
                    call = `try await client.post(${pathCall}, body: nil${typedResponseArg})`;
                }
                break;
            case 'put':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = `try await client.put(${pathCall}, body: body, params: params, headers: headers${contentTypeArg}${typedResponseArg})`;
                    }
                    else if (hasQuery) {
                        call = `try await client.put(${pathCall}, body: body, params: params, headers: nil${contentTypeArg}${typedResponseArg})`;
                    }
                    else if (hasHeaders) {
                        call = `try await client.put(${pathCall}, body: body, params: nil, headers: headers${contentTypeArg}${typedResponseArg})`;
                    }
                    else {
                        call = `try await client.put(${pathCall}, body: body, params: nil, headers: nil${contentTypeArg}${typedResponseArg})`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = `try await client.put(${pathCall}, body: nil, params: params, headers: headers${typedResponseArg})`;
                }
                else if (hasQuery) {
                    call = `try await client.put(${pathCall}, body: nil, params: params${typedResponseArg})`;
                }
                else if (hasHeaders) {
                    call = `try await client.put(${pathCall}, body: nil, params: nil, headers: headers${typedResponseArg})`;
                }
                else {
                    call = `try await client.put(${pathCall}, body: nil${typedResponseArg})`;
                }
                break;
            case 'delete':
                if (hasQuery && hasHeaders) {
                    call = `try await client.delete(${pathCall}, params: params, headers: headers${typedResponseArg})`;
                }
                else if (hasQuery) {
                    call = `try await client.delete(${pathCall}, params: params${typedResponseArg})`;
                }
                else if (hasHeaders) {
                    call = `try await client.delete(${pathCall}, params: nil, headers: headers${typedResponseArg})`;
                }
                else {
                    call = `try await client.delete(${pathCall}${typedResponseArg})`;
                }
                break;
            case 'patch':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = `try await client.patch(${pathCall}, body: body, params: params, headers: headers${contentTypeArg}${typedResponseArg})`;
                    }
                    else if (hasQuery) {
                        call = `try await client.patch(${pathCall}, body: body, params: params, headers: nil${contentTypeArg}${typedResponseArg})`;
                    }
                    else if (hasHeaders) {
                        call = `try await client.patch(${pathCall}, body: body, params: nil, headers: headers${contentTypeArg}${typedResponseArg})`;
                    }
                    else {
                        call = `try await client.patch(${pathCall}, body: body, params: nil, headers: nil${contentTypeArg}${typedResponseArg})`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = `try await client.patch(${pathCall}, body: nil, params: params, headers: headers${typedResponseArg})`;
                }
                else if (hasQuery) {
                    call = `try await client.patch(${pathCall}, body: nil, params: params${typedResponseArg})`;
                }
                else if (hasHeaders) {
                    call = `try await client.patch(${pathCall}, body: nil, params: nil, headers: headers${typedResponseArg})`;
                }
                else {
                    call = `try await client.patch(${pathCall}, body: nil${typedResponseArg})`;
                }
                break;
            default:
                call = `try await client.get(${pathCall}${typedResponseArg})`;
        }
        const docComment = op.summary ? `    /// ${op.summary}\n` : '';
        if (responseType === 'Void') {
            return `${docComment}    public func ${methodName}(${params.join(', ')}) async throws -> Void {
        _ = ${call}
    }`;
        }
        if (responseType === 'Any') {
            return `${docComment}    public func ${methodName}(${params.join(', ')}) async throws -> Any? {
        return ${call}
    }`;
        }
        return `${docComment}    public func ${methodName}(${params.join(', ')}) async throws -> ${responseType}? {
        return ${call}
    }`;
    }
    generateOperationId(method, path, op, tag) {
        if (op.operationId) {
            const normalized = normalizeOperationId(op.operationId);
            return SWIFT_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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
        return `${actionMap[method] || method}${SWIFT_CONFIG.namingConventions.modelName(resource)}`;
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
            return 'Any';
        }
        const statusCodes = Object.keys(responses);
        if (statusCodes.length === 0) {
            return 'Any';
        }
        const allNoContent = statusCodes.every((code) => {
            const content = responses[code]?.content;
            return !content || typeof content !== 'object' || Object.keys(content).length === 0;
        });
        if (allNoContent || responses['204']) {
            return 'Void';
        }
        return 'Any';
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
    generatePaths(config) {
        return {
            path: 'Sources/API/ApiPaths.swift',
            content: this.format(`import Foundation

public struct ApiPaths {
    public static let apiPrefix = "${config.apiPrefix}"
    
    public static func ${SWIFT_CONFIG.namingConventions.methodName(config.sdkType)}Path(_ path: String = "") -> String {
        if path.isEmpty {
            return apiPrefix
        }
        if path.hasPrefix("http://") || path.hasPrefix("https://") {
            return path
        }

        let prefixRaw = apiPrefix.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedPrefix: String
        if !prefixRaw.isEmpty && prefixRaw != "/" {
            normalizedPrefix = "/" + prefixRaw.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        } else {
            normalizedPrefix = ""
        }

        let normalizedPath = path.hasPrefix("/") ? path : "/" + path
        if normalizedPrefix.isEmpty {
            return normalizedPath
        }
        if normalizedPath == normalizedPrefix || normalizedPath.hasPrefix(normalizedPrefix + "/") {
            return normalizedPath
        }
        return normalizedPrefix + normalizedPath
    }
}
`),
            language: 'swift',
            description: 'API path utilities',
        };
    }
    generateApiIndex(tags, resolvedTagNames, config) {
        return {
            path: 'Sources/API/API.swift',
            content: this.format(`import Foundation

/// API modules for ${config.name}
public struct API {
${tags.map((tag) => {
                const resolvedTagName = resolvedTagNames.get(tag) || tag;
                return `    public static let ${SWIFT_CONFIG.namingConventions.propertyName(resolvedTagName)} = ${SWIFT_CONFIG.namingConventions.modelName(resolvedTagName)}Api.self`;
            }).join('\n')}
}
`),
            language: 'swift',
            description: 'API module exports',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
