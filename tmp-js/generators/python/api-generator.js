import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import { normalizeOperationId, resolveScopedMethodNames, resolveSimplifiedTagNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { supportsRequestBodyByDefault, toHttpMethodLiteral } from '../../framework/http-methods.js';
import { collectSchemaReferences, resolveMediaTypeSchema } from '../../framework/schema.js';
import { PYTHON_CONFIG, getPythonPackageRoot, getPythonType } from './config.js';
import { extractOpenApiParameterContentSchema, requiresExplicitOpenApiQuerySerialization, resolveOpenApiParameterSerialization, } from '../../framework/parameter-serialization.js';
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
        const needsRequestHeaderHelpers = operations.some((op) => {
            const allParameters = op.allParameters || op.parameters || [];
            return allParameters.some((param) => param?.in === 'header' || param?.in === 'cookie');
        });
        const needsQuerySerializationHelpers = operations.some((op) => {
            const allParameters = op.allParameters || op.parameters || [];
            return allParameters.some((param) => param?.in === 'query' && requiresExplicitOpenApiQuerySerialization(param));
        });
        const modelImports = referencedModels.size > 0
            ? `from ..models import ${Array.from(referencedModels).sort((a, b) => a.localeCompare(b)).join(', ')}\n`
            : '';
        return {
            path: `${packageRoot}/api/${fileName}.py`,
            content: this.format(`from typing import Any, Dict, List, Optional
from ..http_client import HttpClient
${modelImports}
def _append_query_string(path: str, raw_query_string: str) -> str:
    query = raw_query_string.lstrip('?')
    if not query:
        return path
    separator = '&' if '?' in path else '?'
    return f"{path}{separator}{query}"

${needsQuerySerializationHelpers ? this.generateQuerySerializationHelpers() : ''}
${needsRequestHeaderHelpers ? this.generateRequestHeaderHelpers() : ''}

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
        const queryParams = allParameters.filter((param) => param?.in === 'query');
        const queryStringParams = allParameters.filter((param) => param?.in === 'querystring');
        const headerParams = allParameters.filter((param) => param?.in === 'header');
        const cookieParams = allParameters.filter((param) => param?.in === 'cookie');
        const hasQuery = queryParams.length > 0;
        const hasRawQueryString = queryStringParams.length > 0;
        const hasHeaders = headerParams.length > 0 || cookieParams.length > 0;
        const method = String(op.method || '').toLowerCase();
        const httpMethod = String(op.httpMethod || op.method || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const supportsRequestBody = supportsRequestBodyByDefault(method);
        const requestBodyInfo = supportsRequestBody ? this.extractRequestBodyInfo(op) : undefined;
        const hasBody = Boolean(requestBodyInfo);
        const requestBodyRequired = hasBody && Boolean(op.requestBody?.required);
        const requestBodySchema = requestBodyInfo?.schema;
        const requestBodyMediaType = (requestBodyInfo?.mediaType || '').toLowerCase();
        const useDataArgument = requestBodyMediaType === 'multipart/form-data'
            || requestBodyMediaType === 'application/x-www-form-urlencoded';
        const isFormUrlencodedBody = requestBodyMediaType === 'application/x-www-form-urlencoded';
        const requestType = requestBodySchema
            ? getPythonType(requestBodySchema, PYTHON_CONFIG)
            : 'Any';
        const hasExplicitQuerySerialization = queryParams.some((param) => requiresExplicitOpenApiQuerySerialization(param));
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
            hasRawQueryString ? 'raw_query_string' : '',
            hasHeaders ? 'request_headers' : '',
        ]);
        const pathParams = rawPathParams.map((rawName) => ({
            rawName,
            safeName: pathParamNames.get(rawName) || rawName,
        }));
        const parameterReservedNames = [
            ...pathParams.map((param) => param.safeName),
            hasBody ? 'body' : '',
            hasQuery ? 'params' : '',
            hasRawQueryString ? 'raw_query_string' : '',
            hasHeaders ? 'request_headers' : '',
        ];
        const queryBindings = hasExplicitQuerySerialization
            ? this.createQueryParameterBindings(queryParams, knownModels, parameterReservedNames)
            : [];
        const headerBindings = this.createNamedParameterBindings(headerParams, knownModels, parameterReservedNames);
        const cookieBindings = this.createNamedParameterBindings(cookieParams, knownModels, [
            ...parameterReservedNames,
            ...queryBindings.map((binding) => binding.safeName),
            ...headerBindings.map((binding) => binding.safeName),
        ]);
        const requiredQueryBindings = queryBindings.filter((binding) => binding.required);
        const optionalQueryBindings = queryBindings.filter((binding) => !binding.required);
        const requiredHeaderBindings = [...headerBindings, ...cookieBindings].filter((binding) => binding.required);
        const optionalHeaderBindings = [...headerBindings, ...cookieBindings].filter((binding) => !binding.required);
        const params = ['self'];
        if (pathParams.length) {
            params.push(...pathParams.map((param) => `${param.safeName}: str`));
        }
        if (hasBody && requestBodyRequired) {
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
        if (hasRawQueryString) {
            params.push('raw_query_string: str');
        }
        params.push(...requiredQueryBindings.map((binding) => this.renderMethodParameter(binding)));
        params.push(...requiredHeaderBindings.map((binding) => this.renderMethodParameter(binding)));
        if (hasBody && !requestBodyRequired) {
            if (requestType === 'Any') {
                params.push('body: Any = None');
            }
            else {
                params.push(`body: Optional[${requestType}] = None`);
            }
        }
        if (hasQuery && !hasExplicitQuerySerialization) {
            params.push('params: Optional[Dict[str, Any]] = None');
        }
        params.push(...optionalQueryBindings.map((binding) => this.renderMethodParameter(binding)));
        params.push(...optionalHeaderBindings.map((binding) => this.renderMethodParameter(binding)));
        const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
        const rawPath = this.withApiPrefix(config.apiPrefix, normalizedOperationPath);
        const pathTemplate = rawPath.replace(/\{([^}]+)\}/g, (_match, paramName) => {
            const safeName = pathParamNames.get(paramName) || PYTHON_CONFIG.namingConventions.propertyName(paramName);
            return `{${safeName}}`;
        });
        const pathExpression = hasRawQueryString
            ? `_append_query_string(f"${pathTemplate}", raw_query_string)`
            : hasExplicitQuerySerialization
                ? `_append_query_string(f"${pathTemplate}", query)`
                : `f"${pathTemplate}"`;
        const formHeaderLine = isFormUrlencodedBody
            ? `        form_headers = {**(${hasHeaders ? 'request_headers' : '{}'} or {}), 'Content-Type': 'application/x-www-form-urlencoded'}\n`
            : '';
        const headersArg = isFormUrlencodedBody
            ? ', headers=form_headers'
            : hasHeaders
                ? ', headers=request_headers'
                : '';
        let call = '';
        switch (method) {
            case 'get':
                call = `self._client.get(${pathExpression}${hasQuery && !hasExplicitQuerySerialization ? ', params=params' : ''}${hasHeaders ? ', headers=request_headers' : ''})`;
                break;
            case 'post':
                call = `self._client.post(${pathExpression}${hasBody ? (useDataArgument ? ', data=body' : ', json=body') : ''}${hasQuery && !hasExplicitQuerySerialization ? ', params=params' : ''}${headersArg})`;
                break;
            case 'put':
                call = `self._client.put(${pathExpression}${hasBody ? (useDataArgument ? ', data=body' : ', json=body') : ''}${hasQuery && !hasExplicitQuerySerialization ? ', params=params' : ''}${headersArg})`;
                break;
            case 'delete':
                call = `self._client.delete(${pathExpression}${hasQuery && !hasExplicitQuerySerialization ? ', params=params' : ''}${hasHeaders ? ', headers=request_headers' : ''})`;
                break;
            case 'patch':
                call = `self._client.patch(${pathExpression}${hasBody ? (useDataArgument ? ', data=body' : ', json=body') : ''}${hasQuery && !hasExplicitQuerySerialization ? ', params=params' : ''}${headersArg})`;
                break;
            default:
                call = `self._client.request('${toHttpMethodLiteral(httpMethod)}', ${pathExpression}${hasQuery && !hasExplicitQuerySerialization ? ', params=params' : ''}${hasBody ? (useDataArgument ? ', data=body' : ', json=body') : ''}${headersArg})`;
        }
        const docComment = op.summary
            ? `        """${op.summary}"""\n`
            : '';
        const queryBlock = hasExplicitQuerySerialization
            ? `        query = build_query_string([
${this.renderQueryParameterSpecs(queryBindings, 12)}
        ])\n`
            : '';
        const requestHeaderBlock = hasHeaders
            ? `        request_headers = build_request_headers(
${this.renderNamedParameterDict(headerBindings, 12)},
${this.renderNamedParameterDict(cookieBindings, 12)}
        )\n`
            : '';
        return {
            content: `    def ${methodName}(${params.join(', ')}) -> ${responseType}:
${docComment}${queryBlock}${requestHeaderBlock}${formHeaderLine}        return ${call}`,
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
    createNamedParameterBindings(parameters, knownModels, reservedNames) {
        const keys = parameters.map((parameter, index) => `${parameter?.in || 'parameter'}:${parameter?.name || 'value'}:${index}`);
        const rawNameByKey = new Map(keys.map((key, index) => [key, String(parameters[index]?.name || `value${index + 1}`)]));
        const safeNameByKey = createUniqueIdentifierMap(keys, (key) => PYTHON_CONFIG.namingConventions.propertyName(rawNameByKey.get(key) || 'value'), reservedNames);
        return parameters.map((parameter, index) => {
            const key = keys[index];
            return {
                parameter,
                safeName: safeNameByKey.get(key) || `value_${index + 1}`,
                required: Boolean(parameter?.required),
                type: this.getNamedParameterType(parameter, knownModels),
            };
        });
    }
    getNamedParameterType(parameter, knownModels) {
        const contentSchema = extractOpenApiParameterContentSchema(parameter);
        if (contentSchema) {
            return getPythonType(contentSchema, PYTHON_CONFIG);
        }
        if (!parameter?.schema) {
            return 'Any';
        }
        return getPythonType(parameter.schema, PYTHON_CONFIG);
    }
    renderMethodParameter(binding) {
        return binding.required
            ? `${binding.safeName}: ${binding.type}`
            : `${binding.safeName}: Optional[${binding.type}] = None`;
    }
    renderNamedParameterDict(bindings, indentation) {
        const indent = ' '.repeat(indentation);
        if (bindings.length === 0) {
            return `${indent}{}`;
        }
        const lines = bindings.map((binding) => {
            return `${indent}    ${this.formatPythonString(String(binding.parameter?.name || binding.safeName))}: ${binding.safeName},`;
        });
        return [`${indent}{`, ...lines, `${indent}}`].join('\n');
    }
    formatPythonString(value) {
        return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    }
    renderQueryParameterSpecs(bindings, indentation) {
        const indent = ' '.repeat(indentation);
        return bindings.map((binding) => {
            const parts = [
                `'name': ${this.formatPythonString(String(binding.parameter?.name || binding.safeName))}`,
                `'value': ${binding.safeName}`,
                `'style': ${this.formatPythonString(binding.style)}`,
                `'explode': ${binding.explode ? 'True' : 'False'}`,
                `'allow_reserved': ${binding.allowReserved ? 'True' : 'False'}`,
            ];
            if (binding.contentType) {
                parts.push(`'content_type': ${this.formatPythonString(binding.contentType)}`);
            }
            return `${indent}{${parts.join(', ')}},`;
        }).join('\n');
    }
    generateQuerySerializationHelpers() {
        return `def build_query_string(parameters: List[Dict[str, Any]]) -> str:
    pairs: List[str] = []
    for parameter in parameters:
        append_serialized_parameter(pairs, parameter)
    return '&'.join(pairs)


def append_serialized_parameter(pairs: List[str], parameter: Dict[str, Any]) -> None:
    value = parameter.get('value')
    if value is None:
        return

    name = str(parameter.get('name') or '')
    allow_reserved = bool(parameter.get('allow_reserved'))
    content_type = parameter.get('content_type')
    if content_type:
        import json

        pairs.append(f"{encode_query_component(name)}={encode_query_value(json.dumps(value, separators=(',', ':')), allow_reserved)}")
        return

    style = str(parameter.get('style') or 'form')
    explode = bool(parameter.get('explode'))
    if style == 'deepObject':
        append_deep_object_parameter(pairs, name, value, allow_reserved)
        return
    if isinstance(value, (list, tuple)):
        append_array_parameter(pairs, name, value, style, explode, allow_reserved)
        return
    if isinstance(value, dict):
        append_object_parameter(pairs, name, value, style, explode, allow_reserved)
        return

    pairs.append(f"{encode_query_component(name)}={encode_query_value(serialize_primitive(value), allow_reserved)}")


def append_array_parameter(
    pairs: List[str],
    name: str,
    value: Any,
    style: str,
    explode: bool,
    allow_reserved: bool,
) -> None:
    values = [serialize_primitive(item) for item in value if item is not None]
    if not values:
        return

    if style == 'form' and explode:
        for item in values:
            pairs.append(f"{encode_query_component(name)}={encode_query_value(item, allow_reserved)}")
        return

    pairs.append(f"{encode_query_component(name)}={encode_query_value(','.join(values), allow_reserved)}")


def append_object_parameter(
    pairs: List[str],
    name: str,
    value: Dict[str, Any],
    style: str,
    explode: bool,
    allow_reserved: bool,
) -> None:
    entries = [(key, entry_value) for key, entry_value in value.items() if entry_value is not None]
    if not entries:
        return

    if style == 'form' and explode:
        for key, entry_value in entries:
            pairs.append(f"{encode_query_component(str(key))}={encode_query_value(serialize_primitive(entry_value), allow_reserved)}")
        return

    serialized = ','.join(
        item
        for key, entry_value in entries
        for item in (str(key), serialize_primitive(entry_value))
    )
    pairs.append(f"{encode_query_component(name)}={encode_query_value(serialized, allow_reserved)}")


def append_deep_object_parameter(pairs: List[str], name: str, value: Any, allow_reserved: bool) -> None:
    if not isinstance(value, dict):
        pairs.append(f"{encode_query_component(name)}={encode_query_value(serialize_primitive(value), allow_reserved)}")
        return

    for key, entry_value in value.items():
        if entry_value is None:
            continue
        pairs.append(f"{encode_query_component(f'{name}[{key}]')}={encode_query_value(serialize_primitive(entry_value), allow_reserved)}")


def serialize_primitive(value: Any) -> str:
    if isinstance(value, dict):
        import json

        return json.dumps(value, separators=(',', ':'))
    return str(value)


def encode_query_component(value: str) -> str:
    from urllib.parse import quote

    return quote(value, safe='')


def encode_query_value(value: str, allow_reserved: bool) -> str:
    from urllib.parse import quote

    return quote(value, safe=':/?#[]@!$&\\'()*+,;=' if allow_reserved else '')
`;
    }
    generateRequestHeaderHelpers() {
        return `def build_request_headers(headers: Dict[str, Any], cookies: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, str]]:
    request_headers: Dict[str, str] = {}
    for name, value in headers.items():
        serialized = serialize_parameter_value(value)
        if serialized is not None:
            request_headers[name] = serialized

    cookie_header = build_cookie_header(cookies or {})
    if cookie_header:
        request_headers['Cookie'] = (
            f"{request_headers['Cookie']}; {cookie_header}"
            if 'Cookie' in request_headers
            else cookie_header
        )

    return request_headers or None


def build_cookie_header(cookies: Dict[str, Any]) -> Optional[str]:
    from urllib.parse import quote

    pairs: List[str] = []
    for name, value in cookies.items():
        serialized = serialize_parameter_value(value)
        if serialized is not None:
            pairs.append(f"{quote(str(name), safe='')}={quote(serialized, safe='')}")
    return '; '.join(pairs) if pairs else None


def serialize_parameter_value(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        return ','.join(
            item
            for item in (serialize_parameter_value(item) for item in value)
            if item is not None
        )
    if isinstance(value, dict):
        import json

        return json.dumps(value, separators=(',', ':'))
    return str(value)
`;
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
            options: 'options',
            head: 'head',
            trace: 'trace',
            query: 'query',
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
    collectReferencedModels(schema, knownModels, refs) {
        collectSchemaReferences(schema, PYTHON_CONFIG.namingConventions.modelName, knownModels, refs);
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
