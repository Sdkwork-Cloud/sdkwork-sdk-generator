import type { Language } from './framework/types.js';

export interface PublishCapability {
  language: Language;
  hasUnifiedPublish: true;
  hasDistinctBuildStep: boolean;
}

const PUBLISH_CAPABILITIES: PublishCapability[] = [
  { language: 'typescript', hasUnifiedPublish: true, hasDistinctBuildStep: true },
  { language: 'dart', hasUnifiedPublish: true, hasDistinctBuildStep: false },
  { language: 'python', hasUnifiedPublish: true, hasDistinctBuildStep: false },
  { language: 'java', hasUnifiedPublish: true, hasDistinctBuildStep: false },
  { language: 'kotlin', hasUnifiedPublish: true, hasDistinctBuildStep: false },
  { language: 'go', hasUnifiedPublish: true, hasDistinctBuildStep: false },
  { language: 'rust', hasUnifiedPublish: true, hasDistinctBuildStep: true },
  { language: 'swift', hasUnifiedPublish: true, hasDistinctBuildStep: false },
  { language: 'flutter', hasUnifiedPublish: true, hasDistinctBuildStep: false },
  { language: 'csharp', hasUnifiedPublish: true, hasDistinctBuildStep: false },
  { language: 'php', hasUnifiedPublish: true, hasDistinctBuildStep: false },
  { language: 'ruby', hasUnifiedPublish: true, hasDistinctBuildStep: false },
];

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
