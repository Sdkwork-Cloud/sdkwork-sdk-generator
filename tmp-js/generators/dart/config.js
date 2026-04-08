import { toSafeCamelIdentifier } from '../../framework/identifiers.js';
export const DART_RESERVED_WORDS = new Set([
    'abstract',
    'as',
    'assert',
    'async',
    'await',
    'base',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'covariant',
    'default',
    'deferred',
    'do',
    'dynamic',
    'else',
    'enum',
    'export',
    'extends',
    'extension',
    'external',
    'false',
    'factory',
    'final',
    'finally',
    'for',
    'function',
    'get',
    'hide',
    'if',
    'implements',
    'import',
    'in',
    'interface',
    'is',
    'late',
    'library',
    'mixin',
    'new',
    'null',
    'on',
    'operator',
    'part',
    'required',
    'rethrow',
    'return',
    'sealed',
    'set',
    'show',
    'static',
    'super',
    'switch',
    'sync',
    'this',
    'throw',
    'true',
    'try',
    'typedef',
    'var',
    'void',
    'while',
    'with',
    'yield',
]);
export const DART_CONFIG = {
    language: 'dart',
    displayName: 'Dart',
    description: 'Generate standalone Dart SDK for CLI, server, and shared runtime clients',
    fileExtension: '.dart',
    supportsTests: true,
    supportsStrictTypes: true,
    supportsAsyncAwait: true,
    defaultIndent: '  ',
    lineEnding: '\n',
    typeMapping: {
        string: 'String',
        number: 'double',
        integer: 'int',
        boolean: 'bool',
        array: 'List<dynamic>',
        object: 'dynamic',
        date: 'String',
        datetime: 'String',
        uuid: 'String',
        email: 'String',
        url: 'String',
    },
    namingConventions: {
        modelName: (name) => toPascalCase(name),
        propertyName: (name) => toSafeCamelIdentifier(name, DART_RESERVED_WORDS),
        methodName: (name) => toSafeCamelIdentifier(name, DART_RESERVED_WORDS),
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
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
}
function toSnakeCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .toLowerCase();
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
export function getDartType(schema, config) {
    if (!schema || typeof schema !== 'object') {
        return 'dynamic';
    }
    if (schema.$ref) {
        const refName = schema.$ref.split('/').pop();
        return config.namingConventions.modelName(refName);
    }
    const composed = pickComposedSchema(schema);
    if (composed) {
        return getDartType(composed, config);
    }
    const type = normalizeSchemaType(schema.type) || inferImplicitObjectType(schema);
    if (type === 'string')
        return 'String';
    if (type === 'number')
        return 'double';
    if (type === 'integer')
        return 'int';
    if (type === 'boolean')
        return 'bool';
    if (type === 'array') {
        const itemType = schema.items ? getDartType(schema.items, config) : 'dynamic';
        return `List<${itemType}>`;
    }
    if (type === 'object') {
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const valueType = getDartType(schema.additionalProperties, config);
            return `Map<String, ${valueType}>`;
        }
        if (schema.additionalProperties === true) {
            return 'Map<String, dynamic>';
        }
        return 'Map<String, dynamic>';
    }
    return 'dynamic';
}
export function getDartPackageName(config) {
    const raw = String(config.packageName || '').trim();
    if (raw) {
        return toSnakeCase(raw);
    }
    return `sdkwork_${DART_CONFIG.namingConventions.packageName(config.sdkType)}_sdk_dart`;
}
