import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import { normalizeOperationId, resolveScopedMethodNames, resolveSimplifiedTagNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { RUST_CONFIG, getRustType } from './config.js';
const RUST_RESERVED_WORDS = new Set([
    'as',
    'break',
    'const',
    'continue',
    'crate',
    'else',
    'enum',
    'extern',
    'false',
    'fn',
    'for',
    'if',
    'impl',
    'in',
    'let',
    'loop',
    'match',
    'mod',
    'move',
    'mut',
    'pub',
    'ref',
    'return',
    'Self',
    'self',
    'static',
    'struct',
    'super',
    'trait',
    'true',
    'type',
    'unsafe',
    'use',
    'where',
    'while',
    'async',
    'await',
    'dyn',
]);
export class ApiGenerator {
    generate(ctx, config) {
        const files = [];
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => RUST_CONFIG.namingConventions.modelName(schemaName)));
        for (const tag of tags) {
            const group = ctx.apiGroups[tag];
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            files.push(this.generateApiFile(tag, resolvedTagName, group.operations, config, knownModels));
        }
        files.push(this.generateBaseApi(config));
        files.push(this.generatePaths(config));
        files.push(this.generateApiIndex(tags, resolvedTagNames, config));
        return files;
    }
    generateApiFile(tag, resolvedTagName, operations, config, knownModels) {
        const structName = `${RUST_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
        const moduleName = RUST_CONFIG.namingConventions.fileName(resolvedTagName);
        const methodNames = resolveScopedMethodNames(operations, (op) => this.generateOperationId(op.method, op.path, op, tag));
        const referencedModels = new Set();
        const typeImports = new Set();
        const methods = operations.map((op) => {
            const allParameters = op.allParameters || op.parameters || [];
            if (allParameters.some((param) => param?.in === 'query')) {
                typeImports.add('QueryParams');
            }
            if (allParameters.some((param) => param?.in === 'header' || param?.in === 'cookie')) {
                typeImports.add('RequestHeaders');
            }
            const generated = this.generateMethod(op, config, methodNames.get(op) || 'operation', knownModels);
            generated.referencedModels.forEach((modelName) => referencedModels.add(modelName));
            return generated.content;
        }).join('\n\n');
        const modelImports = referencedModels.size > 0
            ? `use crate::models::{${Array.from(referencedModels).sort().join(', ')}};\n`
            : '';
        const pathFunction = this.resolvePathFunctionName(config);
        return {
            path: `src/api/${moduleName}.rs`,
            content: this.format(`use std::sync::Arc;

${typeImports.size > 0 ? `use crate::api::base::{${Array.from(typeImports).sort().join(', ')}};\n` : ''}use crate::api::paths::${pathFunction};
use crate::http::{SdkworkError, SdkworkHttpClient};
${modelImports}
#[derive(Clone)]
pub struct ${structName} {
    client: Arc<SdkworkHttpClient>,
}

impl ${structName} {
    pub fn new(client: Arc<SdkworkHttpClient>) -> Self {
        Self { client }
    }

${this.indent(methods, 4)}
}`),
            language: 'rust',
            description: `${tag} Rust API module`,
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
        const requestBodySchema = requestBodyInfo?.schema;
        const hasBody = Boolean(requestBodySchema);
        const requestBodyRequired = hasBody && Boolean(op.requestBody?.required);
        const responseSchema = this.extractResponseSchema(op);
        const responseType = responseSchema
            ? getRustType(responseSchema, RUST_CONFIG)
            : this.inferFallbackResponseType(op);
        const referencedModels = new Set();
        if (requestBodySchema) {
            this.collectReferencedModels(requestBodySchema, knownModels, referencedModels);
        }
        if (responseSchema) {
            this.collectReferencedModels(responseSchema, knownModels, referencedModels);
        }
        const pathParamNames = createUniqueIdentifierMap(rawPathParams, (value) => sanitizeRustIdentifier(value), [
            hasBody ? 'body' : '',
            hasQuery ? 'query' : '',
            hasHeaders ? 'headers' : '',
        ]);
        const pathParams = rawPathParams.map((rawName) => ({
            rawName,
            safeName: pathParamNames.get(rawName) || sanitizeRustIdentifier(rawName),
        }));
        const signatureParams = [];
        const formatArgs = [];
        for (const pathParam of pathParams) {
            signatureParams.push(`${pathParam.safeName}: &str`);
            formatArgs.push(pathParam.safeName);
        }
        if (hasBody) {
            const requestType = getRustType(requestBodySchema, RUST_CONFIG);
            signatureParams.push(requestBodyRequired ? `body: &${requestType}` : `body: Option<&${requestType}>`);
        }
        if (hasQuery) {
            signatureParams.push('query: Option<&QueryParams>');
        }
        if (hasHeaders) {
            signatureParams.push('headers: Option<&RequestHeaders>');
        }
        const normalizedMethodName = sanitizeRustIdentifier(methodName);
        const normalizedPath = this.normalizeOperationPath(op.path, config.apiPrefix);
        const pathExpression = pathParams.length > 0
            ? `format!("${normalizedPath.replace(/\{([^}]+)\}/g, '{}')}", ${formatArgs.join(', ')})`
            : `"${normalizedPath}".to_string()`;
        const queryArg = hasQuery ? 'query' : 'None';
        const headersArg = hasHeaders ? 'headers' : 'None';
        const contentTypeArg = requestBodyInfo?.mediaType
            ? `Some("${requestBodyInfo.mediaType.toLowerCase()}")`
            : 'None';
        let clientCall = '';
        switch (method) {
            case 'get':
                clientCall = `self.client.get(&path, ${queryArg}, ${headersArg}).await`;
                break;
            case 'post':
                clientCall = `self.client.post(&path, ${hasBody ? (requestBodyRequired ? 'Some(body)' : 'body') : 'Option::<&serde_json::Value>::None'}, ${queryArg}, ${headersArg}, ${contentTypeArg}).await`;
                break;
            case 'put':
                clientCall = `self.client.put(&path, ${hasBody ? (requestBodyRequired ? 'Some(body)' : 'body') : 'Option::<&serde_json::Value>::None'}, ${queryArg}, ${headersArg}, ${contentTypeArg}).await`;
                break;
            case 'patch':
                clientCall = `self.client.patch(&path, ${hasBody ? (requestBodyRequired ? 'Some(body)' : 'body') : 'Option::<&serde_json::Value>::None'}, ${queryArg}, ${headersArg}, ${contentTypeArg}).await`;
                break;
            case 'delete':
                clientCall = `self.client.delete(&path, ${queryArg}, ${headersArg}).await`;
                break;
            default:
                clientCall = `self.client.get(&path, ${queryArg}, ${headersArg}).await`;
                break;
        }
        const docComment = op.summary
            ? `/// ${String(op.summary).trim()}\n`
            : '';
        const params = signatureParams.length > 0 ? `, ${signatureParams.join(', ')}` : '';
        return {
            content: `${docComment}pub async fn ${normalizedMethodName}(&self${params}) -> Result<${responseType}, SdkworkError> {
    let path = ${this.resolvePathFunctionName(config)}(&${pathExpression});
    ${clientCall}
}`,
            referencedModels,
        };
    }
    generateBaseApi(config) {
        return {
            path: 'src/api/base.rs',
            content: this.format(`pub use crate::http::{QueryParams, RequestHeaders};

/// Shared API aliases for ${config.name}.
pub type SharedQueryParams = QueryParams;
pub type SharedRequestHeaders = RequestHeaders;`),
            language: 'rust',
            description: 'Shared Rust API aliases',
        };
    }
    generatePaths(config) {
        const pathFunction = this.resolvePathFunctionName(config);
        return {
            path: 'src/api/paths.rs',
            content: this.format(`pub const API_PREFIX: &str = "${config.apiPrefix}";

pub fn ${pathFunction}(path: &str) -> String {
    if path.starts_with("http://") || path.starts_with("https://") {
        return path.to_string();
    }

    let normalized_prefix = normalize_prefix(API_PREFIX);
    let normalized_path = normalize_path(path);

    if normalized_prefix.is_empty() {
        return normalized_path;
    }
    if normalized_path == normalized_prefix || normalized_path.starts_with(&(normalized_prefix.clone() + "/")) {
        return normalized_path;
    }

    format!("{}{}", normalized_prefix, normalized_path)
}

fn normalize_prefix(prefix: &str) -> String {
    let trimmed = prefix.trim();
    if trimmed.is_empty() || trimmed == "/" {
        return String::new();
    }
    format!("/{}", trimmed.trim_matches('/'))
}

fn normalize_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return "/".to_string();
    }
    if trimmed.starts_with('/') {
        return trimmed.to_string();
    }
    format!("/{}", trimmed)
}`),
            language: 'rust',
            description: 'Rust API path utilities',
        };
    }
    generateApiIndex(tags, resolvedTagNames, config) {
        const lines = ['pub mod base;', 'pub mod paths;'];
        for (const tag of tags) {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const moduleName = RUST_CONFIG.namingConventions.fileName(resolvedTagName);
            const structName = `${RUST_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            lines.push(`pub mod ${moduleName};`);
            lines.push(`pub use ${moduleName}::${structName};`);
        }
        return {
            path: 'src/api/mod.rs',
            content: this.format(lines.join('\n')),
            language: 'rust',
            description: `Rust API exports for ${config.name}`,
        };
    }
    generateOperationId(method, path, op, tag) {
        if (op.operationId) {
            const normalized = normalizeOperationId(op.operationId);
            return toSnakeCase(stripTagPrefixFromOperationId(normalized, tag));
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
        return toSnakeCase(`${actionMap[method] || method}_${resource}`);
    }
    extractPathParams(path) {
        const matches = path.match(/\{([^}]+)\}/g) || [];
        return matches.map((match) => match.replace(/[{}]/g, ''));
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
            return 'serde_json::Value';
        }
        const statusCodes = Object.keys(responses);
        if (statusCodes.length === 0) {
            return 'serde_json::Value';
        }
        const allNoContent = statusCodes.every((code) => {
            const content = responses[code]?.content;
            return !content || typeof content !== 'object' || Object.keys(content).length === 0;
        });
        if (allNoContent || responses['204']) {
            return '()';
        }
        return 'serde_json::Value';
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
            const modelName = RUST_CONFIG.namingConventions.modelName(refName ?? '');
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
    resolvePathFunctionName(config) {
        return `${toSnakeCase(config.sdkType)}_path`;
    }
    indent(content, spaces) {
        const prefix = ' '.repeat(spaces);
        return content
            .split('\n')
            .map((line) => (line ? `${prefix}${line}` : line))
            .join('\n');
    }
    format(content) {
        return `${content.trim()}\n`;
    }
}
function toSnakeCase(value) {
    return String(value || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase();
}
function sanitizeRustIdentifier(value) {
    const normalized = toSnakeCase(value) || 'value';
    const safe = /^[0-9]/.test(normalized) ? `field_${normalized}` : normalized;
    return RUST_RESERVED_WORDS.has(safe) ? `r#${safe}` : safe;
}
