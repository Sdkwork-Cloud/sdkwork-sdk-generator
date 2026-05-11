import { createUniqueIdentifierMap, toSafeCamelIdentifier } from '../../framework/identifiers.js';
import { getArrayItemSchema, getSchemaReferenceName, pickComposedSchema, resolveMediaTypeSchema, resolveSchemaType } from '../../framework/schema.js';
import { normalizeOperationId, resolveScopedMethodNames, stripTagPrefixFromOperationId } from '../../framework/naming.js';
import { TYPESCRIPT_CONFIG } from './config.js';
import { buildTypeScriptTagMetadataMap } from './tag-metadata.js';
const BODY_METHODS = new Set(['post', 'put', 'patch']);
const DEFAULT_PREFERRED_MODULES = ['tenant', 'user', 'app', 'auth', 'workspace'];
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
const TYPESCRIPT_RESERVED_WORDS = new Set([
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'finally',
    'for',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'new',
    'null',
    'return',
    'super',
    'switch',
    'this',
    'throw',
    'true',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'as',
    'implements',
    'interface',
    'let',
    'package',
    'private',
    'protected',
    'public',
    'static',
    'yield',
    'any',
    'boolean',
    'constructor',
    'number',
    'string',
    'symbol',
    'type',
    'unknown',
]);
export class TypeScriptUsagePlanner {
    constructor(ctx, preferredModules = DEFAULT_PREFERRED_MODULES, config) {
        this.ctx = ctx;
        this.config = config;
        this.tagMetadataMap = buildTypeScriptTagMetadataMap(Object.keys(ctx.apiGroups), config);
        this.preferredModules = preferredModules;
    }
    getModuleName(tag) {
        return this.tagMetadataMap.get(tag)?.clientPropertyName
            || TYPESCRIPT_CONFIG.namingConventions.propertyName(tag);
    }
    selectQuickStartPlan() {
        const tag = this.selectQuickStartTag() || Object.keys(this.ctx.apiGroups)[0];
        return tag ? this.selectPlanForTag(tag) : undefined;
    }
    selectPlanForTag(tag) {
        const operations = this.ctx.apiGroups[tag]?.operations || [];
        const operation = this.selectOperation(operations);
        if (!operation) {
            return undefined;
        }
        return this.buildPlan(tag, operation);
    }
    buildPlan(tag, operation) {
        const operations = this.ctx.apiGroups[tag]?.operations || [];
        const metadata = this.tagMetadataMap.get(tag);
        const surface = metadata
            ? resolveTypeScriptOperationSurfaces(tag, operations, metadata, this.config).get(operation)
            : undefined;
        const methodName = surface?.methodName || resolveTypeScriptMethodNames(tag, operations, this.config).get(operation) || 'operation';
        const clientPropertyPath = surface?.clientPropertyPath || [this.getModuleName(tag)];
        const moduleName = clientPropertyPath.join('.');
        const transportMethod = String(operation.method || '').toLowerCase();
        const variables = [];
        const callArguments = [];
        const headerExpectations = [];
        const pathParams = extractPathParams(operation.path);
        const pathParamNames = createUniqueIdentifierMap(pathParams, (value) => toSafeCamelIdentifier(value, TYPESCRIPT_RESERVED_WORDS), ['body', 'params', 'headers']);
        for (let index = 0; index < pathParams.length; index += 1) {
            const variableName = pathParamNames.get(pathParams[index]) || toUsageIdentifier(pathParams[index], 'pathParam', index + 1);
            const sampleValue = /id$/i.test(variableName) ? "'1'" : `'${escapeSingleQuoted(variableName)}'`;
            variables.push({
                name: variableName,
                kind: 'path',
                initializerByMode: {
                    readme: sampleValue,
                    test: sampleValue,
                },
            });
            callArguments.push(variableName);
        }
        const requestBodyInfo = BODY_METHODS.has(transportMethod) ? extractRequestBodyInfo(operation) : undefined;
        if (requestBodyInfo) {
            variables.push({
                name: 'body',
                kind: 'body',
                initializerByMode: {
                    readme: renderBodyLiteral(this.ctx, requestBodyInfo.schema, requestBodyInfo.mediaType),
                    test: renderBodyLiteral(this.ctx, requestBodyInfo.schema, requestBodyInfo.mediaType),
                },
            });
            callArguments.push('body');
        }
        const allParameters = resolveConcreteParameters(operation);
        const queryParams = allParameters.filter((parameter) => parameter?.in === 'query');
        if (queryParams.length > 0) {
            variables.push({
                name: 'params',
                kind: 'params',
                initializerByMode: {
                    readme: renderObjectLiteral(this.ctx, queryParams),
                    test: renderObjectLiteral(this.ctx, queryParams),
                },
            });
            callArguments.push('params');
        }
        const headerParams = allParameters.filter((parameter) => parameter?.in === 'header' || parameter?.in === 'cookie');
        const headerParameterKeys = headerParams.map((parameter, index) => `${parameter?.in || 'parameter'}:${parameter?.name || 'value'}:${index}`);
        const rawHeaderNameByKey = new Map(headerParameterKeys.map((key, index) => [key, String(headerParams[index]?.name || `value${index + 1}`)]));
        const headerParameterNames = createUniqueIdentifierMap(headerParameterKeys, (key) => toSafeCamelIdentifier(rawHeaderNameByKey.get(key) || 'value', TYPESCRIPT_RESERVED_WORDS), [...variables.map((variable) => variable.name), 'body', 'params', 'headers']);
        for (let index = 0; index < headerParams.length; index += 1) {
            const parameter = headerParams[index];
            const key = headerParameterKeys[index];
            const variableName = headerParameterNames.get(key) || toUsageIdentifier(parameter.name, parameter.in === 'cookie' ? 'cookieParam' : 'headerParam', variables.length + 1);
            const sampleValue = sampleValueForParameter(this.ctx, parameter, variables.length);
            variables.push({
                name: variableName,
                kind: 'parameter',
                initializerByMode: {
                    readme: sampleValue,
                    test: sampleValue,
                },
            });
            callArguments.push(variableName);
            headerExpectations.push({
                name: parameter.in === 'cookie' ? 'Cookie' : parameter.name,
                expected: extractLiteralString(sampleValue) || parameter.name || `value${variables.length}`,
                source: variableName,
                cookie: parameter.in === 'cookie',
            });
        }
        return {
            tag,
            moduleName,
            methodName,
            clientPropertyPath,
            operation,
            transportMethod,
            requestBodyMediaType: requestBodyInfo?.mediaType,
            variables,
            callExpression: `client.${clientPropertyPath.join('.')}.${methodName}(${callArguments.join(', ')})`,
            headerExpectations,
        };
    }
    selectQuickStartTag() {
        const candidates = Array.from(this.tagMetadataMap.entries())
            .map(([tag, metadata]) => {
            const operations = this.ctx.apiGroups[tag]?.operations || [];
            const operation = this.selectOperation(operations);
            return {
                tag,
                preferredIndex: this.preferredModules.indexOf(metadata.clientPropertyName),
                score: operation ? this.estimateOperationComplexity(operation) : Number.POSITIVE_INFINITY,
            };
        })
            .filter((candidate) => Number.isFinite(candidate.score));
        if (candidates.length === 0) {
            return undefined;
        }
        candidates.sort((left, right) => {
            const leftPreferred = left.preferredIndex >= 0;
            const rightPreferred = right.preferredIndex >= 0;
            if (leftPreferred !== rightPreferred) {
                return leftPreferred ? -1 : 1;
            }
            if (left.score !== right.score) {
                return left.score - right.score;
            }
            if (leftPreferred && rightPreferred && left.preferredIndex !== right.preferredIndex) {
                return left.preferredIndex - right.preferredIndex;
            }
            return left.tag.localeCompare(right.tag);
        });
        return candidates[0]?.tag;
    }
    selectOperation(operations) {
        if (operations.length === 0) {
            return undefined;
        }
        return operations
            .map((operation, index) => ({
            operation,
            index,
            score: this.estimateOperationComplexity(operation),
        }))
            .sort((left, right) => (left.score - right.score) || (left.index - right.index))[0]?.operation;
    }
    estimateOperationComplexity(operation) {
        const method = String(operation.method || '').toLowerCase();
        const pathParamCount = extractPathParams(operation.path).length;
        const requestBodyInfo = BODY_METHODS.has(method) ? extractRequestBodyInfo(operation) : undefined;
        const hasRequestBody = Boolean(requestBodyInfo);
        const requestBodyRequired = hasRequestBody && Boolean(operation.requestBody?.required);
        const allParameters = resolveConcreteParameters(operation);
        const requiredParamCount = allParameters.filter((parameter) => isQueryOrHeaderParameter(parameter) && parameter?.required).length;
        const optionalParamCount = allParameters.filter((parameter) => isQueryOrHeaderParameter(parameter) && !parameter?.required).length;
        let score = 0;
        if (method && method !== 'get') {
            score += 10;
        }
        score += pathParamCount * 30;
        if (requestBodyRequired) {
            score += 20;
        }
        else if (hasRequestBody) {
            score += 8;
        }
        score += requiredParamCount * 12;
        score += optionalParamCount * 3;
        return score;
    }
}
export function resolveTypeScriptMethodNames(tag, operations, config, resourcePathSegments) {
    if (!Array.isArray(operations) || operations.length === 0) {
        return new Map();
    }
    return resolveScopedMethodNames(operations, (operation) => generateTypeScriptOperationName(operation.method, operation.path, operation, tag, config, resourcePathSegments));
}
export function buildTypeScriptResourceTree(tag, operations, metadata, config) {
    const rootSegment = resolveRootResourceSegment(tag, operations, metadata, config);
    const root = {
        propertyName: metadata.clientPropertyName,
        className: metadata.className,
        resourcePathSegments: [rootSegment],
        operations: [],
        children: [],
    };
    const nodesByPath = new Map([
        [resourcePathKey(root.resourcePathSegments), root],
    ]);
    for (const operation of operations) {
        const resourcePathSegments = resolveOperationResourcePath(tag, operation, config, rootSegment);
        let node = root;
        for (let index = 1; index < resourcePathSegments.length; index += 1) {
            const childPath = resourcePathSegments.slice(0, index + 1);
            const key = resourcePathKey(childPath);
            let child = nodesByPath.get(key);
            if (!child) {
                child = {
                    propertyName: TYPESCRIPT_CONFIG.namingConventions.propertyName(resourcePathSegments[index]),
                    className: buildNestedResourceClassName(metadata.className, childPath.slice(1)),
                    resourcePathSegments: childPath,
                    operations: [],
                    children: [],
                };
                nodesByPath.set(key, child);
                node.children.push(child);
            }
            node = child;
        }
        node.operations.push(operation);
    }
    if (config?.sdkType === 'ai') {
        dedupeResourceTreeOperations(root, tag, config);
    }
    return root;
}
export function resolveTypeScriptOperationSurfaces(tag, operations, metadata, config) {
    if (!Array.isArray(operations) || operations.length === 0) {
        return new Map();
    }
    if (config?.sdkType !== 'ai') {
        const methodNames = resolveTypeScriptMethodNames(tag, operations, config);
        return new Map(operations.map((operation) => [operation, {
                clientPropertyPath: [metadata.clientPropertyName],
                methodName: methodNames.get(operation) || 'operation',
                resourcePathSegments: [metadata.clientPropertyName],
            }]));
    }
    const root = buildTypeScriptResourceTree(tag, operations, metadata, config);
    const surfaces = new Map();
    visitResourceNodes(root, [metadata.clientPropertyName], (node, clientPropertyPath) => {
        const methodNames = resolveTypeScriptMethodNames(tag, node.operations, config, node.resourcePathSegments);
        for (const operation of node.operations) {
            surfaces.set(operation, {
                clientPropertyPath,
                methodName: methodNames.get(operation) || 'operation',
                resourcePathSegments: node.resourcePathSegments,
            });
        }
    });
    return surfaces;
}
export function renderTypeScriptUsageSnippet(plan, mode, options = {}) {
    const setupLines = plan.variables.map((variable) => `const ${variable.name} = ${variable.initializerByMode[mode]};`);
    const assignResult = options.assignResult ?? mode === 'readme';
    const callLine = assignResult
        ? `const result = await ${plan.callExpression};`
        : `await ${plan.callExpression};`;
    return setupLines.length > 0 ? `${setupLines.join('\n')}\n${callLine}` : callLine;
}
export function resolveTypeScriptExpectedRequestPath(path, apiPrefix) {
    const normalizedPathRaw = String(path || '').trim();
    if (!normalizedPathRaw) {
        return '/';
    }
    const normalizedPath = normalizedPathRaw.startsWith('/') ? normalizedPathRaw : `/${normalizedPathRaw}`;
    const prefixRaw = String(apiPrefix || '').trim();
    if (!prefixRaw || prefixRaw === '/') {
        return normalizedPath;
    }
    const normalizedPrefix = `/${prefixRaw.replace(/^\/+|\/+$/g, '')}`;
    if (normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`)) {
        return normalizedPath;
    }
    return `${normalizedPrefix}${normalizedPath}`;
}
function generateTypeScriptOperationName(method, path, operation, tag, config, resourcePathSegments) {
    const resourceActionName = generateResourceActionName(method, path, tag, config, resourcePathSegments);
    if (resourceActionName) {
        return resourceActionName;
    }
    if (operation.operationId) {
        const normalized = normalizeOperationId(operation.operationId);
        return TYPESCRIPT_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
    }
    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
    const actionMap = {
        get: path.includes('{') ? 'get' : 'list',
        post: 'create',
        put: 'update',
        patch: 'patch',
        delete: 'delete',
        options: 'options',
        head: 'head',
        trace: 'trace',
        query: 'query',
    };
    return `${actionMap[method] || method}${TYPESCRIPT_CONFIG.namingConventions.modelName(resource)}`;
}
function generateResourceActionName(method, path, tag, config, resourcePathSegments) {
    if (config?.sdkType !== 'ai') {
        return '';
    }
    const normalizedMethod = String(method || '').toLowerCase();
    const relativeSegments = getRelativePathSegments(path, config?.apiPrefix);
    const resourceIndex = resourcePathSegments?.length
        ? findResourcePathEndIndex(relativeSegments, resourcePathSegments)
        : findResourceSegmentIndex(relativeSegments, stripGenericTagSuffix(toIdentifierParts(tag)));
    if (resourceIndex < 0) {
        return '';
    }
    const suffix = relativeSegments.slice(resourceIndex + 1);
    const suffixSegments = suffix.filter((segment) => !isPathParameterSegment(segment));
    const hasCurrentResourcePathParams = suffix.some(isPathParameterSegment);
    if (suffixSegments.length === 1 && isActionSegment(suffixSegments[0])) {
        return TYPESCRIPT_CONFIG.namingConventions.methodName(normalizeStaticSegment(suffixSegments[0]));
    }
    const overriddenMethodName = resolveOpenAIResourceMethodOverride(resourcePathSegments || [], normalizedMethod, suffixSegments);
    if (overriddenMethodName) {
        return overriddenMethodName;
    }
    if (normalizedMethod === 'get'
        && suffixSegments.length === 1
        && resourcePathSegments?.length
        && isTerminalCollectionAction(resourcePathSegments, suffixSegments[0])) {
        return TYPESCRIPT_CONFIG.namingConventions.methodName(`list${TYPESCRIPT_CONFIG.namingConventions.modelName(normalizeStaticSegment(suffixSegments[0]))}`);
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
        const suffixName = renderNestedSuffixName(suffixSegments, action);
        return TYPESCRIPT_CONFIG.namingConventions.methodName(`${action}${suffixName}`);
    }
    return '';
}
function actionNameForNestedResource(method, suffixSegments, hasPathParams) {
    if (method === 'get') {
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
    return TYPESCRIPT_CONFIG.namingConventions.methodName(method);
}
function renderNestedSuffixName(suffixSegments, action) {
    return suffixSegments.map((segment, index) => {
        const normalizedSegment = normalizeStaticSegment(segment);
        const shouldSingularize = action === 'create' && index === suffixSegments.length - 1;
        const displaySegment = shouldSingularize ? canonicalResourcePart(normalizedSegment) : normalizedSegment;
        return TYPESCRIPT_CONFIG.namingConventions.modelName(displaySegment);
    }).join('');
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
function isTerminalResourceAction(resourceSegments) {
    if (resourceSegments.length <= 1) {
        return false;
    }
    const terminalSegment = resourceSegments[resourceSegments.length - 1];
    if (isActionSegment(terminalSegment)) {
        return true;
    }
    return isTerminalCollectionAction(resourceSegments.slice(0, -1), terminalSegment);
}
function resolveRootResourceSegment(tag, operations, metadata, config) {
    for (const operation of operations) {
        const resourcePath = resolveOperationResourcePath(tag, operation, config, metadata.clientPropertyName);
        if (resourcePath.length > 0) {
            return resourcePath[0];
        }
    }
    return normalizeStaticSegment(metadata.clientPropertyName) || metadata.clientPropertyName;
}
function dedupeResourceTreeOperations(node, tag, config) {
    node.operations = selectCanonicalResourceOperations(node.operations, tag, config, node.resourcePathSegments);
    for (const child of node.children) {
        dedupeResourceTreeOperations(child, tag, config);
    }
}
function selectCanonicalResourceOperations(operations, tag, config, resourcePathSegments) {
    if (operations.length <= 1) {
        return operations;
    }
    const selectedByMethodName = new Map();
    operations.forEach((operation, index) => {
        const methodName = generateTypeScriptOperationName(operation.method, operation.path, operation, tag, config, resourcePathSegments);
        const score = scoreOperationPathForConfiguredPrefix(operation.path, config.apiPrefix);
        const existing = selectedByMethodName.get(methodName);
        if (!existing || score > existing.score || (score === existing.score && index < existing.index)) {
            selectedByMethodName.set(methodName, { operation, score, index });
        }
    });
    return Array.from(selectedByMethodName.values())
        .sort((left, right) => left.index - right.index)
        .map((entry) => entry.operation);
}
function resolveOperationResourcePath(tag, operation, config, fallbackRootSegment) {
    const relativeSegments = getRelativePathSegments(operation.path, config?.apiPrefix);
    const tagParts = stripGenericTagSuffix(toIdentifierParts(tag));
    let resourceIndex = findResourceSegmentIndex(relativeSegments, tagParts);
    if (resourceIndex < 0) {
        resourceIndex = relativeSegments.findIndex((segment) => !isPathParameterSegment(segment));
    }
    if (resourceIndex < 0) {
        return [fallbackRootSegment];
    }
    const resourceSegments = relativeSegments
        .slice(resourceIndex)
        .filter((segment) => !isPathParameterSegment(segment))
        .map(normalizeStaticSegment)
        .filter(Boolean);
    if (isTerminalResourceAction(resourceSegments)) {
        resourceSegments.pop();
    }
    return resourceSegments.length > 0 ? resourceSegments : [fallbackRootSegment];
}
function resourcePathKey(segments) {
    return segments.map(canonicalResourcePart).join('/');
}
function buildNestedResourceClassName(rootClassName, childSegments) {
    const rootBase = rootClassName.replace(/Api$/, '');
    const childName = childSegments
        .map((segment) => TYPESCRIPT_CONFIG.namingConventions.modelName(segment))
        .join('');
    return `${rootBase}${childName}Api`;
}
function visitResourceNodes(node, clientPropertyPath, visitor) {
    visitor(node, clientPropertyPath);
    for (const child of node.children) {
        visitResourceNodes(child, [...clientPropertyPath, child.propertyName], visitor);
    }
}
function getRelativePathSegments(path, apiPrefix) {
    const pathSegments = toRawPathSegments(path);
    const prefixSegments = toRawPathSegments(apiPrefix || '');
    if (prefixSegments.length > 0
        && startsWithSegments(pathSegments.map(normalizeStaticSegment), prefixSegments.map(normalizeStaticSegment))) {
        return pathSegments.slice(prefixSegments.length);
    }
    return pathSegments;
}
function scoreOperationPathForConfiguredPrefix(path, apiPrefix) {
    const pathSegments = toRawPathSegments(path).map(normalizeStaticSegment);
    const primaryPrefix = toRawPathSegments(apiPrefix || '').map(normalizeStaticSegment);
    const prefixes = resolvePrefixCandidates(primaryPrefix);
    for (let index = 0; index < prefixes.length; index += 1) {
        if (startsWithSegments(pathSegments, prefixes[index])) {
            return prefixes.length - index;
        }
    }
    return 0;
}
function resolvePrefixCandidates(primaryPrefix) {
    if (primaryPrefix.length === 0) {
        return [];
    }
    const candidates = [primaryPrefix];
    const versionIndex = primaryPrefix.findIndex((segment) => /^v\d+$/.test(segment));
    if (versionIndex >= 0) {
        const alias = ['v1', ...primaryPrefix.slice(versionIndex + 1)];
        if (!candidates.some((candidate) => sameStringSegments(candidate, alias))) {
            candidates.push(alias);
        }
    }
    return candidates;
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
function canonicalResourcePart(value) {
    const input = String(value || '').toLowerCase();
    if (input.endsWith('ies') && input.length > 3) {
        return `${input.slice(0, -3)}y`;
    }
    if (input.length > 3 && input.endsWith('s') && !input.endsWith('ss')) {
        return input.slice(0, -1);
    }
    return input;
}
function extractPathParams(path) {
    const matches = path.match(/\{([^}]+)\}/g) || [];
    return matches.map((match) => match.replace(/[{}]/g, ''));
}
function extractRequestBodyInfo(operation) {
    const content = operation.requestBody?.content;
    if (!content || typeof content !== 'object') {
        return undefined;
    }
    const mediaType = pickRequestBodyMediaType(content);
    if (!mediaType) {
        return undefined;
    }
    const schema = resolveMediaTypeSchema(content[mediaType]);
    return { mediaType, schema };
}
function pickRequestBodyMediaType(content) {
    const mediaTypes = Object.keys(content);
    if (mediaTypes.length === 0) {
        return undefined;
    }
    const priority = ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded'];
    for (const preferred of priority) {
        const matched = mediaTypes.find((mediaType) => mediaType.toLowerCase() === preferred);
        if (matched) {
            return matched;
        }
    }
    const jsonLike = mediaTypes.find((mediaType) => mediaType.toLowerCase().endsWith('+json'));
    return jsonLike || mediaTypes[0];
}
function resolveConcreteParameters(operation) {
    const rawParameters = Array.isArray(operation.allParameters)
        ? operation.allParameters
        : Array.isArray(operation.parameters)
            ? operation.parameters
            : [];
    return rawParameters.filter(isConcreteApiParameter);
}
function isConcreteApiParameter(parameter) {
    return Boolean(parameter)
        && typeof parameter === 'object'
        && 'name' in parameter
        && 'in' in parameter
        && 'schema' in parameter;
}
function isQueryOrHeaderParameter(parameter) {
    return parameter?.in === 'query' || parameter?.in === 'header' || parameter?.in === 'cookie';
}
function toUsageIdentifier(rawName, fallbackPrefix, index) {
    const cleaned = String(rawName || '').replace(/[^a-zA-Z0-9_$]/g, '_');
    return /^[a-zA-Z_$]/.test(cleaned) ? cleaned : `${fallbackPrefix}${index}`;
}
function renderObjectLiteral(ctx, parameters) {
    const lines = parameters.map((parameter, index) => {
        const key = formatObjectKey(parameter.name || `value${index + 1}`);
        const value = sampleValueForParameter(ctx, parameter, index);
        return `  ${key}: ${value},`;
    });
    return ['{', ...lines, '}'].join('\n');
}
function formatObjectKey(rawName) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(rawName) ? rawName : `'${escapeSingleQuoted(rawName)}'`;
}
function renderBodyLiteral(ctx, schema, mediaType) {
    if (mediaType.toLowerCase() === 'multipart/form-data') {
        return 'new FormData()';
    }
    return renderSampleValue(ctx, schema, 'body', 0);
}
function renderSampleValue(ctx, schema, fallbackName, depth) {
    const resolvedSchema = resolveSchema(ctx, schema);
    const normalizedType = normalizeSampleSchemaType(resolvedSchema);
    const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
    if (enumValues && enumValues.length > 0) {
        return formatLiteral(enumValues[0]);
    }
    if (depth >= 2) {
        if (normalizedType === 'object') {
            return '{}';
        }
        if (normalizedType === 'array') {
            return '[]';
        }
    }
    switch (normalizedType) {
        case 'integer':
        case 'number':
            return '1';
        case 'boolean':
            return 'true';
        case 'array': {
            const itemValue = renderSampleValue(ctx, getArrayItemSchema(resolvedSchema), fallbackName, depth + 1);
            const indent = '  '.repeat(depth);
            const childIndent = '  '.repeat(depth + 1);
            return `[\n${childIndent}${itemValue},\n${indent}]`;
        }
        case 'object': {
            const entries = resolvedSchema?.properties ? Object.entries(resolvedSchema.properties) : [];
            const indent = '  '.repeat(depth);
            const childIndent = '  '.repeat(depth + 1);
            if (entries.length > 0) {
                return `{\n${entries.map(([propertyName, propertySchema]) => (`${childIndent}${formatObjectKey(propertyName)}: ${renderSampleValue(ctx, propertySchema, propertyName, depth + 1)},`)).join('\n')}\n${indent}}`;
            }
            if (resolvedSchema?.additionalProperties && typeof resolvedSchema.additionalProperties === 'object') {
                return `{\n${childIndent}value: ${renderSampleValue(ctx, resolvedSchema.additionalProperties, 'value', depth + 1)},\n${indent}}`;
            }
            return '{}';
        }
        case 'string':
        default:
            return `'${escapeSingleQuoted(fallbackName || 'value')}'`;
    }
}
function sampleValueForParameter(ctx, parameter, index) {
    const resolvedSchema = resolveSchema(ctx, parameter?.schema);
    const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
    if (enumValues && enumValues.length > 0) {
        return formatLiteral(enumValues[0]);
    }
    switch (resolvedSchema?.type) {
        case 'integer':
        case 'number':
            return String(index + 1);
        case 'boolean':
            return index % 2 === 0 ? 'true' : 'false';
        default:
            return `'${escapeSingleQuoted(parameter.name || `value${index + 1}`)}'`;
    }
}
function extractLiteralString(expression) {
    const match = String(expression || '').match(/^'((?:\\'|\\\\|[^'])*)'$/);
    if (!match) {
        return undefined;
    }
    return match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}
function formatLiteral(value) {
    if (typeof value === 'string') {
        return `'${escapeSingleQuoted(value)}'`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return "'value'";
}
function escapeSingleQuoted(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function resolveSchema(ctx, schema) {
    if (!schema || typeof schema !== 'object') {
        return schema;
    }
    if (schema.$ref) {
        const refName = getSchemaReferenceName(schema.$ref);
        return ctx.schemas[refName] || schema;
    }
    const composed = pickComposedSchema(schema);
    return composed ? (resolveSchema(ctx, composed) || composed) : schema;
}
function normalizeSampleSchemaType(schema) {
    return resolveSchemaType(schema).effectiveType;
}
