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

import {
  SDKWORK_GENERATOR_CHANGES_PATH,
  SDKWORK_GENERATOR_MANIFEST_PATH,
} from './framework/output-sync.js';
import { runGenerateCommand } from './cli-runner.js';
import { SDKWORK_GENERATOR_REPORT_PATH } from './execution-report.js';

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

const productSpec = {
  openapi: '3.0.3',
  info: { title: 'Product API', version: '1.0.0' },
  paths: {
    '/products': {
      get: {
        summary: 'List products',
        operationId: 'listProducts',
        tags: ['Product'],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Product' },
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
      Product: {
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

describe('runGenerateCommand', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('preserves custom files and backs up modified generated files across real command reruns', async () => {
    const workDir = createTempDir('sdkwork-cli-runner-');
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

    const generatedUserApi = join(outputDir, 'src/api/user.ts');
    expect(existsSync(generatedUserApi)).toBe(true);

    writeFileSync(generatedUserApi, 'manual user api edit\n', 'utf-8');
    writeFileSync(join(outputDir, 'custom/local-wrapper.ts'), 'export const preserved = true;\n', 'utf-8');
    writeFileSync(specPath, JSON.stringify(productSpec, null, 2), 'utf-8');

    const rerun = await runGenerateCommand({
      input: specPath,
      output: outputDir,
      name: 'TestSDK',
      type: 'backend',
      language: 'typescript',
      license: 'MIT',
      syncPublishedVersion: false,
    });

    expect(existsSync(join(outputDir, 'src/api/user.ts'))).toBe(false);
    expect(existsSync(join(outputDir, 'src/api/product.ts'))).toBe(true);
    expect(readFileSync(join(outputDir, 'custom/local-wrapper.ts'), 'utf-8')).toBe(
      'export const preserved = true;\n'
    );
    expect(readFileSync(join(outputDir, '.sdkwork/manual-backups/src/api/user.ts'), 'utf-8')).toBe(
      'manual user api edit\n'
    );
    expect(rerun.syncSummary.backedUpFiles).toContain('src/api/user.ts');
    expect(rerun.syncSummary.changeSummaryPath).toBe(SDKWORK_GENERATOR_CHANGES_PATH);
    expect(rerun.syncSummary.changes.deletedGeneratedFiles).toContain('src/api/user.ts');
    expect(rerun.syncSummary.changes.backedUpFiles).toContain('src/api/user.ts');

    const manifest = JSON.parse(
      readFileSync(join(outputDir, SDKWORK_GENERATOR_MANIFEST_PATH), 'utf-8')
    ) as {
      generatedFiles: Array<{ path: string }>;
    };
    const changeSummary = JSON.parse(
      readFileSync(join(outputDir, SDKWORK_GENERATOR_CHANGES_PATH), 'utf-8')
    ) as {
      changes: {
        deletedGeneratedFiles: string[];
        backedUpFiles: string[];
      };
    };
    const executionReport = JSON.parse(
      readFileSync(join(outputDir, SDKWORK_GENERATOR_REPORT_PATH), 'utf-8')
    ) as {
      status: string;
      mode: string;
      changeImpact: {
        areas: string[];
      };
      verificationPlan: {
        shouldRun: boolean;
      };
      executionDecision: {
        nextAction: string;
      };
      executionHandoff: {
        steps: Array<{ id: string }>;
      };
      syncSummary: {
        changeFingerprint: string;
      };
    };
    expect(manifest.generatedFiles.some((entry) => entry.path === 'src/api/product.ts')).toBe(true);
    expect(manifest.generatedFiles.some((entry) => entry.path === 'src/api/user.ts')).toBe(false);
    expect(changeSummary.changes.deletedGeneratedFiles).toContain('src/api/user.ts');
    expect(changeSummary.changes.backedUpFiles).toContain('src/api/user.ts');
    expect(executionReport.status).toBe('ok');
    expect(executionReport.mode).toBe('apply');
    expect(executionReport.changeImpact.areas).toContain('api-surface');
    expect(executionReport.verificationPlan.shouldRun).toBe(true);
    expect(executionReport.executionDecision.nextAction).toBe('verify');
    expect(executionReport.executionHandoff.steps.map((step) => step.id)).toEqual([
      'verify-check',
      'verify-build',
    ]);
    expect(executionReport.syncSummary.changeFingerprint).toBe(rerun.syncSummary.changeFingerprint);
  });

  it('supports dry-run command execution without creating output files', async () => {
    const workDir = createTempDir('sdkwork-cli-runner-dry-run-');
    const outputDir = join(workDir, 'generated-sdk');
    const specPath = join(workDir, 'openapi.json');
    writeFileSync(specPath, JSON.stringify(userSpec, null, 2), 'utf-8');

    const execution = await runGenerateCommand({
      input: specPath,
      output: outputDir,
      name: 'TestSDK',
      type: 'backend',
      language: 'typescript',
      license: 'MIT',
      syncPublishedVersion: false,
      dryRun: true,
    });

    expect(execution.syncSummary.dryRun).toBe(true);
    expect(execution.syncSummary.changes.createdGeneratedFiles).not.toEqual([]);
    expect(existsSync(outputDir)).toBe(false);
    expect(existsSync(join(outputDir, SDKWORK_GENERATOR_REPORT_PATH))).toBe(false);
  });

  it('allows apply mode to require the dry-run change fingerprint', async () => {
    const workDir = createTempDir('sdkwork-cli-runner-fingerprint-');
    const outputDir = join(workDir, 'generated-sdk');
    const specPath = join(workDir, 'openapi.json');
    writeFileSync(specPath, JSON.stringify(userSpec, null, 2), 'utf-8');

    const preview = await runGenerateCommand({
      input: specPath,
      output: outputDir,
      name: 'TestSDK',
      type: 'backend',
      language: 'typescript',
      license: 'MIT',
      syncPublishedVersion: false,
      dryRun: true,
    });

    const apply = await runGenerateCommand({
      input: specPath,
      output: outputDir,
      name: 'TestSDK',
      type: 'backend',
      language: 'typescript',
      license: 'MIT',
      syncPublishedVersion: false,
      expectedChangeFingerprint: preview.syncSummary.changeFingerprint,
    });

    expect(apply.syncSummary.dryRun).toBe(false);
    expect(apply.syncSummary.changeFingerprint).toBe(preview.syncSummary.changeFingerprint);
    expect(existsSync(outputDir)).toBe(true);
  });

  it('rejects unsupported sdk types before generation starts', async () => {
    const workDir = createTempDir('sdkwork-cli-runner-invalid-type-');
    const outputDir = join(workDir, 'generated-sdk');
    const specPath = join(workDir, 'openapi.json');
    writeFileSync(specPath, JSON.stringify(userSpec, null, 2), 'utf-8');

    await expect(runGenerateCommand({
      input: specPath,
      output: outputDir,
      name: 'TestSDK',
      type: 'desktop' as any,
      language: 'typescript',
      license: 'MIT',
      syncPublishedVersion: false,
    })).rejects.toThrow(
      'Unsupported SDK type: desktop. Supported: app, backend, ai, custom'
    );

    expect(existsSync(outputDir)).toBe(false);
  });

  it('uses an explicit npm package baseline override during command execution', async () => {
    const workDir = createTempDir('sdkwork-cli-runner-npm-package-');
    const outputDir = join(workDir, 'generated-sdk');
    const specPath = join(workDir, 'openapi.json');
    writeFileSync(specPath, JSON.stringify(userSpec, null, 2), 'utf-8');

    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return {
        ok: true,
        json: async () => ({
          'dist-tags': {
            latest: '5.0.0',
          },
        }),
      };
    }) as typeof fetch;

    try {
      const execution = await runGenerateCommand({
        input: specPath,
        output: outputDir,
        name: 'TestSDK',
        type: 'app',
        language: 'python',
        packageName: 'sdkwork-app-sdk-python',
        npmPackageName: '@acme/unified-app-sdk',
        license: 'MIT',
        dryRun: true,
      });

      expect(requestedUrls).toHaveLength(1);
      expect(requestedUrls[0]).toContain(encodeURIComponent('@acme/unified-app-sdk'));
      expect(execution.resolvedVersion.publishedVersion).toBe('5.0.0');
      expect(execution.resolvedVersion.version).toBe('5.0.1');
      expect(execution.syncSummary.dryRun).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('passes namespace and package id overrides into csharp generation', async () => {
    const workDir = createTempDir('sdkwork-cli-runner-csharp-namespace-');
    const outputDir = join(workDir, 'generated-sdk');
    const specPath = join(workDir, 'openapi.json');
    writeFileSync(specPath, JSON.stringify(userSpec, null, 2), 'utf-8');

    const execution = await runGenerateCommand({
      input: specPath,
      output: outputDir,
      name: 'TestSDK',
      type: 'app',
      language: 'csharp',
      namespace: 'Acme.App.Client',
      packageName: 'Acme.App.Sdk',
      license: 'MIT',
      syncPublishedVersion: false,
      dryRun: true,
    } as any);

    const projectFile = execution.result.files.find((file) => file.path === 'Acme.App.Sdk.csproj');
    const readmeFile = execution.result.files.find((file) => file.path === 'README.md');

    expect(projectFile).toBeDefined();
    expect(projectFile!.content).toContain('<RootNamespace>Acme.App.Client</RootNamespace>');
    expect(projectFile!.content).toContain('<PackageId>Acme.App.Sdk</PackageId>');
    expect(readmeFile).toBeDefined();
    expect(readmeFile!.content).toContain('using Acme.App.Client;');
    expect(readmeFile!.content).toContain('dotnet add package Acme.App.Sdk');
  });
});
