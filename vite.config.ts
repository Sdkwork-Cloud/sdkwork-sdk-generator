import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

const NODE_BUILTIN_EXTERNALS = Array.from(new Set([
  'fs',
  'path',
  'url',
  'crypto',
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'SdkGenerator',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
    rollupOptions: {
      external: [
        '@sdkwork/sdk-common',
        /^@sdkwork\/sdk-common\/.*/,
        ...NODE_BUILTIN_EXTERNALS,
        /^node:/,
      ],
      output: {
        exports: 'named',
      },
    },
    target: 'es2020',
  },
  plugins: [
    dts({
      include: ['src/**/*'],
      outDir: 'dist',
      rollupTypes: false,
      tsconfigPath: './tsconfig.json',
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
