import type { LanguageConfig } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { toSafeCamelIdentifier } from '../../framework/identifiers.js';
import { getConstSchemaInfo, getSchemaReferenceName, getTupleSchemaInfo, pickComposedSchema, resolveSchemaType } from '../../framework/schema.js';

export const FLUTTER_RESERVED_WORDS = new Set([
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

export const FLUTTER_CONFIG: LanguageConfig = {
  language: 'flutter',
  displayName: 'Flutter/Dart',
  description: 'Generate Flutter/Dart SDK for iOS, Android, Web',
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
    propertyName: (name) => toSafeCamelIdentifier(name, FLUTTER_RESERVED_WORDS),
    methodName: (name) => toSafeCamelIdentifier(name, FLUTTER_RESERVED_WORDS),
    fileName: (name) => toSnakeCase(name),
    packageName: (name) => toSnakeCase(name),
  },
};

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

export function getFlutterType(schema: any, config: LanguageConfig): string {
  if (!schema || typeof schema !== 'object') {
    return 'dynamic';
  }

  if (schema.$ref) {
    const refName = getSchemaReferenceName(schema.$ref);
    return config.namingConventions.modelName(refName);
  }

  const composed = pickComposedSchema(schema);
  if (composed) {
    return getFlutterType(composed, config);
  }

  const constInfo = getConstSchemaInfo(schema);
  if (constInfo) {
    return getFlutterPrimitiveType(constInfo.type);
  }

  const type = resolveSchemaType(schema).effectiveType;
  
  if (type === 'string') return 'String';
  if (type === 'number') return 'double';
  if (type === 'integer') return 'int';
  if (type === 'boolean') return 'bool';
  
  if (type === 'array') {
    if (getTupleSchemaInfo(schema)) {
      return 'List<dynamic>';
    }
    const itemType = schema.items && typeof schema.items === 'object' ? getFlutterType(schema.items, config) : 'dynamic';
    return `List<${itemType}>`;
  }
  
  if (type === 'object') {
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const valueType = getFlutterType(schema.additionalProperties, config);
      return `Map<String, ${valueType}>`;
    }
    if (schema.additionalProperties === true) {
      return 'Map<String, dynamic>';
    }
    return 'Map<String, dynamic>';
  }
  
  return 'dynamic';
}

function getFlutterPrimitiveType(type: string): string {
  if (type === 'string') return 'String';
  if (type === 'number') return 'double';
  if (type === 'integer') return 'int';
  if (type === 'boolean') return 'bool';
  return 'dynamic';
}

export function getFlutterPackageName(config: GeneratorConfig): string {
  const raw = String(config.packageName || '').trim();
  if (raw) {
    return toSnakeCase(raw);
  }
  return `${FLUTTER_CONFIG.namingConventions.packageName(config.sdkType)}_sdk`;
}
