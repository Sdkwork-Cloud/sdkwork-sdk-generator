export function usesSdkworkV3DualTokenOnly(config) {
    return config.options?.standardProfile === 'sdkwork-v3'
        && ['app', 'backend', 'im'].includes(config.sdkType);
}
