import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import { normalizeOperationId, resolveScopedMethodNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { resolveOpenAIStyleMethodNames, resolveSdkTagNames, selectCanonicalOpenAIStyleOperations } from '../../framework/openai-surface.js';
import { supportsRequestBodyByDefault, toHttpMethodLiteral } from '../../framework/http-methods.js';
import { resolveMediaTypeSchema } from '../../framework/schema.js';
import { extractEventStreamResponseInfo } from '../../framework/responses.js';
import { extractOpenApiParameterContentSchema, requiresExplicitOpenApiQuerySerialization, resolveOpenApiParameterSerialization, } from '../../framework/parameter-serialization.js';
import { SWIFT_CONFIG, getSwiftType } from './config.js';
export class ApiGenerator {
    generate(ctx, config) {
        const files = [];
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSdkTagNames(tags, config);
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
        operations = selectCanonicalOpenAIStyleOperations(tag, operations, config);
        const className = `${SWIFT_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
        const methodNames = resolveOpenAIStyleMethodNames(tag, operations, config, SWIFT_CONFIG, 'camel')
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
            path: `Sources/API/${className}.swift`,
            content: this.format(`import Foundation

public class ${className} {
    private let client: HttpClient
    
    public init(client: HttpClient) {
        self.client = client
    }

${methods}
${needsPathSerializationHelpers ? `\n${this.generatePathSerializationHelpers()}` : ''}
${needsQuerySerializationHelpers ? `\n${this.generateQuerySerializationHelpers()}` : ''}
${needsRequestHeaderHelpers ? `\n${this.generateRequestHeaderHelpers()}` : ''}
}
`),
            language: 'swift',
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
        const requestBodyRequired = hasBody && Boolean(op.requestBody?.required);
        const requestBodySchema = requestBodyInfo?.schema;
        const hasExplicitQuerySerialization = queryParams.some((param) => requiresExplicitOpenApiQuerySerialization(param));
        const contentTypeArg = requestBodyInfo?.mediaType
            ? `, contentType: "${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
            : '';
        const requestType = requestBodySchema
            ? this.ensureKnownType(getSwiftType(requestBodySchema, SWIFT_CONFIG), knownModels)
            : 'Any';
        const eventStreamInfo = extractEventStreamResponseInfo(op);
        const isEventStreamResponse = Boolean(eventStreamInfo);
        const responseSchema = eventStreamInfo?.schema ?? this.extractResponseSchema(op);
        const responseType = responseSchema
            ? this.ensureKnownType(getSwiftType(responseSchema, SWIFT_CONFIG), knownModels)
            : this.inferFallbackResponseType(op);
        const typedResponseArg = responseType !== 'Any' && responseType !== 'Void'
            ? `, responseType: ${responseType}.self`
            : '';
        const pathParamNames = createUniqueIdentifierMap(rawPathParams, (value) => SWIFT_CONFIG.namingConventions.propertyName(value), [
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
                type: parameter?.schema ? this.ensureKnownType(getSwiftType(parameter.schema, SWIFT_CONFIG), knownModels) : 'String',
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
        const headerBindings = this.createHeaderParameterBindings(headerParams, knownModels, [
            ...parameterReservedNames,
            ...queryBindings.map((binding) => binding.safeName),
        ]);
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
            params.push(...pathParams.map((param) => `${param.safeName}: ${param.type}`));
        }
        if (hasBody && requestBodyRequired) {
            if (requestBodyRequired) {
                params.push(`body: ${requestType}`);
            }
            else {
                params.push(`body: ${requestType}? = nil`);
            }
        }
        if (hasRawQueryString) {
            params.push('rawQueryString: String');
        }
        params.push(...requiredQueryBindings.map((binding) => this.renderMethodParameter(binding)));
        params.push(...requiredHeaderBindings.map((binding) => this.renderMethodParameter(binding)));
        if (hasBody && !requestBodyRequired) {
            params.push(`body: ${requestType}? = nil`);
        }
        if (hasQuery && !hasExplicitQuerySerialization) {
            params.push('params: [String: Any]? = nil');
        }
        params.push(...optionalQueryBindings.map((binding) => this.renderMethodParameter(binding)));
        params.push(...optionalHeaderBindings.map((binding) => this.renderMethodParameter(binding)));
        const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
        const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, (_match, paramName) => {
            const param = pathParams.find((candidate) => candidate.rawName === paramName);
            const safeName = param?.safeName || pathParamNames.get(paramName) || SWIFT_CONFIG.namingConventions.propertyName(paramName);
            const style = param?.style || 'simple';
            const explode = param?.explode ?? false;
            return `\\(serializePathParameter(${safeName}, PathParameterSpec(name: ${this.formatSwiftString(paramName)}, style: ${this.formatSwiftString(style)}, explode: ${explode ? 'true' : 'false'})))`;
        });
        const pathCall = `ApiPaths.${SWIFT_CONFIG.namingConventions.methodName(config.sdkType)}Path("${pathTemplate}")`;
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
                        ? `try await client.get(${requestPathCall}, params: nil, headers: requestHeaders${typedResponseArg})`
                        : `try await client.get(${requestPathCall}, params: params, headers: requestHeaders${typedResponseArg})`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `try await client.get(${requestPathCall}${typedResponseArg})`
                        : `try await client.get(${requestPathCall}, params: params${typedResponseArg})`;
                }
                else if (hasHeaders) {
                    call = `try await client.get(${requestPathCall}, params: nil, headers: requestHeaders${typedResponseArg})`;
                }
                else {
                    call = `try await client.get(${requestPathCall}${typedResponseArg})`;
                }
                break;
            case 'post':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = hasExplicitQuerySerialization
                            ? `try await client.post(${requestPathCall}, body: body, params: nil, headers: requestHeaders${contentTypeArg}${typedResponseArg})`
                            : `try await client.post(${requestPathCall}, body: body, params: params, headers: requestHeaders${contentTypeArg}${typedResponseArg})`;
                    }
                    else if (hasQuery) {
                        call = hasExplicitQuerySerialization
                            ? `try await client.post(${requestPathCall}, body: body, params: nil, headers: nil${contentTypeArg}${typedResponseArg})`
                            : `try await client.post(${requestPathCall}, body: body, params: params, headers: nil${contentTypeArg}${typedResponseArg})`;
                    }
                    else if (hasHeaders) {
                        call = `try await client.post(${requestPathCall}, body: body, params: nil, headers: requestHeaders${contentTypeArg}${typedResponseArg})`;
                    }
                    else {
                        call = `try await client.post(${requestPathCall}, body: body, params: nil, headers: nil${contentTypeArg}${typedResponseArg})`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `try await client.post(${requestPathCall}, body: nil, params: nil, headers: requestHeaders${typedResponseArg})`
                        : `try await client.post(${requestPathCall}, body: nil, params: params, headers: requestHeaders${typedResponseArg})`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `try await client.post(${requestPathCall}, body: nil${typedResponseArg})`
                        : `try await client.post(${requestPathCall}, body: nil, params: params${typedResponseArg})`;
                }
                else if (hasHeaders) {
                    call = `try await client.post(${requestPathCall}, body: nil, params: nil, headers: requestHeaders${typedResponseArg})`;
                }
                else {
                    call = `try await client.post(${requestPathCall}, body: nil${typedResponseArg})`;
                }
                break;
            case 'put':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = hasExplicitQuerySerialization
                            ? `try await client.put(${requestPathCall}, body: body, params: nil, headers: requestHeaders${contentTypeArg}${typedResponseArg})`
                            : `try await client.put(${requestPathCall}, body: body, params: params, headers: requestHeaders${contentTypeArg}${typedResponseArg})`;
                    }
                    else if (hasQuery) {
                        call = hasExplicitQuerySerialization
                            ? `try await client.put(${requestPathCall}, body: body, params: nil, headers: nil${contentTypeArg}${typedResponseArg})`
                            : `try await client.put(${requestPathCall}, body: body, params: params, headers: nil${contentTypeArg}${typedResponseArg})`;
                    }
                    else if (hasHeaders) {
                        call = `try await client.put(${requestPathCall}, body: body, params: nil, headers: requestHeaders${contentTypeArg}${typedResponseArg})`;
                    }
                    else {
                        call = `try await client.put(${requestPathCall}, body: body, params: nil, headers: nil${contentTypeArg}${typedResponseArg})`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `try await client.put(${requestPathCall}, body: nil, params: nil, headers: requestHeaders${typedResponseArg})`
                        : `try await client.put(${requestPathCall}, body: nil, params: params, headers: requestHeaders${typedResponseArg})`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `try await client.put(${requestPathCall}, body: nil${typedResponseArg})`
                        : `try await client.put(${requestPathCall}, body: nil, params: params${typedResponseArg})`;
                }
                else if (hasHeaders) {
                    call = `try await client.put(${requestPathCall}, body: nil, params: nil, headers: requestHeaders${typedResponseArg})`;
                }
                else {
                    call = `try await client.put(${requestPathCall}, body: nil${typedResponseArg})`;
                }
                break;
            case 'delete':
                if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `try await client.delete(${requestPathCall}, params: nil, headers: requestHeaders${typedResponseArg})`
                        : `try await client.delete(${requestPathCall}, params: params, headers: requestHeaders${typedResponseArg})`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `try await client.delete(${requestPathCall}${typedResponseArg})`
                        : `try await client.delete(${requestPathCall}, params: params${typedResponseArg})`;
                }
                else if (hasHeaders) {
                    call = `try await client.delete(${requestPathCall}, params: nil, headers: requestHeaders${typedResponseArg})`;
                }
                else {
                    call = `try await client.delete(${requestPathCall}${typedResponseArg})`;
                }
                break;
            case 'patch':
                if (hasBody) {
                    if (hasQuery && hasHeaders) {
                        call = hasExplicitQuerySerialization
                            ? `try await client.patch(${requestPathCall}, body: body, params: nil, headers: requestHeaders${contentTypeArg}${typedResponseArg})`
                            : `try await client.patch(${requestPathCall}, body: body, params: params, headers: requestHeaders${contentTypeArg}${typedResponseArg})`;
                    }
                    else if (hasQuery) {
                        call = hasExplicitQuerySerialization
                            ? `try await client.patch(${requestPathCall}, body: body, params: nil, headers: nil${contentTypeArg}${typedResponseArg})`
                            : `try await client.patch(${requestPathCall}, body: body, params: params, headers: nil${contentTypeArg}${typedResponseArg})`;
                    }
                    else if (hasHeaders) {
                        call = `try await client.patch(${requestPathCall}, body: body, params: nil, headers: requestHeaders${contentTypeArg}${typedResponseArg})`;
                    }
                    else {
                        call = `try await client.patch(${requestPathCall}, body: body, params: nil, headers: nil${contentTypeArg}${typedResponseArg})`;
                    }
                }
                else if (hasQuery && hasHeaders) {
                    call = hasExplicitQuerySerialization
                        ? `try await client.patch(${requestPathCall}, body: nil, params: nil, headers: requestHeaders${typedResponseArg})`
                        : `try await client.patch(${requestPathCall}, body: nil, params: params, headers: requestHeaders${typedResponseArg})`;
                }
                else if (hasQuery) {
                    call = hasExplicitQuerySerialization
                        ? `try await client.patch(${requestPathCall}, body: nil${typedResponseArg})`
                        : `try await client.patch(${requestPathCall}, body: nil, params: params${typedResponseArg})`;
                }
                else if (hasHeaders) {
                    call = `try await client.patch(${requestPathCall}, body: nil, params: nil, headers: requestHeaders${typedResponseArg})`;
                }
                else {
                    call = `try await client.patch(${requestPathCall}, body: nil${typedResponseArg})`;
                }
                break;
            default:
                call = `try await client.request("${toHttpMethodLiteral(httpMethod)}", ${requestPathCall}, body: ${hasBody ? 'body' : 'nil'}, params: ${hasQuery && !hasExplicitQuerySerialization ? 'params' : 'nil'}, headers: ${hasHeaders ? 'requestHeaders' : 'nil'}${hasBody && requestBodyInfo?.mediaType ? `, contentType: "${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : ''}${typedResponseArg})`;
        }
        const docComment = op.summary ? `    /// ${op.summary}\n` : '';
        const queryBlock = hasExplicitQuerySerialization
            ? `        let query = buildQueryString([
${this.renderQueryParameterSpecs(queryBindings, 12)}
        ])
`
            : '';
        const requestHeaderBlock = hasHeaders
            ? `        let requestHeaders = buildRequestHeaders(
${this.renderHeaderParameterDictionary(headerBindings, 12)},
${this.renderHeaderParameterDictionary(cookieBindings, 12)}
        )
`
            : '';
        if (isEventStreamResponse) {
            const streamArgs = [
                this.formatSwiftString(toHttpMethodLiteral(httpMethod)),
                requestPathCall,
                hasBody ? 'body: body' : 'body: nil',
                hasQuery && !hasExplicitQuerySerialization ? 'params: params' : 'params: nil',
                hasHeaders ? 'headers: requestHeaders' : 'headers: nil',
                hasBody && requestBodyInfo?.mediaType ? `contentType: "${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : 'contentType: nil',
                `responseType: ${responseType}.self`,
            ].join(', ');
            return `${docComment}    public func ${methodName}(${params.join(', ')}) throws -> AsyncThrowingStream<${responseType}, Error> {
${queryBlock}${requestHeaderBlock}        return try client.stream(${streamArgs})
    }`;
        }
        if (responseType === 'Void') {
            return `${docComment}    public func ${methodName}(${params.join(', ')}) async throws -> Void {
${queryBlock}${requestHeaderBlock}        _ = ${call}
    }`;
        }
        if (responseType === 'Any') {
            return `${docComment}    public func ${methodName}(${params.join(', ')}) async throws -> Any? {
${queryBlock}${requestHeaderBlock}        return ${call}
    }`;
        }
        return `${docComment}    public func ${methodName}(${params.join(', ')}) async throws -> ${responseType}? {
${queryBlock}${requestHeaderBlock}        return ${call}
    }`;
    }
    createNamedParameterBindings(parameters, knownModels, reservedNames) {
        const keys = parameters.map((parameter, index) => `${parameter?.in || 'parameter'}:${parameter?.name || 'value'}:${index}`);
        const rawNameByKey = new Map(keys.map((key, index) => [key, String(parameters[index]?.name || `value${index + 1}`)]));
        const safeNameByKey = createUniqueIdentifierMap(keys, (key) => SWIFT_CONFIG.namingConventions.propertyName(rawNameByKey.get(key) || 'value'), reservedNames);
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
    getNamedParameterType(parameter, knownModels) {
        const contentSchema = extractOpenApiParameterContentSchema(parameter);
        if (contentSchema) {
            return this.ensureKnownType(getSwiftType(contentSchema, SWIFT_CONFIG), knownModels);
        }
        return parameter?.schema ? this.ensureKnownType(getSwiftType(parameter.schema, SWIFT_CONFIG), knownModels) : 'Any';
    }
    renderMethodParameter(binding) {
        return binding.required
            ? `${binding.safeName}: ${binding.type}`
            : `${binding.safeName}: ${binding.type}? = nil`;
    }
    renderNamedParameterDictionary(bindings, indentation) {
        const indent = ' '.repeat(indentation);
        if (bindings.length === 0) {
            return `${indent}[:]`;
        }
        const lines = bindings.map((binding) => {
            return `${indent}    ${this.formatSwiftString(String(binding.parameter?.name || binding.safeName))}: ${binding.safeName},`;
        });
        return [`${indent}[`, ...lines, `${indent}]`].join('\n');
    }
    renderHeaderParameterDictionary(bindings, indentation) {
        const indent = ' '.repeat(indentation);
        if (bindings.length === 0) {
            return `${indent}[:]`;
        }
        const lines = bindings.map((binding) => {
            return `${indent}    ${this.formatSwiftString(String(binding.parameter?.name || binding.safeName))}: HeaderParameterSpec(value: ${binding.safeName}, style: ${this.formatSwiftString(binding.style)}, explode: ${binding.explode ? 'true' : 'false'}, contentType: ${binding.contentType ? this.formatSwiftString(binding.contentType) : 'nil'}),`;
        });
        return [`${indent}[`, ...lines, `${indent}]`].join('\n');
    }
    formatSwiftString(value) {
        return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    renderQueryParameterSpecs(bindings, indentation) {
        const indent = ' '.repeat(indentation);
        return bindings.map((binding) => {
            return `${indent}QueryParameterSpec(name: ${this.formatSwiftString(String(binding.parameter?.name || binding.safeName))}, value: ${binding.safeName}, style: ${this.formatSwiftString(binding.style)}, explode: ${binding.explode ? 'true' : 'false'}, allowReserved: ${binding.allowReserved ? 'true' : 'false'}, contentType: ${binding.contentType ? this.formatSwiftString(binding.contentType) : 'nil'})`;
        }).join(',\n');
    }
    generateQuerySerializationHelpers() {
        return `    private struct QueryParameterSpec {
        let name: String
        let value: Any?
        let style: String
        let explode: Bool
        let allowReserved: Bool
        let contentType: String?
    }

    private func buildQueryString(_ parameters: [QueryParameterSpec]) -> String {
        var pairs: [String] = []
        for parameter in parameters {
            appendSerializedParameter(&pairs, parameter)
        }
        return pairs.joined(separator: "&")
    }

    private func appendSerializedParameter(_ pairs: inout [String], _ parameter: QueryParameterSpec) {
        guard let value = parameter.value else { return }
        if let contentType = parameter.contentType, !contentType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let data = (try? JSONSerialization.data(withJSONObject: value, options: [])) ?? Data(String(describing: value).utf8)
            let json = String(data: data, encoding: .utf8) ?? String(describing: value)
            pairs.append("\\(urlEncode(parameter.name))=\\(encodeQueryValue(json, allowReserved: parameter.allowReserved))")
            return
        }

        let style = parameter.style.isEmpty ? "form" : parameter.style
        if style == "deepObject", let object = value as? [String: Any] {
            appendDeepObjectParameter(&pairs, name: parameter.name, values: object, allowReserved: parameter.allowReserved)
        } else if let array = value as? [Any] {
            appendArrayParameter(&pairs, name: parameter.name, values: array, style: style, explode: parameter.explode, allowReserved: parameter.allowReserved)
        } else if let object = value as? [String: Any] {
            appendObjectParameter(&pairs, name: parameter.name, values: object, style: style, explode: parameter.explode, allowReserved: parameter.allowReserved)
        } else {
            pairs.append("\\(urlEncode(parameter.name))=\\(encodeQueryValue(String(describing: value), allowReserved: parameter.allowReserved))")
        }
    }

    private func appendArrayParameter(
        _ pairs: inout [String],
        name: String,
        values: [Any],
        style: String,
        explode: Bool,
        allowReserved: Bool
    ) {
        let serialized = values.map { String(describing: $0) }
        guard !serialized.isEmpty else { return }
        if style == "form" && explode {
            for item in serialized {
                pairs.append("\\(urlEncode(name))=\\(encodeQueryValue(item, allowReserved: allowReserved))")
            }
            return
        }
        pairs.append("\\(urlEncode(name))=\\(encodeQueryValue(serialized.joined(separator: ","), allowReserved: allowReserved))")
    }

    private func appendObjectParameter(
        _ pairs: inout [String],
        name: String,
        values: [String: Any],
        style: String,
        explode: Bool,
        allowReserved: Bool
    ) {
        var serialized: [String] = []
        for (key, value) in values {
            if style == "form" && explode {
                pairs.append("\\(urlEncode(key))=\\(encodeQueryValue(String(describing: value), allowReserved: allowReserved))")
            } else {
                serialized.append(key)
                serialized.append(String(describing: value))
            }
        }
        if !serialized.isEmpty {
            pairs.append("\\(urlEncode(name))=\\(encodeQueryValue(serialized.joined(separator: ","), allowReserved: allowReserved))")
        }
    }

    private func appendDeepObjectParameter(_ pairs: inout [String], name: String, values: [String: Any], allowReserved: Bool) {
        for (key, value) in values {
            pairs.append("\\(urlEncode("\\(name)[\\(key)]"))=\\(encodeQueryValue(String(describing: value), allowReserved: allowReserved))")
        }
    }

    private func encodeQueryValue(_ value: String, allowReserved: Bool) -> String {
        var encoded = urlEncode(value)
        if !allowReserved { return encoded }
        [
            "%3A": ":", "%2F": "/", "%3F": "?", "%23": "#",
            "%5B": "[", "%5D": "]", "%40": "@", "%21": "!",
            "%24": "$", "%26": "&", "%27": "'", "%28": "(",
            "%29": ")", "%2A": "*", "%2B": "+", "%2C": ",",
            "%3B": ";", "%3D": "=",
        ].forEach { encoded = encoded.replacingOccurrences(of: $0.key, with: $0.value) }
        return encoded
    }

    private func urlEncode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
    }`;
    }
    generatePathSerializationHelpers() {
        return `    private struct PathParameterSpec {
        let name: String
        let style: String
        let explode: Bool
    }

    private func serializePathParameter(_ value: Any?, _ spec: PathParameterSpec) -> String {
        guard let value else { return "" }
        let style = spec.style.isEmpty ? "simple" : spec.style
        if let array = value as? [Any] {
            return serializePathArray(spec.name, array, style, spec.explode)
        }
        if let object = value as? [String: Any] {
            return serializePathObject(spec.name, object, style, spec.explode)
        }
        return pathPrimitivePrefix(spec.name, style) + pathEncode(String(describing: value))
    }

    private func serializePathArray(_ name: String, _ values: [Any], _ style: String, _ explode: Bool) -> String {
        let serialized = values.map { pathEncode(String(describing: $0)) }
        if serialized.isEmpty { return pathPrefix(name, style) }
        if style == "matrix" {
            if explode {
                return serialized.map { ";\\(name)=\\($0)" }.joined()
            }
            return ";\\(name)=" + serialized.joined(separator: ",")
        }
        let separator = explode ? "." : ","
        return pathPrefix(name, style) + serialized.joined(separator: separator)
    }

    private func serializePathObject(_ name: String, _ values: [String: Any], _ style: String, _ explode: Bool) -> String {
        var entries: [String] = []
        var exploded: [String] = []
        for (key, value) in values {
            let escapedKey = pathEncode(key)
            let escapedValue = pathEncode(String(describing: value))
            if explode {
                if style == "matrix" {
                    exploded.append(";\\(escapedKey)=\\(escapedValue)")
                } else {
                    exploded.append("\\(escapedKey)=\\(escapedValue)")
                }
            } else {
                entries.append(escapedKey)
                entries.append(escapedValue)
            }
        }
        if style == "matrix" {
            if explode {
                return exploded.joined()
            }
            return ";\\(name)=" + entries.joined(separator: ",")
        }
        if explode {
            let separator = style == "label" ? "." : ","
            return pathPrefix(name, style) + exploded.joined(separator: separator)
        }
        return pathPrefix(name, style) + entries.joined(separator: ",")
    }

    private func pathPrefix(_ name: String, _ style: String) -> String {
        if style == "label" { return "." }
        if style == "matrix" { return ";\\(name)" }
        return ""
    }

    private func pathPrimitivePrefix(_ name: String, _ style: String) -> String {
        style == "matrix" ? ";\\(name)=" : pathPrefix(name, style)
    }

    private func pathEncode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
    }`;
    }
    generateRequestHeaderHelpers() {
        return `    private struct HeaderParameterSpec {
        let value: Any?
        let style: String
        let explode: Bool
        let contentType: String?
    }

    private func buildRequestHeaders(_ headers: [String: HeaderParameterSpec], _ cookies: [String: HeaderParameterSpec]) -> [String: String]? {
        var requestHeaders: [String: String] = [:]
        for (name, parameter) in headers {
            if let serialized = serializeParameterValue(parameter) {
                requestHeaders[name] = serialized
            }
        }

        if let cookieHeader = buildCookieHeader(cookies), !cookieHeader.isEmpty {
            requestHeaders["Cookie"] = requestHeaders["Cookie"].map { "\\($0); \\(cookieHeader)" } ?? cookieHeader
        }

        return requestHeaders.isEmpty ? nil : requestHeaders
    }

    private func buildCookieHeader(_ cookies: [String: HeaderParameterSpec]) -> String? {
        let pairs = cookies.compactMap { name, parameter -> String? in
            guard let serialized = serializeParameterValue(parameter) else { return nil }
            return "\\(urlEncode(name))=\\(urlEncode(serialized))"
        }
        return pairs.isEmpty ? nil : pairs.joined(separator: "; ")
    }

    private func serializeParameterValue(_ parameter: HeaderParameterSpec?) -> String? {
        guard let parameter, let value = parameter.value else { return nil }
        if let contentType = parameter.contentType, !contentType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            if JSONSerialization.isValidJSONObject(value),
               let data = try? JSONSerialization.data(withJSONObject: value, options: []),
               let json = String(data: data, encoding: .utf8) {
                return json
            }
            return String(describing: value)
        }
        if let array = value as? [Any?] {
            return array.compactMap { $0.map { String(describing: $0) } }.joined(separator: ",")
        }
        if let object = value as? [String: Any] {
            var values: [String] = []
            for (key, item) in object {
                if parameter.explode {
                    values.append("\\(key)=\\(item)")
                } else {
                    values.append(key)
                    values.append(String(describing: item))
                }
            }
            return values.joined(separator: ",")
        }
        if let date = value as? Date {
            return ISO8601DateFormatter().string(from: date)
        }
        return String(describing: value)
    }

    private func urlEncode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
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
            options: 'options',
            head: 'head',
            trace: 'trace',
            query: 'query',
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

    public static func appendQueryString(_ path: String, _ rawQueryString: String) -> String {
        let query = rawQueryString.drop(while: { $0 == "?" })
        if query.isEmpty {
            return path
        }
        return path.contains("?") ? "\(path)&\(query)" : "\(path)?\(query)"
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
