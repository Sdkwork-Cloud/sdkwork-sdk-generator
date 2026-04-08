import { toSafeCamelIdentifier } from '../../framework/identifiers.js';
export const SWIFT_CONFIG = {
    language: 'swift',
    displayName: 'Swift',
    description: 'Generate Swift SDK for iOS/macOS',
    fileExtension: '.swift',
    supportsTests: true,
    supportsStrictTypes: true,
    supportsAsyncAwait: true,
    defaultIndent: '    ',
    lineEnding: '\n',
    typeMapping: {
        string: 'String',
        number: 'Double',
        integer: 'Int',
        boolean: 'Bool',
        array: '[Any]',
        object: 'Any',
        date: 'String',
        datetime: 'String',
        uuid: 'String',
        email: 'String',
        url: 'String',
    },
    namingConventions: {
        modelName: (name) => toPascalCase(name),
        propertyName: (name) => toSafeCamelIdentifier(name, SWIFT_RESERVED_WORDS),
        methodName: (name) => toSafeCamelIdentifier(name, SWIFT_RESERVED_WORDS),
        fileName: (name) => toPascalCase(name),
        packageName: (name) => toSnakeCase(name),
    },
};
const SWIFT_RESERVED_WORDS = new Set([
    'actor',
    'any',
    'as',
    'associatedtype',
    'associativity',
    'async',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'convenience',
    'continue',
    'default',
    'defer',
    'deinit',
    'didset',
    'do',
    'dynamic',
    'else',
    'enum',
    'extension',
    'fallthrough',
    'false',
    'fileprivate',
    'final',
    'for',
    'func',
    'get',
    'guard',
    'if',
    'import',
    'in',
    'indirect',
    'infix',
    'init',
    'inout',
    'internal',
    'is',
    'lazy',
    'left',
    'let',
    'mutating',
    'nil',
    'none',
    'nonmutating',
    'open',
    'operator',
    'optional',
    'override',
    'postfix',
    'precedence',
    'prefix',
    'private',
    'protocol',
    'public',
    'repeat',
    'required',
    'rethrows',
    'return',
    'right',
    'self',
    'set',
    'some',
    'static',
    'struct',
    'subscript',
    'super',
    'switch',
    'throw',
    'throws',
    'true',
    'try',
    'typealias',
    'unowned',
    'var',
    'weak',
    'where',
    'while',
    'willset',
]);
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
export function getSwiftType(schema, config) {
    if (!schema || typeof schema !== 'object') {
        return 'Any';
    }
    if (schema.$ref) {
        const refName = schema.$ref.split('/').pop();
        return config.namingConventions.modelName(refName);
    }
    const composed = pickComposedSchema(schema);
    if (composed) {
        return getSwiftType(composed, config);
    }
    const type = normalizeSchemaType(schema.type) || inferImplicitObjectType(schema);
    if (type === 'string')
        return 'String';
    if (type === 'number')
        return 'Double';
    if (type === 'integer')
        return 'Int';
    if (type === 'boolean')
        return 'Bool';
    if (type === 'array') {
        const itemType = schema.items ? getSwiftType(schema.items, config) : 'Any';
        return `[${itemType}]`;
    }
    if (type === 'object') {
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const valueType = getSwiftType(schema.additionalProperties, config);
            return `[String: ${valueType}]`;
        }
        if (schema.additionalProperties === true) {
            return '[String: Any]';
        }
        return '[String: Any]';
    }
    return 'Any';
}
function normalizeSchemaType(type) {
    if (typeof type === 'string') {
        return type;
    }
    if (Array.isArray(type)) {
        const candidate = type.find((entry) => typeof entry === 'string' && entry !== 'null');
        return typeof candidate === 'string' ? candidate : undefined;
    }
    return undefined;
}
function inferImplicitObjectType(schema) {
    if (!schema || typeof schema !== 'object') {
        return undefined;
    }
    if (schema.properties && typeof schema.properties === 'object') {
        return 'object';
    }
    if (schema.additionalProperties) {
        return 'object';
    }
    return undefined;
}
function pickComposedSchema(schema) {
    const orderedKeys = ['allOf', 'oneOf', 'anyOf'];
    for (const key of orderedKeys) {
        const values = schema?.[key];
        if (!Array.isArray(values) || values.length === 0) {
            continue;
        }
        const candidate = values.find((entry) => entry && typeof entry === 'object' && normalizeSchemaType(entry.type) !== 'null');
        return candidate || values[0];
    }
    return undefined;
}
