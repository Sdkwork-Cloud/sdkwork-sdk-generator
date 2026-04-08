import type { GenerateCommandExecution } from './cli-runner.js';
import {
  analyzeChangeImpact,
  type ChangeImpactInput,
  type ChangeImpactSummary,
} from './change-impact.js';
import type { Language } from './framework/types.js';
import { getPublishCapability } from './publish-capabilities.js';

export interface VerificationPlan {
  shouldRun: boolean;
  runPhase: 'skip' | 'now' | 'after-apply';
  summary: string;
  steps: VerificationStep[];
}

export interface VerificationPlanContext {
  language: Language;
  outputPath: string;
  dryRun: boolean;
  changes: ChangeImpactInput;
  impact?: ChangeImpactSummary;
}

export interface VerificationStep {
  id: 'check' | 'build';
  title: string;
  required: boolean;
  rationale: string;
  workingDirectory: string;
  command: 'node';
  args: string[];
  displayCommand: string;
}

export function buildVerificationPlan(execution: GenerateCommandExecution): VerificationPlan {
  return buildVerificationPlanFromContext({
    language: execution.config.language,
    outputPath: execution.config.outputPath,
    dryRun: execution.syncSummary.dryRun,
    changes: execution.syncSummary.changes,
    impact: execution.syncSummary.impact,
  });
}

export function buildVerificationPlanFromContext(context: VerificationPlanContext): VerificationPlan {
  const impact = context.impact || analyzeChangeImpact(context.changes);
  if (!impact.requiresVerification) {
    return {
      shouldRun: false,
      runPhase: 'skip',
      summary: impact.summary,
      steps: [],
    };
  }

  const capability = getPublishCapability(context.language);
  if (!capability?.hasUnifiedPublish) {
    return {
      shouldRun: false,
      runPhase: 'skip',
      summary: `No unified publish capability is registered for ${context.language}.`,
      steps: [],
    };
  }

  const runPhase = context.dryRun ? 'after-apply' : 'now';
  const impactLabel = impact.areas.join(', ');
  const steps: VerificationStep[] = [
    createPublishStep(
      context,
      'check',
      true,
      `Validate the generated package with the unified publish helper. Triggered by: ${impactLabel}.`
    ),
  ];

  if (capability.hasDistinctBuildStep) {
    steps.push(
      createPublishStep(
        context,
        'build',
        true,
        `Run the full package build because this language uses a lighter check path than the final build. Triggered by: ${impactLabel}.`
      )
    );
  }

  return {
    shouldRun: true,
    runPhase,
    summary: runPhase === 'after-apply'
      ? `${impact.summary} Apply the planned changes first, then run the required verification commands.`
      : `${impact.summary} Run the required verification commands now against the generated SDK output.`,
    steps,
  };
}

function createPublishStep(
  context: Pick<VerificationPlanContext, 'language' | 'outputPath'>,
  action: VerificationStep['id'],
  required: boolean,
  rationale: string
): VerificationStep {
  const args = [
    './bin/publish-core.mjs',
    '--language',
    context.language,
    '--project-dir',
    '.',
    '--action',
    action,
  ];
  return {
    id: action,
    title: action === 'check' ? 'Unified package check' : 'Unified package build',
    required,
    rationale,
    workingDirectory: context.outputPath,
    command: 'node',
    args,
    displayCommand: ['node', ...args].join(' '),
  };
}
