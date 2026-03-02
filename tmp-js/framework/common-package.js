const COMMON_SPLIT_TOKEN = '|';
function splitSpec(commonPackage) {
    const raw = (commonPackage || '').trim();
    if (!raw) {
        return {};
    }
    const index = raw.indexOf(COMMON_SPLIT_TOKEN);
    if (index < 0) {
        return { dependencySpec: raw };
    }
    const dependencySpec = raw.slice(0, index).trim();
    const codeImport = raw.slice(index + 1).trim();
    return {
        dependencySpec: dependencySpec || undefined,
        codeImport: codeImport || undefined,
    };
}
function splitPackageAndVersion(spec, defaultName, defaultVersion) {
    const raw = spec.trim();
    if (!raw) {
        return { name: defaultName, version: defaultVersion };
    }
    if (raw.startsWith('@')) {
        const slashIndex = raw.indexOf('/');
        const versionIndex = raw.lastIndexOf('@');
        if (versionIndex > slashIndex) {
            return {
                name: raw.slice(0, versionIndex).trim() || defaultName,
                version: raw.slice(versionIndex + 1).trim() || defaultVersion,
            };
        }
        return { name: raw, version: defaultVersion };
    }
    const versionIndex = raw.lastIndexOf('@');
    if (versionIndex > 0) {
        return {
            name: raw.slice(0, versionIndex).trim() || defaultName,
            version: raw.slice(versionIndex + 1).trim() || defaultVersion,
        };
    }
    return { name: raw, version: defaultVersion };
}
function splitMavenCoordinate(spec, defaultGroupId, defaultArtifactId, defaultVersion) {
    const raw = spec.trim();
    if (!raw) {
        return {
            groupId: defaultGroupId,
            artifactId: defaultArtifactId,
            version: defaultVersion,
        };
    }
    const parts = raw.split(':').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 3) {
        return {
            groupId: parts[0],
            artifactId: parts[1],
            version: parts[2],
        };
    }
    if (parts.length === 2) {
        return {
            groupId: parts[0],
            artifactId: parts[1],
            version: defaultVersion,
        };
    }
    if (parts.length === 1) {
        return {
            groupId: defaultGroupId,
            artifactId: parts[0],
            version: defaultVersion,
        };
    }
    return {
        groupId: defaultGroupId,
        artifactId: defaultArtifactId,
        version: defaultVersion,
    };
}
function toPascalCase(value) {
    return value
        .replace(/^@/, '')
        .replace(/[./\\_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}
export function resolveTypeScriptCommonPackage(config) {
    const { dependencySpec, codeImport } = splitSpec(config.commonPackage);
    const { name, version } = splitPackageAndVersion(dependencySpec || '@sdkwork/sdk-common', '@sdkwork/sdk-common', '^1.0.0');
    const importPath = codeImport || name;
    return {
        dependencyName: name,
        dependencyVersion: version,
        importPath,
        viteGlobalName: toPascalCase(importPath) || 'SDKWork',
    };
}
export function resolvePythonCommonPackage(config) {
    const { dependencySpec, codeImport } = splitSpec(config.commonPackage);
    return {
        requirement: dependencySpec || 'sdkwork-common>=1.0.0',
        moduleImportRoot: codeImport || 'sdkwork.common',
    };
}
export function resolveJvmCommonPackage(config) {
    const { dependencySpec, codeImport } = splitSpec(config.commonPackage);
    const coordinate = splitMavenCoordinate(dependencySpec || 'com.sdkwork:sdk-common:1.0.0', 'com.sdkwork', 'sdk-common', '1.0.0');
    return {
        ...coordinate,
        importRoot: codeImport || 'com.sdkwork.common.core',
    };
}
export function resolveGoCommonPackage(config) {
    const { dependencySpec, codeImport } = splitSpec(config.commonPackage);
    const { name, version } = splitPackageAndVersion(dependencySpec || 'github.com/sdkwork/sdk-common-go@v1.0.0', 'github.com/sdkwork/sdk-common-go', 'v1.0.0');
    return {
        modulePath: name,
        version,
        commonImportPath: codeImport || `${name}/common`,
    };
}
export function resolveSwiftCommonPackage(config) {
    const { dependencySpec, codeImport } = splitSpec(config.commonPackage);
    const { name, version } = splitPackageAndVersion(dependencySpec || 'https://github.com/sdkwork/sdk-common-swift.git@1.0.0', 'https://github.com/sdkwork/sdk-common-swift.git', '1.0.0');
    return {
        packageUrl: name,
        version,
        productName: codeImport || 'SDKworkCommon',
    };
}
export function resolveCSharpCommonPackage(config) {
    const { dependencySpec, codeImport } = splitSpec(config.commonPackage);
    const { name, version } = splitPackageAndVersion(dependencySpec || 'SDKwork.Common@1.0.0', 'SDKwork.Common', '1.0.0');
    return {
        packageId: name,
        version,
        namespace: codeImport || `${name}.Core`,
    };
}
export function resolveFlutterCommonPackage(config) {
    const { dependencySpec, codeImport } = splitSpec(config.commonPackage);
    const { name, version } = splitPackageAndVersion(dependencySpec || 'sdkwork_common_flutter@^1.0.0', 'sdkwork_common_flutter', '^1.0.0');
    return {
        packageName: name,
        version,
        importPath: codeImport || `package:${name}/${name}.dart`,
    };
}
