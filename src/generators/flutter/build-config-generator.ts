import fs from 'node:fs';
import path from 'node:path';

import type { GeneratedFile } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { FLUTTER_CONFIG } from './config.js';
import { resolveFlutterCommonPackage } from '../../framework/common-package.js';

export class BuildConfigGenerator {
  generate(config: GeneratorConfig): GeneratedFile[] {
    const commonPkg = resolveFlutterCommonPackage(config);
    const localCommonPackagePath = this.findLocalCommonPackagePath(
      config.outputPath,
      ['sdk', 'sdkwork-sdk-commons', 'sdkwork-sdk-common-flutter'],
    );
    const files = [
      this.generatePubspec(config),
    ];
    if (localCommonPackagePath) {
      files.push(this.generatePubspecOverrides(commonPkg.packageName, localCommonPackagePath));
    }
    return [
      ...files,
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

  private generatePubspecOverrides(packageName: string, localCommonPackagePath: string): GeneratedFile {
    return {
      path: 'pubspec_overrides.yaml',
      content: this.format(`dependency_overrides:
  ${packageName}:
    path: ${localCommonPackagePath}
`),
      language: 'flutter',
      description: 'Workspace-local dependency overrides',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }

  private findLocalCommonPackagePath(outputPath: string, targetSegments: string[]): string | null {
    const outputDir = path.resolve(outputPath);
    let currentDir = outputDir;

    while (true) {
      const candidate = path.join(currentDir, ...targetSegments);
      if (fs.existsSync(candidate)) {
        return path.relative(outputDir, candidate).replace(/\\/g, '/');
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        return null;
      }
      currentDir = parentDir;
    }
  }
}
