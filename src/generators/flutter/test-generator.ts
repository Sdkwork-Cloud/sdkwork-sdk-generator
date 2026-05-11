import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { getFlutterPackageName } from './config.js';
import {
  FlutterUsagePlanner,
  resolveFlutterExpectedRequestPath,
  type FlutterUsagePlan,
} from './usage-planner.js';

export class TestGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const planner = new FlutterUsagePlanner(ctx, undefined, config);
    const plan = planner.selectQuickStartPlan();
    if (!plan) {
      throw new Error('Flutter generateTests requires at least one API operation to build a smoke test.');
    }

    return [{
      path: 'test/generated_sdk_smoke_test.dart',
      content: this.generateSmokeTest(plan, config),
      language: 'flutter',
      description: 'Generated Flutter SDK smoke test',
    }];
  }

  private generateSmokeTest(plan: FlutterUsagePlan, config: GeneratorConfig): string {
    const packageName = getFlutterPackageName(config);
    const clientName = resolveSdkClientName(config);
    const expectedPath = resolveFlutterExpectedRequestPath(plan.operation.path, config.apiPrefix);
    const setupLines = this.indent(plan.variables.flatMap((variable) => variable.setupByMode.test).join('\n'), 4);
    const callLine = plan.hasReturnValue
      ? `final result = await ${plan.callExpression};`
      : `await ${plan.callExpression};`;
    const assertions = this.indent(this.buildAssertions(plan, expectedPath), 4);
    const responseLines = this.indent(this.buildResponseLines(plan), 8);
    const needsJsonImport = Boolean(plan.bodyAssertion?.kind === 'json' && plan.bodyAssertion.expectedJsonExpression);
    const needsQueryCapture = plan.queryExpectations.length > 0;
    const needsHeaderCapture = plan.headerExpectations.length > 0;
    const needsBodyCapture = Boolean(plan.bodyAssertion);
    const needsContentTypeCapture = Boolean(plan.bodyAssertion?.contentType);
    const capturedQueryDeclaration = needsQueryCapture ? '    var capturedQuery = <String, String>{};\n' : '';
    const capturedHeadersDeclaration = needsHeaderCapture ? '    var capturedHeaders = <String, String>{};\n' : '';
    const capturedBodyDeclaration = needsBodyCapture ? '    var capturedBody = <int>[];\n' : '';
    const capturedContentTypeDeclaration = needsContentTypeCapture ? "    var capturedContentType = '';\n" : '';
    const capturedQueryAssignment = needsQueryCapture ? '        capturedQuery = Map<String, String>.from(request.uri.queryParameters);\n' : '';
    const capturedHeadersAssignment = needsHeaderCapture ? '        capturedHeaders = flattenHeaders(request.headers);\n' : '';
    const capturedBodyAssignment = needsBodyCapture ? '        capturedBody = await readRequestBody(request);\n' : '';
    const capturedContentTypeAssignment = needsContentTypeCapture ? "        capturedContentType = request.headers.contentType?.toString() ?? '';\n" : '';
    const helperBlocks = [
      needsHeaderCapture ? this.flattenHeadersHelper() : '',
      needsBodyCapture ? this.readRequestBodyHelper() : '',
    ].filter(Boolean).join('\n\n');

    return this.format(`import 'dart:async';
${needsJsonImport ? "import 'dart:convert';\n" : ''}import 'dart:io';

import 'package:${packageName}/${packageName}.dart';
import 'package:test/test.dart';

void main() {
  test('generated sdk forwards request metadata', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    var capturedPath = '';
${capturedQueryDeclaration}${capturedHeadersDeclaration}${capturedBodyDeclaration}${capturedContentTypeDeclaration}    final requestHandled = Completer<void>();
    final subscription = server.listen((request) async {
      try {
        capturedPath = request.uri.path;
${capturedQueryAssignment}${capturedHeadersAssignment}${capturedBodyAssignment}${capturedContentTypeAssignment}${responseLines}
      } catch (error, stackTrace) {
        if (!requestHandled.isCompleted) {
          requestHandled.completeError(error, stackTrace);
        }
      }
    });

    try {
      final client = ${clientName}.withBaseUrl(baseUrl: 'http://127.0.0.1:\${server.port}');

${setupLines}
      ${callLine}
      await requestHandled.future;

${assertions}
    } finally {
      await subscription.cancel();
      await server.close(force: true);
    }
  });
}
${helperBlocks ? `\n${helperBlocks}` : ''}
`);
  }

  private buildResponseLines(plan: FlutterUsagePlan): string {
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

  private buildAssertions(plan: FlutterUsagePlan, expectedPath: string): string {
    const lines = [`expect(capturedPath, ${this.quote(expectedPath)});`];

    for (const expectation of plan.queryExpectations) {
      lines.push(`expect(capturedQuery[${this.quote(expectation.name)}], ${this.quote(expectation.expected)});`);
    }
    for (const expectation of plan.headerExpectations) {
      if (expectation.cookie) {
        const source = expectation.source || this.quote(expectation.expected);
        lines.push(`expect(capturedHeaders['cookie'], '${this.escapeSingleQuoted(`${expectation.expected}=`)}\${Uri.encodeQueryComponent(${source})}');`);
      } else if (expectation.source) {
        lines.push(`expect(capturedHeaders[${this.quote(expectation.name.toLowerCase())}], ${expectation.source});`);
      } else {
        lines.push(`expect(capturedHeaders[${this.quote(expectation.name.toLowerCase())}], ${this.quote(expectation.expected)});`);
      }
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

  private escapeSingleQuoted(value: string): string {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private indent(content: string, spaces: number): string {
    const prefix = ' '.repeat(Math.max(0, spaces));
    return content.split('\n').map((line) => (line ? `${prefix}${line}` : line)).join('\n');
  }

  private flattenHeadersHelper(): string {
    return `Map<String, String> flattenHeaders(HttpHeaders headers) {
  final flattened = <String, String>{};
  headers.forEach((name, values) {
    flattened[name] = values.join(',');
  });
  return flattened;
}`;
  }

  private readRequestBodyHelper(): string {
    return `Future<List<int>> readRequestBody(HttpRequest request) async {
  final chunks = <int>[];
  await for (final chunk in request) {
    chunks.addAll(chunk);
  }
  return chunks;
}`;
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
