#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = process.execPath;
const args = process.argv.slice(2);
const vitestArgs = args.includes('--run') || args.includes('run') ? args : ['run', ...args];
const vitestCli = path.join(projectRoot, 'node_modules', 'vitest', 'vitest.mjs');

const result = spawnSync(executable, [vitestCli, ...vitestArgs], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
