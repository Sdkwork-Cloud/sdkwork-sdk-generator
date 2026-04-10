import { describe, expect, it } from 'vitest';

import type { ApiSpec, GeneratorConfig } from '../../framework/types.js';
import { getGenerator } from '../../index.js';

const phpConfig: GeneratorConfig = {
  name: 'SdkworkAppSdk',
  version: '1.0.0',
  language: 'php' as any,
  sdkType: 'app',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/app/v3/api',
  packageName: 'sdkwork/app-sdk',
};

const phpSpec: ApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'PHP SDK Regression',
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

describe('PHP generator', () => {
  it('emits php smoke tests and aligns README quick start when generateTests is enabled', async () => {
    const generator = getGenerator('php' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({ ...phpConfig, generateTests: true }, phpSpec);
    const composerFile = result.files.find((file) => file.path === 'composer.json');
    const smokeTestFile = result.files.find((file) => file.path === 'tests/GeneratedSdkSmokeTest.php');
    const readme = result.files.find((file) => file.path === 'README.md');

    expect(result.errors).toEqual([]);
    expect(composerFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(readme).toBeDefined();

    expect(composerFile!.content).toContain('"phpunit/phpunit": "^11.0"');
    expect(smokeTestFile!.content).toContain('use SDKWork\\App\\SdkworkAppClient;');
    expect(smokeTestFile!.content).toContain('use PHPUnit\\Framework\\TestCase;');
    expect(smokeTestFile!.content).toContain('$result = $client->user->getUserProfile();');
    expect(smokeTestFile!.content).toContain("self::assertSame('/app/v3/api/user/profile', \$request->getUri()->getPath());");
    expect(smokeTestFile!.content).toContain("self::assertNotNull(\$result?->data);");
    expect(smokeTestFile!.content).toContain("self::assertSame('ok', \$result?->code);");

    expect(readme!.content).toContain('$result = $client->user->getUserProfile();');
  });
});
