import { describe, expect, it } from 'vitest';

import type { ApiSpec, GeneratorConfig } from '../../framework/types.js';
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
});
