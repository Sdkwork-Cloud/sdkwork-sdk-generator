import { describe, expect, it } from 'vitest';

import type { ApiSpec, GeneratorConfig } from '../../framework/types.js';
import { FlutterGenerator } from './index.js';

const flutterConfig: GeneratorConfig = {
  name: 'SdkworkAppSdk',
  version: '1.0.0',
  language: 'flutter',
  sdkType: 'app',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/app/v3/api',
};

const flutterSpec: ApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Flutter SDK Regression',
    version: '1.0.0',
  },
  paths: {
    '/app/v3/api/user/profile': {
      get: {
        summary: 'Get user profile',
        operationId: 'getUserProfile',
        tags: ['User'],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PlusApiResultUserProfileVO',
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
      EmptyPayload: {
        type: 'object',
        properties: {},
      },
      UserProfileVO: {
        type: 'object',
        properties: {
          nickname: {
            type: 'string',
          },
        },
      },
      PlusApiResultUserProfileVO: {
        type: 'object',
        properties: {
          data: {
            $ref: '#/components/schemas/UserProfileVO',
          },
          code: {
            type: 'string',
          },
        },
      },
    },
  },
};

describe('Flutter generator regressions', () => {
  it('generates sdk client imports from lib/src/api', async () => {
    const generator = new FlutterGenerator();
    const result = await generator.generate(flutterConfig, flutterSpec);
    const clientFile = result.files.find((file) => file.path === 'lib/app_client.dart');
    const apiFile = result.files.find((file) => file.path === 'lib/src/api/user.dart');

    expect(result.errors).toEqual([]);
    expect(clientFile).toBeDefined();
    expect(apiFile).toBeDefined();
    expect(clientFile!.content).toContain("import 'src/api/user.dart';");
    expect(clientFile!.content).not.toContain("import '../api/user.dart';");
    expect(apiFile!.content).toContain("import 'paths.dart';");
  });

  it('generates valid constructors for empty object schemas', async () => {
    const generator = new FlutterGenerator();
    const result = await generator.generate(flutterConfig, flutterSpec);
    const modelsFile = result.files.find((file) => file.path === 'lib/src/models.dart');

    expect(result.errors).toEqual([]);
    expect(modelsFile).toBeDefined();
    expect(modelsFile!.content).toContain('class EmptyPayload {');
    expect(modelsFile!.content).toContain('  EmptyPayload();');
    expect(modelsFile!.content).not.toContain('EmptyPayload({');
  });
});
