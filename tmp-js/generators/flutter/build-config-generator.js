import fs from 'node:fs';
import path from 'node:path';
import { getFlutterPackageName } from './config.js';
import { resolveFlutterCommonPackage } from '../../framework/common-package.js';
export class BuildConfigGenerator {
    generate(config) {
        const commonPkg = resolveFlutterCommonPackage(config);
        const localCommonPackagePath = this.findLocalCommonPackagePath(config.outputPath, ['sdk', 'sdkwork-sdk-commons', 'sdkwork-sdk-common-flutter']);
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
    generatePubspec(config) {
        const pkgName = getFlutterPackageName(config);
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
    generatePubspecOverrides(packageName, localCommonPackagePath) {
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
    format(content) {
        return content.trim() + '\n';
    }
    findLocalCommonPackagePath(outputPath, targetSegments) {
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
