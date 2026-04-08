import { resolveSimplifiedTagNames } from '../../framework/naming.js';
import { resolveJvmCommonPackage } from '../../framework/common-package.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { JAVA_CONFIG } from './config.js';
export class HttpClientGenerator {
    generate(ctx, config) {
        const packageName = config.sdkType.toLowerCase();
        const clientName = resolveSdkClientName(config);
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const apiKeyHeader = ctx.auth.apiKeyHeader || 'Authorization';
        const apiKeyUseBearer = ctx.auth.apiKeyAsBearer;
        const commonPkg = resolveJvmCommonPackage(config);
        return [
            this.generateHttpClient(packageName, apiKeyHeader, apiKeyUseBearer, commonPkg.importRoot),
            this.generateSdkClient(clientName, tags, resolvedTagNames, packageName, config, commonPkg.importRoot),
        ];
    }
    generateHttpClient(packageName, apiKeyHeader, apiKeyUseBearer, commonImportRoot) {
        return {
            path: `src/main/java/com/sdkwork/${packageName}/http/HttpClient.java`,
            content: this.format(`package com.sdkwork.${packageName}.http;

import ${commonImportRoot}.Types;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.*;

import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public class HttpClient {
    private static final String API_KEY_HEADER = "${apiKeyHeader}";
    private static final boolean API_KEY_USE_BEARER = ${apiKeyUseBearer ? 'true' : 'false'};

    private final OkHttpClient client;
    private final ObjectMapper mapper;
    private final String baseUrl;
    private final Map<String, String> headers;

    public HttpClient(String baseUrl) {
        this(baseUrl, null, null);
    }

    public HttpClient(Types.SdkConfig config) {
        this(config.baseUrl(), config.timeout(), config.headers());
    }

    private HttpClient(String baseUrl, Integer timeout, Map<String, String> defaultHeaders) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.mapper = new ObjectMapper();
        this.headers = new HashMap<>();
        if (defaultHeaders != null) {
            this.headers.putAll(defaultHeaders);
        }

        long timeoutSeconds = timeout != null && timeout > 0 ? Math.max(1, timeout / 1000L) : 30;
        this.client = new OkHttpClient.Builder()
            .connectTimeout(timeoutSeconds, TimeUnit.SECONDS)
            .readTimeout(timeoutSeconds, TimeUnit.SECONDS)
            .writeTimeout(timeoutSeconds, TimeUnit.SECONDS)
            .build();
    }

    public void setApiKey(String apiKey) {
        headers.put(API_KEY_HEADER, API_KEY_USE_BEARER ? "Bearer " + apiKey : apiKey);
        if (!"Authorization".equalsIgnoreCase(API_KEY_HEADER)) {
            headers.remove("Authorization");
        }
        if (!"Access-Token".equalsIgnoreCase(API_KEY_HEADER)) {
            headers.remove("Access-Token");
        }
    }

    public void setAuthToken(String token) {
        if (!"Authorization".equalsIgnoreCase(API_KEY_HEADER)) {
            headers.remove(API_KEY_HEADER);
        }
        headers.put("Authorization", "Bearer " + token);
    }

    public void setAccessToken(String token) {
        if (!"Access-Token".equalsIgnoreCase(API_KEY_HEADER)) {
            headers.remove(API_KEY_HEADER);
        }
        headers.put("Access-Token", token);
    }

    public void setHeader(String key, String value) {
        headers.put(key, value);
    }

    private HttpUrl buildUrl(String path, Map<String, Object> params) {
        HttpUrl.Builder urlBuilder = HttpUrl.parse(baseUrl + path).newBuilder();
        if (params != null) {
            for (Map.Entry<String, Object> entry : params.entrySet()) {
                urlBuilder.addQueryParameter(entry.getKey(), String.valueOf(entry.getValue()));
            }
        }
        return urlBuilder.build();
    }

    private Request.Builder applyHeaders(Request.Builder builder, Map<String, String> requestHeaders) {
        Map<String, String> mergedHeaders = new HashMap<>(headers);
        if (requestHeaders != null) {
            for (Map.Entry<String, String> entry : requestHeaders.entrySet()) {
                if (entry.getKey() != null && entry.getValue() != null) {
                    mergedHeaders.put(entry.getKey(), entry.getValue());
                }
            }
        }
        if (mergedHeaders.isEmpty()) {
            return builder;
        }
        return builder.headers(Headers.of(mergedHeaders));
    }

    private Object parseResponse(Response response) throws Exception {
        if (!response.isSuccessful()) {
            String body = response.body() != null ? response.body().string() : "";
            throw new RuntimeException("HTTP " + response.code() + ": " + body);
        }

        if (response.body() == null) {
            return null;
        }

        String bodyText = response.body().string();
        if (bodyText == null || bodyText.isBlank()) {
            return null;
        }

        return mapper.readValue(bodyText, Object.class);
    }

    private RequestBody createJsonBody(Object body) throws Exception {
        Object payload = body == null ? new HashMap<String, Object>() : body;
        return RequestBody.create(
            mapper.writeValueAsString(payload),
            MediaType.parse("application/json")
        );
    }

    private RequestBody createMultipartBody(Object body) {
        if (body instanceof RequestBody) {
            RequestBody requestBody = (RequestBody) body;
            return requestBody;
        }

        MultipartBody.Builder builder = new MultipartBody.Builder().setType(MultipartBody.FORM);
        if (body instanceof Map<?, ?>) {
            Map<?, ?> mapBody = (Map<?, ?>) body;
            for (Map.Entry<?, ?> entry : mapBody.entrySet()) {
                if (entry.getKey() == null) {
                    continue;
                }
                String key = String.valueOf(entry.getKey());
                Object value = entry.getValue();
                if (value == null) {
                    builder.addFormDataPart(key, "");
                    continue;
                }
                if (value instanceof byte[]) {
                    byte[] bytes = (byte[]) value;
                    builder.addFormDataPart(
                        key,
                        key,
                        RequestBody.create(bytes, MediaType.parse("application/octet-stream"))
                    );
                    continue;
                }
                if (value instanceof Iterable<?>) {
                    Iterable<?> iterable = (Iterable<?>) value;
                    for (Object item : iterable) {
                        builder.addFormDataPart(key, item == null ? "" : String.valueOf(item));
                    }
                    continue;
                }
                if (value instanceof Collection<?>) {
                    Collection<?> collection = (Collection<?>) value;
                    for (Object item : collection) {
                        builder.addFormDataPart(key, item == null ? "" : String.valueOf(item));
                    }
                    continue;
                }
                builder.addFormDataPart(key, String.valueOf(value));
            }
        } else if (body != null) {
            builder.addFormDataPart("value", String.valueOf(body));
        }
        return builder.build();
    }

    private RequestBody createFormBody(Object body) {
        if (body instanceof RequestBody) {
            RequestBody requestBody = (RequestBody) body;
            return requestBody;
        }
        FormBody.Builder builder = new FormBody.Builder(StandardCharsets.UTF_8);
        if (body instanceof Map<?, ?>) {
            Map<?, ?> mapBody = (Map<?, ?>) body;
            for (Map.Entry<?, ?> entry : mapBody.entrySet()) {
                if (entry.getKey() == null) {
                    continue;
                }
                String key = String.valueOf(entry.getKey());
                Object value = entry.getValue();
                if (value == null) {
                    builder.add(key, "");
                    continue;
                }
                if (value instanceof Iterable<?>) {
                    Iterable<?> iterable = (Iterable<?>) value;
                    for (Object item : iterable) {
                        builder.add(key, item == null ? "" : String.valueOf(item));
                    }
                    continue;
                }
                if (value instanceof Collection<?>) {
                    Collection<?> collection = (Collection<?>) value;
                    for (Object item : collection) {
                        builder.add(key, item == null ? "" : String.valueOf(item));
                    }
                    continue;
                }
                builder.add(key, String.valueOf(value));
            }
        } else if (body != null) {
            builder.add("value", String.valueOf(body));
        }
        return builder.build();
    }

    private RequestBody createRequestBody(Object body, String contentType) throws Exception {
        String normalized = contentType == null || contentType.isBlank()
            ? "application/json"
            : contentType.toLowerCase();

        if (normalized.startsWith("multipart/form-data")) {
            return createMultipartBody(body);
        }
        if (normalized.startsWith("application/x-www-form-urlencoded")) {
            return createFormBody(body);
        }
        if (body instanceof RequestBody) {
            RequestBody requestBody = (RequestBody) body;
            return requestBody;
        }
        return createJsonBody(body);
    }

    private Object execute(Request request) throws Exception {
        try (Response response = client.newCall(request).execute()) {
            return parseResponse(response);
        }
    }

    public Object get(String path) throws Exception {
        return get(path, null, null);
    }

    public Object get(String path, Map<String, Object> params) throws Exception {
        return get(path, params, null);
    }

    public Object get(String path, Map<String, Object> params, Map<String, String> requestHeaders) throws Exception {
        Request request = applyHeaders(new Request.Builder(), requestHeaders)
            .url(buildUrl(path, params))
            .get()
            .build();
        return execute(request);
    }

    public Object post(String path, Object body) throws Exception {
        return post(path, body, null, null, "application/json");
    }

    public Object post(String path, Object body, Map<String, Object> params) throws Exception {
        return post(path, body, params, null, "application/json");
    }

    public Object post(String path, Object body, Map<String, Object> params, Map<String, String> requestHeaders) throws Exception {
        return post(path, body, params, requestHeaders, "application/json");
    }

    public Object post(
        String path,
        Object body,
        Map<String, Object> params,
        Map<String, String> requestHeaders,
        String contentType
    ) throws Exception {
        RequestBody requestBody = createRequestBody(body, contentType);
        Request request = applyHeaders(new Request.Builder(), requestHeaders)
            .url(buildUrl(path, params))
            .post(requestBody)
            .build();
        return execute(request);
    }

    public Object put(String path, Object body) throws Exception {
        return put(path, body, null, null, "application/json");
    }

    public Object put(String path, Object body, Map<String, Object> params) throws Exception {
        return put(path, body, params, null, "application/json");
    }

    public Object put(String path, Object body, Map<String, Object> params, Map<String, String> requestHeaders) throws Exception {
        return put(path, body, params, requestHeaders, "application/json");
    }

    public Object put(
        String path,
        Object body,
        Map<String, Object> params,
        Map<String, String> requestHeaders,
        String contentType
    ) throws Exception {
        RequestBody requestBody = createRequestBody(body, contentType);
        Request request = applyHeaders(new Request.Builder(), requestHeaders)
            .url(buildUrl(path, params))
            .put(requestBody)
            .build();
        return execute(request);
    }

    public Object delete(String path) throws Exception {
        return delete(path, null, null);
    }

    public Object delete(String path, Map<String, Object> params) throws Exception {
        return delete(path, params, null);
    }

    public Object delete(String path, Map<String, Object> params, Map<String, String> requestHeaders) throws Exception {
        Request request = applyHeaders(new Request.Builder(), requestHeaders)
            .url(buildUrl(path, params))
            .delete()
            .build();
        return execute(request);
    }

    public Object patch(String path, Object body) throws Exception {
        return patch(path, body, null, null, "application/json");
    }

    public Object patch(String path, Object body, Map<String, Object> params) throws Exception {
        return patch(path, body, params, null, "application/json");
    }

    public Object patch(String path, Object body, Map<String, Object> params, Map<String, String> requestHeaders) throws Exception {
        return patch(path, body, params, requestHeaders, "application/json");
    }

    public Object patch(
        String path,
        Object body,
        Map<String, Object> params,
        Map<String, String> requestHeaders,
        String contentType
    ) throws Exception {
        RequestBody requestBody = createRequestBody(body, contentType);
        Request request = applyHeaders(new Request.Builder(), requestHeaders)
            .url(buildUrl(path, params))
            .patch(requestBody)
            .build();
        return execute(request);
    }
}
`),
            language: 'java',
            description: 'HTTP client implementation',
        };
    }
    generateSdkClient(clientName, tags, resolvedTagNames, packageName, config, commonImportRoot) {
        const imports = tags.map(tag => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const className = `${JAVA_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            return `import com.sdkwork.${packageName}.api.${className};`;
        }).join('\n');
        const fields = tags.map(tag => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const fieldName = JAVA_CONFIG.namingConventions.propertyName(resolvedTagName);
            const className = `${JAVA_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            return `    private ${className} ${fieldName};`;
        }).join('\n');
        const inits = tags.map(tag => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const fieldName = JAVA_CONFIG.namingConventions.propertyName(resolvedTagName);
            const className = `${JAVA_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            return `        this.${fieldName} = new ${className}(httpClient);`;
        }).join('\n');
        const getters = tags.map(tag => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const fieldName = JAVA_CONFIG.namingConventions.propertyName(resolvedTagName);
            const className = `${JAVA_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            return `    public ${className} get${JAVA_CONFIG.namingConventions.modelName(resolvedTagName)}() {
        return this.${fieldName};
    }`;
        }).join('\n\n');
        return {
            path: `src/main/java/com/sdkwork/${packageName}/${clientName}.java`,
            content: this.format(`package com.sdkwork.${packageName};

import ${commonImportRoot}.Types;
import com.sdkwork.${packageName}.http.HttpClient;
${imports}

public class ${clientName} {
    private final HttpClient httpClient;
${fields}

    public ${clientName}(String baseUrl) {
        this.httpClient = new HttpClient(baseUrl);
${inits}
    }

    public ${clientName}(Types.SdkConfig config) {
        this.httpClient = new HttpClient(config);
${inits}
    }

${getters}

    public ${clientName} setApiKey(String apiKey) {
        httpClient.setApiKey(apiKey);
        return this;
    }

    public ${clientName} setAuthToken(String token) {
        httpClient.setAuthToken(token);
        return this;
    }

    public ${clientName} setAccessToken(String token) {
        httpClient.setAccessToken(token);
        return this;
    }

    public ${clientName} setHeader(String key, String value) {
        httpClient.setHeader(key, value);
        return this;
    }

    public HttpClient getHttpClient() {
        return httpClient;
    }
}
`),
            language: 'java',
            description: 'Main SDK class',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
