import { buildExecutionDecisionFromContext, } from './execution-decision.js';
import { buildVerificationPlan } from './verification-plan.js';
export function buildExecutionHandoff(execution, executionDecision, verificationPlan) {
    const resolvedVerificationPlan = verificationPlan || buildVerificationPlan(execution);
    const resolvedExecutionDecision = executionDecision || buildExecutionDecisionFromContext({
        language: execution.config.language,
        outputPath: execution.config.outputPath,
        dryRun: execution.syncSummary.dryRun,
        preservedLegacyFiles: execution.syncSummary.preservedLegacyFiles,
        changes: execution.syncSummary.changes,
        impact: execution.syncSummary.impact,
        verificationPlan: resolvedVerificationPlan,
    });
    switch (resolvedExecutionDecision.nextAction) {
        case 'review':
            if (!canReplayViaCli(execution.config.apiSpecPath)) {
                return createProgrammaticReplayHandoff('Review the current dry-run report, then rerun the same programmatic generation call with the original in-memory spec, fixed sdk version, and expected change fingerprint.', 'The source spec only exists in memory. Reuse generateSdkProject(...) with the original spec object, fixed sdk version, and expected change fingerprint.');
            }
            return {
                schemaVersion: 1,
                summary: 'Review the current dry-run report, then apply the reviewed plan with the expected change fingerprint.',
                manualReviewHint: 'Review the current dry-run report and change fingerprint before running the apply command.',
                steps: [createApplyReviewedPlanStep(execution)],
            };
        case 'apply':
            if (!canReplayViaCli(execution.config.apiSpecPath)) {
                return createProgrammaticReplayHandoff('Apply the reviewed dry-run plan by rerunning the same programmatic generation call with the original in-memory spec.', 'The source spec only exists in memory. Reuse generateSdkProject(...) with the original spec object, fixed sdk version, and expected change fingerprint.');
            }
            return {
                schemaVersion: 1,
                summary: 'Apply the reviewed dry-run plan with the expected change fingerprint.',
                steps: [createApplyReviewedPlanStep(execution)],
            };
        case 'verify':
            return {
                schemaVersion: 1,
                summary: 'Run the required verification commands now.',
                steps: resolvedVerificationPlan.steps.map((step) => ({
                    id: `verify-${step.id}`,
                    title: step.title,
                    required: step.required,
                    rationale: step.rationale,
                    workingDirectory: step.workingDirectory,
                    command: step.command,
                    args: step.args,
                    displayCommand: step.displayCommand,
                })),
            };
        case 'complete':
            return {
                schemaVersion: 1,
                summary: 'No further commands are required after apply.',
                steps: [],
            };
        case 'skip':
        default:
            return {
                schemaVersion: 1,
                summary: 'No further commands are required.',
                steps: [],
            };
    }
}
function createApplyReviewedPlanStep(execution) {
    const args = [
        'generate',
        '-i',
        execution.config.apiSpecPath,
        '-o',
        execution.config.outputPath,
        '-n',
        execution.config.name,
        '-l',
        execution.config.language,
        '-t',
        execution.config.sdkType,
        '--base-url',
        execution.config.baseUrl,
        '--api-prefix',
        execution.config.apiPrefix,
        '--fixed-sdk-version',
        execution.config.version,
        '--expected-change-fingerprint',
        execution.syncSummary.changeFingerprint,
    ];
    pushOptionalArg(args, '--package-name', execution.config.packageName);
    pushOptionalArg(args, '--namespace', execution.config.namespace);
    pushOptionalArg(args, '--common-package', execution.config.commonPackage);
    pushOptionalArg(args, '--description', execution.config.description);
    pushOptionalArg(args, '--author', execution.config.author);
    pushOptionalArg(args, '--license', execution.config.license);
    return {
        id: 'apply-reviewed-plan',
        title: 'Apply reviewed generation plan',
        required: true,
        rationale: 'Re-run generation with the reviewed fingerprint so apply mode matches the inspected dry-run plan.',
        command: 'sdkgen',
        args,
        displayCommand: ['sdkgen', ...args].map(quoteArg).join(' '),
    };
}
function pushOptionalArg(args, flag, value) {
    if (!value) {
        return;
    }
    args.push(flag, value);
}
function canReplayViaCli(apiSpecPath) {
    const normalized = String(apiSpecPath || '').trim();
    return normalized.length > 0 && !/^<.*>$/.test(normalized);
}
function createProgrammaticReplayHandoff(summary, manualReviewHint) {
    return {
        schemaVersion: 1,
        summary,
        manualReviewHint,
        steps: [],
    };
}
function quoteArg(arg) {
    if (arg === '') {
        return '""';
    }
    return /\s/.test(arg) ? JSON.stringify(arg) : arg;
}
