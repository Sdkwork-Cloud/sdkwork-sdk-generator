import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runGenerateCommand } from './cli-runner.js';

const tempDirs: string[] = [];

const httpSpec = {
  openapi: '3.0.3',
  info: { title: 'HTTP Non Regression API', version: '1.0.0' },
  paths: {
    '/users': {
      get: {
        summary: 'List users',
        operationId: 'listUsers',
        tags: ['User'],
        responses: { '204': { description: 'No content' } },
      },
    },
  },
  components: { schemas: {} },
};

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sdkwork-http-non-regression-'));
  tempDirs.push(dir);
  return dir;
}

describe('HTTP generation non-regression', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('keeps generate defaulting to http without requiring rpc options', async () => {
    const workDir = createTempDir();
    const outputDir = join(workDir, 'http-sdk');
    const specPath = join(workDir, 'openapi.json');
    writeFileSync(specPath, JSON.stringify(httpSpec, null, 2), 'utf-8');

    const execution = await runGenerateCommand({
      input: specPath,
      output: outputDir,
      name: 'HttpSdk',
      type: 'backend',
      language: 'typescript',
      license: 'MIT',
      syncPublishedVersion: false,
      dryRun: true,
    });

    expect(execution.config.protocol ?? 'http').toBe('http');
    expect(execution.config.rpc).toBeUndefined();
    expect(execution.result.files.some((file) => file.path === 'src/api/user.ts')).toBe(true);
    expect(execution.result.files.some((file) => file.path === 'buf.gen.yaml')).toBe(false);
    expect(existsSync(outputDir)).toBe(false);
  });
});
