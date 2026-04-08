import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import {
  normalizeOperationId,
  resolveScopedMethodNames,
  resolveSimplifiedTagNames,
  stripTagPrefixFromOperationId,
} from '../../framework/naming.js';
import { JAVA_CONFIG, getJavaType } from './config.js';

export class ApiGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const packageName = config.sdkType.toLowerCase();
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
    const knownModels = new Set<string>(
      Object.keys(ctx.schemas).map((schemaName) => JAVA_CONFIG.namingConventions.modelName(schemaName))
    );

    for (const tag of tags) {
      const group = ctx.apiGroups[tag];
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      files.push(this.generateApiClass(tag, resolvedTagName, group.operations, packageName, config, knownModels));
    }

    files.push(this.generatePaths(packageName, config));
    files.push(this.generateApiIndex(tags, resolvedTagNames, packageName, config));

    return files;
  }

  private generateApiClass(
    tag: string,
    resolvedTagName: string,
    operations: any[],
    packageName: string,
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

    return {
      path: `src/main/java/com/sdkwork/${packageName}/api/${className}.java`,
      content: this.format(`package com.sdkwork.${packageName}.api;

import com.sdkwork.${packageName}.http.HttpClient;
import com.sdkwork.${packageName}.model.*;
import java.util.List;
import java.util.Map;

public class ${className} {
    private final HttpClient client;
    
    public ${className}(HttpClient client) {
        this.client = client;
    }

${methods}
}
`),
      language: 'java',
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
    const requestBodySchema = requestBodyInfo?.schema;
    const requestBodyMediaType = (requestBodyInfo?.mediaType || '').toLowerCase();
    const isMultipartBody = requestBodyMediaType === 'multipart/form-data';
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
        hasHeaders ? 'headers' : '',
      ]
    );
    const pathParams = rawPathParams.map((rawName) => ({
      rawName,
      safeName: pathParamNames.get(rawName) || rawName,
    }));

    const params: string[] = [];
    if (pathParams.length) {
      params.push(...pathParams.map((param) => `String ${param.safeName}`));
    }
    if (hasBody) {
      params.push(`${requestType} body`);
    }
    if (hasQuery) {
      params.push('Map<String, Object> params');
    }
    if (hasHeaders) {
      params.push('Map<String, String> headers');
    }

    const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
    const pathTemplate = normalizedOperationPath.replace(/\{([^}]+)\}/g, (_match, paramName: string) => {
      const safeName = pathParamNames.get(paramName) || JAVA_CONFIG.namingConventions.propertyName(paramName);
      return `" + ${safeName} + "`;
    });
    const pathCall = `ApiPaths.${JAVA_CONFIG.namingConventions.methodName(config.sdkType)}Path("${pathTemplate}")`;
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
            call = isMultipartBody
              ? `client.post(${pathCall}, body, params, headers, "multipart/form-data")`
              : `client.post(${pathCall}, body, params, headers)`;
          } else if (hasQuery) {
            call = isMultipartBody
              ? `client.post(${pathCall}, body, params, null, "multipart/form-data")`
              : `client.post(${pathCall}, body, params)`;
          } else if (hasHeaders) {
            call = isMultipartBody
              ? `client.post(${pathCall}, body, null, headers, "multipart/form-data")`
              : `client.post(${pathCall}, body, null, headers)`;
          } else {
            call = isMultipartBody
              ? `client.post(${pathCall}, body, null, null, "multipart/form-data")`
              : `client.post(${pathCall}, body)`;
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
            call = isMultipartBody
              ? `client.put(${pathCall}, body, params, headers, "multipart/form-data")`
              : `client.put(${pathCall}, body, params, headers)`;
          } else if (hasQuery) {
            call = isMultipartBody
              ? `client.put(${pathCall}, body, params, null, "multipart/form-data")`
              : `client.put(${pathCall}, body, params)`;
          } else if (hasHeaders) {
            call = isMultipartBody
              ? `client.put(${pathCall}, body, null, headers, "multipart/form-data")`
              : `client.put(${pathCall}, body, null, headers)`;
          } else {
            call = isMultipartBody
              ? `client.put(${pathCall}, body, null, null, "multipart/form-data")`
              : `client.put(${pathCall}, body)`;
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
            call = isMultipartBody
              ? `client.patch(${pathCall}, body, params, headers, "multipart/form-data")`
              : `client.patch(${pathCall}, body, params, headers)`;
          } else if (hasQuery) {
            call = isMultipartBody
              ? `client.patch(${pathCall}, body, params, null, "multipart/form-data")`
              : `client.patch(${pathCall}, body, params)`;
          } else if (hasHeaders) {
            call = isMultipartBody
              ? `client.patch(${pathCall}, body, null, headers, "multipart/form-data")`
              : `client.patch(${pathCall}, body, null, headers)`;
          } else {
            call = isMultipartBody
              ? `client.patch(${pathCall}, body, null, null, "multipart/form-data")`
              : `client.patch(${pathCall}, body)`;
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
    if (responseType === 'Void') {
      return `${docComment}    public Void ${methodName}(${params.join(', ')}) throws Exception {
        ${call};
        return null;
    }`;
    }

    const castType = this.ensureKnownType(responseType, knownModels);
    return `${docComment}    public ${responseType} ${methodName}(${params.join(', ')}) throws Exception {
        return (${castType}) ${call};
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

  private generatePaths(packageName: string, config: GeneratorConfig): GeneratedFile {
    return {
      path: `src/main/java/com/sdkwork/${packageName}/api/ApiPaths.java`,
      content: this.format(`package com.sdkwork.${packageName}.api;

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
}
`),
      language: 'java',
      description: 'API path utilities',
    };
  }

  private generateApiIndex(
    tags: string[],
    resolvedTagNames: Map<string, string>,
    packageName: string,
    config: GeneratorConfig
  ): GeneratedFile {
    const exports = tags.map((tag) => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const className = `${JAVA_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
      return `import com.sdkwork.${packageName}.api.${className};`;
    }).join('\n');

    return {
      path: `src/main/java/com/sdkwork/${packageName}/api/package-info.java`,
      content: this.format(`/**
 * API modules for ${config.name}
 */
package com.sdkwork.${packageName}.api;

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
