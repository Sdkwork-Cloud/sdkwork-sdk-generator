import { buildLanguageReadmeTitle, buildMutuallyExclusiveAuthSection, buildPublishSection, resolveApiKeyHeaderPreview, } from '../../framework/readme.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { getPhpNamespace, getPhpPackageName } from './config.js';
import { PhpUsagePlanner, renderPhpUsageSnippet } from './usage-planner.js';
export class ReadmeGenerator {
    generate(ctx, config) {
        const clientName = resolveSdkClientName(config);
        const packageName = getPhpPackageName(config);
        const namespace = getPhpNamespace(config);
        const tags = Object.keys(ctx.apiGroups);
        const planner = new PhpUsagePlanner(ctx);
        const quickStartPlan = planner.selectQuickStartPlan();
        const quickStartImports = this.buildModelImports(namespace, quickStartPlan);
        const quickStartSnippet = quickStartPlan
            ? renderPhpUsageSnippet(quickStartPlan, 'readme', { assignResult: quickStartPlan.hasReturnValue })
            : '$result = $client->example->list();';
        const quickStartOutput = quickStartPlan?.hasReturnValue ? "\nvar_dump(\$result);" : '';
        const errorHandlingSnippet = quickStartPlan
            ? renderPhpUsageSnippet(quickStartPlan, 'readme', { assignResult: false })
            : '$client->example->list();';
        const errorHandlingImports = this.buildModelImports(namespace, quickStartPlan);
        const modules = tags.map((tag) => `- \`$client->${planner.getModuleProperty(tag)}\` - ${tag} API`).join('\n');
        const authHeaderPreview = resolveApiKeyHeaderPreview(ctx.auth);
        const authSection = buildMutuallyExclusiveAuthSection({
            codeFence: 'php',
            modeAExample: `$config = new SdkConfig(baseUrl: "${config.baseUrl}");
$client = new ${clientName}($config);
$client->setApiKey('your-api-key');
// Sends: ${authHeaderPreview}`,
            modeBExample: `$config = new SdkConfig(baseUrl: "${config.baseUrl}");
$client = new ${clientName}($config);
$client->setAuthToken('your-auth-token');
$client->setAccessToken('your-access-token');
// Sends:
// Authorization: Bearer <authToken>
// Access-Token: <accessToken>`,
            apiKeyCall: 'setApiKey(...)',
            authTokenCall: 'setAuthToken(...)',
            accessTokenCall: 'setAccessToken(...)',
        });
        const publishSection = buildPublishSection('php');
        const readmeTitle = buildLanguageReadmeTitle(config.name, 'PHP');
        const examples = this.generateExamples(ctx, namespace, planner);
        return {
            path: 'README.md',
            content: this.format(`# ${readmeTitle}

${config.description || 'Professional PHP SDK for SDKWork API.'}

## Installation

\`\`\`bash
composer require ${packageName}
\`\`\`

## Quick Start

\`\`\`php
<?php

use ${namespace}\\${clientName};
use ${namespace}\\SdkConfig;
${quickStartImports}

$config = new SdkConfig(baseUrl: '${config.baseUrl}');
$client = new ${clientName}($config);
$client->setApiKey('your-api-key');

${quickStartSnippet}
\n${quickStartOutput}
\`\`\`

${authSection}

## Configuration (Non-Auth)

\`\`\`php
<?php

use ${namespace}\\${clientName};
use ${namespace}\\SdkConfig;

$config = new SdkConfig(baseUrl: '${config.baseUrl}');
$client = new ${clientName}($config);

// Set custom headers
$client->setHeader('X-Custom-Header', 'value');
\`\`\`

## API Modules

${modules}

## Usage Examples

${examples}

## Error Handling

\`\`\`php
<?php

use ${namespace}\\${clientName};
use ${namespace}\\SdkConfig;
${errorHandlingImports}

$config = new SdkConfig(baseUrl: '${config.baseUrl}');
$client = new ${clientName}($config);

try {
${this.indent(errorHandlingSnippet, 4)}
} catch (\\Throwable $e) {
    echo "Error: {$e->getMessage()}\\n";
}
\`\`\`

${publishSection}

## License

${config.license || 'MIT'}
`),
            language: 'php',
            description: 'SDK documentation',
        };
    }
    format(content) {
        return `${content.trim()}\n`;
    }
    buildModelImports(namespace, plan) {
        if (!plan || plan.modelImports.length === 0) {
            return '';
        }
        return `${plan.modelImports.map((modelName) => `use ${namespace}\\Models\\${modelName};`).join('\n')}\n`;
    }
    generateExamples(ctx, namespace, planner) {
        const examples = [];
        for (const tag of Object.keys(ctx.apiGroups)) {
            const plan = planner.selectPlanForTag(tag);
            if (!plan) {
                continue;
            }
            const imports = this.buildModelImports(namespace, plan);
            const outputLine = plan.hasReturnValue ? '\nvar_dump($result);' : '';
            examples.push(`### ${tag}

\`\`\`php
<?php

${imports}// ${plan.operation.summary || `${String(plan.operation.method || '').toUpperCase()} ${plan.operation.path}`}
${renderPhpUsageSnippet(plan, 'readme', { assignResult: plan.hasReturnValue })}${outputLine}
\`\`\``);
        }
        return examples.join('\n\n') || 'No examples available.';
    }
    indent(content, spaces) {
        const prefix = ' '.repeat(Math.max(0, spaces));
        return content
            .split('\n')
            .map((line) => (line ? `${prefix}${line}` : line))
            .join('\n');
    }
}
