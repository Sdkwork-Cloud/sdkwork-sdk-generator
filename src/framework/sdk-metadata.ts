import { getLanguageCapability } from '../language-capabilities.js';
import type {
  GeneratorConfig,
  GeneratedFileOwnership,
  SdkMetadataManifest,
  Language,
} from './types.js';

export const SDKWORK_METADATA_FILE = 'sdkwork-sdk.json';
export const SDKWORK_METADATA_SCHEMA_VERSION = 1;
export const SDKWORK_GENERATOR_PACKAGE = '@sdkwork/sdk-generator';

export function buildSdkMetadataManifest(
  config: Pick<GeneratorConfig, 'name' | 'version' | 'language' | 'sdkType' | 'packageName' | 'generateReadme' | 'generateTests'>,
  _options?: {
    supportsGeneratedTests?: boolean;
  },
): SdkMetadataManifest {
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

export function parseSdkMetadataManifest(value: unknown): SdkMetadataManifest | null {
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

function isCapabilities(value: unknown): value is SdkMetadataManifest['capabilities'] {
  return isRecord(value)
    && typeof value.supportsGeneratedTests === 'boolean'
    && typeof value.supportsReadme === 'boolean'
    && typeof value.supportsCustomScaffold === 'boolean'
    && typeof value.supportsPublishWorkflow === 'boolean'
    && typeof value.hasDistinctBuildStep === 'boolean';
}

function isGeneration(value: unknown): value is SdkMetadataManifest['generation'] {
  return isRecord(value)
    && typeof value.readme === 'boolean'
    && typeof value.tests === 'boolean';
}

function isOwnership(value: unknown): value is SdkMetadataManifest['ownership'] {
  return isRecord(value)
    && isOwnershipValue(value.generatedOwnership)
    && isOwnershipValue(value.scaffoldOwnership)
    && isStringArray(value.scaffoldRoots)
    && isStringArray(value.stateRoots);
}

function isOwnershipValue(value: unknown): value is GeneratedFileOwnership {
  return value === 'generated' || value === 'scaffold';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isLanguage(value: unknown): value is Language {
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

function isSdkType(value: unknown): value is GeneratorConfig['sdkType'] {
  return value === 'app' || value === 'backend' || value === 'ai' || value === 'custom';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
