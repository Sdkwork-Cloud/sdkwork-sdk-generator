import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveJvmSdkIdentity } from '../../framework/jvm-sdk-identity.js';
import { KOTLIN_CONFIG, getKotlinType } from './config.js';

export class ModelGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const packageName = resolveJvmSdkIdentity(config);
    
    for (const [name, schema] of Object.entries(ctx.schemas)) {
      files.push(this.generateDataClass(name, schema, packageName));
    }

    return files;
  }

  private generateDataClass(name: string, schema: any, packageName: ReturnType<typeof resolveJvmSdkIdentity>): GeneratedFile {
    const className = KOTLIN_CONFIG.namingConventions.modelName(name);
    const props = schema.properties || {};
    
    const fields = Object.entries(props).map(([propName, propSchema]: [string, any]) => {
      const fieldName = KOTLIN_CONFIG.namingConventions.propertyName(propName);
      const fieldType = getKotlinType(propSchema, KOTLIN_CONFIG);
      return `    val ${fieldName}: ${fieldType}? = null`;
    }).join(',\n');

    return {
      path: `src/main/kotlin/${packageName.packagePath}/${className}.kt`,
      content: this.format(`package ${packageName.packageRoot}

data class ${className}(
${fields}
)
`),
      language: 'kotlin',
      description: `${className} model`,
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
