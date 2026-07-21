import { describe, expect, it } from 'vitest';

import type { ApiOperation } from './types.js';
import {
  extractBinaryResponseInfo,
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

  it('detects direct and referenced binary success schemas', () => {
    const direct: ApiOperation = {
      responses: {
        '200': {
          description: 'Binary content',
          content: {
            'application/octet-stream': {
              schema: { type: 'string', format: 'binary' },
            },
          },
        },
      },
    };
    expect(extractBinaryResponseInfo(direct)).toEqual({
      mediaType: 'application/octet-stream',
      schema: { type: 'string', format: 'binary' },
      statusCode: '200',
    });

    const referenced: ApiOperation = {
      responses: {
        '206': {
          description: 'Partial content',
          content: {
            'application/octet-stream': {
              schema: { $ref: '#/components/schemas/BinaryContent' },
            },
          },
        },
      },
    };
    expect(extractBinaryResponseInfo(referenced, {
      BinaryContent: { type: 'string', format: 'binary' },
    })).toEqual({
      mediaType: 'application/octet-stream',
      schema: { $ref: '#/components/schemas/BinaryContent' },
      statusCode: '206',
    });
  });

  it('does not classify ordinary string responses as binary', () => {
    const operation: ApiOperation = {
      responses: {
        '200': {
          description: 'Text content',
          content: {
            'text/plain': {
              schema: { type: 'string' },
            },
          },
        },
      },
    };
    expect(extractBinaryResponseInfo(operation)).toBeUndefined();
  });
});
