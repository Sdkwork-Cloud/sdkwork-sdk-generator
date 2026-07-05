export type Language =
  | 'typescript'
  | 'dart'
  | 'python'
  | 'java'
  | 'csharp'
  | 'go'
  | 'rust'
  | 'swift'
  | 'flutter'
  | 'kotlin'
  | 'php'
  | 'ruby';

export type SdkType = 'app' | 'backend' | 'im' | 'ai' | 'custom';
export type SdkProtocol = 'http' | 'rpc';

export type RpcSurface = 'app' | 'backend' | 'internal' | 'common';
export type RpcStreamingMode = 'unary' | 'server' | 'client' | 'bidi';
export type RpcIdempotencyMode = 'none' | 'optional' | 'required';

export interface RpcServiceManifest {
  schemaVersion: 1;
  kind: 'sdkwork.rpc.manifest';
  domain: string;
  sdkFamily: string;
  services: RpcServiceDefinition[];
}

export interface RpcServiceDefinition {
  package: string;
  service: string;
  surface: RpcSurface;
  methods: RpcMethodDefinition[];
}

export interface RpcMethodDefinition {
  method: string;
  operationId: string;
  auth: string;
  idempotency: RpcIdempotencyMode;
  streaming: RpcStreamingMode;
  owner: string;
  compatibility: string;
}

export interface RpcInputSpec {
  manifestPath: string;
  protoRoot: string;
  protoFiles: string[];
  importRoots: string[];
  manifest: RpcServiceManifest;
}

export interface GeneratorConfig {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  language: Language;
  sdkType: SdkType;
  protocol?: SdkProtocol;
  outputPath: string;
  apiSpecPath: string;
  baseUrl: string;
  apiPrefix: string;
  packageName?: string;
  namespace?: string;
  commonPackage?: string;
  clientName?: string;
  legacyClientName?: string;
  generateReadme?: boolean;
  generateTests?: boolean;
  rpc?: RpcInputSpec;
  options?: GeneratorOptions;
}

export interface GeneratorOptions {
  standardProfile?: 'sdkwork-v3';
  useBigInt?: boolean;
  useDateType?: boolean;
  generateClient?: boolean;
  generateModels?: boolean;
  generateApis?: boolean;
  generateAuth?: boolean;
  useProxy?: boolean;
  proxyUrl?: string;
  customHeaders?: Record<string, string>;
  timeout?: number;
  retryConfig?: RetryConfig;
}

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  retryBackoff: 'linear' | 'exponential';
}

export interface ApiSpec {
  openapi: string;
  info: ApiInfo;
  servers?: ApiServer[];
  paths: Record<string, ApiPathItem>;
  components?: ApiComponents;
  tags?: ApiTag[];
}

export interface ApiPathItem {
  summary?: string;
  description?: string;
  parameters?: ApiParameterOrRef[];
  get?: ApiOperation;
  put?: ApiOperation;
  post?: ApiOperation;
  delete?: ApiOperation;
  options?: ApiOperation;
  head?: ApiOperation;
  patch?: ApiOperation;
  trace?: ApiOperation;
  query?: ApiOperation;
  additionalOperations?: Record<string, ApiOperation>;
  [key: string]: unknown;
}

export interface ApiInfo {
  title: string;
  version: string;
  description?: string;
}

export interface ApiServer {
  url: string;
  description?: string;
}

export interface ApiOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: ApiParameterOrRef[];
  requestBody?: ApiRequestBodyOrRef;
  responses: Record<string, ApiResponse>;
  deprecated?: boolean;
  security?: Array<Record<string, string[]>>;
  'x-sdkwork-auth-mode'?: 'anonymous' | 'dual-token' | 'refresh-token' | 'api-key' | 'internal' | string;
  'x-sdkwork-forbid-credential-headers'?: boolean;
}

export interface ApiParameter {
  name: string;
  in: 'query' | 'querystring' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  allowEmptyValue?: boolean;
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
  schema: ApiSchema;
  content?: Record<string, unknown>;
  example?: unknown;
  examples?: Record<string, unknown>;
}

export interface ApiReference {
  $ref: string;
}

export type ApiParameterOrRef = ApiParameter | ApiReference;

export interface ApiRequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, ApiMediaType>;
}

export type ApiRequestBodyOrRef = ApiRequestBody | ApiReference;

export interface ApiResponse {
  description?: string;
  content?: Record<string, ApiMediaType>;
  headers?: Record<string, unknown>;
}

export interface ApiMediaType {
  schema?: ApiSchema;
  itemSchema?: ApiSchema;
  example?: unknown;
  examples?: Record<string, unknown>;
  encoding?: Record<string, unknown>;
}

export interface ApiResponseOrRef extends ApiResponse {
  $ref?: string;
}

export interface ApiSchema {
  type?: string | string[];
  format?: string;
  description?: string;
  enum?: (string | number | boolean | null)[];
  const?: string | number | boolean | null;
  nullable?: boolean;
  properties?: Record<string, ApiSchema>;
  required?: string[];
  items?: ApiSchema | boolean;
  prefixItems?: ApiSchema[];
  minItems?: number;
  maxItems?: number;
  allOf?: ApiSchema[];
  oneOf?: ApiSchema[];
  anyOf?: ApiSchema[];
  not?: ApiSchema;
  additionalProperties?: ApiSchema | boolean;
  default?: unknown;
  example?: unknown;
  $ref?: string;
}

export interface ApiComponents {
  schemas?: Record<string, ApiSchema>;
  parameters?: Record<string, ApiParameter>;
  requestBodies?: Record<string, ApiRequestBody>;
  responses?: Record<string, ApiResponse>;
  securitySchemes?: Record<string, ApiSecurityScheme>;
}

export interface ApiSecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2';
  description?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  scheme?: string;
}

export interface ApiTag {
  name: string;
  description?: string;
  [key: string]: unknown;
}

export interface GeneratedFile {
  path: string;
  content: string;
  language: Language;
  description?: string;
  ownership?: GeneratedFileOwnership;
  overwriteStrategy?: GeneratedFileOverwriteStrategy;
}

export type GeneratedFileOwnership = 'generated' | 'scaffold';

export type GeneratedFileOverwriteStrategy = 'always' | 'if-missing';

export interface LanguageCapability {
  language: Language;
  supportsGeneratedTests: boolean;
  supportsReadme: boolean;
  supportsCustomScaffold: boolean;
  supportsPublishWorkflow: boolean;
  hasDistinctBuildStep: boolean;
}

export interface SdkMetadataCapabilities {
  supportsGeneratedTests: boolean;
  supportsReadme: boolean;
  supportsCustomScaffold: boolean;
  supportsPublishWorkflow: boolean;
  hasDistinctBuildStep: boolean;
}

export interface SdkMetadataGeneration {
  readme: boolean;
  tests: boolean;
}

export interface SdkMetadataOwnership {
  generatedOwnership: GeneratedFileOwnership;
  scaffoldOwnership: GeneratedFileOwnership;
  scaffoldRoots: string[];
  stateRoots: string[];
}

export interface SdkMetadataManifest {
  schemaVersion: 1;
  name: string;
  version: string;
  language: Language;
  sdkType: SdkType;
  /** @deprecated Use transportPackageName. Kept for generator idempotency readers. */
  packageName: string | null;
  transportPackageName: string;
  consumerPackageName: string;
  generator: string;
  capabilities: SdkMetadataCapabilities;
  generation: SdkMetadataGeneration;
  ownership: SdkMetadataOwnership;
}

export interface GeneratorResult {
  files: GeneratedFile[];
  errors: GeneratorError[];
  warnings: string[];
  stats: GeneratorStats;
}

export interface GeneratorError {
  file?: string;
  message: string;
  code: string;
}

export interface GeneratorStats {
  totalFiles: number;
  models: number;
  apis: number;
  types: number;
}

export interface SchemaContext {
  schemas: Record<string, ApiSchema>;
  schemaFileMap: Map<string, string>;
  apiGroups: Record<string, ApiOperationGroup>;
  auth: AuthContext;
}

export interface AuthContext {
  hasApiKeyScheme: boolean;
  hasBearerScheme: boolean;
  hasSecurityRequirements: boolean;
  apiKeySchemeName?: string;
  apiKeyIn?: 'header' | 'query' | 'cookie';
  apiKeyHeader?: string;
  apiKeyAsBearer: boolean;
}

export interface ApiOperationGroup {
  tag: string;
  domain: string;
  displayName: string;
  sourceTags: string[];
  operations: GeneratedApiOperation[];
}

export interface GeneratedApiOperation extends ApiOperation {
  path: string;
  method: string;
  httpMethod?: string;
  allParameters?: ApiParameter[];
  requestBody?: ApiRequestBody;
  responses: Record<string, ApiResponse>;
}

export interface GeneratorHooks {
  onGenerateStart?: (config: GeneratorConfig, spec: ApiSpec) => void | Promise<void>;
  onGenerateEnd?: (result: GeneratorResult) => void | Promise<void>;
  onFileGenerated?: (file: GeneratedFile) => void | Promise<void>;
  onError?: (error: Error) => void;
}

export interface TypeMapping {
  string: string;
  number: string;
  integer: string;
  boolean: string;
  array: string;
  object: string;
  date: string;
  datetime: string;
  uuid: string;
  email: string;
  url: string;
}

export interface NamingConventions {
  modelName: (name: string) => string;
  propertyName: (name: string) => string;
  methodName: (name: string) => string;
  fileName: (name: string) => string;
  packageName: (name: string) => string;
}

export interface CodeTemplate {
  name: string;
  template: string;
  placeholders?: Record<string, string>;
}

export interface LanguageConfig {
  readonly language: Language;
  readonly displayName: string;
  readonly description: string;
  readonly fileExtension: string;
  readonly supportsTests: boolean;
  readonly supportsStrictTypes: boolean;
  readonly supportsAsyncAwait: boolean;
  readonly defaultIndent: string;
  readonly lineEnding: '\n' | '\r\n';
  readonly typeMapping: TypeMapping;
  readonly namingConventions: NamingConventions;
  readonly httpClientLibrary?: string;
  readonly authStyles?: string[];
}
