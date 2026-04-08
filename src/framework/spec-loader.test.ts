import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { loadOpenApiSpec } from './spec-loader.js';

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('spec loader', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('throws a stable missing-file error for local specs', async () => {
    const missingPath = join(createTempDir('sdkwork-spec-loader-missing-'), 'missing-openapi.json');

    await expect(loadOpenApiSpec(missingPath)).rejects.toThrow(
      `Input file not found: ${resolve(missingPath)}`
    );
  });

  it('parses uppercase local yaml extensions', async () => {
    const workDir = createTempDir('sdkwork-spec-loader-yaml-');
    const specPath = join(workDir, 'OPENAPI.YAML');
    writeFileSync(specPath, `openapi: 3.0.3
info:
  title: Uppercase YAML API
  version: 1.0.0
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        '200':
          description: Success
`, 'utf-8');

    const spec = await loadOpenApiSpec(specPath) as {
      openapi: string;
      info: { title: string };
      paths: Record<string, unknown>;
    };

    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('Uppercase YAML API');
    expect(spec.paths['/users']).toBeDefined();
  });

  it('does not write console output while loading remote specs', async () => {
    const originalFetch = globalThis.fetch;
    const originalConsoleLog = console.log;
    const logCalls: string[] = [];
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/yaml' : null,
      },
      text: async () => `openapi: 3.0.3
info:
  title: Remote Silent API
  version: 1.0.0
paths: {}
`,
    })) as typeof fetch;
    console.log = ((...args: unknown[]) => {
      logCalls.push(args.map((value) => String(value)).join(' '));
    }) as typeof console.log;

    try {
      const spec = await loadOpenApiSpec('https://example.com/openapi.yaml') as {
        info: { title: string };
      };
      expect(spec.info.title).toBe('Remote Silent API');
      expect(logCalls).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
      console.log = originalConsoleLog;
    }
  });
});
