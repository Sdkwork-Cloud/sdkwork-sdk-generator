import { afterEach, describe, expect, it } from 'vitest';
import {
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

    expect(output).toContain('Control plane status: degraded');
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
