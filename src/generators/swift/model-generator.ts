import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { SWIFT_CONFIG, getSwiftType } from './config.js';

export class ModelGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const models: string[] = [];
    
    for (const [name, schema] of Object.entries(ctx.schemas)) {
      models.push(this.generateStruct(name, schema));
    }

    return [{
      path: 'Sources/Models.swift',
      content: this.format(`import Foundation

${models.join('\n\n')}
`),
      language: 'swift',
      description: 'Data models',
    }];
  }

  private generateStruct(name: string, schema: any): string {
    const structName = SWIFT_CONFIG.namingConventions.modelName(name);
    const props = schema.properties || {};
    
    const fields = Object.entries(props).map(([propName, propSchema]: [string, any]) => {
      const fieldName = SWIFT_CONFIG.namingConventions.propertyName(propName);
      const fieldType = getSwiftType(propSchema, SWIFT_CONFIG);
      return `    let ${fieldName}: ${fieldType}?`;
    }).join('\n');

    return `struct ${structName}: Codable {
${fields}
}`;
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
