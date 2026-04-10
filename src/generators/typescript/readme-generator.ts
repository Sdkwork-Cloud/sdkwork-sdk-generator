import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import {
  buildMutuallyExclusiveAuthSection,
  buildPublishSection,
  resolveApiKeyHeaderPreview,
} from '../../framework/readme.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { TypeScriptUsagePlanner, renderTypeScriptUsageSnippet } from './usage-planner.js';

export class ReadmeGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile {
    const clientName = resolveSdkClientName(config);
    const pkgName = config.packageName || `@sdkwork/${config.sdkType}-sdk`;
    const planner = new TypeScriptUsagePlanner(ctx);
    const quickStartPlan = planner.selectQuickStartPlan();
    const quickStartModule = quickStartPlan?.moduleName || 'example';
    const quickStartMethod = quickStartPlan?.methodName || 'list';
    const quickStartSnippet = quickStartPlan
      ? renderTypeScriptUsageSnippet(quickStartPlan, 'readme')
      : `const result = await client.${quickStartModule}.${quickStartMethod}();`;
    const quickStartSnippetInTry = this.indentSnippet(quickStartSnippet, 2);

    const modules = Object.keys(ctx.apiGroups).map((tag) => {
      return `- \`client.${planner.getModuleName(tag)}\` - ${tag} API`;
    }).join('\n');

    const authHeaderPreview = resolveApiKeyHeaderPreview(ctx.auth);
    const authSection = buildMutuallyExclusiveAuthSection({
      codeFence: 'typescript',
      modeAExample: `const client = new ${clientName}({ baseUrl: '${config.baseUrl}' });
client.setApiKey('your-api-key');
// Sends: ${authHeaderPreview}`,
      modeBExample: `const client = new ${clientName}({ baseUrl: '${config.baseUrl}' });
client.setAuthToken('your-auth-token');
client.setAccessToken('your-access-token');
// Sends:
// Authorization: Bearer <authToken>
// Access-Token: <accessToken>`,
      apiKeyCall: 'setApiKey(...)',
      authTokenCall: 'setAuthToken(...)',
      accessTokenCall: 'setAccessToken(...)',
    });
    const publishSection = buildPublishSection('typescript');
    const examples = this.generateExamples(ctx, planner);

    return {
      path: 'README.md',
      content: this.format(`# ${config.name}

${config.description || 'Professional TypeScript SDK for SDKWork API.'}

## Installation

\`\`\`bash
npm install ${pkgName}
# or
yarn add ${pkgName}
# or
pnpm add ${pkgName}
\`\`\`

## Quick Start

\`\`\`typescript
import { ${clientName} } from '${pkgName}';

const client = new ${clientName}({
  baseUrl: '${config.baseUrl}',
  timeout: 30000,
});

// Mode A: API Key (recommended for server-to-server calls)
client.setApiKey('your-api-key');

// Use the SDK
${quickStartSnippet}
\`\`\`

${authSection}

## Configuration (Non-Auth)

\`\`\`typescript
import { ${clientName} } from '${pkgName}';

const client = new ${clientName}({
  baseUrl: '${config.baseUrl}',
  timeout: 30000, // Request timeout in ms
  headers: {      // Custom headers
    'X-Custom-Header': 'value',
  },
});
\`\`\`

## API Modules

${modules}

## Usage Examples

${examples}

## Error Handling

\`\`\`typescript
import { ${clientName}, NetworkError, TimeoutError, AuthenticationError } from '${pkgName}';

try {
${quickStartSnippetInTry}
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed:', error.message);
  } else if (error instanceof TimeoutError) {
    console.error('Request timed out:', error.message);
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
  } else {
    throw error;
  }
}
\`\`\`

${publishSection}

## License

${config.license || 'MIT'}
`),
      language: 'typescript',
      description: 'SDK documentation',
    };
  }

  private generateExamples(ctx: SchemaContext, planner: TypeScriptUsagePlanner): string {
    const examples: string[] = [];

    for (const tag of Object.keys(ctx.apiGroups)) {
      const plan = planner.selectPlanForTag(tag);
      if (!plan) {
        continue;
      }

      examples.push(`### ${tag}

\`\`\`typescript
// ${plan.operation.summary || `${plan.transportMethod.toUpperCase()} ${plan.operation.path}`}
${renderTypeScriptUsageSnippet(plan, 'readme')}
\`\`\``);
    }

    return examples.join('\n\n') || 'No examples available.';
  }

  private indentSnippet(snippet: string, spaces: number): string {
    const prefix = ' '.repeat(Math.max(0, spaces));
    return snippet
      .split('\n')
      .map((line) => (line ? `${prefix}${line}` : line))
      .join('\n');
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
