import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import {
  normalizeOperationId,
  resolveScopedMethodNames,
  resolveSimplifiedTagNames,
  stripTagPrefixFromOperationId,
} from '../../framework/naming.js';
import { RUBY_CONFIG, getRubyModuleSegments } from './config.js';

export class ApiGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
    const files: GeneratedFile[] = [this.generateBaseApi(config)];

    for (const tag of tags) {
      const group = ctx.apiGroups[tag];
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      files.push(this.generateApiFile(tag, resolvedTagName, group.operations, config));
    }

    return files;
  }

  private generateBaseApi(config: GeneratorConfig): GeneratedFile {
    return {
      path: `lib/${getRubyModuleSegments(config).map((segment) => toSnakeCase(segment)).join('/')}/api/base_api.rb`,
      content: this.format(wrapRubyModules([...getRubyModuleSegments(config), 'Api'], `class BaseApi
  def initialize(client)
    @client = client
  end

  private

  def interpolate_path(path, path_params = {})
    path_params.each do |name, value|
      path = path.gsub("{#{name}}", CGI.escape(value.to_s))
    end

    path
  end
end`, ['cgi'])),
      language: 'ruby',
      description: 'Base API helpers',
    };
  }

  private generateApiFile(
    tag: string,
    resolvedTagName: string,
    operations: any[],
    config: GeneratorConfig
  ): GeneratedFile {
    const moduleSegments = [...getRubyModuleSegments(config), 'Api'];
    const className = `${RUBY_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
    const fileName = RUBY_CONFIG.namingConventions.fileName(resolvedTagName);
    const scopedMethodNames = resolveScopedMethodNames(operations, (op) =>
      this.generateOperationId(op.method, op.path, op, tag)
    );
    const methodNames = new Map<any, string>();
    const referencedModels = new Set<string>();

    for (const op of operations) {
      const scopedName = scopedMethodNames.get(op) || 'operation';
      methodNames.set(op, RUBY_CONFIG.namingConventions.methodName(scopedName));
      this.collectOperationModels(op, referencedModels);
    }

    const requires = [
      "require_relative 'base_api'",
      ...Array.from(referencedModels)
        .sort((left, right) => left.localeCompare(right))
        .map((modelName) => `require_relative '../models/${RUBY_CONFIG.namingConventions.fileName(modelName)}'`),
    ];
    const methods = operations.map((op) => this.generateMethod(op, config, methodNames.get(op) || 'operation')).join('\n\n');

    return {
      path: `lib/${getRubyModuleSegments(config).map((segment) => toSnakeCase(segment)).join('/')}/api/${fileName}.rb`,
      content: this.format(wrapRubyModules(moduleSegments, `class ${className} < BaseApi
${methods}
end`, requires)),
      language: 'ruby',
      description: `${tag} API module`,
    };
  }

  private generateMethod(op: any, config: GeneratorConfig, methodName: string): string {
    const rawPathParams = this.extractPathParams(op.path);
    const allParameters = op.allParameters || op.parameters || [];
    const hasQuery = allParameters.some((param: any) => param?.in === 'query');
    const hasHeaders = allParameters.some((param: any) => param?.in === 'header' || param?.in === 'cookie');
    const requestBodyInfo = this.extractRequestBodyInfo(op);
    const hasBody = Boolean(requestBodyInfo);
    const requestBodySchema = requestBodyInfo?.schema;
    const requestBodyMediaType = (requestBodyInfo?.mediaType || '').toLowerCase();
    const responseSchema = this.extractResponseSchema(op);
    const pathParamNames = createUniqueIdentifierMap(
      rawPathParams,
      (value) => RUBY_CONFIG.namingConventions.propertyName(value),
      [
        hasBody ? 'body' : '',
        hasQuery ? 'params' : '',
        hasHeaders ? 'headers' : '',
        'path',
        hasBody ? 'payload' : '',
      ]
    );
    const pathParams = rawPathParams.map((rawName) => ({
      rawName,
      safeName: pathParamNames.get(rawName) || rawName,
    }));
    const params: string[] = pathParams.map((param) => param.safeName);
    if (hasBody) {
      params.push('body: nil');
    }
    if (hasQuery) {
      params.push('params: {}');
    }
    if (hasHeaders) {
      params.push('headers: {}');
    }

    const normalizedPath = this.normalizeOperationPath(op.path, config.apiPrefix);
    const requestPath = this.withApiPrefix(config.apiPrefix, normalizedPath);
    const pathLine = pathParams.length > 0
      ? `      path = interpolate_path('${escapeRubyString(requestPath)}', ${pathParams.map((param) => `${formatRubyPathKey(param.rawName)}: ${param.safeName}`).join(', ')})`
      : `      path = '${escapeRubyString(requestPath)}'`;
    const payloadLine = hasBody
      ? `      payload = ${this.serializeRequestBodyExpression(requestBodySchema, 'body')}`
      : '';
    const optionLines: string[] = [];
    if (hasQuery) {
      optionLines.push('      options[:query] = params unless params.nil? || params.empty?');
    }
    if (hasHeaders) {
      optionLines.push('      options[:headers] = headers unless headers.nil? || headers.empty?');
    }
    if (hasBody) {
      if (requestBodyMediaType === 'multipart/form-data') {
        optionLines.push('      options[:multipart] = payload unless payload.nil?');
      } else if (requestBodyMediaType === 'application/x-www-form-urlencoded') {
        optionLines.push('      options[:form] = payload unless payload.nil?');
      } else {
        optionLines.push('      options[:json] = payload unless payload.nil?');
      }
    }
    const requestLine = this.isVoidResponse(op)
      ? `      @client.request(:${String(op.method || 'get').toLowerCase()}, path, **options)\n      nil`
      : `      result = @client.request(:${String(op.method || 'get').toLowerCase()}, path, **options)\n      ${this.deserializeResponseExpression(responseSchema, 'result')}`;
    const comment = op.summary ? `    # ${sanitizeComment(op.summary)}\n` : '';

    return `${comment}    def ${methodName}(${params.join(', ')})
${pathLine}
${hasBody ? `${payloadLine}\n` : ''}      options = {}
${optionLines.join('\n')}
${requestLine}
    end`;
  }

  private serializeRequestBodyExpression(schema: any, bodyExpr: string): string {
    if (!schema || typeof schema !== 'object') {
      return bodyExpr;
    }

    if (schema.$ref) {
      return `${bodyExpr}.respond_to?(:to_hash) ? ${bodyExpr}.to_hash : ${bodyExpr}`;
    }
    if (schema.items) {
      const itemExpr = this.serializeArrayItemExpression(schema.items, 'item');
      return `${bodyExpr}.is_a?(Array) ? ${bodyExpr}.map { |item| ${itemExpr} } : ${bodyExpr}`;
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const itemExpr = this.serializeArrayItemExpression(schema.additionalProperties, 'item');
      return `${bodyExpr}.is_a?(Hash) ? ${bodyExpr}.transform_values { |item| ${itemExpr} } : ${bodyExpr}`;
    }

    return bodyExpr;
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

  private deserializeResponseExpression(schema: any, resultExpr: string): string {
    if (!schema || typeof schema !== 'object') {
      return resultExpr;
    }

    if (schema.$ref) {
      const modelName = RUBY_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
      return `${resultExpr}.is_a?(Hash) ? Models::${modelName}.from_hash(${resultExpr}) : nil`;
    }
    if (schema.items) {
      const itemExpr = this.deserializeArrayItemExpression(schema.items, 'item');
      return `${resultExpr}.is_a?(Array) ? ${resultExpr}.map { |item| ${itemExpr} } : []`;
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const itemExpr = this.deserializeArrayItemExpression(schema.additionalProperties, 'item');
      return `${resultExpr}.is_a?(Hash) ? ${resultExpr}.transform_values { |item| ${itemExpr} } : {}`;
    }
    if (schema.type === 'object' || schema.properties || schema.additionalProperties) {
      return `${resultExpr}.is_a?(Hash) ? ${resultExpr} : {}`;
    }
    if (schema.type === 'array') {
      return `${resultExpr}.is_a?(Array) ? ${resultExpr} : []`;
    }

    return resultExpr;
  }

  private deserializeArrayItemExpression(schema: any, itemExpr: string): string {
    if (schema?.$ref) {
      const modelName = RUBY_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
      return `${itemExpr}.is_a?(Hash) ? Models::${modelName}.from_hash(${itemExpr}) : ${itemExpr}`;
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

  private collectOperationModels(op: any, models: Set<string>): void {
    this.collectSchemaModels(this.extractRequestBodyInfo(op)?.schema, models);
    this.collectSchemaModels(this.extractResponseSchema(op), models);
  }

  private collectSchemaModels(schema: any, models: Set<string>): void {
    if (!schema || typeof schema !== 'object') {
      return;
    }

    if (schema.$ref) {
      models.add(RUBY_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model'));
      return;
    }

    for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
      if (Array.isArray(schema[key])) {
        schema[key].forEach((entry: any) => this.collectSchemaModels(entry, models));
      }
    }
    if (schema.items) {
      this.collectSchemaModels(schema.items, models);
    }
    if (schema.properties && typeof schema.properties === 'object') {
      Object.values(schema.properties).forEach((entry) => this.collectSchemaModels(entry, models));
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      this.collectSchemaModels(schema.additionalProperties, models);
    }
  }

  private generateOperationId(method: string, path: string, op: any, tag: string): string {
    if (op.operationId) {
      const normalized = normalizeOperationId(op.operationId);
      return RUBY_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
    }

    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
    const actionMap: Record<string, string> = {
      get: path.includes('{') ? 'get' : 'list',
      post: 'create',
      put: 'update',
      patch: 'patch',
      delete: 'delete',
    };

    return `${actionMap[method] || method}_${resource}`;
  }

  private extractPathParams(path: string): string[] {
    return (path.match(/\{([^}]+)\}/g) || []).map((match) => match.replace(/[{}]/g, ''));
  }

  private extractRequestBodyInfo(op: any): { schema: any; mediaType: string } | undefined {
    const content = op?.requestBody?.content;
    if (!content || typeof content !== 'object') {
      return undefined;
    }

    const mediaType = this.pickRequestBodyMediaType(content as Record<string, any>);
    if (!mediaType) {
      return undefined;
    }

    const schema = (content as Record<string, any>)[mediaType]?.schema;
    if (!schema) {
      return undefined;
    }

    return {
      mediaType,
      schema,
    };
  }

  private pickRequestBodyMediaType(content: Record<string, any>): string | undefined {
    const mediaTypes = Object.keys(content);
    if (mediaTypes.length === 0) {
      return undefined;
    }

    const priority = ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded'];
    for (const preferred of priority) {
      const matched = mediaTypes.find((mediaType) => mediaType.toLowerCase() === preferred);
      if (matched) {
        return matched;
      }
    }

    return mediaTypes.find((mediaType) => mediaType.toLowerCase().endsWith('+json')) || mediaTypes[0];
  }

  private extractResponseSchema(op: any): any | undefined {
    const responses = op?.responses;
    if (!responses || typeof responses !== 'object') {
      return undefined;
    }

    const statusCodes = Object.keys(responses).sort();
    const preferred = statusCodes.filter((code) => /^2\d\d$/.test(code));
    const candidates = preferred.length > 0 ? preferred : statusCodes;

    for (const code of candidates) {
      const content = responses[code]?.content;
      if (!content || typeof content !== 'object') {
        continue;
      }
      const mediaType = this.pickJsonMediaType(content);
      if (mediaType && content[mediaType]?.schema) {
        return content[mediaType].schema;
      }
    }

    return undefined;
  }

  private pickJsonMediaType(content: Record<string, any>): string | undefined {
    const mediaTypes = Object.keys(content);
    return mediaTypes.find((mediaType) => {
      const normalized = mediaType.toLowerCase();
      return normalized === 'application/json' || normalized.endsWith('+json');
    }) || mediaTypes[0];
  }

  private isVoidResponse(op: any): boolean {
    const responses = op?.responses;
    if (!responses || typeof responses !== 'object') {
      return false;
    }

    const statusCodes = Object.keys(responses);
    if (statusCodes.length === 0) {
      return true;
    }

    return statusCodes.every((code) => {
      const content = responses[code]?.content;
      return !content || typeof content !== 'object' || Object.keys(content).length === 0;
    });
  }

  private normalizeOperationPath(path: string, apiPrefix: string): string {
    const normalizedPathRaw = String(path || '').trim();
    if (!normalizedPathRaw) {
      return '/';
    }

    const normalizedPath = normalizedPathRaw.startsWith('/') ? normalizedPathRaw : `/${normalizedPathRaw}`;
    const prefixRaw = String(apiPrefix || '').trim();
    if (!prefixRaw || prefixRaw === '/') {
      return normalizedPath;
    }
    const normalizedPrefix = `/${prefixRaw.replace(/^\/+|\/+$/g, '')}`;

    if (normalizedPath === normalizedPrefix) {
      return '/';
    }
    if (normalizedPath.startsWith(`${normalizedPrefix}/`)) {
      const withoutPrefix = normalizedPath.slice(normalizedPrefix.length);
      return withoutPrefix.startsWith('/') ? withoutPrefix : `/${withoutPrefix}`;
    }

    return normalizedPath;
  }

  private withApiPrefix(prefix: string, path: string): string {
    const normalizedPrefixRaw = (prefix || '').trim();
    const normalizedPrefix = normalizedPrefixRaw ? `/${normalizedPrefixRaw.replace(/^\/+|\/+$/g, '')}` : '';
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    if (!normalizedPrefix || normalizedPrefix === '/') {
      return normalizedPath;
    }
    if (normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`)) {
      return normalizedPath;
    }

    return `${normalizedPrefix}${normalizedPath}`.replace(/\/{2,}/g, '/');
  }

  private format(content: string): string {
    return `${content.trim()}\n`;
  }
}

function wrapRubyModules(segments: string[], body: string, requires: string[] = []): string {
  const requireBlock = requires.length > 0 ? `${requires.join('\n')}\n\n` : '';
  const opening = segments.map((segment, index) => `${'  '.repeat(index)}module ${segment}`).join('\n');
  const closing = segments.slice().reverse().map((_, index) => `${'  '.repeat(segments.length - index - 1)}end`).join('\n');
  const indentedBody = body
    .split('\n')
    .map((line) => `${'  '.repeat(segments.length)}${line}`)
    .join('\n');
  return `${requireBlock}${opening}\n${indentedBody}\n${closing}`;
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function escapeRubyString(value: string): string {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatRubyPathKey(value: string): string {
  const raw = String(value || '');
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(raw) ? raw : `'${escapeRubyString(raw)}'`;
}

function sanitizeComment(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
