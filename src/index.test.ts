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

  it('should emit deferred annotations for python model references', async () => {
    const generator = new PythonGenerator();
    const result = await generator.generate({ ...baseConfig, language: 'python' }, modelRefSpec);
    const modelAFile = result.files.find((f) => f.path.endsWith('/models/model_a.py'));

    expect(modelAFile).toBeDefined();
    expect(modelAFile!.content).toContain('from __future__ import annotations');
    expect(modelAFile!.content).toContain('model_b: ModelB = None');
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
    const optionalIndex = orderedModelFile!.content.indexOf('optional_name: str = None');
    expect(requiredIndex).toBeGreaterThanOrEqual(0);
    expect(optionalIndex).toBeGreaterThanOrEqual(0);
    expect(requiredIndex).toBeLessThan(optionalIndex);
  });

  it('should escape python keyword property names', async () => {
    const generator = new PythonGenerator();
    const result = await generator.generate(
      { ...baseConfig, language: 'python' },
      pythonKeywordPropertySpec
    );
    const keywordModelFile = result.files.find((f) => f.path.endsWith('/models/keyword_model.py'));

    expect(keywordModelFile).toBeDefined();
    expect(keywordModelFile!.content).toContain('async_: bool = None');
    expect(keywordModelFile!.content).toContain('await_: str = None');
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
    expect(tsApi!.content).toContain('class_: string | number');
    expect(tsApi!.content).toContain('userId: string | number');
    expect(tsApi!.content).toContain('headers_: string | number');
    expect(tsApi!.content).toContain('headers?: Record<string, string>');
    expect(tsApi!.content).toContain('/keyword-model/${class_}/${userId}/${headers_}');

    const pyGenerator = new PythonGenerator();
    const pyResult = await pyGenerator.generate({ ...baseConfig, language: 'python' }, pathParameterIdentifierSpec);
    const pyApi = pyResult.files.find(
      (f) => f.path.includes('/api/') && f.content.includes('/keyword-model/')
    );

    expect(pyApi).toBeDefined();
    expect(pyApi!.content).toContain('class_: str');
    expect(pyApi!.content).toContain('user_id: str');
    expect(pyApi!.content).toContain('headers_: str');
    expect(pyApi!.content).toContain('headers: Optional[Dict[str, str]] = None');
    expect(pyApi!.content).toContain('f"/api/v1/keyword-model/{class_}/{user_id}/{headers_}"');
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
    expect(goApi!.content).toContain('headers map[string]string');
    expect(goApi!.content).toContain('fmt.Sprintf("/keyword-model/%s/%s/%s", class, userId, headers_)');

    const javaGenerator = new JavaGenerator();
    const javaResult = await javaGenerator.generate({ ...baseConfig, language: 'java' }, pathParameterIdentifierSpec);
    const javaApi = javaResult.files.find((f) => f.path.endsWith('/api/KeywordModelApi.java'));

    expect(javaApi).toBeDefined();
    expect(javaApi!.content).toContain('String class_');
    expect(javaApi!.content).toContain('String userId');
    expect(javaApi!.content).toContain('String headers_');
    expect(javaApi!.content).toContain('Map<String, String> headers');
    expect(javaApi!.content).toContain('/keyword-model/" + class_ + "/" + userId + "/" + headers_ + "');

    const kotlinGenerator = new KotlinGenerator();
    const kotlinResult = await kotlinGenerator.generate(
      { ...baseConfig, language: 'kotlin' },
      pathParameterIdentifierSpec
    );
    const kotlinApi = kotlinResult.files.find((f) => f.path.endsWith('/api/KeywordModelApi.kt'));

    expect(kotlinApi).toBeDefined();
    expect(kotlinApi!.content).toContain('class_: String');
    expect(kotlinApi!.content).toContain('userId: String');
    expect(kotlinApi!.content).toContain('headers_: String');
    expect(kotlinApi!.content).toContain('headers: Map<String, String>? = null');
    expect(kotlinApi!.content).toContain('"/keyword-model/$class_/$userId/$headers_"');

    const swiftGenerator = new SwiftGenerator();
    const swiftResult = await swiftGenerator.generate(
      { ...baseConfig, language: 'swift' },
      pathParameterIdentifierSpec
    );
    const swiftApi = swiftResult.files.find((f) => f.path === 'Sources/API/KeywordModelApi.swift');

    expect(swiftApi).toBeDefined();
    expect(swiftApi!.content).toContain('class_: String');
    expect(swiftApi!.content).toContain('userId: String');
    expect(swiftApi!.content).toContain('headers_: String');
    expect(swiftApi!.content).toContain('headers: [String: String]? = nil');
    expect(swiftApi!.content).toContain('"/keyword-model/\\(class_)/\\(userId)/\\(headers_)"');

    const csharpGenerator = new CSharpGenerator();
    const csharpResult = await csharpGenerator.generate(
      { ...baseConfig, language: 'csharp' },
      pathParameterIdentifierSpec
    );
    const csharpApi = csharpResult.files.find((f) => f.path === 'Api/KeywordModelApi.cs');

    expect(csharpApi).toBeDefined();
    expect(csharpApi!.content).toContain('string class_');
    expect(csharpApi!.content).toContain('string userId');
    expect(csharpApi!.content).toContain('string headers_');
    expect(csharpApi!.content).toContain('Dictionary<string, string>? headers = null');
    expect(csharpApi!.content).toContain('$"/keyword-model/{class_}/{userId}/{headers_}"');
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
    expect(phpApi!.content).toContain('string $headers_');
    expect(phpApi!.content).toContain('array $headers = []');
    expect(phpApi!.content).toContain("'class' => $class_");
    expect(phpApi!.content).toContain("'user-id' => $userId");
    expect(phpApi!.content).toContain("'headers' => $headers_");

    const rubyGenerator = new RubyGenerator();
    const rubyResult = await rubyGenerator.generate({ ...baseConfig, language: 'ruby' }, pathParameterIdentifierSpec);
    const rubyApi = rubyResult.files.find(
      (f) => f.path.includes('/api/') && f.content.includes('/keyword-model/')
    );

    expect(rubyApi).toBeDefined();
    expect(rubyApi!.content).toContain('def get_keyword_model_by_path(class_, user_id, headers_, headers: {})');
    expect(rubyApi!.content).toContain("class: class_, 'user-id': user_id, headers: headers_");

    const dartGenerator = new DartGenerator();
    const dartResult = await dartGenerator.generate({ ...baseConfig, language: 'dart' } as any, pathParameterIdentifierSpec);
    const dartApi = dartResult.files.find(
      (f) => f.path.startsWith('lib/src/api/') && f.content.includes('/keyword-model/')
    );

    expect(dartApi).toBeDefined();
    expect(dartApi!.content).toContain('String class_');
    expect(dartApi!.content).toContain('String userId');
    expect(dartApi!.content).toContain('String headers_');
    expect(dartApi!.content).toContain('Map<String, String>? headers');
    expect(dartApi!.content).toContain("'/keyword-model/$class_/$userId/$headers_'");

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
    expect(flutterApi!.content).toContain('String headers_');
    expect(flutterApi!.content).toContain('Map<String, String>? headers');
    expect(flutterApi!.content).toContain("'/keyword-model/$class_/$userId/$headers_'");
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
    expect(rustApi!.content).toContain('headers: Option<&RequestHeaders>');
    expect(rustApi!.content).toContain('format!("/keyword-model/{}/{}/{}", class, user_id, headers_)');
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
    expect(tenantApi!.content).toContain(
      'async listByPage(body?: PlusTenantQueryListForm, params?: QueryParams): Promise<PlusApiResultPagePlusTenantVO>'
    );
    expect(tenantApi!.content).toContain(
      'return this.client.post<PlusApiResultPagePlusTenantVO>(backendApiPath(`/tenant/list`), body, params'
    );
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
    expect(tsChatApi!.content).toContain('async createChatCompletion(');
    expect(tsChatApi!.content).toContain('async getChatCompletion(');
    expect(tsChatApi!.content).toContain('async listChatCompletionMessages(');
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
    expect(javaChatApi!.content).toContain('createChatCompletion');
    expect(javaChatApi!.content).toContain('getChatCompletion');
    expect(javaChatApi!.content).toContain('listChatCompletionMessages');
    expect(javaChatApi!.content).not.toContain('getManagedChatCompletion');
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
    const batchApi = result.files.find((f) => f.path === 'src/api/batch.ts');
    expect(batchApi).toBeDefined();
    expect(batchApi!.content).toContain('aiApiPath(`/batches`)');
    expect(batchApi!.content).not.toContain('aiApiPath(`/v1/batches`)');
    expect(batchApi!.content).not.toContain('getListBatchesV1');
    expect(batchApi!.content).not.toContain('createBatchesV1');

    const sdkFile = result.files.find((f) => f.path === 'src/sdk.ts');
    expect(sdkFile).toBeDefined();
    expect(sdkFile!.content).toContain('public readonly batch: BatchApi;');
    expect(sdkFile!.content).not.toContain('public readonly batche:');
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
    expect(readmeFile!.content).toContain('const headers = {');
    expect(readmeFile!.content).toContain("  'X-Trace-Id': 'trace-token',");
    expect(readmeFile!.content).toContain('const result = await client.tenant.listByPage(headers);');
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
    expect(smokeTestFile!.content).toContain("import 'dart:convert';");
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
    expect(smokeTestFile!.content).toContain('headers := map[string]string{');
    expect(smokeTestFile!.content).toContain('"X-Trace-Id": "trace-token"');
    expect(smokeTestFile!.content).toContain('if capturedHeaders.Get("X-Trace-Id") != "trace-token" {');
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
    expect(smokeTestFile!.content).toContain('headers := map[string]string{');
    expect(smokeTestFile!.content).toContain('"X-Trace-Id": "trace-token"');
    expect(smokeTestFile!.content).toContain('if capturedHeaders.Get("X-Trace-Id") != "trace-token" {');
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

  it('should inline named non-object component schemas for fallback generators', async () => {
    const pythonGenerator = new PythonGenerator();
    const pythonResult = await pythonGenerator.generate(
      { ...baseConfig, language: 'python' },
      namedNonObjectComponentSpec,
    );

    expect(pythonResult.errors).toEqual([]);
    expect(pythonResult.files.some((file) => file.path === 'sdkwork_backend_sdk/models/string_alias.py')).toBe(false);
    expect(getGeneratedFile(pythonResult.files, 'sdkwork_backend_sdk/models/user.py').content).toContain(
      'nickname: str = None',
    );
    expect(getGeneratedFile(pythonResult.files, 'sdkwork_backend_sdk/models/user.py').content).toContain(
      'tags: List[str] = None',
    );
    expect(getGeneratedFile(pythonResult.files, 'sdkwork_backend_sdk/models/user.py').content).toContain(
      'metadata: Dict[str, str] = None',
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
    expect(smokeTestFile!.content).toContain("import 'dart:convert';");
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
