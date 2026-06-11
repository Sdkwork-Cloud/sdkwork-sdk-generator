import { resolveDiscriminatedUnionModel } from '../../framework/discriminated-union.js';
import { resolveModelSchema } from '../../framework/schema.js';
import { resolveJvmSdkIdentity } from '../../framework/jvm-sdk-identity.js';
import { KOTLIN_CONFIG, getKotlinType } from './config.js';
export class ModelGenerator {
    generate(ctx, config) {
        const files = [];
        const packageName = resolveJvmSdkIdentity(config);
        const knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => KOTLIN_CONFIG.namingConventions.modelName(schemaName)));
        const variantBaseBySchemaName = this.resolveVariantBaseModels(ctx.schemas, knownModels);
        for (const [name, schema] of Object.entries(ctx.schemas)) {
            files.push(this.generateDataClass(name, schema, ctx.schemas, packageName, knownModels, variantBaseBySchemaName));
        }
        return files;
    }
    generateDataClass(name, schema, schemas, packageName, knownModels, variantBaseBySchemaName) {
        const oneOfModel = resolveDiscriminatedUnionModel(schema, schemas, KOTLIN_CONFIG.namingConventions.modelName, knownModels);
        if (oneOfModel) {
            return this.generateOneOfBaseModel(name, oneOfModel, packageName);
        }
        const modelSchema = resolveModelSchema(schema, schemas);
        const className = KOTLIN_CONFIG.namingConventions.modelName(name);
        const baseClassName = variantBaseBySchemaName.get(name);
        const props = modelSchema.properties || {};
        const required = baseClassName && Array.isArray(modelSchema.required)
            ? new Set(modelSchema.required)
            : new Set();
        const fields = Object.entries(props).map(([propName, propSchema]) => {
            const fieldName = KOTLIN_CONFIG.namingConventions.propertyName(propName);
            const fieldType = getKotlinType(propSchema, KOTLIN_CONFIG);
            return required.has(propName)
                ? `    val ${fieldName}: ${fieldType}`
                : `    val ${fieldName}: ${fieldType}? = null`;
        }).join(',\n');
        return {
            path: `src/main/kotlin/${packageName.packagePath}/${className}.kt`,
            content: this.format(`package ${packageName.packageRoot}

data class ${className}(
${fields}
)${baseClassName ? ` : ${baseClassName}` : ''}
`),
            language: 'kotlin',
            description: `${className} model`,
        };
    }
    generateOneOfBaseModel(name, oneOfModel, packageName) {
        const className = KOTLIN_CONFIG.namingConventions.modelName(name);
        const subTypes = oneOfModel.variants
            .map((variant) => `    @JsonSubTypes.Type(value = ${variant.modelName}::class, name = "${this.escapeKotlinString(variant.discriminatorValue)}")`)
            .join(',\n');
        const discriminatorProperty = this.escapeKotlinString(oneOfModel.discriminatorProperty);
        return {
            path: `src/main/kotlin/${packageName.packagePath}/${className}.kt`,
            content: this.format(`package ${packageName.packageRoot}

import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonSubTypes.Type
import com.fasterxml.jackson.annotation.JsonTypeInfo

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.EXISTING_PROPERTY, property = "${discriminatorProperty}", visible = true)
@JsonSubTypes(
${subTypes}
)
sealed interface ${className}
`),
            language: 'kotlin',
            description: `${className} discriminated union model`,
        };
    }
    resolveVariantBaseModels(schemas, knownModels) {
        const variantBaseBySchemaName = new Map();
        for (const [name, schema] of Object.entries(schemas)) {
            const oneOfModel = resolveDiscriminatedUnionModel(schema, schemas, KOTLIN_CONFIG.namingConventions.modelName, knownModels);
            if (!oneOfModel) {
                continue;
            }
            const baseClassName = KOTLIN_CONFIG.namingConventions.modelName(name);
            for (const variant of oneOfModel.variants) {
                variantBaseBySchemaName.set(variant.schemaName, baseClassName);
            }
        }
        return variantBaseBySchemaName;
    }
    format(content) {
        return `${content.trim().replace(/[ \t]+$/gm, '')}\n`;
    }
    escapeKotlinString(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }
}
