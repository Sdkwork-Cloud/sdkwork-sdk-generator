#!/usr/bin/env node

import { Command } from 'commander';
import { generateSdk, getSupportedLanguages } from './index.js';
import { writeFileSync, mkdirSync, existsSync, unlinkSync, chmodSync, readdirSync, rmSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { GeneratorConfig } from './framework/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
void __dirname;

const program = new Command();
const TRANSIENT_FS_ERROR_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const MAX_FS_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 50;

function sleepSync(ms: number): void {
  const sab = new SharedArrayBuffer(4);
  const int32 = new Int32Array(sab);
  Atomics.wait(int32, 0, 0, ms);
}

function withFsRetry<T>(action: () => T, onRetry?: () => void): T {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_FS_RETRIES; attempt += 1) {
    try {
      return action();
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException)?.code;
      const isTransient = typeof code === 'string' && TRANSIENT_FS_ERROR_CODES.has(code);
      if (!isTransient || attempt >= MAX_FS_RETRIES) {
        throw error;
      }
      onRetry?.();
      sleepSync(BASE_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
}

program
  .name('sdkgen')
  .description('SDKWork SDK Generator')
  .version('1.0.0');

program
  .command('generate')
  .requiredOption('-i, --input <path>', 'OpenAPI spec file or URL')
  .requiredOption('-o, --output <path>', 'Output directory')
  .requiredOption('-n, --name <name>', 'SDK name')
  .option('-t, --type <type>', 'SDK type (app, backend, ai)', 'backend')
  .option('-l, --language <lang>', 'Language', 'typescript')
  .option('--base-url <url>', 'Base URL')
  .option('--api-prefix <prefix>', 'API prefix', '/api/v1')
  .option('--package-name <name>', 'Package name')
  .option('--common-package <spec>', 'Common package spec (language-specific, optional)')
  .option('--sdk-version <ver>', 'SDK version', '1.0.0')
  .option('--description <text>', 'Description')
  .option('--author <name>', 'Author')
  .option('--license <license>', 'License', 'MIT')
  .option('--no-clean', 'Do not clean output directory before generation')
  .action(async (options) => {
    console.log(`\nGenerating ${options.language} SDK: ${options.name}\n`);

    const supported = getSupportedLanguages();
    if (!supported.includes(options.language as any)) {
      console.error(`Unsupported language: ${options.language}`);
      process.exit(1);
    }

    let spec: any;
    try {
      const isUrl = options.input.startsWith('http://') || options.input.startsWith('https://');
      if (isUrl) {
        console.log(`   Fetching from: ${options.input}`);
        const res = await fetch(options.input);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const text = await res.text();
        const contentType = res.headers.get('content-type') || '';
        const looksLikeYaml = options.input.endsWith('.yaml')
          || options.input.endsWith('.yml')
          || contentType.includes('yaml')
          || contentType.includes('x-yaml')
          || contentType.includes('text/plain');

        if (looksLikeYaml) {
          const yaml = await import('js-yaml');
          spec = yaml.load(text);
        } else {
          try {
            spec = JSON.parse(text);
          } catch {
            const yaml = await import('js-yaml');
            spec = yaml.load(text);
          }
        }
      } else {
        const { readFileSync } = await import('fs');
        const yaml = await import('js-yaml');
        const inputPath = resolve(options.input);
        const content = readFileSync(inputPath, 'utf-8');
        spec = inputPath.endsWith('.json') ? JSON.parse(content) : yaml.load(content);
      }
    } catch (error) {
      console.error(`Failed to load spec: ${error}`);
      process.exit(1);
    }

    const config: GeneratorConfig = {
      name: options.name,
      version: options.sdkVersion,
      description: options.description,
      author: options.author,
      license: options.license,
      language: options.language as any,
      sdkType: options.type as any,
      outputPath: resolve(options.output),
      apiSpecPath: options.input.startsWith('http://') || options.input.startsWith('https://')
        ? options.input
        : resolve(options.input),
      baseUrl: options.baseUrl || spec.servers?.[0]?.url || 'http://localhost:8080',
      apiPrefix: options.apiPrefix,
      packageName: options.packageName,
      commonPackage: options.commonPackage,
      generateReadme: true,
    };

    try {
      const result = await generateSdk(config, spec);
      if (result.errors.length > 0) {
        console.error('\nGeneration failed with errors:');
        for (const error of result.errors) {
          console.error(`   [${error.code}] ${error.message}`);
        }
        process.exit(1);
      }

      if (result.files.length === 0) {
        console.error('\nGeneration produced no files.');
        process.exit(1);
      }

      const outDir = resolve(options.output);
      if (options.clean !== false) {
        cleanOutputDirectory(outDir);
      }
      if (!existsSync(outDir)) {
        withFsRetry(() => mkdirSync(outDir, { recursive: true }));
      }

      for (const file of result.files) {
        const filePath = join(outDir, file.path);
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
          withFsRetry(() => mkdirSync(dir, { recursive: true }));
        }
        withFsRetry(
          () => writeFileSync(filePath, file.content, 'utf-8'),
          () => {
            if (!existsSync(filePath)) {
              return;
            }
            try {
              chmodSync(filePath, 0o666);
            } catch {
              // Ignore chmod errors during retry cleanup.
            }
            try {
              unlinkSync(filePath);
            } catch {
              // Ignore unlink errors during retry cleanup.
            }
          }
        );
      }

      console.log('\nGenerated successfully!');
      console.log(`   Output: ${outDir}`);
      console.log(`   Files: ${result.stats.totalFiles}`);
      console.log(`   Models: ${result.stats.models}`);
      console.log(`   APIs: ${result.stats.apis}\n`);
      if (result.warnings.length > 0) {
        console.log('Warnings:');
        for (const warning of result.warnings) {
          console.log(`   - ${warning}`);
        }
        console.log('');
      }
    } catch (error) {
      console.error(`Failed to generate SDK: ${error}`);
      process.exit(1);
    }
  });

function cleanOutputDirectory(outputPath: string): void {
  if (!existsSync(outputPath)) {
    return;
  }

  for (const entry of readdirSync(outputPath)) {
    if (entry === '.git' || entry === '.gitignore') {
      continue;
    }
    const target = join(outputPath, entry);
    withFsRetry(() => rmSync(target, { recursive: true, force: true }));
  }
}

const printLanguages = (): void => {
  console.log('\nSupported languages:\n');
  getSupportedLanguages().forEach((lang) => console.log(`   - ${lang}`));
  console.log('');
};

program
  .command('list')
  .description('List supported languages')
  .action(() => {
    printLanguages();
  });

program
  .command('languages')
  .description('List supported languages')
  .action(() => {
    printLanguages();
  });

program.parse();
