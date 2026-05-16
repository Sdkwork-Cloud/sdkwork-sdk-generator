import { getSchemaReferenceName, pickComposedSchema, resolveModelSchema } from '../../framework/schema.js';
import { DART_CONFIG, getDartType } from './config.js';
export class ModelGenerator {
    generate(ctx, _config) {
        const modelClasses = Object.entries(ctx.schemas).map(([name, schema]) => this.generateClass(name, schema, ctx.schemas));
        const runtimeHelpers = this.generateRuntimeHelpers({
            map: modelClasses.some((model) => model.includes('_sdkworkAsMap')),
            list: modelClasses.some((model) => model.includes('_sdkworkAsList')),
        });
        const models = [
            ...(runtimeHelpers ? [runtimeHelpers] : []),
            ...modelClasses,
        ];
        return [{
                path: 'lib/src/models.dart',
                content: this.format(`${models.join('\n\n')}\n`),
                language: 'dart',
                description: 'Data models',
            }];
    }
    generateRuntimeHelpers(helpers) {
        const blocks = [];
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
    generateClass(name, schema, schemas) {
        const modelSchema = resolveModelSchema(schema, schemas);
        const className = DART_CONFIG.namingConventions.modelName(name);
        const props = modelSchema.properties || {};
        const propEntries = Object.entries(props);
        const fields = propEntries.map(([propName, propSchema]) => {
            const fieldName = DART_CONFIG.namingConventions.propertyName(propName);
            const fieldType = getDartType(propSchema, DART_CONFIG);
            const nullableType = fieldType === 'dynamic' ? fieldType : `${fieldType}?`;
            return `  final ${nullableType} ${fieldName};`;
        }).join('\n');
        const constructor = propEntries.length === 0
            ? `  ${className}();`
            : `  ${className}({
${propEntries.map(([propName]) => {
                const fieldName = DART_CONFIG.namingConventions.propertyName(propName);
                return `    this.${fieldName}`;
            }).join(',\n')}
  });`;
        const fromJson = propEntries.length === 0
            ? `  factory ${className}.fromJson(Map<String, dynamic> json) {
    return ${className}();
  }`
            : `  factory ${className}.fromJson(Map<String, dynamic> json) {
    return ${className}(
${propEntries.map(([propName, propSchema]) => {
                const fieldName = DART_CONFIG.namingConventions.propertyName(propName);
                return `      ${fieldName}: ${this.deserializeExpression(propSchema, `json['${propName}']`, className)}`;
            }).join(',\n')}
    );
  }`;
        const toJsonBody = propEntries.length === 0
            ? '    return <String, dynamic>{};'
            : `    return <String, dynamic>{
${propEntries.map(([propName, propSchema]) => {
                const fieldName = DART_CONFIG.namingConventions.propertyName(propName);
                return `      '${propName}': ${this.serializeExpression(propSchema, fieldName, className)},`;
            }).join('\n')}
    };`;
        return `class ${className} {
${fields}

${constructor}

${fromJson}

  Map<String, dynamic> toJson() {
${toJsonBody}
  }
}`;
    }
    deserializeExpression(schema, valueExpr, currentModelName) {
        if (!schema || typeof schema !== 'object') {
            return valueExpr;
        }
        const normalizedSchema = this.normalizeDeserializationSchema(schema);
        if (normalizedSchema !== schema) {
            return this.deserializeExpression(normalizedSchema, valueExpr, currentModelName);
        }
        if (schema.$ref) {
            const refName = DART_CONFIG.namingConventions.modelName(getSchemaReferenceName(schema.$ref) || 'Model');
            const refTarget = refName === currentModelName ? currentModelName : refName;
            return `(() {
        final map = _sdkworkAsMap(${valueExpr});
        return map == null ? null : ${refTarget}.fromJson(map);
      })()`;
        }
        if (Array.isArray(schema.prefixItems)) {
            return `_sdkworkAsList(${valueExpr})`;
        }
        if (schema.items && typeof schema.items === 'object') {
            const itemType = getDartType(schema.items, DART_CONFIG);
            const itemExpr = this.deserializeArrayItemExpression(schema.items, 'item', currentModelName);
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
        const baseType = getDartType(schema, DART_CONFIG);
        if (baseType === 'String') {
            return `${valueExpr}?.toString()`;
        }
        if (baseType === 'int') {
            return `${valueExpr} is int ? ${valueExpr} : null`;
        }
        if (baseType === 'double') {
            return `${valueExpr} is num ? ${valueExpr}.toDouble() : null`;
        }
        if (baseType === 'bool') {
            return `${valueExpr} is bool ? ${valueExpr} : null`;
        }
        if (baseType.startsWith('Map<')) {
            return `_sdkworkAsMap(${valueExpr})`;
        }
        return valueExpr;
    }
    deserializeArrayItemExpression(schema, itemExpr, currentModelName) {
        const normalizedSchema = this.normalizeDeserializationSchema(schema);
        if (normalizedSchema !== schema) {
            return this.deserializeArrayItemExpression(normalizedSchema, itemExpr, currentModelName);
        }
        if (schema?.$ref) {
            const refName = DART_CONFIG.namingConventions.modelName(getSchemaReferenceName(schema.$ref) || 'Model');
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
            const nestedType = getDartType(schema.items, DART_CONFIG);
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
        const baseType = getDartType(schema, DART_CONFIG);
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
    serializeExpression(schema, valueExpr, currentModelName) {
        if (!schema || typeof schema !== 'object') {
            return valueExpr;
        }
        const normalizedSchema = this.normalizeDeserializationSchema(schema);
        if (normalizedSchema !== schema) {
            return this.serializeExpression(normalizedSchema, valueExpr, currentModelName);
        }
        if (schema.$ref) {
            return `${valueExpr}?.toJson()`;
        }
        if (Array.isArray(schema.prefixItems)) {
            return valueExpr;
        }
        if (schema.items && typeof schema.items === 'object') {
            const itemExpr = this.serializeArrayItemExpression(schema.items, 'item', currentModelName);
            return `${valueExpr}?.map((item) => ${itemExpr}).toList()`;
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const itemExpr = this.serializeArrayItemExpression(schema.additionalProperties, 'item', currentModelName);
            return `${valueExpr}?.map((key, item) => MapEntry(key, ${itemExpr}))`;
        }
        return valueExpr;
    }
    serializeArrayItemExpression(schema, itemExpr, currentModelName) {
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
    resolveMapValueType(schema, currentModelName) {
        const normalizedSchema = this.normalizeDeserializationSchema(schema);
        if (normalizedSchema !== schema) {
            return this.resolveMapValueType(normalizedSchema, currentModelName);
        }
        if (schema?.$ref) {
            const refName = DART_CONFIG.namingConventions.modelName(getSchemaReferenceName(schema.$ref) || 'Model');
            return refName === currentModelName ? currentModelName : refName;
        }
        return getDartType(schema, DART_CONFIG);
    }
    normalizeDeserializationSchema(schema) {
        if (!schema || typeof schema !== 'object') {
            return schema;
        }
        const resolvedSchema = resolveModelSchema(schema);
        if (resolvedSchema && resolvedSchema !== schema && JSON.stringify(resolvedSchema) !== JSON.stringify(schema)) {
            return resolvedSchema;
        }
        return pickComposedSchema(schema) || schema;
    }
    format(content) {
        return content.trim() + '\n';
    }
}
