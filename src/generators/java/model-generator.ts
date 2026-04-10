import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveJvmSdkIdentity } from '../../framework/jvm-sdk-identity.js';
import { JAVA_CONFIG, getJavaType } from './config.js';

export class ModelGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const identity = resolveJvmSdkIdentity(config);
    
    for (const [name, schema] of Object.entries(ctx.schemas)) {
      files.push(this.generateClass(name, schema, identity));
    }

    return files;
  }

  private generateClass(name: string, schema: any, packageName: ReturnType<typeof resolveJvmSdkIdentity>): GeneratedFile {
    const className = JAVA_CONFIG.namingConventions.modelName(name);
    const props = schema.properties || {};
    const imports = new Set<string>();
    
    const fields = Object.entries(props).map(([propName, propSchema]: [string, any]) => {
      const fieldName = JAVA_CONFIG.namingConventions.propertyName(propName);
      const fieldType = getJavaType(propSchema, JAVA_CONFIG);
      this.collectImports(fieldType, imports);
      return `    private ${fieldType} ${fieldName};`;
    }).join('\n');

    const getters = Object.entries(props).map(([propName, propSchema]: [string, any]) => {
      const fieldName = JAVA_CONFIG.namingConventions.propertyName(propName);
      const fieldType = getJavaType(propSchema, JAVA_CONFIG);
      const getterName = this.createAccessorName('get', fieldName);
      const setterName = this.createAccessorName('set', fieldName);
      return `
    public ${fieldType} ${getterName}() {
        return this.${fieldName};
    }
    
    public void ${setterName}(${fieldType} ${fieldName}) {
        this.${fieldName} = ${fieldName};
    }`;
    }).join('\n');

    return {
      path: `src/main/java/${packageName.packagePath}/model/${className}.java`,
      content: this.format(`package ${packageName.packageRoot}.model;

${this.renderImports(imports)}
public class ${className} {
${fields}
${getters}
}
`),
      language: 'java',
      description: `${className} model`,
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }

  private collectImports(fieldType: string, imports: Set<string>): void {
    if (fieldType.includes('List<')) {
      imports.add('import java.util.List;');
    }
    if (fieldType.includes('Map<')) {
      imports.add('import java.util.Map;');
    }
  }

  private renderImports(imports: Set<string>): string {
    if (imports.size === 0) {
      return '';
    }

    return `${Array.from(imports).sort().join('\n')}\n`;
  }

  private createAccessorName(prefix: string, fieldName: string): string {
    if (!fieldName) {
      return prefix;
    }

    return `${prefix}${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`;
  }
}
