import { buildGenerateExecutionReport, buildGenerateFailureReport, SDKWORK_GENERATOR_REPORT_PATH, } from './execution-report.js';
export function formatGenerateSuccess(execution, options = {}) {
    const report = buildGenerateExecutionReport(execution);
    const changeImpact = report.changeImpact;
    const verificationPlan = report.verificationPlan;
    const executionDecision = report.executionDecision;
    const executionHandoff = report.executionHandoff;
    if (options.json) {
        return `${JSON.stringify(report, null, 2)}\n`;
    }
    const lines = [];
    const requestedSdkVersion = options.requestedSdkVersion;
    if (options.fixedSdkVersion) {
        lines.push(`   Fixed SDK version: ${execution.resolvedVersion.version}`);
    }
    else if (requestedSdkVersion
        && execution.resolvedVersion.version !== requestedSdkVersion) {
        lines.push(`Requested sdk version ${requestedSdkVersion} is not newer than the existing baseline. `
            + `Using ${execution.resolvedVersion.version} instead.`);
    }
    else if (!requestedSdkVersion) {
        lines.push(`   Resolved SDK version: ${execution.resolvedVersion.version}`);
        if (execution.resolvedVersion.localVersions.length > 0) {
            lines.push(`   Local baseline versions: ${execution.resolvedVersion.localVersions.join(', ')}`);
        }
        if (execution.resolvedVersion.publishedVersion) {
            lines.push(`   Published baseline version: ${execution.resolvedVersion.publishedVersion}`);
        }
    }
    if (lines.length > 0) {
        lines.push('');
    }
    lines.push(execution.syncSummary.dryRun ? 'Dry run completed.' : 'Generated successfully!');
    lines.push(`   Output: ${execution.config.outputPath}`);
    lines.push(execution.syncSummary.dryRun
        ? `   Change summary path (apply mode): ${execution.syncSummary.changeSummaryPath}`
        : `   Change summary: ${execution.syncSummary.changeSummaryPath}`);
    lines.push(execution.syncSummary.dryRun
        ? `   Execution report path (apply mode): ${SDKWORK_GENERATOR_REPORT_PATH}`
        : `   Execution report: ${SDKWORK_GENERATOR_REPORT_PATH}`);
    lines.push(`   Change fingerprint: ${execution.syncSummary.changeFingerprint}`);
    lines.push(`   Impact: ${changeImpact.areas.length > 0 ? changeImpact.areas.join(', ') : 'none'}`);
    lines.push(`   Next action: ${executionDecision.nextAction} (risk: ${executionDecision.riskLevel})`);
    lines.push(`   Files: ${execution.result.stats.totalFiles}`);
    lines.push(`   Models: ${execution.result.stats.models}`);
    lines.push(`   APIs: ${execution.result.stats.apis}`);
    lines.push('');
    lines.push(`   Generated file changes: created ${execution.syncSummary.changes.createdGeneratedFiles.length}, `
        + `updated ${execution.syncSummary.changes.updatedGeneratedFiles.length}, `
        + `unchanged ${execution.syncSummary.changes.unchangedGeneratedFiles.length}, `
        + `deleted ${execution.syncSummary.changes.deletedGeneratedFiles.length}`);
    lines.push(`   Scaffold changes: created ${execution.syncSummary.changes.scaffoldedFiles.length}, `
        + `preserved ${execution.syncSummary.changes.preservedScaffoldFiles.length}`);
    if (execution.syncSummary.dryRun) {
        lines.push('   Dry run only. No files, manifests, change summaries, or backups were written.');
    }
    if (execution.syncSummary.deletedGeneratedFiles > 0) {
        lines.push(execution.syncSummary.dryRun
            ? `   Would remove stale generated files: ${execution.syncSummary.deletedGeneratedFiles}`
            : `   Removed stale generated files: ${execution.syncSummary.deletedGeneratedFiles}`);
    }
    if (execution.syncSummary.skippedUnchangedGeneratedFiles > 0) {
        lines.push(`   Skipped unchanged generated files: ${execution.syncSummary.skippedUnchangedGeneratedFiles}`);
    }
    if (execution.syncSummary.backedUpFiles.length > 0) {
        lines.push(execution.syncSummary.dryRun
            ? `   Would back up modified generated files: ${execution.syncSummary.backedUpFiles.join(', ')}`
            : `   Backed up modified generated files: ${execution.syncSummary.backedUpFiles.join(', ')}`);
    }
    if (execution.syncSummary.preservedLegacyFiles) {
        lines.push('   Existing unmanaged files were preserved because no prior generator manifest was found.');
    }
    lines.push('');
    if (!verificationPlan.shouldRun) {
        lines.push(`Verification plan: skipped. ${verificationPlan.summary}`);
    }
    else {
        lines.push(`Verification plan (${verificationPlan.runPhase}):`);
        lines.push(`   ${verificationPlan.summary}`);
        for (const step of verificationPlan.steps) {
            lines.push(`   [${step.required ? 'required' : 'recommended'}] ${step.displayCommand}`);
        }
    }
    if (executionHandoff.manualReviewHint || executionHandoff.steps.length > 0) {
        lines.push('');
        lines.push(executionHandoff.steps.length > 0 ? 'Next commands:' : 'Next steps:');
        lines.push(`   ${executionHandoff.summary}`);
        if (executionHandoff.manualReviewHint) {
            lines.push(`   ${executionHandoff.manualReviewHint}`);
        }
        for (const step of executionHandoff.steps) {
            lines.push(`   [${step.required ? 'required' : 'recommended'}] ${step.displayCommand}`);
        }
    }
    if (execution.result.warnings.length > 0) {
        lines.push('');
        lines.push('Warnings:');
        for (const warning of execution.result.warnings) {
            lines.push(`   - ${warning}`);
        }
    }
    return `${lines.join('\n')}\n`;
}
export function formatGenerateFailure(error, options = {}) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
        const report = buildGenerateFailureReport(error, {
            outputPath: options.outputPath,
        });
        return `${JSON.stringify(report, null, 2)}\n`;
    }
    return `Failed to generate SDK: ${String(error)}`;
}
