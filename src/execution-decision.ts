import { analyzeChangeImpact, type ChangeImpactInput, type ChangeImpactSummary } from './change-impact.js';
import {
  buildVerificationPlanFromContext,
  type VerificationPlan,
  type VerificationPlanContext,
} from './verification-plan.js';
import type { Language } from './framework/types.js';

export interface ExecutionDecision {
  schemaVersion: 1;
  riskLevel: 'low' | 'medium' | 'high';
  nextAction: 'skip' | 'review' | 'apply' | 'verify' | 'complete';
  requiresManualReview: boolean;
  applyRequiresExpectedFingerprint: boolean;
  summary: string;
  reasons: string[];
}

export interface ExecutionDecisionContext {
  language: Language;
  outputPath: string;
  dryRun: boolean;
  preservedLegacyFiles: boolean;
  changes: ChangeImpactInput;
  impact?: ChangeImpactSummary;
  verificationPlan?: VerificationPlan;
}

export function buildExecutionDecisionFromContext(
  context: ExecutionDecisionContext
): ExecutionDecision {
  const impact = context.impact || analyzeChangeImpact(context.changes);
  const verificationPlan = context.verificationPlan || buildVerificationPlanFromContext({
    language: context.language,
    outputPath: context.outputPath,
    dryRun: context.dryRun,
    changes: context.changes,
    impact,
  } satisfies VerificationPlanContext);
  const hasActionableChanges = hasRelevantChanges(context.changes);
  const requiresManualReview = context.preservedLegacyFiles
    || context.changes.deletedGeneratedFiles.length > 0
    || context.changes.backedUpFiles.length > 0
    || impact.areas.includes('unknown');
  const riskLevel = resolveRiskLevel({
    hasActionableChanges,
    requiresManualReview,
    impact,
  });
  const reasons = resolveReasons({
    context,
    impact,
    verificationPlan,
    hasActionableChanges,
    requiresManualReview,
  });

  if (!hasActionableChanges) {
    return {
      schemaVersion: 1,
      riskLevel,
      nextAction: 'skip',
      requiresManualReview: false,
      applyRequiresExpectedFingerprint: false,
      summary: 'No actionable changes were detected. No apply or verification step is required.',
      reasons,
    };
  }

  if (context.dryRun) {
    if (requiresManualReview) {
      return {
        schemaVersion: 1,
        riskLevel,
        nextAction: 'review',
        requiresManualReview: true,
        applyRequiresExpectedFingerprint: true,
        summary: 'Dry-run detected high-risk changes. Review the change summary before apply, then reuse the expected change fingerprint.',
        reasons,
      };
    }

    return {
      schemaVersion: 1,
      riskLevel,
      nextAction: 'apply',
      requiresManualReview: false,
      applyRequiresExpectedFingerprint: true,
      summary: 'Dry-run detected actionable changes. Apply the reviewed plan with the expected change fingerprint.',
      reasons,
    };
  }

  if (verificationPlan.shouldRun) {
    return {
      schemaVersion: 1,
      riskLevel,
      nextAction: 'verify',
      requiresManualReview: false,
      applyRequiresExpectedFingerprint: false,
      summary: 'Changes have been applied. Run the required verification plan now.',
      reasons,
    };
  }

  return {
    schemaVersion: 1,
    riskLevel,
    nextAction: 'complete',
    requiresManualReview: false,
    applyRequiresExpectedFingerprint: false,
    summary: 'Changes have been applied and no further verification is required.',
    reasons,
  };
}

function hasRelevantChanges(changes: ChangeImpactInput): boolean {
  return changes.createdGeneratedFiles.length > 0
    || changes.updatedGeneratedFiles.length > 0
    || changes.deletedGeneratedFiles.length > 0
    || changes.scaffoldedFiles.length > 0
    || changes.backedUpFiles.length > 0;
}

function resolveRiskLevel(input: {
  hasActionableChanges: boolean;
  requiresManualReview: boolean;
  impact: ChangeImpactSummary;
}): ExecutionDecision['riskLevel'] {
  if (!input.hasActionableChanges || !input.impact.requiresVerification) {
    return 'low';
  }
  if (input.requiresManualReview) {
    return 'high';
  }
  return 'medium';
}

function resolveReasons(input: {
  context: ExecutionDecisionContext;
  impact: ChangeImpactSummary;
  verificationPlan: VerificationPlan;
  hasActionableChanges: boolean;
  requiresManualReview: boolean;
}): string[] {
  const reasons = new Set<string>();
  if (!input.hasActionableChanges) {
    reasons.add('no-actionable-changes');
  }
  if (input.context.dryRun) {
    reasons.add('dry-run');
  }
  if (input.context.changes.deletedGeneratedFiles.length > 0) {
    reasons.add('deleted-generated-files');
  }
  if (input.context.changes.backedUpFiles.length > 0) {
    reasons.add('backed-up-generated-files');
  }
  if (input.context.preservedLegacyFiles) {
    reasons.add('preserved-legacy-files');
  }
  if (input.impact.areas.includes('unknown')) {
    reasons.add('unknown-impact');
  }
  if (input.verificationPlan.shouldRun) {
    reasons.add('verification-required');
  }
  if (!input.impact.requiresVerification && input.hasActionableChanges) {
    reasons.add('non-runtime-documentation-or-scaffold-change');
  }
  if (input.requiresManualReview) {
    reasons.add('manual-review-required');
  }
  return Array.from(reasons).sort((left, right) => left.localeCompare(right));
}
