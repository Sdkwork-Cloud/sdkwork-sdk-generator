import type { GeneratorConfig, Language, SdkType } from './types.js';

const LANGUAGE_SUFFIXES = new Set<Language>([
  'typescript',
  'dart',
  'python',
  'java',
  'csharp',
  'go',
  'rust',
  'swift',
  'flutter',
  'kotlin',
  'php',
  'ruby',
]);

const SURFACE_SUFFIXES = new Set<SdkType>([
  'app',
  'backend',
  'im',
  'ai',
  'custom',
]);

function toKebabIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function stripSdkworkPrefix(value: string): string {
  return value.replace(/^sdkwork-/, '');
}

function stripTrailingSdk(value: string): string {
  return value.replace(/-sdk$/, '');
}

function stripTrailingLanguage(value: string): string {
  const parts = value.split('-');
  const last = parts.at(-1);
  if (last && LANGUAGE_SUFFIXES.has(last as Language)) {
    return parts.slice(0, -1).join('-');
  }
  return value;
}

function isRetiredGenericSdkToken(value: string, sdkType?: SdkType): boolean {
  if (value === 'app-sdk' || value === 'backend-sdk') {
    return true;
  }
  return sdkType === 'app' || sdkType === 'backend'
    ? value === `${sdkType}-sdk`
    : false;
}

function normalizeFamilyToken(value: string, sdkType?: SdkType): string | undefined {
  let token = stripTrailingLanguage(stripSdkworkPrefix(toKebabIdentifier(value)));
  token = stripTrailingSdk(token);

  if (!token) {
    return undefined;
  }

  const parts = token.split('-').filter(Boolean);
  const surface = parts.at(-1);
  if (sdkType && sdkType !== 'custom' && !SURFACE_SUFFIXES.has(surface as SdkType)) {
    parts.push(sdkType);
  }

  const familyToken = `${parts.join('-')}-sdk`;
  return isRetiredGenericSdkToken(familyToken, sdkType) ? undefined : familyToken;
}

function extractPackageNameToken(packageName: string): string | undefined {
  const raw = packageName.trim();
  if (!raw) {
    return undefined;
  }

  if (raw.startsWith('@')) {
    const scopedName = raw.split('/').slice(1).join('/');
    return scopedName || undefined;
  }

  if (raw.includes(':')) {
    return raw.split(':').at(-1);
  }

  if (raw.includes('/')) {
    return raw.split('/').at(-1);
  }

  return raw;
}

export function resolveDefaultPackageToken(
  config: Pick<GeneratorConfig, 'name' | 'sdkType'>,
): string {
  const inferred = normalizeFamilyToken(config.name, config.sdkType);
  return inferred || `generated-${config.sdkType}-sdk`;
}

export function resolveDefaultTypeScriptPackageName(
  config: Pick<GeneratorConfig, 'name' | 'sdkType'>,
): string {
  return resolveDefaultTypeScriptTransportPackageName(config);
}

export function resolveDefaultTypeScriptTransportPackageName(
  config: Pick<GeneratorConfig, 'name' | 'sdkType'>,
): string {
  return `${resolveDefaultDistributionName(config)}-generated-typescript`;
}

export function resolveDefaultTypeScriptConsumerPackageName(
  config: Pick<GeneratorConfig, 'name' | 'sdkType'>,
): string {
  return `@sdkwork/${resolveDefaultPackageToken(config)}`;
}

export function resolveDefaultDistributionName(
  config: Pick<GeneratorConfig, 'name' | 'sdkType'>,
): string {
  return `sdkwork-${resolveDefaultPackageToken(config)}`;
}

export function resolveDefaultComposerPackageName(
  config: Pick<GeneratorConfig, 'name' | 'sdkType'>,
): string {
  return `sdkwork/${resolveDefaultPackageToken(config)}`;
}

export function resolveDefaultGoModuleName(
  config: Pick<GeneratorConfig, 'name' | 'sdkType'>,
): string {
  return `github.com/sdkwork/${resolveDefaultPackageToken(config)}`;
}

export function inferTypeScriptPackageNameFromSdkIdentity(input: {
  sdkType: SdkType;
  packageName?: string;
  sdkName?: string;
}): string | undefined {
  const sourceToken = input.packageName
    ? extractPackageNameToken(input.packageName)
    : input.sdkName;
  if (!sourceToken) {
    return undefined;
  }

  const familyToken = normalizeFamilyToken(sourceToken, input.sdkType);
  return familyToken ? `@sdkwork/${familyToken}` : undefined;
}
