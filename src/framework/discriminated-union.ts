import type { ApiSchema } from './types.js';
import { getConstSchemaInfo, getSchemaReferenceName, resolveModelSchema } from './schema.js';

export interface DiscriminatedUnionVariant {
  discriminatorValue: string;
  schemaName: string;
  modelName: string;
}

export interface DiscriminatedUnionModel {
  discriminatorProperty: string;
  variants: DiscriminatedUnionVariant[];
}

export function resolveDiscriminatedUnionModel(
  schema: ApiSchema | undefined,
  schemas: Record<string, ApiSchema>,
  naming: (schemaName: string) => string,
  knownModels: Set<string>,
  options: { defaultDiscriminatorProperty?: string } = {},
): DiscriminatedUnionModel | undefined {
  if (!schema || typeof schema !== 'object' || !Array.isArray(schema.oneOf) || schema.oneOf.length === 0) {
    return undefined;
  }

  const discriminatorProperty = typeof (schema as any).discriminator?.propertyName === 'string'
    ? (schema as any).discriminator.propertyName
    : (options.defaultDiscriminatorProperty || 'kind');
  const variants: DiscriminatedUnionVariant[] = [];

  for (const entry of schema.oneOf) {
    if (!entry || typeof entry !== 'object' || typeof entry.$ref !== 'string') {
      return undefined;
    }

    const schemaName = getSchemaReferenceName(entry.$ref);
    const modelName = naming(schemaName);
    if (!knownModels.has(modelName)) {
      return undefined;
    }

    const variantSchema = resolveModelSchema(schemas[schemaName], schemas);
    const discriminatorValue = resolveDiscriminatorValue(variantSchema, discriminatorProperty);
    if (!discriminatorValue) {
      return undefined;
    }

    variants.push({
      discriminatorValue,
      schemaName,
      modelName,
    });
  }

  return variants.length > 0
    ? { discriminatorProperty, variants }
    : undefined;
}

export function resolveDiscriminatorValue(
  schema: ApiSchema | undefined,
  discriminatorProperty: string,
): string | undefined {
  const propertySchema = schema?.properties?.[discriminatorProperty];
  if (!propertySchema || typeof propertySchema !== 'object') {
    return undefined;
  }

  const constInfo = getConstSchemaInfo(propertySchema);
  if (constInfo?.value != null) {
    return String(constInfo.value);
  }
  if (Array.isArray(propertySchema.enum) && propertySchema.enum.length === 1 && propertySchema.enum[0] != null) {
    return String(propertySchema.enum[0]);
  }
  return undefined;
}
