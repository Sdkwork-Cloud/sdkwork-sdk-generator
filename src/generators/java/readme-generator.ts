import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { normalizeOperationId, resolveSimplifiedTagNames, stripTagPrefixFromOperationId } from '../../framework/naming.js';
import { resolveJvmCommonPackage } from '../../framework/common-package.js';
import {
  buildLanguageReadmeTitle,
  buildMutuallyExclusiveAuthSection,
  resolveApiKeyHeaderPreview,
} from '../../framework/readme.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { JAVA_CONFIG } from './config.js';

export class ReadmeGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile {
    const clientName = resolveSdkClientName(config);
    const artifactId = `${config.sdkType}-sdk`;
    const commonPkg = resolveJvmCommonPackage(config);
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
    const quickStartModuleAccessor = `get${JAVA_CONFIG.namingConventions.modelName(quickStartResolvedTagName)}()`;
    const quickStartMethod = quickStartOperation
      ? this.generateOperationId(
        quickStartOperation.method,
        quickStartOperation.path,
        quickStartOperation,
        quickStartTag || '',
      )
      : 'list';
    
    const modules = tags.map(tag => {
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

    const examples = this.generateExamples(ctx, config, clientName, resolvedTagNames);

    return {
      path: 'README.md',
      content: this.format(`# ${readmeTitle}

${config.description || 'Professional Java SDK for SDKWork API.'}

## Installation

Add to your \`pom.xml\`:

\`\`\`xml
<dependency>
    <groupId>com.sdkwork</groupId>
    <artifactId>${artifactId}</artifactId>
    <version>${config.version}</version>
</dependency>
\`\`\`

Or with Gradle:

\`\`\`groovy
implementation 'com.sdkwork:${artifactId}:${config.version}'
\`\`\`

## Quick Start

\`\`\`java
import com.sdkwork.${config.sdkType.toLowerCase()}.${clientName};
import ${commonPkg.importRoot}.Types;

public class Main {
    public static void main(String[] args) throws Exception {
        Types.SdkConfig config = new Types.SdkConfig("${config.baseUrl}");
        ${clientName} client = new ${clientName}(config);
        client.setApiKey("your-api-key");
        
        // Use the SDK
        Object result = client.${quickStartModuleAccessor}.${quickStartMethod}();
        System.out.println(result);
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
    Object result = client.${quickStartModuleAccessor}.${quickStartMethod}();
} catch (Exception e) {
    System.err.println("Error: " + e.getMessage());
}
\`\`\`

## License

${config.license || 'MIT'}
`),
      language: 'java',
      description: 'SDK documentation',
    };
  }

  private generateExamples(
    ctx: SchemaContext,
    config: GeneratorConfig,
    clientName: string,
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

\`\`\`java
// ${op.summary || `${op.method.toUpperCase()} ${op.path}`}
Object result = client.get${JAVA_CONFIG.namingConventions.modelName(resolvedTagName)}().${methodName}();
System.out.println(result);
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
      return JAVA_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
    }
    
    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
    
    const actionMap: Record<string, string> = {
      get: path.includes('{') ? 'get' : 'list',
      post: 'create',
      put: 'update',
      patch: 'patch',
      delete: 'delete',
    };
    
    return `${actionMap[method] || method}${JAVA_CONFIG.namingConventions.modelName(resource)}`;
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
