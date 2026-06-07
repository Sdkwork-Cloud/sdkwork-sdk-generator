import { resolveDefaultDistributionName } from '../../framework/package-identity.js';
import { toSafeCamelIdentifier, toSafePascalIdentifier } from '../../framework/identifiers.js';
import { getConstSchemaInfo, getSchemaReferenceName, getTupleSchemaInfo, pickComposedSchema, resolveSchemaType } from '../../framework/schema.js';
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
    'hashcode',
    'on',
    'operator',
    'part',
    'required',
    'rethrow',
    'return',
    'runtimetype',
    'sealed',
    'set',
    'show',
    'static',
    'super',
    'switch',
    'sync',
    'this',
    'throw',
    'tostring',
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
        modelName: (name) => toSafePascalIdentifier(name, DART_RESERVED_WORDS),
        propertyName: (name) => toSafeCamelIdentifier(name, DART_RESERVED_WORDS),
        methodName: (name) => toSafeCamelIdentifier(name, DART_RESERVED_WORDS),
        fileName: (name) => toSnakeCase(name),
        packageName: (name) => toSnakeCase(name),
    },
};
function toSnakeCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .toLowerCase();
}
export function getDartType(schema, config) {
    if (!schema || typeof schema !== 'object') {
        return 'dynamic';
    }
    if (schema.$ref) {
        const refName = getSchemaReferenceName(schema.$ref);
        return config.namingConventions.modelName(refName);
    }
    const composed = pickDartComposedSchema(schema);
    if (composed) {
        return getDartType(composed, config);
    }
    const constInfo = getConstSchemaInfo(schema);
    if (constInfo) {
        return getDartPrimitiveType(constInfo.type);
    }
    const type = resolveSchemaType(schema).effectiveType;
    if (type === 'string')
        return 'String';
    if (type === 'number')
        return 'double';
    if (type === 'integer')
        return 'int';
    if (type === 'boolean')
        return 'bool';
    if (type === 'array') {
        if (getTupleSchemaInfo(schema)) {
            return 'List<dynamic>';
        }
        const itemType = schema.items && typeof schema.items === 'object' ? getDartType(schema.items, config) : 'dynamic';
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
function getDartPrimitiveType(type) {
    if (type === 'string')
        return 'String';
    if (type === 'number')
        return 'double';
    if (type === 'integer')
        return 'int';
    if (type === 'boolean')
        return 'bool';
    return 'dynamic';
}
function pickDartComposedSchema(schema) {
    if (!schema || typeof schema !== 'object') {
        return undefined;
    }
    if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
        return pickComposedSchema({ allOf: schema.allOf });
    }
    const unionSchemas = Array.isArray(schema.oneOf)
        ? schema.oneOf
        : Array.isArray(schema.anyOf)
            ? schema.anyOf
            : undefined;
    if (!unionSchemas || unionSchemas.length === 0) {
        return undefined;
    }
    const nonNullSchemas = unionSchemas.filter((entry) => entry && typeof entry === 'object' && getDartType(entry, DART_CONFIG) !== 'dynamic');
    return nonNullSchemas.length === 1 ? nonNullSchemas[0] : undefined;
}
export function getDartPackageName(config) {
    const raw = String(config.packageName || '').trim();
    if (raw) {
        return toSnakeCase(raw);
    }
    return toSnakeCase(`${resolveDefaultDistributionName(config)}-dart`);
}
