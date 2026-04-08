import type { LanguageConfig } from '../../framework/base.js';
import { toSafeCamelIdentifier } from '../../framework/identifiers.js';

export const KOTLIN_CONFIG: LanguageConfig = {
  language: 'kotlin',
  displayName: 'Kotlin',
  description: 'Generate Kotlin SDK for Android/JVM',
  fileExtension: '.kt',
  supportsTests: true,
  supportsStrictTypes: true,
  supportsAsyncAwait: true,
  defaultIndent: '    ',
  lineEnding: '\n',
  typeMapping: {
    string: 'String',
    number: 'Double',
    integer: 'Int',
    boolean: 'Boolean',
    array: 'List<Any>',
    object: 'Any',
    date: 'String',
    datetime: 'String',
    uuid: 'String',
    email: 'String',
    url: 'String',
  },
  namingConventions: {
    modelName: (name) => toPascalCase(name),
    propertyName: (name) => toSafeCamelIdentifier(name, KOTLIN_RESERVED_WORDS),
    methodName: (name) => toSafeCamelIdentifier(name, KOTLIN_RESERVED_WORDS),
    fileName: (name) => toPascalCase(name),
    packageName: (name) => toSnakeCase(name),
  },
};

const KOTLIN_RESERVED_WORDS = new Set([
  'actual',
  'annotation',
  'as',
  'break',
  'by',
  'catch',
  'class',
  'companion',
  'const',
  'constructor',
  'continue',
  'crossinline',
  'data',
  'delegate',
  'do',
  'dynamic',
  'else',
  'enum',
  'expect',
  'external',
  'false',
  'field',
  'file',
  'final',
  'finally',
  'for',
  'fun',
  'get',
  'if',
  'import',
  'in',
  'infix',
  'init',
  'inline',
  'inner',
  'interface',
  'internal',
  'is',
  'lateinit',
  'noinline',
  'null',
  'object',
  'open',
  'operator',
  'out',
  'override',
  'package',
  'param',
  'private',
  'property',
  'protected',
  'public',
  'receiver',
  'reified',
  'return',
  'sealed',
  'set',
  'setparam',
  'super',
  'suspend',
  'tailrec',
  'this',
  'throw',
  'true',
  'try',
  'typealias',
  'val',
  'value',
  'var',
  'vararg',
  'when',
  'where',
  'while',
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

function toSnakeCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();
}

export function getKotlinType(schema: any, config: LanguageConfig): string {
  if (!schema || typeof schema !== 'object') {
    return 'Any';
  }

  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    return config.namingConventions.modelName(refName);
  }

  const composed = pickComposedSchema(schema);
  if (composed) {
    return getKotlinType(composed, config);
  }

  const type = normalizeSchemaType(schema.type) || inferImplicitObjectType(schema);
  
  if (type === 'string') return 'String';
  if (type === 'number') return 'Double';
  if (type === 'integer') return 'Int';
  if (type === 'boolean') return 'Boolean';
  
  if (type === 'array') {
    const itemType = schema.items ? getKotlinType(schema.items, config) : 'Any';
    return `List<${itemType}>`;
  }
  
  if (type === 'object') {
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const valueType = getKotlinType(schema.additionalProperties, config);
      return `Map<String, ${valueType}>`;
    }
    if (schema.additionalProperties === true) {
      return 'Map<String, Any>';
    }
    return 'Map<String, Any>';
  }
  
  return 'Any';
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
