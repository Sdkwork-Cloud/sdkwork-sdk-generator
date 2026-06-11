import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveDiscriminatedUnionModel } from '../../framework/discriminated-union.js';
import { resolveModelSchema } from '../../framework/schema.js';
import { CSHARP_CONFIG, getCSharpNamespace, getCSharpType } from './config.js';

export class ModelGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const knownModels = new Set<string>(
      Object.keys(ctx.schemas).map((schemaName) => CSHARP_CONFIG.namingConventions.modelName(schemaName))
    );
    const variantBaseBySchemaName = this.resolveVariantBaseModels(ctx.schemas, knownModels);

    for (const [name, schema] of Object.entries(ctx.schemas)) {
      files.push(this.generateClass(name, schema, ctx.schemas, config, knownModels, variantBaseBySchemaName));
    }

    return files;
  }

  private generateClass(
    name: string,
    schema: any,
    schemas: SchemaContext['schemas'],
    config: GeneratorConfig,
    knownModels: Set<string>,
    variantBaseBySchemaName: Map<string, string>
  ): GeneratedFile {
    const oneOfModel = resolveDiscriminatedUnionModel(
      schema,
      schemas,
      CSHARP_CONFIG.namingConventions.modelName,
      knownModels,
    );
    if (oneOfModel) {
      return this.generateOneOfBaseClass(name, oneOfModel, config);
    }

    const modelSchema = resolveModelSchema(schema, schemas);
    const className = CSHARP_CONFIG.namingConventions.modelName(name);
    const baseClassName = variantBaseBySchemaName.get(name);
    const props = modelSchema.properties || {};
    const required = Array.isArray(modelSchema.required)
      ? new Set<string>(modelSchema.required)
      : new Set<string>();

    const fields = Object.entries(props).map(([propName, propSchema]: [string, any]) => {
      const fieldName = CSHARP_CONFIG.namingConventions.propertyName(propName);
      const fieldType = getCSharpType(propSchema, CSHARP_CONFIG);
      return required.has(propName)
        ? `        public ${fieldType} ${fieldName} { get; set; }`
        : `        public ${fieldType}? ${fieldName} { get; set; }`;
    }).join('\n');

    return {
      path: `Models/${className}.cs`,
      content: this.format(`using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ${getCSharpNamespace(config)}.Models
{
    public class ${className}${baseClassName ? ` : ${baseClassName}` : ''}
    {
${fields}
    }
}
`),
      language: 'csharp',
      description: `${className} model`,
    };
  }

  private generateOneOfBaseClass(
    name: string,
    oneOfModel: NonNullable<ReturnType<typeof resolveDiscriminatedUnionModel>>,
    config: GeneratorConfig
  ): GeneratedFile {
    const className = CSHARP_CONFIG.namingConventions.modelName(name);
    const derivedTypes = oneOfModel.variants
      .map((variant) => `    [JsonDerivedType(typeof(${variant.modelName}), "${this.escapeCSharpString(variant.discriminatorValue)}")]`)
      .join('\n');
    const discriminatorProperty = this.escapeCSharpString(oneOfModel.discriminatorProperty);

    return {
      path: `Models/${className}.cs`,
      content: this.format(`using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ${getCSharpNamespace(config)}.Models
{
    [JsonPolymorphic(TypeDiscriminatorPropertyName = "${discriminatorProperty}")]
${derivedTypes}
    public abstract class ${className}
    {
    }
}
`),
      language: 'csharp',
      description: `${className} discriminated union model`,
    };
  }

  private resolveVariantBaseModels(
    schemas: SchemaContext['schemas'],
    knownModels: Set<string>
  ): Map<string, string> {
    const variantBaseBySchemaName = new Map<string, string>();
    for (const [name, schema] of Object.entries(schemas)) {
      const oneOfModel = resolveDiscriminatedUnionModel(
        schema,
        schemas,
        CSHARP_CONFIG.namingConventions.modelName,
        knownModels,
      );
      if (!oneOfModel) {
        continue;
      }
      const baseClassName = CSHARP_CONFIG.namingConventions.modelName(name);
      for (const variant of oneOfModel.variants) {
        variantBaseBySchemaName.set(variant.schemaName, baseClassName);
      }
    }
    return variantBaseBySchemaName;
  }

  private format(content: string): string {
    return `${content.trim().replace(/[ \t]+$/gm, '')}\n`;
  }

  private escapeCSharpString(value: string): string {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}
