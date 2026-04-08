import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeChangeImpact } from '../change-impact.js';
import { buildExecutionDecisionFromContext } from '../execution-decision.js';
import { buildVerificationPlanFromContext } from '../verification-plan.js';
export const SDKWORK_STATE_DIR = '.sdkwork';
export const SDKWORK_GENERATOR_MANIFEST_PATH = `${SDKWORK_STATE_DIR}/sdkwork-generator-manifest.json`;
export const SDKWORK_GENERATOR_CHANGES_PATH = `${SDKWORK_STATE_DIR}/sdkwork-generator-changes.json`;
export const SDKWORK_MANUAL_BACKUP_DIR = `${SDKWORK_STATE_DIR}/manual-backups`;
export const SDKWORK_GENERATOR_NAME = '@sdkwork/sdk-generator';
const PROTECTED_OUTPUT_ROOTS = new Set([SDKWORK_STATE_DIR, 'custom']);
const TRANSIENT_FS_ERROR_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const MAX_FS_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 50;
function sleepSync(ms) {
    const sab = new SharedArrayBuffer(4);
    const int32 = new Int32Array(sab);
    Atomics.wait(int32, 0, 0, ms);
}
function withFsRetry(action, onRetry) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_FS_RETRIES; attempt += 1) {
        try {
            return action();
        }
        catch (error) {
            lastError = error;
            const code = error?.code;
            const isTransient = typeof code === 'string' && TRANSIENT_FS_ERROR_CODES.has(code);
            if (!isTransient || attempt >= MAX_FS_RETRIES) {
                throw error;
            }
            onRetry?.();
            sleepSync(BASE_RETRY_DELAY_MS * attempt);
        }
    }
    throw lastError;
}
export function syncGeneratedOutput(outputPath, files, options) {
    const outDir = path.resolve(outputPath);
    const dryRun = options.dryRun === true;
    if (!dryRun && options.expectedChangeFingerprint) {
        const preview = syncGeneratedOutput(outputPath, files, {
            ...options,
            dryRun: true,
            expectedChangeFingerprint: undefined,
        });
        assertExpectedChangeFingerprint(preview.changeFingerprint, options.expectedChangeFingerprint);
    }
    const normalizedFiles = normalizeGeneratedFiles(files);
    const previousManifest = readGeneratorManifest(outDir);
    const previousGeneratedByPath = new Map((previousManifest?.generatedFiles || []).map((entry) => [entry.path, entry]));
    const generatedFiles = normalizedFiles.filter((file) => file.ownership !== 'scaffold');
    const scaffoldFiles = normalizedFiles.filter((file) => file.ownership === 'scaffold');
    const nextGeneratedPaths = new Set(generatedFiles.map((file) => file.path));
    const backedUpFiles = new Set();
    const createdGeneratedFiles = new Set();
    const updatedGeneratedFiles = new Set();
    const unchangedGeneratedFiles = new Set();
    const deletedGeneratedFilesByPath = new Set();
    const scaffoldedFiles = new Set();
    const preservedScaffoldFiles = new Set();
    let writtenFiles = 0;
    let skippedScaffoldFiles = 0;
    let skippedUnchangedGeneratedFiles = 0;
    let deletedGeneratedFiles = 0;
    const preservedLegacyFiles = previousManifest === null;
    if (!dryRun) {
        ensureDirectory(outDir);
    }
    if (options.cleanGenerated !== false && previousManifest) {
        for (const entry of previousManifest.generatedFiles) {
            if (nextGeneratedPaths.has(entry.path)) {
                continue;
            }
            backupExistingFile(outDir, entry.path, entry.sha256, undefined, backedUpFiles, dryRun);
            const targetPath = resolveOutputPath(outDir, entry.path);
            if (fs.existsSync(targetPath)) {
                if (!dryRun) {
                    withFsRetry(() => fs.rmSync(targetPath, { force: true }));
                    cleanupEmptyParents(outDir, path.dirname(targetPath));
                }
                deletedGeneratedFiles += 1;
                deletedGeneratedFilesByPath.add(entry.path);
            }
        }
    }
    for (const file of generatedFiles) {
        const previousEntry = previousGeneratedByPath.get(file.path);
        backupExistingFile(outDir, file.path, previousEntry?.sha256, file.content, backedUpFiles, dryRun);
        const writeResult = writeTextFile(outDir, file.path, file.content, dryRun);
        switch (writeResult.state) {
            case 'created':
                createdGeneratedFiles.add(file.path);
                writtenFiles += 1;
                break;
            case 'updated':
                updatedGeneratedFiles.add(file.path);
                writtenFiles += 1;
                break;
            case 'unchanged':
                unchangedGeneratedFiles.add(file.path);
                skippedUnchangedGeneratedFiles += 1;
                break;
        }
    }
    for (const file of scaffoldFiles) {
        const targetPath = resolveOutputPath(outDir, file.path);
        if (fs.existsSync(targetPath)) {
            skippedScaffoldFiles += 1;
            preservedScaffoldFiles.add(file.path);
            continue;
        }
        writeTextFile(outDir, file.path, file.content, dryRun);
        scaffoldedFiles.add(file.path);
        writtenFiles += 1;
    }
    const changes = buildOutputChangeSet({
        createdGeneratedFiles: Array.from(createdGeneratedFiles),
        updatedGeneratedFiles: Array.from(updatedGeneratedFiles),
        unchangedGeneratedFiles: Array.from(unchangedGeneratedFiles),
        deletedGeneratedFiles: Array.from(deletedGeneratedFilesByPath),
        scaffoldedFiles: Array.from(scaffoldedFiles),
        preservedScaffoldFiles: Array.from(preservedScaffoldFiles),
        backedUpFiles: Array.from(backedUpFiles),
    });
    const impact = analyzeChangeImpact(changes);
    const verificationPlan = buildVerificationPlanFromContext({
        language: options.sdk.language,
        outputPath: outDir,
        dryRun,
        changes,
        impact,
    });
    const executionDecision = buildExecutionDecisionFromContext({
        language: options.sdk.language,
        outputPath: outDir,
        dryRun,
        preservedLegacyFiles,
        changes,
        impact,
        verificationPlan,
    });
    const sdkMetadata = buildSdkMetadata(options.sdk);
    const changeFingerprint = buildChangeFingerprint({
        sdk: sdkMetadata,
        changes,
        impact,
        preservedLegacyFiles,
        generatedFiles,
        scaffoldFiles,
    });
    if (dryRun && options.expectedChangeFingerprint) {
        assertExpectedChangeFingerprint(changeFingerprint, options.expectedChangeFingerprint);
    }
    if (!dryRun) {
        writeGeneratorManifest(outDir, buildGeneratorManifest(generatedFiles, scaffoldFiles, sdkMetadata));
        writeGeneratorChangeSummary(outDir, buildGeneratorChangeSummary(changeFingerprint, changes, impact, verificationPlan, executionDecision, preservedLegacyFiles, sdkMetadata));
    }
    return {
        dryRun,
        writtenFiles,
        skippedScaffoldFiles,
        skippedUnchangedGeneratedFiles,
        deletedGeneratedFiles,
        changeSummaryPath: SDKWORK_GENERATOR_CHANGES_PATH,
        changeFingerprint,
        changes,
        impact,
        verificationPlan,
        executionDecision,
        backedUpFiles: changes.backedUpFiles,
        preservedLegacyFiles,
    };
}
function normalizeGeneratedFiles(files) {
    return files.map((file) => {
        const ownership = file.ownership || 'generated';
        const normalizedPath = normalizeRelativePath(file.path);
        validateProtectedOutputPath(normalizedPath, ownership);
        return {
            ...file,
            path: normalizedPath,
            ownership,
            overwriteStrategy: file.overwriteStrategy || (ownership === 'scaffold' ? 'if-missing' : 'always'),
        };
    });
}
function buildGeneratorManifest(generatedFiles, scaffoldFiles, sdk) {
    return {
        schemaVersion: 1,
        generator: SDKWORK_GENERATOR_NAME,
        sdk,
        generatedFiles: generatedFiles
            .map((file) => ({
            path: file.path,
            sha256: hashContent(file.content),
        }))
            .sort((left, right) => left.path.localeCompare(right.path)),
        scaffoldFiles: scaffoldFiles
            .map((file) => file.path)
            .sort((left, right) => left.localeCompare(right)),
        customRoots: resolveCustomRoots(scaffoldFiles),
    };
}
function buildGeneratorChangeSummary(changeFingerprint, changes, impact, verificationPlan, executionDecision, preservedLegacyFiles, sdk) {
    return {
        schemaVersion: 1,
        generator: SDKWORK_GENERATOR_NAME,
        sdk,
        changeFingerprint,
        changes,
        impact,
        verificationPlan,
        executionDecision,
        preservedLegacyFiles,
    };
}
function resolveCustomRoots(scaffoldFiles) {
    const roots = new Set();
    for (const file of scaffoldFiles) {
        const segments = file.path.split('/').filter(Boolean);
        if (segments.length > 1) {
            roots.add(`${segments[0]}/`);
        }
    }
    if (roots.size === 0) {
        roots.add('custom/');
    }
    return Array.from(roots).sort((left, right) => left.localeCompare(right));
}
function readGeneratorManifest(outputDir) {
    const manifestPath = resolveOutputPath(outputDir, SDKWORK_GENERATOR_MANIFEST_PATH);
    if (!fs.existsSync(manifestPath)) {
        return null;
    }
    try {
        return parsePersistedGeneratorManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')));
    }
    catch {
        return null;
    }
}
function writeGeneratorManifest(outputDir, manifest) {
    const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
    writeTextFile(outputDir, SDKWORK_GENERATOR_MANIFEST_PATH, manifestContent, false);
}
function writeGeneratorChangeSummary(outputDir, summary) {
    const changeSummaryContent = `${JSON.stringify(summary, null, 2)}\n`;
    writeTextFile(outputDir, SDKWORK_GENERATOR_CHANGES_PATH, changeSummaryContent, false);
}
function writeTextFile(outputDir, relativePath, content, dryRun) {
    const targetPath = resolveOutputPath(outputDir, relativePath);
    const exists = fs.existsSync(targetPath);
    if (exists && fs.readFileSync(targetPath, 'utf-8') === content) {
        return { wrote: false, state: 'unchanged' };
    }
    if (dryRun) {
        return { wrote: true, state: exists ? 'updated' : 'created' };
    }
    ensureDirectory(path.dirname(targetPath));
    withFsRetry(() => fs.writeFileSync(targetPath, content, 'utf-8'), () => {
        if (!fs.existsSync(targetPath)) {
            return;
        }
        try {
            fs.chmodSync(targetPath, 0o666);
        }
        catch {
            // Ignore chmod errors during retry cleanup.
        }
        try {
            fs.unlinkSync(targetPath);
        }
        catch {
            // Ignore unlink errors during retry cleanup.
        }
    });
    return { wrote: true, state: exists ? 'updated' : 'created' };
}
function backupExistingFile(outputDir, relativePath, previousGeneratedHash, nextContent, backedUpFiles, dryRun = false) {
    const targetPath = resolveOutputPath(outputDir, relativePath);
    if (!fs.existsSync(targetPath)) {
        return;
    }
    const currentContent = fs.readFileSync(targetPath, 'utf-8');
    const currentHash = hashContent(currentContent);
    const nextHash = typeof nextContent === 'string' ? hashContent(nextContent) : undefined;
    if (nextHash && currentHash === nextHash) {
        return;
    }
    if (previousGeneratedHash && currentHash === previousGeneratedHash) {
        return;
    }
    backedUpFiles?.add(relativePath);
    if (dryRun) {
        return;
    }
    const backupPath = resolveOutputPath(outputDir, `${SDKWORK_MANUAL_BACKUP_DIR}/${relativePath}`);
    ensureDirectory(path.dirname(backupPath));
    withFsRetry(() => fs.writeFileSync(backupPath, currentContent, 'utf-8'));
}
function cleanupEmptyParents(outputDir, startDir) {
    const outputRoot = path.resolve(outputDir);
    let current = startDir;
    while (isWithinRoot(outputRoot, current) && current !== outputRoot) {
        if (!fs.existsSync(current)) {
            current = path.dirname(current);
            continue;
        }
        if (fs.readdirSync(current).length > 0) {
            return;
        }
        withFsRetry(() => fs.rmSync(current, { recursive: false, force: true }));
        current = path.dirname(current);
    }
}
function ensureDirectory(path) {
    if (fs.existsSync(path)) {
        return;
    }
    withFsRetry(() => fs.mkdirSync(path, { recursive: true }));
}
export function parsePersistedGeneratorManifest(value) {
    if (!isRecord(value)) {
        return null;
    }
    if (value.schemaVersion !== 1 || value.generator !== SDKWORK_GENERATOR_NAME) {
        return null;
    }
    if (!Array.isArray(value.generatedFiles) || !Array.isArray(value.scaffoldFiles) || !Array.isArray(value.customRoots)) {
        return null;
    }
    return value;
}
export function parsePersistedGeneratorChangeSummary(value) {
    if (!isRecord(value)) {
        return null;
    }
    if (value.schemaVersion !== 1 || value.generator !== SDKWORK_GENERATOR_NAME) {
        return null;
    }
    if (typeof value.changeFingerprint !== 'string' || !isRecord(value.changes)) {
        return null;
    }
    return value;
}
function buildSdkMetadata(sdk) {
    return {
        name: sdk.name,
        version: sdk.version,
        language: sdk.language,
        sdkType: sdk.sdkType,
        packageName: sdk.packageName || null,
    };
}
function buildOutputChangeSet(changes) {
    return {
        createdGeneratedFiles: sortPaths(changes.createdGeneratedFiles),
        updatedGeneratedFiles: sortPaths(changes.updatedGeneratedFiles),
        unchangedGeneratedFiles: sortPaths(changes.unchangedGeneratedFiles),
        deletedGeneratedFiles: sortPaths(changes.deletedGeneratedFiles),
        scaffoldedFiles: sortPaths(changes.scaffoldedFiles),
        preservedScaffoldFiles: sortPaths(changes.preservedScaffoldFiles),
        backedUpFiles: sortPaths(changes.backedUpFiles),
    };
}
function buildChangeFingerprint(input) {
    const generatedFileHashes = new Map(input.generatedFiles.map((file) => [file.path, hashContent(file.content)]));
    const scaffoldFileHashes = new Map(input.scaffoldFiles.map((file) => [file.path, hashContent(file.content)]));
    return hashContent(JSON.stringify({
        schemaVersion: 1,
        sdk: input.sdk,
        preservedLegacyFiles: input.preservedLegacyFiles,
        changes: {
            createdGeneratedFiles: input.changes.createdGeneratedFiles.map((path) => ({
                path,
                sha256: generatedFileHashes.get(path) || '',
            })),
            updatedGeneratedFiles: input.changes.updatedGeneratedFiles.map((path) => ({
                path,
                sha256: generatedFileHashes.get(path) || '',
            })),
            unchangedGeneratedFiles: input.changes.unchangedGeneratedFiles,
            deletedGeneratedFiles: input.changes.deletedGeneratedFiles,
            scaffoldedFiles: input.changes.scaffoldedFiles.map((path) => ({
                path,
                sha256: scaffoldFileHashes.get(path) || '',
            })),
            preservedScaffoldFiles: input.changes.preservedScaffoldFiles,
            backedUpFiles: input.changes.backedUpFiles,
        },
        impact: {
            schemaVersion: input.impact.schemaVersion,
            areas: input.impact.areas,
            details: input.impact.details,
            requiresVerification: input.impact.requiresVerification,
        },
    }));
}
function assertExpectedChangeFingerprint(actualFingerprint, expectedFingerprint) {
    if (actualFingerprint === expectedFingerprint) {
        return;
    }
    throw new Error(`Expected change fingerprint mismatch. expected=${expectedFingerprint} actual=${actualFingerprint}`);
}
function sortPaths(paths) {
    return Array.from(new Set(paths)).sort((left, right) => left.localeCompare(right));
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function normalizeRelativePath(path) {
    const normalized = String(path || '')
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+/g, '/')
        .trim();
    if (!normalized) {
        throw new Error('Generated file path must not be empty.');
    }
    const segments = normalized.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        throw new Error(`Generated file path escapes output root: ${path}`);
    }
    return normalized;
}
function validateProtectedOutputPath(relativePath, ownership) {
    const [rootSegment] = relativePath.split('/');
    if (!rootSegment || !PROTECTED_OUTPUT_ROOTS.has(rootSegment)) {
        return;
    }
    if (rootSegment === SDKWORK_STATE_DIR) {
        throw new Error(`Generated file path targets protected output root: ${relativePath}`);
    }
    if (rootSegment === 'custom' && ownership !== 'scaffold') {
        throw new Error(`Generated file path targets protected output root: ${relativePath}`);
    }
}
function resolveOutputPath(outputDir, relativePath) {
    const normalizedRelativePath = normalizeRelativePath(relativePath);
    const resolvedPath = path.resolve(outputDir, normalizedRelativePath);
    if (!isWithinRoot(path.resolve(outputDir), resolvedPath)) {
        throw new Error(`Resolved path escapes output root: ${relativePath}`);
    }
    return resolvedPath;
}
function isWithinRoot(root, target) {
    const normalizedRoot = normalizeForComparison(root);
    const normalizedTarget = normalizeForComparison(target);
    return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}
function normalizeForComparison(targetPath) {
    const normalized = path.resolve(targetPath);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
function hashContent(content) {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}
