import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import { normalizeOperationId, resolveScopedMethodNames, resolveSimplifiedTagNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { RUST_CONFIG, getRustType } from './config.js';
const BODY_METHODS = new Set(['post', 'put', 'patch']);
const DEFAULT_PREFERRED_MODULES = ['tenant', 'user', 'app', 'auth', 'workspace'];
const RUST_RESERVED_WORDS = new Set([
    'as', 'break', 'const', 'continue', 'crate', 'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl',
    'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static',
    'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while', 'async', 'await', 'dyn',
]);
export class RustUsagePlanner {
    constructor(ctx, preferredModules = DEFAULT_PREFERRED_MODULES) {
        this.ctx = ctx;
        this.resolvedTagNames = resolveSimplifiedTagNames(Object.keys(ctx.apiGroups));
        this.preferredModules = preferredModules;
        this.knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => RUST_CONFIG.namingConventions.modelName(schemaName)));
    }
    getModuleName(tag) {
        const resolvedTagName = this.resolvedTagNames.get(tag) || tag;
        return RUST_CONFIG.namingConventions.propertyName(resolvedTagName);
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
        const methodName = resolveRustMethodNames(tag, operations).get(operation) || 'operation';
        const moduleName = this.getModuleName(tag);
        const variables = [];
        const callArguments = [];
        const queryExpectations = [];
        const headerExpectations = [];
        let needsHashMapImport = false;
        let needsModelImport = false;
        const rawPathParams = extractPathParams(operation.path);
        const pathParamNames = createUniqueIdentifierMap(rawPathParams, (value) => sanitizeRustIdentifier(value), ['body', 'query', 'headers']);
        for (let index = 0; index < rawPathParams.length; index += 1) {
            const rawName = rawPathParams[index];
            const variableName = pathParamNames.get(rawName) || sanitizeRustIdentifier(rawName);
            const sampleValue = /id$/i.test(variableName) ? quoteRustString('1') : quoteRustString(variableName);
            variables.push({
                name: variableName,
                kind: 'path',
                setupByMode: {
                    readme: [`let ${variableName} = ${sampleValue};`],
                    test: [`let ${variableName} = ${sampleValue};`],
                },
            });
            callArguments.push(variableName);
        }
        const requestBodyInfo = BODY_METHODS.has(String(operation.method || '').toLowerCase())
            ? extractRequestBodyInfo(operation)
            : undefined;
        if (requestBodyInfo) {
            const bodyVariable = this.buildBodyVariable(requestBodyInfo.schema, requestBodyInfo.mediaType);
            variables.push(bodyVariable.variable);
            callArguments.push('&body');
            needsHashMapImport = needsHashMapImport || bodyVariable.needsHashMapImport;
            needsModelImport = needsModelImport || bodyVariable.needsModelImport;
        }
        const allParameters = resolveConcreteParameters(operation);
        const queryParams = allParameters.filter((parameter) => parameter?.in === 'query');
        if (queryParams.length > 0) {
            const queryVariable = this.buildQueryVariable(queryParams);
            variables.push(queryVariable.variable);
            queryExpectations.push(...queryVariable.expectations);
            callArguments.push('Some(&query)');
            needsHashMapImport = true;
        }
        const headerParams = allParameters.filter((parameter) => parameter?.in === 'header' || parameter?.in === 'cookie');
        if (headerParams.length > 0) {
            const headerVariable = this.buildHeaderVariable(headerParams);
            variables.push(headerVariable.variable);
            headerExpectations.push(...headerVariable.expectations);
            callArguments.push('Some(&headers)');
            needsHashMapImport = true;
        }
        const responseSchema = extractResponseSchema(operation);
        const responseType = responseSchema ? getRustType(responseSchema, RUST_CONFIG) : inferFallbackResponseType(operation);
        const responseStatusCode = resolveSuccessStatusCode(operation, responseType);
        const responseBody = responseType === '()'
            ? undefined
            : JSON.stringify(buildJsonSampleValue(this.ctx, responseSchema, 'result', 0));
        const responseAssertions = buildResponseAssertions(this.ctx, responseSchema, responseType);
        return {
            tag,
            moduleName,
            methodName,
            operation,
            requestBodyMediaType: requestBodyInfo?.mediaType,
            variables,
            callExpression: `client.${moduleName}().${methodName}(${callArguments.join(', ')})`,
            queryExpectations,
            headerExpectations,
            bodyAssertion: requestBodyInfo ? buildBodyAssertionPlan(requestBodyInfo.mediaType) : undefined,
            responseType,
            hasReturnValue: responseType !== '()',
            responseStatusCode,
            responseBody,
            responseAssertions: responseAssertions.length > 0
                ? responseAssertions
                : (responseType !== '()' ? ['let _ = &result;'] : []),
            needsHashMapImport,
            needsModelImport,
        };
    }
    buildBodyVariable(schema, mediaType) {
        const declaredType = getRustType(schema, RUST_CONFIG);
        const resolvedSchema = resolveSchema(this.ctx, schema);
        const normalizedMediaType = String(mediaType || '').toLowerCase();
        if (this.isKnownModelType(declaredType)) {
            const lines = this.renderModelVariable('body', declaredType, resolvedSchema);
            return {
                variable: { name: 'body', kind: 'body', setupByMode: { readme: lines, test: lines } },
                assertion: buildBodyAssertionPlan(normalizedMediaType),
                needsHashMapImport: false,
                needsModelImport: true,
            };
        }
        const normalizedType = normalizeSchemaType(resolvedSchema?.type) || inferImplicitObjectType(resolvedSchema);
        if (declaredType.startsWith('std::collections::HashMap<')) {
            const lines = renderHashMapVariable(this.ctx, resolvedSchema, normalizedMediaType);
            return {
                variable: { name: 'body', kind: 'body', setupByMode: { readme: lines, test: lines } },
                assertion: buildBodyAssertionPlan(normalizedMediaType),
                needsHashMapImport: true,
                needsModelImport: false,
            };
        }
        if (normalizedType === 'object' || declaredType === 'serde_json::Value') {
            const jsonValue = buildJsonSampleValue(this.ctx, resolvedSchema, 'body', 0);
            const lines = [`let body = serde_json::json!(${JSON.stringify(jsonValue)});`];
            return {
                variable: { name: 'body', kind: 'body', setupByMode: { readme: lines, test: lines } },
                assertion: buildBodyAssertionPlan(normalizedMediaType),
                needsHashMapImport: false,
                needsModelImport: false,
            };
        }
        if (normalizedType === 'array' || declaredType.startsWith('Vec<')) {
            const itemValue = renderInlineRustValue(this.ctx, resolvedSchema?.items, 'item', 0, normalizedMediaType, 1);
            const lines = itemValue
                ? [`let body = vec![${itemValue.rustExpression}];`]
                : ['let body: Vec<serde_json::Value> = Vec::new();'];
            return {
                variable: { name: 'body', kind: 'body', setupByMode: { readme: lines, test: lines } },
                assertion: buildBodyAssertionPlan(normalizedMediaType),
                needsHashMapImport: false,
                needsModelImport: false,
            };
        }
        const scalarValue = renderInlineRustValue(this.ctx, resolvedSchema, 'value', 0, normalizedMediaType, 0)
            || buildScalarRustValue('value', resolvedSchema, 0, mediaType);
        const lines = [`let body = ${scalarValue.rustExpression};`];
        return {
            variable: { name: 'body', kind: 'body', setupByMode: { readme: lines, test: lines } },
            assertion: buildBodyAssertionPlan(normalizedMediaType),
            needsHashMapImport: false,
            needsModelImport: false,
        };
    }
    buildQueryVariable(parameters) {
        const expectations = [];
        const lines = ['let mut query = HashMap::new();'];
        for (let index = 0; index < parameters.length; index += 1) {
            const parameter = parameters[index];
            const sample = buildParameterValue(this.ctx, parameter, index);
            expectations.push({ name: parameter.name, expected: sample.stringValue });
            lines.push(`query.insert(${quoteRustString(parameter.name)}.to_string(), serde_json::json!(${JSON.stringify(sample.jsonValue)}));`);
        }
        return {
            variable: { name: 'query', kind: 'query', setupByMode: { readme: lines, test: lines } },
            expectations,
        };
    }
    buildHeaderVariable(parameters) {
        const expectations = [];
        const lines = ['let mut headers = HashMap::new();'];
        for (let index = 0; index < parameters.length; index += 1) {
            const parameter = parameters[index];
            const sample = buildHeaderValue(this.ctx, parameter, index);
            expectations.push({ name: parameter.name, expected: sample.stringValue });
            lines.push(`headers.insert(${quoteRustString(parameter.name)}.to_string(), ${sample.rustExpression});`);
        }
        return {
            variable: { name: 'headers', kind: 'headers', setupByMode: { readme: lines, test: lines } },
            expectations,
        };
    }
    renderModelVariable(variableName, typeName, schema) {
        const properties = schema?.properties ? Object.entries(schema.properties) : [];
        if (properties.length === 0) {
            return [`let ${variableName} = ${typeName}::default();`];
        }
        const required = new Set(getRequiredPropertyNames(schema));
        const lines = [`let ${variableName} = ${typeName} {`];
        for (let index = 0; index < properties.length; index += 1) {
            const [propertyName, propertySchema] = properties[index];
            const rendered = renderInlineRustValue(this.ctx, propertySchema, propertyName, index, 'application/json', 1)
                || buildScalarRustValue(propertyName, propertySchema, index, 'application/json');
            const fieldName = sanitizeRustIdentifier(RUST_CONFIG.namingConventions.propertyName(propertyName));
            const value = required.has(propertyName) ? rendered.rustExpression : `Some(${rendered.rustExpression})`;
            lines.push(`    ${fieldName}: ${value},`);
        }
        lines.push('    ..Default::default()');
        lines.push('};');
        return lines;
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
export function resolveRustMethodNames(tag, operations) {
    if (!Array.isArray(operations) || operations.length === 0) {
        return new Map();
    }
    return resolveScopedMethodNames(operations, (operation) => generateRustOperationName(operation.method, operation.path, operation, tag));
}
export function renderRustUsageSnippet(plan, mode, options = {}) {
    const setupLines = plan.variables.flatMap((variable) => variable.setupByMode[mode]);
    const assignResult = options.assignResult ?? plan.hasReturnValue;
    const resultVariableName = options.resultVariableName || 'result';
    const callLine = assignResult && plan.hasReturnValue
        ? `let ${resultVariableName} = ${plan.callExpression}.await?;`
        : `${plan.callExpression}.await?;`;
    return setupLines.length > 0 ? `${setupLines.join('\n')}\n${callLine}` : callLine;
}
export function resolveRustExpectedRequestPath(path, apiPrefix) {
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
function generateRustOperationName(method, path, operation, tag) {
    if (operation.operationId) {
        const normalized = normalizeOperationId(operation.operationId);
        return toSnakeCase(stripTagPrefixFromOperationId(normalized, tag));
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
    return toSnakeCase(`${actionMap[method] || method}_${resource}`);
}
function buildBodyAssertionPlan(mediaType) {
    const normalized = String(mediaType || '').toLowerCase();
    if (normalized === 'application/json' || normalized.endsWith('+json')) {
        return { kind: 'json', contentType: 'application/json', contentTypeMatch: 'prefix' };
    }
    if (normalized.startsWith('multipart/form-data')) {
        return { kind: 'non-empty', contentType: 'multipart/form-data', contentTypeMatch: 'prefix' };
    }
    return { kind: 'non-empty', contentType: mediaType, contentTypeMatch: 'exact' };
}
function renderHashMapVariable(ctx, schema, mediaType) {
    const lines = ['let mut body = HashMap::new();'];
    const entries = renderHashMapEntries(ctx, schema, mediaType);
    for (const entry of entries) {
        lines.push(`body.insert(${quoteRustString(entry.name)}.to_string(), ${entry.value.rustExpression});`);
    }
    return lines;
}
function renderHashMapEntries(ctx, schema, mediaType) {
    const entries = [];
    const properties = schema?.properties ? Object.entries(schema.properties) : [];
    if (properties.length > 0) {
        for (let index = 0; index < properties.length; index += 1) {
            const [propertyName, propertySchema] = properties[index];
            entries.push({
                name: propertyName,
                value: renderInlineRustValue(ctx, propertySchema, propertyName, index, mediaType, 1)
                    || buildScalarRustValue(propertyName, propertySchema, index, mediaType),
            });
        }
        return entries;
    }
    if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
        entries.push({
            name: 'value',
            value: renderInlineRustValue(ctx, schema.additionalProperties, 'value', 0, mediaType, 1)
                || buildScalarRustValue('value', schema.additionalProperties, 0, mediaType),
        });
        return entries;
    }
    if (mediaType.startsWith('multipart/form-data') || mediaType.startsWith('application/x-www-form-urlencoded')) {
        entries.push({
            name: 'value',
            value: buildScalarRustValue('value', { type: 'string' }, 0, mediaType),
        });
    }
    return entries;
}
function renderInlineRustValue(ctx, schema, fallbackName, index, mediaType, depth) {
    const resolvedSchema = resolveSchema(ctx, schema);
    const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
    if (enumValues && enumValues.length > 0) {
        return buildLiteralValue(enumValues[0]);
    }
    if (!resolvedSchema || depth > 2) {
        return undefined;
    }
    if (schema?.$ref) {
        const modelType = getRustType(schema, RUST_CONFIG);
        return {
            rustExpression: `${modelType}::default()`,
            jsonValue: {},
            stringValue: '[object]',
        };
    }
    const normalizedType = normalizeSchemaType(resolvedSchema.type) || inferImplicitObjectType(resolvedSchema);
    switch (normalizedType) {
        case 'integer': {
            const value = index + 1;
            return { rustExpression: `${value}_i64`, jsonValue: value, stringValue: String(value) };
        }
        case 'number': {
            const value = index + 1;
            return { rustExpression: `${value}.0_f64`, jsonValue: value, stringValue: String(value) };
        }
        case 'boolean': {
            const value = index % 2 === 0;
            return { rustExpression: value ? 'true' : 'false', jsonValue: value, stringValue: value ? 'true' : 'false' };
        }
        case 'array': {
            const itemValue = renderInlineRustValue(ctx, resolvedSchema.items, fallbackName, index, mediaType, depth + 1)
                || buildScalarRustValue(fallbackName, resolvedSchema.items, index, mediaType);
            return {
                rustExpression: `vec![${itemValue.rustExpression}]`,
                jsonValue: [itemValue.jsonValue],
                stringValue: String(itemValue.stringValue),
            };
        }
        case 'object': {
            const jsonValue = buildJsonSampleValue(ctx, resolvedSchema, fallbackName, depth + 1);
            return {
                rustExpression: `serde_json::json!(${JSON.stringify(jsonValue)})`,
                jsonValue,
                stringValue: JSON.stringify(jsonValue),
            };
        }
        case 'string':
        default:
            return buildScalarRustValue(fallbackName, resolvedSchema, index, mediaType);
    }
}
function buildScalarRustValue(fallbackName, schema, index, mediaType) {
    const normalizedType = normalizeSchemaType(schema?.type) || inferImplicitObjectType(schema);
    if (normalizedType === 'integer') {
        const value = index + 1;
        return { rustExpression: `${value}_i64`, jsonValue: value, stringValue: String(value) };
    }
    if (normalizedType === 'number') {
        const value = index + 1;
        return { rustExpression: `${value}.0_f64`, jsonValue: value, stringValue: String(value) };
    }
    if (normalizedType === 'boolean') {
        const value = index % 2 === 0;
        return { rustExpression: value ? 'true' : 'false', jsonValue: value, stringValue: value ? 'true' : 'false' };
    }
    const sampleString = sampleStringValue(fallbackName, index, schema, mediaType);
    return {
        rustExpression: `${quoteRustString(sampleString)}.to_string()`,
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
    const normalizedType = normalizeSchemaType(resolvedSchema?.type);
    if (normalizedType === 'integer') {
        const value = index + 1;
        return { rustExpression: `${value}_i64`, jsonValue: value, stringValue: String(value) };
    }
    if (normalizedType === 'number') {
        const value = index + 1;
        return { rustExpression: `${value}.0_f64`, jsonValue: value, stringValue: String(value) };
    }
    if (normalizedType === 'boolean') {
        const value = index % 2 === 0;
        return { rustExpression: value ? 'true' : 'false', jsonValue: value, stringValue: value ? 'true' : 'false' };
    }
    return buildScalarRustValue(parameter.name || `value${index + 1}`, resolvedSchema, index);
}
function buildHeaderValue(ctx, parameter, index) {
    const resolvedSchema = resolveSchema(ctx, parameter?.schema);
    const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
    if (enumValues && enumValues.length > 0) {
        const value = String(enumValues[0]);
        return {
            rustExpression: `${quoteRustString(value)}.to_string()`,
            jsonValue: value,
            stringValue: value,
        };
    }
    const normalizedType = normalizeSchemaType(resolvedSchema?.type);
    if (normalizedType === 'integer' || normalizedType === 'number') {
        const value = String(index + 1);
        return {
            rustExpression: `${quoteRustString(value)}.to_string()`,
            jsonValue: value,
            stringValue: value,
        };
    }
    if (normalizedType === 'boolean') {
        const value = index % 2 === 0 ? 'true' : 'false';
        return {
            rustExpression: `${quoteRustString(value)}.to_string()`,
            jsonValue: value,
            stringValue: value,
        };
    }
    return buildScalarRustValue(parameter.name || `header${index + 1}`, resolvedSchema, index);
}
function buildLiteralValue(value) {
    if (typeof value === 'number') {
        return { rustExpression: String(value), jsonValue: value, stringValue: String(value) };
    }
    if (typeof value === 'boolean') {
        return {
            rustExpression: value ? 'true' : 'false',
            jsonValue: value,
            stringValue: value ? 'true' : 'false',
        };
    }
    const stringValue = String(value ?? 'value');
    return {
        rustExpression: `${quoteRustString(stringValue)}.to_string()`,
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
    if (!schema || responseType === '()' || responseType === 'serde_json::Value') {
        return responseType === '()' ? [] : ['let _ = &result;'];
    }
    const resolvedSchema = resolveSchema(ctx, schema);
    const properties = resolvedSchema?.properties ? Object.entries(resolvedSchema.properties) : [];
    const required = new Set(getRequiredPropertyNames(resolvedSchema));
    if (properties.length === 0) {
        return ['let _ = &result;'];
    }
    const assertions = [];
    for (let index = 0; index < properties.length; index += 1) {
        const [propertyName, propertySchema] = properties[index];
        const fieldName = sanitizeRustIdentifier(RUST_CONFIG.namingConventions.propertyName(propertyName));
        const resolvedPropertySchema = resolveSchema(ctx, propertySchema);
        const normalizedType = normalizeSchemaType(resolvedPropertySchema?.type)
            || inferImplicitObjectType(resolvedPropertySchema);
        const isRequired = required.has(propertyName);
        if (propertySchema?.$ref) {
            assertions.push(isRequired
                ? `let _ = &result.${fieldName};`
                : `assert!(result.${fieldName}.is_some());`);
            continue;
        }
        switch (normalizedType) {
            case 'integer':
                assertions.push(`assert_eq!(result.${fieldName}, ${isRequired ? `${index + 1}_i64` : `Some(${index + 1}_i64)`});`);
                break;
            case 'number':
                assertions.push(`assert_eq!(result.${fieldName}, ${isRequired ? `${index + 1}.0_f64` : `Some(${index + 1}.0_f64)`});`);
                break;
            case 'boolean':
                assertions.push(`assert_eq!(result.${fieldName}, ${isRequired ? 'true' : 'Some(true)'});`);
                break;
            case 'array':
            case 'object':
                assertions.push(isRequired
                    ? `let _ = &result.${fieldName};`
                    : `assert!(result.${fieldName}.is_some());`);
                break;
            case 'string':
            default: {
                const sample = quoteRustString(sampleStringValue(propertyName, index, resolvedPropertySchema));
                assertions.push(isRequired
                    ? `assert_eq!(result.${fieldName}, ${sample});`
                    : `assert_eq!(result.${fieldName}.as_deref(), Some(${sample}));`);
                break;
            }
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
    return responseType === '()' ? 204 : 200;
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
    return mediaType && schema ? { mediaType, schema } : undefined;
}
function extractResponseSchema(operation) {
    const responses = operation.responses;
    if (!responses || typeof responses !== 'object') {
        return undefined;
    }
    const statusCodes = Object.keys(responses).sort();
    const preferred = statusCodes.filter((code) => /^2\d\d$/.test(code));
    for (const code of (preferred.length > 0 ? preferred : statusCodes)) {
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
        return 'serde_json::Value';
    }
    const statusCodes = Object.keys(responses);
    if (statusCodes.length === 0) {
        return 'serde_json::Value';
    }
    const allNoContent = statusCodes.every((code) => {
        const content = responses[code]?.content;
        return !content || typeof content !== 'object' || Object.keys(content).length === 0;
    });
    return allNoContent || responses['204'] ? '()' : 'serde_json::Value';
}
function pickRequestBodyMediaType(content) {
    const mediaTypes = Object.keys(content);
    for (const preferred of ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded']) {
        const matched = mediaTypes.find((mediaType) => mediaType.toLowerCase() === preferred);
        if (matched) {
            return matched;
        }
    }
    return mediaTypes.find((mediaType) => mediaType.toLowerCase().endsWith('+json')) || mediaTypes[0];
}
function pickJsonMediaType(content) {
    const mediaTypes = Object.keys(content);
    return mediaTypes.find((mediaType) => {
        const normalized = mediaType.toLowerCase();
        return normalized === 'application/json' || normalized.endsWith('+json');
    }) || mediaTypes[0];
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
    return composed ? (resolveSchema(ctx, composed) || composed) : schema;
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
    return normalizedName ? normalizedName.replace(/[^a-z0-9]+/g, '-') : `value${index + 1}`;
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
    return schema.properties || schema.additionalProperties ? 'object' : undefined;
}
function getRequiredPropertyNames(schema) {
    const required = schema?.required;
    return Array.isArray(required) ? required.filter((value) => typeof value === 'string') : [];
}
function pickComposedSchema(schema) {
    for (const key of ['allOf', 'oneOf', 'anyOf']) {
        const values = schema?.[key];
        if (!Array.isArray(values) || values.length === 0) {
            continue;
        }
        return values.find((entry) => entry && normalizeSchemaType(entry.type) !== 'null') || values[0];
    }
    return undefined;
}
function toSnakeCase(value) {
    return String(value || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase();
}
function sanitizeRustIdentifier(value) {
    const normalized = toSnakeCase(value) || 'value';
    const safe = /^[0-9]/.test(normalized) ? `field_${normalized}` : normalized;
    return RUST_RESERVED_WORDS.has(safe) ? `r#${safe}` : safe;
}
function quoteRustString(value) {
    return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
