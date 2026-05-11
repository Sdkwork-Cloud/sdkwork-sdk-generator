import { toSafeCamelIdentifier, toSafeSnakeIdentifier } from '../../framework/identifiers.js';
import { getConstSchemaInfo, getSchemaReferenceName, getTupleSchemaInfo, pickComposedSchema, resolveSchemaType } from '../../framework/schema.js';
export const JAVA_CONFIG = {
    language: 'java',
    displayName: 'Java',
    description: 'Generate Java SDK with OkHttp and Jackson',
    fileExtension: '.java',
    supportsTests: true,
    supportsStrictTypes: true,
    supportsAsyncAwait: true,
    defaultIndent: '    ',
    lineEnding: '\n',
    typeMapping: {
        string: 'String',
        number: 'Double',
        integer: 'Integer',
        boolean: 'Boolean',
        array: 'List<Object>',
        object: 'Map<String, Object>',
        date: 'String',
        datetime: 'String',
        uuid: 'String',
        email: 'String',
        url: 'String',
    },
    namingConventions: {
        modelName: (name) => toPascalCase(name),
        propertyName: (name) => toSafeCamelIdentifier(name, JAVA_RESERVED_WORDS),
        methodName: (name) => toSafeCamelIdentifier(name, JAVA_DISALLOWED_METHOD_NAMES),
        fileName: (name) => toPascalCase(name),
        packageName: (name) => toSafeSnakeIdentifier(name, EMPTY_RESERVED_WORDS),
    },
};
const EMPTY_RESERVED_WORDS = new Set();
const JAVA_RESERVED_WORDS = new Set([
    'abstract',
    'assert',
    'boolean',
    'break',
    'byte',
    'case',
    'catch',
    'char',
    'class',
    'const',
    'continue',
    'default',
    'do',
    'double',
    'else',
    'enum',
    'extends',
    'exports',
    'false',
    'final',
    'finally',
    'float',
    'for',
    'goto',
    'if',
    'implements',
    'import',
    'instanceof',
    'int',
    'interface',
    'long',
    'module',
    'native',
    'new',
    'nonsealed',
    'null',
    'open',
    'opens',
    'package',
    'permits',
    'private',
    'protected',
    'public',
    'provides',
    'record',
    'return',
    'requires',
    'sealed',
    'short',
    'static',
    'strictfp',
    'super',
    'switch',
    'synchronized',
    'this',
    'throw',
    'throws',
    'to',
    'transitive',
    'transient',
    'true',
    'try',
    'uses',
    'var',
    'void',
    'volatile',
    'while',
    'with',
    'yield',
]);
const JAVA_DISALLOWED_METHOD_NAMES = new Set([
    ...JAVA_RESERVED_WORDS,
    'clone',
    'finalize',
    'getclass',
    'notify',
    'notifyall',
    'wait',
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
export function getJavaType(schema, config) {
    if (!schema || typeof schema !== 'object') {
        return 'Object';
    }
    if (schema.$ref) {
        const refName = getSchemaReferenceName(schema.$ref);
        return config.namingConventions.modelName(refName);
    }
    const composed = pickComposedSchema(schema);
    if (composed) {
        return getJavaType(composed, config);
    }
    const constInfo = getConstSchemaInfo(schema);
    if (constInfo) {
        return getJavaPrimitiveType(constInfo.type);
    }
    const type = resolveSchemaType(schema).effectiveType;
    if (type === 'string')
        return 'String';
    if (type === 'number')
        return 'Double';
    if (type === 'integer')
        return 'Integer';
    if (type === 'boolean')
        return 'Boolean';
    if (type === 'array') {
        if (getTupleSchemaInfo(schema)) {
            return 'List<Object>';
        }
        const itemType = schema.items && typeof schema.items === 'object' ? getJavaType(schema.items, config) : 'Object';
        return `List<${itemType}>`;
    }
    if (type === 'object') {
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const valueType = getJavaType(schema.additionalProperties, config);
            return `Map<String, ${valueType}>`;
        }
        if (schema.additionalProperties === true) {
            return 'Map<String, Object>';
        }
        return 'Map<String, Object>';
    }
    return 'Object';
}
function getJavaPrimitiveType(type) {
    if (type === 'string')
        return 'String';
    if (type === 'number')
        return 'Double';
    if (type === 'integer')
        return 'Integer';
    if (type === 'boolean')
        return 'Boolean';
    return 'Object';
}
