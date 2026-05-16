import type { ApiParameter, ApiSchema, GeneratedApiOperation, GeneratorConfig, SchemaContext } from '../../framework/types.js';
import { createUniqueIdentifierMap, toSafeSnakeIdentifier } from '../../framework/identifiers.js';
import { getArrayItemSchema, getSchemaReferenceName, pickComposedSchema, resolveMediaTypeSchema, resolveSchemaType } from '../../framework/schema.js';
import {
  normalizeOperationId,
  resolveScopedMethodNames,
  stripTagPrefixFromOperationId,
} from '../../framework/naming.js';
import { resolveOpenAIStyleMethodNames, resolveSdkTagNames } from '../../framework/openai-surface.js';
import { PYTHON_CONFIG } from './config.js';

const BODY_METHODS = new Set(['post', 'put', 'patch']);
const DEFAULT_PREFERRED_MODULES = ['tenant', 'user', 'app', 'auth', 'workspace'];
const RESOURCE_ACTION_SEGMENTS = new Set([
  'cancel',
  'compact',
  'complete',
  'content',
  'pause',
  'resume',
  'search',
  'submit_tool_outputs',
]);
const TERMINAL_COLLECTION_ACTIONS = [
  {
    parentResourcePath: ['fine_tuning', 'jobs'],
    segment: 'events',
  },
  {
    parentResourcePath: ['vector_stores', 'file_batches'],
    segment: 'files',
  },
];
const RESOURCE_METHOD_OVERRIDES = [
  {
    resourcePath: ['fine_tuning', 'checkpoints', 'permissions'],
    method: 'get',
    methodName: 'retrieve',
  },
];
const PYTHON_RESERVED_WORDS = new Set([
  'false',
  'none',
  'true',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'case',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'match',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
]);

export type PythonUsageRenderMode = 'readme' | 'test';

export interface PythonUsageVariable {
  name: string;
  kind: 'path' | 'body' | 'params' | 'headers' | 'parameter';
  initializerByMode: Record<PythonUsageRenderMode, string>;
}

export interface PythonUsageExpectation {
  name: string;
  expected: string;
  source?: string;
  cookie?: boolean;
}

export interface PythonUsagePlan {
  tag: string;
  moduleName: string;
  methodName: string;
  clientPropertyPath: string[];
  operation: GeneratedApiOperation;
  transportMethod: string;
  requestBodyMediaType?: string;
  variables: PythonUsageVariable[];
  callExpression: string;
  headerExpectations: PythonUsageExpectation[];
}

export interface PythonResourceNode {
  propertyName: string;
  className: string;
  resourcePathSegments: string[];
  operations: GeneratedApiOperation[];
  children: PythonResourceNode[];
}

export interface PythonOperationSurface {
  clientPropertyPath: string[];
  methodName: string;
  resourcePathSegments: string[];
}

export class PythonUsagePlanner {
  private readonly resolvedTagNames: Map<string, string>;
  private readonly preferredModules: string[];

  constructor(
    private readonly ctx: SchemaContext,
    preferredModules: string[] = DEFAULT_PREFERRED_MODULES,
    private readonly config?: GeneratorConfig,
  ) {
    this.resolvedTagNames = resolveSdkTagNames(Object.keys(ctx.apiGroups), config);
    this.preferredModules = preferredModules;
  }

  getModuleName(tag: string): string {
    const resolvedTagName = this.resolvedTagNames.get(tag) || tag;
    return PYTHON_CONFIG.namingConventions.propertyName(resolvedTagName);
  }

  selectQuickStartPlan(): PythonUsagePlan | undefined {
    const tag = this.selectQuickStartTag() || Object.keys(this.ctx.apiGroups)[0];
    return tag ? this.selectPlanForTag(tag) : undefined;
  }

  selectPlanForTag(tag: string): PythonUsagePlan | undefined {
    const operations = this.ctx.apiGroups[tag]?.operations || [];
    const operation = this.selectOperation(operations);
    if (!operation) {
      return undefined;
    }
    return this.buildPlan(tag, operation);
  }

  private buildPlan(tag: string, operation: GeneratedApiOperation): PythonUsagePlan {
    const operations = this.ctx.apiGroups[tag]?.operations || [];
    const rootModuleName = this.getModuleName(tag);
    const surface = resolvePythonOperationSurfaces(tag, operations, rootModuleName, this.config).get(operation);
    const methodName = surface?.methodName || resolvePythonMethodNames(tag, operations, this.config).get(operation) || 'operation';
    const clientPropertyPath = surface?.clientPropertyPath || [rootModuleName];
    const moduleName = clientPropertyPath.join('.');
    const transportMethod = String(operation.method || '').toLowerCase();
    const variables: PythonUsageVariable[] = [];
    const callArguments: string[] = [];
    const headerExpectations: PythonUsageExpectation[] = [];

    const pathParams = extractPathParams(operation.path);
    const pathParamNames = createUniqueIdentifierMap(
      pathParams,
      (value) => toSafeSnakeIdentifier(value, PYTHON_RESERVED_WORDS),
      ['body', 'params', 'headers'],
    );
    for (let index = 0; index < pathParams.length; index += 1) {
      const variableName = pathParamNames.get(pathParams[index]) || toUsageIdentifier(pathParams[index], 'path_param', index + 1);
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
    const headerParameterKeys = headerParams.map((parameter, index) => `${parameter?.in || 'parameter'}:${parameter?.name || 'value'}:${index}`);
    const rawHeaderNameByKey = new Map(
      headerParameterKeys.map((key, index) => [key, String(headerParams[index]?.name || `value${index + 1}`)]),
    );
    const headerParameterNames = createUniqueIdentifierMap(
      headerParameterKeys,
      (key) => toSafeSnakeIdentifier(rawHeaderNameByKey.get(key) || 'value', PYTHON_RESERVED_WORDS),
      [...variables.map((variable) => variable.name), 'body', 'params', 'headers'],
    );
    for (let index = 0; index < headerParams.length; index += 1) {
      const parameter = headerParams[index];
      const key = headerParameterKeys[index];
      const variableName = headerParameterNames.get(key) || toUsageIdentifier(
        parameter.name,
        parameter.in === 'cookie' ? 'cookie_param' : 'header_param',
        variables.length + 1,
      );
      const sampleValue = sampleValueForParameter(this.ctx, parameter, variables.length);
      variables.push({
        name: variableName,
        kind: 'parameter',
        initializerByMode: {
          readme: sampleValue,
          test: sampleValue,
        },
      });
      callArguments.push(variableName);
      headerExpectations.push({
        name: parameter.in === 'cookie' ? 'Cookie' : parameter.name,
        expected: extractLiteralString(sampleValue) || parameter.name || `value${variables.length}`,
        source: variableName,
        cookie: parameter.in === 'cookie',
      });
    }

    return {
      tag,
      moduleName,
      methodName,
      clientPropertyPath,
      operation,
      transportMethod,
      requestBodyMediaType: requestBodyInfo?.mediaType,
      variables,
      callExpression: `client.${clientPropertyPath.join('.')}.${methodName}(${callArguments.join(', ')})`,
      headerExpectations,
    };
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

export function resolvePythonMethodNames(
  tag: string,
  operations: GeneratedApiOperation[],
  config?: GeneratorConfig,
  resourcePathSegments?: string[],
): Map<GeneratedApiOperation, string> {
  if (!Array.isArray(operations) || operations.length === 0) {
    return new Map<GeneratedApiOperation, string>();
  }

  if (resourcePathSegments?.length || usesPythonNestedResourceSurfaceForOperations(config, operations)) {
    return resolveScopedMethodNames(operations, (operation) => generatePythonOperationName(
      operation.method,
      operation.path,
      operation,
      tag,
      config,
      resourcePathSegments,
    ));
  }

  const openAIStyleNames = resolveOpenAIStyleMethodNames(tag, operations, config, PYTHON_CONFIG, 'snake');
  if (openAIStyleNames) {
    return openAIStyleNames;
  }

  return resolveScopedMethodNames(operations, (operation) => generatePythonOperationName(
    operation.method,
    operation.path,
    operation,
    tag,
    config,
  ));
}

export function buildPythonResourceTree(
  tag: string,
  operations: GeneratedApiOperation[],
  rootModuleName: string,
  config?: GeneratorConfig,
): PythonResourceNode {
  const rootClassName = `${PYTHON_CONFIG.namingConventions.modelName(rootModuleName)}Api`;
  const rootSegment = resolveRootResourceSegment(tag, operations, rootModuleName, config);
  const root: PythonResourceNode = {
    propertyName: PYTHON_CONFIG.namingConventions.propertyName(rootModuleName),
    className: rootClassName,
    resourcePathSegments: [rootSegment],
    operations: [],
    children: [],
  };
  const nodesByPath = new Map<string, PythonResourceNode>([
    [resourcePathKey(root.resourcePathSegments), root],
  ]);

  for (const operation of operations) {
    const resourcePathSegments = resolveOperationResourcePath(tag, operation, config, rootSegment);
    let node = root;
    for (let index = 1; index < resourcePathSegments.length; index += 1) {
      const childPath = resourcePathSegments.slice(0, index + 1);
      const key = resourcePathKey(childPath);
      let child = nodesByPath.get(key);
      if (!child) {
        child = {
          propertyName: PYTHON_CONFIG.namingConventions.propertyName(resourcePathSegments[index]),
          className: buildNestedResourceClassName(rootClassName, childPath.slice(1)),
          resourcePathSegments: childPath,
          operations: [],
          children: [],
        };
        nodesByPath.set(key, child);
        node.children.push(child);
      }
      node = child;
    }
    node.operations.push(operation);
  }

  dedupeResourceTreeOperations(root, tag, config);
  return root;
}

export function resolvePythonOperationSurfaces(
  tag: string,
  operations: GeneratedApiOperation[],
  rootModuleName: string,
  config?: GeneratorConfig,
): Map<GeneratedApiOperation, PythonOperationSurface> {
  if (!Array.isArray(operations) || operations.length === 0) {
    return new Map<GeneratedApiOperation, PythonOperationSurface>();
  }

  if (!usesPythonNestedResourceSurfaceForOperations(config, operations)) {
    const methodNames = resolvePythonMethodNames(tag, operations, config);
    return new Map(operations.map((operation) => [operation, {
      clientPropertyPath: [rootModuleName],
      methodName: methodNames.get(operation) || 'operation',
      resourcePathSegments: [rootModuleName],
    }]));
  }

  const root = buildPythonResourceTree(tag, operations, rootModuleName, config);
  const surfaces = new Map<GeneratedApiOperation, PythonOperationSurface>();
  visitResourceNodes(root, [root.propertyName], (node, clientPropertyPath) => {
    const methodNames = resolvePythonMethodNames(tag, node.operations, config, node.resourcePathSegments);
    for (const operation of node.operations) {
      surfaces.set(operation, {
        clientPropertyPath,
        methodName: methodNames.get(operation) || 'operation',
        resourcePathSegments: node.resourcePathSegments,
      });
    }
  });
  return surfaces;
}

export function operationRequestsPythonNestedResourceSurface(operation: GeneratedApiOperation | undefined): boolean {
  if (!operation || typeof operation !== 'object') {
    return false;
  }
  const operationRecord = operation as unknown as Record<string, unknown>;
  return operationRecord['x-sdk-nested-resource-surface'] === true
    || operationRecord['x-sdk-resource-surface'] === 'nested'
    || operationRecord['x-sdkwork-resource-surface'] === 'nested';
}

export function operationsRequestPythonNestedResourceSurface(operations: GeneratedApiOperation[]): boolean {
  return Array.isArray(operations) && operations.some(operationRequestsPythonNestedResourceSurface);
}

export function usesPythonNestedResourceSurfaceForOperations(
  config: GeneratorConfig | undefined,
  operations: GeneratedApiOperation[],
): boolean {
  return config?.options?.standardProfile === 'sdkwork-v3'
    || operationsRequestPythonNestedResourceSurface(operations);
}

export function renderPythonUsageSnippet(
  plan: PythonUsagePlan,
  mode: PythonUsageRenderMode,
  options: { assignResult?: boolean } = {},
): string {
  const setupLines = plan.variables.map(
    (variable) => `${variable.name} = ${variable.initializerByMode[mode]}`,
  );
  const assignResult = options.assignResult ?? mode === 'readme';
  const callLine = assignResult
    ? `result = ${plan.callExpression}`
    : plan.callExpression;
  return setupLines.length > 0 ? `${setupLines.join('\n')}\n${callLine}` : callLine;
}

export function resolvePythonExpectedRequestPath(path: string, apiPrefix: string): string {
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

function generatePythonOperationName(
  method: string,
  path: string,
  operation: GeneratedApiOperation,
  tag: string,
  config?: GeneratorConfig,
  resourcePathSegments?: string[],
): string {
  const dottedOperationActionName = resolveDottedOperationActionName(operation, config, resourcePathSegments);
  if (dottedOperationActionName) {
    return dottedOperationActionName;
  }

  const resourceActionName = generateResourceActionName(method, path, tag, config, resourcePathSegments);
  if (resourceActionName) {
    return resourceActionName;
  }

  if (operation.operationId) {
    const normalized = normalizeOperationId(operation.operationId);
    return PYTHON_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
  }

  const pathParts = path.split('/').filter(Boolean);
  const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
  const actionMap: Record<string, string> = {
    get: path.includes('{') ? 'get' : 'list',
    post: 'create',
    put: 'update',
    patch: 'patch',
    delete: 'delete',
    options: 'options',
    head: 'head',
    trace: 'trace',
    query: 'query',
  };

  return `${actionMap[method] || method}_${PYTHON_CONFIG.namingConventions.propertyName(resource)}`;
}

function generateResourceActionName(
  method: string,
  path: string,
  tag: string,
  config?: GeneratorConfig,
  resourcePathSegments?: string[],
): string {
  if (!usesPythonNestedResourceSurface(config)) {
    return '';
  }

  const normalizedMethod = String(method || '').toLowerCase();
  const relativeSegments = getRelativePathSegments(path, config?.apiPrefix);
  const resourceIndex = resourcePathSegments?.length
    ? findResourcePathEndIndex(relativeSegments, resourcePathSegments)
    : findResourceSegmentIndex(relativeSegments, stripGenericTagSuffix(toIdentifierParts(tag)));
  if (resourceIndex < 0) {
    return '';
  }

  const suffix = relativeSegments.slice(resourceIndex + 1);
  const suffixSegments = suffix.filter((segment) => !isPathParameterSegment(segment));
  const hasCurrentResourcePathParams = suffix.some(isPathParameterSegment);
  if (suffixSegments.length === 1 && isActionSegment(suffixSegments[0])) {
    return PYTHON_CONFIG.namingConventions.methodName(normalizeStaticSegment(suffixSegments[0]));
  }
  const overriddenMethodName = resolveResourceMethodOverride(resourcePathSegments || [], normalizedMethod, suffixSegments);
  if (overriddenMethodName) {
    return overriddenMethodName;
  }
  if (
    normalizedMethod === 'get'
    && suffixSegments.length === 1
    && resourcePathSegments?.length
    && isTerminalCollectionAction(resourcePathSegments, suffixSegments[0])
  ) {
    return PYTHON_CONFIG.namingConventions.methodName(
      `list_${normalizeStaticSegment(suffixSegments[0])}`,
    );
  }
  if (normalizedMethod === 'get' && suffixSegments.length === 0) {
    return hasCurrentResourcePathParams ? 'retrieve' : 'list';
  }
  if (normalizedMethod === 'post' && suffixSegments.length === 0) {
    return hasCurrentResourcePathParams ? 'update' : 'create';
  }
  if ((normalizedMethod === 'put' || normalizedMethod === 'patch') && suffixSegments.length === 0) {
    return 'update';
  }
  if (normalizedMethod === 'delete' && suffixSegments.length === 0) {
    return 'delete';
  }
  if (suffixSegments.length > 0) {
    const action = actionNameForNestedResource(normalizedMethod, suffixSegments, hasCurrentResourcePathParams);
    const suffixName = renderNestedSuffixName(suffixSegments, action);
    return PYTHON_CONFIG.namingConventions.methodName(`${action}_${suffixName}`);
  }

  return '';
}

function usesPythonNestedResourceSurface(config?: GeneratorConfig): boolean {
  return config?.sdkType === 'ai' || config?.options?.standardProfile === 'sdkwork-v3';
}

function resolveDottedOperationActionName(
  operation: GeneratedApiOperation,
  config?: GeneratorConfig,
  resourcePathSegments?: string[],
): string {
  if (
    config?.options?.standardProfile !== 'sdkwork-v3'
    && !operationRequestsPythonNestedResourceSurface(operation)
  ) {
    return '';
  }
  if (!resourcePathSegments?.length) {
    return '';
  }

  const operationId = String(operation.operationId || '').trim();
  if (!operationId.includes('.')) {
    return '';
  }

  const parts = operationId.split('.').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    return '';
  }

  const resourceParts = parts.slice(0, -1).map((part) => normalizeStaticSegment(part)).filter(Boolean);
  const canonicalResourcePath = resourcePathSegments.slice(1).map(canonicalResourcePart);
  if (resourceParts.length > 0 && !sameCanonicalParts(resourceParts, canonicalResourcePath.slice(-resourceParts.length))) {
    return '';
  }

  return PYTHON_CONFIG.namingConventions.methodName(parts[parts.length - 1]);
}

function actionNameForNestedResource(
  method: string,
  suffixSegments: string[],
  hasPathParams: boolean,
): string {
  if (method === 'get') {
    return hasPathParams ? 'retrieve' : 'list';
  }
  if (method === 'post') {
    if (suffixSegments.length === 1 && isActionSegment(suffixSegments[0])) {
      return '';
    }
    return 'create';
  }
  if (method === 'put' || method === 'patch') {
    return 'update';
  }
  if (method === 'delete') {
    return 'delete';
  }
  return PYTHON_CONFIG.namingConventions.methodName(method);
}

function renderNestedSuffixName(suffixSegments: string[], action: string): string {
  return suffixSegments.map((segment, index) => {
    const normalizedSegment = normalizeStaticSegment(segment);
    const shouldSingularize = action === 'create' && index === suffixSegments.length - 1;
    return shouldSingularize ? canonicalResourcePart(normalizedSegment) : normalizedSegment;
  }).join('_');
}

function isActionSegment(segment: string): boolean {
  return RESOURCE_ACTION_SEGMENTS.has(normalizeStaticSegment(segment));
}

function resolveResourceMethodOverride(
  resourcePathSegments: string[],
  method: string,
  suffixSegments: string[],
): string {
  if (suffixSegments.length > 0 || resourcePathSegments.length === 0) {
    return '';
  }

  const override = RESOURCE_METHOD_OVERRIDES.find((rule) => (
    rule.method === method && resourcePathMatches(rule.resourcePath, resourcePathSegments)
  ));
  return override?.methodName || '';
}

function isTerminalCollectionAction(resourcePathSegments: string[], segment: string): boolean {
  const normalizedSegment = normalizeStaticSegment(segment);
  return TERMINAL_COLLECTION_ACTIONS.some((rule) => (
    canonicalResourcePart(rule.segment) === canonicalResourcePart(normalizedSegment)
    && resourcePathMatches(rule.parentResourcePath, resourcePathSegments)
  ));
}

function isTerminalResourceAction(resourceSegments: string[]): boolean {
  if (resourceSegments.length <= 1) {
    return false;
  }

  const terminalSegment = resourceSegments[resourceSegments.length - 1];
  if (isActionSegment(terminalSegment)) {
    return true;
  }

  return isTerminalCollectionAction(resourceSegments.slice(0, -1), terminalSegment);
}

function resolveRootResourceSegment(
  tag: string,
  operations: GeneratedApiOperation[],
  rootModuleName: string,
  config?: GeneratorConfig,
): string {
  for (const operation of operations) {
    const resourcePath = resolveOperationResourcePath(tag, operation, config, rootModuleName);
    if (resourcePath.length > 0) {
      return resourcePath[0];
    }
  }
  return normalizeStaticSegment(rootModuleName) || rootModuleName;
}

function dedupeResourceTreeOperations(
  node: PythonResourceNode,
  tag: string,
  config?: GeneratorConfig,
): void {
  node.operations = selectCanonicalResourceOperations(node.operations, tag, config, node.resourcePathSegments);
  for (const child of node.children) {
    dedupeResourceTreeOperations(child, tag, config);
  }
}

function selectCanonicalResourceOperations(
  operations: GeneratedApiOperation[],
  tag: string,
  config: GeneratorConfig | undefined,
  resourcePathSegments: string[],
): GeneratedApiOperation[] {
  if (operations.length <= 1) {
    return operations;
  }

  const selectedByMethodName = new Map<string, { operation: GeneratedApiOperation; score: number; index: number }>();
  operations.forEach((operation, index) => {
    const methodName = generatePythonOperationName(
      operation.method,
      operation.path,
      operation,
      tag,
      config,
      resourcePathSegments,
    );
    const score = scoreOperationPathForConfiguredPrefix(operation.path, config?.apiPrefix);
    const existing = selectedByMethodName.get(methodName);
    if (!existing || score > existing.score || (score === existing.score && index < existing.index)) {
      selectedByMethodName.set(methodName, { operation, score, index });
    }
  });

  return Array.from(selectedByMethodName.values())
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.operation);
}

function resolveOperationResourcePath(
  tag: string,
  operation: GeneratedApiOperation,
  config: GeneratorConfig | undefined,
  fallbackRootSegment: string,
): string[] {
  const operationIdResourcePath = resolveOperationIdResourcePath(operation, config, fallbackRootSegment);
  if (operationIdResourcePath.length > 0) {
    return operationIdResourcePath;
  }

  const relativeSegments = getRelativePathSegments(operation.path, config?.apiPrefix);
  const tagParts = stripGenericTagSuffix(toIdentifierParts(tag));
  let resourceIndex = findResourceSegmentIndex(relativeSegments, tagParts);
  if (resourceIndex < 0) {
    resourceIndex = relativeSegments.findIndex((segment) => !isPathParameterSegment(segment));
  }
  if (resourceIndex < 0) {
    return [fallbackRootSegment];
  }

  const resourceSegments = relativeSegments
    .slice(resourceIndex)
    .filter((segment) => !isPathParameterSegment(segment))
    .map(normalizeStaticSegment)
    .filter(Boolean);

  if (isTerminalResourceAction(resourceSegments)) {
    resourceSegments.pop();
  }

  return resourceSegments.length > 0 ? resourceSegments : [fallbackRootSegment];
}

function resolveOperationIdResourcePath(
  operation: GeneratedApiOperation,
  config: GeneratorConfig | undefined,
  fallbackRootSegment: string,
): string[] {
  if (
    config?.options?.standardProfile !== 'sdkwork-v3'
    && !operationRequestsPythonNestedResourceSurface(operation)
  ) {
    return [];
  }

  const operationId = String(operation.operationId || '').trim();
  if (!operationId.includes('.')) {
    return [];
  }

  const parts = operationId.split('.').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    return [];
  }

  const resourceParts = parts.slice(0, -1).map((part) => normalizeStaticSegment(part)).filter(Boolean);
  const rootSegment = normalizeStaticSegment(fallbackRootSegment);
  if (!rootSegment) {
    return resourceParts;
  }
  if (resourceParts.length > 0 && canonicalResourcePart(resourceParts[0]) === canonicalResourcePart(rootSegment)) {
    return resourceParts;
  }
  return resourceParts.length > 0 ? [rootSegment, ...resourceParts] : [rootSegment];
}

function resourcePathKey(segments: string[]): string {
  return segments.map(canonicalResourcePart).join('/');
}

function buildNestedResourceClassName(rootClassName: string, childSegments: string[]): string {
  const rootBase = rootClassName.replace(/Api$/, '');
  const childName = childSegments
    .map((segment) => PYTHON_CONFIG.namingConventions.modelName(segment))
    .join('');
  return `${rootBase}${childName}Api`;
}

function visitResourceNodes(
  node: PythonResourceNode,
  clientPropertyPath: string[],
  visitor: (node: PythonResourceNode, clientPropertyPath: string[]) => void,
): void {
  visitor(node, clientPropertyPath);
  for (const child of node.children) {
    visitResourceNodes(child, [...clientPropertyPath, child.propertyName], visitor);
  }
}

function getRelativePathSegments(path: string, apiPrefix?: string): string[] {
  const pathSegments = toRawPathSegments(path);
  const prefixSegments = toRawPathSegments(apiPrefix || '');
  if (
    prefixSegments.length > 0
    && startsWithSegments(pathSegments.map(normalizeStaticSegment), prefixSegments.map(normalizeStaticSegment))
  ) {
    return pathSegments.slice(prefixSegments.length);
  }
  return pathSegments;
}

function scoreOperationPathForConfiguredPrefix(path: string, apiPrefix?: string): number {
  const pathSegments = toRawPathSegments(path).map(normalizeStaticSegment);
  const primaryPrefix = toRawPathSegments(apiPrefix || '').map(normalizeStaticSegment);
  const prefixes = resolvePrefixCandidates(primaryPrefix);
  for (let index = 0; index < prefixes.length; index += 1) {
    if (startsWithSegments(pathSegments, prefixes[index])) {
      return prefixes.length - index;
    }
  }
  return 0;
}

function resolvePrefixCandidates(primaryPrefix: string[]): string[][] {
  if (primaryPrefix.length === 0) {
    return [];
  }

  const candidates = [primaryPrefix];
  const versionIndex = primaryPrefix.findIndex((segment) => /^v\d+$/.test(segment));
  if (versionIndex >= 0) {
    const alias = ['v1', ...primaryPrefix.slice(versionIndex + 1)];
    if (!candidates.some((candidate) => sameStringSegments(candidate, alias))) {
      candidates.push(alias);
    }
  }
  return candidates;
}

function findResourceSegmentIndex(pathSegments: string[], tagParts: string[]): number {
  if (pathSegments.length === 0 || tagParts.length === 0) {
    return -1;
  }

  const normalizedPathSegments = pathSegments.map(normalizeStaticSegment);
  for (let length = Math.min(tagParts.length, normalizedPathSegments.length); length > 0; length -= 1) {
    for (let index = 0; index <= normalizedPathSegments.length - length; index += 1) {
      const window = normalizedPathSegments.slice(index, index + length);
      if (sameCanonicalParts(window, tagParts.slice(tagParts.length - length))) {
        return index + length - 1;
      }
    }
  }

  return -1;
}

function findResourcePathEndIndex(pathSegments: string[], resourcePathSegments: string[]): number {
  if (pathSegments.length === 0 || resourcePathSegments.length === 0) {
    return -1;
  }

  let resourceIndex = 0;
  for (let pathIndex = 0; pathIndex < pathSegments.length; pathIndex += 1) {
    const segment = pathSegments[pathIndex];
    if (isPathParameterSegment(segment)) {
      continue;
    }
    if (canonicalResourcePart(normalizeStaticSegment(segment)) !== canonicalResourcePart(resourcePathSegments[resourceIndex])) {
      continue;
    }
    resourceIndex += 1;
    if (resourceIndex === resourcePathSegments.length) {
      return pathIndex;
    }
  }

  return -1;
}

function sameCanonicalParts(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (canonicalResourcePart(left[index]) !== canonicalResourcePart(right[index])) {
      return false;
    }
  }
  return true;
}

function resourcePathMatches(rulePath: string[], resourcePathSegments: string[]): boolean {
  if (rulePath.length !== resourcePathSegments.length) {
    return false;
  }

  for (let index = 0; index < rulePath.length; index += 1) {
    if (canonicalResourcePart(rulePath[index]) !== canonicalResourcePart(resourcePathSegments[index])) {
      return false;
    }
  }

  return true;
}

function startsWithSegments(pathSegments: string[], prefixSegments: string[]): boolean {
  if (pathSegments.length < prefixSegments.length) {
    return false;
  }
  for (let index = 0; index < prefixSegments.length; index += 1) {
    if (pathSegments[index] !== prefixSegments[index]) {
      return false;
    }
  }
  return true;
}

function sameStringSegments(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function stripGenericTagSuffix(parts: string[]): string[] {
  const removable = new Set(['management', 'controller', 'module', 'service', 'api']);
  const next = [...parts];
  while (next.length > 1 && removable.has(next[next.length - 1])) {
    next.pop();
  }
  return next;
}

function toRawPathSegments(value: string): string[] {
  return String(value || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function normalizeStaticSegment(segment: string): string {
  if (isPathParameterSegment(segment)) {
    return segment;
  }
  return toIdentifierParts(segment).join('_');
}

function extractPathParams(path: string): string[] {
  const matches = path.match(/\{([^}]+)\}/g) || [];
  return matches.map((match) => match.replace(/[{}]/g, ''));
}

function isPathParameterSegment(segment: string): boolean {
  return segment.startsWith('{') && segment.endsWith('}');
}

function toIdentifierParts(value: string): string[] {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
    .split('_')
    .filter(Boolean);
}

function canonicalResourcePart(value: string): string {
  const input = String(value || '').toLowerCase();
  if (input.endsWith('sses') && input.length > 4) {
    return input.slice(0, -2);
  }
  if (
    input.length > 4 &&
    (
      input.endsWith('ches') ||
      input.endsWith('shes') ||
      input.endsWith('xes') ||
      input.endsWith('zes')
    )
  ) {
    return input.slice(0, -2);
  }
  if (input.endsWith('ies') && input.length > 3) {
    return `${input.slice(0, -3)}y`;
  }
  if (input.length > 3 && input.endsWith('s') && !input.endsWith('ss')) {
    return input.slice(0, -1);
  }
  return input;
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

  const schema = resolveMediaTypeSchema(content[mediaType]);
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
  const cleaned = PYTHON_CONFIG.namingConventions.propertyName(rawName);
  return cleaned || `${fallbackPrefix}${index}`;
}

function renderObjectLiteral(ctx: SchemaContext, parameters: ApiParameter[]): string {
  const lines = parameters.map((parameter, index) => {
    const value = sampleValueForParameter(ctx, parameter, index);
    return `    '${escapeSingleQuoted(parameter.name || `value${index + 1}`)}': ${value},`;
  });
  return ['{', ...lines, '}'].join('\n');
}

function renderBodyLiteral(ctx: SchemaContext, schema: ApiSchema | undefined, mediaType: string): string {
  if (mediaType.toLowerCase() === 'multipart/form-data') {
    return '{}';
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
      return 'True';
    case 'array': {
      const itemValue = renderSampleValue(ctx, getArrayItemSchema(resolvedSchema), fallbackName, depth + 1);
      const indent = ' '.repeat(depth * 4);
      const childIndent = ' '.repeat((depth + 1) * 4);
      return `[\n${childIndent}${itemValue},\n${indent}]`;
    }
    case 'object': {
      const entries = resolvedSchema?.properties ? Object.entries(resolvedSchema.properties) : [];
      const indent = ' '.repeat(depth * 4);
      const childIndent = ' '.repeat((depth + 1) * 4);
      if (entries.length > 0) {
        return `{\n${entries.map(([propertyName, propertySchema]) => (
          `${childIndent}'${escapeSingleQuoted(propertyName)}': ${renderSampleValue(ctx, propertySchema, propertyName, depth + 1)},`
        )).join('\n')}\n${indent}}`;
      }
      if (resolvedSchema?.additionalProperties && typeof resolvedSchema.additionalProperties === 'object') {
        return `{\n${childIndent}'value': ${renderSampleValue(
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
      return index % 2 === 0 ? 'True' : 'False';
    default:
      return `'${escapeSingleQuoted(parameter.name || `value${index + 1}`)}'`;
  }
}

function extractLiteralString(expression: string): string | undefined {
  const match = String(expression || '').match(/^'((?:\\'|\\\\|[^'])*)'$/);
  if (!match) {
    return undefined;
  }
  return match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
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
    const refName = getSchemaReferenceName(schema.$ref);
    return ctx.schemas[refName] || schema;
  }
  const composed = pickComposedSchema(schema);
  return composed ? (resolveSchema(ctx, composed) || composed) : schema;
}

function normalizeSampleSchemaType(schema: ApiSchema | undefined): string | undefined {
  return resolveSchemaType(schema).effectiveType;
}
