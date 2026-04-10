import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import {
  buildLanguageReadmeTitle,
  buildMutuallyExclusiveAuthSection,
  buildPublishSection,
  resolveApiKeyHeaderPreview,
} from '../../framework/readme.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { getRustCrateName, getRustPackageName } from './config.js';
import { RustUsagePlanner, renderRustUsageSnippet, type RustUsagePlan } from './usage-planner.js';

export class ReadmeGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile {
    const clientName = resolveSdkClientName(config);
    const packageName = getRustPackageName(config);
    const crateName = getRustCrateName(config);
    const tags = Object.keys(ctx.apiGroups);
    const planner = new RustUsagePlanner(ctx);
    const quickStartPlan = planner.selectQuickStartPlan();
    const quickStartImports = this.buildSupportImports(crateName, quickStartPlan);
    const quickStartSnippet = quickStartPlan
      ? renderRustUsageSnippet(quickStartPlan, 'readme', { assignResult: quickStartPlan.hasReturnValue })
      : 'let result = client.example().list().await?;';
    const quickStartOutput = quickStartPlan?.hasReturnValue
      ? '\n    println!("{result:?}");'
      : '\n    println!("Request completed");';
    const errorHandlingImports = this.buildSupportImports(crateName, quickStartPlan);
    const errorHandlingSnippet = quickStartPlan
      ? renderRustUsageSnippet(quickStartPlan, 'readme', { assignResult: false })
      : 'client.example().list().await?;';
    const readmeTitle = buildLanguageReadmeTitle(config.name, 'Rust');
    const authHeaderPreview = resolveApiKeyHeaderPreview(ctx.auth);
    const authSection = buildMutuallyExclusiveAuthSection({
      codeFence: 'rust',
      modeAExample: `let client = ${clientName}::new(SdkworkConfig::new("${config.baseUrl}"))?;
client.set_api_key("your-api-key");
// Sends: ${authHeaderPreview}`,
      modeBExample: `let client = ${clientName}::new(SdkworkConfig::new("${config.baseUrl}"))?;
client.set_auth_token("your-auth-token");
client.set_access_token("your-access-token");
// Sends:
// Authorization: Bearer <authToken>
// Access-Token: <accessToken>`,
      apiKeyCall: 'set_api_key(...)',
      authTokenCall: 'set_auth_token(...)',
      accessTokenCall: 'set_access_token(...)',
    });
    const publishSection = buildPublishSection('rust');
    const modules = tags.map((tag) => `- \`client.${planner.getModuleName(tag)}()\` - ${tag} API`).join('\n');
    const examples = this.generateExamples(ctx, crateName, planner);

    return {
      path: 'README.md',
      content: this.format(`# ${readmeTitle}

${config.description || 'Professional Rust SDK for SDKWork API.'}

## Installation

\`\`\`bash
cargo add ${packageName}
\`\`\`

## Quick Start

\`\`\`rust
use ${crateName}::{${clientName}, SdkworkConfig};
${quickStartImports}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = ${clientName}::new(SdkworkConfig::new("${config.baseUrl}"))?;
    client.set_api_key("your-api-key");

${this.indent(quickStartSnippet, 4)}${quickStartOutput}
    Ok(())
}
\`\`\`

${authSection}

## Configuration (Non-Auth)

\`\`\`rust
let client = ${clientName}::new(SdkworkConfig::new("${config.baseUrl}"))?;
client.set_header("X-Custom-Header", "value");
\`\`\`

## API Modules

${modules}

## Usage Examples

${examples}

## Error Handling

\`\`\`rust
use ${crateName}::{${clientName}, SdkworkConfig};
${errorHandlingImports}

let client = ${clientName}::new(SdkworkConfig::new("${config.baseUrl}"))?;

let outcome: Result<(), _> = async {
${this.indent(errorHandlingSnippet, 4)}
    Ok(())
}.await;

match outcome {
    Ok(()) => println!("request completed"),
    Err(error) => eprintln!("request failed: {error}"),
}
\`\`\`

${publishSection}

## License

${config.license || 'MIT'}
`),
      language: 'rust',
      description: 'Rust SDK documentation',
    };
  }

  private format(content: string): string {
    return `${content.trim()}\n`;
  }

  private buildSupportImports(crateName: string, plan: RustUsagePlan | undefined): string {
    if (!plan) {
      return '';
    }

    const lines: string[] = [];
    if (plan.needsModelImport) {
      lines.push(`use ${crateName}::*;`);
    }
    if (plan.needsHashMapImport) {
      lines.push('use std::collections::HashMap;');
    }

    return lines.length > 0 ? `${lines.join('\n')}\n` : '';
  }

  private generateExamples(ctx: SchemaContext, crateName: string, planner: RustUsagePlanner): string {
    const examples: string[] = [];

    for (const tag of Object.keys(ctx.apiGroups)) {
      const plan = planner.selectPlanForTag(tag);
      if (!plan) {
        continue;
      }

      const supportImports = this.buildSupportImports(crateName, plan);
      const outputLine = plan.hasReturnValue
        ? '\nprintln!("{result:?}");'
        : '\nprintln!("Request completed");';
      examples.push(`### ${tag}

\`\`\`rust
${supportImports}// ${plan.operation.summary || `${String(plan.operation.method || '').toUpperCase()} ${plan.operation.path}`}
${renderRustUsageSnippet(plan, 'readme', { assignResult: plan.hasReturnValue })}${outputLine}
\`\`\``);
    }

    return examples.join('\n\n') || 'No examples available.';
  }

  private indent(content: string, spaces: number): string {
    const prefix = ' '.repeat(Math.max(0, spaces));
    return content.split('\n').map((line) => (line ? `${prefix}${line}` : line)).join('\n');
  }
}
