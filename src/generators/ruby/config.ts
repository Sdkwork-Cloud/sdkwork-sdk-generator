import type { LanguageConfig } from '../../framework/base.js';
import { toSafeSnakeIdentifier } from '../../framework/identifiers.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSdkTypePascal } from '../../framework/sdk-identity.js';
import { getConstSchemaInfo, getTupleSchemaInfo, pickComposedSchema, resolveSchemaType } from '../../framework/schema.js';

export const RUBY_CONFIG: LanguageConfig = {
  language: 'ruby',
  displayName: 'Ruby',
  description: 'Generate Ruby SDK with Faraday transport and gem packaging',
  fileExtension: '.rb',
  supportsTests: true,
  supportsStrictTypes: false,
  supportsAsyncAwait: false,
  defaultIndent: '  ',
  lineEnding: '\n',
  typeMapping: {
    string: 'String',
    number: 'Float',
    integer: 'Integer',
    boolean: 'Boolean',
    array: 'Array',
    object: 'Hash',
    date: 'String',
    datetime: 'String',
    uuid: 'String',
    email: 'String',
    url: 'String',
  },
  namingConventions: {
    modelName: (name) => toPascalCase(name),
    propertyName: (name) => toSafeSnakeIdentifier(name, RUBY_RESERVED_WORDS),
    methodName: (name) => toSafeSnakeIdentifier(name, RUBY_RESERVED_WORDS),
    fileName: (name) => toSnakeCase(name),
    packageName: (name) => toSnakeCase(name),
  },
};

const RUBY_RESERVED_WORDS = new Set([
  'alias',
  'and',
  'begin',
  'break',
  'case',
  'class',
  'def',
  'do',
  'else',
  'elsif',
  'end',
  'ensure',
  'false',
  'for',
  'if',
  'in',
  'module',
  'next',
  'nil',
  'not',
  'or',
  'redo',
  'rescue',
  'retry',
  'return',
  'self',
  'super',
  'then',
  'true',
  'undef',
  'unless',
  'until',
  'when',
  'while',
  'yield',
]);

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

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function getRubyType(schema: any, config: LanguageConfig): string {
  if (!schema || typeof schema !== 'object') {
    return 'Object';
  }

  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    return config.namingConventions.modelName(refName || 'Model');
  }

  const composed = pickComposedSchema(schema);
  if (composed) {
    return getRubyType(composed, config);
  }

  const constInfo = getConstSchemaInfo(schema);
  if (constInfo) {
    return getRubyPrimitiveType(constInfo.type);
  }

  const type = resolveSchemaType(schema).effectiveType;
  if (type === 'string') {
    return 'String';
  }
  if (type === 'number') {
    return 'Float';
  }
  if (type === 'integer') {
    return 'Integer';
  }
  if (type === 'boolean') {
    return 'Boolean';
  }
  if (type === 'array') {
    if (getTupleSchemaInfo(schema)) {
      return 'Array';
    }
    return 'Array';
  }
  if (type === 'object') {
    return 'Hash';
  }
  return 'Object';
}

function getRubyPrimitiveType(type: string): string {
  if (type === 'string') return 'String';
  if (type === 'number') return 'Float';
  if (type === 'integer') return 'Integer';
  if (type === 'boolean') return 'Boolean';
  return 'Object';
}

export function getRubyGemName(config: GeneratorConfig): string {
  const rawName = String(config.packageName || '').trim();
  if (rawName) {
    return rawName;
  }
  return `sdkwork-${config.sdkType}-sdk`;
}

export function getRubyModuleSegments(config: GeneratorConfig): string[] {
  return ['Sdkwork', `${resolveSdkTypePascal(config)}Sdk`];
}

export function getRubyRootRequirePath(config: GeneratorConfig): string {
  return `sdkwork/${toSnakeCase(resolveSdkTypePascal(config))}_sdk`;
}
