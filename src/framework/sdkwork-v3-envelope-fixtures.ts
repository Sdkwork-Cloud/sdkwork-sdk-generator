/** Minimal SdkWorkApiResponse component schemas for sdkwork-v3 generator tests. */

export const SDKWORK_V3_TEST_ENVELOPE_SCHEMAS = {
  SdkWorkApiResponse: {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'data', 'traceId'],
    properties: {
      code: { type: 'integer', format: 'int32', enum: [0] },
      data: { description: 'Operation-specific payload.' },
      traceId: { type: 'string', format: 'uuid' },
    },
  },
  SdkWorkResourceData: {
    type: 'object',
    additionalProperties: false,
    required: ['item'],
    properties: {
      item: { type: 'object', additionalProperties: true },
    },
  },
  SdkWorkPageData: {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'pageInfo'],
    properties: {
      items: { type: 'array', items: { type: 'object', additionalProperties: true } },
      pageInfo: { $ref: '#/components/schemas/PageInfo' },
    },
  },
  SdkWorkCommandData: {
    type: 'object',
    additionalProperties: false,
    required: ['accepted'],
    properties: {
      accepted: { type: 'boolean', const: true },
      resourceId: { type: 'string' },
      status: { type: 'string' },
    },
  },
  PageInfo: {
    type: 'object',
    additionalProperties: false,
    required: ['mode'],
    properties: {
      mode: { type: 'string', enum: ['offset', 'cursor'] },
    },
  },
  SdkWorkResourceResponse: {
    allOf: [
      { $ref: '#/components/schemas/SdkWorkApiResponse' },
      {
        type: 'object',
        required: ['data'],
        properties: {
          data: { $ref: '#/components/schemas/SdkWorkResourceData' },
        },
      },
    ],
  },
  SdkWorkListResponse: {
    allOf: [
      { $ref: '#/components/schemas/SdkWorkApiResponse' },
      {
        type: 'object',
        required: ['data'],
        properties: {
          data: { $ref: '#/components/schemas/SdkWorkPageData' },
        },
      },
    ],
  },
  SdkWorkCommandResponse: {
    allOf: [
      { $ref: '#/components/schemas/SdkWorkApiResponse' },
      {
        type: 'object',
        required: ['data'],
        properties: {
          data: { $ref: '#/components/schemas/SdkWorkCommandData' },
        },
      },
    ],
  },
  ProblemDetail: {
    type: 'object',
    additionalProperties: true,
    required: ['type', 'title', 'status', 'code', 'traceId'],
    properties: {
      type: { type: 'string', format: 'uri-reference' },
      title: { type: 'string' },
      status: { type: 'integer', minimum: 100, maximum: 599 },
      detail: { type: 'string' },
      instance: { type: 'string' },
      code: { type: 'integer', format: 'int32', minimum: 40001, maximum: 79999 },
      traceId: { type: 'string', format: 'uuid' },
    },
  },
} as const;

export function typedSdkWorkResourceResponse(itemRef: string) {
  return {
    allOf: [
      { $ref: '#/components/schemas/SdkWorkApiResponse' },
      {
        type: 'object',
        required: ['data'],
        properties: {
          data: {
            type: 'object',
            required: ['item'],
            properties: {
              item: { $ref: itemRef },
            },
          },
        },
      },
    ],
  };
}
