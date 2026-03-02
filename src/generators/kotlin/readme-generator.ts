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
import { KOTLIN_CONFIG } from './config.js';

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
      : 'example';
    const quickStartModule = KOTLIN_CONFIG.namingConventions.propertyName(quickStartResolvedTagName);
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
      const propName = KOTLIN_CONFIG.namingConventions.propertyName(resolvedTagName);
      return `- \`client.${propName}\` - ${tag} API`;
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

    const examples = this.generateExamples(ctx, config, clientName, resolvedTagNames);

    return {
      path: 'README.md',
      content: this.format(`# ${readmeTitle}

${config.description || 'Professional Kotlin SDK for SDKWork API.'}

## Installation

Add to your \`build.gradle.kts\`:

\`\`\`kotlin
implementation("com.sdkwork:${artifactId}:${config.version}")
\`\`\`

Or with Gradle Groovy:

\`\`\`groovy
implementation 'com.sdkwork:${artifactId}:${config.version}'
\`\`\`

## Quick Start

\`\`\`kotlin
import com.sdkwork.${config.sdkType.toLowerCase()}.${clientName}
import ${commonPkg.importRoot}.SdkConfig

suspend fun main() {
    val config = SdkConfig(baseUrl = "${config.baseUrl}")
    val client = ${clientName}(config)
    client.setApiKey("your-api-key")
    
    // Use the SDK
    val result = client.${quickStartModule}.${quickStartMethod}()
    println(result)
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
try {
    val result = client.${quickStartModule}.${quickStartMethod}()
} catch (e: Exception) {
    println("Error: \${e.message}")
}
\`\`\`

## License

${config.license || 'MIT'}
`),
      language: 'kotlin',
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

\`\`\`kotlin
// ${op.summary || `${op.method.toUpperCase()} ${op.path}`}
val result = client.${KOTLIN_CONFIG.namingConventions.propertyName(resolvedTagName)}.${methodName}()
println(result)
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
      return KOTLIN_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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
    
    return `${actionMap[method] || method}${KOTLIN_CONFIG.namingConventions.modelName(resource)}`;
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
