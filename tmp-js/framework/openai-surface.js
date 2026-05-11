import { resolveScopedMethodNames, resolveSimplifiedTagNames } from './naming.js';
const OPENAI_STYLE_RESOURCE_NAMES = {
    assistant: 'assistants',
    batch: 'batches',
    embedding: 'embeddings',
    file: 'files',
    'fine-tuning': 'fine-tuning',
    image: 'images',
    model: 'models',
    moderation: 'moderations',
    response: 'responses',
    thread: 'threads',
    upload: 'uploads',
    'vector-store': 'vector-stores',
};
const OPENAI_RESOURCE_ACTION_SEGMENTS = new Set([
    'cancel',
    'compact',
    'complete',
    'content',
    'pause',
    'resume',
    'search',
    'submit_tool_outputs',
]);
const OPENAI_TERMINAL_COLLECTION_ACTIONS = [
    {
        parentResourcePath: ['fine_tuning', 'jobs'],
        segment: 'events',
    },
    {
        parentResourcePath: ['vector_stores', 'file_batches'],
        segment: 'files',
    },
];
const OPENAI_RESOURCE_METHOD_OVERRIDES = [
    {
        resourcePath: ['fine_tuning', 'checkpoints', 'permissions'],
        method: 'get',
        methodName: 'retrieve',
    },
];
const OPENAI_FLAT_PRIMARY_RESOURCE_SUFFIXES = [
    {
        rootResourcePath: ['chat'],
        segment: 'completions',
    },
];
export function resolveOpenAIStyleResourceName(rawName, config) {
    if (config?.sdkType !== 'ai') {
        return rawName;
    }
    const normalized = toKebabIdentifier(rawName);
    return OPENAI_STYLE_RESOURCE_NAMES[normalized] || rawName;
}
export function resolveSdkTagNames(tags, config) {
    const simplified = resolveSimplifiedTagNames(tags);
    if (config?.sdkType !== 'ai') {
        return simplified;
    }
    const used = new Set();
    const resolved = new Map();
    for (const tag of tags) {
        const base = resolveOpenAIStyleResourceName(simplified.get(tag) || tag, config);
        const finalName = dedupeName(base, used);
        used.add(finalName);
        resolved.set(tag, finalName);
    }
    return resolved;
}
export function resolveOpenAIStyleMethodNames(tag, operations, config, languageConfig, style, resourcePathSegments) {
    if (config?.sdkType !== 'ai') {
        return undefined;
    }
    if (!Array.isArray(operations) || operations.length === 0) {
        return new Map();
    }
    return resolveScopedMethodNames(operations, (operation) => {
        const name = generateOpenAIStyleOperationName(operation.method, operation.path, tag, config, resourcePathSegments, style);
        return formatMethodName(name, style, languageConfig);
    });
}
export function selectCanonicalOpenAIStyleOperations(tag, operations, config, resourcePathSegments) {
    if (config?.sdkType !== 'ai' || operations.length <= 1) {
        return operations;
    }
    const selectedByName = new Map();
    operations.forEach((operation, index) => {
        const methodName = generateOpenAIStyleOperationName(operation.method, operation.path, tag, config, resourcePathSegments, 'snake');
        const score = scoreOpenAIStyleOperationPath(operation.path, config.apiPrefix);
        const existing = selectedByName.get(methodName);
        if (!existing || score > existing.score || (score === existing.score && index < existing.index)) {
            selectedByName.set(methodName, { operation, score, index });
        }
    });
    return Array.from(selectedByName.values())
        .sort((left, right) => left.index - right.index)
        .map((entry) => entry.operation);
}
export function generateOpenAIStyleOperationName(method, path, tag, config, resourcePathSegments, style) {
    const normalizedMethod = String(method || '').toLowerCase();
    const relativeSegments = getRelativePathSegments(path, config?.apiPrefix);
    let resourceIndex = resourcePathSegments?.length
        ? findResourcePathEndIndex(relativeSegments, resourcePathSegments)
        : findResourceSegmentIndex(relativeSegments, stripGenericTagSuffix(toIdentifierParts(tag)));
    if (resourceIndex < 0) {
        return fallbackOperationName(normalizedMethod, relativeSegments, style);
    }
    if (!resourcePathSegments?.length) {
        resourceIndex = resolveFlatPrimaryResourceEndIndex(relativeSegments, tag, resourceIndex);
    }
    const suffix = relativeSegments.slice(resourceIndex + 1);
    const suffixSegments = suffix.filter((segment) => !isPathParameterSegment(segment)).map(normalizeStaticSegment);
    const hasCurrentResourcePathParams = suffix.some(isPathParameterSegment);
    if (suffixSegments.length === 1 && isActionSegment(suffixSegments[0])) {
        return suffixSegments[0];
    }
    const overriddenMethodName = resolveOpenAIResourceMethodOverride(resourcePathSegments || [], normalizedMethod, suffixSegments);
    if (overriddenMethodName) {
        return overriddenMethodName;
    }
    if (normalizedMethod === 'get'
        && suffixSegments.length === 1
        && resourcePathSegments?.length
        && isTerminalCollectionAction(resourcePathSegments, suffixSegments[0])) {
        return `list_${canonicalActionSuffix(suffixSegments[0])}`;
    }
    if (normalizedMethod === 'get' && suffixSegments.length === 0) {
        return hasCurrentResourcePathParams ? 'retrieve' : 'list';
    }
    if (normalizedMethod === 'post' && suffixSegments.length === 0) {
        return hasCurrentResourcePathParams ? 'update' : 'create';
    }
    if ((normalizedMethod === 'put' || normalizedMethod === 'patch') && suffixSegments.length === 0) {
        return 'update';
    }
    if (normalizedMethod === 'delete' && suffixSegments.length === 0) {
        return 'delete';
    }
    if (suffixSegments.length > 0) {
        const action = actionNameForNestedResource(normalizedMethod, suffixSegments, hasCurrentResourcePathParams);
        return [action, ...suffixSegments.map((segment, index) => {
                const shouldSingularize = action === 'create' && index === suffixSegments.length - 1;
                return shouldSingularize ? canonicalResourcePart(segment) : segment;
            })].filter(Boolean).join('_');
    }
    return fallbackOperationName(normalizedMethod, relativeSegments, style);
}
export function getOpenAIRelativePathSegments(path, apiPrefix) {
    return getRelativePathSegments(path, apiPrefix).map(normalizeStaticSegment).filter(Boolean);
}
export function canonicalOpenAIResourcePart(value) {
    return canonicalResourcePart(value);
}
function fallbackOperationName(method, relativeSegments, style) {
    const resource = relativeSegments
        .filter((segment) => !isPathParameterSegment(segment))
        .map(normalizeStaticSegment)
        .filter(Boolean)
        .pop() || 'resource';
    const actionMap = {
        get: relativeSegments.some(isPathParameterSegment) ? 'retrieve' : 'list',
        post: 'create',
        put: 'update',
        patch: 'update',
        delete: 'delete',
        options: 'options',
        head: 'head',
        trace: 'trace',
        query: 'query',
    };
    const action = actionMap[method] || method || 'operation';
    return `${action}_${style === 'snake' ? resource : canonicalResourcePart(resource)}`;
}
function scoreOpenAIStyleOperationPath(path, apiPrefix) {
    const rawSegments = toRawPathSegments(path);
    const normalizedSegments = rawSegments.map(normalizeStaticSegment);
    const primaryPrefix = toRawPathSegments(apiPrefix || '').map(normalizeStaticSegment);
    const prefixes = resolvePrefixCandidates(primaryPrefix);
    let score = 0;
    for (let index = 0; index < prefixes.length; index += 1) {
        if (startsWithSegments(normalizedSegments, prefixes[index])) {
            score = Math.max(score, (prefixes.length - index) * 100);
            break;
        }
    }
    if (normalizedSegments.includes('management') || normalizedSegments.includes('manage') || normalizedSegments.includes('admin')) {
        score -= 20;
    }
    score -= rawSegments.filter((segment) => !isPathParameterSegment(segment)).length;
    return score;
}
function resolvePrefixCandidates(primaryPrefix) {
    if (primaryPrefix.length === 0) {
        return [];
    }
    const candidates = [primaryPrefix];
    const alias = resolveAliasPrefix(primaryPrefix);
    if (alias.length > 0 && !candidates.some((candidate) => sameStringSegments(candidate, alias))) {
        candidates.push(alias);
    }
    return candidates;
}
function formatMethodName(name, style, languageConfig) {
    const parts = toIdentifierParts(name);
    const raw = style === 'snake'
        ? parts.join('_')
        : style === 'pascal'
            ? parts.map(capitalize).join('')
            : parts[0] + parts.slice(1).map(capitalize).join('');
    return languageConfig.namingConventions.methodName(raw || 'operation');
}
function actionNameForNestedResource(method, suffixSegments, hasPathParams) {
    if (method === 'get') {
        if (hasPathParams && suffixSegments.length > 0) {
            return 'list';
        }
        return hasPathParams ? 'retrieve' : 'list';
    }
    if (method === 'post') {
        if (suffixSegments.length === 1 && isActionSegment(suffixSegments[0])) {
            return '';
        }
        return 'create';
    }
    if (method === 'put' || method === 'patch') {
        return 'update';
    }
    if (method === 'delete') {
        return 'delete';
    }
    return method;
}
function isActionSegment(segment) {
    return OPENAI_RESOURCE_ACTION_SEGMENTS.has(normalizeStaticSegment(segment));
}
function resolveOpenAIResourceMethodOverride(resourcePathSegments, method, suffixSegments) {
    if (suffixSegments.length > 0 || resourcePathSegments.length === 0) {
        return '';
    }
    const override = OPENAI_RESOURCE_METHOD_OVERRIDES.find((rule) => (rule.method === method && resourcePathMatches(rule.resourcePath, resourcePathSegments)));
    return override?.methodName || '';
}
function isTerminalCollectionAction(resourcePathSegments, segment) {
    const normalizedSegment = normalizeStaticSegment(segment);
    return OPENAI_TERMINAL_COLLECTION_ACTIONS.some((rule) => (canonicalResourcePart(rule.segment) === canonicalResourcePart(normalizedSegment)
        && resourcePathMatches(rule.parentResourcePath, resourcePathSegments)));
}
function canonicalActionSuffix(segment) {
    return toIdentifierParts(segment).map((part, index) => index === 0 ? part : part).join('_');
}
function resourcePathMatches(rulePath, resourcePathSegments) {
    if (rulePath.length !== resourcePathSegments.length) {
        return false;
    }
    for (let index = 0; index < rulePath.length; index += 1) {
        if (canonicalResourcePart(rulePath[index]) !== canonicalResourcePart(resourcePathSegments[index])) {
            return false;
        }
    }
    return true;
}
function getRelativePathSegments(path, apiPrefix) {
    const pathSegments = toRawPathSegments(path);
    const prefixSegments = toRawPathSegments(apiPrefix || '');
    if (prefixSegments.length > 0
        && startsWithSegments(pathSegments.map(normalizeStaticSegment), prefixSegments.map(normalizeStaticSegment))) {
        return pathSegments.slice(prefixSegments.length);
    }
    const normalizedPathSegments = pathSegments.map(normalizeStaticSegment);
    const aliasPrefix = resolveAliasPrefix(prefixSegments.map(normalizeStaticSegment));
    if (aliasPrefix.length > 0 && startsWithSegments(normalizedPathSegments, aliasPrefix)) {
        return pathSegments.slice(aliasPrefix.length);
    }
    return pathSegments;
}
function resolveAliasPrefix(primaryPrefix) {
    const versionIndex = primaryPrefix.findIndex((segment) => /^v\d+$/.test(segment));
    return versionIndex >= 0 ? ['v1', ...primaryPrefix.slice(versionIndex + 1)] : [];
}
function findResourceSegmentIndex(pathSegments, tagParts) {
    if (pathSegments.length === 0 || tagParts.length === 0) {
        return -1;
    }
    const normalizedPathSegments = pathSegments.map(normalizeStaticSegment);
    for (let length = Math.min(tagParts.length, normalizedPathSegments.length); length > 0; length -= 1) {
        for (let index = 0; index <= normalizedPathSegments.length - length; index += 1) {
            const window = normalizedPathSegments.slice(index, index + length);
            if (sameCanonicalParts(window, tagParts.slice(tagParts.length - length))) {
                return index + length - 1;
            }
        }
    }
    return -1;
}
function findResourcePathEndIndex(pathSegments, resourcePathSegments) {
    if (pathSegments.length === 0 || resourcePathSegments.length === 0) {
        return -1;
    }
    let resourceIndex = 0;
    for (let pathIndex = 0; pathIndex < pathSegments.length; pathIndex += 1) {
        const segment = pathSegments[pathIndex];
        if (isPathParameterSegment(segment)) {
            continue;
        }
        if (canonicalResourcePart(normalizeStaticSegment(segment)) !== canonicalResourcePart(resourcePathSegments[resourceIndex])) {
            continue;
        }
        resourceIndex += 1;
        if (resourceIndex === resourcePathSegments.length) {
            return pathIndex;
        }
    }
    return -1;
}
function resolveFlatPrimaryResourceEndIndex(pathSegments, tag, resourceIndex) {
    const rootResourcePath = stripGenericTagSuffix(toIdentifierParts(tag));
    const extension = OPENAI_FLAT_PRIMARY_RESOURCE_SUFFIXES.find((rule) => resourcePathMatches(rule.rootResourcePath, rootResourcePath));
    if (!extension) {
        return resourceIndex;
    }
    for (let index = resourceIndex + 1; index < pathSegments.length; index += 1) {
        const segment = pathSegments[index];
        if (isPathParameterSegment(segment)) {
            return resourceIndex;
        }
        if (canonicalResourcePart(normalizeStaticSegment(segment)) === canonicalResourcePart(extension.segment)) {
            return index;
        }
        return resourceIndex;
    }
    return resourceIndex;
}
function sameCanonicalParts(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (canonicalResourcePart(left[index]) !== canonicalResourcePart(right[index])) {
            return false;
        }
    }
    return true;
}
function startsWithSegments(pathSegments, prefixSegments) {
    if (pathSegments.length < prefixSegments.length) {
        return false;
    }
    for (let index = 0; index < prefixSegments.length; index += 1) {
        if (pathSegments[index] !== prefixSegments[index]) {
            return false;
        }
    }
    return true;
}
function sameStringSegments(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }
    return true;
}
function stripGenericTagSuffix(parts) {
    const removable = new Set(['management', 'controller', 'module', 'service', 'api']);
    const next = [...parts];
    while (next.length > 1 && removable.has(next[next.length - 1])) {
        next.pop();
    }
    return next;
}
function toRawPathSegments(value) {
    return String(value || '')
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);
}
function normalizeStaticSegment(segment) {
    if (isPathParameterSegment(segment)) {
        return segment;
    }
    return toIdentifierParts(segment).join('_');
}
function isPathParameterSegment(segment) {
    return segment.startsWith('{') && segment.endsWith('}');
}
function toIdentifierParts(value) {
    return String(value || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase()
        .split('_')
        .filter(Boolean);
}
function toKebabIdentifier(value) {
    return toIdentifierParts(value).join('-');
}
function canonicalResourcePart(value) {
    const input = String(value || '').toLowerCase();
    if (input.endsWith('sses') && input.length > 4) {
        return input.slice(0, -2);
    }
    if (input.length > 4 &&
        (input.endsWith('ches') ||
            input.endsWith('shes') ||
            input.endsWith('xes') ||
            input.endsWith('zes'))) {
        return input.slice(0, -2);
    }
    if (input.endsWith('ies') && input.length > 3) {
        return `${input.slice(0, -3)}y`;
    }
    if (input.length > 3 && input.endsWith('s') && !input.endsWith('ss')) {
        return input.slice(0, -1);
    }
    return input;
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
function capitalize(value) {
    if (!value) {
        return value;
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
}
