import { describe, it, expect } from 'vitest';
import { TypeScriptGenerator } from './generators/typescript/index.js';
import { PythonGenerator } from './generators/python/index.js';
import { GoGenerator } from './generators/go/index.js';
import { JavaGenerator } from './generators/java/index.js';
import { SwiftGenerator } from './generators/swift/index.js';
import { KotlinGenerator } from './generators/kotlin/index.js';
import { FlutterGenerator } from './generators/flutter/index.js';
import { CSharpGenerator } from './generators/csharp/index.js';
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
    { name: 'Python', Generator: PythonGenerator },
    { name: 'Go', Generator: GoGenerator },
    { name: 'Java', Generator: JavaGenerator },
    { name: 'Swift', Generator: SwiftGenerator },
    { name: 'Kotlin', Generator: KotlinGenerator },
    { name: 'Flutter', Generator: FlutterGenerator },
    { name: 'C#', Generator: CSharpGenerator },
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
          f.path.includes('pyproject.toml')
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
    PythonGenerator,
    GoGenerator,
    JavaGenerator,
    SwiftGenerator,
    KotlinGenerator,
    FlutterGenerator,
    CSharpGenerator,
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
});
