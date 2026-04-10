import { builtinModules } from 'node:module';

export const NODE_BUILTIN_EXTERNALS = Array.from(new Set([
  'fs',
  'path',
  'url',
  'crypto',
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]));

export const SDK_GENERATOR_VITE_EXTERNALS: Array<string | RegExp> = [
  '@sdkwork/sdk-common',
  /^@sdkwork\/sdk-common\/.*/,
  ...NODE_BUILTIN_EXTERNALS,
  /^node:/,
];
