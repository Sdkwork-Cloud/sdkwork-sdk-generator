export function stripTrailingNumericSuffix(name) {
    return name.replace(/_?\d+$/, '').replace(/_+$/, '');
}
const REMOVABLE_TAG_SUFFIXES = new Set([
    'management',
    'controller',
    'module',
    'service',
    'api',
]);
const METHOD_VERB_PARTS = new Set([
    'get',
    'list',
    'create',
    'update',
    'patch',
    'delete',
    'head',
    'options',
    'trace',
]);
function toIdentifierParts(value) {
    return (value || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase()
        .split('_')
        .filter(Boolean);
}
function toLowerCamel(parts) {
    if (parts.length === 0) {
        return '';
    }
    return parts[0] + parts.slice(1).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}
function simplifyTagParts(tag) {
    const parts = toIdentifierParts(tag);
    while (parts.length > 1 && REMOVABLE_TAG_SUFFIXES.has(parts[parts.length - 1])) {
        parts.pop();
    }
    return parts;
}
function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}
export function normalizeTagName(rawTag) {
    const simplifiedParts = simplifyTagParts(rawTag);
    const simplified = toLowerCamel(simplifiedParts);
    if (simplified) {
        return simplified;
    }
    const fallbackParts = toIdentifierParts(rawTag);
    const fallback = toLowerCamel(fallbackParts);
    if (fallback) {
        return fallback;
    }
    return `group${hashString(rawTag || 'default')}`;
}
export function resolveSimplifiedTagNames(tags) {
    const usedNames = new Set();
    const resolved = new Map();
    for (const tag of tags) {
        const base = normalizeTagName(tag);
        const finalName = usedNames.has(base) ? dedupeName(base, usedNames) : base;
        usedNames.add(finalName);
        resolved.set(tag, finalName);
    }
    return resolved;
}
export function stripTagPrefixFromOperationId(operationId, tag) {
    const normalizedOperation = (operationId || '').trim();
    if (!normalizedOperation) {
        return normalizedOperation;
    }
    const operationParts = toIdentifierParts(normalizedOperation);
    if (operationParts.length === 0) {
        return normalizedOperation;
    }
    const tagParts = simplifyTagParts(tag);
    if (tagParts.length === 0 || operationParts.length <= tagParts.length) {
        return normalizedOperation;
    }
    let hasPrefix = true;
    for (let i = 0; i < tagParts.length; i += 1) {
        if (operationParts[i] !== tagParts[i]) {
            hasPrefix = false;
            break;
        }
    }
    if (hasPrefix) {
        const stripped = toLowerCamel(operationParts.slice(tagParts.length));
        return stripped || normalizedOperation;
    }
    const suffixStart = operationParts.length - tagParts.length;
    let hasSuffix = true;
    for (let i = 0; i < tagParts.length; i += 1) {
        if (operationParts[suffixStart + i] !== tagParts[i]) {
            hasSuffix = false;
            break;
        }
    }
    if (!hasSuffix) {
        return normalizedOperation;
    }
    const strippedParts = operationParts.slice(0, suffixStart);
    const firstPart = strippedParts[0] || '';
    // Keep verbs like "getUser" intact, but collapse noisy suffixes like "messageOfficialAccount".
    if (strippedParts.length === 1 && METHOD_VERB_PARTS.has(firstPart)) {
        return normalizedOperation;
    }
    const stripped = toLowerCamel(strippedParts);
    return stripped || normalizedOperation;
}
export function normalizeOperationId(rawOperationId) {
    const trimmed = (rawOperationId || '').trim();
    if (!trimmed) {
        return trimmed;
    }
    const parts = trimmed.split('__').filter(Boolean);
    const actionPart = parts.length > 1 ? parts[parts.length - 1] : trimmed;
    const stripped = stripTrailingNumericSuffix(actionPart);
    const normalized = stripped || actionPart;
    const collapsed = collapseConsecutiveDuplicateParts(normalized);
    return collapsed || normalized;
}
function dedupeName(baseName, usedNames) {
    if (!usedNames.has(baseName)) {
        return baseName;
    }
    let index = 2;
    let candidate = `${baseName}${index}`;
    while (usedNames.has(candidate)) {
        index += 1;
        candidate = `${baseName}${index}`;
    }
    return candidate;
}
function collapseConsecutiveDuplicateParts(name) {
    const parts = toIdentifierParts(name);
    if (parts.length <= 1) {
        return name;
    }
    const canonicalPart = (part) => {
        if (part.length > 1 && part.endsWith('s')) {
            return part.slice(0, -1);
        }
        return part;
    };
    const collapsed = [];
    const seenCanonical = new Set();
    for (const part of parts) {
        const canonical = canonicalPart(part);
        if (seenCanonical.has(canonical)) {
            continue;
        }
        seenCanonical.add(canonical);
        collapsed.push(part);
    }
    return toLowerCamel(collapsed) || name;
}
export function resolveScopedMethodNames(operations, getRawName) {
    const usedNames = new Set();
    const resolvedNames = new Map();
    const baseNames = new Map();
    const groupedByBase = new Map();
    for (const operation of operations) {
        const rawName = (getRawName(operation) || '').trim();
        const normalizedRaw = rawName || 'operation';
        const stripped = stripTrailingNumericSuffix(normalizedRaw);
        const base = stripped || normalizedRaw || 'operation';
        baseNames.set(operation, base);
        if (!groupedByBase.has(base)) {
            groupedByBase.set(base, []);
        }
        groupedByBase.get(base)?.push(operation);
    }
    for (const operation of operations) {
        const base = baseNames.get(operation) || 'operation';
        const sameBaseGroup = groupedByBase.get(base) || [];
        let candidate = base;
        if (sameBaseGroup.length > 1) {
            const method = extractOperationMethod(operation);
            if (method) {
                candidate = withMethodPrefix(base, method);
            }
        }
        if (usedNames.has(candidate)) {
            const path = extractOperationPath(operation);
            if (path) {
                candidate = withPathHint(candidate, path);
            }
        }
        const finalName = usedNames.has(candidate) ? dedupeName(candidate, usedNames) : candidate;
        usedNames.add(finalName);
        resolvedNames.set(operation, finalName);
    }
    return resolvedNames;
}
function extractOperationMethod(operation) {
    const rawMethod = operation?.method;
    return typeof rawMethod === 'string' ? rawMethod.toLowerCase() : '';
}
function extractOperationPath(operation) {
    const rawPath = operation?.path;
    return typeof rawPath === 'string' ? rawPath : '';
}
function detectNameStyle(name) {
    if (name.includes('_')) {
        return 'snake';
    }
    if (name && name.charAt(0) === name.charAt(0).toUpperCase()) {
        return 'pascal';
    }
    return 'camel';
}
function methodVerb(method) {
    switch (method.toLowerCase()) {
        case 'get':
            return 'get';
        case 'post':
            return 'create';
        case 'put':
            return 'update';
        case 'patch':
            return 'patch';
        case 'delete':
            return 'delete';
        case 'head':
            return 'head';
        case 'options':
            return 'options';
        case 'trace':
            return 'trace';
        default:
            return method.toLowerCase();
    }
}
function withMethodPrefix(baseName, method) {
    const style = detectNameStyle(baseName);
    const verb = methodVerb(method);
    if (!verb) {
        return baseName;
    }
    if (style === 'snake') {
        if (baseName === verb || baseName.startsWith(`${verb}_`)) {
            return baseName;
        }
        return `${verb}_${baseName}`;
    }
    const baseLower = baseName.toLowerCase();
    const verbLower = verb.toLowerCase();
    if (baseLower.startsWith(verbLower)) {
        return baseName;
    }
    const prefix = style === 'pascal' ? capitalize(verb) : verbLower;
    const suffix = capitalize(baseName);
    return `${prefix}${suffix}`;
}
function withPathHint(name, path) {
    const style = detectNameStyle(name);
    const nameLower = name.toLowerCase();
    const canonicalToken = (token) => {
        if (token.length > 1 && token.endsWith('s')) {
            return token.slice(0, -1);
        }
        return token;
    };
    const nameCanonicalParts = new Set(toIdentifierParts(name).map((part) => canonicalToken(part)));
    const segments = path
        .split('/')
        .filter(Boolean)
        .filter((segment) => !(segment.startsWith('{') && segment.endsWith('}')))
        .map((segment) => segment.replace(/[{}]/g, ''))
        .filter(Boolean);
    if (segments.length === 0) {
        return name;
    }
    const hintCandidates = [];
    for (let i = segments.length - 1; i >= 0; i -= 1) {
        const hintParts = toIdentifierParts(segments[i]);
        if (hintParts.length === 0) {
            continue;
        }
        const hint = formatByStyle(hintParts, style);
        if (hint) {
            hintCandidates.push(hint);
        }
    }
    for (const hint of hintCandidates) {
        const hintLower = hint.toLowerCase();
        if (nameCanonicalParts.has(canonicalToken(hintLower))) {
            continue;
        }
        const singularHint = hintLower.endsWith('s') ? hintLower.slice(0, -1) : hintLower;
        const pluralHint = hintLower.endsWith('s') ? hintLower : `${hintLower}s`;
        if (style === 'snake') {
            if (name === hint ||
                name.endsWith(`_${hint}`) ||
                nameLower.endsWith(`_${singularHint}`) ||
                nameLower.endsWith(`_${pluralHint}`)) {
                continue;
            }
            return `${name}_${hint}`;
        }
        if (nameLower.endsWith(hintLower) ||
            nameLower.endsWith(singularHint) ||
            nameLower.endsWith(pluralHint)) {
            continue;
        }
        return `${name}${capitalize(hint)}`;
    }
    return style === 'snake' ? `${name}_resource` : `${name}Resource`;
}
function formatByStyle(parts, style) {
    if (parts.length === 0) {
        return '';
    }
    if (style === 'snake') {
        return parts.join('_');
    }
    if (style === 'pascal') {
        return parts.map((part) => capitalize(part)).join('');
    }
    return parts[0] + parts.slice(1).map((part) => capitalize(part)).join('');
}
function capitalize(value) {
    if (!value) {
        return value;
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
}
