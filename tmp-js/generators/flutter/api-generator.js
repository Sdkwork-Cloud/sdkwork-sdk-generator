import { normalizeOperationId, resolveScopedMethodNames, resolveSimplifiedTagNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { FLUTTER_CONFIG, getFlutterType } from './config.js';
export class ApiGenerator {
    generate(ctx, config) {
        const files = [];
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => FLUTTER_CONFIG.namingConventions.modelName(schemaName)));
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
        const className = `${FLUTTER_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
        const fileName = FLUTTER_CONFIG.namingConventions.fileName(resolvedTagName);
        const methodNames = resolveScopedMethodNames(operations, (op) => this.generateOperationId(op.method, op.path, op, tag));
        const methods = operations
            .map((op) => this.generateMethod(op, config, methodNames.get(op) || 'operation', knownModels))
            .join('\n\n');
        return {
            path: `lib/src/api/${fileName}.dart`,
            content: this.format(`import '../http/client.dart';
import '../models.dart';
import 'paths.dart';

class ${className} {
  final HttpClient _client;
  
  ${className}(this._client);

${methods}
}
`),
            language: 'flutter',
            description: `${tag} API module`,
        };
    }
    generateMethod(op, config, methodName, knownModels) {
        const pathParams = this.extractPathParams(op.path);
        const allParameters = op.allParameters || op.parameters || [];
        const queryParams = allParameters.filter((param) => param?.in === 'query');
        const headerParams = allParameters.filter((param) => param?.in === 'header');
        const cookieParams = allParameters.filter((param) => param?.in === 'cookie');
        const hasQuery = queryParams.length > 0;
        const hasHeaders = headerParams.length > 0 || cookieParams.length > 0;
        const method = String(op.method || '').toLowerCase();
        const supportsRequestBody = method === 'post' || method === 'put' || method === 'patch';
        const requestBodyInfo = supportsRequestBody ? this.extractRequestBodyInfo(op) : undefined;
        const hasBody = requestBodyInfo !== undefined;
        const requestBodyRequired = hasBody && Boolean(op.requestBody?.required);
        const requestBodySchema = requestBodyInfo?.schema;
        const requestBodyMediaType = (requestBodyInfo?.mediaType || '').toLowerCase();
        const isMultipartBody = requestBodyMediaType === 'multipart/form-data';
        const requestType = requestBodySchema
            ? this.ensureKnownType(getFlutterType(requestBodySchema, FLUTTER_CONFIG), knownModels)
            : 'dynamic';
        const contentTypeArg = requestBodyInfo?.mediaType
            ? `, contentType: '${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
            : '';
        const responseSchema = this.extractResponseSchema(op);
        const responseType = responseSchema
            ? this.ensureKnownType(getFlutterType(responseSchema, FLUTTER_CONFIG), knownModels)
            : this.inferFallbackResponseType(op);
        const params = [];
        if (pathParams.length) {
            params.push(...pathParams.map((p) => `String ${p}`));
        }
        if (hasBody) {
            if (requestBodyRequired) {
                params.push(`${requestType} body`);
            }
            else if (requestType === 'dynamic') {
                params.push('dynamic body');
            }
            else {
                params.push(`${requestType}? body`);
            }
        }
        if (hasQuery) {
            params.push('Map<String, dynamic>? params');
        }
        if (hasHeaders) {
            params.push('Map<String, String>? headers');
        }
        const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
        const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, '\$' + '{$1}');
        const pathCall = `ApiPaths.${FLUTTER_CONFIG.namingConventions.methodName(config.sdkType)}Path('${pathTemplate}')`;
        let call = '';
        switch (method) {
            case 'get':
                call = `_client.get(${pathCall}${hasQuery ? ', params: params' : ''}${hasHeaders ? ', headers: headers' : ''})`;
                break;
            case 'post':
                call = `_client.post(${pathCall}${hasBody ? ', body: body' : ''}${hasQuery ? ', params: params' : ''}${hasHeaders ? ', headers: headers' : ''}${hasBody ? contentTypeArg : ''})`;
                break;
            case 'put':
                call = `_client.put(${pathCall}${hasBody ? ', body: body' : ''}${hasQuery ? ', params: params' : ''}${hasHeaders ? ', headers: headers' : ''}${hasBody ? contentTypeArg : ''})`;
                break;
            case 'delete':
                call = `_client.delete(${pathCall}${hasQuery ? ', params: params' : ''}${hasHeaders ? ', headers: headers' : ''})`;
                break;
            case 'patch':
                call = `_client.patch(${pathCall}${hasBody ? ', body: body' : ''}${hasQuery ? ', params: params' : ''}${hasHeaders ? ', headers: headers' : ''}${hasBody ? contentTypeArg : ''})`;
                break;
            default:
                call = `_client.get(${pathCall})`;
        }
        const docComment = op.summary ? `  /// ${op.summary}\n` : '';
        if (responseType === 'void') {
            return `${docComment}  Future<void> ${methodName}(${params.join(', ')}) async {
    await ${call};
  }`;
        }
        if (responseType === 'dynamic') {
            return `${docComment}  Future<dynamic> ${methodName}(${params.join(', ')}) async {
    return ${call};
  }`;
        }
        return `${docComment}  Future<${responseType}?> ${methodName}(${params.join(', ')}) async {
    final response = await ${call};
    return response is ${responseType} ? response : null;
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
        const schema = content[mediaType]?.schema;
        if (!schema) {
            return undefined;
        }
        return { mediaType, schema };
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
            return 'dynamic';
        }
        const statusCodes = Object.keys(responses);
        if (statusCodes.length === 0) {
            return 'dynamic';
        }
        const allNoContent = statusCodes.every((code) => {
            const content = responses[code]?.content;
            return !content || typeof content !== 'object' || Object.keys(content).length === 0;
        });
        if (allNoContent || responses['204']) {
            return 'void';
        }
        return 'dynamic';
    }
    ensureKnownType(typeName, _knownModels) {
        return typeName;
    }
    generateOperationId(method, path, op, tag) {
        if (op.operationId) {
            const normalized = normalizeOperationId(op.operationId);
            return FLUTTER_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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
        return `${actionMap[method] || method}${FLUTTER_CONFIG.namingConventions.modelName(resource)}`;
    }
    extractPathParams(path) {
        const matches = path.match(/\{([^}]+)\}/g) || [];
        return matches.map((m) => m.replace(/[{}]/g, ''));
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
            path: 'lib/src/api/paths.dart',
            content: this.format(`class ApiPaths {
  static const String apiPrefix = '${config.apiPrefix}';
  
  static String ${FLUTTER_CONFIG.namingConventions.methodName(config.sdkType)}Path([String path = '']) {
    if (path.isEmpty) return apiPrefix;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;

    final prefixRaw = apiPrefix.trim();
    final normalizedPrefix =
        (prefixRaw.isNotEmpty && prefixRaw != '/') ? '/\${prefixRaw.replaceAll(RegExp(r'^/+|/+\$'), '')}' : '';
    final normalizedPath = path.startsWith('/') ? path : '/$path';

    if (normalizedPrefix.isEmpty) return normalizedPath;
    if (normalizedPath == normalizedPrefix || normalizedPath.startsWith('$normalizedPrefix/')) {
      return normalizedPath;
    }
    return normalizedPrefix + normalizedPath;
  }
}
`),
            language: 'flutter',
            description: 'API path utilities',
        };
    }
    generateApiIndex(tags, resolvedTagNames, config) {
        const exports = tags.map((tag) => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const fileName = FLUTTER_CONFIG.namingConventions.fileName(resolvedTagName);
            return `export '${fileName}.dart';`;
        }).join('\n');
        return {
            path: 'lib/src/api/api.dart',
            content: this.format(`export 'paths.dart';
${exports}
`),
            language: 'flutter',
            description: 'API module exports',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
