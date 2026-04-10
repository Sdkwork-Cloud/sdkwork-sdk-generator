import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import { normalizeOperationId, resolveScopedMethodNames, resolveSimplifiedTagNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { PYTHON_CONFIG, getPythonPackageRoot, getPythonType } from './config.js';
export class ApiGenerator {
    generate(ctx, config) {
        const files = [];
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const packageRoot = getPythonPackageRoot(config);
        const knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => PYTHON_CONFIG.namingConventions.modelName(schemaName)));
        for (const tag of tags) {
            const group = ctx.apiGroups[tag];
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            files.push(this.generateApiFile(tag, resolvedTagName, group.operations, config, packageRoot, knownModels));
        }
        files.push(this.generateApiIndex(tags, resolvedTagNames, packageRoot));
        return files;
    }
    generateApiFile(tag, resolvedTagName, operations, config, packageRoot, knownModels) {
        const className = `${PYTHON_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
        const fileName = PYTHON_CONFIG.namingConventions.fileName(resolvedTagName);
        const scopedMethodNames = resolveScopedMethodNames(operations, (op) => this.generateOperationId(op.method, op.path, op, tag));
        const methodNames = new Map();
        for (const op of operations) {
            const scopedName = scopedMethodNames.get(op) || 'operation';
            methodNames.set(op, PYTHON_CONFIG.namingConventions.methodName(scopedName));
        }
        const referencedModels = new Set();
        const methods = operations
            .map((op) => {
            const generated = this.generateMethod(op, config, methodNames.get(op) || 'operation', knownModels);
            generated.referencedModels.forEach((modelName) => referencedModels.add(modelName));
            return generated.content;
        })
            .join('\n\n');
        const modelImports = referencedModels.size > 0
            ? `from ..models import ${Array.from(referencedModels).sort((a, b) => a.localeCompare(b)).join(', ')}\n`
            : '';
        return {
            path: `${packageRoot}/api/${fileName}.py`,
            content: this.format(`from typing import Any, Dict, List, Optional
from ..http_client import HttpClient
${modelImports}
class ${className}:
    """${tag} API client."""
    
    def __init__(self, client: HttpClient):
        self._client = client

${methods}
`),
            language: 'python',
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
        const requestBodyMediaType = (requestBodyInfo?.mediaType || '').toLowerCase();
        const useDataArgument = requestBodyMediaType === 'multipart/form-data'
            || requestBodyMediaType === 'application/x-www-form-urlencoded';
        const requestType = requestBodySchema
            ? getPythonType(requestBodySchema, PYTHON_CONFIG)
            : 'Any';
        const responseSchema = this.extractResponseSchema(op);
        const responseType = responseSchema
            ? getPythonType(responseSchema, PYTHON_CONFIG)
            : this.inferFallbackResponseType(op);
        const referencedModels = new Set();
        if (requestBodySchema) {
            this.collectReferencedModels(requestBodySchema, knownModels, referencedModels);
        }
        if (responseSchema) {
            this.collectReferencedModels(responseSchema, knownModels, referencedModels);
        }
        const pathParamNames = createUniqueIdentifierMap(rawPathParams, (value) => PYTHON_CONFIG.namingConventions.propertyName(value), [
            hasBody ? 'body' : '',
            hasQuery ? 'params' : '',
            hasHeaders ? 'headers' : '',
        ]);
        const pathParams = rawPathParams.map((rawName) => ({
            rawName,
            safeName: pathParamNames.get(rawName) || rawName,
        }));
        const params = ['self'];
        if (pathParams.length) {
            params.push(...pathParams.map((param) => `${param.safeName}: str`));
        }
        if (hasBody) {
            if (requestBodyRequired) {
                params.push(`body: ${requestType}`);
            }
            else if (requestType === 'Any') {
                params.push('body: Any = None');
            }
            else {
                params.push(`body: Optional[${requestType}] = None`);
            }
        }
        if (hasQuery) {
            params.push('params: Optional[Dict[str, Any]] = None');
        }
        if (hasHeaders) {
            params.push('headers: Optional[Dict[str, str]] = None');
        }
        const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
        const rawPath = this.withApiPrefix(config.apiPrefix, normalizedOperationPath);
        const pathTemplate = rawPath.replace(/\{([^}]+)\}/g, (_match, paramName) => {
            const safeName = pathParamNames.get(paramName) || PYTHON_CONFIG.namingConventions.propertyName(paramName);
            return `{${safeName}}`;
        });
        let call = '';
        switch (method) {
            case 'get':
                call = `self._client.get(f"${pathTemplate}"${hasQuery ? ', params=params' : ''}${hasHeaders ? ', headers=headers' : ''})`;
                break;
            case 'post':
                call = `self._client.post(f"${pathTemplate}"${hasBody ? (useDataArgument ? ', data=body' : ', json=body') : ''}${hasQuery ? ', params=params' : ''}${hasHeaders ? ', headers=headers' : ''})`;
                break;
            case 'put':
                call = `self._client.put(f"${pathTemplate}"${hasBody ? (useDataArgument ? ', data=body' : ', json=body') : ''}${hasQuery ? ', params=params' : ''}${hasHeaders ? ', headers=headers' : ''})`;
                break;
            case 'delete':
                call = `self._client.delete(f"${pathTemplate}"${hasQuery ? ', params=params' : ''}${hasHeaders ? ', headers=headers' : ''})`;
                break;
            case 'patch':
                call = `self._client.patch(f"${pathTemplate}"${hasBody ? (useDataArgument ? ', data=body' : ', json=body') : ''}${hasQuery ? ', params=params' : ''}${hasHeaders ? ', headers=headers' : ''})`;
                break;
            default:
                call = `self._client.get(f"${pathTemplate}"${hasQuery ? ', params=params' : ''}${hasHeaders ? ', headers=headers' : ''})`;
        }
        const docComment = op.summary
            ? `        """${op.summary}"""\n`
            : '';
        return {
            content: `    def ${methodName}(${params.join(', ')}) -> ${responseType}:
${docComment}        return ${call}`,
            referencedModels,
        };
    }
    generateOperationId(method, path, op, tag) {
        if (op.operationId) {
            const normalized = normalizeOperationId(op.operationId);
            return PYTHON_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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
        return `${actionMap[method] || method}_${PYTHON_CONFIG.namingConventions.propertyName(resource)}`;
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
            return 'None';
        }
        return 'Any';
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
            const modelName = PYTHON_CONFIG.namingConventions.modelName(refName ?? '');
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
    generateApiIndex(tags, resolvedTagNames, packageRoot) {
        const imports = tags.map((tag) => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const className = `${PYTHON_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            const fileName = PYTHON_CONFIG.namingConventions.fileName(resolvedTagName);
            return `from .${fileName} import ${className}`;
        }).join('\n');
        const exports = tags.map((tag) => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            return `${PYTHON_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
        }).map((v) => `'${v}'`).join(', ');
        return {
            path: `${packageRoot}/api/__init__.py`,
            content: this.format(`${imports}

__all__ = [${exports}]
`),
            language: 'python',
            description: 'API module index',
        };
    }
    format(content) {
        return content.trim() + '\n';
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
    withApiPrefix(prefix, path) {
        const normalizedPrefixRaw = (prefix || '').trim();
        const normalizedPrefix = normalizedPrefixRaw ? `/${normalizedPrefixRaw.replace(/^\/+|\/+$/g, '')}` : '';
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        if (!normalizedPrefix || normalizedPrefix === '/') {
            return normalizedPath;
        }
        if (normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`)) {
            return normalizedPath;
        }
        return `${normalizedPrefix}${normalizedPath}`.replace(/\/{2,}/g, '/');
    }
}
