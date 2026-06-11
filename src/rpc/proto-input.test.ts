import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveRpcProtoInput } from './proto-input.js';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sdkwork-rpc-proto-input-'));
  tempDirs.push(dir);
  return dir;
}

function writeFixture(root: string): { manifestPath: string; protoRoot: string; protoFile: string } {
  const protoRoot = join(root, 'proto');
  const protoDir = join(protoRoot, 'sdkwork', 'communication', 'app', 'v3');
  mkdirSync(protoDir, { recursive: true });
  const protoFile = join(protoDir, 'message_service.proto');
  writeFileSync(protoFile, `syntax = "proto3";
package sdkwork.communication.app.v3;
service MessageService {
  rpc CreateMessage(CreateMessageRequest) returns (CreateMessageResponse);
}
message CreateMessageRequest { string text = 1; }
message CreateMessageResponse { string message_id = 1; }
`, 'utf-8');

  const manifestPath = join(root, 'sdkwork-im-rpc.manifest.json');
  writeFileSync(manifestPath, JSON.stringify({
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
  }, null, 2), 'utf-8');

  return { manifestPath, protoRoot, protoFile };
}

describe('RPC proto input resolution', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('resolves proto files from manifest package names and proto root', () => {
    const fixture = writeFixture(createTempDir());

    const input = resolveRpcProtoInput({
      manifestPath: fixture.manifestPath,
      protoRoot: fixture.protoRoot,
    });

    expect(input.manifest.sdkFamily).toBe('sdkwork-im-rpc-sdk');
    expect(input.protoFiles).toEqual([fixture.protoFile.replace(/\\/g, '/')]);
    expect(input.importRoots).toEqual([fixture.protoRoot.replace(/\\/g, '/')]);
  });

  it('accepts an explicit proto file list', () => {
    const fixture = writeFixture(createTempDir());

    const input = resolveRpcProtoInput({
      manifestPath: fixture.manifestPath,
      protoRoot: fixture.protoRoot,
      protoFiles: [fixture.protoFile],
    });

    expect(input.protoFiles).toEqual([fixture.protoFile.replace(/\\/g, '/')]);
  });

  it('rejects missing proto root', () => {
    const root = createTempDir();
    const fixture = writeFixture(root);

    expect(() => resolveRpcProtoInput({
      manifestPath: fixture.manifestPath,
      protoRoot: join(root, 'missing-proto'),
    })).toThrow('RPC proto root does not exist');
  });

  it('rejects missing explicit proto files', () => {
    const fixture = writeFixture(createTempDir());

    expect(() => resolveRpcProtoInput({
      manifestPath: fixture.manifestPath,
      protoRoot: fixture.protoRoot,
      protoFiles: [join(fixture.protoRoot, 'missing.proto')],
    })).toThrow('RPC proto file does not exist');
  });
});
