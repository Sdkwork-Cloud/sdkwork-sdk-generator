import type { ApiOperation, ApiSchema } from './types.js';
import { resolveMediaTypeSchema } from './schema.js';

export interface EventStreamResponseInfo {
  statusCode: string;
  mediaType: string;
  schema?: ApiSchema;
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

function getOrderedResponseStatusCodes(responses: Record<string, unknown>): string[] {
  const statusCodes = Object.keys(responses);
  const successCodes = statusCodes
    .filter((statusCode) => /^2\d\d$/.test(statusCode))
    .sort((left, right) => Number(left) - Number(right) || left.localeCompare(right));

  return statusCodes.includes('default')
    ? [...successCodes, 'default']
    : successCodes;
}
