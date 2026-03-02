import { SWIFT_CONFIG, getSwiftType } from './config.js';
export class ModelGenerator {
    generate(ctx, config) {
        const models = [];
        for (const [name, schema] of Object.entries(ctx.schemas)) {
            models.push(this.generateStruct(name, schema));
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
    generateStruct(name, schema) {
        const structName = SWIFT_CONFIG.namingConventions.modelName(name);
        const props = schema.properties || {};
        const fields = Object.entries(props).map(([propName, propSchema]) => {
            const fieldName = SWIFT_CONFIG.namingConventions.propertyName(propName);
            const fieldType = getSwiftType(propSchema, SWIFT_CONFIG);
            return `    let ${fieldName}: ${fieldType}?`;
        }).join('\n');
        return `struct ${structName}: Codable {
${fields}
}`;
    }
    format(content) {
        return content.trim() + '\n';
    }
}
