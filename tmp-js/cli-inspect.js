import { GENERATE_EXECUTION_REPORT_SCHEMA_VERSION } from './execution-report.js';
import { SDKWORK_GENERATOR_NAME } from './framework/output-sync.js';
import { readGeneratedSdkEvidenceSnapshot, } from './node/control-plane.js';
const INSPECT_FAIL_ON_STATUSES = ['empty', 'degraded', 'invalid'];
const INSPECT_REQUIRED_ACTIONS = ['generate', 'review', 'apply', 'verify', 'complete', 'skip'];
export function runInspectCommand(options) {
    return readGeneratedSdkEvidenceSnapshot(options.output, {
        protocol: options.protocol,
    });
}
export function formatInspectSuccess(snapshot, options = {}) {
    const gate = resolveInspectGate(snapshot, options);
    if (options.json) {
        return `${JSON.stringify({
            ...snapshot,
            gate,
        }, null, 2)}\n`;
    }
    const lines = [];
    const evidenceMode = snapshot.evidenceMode ?? 'control-plane';
    lines.push(`SDK evidence status: ${snapshot.evaluation.status}`);
    lines.push(`SDK evidence mode: ${evidenceMode}`);
    lines.push(`Recommended action: ${snapshot.evaluation.recommendedAction}`);
    lines.push(`Summary: ${snapshot.evaluation.summary}`);
    lines.push(`Gate: ${gate.passed ? 'pass' : 'fail'}`);
    lines.push('');
    if (evidenceMode === 'convention' && snapshot.convention) {
        lines.push('RPC convention evidence:');
        lines.push(`  SDK family: ${snapshot.convention.sdkFamily}`);
        lines.push(`  Language: ${snapshot.convention.language}`);
        lines.push(`  RPC manifest: ${snapshot.convention.manifestPath}`);
        lines.push(`  Package manifest: ${snapshot.convention.packageManifestPath}`);
    }
    else {
        lines.push(`State dir: ${snapshot.artifacts.stateDir}`);
        lines.push(`Manifest: ${snapshot.manifest ? 'present' : 'missing'} -> ${snapshot.artifacts.manifestPath}`);
        lines.push(`Change summary: ${snapshot.changeSummary ? 'present' : 'missing'} -> ${snapshot.artifacts.changeSummaryPath}`);
        lines.push(`Execution report: ${snapshot.executionReport ? 'present' : 'missing'} -> ${snapshot.artifacts.executionReportPath}`);
    }
    if (snapshot.evaluation.reasons.length > 0) {
        lines.push('');
        lines.push(`Reasons: ${snapshot.evaluation.reasons.join(', ')}`);
    }
    if (snapshot.issues.length > 0) {
        lines.push('');
        lines.push('Issues:');
        for (const issue of snapshot.issues) {
            lines.push(`  - ${issue.artifact} ${issue.code}: ${issue.path}`);
        }
    }
    if (gate.reasons.length > 0) {
        lines.push('');
        lines.push(`Gate reasons: ${gate.reasons.join(', ')}`);
    }
    return `${lines.join('\n')}\n`;
}
export function formatInspectFailure(error, options = {}) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
        const report = {
            schemaVersion: GENERATE_EXECUTION_REPORT_SCHEMA_VERSION,
            generator: SDKWORK_GENERATOR_NAME,
            status: 'error',
            command: 'inspect',
            message,
        };
        return `${JSON.stringify(report, null, 2)}\n`;
    }
    return `Failed to inspect SDK evidence: ${String(error)}`;
}
export function resolveInspectGate(snapshot, options = {}) {
    assertValidInspectGateOptions(options);
    const reasons = [];
    if (options.failOn && statusSeverity(snapshot.evaluation.status) >= statusSeverity(options.failOn)) {
        reasons.push(`status-threshold:${options.failOn}`);
    }
    if (options.requireAction
        && snapshot.evaluation.recommendedAction !== options.requireAction) {
        reasons.push(`required-action-mismatch:${options.requireAction}!=${snapshot.evaluation.recommendedAction}`);
    }
    return {
        passed: reasons.length === 0,
        exitCode: reasons.length === 0 ? 0 : 1,
        reasons,
        failOn: options.failOn,
        requireAction: options.requireAction,
    };
}
function assertValidInspectGateOptions(options) {
    if (options.failOn && !INSPECT_FAIL_ON_STATUSES.includes(options.failOn)) {
        throw new Error(`Unsupported inspect fail-on status: ${options.failOn}`);
    }
    if (options.requireAction && !INSPECT_REQUIRED_ACTIONS.includes(options.requireAction)) {
        throw new Error(`Unsupported inspect required action: ${options.requireAction}`);
    }
}
function statusSeverity(status) {
    switch (status) {
        case 'empty':
            return 1;
        case 'degraded':
            return 2;
        case 'invalid':
            return 3;
        case 'healthy':
        default:
            return 0;
    }
}
