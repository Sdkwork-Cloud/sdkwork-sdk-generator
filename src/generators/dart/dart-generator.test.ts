import { describe, expect, it } from 'vitest';

import type { ApiSpec, GeneratorConfig } from '../../framework/types.js';
import { getGenerator } from '../../index.js';

const dartConfig: GeneratorConfig = {
  name: 'SdkworkAppSdk',
  version: '1.0.0',
  language: 'dart' as any,
  sdkType: 'app',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/app/v3/api',
  packageName: 'sdkwork_app_sdk_dart',
};

const dartSpec: ApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Dart SDK Regression',
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

describe('Dart generator', () => {
  it('registers dart as a supported generator-backed language', async () => {
    const generator = getGenerator('dart' as any);
    expect(generator).toBeDefined();
    expect(generator?.language).toBe('dart');
  });

  it('generates a standalone dart package with typed serialization', async () => {
    const generator = getGenerator('dart' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(dartConfig, dartSpec);
    const pubspec = result.files.find((file) => file.path === 'pubspec.yaml');
    const rootLibrary = result.files.find((file) => file.path === 'lib/sdkwork_app_sdk_dart.dart');
    const clientFile = result.files.find((file) => file.path === 'lib/src/http/client.dart');
    const configFile = result.files.find((file) => file.path === 'lib/src/http/sdk_config.dart');
    const apiFile = result.files.find((file) => file.path === 'lib/src/api/user.dart');
    const responseHelperFile = result.files.find((file) => file.path === 'lib/src/api/response_helpers.dart');
    const modelsFile = result.files.find((file) => file.path === 'lib/src/models.dart');
    const readme = result.files.find((file) => file.path === 'README.md');

    expect(result.errors).toEqual([]);
    expect(pubspec).toBeDefined();
    expect(pubspec!.content).toContain('name: sdkwork_app_sdk_dart');
    expect(pubspec!.content).toContain('http:');
    expect(rootLibrary).toBeDefined();
    expect(rootLibrary!.content).toContain("export 'src/models.dart';");
    expect(rootLibrary!.content).toContain("export 'src/http/sdk_config.dart';");
    expect(clientFile).toBeDefined();
    expect(clientFile!.content).toContain("import 'dart:convert';");
    expect(clientFile!.content).toContain("import 'package:http/http.dart' as http;");
    expect(clientFile!.content).toContain('http.StreamedResponse response;');
    expect(configFile).toBeDefined();
    expect(apiFile).toBeDefined();
    expect(responseHelperFile).toBeDefined();
    expect(responseHelperFile!.content).toContain('Map<String, dynamic>? sdkworkResponseAsMap(dynamic value) {');
    expect(apiFile!.content).toContain("import 'response_helpers.dart';");
    expect(apiFile!.content).toContain('final map = sdkworkResponseAsMap(response);');
    expect(apiFile!.content).toContain('PlusApiResultUserProfileVO.fromJson(map);');
    expect(apiFile!.content).toContain("ApiPaths.appPath('/user/$userId')");
    expect(apiFile!.content).not.toContain("ApiPaths.appPath('/user/${userId}')");
    expect(apiFile!.content).toContain('final payload = body.toJson();');
    expect(apiFile!.content).not.toContain('final payload = body?.toJson();');
    expect(modelsFile).toBeDefined();
    expect(modelsFile!.content).toContain('factory UserProfileVO.fromJson(Map<String, dynamic> json)');
    expect(modelsFile!.content).toContain('Map<String, dynamic> toJson()');
    expect(modelsFile!.content).toContain("'data': data?.toJson(),");
    expect(modelsFile!.content).toContain("'members': members?.map((item) => item.toJson()).toList(),");
    expect(modelsFile!.content).toContain("'membersById': membersById?.map((key, item) => MapEntry(key, item.toJson())),");
    expect(modelsFile!.content).toContain('final dynamic data;');
    expect(modelsFile!.content).not.toContain('final dynamic? data;');
    expect(readme).toBeDefined();
    expect(readme!.content).toContain('Dart');
    expect(readme!.content).toContain('dart pub add sdkwork_app_sdk_dart');
  });
});
