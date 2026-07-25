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

describe('sdkwork-v3 backend agent-token validation', () => {
  const backendAgentSpec: ApiSpec = {
    ...openApiKeySpec,
    info: { title: 'SDKWork Backend Agent API', version: '1.0.0' },
    paths: {
      '/backend/v3/api/agent/heartbeat': {
        post: {
          summary: 'Report an agent heartbeat',
          operationId: 'agent.heartbeat',
          tags: ['agent'],
          security: [{ AgentToken: [], AccessToken: [] }],
          'x-sdkwork-auth-mode': 'api-key',
          'x-sdkwork-route-auth': 'agent-token',
          responses: openApiKeySpec.paths['/image/v3/api/compat/openai/images/generations'].post.responses,
        },
      },
    },
    components: {
      ...openApiKeySpec.components,
      securitySchemes: {
        AuthToken: { type: 'http', scheme: 'bearer' },
        AccessToken: { type: 'apiKey', in: 'header', name: 'Access-Token' },
        AgentToken: { type: 'apiKey', in: 'header', name: 'X-SDKWork-Agent-Token' },
      },
    },
  };

  it('accepts an explicitly declared AgentToken backend route', () => {
    const issues = validateSdkworkV3Standard(backendAgentSpec, { sdkType: 'backend' });
    expect(issues.filter((issue) => issue.includes('AgentToken'))).toEqual([]);
    expect(issues.filter((issue) => issue.includes('must require both AuthToken'))).toEqual([]);
  });

  it('rejects an agent-token route that is declared anonymous', () => {
    const anonymousSpec = structuredClone(backendAgentSpec);
    anonymousSpec.paths['/backend/v3/api/agent/heartbeat'].post.security = [];
    expect(validateSdkworkV3Standard(anonymousSpec, { sdkType: 'backend' }))
      .toContain('POST /backend/v3/api/agent/heartbeat agent-token route must require both AgentToken and AccessToken.');
  });
});

describe('sdkwork-v3 non-open-api access-token validation', () => {
  const appSpec: ApiSpec = {
    ...openApiKeySpec,
    info: { title: 'SDKWork App API', version: '1.0.0' },
    paths: {
      '/app/v3/api/auth/sessions': {
        post: {
          summary: 'Create an app session',
          operationId: 'auth.sessions.create',
          tags: ['auth'],
          security: [{ AccessToken: [] }],
          'x-sdkwork-auth-mode': 'credential-entry-bootstrap',
          responses: openApiKeySpec.paths['/image/v3/api/compat/openai/images/generations'].post.responses,
        },
      },
    },
    components: {
      ...openApiKeySpec.components,
      securitySchemes: {
        AuthToken: { type: 'http', scheme: 'bearer' },
        AccessToken: { type: 'apiKey', in: 'header', name: 'Access-Token' },
      },
    },
  };

  it('accepts Access-Token-only credential-entry and refresh profiles', () => {
    const authIssues = (spec: ApiSpec) => validateSdkworkV3Standard(spec, { sdkType: 'app' })
      .filter((issue) => (
        issue.includes('route must')
        || issue.includes('AccessToken')
        || issue.includes('security: []')
      ));
    expect(authIssues(appSpec)).toEqual([]);
    const refreshSpec = structuredClone(appSpec);
    refreshSpec.paths['/app/v3/api/auth/sessions'].post['x-sdkwork-auth-mode'] = 'refresh-token';
    expect(authIssues(refreshSpec)).toEqual([]);
  });

  it('accepts explicitly anonymous app-api operations', () => {
    const anonymousSpec = structuredClone(appSpec);
    anonymousSpec.paths['/app/v3/api/auth/sessions'].post['x-sdkwork-auth-mode'] = 'anonymous';
    anonymousSpec.paths['/app/v3/api/auth/sessions'].post.security = [];
    const issues = validateSdkworkV3Standard(anonymousSpec, { sdkType: 'app' })
      .filter((issue) => issue.includes('anonymous route'));
    expect(issues).toEqual([]);
  });

  it('requires anonymous app-api operations to suppress stored credentials', () => {
    const anonymousSpec = structuredClone(appSpec);
    anonymousSpec.paths['/app/v3/api/auth/sessions'].post['x-sdkwork-auth-mode'] = 'anonymous';
    expect(validateSdkworkV3Standard(anonymousSpec, { sdkType: 'app' }))
      .toContain('POST /app/v3/api/auth/sessions anonymous route must explicitly set security: [].');
  });
});
