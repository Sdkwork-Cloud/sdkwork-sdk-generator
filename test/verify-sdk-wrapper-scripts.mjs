import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '..', '..', '..');

function readRepoFile(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf-8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expectPowerShellWrapper(content, schemaPath, apiPrefix) {
  assert.match(content, /\[string\]\$BaseUrl/);
  assert.match(content, /\[Alias\("Host"\)\]/);
  assert.match(content, /\[string\]\$Domain/);
  assert.match(content, /\[int\]\$Port/);
  assert.match(content, /\[string\]\$Scheme/);
  assert.match(content, /\[string\]\$SchemaUrl/);
  assert.match(content, /--base-url/);
  assert.match(content, new RegExp(escapeRegExp(schemaPath)));
  assert.match(content, new RegExp(escapeRegExp(apiPrefix)));
}

function expectShellWrapper(content, schemaPath, apiPrefix) {
  assert.match(content, /BASE_URL="\$\{BASE_URL:-/);
  assert.match(content, /HOST="\$\{HOST:-\$\{DOMAIN:-localhost\}\}"/);
  assert.match(content, /PORT="\$\{PORT:-8080\}"/);
  assert.match(content, /SCHEME="\$\{SCHEME:-http\}"/);
  assert.match(content, /SCHEMA_URL="\$\{SCHEMA_URL:-/);
  assert.match(content, /--base-url/);
  assert.match(content, new RegExp(escapeRegExp(schemaPath)));
  assert.match(content, new RegExp(escapeRegExp(apiPrefix)));
}

function expectReadmeWrapperUsage(content, sdkRoot) {
  const normalizedRootPattern = escapeRegExp(sdkRoot).replace(/\//g, '[/\\\\]');
  assert.match(content, new RegExp(`${normalizedRootPattern}[/\\\\]bin[/\\\\]generate-sdk\\.sh`));
  assert.match(content, new RegExp(`${normalizedRootPattern}[/\\\\]bin[/\\\\]generate-sdk\\.ps1`));
  assert.match(content, /localhost:8080/);
  assert.ok(content.includes('BASE_URL=') || content.includes('-BaseUrl '));
}

function runCheck(name, check) {
  try {
    check();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const wrappers = [
  {
    sdkRoot: 'spring-ai-plus-app-api/sdkwork-sdk-app',
    ps1Path: 'spring-ai-plus-app-api/sdkwork-sdk-app/bin/generate-sdk.ps1',
    shPath: 'spring-ai-plus-app-api/sdkwork-sdk-app/bin/generate-sdk.sh',
    readmePath: 'spring-ai-plus-app-api/sdkwork-sdk-app/README.md',
    schemaPath: '/v3/api-docs/app',
    apiPrefix: '/app/v3/api',
  },
  {
    sdkRoot: 'spring-ai-plus-backend-api/sdkwork-sdk-backend',
    ps1Path: 'spring-ai-plus-backend-api/sdkwork-sdk-backend/bin/generate-sdk.ps1',
    shPath: 'spring-ai-plus-backend-api/sdkwork-sdk-backend/bin/generate-sdk.sh',
    readmePath: 'spring-ai-plus-backend-api/sdkwork-sdk-backend/README.md',
    schemaPath: '/v3/api-docs/backend',
    apiPrefix: '/backend/v3/api',
  },
  {
    sdkRoot: 'spring-ai-plus-ai-api/sdkwork-sdk-ai',
    ps1Path: 'spring-ai-plus-ai-api/sdkwork-sdk-ai/bin/generate-sdk.ps1',
    shPath: 'spring-ai-plus-ai-api/sdkwork-sdk-ai/bin/generate-sdk.sh',
    readmePath: 'spring-ai-plus-ai-api/sdkwork-sdk-ai/README.md',
    schemaPath: '/v3/api-docs/ai',
    apiPrefix: '/ai/v3',
  },
];

runCheck('each sdk root has a unified PowerShell wrapper', () => {
  wrappers.forEach(({ ps1Path, schemaPath, apiPrefix }) => {
    assert.equal(existsSync(resolve(repoRoot, ps1Path)), true, `${ps1Path} should exist`);
    expectPowerShellWrapper(readRepoFile(ps1Path), schemaPath, apiPrefix);
  });
});

runCheck('each sdk root has a unified shell wrapper', () => {
  wrappers.forEach(({ shPath, schemaPath, apiPrefix }) => {
    assert.equal(existsSync(resolve(repoRoot, shPath)), true, `${shPath} should exist`);
    expectShellWrapper(readRepoFile(shPath), schemaPath, apiPrefix);
  });
});

runCheck('each sdk readme documents wrapper-based regeneration', () => {
  wrappers.forEach(({ readmePath, sdkRoot }) => {
    expectReadmeWrapperUsage(readRepoFile(readmePath), sdkRoot);
  });
});
