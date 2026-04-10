import { resolveCSharpCommonPackage } from '../../framework/common-package.js';
import { buildLanguageReadmeTitle, buildMutuallyExclusiveAuthSection, buildPublishSection, resolveApiKeyHeaderPreview, } from '../../framework/readme.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { getCSharpNamespace, getCSharpPackageId } from './config.js';
import { CSharpUsagePlanner, renderCSharpUsageSnippet } from './usage-planner.js';
export class ReadmeGenerator {
    generate(ctx, config) {
        const namespace = getCSharpNamespace(config);
        const packageId = getCSharpPackageId(config);
        const clientName = resolveSdkClientName(config);
        const commonPkg = resolveCSharpCommonPackage(config);
        const tags = Object.keys(ctx.apiGroups);
        const planner = new CSharpUsagePlanner(ctx);
        const quickStartPlan = planner.selectQuickStartPlan();
        const quickStartSnippet = quickStartPlan
            ? renderCSharpUsageSnippet(quickStartPlan, 'readme', { assignResult: quickStartPlan.hasReturnValue })
            : 'await client.Example.ListAsync();';
        const quickStartResultLog = quickStartPlan?.hasReturnValue ? '\nConsole.WriteLine(result);' : '';
        const quickStartNeedsCollections = /Dictionary<|List</.test(quickStartSnippet);
        const quickStartCollectionUsing = quickStartNeedsCollections ? 'using System.Collections.Generic;\n' : '';
        const quickStartModelUsing = quickStartPlan?.usesModelNamespace ? `using ${namespace}.Models;\n` : '';
        const modules = tags.map(tag => {
            const propName = planner.getModuleName(tag);
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
        const examples = this.generateExamples(ctx, planner);
        const errorHandlingSnippet = quickStartPlan
            ? renderCSharpUsageSnippet(quickStartPlan, 'readme', { assignResult: false })
            : 'await client.Example.ListAsync();';
        return {
            path: 'README.md',
            content: this.format(`# ${readmeTitle}

${config.description || 'Professional C# SDK for SDKWork API.'}

## Installation

\`\`\`bash
dotnet add package ${packageId}
\`\`\`

Or add to your \`.csproj\`:

\`\`\`xml
<PackageReference Include="${packageId}" Version="${config.version}" />
\`\`\`

## Quick Start

\`\`\`csharp
${quickStartCollectionUsing}${quickStartModelUsing}using ${namespace};
using ${commonPkg.namespace};

var config = new SdkConfig("${config.baseUrl}");
var client = new ${clientName}(config);
client.SetApiKey("your-api-key");

${quickStartSnippet}${quickStartResultLog}
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
${this.indent(errorHandlingSnippet, 4)}
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
    generateExamples(ctx, planner) {
        const examples = [];
        for (const [tag] of Object.entries(ctx.apiGroups)) {
            const plan = planner.selectPlanForTag(tag);
            if (plan) {
                const usageSnippet = renderCSharpUsageSnippet(plan, 'readme', { assignResult: plan.hasReturnValue });
                examples.push(`### ${tag}

\`\`\`csharp
// ${plan.operation.summary || `${plan.operation.method.toUpperCase()} ${plan.operation.path}`}
${usageSnippet}${plan.hasReturnValue ? '\nConsole.WriteLine(result);' : ''}
\`\`\``);
            }
        }
        return examples.join('\n\n') || 'No examples available.';
    }
    format(content) {
        return content.trim() + '\n';
    }
    indent(content, spaces) {
        const prefix = ' '.repeat(Math.max(0, spaces));
        return content.split('\n').map((line) => (line ? `${prefix}${line}` : line)).join('\n');
    }
}
