import { resolveTypeScriptCommonPackage } from '../../framework/common-package.js';
import { resolveDefaultPackageToken, resolveDefaultTypeScriptTransportPackageName, } from '../../framework/package-identity.js';
export class BuildConfigGenerator {
    generate(config) {
        return [
            this.generatePackageJson(config),
            this.generateTsConfig(),
            this.generateBuildRuntimeScript(),
        ];
    }
    generatePackageJson(config) {
        const isSdkworkV3TransportPackage = config.options?.standardProfile === 'sdkwork-v3';
        const pkgName = isSdkworkV3TransportPackage
            ? resolveDefaultTypeScriptTransportPackageName(config)
            : (config.packageName || resolveDefaultTypeScriptTransportPackageName(config));
        const commonPkg = resolveTypeScriptCommonPackage(config);
        const trimmedName = (config.name || '').trim();
        const inferredDescription = /sdk$/i.test(trimmedName) ? trimmedName : `${trimmedName} SDK`;
        const sdkFamilyName = `sdkwork-${resolveDefaultPackageToken(config)}`;
        const description = isSdkworkV3TransportPackage
            ? `Generator-owned TypeScript transport SDK for ${sdkFamilyName}.`
            : config.description || inferredDescription;
        const scripts = {
            build: 'node custom/build-runtime.mjs',
            dev: 'node custom/build-runtime.mjs',
            prepublishOnly: 'npm run build',
        };
        if (config.generateTests === true) {
            scripts.test = 'npm run build && node --test ./test/**/*.test.mjs';
        }
        const pkg = {
            name: pkgName,
            version: config.version,
            private: isSdkworkV3TransportPackage ? true : undefined,
            sdkworkRole: isSdkworkV3TransportPackage ? 'transport' : undefined,
            description,
            author: config.author || 'SDKWork Team',
            license: config.license || 'MIT',
            type: 'module',
            main: './dist/index.cjs',
            module: './dist/index.js',
            types: './dist/index.d.ts',
            files: ['dist'],
            exports: {
                '.': {
                    types: './dist/index.d.ts',
                    import: './dist/index.js',
                    require: './dist/index.cjs',
                },
            },
            scripts,
            dependencies: {
                [commonPkg.dependencyName]: commonPkg.dependencyVersion,
            },
            devDependencies: {
                '@types/node': '^20.0.0',
                typescript: '^5.3.0',
                rollup: '^4.0.0',
            },
            keywords: [
                'sdk',
                'api',
                config.sdkType,
                'sdkwork',
            ],
        };
        return {
            path: 'package.json',
            content: JSON.stringify(pkg, null, 2) + '\n',
            language: 'typescript',
            description: 'Package configuration',
        };
    }
    generateTsConfig() {
        const tsconfig = {
            compilerOptions: {
                target: 'ES2020',
                module: 'ESNext',
                // Include DOM types so multipart FormData APIs are typed in generated SDKs.
                lib: ['ES2020', 'DOM', 'DOM.Iterable'],
                strict: true,
                esModuleInterop: true,
                skipLibCheck: true,
                forceConsistentCasingInFileNames: true,
                declaration: true,
                declarationMap: true,
                outDir: './dist',
                rootDir: './src',
                moduleResolution: 'bundler',
                resolveJsonModule: true,
                isolatedModules: true,
            },
            include: ['src/**/*'],
            exclude: ['node_modules', 'dist'],
        };
        return {
            path: 'tsconfig.json',
            content: JSON.stringify(tsconfig, null, 2) + '\n',
            language: 'typescript',
            description: 'TypeScript configuration',
        };
    }
    generateBuildRuntimeScript() {
        return {
            path: 'custom/build-runtime.mjs',
            content: this.format(`#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { rollup } from 'rollup';

const projectDir = process.cwd();
const srcDir = path.join(projectDir, 'src');
const distDir = path.join(projectDir, 'dist');
const tempDir = path.join(projectDir, '.sdkwork', 'build-runtime');
const tempEsmDir = path.join(tempDir, 'esm');

async function main() {
  await removeDirectory(distDir);
  await removeDirectory(tempDir);
  await fs.mkdir(distDir, { recursive: true });

  emitDeclarations();
  emitRuntimeModules();
  await removeTypeOnlyRuntimeReExports(path.join(tempEsmDir, 'index.js'));
  await bundleRuntime('es', path.join(distDir, 'index.js'));
  await bundleRuntime('cjs', path.join(distDir, 'index.cjs'));

  await removeDirectory(tempDir);
}

async function removeDirectory(target) {
  await fs.rm(target, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}

function loadConfig(overrides) {
  const configPath = ts.findConfigFile(projectDir, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) {
    throw new Error(\`tsconfig.json not found under \${projectDir}\`);
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(formatDiagnostics([configFile.error]));
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectDir, overrides, configPath);
  if (parsed.errors.length > 0) {
    throw new Error(formatDiagnostics(parsed.errors));
  }

  return parsed;
}

function emitDeclarations() {
  const parsed = loadConfig({
    declaration: true,
    declarationMap: true,
    emitDeclarationOnly: true,
    noEmit: false,
    noEmitOnError: true,
    outDir: distDir,
    rootDir: srcDir,
    sourceMap: false,
  });
  emitProgram(parsed);
}

function emitRuntimeModules() {
  const parsed = loadConfig({
    declaration: false,
    declarationMap: false,
    emitDeclarationOnly: false,
    module: ts.ModuleKind.ESNext,
    noEmit: false,
    noEmitOnError: true,
    outDir: tempEsmDir,
    rootDir: srcDir,
    sourceMap: false,
  });
  emitProgram(parsed);
}

function emitProgram(parsed) {
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const emitResult = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
  if (diagnostics.length > 0) {
    throw new Error(formatDiagnostics(diagnostics));
  }
}

async function removeTypeOnlyRuntimeReExports(entryFile) {
  const source = await fs.readFile(entryFile, 'utf-8');
  const runtimeLines = source.split(/\\r?\\n/u).map((line) => {
    if (line.trim() === "export * from './types';") {
      return "export { DEFAULT_TIMEOUT, SUCCESS_CODES } from '@sdkwork/sdk-common';";
    }
    return line;
  });
  await fs.writeFile(entryFile, runtimeLines.join('\\n'), 'utf-8');
}

async function bundleRuntime(format, file) {
  const bundle = await rollup({
    input: path.join(tempEsmDir, 'index.js'),
    external: (source) => source.startsWith('@sdkwork/'),
    plugins: [relativeExtensionResolver()],
    onwarn(warning, warn) {
      if (warning.code === 'EMPTY_BUNDLE') {
        throw new Error(warning.message);
      }
      warn(warning);
    },
  });

  try {
    await bundle.write({
      file,
      format,
      exports: 'named',
      interop: 'auto',
      sourcemap: false,
    });
  } finally {
    await bundle.close();
  }
}

function relativeExtensionResolver() {
  return {
    name: 'relative-extension-resolver',
    async resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) {
        return null;
      }

      const base = path.resolve(path.dirname(importer), source);
      for (const candidate of [base, \`\${base}.js\`, path.join(base, 'index.js')]) {
        try {
          const stat = await fs.stat(candidate);
          if (stat.isFile()) {
            return candidate;
          }
        } catch {
          // Try the next candidate.
        }
      }

      return null;
    },
  };
}

function formatDiagnostics(diagnostics) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => projectDir,
    getNewLine: () => '\\n',
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
`),
            language: 'typescript',
            description: 'TypeScript runtime build script',
            ownership: 'scaffold',
            overwriteStrategy: 'if-missing',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
