import type { LanguageConfig } from '../../framework/base.js';

export const GO_CONFIG: LanguageConfig = {
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

export function getGoType(schema: any, config: LanguageConfig): string {
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

  const type = normalizeSchemaType(schema.type) || inferImplicitObjectType(schema);
  
  if (type === 'string') return 'string';
  if (type === 'number') return 'float64';
  if (type === 'integer') return 'int';
  if (type === 'boolean') return 'bool';
  
  if (type === 'array') {
    const itemType = schema.items ? getGoType(schema.items, config) : 'interface{}';
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
