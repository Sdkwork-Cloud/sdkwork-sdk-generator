export * from './framework/types.js';
export * from './framework/base.js';

import { TypeScriptGenerator } from './generators/typescript/index.js';
import { PythonGenerator } from './generators/python/index.js';
import { GoGenerator } from './generators/go/index.js';
import { JavaGenerator } from './generators/java/index.js';
import { SwiftGenerator } from './generators/swift/index.js';
import { KotlinGenerator } from './generators/kotlin/index.js';
import { FlutterGenerator } from './generators/flutter/index.js';
import { CSharpGenerator } from './generators/csharp/index.js';
import type { Language, GeneratorConfig, ApiSpec, GeneratorResult } from './framework/types.js';
import type { BaseGenerator } from './framework/base.js';

const generators: Map<Language, BaseGenerator> = new Map();
generators.set('typescript', new TypeScriptGenerator());
generators.set('python', new PythonGenerator());
generators.set('go', new GoGenerator());
generators.set('java', new JavaGenerator());
generators.set('swift', new SwiftGenerator());
generators.set('kotlin', new KotlinGenerator());
generators.set('flutter', new FlutterGenerator());
generators.set('csharp', new CSharpGenerator());

export function getSupportedLanguages(): Language[] {
  return Array.from(generators.keys());
}

export function getGenerator(language: Language): BaseGenerator | undefined {
  return generators.get(language);
}

export function registerGenerator(generator: BaseGenerator): void {
  generators.set(generator.language, generator);
}

export async function generateSdk(
  config: GeneratorConfig,
  specOrInput: ApiSpec | string
): Promise<GeneratorResult> {
  const generator = generators.get(config.language);
  
  if (!generator) {
    throw new Error(`Unsupported language: ${config.language}. Supported: ${getSupportedLanguages().join(', ')}`);
  }

  let spec: ApiSpec;
  if (typeof specOrInput === 'string') {
    spec = await loadSpec(specOrInput) as ApiSpec;
  } else {
    spec = specOrInput;
  }

  return generator.generate(config, spec);
}

async function loadSpec(input: string): Promise<unknown> {
  const isUrl = input.startsWith('http://') || input.startsWith('https://');
  
  if (isUrl) {
    console.log(`   📥 Fetching OpenAPI from: ${input}`);
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  } else {
    const { readFileSync, existsSync } = await import('fs');
    const { resolve } = await import('path');
    
    const inputPath = resolve(input);
    if (!existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }
    
    const content = readFileSync(inputPath, 'utf-8');
    if (inputPath.endsWith('.json')) {
      return JSON.parse(content);
    } else {
      const yaml = await import('js-yaml');
      return yaml.load(content);
    }
  }
}

export { TypeScriptGenerator };
export { PythonGenerator };
export { GoGenerator };
export { JavaGenerator };
export { SwiftGenerator };
export { KotlinGenerator };
export { FlutterGenerator };
export { CSharpGenerator };
