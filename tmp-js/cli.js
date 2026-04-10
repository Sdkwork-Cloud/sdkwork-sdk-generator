#!/usr/bin/env node
import { Command } from 'commander';
import { getSupportedLanguages, getSupportedSdkTypes } from './index.js';
import { formatLanguageCatalogOutput } from './cli-languages.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { formatInspectFailure, formatInspectSuccess, resolveInspectGate, runInspectCommand, } from './cli-inspect.js';
import { formatInitFailure, formatInitSuccess, runInitCommand, } from './cli-init.js';
import { runGenerateCommand } from './cli-runner.js';
import { formatGenerateFailure, formatGenerateSuccess } from './cli-output.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
void __dirname;
const program = new Command();
program
    .name('sdkgen')
    .description('SDKWork SDK Generator')
    .version('1.0.0');
program
    .command('init')
    .description('Initialize a minimal SDK workspace scaffold')
    .requiredOption('-o, --output <path>', 'Output directory')
    .requiredOption('-n, --name <name>', 'SDK name')
    .option('-t, --type <type>', 'SDK type (app, backend, ai, custom)', 'backend')
    .option('-l, --language <lang>', 'Language', 'typescript')
    .option('--package-name <name>', 'Package name')
    .option('--namespace <name>', 'Namespace override for languages that support it, such as C# and PHP')
    .option('--sdk-version <ver>', 'Exact SDK version for the initialized scaffold')
    .option('--description <text>', 'Description')
    .option('--author <name>', 'Author')
    .option('--license <license>', 'License', 'MIT')
    .option('--dry-run', 'Preview scaffold changes without writing output')
    .option('--expected-change-fingerprint <fingerprint>', 'Require the planned scaffold fingerprint to match before writing output')
    .option('--json', 'Emit machine-readable JSON output')
    .action(async (options) => {
    try {
        if (!options.json) {
            console.log(`\nInitializing ${options.language} SDK workspace: ${options.name}\n`);
        }
        const execution = await runInitCommand({
            output: options.output,
            name: options.name,
            type: options.type,
            language: options.language,
            packageName: options.packageName,
            namespace: options.namespace,
            sdkVersion: options.sdkVersion,
            description: options.description,
            author: options.author,
            license: options.license,
            dryRun: options.dryRun,
            expectedChangeFingerprint: options.expectedChangeFingerprint,
        });
        process.stdout.write(formatInitSuccess(execution, {
            json: options.json,
            outputPath: options.output,
            requestedSdkVersion: options.sdkVersion,
        }));
    }
    catch (error) {
        const output = formatInitFailure(error, {
            json: options.json,
            outputPath: options.output,
        });
        process.stderr.write(output.endsWith('\n') ? output : `${output}\n`);
        process.exit(1);
    }
});
program
    .command('generate')
    .requiredOption('-i, --input <path>', 'OpenAPI spec file or URL')
    .requiredOption('-o, --output <path>', 'Output directory')
    .requiredOption('-n, --name <name>', 'SDK name')
    .option('-t, --type <type>', 'SDK type (app, backend, ai, custom)', 'backend')
    .option('-l, --language <lang>', 'Language', 'typescript')
    .option('--base-url <url>', 'Base URL')
    .option('--api-prefix <prefix>', 'API prefix', '')
    .option('--package-name <name>', 'Package name')
    .option('--namespace <name>', 'Namespace override for languages that support it, such as C# and PHP')
    .option('--common-package <spec>', 'Common package spec (language-specific, optional)')
    .option('--sdk-version <ver>', 'SDK version')
    .option('--fixed-sdk-version <ver>', 'Use an exact SDK version without auto-increment checks')
    .option('--npm-registry <url>', 'Registry used for published TypeScript SDK version checks', 'https://registry.npmjs.org')
    .option('--npm-package-name <name>', 'TypeScript npm package used as the published version baseline for multi-language releases')
    .option('--sdk-root <path>', 'SDK workspace root used to scan sibling language package versions')
    .option('--sdk-name <name>', 'SDK workspace prefix, for example sdkwork-app-sdk')
    .option('--no-sync-published-version', 'Skip published npm version checks when resolving sdk version')
    .option('--description <text>', 'Description')
    .option('--author <name>', 'Author')
    .option('--license <license>', 'License', 'MIT')
    .option('--no-clean', 'Do not prune stale generated files before generation')
    .option('--dry-run', 'Preview file changes without writing output')
    .option('--expected-change-fingerprint <fingerprint>', 'Require the planned change fingerprint to match before writing output')
    .option('--json', 'Emit machine-readable JSON output')
    .action(async (options) => {
    const supported = getSupportedLanguages();
    const supportedSdkTypes = getSupportedSdkTypes();
    if (!supported.includes(options.language)) {
        const message = `Unsupported language: ${options.language}`;
        console.error(options.json ? formatGenerateFailure(new Error(message), {
            json: true,
            outputPath: options.output,
        }) : message);
        process.exit(1);
    }
    if (!supportedSdkTypes.includes(options.type)) {
        const message = `Unsupported SDK type: ${options.type}. Supported: ${supportedSdkTypes.join(', ')}`;
        console.error(options.json ? formatGenerateFailure(new Error(message), {
            json: true,
            outputPath: options.output,
        }) : message);
        process.exit(1);
    }
    try {
        if (!options.json) {
            console.log(`\nGenerating ${options.language} SDK: ${options.name}\n`);
        }
        const execution = await runGenerateCommand({
            input: options.input,
            output: options.output,
            name: options.name,
            type: options.type,
            language: options.language,
            baseUrl: options.baseUrl,
            apiPrefix: options.apiPrefix,
            packageName: options.packageName,
            namespace: options.namespace,
            commonPackage: options.commonPackage,
            sdkVersion: options.sdkVersion,
            fixedSdkVersion: options.fixedSdkVersion,
            npmRegistry: options.npmRegistry,
            npmPackageName: options.npmPackageName,
            sdkRoot: options.sdkRoot,
            sdkName: options.sdkName,
            syncPublishedVersion: options.syncPublishedVersion,
            description: options.description,
            author: options.author,
            license: options.license,
            clean: options.clean,
            dryRun: options.dryRun,
            expectedChangeFingerprint: options.expectedChangeFingerprint,
        });
        process.stdout.write(formatGenerateSuccess(execution, {
            json: options.json,
            fixedSdkVersion: options.fixedSdkVersion,
            requestedSdkVersion: options.sdkVersion,
        }));
    }
    catch (error) {
        const output = formatGenerateFailure(error, {
            json: options.json,
            outputPath: options.output,
        });
        process.stderr.write(output.endsWith('\n') ? output : `${output}\n`);
        process.exit(1);
    }
});
program
    .command('list')
    .description('List supported languages')
    .option('--json', 'Emit machine-readable JSON output')
    .action((options) => {
    process.stdout.write(formatLanguageCatalogOutput({
        json: options.json,
    }));
});
program
    .command('languages')
    .description('List supported languages')
    .option('--json', 'Emit machine-readable JSON output')
    .action((options) => {
    process.stdout.write(formatLanguageCatalogOutput({
        json: options.json,
    }));
});
program
    .command('inspect')
    .description('Inspect persisted SDK control-plane artifacts')
    .requiredOption('-o, --output <path>', 'Output directory')
    .option('--fail-on <status>', 'Fail when evaluation status is at or above empty, degraded, or invalid')
    .option('--require-action <action>', 'Fail when recommended action does not equal the expected action')
    .option('--json', 'Emit machine-readable JSON output')
    .action((options) => {
    try {
        const snapshot = runInspectCommand({
            output: options.output,
        });
        const inspectOptions = {
            json: options.json,
            failOn: options.failOn,
            requireAction: options.requireAction,
        };
        process.stdout.write(formatInspectSuccess(snapshot, {
            ...inspectOptions,
        }));
        const gate = resolveInspectGate(snapshot, inspectOptions);
        if (gate.exitCode !== 0) {
            process.exit(gate.exitCode);
        }
    }
    catch (error) {
        const output = formatInspectFailure(error, {
            json: options.json,
        });
        process.stderr.write(output.endsWith('\n') ? output : `${output}\n`);
        process.exit(1);
    }
});
program.parse();
