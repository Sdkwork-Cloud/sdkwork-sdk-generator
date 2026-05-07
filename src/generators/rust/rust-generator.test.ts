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

const rustPrefixItemsSpec: ApiSpec = {
  openapi: '3.2.0',
  info: {
    title: 'Rust Prefix Items Regression',
    version: '1.0.0',
  },
  paths: {
    '/app/v3/api/timeline': {
      get: {
        summary: 'Get timeline',
        operationId: 'getTimeline',
        tags: ['Timeline'],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/TimelineEnvelope',
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
      TimelineEvent: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
          },
        },
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

const rustReservedTagSpec: ApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Rust Reserved Tag Regression',
    version: '1.0.0',
  },
  paths: {
    '/const-envelope': {
      get: {
        summary: 'Get const envelope',
        operationId: 'getConstEnvelope',
        tags: ['Const'],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ConstEnvelope',
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
      ConstEnvelope: {
        type: 'object',
        properties: {
          kind: {
            const: 'audit',
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

  it('does not import prefixItems references when rust tuple fields render as JSON values', async () => {
    const generator = getGenerator('rust' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(rustConfig, rustPrefixItemsSpec);
    const envelopeFile = result.files.find((file) => file.path === 'src/models/timeline_envelope.rs');

    expect(result.errors).toEqual([]);
    expect(envelopeFile).toBeDefined();
    expect(envelopeFile!.content).toContain('pub tuple: Option<Vec<serde_json::Value>>,');
    expect(envelopeFile!.content).not.toContain('use crate::models::{TimelineEvent};');
  });

  it('uses a valid HTTP method error type and avoids custom Method imports for standard operations', async () => {
    const generator = getGenerator('rust' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(rustConfig, rustSpec);
    const httpFile = result.files.find((file) => file.path === 'src/http/client.rs');
    const apiFile = result.files.find((file) => file.path === 'src/api/user.rs');
    const cargoFile = result.files.find((file) => file.path === 'Cargo.toml');

    expect(result.errors).toEqual([]);
    expect(httpFile).toBeDefined();
    expect(apiFile).toBeDefined();
    expect(cargoFile).toBeDefined();

    expect(cargoFile!.content).toContain('http = "1.0"');
    expect(httpFile!.content).toContain('InvalidHttpMethod(#[from] http::method::InvalidMethod)');
    expect(httpFile!.content).not.toContain('reqwest::http::method::InvalidMethod');
    expect(apiFile!.content).not.toContain('use reqwest::Method;');
    expect(apiFile!.content).not.toContain('Method::from_bytes');
    expect(apiFile!.content).not.toContain('append_query_string');
  });

  it('sanitizes reserved rust tag names across modules, client getters, docs, and tests', async () => {
    const generator = getGenerator('rust' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({ ...rustConfig, generateTests: true }, rustReservedTagSpec);
    const apiIndex = result.files.find((file) => file.path === 'src/api/mod.rs');
    const clientFile = result.files.find((file) => file.path === 'src/client.rs');
    const readme = result.files.find((file) => file.path === 'README.md');
    const smokeTest = result.files.find((file) => file.path === 'tests/generated_sdk_smoke.rs');

    expect(result.errors).toEqual([]);
    expect(result.files.some((file) => file.path === 'src/api/const.rs')).toBe(false);
    expect(result.files.some((file) => file.path === 'src/api/const_.rs')).toBe(true);
    expect(apiIndex).toBeDefined();
    expect(clientFile).toBeDefined();
    expect(readme).toBeDefined();
    expect(smokeTest).toBeDefined();

    expect(apiIndex!.content).toContain('pub mod const_;');
    expect(apiIndex!.content).toContain('pub use const_::ConstApi;');
    expect(apiIndex!.content).not.toContain('pub mod const;');
    expect(clientFile!.content).toContain('pub fn const_(&self) -> ConstApi');
    expect(clientFile!.content).not.toContain('pub fn const(&self)');
    expect(readme!.content).toContain('client.const_().get_const_envelope().await?;');
    expect(smokeTest!.content).toContain('client.const_().get_const_envelope().await?;');
  });
});
