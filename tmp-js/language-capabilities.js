import { getLanguageRegistry } from './language-registry.js';
const LANGUAGE_CAPABILITIES = getLanguageRegistry().map((entry) => buildLanguageCapability(entry));
const LANGUAGE_CAPABILITIES_BY_LANGUAGE = new Map(LANGUAGE_CAPABILITIES.map((capability) => [capability.language, capability]));
export function getLanguageCapabilities() {
    return LANGUAGE_CAPABILITIES.map((capability) => ({ ...capability }));
}
export function getLanguageCapability(language) {
    const capability = LANGUAGE_CAPABILITIES_BY_LANGUAGE.get(language);
    return capability ? { ...capability } : undefined;
}
function buildLanguageCapability(entry) {
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
