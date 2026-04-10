import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { buildTypeScriptTagMetadata, type TypeScriptApiTagMetadata } from './tag-metadata.js';
import { resolveTypeScriptCommonPackage } from '../../framework/common-package.js';
import { resolveSdkClientName, resolveTypeScriptConfigTypeName } from '../../framework/sdk-identity.js';

export class HttpClientGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const configType = resolveTypeScriptConfigTypeName(config);
    const clientName = resolveSdkClientName(config);
    const tags = Object.keys(ctx.apiGroups);
    const tagMetadata = buildTypeScriptTagMetadata(tags);
    const apiKeyHeader = (ctx.auth.apiKeyHeader || 'Authorization').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const apiKeyUseBearer = ctx.auth.apiKeyAsBearer;
    const commonPkg = resolveTypeScriptCommonPackage(config);

    return [
      this.generateHttpClient(configType, apiKeyHeader, apiKeyUseBearer, commonPkg.importPath),
      this.generateHttpIndex(),
      this.generateAuthIndex(commonPkg.importPath),
      this.generateSdkClass(clientName, configType, tagMetadata, config, commonPkg.importPath),
      this.generateMainIndex(clientName),
    ];
  }

  private generateHttpClient(
    configType: string,
    apiKeyHeader: string,
    apiKeyUseBearer: boolean,
    commonImportPath: string,
  ): GeneratedFile {
    return {
      path: 'src/http/client.ts',
      content: this.format(`import type { ${configType} } from '../types/common';
import type { RequestOptions, QueryParams } from '${commonImportPath}';
import type { AuthTokenManager } from '${commonImportPath}';
import { BaseHttpClient, withRetry } from '${commonImportPath}';

type HttpRequestOptions = RequestOptions & {
  body?: unknown;
  headers?: Record<string, string>;
  contentType?: string;
};

export class HttpClient extends BaseHttpClient {
  private static readonly API_KEY_HEADER = '${apiKeyHeader}';
  private static readonly API_KEY_USE_BEARER = ${apiKeyUseBearer ? 'true' : 'false'};

  constructor(config: ${configType}) {
    super(config as any);
  }

  private getInternalAuthConfig(): any {
    const self = this as any;
    self.authConfig = self.authConfig || {};
    return self.authConfig;
  }

  private getInternalHeaders(): Record<string, string> {
    const self = this as any;
    self.config = self.config || {};
    self.config.headers = self.config.headers || {};
    return self.config.headers;
  }

  private buildRequestHeaders(
    headers?: Record<string, string>,
    contentType?: string,
  ): Record<string, string> | undefined {
    const mergedHeaders = {
      ...(headers ?? {}),
    };

    if (contentType && contentType.toLowerCase() !== 'multipart/form-data') {
      mergedHeaders['Content-Type'] = contentType;
    }

    return Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined;
  }

  private buildRequestBody(body: unknown, contentType?: string): unknown {
    if (body == null) {
      return body;
    }

    const normalizedContentType = (contentType ?? '').toLowerCase();
    if (normalizedContentType === 'application/x-www-form-urlencoded') {
      return this.encodeFormBody(body);
    }

    return body;
  }

  private encodeFormBody(body: unknown): string {
    if (body instanceof URLSearchParams) {
      return body.toString();
    }
    if (typeof body === 'string') {
      return body;
    }

    const params = new URLSearchParams();
    if (body instanceof Map) {
      for (const [key, value] of body.entries()) {
        this.appendFormValue(params, String(key), value);
      }
      return params.toString();
    }
    if (typeof body === 'object') {
      for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        this.appendFormValue(params, key, value);
      }
      return params.toString();
    }

    params.append('value', String(body));
    return params.toString();
  }

  private appendFormValue(params: URLSearchParams, key: string, value: unknown): void {
    if (value == null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => this.appendFormValue(params, key, item));
      return;
    }
    if (value instanceof Date) {
      params.append(key, value.toISOString());
      return;
    }
    if (typeof value === 'object') {
      params.append(key, JSON.stringify(value));
      return;
    }
    params.append(key, String(value));
  }

  setApiKey(apiKey: string): void {
    const authConfig = this.getInternalAuthConfig();
    const headers = this.getInternalHeaders();
    authConfig.apiKey = apiKey;
    authConfig.tokenManager?.clearTokens?.();

    if (HttpClient.API_KEY_HEADER === 'Authorization' && HttpClient.API_KEY_USE_BEARER) {
      authConfig.authMode = 'apikey';
      delete headers['Access-Token'];
      return;
    }

    authConfig.authMode = 'dual-token';
    headers[HttpClient.API_KEY_HEADER] = HttpClient.API_KEY_USE_BEARER
      ? \`Bearer \${apiKey}\`
      : apiKey;

    if (HttpClient.API_KEY_HEADER.toLowerCase() !== 'authorization') {
      delete headers['Authorization'];
    }
    if (HttpClient.API_KEY_HEADER.toLowerCase() !== 'access-token') {
      delete headers['Access-Token'];
    }
  }

  setAuthToken(token: string): void {
    const headers = this.getInternalHeaders();
    if (HttpClient.API_KEY_HEADER.toLowerCase() !== 'authorization') {
      delete headers[HttpClient.API_KEY_HEADER];
    }
    super.setAuthToken(token);
  }

  setAccessToken(token: string): void {
    const headers = this.getInternalHeaders();
    if (HttpClient.API_KEY_HEADER.toLowerCase() !== 'access-token') {
      delete headers[HttpClient.API_KEY_HEADER];
    }
    super.setAccessToken(token);
  }

  setTokenManager(manager: AuthTokenManager): void {
    const baseProto = Object.getPrototypeOf(HttpClient.prototype) as { setTokenManager?: (this: HttpClient, m: AuthTokenManager) => void };
    if (typeof baseProto.setTokenManager === 'function') {
      baseProto.setTokenManager.call(this, manager);
      return;
    }
    this.getInternalAuthConfig().tokenManager = manager;
  }

  async request<T>(path: string, options: HttpRequestOptions = {}): Promise<T> {
    const execute = (this as any).execute;
    if (typeof execute !== 'function') {
      throw new Error('BaseHttpClient execute method is not available');
    }
    const { body, headers, contentType, method = 'GET', ...rest } = options;
    return withRetry(
      () => execute.call(this, { 
        url: path, 
        method,
        ...rest,
        body: this.buildRequestBody(body, contentType),
        headers: this.buildRequestHeaders(headers, body == null ? undefined : contentType),
      }),
      { maxRetries: 3 }
    );
  }

  async get<T>(path: string, params?: QueryParams, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(path, { method: 'GET', params, headers });
  }

  async post<T>(
    path: string,
    body?: unknown,
    params?: QueryParams,
    headers?: Record<string, string>,
    contentType?: string,
  ): Promise<T> {
    return this.request<T>(path, { method: 'POST', body, params, headers, contentType });
  }

  async put<T>(
    path: string,
    body?: unknown,
    params?: QueryParams,
    headers?: Record<string, string>,
    contentType?: string,
  ): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body, params, headers, contentType });
  }

  async delete<T>(path: string, params?: QueryParams, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', params, headers });
  }

  async patch<T>(
    path: string,
    body?: unknown,
    params?: QueryParams,
    headers?: Record<string, string>,
    contentType?: string,
  ): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body, params, headers, contentType });
  }
}

export function createHttpClient(config: ${configType}): HttpClient {
  return new HttpClient(config);
}
`),
      language: 'typescript',
      description: 'HTTP client implementation',
    };
  }

  private generateHttpIndex(): GeneratedFile {
    return {
      path: 'src/http/index.ts',
      content: this.format(`export { HttpClient, createHttpClient } from './client';
`),
      language: 'typescript',
      description: 'HTTP module exports',
    };
  }

  private generateAuthIndex(commonImportPath: string): GeneratedFile {
    return {
      path: 'src/auth/index.ts',
      content: this.format(`export { DefaultAuthTokenManager, createTokenManager } from '${commonImportPath}';
export type { AuthTokenManager, AuthTokens, AuthMode } from '${commonImportPath}';
`),
      language: 'typescript',
      description: 'Auth module exports',
    };
  }

  private generateSdkClass(
    clientName: string, 
    configType: string, 
    tagMetadata: TypeScriptApiTagMetadata[],
    config: GeneratorConfig,
    commonImportPath: string,
  ): GeneratedFile {
    const imports = tagMetadata.map((meta) => {
      return `import { ${meta.className}, create${meta.className} } from './api/${meta.fileName}';`;
    }).join('\n');

    const properties = tagMetadata.map((meta) => {
      return `  public readonly ${meta.clientPropertyName}: ${meta.className};`;
    }).join('\n');

    const inits = tagMetadata.map((meta) => {
      return `    this.${meta.clientPropertyName} = create${meta.className}(this.httpClient);`;
    }).join('\n\n');

    return {
      path: 'src/sdk.ts',
      content: this.format(`import { HttpClient, createHttpClient } from './http/client';
import type { ${configType} } from './types/common';
import type { AuthTokenManager } from '${commonImportPath}';

${imports}

export class ${clientName} {
  private httpClient: HttpClient;
${properties ? `\n${properties}` : ''}

  constructor(config: ${configType}) {
    this.httpClient = createHttpClient(config);
${inits}
  }

  setApiKey(apiKey: string): this {
    this.httpClient.setApiKey(apiKey);
    return this;
  }

  setAuthToken(token: string): this {
    this.httpClient.setAuthToken(token);
    return this;
  }

  setAccessToken(token: string): this {
    this.httpClient.setAccessToken(token);
    return this;
  }

  setTokenManager(manager: AuthTokenManager): this {
    this.httpClient.setTokenManager(manager);
    return this;
  }

  get http(): HttpClient {
    return this.httpClient;
  }
}

export function createClient(config: ${configType}): ${clientName} {
  return new ${clientName}(config);
}

export default ${clientName};
`),
      language: 'typescript',
      description: 'Main SDK class',
    };
  }

  private generateMainIndex(clientName: string): GeneratedFile {
    return {
      path: 'src/index.ts',
      content: this.format(`export { ${clientName}, createClient } from './sdk';
export * from './types';
export * from './api';
export * from './http';
export * from './auth';
`),
      language: 'typescript',
      description: 'Main module exports',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
