import type { LanguageConfig } from '../../framework/base.js';

export const TYPESCRIPT_CONFIG: LanguageConfig = {
  language: 'typescript',
  displayName: 'TypeScript',
  description: 'Generate TypeScript SDK with full type support',
  fileExtension: '.ts',
  supportsTests: true,
  supportsStrictTypes: true,
  supportsAsyncAwait: true,
  defaultIndent: '  ',
  lineEnding: '\n',
  typeMapping: {
    string: 'string',
    number: 'number',
    integer: 'number',
    boolean: 'boolean',
    array: 'T[]',
    object: 'Record<string, unknown>',
    date: 'string',
    datetime: 'string',
    uuid: 'string',
    email: 'string',
    url: 'string',
  },
  namingConventions: {
    modelName: (name) => toPascalCase(name),
    propertyName: (name) => toCamelCase(name),
    methodName: (name) => toCamelCase(name),
    fileName: (name) => toKebabCase(name),
    packageName: (name) => toKebabCase(name),
  },
};

function toPascalCase(str: string): string {
  return str.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/^(.)/, c => c.toUpperCase());
}

function toCamelCase(str: string): string {
  return str.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/^(.)/, c => c.toLowerCase());
}

function toKebabCase(str: string): string {
  const normalized = str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  if (normalized) {
    return normalized;
  }

  const fallback = Buffer.from(str || 'unnamed').toString('hex').slice(0, 12);
  return `group-${fallback}`;
}

export function getTypeScriptType(schema: any, config: LanguageConfig, knownModels?: Set<string>): string {
  if (!schema || typeof schema !== 'object') {
    return 'unknown';
  }

  if (schema.oneOf || schema.anyOf) {
    const unionSchemas = schema.oneOf || schema.anyOf || [];
    const unionType = unionSchemas
      .map((s: any) => getTypeScriptType(s, config, knownModels))
      .filter(Boolean)
      .join(' | ') || 'unknown';
    return schema.nullable ? `${unionType} | null` : unionType;
  }

  if (schema.allOf) {
    const intersectionType = schema.allOf
      .map((s: any) => getTypeScriptType(s, config, knownModels))
      .filter(Boolean)
      .join(' & ') || 'unknown';
    return schema.nullable ? `${intersectionType} | null` : intersectionType;
  }

  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    const modelName = config.namingConventions.modelName(refName);
    if (knownModels && !knownModels.has(modelName)) {
      return 'unknown';
    }
    return schema.nullable ? `${modelName} | null` : modelName;
  }
  
  const type = schema.type;
  const format = schema.format;

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const enumType = schema.enum
      .map((value: unknown) => {
        if (value === null) return 'null';
        if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        return 'unknown';
      })
      .join(' | ');
    return schema.nullable && !enumType.includes('null') ? `${enumType} | null` : enumType;
  }
  
  if (type === 'string') {
    if (format === 'date') return 'string';
    if (format === 'date-time') return 'string';
    if (format === 'uuid') return 'string';
    if (format === 'email') return 'string';
    if (format === 'uri') return 'string';
    return 'string';
  }
  
  if (type === 'number' || type === 'integer') {
    return 'number';
  }
  
  if (type === 'boolean') {
    return 'boolean';
  }
  
  if (type === 'array') {
    const itemType = schema.items ? getTypeScriptType(schema.items, config, knownModels) : 'unknown';
    const arrayType = `${itemType}[]`;
    return schema.nullable ? `${arrayType} | null` : arrayType;
  }
  
  if (type === 'object') {
    if (schema.additionalProperties) {
      const valueType = getTypeScriptType(schema.additionalProperties, config, knownModels);
      const recordType = `Record<string, ${valueType}>`;
      return schema.nullable ? `${recordType} | null` : recordType;
    }
    const objectType = 'Record<string, unknown>';
    return schema.nullable ? `${objectType} | null` : objectType;
  }
  
  return 'unknown';
}
