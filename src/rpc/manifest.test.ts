import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { listRpcManifestMethods, loadRpcManifest, validateRpcManifest } from './manifest.js';

const tempDirs: string[] = [];

const validManifest = {
  schemaVersion: 1,
  kind: 'sdkwork.rpc.manifest',
  domain: 'communication',
  sdkFamily: 'sdkwork-im-rpc-sdk',
  services: [
    {
      package: 'sdkwork.communication.app.v3',
      service: 'MessageService',
      surface: 'app',
      methods: [
        {
          method: 'CreateMessage',
          operationId: 'messages.create',
          auth: 'app-session',
          idempotency: 'required',
          streaming: 'unary',
          owner: 'communication-open-api',
          compatibility: 'v3',
        },
      ],
    },
  ],
};

describe('RPC manifest validation', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('accepts a valid sdkwork rpc manifest', () => {
    const manifest = validateRpcManifest(validManifest);

    expect(manifest.kind).toBe('sdkwork.rpc.manifest');
    expect(listRpcManifestMethods(manifest)).toHaveLength(1);
    expect(listRpcManifestMethods(manifest)[0].operationId).toBe('messages.create');
  });

  it('rejects a manifest without sdkwork.rpc.manifest kind', () => {
    expect(() => validateRpcManifest({
      ...validManifest,
      kind: 'not.rpc',
    })).toThrow('RPC manifest kind must be sdkwork.rpc.manifest');
  });

  it('rejects duplicate service method entries', () => {
    expect(() => validateRpcManifest({
      ...validManifest,
      services: [
        {
          ...validManifest.services[0],
          methods: [
            validManifest.services[0].methods[0],
            validManifest.services[0].methods[0],
          ],
        },
      ],
    })).toThrow('Duplicate RPC method');
  });

  it('rejects methods without operationId', () => {
    const method = { ...validManifest.services[0].methods[0], operationId: '' };
    expect(() => validateRpcManifest({
      ...validManifest,
      services: [{ ...validManifest.services[0], methods: [method] }],
    })).toThrow('operationId');
  });

  it('rejects unsupported streaming values', () => {
    const method = { ...validManifest.services[0].methods[0], streaming: 'websocket' };
    expect(() => validateRpcManifest({
      ...validManifest,
      services: [{ ...validManifest.services[0], methods: [method] }],
    })).toThrow('Unsupported RPC streaming mode');
  });

  it('accepts a UTF-8 BOM prefixed manifest file', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'sdkwork-rpc-manifest-'));
    tempDirs.push(tempDir);
    const manifestPath = join(tempDir, 'sdkwork-rpc.manifest.json');
    writeFileSync(manifestPath, `\uFEFF${JSON.stringify(validManifest, null, 2)}`, 'utf-8');

    const manifest = loadRpcManifest(manifestPath);

    expect(manifest.sdkFamily).toBe('sdkwork-im-rpc-sdk');
  });
});
