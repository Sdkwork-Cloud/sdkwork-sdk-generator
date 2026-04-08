import { existsSync, readFileSync } from 'node:fs';

import {
  parsePersistedGeneratorChangeSummary,
  parsePersistedGeneratorManifest,
  SDKWORK_GENERATOR_CHANGES_PATH,
  SDKWORK_GENERATOR_MANIFEST_PATH,
  SDKWORK_GENERATOR_NAME,
  SDKWORK_STATE_DIR,
  type PersistedGeneratorChangeSummary,
  type PersistedGeneratorManifest,
} from '../framework/output-sync.js';
import {
  GENERATE_EXECUTION_REPORT_SCHEMA_VERSION,
  parseGenerateExecutionReport,
  resolveGenerateExecutionArtifacts,
  SDKWORK_GENERATOR_REPORT_PATH,
  type GenerateExecutionReport,
  type ResolvedGenerateExecutionArtifacts,
} from '../execution-report.js';

export interface GenerateControlPlaneIssue {
  artifact: 'manifest' | 'changeSummary' | 'executionReport';
  code:
    | 'invalid-json'
    | 'unsupported-schema-version'
    | 'invalid-generator'
    | 'invalid-shape'
    | 'missing-artifact'
    | 'fingerprint-mismatch'
    | 'sdk-metadata-mismatch';
  path: string;
}

export interface GenerateControlPlaneEvaluation {
  status: 'empty' | 'healthy' | 'degraded' | 'invalid';
  recommendedAction: 'generate' | 'review' | 'apply' | 'verify' | 'complete' | 'skip';
  summary: string;
  reasons: string[];
}

export interface GenerateControlPlaneSnapshot {
  schemaVersion: 1;
  generator: typeof SDKWORK_GENERATOR_NAME;
  artifacts: ResolvedGenerateExecutionArtifacts;
  manifest: PersistedGeneratorManifest | null;
  changeSummary: PersistedGeneratorChangeSummary | null;
  executionReport: GenerateExecutionReport | null;
  issues: GenerateControlPlaneIssue[];
  evaluation: GenerateControlPlaneEvaluation;
}

export function readGenerateControlPlaneSnapshot(outputPath: string): GenerateControlPlaneSnapshot {
  const artifacts = resolveGenerateExecutionArtifacts(outputPath);
  const artifactPresence = {
    manifest: existsSync(artifacts.manifestPath),
    changeSummary: existsSync(artifacts.changeSummaryPath),
    executionReport: existsSync(artifacts.executionReportPath),
  };
  const issues: GenerateControlPlaneIssue[] = [];

  const manifest = readArtifact(
    'manifest',
    artifacts.manifestPath,
    parsePersistedGeneratorManifest,
    issues
  );
  const changeSummary = readArtifact(
    'changeSummary',
    artifacts.changeSummaryPath,
    parsePersistedGeneratorChangeSummary,
    issues
  );
  const executionReport = readArtifact(
    'executionReport',
    artifacts.executionReportPath,
    parseGenerateExecutionReport,
    issues
  );
  issues.push(...deriveConsistencyIssues({
    artifacts,
    artifactPresence,
    manifest,
    changeSummary,
    executionReport,
  }));
  const evaluation = evaluateGenerateControlPlaneSnapshot({
    artifactPresence,
    issues,
    executionReport,
  });

  return {
    schemaVersion: 1,
    generator: SDKWORK_GENERATOR_NAME,
    artifacts,
    manifest,
    changeSummary,
    executionReport,
    issues,
    evaluation,
  };
}

function readArtifact<T>(
  artifact: GenerateControlPlaneIssue['artifact'],
  artifactPath: string,
  parse: (value: unknown) => T | null,
  issues: GenerateControlPlaneIssue[]
): T | null {
  if (!existsSync(artifactPath)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(artifactPath, 'utf-8'));
  } catch {
    issues.push({
      artifact,
      code: 'invalid-json',
      path: artifactPath,
    });
    return null;
  }

  const value = parse(parsed);
  if (value !== null) {
    return value;
  }

  issues.push({
    artifact,
    code: resolveArtifactIssueCode(parsed),
    path: artifactPath,
  });
  return null;
}

function resolveArtifactIssueCode(
  value: unknown
): GenerateControlPlaneIssue['code'] {
  if (!isRecord(value)) {
    return 'invalid-shape';
  }
  if (
    'schemaVersion' in value
    && value.schemaVersion !== 1
    && value.schemaVersion !== GENERATE_EXECUTION_REPORT_SCHEMA_VERSION
  ) {
    return 'unsupported-schema-version';
  }
  if ('schemaVersion' in value && value.schemaVersion !== 1) {
    return 'unsupported-schema-version';
  }
  if ('generator' in value && value.generator !== SDKWORK_GENERATOR_NAME) {
    return 'invalid-generator';
  }
  return 'invalid-shape';
}

export {
  SDKWORK_GENERATOR_CHANGES_PATH,
  SDKWORK_GENERATOR_MANIFEST_PATH,
  SDKWORK_GENERATOR_REPORT_PATH,
  SDKWORK_STATE_DIR,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function deriveConsistencyIssues(input: {
  artifacts: ResolvedGenerateExecutionArtifacts;
  artifactPresence: {
    manifest: boolean;
    changeSummary: boolean;
    executionReport: boolean;
  };
  manifest: PersistedGeneratorManifest | null;
  changeSummary: PersistedGeneratorChangeSummary | null;
  executionReport: GenerateExecutionReport | null;
}): GenerateControlPlaneIssue[] {
  const issues: GenerateControlPlaneIssue[] = [];
  const hasAnyArtifact = input.artifactPresence.manifest
    || input.artifactPresence.changeSummary
    || input.artifactPresence.executionReport;

  if (hasAnyArtifact) {
    if (!input.artifactPresence.manifest) {
      issues.push({
        artifact: 'manifest',
        code: 'missing-artifact',
        path: input.artifacts.manifestPath,
      });
    }
    if (!input.artifactPresence.changeSummary) {
      issues.push({
        artifact: 'changeSummary',
        code: 'missing-artifact',
        path: input.artifacts.changeSummaryPath,
      });
    }
    if (!input.artifactPresence.executionReport) {
      issues.push({
        artifact: 'executionReport',
        code: 'missing-artifact',
        path: input.artifacts.executionReportPath,
      });
    }
  }

  if (
    input.changeSummary
    && input.executionReport
    && input.changeSummary.changeFingerprint !== input.executionReport.changeFingerprint
  ) {
    issues.push({
      artifact: 'executionReport',
      code: 'fingerprint-mismatch',
      path: input.artifacts.executionReportPath,
    });
  }

  if (
    input.manifest
    && input.changeSummary
    && !isSameSdkMetadata(input.manifest.sdk, input.changeSummary.sdk)
  ) {
    issues.push({
      artifact: 'changeSummary',
      code: 'sdk-metadata-mismatch',
      path: input.artifacts.changeSummaryPath,
    });
  }

  if (
    input.changeSummary
    && input.executionReport
    && !isSameSdkMetadata(input.changeSummary.sdk, {
      name: input.executionReport.sdk.name,
      version: input.executionReport.sdk.version,
      language: input.executionReport.sdk.language as typeof input.changeSummary.sdk.language,
      sdkType: input.executionReport.sdk.sdkType as typeof input.changeSummary.sdk.sdkType,
      packageName: input.executionReport.sdk.packageName || null,
    })
  ) {
    issues.push({
      artifact: 'executionReport',
      code: 'sdk-metadata-mismatch',
      path: input.artifacts.executionReportPath,
    });
  }

  return issues;
}

function evaluateGenerateControlPlaneSnapshot(input: {
  artifactPresence: {
    manifest: boolean;
    changeSummary: boolean;
    executionReport: boolean;
  };
  issues: GenerateControlPlaneIssue[];
  executionReport: GenerateExecutionReport | null;
}): GenerateControlPlaneEvaluation {
  const hasAnyArtifact = input.artifactPresence.manifest
    || input.artifactPresence.changeSummary
    || input.artifactPresence.executionReport;
  const reasons = Array.from(new Set(input.issues.map((issue) => issue.code)))
    .sort((left, right) => left.localeCompare(right));
  const hasFatalIssues = input.issues.some((issue) => issue.code !== 'missing-artifact');

  if (!hasAnyArtifact && input.issues.length === 0) {
    return {
      status: 'empty',
      recommendedAction: 'generate',
      summary: 'No persisted control-plane artifacts were found for this SDK output.',
      reasons: ['no-control-plane-artifacts'],
    };
  }

  if (hasFatalIssues) {
    return {
      status: 'invalid',
      recommendedAction: 'review',
      summary: 'Persisted control-plane artifacts are invalid or inconsistent. Review or regenerate before automation continues.',
      reasons,
    };
  }

  if (input.issues.length > 0) {
    return {
      status: 'degraded',
      recommendedAction: 'review',
      summary: 'Persisted control-plane artifacts are incomplete. Review or regenerate before automation continues.',
      reasons,
    };
  }

  if (input.executionReport) {
    return {
      status: 'healthy',
      recommendedAction: input.executionReport.executionDecision.nextAction,
      summary: input.executionReport.executionDecision.summary,
      reasons: input.executionReport.executionDecision.reasons,
    };
  }

  return {
    status: 'degraded',
    recommendedAction: 'review',
    summary: 'Persisted control-plane artifacts are incomplete because no valid execution report was found.',
    reasons: ['missing-execution-report'],
  };
}

function isSameSdkMetadata(
  left: PersistedGeneratorManifest['sdk'],
  right: PersistedGeneratorManifest['sdk']
): boolean {
  return left.name === right.name
    && left.version === right.version
    && left.language === right.language
    && left.sdkType === right.sdkType
    && left.packageName === right.packageName;
}
