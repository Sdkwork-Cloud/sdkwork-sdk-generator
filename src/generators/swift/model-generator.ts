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
    const entries = Object.entries(props);

    const fields = entries.map(([propName, propSchema]: [string, any]) => {
      const fieldName = SWIFT_CONFIG.namingConventions.propertyName(propName);
      const fieldType = getSwiftType(propSchema, SWIFT_CONFIG);
      return `    public let ${fieldName}: ${fieldType}?`;
    }).join('\n');

    const initializer = entries.length === 0
      ? '    public init() {}'
      : [
        `    public init(${entries.map(([propName, propSchema]: [string, any]) => {
          const fieldName = SWIFT_CONFIG.namingConventions.propertyName(propName);
          const fieldType = getSwiftType(propSchema, SWIFT_CONFIG);
          return `${fieldName}: ${fieldType}? = nil`;
        }).join(', ')}) {`,
        ...entries.map(([propName]: [string, any]) => {
          const fieldName = SWIFT_CONFIG.namingConventions.propertyName(propName);
          return `        self.${fieldName} = ${fieldName}`;
        }),
        '    }',
      ].join('\n');

    return `public struct ${structName}: Codable {
${fields}${fields ? '\n\n' : ''}
${initializer}
}`;
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
