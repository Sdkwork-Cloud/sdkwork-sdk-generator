import type { LanguageConfig } from '../../framework/base.js';
import { getConstSchemaInfo, getSchemaReferenceName, getTupleSchemaInfo, isNullSchema, normalizeSchemaTypeValue } from '../../framework/schema.js';

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
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
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

function wrapComplexType(type: string): string {
  return /[|&]/.test(type) ? `(${type})` : type;
}

export function getTypeScriptType(schema: any, config: LanguageConfig, knownModels?: Set<string>): string {
  if (!schema || typeof schema !== 'object') {
    return 'unknown';
  }

  if (schema.oneOf || schema.anyOf) {
    const unionSchemas = schema.oneOf || schema.anyOf || [];
    const nullable = Boolean(schema.nullable) || unionSchemas.some((s: any) => isNullSchema(s));
    const unionType = unionSchemas
      .filter((s: any) => !isNullSchema(s))
      .map((s: any) => getTypeScriptType(s, config, knownModels))
      .filter(Boolean)
      .join(' | ') || 'unknown';
    return nullable ? `${unionType} | null` : unionType;
  }

  if (schema.allOf) {
    const nullable = Boolean(schema.nullable) || normalizeSchemaTypeValue(schema.type).nullable;
    const intersectionTypes = schema.allOf
      .filter((s: any) => !isNullSchema(s))
      .map((s: any) => getTypeScriptType(s, config, knownModels))
      .filter(Boolean);
    const intersectionType = intersectionTypes.join(' & ') || 'unknown';
    return nullable ? `${intersectionType} | null` : intersectionType;
  }

  if (schema.$ref) {
    const refName = getSchemaReferenceName(schema.$ref);
    const modelName = config.namingConventions.modelName(refName);
    if (knownModels && !knownModels.has(modelName)) {
      return 'unknown';
    }
    return schema.nullable ? `${modelName} | null` : modelName;
  }

  if (schema.additionalProperties && !schema.properties) {
    const valueType = schema.additionalProperties === true
      ? 'unknown'
      : getTypeScriptType(schema.additionalProperties, config, knownModels);
    const recordType = `Record<string, ${valueType}>`;
    return schema.nullable ? `${recordType} | null` : recordType;
  }
  
  const normalized = normalizeSchemaType(schema.type);
  const type = normalized.type;
  const nullable = schema.nullable || normalized.nullable;
  const format = schema.format;

  if (format === 'int64' || schema['x-sdkwork-int64-string'] === true) {
    return nullable ? 'string | null' : 'string';
  }

  const constInfo = getConstSchemaInfo(schema);
  if (constInfo) {
    const constType = renderTypeScriptConstType(constInfo.value);
    return nullable && constInfo.value !== null ? `${constType} | null` : constType;
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const enumType = schema.enum
      .map((value: unknown) => {
        if (value === null) return 'null';
        if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        return 'unknown';
      })
      .join(' | ');
    return nullable && !enumType.includes('null') ? `${enumType} | null` : enumType;
  }
  
  if (type === 'string') {
    if (format === 'binary') return nullable ? 'Blob | null' : 'Blob';
    if (format === 'date') return nullable ? 'string | null' : 'string';
    if (format === 'date-time') return nullable ? 'string | null' : 'string';
    if (format === 'uuid') return nullable ? 'string | null' : 'string';
    if (format === 'email') return nullable ? 'string | null' : 'string';
    if (format === 'uri') return nullable ? 'string | null' : 'string';
    return nullable ? 'string | null' : 'string';
  }
  
  if (type === 'number' || type === 'integer') {
    return nullable ? 'number | null' : 'number';
  }
  
  if (type === 'boolean') {
    return nullable ? 'boolean | null' : 'boolean';
  }
  
  if (type === 'array') {
    const tupleInfo = getTupleSchemaInfo(schema);
    if (tupleInfo) {
      const prefixTypes = tupleInfo.prefixItems.map((itemSchema) =>
        getTypeScriptType(itemSchema, config, knownModels)
      );
      let tupleType = `[${prefixTypes.join(', ')}]`;
      if (!tupleInfo.fixedLength) {
        const additionalType = tupleInfo.additionalItems === true
          ? 'unknown'
          : tupleInfo.additionalItems
            ? getTypeScriptType(tupleInfo.additionalItems, config, knownModels)
            : 'never';
        tupleType = `[${[...prefixTypes, `...${wrapComplexType(additionalType)}[]`].join(', ')}]`;
      }
      return nullable ? `${tupleType} | null` : tupleType;
    }
    const itemType = schema.items && typeof schema.items === 'object'
      ? getTypeScriptType(schema.items, config, knownModels)
      : 'unknown';
    const arrayType = `${wrapComplexType(itemType)}[]`;
    return nullable ? `${arrayType} | null` : arrayType;
  }
  
  if (type === 'object' || schema.properties) {
    const objectType = renderInlineObjectType(schema, config, knownModels);
    return nullable ? `${objectType} | null` : objectType;
  }
  
  return 'unknown';
}

function renderInlineObjectType(
  schema: any,
  config: LanguageConfig,
  knownModels?: Set<string>,
): string {
  const properties = Object.entries(schema.properties || {}) as Array<[string, any]>;
  if (properties.length === 0) {
    if (schema.additionalProperties === false) {
      return '{}';
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      return `Record<string, ${getTypeScriptType(schema.additionalProperties, config, knownModels)}>`;
    }
    return 'Record<string, unknown>';
  }

  const required = new Set<string>(schema.required || []);
  const fields = properties.map(([name, propertySchema]) => {
    const propertyKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
      ? name
      : `'${name.replace(/'/g, "\\'")}'`;
    const optional = required.has(name) ? '' : '?';
    return `${propertyKey}${optional}: ${getTypeScriptType(propertySchema, config, knownModels)};`;
  });
  const declaredShape = `{ ${fields.join(' ')} }`;

  if (schema.additionalProperties === true) {
    return `${declaredShape} & Record<string, unknown>`;
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    const valueType = getTypeScriptType(schema.additionalProperties, config, knownModels);
    return `${declaredShape} & Record<string, ${valueType}>`;
  }
  return declaredShape;
}

function normalizeSchemaType(type: unknown): { type: string | undefined; nullable: boolean } {
  const normalized = normalizeSchemaTypeValue(type);
  return { type: normalized.type, nullable: normalized.nullable };
}

function renderTypeScriptConstType(value: string | number | boolean | null): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  return String(value);
}
