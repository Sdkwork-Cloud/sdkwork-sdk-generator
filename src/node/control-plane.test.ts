import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SDKWORK_GENERATOR_CHANGES_PATH,
  SDKWORK_GENERATOR_MANIFEST_PATH,
  SDKWORK_GENERATOR_NAME,
  SDKWORK_STATE_DIR,
} from '../framework/output-sync.js';
import {
  GENERATE_EXECUTION_REPORT_SCHEMA_VERSION,
  SDKWORK_GENERATOR_REPORT_PATH,
} from '../execution-report.js';
import { runGenerateCommand } from '../cli-runner.js';
import {
  readGeneratedSdkEvidenceSnapshot,
  readGenerateControlPlaneSnapshot,
  type GeneratedSdkEvidenceSnapshot,
} from './control-plane.js';

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

describe('node control plane', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('reads a complete persisted control plane snapshot for a generated sdk', async () => {
    const workDir = createTempDir('sdkwork-control-plane-');
    const outputDir = join(workDir, 'generated-sdk');
    const specPath = join(workDir, 'openapi.json');
    writeFileSync(specPath, JSON.stringify(userSpec, null, 2), 'utf-8');

    await runGenerateCommand({
      input: specPath,
      output: outputDir,
      name: 'TestSDK',
      type: 'backend',
      language: 'typescript',
      license: 'MIT',
      syncPublishedVersion: false,
    });

    const snapshot = readGenerateControlPlaneSnapshot(outputDir);
    const evidenceSnapshot: GeneratedSdkEvidenceSnapshot = readGeneratedSdkEvidenceSnapshot(outputDir);

    expect(snapshot.schemaVersion).toBe(1);
    expect(evidenceSnapshot).toEqual(snapshot);
    expect(snapshot.generator).toBe(SDKWORK_GENERATOR_NAME);
    expect(snapshot.artifacts.stateDir).toBe(join(outputDir, SDKWORK_STATE_DIR));
    expect(snapshot.manifest?.schemaVersion).toBe(1);
    expect(snapshot.changeSummary?.schemaVersion).toBe(1);
    expect(snapshot.executionReport?.schemaVersion).toBe(GENERATE_EXECUTION_REPORT_SCHEMA_VERSION);
    expect(snapshot.issues).toEqual([]);
    expect(snapshot.evaluation).toMatchObject({
      status: 'healthy',
      recommendedAction: 'verify',
    });
  });

  it('reads unified persisted control plane artifacts and validates rpc protocol metadata', async () => {
    const workDir = createTempDir('sdkwork-control-plane-rpc-');
    const outputDir = join(workDir, 'generated-rpc-sdk');
    const protoRoot = join(workDir, 'proto');
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
    const manifestPath = join(workDir, 'sdkwork-im-rpc.manifest.json');
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

    const snapshot = readGenerateControlPlaneSnapshot(outputDir, { protocol: 'rpc' });

    expect(snapshot.artifacts.manifestPath).toBe(join(outputDir, SDKWORK_GENERATOR_MANIFEST_PATH));
    expect(snapshot.artifacts.changeSummaryPath).toBe(join(outputDir, SDKWORK_GENERATOR_CHANGES_PATH));
    expect(snapshot.artifacts.executionReportPath).toBe(join(outputDir, SDKWORK_GENERATOR_REPORT_PATH));
    expect(snapshot.manifest?.sdk.protocol).toBe('rpc');
    expect(snapshot.changeSummary?.sdk.protocol).toBe('rpc');
    expect(snapshot.executionReport?.sdk.protocol).toBe('rpc');
    expect(snapshot.issues).toEqual([]);
    expect(snapshot.evaluation).toMatchObject({
      status: 'healthy',
    });
  });

  it('marks control plane invalid when requested protocol does not match sdk metadata', async () => {
    const workDir = createTempDir('sdkwork-control-plane-protocol-mismatch-');
    const outputDir = join(workDir, 'generated-sdk');
    const specPath = join(workDir, 'openapi.json');
    writeFileSync(specPath, JSON.stringify(userSpec, null, 2), 'utf-8');

    await runGenerateCommand({
      input: specPath,
      output: outputDir,
      name: 'TestSDK',
      type: 'backend',
      language: 'typescript',
      license: 'MIT',
      syncPublishedVersion: false,
    });

    const snapshot = readGenerateControlPlaneSnapshot(outputDir, { protocol: 'rpc' });

    expect(snapshot.manifest?.sdk.protocol).toBe('http');
    expect(snapshot.issues).toEqual([
      {
        artifact: 'manifest',
        code: 'sdk-protocol-mismatch',
        path: join(outputDir, SDKWORK_GENERATOR_MANIFEST_PATH),
      },
      {
        artifact: 'changeSummary',
        code: 'sdk-protocol-mismatch',
        path: join(outputDir, SDKWORK_GENERATOR_CHANGES_PATH),
      },
      {
        artifact: 'executionReport',
        code: 'sdk-protocol-mismatch',
        path: join(outputDir, SDKWORK_GENERATOR_REPORT_PATH),
      },
    ]);
    expect(snapshot.evaluation).toMatchObject({
      status: 'invalid',
      recommendedAction: 'review',
    });
  });

  it('returns structured issues for malformed or incompatible persisted artifacts', () => {
    const outputDir = createTempDir('sdkwork-control-plane-invalid-');
    const stateDir = join(outputDir, SDKWORK_STATE_DIR);
    mkdirSync(stateDir, { recursive: true });

    writeFileSync(join(outputDir, SDKWORK_GENERATOR_MANIFEST_PATH), JSON.stringify({
      schemaVersion: 999,
      generator: SDKWORK_GENERATOR_NAME,
      generatedFiles: [],
      scaffoldFiles: [],
      customRoots: [],
    }, null, 2), 'utf-8');
    writeFileSync(join(outputDir, SDKWORK_GENERATOR_CHANGES_PATH), '{not-json', 'utf-8');
    writeFileSync(join(outputDir, SDKWORK_GENERATOR_REPORT_PATH), JSON.stringify({
      schemaVersion: 999,
      generator: SDKWORK_GENERATOR_NAME,
      status: 'ok',
    }, null, 2), 'utf-8');

    const snapshot = readGenerateControlPlaneSnapshot(outputDir);

    expect(snapshot.manifest).toBeNull();
    expect(snapshot.changeSummary).toBeNull();
    expect(snapshot.executionReport).toBeNull();
    expect(snapshot.issues).toEqual([
      {
        artifact: 'manifest',
        code: 'unsupported-schema-version',
        path: join(outputDir, SDKWORK_GENERATOR_MANIFEST_PATH),
      },
      {
        artifact: 'changeSummary',
        code: 'invalid-json',
        path: join(outputDir, SDKWORK_GENERATOR_CHANGES_PATH),
      },
      {
        artifact: 'executionReport',
        code: 'unsupported-schema-version',
        path: join(outputDir, SDKWORK_GENERATOR_REPORT_PATH),
      },
    ]);
    expect(snapshot.evaluation).toMatchObject({
      status: 'invalid',
      recommendedAction: 'review',
    });
  });

  it('marks the control plane invalid when change summary and execution report fingerprints diverge', async () => {
    const workDir = createTempDir('sdkwork-control-plane-mismatch-');
    const outputDir = join(workDir, 'generated-sdk');
    const specPath = join(workDir, 'openapi.json');
    writeFileSync(specPath, JSON.stringify(userSpec, null, 2), 'utf-8');

    await runGenerateCommand({
      input: specPath,
      output: outputDir,
      name: 'TestSDK',
      type: 'backend',
      language: 'typescript',
      license: 'MIT',
      syncPublishedVersion: false,
    });

    const reportPath = join(outputDir, SDKWORK_GENERATOR_REPORT_PATH);
    const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as {
      changeFingerprint: string;
    };
    report.changeFingerprint = 'tampered-fingerprint';
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

    const snapshot = readGenerateControlPlaneSnapshot(outputDir);

    expect(snapshot.issues).toContainEqual({
      artifact: 'executionReport',
      code: 'fingerprint-mismatch',
      path: reportPath,
    });
    expect(snapshot.evaluation).toMatchObject({
      status: 'invalid',
      recommendedAction: 'review',
    });
  });
});
