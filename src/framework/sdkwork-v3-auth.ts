import type { ApiOperation, GeneratorConfig } from './types.js';

export function usesSdkworkV3DualTokenOnly(
  config: Pick<GeneratorConfig, 'sdkType' | 'options'>,
): boolean {
  return config.options?.standardProfile === 'sdkwork-v3'
    && ['app', 'backend', 'im'].includes(config.sdkType);
}

export function usesSdkworkV3ApiKeyOnly(
  config: Pick<GeneratorConfig, 'sdkType' | 'options'>,
): boolean {
  return config.options?.standardProfile === 'sdkwork-v3'
    && config.sdkType === 'custom';
}

export function operationSkipsSdkworkAuth(
  operation: Pick<ApiOperation, 'x-sdkwork-auth-mode'> | Record<string, unknown> | undefined,
): boolean {
  const authMode = String(operation?.['x-sdkwork-auth-mode'] ?? '').trim().toLowerCase();
  return authMode === 'anonymous' || authMode === 'refresh-token';
}

export function operationUsesCredentialEntryBootstrap(
  operation: Pick<ApiOperation, 'x-sdkwork-auth-mode'> | Record<string, unknown> | undefined,
): boolean {
  return String(operation?.['x-sdkwork-auth-mode'] ?? '').trim().toLowerCase()
    === 'credential-entry-bootstrap';
}
