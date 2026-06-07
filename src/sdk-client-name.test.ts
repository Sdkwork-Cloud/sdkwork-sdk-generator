import { describe, expect, it } from 'vitest';
import { TypeScriptGenerator } from './generators/typescript/index.js';
import { FlutterGenerator } from './generators/flutter/index.js';
import { RustGenerator } from './generators/rust/index.js';
import { JavaGenerator } from './generators/java/index.js';
import { CSharpGenerator } from './generators/csharp/index.js';
import { SwiftGenerator } from './generators/swift/index.js';
import { KotlinGenerator } from './generators/kotlin/index.js';
import { GoGenerator } from './generators/go/index.js';
import { PythonGenerator } from './generators/python/index.js';
import type { ApiSpec, GeneratorConfig } from './framework/types.js';

const spec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Client Name API', version: '1.0.0' },
  paths: {
    '/messages': {
      get: {
        operationId: 'listMessages',
        tags: ['Message'],
        responses: {
          '200': {
            description: 'OK',
          },
        },
      },
    },
  },
  components: {
    schemas: {},
  },
};

const baseConfig: GeneratorConfig = {
  name: 'ClientNameSDK',
  version: '1.0.0',
  language: 'typescript',
  sdkType: 'app',
  outputPath: './test-output',
  apiSpecPath: './openapi.yaml',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/app/v3/api',
  clientName: 'SdkworkImAppClient',
  legacyClientName: 'SdkworkAppClient',
};

describe('SDK client naming', () => {
  it('generates TypeScript primary client exports with a legacy alias', async () => {
    const result = await new TypeScriptGenerator().generate(baseConfig, spec);
    const sdkFile = result.files.find((file) => file.path === 'src/sdk.ts');
    const indexFile = result.files.find((file) => file.path === 'src/index.ts');

    expect(result.errors).toEqual([]);
    expect(sdkFile?.content).toContain('export class SdkworkImAppClient');
    expect(sdkFile?.content).toContain('export function createClient(config: SdkworkAppConfig): SdkworkImAppClient');
    expect(sdkFile?.content).toContain('export { SdkworkImAppClient as SdkworkAppClient };');
    expect(sdkFile?.content).not.toContain('export class SdkworkAppClient');
    expect(indexFile?.content).toContain(
      "export { SdkworkImAppClient, SdkworkAppClient, createClient } from './sdk';",
    );
  });

  it('generates Flutter primary clients with a legacy typedef alias', async () => {
    const result = await new FlutterGenerator().generate({ ...baseConfig, language: 'flutter' }, spec);
    const clientFile = result.files.find((file) => file.path === 'lib/app_client.dart');

    expect(result.errors).toEqual([]);
    expect(clientFile?.content).toContain('class SdkworkImAppClient');
    expect(clientFile?.content).toContain('typedef SdkworkAppClient = SdkworkImAppClient;');
    expect(clientFile?.content).not.toContain('class SdkworkAppClient');
  });

  it('generates Rust primary clients with a legacy type alias', async () => {
    const result = await new RustGenerator().generate({ ...baseConfig, language: 'rust' }, spec);
    const clientFile = result.files.find((file) => file.path === 'src/client.rs');
    const libFile = result.files.find((file) => file.path === 'src/lib.rs');

    expect(result.errors).toEqual([]);
    expect(clientFile?.content).toContain('pub struct SdkworkImAppClient');
    expect(clientFile?.content).toContain('pub type SdkworkAppClient = SdkworkImAppClient;');
    expect(clientFile?.content).not.toContain('pub struct SdkworkAppClient');
    expect(libFile?.content).toContain('pub use client::{SdkworkImAppClient, SdkworkAppClient};');
  });

  it('generates JVM and C# primary clients with legacy compatibility classes', async () => {
    const java = await new JavaGenerator().generate(
      { ...baseConfig, language: 'java', packageName: 'com.sdkwork:im-app-api-generated' },
      spec,
    );
    const javaPrimaryFile = java.files.find((file) => file.path.endsWith('/SdkworkImAppClient.java'));
    const javaLegacyFile = java.files.find((file) => file.path.endsWith('/SdkworkAppClient.java'));

    const kotlin = await new KotlinGenerator().generate(
      { ...baseConfig, language: 'kotlin', packageName: 'com.sdkwork:im-app-api-generated' },
      spec,
    );
    const kotlinPrimaryFile = kotlin.files.find((file) => file.path.endsWith('/SdkworkImAppClient.kt'));
    const kotlinLegacyFile = kotlin.files.find((file) => file.path.endsWith('/SdkworkAppClient.kt'));

    const csharp = await new CSharpGenerator().generate(
      { ...baseConfig, language: 'csharp', packageName: 'Sdkwork.Im.AppApi.Generated', namespace: 'Sdkwork.Im.AppApi.Generated' },
      spec,
    );
    const csharpPrimaryFile = csharp.files.find((file) => file.path === 'SdkworkImAppClient.cs');
    const csharpLegacyFile = csharp.files.find((file) => file.path === 'SdkworkAppClient.cs');

    expect(java.errors).toEqual([]);
    expect(javaPrimaryFile?.content).toContain('public class SdkworkImAppClient');
    expect(javaLegacyFile?.content).toContain('public class SdkworkAppClient extends SdkworkImAppClient');
    expect(javaLegacyFile?.content).not.toContain('private final HttpClient httpClient');

    expect(kotlin.errors).toEqual([]);
    expect(kotlinPrimaryFile?.content).toContain('class SdkworkImAppClient');
    expect(kotlinLegacyFile?.content).toContain('class SdkworkAppClient : SdkworkImAppClient');
    expect(kotlinPrimaryFile?.content).toContain('open class SdkworkImAppClient');

    expect(csharp.errors).toEqual([]);
    expect(csharpPrimaryFile?.content).toContain('public class SdkworkImAppClient');
    expect(csharpLegacyFile?.content).toContain('public class SdkworkAppClient : SdkworkImAppClient');
    expect(csharpLegacyFile?.content).not.toContain('private readonly SdkHttpClient _httpClient');
  });

  it('generates Swift, Go, and Python primary clients with legacy aliases', async () => {
    const swift = await new SwiftGenerator().generate(
      { ...baseConfig, language: 'swift', packageName: 'ImAppApiGenerated' },
      spec,
    );
    const swiftClientFile = swift.files.find((file) => file.path === 'Sources/SdkworkImAppClient.swift');

    const go = await new GoGenerator().generate(
      { ...baseConfig, language: 'go', packageName: 'github.com/sdkwork/im-app-api-generated' },
      spec,
    );
    const goClientFile = go.files.find((file) => file.path === 'sdk.go');

    const python = await new PythonGenerator().generate(
      { ...baseConfig, language: 'python', packageName: 'sdkwork-im-app-api-generated' },
      spec,
    );
    const pythonClientFile = python.files.find((file) => file.path === 'sdkwork_im_app_api_generated/client.py');
    const pythonInitFile = python.files.find((file) => file.path === 'sdkwork_im_app_api_generated/__init__.py');

    expect(swift.errors).toEqual([]);
    expect(swiftClientFile?.content).toContain('public class SdkworkImAppClient');
    expect(swiftClientFile?.content).toContain('public typealias SdkworkAppClient = SdkworkImAppClient');

    expect(go.errors).toEqual([]);
    expect(goClientFile?.content).toContain('type SdkworkImAppClient struct');
    expect(goClientFile?.content).toContain('type SdkworkAppClient = SdkworkImAppClient');
    expect(goClientFile?.content).toContain('func NewSdkworkAppClient(baseURL string) *SdkworkAppClient');

    expect(python.errors).toEqual([]);
    expect(pythonClientFile?.content).toContain('class SdkworkImAppClient:');
    expect(pythonClientFile?.content).toContain('SdkworkAppClient = SdkworkImAppClient');
    expect(pythonInitFile?.content).toContain('from .client import SdkworkImAppClient, SdkworkAppClient, create_client');
    expect(pythonInitFile?.content).toContain("'SdkworkAppClient'");
  });
});
