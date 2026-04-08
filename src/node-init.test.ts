import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runInspectCommand } from './cli-inspect.js';
import { initializeSdkWorkspace } from './node/init.js';

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('initializeSdkWorkspace', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('creates a scaffolded sdk workspace from programmatic node callers', async () => {
    const outputDir = createTempDir('sdkwork-node-init-');

    const execution = await initializeSdkWorkspace({
      output: outputDir,
      name: 'NodeInitSdk',
      type: 'app',
      language: 'typescript',
      description: 'Programmatic init',
    });

    expect(existsSync(join(outputDir, 'README.md'))).toBe(true);
    expect(existsSync(join(outputDir, 'custom/README.md'))).toBe(true);
    expect(existsSync(join(outputDir, 'sdkwork-sdk.json'))).toBe(true);
    expect(readFileSync(join(outputDir, 'README.md'), 'utf-8')).toContain('sdkgen generate');
    expect(execution.syncSummary.executionDecision?.nextAction).toBe('complete');

    const snapshot = runInspectCommand({ output: outputDir });
    expect(snapshot.evaluation.status).toBe('healthy');
    expect(snapshot.evaluation.recommendedAction).toBe('complete');
  });
});
