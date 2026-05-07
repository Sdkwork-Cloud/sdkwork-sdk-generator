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
] as const;

export const OPENAPI_FIXED_HTTP_METHOD_SET = new Set<string>(OPENAPI_FIXED_HTTP_METHODS);

const PATH_ITEM_METADATA_FIELDS = new Set([
  '$ref',
  'summary',
  'description',
  'servers',
  'parameters',
  'additionalOperations',
]);

export function isOpenApiFixedHttpMethod(method: string): boolean {
  return OPENAPI_FIXED_HTTP_METHOD_SET.has(method.toLowerCase());
}

export function isOpenApiPathItemMetadataField(field: string): boolean {
  return PATH_ITEM_METADATA_FIELDS.has(field);
}

export function isOpenApiOperationLike(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeOpenApiAdditionalMethod(method: string): string {
  return String(method || '').trim().toLowerCase();
}

export function toHttpMethodLiteral(method: string): string {
  return String(method || '').trim();
}

export function supportsRequestBodyByDefault(method: string): boolean {
  const normalized = method.toLowerCase();
  return normalized === 'post'
    || normalized === 'put'
    || normalized === 'patch'
    || normalized === 'query';
}

export function normalizeOpenApiPathItemOperations(
  pathItem: Record<string, any>,
): Array<{ method: string; httpMethod: string; operation: Record<string, any> }> {
  const operations: Array<{ method: string; httpMethod: string; operation: Record<string, any> }> = [];

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
    for (const [method, value] of Object.entries(additionalOperations as Record<string, unknown>)) {
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

export function findUnexpectedPathItemOperationFields(pathItem: Record<string, any>): string[] {
  const fields: string[] = [];
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
