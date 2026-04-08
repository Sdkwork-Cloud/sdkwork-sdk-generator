import { analyzeChangeImpact, } from './change-impact.js';
import { getPublishCapability } from './publish-capabilities.js';
export function buildVerificationPlan(execution) {
    return buildVerificationPlanFromContext({
        language: execution.config.language,
        outputPath: execution.config.outputPath,
        dryRun: execution.syncSummary.dryRun,
        changes: execution.syncSummary.changes,
        impact: execution.syncSummary.impact,
    });
}
export function buildVerificationPlanFromContext(context) {
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
    const steps = [
        createPublishStep(context, 'check', true, `Validate the generated package with the unified publish helper. Triggered by: ${impactLabel}.`),
    ];
    if (capability.hasDistinctBuildStep) {
        steps.push(createPublishStep(context, 'build', true, `Run the full package build because this language uses a lighter check path than the final build. Triggered by: ${impactLabel}.`));
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
function createPublishStep(context, action, required, rationale) {
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
