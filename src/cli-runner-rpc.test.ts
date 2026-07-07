import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runGenerateCommand } from './cli-runner.js';

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeRpcFixture(root: string): { manifestPath: string; protoRoot: string } {
  const protoRoot = join(root, 'proto');
  const protoDir = join(protoRoot, 'sdkwork', 'communication', 'app', 'v3');
  mkdirSync(protoDir, { recursive: true });
  writeFileSync(join(protoDir, 'message_service.proto'), `syntax = "proto3";
package sdkwork.communication.app.v3;
service MessageService {
  rpc CreateMessage(CreateMessageRequest) returns (CreateMessageResponse);
}
message CreateMessageRequest { string text = 1; }
message CreateMessageResponse { string message_id = 1; }
`, 'utf-8');

  const manifestPath = join(root, 'sdkwork-im-rpc.manifest.json');
  writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    kind: 'sdkwork.rpc.manifest',
    domain: 'communication',
    sdkFamily: 'sdkwork-im-rpc-sdk',
    services: [
      {
        package: 'sdkwork.communication.app.v3',
        service: 'MessageService',
        surface: 'app',
        methods: [
          {
            method: 'CreateMessage',
            operationId: 'messages.create',
            auth: 'app-session',
            idempotency: 'required',
            streaming: 'unary',
            owner: 'communication-open-api',
            compatibility: 'v3',
          },
        ],
      },
    ],
  }, null, 2), 'utf-8');

  return { manifestPath, protoRoot };
}

function rewriteRpcFixtureOperationId(manifestPath: string, operationId: string): void {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  manifest.services[0].methods[0].operationId = operationId;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
}

describe('RPC generate command runner', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('routes --protocol rpc to isolated rpc sdk dry-run generation', async () => {
    const workDir = createTempDir('sdkwork-cli-runner-rpc-');
    const outputDir = join(workDir, 'rpc-sdk');
    const fixture = writeRpcFixture(workDir);

    const execution = await runGenerateCommand({
      protocol: 'rpc',
      input: fixture.manifestPath,
      protoRoot: fixture.protoRoot,
      output: outputDir,
      name: 'SdkworkImRpc',
      sdkName: 'sdkwork-im-rpc-sdk',
      language: 'typescript',
      packageName: '@sdkwork/im-rpc-sdk',
      syncPublishedVersion: false,
      dryRun: true,
    });

    expect(execution.config.protocol).toBe('rpc');
    expect(execution.config.rpc?.manifest.sdkFamily).toBe('sdkwork-im-rpc-sdk');
    expect(execution.syncSummary.dryRun).toBe(true);
    expect(execution.syncSummary.changeSummaryPath).toBe('.sdkwork/sdkwork-generator-changes.json');
    expect(execution.result.files.map((file) => file.path)).toEqual(expect.arrayContaining([
      'buf.gen.yaml',
      'README.md',
      'rpc-methods.json',
      'package.json',
      'src/index.ts',
      'src/metadata.ts',
      'src/deadline.ts',
      'src/idempotency.ts',
    ]));
    const methodCatalogFile = execution.result.files.find((file) => file.path === 'rpc-methods.json');
    expect(methodCatalogFile).toBeDefined();
    const methodCatalog = JSON.parse(methodCatalogFile!.content);
    expect(methodCatalog).toMatchObject({
      kind: 'sdkwork.rpc.methodCatalog',
      sdkFamily: 'sdkwork-im-rpc-sdk',
      domain: 'communication',
    });
    expect(methodCatalog.services).toHaveLength(1);
    expect(methodCatalog.methods).toEqual([
      expect.objectContaining({
        methodKey: 'sdkwork.communication.app.v3.MessageService/CreateMessage',
        operationId: 'messages.create',
        idempotency: 'required',
      }),
    ]);
    const packageFile = execution.result.files.find((file) => file.path === 'package.json');
    expect(packageFile).toBeDefined();
    const packageJson = JSON.parse(packageFile!.content);
    expect(packageJson.files).toContain('rpc-methods.json');
    expect(existsSync(outputDir)).toBe(false);
  });

  it('omits persisted generator control-plane files for rpc generation by default', async () => {
    const workDir = createTempDir('sdkwork-cli-runner-rpc-convention-');
    const outputDir = join(workDir, 'sdkwork-im-rpc-sdk-typescript');
    const fixture = writeRpcFixture(workDir);

    const execution = await runGenerateCommand({
      protocol: 'rpc',
      input: fixture.manifestPath,
      protoRoot: fixture.protoRoot,
      output: outputDir,
      name: 'SdkworkImRpc',
      sdkName: 'sdkwork-im-rpc-sdk',
      language: 'typescript',
      packageName: '@sdkwork/im-rpc-sdk',
      syncPublishedVersion: false,
    });

    expect(execution.config.protocol).toBe('rpc');
    expect(execution.syncSummary.controlPlaneEnabled).toBe(false);
    const readme = readFileSync(join(outputDir, 'README.md'), 'utf-8');
    expect(readme).toContain('RPC generation defaults to convention-first source output');
    expect(readme).toContain('does not write persisted generator evidence');
    expect(readme).toContain('`sdkgen inspect --protocol rpc`');
    expect(readme).toContain('`--emit-control-plane`');
    expect(readme).not.toMatch(/\.sdkwork\/sdkwork-generator/u);
    expect(existsSync(join(outputDir, '.sdkwork', 'sdkwork-generator-manifest.json'))).toBe(false);
    expect(existsSync(join(outputDir, '.sdkwork', 'sdkwork-generator-changes.json'))).toBe(false);
    expect(existsSync(join(outputDir, '.sdkwork', 'sdkwork-generator-report.json'))).toBe(false);
  });

  it('refreshes rpc README service catalog when manifest operationIds change', async () => {
    const workDir = createTempDir('sdkwork-cli-runner-rpc-readme-refresh-');
    const outputDir = join(workDir, 'sdkwork-im-rpc-sdk-typescript');
    const fixture = writeRpcFixture(workDir);
    const baseOptions = {
      protocol: 'rpc' as const,
      input: fixture.manifestPath,
      protoRoot: fixture.protoRoot,
      output: outputDir,
      name: 'SdkworkImRpc',
      sdkName: 'sdkwork-im-rpc-sdk',
      language: 'typescript' as const,
      packageName: '@sdkwork/im-rpc-sdk',
      syncPublishedVersion: false,
      fixedSdkVersion: '1.0.5',
    };

    await runGenerateCommand(baseOptions);
    rewriteRpcFixtureOperationId(fixture.manifestPath, 'messages.publish');

    await runGenerateCommand(baseOptions);

    const readme = readFileSync(join(outputDir, 'README.md'), 'utf-8');
    const methodCatalog = JSON.parse(readFileSync(join(outputDir, 'rpc-methods.json'), 'utf-8'));
    expect(readme).toContain('CreateMessage: messages.publish');
    expect(readme).not.toContain('CreateMessage: messages.create');
    expect(methodCatalog.methods).toEqual([
      expect.objectContaining({
        methodKey: 'sdkwork.communication.app.v3.MessageService/CreateMessage',
        operationId: 'messages.publish',
      }),
    ]);
  });

  it('removes prior rpc generator state and does not create manual backups in convention mode', async () => {
    const workDir = createTempDir('sdkwork-cli-runner-rpc-no-state-');
    const outputDir = join(workDir, 'sdkwork-im-rpc-sdk-typescript');
    const fixture = writeRpcFixture(workDir);
    const baseOptions = {
      protocol: 'rpc' as const,
      input: fixture.manifestPath,
      protoRoot: fixture.protoRoot,
      output: outputDir,
      name: 'SdkworkImRpc',
      sdkName: 'sdkwork-im-rpc-sdk',
      language: 'typescript' as const,
      packageName: '@sdkwork/im-rpc-sdk',
      syncPublishedVersion: false,
    };

    await runGenerateCommand({
      ...baseOptions,
      emitControlPlane: true,
    });
    writeFileSync(join(outputDir, 'package.json'), '{"manuallyChanged":true}\n', 'utf-8');

    const execution = await runGenerateCommand(baseOptions);

    expect(execution.syncSummary.controlPlaneEnabled).toBe(false);
    expect(execution.syncSummary.backedUpFiles).toEqual([]);
    expect(existsSync(join(outputDir, '.sdkwork'))).toBe(false);
  });

  it('can emit persisted generator control-plane files for rpc release evidence when requested', async () => {
    const workDir = createTempDir('sdkwork-cli-runner-rpc-control-plane-');
    const outputDir = join(workDir, 'sdkwork-im-rpc-sdk-typescript');
    const fixture = writeRpcFixture(workDir);

    const execution = await runGenerateCommand({
      protocol: 'rpc',
      input: fixture.manifestPath,
      protoRoot: fixture.protoRoot,
      output: outputDir,
      name: 'SdkworkImRpc',
      sdkName: 'sdkwork-im-rpc-sdk',
      language: 'typescript',
      packageName: '@sdkwork/im-rpc-sdk',
      syncPublishedVersion: false,
      emitControlPlane: true,
    });

    expect(execution.syncSummary.controlPlaneEnabled).toBe(true);
    expect(existsSync(join(outputDir, '.sdkwork', 'sdkwork-generator-manifest.json'))).toBe(true);
    expect(existsSync(join(outputDir, '.sdkwork', 'sdkwork-generator-changes.json'))).toBe(true);
    expect(existsSync(join(outputDir, '.sdkwork', 'sdkwork-generator-report.json'))).toBe(true);
  });

  it('requires protoRoot for rpc generation', async () => {
    const workDir = createTempDir('sdkwork-cli-runner-rpc-missing-root-');
    const fixture = writeRpcFixture(workDir);

    await expect(runGenerateCommand({
      protocol: 'rpc',
      input: fixture.manifestPath,
      output: join(workDir, 'rpc-sdk'),
      name: 'SdkworkCommunicationRpc',
      language: 'typescript',
      syncPublishedVersion: false,
      dryRun: true,
    })).rejects.toThrow('RPC generation requires --proto-root');
  });

  it('creates package scaffolds for supported key rpc sdk languages', async () => {
    const workDir = createTempDir('sdkwork-cli-runner-rpc-key-languages-');
    const fixture = writeRpcFixture(workDir);

    const expectations = [
      {
        language: 'typescript' as const,
        packageName: '@sdkwork/im-rpc-sdk',
        expectedFiles: ['package.json', 'src/index.ts'],
        expectedRemotePlugins: ['buf.build/bufbuild/es', 'buf.build/connectrpc/es'],
      },
      {
        language: 'go' as const,
        packageName: 'github.com/sdkwork/im-rpc-sdk-go',
        expectedFiles: ['go.mod', 'sdk.go'],
        expectedRemotePlugins: ['buf.build/protocolbuffers/go', 'buf.build/grpc/go'],
      },
      {
        language: 'java' as const,
        packageName: 'com.sdkwork.im.rpc',
        expectedFiles: ['pom.xml', 'src/main/java/com/sdkwork/im/rpc/SdkworkImRpc.java'],
        expectedRemotePlugins: ['buf.build/protocolbuffers/java', 'buf.build/grpc/java'],
      },
      {
        language: 'python' as const,
        packageName: 'sdkwork_im_rpc_sdk',
        expectedFiles: ['pyproject.toml', 'src/sdkwork_im_rpc_sdk/__init__.py'],
        expectedRemotePlugins: ['buf.build/protocolbuffers/python', 'buf.build/grpc/python'],
      },
      {
        language: 'rust' as const,
        packageName: 'sdkwork-im-rpc-sdk-rust',
        expectedFiles: ['Cargo.toml', 'src/lib.rs'],
        expectedRemotePlugins: [
          'buf.build/community/neoeinstein-prost',
          'buf.build/community/neoeinstein-tonic',
        ],
      },
    ];

    for (const expectation of expectations) {
      const execution = await runGenerateCommand({
        protocol: 'rpc',
        input: fixture.manifestPath,
        protoRoot: fixture.protoRoot,
        output: join(workDir, `rpc-sdk-${expectation.language}`),
        name: 'SdkworkImRpc',
        sdkName: 'sdkwork-im-rpc-sdk',
        language: expectation.language,
        packageName: expectation.packageName,
        syncPublishedVersion: false,
        dryRun: true,
      });

      expect(execution.result.files.map((file) => file.path)).toEqual(expect.arrayContaining([
        'buf.gen.yaml',
        'README.md',
        'rpc-methods.json',
        ...expectation.expectedFiles,
      ]));
      const bufConfig = execution.result.files.find((file) => file.path === 'buf.gen.yaml');
      expect(bufConfig).toBeDefined();
      expect(bufConfig!.content).not.toContain('local: protoc-gen-');
      for (const remotePlugin of expectation.expectedRemotePlugins) {
        expect(bufConfig!.content).toContain(`remote: ${remotePlugin}`);
      }
      if (expectation.language === 'typescript') {
        const packageFile = execution.result.files.find((file) => file.path === 'package.json');
        const tsconfigFile = execution.result.files.find((file) => file.path === 'tsconfig.json');
        expect(packageFile).toBeDefined();
        expect(tsconfigFile).toBeDefined();
        expect(packageFile!.ownership).toBe('generated');
        expect(tsconfigFile!.ownership).toBe('generated');
        const packageJson = JSON.parse(packageFile!.content);
        const tsconfigJson = JSON.parse(tsconfigFile!.content);
        expect(packageJson.dependencies).toMatchObject({
          '@bufbuild/protobuf': '^2.12.0',
          '@connectrpc/connect': '^2.1.0',
        });
        expect(packageJson.publishConfig).toEqual({
          access: 'public',
          registry: 'https://registry.npmjs.org/',
        });
        expect(tsconfigJson.compilerOptions.rootDir).toBe('.');
        expect(tsconfigJson.include).toContain('generated/proto/**/*.ts');
      }
      if (expectation.language === 'go') {
        expect(bufConfig!.content).toContain('go_package_prefix');
        expect(bufConfig!.content).toContain('github.com/sdkwork/im-rpc-sdk-go/generated/proto');
      }
      if (expectation.language === 'java') {
        const pomFile = execution.result.files.find((file) => file.path === 'pom.xml');
        expect(pomFile).toBeDefined();
        expect(pomFile!.ownership).toBe('generated');
        expect(pomFile!.content).toContain('<sourceDirectory>generated/proto/java</sourceDirectory>');
        expect(pomFile!.content).toContain('<artifactId>grpc-protobuf</artifactId>');
        expect(pomFile!.content).toContain('<grpc.version>1.81.0</grpc.version>');
        expect(pomFile!.content).toContain('<protobuf.version>4.33.2</protobuf.version>');
      }
      if (expectation.language === 'python') {
        const pyprojectFile = execution.result.files.find((file) => file.path === 'pyproject.toml');
        expect(pyprojectFile).toBeDefined();
        expect(pyprojectFile!.ownership).toBe('generated');
        expect(pyprojectFile!.content).toContain('package-dir = {"" = "src", "sdkwork" = "generated/proto/sdkwork"}');
      }
      if (expectation.language === 'rust') {
        const cargoFile = execution.result.files.find((file) => file.path === 'Cargo.toml');
        const libFile = execution.result.files.find((file) => file.path === 'src/lib.rs');
        expect(cargoFile).toBeDefined();
        expect(libFile).toBeDefined();
        expect(cargoFile!.ownership).toBe('generated');
        expect(libFile!.ownership).toBe('generated');
        expect(cargoFile!.content).toContain('[workspace]');
        expect(cargoFile!.content).toContain('prost = "0.14"');
        expect(cargoFile!.content).toContain('tonic = { version = "0.14"');
        expect(cargoFile!.content).toContain('tonic-prost = "0.14"');
        expect(libFile!.content).toContain('include!(concat!(env!("CARGO_MANIFEST_DIR"), "/generated/proto/sdkwork/common/v1/sdkwork.common.v1.rs"));');
        expect(libFile!.content).toContain('include!(concat!(env!("CARGO_MANIFEST_DIR"), "/generated/proto/sdkwork/communication/app/v3/sdkwork.communication.app.v3.rs"));');
        expect(libFile!.content).not.toContain('sdkwork.communication.app.v3.tonic.rs"));');
      }
    }
  });
});
