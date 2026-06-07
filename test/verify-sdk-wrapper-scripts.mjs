import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '..');

const app = 'app';
const backend = 'backend';

const retiredTokens = [
  `sdkwork-${app}-sdk`,
  `sdkwork-${backend}-sdk`,
  `@sdkwork/${app}-sdk`,
  `@sdkwork/${backend}-sdk`,
  `sdkwork/${app}-sdk`,
  `sdkwork/${backend}-sdk`,
  `github.com/sdkwork/${app}-sdk`,
  `github.com/sdkwork/${backend}-sdk`,
  `sdkwork_${app}_sdk`,
  `sdkwork_${backend}_sdk`,
];

const scannedSources = [
  'README.md',
  'rust',
  'src',
  'test',
  'tmp-js',
];

function runCheck(name, check) {
  try {
    check();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf-8',
    ...options,
  });
}

runCheck('sdkgen bin wrapper is present', () => {
  const binPath = resolve(repoRoot, 'bin/sdkgen.js');
  assert.equal(existsSync(binPath), true, 'bin/sdkgen.js should exist');
  const content = readFileSync(binPath, 'utf-8');
  assert.match(content, /tmp-js\/cli\.js/);
});

runCheck('authored generator sources do not contain retired generic sdk packages', () => {
  const rgArgs = [
    '-n',
    retiredTokens.join('|'),
    ...scannedSources,
    '--hidden',
    '-g',
    '!**/node_modules/**',
  ];
  const result = spawnSync('rg', rgArgs, {
    cwd: repoRoot,
    encoding: 'utf-8',
  });

  assert.equal(result.status, 1, result.stdout || result.stderr);
});

runCheck('version resolver derives product package baselines for non-typescript languages', () => {
  const result = runNode(['./bin/test-runner.mjs', 'src/versioning.test.ts'], {
    stdio: 'pipe',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
