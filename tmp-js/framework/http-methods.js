export const OPENAPI_FIXED_HTTP_METHODS = [
    'get',
    'put',
    'post',
    'delete',
    'options',
    'head',
    'patch',
    'trace',
    'query',
];
export const OPENAPI_FIXED_HTTP_METHOD_SET = new Set(OPENAPI_FIXED_HTTP_METHODS);
const PATH_ITEM_METADATA_FIELDS = new Set([
    '$ref',
    'summary',
    'description',
    'servers',
    'parameters',
    'additionalOperations',
]);
export function isOpenApiFixedHttpMethod(method) {
    return OPENAPI_FIXED_HTTP_METHOD_SET.has(method.toLowerCase());
}
export function isOpenApiPathItemMetadataField(field) {
    return PATH_ITEM_METADATA_FIELDS.has(field);
}
export function isOpenApiOperationLike(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
export function normalizeOpenApiAdditionalMethod(method) {
    return String(method || '').trim().toLowerCase();
}
export function toHttpMethodLiteral(method) {
    return String(method || '').trim();
}
export function supportsRequestBodyByDefault(method) {
    const normalized = method.toLowerCase();
    return normalized === 'post'
        || normalized === 'put'
        || normalized === 'patch'
        || normalized === 'query';
}
export function normalizeOpenApiPathItemOperations(pathItem) {
    const operations = [];
    for (const [field, value] of Object.entries(pathItem || {})) {
        const normalizedMethod = field.toLowerCase();
        if (!isOpenApiFixedHttpMethod(normalizedMethod)) {
            continue;
        }
        if (!isOpenApiOperationLike(value)) {
            continue;
        }
        operations.push({
            method: normalizedMethod,
            httpMethod: normalizedMethod.toUpperCase(),
            operation: value,
        });
    }
    const additionalOperations = pathItem?.additionalOperations;
    if (additionalOperations && typeof additionalOperations === 'object' && !Array.isArray(additionalOperations)) {
        for (const [method, value] of Object.entries(additionalOperations)) {
            const normalizedMethod = normalizeOpenApiAdditionalMethod(method);
            if (!normalizedMethod || isOpenApiFixedHttpMethod(normalizedMethod)) {
                continue;
            }
            if (!isOpenApiOperationLike(value)) {
                continue;
            }
            operations.push({
                method: normalizedMethod,
                httpMethod: method.trim(),
                operation: value,
            });
        }
    }
    return operations;
}
export function findUnexpectedPathItemOperationFields(pathItem) {
    const fields = [];
    for (const [field, value] of Object.entries(pathItem || {})) {
        if (field.startsWith('x-') || isOpenApiPathItemMetadataField(field) || isOpenApiFixedHttpMethod(field)) {
            continue;
        }
        if (isOpenApiOperationLike(value) && ('responses' in value || 'operationId' in value)) {
            fields.push(field);
        }
    }
    return fields;
}
