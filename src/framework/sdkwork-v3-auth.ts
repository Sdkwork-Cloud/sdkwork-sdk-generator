import type { GeneratorConfig } from './types.js';

export function usesSdkworkV3DualTokenOnly(
  config: Pick<GeneratorConfig, 'sdkType' | 'options'>,
): boolean {
  return config.options?.standardProfile === 'sdkwork-v3'
    && ['app', 'backend', 'im'].includes(config.sdkType);
}
