import { getLanguageCapability } from '../language-capabilities.js';
export const SDKWORK_METADATA_FILE = 'sdkwork-sdk.json';
export const SDKWORK_METADATA_SCHEMA_VERSION = 1;
export const SDKWORK_GENERATOR_PACKAGE = '@sdkwork/sdk-generator';
export function buildSdkMetadataManifest(config, _options) {
    const capability = getLanguageCapability(config.language);
    if (!capability) {
        throw new Error(`Unsupported language for sdk metadata manifest: ${config.language}`);
    }
    return {
        schemaVersion: SDKWORK_METADATA_SCHEMA_VERSION,
        name: config.name,
        version: config.version,
        language: config.language,
        sdkType: config.sdkType,
        packageName: config.packageName || null,
        generator: SDKWORK_GENERATOR_PACKAGE,
        capabilities: {
            supportsGeneratedTests: capability.supportsGeneratedTests,
            supportsReadme: capability.supportsReadme,
            supportsCustomScaffold: capability.supportsCustomScaffold,
            supportsPublishWorkflow: capability.supportsPublishWorkflow,
            hasDistinctBuildStep: capability.hasDistinctBuildStep,
        },
        generation: {
            readme: config.generateReadme !== false,
            tests: config.generateTests === true,
        },
        ownership: {
            generatedOwnership: 'generated',
            scaffoldOwnership: 'scaffold',
            scaffoldRoots: ['custom/'],
            stateRoots: ['.sdkwork/'],
        },
    };
}
export function parseSdkMetadataManifest(value) {
    if (!isRecord(value)) {
        return null;
    }
    if (value.schemaVersion !== SDKWORK_METADATA_SCHEMA_VERSION) {
        return null;
    }
    if (value.generator !== SDKWORK_GENERATOR_PACKAGE) {
        return null;
    }
    if (!isNonEmptyString(value.name) || !isNonEmptyString(value.version)) {
        return null;
    }
    if (!isLanguage(value.language) || !isSdkType(value.sdkType)) {
        return null;
    }
    if (value.packageName !== null && typeof value.packageName !== 'string') {
        return null;
    }
    if (!isCapabilities(value.capabilities) || !isGeneration(value.generation) || !isOwnership(value.ownership)) {
        return null;
    }
    return {
        schemaVersion: SDKWORK_METADATA_SCHEMA_VERSION,
        name: value.name,
        version: value.version,
        language: value.language,
        sdkType: value.sdkType,
        packageName: value.packageName,
        generator: SDKWORK_GENERATOR_PACKAGE,
        capabilities: {
            supportsGeneratedTests: value.capabilities.supportsGeneratedTests,
            supportsReadme: value.capabilities.supportsReadme,
            supportsCustomScaffold: value.capabilities.supportsCustomScaffold,
            supportsPublishWorkflow: value.capabilities.supportsPublishWorkflow,
            hasDistinctBuildStep: value.capabilities.hasDistinctBuildStep,
        },
        generation: {
            readme: value.generation.readme,
            tests: value.generation.tests,
        },
        ownership: {
            generatedOwnership: value.ownership.generatedOwnership,
            scaffoldOwnership: value.ownership.scaffoldOwnership,
            scaffoldRoots: [...value.ownership.scaffoldRoots],
            stateRoots: [...value.ownership.stateRoots],
        },
    };
}
function isCapabilities(value) {
    return isRecord(value)
        && typeof value.supportsGeneratedTests === 'boolean'
        && typeof value.supportsReadme === 'boolean'
        && typeof value.supportsCustomScaffold === 'boolean'
        && typeof value.supportsPublishWorkflow === 'boolean'
        && typeof value.hasDistinctBuildStep === 'boolean';
}
function isGeneration(value) {
    return isRecord(value)
        && typeof value.readme === 'boolean'
        && typeof value.tests === 'boolean';
}
function isOwnership(value) {
    return isRecord(value)
        && isOwnershipValue(value.generatedOwnership)
        && isOwnershipValue(value.scaffoldOwnership)
        && isStringArray(value.scaffoldRoots)
        && isStringArray(value.stateRoots);
}
function isOwnershipValue(value) {
    return value === 'generated' || value === 'scaffold';
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}
function isLanguage(value) {
    return typeof value === 'string' && [
        'typescript',
        'dart',
        'python',
        'java',
        'csharp',
        'go',
        'rust',
        'swift',
        'flutter',
        'kotlin',
        'php',
        'ruby',
    ].includes(value);
}
function isSdkType(value) {
    return value === 'app' || value === 'backend' || value === 'ai' || value === 'custom';
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
