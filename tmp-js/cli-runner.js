import { resolve } from 'node:path';
import { generateSdk, getSupportedLanguages, getSupportedSdkTypes } from './index.js';
import { persistGenerateExecutionReport } from './execution-report.js';
import { syncGeneratedOutput } from './framework/output-sync.js';
import { loadOpenApiSpec } from './framework/spec-loader.js';
import { resolveSdkVersion } from './framework/versioning.js';
export async function runGenerateCommand(options) {
    const apiSpecPath = options.input.startsWith('http://') || options.input.startsWith('https://')
        ? options.input
        : resolve(options.input);
    const spec = await loadOpenApiSpec(options.input);
    return executeGenerate({
        ...options,
        spec,
        apiSpecPath,
    });
}
export async function generateSdkProject(options) {
    return executeGenerate({
        ...options,
        apiSpecPath: options.apiSpecPath || '<in-memory-spec>',
    });
}
async function executeGenerate(options) {
    const language = (options.language || 'typescript');
    const sdkType = (options.type || 'backend');
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
    const config = {
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
