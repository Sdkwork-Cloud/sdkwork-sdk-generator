import { SDKWORK_GENERATOR_PACKAGE } from './framework/sdk-metadata.js';
import { getLanguageCapabilities } from './language-capabilities.js';
import { getLanguageRegistry } from './language-registry.js';

export interface LanguageCatalogEntry {
  language: string;
  displayName: string;
  description: string;
  supportsGeneratedTests: boolean;
  supportsReadme: boolean;
  supportsCustomScaffold: boolean;
  supportsPublishWorkflow: boolean;
  hasDistinctBuildStep: boolean;
}

export interface LanguageCatalogOutputOptions {
  json?: boolean;
}

export function buildLanguageCatalog(): LanguageCatalogEntry[] {
  const capabilitiesByLanguage = new Map(
    getLanguageCapabilities().map((entry) => [entry.language, entry] as const)
  );

  return getLanguageRegistry().map((entry) => {
    const capability = capabilitiesByLanguage.get(entry.language);
    if (!capability) {
      throw new Error(`Missing capability profile for language: ${entry.language}`);
    }

    return {
      language: entry.language,
      displayName: entry.config.displayName,
      description: entry.config.description,
      supportsGeneratedTests: capability.supportsGeneratedTests,
      supportsReadme: capability.supportsReadme,
      supportsCustomScaffold: capability.supportsCustomScaffold,
      supportsPublishWorkflow: capability.supportsPublishWorkflow,
      hasDistinctBuildStep: capability.hasDistinctBuildStep,
    };
  });
}

export function formatLanguageCatalogOutput(options: LanguageCatalogOutputOptions = {}): string {
  const catalog = buildLanguageCatalog();
  if (options.json) {
    return `${JSON.stringify({
      schemaVersion: 1,
      generator: SDKWORK_GENERATOR_PACKAGE,
      languages: catalog,
    }, null, 2)}\n`;
  }

  const headers = [
    'Language',
    'Flag',
    'Generated Tests',
    'README',
    'Custom Scaffold',
    'Publish Workflow',
    'Distinct Build Step',
  ] as const;
  const rows = catalog.map((entry) => [
    entry.displayName,
    entry.language,
    toYesNo(entry.supportsGeneratedTests),
    toYesNo(entry.supportsReadme),
    toYesNo(entry.supportsCustomScaffold),
    toYesNo(entry.supportsPublishWorkflow),
    toYesNo(entry.hasDistinctBuildStep),
  ]);
  const columnWidths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length))
  );

  const lines = [
    'Supported languages:',
    '',
    formatRow(headers, columnWidths),
    formatRow(columnWidths.map((width) => '-'.repeat(width)), columnWidths),
    ...rows.map((row) => formatRow(row, columnWidths)),
  ];
  return `${lines.join('\n')}\n`;
}

function toYesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

function formatRow(values: readonly string[], widths: readonly number[]): string {
  return values.map((value, index) => value.padEnd(widths[index], ' ')).join('  ');
}
