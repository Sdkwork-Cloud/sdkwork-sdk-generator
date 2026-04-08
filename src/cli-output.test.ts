import { describe, expect, it } from 'vitest';

import type { GenerateCommandExecution } from './cli-runner.js';
import { formatGenerateFailure, formatGenerateSuccess } from './cli-output.js';

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
      dryRun: true,
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

describe('cli output', () => {
  it('formats successful generate execution as machine-readable json', () => {
    const output = formatGenerateSuccess(createExecution(), { json: true });
    const parsed = JSON.parse(output) as {
      status: string;
      mode: string;
      hasChanges: boolean;
      hasDestructiveChanges: boolean;
      changeFingerprint: string;
      changeImpact: {
        areas: string[];
        requiresVerification: boolean;
      };
      executionDecision: {
        nextAction: string;
        riskLevel: string;
      };
      executionHandoff: {
        steps: Array<{ id: string; displayCommand: string }>;
        manualReviewHint?: string;
      };
      verificationPlan: {
        shouldRun: boolean;
        runPhase: string;
        steps: Array<{ id: string }>;
      };
      sdk: {
        name: string;
        version: string;
        outputPath: string;
      };
      versioning: {
        resolvedVersion: string;
      };
      stats: {
        totalFiles: number;
      };
      syncSummary: {
        dryRun: boolean;
        deletedGeneratedFiles: number;
        impact: {
          areas: string[];
        };
        verificationPlan: {
          shouldRun: boolean;
          steps: Array<{ id: string }>;
        };
        executionDecision: {
          nextAction: string;
          riskLevel: string;
        };
      };
    };

    expect(parsed.status).toBe('ok');
    expect(parsed.mode).toBe('dry-run');
    expect(parsed.hasChanges).toBe(true);
    expect(parsed.hasDestructiveChanges).toBe(true);
    expect(parsed.changeFingerprint).toBe('fingerprint-1');
    expect(parsed.changeImpact.areas).toEqual([
      'api-surface',
      'models',
      'runtime',
      'documentation',
      'custom-scaffold',
    ]);
    expect(parsed.changeImpact.requiresVerification).toBe(true);
    expect(parsed.executionDecision).toMatchObject({
      nextAction: 'review',
      riskLevel: 'high',
    });
    expect(parsed.executionHandoff.steps.map((step) => step.id)).toEqual(['apply-reviewed-plan']);
    expect(parsed.executionHandoff.steps[0].displayCommand).toContain('--expected-change-fingerprint fingerprint-1');
    expect(parsed.executionHandoff.manualReviewHint).toContain('dry-run report');
    expect(parsed.verificationPlan.shouldRun).toBe(true);
    expect(parsed.verificationPlan.runPhase).toBe('after-apply');
    expect(parsed.verificationPlan.steps.map((step) => step.id)).toEqual(['check', 'build']);
    expect(parsed.sdk.name).toBe('TestSDK');
    expect(parsed.sdk.version).toBe('1.2.3');
    expect(parsed.sdk.outputPath).toBe('/tmp/generated-sdk');
    expect(parsed.versioning.resolvedVersion).toBe('1.2.3');
    expect(parsed.stats.totalFiles).toBe(12);
    expect(parsed.syncSummary.dryRun).toBe(true);
    expect(parsed.syncSummary.deletedGeneratedFiles).toBe(1);
    expect(parsed.syncSummary.impact.areas).toEqual([
      'api-surface',
      'models',
      'runtime',
      'documentation',
      'custom-scaffold',
    ]);
    expect(parsed.syncSummary.verificationPlan.shouldRun).toBe(true);
    expect(parsed.syncSummary.verificationPlan.steps.map((step) => step.id)).toEqual(['check', 'build']);
    expect(parsed.syncSummary.executionDecision).toMatchObject({
      nextAction: 'review',
      riskLevel: 'high',
    });
  });

  it('formats successful generate execution as human-readable text by default', () => {
    const output = formatGenerateSuccess(createExecution({
      syncSummary: {
        ...createExecution().syncSummary,
        dryRun: false,
      },
    }), { json: false });

    expect(output).toContain('Generated successfully!');
    expect(output).toContain('Output: /tmp/generated-sdk');
    expect(output).toContain('Change summary: .sdkwork/sdkwork-generator-changes.json');
    expect(output).toContain('Execution report: .sdkwork/sdkwork-generator-report.json');
    expect(output).toContain('Change fingerprint: fingerprint-1');
    expect(output).toContain('Impact: api-surface, models, runtime, documentation, custom-scaffold');
    expect(output).toContain('Next action: verify (risk: high)');
    expect(output).toContain('Next commands:');
    expect(output).toContain('node ./bin/publish-core.mjs --language typescript --project-dir . --action check');
    expect(output).toContain('Generated file changes: created 1, updated 1, unchanged 1, deleted 1');
    expect(output).toContain('Verification plan (now):');
  });

  it('formats in-memory dry-run handoff as next steps instead of fake commands', () => {
    const output = formatGenerateSuccess(createExecution({
      config: {
        ...createExecution().config,
        apiSpecPath: '<in-memory-spec>',
      },
    }), { json: false });

    expect(output).toContain('Next steps:');
    expect(output).not.toContain('Next commands:');
    expect(output).toContain('generateSdkProject');
    expect(output).not.toContain('sdkgen generate -i <in-memory-spec>');
  });

  it('formats failures as machine-readable json when requested', () => {
    const output = formatGenerateFailure(new Error('boom'), {
      json: true,
      outputPath: '/tmp/generated-sdk',
    });
    const parsed = JSON.parse(output) as {
      schemaVersion: number;
      generator: string;
      status: string;
      message: string;
      artifacts: {
        executionReportPath: string;
        changeSummaryPath: string;
      };
    };

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.generator).toBe('@sdkwork/sdk-generator');
    expect(parsed.status).toBe('error');
    expect(parsed.message).toBe('boom');
    expect(parsed.artifacts.executionReportPath).toBe('.sdkwork/sdkwork-generator-report.json');
    expect(parsed.artifacts.changeSummaryPath).toBe('.sdkwork/sdkwork-generator-changes.json');
  });

  it('formats failures as human-readable text by default', () => {
    const output = formatGenerateFailure(new Error('boom'), { json: false });

    expect(output).toBe('Failed to generate SDK: Error: boom');
  });
});
