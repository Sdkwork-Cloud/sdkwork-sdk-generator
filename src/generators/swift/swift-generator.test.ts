import { describe, expect, it } from 'vitest';

import type { ApiSpec, GeneratorConfig } from '../../framework/types.js';
import { getGenerator } from '../../index.js';

const swiftConfig: GeneratorConfig = {
  name: 'SdkworkAppSdk',
  version: '1.0.0',
  language: 'swift' as any,
  sdkType: 'app',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/app/v3/api',
};

const typedTransportSpec: ApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Swift Typed Transport Regression',
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
                  $ref: '#/components/schemas/UserProfile',
                },
              },
            },
          },
        },
      },
    },
    '/app/v3/api/tenant/list': {
      post: {
        summary: 'List tenants',
        operationId: 'listByPage',
        tags: ['Tenant'],
        parameters: [
          { name: 'page', in: 'query', required: false, schema: { type: 'integer' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/PlusTenantQueryListForm',
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
                  $ref: '#/components/schemas/PlusApiResultPagePlusTenantVO',
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
      UserProfile: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
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

const wrappedTypedResponseSpec: ApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Swift Wrapped Typed Response Regression',
    version: '1.0.0',
  },
  paths: {
    '/app/v3/api/user/profile': {
      get: {
        summary: 'Get wrapped user profile',
        operationId: 'getWrappedUserProfile',
        tags: ['User'],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PlusApiResultUserProfile',
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
      UserProfile: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      PlusApiResultUserProfile: {
        type: 'object',
        properties: {
          data: {
            $ref: '#/components/schemas/UserProfile',
          },
          code: {
            type: 'string',
          },
        },
      },
    },
  },
};

describe('Swift generator regressions', () => {
  it('converts typed Swift responses through Decodable helpers instead of raw Any casts', async () => {
    const generator = getGenerator('swift' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(swiftConfig, typedTransportSpec);
    const apiFile = result.files.find((file) => file.path === 'Sources/API/UserApi.swift');
    const httpFile = result.files.find((file) => file.path === 'Sources/HTTP/HttpClient.swift');
    const modelsFile = result.files.find((file) => file.path === 'Sources/Models.swift');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(httpFile).toBeDefined();
    expect(modelsFile).toBeDefined();

    expect(modelsFile!.content).toContain('public struct UserProfile: Codable');
    expect(modelsFile!.content).toContain('public let id: String?');

    expect(apiFile!.content).toContain('return try await client.get(ApiPaths.appPath("/user/profile"), responseType: UserProfile.self)');
    expect(apiFile!.content).not.toContain('return response as? UserProfile');

    expect(httpFile!.content).toContain('private let encoder = JSONEncoder()');
    expect(httpFile!.content).toContain('private let decoder = JSONDecoder()');
    expect(httpFile!.content).toContain('private struct AnyEncodable: Encodable');
    expect(httpFile!.content).toContain('private func parseResponse<T: Decodable>(_ data: Data, _ response: URLResponse, as type: T.Type) throws -> T?');
    expect(httpFile!.content).toContain('public func get<T: Decodable>(');
    expect(httpFile!.content).toContain('return try parseResponse(data, response, as: responseType)');
  });

  it('encodes typed Swift request bodies through Codable helpers instead of falling back to string interpolation', async () => {
    const generator = getGenerator('swift' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(swiftConfig, typedTransportSpec);
    const apiFile = result.files.find((file) => file.path === 'Sources/API/TenantApi.swift');
    const httpFile = result.files.find((file) => file.path === 'Sources/HTTP/HttpClient.swift');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(httpFile).toBeDefined();

    expect(apiFile!.content).toContain('body: PlusTenantQueryListForm? = nil');
    expect(apiFile!.content).toContain('return try await client.post(ApiPaths.appPath("/tenant/list"), body: body, params: params, headers: nil, contentType: "application/json", responseType: PlusApiResultPagePlusTenantVO.self)');

    expect(httpFile!.content).toContain('if let encodableBody = body as? any Encodable');
    expect(httpFile!.content).toContain('return (try encoder.encode(AnyEncodable(encodableBody)), "application/json")');
  });

  it('emits XCTest smoke tests and a SwiftPM test target when generateTests is enabled', async () => {
    const generator = getGenerator('swift' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({ ...swiftConfig, generateTests: true }, typedTransportSpec);
    const packageFile = result.files.find((file) => file.path === 'Package.swift');
    const smokeTestFile = result.files.find((file) => file.path === 'Tests/AppSDKTests/GeneratedSdkSmokeTests.swift');

    expect(result.errors).toEqual([]);
    expect(packageFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();

    expect(packageFile!.content).toContain('.testTarget(');
    expect(packageFile!.content).toContain('name: "AppSDKTests"');
    expect(packageFile!.content).toContain('dependencies: ["AppSDK", "SDKworkCommon"]');

    expect(smokeTestFile!.content).toContain('import XCTest');
    expect(smokeTestFile!.content).toContain('@testable import AppSDK');
    expect(smokeTestFile!.content).toContain('let client = SdkworkAppClient(config: config)');
    expect(smokeTestFile!.content).toContain('let result = try await client.user.getUserProfile()');
    expect(smokeTestFile!.content).toContain('XCTAssertEqual("1", result?.id)');
  });

  it('asserts wrapped Swift `$ref` response properties as non-null in generated smoke tests', async () => {
    const generator = getGenerator('swift' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({ ...swiftConfig, generateTests: true }, wrappedTypedResponseSpec);
    const smokeTestFile = result.files.find((file) => file.path === 'Tests/AppSDKTests/GeneratedSdkSmokeTests.swift');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('let result = try await client.user.getWrappedUserProfile()');
    expect(smokeTestFile!.content).toContain('XCTAssertNotNil(result?.data)');
    expect(smokeTestFile!.content).toContain('XCTAssertEqual("ok", result?.code)');
  });
});
