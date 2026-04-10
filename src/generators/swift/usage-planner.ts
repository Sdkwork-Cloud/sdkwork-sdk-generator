import type { ApiParameter, ApiSchema, GeneratedApiOperation, SchemaContext } from '../../framework/types.js';
import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import {
  normalizeOperationId,
  resolveScopedMethodNames,
  resolveSimplifiedTagNames,
  stripTagPrefixFromOperationId,
} from '../../framework/naming.js';
import { SWIFT_CONFIG, getSwiftType } from './config.js';

const BODY_METHODS = new Set(['post', 'put', 'patch']);
const DEFAULT_PREFERRED_MODULES = ['tenant', 'user', 'app', 'auth', 'workspace'];

export type SwiftUsageRenderMode = 'readme' | 'test';

export interface SwiftUsageVariable {
  name: string;
  kind: 'path' | 'body' | 'params' | 'headers';
  setupByMode: Record<SwiftUsageRenderMode, string[]>;
}

export interface SwiftUsageExpectation {
  name: string;
  expected: string;
}

export interface SwiftBodyAssertionPlan {
  kind: 'json' | 'non-empty';
  contentType: string;
  contentTypeMatch: 'exact' | 'prefix';
  encodedBodyExpression?: string;
}

export interface SwiftUsagePlan {
  tag: string;
  moduleName: string;
  methodName: string;
  operation: GeneratedApiOperation;
  transportMethod: string;
  requestBodyMediaType?: string;
  variables: SwiftUsageVariable[];
  callExpression: string;
  queryExpectations: SwiftUsageExpectation[];
  headerExpectations: SwiftUsageExpectation[];
  bodyAssertion?: SwiftBodyAssertionPlan;
  responseType: string;
  hasReturnValue: boolean;
  responseStatusCode: number;
  responseBody?: string;
  responseAssertions: string[];
}

interface SwiftNamedValue {
  swiftExpression: string;
  jsonValue: unknown;
  stringValue: string;
}

interface SwiftBodyVariablePlan {
  variable: SwiftUsageVariable;
  assertion: SwiftBodyAssertionPlan;
}

export class SwiftUsagePlanner {
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
      Object.keys(ctx.schemas).map((schemaName) => SWIFT_CONFIG.namingConventions.modelName(schemaName)),
    );
  }

  getModuleName(tag: string): string {
    const resolvedTagName = this.resolvedTagNames.get(tag) || tag;
    return SWIFT_CONFIG.namingConventions.propertyName(resolvedTagName);
  }

  selectQuickStartPlan(): SwiftUsagePlan | undefined {
    const tag = this.selectQuickStartTag() || Object.keys(this.ctx.apiGroups)[0];
    return tag ? this.selectPlanForTag(tag) : undefined;
  }

  selectPlanForTag(tag: string): SwiftUsagePlan | undefined {
    const operations = this.ctx.apiGroups[tag]?.operations || [];
    const operation = this.selectOperation(operations);
    if (!operation) {
      return undefined;
    }
    return this.buildPlan(tag, operation);
  }

  private buildPlan(tag: string, operation: GeneratedApiOperation): SwiftUsagePlan {
    const operations = this.ctx.apiGroups[tag]?.operations || [];
    const methodName = resolveSwiftMethodNames(tag, operations).get(operation) || 'operation';
    const moduleName = this.getModuleName(tag);
    const transportMethod = String(operation.method || '').toLowerCase();
    const variables: SwiftUsageVariable[] = [];
    const callArguments: string[] = [];
    const queryExpectations: SwiftUsageExpectation[] = [];
    const headerExpectations: SwiftUsageExpectation[] = [];

    const rawPathParams = extractPathParams(operation.path);
    const pathParamNames = createUniqueIdentifierMap(
      rawPathParams,
      (value) => SWIFT_CONFIG.namingConventions.propertyName(value),
      ['body', 'params', 'headers'],
    );

    for (let index = 0; index < rawPathParams.length; index += 1) {
      const rawName = rawPathParams[index];
      const variableName = pathParamNames.get(rawName) || toUsageIdentifier(rawName, 'pathParam', index + 1);
      const sampleValue = /id$/i.test(variableName) ? quoteSwiftString('1') : quoteSwiftString(variableName);
      variables.push({
        name: variableName,
        kind: 'path',
        setupByMode: {
          readme: [`let ${variableName} = ${sampleValue}`],
          test: [`let ${variableName} = ${sampleValue}`],
        },
      });
      callArguments.push(`${variableName}: ${variableName}`);
    }

    const requestBodyInfo = BODY_METHODS.has(transportMethod) ? extractRequestBodyInfo(operation) : undefined;
    const bodyVariable = requestBodyInfo ? this.buildBodyVariable(requestBodyInfo.schema, requestBodyInfo.mediaType) : undefined;
    if (bodyVariable) {
      variables.push(bodyVariable.variable);
      callArguments.push('body: body');
    }

    const allParameters = resolveConcreteParameters(operation);
    const queryParams = allParameters.filter((parameter) => parameter?.in === 'query');
    if (queryParams.length > 0) {
      const queryVariable = this.buildQueryVariable(queryParams);
      variables.push(queryVariable.variable);
      queryExpectations.push(...queryVariable.expectations);
      callArguments.push('params: params');
    }

    const headerParams = allParameters.filter((parameter) => parameter?.in === 'header' || parameter?.in === 'cookie');
    if (headerParams.length > 0) {
      const headerVariable = this.buildHeaderVariable(headerParams);
      variables.push(headerVariable.variable);
      headerExpectations.push(...headerVariable.expectations);
      callArguments.push('headers: headers');
    }

    const responseSchema = extractResponseSchema(operation);
    const responseType = responseSchema ? getSwiftType(responseSchema, SWIFT_CONFIG) : inferFallbackResponseType(operation);
    const responseStatusCode = resolveSuccessStatusCode(operation, responseType);
    const responseBody = responseType === 'Void'
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
      callExpression: `try await client.${moduleName}.${methodName}(${callArguments.join(', ')})`,
      queryExpectations,
      headerExpectations,
      bodyAssertion: bodyVariable?.assertion,
      responseType,
      hasReturnValue: responseType !== 'Void',
      responseStatusCode,
      responseBody,
      responseAssertions: responseAssertions.length > 0 ? responseAssertions : (responseType !== 'Void' ? ['XCTAssertNotNil(result)'] : []),
    };
  }

  private buildBodyVariable(schema: ApiSchema, mediaType: string): SwiftBodyVariablePlan {
    const declaredType = getSwiftType(schema, SWIFT_CONFIG);
    const resolvedSchema = resolveSchema(this.ctx, schema);
    const normalizedMediaType = String(mediaType || '').toLowerCase();

    if (this.isKnownModelType(declaredType)) {
      const lines = this.renderModelVariable('body', declaredType, resolvedSchema);
      return {
        variable: { name: 'body', kind: 'body', setupByMode: { readme: lines, test: lines } },
        assertion: buildBodyAssertionPlan(normalizedMediaType, canEncodeDirectly(declaredType)),
      };
    }

    const normalizedType = normalizeSchemaType(resolvedSchema?.type) || inferImplicitObjectType(resolvedSchema);
    if (normalizedType === 'object' || declaredType.startsWith('[String:') || declaredType === 'Any') {
      const lines = renderDictionaryVariable(this.ctx, resolvedSchema, normalizedMediaType);
      return {
        variable: { name: 'body', kind: 'body', setupByMode: { readme: lines, test: lines } },
        assertion: buildBodyAssertionPlan(normalizedMediaType, false),
      };
    }

    if (normalizedType === 'array' || declaredType.startsWith('[')) {
      const itemValue = renderInlineSwiftValue(this.ctx, resolvedSchema?.items, 'item', 0, normalizedMediaType, 1);
      const lines = itemValue ? [`let body = [${itemValue.swiftExpression}]`] : ['let body = [Any]()'];
      return {
        variable: { name: 'body', kind: 'body', setupByMode: { readme: lines, test: lines } },
        assertion: buildBodyAssertionPlan(normalizedMediaType, canEncodeDirectly(declaredType)),
      };
    }

    const scalarValue = renderInlineSwiftValue(this.ctx, resolvedSchema, 'value', 0, normalizedMediaType, 0)
      || buildScalarSwiftValue('value', resolvedSchema, 0, mediaType);
    const lines = [`let body = ${scalarValue.swiftExpression}`];
    return {
      variable: { name: 'body', kind: 'body', setupByMode: { readme: lines, test: lines } },
      assertion: buildBodyAssertionPlan(normalizedMediaType, canEncodeDirectly(declaredType)),
    };
  }

  private buildQueryVariable(parameters: ApiParameter[]): { variable: SwiftUsageVariable; expectations: SwiftUsageExpectation[] } {
    const expectations: SwiftUsageExpectation[] = [];
    const lines = ['let params: [String: Any] = ['];
    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      const sample = buildParameterValue(this.ctx, parameter, index);
      expectations.push({ name: parameter.name, expected: sample.stringValue });
      lines.push(`    ${quoteSwiftString(parameter.name)}: ${sample.swiftExpression}${index < parameters.length - 1 ? ',' : ''}`);
    }
    lines.push(']');
    return {
      variable: { name: 'params', kind: 'params', setupByMode: { readme: lines, test: lines } },
      expectations,
    };
  }

  private buildHeaderVariable(parameters: ApiParameter[]): { variable: SwiftUsageVariable; expectations: SwiftUsageExpectation[] } {
    const expectations: SwiftUsageExpectation[] = [];
    const lines = ['let headers: [String: String] = ['];
    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      const sample = buildHeaderValue(this.ctx, parameter, index);
      expectations.push({ name: parameter.name, expected: sample.stringValue });
      lines.push(`    ${quoteSwiftString(parameter.name)}: ${sample.swiftExpression}${index < parameters.length - 1 ? ',' : ''}`);
    }
    lines.push(']');
    return {
      variable: { name: 'headers', kind: 'headers', setupByMode: { readme: lines, test: lines } },
      expectations,
    };
  }

  private renderModelVariable(variableName: string, typeName: string, schema: ApiSchema | undefined): string[] {
    const entries = (schema?.properties ? Object.entries(schema.properties) : [])
      .map(([propertyName, propertySchema], index) => {
        const rendered = renderInlineSwiftValue(this.ctx, propertySchema, propertyName, index, 'application/json', 1);
        return rendered ? `${SWIFT_CONFIG.namingConventions.propertyName(propertyName)}: ${rendered.swiftExpression}` : '';
      })
      .filter(Boolean);
    if (entries.length === 0) {
      return [`let ${variableName} = ${typeName}()`];
    }
    if (entries.length === 1) {
      return [`let ${variableName} = ${typeName}(${entries[0]})`];
    }
    return [`let ${variableName} = ${typeName}(`, ...entries.map((entry, index) => `    ${entry}${index < entries.length - 1 ? ',' : ''}`), ')'];
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
      if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
      if (left.score !== right.score) return left.score - right.score;
      if (leftPreferred && rightPreferred && left.preferredIndex !== right.preferredIndex) {
        return left.preferredIndex - right.preferredIndex;
      }
      return left.tag.localeCompare(right.tag);
    });
    return candidates[0]?.tag;
  }

  private selectOperation(operations: GeneratedApiOperation[]): GeneratedApiOperation | undefined {
    return operations
      .map((operation, index) => ({ operation, index, score: this.estimateOperationComplexity(operation) }))
      .sort((left, right) => (left.score - right.score) || (left.index - right.index))[0]?.operation;
  }

  private estimateOperationComplexity(operation: GeneratedApiOperation): number {
    const method = String(operation.method || '').toLowerCase();
    const requestBodyInfo = BODY_METHODS.has(method) ? extractRequestBodyInfo(operation) : undefined;
    const allParameters = resolveConcreteParameters(operation);
    let score = 0;
    if (method && method !== 'get') score += 10;
    score += extractPathParams(operation.path).length * 30;
    if (requestBodyInfo) score += operation.requestBody?.required ? 20 : 8;
    score += allParameters.filter((parameter) => isQueryOrHeaderParameter(parameter) && parameter?.required).length * 12;
    score += allParameters.filter((parameter) => isQueryOrHeaderParameter(parameter) && !parameter?.required).length * 3;
    if (extractResponseSchema(operation)) score -= 1;
    return score;
  }

  private isKnownModelType(typeName: string): boolean {
    return this.knownModels.has(typeName);
  }
}

export function resolveSwiftMethodNames(tag: string, operations: GeneratedApiOperation[]): Map<GeneratedApiOperation, string> {
  if (!Array.isArray(operations) || operations.length === 0) {
    return new Map<GeneratedApiOperation, string>();
  }
  return resolveScopedMethodNames(operations, (operation) => generateSwiftOperationName(operation.method, operation.path, operation, tag));
}

export function renderSwiftUsageSnippet(
  plan: SwiftUsagePlan,
  mode: SwiftUsageRenderMode,
  options: { assignResult?: boolean; resultVariableName?: string } = {},
): string {
  const setupLines = plan.variables.flatMap((variable) => variable.setupByMode[mode]);
  const assignResult = options.assignResult ?? (mode === 'readme' && plan.hasReturnValue);
  const resultVariableName = options.resultVariableName || 'result';
  const callLine = assignResult && plan.hasReturnValue ? `let ${resultVariableName} = ${plan.callExpression}` : plan.callExpression;
  return setupLines.length > 0 ? `${setupLines.join('\n')}\n${callLine}` : callLine;
}

export function resolveSwiftExpectedRequestPath(path: string, apiPrefix: string): string {
  const normalizedPath = String(path || '').trim().startsWith('/') ? String(path || '').trim() : `/${String(path || '').trim()}`;
  const prefixRaw = String(apiPrefix || '').trim();
  if (!prefixRaw || prefixRaw === '/') {
    return normalizedPath || '/';
  }
  const normalizedPrefix = `/${prefixRaw.replace(/^\/+|\/+$/g, '')}`;
  if (normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`)) {
    return normalizedPath;
  }
  return `${normalizedPrefix}${normalizedPath || '/'}`;
}

function generateSwiftOperationName(
  method: string,
  path: string,
  operation: GeneratedApiOperation,
  tag: string,
): string {
  if (operation.operationId) {
    const normalized = normalizeOperationId(operation.operationId);
    return SWIFT_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
  }
  const pathParts = path.split('/').filter(Boolean);
  const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
  const actionMap: Record<string, string> = { get: path.includes('{') ? 'get' : 'list', post: 'create', put: 'update', patch: 'patch', delete: 'delete' };
  return `${actionMap[method] || method}${SWIFT_CONFIG.namingConventions.modelName(resource)}`;
}

function buildBodyAssertionPlan(mediaType: string, canUseEncoder: boolean): SwiftBodyAssertionPlan {
  const normalized = String(mediaType || '').toLowerCase();
  if (normalized === 'application/json' || normalized.endsWith('+json')) {
    return {
      kind: 'json',
      contentType: 'application/json',
      contentTypeMatch: 'prefix',
      encodedBodyExpression: canUseEncoder ? 'try encoder.encode(body)' : 'try encodeJSONBody(body, encoder: encoder)',
    };
  }
  if (normalized.startsWith('multipart/form-data')) {
    return { kind: 'non-empty', contentType: 'multipart/form-data', contentTypeMatch: 'prefix' };
  }
  return { kind: 'non-empty', contentType: mediaType, contentTypeMatch: 'exact' };
}

function renderDictionaryVariable(ctx: SchemaContext, schema: ApiSchema | undefined, mediaType: string): string[] {
  const entries = renderDictionaryEntries(ctx, schema, mediaType);
  const lines = ['let body: [String: Any] = ['];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    lines.push(`    ${quoteSwiftString(entry.name)}: ${entry.value.swiftExpression}${index < entries.length - 1 ? ',' : ''}`);
  }
  lines.push(']');
  return lines;
}

function renderDictionaryEntries(
  ctx: SchemaContext,
  schema: ApiSchema | undefined,
  mediaType: string,
): Array<{ name: string; value: SwiftNamedValue }> {
  const entries: Array<{ name: string; value: SwiftNamedValue }> = [];
  const properties = schema?.properties ? Object.entries(schema.properties) : [];
  if (properties.length > 0) {
    for (let index = 0; index < properties.length; index += 1) {
      const [propertyName, propertySchema] = properties[index];
      entries.push({
        name: propertyName,
        value: renderInlineSwiftValue(ctx, propertySchema, propertyName, index, mediaType, 1)
          || buildScalarSwiftValue(propertyName, propertySchema, index, mediaType),
      });
    }
    return entries;
  }
  if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
    entries.push({
      name: 'value',
      value: renderInlineSwiftValue(ctx, schema.additionalProperties, 'value', 0, mediaType, 1)
        || buildScalarSwiftValue('value', schema.additionalProperties, 0, mediaType),
    });
    return entries;
  }
  if (mediaType.startsWith('multipart/form-data') || mediaType.startsWith('application/x-www-form-urlencoded')) {
    entries.push({ name: 'value', value: buildScalarSwiftValue('value', { type: 'string' }, 0, mediaType) });
  }
  return entries;
}

function renderInlineSwiftValue(
  ctx: SchemaContext,
  schema: ApiSchema | undefined,
  fallbackName: string,
  index: number,
  mediaType: string,
  depth: number,
): SwiftNamedValue | undefined {
  const resolvedSchema = resolveSchema(ctx, schema);
  const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    return buildLiteralValue(enumValues[0]);
  }
  if (!resolvedSchema || depth > 2) {
    return undefined;
  }
  if (schema?.$ref) {
    const modelType = getSwiftType(schema, SWIFT_CONFIG);
    return { swiftExpression: `${modelType}()`, jsonValue: {}, stringValue: '[object]' };
  }
  const normalizedType = normalizeSchemaType(resolvedSchema.type) || inferImplicitObjectType(resolvedSchema);
  switch (normalizedType) {
    case 'integer': {
      const value = index + 1;
      return { swiftExpression: String(value), jsonValue: value, stringValue: String(value) };
    }
    case 'number': {
      const value = index + 1;
      return { swiftExpression: `${value}.0`, jsonValue: value, stringValue: String(value) };
    }
    case 'boolean': {
      const value = index % 2 === 0;
      return { swiftExpression: value ? 'true' : 'false', jsonValue: value, stringValue: value ? 'true' : 'false' };
    }
    case 'array': {
      const itemValue = renderInlineSwiftValue(ctx, resolvedSchema.items, fallbackName, index, mediaType, depth + 1)
        || buildScalarSwiftValue(fallbackName, resolvedSchema.items, index, mediaType);
      return { swiftExpression: `[${itemValue.swiftExpression}]`, jsonValue: [itemValue.jsonValue], stringValue: String(itemValue.stringValue) };
    }
    case 'object': {
      const entries = renderDictionaryEntries(ctx, resolvedSchema, mediaType);
      return {
        swiftExpression: '[:]',
        jsonValue: Object.fromEntries(entries.map((entry) => [entry.name, entry.value.jsonValue])),
        stringValue: JSON.stringify(Object.fromEntries(entries.map((entry) => [entry.name, entry.value.jsonValue]))),
      };
    }
    default:
      return buildScalarSwiftValue(fallbackName, resolvedSchema, index, mediaType);
  }
}

function buildScalarSwiftValue(
  fallbackName: string,
  schema: ApiSchema | undefined,
  index: number,
  mediaType?: string,
): SwiftNamedValue {
  const sampleString = sampleStringValue(fallbackName, index, schema, mediaType);
  return { swiftExpression: quoteSwiftString(sampleString), jsonValue: sampleString, stringValue: sampleString };
}

function buildParameterValue(ctx: SchemaContext, parameter: ApiParameter, index: number): SwiftNamedValue {
  const resolvedSchema = resolveSchema(ctx, parameter?.schema);
  const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    return buildLiteralValue(enumValues[0]);
  }
  switch (normalizeSchemaType(resolvedSchema?.type)) {
    case 'integer': {
      const value = index + 1;
      return { swiftExpression: String(value), jsonValue: value, stringValue: String(value) };
    }
    case 'number': {
      const value = index + 1;
      return { swiftExpression: `${value}.0`, jsonValue: value, stringValue: String(value) };
    }
    case 'boolean': {
      const value = index % 2 === 0;
      return { swiftExpression: value ? 'true' : 'false', jsonValue: value, stringValue: value ? 'true' : 'false' };
    }
    default:
      return buildScalarSwiftValue(parameter.name || `value${index + 1}`, resolvedSchema, index);
  }
}

function buildHeaderValue(ctx: SchemaContext, parameter: ApiParameter, index: number): SwiftNamedValue {
  const resolvedSchema = resolveSchema(ctx, parameter?.schema);
  const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    const value = String(enumValues[0]);
    return { swiftExpression: quoteSwiftString(value), jsonValue: value, stringValue: value };
  }
  switch (normalizeSchemaType(resolvedSchema?.type)) {
    case 'integer':
    case 'number': {
      const value = String(index + 1);
      return { swiftExpression: quoteSwiftString(value), jsonValue: value, stringValue: value };
    }
    case 'boolean': {
      const value = index % 2 === 0 ? 'true' : 'false';
      return { swiftExpression: quoteSwiftString(value), jsonValue: value, stringValue: value };
    }
  }
  return buildScalarSwiftValue(parameter.name || `header${index + 1}`, resolvedSchema, index);
}

function buildLiteralValue(value: unknown): SwiftNamedValue {
  if (typeof value === 'number') {
    return { swiftExpression: String(value), jsonValue: value, stringValue: String(value) };
  }
  if (typeof value === 'boolean') {
    return { swiftExpression: value ? 'true' : 'false', jsonValue: value, stringValue: value ? 'true' : 'false' };
  }
  const stringValue = String(value ?? 'value');
  return { swiftExpression: quoteSwiftString(stringValue), jsonValue: stringValue, stringValue };
}

function buildJsonSampleValue(ctx: SchemaContext, schema: ApiSchema | undefined, fallbackName: string, depth: number): unknown {
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
        return Object.fromEntries(properties.map(([propertyName, propertySchema], index) => [
          propertyName,
          buildJsonSampleValue(ctx, propertySchema, propertyName, depth + index + 1),
        ]));
      }
      if (resolvedSchema.additionalProperties && typeof resolvedSchema.additionalProperties === 'object') {
        return { value: buildJsonSampleValue(ctx, resolvedSchema.additionalProperties, 'value', depth + 1) };
      }
      return {};
    }
    default:
      return sampleStringValue(fallbackName, depth, resolvedSchema);
  }
}

function buildResponseAssertions(ctx: SchemaContext, schema: ApiSchema | undefined, responseType: string): string[] {
  if (!schema || responseType === 'Void' || responseType.includes('Any')) {
    return responseType === 'Void' ? [] : ['XCTAssertNotNil(result)'];
  }
  const resolvedSchema = resolveSchema(ctx, schema);
  const properties = resolvedSchema?.properties ? Object.entries(resolvedSchema.properties) : [];
  if (properties.length === 0) {
    return ['XCTAssertNotNil(result)'];
  }
  const assertions: string[] = ['XCTAssertNotNil(result)'];
  for (let index = 0; index < properties.length; index += 1) {
    const [propertyName, propertySchema] = properties[index];
    const fieldName = SWIFT_CONFIG.namingConventions.propertyName(propertyName);
    const resolvedPropertySchema = resolveSchema(ctx, propertySchema);
    const normalizedType = normalizeSchemaType(resolvedPropertySchema?.type)
      || inferImplicitObjectType(resolvedPropertySchema);
    if (propertySchema?.$ref) {
      assertions.push(`XCTAssertNotNil(result?.${fieldName})`);
      continue;
    }
    switch (normalizedType) {
      case 'integer':
        assertions.push(`XCTAssertEqual(${index + 1}, result?.${fieldName})`);
        break;
      case 'number':
        assertions.push(`XCTAssertEqual(${index + 1}.0, result?.${fieldName})`);
        break;
      case 'boolean':
        assertions.push(`XCTAssertEqual(true, result?.${fieldName})`);
        break;
      case 'array':
      case 'object':
        assertions.push(`XCTAssertNotNil(result?.${fieldName})`);
        break;
      default:
        assertions.push(`XCTAssertEqual(${quoteSwiftString(sampleStringValue(propertyName, index, resolvedPropertySchema))}, result?.${fieldName})`);
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
  return responseType === 'Void' ? 204 : 200;
}

function extractPathParams(path: string): string[] {
  return (path.match(/\{([^}]+)\}/g) || []).map((match) => match.replace(/[{}]/g, ''));
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
  const candidates = statusCodes.filter((code) => /^2\d\d$/.test(code));
  for (const code of (candidates.length > 0 ? candidates : statusCodes)) {
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
  return allNoContent || responses['204'] ? 'Void' : 'Any';
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

function isConcreteApiParameter(parameter: ApiParameter | { $ref: string } | undefined): parameter is ApiParameter {
  return Boolean(parameter) && typeof parameter === 'object' && 'name' in parameter && 'in' in parameter && 'schema' in parameter;
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
  if (normalizedName.includes('email')) return 'user@example.com';
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

function pickComposedSchema(schema: ApiSchema | undefined): ApiSchema | undefined {
  for (const key of ['allOf', 'oneOf', 'anyOf'] as const) {
    const values = schema?.[key];
    if (!Array.isArray(values) || values.length === 0) {
      continue;
    }
    const candidate = values.find((entry) => entry && normalizeSchemaType(entry.type) !== 'null');
    return candidate || values[0];
  }
  return undefined;
}

function canEncodeDirectly(typeName: string): boolean {
  return !String(typeName || '').includes('Any');
}

function toUsageIdentifier(rawName: string, fallbackPrefix: string, index: number): string {
  const cleaned = SWIFT_CONFIG.namingConventions.propertyName(rawName || '');
  return cleaned || `${fallbackPrefix}${index}`;
}

function quoteSwiftString(value: string): string {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
