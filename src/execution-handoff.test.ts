import { describe, expect, it } from 'vitest';

import type { GenerateCommandExecution } from './cli-runner.js';
import { buildExecutionHandoff } from './execution-handoff.js';

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
      apiPrefix: '/backend/v3/api',
      packageName: '@sdkwork/test-sdk',
      commonPackage: '@sdkwork/sdk-common@^1.0.0',
      generateReadme: true,
      description: 'Test SDK',
      author: 'SDKWork Team',
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
      deletedGeneratedFiles: 1,
      changeSummaryPath: '.sdkwork/sdkwork-generator-changes.json',
      changeFingerprint: 'fingerprint-1',
      changes: {
        createdGeneratedFiles: ['src/api/user.ts'],
        updatedGeneratedFiles: ['src/http/client.ts'],
        unchangedGeneratedFiles: [],
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

describe('execution handoff', () => {
  it('builds an apply command for dry-run review/apply flows', () => {
    const handoff = buildExecutionHandoff(createExecution());

    expect(handoff.summary).toContain('review');
    expect(handoff.manualReviewHint).toContain('dry-run report');
    expect(handoff.steps).toHaveLength(1);
    expect(handoff.steps[0]).toMatchObject({
      id: 'apply-reviewed-plan',
      command: 'sdkgen',
      required: true,
    });
    expect(handoff.steps[0].displayCommand).toContain('--expected-change-fingerprint fingerprint-1');
    expect(handoff.steps[0].displayCommand).toContain('--fixed-sdk-version 1.2.3');
    expect(handoff.steps[0].displayCommand).toContain('-i /tmp/openapi.json');
  });

  it('preserves namespace overrides in the reviewed apply command', () => {
    const baseline = createExecution();
    const handoff = buildExecutionHandoff(createExecution({
      config: {
        ...baseline.config,
        language: 'csharp',
        namespace: 'Acme.App.Client',
      },
    }));

    expect(handoff.steps).toHaveLength(1);
    expect(handoff.steps[0].displayCommand).toContain('--namespace Acme.App.Client');
  });

  it('quotes empty api prefix arguments in the reviewed apply command', () => {
    const baseline = createExecution();
    const handoff = buildExecutionHandoff(createExecution({
      config: {
        ...baseline.config,
        apiPrefix: '',
      },
    }));

    expect(handoff.steps).toHaveLength(1);
    expect(handoff.steps[0].args).toContain('');
    expect(handoff.steps[0].displayCommand).toContain('--api-prefix "" --fixed-sdk-version 1.2.3');
  });

  it('does not emit an unusable cli apply command for in-memory specs', () => {
    const baseline = createExecution();
    const handoff = buildExecutionHandoff(createExecution({
      config: {
        ...baseline.config,
        apiSpecPath: '<in-memory-spec>',
      },
    }));

    expect(handoff.steps).toEqual([]);
    expect(handoff.summary).toContain('programmatic');
    expect(handoff.manualReviewHint).toContain('generateSdkProject');
  });

  it('reuses verification commands after apply-mode runs', () => {
    const handoff = buildExecutionHandoff(createExecution({
      syncSummary: {
        ...createExecution().syncSummary,
        dryRun: false,
      },
    }));

    expect(handoff.summary).toContain('verification');
    expect(handoff.steps.map((step) => step.id)).toEqual([
      'verify-check',
      'verify-build',
    ]);
    expect(handoff.steps[0].displayCommand).toContain('node ./bin/publish-core.mjs');
  });

  it('returns no commands when no further action is needed', () => {
    const handoff = buildExecutionHandoff(createExecution({
      syncSummary: {
        ...createExecution().syncSummary,
        dryRun: false,
        changes: {
          createdGeneratedFiles: [],
          updatedGeneratedFiles: ['README.md'],
          unchangedGeneratedFiles: [],
          deletedGeneratedFiles: [],
          scaffoldedFiles: ['custom/README.md'],
          preservedScaffoldFiles: [],
          backedUpFiles: [],
        },
      },
    }));

    expect(handoff.steps).toEqual([]);
    expect(handoff.summary).toContain('No further commands');
  });
});
