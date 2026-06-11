import { resolveDiscriminatedUnionModel } from '../../framework/discriminated-union.js';
import { resolveModelSchema } from '../../framework/schema.js';
import { CSHARP_CONFIG, getCSharpNamespace, getCSharpType } from './config.js';
export class ModelGenerator {
    generate(ctx, config) {
        const files = [];
        const knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => CSHARP_CONFIG.namingConventions.modelName(schemaName)));
        const variantBaseBySchemaName = this.resolveVariantBaseModels(ctx.schemas, knownModels);
        for (const [name, schema] of Object.entries(ctx.schemas)) {
            files.push(this.generateClass(name, schema, ctx.schemas, config, knownModels, variantBaseBySchemaName));
        }
        return files;
    }
    generateClass(name, schema, schemas, config, knownModels, variantBaseBySchemaName) {
        const oneOfModel = resolveDiscriminatedUnionModel(schema, schemas, CSHARP_CONFIG.namingConventions.modelName, knownModels);
        if (oneOfModel) {
            return this.generateOneOfBaseClass(name, oneOfModel, config);
        }
        const modelSchema = resolveModelSchema(schema, schemas);
        const className = CSHARP_CONFIG.namingConventions.modelName(name);
        const baseClassName = variantBaseBySchemaName.get(name);
        const props = modelSchema.properties || {};
        const required = Array.isArray(modelSchema.required)
            ? new Set(modelSchema.required)
            : new Set();
        const fields = Object.entries(props).map(([propName, propSchema]) => {
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
    generateOneOfBaseClass(name, oneOfModel, config) {
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
    resolveVariantBaseModels(schemas, knownModels) {
        const variantBaseBySchemaName = new Map();
        for (const [name, schema] of Object.entries(schemas)) {
            const oneOfModel = resolveDiscriminatedUnionModel(schema, schemas, CSHARP_CONFIG.namingConventions.modelName, knownModels);
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
    format(content) {
        return `${content.trim().replace(/[ \t]+$/gm, '')}\n`;
    }
    escapeCSharpString(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }
}
