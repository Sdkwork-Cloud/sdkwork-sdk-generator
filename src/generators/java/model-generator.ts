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
    
    const fieldEntries = Object.entries(props).map(([propName, propSchema]: [string, any]) => {
      const fieldName = JAVA_CONFIG.namingConventions.propertyName(propName);
      const fieldType = getJavaType(propSchema, JAVA_CONFIG);
      return { propName, fieldName, fieldType };
    });

    const imports = this.generateImports(fieldEntries.map((entry) => entry.fieldType));

    const fields = fieldEntries.map(({ fieldName, fieldType }) => {
      return `    private ${fieldType} ${fieldName};`;
    }).join('\n');

    const getters = fieldEntries.map(({ propName, fieldName, fieldType }) => {
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
${imports ? `\n${imports}\n` : ''}

public class ${className} {
${fields}
${getters}
}
`),
      language: 'java',
      description: `${className} model`,
    };
  }

  private generateImports(types: string[]): string {
    const imports = new Set<string>();
    if (types.some((type) => /\bList</.test(type))) {
      imports.add('import java.util.List;');
    }
    if (types.some((type) => /\bMap</.test(type))) {
      imports.add('import java.util.Map;');
    }
    return Array.from(imports).sort().join('\n');
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
