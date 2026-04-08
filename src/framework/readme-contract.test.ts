import { describe, expect, it } from 'vitest';

import type { GeneratedFile } from './types.js';
import { normalizeReadmeFile } from './readme.js';

describe('readme regeneration contract', () => {
  it('appends the shared regeneration contract to generated README files', () => {
    const readme: GeneratedFile = {
      path: 'docs/generated-readme.md',
      content: '# Example SDK\n\nHello world.\n',
      language: 'typescript',
    };

    const normalized = normalizeReadmeFile(readme);

    expect(normalized.file.path).toBe('README.md');
    expect(normalized.file.content).toContain('## Regeneration Contract');
    expect(normalized.file.content).toContain('`custom/`');
    expect(normalized.file.content).toContain('`.sdkwork/sdkwork-generator-manifest.json`');
    expect(normalized.file.content).toContain('`.sdkwork/sdkwork-generator-changes.json`');
    expect(normalized.file.content).toContain('`.sdkwork/sdkwork-generator-report.json`');
    expect(normalized.file.content).toContain('impact areas');
    expect(normalized.file.content).toContain('verification plan');
    expect(normalized.file.content).toContain('execution decision');
    expect(normalized.file.content).toContain('execution handoff');
    expect(normalized.file.content).toContain('schemaVersion');
    expect(normalized.file.content).toContain('artifact paths');
  });
});
