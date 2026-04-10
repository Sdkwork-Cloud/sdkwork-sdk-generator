import { resolveSimplifiedTagNames } from '../../framework/naming.js';
import { buildLanguageReadmeTitle, buildMutuallyExclusiveAuthSection, buildPublishSection, resolveApiKeyHeaderPreview, } from '../../framework/readme.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { GO_CONFIG } from './config.js';
import { GoUsagePlanner, renderGoUsageSnippet } from './usage-planner.js';
export class ReadmeGenerator {
    generate(ctx, config) {
        const clientName = resolveSdkClientName(config);
        const moduleName = config.packageName || `github.com/sdkwork/${config.sdkType}-sdk`;
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const planner = new GoUsagePlanner(ctx);
        const quickStartPlan = planner.selectQuickStartPlan();
        const quickStartSnippet = quickStartPlan
            ? renderGoUsageSnippet(quickStartPlan, 'readme')
            : 'result, err := client.Example.List()';
        const errorHandlingSnippet = quickStartPlan
            ? renderGoUsageSnippet(quickStartPlan, 'readme', { resultBinding: '_' })
            : '_, err := client.Example.List()';
        const quickStartTypesImport = quickStartPlan?.requiresTypesImport
            ? `    sdktypes "${moduleName}/types"`
            : '';
        const modules = tags.map(tag => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const propName = GO_CONFIG.namingConventions.propertyName(resolvedTagName);
            return `- \`client.${propName}\` - ${tag} API`;
        }).join('\n');
        const readmeTitle = buildLanguageReadmeTitle(config.name, 'Go');
        const authHeaderPreview = resolveApiKeyHeaderPreview(ctx.auth);
        const authSection = buildMutuallyExclusiveAuthSection({
            codeFence: 'go',
            modeAExample: `cfg := sdkhttp.NewDefaultConfig("${config.baseUrl}")
client := ${moduleName}.New${clientName}WithConfig(cfg)
client.SetApiKey("your-api-key")
// Sends: ${authHeaderPreview}`,
            modeBExample: `cfg := sdkhttp.NewDefaultConfig("${config.baseUrl}")
client := ${moduleName}.New${clientName}WithConfig(cfg)
client.SetAuthToken("your-auth-token")
client.SetAccessToken("your-access-token")
// Sends:
// Authorization: Bearer <authToken>
// Access-Token: <accessToken>`,
            apiKeyCall: 'SetApiKey(...)',
            authTokenCall: 'SetAuthToken(...)',
            accessTokenCall: 'SetAccessToken(...)',
        });
        const publishSection = buildPublishSection('go');
        const examples = this.generateExamples(ctx, planner);
        return {
            path: 'README.md',
            content: this.format(`# ${readmeTitle}

${config.description || 'Professional Go SDK for SDKWork API.'}

## Installation

\`\`\`bash
go get ${moduleName}
\`\`\`

## Quick Start

\`\`\`go
package main

import (
    "fmt"
    "${moduleName}"
    sdkhttp "${moduleName}/http"
${quickStartTypesImport ? `\n${quickStartTypesImport}` : ''}
)

func main() {
    cfg := sdkhttp.NewDefaultConfig("${config.baseUrl}")
    client := ${moduleName}.New${clientName}WithConfig(cfg)
    client.SetApiKey("your-api-key")
    
    // Use the SDK
${this.indent(quickStartSnippet, 4)}
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
}
\`\`\`

${authSection}

## Configuration (Non-Auth)

\`\`\`go
cfg := sdkhttp.NewDefaultConfig("${config.baseUrl}")
client := ${moduleName}.New${clientName}WithConfig(cfg)

// Set custom headers
client.SetHeader("X-Custom-Header", "value")
\`\`\`

## API Modules

${modules}

## Usage Examples

${examples}

## Error Handling

\`\`\`go
${errorHandlingSnippet}
if err != nil {
    // Handle error
    fmt.Println("Error:", err)
    return
}
\`\`\`

${publishSection}

## License

${config.license || 'MIT'}
`),
            language: 'go',
            description: 'SDK documentation',
        };
    }
    generateExamples(ctx, planner) {
        const examples = [];
        for (const tag of Object.keys(ctx.apiGroups)) {
            const plan = planner.selectPlanForTag(tag);
            if (!plan) {
                continue;
            }
            examples.push(`### ${tag}

\`\`\`go
// ${plan.operation.summary || `${plan.transportMethod.toUpperCase()} ${plan.operation.path}`}
${renderGoUsageSnippet(plan, 'readme')}
if err != nil {
    panic(err)
}
fmt.Println(result)
\`\`\``);
        }
        return examples.join('\n\n') || 'No examples available.';
    }
    format(content) {
        return content.trim() + '\n';
    }
    indent(content, spaces) {
        const prefix = ' '.repeat(Math.max(0, spaces));
        return content
            .split('\n')
            .map((line) => (line ? `${prefix}${line}` : line))
            .join('\n');
    }
}
