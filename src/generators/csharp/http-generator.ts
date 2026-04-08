import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSimplifiedTagNames } from '../../framework/naming.js';
import { resolveCSharpCommonPackage } from '../../framework/common-package.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { CSHARP_CONFIG, getCSharpNamespace } from './config.js';

export class HttpClientGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const namespace = getCSharpNamespace(config);
    const clientName = resolveSdkClientName(config);
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
    const apiKeyHeader = ctx.auth.apiKeyHeader || 'Authorization';
    const apiKeyUseBearer = ctx.auth.apiKeyAsBearer;
    const commonPkg = resolveCSharpCommonPackage(config);

    return [
      this.generateHttpClient(namespace, apiKeyHeader, apiKeyUseBearer, commonPkg.namespace),
      this.generateSdkClient(clientName, tags, resolvedTagNames, namespace, config, commonPkg.namespace),
    ];
  }

  private generateHttpClient(
    namespace: string,
    apiKeyHeader: string,
    apiKeyUseBearer: boolean,
    commonNamespace: string,
  ): GeneratedFile {
    return {
      path: 'Http/HttpClient.cs',
      content: this.format(`using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using ${commonNamespace};

namespace ${namespace}.Http
{
    public class HttpClient
    {
        private const string ApiKeyHeader = "${apiKeyHeader}";
        private static readonly bool ApiKeyUseBearer = ${apiKeyUseBearer ? 'true' : 'false'};

        private readonly System.Net.Http.HttpClient _client;
        private readonly string _baseUrl;

        public HttpClient(string baseUrl)
            : this(new SdkConfig(baseUrl))
        {
        }

        public HttpClient(SdkConfig config)
        {
            _baseUrl = config.BaseUrl.TrimEnd('/');
            _client = new System.Net.Http.HttpClient
            {
                Timeout = TimeSpan.FromMilliseconds(config.Timeout ?? DefaultValues.DEFAULT_TIMEOUT)
            };

            if (config.Headers != null)
            {
                foreach (var header in config.Headers)
                {
                    SetHeader(header.Key, header.Value);
                }
            }
        }

        public void SetApiKey(string apiKey)
        {
            if (ApiKeyHeader.Equals("Authorization", StringComparison.OrdinalIgnoreCase))
            {
                if (ApiKeyUseBearer)
                {
                    _client.DefaultRequestHeaders.Authorization =
                        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
                }
                else
                {
                    _client.DefaultRequestHeaders.Authorization = null;
                    if (_client.DefaultRequestHeaders.Contains("Authorization"))
                    {
                        _client.DefaultRequestHeaders.Remove("Authorization");
                    }
                    _client.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", apiKey);
                }
            }
            else
            {
                if (_client.DefaultRequestHeaders.Contains(ApiKeyHeader))
                {
                    _client.DefaultRequestHeaders.Remove(ApiKeyHeader);
                }
                var headerValue = ApiKeyUseBearer ? "Bearer " + apiKey : apiKey;
                _client.DefaultRequestHeaders.TryAddWithoutValidation(ApiKeyHeader, headerValue);
                _client.DefaultRequestHeaders.Authorization = null;
            }

            if (!ApiKeyHeader.Equals("Access-Token", StringComparison.OrdinalIgnoreCase)
                && _client.DefaultRequestHeaders.Contains("Access-Token"))
            {
                _client.DefaultRequestHeaders.Remove("Access-Token");
            }
        }

        public void SetAuthToken(string token)
        {
            if (!ApiKeyHeader.Equals("Authorization", StringComparison.OrdinalIgnoreCase)
                && _client.DefaultRequestHeaders.Contains(ApiKeyHeader))
            {
                _client.DefaultRequestHeaders.Remove(ApiKeyHeader);
            }
            _client.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        }

        public void SetAccessToken(string token)
        {
            if (!ApiKeyHeader.Equals("Access-Token", StringComparison.OrdinalIgnoreCase)
                && _client.DefaultRequestHeaders.Contains(ApiKeyHeader))
            {
                _client.DefaultRequestHeaders.Remove(ApiKeyHeader);
            }
            if (_client.DefaultRequestHeaders.Contains("Access-Token"))
            {
                _client.DefaultRequestHeaders.Remove("Access-Token");
            }
            _client.DefaultRequestHeaders.TryAddWithoutValidation("Access-Token", token);
        }

        public void SetHeader(string key, string value)
        {
            if (_client.DefaultRequestHeaders.Contains(key))
            {
                _client.DefaultRequestHeaders.Remove(key);
            }
            _client.DefaultRequestHeaders.TryAddWithoutValidation(key, value);
        }

        private HttpRequestMessage BuildRequest(
            System.Net.Http.HttpMethod method,
            string path,
            Dictionary<string, object>? parameters = null,
            Dictionary<string, string>? requestHeaders = null,
            HttpContent? content = null)
        {
            var request = new HttpRequestMessage(method, BuildUrl(path, parameters));
            if (content != null)
            {
                request.Content = content;
            }

            if (requestHeaders != null)
            {
                foreach (var header in requestHeaders)
                {
                    if (string.Equals(header.Key, "Content-Type", StringComparison.OrdinalIgnoreCase))
                    {
                        if (request.Content != null && !string.IsNullOrWhiteSpace(header.Value))
                        {
                            request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(header.Value);
                        }
                        continue;
                    }

                    request.Headers.Remove(header.Key);
                    request.Headers.TryAddWithoutValidation(header.Key, header.Value);
                }
            }

            return request;
        }

        private static HttpContent CreateMultipartContent(object? body)
        {
            if (body is HttpContent rawContent)
            {
                return rawContent;
            }

            var multipart = new MultipartFormDataContent();
            void AddValue(string key, object? value)
            {
                if (value == null)
                {
                    multipart.Add(new StringContent(string.Empty), key);
                    return;
                }

                if (value is byte[] bytes)
                {
                    multipart.Add(new ByteArrayContent(bytes), key, key);
                    return;
                }

                if (value is IEnumerable values && value is not string && value is not byte[])
                {
                    foreach (var item in values)
                    {
                        AddValue(key, item);
                    }
                    return;
                }

                multipart.Add(new StringContent(Convert.ToString(value) ?? string.Empty), key);
            }

            switch (body)
            {
                case Dictionary<string, object> objectMap:
                    foreach (var pair in objectMap)
                    {
                        AddValue(pair.Key, pair.Value);
                    }
                    break;
                case Dictionary<string, string> stringMap:
                    foreach (var pair in stringMap)
                    {
                        AddValue(pair.Key, pair.Value);
                    }
                    break;
                default:
                    AddValue("value", body);
                    break;
            }

            return multipart;
        }

        private static HttpContent CreateFormContent(object? body)
        {
            var entries = new List<KeyValuePair<string, string>>();
            void AddEntry(string key, object? value)
            {
                if (value is IEnumerable values && value is not string && value is not byte[])
                {
                    foreach (var item in values)
                    {
                        AddEntry(key, item);
                    }
                    return;
                }

                entries.Add(new KeyValuePair<string, string>(key, Convert.ToString(value) ?? string.Empty));
            }

            switch (body)
            {
                case Dictionary<string, object> objectMap:
                    foreach (var pair in objectMap)
                    {
                        AddEntry(pair.Key, pair.Value);
                    }
                    break;
                case Dictionary<string, string> stringMap:
                    foreach (var pair in stringMap)
                    {
                        AddEntry(pair.Key, pair.Value);
                    }
                    break;
                default:
                    if (body != null)
                    {
                        AddEntry("value", body);
                    }
                    break;
            }

            return new FormUrlEncodedContent(entries);
        }

        private static HttpContent? CreateContent(object? body, string? contentType = null)
        {
            if (body == null)
            {
                return null;
            }

            if (body is HttpContent rawContent)
            {
                return rawContent;
            }

            var normalized = (contentType ?? "application/json").Trim().ToLowerInvariant();
            if (normalized.StartsWith("multipart/form-data"))
            {
                return CreateMultipartContent(body);
            }
            if (normalized.StartsWith("application/x-www-form-urlencoded"))
            {
                return CreateFormContent(body);
            }

            if (body is string text && !normalized.Contains("json"))
            {
                return new StringContent(text, Encoding.UTF8, contentType ?? "text/plain; charset=utf-8");
            }

            var json = JsonSerializer.Serialize(body);
            return new StringContent(json, Encoding.UTF8, "application/json");
        }

        private string BuildUrl(string path, Dictionary<string, object>? parameters = null)
        {
            var url = _baseUrl + path;
            if (parameters == null || parameters.Count == 0)
            {
                return url;
            }

            var query = string.Join("&", parameters.Select(p =>
                $"{Uri.EscapeDataString(p.Key)}={Uri.EscapeDataString(Convert.ToString(p.Value) ?? string.Empty)}"));
            return $"{url}?{query}";
        }

        private static async Task<T?> ReadResponseAsync<T>(HttpResponseMessage response)
        {
            response.EnsureSuccessStatusCode();

            if (response.Content == null || response.Content.Headers.ContentLength == 0)
            {
                return default;
            }

            var contentType = response.Content.Headers.ContentType?.MediaType ?? string.Empty;
            if (!contentType.Contains("application/json", StringComparison.OrdinalIgnoreCase))
            {
                return default;
            }

            return await response.Content.ReadFromJsonAsync<T>();
        }

        public async Task<T?> GetAsync<T>(
            string path,
            Dictionary<string, object>? parameters = null,
            Dictionary<string, string>? requestHeaders = null)
        {
            using var request = BuildRequest(System.Net.Http.HttpMethod.Get, path, parameters, requestHeaders);
            var response = await _client.SendAsync(request);
            return await ReadResponseAsync<T>(response);
        }

        public async Task<T?> PostAsync<T>(
            string path,
            object? body = null,
            Dictionary<string, object>? parameters = null,
            Dictionary<string, string>? requestHeaders = null,
            string? contentType = null)
        {
            using var content = CreateContent(body, contentType);
            using var request = BuildRequest(System.Net.Http.HttpMethod.Post, path, parameters, requestHeaders, content);
            var response = await _client.SendAsync(request);
            return await ReadResponseAsync<T>(response);
        }

        public async Task<T?> PutAsync<T>(
            string path,
            object? body = null,
            Dictionary<string, object>? parameters = null,
            Dictionary<string, string>? requestHeaders = null,
            string? contentType = null)
        {
            using var content = CreateContent(body, contentType);
            using var request = BuildRequest(System.Net.Http.HttpMethod.Put, path, parameters, requestHeaders, content);
            var response = await _client.SendAsync(request);
            return await ReadResponseAsync<T>(response);
        }

        public async Task<T?> DeleteAsync<T>(
            string path,
            Dictionary<string, object>? parameters = null,
            Dictionary<string, string>? requestHeaders = null)
        {
            using var request = BuildRequest(System.Net.Http.HttpMethod.Delete, path, parameters, requestHeaders);
            var response = await _client.SendAsync(request);
            return await ReadResponseAsync<T>(response);
        }

        public async Task<T?> PatchAsync<T>(
            string path,
            object? body = null,
            Dictionary<string, object>? parameters = null,
            Dictionary<string, string>? requestHeaders = null,
            string? contentType = null)
        {
            using var content = CreateContent(body, contentType);
            using var request = BuildRequest(System.Net.Http.HttpMethod.Patch, path, parameters, requestHeaders, content);
            var response = await _client.SendAsync(request);
            return await ReadResponseAsync<T>(response);
        }
    }
}
`),
      language: 'csharp',
      description: 'HTTP client implementation',
    };
  }

  private generateSdkClient(
    clientName: string,
    tags: string[],
    resolvedTagNames: Map<string, string>,
    namespace: string,
    config: GeneratorConfig,
    commonNamespace: string,
  ): GeneratedFile {
    const modules = tags.map(tag => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const propName = CSHARP_CONFIG.namingConventions.propertyName(resolvedTagName);
      const className = `${CSHARP_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
      return `        public ${className} ${propName} { get; }`;
    }).join('\n');

    const inits = tags.map(tag => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const propName = CSHARP_CONFIG.namingConventions.propertyName(resolvedTagName);
      const className = `${CSHARP_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
      return `            ${propName} = new ${className}(_httpClient);`;
    }).join('\n');

    return {
      path: `${clientName}.cs`,
      content: this.format(`using System;
using ${commonNamespace};
using SdkHttpClient = ${namespace}.Http.HttpClient;
using ${namespace}.Api;

namespace ${namespace}
{
    public class ${clientName}
    {
        private readonly SdkHttpClient _httpClient;

${modules}

        public ${clientName}(string baseUrl)
        {
            _httpClient = new SdkHttpClient(baseUrl);
${inits}
        }

        public ${clientName}(SdkConfig config)
        {
            _httpClient = new SdkHttpClient(config);
${inits}
        }

        public ${clientName} SetApiKey(string apiKey)
        {
            _httpClient.SetApiKey(apiKey);
            return this;
        }

        public ${clientName} SetAuthToken(string token)
        {
            _httpClient.SetAuthToken(token);
            return this;
        }

        public ${clientName} SetAccessToken(string token)
        {
            _httpClient.SetAccessToken(token);
            return this;
        }

        public ${clientName} SetHeader(string key, string value)
        {
            _httpClient.SetHeader(key, value);
            return this;
        }
    }
}
`),
      language: 'csharp',
      description: 'Main SDK class',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
