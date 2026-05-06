import { describe, expect, it } from 'vitest';

import type { ApiSpec, GeneratorConfig } from '../../framework/types.js';
import { getGenerator } from '../../index.js';

const rustConfig: GeneratorConfig = {
  name: 'SdkworkAppSdk',
  version: '1.0.0',
  language: 'rust' as any,
  sdkType: 'app',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/app/v3/api',
  packageName: 'sdkwork-app-sdk',
};

const rustSpec: ApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Rust SDK Regression',
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

const rustComposedReferenceSpec: ApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Rust Composed Reference Regression',
    version: '1.0.0',
  },
  paths: {
    '/app/v3/api/profile': {
      get: {
        summary: 'Get profile',
        operationId: 'getProfile',
        tags: ['Profile'],
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
  },
  components: {
    schemas: {
      UserProfile: {
        type: 'object',
        properties: {
          address: {
            oneOf: [
              {
                $ref: '#/components/schemas/DomesticAddress',
              },
              {
                $ref: '#/components/schemas/InternationalAddress',
              },
            ],
          },
        },
      },
      DomesticAddress: {
        type: 'object',
        properties: {
          state: {
            type: 'string',
          },
        },
      },
      InternationalAddress: {
        type: 'object',
        properties: {
          country: {
            type: 'string',
          },
        },
      },
    },
  },
};

describe('Rust generator', () => {
  it('emits rust smoke tests and aligns README quick start when generateTests is enabled', async () => {
    const generator = getGenerator('rust' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({ ...rustConfig, generateTests: true }, rustSpec);
    const cargoFile = result.files.find((file) => file.path === 'Cargo.toml');
    const smokeTestFile = result.files.find((file) => file.path === 'tests/generated_sdk_smoke.rs');
    const readme = result.files.find((file) => file.path === 'README.md');

    expect(result.errors).toEqual([]);
    expect(cargoFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(readme).toBeDefined();

    expect(cargoFile!.content).toContain('tokio = { version = "1.0", features = ["macros", "rt-multi-thread"] }');
    expect(smokeTestFile!.content).toContain('use sdkwork_app_sdk::{SdkworkAppClient, SdkworkConfig};');
    expect(smokeTestFile!.content).toContain('#[tokio::test]');
    expect(smokeTestFile!.content).toContain('let result = client.user().get_user_profile().await?;');
    expect(smokeTestFile!.content).toContain('assert_eq!(captured.path, "/app/v3/api/user/profile");');
    expect(smokeTestFile!.content).toContain('assert!(result.data.is_some());');
    expect(smokeTestFile!.content).toContain('assert_eq!(result.code.as_deref(), Some("ok"));');

    expect(readme!.content).toContain('let result = client.user().get_user_profile().await?;');
  });

  it('imports only rust model references that are used in generated fields', async () => {
    const generator = getGenerator('rust' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(rustConfig, rustComposedReferenceSpec);
    const profileFile = result.files.find((file) => file.path === 'src/models/user_profile.rs');

    expect(result.errors).toEqual([]);
    expect(profileFile).toBeDefined();
    expect(profileFile!.content).toContain('use crate::models::{DomesticAddress};');
    expect(profileFile!.content).not.toContain('InternationalAddress');
    expect(profileFile!.content).toContain('pub address: Option<DomesticAddress>,');
  });
});
