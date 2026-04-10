import { describe, expect, it } from 'vitest';

import { buildLanguageCatalog, formatLanguageCatalogOutput } from './cli-languages.js';

describe('cli languages', () => {
  it('formats the supported language catalog as a human-readable capability table', () => {
    const output = formatLanguageCatalogOutput();

    expect(output).toContain('Supported languages:');
    expect(output).toContain('Language');
    expect(output).toContain('Generated Tests');
    expect(output).toContain('Publish Workflow');
    expect(output).toContain('TypeScript');
    expect(output).toContain('Rust');
    expect(output).toContain('Python');
  });

  it('formats the supported language catalog as machine-readable json', () => {
    const output = formatLanguageCatalogOutput({ json: true });
    const parsed = JSON.parse(output) as {
      schemaVersion: number;
      generator: string;
      languages: Array<{
        language: string;
        displayName: string;
        description: string;
        supportsGeneratedTests: boolean;
        supportsReadme: boolean;
        supportsCustomScaffold: boolean;
        supportsPublishWorkflow: boolean;
        hasDistinctBuildStep: boolean;
      }>;
    };

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.generator).toBe('@sdkwork/sdk-generator');
    expect(parsed.languages).toEqual(buildLanguageCatalog());
    expect(parsed.languages.find((entry) => entry.language === 'typescript')).toMatchObject({
      displayName: 'TypeScript',
      supportsGeneratedTests: true,
      hasDistinctBuildStep: true,
    });
    expect(parsed.languages.find((entry) => entry.language === 'rust')).toMatchObject({
      displayName: 'Rust',
      supportsGeneratedTests: true,
      hasDistinctBuildStep: true,
    });
    expect(parsed.languages.find((entry) => entry.language === 'dart')).toMatchObject({
      displayName: 'Dart',
      supportsGeneratedTests: true,
      hasDistinctBuildStep: false,
    });
    expect(parsed.languages.find((entry) => entry.language === 'go')).toMatchObject({
      displayName: 'Go',
      supportsGeneratedTests: true,
      hasDistinctBuildStep: false,
    });
    expect(parsed.languages.find((entry) => entry.language === 'java')).toMatchObject({
      displayName: 'Java',
      supportsGeneratedTests: true,
      hasDistinctBuildStep: false,
    });
    expect(parsed.languages.find((entry) => entry.language === 'python')).toMatchObject({
      displayName: 'Python',
      supportsGeneratedTests: true,
      hasDistinctBuildStep: false,
    });
    expect(parsed.languages.find((entry) => entry.language === 'swift')).toMatchObject({
      displayName: 'Swift',
      supportsGeneratedTests: true,
      hasDistinctBuildStep: false,
    });
    expect(parsed.languages.find((entry) => entry.language === 'kotlin')).toMatchObject({
      displayName: 'Kotlin',
      supportsGeneratedTests: true,
      hasDistinctBuildStep: false,
    });
    expect(parsed.languages.find((entry) => entry.language === 'flutter')).toMatchObject({
      displayName: 'Flutter/Dart',
      supportsGeneratedTests: true,
      hasDistinctBuildStep: false,
    });
    expect(parsed.languages.find((entry) => entry.language === 'csharp')).toMatchObject({
      displayName: 'C# (.NET)',
      supportsGeneratedTests: true,
      hasDistinctBuildStep: false,
    });
    expect(parsed.languages.find((entry) => entry.language === 'php')).toMatchObject({
      displayName: 'PHP',
      supportsGeneratedTests: true,
      hasDistinctBuildStep: false,
    });
    expect(parsed.languages.find((entry) => entry.language === 'ruby')).toMatchObject({
      displayName: 'Ruby',
      supportsGeneratedTests: true,
      hasDistinctBuildStep: false,
    });
  });
});
