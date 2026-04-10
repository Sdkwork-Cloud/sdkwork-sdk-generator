import type { Language, LanguageConfig } from './framework/types.js';
import { CSHARP_CONFIG } from './generators/csharp/config.js';
import { DART_CONFIG } from './generators/dart/config.js';
import { FLUTTER_CONFIG } from './generators/flutter/config.js';
import { GO_CONFIG } from './generators/go/config.js';
import { JAVA_CONFIG } from './generators/java/config.js';
import { KOTLIN_CONFIG } from './generators/kotlin/config.js';
import { PHP_CONFIG } from './generators/php/config.js';
import { PYTHON_CONFIG } from './generators/python/config.js';
import { RUBY_CONFIG } from './generators/ruby/config.js';
import { RUST_CONFIG } from './generators/rust/config.js';
import { SWIFT_CONFIG } from './generators/swift/config.js';
import { TYPESCRIPT_CONFIG } from './generators/typescript/config.js';

export interface LanguageRegistryEntry {
  language: Language;
  config: LanguageConfig;
  publish: {
    hasUnifiedPublish: true;
    hasDistinctBuildStep: boolean;
  };
}

const LANGUAGE_REGISTRY: readonly LanguageRegistryEntry[] = [
  {
    language: 'typescript',
    config: TYPESCRIPT_CONFIG,
    publish: { hasUnifiedPublish: true, hasDistinctBuildStep: true },
  },
  {
    language: 'dart',
    config: DART_CONFIG,
    publish: { hasUnifiedPublish: true, hasDistinctBuildStep: false },
  },
  {
    language: 'python',
    config: PYTHON_CONFIG,
    publish: { hasUnifiedPublish: true, hasDistinctBuildStep: false },
  },
  {
    language: 'go',
    config: GO_CONFIG,
    publish: { hasUnifiedPublish: true, hasDistinctBuildStep: false },
  },
  {
    language: 'java',
    config: JAVA_CONFIG,
    publish: { hasUnifiedPublish: true, hasDistinctBuildStep: false },
  },
  {
    language: 'swift',
    config: SWIFT_CONFIG,
    publish: { hasUnifiedPublish: true, hasDistinctBuildStep: false },
  },
  {
    language: 'kotlin',
    config: KOTLIN_CONFIG,
    publish: { hasUnifiedPublish: true, hasDistinctBuildStep: false },
  },
  {
    language: 'flutter',
    config: FLUTTER_CONFIG,
    publish: { hasUnifiedPublish: true, hasDistinctBuildStep: false },
  },
  {
    language: 'csharp',
    config: CSHARP_CONFIG,
    publish: { hasUnifiedPublish: true, hasDistinctBuildStep: false },
  },
  {
    language: 'rust',
    config: RUST_CONFIG,
    publish: { hasUnifiedPublish: true, hasDistinctBuildStep: true },
  },
  {
    language: 'php',
    config: PHP_CONFIG,
    publish: { hasUnifiedPublish: true, hasDistinctBuildStep: false },
  },
  {
    language: 'ruby',
    config: RUBY_CONFIG,
    publish: { hasUnifiedPublish: true, hasDistinctBuildStep: false },
  },
] as const;

const LANGUAGE_REGISTRY_BY_LANGUAGE = new Map(
  LANGUAGE_REGISTRY.map((entry) => [entry.language, entry] as const)
);

export function getLanguageRegistry(): LanguageRegistryEntry[] {
  return [...LANGUAGE_REGISTRY];
}

export function getLanguageRegistryEntry(language: Language): LanguageRegistryEntry | undefined {
  return LANGUAGE_REGISTRY_BY_LANGUAGE.get(language);
}
