import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  formatInspectFailure,
  formatInspectSuccess,
  resolveInspectGate,
  runInspectCommand,
} from './cli-inspect.js';

const tempDirs: string[] = [];

const userSpec = {
  openapi: '3.0.3',
  info: { title: 'User API', version: '1.0.0' },
  paths: {
    '/users': {
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
                  type: 'array',
                  items: { $ref: '#/components/schemas/User' },
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
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    },
  },
};

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('cli inspect', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('reads a generated sdk control plane snapshot and formats machine-readable json', async () => {
    const workDir = createTempDir('sdkwork-cli-inspect-');
    const outputDir = join(workDir, 'generated-sdk');
    const specPath = join(workDir, 'openapi.json');
    writeFileSync(specPath, JSON.stringify(userSpec, null, 2), 'utf-8');

    const { runGenerateCommand } = await import('./cli-runner.js');
    await runGenerateCommand({
      input: specPath,
      output: outputDir,
      name: 'TestSDK',
      type: 'backend',
      language: 'typescript',
      license: 'MIT',
      syncPublishedVersion: false,
    });

    const snapshot = runInspectCommand({
      output: outputDir,
    });
    const output = formatInspectSuccess(snapshot, { json: true });
    const parsed = JSON.parse(output) as {
      schemaVersion: number;
      generator: string;
      evaluation: {
        status: string;
        recommendedAction: string;
      };
      artifacts: {
        executionReportPath: string;
      };
      issues: Array<{ code: string }>;
    };

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.generator).toBe('@sdkwork/sdk-generator');
    expect(parsed.evaluation.status).toBe('healthy');
    expect(parsed.evaluation.recommendedAction).toBe('verify');
    expect(parsed.artifacts.executionReportPath).toContain('.sdkwork');
    expect(parsed.issues).toEqual([]);
  });

  it('inspects an rpc sdk workspace by convention when no persisted control plane is committed', async () => {
    const workDir = createTempDir('sdkwork-cli-inspect-rpc-convention-');
    const familyRoot = join(workDir, 'sdkwork-im-rpc-sdk');
    const outputDir = join(familyRoot, 'sdkwork-im-rpc-sdk-typescript');
    const protoRoot = join(workDir, 'proto');
    const protoDir = join(protoRoot, 'sdkwork', 'communication', 'app', 'v3');
    const rpcDir = join(familyRoot, 'rpc');
    const manifestPath = join(rpcDir, 'sdkwork-im-rpc.manifest.json');
    mkdirSync(protoDir, { recursive: true });
    mkdirSync(rpcDir, { recursive: true });
    writeFileSync(join(protoDir, 'message_service.proto'), `syntax = "proto3";
package sdkwork.communication.app.v3;
service MessageService {
  rpc CreateMessage(CreateMessageRequest) returns (CreateMessageResponse);
}
message CreateMessageRequest { string text = 1; }
message CreateMessageResponse { string message_id = 1; }
`, 'utf-8');
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

    const { runGenerateCommand } = await import('./cli-runner.js');
    await runGenerateCommand({
      protocol: 'rpc',
      input: manifestPath,
      protoRoot,
      output: outputDir,
      name: 'SdkworkImRpc',
      type: 'backend',
      language: 'typescript',
      packageName: '@sdkwork/im-rpc-sdk',
      license: 'MIT',
      syncPublishedVersion: false,
    });

    expect(existsSync(join(outputDir, '.sdkwork', 'sdkwork-generator-manifest.json'))).toBe(false);
    expect(existsSync(join(outputDir, '.sdkwork', 'sdkwork-generator-changes.json'))).toBe(false);
    expect(existsSync(join(outputDir, '.sdkwork', 'sdkwork-generator-report.json'))).toBe(false);

    const snapshot = runInspectCommand({
      output: outputDir,
      protocol: 'rpc',
    });
    const output = formatInspectSuccess(snapshot, { json: true });
    const parsed = JSON.parse(output) as {
      evaluation: {
        status: string;
        recommendedAction: string;
        summary: string;
      };
      evidenceMode: string;
      convention: {
        protocol: string;
        sdkFamily: string;
        language: string;
        manifestPath: string;
        packageManifestPath: string;
      };
      manifest: null;
      changeSummary: null;
      executionReport: null;
      issues: Array<{ code: string }>;
    };

    expect(parsed.evaluation.status).toBe('healthy');
    expect(parsed.evaluation.recommendedAction).toBe('verify');
    expect(parsed.evaluation.summary).toContain('release, CI, audit, or migration workflows');
    expect(parsed.evidenceMode).toBe('convention');
    expect(parsed.convention).toMatchObject({
      protocol: 'rpc',
      sdkFamily: 'sdkwork-im-rpc-sdk',
      language: 'typescript',
    });
    expect(parsed.convention.manifestPath).toContain('sdkwork-im-rpc.manifest.json');
    expect(parsed.convention.packageManifestPath).toContain('package.json');
    expect(parsed.manifest).toBeNull();
    expect(parsed.changeSummary).toBeNull();
    expect(parsed.executionReport).toBeNull();
    expect(parsed.issues).toEqual([]);
  });

  it('formats rpc convention inspection as convention evidence in text mode', async () => {
    const workDir = createTempDir('sdkwork-cli-inspect-rpc-convention-text-');
    const familyRoot = join(workDir, 'sdkwork-im-rpc-sdk');
    const outputDir = join(familyRoot, 'sdkwork-im-rpc-sdk-typescript');
    const protoRoot = join(workDir, 'proto');
    const protoDir = join(protoRoot, 'sdkwork', 'communication', 'app', 'v3');
    const rpcDir = join(familyRoot, 'rpc');
    const manifestPath = join(rpcDir, 'sdkwork-im-rpc.manifest.json');
    mkdirSync(protoDir, { recursive: true });
    mkdirSync(rpcDir, { recursive: true });
    writeFileSync(join(protoDir, 'message_service.proto'), `syntax = "proto3";
package sdkwork.communication.app.v3;
service MessageService {
  rpc CreateMessage(CreateMessageRequest) returns (CreateMessageResponse);
}
message CreateMessageRequest { string text = 1; }
message CreateMessageResponse { string message_id = 1; }
`, 'utf-8');
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

    const { runGenerateCommand } = await import('./cli-runner.js');
    await runGenerateCommand({
      protocol: 'rpc',
      input: manifestPath,
      protoRoot,
      output: outputDir,
      name: 'SdkworkImRpc',
      type: 'backend',
      language: 'typescript',
      packageName: '@sdkwork/im-rpc-sdk',
      license: 'MIT',
      syncPublishedVersion: false,
    });

    const snapshot = runInspectCommand({
      output: outputDir,
      protocol: 'rpc',
    });
    const output = formatInspectSuccess(snapshot, { json: false });

    expect(output).toContain('SDK evidence status: healthy');
    expect(output).toContain('SDK evidence mode: convention');
    expect(output).toContain('release, CI, audit, or migration workflows');
    expect(output).toContain('RPC convention evidence:');
    expect(output).toContain('SDK family: sdkwork-im-rpc-sdk');
    expect(output).toContain('Language: typescript');
    expect(output).toContain('RPC manifest:');
    expect(output).toContain('Package manifest:');
    expect(output).not.toContain('Manifest: missing ->');
    expect(output).not.toContain('Change summary: missing ->');
    expect(output).not.toContain('Execution report: missing ->');
  });

  it('reads unified generated sdk control-plane artifacts when protocol is rpc and evidence is emitted', async () => {
    const workDir = createTempDir('sdkwork-cli-inspect-rpc-');
    const familyRoot = join(workDir, 'sdkwork-im-rpc-sdk');
    const outputDir = join(familyRoot, 'sdkwork-im-rpc-sdk-typescript');
    const protoRoot = join(workDir, 'proto');
    const protoDir = join(protoRoot, 'sdkwork', 'communication', 'app', 'v3');
    const rpcDir = join(familyRoot, 'rpc');
    const manifestPath = join(rpcDir, 'sdkwork-im-rpc.manifest.json');
    mkdirSync(protoDir, { recursive: true });
    mkdirSync(rpcDir, { recursive: true });
    writeFileSync(join(protoDir, 'message_service.proto'), `syntax = "proto3";
package sdkwork.communication.app.v3;
service MessageService {
  rpc CreateMessage(CreateMessageRequest) returns (CreateMessageResponse);
}
message CreateMessageRequest { string text = 1; }
message CreateMessageResponse { string message_id = 1; }
`, 'utf-8');
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

    const { runGenerateCommand } = await import('./cli-runner.js');
    await runGenerateCommand({
      protocol: 'rpc',
      input: manifestPath,
      protoRoot,
      output: outputDir,
      name: 'SdkworkImRpc',
      type: 'backend',
      language: 'typescript',
      packageName: '@sdkwork/im-rpc-sdk',
      license: 'MIT',
      syncPublishedVersion: false,
      emitControlPlane: true,
    });

    const snapshot = runInspectCommand({
      output: outputDir,
      protocol: 'rpc',
    });
    const output = formatInspectSuccess(snapshot, { json: true });
    const parsed = JSON.parse(output) as {
      evaluation: {
        status: string;
      };
      evidenceMode: string;
      artifacts: {
        manifestPath: string;
        changeSummaryPath: string;
        executionReportPath: string;
      };
      manifest: {
        sdk: {
          protocol: string;
        };
      };
      changeSummary: {
        sdk: {
          protocol: string;
        };
      };
      executionReport: {
        sdk: {
          protocol: string;
        };
      };
      issues: Array<{ code: string }>;
    };

    expect(parsed.evaluation.status).toBe('healthy');
    expect(parsed.evidenceMode).toBe('control-plane');
    expect(parsed.artifacts.manifestPath).toContain('sdkwork-generator-manifest.json');
    expect(parsed.artifacts.changeSummaryPath).toContain('sdkwork-generator-changes.json');
    expect(parsed.artifacts.executionReportPath).toContain('sdkwork-generator-report.json');
    expect(parsed.artifacts.manifestPath).not.toContain('sdkwork-rpc-generator');
    expect(parsed.artifacts.changeSummaryPath).not.toContain('sdkwork-rpc-generator');
    expect(parsed.artifacts.executionReportPath).not.toContain('sdkwork-rpc-generator');
    expect(parsed.manifest.sdk.protocol).toBe('rpc');
    expect(parsed.changeSummary.sdk.protocol).toBe('rpc');
    expect(parsed.executionReport.sdk.protocol).toBe('rpc');
    expect(parsed.issues).toEqual([]);
  });

  it('formats a control plane snapshot as human-readable text', () => {
    const output = formatInspectSuccess({
      schemaVersion: 1,
      generator: '@sdkwork/sdk-generator',
      artifacts: {
        stateDir: '/tmp/generated-sdk/.sdkwork',
        manifestPath: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-manifest.json',
        changeSummaryPath: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-changes.json',
        executionReportPath: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-report.json',
        manualBackupDir: '/tmp/generated-sdk/.sdkwork/manual-backups',
      },
      manifest: null,
      changeSummary: null,
      executionReport: null,
      issues: [
        {
          artifact: 'executionReport',
          code: 'missing-artifact',
          path: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-report.json',
        },
      ],
      evaluation: {
        status: 'degraded',
        recommendedAction: 'review',
        summary: 'Persisted control-plane artifacts are incomplete.',
        reasons: ['missing-artifact'],
      },
    }, { json: false });

    expect(output).toContain('SDK evidence status: degraded');
    expect(output).toContain('Recommended action: review');
    expect(output).toContain('Persisted control-plane artifacts are incomplete.');
    expect(output).toContain('Issues:');
    expect(output).toContain('executionReport missing-artifact');
  });

  it('formats inspect failures as machine-readable json when requested', () => {
    const output = formatInspectFailure(new Error('inspect boom'), { json: true });
    const parsed = JSON.parse(output) as {
      schemaVersion: number;
      generator: string;
      status: string;
      message: string;
    };

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.generator).toBe('@sdkwork/sdk-generator');
    expect(parsed.status).toBe('error');
    expect(parsed.message).toBe('inspect boom');
  });

  it('formats inspect failures as generated sdk evidence failures in text mode', () => {
    const output = formatInspectFailure(new Error('inspect boom'));

    expect(output).toBe('Failed to inspect SDK evidence: Error: inspect boom');
  });

  it('fails inspection when status meets or exceeds the configured fail-on threshold', () => {
    const gate = resolveInspectGate({
      schemaVersion: 1,
      generator: '@sdkwork/sdk-generator',
      artifacts: {
        stateDir: '/tmp/generated-sdk/.sdkwork',
        manifestPath: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-manifest.json',
        changeSummaryPath: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-changes.json',
        executionReportPath: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-report.json',
        manualBackupDir: '/tmp/generated-sdk/.sdkwork/manual-backups',
      },
      manifest: null,
      changeSummary: null,
      executionReport: null,
      issues: [],
      evaluation: {
        status: 'degraded',
        recommendedAction: 'review',
        summary: 'Persisted control-plane artifacts are incomplete.',
        reasons: ['missing-artifact'],
      },
    }, {
      failOn: 'degraded',
    });

    expect(gate.exitCode).toBe(1);
    expect(gate.reasons).toContain('status-threshold:degraded');
  });

  it('fails inspection when the recommended action does not match the required action', () => {
    const gate = resolveInspectGate({
      schemaVersion: 1,
      generator: '@sdkwork/sdk-generator',
      artifacts: {
        stateDir: '/tmp/generated-sdk/.sdkwork',
        manifestPath: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-manifest.json',
        changeSummaryPath: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-changes.json',
        executionReportPath: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-report.json',
        manualBackupDir: '/tmp/generated-sdk/.sdkwork/manual-backups',
      },
      manifest: null,
      changeSummary: null,
      executionReport: null,
      issues: [],
      evaluation: {
        status: 'healthy',
        recommendedAction: 'verify',
        summary: 'Changes have been applied. Run the required verification plan now.',
        reasons: ['verification-required'],
      },
    }, {
      requireAction: 'complete',
    });

    expect(gate.exitCode).toBe(1);
    expect(gate.reasons).toContain('required-action-mismatch:complete!=verify');
  });

  it('rejects unsupported inspect gate status thresholds', () => {
    expect(() => resolveInspectGate({
      schemaVersion: 1,
      generator: '@sdkwork/sdk-generator',
      artifacts: {
        stateDir: '/tmp/generated-sdk/.sdkwork',
        manifestPath: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-manifest.json',
        changeSummaryPath: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-changes.json',
        executionReportPath: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-report.json',
        manualBackupDir: '/tmp/generated-sdk/.sdkwork/manual-backups',
      },
      manifest: null,
      changeSummary: null,
      executionReport: null,
      issues: [],
      evaluation: {
        status: 'healthy',
        recommendedAction: 'verify',
        summary: 'ok',
        reasons: [],
      },
    }, {
      failOn: 'fatal' as 'empty',
    })).toThrow('Unsupported inspect fail-on status');
  });

  it('rejects unsupported inspect required actions', () => {
    expect(() => resolveInspectGate({
      schemaVersion: 1,
      generator: '@sdkwork/sdk-generator',
      artifacts: {
        stateDir: '/tmp/generated-sdk/.sdkwork',
        manifestPath: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-manifest.json',
        changeSummaryPath: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-changes.json',
        executionReportPath: '/tmp/generated-sdk/.sdkwork/sdkwork-generator-report.json',
        manualBackupDir: '/tmp/generated-sdk/.sdkwork/manual-backups',
      },
      manifest: null,
      changeSummary: null,
      executionReport: null,
      issues: [],
      evaluation: {
        status: 'healthy',
        recommendedAction: 'verify',
        summary: 'ok',
        reasons: [],
      },
    }, {
      requireAction: 'ship' as 'verify',
    })).toThrow('Unsupported inspect required action');
  });
});
