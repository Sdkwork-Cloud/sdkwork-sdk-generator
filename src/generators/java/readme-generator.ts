import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSimplifiedTagNames } from '../../framework/naming.js';
import { resolveJvmCommonPackage } from '../../framework/common-package.js';
import {
  buildLanguageReadmeTitle,
  buildMutuallyExclusiveAuthSection,
  buildPublishSection,
  resolveApiKeyHeaderPreview,
} from '../../framework/readme.js';
import { resolveJvmSdkIdentity } from '../../framework/jvm-sdk-identity.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { JAVA_CONFIG } from './config.js';
import { JavaUsagePlanner, renderJavaUsageSnippet } from './usage-planner.js';

export class ReadmeGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile {
    const clientName = resolveSdkClientName(config);
    const identity = resolveJvmSdkIdentity(config);
    const commonPkg = resolveJvmCommonPackage(config);
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
    const planner = new JavaUsagePlanner(ctx);
    const quickStartPlan = planner.selectQuickStartPlan();
    const quickStartImports = this.renderImports(identity.packageRoot, commonPkg.importRoot, clientName, quickStartPlan);
    const quickStartSnippet = quickStartPlan
      ? renderJavaUsageSnippet(quickStartPlan, 'readme')
      : 'client.getExample().list();';
    const quickStartOutput = quickStartPlan?.hasReturnValue
      ? 'System.out.println(result);'
      : 'System.out.println("Request completed");';
    const errorHandlingSnippet = quickStartPlan
      ? renderJavaUsageSnippet(quickStartPlan, 'readme')
      : 'client.getExample().list();';

    const modules = tags.map((tag) => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      return `- \`client.get${JAVA_CONFIG.namingConventions.modelName(resolvedTagName)}()\` - ${tag} API`;
    }).join('\n');
    const readmeTitle = buildLanguageReadmeTitle(config.name, 'Java');

    const authHeaderPreview = resolveApiKeyHeaderPreview(ctx.auth);
    const authSection = buildMutuallyExclusiveAuthSection({
      codeFence: 'java',
      modeAExample: `Types.SdkConfig config = new Types.SdkConfig("${config.baseUrl}");
${clientName} client = new ${clientName}(config);
client.setApiKey("your-api-key");
// Sends: ${authHeaderPreview}`,
      modeBExample: `Types.SdkConfig config = new Types.SdkConfig("${config.baseUrl}");
${clientName} client = new ${clientName}(config);
client.setAuthToken("your-auth-token");
client.setAccessToken("your-access-token");
// Sends:
// Authorization: Bearer <authToken>
// Access-Token: <accessToken>`,
      apiKeyCall: 'setApiKey(...)',
      authTokenCall: 'setAuthToken(...)',
      accessTokenCall: 'setAccessToken(...)',
    });
    const publishSection = buildPublishSection('java');
    const examples = this.generateExamples(ctx, planner);

    return {
      path: 'README.md',
      content: this.format(`# ${readmeTitle}

${config.description || 'Professional Java SDK for SDKWork API.'}

## Installation

Add to your \`pom.xml\`:

\`\`\`xml
<dependency>
    <groupId>${identity.groupId}</groupId>
    <artifactId>${identity.artifactId}</artifactId>
    <version>${identity.version}</version>
</dependency>
\`\`\`

Or with Gradle:

\`\`\`groovy
implementation '${identity.groupId}:${identity.artifactId}:${identity.version}'
\`\`\`

## Quick Start

\`\`\`java
${quickStartImports}

public class Main {
    public static void main(String[] args) throws Exception {
        Types.SdkConfig config = new Types.SdkConfig("${config.baseUrl}");
        ${clientName} client = new ${clientName}(config);
        client.setApiKey("your-api-key");

        // Use the SDK
${this.indent(quickStartSnippet, 8)}
        ${quickStartOutput}
    }
}
\`\`\`

${authSection}

## Configuration (Non-Auth)

\`\`\`java
Types.SdkConfig config = new Types.SdkConfig("${config.baseUrl}");
${clientName} client = new ${clientName}(config);

// Set custom headers
client.getHttpClient().setHeader("X-Custom-Header", "value");
\`\`\`

## API Modules

${modules}

## Usage Examples

${examples}

## Error Handling

\`\`\`java
try {
${this.indent(errorHandlingSnippet, 4)}
    ${quickStartOutput}
} catch (Exception e) {
    System.err.println("Error: " + e.getMessage());
}
\`\`\`

${publishSection}

## License

${config.license || 'MIT'}
`),
      language: 'java',
      description: 'SDK documentation',
    };
  }

  private generateExamples(ctx: SchemaContext, planner: JavaUsagePlanner): string {
    const examples: string[] = [];

    for (const tag of Object.keys(ctx.apiGroups)) {
      const plan = planner.selectPlanForTag(tag);
      const operation = plan?.operation;
      if (!plan || !operation) {
        continue;
      }

      const outputLine = plan.hasReturnValue
        ? 'System.out.println(result);'
        : 'System.out.println("Request completed");';
      examples.push(`### ${tag}

\`\`\`java
// ${operation.summary || `${String(operation.method || '').toUpperCase()} ${operation.path}`}
${renderJavaUsageSnippet(plan, 'readme')}
${outputLine}
\`\`\``);
    }

    return examples.join('\n\n') || 'No examples available.';
  }

  private renderImports(
    packageRoot: string,
    commonImportRoot: string,
    clientName: string,
    plan: ReturnType<JavaUsagePlanner['selectQuickStartPlan']>,
  ): string {
    return [
      `import ${packageRoot}.${clientName};`,
      `import ${commonImportRoot}.Types;`,
      plan?.usesModelPackage ? `import ${packageRoot}.model.*;` : '',
      plan?.usesArrayList ? 'import java.util.ArrayList;' : '',
      plan?.usesLinkedHashMap ? 'import java.util.LinkedHashMap;' : '',
      plan?.usesList ? 'import java.util.List;' : '',
      plan?.usesMap ? 'import java.util.Map;' : '',
    ].filter(Boolean).join('\n');
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }

  private indent(content: string, spaces: number): string {
    const prefix = ' '.repeat(Math.max(0, spaces));
    return content.split('\n').map((line) => (line ? `${prefix}${line}` : line)).join('\n');
  }
}
