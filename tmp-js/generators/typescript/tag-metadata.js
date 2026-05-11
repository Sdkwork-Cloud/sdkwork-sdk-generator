import { TYPESCRIPT_CONFIG } from './config.js';
import { resolveOpenAIStyleResourceName } from '../../framework/openai-surface.js';
const REMOVABLE_TAG_SUFFIXES = new Set([
    'management',
    'controller',
    'module',
    'service',
    'api',
]);
function dedupeName(base, used) {
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
function simplifyTagFileName(fileName) {
    const segments = fileName.split('-').filter(Boolean);
    while (segments.length > 1 && REMOVABLE_TAG_SUFFIXES.has(segments[segments.length - 1])) {
        segments.pop();
    }
    return segments.join('-') || fileName || 'default';
}
function resolveResourceSurfaceName(simplified, config) {
    return resolveOpenAIStyleResourceName(simplified, config);
}
function toPascalCase(value) {
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
function toCamelCase(value) {
    const pascal = toPascalCase(value);
    const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
    return /^[A-Za-z_]/.test(camel) ? camel : `api${pascal}`;
}
export function buildTypeScriptTagMetadata(tags, config) {
    const usedClassNames = new Set();
    const usedPropertyNames = new Set();
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
export function buildTypeScriptTagMetadataMap(tags, config) {
    return new Map(buildTypeScriptTagMetadata(tags, config).map((meta) => [meta.tag, meta]));
}
