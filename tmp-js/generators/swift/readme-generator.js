import { resolveSimplifiedTagNames } from '../../framework/naming.js';
import { resolveSwiftCommonPackage } from '../../framework/common-package.js';
import { buildLanguageReadmeTitle, buildMutuallyExclusiveAuthSection, buildPublishSection, resolveApiKeyHeaderPreview, } from '../../framework/readme.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { resolveSwiftPackageTargetName } from './build-config-generator.js';
import { SwiftUsagePlanner, renderSwiftUsageSnippet } from './usage-planner.js';
export class ReadmeGenerator {
    generate(ctx, config) {
        const clientName = resolveSdkClientName(config);
        const sdkTargetName = resolveSwiftPackageTargetName(config);
        const commonPkg = resolveSwiftCommonPackage(config);
        const planner = new SwiftUsagePlanner(ctx);
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const quickStartPlan = planner.selectQuickStartPlan();
        const quickStartUsage = quickStartPlan
            ? renderSwiftUsageSnippet(quickStartPlan, 'readme', { assignResult: quickStartPlan.hasReturnValue })
            : '// No API operations available.';
        const quickStartPrint = quickStartPlan?.hasReturnValue ? '\nprint(result)' : '';
        const errorCall = quickStartPlan
            ? renderSwiftUsageSnippet(quickStartPlan, 'readme', { assignResult: false })
            : '// No API operations available.';
        const modules = tags.map((tag) => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            return `- \`client.${planner.getModuleName(resolvedTagName)}\` - ${tag} API`;
        }).join('\n');
        const readmeTitle = buildLanguageReadmeTitle(config.name, 'Swift');
        const authHeaderPreview = resolveApiKeyHeaderPreview(ctx.auth);
        const authSection = buildMutuallyExclusiveAuthSection({
            codeFence: 'swift',
            modeAExample: `let config = SdkConfig(baseUrl: "${config.baseUrl}")
let client = ${clientName}(config: config)
client.setApiKey("your-api-key")
// Sends: ${authHeaderPreview}`,
            modeBExample: `let config = SdkConfig(baseUrl: "${config.baseUrl}")
let client = ${clientName}(config: config)
client.setAuthToken("your-auth-token")
client.setAccessToken("your-access-token")
// Sends:
// Authorization: Bearer <authToken>
// Access-Token: <accessToken>`,
            apiKeyCall: 'setApiKey(...)',
            authTokenCall: 'setAuthToken(...)',
            accessTokenCall: 'setAccessToken(...)',
        });
        const publishSection = buildPublishSection('swift');
        const examples = this.generateExamples(ctx, planner);
        return {
            path: 'README.md',
            content: this.format(`# ${readmeTitle}

${config.description || 'Professional Swift SDK for SDKWork API.'}

## Installation

Add to \`Package.swift\`:

\`\`\`swift
dependencies: [
    .package(url: "https://github.com/sdkwork/${config.sdkType}-sdk-swift", from: "${config.version}")
]
\`\`\`

## Quick Start

\`\`\`swift
import ${sdkTargetName}
import ${commonPkg.productName}

let config = SdkConfig(baseUrl: "${config.baseUrl}")
let client = ${clientName}(config: config)
client.setApiKey("your-api-key")

// Use the SDK
${quickStartUsage}${quickStartPrint}
\`\`\`

${authSection}

## Configuration (Non-Auth)

\`\`\`swift
let config = SdkConfig(baseUrl: "${config.baseUrl}")
let client = ${clientName}(config: config)

// Set custom headers
client.setHeader("X-Custom-Header", value: "value")
\`\`\`

## API Modules

${modules}

## Usage Examples

${examples}

## Error Handling

\`\`\`swift
do {
${this.indent(errorCall, 4)}
} catch {
    print("Error: \\(error)")
}
\`\`\`

${publishSection}

## License

${config.license || 'MIT'}
`),
            language: 'swift',
            description: 'SDK documentation',
        };
    }
    generateExamples(ctx, planner) {
        const examples = [];
        for (const [tag] of Object.entries(ctx.apiGroups)) {
            const plan = planner.selectPlanForTag(tag);
            if (!plan) {
                continue;
            }
            const usage = renderSwiftUsageSnippet(plan, 'readme', { assignResult: plan.hasReturnValue });
            examples.push(`### ${tag}

\`\`\`swift
// ${plan.operation.summary || `${plan.operation.method.toUpperCase()} ${plan.operation.path}`}
${usage}${plan.hasReturnValue ? '\nprint(result)' : ''}
\`\`\``);
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
