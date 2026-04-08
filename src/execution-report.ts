import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { GenerateCommandExecution } from './cli-runner.js';
import { analyzeChangeImpact, type ChangeImpactSummary } from './change-impact.js';
import { buildExecutionDecisionFromContext, type ExecutionDecision } from './execution-decision.js';
import { buildExecutionHandoff, type ExecutionHandoff } from './execution-handoff.js';
import {
  SDKWORK_GENERATOR_CHANGES_PATH,
  SDKWORK_GENERATOR_MANIFEST_PATH,
  SDKWORK_GENERATOR_NAME,
  SDKWORK_MANUAL_BACKUP_DIR,
  SDKWORK_STATE_DIR,
} from './framework/output-sync.js';
import { buildVerificationPlan, type VerificationPlan } from './verification-plan.js';

export const SDKWORK_GENERATOR_REPORT_PATH = '.sdkwork/sdkwork-generator-report.json';
export const GENERATE_EXECUTION_REPORT_SCHEMA_VERSION = 1;

export interface GenerateExecutionArtifacts {
  stateDir: typeof SDKWORK_STATE_DIR;
  manifestPath: typeof SDKWORK_GENERATOR_MANIFEST_PATH;
  changeSummaryPath: typeof SDKWORK_GENERATOR_CHANGES_PATH;
  executionReportPath: typeof SDKWORK_GENERATOR_REPORT_PATH;
  manualBackupDir: typeof SDKWORK_MANUAL_BACKUP_DIR;
}

export interface ResolvedGenerateExecutionArtifacts {
  stateDir: string;
  manifestPath: string;
  changeSummaryPath: string;
  executionReportPath: string;
  manualBackupDir: string;
}

export interface GenerateExecutionReport {
  schemaVersion: typeof GENERATE_EXECUTION_REPORT_SCHEMA_VERSION;
  generator: typeof SDKWORK_GENERATOR_NAME;
  artifacts: GenerateExecutionArtifacts;
  status: 'ok';
  mode: 'apply' | 'dry-run';
  hasChanges: boolean;
  hasDestructiveChanges: boolean;
  changeFingerprint: string;
  changeImpact: ChangeImpactSummary;
  executionDecision: ExecutionDecision;
  executionHandoff: ExecutionHandoff;
  verificationPlan: VerificationPlan;
  sdk: {
    name: string;
    version: string;
    language: string;
    sdkType: string;
    outputPath: string;
    packageName?: string;
  };
  versioning: {
    resolvedVersion: string;
    localVersions: string[];
    publishedVersion?: string;
  };
  stats: GenerateCommandExecution['result']['stats'];
  warnings: string[];
  syncSummary: GenerateCommandExecution['syncSummary'] & {
    impact: ChangeImpactSummary;
    verificationPlan: VerificationPlan;
    executionDecision: ExecutionDecision;
  };
}

export interface GenerateFailureReport {
  schemaVersion: typeof GENERATE_EXECUTION_REPORT_SCHEMA_VERSION;
  generator: typeof SDKWORK_GENERATOR_NAME;
  status: 'error';
  message: string;
  artifacts?: GenerateExecutionArtifacts;
}

export function buildGenerateExecutionReport(
  execution: GenerateCommandExecution
): GenerateExecutionReport {
  const changeImpact = resolveChangeImpact(execution);
  const verificationPlan = buildVerificationPlan(execution);
  const executionDecision = resolveExecutionDecision(execution, changeImpact, verificationPlan);
  const executionHandoff = buildExecutionHandoff(execution, executionDecision, verificationPlan);

  return {
    schemaVersion: GENERATE_EXECUTION_REPORT_SCHEMA_VERSION,
    generator: SDKWORK_GENERATOR_NAME,
    artifacts: buildGenerateExecutionArtifacts(),
    status: 'ok',
    mode: execution.syncSummary.dryRun ? 'dry-run' : 'apply',
    hasChanges: hasAnyChanges(execution),
    hasDestructiveChanges: execution.syncSummary.deletedGeneratedFiles > 0,
    changeFingerprint: execution.syncSummary.changeFingerprint,
    changeImpact,
    executionDecision,
    executionHandoff,
    verificationPlan,
    sdk: {
      name: execution.config.name,
      version: execution.config.version,
      language: execution.config.language,
      sdkType: execution.config.sdkType,
      outputPath: execution.config.outputPath,
      packageName: execution.config.packageName,
    },
    versioning: {
      resolvedVersion: execution.resolvedVersion.version,
      localVersions: execution.resolvedVersion.localVersions,
      publishedVersion: execution.resolvedVersion.publishedVersion,
    },
    stats: execution.result.stats,
    warnings: execution.result.warnings,
    syncSummary: {
      ...execution.syncSummary,
      impact: changeImpact,
      verificationPlan: execution.syncSummary.verificationPlan || verificationPlan,
      executionDecision: execution.syncSummary.executionDecision || executionDecision,
    },
  };
}

export function persistGenerateExecutionReport(
  execution: GenerateCommandExecution
): GenerateExecutionReport | null {
  if (execution.syncSummary.dryRun) {
    return null;
  }

  const report = buildGenerateExecutionReport(execution);
  const artifacts = resolveGenerateExecutionArtifacts(execution.config.outputPath);
  mkdirSync(dirname(artifacts.executionReportPath), { recursive: true });
  writeFileSync(artifacts.executionReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  return report;
}

export function buildGenerateFailureReport(
  error: unknown,
  options: {
    outputPath?: string;
  } = {}
): GenerateFailureReport {
  const message = error instanceof Error ? error.message : String(error);
  return {
    schemaVersion: GENERATE_EXECUTION_REPORT_SCHEMA_VERSION,
    generator: SDKWORK_GENERATOR_NAME,
    status: 'error',
    message,
    ...(options.outputPath ? { artifacts: buildGenerateExecutionArtifacts() } : {}),
  };
}

export function buildGenerateExecutionArtifacts(): GenerateExecutionArtifacts {
  return {
    stateDir: SDKWORK_STATE_DIR,
    manifestPath: SDKWORK_GENERATOR_MANIFEST_PATH,
    changeSummaryPath: SDKWORK_GENERATOR_CHANGES_PATH,
    executionReportPath: SDKWORK_GENERATOR_REPORT_PATH,
    manualBackupDir: SDKWORK_MANUAL_BACKUP_DIR,
  };
}

export function resolveGenerateExecutionArtifacts(
  outputPath: string
): ResolvedGenerateExecutionArtifacts {
  const outputRoot = resolve(outputPath);
  const artifacts = buildGenerateExecutionArtifacts();
  return {
    stateDir: resolve(outputRoot, artifacts.stateDir),
    manifestPath: resolve(outputRoot, artifacts.manifestPath),
    changeSummaryPath: resolve(outputRoot, artifacts.changeSummaryPath),
    executionReportPath: resolve(outputRoot, artifacts.executionReportPath),
    manualBackupDir: resolve(outputRoot, artifacts.manualBackupDir),
  };
}

export function readGenerateExecutionReport(outputPath: string): GenerateExecutionReport | null {
  const artifacts = resolveGenerateExecutionArtifacts(outputPath);
  if (!existsSync(artifacts.executionReportPath)) {
    return null;
  }
  try {
    return parseGenerateExecutionReport(JSON.parse(readFileSync(artifacts.executionReportPath, 'utf-8')));
  } catch {
    return null;
  }
}

export function parseGenerateExecutionReport(value: unknown): GenerateExecutionReport | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    value.schemaVersion !== GENERATE_EXECUTION_REPORT_SCHEMA_VERSION
    || value.generator !== SDKWORK_GENERATOR_NAME
    || value.status !== 'ok'
    || !isRecord(value.artifacts)
  ) {
    return null;
  }
  return value as unknown as GenerateExecutionReport;
}

function resolveChangeImpact(execution: GenerateCommandExecution): ChangeImpactSummary {
  return execution.syncSummary.impact || analyzeChangeImpact(execution.syncSummary.changes);
}

function resolveExecutionDecision(
  execution: GenerateCommandExecution,
  changeImpact: ChangeImpactSummary,
  verificationPlan: VerificationPlan
): ExecutionDecision {
  return execution.syncSummary.executionDecision || buildExecutionDecisionFromContext({
    language: execution.config.language,
    outputPath: execution.config.outputPath,
    dryRun: execution.syncSummary.dryRun,
    preservedLegacyFiles: execution.syncSummary.preservedLegacyFiles,
    changes: execution.syncSummary.changes,
    impact: changeImpact,
    verificationPlan,
  });
}

function hasAnyChanges(execution: GenerateCommandExecution): boolean {
  const { changes } = execution.syncSummary;
  return changes.createdGeneratedFiles.length > 0
    || changes.updatedGeneratedFiles.length > 0
    || changes.deletedGeneratedFiles.length > 0
    || changes.scaffoldedFiles.length > 0
    || changes.backedUpFiles.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
