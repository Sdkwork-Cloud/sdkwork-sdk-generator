import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { getDartPackageName } from './config.js';
import {
  DartUsagePlanner,
  resolveDartExpectedRequestPath,
  type DartUsagePlan,
} from './usage-planner.js';

export class TestGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const planner = new DartUsagePlanner(ctx);
    const plan = planner.selectQuickStartPlan();
    if (!plan) {
      throw new Error('Dart generateTests requires at least one API operation to build a smoke test.');
    }

    return [{
      path: 'test/generated_sdk_smoke_test.dart',
      content: this.generateSmokeTest(plan, config),
      language: 'dart',
      description: 'Generated SDK smoke test',
    }];
  }

  private generateSmokeTest(plan: DartUsagePlan, config: GeneratorConfig): string {
    const packageName = getDartPackageName(config);
    const clientName = resolveSdkClientName(config);
    const expectedPath = resolveDartExpectedRequestPath(plan.operation.path, config.apiPrefix);
    const setupLines = this.indent(plan.variables.flatMap((variable) => variable.setupByMode.test).join('\n'), 4);
    const callLine = plan.hasReturnValue
      ? `final result = await ${plan.callExpression};`
      : `await ${plan.callExpression};`;
    const assertions = this.indent(this.buildAssertions(plan, expectedPath), 4);
    const responseLines = this.indent(this.buildResponseLines(plan), 8);

    return this.format(`import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:${packageName}/${packageName}.dart';
import 'package:test/test.dart';

void main() {
  test('generated sdk forwards request metadata', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    var capturedPath = '';
    var capturedQuery = <String, String>{};
    var capturedHeaders = <String, String>{};
    var capturedBody = <int>[];
    var capturedContentType = '';
    final requestHandled = Completer<void>();
    final subscription = server.listen((request) async {
      try {
        capturedPath = request.uri.path;
        capturedQuery = Map<String, String>.from(request.uri.queryParameters);
        capturedHeaders = flattenHeaders(request.headers);
        capturedBody = await readRequestBody(request);
        capturedContentType = request.headers.contentType?.toString() ?? '';
${responseLines}
      } catch (error, stackTrace) {
        if (!requestHandled.isCompleted) {
          requestHandled.completeError(error, stackTrace);
        }
      }
    });

    try {
      final client = ${clientName}(
        config: SdkConfig(
          baseUrl: 'http://127.0.0.1:\${server.port}',
        ),
      );

${setupLines}
      ${callLine}
      await requestHandled.future;

${assertions}

      client.close();
    } finally {
      await subscription.cancel();
      await server.close(force: true);
    }
  });
}

Map<String, String> flattenHeaders(HttpHeaders headers) {
  final flattened = <String, String>{};
  headers.forEach((name, values) {
    flattened[name] = values.join(',');
  });
  return flattened;
}

Future<List<int>> readRequestBody(HttpRequest request) async {
  final chunks = <int>[];
  await for (final chunk in request) {
    chunks.addAll(chunk);
  }
  return chunks;
}
`);
  }

  private buildResponseLines(plan: DartUsagePlan): string {
    const lines = [`request.response.statusCode = ${plan.responseStatusCode};`];
    if (plan.responseBody) {
      lines.push("request.response.headers.contentType = ContentType.json;");
      lines.push(`request.response.write(${this.quote(plan.responseBody)});`);
    }
    lines.push('await request.response.close();');
    lines.push('if (!requestHandled.isCompleted) {');
    lines.push('  requestHandled.complete();');
    lines.push('}');
    return lines.join('\n');
  }

  private buildAssertions(plan: DartUsagePlan, expectedPath: string): string {
    const lines = [`expect(capturedPath, ${this.quote(expectedPath)});`];

    for (const expectation of plan.queryExpectations) {
      lines.push(`expect(capturedQuery[${this.quote(expectation.name)}], ${this.quote(expectation.expected)});`);
    }
    for (const expectation of plan.headerExpectations) {
      lines.push(`expect(capturedHeaders[${this.quote(expectation.name.toLowerCase())}], ${this.quote(expectation.expected)});`);
    }
    if (plan.bodyAssertion) {
      if (plan.bodyAssertion.contentTypeMatch === 'prefix') {
        lines.push(`expect(capturedContentType.startsWith(${this.quote(plan.bodyAssertion.contentType)}), isTrue);`);
      } else {
        lines.push(`expect(capturedContentType, ${this.quote(plan.bodyAssertion.contentType)});`);
      }
      if (plan.bodyAssertion.kind === 'json' && plan.bodyAssertion.expectedJsonExpression) {
        lines.push(`expect(jsonDecode(utf8.decode(capturedBody)), ${plan.bodyAssertion.expectedJsonExpression});`);
      }
      if (plan.bodyAssertion.kind === 'non-empty') {
        lines.push('expect(capturedBody, isNotEmpty);');
      }
    }
    lines.push(...plan.responseAssertions);
    return lines.join('\n');
  }

  private quote(value: string): string {
    return `'${String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }

  private indent(content: string, spaces: number): string {
    const prefix = ' '.repeat(Math.max(0, spaces));
    return content.split('\n').map((line) => (line ? `${prefix}${line}` : line)).join('\n');
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
