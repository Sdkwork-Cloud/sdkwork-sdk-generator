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
    '/app/v3/api/user/{userId}': {
      get: {
        summary: 'Get user profile by id',
        operationId: 'getUserById',
        tags: ['User'],
        parameters: [
          {
            name: 'userId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
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
    '/app/v3/api/user/profile/update': {
      post: {
        summary: 'Update user profile',
        operationId: 'updateUserProfile',
        tags: ['User'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UserProfileVO',
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
      TeamVO: {
        type: 'object',
        properties: {
          members: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/UserProfileVO',
            },
          },
        },
      },
      TeamDirectoryVO: {
        type: 'object',
        properties: {
          membersById: {
            type: 'object',
            additionalProperties: {
              $ref: '#/components/schemas/UserProfileVO',
            },
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
      PlusApiResultVoid: {
        type: 'object',
        properties: {
          data: {},
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
    const rootFile = result.files.find((file) => file.path === 'lib/app_sdk.dart');
    const apiFile = result.files.find((file) => file.path === 'lib/src/api/user.dart');
    const overridesFile = result.files.find((file) => file.path === 'pubspec_overrides.yaml');

    expect(result.errors).toEqual([]);
    expect(clientFile).toBeDefined();
    expect(rootFile).toBeDefined();
    expect(apiFile).toBeDefined();
    expect(overridesFile).toBeDefined();
    expect(rootFile!.content).toContain("export 'app_client.dart';");
    expect(rootFile!.content).toContain("export 'src/models.dart';");
    expect(clientFile!.content).toContain("import 'src/api/user.dart';");
    expect(clientFile!.content).not.toContain("import '../api/user.dart';");
    expect(apiFile!.content).toContain("import 'paths.dart';");
    expect(overridesFile!.content).toContain('dependency_overrides:');
    expect(overridesFile!.content).toContain('sdkwork_common_flutter:');
    expect(overridesFile!.content).toContain('path:');
    expect(overridesFile!.content).toContain('sdkwork-sdk-common-flutter');
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

  it('generates model json serializers for typed flutter responses', async () => {
    const generator = new FlutterGenerator();
    const result = await generator.generate(flutterConfig, flutterSpec);
    const modelsFile = result.files.find((file) => file.path === 'lib/src/models.dart');

    expect(result.errors).toEqual([]);
    expect(modelsFile).toBeDefined();
    expect(modelsFile!.content).toContain('factory UserProfileVO.fromJson(Map<String, dynamic> json)');
    expect(modelsFile!.content).toContain('factory PlusApiResultUserProfileVO.fromJson(Map<String, dynamic> json)');
    expect(modelsFile!.content).toContain("'data': data?.toJson(),");
    expect(modelsFile!.content).toContain("'members': members?.map((item) => item.toJson()).toList(),");
    expect(modelsFile!.content).toContain("'membersById': membersById?.map((key, item) => MapEntry(key, item.toJson())),");
    expect(modelsFile!.content).toContain('final dynamic data;');
    expect(modelsFile!.content).not.toContain('final dynamic? data;');
  });

  it('deserializes typed flutter api responses instead of returning raw maps', async () => {
    const generator = new FlutterGenerator();
    const result = await generator.generate(flutterConfig, flutterSpec);
    const apiFile = result.files.find((file) => file.path === 'lib/src/api/user.dart');
    const responseHelperFile = result.files.find((file) => file.path === 'lib/src/api/response_helpers.dart');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(responseHelperFile).toBeDefined();
    expect(responseHelperFile!.content).toContain('Map<String, dynamic>? sdkworkResponseAsMap(dynamic value) {');
    expect(apiFile!.content).toContain("import 'response_helpers.dart';");
    expect(apiFile!.content).toContain('final map = sdkworkResponseAsMap(response);');
    expect(apiFile!.content).toContain('PlusApiResultUserProfileVO.fromJson(map);');
    expect(apiFile!.content).not.toContain('return response is PlusApiResultUserProfileVO ? response : null;');
    expect(apiFile!.content).toContain("ApiPaths.appPath('/user/$userId')");
    expect(apiFile!.content).not.toContain("ApiPaths.appPath('/user/${userId}')");
    expect(apiFile!.content).toContain('final payload = body.toJson();');
    expect(apiFile!.content).not.toContain('final payload = body?.toJson();');
  });
});
