import { buildLanguageReadmeTitle, buildMutuallyExclusiveAuthSection, buildPublishSection, resolveApiKeyHeaderPreview, } from '../../framework/readme.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { getFlutterPackageName } from './config.js';
import { FlutterUsagePlanner, renderFlutterUsageSnippet } from './usage-planner.js';
export class ReadmeGenerator {
    generate(ctx, config) {
        const clientName = resolveSdkClientName(config);
        const pkgName = getFlutterPackageName(config);
        const tags = Object.keys(ctx.apiGroups);
        const planner = new FlutterUsagePlanner(ctx);
        const quickStartPlan = planner.selectQuickStartPlan();
        const quickStartSnippet = quickStartPlan
            ? renderFlutterUsageSnippet(quickStartPlan, 'readme', { assignResult: quickStartPlan.hasReturnValue })
            : 'await client.example.list();';
        const quickStartOutput = quickStartPlan?.hasReturnValue
            ? '\nprint(result);'
            : "\nprint('Request completed');";
        const errorHandlingSnippet = quickStartPlan
            ? renderFlutterUsageSnippet(quickStartPlan, 'readme', { assignResult: quickStartPlan.hasReturnValue })
            : 'await client.example.list();';
        const errorHandlingOutput = quickStartPlan?.hasReturnValue
            ? '\n  print(result);'
            : "\n  print('Request completed');";
        const modules = tags.map((tag) => `- \`client.${planner.getModuleName(tag)}\` - ${tag} API`).join('\n');
        const readmeTitle = buildLanguageReadmeTitle(config.name, 'Flutter');
        const authHeaderPreview = resolveApiKeyHeaderPreview(ctx.auth);
        const authSection = buildMutuallyExclusiveAuthSection({
            codeFence: 'dart',
            modeAExample: `final client = ${clientName}.withBaseUrl(baseUrl: '${config.baseUrl}');
client.setApiKey('your-api-key');
// Sends: ${authHeaderPreview}`,
            modeBExample: `final client = ${clientName}.withBaseUrl(baseUrl: '${config.baseUrl}');
client.setAuthToken('your-auth-token');
client.setAccessToken('your-access-token');
// Sends:
// Authorization: Bearer <authToken>
// Access-Token: <accessToken>`,
            apiKeyCall: 'setApiKey(...)',
            authTokenCall: 'setAuthToken(...)',
            accessTokenCall: 'setAccessToken(...)',
        });
        const publishSection = buildPublishSection('flutter');
        const examples = this.generateExamples(ctx, planner);
        return {
            path: 'README.md',
            content: this.format(`# ${readmeTitle}

${config.description || 'Professional Flutter SDK for SDKWork API.'}

## Installation

Add to \`pubspec.yaml\`:

\`\`\`yaml
dependencies:
  ${pkgName}: ^${config.version}
\`\`\`

## Quick Start

\`\`\`dart
import 'package:${pkgName}/${pkgName}.dart';

final client = ${clientName}.withBaseUrl(baseUrl: '${config.baseUrl}');
client.setApiKey('your-api-key');

// Use the SDK
${quickStartSnippet}${quickStartOutput}
\`\`\`

${authSection}

## Configuration (Non-Auth)

\`\`\`dart
final client = ${clientName}.withBaseUrl(baseUrl: '${config.baseUrl}');

// Set custom headers
client.setHeader('X-Custom-Header', 'value');
\`\`\`

## API Modules

${modules}

## Usage Examples

${examples}

## Error Handling

\`\`\`dart
try {
${this.indent(errorHandlingSnippet, 2)}${errorHandlingOutput}
} catch (e) {
  print('Error: $e');
}
\`\`\`

${publishSection}

## License

${config.license || 'MIT'}
`),
            language: 'flutter',
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
            const usage = renderFlutterUsageSnippet(plan, 'readme', { assignResult: plan.hasReturnValue });
            const output = plan.hasReturnValue
                ? '\nprint(result);'
                : "\nprint('Request completed');";
            examples.push(`### ${tag}
\`\`\`dart
// ${plan.operation.summary || `${String(plan.operation.method || '').toUpperCase()} ${plan.operation.path}`}
${usage}${output}
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
