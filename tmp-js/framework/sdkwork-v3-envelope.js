const LEGACY_ENVELOPE_NAMES = [
    'PlusApiResult',
    'AppbaseApiResult',
    'StoreApiResult',
    'SdkWorkResponse',
];
const LEGACY_ENVELOPE_PATTERN = /\b(\w+ApiResult)\b/;
const ENVELOPE_NAMES = new Set([
    'SdkWorkApiResponse',
    'SdkWorkResourceResponse',
    'SdkWorkListResponse',
    'SdkWorkCommandResponse',
]);
export function validateSdkworkV3Envelope(spec, options = {}) {
    const issues = [];
    const schemas = spec.components?.schemas || {};
    const skipSuccessEnvelopeChecks = options.sdkType === 'custom';
    for (const legacyName of LEGACY_ENVELOPE_NAMES) {
        if (schemas[legacyName]) {
            issues.push(`components.schemas.${legacyName} is forbidden; use SdkWorkApiResponse.`);
        }
    }
    for (const schemaName of Object.keys(schemas)) {
        if (LEGACY_ENVELOPE_PATTERN.test(schemaName) && !ENVELOPE_NAMES.has(schemaName)) {
            issues.push(`components.schemas.${schemaName} is a forbidden legacy envelope name.`);
        }
    }
    if (!schemas.ProblemDetail) {
        issues.push('components.schemas.ProblemDetail is required for sdkwork-v3.');
    }
    else {
        const required = new Set(schemas.ProblemDetail.required || []);
        if (!required.has('code') || !required.has('traceId')) {
            issues.push('ProblemDetail must require numeric code and traceId.');
        }
    }
    const hasSuccessEnvelope = Object.keys(schemas).some((name) => ENVELOPE_NAMES.has(name) || name === 'SdkWorkApiResponse');
    if (!skipSuccessEnvelopeChecks && !hasSuccessEnvelope) {
        issues.push('components.schemas must declare SdkWorkApiResponse or SdkWork*Response envelope schemas.');
    }
    for (const [rawPath, pathItem] of Object.entries(spec.paths || {})) {
        for (const [method, operation] of Object.entries(pathItem || {})) {
            if (!operation || typeof operation !== 'object' || !('responses' in operation)) {
                continue;
            }
            const op = operation;
            if (operationUsesExternalWireProtocol(op)) {
                continue;
            }
            for (const parameter of op.parameters || []) {
                if (parameter?.in === 'header'
                    && typeof parameter.name === 'string'
                    && parameter.name.toLowerCase() === 'x-request-id') {
                    issues.push(`${method.toUpperCase()} ${rawPath} must not declare X-Request-Id parameter.`);
                }
            }
            for (const [statusCode, response] of Object.entries(op.responses || {})) {
                const status = Number(statusCode);
                if (!Number.isFinite(status) || status < 200 || status >= 300) {
                    continue;
                }
                if (status === 204) {
                    continue;
                }
                const schema = extractJsonSchema(response);
                if (!schema) {
                    issues.push(`${method.toUpperCase()} ${rawPath} ${statusCode} must declare application/json success schema.`);
                    continue;
                }
                if (!skipSuccessEnvelopeChecks) {
                    const plan = analyzeEnvelopeSchema(schema, schemas);
                    if (!plan.hasEnvelope) {
                        issues.push(`${method.toUpperCase()} ${rawPath} ${statusCode} must use SdkWorkApiResponse envelope, not bare DTO.`);
                    }
                }
            }
        }
    }
    return issues;
}
export function analyzeEnvelopeSchema(schema, components) {
    const resolved = resolveSchema(schema, components, new Set());
    const schemaName = schema.$ref ? String(schema.$ref).split('/').pop() : undefined;
    if (schemaName && ENVELOPE_NAMES.has(schemaName)) {
        return {
            wireSchemaName: schemaName,
            unwrapKind: unwrapKindForEnvelopeName(schemaName),
            hasEnvelope: true,
        };
    }
    if (resolved?.allOf) {
        const parts = resolved.allOf.map((part) => resolveSchema(part, components, new Set()));
        const hasBase = parts.some((part) => refName(part?.$ref) === 'SdkWorkApiResponse'
            || part?.required?.includes?.('code'));
        if (hasBase) {
            const dataParts = parts.filter((part) => part?.properties?.data);
            const dataPart = dataParts.at(-1) ?? dataParts[0];
            return {
                wireSchemaName: schemaName,
                unwrapKind: unwrapKindForDataSchema(dataPart?.properties?.data, components),
                hasEnvelope: true,
            };
        }
    }
    if (resolved?.required?.includes?.('code') && resolved?.required?.includes?.('traceId')) {
        return {
            wireSchemaName: schemaName,
            unwrapKind: unwrapKindForDataSchema(resolved.properties?.data, components),
            hasEnvelope: true,
        };
    }
    return { unwrapKind: 'data', hasEnvelope: false };
}
export function resolveSdkworkV3ConsumerSchema(schema, components) {
    const plan = analyzeEnvelopeSchema(schema, components);
    if (!plan.hasEnvelope) {
        return { consumerSchema: schema, plan };
    }
    const dataSchema = extractEnvelopeDataSchema(schema, components);
    switch (plan.unwrapKind) {
        case 'item': {
            const itemSchema = extractNestedPropertySchema(dataSchema, 'item', components);
            return { consumerSchema: itemSchema || dataSchema || schema, plan };
        }
        case 'page':
        case 'command':
        case 'data':
            return { consumerSchema: dataSchema || schema, plan };
        case 'void':
            return { consumerSchema: { type: 'null' }, plan };
        default:
            return { consumerSchema: dataSchema || schema, plan };
    }
}
function extractEnvelopeDataSchema(schema, components) {
    const resolved = resolveSchema(schema, components, new Set());
    if (Array.isArray(resolved?.allOf)) {
        const dataSchemas = resolved.allOf
            .map((part) => resolveSchema(part, components, new Set()))
            .map((part) => part?.properties?.data)
            .filter(Boolean);
        const dataSchema = dataSchemas.at(-1);
        if (dataSchema) {
            return preserveSchemaReference(dataSchema, components);
        }
    }
    const directData = resolved?.properties?.data;
    return directData ? preserveSchemaReference(directData, components) : undefined;
}
function preserveSchemaReference(schema, components) {
    if (typeof schema.$ref === 'string') {
        return { $ref: schema.$ref };
    }
    return resolveSchema(schema, components, new Set());
}
function extractNestedPropertySchema(schema, propertyName, components) {
    if (!schema) {
        return undefined;
    }
    const resolved = resolveSchema(schema, components, new Set());
    const propertySchema = resolved?.properties?.[propertyName];
    if (!propertySchema || typeof propertySchema !== 'object') {
        return undefined;
    }
    if (typeof propertySchema.$ref === 'string') {
        return propertySchema;
    }
    return resolveSchema(propertySchema, components, new Set());
}
function unwrapKindForEnvelopeName(name) {
    if (name === 'SdkWorkListResponse') {
        return 'page';
    }
    if (name === 'SdkWorkCommandResponse') {
        return 'command';
    }
    if (name === 'SdkWorkResourceResponse') {
        return 'item';
    }
    return 'data';
}
function unwrapKindForDataSchema(dataSchema, components) {
    const resolved = resolveSchema(dataSchema || {}, components, new Set());
    const ref = refName(resolved?.$ref);
    if (ref === 'SdkWorkPageData') {
        return 'page';
    }
    if (ref === 'SdkWorkResourceData') {
        return 'item';
    }
    if (ref === 'SdkWorkCommandData') {
        return 'command';
    }
    const required = new Set(resolved?.required || []);
    if (required.has('items') && required.has('pageInfo')) {
        return 'page';
    }
    if (required.has('item')) {
        return 'item';
    }
    if (required.has('accepted')) {
        return 'command';
    }
    return 'data';
}
function extractJsonSchema(response) {
    const content = response?.content?.['application/json']?.schema;
    return content && typeof content === 'object' ? content : undefined;
}
function operationUsesExternalWireProtocol(operation) {
    return operation['x-sdkwork-wire-protocol'] === 'external'
        && typeof operation['x-sdkwork-external-protocol-id'] === 'string'
        && operation['x-sdkwork-external-protocol-id'].trim().length > 0;
}
function resolveSchema(schema, components, seen) {
    if (!schema || typeof schema !== 'object') {
        return {};
    }
    const ref = refName(schema.$ref);
    if (!ref) {
        return schema;
    }
    if (seen.has(ref)) {
        return schema;
    }
    seen.add(ref);
    const target = components[ref];
    if (!target || typeof target !== 'object') {
        return schema;
    }
    return resolveSchema(target, components, seen);
}
function refName(ref) {
    if (typeof ref !== 'string') {
        return undefined;
    }
    return ref.split('/').pop();
}
