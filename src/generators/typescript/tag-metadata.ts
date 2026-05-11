import { TYPESCRIPT_CONFIG } from './config.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveOpenAIStyleResourceName } from '../../framework/openai-surface.js';

export interface TypeScriptApiTagMetadata {
  tag: string;
  fileName: string;
  className: string;
  clientPropertyName: string;
}

const REMOVABLE_TAG_SUFFIXES = new Set([
  'management',
  'controller',
  'module',
  'service',
  'api',
]);

function dedupeName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    return base;
  }

  let index = 2;
  let candidate = `${base}${index}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${base}${index}`;
  }

  return candidate;
}

function simplifyTagFileName(fileName: string): string {
  const segments = fileName.split('-').filter(Boolean);
  while (segments.length > 1 && REMOVABLE_TAG_SUFFIXES.has(segments[segments.length - 1])) {
    segments.pop();
  }

  return segments.join('-') || fileName || 'default';
}

function resolveResourceSurfaceName(simplified: string, config?: GeneratorConfig): string {
  return resolveOpenAIStyleResourceName(simplified, config);
}

function toPascalCase(value: string): string {
  const normalized = value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');

  if (!normalized) {
    return 'Default';
  }

  return /^[A-Za-z_]/.test(normalized) ? normalized : `Api${normalized}`;
}

function toCamelCase(value: string): string {
  const pascal = toPascalCase(value);
  const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
  return /^[A-Za-z_]/.test(camel) ? camel : `api${pascal}`;
}

export function buildTypeScriptTagMetadata(tags: string[], config?: GeneratorConfig): TypeScriptApiTagMetadata[] {
  const usedClassNames = new Set<string>();
  const usedPropertyNames = new Set<string>();

  return tags.map((tag) => {
    const fileName = TYPESCRIPT_CONFIG.namingConventions.fileName(tag);
    const simplified = simplifyTagFileName(fileName);
    const surfaceName = resolveResourceSurfaceName(simplified, config);

    const className = dedupeName(`${toPascalCase(surfaceName)}Api`, usedClassNames);
    usedClassNames.add(className);

    const clientPropertyName = dedupeName(toCamelCase(surfaceName), usedPropertyNames);
    usedPropertyNames.add(clientPropertyName);

    return {
      tag,
      fileName: config?.sdkType === 'ai' ? surfaceName : fileName,
      className,
      clientPropertyName,
    };
  });
}

export function buildTypeScriptTagMetadataMap(tags: string[], config?: GeneratorConfig): Map<string, TypeScriptApiTagMetadata> {
  return new Map(buildTypeScriptTagMetadata(tags, config).map((meta) => [meta.tag, meta]));
}
