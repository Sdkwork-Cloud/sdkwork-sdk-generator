import { getLanguageRegistry, type LanguageRegistryEntry } from './language-registry.js';
import type { Language, LanguageCapability } from './framework/types.js';

const LANGUAGE_CAPABILITIES = getLanguageRegistry().map((entry) => buildLanguageCapability(entry));
const LANGUAGE_CAPABILITIES_BY_LANGUAGE = new Map(
  LANGUAGE_CAPABILITIES.map((capability) => [capability.language, capability] as const)
);

export function getLanguageCapabilities(): LanguageCapability[] {
  return LANGUAGE_CAPABILITIES.map((capability) => ({ ...capability }));
}

export function getLanguageCapability(language: Language): LanguageCapability | undefined {
  const capability = LANGUAGE_CAPABILITIES_BY_LANGUAGE.get(language);
  return capability ? { ...capability } : undefined;
}

function buildLanguageCapability(entry: LanguageRegistryEntry): LanguageCapability {
  const { config, publish } = entry;

  return {
    language: config.language,
    supportsGeneratedTests: config.supportsTests,
    supportsReadme: true,
    supportsCustomScaffold: true,
    supportsPublishWorkflow: publish.hasUnifiedPublish,
    hasDistinctBuildStep: publish.hasDistinctBuildStep,
  };
}
