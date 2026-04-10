import type { ApiParameter, ApiSchema, GeneratedApiOperation, SchemaContext } from '../../framework/types.js';
import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import {
  normalizeOperationId,
  resolveScopedMethodNames,
  resolveSimplifiedTagNames,
  stripTagPrefixFromOperationId,
} from '../../framework/naming.js';
import { PHP_CONFIG, getPhpType } from './config.js';

const BODY_METHODS = new Set(['post', 'put', 'patch']);
const DEFAULT_PREFERRED_MODULES = ['tenant', 'user', 'app', 'auth', 'workspace'];

export type PhpUsageRenderMode = 'readme' | 'test';

export interface PhpUsageVariable {
  name: string;
  kind: 'path' | 'body' | 'params' | 'headers';
  setupByMode: Record<PhpUsageRenderMode, string[]>;
}

export interface PhpUsageExpectation {
  name: string;
  expected: string;
}

export interface PhpBodyAssertionPlan {
  kind: 'json' | 'non-empty';
  contentType: string;
  contentTypeMatch: 'exact' | 'prefix';
  expectedJsonExpression?: string;
}

export interface PhpUsagePlan {
  tag: string;
  moduleProperty: string;
  methodName: string;
  operation: GeneratedApiOperation;
  variables: PhpUsageVariable[];
  callExpression: string;
  queryExpectations: PhpUsageExpectation[];
  headerExpectations: PhpUsageExpectation[];
  bodyAssertion?: PhpBodyAssertionPlan;
  responseStatusCode: number;
  responseBody?: string;
  responseAssertions: string[];
  hasReturnValue: boolean;
  modelImports: string[];
}

interface PhpNamedValue {
  phpExpression: string;
  jsonValue: unknown;
  stringValue: string;
  modelImports: string[];
}

interface PhpBodyVariablePlan {
  variable: PhpUsageVariable;
  assertion: PhpBodyAssertionPlan;
  modelImports: string[];
}

interface PhpModelVariablePlan {
  lines: string[];
  modelImports: string[];
}

export class PhpUsagePlanner {
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
      Object.keys(ctx.schemas).map((schemaName) => PHP_CONFIG.namingConventions.modelName(schemaName)),
    );
  }

  getModuleProperty(tag: string): string {
    const resolvedTagName = this.resolvedTagNames.get(tag) || tag;
    return PHP_CONFIG.namingConventions.propertyName(resolvedTagName);
  }

  selectQuickStartPlan(): PhpUsagePlan | undefined {
    const tag = this.selectQuickStartTag() || Object.keys(this.ctx.apiGroups)[0];
    return tag ? this.selectPlanForTag(tag) : undefined;
  }

  selectPlanForTag(tag: string): PhpUsagePlan | undefined {
    const operations = this.ctx.apiGroups[tag]?.operations || [];
    const operation = this.selectOperation(operations);
    if (!operation) {
      return undefined;
    }
    return this.buildPlan(tag, operation);
  }

  private buildPlan(tag: string, operation: GeneratedApiOperation): PhpUsagePlan {
    const operations = this.ctx.apiGroups[tag]?.operations || [];
    const methodName = resolvePhpMethodNames(tag, operations).get(operation) || 'operation';
    const moduleProperty = this.getModuleProperty(tag);
    const variables: PhpUsageVariable[] = [];
    const callArguments: string[] = [];
    const queryExpectations: PhpUsageExpectation[] = [];
    const headerExpectations: PhpUsageExpectation[] = [];
    const modelImports = new Set<string>();
    let bodyAssertion: PhpBodyAssertionPlan | undefined;

    const rawPathParams = extractPathParams(operation.path);
    const pathParamNames = createUniqueIdentifierMap(
      rawPathParams,
      (value) => PHP_CONFIG.namingConventions.propertyName(value),
      ['body', 'params', 'headers', 'path'],
    );

    for (let index = 0; index < rawPathParams.length; index += 1) {
      const rawName = rawPathParams[index];
      const variableName = pathParamNames.get(rawName) || `pathParam${index + 1}`;
      const sampleValue = /id$/i.test(variableName) ? quotePhpString('1') : quotePhpString(variableName);
      variables.push({
        name: variableName,
        kind: 'path',
        setupByMode: {
          readme: [`$${variableName} = ${sampleValue};`],
          test: [`$${variableName} = ${sampleValue};`],
        },
      });
      callArguments.push(`$${variableName}`);
    }

    const requestBodyInfo = BODY_METHODS.has(String(operation.method || '').toLowerCase())
      ? extractRequestBodyInfo(operation)
      : undefined;
    if (requestBodyInfo) {
      const bodyVariable = this.buildBodyVariable(requestBodyInfo.schema, requestBodyInfo.mediaType);
      variables.push(bodyVariable.variable);
      bodyVariable.modelImports.forEach((modelName) => modelImports.add(modelName));
      bodyAssertion = bodyVariable.assertion;
      callArguments.push('$body');
    }

    const allParameters = resolveConcreteParameters(operation);
    const queryParams = allParameters.filter((parameter) => parameter?.in === 'query');
    if (queryParams.length > 0) {
      const queryVariable = this.buildQueryVariable(queryParams);
      variables.push(queryVariable.variable);
      queryExpectations.push(...queryVariable.expectations);
      callArguments.push('$params');
    }

    const headerParams = allParameters.filter(
      (parameter) => parameter?.in === 'header' || parameter?.in === 'cookie',
    );
    if (headerParams.length > 0) {
      const headerVariable = this.buildHeaderVariable(headerParams);
      variables.push(headerVariable.variable);
      headerExpectations.push(...headerVariable.expectations);
      callArguments.push('$headers');
    }

    const responseSchema = extractResponseSchema(operation);
    const responseType = responseSchema ? getPhpType(responseSchema, PHP_CONFIG) : inferFallbackResponseType(operation);
    const responseStatusCode = resolveSuccessStatusCode(operation, responseType);
    const responseBody = responseType === 'void'
      ? undefined
      : JSON.stringify(buildJsonSampleValue(this.ctx, responseSchema, 'result', 0));

    return {
      tag,
      moduleProperty,
      methodName,
      operation,
      variables,
      callExpression: `$client->${moduleProperty}->${methodName}(${callArguments.join(', ')})`,
      queryExpectations,
      headerExpectations,
      bodyAssertion,
      responseStatusCode,
      responseBody,
      responseAssertions: buildResponseAssertions(this.ctx, responseSchema, responseType),
      hasReturnValue: responseType !== 'void',
      modelImports: Array.from(modelImports).sort((left, right) => left.localeCompare(right)),
    };
  }

  private buildBodyVariable(schema: ApiSchema, mediaType: string): PhpBodyVariablePlan {
    const declaredType = getPhpType(schema, PHP_CONFIG);
    const resolvedSchema = resolveSchema(this.ctx, schema);
    const normalizedMediaType = String(mediaType || '').toLowerCase();
    const normalizedType = normalizeSchemaType(resolvedSchema?.type) || inferImplicitObjectType(resolvedSchema);

    if (schema.$ref && this.isKnownModelType(declaredType) && normalizedType === 'object') {
      const modelVariable = this.renderModelVariable('body', declaredType, resolvedSchema);
      return {
        variable: {
          name: 'body',
          kind: 'body',
          setupByMode: { readme: modelVariable.lines, test: modelVariable.lines },
        },
        assertion: this.buildBodyAssertionPlan(
          normalizedMediaType,
          'json_encode($body->toArray(), JSON_THROW_ON_ERROR)',
        ),
        modelImports: modelVariable.modelImports,
      };
    }

    if (normalizedType === 'array') {
      const itemValue = renderInlinePhpValue(this.ctx, resolvedSchema?.items, 'item', 0, normalizedMediaType, 1)
        || buildScalarPhpValue('item', resolvedSchema?.items, 0, normalizedMediaType);
      const lines = [`$body = [${itemValue.phpExpression}];`];
      return {
        variable: {
          name: 'body',
          kind: 'body',
          setupByMode: { readme: lines, test: lines },
        },
        assertion: this.buildBodyAssertionPlan(normalizedMediaType, 'json_encode($body, JSON_THROW_ON_ERROR)'),
        modelImports: itemValue.modelImports,
      };
    }

    if (normalizedType === 'object' || declaredType === 'array' || declaredType === 'mixed') {
      const entries = renderAssocArrayEntries(this.ctx, resolvedSchema, normalizedMediaType);
      const lines = [
        `$body = [${entries.map((entry) => `${quotePhpString(entry.name)} => ${entry.value.phpExpression}`).join(', ')}];`,
      ];
      return {
        variable: {
          name: 'body',
          kind: 'body',
          setupByMode: { readme: lines, test: lines },
        },
        assertion: this.buildBodyAssertionPlan(normalizedMediaType, 'json_encode($body, JSON_THROW_ON_ERROR)'),
        modelImports: collectModelImports(entries.map((entry) => entry.value)),
      };
    }

    const scalarValue = renderInlinePhpValue(this.ctx, resolvedSchema, 'value', 0, normalizedMediaType, 0)
      || buildScalarPhpValue('value', resolvedSchema, 0, normalizedMediaType);
    const lines = [`$body = ${scalarValue.phpExpression};`];
    return {
      variable: {
        name: 'body',
        kind: 'body',
        setupByMode: { readme: lines, test: lines },
      },
      assertion: this.buildBodyAssertionPlan(normalizedMediaType, 'json_encode($body, JSON_THROW_ON_ERROR)'),
      modelImports: scalarValue.modelImports,
    };
  }

  private buildBodyAssertionPlan(mediaType: string, expectedJsonExpression?: string): PhpBodyAssertionPlan {
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

  private buildQueryVariable(parameters: ApiParameter[]): {
    variable: PhpUsageVariable;
    expectations: PhpUsageExpectation[];
  } {
    const expectations: PhpUsageExpectation[] = [];
    const entries: string[] = [];

    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      const sample = buildParameterValue(this.ctx, parameter, index);
      expectations.push({ name: parameter.name, expected: sample.stringValue });
      entries.push(`${quotePhpString(parameter.name)} => ${sample.phpExpression}`);
    }

    const line = `$params = [${entries.join(', ')}];`;
    return {
      variable: { name: 'params', kind: 'params', setupByMode: { readme: [line], test: [line] } },
      expectations,
    };
  }

  private buildHeaderVariable(parameters: ApiParameter[]): {
    variable: PhpUsageVariable;
    expectations: PhpUsageExpectation[];
  } {
    const expectations: PhpUsageExpectation[] = [];
    const entries: string[] = [];

    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      const sample = buildHeaderValue(this.ctx, parameter, index);
      expectations.push({ name: parameter.name, expected: sample.stringValue });
      entries.push(`${quotePhpString(parameter.name)} => ${sample.phpExpression}`);
    }

    const line = `$headers = [${entries.join(', ')}];`;
    return {
      variable: { name: 'headers', kind: 'headers', setupByMode: { readme: [line], test: [line] } },
      expectations,
    };
  }

  private renderModelVariable(variableName: string, typeName: string, schema: ApiSchema | undefined): PhpModelVariablePlan {
    const properties = schema?.properties ? Object.entries(schema.properties) : [];
    if (properties.length === 0) {
      return {
        lines: [`$${variableName} = new ${typeName}();`],
        modelImports: [typeName],
      };
    }

    const entries: string[] = [];
    const modelImports = new Set<string>([typeName]);
    for (let index = 0; index < properties.length; index += 1) {
      const [propertyName, propertySchema] = properties[index];
      const rendered = renderInlinePhpValue(this.ctx, propertySchema, propertyName, index, 'application/json', 1)
        || buildScalarPhpValue(propertyName, propertySchema, index, 'application/json');
      rendered.modelImports.forEach((modelName) => modelImports.add(modelName));
      entries.push(`${quotePhpString(propertyName)} => ${rendered.phpExpression}`);
    }

    return {
      lines: [`$${variableName} = new ${typeName}([${entries.join(', ')}]);`],
      modelImports: Array.from(modelImports),
    };
  }

  private selectQuickStartTag(): string | undefined {
    const candidates = Object.keys(this.ctx.apiGroups)
      .map((tag) => {
        const operation = this.selectOperation(this.ctx.apiGroups[tag]?.operations || []);
        return {
          tag,
          preferredIndex: this.preferredModules.indexOf(this.getModuleProperty(tag).toLowerCase()),
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
    const allParameters = resolveConcreteParameters(operation);

    let score = 0;
    if (method && method !== 'get') {
      score += 10;
    }
    score += pathParamCount * 30;
    if (requestBodyInfo) {
      score += 8;
    }
    score += allParameters.filter((parameter) => isQueryOrHeaderParameter(parameter) && parameter?.required).length * 12;
    score += allParameters.filter((parameter) => isQueryOrHeaderParameter(parameter) && !parameter?.required).length * 3;
    if (extractResponseSchema(operation)) {
      score -= 1;
    }
    return score;
  }

  private isKnownModelType(typeName: string): boolean {
    return this.knownModels.has(typeName);
  }
}

export function resolvePhpMethodNames(
  tag: string,
  operations: GeneratedApiOperation[],
): Map<GeneratedApiOperation, string> {
  if (!Array.isArray(operations) || operations.length === 0) {
    return new Map<GeneratedApiOperation, string>();
  }

  return resolveScopedMethodNames(operations, (operation) => generatePhpOperationName(
    operation.method,
    operation.path,
    operation,
    tag,
  ));
}

export function renderPhpUsageSnippet(
  plan: PhpUsagePlan,
  mode: PhpUsageRenderMode,
  options: { assignResult?: boolean } = {},
): string {
  const setupLines = plan.variables.flatMap((variable) => variable.setupByMode[mode]);
  const assignResult = options.assignResult ?? plan.hasReturnValue;
  const callLine = assignResult && plan.hasReturnValue
    ? `$result = ${plan.callExpression};`
    : `${plan.callExpression};`;
  return setupLines.length > 0 ? `${setupLines.join('\n')}\n${callLine}` : callLine;
}

export function resolvePhpExpectedRequestPath(path: string, apiPrefix: string): string {
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

function generatePhpOperationName(
  method: string,
  path: string,
  operation: GeneratedApiOperation,
  tag: string,
): string {
  if (operation.operationId) {
    const normalized = normalizeOperationId(operation.operationId);
    return PHP_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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

  return PHP_CONFIG.namingConventions.methodName(`${actionMap[method] || method}_${resource}`);
}

function renderAssocArrayEntries(
  ctx: SchemaContext,
  schema: ApiSchema | undefined,
  mediaType: string,
): Array<{ name: string; value: PhpNamedValue }> {
  const entries: Array<{ name: string; value: PhpNamedValue }> = [];
  const properties = schema?.properties ? Object.entries(schema.properties) : [];
  if (properties.length > 0) {
    for (let index = 0; index < properties.length; index += 1) {
      const [propertyName, propertySchema] = properties[index];
      entries.push({
        name: propertyName,
        value: renderInlinePhpValue(ctx, propertySchema, propertyName, index, mediaType, 1)
          || buildScalarPhpValue(propertyName, propertySchema, index, mediaType),
      });
    }
    return entries;
  }

  if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
    entries.push({
      name: 'value',
      value: renderInlinePhpValue(ctx, schema.additionalProperties, 'value', 0, mediaType, 1)
        || buildScalarPhpValue('value', schema.additionalProperties, 0, mediaType),
    });
    return entries;
  }

  if (mediaType.startsWith('multipart/form-data') || mediaType.startsWith('application/x-www-form-urlencoded')) {
    entries.push({
      name: 'value',
      value: buildScalarPhpValue('value', { type: 'string' }, 0, mediaType),
    });
  }

  return entries;
}

function renderInlinePhpValue(
  ctx: SchemaContext,
  schema: ApiSchema | undefined,
  fallbackName: string,
  index: number,
  mediaType: string,
  depth: number,
): PhpNamedValue | undefined {
  const resolvedSchema = resolveSchema(ctx, schema);
  const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    return buildLiteralValue(enumValues[0]);
  }
  if (!resolvedSchema || depth > 2) {
    return undefined;
  }

  if (schema?.$ref) {
    const modelType = getPhpType(schema, PHP_CONFIG);
    return {
      phpExpression: `new ${modelType}()`,
      jsonValue: {},
      stringValue: '[object]',
      modelImports: [modelType],
    };
  }

  const normalizedType = normalizeSchemaType(resolvedSchema.type) || inferImplicitObjectType(resolvedSchema);
  switch (normalizedType) {
    case 'integer': {
      const value = index + 1;
      return { phpExpression: String(value), jsonValue: value, stringValue: String(value), modelImports: [] };
    }
    case 'number': {
      const value = index + 1;
      return { phpExpression: `${value}.0`, jsonValue: value, stringValue: String(value), modelImports: [] };
    }
    case 'boolean': {
      const value = index % 2 === 0;
      return {
        phpExpression: value ? 'true' : 'false',
        jsonValue: value,
        stringValue: value ? 'true' : 'false',
        modelImports: [],
      };
    }
    case 'array': {
      const itemValue = renderInlinePhpValue(ctx, resolvedSchema.items, fallbackName, index, mediaType, depth + 1)
        || buildScalarPhpValue(fallbackName, resolvedSchema.items, index, mediaType);
      return {
        phpExpression: `[${itemValue.phpExpression}]`,
        jsonValue: [itemValue.jsonValue],
        stringValue: String(itemValue.stringValue),
        modelImports: itemValue.modelImports,
      };
    }
    case 'object': {
      const entries = renderAssocArrayEntries(ctx, resolvedSchema, mediaType);
      const jsonValue = Object.fromEntries(entries.map((entry) => [entry.name, entry.value.jsonValue]));
      return {
        phpExpression: `[${entries.map((entry) => `${quotePhpString(entry.name)} => ${entry.value.phpExpression}`).join(', ')}]`,
        jsonValue,
        stringValue: JSON.stringify(jsonValue),
        modelImports: collectModelImports(entries.map((entry) => entry.value)),
      };
    }
    case 'string':
    default:
      return buildScalarPhpValue(fallbackName, resolvedSchema, index, mediaType);
  }
}

function buildScalarPhpValue(
  fallbackName: string,
  schema: ApiSchema | undefined,
  index: number,
  mediaType?: string,
): PhpNamedValue {
  const normalizedType = normalizeSchemaType(schema?.type) || inferImplicitObjectType(schema);
  if (normalizedType === 'integer') {
    const value = index + 1;
    return { phpExpression: String(value), jsonValue: value, stringValue: String(value), modelImports: [] };
  }
  if (normalizedType === 'number') {
    const value = index + 1;
    return { phpExpression: `${value}.0`, jsonValue: value, stringValue: String(value), modelImports: [] };
  }
  if (normalizedType === 'boolean') {
    const value = index % 2 === 0;
    return {
      phpExpression: value ? 'true' : 'false',
      jsonValue: value,
      stringValue: value ? 'true' : 'false',
      modelImports: [],
    };
  }

  const sampleString = sampleStringValue(fallbackName, index, schema, mediaType);
  return {
    phpExpression: quotePhpString(sampleString),
    jsonValue: sampleString,
    stringValue: sampleString,
    modelImports: [],
  };
}

function buildParameterValue(ctx: SchemaContext, parameter: ApiParameter, index: number): PhpNamedValue {
  const resolvedSchema = resolveSchema(ctx, parameter?.schema);
  const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    return buildLiteralValue(enumValues[0]);
  }
  return buildScalarPhpValue(parameter.name || `value${index + 1}`, resolvedSchema, index);
}

function buildHeaderValue(ctx: SchemaContext, parameter: ApiParameter, index: number): PhpNamedValue {
  const resolvedSchema = resolveSchema(ctx, parameter?.schema);
  const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    const value = String(enumValues[0]);
    return {
      phpExpression: quotePhpString(value),
      jsonValue: value,
      stringValue: value,
      modelImports: [],
    };
  }

  const normalizedType = normalizeSchemaType(resolvedSchema?.type);
  if (normalizedType === 'integer' || normalizedType === 'number') {
    const value = String(index + 1);
    return {
      phpExpression: quotePhpString(value),
      jsonValue: value,
      stringValue: value,
      modelImports: [],
    };
  }
  if (normalizedType === 'boolean') {
    const value = index % 2 === 0 ? 'true' : 'false';
    return {
      phpExpression: quotePhpString(value),
      jsonValue: value,
      stringValue: value,
      modelImports: [],
    };
  }
  return buildScalarPhpValue(parameter.name || `header${index + 1}`, resolvedSchema, index);
}

function buildLiteralValue(value: unknown): PhpNamedValue {
  if (typeof value === 'number') {
    return { phpExpression: String(value), jsonValue: value, stringValue: String(value), modelImports: [] };
  }
  if (typeof value === 'boolean') {
    return {
      phpExpression: value ? 'true' : 'false',
      jsonValue: value,
      stringValue: value ? 'true' : 'false',
      modelImports: [],
    };
  }

  const stringValue = String(value ?? 'value');
  return {
    phpExpression: quotePhpString(stringValue),
    jsonValue: stringValue,
    stringValue,
    modelImports: [],
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
      return depth + 1;
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
  if (!schema || responseType === 'void') {
    return [];
  }

  if (responseType === 'array' || responseType === 'mixed') {
    return ['self::assertNotNull($result);'];
  }

  const resolvedSchema = resolveSchema(ctx, schema);
  const properties = resolvedSchema?.properties ? Object.entries(resolvedSchema.properties) : [];
  if (properties.length === 0) {
    return ['self::assertNotNull($result);'];
  }

  const assertions: string[] = ['self::assertNotNull($result);'];
  const required = new Set<string>(getRequiredPropertyNames(resolvedSchema));

  for (let index = 0; index < properties.length; index += 1) {
    const [propertyName, propertySchema] = properties[index];
    const propertyAccess = required.has(propertyName)
      ? `$result->${PHP_CONFIG.namingConventions.propertyName(propertyName)}`
      : `$result?->${PHP_CONFIG.namingConventions.propertyName(propertyName)}`;
    const resolvedPropertySchema = resolveSchema(ctx, propertySchema);
    const normalizedType = normalizeSchemaType(resolvedPropertySchema?.type)
      || inferImplicitObjectType(resolvedPropertySchema);
    if (propertySchema?.$ref) {
      assertions.push(`self::assertNotNull(${propertyAccess});`);
      continue;
    }

    switch (normalizedType) {
      case 'integer':
        assertions.push(`self::assertSame(${index + 1}, ${propertyAccess});`);
        break;
      case 'number':
        assertions.push(`self::assertSame(${index + 1}.0, ${propertyAccess});`);
        break;
      case 'boolean':
        assertions.push(`self::assertSame(true, ${propertyAccess});`);
        break;
      case 'array':
      case 'object':
        assertions.push(`self::assertNotNull(${propertyAccess});`);
        break;
      case 'string':
      default:
        assertions.push(`self::assertSame(${quotePhpString(sampleStringValue(propertyName, index, resolvedPropertySchema))}, ${propertyAccess});`);
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
  return responseType === 'void' ? 204 : 200;
}

function extractPathParams(path: string): string[] {
  const matches = path.match(/\{([^}]+)\}/g) || [];
  return matches.map((match) => match.replace(/[{}]/g, ''));
}

function extractRequestBodyInfo(operation: GeneratedApiOperation): { mediaType: string; schema: ApiSchema } | undefined {
  const content = operation.requestBody?.content;
  if (!content || typeof content !== 'object') {
    return undefined;
  }

  const mediaType = pickRequestBodyMediaType(content as Record<string, any>);
  const schema = mediaType ? (content as Record<string, any>)[mediaType]?.schema : undefined;
  return mediaType && schema ? { mediaType, schema } : undefined;
}

function extractResponseSchema(operation: GeneratedApiOperation): ApiSchema | undefined {
  const responses = operation.responses;
  if (!responses || typeof responses !== 'object') {
    return undefined;
  }

  const statusCodes = Object.keys(responses).sort();
  const preferred = statusCodes.filter((code) => /^2\d\d$/.test(code));
  for (const code of (preferred.length > 0 ? preferred : statusCodes)) {
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
    return 'mixed';
  }

  const statusCodes = Object.keys(responses);
  if (statusCodes.length === 0) {
    return 'mixed';
  }

  const allNoContent = statusCodes.every((code) => {
    const content = responses[code]?.content;
    return !content || typeof content !== 'object' || Object.keys(content).length === 0;
  });

  return allNoContent || responses['204'] ? 'void' : 'mixed';
}

function pickRequestBodyMediaType(content: Record<string, any>): string | undefined {
  const mediaTypes = Object.keys(content);
  for (const preferred of ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded']) {
    const matched = mediaTypes.find((mediaType) => mediaType.toLowerCase() === preferred);
    if (matched) {
      return matched;
    }
  }
  return mediaTypes.find((mediaType) => mediaType.toLowerCase().endsWith('+json')) || mediaTypes[0];
}

function pickJsonMediaType(content: Record<string, any>): string | undefined {
  const mediaTypes = Object.keys(content);
  return mediaTypes.find((mediaType) => {
    const normalized = mediaType.toLowerCase();
    return normalized === 'application/json' || normalized.endsWith('+json');
  }) || mediaTypes[0];
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
  return composed ? (resolveSchema(ctx, composed) || composed) : schema;
}

function sampleStringValue(fallbackName: string, index: number, schema?: ApiSchema, mediaType?: string): string {
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
  if (normalizedName.includes('token')) return 'token';
  if (normalizedName.includes('name')) return 'name';
  return normalizedName ? normalizedName.replace(/[^a-z0-9]+/g, '-') : `value${index + 1}`;
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
  return schema.properties || schema.additionalProperties ? 'object' : undefined;
}

function getRequiredPropertyNames(schema: ApiSchema | undefined): string[] {
  const required = (schema as { required?: unknown } | undefined)?.required;
  return Array.isArray(required) ? required.filter((value): value is string => typeof value === 'string') : [];
}

function pickComposedSchema(schema: ApiSchema | undefined): ApiSchema | undefined {
  for (const key of ['allOf', 'oneOf', 'anyOf'] as const) {
    const values = schema?.[key];
    if (!Array.isArray(values) || values.length === 0) {
      continue;
    }
    return values.find((entry) => entry && normalizeSchemaType(entry.type) !== 'null') || values[0];
  }
  return undefined;
}

function quotePhpString(value: string): string {
  return `'${String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function collectModelImports(values: PhpNamedValue[]): string[] {
  return Array.from(new Set(values.flatMap((value) => value.modelImports))).sort((left, right) => left.localeCompare(right));
}
