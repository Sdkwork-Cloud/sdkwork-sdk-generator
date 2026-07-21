import type { LanguageConfig } from '../../framework/base.js';
import { resolveDefaultDistributionName } from '../../framework/package-identity.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { getConstSchemaInfo, getSchemaReferenceName, getTupleSchemaInfo, pickComposedSchema, resolveSchemaType } from '../../framework/schema.js';

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
  const baseName = config.packageName || resolveDefaultDistributionName(config);
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
    const refName = getSchemaReferenceName(schema.$ref);
    return config.namingConventions.modelName(refName);
  }

  const composed = pickComposedSchema(schema);
  if (composed) {
    return getRustType(composed, config);
  }

  const constInfo = getConstSchemaInfo(schema);
  if (constInfo) {
    return getRustPrimitiveType(constInfo.type);
  }

  const type = resolveSchemaType(schema).effectiveType;

  if (type === 'string') {
    if (schema.format === 'binary') {
      return 'Vec<u8>';
    }
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
    if (getTupleSchemaInfo(schema)) {
      return 'Vec<serde_json::Value>';
    }
    const itemType = schema.items && typeof schema.items === 'object' ? getRustType(schema.items, config) : 'serde_json::Value';
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

function getRustPrimitiveType(type: string): string {
  if (type === 'string') return 'String';
  if (type === 'number') return 'f64';
  if (type === 'integer') return 'i64';
  if (type === 'boolean') return 'bool';
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
