import { describe, expect, it } from 'vitest';

import viteConfig from '../vite.config.ts';

describe('vite config', () => {
  it('externalizes node builtins used by the generator runtime', () => {
    const external = viteConfig.build?.rollupOptions?.external;
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
