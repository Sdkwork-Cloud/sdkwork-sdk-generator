import { describe, expect, it } from 'vitest';

import { getGenerator } from '../index.js';
import type { ApiSpec, GeneratorConfig, Language } from './types.js';

const binarySpec: ApiSpec = {
  openapi: '3.1.0',
  info: { title: 'Internal Binary Content', version: '1.0.0' },
  paths: {
    '/internal/v3/api/files/{fileId}/content': {
      get: {
        summary: 'Retrieve immutable content',
        operationId: 'fileContent.retrieve',
        tags: ['fileContent'],
        security: [{ ApiKey: [] }],
        parameters: [
          {
            name: 'fileId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Complete content',
            content: {
              'application/octet-stream': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
          '206': {
            description: 'Partial content',
            content: {
              'application/octet-stream': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
    },
    schemas: {
      ProblemDetail: {
        type: 'object',
        required: ['type', 'title', 'status', 'code', 'traceId'],
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'integer', format: 'int32' },
          code: { type: 'integer', format: 'int32' },
          traceId: { type: 'string', format: 'uuid' },
        },
      },
    },
  },
};

function config(language: Language): GeneratorConfig {
  return {
    name: 'SdkworkDriveInternalSdk',
    version: '1.0.0',
    language,
    sdkType: 'custom',
    outputPath: './test-output',
    apiSpecPath: './internal.openapi.yaml',
    baseUrl: 'http://127.0.0.1:18080',
    apiPrefix: '/internal/v3/api',
    packageName: `sdkwork-drive-internal-sdk-generated-${language}`,
    options: { standardProfile: 'sdkwork-v3' },
  };
}

function generatedContent(files: Array<{ content: string }>): string {
  return files.map((file) => file.content).join('\n');
}

describe('binary response generation', () => {
  it.each([
    ['typescript', 'Promise<Blob>', 'this.client.get<Blob>'],
    ['rust', 'Result<Vec<u8>, SdkworkError>', 'self.client.request_bytes('],
    ['java', 'public byte[] retrieve(', 'client.requestBytes('],
    ['python', 'def retrieve(self, file_id: str) -> bytes:', 'self._client.request_bytes('],
    ['go', 'Retrieve(fileId string) ([]byte, error)', 'a.client.RequestBytes('],
  ] as const)(
    'preserves %s binary responses as bytes without JSON decoding',
    async (language, signature, transportCall) => {
      const generator = getGenerator(language);
      expect(generator).toBeDefined();

      const result = await generator!.generate(config(language), binarySpec);
      const content = generatedContent(result.files);

      expect(result.errors).toEqual([]);
      expect(content).toContain(signature);
      expect(content).toContain(transportCall);
    },
  );
});
