import { describe, expect, it } from 'vitest';

import type { ApiSpec, GeneratorConfig } from '../../framework/types.js';
import { SDKWORK_V3_TEST_ENVELOPE_SCHEMAS } from '../../framework/sdkwork-v3-envelope-fixtures.js';
import { TypeScriptGenerator } from './index.js';

const spec: ApiSpec = {
  openapi: '3.1.0',
  info: { title: 'SDKWork IM API', version: '1.0.0' },
  paths: {
    '/im/v3/api/conversations': {
      get: {
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

const baseConfig: GeneratorConfig = {
  name: 'sdkwork-im-sdk',
  version: '1.0.0',
  language: 'typescript',
  sdkType: 'im',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://chat.example.com/sdkwork/chat',
  apiPrefix: '/im/v3/api',
  packageName: '@sdkwork/im-sdk-generated',
  options: {
    standardProfile: 'sdkwork-v3',
  },
};

function generatedPackageJson(resultFiles: Array<{ path: string; content: string }>): Record<string, unknown> {
  const packageJsonFile = resultFiles.find((file) => file.path === 'package.json');
  expect(packageJsonFile).toBeDefined();
  return JSON.parse(packageJsonFile!.content) as Record<string, unknown>;
}

function generatedFileContent(
  resultFiles: Array<{ path: string; content: string }>,
  filePath: string,
): string {
  const file = resultFiles.find((candidate) => candidate.path === filePath);
  expect(file).toBeDefined();
  return file!.content;
}

describe('TypeScript build config generator', () => {
  it('marks sdkwork-v3 generated transport packages private with a generator-owned description', async () => {
    const result = await new TypeScriptGenerator().generate(baseConfig, spec);
    expect(result.errors).toEqual([]);

    const packageJson = generatedPackageJson(result.files);

    expect(packageJson.name).toBe('sdkwork-im-sdk-generated-typescript');
    expect(packageJson.private).toBe(true);
    expect(packageJson.description).toBe('Generator-owned TypeScript transport SDK for sdkwork-im-sdk.');
  });

  it('builds TypeScript packages before check-mode npm pack validation', async () => {
    const result = await new TypeScriptGenerator().generate(baseConfig, spec);
    expect(result.errors).toEqual([]);

    const publishCore = generatedFileContent(result.files, 'bin/publish-core.mjs');
    const runTypeScriptStart = publishCore.indexOf('function runTypeScript(ctx) {');
    const runDartStart = publishCore.indexOf('function runDart(ctx) {');
    expect(runTypeScriptStart).toBeGreaterThanOrEqual(0);
    expect(runDartStart).toBeGreaterThan(runTypeScriptStart);

    const runTypeScriptBody = publishCore.slice(runTypeScriptStart, runDartStart);
    const installIndex = runTypeScriptBody.indexOf("run('npm', ['install'], { cwd: ctx.projectDir });");
    const buildIndex = runTypeScriptBody.indexOf("run('npm', ['run', 'build'], { cwd: ctx.projectDir });");
    const packIndex = runTypeScriptBody.indexOf("run('npm', ['pack', '--dry-run'], { cwd: ctx.projectDir });");

    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeGreaterThan(installIndex);
    expect(packIndex).toBeGreaterThan(buildIndex);
  });

  it('keeps non-sdkwork-v3 generated TypeScript package manifests publishable by default', async () => {
    const result = await new TypeScriptGenerator().generate(
      {
        ...baseConfig,
        name: 'DemoSdk',
        sdkType: 'custom',
        apiPrefix: '/api/v1',
        packageName: '@sdkwork/demo-sdk',
        options: undefined,
      },
      {
        ...spec,
        paths: {
          '/api/v1/widgets': {
            get: {
              operationId: 'widgets.list',
              tags: ['widgets'],
              security: [],
              responses: {
                '200': { description: 'OK' },
              },
            },
          },
        },
        components: { schemas: {} },
      },
    );
    expect(result.errors).toEqual([]);

    const packageJson = generatedPackageJson(result.files);
    expect(packageJson.private).toBeUndefined();
    expect(packageJson.description).toBe('DemoSdk');
  });
});
