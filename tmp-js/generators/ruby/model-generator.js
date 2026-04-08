import { RUBY_CONFIG, getRubyModuleSegments } from './config.js';
export class ModelGenerator {
    generate(ctx, config) {
        return Object.entries(ctx.schemas).map(([name, schema]) => this.generateModel(name, schema, config));
    }
    generateModel(name, schema, config) {
        const moduleSegments = [...getRubyModuleSegments(config), 'Models'];
        const modelName = RUBY_CONFIG.namingConventions.modelName(name);
        const properties = Object.entries(schema?.properties || {});
        const attrAccessors = properties.length > 0
            ? `        attr_accessor ${properties.map(([propName]) => `:${RUBY_CONFIG.namingConventions.propertyName(propName)}`).join(', ')}`
            : '';
        const assignments = properties.length > 0
            ? properties.map(([propName, propSchema]) => this.generateAssignment(propName, propSchema)).join('\n')
            : '          # No properties to hydrate.';
        const exports = properties.length > 0
            ? properties.map(([propName, propSchema]) => this.generateExport(propName, propSchema)).join('\n')
            : '            # No properties to serialize.';
        const description = schema?.description ? `        # ${sanitizeComment(schema.description)}\n` : '';
        return {
            path: `lib/${getRubyModuleSegments(config).map((segment) => toSnakeCase(segment)).join('/')}/models/${RUBY_CONFIG.namingConventions.fileName(name)}.rb`,
            content: this.format(wrapRubyModules(moduleSegments, `${description}${attrAccessors ? `${attrAccessors}\n\n` : ''}        def initialize(attributes = {})
          attributes = (attributes || {}).transform_keys(&:to_s)
${assignments}
        end

        def self.from_hash(data)
          return nil if data.nil?

          new(data)
        end

        def to_hash
          {
${exports}
          }
        end`)),
            language: 'ruby',
            description: `${modelName} model`,
        };
    }
    generateAssignment(propName, propSchema) {
        const rubyName = RUBY_CONFIG.namingConventions.propertyName(propName);
        return `          @${rubyName} = ${this.deserializeExpression(propSchema, `attributes['${propName}']`)}`;
    }
    generateExport(propName, propSchema) {
        const rubyName = RUBY_CONFIG.namingConventions.propertyName(propName);
        return `            '${propName}' => ${this.serializeExpression(propSchema, `@${rubyName}`)},`;
    }
    deserializeExpression(schema, valueExpr) {
        if (!schema || typeof schema !== 'object') {
            return valueExpr;
        }
        if (schema.$ref) {
            const modelName = RUBY_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            return `${valueExpr}.is_a?(Hash) ? ${modelName}.from_hash(${valueExpr}) : nil`;
        }
        if (schema.items) {
            const itemExpr = this.deserializeArrayItemExpression(schema.items, 'item');
            return `${valueExpr}.is_a?(Array) ? ${valueExpr}.map { |item| ${itemExpr} } : []`;
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const entryExpr = this.deserializeArrayItemExpression(schema.additionalProperties, 'item');
            return `${valueExpr}.is_a?(Hash) ? ${valueExpr}.transform_values { |item| ${entryExpr} } : {}`;
        }
        if (schema.type === 'object' || schema.properties || schema.additionalProperties) {
            return `${valueExpr}.is_a?(Hash) ? ${valueExpr} : {}`;
        }
        if (schema.type === 'array') {
            return `${valueExpr}.is_a?(Array) ? ${valueExpr} : []`;
        }
        return valueExpr;
    }
    deserializeArrayItemExpression(schema, itemExpr) {
        if (schema?.$ref) {
            const modelName = RUBY_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
            return `${itemExpr}.is_a?(Hash) ? ${modelName}.from_hash(${itemExpr}) : ${itemExpr}`;
        }
        if (schema?.items) {
            const nestedExpr = this.deserializeArrayItemExpression(schema.items, 'nested_item');
            return `${itemExpr}.is_a?(Array) ? ${itemExpr}.map { |nested_item| ${nestedExpr} } : []`;
        }
        if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
            const nestedExpr = this.deserializeArrayItemExpression(schema.additionalProperties, 'nested_item');
            return `${itemExpr}.is_a?(Hash) ? ${itemExpr}.transform_values { |nested_item| ${nestedExpr} } : {}`;
        }
        if (schema?.type === 'object' || schema?.properties) {
            return `${itemExpr}.is_a?(Hash) ? ${itemExpr} : {}`;
        }
        if (schema?.type === 'array') {
            return `${itemExpr}.is_a?(Array) ? ${itemExpr} : []`;
        }
        return itemExpr;
    }
    serializeExpression(schema, valueExpr) {
        if (!schema || typeof schema !== 'object') {
            return valueExpr;
        }
        if (schema.$ref) {
            return `${valueExpr}&.to_hash`;
        }
        if (schema.items) {
            const itemExpr = this.serializeArrayItemExpression(schema.items, 'item');
            return `${valueExpr}.is_a?(Array) ? ${valueExpr}.map { |item| ${itemExpr} } : []`;
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const entryExpr = this.serializeArrayItemExpression(schema.additionalProperties, 'item');
            return `${valueExpr}.is_a?(Hash) ? ${valueExpr}.transform_values { |item| ${entryExpr} } : {}`;
        }
        return valueExpr;
    }
    serializeArrayItemExpression(schema, itemExpr) {
        if (schema?.$ref) {
            return `${itemExpr}.respond_to?(:to_hash) ? ${itemExpr}.to_hash : ${itemExpr}`;
        }
        if (schema?.items) {
            const nestedExpr = this.serializeArrayItemExpression(schema.items, 'nested_item');
            return `${itemExpr}.is_a?(Array) ? ${itemExpr}.map { |nested_item| ${nestedExpr} } : []`;
        }
        if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
            const nestedExpr = this.serializeArrayItemExpression(schema.additionalProperties, 'nested_item');
            return `${itemExpr}.is_a?(Hash) ? ${itemExpr}.transform_values { |nested_item| ${nestedExpr} } : {}`;
        }
        return itemExpr;
    }
    format(content) {
        return `${content.trim()}\n`;
    }
}
function wrapRubyModules(segments, body) {
    const opening = segments.map((segment, index) => `${'  '.repeat(index)}module ${segment}`).join('\n');
    const closing = segments.slice().reverse().map((_, index) => `${'  '.repeat(segments.length - index - 1)}end`).join('\n');
    const indentedBody = body
        .split('\n')
        .map((line) => `${'  '.repeat(segments.length)}${line}`)
        .join('\n');
    return `${opening}\n${indentedBody}\n${closing}`;
}
function toSnakeCase(value) {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}
function sanitizeComment(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}
