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

  it('should generate compilable TypeScript API key constants for custom auth headers', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, securitySpec);
    const httpClientFile = result.files.find((f) => f.path === 'src/http/client.ts');

    expect(result.errors).toEqual([]);
    expect(httpClientFile).toBeDefined();
    expect(httpClientFile!.content).toContain("private static readonly API_KEY_HEADER: string = 'X-API-Key';");
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
    expect(tsApi!.content).toContain('class_: string | number');
    expect(tsApi!.content).toContain('userId: string | number');
    expect(tsApi!.content).toContain('headers: string | number');
    expect(tsApi!.content).toContain('xTraceId?: string');
    expect(tsApi!.content).not.toContain('headers?: Record<string, string>');
    expect(tsApi!.content).toContain('/keyword-model/${class_}/${userId}/${headers}');

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
    expect(pyApi!.content).toContain('f"/api/v1/keyword-model/{class_}/{user_id}/{headers}"');
  });

  it('should generate named TypeScript header and cookie parameters with Cookie header assembly', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, headerCookieParameterSpec);
    const apiFile = result.files.find((file) => file.path === 'src/api/resource.ts');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('async listResources(xTraceId: string, sessionId?: string): Promise<void>');
    expect(apiFile!.content).toContain("const requestHeaders = buildRequestHeaders(");
    expect(apiFile!.content).toContain("'X-Trace-Id': xTraceId");
    expect(apiFile!.content).toContain("session_id: sessionId");
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
    expect(apiFile!.content).toContain(
      'async searchResources(tag: string[], filter?: Record<string, unknown>, range?: Record<string, number>, jsonFilter?: Record<string, unknown>, q?: string): Promise<void>'
    );
    expect(apiFile!.content).toContain('const query = buildQueryString([');
    expect(apiFile!.content).toContain("name: 'tag'");
    expect(apiFile!.content).toContain("style: 'form'");
    expect(apiFile!.content).toContain('explode: true');
    expect(apiFile!.content).toContain("name: 'filter'");
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
    expect(tsApi.content).toContain('async listResources(page: number, limit?: number, sort?: string): Promise<void>');
    expect(tsApi.content).toContain('const query = buildQueryString([');
    expect(tsApi.content).toContain("{ name: 'page', value: page, style: 'form', explode: true, allowReserved: false },");
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
          "'X-Trace-Id': x_trace_id",
          "'session_id': session_id",
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
          "'X-Trace-Id': xTraceId",
          "'session_id': sessionId",
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
          "'X-Trace-Id': xTraceId",
          "'session_id': sessionId",
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
          '"X-Trace-Id": xTraceId',
          '"session_id": func() interface{} { if sessionId == nil { return nil }; return *sessionId }()',
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
          '"X-Trace-Id", xTraceId',
          '"session_id", sessionId',
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
          '"X-Trace-Id" to xTraceId',
          '"session_id" to sessionId',
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
          '"X-Trace-Id": xTraceId',
          '"session_id": sessionId',
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
          '["X-Trace-Id"] = xTraceId',
          '["session_id"] = sessionId',
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
          '("X-Trace-Id", serialize_parameter_value(&x_trace_id))',
          '("session_id", session_id.as_ref().and_then(serialize_parameter_value))',
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
          "'X-Trace-Id' => $xTraceId",
          "'session_id' => $sessionId",
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
          "'X-Trace-Id' => x_trace_id",
          "'session_id' => session_id",
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
    expect(rustApi.content).toContain('("X-Retry-Count", serialize_parameter_value(&x_retry_count))');
    expect(rustApi.content).toContain('("debug_mode", debug_mode.as_ref().and_then(serialize_parameter_value))');
    expect(rustApi.content).toContain('fn build_request_headers(headers: &[(&str, Option<String>)], cookies: &[(&str, Option<String>)])');
    expect(rustApi.content).toContain('fn serialize_parameter_value<T: serde::Serialize>(value: &T) -> Option<String>');
    expect(rustApi.content).not.toContain('x_retry_count: &str');
    expect(rustApi.content).not.toContain('debug_mode: Option<&str>');
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
    expect(goApi!.content).toContain('fmt.Sprintf("/keyword-model/%s/%s/%s", class, userId, headers_)');

    const javaGenerator = new JavaGenerator();
    const javaResult = await javaGenerator.generate({ ...baseConfig, language: 'java' }, pathParameterIdentifierSpec);
    const javaApi = javaResult.files.find((f) => f.path.endsWith('/api/KeywordModelApi.java'));

    expect(javaApi).toBeDefined();
    expect(javaApi!.content).toContain('String class_');
    expect(javaApi!.content).toContain('String userId');
    expect(javaApi!.content).toContain('String headers');
    expect(javaApi!.content).toContain('String xTraceId');
    expect(javaApi!.content).not.toContain('Map<String, String> headers');
    expect(javaApi!.content).toContain('/keyword-model/" + class_ + "/" + userId + "/" + headers + "');

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
    expect(kotlinApi!.content).toContain('"/keyword-model/$class_/$userId/$headers"');

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
    expect(swiftApi!.content).toContain('"/keyword-model/\\(class_)/\\(userId)/\\(headers)"');

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
    expect(csharpApi!.content).toContain('$"/keyword-model/{class_}/{userId}/{headers}"');
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
    expect(phpApi!.content).toContain("'class' => $class_");
    expect(phpApi!.content).toContain("'user-id' => $userId");
    expect(phpApi!.content).toContain("'headers' => $headers");

    const rubyGenerator = new RubyGenerator();
    const rubyResult = await rubyGenerator.generate({ ...baseConfig, language: 'ruby' }, pathParameterIdentifierSpec);
    const rubyApi = rubyResult.files.find(
      (f) => f.path.includes('/api/') && f.content.includes('/keyword-model/')
    );

    expect(rubyApi).toBeDefined();
    expect(rubyApi!.content).toContain('def get_keyword_model_by_path(class_, user_id, headers, x_trace_id: nil)');
    expect(rubyApi!.content).toContain("class: class_, 'user-id': user_id, headers: headers");

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
    expect(dartApi!.content).toContain("'/keyword-model/$class_/$userId/$headers'");

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
    expect(flutterApi!.content).toContain("'/keyword-model/$class_/$userId/$headers'");
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
    expect(tenantApi!.content).toContain(
      'async listByPage(body?: PlusTenantQueryListForm, page?: number, size?: number): Promise<PlusApiResultPagePlusTenantVO>'
    );
    expect(tenantApi!.content).toContain('const query = buildQueryString([');
    expect(tenantApi!.content).toContain("{ name: 'page', value: page, style: 'form', explode: true, allowReserved: false },");
    expect(tenantApi!.content).toContain("{ name: 'size', value: size, style: 'form', explode: true, allowReserved: false },");
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
    expect(readmeFile!.content).toContain('const result = await client.tenant.listByPage(xTraceId);');
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
          'const result = await client.resource.listResources(xTraceId, sessionId);',
        ],
        expectedSmoke: [
          "const xTraceId = 'X-Trace-Id';",
          "const sessionId = 'session_id';",
          'await client.resource.listResources(xTraceId, sessionId);',
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
