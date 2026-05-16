import { resolveModelSchema, resolveSchemaType } from '../../framework/schema.js';
import { GO_CONFIG, getGoType } from './config.js';
export class ModelGenerator {
    generate(ctx, config) {
        const files = [];
        files.push(this.generateCommonTypes(config));
        for (const [name, schema] of Object.entries(ctx.schemas)) {
            files.push(this.generateModel(name, schema, ctx.schemas, config));
        }
        files.push(this.generateModelsIndex(config));
        return files;
    }
    generateCommonTypes(config) {
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
    generateModel(name, schema, schemas, config) {
        const modelName = GO_CONFIG.namingConventions.modelName(name);
        const fileName = GO_CONFIG.namingConventions.fileName(name);
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
        const fields = Object.entries(props).map(([propName, propSchema]) => {
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
    generateModelsIndex(config) {
        return {
            path: 'types/doc.go',
            content: this.format(`package types

// Models for ${config.name}
`),
            language: 'go',
            description: 'Type exports',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
