import { createUniqueIdentifierMap, toSafeCamelIdentifier } from '../../framework/identifiers.js';
import { normalizeOperationId, resolveScopedMethodNames, resolveSimplifiedTagNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { DART_CONFIG, DART_RESERVED_WORDS, getDartType } from './config.js';
const BODY_METHODS = new Set(['post', 'put', 'patch']);
const DEFAULT_PREFERRED_MODULES = ['tenant', 'user', 'app', 'auth', 'workspace'];
const DART_JSON_CONTENT_TYPE = 'application/json';
export class DartUsagePlanner {
    constructor(ctx, preferredModules = DEFAULT_PREFERRED_MODULES) {
        this.ctx = ctx;
        this.resolvedTagNames = resolveSimplifiedTagNames(Object.keys(ctx.apiGroups));
        this.preferredModules = preferredModules;
        this.knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => DART_CONFIG.namingConventions.modelName(schemaName)));
    }
    getModuleName(tag) {
        const resolvedTagName = this.resolvedTagNames.get(tag) || tag;
        return DART_CONFIG.namingConventions.propertyName(resolvedTagName);
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
        const methodName = resolveDartMethodNames(tag, operations).get(operation) || 'operation';
        const moduleName = this.getModuleName(tag);
        const transportMethod = String(operation.method || '').toLowerCase();
        const variables = [];
        const callArguments = [];
        const queryExpectations = [];
        const headerExpectations = [];
        const rawPathParams = extractPathParams(operation.path);
        const pathParamNames = createUniqueIdentifierMap(rawPathParams, (value) => toSafeCamelIdentifier(value, DART_RESERVED_WORDS), ['body', 'params', 'headers']);
        for (let index = 0; index < rawPathParams.length; index += 1) {
            const rawName = rawPathParams[index];
            const variableName = pathParamNames.get(rawName) || toUsageIdentifier(rawName, 'pathParam', index + 1);
            const sampleValue = /id$/i.test(variableName) ? quoteDartString('1') : quoteDartString(variableName);
            variables.push({
                name: variableName,
                kind: 'path',
                setupByMode: {
                    readme: [`final ${variableName} = ${sampleValue};`],
                    test: [`final ${variableName} = ${sampleValue};`],
                },
            });
            callArguments.push(variableName);
        }
        const requestBodyInfo = BODY_METHODS.has(transportMethod)
            ? extractRequestBodyInfo(operation)
            : undefined;
        if (requestBodyInfo) {
            const bodyVariable = this.buildBodyVariable(requestBodyInfo.schema, requestBodyInfo.mediaType);
            variables.push(bodyVariable.variable);
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
        const responseSchema = extractResponseSchema(operation);
        const responseType = responseSchema
            ? getDartType(responseSchema, DART_CONFIG)
            : inferFallbackResponseType(operation);
        const responseStatusCode = resolveSuccessStatusCode(operation, responseType);
        const responseBody = responseType === 'void'
            ? undefined
            : JSON.stringify(buildJsonSampleValue(this.ctx, responseSchema, 'result', 0));
        const responseAssertions = buildResponseAssertions(this.ctx, responseSchema, responseType);
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
                ? buildBodyAssertionPlan(requestBodyInfo.mediaType, this.buildExpectedJsonExpression(requestBodyInfo.schema))
                : undefined,
            responseType,
            hasReturnValue: responseType !== 'void',
            responseStatusCode,
            responseBody,
            responseAssertions: responseAssertions.length > 0
                ? responseAssertions
                : (responseType !== 'void' ? ['expect(result, isNotNull);'] : []),
        };
    }
    buildBodyVariable(schema, mediaType) {
        const declaredType = getDartType(schema, DART_CONFIG);
        const resolvedSchema = resolveSchema(this.ctx, schema);
        const normalizedMediaType = String(mediaType || '').toLowerCase();
        if (this.isKnownModelType(declaredType)) {
            return {
                variable: {
                    name: 'body',
                    kind: 'body',
                    setupByMode: {
                        readme: this.renderModelVariable('body', declaredType, resolvedSchema),
                        test: this.renderModelVariable('body', declaredType, resolvedSchema),
                    },
                },
                assertion: buildBodyAssertionPlan(normalizedMediaType, 'body.toJson()'),
            };
        }
        const normalizedType = normalizeSchemaType(resolvedSchema?.type) || inferImplicitObjectType(resolvedSchema);
        if (normalizedType === 'object' || declaredType.startsWith('Map<') || declaredType === 'dynamic') {
            const lines = renderMapVariable('body', this.ctx, resolvedSchema, normalizedMediaType);
            return {
                variable: {
                    name: 'body',
                    kind: 'body',
                    setupByMode: { readme: lines, test: lines },
                },
                assertion: buildBodyAssertionPlan(normalizedMediaType, 'body'),
            };
        }
        if (normalizedType === 'array' || declaredType.startsWith('List<')) {
            const itemValue = renderInlineDartValue(this.ctx, resolvedSchema?.items, 'item', 0, normalizedMediaType, 1);
            const lines = itemValue
                ? [`final body = [${itemValue.dartExpression}];`]
                : ['final body = <dynamic>[];'];
            return {
                variable: {
                    name: 'body',
                    kind: 'body',
                    setupByMode: { readme: lines, test: lines },
                },
                assertion: buildBodyAssertionPlan(normalizedMediaType, 'body'),
            };
        }
        const scalarValue = renderInlineDartValue(this.ctx, resolvedSchema, 'value', 0, normalizedMediaType, 0)
            || buildScalarDartValue('value', resolvedSchema, 0, mediaType);
        return {
            variable: {
                name: 'body',
                kind: 'body',
                setupByMode: {
                    readme: [`final body = ${scalarValue.dartExpression};`],
                    test: [`final body = ${scalarValue.dartExpression};`],
                },
            },
            assertion: buildBodyAssertionPlan(normalizedMediaType, 'body'),
        };
    }
    buildQueryVariable(parameters) {
        const expectations = [];
        const lines = ['final params = <String, dynamic>{'];
        for (let index = 0; index < parameters.length; index += 1) {
            const parameter = parameters[index];
            const sample = buildParameterValue(this.ctx, parameter, index);
            expectations.push({ name: parameter.name, expected: sample.stringValue });
            lines.push(`  ${quoteDartString(parameter.name)}: ${sample.dartExpression},`);
        }
        lines.push('};');
        return {
            variable: {
                name: 'params',
                kind: 'params',
                setupByMode: { readme: lines, test: lines },
            },
            expectations,
        };
    }
    buildHeaderVariable(parameters) {
        const expectations = [];
        const lines = ['final headers = <String, String>{'];
        for (let index = 0; index < parameters.length; index += 1) {
            const parameter = parameters[index];
            const sample = buildHeaderValue(this.ctx, parameter, index);
            expectations.push({ name: parameter.name, expected: sample.stringValue });
            lines.push(`  ${quoteDartString(parameter.name)}: ${sample.dartExpression},`);
        }
        lines.push('};');
        return {
            variable: {
                name: 'headers',
                kind: 'headers',
                setupByMode: { readme: lines, test: lines },
            },
            expectations,
        };
    }
    renderModelVariable(variableName, typeName, schema) {
        const properties = schema?.properties ? Object.entries(schema.properties) : [];
        if (properties.length === 0) {
            return [`final ${variableName} = ${typeName}();`];
        }
        const lines = [`final ${variableName} = ${typeName}(`];
        for (let index = 0; index < properties.length; index += 1) {
            const [propertyName, propertySchema] = properties[index];
            const rendered = renderInlineDartValue(this.ctx, propertySchema, propertyName, index, DART_JSON_CONTENT_TYPE, 1) || buildScalarDartValue(propertyName, propertySchema, index, DART_JSON_CONTENT_TYPE);
            lines.push(`  ${DART_CONFIG.namingConventions.propertyName(propertyName)}: ${rendered.dartExpression},`);
        }
        lines.push(');');
        return lines;
    }
    buildExpectedJsonExpression(schema) {
        const declaredType = getDartType(schema, DART_CONFIG);
        return this.isKnownModelType(declaredType) ? 'body.toJson()' : 'body';
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
        const responseSchema = extractResponseSchema(operation);
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
        if (responseSchema) {
            score -= 1;
        }
        return score;
    }
    isKnownModelType(typeName) {
        return this.knownModels.has(typeName);
    }
}
export function resolveDartMethodNames(tag, operations) {
    if (!Array.isArray(operations) || operations.length === 0) {
        return new Map();
    }
    return resolveScopedMethodNames(operations, (operation) => generateDartOperationName(operation.method, operation.path, operation, tag));
}
export function renderDartUsageSnippet(plan, mode, options = {}) {
    const setupLines = plan.variables.flatMap((variable) => variable.setupByMode[mode]);
    const assignResult = options.assignResult ?? plan.hasReturnValue;
    const resultVariableName = options.resultVariableName || 'result';
    const callLine = assignResult && plan.hasReturnValue
        ? `final ${resultVariableName} = await ${plan.callExpression};`
        : `await ${plan.callExpression};`;
    return setupLines.length > 0 ? `${setupLines.join('\n')}\n${callLine}` : callLine;
}
export function resolveDartExpectedRequestPath(path, apiPrefix) {
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
function generateDartOperationName(method, path, operation, tag) {
    if (operation.operationId) {
        const normalized = normalizeOperationId(operation.operationId);
        return DART_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
    }
    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
    const actionMap = {
        get: path.includes('{') ? 'get' : 'list',
        post: 'create',
        put: 'update',
        patch: 'patch',
        delete: 'delete',
    };
    return `${actionMap[method] || method}${DART_CONFIG.namingConventions.modelName(resource)}`;
}
function buildBodyAssertionPlan(mediaType, expectedJsonExpression) {
    const normalized = String(mediaType || '').toLowerCase();
    if (normalized === DART_JSON_CONTENT_TYPE || normalized.endsWith('+json')) {
        return {
            kind: 'json',
            contentType: DART_JSON_CONTENT_TYPE,
            contentTypeMatch: 'prefix',
            expectedJsonExpression,
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
function renderMapVariable(variableName, ctx, schema, mediaType) {
    const entries = renderMapEntries(ctx, schema, mediaType);
    const lines = [`final ${variableName} = <String, dynamic>{`];
    for (const entry of entries) {
        lines.push(`  ${quoteDartString(entry.name)}: ${entry.value.dartExpression},`);
    }
    lines.push('};');
    return lines;
}
function renderMapEntries(ctx, schema, mediaType) {
    const entries = [];
    const properties = schema?.properties ? Object.entries(schema.properties) : [];
    if (properties.length > 0) {
        for (let index = 0; index < properties.length; index += 1) {
            const [propertyName, propertySchema] = properties[index];
            entries.push({
                name: propertyName,
                value: renderInlineDartValue(ctx, propertySchema, propertyName, index, mediaType, 1)
                    || buildScalarDartValue(propertyName, propertySchema, index, mediaType),
            });
        }
        return entries;
    }
    if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
        entries.push({
            name: 'value',
            value: renderInlineDartValue(ctx, schema.additionalProperties, 'value', 0, mediaType, 1)
                || buildScalarDartValue('value', schema.additionalProperties, 0, mediaType),
        });
        return entries;
    }
    if (mediaType.startsWith('multipart/form-data') || mediaType.startsWith('application/x-www-form-urlencoded')) {
        entries.push({
            name: 'value',
            value: buildScalarDartValue('value', { type: 'string' }, 0, mediaType),
        });
    }
    return entries;
}
function renderInlineDartValue(ctx, schema, fallbackName, index, mediaType, depth) {
    const resolvedSchema = resolveSchema(ctx, schema);
    const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
    if (enumValues && enumValues.length > 0) {
        return buildLiteralValue(enumValues[0]);
    }
    if (!resolvedSchema || depth > 2) {
        return undefined;
    }
    if (schema?.$ref) {
        const modelType = getDartType(schema, DART_CONFIG);
        return {
            dartExpression: `${modelType}()`,
            jsonValue: {},
            stringValue: '[object]',
        };
    }
    const normalizedType = normalizeSchemaType(resolvedSchema.type) || inferImplicitObjectType(resolvedSchema);
    switch (normalizedType) {
        case 'integer': {
            const value = index + 1;
            return { dartExpression: String(value), jsonValue: value, stringValue: String(value) };
        }
        case 'number': {
            const value = index + 1;
            return { dartExpression: `${value}.0`, jsonValue: value, stringValue: String(value) };
        }
        case 'boolean': {
            const value = index % 2 === 0;
            return { dartExpression: value ? 'true' : 'false', jsonValue: value, stringValue: value ? 'true' : 'false' };
        }
        case 'array': {
            const itemValue = renderInlineDartValue(ctx, resolvedSchema.items, fallbackName, index, mediaType, depth + 1)
                || buildScalarDartValue(fallbackName, resolvedSchema.items, index, mediaType);
            return {
                dartExpression: `[${itemValue.dartExpression}]`,
                jsonValue: [itemValue.jsonValue],
                stringValue: String(itemValue.stringValue),
            };
        }
        case 'object': {
            const entries = renderMapEntries(ctx, resolvedSchema, mediaType);
            const jsonValue = Object.fromEntries(entries.map((entry) => [entry.name, entry.value.jsonValue]));
            const mapLiteral = entries.length > 0
                ? `{ ${entries.map((entry) => `${quoteDartString(entry.name)}: ${entry.value.dartExpression}`).join(', ')} }`
                : '<String, dynamic>{}';
            return {
                dartExpression: mapLiteral,
                jsonValue,
                stringValue: JSON.stringify(jsonValue),
            };
        }
        case 'string':
        default:
            return buildScalarDartValue(fallbackName, resolvedSchema, index, mediaType);
    }
}
function buildScalarDartValue(fallbackName, schema, index, mediaType) {
    const sampleString = sampleStringValue(fallbackName, index, schema, mediaType);
    return {
        dartExpression: quoteDartString(sampleString),
        jsonValue: sampleString,
        stringValue: sampleString,
    };
}
function buildParameterValue(ctx, parameter, index) {
    const resolvedSchema = resolveSchema(ctx, parameter?.schema);
    const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
    if (enumValues && enumValues.length > 0) {
        return buildLiteralValue(enumValues[0]);
    }
    switch (normalizeSchemaType(resolvedSchema?.type)) {
        case 'integer': {
            const value = index + 1;
            return { dartExpression: String(value), jsonValue: value, stringValue: String(value) };
        }
        case 'number': {
            const value = index + 1;
            return { dartExpression: `${value}.0`, jsonValue: value, stringValue: String(value) };
        }
        case 'boolean': {
            const value = index % 2 === 0;
            return { dartExpression: value ? 'true' : 'false', jsonValue: value, stringValue: value ? 'true' : 'false' };
        }
        default:
            return buildScalarDartValue(parameter.name || `value${index + 1}`, resolvedSchema, index);
    }
}
function buildHeaderValue(ctx, parameter, index) {
    const resolvedSchema = resolveSchema(ctx, parameter?.schema);
    const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
    if (enumValues && enumValues.length > 0) {
        const value = String(enumValues[0]);
        return {
            dartExpression: quoteDartString(value),
            jsonValue: value,
            stringValue: value,
        };
    }
    switch (normalizeSchemaType(resolvedSchema?.type)) {
        case 'integer':
        case 'number': {
            const value = String(index + 1);
            return { dartExpression: quoteDartString(value), jsonValue: value, stringValue: value };
        }
        case 'boolean': {
            const value = index % 2 === 0 ? 'true' : 'false';
            return { dartExpression: quoteDartString(value), jsonValue: value, stringValue: value };
        }
    }
    return buildScalarDartValue(parameter.name || `header${index + 1}`, resolvedSchema, index);
}
function buildLiteralValue(value) {
    if (typeof value === 'number') {
        return { dartExpression: String(value), jsonValue: value, stringValue: String(value) };
    }
    if (typeof value === 'boolean') {
        return {
            dartExpression: value ? 'true' : 'false',
            jsonValue: value,
            stringValue: value ? 'true' : 'false',
        };
    }
    const stringValue = String(value ?? 'value');
    return {
        dartExpression: quoteDartString(stringValue),
        jsonValue: stringValue,
        stringValue,
    };
}
function buildJsonSampleValue(ctx, schema, fallbackName, depth) {
    const resolvedSchema = resolveSchema(ctx, schema);
    if (!resolvedSchema || depth > 2) {
        return sampleStringValue(fallbackName, 0, resolvedSchema);
    }
    const enumValues = Array.isArray(resolvedSchema.enum) ? resolvedSchema.enum : undefined;
    if (enumValues && enumValues.length > 0) {
        return enumValues[0];
    }
    const normalizedType = normalizeSchemaType(resolvedSchema.type) || inferImplicitObjectType(resolvedSchema);
    switch (normalizedType) {
        case 'integer':
            return depth + 1;
        case 'number':
            return depth + 1;
        case 'boolean':
            return true;
        case 'array':
            return [buildJsonSampleValue(ctx, resolvedSchema.items, fallbackName, depth + 1)];
        case 'object': {
            const properties = resolvedSchema.properties ? Object.entries(resolvedSchema.properties) : [];
            if (properties.length > 0) {
                return Object.fromEntries(properties.map(([propertyName, propertySchema], index) => [
                    propertyName,
                    buildJsonSampleValue(ctx, propertySchema, propertyName, depth + index + 1),
                ]));
            }
            if (resolvedSchema.additionalProperties && typeof resolvedSchema.additionalProperties === 'object') {
                return {
                    value: buildJsonSampleValue(ctx, resolvedSchema.additionalProperties, 'value', depth + 1),
                };
            }
            return {};
        }
        case 'string':
        default:
            return sampleStringValue(fallbackName, depth, resolvedSchema);
    }
}
function buildResponseAssertions(ctx, schema, responseType) {
    if (!schema || responseType === 'void' || responseType.startsWith('Map<') || responseType.startsWith('List<') || responseType === 'dynamic') {
        return responseType === 'void' ? [] : ['expect(result, isNotNull);'];
    }
    const resolvedSchema = resolveSchema(ctx, schema);
    const properties = resolvedSchema?.properties ? Object.entries(resolvedSchema.properties) : [];
    if (properties.length === 0) {
        return ['expect(result, isNotNull);'];
    }
    const assertions = ['expect(result, isNotNull);'];
    for (let index = 0; index < properties.length; index += 1) {
        const [propertyName, propertySchema] = properties[index];
        const propertyAccess = `result?.${DART_CONFIG.namingConventions.propertyName(propertyName)}`;
        const resolvedPropertySchema = resolveSchema(ctx, propertySchema);
        const normalizedType = normalizeSchemaType(resolvedPropertySchema?.type)
            || inferImplicitObjectType(resolvedPropertySchema);
        if (propertySchema?.$ref) {
            assertions.push(`expect(${propertyAccess}, isNotNull);`);
            continue;
        }
        switch (normalizedType) {
            case 'integer':
                assertions.push(`expect(${propertyAccess}, ${index + 1});`);
                break;
            case 'number':
                assertions.push(`expect(${propertyAccess}, ${index + 1}.0);`);
                break;
            case 'boolean':
                assertions.push(`expect(${propertyAccess}, true);`);
                break;
            case 'array':
            case 'object':
                assertions.push(`expect(${propertyAccess}, isNotNull);`);
                break;
            case 'string':
            default:
                assertions.push(`expect(${propertyAccess}, ${quoteDartString(sampleStringValue(propertyName, index, resolvedPropertySchema))});`);
                break;
        }
    }
    return assertions;
}
function resolveSuccessStatusCode(operation, responseType) {
    const statusCodes = Object.keys(operation.responses || {});
    const firstSuccess = statusCodes.find((code) => /^2\d\d$/.test(code));
    if (firstSuccess) {
        return Number(firstSuccess);
    }
    return responseType === 'void' ? 204 : 200;
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
function extractResponseSchema(operation) {
    const responses = operation.responses;
    if (!responses || typeof responses !== 'object') {
        return undefined;
    }
    const statusCodes = Object.keys(responses).sort();
    const preferred = statusCodes.filter((code) => /^2\d\d$/.test(code));
    const candidates = preferred.length > 0 ? preferred : statusCodes;
    for (const code of candidates) {
        const content = responses[code]?.content;
        if (!content || typeof content !== 'object') {
            continue;
        }
        const mediaType = pickJsonMediaType(content);
        if (mediaType && content[mediaType]?.schema) {
            return content[mediaType].schema;
        }
    }
    return undefined;
}
function inferFallbackResponseType(operation) {
    const responses = operation.responses;
    if (!responses || typeof responses !== 'object') {
        return 'dynamic';
    }
    const statusCodes = Object.keys(responses);
    if (statusCodes.length === 0) {
        return 'dynamic';
    }
    const allNoContent = statusCodes.every((code) => {
        const content = responses[code]?.content;
        return !content || typeof content !== 'object' || Object.keys(content).length === 0;
    });
    if (allNoContent || responses['204']) {
        return 'void';
    }
    return 'dynamic';
}
function pickRequestBodyMediaType(content) {
    const mediaTypes = Object.keys(content);
    if (mediaTypes.length === 0) {
        return undefined;
    }
    for (const preferred of ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded']) {
        const matched = mediaTypes.find((mediaType) => mediaType.toLowerCase() === preferred);
        if (matched) {
            return matched;
        }
    }
    const jsonLike = mediaTypes.find((mediaType) => mediaType.toLowerCase().endsWith('+json'));
    return jsonLike || mediaTypes[0];
}
function pickJsonMediaType(content) {
    const mediaTypes = Object.keys(content);
    const jsonLike = mediaTypes.find((mediaType) => {
        const normalized = mediaType.toLowerCase();
        return normalized === DART_JSON_CONTENT_TYPE || normalized.endsWith('+json');
    });
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
function resolveSchema(ctx, schema) {
    if (!schema || typeof schema !== 'object') {
        return schema;
    }
    if (schema.$ref) {
        const refName = schema.$ref.split('/').pop() || '';
        return ctx.schemas[refName] || schema;
    }
    const composed = pickComposedSchema(schema);
    if (composed) {
        return resolveSchema(ctx, composed) || composed;
    }
    return schema;
}
function sampleStringValue(fallbackName, index, schema, mediaType) {
    const normalizedName = String(fallbackName || '').trim().toLowerCase();
    if (schema?.format === 'email')
        return 'user@example.com';
    if (schema?.format === 'uri' || schema?.format === 'url')
        return 'https://example.com';
    if (schema?.format === 'date')
        return '2026-04-10';
    if (schema?.format === 'date-time')
        return '2026-04-10T00:00:00Z';
    if (schema?.format === 'uuid')
        return '00000000-0000-0000-0000-000000000001';
    if (schema?.format === 'binary' && String(mediaType || '').startsWith('multipart/form-data'))
        return 'sample-file';
    if (normalizedName.endsWith('id'))
        return '1';
    if (normalizedName.includes('code'))
        return 'ok';
    if (normalizedName.includes('keyword'))
        return 'keyword';
    if (normalizedName.includes('email'))
        return 'user@example.com';
    if (normalizedName.includes('token'))
        return 'token';
    if (normalizedName.includes('name'))
        return 'name';
    if (!normalizedName)
        return `value${index + 1}`;
    return normalizedName.replace(/[^a-z0-9]+/g, '-');
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
function toUsageIdentifier(rawName, fallbackPrefix, index) {
    const cleaned = toSafeCamelIdentifier(rawName || '', DART_RESERVED_WORDS, `${fallbackPrefix}${index}`);
    return cleaned || `${fallbackPrefix}${index}`;
}
function quoteDartString(value) {
    return `'${String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
