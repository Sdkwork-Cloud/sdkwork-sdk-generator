import type { GeneratedFile } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { SWIFT_CONFIG } from './config.js';
import { resolveSwiftCommonPackage } from '../../framework/common-package.js';

export class BuildConfigGenerator {
  generate(config: GeneratorConfig): GeneratedFile[] {
    return [
      this.generatePackageSwift(config),
    ];
  }

  private generatePackageSwift(config: GeneratorConfig): GeneratedFile {
    const sdkName = `${SWIFT_CONFIG.namingConventions.modelName(config.sdkType)}SDK`;
    const commonPkg = resolveSwiftCommonPackage(config);
    
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
        ),
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
