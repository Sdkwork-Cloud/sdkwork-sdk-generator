import { describe, expect, it } from 'vitest';

import { createSandboxExpect } from '../../test-support/vitest-shim.js';

describe('sandbox vitest shim', () => {
  it('supports arrayContaining, negation, and rejects.toThrow without Vitest worker state', async () => {
    const localExpect = createSandboxExpect();

    localExpect([1, 2, 3]).toEqual(localExpect.arrayContaining([2, 3]));
    localExpect('sdk-generator').not.toContain('vitest-cli');
    await localExpect(Promise.reject(new Error('spawn EPERM'))).rejects.toThrow('spawn EPERM');

    expect(localExpect.getState().assertionCalls).toBe(3);
  });
});
