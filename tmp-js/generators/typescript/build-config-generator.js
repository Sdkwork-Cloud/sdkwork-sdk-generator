import { resolveTypeScriptCommonPackage } from '../../framework/common-package.js';
import { resolveTypeScriptLibraryName } from '../../framework/sdk-identity.js';
export class BuildConfigGenerator {
    generate(config) {
        return [
            this.generatePackageJson(config),
            this.generateTsConfig(),
            this.generateViteConfig(config),
        ];
    }
    generatePackageJson(config) {
        const pkgName = config.packageName || `@sdkwork/${config.sdkType}-sdk`;
        const commonPkg = resolveTypeScriptCommonPackage(config);
        const trimmedName = (config.name || '').trim();
        const inferredDescription = /sdk$/i.test(trimmedName) ? trimmedName : `${trimmedName} SDK`;
        const pkg = {
            name: pkgName,
            version: config.version,
            description: config.description || inferredDescription,
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
            scripts: {
                build: 'tsc --emitDeclarationOnly && vite build',
                dev: 'vite build --watch',
                prepublishOnly: 'npm run build',
            },
            dependencies: {
                [commonPkg.dependencyName]: commonPkg.dependencyVersion,
            },
            devDependencies: {
                '@types/node': '^20.0.0',
                typescript: '^5.3.0',
                vite: '^7.0.0',
                'vite-plugin-dts': '^4.0.0',
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
    generateViteConfig(config) {
        const libName = resolveTypeScriptLibraryName(config);
        const commonPkg = resolveTypeScriptCommonPackage(config);
        return {
            path: 'vite.config.ts',
            content: this.format(`import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: '${libName}',
      formats: ['es', 'cjs'],
      fileName: (format) => \`index.\${format === 'es' ? 'js' : 'cjs'}\`,
    },
    rollupOptions: {
      external: ['${commonPkg.importPath}'],
      output: {
        globals: {
          '${commonPkg.importPath}': '${commonPkg.viteGlobalName}',
        },
      },
    },
    sourcemap: true,
  },
  plugins: [
    dts({ 
      include: ['src'],
      outDir: 'dist',
    }),
  ],
});
`),
            language: 'typescript',
            description: 'Vite build configuration',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
