import type { ApiParameter, ApiSchema, GeneratedApiOperation, SchemaContext } from '../../framework/types.js';
import { createUniqueIdentifierMap, toSafeCamelIdentifier } from '../../framework/identifiers.js';
import {
  normalizeOperationId,
  resolveScopedMethodNames,
  resolveSimplifiedTagNames,
  stripTagPrefixFromOperationId,
} from '../../framework/naming.js';
import { CSHARP_CONFIG, getCSharpType } from './config.js';

const BODY_METHODS = new Set(['post', 'put', 'patch']);
const DEFAULT_PREFERRED_MODULES = ['tenant', 'user', 'app', 'auth', 'workspace'];
const CSHARP_JSON_CONTENT_TYPE = 'application/json';
const CSHARP_RESERVED_WORDS = new Set([
  'abstract',
  'base',
  'bool',
  'class',
  'default',
  'event',
  'in',
  'int',
  'namespace',
  'object',
  'operator',
  'out',
  'params',
  'string',
  'void',
]);

export type CSharpUsageRenderMode = 'readme' | 'test';

export interface CSharpUsageVariable {
  name: string;
  kind: 'path' | 'body' | 'query' | 'headers';
  setupByMode: Record<CSharpUsageRenderMode, string[]>;
}

export interface CSharpUsageExpectation {
  name: string;
  expected: string;
}

export interface CSharpBodyAssertionPlan {
  kind: 'json' | 'non-empty';
  contentType: string;
  contentTypeMatch: 'exact' | 'prefix';
}

export interface CSharpUsagePlan {
  tag: string;
  moduleName: string;
  methodName: string;
  operation: GeneratedApiOperation;
  transportMethod: string;
  requestBodyMediaType?: string;
  variables: CSharpUsageVariable[];
  callExpression: string;
  queryExpectations: CSharpUsageExpectation[];
  headerExpectations: CSharpUsageExpectation[];
  bodyAssertion?: CSharpBodyAssertionPlan;
  responseType: string;
  hasReturnValue: boolean;
  responseStatusCode: number;
  responseBody?: string;
  responseAssertions: string[];
  usesModelNamespace: boolean;
}

interface CSharpNamedValue {
  csharpExpression: string;
  jsonValue: unknown;
  stringValue: string;
  usesModelNamespace: boolean;
}

interface CSharpBodyVariablePlan {
  variable: CSharpUsageVariable;
  assertion: CSharpBodyAssertionPlan;
  usesModelNamespace: boolean;
}

export class CSharpUsagePlanner {
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
      Object.keys(ctx.schemas).map((schemaName) => CSHARP_CONFIG.namingConventions.modelName(schemaName)),
    );
  }

  getModuleName(tag: string): string {
    const resolvedTagName = this.resolvedTagNames.get(tag) || tag;
    return CSHARP_CONFIG.namingConventions.propertyName(resolvedTagName);
  }

  selectQuickStartPlan(): CSharpUsagePlan | undefined {
    const tag = this.selectQuickStartTag() || Object.keys(this.ctx.apiGroups)[0];
    return tag ? this.selectPlanForTag(tag) : undefined;
  }

  selectPlanForTag(tag: string): CSharpUsagePlan | undefined {
    const operations = this.ctx.apiGroups[tag]?.operations || [];
    const operation = this.selectOperation(operations);
    if (!operation) {
      return undefined;
    }
    return this.buildPlan(tag, operation);
  }

  private buildPlan(tag: string, operation: GeneratedApiOperation): CSharpUsagePlan {
    const operations = this.ctx.apiGroups[tag]?.operations || [];
    const methodName = resolveCSharpMethodNames(tag, operations).get(operation) || 'Operation';
    const moduleName = this.getModuleName(tag);
    const transportMethod = String(operation.method || '').toLowerCase();
    const variables: CSharpUsageVariable[] = [];
    const callArguments: string[] = [];
    const queryExpectations: CSharpUsageExpectation[] = [];
    const headerExpectations: CSharpUsageExpectation[] = [];

    let usesModelNamespace = false;

    const rawPathParams = extractPathParams(operation.path);
    const pathParamNames = createUniqueIdentifierMap(
      rawPathParams,
      (value) => toSafeCamelIdentifier(value, CSHARP_RESERVED_WORDS),
      ['body', 'query', 'headers'],
    );

    for (let index = 0; index < rawPathParams.length; index += 1) {
      const rawName = rawPathParams[index];
      const variableName = pathParamNames.get(rawName) || toUsageIdentifier(rawName, 'pathParam', index + 1);
      const sampleValue = /id$/i.test(variableName) ? quoteCSharpString('1') : quoteCSharpString(variableName);
      variables.push({
        name: variableName,
        kind: 'path',
        setupByMode: {
          readme: [`var ${variableName} = ${sampleValue};`],
          test: [`var ${variableName} = ${sampleValue};`],
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
      usesModelNamespace = usesModelNamespace || bodyVariable.usesModelNamespace;
    }

    const allParameters = resolveConcreteParameters(operation);
    const queryParams = allParameters.filter((parameter) => parameter?.in === 'query');
    if (queryParams.length > 0) {
      const queryVariable = this.buildQueryVariable(queryParams);
      variables.push(queryVariable.variable);
      queryExpectations.push(...queryVariable.expectations);
      callArguments.push('query');
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
      ? getCSharpType(responseSchema, CSHARP_CONFIG)
      : inferFallbackResponseType(operation);
    const responseStatusCode = resolveSuccessStatusCode(operation, responseType);
    const responseBody = responseType === 'void'
      ? undefined
      : JSON.stringify(buildJsonSampleValue(this.ctx, responseSchema, 'result', 0));
    const responseAssertions = buildResponseAssertions(this.ctx, responseSchema, responseType);

    usesModelNamespace = usesModelNamespace || this.containsKnownModelType(responseType);

    return {
      tag,
      moduleName,
      methodName,
      operation,
      transportMethod,
      requestBodyMediaType: requestBodyInfo?.mediaType,
      variables,
      callExpression: `await client.${moduleName}.${methodName}Async(${callArguments.join(', ')})`,
      queryExpectations,
      headerExpectations,
      bodyAssertion: requestBodyInfo ? buildBodyAssertionPlan(requestBodyInfo.mediaType) : undefined,
      responseType,
      hasReturnValue: responseType !== 'void',
      responseStatusCode,
      responseBody,
      responseAssertions: responseAssertions.length > 0
        ? responseAssertions
        : (responseType !== 'void' ? ['Assert.NotNull(result);'] : []),
      usesModelNamespace,
    };
  }

  private buildBodyVariable(schema: ApiSchema, mediaType: string): CSharpBodyVariablePlan {
    const declaredType = getCSharpType(schema, CSHARP_CONFIG);
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
        assertion: buildBodyAssertionPlan(mediaType),
        usesModelNamespace: true,
      };
    }

    const normalizedType = normalizeSchemaType(resolvedSchema?.type) || inferImplicitObjectType(resolvedSchema);
    if (normalizedType === 'object' || declaredType.startsWith('Dictionary<') || declaredType === 'object') {
      return {
        variable: {
          name: 'body',
          kind: 'body',
          setupByMode: {
            readme: renderDictionaryVariable('body', this.ctx, resolvedSchema, normalizedMediaType),
            test: renderDictionaryVariable('body', this.ctx, resolvedSchema, normalizedMediaType),
          },
        },
        assertion: buildBodyAssertionPlan(mediaType),
        usesModelNamespace: false,
      };
    }

    if (normalizedType === 'array' || declaredType.startsWith('List<')) {
      const itemValue = renderInlineCSharpValue(
        this.ctx,
        resolvedSchema?.items,
        'item',
        0,
        normalizedMediaType,
        1,
      );
      return {
        variable: {
          name: 'body',
          kind: 'body',
          setupByMode: {
            readme: [
              'var body = new List<object>',
              '{',
              itemValue ? `    ${itemValue.csharpExpression},` : '',
              '};',
            ].filter(Boolean),
            test: [
              'var body = new List<object>',
              '{',
              itemValue ? `    ${itemValue.csharpExpression},` : '',
              '};',
            ].filter(Boolean),
          },
        },
        assertion: buildBodyAssertionPlan(mediaType),
        usesModelNamespace: Boolean(itemValue?.usesModelNamespace),
      };
    }

    const scalarValue = renderInlineCSharpValue(this.ctx, resolvedSchema, 'value', 0, normalizedMediaType, 0)
      || buildScalarCSharpValue('value', resolvedSchema, 0, mediaType);
    return {
      variable: {
        name: 'body',
        kind: 'body',
        setupByMode: {
          readme: [`var body = ${scalarValue.csharpExpression};`],
          test: [`var body = ${scalarValue.csharpExpression};`],
        },
      },
      assertion: buildBodyAssertionPlan(mediaType),
      usesModelNamespace: scalarValue.usesModelNamespace,
    };
  }

  private buildQueryVariable(parameters: ApiParameter[]): {
    variable: CSharpUsageVariable;
    expectations: CSharpUsageExpectation[];
  } {
    return buildDictionaryParameterVariable('query', parameters, (parameter, index) =>
      buildParameterValue(this.ctx, parameter, index));
  }

  private buildHeaderVariable(parameters: ApiParameter[]): {
    variable: CSharpUsageVariable;
    expectations: CSharpUsageExpectation[];
  } {
    return buildDictionaryParameterVariable('headers', parameters, (parameter, index) =>
      buildHeaderValue(this.ctx, parameter, index), 'string');
  }

  private renderModelVariable(variableName: string, typeName: string, schema: ApiSchema | undefined): string[] {
    const properties = schema?.properties ? Object.entries(schema.properties) : [];
    if (properties.length === 0) {
      return [`var ${variableName} = new ${typeName}();`];
    }

    const lines = [`var ${variableName} = new ${typeName}`, '{'];
    for (let index = 0; index < properties.length; index += 1) {
      const [propertyName, propertySchema] = properties[index];
      const rendered = renderInlineCSharpValue(
        this.ctx,
        propertySchema,
        propertyName,
        index,
        CSHARP_JSON_CONTENT_TYPE,
        1,
      );
      if (!rendered) {
        continue;
      }
      lines.push(`    ${CSHARP_CONFIG.namingConventions.propertyName(propertyName)} = ${rendered.csharpExpression},`);
    }
    lines.push('};');
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

  private containsKnownModelType(typeName: string): boolean {
    const normalized = String(typeName || '');
    return Array.from(this.knownModels).some((modelName) => {
      const escaped = modelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`).test(normalized);
    });
  }

  private isKnownModelType(typeName: string): boolean {
    return this.knownModels.has(typeName);
  }
}

export function resolveCSharpMethodNames(
  tag: string,
  operations: GeneratedApiOperation[],
): Map<GeneratedApiOperation, string> {
  if (!Array.isArray(operations) || operations.length === 0) {
    return new Map<GeneratedApiOperation, string>();
  }

  return resolveScopedMethodNames(operations, (operation) => generateCSharpOperationName(
    operation.method,
    operation.path,
    operation,
    tag,
  ));
}

export function renderCSharpUsageSnippet(
  plan: CSharpUsagePlan,
  mode: CSharpUsageRenderMode,
  options: { assignResult?: boolean; resultVariableName?: string } = {},
): string {
  const setupLines = plan.variables.flatMap((variable) => variable.setupByMode[mode]);
  const assignResult = options.assignResult ?? (mode === 'readme' && plan.hasReturnValue);
  const resultVariableName = options.resultVariableName || 'result';
  const callLine = assignResult && plan.hasReturnValue
    ? `var ${resultVariableName} = ${plan.callExpression};`
    : `${plan.callExpression};`;
  return setupLines.length > 0 ? `${setupLines.join('\n')}\n${callLine}` : callLine;
}

export function resolveCSharpExpectedRequestPath(path: string, apiPrefix: string): string {
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

function generateCSharpOperationName(
  method: string,
  path: string,
  operation: GeneratedApiOperation,
  tag: string,
): string {
  if (operation.operationId) {
    const normalized = normalizeOperationId(operation.operationId);
    return CSHARP_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
  }

  const pathParts = path.split('/').filter(Boolean);
  const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
  const actionMap: Record<string, string> = {
    get: path.includes('{') ? 'Get' : 'List',
    post: 'Create',
    put: 'Update',
    patch: 'Patch',
    delete: 'Delete',
  };

  return `${actionMap[method] || CSHARP_CONFIG.namingConventions.modelName(method)}${CSHARP_CONFIG.namingConventions.modelName(resource)}`;
}

function buildBodyAssertionPlan(mediaType: string): CSharpBodyAssertionPlan {
  const normalized = String(mediaType || '').toLowerCase();
  if (normalized === CSHARP_JSON_CONTENT_TYPE || normalized.endsWith('+json')) {
    return {
      kind: 'json',
      contentType: CSHARP_JSON_CONTENT_TYPE,
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

function buildDictionaryParameterVariable(
  variableName: 'query' | 'headers',
  parameters: ApiParameter[],
  renderValue: (parameter: ApiParameter, index: number) => CSharpNamedValue,
  valueType: 'object' | 'string' = 'object',
): { variable: CSharpUsageVariable; expectations: CSharpUsageExpectation[] } {
  const expectations: CSharpUsageExpectation[] = [];
  const lines = [`var ${variableName} = new Dictionary<string, ${valueType}>`, '{'];
  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = parameters[index];
    const sample = renderValue(parameter, index);
    expectations.push({ name: parameter.name, expected: sample.stringValue });
    lines.push(`    [${quoteCSharpString(parameter.name)}] = ${sample.csharpExpression},`);
  }
  lines.push('};');

  return {
    variable: {
      name: variableName,
      kind: variableName,
      setupByMode: { readme: lines, test: lines },
    },
    expectations,
  };
}

function renderDictionaryVariable(
  variableName: string,
  ctx: SchemaContext,
  schema: ApiSchema | undefined,
  mediaType: string,
): string[] {
  const entries = renderDictionaryEntries(ctx, schema, mediaType);
  const lines = [`var ${variableName} = new Dictionary<string, object>`, '{'];
  for (const entry of entries) {
    lines.push(`    [${quoteCSharpString(entry.name)}] = ${entry.value.csharpExpression},`);
  }
  lines.push('};');
  return lines;
}

function renderDictionaryEntries(
  ctx: SchemaContext,
  schema: ApiSchema | undefined,
  mediaType: string,
): Array<{ name: string; value: CSharpNamedValue }> {
  const entries: Array<{ name: string; value: CSharpNamedValue }> = [];
  const properties = schema?.properties ? Object.entries(schema.properties) : [];
  if (properties.length > 0) {
    for (let index = 0; index < properties.length; index += 1) {
      const [propertyName, propertySchema] = properties[index];
      entries.push({
        name: propertyName,
        value: renderInlineCSharpValue(ctx, propertySchema, propertyName, index, mediaType, 1)
          || buildScalarCSharpValue(propertyName, propertySchema, index, mediaType),
      });
    }
    return entries;
  }

  if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
    entries.push({
      name: 'value',
      value: renderInlineCSharpValue(ctx, schema.additionalProperties, 'value', 0, mediaType, 1)
        || buildScalarCSharpValue('value', schema.additionalProperties, 0, mediaType),
    });
    return entries;
  }

  if (mediaType.startsWith('multipart/form-data') || mediaType.startsWith('application/x-www-form-urlencoded')) {
    entries.push({
      name: 'value',
      value: buildScalarCSharpValue('value', { type: 'string' }, 0, mediaType),
    });
  }
  return entries;
}

function renderInlineCSharpValue(
  ctx: SchemaContext,
  schema: ApiSchema | undefined,
  fallbackName: string,
  index: number,
  mediaType: string,
  depth: number,
): CSharpNamedValue | undefined {
  const resolvedSchema = resolveSchema(ctx, schema);
  const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    return buildLiteralValue(enumValues[0]);
  }
  if (!resolvedSchema || depth > 2) {
    return undefined;
  }

  if (schema?.$ref) {
    const modelType = getCSharpType(schema, CSHARP_CONFIG);
    return {
      csharpExpression: `new ${modelType}()`,
      jsonValue: {},
      stringValue: '[object]',
      usesModelNamespace: true,
    };
  }

  const normalizedType = normalizeSchemaType(resolvedSchema.type) || inferImplicitObjectType(resolvedSchema);
  switch (normalizedType) {
    case 'integer':
    case 'number': {
      const value = index + 1;
      return {
        csharpExpression: String(value),
        jsonValue: value,
        stringValue: String(value),
        usesModelNamespace: false,
      };
    }
    case 'boolean': {
      const value = index % 2 === 0;
      return {
        csharpExpression: value ? 'true' : 'false',
        jsonValue: value,
        stringValue: value ? 'true' : 'false',
        usesModelNamespace: false,
      };
    }
    case 'array': {
      const itemValue = renderInlineCSharpValue(ctx, resolvedSchema.items, fallbackName, index, mediaType, depth + 1)
        || buildScalarCSharpValue(fallbackName, resolvedSchema.items, index, mediaType);
      return {
        csharpExpression: `new List<object> { ${itemValue.csharpExpression} }`,
        jsonValue: [itemValue.jsonValue],
        stringValue: String(itemValue.stringValue),
        usesModelNamespace: itemValue.usesModelNamespace,
      };
    }
    case 'object': {
      const entries = renderDictionaryEntries(ctx, resolvedSchema, mediaType);
      const jsonValue = Object.fromEntries(entries.map((entry) => [entry.name, entry.value.jsonValue]));
      return {
        csharpExpression: 'new Dictionary<string, object>()',
        jsonValue,
        stringValue: JSON.stringify(jsonValue),
        usesModelNamespace: entries.some((entry) => entry.value.usesModelNamespace),
      };
    }
    case 'string':
    default:
      return buildScalarCSharpValue(fallbackName, resolvedSchema, index, mediaType);
  }
}

function buildScalarCSharpValue(
  fallbackName: string,
  schema: ApiSchema | undefined,
  index: number,
  mediaType?: string,
): CSharpNamedValue {
  const sampleString = sampleStringValue(fallbackName, index, schema, mediaType);
  return {
    csharpExpression: quoteCSharpString(sampleString),
    jsonValue: sampleString,
    stringValue: sampleString,
    usesModelNamespace: false,
  };
}

function buildParameterValue(ctx: SchemaContext, parameter: ApiParameter, index: number): CSharpNamedValue {
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
        csharpExpression: String(value),
        jsonValue: value,
        stringValue: String(value),
        usesModelNamespace: false,
      };
    }
    case 'boolean': {
      const value = index % 2 === 0;
      return {
        csharpExpression: value ? 'true' : 'false',
        jsonValue: value,
        stringValue: value ? 'true' : 'false',
        usesModelNamespace: false,
      };
    }
    default:
      return buildScalarCSharpValue(parameter.name || `value${index + 1}`, resolvedSchema, index);
  }
}

function buildHeaderValue(ctx: SchemaContext, parameter: ApiParameter, index: number): CSharpNamedValue {
  const resolvedSchema = resolveSchema(ctx, parameter?.schema);
  const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    const value = String(enumValues[0]);
    return {
      csharpExpression: quoteCSharpString(value),
      jsonValue: value,
      stringValue: value,
      usesModelNamespace: false,
    };
  }

  switch (normalizeSchemaType(resolvedSchema?.type)) {
    case 'integer':
    case 'number': {
      const value = String(index + 1);
      return {
        csharpExpression: quoteCSharpString(value),
        jsonValue: value,
        stringValue: value,
        usesModelNamespace: false,
      };
    }
    case 'boolean': {
      const value = index % 2 === 0 ? 'true' : 'false';
      return {
        csharpExpression: quoteCSharpString(value),
        jsonValue: value,
        stringValue: value,
        usesModelNamespace: false,
      };
    }
  }
  return buildScalarCSharpValue(parameter.name || `header${index + 1}`, resolvedSchema, index);
}

function buildLiteralValue(value: unknown): CSharpNamedValue {
  if (typeof value === 'number') {
    return {
      csharpExpression: String(value),
      jsonValue: value,
      stringValue: String(value),
      usesModelNamespace: false,
    };
  }
  if (typeof value === 'boolean') {
    return {
      csharpExpression: value ? 'true' : 'false',
      jsonValue: value,
      stringValue: value ? 'true' : 'false',
      usesModelNamespace: false,
    };
  }
  const stringValue = String(value ?? 'value');
  return {
    csharpExpression: quoteCSharpString(stringValue),
    jsonValue: stringValue,
    stringValue,
    usesModelNamespace: false,
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
  if (!schema || responseType === 'void' || responseType.startsWith('Dictionary<') || responseType.startsWith('List<') || responseType === 'object') {
    return responseType === 'void' ? [] : ['Assert.NotNull(result);'];
  }

  const resolvedSchema = resolveSchema(ctx, schema);
  const properties = resolvedSchema?.properties ? Object.entries(resolvedSchema.properties) : [];
  if (properties.length === 0) {
    return ['Assert.NotNull(result);'];
  }

  const assertions: string[] = ['Assert.NotNull(result);'];
  for (let index = 0; index < properties.length; index += 1) {
    const [propertyName, propertySchema] = properties[index];
    const propertyAccess = `result!.${CSHARP_CONFIG.namingConventions.propertyName(propertyName)}`;
    const resolvedPropertySchema = resolveSchema(ctx, propertySchema);
    const normalizedType = normalizeSchemaType(resolvedPropertySchema?.type)
      || inferImplicitObjectType(resolvedPropertySchema);
    if (propertySchema?.$ref) {
      assertions.push(`Assert.NotNull(${propertyAccess});`);
      continue;
    }
    switch (normalizedType) {
      case 'integer':
      case 'number':
        assertions.push(`Assert.Equal(${index + 1}, ${propertyAccess});`);
        break;
      case 'boolean':
        assertions.push(`Assert.Equal(true, ${propertyAccess});`);
        break;
      case 'array':
      case 'object':
        assertions.push(`Assert.NotNull(${propertyAccess});`);
        break;
      case 'string':
      default:
        assertions.push(`Assert.Equal(${quoteCSharpString(sampleStringValue(propertyName, index, resolvedPropertySchema))}, ${propertyAccess});`);
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
    return 'void';
  }

  const statusCodes = Object.keys(responses);
  if (statusCodes.length === 0) {
    return 'void';
  }

  const allNoContent = statusCodes.every((code) => {
    const content = responses[code]?.content;
    return !content || typeof content !== 'object' || Object.keys(content).length === 0;
  });

  if (allNoContent || responses['204']) {
    return 'void';
  }
  return 'object';
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
  const cleaned = toSafeCamelIdentifier(rawName || '', CSHARP_RESERVED_WORDS, `${fallbackPrefix}${index}`);
  return cleaned || `${fallbackPrefix}${index}`;
}

function quoteCSharpString(value: string): string {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
