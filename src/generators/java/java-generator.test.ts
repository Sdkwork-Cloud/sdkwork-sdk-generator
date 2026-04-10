import { describe, expect, it } from 'vitest';

import type { ApiSpec, GeneratorConfig } from '../../framework/types.js';
import { getGenerator } from '../../index.js';

const javaConfig: GeneratorConfig = {
  name: 'SdkworkAppSdk',
  version: '1.0.0',
  language: 'java' as any,
  sdkType: 'app',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/app/v3/api',
};

const javaSpec: ApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Java SDK Regression',
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
                  type: 'object',
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

const typedResponseSpec: ApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Java Typed Response Regression',
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
    '/app/v3/api/user/list': {
      get: {
        summary: 'List users',
        operationId: 'listUsers',
        tags: ['User'],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/UserProfilePage',
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
      UserProfilePage: {
        type: 'object',
        properties: {
          content: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/UserProfile',
            },
          },
        },
      },
    },
  },
};

const wrappedTypedResponseSpec: ApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Java Wrapped Typed Response Regression',
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

describe('Java generator regressions', () => {
  it('applies explicit namespace and Maven coordinates consistently', async () => {
    const generator = getGenerator('java' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({
      ...javaConfig,
      namespace: 'com.acme.clients.app',
      packageName: 'com.acme:sdkwork-app-sdk',
    }, javaSpec);

    const pomFile = result.files.find((file) => file.path === 'pom.xml');
    const apiFile = result.files.find((file) => file.path === 'src/main/java/com/acme/clients/app/api/UserApi.java');
    const clientFile = result.files.find((file) => file.path === 'src/main/java/com/acme/clients/app/SdkworkAppClient.java');
    const httpFile = result.files.find((file) => file.path === 'src/main/java/com/acme/clients/app/http/HttpClient.java');
    const readmeFile = result.files.find((file) => file.path === 'README.md');

    expect(result.errors).toEqual([]);

    expect(pomFile).toBeDefined();
    expect(pomFile!.content).toContain('<groupId>com.acme</groupId>');
    expect(pomFile!.content).toContain('<artifactId>sdkwork-app-sdk</artifactId>');
    expect(pomFile!.content).toContain('<version>1.0.0</version>');

    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('package com.acme.clients.app.api;');
    expect(apiFile!.content).toContain('import com.acme.clients.app.http.HttpClient;');

    expect(clientFile).toBeDefined();
    expect(clientFile!.content).toContain('package com.acme.clients.app;');
    expect(clientFile!.content).toContain('import com.acme.clients.app.api.UserApi;');
    expect(clientFile!.content).toContain('import com.acme.clients.app.http.HttpClient;');

    expect(httpFile).toBeDefined();
    expect(httpFile!.content).toContain('package com.acme.clients.app.http;');

    expect(readmeFile).toBeDefined();
    expect(readmeFile!.content).toContain('<groupId>com.acme</groupId>');
    expect(readmeFile!.content).toContain('<artifactId>sdkwork-app-sdk</artifactId>');
    expect(readmeFile!.content).toContain("implementation 'com.acme:sdkwork-app-sdk:1.0.0'");
    expect(readmeFile!.content).toContain('import com.acme.clients.app.SdkworkAppClient;');
  });

  it('converts typed Java responses through Jackson TypeReference helpers instead of raw casts', async () => {
    const generator = getGenerator('java' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(javaConfig, typedResponseSpec);
    const apiFile = result.files.find((file) => file.path === 'src/main/java/com/sdkwork/app/api/UserApi.java');
    const httpFile = result.files.find((file) => file.path === 'src/main/java/com/sdkwork/app/http/HttpClient.java');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(httpFile).toBeDefined();

    expect(apiFile!.content).toContain('import com.fasterxml.jackson.core.type.TypeReference;');
    expect(apiFile!.content).toContain('return client.convertValue(');
    expect(apiFile!.content).toContain('new TypeReference<UserProfile>() {}');
    expect(apiFile!.content).toContain('new TypeReference<UserProfilePage>() {}');
    expect(apiFile!.content).not.toContain('return (UserProfile) client.get(');
    expect(apiFile!.content).not.toContain('return (UserProfilePage) client.get(');

    expect(httpFile!.content).toContain('import com.fasterxml.jackson.core.type.TypeReference;');
    expect(httpFile!.content).toContain('public <T> T convertValue(Object value, TypeReference<T> typeReference)');
    expect(httpFile!.content).toContain('return mapper.convertValue(value, typeReference);');
  });

  it('emits Java smoke tests and Maven test support when generateTests is enabled', async () => {
    const generator = getGenerator('java' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({ ...javaConfig, generateTests: true }, typedResponseSpec);
    const pomFile = result.files.find((file) => file.path === 'pom.xml');
    const smokeTestFile = result.files.find(
      (file) => file.path === 'src/test/java/com/sdkwork/app/GeneratedSdkSmokeTest.java'
    );

    expect(result.errors).toEqual([]);
    expect(pomFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(pomFile!.content).toContain('<artifactId>junit-jupiter</artifactId>');
    expect(pomFile!.content).toContain('<artifactId>maven-surefire-plugin</artifactId>');
    expect(smokeTestFile!.content).toContain('package com.sdkwork.app;');
    expect(smokeTestFile!.content).toContain('import org.junit.jupiter.api.Test;');
    expect(smokeTestFile!.content).toContain('SdkworkAppClient client = new SdkworkAppClient(config);');
    expect(smokeTestFile!.content).toContain('UserProfile result = client.getUser().getUserProfile();');
    expect(smokeTestFile!.content).toContain('assertEquals("1", result.getId());');
  });

  it('uses not-null smoke-test assertions for wrapped Java ref properties', async () => {
    const generator = getGenerator('java' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({ ...javaConfig, generateTests: true }, wrappedTypedResponseSpec);
    const smokeTestFile = result.files.find(
      (file) => file.path === 'src/test/java/com/sdkwork/app/GeneratedSdkSmokeTest.java'
    );

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('PlusApiResultUserProfile result = client.getUser().getWrappedUserProfile();');
    expect(smokeTestFile!.content).toContain('assertNotNull(result.getData());');
    expect(smokeTestFile!.content).toContain('assertEquals("ok", result.getCode());');
    expect(smokeTestFile!.content).not.toContain('assertEquals("data", result.getData());');
  });
});
