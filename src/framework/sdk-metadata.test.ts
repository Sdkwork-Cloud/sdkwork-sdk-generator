import { describe, expect, it } from 'vitest';

import { buildSdkMetadataManifest } from './sdk-metadata.js';

describe('SDK metadata manifest', () => {
  it('keeps sdkwork-v3 TypeScript consumer and transport names distinct', () => {
    const metadata = buildSdkMetadataManifest({
      name: 'sdkwork-notes-backend-sdk',
      version: '0.1.0',
      language: 'typescript',
      sdkType: 'backend',
      packageName: '@sdkwork/notes-backend-sdk',
      options: { standardProfile: 'sdkwork-v3' },
    });

    expect(metadata.packageName).toBe('sdkwork-notes-backend-sdk-generated-typescript');
    expect(metadata.transportPackageName).toBe('sdkwork-notes-backend-sdk-generated-typescript');
    expect(metadata.consumerPackageName).toBe('@sdkwork/notes-backend-sdk');
  });

  it('uses the generated Rust crate identity instead of TypeScript transport metadata', () => {
    const metadata = buildSdkMetadataManifest({
      name: 'sdkwork-notes-backend-sdk',
      version: '0.1.0',
      language: 'rust',
      sdkType: 'backend',
      packageName: 'sdkwork-notes-backend-sdk-generated-rust',
      options: { standardProfile: 'sdkwork-v3' },
    });

    expect(metadata.packageName).toBe('sdkwork-notes-backend-sdk-generated-rust');
    expect(metadata.transportPackageName).toBe('sdkwork-notes-backend-sdk-generated-rust');
    expect(metadata.consumerPackageName).toBe('sdkwork-notes-backend-sdk-generated-rust');
  });
});
