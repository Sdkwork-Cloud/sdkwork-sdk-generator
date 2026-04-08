import { describe, expect, it } from 'vitest';

import { analyzeChangeImpact } from './change-impact.js';

function createChanges(
  overrides: Partial<Parameters<typeof analyzeChangeImpact>[0]> = {}
): Parameters<typeof analyzeChangeImpact>[0] {
  return {
    createdGeneratedFiles: [],
    updatedGeneratedFiles: [],
    unchangedGeneratedFiles: [],
    deletedGeneratedFiles: [],
    scaffoldedFiles: [],
    preservedScaffoldFiles: [],
    backedUpFiles: [],
    ...overrides,
  };
}

describe('change impact', () => {
  it('classifies cross-language sdk changes into stable impact areas', () => {
    const impact = analyzeChangeImpact(createChanges({
      createdGeneratedFiles: [
        'src/api/user.ts',
        'src/main/java/com/sdkwork/backend/model/User.java',
        'Http/HttpClient.cs',
        'pom.xml',
        'bin/publish.sh',
        'README.md',
      ],
      scaffoldedFiles: ['custom/README.md'],
    }));

    expect(impact.areas).toEqual([
      'api-surface',
      'models',
      'runtime',
      'build-metadata',
      'publish-workflow',
      'documentation',
      'custom-scaffold',
    ]);
    expect(impact.requiresVerification).toBe(true);
    expect(impact.details.find((detail) => detail.area === 'api-surface')?.paths).toEqual([
      'src/api/user.ts',
    ]);
    expect(impact.details.find((detail) => detail.area === 'models')?.paths).toEqual([
      'src/main/java/com/sdkwork/backend/model/User.java',
    ]);
    expect(impact.details.find((detail) => detail.area === 'runtime')?.paths).toEqual([
      'Http/HttpClient.cs',
    ]);
    expect(impact.details.find((detail) => detail.area === 'build-metadata')?.paths).toEqual([
      'pom.xml',
    ]);
    expect(impact.details.find((detail) => detail.area === 'publish-workflow')?.paths).toEqual([
      'bin/publish.sh',
    ]);
  });

  it('skips verification for documentation and custom scaffold only changes', () => {
    const impact = analyzeChangeImpact(createChanges({
      updatedGeneratedFiles: ['README.md'],
      scaffoldedFiles: ['custom/README.md'],
      preservedScaffoldFiles: ['custom/manual-wrapper.ts'],
    }));

    expect(impact.areas).toEqual(['documentation', 'custom-scaffold']);
    expect(impact.requiresVerification).toBe(false);
    expect(impact.summary).toContain('documentation');
    expect(impact.summary).toContain('custom scaffold');
  });

  it('marks unmatched generated paths as unknown so automation stays safe', () => {
    const impact = analyzeChangeImpact(createChanges({
      updatedGeneratedFiles: ['src/generated/odd-layout.xyz'],
    }));

    expect(impact.areas).toEqual(['unknown']);
    expect(impact.requiresVerification).toBe(true);
    expect(impact.details).toEqual([
      {
        area: 'unknown',
        paths: ['src/generated/odd-layout.xyz'],
      },
    ]);
  });
});
