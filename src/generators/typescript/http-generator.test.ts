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
      "return this.unwrapSdkworkV3Data<T>(record);",
    );
    expect(httpClient?.content).toContain(
      "return this.unwrapSdkworkV3Data<T>(data as Record<string, unknown>);",
    );
    expect(httpClient?.content).toContain("if ('item' in data)");
    expect(httpClient?.content).toContain('return data.item as T;');
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
    expect(httpClient?.content).toContain("subtle.digest('SHA-256', bytes)");
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
});
