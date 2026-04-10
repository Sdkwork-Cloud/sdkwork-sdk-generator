import { SWIFT_CONFIG } from './config.js';
import { resolveSwiftCommonPackage } from '../../framework/common-package.js';
export function resolveSwiftPackageTargetName(config) {
    return `${SWIFT_CONFIG.namingConventions.modelName(config.sdkType)}SDK`;
}
export function resolveSwiftTestTargetName(config) {
    return `${resolveSwiftPackageTargetName(config)}Tests`;
}
export class BuildConfigGenerator {
    generate(config) {
        return [
            this.generatePackageSwift(config),
        ];
    }
    generatePackageSwift(config) {
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
    format(content) {
        return content.trim() + '\n';
    }
}
