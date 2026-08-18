import { describe, expect, it } from 'vitest';

import type { ApiSpec, GeneratorConfig, SchemaContext } from '../../framework/types.js';
import { HttpClientGenerator } from './http-generator.js';
import { TypeScriptGenerator } from './index.js';

const config: GeneratorConfig = {
  name: 'TrailingWhitespaceSDK',
  version: '1.0.0',
  language: 'typescript',
  sdkType: 'custom',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/demo/v3/api',
};

const spec: ApiSpec = {
  openapi: '3.1.0',
  info: { title: 'Trailing Whitespace API', version: '1.0.0' },
  paths: {
    '/demo/v3/api/items': {
      get: {
        operationId: 'items.list',
        tags: ['items'],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ItemList' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ItemList: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  },
};

describe('TypeScript HTTP generator', () => {
  it('does not emit trailing whitespace in the HTTP client', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(config, spec);

    expect(result.errors).toEqual([]);
    const httpClient = result.files.find((file) => file.path === 'src/http/client.ts');

    expect(httpClient?.content).toBeDefined();
    expect(httpClient?.content).not.toMatch(/[ \t]+$/m);
  });

  it('emits inherited overrides and omits undefined request options', async () => {
    const result = await new TypeScriptGenerator().generate(config, spec);

    expect(result.errors).toEqual([]);
    const httpClient = result.files.find((file) => file.path === 'src/http/client.ts');

    expect(httpClient?.content).toContain('protected override buildHeaders(config: any, skipAuth = false)');
    expect(httpClient?.content).toContain('override setAuthToken(token: string): void');
    expect(httpClient?.content).toContain('override setAccessToken(token: string): void');
    expect(httpClient?.content).toContain('override setTokenManager(manager: AuthTokenManager): void');
    expect(httpClient?.content).toContain('override async request<T>(path: string, options: HttpRequestOptions = {})');
    expect(httpClient?.content).toContain('...(requestBody !== undefined ? { body: requestBody } : {}),');
    expect(httpClient?.content).toContain('...(preparedHeaders !== undefined ? { headers: preparedHeaders } : {}),');
    expect(httpClient?.content).toContain('...(params !== undefined ? { params } : {}),');
    expect(httpClient?.content).toContain('...(contentType !== undefined ? { contentType } : {}),');
  });

  it('normalizes sdkwork-v3 data whether the common transport preserved or removed the envelope', async () => {
    const generator = new HttpClientGenerator();
    const files = generator.generate(
      {
        schemas: {},
        schemaFileMap: new Map(),
        apiGroups: {},
        auth: {
          hasApiKeyScheme: false,
          hasBearerScheme: false,
          hasSecurityRequirements: false,
          apiKeyAsBearer: false,
        },
      } satisfies SchemaContext,
      {
        ...config,
        sdkType: 'app',
        options: { standardProfile: 'sdkwork-v3' },
      },
    );

    const httpClient = files.find((file) => file.path === 'src/http/client.ts');

    expect(httpClient?.content).toContain(
      "return this.unwrapSdkworkV3Data<T>(record, unwrapKind);",
    );
    expect(httpClient?.content).toContain(
      "return this.unwrapSdkworkV3Data<T>(data as Record<string, unknown>, unwrapKind);",
    );
    expect(httpClient?.content).toContain("if (unwrapKind === 'item' && 'item' in data)");
    expect(httpClient?.content).toContain('return data.item as T;');
    expect(httpClient?.content).toContain("sdkworkUnwrapKind?: SdkworkV3UnwrapKind;");
  });

  it('adds a body fingerprint to sdkwork-v3 idempotent requests', () => {
    const generator = new HttpClientGenerator();
    const files = generator.generate(
      {
        schemas: {},
        schemaFileMap: new Map(),
        apiGroups: {},
        auth: {
          hasApiKeyScheme: false,
          hasBearerScheme: false,
          hasSecurityRequirements: false,
          apiKeyAsBearer: false,
        },
      } satisfies SchemaContext,
      {
        ...config,
        sdkType: 'app',
        options: { standardProfile: 'sdkwork-v3' },
      },
    );

    const httpClient = files.find((file) => file.path === 'src/http/client.ts');

    expect(httpClient?.content).toContain('SDKWORK_V3_REQUEST_FINGERPRINTS = true');
    expect(httpClient?.content).toContain("this.hasNonEmptyHeader(headers, 'Idempotency-Key')");
    expect(httpClient?.content).toContain("header: 'X-Content-SHA256'");
    expect(httpClient?.content).toContain("header: 'X-Idempotency-Fingerprint'");
    expect(httpClient?.content).toContain("import { sha256Hash } from '@sdkwork/utils';");
    expect(httpClient?.content).toContain('return sha256Hash(bytes);');
    expect(httpClient?.content).toContain(
      'const preparedHeaders = await this.applySdkworkRequestBodyFingerprint(',
    );
  });

  it('keeps automatic request fingerprints disabled outside sdkwork-v3', () => {
    const generator = new HttpClientGenerator();
    const files = generator.generate(
      {
        schemas: {},
        schemaFileMap: new Map(),
        apiGroups: {},
        auth: {
          hasApiKeyScheme: false,
          hasBearerScheme: false,
          hasSecurityRequirements: false,
          apiKeyAsBearer: false,
        },
      } satisfies SchemaContext,
      config,
    );

    const httpClient = files.find((file) => file.path === 'src/http/client.ts');

    expect(httpClient?.content).toContain('SDKWORK_V3_REQUEST_FINGERPRINTS = false');
  });

  it('generates mutually exclusive API-key-or-dual-token transport for IM', () => {
    const generator = new HttpClientGenerator();
    const files = generator.generate(
      {
        schemas: {},
        schemaFileMap: new Map(),
        apiGroups: {},
        auth: {
          hasApiKeyScheme: true,
          hasBearerScheme: true,
          hasSecurityRequirements: true,
          apiKeyHeader: 'X-API-Key',
          apiKeyAsBearer: false,
        },
      } satisfies SchemaContext,
      {
        ...config,
        sdkType: 'im',
        apiPrefix: '/im/v3/api',
        options: { standardProfile: 'sdkwork-v3' },
      },
    );

    const httpClient = files.find((file) => file.path === 'src/http/client.ts');
    expect(httpClient?.content).toContain('HttpClient.assertInitialCredentialMode(config as any);');
    expect(httpClient?.content).toContain('this.setApiKey(initialApiKey);');
    expect(httpClient?.content).toContain('delete headers[HttpClient.API_KEY_HEADER]');
    expect(httpClient?.content).toContain('must not mix X-API-Key with auth/access tokens');
    expect(httpClient?.content).toContain('requires either X-API-Key or both Authorization and Access-Token');
    expect(httpClient?.content).toContain("buildAuthHeaders('dual-token', undefined, tokenManager)");
    expect(httpClient?.content).toContain('REQUIRES_SDKWORK_ACCESS_TOKEN = false');
  });
});
