import { describe, expect, it } from 'vitest';
import type { ApiSpec } from './types.js';
import { validateSdkworkV3Standard } from './sdkwork-v3-standard.js';

const openApiKeySpec: ApiSpec = {
  openapi: '3.1.0',
  info: { title: 'SDKWork Image Open API', version: '1.0.0' },
  paths: {
    '/image/v3/api/compat/openai/images/generations': {
      post: {
        summary: 'Generate an image through an OpenAI-compatible image adapter',
        operationId: 'compat.openai.images.generate',
        tags: ['imageCompat'],
        security: [{ ApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { type: 'object', additionalProperties: true },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetail' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
    schemas: {
      ProblemDetail: {
        type: 'object',
        required: ['type', 'title', 'status', 'code', 'traceId'],
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'integer' },
          code: { type: 'integer' },
          traceId: { type: 'string', format: 'uuid' },
        },
      },
    },
  },
};

describe('sdkwork-v3 standard open-api validation', () => {
  it('accepts custom open-api SDKs with a caller-supplied non-app non-backend prefix and API key auth', () => {
    expect(validateSdkworkV3Standard(openApiKeySpec, {
      sdkType: 'custom',
      apiPrefix: '/image/v3/api',
    })).toEqual([]);
  });

  it('rejects custom open-api SDKs that reuse app/backend prefixes', () => {
    expect(validateSdkworkV3Standard(openApiKeySpec, {
      sdkType: 'custom',
      apiPrefix: '/app/v3/api',
    })).toContain('apiPrefix must not be "/app/v3/api" or "/backend/v3/api" for sdkwork-v3 custom open-api SDKs.');
  });
});
