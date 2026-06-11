import { describe, expect, it } from 'vitest';

import type { ApiSpec, GeneratorConfig } from '../../framework/types.js';
import { getGenerator } from '../../index.js';
import { discriminatedContentSpec } from '../../../test-support/discriminated-content-spec.js';

const javaConfig: GeneratorConfig = {
  name: 'SdkworkAppSdk',
  version: '1.0.0',
  language: 'java' as any,
  sdkType: 'app',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/app/v3/api',
  packageName: 'sdkwork-notes-app-sdk',
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

const javaExplicitQuerySpec: ApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Java Explicit Query Regression',
    version: '1.0.0',
  },
  paths: {
    '/app/v3/api/finance/usage_statements': {
      get: {
        summary: 'List usage statements',
        operationId: 'usageStatements.list',
        tags: ['Finance'],
        parameters: [
          {
            name: 'filter',
            in: 'query',
            required: false,
            style: 'deepObject',
            explode: true,
            schema: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
        ],
        responses: {
          '204': {
            description: 'No content',
          },
        },
      },
    },
  },
  components: { schemas: {} },
};

const javaQueryHeaderCollisionSpec: ApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Java Query Header Collision Regression',
    version: '1.0.0',
  },
  paths: {
    '/app/v3/api/chat/stop': {
      post: {
        summary: 'Stop chat',
        operationId: 'chat.stop',
        tags: ['Chat'],
        parameters: [
          {
            name: 'conversation_id',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'conversationId',
            in: 'header',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '204': {
            description: 'No content',
          },
        },
      },
    },
  },
  components: { schemas: {} },
};

describe('Java generator regressions', () => {
  it('applies explicit namespace and Maven coordinates consistently', async () => {
    const generator = getGenerator('java' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({
      ...javaConfig,
      namespace: 'com.acme.clients.app',
      packageName: 'com.acme:sdkwork-notes-app-sdk',
    }, javaSpec);

    const pomFile = result.files.find((file) => file.path === 'pom.xml');
    const apiFile = result.files.find((file) => file.path === 'src/main/java/com/acme/clients/app/api/UserApi.java');
    const clientFile = result.files.find((file) => file.path === 'src/main/java/com/acme/clients/app/SdkworkAppClient.java');
    const httpFile = result.files.find((file) => file.path === 'src/main/java/com/acme/clients/app/http/HttpClient.java');
    const readmeFile = result.files.find((file) => file.path === 'README.md');

    expect(result.errors).toEqual([]);

    expect(pomFile).toBeDefined();
    expect(pomFile!.content).toContain('<groupId>com.acme</groupId>');
    expect(pomFile!.content).toContain('<artifactId>sdkwork-notes-app-sdk</artifactId>');
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
    expect(readmeFile!.content).toContain('<artifactId>sdkwork-notes-app-sdk</artifactId>');
    expect(readmeFile!.content).toContain("implementation 'com.acme:sdkwork-notes-app-sdk:1.0.0'");
    expect(readmeFile!.content).toContain('import com.acme.clients.app.SdkworkAppClient;');
  });

  it('converts typed Java responses through Jackson TypeReference helpers instead of raw casts', async () => {
    const generator = getGenerator('java' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(javaConfig, typedResponseSpec);
    const apiFile = result.files.find((file) => file.path === 'src/main/java/com/sdkwork/notes/app/api/UserApi.java');
    const httpFile = result.files.find((file) => file.path === 'src/main/java/com/sdkwork/notes/app/http/HttpClient.java');

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
      (file) => file.path === 'src/test/java/com/sdkwork/notes/app/GeneratedSdkSmokeTest.java'
    );

    expect(result.errors).toEqual([]);
    expect(pomFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();
    expect(pomFile!.content).toContain('<artifactId>junit-jupiter</artifactId>');
    expect(pomFile!.content).toContain('<artifactId>maven-surefire-plugin</artifactId>');
    expect(smokeTestFile!.content).toContain('package com.sdkwork.notes.app;');
    expect(smokeTestFile!.content).toContain('import org.junit.jupiter.api.Test;');
    expect(smokeTestFile!.content).toContain('SdkworkAppClient client = new SdkworkAppClient(config);');
    expect(smokeTestFile!.content).toContain('UserProfile result = client.getUser().getUserProfile();');
    expect(smokeTestFile!.content).toContain('assertEquals("1", result.getId());');
  });

  it('targets Java 21 because generated runtime helpers use modern Java language features', async () => {
    const generator = getGenerator('java' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(javaConfig, typedResponseSpec);
    const pomFile = result.files.find((file) => file.path === 'pom.xml');

    expect(result.errors).toEqual([]);
    expect(pomFile).toBeDefined();
    expect(pomFile!.content).toContain('<maven.compiler.release>21</maven.compiler.release>');
    expect(pomFile!.content).toContain('<release>21</release>');
    expect(pomFile!.content).not.toContain('<maven.compiler.source>11</maven.compiler.source>');
    expect(pomFile!.content).not.toContain('<maven.compiler.target>11</maven.compiler.target>');
    expect(pomFile!.content).not.toContain('<source>11</source>');
    expect(pomFile!.content).not.toContain('<target>11</target>');
  });

  it('uses not-null smoke-test assertions for wrapped Java ref properties', async () => {
    const generator = getGenerator('java' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({ ...javaConfig, generateTests: true }, wrappedTypedResponseSpec);
    const smokeTestFile = result.files.find(
      (file) => file.path === 'src/test/java/com/sdkwork/notes/app/GeneratedSdkSmokeTest.java'
    );

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('PlusApiResultUserProfile result = client.getUser().getWrappedUserProfile();');
    expect(smokeTestFile!.content).toContain('assertNotNull(result.getData());');
    expect(smokeTestFile!.content).toContain('assertEquals("ok", result.getCode());');
    expect(smokeTestFile!.content).not.toContain('assertEquals("data", result.getData());');
  });

  it('emits urlEncode with query serialization helpers even without headers', async () => {
    const generator = getGenerator('java' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(javaConfig, javaExplicitQuerySpec);
    const apiFile = result.files.find((file) => file.path === 'src/main/java/com/sdkwork/notes/app/api/FinanceApi.java');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('private static String buildQueryString(List<QueryParameterSpec> parameters)');
    expect(apiFile!.content).toContain('private static String encodeQueryValue(String value, boolean allowReserved)');
    expect(apiFile!.content).toContain('private static String urlEncode(String value)');
    expect(apiFile!.content).toContain('return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8);');
  });

  it('keeps Java query and header parameter names unique after camel-case normalization', async () => {
    const generator = getGenerator('java' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(javaConfig, javaQueryHeaderCollisionSpec);
    const apiFile = result.files.find((file) => file.path === 'src/main/java/com/sdkwork/notes/app/api/ChatApi.java');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('public Void stop(String conversationId, String conversationId_) throws Exception');
    expect(apiFile!.content).toContain('new QueryParameterSpec("conversation_id", conversationId, "form", true, false, null)');
    expect(apiFile!.content).toContain('"conversationId", new HeaderParameterSpec(conversationId_, "simple", false, null)');
    expect(apiFile!.content).not.toContain('public Void stop(String conversationId, String conversationId) throws Exception');
  });

  it('does not emit trailing whitespace in generated Java source files', async () => {
    const generator = getGenerator('java' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(javaConfig, typedResponseSpec);

    expect(result.errors).toEqual([]);
    for (const file of result.files.filter((entry) => entry.path.endsWith('.java'))) {
      expect(file.content, file.path).not.toMatch(/[ \t]+$/m);
    }
  });

  it('generates oneOf content parts as Jackson polymorphic models instead of one wide DTO', async () => {
    const generator = getGenerator('java' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(javaConfig, discriminatedContentSpec);
    const contentPartFile = result.files.find(
      (file) => file.path === 'src/main/java/com/sdkwork/notes/app/model/ContentPart.java'
    );
    const mediaContentPartFile = result.files.find(
      (file) => file.path === 'src/main/java/com/sdkwork/notes/app/model/MediaContentPart.java'
    );

    expect(result.errors).toEqual([]);
    expect(contentPartFile).toBeDefined();
    expect(mediaContentPartFile).toBeDefined();
    expect(contentPartFile!.content).toContain('import com.fasterxml.jackson.annotation.JsonSubTypes;');
    expect(contentPartFile!.content).toContain('import com.fasterxml.jackson.annotation.JsonTypeInfo;');
    expect(contentPartFile!.content).toContain('@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.EXISTING_PROPERTY, property = "kind", visible = true)');
    expect(contentPartFile!.content).toContain('@JsonSubTypes.Type(value = MediaContentPart.class, name = "media")');
    expect(contentPartFile!.content).toContain('public abstract class ContentPart');
    expect(contentPartFile!.content).not.toContain('private DriveReference drive;');
    expect(mediaContentPartFile!.content).toContain('public class MediaContentPart extends ContentPart');
    expect(mediaContentPartFile!.content).toContain('private DriveReference drive;');
    expect(mediaContentPartFile!.content).toContain('private MediaResource resource;');
  });
});
