import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import type { GeneratedFile } from './types.js';
import {
  SDKWORK_GENERATOR_CHANGES_PATH,
  SDKWORK_GENERATOR_MANIFEST_PATH,
  syncGeneratedOutput,
} from './output-sync.js';

const tempDirs: string[] = [];

const sdkMetadata = {
  name: 'TestSDK',
  version: '1.0.0',
  language: 'typescript' as const,
  sdkType: 'backend' as const,
  packageName: '@sdkwork/test-sdk',
};

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sdkwork-output-sync-'));
  tempDirs.push(dir);
  return dir;
}

function snapshotDirectory(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const nextPath = join(current, entry);
      if (statSync(nextPath).isDirectory()) {
        walk(nextPath);
        continue;
      }
      const relativePath = relative(root, nextPath).replace(/\\/g, '/');
      if (relativePath === SDKWORK_GENERATOR_CHANGES_PATH) {
        continue;
      }
      files[relativePath] = readFileSync(nextPath, 'utf-8');
    }
  };
  walk(root);
  return files;
}

describe('output sync', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('preserves custom files, backs up manual generated edits, and prunes stale generated files', () => {
    const outputDir = createTempDir();
    const firstGeneration: GeneratedFile[] = [
      {
        path: 'src/api.ts',
        content: 'export const version = "v1";\n',
        language: 'typescript',
      },
      {
        path: 'src/types.ts',
        content: 'export type Version = "v1";\n',
        language: 'typescript',
      },
      {
        path: 'custom/README.md',
        content: '# Custom Code\n',
        language: 'typescript',
        ownership: 'scaffold',
        overwriteStrategy: 'if-missing',
      },
    ];

    syncGeneratedOutput(outputDir, firstGeneration, {
      cleanGenerated: true,
      sdk: sdkMetadata,
    });

    writeFileSync(join(outputDir, 'src/api.ts'), 'manual generated change\n', 'utf-8');
    writeFileSync(join(outputDir, 'custom/README.md'), 'manual custom readme\n', 'utf-8');
    writeFileSync(join(outputDir, 'custom/user-wrapper.ts'), 'export const preserved = true;\n', 'utf-8');

    const secondGeneration: GeneratedFile[] = [
      {
        path: 'src/api.ts',
        content: 'export const version = "v2";\n',
        language: 'typescript',
      },
      {
        path: 'custom/README.md',
        content: '# Custom Code\nshould not overwrite\n',
        language: 'typescript',
        ownership: 'scaffold',
        overwriteStrategy: 'if-missing',
      },
    ];

    const summary = syncGeneratedOutput(outputDir, secondGeneration, {
      cleanGenerated: true,
      sdk: sdkMetadata,
    });

    expect(readFileSync(join(outputDir, 'src/api.ts'), 'utf-8')).toBe('export const version = "v2";\n');
    expect(existsSync(join(outputDir, 'src/types.ts'))).toBe(false);
    expect(readFileSync(join(outputDir, 'custom/README.md'), 'utf-8')).toBe('manual custom readme\n');
    expect(readFileSync(join(outputDir, 'custom/user-wrapper.ts'), 'utf-8')).toBe('export const preserved = true;\n');
    expect(readFileSync(join(outputDir, '.sdkwork/manual-backups/src/api.ts'), 'utf-8')).toBe(
      'manual generated change\n'
    );

    const manifest = JSON.parse(
      readFileSync(join(outputDir, SDKWORK_GENERATOR_MANIFEST_PATH), 'utf-8')
    ) as {
      generatedFiles: Array<{ path: string }>;
      scaffoldFiles: string[];
    };
    const changeSummary = JSON.parse(
      readFileSync(join(outputDir, SDKWORK_GENERATOR_CHANGES_PATH), 'utf-8')
    ) as {
      changeFingerprint: string;
      changes: {
        createdGeneratedFiles: string[];
        updatedGeneratedFiles: string[];
        unchangedGeneratedFiles: string[];
        deletedGeneratedFiles: string[];
        scaffoldedFiles: string[];
        preservedScaffoldFiles: string[];
        backedUpFiles: string[];
      };
      impact: {
        areas: string[];
        requiresVerification: boolean;
      };
      verificationPlan: {
        shouldRun: boolean;
        runPhase: string;
        steps: Array<{ id: string }>;
      };
      executionDecision: {
        nextAction: string;
        riskLevel: string;
      };
      preservedLegacyFiles: boolean;
    };

    expect(manifest.generatedFiles.map((entry) => entry.path)).toEqual(['src/api.ts']);
    expect(manifest.scaffoldFiles).toEqual(['custom/README.md']);
    expect(summary.deletedGeneratedFiles).toBe(1);
    expect(summary.backedUpFiles).toEqual(['src/api.ts']);
    expect(summary.changeSummaryPath).toBe(SDKWORK_GENERATOR_CHANGES_PATH);
    expect(typeof summary.changeFingerprint).toBe('string');
    expect(summary.changeFingerprint).not.toBe('');
    expect((summary as typeof summary & {
      impact: {
        areas: string[];
        requiresVerification: boolean;
      };
      verificationPlan: {
        shouldRun: boolean;
        runPhase: string;
        steps: Array<{ id: string }>;
      };
      executionDecision: {
        nextAction: string;
        riskLevel: string;
      };
    }).verificationPlan).toMatchObject({
      shouldRun: true,
      runPhase: 'now',
      steps: [{ id: 'check' }, { id: 'build' }],
    });
    expect((summary as typeof summary & {
      executionDecision: {
        nextAction: string;
        riskLevel: string;
      };
    }).executionDecision).toMatchObject({
      nextAction: 'verify',
      riskLevel: 'high',
    });
    expect((summary as typeof summary & {
      impact: {
        areas: string[];
        requiresVerification: boolean;
      };
    }).impact).toMatchObject({
      areas: ['api-surface', 'models'],
      requiresVerification: true,
    });
    expect(summary.changes).toEqual({
      createdGeneratedFiles: [],
      updatedGeneratedFiles: ['src/api.ts'],
      unchangedGeneratedFiles: [],
      deletedGeneratedFiles: ['src/types.ts'],
      scaffoldedFiles: [],
      preservedScaffoldFiles: ['custom/README.md'],
      backedUpFiles: ['src/api.ts'],
    });
    expect(changeSummary.changes).toEqual(summary.changes);
    expect(changeSummary.changeFingerprint).toBe(summary.changeFingerprint);
    expect(changeSummary.impact).toMatchObject({
      areas: ['api-surface', 'models'],
      requiresVerification: true,
    });
    expect(changeSummary.verificationPlan).toMatchObject({
      shouldRun: true,
      runPhase: 'now',
      steps: [{ id: 'check' }, { id: 'build' }],
    });
    expect(changeSummary.executionDecision).toMatchObject({
      nextAction: 'verify',
      riskLevel: 'high',
    });
    expect(changeSummary.preservedLegacyFiles).toBe(false);
  });

  it('keeps output idempotent when regenerating with the same generated file set', () => {
    const outputDir = createTempDir();
    const files: GeneratedFile[] = [
      {
        path: 'src/index.ts',
        content: 'export * from "./sdk";\n',
        language: 'typescript',
      },
      {
        path: 'custom/README.md',
        content: '# Custom Code\n',
        language: 'typescript',
        ownership: 'scaffold',
        overwriteStrategy: 'if-missing',
      },
    ];

    syncGeneratedOutput(outputDir, files, {
      cleanGenerated: true,
      sdk: sdkMetadata,
    });
    const firstSnapshot = snapshotDirectory(outputDir);

    const summary = syncGeneratedOutput(outputDir, files, {
      cleanGenerated: true,
      sdk: sdkMetadata,
    });
    const secondSnapshot = snapshotDirectory(outputDir);

    expect(secondSnapshot).toEqual(firstSnapshot);
    expect(summary.writtenFiles).toBe(0);
    expect(summary.skippedScaffoldFiles).toBe(1);
    expect(summary.skippedUnchangedGeneratedFiles).toBe(1);
    expect(summary.changes).toEqual({
      createdGeneratedFiles: [],
      updatedGeneratedFiles: [],
      unchangedGeneratedFiles: ['src/index.ts'],
      deletedGeneratedFiles: [],
      scaffoldedFiles: [],
      preservedScaffoldFiles: ['custom/README.md'],
      backedUpFiles: [],
    });
    expect((summary as typeof summary & {
      impact: {
        areas: string[];
        requiresVerification: boolean;
      };
      verificationPlan: {
        shouldRun: boolean;
        runPhase: string;
        steps: Array<{ id: string }>;
      };
      executionDecision: {
        nextAction: string;
        riskLevel: string;
      };
    }).verificationPlan).toMatchObject({
      shouldRun: false,
      runPhase: 'skip',
      steps: [],
    });
    expect((summary as typeof summary & {
      executionDecision: {
        nextAction: string;
        riskLevel: string;
      };
    }).executionDecision).toMatchObject({
      nextAction: 'skip',
      riskLevel: 'low',
    });
    expect((summary as typeof summary & {
      impact: {
        areas: string[];
        requiresVerification: boolean;
      };
    }).impact).toMatchObject({
      areas: [],
      requiresVerification: false,
    });
  });

  it('preserves unknown legacy files when no prior generator manifest exists', () => {
    const outputDir = createTempDir();
    mkdirSync(join(outputDir, 'legacy'), { recursive: true });
    mkdirSync(join(outputDir, 'custom'), { recursive: true });
    writeFileSync(join(outputDir, 'legacy/orphan.ts'), 'legacy generated before manifest\n', 'utf-8');
    writeFileSync(join(outputDir, 'custom/manual.ts'), 'manual extension\n', 'utf-8');

    syncGeneratedOutput(
      outputDir,
      [
        {
          path: 'src/index.ts',
          content: 'export const generated = true;\n',
          language: 'typescript',
        },
      ],
      {
        cleanGenerated: true,
        sdk: sdkMetadata,
      }
    );

    expect(readFileSync(join(outputDir, 'legacy/orphan.ts'), 'utf-8')).toBe(
      'legacy generated before manifest\n'
    );
    expect(readFileSync(join(outputDir, 'custom/manual.ts'), 'utf-8')).toBe('manual extension\n');
    expect(readFileSync(join(outputDir, 'src/index.ts'), 'utf-8')).toBe('export const generated = true;\n');
  });

  it('supports dry-run previews without modifying the filesystem', () => {
    const outputDir = createTempDir();
    const initialFiles: GeneratedFile[] = [
      {
        path: 'src/api.ts',
        content: 'export const version = "v1";\n',
        language: 'typescript',
      },
      {
        path: 'src/types.ts',
        content: 'export type Version = "v1";\n',
        language: 'typescript',
      },
      {
        path: 'custom/README.md',
        content: '# Custom Code\n',
        language: 'typescript',
        ownership: 'scaffold',
        overwriteStrategy: 'if-missing',
      },
    ];

    syncGeneratedOutput(outputDir, initialFiles, {
      cleanGenerated: true,
      sdk: sdkMetadata,
    });

    writeFileSync(join(outputDir, 'src/api.ts'), 'manual generated change\n', 'utf-8');
    writeFileSync(join(outputDir, 'custom/README.md'), 'manual custom readme\n', 'utf-8');
    const beforeChangeSummary = readFileSync(
      join(outputDir, SDKWORK_GENERATOR_CHANGES_PATH),
      'utf-8'
    );
    const beforeSnapshot = snapshotDirectory(outputDir);

    const summary = syncGeneratedOutput(
      outputDir,
      [
        {
          path: 'src/api.ts',
          content: 'export const version = "v2";\n',
          language: 'typescript',
        },
        {
          path: 'custom/README.md',
          content: '# Custom Code\nshould not overwrite\n',
          language: 'typescript',
          ownership: 'scaffold',
          overwriteStrategy: 'if-missing',
        },
      ],
      {
        cleanGenerated: true,
        dryRun: true,
        sdk: sdkMetadata,
      }
    );
    const afterSnapshot = snapshotDirectory(outputDir);

    expect(afterSnapshot).toEqual(beforeSnapshot);
    expect(summary.dryRun).toBe(true);
    expect(summary.writtenFiles).toBe(1);
    expect(summary.deletedGeneratedFiles).toBe(1);
    expect(summary.backedUpFiles).toEqual(['src/api.ts']);
    expect(summary.changes).toEqual({
      createdGeneratedFiles: [],
      updatedGeneratedFiles: ['src/api.ts'],
      unchangedGeneratedFiles: [],
      deletedGeneratedFiles: ['src/types.ts'],
      scaffoldedFiles: [],
      preservedScaffoldFiles: ['custom/README.md'],
      backedUpFiles: ['src/api.ts'],
    });
    expect(readFileSync(join(outputDir, 'src/api.ts'), 'utf-8')).toBe('manual generated change\n');
    expect(readFileSync(join(outputDir, 'src/types.ts'), 'utf-8')).toBe('export type Version = "v1";\n');
    expect(readFileSync(join(outputDir, 'custom/README.md'), 'utf-8')).toBe('manual custom readme\n');
    expect(readFileSync(join(outputDir, SDKWORK_GENERATOR_CHANGES_PATH), 'utf-8')).toBe(
      beforeChangeSummary
    );
  });

  it('does not create a missing output directory during dry-run preview', () => {
    const parentDir = createTempDir();
    const outputDir = join(parentDir, 'preview-sdk');

    const summary = syncGeneratedOutput(
      outputDir,
      [
        {
          path: 'src/index.ts',
          content: 'export const generated = true;\n',
          language: 'typescript',
        },
        {
          path: 'custom/README.md',
          content: '# Custom Code\n',
          language: 'typescript',
          ownership: 'scaffold',
          overwriteStrategy: 'if-missing',
        },
      ],
      {
        cleanGenerated: true,
        dryRun: true,
        sdk: sdkMetadata,
      }
    );

    expect(existsSync(outputDir)).toBe(false);
    expect(summary.dryRun).toBe(true);
    expect(summary.changes).toEqual({
      createdGeneratedFiles: ['src/index.ts'],
      updatedGeneratedFiles: [],
      unchangedGeneratedFiles: [],
      deletedGeneratedFiles: [],
      scaffoldedFiles: ['custom/README.md'],
      preservedScaffoldFiles: [],
      backedUpFiles: [],
    });
  });

  it('rejects apply when expected change fingerprint does not match before any writes happen', () => {
    const outputDir = createTempDir();
    syncGeneratedOutput(
      outputDir,
      [
        {
          path: 'src/api.ts',
          content: 'export const version = "v1";\n',
          language: 'typescript',
        },
      ],
      {
        cleanGenerated: true,
        sdk: sdkMetadata,
      }
    );

    writeFileSync(join(outputDir, 'src/api.ts'), 'manual generated change\n', 'utf-8');
    const previousChangeSummary = readFileSync(
      join(outputDir, SDKWORK_GENERATOR_CHANGES_PATH),
      'utf-8'
    );

    expect(() => syncGeneratedOutput(
      outputDir,
      [
        {
          path: 'src/api.ts',
          content: 'export const version = "v2";\n',
          language: 'typescript',
        },
      ],
      {
        cleanGenerated: true,
        expectedChangeFingerprint: 'mismatch',
        sdk: sdkMetadata,
      }
    )).toThrow('Expected change fingerprint mismatch');

    expect(readFileSync(join(outputDir, 'src/api.ts'), 'utf-8')).toBe('manual generated change\n');
    expect(existsSync(join(outputDir, '.sdkwork/manual-backups/src/api.ts'))).toBe(false);
    expect(readFileSync(join(outputDir, SDKWORK_GENERATOR_CHANGES_PATH), 'utf-8')).toBe(
      previousChangeSummary
    );
  });

  it('rejects generated files that target protected custom or state roots', () => {
    const outputDir = createTempDir();

    expect(() => syncGeneratedOutput(
      outputDir,
      [
        {
          path: 'custom/generated.ts',
          content: 'export const unsafe = true;\n',
          language: 'typescript',
        },
      ],
      {
        cleanGenerated: true,
        sdk: sdkMetadata,
      }
    )).toThrow('protected output root');

    expect(() => syncGeneratedOutput(
      outputDir,
      [
        {
          path: '.sdkwork/rogue.json',
          content: '{}\n',
          language: 'typescript',
          ownership: 'scaffold',
          overwriteStrategy: 'if-missing',
        },
      ],
      {
        cleanGenerated: true,
        sdk: sdkMetadata,
      }
    )).toThrow('protected output root');
  });
});
