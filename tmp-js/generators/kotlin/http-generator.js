import { resolveSimplifiedTagNames } from '../../framework/naming.js';
import { resolveJvmCommonPackage } from '../../framework/common-package.js';
import { resolveJvmSdkIdentity } from '../../framework/jvm-sdk-identity.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { KOTLIN_CONFIG } from './config.js';
export class HttpClientGenerator {
    generate(ctx, config) {
        const identity = resolveJvmSdkIdentity(config);
        const clientName = resolveSdkClientName(config);
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const apiKeyHeader = ctx.auth.apiKeyHeader || 'Authorization';
        const apiKeyUseBearer = ctx.auth.apiKeyAsBearer;
        const commonPkg = resolveJvmCommonPackage(config);
        return [
            this.generateHttpClient(identity, apiKeyHeader, apiKeyUseBearer, commonPkg.importRoot),
            this.generateSdkClient(clientName, tags, resolvedTagNames, identity, config, commonPkg.importRoot),
        ];
    }
    generateHttpClient(packageName, apiKeyHeader, apiKeyUseBearer, commonImportRoot) {
        return {
            path: `src/main/kotlin/${packageName.packagePath}/http/HttpClient.kt`,
            content: this.format(`package ${packageName.packageRoot}.http

import com.fasterxml.jackson.core.type.TypeReference
import ${commonImportRoot}.SdkConfig
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import okhttp3.Headers
import okhttp3.FormBody
import okhttp3.HttpUrl
import okhttp3.MediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import java.util.concurrent.TimeUnit

class HttpClient(
    private val baseUrl: String,
    timeoutMs: Int = 30000,
    defaultHeaders: Map<String, String> = emptyMap()
) {
    companion object {
        private const val API_KEY_HEADER = "${apiKeyHeader}"
        private const val API_KEY_USE_BEARER = ${apiKeyUseBearer ? 'true' : 'false'}
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .readTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .writeTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .build()
    private val mapper = ObjectMapper().registerKotlinModule()
    private val headers = mutableMapOf<String, String>()

    constructor(config: SdkConfig) : this(
        baseUrl = config.baseUrl.trimEnd('/'),
        timeoutMs = config.timeout ?: 30000,
        defaultHeaders = config.headers ?: emptyMap()
    )

    init {
        headers.putAll(defaultHeaders)
    }

    fun setApiKey(apiKey: String) {
        headers[API_KEY_HEADER] = if (API_KEY_USE_BEARER) "Bearer $apiKey" else apiKey
        if (!API_KEY_HEADER.equals("Authorization", ignoreCase = true)) {
            headers.remove("Authorization")
        }
        if (!API_KEY_HEADER.equals("Access-Token", ignoreCase = true)) {
            headers.remove("Access-Token")
        }
    }

    fun setAuthToken(token: String) {
        if (!API_KEY_HEADER.equals("Authorization", ignoreCase = true)) {
            headers.remove(API_KEY_HEADER)
        }
        headers["Authorization"] = "Bearer $token"
    }

    fun setAccessToken(token: String) {
        if (!API_KEY_HEADER.equals("Access-Token", ignoreCase = true)) {
            headers.remove(API_KEY_HEADER)
        }
        headers["Access-Token"] = token
    }

    fun setHeader(key: String, value: String) {
        headers[key] = value
    }

    private fun buildUrl(path: String, params: Map<String, Any>? = null): HttpUrl {
        val urlBuilder = HttpUrl.parse(baseUrl + path)!!.newBuilder()
        params?.forEach { (key, value) ->
            urlBuilder.addQueryParameter(key, value.toString())
        }
        return urlBuilder.build()
    }

    private fun mergeHeaders(requestHeaders: Map<String, String>? = null): Headers {
        val merged = headers.toMutableMap()
        requestHeaders?.forEach { (key, value) ->
            if (key.isNotBlank()) {
                merged[key] = value
            }
        }
        return Headers.of(merged)
    }

    private fun createJsonBody(body: Any?): RequestBody {
        val payload = body ?: emptyMap<String, Any>()
        return RequestBody.create(
            MediaType.parse("application/json"),
            mapper.writeValueAsString(payload)
        )
    }

    private fun createMultipartBody(body: Any?): RequestBody {
        if (body is RequestBody) {
            return body
        }

        val builder = MultipartBody.Builder().setType(MultipartBody.FORM)
        when (body) {
            is Map<*, *> -> {
                body.forEach { (key, value) ->
                    if (key == null) return@forEach
                    val partName = key.toString()
                    when (value) {
                        null -> builder.addFormDataPart(partName, "")
                        is ByteArray -> builder.addFormDataPart(
                            partName,
                            partName,
                            RequestBody.create(MediaType.parse("application/octet-stream"), value)
                        )
                        is Iterable<*> -> value.forEach { item ->
                            builder.addFormDataPart(partName, item?.toString() ?: "")
                        }
                        else -> builder.addFormDataPart(partName, value.toString())
                    }
                }
            }
            null -> {}
            else -> builder.addFormDataPart("value", body.toString())
        }
        return builder.build()
    }

    private fun createFormBody(body: Any?): RequestBody {
        if (body is RequestBody) {
            return body
        }
        val builder = FormBody.Builder()
        when (body) {
            is Map<*, *> -> {
                body.forEach { (key, value) ->
                    if (key == null) return@forEach
                    val fieldName = key.toString()
                    when (value) {
                        null -> builder.add(fieldName, "")
                        is Iterable<*> -> value.forEach { item ->
                            builder.add(fieldName, item?.toString() ?: "")
                        }
                        else -> builder.add(fieldName, value.toString())
                    }
                }
            }
            null -> {}
            else -> builder.add("value", body.toString())
        }
        return builder.build()
    }

    private fun createRequestBody(body: Any?, contentType: String?): RequestBody {
        val normalized = contentType?.lowercase() ?: "application/json"
        return when {
            normalized.startsWith("multipart/form-data") -> createMultipartBody(body)
            normalized.startsWith("application/x-www-form-urlencoded") -> createFormBody(body)
            body is RequestBody -> body
            else -> createJsonBody(body)
        }
    }

    private fun parseResponse(responseBody: String?): Any? {
        if (responseBody.isNullOrBlank()) {
            return null
        }
        return mapper.readValue(responseBody, Any::class.java)
    }

    fun <T> convertValue(value: Any?, typeReference: TypeReference<T>): T? {
        if (value == null) {
            return null
        }
        return mapper.convertValue(value, typeReference)
    }

    suspend fun get(path: String, params: Map<String, Any>? = null, requestHeaders: Map<String, String>? = null): Any? {
        val request = Request.Builder()
            .url(buildUrl(path, params))
            .headers(mergeHeaders(requestHeaders))
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw RuntimeException("HTTP ${'$'}{response.code()}: ${'$'}{response.body()?.string() ?: ""}")
            }
            return parseResponse(response.body()?.string())
        }
    }

    suspend fun post(
        path: String,
        body: Any? = null,
        params: Map<String, Any>? = null,
        requestHeaders: Map<String, String>? = null,
        contentType: String? = null
    ): Any? {
        val requestBody = createRequestBody(body, contentType)
        val request = Request.Builder()
            .url(buildUrl(path, params))
            .headers(mergeHeaders(requestHeaders))
            .post(requestBody)
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw RuntimeException("HTTP ${'$'}{response.code()}: ${'$'}{response.body()?.string() ?: ""}")
            }
            return parseResponse(response.body()?.string())
        }
    }

    suspend fun put(
        path: String,
        body: Any? = null,
        params: Map<String, Any>? = null,
        requestHeaders: Map<String, String>? = null,
        contentType: String? = null
    ): Any? {
        val requestBody = createRequestBody(body, contentType)
        val request = Request.Builder()
            .url(buildUrl(path, params))
            .headers(mergeHeaders(requestHeaders))
            .put(requestBody)
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw RuntimeException("HTTP ${'$'}{response.code()}: ${'$'}{response.body()?.string() ?: ""}")
            }
            return parseResponse(response.body()?.string())
        }
    }

    suspend fun delete(path: String, params: Map<String, Any>? = null, requestHeaders: Map<String, String>? = null): Any? {
        val request = Request.Builder()
            .url(buildUrl(path, params))
            .headers(mergeHeaders(requestHeaders))
            .delete()
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw RuntimeException("HTTP ${'$'}{response.code()}: ${'$'}{response.body()?.string() ?: ""}")
            }
            return parseResponse(response.body()?.string())
        }
    }

    suspend fun patch(
        path: String,
        body: Any? = null,
        params: Map<String, Any>? = null,
        requestHeaders: Map<String, String>? = null,
        contentType: String? = null
    ): Any? {
        val requestBody = createRequestBody(body, contentType)
        val request = Request.Builder()
            .url(buildUrl(path, params))
            .headers(mergeHeaders(requestHeaders))
            .patch(requestBody)
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw RuntimeException("HTTP ${'$'}{response.code()}: ${'$'}{response.body()?.string() ?: ""}")
            }
            return parseResponse(response.body()?.string())
        }
    }
}
`),
            language: 'kotlin',
            description: 'HTTP client implementation',
        };
    }
    generateSdkClient(clientName, tags, resolvedTagNames, packageName, config, commonImportRoot) {
        const modules = tags.map(tag => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const propName = KOTLIN_CONFIG.namingConventions.propertyName(resolvedTagName);
            const className = `${KOTLIN_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            return `    lateinit var ${propName}: ${className}`;
        }).join('\n');
        const inits = tags.map(tag => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const propName = KOTLIN_CONFIG.namingConventions.propertyName(resolvedTagName);
            const className = `${KOTLIN_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            return `        ${propName} = ${className}(httpClient)`;
        }).join('\n');
        return {
            path: `src/main/kotlin/${packageName.packagePath}/${clientName}.kt`,
            content: this.format(`package ${packageName.packageRoot}

import ${commonImportRoot}.SdkConfig
import ${packageName.packageRoot}.http.HttpClient
${tags.map(tag => {
                const resolvedTagName = resolvedTagNames.get(tag) || tag;
                return `import ${packageName.packageRoot}.api.${KOTLIN_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            }).join('\n')}

class ${clientName} {
    private val httpClient: HttpClient

${modules}

    constructor(baseUrl: String) {
        this.httpClient = HttpClient(baseUrl)
${inits}
    }

    constructor(config: SdkConfig) {
        this.httpClient = HttpClient(config)
${inits}
    }

    fun setApiKey(apiKey: String): ${clientName} {
        httpClient.setApiKey(apiKey)
        return this
    }

    fun setAuthToken(token: String): ${clientName} {
        httpClient.setAuthToken(token)
        return this
    }

    fun setAccessToken(token: String): ${clientName} {
        httpClient.setAccessToken(token)
        return this
    }

    fun setHeader(key: String, value: String): ${clientName} {
        httpClient.setHeader(key, value)
        return this
    }
}
`),
            language: 'kotlin',
            description: 'Main SDK class',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
