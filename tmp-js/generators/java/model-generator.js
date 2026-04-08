import { JAVA_CONFIG, getJavaType } from './config.js';
export class ModelGenerator {
    generate(ctx, config) {
        const files = [];
        const packageName = config.sdkType.toLowerCase();
        for (const [name, schema] of Object.entries(ctx.schemas)) {
            files.push(this.generateClass(name, schema, packageName));
        }
        return files;
    }
    generateClass(name, schema, packageName) {
        const className = JAVA_CONFIG.namingConventions.modelName(name);
        const props = schema.properties || {};
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
            path: `src/main/java/com/sdkwork/${packageName}/model/${className}.java`,
            content: this.format(`package com.sdkwork.${packageName}.model;

${this.renderImports(imports)}
public class ${className} {
${fields}
${getters}
}
`),
            language: 'java',
            description: `${className} model`,
        };
    }
    format(content) {
        return content.trim() + '\n';
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
}
