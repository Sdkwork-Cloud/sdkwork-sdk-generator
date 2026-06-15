export function usesSdkworkV3DualTokenOnly(config) {
    return config.options?.standardProfile === 'sdkwork-v3'
        && ['app', 'backend', 'im'].includes(config.sdkType);
}
export function usesSdkworkV3ApiKeyOnly(config) {
    return config.options?.standardProfile === 'sdkwork-v3'
        && config.sdkType === 'custom';
}
export function operationSkipsSdkworkAuth(operation) {
    const authMode = String(operation?.['x-sdkwork-auth-mode'] ?? '').trim().toLowerCase();
    return authMode === 'anonymous' || authMode === 'refresh-token';
}
