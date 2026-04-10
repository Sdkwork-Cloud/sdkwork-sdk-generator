import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import {
  GoUsagePlanner,
  renderGoUsageSnippet,
  resolveGoExpectedRequestPath,
  type GoUsagePlan,
} from './usage-planner.js';

export class TestGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const planner = new GoUsagePlanner(ctx);
    const plan = planner.selectQuickStartPlan();
    if (!plan) {
      throw new Error('Go generateTests requires at least one API operation to build a smoke test.');
    }

    return [
      {
        path: 'sdk_smoke_test.go',
        content: this.generateSmokeTest(plan, config),
        language: 'go',
        description: 'Generated SDK smoke test',
      },
    ];
  }

  private generateSmokeTest(plan: GoUsagePlan, config: GeneratorConfig): string {
    const moduleName = config.packageName || `github.com/sdkwork/${config.sdkType}-sdk`;
    const moduleAlias = config.sdkType;
    const clientName = resolveSdkClientName(config);
    const expectedPath = resolveGoExpectedRequestPath(plan.operation.path, config.apiPrefix);
    const hasBody = Boolean(plan.bodyAssertion);
    const hasQuery = plan.queryExpectations.length > 0;
    const hasHeaders = plan.headerExpectations.length > 0;
    const usesJsonHelpers = plan.bodyAssertion?.kind === 'json';
    const usesMultipartPrefixCheck = plan.bodyAssertion?.contentTypeMatch === 'prefix';
    const setupAndCall = this.indent(renderGoUsageSnippet(plan, 'test', { resultBinding: '_' }), 1);
    const imports = this.buildImports({
      moduleAlias,
      moduleName,
      usesTypesImport: plan.requiresTypesImport,
      hasBody,
      hasQuery,
      usesJsonHelpers,
      usesMultipartPrefixCheck,
    });
    const captureDeclarations = this.buildCaptureDeclarations({ hasBody, hasHeaders, hasQuery });
    const handlerLines = this.buildHandlerLines({ hasBody, hasHeaders, hasQuery });
    const assertions = this.buildAssertions(plan, expectedPath);
    const helpers = usesJsonHelpers ? `\n${this.renderJsonHelpers()}` : '';

    return this.format(`package ${config.sdkType}_test

import (
${imports}
)

func TestGeneratedSdkForwardsRequestMetadata(t *testing.T) {
${captureDeclarations}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
${handlerLines}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	cfg := sdkhttp.NewDefaultConfig(server.URL)
	client := ${moduleAlias}.New${clientName}WithConfig(cfg)

${setupAndCall}
	if err != nil {
		t.Fatalf("expected generated SDK call to succeed: %v", err)
	}

${assertions}
}
${helpers}`);
  }

  private buildImports(options: {
    moduleAlias: string;
    moduleName: string;
    usesTypesImport: boolean;
    hasBody: boolean;
    hasQuery: boolean;
    usesJsonHelpers: boolean;
    usesMultipartPrefixCheck: boolean;
  }): string {
    return [
      options.usesJsonHelpers ? '\t"encoding/json"' : '',
      options.hasBody ? '\t"io"' : '',
      '\t"net/http"',
      '\t"net/http/httptest"',
      options.hasQuery ? '\t"net/url"' : '',
      options.usesJsonHelpers ? '\t"reflect"' : '',
      options.usesMultipartPrefixCheck ? '\t"strings"' : '',
      '\t"testing"',
      '',
      `\t${options.moduleAlias} "${options.moduleName}"`,
      `\tsdkhttp "${options.moduleName}/http"`,
      options.usesTypesImport ? `\tsdktypes "${options.moduleName}/types"` : '',
    ].filter(Boolean).join('\n');
  }

  private buildCaptureDeclarations(options: {
    hasBody: boolean;
    hasHeaders: boolean;
    hasQuery: boolean;
  }): string {
    const lines = ['\tvar capturedPath string'];
    if (options.hasQuery) {
      lines.push('\tvar capturedQuery url.Values');
    }
    if (options.hasHeaders) {
      lines.push('\tvar capturedHeaders http.Header');
    }
    if (options.hasBody) {
      lines.push('\tvar capturedBody []byte');
      lines.push('\tvar capturedContentType string');
    }
    return lines.join('\n');
  }

  private buildHandlerLines(options: {
    hasBody: boolean;
    hasHeaders: boolean;
    hasQuery: boolean;
  }): string {
    const lines = ['\t\tcapturedPath = r.URL.Path'];
    if (options.hasQuery) {
      lines.push('\t\tcapturedQuery = r.URL.Query()');
    }
    if (options.hasHeaders) {
      lines.push('\t\tcapturedHeaders = r.Header.Clone()');
    }
    if (options.hasBody) {
      lines.push('\t\tcapturedContentType = r.Header.Get("Content-Type")');
      lines.push('\t\tbody, err := io.ReadAll(r.Body)');
      lines.push('\t\tif err != nil {');
      lines.push('\t\t\tt.Fatalf("failed to read request body: %v", err)');
      lines.push('\t\t}');
      lines.push('\t\tcapturedBody = body');
    }
    return lines.join('\n');
  }

  private buildAssertions(plan: GoUsagePlan, expectedPath: string): string {
    const lines = [
      `\tif capturedPath != ${this.quote(expectedPath)} {`,
      `\t\tt.Fatalf("expected path %s, got %s", ${this.quote(expectedPath)}, capturedPath)`,
      '\t}',
    ];

    for (const expectation of plan.queryExpectations) {
      lines.push(
        `\tif capturedQuery.Get(${this.quote(expectation.name)}) != ${this.quote(expectation.expected)} {`,
        `\t\tt.Fatalf("expected query %s=%s, got %s", ${this.quote(expectation.name)}, ${this.quote(expectation.expected)}, capturedQuery.Get(${this.quote(expectation.name)}))`,
        '\t}',
      );
    }

    for (const expectation of plan.headerExpectations) {
      lines.push(
        `\tif capturedHeaders.Get(${this.quote(expectation.name)}) != ${this.quote(expectation.expected)} {`,
        `\t\tt.Fatalf("expected header %s=%s, got %s", ${this.quote(expectation.name)}, ${this.quote(expectation.expected)}, capturedHeaders.Get(${this.quote(expectation.name)}))`,
        '\t}',
      );
    }

    if (plan.bodyAssertion) {
      if (plan.bodyAssertion.contentTypeMatch === 'prefix') {
        lines.push(
          `\tif !strings.HasPrefix(capturedContentType, ${this.quote(plan.bodyAssertion.contentType)}) {`,
          `\t\tt.Fatalf("expected content type prefix %s, got %s", ${this.quote(plan.bodyAssertion.contentType)}, capturedContentType)`,
          '\t}',
        );
      } else {
        lines.push(
          `\tif capturedContentType != ${this.quote(plan.bodyAssertion.contentType)} {`,
          `\t\tt.Fatalf("expected content type %s, got %s", ${this.quote(plan.bodyAssertion.contentType)}, capturedContentType)`,
          '\t}',
        );
      }

      if (plan.bodyAssertion.kind === 'json') {
        lines.push('\tassertJSONEqual(t, marshalJSON(t, body), capturedBody)');
      } else {
        lines.push('\tif len(capturedBody) == 0 {');
        lines.push('\t\tt.Fatal("expected non-empty request body")');
        lines.push('\t}');
      }
    }

    return lines.join('\n');
  }

  private renderJsonHelpers(): string {
    return this.format(`func marshalJSON(t *testing.T, value interface{}) []byte {
\tt.Helper()
\tpayload, err := json.Marshal(value)
\tif err != nil {
\t\tt.Fatalf("failed to marshal expected JSON body: %v", err)
\t}
\treturn payload
}

func assertJSONEqual(t *testing.T, expected []byte, actual []byte) {
\tt.Helper()
\tif len(actual) == 0 {
\t\tt.Fatal("expected request body, got empty body")
\t}

\tvar expectedValue interface{}
\tif err := json.Unmarshal(expected, &expectedValue); err != nil {
\t\tt.Fatalf("failed to unmarshal expected JSON body: %v", err)
\t}

\tvar actualValue interface{}
\tif err := json.Unmarshal(actual, &actualValue); err != nil {
\t\tt.Fatalf("failed to unmarshal actual JSON body: %v", err)
\t}

\tif !reflect.DeepEqual(expectedValue, actualValue) {
\t\tt.Fatalf("expected JSON body %s, got %s", string(expected), string(actual))
\t}
}`);
  }

  private indent(content: string, tabs: number): string {
    const prefix = '\t'.repeat(Math.max(0, tabs));
    return content
      .split('\n')
      .map((line) => (line ? `${prefix}${line}` : line))
      .join('\n');
  }

  private quote(value: string): string {
    return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
