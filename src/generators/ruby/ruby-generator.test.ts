import { describe, expect, it } from 'vitest';

import type { ApiSpec, GeneratorConfig } from '../../framework/types.js';
import { getGenerator } from '../../index.js';

const rubyConfig: GeneratorConfig = {
  name: 'SdkworkAppSdk',
  version: '1.0.0',
  language: 'ruby' as any,
  sdkType: 'app',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/app/v3/api',
  packageName: 'sdkwork-app-sdk',
};

const rubySpec: ApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Ruby SDK Regression',
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

const composedScalarResponseSpec: ApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Ruby Composed Scalar Response Regression',
    version: '1.0.0',
  },
  paths: {
    '/app/v3/api/stats/summary': {
      get: {
        summary: 'Get stats summary',
        operationId: 'getStatsSummary',
        tags: ['Stats'],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/StatsSummary',
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
      StatsSummary: {
        type: 'object',
        properties: {
          total: {
            allOf: [
              {
                type: 'integer',
              },
            ],
          },
        },
      },
    },
  },
};

const composedQueryParameterSpec: ApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Ruby Composed Query Parameter Regression',
    version: '1.0.0',
  },
  paths: {
    '/app/v3/api/stats/list': {
      get: {
        summary: 'List stats',
        operationId: 'listStats',
        tags: ['Stats'],
        parameters: [
          {
            name: 'page',
            in: 'query',
            required: false,
            schema: {
              allOf: [
                {
                  type: 'integer',
                },
              ],
            },
          },
        ],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    code: {
                      type: 'string',
                    },
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

describe('Ruby generator', () => {
  it('emits ruby smoke tests and aligns README quick start when generateTests is enabled', async () => {
    const generator = getGenerator('ruby' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({ ...rubyConfig, generateTests: true }, rubySpec);
    const gemspecFile = result.files.find((file) => file.path === 'sdkwork-app-sdk.gemspec');
    const smokeTestFile = result.files.find((file) => file.path === 'test/generated_sdk_smoke_test.rb');
    const readme = result.files.find((file) => file.path === 'README.md');

    expect(result.errors).toEqual([]);
    expect(gemspecFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(readme).toBeDefined();

    expect(gemspecFile!.content).toContain("spec.add_development_dependency 'minitest'");
    expect(smokeTestFile!.content).toContain("require 'sdkwork/app_sdk'");
    expect(smokeTestFile!.content).toContain('result = client.user.get_user_profile');
    expect(smokeTestFile!.content).toContain("assert_equal '/app/v3/api/user/profile', captured[:path]");
    expect(smokeTestFile!.content).toContain("assert_equal 'ok', result&.code");

    expect(readme!.content).toContain('result = client.user.get_user_profile');
  });

  it('asserts composed Ruby scalar response properties from resolved schemas in smoke tests', async () => {
    const generator = getGenerator('ruby' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({ ...rubyConfig, generateTests: true }, composedScalarResponseSpec);
    const smokeTestFile = result.files.find((file) => file.path === 'test/generated_sdk_smoke_test.rb');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('result = client.stat.get_stats_summary()');
    expect(smokeTestFile!.content).toContain('assert_equal 2, result&.total');
  });

  it('samples composed Ruby query parameters from resolved schemas in smoke tests', async () => {
    const generator = getGenerator('ruby' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({ ...rubyConfig, generateTests: true }, composedQueryParameterSpec);
    const smokeTestFile = result.files.find((file) => file.path === 'test/generated_sdk_smoke_test.rb');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain("params = { 'page' => 1 }");
    expect(smokeTestFile!.content).toContain("assert_equal '1', captured[:query]['page']");
  });
});
