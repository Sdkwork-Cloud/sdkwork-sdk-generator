import type { GeneratedFile } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { GO_CONFIG } from './config.js';
import { resolveGoCommonPackage } from '../../framework/common-package.js';

export class BuildConfigGenerator {
  generate(config: GeneratorConfig): GeneratedFile[] {
    return [
      this.generateGoMod(config),
    ];
  }

  private generateGoMod(config: GeneratorConfig): GeneratedFile {
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

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
