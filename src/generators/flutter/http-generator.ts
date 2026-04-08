import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSimplifiedTagNames } from '../../framework/naming.js';
import { resolveFlutterCommonPackage } from '../../framework/common-package.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { FLUTTER_CONFIG } from './config.js';

export class HttpClientGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const clientName = resolveSdkClientName(config);
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
    const apiKeyHeader = (ctx.auth.apiKeyHeader || 'Authorization').replace(/'/g, "\\'");
    const apiKeyAsBearer = ctx.auth.apiKeyAsBearer;
    const commonPkg = resolveFlutterCommonPackage(config);

    return [
      this.generateHttpClient(config, commonPkg.importPath),
      this.generateSdkClient(clientName, tags, resolvedTagNames, config, apiKeyHeader, apiKeyAsBearer, commonPkg.importPath),
      this.generatePackageEntry(config),
    ];
  }

  private generateHttpClient(config: GeneratorConfig, commonImportPath: string): GeneratedFile {
    return {
      path: 'lib/src/http/client.dart',
      content: this.format(`import '${commonImportPath}';

class HttpClient extends BaseHttpClient {
  HttpClient({
    required SdkConfig config,
  }) : super(config);
}
`),
      language: 'flutter',
      description: 'HTTP client wrapper based on sdkwork-common-flutter',
    };
  }

  private generateSdkClient(
    clientName: string,
    tags: string[],
    resolvedTagNames: Map<string, string>,
    config: GeneratorConfig,
    apiKeyHeader: string,
    apiKeyAsBearer: boolean,
    commonImportPath: string,
  ): GeneratedFile {
    const imports = tags.map(tag => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const fileName = FLUTTER_CONFIG.namingConventions.fileName(resolvedTagName);
      return `import 'src/api/${fileName}.dart';`;
    }).join('\n');

    const modules = tags.map(tag => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const propName = FLUTTER_CONFIG.namingConventions.propertyName(resolvedTagName);
      const className = `${FLUTTER_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
      return `  late final ${className} ${propName};`;
    }).join('\n');

    const inits = tags.map(tag => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const propName = FLUTTER_CONFIG.namingConventions.propertyName(resolvedTagName);
      const className = `${FLUTTER_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
      return `    ${propName} = ${className}(_httpClient);`;
    }).join('\n');

    return {
      path: `lib/${FLUTTER_CONFIG.namingConventions.fileName(config.sdkType)}_client.dart`,
      content: this.format(`import '${commonImportPath}';
import 'src/http/client.dart';
${imports}

class ${clientName} {
  final HttpClient _httpClient;

${modules}

  ${clientName}({
    required SdkConfig config,
  }) : _httpClient = HttpClient(config: config) {
${inits}
  }

  factory ${clientName}.withBaseUrl({
    required String baseUrl,
    String? apiKey,
    String? authToken,
    String? accessToken,
    String apiKeyHeader = '${apiKeyHeader}',
    bool apiKeyAsBearer = ${apiKeyAsBearer ? 'true' : 'false'},
    Map<String, String>? headers,
    int timeout = 30000,
  }) {
    return ${clientName}(
      config: SdkConfig(
        baseUrl: baseUrl,
        timeout: timeout,
        headers: headers ?? const {},
        apiKey: apiKey,
        apiKeyHeader: apiKeyHeader,
        apiKeyAsBearer: apiKeyAsBearer,
        authToken: authToken,
        accessToken: accessToken,
      ),
    );
  }

  void setApiKey(String apiKey) {
    _httpClient.setApiKey(apiKey);
  }

  void setAuthToken(String token) {
    _httpClient.setAuthToken(token);
  }

  void setAccessToken(String token) {
    _httpClient.setAccessToken(token);
  }

  void setHeader(String key, String value) {
    _httpClient.setHeader(key, value);
  }
}
`),
      language: 'flutter',
      description: 'Main SDK class',
    };
  }

  private generatePackageEntry(config: GeneratorConfig): GeneratedFile {
    const packageName = `${FLUTTER_CONFIG.namingConventions.packageName(config.sdkType)}_sdk`;
    const clientFile = `${FLUTTER_CONFIG.namingConventions.fileName(config.sdkType)}_client.dart`;

    return {
      path: `lib/${packageName}.dart`,
      content: this.format(`export '${clientFile}';
export 'src/models.dart';
export 'src/api/api.dart';
`),
      language: 'flutter',
      description: 'Package entrypoint exports',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
