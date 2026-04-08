import { PHP_CONFIG, getPhpNamespace, getPhpType } from './config.js';
export class ModelGenerator {
    generate(ctx, config) {
        return Object.entries(ctx.schemas).map(([name, schema]) => this.generateModel(name, schema, config));
    }
    generateModel(name, schema, config) {
        const baseNamespace = getPhpNamespace(config);
        const namespace = `${baseNamespace}\\Models`;
        const modelName = PHP_CONFIG.namingConventions.modelName(name);
        const properties = Object.entries(schema?.properties || {});
        const referencedModels = Array.from(this.collectReferencedModels(schema, new Set()))
            .filter((refName) => refName !== modelName)
            .sort((left, right) => left.localeCompare(right));
        const useStatements = referencedModels.map((refName) => `use ${namespace}\\${refName};`).join('\n');
        const propertyLines = properties.length > 0
            ? properties.map(([propName, propSchema]) => this.generateProperty(propName, propSchema, modelName)).join('\n\n')
            : '    // OpenAPI schema defines no explicit properties.';
        const assignments = properties.length > 0
            ? properties.map(([propName, propSchema]) => this.generateAssignment(propName, propSchema, modelName)).join('\n')
            : '        // No properties to hydrate.';
        const exports = properties.length > 0
            ? properties.map(([propName, propSchema]) => this.generateExport(propName, propSchema, modelName)).join('\n')
            : '            // No properties to serialize.';
        const description = schema?.description
            ? `/**\n * ${sanitizeDocComment(schema.description)}\n */\n`
            : '';
        const useBlock = useStatements ? `${useStatements}\n\n` : '';
        return {
            path: `src/Models/${PHP_CONFIG.namingConventions.fileName(name)}.php`,
            content: this.format(`<?php

declare(strict_types=1);

namespace ${namespace};

${useBlock}${description}final class ${modelName}
{
${propertyLines}

    public function __construct(array $data = [])
    {
${assignments}
    }

    public static function fromArray(?array $data): ?self
    {
        return $data === null ? null : new self($data);
    }

    public function toArray(): array
    {
        return [
${exports}
        ];
    }
}
`),
            language: 'php',
            description: `${modelName} model`,
        };
    }
    generateProperty(propName, propSchema, currentModelName) {
        const typeHint = this.resolvePropertyTypeHint(propSchema, currentModelName);
        const defaultValue = this.resolveDefaultValue(propSchema);
        const phpName = PHP_CONFIG.namingConventions.propertyName(propName);
        const description = propSchema?.description
            ? `    /** ${sanitizeDocComment(propSchema.description)} */\n`
            : '';
        return `${description}    public ${typeHint ? `${typeHint} ` : ''}$${phpName} = ${defaultValue};`;
    }
    generateAssignment(propName, propSchema, currentModelName) {
        const phpName = PHP_CONFIG.namingConventions.propertyName(propName);
        const dataExpr = `$data['${propName}']`;
        const defaultValue = this.resolveDefaultValue(propSchema);
        return `        $this->${phpName} = array_key_exists('${propName}', $data)
            ? ${this.deserializeExpression(propSchema, dataExpr, currentModelName)}
            : ${defaultValue};`;
    }
    generateExport(propName, propSchema, currentModelName) {
        const phpName = PHP_CONFIG.namingConventions.propertyName(propName);
        return `            '${propName}' => ${this.serializeExpression(propSchema, `$this->${phpName}`, currentModelName)},`;
    }
    resolvePropertyTypeHint(schema, currentModelName) {
        const baseType = getPhpType(schema, PHP_CONFIG);
        if (baseType === 'array' || baseType === 'mixed') {
            return baseType;
        }
        if (baseType === currentModelName) {
            return '?self';
        }
        return `?${baseType}`;
    }
    resolveDefaultValue(schema) {
        const baseType = getPhpType(schema, PHP_CONFIG);
        if (baseType === 'array') {
            return '[]';
        }
        return 'null';
    }
    deserializeExpression(schema, valueExpr, currentModelName) {
        if (!schema || typeof schema !== 'object') {
            return valueExpr;
        }
        if (schema.$ref) {
            const refName = PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            const refTarget = refName === currentModelName ? 'self' : refName;
            return `is_array(${valueExpr}) ? ${refTarget}::fromArray(${valueExpr}) : null`;
        }
        if (schema.items) {
            const itemExpr = this.deserializeArrayItemExpression(schema.items, '$item', currentModelName);
            return `is_array(${valueExpr})
                ? array_values(array_map(static fn($item) => ${itemExpr}, ${valueExpr}))
                : []`;
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const entryExpr = this.deserializeArrayItemExpression(schema.additionalProperties, '$item', currentModelName);
            return `is_array(${valueExpr})
                ? array_map(static fn($item) => ${entryExpr}, ${valueExpr})
                : []`;
        }
        const baseType = getPhpType(schema, PHP_CONFIG);
        if (baseType === 'array') {
            return `is_array(${valueExpr}) ? ${valueExpr} : []`;
        }
        return valueExpr;
    }
    deserializeArrayItemExpression(schema, itemExpr, currentModelName) {
        if (schema?.$ref) {
            const refName = PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            const refTarget = refName === currentModelName ? 'self' : refName;
            return `is_array(${itemExpr}) ? ${refTarget}::fromArray(${itemExpr}) : ${itemExpr}`;
        }
        if (schema?.items) {
            const nestedExpr = this.deserializeArrayItemExpression(schema.items, '$nestedItem', currentModelName);
            return `is_array(${itemExpr})
                        ? array_values(array_map(static fn($nestedItem) => ${nestedExpr}, ${itemExpr}))
                        : []`;
        }
        if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
            const mapExpr = this.deserializeArrayItemExpression(schema.additionalProperties, '$nestedItem', currentModelName);
            return `is_array(${itemExpr})
                        ? array_map(static fn($nestedItem) => ${mapExpr}, ${itemExpr})
                        : []`;
        }
        if (getPhpType(schema, PHP_CONFIG) === 'array') {
            return `is_array(${itemExpr}) ? ${itemExpr} : []`;
        }
        return itemExpr;
    }
    serializeExpression(schema, valueExpr, currentModelName) {
        if (!schema || typeof schema !== 'object') {
            return valueExpr;
        }
        if (schema.$ref) {
            const refName = PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            const refTarget = refName === currentModelName ? 'self' : refName;
            return `${valueExpr} instanceof ${refTarget} ? ${valueExpr}->toArray() : ${valueExpr}`;
        }
        if (schema.items) {
            const itemExpr = this.serializeArrayItemExpression(schema.items, '$item', currentModelName);
            return `array_values(array_map(static fn($item) => ${itemExpr}, ${valueExpr}))`;
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const entryExpr = this.serializeArrayItemExpression(schema.additionalProperties, '$item', currentModelName);
            return `array_map(static fn($item) => ${entryExpr}, ${valueExpr})`;
        }
        return valueExpr;
    }
    serializeArrayItemExpression(schema, itemExpr, currentModelName) {
        if (schema?.$ref) {
            const refName = PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            const refTarget = refName === currentModelName ? 'self' : refName;
            return `${itemExpr} instanceof ${refTarget} ? ${itemExpr}->toArray() : ${itemExpr}`;
        }
        if (schema?.items) {
            const nestedExpr = this.serializeArrayItemExpression(schema.items, '$nestedItem', currentModelName);
            return `is_array(${itemExpr})
                        ? array_values(array_map(static fn($nestedItem) => ${nestedExpr}, ${itemExpr}))
                        : []`;
        }
        if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
            const mapExpr = this.serializeArrayItemExpression(schema.additionalProperties, '$nestedItem', currentModelName);
            return `is_array(${itemExpr})
                        ? array_map(static fn($nestedItem) => ${mapExpr}, ${itemExpr})
                        : []`;
        }
        return itemExpr;
    }
    collectReferencedModels(schema, refs) {
        if (!schema || typeof schema !== 'object') {
            return refs;
        }
        if (schema.$ref) {
            refs.add(PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model'));
            return refs;
        }
        for (const key of ['oneOf', 'anyOf', 'allOf']) {
            if (Array.isArray(schema[key])) {
                schema[key].forEach((entry) => this.collectReferencedModels(entry, refs));
            }
        }
        if (schema.items) {
            this.collectReferencedModels(schema.items, refs);
        }
        if (schema.properties && typeof schema.properties === 'object') {
            Object.values(schema.properties).forEach((entry) => this.collectReferencedModels(entry, refs));
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            this.collectReferencedModels(schema.additionalProperties, refs);
        }
        return refs;
    }
    format(content) {
        return `${content.trim()}\n`;
    }
}
function sanitizeDocComment(value) {
    return String(value || '').replace(/\*\//g, '* /').trim();
}
