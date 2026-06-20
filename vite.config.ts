import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';
import { SDK_GENERATOR_VITE_EXTERNALS } from './src/vite-config-shared.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  return {
    define: {
      'process.env.SDKWORK_ACCESS_TOKEN': JSON.stringify(env.SDKWORK_ACCESS_TOKEN ?? ''),
    },
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
        ...SDK_GENERATOR_VITE_EXTERNALS,
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
