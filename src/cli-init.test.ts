import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runInspectCommand } from './cli-inspect.js';
import { runGenerateCommand } from './cli-runner.js';
import { runInitCommand } from './cli-init.js';
import { SDKWORK_GENERATOR_REPORT_PATH } from './execution-report.js';
import {
  SDKWORK_GENERATOR_CHANGES_PATH,
  SDKWORK_GENERATOR_MANIFEST_PATH,
} from './framework/output-sync.js';

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

describe('runInitCommand', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('creates a regeneration-safe sdk workspace scaffold with a healthy control plane', async () => {
    const workDir = createTempDir('sdkwork-cli-init-');
    const outputDir = join(workDir, 'generated-sdk');

    const execution = await runInitCommand({
      output: outputDir,
      name: 'TestSDK',
      type: 'backend',
      language: 'typescript',
      description: 'Test SDK workspace',
    });

    expect(existsSync(join(outputDir, 'README.md'))).toBe(true);
    expect(existsSync(join(outputDir, 'custom/README.md'))).toBe(true);
    expect(existsSync(join(outputDir, 'sdkwork-sdk.json'))).toBe(true);
    expect(existsSync(join(outputDir, SDKWORK_GENERATOR_MANIFEST_PATH))).toBe(true);
    expect(existsSync(join(outputDir, SDKWORK_GENERATOR_CHANGES_PATH))).toBe(true);
    expect(existsSync(join(outputDir, SDKWORK_GENERATOR_REPORT_PATH))).toBe(true);

    const metadata = JSON.parse(readFileSync(join(outputDir, 'sdkwork-sdk.json'), 'utf-8')) as {
      schemaVersion?: number;
      name: string;
      version: string;
      language: string;
      sdkType: string;
      packageName: string | null;
      generator: string;
      capabilities?: Record<string, unknown>;
      generation?: Record<string, unknown>;
      ownership?: Record<string, unknown>;
    };
    expect(metadata).toMatchObject({
      schemaVersion: 1,
      name: 'TestSDK',
      version: '1.0.0',
      language: 'typescript',
      sdkType: 'backend',
      packageName: null,
      generator: '@sdkwork/sdk-generator',
      capabilities: {
        supportsGeneratedTests: true,
        supportsReadme: true,
        supportsCustomScaffold: true,
        supportsPublishWorkflow: true,
        hasDistinctBuildStep: true,
      },
      generation: {
        readme: true,
        tests: false,
      },
      ownership: {
        generatedOwnership: 'generated',
        scaffoldOwnership: 'scaffold',
        scaffoldRoots: ['custom/'],
        stateRoots: ['.sdkwork/'],
      },
    });

    expect(execution.syncSummary.changes.createdGeneratedFiles).toEqual(['README.md', 'sdkwork-sdk.json']);
    expect(execution.syncSummary.changes.scaffoldedFiles).toEqual(['custom/README.md']);

    const snapshot = runInspectCommand({ output: outputDir });
    expect(snapshot.evaluation.status).toBe('healthy');
    expect(snapshot.evaluation.recommendedAction).toBe('complete');
  });

  it('is idempotent when rerun against an existing init scaffold', async () => {
    const workDir = createTempDir('sdkwork-cli-init-rerun-');
    const outputDir = join(workDir, 'generated-sdk');

    await runInitCommand({
      output: outputDir,
      name: 'TestSDK',
      type: 'backend',
      language: 'typescript',
    });

    const rerun = await runInitCommand({
      output: outputDir,
      name: 'TestSDK',
      type: 'backend',
      language: 'typescript',
    });

    expect(rerun.resolvedVersion.version).toBe('1.0.0');
    expect(rerun.syncSummary.changes.createdGeneratedFiles).toEqual([]);
    expect(rerun.syncSummary.changes.updatedGeneratedFiles).toEqual([]);
    expect(rerun.syncSummary.changes.deletedGeneratedFiles).toEqual([]);
    expect(rerun.syncSummary.changes.scaffoldedFiles).toEqual([]);
    expect(rerun.syncSummary.changes.backedUpFiles).toEqual([]);
    expect(rerun.syncSummary.changes.preservedScaffoldFiles).toEqual(['custom/README.md']);
    expect(rerun.syncSummary.executionDecision?.nextAction).toBe('skip');
  });

  it('rejects unsupported sdk types before writing files', async () => {
    const workDir = createTempDir('sdkwork-cli-init-invalid-type-');
    const outputDir = join(workDir, 'generated-sdk');

    await expect(runInitCommand({
      output: outputDir,
      name: 'TestSDK',
      type: 'desktop' as any,
      language: 'typescript',
    })).rejects.toThrow('Unsupported SDK type: desktop. Supported: app, backend, ai, custom');

    expect(existsSync(outputDir)).toBe(false);
  });

  it('refuses to replace an existing generated sdk control plane', async () => {
    const workDir = createTempDir('sdkwork-cli-init-existing-generated-');
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

    await expect(runInitCommand({
      output: outputDir,
      name: 'TestSDK',
      type: 'backend',
      language: 'typescript',
    })).rejects.toThrow('Output already contains a generated SDK control plane. Use sdkgen generate for regeneration.');
  });
});
