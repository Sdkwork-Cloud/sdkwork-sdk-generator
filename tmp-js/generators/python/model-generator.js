import { PYTHON_CONFIG, getPythonPackageRoot, getPythonType } from './config.js';
export class ModelGenerator {
    generate(ctx, config) {
        const files = [];
        const packageRoot = getPythonPackageRoot(config);
        const knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => PYTHON_CONFIG.namingConventions.modelName(schemaName)));
        const modelNameToFile = new Map(Object.keys(ctx.schemas).map((schemaName) => {
            const modelName = PYTHON_CONFIG.namingConventions.modelName(schemaName);
            const fileName = PYTHON_CONFIG.namingConventions.fileName(schemaName);
            return [modelName, fileName];
        }));
        for (const [name, schema] of Object.entries(ctx.schemas)) {
            files.push(this.generateModel(name, schema, packageRoot, knownModels, modelNameToFile));
        }
        files.push(this.generateModelsIndex(ctx, packageRoot));
        return files;
    }
    generateModel(name, schema, packageRoot, knownModels, modelNameToFile) {
        const modelName = PYTHON_CONFIG.namingConventions.modelName(name);
        const props = schema.properties || {};
        const required = schema.required || [];
        const referencedModels = Array.from(this.collectReferencedModels(schema, knownModels))
            .filter((refModel) => refModel !== modelName)
            .sort((a, b) => a.localeCompare(b));
        const importBlock = referencedModels.length > 0
            ? referencedModels
                .map((refModel) => {
                const refFile = modelNameToFile.get(refModel) ?? PYTHON_CONFIG.namingConventions.fileName(refModel);
                return `from .${refFile} import ${refModel}`;
            })
                .join('\n')
            : '';
        const propEntries = Object.entries(props);
        const orderedProps = [
            ...propEntries.filter(([propName]) => required.includes(propName)),
            ...propEntries.filter(([propName]) => !required.includes(propName)),
        ];
        const fields = orderedProps.map(([propName, propSchema]) => {
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
${importBlock ? `${importBlock}\n` : ''}

@dataclass
class ${modelName}:
${docComment}${fields || '    pass'}
`),
            language: 'python',
            description: `${modelName} model`,
        };
    }
    collectReferencedModels(schema, knownModels, refs = new Set(), visited = new Set()) {
        if (!schema || typeof schema !== 'object') {
            return refs;
        }
        if (visited.has(schema)) {
            return refs;
        }
        visited.add(schema);
        if (schema.$ref) {
            const refName = schema.$ref.split('/').pop();
            const modelName = PYTHON_CONFIG.namingConventions.modelName(refName ?? '');
            if (knownModels.has(modelName)) {
                refs.add(modelName);
            }
            return refs;
        }
        for (const key of ['oneOf', 'anyOf', 'allOf']) {
            const candidates = schema[key];
            if (Array.isArray(candidates)) {
                for (const candidate of candidates) {
                    this.collectReferencedModels(candidate, knownModels, refs, visited);
                }
            }
        }
        if (schema.items) {
            this.collectReferencedModels(schema.items, knownModels, refs, visited);
        }
        if (schema.properties && typeof schema.properties === 'object') {
            for (const propSchema of Object.values(schema.properties)) {
                this.collectReferencedModels(propSchema, knownModels, refs, visited);
            }
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            this.collectReferencedModels(schema.additionalProperties, knownModels, refs, visited);
        }
        return refs;
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
