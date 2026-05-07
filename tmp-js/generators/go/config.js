import { getConstSchemaInfo, getTupleSchemaInfo, pickComposedSchema, resolveSchemaType } from '../../framework/schema.js';
export const GO_CONFIG = {
    language: 'go',
    displayName: 'Go',
    description: 'Generate Go SDK with strong typing and http client',
    fileExtension: '.go',
    supportsTests: true,
    supportsStrictTypes: true,
    supportsAsyncAwait: true,
    defaultIndent: '\t',
    lineEnding: '\n',
    typeMapping: {
        string: 'string',
        number: 'float64',
        integer: 'int',
        boolean: 'bool',
        array: '[]interface{}',
        object: 'interface{}',
        date: 'string',
        datetime: 'string',
        uuid: 'string',
        email: 'string',
        url: 'string',
    },
    namingConventions: {
        modelName: (name) => toPascalCase(name),
        propertyName: (name) => toPascalCase(name),
        methodName: (name) => toPascalCase(name),
        fileName: (name) => toSnakeCase(name),
        packageName: (name) => toSnakeCase(name),
    },
};
function toPascalCase(str) {
    return str
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
}
function toSnakeCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .toLowerCase();
}
export function getGoType(schema, config) {
    if (!schema || typeof schema !== 'object') {
        return 'interface{}';
    }
    if (schema.$ref) {
        const refName = schema.$ref.split('/').pop();
        return config.namingConventions.modelName(refName);
    }
    const composed = pickComposedSchema(schema);
    if (composed) {
        return getGoType(composed, config);
    }
    const constInfo = getConstSchemaInfo(schema);
    if (constInfo) {
        return getGoPrimitiveType(constInfo.type);
    }
    const type = resolveSchemaType(schema).effectiveType;
    if (type === 'string')
        return 'string';
    if (type === 'number')
        return 'float64';
    if (type === 'integer')
        return 'int';
    if (type === 'boolean')
        return 'bool';
    if (type === 'array') {
        if (getTupleSchemaInfo(schema)) {
            return '[]interface{}';
        }
        const itemType = schema.items && typeof schema.items === 'object' ? getGoType(schema.items, config) : 'interface{}';
        return `[]${itemType}`;
    }
    if (type === 'object') {
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const valueType = getGoType(schema.additionalProperties, config);
            return `map[string]${valueType}`;
        }
        if (schema.additionalProperties === true) {
            return 'map[string]interface{}';
        }
        return 'map[string]interface{}';
    }
    return 'interface{}';
}
function getGoPrimitiveType(type) {
    if (type === 'string')
        return 'string';
    if (type === 'number')
        return 'float64';
    if (type === 'integer')
        return 'int';
    if (type === 'boolean')
        return 'bool';
    return 'interface{}';
}
