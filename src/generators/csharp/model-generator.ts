import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveModelSchema } from '../../framework/schema.js';
import { CSHARP_CONFIG, getCSharpNamespace, getCSharpType } from './config.js';

export class ModelGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    
    for (const [name, schema] of Object.entries(ctx.schemas)) {
      files.push(this.generateClass(name, schema, ctx.schemas, config));
    }

    return files;
  }

  private generateClass(
    name: string,
    schema: any,
    schemas: SchemaContext['schemas'],
    config: GeneratorConfig
  ): GeneratedFile {
    const modelSchema = resolveModelSchema(schema, schemas);
    const className = CSHARP_CONFIG.namingConventions.modelName(name);
    const props = modelSchema.properties || {};
    
    const fields = Object.entries(props).map(([propName, propSchema]: [string, any]) => {
      const fieldName = CSHARP_CONFIG.namingConventions.propertyName(propName);
      const fieldType = getCSharpType(propSchema, CSHARP_CONFIG);
      return `        public ${fieldType}? ${fieldName} { get; set; }`;
    }).join('\n');

    return {
      path: `Models/${className}.cs`,
      content: this.format(`using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ${getCSharpNamespace(config)}.Models
{
    public class ${className}
    {
${fields}
    }
}
`),
      language: 'csharp',
      description: `${className} model`,
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
