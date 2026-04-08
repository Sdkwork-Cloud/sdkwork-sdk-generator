import { describe, expect, it } from 'vitest';

import { analyzeChangeImpact } from './change-impact.js';
import {
  buildExecutionDecisionFromContext,
  type ExecutionDecisionContext,
} from './execution-decision.js';
import { buildVerificationPlanFromContext } from './verification-plan.js';

function createContext(
  overrides: Partial<ExecutionDecisionContext> = {}
): ExecutionDecisionContext {
  const changes = overrides.changes || {
    createdGeneratedFiles: ['src/api/user.ts'],
    updatedGeneratedFiles: ['src/http/client.ts'],
    unchangedGeneratedFiles: [],
    deletedGeneratedFiles: [],
    scaffoldedFiles: [],
    preservedScaffoldFiles: [],
    backedUpFiles: [],
  };
  const impact = overrides.impact || analyzeChangeImpact(changes);
  const verificationPlan = overrides.verificationPlan || buildVerificationPlanFromContext({
    language: overrides.language || 'typescript',
    outputPath: overrides.outputPath || '/tmp/generated-sdk',
    dryRun: overrides.dryRun === true,
    changes,
    impact,
  });

  return {
    language: 'typescript',
    outputPath: '/tmp/generated-sdk',
    dryRun: false,
    preservedLegacyFiles: false,
    changes,
    impact,
    verificationPlan,
    ...overrides,
  };
}

describe('execution decision', () => {
  it('returns skip for no-op generations', () => {
    const changes = {
      createdGeneratedFiles: [],
      updatedGeneratedFiles: [],
      unchangedGeneratedFiles: ['src/index.ts'],
      deletedGeneratedFiles: [],
      scaffoldedFiles: [],
      preservedScaffoldFiles: ['custom/README.md'],
      backedUpFiles: [],
    };
    const impact = analyzeChangeImpact(changes);
    const verificationPlan = buildVerificationPlanFromContext({
      language: 'typescript',
      outputPath: '/tmp/generated-sdk',
      dryRun: false,
      changes,
      impact,
    });

    const decision = buildExecutionDecisionFromContext(createContext({
      changes,
      impact,
      verificationPlan,
    }));

    expect(decision).toMatchObject({
      nextAction: 'skip',
      riskLevel: 'low',
      requiresManualReview: false,
      applyRequiresExpectedFingerprint: false,
    });
  });

  it('returns review for dry-run destructive changes', () => {
    const changes = {
      createdGeneratedFiles: [],
      updatedGeneratedFiles: ['src/api/user.ts'],
      unchangedGeneratedFiles: [],
      deletedGeneratedFiles: ['src/types/legacy.ts'],
      scaffoldedFiles: [],
      preservedScaffoldFiles: [],
      backedUpFiles: ['src/api/user.ts'],
    };
    const impact = analyzeChangeImpact(changes);
    const verificationPlan = buildVerificationPlanFromContext({
      language: 'typescript',
      outputPath: '/tmp/generated-sdk',
      dryRun: true,
      changes,
      impact,
    });

    const decision = buildExecutionDecisionFromContext(createContext({
      dryRun: true,
      changes,
      impact,
      verificationPlan,
    }));

    expect(decision).toMatchObject({
      nextAction: 'review',
      riskLevel: 'high',
      requiresManualReview: true,
      applyRequiresExpectedFingerprint: true,
    });
    expect(decision.reasons).toContain('deleted-generated-files');
    expect(decision.reasons).toContain('backed-up-generated-files');
  });

  it('returns apply for dry-run non-destructive changes', () => {
    const decision = buildExecutionDecisionFromContext(createContext({
      dryRun: true,
    }));

    expect(decision).toMatchObject({
      nextAction: 'apply',
      riskLevel: 'medium',
      requiresManualReview: false,
      applyRequiresExpectedFingerprint: true,
    });
  });

  it('returns verify after apply when verification is still required', () => {
    const decision = buildExecutionDecisionFromContext(createContext());

    expect(decision).toMatchObject({
      nextAction: 'verify',
      riskLevel: 'medium',
      requiresManualReview: false,
      applyRequiresExpectedFingerprint: false,
    });
    expect(decision.reasons).toContain('verification-required');
  });

  it('returns complete after apply when only docs and scaffold changes exist', () => {
    const changes = {
      createdGeneratedFiles: [],
      updatedGeneratedFiles: ['README.md'],
      unchangedGeneratedFiles: [],
      deletedGeneratedFiles: [],
      scaffoldedFiles: ['custom/README.md'],
      preservedScaffoldFiles: [],
      backedUpFiles: [],
    };
    const impact = analyzeChangeImpact(changes);
    const verificationPlan = buildVerificationPlanFromContext({
      language: 'typescript',
      outputPath: '/tmp/generated-sdk',
      dryRun: false,
      changes,
      impact,
    });

    const decision = buildExecutionDecisionFromContext(createContext({
      changes,
      impact,
      verificationPlan,
    }));

    expect(decision).toMatchObject({
      nextAction: 'complete',
      riskLevel: 'low',
      requiresManualReview: false,
      applyRequiresExpectedFingerprint: false,
    });
  });
});
