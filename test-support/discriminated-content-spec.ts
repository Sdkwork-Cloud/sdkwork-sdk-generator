import type { ApiSpec } from '../src/framework/types.js';

export const discriminatedContentSpec: ApiSpec = {
  openapi: '3.1.2',
  info: { title: 'Discriminated Content API', version: '1.0.0' },
  paths: {
    '/app/v3/api/messages': {
      post: {
        summary: 'Create message',
        operationId: 'messages.create',
        tags: ['chat'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  parts: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/ContentPart' },
                  },
                },
              },
            },
          },
        },
        responses: { '204': { description: 'No content' } },
      },
    },
  },
  components: {
    schemas: {
      ContentPart: {
        discriminator: { propertyName: 'kind' } as any,
        oneOf: [
          { $ref: '#/components/schemas/TextContentPart' },
          { $ref: '#/components/schemas/DataContentPart' },
          { $ref: '#/components/schemas/MediaContentPart' },
          { $ref: '#/components/schemas/SignalContentPart' },
          { $ref: '#/components/schemas/StreamRefContentPart' },
        ],
      },
      TextContentPart: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'text'],
        properties: {
          kind: { type: 'string', enum: ['text'] },
          text: { type: 'string' },
        },
      },
      DataContentPart: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'schemaRef', 'encoding', 'payload'],
        properties: {
          kind: { type: 'string', enum: ['data'] },
          schemaRef: { type: 'string' },
          encoding: { type: 'string' },
          payload: { type: 'string' },
        },
      },
      MediaContentPart: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'drive', 'resource'],
        properties: {
          kind: { type: 'string', enum: ['media'] },
          drive: { $ref: '#/components/schemas/DriveReference' },
          resource: { $ref: '#/components/schemas/MediaResource' },
          mediaRole: { type: 'string' },
        },
      },
      SignalContentPart: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'signalType', 'payload'],
        properties: {
          kind: { type: 'string', enum: ['signal'] },
          signalType: { type: 'string' },
          schemaRef: { type: 'string' },
          payload: { type: 'string' },
        },
      },
      StreamRefContentPart: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'streamId', 'streamType', 'state'],
        properties: {
          kind: { type: 'string', enum: ['stream_ref'] },
          streamId: { type: 'string' },
          streamType: { type: 'string' },
          state: { type: 'string' },
        },
      },
      DriveReference: {
        type: 'object',
        required: ['driveUri', 'spaceId', 'nodeId'],
        properties: {
          driveUri: { type: 'string' },
          spaceId: { type: 'string' },
          nodeId: { type: 'string' },
        },
      },
      MediaResource: {
        type: 'object',
        required: ['uri'],
        properties: {
          uri: { type: 'string' },
          kind: { type: 'string' },
        },
      },
    },
  },
};
