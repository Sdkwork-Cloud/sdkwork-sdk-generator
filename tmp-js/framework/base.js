import { normalizeReadmeFile } from './readme.js';
import { normalizeOperationId, normalizeTagName } from './naming.js';
export * from './types.js';
export class BaseGenerator {
    constructor(languageConfig) {
        this.languageConfig = languageConfig;
    }
    get language() {
        return this.languageConfig.language;
    }
    get displayName() {
        return this.languageConfig.displayName;
    }
    get description() {
        return this.languageConfig.description;
    }
    get fileExtension() {
        return this.languageConfig.fileExtension;
    }
    get supportsTests() {
        return this.languageConfig.supportsTests;
    }
    async generate(config, spec) {
        this.config = config;
        this.spec = spec;
        const files = [];
        const errors = [];
        const warnings = [];
        try {
            const openapiVersion = typeof spec.openapi === 'string' ? spec.openapi : '';
            if (!openapiVersion.startsWith('3.')) {
                const sourceErrorCode = spec?.code;
                const sourceErrorMsg = spec?.msg || spec?.errorMsg;
                if (sourceErrorCode || sourceErrorMsg) {
                    throw new Error(`Input is not a valid OpenAPI document. Source returned error payload (code=${sourceErrorCode ?? 'unknown'}, msg=${sourceErrorMsg ?? 'unknown'}).`);
                }
                throw new Error(`Unsupported OpenAPI version "${spec.openapi || 'unknown'}". SDKWork SDK Generator only supports OpenAPI 3.x.`);
            }
            if (Object.keys(spec.paths || {}).length === 0) {
                throw new Error('OpenAPI document has no paths. This usually means the source group endpoint is empty or misconfigured.');
            }
            warnings.push(...this.analyzeSpecCapabilities(spec));
            this.ctx = this.createSchemaContext(spec);
            files.push(...this.generateModels(this.ctx));
            files.push(...this.generateApis(this.ctx, this.config));
            files.push(...this.generateClient(this.config));
            files.push(...this.generateBuildConfig(this.config));
            files.push(...this.generateBinScripts(this.config));
            if (config.generateReadme === false) {
                warnings.push('generateReadme=false was provided, but README generation is mandatory and remains enabled.');
            }
            const normalizedReadme = normalizeReadmeFile(this.generateReadme(this.ctx, this.config));
            files.push(normalizedReadme.file);
            if (normalizedReadme.warning) {
                warnings.push(normalizedReadme.warning);
            }
        }
        catch (error) {
            files.length = 0;
            errors.push({
                message: error instanceof Error ? error.message : String(error),
                code: 'GENERATION_ERROR',
            });
        }
        const schemaCount = this.ctx ? Object.keys(this.ctx.schemas).length : 0;
        const apiCount = this.ctx ? Object.keys(this.ctx.apiGroups).length : 0;
        const typeCount = files.filter(f => f.path.includes('/types/') || f.path.includes('models')).length;
        return {
            files,
            errors,
            warnings,
            stats: {
                totalFiles: files.length,
                models: schemaCount,
                apis: apiCount,
                types: typeCount,
            },
        };
    }
    createSchemaContext(spec) {
        const schemas = { ...(spec.components?.schemas || {}) };
        const schemaFileMap = new Map();
        const auth = this.deriveAuthContext(spec);
        const inlineSchemaNameByObject = new WeakMap();
        const apiGroups = {};
        const paths = spec.paths || {};
        for (const [path, pathItem] of Object.entries(paths)) {
            const item = (pathItem || {});
            const pathParameters = this.resolveParameters(spec, item.parameters);
            for (const [method, rawOperation] of Object.entries(item)) {
                const normalizedMethod = method.toLowerCase();
                if (!BaseGenerator.HTTP_METHODS.has(normalizedMethod)) {
                    continue;
                }
                const operation = rawOperation;
                if (!operation || typeof operation !== 'object') {
                    continue;
                }
                const operationSchemaBaseName = this.resolveOperationSchemaBaseName(operation, normalizedMethod, path);
                const operationParameters = this.resolveParameters(spec, operation.parameters);
                const mergedParameters = this.mergeParameters(pathParameters, operationParameters);
                const visibleParameters = mergedParameters.filter((parameter) => !this.isManagedAuthParameter(parameter, auth));
                const queryParameters = visibleParameters.filter((p) => p.in === 'query');
                const requestBody = this.hoistRequestBodySchemas(this.resolveRequestBody(spec, operation.requestBody), schemas, operationSchemaBaseName, normalizedMethod, inlineSchemaNameByObject);
                const responses = this.hoistResponseSchemas(this.resolveResponses(spec, operation.responses || {}), schemas, operationSchemaBaseName, normalizedMethod, inlineSchemaNameByObject);
                const tag = this.normalizeOperationGroupTag(this.resolveOperationTag(operation, path));
                if (!apiGroups[tag]) {
                    apiGroups[tag] = { tag, operations: [] };
                }
                apiGroups[tag].operations.push({
                    ...operation,
                    path,
                    method: normalizedMethod,
                    parameters: queryParameters,
                    allParameters: visibleParameters,
                    requestBody,
                    responses,
                });
            }
        }
        for (const name of Object.keys(schemas)) {
            schemaFileMap.set(this.toPascalCase(name), this.toFileName(name));
        }
        return { schemas, schemaFileMap, apiGroups, auth };
    }
    resolveOperationTag(operation, path) {
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
    deriveTagFromPath(path) {
        const segments = (path || '')
            .split('/')
            .map((segment) => segment.trim())
            .filter(Boolean)
            .filter((segment) => !(segment.startsWith('{') && segment.endsWith('}')));
        for (const segment of segments) {
            const parts = this.toIdentifierParts(segment).filter((part) => !BaseGenerator.RESERVED_TAG_PATH_SEGMENTS.has(part));
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
    deriveTagFromOperationId(rawOperationId) {
        const normalized = normalizeOperationId(rawOperationId || '');
        const parts = this.toIdentifierParts(normalized);
        while (parts.length > 1 && BaseGenerator.OPERATION_VERBS.has(parts[0])) {
            parts.shift();
        }
        const first = this.singularize(parts[0] || '');
        return first;
    }
    hasAsciiIdentifierParts(value) {
        return this.toIdentifierParts(value).length > 0;
    }
    containsNonAscii(value) {
        return /[^\u0000-\u007f]/.test(value || '');
    }
    toIdentifierParts(value) {
        return (value || '')
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
            .replace(/[^a-zA-Z0-9]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .toLowerCase()
            .split('_')
            .filter(Boolean);
    }
    normalizeOperationGroupTag(tag) {
        const parts = this.toIdentifierParts(tag);
        if (parts.length > 0) {
            return parts.join('_');
        }
        return normalizeTagName(tag || 'default');
    }
    singularize(value) {
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
        if (input.endsWith('sses')) {
            return input;
        }
        if (input.length > 3 && input.endsWith('s') && !input.endsWith('ss')) {
            return input.slice(0, -1);
        }
        return input;
    }
    resolveRef(spec, input) {
        if (!input) {
            return undefined;
        }
        if (typeof input === 'object' && input !== null && '$ref' in input) {
            const ref = input.$ref;
            if (!ref.startsWith('#/')) {
                return undefined;
            }
            const refPath = ref.slice(2).split('/');
            let current = spec;
            for (const segment of refPath) {
                if (!current || typeof current !== 'object' || !(segment in current)) {
                    throw new Error(`Unresolved OpenAPI reference: ${ref}`);
                }
                current = current[segment];
            }
            return current;
        }
        return input;
    }
    analyzeSpecCapabilities(spec) {
        const warnings = new Set();
        const paths = spec.paths || {};
        const securitySchemes = spec.components?.securitySchemes || {};
        for (const [name, scheme] of Object.entries(securitySchemes)) {
            if (scheme?.type === 'apiKey' && scheme.in && scheme.in !== 'header') {
                warnings.add(`Security scheme "${name}" uses apiKey in "${scheme.in}". Generated SDK clients currently apply API key auth through headers.`);
            }
        }
        for (const [path, pathItem] of Object.entries(paths)) {
            const item = (pathItem || {});
            const pathLevelParameters = item.parameters;
            if (this.hasExternalRef(pathLevelParameters)) {
                warnings.add(`Path "${path}" contains external $ref references. Only local "#/" refs are resolved.`);
            }
            for (const [method, rawOperation] of Object.entries(item)) {
                const normalizedMethod = method.toLowerCase();
                if (!BaseGenerator.HTTP_METHODS.has(normalizedMethod)) {
                    continue;
                }
                const operation = rawOperation;
                if (!operation || typeof operation !== 'object') {
                    continue;
                }
                const operationLabel = `${normalizedMethod.toUpperCase()} ${path}`;
                const parameters = [
                    ...(Array.isArray(pathLevelParameters) ? pathLevelParameters : []),
                    ...(Array.isArray(operation.parameters) ? operation.parameters : []),
                ];
                const hasHeaderOrCookieParams = parameters.some((param) => {
                    if (param && typeof param === 'object' && '$ref' in param) {
                        return false;
                    }
                    const paramIn = param?.in;
                    return paramIn === 'header' || paramIn === 'cookie';
                });
                if (hasHeaderOrCookieParams && !this.supportsHeaderCookieParameters()) {
                    warnings.add(`${operationLabel} defines header/cookie parameters. Generated methods currently model query/path/body by default.`);
                }
                if (this.hasExternalRef(operation.parameters)) {
                    warnings.add(`${operationLabel} contains external parameter $ref references. Only local "#/" refs are resolved.`);
                }
                if (this.hasExternalRef(operation.requestBody)) {
                    warnings.add(`${operationLabel} contains external requestBody $ref references. Only local "#/" refs are resolved.`);
                }
                if (this.hasExternalRef(operation.responses)) {
                    warnings.add(`${operationLabel} contains external response $ref references. Only local "#/" refs are resolved.`);
                }
                const requestBody = this.resolveRef(spec, operation.requestBody) || operation.requestBody;
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
                    if (!hasJsonLike &&
                        mediaTypes.length > 0 &&
                        !this.supportsNonJsonRequestBodyMediaTypes(mediaTypes)) {
                        warnings.add(`${operationLabel} requestBody uses non-JSON media types (${mediaTypes.join(', ')}). Generator sends JSON payloads by default.`);
                    }
                }
            }
        }
        return Array.from(warnings);
    }
    supportsHeaderCookieParameters() {
        return false;
    }
    supportsNonJsonRequestBodyMediaTypes(_mediaTypes) {
        return false;
    }
    isManagedAuthParameter(parameter, auth) {
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
        const managedHeaders = new Set([
            'authorization',
            'access-token',
        ]);
        if (auth?.apiKeyHeader) {
            managedHeaders.add(String(auth.apiKeyHeader).trim().toLowerCase());
        }
        return managedHeaders.has(parameterName);
    }
    deriveAuthContext(spec) {
        const securitySchemes = spec.components?.securitySchemes || {};
        const referencedSchemeNames = this.collectReferencedSecuritySchemeNames(spec);
        const apiKeySchemes = Object.entries(securitySchemes)
            .filter(([, scheme]) => scheme?.type === 'apiKey')
            .map(([schemeName, scheme]) => ({
            schemeName,
            location: scheme?.in,
            headerName: scheme?.name,
            referenced: referencedSchemeNames.has(schemeName),
        }));
        const hasApiKeyScheme = apiKeySchemes.length > 0;
        const hasBearerScheme = Object.values(securitySchemes).some((scheme) => scheme?.type === 'http' && scheme?.scheme?.toLowerCase() === 'bearer');
        const hasSecurityRequirements = referencedSchemeNames.size > 0;
        const apiKeyCandidates = apiKeySchemes
            .filter((scheme) => scheme.location === 'header')
            .sort((a, b) => this.scoreApiKeyScheme(b) - this.scoreApiKeyScheme(a));
        const selectedApiKey = apiKeyCandidates[0];
        let apiKeyHeader = selectedApiKey?.headerName;
        let apiKeyAsBearer = false;
        if (!apiKeyHeader && hasBearerScheme) {
            apiKeyHeader = 'Authorization';
            apiKeyAsBearer = true;
        }
        else if (apiKeyHeader?.toLowerCase() === 'authorization') {
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
    scoreApiKeyScheme(scheme) {
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
    collectReferencedSecuritySchemeNames(spec) {
        const referenced = new Set();
        const collect = (security) => {
            if (!Array.isArray(security)) {
                return;
            }
            for (const requirement of security) {
                for (const key of Object.keys(requirement || {})) {
                    referenced.add(key);
                }
            }
        };
        collect(spec.security);
        const paths = spec.paths || {};
        for (const pathItem of Object.values(paths)) {
            const item = (pathItem || {});
            for (const [method, operation] of Object.entries(item)) {
                const normalizedMethod = method.toLowerCase();
                if (!BaseGenerator.HTTP_METHODS.has(normalizedMethod)) {
                    continue;
                }
                if (operation && typeof operation === 'object') {
                    collect(operation.security);
                }
            }
        }
        return referenced;
    }
    hasExternalRef(value) {
        if (!value || typeof value !== 'object') {
            return false;
        }
        if ('$ref' in value) {
            const ref = value.$ref;
            return typeof ref === 'string' && !ref.startsWith('#/');
        }
        if (Array.isArray(value)) {
            return value.some((item) => this.hasExternalRef(item));
        }
        return Object.values(value).some((item) => this.hasExternalRef(item));
    }
    resolveParameters(spec, parameters) {
        if (!parameters || !Array.isArray(parameters)) {
            return [];
        }
        return parameters
            .map((parameter) => this.resolveRef(spec, parameter))
            .filter((parameter) => Boolean(parameter));
    }
    mergeParameters(pathParameters, operationParameters) {
        const merged = new Map();
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
    resolveRequestBody(spec, requestBody) {
        return this.resolveRef(spec, requestBody) || requestBody;
    }
    hoistRequestBodySchemas(requestBody, schemas, operationSchemaBaseName, operationMethod, inlineSchemaNameByObject) {
        if (!requestBody || typeof requestBody !== 'object' || !requestBody.content || typeof requestBody.content !== 'object') {
            return requestBody;
        }
        const nextRequestBody = { ...requestBody, content: { ...requestBody.content } };
        for (const [mediaType, mediaValue] of Object.entries(nextRequestBody.content)) {
            const current = mediaValue;
            if (!current || typeof current !== 'object') {
                continue;
            }
            const schema = current.schema;
            const hoistedSchema = this.hoistInlineOperationSchema(schema, schemas, `${operationSchemaBaseName}Request`, `${operationSchemaBaseName}${this.toPascalCase(operationMethod)}Request`, inlineSchemaNameByObject);
            if (hoistedSchema !== schema) {
                nextRequestBody.content[mediaType] = { ...current, schema: hoistedSchema };
            }
        }
        return nextRequestBody;
    }
    resolveResponses(spec, responses) {
        const resolved = {};
        for (const [statusCode, response] of Object.entries(responses)) {
            resolved[statusCode] = this.resolveRef(spec, response) || response;
        }
        return resolved;
    }
    hoistResponseSchemas(responses, schemas, operationSchemaBaseName, operationMethod, inlineSchemaNameByObject) {
        const resolved = {};
        for (const [statusCode, response] of Object.entries(responses || {})) {
            if (!response || typeof response !== 'object' || !response.content || typeof response.content !== 'object') {
                resolved[statusCode] = response;
                continue;
            }
            const suffix = statusCode === '200'
                ? 'Response'
                : `Response${statusCode.replace(/[^a-zA-Z0-9]+/g, '_')}`;
            const nextResponse = { ...response, content: { ...response.content } };
            for (const [mediaType, mediaValue] of Object.entries(nextResponse.content)) {
                const current = mediaValue;
                if (!current || typeof current !== 'object') {
                    continue;
                }
                const schema = current.schema;
                const hoistedSchema = this.hoistInlineOperationSchema(schema, schemas, `${operationSchemaBaseName}${suffix}`, `${operationSchemaBaseName}${this.toPascalCase(operationMethod)}${suffix}`, inlineSchemaNameByObject);
                if (hoistedSchema !== schema) {
                    nextResponse.content[mediaType] = { ...current, schema: hoistedSchema };
                }
            }
            resolved[statusCode] = nextResponse;
        }
        return resolved;
    }
    resolveOperationSchemaBaseName(operation, method, path) {
        const rawOperationId = typeof operation.operationId === 'string' ? operation.operationId.trim() : '';
        if (rawOperationId) {
            return this.toPascalCase(normalizeOperationId(rawOperationId) || rawOperationId);
        }
        const raw = `${method}_${path.replace(/[{}]/g, '')}`;
        return this.toPascalCase(raw) || 'Operation';
    }
    hoistInlineOperationSchema(schema, schemas, schemaNameHint, alternativeSchemaNameHint, inlineSchemaNameByObject) {
        if (!this.shouldHoistInlineSchema(schema)) {
            return schema;
        }
        const schemaObject = schema;
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
    shouldHoistInlineSchema(schema) {
        if (!schema || typeof schema !== 'object' || schema.$ref) {
            return false;
        }
        if (schema.oneOf || schema.anyOf || schema.allOf || schema.properties || schema.additionalProperties || schema.items) {
            return true;
        }
        return schema.type === 'object' || schema.type === 'array';
    }
    cloneSchema(schema) {
        return JSON.parse(JSON.stringify(schema));
    }
    toPascalCase(str) {
        return str
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/[^a-zA-Z0-9]+/g, ' ')
            .split(' ')
            .filter(Boolean)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');
    }
    toCamelCase(str) {
        const pascal = this.toPascalCase(str);
        return pascal.charAt(0).toLowerCase() + pascal.slice(1);
    }
    toKebabCase(str) {
        return str.replace(/([a-z])([A-Z])/g, '$1-$2')
            .replace(/[\s_]+/g, '-')
            .replace(/[^a-zA-Z0-9-]/g, '')
            .toLowerCase();
    }
    toSnakeCase(str) {
        return str.replace(/([a-z])([A-Z])/g, '$1_$2')
            .replace(/[\s-]+/g, '_')
            .replace(/[^a-zA-Z0-9_]/g, '')
            .toLowerCase();
    }
    toFileName(str) {
        return this.toKebabCase(str);
    }
    extractPathParams(path) {
        const matches = path.match(/\{([^}]+)\}/g);
        if (!matches)
            return [];
        return matches.map(m => m.slice(1, -1));
    }
    generateOperationId(method, path, operation) {
        if (operation?.operationId) {
            return this.toPascalCase(operation.operationId);
        }
        const pathParts = path.replace(/\{[^}]+\}/g, 'ById').split('/').filter(Boolean);
        return this.toPascalCase([method.toLowerCase(), ...pathParts].join('_'));
    }
    formatFile(content) {
        return content.trim() + '\n';
    }
    indent(content, spaces = 2) {
        const indent = ' '.repeat(spaces);
        return content.split('\n').map(line => line ? indent + line : line).join('\n');
    }
    mapType(schema) {
        const mapping = this.languageConfig.typeMapping;
        if (schema.$ref) {
            return this.toPascalCase(schema.$ref.split('/').pop() || '');
        }
        if (schema.allOf) {
            return schema.allOf.map((s) => this.mapType(s)).join(' & ');
        }
        if (schema.oneOf || schema.anyOf) {
            const schemas = schema.oneOf || schema.anyOf || [];
            return schemas.map((s) => this.mapType(s)).join(' | ');
        }
        switch (schema.type) {
            case 'string':
                if (schema.enum)
                    return schema.enum.map((v) => `'${v}'`).join(' | ');
                if (schema.format === 'date-time')
                    return mapping.datetime;
                if (schema.format === 'date')
                    return mapping.date;
                if (schema.format === 'uuid')
                    return mapping.uuid;
                if (schema.format === 'email')
                    return mapping.email;
                if (schema.format === 'uri' || schema.format === 'url')
                    return mapping.url;
                return mapping.string;
            case 'number': return mapping.number;
            case 'integer': return mapping.integer;
            case 'boolean': return mapping.boolean;
            case 'array': return schema.items ? `${this.mapType(schema.items)}[]` : mapping.array;
            case 'object': return mapping.object;
            default: return 'unknown';
        }
    }
}
BaseGenerator.HTTP_METHODS = new Set([
    'get',
    'put',
    'post',
    'delete',
    'patch',
]);
BaseGenerator.JSON_MEDIA_TYPES = new Set([
    'application/json',
    'application/problem+json',
    'application/ld+json',
]);
BaseGenerator.RESERVED_TAG_PATH_SEGMENTS = new Set([
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
BaseGenerator.OPERATION_VERBS = new Set([
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
export function createLanguageConfig(language, typeMapping, namingConventions = {}, overrides = {}) {
    return {
        language,
        displayName: language.charAt(0).toUpperCase() + language.slice(1),
        description: `Generated ${language} SDK`,
        fileExtension: '.' + language,
        supportsTests: true,
        supportsStrictTypes: true,
        supportsAsyncAwait: true,
        defaultIndent: '  ',
        lineEnding: '\n',
        typeMapping,
        namingConventions: {
            modelName: (name) => toPascalCase(name),
            propertyName: (name) => toCamelCase(name),
            methodName: (name) => toCamelCase(name),
            fileName: (name) => toKebabCase(name),
            packageName: (name) => toKebabCase(name),
            ...namingConventions,
        },
        ...overrides,
    };
}
function toPascalCase(str) {
    return str
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
}
function toCamelCase(str) {
    return toPascalCase(str).replace(/^[A-Z]/, c => c.toLowerCase());
}
function toKebabCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-zA-Z0-9-]/g, '')
        .toLowerCase();
}
