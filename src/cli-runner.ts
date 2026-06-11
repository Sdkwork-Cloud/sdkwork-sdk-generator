import { resolve } from 'node:path';

import { generateSdk, getSupportedLanguages, getSupportedSdkTypes } from './index.js';
import { persistGenerateExecutionReport } from './execution-report.js';
import { syncGeneratedOutput, type OutputSyncSummary } from './framework/output-sync.js';
import { loadOpenApiSpec } from './framework/spec-loader.js';
import type {
  ApiSpec,
  GeneratorConfig,
  GeneratorResult,
  Language,
  SdkProtocol,
  SdkType,
} from './framework/types.js';
import { resolveSdkVersion, type ResolveSdkVersionResult } from './framework/versioning.js';
import { resolveRpcProtoInput } from './rpc/proto-input.js';
import { generateRpcSdk } from './rpc/rpc-generation-runner.js';

export interface GenerateCommandOptions {
  input: string;
  output: string;
  name: string;
  protocol?: SdkProtocol;
  type?: SdkType;
  language?: Language;
  baseUrl?: string;
  apiPrefix?: string;
  packageName?: string;
  namespace?: string;
  commonPackage?: string;
  clientName?: string;
  legacyClientName?: string;
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
  emitControlPlane?: boolean;
  expectedChangeFingerprint?: string;
  standardProfile?: 'sdkwork-v3';
  protoRoot?: string;
  protoFiles?: string[];
  importRoots?: string[];
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
  const protocol = options.protocol || 'http';
  if (protocol === 'rpc') {
    return runRpcGenerateCommand(options);
  }
  if (protocol !== 'http') {
    throw new Error(`Unsupported SDK protocol: ${protocol}. Supported: http, rpc`);
  }
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
  if (options.standardProfile && options.standardProfile !== 'sdkwork-v3') {
    throw new Error(`Unsupported standard profile: ${options.standardProfile}. Supported: sdkwork-v3`);
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
    protocol: 'http',
    outputPath,
    apiSpecPath: options.apiSpecPath,
    baseUrl: options.baseUrl || options.spec.servers?.[0]?.url || 'http://localhost:8080',
    apiPrefix: options.apiPrefix || '',
    packageName: options.packageName,
    namespace: options.namespace,
    commonPackage: options.commonPackage,
    clientName: options.clientName,
    legacyClientName: options.legacyClientName,
    generateReadme: true,
    options: options.standardProfile
      ? { standardProfile: options.standardProfile }
      : undefined,
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
    emitControlPlane: options.emitControlPlane !== false,
    expectedChangeFingerprint: options.expectedChangeFingerprint,
    sdk: {
      name: config.name,
      version: config.version,
      language: config.language,
      sdkType: config.sdkType,
      packageName: config.packageName,
      protocol: config.protocol,
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

async function runRpcGenerateCommand(
  options: GenerateCommandOptions
): Promise<GenerateCommandExecution> {
  if (!options.protoRoot) {
    throw new Error('RPC generation requires --proto-root.');
  }
  if (options.standardProfile) {
    throw new Error('--standard-profile is only supported for HTTP/OpenAPI generation.');
  }

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
  const rpc = resolveRpcProtoInput({
    manifestPath: options.input,
    protoRoot: options.protoRoot,
    protoFiles: options.protoFiles,
    importRoots: options.importRoots,
  });
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
    protocol: 'rpc',
    outputPath,
    apiSpecPath: rpc.manifestPath,
    baseUrl: options.baseUrl || 'http://localhost:8080',
    apiPrefix: options.apiPrefix || '',
    packageName: options.packageName,
    namespace: options.namespace,
    commonPackage: options.commonPackage,
    clientName: options.clientName,
    legacyClientName: options.legacyClientName,
    generateReadme: true,
    rpc,
  };

  const result = await generateRpcSdk(config, rpc);
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
    emitControlPlane: options.emitControlPlane === true,
    expectedChangeFingerprint: options.expectedChangeFingerprint,
    sdk: {
      name: config.name,
      version: config.version,
      language: config.language,
      sdkType: config.sdkType,
      packageName: config.packageName,
      protocol: config.protocol,
    },
  });

  const spec = createRpcPlaceholderSpec(options.name, resolvedVersion.version, rpc);
  const execution = {
    config,
    spec,
    result,
    resolvedVersion,
    syncSummary,
  };
  persistGenerateExecutionReport(execution);
  return execution;
}

function createRpcPlaceholderSpec(
  name: string,
  version: string,
  rpc: ReturnType<typeof resolveRpcProtoInput>
): ApiSpec {
  return {
    openapi: '3.1.0',
    info: {
      title: `${name} RPC`,
      version,
      description: `RPC SDK generated from ${rpc.manifest.sdkFamily}.`,
    },
    paths: {},
    components: { schemas: {} },
  };
}
