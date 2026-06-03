import { describe, expect, it } from 'vitest';

import type { ApiSpec, GeneratorConfig } from '../../framework/types.js';
import { getGenerator } from '../../index.js';
import { discriminatedContentSpec } from '../../../test-support/discriminated-content-spec.js';

const csharpConfig: GeneratorConfig = {
  name: 'SdkworkAppSdk',
  version: '1.0.0',
  language: 'csharp' as any,
  sdkType: 'app',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/app/v3/api',
};

const csharpSpec: ApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'CSharp SDK Regression',
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
    '/app/v3/api/auth/session': {
      get: {
        summary: 'Get auth session',
        operationId: 'getAuthSession',
        tags: ['Auth'],
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
    title: 'CSharp Typed Response Regression',
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
  },
  components: {
    schemas: {
      UserProfile: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    },
  },
};

const wrappedTypedResponseSpec: ApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'CSharp Wrapped Typed Response Regression',
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

const conflictingModelNameSpec: ApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'CSharp Model Name Conflict Regression',
    version: '1.0.0',
  },
  paths: {
    '/app/v3/api/files': {
      post: {
        summary: 'Upload file',
        operationId: 'uploadFile',
        tags: ['Files'],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                $ref: '#/components/schemas/UploadFileRequest',
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
                  $ref: '#/components/schemas/FileInfo',
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
      FileInfo: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      UploadFileRequest: {
        type: 'object',
        properties: {
          file: { type: 'string', format: 'binary' },
        },
      },
    },
  },
};

describe('CSharp generator regressions', () => {
  it('prefers a local common project when generated inside the repository', async () => {
    const generator = getGenerator('csharp' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(csharpConfig, csharpSpec);
    const projectFile = result.files.find((file) => file.path === 'App.csproj');
    const apiFile = result.files.find((file) => file.path === 'Api/UserApi.cs');
    const clientFile = result.files.find((file) => file.path === 'SdkworkAppClient.cs');
    const httpFile = result.files.find((file) => file.path === 'Http/HttpClient.cs');
    const apiIndexFile = result.files.find((file) => file.path === 'Api/Api.cs');

    expect(result.errors).toEqual([]);
    expect(projectFile).toBeDefined();
    expect(apiFile).toBeDefined();
    expect(clientFile).toBeDefined();
    expect(projectFile!.content).toContain('<ProjectReference Include="');
    expect(projectFile!.content).toContain('SDKwork.Common.csproj');
    expect(projectFile!.content).toContain('Condition="Exists(');
    expect(projectFile!.content).toContain('Condition="!Exists(');
    expect(projectFile!.content).toContain('<PackageReference Include="SDKwork.Common" Version="1.0.0" />');
    expect(apiFile!.content).toContain('using SdkHttpClient = App.Http.HttpClient;');
    expect(apiFile!.content).toContain('private readonly SdkHttpClient _client;');
    expect(apiFile!.content).toContain('public UserApi(SdkHttpClient client)');
    expect(clientFile!.content).toContain('using SdkHttpClient = App.Http.HttpClient;');
    expect(clientFile!.content).toContain('private readonly SdkHttpClient _httpClient;');
    expect(clientFile!.content).toContain('_httpClient = new SdkHttpClient(baseUrl);');
    expect(clientFile!.content.split('using App.Api;').length - 1).toBe(1);
    expect(httpFile).toBeDefined();
    expect(apiIndexFile).toBeDefined();
    expect(httpFile!.content).toContain('private HttpRequestMessage BuildRequest(');
    expect(httpFile!.content).toContain('private static readonly bool ApiKeyUseBearer = true;');
    expect(httpFile!.content).not.toContain('private const bool ApiKeyUseBearer = true;');
    expect(httpFile!.content).toContain('System.Net.Http.HttpMethod method,');
    expect(httpFile!.content).toContain('Dictionary<string, object>? parameters = null');
    expect(httpFile!.content).toContain('Dictionary<string, string>? requestHeaders = null');
    expect(httpFile!.content).toContain('HttpContent? content = null)');
    expect(httpFile!.content).toContain('private static HttpContent? CreateContent(object? body, string? contentType = null)');
    expect(httpFile!.content).toContain('private static async Task<T?> ReadResponseAsync<T>(HttpResponseMessage response)');
    expect(httpFile!.content).toContain('public async Task<T?> GetAsync<T>(');
    expect(httpFile!.content).toContain('BuildRequest(System.Net.Http.HttpMethod.Get, path, parameters, requestHeaders)');
    expect(apiIndexFile!.content).toContain('public static UserApi? User { get; set; }');
    expect(apiIndexFile!.content).toContain('public static AuthApi? Auth { get; set; }');
  });

  it('applies explicit namespace and package id overrides consistently', async () => {
    const generator = getGenerator('csharp' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({
      ...csharpConfig,
      namespace: 'Acme.App.Client',
      packageName: 'Acme.App.Sdk',
    }, csharpSpec);

    const projectFile = result.files.find((file) => file.path === 'Acme.App.Sdk.csproj');
    const apiFile = result.files.find((file) => file.path === 'Api/UserApi.cs');
    const clientFile = result.files.find((file) => file.path === 'SdkworkAppClient.cs');
    const httpFile = result.files.find((file) => file.path === 'Http/HttpClient.cs');
    const readmeFile = result.files.find((file) => file.path === 'README.md');

    expect(projectFile).toBeDefined();
    expect(projectFile!.content).toContain('<RootNamespace>Acme.App.Client</RootNamespace>');
    expect(projectFile!.content).toContain('<AssemblyName>Acme.App.Client</AssemblyName>');
    expect(projectFile!.content).toContain('<PackageId>Acme.App.Sdk</PackageId>');

    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('using SdkHttpClient = Acme.App.Client.Http.HttpClient;');
    expect(apiFile!.content).toContain('namespace Acme.App.Client.Api');

    expect(clientFile).toBeDefined();
    expect(clientFile!.content).toContain('using SdkHttpClient = Acme.App.Client.Http.HttpClient;');
    expect(clientFile!.content).toContain('using Acme.App.Client.Api;');
    expect(clientFile!.content).toContain('namespace Acme.App.Client');

    expect(httpFile).toBeDefined();
    expect(httpFile!.content).toContain('namespace Acme.App.Client.Http');

    expect(readmeFile).toBeDefined();
    expect(readmeFile!.content).toContain('dotnet add package Acme.App.Sdk');
    expect(readmeFile!.content).toContain('<PackageReference Include="Acme.App.Sdk" Version="1.0.0" />');
    expect(readmeFile!.content).toContain('using Acme.App.Client;');
  });

  it('emits C# smoke tests and xUnit test-project support when generateTests is enabled', async () => {
    const generator = getGenerator('csharp' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({ ...csharpConfig, generateTests: true }, typedResponseSpec);
    const projectFile = result.files.find((file) => file.path === 'App.csproj');
    const testProjectFile = result.files.find((file) => file.path === 'Tests/App.Tests.csproj');
    const smokeTestFile = result.files.find((file) => file.path === 'Tests/GeneratedSdkSmokeTests.cs');

    expect(result.errors).toEqual([]);
    expect(projectFile).toBeDefined();
    expect(testProjectFile).toBeDefined();
    expect(smokeTestFile).toBeDefined();

    expect(projectFile!.content).toContain('<Compile Remove="Tests/**/*.cs" />');
    expect(projectFile!.content).toContain('<None Include="Tests/**/*.cs" />');
    expect(testProjectFile!.content).toContain('<ProjectReference Include="../App.csproj" />');
    expect(testProjectFile!.content).toContain('<PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.10.0" />');
    expect(testProjectFile!.content).toContain('<PackageReference Include="xunit" Version="2.9.0" />');
    expect(testProjectFile!.content).toContain('<PackageReference Include="xunit.runner.visualstudio" Version="2.8.2">');

    expect(smokeTestFile!.content).toContain('using Xunit;');
    expect(smokeTestFile!.content).toContain('using App;');
    expect(smokeTestFile!.content).toContain('using App.Models;');
    expect(smokeTestFile!.content).toContain('var client = new SdkworkAppClient(config);');
    expect(smokeTestFile!.content).toContain('var result = await client.User.GetUserProfileAsync();');
    expect(smokeTestFile!.content).toContain('Assert.Equal("1", result!.Id);');
  });

  it('asserts wrapped C# `$ref` response properties as non-null in generated smoke tests', async () => {
    const generator = getGenerator('csharp' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate({ ...csharpConfig, generateTests: true }, wrappedTypedResponseSpec);
    const smokeTestFile = result.files.find((file) => file.path === 'Tests/GeneratedSdkSmokeTests.cs');

    expect(result.errors).toEqual([]);
    expect(smokeTestFile).toBeDefined();
    expect(smokeTestFile!.content).toContain('var result = await client.User.GetWrappedUserProfileAsync();');
    expect(smokeTestFile!.content).toContain('Assert.NotNull(result!.Data);');
    expect(smokeTestFile!.content).toContain('Assert.Equal("ok", result!.Code);');
  });

  it('qualifies model types in API methods to avoid framework type name conflicts', async () => {
    const generator = getGenerator('csharp' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(csharpConfig, conflictingModelNameSpec);
    const apiFile = result.files.find((file) => file.path === 'Api/FileApi.cs');

    expect(result.errors).toEqual([]);
    expect(apiFile).toBeDefined();
    expect(apiFile!.content).toContain('public async Task<App.Models.FileInfo?> UploadAsync(App.Models.UploadFileRequest body)');
    expect(apiFile!.content).toContain('_client.PostAsync<App.Models.FileInfo>(');
    expect(apiFile!.content).not.toContain('public async Task<FileInfo?> UploadAsync(UploadFileRequest body)');
  });

  it('generates oneOf content parts as System.Text.Json polymorphic models instead of one wide DTO', async () => {
    const generator = getGenerator('csharp' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(csharpConfig, discriminatedContentSpec);
    const contentPartFile = result.files.find((file) => file.path === 'Models/ContentPart.cs');
    const mediaContentPartFile = result.files.find((file) => file.path === 'Models/MediaContentPart.cs');

    expect(result.errors).toEqual([]);
    expect(contentPartFile).toBeDefined();
    expect(mediaContentPartFile).toBeDefined();
    expect(contentPartFile!.content).toContain('[JsonPolymorphic(TypeDiscriminatorPropertyName = "kind")]');
    expect(contentPartFile!.content).toContain('[JsonDerivedType(typeof(MediaContentPart), "media")]');
    expect(contentPartFile!.content).toContain('public abstract class ContentPart');
    expect(contentPartFile!.content).not.toContain('public DriveReference? Drive');
    expect(mediaContentPartFile!.content).toContain('public class MediaContentPart : ContentPart');
    expect(mediaContentPartFile!.content).toContain('public DriveReference Drive { get; set; }');
    expect(mediaContentPartFile!.content).toContain('public MediaResource Resource { get; set; }');
    expect(mediaContentPartFile!.content).not.toContain('public DriveReference? Drive');
    expect(mediaContentPartFile!.content).not.toContain('public MediaResource? Resource');
  });
});
