import { resolve } from 'node:path';

import { generateSdk, getSupportedLanguages, getSupportedSdkTypes } from './index.js';
import { persistGenerateExecutionReport } from './execution-report.js';
import { syncGeneratedOutput, type OutputSyncSummary } from './framework/output-sync.js';
import { loadOpenApiSpec } from './framework/spec-loader.js';
import type { ApiSpec, GeneratorConfig, GeneratorResult, Language, SdkType } from './framework/types.js';
import { resolveSdkVersion, type ResolveSdkVersionResult } from './framework/versioning.js';

export interface GenerateCommandOptions {
  input: string;
  output: string;
  name: string;
  type?: SdkType;
  language?: Language;
  baseUrl?: string;
  apiPrefix?: string;
  packageName?: string;
  namespace?: string;
  commonPackage?: string;
  sdkVersion?: string;
  fixedSdkVersion?: string;
  npmRegistry?: string;
  npmPackageName?: string;
  sdkRoot?: string;
  sdkName?: string;
  syncPublishedVersion?: boolean;
  description?: string;
  author?: string;
  license?: string;
  clean?: boolean;
  dryRun?: boolean;
  expectedChangeFingerprint?: string;
}

export interface GenerateCommandExecution {
  config: GeneratorConfig;
  spec: ApiSpec;
  result: GeneratorResult;
  resolvedVersion: ResolveSdkVersionResult;
  syncSummary: OutputSyncSummary;
}

export interface GenerateSdkProjectOptions extends Omit<GenerateCommandOptions, 'input'> {
  spec: ApiSpec;
  apiSpecPath?: string;
}

export async function runGenerateCommand(
  options: GenerateCommandOptions
): Promise<GenerateCommandExecution> {
  const apiSpecPath = options.input.startsWith('http://') || options.input.startsWith('https://')
    ? options.input
    : resolve(options.input);
  const spec = await loadOpenApiSpec(options.input) as ApiSpec;
  return executeGenerate({
    ...options,
    spec,
    apiSpecPath,
  });
}

export async function generateSdkProject(
  options: GenerateSdkProjectOptions
): Promise<GenerateCommandExecution> {
  return executeGenerate({
    ...options,
    apiSpecPath: options.apiSpecPath || '<in-memory-spec>',
  });
}

async function executeGenerate(
  options: GenerateSdkProjectOptions & { apiSpecPath: string }
): Promise<GenerateCommandExecution> {
  const language = (options.language || 'typescript') as Language;
  const sdkType = (options.type || 'backend') as SdkType;

  const supported = getSupportedLanguages();
  if (!supported.includes(language)) {
    throw new Error(`Unsupported language: ${language}`);
  }
  const supportedSdkTypes = getSupportedSdkTypes();
  if (!supportedSdkTypes.includes(sdkType)) {
    throw new Error(`Unsupported SDK type: ${sdkType}. Supported: ${supportedSdkTypes.join(', ')}`);
  }

  if (options.sdkVersion && options.fixedSdkVersion) {
    throw new Error('Use either --sdk-version or --fixed-sdk-version, not both.');
  }

  const outputPath = resolve(options.output);
  const resolvedVersion = await resolveSdkVersion({
    sdkRoot: options.sdkRoot,
    sdkName: options.sdkName,
    outputPath,
    language,
    sdkType,
    packageName: options.packageName,
    npmPackageName: options.npmPackageName,
    requestedVersion: options.fixedSdkVersion || options.sdkVersion,
    fixedVersion: Boolean(options.fixedSdkVersion),
    npmRegistryUrl: options.npmRegistry,
    syncPublishedVersion: options.syncPublishedVersion !== false,
  });

  const config: GeneratorConfig = {
    name: options.name,
    version: resolvedVersion.version,
    description: options.description,
    author: options.author,
    license: options.license || 'MIT',
    language,
    sdkType,
    outputPath,
    apiSpecPath: options.apiSpecPath,
    baseUrl: options.baseUrl || options.spec.servers?.[0]?.url || 'http://localhost:8080',
    apiPrefix: options.apiPrefix || '',
    packageName: options.packageName,
    namespace: options.namespace,
    commonPackage: options.commonPackage,
    generateReadme: true,
  };

  const result = await generateSdk(config, options.spec);
  if (result.errors.length > 0) {
    const message = result.errors.map((error) => `[${error.code}] ${error.message}`).join('\n');
    throw new Error(`Generation failed:\n${message}`);
  }
  if (result.files.length === 0) {
    throw new Error('Generation produced no files.');
  }

  const syncSummary = syncGeneratedOutput(outputPath, result.files, {
    cleanGenerated: options.clean !== false,
    dryRun: options.dryRun === true,
    expectedChangeFingerprint: options.expectedChangeFingerprint,
    sdk: {
      name: config.name,
      version: config.version,
      language: config.language,
      sdkType: config.sdkType,
      packageName: config.packageName,
    },
  });

  const execution = {
    config,
    spec: options.spec,
    result,
    resolvedVersion,
    syncSummary,
  };
  persistGenerateExecutionReport(execution);
  return execution;
}
