import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import {
  TypeScriptUsagePlanner,
  renderTypeScriptUsageSnippet,
  resolveTypeScriptExpectedRequestPath,
  type TypeScriptUsagePlan,
} from './usage-planner.js';

export class TestGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const planner = new TypeScriptUsagePlanner(ctx);
    const plan = planner.selectQuickStartPlan();
    if (!plan) {
      throw new Error('TypeScript generateTests requires at least one API operation to build a smoke test.');
    }

    return [
      {
        path: 'test/sdk.smoke.test.mjs',
        content: this.generateSmokeTest(plan, config),
        language: 'typescript',
        description: 'Generated SDK smoke test',
      },
    ];
  }

  private generateSmokeTest(plan: TypeScriptUsagePlan, config: GeneratorConfig): string {
    const clientName = resolveSdkClientName(config);
    const method = plan.transportMethod.toLowerCase();
    const expectedPath = resolveTypeScriptExpectedRequestPath(plan.operation.path, config.apiPrefix);
    const patchSignature = method === 'get' || method === 'delete'
      ? 'path, params, headers'
      : 'path, body, params, headers, contentType';
    const captureFields = method === 'get' || method === 'delete'
      ? 'path, params, headers'
      : 'path, body, params, headers, contentType';
    const responseValue = method === 'get' ? '[]' : '{}';
    const setupAndCall = this.indent(renderTypeScriptUsageSnippet(plan, 'test', { assignResult: false }), 2);
    const assertions = this.indent(this.buildAssertions(plan, expectedPath), 2);

    return this.format(`import test from 'node:test';
import assert from 'node:assert/strict';
import { ${clientName} } from '../dist/index.js';

test('generated SDK forwards request metadata', async () => {
  let captured;
  const client = new ${clientName}({
    baseUrl: '${this.escape(config.baseUrl)}',
    timeout: 30000,
  });

  client.http.${method} = async (${patchSignature}) => {
    captured = { ${captureFields} };
    return ${responseValue};
  };

${setupAndCall}

${assertions}
});
`);
  }

  private buildAssertions(plan: TypeScriptUsagePlan, expectedPath: string): string {
    const assertions = [
      'assert.ok(captured);',
      `assert.equal(captured.path, '${this.escape(expectedPath)}');`,
    ];

    if (plan.variables.some((variable) => variable.kind === 'body')) {
      assertions.push('assert.deepEqual(captured.body, body);');
    }
    if (plan.variables.some((variable) => variable.kind === 'params')) {
      assertions.push('assert.deepEqual(captured.params, params);');
    }
    if (plan.variables.some((variable) => variable.kind === 'headers')) {
      assertions.push('assert.deepEqual(captured.headers, headers);');
    }
    if (plan.requestBodyMediaType) {
      assertions.push(`assert.equal(captured.contentType, '${this.escape(plan.requestBodyMediaType)}');`);
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
