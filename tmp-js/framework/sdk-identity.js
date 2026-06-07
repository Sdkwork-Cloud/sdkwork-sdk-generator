const SDKWORK_PREFIX = 'Sdkwork';
function toPascalCase(value) {
    return (value || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('');
}
function resolveSdkType(configOrSdkType) {
    if (typeof configOrSdkType === 'string') {
        return configOrSdkType;
    }
    return configOrSdkType.sdkType;
}
function resolveConfiguredIdentifier(configOrSdkType, key) {
    if (typeof configOrSdkType === 'string') {
        return undefined;
    }
    const value = configOrSdkType[key]?.trim();
    return value || undefined;
}
export function resolveSdkTypePascal(configOrSdkType) {
    const sdkType = resolveSdkType(configOrSdkType);
    return toPascalCase(sdkType) || 'Custom';
}
export function resolveSdkClientName(configOrSdkType) {
    const configuredClientName = resolveConfiguredIdentifier(configOrSdkType, 'clientName');
    if (configuredClientName) {
        return configuredClientName;
    }
    return `${SDKWORK_PREFIX}${resolveSdkTypePascal(configOrSdkType)}Client`;
}
export function resolveLegacySdkClientName(configOrSdkType) {
    const legacyClientName = resolveConfiguredIdentifier(configOrSdkType, 'legacyClientName');
    if (!legacyClientName) {
        return undefined;
    }
    const clientName = resolveSdkClientName(configOrSdkType);
    return legacyClientName === clientName ? undefined : legacyClientName;
}
export function resolveTypeScriptConfigTypeName(configOrSdkType) {
    return `${SDKWORK_PREFIX}${resolveSdkTypePascal(configOrSdkType)}Config`;
}
export function resolveSdkLibraryName(configOrSdkType) {
    return `${SDKWORK_PREFIX}${resolveSdkTypePascal(configOrSdkType)}`;
}
export function resolveTypeScriptLibraryName(configOrSdkType) {
    return resolveSdkLibraryName(configOrSdkType);
}
