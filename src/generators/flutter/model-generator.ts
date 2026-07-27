import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { getConstSchemaInfo, getSchemaReferenceName, pickComposedSchema, resolveModelSchema, schemaAllowsNull } from '../../framework/schema.js';
import { FLUTTER_CONFIG, getFlutterType } from './config.js';

export class ModelGenerator {
  generate(ctx: SchemaContext, _config: GeneratorConfig): GeneratedFile[] {
    const unionBaseByVariant = this.collectUnionBaseByVariant(ctx.schemas);
    const modelClasses = Object.entries(ctx.schemas).map(([name, schema]) => this.generateClass(name, schema, ctx.schemas, unionBaseByVariant));
    const runtimeHelpers = this.generateRuntimeHelpers({
      map: modelClasses.some((model) => model.includes('_sdkworkAsMap')),
      list: modelClasses.some((model) => model.includes('_sdkworkAsList')),
    });
    const models: string[] = [
      ...(runtimeHelpers ? [runtimeHelpers] : []),
      ...modelClasses,
    ];

    return [{
      path: 'lib/src/models.dart',
      content: this.format(`${models.join('\n\n')}\n`),
      language: 'flutter',
      description: 'Data models',
    }];
  }

  private generateRuntimeHelpers(helpers: { map: boolean; list: boolean }): string {
    const blocks: string[] = [];
    if (helpers.map) {
      blocks.push(`Map<String, dynamic>? _sdkworkAsMap(dynamic value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  return null;
}`);
    }
    if (helpers.list) {
      blocks.push(`List<dynamic>? _sdkworkAsList(dynamic value) {
  return value is List ? value : null;
}`);
    }
    return blocks.join('\n\n');
  }

  private generateClass(
    name: string,
    schema: any,
    schemas: SchemaContext['schemas'],
    unionBaseByVariant: Map<string, string>,
  ): string {
    const unionDeclaration = this.generateOneOfClass(name, schema, schemas);
    if (unionDeclaration) {
      return unionDeclaration;
    }

    const modelSchema = resolveModelSchema(schema, schemas);
    const className = FLUTTER_CONFIG.namingConventions.modelName(name);
    const implementsBase = unionBaseByVariant.get(className);
    const implementsClause = implementsBase ? ` implements ${implementsBase}` : '';
    const props = modelSchema.properties || {};
    const propEntries = Object.entries(props) as Array<[string, any]>;
    const required = Array.isArray(modelSchema.required) ? modelSchema.required : [];

    const fields = propEntries.map(([propName, propSchema]) => {
      const fieldName = FLUTTER_CONFIG.namingConventions.propertyName(propName);
      const fieldType = getFlutterType(propSchema, FLUTTER_CONFIG);
      const nullableType = this.renderFlutterFieldType(
        fieldType,
        required.includes(propName),
        schemaAllowsNull(propSchema),
      );
      return `  final ${nullableType} ${fieldName};`;
    }).join('\n');

    const constructor = propEntries.length === 0
      ? `  ${className}();`
      : `  ${className}({
${propEntries.map(([propName]) => {
  const fieldName = FLUTTER_CONFIG.namingConventions.propertyName(propName);
  const requiredPrefix = required.includes(propName) ? 'required ' : '';
  return `    ${requiredPrefix}this.${fieldName}`;
}).join(',\n')}
  });`;

    const fromJson = propEntries.length === 0
      ? `  factory ${className}.fromJson(Map<String, dynamic> json) {
    return ${className}();
  }`
      : `  factory ${className}.fromJson(Map<String, dynamic> json) {
    return ${className}(
${propEntries.map(([propName, propSchema]) => {
  const fieldName = FLUTTER_CONFIG.namingConventions.propertyName(propName);
  return `      ${fieldName}: ${this.deserializeExpression(propSchema, `json['${propName}']`, className, {
        required: required.includes(propName),
        nullable: schemaAllowsNull(propSchema),
        presenceExpr: `json.containsKey('${this.escapeSingleQuoted(propName)}')`,
        ownerName: className,
        jsonName: propName,
      })}`;
}).join(',\n')}
    );
  }`;

    const toJsonBody = propEntries.length === 0
      ? '    return <String, dynamic>{};'
      : `    return <String, dynamic>{
${propEntries.map(([propName, propSchema]) => {
  const fieldName = FLUTTER_CONFIG.namingConventions.propertyName(propName);
  const nonNullRequired = required.includes(propName) && !schemaAllowsNull(propSchema);
  return `      '${propName}': ${this.serializeExpression(propSchema, fieldName, className, nonNullRequired)},`;
}).join('\n')}
    };`;

    return `class ${className}${implementsClause} {
${fields}

${constructor}

${fromJson}

  Map<String, dynamic> toJson() {
${toJsonBody}
  }
}`;
  }

  private deserializeExpression(
    schema: any,
    valueExpr: string,
    currentModelName: string,
    options: {
      required?: boolean;
      nullable?: boolean;
      presenceExpr?: string;
      ownerName?: string;
      jsonName?: string;
    } = {},
  ): string {
    if (!schema || typeof schema !== 'object') {
      return valueExpr;
    }

    if (options.required && options.nullable) {
      const nonNullExpression = this.deserializeExpression(schema, '_sdkworkRequiredValue', currentModelName, {
        ...options,
        nullable: false,
        presenceExpr: undefined,
      });
      return `(() {
        if (!${options.presenceExpr || 'false'}) {
          throw FormatException('${this.escapeSingleQuoted(this.requiredFieldLabel(options))} is required');
        }
        final _sdkworkRequiredValue = ${valueExpr};
        if (_sdkworkRequiredValue == null) {
          return null;
        }
        return ${nonNullExpression};
      })()`;
    }

    const normalizedSchema = this.normalizeDeserializationSchema(schema);
    if (normalizedSchema !== schema) {
      return this.deserializeExpression(normalizedSchema, valueExpr, currentModelName, options);
    }

    if (schema.$ref) {
      const refName = FLUTTER_CONFIG.namingConventions.modelName(getSchemaReferenceName(schema.$ref) || 'Model');
      const refTarget = refName === currentModelName ? currentModelName : refName;
      if (options.required) {
        return `(() {
        final map = _sdkworkAsMap(${valueExpr});
        if (map == null) {
          throw FormatException('${this.escapeSingleQuoted(this.requiredFieldLabel(options))} is required');
        }
        return ${refTarget}.fromJson(map);
      })()`;
      }
      return `(() {
        final map = _sdkworkAsMap(${valueExpr});
        return map == null ? null : ${refTarget}.fromJson(map);
      })()`;
    }

    if (Array.isArray(schema.prefixItems)) {
      if (options.required) {
        return `(() {
        final list = _sdkworkAsList(${valueExpr});
        if (list == null) {
          throw FormatException('${this.escapeSingleQuoted(this.requiredFieldLabel(options))} is required');
        }
        return list;
      })()`;
      }
      return `_sdkworkAsList(${valueExpr})`;
    }

    if (schema.items && typeof schema.items === 'object') {
      const itemType = getFlutterType(schema.items, FLUTTER_CONFIG);
      const itemExpr = this.deserializeArrayItemExpression(schema.items, 'item', currentModelName);
      if (options.required) {
        return `(() {
        final list = _sdkworkAsList(${valueExpr});
        if (list == null) {
          throw FormatException('${this.escapeSingleQuoted(this.requiredFieldLabel(options))} is required');
        }
        return list
            .map((item) => ${itemExpr})
            .whereType<${itemType}>()
            .toList();
      })()`;
      }
      return `(() {
        final list = _sdkworkAsList(${valueExpr});
        if (list == null) {
          return null;
        }
        return list
            .map((item) => ${itemExpr})
            .whereType<${itemType}>()
            .toList();
      })()`;
    }

    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const valueType = this.resolveMapValueType(schema.additionalProperties, currentModelName);
      const itemExpr = this.deserializeArrayItemExpression(schema.additionalProperties, 'item', currentModelName);
      const assignment = valueType === 'dynamic'
        ? '          result[key] = deserialized;'
        : `          if (deserialized is ${valueType}) {
            result[key] = deserialized;
          }`;
      if (options.required) {
        return `(() {
        final map = _sdkworkAsMap(${valueExpr});
        if (map == null) {
          throw FormatException('${this.escapeSingleQuoted(this.requiredFieldLabel(options))} is required');
        }
        final result = <String, ${valueType}>{};
        map.forEach((key, item) {
          final deserialized = ${itemExpr};
${assignment}
        });
        return result;
      })()`;
      }
      return `(() {
        final map = _sdkworkAsMap(${valueExpr});
        if (map == null) {
          return null;
        }
        final result = <String, ${valueType}>{};
        map.forEach((key, item) {
          final deserialized = ${itemExpr};
${assignment}
        });
        return result;
      })()`;
    }

    const baseType = getFlutterType(schema, FLUTTER_CONFIG);
    if (baseType === 'String') {
      if (options.required) {
        return `(() {
        final value = ${valueExpr}?.toString();
        if (value == null) {
          throw FormatException('${this.escapeSingleQuoted(this.requiredFieldLabel(options))} is required');
        }
        return value;
      })()`;
      }
      return `${valueExpr}?.toString()`;
    }
    if (baseType === 'int') {
      if (options.required) {
        return `(() {
        final value = ${valueExpr};
        if (value is! int) {
          throw FormatException('${this.escapeSingleQuoted(this.requiredFieldLabel(options))} is required');
        }
        return value;
      })()`;
      }
      return `${valueExpr} is int ? ${valueExpr} : null`;
    }
    if (baseType === 'double') {
      if (options.required) {
        return `(() {
        final value = ${valueExpr};
        if (value is! num) {
          throw FormatException('${this.escapeSingleQuoted(this.requiredFieldLabel(options))} is required');
        }
        return value.toDouble();
      })()`;
      }
      return `${valueExpr} is num ? ${valueExpr}.toDouble() : null`;
    }
    if (baseType === 'bool') {
      if (options.required) {
        return `(() {
        final value = ${valueExpr};
        if (value is! bool) {
          throw FormatException('${this.escapeSingleQuoted(this.requiredFieldLabel(options))} is required');
        }
        return value;
      })()`;
      }
      return `${valueExpr} is bool ? ${valueExpr} : null`;
    }
    if (baseType.startsWith('Map<')) {
      if (options.required) {
        return `(() {
        final map = _sdkworkAsMap(${valueExpr});
        if (map == null) {
          throw FormatException('${this.escapeSingleQuoted(this.requiredFieldLabel(options))} is required');
        }
        return map;
      })()`;
      }
      return `_sdkworkAsMap(${valueExpr})`;
    }

    return valueExpr;
  }

  private deserializeArrayItemExpression(schema: any, itemExpr: string, currentModelName: string): string {
    const normalizedSchema = this.normalizeDeserializationSchema(schema);
    if (normalizedSchema !== schema) {
      return this.deserializeArrayItemExpression(normalizedSchema, itemExpr, currentModelName);
    }

    if (schema?.$ref) {
      const refName = FLUTTER_CONFIG.namingConventions.modelName(getSchemaReferenceName(schema.$ref) || 'Model');
      const refTarget = refName === currentModelName ? currentModelName : refName;
      return `(() {
        final map = _sdkworkAsMap(${itemExpr});
        return map == null ? null : ${refTarget}.fromJson(map);
      })()`;
    }

    if (Array.isArray(schema?.prefixItems)) {
      return `_sdkworkAsList(${itemExpr})`;
    }

    if (schema?.items && typeof schema.items === 'object') {
      const nestedType = getFlutterType(schema.items, FLUTTER_CONFIG);
      const nestedExpr = this.deserializeArrayItemExpression(schema.items, 'nestedItem', currentModelName);
      return `(() {
        final list = _sdkworkAsList(${itemExpr});
        if (list == null) {
          return null;
        }
        return list
            .map((nestedItem) => ${nestedExpr})
            .whereType<${nestedType}>()
            .toList();
      })()`;
    }

    if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
      const mapValueType = this.resolveMapValueType(schema.additionalProperties, currentModelName);
      const nestedExpr = this.deserializeArrayItemExpression(schema.additionalProperties, 'nestedItem', currentModelName);
      const assignment = mapValueType === 'dynamic'
        ? '          result[key] = deserialized;'
        : `          if (deserialized is ${mapValueType}) {
            result[key] = deserialized;
          }`;
      return `(() {
        final map = _sdkworkAsMap(${itemExpr});
        if (map == null) {
          return null;
        }
        final result = <String, ${mapValueType}>{};
        map.forEach((key, nestedItem) {
          final deserialized = ${nestedExpr};
${assignment}
        });
        return result;
      })()`;
    }

    const baseType = getFlutterType(schema, FLUTTER_CONFIG);
    if (baseType === 'String') {
      return `${itemExpr}?.toString()`;
    }
    if (baseType === 'int') {
      return `${itemExpr} is int ? ${itemExpr} : null`;
    }
    if (baseType === 'double') {
      return `${itemExpr} is num ? ${itemExpr}.toDouble() : null`;
    }
    if (baseType === 'bool') {
      return `${itemExpr} is bool ? ${itemExpr} : null`;
    }
    if (baseType.startsWith('Map<')) {
      return `_sdkworkAsMap(${itemExpr})`;
    }

    return itemExpr;
  }

  private serializeExpression(schema: any, valueExpr: string, currentModelName: string, required = false): string {
    if (!schema || typeof schema !== 'object') {
      return valueExpr;
    }

    const normalizedSchema = this.normalizeDeserializationSchema(schema);
    if (normalizedSchema !== schema) {
      return this.serializeExpression(normalizedSchema, valueExpr, currentModelName, required);
    }

    if (schema.$ref) {
      return required ? `${valueExpr}.toJson()` : `${valueExpr}?.toJson()`;
    }

    if (Array.isArray(schema.prefixItems)) {
      return valueExpr;
    }

    if (schema.items && typeof schema.items === 'object') {
      const itemExpr = this.serializeArrayItemExpression(schema.items, 'item', currentModelName);
      return required ? `${valueExpr}.map((item) => ${itemExpr}).toList()` : `${valueExpr}?.map((item) => ${itemExpr}).toList()`;
    }

    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const itemExpr = this.serializeArrayItemExpression(schema.additionalProperties, 'item', currentModelName);
      return required ? `${valueExpr}.map((key, item) => MapEntry(key, ${itemExpr}))` : `${valueExpr}?.map((key, item) => MapEntry(key, ${itemExpr}))`;
    }

    return valueExpr;
  }

  private serializeArrayItemExpression(schema: any, itemExpr: string, currentModelName: string): string {
    const normalizedSchema = this.normalizeDeserializationSchema(schema);
    if (normalizedSchema !== schema) {
      return this.serializeArrayItemExpression(normalizedSchema, itemExpr, currentModelName);
    }

    if (schema?.$ref) {
      return `${itemExpr}.toJson()`;
    }

    if (Array.isArray(schema?.prefixItems)) {
      return itemExpr;
    }

    if (schema?.items && typeof schema.items === 'object') {
      const nestedExpr = this.serializeArrayItemExpression(schema.items, 'nestedItem', currentModelName);
      return `${itemExpr}.map((nestedItem) => ${nestedExpr}).toList()`;
    }

    if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
      const nestedExpr = this.serializeArrayItemExpression(schema.additionalProperties, 'nestedItem', currentModelName);
      return `${itemExpr}.map((key, nestedItem) => MapEntry(key, ${nestedExpr}))`;
    }

    return itemExpr;
  }

  private resolveMapValueType(schema: any, currentModelName: string): string {
    const normalizedSchema = this.normalizeDeserializationSchema(schema);
    if (normalizedSchema !== schema) {
      return this.resolveMapValueType(normalizedSchema, currentModelName);
    }

    if (schema?.$ref) {
      const refName = FLUTTER_CONFIG.namingConventions.modelName(getSchemaReferenceName(schema.$ref) || 'Model');
      return refName === currentModelName ? currentModelName : refName;
    }
    return getFlutterType(schema, FLUTTER_CONFIG);
  }

  private collectUnionBaseByVariant(schemas: SchemaContext['schemas']): Map<string, string> {
    const unionBaseByVariant = new Map<string, string>();
    for (const [name, schema] of Object.entries(schemas)) {
      if (!schema || typeof schema !== 'object' || !Array.isArray(schema.oneOf) || schema.oneOf.length === 0) {
        continue;
      }
      const baseName = FLUTTER_CONFIG.namingConventions.modelName(name);
      for (const entry of schema.oneOf) {
        const variantName = this.resolveVariantClassName(entry);
        if (variantName && !unionBaseByVariant.has(variantName)) {
          unionBaseByVariant.set(variantName, baseName);
        }
      }
    }
    return unionBaseByVariant;
  }

  private generateOneOfClass(
    name: string,
    schema: any,
    schemas: SchemaContext['schemas'],
  ): string | undefined {
    if (!schema || typeof schema !== 'object' || !Array.isArray(schema.oneOf) || schema.oneOf.length === 0) {
      return undefined;
    }

    const className = FLUTTER_CONFIG.namingConventions.modelName(name);
    const variantNames: string[] = schema.oneOf
      .map((entry: any) => this.resolveVariantClassName(entry))
      .filter((entry: string | undefined): entry is string => Boolean(entry));
    if (variantNames.length !== schema.oneOf.length || variantNames.length === 0) {
      return undefined;
    }

    const discriminatorProperty = typeof schema.discriminator?.propertyName === 'string'
      ? schema.discriminator.propertyName
      : 'kind';
    const cases = variantNames
      .map((variantName: string) => {
        const variantSchema = this.resolveSchemaByModelName(variantName, schemas);
        const discriminatorValue = variantSchema
          ? this.resolveDiscriminatorValue(variantSchema, discriminatorProperty)
          : undefined;
        if (!discriminatorValue) {
          return undefined;
        }
        return `      case '${this.escapeSingleQuoted(discriminatorValue)}':
        return ${variantName}.fromJson(json);`;
      })
      .filter((entry: string | undefined): entry is string => Boolean(entry));
    if (cases.length !== variantNames.length) {
      return undefined;
    }

    return `abstract class ${className} {
  const ${className}();

  factory ${className}.fromJson(Map<String, dynamic> json) {
    switch (json['${this.escapeSingleQuoted(discriminatorProperty)}']?.toString()) {
${cases.join('\n')}
      default:
        return Unknown${className}(json);
    }
  }

  Map<String, dynamic> toJson();
}

class Unknown${className} implements ${className} {
  final Map<String, dynamic> raw;

  const Unknown${className}(this.raw);

  @override
  Map<String, dynamic> toJson() {
    return raw;
  }
}`;
  }

  private resolveVariantClassName(schema: any): string | undefined {
    if (!schema || typeof schema !== 'object') {
      return undefined;
    }
    if (schema.$ref) {
      return FLUTTER_CONFIG.namingConventions.modelName(getSchemaReferenceName(schema.$ref) || 'Model');
    }
    return undefined;
  }

  private resolveSchemaByModelName(modelName: string, schemas: SchemaContext['schemas']): any | undefined {
    for (const [schemaName, schema] of Object.entries(schemas)) {
      if (FLUTTER_CONFIG.namingConventions.modelName(schemaName) === modelName) {
        return resolveModelSchema(schema, schemas);
      }
    }
    return undefined;
  }

  private resolveDiscriminatorValue(schema: any, discriminatorProperty: string): string | undefined {
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

  private renderFlutterFieldType(fieldType: string, required: boolean, nullable: boolean): string {
    if (fieldType === 'dynamic') {
      return fieldType;
    }
    return required && !nullable ? fieldType : `${fieldType}?`;
  }

  private requiredFieldLabel(options: { ownerName?: string; jsonName?: string }): string {
    return [options.ownerName, options.jsonName].filter(Boolean).join('.');
  }

  private escapeSingleQuoted(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private normalizeDeserializationSchema(schema: any): any {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    const resolvedSchema = resolveModelSchema(schema);
    if (resolvedSchema && resolvedSchema !== schema && JSON.stringify(resolvedSchema) !== JSON.stringify(schema)) {
      return resolvedSchema;
    }

    return pickComposedSchema(schema) || schema;
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
