import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveDiscriminatedUnionModel } from '../../framework/discriminated-union.js';
import { resolveModelSchema, resolveSchemaType } from '../../framework/schema.js';
import { GO_CONFIG, getGoType } from './config.js';

export class ModelGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    
    files.push(this.generateCommonTypes(config));
    
    for (const [name, schema] of Object.entries(ctx.schemas)) {
      files.push(this.generateModel(name, schema, ctx.schemas, config));
    }
    
    files.push(this.generateModelsIndex(config));
    return files;
  }

  private generateCommonTypes(config: GeneratorConfig): GeneratedFile {
    return {
      path: 'types/common.go',
      content: this.format(`package types

type BasePlusVO struct {
    Id        interface{} \`json:"id"\`
    CreatedAt string      \`json:"createdAt"\`
    UpdatedAt string      \`json:"updatedAt"\`
    CreatedBy string      \`json:"createdBy"\`
    UpdatedBy string      \`json:"updatedBy"\`
}

type QueryListForm struct {
    Q           string      \`json:"q"\`
    Status       interface{} \`json:"status"\`
    StartTime    string      \`json:"startTime"\`
    EndTime      string      \`json:"endTime"\`
    OrderBy      string      \`json:"orderBy"\`
    OrderDirection string    \`json:"orderDirection"\`
}

type Page[T any] struct {
    Content     []T   \`json:"content"\`
    Total       int   \`json:"total"\`
    Page        int   \`json:"page"\`
    PageSize    int   \`json:"pageSize"\`
    TotalPages  int   \`json:"totalPages"\`
    HasMore     bool  \`json:"hasMore"\`
}
`),
      language: 'go',
      description: 'Common type definitions',
    };
  }

  private generateModel(name: string, schema: any, schemas: SchemaContext['schemas'], config: GeneratorConfig): GeneratedFile {
    const modelName = GO_CONFIG.namingConventions.modelName(name);
    const fileName = GO_CONFIG.namingConventions.fileName(name);
    const knownModels = new Set<string>(
      Object.keys(schemas).map((schemaName) => GO_CONFIG.namingConventions.modelName(schemaName))
    );
    const oneOfModel = resolveDiscriminatedUnionModel(
      schema,
      schemas,
      GO_CONFIG.namingConventions.modelName,
      knownModels,
    );
    if (oneOfModel) {
      return this.generateOneOfUnionModel(name, oneOfModel);
    }

    const resolvedSchema = resolveModelSchema(schema, schemas);
    const normalizedType = resolveSchemaType(resolvedSchema).effectiveType;

    if (normalizedType && normalizedType !== 'array' && normalizedType !== 'object') {
      return {
        path: `types/${fileName}.go`,
        content: this.format(`package types

${schema.description ? `// ${schema.description}` : ''}
type ${modelName} ${getGoType(resolvedSchema, GO_CONFIG)}
`),
        language: 'go',
        description: `${modelName} model definition`,
      };
    }

    if (normalizedType === 'array') {
      return {
        path: `types/${fileName}.go`,
        content: this.format(`package types

${schema.description ? `// ${schema.description}` : ''}
type ${modelName} ${getGoType(resolvedSchema, GO_CONFIG)}
`),
        language: 'go',
        description: `${modelName} model definition`,
      };
    }

    if (resolvedSchema?.additionalProperties && typeof resolvedSchema.additionalProperties === 'object' && !resolvedSchema?.properties) {
      const valueType = getGoType(resolvedSchema.additionalProperties, GO_CONFIG);
      return {
        path: `types/${fileName}.go`,
        content: this.format(`package types

${schema.description ? `// ${schema.description}` : ''}
type ${modelName} map[string]${valueType}
`),
        language: 'go',
        description: `${modelName} model definition`,
      };
    }

    const props = resolvedSchema.properties || {};
    const fields = Object.entries(props).map(([propName, propSchema]: [string, any]) => {
      const fieldName = GO_CONFIG.namingConventions.propertyName(propName);
      const fieldType = getGoType(propSchema, GO_CONFIG);
      const jsonTag = propName;
      return `\t${fieldName} ${fieldType} \`json:"${jsonTag}"\``;
    }).join('\n');

    return {
      path: `types/${fileName}.go`,
      content: this.format(`package types

${schema.description ? `// ${schema.description}` : ''}
type ${modelName} struct {
${fields}
}
`),
      language: 'go',
      description: `${modelName} model definition`,
    };
  }

  private generateOneOfUnionModel(
    name: string,
    oneOfModel: NonNullable<ReturnType<typeof resolveDiscriminatedUnionModel>>,
  ): GeneratedFile {
    const modelName = GO_CONFIG.namingConventions.modelName(name);
    const fileName = GO_CONFIG.namingConventions.fileName(name);
    const discriminatorStructField = GO_CONFIG.namingConventions.propertyName(oneOfModel.discriminatorProperty);
    const discriminatorJsonTag = this.escapeGoStructTag(oneOfModel.discriminatorProperty);
    const markerMethods = oneOfModel.variants
      .map((variant) => `func (v ${variant.modelName}) is${modelName}() {}`)
      .join('\n');
    const switchCases = oneOfModel.variants
      .map((variant) => {
        const discriminatorValue = this.escapeGoString(variant.discriminatorValue);
        return `\tcase "${discriminatorValue}":
\t\tvar value ${variant.modelName}
\t\tif err := json.Unmarshal(data, &value); err != nil {
\t\t\treturn err
\t\t}
\t\tv.Value = value
\t\treturn nil`;
      })
      .join('\n');
    const discriminatorProperty = this.escapeGoString(oneOfModel.discriminatorProperty);

    return {
      path: `types/${fileName}.go`,
      content: this.format(`package types

import (
\t"encoding/json"
\t"fmt"
)

type ${modelName} struct {
\tValue ${modelName}Value
}

type ${modelName}Value interface {
\tis${modelName}()
}

${markerMethods}

func (v *${modelName}) UnmarshalJSON(data []byte) error {
\tvar discriminator struct {
\t\t${discriminatorStructField} string \`json:"${discriminatorJsonTag}"\`
\t}
\tif err := json.Unmarshal(data, &discriminator); err != nil {
\t\treturn err
\t}

\tswitch discriminator.${discriminatorStructField} {
${switchCases}
\tdefault:
\t\treturn fmt.Errorf("unknown ${discriminatorProperty} discriminator: %s", discriminator.${discriminatorStructField})
\t}
}

func (v ${modelName}) MarshalJSON() ([]byte, error) {
\tif v.Value == nil {
\t\treturn []byte("null"), nil
\t}
\treturn json.Marshal(v.Value)
}
`),
      language: 'go',
      description: `${modelName} discriminated union model definition`,
    };
  }

  private generateModelsIndex(config: GeneratorConfig): GeneratedFile {
    return {
      path: 'types/doc.go',
      content: this.format(`package types

// Models for ${config.name}
`),
      language: 'go',
      description: 'Type exports',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }

  private escapeGoString(value: string): string {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private escapeGoStructTag(value: string): string {
    return String(value || '').replace(/\\/g, '\\\\').replace(/`/g, '');
  }
}
