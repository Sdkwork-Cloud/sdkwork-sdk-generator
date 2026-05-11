import { resolveSchemaType } from './schema.js';

export interface OpenApiParameterSerialization {
  style: string;
  explode: boolean;
  allowReserved: boolean;
  contentType?: string;
}

export function resolveOpenApiParameterSerialization(parameter: any): OpenApiParameterSerialization {
  const style = resolveOpenApiParameterStyle(parameter);
  return {
    style,
    explode: resolveOpenApiParameterExplode(parameter, style),
    allowReserved: parameter?.in === 'query' ? Boolean(parameter?.allowReserved) : false,
    contentType: pickOpenApiParameterContentType(parameter),
  };
}

export function requiresExplicitOpenApiParameterSerialization(parameter: any): boolean {
  if (!parameter || typeof parameter !== 'object') {
    return false;
  }

  return parameter.in === 'path'
    || parameter.in === 'query'
    || parameter.in === 'header'
    || parameter.in === 'cookie'
    || parameter.in === 'querystring';
}

export function requiresExplicitOpenApiQuerySerialization(parameter: any): boolean {
  if (!parameter || typeof parameter !== 'object') {
    return false;
  }
  if (parameter.in === 'query') {
    return true;
  }
  if (parameter.content && typeof parameter.content === 'object') {
    return true;
  }
  if (parameter.allowReserved === true) {
    return true;
  }

  const serialization = resolveOpenApiParameterSerialization(parameter);
  if (serialization.style !== 'form' || !serialization.explode) {
    return true;
  }

  const schema = parameter.schema;
  const normalizedType = resolveSchemaType(schema).effectiveType;
  return normalizedType === 'array' || normalizedType === 'object'
    || Boolean(schema?.items)
    || Boolean(schema?.properties)
    || Boolean(schema?.additionalProperties);
}

export function pickOpenApiParameterContentType(parameter: any): string | undefined {
  const content = parameter?.content;
  if (!content || typeof content !== 'object') {
    return undefined;
  }

  const mediaTypes = Object.keys(content);
  if (mediaTypes.length === 0) {
    return undefined;
  }

  const jsonLike = mediaTypes.find((mediaType) => {
    const normalized = mediaType.toLowerCase();
    return normalized === 'application/json' || normalized.endsWith('+json');
  });
  return jsonLike || mediaTypes[0];
}

export function extractOpenApiParameterContentSchema(parameter: any): any | undefined {
  const mediaType = pickOpenApiParameterContentType(parameter);
  if (!mediaType) {
    return undefined;
  }

  const media = parameter?.content?.[mediaType];
  if (!media || typeof media !== 'object') {
    return undefined;
  }
  return media.schema;
}

function resolveOpenApiParameterStyle(parameter: any): string {
  if (typeof parameter?.style === 'string' && parameter.style.trim()) {
    return parameter.style.trim();
  }
  if (parameter?.in === 'path') {
    return 'simple';
  }
  if (parameter?.in === 'query' || parameter?.in === 'cookie') {
    return 'form';
  }
  if (parameter?.in === 'header') {
    return 'simple';
  }
  return 'form';
}

function resolveOpenApiParameterExplode(parameter: any, style: string): boolean {
  if (typeof parameter?.explode === 'boolean') {
    return parameter.explode;
  }
  return style === 'form';
}
