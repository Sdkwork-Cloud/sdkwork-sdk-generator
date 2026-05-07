import { resolveSdkTypePascal } from '../../framework/sdk-identity.js';
import { getConstSchemaInfo, getTupleSchemaInfo, pickComposedSchema, resolveSchemaType } from '../../framework/schema.js';
export const CSHARP_CONFIG = {
    language: 'csharp',
    displayName: 'C# (.NET)',
    description: 'Generate C# SDK for .NET',
    fileExtension: '.cs',
    supportsTests: true,
    supportsStrictTypes: true,
    supportsAsyncAwait: true,
    defaultIndent: '    ',
    lineEnding: '\n',
    typeMapping: {
        string: 'string',
        number: 'double',
        integer: 'int',
        boolean: 'bool',
        array: 'List<object>',
        object: 'object',
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
        fileName: (name) => toPascalCase(name),
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
export function getCSharpType(schema, config) {
    if (!schema || typeof schema !== 'object') {
        return 'object';
    }
    if (schema.$ref) {
        const refName = schema.$ref.split('/').pop();
        return config.namingConventions.modelName(refName);
    }
    const composed = pickComposedSchema(schema);
    if (composed) {
        return getCSharpType(composed, config);
    }
    const constInfo = getConstSchemaInfo(schema);
    if (constInfo) {
        return getCSharpPrimitiveType(constInfo.type);
    }
    const type = resolveSchemaType(schema).effectiveType;
    if (type === 'string')
        return 'string';
    if (type === 'number')
        return 'double';
    if (type === 'integer')
        return 'int';
    if (type === 'boolean')
        return 'bool';
    if (type === 'array') {
        if (getTupleSchemaInfo(schema)) {
            return 'List<object>';
        }
        const itemType = schema.items && typeof schema.items === 'object' ? getCSharpType(schema.items, config) : 'object';
        return `List<${itemType}>`;
    }
    if (type === 'object') {
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const valueType = getCSharpType(schema.additionalProperties, config);
            return `Dictionary<string, ${valueType}>`;
        }
        if (schema.additionalProperties === true) {
            return 'Dictionary<string, object>';
        }
        return 'Dictionary<string, object>';
    }
    return 'object';
}
function getCSharpPrimitiveType(type) {
    if (type === 'string')
        return 'string';
    if (type === 'number')
        return 'double';
    if (type === 'integer')
        return 'int';
    if (type === 'boolean')
        return 'bool';
    return 'object';
}
export function getCSharpNamespace(config) {
    const explicit = String(config.namespace || '').trim();
    if (explicit) {
        return explicit.replace(/\//g, '.').replace(/\\/g, '.');
    }
    return resolveSdkTypePascal(config);
}
export function getCSharpPackageId(config) {
    const explicit = String(config.packageName || '').trim();
    if (explicit) {
        return explicit;
    }
    return getCSharpNamespace(config);
}
