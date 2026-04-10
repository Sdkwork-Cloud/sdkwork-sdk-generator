import type {
  GeneratorConfig,
  GeneratorResult,
  GeneratedFile,
  ApiSpec,
  Language,
  SchemaContext,
  LanguageConfig,
  TypeMapping,
  NamingConventions,
  AuthContext,
  ApiOperationGroup
} from './types.js';
import { normalizeReadmeFile } from './readme.js';
import { buildSdkMetadataManifest, SDKWORK_METADATA_FILE } from './sdk-metadata.js';
import { normalizeOperationId, normalizeTagName } from './naming.js';

export * from './types.js';

export interface IModelGenerator {
  readonly config: LanguageConfig;
  generateModels(ctx: SchemaContext): GeneratedFile[];
  generateModel(name: string, schema: any): GeneratedFile;
  mapType(schema: any): string;
}

export interface IApiGenerator {
  readonly config: LanguageConfig;
  generateApis(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[];
  generateApiGroup(tag: string, operations: any[], config: GeneratorConfig): GeneratedFile;
}

export interface IClientGenerator {
  readonly config: LanguageConfig;
  generateClient(config: GeneratorConfig): GeneratedFile[];
}

export interface IConfigGenerator {
  readonly config: LanguageConfig;
  generatePackageConfig(config: GeneratorConfig): GeneratedFile;
  generateBuildConfig(config: GeneratorConfig): GeneratedFile[];
}

export interface IDocGenerator {
  readonly config: LanguageConfig;
  generateReadme(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile;
}

export interface IBinGenerator {
  readonly config: LanguageConfig;
  generateBinScripts(config: GeneratorConfig): GeneratedFile[];
}

export interface ITestGenerator {
  readonly config: LanguageConfig;
  generateTests(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[];
}

export abstract class BaseGenerator {
  readonly languageConfig: LanguageConfig;
  
  protected config!: GeneratorConfig;
  protected spec!: ApiSpec;
  protected ctx!: SchemaContext;

  private static readonly HTTP_METHODS = new Set([
    'get',
    'put',
    'post',
    'delete',
    'patch',
  ]);

  private static readonly JSON_MEDIA_TYPES = new Set([
    'application/json',
    'application/problem+json',
    'application/ld+json',
  ]);

  private static readonly RESERVED_TAG_PATH_SEGMENTS = new Set([
    'api',
    'app',
    'ai',
    'backend',
    'openapi',
    'docs',
    'swagger',
    'v1',
    'v2',
    'v3',
    'v4',
    'v5',
  ]);

  private static readonly RESERVED_GROUP_SEGMENTS_AFTER_PREFIX = new Set([
    'management',
    'manage',
    'admin',
    'internal',
  ]);

  private static readonly OPERATION_VERBS = new Set([
    'get',
    'list',
    'create',
    'update',
    'patch',
    'delete',
    'remove',
    'set',
    'add',
    'submit',
    'fetch',
    'query',
    'find',
    'upsert',
  ]);

  constructor(languageConfig: LanguageConfig) {
    this.languageConfig = languageConfig;
  }

  get language(): Language {
    return this.languageConfig.language;
  }

  get displayName(): string {
    return this.languageConfig.displayName;
  }

  get description(): string {
    return this.languageConfig.description;
  }

  get fileExtension(): string {
    return this.languageConfig.fileExtension;
  }

  get supportsTests(): boolean {
    return this.languageConfig.supportsTests;
  }

  async generate(config: GeneratorConfig, spec: ApiSpec): Promise<GeneratorResult> {
    this.config = config;
    this.spec = spec;

    const files: GeneratedFile[] = [];
    const errors: { message: string; code: string }[] = [];
    const warnings: string[] = [];

    try {
      if (config.generateTests === true && !this.supportsTests) {
        throw new Error(
          `The ${this.language} generator does not support generateTests=true yet. Disable generateTests or implement generator-backed test scaffolding for ${this.language}.`
        );
      }

      const openapiVersion = typeof spec.openapi === 'string' ? spec.openapi : '';
      if (!openapiVersion.startsWith('3.')) {
        const sourceErrorCode = (spec as any)?.code;
        const sourceErrorMsg = (spec as any)?.msg || (spec as any)?.errorMsg;
        if (sourceErrorCode || sourceErrorMsg) {
          throw new Error(
            `Input is not a valid OpenAPI document. Source returned error payload (code=${sourceErrorCode ?? 'unknown'}, msg=${sourceErrorMsg ?? 'unknown'}).`
          );
        }
        throw new Error(
          `Unsupported OpenAPI version "${spec.openapi || 'unknown'}". SDKWork SDK Generator only supports OpenAPI 3.x.`
        );
      }
      if (Object.keys(spec.paths || {}).length === 0) {
        throw new Error(
          'OpenAPI document has no paths. This usually means the source group endpoint is empty or misconfigured.'
        );
      }

      const compatibilityIssues = this.analyzeSpecCapabilities(spec);
      if (compatibilityIssues.length > 0) {
        throw new Error(this.formatCompatibilityIssues(compatibilityIssues));
      }
      this.ctx = this.createSchemaContext(spec);

      files.push(...this.generateModels(this.ctx));
      files.push(...this.generateApis(this.ctx, this.config));
      files.push(...this.generateClient(this.config));
      files.push(...this.generateBuildConfig(this.config));
      files.push(this.generateMetadataManifest(this.config));
      files.push(...this.generateBinScripts(this.config));
      if (config.generateReadme === false) {
        warnings.push('generateReadme=false was provided, but README generation is mandatory and remains enabled.');
      }

      const normalizedReadme = normalizeReadmeFile(this.generateReadme(this.ctx, this.config));
      files.push(normalizedReadme.file);
      if (config.generateTests === true) {
        files.push(...this.generateTests(this.ctx, this.config));
      }
      files.push(...this.generateCustomScaffolding(this.config));
      if (normalizedReadme.warning) {
        warnings.push(normalizedReadme.warning);
      }
    } catch (error) {
      files.length = 0;
      errors.push({
        message: error instanceof Error ? error.message : String(error),
        code: 'GENERATION_ERROR',
      });
    }

    const finalizedFiles = this.finalizeGeneratedFiles(files);
    const schemaCount = this.ctx ? Object.keys(this.ctx.schemas).length : 0;
    const apiCount = this.ctx ? Object.keys(this.ctx.apiGroups).length : 0;
    const typeCount = finalizedFiles.filter(f => f.path.includes('/types/') || f.path.includes('models')).length;

    return {
      files: finalizedFiles,
      errors,
      warnings,
      stats: {
        totalFiles: finalizedFiles.length,
        models: schemaCount,
        apis: apiCount,
        types: typeCount,
      },
    };
  }

  protected createSchemaContext(spec: ApiSpec): SchemaContext {
    const schemas: Record<string, any> = Object.fromEntries(
      Object.entries(spec.components?.schemas || {}).map(([name, schema]) => [name, this.cloneSchema(schema)])
    );
    const schemaFileMap = new Map<string, string>();
    const auth = this.deriveAuthContext(spec);
    const inlineSchemaNameByObject = new WeakMap<object, string>();
    
    const apiGroups: Record<string, ApiOperationGroup> = {};
    const operationRegistry = new Map<string, { index: number; score: number }>();
    const paths = spec.paths || {};
    
    for (const [path, pathItem] of Object.entries(paths)) {
      const item = (pathItem || {}) as Record<string, any>;
      const pathParameters = this.resolveParameters(spec, item.parameters);

      for (const [method, rawOperation] of Object.entries(item)) {
        const normalizedMethod = method.toLowerCase();
        if (!BaseGenerator.HTTP_METHODS.has(normalizedMethod)) {
          continue;
        }

        const operation = rawOperation as Record<string, any>;
        if (!operation || typeof operation !== 'object') {
          continue;
        }

        const operationSchemaBaseName = this.resolveOperationSchemaBaseName(operation, normalizedMethod, path);
        const operationParameters = this.resolveParameters(spec, operation.parameters);
        const mergedParameters = this.mergeParameters(pathParameters, operationParameters);
        const visibleParameters = mergedParameters.filter((parameter: any) => !this.isManagedAuthParameter(parameter, auth));
        const queryParameters = visibleParameters.filter((p: any) => p.in === 'query');
        const requestBody = this.hoistRequestBodySchemas(
          this.resolveRequestBody(spec, operation.requestBody),
          schemas,
          operationSchemaBaseName,
          normalizedMethod,
          inlineSchemaNameByObject
        );
        const responses = this.hoistResponseSchemas(
          this.resolveResponses(spec, operation.responses || {}),
          schemas,
          operationSchemaBaseName,
          normalizedMethod,
          inlineSchemaNameByObject
        );

        const group = this.resolveOperationGroup(operation, path);
        if (!apiGroups[group.domain]) {
          apiGroups[group.domain] = {
            tag: group.domain,
            domain: group.domain,
            displayName: group.displayName,
            sourceTags: group.sourceTag ? [group.sourceTag] : [],
            operations: [],
          };
        }

        if (group.sourceTag && !apiGroups[group.domain].sourceTags.includes(group.sourceTag)) {
          apiGroups[group.domain].sourceTags.push(group.sourceTag);
        }

        const generatedOperation = {
          ...operation,
          path,
          method: normalizedMethod,
          parameters: queryParameters,
          allParameters: visibleParameters,
          requestBody,
          responses,
        };
        const operationKey = `${group.domain}:${this.resolveOperationDedupKey(normalizedMethod, path, operation)}`;
        const operationScore = this.scoreOperationPathMatch(path);
        const existingOperation = operationRegistry.get(operationKey);
        if (existingOperation) {
          if (existingOperation.score >= operationScore) {
            continue;
          }

          apiGroups[group.domain].operations[existingOperation.index] = generatedOperation;
          operationRegistry.set(operationKey, {
            index: existingOperation.index,
            score: operationScore,
          });
          continue;
        }

        apiGroups[group.domain].operations.push(generatedOperation);
        operationRegistry.set(operationKey, {
          index: apiGroups[group.domain].operations.length - 1,
          score: operationScore,
        });
      }
    }

    if (!this.preservesNamedNonObjectSchemas()) {
      this.inlineNamedNonObjectSchemaRefs(schemas, apiGroups);
    }

    for (const name of Object.keys(schemas)) {
      schemaFileMap.set(this.toPascalCase(name), this.toFileName(name));
    }

    return { schemas, schemaFileMap, apiGroups, auth };
  }

  protected preservesNamedNonObjectSchemas(): boolean {
    return false;
  }

  private inlineNamedNonObjectSchemaRefs(
    schemas: Record<string, any>,
    apiGroups: Record<string, ApiOperationGroup>
  ): void {
    const sourceSchemas: Record<string, any> = { ...schemas };
    const preservedSchemas: Record<string, any> = {};

    for (const [name, schema] of Object.entries(sourceSchemas)) {
      if (!this.shouldPreserveComponentSchema(name, schema, sourceSchemas)) {
        continue;
      }
      preservedSchemas[name] = this.rewriteSchemaForNamedNonObjectRefs(schema, sourceSchemas, new Set([name]));
    }

    for (const group of Object.values(apiGroups)) {
      group.operations = group.operations.map((operation) => ({
        ...operation,
        parameters: this.rewriteParameters(operation.parameters, sourceSchemas),
        allParameters: this.rewriteParameters(operation.allParameters, sourceSchemas),
        requestBody: this.rewriteRequestBody(operation.requestBody, sourceSchemas),
        responses: this.rewriteResponses(operation.responses, sourceSchemas),
      }));
    }

    for (const key of Object.keys(schemas)) {
      delete schemas[key];
    }
    Object.assign(schemas, preservedSchemas);
  }

  private rewriteParameters(parameters: any[] | undefined, schemas: Record<string, any>): any[] | undefined {
    if (!Array.isArray(parameters)) {
      return parameters;
    }

    return parameters.map((parameter) => {
      if (!parameter || typeof parameter !== 'object') {
        return parameter;
      }
      if (!('schema' in parameter)) {
        return { ...parameter };
      }
      return {
        ...parameter,
        schema: this.rewriteSchemaForNamedNonObjectRefs((parameter as Record<string, any>).schema, schemas),
      };
    });
  }

  private rewriteRequestBody(requestBody: any, schemas: Record<string, any>): any {
    if (!requestBody || typeof requestBody !== 'object' || !requestBody.content || typeof requestBody.content !== 'object') {
      return requestBody;
    }

    const nextContent = Object.fromEntries(
      Object.entries(requestBody.content).map(([mediaType, mediaValue]) => {
        const current = mediaValue as Record<string, any>;
        if (!current || typeof current !== 'object') {
          return [mediaType, mediaValue];
        }
        return [
          mediaType,
          {
            ...current,
            schema: this.rewriteSchemaForNamedNonObjectRefs(current.schema, schemas),
          },
        ];
      })
    );

    return { ...requestBody, content: nextContent };
  }

  private rewriteResponses(responses: Record<string, any>, schemas: Record<string, any>): Record<string, any> {
    const nextResponses: Record<string, any> = {};

    for (const [statusCode, response] of Object.entries(responses || {})) {
      if (!response || typeof response !== 'object' || !response.content || typeof response.content !== 'object') {
        nextResponses[statusCode] = response;
        continue;
      }

      nextResponses[statusCode] = {
        ...response,
        content: Object.fromEntries(
          Object.entries(response.content).map(([mediaType, mediaValue]) => {
            const current = mediaValue as Record<string, any>;
            if (!current || typeof current !== 'object') {
              return [mediaType, mediaValue];
            }
            return [
              mediaType,
              {
                ...current,
                schema: this.rewriteSchemaForNamedNonObjectRefs(current.schema, schemas),
              },
            ];
          })
        ),
      };
    }

    return nextResponses;
  }

  private rewriteSchemaForNamedNonObjectRefs(
    schema: any,
    schemas: Record<string, any>,
    trail: Set<string> = new Set<string>()
  ): any {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    if (Array.isArray(schema)) {
      return schema.map((entry) => this.rewriteSchemaForNamedNonObjectRefs(entry, schemas, trail));
    }

    if (schema.$ref) {
      const refName = this.extractSchemaRefName(schema.$ref);
      if (!refName) {
        return { ...schema };
      }

      const target = schemas[refName];
      if (!target || this.shouldPreserveComponentSchema(refName, target, schemas) || trail.has(refName)) {
        return { ...schema };
      }

      return this.rewriteSchemaForNamedNonObjectRefs(this.cloneSchema(target), schemas, new Set([...trail, refName]));
    }

    const rewritten = { ...schema } as Record<string, any>;
    if (schema.items) {
      rewritten.items = this.rewriteSchemaForNamedNonObjectRefs(schema.items, schemas, trail);
    }
    if (schema.properties && typeof schema.properties === 'object') {
      rewritten.properties = Object.fromEntries(
        Object.entries(schema.properties).map(([propName, propSchema]) => [
          propName,
          this.rewriteSchemaForNamedNonObjectRefs(propSchema, schemas, trail),
        ])
      );
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      rewritten.additionalProperties = this.rewriteSchemaForNamedNonObjectRefs(
        schema.additionalProperties,
        schemas,
        trail,
      );
    }
    for (const key of ['allOf', 'oneOf', 'anyOf'] as const) {
      if (Array.isArray(schema[key])) {
        rewritten[key] = schema[key].map((entry: any) => this.rewriteSchemaForNamedNonObjectRefs(entry, schemas, trail));
      }
    }
    if (schema.not && typeof schema.not === 'object') {
      rewritten.not = this.rewriteSchemaForNamedNonObjectRefs(schema.not, schemas, trail);
    }
    return rewritten;
  }

  private shouldPreserveComponentSchema(
    schemaName: string,
    schema: any,
    schemas: Record<string, any>
  ): boolean {
    return this.preservesNamedNonObjectSchemas()
      || this.isObjectLikeSchema(schema, schemas, new Set([schemaName]));
  }

  private isObjectLikeSchema(
    schema: any,
    schemas: Record<string, any>,
    trail: Set<string> = new Set<string>()
  ): boolean {
    if (!schema || typeof schema !== 'object') {
      return false;
    }

    if (schema.$ref) {
      const refName = this.extractSchemaRefName(schema.$ref);
      if (!refName || trail.has(refName)) {
        return true;
      }
      const target = schemas[refName];
      if (!target) {
        return true;
      }
      return this.isObjectLikeSchema(target, schemas, new Set([...trail, refName]));
    }

    if (schema.properties && typeof schema.properties === 'object') {
      return true;
    }

    const schemaType = normalizeSchemaTypeValue(schema.type);
    if (schema.items || schemaType === 'array') {
      return false;
    }
    if (schema.additionalProperties && !schema.properties) {
      return false;
    }
    if (schemaType === 'object') {
      return true;
    }

    for (const key of ['allOf', 'oneOf', 'anyOf'] as const) {
      const values = schema[key];
      if (!Array.isArray(values) || values.length === 0) {
        continue;
      }
      if (values.some((entry: any) => this.isObjectLikeSchema(entry, schemas, new Set(trail)))) {
        return true;
      }
    }

    return false;
  }

  private extractSchemaRefName(ref: string): string {
    if (typeof ref !== 'string' || !ref.startsWith('#/components/schemas/')) {
      return '';
    }
    return ref.split('/').pop() || '';
  }

  private resolveOperationGroup(
    operation: Record<string, any>,
    path: string
  ): { domain: string; displayName: string; sourceTag?: string } {
    const rawTag = typeof operation.tags?.[0] === 'string' ? operation.tags[0].trim() : '';
    const explicitDomain = this.resolveExplicitSdkDomain(operation);
    if (explicitDomain) {
      return {
        domain: explicitDomain,
        displayName: this.toPascalCase(explicitDomain),
        sourceTag: rawTag || explicitDomain,
      };
    }

    const configuredDomain = this.deriveDomainFromConfiguredPrefix(path);
    if (configuredDomain) {
      return {
        domain: configuredDomain,
        displayName: this.toPascalCase(configuredDomain),
        sourceTag: rawTag || configuredDomain,
      };
    }

    const fallbackTag = this.normalizeOperationGroupTag(this.resolveOperationTag(operation, path));
    return {
      domain: fallbackTag,
      displayName: rawTag || this.toPascalCase(fallbackTag),
      sourceTag: rawTag || fallbackTag,
    };
  }

  private resolveExplicitSdkDomain(operation: Record<string, any>): string {
    const rawValue = operation?.['x-sdk-domain'];
    if (typeof rawValue !== 'string' || !rawValue.trim()) {
      return '';
    }
    return this.normalizeOperationGroupTag(rawValue);
  }

  private deriveDomainFromConfiguredPrefix(path: string): string {
    const pathSegments = this.toNormalizedPathSegments(path);
    const prefixCandidates = this.resolveConfiguredPrefixCandidates();

    for (const prefixSegments of prefixCandidates) {
      if (pathSegments.length <= prefixSegments.length) {
        continue;
      }

      if (!this.pathMatchesPrefix(pathSegments, prefixSegments)) {
        continue;
      }

      const domainCandidates = pathSegments.slice(prefixSegments.length);
      const domainSegment = domainCandidates.find(
        (segment) => !BaseGenerator.RESERVED_GROUP_SEGMENTS_AFTER_PREFIX.has(segment)
      ) || domainCandidates[0];
      if (domainSegment) {
        return this.normalizeOperationGroupTag(domainSegment);
      }
    }

    return '';
  }

  private resolveOperationDedupKey(method: string, path: string, operation: Record<string, any>): string {
    const normalizedOperationId = typeof operation.operationId === 'string'
      ? normalizeOperationId(operation.operationId)
      : '';
    const relativePath = this.resolveRelativeOperationPath(path);
    return `${method}:${relativePath}:${normalizedOperationId}`;
  }

  private resolveRelativeOperationPath(path: string): string {
    const rawSegments = this.toRawPathSegments(path);
    const normalizedSegments = this.toNormalizedPathSegments(path);
    const prefixCandidates = this.resolveConfiguredPrefixCandidates();

    for (const prefixSegments of prefixCandidates) {
      if (!this.pathMatchesPrefix(normalizedSegments, prefixSegments)) {
        continue;
      }

      const relativeSegments = rawSegments.slice(prefixSegments.length);
      return relativeSegments.length > 0 ? `/${relativeSegments.join('/')}` : '/';
    }

    return rawSegments.length > 0 ? `/${rawSegments.join('/')}` : '/';
  }

  private scoreOperationPathMatch(path: string): number {
    const normalizedSegments = this.toNormalizedPathSegments(path);
    const prefixCandidates = this.resolveConfiguredPrefixCandidates();

    for (let index = 0; index < prefixCandidates.length; index += 1) {
      if (this.pathMatchesPrefix(normalizedSegments, prefixCandidates[index])) {
        return prefixCandidates.length - index;
      }
    }

    return 0;
  }

  private resolveConfiguredPrefixCandidates(): string[][] {
    const primary = this.toNormalizedPathSegments(this.config?.apiPrefix || '');
    if (primary.length === 0) {
      return [];
    }

    const candidates: string[][] = [primary];
    const versionIndex = primary.findIndex((segment) => /^v\d+$/.test(segment));
    if (versionIndex >= 0) {
      const alias = ['v1', ...primary.slice(versionIndex + 1)];
      if (
        alias.length > 0 &&
        !candidates.some((candidate) => this.sameSegments(candidate, alias))
      ) {
        candidates.push(alias);
      }
    }

    return candidates;
  }

  private pathMatchesPrefix(pathSegments: string[], prefixSegments: string[]): boolean {
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

  private sameSegments(left: string[], right: string[]): boolean {
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

  private toRawPathSegments(value: string): string[] {
    return String(value || '')
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
  }

  private toNormalizedPathSegments(value: string): string[] {
    return String(value || '')
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .filter((segment) => !(segment.startsWith('{') && segment.endsWith('}')))
      .map((segment) => {
        const parts = this.toIdentifierParts(segment);
        if (parts.length === 0) {
          return '';
        }
        const normalized = parts.join('_');
        return BaseGenerator.RESERVED_TAG_PATH_SEGMENTS.has(normalized)
          ? normalized
          : this.singularize(normalized);
      })
      .filter(Boolean);
  }

  private resolveOperationTag(operation: Record<string, any>, path: string): string {
    const rawTag = typeof operation.tags?.[0] === 'string' ? operation.tags[0].trim() : '';
    const rawTagHasAscii = rawTag && this.hasAsciiIdentifierParts(rawTag);
    const rawTagHasNonAscii = rawTag && this.containsNonAscii(rawTag);

    if (rawTag && rawTagHasAscii && !rawTagHasNonAscii) {
      return rawTag;
    }

    const fromPath = this.deriveTagFromPath(path);
    if (fromPath) {
      return fromPath;
    }

    if (rawTag && rawTagHasAscii) {
      const normalizedRawTag = this.toIdentifierParts(rawTag).join(' ');
      if (normalizedRawTag) {
        return normalizedRawTag;
      }
    }

    const rawOperationId = typeof operation.operationId === 'string' ? operation.operationId : '';
    const fromOperationId = this.deriveTagFromOperationId(rawOperationId);
    if (fromOperationId) {
      return fromOperationId;
    }

    return rawTag || 'default';
  }

  private deriveTagFromPath(path: string): string {
    const segments = (path || '')
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .filter((segment) => !(segment.startsWith('{') && segment.endsWith('}')));

    for (const segment of segments) {
      const parts = this.toIdentifierParts(segment).filter(
        (part) => !BaseGenerator.RESERVED_TAG_PATH_SEGMENTS.has(part)
      );
      if (parts.length === 0) {
        continue;
      }

      const first = this.singularize(parts[0]);
      if (first) {
        return first;
      }
    }

    return '';
  }

  private deriveTagFromOperationId(rawOperationId: string): string {
    const normalized = normalizeOperationId(rawOperationId || '');
    const parts = this.toIdentifierParts(normalized);
    while (parts.length > 1 && BaseGenerator.OPERATION_VERBS.has(parts[0])) {
      parts.shift();
    }
    const first = this.singularize(parts[0] || '');
    return first;
  }

  private hasAsciiIdentifierParts(value: string): boolean {
    return this.toIdentifierParts(value).length > 0;
  }

  private containsNonAscii(value: string): boolean {
    return /[^\u0000-\u007f]/.test(value || '');
  }

  private toIdentifierParts(value: string): string[] {
    return (value || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase()
      .split('_')
      .filter(Boolean);
  }


  private normalizeOperationGroupTag(tag: string): string {
    const parts = this.toIdentifierParts(tag);
    if (parts.length > 0) {
      return parts.join('_');
    }

    return normalizeTagName(tag || 'default');
  }

  private singularize(value: string): string {
    const input = (value || '').trim().toLowerCase();
    if (!input) {
      return '';
    }
    if (input === 'news' || input.endsWith('news')) {
      return input;
    }
    if (input.endsWith('us') || input.endsWith('is')) {
      return input;
    }
    if (input.endsWith('ies') && input.length > 3) {
      return `${input.slice(0, -3)}y`;
    }
    if (
      input.length > 4 &&
      (
        input.endsWith('sses') ||
        input.endsWith('ches') ||
        input.endsWith('shes') ||
        input.endsWith('xes') ||
        input.endsWith('zes')
      )
    ) {
      return input.slice(0, -2);
    }
    if (input.length > 3 && input.endsWith('s') && !input.endsWith('ss')) {
      return input.slice(0, -1);
    }
    return input;
  }

  protected resolveRef<T>(spec: ApiSpec, input?: T | { $ref: string }): T | undefined {
    if (!input) {
      return undefined;
    }

    if (typeof input === 'object' && input !== null && '$ref' in input) {
      const ref = (input as { $ref: string }).$ref;
      if (!ref.startsWith('#/')) {
        return undefined;
      }

      const refPath = ref.slice(2).split('/');
      let current: any = spec as any;

      for (const segment of refPath) {
        if (!current || typeof current !== 'object' || !(segment in current)) {
          throw new Error(`Unresolved OpenAPI reference: ${ref}`);
        }
        current = current[segment];
      }

      return current as T;
    }

    return input as T;
  }

  private analyzeSpecCapabilities(spec: ApiSpec): string[] {
    const issues = new Set<string>();
    const paths = spec.paths || {};
    const securitySchemes = spec.components?.securitySchemes || {};

    for (const [name, scheme] of Object.entries(securitySchemes)) {
      if (scheme?.type === 'apiKey' && scheme.in && scheme.in !== 'header') {
        issues.add(
          `Security scheme "${name}" uses apiKey in "${scheme.in}". Generated SDK clients currently apply API key auth through headers only.`
        );
      }
    }

    for (const [path, pathItem] of Object.entries(paths)) {
      const item = (pathItem || {}) as Record<string, any>;

      const pathLevelParameters = item.parameters;
      if (this.hasExternalRef(pathLevelParameters)) {
        issues.add(`Path "${path}" contains external $ref references. Only local "#/" refs are resolved.`);
      }

      for (const [method, rawOperation] of Object.entries(item)) {
        const normalizedMethod = method.toLowerCase();
        if (!BaseGenerator.HTTP_METHODS.has(normalizedMethod)) {
          continue;
        }

        const operation = rawOperation as Record<string, any>;
        if (!operation || typeof operation !== 'object') {
          continue;
        }

        const operationLabel = `${normalizedMethod.toUpperCase()} ${path}`;
        const parameters: any[] = [
          ...((Array.isArray(pathLevelParameters) ? pathLevelParameters : []) as any[]),
          ...((Array.isArray(operation.parameters) ? operation.parameters : []) as any[]),
        ];

        const hasHeaderOrCookieParams = parameters.some((param) => {
          if (param && typeof param === 'object' && '$ref' in param) {
            return false;
          }
          const paramIn = (param as any)?.in;
          return paramIn === 'header' || paramIn === 'cookie';
        });
        if (hasHeaderOrCookieParams && !this.supportsHeaderCookieParameters()) {
          issues.add(
            `${operationLabel} defines header/cookie parameters. Generated methods currently model query/path/body by default.`
          );
        }

        if (this.hasExternalRef(operation.parameters)) {
          issues.add(`${operationLabel} contains external parameter $ref references. Only local "#/" refs are resolved.`);
        }
        if (this.hasExternalRef(operation.requestBody)) {
          issues.add(`${operationLabel} contains external requestBody $ref references. Only local "#/" refs are resolved.`);
        }
        if (this.hasExternalRef(operation.responses)) {
          issues.add(`${operationLabel} contains external response $ref references. Only local "#/" refs are resolved.`);
        }

        const requestBody = this.resolveRef<any>(spec, operation.requestBody) || operation.requestBody;
        const content = requestBody?.content;
        if (content && typeof content === 'object') {
          const mediaTypes = Object.keys(content);
          const hasJsonLike = mediaTypes.some((mediaType) => {
            const normalized = mediaType.toLowerCase();
            if (BaseGenerator.JSON_MEDIA_TYPES.has(normalized)) {
              return true;
            }
            return normalized.endsWith('+json');
          });
          if (
            !hasJsonLike &&
            mediaTypes.length > 0 &&
            !this.supportsNonJsonRequestBodyMediaTypes(mediaTypes)
          ) {
            issues.add(
              `${operationLabel} requestBody uses unsupported non-JSON media types (${mediaTypes.join(', ')}).`
            );
          }
        }
      }
    }

    return Array.from(issues);
  }

  private formatCompatibilityIssues(issues: string[]): string {
    return [
      `OpenAPI document uses unsupported features for ${this.language} generation:`,
      ...issues.map((issue) => `- ${issue}`),
    ].join('\n');
  }

  protected supportsHeaderCookieParameters(): boolean {
    return false;
  }

  protected supportsNonJsonRequestBodyMediaTypes(_mediaTypes: string[]): boolean {
    return false;
  }

  protected isManagedAuthParameter(parameter: any, auth: AuthContext): boolean {
    if (!parameter || typeof parameter !== 'object') {
      return false;
    }

    if (parameter.in !== 'header') {
      return false;
    }

    const parameterName = typeof parameter.name === 'string'
      ? parameter.name.trim().toLowerCase()
      : '';
    if (!parameterName) {
      return false;
    }

    const managedHeaders = new Set<string>([
      'authorization',
      'access-token',
    ]);
    if (auth?.apiKeyHeader) {
      managedHeaders.add(String(auth.apiKeyHeader).trim().toLowerCase());
    }

    return managedHeaders.has(parameterName);
  }

  private deriveAuthContext(spec: ApiSpec): AuthContext {
    const securitySchemes = spec.components?.securitySchemes || {};
    const referencedSchemeNames = this.collectReferencedSecuritySchemeNames(spec);

    const apiKeySchemes = Object.entries(securitySchemes)
      .filter(([, scheme]) => scheme?.type === 'apiKey')
      .map(([schemeName, scheme]) => ({
        schemeName,
        location: scheme?.in as 'header' | 'query' | 'cookie' | undefined,
        headerName: scheme?.name,
        referenced: referencedSchemeNames.has(schemeName),
      }));

    const hasApiKeyScheme = apiKeySchemes.length > 0;
    const hasBearerScheme = Object.values(securitySchemes).some(
      (scheme) => scheme?.type === 'http' && scheme?.scheme?.toLowerCase() === 'bearer'
    );
    const hasSecurityRequirements = referencedSchemeNames.size > 0;

    const apiKeyCandidates = apiKeySchemes
      .filter((scheme) => scheme.location === 'header')
      .sort((a, b) => this.scoreApiKeyScheme(b) - this.scoreApiKeyScheme(a));
    const selectedApiKey = apiKeyCandidates[0];

    let apiKeyHeader: string | undefined = selectedApiKey?.headerName;
    let apiKeyAsBearer = false;

    if (!apiKeyHeader && hasBearerScheme) {
      apiKeyHeader = 'Authorization';
      apiKeyAsBearer = true;
    } else if (apiKeyHeader?.toLowerCase() === 'authorization') {
      apiKeyAsBearer = true;
    }

    if (!apiKeyHeader) {
      apiKeyHeader = 'Authorization';
      apiKeyAsBearer = true;
    }

    return {
      hasApiKeyScheme,
      hasBearerScheme,
      hasSecurityRequirements,
      apiKeySchemeName: selectedApiKey?.schemeName,
      apiKeyIn: selectedApiKey?.location,
      apiKeyHeader,
      apiKeyAsBearer,
    };
  }

  private scoreApiKeyScheme(scheme: { schemeName: string; headerName?: string; referenced: boolean }): number {
    const header = (scheme.headerName || '').toLowerCase();
    const fullName = `${scheme.schemeName} ${header}`.toLowerCase();
    let score = 0;

    if (scheme.referenced) {
      score += 8;
    }
    if (fullName.includes('api')) {
      score += 5;
    }
    if (header === 'x-api-key') {
      score += 3;
    }
    if (header === 'authorization') {
      score += 1;
    }
    if (header === 'access-token') {
      score -= 4;
    }

    return score;
  }

  private collectReferencedSecuritySchemeNames(spec: ApiSpec): Set<string> {
    const referenced = new Set<string>();
    const collect = (security?: Array<Record<string, string[]>>) => {
      if (!Array.isArray(security)) {
        return;
      }
      for (const requirement of security) {
        for (const key of Object.keys(requirement || {})) {
          referenced.add(key);
        }
      }
    };

    collect((spec as any).security);

    const paths = spec.paths || {};
    for (const pathItem of Object.values(paths)) {
      const item = (pathItem || {}) as Record<string, any>;
      for (const [method, operation] of Object.entries(item)) {
        const normalizedMethod = method.toLowerCase();
        if (!BaseGenerator.HTTP_METHODS.has(normalizedMethod)) {
          continue;
        }
        if (operation && typeof operation === 'object') {
          collect((operation as any).security);
        }
      }
    }

    return referenced;
  }

  private hasExternalRef(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
      return false;
    }

    if ('$ref' in (value as Record<string, unknown>)) {
      const ref = (value as Record<string, unknown>).$ref;
      return typeof ref === 'string' && !ref.startsWith('#/');
    }

    if (Array.isArray(value)) {
      return value.some((item) => this.hasExternalRef(item));
    }

    return Object.values(value as Record<string, unknown>).some((item) => this.hasExternalRef(item));
  }

  private resolveParameters(spec: ApiSpec, parameters?: any[]): any[] {
    if (!parameters || !Array.isArray(parameters)) {
      return [];
    }

    return parameters
      .map((parameter) => this.resolveRef<any>(spec, parameter))
      .filter((parameter): parameter is Record<string, any> => Boolean(parameter));
  }

  private mergeParameters(pathParameters: any[], operationParameters: any[]): any[] {
    const merged = new Map<string, any>();

    for (const parameter of pathParameters) {
      const key = `${parameter.in}:${parameter.name}`;
      merged.set(key, parameter);
    }

    for (const parameter of operationParameters) {
      const key = `${parameter.in}:${parameter.name}`;
      merged.set(key, parameter);
    }

    return Array.from(merged.values());
  }

  private resolveRequestBody(spec: ApiSpec, requestBody?: any): any {
    return this.resolveRef<any>(spec, requestBody) || requestBody;
  }

  private hoistRequestBodySchemas(
    requestBody: any,
    schemas: Record<string, any>,
    operationSchemaBaseName: string,
    operationMethod: string,
    inlineSchemaNameByObject: WeakMap<object, string>
  ): any {
    if (!requestBody || typeof requestBody !== 'object' || !requestBody.content || typeof requestBody.content !== 'object') {
      return requestBody;
    }

    const nextRequestBody = { ...requestBody, content: { ...requestBody.content } };
    for (const [mediaType, mediaValue] of Object.entries(nextRequestBody.content)) {
      const current = mediaValue as Record<string, any>;
      if (!current || typeof current !== 'object') {
        continue;
      }
      const schema = current.schema;
      const hoistedSchema = this.hoistInlineOperationSchema(
        schema,
        schemas,
        `${operationSchemaBaseName}Request`,
        `${operationSchemaBaseName}${this.toPascalCase(operationMethod)}Request`,
        inlineSchemaNameByObject
      );
      if (hoistedSchema !== schema) {
        nextRequestBody.content[mediaType] = { ...current, schema: hoistedSchema };
      }
    }

    return nextRequestBody;
  }

  private resolveResponses(spec: ApiSpec, responses: Record<string, any>): Record<string, any> {
    const resolved: Record<string, any> = {};
    for (const [statusCode, response] of Object.entries(responses)) {
      resolved[statusCode] = this.resolveRef<any>(spec, response) || response;
    }
    return resolved;
  }

  private hoistResponseSchemas(
    responses: Record<string, any>,
    schemas: Record<string, any>,
    operationSchemaBaseName: string,
    operationMethod: string,
    inlineSchemaNameByObject: WeakMap<object, string>
  ): Record<string, any> {
    const resolved: Record<string, any> = {};
    for (const [statusCode, response] of Object.entries(responses || {})) {
      if (!response || typeof response !== 'object' || !response.content || typeof response.content !== 'object') {
        resolved[statusCode] = response;
        continue;
      }

      const suffix = statusCode === '200'
        ? 'Response'
        : `Response${statusCode.replace(/[^a-zA-Z0-9]+/g, '_')}`;
      const nextResponse = { ...response, content: { ...(response as any).content } };
      for (const [mediaType, mediaValue] of Object.entries(nextResponse.content)) {
        const current = mediaValue as Record<string, any>;
        if (!current || typeof current !== 'object') {
          continue;
        }
        const schema = current.schema;
        const hoistedSchema = this.hoistInlineOperationSchema(
          schema,
          schemas,
          `${operationSchemaBaseName}${suffix}`,
          `${operationSchemaBaseName}${this.toPascalCase(operationMethod)}${suffix}`,
          inlineSchemaNameByObject
        );
        if (hoistedSchema !== schema) {
          nextResponse.content[mediaType] = { ...current, schema: hoistedSchema };
        }
      }
      resolved[statusCode] = nextResponse;
    }

    return resolved;
  }

  private resolveOperationSchemaBaseName(operation: Record<string, any>, method: string, path: string): string {
    const rawOperationId = typeof operation.operationId === 'string' ? operation.operationId.trim() : '';
    if (rawOperationId) {
      return this.toPascalCase(normalizeOperationId(rawOperationId) || rawOperationId);
    }

    const raw = `${method}_${path.replace(/[{}]/g, '')}`;
    return this.toPascalCase(raw) || 'Operation';
  }

  private hoistInlineOperationSchema(
    schema: any,
    schemas: Record<string, any>,
    schemaNameHint: string,
    alternativeSchemaNameHint: string | undefined,
    inlineSchemaNameByObject: WeakMap<object, string>
  ): any {
    if (!this.shouldHoistInlineSchema(schema)) {
      return schema;
    }

    const schemaObject = schema as Record<string, any>;
    const existingName = inlineSchemaNameByObject.get(schemaObject);
    if (existingName) {
      return { $ref: `#/components/schemas/${existingName}` };
    }

    const baseName = this.toPascalCase(schemaNameHint) || 'InlineSchema';
    const alternativeName = this.toPascalCase(alternativeSchemaNameHint || '');
    const candidates = [baseName];
    if (alternativeName && alternativeName !== baseName) {
      candidates.push(alternativeName);
    }

    let schemaName = '';
    for (const candidate of candidates) {
      if (!schemas[candidate]) {
        schemaName = candidate;
        break;
      }
    }

    if (!schemaName) {
      const numericBase = candidates[candidates.length - 1];
      schemaName = numericBase;
      let index = 2;
      while (schemas[schemaName]) {
        schemaName = `${numericBase}${index}`;
        index += 1;
      }
    }

    const clonedSchema = this.cloneSchema(schemaObject);
    schemas[schemaName] = clonedSchema;
    inlineSchemaNameByObject.set(schemaObject, schemaName);
    return { $ref: `#/components/schemas/${schemaName}` };
  }

  private shouldHoistInlineSchema(schema: any): boolean {
    if (!schema || typeof schema !== 'object' || schema.$ref) {
      return false;
    }
    if (schema.oneOf || schema.anyOf || schema.allOf || schema.properties || schema.additionalProperties || schema.items) {
      return true;
    }
    return schema.type === 'object' || schema.type === 'array';
  }

  private cloneSchema<T>(schema: T): T {
    return JSON.parse(JSON.stringify(schema)) as T;
  }

  protected toPascalCase(str: string): string {
    return str
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  protected toCamelCase(str: string): string {
    const pascal = this.toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  protected toKebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toLowerCase();
  }

  protected toSnakeCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .toLowerCase();
  }

  protected toFileName(str: string): string {
    return this.toKebabCase(str);
  }

  protected extractPathParams(path: string): string[] {
    const matches = path.match(/\{([^}]+)\}/g);
    if (!matches) return [];
    return matches.map(m => m.slice(1, -1));
  }

  protected generateOperationId(method: string, path: string, operation?: any): string {
    if (operation?.operationId) {
      return this.toPascalCase(operation.operationId);
    }
    const pathParts = path.replace(/\{[^}]+\}/g, 'ById').split('/').filter(Boolean);
    return this.toPascalCase([method.toLowerCase(), ...pathParts].join('_'));
  }

  protected formatFile(content: string): string {
    return content.trim() + '\n';
  }

  protected generateCustomScaffolding(_config: GeneratorConfig): GeneratedFile[] {
    return [
      {
        path: 'custom/README.md',
        content: this.formatFile([
          '# Custom Code',
          '',
          'Keep hand-written wrappers, adapters, and orchestration here.',
          'Files outside this directory may be regenerated and overwritten.',
          'If you need to extend generated behavior, prefer composition from `custom/` instead of editing generated files directly.',
        ].join('\n')),
        language: this.language,
        description: 'Custom extension boundary',
        ownership: 'scaffold',
        overwriteStrategy: 'if-missing',
      },
    ];
  }

  protected generateTests(_ctx: SchemaContext, _config: GeneratorConfig): GeneratedFile[] {
    return [];
  }

  private finalizeGeneratedFiles(files: GeneratedFile[]): GeneratedFile[] {
    return files.map((file) => {
      const ownership = file.ownership || 'generated';
      return {
        ...file,
        path: String(file.path || '').replace(/\\/g, '/'),
        ownership,
        overwriteStrategy: file.overwriteStrategy || (ownership === 'scaffold' ? 'if-missing' : 'always'),
      };
    });
  }

  protected generateMetadataManifest(config: GeneratorConfig): GeneratedFile {
    return {
      path: SDKWORK_METADATA_FILE,
      content: `${JSON.stringify(buildSdkMetadataManifest(config), null, 2)}\n`,
      language: config.language,
      description: 'SDKWork generator metadata',
    };
  }

  protected indent(content: string, spaces: number = 2): string {
    const indent = ' '.repeat(spaces);
    return content.split('\n').map(line => line ? indent + line : line).join('\n');
  }

  protected mapType(schema: any): string {
    const mapping = this.languageConfig.typeMapping;
    if (schema.$ref) {
      return this.toPascalCase(schema.$ref.split('/').pop() || '');
    }
    if (schema.allOf) {
      return schema.allOf.map((s: any) => this.mapType(s)).join(' & ');
    }
    if (schema.oneOf || schema.anyOf) {
      const schemas = schema.oneOf || schema.anyOf || [];
      return schemas.map((s: any) => this.mapType(s)).join(' | ');
    }
    switch (schema.type) {
      case 'string':
        if (schema.enum) return schema.enum.map((v: string) => `'${v}'`).join(' | ');
        if (schema.format === 'date-time') return mapping.datetime;
        if (schema.format === 'date') return mapping.date;
        if (schema.format === 'uuid') return mapping.uuid;
        if (schema.format === 'email') return mapping.email;
        if (schema.format === 'uri' || schema.format === 'url') return mapping.url;
        return mapping.string;
      case 'number': return mapping.number;
      case 'integer': return mapping.integer;
      case 'boolean': return mapping.boolean;
      case 'array': return schema.items ? `${this.mapType(schema.items)}[]` : mapping.array;
      case 'object': return mapping.object;
      default: return 'unknown';
    }
  }

  abstract generateModels(ctx: SchemaContext): GeneratedFile[];
  abstract generateApis(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[];
  abstract generateClient(config: GeneratorConfig): GeneratedFile[];
  abstract generateBuildConfig(config: GeneratorConfig): GeneratedFile[];
  abstract generateBinScripts(config: GeneratorConfig): GeneratedFile[];
  abstract generateReadme(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile;
}

export function createLanguageConfig(
  language: Language,
  typeMapping: TypeMapping,
  namingConventions: Partial<NamingConventions> = {},
  overrides: Partial<LanguageConfig> = {}
): LanguageConfig {
  return {
    language,
    displayName: language.charAt(0).toUpperCase() + language.slice(1),
    description: `Generated ${language} SDK`,
    fileExtension: '.' + language,
    supportsTests: false,
    supportsStrictTypes: true,
    supportsAsyncAwait: true,
    defaultIndent: '  ',
    lineEnding: '\n',
    typeMapping,
    namingConventions: {
      modelName: (name: string) => toPascalCase(name),
      propertyName: (name: string) => toCamelCase(name),
      methodName: (name: string) => toCamelCase(name),
      fileName: (name: string) => toKebabCase(name),
      packageName: (name: string) => toKebabCase(name),
      ...namingConventions,
    },
    ...overrides,
  };
}

function toPascalCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function toCamelCase(str: string): string {
  return toPascalCase(str).replace(/^[A-Z]/, c => c.toLowerCase());
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase();
}

function normalizeSchemaTypeValue(type: unknown): string | undefined {
  if (typeof type === 'string') {
    return type;
  }
  if (Array.isArray(type)) {
    const candidate = type.find((entry) => typeof entry === 'string' && entry !== 'null');
    return typeof candidate === 'string' ? candidate : undefined;
  }
  return undefined;
}
