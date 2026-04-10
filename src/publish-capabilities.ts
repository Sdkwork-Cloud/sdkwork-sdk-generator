import type { Language } from './framework/types.js';
import { getLanguageRegistry, type LanguageRegistryEntry } from './language-registry.js';

export interface PublishCapability {
  language: Language;
  hasUnifiedPublish: true;
  hasDistinctBuildStep: boolean;
}

const PUBLISH_CAPABILITIES: PublishCapability[] = getLanguageRegistry().map(buildPublishCapability);

const PUBLISH_CAPABILITIES_BY_LANGUAGE = new Map(
  PUBLISH_CAPABILITIES.map((capability) => [capability.language, capability])
);

export function getPublishSupportedLanguages(): Language[] {
  return PUBLISH_CAPABILITIES.map((capability) => capability.language);
}

export function getLanguagesWithDistinctBuildStep(): Language[] {
  return PUBLISH_CAPABILITIES
    .filter((capability) => capability.hasDistinctBuildStep)
    .map((capability) => capability.language)
    .sort((left, right) => left.localeCompare(right));
}

export function getPublishCapability(language: Language): PublishCapability | undefined {
  return PUBLISH_CAPABILITIES_BY_LANGUAGE.get(language);
}

function buildPublishCapability(entry: LanguageRegistryEntry): PublishCapability {
  return {
    language: entry.language,
    hasUnifiedPublish: entry.publish.hasUnifiedPublish,
    hasDistinctBuildStep: entry.publish.hasDistinctBuildStep,
  };
}
