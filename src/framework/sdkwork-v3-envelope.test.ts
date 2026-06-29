import { describe, expect, it } from 'vitest';
import {
  analyzeEnvelopeSchema,
  resolveSdkworkV3ConsumerSchema,
  validateSdkworkV3Envelope,
} from './sdkwork-v3-envelope.js';
import {
  SDKWORK_V3_TEST_ENVELOPE_SCHEMAS,
  typedSdkWorkResourceResponse,
} from './sdkwork-v3-envelope-fixtures.js';

describe('sdkwork-v3 envelope helpers', () => {
  const schemas = {
    ...SDKWORK_V3_TEST_ENVELOPE_SCHEMAS,
    AuthSession: {
      type: 'object',
      properties: {
        authToken: { type: 'string' },
      },
    },
    AuthSessionResponse: typedSdkWorkResourceResponse('#/components/schemas/AuthSession'),
  };

  it('detects typed resource envelopes', () => {
    const plan = analyzeEnvelopeSchema(
      { $ref: '#/components/schemas/AuthSessionResponse' },
      schemas,
    );
    expect(plan.hasEnvelope).toBe(true);
    expect(plan.unwrapKind).toBe('item');
  });

  it('resolves consumer schema to the typed item payload', () => {
    const resolved = resolveSdkworkV3ConsumerSchema(
      { $ref: '#/components/schemas/AuthSessionResponse' },
      schemas,
    );
    expect(resolved.plan.unwrapKind).toBe('item');
    expect(resolved.consumerSchema).toEqual({ $ref: '#/components/schemas/AuthSession' });
  });

  it('resolves consumer schema to typed page payload refs', () => {
    const pageSchemas = {
      ...SDKWORK_V3_TEST_ENVELOPE_SCHEMAS,
      EventRecord: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      EventsPageData: {
        type: 'object',
        additionalProperties: false,
        required: ['items', 'pageInfo'],
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/EventRecord' } },
          pageInfo: { $ref: '#/components/schemas/PageInfo' },
        },
      },
      EventsListResponse: {
        allOf: [
          { $ref: '#/components/schemas/SdkWorkApiResponse' },
          {
            type: 'object',
            required: ['data'],
            properties: {
              data: { $ref: '#/components/schemas/EventsPageData' },
            },
          },
        ],
      },
    };
    const resolved = resolveSdkworkV3ConsumerSchema(
      { $ref: '#/components/schemas/EventsListResponse' },
      pageSchemas,
    );
    expect(resolved.plan.unwrapKind).toBe('page');
    expect(resolved.consumerSchema).toEqual({ $ref: '#/components/schemas/EventsPageData' });
  });

  it('rejects legacy AppbaseApiResult envelopes', () => {
    const issues = validateSdkworkV3Envelope({
      openapi: '3.1.0',
      info: { title: 't', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          ...SDKWORK_V3_TEST_ENVELOPE_SCHEMAS,
          AppbaseApiResult: { type: 'object' },
        },
      },
    });
    expect(issues.some((issue) => issue.includes('AppbaseApiResult'))).toBe(true);
  });

  it('skips success envelope checks for custom open-api SDKs', () => {
    const issues = validateSdkworkV3Envelope(
      {
        openapi: '3.1.0',
        info: { title: 't', version: '1.0.0' },
        paths: {
          '/image/v3/api/compat/openai/images/generations': {
            post: {
              operationId: 'compat.openai.images.generate',
              tags: ['imageCompat'],
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: { type: 'object', additionalProperties: true },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            ProblemDetail: SDKWORK_V3_TEST_ENVELOPE_SCHEMAS.ProblemDetail,
          },
        },
      },
      { sdkType: 'custom' },
    );
    expect(issues.some((issue) => issue.includes('must use SdkWorkApiResponse envelope'))).toBe(false);
  });
});
