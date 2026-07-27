import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { createUniqueIdentifierMap, toSafeCamelIdentifier } from '../../framework/identifiers.js';
import {
  normalizeOperationId,
  resolveScopedMethodNames,
  stripTagPrefixFromOperationId,
} from '../../framework/naming.js';
import { resolveOpenAIStyleMethodNames, resolveSdkTagNames, selectCanonicalOpenAIStyleOperations } from '../../framework/openai-surface.js';
import { supportsRequestBodyByDefault, toHttpMethodLiteral } from '../../framework/http-methods.js';
import { resolveMediaTypeSchema } from '../../framework/schema.js';
import { extractEventStreamResponseInfo } from '../../framework/responses.js';
import {
  extractOpenApiParameterContentSchema,
  requiresExplicitOpenApiQuerySerialization,
  resolveOpenApiParameterSerialization,
} from '../../framework/parameter-serialization.js';
import {
  operationSkipsSdkworkAuth,
  operationUsesAccessTokenOnly,
} from '../../framework/sdkwork-v3-auth.js';
import { CSHARP_CONFIG, getCSharpNamespace, getCSharpType } from './config.js';

const CSHARP_RESERVED_WORDS = new Set([
  'abstract',
  'as',
  'base',
  'bool',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'checked',
  'class',
  'const',
  'continue',
  'decimal',
  'default',
  'delegate',
  'do',
  'double',
  'else',
  'enum',
  'event',
  'explicit',
  'extern',
  'false',
  'finally',
  'fixed',
  'float',
  'for',
  'foreach',
  'goto',
  'if',
  'implicit',
  'in',
  'int',
  'interface',
  'internal',
  'is',
  'lock',
  'long',
  'namespace',
  'new',
  'null',
  'object',
  'operator',
  'out',
  'override',
  'params',
  'private',
  'protected',
  'public',
  'readonly',
  'ref',
  'return',
  'sbyte',
  'sealed',
  'short',
  'sizeof',
  'stackalloc',
  'static',
  'string',
  'struct',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'uint',
  'ulong',
  'unchecked',
  'unsafe',
  'ushort',
  'using',
  'virtual',
  'void',
  'volatile',
  'while',
]);

const CSHARP_PRIMITIVE_TYPE_NAMES = new Set([
  'bool',
  'byte',
  'char',
  'decimal',
  'double',
  'float',
  'int',
  'long',
  'object',
  'sbyte',
  'short',
  'string',
  'uint',
  'ulong',
  'ushort',
  'void',
]);

const CSHARP_FRAMEWORK_GENERIC_TYPE_NAMES = new Set([
  'Dictionary',
  'IEnumerable',
  'IReadOnlyCollection',
  'IReadOnlyDictionary',
  'IReadOnlyList',
  'List',
]);

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
    const namespace = getCSharpNamespace(config);
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSdkTagNames(tags, config);
    const knownModels = new Set<string>(
      Object.keys(ctx.schemas).map((schemaName) => CSHARP_CONFIG.namingConventions.modelName(schemaName))
    );

    for (const tag of tags) {
      const group = ctx.apiGroups[tag];
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      files.push(this.generateApiClass(tag, resolvedTagName, group.operations, namespace, config, knownModels));
    }

    files.push(this.generatePaths(namespace, config));
    files.push(this.generateApiIndex(tags, resolvedTagNames, namespace, config));

    return files;
  }

  private generateApiClass(
    tag: string,
    resolvedTagName: string,
    operations: any[],
    namespace: string,
    config: GeneratorConfig,
    knownModels: Set<string>
  ): GeneratedFile {
    operations = selectCanonicalOpenAIStyleOperations(tag, operations, config);
    const className = `${CSHARP_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
    const methodNames = resolveOpenAIStyleMethodNames(tag, operations, config, CSHARP_CONFIG, 'pascal')
      || resolveScopedMethodNames(operations, (op) =>
        this.generateOperationId(op.method, op.path, op, tag)
      );
    const methods = operations
      .map((op) => this.generateMethod(op, config, methodNames.get(op) || 'Operation', knownModels, namespace))
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
      path: `Api/${className}.cs`,
      content: this.format(`using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using ${namespace}.Models;
using SdkHttpClient = ${namespace}.Http.HttpClient;

namespace ${namespace}.Api
{
    public class ${className}
    {
        private readonly SdkHttpClient _client;

        public ${className}(SdkHttpClient client)
        {
            _client = client;
        }

${methods}
${needsPathSerializationHelpers ? `\n${this.generatePathSerializationHelpers()}` : ''}
${needsQuerySerializationHelpers ? `\n${this.generateQuerySerializationHelpers()}` : ''}
${needsRequestHeaderHelpers ? `\n${this.generateRequestHeaderHelpers()}` : ''}
    }
}
`),
      language: 'csharp',
      description: `${tag} API module`,
    };
  }

  private generateMethod(
    op: any,
    config: GeneratorConfig,
    methodName: string,
    knownModels: Set<string>,
    namespace: string
  ): string {
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
      ? this.qualifyKnownModelTypes(getCSharpType(requestBodySchema, CSHARP_CONFIG), knownModels, namespace)
      : 'object';
    const eventStreamInfo = extractEventStreamResponseInfo(op);
    const isEventStreamResponse = Boolean(eventStreamInfo);
    const responseSchema = eventStreamInfo?.schema ?? this.extractResponseSchema(op);
    const responseType = responseSchema
      ? this.qualifyKnownModelTypes(getCSharpType(responseSchema, CSHARP_CONFIG), knownModels, namespace)
      : this.inferFallbackResponseType(op);

    const pathParamNames = createUniqueIdentifierMap(
      rawPathParams,
      (value) => toSafeCamelIdentifier(value, CSHARP_RESERVED_WORDS),
      [
        hasBody ? 'body' : '',
        hasQuery ? 'query' : '',
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
        type: parameter?.schema ? this.qualifyKnownModelTypes(getCSharpType(parameter.schema, CSHARP_CONFIG), knownModels, namespace) : 'string',
        style: serialization.style,
        explode: serialization.explode,
      };
    });
    const parameterReservedNames = [
      ...pathParams.map((param) => param.safeName),
      hasBody ? 'body' : '',
      hasQuery ? 'query' : '',
      hasRawQueryString ? 'rawQueryString' : '',
      hasHeaders ? 'requestHeaders' : '',
    ];
    const queryBindings = hasExplicitQuerySerialization
      ? this.createQueryParameterBindings(queryParams, knownModels, namespace, parameterReservedNames)
      : [];
    const headerBindings = this.createHeaderParameterBindings(headerParams, knownModels, namespace, [
      ...parameterReservedNames,
      ...queryBindings.map((binding) => binding.safeName),
    ]);
    const cookieBindings = this.createHeaderParameterBindings(cookieParams, knownModels, namespace, [
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
      params.push(...pathParams.map((param) => `${param.type} ${param.safeName}`));
    }
    if (hasBody && requestBodyRequired) {
      if (requestBodyRequired) {
        params.push(`${requestType} body`);
      } else {
        params.push(`${requestType}? body = null`);
      }
    }
    if (hasRawQueryString) {
      params.push('string rawQueryString');
    }
    params.push(...requiredQueryBindings.map((binding) => this.renderMethodParameter(binding)));
    params.push(...requiredHeaderBindings.map((binding) => this.renderMethodParameter(binding)));
    if (hasBody && !requestBodyRequired) {
      params.push(`${requestType}? body = null`);
    }
    if (hasQuery && !hasExplicitQuerySerialization) {
      params.push('Dictionary<string, object>? query = null');
    }
    params.push(...optionalQueryBindings.map((binding) => this.renderMethodParameter(binding)));
    params.push(...optionalHeaderBindings.map((binding) => this.renderMethodParameter(binding)));

    const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
    const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, (_match, paramName: string) => {
      const param = pathParams.find((candidate) => candidate.rawName === paramName);
      const safeName = param?.safeName || pathParamNames.get(paramName) || toSafeCamelIdentifier(paramName, CSHARP_RESERVED_WORDS);
      const style = param?.style || 'simple';
      const explode = param?.explode ?? false;
      return `{SerializePathParameter(${safeName}, new PathParameterSpec(${this.formatCSharpString(paramName)}, ${this.formatCSharpString(style)}, ${explode ? 'true' : 'false'}))}`;
    });
    const pathExpression = pathParams.length > 0 ? `$\"${pathTemplate}\"` : `\"${pathTemplate}\"`;
    const pathCall = `ApiPaths.${CSHARP_CONFIG.namingConventions.modelName(config.sdkType)}Path(${pathExpression})`;
    const requestPathCall = hasRawQueryString
      ? `ApiPaths.AppendQueryString(${pathCall}, rawQueryString)`
      : hasExplicitQuerySerialization
        ? `ApiPaths.AppendQueryString(${pathCall}, queryString)`
        : pathCall;
    const skipAuth = operationSkipsSdkworkAuth(op);
    const accessTokenOnly = operationUsesAccessTokenOnly(op);
    let call = '';
    
    switch (method) {
      case 'get':
        if (hasQuery && hasHeaders) {
          call = hasExplicitQuerySerialization
            ? `await _client.GetAsync<${responseType}>(${requestPathCall}, null, requestHeaders)`
            : `await _client.GetAsync<${responseType}>(${requestPathCall}, query, requestHeaders)`;
        } else if (hasQuery) {
          call = hasExplicitQuerySerialization
            ? `await _client.GetAsync<${responseType}>(${requestPathCall})`
            : `await _client.GetAsync<${responseType}>(${requestPathCall}, query)`;
        } else if (hasHeaders) {
          call = `await _client.GetAsync<${responseType}>(${requestPathCall}, null, requestHeaders)`;
        } else {
          call = `await _client.GetAsync<${responseType}>(${requestPathCall})`;
        }
        break;
      case 'post':
        if (hasBody) {
          if (hasQuery && hasHeaders) {
            call = hasExplicitQuerySerialization
              ? `await _client.PostAsync<${responseType}>(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`
              : `await _client.PostAsync<${responseType}>(${requestPathCall}, body, query, requestHeaders${contentTypeArg})`;
          } else if (hasQuery) {
            call = hasExplicitQuerySerialization
              ? `await _client.PostAsync<${responseType}>(${requestPathCall}, body, null, null${contentTypeArg})`
              : `await _client.PostAsync<${responseType}>(${requestPathCall}, body, query, null${contentTypeArg})`;
          } else if (hasHeaders) {
            call = `await _client.PostAsync<${responseType}>(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`;
          } else {
            call = `await _client.PostAsync<${responseType}>(${requestPathCall}, body, null, null${contentTypeArg})`;
          }
        } else if (hasQuery && hasHeaders) {
          call = hasExplicitQuerySerialization
            ? `await _client.PostAsync<${responseType}>(${requestPathCall}, null, null, requestHeaders)`
            : `await _client.PostAsync<${responseType}>(${requestPathCall}, null, query, requestHeaders)`;
        } else if (hasQuery) {
          call = hasExplicitQuerySerialization
            ? `await _client.PostAsync<${responseType}>(${requestPathCall}, null)`
            : `await _client.PostAsync<${responseType}>(${requestPathCall}, null, query)`;
        } else if (hasHeaders) {
          call = `await _client.PostAsync<${responseType}>(${requestPathCall}, null, null, requestHeaders)`;
        } else {
          call = `await _client.PostAsync<${responseType}>(${requestPathCall}, null)`;
        }
        break;
      case 'put':
        if (hasBody) {
          if (hasQuery && hasHeaders) {
            call = hasExplicitQuerySerialization
              ? `await _client.PutAsync<${responseType}>(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`
              : `await _client.PutAsync<${responseType}>(${requestPathCall}, body, query, requestHeaders${contentTypeArg})`;
          } else if (hasQuery) {
            call = hasExplicitQuerySerialization
              ? `await _client.PutAsync<${responseType}>(${requestPathCall}, body, null, null${contentTypeArg})`
              : `await _client.PutAsync<${responseType}>(${requestPathCall}, body, query, null${contentTypeArg})`;
          } else if (hasHeaders) {
            call = `await _client.PutAsync<${responseType}>(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`;
          } else {
            call = `await _client.PutAsync<${responseType}>(${requestPathCall}, body, null, null${contentTypeArg})`;
          }
        } else if (hasQuery && hasHeaders) {
          call = hasExplicitQuerySerialization
            ? `await _client.PutAsync<${responseType}>(${requestPathCall}, null, null, requestHeaders)`
            : `await _client.PutAsync<${responseType}>(${requestPathCall}, null, query, requestHeaders)`;
        } else if (hasQuery) {
          call = hasExplicitQuerySerialization
            ? `await _client.PutAsync<${responseType}>(${requestPathCall}, null)`
            : `await _client.PutAsync<${responseType}>(${requestPathCall}, null, query)`;
        } else if (hasHeaders) {
          call = `await _client.PutAsync<${responseType}>(${requestPathCall}, null, null, requestHeaders)`;
        } else {
          call = `await _client.PutAsync<${responseType}>(${requestPathCall}, null)`;
        }
        break;
      case 'delete':
        if (hasQuery && hasHeaders) {
          call = hasExplicitQuerySerialization
            ? `await _client.DeleteAsync<${responseType}>(${requestPathCall}, null, requestHeaders)`
            : `await _client.DeleteAsync<${responseType}>(${requestPathCall}, query, requestHeaders)`;
        } else if (hasQuery) {
          call = hasExplicitQuerySerialization
            ? `await _client.DeleteAsync<${responseType}>(${requestPathCall})`
            : `await _client.DeleteAsync<${responseType}>(${requestPathCall}, query)`;
        } else if (hasHeaders) {
          call = `await _client.DeleteAsync<${responseType}>(${requestPathCall}, null, requestHeaders)`;
        } else {
          call = `await _client.DeleteAsync<${responseType}>(${requestPathCall})`;
        }
        break;
      case 'patch':
        if (hasBody) {
          if (hasQuery && hasHeaders) {
            call = hasExplicitQuerySerialization
              ? `await _client.PatchAsync<${responseType}>(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`
              : `await _client.PatchAsync<${responseType}>(${requestPathCall}, body, query, requestHeaders${contentTypeArg})`;
          } else if (hasQuery) {
            call = hasExplicitQuerySerialization
              ? `await _client.PatchAsync<${responseType}>(${requestPathCall}, body, null, null${contentTypeArg})`
              : `await _client.PatchAsync<${responseType}>(${requestPathCall}, body, query, null${contentTypeArg})`;
          } else if (hasHeaders) {
            call = `await _client.PatchAsync<${responseType}>(${requestPathCall}, body, null, requestHeaders${contentTypeArg})`;
          } else {
            call = `await _client.PatchAsync<${responseType}>(${requestPathCall}, body, null, null${contentTypeArg})`;
          }
        } else if (hasQuery && hasHeaders) {
          call = hasExplicitQuerySerialization
            ? `await _client.PatchAsync<${responseType}>(${requestPathCall}, null, null, requestHeaders)`
            : `await _client.PatchAsync<${responseType}>(${requestPathCall}, null, query, requestHeaders)`;
        } else if (hasQuery) {
          call = hasExplicitQuerySerialization
            ? `await _client.PatchAsync<${responseType}>(${requestPathCall}, null)`
            : `await _client.PatchAsync<${responseType}>(${requestPathCall}, null, query)`;
        } else if (hasHeaders) {
          call = `await _client.PatchAsync<${responseType}>(${requestPathCall}, null, null, requestHeaders)`;
        } else {
          call = `await _client.PatchAsync<${responseType}>(${requestPathCall}, null)`;
        }
        break;
      default:
        call = `await _client.RequestAsync<${responseType}>("${toHttpMethodLiteral(httpMethod)}", ${requestPathCall}, ${hasBody ? 'body' : 'null'}, ${hasQuery && !hasExplicitQuerySerialization ? 'query' : 'null'}, ${hasHeaders ? 'requestHeaders' : 'null'}, ${hasBody && requestBodyInfo?.mediaType ? `"${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : 'null'})`;
    }

    if (skipAuth || accessTokenOnly) {
      call = `await _client.RequestAsync<${responseType}>("${toHttpMethodLiteral(httpMethod)}", ${requestPathCall}, ${hasBody ? 'body' : 'null'}, ${hasQuery && !hasExplicitQuerySerialization ? 'query' : 'null'}, ${hasHeaders ? 'requestHeaders' : 'null'}, ${hasBody && requestBodyInfo?.mediaType ? `"${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : 'null'}, ${skipAuth ? 'true' : 'false'}, ${accessTokenOnly ? 'true' : 'false'})`;
    }

    const docComment = op.summary ? `        /// <summary>\n        /// ${op.summary}\n        /// </summary>\n` : '';
    const effectiveCall = responseType === 'void'
      ? call.replace('<void>', '<object>')
      : call;
    const requestHeaderBlock = hasHeaders
      ? `            var requestHeaders = BuildRequestHeaders(
${this.renderHeaderParameterDictionary(headerBindings, 16)},
${this.renderHeaderParameterDictionary(cookieBindings, 16)}
            );
`
      : '';
    const queryBlock = hasExplicitQuerySerialization
      ? `            var queryString = BuildQueryString(new[]
            {
${this.renderQueryParameterSpecs(queryBindings, 16)}
            });
`
      : '';

    if (isEventStreamResponse) {
      const streamCall = `_client.StreamAsync<${responseType}>("${toHttpMethodLiteral(httpMethod)}", ${requestPathCall}, ${hasBody ? 'body' : 'null'}, ${hasQuery && !hasExplicitQuerySerialization ? 'query' : 'null'}, ${hasHeaders ? 'requestHeaders' : 'null'}, ${hasBody && requestBodyInfo?.mediaType ? `"${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : 'null'}${skipAuth || accessTokenOnly ? `, ${skipAuth ? 'true' : 'false'}, ${accessTokenOnly ? 'true' : 'false'}` : ''})`;
      return `${docComment}        public IAsyncEnumerable<${responseType}> ${methodName}Async(${params.join(', ')})
        {
${queryBlock}${requestHeaderBlock}            return ${streamCall};
        }`;
    }

    if (responseType === 'void') {
      return `${docComment}        public async Task ${methodName}Async(${params.join(', ')})
        {
${queryBlock}${requestHeaderBlock}            ${effectiveCall};
        }`;
    }

    return `${docComment}        public async Task<${responseType}?> ${methodName}Async(${params.join(', ')})
        {
${queryBlock}${requestHeaderBlock}            return ${effectiveCall};
        }`;
  }

  private createNamedParameterBindings(
    parameters: any[],
    knownModels: Set<string>,
    namespace: string,
    reservedNames: Iterable<string>
  ): NamedParameterBinding[] {
    const keys = parameters.map((parameter, index) => `${parameter?.in || 'parameter'}:${parameter?.name || 'value'}:${index}`);
    const rawNameByKey = new Map(keys.map((key, index) => [key, String(parameters[index]?.name || `value${index + 1}`)]));
    const safeNameByKey = createUniqueIdentifierMap(
      keys,
      (key) => toSafeCamelIdentifier(rawNameByKey.get(key) || 'value', CSHARP_RESERVED_WORDS),
      reservedNames,
    );

    return parameters.map((parameter, index) => {
      const key = keys[index];
      return {
        parameter,
        safeName: safeNameByKey.get(key) || `value${index + 1}`,
        required: Boolean(parameter?.required),
        type: this.getNamedParameterType(parameter, knownModels, namespace),
      };
    });
  }

  private createQueryParameterBindings(
    parameters: any[],
    knownModels: Set<string>,
    namespace: string,
    reservedNames: Iterable<string>
  ): QueryParameterBinding[] {
    return this.createNamedParameterBindings(parameters, knownModels, namespace, reservedNames).map((binding) => {
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
    namespace: string,
    reservedNames: Iterable<string>
  ): HeaderParameterBinding[] {
    return this.createNamedParameterBindings(parameters, knownModels, namespace, reservedNames).map((binding) => {
      const serialization = resolveOpenApiParameterSerialization(binding.parameter);
      return {
        ...binding,
        style: serialization.style,
        explode: serialization.explode,
        contentType: serialization.contentType,
      };
    });
  }

  private getNamedParameterType(parameter: any, knownModels: Set<string>, namespace: string): string {
    const contentSchema = extractOpenApiParameterContentSchema(parameter);
    if (contentSchema) {
      return this.qualifyKnownModelTypes(getCSharpType(contentSchema, CSHARP_CONFIG), knownModels, namespace);
    }
    return parameter?.schema
      ? this.qualifyKnownModelTypes(getCSharpType(parameter.schema, CSHARP_CONFIG), knownModels, namespace)
      : 'object';
  }

  private renderMethodParameter(binding: NamedParameterBinding): string {
    return binding.required
      ? `${binding.type} ${binding.safeName}`
      : `${binding.type}? ${binding.safeName} = null`;
  }

  private renderNamedParameterDictionary(bindings: NamedParameterBinding[], indentation: number): string {
    const indent = ' '.repeat(indentation);
    if (bindings.length === 0) {
      return `${indent}new Dictionary<string, object?>()`;
    }
    const lines = bindings.map((binding) => {
      return `${indent}    [${this.formatCSharpString(String(binding.parameter?.name || binding.safeName))}] = ${binding.safeName},`;
    });
    return [`${indent}new Dictionary<string, object?>`, `${indent}{`, ...lines, `${indent}}`].join('\n');
  }

  private renderHeaderParameterDictionary(bindings: HeaderParameterBinding[], indentation: number): string {
    const indent = ' '.repeat(indentation);
    if (bindings.length === 0) {
      return `${indent}new Dictionary<string, HeaderParameterSpec>()`;
    }
    const lines = bindings.map((binding) => {
      return `${indent}    [${this.formatCSharpString(String(binding.parameter?.name || binding.safeName))}] = new HeaderParameterSpec(${[
        binding.safeName,
        this.formatCSharpString(binding.style),
        binding.explode ? 'true' : 'false',
        binding.contentType ? this.formatCSharpString(binding.contentType) : 'null',
      ].join(', ')}),`;
    });
    return [`${indent}new Dictionary<string, HeaderParameterSpec>`, `${indent}{`, ...lines, `${indent}}`].join('\n');
  }

  private formatCSharpString(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  private renderQueryParameterSpecs(bindings: QueryParameterBinding[], indentation: number): string {
    const indent = ' '.repeat(indentation);
    return bindings.map((binding) => {
      return `${indent}new QueryParameterSpec(${[
        this.formatCSharpString(String(binding.parameter?.name || binding.safeName)),
        binding.safeName,
        this.formatCSharpString(binding.style),
        binding.explode ? 'true' : 'false',
        binding.allowReserved ? 'true' : 'false',
        binding.contentType ? this.formatCSharpString(binding.contentType) : 'null',
      ].join(', ')}),`;
    }).join('\n');
  }

  private generateQuerySerializationHelpers(): string {
    return `        private sealed record QueryParameterSpec(
            string Name,
            object? Value,
            string Style,
            bool Explode,
            bool AllowReserved,
            string? ContentType);

        private static string BuildQueryString(IEnumerable<QueryParameterSpec> parameters)
        {
            var pairs = new List<string>();
            foreach (var parameter in parameters)
            {
                AppendSerializedParameter(pairs, parameter);
            }
            return string.Join("&", pairs);
        }

        private static void AppendSerializedParameter(List<string> pairs, QueryParameterSpec parameter)
        {
            if (parameter.Value is null)
            {
                return;
            }

            if (!string.IsNullOrWhiteSpace(parameter.ContentType))
            {
                var json = System.Text.Json.JsonSerializer.Serialize(parameter.Value);
                pairs.Add(Uri.EscapeDataString(parameter.Name) + "=" + EncodeQueryValue(json, parameter.AllowReserved));
                return;
            }

            var style = string.IsNullOrWhiteSpace(parameter.Style) ? "form" : parameter.Style;
            if (style == "deepObject" && parameter.Value is System.Collections.IDictionary deepObject)
            {
                AppendDeepObjectParameter(pairs, parameter.Name, deepObject, parameter.AllowReserved);
            }
            else if (parameter.Value is System.Collections.IEnumerable enumerable && parameter.Value is not string && parameter.Value is not System.Collections.IDictionary)
            {
                AppendArrayParameter(pairs, parameter.Name, enumerable, style, parameter.Explode, parameter.AllowReserved);
            }
            else if (parameter.Value is System.Collections.IDictionary dictionary)
            {
                AppendObjectParameter(pairs, parameter.Name, dictionary, style, parameter.Explode, parameter.AllowReserved);
            }
            else
            {
                pairs.Add(Uri.EscapeDataString(parameter.Name) + "=" + EncodeQueryValue(parameter.Value.ToString() ?? string.Empty, parameter.AllowReserved));
            }
        }

        private static void AppendArrayParameter(List<string> pairs, string name, System.Collections.IEnumerable values, string style, bool explode, bool allowReserved)
        {
            var serialized = new List<string>();
            foreach (var item in values)
            {
                if (item is not null)
                {
                    serialized.Add(item.ToString() ?? string.Empty);
                }
            }
            if (serialized.Count == 0)
            {
                return;
            }
            if (style == "form" && explode)
            {
                foreach (var item in serialized)
                {
                    pairs.Add(Uri.EscapeDataString(name) + "=" + EncodeQueryValue(item, allowReserved));
                }
                return;
            }
            pairs.Add(Uri.EscapeDataString(name) + "=" + EncodeQueryValue(string.Join(",", serialized), allowReserved));
        }

        private static void AppendObjectParameter(List<string> pairs, string name, System.Collections.IDictionary values, string style, bool explode, bool allowReserved)
        {
            var serialized = new List<string>();
            foreach (System.Collections.DictionaryEntry item in values)
            {
                if (item.Value is null)
                {
                    continue;
                }
                if (style == "form" && explode)
                {
                    pairs.Add(Uri.EscapeDataString(item.Key.ToString() ?? string.Empty) + "=" + EncodeQueryValue(item.Value.ToString() ?? string.Empty, allowReserved));
                }
                else
                {
                    serialized.Add(item.Key.ToString() ?? string.Empty);
                    serialized.Add(item.Value.ToString() ?? string.Empty);
                }
            }
            if (serialized.Count > 0)
            {
                pairs.Add(Uri.EscapeDataString(name) + "=" + EncodeQueryValue(string.Join(",", serialized), allowReserved));
            }
        }

        private static void AppendDeepObjectParameter(List<string> pairs, string name, System.Collections.IDictionary values, bool allowReserved)
        {
            foreach (System.Collections.DictionaryEntry item in values)
            {
                if (item.Value is not null)
                {
                    pairs.Add(Uri.EscapeDataString(name + "[" + item.Key + "]") + "=" + EncodeQueryValue(item.Value.ToString() ?? string.Empty, allowReserved));
                }
            }
        }

        private static string EncodeQueryValue(string value, bool allowReserved)
        {
            var encoded = Uri.EscapeDataString(value);
            if (!allowReserved)
            {
                return encoded;
            }
            return encoded
                .Replace("%3A", ":").Replace("%2F", "/").Replace("%3F", "?").Replace("%23", "#")
                .Replace("%5B", "[").Replace("%5D", "]").Replace("%40", "@").Replace("%21", "!")
                .Replace("%24", "$").Replace("%26", "&").Replace("%27", "'").Replace("%28", "(")
                .Replace("%29", ")").Replace("%2A", "*").Replace("%2B", "+").Replace("%2C", ",")
                .Replace("%3B", ";").Replace("%3D", "=");
        }`;
  }

  private generatePathSerializationHelpers(): string {
    return `        private sealed record PathParameterSpec(string Name, string Style, bool Explode);

        private static string SerializePathParameter(object? value, PathParameterSpec spec)
        {
            if (value is null)
            {
                return string.Empty;
            }
            var style = string.IsNullOrWhiteSpace(spec.Style) ? "simple" : spec.Style;
            if (value is System.Collections.IDictionary dictionary)
            {
                return SerializePathObject(spec.Name, dictionary, style, spec.Explode);
            }
            if (value is System.Collections.IEnumerable enumerable && value is not string)
            {
                return SerializePathArray(spec.Name, enumerable, style, spec.Explode);
            }
            return PathPrimitivePrefix(spec.Name, style) + Uri.EscapeDataString(value.ToString() ?? string.Empty);
        }

        private static string SerializePathArray(string name, System.Collections.IEnumerable values, string style, bool explode)
        {
            var serialized = new List<string>();
            foreach (var item in values)
            {
                if (item is not null)
                {
                    serialized.Add(Uri.EscapeDataString(item.ToString() ?? string.Empty));
                }
            }
            if (serialized.Count == 0)
            {
                return PathPrefix(name, style);
            }
            if (style == "matrix")
            {
                if (explode)
                {
                    var parts = new List<string>();
                    foreach (var item in serialized)
                    {
                        parts.Add(";" + name + "=" + item);
                    }
                    return string.Join(string.Empty, parts);
                }
                return ";" + name + "=" + string.Join(",", serialized);
            }
            var separator = explode ? "." : ",";
            return PathPrefix(name, style) + string.Join(separator, serialized);
        }

        private static string SerializePathObject(string name, System.Collections.IDictionary values, string style, bool explode)
        {
            var entries = new List<string>();
            var exploded = new List<string>();
            foreach (System.Collections.DictionaryEntry item in values)
            {
                if (item.Value is null)
                {
                    continue;
                }
                var escapedKey = Uri.EscapeDataString(item.Key.ToString() ?? string.Empty);
                var escapedValue = Uri.EscapeDataString(item.Value.ToString() ?? string.Empty);
                if (explode)
                {
                    exploded.Add(style == "matrix" ? ";" + escapedKey + "=" + escapedValue : escapedKey + "=" + escapedValue);
                }
                else
                {
                    entries.Add(escapedKey);
                    entries.Add(escapedValue);
                }
            }
            if (style == "matrix")
            {
                return explode ? string.Join(string.Empty, exploded) : ";" + name + "=" + string.Join(",", entries);
            }
            if (explode)
            {
                var separator = style == "label" ? "." : ",";
                return PathPrefix(name, style) + string.Join(separator, exploded);
            }
            return PathPrefix(name, style) + string.Join(",", entries);
        }

        private static string PathPrefix(string name, string style)
        {
            return style switch
            {
                "label" => ".",
                "matrix" => ";" + name,
                _ => string.Empty,
            };
        }

        private static string PathPrimitivePrefix(string name, string style)
        {
            return style == "matrix" ? ";" + name + "=" : PathPrefix(name, style);
        }`;
  }

  private generateRequestHeaderHelpers(): string {
    return `        private sealed record HeaderParameterSpec(object? Value, string Style, bool Explode, string? ContentType);

        private static Dictionary<string, string>? BuildRequestHeaders(
            Dictionary<string, HeaderParameterSpec> headers,
            Dictionary<string, HeaderParameterSpec> cookies)
        {
            var requestHeaders = new Dictionary<string, string>();
            foreach (var item in headers)
            {
                var serialized = SerializeParameterValue(item.Value);
                if (serialized is not null)
                {
                    requestHeaders[item.Key] = serialized;
                }
            }

            var cookieHeader = BuildCookieHeader(cookies);
            if (!string.IsNullOrEmpty(cookieHeader))
            {
                requestHeaders["Cookie"] = requestHeaders.TryGetValue("Cookie", out var existing) && !string.IsNullOrEmpty(existing)
                    ? existing + "; " + cookieHeader
                    : cookieHeader;
            }

            return requestHeaders.Count == 0 ? null : requestHeaders;
        }

        private static string BuildCookieHeader(Dictionary<string, HeaderParameterSpec> cookies)
        {
            var pairs = new List<string>();
            foreach (var item in cookies)
            {
                var serialized = SerializeParameterValue(item.Value);
                if (serialized is not null)
                {
                    pairs.Add(Uri.EscapeDataString(item.Key) + "=" + Uri.EscapeDataString(serialized));
                }
            }
            return string.Join("; ", pairs);
        }

        private static string? SerializeParameterValue(HeaderParameterSpec? parameter)
        {
            var value = parameter?.Value;
            if (value is null)
            {
                return null;
            }
            if (!string.IsNullOrWhiteSpace(parameter!.ContentType))
            {
                return System.Text.Json.JsonSerializer.Serialize(value);
            }
            if (value is System.Collections.IEnumerable enumerable && value is not string)
            {
                var values = new List<string>();
                foreach (var item in enumerable)
                {
                    if (item is not null)
                    {
                        values.Add(item.ToString() ?? string.Empty);
                    }
                }
                return string.Join(",", values);
            }
            if (value is System.Collections.IDictionary dictionary)
            {
                var values = new List<string>();
                foreach (System.Collections.DictionaryEntry item in dictionary)
                {
                    if (item.Value is null)
                    {
                        continue;
                    }
                    if (parameter.Explode)
                    {
                        values.Add((item.Key.ToString() ?? string.Empty) + "=" + (item.Value.ToString() ?? string.Empty));
                    }
                    else
                    {
                        values.Add(item.Key.ToString() ?? string.Empty);
                        values.Add(item.Value.ToString() ?? string.Empty);
                    }
                }
                return string.Join(",", values);
            }
            return value.ToString();
        }`;
  }

  private generateOperationId(method: string, path: string, op: any, tag: string): string {
    if (op.operationId) {
      const normalized = normalizeOperationId(op.operationId);
      return CSHARP_CONFIG.namingConventions.modelName(stripTagPrefixFromOperationId(normalized, tag));
    }
    
    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
    
    const actionMap: Record<string, string> = {
      get: path.includes('{') ? 'Get' : 'List',
      post: 'Create',
      put: 'Update',
      patch: 'Patch',
      delete: 'Delete',
      options: 'Options',
      head: 'Head',
      trace: 'Trace',
      query: 'Query',
    };
    
    return `${actionMap[method] || CSHARP_CONFIG.namingConventions.modelName(method)}${CSHARP_CONFIG.namingConventions.modelName(resource)}`;
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
      return 'void';
    }

    const statusCodes = Object.keys(responses);
    if (statusCodes.length === 0) {
      return 'void';
    }

    const allNoContent = statusCodes.every((code) => {
      const content = responses[code]?.content;
      return !content || typeof content !== 'object' || Object.keys(content).length === 0;
    });

    if (allNoContent || responses['204']) {
      return 'void';
    }
    return 'object';
  }

  private qualifyKnownModelTypes(typeName: string, knownModels: Set<string>, namespace: string): string {
    if (!typeName || knownModels.size === 0) {
      return typeName;
    }

    const modelNamespace = `${namespace}.Models.`;
    return typeName.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (identifier, offset, fullType) => {
      const previous = offset > 0 ? fullType[offset - 1] : '';
      const next = fullType[offset + identifier.length] || '';
      const rest = fullType.slice(offset + identifier.length);
      const nextNonWhitespace = rest.match(/^\s*(.)/)?.[1] || '';

      if (
        previous === '.' ||
        next === '.' ||
        CSHARP_PRIMITIVE_TYPE_NAMES.has(identifier) ||
        (CSHARP_FRAMEWORK_GENERIC_TYPE_NAMES.has(identifier) && nextNonWhitespace === '<') ||
        !knownModels.has(identifier)
      ) {
        return identifier;
      }

      return `${modelNamespace}${identifier}`;
    });
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

  private generatePaths(namespace: string, config: GeneratorConfig): GeneratedFile {
    return {
      path: 'Api/ApiPaths.cs',
      content: this.format(`namespace ${namespace}.Api
{
    public static class ApiPaths
    {
        public const string ApiPrefix = "${config.apiPrefix}";

        public static string ${CSHARP_CONFIG.namingConventions.modelName(config.sdkType)}Path(string path = "")
        {
            if (string.IsNullOrEmpty(path)) return ApiPrefix;
            if (path.StartsWith("http://") || path.StartsWith("https://")) return path;

            var normalizedPrefix = (ApiPrefix ?? string.Empty).Trim();
            if (!string.IsNullOrEmpty(normalizedPrefix) && normalizedPrefix != "/")
            {
                normalizedPrefix = "/" + normalizedPrefix.Trim('/');
            }
            else
            {
                normalizedPrefix = string.Empty;
            }

            var normalizedPath = path.StartsWith("/") ? path : "/" + path;
            if (string.IsNullOrEmpty(normalizedPrefix)) return normalizedPath;
            if (normalizedPath == normalizedPrefix || normalizedPath.StartsWith(normalizedPrefix + "/")) return normalizedPath;
            return normalizedPrefix + normalizedPath;
        }

        public static string AppendQueryString(string path, string rawQueryString)
        {
            var query = (rawQueryString ?? string.Empty).TrimStart('?');
            if (string.IsNullOrEmpty(query)) return path;
            return path.Contains("?") ? path + "&" + query : path + "?" + query;
        }
    }
}
`),
      language: 'csharp',
      description: 'API path utilities',
    };
  }

  private generateApiIndex(
    tags: string[],
    resolvedTagNames: Map<string, string>,
    namespace: string,
    config: GeneratorConfig
  ): GeneratedFile {
    return {
      path: 'Api/Api.cs',
      content: this.format(`namespace ${namespace}.Api
{
    /// <summary>
    /// API modules for ${config.name}
    /// </summary>
    public static class Api
    {
${tags.map((tag) => {
  const resolvedTagName = resolvedTagNames.get(tag) || tag;
  return `        public static ${CSHARP_CONFIG.namingConventions.modelName(resolvedTagName)}Api? ${CSHARP_CONFIG.namingConventions.propertyName(resolvedTagName)} { get; set; }`;
}).join('\n')}
    }
}
`),
      language: 'csharp',
      description: 'API module exports',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
