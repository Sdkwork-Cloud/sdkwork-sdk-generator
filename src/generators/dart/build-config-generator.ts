import type { GeneratedFile } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { getDartPackageName } from './config.js';

export class BuildConfigGenerator {
  generate(config: GeneratorConfig): GeneratedFile[] {
    return [
      this.generatePubspec(config),
      this.generateAnalysisOptions(),
    ];
  }

  private generatePubspec(config: GeneratorConfig): GeneratedFile {
    const packageName = getDartPackageName(config);

    return {
      path: 'pubspec.yaml',
      content: this.format(`name: ${packageName}
description: ${config.description || `${config.name} Dart SDK`}
version: ${config.version}

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  http: ^1.2.0

dev_dependencies:
  test: ^1.24.0
  lints: ^3.0.0
`),
      language: 'dart',
      description: 'Pubspec configuration',
    };
  }

  private generateAnalysisOptions(): GeneratedFile {
    return {
      path: 'analysis_options.yaml',
      content: this.format(`include: package:lints/recommended.yaml
`),
      language: 'dart',
      description: 'Dart analyzer configuration',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
