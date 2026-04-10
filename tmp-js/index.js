export * from './framework/types.js';
export * from './framework/base.js';
export * from './framework/sdk-metadata.js';
export * from './language-capabilities.js';
export * from './change-impact.js';
export * from './execution-decision.js';
export * from './execution-handoff.js';
export * from './execution-report.js';
export * from './publish-capabilities.js';
import { loadOpenApiSpec } from './framework/spec-loader.js';
import { TypeScriptGenerator } from './generators/typescript/index.js';
import { DartGenerator } from './generators/dart/index.js';
import { PythonGenerator } from './generators/python/index.js';
import { GoGenerator } from './generators/go/index.js';
import { JavaGenerator } from './generators/java/index.js';
import { SwiftGenerator } from './generators/swift/index.js';
import { KotlinGenerator } from './generators/kotlin/index.js';
import { FlutterGenerator } from './generators/flutter/index.js';
import { CSharpGenerator } from './generators/csharp/index.js';
import { RustGenerator } from './generators/rust/index.js';
import { PhpGenerator } from './generators/php/index.js';
import { RubyGenerator } from './generators/ruby/index.js';
import { getLanguageRegistry } from './language-registry.js';
const generators = new Map();
const supportedSdkTypes = ['app', 'backend', 'ai', 'custom'];
const GENERATOR_FACTORIES = {
    typescript: () => new TypeScriptGenerator(),
    dart: () => new DartGenerator(),
    python: () => new PythonGenerator(),
    go: () => new GoGenerator(),
    java: () => new JavaGenerator(),
    swift: () => new SwiftGenerator(),
    kotlin: () => new KotlinGenerator(),
    flutter: () => new FlutterGenerator(),
    csharp: () => new CSharpGenerator(),
    rust: () => new RustGenerator(),
    php: () => new PhpGenerator(),
    ruby: () => new RubyGenerator(),
};
for (const entry of getLanguageRegistry()) {
    generators.set(entry.language, GENERATOR_FACTORIES[entry.language]());
}
export function getSupportedLanguages() {
    return Array.from(generators.keys());
}
export function getSupportedSdkTypes() {
    return [...supportedSdkTypes];
}
export function getGenerator(language) {
    return generators.get(language);
}
export function registerGenerator(generator) {
    generators.set(generator.language, generator);
}
export async function generateSdk(config, specOrInput) {
    const generator = generators.get(config.language);
    if (!generator) {
        throw new Error(`Unsupported language: ${config.language}. Supported: ${getSupportedLanguages().join(', ')}`);
    }
    if (!supportedSdkTypes.includes(config.sdkType)) {
        throw new Error(`Unsupported SDK type: ${config.sdkType}. Supported: ${getSupportedSdkTypes().join(', ')}`);
    }
    const spec = typeof specOrInput === 'string'
        ? await loadOpenApiSpec(specOrInput)
        : specOrInput;
    return generator.generate(config, spec);
}
export { TypeScriptGenerator } from './generators/typescript/index.js';
export { DartGenerator } from './generators/dart/index.js';
export { PythonGenerator } from './generators/python/index.js';
export { GoGenerator } from './generators/go/index.js';
export { JavaGenerator } from './generators/java/index.js';
export { SwiftGenerator } from './generators/swift/index.js';
export { KotlinGenerator } from './generators/kotlin/index.js';
export { FlutterGenerator } from './generators/flutter/index.js';
export { CSharpGenerator } from './generators/csharp/index.js';
export { RustGenerator } from './generators/rust/index.js';
export { PhpGenerator } from './generators/php/index.js';
export { RubyGenerator } from './generators/ruby/index.js';
