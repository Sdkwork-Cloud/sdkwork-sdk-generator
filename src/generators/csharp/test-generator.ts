import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveCSharpCommonPackage } from '../../framework/common-package.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { getCSharpNamespace } from './config.js';
import {
  CSharpUsagePlanner,
  renderCSharpUsageSnippet,
  resolveCSharpExpectedRequestPath,
  type CSharpUsagePlan,
} from './usage-planner.js';

export class TestGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const planner = new CSharpUsagePlanner(ctx);
    const plan = planner.selectQuickStartPlan();
    if (!plan) {
      throw new Error('C# generateTests requires at least one API operation to build a smoke test.');
    }

    return [
      {
        path: 'Tests/GeneratedSdkSmokeTests.cs',
        content: this.generateSmokeTest(plan, config),
        language: 'csharp',
        description: 'Generated SDK smoke test',
      },
    ];
  }

  private generateSmokeTest(plan: CSharpUsagePlan, config: GeneratorConfig): string {
    const namespace = getCSharpNamespace(config);
    const commonPkg = resolveCSharpCommonPackage(config);
    const clientName = resolveSdkClientName(config);
    const expectedPath = resolveCSharpExpectedRequestPath(plan.operation.path, config.apiPrefix);
    const setupAndCall = this.indent(
      renderCSharpUsageSnippet(plan, 'test', { assignResult: plan.hasReturnValue }),
      12,
    );
    const assertions = this.indent(this.buildAssertions(plan, expectedPath), 12);
    const handlerResponse = this.indent(this.buildResponseHandler(plan), 20);
    const imports = this.buildImports({
      namespace,
      commonNamespace: commonPkg.namespace,
      usesModelNamespace: plan.usesModelNamespace,
    });

    return this.format(`namespace ${namespace}.Tests
{
${imports}

    public class GeneratedSdkSmokeTests
    {
        [Fact]
        public async Task GeneratedSdkForwardsRequestMetadata()
        {
            var capturedPath = string.Empty;
            var capturedQuery = new Dictionary<string, string>();
            var capturedHeaders = new Dictionary<string, string>();
            var capturedBody = Array.Empty<byte>();
            var capturedContentType = string.Empty;

            var port = GetFreePort();
            var baseUrl = $"http://127.0.0.1:${'$'}{port}";
            using var listener = new HttpListener();
            listener.Prefixes.Add($"{'$'}{baseUrl}/");
            listener.Start();

            var requestTask = Task.Run(async () =>
            {
                var context = await listener.GetContextAsync();
                try
                {
                    capturedPath = context.Request.Url?.AbsolutePath ?? string.Empty;
                    capturedQuery = ParseQuery(context.Request.Url?.Query);
                    capturedHeaders = FlattenHeaders(context.Request.Headers);
                    capturedContentType = context.Request.ContentType ?? string.Empty;
                    using var bodyStream = new MemoryStream();
                    await context.Request.InputStream.CopyToAsync(bodyStream);
                    capturedBody = bodyStream.ToArray();
${handlerResponse}
                }
                finally
                {
                    context.Response.OutputStream.Close();
                    listener.Stop();
                }
            });

            var config = new SdkConfig(baseUrl);
            var client = new ${clientName}(config);

${setupAndCall}

            await requestTask;

${assertions}
        }

        private static int GetFreePort()
        {
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            try
            {
                return ((IPEndPoint)listener.LocalEndpoint).Port;
            }
            finally
            {
                listener.Stop();
            }
        }

        private static Dictionary<string, string> ParseQuery(string? rawQuery)
        {
            var values = new Dictionary<string, string>();
            if (string.IsNullOrWhiteSpace(rawQuery))
            {
                return values;
            }

            foreach (var pair in rawQuery.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = pair.Split('=', 2);
                var key = WebUtility.UrlDecode(parts[0]);
                var value = parts.Length > 1 ? WebUtility.UrlDecode(parts[1]) : string.Empty;
                values[key] = value;
            }

            return values;
        }

        private static Dictionary<string, string> FlattenHeaders(System.Collections.Specialized.NameValueCollection headers)
        {
            var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var key in headers.AllKeys)
            {
                if (!string.IsNullOrWhiteSpace(key))
                {
                    values[key] = headers[key] ?? string.Empty;
                }
            }
            return values;
        }

        private static void AssertJsonEquals(string expectedJson, byte[] actualBytes)
        {
            Assert.NotEmpty(actualBytes);
            var expectedNode = JsonNode.Parse(expectedJson);
            var actualNode = JsonNode.Parse(Encoding.UTF8.GetString(actualBytes));
            Assert.True(JsonNode.DeepEquals(expectedNode, actualNode));
        }
    }
}
`);
  }

  private buildImports(options: {
    namespace: string;
    commonNamespace: string;
    usesModelNamespace: boolean;
  }): string {
    return this.indent([
      'using System;',
      'using System.Collections.Generic;',
      'using System.IO;',
      'using System.Net;',
      'using System.Net.Sockets;',
      'using System.Text;',
      'using System.Text.Json;',
      'using System.Text.Json.Nodes;',
      'using System.Threading.Tasks;',
      `using ${options.commonNamespace};`,
      'using Xunit;',
      `using ${options.namespace};`,
      options.usesModelNamespace ? `using ${options.namespace}.Models;` : '',
    ].filter(Boolean).join('\n'), 4);
  }

  private buildResponseHandler(plan: CSharpUsagePlan): string {
    if (plan.responseBody) {
      return [
        `var responseBytes = Encoding.UTF8.GetBytes(${this.quote(plan.responseBody)});`,
        `context.Response.StatusCode = ${plan.responseStatusCode};`,
        'context.Response.ContentType = "application/json";',
        'context.Response.ContentLength64 = responseBytes.Length;',
        'await context.Response.OutputStream.WriteAsync(responseBytes);',
      ].join('\n');
    }

    return 'context.Response.StatusCode = 204;';
  }

  private buildAssertions(plan: CSharpUsagePlan, expectedPath: string): string {
    const lines = [
      `Assert.Equal(${this.quote(expectedPath)}, capturedPath);`,
    ];

    for (const expectation of plan.queryExpectations) {
      lines.push(`Assert.Equal(${this.quote(expectation.expected)}, capturedQuery[${this.quote(expectation.name)}]);`);
    }
    for (const expectation of plan.headerExpectations) {
      lines.push(`Assert.Equal(${this.quote(expectation.expected)}, capturedHeaders[${this.quote(expectation.name)}]);`);
    }
    if (plan.bodyAssertion) {
      if (plan.bodyAssertion.contentTypeMatch === 'prefix') {
        lines.push(`Assert.StartsWith(${this.quote(plan.bodyAssertion.contentType)}, capturedContentType);`);
      } else {
        lines.push(`Assert.Equal(${this.quote(plan.bodyAssertion.contentType)}, capturedContentType);`);
      }
      if (plan.bodyAssertion.kind === 'json') {
        lines.push('AssertJsonEquals(JsonSerializer.Serialize(body), capturedBody);');
      } else {
        lines.push('Assert.NotEmpty(capturedBody);');
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
