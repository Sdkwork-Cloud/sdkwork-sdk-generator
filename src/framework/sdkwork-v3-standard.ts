import type { ApiOperation, ApiSpec, SdkType } from './types.js';
import { normalizeOpenApiPathItemOperations } from './http-methods.js';
import { validateSdkworkV3Envelope } from './sdkwork-v3-envelope.js';

const ACCESS_TOKEN_HEADER = 'Access-Token';
const API_KEY_HEADER = 'X-API-Key';
const AGENT_TOKEN_HEADER = 'X-SDKWork-Agent-Token';
const API_KEY_SCHEME = 'ApiKey';
const AGENT_TOKEN_SCHEME = 'AgentToken';
const AUTH_TOKEN_SCHEME = 'AuthToken';
const ACCESS_TOKEN_SCHEME = 'AccessToken';

const AUTH_BACKEND_RESOURCE_SEGMENTS = new Set([
  'sessions',
  'verification_codes',
  'password_reset_requests',
  'password_resets',
]);

const OAUTH_BACKEND_RESOURCE_SEGMENTS = new Set([
  'authorization_urls',
  'device_authorizations',
  'mini_program_sessions',
  'sessions',
]);

const BACKEND_COURSE_RESOURCE_SEGMENTS = new Set([
  'course-applications',
  'course-lessons',
  'course-sections',
]);

export interface SdkworkV3StandardValidationOptions {
  sdkType: SdkType;
  apiPrefix?: string;
}

export function validateSdkworkV3Standard(
  spec: ApiSpec,
  options: SdkworkV3StandardValidationOptions,
): string[] {
  const issues: string[] = [];
  const expectedPrefix = resolveExpectedPrefix(options.sdkType, options.apiPrefix);
  const configuredPrefix = normalizePath(options.apiPrefix || expectedPrefix);

  if (configuredPrefix !== expectedPrefix) {
    issues.push(`apiPrefix must be "${expectedPrefix}" for sdkwork-v3 ${options.sdkType} SDKs.`);
  }
  if (isCustomOpenApi(options.sdkType) && isForbiddenOpenApiPrefix(configuredPrefix)) {
    issues.push(
      'apiPrefix must not be "/app/v3/api" or "/backend/v3/api" for sdkwork-v3 custom open-api SDKs.',
    );
  }

  const securitySchemes = spec.components?.securitySchemes || {};
  validateSecuritySchemes(securitySchemes, options.sdkType, issues);
  issues.push(...validateSdkworkV3Envelope(spec, { sdkType: options.sdkType }));

  for (const [rawPath, pathItem] of Object.entries(spec.paths || {})) {
    const path = normalizePath(rawPath);
    if (!path.startsWith(`${expectedPrefix}/`) && path !== expectedPrefix) {
      issues.push(`Path "${rawPath}" must start with "${expectedPrefix}".`);
    }
    validatePathSegments(rawPath, expectedPrefix, options.sdkType, issues);

    const item = (pathItem || {}) as Record<string, any>;
    for (const { method, operation } of normalizeOpenApiPathItemOperations(item)) {
      const apiOperation = operation as ApiOperation;
      const operationLabel = `${method.toUpperCase()} ${rawPath}`;
      validateOperationId(operationLabel, apiOperation.operationId, issues);
      validateTags(operationLabel, apiOperation.tags, issues);
      validateErrorResponses(operationLabel, apiOperation, issues);
      validateSecurity(operationLabel, apiOperation, options.sdkType, issues);

      if (options.sdkType === 'backend' && isBackendAuthEndpoint(path, expectedPrefix)) {
        issues.push(`${operationLabel} must not expose auth/session endpoints in backend-api.`);
      }
    }
  }

  return issues;
}

export function formatSdkworkV3StandardIssues(issues: string[]): string {
  return [
    'SDKWork v3 OpenAPI standard violations:',
    ...issues.map((issue) => `- ${issue}`),
  ].join('\n');
}

function resolveExpectedPrefix(sdkType: SdkType, apiPrefix?: string): string {
  if (sdkType === 'app') {
    return '/app/v3/api';
  }
  if (sdkType === 'backend') {
    return '/backend/v3/api';
  }
  if (sdkType === 'im') {
    return '/im/v3/api';
  }
  if (isCustomOpenApi(sdkType)) {
    return normalizePath(apiPrefix || '');
  }
  throw new Error(`sdkwork-v3 standard profile supports app, backend, im, and custom open-api SDKs only. Received: ${sdkType}`);
}

function isCustomOpenApi(sdkType: SdkType): boolean {
  return sdkType === 'custom';
}

function isForbiddenOpenApiPrefix(prefix: string): boolean {
  return prefix === '/app/v3/api' || prefix === '/backend/v3/api';
}

function validateSecuritySchemes(
  securitySchemes: Record<string, any>,
  sdkType: SdkType,
  issues: string[],
): void {
  if (isCustomOpenApi(sdkType)) {
    const apiKeyScheme = securitySchemes[API_KEY_SCHEME];
    if (
      apiKeyScheme?.type !== 'apiKey'
      || apiKeyScheme.in !== 'header'
      || apiKeyScheme.name !== API_KEY_HEADER
    ) {
      issues.push(
        `components.securitySchemes.${API_KEY_SCHEME} must be an apiKey header named "${API_KEY_HEADER}".`,
      );
    }
    return;
  }

  const authScheme = securitySchemes[AUTH_TOKEN_SCHEME];
  if (authScheme?.type !== 'http' || authScheme.scheme?.toLowerCase() !== 'bearer') {
    issues.push(`components.securitySchemes.${AUTH_TOKEN_SCHEME} must be an HTTP bearer scheme.`);
  }

  const accessScheme = securitySchemes[ACCESS_TOKEN_SCHEME];
  if (
    accessScheme?.type !== 'apiKey'
    || accessScheme.in !== 'header'
    || accessScheme.name !== ACCESS_TOKEN_HEADER
  ) {
    issues.push(
      `components.securitySchemes.${ACCESS_TOKEN_SCHEME} must be an apiKey header named "${ACCESS_TOKEN_HEADER}".`,
    );
  }

  const agentScheme = securitySchemes[AGENT_TOKEN_SCHEME];
  if (
    agentScheme !== undefined
    && (
      agentScheme?.type !== 'apiKey'
      || agentScheme.in !== 'header'
      || agentScheme.name !== AGENT_TOKEN_HEADER
    )
  ) {
    issues.push(
      `components.securitySchemes.${AGENT_TOKEN_SCHEME} must be an apiKey header named "${AGENT_TOKEN_HEADER}".`,
    );
  }
}

function validateOperationId(operationLabel: string, operationId: string | undefined, issues: string[]): void {
  const value = (operationId || '').trim();
  if (!value) {
    issues.push(`${operationLabel} must define operationId.`);
    return;
  }
  if (value.includes('__')) {
    issues.push(`${operationLabel} operationId "${value}" must not contain "__".`);
  }
  if (!/^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)*$/.test(value)) {
    issues.push(
      `${operationLabel} operationId "${value}" must use lowerCamelCase segments separated by ".".`,
    );
  }
}

function validateTags(operationLabel: string, tags: string[] | undefined, issues: string[]): void {
  if (!Array.isArray(tags) || tags.length !== 1) {
    issues.push(`${operationLabel} must define exactly one canonical tag.`);
    return;
  }
  const tag = tags[0] || '';
  if (!/^[a-z][A-Za-z0-9]*$/.test(tag)) {
    issues.push(`${operationLabel} tag "${tag}" must be lowerCamelCase.`);
  }
}

function validateErrorResponses(operationLabel: string, operation: ApiOperation, issues: string[]): void {
  const responses = operation.responses || {};
  for (const [statusCode, response] of Object.entries(responses)) {
    const numericStatus = Number(statusCode);
    if (!Number.isFinite(numericStatus) || numericStatus < 400) {
      continue;
    }
    const content = response?.content || {};
    if (!Object.keys(content).some((mediaType) => mediaType.toLowerCase() === 'application/problem+json')) {
      issues.push(`${operationLabel} response ${statusCode} must include application/problem+json.`);
    }
  }
}

function validateSecurity(
  operationLabel: string,
  operation: ApiOperation,
  sdkType: SdkType,
  issues: string[],
): void {
  const routeAuth = (operation as unknown as Record<string, unknown>)['x-sdkwork-route-auth'];
  if (sdkType === 'backend' && routeAuth === 'agent-token') {
    const hasAgentTokenRequirement = (operation.security || []).some((requirement) => (
      Object.prototype.hasOwnProperty.call(requirement, AGENT_TOKEN_SCHEME)
    ));
    if (!hasAgentTokenRequirement) {
      issues.push(`${operationLabel} agent-token route must require ${AGENT_TOKEN_SCHEME}.`);
    }
    return;
  }

  if (Array.isArray(operation.security) && operation.security.length === 0) {
    return;
  }

  const security = operation.security || [];
  if (isCustomOpenApi(sdkType)) {
    const hasApiKeyRequirement = security.some((requirement) => (
      Object.prototype.hasOwnProperty.call(requirement, API_KEY_SCHEME)
    ));
    if (!hasApiKeyRequirement) {
      issues.push(`${operationLabel} must require ${API_KEY_SCHEME}, or explicitly set security: [].`);
    }
    return;
  }

  const hasDualTokenRequirement = security.some((requirement) => (
    Object.prototype.hasOwnProperty.call(requirement, AUTH_TOKEN_SCHEME)
    && Object.prototype.hasOwnProperty.call(requirement, ACCESS_TOKEN_SCHEME)
  ));
  if (!hasDualTokenRequirement) {
    issues.push(`${operationLabel} must require both ${AUTH_TOKEN_SCHEME} and ${ACCESS_TOKEN_SCHEME}, or explicitly set security: [].`);
  }
}

function validatePathSegments(rawPath: string, expectedPrefix: string, sdkType: SdkType, issues: string[]): void {
  const path = normalizePath(rawPath);
  const relative = path.startsWith(expectedPrefix)
    ? path.slice(expectedPrefix.length)
    : path;
  for (const segment of relative.split('/').filter(Boolean)) {
    if (segment.startsWith('{') && segment.endsWith('}')) {
      const parameterName = segment.slice(1, -1);
      if (!/^[a-z][A-Za-z0-9]*$/.test(parameterName)) {
        issues.push(`Path "${rawPath}" parameter "${segment}" must use lowerCamelCase.`);
      }
      continue;
    }
    if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(segment)) {
      if (sdkType === 'backend' && isAllowedBackendCourseResourceSegment(path, expectedPrefix, segment)) {
        continue;
      }
      issues.push(`Path "${rawPath}" segment "${segment}" must use lower_snake_case.`);
    }
  }
}

function isAllowedBackendCourseResourceSegment(path: string, expectedPrefix: string, segment: string): boolean {
  return path.startsWith(`${expectedPrefix}/content/`) && BACKEND_COURSE_RESOURCE_SEGMENTS.has(segment);
}

function isBackendAuthEndpoint(path: string, expectedPrefix: string): boolean {
  const relativeSegments = path
    .slice(expectedPrefix.length)
    .split('/')
    .filter(Boolean);
  if (relativeSegments[0] === 'auth') {
    return relativeSegments.length === 1 || AUTH_BACKEND_RESOURCE_SEGMENTS.has(relativeSegments[1]);
  }
  return relativeSegments[0] === 'oauth'
    && (relativeSegments.length === 1 || OAUTH_BACKEND_RESOURCE_SEGMENTS.has(relativeSegments[1]));
}

function normalizePath(path: string): string {
  const value = String(path || '').trim();
  if (!value) {
    return '/';
  }
  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}
