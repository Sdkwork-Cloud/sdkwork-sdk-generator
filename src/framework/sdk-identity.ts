import type { GeneratorConfig, SdkType } from './types.js';

const SDKWORK_PREFIX = 'Sdkwork';

function toPascalCase(value: string): string {
  return (value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

function resolveSdkType(configOrSdkType: GeneratorConfig | SdkType | string): string {
  if (typeof configOrSdkType === 'string') {
    return configOrSdkType;
  }
  return configOrSdkType.sdkType;
}

export function resolveSdkTypePascal(configOrSdkType: GeneratorConfig | SdkType | string): string {
  const sdkType = resolveSdkType(configOrSdkType);
  return toPascalCase(sdkType) || 'Custom';
}

export function resolveSdkClientName(configOrSdkType: GeneratorConfig | SdkType | string): string {
  return `${SDKWORK_PREFIX}${resolveSdkTypePascal(configOrSdkType)}Client`;
}

export function resolveTypeScriptConfigTypeName(configOrSdkType: GeneratorConfig | SdkType | string): string {
  return `${SDKWORK_PREFIX}${resolveSdkTypePascal(configOrSdkType)}Config`;
}

export function resolveSdkLibraryName(configOrSdkType: GeneratorConfig | SdkType | string): string {
  return `${SDKWORK_PREFIX}${resolveSdkTypePascal(configOrSdkType)}`;
}

export function resolveTypeScriptLibraryName(configOrSdkType: GeneratorConfig | SdkType | string): string {
  return resolveSdkLibraryName(configOrSdkType);
}
