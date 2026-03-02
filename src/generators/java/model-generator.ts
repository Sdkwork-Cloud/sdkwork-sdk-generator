import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { JAVA_CONFIG, getJavaType } from './config.js';

export class ModelGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const packageName = config.sdkType.toLowerCase();
    
    for (const [name, schema] of Object.entries(ctx.schemas)) {
      files.push(this.generateClass(name, schema, packageName));
    }

    return files;
  }

  private generateClass(name: string, schema: any, packageName: string): GeneratedFile {
    const className = JAVA_CONFIG.namingConventions.modelName(name);
    const props = schema.properties || {};
    
    const fields = Object.entries(props).map(([propName, propSchema]: [string, any]) => {
      const fieldName = JAVA_CONFIG.namingConventions.propertyName(propName);
      const fieldType = getJavaType(propSchema, JAVA_CONFIG);
      return `    private ${fieldType} ${fieldName};`;
    }).join('\n');

    const getters = Object.entries(props).map(([propName, propSchema]: [string, any]) => {
      const fieldName = JAVA_CONFIG.namingConventions.propertyName(propName);
      const fieldType = getJavaType(propSchema, JAVA_CONFIG);
      const methodName = JAVA_CONFIG.namingConventions.methodName(`get_${propName}`);
      return `
    public ${fieldType} ${methodName}() {
        return this.${fieldName};
    }
    
    public void set${JAVA_CONFIG.namingConventions.modelName(propName)}(${fieldType} ${fieldName}) {
        this.${fieldName} = ${fieldName};
    }`;
    }).join('\n');

    return {
      path: `src/main/java/com/sdkwork/${packageName}/model/${className}.java`,
      content: this.format(`package com.sdkwork.${packageName}.model;

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
}
