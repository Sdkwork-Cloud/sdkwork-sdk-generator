import { describe, expect, it } from 'vitest';

import type { GenerateCommandExecution } from './cli-runner.js';
import { buildVerificationPlan } from './verification-plan.js';

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
      dryRun: true,
      writtenFiles: 2,
      skippedScaffoldFiles: 0,
      skippedUnchangedGeneratedFiles: 0,
      deletedGeneratedFiles: 0,
      changeSummaryPath: '.sdkwork/sdkwork-generator-changes.json',
      changeFingerprint: 'fingerprint-1',
      changes: {
        createdGeneratedFiles: ['src/api/user.ts'],
        updatedGeneratedFiles: ['src/http/client.ts'],
        unchangedGeneratedFiles: [],
        deletedGeneratedFiles: ['src/types/legacy.ts'],
        scaffoldedFiles: ['custom/README.md'],
        preservedScaffoldFiles: [],
        backedUpFiles: [],
      },
      backedUpFiles: [],
      preservedLegacyFiles: false,
    },
    ...overrides,
  } as GenerateCommandExecution;
}

describe('verification plan', () => {
  it('skips verification when only documentation and custom scaffold changes were detected', () => {
    const plan = buildVerificationPlan(createExecution({
      syncSummary: {
        ...createExecution().syncSummary,
        dryRun: false,
        changes: {
          createdGeneratedFiles: [],
          updatedGeneratedFiles: ['README.md'],
          unchangedGeneratedFiles: ['src/index.ts'],
          deletedGeneratedFiles: [],
          scaffoldedFiles: ['custom/README.md'],
          preservedScaffoldFiles: [],
          backedUpFiles: [],
        },
      },
    }));

    expect(plan.shouldRun).toBe(false);
    expect(plan.runPhase).toBe('skip');
    expect(plan.steps).toEqual([]);
    expect(plan.summary).toContain('documentation');
    expect(plan.summary).toContain('custom scaffold');
  });

  it('recommends check and build after apply for dry-run typescript runtime changes', () => {
    const plan = buildVerificationPlan(createExecution());

    expect(plan.shouldRun).toBe(true);
    expect(plan.runPhase).toBe('after-apply');
    expect(plan.steps.map((step) => step.id)).toEqual(['check', 'build']);
    expect(plan.steps.every((step) => step.required)).toBe(true);
    expect(plan.summary).toContain('api-surface');
    expect(plan.summary).toContain('runtime');
    expect(plan.steps[0].command).toBe('node');
    expect(plan.steps[0].args).toEqual([
      './bin/publish-core.mjs',
      '--language',
      'typescript',
      '--project-dir',
      '.',
      '--action',
      'check',
    ]);
    expect(plan.steps[0].workingDirectory).toBe('/tmp/generated-sdk');
  });

  it('recommends only check for apply-mode java build metadata changes', () => {
    const plan = buildVerificationPlan(createExecution({
      config: {
        ...createExecution().config,
        language: 'java',
      },
      syncSummary: {
        ...createExecution().syncSummary,
        dryRun: false,
        changes: {
          createdGeneratedFiles: [],
          updatedGeneratedFiles: ['pom.xml'],
          unchangedGeneratedFiles: [],
          deletedGeneratedFiles: [],
          scaffoldedFiles: [],
          preservedScaffoldFiles: [],
          backedUpFiles: [],
        },
      },
    }));

    expect(plan.shouldRun).toBe(true);
    expect(plan.runPhase).toBe('now');
    expect(plan.steps.map((step) => step.id)).toEqual(['check']);
    expect(plan.summary).toContain('build-metadata');
    expect(plan.steps[0].args).toEqual([
      './bin/publish-core.mjs',
      '--language',
      'java',
      '--project-dir',
      '.',
      '--action',
      'check',
    ]);
  });
});
