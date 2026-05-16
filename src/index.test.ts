import { describe, it, expect } from 'vitest';
import { TypeScriptGenerator } from './generators/typescript/index.js';
import { PythonGenerator } from './generators/python/index.js';
import { GoGenerator } from './generators/go/index.js';
import { JavaGenerator } from './generators/java/index.js';
import { SwiftGenerator } from './generators/swift/index.js';
import { KotlinGenerator } from './generators/kotlin/index.js';
import { DartGenerator } from './generators/dart/index.js';
import { FlutterGenerator } from './generators/flutter/index.js';
import { CSharpGenerator } from './generators/csharp/index.js';
import { PhpGenerator } from './generators/php/index.js';
import { RubyGenerator } from './generators/ruby/index.js';
import { RustGenerator } from './generators/rust/index.js';
import {
  analyzeChangeImpact,
  buildExecutionDecisionFromContext,
  buildExecutionHandoff,
  getGenerator,
  getLanguageCapabilities,
  getLanguageCapability,
  getSupportedLanguages,
  getSupportedSdkTypes,
  generateSdk,
} from './index.js';
import type { GeneratorConfig, ApiSpec } from './framework/types.js';

const mockSpec: ApiSpec = {
  openapi: '3.0.0',
  info: { title: 'Test API', version: '1.0.0' },
  paths: {
    '/users': {
      get: {
        summary: 'List users',
        operationId: 'listUsers',
        tags: ['User'],
        responses: { '200': { description: 'Success' } },
      },
      post: {
        summary: 'Create user',
        operationId: 'createUser',
        tags: ['User'],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/users/{id}': {
      get: {
        summary: 'Get user',
        operationId: 'getUser',
        tags: ['User'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' },
        },
      },
    },
  },
};

const baseConfig: GeneratorConfig = {
  name: 'TestSDK',
  version: '1.0.0',
  language: 'typescript',
  sdkType: 'backend',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/api/v1',
};

function getGeneratedFile(files: Array<{ path: string; content: string }>, path: string): { path: string; content: string } {
  const file = files.find((candidate) => candidate.path === path);
  expect(file).toBeDefined();
  return file!;
}

describe('Generator registry', () => {
  it('should export change impact analysis for external automation', () => {
    const impact = analyzeChangeImpact({
      createdGeneratedFiles: ['src/api/user.ts'],
      updatedGeneratedFiles: [],
      unchangedGeneratedFiles: [],
      deletedGeneratedFiles: [],
      scaffoldedFiles: [],
      preservedScaffoldFiles: [],
      backedUpFiles: [],
    });

    expect(impact.areas).toEqual(['api-surface']);
    expect(impact.requiresVerification).toBe(true);
  });

  it('should export execution decision planning for external automation', () => {
    const decision = buildExecutionDecisionFromContext({
      language: 'typescript',
      outputPath: '/tmp/generated-sdk',
      dryRun: true,
      preservedLegacyFiles: false,
      changes: {
        createdGeneratedFiles: ['src/api/user.ts'],
        updatedGeneratedFiles: [],
        unchangedGeneratedFiles: [],
        deletedGeneratedFiles: [],
        scaffoldedFiles: [],
        preservedScaffoldFiles: [],
        backedUpFiles: [],
      },
    });

    expect(decision.nextAction).toBe('apply');
    expect(decision.applyRequiresExpectedFingerprint).toBe(true);
  });

  it('should export execution handoff planning for command-level automation', () => {
    const handoff = buildExecutionHandoff({
      config: {
        ...baseConfig,
        apiSpecPath: '/tmp/openapi.json',
      },
      spec: mockSpec,
      result: {
        files: [],
        errors: [],
        warnings: [],
        stats: {
          totalFiles: 0,
          models: 0,
          apis: 0,
          types: 0,
        },
      },
      resolvedVersion: {
        version: '1.0.0',
        localVersions: [],
        publishedVersion: undefined,
      },
      syncSummary: {
        dryRun: true,
        writtenFiles: 1,
        skippedScaffoldFiles: 0,
        skippedUnchangedGeneratedFiles: 0,
        deletedGeneratedFiles: 0,
        changeSummaryPath: '.sdkwork/sdkwork-generator-changes.json',
        changeFingerprint: 'fingerprint-1',
        changes: {
          createdGeneratedFiles: ['src/api/user.ts'],
          updatedGeneratedFiles: [],
          unchangedGeneratedFiles: [],
          deletedGeneratedFiles: [],
          scaffoldedFiles: [],
          preservedScaffoldFiles: [],
          backedUpFiles: [],
        },
        backedUpFiles: [],
        preservedLegacyFiles: false,
      },
    });

    expect(handoff.steps[0].displayCommand).toContain('--expected-change-fingerprint fingerprint-1');
  });

  it('should register dart as a supported language', () => {
    expect(getSupportedLanguages()).toContain('dart');
    expect(getGenerator('dart' as any)).toBeDefined();
    expect(getGenerator('dart' as any)?.language).toBe('dart');
  });

  it('should register rust as a supported language', () => {
    expect(getSupportedLanguages()).toContain('rust');
    expect(getGenerator('rust')).toBeDefined();
    expect(getGenerator('rust')?.language).toBe('rust');
  });

  it('should expose the supported sdk types for orchestration callers', () => {
    expect(getSupportedSdkTypes()).toEqual(['app', 'backend', 'ai', 'custom']);
  });

  it('should expose a truthful cross-language capability matrix for automation callers', () => {
    expect(getLanguageCapabilities()).toEqual([
      {
        language: 'typescript',
        supportsGeneratedTests: true,
        supportsReadme: true,
        supportsCustomScaffold: true,
        supportsPublishWorkflow: true,
        hasDistinctBuildStep: true,
      },
      {
        language: 'dart',
        supportsGeneratedTests: true,
        supportsReadme: true,
        supportsCustomScaffold: true,
        supportsPublishWorkflow: true,
        hasDistinctBuildStep: false,
      },
      {
        language: 'python',
        supportsGeneratedTests: true,
        supportsReadme: true,
        supportsCustomScaffold: true,
        supportsPublishWorkflow: true,
        hasDistinctBuildStep: false,
      },
      {
        language: 'go',
        supportsGeneratedTests: true,
        supportsReadme: true,
        supportsCustomScaffold: true,
        supportsPublishWorkflow: true,
        hasDistinctBuildStep: false,
      },
      {
        language: 'java',
        supportsGeneratedTests: true,
        supportsReadme: true,
        supportsCustomScaffold: true,
        supportsPublishWorkflow: true,
        hasDistinctBuildStep: false,
      },
      {
        language: 'swift',
        supportsGeneratedTests: true,
        supportsReadme: true,
        supportsCustomScaffold: true,
        supportsPublishWorkflow: true,
        hasDistinctBuildStep: false,
      },
      {
        language: 'kotlin',
        supportsGeneratedTests: true,
        supportsReadme: true,
        supportsCustomScaffold: true,
        supportsPublishWorkflow: true,
        hasDistinctBuildStep: false,
      },
      {
        language: 'flutter',
        supportsGeneratedTests: true,
        supportsReadme: true,
        supportsCustomScaffold: true,
        supportsPublishWorkflow: true,
        hasDistinctBuildStep: false,
      },
      {
        language: 'csharp',
        supportsGeneratedTests: true,
        supportsReadme: true,
        supportsCustomScaffold: true,
        supportsPublishWorkflow: true,
        hasDistinctBuildStep: false,
      },
      {
        language: 'rust',
        supportsGeneratedTests: true,
        supportsReadme: true,
        supportsCustomScaffold: true,
        supportsPublishWorkflow: true,
        hasDistinctBuildStep: true,
      },
      {
        language: 'php',
        supportsGeneratedTests: true,
        supportsReadme: true,
        supportsCustomScaffold: true,
        supportsPublishWorkflow: true,
        hasDistinctBuildStep: false,
      },
      {
        language: 'ruby',
        supportsGeneratedTests: true,
        supportsReadme: true,
        supportsCustomScaffold: true,
        supportsPublishWorkflow: true,
        hasDistinctBuildStep: false,
      },
    ]);

    expect(getLanguageCapability('typescript')).toEqual(getLanguageCapabilities()[0]);
    expect(getLanguageCapability('rust')).toMatchObject({
      language: 'rust',
      hasDistinctBuildStep: true,
      supportsGeneratedTests: true,
    });
    expect(getLanguageCapability('php')).toMatchObject({
      language: 'php',
      hasDistinctBuildStep: false,
      supportsGeneratedTests: true,
    });
    expect(getLanguageCapability('ruby')).toMatchObject({
      language: 'ruby',
      hasDistinctBuildStep: false,
      supportsGeneratedTests: true,
    });
  });

  it('should register php and ruby as supported languages', () => {
    expect(getSupportedLanguages()).toContain('php');
    expect(getSupportedLanguages()).toContain('ruby');
    expect(getGenerator('php')?.language).toBe('php');
    expect(getGenerator('ruby')?.language).toBe('ruby');
  });

  it('should scaffold a stable custom area for regeneration-safe sdk layouts', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, mockSpec);
    const customReadme = result.files.find((file) => file.path === 'custom/README.md');
    const readme = result.files.find((file) => file.path === 'README.md');

    expect(customReadme).toBeDefined();
    expect(customReadme!.ownership).toBe('scaffold');
    expect(customReadme!.overwriteStrategy).toBe('if-missing');

    expect(readme).toBeDefined();
    expect(readme!.content).toContain('## Regeneration Contract');
    expect(readme!.content).toContain('`custom/`');
  });

  it('should keep TypeScript common exports minimal for project-specific SDK guards', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, mockSpec);
    const commonFile = getGeneratedFile(result.files, 'src/types/common.ts');

    expect(commonFile.content).toContain(
      "export type { Page, RequestConfig, RequestOptions, QueryParams } from '@sdkwork/sdk-common';",
    );
    expect(commonFile.content).toContain('q?: string;');
    expect(commonFile.content).not.toContain('keyword?: string;');
    expect(commonFile.content).not.toContain('PageResult');
  });

  it('should expose q as the shared free-text query field in generated common list forms', async () => {
    const goResult = await new GoGenerator().generate({ ...baseConfig, language: 'go' }, mockSpec);
    const goCommonFile = getGeneratedFile(goResult.files, 'types/common.go');
    expect(goCommonFile.content).toContain('Q           string      `json:"q"`');
    expect(goCommonFile.content).not.toContain('Keyword');
    expect(goCommonFile.content).not.toContain('json:"keyword"');

    const rustResult = await new RustGenerator().generate({ ...baseConfig, language: 'rust' }, mockSpec);
    const rustCommonFile = getGeneratedFile(rustResult.files, 'src/models/common.rs');
    expect(rustCommonFile.content).toContain('pub q: Option<String>,');
    expect(rustCommonFile.content).not.toContain('pub keyword');
  });

  it('should generate closed empty TypeScript interfaces for sealed empty object schemas', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, {
      openapi: '3.0.0',
      info: { title: 'Empty Request API', version: '1.0.0' },
      paths: {
        '/sessions': {
          post: {
            summary: 'Create app session',
            operationId: 'createAppSession',
            tags: ['Session'],
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateAppSessionRequest' },
                },
              },
            },
            responses: { '200': { description: 'Success' } },
          },
        },
      },
      components: {
        schemas: {
          CreateAppSessionRequest: {
            type: 'object',
            description: 'Explicit empty request body for create app session.',
            properties: {},
            additionalProperties: false,
          },
        },
      },
    });
    const requestFile = getGeneratedFile(result.files, 'src/types/create-app-session-request.ts');

    expect(requestFile.content).toContain('/** Explicit empty request body for create app session. */');
    expect(requestFile.content).toContain('export interface CreateAppSessionRequest {}');
    expect(requestFile.content).not.toContain('Record<string, unknown>');
  });

  it('should emit sdk metadata with standardized capabilities and ownership boundaries', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate({ ...baseConfig, generateTests: true }, mockSpec);
    const metadataFile = result.files.find((file) => file.path === 'sdkwork-sdk.json');

    expect(metadataFile).toBeDefined();

    const metadata = JSON.parse(metadataFile!.content) as {
      schemaVersion?: number;
      capabilities?: Record<string, unknown>;
      generation?: Record<string, unknown>;
      ownership?: Record<string, unknown>;
    };

    expect(metadata).toMatchObject({
      schemaVersion: 1,
      name: 'TestSDK',
      version: '1.0.0',
      language: 'typescript',
      sdkType: 'backend',
      packageName: null,
      generator: '@sdkwork/sdk-generator',
      capabilities: {
        supportsGeneratedTests: true,
        supportsReadme: true,
        supportsCustomScaffold: true,
        supportsPublishWorkflow: true,
        hasDistinctBuildStep: true,
      },
      generation: {
        readme: true,
        tests: true,
      },
      ownership: {
        generatedOwnership: 'generated',
        scaffoldOwnership: 'scaffold',
        scaffoldRoots: ['custom/'],
        stateRoots: ['.sdkwork/'],
      },
    });
  });

  it('should reject unsupported sdk types for programmatic generation callers', async () => {
    await expect(generateSdk({
      ...baseConfig,
      sdkType: 'desktop' as any,
    }, mockSpec)).rejects.toThrow(
      'Unsupported SDK type: desktop. Supported: app, backend, ai, custom'
    );
  });

  it('should load remote yaml specs for programmatic generation callers', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/yaml' : null,
      },
      json: async () => {
        throw new Error('json parser should not be required for yaml specs');
      },
      text: async () => `openapi: 3.0.0
info:
  title: Remote Test API
  version: 1.0.0
paths:
  /users:
    get:
      operationId: listUsers
      tags:
        - User
      responses:
        '200':
          description: Success
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
`,
    })) as typeof fetch;

    try {
      const result = await generateSdk(baseConfig, 'https://example.com/openapi.yaml');
      expect(result.errors).toEqual([]);
      expect(result.files.some((file) => file.path === 'src/api/user.ts')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Rust Generator', () => {
  it('should generate cargo-based sdk output for app clients', async () => {
    const generator = getGenerator('rust');
    expect(generator).toBeDefined();

    const result = await generator!.generate(
      {
        ...baseConfig,
        language: 'rust',
        sdkType: 'app',
        packageName: 'sdkwork-app-sdk',
      },
      mockSpec
    );

    expect(result.errors).toEqual([]);
    expect(result.files.some((file) => file.path === 'Cargo.toml')).toBe(true);
    expect(result.files.some((file) => file.path === 'src/lib.rs')).toBe(true);
    expect(result.files.some((file) => file.path === 'src/client.rs')).toBe(true);
    expect(result.files.some((file) => file.path === 'src/http/client.rs')).toBe(true);
    expect(result.files.some((file) => file.path === 'src/api/user.rs')).toBe(true);
    expect(result.files.some((file) => file.path === 'src/models/user.rs')).toBe(true);

    const readme = result.files.find((file) => file.path === 'README.md');
    expect(readme).toBeDefined();
    expect(readme!.content).toContain('Rust');
    expect(readme!.content).toContain('SdkworkAppClient');
    expect(readme!.content).toContain('cargo add sdkwork-app-sdk');
  });
});

describe('PHP And Ruby Generators', () => {
  it('should generate composer-based sdk output for php app clients', async () => {
    const generator = getGenerator('php');
    expect(generator).toBeDefined();

    const result = await generator!.generate(
      {
        ...baseConfig,
        language: 'php',
        sdkType: 'app',
        packageName: 'sdkwork/app-sdk',
      },
      mockSpec
    );

    expect(result.errors).toEqual([]);
    expect(result.files.some((file) => file.path === 'composer.json')).toBe(true);
    expect(result.files.some((file) => file.path === 'src/SdkConfig.php')).toBe(true);
    expect(result.files.some((file) => file.path === 'src/Http/HttpClient.php')).toBe(true);
    expect(result.files.some((file) => file.path === 'src/Api/User.php')).toBe(true);
    expect(result.files.some((file) => file.path === 'src/Models/User.php')).toBe(true);
    expect(result.files.some((file) => file.path === 'sdkwork-sdk.json')).toBe(true);

    const readme = result.files.find((file) => file.path === 'README.md');
    expect(readme).toBeDefined();
    expect(readme!.content).toContain('PHP');
    expect(readme!.content).toContain('SdkworkAppClient');
    expect(readme!.content).toContain('composer require sdkwork/app-sdk');
  });

  it('should generate gem-based sdk output for ruby app clients', async () => {
    const generator = getGenerator('ruby');
    expect(generator).toBeDefined();

    const result = await generator!.generate(
      {
        ...baseConfig,
        language: 'ruby',
        sdkType: 'app',
        packageName: 'sdkwork-app-sdk',
      },
      mockSpec
    );

    expect(result.errors).toEqual([]);
    expect(result.files.some((file) => file.path === 'sdkwork-app-sdk.gemspec')).toBe(true);
    expect(result.files.some((file) => file.path === 'Gemfile')).toBe(true);
    expect(result.files.some((file) => file.path === 'lib/sdkwork/app_sdk.rb')).toBe(true);
    expect(result.files.some((file) => file.path === 'lib/sdkwork/app_sdk/client.rb')).toBe(true);
    expect(result.files.some((file) => file.path === 'lib/sdkwork/app_sdk/api/user.rb')).toBe(true);
    expect(result.files.some((file) => file.path === 'lib/sdkwork/app_sdk/models/user.rb')).toBe(true);
    expect(result.files.some((file) => file.path === 'sdkwork-sdk.json')).toBe(true);

    const readme = result.files.find((file) => file.path === 'README.md');
    expect(readme).toBeDefined();
    expect(readme!.content).toContain('Ruby');
    expect(readme!.content).toContain('SdkworkAppClient');
    expect(readme!.content).toContain('gem install sdkwork-app-sdk');
  });
});

const securitySpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Security API', version: '1.0.0' },
  security: [{ ApiKeyAuth: [] }, { AuthToken: [], AccessToken: [] }],
  paths: {
    '/users/{id}': {
      get: {
        summary: 'Get user',
        operationId: 'getUser',
        tags: ['User'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'X-Trace-Id', in: 'header', required: false, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/upload': {
      post: {
        summary: 'Upload file',
        operationId: 'uploadFile',
        tags: ['File'],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      AuthToken: { type: 'http', scheme: 'bearer' },
      AccessToken: { type: 'apiKey', in: 'header', name: 'Access-Token' },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    },
  },
};

const sdkworkV3IamSpec: ApiSpec = {
  openapi: '3.1.0',
  info: { title: 'SDKWork v3 IAM API', version: '1.0.0' },
  paths: {
    '/app/v3/api/auth/sessions': {
      post: {
        summary: 'Create auth session',
        operationId: 'sessions.create',
        tags: ['auth'],
        security: [],
        parameters: [
          {
            name: 'X-Request-Id',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateSessionRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthSession' },
              },
            },
          },
          '400': {
            description: 'Bad request',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetail' },
              },
            },
          },
        },
      },
    },
    '/app/v3/api/auth/sessions/current': {
      get: {
        summary: 'Get current auth session',
        operationId: 'sessions.current.retrieve',
        tags: ['auth'],
        security: [{ AuthToken: [], SdkworkAccessToken: [] }],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthSession' },
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
      delete: {
        summary: 'Delete current auth session',
        operationId: 'sessions.current.delete',
        tags: ['auth'],
        security: [{ AuthToken: [], SdkworkAccessToken: [] }],
        responses: {
          '204': { description: 'No content' },
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
    '/app/v3/api/auth/sessions/refresh': {
      post: {
        summary: 'Refresh auth session',
        operationId: 'sessions.refresh',
        tags: ['auth'],
        security: [{ AuthToken: [], SdkworkAccessToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RefreshSessionRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthSession' },
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
    '/app/v3/api/auth/verification_codes': {
      post: {
        summary: 'Create verification code',
        operationId: 'verificationCodes.create',
        tags: ['auth'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateVerificationCodeRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VerificationCodeResult' },
              },
            },
          },
          '400': {
            description: 'Bad request',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetail' },
              },
            },
          },
        },
      },
    },
    '/app/v3/api/auth/verification_codes/verify': {
      post: {
        summary: 'Verify verification code',
        operationId: 'verificationCodes.verify',
        tags: ['auth'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VerifyVerificationCodeRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VerificationCodeVerifyResult' },
              },
            },
          },
          '400': {
            description: 'Bad request',
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
      AuthToken: { type: 'http', scheme: 'bearer' },
      SdkworkAccessToken: { type: 'apiKey', in: 'header', name: 'Sdkwork-Access-Token' },
    },
    schemas: {
      CreateSessionRequest: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
      RefreshSessionRequest: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string' },
        },
      },
      CreateVerificationCodeRequest: {
        type: 'object',
        properties: {
          target: { type: 'string' },
          scene: { type: 'string' },
        },
      },
      VerifyVerificationCodeRequest: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          target: { type: 'string' },
        },
      },
      VerificationCodeResult: {
        type: 'object',
        properties: {
          codeId: { type: 'string' },
        },
      },
      VerificationCodeVerifyResult: {
        type: 'object',
        properties: {
          verified: { type: 'boolean' },
        },
      },
      AuthSession: {
        type: 'object',
        properties: {
          authToken: { type: 'string' },
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
        },
      },
      ProblemDetail: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'integer' },
          detail: { type: 'string' },
          instance: { type: 'string' },
        },
      },
    },
  },
};

const modelRefSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Model Ref API', version: '1.0.0' },
  paths: {
    '/model-a': {
      get: {
        summary: 'Get model A',
        operationId: 'getModelA',
        tags: ['AI Agent Management'],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {
      ModelA: {
        type: 'object',
        properties: {
          modelB: { $ref: '#/components/schemas/ModelB' },
        },
      },
      ModelB: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    },
  },
};

const pythonDataclassOrderingSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Python Dataclass Ordering API', version: '1.0.0' },
  paths: {
    '/ordered-model': {
      get: {
        summary: 'Get ordered model',
        operationId: 'getOrderedModel',
        tags: ['Ordered Model'],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {
      OrderedModel: {
        type: 'object',
        properties: {
          optionalName: { type: 'string' },
          requiredId: { type: 'string' },
          optionalCount: { type: 'integer' },
        },
        required: ['requiredId'],
      },
    },
  },
};

const pythonNullableSpec: ApiSpec = {
  openapi: '3.1.0',
  info: { title: 'Python Nullable API', version: '1.0.0' },
  paths: {
    '/nullable-model': {
      get: {
        summary: 'Get nullable model',
        operationId: 'getNullableModel',
        tags: ['Nullable Model'],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {
      NullableModel: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          displayName: { type: ['string', 'null'] },
          optionalCount: { type: 'integer' },
        },
      },
    },
  },
};

const openApi32JsonSchemaSpec: ApiSpec = {
  openapi: '3.2.0',
  info: { title: 'OpenAPI 3.2 JSON Schema API', version: '1.0.0' },
  paths: {
    '/schema-model': {
      post: {
        summary: 'Create schema model',
        operationId: 'createSchemaModel',
        tags: ['Schema Model'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SchemaModel' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SchemaModel' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      UserRef: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      SchemaModel: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          nullableName: { type: ['string', 'null'] },
          nullableCount: { oneOf: [{ type: 'null' }, { type: 'integer' }] },
          nullableFlag: { anyOf: [{ type: ['null'] }, { type: 'boolean' }] },
          aliasedUser: { allOf: [{ type: 'null' }, { $ref: '#/components/schemas/UserRef' }] },
          metadata: {
            additionalProperties: { type: 'string' },
          },
          labels: {
            type: ['array', 'null'],
            items: { type: ['string', 'null'] },
          },
        },
      },
    },
  },
};

const openApi32AllOfObjectSpec: ApiSpec = {
  openapi: '3.2.0',
  info: { title: 'OpenAPI 3.2 AllOf Object API', version: '1.0.0' },
  paths: {
    '/composed-user': {
      get: {
        summary: 'Get composed user',
        operationId: 'getComposedUser',
        tags: ['Composed User'],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ComposedUser' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      BaseEntity: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      UserTraits: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
          displayName: { type: ['string', 'null'] },
        },
      },
      ComposedUser: {
        allOf: [
          { $ref: '#/components/schemas/BaseEntity' },
          { $ref: '#/components/schemas/UserTraits' },
          {
            type: 'object',
            properties: {
              roles: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        ],
      },
    },
  },
};

const openApi32ItemSchemaSpec: ApiSpec = {
  openapi: '3.2.0',
  info: { title: 'OpenAPI 3.2 Item Schema API', version: '1.0.0' },
  paths: {
    '/events': {
      get: {
        summary: 'Stream events',
        operationId: 'streamEvents',
        tags: ['Event'],
        responses: {
          '200': {
            description: 'Event stream',
            content: {
              'application/json-seq': {
                itemSchema: { $ref: '#/components/schemas/Event' },
              },
            },
          },
        },
      },
    },
    '/inline-events': {
      get: {
        summary: 'List inline events',
        operationId: 'listInlineEvents',
        tags: ['Event'],
        responses: {
          '200': {
            description: 'Inline event stream',
            content: {
              'application/json-seq': {
                itemSchema: {
                  type: 'object',
                  required: ['sequence'],
                  properties: {
                    sequence: { type: 'integer' },
                    value: { type: 'string' },
                  },
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
      Event: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
      },
    },
  },
};

const openApi32PrefixItemsSpec: ApiSpec = {
  openapi: '3.2.0',
  info: { title: 'OpenAPI 3.2 Prefix Items API', version: '1.0.0' },
  paths: {
    '/timeline': {
      get: {
        summary: 'Get fixed timeline tuple',
        operationId: 'getTimeline',
        tags: ['Timeline'],
        responses: {
          '200': {
            description: 'Timeline tuple',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TimelineTuple' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      TimelineEvent: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      TimelineTuple: {
        description: 'Fixed position JSON Schema tuple',
        type: 'array',
        prefixItems: [
          { type: 'string' },
          { $ref: '#/components/schemas/TimelineEvent' },
          { type: 'integer' },
        ],
        items: false,
      },
      TimelineEnvelope: {
        type: 'object',
        properties: {
          tuple: {
            type: 'array',
            prefixItems: [
              { type: 'string' },
              { $ref: '#/components/schemas/TimelineEvent' },
              { type: 'integer' },
            ],
            items: false,
          },
        },
      },
    },
  },
};

const openApi31DefsSpec = {
  openapi: '3.1.0',
  info: { title: 'OpenAPI 3.1 Defs API', version: '1.0.0' },
  $defs: {
    AuditRootNote: {
      type: 'object',
      properties: {
        note: { type: 'string' },
      },
    },
  },
  paths: {
    '/audit/envelope': {
      get: {
        summary: 'Get audit envelope',
        operationId: 'getAuditEnvelope',
        tags: ['Audit'],
        responses: {
          '200': {
            description: 'Audit envelope',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuditEnvelope' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      AuditEnvelope: {
        type: 'object',
        required: ['event'],
        properties: {
          event: { $ref: '#/components/schemas/AuditEnvelope/$defs/AuditEvent' },
          actor: { $ref: '#/components/schemas/AuditEnvelope/$defs/AuditActor' },
          metadata: { $ref: '#/$defs/AuditMetadata' },
          rootNote: { $ref: '#/$defs/AuditRootNote' },
        },
        $defs: {
          AuditEvent: {
            type: 'object',
            required: ['id', 'kind'],
            properties: {
              id: { type: 'string' },
              kind: { enum: ['created', 'updated', 'deleted'] },
            },
          },
          AuditActor: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
            },
          },
          AuditMetadata: {
            type: 'object',
            properties: {
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as unknown as ApiSpec;

const openApi31ConstSpec = {
  openapi: '3.1.0',
  info: { title: 'OpenAPI 3.1 Const API', version: '1.0.0' },
  paths: {
    '/const-envelope': {
      get: {
        summary: 'Get const envelope',
        operationId: 'getConstEnvelope',
        tags: ['Const'],
        responses: {
          '200': {
            description: 'Const envelope',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConstEnvelope' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ConstEnvelope: {
        type: 'object',
        required: ['kind', 'version', 'enabled'],
        properties: {
          kind: { const: 'audit' },
          version: { const: 1 },
          ratio: { const: 2.5 },
          enabled: { const: true },
          missing: { const: null },
        },
      },
    },
  },
} as unknown as ApiSpec;

const escapedJsonPointerRefSpec = {
  openapi: '3.1.0',
  info: { title: 'Escaped JSON Pointer API', version: '1.0.0' },
  paths: {
    '/audit': {
      get: {
        summary: 'Get escaped ref envelope',
        operationId: 'getEscapedRefEnvelope',
        tags: ['Escaped Ref'],
        responses: {
          '200': {
            description: 'Escaped ref envelope',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EscapedEnvelope' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      'Audit/Event': {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      'Audit~Meta': {
        type: 'object',
        properties: {
          traceId: { type: 'string' },
        },
      },
      EscapedEnvelope: {
        type: 'object',
        required: ['event'],
        properties: {
          event: { $ref: '#/components/schemas/Audit~1Event' },
          meta: { $ref: '#/components/schemas/Audit~0Meta' },
        },
      },
    },
  },
} as unknown as ApiSpec;

const escapedOpenApiComponentRefSpec = {
  openapi: '3.1.0',
  info: { title: 'Escaped OpenAPI Component Ref API', version: '1.0.0' },
  paths: {
    '/audit/{eventId}': {
      get: {
        summary: 'Get audit event through escaped OpenAPI component refs',
        operationId: 'getAuditEventWithEscapedRefs',
        tags: ['Audit'],
        parameters: [
          { name: 'eventId', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/Audit~1Filter' },
          { $ref: '#/components/parameters/Trace%20Id' },
        ],
        responses: {
          '200': { $ref: '#/components/responses/Audit~1EventResponse' },
        },
      },
    },
  },
  components: {
    parameters: {
      'Audit/Filter': {
        name: 'filter',
        in: 'query',
        schema: { type: 'string' },
      },
      'Trace Id': {
        name: 'X-Trace-Id',
        in: 'header',
        schema: { type: 'string' },
      },
    },
    responses: {
      'Audit/EventResponse': {
        description: 'Audit event',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AuditEvent' },
          },
        },
      },
    },
    schemas: {
      AuditEvent: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    },
  },
} as unknown as ApiSpec;

const pythonKeywordPropertySpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Python Keyword Property API', version: '1.0.0' },
  paths: {
    '/keyword-model': {
      get: {
        summary: 'Get keyword model',
        operationId: 'getKeywordModel',
        tags: ['Keyword Model'],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {
      KeywordModel: {
        type: 'object',
        properties: {
          async: { type: 'boolean' },
          await: { type: 'string' },
        },
      },
    },
  },
};

const reservedIdentifierSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Reserved Identifier API', version: '1.0.0' },
  paths: {
    '/keyword-model': {
      get: {
        summary: 'Get keyword model',
        operationId: 'class',
        tags: ['Keyword Model'],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/KeywordModel' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      KeywordModel: {
        type: 'object',
        properties: {
          class: { type: 'string' },
          return: { type: 'boolean' },
        },
      },
    },
  },
};

const pathParameterIdentifierSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Path Parameter Identifier API', version: '1.0.0' },
  paths: {
    '/keyword-model/{class}/{user-id}/{headers}': {
      get: {
        summary: 'Get keyword model by path',
        operationId: 'getKeywordModelByPath',
        tags: ['Keyword Model'],
        parameters: [
          { name: 'class', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'user-id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'headers', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'X-Trace-Id', in: 'header', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/KeywordModel' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      KeywordModel: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    },
  },
};

const headerCookieParameterSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Header Cookie Parameter API', version: '1.0.0' },
  paths: {
    '/resources': {
      get: {
        summary: 'List resources',
        operationId: 'listResources',
        tags: ['Resource'],
        parameters: [
          { name: 'X-Trace-Id', in: 'header', required: true, schema: { type: 'string' } },
          { name: 'session_id', in: 'cookie', required: false, schema: { type: 'string' } },
        ],
        responses: { '204': { description: 'No content' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const scalarHeaderCookieParameterSpec: ApiSpec = {
  openapi: '3.2.0',
  info: { title: 'Scalar Header Cookie Parameter API', version: '1.0.0' },
  paths: {
    '/resources': {
      get: {
        summary: 'List resources with scalar transport parameters',
        operationId: 'listResources',
        tags: ['Resource'],
        parameters: [
          { name: 'X-Retry-Count', in: 'header', required: true, schema: { type: 'integer' } },
          { name: 'debug_mode', in: 'cookie', required: false, schema: { type: 'boolean' } },
        ],
        responses: { '204': { description: 'No content' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const advancedParameterSerializationSpec: ApiSpec = {
  openapi: '3.1.1',
  info: { title: 'Advanced Parameter Serialization API', version: '1.0.0' },
  paths: {
    '/resources/{tenant}/{labels}/{matrix}': {
      get: {
        summary: 'Read resource with OpenAPI transport serialization',
        operationId: 'readSerializedResource',
        tags: ['Resource'],
        parameters: [
          {
            name: 'tenant',
            in: 'path',
            required: true,
            style: 'simple',
            explode: false,
            schema: { type: 'string' },
          },
          {
            name: 'labels',
            in: 'path',
            required: true,
            style: 'label',
            explode: true,
            schema: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
          {
            name: 'matrix',
            in: 'path',
            required: true,
            style: 'matrix',
            explode: false,
            schema: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          {
            name: 'X-Trace-Parts',
            in: 'header',
            required: true,
            style: 'simple',
            explode: true,
            schema: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
          {
            name: 'session',
            in: 'cookie',
            required: false,
            style: 'form',
            explode: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    mode: { type: 'string' },
                  },
                },
              },
            },
          },
        ],
        responses: { '204': { description: 'No content' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const eventStreamResponseSpec: ApiSpec = {
  openapi: '3.1.1',
  info: { title: 'Streaming Chat API', version: '1.0.0' },
  paths: {
    '/chat/completions': {
      post: {
        summary: 'Create streaming chat completion',
        operationId: 'createChatCompletion',
        tags: ['Chat'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateChatCompletionRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Streaming chunks',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatCompletionObject' },
              },
              'text/event-stream; charset=utf-8': {
                schema: { $ref: '#/components/schemas/ChatCompletionChunk' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      CreateChatCompletionRequest: {
        type: 'object',
        required: ['model', 'messages'],
        properties: {
          model: { type: 'string' },
          stream: { type: 'boolean' },
          messages: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
      },
      ChatCompletionObject: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          object: { type: 'string' },
        },
      },
      ChatCompletionChunk: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          object: { type: 'string' },
          choices: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer' },
                delta: {
                  type: 'object',
                  additionalProperties: true,
                },
                finish_reason: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
  },
};

const duplicateOperationIdSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Duplicate Operation Id API', version: '1.0.0' },
  paths: {
    '/tenant': {
      post: {
        summary: 'Create tenant',
        operationId: 'create28',
        tags: ['Tenant'],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/tenant/{id}': {
      put: {
        summary: 'Update tenant',
        operationId: 'update28',
        tags: ['Tenant'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/tenant/page': {
      get: {
        summary: 'List tenants',
        operationId: 'listByPage28',
        tags: ['Tenant'],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/tenant/raw': {
      post: {
        summary: 'Create tenant raw',
        operationId: 'create',
        tags: ['Tenant'],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/project': {
      post: {
        summary: 'Create project',
        operationId: 'create28',
        tags: ['Project'],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const postBodyAndQuerySpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Post Body And Query API', version: '1.0.0' },
  paths: {
    '/tenant/list': {
      post: {
        summary: 'Get tenants by page',
        operationId: 'listByPage',
        tags: ['Tenant'],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer' } },
          { name: 'size', in: 'query', required: false, schema: { type: 'integer' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PlusTenantQueryListForm' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PlusApiResultPagePlusTenantVO' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      PlusTenantQueryListForm: {
        type: 'object',
        properties: {
          keyword: { type: 'string' },
        },
      },
      PlusApiResultPagePlusTenantVO: {
        type: 'object',
        properties: {
          code: { type: 'string' },
        },
      },
    },
  },
};

const arrayBodySpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Array Body API', version: '1.0.0' },
  paths: {
    '/tenant/batch': {
      post: {
        summary: 'Batch create tenants',
        operationId: 'batchCreate',
        tags: ['Tenant'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { type: 'string' },
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
                  properties: {
                    code: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const namedNonObjectComponentSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Named Non Object Component API', version: '1.0.0' },
  paths: {
    '/alias/scalar': {
      post: {
        summary: 'Send scalar alias',
        operationId: 'sendScalar',
        tags: ['Alias'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StringAlias' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Scalar alias response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StringAlias' },
              },
            },
          },
        },
      },
    },
    '/alias/array': {
      post: {
        summary: 'Send array alias',
        operationId: 'sendArray',
        tags: ['Alias'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StringList' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Array alias response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StringList' },
              },
            },
          },
        },
      },
    },
    '/alias/map': {
      post: {
        summary: 'Send map alias',
        operationId: 'sendMap',
        tags: ['Alias'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StringMap' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Map alias response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StringMap' },
              },
            },
          },
        },
      },
    },
    '/alias/user': {
      post: {
        summary: 'Send user object',
        operationId: 'sendUser',
        tags: ['Alias'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/User' },
            },
          },
        },
        responses: {
          '200': {
            description: 'User response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          nickname: { $ref: '#/components/schemas/StringAlias' },
          tags: { $ref: '#/components/schemas/StringList' },
          metadata: { $ref: '#/components/schemas/StringMap' },
        },
      },
      StringAlias: {
        type: 'string',
      },
      StringList: {
        type: 'array',
        items: { type: 'string' },
      },
      StringMap: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
    },
  },
};

const composedQueryParameterSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Composed Query Parameter API', version: '1.0.0' },
  paths: {
    '/tenant/list': {
      get: {
        summary: 'List tenants',
        operationId: 'listByPage',
        tags: ['Tenant'],
        parameters: [
          {
            name: 'page',
            in: 'query',
            required: false,
            schema: {
              allOf: [
                { type: 'integer' },
              ],
            },
          },
        ],
        responses: {
          '200': {
            description: 'Success',
          },
        },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const composedHeaderParameterSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Composed Header Parameter API', version: '1.0.0' },
  paths: {
    '/tenant/list': {
      get: {
        summary: 'List tenants',
        operationId: 'listByPage',
        tags: ['Tenant'],
        parameters: [
          {
            name: 'X-Trace-Id',
            in: 'header',
            required: false,
            schema: {
              allOf: [
                { type: 'string', enum: ['trace-token'] },
              ],
            },
          },
        ],
        responses: {
          '200': {
            description: 'Success',
          },
        },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const queryHeaderParameterSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Query Header Parameter API', version: '1.0.0' },
  paths: {
    '/resources': {
      get: {
        summary: 'List resources',
        operationId: 'listResources',
        tags: ['Resource'],
        parameters: [
          {
            name: 'page',
            in: 'query',
            required: true,
            schema: { type: 'integer' },
          },
          {
            name: 'X-Trace-Id',
            in: 'header',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const composedReferencedQueryParameterSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Composed Referenced Query Parameter API', version: '1.0.0' },
  paths: {
    '/tenant/list': {
      get: {
        summary: 'List tenants',
        operationId: 'listByPage',
        tags: ['Tenant'],
        parameters: [
          {
            name: 'page',
            in: 'query',
            required: false,
            schema: {
              allOf: [
                { $ref: '#/components/schemas/PageParam' },
              ],
            },
          },
        ],
        responses: {
          '200': {
            description: 'Success',
          },
        },
      },
    },
  },
  components: {
    schemas: {
      PageParam: {
        type: 'integer',
      },
    },
  },
};

const composedReferencedHeaderParameterSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Composed Referenced Header Parameter API', version: '1.0.0' },
  paths: {
    '/tenant/list': {
      get: {
        summary: 'List tenants',
        operationId: 'listByPage',
        tags: ['Tenant'],
        parameters: [
          {
            name: 'X-Trace-Id',
            in: 'header',
            required: false,
            schema: {
              allOf: [
                { $ref: '#/components/schemas/TraceHeader' },
              ],
            },
          },
        ],
        responses: {
          '200': {
            description: 'Success',
          },
        },
      },
    },
  },
  components: {
    schemas: {
      TraceHeader: {
        type: 'string',
        enum: ['trace-token'],
      },
    },
  },
};

const managementTagSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Management Tag API', version: '1.0.0' },
  paths: {
    '/tenant': {
      get: {
        summary: 'List tenants',
        operationId: 'listByPage28',
        tags: ['Tenant Management'],
        responses: { '200': { description: 'Success' } },
      },
      put: {
        summary: 'Update tenant',
        operationId: 'update28',
        tags: ['Tenant Management'],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const scopedOperationIdSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Scoped OperationId API', version: '1.0.0' },
  paths: {
    '/tenant': {
      put: {
        summary: 'Update tenant',
        operationId: 'tenant__update',
        tags: ['Tenant Management'],
        responses: { '200': { description: 'Success' } },
      },
      post: {
        summary: 'Create tenant',
        operationId: 'tenant__create',
        tags: ['Tenant Management'],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const prefixedOperationIdSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Prefixed OperationId API', version: '1.0.0' },
  paths: {
    '/tenant': {
      put: {
        summary: 'Update tenant',
        operationId: 'tenantUpdate',
        tags: ['Tenant Management'],
        responses: { '200': { description: 'Success' } },
      },
      post: {
        summary: 'Create tenant',
        operationId: 'tenantCreate',
        tags: ['Tenant Management'],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const suffixVerbOperationIdSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Suffix Verb OperationId API', version: '1.0.0' },
  paths: {
    '/skills/{skillId}/enable': {
      post: {
        summary: 'Enable skill',
        operationId: 'enableSkill',
        tags: ['Skill'],
        parameters: [{ name: 'skillId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/skills/{skillId}/disable': {
      post: {
        summary: 'Disable skill',
        operationId: 'disableSkill',
        tags: ['Skill'],
        parameters: [{ name: 'skillId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/skills/{skillId}/review/approve': {
      post: {
        summary: 'Approve skill',
        operationId: 'approveSkill',
        tags: ['Skill'],
        parameters: [{ name: 'skillId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/skills/{skillId}/review/reject': {
      post: {
        summary: 'Reject skill',
        operationId: 'rejectSkill',
        tags: ['Skill'],
        parameters: [{ name: 'skillId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/apps/{appId}/publish': {
      post: {
        summary: 'Publish app',
        operationId: 'publishApp',
        tags: ['App'],
        parameters: [{ name: 'appId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/apps/{appId}/offline': {
      post: {
        summary: 'Offline app',
        operationId: 'offlineApp',
        tags: ['App'],
        parameters: [{ name: 'appId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/apps/{appId}': {
      get: {
        summary: 'Fetch app',
        operationId: 'fetchApp',
        tags: ['App'],
        parameters: [{ name: 'appId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const nonAsciiTagSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Non-ASCII Tag API', version: '1.0.0' },
  paths: {
    '/app/v3/api/workspaces': {
      get: {
        summary: 'List workspaces',
        operationId: 'listWorkspaces',
        tags: ['工作空间管理'],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/app/v3/api/projects': {
      get: {
        summary: 'List projects',
        operationId: 'listProjects',
        tags: ['项目管理'],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const equivalentTagSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Equivalent Tag API', version: '1.0.0' },
  paths: {
    '/app/v3/api/drive/items': {
      get: {
        summary: 'List drive items',
        operationId: 'listDriveItems',
        tags: ['drive'],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/app/v3/api/drive/items/upload': {
      post: {
        summary: 'Upload drive item',
        operationId: 'uploadDriveItem',
        tags: ['Drive'],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/app/v3/api/voice-speakers': {
      get: {
        summary: 'List voice speakers',
        operationId: 'listVoiceSpeakers',
        tags: ['voice_speaker'],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/app/v3/api/voice-speakers/market': {
      get: {
        summary: 'List market voices',
        operationId: 'listMarketVoices',
        tags: ['VoiceSpeaker'],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const appDomainGroupingSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'App Domain API', version: '1.0.0' },
  paths: {
    '/app/v3/api/app/manage': {
      post: {
        summary: 'Create app',
        operationId: 'createApp',
        tags: ['App Manage'],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/app/v3/api/app/update/check': {
      get: {
        summary: 'Check update',
        operationId: 'checkUpdate',
        tags: ['App Update'],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const backendDomainGroupingSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Backend Domain API', version: '1.0.0' },
  paths: {
    '/backend/v3/api/tenant/user/page': {
      get: {
        summary: 'List tenant users',
        operationId: 'listTenantUsers',
        tags: ['Tenant User Management'],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/backend/v3/api/tenant/member/{id}': {
      get: {
        summary: 'Get tenant member',
        operationId: 'getTenantMember',
        tags: ['Tenant Member Management'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const aiDomainGroupingSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'AI Domain API', version: '1.0.0' },
  paths: {
    '/ai/v3/chat/completions': {
      post: {
        summary: 'Create chat completion',
        operationId: 'createChatCompletion',
        tags: ['Chat'],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/ai/v3/chat/completions/{completion_id}': {
      get: {
        summary: 'Get chat completion',
        operationId: 'getChatCompletion',
        tags: ['Chat'],
        parameters: [{ name: 'completion_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/ai/v3/chat/completions/{completion_id}/messages': {
      get: {
        summary: 'List chat completion messages',
        operationId: 'listChatCompletionMessages',
        tags: ['Chat'],
        parameters: [{ name: 'completion_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const aiOpenAiResourceNamingSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'AI OpenAI Resource Naming API', version: '1.0.0' },
  paths: {
    ...aiDomainGroupingSpec.paths,
    '/ai/v3/files': {
      get: {
        summary: 'List files',
        operationId: 'listFiles',
        tags: ['File'],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/ai/v3/batches': {
      get: {
        summary: 'List batches',
        operationId: 'listBatches',
        tags: ['Batch'],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/ai/v3/responses': {
      post: {
        summary: 'Create response',
        operationId: 'createResponse',
        tags: ['Response'],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const aiAliasDedupSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'AI Alias Dedup API', version: '1.0.0' },
  paths: {
    '/ai/v3/batches': {
      get: {
        summary: 'List batches',
        tags: ['Batches'],
        responses: { '200': { description: 'Success' } },
      },
      post: {
        summary: 'Create batch',
        tags: ['Batches'],
        responses: { '200': { description: 'Success' } },
      },
    },
    '/v1/batches': {
      get: {
        summary: 'List batches',
        tags: ['Batches'],
        responses: { '200': { description: 'Success' } },
      },
      post: {
        summary: 'Create batch',
        tags: ['Batches'],
        responses: { '200': { description: 'Success' } },
      },
    },
  },
  components: {
    schemas: {},
  },
};
const inlineIoSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Inline IO API', version: '1.0.0' },
  paths: {
    '/auth/password-reset': {
      post: {
        summary: 'Request password reset',
        operationId: 'requestPasswordReset',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                },
                required: ['email'],
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
                  properties: {
                    success: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {},
  },
};

describe('SDK Generators', () => {
  const generators = [
    { name: 'TypeScript', Generator: TypeScriptGenerator },
    { name: 'Dart', Generator: DartGenerator },
    { name: 'Python', Generator: PythonGenerator },
    { name: 'Go', Generator: GoGenerator },
    { name: 'Java', Generator: JavaGenerator },
    { name: 'Swift', Generator: SwiftGenerator },
    { name: 'Kotlin', Generator: KotlinGenerator },
    { name: 'Flutter', Generator: FlutterGenerator },
    { name: 'C#', Generator: CSharpGenerator },
    { name: 'PHP', Generator: PhpGenerator },
    { name: 'Ruby', Generator: RubyGenerator },
  ];

  generators.forEach(({ name, Generator }) => {
    describe(`${name} Generator`, () => {
      it('should instantiate correctly', () => {
        const generator = new Generator();
        expect(generator).toBeDefined();
        expect(generator.language).toBe(name.toLowerCase() === 'c#' ? 'csharp' : name.toLowerCase());
      });

      it('should have all required sub-generators', () => {
        const generator = new Generator();
        expect(generator.generateModels).toBeDefined();
        expect(generator.generateApis).toBeDefined();
        expect(generator.generateClient).toBeDefined();
        expect(generator.generateBuildConfig).toBeDefined();
        expect(generator.generateReadme).toBeDefined();
      });

      it('should generate complete SDK', async () => {
        const generator = new Generator();
        const result = await generator.generate(baseConfig, mockSpec);
        
        expect(result.files.length).toBeGreaterThan(0);
        expect(result.errors.length).toBe(0);
        expect(result.stats.models).toBe(1);
        expect(result.stats.apis).toBe(1);
      });

      it('should generate models', async () => {
        const generator = new Generator();
        const result = await generator.generate(baseConfig, mockSpec);
        const modelFiles = result.files.filter(f => 
          f.path.includes('types') || 
          f.path.includes('model') || 
          f.path.includes('Model') ||
          f.path.includes('models') ||
          f.path.includes('.java') ||
          f.path.includes('.kt') ||
          f.path.includes('.cs') ||
          f.path.includes('.swift') ||
          f.path.includes('.go')
        );
        expect(modelFiles.length).toBeGreaterThan(0);
      });

      it('should generate APIs', async () => {
        const generator = new Generator();
        const result = await generator.generate(baseConfig, mockSpec);
        const apiFiles = result.files.filter(f => 
          f.path.includes('api') || 
          f.path.includes('Api')
        );
        expect(apiFiles.length).toBeGreaterThan(0);
      });

      it('should generate client', async () => {
        const generator = new Generator();
        const result = await generator.generate(baseConfig, mockSpec);
        const clientFiles = result.files.filter(f => 
          f.path.includes('client') || 
          f.path.includes('Client') ||
          f.path.includes('http') ||
          f.path.includes('Http')
        );
        expect(clientFiles.length).toBeGreaterThan(0);
      });

      it('should generate build config', async () => {
        const generator = new Generator();
        const result = await generator.generate(baseConfig, mockSpec);
        const configFiles = result.files.filter(f => 
          f.path.includes('package.json') ||
          f.path.includes('pom.xml') ||
          f.path.includes('build.gradle') ||
          f.path.includes('Package.swift') ||
          f.path.includes('pubspec.yaml') ||
          f.path.includes('go.mod') ||
          f.path.includes('.csproj') ||
          f.path.includes('setup.py') ||
          f.path.includes('pyproject.toml') ||
          f.path.includes('composer.json') ||
          f.path.includes('Gemfile') ||
          f.path.includes('.gemspec')
        );
        expect(configFiles.length).toBeGreaterThan(0);
      });

      it('should generate README', async () => {
        const generator = new Generator();
        const result = await generator.generate(baseConfig, mockSpec);
        const readmeFiles = result.files.filter(f => 
          f.path.includes('README')
        );
        expect(readmeFiles.length).toBeGreaterThan(0);
        expect(readmeFiles[0].content).toContain('TestSDK');
        expect(readmeFiles[0].content).toContain('## Publishing');
      });

      it('should generate publish bin scripts', async () => {
        const generator = new Generator();
        const result = await generator.generate(baseConfig, mockSpec);
        const paths = result.files.map((file) => file.path);
        expect(paths).toContain('bin/publish-core.mjs');
        expect(paths).toContain('bin/publish.sh');
        expect(paths).toContain('bin/publish.ps1');

        if (name === 'TypeScript') {
          expect(paths).toContain('bin/sdk-gen.bat');
          expect(paths).toContain('bin/sdk-gen.sh');
        }
      });
    });
  });
});

describe('OpenAPI Security And Compliance', () => {
  const generators = [
    TypeScriptGenerator,
    DartGenerator,
    PythonGenerator,
    GoGenerator,
    JavaGenerator,
    SwiftGenerator,
    KotlinGenerator,
    FlutterGenerator,
    CSharpGenerator,
    PhpGenerator,
    RubyGenerator,
  ];

  it('should map apiKey security scheme header into generated clients', async () => {
    for (const Generator of generators) {
      const generator = new Generator();
      const result = await generator.generate(baseConfig, securitySpec);
      const joined = result.files.map((f) => f.content).join('\n');
      expect(joined).toContain('X-API-Key');
      expect(joined.includes('Access-Token') || joined.includes('setAccessToken')).toBe(true);
    }
  });

  it('should generate compilable TypeScript API key constants for custom auth headers', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, securitySpec);
    const httpClientFile = result.files.find((f) => f.path === 'src/http/client.ts');

    expect(result.errors).toEqual([]);
    expect(httpClientFile).toBeDefined();
    expect(httpClientFile!.content).toContain("private static readonly API_KEY_HEADER: string = 'X-API-Key';");
  });

  it('should use Sdkwork-Access-Token as the TypeScript access token header outside strict profile', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, securitySpec);
    const httpClientFile = result.files.find((f) => f.path === 'src/http/client.ts');
    const readmeFile = result.files.find((f) => f.path === 'README.md');

    expect(result.errors).toEqual([]);
    expect(httpClientFile).toBeDefined();
    expect(httpClientFile!.content).toContain("private static readonly ACCESS_TOKEN_HEADER: string = 'Sdkwork-Access-Token';");
    expect(httpClientFile!.content).not.toMatch(/(?<!Sdkwork-)Access-Token/);
    expect(readmeFile).toBeDefined();
    expect(readmeFile!.content).toContain('// Sdkwork-Access-Token: <accessToken>');
    expect(readmeFile!.content).not.toContain('// Access-Token: <accessToken>');
  });

  it('should preserve swift bearer interpolation syntax', async () => {
    const generator = new SwiftGenerator();
    const result = await generator.generate(baseConfig, securitySpec);
    const httpClientFile = result.files.find((f) => f.path === 'Sources/HTTP/HttpClient.swift');

    expect(httpClientFile).toBeDefined();
    expect(httpClientFile!.content).toContain('Bearer \\(apiKey)');
    expect(httpClientFile!.content).toContain('Bearer \\(token)');
  });

  it('should sanitize typescript api filenames for spaced tags', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, modelRefSpec);
    expect(result.files.some((f) => f.path === 'src/api/ai-agent-management.ts')).toBe(true);
  });

  it('should generate typescript model imports for referenced schemas', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, modelRefSpec);
    const modelAFile = result.files.find((f) => f.path === 'src/types/model-a.ts');

    expect(modelAFile).toBeDefined();
    expect(modelAFile!.content).toContain("import type { ModelB } from './model-b';");
    expect(modelAFile!.content).toContain('modelB?: ModelB;');
  });

  it('should import referenced TypeScript path parameter schemas', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, {
      openapi: '3.1.0',
      info: { title: 'Path Ref API', version: '1.0.0' },
      paths: {
        '/roles/{id}': {
          get: {
            summary: 'Get role',
            operationId: 'role__getById',
            tags: ['Role'],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { $ref: '#/components/schemas/UserRoleKey' },
              },
            ],
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/RoleVO' },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          UserRoleKey: {
            type: 'object',
            properties: {
              userId: { type: 'integer', format: 'int64' },
              roleId: { type: 'integer', format: 'int64' },
            },
          },
          RoleVO: {
            type: 'object',
            properties: {
              id: { type: 'integer', format: 'int64' },
            },
          },
        },
      },
    });
    const apiFile = result.files.find((file) => file.path === 'src/api/role.ts');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('import type { RoleVO, UserRoleKey } from');
    expect(apiFile!.content).toContain('async getById(id: UserRoleKey): Promise<RoleVO>');
  });

  it('should emit deferred annotations for python model references', async () => {
    const generator = new PythonGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'python' }, modelRefSpec);
    const modelAFile = result.files.find((f) => f.path.endsWith('/models/model_a.py'));

    expect(modelAFile).toBeDefined();
    expect(modelAFile!.content).toContain('from __future__ import annotations');
    expect(modelAFile!.content).toContain('from typing import TYPE_CHECKING');
    expect(modelAFile!.content).toContain('if TYPE_CHECKING:');
    expect(modelAFile!.content).toContain('from .model_b import ModelB');
    expect(modelAFile!.content).toContain('model_b: Optional[ModelB] = None');
  });

  it('should place required python dataclass fields before optional defaults', async () => {
    const generator = new PythonGenerator();
    const result = await generator.generate(
      { ...baseConfig, language: 'python' },
      pythonDataclassOrderingSpec
    );
    const orderedModelFile = result.files.find((f) => f.path.endsWith('/models/ordered_model.py'));

    expect(orderedModelFile).toBeDefined();
    const requiredIndex = orderedModelFile!.content.indexOf('required_id: str');
    const optionalIndex = orderedModelFile!.content.indexOf('optional_name: Optional[str] = None');
    expect(requiredIndex).toBeGreaterThanOrEqual(0);
    expect(optionalIndex).toBeGreaterThanOrEqual(0);
    expect(requiredIndex).toBeLessThan(optionalIndex);
  });

  it('should emit optional python annotations for nullable and optional fields', async () => {
    const generator = new PythonGenerator();
    const result = await generator.generate(
      { ...baseConfig, language: 'python' },
      pythonNullableSpec
    );
    const nullableModelFile = result.files.find((f) => f.path.endsWith('/models/nullable_model.py'));

    expect(nullableModelFile).toBeDefined();
    expect(nullableModelFile!.content).toContain('id: str');
    expect(nullableModelFile!.content).toContain('display_name: Optional[str] = None');
    expect(nullableModelFile!.content).toContain('optional_count: Optional[int] = None');
    expect(nullableModelFile!.content).not.toContain('display_name: str = None');
  });

  it('should generate stable model types for OpenAPI 3.2 JSON Schema null and composed branches', async () => {
    const cases = [
      {
        language: 'typescript' as const,
        generator: new TypeScriptGenerator(),
        filePath: 'src/types/schema-model.ts',
        expected: [
          'nullableName?: string | null;',
          'nullableCount?: number | null;',
          'nullableFlag?: boolean | null;',
          'aliasedUser?: UserRef;',
          'metadata?: Record<string, string>;',
          'labels?: (string | null)[] | null;',
        ],
        forbidden: ['unknown | string', 'unknown | number', 'null |'],
      },
      {
        language: 'python' as const,
        generator: new PythonGenerator(),
        filePath: 'sdkwork_backend_sdk/models/schema_model.py',
        expected: [
          'nullable_name: Optional[str] = None',
          'nullable_count: Optional[int] = None',
          'nullable_flag: Optional[bool] = None',
          'aliased_user: Optional[UserRef] = None',
          'metadata: Optional[Dict[str, str]] = None',
          'labels: Optional[List[str]] = None',
        ],
        forbidden: ['Any |', 'Null', 'unknown'],
      },
      {
        language: 'go' as const,
        generator: new GoGenerator(),
        filePath: 'types/schema_model.go',
        expected: [
          'NullableName string `json:"nullableName"`',
          'NullableCount int `json:"nullableCount"`',
          'NullableFlag bool `json:"nullableFlag"`',
          'AliasedUser UserRef `json:"aliasedUser"`',
          'Metadata map[string]string `json:"metadata"`',
          'Labels []string `json:"labels"`',
        ],
        forbidden: [' Null `json:', ' null `json:', 'interface{} `json:"nullable'],
      },
      {
        language: 'java' as const,
        generator: new JavaGenerator(),
        filePath: 'src/main/java/com/sdkwork/backend/model/SchemaModel.java',
        expected: [
          'private String nullableName;',
          'private Integer nullableCount;',
          'private Boolean nullableFlag;',
          'private UserRef aliasedUser;',
          'private Map<String, String> metadata;',
          'private List<String> labels;',
        ],
        forbidden: ['private Null ', 'private null ', 'Object nullableCount'],
      },
      {
        language: 'kotlin' as const,
        generator: new KotlinGenerator(),
        filePath: 'src/main/kotlin/com/sdkwork/backend/SchemaModel.kt',
        expected: [
          'val nullableName: String? = null',
          'val nullableCount: Int? = null',
          'val nullableFlag: Boolean? = null',
          'val aliasedUser: UserRef? = null',
          'val metadata: Map<String, String>? = null',
          'val labels: List<String>? = null',
        ],
        forbidden: ['val nullableCount: Any? = null'],
      },
      {
        language: 'csharp' as const,
        generator: new CSharpGenerator(),
        filePath: 'Models/SchemaModel.cs',
        expected: [
          'public string? NullableName { get; set; }',
          'public int? NullableCount { get; set; }',
          'public bool? NullableFlag { get; set; }',
          'public UserRef? AliasedUser { get; set; }',
          'public Dictionary<string, string>? Metadata { get; set; }',
          'public List<string>? Labels { get; set; }',
        ],
        forbidden: ['public Null?', 'object? NullableCount'],
      },
      {
        language: 'rust' as const,
        generator: new RustGenerator(),
        filePath: 'src/models/schema_model.rs',
        expected: [
          'pub nullable_name: Option<String>,',
          'pub nullable_count: Option<i64>,',
          'pub nullable_flag: Option<bool>,',
          'pub aliased_user: Option<UserRef>,',
          'pub metadata: Option<std::collections::HashMap<String, String>>,',
          'pub labels: Option<Vec<String>>,',
        ],
        forbidden: ['Option<Null>', 'serde_json::Value>,'],
      },
    ];

    for (const testCase of cases) {
      const result = await testCase.generator.generate(
        { ...baseConfig, language: testCase.language },
        openApi32JsonSchemaSpec
      );
      const modelFile = getGeneratedFile(result.files, testCase.filePath);

      expect(result.errors).toEqual([]);
      for (const expected of testCase.expected) {
        expect(modelFile.content).toContain(expected);
      }
      for (const forbidden of testCase.forbidden) {
        expect(modelFile.content).not.toContain(forbidden);
      }
    }
  });

  it('should merge OpenAPI 3.2 allOf object model branches across SDK languages', async () => {
    const cases = [
      {
        language: 'typescript' as const,
        generator: new TypeScriptGenerator(),
        filePath: 'src/types/composed-user.ts',
        expected: [
          'id: string;',
          'createdAt?: string;',
          'email: string;',
          'displayName?: string | null;',
          'roles?: string[];',
        ],
        forbidden: ['export type ComposedUser =', 'BaseEntity & UserTraits', 'unknown'],
      },
      {
        language: 'python' as const,
        generator: new PythonGenerator(),
        filePath: 'sdkwork_backend_sdk/models/composed_user.py',
        expected: [
          'id: str',
          'email: str',
          'created_at: Optional[str] = None',
          'display_name: Optional[str] = None',
          'roles: Optional[List[str]] = None',
        ],
        forbidden: ['class ComposedUser:\n    pass'],
      },
      {
        language: 'go' as const,
        generator: new GoGenerator(),
        filePath: 'types/composed_user.go',
        expected: [
          'Id string `json:"id"`',
          'CreatedAt string `json:"createdAt"`',
          'Email string `json:"email"`',
          'DisplayName string `json:"displayName"`',
          'Roles []string `json:"roles"`',
        ],
        forbidden: ['type ComposedUser interface{}', 'BaseEntity'],
      },
      {
        language: 'java' as const,
        generator: new JavaGenerator(),
        filePath: 'src/main/java/com/sdkwork/backend/model/ComposedUser.java',
        expected: [
          'private String id;',
          'private String createdAt;',
          'private String email;',
          'private String displayName;',
          'private List<String> roles;',
        ],
        forbidden: ['private Object', 'BaseEntity'],
      },
      {
        language: 'kotlin' as const,
        generator: new KotlinGenerator(),
        filePath: 'src/main/kotlin/com/sdkwork/backend/ComposedUser.kt',
        expected: [
          'val id: String? = null',
          'val createdAt: String? = null',
          'val email: String? = null',
          'val displayName: String? = null',
          'val roles: List<String>? = null',
        ],
        forbidden: ['val baseEntity', 'Any?'],
      },
      {
        language: 'csharp' as const,
        generator: new CSharpGenerator(),
        filePath: 'Models/ComposedUser.cs',
        expected: [
          'public string? Id { get; set; }',
          'public string? CreatedAt { get; set; }',
          'public string? Email { get; set; }',
          'public string? DisplayName { get; set; }',
          'public List<string>? Roles { get; set; }',
        ],
        forbidden: ['public object?', 'BaseEntity'],
      },
      {
        language: 'swift' as const,
        generator: new SwiftGenerator(),
        filePath: 'Sources/Models.swift',
        expected: [
          'public struct ComposedUser: Codable',
          'public let id: String?',
          'public let createdAt: String?',
          'public let email: String?',
          'public let displayName: String?',
          'public let roles: [String]?',
        ],
        forbidden: ['public struct ComposedUser: BaseEntity'],
      },
      {
        language: 'dart' as const,
        generator: new DartGenerator(),
        filePath: 'lib/src/models.dart',
        expected: [
          'class ComposedUser',
          'final String? id;',
          'final String? createdAt;',
          'final String? email;',
          'final String? displayName;',
          'final List<String>? roles;',
        ],
        forbidden: ['class ComposedUser extends BaseEntity'],
      },
      {
        language: 'flutter' as const,
        generator: new FlutterGenerator(),
        filePath: 'lib/src/models.dart',
        expected: [
          'class ComposedUser',
          'final String? id;',
          'final String? createdAt;',
          'final String? email;',
          'final String? displayName;',
          'final List<String>? roles;',
        ],
        forbidden: ['class ComposedUser extends BaseEntity'],
      },
      {
        language: 'rust' as const,
        generator: new RustGenerator(),
        filePath: 'src/models/composed_user.rs',
        expected: [
          'pub id: String,',
          'pub created_at: Option<String>,',
          'pub email: String,',
          'pub display_name: Option<String>,',
          'pub roles: Option<Vec<String>>,',
        ],
        forbidden: ['additional_properties', 'BaseEntity'],
      },
      {
        language: 'php' as const,
        generator: new PhpGenerator(),
        filePath: 'src/Models/ComposedUser.php',
        expected: [
          'public ?string $id = null;',
          'public ?string $createdAt = null;',
          'public ?string $email = null;',
          'public ?string $displayName = null;',
          'public array $roles = [];',
        ],
        forbidden: ['OpenAPI schema defines no explicit properties', 'BaseEntity'],
      },
      {
        language: 'ruby' as const,
        generator: new RubyGenerator(),
        filePath: 'lib/sdkwork/backend_sdk/models/composed_user.rb',
        expected: [
          'attr_accessor :id, :created_at, :email, :display_name, :roles',
          "@id = attributes['id']",
          "@created_at = attributes['createdAt']",
          "@email = attributes['email']",
          "@display_name = attributes['displayName']",
          "@roles = attributes['roles'].is_a?(Array) ? attributes['roles'].map { |item| item } : []",
        ],
        forbidden: ['No properties to hydrate', 'BaseEntity'],
      },
    ];

    for (const testCase of cases) {
      const result = await testCase.generator.generate(
        { ...baseConfig, language: testCase.language },
        openApi32AllOfObjectSpec
      );
      const modelFile = getGeneratedFile(result.files, testCase.filePath);

      expect(result.errors).toEqual([]);
      for (const expected of testCase.expected) {
        expect(modelFile.content).toContain(expected);
      }
      for (const forbidden of testCase.forbidden) {
        expect(modelFile.content).not.toContain(forbidden);
      }
    }
  });

  it('should generate array response types from OpenAPI 3.2 media type itemSchema', async () => {
    const cases = [
      {
        language: 'typescript' as const,
        generator: new TypeScriptGenerator(),
        filePath: 'src/api/event.ts',
        expected: [
          'import type { Event',
          'async streamEvents(): Promise<Event[]>',
          'this.client.get<Event[]>',
        ],
        forbidden: ['Promise<unknown>', 'Promise<void>'],
      },
      {
        language: 'python' as const,
        generator: new PythonGenerator(),
        filePath: 'sdkwork_backend_sdk/api/event.py',
        expected: [
          'from ..models import Event',
          'def stream_events(self) -> List[Event]:',
        ],
        forbidden: ['-> Any', '-> None'],
      },
      {
        language: 'go' as const,
        generator: new GoGenerator(),
        filePath: 'api/event.go',
        expected: [
          'func (a *EventApi) StreamEvents() ([]sdktypes.Event, error)',
          'return decodeResult[[]sdktypes.Event](raw)',
        ],
        forbidden: ['interface{}', 'struct{}'],
      },
      {
        language: 'java' as const,
        generator: new JavaGenerator(),
        filePath: 'src/main/java/com/sdkwork/backend/api/EventApi.java',
        expected: [
          'public List<Event> streamEvents() throws Exception',
          'return client.convertValue(raw, new TypeReference<List<Event>>() {});',
        ],
        forbidden: ['public Object streamEvents', 'public Void streamEvents'],
      },
      {
        language: 'kotlin' as const,
        generator: new KotlinGenerator(),
        filePath: 'src/main/kotlin/com/sdkwork/backend/api/EventApi.kt',
        expected: [
          'suspend fun streamEvents(): List<Event>?',
          'return client.convertValue(raw, object : TypeReference<List<Event>>() {})',
        ],
        forbidden: ['suspend fun streamEvents(): Any?', 'suspend fun streamEvents(): Unit?'],
      },
      {
        language: 'csharp' as const,
        generator: new CSharpGenerator(),
        filePath: 'Api/EventApi.cs',
        expected: [
          'public async Task<List<Backend.Models.Event>?> StreamEventsAsync()',
          'await _client.GetAsync<List<Backend.Models.Event>>',
        ],
        forbidden: ['Task<object?> StreamEventsAsync', 'Task<void?> StreamEventsAsync'],
      },
      {
        language: 'rust' as const,
        generator: new RustGenerator(),
        filePath: 'src/api/event.rs',
        expected: [
          'pub async fn stream_events(&self) -> Result<Vec<Event>, SdkworkError>',
          'self.client.get(&path, None, None).await',
        ],
        forbidden: ['serde_json::Value', 'Result<(),'],
      },
    ];

    for (const testCase of cases) {
      const result = await testCase.generator.generate(
        { ...baseConfig, language: testCase.language },
        openApi32ItemSchemaSpec
      );
      const apiFile = getGeneratedFile(result.files, testCase.filePath);

      expect(result.errors).toEqual([]);
      for (const expected of testCase.expected) {
        expect(apiFile.content, `${testCase.language}: ${expected}`).toContain(expected);
      }
      for (const forbidden of testCase.forbidden) {
        expect(apiFile.content, `${testCase.language}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('should hoist inline OpenAPI 3.2 media type itemSchema schemas into generated models', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, openApi32ItemSchemaSpec);
    const apiFile = getGeneratedFile(result.files, 'src/api/event.ts');
    const modelFile = getGeneratedFile(result.files, 'src/types/list-inline-events-response-item.ts');

    expect(result.errors).toEqual([]);
    expect(apiFile.content).toContain('import type { Event, ListInlineEventsResponseItem } from');
    expect(apiFile.content).toContain('async listInlineEvents(): Promise<ListInlineEventsResponseItem[]>');
    expect(modelFile.content).toContain('export interface ListInlineEventsResponseItem');
    expect(modelFile.content).toContain('sequence: number;');
    expect(modelFile.content).toContain('value?: string;');
  });

  it('should generate OpenAPI 3.2 JSON Schema prefixItems tuple models across SDK languages', async () => {
    const cases = [
      {
        language: 'typescript' as const,
        generator: new TypeScriptGenerator(),
        filePath: 'src/types/timeline-tuple.ts',
        expected: [
          "import type { TimelineEvent } from './timeline-event';",
          'export type TimelineTuple = [string, TimelineEvent, number];',
        ],
        forbidden: ['export type TimelineTuple = unknown', 'unknown[]'],
      },
      {
        language: 'python' as const,
        generator: new PythonGenerator(),
        filePath: 'sdkwork_backend_sdk/models/timeline_envelope.py',
        expected: [
          'from .timeline_event import TimelineEvent',
          'tuple: Optional[Tuple[str, TimelineEvent, int]] = None',
        ],
        forbidden: ['class TimelineTuple:', 'List[Any]'],
      },
      {
        language: 'go' as const,
        generator: new GoGenerator(),
        filePath: 'types/timeline_tuple.go',
        expected: [
          'type TimelineTuple []interface{}',
        ],
        forbidden: ['type TimelineTuple interface{}'],
      },
      {
        language: 'java' as const,
        generator: new JavaGenerator(),
        filePath: 'src/main/java/com/sdkwork/backend/model/TimelineEnvelope.java',
        expected: [
          'private List<Object> tuple;',
        ],
        forbidden: ['private Object tuple;'],
      },
      {
        language: 'kotlin' as const,
        generator: new KotlinGenerator(),
        filePath: 'src/main/kotlin/com/sdkwork/backend/TimelineEnvelope.kt',
        expected: [
          'val tuple: List<Any>? = null',
        ],
        forbidden: ['val tuple: Any? = null'],
      },
      {
        language: 'csharp' as const,
        generator: new CSharpGenerator(),
        filePath: 'Models/TimelineEnvelope.cs',
        expected: [
          'public List<object>? Tuple { get; set; }',
        ],
        forbidden: ['public object? Tuple'],
      },
      {
        language: 'swift' as const,
        generator: new SwiftGenerator(),
        filePath: 'Sources/Models.swift',
        expected: [
          'public let tuple: [Any]?',
        ],
        forbidden: ['public let tuple: Any?'],
      },
      {
        language: 'dart' as const,
        generator: new DartGenerator(),
        filePath: 'lib/src/models.dart',
        expected: [
          'final List<dynamic>? tuple;',
        ],
        forbidden: ['final dynamic tuple;'],
      },
      {
        language: 'flutter' as const,
        generator: new FlutterGenerator(),
        filePath: 'lib/src/models.dart',
        expected: [
          'final List<dynamic>? tuple;',
        ],
        forbidden: ['final dynamic tuple;'],
      },
      {
        language: 'rust' as const,
        generator: new RustGenerator(),
        filePath: 'src/models/timeline_envelope.rs',
        expected: [
          'pub tuple: Option<Vec<serde_json::Value>>,',
        ],
        forbidden: ['pub tuple: Option<serde_json::Value>,'],
      },
      {
        language: 'php' as const,
        generator: new PhpGenerator(),
        filePath: 'src/Models/TimelineEnvelope.php',
        expected: [
          'public array $tuple = [];',
        ],
        forbidden: ['public mixed $tuple'],
      },
      {
        language: 'ruby' as const,
        generator: new RubyGenerator(),
        filePath: 'lib/sdkwork/backend_sdk/models/timeline_envelope.rb',
        expected: [
          "@tuple = attributes['tuple'].is_a?(Array) ? attributes['tuple'].map { |item| item } : []",
        ],
        forbidden: ["@tuple = attributes['tuple']\n"],
      },
    ];

    for (const testCase of cases) {
      const result = await testCase.generator.generate(
        { ...baseConfig, language: testCase.language },
        openApi32PrefixItemsSpec
      );
      const modelFile = getGeneratedFile(result.files, testCase.filePath);

      expect(result.errors).toEqual([]);
      for (const expected of testCase.expected) {
        expect(modelFile.content, `${testCase.language}: ${expected}`).toContain(expected);
      }
      for (const forbidden of testCase.forbidden) {
        expect(modelFile.content, `${testCase.language}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('should hoist OpenAPI 3.1 $defs schemas and resolve deep JSON Pointer refs across generated SDKs', async () => {
    const cases = [
      {
        language: 'typescript' as const,
        generator: new TypeScriptGenerator(),
        filePath: 'src/types/audit-envelope.ts',
        expected: [
          "import type { AuditEnvelopeAuditActor } from './audit-envelope-audit-actor';",
          "import type { AuditEnvelopeAuditEvent } from './audit-envelope-audit-event';",
          "import type { AuditEnvelopeAuditMetadata } from './audit-envelope-audit-metadata';",
          "import type { AuditRootNote } from './audit-root-note';",
          'event: AuditEnvelopeAuditEvent;',
          'actor?: AuditEnvelopeAuditActor;',
          'metadata?: AuditEnvelopeAuditMetadata;',
          'rootNote?: AuditRootNote;',
        ],
        forbidden: ['event: unknown;', 'actor?: unknown;', 'metadata?: unknown;', 'rootNote?: unknown;'],
      },
      {
        language: 'python' as const,
        generator: new PythonGenerator(),
        filePath: 'sdkwork_backend_sdk/models/audit_envelope.py',
        expected: [
          'from .audit_envelope_audit_actor import AuditEnvelopeAuditActor',
          'from .audit_envelope_audit_event import AuditEnvelopeAuditEvent',
          'from .audit_envelope_audit_metadata import AuditEnvelopeAuditMetadata',
          'from .audit_root_note import AuditRootNote',
          'event: AuditEnvelopeAuditEvent',
          'actor: Optional[AuditEnvelopeAuditActor] = None',
          'metadata: Optional[AuditEnvelopeAuditMetadata] = None',
          'root_note: Optional[AuditRootNote] = None',
        ],
        forbidden: ['event: Any', 'actor: Optional[Any]', 'metadata: Optional[Any]', 'root_note: Optional[Any]'],
      },
      {
        language: 'rust' as const,
        generator: new RustGenerator(),
        filePath: 'src/models/audit_envelope.rs',
        expected: [
          'use crate::models::{AuditEnvelopeAuditActor, AuditEnvelopeAuditEvent, AuditEnvelopeAuditMetadata, AuditRootNote};',
          'pub event: AuditEnvelopeAuditEvent,',
          'pub actor: Option<AuditEnvelopeAuditActor>,',
          'pub metadata: Option<AuditEnvelopeAuditMetadata>,',
          'pub root_note: Option<AuditRootNote>,',
        ],
        forbidden: [
          'pub event: serde_json::Value',
          'pub actor: Option<serde_json::Value>',
          'pub metadata: Option<serde_json::Value>',
          'pub root_note: Option<serde_json::Value>',
        ],
      },
      {
        language: 'go' as const,
        generator: new GoGenerator(),
        filePath: 'types/audit_envelope.go',
        expected: [
          'Event AuditEnvelopeAuditEvent `json:"event"`',
          'Actor AuditEnvelopeAuditActor `json:"actor"`',
          'Metadata AuditEnvelopeAuditMetadata `json:"metadata"`',
          'RootNote AuditRootNote `json:"rootNote"`',
        ],
        forbidden: ['Event interface{}', 'Actor interface{}', 'Metadata interface{}', 'RootNote interface{}'],
      },
      {
        language: 'java' as const,
        generator: new JavaGenerator(),
        filePath: 'src/main/java/com/sdkwork/backend/model/AuditEnvelope.java',
        expected: [
          'private AuditEnvelopeAuditEvent event;',
          'private AuditEnvelopeAuditActor actor;',
          'private AuditEnvelopeAuditMetadata metadata;',
          'private AuditRootNote rootNote;',
        ],
        forbidden: [
          'private Object event;',
          'private Object actor;',
          'private Object metadata;',
          'private Object rootNote;',
        ],
      },
      {
        language: 'kotlin' as const,
        generator: new KotlinGenerator(),
        filePath: 'src/main/kotlin/com/sdkwork/backend/AuditEnvelope.kt',
        expected: [
          'val event: AuditEnvelopeAuditEvent? = null',
          'val actor: AuditEnvelopeAuditActor? = null',
          'val metadata: AuditEnvelopeAuditMetadata? = null',
          'val rootNote: AuditRootNote? = null',
        ],
        forbidden: [
          'val event: Any? = null',
          'val actor: Any? = null',
          'val metadata: Any? = null',
          'val rootNote: Any? = null',
        ],
      },
      {
        language: 'swift' as const,
        generator: new SwiftGenerator(),
        filePath: 'Sources/Models.swift',
        expected: [
          'public let event: AuditEnvelopeAuditEvent?',
          'public let actor_: AuditEnvelopeAuditActor?',
          'public let metadata: AuditEnvelopeAuditMetadata?',
          'public let rootNote: AuditRootNote?',
        ],
        forbidden: [
          'public let event: Any?',
          'public let actor_: Any?',
          'public let metadata: Any?',
          'public let rootNote: Any?',
        ],
      },
      {
        language: 'csharp' as const,
        generator: new CSharpGenerator(),
        filePath: 'Models/AuditEnvelope.cs',
        expected: [
          'public AuditEnvelopeAuditEvent? Event { get; set; }',
          'public AuditEnvelopeAuditActor? Actor { get; set; }',
          'public AuditEnvelopeAuditMetadata? Metadata { get; set; }',
          'public AuditRootNote? RootNote { get; set; }',
        ],
        forbidden: [
          'public object? Event',
          'public object? Actor',
          'public object? Metadata',
          'public object? RootNote',
        ],
      },
      {
        language: 'dart' as const,
        generator: new DartGenerator(),
        filePath: 'lib/src/models.dart',
        expected: [
          'final AuditEnvelopeAuditEvent? event;',
          'final AuditEnvelopeAuditActor? actor;',
          'final AuditEnvelopeAuditMetadata? metadata;',
          'final AuditRootNote? rootNote;',
        ],
        forbidden: ['final dynamic event;', 'final dynamic actor;', 'final dynamic metadata;', 'final dynamic rootNote;'],
      },
      {
        language: 'flutter' as const,
        generator: new FlutterGenerator(),
        filePath: 'lib/src/models.dart',
        expected: [
          'final AuditEnvelopeAuditEvent? event;',
          'final AuditEnvelopeAuditActor? actor;',
          'final AuditEnvelopeAuditMetadata? metadata;',
          'final AuditRootNote? rootNote;',
        ],
        forbidden: ['final dynamic event;', 'final dynamic actor;', 'final dynamic metadata;', 'final dynamic rootNote;'],
      },
      {
        language: 'php' as const,
        generator: new PhpGenerator(),
        filePath: 'src/Models/AuditEnvelope.php',
        expected: [
          'use SDKWork\\Backend\\Models\\AuditEnvelopeAuditActor;',
          'use SDKWork\\Backend\\Models\\AuditEnvelopeAuditEvent;',
          'use SDKWork\\Backend\\Models\\AuditEnvelopeAuditMetadata;',
          'use SDKWork\\Backend\\Models\\AuditRootNote;',
          'public ?AuditEnvelopeAuditEvent $event = null;',
          'public ?AuditEnvelopeAuditActor $actor = null;',
          'public ?AuditEnvelopeAuditMetadata $metadata = null;',
          'public ?AuditRootNote $rootNote = null;',
        ],
        forbidden: ['public mixed $event', 'public mixed $actor', 'public mixed $metadata', 'public mixed $rootNote'],
      },
      {
        language: 'ruby' as const,
        generator: new RubyGenerator(),
        filePath: 'lib/sdkwork/backend_sdk/models/audit_envelope.rb',
        expected: [
          "@event = attributes['event'].is_a?(Hash) ? AuditEnvelopeAuditEvent.from_hash(attributes['event']) : nil",
          "@actor = attributes['actor'].is_a?(Hash) ? AuditEnvelopeAuditActor.from_hash(attributes['actor']) : nil",
          "@metadata = attributes['metadata'].is_a?(Hash) ? AuditEnvelopeAuditMetadata.from_hash(attributes['metadata']) : nil",
          "@root_note = attributes['rootNote'].is_a?(Hash) ? AuditRootNote.from_hash(attributes['rootNote']) : nil",
        ],
        forbidden: [
          "@event = attributes['event']\n",
          "@actor = attributes['actor']\n",
          "@metadata = attributes['metadata']\n",
          "@root_note = attributes['rootNote']\n",
        ],
      },
    ];

    for (const testCase of cases) {
      const result = await testCase.generator.generate(
        { ...baseConfig, language: testCase.language },
        openApi31DefsSpec
      );
      const modelFile = getGeneratedFile(result.files, testCase.filePath);

      expect(result.errors).toEqual([]);
      for (const expected of testCase.expected) {
        expect(modelFile.content, `${testCase.language}: ${expected}`).toContain(expected);
      }
      for (const forbidden of testCase.forbidden) {
        expect(modelFile.content, `${testCase.language}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('should generate OpenAPI 3.1 JSON Schema const fields as precise stable SDK types', async () => {
    const cases = [
      {
        language: 'typescript' as const,
        generator: new TypeScriptGenerator(),
        filePath: 'src/types/const-envelope.ts',
        expected: [
          "kind: 'audit';",
          'version: 1;',
          'ratio?: 2.5;',
          'enabled: true;',
          'missing?: null;',
        ],
        forbidden: ['kind: unknown;', 'version: unknown;', 'enabled: unknown;'],
      },
      {
        language: 'python' as const,
        generator: new PythonGenerator(),
        filePath: 'sdkwork_backend_sdk/models/const_envelope.py',
        expected: [
          'from typing import TYPE_CHECKING, Optional, List, Dict, Any, Literal',
          "kind: Literal['audit']",
          'version: Literal[1]',
          'ratio: Optional[Literal[2.5]] = None',
          'enabled: Literal[True]',
          'missing: Any = None',
        ],
        forbidden: ['kind: Any', 'version: Any', 'enabled: Any'],
      },
      {
        language: 'go' as const,
        generator: new GoGenerator(),
        filePath: 'types/const_envelope.go',
        expected: [
          'Kind string `json:"kind"`',
          'Version int `json:"version"`',
          'Ratio float64 `json:"ratio"`',
          'Enabled bool `json:"enabled"`',
        ],
        forbidden: ['Kind interface{}', 'Version interface{}', 'Enabled interface{}'],
      },
      {
        language: 'java' as const,
        generator: new JavaGenerator(),
        filePath: 'src/main/java/com/sdkwork/backend/model/ConstEnvelope.java',
        expected: [
          'private String kind;',
          'private Integer version;',
          'private Double ratio;',
          'private Boolean enabled;',
        ],
        forbidden: ['private Object kind;', 'private Object version;', 'private Object enabled;'],
      },
      {
        language: 'kotlin' as const,
        generator: new KotlinGenerator(),
        filePath: 'src/main/kotlin/com/sdkwork/backend/ConstEnvelope.kt',
        expected: [
          'val kind: String? = null',
          'val version: Int? = null',
          'val ratio: Double? = null',
          'val enabled: Boolean? = null',
        ],
        forbidden: ['val kind: Any? = null', 'val version: Any? = null', 'val enabled: Any? = null'],
      },
      {
        language: 'swift' as const,
        generator: new SwiftGenerator(),
        filePath: 'Sources/Models.swift',
        expected: [
          'public let kind: String?',
          'public let version: Int?',
          'public let ratio: Double?',
          'public let enabled: Bool?',
        ],
        forbidden: ['public let kind: Any?', 'public let version: Any?', 'public let enabled: Any?'],
      },
      {
        language: 'csharp' as const,
        generator: new CSharpGenerator(),
        filePath: 'Models/ConstEnvelope.cs',
        expected: [
          'public string? Kind { get; set; }',
          'public int? Version { get; set; }',
          'public double? Ratio { get; set; }',
          'public bool? Enabled { get; set; }',
        ],
        forbidden: ['public object? Kind', 'public object? Version', 'public object? Enabled'],
      },
      {
        language: 'dart' as const,
        generator: new DartGenerator(),
        filePath: 'lib/src/models.dart',
        expected: [
          'final String? kind;',
          'final int? version;',
          'final double? ratio;',
          'final bool? enabled;',
        ],
        forbidden: ['final dynamic kind;', 'final dynamic version;', 'final dynamic enabled;'],
      },
      {
        language: 'flutter' as const,
        generator: new FlutterGenerator(),
        filePath: 'lib/src/models.dart',
        expected: [
          'final String? kind;',
          'final int? version;',
          'final double? ratio;',
          'final bool? enabled;',
        ],
        forbidden: ['final dynamic kind;', 'final dynamic version;', 'final dynamic enabled;'],
      },
      {
        language: 'rust' as const,
        generator: new RustGenerator(),
        filePath: 'src/models/const_envelope.rs',
        expected: [
          'pub kind: String,',
          'pub version: i64,',
          'pub ratio: Option<f64>,',
          'pub enabled: bool,',
        ],
        forbidden: [
          'pub kind: serde_json::Value',
          'pub version: serde_json::Value',
          'pub enabled: serde_json::Value',
        ],
      },
      {
        language: 'php' as const,
        generator: new PhpGenerator(),
        filePath: 'src/Models/ConstEnvelope.php',
        expected: [
          'public ?string $kind = null;',
          'public ?int $version = null;',
          'public ?float $ratio = null;',
          'public ?bool $enabled = null;',
        ],
        forbidden: ['public mixed $kind', 'public mixed $version', 'public mixed $enabled'],
      },
      {
        language: 'ruby' as const,
        generator: new RubyGenerator(),
        filePath: 'lib/sdkwork/backend_sdk/models/const_envelope.rb',
        expected: [
          "attr_accessor :kind, :version, :ratio, :enabled, :missing",
          "@kind = attributes['kind']",
          "@version = attributes['version']",
          "@enabled = attributes['enabled']",
        ],
        forbidden: [],
      },
    ];

    for (const testCase of cases) {
      const result = await testCase.generator.generate(
        { ...baseConfig, language: testCase.language },
        openApi31ConstSpec
      );
      const modelFile = getGeneratedFile(result.files, testCase.filePath);

      expect(result.errors).toEqual([]);
      for (const expected of testCase.expected) {
        expect(modelFile.content, `${testCase.language}: ${expected}`).toContain(expected);
      }
      for (const forbidden of testCase.forbidden) {
        expect(modelFile.content, `${testCase.language}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('should decode escaped JSON Pointer component refs across generated SDK languages', async () => {
    const cases = [
      {
        language: 'typescript' as const,
        generator: new TypeScriptGenerator(),
        filePath: 'src/types/escaped-envelope.ts',
        expected: [
          "import type { AuditEvent } from './audit-event';",
          "import type { AuditMeta } from './audit-meta';",
          'event: AuditEvent;',
          'meta?: AuditMeta;',
        ],
        forbidden: ['Audit1Event', 'Audit0Meta', 'event: unknown;', 'meta?: unknown;'],
      },
      {
        language: 'python' as const,
        generator: new PythonGenerator(),
        filePath: 'sdkwork_backend_sdk/models/escaped_envelope.py',
        expected: [
          'from .audit_event import AuditEvent',
          'from .audit_meta import AuditMeta',
          'event: AuditEvent',
          'meta: Optional[AuditMeta] = None',
        ],
        forbidden: ['Audit1Event', 'Audit0Meta', 'event: Any', 'meta: Optional[Any]'],
      },
      {
        language: 'go' as const,
        generator: new GoGenerator(),
        filePath: 'types/escaped_envelope.go',
        expected: [
          'Event AuditEvent `json:"event"`',
          'Meta AuditMeta `json:"meta"`',
        ],
        forbidden: ['Audit1Event', 'Audit0Meta', 'interface{} `json:"event"`', 'interface{} `json:"meta"`'],
      },
      {
        language: 'java' as const,
        generator: new JavaGenerator(),
        filePath: 'src/main/java/com/sdkwork/backend/model/EscapedEnvelope.java',
        expected: [
          'private AuditEvent event;',
          'private AuditMeta meta;',
        ],
        forbidden: ['Audit1Event', 'Audit0Meta', 'private Object event;', 'private Object meta;'],
      },
      {
        language: 'kotlin' as const,
        generator: new KotlinGenerator(),
        filePath: 'src/main/kotlin/com/sdkwork/backend/EscapedEnvelope.kt',
        expected: [
          'val event: AuditEvent? = null',
          'val meta: AuditMeta? = null',
        ],
        forbidden: ['Audit1Event', 'Audit0Meta', 'val event: Any? = null', 'val meta: Any? = null'],
      },
      {
        language: 'csharp' as const,
        generator: new CSharpGenerator(),
        filePath: 'Models/EscapedEnvelope.cs',
        expected: [
          'public AuditEvent? Event { get; set; }',
          'public AuditMeta? Meta { get; set; }',
        ],
        forbidden: ['Audit1Event', 'Audit0Meta', 'public object? Event', 'public object? Meta'],
      },
      {
        language: 'rust' as const,
        generator: new RustGenerator(),
        filePath: 'src/models/escaped_envelope.rs',
        expected: [
          'use crate::models::{AuditEvent, AuditMeta};',
          'pub event: AuditEvent,',
          'pub meta: Option<AuditMeta>,',
        ],
        forbidden: ['Audit1Event', 'Audit0Meta', 'pub event: serde_json::Value', 'pub meta: Option<serde_json::Value>'],
      },
      {
        language: 'dart' as const,
        generator: new DartGenerator(),
        filePath: 'lib/src/models.dart',
        expected: [
          'final AuditEvent? event;',
          'final AuditMeta? meta;',
        ],
        forbidden: ['Audit1Event', 'Audit0Meta', 'final dynamic event;', 'final dynamic meta;'],
      },
      {
        language: 'flutter' as const,
        generator: new FlutterGenerator(),
        filePath: 'lib/src/models.dart',
        expected: [
          'final AuditEvent? event;',
          'final AuditMeta? meta;',
        ],
        forbidden: ['Audit1Event', 'Audit0Meta', 'final dynamic event;', 'final dynamic meta;'],
      },
      {
        language: 'swift' as const,
        generator: new SwiftGenerator(),
        filePath: 'Sources/Models.swift',
        expected: [
          'public let event: AuditEvent?',
          'public let meta: AuditMeta?',
        ],
        forbidden: ['Audit1Event', 'Audit0Meta', 'public let event: Any?', 'public let meta: Any?'],
      },
      {
        language: 'php' as const,
        generator: new PhpGenerator(),
        filePath: 'src/Models/EscapedEnvelope.php',
        expected: [
          'use SDKWork\\Backend\\Models\\AuditEvent;',
          'use SDKWork\\Backend\\Models\\AuditMeta;',
          'public ?AuditEvent $event = null;',
          'public ?AuditMeta $meta = null;',
        ],
        forbidden: ['Audit1Event', 'Audit0Meta', 'public mixed $event', 'public mixed $meta'],
      },
      {
        language: 'ruby' as const,
        generator: new RubyGenerator(),
        filePath: 'lib/sdkwork/backend_sdk/models/escaped_envelope.rb',
        expected: [
          "@event = attributes['event'].is_a?(Hash) ? AuditEvent.from_hash(attributes['event']) : nil",
          "@meta = attributes['meta'].is_a?(Hash) ? AuditMeta.from_hash(attributes['meta']) : nil",
        ],
        forbidden: ['Audit1Event', 'Audit0Meta', "@event = attributes['event']\n", "@meta = attributes['meta']\n"],
      },
    ];

    for (const testCase of cases) {
      const result = await testCase.generator.generate(
        { ...baseConfig, language: testCase.language },
        escapedJsonPointerRefSpec
      );
      const modelFile = getGeneratedFile(result.files, testCase.filePath);

      expect(result.errors).toEqual([]);
      for (const expected of testCase.expected) {
        expect(modelFile.content, `${testCase.language}: ${expected}`).toContain(expected);
      }
      for (const forbidden of testCase.forbidden) {
        expect(modelFile.content, `${testCase.language}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('should resolve escaped OpenAPI component refs before SDK generation', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, escapedOpenApiComponentRefSpec);

    expect(result.errors).toEqual([]);
    const auditApi = getGeneratedFile(result.files, 'src/api/audit.ts');
    expect(auditApi.content).toContain('export interface AuditGetAuditEventWithEscapedRefsParams');
    expect(auditApi.content).toContain('async getAuditEventWithEscapedRefs(eventId: string, params?: AuditGetAuditEventWithEscapedRefsParams): Promise<AuditEvent>');
    expect(auditApi.content).toContain('filter?: string');
    expect(auditApi.content).toContain('xTraceId?: string');
    expect(auditApi.content).toContain("name: 'filter'");
    expect(auditApi.content).toContain("value: params?.filter");
    expect(auditApi.content).toContain('buildQueryString(');
    expect(auditApi.content).toContain('buildRequestHeaders(');
    expect(auditApi.content).toContain("'X-Trace-Id': { value: params?.xTraceId, style: 'simple', explode: false }");
    expect(auditApi.content).toContain('Promise<AuditEvent>');
    expect(auditApi.content).not.toContain('GENERATION_ERROR');
  });

  it('should escape python keyword property names', async () => {
    const generator = new PythonGenerator();
    const result = await generator.generate(
      { ...baseConfig, language: 'python' },
      pythonKeywordPropertySpec
    );
    const keywordModelFile = result.files.find((f) => f.path.endsWith('/models/keyword_model.py'));

    expect(keywordModelFile).toBeDefined();
    expect(keywordModelFile!.content).toContain('async_: Optional[bool] = None');
    expect(keywordModelFile!.content).toContain('await_: Optional[str] = None');
    expect(keywordModelFile!.content).not.toContain('\n    async: bool = None');
  });

  it('should escape reserved identifiers in java models and apis', async () => {
    const generator = new JavaGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'java' }, reservedIdentifierSpec);
    const modelFile = result.files.find((f) => f.path.endsWith('/model/KeywordModel.java'));
    const apiFile = result.files.find((f) => f.path.endsWith('/api/KeywordModelApi.java'));

    expect(modelFile).toBeDefined();
    expect(modelFile!.content).toContain('private String class_;');
    expect(modelFile!.content).toContain('private Boolean return_;');
    expect(modelFile!.content).toContain('public String getClass_()');
    expect(modelFile!.content).toContain('public void setClass_(String class_)');
    expect(modelFile!.content).not.toContain('public String getClass()');

    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('public KeywordModel class_()');
    expect(apiFile!.content).not.toContain('public KeywordModel class()');
  });

  it('should escape reserved identifiers in kotlin models and apis', async () => {
    const generator = new KotlinGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'kotlin' }, reservedIdentifierSpec);
    const modelFile = result.files.find((f) => f.path.endsWith('/KeywordModel.kt'));
    const apiFile = result.files.find((f) => f.path.endsWith('/api/KeywordModelApi.kt'));

    expect(modelFile).toBeDefined();
    expect(modelFile!.content).toContain('val class_: String? = null');
    expect(modelFile!.content).toContain('val return_: Boolean? = null');

    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('suspend fun class_(');
    expect(apiFile!.content).not.toContain('suspend fun class(');
  });

  it('should escape reserved identifiers in swift models and apis', async () => {
    const generator = new SwiftGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'swift' }, reservedIdentifierSpec);
    const modelFile = result.files.find((f) => f.path === 'Sources/Models.swift');
    const apiFile = result.files.find((f) => f.path === 'Sources/API/KeywordModelApi.swift');

    expect(modelFile).toBeDefined();
    expect(modelFile!.content).toContain('let class_: String?');
    expect(modelFile!.content).toContain('let return_: Bool?');

    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('public func class_(');
    expect(apiFile!.content).not.toContain('public func class(');
  });

  it('should escape reserved identifiers in php models and apis', async () => {
    const generator = new PhpGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'php' }, reservedIdentifierSpec);
    const modelFile = result.files.find((f) => f.path === 'src/Models/KeywordModel.php');
    const apiFile = result.files.find((f) => f.path === 'src/Api/KeywordModel.php');

    expect(modelFile).toBeDefined();
    expect(modelFile!.content).toContain('public ?string $class_ = null;');
    expect(modelFile!.content).toContain('public ?bool $return_ = null;');

    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('public function class_(): ?KeywordModel');
    expect(apiFile!.content).not.toContain('public function class(): ?KeywordModel');
  });

  it('should escape reserved identifiers in ruby models and apis', async () => {
    const generator = new RubyGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'ruby' }, reservedIdentifierSpec);
    const modelFile = result.files.find((f) => f.path.endsWith('/models/keyword_model.rb'));
    const apiFile = result.files.find((f) => f.path.endsWith('/api/keyword_model.rb'));

    expect(modelFile).toBeDefined();
    expect(modelFile!.content).toContain('attr_accessor :class_, :return_');

    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('def class_(');
    expect(apiFile!.content).not.toContain('def class(');
  });

  it('should escape reserved identifiers in dart models and apis', async () => {
    const generator = new DartGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'dart' } as any, reservedIdentifierSpec);
    const modelFile = result.files.find((f) => f.path === 'lib/src/models.dart');
    const apiFile = result.files.find((f) => f.path === 'lib/src/api/keyword_model.dart');

    expect(modelFile).toBeDefined();
    expect(modelFile!.content).toContain('final String? class_;');
    expect(modelFile!.content).toContain('final bool? return_;');

    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('Future<KeywordModel?> class_(');
    expect(apiFile!.content).not.toContain('Future<KeywordModel?> class(');
  });

  it('should escape reserved identifiers in flutter models and apis', async () => {
    const generator = new FlutterGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'flutter' }, reservedIdentifierSpec);
    const modelFile = result.files.find((f) => f.path === 'lib/src/models.dart');
    const apiFile = result.files.find((f) => f.path === 'lib/src/api/keyword_model.dart');

    expect(modelFile).toBeDefined();
    expect(modelFile!.content).toContain('final String? class_;');
    expect(modelFile!.content).toContain('final bool? return_;');

    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('Future<KeywordModel?> class_(');
    expect(apiFile!.content).not.toContain('Future<KeywordModel?> class(');
  });

  it('should sanitize unsafe path parameters in typescript and python apis', async () => {
    const tsGenerator = new TypeScriptGenerator();
    const tsResult = await tsGenerator.generate(baseConfig, pathParameterIdentifierSpec);
    const tsApi = tsResult.files.find(
      (f) => f.path.startsWith('src/api/') && f.content.includes('/keyword-model/')
    );

    expect(tsApi).toBeDefined();
    expect(tsApi!.content).toContain('class_: string');
    expect(tsApi!.content).toContain('userId: string');
    expect(tsApi!.content).toContain('headers: string');
    expect(tsApi!.content).toContain('xTraceId?: string');
    expect(tsApi!.content).not.toContain('headers?: Record<string, string>');
    expect(tsApi!.content).toContain("serializePathParameter(class_, { name: 'class', style: 'simple', explode: false })");
    expect(tsApi!.content).toContain("serializePathParameter(userId, { name: 'user-id', style: 'simple', explode: false })");
    expect(tsApi!.content).toContain("serializePathParameter(headers, { name: 'headers', style: 'simple', explode: false })");

    const pyGenerator = new PythonGenerator();
    const pyResult = await pyGenerator.generate({ ...baseConfig, language: 'python' }, pathParameterIdentifierSpec);
    const pyApi = pyResult.files.find(
      (f) => f.path.includes('/api/') && f.content.includes('/keyword-model/')
    );

    expect(pyApi).toBeDefined();
    expect(pyApi!.content).toContain('class_: str');
    expect(pyApi!.content).toContain('user_id: str');
    expect(pyApi!.content).toContain('headers: str');
    expect(pyApi!.content).toContain('x_trace_id: Optional[str] = None');
    expect(pyApi!.content).not.toContain('headers: Optional[Dict[str, str]] = None');
    expect(pyApi!.content).toContain("serialize_path_parameter(class_, {'name': 'class', 'style': 'simple', 'explode': False})");
    expect(pyApi!.content).toContain("serialize_path_parameter(user_id, {'name': 'user-id', 'style': 'simple', 'explode': False})");
    expect(pyApi!.content).toContain("serialize_path_parameter(headers, {'name': 'headers', 'style': 'simple', 'explode': False})");
  });

  it('should generate named TypeScript header and cookie parameters with Cookie header assembly', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, headerCookieParameterSpec);
    const apiFile = result.files.find((file) => file.path === 'src/api/resource.ts');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('export interface ResourceListResourcesParams');
    expect(apiFile!.content).toContain('xTraceId: string;');
    expect(apiFile!.content).toContain('sessionId?: string;');
    expect(apiFile!.content).toContain('async listResources(params: ResourceListResourcesParams): Promise<void>');
    expect(apiFile!.content).toContain("const requestHeaders = buildRequestHeaders(");
    expect(apiFile!.content).toContain("'X-Trace-Id': { value: params.xTraceId, style: 'simple', explode: false }");
    expect(apiFile!.content).toContain("session_id: { value: params.sessionId, style: 'form', explode: true }");
    expect(apiFile!.content).toContain('this.client.get<void>(backendApiPath(`/resources`), undefined, requestHeaders)');
    expect(apiFile!.content).not.toContain('headers?: Record<string, string>');
  });

  it('should generate TypeScript OpenAPI parameter serialization for query style explode content and allowReserved', async () => {
    const parameterSerializationSpec: ApiSpec = {
      openapi: '3.1.1',
      info: { title: 'Parameter Serialization API', version: '1.0.0' },
      paths: {
        '/resources': {
          get: {
            operationId: 'searchResources',
            tags: ['Resource'],
            parameters: [
              {
                name: 'tag',
                in: 'query',
                required: true,
                style: 'form',
                explode: true,
                schema: { type: 'array', items: { type: 'string' } },
              },
              {
                name: 'filter',
                in: 'query',
                required: false,
                style: 'deepObject',
                explode: true,
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    owner: { type: 'string' },
                  },
                },
              },
              {
                name: 'range',
                in: 'query',
                required: false,
                style: 'form',
                explode: false,
                schema: {
                  type: 'object',
                  additionalProperties: { type: 'integer' },
                },
              },
              {
                name: 'json_filter',
                in: 'query',
                required: false,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        state: { type: 'string' },
                      },
                    },
                  },
                },
                schema: { type: 'string' },
              },
              {
                name: 'q',
                in: 'query',
                required: false,
                allowReserved: true,
                schema: { type: 'string' },
              },
            ],
            responses: { '204': { description: 'No content' } },
          },
        },
      },
      components: { schemas: {} },
    };

    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, parameterSerializationSpec);
    const apiFile = result.files.find((file) => file.path === 'src/api/resource.ts');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('export interface ResourceSearchResourcesParams');
    expect(apiFile!.content).toContain('tag: string[];');
    expect(apiFile!.content).toContain('filter?: Record<string, unknown>;');
    expect(apiFile!.content).toContain('range?: Record<string, number>;');
    expect(apiFile!.content).toContain('jsonFilter?: Record<string, unknown>;');
    expect(apiFile!.content).toContain('q?: string;');
    expect(apiFile!.content).toContain('async searchResources(params: ResourceSearchResourcesParams): Promise<void>');
    expect(apiFile!.content).toContain('const query = buildQueryString([');
    expect(apiFile!.content).toContain("name: 'tag'");
    expect(apiFile!.content).toContain("value: params.tag");
    expect(apiFile!.content).toContain("style: 'form'");
    expect(apiFile!.content).toContain('explode: true');
    expect(apiFile!.content).toContain("name: 'filter'");
    expect(apiFile!.content).toContain("value: params.filter");
    expect(apiFile!.content).toContain("style: 'deepObject'");
    expect(apiFile!.content).toContain("contentType: 'application/json'");
    expect(apiFile!.content).toContain('allowReserved: true');
    expect(apiFile!.content).toContain('appendQueryString(backendApiPath(`/resources`), query)');
    expect(apiFile!.content).not.toContain('params?: QueryParams');
    expect(apiFile!.content).not.toContain('captured.params');
  });

  it('should generate Python OpenAPI parameter serialization for query style explode content and allowReserved', async () => {
    const parameterSerializationSpec: ApiSpec = {
      openapi: '3.1.1',
      info: { title: 'Python Parameter Serialization API', version: '1.0.0' },
      paths: {
        '/resources': {
          get: {
            operationId: 'searchResources',
            tags: ['Resource'],
            parameters: [
              {
                name: 'tag',
                in: 'query',
                required: true,
                style: 'form',
                explode: true,
                schema: { type: 'array', items: { type: 'string' } },
              },
              {
                name: 'filter',
                in: 'query',
                required: false,
                style: 'deepObject',
                explode: true,
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    owner: { type: 'string' },
                  },
                },
              },
              {
                name: 'range',
                in: 'query',
                required: false,
                style: 'form',
                explode: false,
                schema: {
                  type: 'object',
                  additionalProperties: { type: 'integer' },
                },
              },
              {
                name: 'json_filter',
                in: 'query',
                required: false,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        state: { type: 'string' },
                      },
                    },
                  },
                },
                schema: { type: 'string' },
              },
              {
                name: 'q',
                in: 'query',
                required: false,
                allowReserved: true,
                schema: { type: 'string' },
              },
            ],
            responses: { '204': { description: 'No content' } },
          },
        },
      },
      components: { schemas: {} },
    };

    const generator = new PythonGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'python' }, parameterSerializationSpec);
    const apiFile = result.files.find((file) => file.path === 'sdkwork_backend_sdk/api/resource.py');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain(
      'def search_resources(self, tag: List[str], filter: Optional[Dict[str, Any]] = None, range: Optional[Dict[str, int]] = None, json_filter: Optional[Dict[str, Any]] = None, q: Optional[str] = None) -> None:'
    );
    expect(apiFile!.content).toContain('query = build_query_string([');
    expect(apiFile!.content).toContain("'name': 'tag'");
    expect(apiFile!.content).toContain("'style': 'form'");
    expect(apiFile!.content).toContain("'explode': True");
    expect(apiFile!.content).toContain("'name': 'filter'");
    expect(apiFile!.content).toContain("'style': 'deepObject'");
    expect(apiFile!.content).toContain("'content_type': 'application/json'");
    expect(apiFile!.content).toContain("'allow_reserved': True");
    expect(apiFile!.content).toContain('_append_query_string(f"/api/v1/resources", query)');
    expect(apiFile!.content).not.toContain('params: Optional[Dict[str, Any]] = None');
  });

  it('should generate Go OpenAPI parameter serialization for query style explode content and allowReserved', async () => {
    const parameterSerializationSpec: ApiSpec = {
      openapi: '3.1.1',
      info: { title: 'Go Parameter Serialization API', version: '1.0.0' },
      paths: {
        '/resources': {
          get: {
            operationId: 'searchResources',
            tags: ['Resource'],
            parameters: [
              {
                name: 'tag',
                in: 'query',
                required: true,
                style: 'form',
                explode: true,
                schema: { type: 'array', items: { type: 'string' } },
              },
              {
                name: 'filter',
                in: 'query',
                required: false,
                style: 'deepObject',
                explode: true,
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    owner: { type: 'string' },
                  },
                },
              },
              {
                name: 'range',
                in: 'query',
                required: false,
                style: 'form',
                explode: false,
                schema: {
                  type: 'object',
                  additionalProperties: { type: 'integer' },
                },
              },
              {
                name: 'json_filter',
                in: 'query',
                required: false,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        state: { type: 'string' },
                      },
                    },
                  },
                },
                schema: { type: 'string' },
              },
              {
                name: 'q',
                in: 'query',
                required: false,
                allowReserved: true,
                schema: { type: 'string' },
              },
            ],
            responses: { '204': { description: 'No content' } },
          },
        },
      },
      components: { schemas: {} },
    };

    const generator = new GoGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'go' }, parameterSerializationSpec);
    const apiFile = result.files.find((file) => file.path === 'api/resource.go');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain(
      'func (a *ResourceApi) SearchResources(tag []string, filter *map[string]interface{}, range_ *map[string]int, jsonFilter *map[string]interface{}, q *string) (struct{}, error)'
    );
    expect(apiFile!.content).toContain('query := BuildQueryString([]QueryParameterSpec{');
    expect(apiFile!.content).toContain('Name: "tag"');
    expect(apiFile!.content).toContain('Style: "form"');
    expect(apiFile!.content).toContain('Explode: true');
    expect(apiFile!.content).toContain('Name: "filter"');
    expect(apiFile!.content).toContain('Style: "deepObject"');
    expect(apiFile!.content).toContain('ContentType: "application/json"');
    expect(apiFile!.content).toContain('AllowReserved: true');
    expect(apiFile!.content).toContain('AppendQueryString(BackendApiPath("/resources"), query)');
    expect(apiFile!.content).not.toContain('query map[string]interface{}');
  });

  it('should generate JVM OpenAPI parameter serialization for query style explode content and allowReserved', async () => {
    const parameterSerializationSpec: ApiSpec = {
      openapi: '3.1.1',
      info: { title: 'JVM Parameter Serialization API', version: '1.0.0' },
      paths: {
        '/resources': {
          get: {
            operationId: 'searchResources',
            tags: ['Resource'],
            parameters: [
              { name: 'tag', in: 'query', required: true, style: 'form', explode: true, schema: { type: 'array', items: { type: 'string' } } },
              { name: 'filter', in: 'query', required: false, style: 'deepObject', explode: true, schema: { type: 'object', properties: { status: { type: 'string' } } } },
              { name: 'range', in: 'query', required: false, style: 'form', explode: false, schema: { type: 'object', additionalProperties: { type: 'integer' } } },
              { name: 'json_filter', in: 'query', required: false, content: { 'application/json': { schema: { type: 'object', properties: { state: { type: 'string' } } } } }, schema: { type: 'string' } },
              { name: 'q', in: 'query', required: false, allowReserved: true, schema: { type: 'string' } },
            ],
            responses: { '204': { description: 'No content' } },
          },
        },
      },
      components: { schemas: {} },
    };

    const javaResult = await new JavaGenerator().generate({ ...baseConfig, language: 'java' }, parameterSerializationSpec);
    const javaApi = javaResult.files.find((file) => file.path === 'src/main/java/com/sdkwork/backend/api/ResourceApi.java');

    expect(javaResult.errors).toEqual([]);
    expect(javaApi).toBeDefined();
    expect(javaApi!.content).toContain(
      'public Void searchResources(List<String> tag, Map<String, Object> filter, Map<String, Integer> range, Map<String, Object> jsonFilter, String q) throws Exception'
    );
    expect(javaApi!.content).toContain('String query = buildQueryString(List.of(');
    expect(javaApi!.content).toContain('new QueryParameterSpec("tag", tag, "form", true, false, null)');
    expect(javaApi!.content).toContain('new QueryParameterSpec("filter", filter, "deepObject", true, false, null)');
    expect(javaApi!.content).toContain('new QueryParameterSpec("json_filter", jsonFilter, "form", true, false, "application/json")');
    expect(javaApi!.content).toContain('new QueryParameterSpec("q", q, "form", true, true, null)');
    expect(javaApi!.content).toContain('ApiPaths.appendQueryString(ApiPaths.backendPath("/resources"), query)');
    expect(javaApi!.content).not.toContain('Map<String, Object> params');

    const kotlinResult = await new KotlinGenerator().generate({ ...baseConfig, language: 'kotlin' }, parameterSerializationSpec);
    const kotlinApi = kotlinResult.files.find((file) => file.path === 'src/main/kotlin/com/sdkwork/backend/api/ResourceApi.kt');

    expect(kotlinResult.errors).toEqual([]);
    expect(kotlinApi).toBeDefined();
    expect(kotlinApi!.content).toContain(
      'suspend fun searchResources(tag: List<String>, filter: Map<String, Any>? = null, range: Map<String, Int>? = null, jsonFilter: Map<String, Any>? = null, q: String? = null): Unit'
    );
    expect(kotlinApi!.content).toContain('val query = buildQueryString(listOf(');
    expect(kotlinApi!.content).toContain('QueryParameterSpec("tag", tag, "form", true, false, null)');
    expect(kotlinApi!.content).toContain('QueryParameterSpec("filter", filter, "deepObject", true, false, null)');
    expect(kotlinApi!.content).toContain('QueryParameterSpec("json_filter", jsonFilter, "form", true, false, "application/json")');
    expect(kotlinApi!.content).toContain('QueryParameterSpec("q", q, "form", true, true, null)');
    expect(kotlinApi!.content).toContain('private val queryObjectMapper = ObjectMapper().registerKotlinModule()');
    expect(kotlinApi!.content).toContain('val json = queryObjectMapper.writeValueAsString(value)');
    expect(kotlinApi!.content).toContain('encodeQueryValue(json, parameter.allowReserved)');
    expect(kotlinApi!.content).toContain('ApiPaths.appendQueryString(ApiPaths.backendPath("/resources"), query)');
    expect(kotlinApi!.content).not.toContain('params: Map<String, Any>? = null');
  });

  it('should generate Dart and Flutter OpenAPI parameter serialization for query style explode content and allowReserved', async () => {
    const parameterSerializationSpec: ApiSpec = {
      openapi: '3.1.1',
      info: { title: 'Dart Parameter Serialization API', version: '1.0.0' },
      paths: {
        '/resources': {
          get: {
            operationId: 'searchResources',
            tags: ['Resource'],
            parameters: [
              { name: 'tag', in: 'query', required: true, style: 'form', explode: true, schema: { type: 'array', items: { type: 'string' } } },
              { name: 'filter', in: 'query', required: false, style: 'deepObject', explode: true, schema: { type: 'object', properties: { status: { type: 'string' } } } },
              { name: 'range', in: 'query', required: false, style: 'form', explode: false, schema: { type: 'object', additionalProperties: { type: 'integer' } } },
              { name: 'json_filter', in: 'query', required: false, content: { 'application/json': { schema: { type: 'object', properties: { state: { type: 'string' } } } } }, schema: { type: 'string' } },
              { name: 'q', in: 'query', required: false, allowReserved: true, schema: { type: 'string' } },
            ],
            responses: { '204': { description: 'No content' } },
          },
        },
      },
      components: { schemas: {} },
    };

    const cases = [
      {
        language: 'dart',
        result: await new DartGenerator().generate({ ...baseConfig, language: 'dart' }, parameterSerializationSpec),
      },
      {
        language: 'flutter',
        result: await new FlutterGenerator().generate({ ...baseConfig, language: 'flutter' }, parameterSerializationSpec),
      },
    ];

    for (const testCase of cases) {
      const apiFile = testCase.result.files.find((file) => file.path === 'lib/src/api/resource.dart');

      expect(testCase.result.errors, testCase.language).toEqual([]);
      expect(apiFile, testCase.language).toBeDefined();
      expect(apiFile!.content, testCase.language).toContain("import 'dart:convert';");
      expect(apiFile!.content, testCase.language).toContain(
        'Future<void> searchResources(List<String> tag, [Map<String, dynamic>? filter, Map<String, int>? range, Map<String, dynamic>? jsonFilter, String? q]) async {'
      );
      expect(apiFile!.content, testCase.language).toContain('final query = buildQueryString([');
      expect(apiFile!.content, testCase.language).toContain("QueryParameterSpec('tag', tag, 'form', true, false, null)");
      expect(apiFile!.content, testCase.language).toContain("QueryParameterSpec('filter', filter, 'deepObject', true, false, null)");
      expect(apiFile!.content, testCase.language).toContain("QueryParameterSpec('json_filter', jsonFilter, 'form', true, false, 'application/json')");
      expect(apiFile!.content, testCase.language).toContain("QueryParameterSpec('q', q, 'form', true, true, null)");
      expect(apiFile!.content, testCase.language).toContain("ApiPaths.appendQueryString(ApiPaths.backendPath('/resources'), query)");
      expect(apiFile!.content, testCase.language).not.toContain('Map<String, dynamic>? params');
      expect(apiFile!.content, testCase.language).not.toContain('params: params');
    }
  });

  it('should generate Swift C# Rust PHP and Ruby OpenAPI parameter serialization for query style explode content and allowReserved', async () => {
    const parameterSerializationSpec: ApiSpec = {
      openapi: '3.1.1',
      info: { title: 'Native Parameter Serialization API', version: '1.0.0' },
      paths: {
        '/resources': {
          get: {
            operationId: 'searchResources',
            tags: ['Resource'],
            parameters: [
              { name: 'tag', in: 'query', required: true, style: 'form', explode: true, schema: { type: 'array', items: { type: 'string' } } },
              { name: 'filter', in: 'query', required: false, style: 'deepObject', explode: true, schema: { type: 'object', properties: { status: { type: 'string' } } } },
              { name: 'range', in: 'query', required: false, style: 'form', explode: false, schema: { type: 'object', additionalProperties: { type: 'integer' } } },
              { name: 'json_filter', in: 'query', required: false, content: { 'application/json': { schema: { type: 'object', properties: { state: { type: 'string' } } } } }, schema: { type: 'string' } },
              { name: 'q', in: 'query', required: false, allowReserved: true, schema: { type: 'string' } },
            ],
            responses: { '204': { description: 'No content' } },
          },
        },
      },
      components: { schemas: {} },
    };

    const swiftResult = await new SwiftGenerator().generate({ ...baseConfig, language: 'swift' }, parameterSerializationSpec);
    const swiftApi = swiftResult.files.find((file) => file.path === 'Sources/API/ResourceApi.swift');
    expect(swiftResult.errors).toEqual([]);
    expect(swiftApi).toBeDefined();
    expect(swiftApi!.content).toContain('public func searchResources(tag: [String], filter: [String: Any]? = nil, range: [String: Int]? = nil, jsonFilter: [String: Any]? = nil, q: String? = nil) async throws -> Void');
    expect(swiftApi!.content).toContain('let query = buildQueryString([');
    expect(swiftApi!.content).toContain('QueryParameterSpec(name: "tag", value: tag, style: "form", explode: true, allowReserved: false, contentType: nil)');
    expect(swiftApi!.content).toContain('QueryParameterSpec(name: "filter", value: filter, style: "deepObject", explode: true, allowReserved: false, contentType: nil)');
    expect(swiftApi!.content).toContain('QueryParameterSpec(name: "json_filter", value: jsonFilter, style: "form", explode: true, allowReserved: false, contentType: "application/json")');
    expect(swiftApi!.content).toContain('QueryParameterSpec(name: "q", value: q, style: "form", explode: true, allowReserved: true, contentType: nil)');
    expect(swiftApi!.content).toContain('ApiPaths.appendQueryString(ApiPaths.backendPath("/resources"), query)');
    expect(swiftApi!.content).not.toContain('params: [String: Any]? = nil');

    const csharpResult = await new CSharpGenerator().generate({ ...baseConfig, language: 'csharp' }, parameterSerializationSpec);
    const csharpApi = csharpResult.files.find((file) => file.path === 'Api/ResourceApi.cs');
    expect(csharpResult.errors).toEqual([]);
    expect(csharpApi).toBeDefined();
    expect(csharpApi!.content).toContain('public async Task SearchResourcesAsync(List<string> tag, Dictionary<string, object>? filter = null, Dictionary<string, int>? range = null, Dictionary<string, object>? jsonFilter = null, string? q = null)');
    expect(csharpApi!.content).toContain('var queryString = BuildQueryString(new[]');
    expect(csharpApi!.content).toContain('new QueryParameterSpec("tag", tag, "form", true, false, null)');
    expect(csharpApi!.content).toContain('new QueryParameterSpec("filter", filter, "deepObject", true, false, null)');
    expect(csharpApi!.content).toContain('new QueryParameterSpec("json_filter", jsonFilter, "form", true, false, "application/json")');
    expect(csharpApi!.content).toContain('new QueryParameterSpec("q", q, "form", true, true, null)');
    expect(csharpApi!.content).toContain('ApiPaths.AppendQueryString(ApiPaths.BackendPath("/resources"), queryString)');
    expect(csharpApi!.content).not.toContain('Dictionary<string, object>? query = null');

    const rustResult = await new RustGenerator().generate({ ...baseConfig, language: 'rust' }, parameterSerializationSpec);
    const rustApi = rustResult.files.find((file) => file.path === 'src/api/resource.rs');
    expect(rustResult.errors).toEqual([]);
    expect(rustApi).toBeDefined();
    expect(rustApi!.content).toContain('pub async fn search_resources(&self, tag: &[String], filter: Option<&serde_json::Value>, range: Option<&std::collections::HashMap<String, i64>>, json_filter: Option<&serde_json::Value>, q: Option<&str>) -> Result<(), SdkworkError>');
    expect(rustApi!.content).toContain('let query = build_query_string(&[');
    expect(rustApi!.content).toContain('QueryParameterSpec::new("tag", tag, "form", true, false, None)');
    expect(rustApi!.content).toContain('QueryParameterSpec::new("filter", filter, "deepObject", true, false, None)');
    expect(rustApi!.content).toContain('QueryParameterSpec::new("json_filter", json_filter, "form", true, false, Some("application/json"))');
    expect(rustApi!.content).toContain('QueryParameterSpec::new("q", q, "form", true, true, None)');
    expect(rustApi!.content).toContain('append_query_string(backend_path(&"/resources".to_string()), &query)');
    expect(rustApi!.content).not.toContain('query: Option<&QueryParams>');

    const phpResult = await new PhpGenerator().generate({ ...baseConfig, language: 'php' }, parameterSerializationSpec);
    const phpApi = phpResult.files.find((file) => file.path === 'src/Api/Resource.php');
    expect(phpResult.errors).toEqual([]);
    expect(phpApi).toBeDefined();
    expect(phpApi!.content).toContain('public function searchResources(array $tag, ?array $filter = null, ?array $range = null, ?array $jsonFilter = null, ?string $q = null): void');
    expect(phpApi!.content).toContain('$query = $this->buildQueryString([');
    expect(phpApi!.content).toContain("new QueryParameterSpec('tag', $tag, 'form', true, false, null)");
    expect(phpApi!.content).toContain("new QueryParameterSpec('filter', $filter, 'deepObject', true, false, null)");
    expect(phpApi!.content).toContain("new QueryParameterSpec('json_filter', $jsonFilter, 'form', true, false, 'application/json')");
    expect(phpApi!.content).toContain("new QueryParameterSpec('q', $q, 'form', true, true, null)");
    expect(phpApi!.content).toContain('$path = $this->appendQueryString($path, $query);');
    expect(phpApi!.content).not.toContain('array $params = []');

    const rubyResult = await new RubyGenerator().generate({ ...baseConfig, language: 'ruby' }, parameterSerializationSpec);
    const rubyApi = rubyResult.files.find((file) => file.path === 'lib/sdkwork/backend_sdk/api/resource.rb');
    expect(rubyResult.errors).toEqual([]);
    expect(rubyApi).toBeDefined();
    expect(rubyApi!.content).toContain('def search_resources(tag, filter: nil, range: nil, json_filter: nil, q: nil)');
    expect(rubyApi!.content).toContain('query = build_query_string([');
    expect(rubyApi!.content).toContain("QueryParameterSpec.new('tag', tag, 'form', true, false, nil)");
    expect(rubyApi!.content).toContain("QueryParameterSpec.new('filter', filter, 'deepObject', true, false, nil)");
    expect(rubyApi!.content).toContain("QueryParameterSpec.new('json_filter', json_filter, 'form', true, false, 'application/json')");
    expect(rubyApi!.content).toContain("QueryParameterSpec.new('q', q, 'form', true, true, nil)");
    expect(rubyApi!.content).toContain('path = append_query_string(path, query)');
    expect(rubyApi!.content).not.toContain('params: {}');
  });

  it('should generate named OpenAPI query parameters for simple primitive query schemas across SDK languages', async () => {
    const simpleQuerySpec: ApiSpec = {
      openapi: '3.2.0',
      info: { title: 'Simple Query Parameter API', version: '1.0.0' },
      paths: {
        '/resources': {
          get: {
            operationId: 'listResources',
            tags: ['Resource'],
            parameters: [
              { name: 'page', in: 'query', required: true, schema: { type: 'integer' } },
              { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
              { name: 'sort', in: 'query', required: false, schema: { type: 'string' } },
            ],
            responses: { '204': { description: 'No content' } },
          },
        },
      },
      components: { schemas: {} },
    };

    const tsResult = await new TypeScriptGenerator().generate(baseConfig, simpleQuerySpec);
    const tsApi = getGeneratedFile(tsResult.files, 'src/api/resource.ts');
    expect(tsResult.errors).toEqual([]);
    expect(tsApi.content).toContain('export interface ResourceListResourcesParams');
    expect(tsApi.content).toContain('page: number;');
    expect(tsApi.content).toContain('limit?: number;');
    expect(tsApi.content).toContain('sort?: string;');
    expect(tsApi.content).toContain('async listResources(params: ResourceListResourcesParams): Promise<void>');
    expect(tsApi.content).toContain('const query = buildQueryString([');
    expect(tsApi.content).toContain("{ name: 'page', value: params.page, style: 'form', explode: true, allowReserved: false },");
    expect(tsApi.content).toContain('appendQueryString(backendApiPath(`/resources`), query)');
    expect(tsApi.content).not.toContain('params?: QueryParams');

    const pythonResult = await new PythonGenerator().generate({ ...baseConfig, language: 'python' }, simpleQuerySpec);
    const pythonApi = getGeneratedFile(pythonResult.files, 'sdkwork_backend_sdk/api/resource.py');
    expect(pythonResult.errors).toEqual([]);
    expect(pythonApi.content).toContain('def list_resources(self, page: int, limit: Optional[int] = None, sort: Optional[str] = None) -> None:');
    expect(pythonApi.content).toContain('query = build_query_string([');
    expect(pythonApi.content).toContain("{'name': 'page', 'value': page, 'style': 'form', 'explode': True, 'allow_reserved': False},");
    expect(pythonApi.content).toContain('_append_query_string(f"/api/v1/resources", query)');
    expect(pythonApi.content).not.toContain('params: Optional[Dict[str, Any]] = None');

    const goResult = await new GoGenerator().generate({ ...baseConfig, language: 'go' }, simpleQuerySpec);
    const goApi = getGeneratedFile(goResult.files, 'api/resource.go');
    expect(goResult.errors).toEqual([]);
    expect(goApi.content).toContain('func (a *ResourceApi) ListResources(page int, limit *int, sort *string) (struct{}, error)');
    expect(goApi.content).toContain('query := BuildQueryString([]QueryParameterSpec{');
    expect(goApi.content).toContain('{Name: "page", Value: page, Style: "form", Explode: true, AllowReserved: false}');
    expect(goApi.content).toContain('AppendQueryString(BackendApiPath("/resources"), query)');
    expect(goApi.content).not.toContain('query map[string]interface{}');

    const javaResult = await new JavaGenerator().generate({ ...baseConfig, language: 'java' }, simpleQuerySpec);
    const javaApi = getGeneratedFile(javaResult.files, 'src/main/java/com/sdkwork/backend/api/ResourceApi.java');
    expect(javaResult.errors).toEqual([]);
    expect(javaApi.content).toContain('public Void listResources(Integer page, Integer limit, String sort) throws Exception');
    expect(javaApi.content).toContain('String query = buildQueryString(List.of(');
    expect(javaApi.content).toContain('new QueryParameterSpec("page", page, "form", true, false, null)');
    expect(javaApi.content).toContain('ApiPaths.appendQueryString(ApiPaths.backendPath("/resources"), query)');
    expect(javaApi.content).not.toContain('Map<String, Object> params');

    const kotlinResult = await new KotlinGenerator().generate({ ...baseConfig, language: 'kotlin' }, simpleQuerySpec);
    const kotlinApi = getGeneratedFile(kotlinResult.files, 'src/main/kotlin/com/sdkwork/backend/api/ResourceApi.kt');
    expect(kotlinResult.errors).toEqual([]);
    expect(kotlinApi.content).toContain('suspend fun listResources(page: Int, limit: Int? = null, sort: String? = null): Unit');
    expect(kotlinApi.content).toContain('val query = buildQueryString(listOf(');
    expect(kotlinApi.content).toContain('QueryParameterSpec("page", page, "form", true, false, null)');
    expect(kotlinApi.content).toContain('ApiPaths.appendQueryString(ApiPaths.backendPath("/resources"), query)');
    expect(kotlinApi.content).not.toContain('params: Map<String, Any>? = null');

    const dartCases = [
      {
        language: 'dart',
        result: await new DartGenerator().generate({ ...baseConfig, language: 'dart' }, simpleQuerySpec),
      },
      {
        language: 'flutter',
        result: await new FlutterGenerator().generate({ ...baseConfig, language: 'flutter' }, simpleQuerySpec),
      },
    ];
    for (const testCase of dartCases) {
      const apiFile = getGeneratedFile(testCase.result.files, 'lib/src/api/resource.dart');
      expect(testCase.result.errors, testCase.language).toEqual([]);
      expect(apiFile.content, testCase.language).toContain('Future<void> listResources(int page, [int? limit, String? sort]) async {');
      expect(apiFile.content, testCase.language).toContain('final query = buildQueryString([');
      expect(apiFile.content, testCase.language).toContain("QueryParameterSpec('page', page, 'form', true, false, null)");
      expect(apiFile.content, testCase.language).toContain("ApiPaths.appendQueryString(ApiPaths.backendPath('/resources'), query)");
      expect(apiFile.content, testCase.language).not.toContain('Map<String, dynamic>? params');
    }

    const swiftResult = await new SwiftGenerator().generate({ ...baseConfig, language: 'swift' }, simpleQuerySpec);
    const swiftApi = getGeneratedFile(swiftResult.files, 'Sources/API/ResourceApi.swift');
    expect(swiftResult.errors).toEqual([]);
    expect(swiftApi.content).toContain('public func listResources(page: Int, limit: Int? = nil, sort: String? = nil) async throws -> Void');
    expect(swiftApi.content).toContain('let query = buildQueryString([');
    expect(swiftApi.content).toContain('QueryParameterSpec(name: "page", value: page, style: "form", explode: true, allowReserved: false, contentType: nil)');
    expect(swiftApi.content).toContain('ApiPaths.appendQueryString(ApiPaths.backendPath("/resources"), query)');
    expect(swiftApi.content).not.toContain('params: [String: Any]? = nil');

    const csharpResult = await new CSharpGenerator().generate({ ...baseConfig, language: 'csharp' }, simpleQuerySpec);
    const csharpApi = getGeneratedFile(csharpResult.files, 'Api/ResourceApi.cs');
    expect(csharpResult.errors).toEqual([]);
    expect(csharpApi.content).toContain('public async Task ListResourcesAsync(int page, int? limit = null, string? sort = null)');
    expect(csharpApi.content).toContain('var queryString = BuildQueryString(new[]');
    expect(csharpApi.content).toContain('new QueryParameterSpec("page", page, "form", true, false, null)');
    expect(csharpApi.content).toContain('ApiPaths.AppendQueryString(ApiPaths.BackendPath("/resources"), queryString)');
    expect(csharpApi.content).not.toContain('Dictionary<string, object>? query = null');

    const rustResult = await new RustGenerator().generate({ ...baseConfig, language: 'rust' }, simpleQuerySpec);
    const rustApi = getGeneratedFile(rustResult.files, 'src/api/resource.rs');
    expect(rustResult.errors).toEqual([]);
    expect(rustApi.content).toContain('pub async fn list_resources(&self, page: i64, limit: Option<i64>, sort: Option<&str>) -> Result<(), SdkworkError>');
    expect(rustApi.content).toContain('let query = build_query_string(&[');
    expect(rustApi.content).toContain('QueryParameterSpec::new("page", page, "form", true, false, None)');
    expect(rustApi.content).toContain('append_query_string(backend_path(&"/resources".to_string()), &query)');
    expect(rustApi.content).not.toContain('query: Option<&QueryParams>');

    const phpResult = await new PhpGenerator().generate({ ...baseConfig, language: 'php' }, simpleQuerySpec);
    const phpApi = getGeneratedFile(phpResult.files, 'src/Api/Resource.php');
    expect(phpResult.errors).toEqual([]);
    expect(phpApi.content).toContain('public function listResources(int $page, ?int $limit = null, ?string $sort = null): void');
    expect(phpApi.content).toContain('$query = $this->buildQueryString([');
    expect(phpApi.content).toContain("new QueryParameterSpec('page', $page, 'form', true, false, null)");
    expect(phpApi.content).toContain('$path = $this->appendQueryString($path, $query);');
    expect(phpApi.content).not.toContain('array $params = []');

    const rubyResult = await new RubyGenerator().generate({ ...baseConfig, language: 'ruby' }, simpleQuerySpec);
    const rubyApi = getGeneratedFile(rubyResult.files, 'lib/sdkwork/backend_sdk/api/resource.rb');
    expect(rubyResult.errors).toEqual([]);
    expect(rubyApi.content).toContain('def list_resources(page, limit: nil, sort: nil)');
    expect(rubyApi.content).toContain('query = build_query_string([');
    expect(rubyApi.content).toContain("QueryParameterSpec.new('page', page, 'form', true, false, nil)");
    expect(rubyApi.content).toContain('path = append_query_string(path, query)');
    expect(rubyApi.content).not.toContain('params: {}');
  });

  it('should generate named header and cookie parameters across SDK languages', async () => {
    const cases = [
      {
        generator: new PythonGenerator(),
        config: { ...baseConfig, language: 'python' as const },
        apiPath: 'sdkwork_backend_sdk/api/resource.py',
        expected: [
          'def list_resources(self, x_trace_id: str, session_id: Optional[str] = None) -> None:',
          'request_headers = build_request_headers(',
          "'X-Trace-Id': {'value': x_trace_id, 'style': 'simple', 'explode': False}",
          "'session_id': {'value': session_id, 'style': 'form', 'explode': True}",
          'headers=request_headers',
        ],
        forbidden: ['headers: Optional[Dict[str, str]] = None'],
      },
      {
        generator: new DartGenerator(),
        config: { ...baseConfig, language: 'dart' as const },
        apiPath: 'lib/src/api/resource.dart',
        expected: [
          'Future<void> listResources(String xTraceId, [String? sessionId]) async {',
          'final requestHeaders = buildRequestHeaders(',
          "'X-Trace-Id': HeaderParameterSpec(xTraceId, 'simple', false, null)",
          "'session_id': HeaderParameterSpec(sessionId, 'form', true, null)",
          'headers: requestHeaders',
        ],
        forbidden: ['Map<String, String>? headers'],
      },
      {
        generator: new FlutterGenerator(),
        config: { ...baseConfig, language: 'flutter' as const },
        apiPath: 'lib/src/api/resource.dart',
        expected: [
          'Future<void> listResources(String xTraceId, [String? sessionId]) async {',
          'final requestHeaders = buildRequestHeaders(',
          "'X-Trace-Id': HeaderParameterSpec(xTraceId, 'simple', false, null)",
          "'session_id': HeaderParameterSpec(sessionId, 'form', true, null)",
          'headers: requestHeaders',
        ],
        forbidden: ['Map<String, String>? headers'],
      },
      {
        generator: new GoGenerator(),
        config: { ...baseConfig, language: 'go' as const },
        apiPath: 'api/resource.go',
        expected: [
          'func (a *ResourceApi) ListResources(xTraceId string, sessionId *string)',
          'headers := BuildRequestHeaders(',
          '"X-Trace-Id": ParameterSpec{Value: xTraceId, Style: "simple", Explode: false}',
          '"session_id": ParameterSpec{Value: func() interface{} { if sessionId == nil { return nil }; return *sessionId }(), Style: "form", Explode: true}',
          'a.client.Get(BackendApiPath("/resources"), nil, headers)',
        ],
        forbidden: ['headers map[string]string'],
      },
      {
        generator: new JavaGenerator(),
        config: { ...baseConfig, language: 'java' as const },
        apiPath: 'src/main/java/com/sdkwork/backend/api/ResourceApi.java',
        expected: [
          'public Void listResources(String xTraceId, String sessionId)',
          'Map<String, String> requestHeaders = buildRequestHeaders(',
          'Map.of("X-Trace-Id", new HeaderParameterSpec(xTraceId, "simple", false, null))',
          'Map.of("session_id", new HeaderParameterSpec(sessionId, "form", true, null))',
          'client.get(ApiPaths.backendPath("/resources"), null, requestHeaders)',
        ],
        forbidden: ['Map<String, String> headers'],
      },
      {
        generator: new KotlinGenerator(),
        config: { ...baseConfig, language: 'kotlin' as const },
        apiPath: 'src/main/kotlin/com/sdkwork/backend/api/ResourceApi.kt',
        expected: [
          'suspend fun listResources(xTraceId: String, sessionId: String? = null)',
          'val requestHeaders = buildRequestHeaders(',
          '"X-Trace-Id" to HeaderParameterSpec(xTraceId, "simple", false, null)',
          '"session_id" to HeaderParameterSpec(sessionId, "form", true, null)',
          'client.get(ApiPaths.backendPath("/resources"), null, requestHeaders)',
        ],
        forbidden: ['headers: Map<String, String>? = null'],
      },
      {
        generator: new SwiftGenerator(),
        config: { ...baseConfig, language: 'swift' as const },
        apiPath: 'Sources/API/ResourceApi.swift',
        expected: [
          'public func listResources(xTraceId: String, sessionId: String? = nil) async throws -> Void',
          'let requestHeaders = buildRequestHeaders(',
          '"X-Trace-Id": HeaderParameterSpec(value: xTraceId, style: "simple", explode: false, contentType: nil)',
          '"session_id": HeaderParameterSpec(value: sessionId, style: "form", explode: true, contentType: nil)',
          'headers: requestHeaders',
        ],
        forbidden: ['headers: [String: String]? = nil'],
      },
      {
        generator: new CSharpGenerator(),
        config: { ...baseConfig, language: 'csharp' as const },
        apiPath: 'Api/ResourceApi.cs',
        expected: [
          'public async Task ListResourcesAsync(string xTraceId, string? sessionId = null)',
          'var requestHeaders = BuildRequestHeaders(',
          '["X-Trace-Id"] = new HeaderParameterSpec(xTraceId, "simple", false, null)',
          '["session_id"] = new HeaderParameterSpec(sessionId, "form", true, null)',
          '_client.GetAsync<object>(ApiPaths.BackendPath("/resources"), null, requestHeaders)',
        ],
        forbidden: ['Dictionary<string, string>? headers = null'],
      },
      {
        generator: new RustGenerator(),
        config: { ...baseConfig, language: 'rust' as const },
        apiPath: 'src/api/resource.rs',
        expected: [
          'pub async fn list_resources(&self, x_trace_id: &str, session_id: Option<&str>) -> Result<(), SdkworkError>',
          'let headers = build_request_headers(',
          '("X-Trace-Id", HeaderParameterSpec::new(x_trace_id, "simple", false, None))',
          '("session_id", HeaderParameterSpec::new(session_id, "form", true, None))',
          'self.client.get(&path, None, headers.as_ref()).await',
        ],
        forbidden: ['headers: Option<&RequestHeaders>'],
      },
      {
        generator: new PhpGenerator(),
        config: { ...baseConfig, language: 'php' as const },
        apiPath: 'src/Api/Resource.php',
        expected: [
          'public function listResources(string $xTraceId, ?string $sessionId = null): void',
          '$requestHeaders = $this->buildRequestHeaders(',
          "'X-Trace-Id' => new HeaderParameterSpec($xTraceId, 'simple', false, null)",
          "'session_id' => new HeaderParameterSpec($sessionId, 'form', true, null)",
          "'headers' => $requestHeaders",
        ],
        forbidden: ['array $headers = []'],
      },
      {
        generator: new RubyGenerator(),
        config: { ...baseConfig, language: 'ruby' as const },
        apiPath: 'lib/sdkwork/backend_sdk/api/resource.rb',
        expected: [
          'def list_resources(x_trace_id, session_id: nil)',
          'request_headers = build_request_headers(',
          "'X-Trace-Id' => HeaderParameterSpec.new(x_trace_id, 'simple', false, nil)",
          "'session_id' => HeaderParameterSpec.new(session_id, 'form', true, nil)",
          'options[:headers] = request_headers unless request_headers.empty?',
        ],
        forbidden: ['headers: {}'],
      },
    ];

    for (const testCase of cases) {
      const result = await testCase.generator.generate(testCase.config, headerCookieParameterSpec);
      const apiFile = result.files.find((file) => file.path === testCase.apiPath);

      expect(result.errors, testCase.config.language).toEqual([]);
      expect(apiFile, testCase.config.language).toBeDefined();
      for (const expected of testCase.expected) {
        expect(apiFile!.content, `${testCase.config.language}: ${expected}`).toContain(expected);
      }
      for (const forbidden of testCase.forbidden) {
        expect(apiFile!.content, `${testCase.config.language}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('should serialize Rust scalar header and cookie parameters instead of requiring string references', async () => {
    const result = await new RustGenerator().generate({ ...baseConfig, language: 'rust' }, scalarHeaderCookieParameterSpec);
    const rustApi = getGeneratedFile(result.files, 'src/api/resource.rs');

    expect(result.errors).toEqual([]);
    expect(rustApi.content).toContain('pub async fn list_resources(&self, x_retry_count: i64, debug_mode: Option<bool>) -> Result<(), SdkworkError>');
    expect(rustApi.content).toContain('("X-Retry-Count", HeaderParameterSpec::new(x_retry_count, "simple", false, None))');
    expect(rustApi.content).toContain('("debug_mode", HeaderParameterSpec::new(debug_mode, "form", true, None))');
    expect(rustApi.content).toContain('fn build_request_headers(headers: &[(&str, HeaderParameterSpec)], cookies: &[(&str, HeaderParameterSpec)])');
    expect(rustApi.content).toContain('fn serialize_header_parameter(parameter: &HeaderParameterSpec) -> Option<String>');
    expect(rustApi.content).not.toContain('x_retry_count: &str');
    expect(rustApi.content).not.toContain('debug_mode: Option<&str>');
  });

  it('should generate OpenAPI path header and cookie parameter serialization metadata across SDK languages', async () => {
    const cases = [
      {
        generator: new TypeScriptGenerator(),
        config: baseConfig,
        apiPath: 'src/api/resource.ts',
        expected: [
          'export interface ResourceReadSerializedParams',
          'xTraceParts: Record<string, string>;',
          'session?: Record<string, unknown>;',
          'async readSerialized(tenant: string, labels: Record<string, string>, matrix: string[], params: ResourceReadSerializedParams): Promise<void>',
          'serializePathParameter(tenant, { name: \'tenant\', style: \'simple\', explode: false })',
          'serializePathParameter(labels, { name: \'labels\', style: \'label\', explode: true })',
          'serializePathParameter(matrix, { name: \'matrix\', style: \'matrix\', explode: false })',
          "buildRequestHeaders(",
          "'X-Trace-Parts': { value: params.xTraceParts, style: 'simple', explode: true }",
          "session: { value: params.session, style: 'form', explode: false, contentType: 'application/json' }",
        ],
        forbidden: ['/${tenant}/${labels}/${matrix}'],
      },
      {
        generator: new PythonGenerator(),
        config: { ...baseConfig, language: 'python' as const },
        apiPath: 'sdkwork_backend_sdk/api/resource.py',
        expected: [
          'def read_serialized(self, tenant: str, labels: Dict[str, str], matrix: List[str], x_trace_parts: Dict[str, str], session: Optional[Dict[str, Any]] = None) -> None:',
          "serialize_path_parameter(tenant, {'name': 'tenant', 'style': 'simple', 'explode': False})",
          "serialize_path_parameter(labels, {'name': 'labels', 'style': 'label', 'explode': True})",
          "serialize_path_parameter(matrix, {'name': 'matrix', 'style': 'matrix', 'explode': False})",
          'request_headers = build_request_headers(',
          "'X-Trace-Parts': {'value': x_trace_parts, 'style': 'simple', 'explode': True}",
          "'session': {'value': session, 'style': 'form', 'explode': False, 'content_type': 'application/json'}",
        ],
        forbidden: ['{tenant}/{labels}/{matrix}'],
      },
      {
        generator: new GoGenerator(),
        config: { ...baseConfig, language: 'go' as const },
        apiPath: 'api/resource.go',
        expected: [
          'func (a *ResourceApi) ReadSerialized(tenant string, labels map[string]string, matrix []string, xTraceParts map[string]string, session *map[string]interface{}) (struct{}, error)',
          'SerializePathParameter(tenant, PathParameterSpec{Name: "tenant", Style: "simple", Explode: false})',
          'SerializePathParameter(labels, PathParameterSpec{Name: "labels", Style: "label", Explode: true})',
          'SerializePathParameter(matrix, PathParameterSpec{Name: "matrix", Style: "matrix", Explode: false})',
          'headers := BuildRequestHeaders(',
          '"X-Trace-Parts": ParameterSpec{Value: xTraceParts, Style: "simple", Explode: true}',
          '"session": ParameterSpec{Value: func() interface{} { if session == nil { return nil }; return *session }(), Style: "form", Explode: false, ContentType: "application/json"}',
        ],
        forbidden: ['fmt.Sprintf("/resources/%s/%s/%s", tenant, labels, matrix)'],
      },
      {
        generator: new JavaGenerator(),
        config: { ...baseConfig, language: 'java' as const },
        apiPath: 'src/main/java/com/sdkwork/backend/api/ResourceApi.java',
        expected: [
          'public Void readSerialized(String tenant, Map<String, String> labels, List<String> matrix, Map<String, String> xTraceParts, Map<String, Object> session) throws Exception',
          'serializePathParameter(tenant, new PathParameterSpec("tenant", "simple", false))',
          'serializePathParameter(labels, new PathParameterSpec("labels", "label", true))',
          'serializePathParameter(matrix, new PathParameterSpec("matrix", "matrix", false))',
          'Map<String, String> requestHeaders = buildRequestHeaders(',
          'new HeaderParameterSpec(xTraceParts, "simple", true, null)',
          'new HeaderParameterSpec(session, "form", false, "application/json")',
        ],
        forbidden: ['"/resources/" + tenant + "/" + labels + "/" + matrix + "'],
      },
      {
        generator: new KotlinGenerator(),
        config: { ...baseConfig, language: 'kotlin' as const },
        apiPath: 'src/main/kotlin/com/sdkwork/backend/api/ResourceApi.kt',
        expected: [
          'suspend fun readSerialized(tenant: String, labels: Map<String, String>, matrix: List<String>, xTraceParts: Map<String, String>, session: Map<String, Any>? = null): Unit',
          'serializePathParameter(tenant, PathParameterSpec("tenant", "simple", false))',
          'serializePathParameter(labels, PathParameterSpec("labels", "label", true))',
          'serializePathParameter(matrix, PathParameterSpec("matrix", "matrix", false))',
          'val requestHeaders = buildRequestHeaders(',
          'HeaderParameterSpec(xTraceParts, "simple", true, null)',
          'HeaderParameterSpec(session, "form", false, "application/json")',
        ],
        forbidden: ['"/resources/$tenant/$labels/$matrix"'],
      },
      {
        generator: new DartGenerator(),
        config: { ...baseConfig, language: 'dart' as const },
        apiPath: 'lib/src/api/resource.dart',
        expected: [
          'Future<void> readSerialized(String tenant, Map<String, String> labels, List<String> matrix, Map<String, String> xTraceParts, [Map<String, dynamic>? session]) async {',
          "serializePathParameter(tenant, const PathParameterSpec('tenant', 'simple', false))",
          "serializePathParameter(labels, const PathParameterSpec('labels', 'label', true))",
          "serializePathParameter(matrix, const PathParameterSpec('matrix', 'matrix', false))",
          'final requestHeaders = buildRequestHeaders(',
          "'X-Trace-Parts': HeaderParameterSpec(xTraceParts, 'simple', true, null)",
          "'session': HeaderParameterSpec(session, 'form', false, 'application/json')",
        ],
        forbidden: ["'/resources/$tenant/$labels/$matrix'"],
      },
      {
        generator: new FlutterGenerator(),
        config: { ...baseConfig, language: 'flutter' as const },
        apiPath: 'lib/src/api/resource.dart',
        expected: [
          'Future<void> readSerialized(String tenant, Map<String, String> labels, List<String> matrix, Map<String, String> xTraceParts, [Map<String, dynamic>? session]) async {',
          "serializePathParameter(tenant, const PathParameterSpec('tenant', 'simple', false))",
          "serializePathParameter(labels, const PathParameterSpec('labels', 'label', true))",
          "serializePathParameter(matrix, const PathParameterSpec('matrix', 'matrix', false))",
          'final requestHeaders = buildRequestHeaders(',
          "'X-Trace-Parts': HeaderParameterSpec(xTraceParts, 'simple', true, null)",
          "'session': HeaderParameterSpec(session, 'form', false, 'application/json')",
        ],
        forbidden: ["'/resources/$tenant/$labels/$matrix'"],
      },
      {
        generator: new SwiftGenerator(),
        config: { ...baseConfig, language: 'swift' as const },
        apiPath: 'Sources/API/ResourceApi.swift',
        expected: [
          'public func readSerialized(tenant: String, labels: [String: String], matrix: [String], xTraceParts: [String: String], session: [String: Any]? = nil) async throws -> Void',
          'serializePathParameter(tenant, PathParameterSpec(name: "tenant", style: "simple", explode: false))',
          'serializePathParameter(labels, PathParameterSpec(name: "labels", style: "label", explode: true))',
          'serializePathParameter(matrix, PathParameterSpec(name: "matrix", style: "matrix", explode: false))',
          'let requestHeaders = buildRequestHeaders(',
          '"X-Trace-Parts": HeaderParameterSpec(value: xTraceParts, style: "simple", explode: true, contentType: nil)',
          '"session": HeaderParameterSpec(value: session, style: "form", explode: false, contentType: "application/json")',
        ],
        forbidden: ['"/resources/\\(tenant)/\\(labels)/\\(matrix)"'],
      },
      {
        generator: new CSharpGenerator(),
        config: { ...baseConfig, language: 'csharp' as const },
        apiPath: 'Api/ResourceApi.cs',
        expected: [
          'public async Task ReadSerializedAsync(string tenant, Dictionary<string, string> labels, List<string> matrix, Dictionary<string, string> xTraceParts, Dictionary<string, object>? session = null)',
          'SerializePathParameter(tenant, new PathParameterSpec("tenant", "simple", false))',
          'SerializePathParameter(labels, new PathParameterSpec("labels", "label", true))',
          'SerializePathParameter(matrix, new PathParameterSpec("matrix", "matrix", false))',
          'var requestHeaders = BuildRequestHeaders(',
          'new HeaderParameterSpec(xTraceParts, "simple", true, null)',
          'new HeaderParameterSpec(session, "form", false, "application/json")',
        ],
        forbidden: ['$"/resources/{tenant}/{labels}/{matrix}"'],
      },
      {
        generator: new RustGenerator(),
        config: { ...baseConfig, language: 'rust' as const },
        apiPath: 'src/api/resource.rs',
        expected: [
          'pub async fn read_serialized(&self, tenant: &str, labels: &std::collections::HashMap<String, String>, matrix: &[String], x_trace_parts: &std::collections::HashMap<String, String>, session: Option<&serde_json::Value>) -> Result<(), SdkworkError>',
          'serialize_path_parameter(tenant, PathParameterSpec::new("tenant", "simple", false))',
          'serialize_path_parameter(labels, PathParameterSpec::new("labels", "label", true))',
          'serialize_path_parameter(matrix, PathParameterSpec::new("matrix", "matrix", false))',
          'let headers = build_request_headers(',
          '("X-Trace-Parts", HeaderParameterSpec::new(x_trace_parts, "simple", true, None))',
          '("session", HeaderParameterSpec::new(session, "form", false, Some("application/json")))',
        ],
        forbidden: ['format!("/resources/{}/{}/{}", tenant, labels, matrix)'],
      },
      {
        generator: new PhpGenerator(),
        config: { ...baseConfig, language: 'php' as const },
        apiPath: 'src/Api/Resource.php',
        expected: [
          'public function readSerialized(string $tenant, array $labels, array $matrix, array $xTraceParts, ?array $session = null): void',
          "new PathParameterSpec('tenant', 'simple', false)",
          "new PathParameterSpec('labels', 'label', true)",
          "new PathParameterSpec('matrix', 'matrix', false)",
          '$requestHeaders = $this->buildRequestHeaders(',
          "new HeaderParameterSpec($xTraceParts, 'simple', true, null)",
          "new HeaderParameterSpec($session, 'form', false, 'application/json')",
        ],
        forbidden: ["rawurlencode((string) $value)"],
      },
      {
        generator: new RubyGenerator(),
        config: { ...baseConfig, language: 'ruby' as const },
        apiPath: 'lib/sdkwork/backend_sdk/api/resource.rb',
        expected: [
          'def read_serialized(tenant, labels, matrix, x_trace_parts, session: nil)',
          "PathParameterSpec.new('tenant', 'simple', false)",
          "PathParameterSpec.new('labels', 'label', true)",
          "PathParameterSpec.new('matrix', 'matrix', false)",
          'request_headers = build_request_headers(',
          "HeaderParameterSpec.new(x_trace_parts, 'simple', true, nil)",
          "HeaderParameterSpec.new(session, 'form', false, 'application/json')",
        ],
        forbidden: ['CGI.escape(value.to_s)'],
      },
    ];

    for (const testCase of cases) {
      const result = await testCase.generator.generate(testCase.config, advancedParameterSerializationSpec);
      const apiFile = getGeneratedFile(result.files, testCase.apiPath);

      expect(result.errors, testCase.config.language).toEqual([]);
      for (const expected of testCase.expected) {
        expect(apiFile.content, `${testCase.config.language}: ${expected}`).toContain(expected);
      }
      for (const forbidden of testCase.forbidden) {
        expect(apiFile.content, `${testCase.config.language}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('should include Go collection conversion helpers when only path and header serialization need them', async () => {
    const result = await new GoGenerator().generate({ ...baseConfig, language: 'go' }, advancedParameterSerializationSpec);
    const apiFile = getGeneratedFile(result.files, 'api/resource.go');

    expect(result.errors).toEqual([]);
    expect(apiFile.content).toContain('SerializePathParameter(labels, PathParameterSpec{Name: "labels", Style: "label", Explode: true})');
    expect(apiFile.content).toContain('func stringSliceToInterface(values []string) []interface{}');
    expect(apiFile.content).toContain('func stringMapToInterface(values map[string]string) map[string]interface{}');
    expect(apiFile.content).toContain('func intSliceToInterface(values []int) []interface{}');
    expect(apiFile.content).toContain('func intMapToInterface(values map[string]int) map[string]interface{}');
  });

  it('should generate first-class SSE streaming support across SDK languages', async () => {
    const aiConfig = {
      ...baseConfig,
      sdkType: 'ai' as const,
      apiPrefix: '/v1',
      name: 'SdkworkAI',
    };

    const tsResult = await new TypeScriptGenerator().generate({ ...aiConfig, language: 'typescript' }, eventStreamResponseSpec);
    const tsApi = getGeneratedFile(tsResult.files, 'src/api/chat.ts');
    const tsHttp = getGeneratedFile(tsResult.files, 'src/http/client.ts');
    expect(tsResult.errors).toEqual([]);
    expect(tsApi.content).toContain('async create(body: CreateChatCompletionRequest): Promise<AsyncIterable<ChatCompletionChunk>>');
    expect(tsApi.content).toContain("this.client.streamJson<ChatCompletionChunk>(aiApiPath(`/chat/completions`)");
    expect(tsApi.content).not.toContain('this.client.post<ChatCompletionChunk>');
    expect(tsHttp.content).toContain('async *streamJson<T>(');
    expect(tsHttp.content).toContain("Accept: 'text/event-stream'");
    expect(tsHttp.content).toContain("if (data === '[DONE]')");
    expect(tsHttp.content).toContain('JSON.parse(data) as T');

    const cases = [
      {
        language: 'python',
        result: await new PythonGenerator().generate({ ...aiConfig, language: 'python' }, eventStreamResponseSpec),
        apiPath: 'sdkwork_ai_sdk/api/chat.py',
        httpPath: 'sdkwork_ai_sdk/http_client.py',
        expectedApi: [
          'from typing import Any, Dict, Iterator, List, Optional',
          'def create(self, body: CreateChatCompletionRequest) -> Iterator[ChatCompletionChunk]:',
          "return self._client.stream_json(f\"/v1/chat/completions\", method='POST', json=body)",
        ],
        expectedHttp: [
          'def stream_json(self, path: str, method: str = \'POST\'',
          "headers={'Accept': 'text/event-stream'",
          'for line in response.iter_lines(decode_unicode=True):',
          "if data == '[DONE]':",
          'yield json_module.loads(data)',
        ],
      },
      {
        language: 'go',
        result: await new GoGenerator().generate({ ...aiConfig, language: 'go' }, eventStreamResponseSpec),
        apiPath: 'api/chat.go',
        httpPath: 'http/client.go',
        expectedApi: [
          'func (a *ChatApi) Create(body sdktypes.CreateChatCompletionRequest) (*sdkhttp.SSEStream[sdktypes.ChatCompletionChunk], error)',
          'sdkhttp.Stream[sdktypes.ChatCompletionChunk](a.client, "POST", AiApiPath("/chat/completions"), body, nil, nil, "application/json")',
        ],
        expectedHttp: [
          'type SSEStream[T any] struct',
          'func Stream[T any](',
          'req.Header.Set("Accept", "text/event-stream")',
          'if data == "[DONE]"',
          'json.Unmarshal([]byte(data), &event)',
        ],
      },
      {
        language: 'java',
        result: await new JavaGenerator().generate({ ...aiConfig, language: 'java' }, eventStreamResponseSpec),
        apiPath: 'src/main/java/com/sdkwork/ai/api/ChatApi.java',
        httpPath: 'src/main/java/com/sdkwork/ai/http/HttpClient.java',
        expectedApi: [
          'public Iterable<ChatCompletionChunk> create(CreateChatCompletionRequest body) throws Exception',
          'client.stream("POST", ApiPaths.aiPath("/chat/completions"), body, null, null, "application/json", new TypeReference<ChatCompletionChunk>() {})',
        ],
        expectedHttp: [
          'public <T> Iterable<T> stream(',
          '.addHeader("Accept", "text/event-stream")',
          'if ("[DONE]".equals(data))',
          'mapper.readValue(data, typeReference)',
        ],
      },
      {
        language: 'kotlin',
        result: await new KotlinGenerator().generate({ ...aiConfig, language: 'kotlin' }, eventStreamResponseSpec),
        apiPath: 'src/main/kotlin/com/sdkwork/ai/api/ChatApi.kt',
        httpPath: 'src/main/kotlin/com/sdkwork/ai/http/HttpClient.kt',
        expectedApi: [
          'suspend fun create(body: CreateChatCompletionRequest): Sequence<ChatCompletionChunk>',
          'client.stream("POST", ApiPaths.aiPath("/chat/completions"), body, null, null, "application/json", object : TypeReference<ChatCompletionChunk>() {})',
        ],
        expectedHttp: [
          'fun <T> stream(',
          '.addHeader("Accept", "text/event-stream")',
          'if (data == "[DONE]")',
          'mapper.readValue(data, typeReference)',
        ],
      },
      {
        language: 'dart',
        result: await new DartGenerator().generate({ ...aiConfig, language: 'dart' }, eventStreamResponseSpec),
        apiPath: 'lib/src/api/chat.dart',
        httpPath: 'lib/src/http/client.dart',
        expectedApi: [
          'Stream<ChatCompletionChunk> create(CreateChatCompletionRequest body) {',
          "_client.streamJson(ApiPaths.aiPath('/chat/completions')",
          '.map((event) => ChatCompletionChunk.fromJson(event));',
        ],
        expectedHttp: [
          'Stream<Map<String, dynamic>> streamJson(',
          "'Accept': 'text/event-stream'",
          "if (data == '[DONE]')",
          'jsonDecode(data)',
        ],
      },
      {
        language: 'flutter',
        result: await new FlutterGenerator().generate({ ...aiConfig, language: 'flutter' }, eventStreamResponseSpec),
        apiPath: 'lib/src/api/chat.dart',
        httpPath: 'lib/src/http/client.dart',
        expectedApi: [
          'Stream<ChatCompletionChunk> create(CreateChatCompletionRequest body) {',
          "_client.streamJson(ApiPaths.aiPath('/chat/completions')",
          '.map((event) => ChatCompletionChunk.fromJson(event));',
        ],
        expectedHttp: [
          'Stream<Map<String, dynamic>> streamJson(',
          "'Accept': 'text/event-stream'",
          "if (data == '[DONE]')",
          'jsonDecode(data)',
        ],
      },
      {
        language: 'swift',
        result: await new SwiftGenerator().generate({ ...aiConfig, language: 'swift' }, eventStreamResponseSpec),
        apiPath: 'Sources/API/ChatApi.swift',
        httpPath: 'Sources/HTTP/HttpClient.swift',
        expectedApi: [
          'public func create(body: CreateChatCompletionRequest) throws -> AsyncThrowingStream<ChatCompletionChunk, Error>',
          'client.stream("POST", ApiPaths.aiPath("/chat/completions"), body: body, params: nil, headers: nil, contentType: "application/json", responseType: ChatCompletionChunk.self)',
        ],
        expectedHttp: [
          'public func stream<T: Decodable>(',
          'request.setValue("text/event-stream", forHTTPHeaderField: "Accept")',
          'if data == "[DONE]"',
          'decoder.decode(T.self, from: Data(data.utf8))',
        ],
      },
      {
        language: 'csharp',
        result: await new CSharpGenerator().generate({ ...aiConfig, language: 'csharp' }, eventStreamResponseSpec),
        apiPath: 'Api/ChatApi.cs',
        httpPath: 'Http/HttpClient.cs',
        expectedApi: [
          'public IAsyncEnumerable<Ai.Models.ChatCompletionChunk> CreateAsync(Ai.Models.CreateChatCompletionRequest body)',
          '_client.StreamAsync<Ai.Models.ChatCompletionChunk>("POST", ApiPaths.AiPath("/chat/completions"), body, null, null, "application/json")',
        ],
        expectedHttp: [
          'public async IAsyncEnumerable<T> StreamAsync<T>(',
          'request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"))',
          'if (data == "[DONE]")',
          'JsonSerializer.Deserialize<T>(data)',
        ],
      },
      {
        language: 'rust',
        result: await new RustGenerator().generate({ ...aiConfig, language: 'rust' }, eventStreamResponseSpec),
        apiPath: 'src/api/chat.rs',
        httpPath: 'src/http/client.rs',
        expectedApi: [
          'pub async fn create(&self, body: &CreateChatCompletionRequest) -> Result<SseStream<ChatCompletionChunk>, SdkworkError>',
          'self.client.stream(Method::POST, &path, Some(body), None, None, Some("application/json")).await',
        ],
        expectedHttp: [
          'pub struct SseStream<T>',
          'pub async fn stream<T, B>(',
          'merged_headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream"))',
          'if data == "[DONE]"',
          'serde_json::from_str::<T>(&data)',
        ],
      },
      {
        language: 'php',
        result: await new PhpGenerator().generate({ ...aiConfig, language: 'php' }, eventStreamResponseSpec),
        apiPath: 'src/Api/Chat.php',
        httpPath: 'src/Http/HttpClient.php',
        expectedApi: [
          'public function create(array|CreateChatCompletionRequest $body): \\Generator',
          "$this->client->stream('POST', $path",
          'ChatCompletionChunk::fromArray($event)',
        ],
        expectedHttp: [
          'public function stream(string $method, string $path, array $options = []): \\Generator',
          "'Accept' => 'text/event-stream'",
          "preg_match('/\\r?\\n\\r?\\n/', $buffer",
          "if ($data === '[DONE]')",
          'json_decode($data, true)',
        ],
      },
      {
        language: 'ruby',
        result: await new RubyGenerator().generate({ ...aiConfig, language: 'ruby' }, eventStreamResponseSpec),
        apiPath: 'lib/sdkwork/ai_sdk/api/chat.rb',
        httpPath: 'lib/sdkwork/ai_sdk/http/client.rb',
        expectedApi: [
          'def create(body: nil)',
          '@client.stream(:post, path, **options)',
          'Models::ChatCompletionChunk.from_hash(event)',
        ],
        expectedHttp: [
          'def stream(method, path, query: {}, headers: {}, json: nil, form: nil, multipart: nil)',
          "'Accept' => 'text/event-stream'",
          'split(/\\r?\\n\\r?\\n/)',
          'data = data_lines.join("\\n")',
          "break if data == '[DONE]'",
          'JSON.parse(data)',
        ],
      },
    ];

    for (const testCase of cases) {
      expect(testCase.result.errors, testCase.language).toEqual([]);
      const apiFile = getGeneratedFile(testCase.result.files, testCase.apiPath);
      const httpFile = getGeneratedFile(testCase.result.files, testCase.httpPath);
      for (const expected of testCase.expectedApi) {
        expect(apiFile.content, `${testCase.language}: ${expected}`).toContain(expected);
      }
      for (const expected of testCase.expectedHttp) {
        expect(httpFile.content, `${testCase.language}: ${expected}`).toContain(expected);
      }
    }
  });

  it('should sanitize unsafe path parameters in go java kotlin swift and csharp apis', async () => {
    const goGenerator = new GoGenerator();
    const goResult = await goGenerator.generate({ ...baseConfig, language: 'go' }, pathParameterIdentifierSpec);
    const goApi = goResult.files.find(
      (f) => f.path.startsWith('api/') && f.content.includes('/keyword-model/')
    );

    expect(goApi).toBeDefined();
    expect(goApi!.content).toContain('class string');
    expect(goApi!.content).toContain('userId string');
    expect(goApi!.content).toContain('headers_ string');
    expect(goApi!.content).toContain('xTraceId *string');
    expect(goApi!.content).not.toContain('headers map[string]string');
    expect(goApi!.content).toContain('SerializePathParameter(class, PathParameterSpec{Name: "class", Style: "simple", Explode: false})');
    expect(goApi!.content).toContain('SerializePathParameter(userId, PathParameterSpec{Name: "user-id", Style: "simple", Explode: false})');
    expect(goApi!.content).toContain('SerializePathParameter(headers_, PathParameterSpec{Name: "headers", Style: "simple", Explode: false})');

    const javaGenerator = new JavaGenerator();
    const javaResult = await javaGenerator.generate({ ...baseConfig, language: 'java' }, pathParameterIdentifierSpec);
    const javaApi = javaResult.files.find((f) => f.path.endsWith('/api/KeywordModelApi.java'));

    expect(javaApi).toBeDefined();
    expect(javaApi!.content).toContain('String class_');
    expect(javaApi!.content).toContain('String userId');
    expect(javaApi!.content).toContain('String headers');
    expect(javaApi!.content).toContain('String xTraceId');
    expect(javaApi!.content).not.toContain('Map<String, String> headers');
    expect(javaApi!.content).toContain('serializePathParameter(class_, new PathParameterSpec("class", "simple", false))');
    expect(javaApi!.content).toContain('serializePathParameter(userId, new PathParameterSpec("user-id", "simple", false))');
    expect(javaApi!.content).toContain('serializePathParameter(headers, new PathParameterSpec("headers", "simple", false))');

    const kotlinGenerator = new KotlinGenerator();
    const kotlinResult = await kotlinGenerator.generate(
      { ...baseConfig, language: 'kotlin' },
      pathParameterIdentifierSpec
    );
    const kotlinApi = kotlinResult.files.find((f) => f.path.endsWith('/api/KeywordModelApi.kt'));

    expect(kotlinApi).toBeDefined();
    expect(kotlinApi!.content).toContain('class_: String');
    expect(kotlinApi!.content).toContain('userId: String');
    expect(kotlinApi!.content).toContain('headers: String');
    expect(kotlinApi!.content).toContain('xTraceId: String? = null');
    expect(kotlinApi!.content).not.toContain('headers: Map<String, String>? = null');
    expect(kotlinApi!.content).toContain('serializePathParameter(class_, PathParameterSpec("class", "simple", false))');
    expect(kotlinApi!.content).toContain('serializePathParameter(userId, PathParameterSpec("user-id", "simple", false))');
    expect(kotlinApi!.content).toContain('serializePathParameter(headers, PathParameterSpec("headers", "simple", false))');

    const swiftGenerator = new SwiftGenerator();
    const swiftResult = await swiftGenerator.generate(
      { ...baseConfig, language: 'swift' },
      pathParameterIdentifierSpec
    );
    const swiftApi = swiftResult.files.find((f) => f.path === 'Sources/API/KeywordModelApi.swift');

    expect(swiftApi).toBeDefined();
    expect(swiftApi!.content).toContain('class_: String');
    expect(swiftApi!.content).toContain('userId: String');
    expect(swiftApi!.content).toContain('headers: String');
    expect(swiftApi!.content).toContain('xTraceId: String? = nil');
    expect(swiftApi!.content).not.toContain('headers: [String: String]? = nil');
    expect(swiftApi!.content).toContain('serializePathParameter(class_, PathParameterSpec(name: "class", style: "simple", explode: false))');
    expect(swiftApi!.content).toContain('serializePathParameter(userId, PathParameterSpec(name: "user-id", style: "simple", explode: false))');
    expect(swiftApi!.content).toContain('serializePathParameter(headers, PathParameterSpec(name: "headers", style: "simple", explode: false))');

    const csharpGenerator = new CSharpGenerator();
    const csharpResult = await csharpGenerator.generate(
      { ...baseConfig, language: 'csharp' },
      pathParameterIdentifierSpec
    );
    const csharpApi = csharpResult.files.find((f) => f.path === 'Api/KeywordModelApi.cs');

    expect(csharpApi).toBeDefined();
    expect(csharpApi!.content).toContain('string class_');
    expect(csharpApi!.content).toContain('string userId');
    expect(csharpApi!.content).toContain('string headers');
    expect(csharpApi!.content).toContain('string? xTraceId = null');
    expect(csharpApi!.content).not.toContain('Dictionary<string, string>? headers = null');
    expect(csharpApi!.content).toContain('SerializePathParameter(class_, new PathParameterSpec("class", "simple", false))');
    expect(csharpApi!.content).toContain('SerializePathParameter(userId, new PathParameterSpec("user-id", "simple", false))');
    expect(csharpApi!.content).toContain('SerializePathParameter(headers, new PathParameterSpec("headers", "simple", false))');
  });

  it('should sanitize unsafe path parameters in php ruby dart and flutter apis', async () => {
    const phpGenerator = new PhpGenerator();
    const phpResult = await phpGenerator.generate({ ...baseConfig, language: 'php' }, pathParameterIdentifierSpec);
    const phpApi = phpResult.files.find(
      (f) => f.path.startsWith('src/Api/') && f.content.includes('/keyword-model/')
    );

    expect(phpApi).toBeDefined();
    expect(phpApi!.content).toContain('string $class_');
    expect(phpApi!.content).toContain('string $userId');
    expect(phpApi!.content).toContain('string $headers');
    expect(phpApi!.content).toContain('?string $xTraceId = null');
    expect(phpApi!.content).not.toContain('array $headers = []');
    expect(phpApi!.content).toContain("'class' => $this->serializePathParameter($class_, new PathParameterSpec('class', 'simple', false))");
    expect(phpApi!.content).toContain("'user-id' => $this->serializePathParameter($userId, new PathParameterSpec('user-id', 'simple', false))");
    expect(phpApi!.content).toContain("'headers' => $this->serializePathParameter($headers, new PathParameterSpec('headers', 'simple', false))");

    const rubyGenerator = new RubyGenerator();
    const rubyResult = await rubyGenerator.generate({ ...baseConfig, language: 'ruby' }, pathParameterIdentifierSpec);
    const rubyApi = rubyResult.files.find(
      (f) => f.path.includes('/api/') && f.content.includes('/keyword-model/')
    );

    expect(rubyApi).toBeDefined();
    expect(rubyApi!.content).toContain('def get_keyword_model_by_path(class_, user_id, headers, x_trace_id: nil)');
    expect(rubyApi!.content).toContain("class: serialize_path_parameter(class_, PathParameterSpec.new('class', 'simple', false))");
    expect(rubyApi!.content).toContain("'user-id': serialize_path_parameter(user_id, PathParameterSpec.new('user-id', 'simple', false))");
    expect(rubyApi!.content).toContain("headers: serialize_path_parameter(headers, PathParameterSpec.new('headers', 'simple', false))");

    const dartGenerator = new DartGenerator();
    const dartResult = await dartGenerator.generate({ ...baseConfig, language: 'dart' } as any, pathParameterIdentifierSpec);
    const dartApi = dartResult.files.find(
      (f) => f.path.startsWith('lib/src/api/') && f.content.includes('/keyword-model/')
    );

    expect(dartApi).toBeDefined();
    expect(dartApi!.content).toContain('String class_');
    expect(dartApi!.content).toContain('String userId');
    expect(dartApi!.content).toContain('String headers');
    expect(dartApi!.content).toContain('String? xTraceId');
    expect(dartApi!.content).not.toContain('Map<String, String>? headers');
    expect(dartApi!.content).toContain("serializePathParameter(class_, const PathParameterSpec('class', 'simple', false))");
    expect(dartApi!.content).toContain("serializePathParameter(userId, const PathParameterSpec('user-id', 'simple', false))");
    expect(dartApi!.content).toContain("serializePathParameter(headers, const PathParameterSpec('headers', 'simple', false))");

    const flutterGenerator = new FlutterGenerator();
    const flutterResult = await flutterGenerator.generate(
      { ...baseConfig, language: 'flutter' },
      pathParameterIdentifierSpec
    );
    const flutterApi = flutterResult.files.find(
      (f) => f.path.startsWith('lib/src/api/') && f.content.includes('/keyword-model/')
    );

    expect(flutterApi).toBeDefined();
    expect(flutterApi!.content).toContain('String class_');
    expect(flutterApi!.content).toContain('String userId');
    expect(flutterApi!.content).toContain('String headers');
    expect(flutterApi!.content).toContain('String? xTraceId');
    expect(flutterApi!.content).not.toContain('Map<String, String>? headers');
    expect(flutterApi!.content).toContain("serializePathParameter(class_, const PathParameterSpec('class', 'simple', false))");
    expect(flutterApi!.content).toContain("serializePathParameter(userId, const PathParameterSpec('user-id', 'simple', false))");
    expect(flutterApi!.content).toContain("serializePathParameter(headers, const PathParameterSpec('headers', 'simple', false))");
  });

  it('should sanitize unsafe path parameters in rust apis', async () => {
    const rustGenerator = new RustGenerator();
    const rustResult = await rustGenerator.generate({ ...baseConfig, language: 'rust' } as any, pathParameterIdentifierSpec);
    const rustApi = rustResult.files.find(
      (f) => f.path.startsWith('src/api/') && f.content.includes('/keyword-model/')
    );

    expect(rustApi).toBeDefined();
    expect(rustApi!.content).toContain('class: &str');
    expect(rustApi!.content).toContain('user_id: &str');
    expect(rustApi!.content).toContain('headers_: &str');
    expect(rustApi!.content).toContain('x_trace_id: Option<&str>');
    expect(rustApi!.content).not.toContain('headers: Option<&RequestHeaders>');
    expect(rustApi!.content).toContain('serialize_path_parameter(class, PathParameterSpec::new("class", "simple", false))');
    expect(rustApi!.content).toContain('serialize_path_parameter(user_id, PathParameterSpec::new("user-id", "simple", false))');
    expect(rustApi!.content).toContain('serialize_path_parameter(headers_, PathParameterSpec::new("headers", "simple", false))');
  });

  it('should handle advanced OpenAPI patterns without generation errors', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, securitySpec);
    expect(result.errors.length).toBe(0);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('should force root import for typescript common package overrides', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(
      {
        ...baseConfig,
        language: 'typescript',
        commonPackage: '@sdkwork/sdk-common@^1.0.1|@sdkwork/sdk-common/http',
      },
      securitySpec
    );

    expect(result.errors.length).toBe(0);
    const joined = result.files.map((f) => f.content).join('\n');
    expect(joined).not.toContain('@sdkwork/sdk-common/');
    expect(joined).toContain("from '@sdkwork/sdk-common';");

    const packageJsonFile = result.files.find((f) => f.path === 'package.json');
    expect(packageJsonFile).toBeDefined();
    expect(packageJsonFile!.content).toContain('"@sdkwork/sdk-common": "^1.0.1"');
  });

  it('should default generated typescript common package dependency to the published npm baseline', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(
      {
        ...baseConfig,
        language: 'typescript',
      },
      securitySpec
    );

    expect(result.errors.length).toBe(0);
    const packageJsonFile = result.files.find((f) => f.path === 'package.json');
    expect(packageJsonFile).toBeDefined();
    expect(packageJsonFile!.content).toContain('"@sdkwork/sdk-common": "^1.0.2"');
  });

  it('should hoist inline request and response schemas into explicit operation types across languages', async () => {
    const typeScriptGenerator = new TypeScriptGenerator();
    const tsResult = await typeScriptGenerator.generate(baseConfig, inlineIoSpec);
    const tsApi = tsResult.files.find((f) => f.path === 'src/api/auth.ts');
    expect(tsApi).toBeDefined();
    expect(tsApi!.content).toContain('body: RequestPasswordResetRequest');
    expect(tsApi!.content).toContain('Promise<RequestPasswordResetResponse>');

    const pythonGenerator = new PythonGenerator();
    const pyResult = await pythonGenerator.generate({ ...baseConfig, language: 'python' }, inlineIoSpec);
    const pyApi = pyResult.files.find((f) => f.path.endsWith('/api/auth.py'));
    expect(pyApi).toBeDefined();
    expect(pyApi!.content).toContain('body: RequestPasswordResetRequest');
    expect(pyApi!.content).toContain('-> RequestPasswordResetResponse');

    const javaGenerator = new JavaGenerator();
    const javaResult = await javaGenerator.generate({ ...baseConfig, language: 'java' }, inlineIoSpec);
    const javaApi = javaResult.files.find((f) => f.path.endsWith('/api/AuthApi.java'));
    expect(javaApi).toBeDefined();
    expect(javaApi!.content).toContain('RequestPasswordResetRequest body');
    expect(javaApi!.content).toContain('RequestPasswordResetResponse');
  });

  it('should avoid python package root collisions with sdkwork-common', async () => {
    const generator = new PythonGenerator();
    const result = await generator.generate(
      {
        ...baseConfig,
        language: 'python',
        packageName: '@scope/sdk-work',
      },
      mockSpec
    );
    expect(result.files.some((f) => f.path.startsWith('scope_sdk_work/'))).toBe(true);
    expect(result.files.some((f) => f.path.startsWith('sdkwork/'))).toBe(false);
  });

  it('should generate streamlined python packaging metadata', async () => {
    const generator = new PythonGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'python' }, mockSpec);
    const setupPy = result.files.find((f) => f.path === 'setup.py');
    const pyproject = result.files.find((f) => f.path === 'pyproject.toml');
    const manifest = result.files.find((f) => f.path === 'MANIFEST.in');

    expect(setupPy).toBeDefined();
    expect(setupPy!.content).not.toContain('install_requires');
    expect(setupPy!.content).not.toContain('classifiers');

    expect(pyproject).toBeDefined();
    expect(pyproject!.content).toContain('license = "MIT"');
    expect(pyproject!.content).toContain('readme = "README.md"');
    expect(pyproject!.content).toContain('classifiers = [');
    expect(pyproject!.content).not.toContain('License :: OSI Approved :: MIT License');

    expect(manifest).toBeDefined();
    expect(manifest!.content).not.toContain('include LICENSE');
  });

  it('should include standard release metadata files in generated SDK packages', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, mockSpec);
    const licenseFile = result.files.find((f) => f.path === 'LICENSE');
    const changelogFile = result.files.find((f) => f.path === 'CHANGELOG.md');

    expect(result.errors).toEqual([]);
    expect(licenseFile).toBeDefined();
    expect(licenseFile!.content).toContain('MIT License');
    expect(licenseFile!.content).toContain('SDKWork Team');
    expect(changelogFile).toBeDefined();
    expect(changelogFile!.content).toContain('# Changelog');
    expect(changelogFile!.content).toContain(`## ${baseConfig.version}`);
    expect(changelogFile!.content).toContain('Initial generated SDK release.');
  });

  it('should normalize trailing numeric suffixes per api class only', async () => {
    const typeScriptGenerator = new TypeScriptGenerator();
    const tsResult = await typeScriptGenerator.generate(baseConfig, duplicateOperationIdSpec);
    const tenantApi = tsResult.files.find((f) => f.path === 'src/api/tenant.ts');
    const projectApi = tsResult.files.find((f) => f.path === 'src/api/project.ts');

    expect(tenantApi).toBeDefined();
    expect(tenantApi!.content).toContain('async create(');
    expect(tenantApi!.content).toContain('async createRaw(');
    expect(tenantApi!.content).toContain('async update(');
    expect(tenantApi!.content).toContain('async listByPage(');
    expect(tenantApi!.content).not.toContain('create28');
    expect(tenantApi!.content).not.toContain('update28');
    expect(tenantApi!.content).not.toContain('listByPage28');

    expect(projectApi).toBeDefined();
    expect(projectApi!.content).toContain('async create(');
    expect(projectApi!.content).not.toContain('create2');

    const csharpGenerator = new CSharpGenerator();
    const csharpResult = await csharpGenerator.generate(
      { ...baseConfig, language: 'csharp' },
      duplicateOperationIdSpec
    );
    const tenantCsApi = csharpResult.files.find((f) => f.path === 'Api/TenantApi.cs');

    expect(tenantCsApi).toBeDefined();
    expect(tenantCsApi!.content).toContain('CreateAsync(');
    expect(tenantCsApi!.content).toContain('CreateRawAsync(');
    expect(tenantCsApi!.content).toContain('UpdateAsync(');
    expect(tenantCsApi!.content).not.toContain('Create28Async');
    expect(tenantCsApi!.content).not.toContain('Update28Async');
  });

  it('should keep both request body and query params on post endpoints', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, postBodyAndQuerySpec);
    const tenantApi = result.files.find((f) => f.path === 'src/api/tenant.ts');

    expect(tenantApi).toBeDefined();
    expect(tenantApi!.content).toContain('export interface TenantListByPageParams');
    expect(tenantApi!.content).toContain('page?: number;');
    expect(tenantApi!.content).toContain('size?: number;');
    expect(tenantApi!.content).toContain(
      'async listByPage(body?: PlusTenantQueryListForm, params?: TenantListByPageParams): Promise<PlusApiResultPagePlusTenantVO>'
    );
    expect(tenantApi!.content).toContain('const query = buildQueryString([');
    expect(tenantApi!.content).toContain("{ name: 'page', value: params?.page, style: 'form', explode: true, allowReserved: false },");
    expect(tenantApi!.content).toContain("{ name: 'size', value: params?.size, style: 'form', explode: true, allowReserved: false },");
    expect(tenantApi!.content).toContain(
      'return this.client.post<PlusApiResultPagePlusTenantVO>(appendQueryString(backendApiPath(`/tenant/list`), query), body, undefined'
    );
    expect(tenantApi!.content).not.toContain('params?: QueryParams');
    expect(tenantApi!.content).toContain(`'application/json'`);
  });

  it('should expose flattened and simplified typescript client api properties', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, managementTagSpec);
    const sdkFile = result.files.find((f) => f.path === 'src/sdk.ts');
    const readmeFile = result.files.find((f) => f.path === 'README.md');

    expect(sdkFile).toBeDefined();
    expect(sdkFile!.content).toContain('public readonly tenant: TenantApi;');
    expect(sdkFile!.content).toContain('this.tenant = createTenantApi(this.httpClient);');
    expect(sdkFile!.content).not.toContain('public modules:');

    expect(readmeFile).toBeDefined();
    expect(readmeFile!.content).toContain('client.tenant');
    expect(readmeFile!.content).not.toContain('client.modules.');
  });

  it('should map scoped operationId format into friendly method names', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, scopedOperationIdSpec);
    const tenantApi = result.files.find((f) => f.path === 'src/api/tenant-management.ts');

    expect(tenantApi).toBeDefined();
    expect(tenantApi!.content).toContain('async update(');
    expect(tenantApi!.content).toContain('async create(');
    expect(tenantApi!.content).not.toContain('tenantUpdate');
    expect(tenantApi!.content).not.toContain('tenantCreate');
  });

  it('should expose sdkwork v3 resource operationIds as nested typescript client resources', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(
      {
        ...baseConfig,
        sdkType: 'app',
        apiPrefix: '/app/v3/api',
        options: { standardProfile: 'sdkwork-v3' },
      },
      sdkworkV3IamSpec
    );
    const authApi = result.files.find((f) => f.path === 'src/api/auth.ts');
    const readmeFile = result.files.find((f) => f.path === 'README.md');

    expect(result.errors).toEqual([]);
    expect(authApi).toBeDefined();
    expect(authApi!.content).toContain('public readonly sessions: AuthSessionsApi;');
    expect(authApi!.content).toContain('this.sessions = new AuthSessionsApi(client);');
    expect(authApi!.content).toContain('export class AuthSessionsApi');
    expect(authApi!.content).toContain('public readonly current: AuthSessionsCurrentApi;');
    expect(authApi!.content).toContain('export interface AuthSessionsCreateParams');
    expect(authApi!.content).toContain('xRequestId?: string;');
    expect(authApi!.content).toContain('async create(body: CreateSessionRequest, params?: AuthSessionsCreateParams): Promise<AuthSession>');
    expect(authApi!.content).toContain('async refresh(body: RefreshSessionRequest): Promise<AuthSession>');
    expect(authApi!.content).toContain('async retrieve(): Promise<AuthSession>');
    expect(authApi!.content).toContain('async delete(): Promise<void>');
    expect(authApi!.content).toContain('export class AuthVerificationCodesApi');
    expect(authApi!.content).toContain('async create(body: CreateVerificationCodeRequest): Promise<VerificationCodeResult>');
    expect(authApi!.content).toContain('async verify(body: VerifyVerificationCodeRequest): Promise<VerificationCodeVerifyResult>');
    expect(authApi!.content).not.toContain('public readonly refresh: AuthSessionsRefreshApi;');
    expect(authApi!.content).not.toContain('export class AuthSessionsRefreshApi');
    expect(authApi!.content).not.toContain('public readonly verify: AuthVerificationCodesVerifyApi;');
    expect(authApi!.content).not.toContain('export class AuthVerificationCodesVerifyApi');
    expect(authApi!.content).not.toContain('async createSession(');
    expect(authApi!.content).not.toContain('async sessionsCreate(');
    expect(readmeFile).toBeDefined();
    expect(readmeFile!.content).toContain("const xRequestId = 'X-Request-Id';");
    expect(readmeFile!.content).toContain("const params = {");
    expect(readmeFile!.content).toContain("  xRequestId,");
    expect(readmeFile!.content).toContain('const result = await client.auth.sessions.create(body, params);');
    expect(readmeFile!.content).not.toContain('client.auth.sessions.create(body)');
  });

  it('should generate sdkwork v3 TypeScript auth headers without legacy Access-Token aliases', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(
      {
        ...baseConfig,
        sdkType: 'app',
        apiPrefix: '/app/v3/api',
        options: { standardProfile: 'sdkwork-v3' },
      },
      sdkworkV3IamSpec
    );
    const httpClient = result.files.find((f) => f.path === 'src/http/client.ts');

    expect(result.errors).toEqual([]);
    expect(httpClient).toBeDefined();
    expect(httpClient!.content).toContain("private static readonly ACCESS_TOKEN_HEADER: string = 'Sdkwork-Access-Token';");
    expect(httpClient!.content).not.toMatch(/(?<!Sdkwork-)Access-Token/);
    expect(httpClient!.content).not.toContain("HttpClient.ACCESS_TOKEN_HEADER === 'Access-Token'");
  });

  it('should keep sdkwork v3 typescript namespaces tag-driven when governance domains differ', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(
      {
        ...baseConfig,
        sdkType: 'app',
        apiPrefix: '/app/v3/api',
        options: { standardProfile: 'sdkwork-v3' },
      },
      {
        ...sdkworkV3IamSpec,
        paths: {
          ...sdkworkV3IamSpec.paths,
          '/app/v3/api/auth/sessions': {
            post: {
              ...(sdkworkV3IamSpec.paths['/app/v3/api/auth/sessions'] as Record<string, any>).post,
              'x-sdk-domain': 'iam',
              'x-sdkwork-domain': 'iam',
            },
          },
        },
      },
    );
    const sdkFile = result.files.find((f) => f.path === 'src/sdk.ts');
    const authApi = result.files.find((f) => f.path === 'src/api/auth.ts');
    const iamApi = result.files.find((f) => f.path === 'src/api/iam.ts');
    const readmeFile = result.files.find((f) => f.path === 'README.md');

    expect(result.errors).toEqual([]);
    expect(sdkFile).toBeDefined();
    expect(sdkFile!.content).toContain('public readonly auth: AuthApi;');
    expect(sdkFile!.content).toContain('this.auth = createAuthApi(this.httpClient);');
    expect(sdkFile!.content).not.toContain('public readonly iam: IamApi;');
    expect(authApi).toBeDefined();
    expect(authApi!.content).toContain('public readonly sessions: AuthSessionsApi;');
    expect(authApi!.content).toContain('async create(body: CreateSessionRequest, params?: AuthSessionsCreateParams): Promise<AuthSession>');
    expect(iamApi).toBeUndefined();
    expect(readmeFile).toBeDefined();
    expect(readmeFile!.content).toContain('const result = await client.auth.sessions.create(body, params);');
    expect(readmeFile!.content).not.toContain('client.iam.sessions.create');
  });

  it('should generate object-shaped TypeScript params for sdkwork v3 query resources', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(
      {
        ...baseConfig,
        sdkType: 'app',
        apiPrefix: '/app/v3/api',
        options: { standardProfile: 'sdkwork-v3' },
      },
      {
        ...sdkworkV3IamSpec,
        paths: {
          ...sdkworkV3IamSpec.paths,
          '/app/v3/api/auth/oauth_authorization_urls': {
            get: {
              summary: 'Retrieve OAuth authorization URL',
              operationId: 'oauthAuthorizationUrls.retrieve',
              tags: ['auth'],
              security: [],
              parameters: [
                { name: 'provider', in: 'query', required: true, schema: { type: 'string' } },
                { name: 'redirectUri', in: 'query', required: true, schema: { type: 'string' } },
                { name: 'state', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'scope', in: 'query', required: false, schema: { type: 'string' } },
              ],
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/OauthAuthorizationUrlsRetrieveResult' },
                    },
                  },
                },
                '400': {
                  description: 'Bad request',
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
          ...sdkworkV3IamSpec.components,
          schemas: {
            ...sdkworkV3IamSpec.components?.schemas,
            OauthAuthorizationUrlsRetrieveResult: {
              type: 'object',
              properties: {
                authUrl: { type: 'string' },
              },
            },
          },
        },
      }
    );
    const authApi = result.files.find((f) => f.path === 'src/api/auth.ts');

    expect(result.errors).toEqual([]);
    expect(authApi).toBeDefined();
    expect(authApi!.content).toContain('export interface AuthOauthAuthorizationUrlsRetrieveParams');
    expect(authApi!.content).toContain('provider: string;');
    expect(authApi!.content).toContain('redirectUri: string;');
    expect(authApi!.content).toContain('state?: string;');
    expect(authApi!.content).toContain('scope?: string;');
    expect(authApi!.content).toContain(
      'async retrieve(params: AuthOauthAuthorizationUrlsRetrieveParams): Promise<OauthAuthorizationUrlsRetrieveResult>'
    );
    expect(authApi!.content).toContain("{ name: 'provider', value: params.provider, style: 'form', explode: true, allowReserved: false },");
    expect(authApi!.content).toContain("{ name: 'redirectUri', value: params.redirectUri, style: 'form', explode: true, allowReserved: false },");
    expect(authApi!.content).toContain("{ name: 'state', value: params.state, style: 'form', explode: true, allowReserved: false },");
    expect(authApi!.content).not.toContain('async retrieve(provider: string, redirectUri: string');
    expect(authApi!.content).not.toContain('value: provider');
  });

  it('should reject non-standard sdkwork v3 OpenAPI contracts under the strict standard profile', async () => {
    const generator = new TypeScriptGenerator();
    const invalidSpec: ApiSpec = {
      ...sdkworkV3IamSpec,
      paths: {
        '/backend/v3/api/auth/sessions': {
          post: {
            summary: 'Create backend auth session',
            operationId: 'auth__login',
            tags: ['auth'],
            responses: {
              '200': { description: 'Success' },
              '401': { description: 'Unauthorized' },
            },
          },
        },
      },
    };

    const result = await generator.generate(
      {
        ...baseConfig,
        sdkType: 'backend',
        apiPrefix: '/backend/v3/api',
        options: { standardProfile: 'sdkwork-v3' },
      },
      invalidSpec
    );

    expect(result.files).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('SDKWork v3 OpenAPI standard violations');
    expect(result.errors[0].message).toContain('operationId "auth__login" must not contain "__"');
    expect(result.errors[0].message).toContain('must not expose auth/session endpoints in backend-api');
    expect(result.errors[0].message).toContain('must include application/problem+json');
  });

  it('should strip tag-like operationId prefixes into friendly method names', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, prefixedOperationIdSpec);
    const tenantApi = result.files.find((f) => f.path === 'src/api/tenant-management.ts');

    expect(tenantApi).toBeDefined();
    expect(tenantApi!.content).toContain('async update(');
    expect(tenantApi!.content).toContain('async create(');
    expect(tenantApi!.content).not.toContain('tenantUpdate');
    expect(tenantApi!.content).not.toContain('tenantCreate');
  });

  it('should preserve semantic action verbs before tag suffixes in method names', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, suffixVerbOperationIdSpec);
    const skillApi = result.files.find((f) => f.path === 'src/api/skill.ts');
    const appApi = result.files.find((f) => f.path === 'src/api/app.ts');

    expect(skillApi).toBeDefined();
    expect(skillApi!.content).toContain('async enableSkill(');
    expect(skillApi!.content).toContain('async disableSkill(');
    expect(skillApi!.content).toContain('async approveSkill(');
    expect(skillApi!.content).toContain('async rejectSkill(');
    expect(skillApi!.content).not.toContain('async enable(');
    expect(skillApi!.content).not.toContain('async disable(');
    expect(skillApi!.content).not.toContain('async approve(');
    expect(skillApi!.content).not.toContain('async reject(');
    expect(appApi).toBeDefined();
    expect(appApi!.content).toContain('async fetchApp(');
    expect(appApi!.content).toContain('async publishApp(');
    expect(appApi!.content).toContain('async offlineApp(');
    expect(appApi!.content).not.toContain('async fetch(');
    expect(appApi!.content).not.toContain('async publish(');
    expect(appApi!.content).not.toContain('async offline(');
  });

  it('should simplify tag-derived client module names across languages', async () => {
    const goGenerator = new GoGenerator();
    const goResult = await goGenerator.generate(
      { ...baseConfig, language: 'go' },
      managementTagSpec
    );
    const goSdk = goResult.files.find((f) => f.path === 'sdk.go');
    expect(goSdk).toBeDefined();
    expect(goSdk!.content).toContain('Tenant *api.TenantApi');
    expect(goSdk!.content).not.toContain('TenantManagement');

    const javaGenerator = new JavaGenerator();
    const javaResult = await javaGenerator.generate(
      { ...baseConfig, language: 'java' },
      managementTagSpec
    );
    const javaClient = javaResult.files.find((f) => f.path === 'src/main/java/com/sdkwork/backend/SdkworkBackendClient.java');
    expect(javaClient).toBeDefined();
    expect(javaClient!.content).toContain('public TenantApi getTenant()');
    expect(javaClient!.content).not.toContain('getTenantManagement');
  });

  it('should derive friendly module names from path when tags are non-ascii', async () => {
    const tsGenerator = new TypeScriptGenerator();
    const tsResult = await tsGenerator.generate(baseConfig, nonAsciiTagSpec);
    const tsSdk = tsResult.files.find((f) => f.path === 'src/sdk.ts');
    const tsReadme = tsResult.files.find((f) => f.path === 'README.md');

    expect(tsSdk).toBeDefined();
    expect(tsSdk!.content).toContain('public readonly workspace: WorkspaceApi;');
    expect(tsSdk!.content).toContain('public readonly project: ProjectApi;');
    expect(tsResult.files.some((f) => f.path.startsWith('src/api/group-'))).toBe(false);

    expect(tsReadme).toBeDefined();
    expect(tsReadme!.content).toContain('client.workspace');
    expect(tsReadme!.content).toContain('client.project');
    expect(tsReadme!.content).not.toContain('client.group');

    const pyGenerator = new PythonGenerator();
    const pyResult = await pyGenerator.generate({ ...baseConfig, language: 'python' }, nonAsciiTagSpec);
    expect(pyResult.files.some((f) => /\/api\/group[0-9a-f]+\.py$/i.test(f.path))).toBe(false);
  });

  it('should merge equivalent tags into one canonical api without Api2 suffixes', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, equivalentTagSpec);
    const sdkFile = result.files.find((f) => f.path === 'src/sdk.ts');
    const driveApiFiles = result.files.filter((f) => f.path === 'src/api/drive.ts');
    const voiceSpeakerApiFiles = result.files.filter((f) => f.path === 'src/api/voice-speaker.ts');

    expect(result.errors).toEqual([]);
    expect(result.stats.apis).toBe(2);
    expect(driveApiFiles).toHaveLength(1);
    expect(voiceSpeakerApiFiles).toHaveLength(1);
    expect(driveApiFiles[0].content).toContain('async listDriveItems(');
    expect(driveApiFiles[0].content).toContain('async uploadDriveItem(');
    expect(voiceSpeakerApiFiles[0].content).toContain('async listVoiceSpeakers(');
    expect(voiceSpeakerApiFiles[0].content).toContain('async listMarketVoices(');
    expect(sdkFile).toBeDefined();
    expect(sdkFile!.content).toContain('public readonly drive: DriveApi;');
    expect(sdkFile!.content).toContain('public readonly voiceSpeaker: VoiceSpeakerApi;');
    expect(sdkFile!.content).not.toContain('DriveApi2');
    expect(sdkFile!.content).not.toContain('VoiceSpeakerApi2');
    expect(sdkFile!.content).not.toContain('drive2');
    expect(sdkFile!.content).not.toContain('voiceSpeaker2');
  });

  it('should group app v3 endpoints by app domain instead of controller tags', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(
      {
        ...baseConfig,
        language: 'typescript',
        sdkType: 'app',
        apiPrefix: '/app/v3/api',
      },
      appDomainGroupingSpec
    );

    expect(result.errors).toEqual([]);
    expect(result.files.some((f) => f.path === 'src/api/app.ts')).toBe(true);
    expect(result.files.some((f) => f.path === 'src/api/manage.ts')).toBe(false);
    expect(result.files.some((f) => f.path === 'src/api/update.ts')).toBe(false);

    const appApi = result.files.find((f) => f.path === 'src/api/app.ts');
    const sdkFile = result.files.find((f) => f.path === 'src/sdk.ts');
    const readmeFile = result.files.find((f) => f.path === 'README.md');

    expect(appApi).toBeDefined();
    expect(appApi!.content).toContain('async createApp(');
    expect(appApi!.content).toContain('async checkUpdate(');

    expect(sdkFile).toBeDefined();
    expect(sdkFile!.content).toContain('public readonly app: AppApi;');
    expect(sdkFile!.content).toContain('this.app = createAppApi(this.httpClient);');
    expect(sdkFile!.content).not.toContain('public readonly manage:');
    expect(sdkFile!.content).not.toContain('public readonly update:');

    expect(readmeFile).toBeDefined();
    expect(readmeFile!.content).toContain('client.app');
    expect(readmeFile!.content).not.toContain('client.manage');
    expect(readmeFile!.content).not.toContain('client.update');
  });

  it('should group backend v3 endpoints by first business domain segment', async () => {
    const generator = new PythonGenerator();
    const result = await generator.generate(
      {
        ...baseConfig,
        language: 'python',
        sdkType: 'backend',
        apiPrefix: '/backend/v3/api',
      },
      backendDomainGroupingSpec
    );

    expect(result.errors).toEqual([]);
    expect(result.files.some((f) => f.path.endsWith('/api/tenant.py'))).toBe(true);
    expect(result.files.some((f) => f.path.endsWith('/api/user.py'))).toBe(false);

    const tenantApi = result.files.find((f) => f.path.endsWith('/api/tenant.py'));
    expect(tenantApi).toBeDefined();
    expect(tenantApi!.content).toContain('class TenantApi:');
    expect(tenantApi!.content).toContain('def list_tenant_users(');
    expect(tenantApi!.content).toContain('def get_tenant_member(');
  });

  it('should group ai v3 chat endpoints under chat across languages', async () => {
    const tsGenerator = new TypeScriptGenerator();
    const tsResult = await tsGenerator.generate(
      {
        ...baseConfig,
        language: 'typescript',
        sdkType: 'ai',
        apiPrefix: '/ai/v3',
      },
      aiDomainGroupingSpec
    );

    expect(tsResult.errors).toEqual([]);
    expect(tsResult.files.some((f) => f.path === 'src/api/chat.ts')).toBe(true);
    expect(tsResult.files.some((f) => f.path === 'src/api/management.ts')).toBe(false);
    expect(tsResult.files.some((f) => f.path === 'src/api/chat-completions-management.ts')).toBe(false);

    const tsChatApi = tsResult.files.find((f) => f.path === 'src/api/chat.ts');
    const tsSdk = tsResult.files.find((f) => f.path === 'src/sdk.ts');
    expect(tsChatApi).toBeDefined();
    expect(tsChatApi!.content).toContain('public readonly completions: ChatCompletionsApi;');
    expect(tsChatApi!.content).toContain('this.completions = new ChatCompletionsApi(client);');
    expect(tsChatApi!.content).toContain('export class ChatCompletionsApi');
    expect(tsChatApi!.content).toContain('public readonly messages: ChatCompletionsMessagesApi;');
    expect(tsChatApi!.content).toContain('this.messages = new ChatCompletionsMessagesApi(client);');
    expect(tsChatApi!.content).toContain('export class ChatCompletionsMessagesApi');
    expect(tsChatApi!.content).toContain('async create(');
    expect(tsChatApi!.content).toContain('async retrieve(');
    expect(tsChatApi!.content).toContain('async list(');
    expect(tsChatApi!.content).not.toContain('async createCompletion(');
    expect(tsChatApi!.content).not.toContain('async retrieveCompletions(');
    expect(tsChatApi!.content).not.toContain('async retrieveCompletionsMessages(');
    expect(tsChatApi!.content).not.toContain('async createChatCompletion(');
    expect(tsChatApi!.content).not.toContain('async getChatCompletion(');
    expect(tsChatApi!.content).not.toContain('async listChatCompletionMessages(');
    expect(tsChatApi!.content).not.toContain('getManagedChatCompletion');
    expect(tsSdk).toBeDefined();
    expect(tsSdk!.content).toContain('public readonly chat: ChatApi;');
    expect(tsSdk!.content).not.toContain('public readonly management:');
    expect(tsSdk!.content).not.toContain('public readonly chatCompletions:');

    const javaGenerator = new JavaGenerator();
    const javaResult = await javaGenerator.generate(
      {
        ...baseConfig,
        language: 'java',
        sdkType: 'ai',
        apiPrefix: '/ai/v3',
      },
      aiDomainGroupingSpec
    );

    expect(javaResult.errors).toEqual([]);
    expect(
      javaResult.files.some((f) => f.path === 'src/main/java/com/sdkwork/ai/api/ChatApi.java')
    ).toBe(true);
    expect(
      javaResult.files.some((f) => f.path === 'src/main/java/com/sdkwork/ai/api/ManagementApi.java')
    ).toBe(false);
    expect(
      javaResult.files.some((f) => f.path === 'src/main/java/com/sdkwork/ai/api/ChatCompletionsApi.java')
    ).toBe(false);

    const javaChatApi = javaResult.files.find(
      (f) => f.path === 'src/main/java/com/sdkwork/ai/api/ChatApi.java'
    );
    expect(javaChatApi).toBeDefined();
    expect(javaChatApi!.content).toContain(' create() throws Exception');
    expect(javaChatApi!.content).toContain(' retrieve(String completionId) throws Exception');
    expect(javaChatApi!.content).toContain(' listMessages(String completionId) throws Exception');
    expect(javaChatApi!.content).not.toContain('createChatCompletion');
    expect(javaChatApi!.content).not.toContain('getChatCompletion');
    expect(javaChatApi!.content).not.toContain('listChatCompletionMessages');
    expect(javaChatApi!.content).not.toContain('getManagedChatCompletion');
  });

  it('should use OpenAI-style AI resource names and semantic operations across generated languages', async () => {
    const cases = [
      {
        language: 'python' as const,
        generator: new PythonGenerator(),
        config: { ...baseConfig, language: 'python' as const, sdkType: 'ai' as const, apiPrefix: '/ai/v3' },
        clientPath: 'sdkwork_ai_sdk/client.py',
        clientExpected: ['self.files: FilesApi', 'self.batches: BatchesApi', 'self.responses: ResponsesApi'],
        clientForbidden: ['self.file:', 'self.batch:', 'self.response:'],
        chatPath: 'sdkwork_ai_sdk/api/chat.py',
        chatExpected: ['def create(self)', 'def retrieve(self, completion_id: str)', 'def list_messages(self, completion_id: str)'],
        chatForbidden: ['create_chat_completion', 'get_chat_completion', 'list_chat_completion_messages'],
      },
      {
        language: 'go' as const,
        generator: new GoGenerator(),
        config: { ...baseConfig, language: 'go' as const, sdkType: 'ai' as const, apiPrefix: '/ai/v3' },
        clientPath: 'sdk.go',
        clientExpected: ['Files *api.FilesApi', 'Batches *api.BatchesApi', 'Responses *api.ResponsesApi'],
        clientForbidden: ['File *api.FileApi', 'Batch *api.BatchApi', 'Response *api.ResponseApi'],
        chatPath: 'api/chat.go',
        chatExpected: ['func (a *ChatApi) Create(', 'func (a *ChatApi) Retrieve(completionId string)', 'func (a *ChatApi) ListMessages(completionId string)'],
        chatForbidden: ['CreateChatCompletion', 'GetChatCompletion', 'ListChatCompletionMessages'],
      },
      {
        language: 'java' as const,
        generator: new JavaGenerator(),
        config: { ...baseConfig, language: 'java' as const, sdkType: 'ai' as const, apiPrefix: '/ai/v3' },
        clientPath: 'src/main/java/com/sdkwork/ai/SdkworkAiClient.java',
        clientExpected: ['private FilesApi files;', 'private BatchesApi batches;', 'private ResponsesApi responses;', 'public FilesApi getFiles()'],
        clientForbidden: ['private FileApi file;', 'private BatchApi batch;', 'private ResponseApi response;', 'public FileApi getFile()'],
        chatPath: 'src/main/java/com/sdkwork/ai/api/ChatApi.java',
        chatExpected: [' create() throws Exception', ' retrieve(String completionId) throws Exception', ' listMessages(String completionId) throws Exception'],
        chatForbidden: ['createChatCompletion', 'getChatCompletion', 'listChatCompletionMessages'],
      },
      {
        language: 'kotlin' as const,
        generator: new KotlinGenerator(),
        config: { ...baseConfig, language: 'kotlin' as const, sdkType: 'ai' as const, apiPrefix: '/ai/v3' },
        clientPath: 'src/main/kotlin/com/sdkwork/ai/SdkworkAiClient.kt',
        clientExpected: ['files: FilesApi', 'batches: BatchesApi', 'responses: ResponsesApi'],
        clientForbidden: ['file: FileApi', 'batch: BatchApi', 'response: ResponseApi'],
        chatPath: 'src/main/kotlin/com/sdkwork/ai/api/ChatApi.kt',
        chatExpected: ['fun create()', 'fun retrieve(completionId: String)', 'fun listMessages(completionId: String)'],
        chatForbidden: ['createChatCompletion', 'getChatCompletion', 'listChatCompletionMessages'],
      },
      {
        language: 'csharp' as const,
        generator: new CSharpGenerator(),
        config: { ...baseConfig, language: 'csharp' as const, sdkType: 'ai' as const, apiPrefix: '/ai/v3' },
        clientPath: 'SdkworkAiClient.cs',
        clientExpected: ['public FilesApi Files { get; }', 'public BatchesApi Batches { get; }', 'public ResponsesApi Responses { get; }'],
        clientForbidden: ['public FileApi File { get; }', 'public BatchApi Batch { get; }', 'public ResponseApi Response { get; }'],
        chatPath: 'Api/ChatApi.cs',
        chatExpected: ['CreateAsync()', 'RetrieveAsync(string completionId)', 'ListMessagesAsync(string completionId)'],
        chatForbidden: ['CreateChatCompletionAsync', 'GetChatCompletionAsync', 'ListChatCompletionMessagesAsync'],
      },
      {
        language: 'rust' as const,
        generator: new RustGenerator(),
        config: { ...baseConfig, language: 'rust' as const, sdkType: 'ai' as const, apiPrefix: '/ai/v3' },
        clientPath: 'src/client.rs',
        clientExpected: ['pub fn files(&self) -> FilesApi', 'pub fn batches(&self) -> BatchesApi', 'pub fn responses(&self) -> ResponsesApi'],
        clientForbidden: ['pub fn file(&self) -> FileApi', 'pub fn batch(&self) -> BatchApi', 'pub fn response(&self) -> ResponseApi'],
        chatPath: 'src/api/chat.rs',
        chatExpected: ['pub async fn create(&self)', 'pub async fn retrieve(&self, completion_id: &str)', 'pub async fn list_messages(&self, completion_id: &str)'],
        chatForbidden: ['create_chat_completion', 'get_chat_completion', 'list_chat_completion_messages'],
      },
      {
        language: 'php' as const,
        generator: new PhpGenerator(),
        config: { ...baseConfig, language: 'php' as const, sdkType: 'ai' as const, apiPrefix: '/ai/v3' },
        clientPath: 'src/SdkworkAiClient.php',
        clientExpected: ['public FilesApi $files;', 'public BatchesApi $batches;', 'public ResponsesApi $responses;'],
        clientForbidden: ['public FileApi $file;', 'public BatchApi $batch;', 'public ResponseApi $response;'],
        chatPath: 'src/Api/Chat.php',
        chatExpected: ['public function create()', 'public function retrieve(string $completionId)', 'public function listMessages(string $completionId)'],
        chatForbidden: ['createChatCompletion', 'getChatCompletion', 'listChatCompletionMessages'],
      },
      {
        language: 'ruby' as const,
        generator: new RubyGenerator(),
        config: { ...baseConfig, language: 'ruby' as const, sdkType: 'ai' as const, apiPrefix: '/ai/v3' },
        clientPath: 'lib/sdkwork/ai_sdk/client.rb',
        clientExpected: ['attr_reader :http, :chat, :files, :batches, :responses'],
        clientForbidden: [':file,', ':batch,', ':response,', '@file =', '@batch =', '@response ='],
        chatPath: 'lib/sdkwork/ai_sdk/api/chat.rb',
        chatExpected: ['def create', 'def retrieve(completion_id)', 'def list_messages(completion_id)'],
        chatForbidden: ['create_chat_completion', 'get_chat_completion', 'list_chat_completion_messages'],
      },
    ];

    for (const testCase of cases) {
      const result = await testCase.generator.generate(testCase.config, aiOpenAiResourceNamingSpec);
      expect(result.errors).toEqual([]);

      const clientFile = result.files.find((candidate) => candidate.path === testCase.clientPath);
      expect(clientFile, `${testCase.language} missing client file ${testCase.clientPath}; generated files: ${result.files.map((file) => file.path).join(', ')}`).toBeDefined();
      for (const expected of testCase.clientExpected) {
        expect(clientFile!.content).toContain(expected);
      }
      for (const forbidden of testCase.clientForbidden) {
        expect(clientFile!.content).not.toContain(forbidden);
      }

      const chatFile = result.files.find((candidate) => candidate.path === testCase.chatPath);
      expect(chatFile, `${testCase.language} missing chat file ${testCase.chatPath}; generated files: ${result.files.map((file) => file.path).join(', ')}`).toBeDefined();
      for (const expected of testCase.chatExpected) {
        expect(chatFile!.content).toContain(expected);
      }
      for (const forbidden of testCase.chatForbidden) {
        expect(chatFile!.content).not.toContain(forbidden);
      }
    }
  });

  it('should deduplicate legacy alias operations within the same ai domain', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(
      {
        ...baseConfig,
        language: 'typescript',
        sdkType: 'ai',
        apiPrefix: '/ai/v3',
      },
      aiAliasDedupSpec
    );

    expect(result.errors).toEqual([]);
    const batchesApi = result.files.find((f) => f.path === 'src/api/batches.ts');
    expect(batchesApi).toBeDefined();
    expect(batchesApi!.content).toContain('export class BatchesApi');
    expect(batchesApi!.content).toContain('aiApiPath(`/batches`)');
    expect(batchesApi!.content).not.toContain('aiApiPath(`/v1/batches`)');
    expect(batchesApi!.content).not.toContain('getListBatchesV1');
    expect(batchesApi!.content).not.toContain('createBatchesV1');

    const sdkFile = result.files.find((f) => f.path === 'src/sdk.ts');
    expect(sdkFile).toBeDefined();
    expect(sdkFile!.content).toContain('public readonly batches: BatchesApi;');
    expect(sdkFile!.content).not.toContain('public readonly batch:');

    const crossLanguageCases = [
      {
        generator: new PythonGenerator(),
        config: { ...baseConfig, language: 'python' as const, sdkType: 'ai' as const, apiPrefix: '/ai/v3' },
        path: 'sdkwork_ai_sdk/api/batches.py',
        expected: ['def list(self)', 'def create(self)'],
        forbidden: ['def get_list', 'def post_create', '"/ai/v3/v1/batches"', '"/v1/batches"'],
      },
      {
        generator: new GoGenerator(),
        config: { ...baseConfig, language: 'go' as const, sdkType: 'ai' as const, apiPrefix: '/ai/v3' },
        path: 'api/batches.go',
        expected: ['func (a *BatchesApi) List(', 'func (a *BatchesApi) Create('],
        forbidden: ['GetList', 'PostCreate', 'AiApiPath("/v1/batches")'],
      },
      {
        generator: new JavaGenerator(),
        config: { ...baseConfig, language: 'java' as const, sdkType: 'ai' as const, apiPrefix: '/ai/v3' },
        path: 'src/main/java/com/sdkwork/ai/api/BatchesApi.java',
        expected: [' list() throws Exception', ' create() throws Exception'],
        forbidden: ['getList', 'postCreate', 'ApiPaths.aiPath("/v1/batches")'],
      },
    ];

    for (const testCase of crossLanguageCases) {
      const crossResult = await testCase.generator.generate(testCase.config, aiAliasDedupSpec);
      expect(crossResult.errors).toEqual([]);
      const apiFile = getGeneratedFile(crossResult.files, testCase.path);
      for (const expected of testCase.expected) {
        expect(apiFile.content).toContain(expected);
      }
      for (const forbidden of testCase.forbidden) {
        expect(apiFile.content).not.toContain(forbidden);
      }
    }
  });

  it('should place types export condition before import and require in generated package.json', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, mockSpec);
    const packageJsonFile = result.files.find((f) => f.path === 'package.json');

    expect(packageJsonFile).toBeDefined();

    const packageJson = JSON.parse(packageJsonFile!.content) as {
      exports?: Record<string, Record<string, string>>;
    };
    const exportConditionKeys = Object.keys(packageJson.exports?.['.'] ?? {});

    expect(exportConditionKeys).toEqual(['types', 'import', 'require']);
  });

  it('should generate TypeScript SDK package builds through the custom Rollup runtime', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, mockSpec);
    const packageJsonFile = getGeneratedFile(result.files, 'package.json');
    const buildRuntimeFile = result.files.find((file) => file.path === 'custom/build-runtime.mjs');

    expect(result.errors).toEqual([]);
    expect(buildRuntimeFile).toBeDefined();
    expect(buildRuntimeFile?.ownership).toBe('scaffold');
    expect(buildRuntimeFile?.overwriteStrategy).toBe('if-missing');
    expect(buildRuntimeFile?.content).toContain("import { rollup } from 'rollup';");
    expect(buildRuntimeFile?.content).toContain('maxRetries: 5');
    expect(buildRuntimeFile?.content).toContain('retryDelay: 100');
    expect(result.files.some((file) => file.path === 'vite.config.ts')).toBe(false);

    const packageJson = JSON.parse(packageJsonFile.content) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.scripts?.build).toBe('node custom/build-runtime.mjs');
    expect(packageJson.scripts?.dev).toBe('node custom/build-runtime.mjs');
    expect(packageJson.scripts?.prepublishOnly).toBe('npm run build');
    expect(packageJson.devDependencies).toMatchObject({
      '@types/node': '^20.0.0',
      typescript: '^5.3.0',
      rollup: '^4.0.0',
    });
    expect(packageJson.devDependencies).not.toHaveProperty('vite');
    expect(packageJson.devDependencies).not.toHaveProperty('vite-plugin-dts');
  });

  it('should use unified sdkwork-prefixed client names', async () => {
    const typeScriptGenerator = new TypeScriptGenerator();
    const tsResult = await typeScriptGenerator.generate(
      { ...baseConfig, language: 'typescript', sdkType: 'ai' },
      mockSpec
    );
    const tsSdkFile = tsResult.files.find((f) => f.path === 'src/sdk.ts');
    expect(tsSdkFile).toBeDefined();
    expect(tsSdkFile!.content).toContain('export class SdkworkAiClient');

    const pythonGenerator = new PythonGenerator();
    const pyResult = await pythonGenerator.generate(
      { ...baseConfig, language: 'python', sdkType: 'ai' },
      mockSpec
    );
    const pyClientFile = pyResult.files.find((f) => f.path.endsWith('/client.py'));
    expect(pyClientFile).toBeDefined();
    expect(pyClientFile!.content).toContain('class SdkworkAiClient:');

    const csharpGenerator = new CSharpGenerator();
    const csResult = await csharpGenerator.generate(
      { ...baseConfig, language: 'csharp', sdkType: 'ai' },
      mockSpec
    );
    const csClientFile = csResult.files.find((f) => f.path === 'SdkworkAiClient.cs');
    expect(csClientFile).toBeDefined();
    expect(csClientFile!.content).toContain('public class SdkworkAiClient');
  });

  it('should always generate README even when generateReadme is false', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(
      {
        ...baseConfig,
        language: 'typescript',
        generateReadme: false,
      },
      mockSpec
    );

    const readme = result.files.find((f) => f.path === 'README.md');
    expect(readme).toBeDefined();
    expect(readme!.content).toContain('## Authentication Modes (Mutually Exclusive)');
    expect(result.warnings.some((w) => w.includes('generateReadme=false'))).toBe(true);
  });

  it('should fail fast when OpenAPI document has no paths', async () => {
    const generator = new TypeScriptGenerator();
    const emptySpec: ApiSpec = {
      openapi: '3.0.3',
      info: { title: 'Empty API', version: '1.0.0' },
      paths: {},
      components: { schemas: {} },
    };

    const result = await generator.generate(baseConfig, emptySpec);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toContain('no paths');
    expect(result.files.length).toBe(0);
    expect(result.stats.models).toBe(0);
    expect(result.stats.apis).toBe(0);
  });

  it('should return structured errors for unsupported OpenAPI versions without crashing stats', async () => {
    const generator = new TypeScriptGenerator();
    const invalidVersionSpec = {
      openapi: '2.0.0',
      info: { title: 'Legacy API', version: '1.0.0' },
      paths: {
        '/ping': {
          get: {
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    } as ApiSpec;

    const result = await generator.generate(baseConfig, invalidVersionSpec);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toContain('only supports OpenAPI 3.x');
    expect(result.files.length).toBe(0);
    expect(result.stats.models).toBe(0);
    expect(result.stats.apis).toBe(0);
  });

  it('should accept current OpenAPI 3.x semantic version strings including 3.2.0', async () => {
    const generator = new TypeScriptGenerator();
    const openApi32Spec: ApiSpec = {
      openapi: '3.2.0',
      info: { title: 'OpenAPI 3.2 API', version: '1.0.0' },
      paths: {
        '/ping': {
          get: {
            operationId: 'getPing',
            tags: ['Health'],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
      components: { schemas: {} },
    };

    const result = await generator.generate(baseConfig, openApi32Spec);
    expect(result.errors).toEqual([]);
    expect(result.files.some((file) => file.path === 'src/api/health.ts')).toBe(true);
  });

  it('should reject malformed OpenAPI 3.x version strings instead of accepting any 3 prefix', async () => {
    const generator = new TypeScriptGenerator();
    const invalidVersionSpec = {
      openapi: '3.foo',
      info: { title: 'Malformed Version API', version: '1.0.0' },
      paths: {
        '/ping': {
          get: {
            operationId: 'getPing',
            tags: ['Health'],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    } as ApiSpec;

    const result = await generator.generate(baseConfig, invalidVersionSpec);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toContain('OpenAPI 3.x version strings');
    expect(result.files.length).toBe(0);
    expect(result.stats.apis).toBe(0);
  });

  it('should generate SDK operations for every OpenAPI 3.x path item HTTP method', async () => {
    const methodSpec: ApiSpec = {
      openapi: '3.2.0',
      info: { title: 'Full HTTP API', version: '1.0.0' },
      paths: {
        '/resources': {
          get: {
            operationId: 'listResources',
            tags: ['Resource'],
            responses: { '200': { description: 'OK' } },
          },
          put: {
            operationId: 'replaceResources',
            tags: ['Resource'],
            responses: { '200': { description: 'OK' } },
          },
          post: {
            operationId: 'createResource',
            tags: ['Resource'],
            responses: { '201': { description: 'Created' } },
          },
          delete: {
            operationId: 'deleteResources',
            tags: ['Resource'],
            responses: { '204': { description: 'Deleted' } },
          },
          options: {
            operationId: 'optionsResources',
            tags: ['Resource'],
            responses: { '204': { description: 'No Content' } },
          },
          head: {
            operationId: 'headResources',
            tags: ['Resource'],
            responses: { '204': { description: 'No Content' } },
          },
          patch: {
            operationId: 'patchResources',
            tags: ['Resource'],
            responses: { '200': { description: 'OK' } },
          },
          trace: {
            operationId: 'traceResources',
            tags: ['Resource'],
            responses: { '200': { description: 'OK' } },
          },
          query: {
            operationId: 'queryResources',
            tags: ['Resource'],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
      components: { schemas: {} },
    };

    const cases = [
      {
        generator: new TypeScriptGenerator(),
        config: baseConfig,
        apiPath: 'src/api/resource.ts',
        expectedSnippets: [
          'async listResources',
          'method: \'HEAD\' as any',
          'method: \'OPTIONS\' as any',
          'method: \'TRACE\' as any',
          'method: \'QUERY\' as any',
        ],
      },
      {
        generator: new PythonGenerator(),
        config: { ...baseConfig, language: 'python' as const },
        apiPath: 'sdkwork_backend_sdk/api/resource.py',
        expectedSnippets: [
          'def list_resources',
          'self._client.request(\'HEAD\'',
          'self._client.request(\'OPTIONS\'',
          'self._client.request(\'TRACE\'',
          'self._client.request(\'QUERY\'',
        ],
      },
      {
        generator: new GoGenerator(),
        config: { ...baseConfig, language: 'go' as const },
        apiPath: 'api/resource.go',
        expectedSnippets: [
          'func (a *ResourceApi) ListResources',
          'a.client.Request("HEAD"',
          'a.client.Request("OPTIONS"',
          'a.client.Request("TRACE"',
          'a.client.Request("QUERY"',
        ],
      },
    ];

    for (const testCase of cases) {
      const result = await testCase.generator.generate(testCase.config, methodSpec);
      const apiFile = result.files.find((file) => file.path === testCase.apiPath);

      expect(result.errors).toEqual([]);
      expect(apiFile).toBeDefined();
      for (const snippet of testCase.expectedSnippets) {
        expect(apiFile!.content).toContain(snippet);
      }
    }
  });

  it('should generate SDK operations from OpenAPI 3.2 additionalOperations', async () => {
    const additionalOperationSpec: ApiSpec = {
      openapi: '3.2.0',
      info: { title: 'Additional Operations API', version: '1.0.0' },
      paths: {
        '/resources': {
          get: {
            operationId: 'listResources',
            tags: ['Resource'],
            responses: { '200': { description: 'OK' } },
          },
          additionalOperations: {
            'PURGE': {
              operationId: 'purgeResources',
              tags: ['Resource'],
              responses: { '204': { description: 'Purged' } },
            },
          },
        },
      },
      components: { schemas: {} },
    };

    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, additionalOperationSpec);
    const apiFile = result.files.find((file) => file.path === 'src/api/resource.ts');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('async purgeResources');
    expect(apiFile!.content).toContain('method: \'PURGE\' as any');
  });

  it('should preserve OpenAPI 3.2 additionalOperations method token casing', async () => {
    const additionalOperationSpec: ApiSpec = {
      openapi: '3.2.0',
      info: { title: 'Case Sensitive Additional Operations API', version: '1.0.0' },
      paths: {
        '/resources': {
          additionalOperations: {
            'x-example-method': {
              operationId: 'runExampleMethod',
              tags: ['Resource'],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      },
      components: { schemas: {} },
    };

    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, additionalOperationSpec);
    const apiFile = result.files.find((file) => file.path === 'src/api/resource.ts');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('async runExampleMethod');
    expect(apiFile!.content).toContain('method: \'x-example-method\' as any');
  });

  it('should generate raw query string parameters for OpenAPI 3.2 querystring parameters', async () => {
    const queryStringSpec: ApiSpec = {
      openapi: '3.2.0',
      info: { title: 'Query String API', version: '1.0.0' },
      paths: {
        '/resources': {
          query: {
            operationId: 'queryResources',
            tags: ['Resource'],
            parameters: [
              {
                name: 'filter',
                in: 'querystring',
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string' },
                      },
                    },
                  },
                },
                schema: { type: 'string' },
              },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
      components: { schemas: {} },
    };

    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, queryStringSpec);
    const apiFile = result.files.find((file) => file.path === 'src/api/resource.ts');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('async queryResources(rawQueryString: string)');
    expect(apiFile!.content).toContain('appendQueryString(backendApiPath(`/resources`), rawQueryString)');
    expect(apiFile!.content).toContain("method: 'QUERY' as any");
  });

  it('should generate OpenAPI 3.2 raw query string support across SDK languages', async () => {
    const queryStringSpec: ApiSpec = {
      openapi: '3.2.0',
      info: { title: 'Cross Language Query String API', version: '1.0.0' },
      paths: {
        '/resources': {
          query: {
            operationId: 'queryResources',
            tags: ['Resource'],
            parameters: [
              {
                name: 'filter',
                in: 'querystring',
                required: true,
                content: {
                  'application/x-www-form-urlencoded': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: { type: 'string' },
                      },
                    },
                  },
                },
                schema: { type: 'string' },
              },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
      components: { schemas: {} },
    };

    const cases = [
      {
        generator: new TypeScriptGenerator(),
        config: baseConfig,
        apiPath: 'src/api/resource.ts',
        expectedSnippets: [
          'async queryResources(rawQueryString: string)',
          'appendQueryString(backendApiPath(`/resources`), rawQueryString)',
        ],
      },
      {
        generator: new PythonGenerator(),
        config: { ...baseConfig, language: 'python' as const },
        apiPath: 'sdkwork_backend_sdk/api/resource.py',
        expectedSnippets: [
          'def query_resources(self, raw_query_string: str)',
          '_append_query_string(f"/api/v1/resources", raw_query_string)',
        ],
      },
      {
        generator: new DartGenerator(),
        config: { ...baseConfig, language: 'dart' as const },
        apiPath: 'lib/src/api/resource.dart',
        expectedSnippets: [
          'Future<void> queryResources(String rawQueryString)',
          'ApiPaths.appendQueryString(ApiPaths.backendPath(\'/resources\'), rawQueryString)',
        ],
      },
      {
        generator: new FlutterGenerator(),
        config: { ...baseConfig, language: 'flutter' as const },
        apiPath: 'lib/src/api/resource.dart',
        expectedSnippets: [
          'Future<void> queryResources(String rawQueryString)',
          'ApiPaths.appendQueryString(ApiPaths.backendPath(\'/resources\'), rawQueryString)',
        ],
      },
      {
        generator: new GoGenerator(),
        config: { ...baseConfig, language: 'go' as const },
        apiPath: 'api/resource.go',
        expectedSnippets: [
          'func (a *ResourceApi) QueryResources(rawQueryString string)',
          'AppendQueryString(BackendApiPath("/resources"), rawQueryString)',
        ],
      },
      {
        generator: new RustGenerator(),
        config: { ...baseConfig, language: 'rust' as const },
        apiPath: 'src/api/resource.rs',
        expectedSnippets: [
          'pub async fn query_resources(&self, raw_query_string: &str)',
          'append_query_string(backend_path(&"/resources".to_string()), raw_query_string)',
        ],
      },
      {
        generator: new JavaGenerator(),
        config: { ...baseConfig, language: 'java' as const },
        apiPath: 'src/main/java/com/sdkwork/backend/api/ResourceApi.java',
        expectedSnippets: [
          'public Void queryResources(String rawQueryString)',
          'ApiPaths.appendQueryString(ApiPaths.backendPath("/resources"), rawQueryString)',
        ],
      },
      {
        generator: new KotlinGenerator(),
        config: { ...baseConfig, language: 'kotlin' as const },
        apiPath: 'src/main/kotlin/com/sdkwork/backend/api/ResourceApi.kt',
        expectedSnippets: [
          'suspend fun queryResources(rawQueryString: String): Unit',
          'ApiPaths.appendQueryString(ApiPaths.backendPath("/resources"), rawQueryString)',
        ],
      },
      {
        generator: new CSharpGenerator(),
        config: { ...baseConfig, language: 'csharp' as const },
        apiPath: 'Api/ResourceApi.cs',
        expectedSnippets: [
          'public async Task QueryResourcesAsync(string rawQueryString)',
          'ApiPaths.AppendQueryString(ApiPaths.BackendPath("/resources"), rawQueryString)',
        ],
      },
      {
        generator: new SwiftGenerator(),
        config: { ...baseConfig, language: 'swift' as const },
        apiPath: 'Sources/API/ResourceApi.swift',
        expectedSnippets: [
          'public func queryResources(rawQueryString: String) async throws -> Void',
          'ApiPaths.appendQueryString(ApiPaths.backendPath("/resources"), rawQueryString)',
        ],
      },
      {
        generator: new PhpGenerator(),
        config: { ...baseConfig, language: 'php' as const },
        apiPath: 'src/Api/Resource.php',
        expectedSnippets: [
          'public function queryResources(string $rawQueryString): void',
          '$this->appendQueryString($path, $rawQueryString)',
        ],
      },
      {
        generator: new RubyGenerator(),
        config: { ...baseConfig, language: 'ruby' as const },
        apiPath: 'lib/sdkwork/backend_sdk/api/resource.rb',
        expectedSnippets: [
          'def query_resources(raw_query_string:)',
          'path = append_query_string(path, raw_query_string)',
        ],
      },
    ];

    for (const testCase of cases) {
      const result = await testCase.generator.generate(testCase.config, queryStringSpec);
      const apiFile = result.files.find((file) => file.path === testCase.apiPath);

      expect(result.errors).toEqual([]);
      expect(apiFile).toBeDefined();
      for (const snippet of testCase.expectedSnippets) {
        expect(apiFile!.content).toContain(snippet);
      }
    }
  });

  it('should preserve OpenAPI 3.2 additionalOperations method tokens across SDK languages', async () => {
    const additionalOperationSpec: ApiSpec = {
      openapi: '3.2.0',
      info: { title: 'Cross Language Additional Operations API', version: '1.0.0' },
      paths: {
        '/resources': {
          additionalOperations: {
            'x-example-method': {
              operationId: 'runExampleMethod',
              tags: ['Resource'],
              responses: { '204': { description: 'OK' } },
            },
          },
        },
      },
      components: { schemas: {} },
    };

    const cases = [
      {
        generator: new TypeScriptGenerator(),
        config: baseConfig,
        apiPath: 'src/api/resource.ts',
        expectedSnippet: "method: 'x-example-method' as any",
      },
      {
        generator: new PythonGenerator(),
        config: { ...baseConfig, language: 'python' as const },
        apiPath: 'sdkwork_backend_sdk/api/resource.py',
        expectedSnippet: "self._client.request('x-example-method'",
      },
      {
        generator: new DartGenerator(),
        config: { ...baseConfig, language: 'dart' as const },
        apiPath: 'lib/src/api/resource.dart',
        expectedSnippet: "_client.request('x-example-method'",
      },
      {
        generator: new FlutterGenerator(),
        config: { ...baseConfig, language: 'flutter' as const },
        apiPath: 'lib/src/api/resource.dart',
        expectedSnippet: "_client.request('x-example-method'",
      },
      {
        generator: new GoGenerator(),
        config: { ...baseConfig, language: 'go' as const },
        apiPath: 'api/resource.go',
        expectedSnippet: 'a.client.Request("x-example-method"',
      },
      {
        generator: new RustGenerator(),
        config: { ...baseConfig, language: 'rust' as const },
        apiPath: 'src/api/resource.rs',
        expectedSnippet: 'Method::from_bytes(b"x-example-method")',
      },
      {
        generator: new JavaGenerator(),
        config: { ...baseConfig, language: 'java' as const },
        apiPath: 'src/main/java/com/sdkwork/backend/api/ResourceApi.java',
        expectedSnippet: 'client.request("x-example-method"',
      },
      {
        generator: new KotlinGenerator(),
        config: { ...baseConfig, language: 'kotlin' as const },
        apiPath: 'src/main/kotlin/com/sdkwork/backend/api/ResourceApi.kt',
        expectedSnippet: 'client.request("x-example-method"',
      },
      {
        generator: new CSharpGenerator(),
        config: { ...baseConfig, language: 'csharp' as const },
        apiPath: 'Api/ResourceApi.cs',
        expectedSnippet: '_client.RequestAsync<object>("x-example-method"',
      },
      {
        generator: new SwiftGenerator(),
        config: { ...baseConfig, language: 'swift' as const },
        apiPath: 'Sources/API/ResourceApi.swift',
        expectedSnippet: 'client.request("x-example-method"',
      },
      {
        generator: new PhpGenerator(),
        config: { ...baseConfig, language: 'php' as const },
        apiPath: 'src/Api/Resource.php',
        expectedSnippet: "$this->client->request('x-example-method'",
      },
      {
        generator: new RubyGenerator(),
        config: { ...baseConfig, language: 'ruby' as const },
        apiPath: 'lib/sdkwork/backend_sdk/api/resource.rb',
        expectedSnippet: "@client.request('x-example-method'",
      },
    ];

    for (const testCase of cases) {
      const result = await testCase.generator.generate(testCase.config, additionalOperationSpec);
      const apiFile = result.files.find((file) => file.path === testCase.apiPath);

      expect(result.errors).toEqual([]);
      expect(apiFile).toBeDefined();
      expect(apiFile!.content).toContain(testCase.expectedSnippet);
    }
  });

  it('should fail explicitly when OpenAPI 3.2 querystring parameters are mixed with query parameters', async () => {
    const queryStringSpec: ApiSpec = {
      openapi: '3.2.0',
      info: { title: 'Mixed Query API', version: '1.0.0' },
      paths: {
        '/resources': {
          query: {
            operationId: 'queryResources',
            tags: ['Resource'],
            parameters: [
              {
                name: 'filter',
                in: 'querystring',
                required: true,
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                  },
                },
                schema: { type: 'string' },
              },
              {
                name: 'page',
                in: 'query',
                required: false,
                schema: { type: 'integer' },
              },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
      components: { schemas: {} },
    };

    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, queryStringSpec);

    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toContain('mixes OpenAPI 3.2 querystring parameters with query parameters');
    expect(result.files).toEqual([]);
  });

  it('should surface source error payloads when input is not an OpenAPI document', async () => {
    const generator = new TypeScriptGenerator();
    const upstreamErrorSpec = {
      code: '5005',
      msg: 'SERVER.FAIL',
      errorMsg: 'FAIL',
      data: null,
      paths: {},
      info: { title: 'Error Wrapper', version: '1.0.0' },
    } as unknown as ApiSpec;

    const result = await generator.generate(baseConfig, upstreamErrorSpec);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toContain('Source returned error payload');
    expect(result.errors[0].message).toContain('code=5005');
    expect(result.files.length).toBe(0);
    expect(result.stats.models).toBe(0);
    expect(result.stats.apis).toBe(0);
  });

  it('should fail generation when the spec uses external refs that cannot be resolved locally', async () => {
    const generator = new TypeScriptGenerator();
    const externalRefSpec: ApiSpec = {
      openapi: '3.0.3',
      info: { title: 'External Ref API', version: '1.0.0' },
      paths: {
        '/users': {
          get: {
            operationId: 'listUsers',
            tags: ['User'],
            responses: {
              '200': {
                $ref: 'https://example.com/openapi.yaml#/components/responses/UserList',
              } as any,
            },
          },
        },
      },
      components: { schemas: {} },
    };

    const result = await generator.generate(baseConfig, externalRefSpec);

    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toContain('external');
    expect(result.files.length).toBe(0);
  });

  it('should generate standardized TypeScript smoke tests when generateTests is enabled', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate({ ...baseConfig, generateTests: true }, mockSpec);
    const packageJsonFile = result.files.find((file) => file.path === 'package.json');
    const smokeTestFile = result.files.find((file) => file.path === 'test/sdk.smoke.test.mjs');

    expect(result.errors).toEqual([]);
    expect(packageJsonFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();

    const packageJson = JSON.parse(packageJsonFile!.content) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.test).toBe('npm run build && node --test ./test/**/*.test.mjs');
    expect(smokeTestFile!.content).toContain("import test from 'node:test';");
    expect(smokeTestFile!.content).toContain("import assert from 'node:assert/strict';");
    expect(smokeTestFile!.content).toContain('const client = new SdkworkBackendClient({');
    expect(smokeTestFile!.content).toContain('client.http.get = async (path, params, headers) => {');
    expect(smokeTestFile!.content).toContain('await client.user.listUsers()');
    expect(smokeTestFile!.content).toContain("assert.equal(captured.path, '/api/v1/users');");
  });

  it('should generate TypeScript smoke tests that assert body query and content type forwarding', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate({ ...baseConfig, generateTests: true }, postBodyAndQuerySpec);
    const smokeTestFile = result.files.find((file) => file.path === 'test/sdk.smoke.test.mjs');
    const readmeFile = result.files.find((file) => file.path === 'README.md');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('client.http.post = async (path, body, params, headers, contentType) => {');
    expect(smokeTestFile!.content).toContain('const body = {');
    expect(smokeTestFile!.content).toContain("  keyword: 'keyword',");
    expect(smokeTestFile!.content).toContain('const params = {');
    expect(smokeTestFile!.content).toContain('await client.tenant.listByPage(body, params)');
    expect(smokeTestFile!.content).toContain("assert.equal(captured.path, '/api/v1/tenant/list');");
    expect(smokeTestFile!.content).toContain("assert.deepEqual(captured.body, body);");
    expect(smokeTestFile!.content).toContain("assert.deepEqual(captured.params, params);");
    expect(smokeTestFile!.content).toContain("assert.equal(captured.contentType, 'application/json');");
    expect(readmeFile).toBeDefined();
    expect(readmeFile!.content).toContain('const body = {');
    expect(readmeFile!.content).toContain("  keyword: 'keyword',");
    expect(readmeFile!.content).toContain('const params = {');
    expect(readmeFile!.content).toContain('  page: 1,');
  });

  it('should sample composed query parameters correctly in TypeScript smoke tests', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate({ ...baseConfig, generateTests: true }, composedQueryParameterSpec);
    const smokeTestFile = result.files.find((file) => file.path === 'test/sdk.smoke.test.mjs');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('const params = {');
    expect(smokeTestFile!.content).toContain('  page: 1,');
    expect(smokeTestFile!.content).toContain('await client.tenant.listByPage(params)');
  });

  it('should generate concrete header samples in TypeScript README examples', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, composedHeaderParameterSpec);
    const readmeFile = result.files.find((file) => file.path === 'README.md');

    expect(result.errors).toEqual([]);
    expect(readmeFile).toBeDefined();
    expect(readmeFile!.content).toContain("const xTraceId = 'trace-token';");
    expect(readmeFile!.content).toContain('const params = {');
    expect(readmeFile!.content).toContain('  xTraceId,');
    expect(readmeFile!.content).toContain('const result = await client.tenant.listByPage(params);');
    expect(readmeFile!.content).not.toContain('const result = await client.tenant.listByPage(xTraceId);');
  });

  it('should generate TypeScript usage examples with combined query and header params objects', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate({ ...baseConfig, generateTests: true }, queryHeaderParameterSpec);
    const readmeFile = result.files.find((file) => file.path === 'README.md');
    const smokeTestFile = result.files.find((file) => file.path === 'test/sdk.smoke.test.mjs');

    expect(result.errors).toEqual([]);
    expect(readmeFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(readmeFile!.content).toContain("const xTraceId = 'X-Trace-Id';");
    expect(readmeFile!.content).toContain('const query = {');
    expect(readmeFile!.content).toContain('  page: 1,');
    expect(readmeFile!.content).toContain('const params = {');
    expect(readmeFile!.content).toContain('  ...query,');
    expect(readmeFile!.content).toContain('  xTraceId,');
    expect(readmeFile!.content).toContain('const result = await client.resource.listResources(params);');
    expect(smokeTestFile!.content).toContain("const xTraceId = 'X-Trace-Id';");
    expect(smokeTestFile!.content).toContain('const query = {');
    expect(smokeTestFile!.content).toContain('  page: 1,');
    expect(smokeTestFile!.content).toContain('const params = {');
    expect(smokeTestFile!.content).toContain('  ...query,');
    expect(smokeTestFile!.content).toContain('  xTraceId,');
    expect(smokeTestFile!.content).toContain('await client.resource.listResources(params);');
    expect(smokeTestFile!.content).toContain('assert.deepEqual(captured.params, query);');
    expect(smokeTestFile!.content).toContain("assert.equal(captured.headers['X-Trace-Id'], xTraceId);");
  });

  it('should generate named header and cookie usage examples instead of generic headers maps across languages', async () => {
    const cases = [
      {
        language: 'typescript',
        generator: new TypeScriptGenerator(),
        config: { ...baseConfig, language: 'typescript' as const, generateTests: true },
        readmePath: 'README.md',
        smokePath: 'test/sdk.smoke.test.mjs',
        expectedReadme: [
          "const xTraceId = 'X-Trace-Id';",
          "const sessionId = 'session_id';",
          'const params = {',
          '  xTraceId,',
          '  sessionId,',
          'const result = await client.resource.listResources(params);',
        ],
        expectedSmoke: [
          "const xTraceId = 'X-Trace-Id';",
          "const sessionId = 'session_id';",
          'const params = {',
          '  xTraceId,',
          '  sessionId,',
          'await client.resource.listResources(params);',
          "assert.equal(captured.headers['X-Trace-Id'], xTraceId);",
          "assert.equal(captured.headers.Cookie, `session_id=${encodeURIComponent(sessionId)}`);",
        ],
        forbidden: ['const headers = {', 'assert.deepEqual(captured.headers, headers);'],
      },
      {
        language: 'python',
        generator: new PythonGenerator(),
        config: { ...baseConfig, language: 'python' as const, generateTests: true },
        readmePath: 'README.md',
        smokePath: 'tests/test_sdk_smoke.py',
        expectedReadme: [
          "x_trace_id = 'X-Trace-Id'",
          "session_id = 'session_id'",
          'result = client.resource.list_resources(x_trace_id, session_id)',
        ],
        expectedSmoke: [
          "x_trace_id = 'X-Trace-Id'",
          "session_id = 'session_id'",
          'client.resource.list_resources(x_trace_id, session_id)',
          "assert captured['headers']['X-Trace-Id'] == x_trace_id",
          "assert captured['headers']['Cookie'] == f'session_id={quote(str(session_id), safe=\"\")}'",
        ],
        forbidden: ['headers = {', "assert captured['headers'] == headers"],
      },
      {
        language: 'go',
        generator: new GoGenerator(),
        config: { ...baseConfig, language: 'go' as const, generateTests: true },
        readmePath: 'README.md',
        smokePath: 'sdk_smoke_test.go',
        expectedReadme: [
          'xTraceId := "X-Trace-Id"',
          'sessionId := "session_id"',
          'result, err := client.Resource.ListResources(xTraceId, &sessionId)',
        ],
        expectedSmoke: [
          'xTraceId := "X-Trace-Id"',
          'sessionId := "session_id"',
          '_, err := client.Resource.ListResources(xTraceId, &sessionId)',
          'if capturedHeaders.Get("X-Trace-Id") != xTraceId {',
          'if capturedHeaders.Get("Cookie") != "session_id="+url.QueryEscape(sessionId) {',
        ],
        forbidden: ['headers := map[string]string{', 'client.Resource.ListResources(headers)'],
      },
      {
        language: 'java',
        generator: new JavaGenerator(),
        config: { ...baseConfig, language: 'java' as const, generateTests: true },
        readmePath: 'README.md',
        smokePath: 'src/test/java/com/sdkwork/backend/GeneratedSdkSmokeTest.java',
        expectedReadme: [
          'String xTraceId = "X-Trace-Id";',
          'String sessionId = "session_id";',
          'client.getResource().listResources(xTraceId, sessionId);',
        ],
        expectedSmoke: [
          'String xTraceId = "X-Trace-Id";',
          'String sessionId = "session_id";',
          'client.getResource().listResources(xTraceId, sessionId);',
          'assertEquals(xTraceId, capturedHeaders.get("X-Trace-Id"));',
          'assertEquals("session_id=" + URLEncoder.encode(sessionId, StandardCharsets.UTF_8), capturedHeaders.get("Cookie"));',
        ],
        forbidden: ['Map<String, String> headers = new LinkedHashMap<>();', 'listResources(headers)'],
      },
      {
        language: 'kotlin',
        generator: new KotlinGenerator(),
        config: { ...baseConfig, language: 'kotlin' as const, generateTests: true },
        readmePath: 'README.md',
        smokePath: 'src/test/kotlin/com/sdkwork/backend/GeneratedSdkSmokeTest.kt',
        expectedReadme: [
          'val xTraceId = "X-Trace-Id"',
          'val sessionId = "session_id"',
          'client.resource.listResources(xTraceId, sessionId)',
        ],
        expectedSmoke: [
          'val xTraceId = "X-Trace-Id"',
          'val sessionId = "session_id"',
          'client.resource.listResources(xTraceId, sessionId)',
          'assertEquals(xTraceId, capturedHeaders["X-Trace-Id"])',
          'assertEquals("session_id=" + URLEncoder.encode(sessionId, StandardCharsets.UTF_8), capturedHeaders["Cookie"])',
        ],
        forbidden: ['val headers = linkedMapOf<String, String>(', 'listResources(headers)'],
      },
      {
        language: 'dart',
        generator: new DartGenerator(),
        config: { ...baseConfig, language: 'dart' as const, generateTests: true },
        readmePath: 'README.md',
        smokePath: 'test/generated_sdk_smoke_test.dart',
        expectedReadme: [
          "final xTraceId = 'X-Trace-Id';",
          "final sessionId = 'session_id';",
          'await client.resource.listResources(xTraceId, sessionId);',
        ],
        expectedSmoke: [
          "final xTraceId = 'X-Trace-Id';",
          "final sessionId = 'session_id';",
          'await client.resource.listResources(xTraceId, sessionId);',
          "expect(capturedHeaders['x-trace-id'], xTraceId);",
          "expect(capturedHeaders['cookie'], 'session_id=${Uri.encodeQueryComponent(sessionId)}');",
        ],
        forbidden: ['final headers = <String, String>{', 'listResources(headers)'],
      },
      {
        language: 'flutter',
        generator: new FlutterGenerator(),
        config: { ...baseConfig, language: 'flutter' as const, generateTests: true },
        readmePath: 'README.md',
        smokePath: 'test/generated_sdk_smoke_test.dart',
        expectedReadme: [
          "final xTraceId = 'X-Trace-Id';",
          "final sessionId = 'session_id';",
          'await client.resource.listResources(xTraceId, sessionId);',
        ],
        expectedSmoke: [
          "final xTraceId = 'X-Trace-Id';",
          "final sessionId = 'session_id';",
          'await client.resource.listResources(xTraceId, sessionId);',
          "expect(capturedHeaders['x-trace-id'], xTraceId);",
          "expect(capturedHeaders['cookie'], 'session_id=${Uri.encodeQueryComponent(sessionId)}');",
        ],
        forbidden: ['final headers = <String, String>{', 'listResources(headers)'],
      },
      {
        language: 'swift',
        generator: new SwiftGenerator(),
        config: { ...baseConfig, language: 'swift' as const, generateTests: true },
        readmePath: 'README.md',
        smokePath: 'Tests/BackendSDKTests/GeneratedSdkSmokeTests.swift',
        expectedReadme: [
          'let xTraceId = "X-Trace-Id"',
          'let sessionId = "session_id"',
          'try await client.resource.listResources(xTraceId: xTraceId, sessionId: sessionId)',
        ],
        expectedSmoke: [
          'let xTraceId = "X-Trace-Id"',
          'let sessionId = "session_id"',
          'try await client.resource.listResources(xTraceId: xTraceId, sessionId: sessionId)',
          'XCTAssertEqual(xTraceId, capturedHeaders["X-Trace-Id"])',
          'XCTAssertEqual("session_id=\\(percentEncode(sessionId))", capturedHeaders["Cookie"])',
        ],
        forbidden: ['let headers: [String: String] = [', 'headers: headers'],
      },
      {
        language: 'csharp',
        generator: new CSharpGenerator(),
        config: { ...baseConfig, language: 'csharp' as const, generateTests: true },
        readmePath: 'README.md',
        smokePath: 'Tests/GeneratedSdkSmokeTests.cs',
        expectedReadme: [
          'var xTraceId = "X-Trace-Id";',
          'var sessionId = "session_id";',
          'await client.Resource.ListResourcesAsync(xTraceId, sessionId);',
        ],
        expectedSmoke: [
          'var xTraceId = "X-Trace-Id";',
          'var sessionId = "session_id";',
          'await client.Resource.ListResourcesAsync(xTraceId, sessionId);',
          'Assert.Equal(xTraceId, capturedHeaders["X-Trace-Id"]);',
          'Assert.Equal("session_id=" + Uri.EscapeDataString(sessionId), capturedHeaders["Cookie"]);',
        ],
        forbidden: ['var headers = new Dictionary<string, string>', 'ListResourcesAsync(headers)'],
      },
      {
        language: 'rust',
        generator: new RustGenerator(),
        config: { ...baseConfig, language: 'rust' as const, generateTests: true },
        readmePath: 'README.md',
        smokePath: 'tests/generated_sdk_smoke.rs',
        expectedReadme: [
          'let x_trace_id = "X-Trace-Id";',
          'let session_id = "session_id";',
          'client.resource().list_resources(x_trace_id, Some(session_id)).await?;',
        ],
        expectedSmoke: [
          'let x_trace_id = "X-Trace-Id";',
          'let session_id = "session_id";',
          'client.resource().list_resources(x_trace_id, Some(session_id)).await?;',
          'assert_eq!(captured.headers.get("x-trace-id").map(String::as_str), Some(x_trace_id));',
          'assert_eq!(captured.headers.get("cookie").map(String::as_str), Some(&format!("session_id={}", percent_encode(session_id))));',
        ],
        forbidden: ['client.resource().list_resources(Some(&headers))', 'list_resources(x_trace_id, Some(&headers))'],
      },
      {
        language: 'php',
        generator: new PhpGenerator(),
        config: { ...baseConfig, language: 'php' as const, generateTests: true },
        readmePath: 'README.md',
        smokePath: 'tests/GeneratedSdkSmokeTest.php',
        expectedReadme: [
          "$xTraceId = 'X-Trace-Id';",
          "$sessionId = 'session_id';",
          '$client->resource->listResources($xTraceId, $sessionId);',
        ],
        expectedSmoke: [
          "$xTraceId = 'X-Trace-Id';",
          "$sessionId = 'session_id';",
          '$client->resource->listResources($xTraceId, $sessionId);',
          "self::assertSame($xTraceId, $request->getHeaderLine('X-Trace-Id'));",
          "self::assertSame('session_id=' . rawurlencode($sessionId), $request->getHeaderLine('Cookie'));",
        ],
        forbidden: ['$headers = [', 'listResources($headers)'],
      },
      {
        language: 'ruby',
        generator: new RubyGenerator(),
        config: { ...baseConfig, language: 'ruby' as const, generateTests: true },
        readmePath: 'README.md',
        smokePath: 'test/generated_sdk_smoke_test.rb',
        expectedReadme: [
          "x_trace_id = 'X-Trace-Id'",
          "session_id = 'session_id'",
          'client.resource.list_resources(x_trace_id, session_id: session_id)',
        ],
        expectedSmoke: [
          "x_trace_id = 'X-Trace-Id'",
          "session_id = 'session_id'",
          'client.resource.list_resources(x_trace_id, session_id: session_id)',
          "assert_equal x_trace_id, captured[:headers]['X-Trace-Id']",
          "assert_equal \"session_id=#{CGI.escape(session_id)}\", captured[:headers]['Cookie']",
        ],
        forbidden: ['headers = {', 'headers: headers'],
      },
    ];

    for (const testCase of cases) {
      const result = await testCase.generator.generate(testCase.config, headerCookieParameterSpec);
      const readmeFile = result.files.find((file) => file.path === testCase.readmePath);
      const smokeTestFile = result.files.find((file) => file.path === testCase.smokePath);

      expect(result.errors, testCase.language).toEqual([]);
      expect(readmeFile, testCase.language).toBeDefined();
      expect(smokeTestFile, testCase.language).toBeDefined();
      for (const expected of testCase.expectedReadme) {
        expect(readmeFile!.content, `${testCase.language} README: ${expected}`).toContain(expected);
      }
      for (const expected of testCase.expectedSmoke) {
        expect(smokeTestFile!.content, `${testCase.language} smoke: ${expected}`).toContain(expected);
      }
      for (const forbidden of testCase.forbidden) {
        expect(readmeFile!.content, `${testCase.language} README forbidden: ${forbidden}`).not.toContain(forbidden);
        expect(smokeTestFile!.content, `${testCase.language} smoke forbidden: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('should generate standardized Dart smoke tests when generateTests is enabled', async () => {
    const generator = new DartGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'dart', generateTests: true }, mockSpec);
    const pubspecFile = result.files.find((file) => file.path === 'pubspec.yaml');
    const smokeTestFile = result.files.find((file) => file.path === 'test/generated_sdk_smoke_test.dart');

    expect(result.errors).toEqual([]);
    expect(pubspecFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(pubspecFile!.content).toContain('test: ^1.24.0');
    expect(smokeTestFile!.content).not.toContain("import 'dart:convert';");
    expect(smokeTestFile!.content).toContain("import 'dart:io';");
    expect(smokeTestFile!.content).toContain("import 'package:test/test.dart';");
    expect(smokeTestFile!.content).toContain("import 'package:sdkwork_backend_sdk_dart/sdkwork_backend_sdk_dart.dart';");
    expect(smokeTestFile!.content).toContain('final client = SdkworkBackendClient(');
    expect(smokeTestFile!.content).toContain('await client.user.listUsers();');
    expect(smokeTestFile!.content).toContain("expect(capturedPath, '/api/v1/users');");
  });

  it('should generate Dart smoke tests that assert body query and typed response forwarding', async () => {
    const generator = new DartGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'dart', generateTests: true }, postBodyAndQuerySpec);
    const smokeTestFile = result.files.find((file) => file.path === 'test/generated_sdk_smoke_test.dart');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('final body = PlusTenantQueryListForm(');
    expect(smokeTestFile!.content).toContain("keyword: 'keyword'");
    expect(smokeTestFile!.content).toContain('final params = <String, dynamic>{');
    expect(smokeTestFile!.content).toContain("'page': 1");
    expect(smokeTestFile!.content).toContain('final result = await client.tenant.listByPage(body, params);');
    expect(smokeTestFile!.content).toContain("expect(capturedPath, '/api/v1/tenant/list');");
    expect(smokeTestFile!.content).toContain("expect(capturedQuery['page'], '1');");
    expect(smokeTestFile!.content).toContain("expect(capturedContentType.startsWith('application/json'), isTrue);");
    expect(smokeTestFile!.content).toContain('expect(jsonDecode(utf8.decode(capturedBody)), body.toJson());');
    expect(smokeTestFile!.content).toContain("expect(result?.code, 'ok');");
  });

  it('should sample composed query parameters correctly in Dart smoke tests', async () => {
    const generator = new DartGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'dart', generateTests: true }, composedQueryParameterSpec);
    const smokeTestFile = result.files.find((file) => file.path === 'test/generated_sdk_smoke_test.dart');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('final params = <String, dynamic>{');
    expect(smokeTestFile!.content).toContain("'page': 1");
    expect(smokeTestFile!.content).toContain("expect(capturedQuery['page'], '1');");
  });

  it('should generate standardized Rust smoke tests when generateTests is enabled', async () => {
    const generator = new RustGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'rust', generateTests: true }, mockSpec);
    const cargoFile = result.files.find((file) => file.path === 'Cargo.toml');
    const smokeTestFile = result.files.find((file) => file.path === 'tests/generated_sdk_smoke.rs');

    expect(result.errors).toEqual([]);
    expect(cargoFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(cargoFile!.content).toContain('tokio = { version = "1.0", features = ["macros", "rt-multi-thread"] }');
    expect(smokeTestFile!.content).toContain('use sdkwork_backend_sdk::{SdkworkBackendClient, SdkworkConfig};');
    expect(smokeTestFile!.content).toContain('#[tokio::test]');
    expect(smokeTestFile!.content).toContain('client.user().list_users().await?;');
    expect(smokeTestFile!.content).toContain('assert_eq!(captured.path, "/api/v1/users");');
  });

  it('should generate Rust smoke tests that assert body query and typed response forwarding', async () => {
    const generator = new RustGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'rust', generateTests: true }, postBodyAndQuerySpec);
    const smokeTestFile = result.files.find((file) => file.path === 'tests/generated_sdk_smoke.rs');
    const readmeFile = result.files.find((file) => file.path === 'README.md');
    const usageExamplesSection = readmeFile?.content.split('## Usage Examples')[1] || '';
    const errorHandlingSection = (readmeFile?.content.split('## Error Handling')[1] || '').split('## License')[0] || '';

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(readmeFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('let body = PlusTenantQueryListForm {');
    expect(smokeTestFile!.content).toContain('keyword: Some("keyword".to_string())');
    expect(smokeTestFile!.content).toContain('let mut query = HashMap::new();');
    expect(smokeTestFile!.content).toContain('query.insert("page".to_string(), serde_json::json!(1));');
    expect(smokeTestFile!.content).toContain('let result = client.tenant().list_by_page(&body, Some(&query)).await?;');
    expect(smokeTestFile!.content).toContain('assert_eq!(captured.path, "/api/v1/tenant/list");');
    expect(smokeTestFile!.content).toContain('assert_eq!(captured.query.get("page").map(String::as_str), Some("1"));');
    expect(smokeTestFile!.content).toContain('assert!(captured.content_type.starts_with("application/json"));');
    expect(smokeTestFile!.content).toContain('assert_json_eq(&captured.body, &serde_json::to_vec(&body)?);');
    expect(smokeTestFile!.content).toContain('assert_eq!(result.code.as_deref(), Some("ok"));');
    expect(readmeFile!.content).toContain('## Usage Examples');
    expect(usageExamplesSection).toContain('use std::collections::HashMap;');
    expect(usageExamplesSection).toContain('let body = PlusTenantQueryListForm {');
    expect(usageExamplesSection).toContain('query.insert("page".to_string(), serde_json::json!(1));');
    expect(usageExamplesSection).toContain('let result = client.tenant().list_by_page(&body, Some(&query)).await?;');
    expect(errorHandlingSection).toContain('let client = SdkworkBackendClient::new(SdkworkConfig::new("https://api.example.com"))?;');
    expect(errorHandlingSection).toContain('let body = PlusTenantQueryListForm {');
    expect(errorHandlingSection).toContain('query.insert("page".to_string(), serde_json::json!(1));');
    expect(errorHandlingSection).toContain('client.tenant().list_by_page(&body, Some(&query)).await?;');
  });

  it('should sample composed query parameters correctly in Rust smoke tests', async () => {
    const generator = new RustGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'rust', generateTests: true }, composedQueryParameterSpec);
    const smokeTestFile = result.files.find((file) => file.path === 'tests/generated_sdk_smoke.rs');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('let mut query = HashMap::new();');
    expect(smokeTestFile!.content).toContain('query.insert("page".to_string(), serde_json::json!(1));');
    expect(smokeTestFile!.content).toContain('assert_eq!(captured.query.get("page").map(String::as_str), Some("1"));');
  });

  it('should generate standardized PHP smoke tests when generateTests is enabled', async () => {
    const generator = new PhpGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'php', generateTests: true }, mockSpec);
    const composerFile = result.files.find((file) => file.path === 'composer.json');
    const smokeTestFile = result.files.find((file) => file.path === 'tests/GeneratedSdkSmokeTest.php');

    expect(result.errors).toEqual([]);
    expect(composerFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(composerFile!.content).toContain('"phpunit/phpunit": "^11.0"');
    expect(smokeTestFile!.content).toContain('use PHPUnit\\Framework\\TestCase;');
    expect(smokeTestFile!.content).toContain('new MockHandler([');
    expect(smokeTestFile!.content).toContain('$client = new SdkworkBackendClient($config);');
    expect(smokeTestFile!.content).toContain('$client->user->listUsers();');
    expect(smokeTestFile!.content).toContain("self::assertSame('/api/v1/users', \$request->getUri()->getPath());");
  });

  it('should generate PHP smoke tests that assert body query and typed response forwarding', async () => {
    const generator = new PhpGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'php', generateTests: true }, postBodyAndQuerySpec);
    const smokeTestFile = result.files.find((file) => file.path === 'tests/GeneratedSdkSmokeTest.php');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain("\$body = new PlusTenantQueryListForm(['keyword' => 'keyword']);");
    expect(smokeTestFile!.content).toContain("\$params = ['page' => 1, 'size' => 2];");
    expect(smokeTestFile!.content).toContain('$result = $client->tenant->listByPage($body, $params);');
    expect(smokeTestFile!.content).toContain("self::assertSame('/api/v1/tenant/list', \$request->getUri()->getPath());");
    expect(smokeTestFile!.content).toContain("self::assertSame('1', \$query['page'] ?? null);");
    expect(smokeTestFile!.content).toContain("self::assertStringStartsWith('application/json', \$request->getHeaderLine('Content-Type'));");
    expect(smokeTestFile!.content).toContain("self::assertJsonStringEqualsJsonString(json_encode(\$body->toArray(), JSON_THROW_ON_ERROR), (string) \$request->getBody());");
    expect(smokeTestFile!.content).toContain("self::assertSame('ok', \$result?->code);");
  });

  it('should generate PHP README sections with planner-backed body query examples', async () => {
    const generator = new PhpGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'php' }, postBodyAndQuerySpec);
    const readmeFile = result.files.find((file) => file.path === 'README.md');
    const usageExamplesSection = readmeFile?.content.split('## Usage Examples')[1] || '';
    const errorHandlingSection = (readmeFile?.content.split('## Error Handling')[1] || '').split('## License')[0] || '';

    expect(result.errors).toEqual([]);
    expect(readmeFile).toBeDefined();
    expect(readmeFile!.content).toContain('## Configuration (Non-Auth)');
    expect(readmeFile!.content).toContain('$client->setHeader(\'X-Custom-Header\', \'value\');');
    expect(readmeFile!.content).toContain('## Usage Examples');
    expect(readmeFile!.content).toContain('## Error Handling');
    expect(usageExamplesSection).toContain("$body = new PlusTenantQueryListForm(['keyword' => 'keyword']);");
    expect(usageExamplesSection).toContain("\$params = ['page' => 1, 'size' => 2];");
    expect(usageExamplesSection).toContain('$result = $client->tenant->listByPage($body, $params);');
    expect(errorHandlingSection).toContain("$body = new PlusTenantQueryListForm(['keyword' => 'keyword']);");
    expect(errorHandlingSection).toContain("\$params = ['page' => 1, 'size' => 2];");
    expect(errorHandlingSection).toContain('$client->tenant->listByPage($body, $params);');
    expect(errorHandlingSection).toContain('try {');
    expect(errorHandlingSection).toContain('catch (\\Throwable $e)');
  });

  it('should generate concrete PHP array request body samples in smoke tests and README examples', async () => {
    const generator = new PhpGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'php', generateTests: true }, arrayBodySpec);
    const smokeTestFile = result.files.find((file) => file.path === 'tests/GeneratedSdkSmokeTest.php');
    const readmeFile = result.files.find((file) => file.path === 'README.md');
    const usageExamplesSection = readmeFile?.content.split('## Usage Examples')[1] || '';

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(readmeFile).toBeDefined();
    expect(smokeTestFile!.content).toContain("\$body = ['item'];");
    expect(smokeTestFile!.content).toContain('$result = $client->tenant->batchCreate($body);');
    expect(smokeTestFile!.content).toContain("self::assertJsonStringEqualsJsonString(json_encode(\$body, JSON_THROW_ON_ERROR), (string) \$request->getBody());");
    expect(usageExamplesSection).toContain("\$body = ['item'];");
    expect(usageExamplesSection).toContain('$result = $client->tenant->batchCreate($body);');
  });

  it('should sample composed query parameters correctly in PHP smoke tests', async () => {
    const generator = new PhpGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'php', generateTests: true }, composedQueryParameterSpec);
    const smokeTestFile = result.files.find((file) => file.path === 'tests/GeneratedSdkSmokeTest.php');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain("\$params = ['page' => 1];");
    expect(smokeTestFile!.content).toContain("self::assertSame('1', \$query['page'] ?? null);");
  });

  it('should generate standardized Ruby smoke tests when generateTests is enabled', async () => {
    const generator = new RubyGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'ruby', generateTests: true }, mockSpec);
    const gemspecFile = result.files.find((file) => file.path === 'sdkwork-backend-sdk.gemspec');
    const smokeTestFile = result.files.find((file) => file.path === 'test/generated_sdk_smoke_test.rb');

    expect(result.errors).toEqual([]);
    expect(gemspecFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(gemspecFile!.content).toContain("spec.add_development_dependency 'minitest'");
    expect(smokeTestFile!.content).toContain("require 'minitest/autorun'");
    expect(smokeTestFile!.content).toContain("require 'faraday/adapter/test'");
    expect(smokeTestFile!.content).toContain('client = Sdkwork::BackendSdk::SdkworkBackendClient.new(config)');
    expect(smokeTestFile!.content).toContain('client.user.list_users');
    expect(smokeTestFile!.content).toContain("assert_equal '/api/v1/users', captured[:path]");
  });

  it('should generate Ruby smoke tests that assert body query and typed response forwarding', async () => {
    const generator = new RubyGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'ruby', generateTests: true }, postBodyAndQuerySpec);
    const smokeTestFile = result.files.find((file) => file.path === 'test/generated_sdk_smoke_test.rb');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain("body = Sdkwork::BackendSdk::Models::PlusTenantQueryListForm.new('keyword' => 'keyword')");
    expect(smokeTestFile!.content).toContain("params = { 'page' => 1, 'size' => 2 }");
    expect(smokeTestFile!.content).toContain('result = client.tenant.list_by_page(body: body, params: params)');
    expect(smokeTestFile!.content).toContain("assert_equal '/api/v1/tenant/list', captured[:path]");
    expect(smokeTestFile!.content).toContain("assert_equal '1', captured[:query]['page']");
    expect(smokeTestFile!.content).toContain("assert captured[:content_type].start_with?('application/json')");
    expect(smokeTestFile!.content).toContain('assert_json_equal(JSON.generate(body.to_hash), captured[:body])');
    expect(smokeTestFile!.content).toContain("assert_equal 'ok', result&.code");
  });

  it('should generate Ruby README sections with planner-backed body query examples', async () => {
    const generator = new RubyGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'ruby' }, postBodyAndQuerySpec);
    const readmeFile = result.files.find((file) => file.path === 'README.md');
    const usageExamplesSection = readmeFile?.content.split('## Usage Examples')[1] || '';
    const errorHandlingSection = (readmeFile?.content.split('## Error Handling')[1] || '').split('## License')[0] || '';

    expect(result.errors).toEqual([]);
    expect(readmeFile).toBeDefined();
    expect(readmeFile!.content).toContain('## Configuration (Non-Auth)');
    expect(readmeFile!.content).toContain("client.set_header('X-Custom-Header', 'value')");
    expect(readmeFile!.content).toContain('## Usage Examples');
    expect(readmeFile!.content).toContain('## Error Handling');
    expect(usageExamplesSection).toContain("body = Sdkwork::BackendSdk::Models::PlusTenantQueryListForm.new('keyword' => 'keyword')");
    expect(usageExamplesSection).toContain("params = { 'page' => 1, 'size' => 2 }");
    expect(usageExamplesSection).toContain('result = client.tenant.list_by_page(body: body, params: params)');
    expect(errorHandlingSection).toContain("body = Sdkwork::BackendSdk::Models::PlusTenantQueryListForm.new('keyword' => 'keyword')");
    expect(errorHandlingSection).toContain("params = { 'page' => 1, 'size' => 2 }");
    expect(errorHandlingSection).toContain('client.tenant.list_by_page(body: body, params: params)');
    expect(errorHandlingSection).toContain('begin');
    expect(errorHandlingSection).toContain('rescue StandardError => e');
  });

  it('should generate standardized Python smoke tests when generateTests is enabled', async () => {
    const generator = new PythonGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'python', generateTests: true }, mockSpec);
    const pyprojectFile = result.files.find((file) => file.path === 'pyproject.toml');
    const smokeTestFile = result.files.find((file) => file.path === 'tests/test_sdk_smoke.py');

    expect(result.errors).toEqual([]);
    expect(pyprojectFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(pyprojectFile!.content).toContain('testpaths = ["tests"]');
    expect(smokeTestFile!.content).toContain('def test_generated_sdk_forwards_request_metadata():');
    expect(smokeTestFile!.content).toContain('client = SdkworkBackendClient(');
    expect(smokeTestFile!.content).toContain('client.http.get = fake_get');
    expect(smokeTestFile!.content).toContain('client.user.list_users()');
    expect(smokeTestFile!.content).toContain("assert captured['path'] == '/api/v1/users'");
  });

  it('should generate Python smoke tests and README examples with concrete request body samples', async () => {
    const generator = new PythonGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'python', generateTests: true }, postBodyAndQuerySpec);
    const smokeTestFile = result.files.find((file) => file.path === 'tests/test_sdk_smoke.py');
    const readmeFile = result.files.find((file) => file.path === 'README.md');
    const usageExamplesSection = readmeFile?.content.split('## Usage Examples')[1] || '';
    const errorHandlingSection = (readmeFile?.content.split('## Error Handling')[1] || '').split('## License')[0] || '';

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(readmeFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('body = {');
    expect(smokeTestFile!.content).toContain("    'keyword': 'keyword',");
    expect(smokeTestFile!.content).toContain('params = {');
    expect(smokeTestFile!.content).toContain("    'page': 1,");
    expect(smokeTestFile!.content).toContain('client.tenant.list_by_page(body, params)');
    expect(smokeTestFile!.content).toContain("assert captured['json'] == body");
    expect(readmeFile!.content).toContain('## Configuration (Non-Auth)');
    expect(readmeFile!.content).toContain("client.set_header('X-Custom-Header', 'value')");
    expect(readmeFile!.content).toContain('## Usage Examples');
    expect(readmeFile!.content).toContain('## Error Handling');
    expect(readmeFile!.content).toContain('body = {');
    expect(readmeFile!.content).toContain("    'keyword': 'keyword',");
    expect(readmeFile!.content).toContain('result = client.tenant.list_by_page(body, params)');
    expect(usageExamplesSection).toContain('body = {');
    expect(usageExamplesSection).toContain("    'keyword': 'keyword',");
    expect(usageExamplesSection).toContain('result = client.tenant.list_by_page(body, params)');
    expect(errorHandlingSection).toContain('body = {');
    expect(errorHandlingSection).toContain("    'keyword': 'keyword',");
    expect(errorHandlingSection).toContain('client.tenant.list_by_page(body, params)');
    expect(errorHandlingSection).toContain('try:');
    expect(errorHandlingSection).toContain('except Exception as error:');
  });

  it('should sample composed query parameters correctly in Python smoke tests', async () => {
    const generator = new PythonGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'python', generateTests: true }, composedQueryParameterSpec);
    const smokeTestFile = result.files.find((file) => file.path === 'tests/test_sdk_smoke.py');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('params = {');
    expect(smokeTestFile!.content).toContain("    'page': 1,");
    expect(smokeTestFile!.content).toContain('client.tenant.list_by_page(params)');
  });

  it('should generate standardized Go smoke tests when generateTests is enabled', async () => {
    const generator = new GoGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'go', generateTests: true }, mockSpec);
    const goModFile = result.files.find((file) => file.path === 'go.mod');
    const smokeTestFile = result.files.find((file) => file.path === 'sdk_smoke_test.go');

    expect(result.errors).toEqual([]);
    expect(goModFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('package backend_test');
    expect(smokeTestFile!.content).toContain('"net/http/httptest"');
    expect(smokeTestFile!.content).toContain('client := backend.NewSdkworkBackendClientWithConfig(cfg)');
    expect(smokeTestFile!.content).toContain('_, err := client.User.ListUsers()');
    expect(smokeTestFile!.content).toContain('if capturedPath != "/api/v1/users" {');
  });

  it('should generate Go smoke tests that assert body query and content type forwarding', async () => {
    const generator = new GoGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'go', generateTests: true }, postBodyAndQuerySpec);
    const smokeTestFile = result.files.find((file) => file.path === 'sdk_smoke_test.go');
    const readmeFile = result.files.find((file) => file.path === 'README.md');
    const usageExamplesSection = readmeFile?.content.split('## Usage Examples')[1] || '';
    const errorHandlingSection = (readmeFile?.content.split('## Error Handling')[1] || '').split('## License')[0] || '';

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('sdktypes "github.com/sdkwork/backend-sdk/types"');
    expect(smokeTestFile!.content).toContain('body := &sdktypes.PlusTenantQueryListForm{');
    expect(smokeTestFile!.content).toContain('Keyword: "keyword",');
    expect(smokeTestFile!.content).toContain('params := map[string]interface{}{');
    expect(smokeTestFile!.content).toContain('_, err := client.Tenant.ListByPage(body, params)');
    expect(smokeTestFile!.content).toContain('if capturedQuery.Get("page") != "1" {');
    expect(smokeTestFile!.content).toContain('if capturedContentType != "application/json" {');
    expect(smokeTestFile!.content).toContain('assertJSONEqual(t, marshalJSON(t, body), capturedBody)');
    expect(readmeFile).toBeDefined();
    expect(usageExamplesSection).toContain('body := &sdktypes.PlusTenantQueryListForm{');
    expect(usageExamplesSection).toContain('Keyword: "keyword",');
    expect(usageExamplesSection).toContain('params := map[string]interface{}{');
    expect(usageExamplesSection).toContain('result, err := client.Tenant.ListByPage(body, params)');
    expect(errorHandlingSection).toContain('body := &sdktypes.PlusTenantQueryListForm{');
    expect(errorHandlingSection).toContain('params := map[string]interface{}{');
    expect(errorHandlingSection).toContain('_, err := client.Tenant.ListByPage(body, params)');
  });

  it('should generate concrete Go array request body samples in smoke tests and README examples', async () => {
    const generator = new GoGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'go', generateTests: true }, arrayBodySpec);
    const smokeTestFile = result.files.find((file) => file.path === 'sdk_smoke_test.go');
    const readmeFile = result.files.find((file) => file.path === 'README.md');
    const usageExamplesSection = readmeFile?.content.split('## Usage Examples')[1] || '';

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(readmeFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('body := &sdktypes.BatchCreateRequest{');
    expect(smokeTestFile!.content).toContain('"item",');
    expect(smokeTestFile!.content).toContain('_, err := client.Tenant.BatchCreate(body)');
    expect(smokeTestFile!.content).toContain('assertJSONEqual(t, marshalJSON(t, body), capturedBody)');
    expect(usageExamplesSection).toContain('body := &sdktypes.BatchCreateRequest{');
    expect(usageExamplesSection).toContain('"item",');
    expect(usageExamplesSection).toContain('result, err := client.Tenant.BatchCreate(body)');
  });

  it('should sample composed header parameters correctly in Go smoke tests', async () => {
    const generator = new GoGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'go', generateTests: true }, composedHeaderParameterSpec);
    const smokeTestFile = result.files.find((file) => file.path === 'sdk_smoke_test.go');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('xTraceId := "trace-token"');
    expect(smokeTestFile!.content).toContain('_, err := client.Tenant.ListByPage(&xTraceId)');
    expect(smokeTestFile!.content).toContain('if capturedHeaders.Get("X-Trace-Id") != xTraceId {');
  });

  it('should sample composed referenced query parameters correctly in Go smoke tests', async () => {
    const generator = new GoGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'go', generateTests: true }, composedReferencedQueryParameterSpec);
    const smokeTestFile = result.files.find((file) => file.path === 'sdk_smoke_test.go');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('params := map[string]interface{}{');
    expect(smokeTestFile!.content).toContain('"page": 1');
    expect(smokeTestFile!.content).toContain('if capturedQuery.Get("page") != "1" {');
  });

  it('should sample composed referenced header parameters correctly in Go smoke tests', async () => {
    const generator = new GoGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'go', generateTests: true }, composedReferencedHeaderParameterSpec);
    const smokeTestFile = result.files.find((file) => file.path === 'sdk_smoke_test.go');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('xTraceId := "trace-token"');
    expect(smokeTestFile!.content).toContain('_, err := client.Tenant.ListByPage(&xTraceId)');
    expect(smokeTestFile!.content).toContain('if capturedHeaders.Get("X-Trace-Id") != xTraceId {');
  });

  it('should preserve named non-object component schemas in TypeScript and Go', async () => {
    const typeScriptGenerator = new TypeScriptGenerator();
    const typeScriptResult = await typeScriptGenerator.generate(
      { ...baseConfig, language: 'typescript' },
      namedNonObjectComponentSpec,
    );

    expect(typeScriptResult.errors).toEqual([]);
    expect(getGeneratedFile(typeScriptResult.files, 'src/types/string-alias.ts').content).toContain(
      'export type StringAlias = string;',
    );
    expect(getGeneratedFile(typeScriptResult.files, 'src/types/string-list.ts').content).toContain(
      'export type StringList = string[];',
    );
    expect(getGeneratedFile(typeScriptResult.files, 'src/types/string-map.ts').content).toContain(
      'export type StringMap = Record<string, string>;',
    );
    expect(getGeneratedFile(typeScriptResult.files, 'src/types/user.ts').content).toContain('nickname?: StringAlias;');
    expect(getGeneratedFile(typeScriptResult.files, 'src/types/user.ts').content).toContain('tags?: StringList;');
    expect(getGeneratedFile(typeScriptResult.files, 'src/types/user.ts').content).toContain('metadata?: StringMap;');

    const goGenerator = new GoGenerator();
    const goResult = await goGenerator.generate(
      { ...baseConfig, language: 'go', generateTests: true },
      namedNonObjectComponentSpec,
    );

    expect(goResult.errors).toEqual([]);
    expect(getGeneratedFile(goResult.files, 'types/string_alias.go').content).toContain('type StringAlias string');
    expect(getGeneratedFile(goResult.files, 'types/string_list.go').content).toContain('type StringList []string');
    expect(getGeneratedFile(goResult.files, 'types/string_map.go').content).toContain(
      'type StringMap map[string]string',
    );
    expect(getGeneratedFile(goResult.files, 'types/user.go').content).toContain('Nickname StringAlias');
    expect(getGeneratedFile(goResult.files, 'types/user.go').content).toContain('Tags StringList');
    expect(getGeneratedFile(goResult.files, 'types/user.go').content).toContain('Metadata StringMap');
    expect(getGeneratedFile(goResult.files, 'sdk_smoke_test.go').content).toContain(
      'body := sdktypes.StringAlias("value")',
    );
  });

  it('should generate TypeScript recursive JSON object schemas as interfaces', async () => {
    const typeScriptGenerator = new TypeScriptGenerator();
    const typeScriptResult = await typeScriptGenerator.generate(
      { ...baseConfig, language: 'typescript' },
      {
        openapi: '3.0.0',
        info: { title: 'Recursive JSON API', version: '1.0.0' },
        paths: {
          '/metadata': {
            get: {
              operationId: 'getMetadata',
              tags: ['Metadata'],
              responses: {
                '200': {
                  description: 'Metadata',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/JsonObject' },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            JsonObject: {
              type: 'object',
              additionalProperties: { $ref: '#/components/schemas/JsonValue' },
            },
            JsonValue: {
              oneOf: [
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
                { type: 'array', items: { $ref: '#/components/schemas/JsonValue' } },
                { $ref: '#/components/schemas/JsonObject' },
                { type: 'null' },
              ],
            },
          },
        },
      },
    );

    expect(typeScriptResult.errors).toEqual([]);
    expect(getGeneratedFile(typeScriptResult.files, 'src/types/json-object.ts').content).toContain(
      'export interface JsonObject {',
    );
    expect(getGeneratedFile(typeScriptResult.files, 'src/types/json-object.ts').content).toContain(
      '[key: string]: JsonValue;',
    );
    expect(getGeneratedFile(typeScriptResult.files, 'src/types/json-value.ts').content).toContain(
      'JsonValue[] | JsonObject | null',
    );
  });

  it('should inline named non-object component schemas for fallback generators', async () => {
    const pythonGenerator = new PythonGenerator();
    const pythonResult = await pythonGenerator.generate(
      { ...baseConfig, language: 'python' },
      namedNonObjectComponentSpec,
    );

    expect(pythonResult.errors).toEqual([]);
    expect(pythonResult.files.some((file) => file.path === 'sdkwork_backend_sdk/models/string_alias.py')).toBe(false);
    expect(getGeneratedFile(pythonResult.files, 'sdkwork_backend_sdk/models/user.py').content).toContain(
      'nickname: Optional[str] = None',
    );
    expect(getGeneratedFile(pythonResult.files, 'sdkwork_backend_sdk/models/user.py').content).toContain(
      'tags: Optional[List[str]] = None',
    );
    expect(getGeneratedFile(pythonResult.files, 'sdkwork_backend_sdk/models/user.py').content).toContain(
      'metadata: Optional[Dict[str, str]] = None',
    );
    expect(getGeneratedFile(pythonResult.files, 'sdkwork_backend_sdk/api/alias.py').content).toContain(
      'def send_scalar(self, body: str) -> str:',
    );

    const javaGenerator = new JavaGenerator();
    const javaResult = await javaGenerator.generate({ ...baseConfig, language: 'java' }, namedNonObjectComponentSpec);

    expect(javaResult.errors).toEqual([]);
    expect(
      javaResult.files.some((file) => file.path === 'src/main/java/com/sdkwork/backend/model/StringAlias.java'),
    ).toBe(false);
    expect(getGeneratedFile(javaResult.files, 'src/main/java/com/sdkwork/backend/model/User.java').content).toContain(
      'private String nickname;',
    );
    expect(getGeneratedFile(javaResult.files, 'src/main/java/com/sdkwork/backend/model/User.java').content).toContain(
      'private List<String> tags;',
    );
    expect(getGeneratedFile(javaResult.files, 'src/main/java/com/sdkwork/backend/model/User.java').content).toContain(
      'private Map<String, String> metadata;',
    );
    expect(getGeneratedFile(javaResult.files, 'src/main/java/com/sdkwork/backend/api/AliasApi.java').content).toContain(
      'public String sendScalar(String body) throws Exception {',
    );

    const dartGenerator = new DartGenerator();
    const dartResult = await dartGenerator.generate({ ...baseConfig, language: 'dart' }, namedNonObjectComponentSpec);

    expect(dartResult.errors).toEqual([]);
    expect(getGeneratedFile(dartResult.files, 'lib/src/models.dart').content).not.toContain('class StringAlias');
    expect(getGeneratedFile(dartResult.files, 'lib/src/api/alias.dart').content).toContain(
      'Future<String?> sendScalar(String body) async {',
    );
    expect(getGeneratedFile(dartResult.files, 'lib/src/api/alias.dart').content).toContain('final payload = body;');

    const flutterGenerator = new FlutterGenerator();
    const flutterResult = await flutterGenerator.generate(
      { ...baseConfig, language: 'flutter' },
      namedNonObjectComponentSpec,
    );

    expect(flutterResult.errors).toEqual([]);
    expect(getGeneratedFile(flutterResult.files, 'lib/src/models.dart').content).not.toContain('class StringAlias');
    expect(getGeneratedFile(flutterResult.files, 'lib/src/api/alias.dart').content).toContain(
      'Future<String?> sendScalar(String body) async {',
    );
    expect(getGeneratedFile(flutterResult.files, 'lib/src/api/alias.dart').content).toContain(
      'final payload = body;',
    );

    const swiftGenerator = new SwiftGenerator();
    const swiftResult = await swiftGenerator.generate(
      { ...baseConfig, language: 'swift' },
      namedNonObjectComponentSpec,
    );

    expect(swiftResult.errors).toEqual([]);
    expect(getGeneratedFile(swiftResult.files, 'Sources/Models.swift').content).not.toContain(
      'public struct StringAlias: Codable',
    );
    expect(getGeneratedFile(swiftResult.files, 'Sources/API/AliasApi.swift').content).toContain(
      'public func sendScalar(body: String) async throws -> String? {',
    );

    const kotlinGenerator = new KotlinGenerator();
    const kotlinResult = await kotlinGenerator.generate(
      { ...baseConfig, language: 'kotlin' },
      namedNonObjectComponentSpec,
    );

    expect(kotlinResult.errors).toEqual([]);
    expect(
      kotlinResult.files.some((file) => file.path === 'src/main/kotlin/com/sdkwork/backend/model/StringAlias.kt'),
    ).toBe(false);
    expect(getGeneratedFile(kotlinResult.files, 'src/main/kotlin/com/sdkwork/backend/api/AliasApi.kt').content).toContain(
      'suspend fun sendScalar(body: String): String?',
    );

    const csharpGenerator = new CSharpGenerator();
    const csharpResult = await csharpGenerator.generate(
      { ...baseConfig, language: 'csharp' },
      namedNonObjectComponentSpec,
    );

    expect(csharpResult.errors).toEqual([]);
    expect(csharpResult.files.some((file) => file.path === 'Models/StringAlias.cs')).toBe(false);
    expect(getGeneratedFile(csharpResult.files, 'Api/AliasApi.cs').content).toContain(
      'public async Task<string?> SendScalarAsync(string body)',
    );

    const rustGenerator = new RustGenerator();
    const rustResult = await rustGenerator.generate({ ...baseConfig, language: 'rust' }, namedNonObjectComponentSpec);

    expect(rustResult.errors).toEqual([]);
    expect(rustResult.files.some((file) => file.path === 'src/models/string_alias.rs')).toBe(false);
    expect(getGeneratedFile(rustResult.files, 'src/api/alias.rs').content).toContain(
      'pub async fn send_scalar(&self, body: &String) -> Result<String, SdkworkError>',
    );

    const phpGenerator = new PhpGenerator();
    const phpResult = await phpGenerator.generate(
      { ...baseConfig, language: 'php', generateTests: true },
      namedNonObjectComponentSpec,
    );

    expect(phpResult.errors).toEqual([]);
    expect(phpResult.files.some((file) => file.path === 'src/Models/StringAlias.php')).toBe(false);
    expect(getGeneratedFile(phpResult.files, 'src/Api/Alias.php').content).toContain(
      'public function sendScalar(string $body): string',
    );
    expect(getGeneratedFile(phpResult.files, 'README.md').content).toContain("$body = 'value';");

    const rubyGenerator = new RubyGenerator();
    const rubyResult = await rubyGenerator.generate(
      { ...baseConfig, language: 'ruby', generateTests: true },
      namedNonObjectComponentSpec,
    );

    expect(rubyResult.errors).toEqual([]);
    expect(rubyResult.files.some((file) => file.path === 'lib/sdkwork/backend_sdk/models/string_alias.rb')).toBe(false);
    expect(getGeneratedFile(rubyResult.files, 'README.md').content).toContain("body = 'body'");
  });

  it('should wrap Ruby object models in classes', async () => {
    const generator = new RubyGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'ruby' }, namedNonObjectComponentSpec);
    const userModelFile = getGeneratedFile(result.files, 'lib/sdkwork/backend_sdk/models/user.rb');

    expect(result.errors).toEqual([]);
    expect(userModelFile.content).toContain('module Sdkwork');
    expect(userModelFile.content).toContain('module BackendSdk');
    expect(userModelFile.content).toContain('module Models');
    expect(userModelFile.content).toContain('class User');
    expect(userModelFile.content).toContain('attr_accessor :name, :nickname, :tags, :metadata');
  });

  it('should generate standardized Java smoke tests when generateTests is enabled', async () => {
    const generator = new JavaGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'java', generateTests: true }, mockSpec);
    const pomFile = result.files.find((file) => file.path === 'pom.xml');
    const smokeTestFile = result.files.find(
      (file) => file.path === 'src/test/java/com/sdkwork/backend/GeneratedSdkSmokeTest.java'
    );

    expect(result.errors).toEqual([]);
    expect(pomFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(pomFile!.content).toContain('<artifactId>junit-jupiter</artifactId>');
    expect(pomFile!.content).toContain('<artifactId>maven-surefire-plugin</artifactId>');
    expect(smokeTestFile!.content).toContain('package com.sdkwork.backend;');
    expect(smokeTestFile!.content).toContain('import org.junit.jupiter.api.Test;');
    expect(smokeTestFile!.content).toContain('import com.sun.net.httpserver.HttpServer;');
    expect(smokeTestFile!.content).toContain('SdkworkBackendClient client = new SdkworkBackendClient(config);');
    expect(smokeTestFile!.content).toContain('client.getUser().listUsers();');
    expect(smokeTestFile!.content).toContain('assertEquals("/api/v1/users", capturedPath.get());');
  });

  it('should generate Java smoke tests that assert body query and typed response forwarding', async () => {
    const generator = new JavaGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'java', generateTests: true }, postBodyAndQuerySpec);
    const smokeTestFile = result.files.find(
      (file) => file.path === 'src/test/java/com/sdkwork/backend/GeneratedSdkSmokeTest.java'
    );

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('PlusTenantQueryListForm body = new PlusTenantQueryListForm();');
    expect(smokeTestFile!.content).toContain('body.setKeyword("keyword");');
    expect(smokeTestFile!.content).toContain('Map<String, Object> params = new LinkedHashMap<>();');
    expect(smokeTestFile!.content).toContain('params.put("page", 1);');
    expect(smokeTestFile!.content).toContain('PlusApiResultPagePlusTenantVO result = client.getTenant().listByPage(body, params);');
    expect(smokeTestFile!.content).toContain('assertEquals("/api/v1/tenant/list", capturedPath.get());');
    expect(smokeTestFile!.content).toContain('assertEquals("1", capturedQuery.get("page"));');
    expect(smokeTestFile!.content).toContain('assertTrue(capturedContentType.get().startsWith("application/json"));');
    expect(smokeTestFile!.content).toContain('assertEquals("ok", result.getCode());');
  });

  it('should sample composed query parameters correctly in Java smoke tests', async () => {
    const generator = new JavaGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'java', generateTests: true }, composedQueryParameterSpec);
    const smokeTestFile = result.files.find(
      (file) => file.path === 'src/test/java/com/sdkwork/backend/GeneratedSdkSmokeTest.java'
    );

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('Map<String, Object> params = new LinkedHashMap<>();');
    expect(smokeTestFile!.content).toContain('params.put("page", 1);');
    expect(smokeTestFile!.content).toContain('assertEquals("1", capturedQuery.get("page"));');
  });

  it('should generate standardized Kotlin smoke tests when generateTests is enabled', async () => {
    const generator = new KotlinGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'kotlin', generateTests: true }, mockSpec);
    const buildFile = result.files.find((file) => file.path === 'build.gradle.kts');
    const smokeTestFile = result.files.find(
      (file) => file.path === 'src/test/kotlin/com/sdkwork/backend/GeneratedSdkSmokeTest.kt'
    );

    expect(result.errors).toEqual([]);
    expect(buildFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(buildFile!.content).toContain('testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")');
    expect(buildFile!.content).toContain('testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")');
    expect(smokeTestFile!.content).toContain('package com.sdkwork.backend');
    expect(smokeTestFile!.content).toContain('import com.sun.net.httpserver.HttpServer');
    expect(smokeTestFile!.content).toContain('runBlocking');
    expect(smokeTestFile!.content).toContain('val client = SdkworkBackendClient(config)');
    expect(smokeTestFile!.content).toContain('client.user.listUsers()');
    expect(smokeTestFile!.content).toContain('assertEquals("/api/v1/users", capturedPath)');
  });

  it('should generate Kotlin smoke tests that assert body query and typed response forwarding', async () => {
    const generator = new KotlinGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'kotlin', generateTests: true }, postBodyAndQuerySpec);
    const smokeTestFile = result.files.find(
      (file) => file.path === 'src/test/kotlin/com/sdkwork/backend/GeneratedSdkSmokeTest.kt'
    );

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('val body = PlusTenantQueryListForm(');
    expect(smokeTestFile!.content).toContain('keyword = "keyword"');
    expect(smokeTestFile!.content).toContain('val params = linkedMapOf<String, Any>(');
    expect(smokeTestFile!.content).toContain('"page" to 1');
    expect(smokeTestFile!.content).toContain('val result = client.tenant.listByPage(body, params)');
    expect(smokeTestFile!.content).toContain('assertEquals("/api/v1/tenant/list", capturedPath)');
    expect(smokeTestFile!.content).toContain('assertEquals("1", capturedQuery["page"])');
    expect(smokeTestFile!.content).toContain('assertTrue(capturedContentType.startsWith("application/json"))');
    expect(smokeTestFile!.content).toContain('assertEquals("ok", result?.code)');
  });

  it('should sample composed query parameters correctly in Kotlin smoke tests', async () => {
    const generator = new KotlinGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'kotlin', generateTests: true }, composedQueryParameterSpec);
    const smokeTestFile = result.files.find(
      (file) => file.path === 'src/test/kotlin/com/sdkwork/backend/GeneratedSdkSmokeTest.kt'
    );

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('val params = linkedMapOf<String, Any>(');
    expect(smokeTestFile!.content).toContain('"page" to 1');
    expect(smokeTestFile!.content).toContain('assertEquals("1", capturedQuery["page"])');
  });

  it('should generate standardized Flutter smoke tests when generateTests is enabled', async () => {
    const generator = new FlutterGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'flutter', generateTests: true }, mockSpec);
    const pubspecFile = result.files.find((file) => file.path === 'pubspec.yaml');
    const smokeTestFile = result.files.find((file) => file.path === 'test/generated_sdk_smoke_test.dart');

    expect(result.errors).toEqual([]);
    expect(pubspecFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(pubspecFile!.content).toContain('test: ^1.24.0');
    expect(smokeTestFile!.content).not.toContain("import 'dart:convert';");
    expect(smokeTestFile!.content).toContain("import 'dart:io';");
    expect(smokeTestFile!.content).toContain("import 'package:test/test.dart';");
    expect(smokeTestFile!.content).toContain("import 'package:backend_sdk/backend_sdk.dart';");
    expect(smokeTestFile!.content).toContain("final client = SdkworkBackendClient.withBaseUrl(baseUrl: 'http://127.0.0.1:${server.port}');");
    expect(smokeTestFile!.content).toContain('await client.user.listUsers();');
    expect(smokeTestFile!.content).toContain("expect(capturedPath, '/api/v1/users');");
  });

  it('should generate Flutter smoke tests that assert body query and typed response forwarding', async () => {
    const generator = new FlutterGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'flutter', generateTests: true }, postBodyAndQuerySpec);
    const smokeTestFile = result.files.find((file) => file.path === 'test/generated_sdk_smoke_test.dart');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('final body = PlusTenantQueryListForm(');
    expect(smokeTestFile!.content).toContain("keyword: 'keyword'");
    expect(smokeTestFile!.content).toContain('final params = <String, dynamic>{');
    expect(smokeTestFile!.content).toContain("'page': 1");
    expect(smokeTestFile!.content).toContain('final result = await client.tenant.listByPage(body, params);');
    expect(smokeTestFile!.content).toContain("expect(capturedPath, '/api/v1/tenant/list');");
    expect(smokeTestFile!.content).toContain("expect(capturedQuery['page'], '1');");
    expect(smokeTestFile!.content).toContain("expect(capturedContentType.startsWith('application/json'), isTrue);");
    expect(smokeTestFile!.content).toContain('expect(jsonDecode(utf8.decode(capturedBody)), body.toJson());');
    expect(smokeTestFile!.content).toContain("expect(result?.code, 'ok');");
  });

  it('should generate standardized C# smoke tests when generateTests is enabled', async () => {
    const generator = new CSharpGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'csharp', generateTests: true }, mockSpec);
    const testProjectFile = result.files.find((file) => file.path === 'Tests/Backend.Tests.csproj');
    const smokeTestFile = result.files.find((file) => file.path === 'Tests/GeneratedSdkSmokeTests.cs');

    expect(result.errors).toEqual([]);
    expect(testProjectFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(testProjectFile!.content).toContain('<ProjectReference Include="../Backend.csproj" />');
    expect(testProjectFile!.content).toContain('<PackageReference Include="xunit" Version="2.9.0" />');
    expect(smokeTestFile!.content).toContain('using Xunit;');
    expect(smokeTestFile!.content).toContain('var client = new SdkworkBackendClient(config);');
    expect(smokeTestFile!.content).toContain('await client.User.ListUsersAsync()');
    expect(smokeTestFile!.content).toContain('Assert.Equal("/api/v1/users", capturedPath);');
  });

  it('should generate standardized Swift smoke tests when generateTests is enabled', async () => {
    const generator = new SwiftGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'swift', generateTests: true }, mockSpec);
    const packageFile = result.files.find((file) => file.path === 'Package.swift');
    const smokeTestFile = result.files.find(
      (file) => file.path === 'Tests/BackendSDKTests/GeneratedSdkSmokeTests.swift'
    );

    expect(result.errors).toEqual([]);
    expect(packageFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(packageFile!.content).toContain('.testTarget(');
    expect(packageFile!.content).toContain('name: "BackendSDKTests"');
    expect(smokeTestFile!.content).toContain('import XCTest');
    expect(smokeTestFile!.content).toContain('@testable import BackendSDK');
    expect(smokeTestFile!.content).toContain('let client = SdkworkBackendClient(config: config)');
    expect(smokeTestFile!.content).toContain('try await client.user.listUsers()');
    expect(smokeTestFile!.content).toContain('XCTAssertEqual("/api/v1/users", capturedPath)');
  });

  it('should generate Swift smoke tests that assert body query and typed response forwarding', async () => {
    const generator = new SwiftGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'swift', generateTests: true }, postBodyAndQuerySpec);
    const smokeTestFile = result.files.find(
      (file) => file.path === 'Tests/BackendSDKTests/GeneratedSdkSmokeTests.swift'
    );

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('let body = PlusTenantQueryListForm(keyword: "keyword")');
    expect(smokeTestFile!.content).toContain('let params: [String: Any] = [');
    expect(smokeTestFile!.content).toContain('"page": 1');
    expect(smokeTestFile!.content).toContain('let result = try await client.tenant.listByPage(body: body, params: params)');
    expect(smokeTestFile!.content).toContain('XCTAssertEqual("/api/v1/tenant/list", capturedPath)');
    expect(smokeTestFile!.content).toContain('XCTAssertEqual("1", capturedQuery["page"])');
    expect(smokeTestFile!.content).toContain('XCTAssertTrue(capturedContentType.hasPrefix("application/json"))');
    expect(smokeTestFile!.content).toContain('assertJSONEqual(try encoder.encode(body), capturedBody)');
    expect(smokeTestFile!.content).toContain('XCTAssertEqual("ok", result?.code)');
  });

  it('should sample composed query parameters correctly in Swift smoke tests', async () => {
    const generator = new SwiftGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'swift', generateTests: true }, composedQueryParameterSpec);
    const smokeTestFile = result.files.find(
      (file) => file.path === 'Tests/BackendSDKTests/GeneratedSdkSmokeTests.swift'
    );

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('let params: [String: Any] = [');
    expect(smokeTestFile!.content).toContain('"page": 1');
    expect(smokeTestFile!.content).toContain('XCTAssertEqual("1", capturedQuery["page"])');
  });

  it('should generate C# smoke tests that assert body query and typed response forwarding', async () => {
    const generator = new CSharpGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'csharp', generateTests: true }, postBodyAndQuerySpec);
    const smokeTestFile = result.files.find((file) => file.path === 'Tests/GeneratedSdkSmokeTests.cs');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('var body = new PlusTenantQueryListForm');
    expect(smokeTestFile!.content).toContain('Keyword = "keyword"');
    expect(smokeTestFile!.content).toContain('var query = new Dictionary<string, object>');
    expect(smokeTestFile!.content).toContain('["page"] = 1');
    expect(smokeTestFile!.content).toContain('var result = await client.Tenant.ListByPageAsync(body, query);');
    expect(smokeTestFile!.content).toContain('Assert.Equal("/api/v1/tenant/list", capturedPath);');
    expect(smokeTestFile!.content).toContain('Assert.Equal("1", capturedQuery["page"]);');
    expect(smokeTestFile!.content).toContain('Assert.StartsWith("application/json", capturedContentType);');
    expect(smokeTestFile!.content).toContain('Assert.Equal("ok", result!.Code);');
  });

  it('should sample composed query parameters correctly in C# smoke tests', async () => {
    const generator = new CSharpGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'csharp', generateTests: true }, composedQueryParameterSpec);
    const smokeTestFile = result.files.find((file) => file.path === 'Tests/GeneratedSdkSmokeTests.cs');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('var query = new Dictionary<string, object>');
    expect(smokeTestFile!.content).toContain('["page"] = 1');
    expect(smokeTestFile!.content).toContain('Assert.Equal("1", capturedQuery["page"]);');
  });

  it('should truthfully report that TypeScript, Dart, Rust, Python, Go, Java, Swift, Kotlin, Flutter, C#, PHP, and Ruby currently support generated tests', () => {
    expect(getGenerator('typescript')?.supportsTests).toBe(true);
    expect(getGenerator('dart')?.supportsTests).toBe(true);
    expect(getGenerator('rust')?.supportsTests).toBe(true);
    expect(getGenerator('python')?.supportsTests).toBe(true);
    expect(getGenerator('go')?.supportsTests).toBe(true);
    expect(getGenerator('java')?.supportsTests).toBe(true);
    expect(getGenerator('swift')?.supportsTests).toBe(true);
    expect(getGenerator('kotlin')?.supportsTests).toBe(true);
    expect(getGenerator('flutter')?.supportsTests).toBe(true);
    expect(getGenerator('csharp')?.supportsTests).toBe(true);
    expect(getGenerator('php')?.supportsTests).toBe(true);
    expect(getGenerator('ruby')?.supportsTests).toBe(true);

    for (const language of getSupportedLanguages().filter((language) => !['typescript', 'dart', 'rust', 'python', 'go', 'java', 'swift', 'kotlin', 'flutter', 'csharp', 'php', 'ruby'].includes(language))) {
      expect(getGenerator(language)?.supportsTests).toBe(false);
    }
  });

  it('should treat form-urlencoded request bodies as supported for Java generation', async () => {
    const generator = new JavaGenerator();
    const formSpec: ApiSpec = {
      openapi: '3.0.3',
      info: { title: 'Form API', version: '1.0.0' },
      paths: {
        '/auth/token': {
          post: {
            operationId: 'createToken',
            tags: ['Auth'],
            requestBody: {
              required: true,
              content: {
                'application/x-www-form-urlencoded': {
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
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
      components: { schemas: {} },
    };

    const result = await generator.generate({ ...baseConfig, language: 'java' }, formSpec);
    const apiFile = result.files.find(
      (file) => file.path === 'src/main/java/com/sdkwork/backend/api/AuthApi.java'
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes('non-JSON media types'))).toBe(false);
    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('application/x-www-form-urlencoded');
  });

  it('should propagate form-urlencoded content types through generated API layers for go, kotlin, swift, and csharp', async () => {
    const formSpec: ApiSpec = {
      openapi: '3.0.3',
      info: { title: 'Form API', version: '1.0.0' },
      paths: {
        '/auth/token': {
          post: {
            operationId: 'createToken',
            tags: ['Auth'],
            requestBody: {
              required: true,
              content: {
                'application/x-www-form-urlencoded': {
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
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
      components: { schemas: {} },
    };

    const cases = [
      {
        configLanguage: 'go' as const,
        generator: new GoGenerator(),
        expectedPath: 'api/auth.go',
      },
      {
        configLanguage: 'kotlin' as const,
        generator: new KotlinGenerator(),
        expectedPath: 'src/main/kotlin/com/sdkwork/backend/api/AuthApi.kt',
      },
      {
        configLanguage: 'swift' as const,
        generator: new SwiftGenerator(),
        expectedPath: 'Sources/API/AuthApi.swift',
      },
      {
        configLanguage: 'csharp' as const,
        generator: new CSharpGenerator(),
        expectedPath: 'Api/AuthApi.cs',
      },
    ];

    for (const testCase of cases) {
      const result = await testCase.generator.generate(
        { ...baseConfig, language: testCase.configLanguage },
        formSpec
      );
      const apiFile = result.files.find((file) => file.path === testCase.expectedPath);

      expect(result.errors).toEqual([]);
      expect(apiFile).toBeDefined();
      expect(apiFile!.content).toContain('application/x-www-form-urlencoded');
    }
  });

  it('should send form-urlencoded request bodies via data in generated Python APIs', async () => {
    const generator = new PythonGenerator();
    const formSpec: ApiSpec = {
      openapi: '3.0.3',
      info: { title: 'Python Form API', version: '1.0.0' },
      paths: {
        '/auth/token': {
          post: {
            operationId: 'createToken',
            tags: ['Auth'],
            requestBody: {
              required: true,
              content: {
                'application/x-www-form-urlencoded': {
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
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
      components: { schemas: {} },
    };

    const result = await generator.generate({ ...baseConfig, language: 'python' }, formSpec);
    const apiFile = result.files.find((file) => file.path.endsWith('/api/auth.py'));

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('data=body');
    expect(apiFile!.content).toContain("form_headers = {**({} or {}), 'Content-Type': 'application/x-www-form-urlencoded'}");
    expect(apiFile!.content).toContain('headers=form_headers');
  });

  it('should propagate explicit content types in generated TypeScript clients for form-encoded bodies', async () => {
    const generator = new TypeScriptGenerator();
    const formSpec: ApiSpec = {
      openapi: '3.0.3',
      info: { title: 'TypeScript Form API', version: '1.0.0' },
      paths: {
        '/auth/token': {
          post: {
            operationId: 'createToken',
            tags: ['Auth'],
            requestBody: {
              required: true,
              content: {
                'application/x-www-form-urlencoded': {
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
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
      components: { schemas: {} },
    };

    const result = await generator.generate(baseConfig, formSpec);
    const apiFile = result.files.find((file) => file.path === 'src/api/auth.ts');
    const httpFile = result.files.find((file) => file.path === 'src/http/client.ts');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(httpFile).toBeDefined();
    expect(apiFile!.content).toContain('application/x-www-form-urlencoded');
    expect(httpFile!.content).toContain("contentType?: string");
    expect(httpFile!.content).toContain("contentType,");
  });
});
