import { existsSync, mkdirSync, readFileSync, writeFileSync, } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildGenerateExecutionArtifacts, buildGenerateExecutionReport, resolveGenerateExecutionArtifacts, } from './execution-report.js';
import { parsePersistedGeneratorManifest, syncGeneratedOutput, } from './framework/output-sync.js';
import { detectVersionFromProject, normalizeVersion, } from './framework/versioning.js';
import { getSupportedLanguages, getSupportedSdkTypes } from './index.js';
const DEFAULT_INIT_VERSION = '1.0.0';
const INIT_GENERATED_PATHS = ['README.md', 'sdkwork-sdk.json'];
const INIT_SCAFFOLD_PATHS = ['custom/README.md'];
const INIT_SPEC = {
    openapi: '3.0.3',
    info: {
        title: 'SDK workspace scaffold',
        version: '1.0.0',
    },
    paths: {},
};
export async function runInitCommand(options) {
    const language = (options.language || 'typescript');
    const sdkType = (options.type || 'backend');
    const supportedLanguages = getSupportedLanguages();
    if (!supportedLanguages.includes(language)) {
        throw new Error(`Unsupported language: ${language}`);
    }
    const supportedSdkTypes = getSupportedSdkTypes();
    if (!supportedSdkTypes.includes(sdkType)) {
        throw new Error(`Unsupported SDK type: ${sdkType}. Supported: ${supportedSdkTypes.join(', ')}`);
    }
    const outputPath = resolve(options.output);
    assertSafeInitTarget(outputPath);
    const resolvedVersion = resolveInitVersion({
        outputPath,
        language,
        requestedVersion: options.sdkVersion,
    });
    const config = {
        name: options.name,
        version: resolvedVersion.version,
        description: options.description,
        author: options.author,
        license: options.license || 'MIT',
        language,
        sdkType,
        outputPath,
        apiSpecPath: '<sdkgen-init>',
        baseUrl: '',
        apiPrefix: '',
        packageName: options.packageName,
        namespace: options.namespace,
        generateReadme: true,
    };
    const result = {
        files: buildInitFiles(config),
        errors: [],
        warnings: [],
        stats: {
            totalFiles: 3,
            models: 0,
            apis: 0,
            types: 0,
        },
    };
    const rawSyncSummary = syncGeneratedOutput(outputPath, result.files, {
        cleanGenerated: false,
        dryRun: options.dryRun === true,
        expectedChangeFingerprint: options.expectedChangeFingerprint,
        sdk: {
            name: config.name,
            version: config.version,
            language: config.language,
            sdkType: config.sdkType,
            packageName: config.packageName,
        },
    });
    const syncSummary = buildInitSyncSummary(rawSyncSummary);
    const execution = {
        config,
        spec: INIT_SPEC,
        result,
        resolvedVersion,
        syncSummary,
    };
    persistInitExecutionReport(execution);
    return execution;
}
export function buildInitExecutionReport(execution) {
    const report = buildGenerateExecutionReport(execution);
    return {
        ...report,
        executionHandoff: buildInitExecutionHandoff(execution),
    };
}
export function formatInitSuccess(execution, options = {}) {
    const report = buildInitExecutionReport(execution);
    if (options.json) {
        return `${JSON.stringify(report, null, 2)}\n`;
    }
    const lines = [];
    if (options.requestedSdkVersion) {
        lines.push(`   SDK version: ${execution.resolvedVersion.version}`);
    }
    else {
        lines.push(`   Resolved SDK version: ${execution.resolvedVersion.version}`);
    }
    lines.push('');
    lines.push(execution.syncSummary.dryRun ? 'Init dry run completed.' : 'SDK workspace initialized.');
    lines.push(`   Output: ${execution.config.outputPath}`);
    lines.push(`   Change summary: ${execution.syncSummary.changeSummaryPath}`);
    lines.push(`   Execution report: ${resolveGenerateExecutionArtifacts(execution.config.outputPath).executionReportPath}`);
    lines.push(`   Change fingerprint: ${execution.syncSummary.changeFingerprint}`);
    lines.push(`   Next action: ${report.executionDecision.nextAction} (risk: ${report.executionDecision.riskLevel})`);
    lines.push('');
    lines.push(`   File changes: created ${execution.syncSummary.changes.createdGeneratedFiles.length}, `
        + `updated ${execution.syncSummary.changes.updatedGeneratedFiles.length}, `
        + `scaffolded ${execution.syncSummary.changes.scaffoldedFiles.length}, `
        + `unchanged ${execution.syncSummary.changes.unchangedGeneratedFiles.length}`);
    if (execution.syncSummary.dryRun) {
        lines.push('   Dry run only. No files, manifests, change summaries, or reports were written.');
    }
    if (report.executionHandoff.steps.length > 0) {
        lines.push('');
        lines.push('Next commands:');
        lines.push(`   ${report.executionHandoff.summary}`);
        for (const step of report.executionHandoff.steps) {
            lines.push(`   [${step.required ? 'required' : 'recommended'}] ${step.displayCommand}`);
        }
    }
    return `${lines.join('\n')}\n`;
}
export function formatInitFailure(error, options = {}) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
        return `${JSON.stringify({
            schemaVersion: 1,
            generator: '@sdkwork/sdk-generator',
            status: 'error',
            command: 'init',
            message,
            ...(options.outputPath ? { artifacts: buildGenerateExecutionArtifacts() } : {}),
        }, null, 2)}\n`;
    }
    return `Failed to initialize SDK workspace: ${message}`;
}
function persistInitExecutionReport(execution) {
    if (execution.syncSummary.dryRun) {
        return null;
    }
    const report = buildInitExecutionReport(execution);
    const artifacts = resolveGenerateExecutionArtifacts(execution.config.outputPath);
    mkdirSync(dirname(artifacts.executionReportPath), { recursive: true });
    writeFileSync(artifacts.executionReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
    return report;
}
function buildInitFiles(config) {
    return [
        {
            path: 'README.md',
            content: buildInitReadme(config),
            language: config.language,
            description: 'SDK workspace scaffold README',
        },
        {
            path: 'sdkwork-sdk.json',
            content: `${JSON.stringify({
                name: config.name,
                version: config.version,
                language: config.language,
                sdkType: config.sdkType,
                packageName: config.packageName || null,
                generator: '@sdkwork/sdk-generator',
            }, null, 2)}\n`,
            language: config.language,
            description: 'SDK workspace metadata',
        },
        {
            path: 'custom/README.md',
            content: [
                '# Custom Code',
                '',
                'Keep hand-written wrappers, adapters, and orchestration here.',
                'Files outside this directory may be regenerated and overwritten.',
                'If you need to extend generated behavior, prefer composition from `custom/` instead of editing generated files directly.',
                '',
            ].join('\n'),
            language: config.language,
            description: 'Custom extension boundary',
            ownership: 'scaffold',
            overwriteStrategy: 'if-missing',
        },
    ];
}
function buildInitReadme(config) {
    const lines = [
        `# ${config.name}`,
        '',
        'Minimal SDK workspace scaffold created by `sdkgen init`.',
        '',
        '## Scaffold',
        '',
        `- Language: ${config.language}`,
        `- SDK type: ${config.sdkType}`,
        `- Version: ${config.version}`,
    ];
    if (config.packageName) {
        lines.push(`- Package name: ${config.packageName}`);
    }
    if (config.namespace) {
        lines.push(`- Namespace: ${config.namespace}`);
    }
    lines.push('');
    lines.push('## Next');
    lines.push('');
    lines.push('1. Prepare an OpenAPI 3.x specification.');
    lines.push(`2. Run \`${buildGenerateCommandPreview(config)}\`.`);
    lines.push('3. Keep hand-written extensions in `custom/` so regeneration stays safe.');
    lines.push('4. Run `sdkgen inspect -o .` after generation when you need a machine-readable control-plane snapshot.');
    lines.push('');
    return lines.join('\n');
}
function buildGenerateCommandPreview(config) {
    const args = [
        'sdkgen',
        'generate',
        '-i',
        './openapi.json',
        '-o',
        '.',
        '-n',
        config.name,
        '-l',
        config.language,
        '-t',
        config.sdkType,
    ];
    pushOptionalArg(args, '--package-name', config.packageName);
    pushOptionalArg(args, '--namespace', config.namespace);
    pushOptionalArg(args, '--description', config.description);
    return args.map(quoteArg).join(' ');
}
function resolveInitVersion(input) {
    if (input.requestedVersion) {
        const normalizedRequested = normalizeVersion(input.requestedVersion);
        if (!normalizedRequested) {
            throw new Error(`Invalid requested sdk version: "${input.requestedVersion}"`);
        }
        return {
            version: normalizedRequested,
            localVersions: [],
            publishedVersion: undefined,
        };
    }
    const existingVersion = detectVersionFromProject(input.language, input.outputPath);
    if (existingVersion) {
        return {
            version: existingVersion,
            localVersions: [existingVersion],
            publishedVersion: undefined,
        };
    }
    return {
        version: DEFAULT_INIT_VERSION,
        localVersions: [],
        publishedVersion: undefined,
    };
}
function assertSafeInitTarget(outputPath) {
    const artifacts = resolveGenerateExecutionArtifacts(outputPath);
    const hasAnyControlPlaneArtifact = existsSync(artifacts.manifestPath)
        || existsSync(artifacts.changeSummaryPath)
        || existsSync(artifacts.executionReportPath);
    if (existsSync(artifacts.manifestPath)) {
        const parsed = parseExistingManifest(artifacts.manifestPath);
        if (!parsed) {
            throw new Error('Output contains an invalid SDK control plane. Review or remove it before running sdkgen init.');
        }
        if (!isInitManifest(parsed)) {
            throw new Error('Output already contains a generated SDK control plane. Use sdkgen generate for regeneration.');
        }
        return;
    }
    if (hasAnyControlPlaneArtifact) {
        throw new Error('Output contains an incomplete SDK control plane. Review or remove it before running sdkgen init.');
    }
    for (const relativePath of [...INIT_GENERATED_PATHS, ...INIT_SCAFFOLD_PATHS]) {
        if (existsSync(resolve(outputPath, relativePath))) {
            throw new Error(`Init target already contains ${relativePath}. Use an empty directory or remove conflicting files before running sdkgen init.`);
        }
    }
}
function parseExistingManifest(manifestPath) {
    try {
        return parsePersistedGeneratorManifest(JSON.parse(readFileSync(manifestPath, 'utf-8')));
    }
    catch {
        return null;
    }
}
function isInitManifest(manifest) {
    const generatedPaths = manifest.generatedFiles.map((entry) => entry.path).sort((left, right) => left.localeCompare(right));
    const scaffoldPaths = [...manifest.scaffoldFiles].sort((left, right) => left.localeCompare(right));
    return isSamePathSet(generatedPaths, [...INIT_GENERATED_PATHS])
        && isSamePathSet(scaffoldPaths, [...INIT_SCAFFOLD_PATHS]);
}
function isSamePathSet(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    return left.every((value, index) => value === right[index]);
}
function buildInitSyncSummary(raw) {
    const impact = buildInitImpact(raw.changes);
    const verificationPlan = buildInitVerificationPlan(raw.dryRun, impact);
    const executionDecision = buildInitExecutionDecision(raw, impact);
    return {
        ...raw,
        impact,
        verificationPlan,
        executionDecision,
    };
}
function buildInitImpact(changes) {
    const paths = [
        ...changes.createdGeneratedFiles,
        ...changes.updatedGeneratedFiles,
        ...changes.scaffoldedFiles,
        ...changes.backedUpFiles,
    ];
    const areas = [];
    if (paths.some((path) => path === 'README.md')) {
        areas.push('documentation');
    }
    if (paths.some((path) => path === 'sdkwork-sdk.json')) {
        areas.push('build-metadata');
    }
    if (paths.some((path) => path.startsWith('custom/'))) {
        areas.push('custom-scaffold');
    }
    const details = areas.map((area) => ({
        area,
        paths: paths.filter((path) => classifyInitArea(path).includes(area)),
    }));
    if (areas.length === 0) {
        return {
            schemaVersion: 1,
            areas: [],
            details: [],
            requiresVerification: false,
            summary: 'No init scaffold changes were detected. Verification can be skipped.',
        };
    }
    return {
        schemaVersion: 1,
        areas,
        details,
        requiresVerification: false,
        summary: 'Init only changed scaffold metadata and custom extension boundaries. Verification can be skipped until sdkgen generate creates a buildable SDK package.',
    };
}
function classifyInitArea(path) {
    const areas = [];
    if (path === 'README.md') {
        areas.push('documentation');
    }
    if (path === 'sdkwork-sdk.json') {
        areas.push('build-metadata');
    }
    if (path.startsWith('custom/')) {
        areas.push('custom-scaffold');
    }
    return areas;
}
function buildInitVerificationPlan(dryRun, impact) {
    if (impact.areas.length === 0) {
        return {
            shouldRun: false,
            runPhase: 'skip',
            summary: impact.summary,
            steps: [],
        };
    }
    return {
        shouldRun: false,
        runPhase: 'skip',
        summary: dryRun
            ? 'Init dry-run only prepares scaffold metadata. Apply the reviewed plan, then run sdkgen generate when an OpenAPI spec is ready.'
            : 'Init only prepares scaffold metadata. No verification is required until sdkgen generate creates a buildable SDK package.',
        steps: [],
    };
}
function buildInitExecutionDecision(raw, impact) {
    const hasActionableChanges = raw.changes.createdGeneratedFiles.length > 0
        || raw.changes.updatedGeneratedFiles.length > 0
        || raw.changes.deletedGeneratedFiles.length > 0
        || raw.changes.scaffoldedFiles.length > 0
        || raw.changes.backedUpFiles.length > 0;
    if (!hasActionableChanges) {
        return {
            schemaVersion: 1,
            riskLevel: 'low',
            nextAction: 'skip',
            requiresManualReview: false,
            applyRequiresExpectedFingerprint: false,
            summary: 'SDK workspace scaffold is already up to date. No further action is required until you are ready to run sdkgen generate.',
            reasons: ['no-actionable-changes', 'init-scaffold-current'],
        };
    }
    if (raw.dryRun) {
        return {
            schemaVersion: 1,
            riskLevel: 'low',
            nextAction: 'apply',
            requiresManualReview: false,
            applyRequiresExpectedFingerprint: true,
            summary: 'Dry-run detected scaffold changes. Apply the reviewed init plan with the expected change fingerprint.',
            reasons: ['dry-run', 'init-scaffold', ...impact.areas],
        };
    }
    return {
        schemaVersion: 1,
        riskLevel: 'low',
        nextAction: 'complete',
        requiresManualReview: false,
        applyRequiresExpectedFingerprint: false,
        summary: 'SDK workspace scaffold has been initialized. Run sdkgen generate when an OpenAPI spec is ready.',
        reasons: ['init-scaffold-applied', ...impact.areas],
    };
}
export function buildInitExecutionHandoff(execution) {
    const decision = execution.syncSummary.executionDecision;
    switch (decision.nextAction) {
        case 'apply':
            return {
                schemaVersion: 1,
                summary: 'Apply the reviewed init plan with the expected change fingerprint.',
                steps: [createApplyReviewedInitStep(execution)],
            };
        case 'complete':
        case 'skip':
            return {
                schemaVersion: 1,
                summary: 'Workspace scaffold is ready. Generate the SDK when the OpenAPI spec is available.',
                steps: [createGenerateRecommendedStep(execution)],
            };
        default:
            return {
                schemaVersion: 1,
                summary: 'No further commands are required.',
                steps: [],
            };
    }
}
function createApplyReviewedInitStep(execution) {
    const args = [
        'init',
        '-o',
        execution.config.outputPath,
        '-n',
        execution.config.name,
        '-l',
        execution.config.language,
        '-t',
        execution.config.sdkType,
        '--sdk-version',
        execution.config.version,
        '--expected-change-fingerprint',
        execution.syncSummary.changeFingerprint,
    ];
    pushOptionalArg(args, '--package-name', execution.config.packageName);
    pushOptionalArg(args, '--namespace', execution.config.namespace);
    pushOptionalArg(args, '--description', execution.config.description);
    pushOptionalArg(args, '--author', execution.config.author);
    pushOptionalArg(args, '--license', execution.config.license);
    return {
        id: 'apply-reviewed-init-plan',
        title: 'Apply reviewed init plan',
        required: true,
        rationale: 'Re-run init with the reviewed fingerprint so apply mode matches the inspected dry-run plan.',
        command: 'sdkgen',
        args,
        displayCommand: ['sdkgen', ...args].map(quoteArg).join(' '),
    };
}
function createGenerateRecommendedStep(execution) {
    const args = [
        'generate',
        '-i',
        './openapi.json',
        '-o',
        '.',
        '-n',
        execution.config.name,
        '-l',
        execution.config.language,
        '-t',
        execution.config.sdkType,
        '--fixed-sdk-version',
        execution.config.version,
    ];
    pushOptionalArg(args, '--package-name', execution.config.packageName);
    pushOptionalArg(args, '--namespace', execution.config.namespace);
    pushOptionalArg(args, '--description', execution.config.description);
    return {
        id: 'generate-sdk-from-scaffold',
        title: 'Generate SDK from the scaffolded workspace',
        required: false,
        rationale: 'Init only creates the workspace boundary. Run generate after you have an OpenAPI 3.x specification.',
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
function quoteArg(arg) {
    if (arg === '') {
        return '""';
    }
    return /\s/.test(arg) ? JSON.stringify(arg) : arg;
}
