import type { LanguageConfig } from '../../framework/base.js';

export const SWIFT_CONFIG: LanguageConfig = {
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
    propertyName: (name) => toCamelCase(name),
    methodName: (name) => toCamelCase(name),
    fileName: (name) => toPascalCase(name),
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

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toSnakeCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();
}

export function getSwiftType(schema: any, config: LanguageConfig): string {
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
  
  if (type === 'string') return 'String';
  if (type === 'number') return 'Double';
  if (type === 'integer') return 'Int';
  if (type === 'boolean') return 'Bool';
  
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
