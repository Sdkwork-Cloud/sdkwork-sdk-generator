import { resolveSimplifiedTagNames } from '../../framework/naming.js';
import { resolveJvmCommonPackage } from '../../framework/common-package.js';
import { buildLanguageReadmeTitle, buildMutuallyExclusiveAuthSection, buildPublishSection, resolveApiKeyHeaderPreview, } from '../../framework/readme.js';
import { resolveJvmSdkIdentity } from '../../framework/jvm-sdk-identity.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { KOTLIN_CONFIG } from './config.js';
import { KotlinUsagePlanner, renderKotlinUsageSnippet } from './usage-planner.js';
export class ReadmeGenerator {
    generate(ctx, config) {
        const clientName = resolveSdkClientName(config);
        const identity = resolveJvmSdkIdentity(config);
        const commonPkg = resolveJvmCommonPackage(config);
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const planner = new KotlinUsagePlanner(ctx);
        const quickStartPlan = planner.selectQuickStartPlan();
        const quickStartSnippet = quickStartPlan
            ? renderKotlinUsageSnippet(quickStartPlan, 'readme')
            : 'val result = client.example.list()';
        const quickStartOutput = quickStartPlan?.hasReturnValue
            ? 'println(result)'
            : 'println("Request completed")';
        const errorHandlingSnippet = quickStartPlan
            ? renderKotlinUsageSnippet(quickStartPlan, 'readme')
            : 'client.example.list()';
        const modules = tags.map((tag) => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            return `- \`client.${KOTLIN_CONFIG.namingConventions.propertyName(resolvedTagName)}\` - ${tag} API`;
        }).join('\n');
        const readmeTitle = buildLanguageReadmeTitle(config.name, 'Kotlin');
        const authHeaderPreview = resolveApiKeyHeaderPreview(ctx.auth);
        const authSection = buildMutuallyExclusiveAuthSection({
            codeFence: 'kotlin',
            modeAExample: `val config = SdkConfig(baseUrl = "${config.baseUrl}")
val client = ${clientName}(config)
client.setApiKey("your-api-key")
// Sends: ${authHeaderPreview}`,
            modeBExample: `val config = SdkConfig(baseUrl = "${config.baseUrl}")
val client = ${clientName}(config)
client.setAuthToken("your-auth-token")
client.setAccessToken("your-access-token")
// Sends:
// Authorization: Bearer <authToken>
// Access-Token: <accessToken>`,
            apiKeyCall: 'setApiKey(...)',
            authTokenCall: 'setAuthToken(...)',
            accessTokenCall: 'setAccessToken(...)',
        });
        const publishSection = buildPublishSection('kotlin');
        const examples = this.generateExamples(ctx, planner);
        return {
            path: 'README.md',
            content: this.format(`# ${readmeTitle}

${config.description || 'Professional Kotlin SDK for SDKWork API.'}

## Installation

Add to your \`build.gradle.kts\`:

\`\`\`kotlin
implementation("${identity.groupId}:${identity.artifactId}:${identity.version}")
\`\`\`

Or with Gradle Groovy:

\`\`\`groovy
implementation '${identity.groupId}:${identity.artifactId}:${identity.version}'
\`\`\`

## Quick Start

\`\`\`kotlin
import ${identity.packageRoot}.${clientName}
import ${identity.packageRoot}.*
import ${commonPkg.importRoot}.SdkConfig
import kotlinx.coroutines.runBlocking

fun main() = runBlocking {
    val config = SdkConfig(baseUrl = "${config.baseUrl}")
    val client = ${clientName}(config)
    client.setApiKey("your-api-key")

    // Use the SDK
${this.indent(quickStartSnippet, 4)}
    ${quickStartOutput}
}
\`\`\`

${authSection}

## Configuration (Non-Auth)

\`\`\`kotlin
val config = SdkConfig(baseUrl = "${config.baseUrl}")
val client = ${clientName}(config)
\`\`\`

## API Modules

${modules}

## Usage Examples

${examples}

## Error Handling

\`\`\`kotlin
import kotlinx.coroutines.runBlocking

fun main() = runBlocking {
    try {
${this.indent(errorHandlingSnippet, 8)}
        ${quickStartOutput}
    } catch (e: Exception) {
        println("Error: \${e.message}")
    }
}
\`\`\`

${publishSection}

## License

${config.license || 'MIT'}
`),
            language: 'kotlin',
            description: 'SDK documentation',
        };
    }
    generateExamples(ctx, planner) {
        const examples = [];
        for (const tag of Object.keys(ctx.apiGroups)) {
            const plan = planner.selectPlanForTag(tag);
            const operation = plan?.operation;
            if (!plan || !operation) {
                continue;
            }
            const outputLine = plan.hasReturnValue
                ? 'println(result)'
                : 'println("Request completed")';
            examples.push(`### ${tag}

\`\`\`kotlin
// ${operation.summary || `${String(operation.method || '').toUpperCase()} ${operation.path}`}
${renderKotlinUsageSnippet(plan, 'readme')}
${outputLine}
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
