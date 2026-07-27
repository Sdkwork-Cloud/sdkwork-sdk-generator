import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { buildTypeScriptTagMetadata, type TypeScriptApiTagMetadata } from './tag-metadata.js';
import { resolveTypeScriptCommonPackage } from '../../framework/common-package.js';
import {
  resolveLegacySdkClientName,
  resolveSdkClientName,
  resolveTypeScriptConfigTypeName,
} from '../../framework/sdk-identity.js';
import {
  usesSdkworkV3ApiKeyOrDualToken,
  usesSdkworkV3DualTokenOnly,
} from '../../framework/sdkwork-v3-auth.js';

export class HttpClientGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const configType = resolveTypeScriptConfigTypeName(config);
    const clientName = resolveSdkClientName(config);
    const legacyClientName = resolveLegacySdkClientName(config);
    const tags = Object.keys(ctx.apiGroups);
    const tagMetadata = buildTypeScriptTagMetadata(tags, config);
    const apiKeyHeader = (ctx.auth.apiKeyHeader || 'Authorization').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const accessTokenHeader = this.resolveAccessTokenHeader(config, ctx.auth.apiKeyHeader)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
    const apiKeyUseBearer = ctx.auth.apiKeyAsBearer;
    const commonPkg = resolveTypeScriptCommonPackage(config);
    const requiresSdkworkAccessToken = usesSdkworkV3DualTokenOnly(config);
    const apiKeyOrDualToken = usesSdkworkV3ApiKeyOrDualToken(config);
    const supportsApiKey = ctx.auth.hasApiKeyScheme && !requiresSdkworkAccessToken;

    return [
      this.generateHttpClient(
        configType,
        apiKeyHeader,
        accessTokenHeader,
        apiKeyUseBearer,
        commonPkg.importPath,
        config.options?.standardProfile === 'sdkwork-v3',
        requiresSdkworkAccessToken,
        apiKeyOrDualToken,
        supportsApiKey,
      ),
      this.generateHttpIndex(),
      this.generateAuthIndex(commonPkg.importPath),
      this.generateSdkClass(clientName, legacyClientName, configType, tagMetadata, config, commonPkg.importPath),
      this.generateMainIndex(clientName, legacyClientName),
    ];
  }

  private generateHttpClient(
    configType: string,
    apiKeyHeader: string,
    accessTokenHeader: string,
    apiKeyUseBearer: boolean,
    commonImportPath: string,
    sdkworkV3Unwrap = false,
    requiresSdkworkAccessToken = false,
    apiKeyOrDualToken = false,
    supportsApiKey = false,
  ): GeneratedFile {
    return {
      path: 'src/http/client.ts',
      content: this.format(`import type { ${configType} } from '../types/common';
import type { RequestOptions, QueryParams } from '${commonImportPath}';
import type { AuthTokenManager } from '${commonImportPath}';
import { BaseHttpClient, buildAuthHeaders, withRetry } from '${commonImportPath}';

export type HttpRequestOptions = RequestOptions & {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  contentType?: string;
  accessTokenOnly?: boolean;
};

export type ApiRequestOptions = Pick<HttpRequestOptions, 'signal' | 'timeout'>;

export class HttpClient extends BaseHttpClient {
  private static readonly API_KEY_HEADER: string = '${apiKeyHeader}';
  private static readonly ACCESS_TOKEN_HEADER: string = '${accessTokenHeader}';
  private static readonly API_KEY_USE_BEARER = ${apiKeyUseBearer ? 'true' : 'false'};
  private static readonly SDKWORK_V3_UNWRAP = ${sdkworkV3Unwrap ? 'true' : 'false'};
  private static readonly SDKWORK_V3_REQUEST_FINGERPRINTS = ${sdkworkV3Unwrap ? 'true' : 'false'};
  private static readonly REQUIRES_SDKWORK_ACCESS_TOKEN = ${requiresSdkworkAccessToken ? 'true' : 'false'};

  constructor(config: ${configType}) {
${apiKeyOrDualToken ? '    HttpClient.assertInitialCredentialMode(config as any);\n' : ''}    super(config as any);
${supportsApiKey ? `    const initialApiKey = HttpClient.normalizeCredential((config as any).apiKey);
    if (initialApiKey) {
      this.setApiKey(initialApiKey);
    }
` : ''}  }

${apiKeyOrDualToken ? `  private static assertInitialCredentialMode(config: any): void {
    const apiKey = HttpClient.normalizeCredential(config?.apiKey);
    if (!apiKey) {
      return;
    }
    const authToken = HttpClient.normalizeCredential(
      config?.authToken ?? config?.tokenManager?.getAuthToken?.(),
    );
    const accessToken = HttpClient.normalizeCredential(
      config?.accessToken ?? config?.tokenManager?.getAccessToken?.(),
    );
    if (authToken || accessToken) {
      throw new Error(
        'api-key-or-dual-token client configuration must not mix X-API-Key with auth/access tokens',
      );
    }
  }

` : ''}  private static normalizeCredential(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
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

  private async applySdkworkRequestBodyFingerprint(
    headers: Record<string, string> | undefined,
    body: unknown,
  ): Promise<Record<string, string> | undefined> {
    if (
      !HttpClient.SDKWORK_V3_REQUEST_FINGERPRINTS
      || body == null
      || !this.hasNonEmptyHeader(headers, 'Idempotency-Key')
      || this.hasNonEmptyHeader(headers, 'X-Content-SHA256')
      || this.hasNonEmptyHeader(headers, 'X-Idempotency-Fingerprint')
    ) {
      return headers;
    }

    const fingerprint = await this.createSdkworkRequestBodyFingerprint(body);
    if (!fingerprint) {
      return headers;
    }

    const normalizedFingerprintHeader = fingerprint.header.toLowerCase();
    const preparedHeaders = Object.fromEntries(
      Object.entries(headers ?? {}).filter(
        ([headerName]) => headerName.toLowerCase() !== normalizedFingerprintHeader,
      ),
    );
    return {
      ...preparedHeaders,
      [fingerprint.header]: fingerprint.value,
    };
  }

  private hasNonEmptyHeader(headers: Record<string, string> | undefined, name: string): boolean {
    const normalizedName = name.toLowerCase();
    return Object.entries(headers ?? {}).some(
      ([headerName, value]) => headerName.toLowerCase() === normalizedName && value.trim().length > 0,
    );
  }

  private async createSdkworkRequestBodyFingerprint(
    body: unknown,
  ): Promise<{ header: 'X-Content-SHA256' | 'X-Idempotency-Fingerprint'; value: string } | undefined> {
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const canonicalForm = await this.serializeSdkworkFormData(body);
      return {
        header: 'X-Idempotency-Fingerprint',
        value: await this.sha256Hex(new TextEncoder().encode(canonicalForm)),
      };
    }

    const bytes = await this.serializeSdkworkRequestBodyBytes(body);
    if (!bytes) {
      return undefined;
    }
    return {
      header: 'X-Content-SHA256',
      value: await this.sha256Hex(bytes),
    };
  }

  private async serializeSdkworkRequestBodyBytes(body: unknown): Promise<Uint8Array | undefined> {
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      return new TextEncoder().encode(body.toString());
    }
    if (typeof Blob !== 'undefined' && body instanceof Blob) {
      return new Uint8Array(await body.arrayBuffer());
    }
    if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
      return new Uint8Array(body.slice(0));
    }
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(body)) {
      return new Uint8Array(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
    }
    if (typeof body === 'string') {
      return new TextEncoder().encode(body);
    }

    const serialized = JSON.stringify(body);
    return serialized === undefined ? undefined : new TextEncoder().encode(serialized);
  }

  private async serializeSdkworkFormData(body: FormData): Promise<string> {
    const parts: Array<Record<string, unknown>> = [];
    for (const [name, value] of body.entries()) {
      if (typeof value === 'string') {
        parts.push({ kind: 'field', name, value });
        continue;
      }

      const bytes = new Uint8Array(await value.arrayBuffer());
      parts.push({
        kind: 'file',
        name,
        fileName: 'name' in value ? String(value.name) : '',
        contentType: value.type,
        size: value.size,
        contentSha256: await this.sha256Hex(bytes),
      });
    }
    return JSON.stringify(parts);
  }

  private async sha256Hex(bytes: Uint8Array): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      throw new Error('Web Crypto SHA-256 is required for SDKWork idempotent requests with a body.');
    }
    const digestInput = new Uint8Array(bytes.byteLength);
    digestInput.set(bytes);
    const digest = await subtle.digest('SHA-256', digestInput);
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  }

  protected buildHeaders(config: any, skipAuth = false): Record<string, string> {
    const headers = super.buildHeaders(config, skipAuth);
    if (config?.accessTokenOnly) {
      this.stripCredentialHeaders(headers, true);
      return headers;
    }
    if (!skipAuth && !config?.skipAuth) {
      return headers;
    }

    this.stripCredentialHeaders(headers, false);
    return headers;
  }

  private stripCredentialHeaders(
    headers: Record<string, string>,
    preserveAccessToken: boolean,
  ): void {
    [
      ...(preserveAccessToken ? [] : [HttpClient.ACCESS_TOKEN_HEADER, 'Access-Token']),
      'Authorization',
      ['X', 'API', 'Key'].join('-'),
      'X-Tenant-Id',
      'X-Organization-Id',
      'X-Platform',
      'X-User-Id',
      'X-Sdkwork-Tenant-Id',
      'X-Sdkwork-Organization-Id',
      'X-Sdkwork-User-Id',
    ].forEach((key) => {
      delete headers[key];
    });
  }

  private buildRequestBody(body: unknown, contentType?: string): unknown {
    if (body == null) {
      return body;
    }

    const normalizedContentType = (contentType ?? '').toLowerCase();
    if (normalizedContentType === 'application/x-www-form-urlencoded') {
      return this.encodeFormBody(body);
    }
    if (normalizedContentType === 'multipart/form-data') {
      return this.encodeMultipartBody(body);
    }

    return body;
  }

  private encodeMultipartBody(body: unknown): FormData {
    if (body instanceof FormData) {
      return body;
    }

    const formData = new FormData();
    if (body instanceof Map) {
      for (const [key, value] of body.entries()) {
        this.appendMultipartValue(formData, String(key), value);
      }
      return formData;
    }
    if (typeof body === 'object') {
      const record = body as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (this.isMultipartMetadataField(key)) {
          continue;
        }
        this.appendMultipartValue(formData, key, value, this.resolveMultipartFileName(record, key));
      }
      return formData;
    }

    this.appendMultipartValue(formData, 'value', body);
    return formData;
  }

  private appendMultipartValue(formData: FormData, key: string, value: unknown, fileName?: string): void {
    if (value == null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => this.appendMultipartValue(formData, key, item, fileName));
      return;
    }
    if (value instanceof Blob) {
      if (fileName) {
        formData.append(key, value, fileName);
        return;
      }
      formData.append(key, value);
      return;
    }
    if (value instanceof Date) {
      formData.append(key, value.toISOString());
      return;
    }
    if (typeof value === 'object') {
      formData.append(key, JSON.stringify(value));
      return;
    }
    formData.append(key, String(value));
  }

  private resolveMultipartFileName(record: Record<string, unknown>, key: string): string | undefined {
    const fieldSpecificName = record[\`\${key}FileName\`];
    if (typeof fieldSpecificName === 'string' && fieldSpecificName.trim()) {
      return fieldSpecificName.trim();
    }
    const genericName = record.fileName;
    if (key === 'file' && typeof genericName === 'string' && genericName.trim()) {
      return genericName.trim();
    }
    return undefined;
  }

  private isMultipartMetadataField(key: string): boolean {
    return key === 'fileName' || key.endsWith('FileName');
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
    const normalizedApiKey = HttpClient.normalizeCredential(apiKey);
    if (!normalizedApiKey) {
      throw new Error('X-API-Key must not be empty');
    }
    authConfig.apiKey = normalizedApiKey;
    authConfig.tokenManager?.clearTokens?.();
    delete headers[HttpClient.ACCESS_TOKEN_HEADER];
    delete headers['Access-Token'];

    if (HttpClient.API_KEY_HEADER === 'Authorization' && HttpClient.API_KEY_USE_BEARER) {
      authConfig.authMode = 'apikey';
      return;
    }

    authConfig.authMode = 'dual-token';
    headers[HttpClient.API_KEY_HEADER] = HttpClient.API_KEY_USE_BEARER
      ? \`Bearer \${normalizedApiKey}\`
      : normalizedApiKey;

    if (HttpClient.API_KEY_HEADER.toLowerCase() !== 'authorization') {
      delete headers['Authorization'];
    }
  }

  setAuthToken(token: string): void {
    const headers = this.getInternalHeaders();
    if (HttpClient.API_KEY_HEADER.toLowerCase() !== 'authorization') {
      delete headers[HttpClient.API_KEY_HEADER];
    }
${apiKeyOrDualToken ? `    const authConfig = this.getInternalAuthConfig();
    authConfig.apiKey = undefined;
    authConfig.authMode = 'dual-token';
` : ''}    super.setAuthToken(token);
  }

  setAccessToken(token: string): void {
    const headers = this.getInternalHeaders();
${apiKeyOrDualToken ? `    if (HttpClient.API_KEY_HEADER.toLowerCase() !== 'authorization') {
      delete headers[HttpClient.API_KEY_HEADER];
    }
    const authConfig = this.getInternalAuthConfig();
    authConfig.apiKey = undefined;
    authConfig.authMode = 'dual-token';
` : ''}    headers[HttpClient.ACCESS_TOKEN_HEADER] = token;
    super.setAccessToken(token);
  }

  setTokenManager(manager: AuthTokenManager): void {
${apiKeyOrDualToken ? `    const headers = this.getInternalHeaders();
    if (HttpClient.API_KEY_HEADER.toLowerCase() !== 'authorization') {
      delete headers[HttpClient.API_KEY_HEADER];
    }
    const authConfig = this.getInternalAuthConfig();
    authConfig.apiKey = undefined;
    authConfig.authMode = 'dual-token';
` : ''}    const baseProto = Object.getPrototypeOf(HttpClient.prototype) as { setTokenManager?: (this: HttpClient, m: AuthTokenManager) => void };
    if (typeof baseProto.setTokenManager === 'function') {
      baseProto.setTokenManager.call(this, manager);
      return;
    }
    this.getInternalAuthConfig().tokenManager = manager;
  }

  private applyAccessTokenOnlyHeaders(
    headers?: Record<string, string>,
  ): Record<string, string> {
    const authConfig = this.getInternalAuthConfig();
    const tokenManager = authConfig.tokenManager;
    const accessToken = tokenManager?.getAccessToken?.();
    if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
      throw new Error(
        'access-token-only request requires Access-Token before request dispatch',
      );
    }

    const result = { ...(headers ?? {}) };
    this.stripCredentialHeaders(result, false);
    result[HttpClient.ACCESS_TOKEN_HEADER] = accessToken.trim();
    return result;
  }

  private applySdkworkAuthHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
    const authConfig = this.getInternalAuthConfig();
    const tokenManager = authConfig.tokenManager;
    const accessToken = HttpClient.normalizeCredential(tokenManager?.getAccessToken?.());
    const authToken = HttpClient.normalizeCredential(tokenManager?.getAuthToken?.());
${apiKeyOrDualToken ? `    const apiKey = HttpClient.normalizeCredential(authConfig.apiKey);
    if (apiKey) {
      if (authToken || accessToken) {
        throw new Error(
          'api-key-or-dual-token request must not mix X-API-Key with auth/access tokens',
        );
      }
      return headers;
    }
    if (!authToken || !accessToken) {
      throw new Error(
        'api-key-or-dual-token request requires either X-API-Key or both Authorization and Access-Token before request dispatch',
      );
    }
` : ''}    if (HttpClient.REQUIRES_SDKWORK_ACCESS_TOKEN
      && (typeof accessToken !== 'string' || accessToken.trim().length === 0)) {
      throw new Error('non-open-api request requires Access-Token before request dispatch');
    }
    if (!accessToken && !authToken) {
      return headers;
    }

    const authHeaders = buildAuthHeaders('dual-token', undefined, tokenManager);
    return Object.keys(authHeaders).length > 0
      ? { ...(headers ?? {}), ...authHeaders }
      : headers;
  }

  private unwrapSdkworkV3Payload<T>(payload: unknown): T {
    if (!HttpClient.SDKWORK_V3_UNWRAP || payload == null || typeof payload !== 'object') {
      return payload as T;
    }

    const record = payload as Record<string, unknown>;
    if (record.code !== 0 || !('data' in record)) {
      return this.unwrapSdkworkV3Data<T>(record);
    }

    const data = record.data;
    if (!data || typeof data !== 'object') {
      return data as T;
    }

    return this.unwrapSdkworkV3Data<T>(data as Record<string, unknown>);
  }

  private unwrapSdkworkV3Data<T>(data: Record<string, unknown>): T {
    if ('items' in data && 'pageInfo' in data) {
      return data as T;
    }
    if ('accepted' in data) {
      return data as T;
    }
    if ('item' in data) {
      return data.item as T;
    }

    return data as T;
  }

  async request<T>(path: string, options: HttpRequestOptions = {}): Promise<T> {
    const execute = (this as any).execute;
    if (typeof execute !== 'function') {
      throw new Error('BaseHttpClient execute method is not available');
    }
    const {
      body,
      headers,
      contentType,
      method = 'GET',
      skipAuth,
      accessTokenOnly,
      ...rest
    } = options;
    const requestHeaders = accessTokenOnly
      ? this.applyAccessTokenOnlyHeaders(headers)
      : skipAuth
        ? headers
        : this.applySdkworkAuthHeaders(headers);
    const requestBody = this.buildRequestBody(body, contentType);
    const preparedHeaders = await this.applySdkworkRequestBodyFingerprint(
      this.buildRequestHeaders(requestHeaders, body == null ? undefined : contentType),
      requestBody,
    );
    const payload = await withRetry(
      () => execute.call(this, {
        url: path,
        method,
        ...rest,
        skipAuth,
        accessTokenOnly,
        body: requestBody,
        headers: preparedHeaders,
      }),
      { maxRetries: 3 }
    );
    return this.unwrapSdkworkV3Payload<T>(payload);
  }

  async *streamJson<T>(path: string, options: HttpRequestOptions = {}): AsyncIterable<T> {
    const stream = (BaseHttpClient.prototype as any).stream;
    if (typeof stream !== 'function') {
      throw new Error('BaseHttpClient stream method is not available');
    }
    const {
      body,
      headers,
      contentType,
      method = 'GET',
      skipAuth,
      accessTokenOnly,
      ...rest
    } = options;
    const authHeaders = accessTokenOnly
      ? this.applyAccessTokenOnlyHeaders(headers)
      : skipAuth
        ? headers
        : this.applySdkworkAuthHeaders(headers);
    const requestBody = this.buildRequestBody(body, contentType);
    const requestHeaders = await this.applySdkworkRequestBodyFingerprint(
      this.buildRequestHeaders(
        { Accept: 'text/event-stream', ...(authHeaders ?? {}) },
        body == null ? undefined : contentType,
      ),
      requestBody,
    );

    for await (const data of stream.call(this, path, {
      method,
      ...rest,
      skipAuth,
      accessTokenOnly,
      body: requestBody,
      headers: requestHeaders,
    })) {
      if (data === '[DONE]') {
        return;
      }
      if (typeof data !== 'string' || data.trim().length === 0) {
        continue;
      }
      yield JSON.parse(data) as T;
    }
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
    legacyClientName: string | undefined,
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
    const legacyExport = legacyClientName ? `\nexport { ${clientName} as ${legacyClientName} };\n` : '';

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
${legacyExport}
export default ${clientName};
`),
      language: 'typescript',
      description: 'Main SDK class',
    };
  }

  private generateMainIndex(clientName: string, legacyClientName: string | undefined): GeneratedFile {
    const exports = [clientName, legacyClientName, 'createClient'].filter(Boolean).join(', ');
    return {
      path: 'src/index.ts',
      content: this.format(`export { ${exports} } from './sdk';
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

  private resolveAccessTokenHeader(_config: GeneratorConfig, _detectedApiKeyHeader?: string): string {
    return 'Access-Token';
  }
}
