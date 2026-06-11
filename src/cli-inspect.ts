import { GENERATE_EXECUTION_REPORT_SCHEMA_VERSION } from './execution-report.js';
import { SDKWORK_GENERATOR_NAME } from './framework/output-sync.js';
import type { SdkProtocol } from './framework/types.js';
import {
  readGeneratedSdkEvidenceSnapshot,
  type GeneratedSdkEvidenceSnapshot,
} from './node/control-plane.js';

export interface InspectCommandOptions {
  output: string;
  protocol?: SdkProtocol;
}

export interface InspectOutputOptions extends InspectGateOptions {
  json?: boolean;
}

export interface InspectGateOptions {
  failOn?: 'empty' | 'degraded' | 'invalid';
  requireAction?: GeneratedSdkEvidenceSnapshot['evaluation']['recommendedAction'];
}

export interface InspectGateResult {
  passed: boolean;
  exitCode: 0 | 1;
  reasons: string[];
  failOn?: InspectGateOptions['failOn'];
  requireAction?: InspectGateOptions['requireAction'];
}

interface InspectFailureReport {
  schemaVersion: typeof GENERATE_EXECUTION_REPORT_SCHEMA_VERSION;
  generator: typeof SDKWORK_GENERATOR_NAME;
  status: 'error';
  command: 'inspect';
  message: string;
}

const INSPECT_FAIL_ON_STATUSES = ['empty', 'degraded', 'invalid'] as const;
const INSPECT_REQUIRED_ACTIONS = ['generate', 'review', 'apply', 'verify', 'complete', 'skip'] as const;

export function runInspectCommand(options: InspectCommandOptions): GeneratedSdkEvidenceSnapshot {
  return readGeneratedSdkEvidenceSnapshot(options.output, {
    protocol: options.protocol,
  });
}

export function formatInspectSuccess(
  snapshot: GeneratedSdkEvidenceSnapshot,
  options: InspectOutputOptions = {}
): string {
  const gate = resolveInspectGate(snapshot, options);
  if (options.json) {
    return `${JSON.stringify({
      ...snapshot,
      gate,
    }, null, 2)}\n`;
  }

  const lines: string[] = [];
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
  } else {
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

export function formatInspectFailure(
  error: unknown,
  options: InspectOutputOptions = {}
): string {
  const message = error instanceof Error ? error.message : String(error);
  if (options.json) {
    const report: InspectFailureReport = {
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

export function resolveInspectGate(
  snapshot: GeneratedSdkEvidenceSnapshot,
  options: InspectGateOptions = {}
): InspectGateResult {
  assertValidInspectGateOptions(options);
  const reasons: string[] = [];

  if (options.failOn && statusSeverity(snapshot.evaluation.status) >= statusSeverity(options.failOn)) {
    reasons.push(`status-threshold:${options.failOn}`);
  }

  if (
    options.requireAction
    && snapshot.evaluation.recommendedAction !== options.requireAction
  ) {
    reasons.push(
      `required-action-mismatch:${options.requireAction}!=${snapshot.evaluation.recommendedAction}`
    );
  }

  return {
    passed: reasons.length === 0,
    exitCode: reasons.length === 0 ? 0 : 1,
    reasons,
    failOn: options.failOn,
    requireAction: options.requireAction,
  };
}

function assertValidInspectGateOptions(options: InspectGateOptions): void {
  if (options.failOn && !INSPECT_FAIL_ON_STATUSES.includes(options.failOn)) {
    throw new Error(`Unsupported inspect fail-on status: ${options.failOn}`);
  }

  if (options.requireAction && !INSPECT_REQUIRED_ACTIONS.includes(options.requireAction)) {
    throw new Error(`Unsupported inspect required action: ${options.requireAction}`);
  }
}

function statusSeverity(
  status: NonNullable<InspectGateOptions['failOn']> | GeneratedSdkEvidenceSnapshot['evaluation']['status']
): number {
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
