import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import { normalizeOperationId, resolveScopedMethodNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { resolveOpenAIStyleMethodNames, resolveSdkTagNames, selectCanonicalOpenAIStyleOperations } from '../../framework/openai-surface.js';
import { resolveJvmSdkIdentity } from '../../framework/jvm-sdk-identity.js';
import { supportsRequestBodyByDefault, toHttpMethodLiteral } from '../../framework/http-methods.js';
import { resolveMediaTypeSchema } from '../../framework/schema.js';
import { extractEventStreamResponseInfo } from '../../framework/responses.js';
import { JAVA_CONFIG, getJavaType } from './config.js';
import { extractOpenApiParameterContentSchema, requiresExplicitOpenApiQuerySerialization, resolveOpenApiParameterSerialization, } from '../../framework/parameter-serialization.js';
export class ApiGenerator {
    generate(ctx, config) {
        const files = [];
        const identity = resolveJvmSdkIdentity(config);
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSdkTagNames(tags, config);
        const knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => JAVA_CONFIG.namingConventions.modelName(schemaName)));
        for (const tag of tags) {
            const group = ctx.apiGroups[tag];
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            files.push(this.generateApiClass(tag, resolvedTagName, group.operations, identity, config, knownModels));
        }
        files.push(this.generatePaths(identity, config));
        files.push(this.generateApiIndex(tags, resolvedTagNames, identity, config));
        return files;
    }
    generateApiClass(tag, resolvedTagName, operations, identity, config, knownModels) {
        operations = selectCanonicalOpenAIStyleOperations(tag, operations, config);
        const className = `${JAVA_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
        const methodNames = resolveOpenAIStyleMethodNames(tag, operations, config, JAVA_CONFIG, 'camel')
            || resolveScopedMethodNames(operations, (op) => this.generateOperationId(op.method, op.path, op, tag));
        const methods = operations
            .map((op) => this.generateMethod(op, config, methodNames.get(op) || 'operation', knownModels))
            .join('\n\n');
        const needsPathSerializationHelpers = operations.some((op) => this.extractPathParams(op.path).length > 0);
        const needsRequestHeaderHelpers = operations.some((op) => {
            const allParameters = op.allParameters || op.parameters || [];
            return allParameters.some((param) => param?.in === 'header' || param?.in === 'cookie');
        });
        const needsQuerySerializationHelpers = operations.some((op) => {
            const allParameters = op.allParameters || op.parameters || [];
            return allParameters.some((param) => param?.in === 'query' && requiresExplicitOpenApiQuerySerialization(param));
        });
        return {
            path: `src/main/java/${identity.packagePath}/api/${className}.java`,
            content: this.format(`package ${identity.packageRoot}.api;

import com.fasterxml.jackson.core.type.TypeReference;
import ${identity.packageRoot}.http.HttpClient;
import ${identity.packageRoot}.model.*;
import java.util.List;
import java.util.Map;

public class ${className} {
    private final HttpClient client;
    
    public ${className}(HttpClient client) {
        this.client = client;
    }

${methods}
${needsPathSerializationHelpers ? `\n${this.generatePathSerializationHelpers()}` : ''}
${needsQuerySerializationHelpers ? `\n${this.generateQuerySerializationHelpers()}` : ''}
${needsRequestHeaderHelpers ? `\n${this.generateRequestHeaderHelpers()}` : ''}
}
`),
            language: 'java',
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
        const pathOpenApiParams = allParameters.filter((param) => param?.in === 'path');
        const hasQuery = queryParams.length > 0;
        const hasRawQueryString = queryStringParams.length > 0;
        const hasHeaders = headerParams.length > 0 || cookieParams.length > 0;
        const method = String(op.method || '').toLowerCase();
        const httpMethod = String(op.httpMethod || op.method || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const supportsRequestBody = supportsRequestBodyByDefault(method);
        const requestBodyInfo = supportsRequestBody ? this.extractRequestBodyInfo(op) : undefined;
        const hasBody = Boolean(requestBodyInfo);
        const requestBodySchema = requestBodyInfo?.schema;
        const hasExplicitQuerySerialization = queryParams.some((param) => requiresExplicitOpenApiQuerySerialization(param));
        const contentTypeArg = requestBodyInfo?.mediaType
            ? `, "${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
            : '';
        const requestType = requestBodySchema
            ? getJavaType(requestBodySchema, JAVA_CONFIG)
            : 'Object';
        const eventStreamInfo = extractEventStreamResponseInfo(op);
        const isEventStreamResponse = Boolean(eventStreamInfo);
        const responseSchema = eventStreamInfo?.schema ?? this.extractResponseSchema(op);
        const responseType = responseSchema
            ? getJavaType(responseSchema, JAVA_CONFIG)
            : this.inferFallbackResponseType(op);
        const pathParamNames = createUniqueIdentifierMap(rawPathParams, (value) => JAVA_CONFIG.namingConventions.propertyName(value), [
            hasBody ? 'body' : '',
            hasQuery ? 'params' : '',
            hasRawQueryString ? 'rawQueryString' : '',
            hasHeaders ? 'requestHeaders' : '',
        ]);
        const pathParams = rawPathParams.map((rawName) => {
            const parameter = pathOpenApiParams.find((candidate) => candidate?.name === rawName);
            const serialization = resolveOpenApiParameterSerialization(parameter || { name: rawName, in: 'path' });
            return {
                rawName,
                safeName: pathParamNames.get(rawName) || rawName,
                type: parameter?.schema ? this.ensureKnownType(getJavaType(parameter.schema, JAVA_CONFIG), knownModels) : 'String',
                style: serialization.style,
                explode: serialization.explode,
            };
        });
        const parameterReservedNames = [
            ...pathParams.map((param) => param.safeName),
            hasBody ? 'body' : '',
            hasQuery ? 'params' : '',
            hasRawQueryString ? 'rawQueryString' : '',
            hasHeaders ? 'requestHeaders' : '',
        ];
        const queryBindings = hasExplicitQuerySerialization
            ? this.createQueryParameterBindings(queryParams, knownModels, parameterReservedNames)
            : [];
        const headerBindings = this.createHeaderParameterBindings(headerParams, knownModels, parameterReservedNames);
        const cookieBindings = this.createHeaderParameterBindings(cookieParams, knownModels, [
            ...parameterReservedNames,
            ...queryBindings.map((binding) => binding.safeName),
            ...headerBindings.map((binding) => binding.safeName),
        ]);
        const requiredQueryBindings = queryBindings.filter((binding) => binding.required);
        const optionalQueryBindings = queryBindings.filter((binding) => !binding.required);
        const requiredHeaderBindings = [...headerBindings, ...cookieBindings].filter((binding) => binding.required);
        const optionalHeaderBindings = [...headerBindings, ...cookieBindings].filter((binding) => !binding.required);
        const params = [];
        if (pathParams.length) {
            params.push(...pathParams.map((param) => `${param.type} ${param.safeName}`));
        }
        if (hasBody && Boolean(op.requestBody?.required)) {
            params.push(`${requestType} body`);
        }
        if (hasRawQueryString) {
            params.push('String rawQueryString');
        }
        params.push(...requiredQueryBindings.map((binding) => `${binding.type} ${binding.safeName}`));
        params.push(...requiredHeaderBindings.map((binding) => `${binding.type} ${binding.safeName}`));
        if (hasBody && !Boolean(op.requestBody?.required)) {
            params.push(`${requestType} body`);
        }
        if (hasQuery && !hasExplicitQuerySerialization) {
            params.push('Map<String, Object> params');
        }
        params.push(...optionalQueryBindings.map((binding) => `${binding.type} ${binding.safeName}`));
        params.push(...optionalHeaderBindings.map((binding) => `${binding.type} ${binding.safeName}`));
        const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
        const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, (_match, paramName) => {
            const param = pathParams.find((candidate) => candidate.rawName === paramName);
            const safeName = param?.safeName || pathParamNames.get(paramName) || JAVA_CONFIG.namingConventions.propertyName(paramName);
            const style = param?.style || 'simple';
            const explode = param?.explode ?? false;
            return `" + serializePathParameter(${safeName}, new PathParameterSpec(${this.formatJavaString(paramName)}, ${this.formatJavaString(style)}, ${explode ? 'true' : 'false'})) + "`;
        });
        const pathCall = `ApiPaths.${JAVA_CONFIG.namingConventions.methodName(config.sdkType)}Path("${pathTemplate}")`;
        const requestPathCall = hasRawQueryString
            ? `ApiPaths.appendQueryString(${pathCall}, rawQueryString)`
            : hasExplicitQuerySerialization
                ? `ApiPaths.appendQueryString(${pathCall}, query)`
                : pathCall;
        let call = '';
        switch (method) {
            case 'get':
                if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `client.get(${requestPathCall}, null, requestHeaders)`
                        : `client.get(${requestPathCall}, params, requestHeaders)`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `client.get(${requestPathCall})`
                        : `client.get(${requestPathCall}, params)`;
                }
                else if (hasHeaders) {
                    call = `client.get(${requestPathCall}, null, requestHeaders)`;
                }
                else {
                    call = `client.get(${requestPathCall})`;
                }
                break;
            case 'post':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = hasExplicitQuerySerialization
                            ? `client.post(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`
                            : `client.post(${requestPathCall}, body, params, requestHeaders${contentTypeArg})`;
                    }
                    else if (hasQuery) {
                        call = hasExplicitQuerySerialization
                            ? `client.post(${requestPathCall}, body, null, null${contentTypeArg})`
                            : `client.post(${requestPathCall}, body, params, null${contentTypeArg})`;
                    }
                    else if (hasHeaders) {
                        call = `client.post(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`;
                    }
                    else {
                        call = `client.post(${requestPathCall}, body, null, null${contentTypeArg})`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `client.post(${requestPathCall}, null, null, requestHeaders)`
                        : `client.post(${requestPathCall}, null, params, requestHeaders)`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `client.post(${requestPathCall}, null)`
                        : `client.post(${requestPathCall}, null, params)`;
                }
                else if (hasHeaders) {
                    call = `client.post(${requestPathCall}, null, null, requestHeaders)`;
                }
                else {
                    call = `client.post(${requestPathCall}, null)`;
                }
                break;
            case 'put':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = hasExplicitQuerySerialization
                            ? `client.put(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`
                            : `client.put(${requestPathCall}, body, params, requestHeaders${contentTypeArg})`;
                    }
                    else if (hasQuery) {
                        call = hasExplicitQuerySerialization
                            ? `client.put(${requestPathCall}, body, null, null${contentTypeArg})`
                            : `client.put(${requestPathCall}, body, params, null${contentTypeArg})`;
                    }
                    else if (hasHeaders) {
                        call = `client.put(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`;
                    }
                    else {
                        call = `client.put(${requestPathCall}, body, null, null${contentTypeArg})`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `client.put(${requestPathCall}, null, null, requestHeaders)`
                        : `client.put(${requestPathCall}, null, params, requestHeaders)`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `client.put(${requestPathCall}, null)`
                        : `client.put(${requestPathCall}, null, params)`;
                }
                else if (hasHeaders) {
                    call = `client.put(${requestPathCall}, null, null, requestHeaders)`;
                }
                else {
                    call = `client.put(${requestPathCall}, null)`;
                }
                break;
            case 'delete':
                if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `client.delete(${requestPathCall}, null, requestHeaders)`
                        : `client.delete(${requestPathCall}, params, requestHeaders)`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `client.delete(${requestPathCall})`
                        : `client.delete(${requestPathCall}, params)`;
                }
                else if (hasHeaders) {
                    call = `client.delete(${requestPathCall}, null, requestHeaders)`;
                }
                else {
                    call = `client.delete(${requestPathCall})`;
                }
                break;
            case 'patch':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = hasExplicitQuerySerialization
                            ? `client.patch(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`
                            : `client.patch(${requestPathCall}, body, params, requestHeaders${contentTypeArg})`;
                    }
                    else if (hasQuery) {
                        call = hasExplicitQuerySerialization
                            ? `client.patch(${requestPathCall}, body, null, null${contentTypeArg})`
                            : `client.patch(${requestPathCall}, body, params, null${contentTypeArg})`;
                    }
                    else if (hasHeaders) {
                        call = `client.patch(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`;
                    }
                    else {
                        call = `client.patch(${requestPathCall}, body, null, null${contentTypeArg})`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `client.patch(${requestPathCall}, null, null, requestHeaders)`
                        : `client.patch(${requestPathCall}, null, params, requestHeaders)`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `client.patch(${requestPathCall}, null)`
                        : `client.patch(${requestPathCall}, null, params)`;
                }
                else if (hasHeaders) {
                    call = `client.patch(${requestPathCall}, null, null, requestHeaders)`;
                }
                else {
                    call = `client.patch(${requestPathCall}, null)`;
                }
                break;
            default:
                call = `client.request("${toHttpMethodLiteral(httpMethod)}", ${requestPathCall}, ${hasBody ? 'body' : 'null'}, ${hasQuery && !hasExplicitQuerySerialization ? 'params' : 'null'}, ${hasHeaders ? 'requestHeaders' : 'null'}, ${hasBody && requestBodyInfo?.mediaType ? `"${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : 'null'})`;
        }
        const docComment = op.summary ? `    /** ${op.summary} */\n` : '';
        const requestHeaderBlock = hasHeaders
            ? `        Map<String, String> requestHeaders = buildRequestHeaders(
${this.renderHeaderParameterMap(headerBindings, 16)},
${this.renderHeaderParameterMap(cookieBindings, 16)}
        );
`
            : '';
        const queryBlock = hasExplicitQuerySerialization
            ? `        String query = buildQueryString(List.of(
${this.renderQueryParameterSpecs(queryBindings, 12)}
        ));
`
            : '';
        if (isEventStreamResponse) {
            const castType = this.ensureKnownType(responseType, knownModels);
            const streamArgs = [
                this.formatJavaString(toHttpMethodLiteral(httpMethod)),
                requestPathCall,
                hasBody ? 'body' : 'null',
                hasQuery && !hasExplicitQuerySerialization ? 'params' : 'null',
                hasHeaders ? 'requestHeaders' : 'null',
                hasBody && requestBodyInfo?.mediaType ? `"${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : 'null',
                `new TypeReference<${castType}>() {}`,
            ].join(', ');
            return `${docComment}    public Iterable<${responseType}> ${methodName}(${params.join(', ')}) throws Exception {
${queryBlock}${requestHeaderBlock}        return client.stream(${streamArgs});
    }`;
        }
        if (responseType === 'Void') {
            return `${docComment}    public Void ${methodName}(${params.join(', ')}) throws Exception {
${queryBlock}${requestHeaderBlock}        ${call};
        return null;
    }`;
        }
        const castType = this.ensureKnownType(responseType, knownModels);
        return `${docComment}    public ${responseType} ${methodName}(${params.join(', ')}) throws Exception {
${queryBlock}${requestHeaderBlock}        Object raw = ${call};
        return client.convertValue(raw, new TypeReference<${castType}>() {});
    }`;
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
    createHeaderParameterBindings(parameters, knownModels, reservedNames) {
        return this.createNamedParameterBindings(parameters, knownModels, reservedNames).map((binding) => {
            const serialization = resolveOpenApiParameterSerialization(binding.parameter);
            return {
                ...binding,
                style: serialization.style,
                explode: serialization.explode,
                contentType: serialization.contentType,
            };
        });
    }
    createNamedParameterBindings(parameters, knownModels, reservedNames) {
        const keys = parameters.map((parameter, index) => `${parameter?.in || 'parameter'}:${parameter?.name || 'value'}:${index}`);
        const rawNameByKey = new Map(keys.map((key, index) => [key, String(parameters[index]?.name || `value${index + 1}`)]));
        const safeNameByKey = createUniqueIdentifierMap(keys, (key) => JAVA_CONFIG.namingConventions.propertyName(rawNameByKey.get(key) || 'value'), reservedNames);
        return parameters.map((parameter, index) => {
            const key = keys[index];
            return {
                parameter,
                safeName: safeNameByKey.get(key) || `value${index + 1}`,
                required: Boolean(parameter?.required),
                type: this.getNamedParameterType(parameter, knownModels),
            };
        });
    }
    getNamedParameterType(parameter, knownModels) {
        const contentSchema = extractOpenApiParameterContentSchema(parameter);
        if (contentSchema) {
            return this.ensureKnownType(getJavaType(contentSchema, JAVA_CONFIG), knownModels);
        }
        return parameter?.schema ? this.ensureKnownType(getJavaType(parameter.schema, JAVA_CONFIG), knownModels) : 'Object';
    }
    renderNamedParameterMap(bindings, indentation) {
        const indent = ' '.repeat(indentation);
        if (bindings.length === 0) {
            return `${indent}Map.of()`;
        }
        const entries = bindings.map((binding) => {
            return `${this.formatJavaString(String(binding.parameter?.name || binding.safeName))}, ${binding.safeName}`;
        });
        return `${indent}Map.of(${entries.join(', ')})`;
    }
    renderHeaderParameterMap(bindings, indentation) {
        const indent = ' '.repeat(indentation);
        if (bindings.length === 0) {
            return `${indent}Map.of()`;
        }
        const entries = bindings.map((binding) => {
            return `${this.formatJavaString(String(binding.parameter?.name || binding.safeName))}, new HeaderParameterSpec(${[
                binding.safeName,
                this.formatJavaString(binding.style),
                binding.explode ? 'true' : 'false',
                binding.contentType ? this.formatJavaString(binding.contentType) : 'null',
            ].join(', ')})`;
        });
        return `${indent}Map.of(${entries.join(', ')})`;
    }
    formatJavaString(value) {
        return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    renderQueryParameterSpecs(bindings, indentation) {
        const indent = ' '.repeat(indentation);
        return bindings.map((binding) => {
            return `${indent}new QueryParameterSpec(${[
                this.formatJavaString(String(binding.parameter?.name || binding.safeName)),
                binding.safeName,
                this.formatJavaString(binding.style),
                binding.explode ? 'true' : 'false',
                binding.allowReserved ? 'true' : 'false',
                binding.contentType ? this.formatJavaString(binding.contentType) : 'null',
            ].join(', ')})`;
        }).join(',\n');
    }
    generateQuerySerializationHelpers() {
        return `    private record QueryParameterSpec(String name, Object value, String style, boolean explode, boolean allowReserved, String contentType) {}

    private static String buildQueryString(List<QueryParameterSpec> parameters) throws Exception {
        List<String> pairs = new java.util.ArrayList<>();
        for (QueryParameterSpec parameter : parameters) {
            appendSerializedParameter(pairs, parameter);
        }
        return String.join("&", pairs);
    }

    private static void appendSerializedParameter(List<String> pairs, QueryParameterSpec parameter) throws Exception {
        if (parameter.value() == null) {
            return;
        }
        if (parameter.contentType() != null && !parameter.contentType().isBlank()) {
            String json = clientObjectMapper().writeValueAsString(parameter.value());
            pairs.add(urlEncode(parameter.name()) + "=" + encodeQueryValue(json, parameter.allowReserved()));
            return;
        }

        String style = parameter.style() == null || parameter.style().isBlank() ? "form" : parameter.style();
        Object value = parameter.value();
        if ("deepObject".equals(style) && value instanceof Map<?, ?> map) {
            appendDeepObjectParameter(pairs, parameter.name(), map, parameter.allowReserved());
        } else if (value instanceof Iterable<?> iterable) {
            appendArrayParameter(pairs, parameter.name(), iterable, style, parameter.explode(), parameter.allowReserved());
        } else if (value instanceof Map<?, ?> map) {
            appendObjectParameter(pairs, parameter.name(), map, style, parameter.explode(), parameter.allowReserved());
        } else {
            pairs.add(urlEncode(parameter.name()) + "=" + encodeQueryValue(String.valueOf(value), parameter.allowReserved()));
        }
    }

    private static void appendArrayParameter(List<String> pairs, String name, Iterable<?> values, String style, boolean explode, boolean allowReserved) {
        List<String> serialized = new java.util.ArrayList<>();
        for (Object item : values) {
            if (item != null) {
                serialized.add(String.valueOf(item));
            }
        }
        if (serialized.isEmpty()) {
            return;
        }
        if ("form".equals(style) && explode) {
            for (String item : serialized) {
                pairs.add(urlEncode(name) + "=" + encodeQueryValue(item, allowReserved));
            }
            return;
        }
        pairs.add(urlEncode(name) + "=" + encodeQueryValue(String.join(",", serialized), allowReserved));
    }

    private static void appendObjectParameter(List<String> pairs, String name, Map<?, ?> values, String style, boolean explode, boolean allowReserved) {
        List<String> serialized = new java.util.ArrayList<>();
        values.forEach((key, value) -> {
            if (value == null) {
                return;
            }
            if ("form".equals(style) && explode) {
                pairs.add(urlEncode(String.valueOf(key)) + "=" + encodeQueryValue(String.valueOf(value), allowReserved));
            } else {
                serialized.add(String.valueOf(key));
                serialized.add(String.valueOf(value));
            }
        });
        if (!serialized.isEmpty()) {
            pairs.add(urlEncode(name) + "=" + encodeQueryValue(String.join(",", serialized), allowReserved));
        }
    }

    private static void appendDeepObjectParameter(List<String> pairs, String name, Map<?, ?> values, boolean allowReserved) {
        values.forEach((key, value) -> {
            if (value != null) {
                pairs.add(urlEncode(name + "[" + key + "]") + "=" + encodeQueryValue(String.valueOf(value), allowReserved));
            }
        });
    }

    private static String encodeQueryValue(String value, boolean allowReserved) {
        String encoded = urlEncode(value);
        if (!allowReserved) {
            return encoded;
        }
        return encoded
            .replace("%3A", ":").replace("%2F", "/").replace("%3F", "?").replace("%23", "#")
            .replace("%5B", "[").replace("%5D", "]").replace("%40", "@").replace("%21", "!")
            .replace("%24", "$").replace("%26", "&").replace("%27", "'").replace("%28", "(")
            .replace("%29", ")").replace("%2A", "*").replace("%2B", "+").replace("%2C", ",")
            .replace("%3B", ";").replace("%3D", "=");
    }

    private static com.fasterxml.jackson.databind.ObjectMapper clientObjectMapper() {
        return new com.fasterxml.jackson.databind.ObjectMapper();
    }`;
    }
    generatePathSerializationHelpers() {
        return `    private record PathParameterSpec(String name, String style, boolean explode) {}

    private static String serializePathParameter(Object value, PathParameterSpec spec) {
        if (value == null) {
            return "";
        }
        String style = spec.style() == null || spec.style().isBlank() ? "simple" : spec.style();
        if (value instanceof Iterable<?> iterable) {
            return serializePathArray(spec.name(), iterable, style, spec.explode());
        }
        if (value instanceof Map<?, ?> map) {
            return serializePathObject(spec.name(), map, style, spec.explode());
        }
        return pathPrimitivePrefix(spec.name(), style) + pathEncode(String.valueOf(value));
    }

    private static String serializePathArray(String name, Iterable<?> values, String style, boolean explode) {
        List<String> serialized = new java.util.ArrayList<>();
        for (Object item : values) {
            if (item != null) {
                serialized.add(pathEncode(String.valueOf(item)));
            }
        }
        if (serialized.isEmpty()) {
            return pathPrefix(name, style);
        }
        if ("matrix".equals(style)) {
            if (explode) {
                List<String> parts = new java.util.ArrayList<>();
                for (String item : serialized) {
                    parts.add(";" + name + "=" + item);
                }
                return String.join("", parts);
            }
            return ";" + name + "=" + String.join(",", serialized);
        }
        String separator = explode ? "." : ",";
        return pathPrefix(name, style) + String.join(separator, serialized);
    }

    private static String serializePathObject(String name, Map<?, ?> values, String style, boolean explode) {
        List<String> entries = new java.util.ArrayList<>();
        List<String> exploded = new java.util.ArrayList<>();
        values.forEach((key, value) -> {
            if (value == null) {
                return;
            }
            String escapedKey = pathEncode(String.valueOf(key));
            String escapedValue = pathEncode(String.valueOf(value));
            if (explode) {
                if ("matrix".equals(style)) {
                    exploded.add(";" + escapedKey + "=" + escapedValue);
                } else {
                    exploded.add(escapedKey + "=" + escapedValue);
                }
            } else {
                entries.add(escapedKey);
                entries.add(escapedValue);
            }
        });
        if ("matrix".equals(style)) {
            if (explode) {
                return String.join("", exploded);
            }
            return ";" + name + "=" + String.join(",", entries);
        }
        if (explode) {
            String separator = "label".equals(style) ? "." : ",";
            return pathPrefix(name, style) + String.join(separator, exploded);
        }
        return pathPrefix(name, style) + String.join(",", entries);
    }

    private static String pathPrefix(String name, String style) {
        if ("label".equals(style)) {
            return ".";
        }
        if ("matrix".equals(style)) {
            return ";" + name;
        }
        return "";
    }

    private static String pathPrimitivePrefix(String name, String style) {
        if ("matrix".equals(style)) {
            return ";" + name + "=";
        }
        return pathPrefix(name, style);
    }

    private static String pathEncode(String value) {
        return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8).replace("+", "%20");
    }`;
    }
    generateRequestHeaderHelpers() {
        return `    private record HeaderParameterSpec(Object value, String style, boolean explode, String contentType) {}

    private static Map<String, String> buildRequestHeaders(Map<String, HeaderParameterSpec> headers, Map<String, HeaderParameterSpec> cookies) throws Exception {
        Map<String, String> requestHeaders = new java.util.LinkedHashMap<>();
        for (Map.Entry<String, HeaderParameterSpec> entry : headers.entrySet()) {
            String serialized = serializeParameterValue(entry.getValue());
            if (serialized != null) {
                requestHeaders.put(entry.getKey(), serialized);
            }
        }

        String cookieHeader = buildCookieHeader(cookies);
        if (cookieHeader != null && !cookieHeader.isEmpty()) {
            requestHeaders.merge("Cookie", cookieHeader, (left, right) -> left + "; " + right);
        }

        return requestHeaders.isEmpty() ? null : requestHeaders;
    }

    private static String buildCookieHeader(Map<String, HeaderParameterSpec> cookies) throws Exception {
        java.util.List<String> pairs = new java.util.ArrayList<>();
        for (Map.Entry<String, HeaderParameterSpec> entry : cookies.entrySet()) {
            String serialized = serializeParameterValue(entry.getValue());
            if (serialized != null) {
                pairs.add(urlEncode(entry.getKey()) + "=" + urlEncode(serialized));
            }
        }
        return String.join("; ", pairs);
    }

    private static String serializeParameterValue(HeaderParameterSpec parameter) throws Exception {
        if (parameter == null || parameter.value() == null) {
            return null;
        }
        Object value = parameter.value();
        if (parameter.contentType() != null && !parameter.contentType().isBlank()) {
            return headerObjectMapper().writeValueAsString(value);
        }
        if (value instanceof Iterable<?> iterable) {
            java.util.List<String> values = new java.util.ArrayList<>();
            for (Object item : iterable) {
                if (item != null) {
                    values.add(String.valueOf(item));
                }
            }
            return String.join(",", values);
        }
        if (value instanceof Map<?, ?> map) {
            java.util.List<String> values = new java.util.ArrayList<>();
            map.forEach((key, item) -> {
                if (item == null) {
                    return;
                }
                if (parameter.explode()) {
                    values.add(String.valueOf(key) + "=" + String.valueOf(item));
                } else {
                    values.add(String.valueOf(key));
                    values.add(String.valueOf(item));
                }
            });
            return String.join(",", values);
        }
        return String.valueOf(value);
    }

    private static String urlEncode(String value) {
        return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8);
    }

    private static com.fasterxml.jackson.databind.ObjectMapper headerObjectMapper() {
        return new com.fasterxml.jackson.databind.ObjectMapper();
    }`;
    }
    generateOperationId(method, path, op, tag) {
        if (op.operationId) {
            const normalized = normalizeOperationId(op.operationId);
            return JAVA_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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
        return `${actionMap[method] || method}${JAVA_CONFIG.namingConventions.modelName(resource)}`;
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
            return 'Object';
        }
        const statusCodes = Object.keys(responses);
        if (statusCodes.length === 0) {
            return 'Object';
        }
        const allNoContent = statusCodes.every((code) => {
            const content = responses[code]?.content;
            return !content || typeof content !== 'object' || Object.keys(content).length === 0;
        });
        if (allNoContent || responses['204']) {
            return 'Void';
        }
        return 'Object';
    }
    ensureKnownType(typeName, knownModels) {
        if (knownModels.has(typeName)) {
            return typeName;
        }
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
    generatePaths(packageName, config) {
        return {
            path: `src/main/java/${packageName.packagePath}/api/ApiPaths.java`,
            content: this.format(`package ${packageName.packageRoot}.api;

public class ApiPaths {
    public static final String API_PREFIX = "${config.apiPrefix}";
    
    public static String ${JAVA_CONFIG.namingConventions.methodName(config.sdkType)}Path(String path) {
        if (path == null || path.isEmpty()) {
            return API_PREFIX;
        }
        if (path.startsWith("http://") || path.startsWith("https://")) {
            return path;
        }

        String normalizedPrefix = API_PREFIX == null ? "" : API_PREFIX.trim();
        if (!normalizedPrefix.isEmpty() && !"/".equals(normalizedPrefix)) {
            normalizedPrefix = "/" + normalizedPrefix.replaceAll("^/+|/+$", "");
        } else {
            normalizedPrefix = "";
        }

        String normalizedPath = path.startsWith("/") ? path : "/" + path;
        if (normalizedPrefix.isEmpty()) {
            return normalizedPath;
        }
        if (normalizedPath.equals(normalizedPrefix) || normalizedPath.startsWith(normalizedPrefix + "/")) {
            return normalizedPath;
        }
        return normalizedPrefix + normalizedPath;
    }

    public static String appendQueryString(String path, String rawQueryString) {
        String query = rawQueryString == null ? "" : rawQueryString.replaceFirst("^\\\\?+", "");
        if (query.isEmpty()) {
            return path;
        }
        return path.contains("?") ? path + "&" + query : path + "?" + query;
    }
}
`),
            language: 'java',
            description: 'API path utilities',
        };
    }
    generateApiIndex(tags, resolvedTagNames, packageName, config) {
        const exports = tags.map((tag) => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const className = `${JAVA_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            return `import ${packageName.packageRoot}.api.${className};`;
        }).join('\n');
        return {
            path: `src/main/java/${packageName.packagePath}/api/package-info.java`,
            content: this.format(`/**
 * API modules for ${config.name}
 */
package ${packageName.packageRoot}.api;

${exports}
`),
            language: 'java',
            description: 'API module exports',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
