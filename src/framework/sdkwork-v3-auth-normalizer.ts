import type { GeneratedFile, GeneratorConfig, Language } from './types.js';
import { usesSdkworkV3DualTokenOnly } from './sdkwork-v3-auth.js';

type FileNormalizer = (file: GeneratedFile) => GeneratedFile;

const CODE_BLOCK_RE = /```[\s\S]*?```/g;

const forbiddenAuthTerms = [
  'setApiKey',
  'set_api_key',
  'SetApiKey',
  'apiKey?:',
  'apiKeyHeader',
  'apiKeyAsBearer',
  'api_key ->',
  'API_KEY',
  'your-api-key',
  'Mode A: API Key',
  'Authentication Modes',
];

export function normalizeSdkworkV3AuthSurface(
  files: GeneratedFile[],
  config: Pick<GeneratorConfig, 'sdkType' | 'options'>,
): GeneratedFile[] {
  if (!usesSdkworkV3DualTokenOnly(config)) {
    return files;
  }

  return files.map((file) => normalizeFile(file, config));
}

function normalizeFile(
  file: GeneratedFile,
  config: Pick<GeneratorConfig, 'sdkType' | 'options'>,
): GeneratedFile {
  if (!isAuthSurfaceFile(file)) {
    return file;
  }

  const normalizedPath = file.path.replace(/\\/g, '/');
  const normalizer = resolveNormalizer(file.language, normalizedPath);
  if (!normalizer) {
    return file;
  }

  const normalizedFile = normalizer(file);
  assertNoApiKeyDebt(normalizedFile, config);
  return normalizedFile;
}

function isAuthSurfaceFile(file: GeneratedFile): boolean {
  const normalizedPath = file.path.replace(/\\/g, '/');
  if (
    normalizedPath.startsWith('.sdkwork/')
    || normalizedPath.startsWith('bin/')
    || normalizedPath.startsWith('custom/')
    || normalizedPath.startsWith('tests/')
    || normalizedPath === 'LICENSE'
    || normalizedPath === 'CHANGELOG.md'
  ) {
    return false;
  }
  return true;
}

function resolveNormalizer(language: Language, normalizedPath: string): FileNormalizer | undefined {
  if (normalizedPath === 'README.md') {
    return normalizeReadme;
  }

  switch (language) {
    case 'typescript':
      return resolveTypeScriptNormalizer(normalizedPath);
    case 'dart':
    case 'flutter':
      return resolveDartNormalizer(normalizedPath);
    case 'rust':
      return resolveRustNormalizer(normalizedPath);
    case 'java':
      return resolveJavaNormalizer(normalizedPath);
    case 'csharp':
      return resolveCsharpNormalizer(normalizedPath);
    case 'swift':
      return resolveSwiftNormalizer(normalizedPath);
    case 'kotlin':
      return resolveKotlinNormalizer(normalizedPath);
    case 'go':
      return resolveGoNormalizer(normalizedPath);
    case 'python':
      return resolvePythonNormalizer(normalizedPath);
    default:
      return undefined;
  }
}

function normalizeReadme(file: GeneratedFile): GeneratedFile {
  let content = removeAuthModesSection(file.content);
  content = replaceApiKeyQuickStartLine(content);
  content = content.replace(/client\.setApiKey\('your-api-key'\);\n\n?/g, '');
  content = content.replace(/client\.setApiKey\("your-api-key"\);\n\n?/g, '');
  content = content.replace(/client\.setApiKey\("your-api-key"\)\n\n?/g, '');
  content = content.replace(/client\.SetApiKey\("your-api-key"\)\n\n?/g, '');
  content = content.replace(/client\.SetApiKey\("your-api-key"\);\n\n?/g, '');
  content = content.replace(/client\.set_api_key\('your-api-key'\)\n\n?/g, '');
  content = content.replace(/client\.set_api_key\('your-api-key'\);\n\n?/g, '');
  content = content.replace(/client\.set_api_key\("your-api-key"\)\n\n?/g, '');
  content = content.replace(/client\.set_api_key\("your-api-key"\);\n\n?/g, '');
  content = content.replace(/client->setApiKey\('your-api-key'\);\n\n?/g, '');
  content = content.replace(
    /> Set `NUGET_API_KEY` for release \(or `NUGET_TEST_API_KEY` for test channel\)\./g,
    '> Configure NuGet registry credentials before release publish.',
  );
  content = content.replace(
    /> Set `GEM_HOST_API_KEY` \(or `RUBYGEMS_API_KEY`\) before `gem push`\./g,
    '> Configure RubyGems registry credentials before release publish.',
  );
  content = content.replace(
    /> Set `PYPI_TOKEN` for release \(or `TEST_PYPI_TOKEN` for test channel\)\./g,
    '> Configure Python package registry credentials before release publish.',
  );
  content = content.replace(
    /> Set `NPM_TOKEN` \(and optional `NPM_REGISTRY_URL`\) before release publish\./g,
    '> Configure npm registry credentials before release publish.',
  );
  content = content.replace(
    /Professional ([A-Za-z+#]+) SDK for SDKWork API\./g,
    'Generated SDKWork v3 dual-token transport SDK.',
  );
  content = content.replace(
    /Professional SDK for SDKWork API\./g,
    'Generated SDKWork v3 dual-token transport SDK.',
  );
  return {
    ...file,
    content,
  };
}

function removeAuthModesSection(content: string): string {
  const authSection = [
    '## Authentication',
    '',
    '```text',
    'Authorization: Bearer <authToken>',
    'Access-Token: <accessToken>',
    '```',
  ].join('\n');

  const replaced = content.replace(
    /## Authentication Modes \(Mutually Exclusive\)[\s\S]*?(?=\n## Configuration \(Non-Auth\)|\n## API Modules|\n## Usage Examples|\n## Error Handling|\n## Publishing|\n## License|\n## Regeneration Contract|$)/,
    `${authSection}\n\n`,
  );

  if (replaced.includes('## Authentication')) {
    return replaced;
  }

  return replaced.replace(
    /(\n## Configuration \(Non-Auth\))/,
    `\n${authSection}\n$1`,
  );
}

function replaceApiKeyQuickStartLine(content: string): string {
  return content
    .replace(
      /\/\/ Mode A: API Key \(recommended for server-to-server calls\)\nclient\.setApiKey\('your-api-key'\);\n/g,
      [
        '// Authentication',
        "client.setAuthToken('your-auth-token');",
        "client.setAccessToken('your-access-token');",
        '',
      ].join('\n'),
    )
    .replace(
      /client\.setApiKey\('your-api-key'\);\n/g,
      [
        "client.setAuthToken('your-auth-token');",
        "client.setAccessToken('your-access-token');",
        '',
      ].join('\n'),
    )
    .replace(
      /client\.setApiKey\("your-api-key"\);\n/g,
      [
        'client.setAuthToken("your-auth-token");',
        'client.setAccessToken("your-access-token");',
        '',
      ].join('\n'),
    )
    .replace(
      /client\.setApiKey\("your-api-key"\)\n/g,
      [
        'client.setAuthToken("your-auth-token")',
        'client.setAccessToken("your-access-token")',
        '',
      ].join('\n'),
    )
    .replace(
      /client\.SetApiKey\("your-api-key"\)\n/g,
      [
        'client.SetAuthToken("your-auth-token")',
        'client.SetAccessToken("your-access-token")',
        '',
      ].join('\n'),
    )
    .replace(
      /client\.SetApiKey\("your-api-key"\);\n/g,
      [
        'client.SetAuthToken("your-auth-token");',
        'client.SetAccessToken("your-access-token");',
        '',
      ].join('\n'),
    )
    .replace(
      /client\.set_api_key\("your-api-key"\);\n/g,
      [
        'client.set_auth_token("your-auth-token");',
        'client.set_access_token("your-access-token");',
        '',
      ].join('\n'),
    )
    .replace(
      /client\.set_api_key\("your-api-key"\)\n/g,
      [
        'client.set_auth_token("your-auth-token")',
        'client.set_access_token("your-access-token")',
        '',
      ].join('\n'),
    );
}

function resolveTypeScriptNormalizer(normalizedPath: string): FileNormalizer | undefined {
  if (normalizedPath === 'src/types/common.ts') {
    return normalizeTypeScriptCommonTypes;
  }
  if (normalizedPath === 'src/http/client.ts') {
    return normalizeTypeScriptHttpClient;
  }
  if (normalizedPath === 'src/sdk.ts') {
    return normalizeTypeScriptSdkClient;
  }
  return undefined;
}

function normalizeTypeScriptCommonTypes(file: GeneratedFile): GeneratedFile {
  return {
    ...file,
    content: file.content.replace(/\n\s+apiKey\?: string;/g, ''),
  };
}

function normalizeTypeScriptHttpClient(file: GeneratedFile): GeneratedFile {
  let content = file.content;
  content = content.replace(/\n\s+private static readonly API_KEY_HEADER: string = '[^']+';/g, '');
  content = content.replace(/\n\s+private static readonly API_KEY_USE_BEARER = (?:true|false);/g, '');
  content = content.replace(
    /\n\s+setApiKey\(apiKey: string\): void \{[\s\S]*?\n\s+}\n\n(?=\s+setAuthToken\()/,
    '\n',
  );
  content = content.replace(
    /\n\s+setAuthToken\(token: string\): void \{[\s\S]*?\n\s+}\n\n\s+setAccessToken/,
    [
      '',
      '  setAuthToken(token: string): void {',
      '    super.setAuthToken(token);',
      '  }',
      '',
      '  setAccessToken',
    ].join('\n'),
  );
  content = content.replace(
    /\n\s+setAccessToken\(token: string\): void \{[\s\S]*?\n\s+}\n\n\s+setTokenManager/,
    [
      '',
      '  setAccessToken(token: string): void {',
      '    const headers = this.getInternalHeaders();',
      "    headers[HttpClient.ACCESS_TOKEN_HEADER] = token;",
      '    super.setAccessToken(token);',
      '  }',
      '',
      '  setTokenManager',
    ].join('\n'),
  );
  return {
    ...file,
    content,
  };
}

function normalizeTypeScriptSdkClient(file: GeneratedFile): GeneratedFile {
  return {
    ...file,
    content: file.content.replace(
      /\n\s+setApiKey\(apiKey: string\): this \{[\s\S]*?\n\s+}\n\n(?=\s+setAuthToken\()/,
      '\n',
    ),
  };
}

function resolveDartNormalizer(normalizedPath: string): FileNormalizer | undefined {
  if (normalizedPath === 'lib/src/http/sdk_config.dart') {
    return normalizeDartSdkConfig;
  }
  if (normalizedPath === 'lib/src/http/client.dart') {
    return normalizeDartHttpClient;
  }
  if (/^lib\/[^/]+_client\.dart$/.test(normalizedPath)) {
    return normalizeDartSdkClient;
  }
  return undefined;
}

function normalizeDartSdkConfig(file: GeneratedFile): GeneratedFile {
  let content = file.content;
  content = content.replace(/\n\s+final String\? apiKey;/g, '');
  content = content.replace(/\n\s+final String apiKeyHeader;/g, '');
  content = content.replace(/\n\s+final bool apiKeyAsBearer;/g, '');
  content = content.replace(/\n\s+this\.apiKey,/g, '');
  content = content.replace(/\n\s+this\.apiKeyHeader = 'Authorization',/g, '');
  content = content.replace(/\n\s+this\.apiKeyAsBearer = true,/g, '');
  return {
    ...file,
    content,
  };
}

function normalizeDartHttpClient(file: GeneratedFile): GeneratedFile {
  let content = file.content;
  content = content.replace(/\n\s+_apiKey = config\.apiKey,/g, '');
  content = content.replace(/\n\s+_apiKeyHeader = config\.apiKeyHeader,/g, '');
  content = content.replace(/\n\s+_apiKeyAsBearer = config\.apiKeyAsBearer,/g, '');
  content = content.replace(/\n\s+String\? _apiKey;/g, '');
  content = content.replace(/\n\s+final String _apiKeyHeader;/g, '');
  content = content.replace(/\n\s+final bool _apiKeyAsBearer;/g, '');
  content = content.replace(/\n\s+void setApiKey\(String apiKey\) \{\n\s+_apiKey = apiKey;\n\s+}\n/g, '\n');
  content = content.replace(
    /\n\s+if \(_apiKey != null && _apiKey!\.isNotEmpty\) \{\n\s+merged\[_apiKeyHeader\] = _apiKeyAsBearer \? 'Bearer \$_apiKey' : _apiKey!;\n\s+}\n/g,
    '\n',
  );
  return {
    ...file,
    content,
  };
}

function normalizeDartSdkClient(file: GeneratedFile): GeneratedFile {
  let content = file.content;
  content = content.replace(/\n\s+String\? apiKey,/g, '');
  content = content.replace(/\n\s+String apiKeyHeader = '[^']+',/g, '');
  content = content.replace(/\n\s+bool apiKeyAsBearer = (?:true|false),/g, '');
  content = content.replace(/\n\s+apiKey: apiKey,/g, '');
  content = content.replace(/\n\s+apiKeyHeader: apiKeyHeader,/g, '');
  content = content.replace(/\n\s+apiKeyAsBearer: apiKeyAsBearer,/g, '');
  content = content.replace(/\n\s+void setApiKey\(String apiKey\) \{\n\s+_httpClient\.setApiKey\(apiKey\);\n\s+}\n/g, '\n');
  return {
    ...file,
    content,
  };
}

function resolveRustNormalizer(normalizedPath: string): FileNormalizer | undefined {
  if (normalizedPath === 'src/http/client.rs') {
    return normalizeRustHttpClient;
  }
  if (normalizedPath === 'src/client.rs') {
    return normalizeRustSdkClient;
  }
  return undefined;
}

function normalizeRustHttpClient(file: GeneratedFile): GeneratedFile {
  let content = file.content;
  content = content.replace(/\nconst DEFAULT_API_KEY_HEADER: &str = "[^"]+";/g, '');
  content = content.replace(/\nconst DEFAULT_API_KEY_USE_BEARER: bool = (?:true|false);/g, '');
  content = content.replace(
    /\n\s+pub fn set_api_key\(&self, api_key: impl Into<String>\) \{[\s\S]*?\n\s+}\n\n(?=\s+pub fn set_auth_token)/,
    '\n',
  );
  content = content.replace(
    /\n\s+pub fn set_auth_token\(&self, token: impl Into<String>\) \{[\s\S]*?\n\s+}\n\n\s+pub fn set_access_token/,
    [
      '',
      '    pub fn set_auth_token(&self, token: impl Into<String>) {',
      '        let mut headers = self.headers.write().expect("sdk headers poisoned");',
      '        headers.insert("Authorization".to_string(), format!("Bearer {}", token.into()));',
      '    }',
      '',
      '    pub fn set_access_token',
    ].join('\n'),
  );
  content = content.replace(
    /\n\s+pub fn set_access_token\(&self, token: impl Into<String>\) \{[\s\S]*?\n\s+}\n\n\s+pub fn set_header/,
    [
      '',
      '    pub fn set_access_token(&self, token: impl Into<String>) {',
      '        let mut headers = self.headers.write().expect("sdk headers poisoned");',
      '        headers.insert("Access-Token".to_string(), token.into());',
      '    }',
      '',
      '    pub fn set_header',
    ].join('\n'),
  );
  return {
    ...file,
    content,
  };
}

function normalizeRustSdkClient(file: GeneratedFile): GeneratedFile {
  return {
    ...file,
    content: file.content.replace(
      /\n\s+pub fn set_api_key\(&self, api_key: impl Into<String>\) -> &Self \{[\s\S]*?\n\s+}\n\n(?=\s+pub fn set_auth_token)/,
      '\n',
    ),
  };
}

function resolveJavaNormalizer(normalizedPath: string): FileNormalizer | undefined {
  if (normalizedPath.endsWith('/http/HttpClient.java')) {
    return normalizeJavaHttpClient;
  }
  if (
    /\/api\/[^/]+Api\.java$/.test(normalizedPath)
    || /\/models?\/[^/]+\.java$/.test(normalizedPath)
    || /\/types?\/[^/]+\.java$/.test(normalizedPath)
  ) {
    return undefined;
  }
  if (/\/[^/]*Client\.java$/.test(normalizedPath)) {
    return normalizeJavaSdkClient;
  }
  return undefined;
}

function normalizeJavaHttpClient(file: GeneratedFile): GeneratedFile {
  let content = file.content;
  content = content.replace(/\n\s+private static final String API_KEY_HEADER = "[^"]+";/g, '');
  content = content.replace(/\n\s+private static final boolean API_KEY_USE_BEARER = (?:true|false);/g, '');
  content = content.replace(
    /\n\s+public void setApiKey\(String apiKey\) \{[\s\S]*?\n\s+}\n\n(?=\s+public void setAuthToken)/,
    '\n',
  );
  content = content.replace(
    /\n\s+public void setAuthToken\(String token\) \{[\s\S]*?\n\s+}\n\n\s+public void setAccessToken/,
    [
      '',
      '    public void setAuthToken(String token) {',
      '        headers.put("Authorization", "Bearer " + token);',
      '    }',
      '',
      '    public void setAccessToken',
    ].join('\n'),
  );
  content = content.replace(
    /\n\s+public void setAccessToken\(String token\) \{[\s\S]*?\n\s+}\n\n\s+public void setHeader/,
    [
      '',
      '    public void setAccessToken(String token) {',
      '        headers.put("Access-Token", token);',
      '    }',
      '',
      '    public void setHeader',
    ].join('\n'),
  );
  return {
    ...file,
    content,
  };
}

function normalizeJavaSdkClient(file: GeneratedFile): GeneratedFile {
  return {
    ...file,
    content: file.content.replace(
      /\n\s+public [A-Za-z_][A-Za-z0-9_]* setApiKey\(String apiKey\) \{[\s\S]*?\n\s+}\n\n(?=\s+public [A-Za-z_][A-Za-z0-9_]* setAuthToken)/,
      '\n',
    ),
  };
}

function resolveKotlinNormalizer(normalizedPath: string): FileNormalizer | undefined {
  if (normalizedPath.endsWith('/http/HttpClient.kt')) {
    return normalizeKotlinHttpClient;
  }
  if (/\/[^/]*Client\.kt$/.test(normalizedPath)) {
    return normalizeKotlinSdkClient;
  }
  return undefined;
}

function normalizeKotlinHttpClient(file: GeneratedFile): GeneratedFile {
  let content = file.content;
  content = content.replace(
    /\n\s+companion object \{\n\s+private const val API_KEY_HEADER = "[^"]+"\n\s+private const val API_KEY_USE_BEARER = (?:true|false)\n\s+}\n/g,
    '\n',
  );
  content = content.replace(
    /\n\s+fun setApiKey\(apiKey: String\) \{[\s\S]*?\n\s+}\n\n(?=\s+fun setAuthToken)/,
    '\n',
  );
  content = content.replace(
    /\n\s+fun setAuthToken\(token: String\) \{[\s\S]*?\n\s+}\n\n\s+fun setAccessToken/,
    [
      '',
      '    fun setAuthToken(token: String) {',
      '        headers["Authorization"] = "Bearer $token"',
      '    }',
      '',
      '    fun setAccessToken',
    ].join('\n'),
  );
  content = content.replace(
    /\n\s+fun setAccessToken\(token: String\) \{[\s\S]*?\n\s+}\n\n\s+fun setHeader/,
    [
      '',
      '    fun setAccessToken(token: String) {',
      '        headers["Access-Token"] = token',
      '    }',
      '',
      '    fun setHeader',
    ].join('\n'),
  );
  return {
    ...file,
    content,
  };
}

function normalizeKotlinSdkClient(file: GeneratedFile): GeneratedFile {
  return {
    ...file,
    content: file.content.replace(
      /\n\s+fun setApiKey\(apiKey: String\): [A-Za-z_][A-Za-z0-9_]* \{[\s\S]*?\n\s+}\n\n(?=\s+fun setAuthToken)/,
      '\n',
    ),
  };
}

function resolveSwiftNormalizer(normalizedPath: string): FileNormalizer | undefined {
  if (normalizedPath === 'Sources/HTTP/HttpClient.swift') {
    return normalizeSwiftHttpClient;
  }
  if (/^Sources\/[^/]+\.swift$/.test(normalizedPath)) {
    return normalizeSwiftSdkClient;
  }
  return undefined;
}

function normalizeSwiftHttpClient(file: GeneratedFile): GeneratedFile {
  let content = file.content;
  content = content.replace(/\n\s+private static let apiKeyHeader = "[^"]+"/g, '');
  content = content.replace(/\n\s+private static let apiKeyUseBearer = (?:true|false)/g, '');
  content = content.replace(
    /\n\s+public func setApiKey\(_ apiKey: String\) \{[\s\S]*?\n\s+}\n\n(?=\s+public func setAuthToken)/,
    '\n',
  );
  content = content.replace(
    /\n\s+public func setAuthToken\(_ token: String\) \{[\s\S]*?\n\s+}\n\n\s+public func setAccessToken/,
    [
      '',
      '    public func setAuthToken(_ token: String) {',
      '        headers["Authorization"] = "Bearer \\(token)"',
      '    }',
      '',
      '    public func setAccessToken',
    ].join('\n'),
  );
  content = content.replace(
    /\n\s+public func setAccessToken\(_ token: String\) \{[\s\S]*?\n\s+}\n\n\s+public func setHeader/,
    [
      '',
      '    public func setAccessToken(_ token: String) {',
      '        headers["Access-Token"] = token',
      '    }',
      '',
      '    public func setHeader',
    ].join('\n'),
  );
  return {
    ...file,
    content,
  };
}

function normalizeSwiftSdkClient(file: GeneratedFile): GeneratedFile {
  return {
    ...file,
    content: file.content.replace(
      /\n\s+public func setApiKey\(_ apiKey: String\) -> [A-Za-z_][A-Za-z0-9_]* \{[\s\S]*?\n\s+}\n\n(?=\s+public func setAuthToken)/,
      '\n',
    ),
  };
}

function resolveCsharpNormalizer(normalizedPath: string): FileNormalizer | undefined {
  if (normalizedPath.endsWith('/Http/HttpClient.cs') || normalizedPath === 'Http/HttpClient.cs') {
    return normalizeCsharpHttpClient;
  }
  if (/^(?:[^/]+\.cs)$/.test(normalizedPath)) {
    return normalizeCsharpSdkClient;
  }
  return undefined;
}

function normalizeCsharpHttpClient(file: GeneratedFile): GeneratedFile {
  let content = file.content;
  content = content.replace(/\n\s+private const string ApiKeyHeader = "[^"]+";/g, '');
  content = content.replace(/\n\s+private static readonly bool ApiKeyUseBearer = (?:true|false);/g, '');
  content = content.replace(
    /\n\s+public void SetApiKey\(string apiKey\)\n\s+\{[\s\S]*?\n\s+}\n\n(?=\s+public void SetAuthToken)/,
    '\n',
  );
  content = content.replace(
    /\n\s+public void SetAuthToken\(string token\)\n\s+\{[\s\S]*?\n\s+}\n\n\s+public void SetAccessToken/,
    [
      '',
      '        public void SetAuthToken(string token)',
      '        {',
      '            _client.DefaultRequestHeaders.Authorization =',
      '                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);',
      '        }',
      '',
      '        public void SetAccessToken',
    ].join('\n'),
  );
  content = content.replace(
    /\n\s+public void SetAccessToken\(string token\)\n\s+\{[\s\S]*?\n\s+}\n\n\s+public void SetHeader/,
    [
      '',
      '        public void SetAccessToken(string token)',
      '        {',
      '            if (_client.DefaultRequestHeaders.Contains("Access-Token"))',
      '            {',
      '                _client.DefaultRequestHeaders.Remove("Access-Token");',
      '            }',
      '            _client.DefaultRequestHeaders.TryAddWithoutValidation("Access-Token", token);',
      '        }',
      '',
      '        public void SetHeader',
    ].join('\n'),
  );
  return {
    ...file,
    content,
  };
}

function normalizeCsharpSdkClient(file: GeneratedFile): GeneratedFile {
  return {
    ...file,
    content: file.content.replace(
      /\n\s+public [A-Za-z_][A-Za-z0-9_]* SetApiKey\(string apiKey\)\n\s+\{[\s\S]*?\n\s+}\n\n(?=\s+public [A-Za-z_][A-Za-z0-9_]* SetAuthToken)/,
      '\n',
    ),
  };
}

function resolveGoNormalizer(normalizedPath: string): FileNormalizer | undefined {
  if (normalizedPath === 'http/client.go') {
    return normalizeGoHttpClient;
  }
  if (normalizedPath === 'sdk.go') {
    return normalizeGoSdkClient;
  }
  return undefined;
}

function normalizeGoHttpClient(file: GeneratedFile): GeneratedFile {
  let content = file.content;
  content = content.replace(
    /\nconst \(\n\s+defaultApiKeyHeader = "[^"]+"\n\s+defaultApiKeyUseBearer = (?:true|false)\n\)\n/g,
    '\n',
  );
  content = content.replace(/\n\s+ApiKey\s+string/g, '');
  content = content.replace(
    /\n\s+if config\.ApiKey != "" \{\n\s+client\.SetApiKey\(config\.ApiKey\)\n\s+}/g,
    '',
  );
  content = content.replace(
    /\nfunc \(c \*Client\) SetApiKey\(apiKey string\) \{[\s\S]*?\n}\n\n(?=func \(c \*Client\) SetAuthToken)/,
    '\n',
  );
  content = content.replace(
    /\nfunc \(c \*Client\) SetAuthToken\(token string\) \{[\s\S]*?\n}\n\nfunc \(c \*Client\) SetAccessToken/,
    [
      '',
      'func (c *Client) SetAuthToken(token string) {',
      '    c.headers["Authorization"] = "Bearer " + token',
      '}',
      '',
      'func (c *Client) SetAccessToken',
    ].join('\n'),
  );
  content = content.replace(
    /\nfunc \(c \*Client\) SetAccessToken\(token string\) \{[\s\S]*?\n}\n\nfunc \(c \*Client\) SetHeader/,
    [
      '',
      'func (c *Client) SetAccessToken(token string) {',
      '    c.headers["Access-Token"] = token',
      '}',
      '',
      'func (c *Client) SetHeader',
    ].join('\n'),
  );
  return {
    ...file,
    content,
  };
}

function normalizeGoSdkClient(file: GeneratedFile): GeneratedFile {
  return {
    ...file,
    content: file.content.replace(
      /\nfunc \(c \*[A-Za-z_][A-Za-z0-9_]*\) SetApiKey\(apiKey string\) \*[A-Za-z_][A-Za-z0-9_]* \{[\s\S]*?\n}\n\n(?=func \(c \*[A-Za-z_][A-Za-z0-9_]*\) SetAuthToken)/,
      '\n',
    ),
  };
}

function resolvePythonNormalizer(normalizedPath: string): FileNormalizer | undefined {
  if (normalizedPath.endsWith('/http_client.py')) {
    return normalizePythonHttpClient;
  }
  if (normalizedPath.endsWith('/client.py')) {
    return normalizePythonSdkClient;
  }
  return undefined;
}

function normalizePythonHttpClient(file: GeneratedFile): GeneratedFile {
  let content = file.content;
  content = content.replace(/\nAPI_KEY_HEADER = '[^']+'/g, '');
  content = content.replace(/\nAPI_KEY_USE_BEARER = (?:True|False)/g, '');
  content = content.replace(
    /    Auth headers:\n    - api_key -> Authorization: Bearer \{api_key\}\n    - auth_token -> Authorization: Bearer \{auth_token\}\n    - access_token -> Access-Token: \{access_token\}/,
    [
      '    Auth headers:',
      '    - auth_token -> Authorization: Bearer {auth_token}',
      '    - access_token -> Access-Token: {access_token}',
    ].join('\n'),
  );
  content = content.replace(
    /\n\s+if self\._api_key:\n\s+self\._session\.headers\[API_KEY_HEADER\] = f'Bearer \{self\._api_key\}' if API_KEY_USE_BEARER else self\._api_key/g,
    '',
  );
  content = content.replace(
    /\n\s+def set_api_key\(self, api_key: str\) -> 'HttpClient':[\s\S]*?\n\s+return self\n\n(?=\s+def set_auth_token)/,
    '\n',
  );
  content = content.replace(
    /\n\s+def set_auth_token\(self, token: str\) -> 'HttpClient':[\s\S]*?\n\s+return self\n\n\s+def set_access_token/,
    [
      '',
      "    def set_auth_token(self, token: str) -> 'HttpClient':",
      '        self._auth_token = token',
      '        self._update_auth_headers()',
      '        return self',
      '',
      '    def set_access_token',
    ].join('\n'),
  );
  content = content.replace(
    /\n\s+def set_access_token\(self, token: str\) -> 'HttpClient':[\s\S]*?\n\s+return self\n\n\s+def set_header/,
    [
      '',
      "    def set_access_token(self, token: str) -> 'HttpClient':",
      '        self._access_token = token',
      '        self._update_auth_headers()',
      '        return self',
      '',
      '    def set_header',
    ].join('\n'),
  );
  return {
    ...file,
    content,
  };
}

function normalizePythonSdkClient(file: GeneratedFile): GeneratedFile {
  return {
    ...file,
    content: file.content.replace(
      /\n\s+def set_api_key\(self, api_key: str\) -> '[A-Za-z_][A-Za-z0-9_]*':[\s\S]*?\n\s+return self\n\n(?=\s+def set_auth_token)/,
      '\n',
    ),
  };
}

function assertNoApiKeyDebt(
  file: GeneratedFile,
  _config: Pick<GeneratorConfig, 'sdkType' | 'options'>,
): void {
  const normalizedPath = file.path.replace(/\\/g, '/');
  const searchable = normalizedPath === 'README.md'
    ? file.content
    : file.content.replace(CODE_BLOCK_RE, '');

  const match = forbiddenAuthTerms.find((term) => searchable.includes(term));
  if (!match) {
    return;
  }

  throw new Error(
    `sdkwork-v3 dual-token auth normalizer left API key auth debt "${match}" in ${normalizedPath}.`,
  );
}
