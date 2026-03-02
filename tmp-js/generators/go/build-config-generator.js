import { resolveGoCommonPackage } from '../../framework/common-package.js';
export class BuildConfigGenerator {
    generate(config) {
        return [
            this.generateGoMod(config),
        ];
    }
    generateGoMod(config) {
        const moduleName = config.packageName || `github.com/sdkwork/${config.sdkType}-sdk`;
        const commonPkg = resolveGoCommonPackage(config);
        return {
            path: 'go.mod',
            content: this.format(`module ${moduleName}

go 1.21

require ${commonPkg.modulePath} ${commonPkg.version}
`),
            language: 'go',
            description: 'Go module configuration',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
