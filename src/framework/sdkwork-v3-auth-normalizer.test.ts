import { describe, expect, it } from 'vitest';

import { generateSdk } from '../index.js';
import type { ApiSpec, GeneratorConfig, Language } from './types.js';
import { SDKWORK_V3_TEST_ENVELOPE_SCHEMAS } from './sdkwork-v3-envelope-fixtures.js';

const languages: Language[] = [
  'typescript',
  'flutter',
  'rust',
  'java',
  'csharp',
  'swift',
  'kotlin',
  'go',
  'python',
];

const languageLabels: Record<Language, string> = {
  typescript: 'TypeScript',
  dart: 'Dart',
  python: 'Python',
  java: 'Java',
  csharp: 'C#',
  go: 'Go',
  rust: 'Rust',
  swift: 'Swift',
  flutter: 'Flutter',
  kotlin: 'Kotlin',
  php: 'PHP',
  ruby: 'Ruby',
};

const spec: ApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'SDKWork IM API',
    version: '1.0.0',
  },
  paths: {
    '/im/v3/api/chat/conversations': {
      get: {
        summary: 'List conversations',
        operationId: 'conversations.list',
        tags: ['chat'],
        security: [
          {
            AuthToken: [],
            AccessToken: [],
          },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SdkWorkListResponse' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      AuthToken: {
        type: 'http',
        scheme: 'bearer',
      },
      AccessToken: {
        type: 'apiKey',
        in: 'header',
        name: 'Access-Token',
      },
    },
    schemas: { ...SDKWORK_V3_TEST_ENVELOPE_SCHEMAS },
  },
};

function createConfig(language: Language): GeneratorConfig {
  return {
    name: 'SdkworkImSdk',
    version: '1.0.0',
    language,
    sdkType: 'im',
    outputPath: './test-output',
    apiSpecPath: './openapi.json',
    baseUrl: 'https://chat.example.com/sdkwork/chat',
    apiPrefix: '/im/v3/api',
    packageName: language === 'typescript' ? '@sdkwork/im-sdk-generated' : undefined,
    options: {
      standardProfile: 'sdkwork-v3',
    },
  };
}

function allGeneratedContentByPath(resultFiles: Array<{ path: string; content: string }>): Map<string, string> {
  return new Map(resultFiles.map((file) => [file.path, file.content]));
}

function isSdkAuthSurfaceFile(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/');
  if (
    normalizedPath.startsWith('.sdkwork/')
    || normalizedPath.startsWith('bin/')
    || normalizedPath.startsWith('custom/')
    || normalizedPath.startsWith('tests/')
    || normalizedPath === 'LICENSE'
    || normalizedPath === 'CHANGELOG.md'
  ) {
    return false;
  }
  return true;
}

describe('sdkwork-v3 dual-token auth surface normalization', () => {
  it.each(languages)('generates %s IM SDK output without API key auth surface', async (language) => {
    const result = await generateSdk(createConfig(language), spec);
    expect(result.errors).toEqual([]);

    const files = allGeneratedContentByPath(result.files);
    const combined = [...files.entries()]
      .filter(([path]) => isSdkAuthSurfaceFile(path))
      .map(([path, content]) => `--- ${path} ---\n${content}`)
      .join('\n');

    expect(combined).not.toContain('setApiKey');
    expect(combined).not.toContain('set_api_key');
    expect(combined).not.toContain('SetApiKey');
    expect(combined).not.toContain('apiKey?:');
    expect(combined).not.toContain('apiKeyHeader');
    expect(combined).not.toContain('apiKeyAsBearer');
    expect(combined).not.toContain('API_KEY');
    expect(combined).not.toContain('your-api-key');
    expect(combined).not.toContain('Mode A: API Key');
    expect(combined).not.toContain('Authentication Modes');
    expect(combined).not.toContain(`Professional ${languageLabels[language]} SDK for SDKWork API`);
    expect(combined).toContain('Authorization: Bearer <authToken>');
    expect(combined).toContain('Access-Token: <accessToken>');
  });

  it('preserves business API key resource names in backend SDK output', async () => {
    const backendSpec: ApiSpec = {
      ...spec,
      paths: {
        '/backend/v3/api/admin/api_key_groups': {
          get: {
            summary: 'List API key groups',
            operationId: 'apiKeyGroups.list',
            tags: ['admin'],
            security: [
              {
                AuthToken: [],
                AccessToken: [],
              },
            ],
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/SdkWorkListResponse' },
                  },
                },
              },
            },
          },
        },
      },
    };
    const result = await generateSdk(
      {
        ...createConfig('typescript'),
        sdkType: 'backend',
        apiPrefix: '/backend/v3/api',
        packageName: '@sdkwork/im-backend-sdk-generated',
      },
      backendSpec,
    );

    expect(result.errors).toEqual([]);
    const combined = [...allGeneratedContentByPath(result.files).entries()]
      .filter(([path]) => isSdkAuthSurfaceFile(path))
      .map(([path, content]) => `--- ${path} ---\n${content}`)
      .join('\n');

    expect(combined).toContain('apiKeyGroups');
    expect(combined).not.toContain('setApiKey');
    expect(combined).not.toContain('apiKey?:');
    expect(combined).not.toContain('apiKeyHeader');
    expect(combined).not.toContain('apiKeyAsBearer');
  });

  it('preserves Java business credential fields named apiKey while removing SDK auth API key methods', async () => {
    const backendSpec: ApiSpec = {
      ...spec,
      paths: {
        '/backend/v3/api/admin/channels': {
          post: {
            summary: 'Create admin channel',
            operationId: 'channels.create',
            tags: ['admin'],
            security: [
              {
                AuthToken: [],
                AccessToken: [],
              },
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['credentials'],
                    properties: {
                      credentials: {
                        $ref: '#/components/schemas/AdminChannelCredentialInput',
                      },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/SdkWorkResourceResponse' },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        ...spec.components,
        schemas: {
          ...SDKWORK_V3_TEST_ENVELOPE_SCHEMAS,
          AdminChannelCredentialInput: {
            type: 'object',
            required: ['apiKey'],
            properties: {
              apiKey: {
                type: 'string',
                minLength: 1,
              },
            },
          },
        },
      },
    };
    const result = await generateSdk(
      {
        ...createConfig('java'),
        sdkType: 'backend',
        apiPrefix: '/backend/v3/api',
        packageName: 'com.sdkwork.clawrouter:clawrouter-backend-sdk',
      },
      backendSpec,
    );

    expect(result.errors).toEqual([]);
    const files = allGeneratedContentByPath(result.files);
    const modelFile = files.get('src/main/java/com/sdkwork/clawrouter/backend/model/AdminChannelCredentialInput.java') ?? '';
    const combinedAuthSurface = [...files.entries()]
      .filter(([path]) => isSdkAuthSurfaceFile(path) && !path.includes('/model/'))
      .map(([path, content]) => `--- ${path} ---\n${content}`)
      .join('\n');

    expect(modelFile).toContain('setApiKey');
    expect(modelFile).toContain('getApiKey');
    expect(combinedAuthSurface).not.toContain('setApiKey');
    expect(combinedAuthSurface).not.toContain('apiKeyHeader');
    expect(combinedAuthSurface).not.toContain('apiKeyAsBearer');
  });

  it('removes Java SDK auth API key methods when the package root contains api', async () => {
    const appSpec: ApiSpec = {
      ...spec,
      paths: {
        '/app/v3/api/portal/access': {
          get: {
            summary: 'Get portal access',
            operationId: 'portal.access.get',
            tags: ['portal'],
            security: [
              {
                AuthToken: [],
                AccessToken: [],
              },
            ],
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/SdkWorkResourceResponse' },
                  },
                },
              },
            },
          },
        },
      },
    };
    const result = await generateSdk(
      {
        ...createConfig('java'),
        sdkType: 'app',
        apiPrefix: '/app/v3/api',
        packageName: 'com.sdkwork:im-app-api-generated',
        clientName: 'SdkworkImAppClient',
      },
      appSpec,
    );

    expect(result.errors).toEqual([]);
    const files = allGeneratedContentByPath(result.files);
    const clientFile = files.get(
      'src/main/java/com/sdkwork/im/app/api/generated/SdkworkImAppClient.java',
    ) ?? '';
    const portalApiFile = files.get(
      'src/main/java/com/sdkwork/im/app/api/generated/api/PortalApi.java',
    ) ?? '';

    expect(clientFile).toContain('class SdkworkImAppClient');
    expect(clientFile).not.toContain('setApiKey');
    expect(portalApiFile).toContain('class PortalApi');
  });

  it('generates custom open-api TypeScript output with API-key-only auth surface', async () => {
    const openApiSpec: ApiSpec = {
      openapi: '3.1.0',
      info: {
        title: 'SDKWork Knowledgebase Open API',
        version: '1.0.0',
      },
      paths: {
        '/knowledge/v3/api/retrievals': {
          post: {
            summary: 'Create retrieval',
            operationId: 'retrievals.create',
            tags: ['retrievals'],
            security: [
              {
                ApiKey: [],
              },
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/CreateRetrievalRequest',
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/Retrieval',
                    },
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
          ProblemDetail: SDKWORK_V3_TEST_ENVELOPE_SCHEMAS.ProblemDetail,
          CreateRetrievalRequest: {
            type: 'object',
            required: ['query'],
            properties: {
              query: { type: 'string' },
            },
          },
          Retrieval: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string' },
            },
          },
        },
      },
    };

    const result = await generateSdk(
      {
        name: 'Knowledgebase',
        version: '1.0.0',
        language: 'typescript',
        sdkType: 'custom',
        outputPath: './test-output',
        apiSpecPath: './knowledgebase-open-api.openapi.json',
        baseUrl: '/knowledge/v3/api',
        apiPrefix: '/knowledge/v3/api',
        packageName: '@sdkwork/knowledgebase-sdk',
        clientName: 'SdkworkKnowledgebaseClient',
        options: {
          standardProfile: 'sdkwork-v3',
        },
      },
      openApiSpec,
    );

    expect(result.errors).toEqual([]);
    const files = allGeneratedContentByPath(result.files);
    const readme = files.get('README.md') ?? '';
    const commonTypes = files.get('src/types/common.ts') ?? '';
    const httpClient = files.get('src/http/client.ts') ?? '';
    const sdkClient = files.get('src/sdk.ts') ?? '';
    const authIndex = files.get('src/auth/index.ts') ?? '';
    const combinedAuthSurface = [readme, commonTypes, httpClient, sdkClient, authIndex].join('\n');

    expect(combinedAuthSurface).toContain('setApiKey');
    expect(combinedAuthSurface).toContain('X-API-Key');
    expect(readme).toContain('## Authentication');
    expect(readme).toContain('X-API-Key: <apiKey>');
    expect(commonTypes).toContain('apiKey?: string;');
    expect(combinedAuthSurface).not.toContain('setAuthToken');
    expect(combinedAuthSurface).not.toContain('setAccessToken');
    expect(combinedAuthSurface).not.toContain('setTokenManager');
    expect(httpClient).not.toContain('applyAccessTokenOnlyHeaders');
    expect(httpClient).not.toContain('applySdkworkAuthHeaders');
    expect(httpClient).toContain('applySdkworkRequestBodyFingerprint');
    expect(combinedAuthSurface).not.toContain('AuthTokenManager');
    expect(combinedAuthSurface).not.toContain('DefaultAuthTokenManager');
    expect(combinedAuthSurface).not.toContain('createTokenManager');
    expect(combinedAuthSurface).not.toContain('AuthTokens');
    expect(combinedAuthSurface).not.toContain('AuthMode');
    expect(combinedAuthSurface).not.toContain('authToken?:');
    expect(combinedAuthSurface).not.toContain('accessToken?:');
    expect(combinedAuthSurface).not.toContain('tokenManager?:');
    expect(combinedAuthSurface).not.toContain('authMode?:');
    expect(combinedAuthSurface).not.toContain('Authorization: Bearer <authToken>');
    expect(combinedAuthSurface).not.toContain('Access-Token: <accessToken>');
    expect(combinedAuthSurface).not.toContain('Mode B: Dual Token');
    expect(combinedAuthSurface).not.toContain('Authentication Modes');
    expect(combinedAuthSurface).not.toContain('your-auth-token');
    expect(combinedAuthSurface).not.toContain('your-access-token');
  });
});
