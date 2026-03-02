import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { normalizeOperationId, resolveSimplifiedTagNames, stripTagPrefixFromOperationId } from '../../framework/naming.js';
import { resolveCSharpCommonPackage } from '../../framework/common-package.js';
import {
  buildLanguageReadmeTitle,
  buildMutuallyExclusiveAuthSection,
  buildPublishSection,
  resolveApiKeyHeaderPreview,
} from '../../framework/readme.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { CSHARP_CONFIG } from './config.js';

export class ReadmeGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile {
    const namespace = CSHARP_CONFIG.namingConventions.modelName(config.sdkType);
    const clientName = resolveSdkClientName(config);
    const commonPkg = resolveCSharpCommonPackage(config);
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
    const allGroups = Object.entries(ctx.apiGroups);
    const preferredModules = new Set(['tenant', 'user', 'app', 'auth', 'workspace']);
    const quickStartTag = tags.find((tag) => preferredModules.has((resolvedTagNames.get(tag) || tag).toLowerCase()))
      || allGroups[0]?.[0];
    const quickStartGroup = quickStartTag ? (ctx.apiGroups as any)[quickStartTag] : undefined;
    const quickStartOperation = this.selectQuickStartOperation(quickStartGroup?.operations || []);
    const quickStartResolvedTagName = quickStartTag
      ? (resolvedTagNames.get(quickStartTag) || quickStartTag)
      : 'Example';
    const quickStartModule = CSHARP_CONFIG.namingConventions.modelName(quickStartResolvedTagName);
    const quickStartMethod = quickStartOperation
      ? this.generateOperationId(
        quickStartOperation.method,
        quickStartOperation.path,
        quickStartOperation,
        quickStartTag || '',
      )
      : 'List';
    
    const modules = tags.map(tag => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const propName = CSHARP_CONFIG.namingConventions.propertyName(resolvedTagName);
      return `- \`client.${propName}\` - ${tag} API`;
    }).join('\n');
    const readmeTitle = buildLanguageReadmeTitle(config.name, 'C#');

    const authHeaderPreview = resolveApiKeyHeaderPreview(ctx.auth);
    const authSection = buildMutuallyExclusiveAuthSection({
      codeFence: 'csharp',
      modeAExample: `var config = new SdkConfig("${config.baseUrl}");
var client = new ${clientName}(config);
client.SetApiKey("your-api-key");
// Sends: ${authHeaderPreview}`,
      modeBExample: `var config = new SdkConfig("${config.baseUrl}");
var client = new ${clientName}(config);
client.SetAuthToken("your-auth-token");
client.SetAccessToken("your-access-token");
// Sends:
// Authorization: Bearer <authToken>
// Access-Token: <accessToken>`,
      apiKeyCall: 'SetApiKey(...)',
      authTokenCall: 'SetAuthToken(...)',
      accessTokenCall: 'SetAccessToken(...)',
    });
    const publishSection = buildPublishSection('csharp');

    const examples = this.generateExamples(ctx, config, clientName, namespace, resolvedTagNames);

    return {
      path: 'README.md',
      content: this.format(`# ${readmeTitle}

${config.description || 'Professional C# SDK for SDKWork API.'}

## Installation

\`\`\`bash
dotnet add package ${namespace}
\`\`\`

Or add to your \`.csproj\`:

\`\`\`xml
<PackageReference Include="${namespace}" Version="${config.version}" />
\`\`\`

## Quick Start

\`\`\`csharp
using ${namespace};
using ${commonPkg.namespace};

var config = new SdkConfig("${config.baseUrl}");
var client = new ${clientName}(config);
client.SetApiKey("your-api-key");

// Use the SDK
var result = await client.${quickStartModule}.${quickStartMethod}Async();
Console.WriteLine(result);
\`\`\`

${authSection}

## Configuration (Non-Auth)

\`\`\`csharp
var config = new SdkConfig("${config.baseUrl}");
var client = new ${clientName}(config);

// Set custom headers
client.SetHeader("X-Custom-Header", "value");
\`\`\`

## API Modules

${modules}

## Usage Examples

${examples}

## Error Handling

\`\`\`csharp
try
{
    var result = await client.${quickStartModule}.${quickStartMethod}Async();
}
catch (HttpRequestException ex)
{
    Console.WriteLine($"Error: {ex.Message}");
}
\`\`\`

${publishSection}

## License

${config.license || 'MIT'}
`),
      language: 'csharp',
      description: 'SDK documentation',
    };
  }

  private generateExamples(
    ctx: SchemaContext,
    config: GeneratorConfig,
    clientName: string,
    namespace: string,
    resolvedTagNames: Map<string, string>
  ): string {
    const examples: string[] = [];
    
    for (const [tag, group] of Object.entries(ctx.apiGroups)) {
      const operations = (group as any).operations || [];
      
      if (operations.length > 0) {
        const op = operations[0];
        const methodName = this.generateOperationId(op.method, op.path, op, tag);
        const resolvedTagName = resolvedTagNames.get(tag) || tag;
        
        examples.push(`### ${tag}

\`\`\`csharp
// ${op.summary || `${op.method.toUpperCase()} ${op.path}`}
var result = await client.${CSHARP_CONFIG.namingConventions.modelName(resolvedTagName)}.${methodName}Async();
Console.WriteLine(result);
\`\`\``);
      }
    }

    return examples.join('\n\n') || 'No examples available.';
  }

  private selectQuickStartOperation(operations: any[]): any | undefined {
    if (!Array.isArray(operations) || operations.length === 0) {
      return undefined;
    }
    const getWithoutPathParam = operations.find(
      (op) => op?.method === 'get' && typeof op?.path === 'string' && !op.path.includes('{'),
    );
    if (getWithoutPathParam) {
      return getWithoutPathParam;
    }
    return operations[0];
  }

  private generateOperationId(method: string, path: string, op: any, tag: string): string {
    if (op.operationId) {
      const normalized = normalizeOperationId(op.operationId);
      return CSHARP_CONFIG.namingConventions.modelName(stripTagPrefixFromOperationId(normalized, tag));
    }
    
    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
    
    const actionMap: Record<string, string> = {
      get: path.includes('{') ? 'Get' : 'List',
      post: 'Create',
      put: 'Update',
      patch: 'Patch',
      delete: 'Delete',
    };
    
    return `${actionMap[method] || CSHARP_CONFIG.namingConventions.modelName(method)}${CSHARP_CONFIG.namingConventions.modelName(resource)}`;
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
