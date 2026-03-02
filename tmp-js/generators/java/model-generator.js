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
        const fields = Object.entries(props).map(([propName, propSchema]) => {
            const fieldName = JAVA_CONFIG.namingConventions.propertyName(propName);
            const fieldType = getJavaType(propSchema, JAVA_CONFIG);
            return `    private ${fieldType} ${fieldName};`;
        }).join('\n');
        const getters = Object.entries(props).map(([propName, propSchema]) => {
            const fieldName = JAVA_CONFIG.namingConventions.propertyName(propName);
            const fieldType = getJavaType(propSchema, JAVA_CONFIG);
            const methodName = JAVA_CONFIG.namingConventions.methodName(`get_${propName}`);
            return `
    public ${fieldType} ${methodName}() {
        return this.${fieldName};
    }
    
    public void set${JAVA_CONFIG.namingConventions.modelName(propName)}(${fieldType} ${fieldName}) {
        this.${fieldName} = ${fieldName};
    }`;
        }).join('\n');
        return {
            path: `src/main/java/com/sdkwork/${packageName}/model/${className}.java`,
            content: this.format(`package com.sdkwork.${packageName}.model;

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
}
