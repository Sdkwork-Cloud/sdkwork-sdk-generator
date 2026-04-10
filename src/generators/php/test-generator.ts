import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { getPhpNamespace } from './config.js';
import {
  PhpUsagePlanner,
  resolvePhpExpectedRequestPath,
  type PhpUsagePlan,
} from './usage-planner.js';

export class TestGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const planner = new PhpUsagePlanner(ctx);
    const plan = planner.selectQuickStartPlan();
    if (!plan) {
      throw new Error('PHP generateTests requires at least one API operation to build a smoke test.');
    }

    return [{
      path: 'tests/GeneratedSdkSmokeTest.php',
      content: this.generateSmokeTest(plan, config),
      language: 'php',
      description: 'Generated PHP SDK smoke test',
    }];
  }

  private generateSmokeTest(plan: PhpUsagePlan, config: GeneratorConfig): string {
    const namespace = getPhpNamespace(config);
    const clientName = resolveSdkClientName(config);
    const expectedPath = resolvePhpExpectedRequestPath(plan.operation.path, config.apiPrefix);
    const modelImports = plan.modelImports
      .map((modelName) => `use ${namespace}\\Models\\${modelName};`)
      .join('\n');
    const modelImportBlock = modelImports ? `${modelImports}\n` : '';
    const setupLines = this.indent(plan.variables.flatMap((variable) => variable.setupByMode.test).join('\n'), 8);
    const callLine = plan.hasReturnValue
      ? `$result = ${plan.callExpression};`
      : `${plan.callExpression};`;
    const assertions = this.indent(this.buildAssertions(plan, expectedPath), 8);
    const response = this.buildResponse(plan);

    return this.format(`<?php

declare(strict_types=1);

use GuzzleHttp\\Handler\\MockHandler;
use GuzzleHttp\\HandlerStack;
use GuzzleHttp\\Middleware;
use GuzzleHttp\\Psr7\\Response;
use PHPUnit\\Framework\\TestCase;
use ${namespace}\\${clientName};
use ${namespace}\\SdkConfig;
${modelImportBlock}
final class GeneratedSdkSmokeTest extends TestCase
{
    public function testGeneratedSdkForwardsRequestMetadata(): void
    {
        $history = [];
        $mock = new MockHandler([
${this.indent(response, 12)}
        ]);
        $handlerStack = HandlerStack::create($mock);
        $handlerStack->push(Middleware::history($history));

        $config = new SdkConfig(
            baseUrl: 'https://example.com',
            transportOptions: ['handler' => $handlerStack],
        );
        $client = new ${clientName}($config);

${setupLines}
        ${callLine}

        self::assertNotEmpty($history);
        $request = $history[0]['request'];
        $query = [];
        parse_str($request->getUri()->getQuery(), $query);

${assertions}
    }
}
`);
  }

  private buildResponse(plan: PhpUsagePlan): string {
    const headers = plan.responseBody ? "['Content-Type' => 'application/json']" : '[]';
    const body = plan.responseBody ? quotePhpString(plan.responseBody) : "''";
    return `new Response(${plan.responseStatusCode}, ${headers}, ${body}),`;
  }

  private buildAssertions(plan: PhpUsagePlan, expectedPath: string): string {
    const lines = [`self::assertSame(${quotePhpString(expectedPath)}, $request->getUri()->getPath());`];

    for (const expectation of plan.queryExpectations) {
      lines.push(`self::assertSame(${quotePhpString(expectation.expected)}, $query[${quotePhpString(expectation.name)}] ?? null);`);
    }
    for (const expectation of plan.headerExpectations) {
      lines.push(`self::assertSame(${quotePhpString(expectation.expected)}, $request->getHeaderLine(${quotePhpString(expectation.name)}));`);
    }
    if (plan.bodyAssertion) {
      if (plan.bodyAssertion.contentTypeMatch === 'prefix') {
        lines.push(`self::assertStringStartsWith(${quotePhpString(plan.bodyAssertion.contentType)}, $request->getHeaderLine('Content-Type'));`);
      } else {
        lines.push(`self::assertSame(${quotePhpString(plan.bodyAssertion.contentType)}, $request->getHeaderLine('Content-Type'));`);
      }
      if (plan.bodyAssertion.kind === 'json' && plan.bodyAssertion.expectedJsonExpression) {
        lines.push(`self::assertJsonStringEqualsJsonString(${plan.bodyAssertion.expectedJsonExpression}, (string) $request->getBody());`);
      }
      if (plan.bodyAssertion.kind === 'non-empty') {
        lines.push("self::assertNotSame('', (string) $request->getBody());");
      }
    }
    lines.push(...plan.responseAssertions);
    return lines.join('\n');
  }

  private indent(content: string, spaces: number): string {
    const prefix = ' '.repeat(Math.max(0, spaces));
    return content.split('\n').map((line) => (line ? `${prefix}${line}` : line)).join('\n');
  }

  private format(content: string): string {
    return `${content.trim()}\n`;
  }
}

function quotePhpString(value: string): string {
  return `'${String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
