import type { GeneratedFile } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { FLUTTER_CONFIG } from './config.js';
import { resolveFlutterCommonPackage } from '../../framework/common-package.js';

export class BuildConfigGenerator {
  generate(config: GeneratorConfig): GeneratedFile[] {
    return [
      this.generatePubspec(config),
    ];
  }

  private generatePubspec(config: GeneratorConfig): GeneratedFile {
    const pkgName = `${FLUTTER_CONFIG.namingConventions.packageName(config.sdkType)}_sdk`;
    const commonPkg = resolveFlutterCommonPackage(config);
    
    return {
      path: 'pubspec.yaml',
      content: this.format(`name: ${pkgName}
description: ${config.description || config.name + ' SDK'}
version: ${config.version}

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  ${commonPkg.packageName}: ${commonPkg.version}

dev_dependencies:
  test: ^1.24.0
  lints: ^3.0.0
`),
      language: 'flutter',
      description: 'Pubspec configuration',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
