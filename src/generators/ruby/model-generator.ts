import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { RUBY_CONFIG, getRubyModuleSegments } from './config.js';

export class ModelGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    return Object.entries(ctx.schemas).map(([name, schema]) => this.generateModel(name, schema, config));
  }

  private generateModel(name: string, schema: any, config: GeneratorConfig): GeneratedFile {
    const moduleSegments = [...getRubyModuleSegments(config), 'Models'];
    const modelName = RUBY_CONFIG.namingConventions.modelName(name);
    const properties = Object.entries(schema?.properties || {}) as Array<[string, any]>;
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
    const body = `class ${modelName}
${description}${attrAccessors ? `${attrAccessors}\n\n` : ''}        def initialize(attributes = {})
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
        end
      end`;

    return {
      path: `lib/${getRubyModuleSegments(config).map((segment) => toSnakeCase(segment)).join('/')}/models/${RUBY_CONFIG.namingConventions.fileName(name)}.rb`,
      content: this.format(wrapRubyModules(moduleSegments, body)),
      language: 'ruby',
      description: `${modelName} model`,
    };
  }

  private generateAssignment(propName: string, propSchema: any): string {
    const rubyName = RUBY_CONFIG.namingConventions.propertyName(propName);
    return `          @${rubyName} = ${this.deserializeExpression(propSchema, `attributes['${propName}']`)}`;
  }

  private generateExport(propName: string, propSchema: any): string {
    const rubyName = RUBY_CONFIG.namingConventions.propertyName(propName);
    return `            '${propName}' => ${this.serializeExpression(propSchema, `@${rubyName}`)},`;
  }

  private deserializeExpression(schema: any, valueExpr: string): string {
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

  private deserializeArrayItemExpression(schema: any, itemExpr: string): string {
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

  private serializeExpression(schema: any, valueExpr: string): string {
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

  private serializeArrayItemExpression(schema: any, itemExpr: string): string {
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

  private format(content: string): string {
    return `${content.trim()}\n`;
  }
}

function wrapRubyModules(segments: string[], body: string): string {
  const opening = segments.map((segment, index) => `${'  '.repeat(index)}module ${segment}`).join('\n');
  const closing = segments.slice().reverse().map((_, index) => `${'  '.repeat(segments.length - index - 1)}end`).join('\n');
  const indentedBody = body
    .split('\n')
    .map((line) => `${'  '.repeat(segments.length)}${line}`)
    .join('\n');
  return `${opening}\n${indentedBody}\n${closing}`;
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function sanitizeComment(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
