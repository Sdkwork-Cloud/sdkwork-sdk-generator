import { CSHARP_CONFIG, getCSharpType } from './config.js';
export class ModelGenerator {
    generate(ctx, config) {
        const files = [];
        for (const [name, schema] of Object.entries(ctx.schemas)) {
            files.push(this.generateClass(name, schema, config));
        }
        return files;
    }
    generateClass(name, schema, config) {
        const className = CSHARP_CONFIG.namingConventions.modelName(name);
        const props = schema.properties || {};
        const fields = Object.entries(props).map(([propName, propSchema]) => {
            const fieldName = CSHARP_CONFIG.namingConventions.propertyName(propName);
            const fieldType = getCSharpType(propSchema, CSHARP_CONFIG);
            return `        public ${fieldType}? ${fieldName} { get; set; }`;
        }).join('\n');
        return {
            path: `Models/${className}.cs`,
            content: this.format(`using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ${CSHARP_CONFIG.namingConventions.modelName(config.sdkType)}.Models
{
    public class ${className}
    {
${fields}
    }
}
`),
            language: 'csharp',
            description: `${className} model`,
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
