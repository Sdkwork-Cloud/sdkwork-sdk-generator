import { resolveDiscriminatedUnionModel } from '../../framework/discriminated-union.js';
import { resolveModelSchema } from '../../framework/schema.js';
import { resolveJvmSdkIdentity } from '../../framework/jvm-sdk-identity.js';
import { JAVA_CONFIG, getJavaType } from './config.js';
import { formatJavaGeneratedContent } from './format.js';
export class ModelGenerator {
    generate(ctx, config) {
        const files = [];
        const identity = resolveJvmSdkIdentity(config);
        const knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => JAVA_CONFIG.namingConventions.modelName(schemaName)));
        const variantBaseBySchemaName = this.resolveVariantBaseModels(ctx.schemas, knownModels);
        for (const [name, schema] of Object.entries(ctx.schemas)) {
            files.push(this.generateClass(name, schema, ctx.schemas, identity, knownModels, variantBaseBySchemaName));
        }
        return files;
    }
    generateClass(name, schema, schemas, packageName, knownModels, variantBaseBySchemaName) {
        const oneOfModel = resolveDiscriminatedUnionModel(schema, schemas, JAVA_CONFIG.namingConventions.modelName, knownModels);
        if (oneOfModel) {
            return this.generateOneOfBaseClass(name, oneOfModel, packageName);
        }
        const modelSchema = resolveModelSchema(schema, schemas);
        const className = JAVA_CONFIG.namingConventions.modelName(name);
        const baseClassName = variantBaseBySchemaName.get(name);
        const props = modelSchema.properties || {};
        const imports = new Set();
        const fields = Object.entries(props).map(([propName, propSchema]) => {
            const fieldName = JAVA_CONFIG.namingConventions.propertyName(propName);
            const fieldType = getJavaType(propSchema, JAVA_CONFIG);
            this.collectImports(fieldType, imports);
            return `    private ${fieldType} ${fieldName};`;
        }).join('\n');
        const getters = Object.entries(props).map(([propName, propSchema]) => {
            const fieldName = JAVA_CONFIG.namingConventions.propertyName(propName);
            const fieldType = getJavaType(propSchema, JAVA_CONFIG);
            const getterName = this.createAccessorName('get', fieldName);
            const setterName = this.createAccessorName('set', fieldName);
            return `
    public ${fieldType} ${getterName}() {
        return this.${fieldName};
    }
    
    public void ${setterName}(${fieldType} ${fieldName}) {
        this.${fieldName} = ${fieldName};
    }`;
        }).join('\n');
        return {
            path: `src/main/java/${packageName.packagePath}/model/${className}.java`,
            content: this.format(`package ${packageName.packageRoot}.model;

${this.renderImports(imports)}
public class ${className}${baseClassName ? ` extends ${baseClassName}` : ''} {
${fields}
${getters}
}
`),
            language: 'java',
            description: `${className} model`,
        };
    }
    generateOneOfBaseClass(name, oneOfModel, packageName) {
        const className = JAVA_CONFIG.namingConventions.modelName(name);
        const subTypes = oneOfModel.variants
            .map((variant) => {
            const discriminatorValue = this.escapeJavaString(variant.discriminatorValue);
            return `    @JsonSubTypes.Type(value = ${variant.modelName}.class, name = "${discriminatorValue}")`;
        })
            .join(',\n');
        const discriminatorProperty = this.escapeJavaString(oneOfModel.discriminatorProperty);
        return {
            path: `src/main/java/${packageName.packagePath}/model/${className}.java`,
            content: this.format(`package ${packageName.packageRoot}.model;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.EXISTING_PROPERTY, property = "${discriminatorProperty}", visible = true)
@JsonSubTypes({
${subTypes}
})
public abstract class ${className} {
}
`),
            language: 'java',
            description: `${className} discriminated union model`,
        };
    }
    resolveVariantBaseModels(schemas, knownModels) {
        const variantBaseBySchemaName = new Map();
        for (const [name, schema] of Object.entries(schemas)) {
            const oneOfModel = resolveDiscriminatedUnionModel(schema, schemas, JAVA_CONFIG.namingConventions.modelName, knownModels);
            if (!oneOfModel) {
                continue;
            }
            const baseClassName = JAVA_CONFIG.namingConventions.modelName(name);
            for (const variant of oneOfModel.variants) {
                variantBaseBySchemaName.set(variant.schemaName, baseClassName);
            }
        }
        return variantBaseBySchemaName;
    }
    format(content) {
        return formatJavaGeneratedContent(content);
    }
    collectImports(fieldType, imports) {
        if (fieldType.includes('List<')) {
            imports.add('import java.util.List;');
        }
        if (fieldType.includes('Map<')) {
            imports.add('import java.util.Map;');
        }
    }
    renderImports(imports) {
        if (imports.size === 0) {
            return '';
        }
        return `${Array.from(imports).sort().join('\n')}\n`;
    }
    createAccessorName(prefix, fieldName) {
        if (!fieldName) {
            return prefix;
        }
        return `${prefix}${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`;
    }
    escapeJavaString(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }
}
