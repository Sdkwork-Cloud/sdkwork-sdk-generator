import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { getRubyModuleSegments, getRubyRootRequirePath } from './config.js';
import {
  RubyUsagePlanner,
  resolveRubyExpectedRequestPath,
  type RubyUsagePlan,
} from './usage-planner.js';

export class TestGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const planner = new RubyUsagePlanner(ctx, getRubyModuleSegments(config).join('::'));
    const plan = planner.selectQuickStartPlan();
    if (!plan) {
      throw new Error('Ruby generateTests requires at least one API operation to build a smoke test.');
    }

    return [{
      path: 'test/generated_sdk_smoke_test.rb',
      content: this.generateSmokeTest(plan, config),
      language: 'ruby',
      description: 'Generated Ruby SDK smoke test',
    }];
  }

  private generateSmokeTest(plan: RubyUsagePlan, config: GeneratorConfig): string {
    const modulePrefix = getRubyModuleSegments(config).join('::');
    const clientName = resolveSdkClientName(config);
    const expectedPath = resolveRubyExpectedRequestPath(plan.operation.path, config.apiPrefix);
    const rootRequirePath = getRubyRootRequirePath(config);
    const setupLines = this.indent(plan.variables.flatMap((variable) => variable.setupByMode.test).join('\n'), 4);
    const callLine = plan.hasReturnValue ? `result = ${plan.callExpression}` : plan.callExpression;
    const assertions = this.indent(this.buildAssertions(plan, expectedPath), 4);
    const responseHeaders = plan.responseBody ? "{ 'Content-Type' => 'application/json' }" : '{}';
    const responseBody = plan.responseBody ? quoteRuby(plan.responseBody) : "''";

    return this.format(`# frozen_string_literal: true

require 'json'
require 'minitest/autorun'
require 'uri'
require 'faraday/adapter/test'
require '${rootRequirePath}'

class GeneratedSdkSmokeTest < Minitest::Test
  def test_generated_sdk_forwards_request_metadata
    captured = {}
    stubs = Faraday::Adapter::Test::Stubs.new do |stub|
      stub.${String(plan.operation.method || 'get').toLowerCase()}(${quoteRuby(expectedPath)}) do |env|
        captured[:path] = env.url.path
        captured[:query] = URI.decode_www_form(env.url.query.to_s).to_h
        captured[:headers] = env.request_headers
        captured[:body] = env.body.to_s
        captured[:content_type] = env.request_headers['Content-Type'].to_s
        [${plan.responseStatusCode}, ${responseHeaders}, ${responseBody}]
      end
    end

    config = ${modulePrefix}::SdkConfig.new(
      base_url: 'https://example.com',
      connection_options: { test_stubs: stubs }
    )
    client = ${modulePrefix}::${clientName}.new(config)

${setupLines}
    ${callLine}

    refute_empty captured
    stubs.verify_stubbed_calls

${assertions}
  end

  private

  def assert_json_equal(expected_json, actual_json)
    assert_equal JSON.parse(expected_json), JSON.parse(actual_json)
  end
end
`);
  }

  private buildAssertions(plan: RubyUsagePlan, expectedPath: string): string {
    const lines = [`assert_equal ${quoteRuby(expectedPath)}, captured[:path]`];

    for (const expectation of plan.queryExpectations) {
      lines.push(`assert_equal ${quoteRuby(expectation.expected)}, captured[:query][${quoteRuby(expectation.name)}]`);
    }
    for (const expectation of plan.headerExpectations) {
      lines.push(`assert_equal ${quoteRuby(expectation.expected)}, captured[:headers][${quoteRuby(expectation.name)}]`);
    }
    if (plan.bodyAssertion) {
      if (plan.bodyAssertion.contentTypeMatch === 'prefix') {
        lines.push(`assert captured[:content_type].start_with?(${quoteRuby(plan.bodyAssertion.contentType)})`);
      } else {
        lines.push(`assert_equal ${quoteRuby(plan.bodyAssertion.contentType)}, captured[:content_type]`);
      }
      if (plan.bodyAssertion.kind === 'json' && plan.bodyAssertion.expectedJsonExpression) {
        lines.push(`assert_json_equal(${plan.bodyAssertion.expectedJsonExpression}, captured[:body])`);
      }
      if (plan.bodyAssertion.kind === 'non-empty') {
        lines.push("refute_equal '', captured[:body]");
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

function quoteRuby(value: string): string {
  return `'${String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
