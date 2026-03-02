import { FLUTTER_CONFIG, getFlutterType } from './config.js';
export class ModelGenerator {
    generate(ctx, config) {
        const models = [];
        for (const [name, schema] of Object.entries(ctx.schemas)) {
            models.push(this.generateClass(name, schema));
        }
        return [{
                path: 'lib/src/models.dart',
                content: this.format(`${models.join('\n\n')}
`),
                language: 'flutter',
                description: 'Data models',
            }];
    }
    generateClass(name, schema) {
        const className = FLUTTER_CONFIG.namingConventions.modelName(name);
        const props = schema.properties || {};
        const fields = Object.entries(props).map(([propName, propSchema]) => {
            const fieldName = FLUTTER_CONFIG.namingConventions.propertyName(propName);
            const fieldType = getFlutterType(propSchema, FLUTTER_CONFIG);
            return `  final ${fieldType}? ${fieldName};`;
        }).join('\n');
        const constructor = Object.entries(props).map(([propName]) => {
            const fieldName = FLUTTER_CONFIG.namingConventions.propertyName(propName);
            return `    this.${fieldName}`;
        }).join(',\n');
        return `class ${className} {
${fields}

  ${className}({
${constructor}
  });
}`;
    }
    format(content) {
        return content.trim() + '\n';
    }
}
