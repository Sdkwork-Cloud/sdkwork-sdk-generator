import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import {
  normalizeOperationId,
  resolveScopedMethodNames,
  stripTagPrefixFromOperationId,
} from '../../framework/naming.js';
import { resolveOpenAIStyleMethodNames, resolveSdkTagNames, selectCanonicalOpenAIStyleOperations } from '../../framework/openai-surface.js';
import { resolveJvmSdkIdentity } from '../../framework/jvm-sdk-identity.js';
import { supportsRequestBodyByDefault, toHttpMethodLiteral } from '../../framework/http-methods.js';
import { resolveMediaTypeSchema } from '../../framework/schema.js';
import { extractEventStreamResponseInfo } from '../../framework/responses.js';
import { KOTLIN_CONFIG, getKotlinType } from './config.js';
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

interface HeaderParameterBinding extends NamedParameterBinding {
  style: string;
  explode: boolean;
  contentType?: string;
}

export class ApiGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const identity = resolveJvmSdkIdentity(config);
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSdkTagNames(tags, config);
    const knownModels = new Set<string>(
      Object.keys(ctx.schemas).map((schemaName) => KOTLIN_CONFIG.namingConventions.modelName(schemaName))
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
    operations = selectCanonicalOpenAIStyleOperations(tag, operations, config);
    const className = `${KOTLIN_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
    const methodNames = resolveOpenAIStyleMethodNames(tag, operations, config, KOTLIN_CONFIG, 'camel')
      || resolveScopedMethodNames(operations, (op) =>
        this.generateOperationId(op.method, op.path, op, tag)
      );
    const methods = operations
      .map((op) => this.generateMethod(op, config, methodNames.get(op) || 'operation', knownModels))
      .join('\n\n');
    const needsPathSerializationHelpers = operations.some((op) => this.extractPathParams(op.path).length > 0);
    const needsRequestHeaderHelpers = operations.some((op) => {
      const allParameters = op.allParameters || op.parameters || [];
      return allParameters.some((param: any) => param?.in === 'header' || param?.in === 'cookie');
    });
    const needsQuerySerializationHelpers = operations.some((op) => {
      const allParameters = op.allParameters || op.parameters || [];
      return allParameters.some((param: any) => param?.in === 'query' && requiresExplicitOpenApiQuerySerialization(param));
    });

    return {
      path: `src/main/kotlin/${identity.packagePath}/api/${className}.kt`,
      content: this.format(`package ${identity.packageRoot}.api

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import ${identity.packageRoot}.*
import ${identity.packageRoot}.http.HttpClient

class ${className}(private val client: HttpClient) {

${methods}
${needsPathSerializationHelpers ? `\n${this.generatePathSerializationHelpers()}` : ''}
${needsQuerySerializationHelpers ? `\n${this.generateQuerySerializationHelpers()}` : ''}
${needsRequestHeaderHelpers ? `\n${this.generateRequestHeaderHelpers()}` : ''}
}
`),
      language: 'kotlin',
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
    const pathOpenApiParams = allParameters.filter((param: any) => param?.in === 'path');
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
      ? `, "${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
      : '';
    const requestType = requestBodySchema
      ? this.ensureKnownType(getKotlinType(requestBodySchema, KOTLIN_CONFIG), knownModels)
      : 'Any';
    const eventStreamInfo = extractEventStreamResponseInfo(op);
    const isEventStreamResponse = Boolean(eventStreamInfo);
    const responseSchema = eventStreamInfo?.schema ?? this.extractResponseSchema(op);
    const responseType = responseSchema
      ? this.ensureKnownType(getKotlinType(responseSchema, KOTLIN_CONFIG), knownModels)
      : this.inferFallbackResponseType(op);

    const pathParamNames = createUniqueIdentifierMap(
      rawPathParams,
      (value) => KOTLIN_CONFIG.namingConventions.propertyName(value),
      [
        hasBody ? 'body' : '',
        hasQuery ? 'params' : '',
        hasRawQueryString ? 'rawQueryString' : '',
        hasHeaders ? 'requestHeaders' : '',
      ]
    );
    const pathParams = rawPathParams.map((rawName) => {
      const parameter = pathOpenApiParams.find((candidate: any) => candidate?.name === rawName);
      const serialization = resolveOpenApiParameterSerialization(parameter || { name: rawName, in: 'path' });
      return {
        rawName,
        safeName: pathParamNames.get(rawName) || rawName,
        type: parameter?.schema ? this.ensureKnownType(getKotlinType(parameter.schema, KOTLIN_CONFIG), knownModels) : 'String',
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

    const params: string[] = [];
    if (pathParams.length) {
      params.push(...pathParams.map((param) => `${param.safeName}: ${param.type}`));
    }
    if (hasBody && requestBodyRequired) {
      if (requestBodyRequired) {
        params.push(`body: ${requestType}`);
      } else {
        params.push(`body: ${requestType}? = null`);
      }
    }
    if (hasRawQueryString) {
      params.push('rawQueryString: String');
    }
    params.push(...requiredQueryBindings.map((binding) => this.renderMethodParameter(binding)));
    params.push(...requiredHeaderBindings.map((binding) => this.renderMethodParameter(binding)));
    if (hasBody && !requestBodyRequired) {
      params.push(`body: ${requestType}? = null`);
    }
    if (hasQuery && !hasExplicitQuerySerialization) {
      params.push('params: Map<String, Any>? = null');
    }
    params.push(...optionalQueryBindings.map((binding) => this.renderMethodParameter(binding)));
    params.push(...optionalHeaderBindings.map((binding) => this.renderMethodParameter(binding)));

    const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
    const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, (_match, paramName: string) => {
      const param = pathParams.find((candidate) => candidate.rawName === paramName);
      const safeName = param?.safeName || pathParamNames.get(paramName) || KOTLIN_CONFIG.namingConventions.propertyName(paramName);
      const style = param?.style || 'simple';
      const explode = param?.explode ?? false;
      return `\${serializePathParameter(${safeName}, PathParameterSpec(${this.formatKotlinString(paramName)}, ${this.formatKotlinString(style)}, ${explode ? 'true' : 'false'}))}`;
    });
    const pathCall = `ApiPaths.${KOTLIN_CONFIG.namingConventions.methodName(config.sdkType)}Path("${pathTemplate}")`;
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
      ? `        val requestHeaders = buildRequestHeaders(
${this.renderHeaderParameterMap(headerBindings, 12)},
${this.renderHeaderParameterMap(cookieBindings, 12)}
        )
`
      : '';
    const queryBlock = hasExplicitQuerySerialization
      ? `        val query = buildQueryString(listOf(
${this.renderQueryParameterSpecs(queryBindings, 12)}
        ))
`
      : '';

    if (isEventStreamResponse) {
      const streamArgs = [
        `"${toHttpMethodLiteral(httpMethod)}"`,
        requestPathCall,
        hasBody ? 'body' : 'null',
        hasQuery && !hasExplicitQuerySerialization ? 'params' : 'null',
        hasHeaders ? 'requestHeaders' : 'null',
        hasBody && requestBodyInfo?.mediaType ? `"${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : 'null',
        `object : TypeReference<${responseType}>() {}`,
      ].join(', ');

      return `${docComment}    suspend fun ${methodName}(${params.join(', ')}): Sequence<${responseType}> {
${queryBlock}${requestHeaderBlock}        return client.stream(${streamArgs})
    }`;
    }

    if (responseType === 'Unit') {
      return `${docComment}    suspend fun ${methodName}(${params.join(', ')}): Unit {
${queryBlock}${requestHeaderBlock}        ${call}
    }`;
    }

    if (responseType === 'Any') {
      return `${docComment}    suspend fun ${methodName}(${params.join(', ')}): Any? {
${queryBlock}${requestHeaderBlock}        return ${call}
    }`;
    }

    return `${docComment}    suspend fun ${methodName}(${params.join(', ')}): ${responseType}? {
${queryBlock}${requestHeaderBlock}        val raw = ${call}
        return client.convertValue(raw, object : TypeReference<${responseType}>() {})
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

  private createHeaderParameterBindings(
    parameters: any[],
    knownModels: Set<string>,
    reservedNames: Iterable<string>
  ): HeaderParameterBinding[] {
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

  private createNamedParameterBindings(
    parameters: any[],
    knownModels: Set<string>,
    reservedNames: Iterable<string>
  ): NamedParameterBinding[] {
    const keys = parameters.map((parameter, index) => `${parameter?.in || 'parameter'}:${parameter?.name || 'value'}:${index}`);
    const rawNameByKey = new Map(keys.map((key, index) => [key, String(parameters[index]?.name || `value${index + 1}`)]));
    const safeNameByKey = createUniqueIdentifierMap(
      keys,
      (key) => KOTLIN_CONFIG.namingConventions.propertyName(rawNameByKey.get(key) || 'value'),
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
      return this.ensureKnownType(getKotlinType(contentSchema, KOTLIN_CONFIG), knownModels);
    }
    return parameter?.schema ? this.ensureKnownType(getKotlinType(parameter.schema, KOTLIN_CONFIG), knownModels) : 'Any';
  }

  private renderMethodParameter(binding: NamedParameterBinding): string {
    return binding.required
      ? `${binding.safeName}: ${binding.type}`
      : `${binding.safeName}: ${binding.type}? = null`;
  }

  private renderNamedParameterMap(bindings: NamedParameterBinding[], indentation: number): string {
    const indent = ' '.repeat(indentation);
    if (bindings.length === 0) {
      return `${indent}emptyMap()`;
    }
    const lines = bindings.map((binding) => {
      return `${indent}    ${this.formatKotlinString(String(binding.parameter?.name || binding.safeName))} to ${binding.safeName},`;
    });
    return [`${indent}mapOf(`, ...lines, `${indent})`].join('\n');
  }

  private renderHeaderParameterMap(bindings: HeaderParameterBinding[], indentation: number): string {
    const indent = ' '.repeat(indentation);
    if (bindings.length === 0) {
      return `${indent}emptyMap()`;
    }
    const lines = bindings.map((binding) => {
      return `${indent}    ${this.formatKotlinString(String(binding.parameter?.name || binding.safeName))} to HeaderParameterSpec(${[
        binding.safeName,
        this.formatKotlinString(binding.style),
        binding.explode ? 'true' : 'false',
        binding.contentType ? this.formatKotlinString(binding.contentType) : 'null',
      ].join(', ')}),`;
    });
    return [`${indent}mapOf(`, ...lines, `${indent})`].join('\n');
  }

  private formatKotlinString(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  private renderQueryParameterSpecs(bindings: QueryParameterBinding[], indentation: number): string {
    const indent = ' '.repeat(indentation);
    return bindings.map((binding) => {
      return `${indent}QueryParameterSpec(${[
        this.formatKotlinString(String(binding.parameter?.name || binding.safeName)),
        binding.safeName,
        this.formatKotlinString(binding.style),
        binding.explode ? 'true' : 'false',
        binding.allowReserved ? 'true' : 'false',
        binding.contentType ? this.formatKotlinString(binding.contentType) : 'null',
      ].join(', ')})`;
    }).join(',\n');
  }

  private generateQuerySerializationHelpers(): string {
    return `    private data class QueryParameterSpec(
        val name: String,
        val value: Any?,
        val style: String,
        val explode: Boolean,
        val allowReserved: Boolean,
        val contentType: String?,
    )

    private val queryObjectMapper = ObjectMapper().registerKotlinModule()

    private fun buildQueryString(parameters: List<QueryParameterSpec>): String {
        val pairs = mutableListOf<String>()
        parameters.forEach { appendSerializedParameter(pairs, it) }
        return pairs.joinToString("&")
    }

    private fun appendSerializedParameter(pairs: MutableList<String>, parameter: QueryParameterSpec) {
        val value = parameter.value ?: return
        if (!parameter.contentType.isNullOrBlank()) {
            val json = queryObjectMapper.writeValueAsString(value)
            pairs += urlEncode(parameter.name) + "=" + encodeQueryValue(json, parameter.allowReserved)
            return
        }

        val style = parameter.style.ifBlank { "form" }
        when (value) {
            is Iterable<*> -> appendArrayParameter(pairs, parameter.name, value, style, parameter.explode, parameter.allowReserved)
            is Map<*, *> -> if (style == "deepObject") {
                appendDeepObjectParameter(pairs, parameter.name, value, parameter.allowReserved)
            } else {
                appendObjectParameter(pairs, parameter.name, value, style, parameter.explode, parameter.allowReserved)
            }
            else -> pairs += urlEncode(parameter.name) + "=" + encodeQueryValue(value.toString(), parameter.allowReserved)
        }
    }

    private fun appendArrayParameter(
        pairs: MutableList<String>,
        name: String,
        values: Iterable<*>,
        style: String,
        explode: Boolean,
        allowReserved: Boolean,
    ) {
        val serialized = values.mapNotNull { it?.toString() }
        if (serialized.isEmpty()) return
        if (style == "form" && explode) {
            serialized.forEach { pairs += urlEncode(name) + "=" + encodeQueryValue(it, allowReserved) }
            return
        }
        pairs += urlEncode(name) + "=" + encodeQueryValue(serialized.joinToString(","), allowReserved)
    }

    private fun appendObjectParameter(
        pairs: MutableList<String>,
        name: String,
        values: Map<*, *>,
        style: String,
        explode: Boolean,
        allowReserved: Boolean,
    ) {
        val serialized = mutableListOf<String>()
        values.forEach { (key, value) ->
            if (value == null) return@forEach
            if (style == "form" && explode) {
                pairs += urlEncode(key.toString()) + "=" + encodeQueryValue(value.toString(), allowReserved)
            } else {
                serialized += key.toString()
                serialized += value.toString()
            }
        }
        if (serialized.isNotEmpty()) {
            pairs += urlEncode(name) + "=" + encodeQueryValue(serialized.joinToString(","), allowReserved)
        }
    }

    private fun appendDeepObjectParameter(pairs: MutableList<String>, name: String, values: Map<*, *>, allowReserved: Boolean) {
        values.forEach { (key, value) ->
            if (value != null) {
                pairs += urlEncode("$name[$key]") + "=" + encodeQueryValue(value.toString(), allowReserved)
            }
        }
    }

    private fun encodeQueryValue(value: String, allowReserved: Boolean): String {
        var encoded = urlEncode(value)
        if (!allowReserved) return encoded
        mapOf(
            "%3A" to ":", "%2F" to "/", "%3F" to "?", "%23" to "#",
            "%5B" to "[", "%5D" to "]", "%40" to "@", "%21" to "!",
            "%24" to "$", "%26" to "&", "%27" to "'", "%28" to "(",
            "%29" to ")", "%2A" to "*", "%2B" to "+", "%2C" to ",",
            "%3B" to ";", "%3D" to "=",
        ).forEach { (escaped, reserved) -> encoded = encoded.replace(escaped, reserved) }
        return encoded
    }

    private fun urlEncode(value: String): String {
        return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8)
    }`;
  }

  private generatePathSerializationHelpers(): string {
    return `    private data class PathParameterSpec(val name: String, val style: String, val explode: Boolean)

    private fun serializePathParameter(value: Any?, spec: PathParameterSpec): String {
        if (value == null) return ""
        val style = spec.style.ifBlank { "simple" }
        return when (value) {
            is Iterable<*> -> serializePathArray(spec.name, value, style, spec.explode)
            is Map<*, *> -> serializePathObject(spec.name, value, style, spec.explode)
            else -> pathPrimitivePrefix(spec.name, style) + pathEncode(value.toString())
        }
    }

    private fun serializePathArray(name: String, values: Iterable<*>, style: String, explode: Boolean): String {
        val serialized = values.mapNotNull { it?.toString()?.let(::pathEncode) }
        if (serialized.isEmpty()) return pathPrefix(name, style)
        if (style == "matrix") {
            if (explode) {
                return serialized.joinToString("") { ";$name=$it" }
            }
            return ";$name=" + serialized.joinToString(",")
        }
        val separator = if (explode) "." else ","
        return pathPrefix(name, style) + serialized.joinToString(separator)
    }

    private fun serializePathObject(name: String, values: Map<*, *>, style: String, explode: Boolean): String {
        val entries = mutableListOf<String>()
        val exploded = mutableListOf<String>()
        values.forEach { (key, value) ->
            if (value == null) return@forEach
            val escapedKey = pathEncode(key.toString())
            val escapedValue = pathEncode(value.toString())
            if (explode) {
                if (style == "matrix") {
                    exploded += ";$escapedKey=$escapedValue"
                } else {
                    exploded += "$escapedKey=$escapedValue"
                }
            } else {
                entries += escapedKey
                entries += escapedValue
            }
        }
        if (style == "matrix") {
            if (explode) return exploded.joinToString("")
            return ";$name=" + entries.joinToString(",")
        }
        if (explode) {
            val separator = if (style == "label") "." else ","
            return pathPrefix(name, style) + exploded.joinToString(separator)
        }
        return pathPrefix(name, style) + entries.joinToString(",")
    }

    private fun pathPrefix(name: String, style: String): String {
        return when (style) {
            "label" -> "."
            "matrix" -> ";$name"
            else -> ""
        }
    }

    private fun pathPrimitivePrefix(name: String, style: String): String {
        return if (style == "matrix") ";$name=" else pathPrefix(name, style)
    }

    private fun pathEncode(value: String): String {
        return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8).replace("+", "%20")
    }`;
  }

  private generateRequestHeaderHelpers(): string {
    return `    private data class HeaderParameterSpec(val value: Any?, val style: String, val explode: Boolean, val contentType: String?)

    private val headerObjectMapper = ObjectMapper().registerKotlinModule()

    private fun buildRequestHeaders(headers: Map<String, HeaderParameterSpec>, cookies: Map<String, HeaderParameterSpec>): Map<String, String>? {
        val requestHeaders = linkedMapOf<String, String>()
        headers.forEach { (name, parameter) ->
            serializeParameterValue(parameter)?.let { requestHeaders[name] = it }
        }

        val cookieHeader = buildCookieHeader(cookies)
        if (cookieHeader.isNotEmpty()) {
            requestHeaders["Cookie"] = requestHeaders["Cookie"]?.let { "$it; $cookieHeader" } ?: cookieHeader
        }

        return requestHeaders.takeIf { it.isNotEmpty() }
    }

    private fun buildCookieHeader(cookies: Map<String, HeaderParameterSpec>): String {
        return cookies.mapNotNull { (name, parameter) ->
            serializeParameterValue(parameter)?.let {
                java.net.URLEncoder.encode(name, java.nio.charset.StandardCharsets.UTF_8) + "=" +
                    java.net.URLEncoder.encode(it, java.nio.charset.StandardCharsets.UTF_8)
            }
        }.joinToString("; ")
    }

    private fun serializeParameterValue(parameter: HeaderParameterSpec?): String? {
        val value = parameter?.value ?: return null
        if (!parameter.contentType.isNullOrBlank()) {
            return headerObjectMapper.writeValueAsString(value)
        }
        return when (value) {
            is Iterable<*> -> value.mapNotNull { it?.toString() }.joinToString(",")
            is Map<*, *> -> value.mapNotNull { (key, item) ->
                if (item == null) {
                    null
                } else if (parameter.explode) {
                    "$key=$item"
                } else {
                    listOf(key.toString(), item.toString()).joinToString(",")
                }
            }.joinToString(",")
            else -> value.toString()
        }
    }`;
  }

  private generateOperationId(method: string, path: string, op: any, tag: string): string {
    if (op.operationId) {
      const normalized = normalizeOperationId(op.operationId);
      return KOTLIN_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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
    
    return `${actionMap[method] || method}${KOTLIN_CONFIG.namingConventions.modelName(resource)}`;
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
      return 'Unit';
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

  private generatePaths(packageName: ReturnType<typeof resolveJvmSdkIdentity>, config: GeneratorConfig): GeneratedFile {
    return {
      path: `src/main/kotlin/${packageName.packagePath}/api/ApiPaths.kt`,
      content: this.format(`package ${packageName.packageRoot}.api

object ApiPaths {
    const val API_PREFIX = "${config.apiPrefix}"
    
    fun ${KOTLIN_CONFIG.namingConventions.methodName(config.sdkType)}Path(path: String = ""): String {
        if (path.isEmpty()) return API_PREFIX
        if (path.startsWith("http://") || path.startsWith("https://")) return path

        var normalizedPrefix = API_PREFIX.trim()
        normalizedPrefix = if (normalizedPrefix.isNotEmpty() && normalizedPrefix != "/") {
            "/" + normalizedPrefix.trim('/')
        } else {
            ""
        }

        val normalizedPath = if (path.startsWith("/")) path else "/$path"
        if (normalizedPrefix.isEmpty()) return normalizedPath
        if (normalizedPath == normalizedPrefix || normalizedPath.startsWith("$normalizedPrefix/")) {
            return normalizedPath
        }
        return normalizedPrefix + normalizedPath
    }

    fun appendQueryString(path: String, rawQueryString: String): String {
        val query = rawQueryString.trimStart('?')
        if (query.isEmpty()) return path
        return if (path.contains("?")) "$path&$query" else "$path?$query"
    }
}
`),
      language: 'kotlin',
      description: 'API path utilities',
    };
  }

  private generateApiIndex(
    tags: string[],
    resolvedTagNames: Map<string, string>,
    packageName: ReturnType<typeof resolveJvmSdkIdentity>,
    config: GeneratorConfig
  ): GeneratedFile {
    const moduleInits = tags.map((tag) => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const propName = KOTLIN_CONFIG.namingConventions.propertyName(resolvedTagName);
      const className = `${KOTLIN_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
      return `    val ${propName}: ${className} = ${className}(client)`;
    }).join('\n');

    return {
      path: `src/main/kotlin/${packageName.packagePath}/api/Api.kt`,
      content: this.format(`package ${packageName.packageRoot}.api

import ${packageName.packageRoot}.http.HttpClient

/**
 * API modules for ${config.name}
 */
class Api(private val client: HttpClient) {
${moduleInits}
}
`),
      language: 'kotlin',
      description: 'API module exports',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
