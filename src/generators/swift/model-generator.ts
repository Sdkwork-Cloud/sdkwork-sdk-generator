import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveDiscriminatedUnionModel } from '../../framework/discriminated-union.js';
import { resolveModelSchema } from '../../framework/schema.js';
import { SWIFT_CONFIG, getSwiftType } from './config.js';

export class ModelGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const models: string[] = [];
    const knownModels = new Set<string>(
      Object.keys(ctx.schemas).map((schemaName) => SWIFT_CONFIG.namingConventions.modelName(schemaName))
    );
    const variantSchemaNames = this.resolveVariantSchemaNames(ctx.schemas, knownModels);

    for (const [name, schema] of Object.entries(ctx.schemas)) {
      models.push(this.generateModel(name, schema, ctx.schemas, knownModels, variantSchemaNames));
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

  private generateModel(
    name: string,
    schema: any,
    schemas: SchemaContext['schemas'],
    knownModels: Set<string>,
    variantSchemaNames: Set<string>
  ): string {
    const oneOfModel = resolveDiscriminatedUnionModel(
      schema,
      schemas,
      SWIFT_CONFIG.namingConventions.modelName,
      knownModels,
    );
    if (oneOfModel) {
      return this.generateOneOfEnum(name, oneOfModel);
    }

    return this.generateStruct(name, schema, schemas, variantSchemaNames.has(name));
  }

  private generateStruct(
    name: string,
    schema: any,
    schemas: SchemaContext['schemas'],
    renderRequiredAsNonOptional: boolean
  ): string {
    const modelSchema = resolveModelSchema(schema, schemas);
    const structName = SWIFT_CONFIG.namingConventions.modelName(name);
    const props = modelSchema.properties || {};
    const entries = Object.entries(props);
    const required = renderRequiredAsNonOptional && Array.isArray(modelSchema.required)
      ? new Set<string>(modelSchema.required)
      : new Set<string>();

    const fields = entries.map(([propName, propSchema]: [string, any]) => {
      const fieldName = SWIFT_CONFIG.namingConventions.propertyName(propName);
      const fieldType = getSwiftType(propSchema, SWIFT_CONFIG);
      return required.has(propName)
        ? `    public let ${fieldName}: ${fieldType}`
        : `    public let ${fieldName}: ${fieldType}?`;
    }).join('\n');

    const initializer = entries.length === 0
      ? '    public init() {}'
      : [
        `    public init(${entries.map(([propName, propSchema]: [string, any]) => {
          const fieldName = SWIFT_CONFIG.namingConventions.propertyName(propName);
          const fieldType = getSwiftType(propSchema, SWIFT_CONFIG);
          return required.has(propName)
            ? `${fieldName}: ${fieldType}`
            : `${fieldName}: ${fieldType}? = nil`;
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

  private generateOneOfEnum(
    name: string,
    oneOfModel: NonNullable<ReturnType<typeof resolveDiscriminatedUnionModel>>
  ): string {
    const enumName = SWIFT_CONFIG.namingConventions.modelName(name);
    const cases = oneOfModel.variants
      .map((variant) => `    case ${this.resolveCaseName(variant.modelName, enumName)}(${variant.modelName})`)
      .join('\n');
    const decodeCases = oneOfModel.variants
      .map((variant) => {
        const caseName = this.resolveCaseName(variant.modelName, enumName);
        const discriminatorValue = this.escapeSwiftString(variant.discriminatorValue);
        return `        case "${discriminatorValue}": self = .${caseName}(try ${variant.modelName}(from: decoder))`;
      })
      .join('\n');
    const encodeCases = oneOfModel.variants
      .map((variant) => {
        const caseName = this.resolveCaseName(variant.modelName, enumName);
        return `        case .${caseName}(let value): try value.encode(to: encoder)`;
      })
      .join('\n');
    const discriminatorProperty = SWIFT_CONFIG.namingConventions.propertyName(oneOfModel.discriminatorProperty);
    const codingKey = this.escapeSwiftString(oneOfModel.discriminatorProperty);

    return `public enum ${enumName}: Codable {
${cases}

    private enum CodingKeys: String, CodingKey {
        case ${discriminatorProperty} = "${codingKey}"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(String.self, forKey: .${discriminatorProperty})
        switch kind {
${decodeCases}
        default:
            throw DecodingError.dataCorruptedError(forKey: .${discriminatorProperty}, in: container, debugDescription: "Unknown ${oneOfModel.discriminatorProperty} discriminator: \\(kind)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
${encodeCases}
        }
    }
}`;
  }

  private resolveVariantSchemaNames(
    schemas: SchemaContext['schemas'],
    knownModels: Set<string>
  ): Set<string> {
    const schemaNames = new Set<string>();
    for (const schema of Object.values(schemas)) {
      const oneOfModel = resolveDiscriminatedUnionModel(
        schema,
        schemas,
        SWIFT_CONFIG.namingConventions.modelName,
        knownModels,
      );
      if (!oneOfModel) {
        continue;
      }
      for (const variant of oneOfModel.variants) {
        schemaNames.add(variant.schemaName);
      }
    }
    return schemaNames;
  }

  private format(content: string): string {
    return `${content.trim().replace(/[ \t]+$/gm, '')}\n`;
  }

  private resolveCaseName(variantModelName: string, baseModelName: string): string {
    const stripped = variantModelName.endsWith(baseModelName)
      ? variantModelName.slice(0, -baseModelName.length)
      : variantModelName;
    const preferred = stripped || variantModelName || 'variant';
    const pascal = SWIFT_CONFIG.namingConventions.modelName(preferred);
    return pascal ? `${pascal.charAt(0).toLowerCase()}${pascal.slice(1)}` : 'variant';
  }

  private escapeSwiftString(value: string): string {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}
