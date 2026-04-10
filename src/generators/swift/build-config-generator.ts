import type { GeneratedFile } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { SWIFT_CONFIG } from './config.js';
import { resolveSwiftCommonPackage } from '../../framework/common-package.js';

export function resolveSwiftPackageTargetName(config: Pick<GeneratorConfig, 'sdkType'>): string {
  return `${SWIFT_CONFIG.namingConventions.modelName(config.sdkType)}SDK`;
}

export function resolveSwiftTestTargetName(config: Pick<GeneratorConfig, 'sdkType'>): string {
  return `${resolveSwiftPackageTargetName(config)}Tests`;
}

export class BuildConfigGenerator {
  generate(config: GeneratorConfig): GeneratedFile[] {
    return [
      this.generatePackageSwift(config),
    ];
  }

  private generatePackageSwift(config: GeneratorConfig): GeneratedFile {
    const sdkName = resolveSwiftPackageTargetName(config);
    const testTargetName = resolveSwiftTestTargetName(config);
    const commonPkg = resolveSwiftCommonPackage(config);
    const testTarget = config.generateTests === true
      ? `,
        .testTarget(
            name: "${testTargetName}",
            dependencies: ["${sdkName}", "${commonPkg.productName}"],
            path: "Tests/${testTargetName}"
        )`
      : '';
    
    return {
      path: 'Package.swift',
      content: this.format(`// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "${sdkName}",
    platforms: [
        .iOS(.v13),
        .macOS(.v10_15),
    ],
    products: [
        .library(
            name: "${sdkName}",
            targets: ["${sdkName}"]
        ),
    ],
    dependencies: [
        .package(url: "${commonPkg.packageUrl}", from: "${commonPkg.version}")
    ],
    targets: [
        .target(
            name: "${sdkName}",
            dependencies: ["${commonPkg.productName}"],
            path: "Sources"
        )${testTarget}
    ]
)
`),
      language: 'swift',
      description: 'Swift package configuration',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
