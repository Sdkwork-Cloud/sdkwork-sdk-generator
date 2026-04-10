import type { ApiParameter, ApiSchema, GeneratedApiOperation, SchemaContext } from '../../framework/types.js';
import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import {
  normalizeOperationId,
  resolveScopedMethodNames,
  resolveSimplifiedTagNames,
  stripTagPrefixFromOperationId,
} from '../../framework/naming.js';
import { KOTLIN_CONFIG, getKotlinType } from './config.js';

const BODY_METHODS = new Set(['post', 'put', 'patch']);
const DEFAULT_PREFERRED_MODULES = ['tenant', 'user', 'app', 'auth', 'workspace'];
const KOTLIN_JSON_CONTENT_TYPE = 'application/json';

export type KotlinUsageRenderMode = 'readme' | 'test';

export interface KotlinUsageVariable {
  name: string;
  kind: 'path' | 'body' | 'params' | 'headers';
  setupByMode: Record<KotlinUsageRenderMode, string[]>;
}

export interface KotlinUsageExpectation {
  name: string;
  expected: string;
}

export interface KotlinBodyAssertionPlan {
  kind: 'json' | 'non-empty';
  contentType: string;
  contentTypeMatch: 'exact' | 'prefix';
}

export interface KotlinUsagePlan {
  tag: string;
  moduleName: string;
  methodName: string;
  operation: GeneratedApiOperation;
  transportMethod: string;
  requestBodyMediaType?: string;
  variables: KotlinUsageVariable[];
  callExpression: string;
  queryExpectations: KotlinUsageExpectation[];
  headerExpectations: KotlinUsageExpectation[];
  bodyAssertion?: KotlinBodyAssertionPlan;
  responseType: string;
  hasReturnValue: boolean;
  responseStatusCode: number;
  responseBody?: string;
  responseAssertions: string[];
}

interface KotlinNamedValue {
  kotlinExpression: string;
  jsonValue: unknown;
  stringValue: string;
}

interface KotlinBodyVariablePlan {
  variable: KotlinUsageVariable;
  assertion: KotlinBodyAssertionPlan;
}

export class KotlinUsagePlanner {
  private readonly resolvedTagNames: Map<string, string>;
  private readonly preferredModules: string[];
  private readonly knownModels: Set<string>;

  constructor(
    private readonly ctx: SchemaContext,
    preferredModules: string[] = DEFAULT_PREFERRED_MODULES,
  ) {
    this.resolvedTagNames = resolveSimplifiedTagNames(Object.keys(ctx.apiGroups));
    this.preferredModules = preferredModules;
    this.knownModels = new Set(
      Object.keys(ctx.schemas).map((schemaName) => KOTLIN_CONFIG.namingConventions.modelName(schemaName)),
    );
  }

  getModuleName(tag: string): string {
    const resolvedTagName = this.resolvedTagNames.get(tag) || tag;
    return KOTLIN_CONFIG.namingConventions.propertyName(resolvedTagName);
  }

  selectQuickStartPlan(): KotlinUsagePlan | undefined {
    const tag = this.selectQuickStartTag() || Object.keys(this.ctx.apiGroups)[0];
    return tag ? this.selectPlanForTag(tag) : undefined;
  }

  selectPlanForTag(tag: string): KotlinUsagePlan | undefined {
    const operations = this.ctx.apiGroups[tag]?.operations || [];
    const operation = this.selectOperation(operations);
    if (!operation) {
      return undefined;
    }
    return this.buildPlan(tag, operation);
  }

  private buildPlan(tag: string, operation: GeneratedApiOperation): KotlinUsagePlan {
    const operations = this.ctx.apiGroups[tag]?.operations || [];
    const methodName = resolveKotlinMethodNames(tag, operations).get(operation) || 'operation';
    const moduleName = this.getModuleName(tag);
    const transportMethod = String(operation.method || '').toLowerCase();
    const variables: KotlinUsageVariable[] = [];
    const callArguments: string[] = [];
    const queryExpectations: KotlinUsageExpectation[] = [];
    const headerExpectations: KotlinUsageExpectation[] = [];

    const rawPathParams = extractPathParams(operation.path);
    const pathParamNames = createUniqueIdentifierMap(
      rawPathParams,
      (value) => KOTLIN_CONFIG.namingConventions.propertyName(value),
      ['body', 'params', 'headers'],
    );

    for (let index = 0; index < rawPathParams.length; index += 1) {
      const rawName = rawPathParams[index];
      const variableName = pathParamNames.get(rawName) || toUsageIdentifier(rawName, 'pathParam', index + 1);
      const sampleValue = /id$/i.test(variableName)
        ? quoteKotlinString('1')
        : quoteKotlinString(variableName);
      variables.push({
        name: variableName,
        kind: 'path',
        setupByMode: {
          readme: [`val ${variableName} = ${sampleValue}`],
          test: [`val ${variableName} = ${sampleValue}`],
        },
      });
      callArguments.push(variableName);
    }

    const requestBodyInfo = BODY_METHODS.has(transportMethod)
      ? extractRequestBodyInfo(operation)
      : undefined;
    if (requestBodyInfo) {
      const bodyVariable = this.buildBodyVariable(requestBodyInfo.schema, requestBodyInfo.mediaType);
      variables.push(bodyVariable.variable);
      callArguments.push('body');
    }

    const allParameters = resolveConcreteParameters(operation);
    const queryParams = allParameters.filter((parameter) => parameter?.in === 'query');
    if (queryParams.length > 0) {
      const queryVariable = this.buildQueryVariable(queryParams);
      variables.push(queryVariable.variable);
      queryExpectations.push(...queryVariable.expectations);
      callArguments.push('params');
    }

    const headerParams = allParameters.filter(
      (parameter) => parameter?.in === 'header' || parameter?.in === 'cookie',
    );
    if (headerParams.length > 0) {
      const headerVariable = this.buildHeaderVariable(headerParams);
      variables.push(headerVariable.variable);
      headerExpectations.push(...headerVariable.expectations);
      callArguments.push('headers');
    }

    const responseSchema = extractResponseSchema(operation);
    const responseType = responseSchema
      ? getKotlinType(responseSchema, KOTLIN_CONFIG)
      : inferFallbackResponseType(operation);
    const responseStatusCode = resolveSuccessStatusCode(operation, responseType);
    const responseBody = responseType === 'Unit'
      ? undefined
      : JSON.stringify(buildJsonSampleValue(this.ctx, responseSchema, 'result', 0));
    const responseAssertions = buildResponseAssertions(this.ctx, responseSchema, responseType);

    return {
      tag,
      moduleName,
      methodName,
      operation,
      transportMethod,
      requestBodyMediaType: requestBodyInfo?.mediaType,
      variables,
      callExpression: `client.${moduleName}.${methodName}(${callArguments.join(', ')})`,
      queryExpectations,
      headerExpectations,
      bodyAssertion: requestBodyInfo
        ? buildBodyAssertionPlan(requestBodyInfo.mediaType)
        : undefined,
      responseType,
      hasReturnValue: responseType !== 'Unit',
      responseStatusCode,
      responseBody,
      responseAssertions: responseAssertions.length > 0
        ? responseAssertions
        : (responseType !== 'Unit' ? ['assertNotNull(result)'] : []),
    };
  }

  private buildBodyVariable(schema: ApiSchema, mediaType: string): KotlinBodyVariablePlan {
    const declaredType = getKotlinType(schema, KOTLIN_CONFIG);
    const resolvedSchema = resolveSchema(this.ctx, schema);
    const normalizedMediaType = String(mediaType || '').toLowerCase();

    if (this.isKnownModelType(declaredType)) {
      return {
        variable: {
          name: 'body',
          kind: 'body',
          setupByMode: {
            readme: this.renderModelVariable('body', declaredType, resolvedSchema),
            test: this.renderModelVariable('body', declaredType, resolvedSchema),
          },
        },
        assertion: buildBodyAssertionPlan(normalizedMediaType),
      };
    }

    const normalizedType = normalizeSchemaType(resolvedSchema?.type) || inferImplicitObjectType(resolvedSchema);
    if (normalizedType === 'object' || declaredType.startsWith('Map<') || declaredType === 'Any') {
      const mapLiteral = renderMapLiteral(this.ctx, resolvedSchema, normalizedMediaType);
      return {
        variable: {
          name: 'body',
          kind: 'body',
          setupByMode: {
            readme: [`val body = ${mapLiteral}`],
            test: [`val body = ${mapLiteral}`],
          },
        },
        assertion: buildBodyAssertionPlan(normalizedMediaType),
      };
    }

    if (normalizedType === 'array' || declaredType.startsWith('List<')) {
      const itemValue = renderInlineKotlinValue(
        this.ctx,
        resolvedSchema?.items,
        'item',
        0,
        normalizedMediaType,
        1,
      );
      const listLiteral = itemValue ? `listOf(${itemValue.kotlinExpression})` : 'listOf<Any>()';
      return {
        variable: {
          name: 'body',
          kind: 'body',
          setupByMode: {
            readme: [`val body = ${listLiteral}`],
            test: [`val body = ${listLiteral}`],
          },
        },
        assertion: buildBodyAssertionPlan(normalizedMediaType),
      };
    }

    const scalarValue = renderInlineKotlinValue(this.ctx, resolvedSchema, 'value', 0, normalizedMediaType, 0)
      || buildScalarKotlinValue('value', resolvedSchema, 0, mediaType);
    return {
      variable: {
        name: 'body',
        kind: 'body',
        setupByMode: {
          readme: [`val body = ${scalarValue.kotlinExpression}`],
          test: [`val body = ${scalarValue.kotlinExpression}`],
        },
      },
      assertion: buildBodyAssertionPlan(normalizedMediaType),
    };
  }

  private buildQueryVariable(parameters: ApiParameter[]): {
    variable: KotlinUsageVariable;
    expectations: KotlinUsageExpectation[];
  } {
    const expectations: KotlinUsageExpectation[] = [];
    const lines = ['val params = linkedMapOf<String, Any>('];
    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      const sample = buildParameterValue(this.ctx, parameter, index);
      expectations.push({ name: parameter.name, expected: sample.stringValue });
      lines.push(`    ${quoteKotlinString(parameter.name)} to ${sample.kotlinExpression}${index < parameters.length - 1 ? ',' : ''}`);
    }
    lines.push(')');

    return {
      variable: {
        name: 'params',
        kind: 'params',
        setupByMode: { readme: lines, test: lines },
      },
      expectations,
    };
  }

  private buildHeaderVariable(parameters: ApiParameter[]): {
    variable: KotlinUsageVariable;
    expectations: KotlinUsageExpectation[];
  } {
    const expectations: KotlinUsageExpectation[] = [];
    const lines = ['val headers = linkedMapOf<String, String>('];
    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      const sample = buildHeaderValue(this.ctx, parameter, index);
      expectations.push({ name: parameter.name, expected: sample.stringValue });
      lines.push(`    ${quoteKotlinString(parameter.name)} to ${sample.kotlinExpression}${index < parameters.length - 1 ? ',' : ''}`);
    }
    lines.push(')');

    return {
      variable: {
        name: 'headers',
        kind: 'headers',
        setupByMode: { readme: lines, test: lines },
      },
      expectations,
    };
  }

  private renderModelVariable(variableName: string, typeName: string, schema: ApiSchema | undefined): string[] {
    const properties = schema?.properties ? Object.entries(schema.properties) : [];
    if (properties.length === 0) {
      return [`val ${variableName} = ${typeName}()`];
    }

    const renderedFields = properties
      .map(([propertyName, propertySchema], index) => {
        const rendered = renderInlineKotlinValue(
          this.ctx,
          propertySchema,
          propertyName,
          index,
          KOTLIN_JSON_CONTENT_TYPE,
          1,
        );
        if (!rendered) {
          return '';
        }
        const fieldName = KOTLIN_CONFIG.namingConventions.propertyName(propertyName);
        return `    ${fieldName} = ${rendered.kotlinExpression}`;
      })
      .filter(Boolean);

    if (renderedFields.length === 0) {
      return [`val ${variableName} = ${typeName}()`];
    }

    const lines = [`val ${variableName} = ${typeName}(`];
    for (let index = 0; index < renderedFields.length; index += 1) {
      lines.push(`${renderedFields[index]}${index < renderedFields.length - 1 ? ',' : ''}`);
    }
    lines.push(')');
    return lines;
  }

  private selectQuickStartTag(): string | undefined {
    const candidates = Object.keys(this.ctx.apiGroups)
      .map((tag) => {
        const operation = this.selectOperation(this.ctx.apiGroups[tag]?.operations || []);
        return {
          tag,
          preferredIndex: this.preferredModules.indexOf(this.getModuleName(tag).toLowerCase()),
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
    const responseSchema = extractResponseSchema(operation);

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
    if (responseSchema) {
      score -= 1;
    }
    return score;
  }

  private isKnownModelType(typeName: string): boolean {
    return this.knownModels.has(typeName);
  }
}

export function resolveKotlinMethodNames(
  tag: string,
  operations: GeneratedApiOperation[],
): Map<GeneratedApiOperation, string> {
  if (!Array.isArray(operations) || operations.length === 0) {
    return new Map<GeneratedApiOperation, string>();
  }

  return resolveScopedMethodNames(operations, (operation) => generateKotlinOperationName(
    operation.method,
    operation.path,
    operation,
    tag,
  ));
}

export function renderKotlinUsageSnippet(
  plan: KotlinUsagePlan,
  mode: KotlinUsageRenderMode,
  options: { assignResult?: boolean; resultVariableName?: string } = {},
): string {
  const setupLines = plan.variables.flatMap((variable) => variable.setupByMode[mode]);
  const assignResult = options.assignResult ?? (mode === 'readme' && plan.hasReturnValue);
  const resultVariableName = options.resultVariableName || 'result';
  const callLine = assignResult && plan.hasReturnValue
    ? `val ${resultVariableName} = ${plan.callExpression}`
    : plan.callExpression;
  return setupLines.length > 0 ? `${setupLines.join('\n')}\n${callLine}` : callLine;
}

export function resolveKotlinExpectedRequestPath(path: string, apiPrefix: string): string {
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

function generateKotlinOperationName(
  method: string,
  path: string,
  operation: GeneratedApiOperation,
  tag: string,
): string {
  if (operation.operationId) {
    const normalized = normalizeOperationId(operation.operationId);
    return KOTLIN_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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

  return `${actionMap[method] || method}${KOTLIN_CONFIG.namingConventions.modelName(resource)}`;
}

function buildBodyAssertionPlan(mediaType: string): KotlinBodyAssertionPlan {
  const normalized = String(mediaType || '').toLowerCase();
  if (normalized === 'application/json' || normalized.endsWith('+json')) {
    return {
      kind: 'json',
      contentType: KOTLIN_JSON_CONTENT_TYPE,
      contentTypeMatch: 'prefix',
    };
  }
  if (normalized.startsWith('multipart/form-data')) {
    return {
      kind: 'non-empty',
      contentType: 'multipart/form-data',
      contentTypeMatch: 'prefix',
    };
  }
  return {
    kind: 'non-empty',
    contentType: mediaType,
    contentTypeMatch: 'exact',
  };
}

function renderMapLiteral(
  ctx: SchemaContext,
  schema: ApiSchema | undefined,
  mediaType: string,
): string {
  const properties = schema?.properties ? Object.entries(schema.properties) : [];
  if (properties.length > 0) {
    const lines = ['linkedMapOf<String, Any>('];
    for (let index = 0; index < properties.length; index += 1) {
      const [propertyName, propertySchema] = properties[index];
      const rendered = renderInlineKotlinValue(ctx, propertySchema, propertyName, index, mediaType, 1)
        || buildScalarKotlinValue(propertyName, propertySchema, index, mediaType);
      lines.push(`    ${quoteKotlinString(propertyName)} to ${rendered.kotlinExpression}${index < properties.length - 1 ? ',' : ''}`);
    }
    lines.push(')');
    return lines.join('\n');
  }

  if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
    const rendered = renderInlineKotlinValue(ctx, schema.additionalProperties, 'value', 0, mediaType, 1)
      || buildScalarKotlinValue('value', schema.additionalProperties, 0, mediaType);
    return [
      'linkedMapOf<String, Any>(',
      `    ${quoteKotlinString('value')} to ${rendered.kotlinExpression}`,
      ')',
    ].join('\n');
  }

  if (mediaType.startsWith('multipart/form-data') || mediaType.startsWith('application/x-www-form-urlencoded')) {
    return [
      'linkedMapOf<String, Any>(',
      `    ${quoteKotlinString('value')} to ${quoteKotlinString('value')}`,
      ')',
    ].join('\n');
  }

  return 'linkedMapOf<String, Any>()';
}

function renderInlineKotlinValue(
  ctx: SchemaContext,
  schema: ApiSchema | undefined,
  fallbackName: string,
  index: number,
  mediaType: string,
  depth: number,
): KotlinNamedValue | undefined {
  const resolvedSchema = resolveSchema(ctx, schema);
  const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    return buildLiteralValue(enumValues[0]);
  }
  if (!resolvedSchema || depth > 2) {
    return undefined;
  }

  if (schema?.$ref) {
    const modelType = getKotlinType(schema, KOTLIN_CONFIG);
    return {
      kotlinExpression: `${modelType}()`,
      jsonValue: {},
      stringValue: '[object]',
    };
  }

  const normalizedType = normalizeSchemaType(resolvedSchema.type) || inferImplicitObjectType(resolvedSchema);
  switch (normalizedType) {
    case 'integer':
    case 'number': {
      const value = index + 1;
      return {
        kotlinExpression: String(value),
        jsonValue: value,
        stringValue: String(value),
      };
    }
    case 'boolean': {
      const value = index % 2 === 0;
      return {
        kotlinExpression: value ? 'true' : 'false',
        jsonValue: value,
        stringValue: value ? 'true' : 'false',
      };
    }
    case 'array': {
      const itemValue = renderInlineKotlinValue(ctx, resolvedSchema.items, fallbackName, index, mediaType, depth + 1)
        || buildScalarKotlinValue(fallbackName, resolvedSchema.items, index, mediaType);
      return {
        kotlinExpression: `listOf(${itemValue.kotlinExpression})`,
        jsonValue: [itemValue.jsonValue],
        stringValue: String(itemValue.stringValue),
      };
    }
    case 'object': {
      const mapLiteral = renderMapLiteral(ctx, resolvedSchema, mediaType);
      const properties = resolvedSchema.properties ? Object.entries(resolvedSchema.properties) : [];
      const jsonValue = properties.length > 0
        ? Object.fromEntries(
          properties.map(([propertyName, propertySchema], propertyIndex) => [
            propertyName,
            buildJsonSampleValue(ctx, propertySchema, propertyName, depth + propertyIndex + 1),
          ]),
        )
        : {};
      return {
        kotlinExpression: mapLiteral,
        jsonValue,
        stringValue: JSON.stringify(jsonValue),
      };
    }
    case 'string':
    default:
      return buildScalarKotlinValue(fallbackName, resolvedSchema, index, mediaType);
  }
}

function buildScalarKotlinValue(
  fallbackName: string,
  schema: ApiSchema | undefined,
  index: number,
  mediaType?: string,
): KotlinNamedValue {
  const sampleString = sampleStringValue(fallbackName, index, schema, mediaType);
  return {
    kotlinExpression: quoteKotlinString(sampleString),
    jsonValue: sampleString,
    stringValue: sampleString,
  };
}

function buildParameterValue(ctx: SchemaContext, parameter: ApiParameter, index: number): KotlinNamedValue {
  const resolvedSchema = resolveSchema(ctx, parameter?.schema);
  const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    return buildLiteralValue(enumValues[0]);
  }

  switch (normalizeSchemaType(resolvedSchema?.type)) {
    case 'integer':
    case 'number': {
      const value = index + 1;
      return {
        kotlinExpression: String(value),
        jsonValue: value,
        stringValue: String(value),
      };
    }
    case 'boolean': {
      const value = index % 2 === 0;
      return {
        kotlinExpression: value ? 'true' : 'false',
        jsonValue: value,
        stringValue: value ? 'true' : 'false',
      };
    }
    default:
      return buildScalarKotlinValue(parameter.name || `value${index + 1}`, resolvedSchema, index);
  }
}

function buildHeaderValue(ctx: SchemaContext, parameter: ApiParameter, index: number): KotlinNamedValue {
  const resolvedSchema = resolveSchema(ctx, parameter?.schema);
  const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    const value = String(enumValues[0]);
    return {
      kotlinExpression: quoteKotlinString(value),
      jsonValue: value,
      stringValue: value,
    };
  }

  switch (normalizeSchemaType(resolvedSchema?.type)) {
    case 'integer':
    case 'number': {
      const value = String(index + 1);
      return {
        kotlinExpression: quoteKotlinString(value),
        jsonValue: value,
        stringValue: value,
      };
    }
    case 'boolean': {
      const value = index % 2 === 0 ? 'true' : 'false';
      return {
        kotlinExpression: quoteKotlinString(value),
        jsonValue: value,
        stringValue: value,
      };
    }
  }
  return buildScalarKotlinValue(parameter.name || `header${index + 1}`, resolvedSchema, index);
}

function buildLiteralValue(value: unknown): KotlinNamedValue {
  if (typeof value === 'number') {
    return {
      kotlinExpression: String(value),
      jsonValue: value,
      stringValue: String(value),
    };
  }
  if (typeof value === 'boolean') {
    return {
      kotlinExpression: value ? 'true' : 'false',
      jsonValue: value,
      stringValue: value ? 'true' : 'false',
    };
  }
  const stringValue = String(value ?? 'value');
  return {
    kotlinExpression: quoteKotlinString(stringValue),
    jsonValue: stringValue,
    stringValue,
  };
}

function buildJsonSampleValue(
  ctx: SchemaContext,
  schema: ApiSchema | undefined,
  fallbackName: string,
  depth: number,
): unknown {
  const resolvedSchema = resolveSchema(ctx, schema);
  if (!resolvedSchema || depth > 2) {
    return sampleStringValue(fallbackName, 0, resolvedSchema);
  }

  const enumValues = Array.isArray(resolvedSchema.enum) ? resolvedSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    return enumValues[0];
  }

  const normalizedType = normalizeSchemaType(resolvedSchema.type) || inferImplicitObjectType(resolvedSchema);
  switch (normalizedType) {
    case 'integer':
    case 'number':
      return depth + 1;
    case 'boolean':
      return true;
    case 'array':
      return [buildJsonSampleValue(ctx, resolvedSchema.items, fallbackName, depth + 1)];
    case 'object': {
      const properties = resolvedSchema.properties ? Object.entries(resolvedSchema.properties) : [];
      if (properties.length > 0) {
        return Object.fromEntries(
          properties.map(([propertyName, propertySchema], index) => [
            propertyName,
            buildJsonSampleValue(ctx, propertySchema, propertyName, depth + index + 1),
          ]),
        );
      }
      if (resolvedSchema.additionalProperties && typeof resolvedSchema.additionalProperties === 'object') {
        return {
          value: buildJsonSampleValue(ctx, resolvedSchema.additionalProperties, 'value', depth + 1),
        };
      }
      return {};
    }
    case 'string':
    default:
      return sampleStringValue(fallbackName, depth, resolvedSchema);
  }
}

function buildResponseAssertions(
  ctx: SchemaContext,
  schema: ApiSchema | undefined,
  responseType: string,
): string[] {
  if (!schema || responseType === 'Unit' || responseType.startsWith('Map<') || responseType.startsWith('List<') || responseType === 'Any') {
    return responseType === 'Unit' ? [] : ['assertNotNull(result)'];
  }

  const resolvedSchema = resolveSchema(ctx, schema);
  const properties = resolvedSchema?.properties ? Object.entries(resolvedSchema.properties) : [];
  if (properties.length === 0) {
    return ['assertNotNull(result)'];
  }

  const assertions: string[] = ['assertNotNull(result)'];
  for (let index = 0; index < properties.length; index += 1) {
    const [propertyName, propertySchema] = properties[index];
    const fieldName = KOTLIN_CONFIG.namingConventions.propertyName(propertyName);
    const resolvedPropertySchema = resolveSchema(ctx, propertySchema);
    const normalizedType = normalizeSchemaType(resolvedPropertySchema?.type)
      || inferImplicitObjectType(resolvedPropertySchema);
    if (propertySchema?.$ref) {
      assertions.push(`assertNotNull(result?.${fieldName})`);
      continue;
    }
    switch (normalizedType) {
      case 'integer':
      case 'number':
        assertions.push(`assertEquals(${index + 1}, result?.${fieldName})`);
        break;
      case 'boolean':
        assertions.push('assertEquals(true, result?.' + fieldName + ')');
        break;
      case 'array':
      case 'object':
        assertions.push(`assertNotNull(result?.${fieldName})`);
        break;
      case 'string':
      default:
        assertions.push(`assertEquals(${quoteKotlinString(sampleStringValue(propertyName, index, resolvedPropertySchema))}, result?.${fieldName})`);
        break;
    }
  }

  return assertions;
}

function resolveSuccessStatusCode(operation: GeneratedApiOperation, responseType: string): number {
  const statusCodes = Object.keys(operation.responses || {});
  const firstSuccess = statusCodes.find((code) => /^2\d\d$/.test(code));
  if (firstSuccess) {
    return Number(firstSuccess);
  }
  return responseType === 'Unit' ? 204 : 200;
}

function extractPathParams(path: string): string[] {
  const matches = path.match(/\{([^}]+)\}/g) || [];
  return matches.map((match) => match.replace(/[{}]/g, ''));
}

function extractRequestBodyInfo(
  operation: GeneratedApiOperation,
): { mediaType: string; schema: ApiSchema } | undefined {
  const content = operation.requestBody?.content;
  if (!content || typeof content !== 'object') {
    return undefined;
  }

  const mediaType = pickRequestBodyMediaType(content as Record<string, any>);
  const schema = mediaType ? (content as Record<string, any>)[mediaType]?.schema : undefined;
  if (!mediaType || !schema) {
    return undefined;
  }

  return { mediaType, schema };
}

function extractResponseSchema(operation: GeneratedApiOperation): ApiSchema | undefined {
  const responses = operation.responses;
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
    const mediaType = pickJsonMediaType(content as Record<string, any>);
    if (mediaType && (content as Record<string, any>)[mediaType]?.schema) {
      return (content as Record<string, any>)[mediaType].schema;
    }
  }

  return undefined;
}

function inferFallbackResponseType(operation: GeneratedApiOperation): string {
  const responses = operation.responses;
  if (!responses || typeof responses !== 'object') {
    return 'Any';
  }

  const statusCodes = Object.keys(responses);
  if (statusCodes.length === 0) {
    return 'Any';
  }

  const allNoContent = statusCodes.every((code) => {
    const content = responses[code]?.content;
    return !content || typeof content !== 'object' || Object.keys(content).length === 0;
  });

  if (allNoContent || responses['204']) {
    return 'Unit';
  }
  return 'Any';
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

function pickJsonMediaType(content: Record<string, any>): string | undefined {
  const mediaTypes = Object.keys(content);
  const jsonLike = mediaTypes.find((mediaType) => {
    const normalized = mediaType.toLowerCase();
    return normalized === 'application/json' || normalized.endsWith('+json');
  });
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

function isConcreteApiParameter(
  parameter: ApiParameter | { $ref: string } | undefined,
): parameter is ApiParameter {
  return Boolean(parameter)
    && typeof parameter === 'object'
    && 'name' in parameter
    && 'in' in parameter
    && 'schema' in parameter;
}

function isQueryOrHeaderParameter(parameter: ApiParameter | undefined): boolean {
  return parameter?.in === 'query' || parameter?.in === 'header' || parameter?.in === 'cookie';
}

function resolveSchema(ctx: SchemaContext, schema: ApiSchema | undefined): ApiSchema | undefined {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop() || '';
    return ctx.schemas[refName] || schema;
  }
  const composed = pickComposedSchema(schema);
  if (composed) {
    return resolveSchema(ctx, composed) || composed;
  }
  return schema;
}

function sampleStringValue(
  fallbackName: string,
  index: number,
  schema?: ApiSchema,
  mediaType?: string,
): string {
  const normalizedName = String(fallbackName || '').trim().toLowerCase();
  if (schema?.format === 'email') return 'user@example.com';
  if (schema?.format === 'uri' || schema?.format === 'url') return 'https://example.com';
  if (schema?.format === 'date') return '2026-04-10';
  if (schema?.format === 'date-time') return '2026-04-10T00:00:00Z';
  if (schema?.format === 'uuid') return '00000000-0000-0000-0000-000000000001';
  if (schema?.format === 'binary' && String(mediaType || '').startsWith('multipart/form-data')) return 'sample-file';
  if (normalizedName.endsWith('id')) return '1';
  if (normalizedName.includes('code')) return 'ok';
  if (normalizedName.includes('keyword')) return 'keyword';
  if (normalizedName.includes('email')) return 'user@example.com';
  if (normalizedName.includes('token')) return 'token';
  if (normalizedName.includes('name')) return 'name';
  if (!normalizedName) return `value${index + 1}`;
  return normalizedName.replace(/[^a-z0-9]+/g, '-');
}

function normalizeSchemaType(type: unknown): string | undefined {
  if (typeof type === 'string') {
    return type;
  }
  if (Array.isArray(type)) {
    const candidate = type.find((entry) => typeof entry === 'string' && entry !== 'null');
    return typeof candidate === 'string' ? candidate : undefined;
  }
  return undefined;
}

function inferImplicitObjectType(schema: ApiSchema | undefined): string | undefined {
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }
  if (schema.properties && typeof schema.properties === 'object') {
    return 'object';
  }
  if (schema.additionalProperties) {
    return 'object';
  }
  return undefined;
}

function pickComposedSchema(schema: ApiSchema | undefined): ApiSchema | undefined {
  const orderedKeys: Array<'allOf' | 'oneOf' | 'anyOf'> = ['allOf', 'oneOf', 'anyOf'];
  for (const key of orderedKeys) {
    const values = schema?.[key];
    if (!Array.isArray(values) || values.length === 0) {
      continue;
    }
    const candidate = values.find((entry) => entry && normalizeSchemaType(entry.type) !== 'null');
    return candidate || values[0];
  }
  return undefined;
}

function toUsageIdentifier(rawName: string, fallbackPrefix: string, index: number): string {
  const cleaned = KOTLIN_CONFIG.namingConventions.propertyName(rawName || '');
  return cleaned || `${fallbackPrefix}${index}`;
}

function quoteKotlinString(value: string): string {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
