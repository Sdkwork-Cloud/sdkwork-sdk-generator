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

export type SdkType = 'app' | 'backend' | 'ai' | 'custom';

export interface GeneratorConfig {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  language: Language;
  sdkType: SdkType;
  outputPath: string;
  apiSpecPath: string;
  baseUrl: string;
  apiPrefix: string;
  packageName?: string;
  namespace?: string;
  commonPackage?: string;
  generateReadme?: boolean;
  generateTests?: boolean;
  options?: GeneratorOptions;
}

export interface GeneratorOptions {
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
}

export interface ApiParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema: ApiSchema;
}

export interface ApiReference {
  $ref: string;
}

export type ApiParameterOrRef = ApiParameter | ApiReference;

export interface ApiRequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, { schema: ApiSchema }>;
}

export type ApiRequestBodyOrRef = ApiRequestBody | ApiReference;

export interface ApiResponse {
  description?: string;
  content?: Record<string, { schema: ApiSchema }>;
  headers?: Record<string, unknown>;
}

export interface ApiResponseOrRef extends ApiResponse {
  $ref?: string;
}

export interface ApiSchema {
  type?: string;
  format?: string;
  description?: string;
  enum?: (string | number)[];
  nullable?: boolean;
  properties?: Record<string, ApiSchema>;
  items?: ApiSchema;
  allOf?: ApiSchema[];
  oneOf?: ApiSchema[];
  anyOf?: ApiSchema[];
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
