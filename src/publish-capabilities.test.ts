import { describe, expect, it } from 'vitest';

import {
  getPublishCapability,
  getPublishSupportedLanguages,
  getLanguagesWithDistinctBuildStep,
} from './publish-capabilities.js';

describe('publish capabilities', () => {
  it('describes unified publish support for every generated sdk language', () => {
    expect(getPublishSupportedLanguages()).toEqual([
      'typescript',
      'dart',
      'python',
      'java',
      'kotlin',
      'go',
      'rust',
      'swift',
      'flutter',
      'csharp',
      'php',
      'ruby',
    ]);
  });

  it('marks only languages with a materially distinct build action', () => {
    expect(getLanguagesWithDistinctBuildStep()).toEqual(['rust', 'typescript']);
    expect(getPublishCapability('typescript')).toMatchObject({
      hasUnifiedPublish: true,
      hasDistinctBuildStep: true,
    });
    expect(getPublishCapability('java')).toMatchObject({
      hasUnifiedPublish: true,
      hasDistinctBuildStep: false,
    });
  });
});
