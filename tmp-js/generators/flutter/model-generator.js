import { FLUTTER_CONFIG, getFlutterType } from './config.js';
export class ModelGenerator {
    generate(ctx, _config) {
        const models = [
            this.generateRuntimeHelpers(),
            ...Object.entries(ctx.schemas).map(([name, schema]) => this.generateClass(name, schema)),
        ];
        return [{
                path: 'lib/src/models.dart',
                content: this.format(`${models.join('\n\n')}\n`),
                language: 'flutter',
                description: 'Data models',
            }];
    }
    generateRuntimeHelpers() {
        return `Map<String, dynamic>? _sdkworkAsMap(dynamic value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  return null;
}

List<dynamic>? _sdkworkAsList(dynamic value) {
  return value is List ? value : null;
}`;
    }
    generateClass(name, schema) {
        const className = FLUTTER_CONFIG.namingConventions.modelName(name);
        const props = schema.properties || {};
        const propEntries = Object.entries(props);
        const fields = propEntries.map(([propName, propSchema]) => {
            const fieldName = FLUTTER_CONFIG.namingConventions.propertyName(propName);
            const fieldType = getFlutterType(propSchema, FLUTTER_CONFIG);
            const nullableType = fieldType === 'dynamic' ? fieldType : `${fieldType}?`;
            return `  final ${nullableType} ${fieldName};`;
        }).join('\n');
        const constructor = propEntries.length === 0
            ? `  ${className}();`
            : `  ${className}({
${propEntries.map(([propName]) => {
                const fieldName = FLUTTER_CONFIG.namingConventions.propertyName(propName);
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
                const fieldName = FLUTTER_CONFIG.namingConventions.propertyName(propName);
                return `      ${fieldName}: ${this.deserializeExpression(propSchema, `json['${propName}']`, className)}`;
            }).join(',\n')}
    );
  }`;
        const toJsonBody = propEntries.length === 0
            ? '    return <String, dynamic>{};'
            : `    return <String, dynamic>{
${propEntries.map(([propName, propSchema]) => {
                const fieldName = FLUTTER_CONFIG.namingConventions.propertyName(propName);
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
        if (schema.$ref) {
            const refName = FLUTTER_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            const refTarget = refName === currentModelName ? currentModelName : refName;
            return `(() {
        final map = _sdkworkAsMap(${valueExpr});
        return map == null ? null : ${refTarget}.fromJson(map);
      })()`;
        }
        if (schema.items) {
            const itemType = getFlutterType(schema.items, FLUTTER_CONFIG);
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
            return `(() {
        final map = _sdkworkAsMap(${valueExpr});
        if (map == null) {
          return null;
        }
        final result = <String, ${valueType}>{};
        map.forEach((key, item) {
          final deserialized = ${itemExpr};
          if (deserialized is ${valueType}) {
            result[key] = deserialized;
          }
        });
        return result;
      })()`;
        }
        const baseType = getFlutterType(schema, FLUTTER_CONFIG);
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
        if (schema?.$ref) {
            const refName = FLUTTER_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            const refTarget = refName === currentModelName ? currentModelName : refName;
            return `(() {
        final map = _sdkworkAsMap(${itemExpr});
        return map == null ? null : ${refTarget}.fromJson(map);
      })()`;
        }
        if (schema?.items) {
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
            return `(() {
        final map = _sdkworkAsMap(${itemExpr});
        if (map == null) {
          return null;
        }
        final result = <String, ${mapValueType}>{};
        map.forEach((key, nestedItem) {
          final deserialized = ${nestedExpr};
          if (deserialized is ${mapValueType}) {
            result[key] = deserialized;
          }
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
    serializeExpression(schema, valueExpr, currentModelName) {
        if (!schema || typeof schema !== 'object') {
            return valueExpr;
        }
        if (schema.$ref) {
            return `${valueExpr}?.toJson()`;
        }
        if (schema.items) {
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
        if (schema?.$ref) {
            return `${itemExpr}.toJson()`;
        }
        if (schema?.items) {
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
        if (schema?.$ref) {
            const refName = FLUTTER_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            return refName === currentModelName ? currentModelName : refName;
        }
        return getFlutterType(schema, FLUTTER_CONFIG);
    }
    format(content) {
        return content.trim() + '\n';
    }
}
