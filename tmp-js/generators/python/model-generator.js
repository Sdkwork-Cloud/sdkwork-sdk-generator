import { PYTHON_CONFIG, getPythonPackageRoot, getPythonType } from './config.js';
export class ModelGenerator {
    generate(ctx, config) {
        const files = [];
        const packageRoot = getPythonPackageRoot(config);
        for (const [name, schema] of Object.entries(ctx.schemas)) {
            files.push(this.generateModel(name, schema, packageRoot));
        }
        files.push(this.generateModelsIndex(ctx, packageRoot));
        return files;
    }
    generateModel(name, schema, packageRoot) {
        const modelName = PYTHON_CONFIG.namingConventions.modelName(name);
        const props = schema.properties || {};
        const required = schema.required || [];
        const orderedEntries = [
            ...Object.entries(props).filter(([propName]) => required.includes(propName)),
            ...Object.entries(props).filter(([propName]) => !required.includes(propName)),
        ];
        const fields = orderedEntries.map(([propName, propSchema]) => {
            const isRequired = required.includes(propName);
            const pyType = getPythonType(propSchema, PYTHON_CONFIG);
            const defaultValue = isRequired ? '' : ' = None';
            const pyName = PYTHON_CONFIG.namingConventions.propertyName(propName);
            return `    ${pyName}: ${pyType}${defaultValue}`;
        }).join('\n');
        const docComment = schema.description
            ? `    """${schema.description}"""\n`
            : '';
        return {
            path: `${packageRoot}/models/${PYTHON_CONFIG.namingConventions.fileName(name)}.py`,
            content: this.format(`from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, List, Dict, Any

@dataclass
class ${modelName}:
${docComment}${fields || '    pass'}
`),
            language: 'python',
            description: `${modelName} model`,
        };
    }
    generateModelsIndex(ctx, packageRoot) {
        const imports = Object.keys(ctx.schemas).map(name => {
            const modelName = PYTHON_CONFIG.namingConventions.modelName(name);
            const fileName = PYTHON_CONFIG.namingConventions.fileName(name);
            return `from .${fileName} import ${modelName}`;
        }).join('\n');
        const exports = Object.keys(ctx.schemas).map(name => {
            return PYTHON_CONFIG.namingConventions.modelName(name);
        }).map(v => `'${v}'`).join(', ');
        return {
            path: `${packageRoot}/models/__init__.py`,
            content: this.format(`from typing import List, Dict, Any

${imports}

__all__ = [${exports}]
`),
            language: 'python',
            description: 'Models index',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
