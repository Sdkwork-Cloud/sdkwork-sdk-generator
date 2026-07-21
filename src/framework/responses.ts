import type { ApiOperation, ApiSchema } from './types.js';
import {
  getSchemaReferenceName,
  pickComposedSchema,
  resolveMediaTypeSchema,
  resolveSchemaType,
} from './schema.js';

export interface EventStreamResponseInfo {
  statusCode: string;
  mediaType: string;
  schema?: ApiSchema;
}

export interface BinaryResponseInfo {
  statusCode: string;
  mediaType: string;
  schema: ApiSchema;
}

export function isEventStreamMediaType(mediaType: string | undefined): boolean {
  if (!mediaType) {
    return false;
  }

  return mediaType.split(';', 1)[0].trim().toLowerCase() === 'text/event-stream';
}

export function extractEventStreamResponseInfo(
  operation: Pick<ApiOperation, 'responses'> | undefined,
): EventStreamResponseInfo | undefined {
  if (!operation?.responses || typeof operation.responses !== 'object') {
    return undefined;
  }

  for (const statusCode of getOrderedResponseStatusCodes(operation.responses)) {
    const response = operation.responses[statusCode];
    if (!response || typeof response !== 'object' || !('content' in response)) {
      continue;
    }

    const content = (response as { content?: Record<string, unknown> }).content;
    if (!content || typeof content !== 'object') {
      continue;
    }

    for (const mediaType of Object.keys(content)) {
      if (!isEventStreamMediaType(mediaType)) {
        continue;
      }

      return {
        statusCode,
        mediaType,
        schema: resolveMediaTypeSchema(content[mediaType]),
      };
    }
  }

  return undefined;
}

export function extractBinaryResponseInfo(
  operation: Pick<ApiOperation, 'responses'> | undefined,
  schemas: Record<string, ApiSchema> = {},
): BinaryResponseInfo | undefined {
  if (!operation?.responses || typeof operation.responses !== 'object') {
    return undefined;
  }

  for (const statusCode of getOrderedResponseStatusCodes(operation.responses)) {
    const response = operation.responses[statusCode];
    if (!response || typeof response !== 'object' || !('content' in response)) {
      continue;
    }
    const content = (response as { content?: Record<string, unknown> }).content;
    if (!content || typeof content !== 'object') {
      continue;
    }
    for (const [mediaType, media] of Object.entries(content)) {
      const schema = resolveMediaTypeSchema(media);
      if (schema && isBinarySchema(schema, schemas)) {
        return { statusCode, mediaType, schema };
      }
    }
  }

  return undefined;
}

function isBinarySchema(
  schema: ApiSchema,
  schemas: Record<string, ApiSchema>,
  seen: Set<string> = new Set<string>(),
): boolean {
  if (schema.$ref) {
    const refName = getSchemaReferenceName(schema.$ref);
    if (seen.has(refName)) {
      return false;
    }
    const referenced = schemas[refName];
    if (!referenced) {
      return false;
    }
    seen.add(refName);
    return isBinarySchema(referenced, schemas, seen);
  }

  const composed = pickComposedSchema(schema);
  if (composed) {
    return isBinarySchema(composed, schemas, seen);
  }

  return resolveSchemaType(schema).effectiveType === 'string'
    && schema.format === 'binary';
}

function getOrderedResponseStatusCodes(responses: Record<string, unknown>): string[] {
  const statusCodes = Object.keys(responses);
  const successCodes = statusCodes
    .filter((statusCode) => /^2\d\d$/.test(statusCode))
    .sort((left, right) => Number(left) - Number(right) || left.localeCompare(right));

  return statusCodes.includes('default')
    ? [...successCodes, 'default']
    : successCodes;
}
