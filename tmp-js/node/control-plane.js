import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parsePersistedGeneratorChangeSummary, parsePersistedGeneratorManifest, SDKWORK_GENERATOR_CHANGES_PATH, SDKWORK_GENERATOR_MANIFEST_PATH, SDKWORK_GENERATOR_NAME, SDKWORK_STATE_DIR, } from '../framework/output-sync.js';
import { GENERATE_EXECUTION_REPORT_SCHEMA_VERSION, parseGenerateExecutionReport, resolveGenerateExecutionArtifacts, SDKWORK_GENERATOR_REPORT_PATH, } from '../execution-report.js';
export function readGenerateControlPlaneSnapshot(outputPath, options = {}) {
    const artifacts = resolveGenerateExecutionArtifacts(outputPath, options.protocol);
    const artifactPresence = {
        manifest: existsSync(artifacts.manifestPath),
        changeSummary: existsSync(artifacts.changeSummaryPath),
        executionReport: existsSync(artifacts.executionReportPath),
    };
    const issues = [];
    const manifest = readArtifact('manifest', artifacts.manifestPath, parsePersistedGeneratorManifest, issues);
    const changeSummary = readArtifact('changeSummary', artifacts.changeSummaryPath, parsePersistedGeneratorChangeSummary, issues);
    const executionReport = readArtifact('executionReport', artifacts.executionReportPath, parseGenerateExecutionReport, issues);
    const hasAnyArtifact = artifactPresence.manifest
        || artifactPresence.changeSummary
        || artifactPresence.executionReport;
    const convention = !hasAnyArtifact && (options.protocol || 'http') === 'rpc'
        ? resolveRpcConventionEvidence(outputPath)
        : null;
    issues.push(...deriveConsistencyIssues({
        artifacts,
        artifactPresence,
        expectedProtocol: options.protocol || 'http',
        manifest,
        changeSummary,
        executionReport,
    }));
    const evaluation = evaluateGenerateControlPlaneSnapshot({
        artifactPresence,
        convention,
        issues,
        executionReport,
    });
    return {
        schemaVersion: 1,
        generator: SDKWORK_GENERATOR_NAME,
        evidenceMode: hasAnyArtifact ? 'control-plane' : convention ? 'convention' : 'empty',
        artifacts,
        convention,
        manifest,
        changeSummary,
        executionReport,
        issues,
        evaluation,
    };
}
function readArtifact(artifact, artifactPath, parse, issues) {
    if (!existsSync(artifactPath)) {
        return null;
    }
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(artifactPath, 'utf-8'));
    }
    catch {
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
function resolveArtifactIssueCode(value) {
    if (!isRecord(value)) {
        return 'invalid-shape';
    }
    if ('schemaVersion' in value
        && value.schemaVersion !== 1
        && value.schemaVersion !== GENERATE_EXECUTION_REPORT_SCHEMA_VERSION) {
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
export { SDKWORK_GENERATOR_CHANGES_PATH, SDKWORK_GENERATOR_MANIFEST_PATH, SDKWORK_GENERATOR_REPORT_PATH, SDKWORK_STATE_DIR, };
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function deriveConsistencyIssues(input) {
    const issues = [];
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
    if (input.manifest && input.manifest.sdk.protocol !== input.expectedProtocol) {
        issues.push({
            artifact: 'manifest',
            code: 'sdk-protocol-mismatch',
            path: input.artifacts.manifestPath,
        });
    }
    if (input.changeSummary && input.changeSummary.sdk.protocol !== input.expectedProtocol) {
        issues.push({
            artifact: 'changeSummary',
            code: 'sdk-protocol-mismatch',
            path: input.artifacts.changeSummaryPath,
        });
    }
    if (input.executionReport && input.executionReport.sdk.protocol !== input.expectedProtocol) {
        issues.push({
            artifact: 'executionReport',
            code: 'sdk-protocol-mismatch',
            path: input.artifacts.executionReportPath,
        });
    }
    if (input.changeSummary
        && input.executionReport
        && input.changeSummary.changeFingerprint !== input.executionReport.changeFingerprint) {
        issues.push({
            artifact: 'executionReport',
            code: 'fingerprint-mismatch',
            path: input.artifacts.executionReportPath,
        });
    }
    if (input.manifest
        && input.changeSummary
        && !isSameSdkMetadata(input.manifest.sdk, input.changeSummary.sdk)) {
        issues.push({
            artifact: 'changeSummary',
            code: 'sdk-metadata-mismatch',
            path: input.artifacts.changeSummaryPath,
        });
    }
    if (input.changeSummary
        && input.executionReport
        && !isSameSdkMetadata(input.changeSummary.sdk, {
            name: input.executionReport.sdk.name,
            version: input.executionReport.sdk.version,
            language: input.executionReport.sdk.language,
            sdkType: input.executionReport.sdk.sdkType,
            protocol: input.executionReport.sdk.protocol,
            packageName: input.executionReport.sdk.packageName || null,
        })) {
        issues.push({
            artifact: 'executionReport',
            code: 'sdk-metadata-mismatch',
            path: input.artifacts.executionReportPath,
        });
    }
    return issues;
}
function evaluateGenerateControlPlaneSnapshot(input) {
    const hasAnyArtifact = input.artifactPresence.manifest
        || input.artifactPresence.changeSummary
        || input.artifactPresence.executionReport;
    const reasons = Array.from(new Set(input.issues.map((issue) => issue.code)))
        .sort((left, right) => left.localeCompare(right));
    const hasFatalIssues = input.issues.some((issue) => issue.code !== 'missing-artifact');
    if (!hasAnyArtifact && input.issues.length === 0) {
        if (input.convention) {
            return {
                status: 'healthy',
                recommendedAction: 'verify',
                summary: 'RPC SDK workspace is valid by SDKWork directory and manifest convention. Generate persisted control-plane evidence only for release, CI, audit, or migration workflows.',
                reasons: ['rpc-convention-evidence'],
            };
        }
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
const SUPPORTED_RPC_CONVENTION_LANGUAGES = new Set([
    'typescript',
    'go',
    'java',
    'python',
    'rust',
]);
const RPC_PACKAGE_MANIFEST_BY_LANGUAGE = {
    typescript: 'package.json',
    dart: null,
    python: 'pyproject.toml',
    java: 'pom.xml',
    csharp: null,
    go: 'go.mod',
    rust: 'Cargo.toml',
    swift: null,
    flutter: null,
    kotlin: null,
    php: null,
    ruby: null,
};
function resolveRpcConventionEvidence(outputPath) {
    const outputRoot = resolve(outputPath);
    const languageWorkspace = basename(outputRoot);
    const familyRoot = dirname(outputRoot);
    const sdkFamily = basename(familyRoot);
    const language = parseRpcLanguageWorkspace(languageWorkspace, sdkFamily);
    if (!language) {
        return null;
    }
    const packageManifestPath = resolveRpcPackageManifestPath(outputRoot, language);
    if (!packageManifestPath) {
        return null;
    }
    const manifestPath = resolveRpcManifestPath(familyRoot, sdkFamily);
    if (!manifestPath) {
        return null;
    }
    return {
        protocol: 'rpc',
        sdkFamily,
        language,
        manifestPath,
        packageManifestPath,
    };
}
export function readGeneratedSdkEvidenceSnapshot(outputPath, options = {}) {
    return readGenerateControlPlaneSnapshot(outputPath, options);
}
function parseRpcLanguageWorkspace(languageWorkspace, sdkFamily) {
    if (!/^sdkwork-[a-z0-9]+(?:-[a-z0-9]+)*-rpc-sdk$/.test(sdkFamily)) {
        return null;
    }
    if (!languageWorkspace.startsWith(`${sdkFamily}-`)) {
        return null;
    }
    const language = languageWorkspace.slice(`${sdkFamily}-`.length);
    if (!SUPPORTED_RPC_CONVENTION_LANGUAGES.has(language)) {
        return null;
    }
    return language;
}
function resolveRpcPackageManifestPath(outputRoot, language) {
    const packageManifest = RPC_PACKAGE_MANIFEST_BY_LANGUAGE[language];
    if (!packageManifest) {
        return null;
    }
    const packageManifestPath = join(outputRoot, packageManifest);
    return existsSync(packageManifestPath) && statSync(packageManifestPath).isFile()
        ? packageManifestPath
        : null;
}
function resolveRpcManifestPath(familyRoot, sdkFamily) {
    const rpcDir = join(familyRoot, 'rpc');
    if (!existsSync(rpcDir) || !statSync(rpcDir).isDirectory()) {
        return null;
    }
    const preferredManifestPath = join(rpcDir, `${sdkFamily.replace(/-sdk$/, '')}.manifest.json`);
    if (manifestMatchesSdkFamily(preferredManifestPath, sdkFamily)) {
        return preferredManifestPath;
    }
    for (const entry of readdirSync(rpcDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.manifest.json')) {
            continue;
        }
        const manifestPath = join(rpcDir, entry.name);
        if (manifestMatchesSdkFamily(manifestPath, sdkFamily)) {
            return manifestPath;
        }
    }
    return null;
}
function manifestMatchesSdkFamily(manifestPath, sdkFamily) {
    if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
        return false;
    }
    try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        return manifest.kind === 'sdkwork.rpc.manifest' && manifest.sdkFamily === sdkFamily;
    }
    catch {
        return false;
    }
}
function isSameSdkMetadata(left, right) {
    return left.name === right.name
        && left.version === right.version
        && left.language === right.language
        && left.sdkType === right.sdkType
        && left.protocol === right.protocol
        && left.packageName === right.packageName;
}
