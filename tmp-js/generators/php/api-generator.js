import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import { normalizeOperationId, resolveScopedMethodNames, resolveSimplifiedTagNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { PHP_CONFIG, getPhpNamespace, getPhpType } from './config.js';
export class ApiGenerator {
    generate(ctx, config) {
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const files = [this.generateBaseApi(config)];
        for (const tag of tags) {
            const group = ctx.apiGroups[tag];
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            files.push(this.generateApiFile(tag, resolvedTagName, group.operations, config));
        }
        return files;
    }
    generateBaseApi(config) {
        const baseNamespace = getPhpNamespace(config);
        return {
            path: 'src/Api/BaseApi.php',
            content: this.format(`<?php

declare(strict_types=1);

namespace ${baseNamespace}\\Api;

use ${baseNamespace}\\Http\\HttpClient;

abstract class BaseApi
{
    public function __construct(protected HttpClient $client)
    {
    }

    protected function interpolatePath(string $path, array $pathParams): string
    {
        foreach ($pathParams as $name => $value) {
            $path = str_replace('{' . $name . '}', rawurlencode((string) $value), $path);
        }

        return $path;
    }
}
`),
            language: 'php',
            description: 'Base API helpers',
        };
    }
    generateApiFile(tag, resolvedTagName, operations, config) {
        const baseNamespace = getPhpNamespace(config);
        const namespace = `${baseNamespace}\\Api`;
        const className = `${PHP_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
        const fileName = PHP_CONFIG.namingConventions.fileName(resolvedTagName);
        const scopedMethodNames = resolveScopedMethodNames(operations, (op) => this.generateOperationId(op.method, op.path, op, tag));
        const methodNames = new Map();
        const referencedModels = new Set();
        for (const op of operations) {
            const scopedName = scopedMethodNames.get(op) || 'operation';
            methodNames.set(op, PHP_CONFIG.namingConventions.methodName(scopedName));
            this.collectOperationModels(op, referencedModels);
        }
        const useStatements = Array.from(referencedModels)
            .sort((left, right) => left.localeCompare(right))
            .map((modelName) => `use ${baseNamespace}\\Models\\${modelName};`)
            .join('\n');
        const useBlock = useStatements ? `${useStatements}\n\n` : '';
        const methods = operations.map((op) => this.generateMethod(op, config, methodNames.get(op) || 'operation')).join('\n\n');
        return {
            path: `src/Api/${fileName}.php`,
            content: this.format(`<?php

declare(strict_types=1);

namespace ${namespace};

${useBlock}final class ${className} extends BaseApi
{
${methods}
}
`),
            language: 'php',
            description: `${tag} API module`,
        };
    }
    generateMethod(op, config, methodName) {
        const rawPathParams = this.extractPathParams(op.path);
        const allParameters = op.allParameters || op.parameters || [];
        const hasQuery = allParameters.some((param) => param?.in === 'query');
        const hasHeaders = allParameters.some((param) => param?.in === 'header' || param?.in === 'cookie');
        const requestBodyInfo = this.extractRequestBodyInfo(op);
        const hasBody = Boolean(requestBodyInfo);
        const requestBodySchema = requestBodyInfo?.schema;
        const requestBodyRequired = Boolean(hasBody && op?.requestBody?.required);
        const requestBodyMediaType = (requestBodyInfo?.mediaType || '').toLowerCase();
        const responseSchema = this.extractResponseSchema(op);
        const returnType = this.resolveReturnType(op, responseSchema);
        const params = [];
        const pathParamNames = createUniqueIdentifierMap(rawPathParams, (value) => PHP_CONFIG.namingConventions.propertyName(value), [
            hasBody ? 'body' : '',
            hasQuery ? 'params' : '',
            hasHeaders ? 'headers' : '',
            'path',
            hasBody ? 'payload' : '',
        ]);
        const pathParams = rawPathParams.map((rawName) => ({
            rawName,
            safeName: pathParamNames.get(rawName) || rawName,
        }));
        for (const pathParam of pathParams) {
            params.push(`string $${pathParam.safeName}`);
        }
        if (hasBody) {
            params.push(this.resolveBodyParameterSignature(requestBodySchema, requestBodyRequired));
        }
        if (hasQuery) {
            params.push('array $params = []');
        }
        if (hasHeaders) {
            params.push('array $headers = []');
        }
        const normalizedPath = this.normalizeOperationPath(op.path, config.apiPrefix);
        const requestPath = this.withApiPrefix(config.apiPrefix, normalizedPath);
        const pathLine = pathParams.length > 0
            ? `        $path = $this->interpolatePath('${escapePhpString(requestPath)}', [${pathParams.map((param) => `'${param.rawName}' => $${param.safeName}`).join(', ')}]);`
            : `        $path = '${escapePhpString(requestPath)}';`;
        const payloadLine = hasBody
            ? `        $payload = ${this.serializeRequestBodyExpression(requestBodySchema, '$body')};`
            : '';
        const requestOptions = this.buildRequestOptions(hasQuery, hasHeaders, hasBody, requestBodyMediaType);
        const requestMethod = String(op.method || 'get').toUpperCase();
        const requestLine = returnType === 'void'
            ? `        $this->client->request('${requestMethod}', $path, ${requestOptions});`
            : `        $result = $this->client->request('${requestMethod}', $path, ${requestOptions});`;
        const returnLine = returnType === 'void'
            ? '        return;'
            : `        return ${this.deserializeResponseExpression(responseSchema, '$result')};`;
        const docComment = op.summary
            ? `    /** ${sanitizeDocComment(op.summary)} */\n`
            : '';
        return `${docComment}    public function ${methodName}(${params.join(', ')}): ${returnType}
    {
${pathLine}
${payloadLine ? `${payloadLine}\n` : ''}${requestLine}
${returnLine}
    }`;
    }
    resolveBodyParameterSignature(schema, required) {
        if (schema?.$ref) {
            const modelName = PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            return required ? `array|${modelName} $body` : `array|${modelName}|null $body = null`;
        }
        const type = getPhpType(schema, PHP_CONFIG);
        if (type === 'array') {
            return required ? 'array $body' : '?array $body = null';
        }
        if (isTypedPhpScalar(type)) {
            return required ? `${type} $body` : `?${type} $body = null`;
        }
        return required ? 'mixed $body' : 'mixed $body = null';
    }
    resolveReturnType(op, responseSchema) {
        if (!responseSchema) {
            return this.isVoidResponse(op) ? 'void' : 'mixed';
        }
        if (responseSchema.$ref) {
            return `?${PHP_CONFIG.namingConventions.modelName(responseSchema.$ref.split('/').pop() || 'Model')}`;
        }
        const baseType = getPhpType(responseSchema, PHP_CONFIG);
        if (baseType === 'array') {
            return 'array';
        }
        if (isTypedPhpScalar(baseType)) {
            return baseType;
        }
        if (baseType === 'mixed') {
            return this.isVoidResponse(op) ? 'void' : 'mixed';
        }
        return 'mixed';
    }
    serializeRequestBodyExpression(schema, bodyExpr) {
        if (!schema || typeof schema !== 'object') {
            return bodyExpr;
        }
        if (schema.$ref) {
            const modelName = PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            return `${bodyExpr} instanceof ${modelName} ? ${bodyExpr}->toArray() : ${bodyExpr}`;
        }
        if (schema.items) {
            const itemExpr = this.serializeArrayItemExpression(schema.items, '$item');
            return `is_array(${bodyExpr})
            ? array_values(array_map(static fn($item) => ${itemExpr}, ${bodyExpr}))
            : ${bodyExpr}`;
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const entryExpr = this.serializeArrayItemExpression(schema.additionalProperties, '$item');
            return `is_array(${bodyExpr})
            ? array_map(static fn($item) => ${entryExpr}, ${bodyExpr})
            : ${bodyExpr}`;
        }
        return bodyExpr;
    }
    serializeArrayItemExpression(schema, itemExpr) {
        if (schema?.$ref) {
            const modelName = PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            return `${itemExpr} instanceof ${modelName} ? ${itemExpr}->toArray() : ${itemExpr}`;
        }
        if (schema?.items) {
            const nestedExpr = this.serializeArrayItemExpression(schema.items, '$nestedItem');
            return `is_array(${itemExpr})
                        ? array_values(array_map(static fn($nestedItem) => ${nestedExpr}, ${itemExpr}))
                        : []`;
        }
        if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
            const mapExpr = this.serializeArrayItemExpression(schema.additionalProperties, '$nestedItem');
            return `is_array(${itemExpr})
                        ? array_map(static fn($nestedItem) => ${mapExpr}, ${itemExpr})
                        : []`;
        }
        return itemExpr;
    }
    deserializeResponseExpression(schema, resultExpr) {
        if (!schema || typeof schema !== 'object') {
            return resultExpr;
        }
        if (schema.$ref) {
            const modelName = PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            return `is_array(${resultExpr}) ? ${modelName}::fromArray(${resultExpr}) : null`;
        }
        if (schema.items) {
            const itemExpr = this.deserializeArrayItemExpression(schema.items, '$item');
            return `is_array(${resultExpr})
            ? array_values(array_map(static fn($item) => ${itemExpr}, ${resultExpr}))
            : []`;
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const entryExpr = this.deserializeArrayItemExpression(schema.additionalProperties, '$item');
            return `is_array(${resultExpr})
            ? array_map(static fn($item) => ${entryExpr}, ${resultExpr})
            : []`;
        }
        if (getPhpType(schema, PHP_CONFIG) === 'array') {
            return `is_array(${resultExpr}) ? ${resultExpr} : []`;
        }
        return resultExpr;
    }
    deserializeArrayItemExpression(schema, itemExpr) {
        if (schema?.$ref) {
            const modelName = PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            return `is_array(${itemExpr}) ? ${modelName}::fromArray(${itemExpr}) : ${itemExpr}`;
        }
        if (schema?.items) {
            const nestedExpr = this.deserializeArrayItemExpression(schema.items, '$nestedItem');
            return `is_array(${itemExpr})
                        ? array_values(array_map(static fn($nestedItem) => ${nestedExpr}, ${itemExpr}))
                        : []`;
        }
        if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
            const mapExpr = this.deserializeArrayItemExpression(schema.additionalProperties, '$nestedItem');
            return `is_array(${itemExpr})
                        ? array_map(static fn($nestedItem) => ${mapExpr}, ${itemExpr})
                        : []`;
        }
        if (getPhpType(schema, PHP_CONFIG) === 'array') {
            return `is_array(${itemExpr}) ? ${itemExpr} : []`;
        }
        return itemExpr;
    }
    buildRequestOptions(hasQuery, hasHeaders, hasBody, requestBodyMediaType) {
        const lines = [];
        if (hasQuery) {
            lines.push(`'query' => $params,`);
        }
        if (hasHeaders) {
            lines.push(`'headers' => $headers,`);
        }
        if (hasBody) {
            if (requestBodyMediaType === 'multipart/form-data') {
                lines.push(`'multipart' => $payload,`);
            }
            else if (requestBodyMediaType === 'application/x-www-form-urlencoded') {
                lines.push(`'form_params' => $payload,`);
            }
            else {
                lines.push(`'json' => $payload,`);
            }
        }
        if (lines.length === 0) {
            return '[]';
        }
        return `[
${lines.map((line) => `            ${line}`).join('\n')}
        ]`;
    }
    collectOperationModels(op, models) {
        const requestBodySchema = this.extractRequestBodyInfo(op)?.schema;
        const responseSchema = this.extractResponseSchema(op);
        this.collectSchemaModels(requestBodySchema, models);
        this.collectSchemaModels(responseSchema, models);
    }
    collectSchemaModels(schema, models) {
        if (!schema || typeof schema !== 'object') {
            return;
        }
        if (schema.$ref) {
            models.add(PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model'));
            return;
        }
        for (const key of ['oneOf', 'anyOf', 'allOf']) {
            if (Array.isArray(schema[key])) {
                schema[key].forEach((entry) => this.collectSchemaModels(entry, models));
            }
        }
        if (schema.items) {
            this.collectSchemaModels(schema.items, models);
        }
        if (schema.properties && typeof schema.properties === 'object') {
            Object.values(schema.properties).forEach((entry) => this.collectSchemaModels(entry, models));
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            this.collectSchemaModels(schema.additionalProperties, models);
        }
    }
    generateOperationId(method, path, op, tag) {
        if (op.operationId) {
            const normalized = normalizeOperationId(op.operationId);
            return PHP_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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
        return `${actionMap[method] || method}_${resource}`;
    }
    extractPathParams(path) {
        return (path.match(/\{([^}]+)\}/g) || []).map((match) => match.replace(/[{}]/g, ''));
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
        return mediaTypes.find((mediaType) => mediaType.toLowerCase().endsWith('+json')) || mediaTypes[0];
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
        return mediaTypes.find((mediaType) => {
            const normalized = mediaType.toLowerCase();
            return normalized === 'application/json' || normalized.endsWith('+json');
        }) || mediaTypes[0];
    }
    isVoidResponse(op) {
        const responses = op?.responses;
        if (!responses || typeof responses !== 'object') {
            return false;
        }
        const statusCodes = Object.keys(responses);
        if (statusCodes.length === 0) {
            return true;
        }
        return statusCodes.every((code) => {
            const content = responses[code]?.content;
            return !content || typeof content !== 'object' || Object.keys(content).length === 0;
        });
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
    format(content) {
        return `${content.trim()}\n`;
    }
}
function escapePhpString(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function sanitizeDocComment(value) {
    return String(value || '').replace(/\*\//g, '* /').trim();
}
function isTypedPhpScalar(type) {
    return type === 'string'
        || type === 'int'
        || type === 'float'
        || type === 'bool';
}
