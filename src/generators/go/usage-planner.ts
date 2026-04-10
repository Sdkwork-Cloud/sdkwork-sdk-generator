import type { ApiParameter, ApiSchema, GeneratedApiOperation, SchemaContext } from '../../framework/types.js';
import {
  normalizeOperationId,
  resolveScopedMethodNames,
  resolveSimplifiedTagNames,
  stripTagPrefixFromOperationId,
} from '../../framework/naming.js';
import { GO_CONFIG, getGoType } from './config.js';

const BODY_METHODS = new Set(['post', 'put', 'patch']);
const DEFAULT_PREFERRED_MODULES = ['tenant', 'user', 'app', 'auth', 'workspace'];

export type GoUsageRenderMode = 'readme' | 'test';

export interface GoUsageVariable {
  name: string;
  kind: 'path' | 'body' | 'params' | 'headers';
  setupByMode: Record<GoUsageRenderMode, string[]>;
  requiresTypesImport?: boolean;
}

export interface GoUsageExpectation {
  name: string;
  expected: string;
}

export interface GoBodyAssertionPlan {
  kind: 'json' | 'non-empty';
  contentType: string;
  contentTypeMatch: 'exact' | 'prefix';
}

export interface GoUsagePlan {
  tag: string;
  moduleName: string;
  methodName: string;
  operation: GeneratedApiOperation;
  transportMethod: string;
  requestBodyMediaType?: string;
  variables: GoUsageVariable[];
  callExpression: string;
  queryExpectations: GoUsageExpectation[];
  headerExpectations: GoUsageExpectation[];
  bodyAssertion?: GoBodyAssertionPlan;
  requiresTypesImport: boolean;
}

interface GoRenderedValue {
  expression: string;
  requiresTypesImport: boolean;
}

interface GoRenderedScalar {
  goExpression: string;
  stringValue: string;
}

export class GoUsagePlanner {
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
      Object.keys(ctx.schemas).map((schemaName) => GO_CONFIG.namingConventions.modelName(schemaName)),
    );
  }

  getModuleName(tag: string): string {
    const resolvedTagName = this.resolvedTagNames.get(tag) || tag;
    return GO_CONFIG.namingConventions.propertyName(resolvedTagName);
  }

  selectQuickStartPlan(): GoUsagePlan | undefined {
    const tag = this.selectQuickStartTag() || Object.keys(this.ctx.apiGroups)[0];
    return tag ? this.selectPlanForTag(tag) : undefined;
  }

  selectPlanForTag(tag: string): GoUsagePlan | undefined {
    const operations = this.ctx.apiGroups[tag]?.operations || [];
    const operation = this.selectOperation(operations);
    if (!operation) {
      return undefined;
    }
    return this.buildPlan(tag, operation);
  }

  private buildPlan(tag: string, operation: GeneratedApiOperation): GoUsagePlan {
    const operations = this.ctx.apiGroups[tag]?.operations || [];
    const methodName = resolveGoMethodNames(tag, operations).get(operation) || 'Operation';
    const moduleName = this.getModuleName(tag);
    const transportMethod = String(operation.method || '').toLowerCase();
    const variables: GoUsageVariable[] = [];
    const callArguments: string[] = [];
    const queryExpectations: GoUsageExpectation[] = [];
    const headerExpectations: GoUsageExpectation[] = [];

    const pathParams = extractPathParams(operation.path);
    for (let index = 0; index < pathParams.length; index += 1) {
      const variableName = toUsageIdentifier(pathParams[index], 'pathParam', index + 1);
      const sampleValue = /id$/i.test(variableName)
        ? formatGoStringLiteral('1')
        : formatGoStringLiteral(variableName);
      variables.push({
        name: variableName,
        kind: 'path',
        setupByMode: {
          readme: [`${variableName} := ${sampleValue}`],
          test: [`${variableName} := ${sampleValue}`],
        },
      });
      callArguments.push(variableName);
    }

    const requestBodyInfo = BODY_METHODS.has(transportMethod)
      ? extractRequestBodyInfo(operation)
      : undefined;
    if (requestBodyInfo) {
      const bodyVariable = this.buildBodyVariable(
        requestBodyInfo.schema,
        requestBodyInfo.mediaType,
        Boolean(operation.requestBody?.required),
      );
      variables.push(bodyVariable);
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

    const requiresTypesImport = variables.some((variable) => variable.requiresTypesImport === true);

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
      requiresTypesImport,
    };
  }

  private buildBodyVariable(
    schema: ApiSchema,
    mediaType: string,
    required: boolean,
  ): GoUsageVariable {
    const rawType = getGoType(schema, GO_CONFIG);
    const rendered = this.renderBodyValue(schema, mediaType, rawType);
    const qualifiedType = this.qualifyGoType(rawType);
    const pointerWrapped = !required && shouldPointerWrap(qualifiedType);
    const primitivePointerWrapped = pointerWrapped && isPrimitiveGoType(qualifiedType);

    const setupLines = primitivePointerWrapped
      ? [
        `bodyValue := ${rendered.expression}`,
        'body := &bodyValue',
      ]
      : pointerWrapped
        ? [`body := &${rendered.expression}`]
        : [`body := ${rendered.expression}`];

    return {
      name: 'body',
      kind: 'body',
      setupByMode: {
        readme: [...setupLines],
        test: [...setupLines],
      },
      requiresTypesImport: rendered.requiresTypesImport,
    };
  }

  private buildQueryVariable(parameters: ApiParameter[]): {
    variable: GoUsageVariable;
    expectations: GoUsageExpectation[];
  } {
    const expectations: GoUsageExpectation[] = [];
    const entries = parameters.map((parameter, index) => {
      const sample = renderScalarSample(
        this.resolveSchema(parameter.schema),
        parameter.name || `value${index + 1}`,
        index,
      );
      expectations.push({
        name: parameter.name,
        expected: sample.stringValue,
      });
      return `    ${formatGoStringLiteral(parameter.name)}: ${sample.goExpression},`;
    });

    const literal = entries.length > 0
      ? `map[string]interface{}{\n${entries.join('\n')}\n}`
      : 'map[string]interface{}{}';

    return {
      variable: {
        name: 'params',
        kind: 'params',
        setupByMode: {
          readme: [`params := ${literal}`],
          test: [`params := ${literal}`],
        },
      },
      expectations,
    };
  }

  private buildHeaderVariable(parameters: ApiParameter[]): {
    variable: GoUsageVariable;
    expectations: GoUsageExpectation[];
  } {
    const expectations: GoUsageExpectation[] = [];
    const entries = parameters.map((parameter, index) => {
      const sample = renderHeaderSample(
        this.resolveSchema(parameter.schema),
        parameter.name || `header${index + 1}`,
        index,
      );
      expectations.push({
        name: parameter.name,
        expected: sample.stringValue,
      });
      return `    ${formatGoStringLiteral(parameter.name)}: ${sample.goExpression},`;
    });

    const literal = entries.length > 0
      ? `map[string]string{\n${entries.join('\n')}\n}`
      : 'map[string]string{}';

    return {
      variable: {
        name: 'headers',
        kind: 'headers',
        setupByMode: {
          readme: [`headers := ${literal}`],
          test: [`headers := ${literal}`],
        },
      },
      expectations,
    };
  }

  private renderBodyValue(schema: ApiSchema, mediaType: string, rawType: string): GoRenderedValue {
    const resolvedSchema = this.resolveSchema(schema);
    const normalizedType = normalizeSchemaType(resolvedSchema?.type) || inferImplicitObjectType(resolvedSchema);
    const qualifiedType = this.qualifyGoType(rawType);
    const lowerMediaType = mediaType.toLowerCase();

    if (schema.$ref && normalizedType === 'object') {
      return this.renderStructValue(resolvedSchema, qualifiedType, lowerMediaType);
    }

    if (schema.$ref && normalizedType && normalizedType !== 'object' && normalizedType !== 'array') {
      return this.renderNamedScalarAliasValue(resolvedSchema, qualifiedType, lowerMediaType);
    }

    if (normalizedType === 'array') {
      return this.renderSliceValue(resolvedSchema, qualifiedType, lowerMediaType);
    }

    if (qualifiedType.startsWith('map[') || normalizedType === 'object' || qualifiedType === 'interface{}') {
      return this.renderMapValue(
        resolvedSchema,
        qualifiedType === 'interface{}' ? 'map[string]interface{}' : qualifiedType,
        lowerMediaType,
      );
    }

    if (qualifiedType.startsWith('[]')) {
      return this.renderSliceValue(resolvedSchema, qualifiedType, lowerMediaType);
    }

    if (qualifiedType === 'string') {
      const sample = lowerMediaType.startsWith('multipart/form-data') && resolvedSchema?.format === 'binary'
        ? formatGoStringLiteral('sample.txt')
        : formatGoStringLiteral('value');
      return {
        expression: sample,
        requiresTypesImport: false,
      };
    }

    if (qualifiedType === 'int' || qualifiedType === 'float64') {
      return { expression: '1', requiresTypesImport: false };
    }

    if (qualifiedType === 'bool') {
      return { expression: 'true', requiresTypesImport: false };
    }

    return {
      expression: `${qualifiedType}{}`,
      requiresTypesImport: qualifiedType.includes('sdktypes.'),
    };
  }

  private renderNamedScalarAliasValue(
    schema: ApiSchema | undefined,
    typeName: string,
    mediaType: string,
  ): GoRenderedValue {
    const sample = this.renderSampleValue(schema, 'value', 0, mediaType);
    return {
      expression: `${typeName}(${sample.expression})`,
      requiresTypesImport: typeName.includes('sdktypes.') || sample.requiresTypesImport,
    };
  }

  private renderMapValue(
    schema: ApiSchema | undefined,
    mapType: string,
    mediaType: string,
  ): GoRenderedValue {
    const entries: string[] = [];
    let requiresTypesImport = false;

    const properties = schema?.properties ? Object.entries(schema.properties) : [];
    if (properties.length > 0) {
      for (let index = 0; index < properties.length; index += 1) {
        const [propertyName, propertySchema] = properties[index];
        const sample = this.renderSampleValue(propertySchema, propertyName, index, mediaType);
        requiresTypesImport = requiresTypesImport || sample.requiresTypesImport;
        entries.push(`    ${formatGoStringLiteral(propertyName)}: ${sample.expression},`);
      }
    } else if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
      const sample = this.renderSampleValue(schema.additionalProperties, 'value', 0, mediaType);
      requiresTypesImport = requiresTypesImport || sample.requiresTypesImport;
      entries.push(`    ${formatGoStringLiteral('value')}: ${sample.expression},`);
    } else if (mediaType.startsWith('multipart/form-data') || mediaType.startsWith('application/x-www-form-urlencoded')) {
      entries.push(`    ${formatGoStringLiteral('value')}: ${formatGoStringLiteral('value')},`);
    }

    return {
      expression: entries.length > 0
        ? `${mapType}{\n${entries.join('\n')}\n}`
        : `${mapType}{}`,
      requiresTypesImport,
    };
  }

  private renderStructValue(
    schema: ApiSchema | undefined,
    structType: string,
    mediaType: string,
  ): GoRenderedValue {
    const entries: string[] = [];
    let requiresTypesImport = structType.includes('sdktypes.');

    const properties = schema?.properties ? Object.entries(schema.properties) : [];
    for (let index = 0; index < properties.length; index += 1) {
      const [propertyName, propertySchema] = properties[index];
      const sample = this.renderSampleValue(propertySchema, propertyName, index, mediaType);
      requiresTypesImport = requiresTypesImport || sample.requiresTypesImport;
      entries.push(`    ${GO_CONFIG.namingConventions.propertyName(propertyName)}: ${sample.expression},`);
    }

    return {
      expression: entries.length > 0
        ? `${structType}{\n${entries.join('\n')}\n}`
        : `${structType}{}`,
      requiresTypesImport,
    };
  }

  private renderSliceValue(
    schema: ApiSchema | undefined,
    sliceType: string,
    mediaType: string,
  ): GoRenderedValue {
    const itemSchema = schema?.items;
    if (!itemSchema) {
      return {
        expression: `${sliceType}{}`,
        requiresTypesImport: sliceType.includes('sdktypes.'),
      };
    }

    const sample = this.renderSampleValue(itemSchema, 'item', 0, mediaType);
    const itemExpression = indentMultilineGoExpression(sample.expression, 1);
    return {
      expression: `${sliceType}{\n${itemExpression},\n}`,
      requiresTypesImport: sliceType.includes('sdktypes.') || sample.requiresTypesImport,
    };
  }

  private renderSampleValue(
    schema: ApiSchema | undefined,
    fallbackName: string,
    index: number,
    mediaType: string,
  ): GoRenderedValue {
    const resolvedSchema = this.resolveSchema(schema);
    const normalizedType = normalizeSchemaType(resolvedSchema?.type) || inferImplicitObjectType(resolvedSchema);
    const enumValues = Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum : undefined;
    if (enumValues && enumValues.length > 0) {
      return formatEnumLiteral(enumValues[0]);
    }

    if (schema?.$ref && normalizedType === 'object') {
      const qualifiedType = this.qualifyGoType(getGoType(schema, GO_CONFIG));
      return this.renderStructValue(resolvedSchema, qualifiedType, mediaType);
    }

    switch (normalizedType) {
      case 'integer':
      case 'number':
        return { expression: String(index + 1), requiresTypesImport: false };
      case 'boolean':
        return { expression: index % 2 === 0 ? 'true' : 'false', requiresTypesImport: false };
      case 'array': {
        const qualifiedType = this.qualifyGoType(getGoType(resolvedSchema || {}, GO_CONFIG));
        return this.renderSliceValue(resolvedSchema, qualifiedType, mediaType);
      }
      case 'object': {
        const qualifiedType = this.qualifyGoType(getGoType(resolvedSchema || {}, GO_CONFIG));
        return this.renderMapValue(
          resolvedSchema,
          qualifiedType === 'interface{}' ? 'map[string]interface{}' : qualifiedType,
          mediaType,
        );
      }
      case 'string':
      default:
        if (resolvedSchema?.format === 'binary' && mediaType.startsWith('multipart/form-data')) {
          return { expression: '[]byte("sample")', requiresTypesImport: false };
        }
        return {
          expression: formatGoStringLiteral(fallbackName || `value${index + 1}`),
          requiresTypesImport: false,
        };
    }
  }

  private resolveSchema(schema: ApiSchema | undefined): ApiSchema | undefined {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }
    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop() || '';
      return this.ctx.schemas[refName] || schema;
    }
    const composed = pickComposedSchema(schema);
    if (composed) {
      return this.resolveSchema(composed) || composed;
    }
    return schema;
  }

  private qualifyGoType(typeName: string): string {
    let result = typeName;
    const sortedModels = Array.from(this.knownModels).sort((left, right) => right.length - left.length);
    for (const modelName of sortedModels) {
      const escaped = modelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(?<![\\w.])${escaped}(?![\\w])`, 'g');
      result = result.replace(pattern, `sdktypes.${modelName}`);
    }
    return result;
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

export function resolveGoMethodNames(
  tag: string,
  operations: GeneratedApiOperation[],
): Map<GeneratedApiOperation, string> {
  if (!Array.isArray(operations) || operations.length === 0) {
    return new Map<GeneratedApiOperation, string>();
  }

  return resolveScopedMethodNames(operations, (operation) => generateGoOperationName(
    operation.method,
    operation.path,
    operation,
    tag,
  ));
}

export function renderGoUsageSnippet(
  plan: GoUsagePlan,
  mode: GoUsageRenderMode,
  options: { resultBinding?: string } = {},
): string {
  const resultBinding = options.resultBinding ?? 'result';
  const setupLines = plan.variables.flatMap((variable) => variable.setupByMode[mode]);
  const callLine = `${resultBinding}, err := ${plan.callExpression}`;
  return setupLines.length > 0 ? `${setupLines.join('\n')}\n${callLine}` : callLine;
}

export function resolveGoExpectedRequestPath(path: string, apiPrefix: string): string {
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

function generateGoOperationName(
  method: string,
  path: string,
  operation: GeneratedApiOperation,
  tag: string,
): string {
  if (operation.operationId) {
    const normalized = normalizeOperationId(operation.operationId);
    return GO_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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

  return `${actionMap[method] || GO_CONFIG.namingConventions.modelName(method)}${GO_CONFIG.namingConventions.modelName(resource)}`;
}

function buildBodyAssertionPlan(mediaType: string): GoBodyAssertionPlan {
  const normalized = String(mediaType || '').toLowerCase();
  if (normalized === 'application/json' || normalized.endsWith('+json')) {
    return {
      kind: 'json',
      contentType: 'application/json',
      contentTypeMatch: 'exact',
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

function renderScalarSample(schema: ApiSchema | undefined, fallbackName: string, index: number): GoRenderedScalar {
  const enumValues = Array.isArray(schema?.enum) ? schema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    const literal = String(enumValues[0]);
    return {
      goExpression: typeof enumValues[0] === 'number' || typeof enumValues[0] === 'boolean'
        ? literal
        : formatGoStringLiteral(literal),
      stringValue: literal,
    };
  }

  switch (normalizeSchemaType(schema?.type)) {
    case 'integer':
    case 'number': {
      const value = String(index + 1);
      return { goExpression: value, stringValue: value };
    }
    case 'boolean': {
      const value = index % 2 === 0 ? 'true' : 'false';
      return { goExpression: value, stringValue: value };
    }
    default: {
      const value = fallbackName || `value${index + 1}`;
      return { goExpression: formatGoStringLiteral(value), stringValue: value };
    }
  }
}

function renderHeaderSample(schema: ApiSchema | undefined, fallbackName: string, index: number): GoRenderedScalar {
  const enumValues = Array.isArray(schema?.enum) ? schema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    const value = String(enumValues[0]);
    return {
      goExpression: formatGoStringLiteral(value),
      stringValue: value,
    };
  }

  switch (normalizeSchemaType(schema?.type)) {
    case 'integer':
    case 'number': {
      const value = String(index + 1);
      return {
        goExpression: formatGoStringLiteral(value),
        stringValue: value,
      };
    }
    case 'boolean': {
      const value = index % 2 === 0 ? 'true' : 'false';
      return {
        goExpression: formatGoStringLiteral(value),
        stringValue: value,
      };
    }
  }

  const value = fallbackName || `header${index + 1}`;
  return {
    goExpression: formatGoStringLiteral(value),
    stringValue: value,
  };
}

function formatEnumLiteral(value: string | number): GoRenderedValue {
  if (typeof value === 'number') {
    return {
      expression: String(value),
      requiresTypesImport: false,
    };
  }
  return {
    expression: formatGoStringLiteral(String(value)),
    requiresTypesImport: false,
  };
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

  const mediaType = pickRequestBodyMediaType(content);
  const schema = mediaType ? content[mediaType]?.schema : undefined;
  if (!mediaType || !schema) {
    return undefined;
  }

  return { mediaType, schema };
}

function pickRequestBodyMediaType(content: Record<string, { schema: ApiSchema }>): string | undefined {
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

function toUsageIdentifier(rawName: string, fallbackPrefix: string, index: number): string {
  const pascal = GO_CONFIG.namingConventions.modelName(rawName || '');
  if (!pascal) {
    return `${fallbackPrefix}${index}`;
  }
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function formatGoStringLiteral(value: string): string {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function shouldPointerWrap(typeName: string): boolean {
  return !(typeName.startsWith('*')
    || typeName.startsWith('[]')
    || typeName.startsWith('map[')
    || typeName === 'interface{}');
}

function isPrimitiveGoType(typeName: string): boolean {
  return typeName === 'string'
    || typeName === 'int'
    || typeName === 'float64'
    || typeName === 'bool';
}

function indentMultilineGoExpression(expression: string, level: number): string {
  const prefix = '    '.repeat(Math.max(0, level));
  return String(expression || '')
    .split('\n')
    .map((line) => (line ? `${prefix}${line}` : line))
    .join('\n');
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
