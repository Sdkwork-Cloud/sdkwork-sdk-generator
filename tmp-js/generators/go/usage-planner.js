import { normalizeOperationId, resolveScopedMethodNames, resolveSimplifiedTagNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { GO_CONFIG, getGoType } from './config.js';
const BODY_METHODS = new Set(['post', 'put', 'patch']);
const DEFAULT_PREFERRED_MODULES = ['tenant', 'user', 'app', 'auth', 'workspace'];
export class GoUsagePlanner {
    constructor(ctx, preferredModules = DEFAULT_PREFERRED_MODULES) {
        this.ctx = ctx;
        this.resolvedTagNames = resolveSimplifiedTagNames(Object.keys(ctx.apiGroups));
        this.preferredModules = preferredModules;
        this.knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => GO_CONFIG.namingConventions.modelName(schemaName)));
    }
    getModuleName(tag) {
        const resolvedTagName = this.resolvedTagNames.get(tag) || tag;
        return GO_CONFIG.namingConventions.propertyName(resolvedTagName);
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
        const methodName = resolveGoMethodNames(tag, operations).get(operation) || 'Operation';
        const moduleName = this.getModuleName(tag);
        const transportMethod = String(operation.method || '').toLowerCase();
        const variables = [];
        const callArguments = [];
        const queryExpectations = [];
        const headerExpectations = [];
        const pathParams = extractPathParams(operation.path);
        for (let index = 0; index < pathParams.length; index += 1) {
            const variableName = toUsageIdentifier(pathParams[index], 'pathParam', index + 1);
            const sampleValue = /id$/i.test(variableName)
                ? formatGoStringLiteral('1')
                : formatGoStringLiteral(variableName);
            variables.push({
                name: variableName,
                kind: 'path',
                setupByMode: {
                    readme: [`${variableName} := ${sampleValue}`],
                    test: [`${variableName} := ${sampleValue}`],
                },
            });
            callArguments.push(variableName);
        }
        const requestBodyInfo = BODY_METHODS.has(transportMethod)
            ? extractRequestBodyInfo(operation)
            : undefined;
        if (requestBodyInfo) {
            const bodyVariable = this.buildBodyVariable(requestBodyInfo.schema, requestBodyInfo.mediaType, Boolean(operation.requestBody?.required));
            variables.push(bodyVariable);
            callArguments.push('body');
        }
        const allParameters = resolveConcreteParameters(operation);
        const queryParams = allParameters.filter((parameter) => parameter?.in === 'query');
        if (queryParams.length > 0) {
            const queryVariable = this.buildQueryVariable(queryParams);
            variables.push(queryVariable.variable);
            queryExpectations.push(...queryVariable.expectations);
            callArguments.push('params');
        }
        const headerParams = allParameters.filter((parameter) => parameter?.in === 'header' || parameter?.in === 'cookie');
        if (headerParams.length > 0) {
            const headerVariable = this.buildHeaderVariable(headerParams);
            variables.push(headerVariable.variable);
            headerExpectations.push(...headerVariable.expectations);
            callArguments.push('headers');
        }
        const requiresTypesImport = variables.some((variable) => variable.requiresTypesImport === true);
        return {
            tag,
            moduleName,
            methodName,
            operation,
            transportMethod,
            requestBodyMediaType: requestBodyInfo?.mediaType,
            variables,
            callExpression: `client.${moduleName}.${methodName}(${callArguments.join(', ')})`,
            queryExpectations,
            headerExpectations,
            bodyAssertion: requestBodyInfo
                ? buildBodyAssertionPlan(requestBodyInfo.mediaType)
                : undefined,
            requiresTypesImport,
        };
    }
    buildBodyVariable(schema, mediaType, required) {
        const rawType = getGoType(schema, GO_CONFIG);
        const rendered = this.renderBodyValue(schema, mediaType, rawType);
        const qualifiedType = this.qualifyGoType(rawType);
        const pointerWrapped = !required && shouldPointerWrap(qualifiedType);
        const primitivePointerWrapped = pointerWrapped && isPrimitiveGoType(qualifiedType);
        const setupLines = primitivePointerWrapped
            ? [
                `bodyValue := ${rendered.expression}`,
                'body := &bodyValue',
            ]
            : pointerWrapped
                ? [`body := &${rendered.expression}`]
                : [`body := ${rendered.expression}`];
        return {
            name: 'body',
            kind: 'body',
            setupByMode: {
                readme: [...setupLines],
                test: [...setupLines],
            },
            requiresTypesImport: rendered.requiresTypesImport,
        };
    }
    buildQueryVariable(parameters) {
        const expectations = [];
        const entries = parameters.map((parameter, index) => {
            const sample = renderScalarSample(this.resolveSchema(parameter.schema), parameter.name || `value${index + 1}`, index);
            expectations.push({
                name: parameter.name,
                expected: sample.stringValue,
            });
            return `    ${formatGoStringLiteral(parameter.name)}: ${sample.goExpression},`;
        });
        const literal = entries.length > 0
            ? `map[string]interface{}{\n${entries.join('\n')}\n}`
            : 'map[string]interface{}{}';
        return {
            variable: {
                name: 'params',
                kind: 'params',
                setupByMode: {
                    readme: [`params := ${literal}`],
                    test: [`params := ${literal}`],
                },
            },
            expectations,
        };
    }
    buildHeaderVariable(parameters) {
        const expectations = [];
        const entries = parameters.map((parameter, index) => {
            const sample = renderHeaderSample(this.resolveSchema(parameter.schema), parameter.name || `header${index + 1}`, index);
            expectations.push({
                name: parameter.name,
                expected: sample.stringValue,
            });
            return `    ${formatGoStringLiteral(parameter.name)}: ${sample.goExpression},`;
        });
        const literal = entries.length > 0
            ? `map[string]string{\n${entries.join('\n')}\n}`
            : 'map[string]string{}';
        return {
            variable: {
                name: 'headers',
                kind: 'headers',
                setupByMode: {
                    readme: [`headers := ${literal}`],
                    test: [`headers := ${literal}`],
                },
            },
            expectations,
        };
    }
    renderBodyValue(schema, mediaType, rawType) {
        const resolvedSchema = this.resolveSchema(schema);
        const normalizedType = normalizeSchemaType(resolvedSchema?.type) || inferImplicitObjectType(resolvedSchema);
        const qualifiedType = this.qualifyGoType(rawType);
        const lowerMediaType = mediaType.toLowerCase();
        if (schema.$ref && normalizedType === 'object') {
            return this.renderStructValue(resolvedSchema, qualifiedType, lowerMediaType);
        }
        if (schema.$ref && normalizedType && normalizedType !== 'object' && normalizedType !== 'array') {
            return this.renderNamedScalarAliasValue(resolvedSchema, qualifiedType, lowerMediaType);
        }
        if (normalizedType === 'array') {
            return this.renderSliceValue(resolvedSchema, qualifiedType, lowerMediaType);
        }
        if (qualifiedType.startsWith('map[') || normalizedType === 'object' || qualifiedType === 'interface{}') {
            return this.renderMapValue(resolvedSchema, qualifiedType === 'interface{}' ? 'map[string]interface{}' : qualifiedType, lowerMediaType);
        }
        if (qualifiedType.startsWith('[]')) {
            return this.renderSliceValue(resolvedSchema, qualifiedType, lowerMediaType);
        }
        if (qualifiedType === 'string') {
            const sample = lowerMediaType.startsWith('multipart/form-data') && resolvedSchema?.format === 'binary'
                ? formatGoStringLiteral('sample.txt')
                : formatGoStringLiteral('value');
            return {
                expression: sample,
                requiresTypesImport: false,
            };
        }
        if (qualifiedType === 'int' || qualifiedType === 'float64') {
            return { expression: '1', requiresTypesImport: false };
        }
        if (qualifiedType === 'bool') {
            return { expression: 'true', requiresTypesImport: false };
        }
        return {
            expression: `${qualifiedType}{}`,
            requiresTypesImport: qualifiedType.includes('sdktypes.'),
        };
    }
    renderNamedScalarAliasValue(schema, typeName, mediaType) {
        const sample = this.renderSampleValue(schema, 'value', 0, mediaType);
        return {
            expression: `${typeName}(${sample.expression})`,
            requiresTypesImport: typeName.includes('sdktypes.') || sample.requiresTypesImport,
        };
    }
    renderMapValue(schema, mapType, mediaType) {
        const entries = [];
        let requiresTypesImport = false;
        const properties = schema?.properties ? Object.entries(schema.properties) : [];
        if (properties.length > 0) {
            for (let index = 0; index < properties.length; index += 1) {
                const [propertyName, propertySchema] = properties[index];
                const sample = this.renderSampleValue(propertySchema, propertyName, index, mediaType);
                requiresTypesImport = requiresTypesImport || sample.requiresTypesImport;
                entries.push(`    ${formatGoStringLiteral(propertyName)}: ${sample.expression},`);
            }
        }
        else if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
            const sample = this.renderSampleValue(schema.additionalProperties, 'value', 0, mediaType);
            requiresTypesImport = requiresTypesImport || sample.requiresTypesImport;
            entries.push(`    ${formatGoStringLiteral('value')}: ${sample.expression},`);
        }
        else if (mediaType.startsWith('multipart/form-data') || mediaType.startsWith('application/x-www-form-urlencoded')) {
            entries.push(`    ${formatGoStringLiteral('value')}: ${formatGoStringLiteral('value')},`);
        }
        return {
            expression: entries.length > 0
                ? `${mapType}{\n${entries.join('\n')}\n}`
                : `${mapType}{}`,
            requiresTypesImport,
        };
    }
    renderStructValue(schema, structType, mediaType) {
        const entries = [];
        let requiresTypesImport = structType.includes('sdktypes.');
        const properties = schema?.properties ? Object.entries(schema.properties) : [];
        for (let index = 0; index < properties.length; index += 1) {
            const [propertyName, propertySchema] = properties[index];
            const sample = this.renderSampleValue(propertySchema, propertyName, index, mediaType);
            requiresTypesImport = requiresTypesImport || sample.requiresTypesImport;
            entries.push(`    ${GO_CONFIG.namingConventions.propertyName(propertyName)}: ${sample.expression},`);
        }
        return {
            expression: entries.length > 0
                ? `${structType}{\n${entries.join('\n')}\n}`
                : `${structType}{}`,
            requiresTypesImport,
        };
    }
    renderSliceValue(schema, sliceType, mediaType) {
        const itemSchema = schema?.items;
        if (!itemSchema) {
            return {
                expression: `${sliceType}{}`,
                requiresTypesImport: sliceType.includes('sdktypes.'),
            };
        }
        const sample = this.renderSampleValue(itemSchema, 'item', 0, mediaType);
        const itemExpression = indentMultilineGoExpression(sample.expression, 1);
        return {
            expression: `${sliceType}{\n${itemExpression},\n}`,
            requiresTypesImport: sliceType.includes('sdktypes.') || sample.requiresTypesImport,
        };
    }
    renderSampleValue(schema, fallbackName, index, mediaType) {
        const resolvedSchema = this.resolveSchema(schema);
        const normalizedType = normalizeSchemaType(resolvedSchema?.type) || inferImplicitObjectType(resolvedSchema);
        const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
        if (enumValues && enumValues.length > 0) {
            return formatEnumLiteral(enumValues[0]);
        }
        if (schema?.$ref && normalizedType === 'object') {
            const qualifiedType = this.qualifyGoType(getGoType(schema, GO_CONFIG));
            return this.renderStructValue(resolvedSchema, qualifiedType, mediaType);
        }
        switch (normalizedType) {
            case 'integer':
            case 'number':
                return { expression: String(index + 1), requiresTypesImport: false };
            case 'boolean':
                return { expression: index % 2 === 0 ? 'true' : 'false', requiresTypesImport: false };
            case 'array': {
                const qualifiedType = this.qualifyGoType(getGoType(resolvedSchema || {}, GO_CONFIG));
                return this.renderSliceValue(resolvedSchema, qualifiedType, mediaType);
            }
            case 'object': {
                const qualifiedType = this.qualifyGoType(getGoType(resolvedSchema || {}, GO_CONFIG));
                return this.renderMapValue(resolvedSchema, qualifiedType === 'interface{}' ? 'map[string]interface{}' : qualifiedType, mediaType);
            }
            case 'string':
            default:
                if (resolvedSchema?.format === 'binary' && mediaType.startsWith('multipart/form-data')) {
                    return { expression: '[]byte("sample")', requiresTypesImport: false };
                }
                return {
                    expression: formatGoStringLiteral(fallbackName || `value${index + 1}`),
                    requiresTypesImport: false,
                };
        }
    }
    resolveSchema(schema) {
        if (!schema || typeof schema !== 'object') {
            return schema;
        }
        if (schema.$ref) {
            const refName = schema.$ref.split('/').pop() || '';
            return this.ctx.schemas[refName] || schema;
        }
        const composed = pickComposedSchema(schema);
        if (composed) {
            return this.resolveSchema(composed) || composed;
        }
        return schema;
    }
    qualifyGoType(typeName) {
        let result = typeName;
        const sortedModels = Array.from(this.knownModels).sort((left, right) => right.length - left.length);
        for (const modelName of sortedModels) {
            const escaped = modelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`(?<![\\w.])${escaped}(?![\\w])`, 'g');
            result = result.replace(pattern, `sdktypes.${modelName}`);
        }
        return result;
    }
    selectQuickStartTag() {
        const candidates = Object.keys(this.ctx.apiGroups)
            .map((tag) => {
            const operation = this.selectOperation(this.ctx.apiGroups[tag]?.operations || []);
            return {
                tag,
                preferredIndex: this.preferredModules.indexOf(this.getModuleName(tag).toLowerCase()),
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
export function resolveGoMethodNames(tag, operations) {
    if (!Array.isArray(operations) || operations.length === 0) {
        return new Map();
    }
    return resolveScopedMethodNames(operations, (operation) => generateGoOperationName(operation.method, operation.path, operation, tag));
}
export function renderGoUsageSnippet(plan, mode, options = {}) {
    const resultBinding = options.resultBinding ?? 'result';
    const setupLines = plan.variables.flatMap((variable) => variable.setupByMode[mode]);
    const callLine = `${resultBinding}, err := ${plan.callExpression}`;
    return setupLines.length > 0 ? `${setupLines.join('\n')}\n${callLine}` : callLine;
}
export function resolveGoExpectedRequestPath(path, apiPrefix) {
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
function generateGoOperationName(method, path, operation, tag) {
    if (operation.operationId) {
        const normalized = normalizeOperationId(operation.operationId);
        return GO_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
    }
    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
    const actionMap = {
        get: path.includes('{') ? 'Get' : 'List',
        post: 'Create',
        put: 'Update',
        patch: 'Patch',
        delete: 'Delete',
    };
    return `${actionMap[method] || GO_CONFIG.namingConventions.modelName(method)}${GO_CONFIG.namingConventions.modelName(resource)}`;
}
function buildBodyAssertionPlan(mediaType) {
    const normalized = String(mediaType || '').toLowerCase();
    if (normalized === 'application/json' || normalized.endsWith('+json')) {
        return {
            kind: 'json',
            contentType: 'application/json',
            contentTypeMatch: 'exact',
        };
    }
    if (normalized.startsWith('multipart/form-data')) {
        return {
            kind: 'non-empty',
            contentType: 'multipart/form-data',
            contentTypeMatch: 'prefix',
        };
    }
    return {
        kind: 'non-empty',
        contentType: mediaType,
        contentTypeMatch: 'exact',
    };
}
function renderScalarSample(schema, fallbackName, index) {
    const enumValues = Array.isArray(schema?.enum) ? schema.enum : undefined;
    if (enumValues && enumValues.length > 0) {
        const literal = String(enumValues[0]);
        return {
            goExpression: typeof enumValues[0] === 'number' || typeof enumValues[0] === 'boolean'
                ? literal
                : formatGoStringLiteral(literal),
            stringValue: literal,
        };
    }
    switch (normalizeSchemaType(schema?.type)) {
        case 'integer':
        case 'number': {
            const value = String(index + 1);
            return { goExpression: value, stringValue: value };
        }
        case 'boolean': {
            const value = index % 2 === 0 ? 'true' : 'false';
            return { goExpression: value, stringValue: value };
        }
        default: {
            const value = fallbackName || `value${index + 1}`;
            return { goExpression: formatGoStringLiteral(value), stringValue: value };
        }
    }
}
function renderHeaderSample(schema, fallbackName, index) {
    const enumValues = Array.isArray(schema?.enum) ? schema.enum : undefined;
    if (enumValues && enumValues.length > 0) {
        const value = String(enumValues[0]);
        return {
            goExpression: formatGoStringLiteral(value),
            stringValue: value,
        };
    }
    switch (normalizeSchemaType(schema?.type)) {
        case 'integer':
        case 'number': {
            const value = String(index + 1);
            return {
                goExpression: formatGoStringLiteral(value),
                stringValue: value,
            };
        }
        case 'boolean': {
            const value = index % 2 === 0 ? 'true' : 'false';
            return {
                goExpression: formatGoStringLiteral(value),
                stringValue: value,
            };
        }
    }
    const value = fallbackName || `header${index + 1}`;
    return {
        goExpression: formatGoStringLiteral(value),
        stringValue: value,
    };
}
function formatEnumLiteral(value) {
    if (typeof value === 'number') {
        return {
            expression: String(value),
            requiresTypesImport: false,
        };
    }
    return {
        expression: formatGoStringLiteral(String(value)),
        requiresTypesImport: false,
    };
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
    const schema = mediaType ? content[mediaType]?.schema : undefined;
    if (!mediaType || !schema) {
        return undefined;
    }
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
    const pascal = GO_CONFIG.namingConventions.modelName(rawName || '');
    if (!pascal) {
        return `${fallbackPrefix}${index}`;
    }
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
function formatGoStringLiteral(value) {
    return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
function shouldPointerWrap(typeName) {
    return !(typeName.startsWith('*')
        || typeName.startsWith('[]')
        || typeName.startsWith('map[')
        || typeName === 'interface{}');
}
function isPrimitiveGoType(typeName) {
    return typeName === 'string'
        || typeName === 'int'
        || typeName === 'float64'
        || typeName === 'bool';
}
function indentMultilineGoExpression(expression, level) {
    const prefix = '    '.repeat(Math.max(0, level));
    return String(expression || '')
        .split('\n')
        .map((line) => (line ? `${prefix}${line}` : line))
        .join('\n');
}
function normalizeSchemaType(type) {
    if (typeof type === 'string') {
        return type;
    }
    if (Array.isArray(type)) {
        const candidate = type.find((entry) => typeof entry === 'string' && entry !== 'null');
        return typeof candidate === 'string' ? candidate : undefined;
    }
    return undefined;
}
function inferImplicitObjectType(schema) {
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
function pickComposedSchema(schema) {
    const orderedKeys = ['allOf', 'oneOf', 'anyOf'];
    for (const key of orderedKeys) {
        const values = schema?.[key];
        if (!Array.isArray(values) || values.length === 0) {
            continue;
        }
        const candidate = values.find((entry) => entry && normalizeSchemaType(entry.type) !== 'null');
        return candidate || values[0];
    }
    return undefined;
}
