import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import {
  normalizeOperationId,
  resolveScopedMethodNames,
  resolveSimplifiedTagNames,
  stripTagPrefixFromOperationId,
} from '../../framework/naming.js';
import { supportsRequestBodyByDefault, toHttpMethodLiteral } from '../../framework/http-methods.js';
import { resolveMediaTypeSchema } from '../../framework/schema.js';
import {
  extractOpenApiParameterContentSchema,
  requiresExplicitOpenApiQuerySerialization,
  resolveOpenApiParameterSerialization,
} from '../../framework/parameter-serialization.js';
import { SWIFT_CONFIG, getSwiftType } from './config.js';

interface NamedParameterBinding {
  parameter: any;
  safeName: string;
  required: boolean;
  type: string;
}

interface QueryParameterBinding extends NamedParameterBinding {
  style: string;
  explode: boolean;
  allowReserved: boolean;
  contentType?: string;
}

export class ApiGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
    const knownModels = new Set<string>(
      Object.keys(ctx.schemas).map((schemaName) => SWIFT_CONFIG.namingConventions.modelName(schemaName))
    );

    for (const tag of tags) {
      const group = ctx.apiGroups[tag];
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      files.push(this.generateApiFile(tag, resolvedTagName, group.operations, config, knownModels));
    }

    files.push(this.generatePaths(config));
    files.push(this.generateApiIndex(tags, resolvedTagNames, config));

    return files;
  }

  private generateApiFile(
    tag: string,
    resolvedTagName: string,
    operations: any[],
    config: GeneratorConfig,
    knownModels: Set<string>
  ): GeneratedFile {
    const className = `${SWIFT_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
    const methodNames = resolveScopedMethodNames(operations, (op) =>
      this.generateOperationId(op.method, op.path, op, tag)
    );
    const methods = operations
      .map((op) => this.generateMethod(op, config, methodNames.get(op) || 'operation', knownModels))
      .join('\n\n');
    const needsRequestHeaderHelpers = operations.some((op) => {
      const allParameters = op.allParameters || op.parameters || [];
      return allParameters.some((param: any) => param?.in === 'header' || param?.in === 'cookie');
    });
    const needsQuerySerializationHelpers = operations.some((op) => {
      const allParameters = op.allParameters || op.parameters || [];
      return allParameters.some((param: any) => param?.in === 'query' && requiresExplicitOpenApiQuerySerialization(param));
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
${needsQuerySerializationHelpers ? `\n${this.generateQuerySerializationHelpers()}` : ''}
${needsRequestHeaderHelpers ? `\n${this.generateRequestHeaderHelpers()}` : ''}
}
`),
      language: 'swift',
      description: `${tag} API module`,
    };
  }

  private generateMethod(op: any, config: GeneratorConfig, methodName: string, knownModels: Set<string>): string {
    const rawPathParams = this.extractPathParams(op.path);
    const allParameters = op.allParameters || op.parameters || [];
    const queryParams = allParameters.filter((param: any) => param?.in === 'query');
    const queryStringParams = allParameters.filter((param: any) => param?.in === 'querystring');
    const headerParams = allParameters.filter((param: any) => param?.in === 'header');
    const cookieParams = allParameters.filter((param: any) => param?.in === 'cookie');
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
    const hasExplicitQuerySerialization = queryParams.some((param: any) => requiresExplicitOpenApiQuerySerialization(param));
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

    const pathParamNames = createUniqueIdentifierMap(
      rawPathParams,
      (value) => SWIFT_CONFIG.namingConventions.propertyName(value),
      [
        hasBody ? 'body' : '',
        hasQuery ? 'params' : '',
        hasRawQueryString ? 'rawQueryString' : '',
        hasHeaders ? 'requestHeaders' : '',
      ]
    );
    const pathParams = rawPathParams.map((rawName) => ({
      rawName,
      safeName: pathParamNames.get(rawName) || rawName,
    }));
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

    const params: string[] = [];
    if (pathParams.length) {
      params.push(...pathParams.map((param) => `${param.safeName}: String`));
    }
    if (hasBody && requestBodyRequired) {
      if (requestBodyRequired) {
        params.push(`body: ${requestType}`);
      } else {
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
    const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, (_match, paramName: string) => {
      const safeName = pathParamNames.get(paramName) || SWIFT_CONFIG.namingConventions.propertyName(paramName);
      return `\\(${safeName})`;
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
        } else if (hasQuery) {
          call = hasExplicitQuerySerialization
            ? `try await client.get(${requestPathCall}${typedResponseArg})`
            : `try await client.get(${requestPathCall}, params: params${typedResponseArg})`;
        } else if (hasHeaders) {
          call = `try await client.get(${requestPathCall}, params: nil, headers: requestHeaders${typedResponseArg})`;
        } else {
          call = `try await client.get(${requestPathCall}${typedResponseArg})`;
        }
        break;
      case 'post':
        if (hasBody) {
          if (hasQuery && hasHeaders) {
            call = hasExplicitQuerySerialization
              ? `try await client.post(${requestPathCall}, body: body, params: nil, headers: requestHeaders${contentTypeArg}${typedResponseArg})`
              : `try await client.post(${requestPathCall}, body: body, params: params, headers: requestHeaders${contentTypeArg}${typedResponseArg})`;
          } else if (hasQuery) {
            call = hasExplicitQuerySerialization
              ? `try await client.post(${requestPathCall}, body: body, params: nil, headers: nil${contentTypeArg}${typedResponseArg})`
              : `try await client.post(${requestPathCall}, body: body, params: params, headers: nil${contentTypeArg}${typedResponseArg})`;
          } else if (hasHeaders) {
            call = `try await client.post(${requestPathCall}, body: body, params: nil, headers: requestHeaders${contentTypeArg}${typedResponseArg})`;
          } else {
            call = `try await client.post(${requestPathCall}, body: body, params: nil, headers: nil${contentTypeArg}${typedResponseArg})`;
          }
        } else if (hasQuery && hasHeaders) {
          call = hasExplicitQuerySerialization
            ? `try await client.post(${requestPathCall}, body: nil, params: nil, headers: requestHeaders${typedResponseArg})`
            : `try await client.post(${requestPathCall}, body: nil, params: params, headers: requestHeaders${typedResponseArg})`;
        } else if (hasQuery) {
          call = hasExplicitQuerySerialization
            ? `try await client.post(${requestPathCall}, body: nil${typedResponseArg})`
            : `try await client.post(${requestPathCall}, body: nil, params: params${typedResponseArg})`;
        } else if (hasHeaders) {
          call = `try await client.post(${requestPathCall}, body: nil, params: nil, headers: requestHeaders${typedResponseArg})`;
        } else {
          call = `try await client.post(${requestPathCall}, body: nil${typedResponseArg})`;
        }
        break;
      case 'put':
        if (hasBody) {
          if (hasQuery && hasHeaders) {
            call = hasExplicitQuerySerialization
              ? `try await client.put(${requestPathCall}, body: body, params: nil, headers: requestHeaders${contentTypeArg}${typedResponseArg})`
              : `try await client.put(${requestPathCall}, body: body, params: params, headers: requestHeaders${contentTypeArg}${typedResponseArg})`;
          } else if (hasQuery) {
            call = hasExplicitQuerySerialization
              ? `try await client.put(${requestPathCall}, body: body, params: nil, headers: nil${contentTypeArg}${typedResponseArg})`
              : `try await client.put(${requestPathCall}, body: body, params: params, headers: nil${contentTypeArg}${typedResponseArg})`;
          } else if (hasHeaders) {
            call = `try await client.put(${requestPathCall}, body: body, params: nil, headers: requestHeaders${contentTypeArg}${typedResponseArg})`;
          } else {
            call = `try await client.put(${requestPathCall}, body: body, params: nil, headers: nil${contentTypeArg}${typedResponseArg})`;
          }
        } else if (hasQuery && hasHeaders) {
          call = hasExplicitQuerySerialization
            ? `try await client.put(${requestPathCall}, body: nil, params: nil, headers: requestHeaders${typedResponseArg})`
            : `try await client.put(${requestPathCall}, body: nil, params: params, headers: requestHeaders${typedResponseArg})`;
        } else if (hasQuery) {
          call = hasExplicitQuerySerialization
            ? `try await client.put(${requestPathCall}, body: nil${typedResponseArg})`
            : `try await client.put(${requestPathCall}, body: nil, params: params${typedResponseArg})`;
        } else if (hasHeaders) {
          call = `try await client.put(${requestPathCall}, body: nil, params: nil, headers: requestHeaders${typedResponseArg})`;
        } else {
          call = `try await client.put(${requestPathCall}, body: nil${typedResponseArg})`;
        }
        break;
      case 'delete':
        if (hasQuery && hasHeaders) {
          call = hasExplicitQuerySerialization
            ? `try await client.delete(${requestPathCall}, params: nil, headers: requestHeaders${typedResponseArg})`
            : `try await client.delete(${requestPathCall}, params: params, headers: requestHeaders${typedResponseArg})`;
        } else if (hasQuery) {
          call = hasExplicitQuerySerialization
            ? `try await client.delete(${requestPathCall}${typedResponseArg})`
            : `try await client.delete(${requestPathCall}, params: params${typedResponseArg})`;
        } else if (hasHeaders) {
          call = `try await client.delete(${requestPathCall}, params: nil, headers: requestHeaders${typedResponseArg})`;
        } else {
          call = `try await client.delete(${requestPathCall}${typedResponseArg})`;
        }
        break;
      case 'patch':
        if (hasBody) {
          if (hasQuery && hasHeaders) {
            call = hasExplicitQuerySerialization
              ? `try await client.patch(${requestPathCall}, body: body, params: nil, headers: requestHeaders${contentTypeArg}${typedResponseArg})`
              : `try await client.patch(${requestPathCall}, body: body, params: params, headers: requestHeaders${contentTypeArg}${typedResponseArg})`;
          } else if (hasQuery) {
            call = hasExplicitQuerySerialization
              ? `try await client.patch(${requestPathCall}, body: body, params: nil, headers: nil${contentTypeArg}${typedResponseArg})`
              : `try await client.patch(${requestPathCall}, body: body, params: params, headers: nil${contentTypeArg}${typedResponseArg})`;
          } else if (hasHeaders) {
            call = `try await client.patch(${requestPathCall}, body: body, params: nil, headers: requestHeaders${contentTypeArg}${typedResponseArg})`;
          } else {
            call = `try await client.patch(${requestPathCall}, body: body, params: nil, headers: nil${contentTypeArg}${typedResponseArg})`;
          }
        } else if (hasQuery && hasHeaders) {
          call = hasExplicitQuerySerialization
            ? `try await client.patch(${requestPathCall}, body: nil, params: nil, headers: requestHeaders${typedResponseArg})`
            : `try await client.patch(${requestPathCall}, body: nil, params: params, headers: requestHeaders${typedResponseArg})`;
        } else if (hasQuery) {
          call = hasExplicitQuerySerialization
            ? `try await client.patch(${requestPathCall}, body: nil${typedResponseArg})`
            : `try await client.patch(${requestPathCall}, body: nil, params: params${typedResponseArg})`;
        } else if (hasHeaders) {
          call = `try await client.patch(${requestPathCall}, body: nil, params: nil, headers: requestHeaders${typedResponseArg})`;
        } else {
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
${this.renderNamedParameterDictionary(headerBindings, 12)},
${this.renderNamedParameterDictionary(cookieBindings, 12)}
        )
`
      : '';
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

  private createNamedParameterBindings(
    parameters: any[],
    knownModels: Set<string>,
    reservedNames: Iterable<string>
  ): NamedParameterBinding[] {
    const keys = parameters.map((parameter, index) => `${parameter?.in || 'parameter'}:${parameter?.name || 'value'}:${index}`);
    const rawNameByKey = new Map(keys.map((key, index) => [key, String(parameters[index]?.name || `value${index + 1}`)]));
    const safeNameByKey = createUniqueIdentifierMap(
      keys,
      (key) => SWIFT_CONFIG.namingConventions.propertyName(rawNameByKey.get(key) || 'value'),
      reservedNames,
    );

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

  private createQueryParameterBindings(
    parameters: any[],
    knownModels: Set<string>,
    reservedNames: Iterable<string>
  ): QueryParameterBinding[] {
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

  private getNamedParameterType(parameter: any, knownModels: Set<string>): string {
    const contentSchema = extractOpenApiParameterContentSchema(parameter);
    if (contentSchema) {
      return this.ensureKnownType(getSwiftType(contentSchema, SWIFT_CONFIG), knownModels);
    }
    return parameter?.schema ? this.ensureKnownType(getSwiftType(parameter.schema, SWIFT_CONFIG), knownModels) : 'Any';
  }

  private renderMethodParameter(binding: NamedParameterBinding): string {
    return binding.required
      ? `${binding.safeName}: ${binding.type}`
      : `${binding.safeName}: ${binding.type}? = nil`;
  }

  private renderNamedParameterDictionary(bindings: NamedParameterBinding[], indentation: number): string {
    const indent = ' '.repeat(indentation);
    if (bindings.length === 0) {
      return `${indent}[:]`;
    }
    const lines = bindings.map((binding) => {
      return `${indent}    ${this.formatSwiftString(String(binding.parameter?.name || binding.safeName))}: ${binding.safeName},`;
    });
    return [`${indent}[`, ...lines, `${indent}]`].join('\n');
  }

  private formatSwiftString(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  private renderQueryParameterSpecs(bindings: QueryParameterBinding[], indentation: number): string {
    const indent = ' '.repeat(indentation);
    return bindings.map((binding) => {
      return `${indent}QueryParameterSpec(name: ${this.formatSwiftString(String(binding.parameter?.name || binding.safeName))}, value: ${binding.safeName}, style: ${this.formatSwiftString(binding.style)}, explode: ${binding.explode ? 'true' : 'false'}, allowReserved: ${binding.allowReserved ? 'true' : 'false'}, contentType: ${binding.contentType ? this.formatSwiftString(binding.contentType) : 'nil'})`;
    }).join(',\n');
  }

  private generateQuerySerializationHelpers(): string {
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

  private generateRequestHeaderHelpers(): string {
    return `    private func buildRequestHeaders(_ headers: [String: Any?], _ cookies: [String: Any?]) -> [String: String]? {
        var requestHeaders: [String: String] = [:]
        for (name, value) in headers {
            if let serialized = serializeParameterValue(value) {
                requestHeaders[name] = serialized
            }
        }

        if let cookieHeader = buildCookieHeader(cookies), !cookieHeader.isEmpty {
            requestHeaders["Cookie"] = requestHeaders["Cookie"].map { "\\($0); \\(cookieHeader)" } ?? cookieHeader
        }

        return requestHeaders.isEmpty ? nil : requestHeaders
    }

    private func buildCookieHeader(_ cookies: [String: Any?]) -> String? {
        let pairs = cookies.compactMap { name, value -> String? in
            guard let serialized = serializeParameterValue(value) else { return nil }
            return "\\(urlEncode(name))=\\(urlEncode(serialized))"
        }
        return pairs.isEmpty ? nil : pairs.joined(separator: "; ")
    }

    private func serializeParameterValue(_ value: Any?) -> String? {
        guard let value else { return nil }
        if let array = value as? [Any?] {
            return array.compactMap { serializeParameterValue($0) }.joined(separator: ",")
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

  private generateOperationId(method: string, path: string, op: any, tag: string): string {
    if (op.operationId) {
      const normalized = normalizeOperationId(op.operationId);
      return SWIFT_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
    }
    
    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
    
    const actionMap: Record<string, string> = {
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

  private extractPathParams(path: string): string[] {
    const matches = path.match(/\{([^}]+)\}/g) || [];
    return matches.map((m) => m.replace(/[{}]/g, ''));
  }

  private extractRequestBodyInfo(op: any): { schema: any; mediaType: string } | undefined {
    const content = op?.requestBody?.content;
    if (!content || typeof content !== 'object') {
      return undefined;
    }

    const mediaType = this.pickRequestBodyMediaType(content as Record<string, any>);
    if (!mediaType) {
      return undefined;
    }
    const schema = resolveMediaTypeSchema((content as Record<string, any>)[mediaType]);
    if (!schema) {
      return undefined;
    }
    return {
      mediaType,
      schema,
    };
  }

  private pickRequestBodyMediaType(content: Record<string, any>): string | undefined {
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

  private extractResponseSchema(op: any): any | undefined {
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

  private pickJsonMediaType(content: Record<string, any>): string | undefined {
    const mediaTypes = Object.keys(content);
    const jsonLike = mediaTypes.find((mediaType) => {
      const normalized = mediaType.toLowerCase();
      return normalized === 'application/json' || normalized.endsWith('+json');
    });
    return jsonLike || mediaTypes[0];
  }

  private inferFallbackResponseType(op: any): string {
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

  private ensureKnownType(typeName: string, _knownModels: Set<string>): string {
    return typeName;
  }

  private normalizeOperationPath(path: string, apiPrefix: string): string {
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

  private generatePaths(config: GeneratorConfig): GeneratedFile {
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

  private generateApiIndex(tags: string[], resolvedTagNames: Map<string, string>, config: GeneratorConfig): GeneratedFile {
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

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
