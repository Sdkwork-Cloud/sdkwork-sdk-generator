import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateSdkProject } from './node/generate.js';

const tempDirs: string[] = [];

const mockSpec = {
  openapi: '3.0.3',
  info: { title: 'Project API', version: '1.0.0' },
  paths: {
    '/users': {
      get: {
        summary: 'List users',
        operationId: 'listUsers',
        tags: ['User'],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/User' },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    },
  },
};

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('generateSdkProject', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('generates and safely writes a sdk from an in-memory spec', async () => {
    const outputDir = createTempDir('sdkwork-node-generate-');
    const execution = await generateSdkProject({
      spec: mockSpec,
      output: outputDir,
      name: 'NodeProjectSdk',
      type: 'backend',
      language: 'typescript',
      syncPublishedVersion: false,
    });

    expect(execution.result.errors).toEqual([]);
    expect(existsSync(join(outputDir, 'src/api/user.ts'))).toBe(true);
    expect(existsSync(join(outputDir, 'custom/README.md'))).toBe(true);
    expect(readFileSync(join(outputDir, 'README.md'), 'utf-8')).toContain('## Regeneration Contract');
    expect(execution.syncSummary.preservedLegacyFiles).toBe(true);
  });
});
