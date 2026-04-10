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
        const entries = Object.entries(props);
        const fields = entries.map(([propName, propSchema]) => {
            const fieldName = SWIFT_CONFIG.namingConventions.propertyName(propName);
            const fieldType = getSwiftType(propSchema, SWIFT_CONFIG);
            return `    public let ${fieldName}: ${fieldType}?`;
        }).join('\n');
        const initializer = entries.length === 0
            ? '    public init() {}'
            : [
                `    public init(${entries.map(([propName, propSchema]) => {
                    const fieldName = SWIFT_CONFIG.namingConventions.propertyName(propName);
                    const fieldType = getSwiftType(propSchema, SWIFT_CONFIG);
                    return `${fieldName}: ${fieldType}? = nil`;
                }).join(', ')}) {`,
                ...entries.map(([propName]) => {
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
    format(content) {
        return content.trim() + '\n';
    }
}
