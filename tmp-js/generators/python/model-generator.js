import { collectSchemaReferences, resolveModelSchema } from '../../framework/schema.js';
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
            files.push(this.generateModel(name, schema, ctx.schemas, packageRoot, knownModels, modelNameToFile));
        }
        files.push(this.generateModelsIndex(ctx, packageRoot));
        return files;
    }
    generateModel(name, schema, schemas, packageRoot, knownModels, modelNameToFile) {
        const modelSchema = resolveModelSchema(schema, schemas);
        const modelName = PYTHON_CONFIG.namingConventions.modelName(name);
        const props = modelSchema.properties || {};
        const required = modelSchema.required || [];
        const referencedModels = Array.from(collectSchemaReferences(modelSchema, PYTHON_CONFIG.namingConventions.modelName, knownModels))
            .filter((refModel) => refModel !== modelName)
            .sort((a, b) => a.localeCompare(b));
        const importBlock = referencedModels.length > 0
            ? referencedModels
                .map((refModel) => {
                const refFile = modelNameToFile.get(refModel) ?? PYTHON_CONFIG.namingConventions.fileName(refModel);
                return `    from .${refFile} import ${refModel}`;
            })
                .join('\n')
            : '';
        const typingImports = ['TYPE_CHECKING', 'Optional', 'List', 'Dict', 'Any'];
        const normalizedType = getPythonType(modelSchema, PYTHON_CONFIG);
        if (Object.keys(props).length === 0 && normalizedType !== 'Dict[str, Any]') {
            const imports = new Set(['TYPE_CHECKING', 'Optional', 'List', 'Dict', 'Any']);
            if (normalizedType.includes('Tuple[')) {
                imports.add('Tuple');
            }
            if (normalizedType.includes('Literal[')) {
                imports.add('Literal');
            }
            return {
                path: `${packageRoot}/models/${PYTHON_CONFIG.namingConventions.fileName(name)}.py`,
                content: this.format(`from __future__ import annotations
from typing import ${Array.from(imports).join(', ')}
${importBlock ? `\nif TYPE_CHECKING:\n${importBlock}\n` : ''}

${modelName} = ${normalizedType}
`),
                language: 'python',
                description: `${modelName} model`,
            };
        }
        const orderedEntries = [
            ...Object.entries(props).filter(([propName]) => required.includes(propName)),
            ...Object.entries(props).filter(([propName]) => !required.includes(propName)),
        ];
        const fields = orderedEntries.map(([propName, propSchema]) => {
            const isRequired = required.includes(propName);
            const pyType = getPythonType(propSchema, PYTHON_CONFIG);
            if (pyType.includes('Tuple[') && !typingImports.includes('Tuple')) {
                typingImports.push('Tuple');
            }
            if (pyType.includes('Literal[') && !typingImports.includes('Literal')) {
                typingImports.push('Literal');
            }
            const fieldType = this.renderFieldType(pyType, propSchema, isRequired);
            const defaultValue = isRequired ? '' : ' = None';
            const pyName = PYTHON_CONFIG.namingConventions.propertyName(propName);
            return `    ${pyName}: ${fieldType}${defaultValue}`;
        }).join('\n');
        const docComment = modelSchema.description
            ? `    """${modelSchema.description}"""\n`
            : '';
        return {
            path: `${packageRoot}/models/${PYTHON_CONFIG.namingConventions.fileName(name)}.py`,
            content: this.format(`from __future__ import annotations
from dataclasses import dataclass
from typing import ${typingImports.join(', ')}
${importBlock ? `\nif TYPE_CHECKING:\n${importBlock}\n` : ''}

@dataclass
class ${modelName}:
${docComment}${fields || '    pass'}
`),
            language: 'python',
            description: `${modelName} model`,
        };
    }
    renderFieldType(pyType, schema, isRequired) {
        if (isRequired && !this.isNullableSchema(schema)) {
            return pyType;
        }
        if (pyType === 'Any' || pyType.startsWith('Optional[')) {
            return pyType;
        }
        return `Optional[${pyType}]`;
    }
    isNullableSchema(schema) {
        if (!schema || typeof schema !== 'object') {
            return false;
        }
        if (schema.nullable === true) {
            return true;
        }
        if (Array.isArray(schema.type) && schema.type.includes('null')) {
            return true;
        }
        for (const key of ['oneOf', 'anyOf']) {
            const values = schema[key];
            if (Array.isArray(values) && values.some((value) => this.isNullableSchema(value))) {
                return true;
            }
        }
        return false;
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
