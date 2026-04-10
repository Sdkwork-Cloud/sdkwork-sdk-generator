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
import { KOTLIN_CONFIG, getKotlinType } from './config.js';

export class ApiGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const identity = resolveJvmSdkIdentity(config);
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
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
    const className = `${KOTLIN_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
    const methodNames = resolveScopedMethodNames(operations, (op) =>
      this.generateOperationId(op.method, op.path, op, tag)
    );
    const methods = operations
      .map((op) => this.generateMethod(op, config, methodNames.get(op) || 'operation', knownModels))
      .join('\n\n');

    return {
      path: `src/main/kotlin/${identity.packagePath}/api/${className}.kt`,
      content: this.format(`package ${identity.packageRoot}.api

import com.fasterxml.jackson.core.type.TypeReference
import ${identity.packageRoot}.*
import ${identity.packageRoot}.http.HttpClient

class ${className}(private val client: HttpClient) {

${methods}
}
`),
      language: 'kotlin',
      description: `${tag} API module`,
    };
  }

  private generateMethod(op: any, config: GeneratorConfig, methodName: string, knownModels: Set<string>): string {
    const rawPathParams = this.extractPathParams(op.path);
    const allParameters = op.allParameters || op.parameters || [];
    const hasQuery = allParameters.some((param: any) => param?.in === 'query');
    const hasHeaders = allParameters.some((param: any) => param?.in === 'header' || param?.in === 'cookie');
    const method = String(op.method || '').toLowerCase();
    const supportsRequestBody = method === 'post' || method === 'put' || method === 'patch';
    const requestBodyInfo = supportsRequestBody ? this.extractRequestBodyInfo(op) : undefined;
    const hasBody = Boolean(requestBodyInfo);
    const requestBodyRequired = hasBody && Boolean(op.requestBody?.required);
    const requestBodySchema = requestBodyInfo?.schema;
    const contentTypeArg = requestBodyInfo?.mediaType
      ? `, "${requestBodyInfo.mediaType.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
      : '';
    const requestType = requestBodySchema
      ? this.ensureKnownType(getKotlinType(requestBodySchema, KOTLIN_CONFIG), knownModels)
      : 'Any';
    const responseSchema = this.extractResponseSchema(op);
    const responseType = responseSchema
      ? this.ensureKnownType(getKotlinType(responseSchema, KOTLIN_CONFIG), knownModels)
      : this.inferFallbackResponseType(op);

    const pathParamNames = createUniqueIdentifierMap(
      rawPathParams,
      (value) => KOTLIN_CONFIG.namingConventions.propertyName(value),
      [
        hasBody ? 'body' : '',
        hasQuery ? 'params' : '',
        hasHeaders ? 'headers' : '',
      ]
    );
    const pathParams = rawPathParams.map((rawName) => ({
      rawName,
      safeName: pathParamNames.get(rawName) || rawName,
    }));

    const params: string[] = [];
    if (pathParams.length) {
      params.push(...pathParams.map((param) => `${param.safeName}: String`));
    }
    if (hasBody) {
      if (requestBodyRequired) {
        params.push(`body: ${requestType}`);
      } else {
        params.push(`body: ${requestType}? = null`);
      }
    }
    if (hasQuery) {
      params.push('params: Map<String, Any>? = null');
    }
    if (hasHeaders) {
      params.push('headers: Map<String, String>? = null');
    }

    const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
    const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, (_match, paramName: string) => {
      const safeName = pathParamNames.get(paramName) || KOTLIN_CONFIG.namingConventions.propertyName(paramName);
      return `$${safeName}`;
    });
    const pathCall = `ApiPaths.${KOTLIN_CONFIG.namingConventions.methodName(config.sdkType)}Path("${pathTemplate}")`;
    let call = '';
    
    switch (method) {
      case 'get':
        if (hasQuery && hasHeaders) {
          call = `client.get(${pathCall}, params, headers)`;
        } else if (hasQuery) {
          call = `client.get(${pathCall}, params)`;
        } else if (hasHeaders) {
          call = `client.get(${pathCall}, null, headers)`;
        } else {
          call = `client.get(${pathCall})`;
        }
        break;
      case 'post':
        if (hasBody) {
          if (hasQuery && hasHeaders) {
            call = `client.post(${pathCall}, body, params, headers${contentTypeArg})`;
          } else if (hasQuery) {
            call = `client.post(${pathCall}, body, params, null${contentTypeArg})`;
          } else if (hasHeaders) {
            call = `client.post(${pathCall}, body, null, headers${contentTypeArg})`;
          } else {
            call = `client.post(${pathCall}, body, null, null${contentTypeArg})`;
          }
        } else if (hasQuery && hasHeaders) {
          call = `client.post(${pathCall}, null, params, headers)`;
        } else if (hasQuery) {
          call = `client.post(${pathCall}, null, params)`;
        } else if (hasHeaders) {
          call = `client.post(${pathCall}, null, null, headers)`;
        } else {
          call = `client.post(${pathCall}, null)`;
        }
        break;
      case 'put':
        if (hasBody) {
          if (hasQuery && hasHeaders) {
            call = `client.put(${pathCall}, body, params, headers${contentTypeArg})`;
          } else if (hasQuery) {
            call = `client.put(${pathCall}, body, params, null${contentTypeArg})`;
          } else if (hasHeaders) {
            call = `client.put(${pathCall}, body, null, headers${contentTypeArg})`;
          } else {
            call = `client.put(${pathCall}, body, null, null${contentTypeArg})`;
          }
        } else if (hasQuery && hasHeaders) {
          call = `client.put(${pathCall}, null, params, headers)`;
        } else if (hasQuery) {
          call = `client.put(${pathCall}, null, params)`;
        } else if (hasHeaders) {
          call = `client.put(${pathCall}, null, null, headers)`;
        } else {
          call = `client.put(${pathCall}, null)`;
        }
        break;
      case 'delete':
        if (hasQuery && hasHeaders) {
          call = `client.delete(${pathCall}, params, headers)`;
        } else if (hasQuery) {
          call = `client.delete(${pathCall}, params)`;
        } else if (hasHeaders) {
          call = `client.delete(${pathCall}, null, headers)`;
        } else {
          call = `client.delete(${pathCall})`;
        }
        break;
      case 'patch':
        if (hasBody) {
          if (hasQuery && hasHeaders) {
            call = `client.patch(${pathCall}, body, params, headers${contentTypeArg})`;
          } else if (hasQuery) {
            call = `client.patch(${pathCall}, body, params, null${contentTypeArg})`;
          } else if (hasHeaders) {
            call = `client.patch(${pathCall}, body, null, headers${contentTypeArg})`;
          } else {
            call = `client.patch(${pathCall}, body, null, null${contentTypeArg})`;
          }
        } else if (hasQuery && hasHeaders) {
          call = `client.patch(${pathCall}, null, params, headers)`;
        } else if (hasQuery) {
          call = `client.patch(${pathCall}, null, params)`;
        } else if (hasHeaders) {
          call = `client.patch(${pathCall}, null, null, headers)`;
        } else {
          call = `client.patch(${pathCall}, null)`;
        }
        break;
      default:
        call = `client.get(${pathCall})`;
    }

    const docComment = op.summary ? `    /** ${op.summary} */\n` : '';
    if (responseType === 'Unit') {
      return `${docComment}    suspend fun ${methodName}(${params.join(', ')}): Unit {
        ${call}
    }`;
    }

    if (responseType === 'Any') {
      return `${docComment}    suspend fun ${methodName}(${params.join(', ')}): Any? {
        return ${call}
    }`;
    }

    return `${docComment}    suspend fun ${methodName}(${params.join(', ')}): ${responseType}? {
        val raw = ${call}
        return client.convertValue(raw, object : TypeReference<${responseType}>() {})
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
    const schema = (content as Record<string, any>)[mediaType]?.schema;
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
      if (mediaType && content[mediaType]?.schema) {
        return content[mediaType].schema;
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
