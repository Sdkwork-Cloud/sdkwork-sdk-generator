import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { getPythonPackageRoot } from './config.js';
import {
  PythonUsagePlanner,
  renderPythonUsageSnippet,
  resolvePythonExpectedRequestPath,
  type PythonUsagePlan,
} from './usage-planner.js';

export class TestGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const planner = new PythonUsagePlanner(ctx);
    const plan = planner.selectQuickStartPlan();
    if (!plan) {
      throw new Error('Python generateTests requires at least one API operation to build a smoke test.');
    }

    return [
      {
        path: 'tests/test_sdk_smoke.py',
        content: this.generateSmokeTest(plan, config),
        language: 'python',
        description: 'Generated SDK smoke test',
      },
    ];
  }

  private generateSmokeTest(plan: PythonUsagePlan, config: GeneratorConfig): string {
    const clientName = resolveSdkClientName(config);
    const packageRoot = getPythonPackageRoot(config);
    const method = plan.transportMethod.toLowerCase();
    const expectedPath = resolvePythonExpectedRequestPath(plan.operation.path, config.apiPrefix);
    const setupAndCall = this.indent(renderPythonUsageSnippet(plan, 'test', { assignResult: false }), 4);
    const assertions = this.indent(this.buildAssertions(plan, expectedPath), 4);
    const fakeMethod = this.indent(this.buildFakeMethod(plan), 4);
    const responseValue = method === 'get' ? '[]' : '{}';

    return this.format(`from ${packageRoot} import ${clientName}, SdkConfig


def test_generated_sdk_forwards_request_metadata():
    captured = {}
    client = ${clientName}(SdkConfig(base_url='${this.escape(config.baseUrl)}'))

${fakeMethod}

    client.http.${method} = fake_${method}

${setupAndCall}

${assertions}
`);
  }

  private buildFakeMethod(plan: PythonUsagePlan): string {
    const method = plan.transportMethod.toLowerCase();
    const captureLines = [
      "captured['path'] = path",
    ];

    const hasBody = plan.variables.some((variable) => variable.kind === 'body');
    const usesData = plan.requestBodyMediaType?.toLowerCase() === 'multipart/form-data'
      || plan.requestBodyMediaType?.toLowerCase() === 'application/x-www-form-urlencoded';

    if (hasBody) {
      captureLines.push(usesData ? "captured['data'] = data" : "captured['json'] = json");
    }
    if (plan.variables.some((variable) => variable.kind === 'params')) {
      captureLines.push("captured['params'] = params");
    }
    if (plan.variables.some((variable) => variable.kind === 'headers')) {
      captureLines.push("captured['headers'] = headers");
    }

    const body = this.indent(captureLines.join('\n'), 4);
    const responseValue = method === 'get' ? '[]' : '{}';
    const signature = hasBody
      ? 'path, json=None, data=None, params=None, headers=None'
      : 'path, params=None, headers=None';

    return `def fake_${method}(${signature}):\n${body}\n    return ${responseValue}`;
  }

  private buildAssertions(plan: PythonUsagePlan, expectedPath: string): string {
    const assertions = [
      'assert captured',
      `assert captured['path'] == '${this.escape(expectedPath)}'`,
    ];

    if (plan.variables.some((variable) => variable.kind === 'body')) {
      const usesData = plan.requestBodyMediaType?.toLowerCase() === 'multipart/form-data'
        || plan.requestBodyMediaType?.toLowerCase() === 'application/x-www-form-urlencoded';
      assertions.push(usesData ? "assert captured['data'] == body" : "assert captured['json'] == body");
    }
    if (plan.variables.some((variable) => variable.kind === 'params')) {
      assertions.push("assert captured['params'] == params");
    }
    if (plan.variables.some((variable) => variable.kind === 'headers')) {
      assertions.push("assert captured['headers'] == headers");
    }

    return assertions.join('\n');
  }

  private indent(content: string, spaces: number): string {
    const prefix = ' '.repeat(Math.max(0, spaces));
    return content
      .split('\n')
      .map((line) => (line ? `${prefix}${line}` : line))
      .join('\n');
  }

  private escape(value: string): string {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
