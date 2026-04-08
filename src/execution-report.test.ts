import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { GenerateCommandExecution } from './cli-runner.js';
import { formatGenerateSuccess } from './cli-output.js';
import {
  buildGenerateExecutionReport,
  persistGenerateExecutionReport,
  SDKWORK_GENERATOR_REPORT_PATH,
} from './execution-report.js';

const tempDirs: string[] = [];

function createExecution(overrides?: Partial<GenerateCommandExecution>): GenerateCommandExecution {
  return {
    config: {
      name: 'TestSDK',
      version: '1.2.3',
      language: 'typescript',
      sdkType: 'backend',
      outputPath: '/tmp/generated-sdk',
      apiSpecPath: '/tmp/openapi.json',
      baseUrl: 'https://api.example.com',
      apiPrefix: '',
      generateReadme: true,
      license: 'MIT',
    },
    spec: {
      openapi: '3.0.3',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: {},
    },
    result: {
      files: [],
      errors: [],
      warnings: ['warning-1'],
      stats: {
        totalFiles: 12,
        models: 4,
        apis: 3,
        types: 5,
      },
    },
    resolvedVersion: {
      version: '1.2.3',
      localVersions: ['1.2.2'],
      publishedVersion: '1.2.1',
    },
    syncSummary: {
      dryRun: false,
      writtenFiles: 2,
      skippedScaffoldFiles: 1,
      skippedUnchangedGeneratedFiles: 3,
      deletedGeneratedFiles: 1,
      changeSummaryPath: '.sdkwork/sdkwork-generator-changes.json',
      changeFingerprint: 'fingerprint-1',
      changes: {
        createdGeneratedFiles: ['src/api/user.ts'],
        updatedGeneratedFiles: ['src/http/client.ts'],
        unchangedGeneratedFiles: ['src/index.ts'],
        deletedGeneratedFiles: ['src/types/legacy.ts'],
        scaffoldedFiles: ['custom/README.md'],
        preservedScaffoldFiles: [],
        backedUpFiles: ['src/http/client.ts'],
      },
      backedUpFiles: ['src/http/client.ts'],
      preservedLegacyFiles: false,
    },
    ...overrides,
  } as GenerateCommandExecution;
}

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('execution report', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('builds the same machine-readable payload used by CLI json output', () => {
    const execution = createExecution();

    const report = buildGenerateExecutionReport(execution);
    const cliJsonReport = JSON.parse(formatGenerateSuccess(execution, { json: true }));

    expect(report.schemaVersion).toBe(1);
    expect(report.generator).toBe('@sdkwork/sdk-generator');
    expect(report.artifacts).toEqual({
      stateDir: '.sdkwork',
      manifestPath: '.sdkwork/sdkwork-generator-manifest.json',
      changeSummaryPath: '.sdkwork/sdkwork-generator-changes.json',
      executionReportPath: '.sdkwork/sdkwork-generator-report.json',
      manualBackupDir: '.sdkwork/manual-backups',
    });
    expect(report).toEqual(cliJsonReport);
  });

  it('persists the execution report under .sdkwork for apply mode', () => {
    const outputDir = createTempDir('sdkwork-execution-report-');
    const execution = createExecution({
      config: {
        ...createExecution().config,
        outputPath: outputDir,
      },
    });

    const report = persistGenerateExecutionReport(execution);
    const reportPath = join(outputDir, SDKWORK_GENERATOR_REPORT_PATH);

    expect(report).not.toBeNull();
    expect(existsSync(reportPath)).toBe(true);
    expect(report?.artifacts.executionReportPath).toBe(SDKWORK_GENERATOR_REPORT_PATH);
    expect(JSON.parse(readFileSync(reportPath, 'utf-8'))).toEqual(report);
  });
});
