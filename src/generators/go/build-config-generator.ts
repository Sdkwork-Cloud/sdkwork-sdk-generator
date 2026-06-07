import type { GeneratedFile } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveGoCommonPackage } from '../../framework/common-package.js';
import { resolveDefaultGoModuleName } from '../../framework/package-identity.js';

export class BuildConfigGenerator {
  generate(config: GeneratorConfig): GeneratedFile[] {
    return [
      this.generateGoMod(config),
    ];
  }

  private generateGoMod(config: GeneratorConfig): GeneratedFile {
    const moduleName = config.packageName || resolveDefaultGoModuleName(config);
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

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
