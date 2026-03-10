import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

import type { Language, SdkType } from './types.js';

const MANIFEST_FILES_BY_LANGUAGE: Partial<Record<Language, string[]>> = {
  typescript: ['package.json'],
  python: ['pyproject.toml', 'setup.py'],
  java: ['pom.xml'],
  kotlin: ['build.gradle.kts', 'build.gradle'],
  flutter: ['pubspec.yaml'],
  csharp: [],
};

const VERSION_PATTERNS_BY_LANGUAGE: Partial<Record<Language, RegExp[]>> = {
  typescript: [/"version"\s*:\s*"([^"]+)"/],
  python: [/^version\s*=\s*"([^"]+)"/m, /version\s*=\s*"([^"]+)"/],
  java: [/<version>\s*([^<\s]+)\s*<\/version>/],
  kotlin: [/version\s*=\s*"([^"]+)"/],
  flutter: [/^version:\s*([^\s]+)/m],
  csharp: [/<Version>\s*([^<\s]+)\s*<\/Version>/],
};

const INITIAL_VERSION = '1.0.0';

export interface ResolveSdkVersionOptions {
  sdkRoot?: string;
  sdkName?: string;
  outputPath?: string;
  language?: Language;
  sdkType: SdkType;
  packageName?: string;
  requestedVersion?: string;
  fixedVersion?: boolean;
  npmRegistryUrl?: string;
  syncPublishedVersion?: boolean;
}

export interface ResolveSdkVersionResult {
  version: string;
  localVersions: string[];
  publishedVersion?: string;
}

export function normalizeVersion(rawVersion?: string | null): string | undefined {
  if (!rawVersion) {
    return undefined;
  }

  const trimmed = String(rawVersion).trim().replace(/^v/i, '');
  const match = trimmed.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    return undefined;
  }

  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

export function compareVersions(left: string, right: string): number {
  const normalizedLeft = normalizeVersion(left);
  const normalizedRight = normalizeVersion(right);

  if (!normalizedLeft || !normalizedRight) {
    throw new Error(`Invalid semantic version comparison: "${left}" vs "${right}"`);
  }

  const leftParts = normalizedLeft.split('.').map(Number);
  const rightParts = normalizedRight.split('.').map(Number);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}

export function incrementPatchVersion(version: string): string {
  const normalized = normalizeVersion(version);
  if (!normalized) {
    throw new Error(`Invalid semantic version: "${version}"`);
  }

  const [major, minor, patch] = normalized.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

export function detectVersionFromManifestContent(language: Language, content: string): string | undefined {
  const patterns = VERSION_PATTERNS_BY_LANGUAGE[language] || [];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      const normalized = normalizeVersion(match[1]);
      if (normalized) {
        return normalized;
      }
    }
  }

  return undefined;
}

function readVersionFromCSharpProject(projectDir: string): string | undefined {
  const files = readdirSync(projectDir).filter((file) => file.toLowerCase().endsWith('.csproj'));
  for (const file of files) {
    const content = readFileSync(join(projectDir, file), 'utf-8');
    const version = detectVersionFromManifestContent('csharp', content);
    if (version) {
      return version;
    }
  }

  return undefined;
}

export function detectVersionFromProject(language: Language, projectDir: string): string | undefined {
  const resolvedProjectDir = resolve(projectDir);

  if (!existsSync(resolvedProjectDir)) {
    return undefined;
  }

  if (language === 'csharp') {
    return readVersionFromCSharpProject(resolvedProjectDir);
  }

  const manifestFiles = MANIFEST_FILES_BY_LANGUAGE[language] || [];
  for (const manifest of manifestFiles) {
    const manifestPath = join(resolvedProjectDir, manifest);
    if (!existsSync(manifestPath)) {
      continue;
    }

    const content = readFileSync(manifestPath, 'utf-8');
    const version = detectVersionFromManifestContent(language, content);
    if (version) {
      return version;
    }
  }

  return undefined;
}

function resolveDefaultTypeScriptPackageName(sdkType: SdkType, packageName?: string): string | undefined {
  return packageName || `@sdkwork/${sdkType}-sdk`;
}

async function fetchPublishedNpmVersion(packageName: string, registryUrl: string): Promise<string | undefined> {
  const normalizedRegistry = registryUrl.replace(/\/+$/, '');
  const encodedPackageName = encodeURIComponent(packageName);

  const response = await fetch(`${normalizedRegistry}/${encodedPackageName}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return undefined;
  }

  const payload = await response.json() as {
    'dist-tags'?: {
      latest?: string;
    };
  };

  return normalizeVersion(payload['dist-tags']?.latest);
}

function collectWorkspaceVersions(sdkRoot: string, sdkName: string): string[] {
  const resolvedRoot = resolve(sdkRoot);
  if (!existsSync(resolvedRoot)) {
    return [];
  }

  const versions: string[] = [];
  const prefix = `${sdkName}-`;
  const directories = readdirSync(resolvedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix));

  for (const entry of directories) {
    const language = entry.name.slice(prefix.length) as Language;
    const version = detectVersionFromProject(language, join(resolvedRoot, entry.name));
    if (version) {
      versions.push(version);
    }
  }

  return versions;
}

export function determineNextVersion(params: {
  localVersions: Array<string | undefined>;
  publishedVersion?: string;
  requestedVersion?: string;
  fixedVersion?: boolean;
}): string {
  if (params.fixedVersion) {
    const normalizedRequested = normalizeVersion(params.requestedVersion);
    if (!normalizedRequested) {
      throw new Error(`Invalid requested sdk version: "${params.requestedVersion}"`);
    }

    return normalizedRequested;
  }

  const baselineVersions = [
    ...params.localVersions.map((item) => normalizeVersion(item)).filter(Boolean),
    normalizeVersion(params.publishedVersion),
  ].filter(Boolean) as string[];

  if (params.requestedVersion) {
    const normalizedRequested = normalizeVersion(params.requestedVersion);
    if (!normalizedRequested) {
      throw new Error(`Invalid requested sdk version: "${params.requestedVersion}"`);
    }

    if (baselineVersions.length === 0) {
      return normalizedRequested;
    }

    const latestBaseline = baselineVersions.reduce((left, right) => (
      compareVersions(left, right) >= 0 ? left : right
    ));

    return compareVersions(normalizedRequested, latestBaseline) > 0
      ? normalizedRequested
      : incrementPatchVersion(latestBaseline);
  }

  if (baselineVersions.length === 0) {
    return INITIAL_VERSION;
  }

  const latestBaseline = baselineVersions.reduce((left, right) => (
    compareVersions(left, right) >= 0 ? left : right
  ));

  return incrementPatchVersion(latestBaseline);
}

export async function resolveSdkVersion(options: ResolveSdkVersionOptions): Promise<ResolveSdkVersionResult> {
  if (options.fixedVersion) {
    return {
      version: determineNextVersion({
        localVersions: [],
        requestedVersion: options.requestedVersion,
        fixedVersion: true,
      }),
      localVersions: [],
      publishedVersion: undefined,
    };
  }

  const localVersions = options.sdkRoot && options.sdkName
    ? collectWorkspaceVersions(options.sdkRoot, options.sdkName)
    : (options.outputPath && options.language
        ? [detectVersionFromProject(options.language, options.outputPath)].filter(Boolean) as string[]
        : []);

  let publishedVersion: string | undefined;
  if (options.syncPublishedVersion !== false) {
    const packageName = resolveDefaultTypeScriptPackageName(options.sdkType, options.packageName);
    if (packageName) {
      try {
        publishedVersion = await fetchPublishedNpmVersion(
          packageName,
          options.npmRegistryUrl || 'https://registry.npmjs.org'
        );
      } catch {
        publishedVersion = undefined;
      }
    }
  }

  return {
    version: determineNextVersion({
      localVersions,
      publishedVersion,
      requestedVersion: options.requestedVersion,
      fixedVersion: options.fixedVersion,
    }),
    localVersions,
    publishedVersion,
  };
}
