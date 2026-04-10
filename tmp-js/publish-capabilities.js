import { getLanguageRegistry } from './language-registry.js';
const PUBLISH_CAPABILITIES = getLanguageRegistry().map(buildPublishCapability);
const PUBLISH_CAPABILITIES_BY_LANGUAGE = new Map(PUBLISH_CAPABILITIES.map((capability) => [capability.language, capability]));
export function getPublishSupportedLanguages() {
    return PUBLISH_CAPABILITIES.map((capability) => capability.language);
}
export function getLanguagesWithDistinctBuildStep() {
    return PUBLISH_CAPABILITIES
        .filter((capability) => capability.hasDistinctBuildStep)
        .map((capability) => capability.language)
        .sort((left, right) => left.localeCompare(right));
}
export function getPublishCapability(language) {
    return PUBLISH_CAPABILITIES_BY_LANGUAGE.get(language);
}
function buildPublishCapability(entry) {
    return {
        language: entry.language,
        hasUnifiedPublish: entry.publish.hasUnifiedPublish,
        hasDistinctBuildStep: entry.publish.hasDistinctBuildStep,
    };
}
