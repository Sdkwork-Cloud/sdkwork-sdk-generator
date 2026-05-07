import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSimplifiedTagNames } from '../../framework/naming.js';
import { resolveFlutterCommonPackage } from '../../framework/common-package.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { FLUTTER_CONFIG, getFlutterPackageName } from './config.js';

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
      content: this.format(`import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import '${commonImportPath}';

class HttpClient extends BaseHttpClient {
  final http.Client _rawClient = http.Client();

  HttpClient({
    required SdkConfig config,
  }) : super(config);

  @override
  Future<dynamic> request(
    String method,
    String path, {
    Map<String, dynamic>? params,
    dynamic body,
    Map<String, String>? requestHeaders,
    String? contentType,
  }) async {
    final uri = _buildUri(path, params);
    final mergedHeaders = <String, String>{
      ...headers,
      ...?requestHeaders,
    };

    if (body != null && _normalizeContentType(contentType).toLowerCase().startsWith('multipart/form-data')) {
      final response = await _sendMultipart(method, uri, body, mergedHeaders)
          .timeout(Duration(milliseconds: timeout));
      return _parseResponse(response);
    } else {
      final request = http.Request(method, uri)
        ..headers.addAll(_buildHeaders(mergedHeaders, contentType, body));
      final encodedBody = _encodeBody(body, contentType);
      if (encodedBody != null) {
        if (encodedBody is List<int>) {
          request.bodyBytes = encodedBody;
        } else {
          request.body = encodedBody.toString();
        }
      }
      final streamed = await _rawClient
          .send(request)
          .timeout(Duration(milliseconds: timeout));
      final response = await http.Response.fromStream(streamed);
      return _parseResponse(response);
    }
  }

  Uri _buildUri(String path, [Map<String, dynamic>? params]) {
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    var url = Uri.parse('$baseUrl$normalizedPath');
    if (params != null && params.isNotEmpty) {
      url = url.replace(
        queryParameters: params.map((k, v) => MapEntry(k, v?.toString())),
      );
    }
    return url;
  }

  dynamic _parseResponse(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('HTTP \${response.statusCode}: \${response.body}');
    }

    if (response.body.isEmpty) {
      return null;
    }

    final contentType = response.headers['content-type'] ?? '';
    if (contentType.contains('application/json')) {
      return jsonDecode(response.body);
    }
    return response.body;
  }

  String _normalizeContentType(String? contentType) {
    if (contentType == null || contentType.trim().isEmpty) {
      return 'application/json';
    }
    return contentType.trim();
  }

  Map<String, String> _buildHeaders(
    Map<String, String> mergedHeaders,
    String? contentType,
    dynamic body,
  ) {
    if (body == null) {
      return mergedHeaders;
    }

    final normalized = _normalizeContentType(contentType).toLowerCase();
    if (normalized.startsWith('multipart/form-data')) {
      final copied = Map<String, String>.from(mergedHeaders);
      copied.remove('Content-Type');
      return copied;
    }

    return {
      ...mergedHeaders,
      'Content-Type': _normalizeContentType(contentType),
    };
  }

  dynamic _encodeBody(dynamic body, String? contentType) {
    if (body == null) {
      return null;
    }

    final normalized = _normalizeContentType(contentType).toLowerCase();
    if (normalized.startsWith('application/x-www-form-urlencoded')) {
      final entries = _toFormEntries(body);
      return entries
          .map(
            (entry) =>
                '\${Uri.encodeQueryComponent(entry.key)}=\${Uri.encodeQueryComponent(entry.value)}',
          )
          .join('&');
    }

    if (normalized.contains('json')) {
      return jsonEncode(body);
    }

    if (body is String || body is List<int>) {
      return body;
    }
    return body.toString();
  }

  List<MapEntry<String, String>> _toFormEntries(dynamic body) {
    final result = <MapEntry<String, String>>[];
    void addValue(String key, dynamic value) {
      if (value == null) {
        result.add(MapEntry(key, ''));
        return;
      }
      if (value is Iterable && value is! String && value is! List<int>) {
        for (final item in value) {
          addValue(key, item);
        }
        return;
      }
      result.add(MapEntry(key, value.toString()));
    }

    if (body is Map) {
      body.forEach((key, value) {
        if (key == null) {
          return;
        }
        addValue(key.toString(), value);
      });
    } else {
      addValue('value', body);
    }

    return result;
  }

  Future<http.Response> _sendMultipart(
    String method,
    Uri uri,
    dynamic body,
    Map<String, String> mergedHeaders,
  ) async {
    final request = http.MultipartRequest(method, uri);
    request.headers.addAll(_buildHeaders(mergedHeaders, 'multipart/form-data', body));

    void addField(String key, dynamic value) {
      if (value == null) {
        request.fields[key] = '';
        return;
      }
      if (value is Iterable && value is! String && value is! List<int>) {
        for (final item in value) {
          addField(key, item);
        }
        return;
      }
      if (value is http.MultipartFile) {
        request.files.add(value);
        return;
      }
      if (value is Uint8List || value is List<int>) {
        request.files.add(http.MultipartFile.fromBytes(key, List<int>.from(value as List<int>), filename: key));
        return;
      }
      request.fields[key] = value.toString();
    }

    if (body is Map) {
      body.forEach((key, value) {
        if (key == null) {
          return;
        }
        addField(key.toString(), value);
      });
    } else if (body != null) {
      addField('value', body);
    }

    final streamed = await _rawClient
        .send(request)
        .timeout(Duration(milliseconds: timeout));
    return http.Response.fromStream(streamed);
  }
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
    const packageName = getFlutterPackageName(config);
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
