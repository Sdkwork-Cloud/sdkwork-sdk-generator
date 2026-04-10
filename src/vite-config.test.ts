import { describe, expect, it } from 'vitest';

import { SDK_GENERATOR_VITE_EXTERNALS } from './vite-config-shared.js';

describe('vite config', () => {
  it('externalizes node builtins used by the generator runtime', () => {
    const external = SDK_GENERATOR_VITE_EXTERNALS;
    expect(Array.isArray(external)).toBe(true);

    const entries = external as Array<string | RegExp>;
    expect(entries).toEqual(
      expect.arrayContaining([
        '@sdkwork/sdk-common',
        'fs',
        'path',
        'url',
        'node:fs',
        'node:path',
        'node:url',
        'node:crypto',
        /^@sdkwork\/sdk-common\/.*/,
        /^node:/,
      ])
    );
  });
});
