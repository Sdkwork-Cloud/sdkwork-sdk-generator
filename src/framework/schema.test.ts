import { describe, expect, it } from 'vitest';

import {
  inferImplicitSchemaType,
  isNullSchema,
  normalizeSchemaTypeValue,
  pickComposedSchema,
  resolveMediaTypeSchema,
  resolveModelSchema,
  resolveSchemaReference,
  resolveSchemaType,
} from './schema.js';

describe('framework schema helpers', () => {
  it('normalizes OpenAPI 3.1 JSON Schema type arrays and null-only schemas', () => {
    expect(normalizeSchemaTypeValue(['null', 'string'])).toEqual({
      type: 'string',
      types: ['string'],
      nullable: true,
    });
    expect(normalizeSchemaTypeValue(['object', 'null'])).toEqual({
      type: 'object',
      types: ['object'],
      nullable: true,
    });
    expect(normalizeSchemaTypeValue('null')).toEqual({
      type: undefined,
      types: [],
      nullable: true,
    });
  });

  it('combines OpenAPI nullable with JSON Schema null types', () => {
    expect(resolveSchemaType({ type: 'integer', nullable: true })).toEqual({
      type: 'integer',
      effectiveType: 'integer',
      types: ['integer'],
      nullable: true,
    });
    expect(resolveSchemaType({ type: ['null', 'boolean'] })).toEqual({
      type: 'boolean',
      effectiveType: 'boolean',
      types: ['boolean'],
      nullable: true,
    });
  });

  it('infers object shape only from structural object keywords', () => {
    expect(inferImplicitSchemaType({ properties: { id: { type: 'string' } } })).toBe('object');
    expect(inferImplicitSchemaType({ additionalProperties: { type: 'string' } })).toBe('object');
    expect(inferImplicitSchemaType({ items: { type: 'string' } })).toBe('array');
    expect(inferImplicitSchemaType({ prefixItems: [{ type: 'string' }, { type: 'integer' }] })).toBe('array');
    expect(inferImplicitSchemaType({ pattern: '^a' })).toBeUndefined();
  });

  it('infers primitive JSON Schema const value types when type is omitted', () => {
    expect(resolveSchemaType({ const: 'ready' } as any).effectiveType).toBe('string');
    expect(resolveSchemaType({ const: 42 } as any).effectiveType).toBe('integer');
    expect(resolveSchemaType({ const: 3.14 } as any).effectiveType).toBe('number');
    expect(resolveSchemaType({ const: false } as any).effectiveType).toBe('boolean');
    expect(resolveSchemaType({ const: null } as any)).toMatchObject({
      effectiveType: undefined,
      nullable: true,
    });
  });

  it('identifies null schemas and skips null branches in composed schemas', () => {
    expect(isNullSchema({ type: 'null' })).toBe(true);
    expect(isNullSchema({ type: ['null'] })).toBe(true);
    expect(isNullSchema({ type: ['null', 'string'] })).toBe(false);

    expect(pickComposedSchema({ oneOf: [{ type: 'null' }, { type: 'string' }] })).toEqual({ type: 'string' });
    expect(pickComposedSchema({ anyOf: [{ type: ['null'] }, { type: 'integer' }] })).toEqual({ type: 'integer' });
    expect(pickComposedSchema({ allOf: [{ type: 'null' }, { $ref: '#/components/schemas/User' }] })).toEqual({
      $ref: '#/components/schemas/User',
    });
  });

  it('merges allOf object branches and referenced component properties for model generation', () => {
    const schemas = {
      BaseEntity: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      UserTraits: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
          displayName: { type: ['string', 'null'] },
        },
      },
    };

    const resolved = resolveModelSchema(
      {
        description: 'Composed user',
        allOf: [
          { type: 'null' },
          { $ref: '#/components/schemas/BaseEntity' },
          { $ref: '#/components/schemas/UserTraits' },
          {
            type: 'object',
            properties: {
              roles: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        ],
      },
      schemas
    );

    expect(resolved).toMatchObject({
      description: 'Composed user',
      type: 'object',
      required: ['id', 'email'],
      properties: {
        id: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        email: { type: 'string', format: 'email' },
        displayName: { type: ['string', 'null'] },
        roles: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    });
    expect(resolved.allOf).toBeUndefined();
  });

  it('normalizes OpenAPI 3.2 media type itemSchema as an array schema', () => {
    expect(
      resolveMediaTypeSchema({
        itemSchema: { $ref: '#/components/schemas/Event' },
      })
    ).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/Event' },
    });

    expect(
      resolveMediaTypeSchema({
        schema: { type: 'object' },
        itemSchema: { type: 'string' },
      })
    ).toEqual({ type: 'object' });
  });

  it('resolves local JSON Pointer schema references from the full document root', () => {
    const documentRoot = {
      $defs: {
        'Audit/Event': {
          type: 'object',
          properties: {
            action: { type: 'string' },
          },
        },
      },
      components: {
        schemas: {
          Envelope: {
            type: 'object',
            $defs: {
              Inner: {
                type: 'object',
                properties: {
                  value: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    };

    expect(resolveSchemaReference('#/$defs/Audit~1Event', {}, documentRoot)).toEqual({
      type: 'object',
      properties: {
        action: { type: 'string' },
      },
    });
    expect(resolveSchemaReference('#/components/schemas/Envelope/$defs/Inner', {}, documentRoot)).toEqual({
      type: 'object',
      properties: {
        value: { type: 'integer' },
      },
    });
  });
});
