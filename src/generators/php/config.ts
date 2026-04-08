import type { LanguageConfig } from '../../framework/base.js';
import { toSafeCamelIdentifier } from '../../framework/identifiers.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSdkTypePascal } from '../../framework/sdk-identity.js';

export const PHP_CONFIG: LanguageConfig = {
  language: 'php',
  displayName: 'PHP',
  description: 'Generate PHP SDK with PSR-4 autoloading and Guzzle transport',
  fileExtension: '.php',
  supportsTests: true,
  supportsStrictTypes: true,
  supportsAsyncAwait: false,
  defaultIndent: '    ',
  lineEnding: '\n',
  typeMapping: {
    string: 'string',
    number: 'float',
    integer: 'int',
    boolean: 'bool',
    array: 'array',
    object: 'array',
    date: 'string',
    datetime: 'string',
    uuid: 'string',
    email: 'string',
    url: 'string',
  },
  namingConventions: {
    modelName: (name) => toPascalCase(name),
    propertyName: (name) => toSafeCamelIdentifier(name, PHP_RESERVED_WORDS),
    methodName: (name) => toSafeCamelIdentifier(name, PHP_RESERVED_WORDS),
    fileName: (name) => toPascalCase(name),
    packageName: (name) => toKebabCase(name),
  },
};

const PHP_RESERVED_WORDS = new Set([
  'abstract',
  'and',
  'array',
  'as',
  'break',
  'callable',
  'case',
  'catch',
  'class',
  'clone',
  'const',
  'continue',
  'declare',
  'default',
  'die',
  'do',
  'echo',
  'else',
  'elseif',
  'empty',
  'enddeclare',
  'endfor',
  'endforeach',
  'endif',
  'endswitch',
  'endwhile',
  'eval',
  'exit',
  'extends',
  'false',
  'final',
  'finally',
  'fn',
  'for',
  'foreach',
  'function',
  'global',
  'goto',
  'if',
  'implements',
  'include',
  'include_once',
  'instanceof',
  'insteadof',
  'interface',
  'isset',
  'list',
  'match',
  'namespace',
  'new',
  'null',
  'object',
  'or',
  'parent',
  'print',
  'private',
  'protected',
  'public',
  'readonly',
  'require',
  'require_once',
  'return',
  'self',
  'static',
  'switch',
  'throw',
  'trait',
  'true',
  'try',
  'unset',
  'use',
  'var',
  'while',
  'xor',
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

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
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
  for (const key of ['allOf', 'oneOf', 'anyOf'] as const) {
    const values = schema?.[key];
    if (!Array.isArray(values) || values.length === 0) {
      continue;
    }
    const candidate = values.find((entry) => entry && typeof entry === 'object' && normalizeSchemaType(entry.type) !== 'null');
    return candidate || values[0];
  }
  return undefined;
}

export function getPhpType(schema: any, config: LanguageConfig): string {
  if (!schema || typeof schema !== 'object') {
    return 'mixed';
  }

  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    return config.namingConventions.modelName(refName || 'Model');
  }

  const composed = pickComposedSchema(schema);
  if (composed) {
    return getPhpType(composed, config);
  }

  const type = normalizeSchemaType(schema.type) || inferImplicitObjectType(schema);
  if (type === 'string') {
    return 'string';
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
    return 'array';
  }
  if (type === 'object') {
    return 'array';
  }
  return 'mixed';
}

export function getPhpNamespace(config: GeneratorConfig): string {
  const explicit = String(config.namespace || '').trim();
  if (explicit) {
    return explicit.replace(/\//g, '\\');
  }
  return `SDKWork\\${resolveSdkTypePascal(config)}`;
}

export function getPhpPackageName(config: GeneratorConfig): string {
  const rawName = String(config.packageName || '').trim();
  if (rawName) {
    return rawName;
  }
  return `sdkwork/${config.sdkType}-sdk`;
}
