import { describe, expect, it } from 'vitest';
import {
  requiresExplicitOpenApiParameterSerialization,
  resolveOpenApiParameterSerialization,
} from './parameter-serialization.js';

describe('OpenAPI parameter serialization metadata', () => {
  it('resolves OpenAPI 3.x defaults by parameter location', () => {
    expect(resolveOpenApiParameterSerialization({ name: 'id', in: 'path', schema: { type: 'string' } })).toEqual({
      style: 'simple',
      explode: false,
      allowReserved: false,
      contentType: undefined,
    });
    expect(resolveOpenApiParameterSerialization({ name: 'token', in: 'header', schema: { type: 'array' } })).toEqual({
      style: 'simple',
      explode: false,
      allowReserved: false,
      contentType: undefined,
    });
    expect(resolveOpenApiParameterSerialization({ name: 'session', in: 'cookie', schema: { type: 'object' } })).toEqual({
      style: 'form',
      explode: true,
      allowReserved: false,
      contentType: undefined,
    });
    expect(resolveOpenApiParameterSerialization({ name: 'q', in: 'query', allowReserved: true, schema: { type: 'string' } })).toEqual({
      style: 'form',
      explode: true,
      allowReserved: true,
      contentType: undefined,
    });
  });

  it('requires generated SDK helpers for path header cookie and query parameters', () => {
    expect(requiresExplicitOpenApiParameterSerialization({ name: 'id', in: 'path', schema: { type: 'string' } })).toBe(true);
    expect(requiresExplicitOpenApiParameterSerialization({ name: 'filters', in: 'header', style: 'simple', explode: true, schema: { type: 'object' } })).toBe(true);
    expect(requiresExplicitOpenApiParameterSerialization({ name: 'prefs', in: 'cookie', schema: { type: 'array' } })).toBe(true);
    expect(requiresExplicitOpenApiParameterSerialization({ name: 'q', in: 'query', schema: { type: 'string' } })).toBe(true);
  });

  it('ignores allowReserved outside query parameters and detects parameter content media types', () => {
    expect(resolveOpenApiParameterSerialization({
      name: 'X-Trace',
      in: 'header',
      allowReserved: true,
      content: {
        'application/json': {
          schema: { type: 'object' },
        },
      },
    })).toEqual({
      style: 'simple',
      explode: false,
      allowReserved: false,
      contentType: 'application/json',
    });
  });
});
