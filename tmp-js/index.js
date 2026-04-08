export * from './framework/types.js';
export * from './framework/base.js';
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
const generators = new Map();
const supportedSdkTypes = ['app', 'backend', 'ai', 'custom'];
generators.set('typescript', new TypeScriptGenerator());
generators.set('dart', new DartGenerator());
generators.set('python', new PythonGenerator());
generators.set('go', new GoGenerator());
generators.set('java', new JavaGenerator());
generators.set('swift', new SwiftGenerator());
generators.set('kotlin', new KotlinGenerator());
generators.set('flutter', new FlutterGenerator());
generators.set('csharp', new CSharpGenerator());
generators.set('rust', new RustGenerator());
generators.set('php', new PhpGenerator());
generators.set('ruby', new RubyGenerator());
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
export { TypeScriptGenerator };
export { DartGenerator };
export { PythonGenerator };
export { GoGenerator };
export { JavaGenerator };
export { SwiftGenerator };
export { KotlinGenerator };
export { FlutterGenerator };
export { CSharpGenerator };
export { RustGenerator };
export { PhpGenerator };
export { RubyGenerator };
