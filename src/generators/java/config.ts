import type { LanguageConfig } from '../../framework/base.js';
import { toSafeCamelIdentifier, toSafeSnakeIdentifier } from '../../framework/identifiers.js';

export const JAVA_CONFIG: LanguageConfig = {
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

const EMPTY_RESERVED_WORDS = new Set<string>();

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

function toPascalCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

export function getJavaType(schema: any, config: LanguageConfig): string {
  if (!schema || typeof schema !== 'object') {
    return 'Object';
  }

  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    return config.namingConventions.modelName(refName);
  }

  const composed = pickComposedSchema(schema);
  if (composed) {
    return getJavaType(composed, config);
  }

  const type = normalizeSchemaType(schema.type) || inferImplicitObjectType(schema);
  
  if (type === 'string') return 'String';
  if (type === 'number') return 'Double';
  if (type === 'integer') return 'Integer';
  if (type === 'boolean') return 'Boolean';
  
  if (type === 'array') {
    const itemType = schema.items ? getJavaType(schema.items, config) : 'Object';
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

function normalizeSchemaType(type: unknown): string | undefined {
  if (typeof type === 'string') {
    return type;
  }
  if (Array.isArray(type)) {
    const candidate = type.find((entry) => typeof entry === 'string' && entry !== 'null');
    return typeof candidate === 'string' ? candidate : undefined;
  }
  return undefined;
}

function inferImplicitObjectType(schema: any): string | undefined {
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

function pickComposedSchema(schema: any): any | undefined {
  const orderedKeys: Array<'allOf' | 'oneOf' | 'anyOf'> = ['allOf', 'oneOf', 'anyOf'];
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
