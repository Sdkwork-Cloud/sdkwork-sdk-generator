import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveJvmCommonPackage } from '../../framework/common-package.js';
import { resolveJvmSdkIdentity } from '../../framework/jvm-sdk-identity.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import {
  JavaUsagePlanner,
  renderJavaUsageSnippet,
  resolveJavaExpectedRequestPath,
  type JavaUsagePlan,
} from './usage-planner.js';

export class TestGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const planner = new JavaUsagePlanner(ctx);
    const plan = planner.selectQuickStartPlan();
    if (!plan) {
      throw new Error('Java generateTests requires at least one API operation to build a smoke test.');
    }

    const identity = resolveJvmSdkIdentity(config);
    return [
      {
        path: `src/test/java/${identity.packagePath}/GeneratedSdkSmokeTest.java`,
        content: this.generateSmokeTest(plan, config, identity.packageRoot),
        language: 'java',
        description: 'Generated SDK smoke test',
      },
    ];
  }

  private generateSmokeTest(plan: JavaUsagePlan, config: GeneratorConfig, packageRoot: string): string {
    const commonPkg = resolveJvmCommonPackage(config);
    const clientName = resolveSdkClientName(config);
    const expectedPath = resolveJavaExpectedRequestPath(plan.operation.path, config.apiPrefix);
    const setupAndCall = this.indent(
      renderJavaUsageSnippet(plan, 'test', { assignResult: plan.hasReturnValue }),
      12,
    );
    const assertions = this.indent(this.buildAssertions(plan, expectedPath), 12);
    const imports = this.buildImports({
      packageRoot,
      commonImportRoot: commonPkg.importRoot,
      usesModelPackage: plan.usesModelPackage,
    });
    const handlerResponse = this.indent(this.buildResponseHandler(plan), 16);

    return this.format(`package ${packageRoot};

${imports}

public class GeneratedSdkSmokeTest {
    @Test
    void generatedSdkForwardsRequestMetadata() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        AtomicReference<String> capturedPath = new AtomicReference<>();
        Map<String, String> capturedQuery = new LinkedHashMap<>();
        Map<String, String> capturedHeaders = new LinkedHashMap<>();
        AtomicReference<byte[]> capturedBody = new AtomicReference<>(new byte[0]);
        AtomicReference<String> capturedContentType = new AtomicReference<>("");

        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", exchange -> {
            try {
                capturedPath.set(exchange.getRequestURI().getPath());
                capturedQuery.clear();
                capturedQuery.putAll(parseQuery(exchange.getRequestURI().getRawQuery()));
                capturedHeaders.clear();
                capturedHeaders.putAll(flattenHeaders(exchange));
                String contentType = exchange.getRequestHeaders().getFirst("Content-Type");
                capturedContentType.set(contentType == null ? "" : contentType);
                capturedBody.set(exchange.getRequestBody().readAllBytes());
${handlerResponse}
            } catch (Exception exception) {
                throw new RuntimeException(exception);
            } finally {
                exchange.close();
            }
        });
        server.start();

        try {
            String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
            Types.SdkConfig config = new Types.SdkConfig(baseUrl);
            ${clientName} client = new ${clientName}(config);

${setupAndCall}

${assertions}
        } finally {
            server.stop(0);
        }
    }

    private static Map<String, String> parseQuery(String rawQuery) {
        Map<String, String> values = new LinkedHashMap<>();
        if (rawQuery == null || rawQuery.isBlank()) {
            return values;
        }
        for (String pair : rawQuery.split("&")) {
            if (pair == null || pair.isBlank()) {
                continue;
            }
            String[] parts = pair.split("=", 2);
            String key = URLDecoder.decode(parts[0], StandardCharsets.UTF_8);
            String value = parts.length > 1 ? URLDecoder.decode(parts[1], StandardCharsets.UTF_8) : "";
            values.put(key, value);
        }
        return values;
    }

    private static Map<String, String> flattenHeaders(HttpExchange exchange) {
        Map<String, String> values = new LinkedHashMap<>();
        exchange.getRequestHeaders().forEach((key, entries) -> {
            if (key != null && entries != null && !entries.isEmpty()) {
                values.put(key, entries.get(0));
            }
        });
        return values;
    }

    private static void assertJsonEquals(String expectedJson, byte[] actualBytes, ObjectMapper mapper) throws Exception {
        assertTrue(actualBytes != null && actualBytes.length > 0);
        assertEquals(
            mapper.readTree(expectedJson),
            mapper.readTree(new String(actualBytes, StandardCharsets.UTF_8))
        );
    }
}
`);
  }

  private buildImports(options: {
    packageRoot: string;
    commonImportRoot: string;
    usesModelPackage: boolean;
  }): string {
    return [
      `import ${options.commonImportRoot}.Types;`,
      options.usesModelPackage ? `import ${options.packageRoot}.model.*;` : '',
      'import com.fasterxml.jackson.databind.ObjectMapper;',
      'import com.sun.net.httpserver.HttpExchange;',
      'import com.sun.net.httpserver.HttpServer;',
      'import org.junit.jupiter.api.Test;',
      '',
      'import java.io.OutputStream;',
      'import java.net.InetSocketAddress;',
      'import java.net.URLDecoder;',
      'import java.nio.charset.StandardCharsets;',
      'import java.util.LinkedHashMap;',
      'import java.util.Map;',
      'import java.util.concurrent.atomic.AtomicReference;',
      '',
      'import static org.junit.jupiter.api.Assertions.*;',
    ].filter(Boolean).join('\n');
  }

  private buildResponseHandler(plan: JavaUsagePlan): string {
    if (plan.responseBody) {
      return [
        `byte[] responseBytes = ${this.quote(plan.responseBody)}.getBytes(StandardCharsets.UTF_8);`,
        'exchange.getResponseHeaders().set("Content-Type", "application/json");',
        `exchange.sendResponseHeaders(${plan.responseStatusCode}, responseBytes.length);`,
        'try (OutputStream output = exchange.getResponseBody()) {',
        '    output.write(responseBytes);',
        '}',
      ].join('\n');
    }

    return 'exchange.sendResponseHeaders(204, -1);';
  }

  private buildAssertions(plan: JavaUsagePlan, expectedPath: string): string {
    const lines = [
      `assertEquals(${this.quote(expectedPath)}, capturedPath.get());`,
    ];

    for (const expectation of plan.queryExpectations) {
      lines.push(`assertEquals(${this.quote(expectation.expected)}, capturedQuery.get(${this.quote(expectation.name)}));`);
    }
    for (const expectation of plan.headerExpectations) {
      lines.push(`assertEquals(${this.quote(expectation.expected)}, capturedHeaders.get(${this.quote(expectation.name)}));`);
    }
    if (plan.bodyAssertion) {
      if (plan.bodyAssertion.contentTypeMatch === 'prefix') {
        lines.push(`assertTrue(capturedContentType.get().startsWith(${this.quote(plan.bodyAssertion.contentType)}));`);
      } else {
        lines.push(`assertEquals(${this.quote(plan.bodyAssertion.contentType)}, capturedContentType.get());`);
      }
      if (plan.bodyAssertion.kind === 'json') {
        lines.push('assertJsonEquals(mapper.writeValueAsString(body), capturedBody.get(), mapper);');
      } else {
        lines.push('assertTrue(capturedBody.get().length > 0);');
      }
    }
    lines.push(...plan.responseAssertions);
    return lines.join('\n');
  }

  private indent(content: string, spaces: number): string {
    const prefix = ' '.repeat(Math.max(0, spaces));
    return content.split('\n').map((line) => (line ? `${prefix}${line}` : line)).join('\n');
  }

  private quote(value: string): string {
    return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
