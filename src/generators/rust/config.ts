import type { LanguageConfig } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';

export const RUST_CONFIG: LanguageConfig = {
  language: 'rust',
  displayName: 'Rust',
  description: 'Generate Rust SDK with reqwest and serde',
  fileExtension: '.rs',
  supportsTests: true,
  supportsStrictTypes: true,
  supportsAsyncAwait: true,
  defaultIndent: '    ',
  lineEnding: '\n',
  typeMapping: {
    string: 'String',
    number: 'f64',
    integer: 'i64',
    boolean: 'bool',
    array: 'Vec<serde_json::Value>',
    object: 'serde_json::Value',
    date: 'String',
    datetime: 'String',
    uuid: 'String',
    email: 'String',
    url: 'String',
  },
  namingConventions: {
    modelName: (name) => toPascalCase(name),
    propertyName: (name) => toSnakeCase(name),
    methodName: (name) => toSnakeCase(name),
    fileName: (name) => toSnakeCase(name),
    packageName: (name) => toKebabCase(name),
  },
};

export function getRustPackageName(config: GeneratorConfig): string {
  const baseName = config.packageName || `sdkwork-${config.sdkType}-sdk`;
  return sanitizePackageName(baseName);
}

export function getRustCrateName(config: GeneratorConfig): string {
  return getRustPackageName(config).replace(/-/g, '_');
}

export function getRustType(schema: any, config: LanguageConfig): string {
  if (!schema || typeof schema !== 'object') {
    return 'serde_json::Value';
  }

  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    return config.namingConventions.modelName(refName);
  }

  const composed = pickComposedSchema(schema);
  if (composed) {
    return getRustType(composed, config);
  }

  const type = normalizeSchemaType(schema.type) || inferImplicitObjectType(schema);

  if (type === 'string') {
    return 'String';
  }
  if (type === 'number') {
    return 'f64';
  }
  if (type === 'integer') {
    return 'i64';
  }
  if (type === 'boolean') {
    return 'bool';
  }

  if (type === 'array') {
    const itemType = schema.items ? getRustType(schema.items, config) : 'serde_json::Value';
    return `Vec<${itemType}>`;
  }

  if (type === 'object') {
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const valueType = getRustType(schema.additionalProperties, config);
      return `std::collections::HashMap<String, ${valueType}>`;
    }
    if (schema.additionalProperties === true) {
      return 'std::collections::HashMap<String, serde_json::Value>';
    }
    if (schema.properties && typeof schema.properties === 'object') {
      return 'serde_json::Value';
    }
    return 'std::collections::HashMap<String, serde_json::Value>';
  }

  return 'serde_json::Value';
}

function sanitizePackageName(value: string): string {
  const normalized = value
    .replace(/^@/, '')
    .replace(/[\\/]/g, '-')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/_+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return normalized || 'sdkwork-sdk';
}

function toPascalCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
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
