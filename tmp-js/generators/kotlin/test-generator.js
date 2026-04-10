import { resolveJvmCommonPackage } from '../../framework/common-package.js';
import { resolveJvmSdkIdentity } from '../../framework/jvm-sdk-identity.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { KotlinUsagePlanner, renderKotlinUsageSnippet, resolveKotlinExpectedRequestPath, } from './usage-planner.js';
export class TestGenerator {
    generate(ctx, config) {
        const planner = new KotlinUsagePlanner(ctx);
        const plan = planner.selectQuickStartPlan();
        if (!plan) {
            throw new Error('Kotlin generateTests requires at least one API operation to build a smoke test.');
        }
        const identity = resolveJvmSdkIdentity(config);
        return [
            {
                path: `src/test/kotlin/${identity.packagePath}/GeneratedSdkSmokeTest.kt`,
                content: this.generateSmokeTest(plan, config, identity.packageRoot),
                language: 'kotlin',
                description: 'Generated SDK smoke test',
            },
        ];
    }
    generateSmokeTest(plan, config, packageRoot) {
        const commonPkg = resolveJvmCommonPackage(config);
        const clientName = resolveSdkClientName(config);
        const expectedPath = resolveKotlinExpectedRequestPath(plan.operation.path, config.apiPrefix);
        const setupAndCall = this.indent(renderKotlinUsageSnippet(plan, 'test', { assignResult: plan.hasReturnValue }), 12);
        const assertions = this.indent(this.buildAssertions(plan, expectedPath), 12);
        const handlerResponse = this.indent(this.buildResponseHandler(plan), 16);
        return this.format(`package ${packageRoot}

import ${commonPkg.importRoot}.SdkConfig
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.coroutines.runBlocking

class GeneratedSdkSmokeTest {
    @Test
    fun generatedSdkForwardsRequestMetadata() = runBlocking {
        val mapper = ObjectMapper().registerKotlinModule()
        var capturedPath = ""
        val capturedQuery = linkedMapOf<String, String>()
        val capturedHeaders = linkedMapOf<String, String>()
        var capturedBody = ByteArray(0)
        var capturedContentType = ""

        val server = HttpServer.create(InetSocketAddress(0), 0)
        server.createContext("/") { exchange ->
            try {
                capturedPath = exchange.requestURI.path
                capturedQuery.clear()
                capturedQuery.putAll(parseQuery(exchange.requestURI.rawQuery))
                capturedHeaders.clear()
                capturedHeaders.putAll(flattenHeaders(exchange))
                capturedContentType = exchange.requestHeaders.getFirst("Content-Type") ?: ""
                capturedBody = exchange.requestBody.readBytes()
${handlerResponse}
            } catch (exception: Exception) {
                throw RuntimeException(exception)
            } finally {
                exchange.close()
            }
        }
        server.start()

        try {
            val baseUrl = "http://127.0.0.1:${'$'}{server.address.port}"
            val config = SdkConfig(baseUrl = baseUrl)
            val client = ${clientName}(config)

${setupAndCall}

${assertions}
        } finally {
            server.stop(0)
        }
    }

    private fun parseQuery(rawQuery: String?): LinkedHashMap<String, String> {
        val values = linkedMapOf<String, String>()
        if (rawQuery.isNullOrBlank()) {
            return LinkedHashMap(values)
        }
        for (pair in rawQuery.split("&")) {
            if (pair.isBlank()) {
                continue
            }
            val parts = pair.split("=", limit = 2)
            val key = URLDecoder.decode(parts[0], StandardCharsets.UTF_8)
            val value = if (parts.size > 1) URLDecoder.decode(parts[1], StandardCharsets.UTF_8) else ""
            values[key] = value
        }
        return LinkedHashMap(values)
    }

    private fun flattenHeaders(exchange: HttpExchange): LinkedHashMap<String, String> {
        val values = linkedMapOf<String, String>()
        exchange.requestHeaders.forEach { (key, entries) ->
            if (key != null && !entries.isNullOrEmpty()) {
                values[key] = entries.first()
            }
        }
        return LinkedHashMap(values)
    }

    private fun assertJsonEquals(expectedJson: String, actualBytes: ByteArray, mapper: ObjectMapper) {
        assertTrue(actualBytes.isNotEmpty())
        assertEquals(
            mapper.readTree(expectedJson),
            mapper.readTree(String(actualBytes, StandardCharsets.UTF_8)),
        )
    }
}
`);
    }
    buildResponseHandler(plan) {
        if (plan.responseBody) {
            return [
                `val responseBytes = ${this.quote(plan.responseBody)}.toByteArray(StandardCharsets.UTF_8)`,
                'exchange.responseHeaders.set("Content-Type", "application/json")',
                `exchange.sendResponseHeaders(${plan.responseStatusCode}, responseBytes.size.toLong())`,
                'exchange.responseBody.use { output ->',
                '    output.write(responseBytes)',
                '}',
            ].join('\n');
        }
        return 'exchange.sendResponseHeaders(204, -1)';
    }
    buildAssertions(plan, expectedPath) {
        const lines = [
            `assertEquals(${this.quote(expectedPath)}, capturedPath)`,
        ];
        for (const expectation of plan.queryExpectations) {
            lines.push(`assertEquals(${this.quote(expectation.expected)}, capturedQuery[${this.quote(expectation.name)}])`);
        }
        for (const expectation of plan.headerExpectations) {
            lines.push(`assertEquals(${this.quote(expectation.expected)}, capturedHeaders[${this.quote(expectation.name)}])`);
        }
        if (plan.bodyAssertion) {
            if (plan.bodyAssertion.contentTypeMatch === 'prefix') {
                lines.push(`assertTrue(capturedContentType.startsWith(${this.quote(plan.bodyAssertion.contentType)}))`);
            }
            else {
                lines.push(`assertEquals(${this.quote(plan.bodyAssertion.contentType)}, capturedContentType)`);
            }
            if (plan.bodyAssertion.kind === 'json') {
                lines.push('assertJsonEquals(mapper.writeValueAsString(body), capturedBody, mapper)');
            }
            else {
                lines.push('assertTrue(capturedBody.isNotEmpty())');
            }
        }
        lines.push(...plan.responseAssertions);
        return lines.join('\n');
    }
    indent(content, spaces) {
        const prefix = ' '.repeat(Math.max(0, spaces));
        return content.split('\n').map((line) => (line ? `${prefix}${line}` : line)).join('\n');
    }
    quote(value) {
        return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    format(content) {
        return content.trim() + '\n';
    }
}
