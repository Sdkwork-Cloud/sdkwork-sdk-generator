import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import {
  normalizeOperationId,
  resolveScopedMethodNames,
  resolveSimplifiedTagNames,
  stripTagPrefixFromOperationId,
} from '../../framework/naming.js';
import { resolveJvmSdkIdentity } from '../../framework/jvm-sdk-identity.js';
import { supportsRequestBodyByDefault, toHttpMethodLiteral } from '../../framework/http-methods.js';
import { resolveMediaTypeSchema } from '../../framework/schema.js';
import { JAVA_CONFIG, getJavaType } from './config.js';
import {
  extractOpenApiParameterContentSchema,
  requiresExplicitOpenApiQuerySerialization,
  resolveOpenApiParameterSerialization,
} from '../../framework/parameter-serialization.js';

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
    const identity = resolveJvmSdkIdentity(config);
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
    const knownModels = new Set<string>(
      Object.keys(ctx.schemas).map((schemaName) => JAVA_CONFIG.namingConventions.modelName(schemaName))
    );

    for (const tag of tags) {
      const group = ctx.apiGroups[tag];
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      files.push(this.generateApiClass(tag, resolvedTagName, group.operations, identity, config, knownModels));
    }

    files.push(this.generatePaths(identity, config));
    files.push(this.generateApiIndex(tags, resolvedTagNames, identity, config));

    return files;
  }

  private generateApiClass(
    tag: string,
    resolvedTagName: string,
    operations: any[],
    identity: ReturnType<typeof resolveJvmSdkIdentity>,
    config: GeneratorConfig,
    knownModels: Set<string>
  ): GeneratedFile {
    const className = `${JAVA_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
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
${needsQuerySerializationHelpers ? `\n${this.generateQuerySerializationHelpers()}` : ''}
${needsRequestHeaderHelpers ? `\n${this.generateRequestHeaderHelpers()}` : ''}
}
`),
      language: 'java',
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
    const requestBodySchema = requestBodyInfo?.schema;
    const hasExplicitQuerySerialization = queryParams.some((param: any) => requiresExplicitOpenApiQuerySerialization(param));
    const contentTypeArg = requestBodyInfo?.mediaType
      ? `, "${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
      : '';
    const requestType = requestBodySchema
      ? getJavaType(requestBodySchema, JAVA_CONFIG)
      : 'Object';
    const responseSchema = this.extractResponseSchema(op);
    const responseType = responseSchema
      ? getJavaType(responseSchema, JAVA_CONFIG)
      : this.inferFallbackResponseType(op);

    const pathParamNames = createUniqueIdentifierMap(
      rawPathParams,
      (value) => JAVA_CONFIG.namingConventions.propertyName(value),
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
      params.push(...pathParams.map((param) => `String ${param.safeName}`));
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
    const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, (_match, paramName: string) => {
      const safeName = pathParamNames.get(paramName) || JAVA_CONFIG.namingConventions.propertyName(paramName);
      return `" + ${safeName} + "`;
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
        } else if (hasQuery) {
          call = hasExplicitQuerySerialization
            ? `client.get(${requestPathCall})`
            : `client.get(${requestPathCall}, params)`;
        } else if (hasHeaders) {
          call = `client.get(${requestPathCall}, null, requestHeaders)`;
        } else {
          call = `client.get(${requestPathCall})`;
        }
        break;
      case 'post':
        if (hasBody) {
          if (hasQuery && hasHeaders) {
            call = hasExplicitQuerySerialization
              ? `client.post(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`
              : `client.post(${requestPathCall}, body, params, requestHeaders${contentTypeArg})`;
          } else if (hasQuery) {
            call = hasExplicitQuerySerialization
              ? `client.post(${requestPathCall}, body, null, null${contentTypeArg})`
              : `client.post(${requestPathCall}, body, params, null${contentTypeArg})`;
          } else if (hasHeaders) {
            call = `client.post(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`;
          } else {
            call = `client.post(${requestPathCall}, body, null, null${contentTypeArg})`;
          }
        } else if (hasQuery && hasHeaders) {
          call = hasExplicitQuerySerialization
            ? `client.post(${requestPathCall}, null, null, requestHeaders)`
            : `client.post(${requestPathCall}, null, params, requestHeaders)`;
        } else if (hasQuery) {
          call = hasExplicitQuerySerialization
            ? `client.post(${requestPathCall}, null)`
            : `client.post(${requestPathCall}, null, params)`;
        } else if (hasHeaders) {
          call = `client.post(${requestPathCall}, null, null, requestHeaders)`;
        } else {
          call = `client.post(${requestPathCall}, null)`;
        }
        break;
      case 'put':
        if (hasBody) {
          if (hasQuery && hasHeaders) {
            call = hasExplicitQuerySerialization
              ? `client.put(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`
              : `client.put(${requestPathCall}, body, params, requestHeaders${contentTypeArg})`;
          } else if (hasQuery) {
            call = hasExplicitQuerySerialization
              ? `client.put(${requestPathCall}, body, null, null${contentTypeArg})`
              : `client.put(${requestPathCall}, body, params, null${contentTypeArg})`;
          } else if (hasHeaders) {
            call = `client.put(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`;
          } else {
            call = `client.put(${requestPathCall}, body, null, null${contentTypeArg})`;
          }
        } else if (hasQuery && hasHeaders) {
          call = hasExplicitQuerySerialization
            ? `client.put(${requestPathCall}, null, null, requestHeaders)`
            : `client.put(${requestPathCall}, null, params, requestHeaders)`;
        } else if (hasQuery) {
          call = hasExplicitQuerySerialization
            ? `client.put(${requestPathCall}, null)`
            : `client.put(${requestPathCall}, null, params)`;
        } else if (hasHeaders) {
          call = `client.put(${requestPathCall}, null, null, requestHeaders)`;
        } else {
          call = `client.put(${requestPathCall}, null)`;
        }
        break;
      case 'delete':
        if (hasQuery && hasHeaders) {
          call = hasExplicitQuerySerialization
            ? `client.delete(${requestPathCall}, null, requestHeaders)`
            : `client.delete(${requestPathCall}, params, requestHeaders)`;
        } else if (hasQuery) {
          call = hasExplicitQuerySerialization
            ? `client.delete(${requestPathCall})`
            : `client.delete(${requestPathCall}, params)`;
        } else if (hasHeaders) {
          call = `client.delete(${requestPathCall}, null, requestHeaders)`;
        } else {
          call = `client.delete(${requestPathCall})`;
        }
        break;
      case 'patch':
        if (hasBody) {
          if (hasQuery && hasHeaders) {
            call = hasExplicitQuerySerialization
              ? `client.patch(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`
              : `client.patch(${requestPathCall}, body, params, requestHeaders${contentTypeArg})`;
          } else if (hasQuery) {
            call = hasExplicitQuerySerialization
              ? `client.patch(${requestPathCall}, body, null, null${contentTypeArg})`
              : `client.patch(${requestPathCall}, body, params, null${contentTypeArg})`;
          } else if (hasHeaders) {
            call = `client.patch(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`;
          } else {
            call = `client.patch(${requestPathCall}, body, null, null${contentTypeArg})`;
          }
        } else if (hasQuery && hasHeaders) {
          call = hasExplicitQuerySerialization
            ? `client.patch(${requestPathCall}, null, null, requestHeaders)`
            : `client.patch(${requestPathCall}, null, params, requestHeaders)`;
        } else if (hasQuery) {
          call = hasExplicitQuerySerialization
            ? `client.patch(${requestPathCall}, null)`
            : `client.patch(${requestPathCall}, null, params)`;
        } else if (hasHeaders) {
          call = `client.patch(${requestPathCall}, null, null, requestHeaders)`;
        } else {
          call = `client.patch(${requestPathCall}, null)`;
        }
        break;
      default:
        call = `client.request("${toHttpMethodLiteral(httpMethod)}", ${requestPathCall}, ${hasBody ? 'body' : 'null'}, ${hasQuery && !hasExplicitQuerySerialization ? 'params' : 'null'}, ${hasHeaders ? 'requestHeaders' : 'null'}, ${hasBody && requestBodyInfo?.mediaType ? `"${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : 'null'})`;
    }

    const docComment = op.summary ? `    /** ${op.summary} */\n` : '';
    const requestHeaderBlock = hasHeaders
      ? `        Map<String, String> requestHeaders = buildRequestHeaders(
${this.renderNamedParameterMap(headerBindings, 16)},
${this.renderNamedParameterMap(cookieBindings, 16)}
        );
`
      : '';
    const queryBlock = hasExplicitQuerySerialization
      ? `        String query = buildQueryString(List.of(
${this.renderQueryParameterSpecs(queryBindings, 12)}
        ));
`
      : '';
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

  private createNamedParameterBindings(
    parameters: any[],
    knownModels: Set<string>,
    reservedNames: Iterable<string>
  ): NamedParameterBinding[] {
    const keys = parameters.map((parameter, index) => `${parameter?.in || 'parameter'}:${parameter?.name || 'value'}:${index}`);
    const rawNameByKey = new Map(keys.map((key, index) => [key, String(parameters[index]?.name || `value${index + 1}`)]));
    const safeNameByKey = createUniqueIdentifierMap(
      keys,
      (key) => JAVA_CONFIG.namingConventions.propertyName(rawNameByKey.get(key) || 'value'),
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

  private getNamedParameterType(parameter: any, knownModels: Set<string>): string {
    const contentSchema = extractOpenApiParameterContentSchema(parameter);
    if (contentSchema) {
      return this.ensureKnownType(getJavaType(contentSchema, JAVA_CONFIG), knownModels);
    }
    return parameter?.schema ? this.ensureKnownType(getJavaType(parameter.schema, JAVA_CONFIG), knownModels) : 'Object';
  }

  private renderNamedParameterMap(bindings: NamedParameterBinding[], indentation: number): string {
    const indent = ' '.repeat(indentation);
    if (bindings.length === 0) {
      return `${indent}Map.of()`;
    }
    const entries = bindings.map((binding) => {
      return `${this.formatJavaString(String(binding.parameter?.name || binding.safeName))}, ${binding.safeName}`;
    });
    return `${indent}Map.of(${entries.join(', ')})`;
  }

  private formatJavaString(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  private renderQueryParameterSpecs(bindings: QueryParameterBinding[], indentation: number): string {
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

  private generateQuerySerializationHelpers(): string {
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

  private generateRequestHeaderHelpers(): string {
    return `    private static Map<String, String> buildRequestHeaders(Map<String, ?> headers, Map<String, ?> cookies) {
        Map<String, String> requestHeaders = new java.util.LinkedHashMap<>();
        headers.forEach((name, value) -> {
            String serialized = serializeParameterValue(value);
            if (serialized != null) {
                requestHeaders.put(name, serialized);
            }
        });

        String cookieHeader = buildCookieHeader(cookies);
        if (cookieHeader != null && !cookieHeader.isEmpty()) {
            requestHeaders.merge("Cookie", cookieHeader, (left, right) -> left + "; " + right);
        }

        return requestHeaders.isEmpty() ? null : requestHeaders;
    }

    private static String buildCookieHeader(Map<String, ?> cookies) {
        java.util.List<String> pairs = new java.util.ArrayList<>();
        cookies.forEach((name, value) -> {
            String serialized = serializeParameterValue(value);
            if (serialized != null) {
                pairs.add(urlEncode(name) + "=" + urlEncode(serialized));
            }
        });
        return String.join("; ", pairs);
    }

    private static String serializeParameterValue(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Iterable<?> iterable) {
            java.util.List<String> values = new java.util.ArrayList<>();
            for (Object item : iterable) {
                String serialized = serializeParameterValue(item);
                if (serialized != null) {
                    values.add(serialized);
                }
            }
            return String.join(",", values);
        }
        return String.valueOf(value);
    }

    private static String urlEncode(String value) {
        return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8);
    }`;
  }

  private generateOperationId(method: string, path: string, op: any, tag: string): string {
    if (op.operationId) {
      const normalized = normalizeOperationId(op.operationId);
      return JAVA_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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
    
    return `${actionMap[method] || method}${JAVA_CONFIG.namingConventions.modelName(resource)}`;
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

  private ensureKnownType(typeName: string, knownModels: Set<string>): string {
    if (knownModels.has(typeName)) {
      return typeName;
    }
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

  private generatePaths(packageName: ReturnType<typeof resolveJvmSdkIdentity>, config: GeneratorConfig): GeneratedFile {
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

  private generateApiIndex(
    tags: string[],
    resolvedTagNames: Map<string, string>,
    packageName: ReturnType<typeof resolveJvmSdkIdentity>,
    config: GeneratorConfig
  ): GeneratedFile {
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

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
