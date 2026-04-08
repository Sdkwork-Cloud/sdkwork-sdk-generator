import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('package exports', () => {
  it('exposes a stable node-only output sync entry for programmatic safe writes', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')
    ) as {
      exports?: Record<string, { import?: string; types?: string }>;
    };

    expect(packageJson.exports?.['./node/output-sync']).toEqual({
      import: './tmp-js/node/output-sync.js',
      types: './dist/node/output-sync.d.ts',
    });
  });

  it('exposes a stable node-only generate entry for end-to-end programmatic sdk creation', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')
    ) as {
      exports?: Record<string, { import?: string; types?: string }>;
    };

    expect(packageJson.exports?.['./node/generate']).toEqual({
      import: './tmp-js/node/generate.js',
      types: './dist/node/generate.d.ts',
    });
  });

  it('exposes a stable node-only execution report entry for downstream automation', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')
    ) as {
      exports?: Record<string, { import?: string; types?: string }>;
    };

    expect(packageJson.exports?.['./node/execution-report']).toEqual({
      import: './tmp-js/node/execution-report.js',
      types: './dist/node/execution-report.d.ts',
    });
  });

  it('exposes a stable node-only control plane entry for downstream agent orchestration', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')
    ) as {
      exports?: Record<string, { import?: string; types?: string }>;
    };

    expect(packageJson.exports?.['./node/control-plane']).toEqual({
      import: './tmp-js/node/control-plane.js',
      types: './dist/node/control-plane.d.ts',
    });
  });

  it('exposes a stable node-only init entry for programmatic workspace scaffolding', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')
    ) as {
      exports?: Record<string, { import?: string; types?: string }>;
    };

    expect(packageJson.exports?.['./node/init']).toEqual({
      import: './tmp-js/node/init.js',
      types: './dist/node/init.d.ts',
    });
  });
});
