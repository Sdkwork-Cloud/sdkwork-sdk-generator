import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { RpcInputSpec } from '../framework/types.js';
import { loadRpcManifest } from './manifest.js';

export interface ResolveRpcProtoInputOptions {
  manifestPath: string;
  protoRoot: string;
  protoFiles?: string[];
  importRoots?: string[];
}

export function resolveRpcProtoInput(options: ResolveRpcProtoInputOptions): RpcInputSpec {
  const manifestPath = normalizePath(resolve(options.manifestPath));
  if (!existsSync(manifestPath)) {
    throw new Error(`RPC manifest does not exist: ${options.manifestPath}`);
  }
  const protoRoot = normalizePath(resolve(options.protoRoot));
  if (!existsSync(protoRoot) || !statSync(protoRoot).isDirectory()) {
    throw new Error(`RPC proto root does not exist: ${options.protoRoot}`);
  }

  const manifest = loadRpcManifest(manifestPath);
  const protoFiles = resolveProtoFiles({
    protoRoot,
    explicitProtoFiles: options.protoFiles,
    packages: manifest.services.map((service) => service.package),
  });
  const importRoots = normalizeUnique([
    protoRoot,
    ...(options.importRoots || []).map((root) => resolve(root)),
  ]);

  return {
    manifestPath,
    protoRoot,
    protoFiles,
    importRoots,
    manifest,
  };
}

function resolveProtoFiles(input: {
  protoRoot: string;
  explicitProtoFiles?: string[];
  packages: string[];
}): string[] {
  if (input.explicitProtoFiles && input.explicitProtoFiles.length > 0) {
    return normalizeUnique(input.explicitProtoFiles.map((file) => {
      const resolvedFile = resolve(file);
      if (!existsSync(resolvedFile) || !statSync(resolvedFile).isFile()) {
        throw new Error(`RPC proto file does not exist: ${file}`);
      }
      return resolvedFile;
    }));
  }

  const files: string[] = [];
  for (const packageName of new Set(input.packages)) {
    const packageDir = join(input.protoRoot, ...packageName.split('.'));
    if (!existsSync(packageDir) || !statSync(packageDir).isDirectory()) {
      continue;
    }
    collectProtoFiles(packageDir, files);
  }

  if (files.length === 0) {
    throw new Error(
      `No RPC proto files were found under ${input.protoRoot} for manifest packages ${input.packages.join(', ')}.`
    );
  }

  return normalizeUnique(files);
}

function collectProtoFiles(directory: string, files: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectProtoFiles(entryPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.proto')) {
      files.push(entryPath);
    }
  }
}

function normalizeUnique(paths: string[]): string[] {
  return Array.from(new Set(paths.map((filePath) => normalizePath(filePath))))
    .sort((left, right) => left.localeCompare(right));
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}
