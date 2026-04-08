import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { GenerateCommandExecution } from '../cli-runner.js';
import {
  persistGenerateExecutionReport,
  readGenerateExecutionReport,
  resolveGenerateExecutionArtifacts,
  SDKWORK_GENERATOR_REPORT_PATH,
} from './execution-report.js';

const tempDirs: string[] = [];

function createExecution(outputPath: string): GenerateCommandExecution {
  return {
    config: {
      name: 'TestSDK',
      version: '1.2.3',
      language: 'typescript',
      sdkType: 'backend',
      outputPath,
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
      warnings: [],
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
  };
}

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('node execution report helpers', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('resolves stable execution artifact paths and reads the persisted report back', () => {
    const outputDir = createTempDir('sdkwork-node-execution-report-');
    const execution = createExecution(outputDir);

    const artifacts = resolveGenerateExecutionArtifacts(outputDir);
    const persisted = persistGenerateExecutionReport(execution);
    const loaded = readGenerateExecutionReport(outputDir);

    expect(artifacts.executionReportPath).toBe(join(outputDir, SDKWORK_GENERATOR_REPORT_PATH));
    expect(existsSync(artifacts.executionReportPath)).toBe(true);
    expect(JSON.parse(readFileSync(artifacts.executionReportPath, 'utf-8'))).toEqual(persisted);
    expect(loaded).toEqual(persisted);
  });
});
