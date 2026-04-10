import { buildLanguageReadmeTitle, buildMutuallyExclusiveAuthSection, buildPublishSection, resolveApiKeyHeaderPreview, } from '../../framework/readme.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { getRubyGemName, getRubyModuleSegments, getRubyRootRequirePath } from './config.js';
import { RubyUsagePlanner, renderRubyUsageSnippet } from './usage-planner.js';
export class ReadmeGenerator {
    generate(ctx, config) {
        const clientName = resolveSdkClientName(config);
        const gemName = getRubyGemName(config);
        const tags = Object.keys(ctx.apiGroups);
        const modulePrefix = getRubyModuleSegments(config).join('::');
        const planner = new RubyUsagePlanner(ctx, modulePrefix);
        const quickStartPlan = planner.selectQuickStartPlan();
        const quickStartSnippet = quickStartPlan
            ? renderRubyUsageSnippet(quickStartPlan, 'readme', { assignResult: quickStartPlan.hasReturnValue })
            : 'result = client.example.list';
        const quickStartOutput = quickStartPlan?.hasReturnValue ? "\nputs result.inspect" : '';
        const errorHandlingSnippet = quickStartPlan
            ? renderRubyUsageSnippet(quickStartPlan, 'readme', { assignResult: false })
            : 'client.example.list';
        const modules = tags.map((tag) => `- \`client.${planner.getModuleProperty(tag)}\` - ${tag} API`).join('\n');
        const authHeaderPreview = resolveApiKeyHeaderPreview(ctx.auth);
        const authSection = buildMutuallyExclusiveAuthSection({
            codeFence: 'ruby',
            modeAExample: `config = ${modulePrefix}::SdkConfig.new(base_url: "${config.baseUrl}")
client = ${modulePrefix}::${clientName}.new(config)
client.set_api_key("your-api-key")
# Sends: ${authHeaderPreview}`,
            modeBExample: `config = ${modulePrefix}::SdkConfig.new(base_url: "${config.baseUrl}")
client = ${modulePrefix}::${clientName}.new(config)
client.set_auth_token("your-auth-token")
client.set_access_token("your-access-token")
# Sends:
# Authorization: Bearer <authToken>
# Access-Token: <accessToken>`,
            apiKeyCall: 'set_api_key(...)',
            authTokenCall: 'set_auth_token(...)',
            accessTokenCall: 'set_access_token(...)',
        });
        const publishSection = buildPublishSection('ruby');
        const readmeTitle = buildLanguageReadmeTitle(config.name, 'Ruby');
        const examples = this.generateExamples(ctx, planner);
        return {
            path: 'README.md',
            content: this.format(`# ${readmeTitle}

${config.description || 'Professional Ruby SDK for SDKWork API.'}

## Installation

\`\`\`bash
gem install ${gemName}
\`\`\`

## Quick Start

\`\`\`ruby
require '${getRubyRootRequirePath(config)}'

config = ${modulePrefix}::SdkConfig.new(base_url: '${config.baseUrl}')
client = ${modulePrefix}::${clientName}.new(config)
client.set_api_key('your-api-key')

${quickStartSnippet}
\n${quickStartOutput}
\`\`\`

${authSection}

## Configuration (Non-Auth)

\`\`\`ruby
config = ${modulePrefix}::SdkConfig.new(base_url: '${config.baseUrl}')
client = ${modulePrefix}::${clientName}.new(config)

# Set custom headers
client.set_header('X-Custom-Header', 'value')
\`\`\`

## API Modules

${modules}

## Usage Examples

${examples}

## Error Handling

\`\`\`ruby
begin
${this.indent(errorHandlingSnippet, 2)}
rescue StandardError => e
  warn("Error: #{e.message}")
end
\`\`\`

${publishSection}

## License

${config.license || 'MIT'}
`),
            language: 'ruby',
            description: 'SDK documentation',
        };
    }
    format(content) {
        return `${content.trim()}\n`;
    }
    generateExamples(ctx, planner) {
        const examples = [];
        for (const tag of Object.keys(ctx.apiGroups)) {
            const plan = planner.selectPlanForTag(tag);
            if (!plan) {
                continue;
            }
            const outputLine = plan.hasReturnValue ? '\nputs result.inspect' : '';
            examples.push(`### ${tag}

\`\`\`ruby
# ${plan.operation.summary || `${String(plan.operation.method || '').toUpperCase()} ${plan.operation.path}`}
${renderRubyUsageSnippet(plan, 'readme', { assignResult: plan.hasReturnValue })}${outputLine}
\`\`\``);
        }
        return examples.join('\n\n') || 'No examples available.';
    }
    indent(content, spaces) {
        const prefix = ' '.repeat(Math.max(0, spaces));
        return content.split('\n').map((line) => (line ? `${prefix}${line}` : line)).join('\n');
    }
}
