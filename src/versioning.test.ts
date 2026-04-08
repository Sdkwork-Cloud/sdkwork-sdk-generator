import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  compareVersions,
  detectVersionFromManifestContent,
  detectVersionFromProject,
  determineNextVersion,
  incrementPatchVersion,
  resolveSdkVersion,
} from './framework/versioning.js';

describe('versioning', () => {
  it('should compare semver versions correctly', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.10.0', '1.2.0')).toBeGreaterThan(0);
  });

  it('should increment patch version', () => {
    expect(incrementPatchVersion('1.0.0')).toBe('1.0.1');
    expect(incrementPatchVersion('2.4.9')).toBe('2.4.10');
  });

  it('should extract versions from language manifests', () => {
    expect(
      detectVersionFromManifestContent('typescript', JSON.stringify({ version: '1.0.3' }))
    ).toBe('1.0.3');
    expect(
      detectVersionFromManifestContent('java', '<project><version>1.2.3</version></project>')
    ).toBe('1.2.3');
    expect(
      detectVersionFromManifestContent('kotlin', 'version = "1.2.4"')
    ).toBe('1.2.4');
    expect(
      detectVersionFromManifestContent('python', 'version = "1.2.5"')
    ).toBe('1.2.5');
    expect(
      detectVersionFromManifestContent('flutter', 'version: 1.2.6')
    ).toBe('1.2.6');
    expect(
      detectVersionFromManifestContent('dart' as any, 'version: 1.2.6')
    ).toBe('1.2.6');
    expect(
      detectVersionFromManifestContent('csharp', '<Version>1.2.7</Version>')
    ).toBe('1.2.7');
    expect(
      detectVersionFromManifestContent('rust', 'version = "1.2.8"')
    ).toBe('1.2.8');
    expect(
      detectVersionFromManifestContent('php', JSON.stringify({ version: '1.2.9' }))
    ).toBe('1.2.9');
    expect(
      detectVersionFromManifestContent('ruby', 'spec.version = "1.3.0"')
    ).toBe('1.3.0');
  });

  it('should prefer sdkwork metadata manifest for project version detection', () => {
    const root = mkdtempSync(join(tmpdir(), 'sdkwork-versioning-meta-'));
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, 'sdkwork-sdk.json'),
      JSON.stringify({ version: '2.4.6', language: 'swift' }, null, 2),
      'utf-8'
    );

    expect(detectVersionFromProject('swift', root)).toBe('2.4.6');
    expect(detectVersionFromProject('go', root)).toBe('2.4.6');
  });

  it('should detect ruby version from gemspec when metadata is absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'sdkwork-versioning-ruby-'));
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, 'sdkwork-app-sdk.gemspec'),
      'Gem::Specification.new do |spec|\n  spec.version = "1.4.2"\nend\n',
      'utf-8'
    );

    expect(detectVersionFromProject('ruby', root)).toBe('1.4.2');
  });

  it('should pick the next patch version from local and published baselines', () => {
    expect(
      determineNextVersion({
        localVersions: ['1.0.2', '1.0.5', undefined],
        publishedVersion: '1.0.4',
      })
    ).toBe('1.0.6');

    expect(
      determineNextVersion({
        localVersions: ['1.0.2'],
        publishedVersion: '1.0.9',
      })
    ).toBe('1.0.10');
  });

  it('should honor an explicit version only when it is newer than the baseline', () => {
    expect(
      determineNextVersion({
        localVersions: ['1.0.2'],
        publishedVersion: '1.0.3',
        requestedVersion: '1.0.4',
      })
    ).toBe('1.0.4');

    expect(
      determineNextVersion({
        localVersions: ['1.0.2'],
        publishedVersion: '1.0.3',
        requestedVersion: '1.0.3',
      })
    ).toBe('1.0.4');
  });

  it('should keep a fixed requested version without re-bumping against baselines', () => {
    expect(
      determineNextVersion({
        localVersions: ['1.0.2', '1.0.5'],
        publishedVersion: '1.0.4',
        requestedVersion: '1.0.4',
        fixedVersion: true,
      })
    ).toBe('1.0.4');
  });

  it('should fall back to 1.0.0 when no baseline exists', () => {
    expect(
      determineNextVersion({
        localVersions: [],
        publishedVersion: undefined,
      })
    ).toBe('1.0.0');
  });

  it('should include the published npm version when resolving from a workspace root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sdkwork-versioning-'));
    mkdirSync(join(root, 'sdkwork-app-sdk-typescript'), { recursive: true });
    mkdirSync(join(root, 'sdkwork-app-sdk-python'), { recursive: true });
    writeFileSync(
      join(root, 'sdkwork-app-sdk-typescript', 'package.json'),
      JSON.stringify({ version: '1.0.0' }, null, 2),
      'utf-8'
    );
    writeFileSync(
      join(root, 'sdkwork-app-sdk-python', 'pyproject.toml'),
      'version = "1.0.0"\n',
      'utf-8'
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        'dist-tags': {
          latest: '1.0.3',
        },
      }),
    })) as typeof fetch;

    try {
      const resolved = await resolveSdkVersion({
        sdkRoot: root,
        sdkName: 'sdkwork-app-sdk',
        sdkType: 'app',
        packageName: '@sdkwork/app-sdk',
      });

      expect(resolved.publishedVersion).toBe('1.0.3');
      expect(resolved.version).toBe('1.0.4');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should return a fixed requested version without checking workspace or npm baselines', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('fetch should not be called when version is fixed');
    }) as typeof fetch;

    try {
      const resolved = await resolveSdkVersion({
        sdkRoot: 'D:/does-not-matter',
        sdkName: 'sdkwork-app-sdk',
        sdkType: 'app',
        packageName: '@sdkwork/app-sdk',
        requestedVersion: '1.0.4',
        fixedVersion: true,
      });

      expect(resolved.version).toBe('1.0.4');
      expect(resolved.localVersions).toEqual([]);
      expect(resolved.publishedVersion).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should ignore sdk workspace siblings that do not map to supported languages', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sdkwork-versioning-ignore-'));
    mkdirSync(join(root, 'sdkwork-app-sdk-typescript'), { recursive: true });
    mkdirSync(join(root, 'sdkwork-app-sdk-docs'), { recursive: true });
    writeFileSync(
      join(root, 'sdkwork-app-sdk-typescript', 'package.json'),
      JSON.stringify({ version: '1.0.0' }, null, 2),
      'utf-8'
    );
    writeFileSync(
      join(root, 'sdkwork-app-sdk-docs', 'sdkwork-sdk.json'),
      JSON.stringify({ version: '9.9.9', language: 'docs' }, null, 2),
      'utf-8'
    );

    const resolved = await resolveSdkVersion({
      sdkRoot: root,
      sdkName: 'sdkwork-app-sdk',
      sdkType: 'app',
      packageName: '@sdkwork/app-sdk',
      syncPublishedVersion: false,
    });

    expect(resolved.localVersions).toEqual(['1.0.0']);
    expect(resolved.version).toBe('1.0.1');
  });

  it('should keep using the typescript npm baseline for non-typescript package names', async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return {
        ok: true,
        json: async () => ({
          'dist-tags': {
            latest: '2.0.0',
          },
        }),
      };
    }) as typeof fetch;

    try {
      const resolved = await resolveSdkVersion({
        language: 'python',
        sdkType: 'app',
        packageName: 'sdkwork-app-sdk-python',
      });

      expect(requestedUrls).toHaveLength(1);
      expect(requestedUrls[0]).toContain(encodeURIComponent('@sdkwork/app-sdk'));
      expect(resolved.publishedVersion).toBe('2.0.0');
      expect(resolved.version).toBe('2.0.1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should use a custom npm package name for typescript version baselines', async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return {
        ok: true,
        json: async () => ({
          'dist-tags': {
            latest: '3.1.4',
          },
        }),
      };
    }) as typeof fetch;

    try {
      const resolved = await resolveSdkVersion({
        language: 'typescript',
        sdkType: 'app',
        packageName: '@acme/custom-app-sdk',
      });

      expect(requestedUrls).toHaveLength(1);
      expect(requestedUrls[0]).toContain(encodeURIComponent('@acme/custom-app-sdk'));
      expect(resolved.publishedVersion).toBe('3.1.4');
      expect(resolved.version).toBe('3.1.5');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should allow an explicit npm package override for non-typescript version baselines', async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return {
        ok: true,
        json: async () => ({
          'dist-tags': {
            latest: '4.2.0',
          },
        }),
      };
    }) as typeof fetch;

    try {
      const resolved = await resolveSdkVersion({
        language: 'python',
        sdkType: 'app',
        packageName: 'sdkwork-app-sdk-python',
        npmPackageName: '@acme/unified-app-sdk',
      });

      expect(requestedUrls).toHaveLength(1);
      expect(requestedUrls[0]).toContain(encodeURIComponent('@acme/unified-app-sdk'));
      expect(resolved.publishedVersion).toBe('4.2.0');
      expect(resolved.version).toBe('4.2.1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
