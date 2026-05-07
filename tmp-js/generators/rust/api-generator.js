import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import { normalizeOperationId, resolveScopedMethodNames, resolveSimplifiedTagNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { supportsRequestBodyByDefault, toHttpMethodLiteral } from '../../framework/http-methods.js';
import { collectSchemaReferences, resolveMediaTypeSchema } from '../../framework/schema.js';
import { extractOpenApiParameterContentSchema, requiresExplicitOpenApiQuerySerialization, resolveOpenApiParameterSerialization, } from '../../framework/parameter-serialization.js';
import { RUST_CONFIG, getRustType } from './config.js';
import { resolveRustApiNames, sanitizeRustRawIdentifier } from './identifiers.js';
export class ApiGenerator {
    generate(ctx, config) {
        const files = [];
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const apiNames = resolveRustApiNames(tags, resolvedTagNames);
        const knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => RUST_CONFIG.namingConventions.modelName(schemaName)));
        for (const tag of tags) {
            const group = ctx.apiGroups[tag];
            const apiName = apiNames.get(tag);
            if (!apiName) {
                continue;
            }
            files.push(this.generateApiFile(apiName, group.operations, config, knownModels));
        }
        files.push(this.generateBaseApi(config));
        files.push(this.generatePaths(config));
        files.push(this.generateApiIndex(tags, apiNames, config));
        return files;
    }
    generateApiFile(apiName, operations, config, knownModels) {
        const methodNames = resolveScopedMethodNames(operations, (op) => this.generateOperationId(op.method, op.path, op, apiName.tag));
        const referencedModels = new Set();
        const typeImports = new Set();
        const methods = operations.map((op) => {
            const allParameters = op.allParameters || op.parameters || [];
            const queryParameters = allParameters.filter((param) => param?.in === 'query');
            if (queryParameters.length > 0 && !queryParameters.some((param) => requiresExplicitOpenApiQuerySerialization(param))) {
                typeImports.add('QueryParams');
            }
            if (allParameters.some((param) => param?.in === 'header' || param?.in === 'cookie')) {
                typeImports.add('RequestHeaders');
            }
            const generated = this.generateMethod(op, config, methodNames.get(op) || 'operation', knownModels);
            generated.referencedModels.forEach((modelName) => referencedModels.add(modelName));
            return generated.content;
        }).join('\n\n');
        const needsRequestHeaderHelpers = operations.some((op) => {
            const allParameters = op.allParameters || op.parameters || [];
            return allParameters.some((param) => param?.in === 'header' || param?.in === 'cookie');
        });
        const needsQuerySerializationHelpers = operations.some((op) => {
            const allParameters = op.allParameters || op.parameters || [];
            return allParameters.some((param) => param?.in === 'query' && requiresExplicitOpenApiQuerySerialization(param));
        });
        const needsAppendQueryString = operations.some((op) => {
            const allParameters = op.allParameters || op.parameters || [];
            return allParameters.some((param) => param?.in === 'querystring')
                || allParameters.some((param) => param?.in === 'query' && requiresExplicitOpenApiQuerySerialization(param));
        });
        const needsCustomMethod = operations.some((op) => !['get', 'post', 'put', 'patch', 'delete'].includes(String(op.method || '').toLowerCase()));
        const modelImports = referencedModels.size > 0
            ? `use crate::models::{${Array.from(referencedModels).sort().join(', ')}};\n`
            : '';
        const pathFunction = this.resolvePathFunctionName(config);
        return {
            path: `src/api/${apiName.moduleName}.rs`,
            content: this.format(`use std::sync::Arc;

${needsCustomMethod ? 'use reqwest::Method;\n\n' : ''}${typeImports.size > 0 ? `use crate::api::base::{${Array.from(typeImports).sort().join(', ')}};\n` : ''}use crate::api::paths::${pathFunction};
${needsAppendQueryString ? 'use crate::api::paths::append_query_string;\n' : ''}use crate::http::{SdkworkError, SdkworkHttpClient};
${modelImports}
#[derive(Clone)]
pub struct ${apiName.structName} {
    client: Arc<SdkworkHttpClient>,
}

impl ${apiName.structName} {
    pub fn new(client: Arc<SdkworkHttpClient>) -> Self {
        Self { client }
    }

${this.indent(methods, 4)}

}
${needsRequestHeaderHelpers ? `\n${this.generateRequestHeaderHelpers()}` : ''}
${needsQuerySerializationHelpers ? `\n${this.generateQuerySerializationHelpers()}` : ''}`),
            language: 'rust',
            description: `${apiName.tag} Rust API module`,
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
        const httpMethod = String(op.httpMethod || op.method || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const supportsRequestBody = supportsRequestBodyByDefault(method);
        const requestBodyInfo = supportsRequestBody ? this.extractRequestBodyInfo(op) : undefined;
        const requestBodySchema = requestBodyInfo?.schema;
        const hasBody = Boolean(requestBodySchema);
        const hasExplicitQuerySerialization = queryParams.some((param) => requiresExplicitOpenApiQuerySerialization(param));
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
            hasRawQueryString ? 'raw_query_string' : '',
            hasHeaders ? 'headers' : '',
            hasHeaders ? 'request_headers' : '',
        ]);
        const pathParams = rawPathParams.map((rawName) => ({
            rawName,
            safeName: pathParamNames.get(rawName) || sanitizeRustIdentifier(rawName),
        }));
        const parameterReservedNames = [
            ...pathParams.map((param) => param.safeName),
            hasBody ? 'body' : '',
            hasQuery ? 'query' : '',
            hasRawQueryString ? 'raw_query_string' : '',
            hasHeaders ? 'headers' : '',
            hasHeaders ? 'request_headers' : '',
        ];
        const queryBindings = hasExplicitQuerySerialization
            ? this.createQueryParameterBindings(queryParams, parameterReservedNames)
            : [];
        const headerBindings = this.createNamedParameterBindings(headerParams, parameterReservedNames);
        const cookieBindings = this.createNamedParameterBindings(cookieParams, [
            ...parameterReservedNames,
            ...queryBindings.map((binding) => binding.safeName),
            ...headerBindings.map((binding) => binding.safeName),
        ]);
        const requiredQueryBindings = queryBindings.filter((binding) => binding.required);
        const optionalQueryBindings = queryBindings.filter((binding) => !binding.required);
        const requiredHeaderBindings = [...headerBindings, ...cookieBindings].filter((binding) => binding.required);
        const optionalHeaderBindings = [...headerBindings, ...cookieBindings].filter((binding) => !binding.required);
        const signatureParams = [];
        const formatArgs = [];
        for (const pathParam of pathParams) {
            signatureParams.push(`${pathParam.safeName}: &str`);
            formatArgs.push(pathParam.safeName);
        }
        if (hasBody) {
            const requestType = getRustType(requestBodySchema, RUST_CONFIG);
            signatureParams.push(`body: &${requestType}`);
        }
        if (hasRawQueryString) {
            signatureParams.push('raw_query_string: &str');
        }
        signatureParams.push(...requiredQueryBindings.map((binding) => this.renderMethodParameter(binding)));
        signatureParams.push(...requiredHeaderBindings.map((binding) => this.renderMethodParameter(binding)));
        if (hasQuery && !hasExplicitQuerySerialization) {
            signatureParams.push('query: Option<&QueryParams>');
        }
        signatureParams.push(...optionalQueryBindings.map((binding) => this.renderMethodParameter(binding)));
        signatureParams.push(...optionalHeaderBindings.map((binding) => this.renderMethodParameter(binding)));
        const normalizedMethodName = sanitizeRustIdentifier(methodName);
        const normalizedPath = this.normalizeOperationPath(op.path, config.apiPrefix);
        const pathExpression = pathParams.length > 0
            ? `format!("${normalizedPath.replace(/\{([^}]+)\}/g, '{}')}", ${formatArgs.join(', ')})`
            : `"${normalizedPath}".to_string()`;
        const resolvedPathExpression = `${this.resolvePathFunctionName(config)}(&${pathExpression})`;
        const requestPathExpression = hasRawQueryString
            ? `append_query_string(${resolvedPathExpression}, raw_query_string)`
            : hasExplicitQuerySerialization
                ? `append_query_string(${resolvedPathExpression}, &query)`
                : resolvedPathExpression;
        const queryArg = hasQuery && !hasExplicitQuerySerialization ? 'query' : 'None';
        const headersArg = hasHeaders ? 'headers.as_ref()' : 'None';
        const contentTypeArg = requestBodyInfo?.mediaType
            ? `Some("${requestBodyInfo.mediaType.toLowerCase()}")`
            : 'None';
        let clientCall = '';
        switch (method) {
            case 'get':
                clientCall = `self.client.get(&path, ${queryArg}, ${headersArg}).await`;
                break;
            case 'post':
                clientCall = `self.client.post(&path, ${hasBody ? 'Some(body)' : 'Option::<&serde_json::Value>::None'}, ${queryArg}, ${headersArg}, ${contentTypeArg}).await`;
                break;
            case 'put':
                clientCall = `self.client.put(&path, ${hasBody ? 'Some(body)' : 'Option::<&serde_json::Value>::None'}, ${queryArg}, ${headersArg}, ${contentTypeArg}).await`;
                break;
            case 'patch':
                clientCall = `self.client.patch(&path, ${hasBody ? 'Some(body)' : 'Option::<&serde_json::Value>::None'}, ${queryArg}, ${headersArg}, ${contentTypeArg}).await`;
                break;
            case 'delete':
                clientCall = `self.client.delete(&path, ${queryArg}, ${headersArg}).await`;
                break;
            default:
                clientCall = `self.client.request_method(Method::from_bytes(b"${toHttpMethodLiteral(httpMethod)}").map_err(SdkworkError::InvalidHttpMethod)?, &path, ${hasBody ? 'Some(body)' : 'Option::<&serde_json::Value>::None'}, ${queryArg}, ${headersArg}, ${contentTypeArg}).await`;
                break;
        }
        const docComment = op.summary
            ? `/// ${String(op.summary).trim()}\n`
            : '';
        const params = signatureParams.length > 0 ? `, ${signatureParams.join(', ')}` : '';
        const requestHeaderBlock = hasHeaders
            ? `    let headers = build_request_headers(
${this.renderHeaderPairs(headerBindings, false, 8)},
${this.renderHeaderPairs(cookieBindings, true, 8)},
    );
`
            : '';
        const queryBlock = hasExplicitQuerySerialization
            ? `    let query = build_query_string(&[
${this.renderQueryParameterSpecs(queryBindings, 8)}
    ]);
`
            : '';
        return {
            content: `${docComment}pub async fn ${normalizedMethodName}(&self${params}) -> Result<${responseType}, SdkworkError> {
${queryBlock}    let path = ${requestPathExpression};
${requestHeaderBlock}    ${clientCall}
}`,
            referencedModels,
        };
    }
    createNamedParameterBindings(parameters, reservedNames) {
        const keys = parameters.map((parameter, index) => `${parameter?.in || 'parameter'}:${parameter?.name || 'value'}:${index}`);
        const rawNameByKey = new Map(keys.map((key, index) => [key, String(parameters[index]?.name || `value${index + 1}`)]));
        const safeNameByKey = createUniqueIdentifierMap(keys, (key) => sanitizeRustIdentifier(rawNameByKey.get(key) || 'value'), reservedNames);
        return parameters.map((parameter, index) => {
            const key = keys[index];
            return {
                parameter,
                safeName: safeNameByKey.get(key) || `value_${index + 1}`,
                required: Boolean(parameter?.required),
                type: this.getNamedParameterType(parameter),
            };
        });
    }
    createQueryParameterBindings(parameters, reservedNames) {
        return this.createNamedParameterBindings(parameters, reservedNames).map((binding) => {
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
    getNamedParameterType(parameter) {
        const contentSchema = extractOpenApiParameterContentSchema(parameter);
        const schema = contentSchema || parameter?.schema;
        if (!schema) {
            return '&serde_json::Value';
        }
        const type = getRustType(schema, RUST_CONFIG);
        if (type === 'String') {
            return '&str';
        }
        if (type === 'serde_json::Value') {
            return '&serde_json::Value';
        }
        if (type === 'i64' || type === 'f64' || type === 'bool') {
            return type;
        }
        const vectorMatch = type.match(/^Vec<(.+)>$/);
        if (vectorMatch) {
            return `&[${vectorMatch[1]}]`;
        }
        return `&${type}`;
    }
    renderMethodParameter(binding) {
        return binding.required
            ? `${binding.safeName}: ${binding.type}`
            : `${binding.safeName}: Option<${binding.type}>`;
    }
    renderHeaderPairs(bindings, cookies, indentation) {
        const indent = ' '.repeat(indentation);
        if (bindings.length === 0) {
            return `${indent}&[]`;
        }
        const lines = bindings.map((binding) => {
            const value = binding.required
                ? `serialize_parameter_value(&${binding.safeName})`
                : `${binding.safeName}.as_ref().and_then(serialize_parameter_value)`;
            return `${indent}    (${this.formatRustString(String(binding.parameter?.name || binding.safeName))}, ${value}),`;
        });
        return [`${indent}&[`, ...lines, `${indent}]`].join('\n');
    }
    formatRustString(value) {
        return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    renderQueryParameterSpecs(bindings, indentation) {
        const indent = ' '.repeat(indentation);
        return bindings.map((binding) => {
            return `${indent}QueryParameterSpec::new(${[
                this.formatRustString(String(binding.parameter?.name || binding.safeName)),
                binding.safeName,
                this.formatRustString(binding.style),
                binding.explode ? 'true' : 'false',
                binding.allowReserved ? 'true' : 'false',
                binding.contentType ? `Some(${this.formatRustString(binding.contentType)})` : 'None',
            ].join(', ')}),`;
        }).join('\n');
    }
    generateQuerySerializationHelpers() {
        return `struct QueryParameterSpec<'a> {
    name: &'a str,
    value: serde_json::Value,
    style: &'a str,
    explode: bool,
    allow_reserved: bool,
    content_type: Option<&'a str>,
}

impl<'a> QueryParameterSpec<'a> {
    fn new<T: serde::Serialize>(
        name: &'a str,
        value: T,
        style: &'a str,
        explode: bool,
        allow_reserved: bool,
        content_type: Option<&'a str>,
    ) -> Self {
        Self {
            name,
            value: serde_json::to_value(value).unwrap_or(serde_json::Value::Null),
            style,
            explode,
            allow_reserved,
            content_type,
        }
    }
}

fn build_query_string(parameters: &[QueryParameterSpec<'_>]) -> String {
    let mut pairs = Vec::new();
    for parameter in parameters {
        append_serialized_parameter(&mut pairs, parameter);
    }
    pairs.join("&")
}

fn append_serialized_parameter(pairs: &mut Vec<String>, parameter: &QueryParameterSpec<'_>) {
    if parameter.value.is_null() {
        return;
    }
    if parameter.content_type.is_some() {
        pairs.push(format!(
            "{}={}",
            percent_encode(parameter.name),
            encode_query_value(&parameter.value.to_string(), parameter.allow_reserved)
        ));
        return;
    }

    let style = if parameter.style.is_empty() { "form" } else { parameter.style };
    match &parameter.value {
        serde_json::Value::Array(values) => append_array_parameter(pairs, parameter.name, values, style, parameter.explode, parameter.allow_reserved),
        serde_json::Value::Object(values) if style == "deepObject" => append_deep_object_parameter(pairs, parameter.name, values, parameter.allow_reserved),
        serde_json::Value::Object(values) => append_object_parameter(pairs, parameter.name, values, style, parameter.explode, parameter.allow_reserved),
        value => pairs.push(format!("{}={}", percent_encode(parameter.name), encode_query_value(&primitive_to_string(value), parameter.allow_reserved))),
    }
}

fn append_array_parameter(
    pairs: &mut Vec<String>,
    name: &str,
    values: &[serde_json::Value],
    style: &str,
    explode: bool,
    allow_reserved: bool,
) {
    let serialized = values.iter().filter(|value| !value.is_null()).map(primitive_to_string).collect::<Vec<_>>();
    if serialized.is_empty() {
        return;
    }
    if style == "form" && explode {
        for item in serialized {
            pairs.push(format!("{}={}", percent_encode(name), encode_query_value(&item, allow_reserved)));
        }
        return;
    }
    pairs.push(format!("{}={}", percent_encode(name), encode_query_value(&serialized.join(","), allow_reserved)));
}

fn append_object_parameter(
    pairs: &mut Vec<String>,
    name: &str,
    values: &serde_json::Map<String, serde_json::Value>,
    style: &str,
    explode: bool,
    allow_reserved: bool,
) {
    let mut serialized = Vec::new();
    for (key, value) in values {
        if value.is_null() {
            continue;
        }
        if style == "form" && explode {
            pairs.push(format!("{}={}", percent_encode(key), encode_query_value(&primitive_to_string(value), allow_reserved)));
        } else {
            serialized.push(key.clone());
            serialized.push(primitive_to_string(value));
        }
    }
    if !serialized.is_empty() {
        pairs.push(format!("{}={}", percent_encode(name), encode_query_value(&serialized.join(","), allow_reserved)));
    }
}

fn append_deep_object_parameter(
    pairs: &mut Vec<String>,
    name: &str,
    values: &serde_json::Map<String, serde_json::Value>,
    allow_reserved: bool,
) {
    for (key, value) in values {
        if !value.is_null() {
            pairs.push(format!("{}={}", percent_encode(&format!("{}[{}]", name, key)), encode_query_value(&primitive_to_string(value), allow_reserved)));
        }
    }
}

fn primitive_to_string(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(value) => value.clone(),
        serde_json::Value::Number(value) => value.to_string(),
        serde_json::Value::Bool(value) => value.to_string(),
        other => other.to_string(),
    }
}

fn encode_query_value(value: &str, allow_reserved: bool) -> String {
    let mut encoded = percent_encode(value);
    if !allow_reserved {
        return encoded;
    }
    for (escaped, reserved) in [
        ("%3A", ":"), ("%2F", "/"), ("%3F", "?"), ("%23", "#"),
        ("%5B", "["), ("%5D", "]"), ("%40", "@"), ("%21", "!"),
        ("%24", "$"), ("%26", "&"), ("%27", "'"), ("%28", "("),
        ("%29", ")"), ("%2A", "*"), ("%2B", "+"), ("%2C", ","),
        ("%3B", ";"), ("%3D", "="),
    ] {
        encoded = encoded.replace(escaped, reserved);
    }
    encoded
}`;
    }
    generateRequestHeaderHelpers() {
        return `fn build_request_headers(headers: &[(&str, Option<String>)], cookies: &[(&str, Option<String>)]) -> Option<RequestHeaders> {
    let mut request_headers = RequestHeaders::new();
    for (name, value) in headers {
        if let Some(value) = value {
            request_headers.insert((*name).to_string(), value.clone());
        }
    }

    let cookie_header = build_cookie_header(cookies);
    if !cookie_header.is_empty() {
        request_headers
            .entry("Cookie".to_string())
            .and_modify(|existing| {
                existing.push_str("; ");
                existing.push_str(&cookie_header);
            })
            .or_insert(cookie_header);
    }

    if request_headers.is_empty() {
        None
    } else {
        Some(request_headers)
    }
}

fn build_cookie_header(cookies: &[(&str, Option<String>)]) -> String {
    cookies
        .iter()
        .filter_map(|(name, value)| {
            value
                .as_ref()
                .map(|value| format!("{}={}", percent_encode(name), percent_encode(value)))
        })
        .collect::<Vec<_>>()
        .join("; ")
}

fn serialize_parameter_value<T: serde::Serialize>(value: &T) -> Option<String> {
    let value = serde_json::to_value(value).ok()?;
    match value {
        serde_json::Value::Null => None,
        serde_json::Value::String(value) => Some(value),
        serde_json::Value::Number(value) => Some(value.to_string()),
        serde_json::Value::Bool(value) => Some(value.to_string()),
        serde_json::Value::Array(values) => {
            let serialized = values
                .iter()
                .filter_map(serialize_json_value)
                .collect::<Vec<_>>();
            if serialized.is_empty() {
                None
            } else {
                Some(serialized.join(","))
            }
        }
        serde_json::Value::Object(values) => {
            let serialized = values
                .iter()
                .filter_map(|(key, value)| serialize_json_value(value).map(|serialized| format!("{}={}", key, serialized)))
                .collect::<Vec<_>>();
            if serialized.is_empty() {
                None
            } else {
                Some(serialized.join(","))
            }
        }
    }
}

fn serialize_json_value(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::Null => None,
        serde_json::Value::String(value) => Some(value.clone()),
        serde_json::Value::Number(value) => Some(value.to_string()),
        serde_json::Value::Bool(value) => Some(value.to_string()),
        other => Some(other.to_string()),
    }
}

fn percent_encode(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            _ => format!("%{:02X}", byte).chars().collect(),
        })
        .collect()
}`;
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

pub fn append_query_string(path: String, raw_query_string: &str) -> String {
    let query = raw_query_string.trim_start_matches('?');
    if query.is_empty() {
        return path;
    }
    if path.contains('?') {
        format!("{}&{}", path, query)
    } else {
        format!("{}?{}", path, query)
    }
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
    generateApiIndex(tags, apiNames, config) {
        const lines = ['pub mod base;', 'pub mod paths;'];
        for (const tag of tags) {
            const apiName = apiNames.get(tag);
            if (!apiName) {
                continue;
            }
            lines.push(`pub mod ${apiName.moduleName};`);
            lines.push(`pub use ${apiName.moduleName}::${apiName.structName};`);
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
            options: 'options',
            head: 'head',
            trace: 'trace',
            query: 'query',
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
    collectReferencedModels(schema, knownModels, refs) {
        collectSchemaReferences(schema, RUST_CONFIG.namingConventions.modelName, knownModels, refs);
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
    return sanitizeRustRawIdentifier(value);
}
