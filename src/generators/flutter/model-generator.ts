import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { FLUTTER_CONFIG, getFlutterType } from './config.js';

export class ModelGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const models: string[] = [];
    
    for (const [name, schema] of Object.entries(ctx.schemas)) {
      models.push(this.generateClass(name, schema));
    }

    return [{
      path: 'lib/src/models.dart',
      content: this.format(`${models.join('\n\n')}
`),
      language: 'flutter',
      description: 'Data models',
    }];
  }

  private generateClass(name: string, schema: any): string {
    const className = FLUTTER_CONFIG.namingConventions.modelName(name);
    const props = schema.properties || {};
    
    const fields = Object.entries(props).map(([propName, propSchema]: [string, any]) => {
      const fieldName = FLUTTER_CONFIG.namingConventions.propertyName(propName);
      const fieldType = getFlutterType(propSchema, FLUTTER_CONFIG);
      return `  final ${fieldType}? ${fieldName};`;
    }).join('\n');

    const constructor = Object.entries(props).map(([propName]: [string, any]) => {
      const fieldName = FLUTTER_CONFIG.namingConventions.propertyName(propName);
      return `    this.${fieldName}`;
    }).join(',\n');

    return `class ${className} {
${fields}

  ${className}({
${constructor}
  });
}`;
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
