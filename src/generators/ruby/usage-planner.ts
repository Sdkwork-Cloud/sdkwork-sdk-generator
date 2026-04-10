import type { ApiParameter, GeneratedApiOperation, SchemaContext } from '../../framework/types.js';
import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import {
  normalizeOperationId,
  resolveScopedMethodNames,
  resolveSimplifiedTagNames,
  stripTagPrefixFromOperationId,
} from '../../framework/naming.js';
import { getRubyType, RUBY_CONFIG } from './config.js';

const BODY_METHODS = new Set(['post', 'put', 'patch']);
const PREFERRED_MODULES = ['tenant', 'user', 'app', 'auth', 'workspace'];

export type RubyUsageRenderMode = 'readme' | 'test';

export interface RubyUsageVariable {
  kind: 'path' | 'body' | 'params' | 'headers';
  setupByMode: Record<RubyUsageRenderMode, string[]>;
}

export interface RubyUsageExpectation {
  name: string;
  expected: string;
}

export interface RubyBodyAssertionPlan {
  kind: 'json' | 'non-empty';
  contentType: string;
  contentTypeMatch: 'exact' | 'prefix';
  expectedJsonExpression?: string;
}

export interface RubyUsagePlan {
  tag: string;
  moduleProperty: string;
  methodName: string;
  operation: GeneratedApiOperation;
  variables: RubyUsageVariable[];
  callExpression: string;
  queryExpectations: RubyUsageExpectation[];
  headerExpectations: RubyUsageExpectation[];
  bodyAssertion?: RubyBodyAssertionPlan;
  responseStatusCode: number;
  responseBody?: string;
  responseAssertions: string[];
  hasReturnValue: boolean;
}

interface SampleValue {
  expr: string;
  json: unknown;
  string: string;
}

export class RubyUsagePlanner {
  private readonly resolvedTagNames: Map<string, string>;

  constructor(
    private readonly ctx: SchemaContext,
    private readonly modulePrefix: string,
  ) {
    this.resolvedTagNames = resolveSimplifiedTagNames(Object.keys(ctx.apiGroups));
  }

  getModuleProperty(tag: string): string {
    const resolved = this.resolvedTagNames.get(tag) || tag;
    return RUBY_CONFIG.namingConventions.propertyName(resolved);
  }

  selectQuickStartPlan(): RubyUsagePlan | undefined {
    const tags = Object.keys(this.ctx.apiGroups);
    const ranked = tags
      .map((tag) => ({ tag, score: this.scoreTag(tag) }))
      .sort((left, right) => (left.score - right.score) || left.tag.localeCompare(right.tag));
    return ranked[0] ? this.selectPlanForTag(ranked[0].tag) : undefined;
  }

  selectPlanForTag(tag: string): RubyUsagePlan | undefined {
    const operations = this.ctx.apiGroups[tag]?.operations || [];
    if (operations.length === 0) {
      return undefined;
    }
    const methodNames = resolveRubyMethodNames(tag, operations);
    const operation = operations
      .map((candidate, index) => ({ candidate, index, score: this.scoreOperation(candidate) }))
      .sort((left, right) => (left.score - right.score) || (left.index - right.index))[0]?.candidate;
    if (!operation) {
      return undefined;
    }

    const variables: RubyUsageVariable[] = [];
    const args: string[] = [];
    const queryExpectations: RubyUsageExpectation[] = [];
    const headerExpectations: RubyUsageExpectation[] = [];
    let bodyAssertion: RubyBodyAssertionPlan | undefined;

    const rawPathParams = extractPathParams(operation.path);
    const safePathParams = createUniqueIdentifierMap(
      rawPathParams,
      (value) => RUBY_CONFIG.namingConventions.propertyName(value),
      ['body', 'params', 'headers'],
    );

    for (let index = 0; index < rawPathParams.length; index += 1) {
      const rawName = rawPathParams[index];
      const variableName = safePathParams.get(rawName) || `path_param_${index + 1}`;
      const value = /id$/i.test(variableName) ? quoteRuby('1') : quoteRuby(variableName);
      variables.push({
        kind: 'path',
        setupByMode: {
          readme: [`${variableName} = ${value}`],
          test: [`${variableName} = ${value}`],
        },
      });
      args.push(variableName);
    }

    const requestBody = BODY_METHODS.has(String(operation.method || '').toLowerCase())
      ? extractRequestBodyInfo(operation)
      : undefined;
    if (requestBody) {
      const bodyValue = this.sampleValue(requestBody.schema, 'body', 0, requestBody.mediaType);
      const expectedJsonExpression = requestBody.schema?.$ref ? 'JSON.generate(body.to_hash)' : 'JSON.generate(body)';
      variables.push({
        kind: 'body',
        setupByMode: {
          readme: [`body = ${bodyValue.expr}`],
          test: [`body = ${bodyValue.expr}`],
        },
      });
      args.push('body: body');
      bodyAssertion = buildBodyAssertionPlan(requestBody.mediaType, expectedJsonExpression);
    }

    const queryParameters = getConcreteParameters(operation).filter((parameter) => parameter.in === 'query');
    if (queryParameters.length > 0) {
      const entries = queryParameters.map((parameter, index) => {
        const sample = sampleParameterValue(this.ctx, parameter, index);
        queryExpectations.push({ name: parameter.name, expected: sample.string });
        return `${quoteRuby(parameter.name)} => ${sample.expr}`;
      });
      variables.push({
        kind: 'params',
        setupByMode: {
          readme: [`params = { ${entries.join(', ')} }`],
          test: [`params = { ${entries.join(', ')} }`],
        },
      });
      args.push('params: params');
    }

    const headerParameters = getConcreteParameters(operation)
      .filter((parameter) => parameter.in === 'header' || parameter.in === 'cookie');
    if (headerParameters.length > 0) {
      const entries = headerParameters.map((parameter, index) => {
        const sample = sampleParameterValue(this.ctx, parameter, index);
        headerExpectations.push({ name: parameter.name, expected: sample.string });
        return `${quoteRuby(parameter.name)} => ${sample.expr}`;
      });
      variables.push({
        kind: 'headers',
        setupByMode: {
          readme: [`headers = { ${entries.join(', ')} }`],
          test: [`headers = { ${entries.join(', ')} }`],
        },
      });
      args.push('headers: headers');
    }

    const responseSchema = extractResponseSchema(operation);
    const hasReturnValue = !isVoidResponse(operation);
    return {
      tag,
      moduleProperty: this.getModuleProperty(tag),
      methodName: methodNames.get(operation) || 'operation',
      operation,
      variables,
      callExpression: `client.${this.getModuleProperty(tag)}.${methodNames.get(operation) || 'operation'}(${args.join(', ')})`,
      queryExpectations,
      headerExpectations,
      bodyAssertion,
      responseStatusCode: resolveSuccessStatusCode(operation, hasReturnValue),
      responseBody: hasReturnValue ? JSON.stringify(buildJsonSample(this.ctx, responseSchema, 'result', 0)) : undefined,
      responseAssertions: buildResponseAssertions(this.ctx, responseSchema),
      hasReturnValue,
    };
  }

  private scoreTag(tag: string): number {
    const preferredIndex = PREFERRED_MODULES.indexOf(this.getModuleProperty(tag).toLowerCase());
    const operation = this.ctx.apiGroups[tag]?.operations?.[0];
    return (preferredIndex >= 0 ? preferredIndex : 100) + (operation ? this.scoreOperation(operation) : 1000);
  }

  private scoreOperation(operation: GeneratedApiOperation): number {
    let score = String(operation.method || '').toLowerCase() === 'get' ? 0 : 10;
    score += extractPathParams(operation.path).length * 20;
    if (extractRequestBodyInfo(operation)) {
      score += 8;
    }
    score += getConcreteParameters(operation).length * 3;
    if (extractResponseSchema(operation)) {
      score -= 1;
    }
    return score;
  }

  private sampleValue(schema: any, fallbackName: string, depth: number, mediaType?: string): SampleValue {
    const resolved = resolveSchema(this.ctx, schema);
    if (!resolved || depth > 2) {
      return sampleScalarValue(this.ctx, fallbackName, resolved, 0, mediaType);
    }
    if (schema?.$ref) {
      const modelName = getRubyType(schema, RUBY_CONFIG);
      const json = buildJsonSample(this.ctx, resolved, fallbackName, depth + 1) as Record<string, unknown>;
      const entries = Object.entries(json || {})
        .map(([key, value]) => `${quoteRuby(key)} => ${renderRubyLiteral(value)}`)
        .join(', ');
      return {
        expr: `${this.modulePrefix}::Models::${modelName}.new(${entries})`,
        json,
        string: '[object]',
      };
    }

    const type = normalizeSchemaType(resolved.type) || inferObjectType(resolved);
    if (type === 'object') {
      const json = buildJsonSample(this.ctx, resolved, fallbackName, depth + 1) as Record<string, unknown>;
      return {
        expr: renderRubyLiteral(json),
        json,
        string: JSON.stringify(json),
      };
    }
    if (type === 'array') {
      const item = this.sampleValue(resolved.items, fallbackName, depth + 1, mediaType);
      return {
        expr: `[${item.expr}]`,
        json: [item.json],
        string: item.string,
      };
    }
    return sampleScalarValue(this.ctx, fallbackName, resolved, depth, mediaType);
  }
}

export function resolveRubyMethodNames(
  tag: string,
  operations: GeneratedApiOperation[],
): Map<GeneratedApiOperation, string> {
  return resolveScopedMethodNames(operations, (operation) => {
    if (operation.operationId) {
      const normalized = normalizeOperationId(operation.operationId);
      return RUBY_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
    }
    const pathParts = String(operation.path || '').split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
    const actionMap: Record<string, string> = {
      get: String(operation.path || '').includes('{') ? 'get' : 'list',
      post: 'create',
      put: 'update',
      patch: 'patch',
      delete: 'delete',
    };
    return RUBY_CONFIG.namingConventions.methodName(`${actionMap[operation.method] || operation.method}_${resource}`);
  });
}

export function renderRubyUsageSnippet(
  plan: RubyUsagePlan,
  mode: RubyUsageRenderMode,
  options: { assignResult?: boolean } = {},
): string {
  const setupLines = plan.variables.flatMap((variable) => variable.setupByMode[mode]);
  const callLine = (options.assignResult ?? plan.hasReturnValue) && plan.hasReturnValue
    ? `result = ${plan.callExpression}`
    : plan.callExpression;
  return [...setupLines, callLine].join('\n');
}

export function resolveRubyExpectedRequestPath(path: string, apiPrefix: string): string {
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${path || ''}`;
  const normalizedPrefix = String(apiPrefix || '').trim()
    ? `/${String(apiPrefix).replace(/^\/+|\/+$/g, '')}`
    : '';
  if (!normalizedPrefix || normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`)) {
    return normalizedPath || '/';
  }
  return `${normalizedPrefix}${normalizedPath}`;
}

function buildBodyAssertionPlan(mediaType: string, expectedJsonExpression?: string): RubyBodyAssertionPlan {
  const normalized = String(mediaType || '').toLowerCase();
  if (normalized === 'application/json' || normalized.endsWith('+json')) {
    return {
      kind: 'json',
      contentType: 'application/json',
      contentTypeMatch: 'prefix',
      expectedJsonExpression,
    };
  }
  if (normalized.startsWith('multipart/form-data')) {
    return { kind: 'non-empty', contentType: 'multipart/form-data', contentTypeMatch: 'prefix' };
  }
  return { kind: 'non-empty', contentType: mediaType, contentTypeMatch: 'exact' };
}

function buildResponseAssertions(ctx: SchemaContext, schema: any): string[] {
  const resolved = resolveSchema(ctx, schema);
  const properties = Object.entries(resolved?.properties || {});
  if (properties.length === 0) {
    return schema ? ['refute_nil result'] : [];
  }
  return [
    'refute_nil result',
    ...properties.map(([name, property], index) => {
      const access = `result&.${RUBY_CONFIG.namingConventions.propertyName(name)}`;
      const resolvedProperty = resolveSchema(ctx, property);
      const type = normalizeSchemaType((resolvedProperty as any)?.type) || inferObjectType(resolvedProperty);
      if (type === 'integer') return `assert_equal ${index + 2}, ${access}`;
      if (type === 'number') return `assert_equal ${index + 2}.0, ${access}`;
      if (type === 'boolean') return `assert_equal true, ${access}`;
      if (type === 'array' || type === 'object' || (property as any)?.$ref) return `refute_nil ${access}`;
      return `assert_equal ${quoteRuby(sampleString(name, index, resolvedProperty))}, ${access}`;
    }),
  ];
}

function buildJsonSample(ctx: SchemaContext, schema: any, fallbackName: string, depth: number): unknown {
  const resolved = resolveSchema(ctx, schema);
  if (!resolved || depth > 2) return sampleString(fallbackName, depth, resolved);
  const type = normalizeSchemaType(resolved.type) || inferObjectType(resolved);
  if (type === 'integer') return depth + 1;
  if (type === 'number') return depth + 1;
  if (type === 'boolean') return true;
  if (type === 'array') return [buildJsonSample(ctx, resolved.items, fallbackName, depth + 1)];
  if (type === 'object') {
    const properties = Object.entries(resolved.properties || {});
    if (properties.length === 0) return {};
    return Object.fromEntries(
      properties.map(([name, property], index) => [name, buildJsonSample(ctx, property, name, depth + index + 1)]),
    );
  }
  return sampleString(fallbackName, depth, resolved);
}

function sampleParameterValue(ctx: SchemaContext, parameter: ApiParameter, index: number): SampleValue {
  const resolvedSchema = resolveSchema(ctx, parameter?.schema);
  const enumValue = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum[0] : undefined;
  if (enumValue !== undefined) {
    return {
      expr: renderRubyLiteral(enumValue),
      json: enumValue,
      string: String(enumValue),
    };
  }
  return sampleScalarValue(ctx, parameter.name || `value${index + 1}`, resolvedSchema, index);
}

function sampleScalarValue(ctx: SchemaContext, name: string, schema: any, index: number, mediaType?: string): SampleValue {
  const resolved = resolveSchema(ctx, schema);
  const type = normalizeSchemaType(resolved?.type) || inferObjectType(resolved);
  if (type === 'integer') {
    const value = index + 1;
    return { expr: String(value), json: value, string: String(value) };
  }
  if (type === 'number') {
    const value = index + 1;
    return { expr: `${value}.0`, json: value, string: String(value) };
  }
  if (type === 'boolean') {
    return { expr: 'true', json: true, string: 'true' };
  }
  const value = sampleString(name, index, resolved, mediaType);
  return { expr: quoteRuby(value), json: value, string: value };
}

function renderRubyLiteral(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => renderRubyLiteral(entry)).join(', ')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([name, entry]) => `${quoteRuby(name)} => ${renderRubyLiteral(entry)}`);
    return `{ ${entries.join(', ')} }`;
  }
  if (typeof value === 'number') return `${value}`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return quoteRuby(String(value ?? ''));
}

function resolveSuccessStatusCode(operation: GeneratedApiOperation, hasReturnValue: boolean): number {
  const firstSuccess = Object.keys(operation.responses || {}).find((code) => /^2\d\d$/.test(code));
  if (firstSuccess) {
    return Number(firstSuccess);
  }
  return hasReturnValue ? 200 : 204;
}

function extractPathParams(path: string): string[] {
  return (String(path || '').match(/\{([^}]+)\}/g) || []).map((match) => match.replace(/[{}]/g, ''));
}

function extractRequestBodyInfo(operation: GeneratedApiOperation): { mediaType: string; schema: any } | undefined {
  const content = operation.requestBody?.content;
  if (!content || typeof content !== 'object') return undefined;
  const mediaTypes = Object.keys(content);
  const mediaType = mediaTypes.find((candidate) => candidate.toLowerCase() === 'application/json')
    || mediaTypes.find((candidate) => candidate.toLowerCase() === 'multipart/form-data')
    || mediaTypes.find((candidate) => candidate.toLowerCase() === 'application/x-www-form-urlencoded')
    || mediaTypes.find((candidate) => candidate.toLowerCase().endsWith('+json'))
    || mediaTypes[0];
  const schema = mediaType ? (content as Record<string, any>)[mediaType]?.schema : undefined;
  return mediaType && schema ? { mediaType, schema } : undefined;
}

function extractResponseSchema(operation: GeneratedApiOperation): any | undefined {
  const responses = operation.responses;
  if (!responses || typeof responses !== 'object') return undefined;
  const statusCodes = Object.keys(responses).sort();
  const preferred = statusCodes.filter((code) => /^2\d\d$/.test(code));
  for (const code of preferred.length > 0 ? preferred : statusCodes) {
    const content = responses[code]?.content;
    if (!content || typeof content !== 'object') continue;
    const mediaType = Object.keys(content).find((candidate) => {
      const normalized = candidate.toLowerCase();
      return normalized === 'application/json' || normalized.endsWith('+json');
    }) || Object.keys(content)[0];
    if (mediaType && (content as Record<string, any>)[mediaType]?.schema) {
      return (content as Record<string, any>)[mediaType].schema;
    }
  }
  return undefined;
}

function getConcreteParameters(operation: GeneratedApiOperation): ApiParameter[] {
  const raw = Array.isArray(operation.allParameters)
    ? operation.allParameters
    : Array.isArray(operation.parameters)
      ? operation.parameters
      : [];
  return raw.filter((parameter): parameter is ApiParameter => Boolean(parameter) && typeof parameter === 'object' && 'name' in parameter);
}

function resolveSchema(ctx: SchemaContext, schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.$ref) {
    const refName = String(schema.$ref).split('/').pop() || '';
    return ctx.schemas[refName] || schema;
  }
  return resolveLooseSchema(schema);
}

function resolveLooseSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  for (const key of ['allOf', 'oneOf', 'anyOf'] as const) {
    const values = schema[key];
    if (Array.isArray(values) && values.length > 0) {
      return values.find((entry) => normalizeSchemaType(entry?.type) !== 'null') || values[0];
    }
  }
  return schema;
}

function isVoidResponse(operation: GeneratedApiOperation): boolean {
  const responses = operation.responses;
  if (!responses || typeof responses !== 'object') return true;
  const codes = Object.keys(responses);
  return codes.length === 0 || codes.every((code) => {
    const content = responses[code]?.content;
    return !content || typeof content !== 'object' || Object.keys(content).length === 0;
  });
}

function normalizeSchemaType(type: unknown): string | undefined {
  if (typeof type === 'string') return type;
  if (Array.isArray(type)) {
    return type.find((entry) => typeof entry === 'string' && entry !== 'null');
  }
  return undefined;
}

function inferObjectType(schema: any): string | undefined {
  return schema?.properties || schema?.additionalProperties ? 'object' : undefined;
}

function sampleString(name: string, index: number, schema?: any, mediaType?: string): string {
  const normalized = String(name || '').trim().toLowerCase();
  if (schema?.format === 'email') return 'user@example.com';
  if (schema?.format === 'uri' || schema?.format === 'url') return 'https://example.com';
  if (schema?.format === 'date') return '2026-04-10';
  if (schema?.format === 'date-time') return '2026-04-10T00:00:00Z';
  if (schema?.format === 'uuid') return '00000000-0000-0000-0000-000000000001';
  if (schema?.format === 'binary' && String(mediaType || '').startsWith('multipart/form-data')) return 'sample-file';
  if (normalized.endsWith('id')) return '1';
  if (normalized.includes('code')) return 'ok';
  if (normalized.includes('keyword')) return 'keyword';
  if (normalized.includes('email')) return 'user@example.com';
  if (normalized.includes('token')) return 'token';
  if (normalized.includes('name')) return 'name';
  return normalized ? normalized.replace(/[^a-z0-9]+/g, '-') : `value${index + 1}`;
}

function quoteRuby(value: string): string {
  return `'${String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
