import { describe, expect, it } from 'vitest';

import type { ApiSpec, GeneratorConfig } from '../../framework/types.js';
import { getGenerator } from '../../index.js';

const javaConfig: GeneratorConfig = {
  name: 'SdkworkAppSdk',
  version: '1.0.0',
  language: 'java' as any,
  sdkType: 'app',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/app/v3/api',
};

const javaSpec: ApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Java SDK Regression',
    version: '1.0.0',
  },
  paths: {
    '/app/v3/api/upload/file': {
      post: {
        summary: 'Upload file',
        operationId: 'uploadFile',
        tags: ['Upload'],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                additionalProperties: {
                  type: 'string',
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      PromptFilter: {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          parameters: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              additionalProperties: {
                type: 'string',
              },
            },
          },
        },
      },
    },
  },
};

describe('Java generator regressions', () => {
  it('emits Java 11 compatible HttpClient code without pattern matching instanceof syntax', async () => {
    const generator = getGenerator('java' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(javaConfig, javaSpec);
    const clientFile = result.files.find((file) => file.path === 'src/main/java/com/sdkwork/app/http/HttpClient.java');
    const modelFile = result.files.find((file) => file.path === 'src/main/java/com/sdkwork/app/model/PromptFilter.java');

    expect(result.errors).toEqual([]);
    expect(clientFile).toBeDefined();
    expect(modelFile).toBeDefined();
    expect(clientFile!.content).not.toContain('instanceof RequestBody requestBody');
    expect(clientFile!.content).not.toContain('instanceof Map<?, ?> mapBody');
    expect(clientFile!.content).not.toContain('instanceof byte[] bytes');
    expect(clientFile!.content).not.toContain('instanceof Iterable<?> iterable');
    expect(clientFile!.content).not.toContain('instanceof Collection<?> collection');
    expect(clientFile!.content).toContain('if (body instanceof RequestBody) {');
    expect(clientFile!.content).toContain('RequestBody requestBody = (RequestBody) body;');
    expect(clientFile!.content).toContain('if (body instanceof Map<?, ?>) {');
    expect(clientFile!.content).toContain('Map<?, ?> mapBody = (Map<?, ?>) body;');
    expect(modelFile!.content).toContain('import java.util.List;');
    expect(modelFile!.content).toContain('import java.util.Map;');
    expect(modelFile!.content).toContain('private List<String> tags;');
    expect(modelFile!.content).toContain('private Map<String, Map<String, String>> parameters;');
  });
});
