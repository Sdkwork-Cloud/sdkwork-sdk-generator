import type { LanguageConfig } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';

export const PYTHON_CONFIG: LanguageConfig = {
  language: 'python',
  displayName: 'Python',
  description: 'Generate Python SDK with type hints and requests library',
  fileExtension: '.py',
  supportsTests: true,
  supportsStrictTypes: true,
  supportsAsyncAwait: true,
  defaultIndent: '    ',
  lineEnding: '\n',
  typeMapping: {
    string: 'str',
    number: 'float',
    integer: 'int',
    boolean: 'bool',
    array: 'List[Any]',
    object: 'Dict[str, Any]',
    date: 'str',
    datetime: 'str',
    uuid: 'str',
    email: 'str',
    url: 'str',
  },
  namingConventions: {
    modelName: (name) => toPascalCase(name),
    propertyName: (name) => toSnakeCase(name),
    methodName: (name) => toSnakeCase(name),
    fileName: (name) => toSnakeCase(name),
    packageName: (name) => toSnakeCase(name),
  },
};

function toPascalCase(str: string): string {
  return str.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/^(.)/, c => c.toUpperCase());
}

function toSnakeCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[-\s]/g, '_').toLowerCase();
}

export function getPythonType(schema: any, config: LanguageConfig): string {
  if (!schema || typeof schema !== 'object') {
    return 'Any';
  }

  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    return config.namingConventions.modelName(refName);
  }

  const composed = pickComposedSchema(schema);
  if (composed) {
    return getPythonType(composed, config);
  }

  const type = normalizeSchemaType(schema.type) || inferImplicitObjectType(schema);
  const format = schema.format;
  
  if (type === 'string') {
    return 'str';
  }
  
  if (type === 'number') {
    return 'float';
  }
  
  if (type === 'integer') {
    return 'int';
  }
  
  if (type === 'boolean') {
    return 'bool';
  }
  
  if (type === 'array') {
    const itemType = schema.items ? getPythonType(schema.items, config) : 'Any';
    return `List[${itemType}]`;
  }
  
  if (type === 'object') {
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const valueType = getPythonType(schema.additionalProperties, config);
      return `Dict[str, ${valueType}]`;
    }
    if (schema.additionalProperties === true) {
      return 'Dict[str, Any]';
    }
    return 'Dict[str, Any]';
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

export function getPythonPackageRoot(config: GeneratorConfig): string {
  const distributionName = config.packageName || `sdkwork-${config.sdkType}-sdk`;
  const packageRoot = distributionName
    .replace(/[@/.-]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  if (!packageRoot) {
    return 'sdkwork_sdk';
  }

  return /^\d/.test(packageRoot) ? `sdk_${packageRoot}` : packageRoot;
}
