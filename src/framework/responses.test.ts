import { describe, expect, it } from 'vitest';

import type { ApiOperation } from './types.js';
import {
  extractEventStreamResponseInfo,
  isEventStreamMediaType,
} from './responses.js';

describe('framework response helpers', () => {
  it('detects OpenAPI SSE responses and extracts the streamed event schema', () => {
    const operation: ApiOperation = {
      operationId: 'createChatCompletion',
      responses: {
        '200': {
          description: 'Streaming chunks',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ChatCompletion' },
            },
            'text/event-stream; charset=utf-8': {
              schema: { $ref: '#/components/schemas/ChatCompletionChunk' },
            },
          },
        },
      },
    };

    expect(isEventStreamMediaType('text/event-stream; charset=utf-8')).toBe(true);
    expect(extractEventStreamResponseInfo(operation)).toEqual({
      mediaType: 'text/event-stream; charset=utf-8',
      schema: { $ref: '#/components/schemas/ChatCompletionChunk' },
      statusCode: '200',
    });
  });

  it('prefers explicit 2xx SSE responses over default responses', () => {
    const operation: ApiOperation = {
      responses: {
        default: {
          description: 'Default streaming fallback',
          content: {
            'text/event-stream': {
              schema: { $ref: '#/components/schemas/DefaultEvent' },
            },
          },
        },
        '206': {
          description: 'Partial streaming response',
          content: {
            'text/event-stream': {
              schema: { $ref: '#/components/schemas/PartialEvent' },
            },
          },
        },
      },
    };

    expect(extractEventStreamResponseInfo(operation)).toEqual({
      mediaType: 'text/event-stream',
      schema: { $ref: '#/components/schemas/PartialEvent' },
      statusCode: '206',
    });
  });
});
