import { createUniqueIdentifierMap, toSafeCamelIdentifier } from '../../framework/identifiers.js';
import { normalizeOperationId, resolveScopedMethodNames, resolveSimplifiedTagNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { DART_CONFIG, DART_RESERVED_WORDS, getDartType } from './config.js';
export class ApiGenerator {
    generate(ctx, config) {
        const files = [];
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => DART_CONFIG.namingConventions.modelName(schemaName)));
        for (const tag of tags) {
            const group = ctx.apiGroups[tag];
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            files.push(this.generateApiFile(tag, resolvedTagName, group.operations, config, knownModels));
        }
        files.push(this.generatePaths(config));
        files.push(this.generateResponseHelpers());
        files.push(this.generateApiIndex(tags, resolvedTagNames));
        return files;
    }
    generateApiFile(tag, resolvedTagName, operations, config, knownModels) {
        const className = `${DART_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
        const fileName = DART_CONFIG.namingConventions.fileName(resolvedTagName);
        const methodNames = resolveScopedMethodNames(operations, (op) => this.generateOperationId(op.method, op.path, op, tag));
        const methods = operations
            .map((op) => this.generateMethod(op, config, methodNames.get(op) || 'operation', knownModels))
            .join('\n\n');
        return {
            path: `lib/src/api/${fileName}.dart`,
            content: this.format(`import '../http/client.dart';
import '../models.dart';
import 'paths.dart';
import 'response_helpers.dart';

class ${className} {
  final HttpClient _client;

  ${className}(this._client);

${methods}
}
`),
            language: 'dart',
            description: `${tag} API module`,
        };
    }
    generateMethod(op, config, methodName, knownModels) {
        const rawPathParams = this.extractPathParams(op.path);
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
        const requestType = requestBodySchema
            ? this.ensureKnownType(getDartType(requestBodySchema, DART_CONFIG), knownModels)
            : 'dynamic';
        const contentTypeArg = requestBodyInfo?.mediaType
            ? `, contentType: '${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
            : '';
        const responseSchema = this.extractResponseSchema(op);
        const responseType = responseSchema
            ? this.ensureKnownType(getDartType(responseSchema, DART_CONFIG), knownModels)
            : this.inferFallbackResponseType(op);
        const pathParamNames = createUniqueIdentifierMap(rawPathParams, (value) => toSafeCamelIdentifier(value, DART_RESERVED_WORDS), [
            hasBody ? 'body' : '',
            hasQuery ? 'params' : '',
            hasHeaders ? 'headers' : '',
            hasBody ? 'payload' : '',
        ]);
        const pathParams = rawPathParams.map((rawName) => ({
            rawName,
            safeName: pathParamNames.get(rawName) || rawName,
        }));
        const params = [];
        if (pathParams.length) {
            params.push(...pathParams.map((pathParam) => `String ${pathParam.safeName}`));
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
        const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, (_match, paramName) => {
            const safeName = pathParamNames.get(paramName) || toSafeCamelIdentifier(paramName, DART_RESERVED_WORDS);
            return `$${safeName}`;
        });
        const pathCall = `ApiPaths.${DART_CONFIG.namingConventions.methodName(config.sdkType)}Path('${pathTemplate}')`;
        const payloadLine = hasBody
            ? `    final payload = ${this.serializeRequestBodyExpression(requestBodySchema, 'body', requestBodyRequired)};\n`
            : '';
        let call = '';
        switch (method) {
            case 'get':
                call = `_client.get(${pathCall}${hasQuery ? ', params: params' : ''}${hasHeaders ? ', headers: headers' : ''})`;
                break;
            case 'post':
                call = `_client.post(${pathCall}${hasBody ? ', body: payload' : ''}${hasQuery ? ', params: params' : ''}${hasHeaders ? ', headers: headers' : ''}${hasBody ? contentTypeArg : ''})`;
                break;
            case 'put':
                call = `_client.put(${pathCall}${hasBody ? ', body: payload' : ''}${hasQuery ? ', params: params' : ''}${hasHeaders ? ', headers: headers' : ''}${hasBody ? contentTypeArg : ''})`;
                break;
            case 'delete':
                call = `_client.delete(${pathCall}${hasQuery ? ', params: params' : ''}${hasHeaders ? ', headers: headers' : ''})`;
                break;
            case 'patch':
                call = `_client.patch(${pathCall}${hasBody ? ', body: payload' : ''}${hasQuery ? ', params: params' : ''}${hasHeaders ? ', headers: headers' : ''}${hasBody ? contentTypeArg : ''})`;
                break;
            default:
                call = `_client.get(${pathCall})`;
        }
        const docComment = op.summary ? `  /// ${op.summary}\n` : '';
        if (responseType === 'void') {
            return `${docComment}  Future<void> ${methodName}(${params.join(', ')}) async {
${payloadLine}    await ${call};
  }`;
        }
        if (responseType === 'dynamic') {
            return `${docComment}  Future<dynamic> ${methodName}(${params.join(', ')}) async {
${payloadLine}    return ${call};
  }`;
        }
        return `${docComment}  Future<${responseType}?> ${methodName}(${params.join(', ')}) async {
${payloadLine}    final response = await ${call};
    return ${this.deserializeResponseExpression(responseSchema, 'response')};
  }`;
    }
    serializeRequestBodyExpression(schema, bodyExpr, required) {
        if (!schema || typeof schema !== 'object') {
            return bodyExpr;
        }
        if (schema.$ref) {
            return required ? `${bodyExpr}.toJson()` : `${bodyExpr}?.toJson()`;
        }
        if (schema.items) {
            const itemExpr = this.serializeArrayItemExpression(schema.items, 'item');
            return required
                ? `${bodyExpr}.map((item) => ${itemExpr}).toList()`
                : `${bodyExpr}?.map((item) => ${itemExpr}).toList()`;
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const itemExpr = this.serializeArrayItemExpression(schema.additionalProperties, 'item');
            return required
                ? `${bodyExpr}.map((key, item) => MapEntry(key, ${itemExpr}))`
                : `${bodyExpr}?.map((key, item) => MapEntry(key, ${itemExpr}))`;
        }
        return bodyExpr;
    }
    serializeArrayItemExpression(schema, itemExpr) {
        if (schema?.$ref) {
            return `${itemExpr}.toJson()`;
        }
        if (schema?.items) {
            const nestedExpr = this.serializeArrayItemExpression(schema.items, 'nestedItem');
            return `${itemExpr}.map((nestedItem) => ${nestedExpr}).toList()`;
        }
        if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
            const nestedExpr = this.serializeArrayItemExpression(schema.additionalProperties, 'nestedItem');
            return `${itemExpr}.map((key, nestedItem) => MapEntry(key, ${nestedExpr}))`;
        }
        return itemExpr;
    }
    deserializeResponseExpression(schema, valueExpr) {
        if (!schema || typeof schema !== 'object') {
            return valueExpr;
        }
        if (schema.$ref) {
            const refName = DART_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            return `(() {
      final map = sdkworkResponseAsMap(${valueExpr});
      return map == null ? null : ${refName}.fromJson(map);
    })()`;
        }
        if (schema.items) {
            const itemType = getDartType(schema.items, DART_CONFIG);
            const itemExpr = this.deserializeArrayItemExpression(schema.items, 'item');
            return `(() {
      final list = ${valueExpr} is List ? ${valueExpr} : null;
      if (list == null) {
        return null;
      }
      return list
          .map((item) => ${itemExpr})
          .where((item) => item != null)
          .map((item) => item as ${itemType})
          .toList();
    })()`;
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const valueType = getDartType(schema.additionalProperties, DART_CONFIG);
            const itemExpr = this.deserializeArrayItemExpression(schema.additionalProperties, 'item');
            return `(() {
      final map = sdkworkResponseAsMap(${valueExpr});
      if (map == null) {
        return null;
      }
      return map.map((key, item) => MapEntry(key, ${itemExpr} as ${valueType}));
    })()`;
        }
        return valueExpr;
    }
    deserializeArrayItemExpression(schema, itemExpr) {
        if (schema?.$ref) {
            const refName = DART_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            return `(() {
        final map = sdkworkResponseAsMap(${itemExpr});
        return map == null ? null : ${refName}.fromJson(map);
      })()`;
        }
        if (schema?.items) {
            const nestedType = getDartType(schema.items, DART_CONFIG);
            const nestedExpr = this.deserializeArrayItemExpression(schema.items, 'nestedItem');
            return `(() {
        final list = ${itemExpr} is List ? ${itemExpr} : null;
        if (list == null) {
          return null;
        }
        return list
            .map((nestedItem) => ${nestedExpr})
            .where((value) => value != null)
            .map((value) => value as ${nestedType})
            .toList();
      })()`;
        }
        if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
            const valueType = getDartType(schema.additionalProperties, DART_CONFIG);
            const nestedExpr = this.deserializeArrayItemExpression(schema.additionalProperties, 'nestedItem');
            return `(() {
        final map = sdkworkResponseAsMap(${itemExpr});
        if (map == null) {
          return null;
        }
        return map.map((key, nestedItem) => MapEntry(key, ${nestedExpr} as ${valueType}));
      })()`;
        }
        if (schema?.type === 'string') {
            return `${itemExpr}?.toString()`;
        }
        if (schema?.type === 'integer') {
            return `${itemExpr} is int ? ${itemExpr} : null`;
        }
        if (schema?.type === 'number') {
            return `${itemExpr} is num ? ${itemExpr}.toDouble() : null`;
        }
        if (schema?.type === 'boolean') {
            return `${itemExpr} is bool ? ${itemExpr} : null`;
        }
        if (schema?.type === 'object' || schema?.properties) {
            return `sdkworkResponseAsMap(${itemExpr})`;
        }
        return itemExpr;
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
            return DART_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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
        return `${actionMap[method] || method}${DART_CONFIG.namingConventions.modelName(resource)}`;
    }
    extractPathParams(path) {
        const matches = path.match(/\{([^}]+)\}/g) || [];
        return matches.map((match) => match.replace(/[{}]/g, ''));
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

  static String ${DART_CONFIG.namingConventions.methodName(config.sdkType)}Path([String path = '']) {
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
            language: 'dart',
            description: 'API path utilities',
        };
    }
    generateResponseHelpers() {
        return {
            path: 'lib/src/api/response_helpers.dart',
            content: this.format(`Map<String, dynamic>? sdkworkResponseAsMap(dynamic value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  return null;
}
`),
            language: 'dart',
            description: 'API response normalization helpers',
        };
    }
    generateApiIndex(tags, resolvedTagNames) {
        const exports = tags.map((tag) => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const fileName = DART_CONFIG.namingConventions.fileName(resolvedTagName);
            return `export '${fileName}.dart';`;
        }).join('\n');
        return {
            path: 'lib/src/api/api.dart',
            content: this.format(`export 'paths.dart';
${exports}
`),
            language: 'dart',
            description: 'API module exports',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
