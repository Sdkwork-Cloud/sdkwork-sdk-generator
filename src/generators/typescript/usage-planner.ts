import type { ApiParameter, ApiSchema, GeneratedApiOperation, SchemaContext } from '../../framework/types.js';
import { normalizeOperationId, resolveScopedMethodNames, stripTagPrefixFromOperationId } from '../../framework/naming.js';
import { TYPESCRIPT_CONFIG } from './config.js';
import { buildTypeScriptTagMetadataMap } from './tag-metadata.js';

const BODY_METHODS = new Set(['post', 'put', 'patch']);
const DEFAULT_PREFERRED_MODULES = ['tenant', 'user', 'app', 'auth', 'workspace'];

export type TypeScriptUsageRenderMode = 'readme' | 'test';

export interface TypeScriptUsageVariable {
  name: string;
  kind: 'path' | 'body' | 'params' | 'headers';
  initializerByMode: Record<TypeScriptUsageRenderMode, string>;
}

export interface TypeScriptUsagePlan {
  tag: string;
  moduleName: string;
  methodName: string;
  operation: GeneratedApiOperation;
  transportMethod: string;
  requestBodyMediaType?: string;
  variables: TypeScriptUsageVariable[];
  callExpression: string;
}

export class TypeScriptUsagePlanner {
  private readonly tagMetadataMap: Map<string, { clientPropertyName: string }>;
  private readonly preferredModules: string[];

  constructor(
    private readonly ctx: SchemaContext,
    preferredModules: string[] = DEFAULT_PREFERRED_MODULES,
  ) {
    this.tagMetadataMap = buildTypeScriptTagMetadataMap(Object.keys(ctx.apiGroups));
    this.preferredModules = preferredModules;
  }

  getModuleName(tag: string): string {
    return this.tagMetadataMap.get(tag)?.clientPropertyName
      || TYPESCRIPT_CONFIG.namingConventions.propertyName(tag);
  }

  selectQuickStartPlan(): TypeScriptUsagePlan | undefined {
    const tag = this.selectQuickStartTag() || Object.keys(this.ctx.apiGroups)[0];
    return tag ? this.selectPlanForTag(tag) : undefined;
  }

  selectPlanForTag(tag: string): TypeScriptUsagePlan | undefined {
    const operations = this.ctx.apiGroups[tag]?.operations || [];
    const operation = this.selectOperation(operations);
    if (!operation) {
      return undefined;
    }
    return this.buildPlan(tag, operation);
  }

  private buildPlan(tag: string, operation: GeneratedApiOperation): TypeScriptUsagePlan {
    const operations = this.ctx.apiGroups[tag]?.operations || [];
    const methodName = resolveTypeScriptMethodNames(tag, operations).get(operation) || 'operation';
    const moduleName = this.getModuleName(tag);
    const transportMethod = String(operation.method || '').toLowerCase();
    const variables: TypeScriptUsageVariable[] = [];
    const callArguments: string[] = [];

    const pathParams = extractPathParams(operation.path);
    for (let index = 0; index < pathParams.length; index += 1) {
      const variableName = toUsageIdentifier(pathParams[index], 'pathParam', index + 1);
      const sampleValue = /id$/i.test(variableName) ? "'1'" : `'${escapeSingleQuoted(variableName)}'`;
      variables.push({
        name: variableName,
        kind: 'path',
        initializerByMode: {
          readme: sampleValue,
          test: sampleValue,
        },
      });
      callArguments.push(variableName);
    }

    const requestBodyInfo = BODY_METHODS.has(transportMethod) ? extractRequestBodyInfo(operation) : undefined;
    if (requestBodyInfo) {
      variables.push({
        name: 'body',
        kind: 'body',
        initializerByMode: {
          readme: renderBodyLiteral(this.ctx, requestBodyInfo.schema, requestBodyInfo.mediaType),
          test: renderBodyLiteral(this.ctx, requestBodyInfo.schema, requestBodyInfo.mediaType),
        },
      });
      callArguments.push('body');
    }

    const allParameters = resolveConcreteParameters(operation);
    const queryParams = allParameters.filter((parameter) => parameter?.in === 'query');
    if (queryParams.length > 0) {
      variables.push({
        name: 'params',
        kind: 'params',
        initializerByMode: {
          readme: renderObjectLiteral(this.ctx, queryParams),
          test: renderObjectLiteral(this.ctx, queryParams),
        },
      });
      callArguments.push('params');
    }

    const headerParams = allParameters.filter((parameter) => parameter?.in === 'header' || parameter?.in === 'cookie');
    if (headerParams.length > 0) {
      variables.push({
        name: 'headers',
        kind: 'headers',
        initializerByMode: {
          readme: renderObjectLiteral(this.ctx, headerParams),
          test: renderObjectLiteral(this.ctx, headerParams),
        },
      });
      callArguments.push('headers');
    }

    return {
      tag,
      moduleName,
      methodName,
      operation,
      transportMethod,
      requestBodyMediaType: requestBodyInfo?.mediaType,
      variables,
      callExpression: `client.${moduleName}.${methodName}(${callArguments.join(', ')})`,
    };
  }

  private selectQuickStartTag(): string | undefined {
    const candidates = Array.from(this.tagMetadataMap.entries())
      .map(([tag, metadata]) => {
        const operations = this.ctx.apiGroups[tag]?.operations || [];
        const operation = this.selectOperation(operations);
        return {
          tag,
          preferredIndex: this.preferredModules.indexOf(metadata.clientPropertyName),
          score: operation ? this.estimateOperationComplexity(operation) : Number.POSITIVE_INFINITY,
        };
      })
      .filter((candidate) => Number.isFinite(candidate.score));

    if (candidates.length === 0) {
      return undefined;
    }

    candidates.sort((left, right) => {
      const leftPreferred = left.preferredIndex >= 0;
      const rightPreferred = right.preferredIndex >= 0;
      if (leftPreferred !== rightPreferred) {
        return leftPreferred ? -1 : 1;
      }
      if (left.score !== right.score) {
        return left.score - right.score;
      }
      if (leftPreferred && rightPreferred && left.preferredIndex !== right.preferredIndex) {
        return left.preferredIndex - right.preferredIndex;
      }
      return left.tag.localeCompare(right.tag);
    });

    return candidates[0]?.tag;
  }

  private selectOperation(operations: GeneratedApiOperation[]): GeneratedApiOperation | undefined {
    if (operations.length === 0) {
      return undefined;
    }

    return operations
      .map((operation, index) => ({
        operation,
        index,
        score: this.estimateOperationComplexity(operation),
      }))
      .sort((left, right) => (left.score - right.score) || (left.index - right.index))[0]?.operation;
  }

  private estimateOperationComplexity(operation: GeneratedApiOperation): number {
    const method = String(operation.method || '').toLowerCase();
    const pathParamCount = extractPathParams(operation.path).length;
    const requestBodyInfo = BODY_METHODS.has(method) ? extractRequestBodyInfo(operation) : undefined;
    const hasRequestBody = Boolean(requestBodyInfo);
    const requestBodyRequired = hasRequestBody && Boolean(operation.requestBody?.required);
    const allParameters = resolveConcreteParameters(operation);
    const requiredParamCount = allParameters.filter(
      (parameter) => isQueryOrHeaderParameter(parameter) && parameter?.required,
    ).length;
    const optionalParamCount = allParameters.filter(
      (parameter) => isQueryOrHeaderParameter(parameter) && !parameter?.required,
    ).length;

    let score = 0;
    if (method && method !== 'get') {
      score += 10;
    }
    score += pathParamCount * 30;
    if (requestBodyRequired) {
      score += 20;
    } else if (hasRequestBody) {
      score += 8;
    }
    score += requiredParamCount * 12;
    score += optionalParamCount * 3;
    return score;
  }
}

export function resolveTypeScriptMethodNames(
  tag: string,
  operations: GeneratedApiOperation[],
): Map<GeneratedApiOperation, string> {
  if (!Array.isArray(operations) || operations.length === 0) {
    return new Map<GeneratedApiOperation, string>();
  }

  return resolveScopedMethodNames(operations, (operation) => generateTypeScriptOperationName(
    operation.method,
    operation.path,
    operation,
    tag,
  ));
}

export function renderTypeScriptUsageSnippet(
  plan: TypeScriptUsagePlan,
  mode: TypeScriptUsageRenderMode,
  options: { assignResult?: boolean } = {},
): string {
  const setupLines = plan.variables.map(
    (variable) => `const ${variable.name} = ${variable.initializerByMode[mode]};`,
  );
  const assignResult = options.assignResult ?? mode === 'readme';
  const callLine = assignResult
    ? `const result = await ${plan.callExpression};`
    : `await ${plan.callExpression};`;
  return setupLines.length > 0 ? `${setupLines.join('\n')}\n${callLine}` : callLine;
}

export function resolveTypeScriptExpectedRequestPath(path: string, apiPrefix: string): string {
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
  if (normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`)) {
    return normalizedPath;
  }
  return `${normalizedPrefix}${normalizedPath}`;
}

function generateTypeScriptOperationName(
  method: string,
  path: string,
  operation: GeneratedApiOperation,
  tag: string,
): string {
  if (operation.operationId) {
    const normalized = normalizeOperationId(operation.operationId);
    return TYPESCRIPT_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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

  return `${actionMap[method] || method}${TYPESCRIPT_CONFIG.namingConventions.modelName(resource)}`;
}

function extractPathParams(path: string): string[] {
  const matches = path.match(/\{([^}]+)\}/g) || [];
  return matches.map((match) => match.replace(/[{}]/g, ''));
}

function extractRequestBodyInfo(
  operation: GeneratedApiOperation,
): { mediaType: string; schema: ApiSchema | undefined } | undefined {
  const content = operation.requestBody?.content;
  if (!content || typeof content !== 'object') {
    return undefined;
  }

  const mediaType = pickRequestBodyMediaType(content);
  if (!mediaType) {
    return undefined;
  }

  const schema = content[mediaType]?.schema as ApiSchema | undefined;
  return { mediaType, schema };
}

function pickRequestBodyMediaType(content: Record<string, any>): string | undefined {
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

  const jsonLike = mediaTypes.find((mediaType) => mediaType.toLowerCase().endsWith('+json'));
  return jsonLike || mediaTypes[0];
}

function resolveConcreteParameters(operation: GeneratedApiOperation): ApiParameter[] {
  const rawParameters = Array.isArray(operation.allParameters)
    ? operation.allParameters
    : Array.isArray(operation.parameters)
      ? operation.parameters
      : [];
  return rawParameters.filter(isConcreteApiParameter);
}

function isConcreteApiParameter(parameter: ApiParameter | { $ref: string } | undefined): parameter is ApiParameter {
  return Boolean(parameter)
    && typeof parameter === 'object'
    && 'name' in parameter
    && 'in' in parameter
    && 'schema' in parameter;
}

function isQueryOrHeaderParameter(parameter: ApiParameter | undefined): boolean {
  return parameter?.in === 'query' || parameter?.in === 'header' || parameter?.in === 'cookie';
}

function toUsageIdentifier(rawName: string, fallbackPrefix: string, index: number): string {
  const cleaned = String(rawName || '').replace(/[^a-zA-Z0-9_$]/g, '_');
  return /^[a-zA-Z_$]/.test(cleaned) ? cleaned : `${fallbackPrefix}${index}`;
}

function renderObjectLiteral(ctx: SchemaContext, parameters: ApiParameter[]): string {
  const lines = parameters.map((parameter, index) => {
    const key = formatObjectKey(parameter.name || `value${index + 1}`);
    const value = sampleValueForParameter(ctx, parameter, index);
    return `  ${key}: ${value},`;
  });
  return ['{', ...lines, '}'].join('\n');
}

function formatObjectKey(rawName: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(rawName) ? rawName : `'${escapeSingleQuoted(rawName)}'`;
}

function renderBodyLiteral(ctx: SchemaContext, schema: ApiSchema | undefined, mediaType: string): string {
  if (mediaType.toLowerCase() === 'multipart/form-data') {
    return 'new FormData()';
  }
  return renderSampleValue(ctx, schema, 'body', 0);
}

function renderSampleValue(
  ctx: SchemaContext,
  schema: ApiSchema | undefined,
  fallbackName: string,
  depth: number,
): string {
  const resolvedSchema = resolveSchema(ctx, schema);
  const normalizedType = normalizeSampleSchemaType(resolvedSchema);
  const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    return formatLiteral(enumValues[0]);
  }

  if (depth >= 2) {
    if (normalizedType === 'object') {
      return '{}';
    }
    if (normalizedType === 'array') {
      return '[]';
    }
  }

  switch (normalizedType) {
    case 'integer':
    case 'number':
      return '1';
    case 'boolean':
      return 'true';
    case 'array': {
      const itemValue = renderSampleValue(ctx, resolvedSchema?.items as ApiSchema | undefined, fallbackName, depth + 1);
      const indent = '  '.repeat(depth);
      const childIndent = '  '.repeat(depth + 1);
      return `[\n${childIndent}${itemValue},\n${indent}]`;
    }
    case 'object': {
      const entries = resolvedSchema?.properties ? Object.entries(resolvedSchema.properties) : [];
      const indent = '  '.repeat(depth);
      const childIndent = '  '.repeat(depth + 1);
      if (entries.length > 0) {
        return `{\n${entries.map(([propertyName, propertySchema]) => (
          `${childIndent}${formatObjectKey(propertyName)}: ${renderSampleValue(ctx, propertySchema, propertyName, depth + 1)},`
        )).join('\n')}\n${indent}}`;
      }
      if (resolvedSchema?.additionalProperties && typeof resolvedSchema.additionalProperties === 'object') {
        return `{\n${childIndent}value: ${renderSampleValue(
          ctx,
          resolvedSchema.additionalProperties,
          'value',
          depth + 1,
        )},\n${indent}}`;
      }
      return '{}';
    }
    case 'string':
    default:
      return `'${escapeSingleQuoted(fallbackName || 'value')}'`;
  }
}

function sampleValueForParameter(ctx: SchemaContext, parameter: ApiParameter, index: number): string {
  const resolvedSchema = resolveSchema(ctx, parameter?.schema);
  const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    return formatLiteral(enumValues[0]);
  }

  switch (resolvedSchema?.type) {
    case 'integer':
    case 'number':
      return String(index + 1);
    case 'boolean':
      return index % 2 === 0 ? 'true' : 'false';
    default:
      return `'${escapeSingleQuoted(parameter.name || `value${index + 1}`)}'`;
  }
}

function formatLiteral(value: unknown): string {
  if (typeof value === 'string') {
    return `'${escapeSingleQuoted(value)}'`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return "'value'";
}

function escapeSingleQuoted(value: string): string {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function resolveSchema(ctx: SchemaContext, schema: ApiSchema | undefined): ApiSchema | undefined {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }
  if (schema.$ref) {
    const refName = String(schema.$ref).split('/').pop() || '';
    return ctx.schemas[refName] || schema;
  }
  const composed = pickComposedSchema(schema);
  return composed ? (resolveSchema(ctx, composed) || composed) : schema;
}

function normalizeSampleSchemaType(schema: ApiSchema | undefined): string | undefined {
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }
  if (schema.type === 'array') {
    return 'array';
  }
  if (schema.type === 'object' || schema.properties || schema.additionalProperties) {
    return 'object';
  }
  return schema.type;
}

function pickComposedSchema(schema: ApiSchema | undefined): ApiSchema | undefined {
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }
  for (const key of ['allOf', 'oneOf', 'anyOf'] as const) {
    const values = schema[key];
    if (Array.isArray(values) && values.length > 0) {
      return values.find((entry) => typeof entry === 'object' && entry && entry.type !== 'null') || values[0];
    }
  }
  return undefined;
}
