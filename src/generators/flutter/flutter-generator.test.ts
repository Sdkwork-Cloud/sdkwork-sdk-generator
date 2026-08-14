import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
  packageName: 'notes_app_sdk',
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
          labels: {
            allOf: [
              {
                $ref: '#/components/schemas/StringMapVO',
              },
            ],
          },
          nullableLabels: {
            allOf: [
              {
                $ref: '#/components/schemas/NullableStringMapVO',
              },
            ],
          },
          attributes: {
            type: 'object',
            additionalProperties: true,
          },
          dynamicAttributes: {
            type: 'object',
            additionalProperties: {},
          },
        },
      },
      StringMapVO: {
        type: 'object',
        additionalProperties: {
          type: 'string',
        },
      },
      NullableStringMapVO: {
        type: 'object',
        additionalProperties: {
          anyOf: [
            { type: 'string' },
            { type: 'null' },
          ],
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

const flutterVoidOnlySpec: ApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Flutter Void API Regression',
    version: '1.0.0',
  },
  paths: {
    '/app/v3/api/forms': {
      post: {
        summary: 'Submit form',
        operationId: 'submitForm',
        tags: ['Forms'],
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                $ref: '#/components/schemas/SubmitFormRequest',
              },
            },
          },
        },
        responses: {
          '204': {
            description: 'No content',
          },
        },
      },
    },
  },
  components: {
    schemas: {
      SubmitFormRequest: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
          },
        },
      },
    },
  },
};

const flutterMultiApiHelperSpec: ApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Flutter Multi API Helper Regression',
    version: '1.0.0',
  },
  paths: {
    '/app/v3/api/orgs/{orgId}': {
      get: {
        summary: 'Get org',
        operationId: 'getOrg',
        tags: ['Org'],
        parameters: [
          {
            name: 'orgId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: { '204': { description: 'No content' } },
      },
    },
    '/app/v3/api/teams/{teamId}': {
      get: {
        summary: 'Get team',
        operationId: 'getTeam',
        tags: ['Team'],
        parameters: [
          {
            name: 'teamId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: { '204': { description: 'No content' } },
      },
    },
  },
  components: { schemas: {} },
};

const flutterObjectRuntimeSpec: ApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Flutter Object Runtime Regression',
    version: '1.0.0',
  },
  paths: {
    '/app/v3/api/runtime_records/current': {
      get: {
        summary: 'Get runtime record',
        operationId: 'runtimeRecords.current.retrieve',
        tags: ['Runtime'],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RuntimeRecord',
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
      RuntimeRecord: {
        type: 'object',
        properties: {
          runtimeType: { type: 'string' },
        },
      },
    },
  },
};

const flutterDiscriminatedContentSpec: ApiSpec = {
  openapi: '3.1.2',
  info: { title: 'Flutter Discriminated Content API', version: '1.0.0' },
  paths: {
    '/app/v3/api/messages': {
      post: {
        summary: 'Create message',
        operationId: 'messages.create',
        tags: ['chat'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  parts: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/ContentPart' },
                  },
                },
              },
            },
          },
        },
        responses: { '204': { description: 'No content' } },
      },
    },
  },
  components: {
    schemas: {
      ContentPart: {
        discriminator: { propertyName: 'kind' } as any,
        oneOf: [
          { $ref: '#/components/schemas/TextContentPart' },
          { $ref: '#/components/schemas/MediaContentPart' },
        ],
      },
      TextContentPart: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'text'],
        properties: {
          kind: { type: 'string', enum: ['text'] },
          text: { type: 'string' },
        },
      },
      MediaContentPart: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'drive', 'resource'],
        properties: {
          kind: { type: 'string', enum: ['media'] },
          drive: { $ref: '#/components/schemas/DriveReference' },
          resource: { $ref: '#/components/schemas/MediaResource' },
          mediaRole: { type: 'string' },
        },
      },
      DriveReference: {
        type: 'object',
        required: ['driveUri', 'spaceId', 'nodeId'],
        properties: {
          driveUri: { type: 'string' },
          spaceId: { type: 'string' },
          nodeId: { type: 'string' },
        },
      },
      MediaResource: {
        type: 'object',
        required: ['uri'],
        properties: {
          uri: { type: 'string' },
          kind: { type: 'string' },
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
    const rootFile = result.files.find((file) => file.path === 'lib/notes_app_sdk.dart');
    const apiFile = result.files.find((file) => file.path === 'lib/src/api/user.dart');
    const licenseFile = result.files.find((file) => file.path === 'LICENSE');
    const changelogFile = result.files.find((file) => file.path === 'CHANGELOG.md');

    expect(result.errors).toEqual([]);
    expect(clientFile).toBeDefined();
    expect(rootFile).toBeDefined();
    expect(apiFile).toBeDefined();
    expect(rootFile!.content).toContain("export 'app_client.dart';");
    expect(rootFile!.content).toContain("export 'src/models.dart';");
    expect(clientFile!.content).toContain("import 'src/api/user.dart';");
    expect(clientFile!.content).not.toContain("import '../api/user.dart';");
    expect(apiFile!.content).toContain("import 'paths.dart';");
    expect(licenseFile).toBeDefined();
    expect(licenseFile!.content).toContain('MIT License');
    expect(changelogFile).toBeDefined();
    expect(changelogFile!.content).toContain('## 1.0.0');
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
    expect(modelsFile!.content).toContain('final Map<String, String>? labels;');
    expect(modelsFile!.content).toContain("labels: (() {\n        final map = _sdkworkAsMap(json['labels']);");
    expect(modelsFile!.content).toContain("nullableLabels: (() {\n        final map = _sdkworkAsMap(json['nullableLabels']);");
    expect(modelsFile!.content).toContain('final Map<String, dynamic>? attributes;');
    expect(modelsFile!.content).toContain("attributes: _sdkworkAsMap(json['attributes'])");
    expect(modelsFile!.content).toContain('final Map<String, dynamic>? dynamicAttributes;');
    expect(modelsFile!.content).toContain("dynamicAttributes: (() {\n        final map = _sdkworkAsMap(json['dynamicAttributes']);");
    expect(modelsFile!.content).not.toContain("labels: _sdkworkAsMap(json['labels'])");
    expect(modelsFile!.content).not.toContain("nullableLabels: _sdkworkAsMap(json['nullableLabels'])");
    expect(modelsFile!.content).not.toContain('if (deserialized is dynamic)');
    expect(modelsFile!.content).not.toContain('StringMapVO.fromJson');
    expect(modelsFile!.content).not.toContain('NullableStringMapVO.fromJson');
    expect(modelsFile!.content).toContain('final dynamic data;');
    expect(modelsFile!.content).not.toContain('final dynamic? data;');
  });

  it('keeps required nullable session activity fields nullable while rejecting missing keys', async () => {
    const generator = new FlutterGenerator();
    const result = await generator.generate(flutterConfig, {
      openapi: '3.1.2',
      info: { title: 'Session Activity API', version: '1.0.0' },
      paths: {
        '/app/v3/api/ai/session_activity_summaries': {
          get: {
            operationId: 'agents.sessionActivitySummaries.list',
            tags: ['ai'],
            responses: { '204': { description: 'No content' } },
          },
        },
      },
      components: {
        schemas: {
          AgentTurnRecord: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } },
          },
          SessionActivityFreshness: {
            type: 'object',
            required: ['observedAt', 'freshUntil'],
            properties: {
              observedAt: { type: ['string', 'null'], format: 'date-time' },
              freshUntil: { type: ['string', 'null'], format: 'date-time' },
            },
          },
          SessionActivitySummary: {
            type: 'object',
            required: ['latestTurn', 'freshness'],
            properties: {
              latestTurn: {
                oneOf: [
                  { $ref: '#/components/schemas/AgentTurnRecord' },
                  { type: 'null' },
                ],
              },
              freshness: { $ref: '#/components/schemas/SessionActivityFreshness' },
            },
          },
        },
      },
    });
    const modelsFile = result.files.find((file) => file.path === 'lib/src/models.dart');

    expect(result.errors).toEqual([]);
    expect(modelsFile).toBeDefined();
    expect(modelsFile!.content).toContain('final AgentTurnRecord? latestTurn;');
    expect(modelsFile!.content).toContain('required this.latestTurn');
    expect(modelsFile!.content).toContain("if (!json.containsKey('latestTurn')) {");
    expect(modelsFile!.content).toContain("final _sdkworkRequiredValue = json['latestTurn'];\n        if (_sdkworkRequiredValue == null) {\n          return null;");
    expect(modelsFile!.content).toContain("'latestTurn': latestTurn?.toJson(),");
    expect(modelsFile!.content).toContain('final String? observedAt;');
    expect(modelsFile!.content).toContain('final String? freshUntil;');
    expect(modelsFile!.content).toContain("if (!json.containsKey('observedAt')) {");
    expect(modelsFile!.content).not.toContain('final AgentTurnRecord latestTurn;');
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
    expect(apiFile!.content).toContain("ApiPaths.appPath('/user/\${serializePathParameter(userId, const PathParameterSpec('userId', 'simple', false))}')");
    expect(apiFile!.content).not.toContain("ApiPaths.appPath('/user/${userId}')");
    expect(apiFile!.content).toContain('final payload = body.toJson();');
    expect(apiFile!.content).not.toContain('final payload = body?.toJson();');
  });

  it('generates standardized flutter smoke tests and planner-backed readme examples', async () => {
    const generator = new FlutterGenerator();
    const result = await generator.generate({ ...flutterConfig, generateTests: true }, flutterSpec);
    const smokeTestFile = result.files.find((file) => file.path === 'test/generated_sdk_smoke_test.dart');
    const readmeFile = result.files.find((file) => file.path === 'README.md');
    const pubspecFile = result.files.find((file) => file.path === 'pubspec.yaml');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(readmeFile).toBeDefined();
    expect(pubspecFile).toBeDefined();
    expect(pubspecFile!.content).toContain('homepage: https://github.com/sdkwork-ai/sdkwork-sdk-generator');
    expect(pubspecFile!.content).toContain('repository: https://github.com/sdkwork-ai/sdkwork-sdk-generator');
    expect(pubspecFile!.content).toContain('http: ^1.2.0');
    expect(smokeTestFile!.content).toContain("import 'package:notes_app_sdk/notes_app_sdk.dart';");
    expect(smokeTestFile!.content).toContain("final client = SdkworkAppClient.withBaseUrl(baseUrl: 'http://127.0.0.1:${server.port}');");
    expect(smokeTestFile!.content).toContain('final result = await client.user.getUserProfile();');
    expect(smokeTestFile!.content).toContain('expect(result?.data, isNotNull);');
    expect(readmeFile!.content).toContain("final client = SdkworkAppClient.withBaseUrl(baseUrl: 'https://api.example.com');");
    expect(readmeFile!.content).toContain('final result = await client.user.getUserProfile();');
    expect(readmeFile!.content).toContain(`try {
  final result = await client.user.getUserProfile();
  print(result);`);
    expect(readmeFile!.content).not.toContain("import 'package:sdkwork_common_flutter/sdkwork_common_flutter.dart';");
  });

  it('generates flutter workspace overrides when sdkwork-sdk-commons is a sibling workspace root', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdkwork-flutter-workspace-'));
    try {
      const outputPath = path.join(
        workspaceRoot,
        'sdkwork-appbase',
        'sdks',
        'sdkwork-iam-app-sdk',
        'sdkwork-iam-app-sdk-flutter',
        'generated',
        'server-openapi',
      );
      const commonPackagePath = path.join(
        workspaceRoot,
        'sdkwork-sdk-commons',
        'sdkwork-sdk-common-flutter',
      );
      fs.mkdirSync(outputPath, { recursive: true });
      fs.mkdirSync(commonPackagePath, { recursive: true });

      const generator = new FlutterGenerator();
      const result = await generator.generate({ ...flutterConfig, outputPath }, flutterSpec);
      const overridesFile = result.files.find((file) => file.path === 'pubspec_overrides.yaml');

      expect(result.errors).toEqual([]);
      expect(overridesFile).toBeDefined();
      expect(overridesFile!.content).toContain('sdkwork_common_flutter:');
      expect(overridesFile!.content).toContain(
        `path: ${path.relative(outputPath, commonPackagePath).replace(/\\/g, '/')}`,
      );
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('does not import response helpers for void-only flutter api files', async () => {
    const generator = new FlutterGenerator();
    const result = await generator.generate(flutterConfig, flutterVoidOnlySpec);
    const apiFile = result.files.find((file) => file.path === 'lib/src/api/form.dart');
    const modelsFile = result.files.find((file) => file.path === 'lib/src/models.dart');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(modelsFile).toBeDefined();
    expect(apiFile!.content).not.toContain("import 'response_helpers.dart';");
    expect(apiFile!.content).toContain("contentType: 'application/x-www-form-urlencoded'");
    expect(modelsFile!.content).not.toContain('_sdkworkAsMap');
    expect(modelsFile!.content).not.toContain('_sdkworkAsList');
  });

  it('does not emit analyzer warnings for unused flutter model imports or smoke-test captures', async () => {
    const generator = new FlutterGenerator();
    const result = await generator.generate({ ...flutterConfig, generateTests: true }, {
      openapi: '3.1.0',
      info: { title: 'Flutter Empty Response API', version: '1.0.0' },
      paths: {
        '/app/v3/api/ping': {
          get: {
            summary: 'Ping',
            operationId: 'ping',
            tags: ['Ping'],
            responses: { '204': { description: 'No content' } },
          },
        },
      },
      components: { schemas: {} },
    });
    const apiFile = result.files.find((file) => file.path === 'lib/src/api/ping.dart');
    const smokeTestFile = result.files.find((file) => file.path === 'test/generated_sdk_smoke_test.dart');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(apiFile!.content).not.toContain("import '../models.dart';");
    expect(smokeTestFile!.content).not.toContain("import 'dart:convert';");
    expect(smokeTestFile!.content).not.toContain('capturedQuery');
    expect(smokeTestFile!.content).not.toContain('capturedHeaders');
    expect(smokeTestFile!.content).not.toContain('capturedBody');
    expect(smokeTestFile!.content).not.toContain('capturedContentType');
    expect(smokeTestFile!.content).not.toContain('Future<List<int>> readRequestBody');
  });

  it('hides internal flutter api helpers from the barrel export to avoid ambiguous exports', async () => {
    const generator = new FlutterGenerator();
    const result = await generator.generate(flutterConfig, flutterMultiApiHelperSpec);
    const apiIndex = result.files.find((file) => file.path === 'lib/src/api/api.dart');

    expect(result.errors).toEqual([]);
    expect(apiIndex).toBeDefined();
    expect(apiIndex!.content).toContain("export 'org.dart' hide ");
    expect(apiIndex!.content).toContain("export 'team.dart' hide ");
    expect(apiIndex!.content).toContain('PathParameterSpec');
    expect(apiIndex!.content).not.toContain('QueryParameterSpec');
    expect(apiIndex!.content).not.toContain('HeaderParameterSpec');
    expect(apiIndex!.content).not.toContain("export 'org.dart';");
    expect(apiIndex!.content).not.toContain("export 'team.dart';");
  });

  it('escapes flutter model fields that would override Object runtime getters', async () => {
    const generator = new FlutterGenerator();
    const result = await generator.generate(flutterConfig, flutterObjectRuntimeSpec);
    const modelsFile = result.files.find((file) => file.path === 'lib/src/models.dart');

    expect(result.errors).toEqual([]);
    expect(modelsFile).toBeDefined();
    expect(modelsFile!.content).toContain('final String? runtimeType_;');
    expect(modelsFile!.content).toContain('this.runtimeType_');
    expect(modelsFile!.content).toContain("runtimeType_: json['runtimeType']?.toString()");
    expect(modelsFile!.content).toContain("'runtimeType': runtimeType_,");
    expect(modelsFile!.content).not.toContain('final String? runtimeType;');
  });

  it('generates oneOf content parts as discriminated Flutter models instead of one wide DTO', async () => {
    const generator = new FlutterGenerator();
    const result = await generator.generate(flutterConfig, flutterDiscriminatedContentSpec);
    const modelsFile = result.files.find((file) => file.path === 'lib/src/models.dart');

    expect(result.errors).toEqual([]);
    expect(modelsFile).toBeDefined();
    expect(modelsFile!.content).toContain('abstract class ContentPart {');
    expect(modelsFile!.content).toContain('factory ContentPart.fromJson(Map<String, dynamic> json) {');
    expect(modelsFile!.content).toContain("case 'media':");
    expect(modelsFile!.content).toContain('return MediaContentPart.fromJson(json);');
    expect(modelsFile!.content).toContain('class MediaContentPart implements ContentPart {');
    expect(modelsFile!.content).toContain("final String kind;");
    expect(modelsFile!.content).toContain('final DriveReference drive;');
    expect(modelsFile!.content).toContain('final MediaResource resource;');
    expect(modelsFile!.content).toContain('required this.drive');
    expect(modelsFile!.content).toContain('required this.resource');
    expect(modelsFile!.content).not.toContain('class ContentPart {\n  final String?');
  });
});
