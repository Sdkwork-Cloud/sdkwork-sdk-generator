import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSdkTagNames } from '../../framework/openai-surface.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { DART_CONFIG, getDartPackageName } from './config.js';

export class HttpClientGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const clientName = resolveSdkClientName(config);
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSdkTagNames(tags, config);
    const apiKeyHeader = (ctx.auth.apiKeyHeader || 'Authorization').replace(/'/g, "\\'");
    const apiKeyAsBearer = ctx.auth.apiKeyAsBearer;
    const packageName = getDartPackageName(config);

    return [
      this.generateSdkConfig(),
      this.generateHttpClient(),
      this.generateSdkClient(clientName, tags, resolvedTagNames, config, apiKeyHeader, apiKeyAsBearer),
      this.generatePackageEntry(config, packageName),
    ];
  }

  private generateSdkConfig(): GeneratedFile {
    return {
      path: 'lib/src/http/sdk_config.dart',
      content: this.format(`class SdkConfig {
  final String baseUrl;
  final int timeout;
  final Map<String, String> headers;
  final String? apiKey;
  final String apiKeyHeader;
  final bool apiKeyAsBearer;
  final String? authToken;
  final String? accessToken;

  const SdkConfig({
    required this.baseUrl,
    this.timeout = 30000,
    this.headers = const {},
    this.apiKey,
    this.apiKeyHeader = 'Authorization',
    this.apiKeyAsBearer = true,
    this.authToken,
    this.accessToken,
  });
}
`),
      language: 'dart',
      description: 'SDK runtime configuration',
    };
  }

  private generateHttpClient(): GeneratedFile {
    return {
      path: 'lib/src/http/client.dart',
      content: this.format(`import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'sdk_config.dart';

class HttpClient {
  HttpClient({
    required SdkConfig config,
    http.Client? innerClient,
  })  : _baseUrl = config.baseUrl,
        _timeout = Duration(milliseconds: config.timeout),
        _apiKey = config.apiKey,
        _apiKeyHeader = config.apiKeyHeader,
        _apiKeyAsBearer = config.apiKeyAsBearer,
        _authToken = config.authToken,
        _accessToken = config.accessToken,
        _headers = Map<String, String>.from(config.headers),
        _client = innerClient ?? http.Client();

  final http.Client _client;
  final String _baseUrl;
  final Duration _timeout;
  final Map<String, String> _headers;

  String? _apiKey;
  final String _apiKeyHeader;
  final bool _apiKeyAsBearer;
  String? _authToken;
  String? _accessToken;

  void setApiKey(String apiKey) {
    _apiKey = apiKey;
  }

  void setAuthToken(String token) {
    _authToken = token;
  }

  void setAccessToken(String token) {
    _accessToken = token;
  }

  void setHeader(String key, String value) {
    _headers[key] = value;
  }

  Future<dynamic> get(
    String path, {
    Map<String, dynamic>? params,
    Map<String, String>? headers,
    bool skipAuth = false,
  }) {
    return request('GET', path, params: params, headers: headers, skipAuth: skipAuth);
  }

  Future<dynamic> post(
    String path, {
    dynamic body,
    Map<String, dynamic>? params,
    Map<String, String>? headers,
    String contentType = 'application/json',
    bool skipAuth = false,
  }) {
    return request('POST', path, body: body, params: params, headers: headers, contentType: contentType, skipAuth: skipAuth);
  }

  Future<dynamic> put(
    String path, {
    dynamic body,
    Map<String, dynamic>? params,
    Map<String, String>? headers,
    String contentType = 'application/json',
    bool skipAuth = false,
  }) {
    return request('PUT', path, body: body, params: params, headers: headers, contentType: contentType, skipAuth: skipAuth);
  }

  Future<dynamic> patch(
    String path, {
    dynamic body,
    Map<String, dynamic>? params,
    Map<String, String>? headers,
    String contentType = 'application/json',
    bool skipAuth = false,
  }) {
    return request('PATCH', path, body: body, params: params, headers: headers, contentType: contentType, skipAuth: skipAuth);
  }

  Future<dynamic> delete(
    String path, {
    Map<String, dynamic>? params,
    Map<String, String>? headers,
    bool skipAuth = false,
  }) {
    return request('DELETE', path, params: params, headers: headers, skipAuth: skipAuth);
  }

  Future<dynamic> request(
    String method,
    String path, {
    dynamic body,
    Map<String, dynamic>? params,
    Map<String, String>? headers,
    String contentType = 'application/json',
    bool skipAuth = false,
  }) async {
    final uri = _buildUri(path, params);
    final mergedHeaders = _buildHeaders(headers, contentType: body == null ? null : contentType, skipAuth: skipAuth);

    http.StreamedResponse response;
    if (body != null && contentType.toLowerCase() == 'multipart/form-data') {
      response = await _sendMultipart(method, uri, body, mergedHeaders);
    } else {
      final payload = _encodeBody(body, contentType);
      final request = http.Request(method, uri)
        ..headers.addAll(mergedHeaders);
      if (payload != null) {
        request.body = payload;
      }
      response = await _client.send(request).timeout(_timeout);
    }

    final httpResponse = await http.Response.fromStream(response);
    return _decodeResponse(httpResponse);
  }

  Stream<Map<String, dynamic>> streamJson(
    String path, {
    dynamic body,
    Map<String, dynamic>? params,
    Map<String, String>? headers,
    String contentType = 'application/json',
    bool skipAuth = false,
  }) async* {
    final uri = _buildUri(path, params);
    final request = http.Request('POST', uri)
      ..headers.addAll(_buildHeaders({
        'Accept': 'text/event-stream',
        ...?headers,
      }, contentType: body == null ? null : contentType, skipAuth: skipAuth));
    final payload = _encodeBody(body, contentType);
    if (payload != null) {
      request.body = payload;
    }

    final response = await _client.send(request).timeout(_timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final bodyText = await response.stream.bytesToString();
      throw Exception('SDKWork request failed (\${response.statusCode}): \$bodyText');
    }

    await for (final line in response.stream.transform(utf8.decoder).transform(const LineSplitter())) {
      final trimmed = line.trim();
      if (trimmed.isEmpty || trimmed.startsWith(':') || !trimmed.startsWith('data:')) {
        continue;
      }
      final data = trimmed.substring(5).trim();
      if (data == '[DONE]') {
        break;
      }
      final decoded = jsonDecode(data);
      if (decoded is Map<String, dynamic>) {
        yield decoded;
      } else if (decoded is Map) {
        yield Map<String, dynamic>.from(decoded);
      }
    }
  }

  void close() {
    _client.close();
  }

  Uri _buildUri(String path, Map<String, dynamic>? params) {
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    final uri = Uri.parse('$_baseUrl$normalizedPath');
    if (params == null || params.isEmpty) {
      return uri;
    }

    final queryParameters = <String, String>{};
    params.forEach((key, value) {
      if (value == null) {
        return;
      }
      if (value is Iterable) {
        queryParameters[key] = value.map((item) => item.toString()).join(',');
        return;
      }
      queryParameters[key] = value.toString();
    });

    return uri.replace(queryParameters: {
      ...uri.queryParameters,
      ...queryParameters,
    });
  }

  Map<String, String> _buildHeaders(
    Map<String, String>? headers, {
    String? contentType,
    bool skipAuth = false,
  }) {
    final merged = <String, String>{
      if (!skipAuth) ..._headers,
      ...?headers,
    };

    if (contentType != null && contentType.toLowerCase() != 'multipart/form-data') {
      merged['Content-Type'] = contentType;
    }
    merged.putIfAbsent('Accept', () => 'application/json');

    if (!skipAuth) {
      if (_apiKey != null && _apiKey!.isNotEmpty) {
        merged[_apiKeyHeader] = _apiKeyAsBearer ? 'Bearer $_apiKey' : _apiKey!;
      }
      if (_authToken != null && _authToken!.isNotEmpty) {
        merged['Authorization'] = 'Bearer $_authToken';
      }
      if (_accessToken != null && _accessToken!.isNotEmpty) {
        merged['Access-Token'] = _accessToken!;
      }
    }

    return merged;
  }

  String? _encodeBody(dynamic body, String contentType) {
    if (body == null) {
      return null;
    }

    final normalizedType = contentType.toLowerCase();
    if (normalizedType == 'application/json' || normalizedType.endsWith('+json')) {
      return jsonEncode(body);
    }
    if (normalizedType == 'application/x-www-form-urlencoded' && body is Map) {
      return body.entries
          .map((entry) => '\${Uri.encodeQueryComponent(entry.key.toString())}=\${Uri.encodeQueryComponent(entry.value?.toString() ?? '')}')
          .join('&');
    }
    return body.toString();
  }

  Future<http.StreamedResponse> _sendMultipart(
    String method,
    Uri uri,
    dynamic body,
    Map<String, String> headers,
  ) async {
    final request = http.MultipartRequest(method, uri);
    request.headers.addAll(headers..remove('Content-Type'));

    if (body is Map) {
      for (final entry in body.entries) {
        final key = entry.key.toString();
        final value = entry.value;
        if (value == null) {
          continue;
        }
        if (value is http.MultipartFile) {
          request.files.add(value);
          continue;
        }
        request.fields[key] = value.toString();
      }
    }

    return request.send().timeout(_timeout);
  }

  dynamic _decodeResponse(http.Response response) {
    final body = response.body;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('SDKWork request failed (\${response.statusCode}): \$body');
    }
    if (body.isEmpty) {
      return null;
    }

    final contentType = response.headers['content-type']?.toLowerCase() ?? '';
    final looksLikeJson = contentType.contains('application/json')
        || contentType.contains('+json')
        || body.startsWith('{')
        || body.startsWith('[');
    if (!looksLikeJson) {
      return body;
    }

    try {
      return jsonDecode(body);
    } catch (_) {
      return body;
    }
  }
}
`),
      language: 'dart',
      description: 'Standalone Dart HTTP runtime',
    };
  }

  private generateSdkClient(
    clientName: string,
    tags: string[],
    resolvedTagNames: Map<string, string>,
    config: GeneratorConfig,
    apiKeyHeader: string,
    apiKeyAsBearer: boolean,
  ): GeneratedFile {
    const imports = tags.map((tag) => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const fileName = DART_CONFIG.namingConventions.fileName(resolvedTagName);
      return `import 'src/api/${fileName}.dart';`;
    }).join('\n');

    const modules = tags.map((tag) => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const propName = DART_CONFIG.namingConventions.propertyName(resolvedTagName);
      const className = `${DART_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
      return `  late final ${className} ${propName};`;
    }).join('\n');

    const inits = tags.map((tag) => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const propName = DART_CONFIG.namingConventions.propertyName(resolvedTagName);
      const className = `${DART_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
      return `    ${propName} = ${className}(_httpClient);`;
    }).join('\n');

    return {
      path: `lib/${DART_CONFIG.namingConventions.fileName(config.sdkType)}_client.dart`,
      content: this.format(`import 'src/http/client.dart';
import 'src/http/sdk_config.dart';
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

  void close() {
    _httpClient.close();
  }
}
`),
      language: 'dart',
      description: 'Main SDK class',
    };
  }

  private generatePackageEntry(config: GeneratorConfig, packageName: string): GeneratedFile {
    const clientFile = `${DART_CONFIG.namingConventions.fileName(config.sdkType)}_client.dart`;

    return {
      path: `lib/${packageName}.dart`,
      content: this.format(`export '${clientFile}';
export 'src/http/sdk_config.dart';
export 'src/models.dart';
export 'src/api/api.dart';
`),
      language: 'dart',
      description: 'Package entrypoint exports',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
