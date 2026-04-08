import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import {
  buildLanguageReadmeTitle,
  buildMutuallyExclusiveAuthSection,
  buildPublishSection,
  resolveApiKeyHeaderPreview,
} from '../../framework/readme.js';
import { normalizeOperationId, resolveSimplifiedTagNames, stripTagPrefixFromOperationId } from '../../framework/naming.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { RUST_CONFIG, getRustCrateName, getRustPackageName } from './config.js';

export class ReadmeGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile {
    const clientName = resolveSdkClientName(config);
    const packageName = getRustPackageName(config);
    const crateName = getRustCrateName(config);
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
    const allGroups = Object.entries(ctx.apiGroups);
    const preferredModules = new Set(['tenant', 'user', 'app', 'auth', 'workspace']);
    const quickStartTag = tags.find((tag) => preferredModules.has((resolvedTagNames.get(tag) || tag).toLowerCase()))
      || allGroups[0]?.[0];
    const quickStartGroup = quickStartTag ? ctx.apiGroups[quickStartTag] : undefined;
    const quickStartOperation = this.selectQuickStartOperation(quickStartGroup?.operations || []);
    const quickStartModule = quickStartTag
      ? RUST_CONFIG.namingConventions.propertyName(resolvedTagNames.get(quickStartTag) || quickStartTag)
      : 'example';
    const quickStartMethod = quickStartOperation
      ? this.generateOperationId(
        quickStartOperation.method,
        quickStartOperation.path,
        quickStartOperation,
        quickStartTag || ''
      )
      : 'list';
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
    const modules = tags.map((tag) => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const getter = RUST_CONFIG.namingConventions.propertyName(resolvedTagName);
      return `- \`client.${getter}()\` - ${tag} API`;
    }).join('\n');

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

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = ${clientName}::new(SdkworkConfig::new("${config.baseUrl}"))?;
    client.set_api_key("your-api-key");

    let result = client.${quickStartModule}().${quickStartMethod}().await?;
    println!("{result:?}");
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

## Error Handling

\`\`\`rust
match client.${quickStartModule}().${quickStartMethod}().await {
    Ok(result) => println!("{result:?}"),
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

  private selectQuickStartOperation(operations: any[]): any | undefined {
    if (!Array.isArray(operations) || operations.length === 0) {
      return undefined;
    }
    const getWithoutPathParam = operations.find(
      (op) => op?.method === 'get' && typeof op?.path === 'string' && !op.path.includes('{')
    );
    if (getWithoutPathParam) {
      return getWithoutPathParam;
    }
    return operations[0];
  }

  private generateOperationId(method: string, path: string, op: any, tag: string): string {
    if (op.operationId) {
      const normalized = normalizeOperationId(op.operationId);
      return toSnakeCase(stripTagPrefixFromOperationId(normalized, tag));
    }

    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
    const actionMap: Record<string, string> = {
      get: path.includes('{') ? 'get' : 'list',
      post: 'create',
      put: 'update',
      patch: 'patch',
      delete: 'delete',
    };

    return toSnakeCase(`${actionMap[method] || method}_${resource}`);
  }

  private format(content: string): string {
    return `${content.trim()}\n`;
  }
}

function toSnakeCase(value: string): string {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}
