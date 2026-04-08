import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { normalizeOperationId, resolveSimplifiedTagNames, stripTagPrefixFromOperationId } from '../../framework/naming.js';
import {
  buildLanguageReadmeTitle,
  buildMutuallyExclusiveAuthSection,
  buildPublishSection,
  resolveApiKeyHeaderPreview,
} from '../../framework/readme.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { DART_CONFIG, getDartPackageName } from './config.js';

export class ReadmeGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile {
    const clientName = resolveSdkClientName(config);
    const packageName = getDartPackageName(config);
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
    const quickStartModule = DART_CONFIG.namingConventions.propertyName(quickStartResolvedTagName);
    const quickStartMethod = quickStartOperation
      ? this.generateOperationId(
        quickStartOperation.method,
        quickStartOperation.path,
        quickStartOperation,
        quickStartTag || '',
      )
      : 'list';

    const modules = tags.map((tag) => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const propName = DART_CONFIG.namingConventions.propertyName(resolvedTagName);
      return `- \`client.${propName}\` - ${tag} API`;
    }).join('\n');
    const readmeTitle = buildLanguageReadmeTitle(config.name, 'Dart');

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
    const publishSection = buildPublishSection('dart');
    const examples = this.generateExamples(ctx, resolvedTagNames);

    return {
      path: 'README.md',
      content: this.format(`# ${readmeTitle}

${config.description || 'Professional Dart SDK for SDKWork API.'}

## Installation

\`\`\`bash
dart pub add ${packageName}
\`\`\`

## Quick Start

\`\`\`dart
import 'package:${packageName}/${packageName}.dart';

final client = ${clientName}(
  config: const SdkConfig(
    baseUrl: '${config.baseUrl}',
  ),
);
client.setApiKey('your-api-key');

final result = await client.${quickStartModule}.${quickStartMethod}();
print(result);
\`\`\`

${authSection}

## Configuration (Non-Auth)

\`\`\`dart
final client = ${clientName}.withBaseUrl(baseUrl: '${config.baseUrl}');
client.setHeader('X-Custom-Header', 'value');
\`\`\`

## API Modules

${modules}

## Usage Examples

${examples}

## Error Handling

\`\`\`dart
try {
  final result = await client.${quickStartModule}.${quickStartMethod}();
  print(result);
} catch (error) {
  print('Error: $error');
}
\`\`\`

${publishSection}

## License

${config.license || 'MIT'}
`),
      language: 'dart',
      description: 'SDK documentation',
    };
  }

  private generateExamples(
    ctx: SchemaContext,
    resolvedTagNames: Map<string, string>
  ): string {
    const examples: string[] = [];

    for (const [tag, group] of Object.entries(ctx.apiGroups)) {
      const operations = (group as any).operations || [];
      if (operations.length === 0) {
        continue;
      }

      const op = operations[0];
      const methodName = this.generateOperationId(op.method, op.path, op, tag);
      const resolvedTagName = resolvedTagNames.get(tag) || tag;

      examples.push(`### ${tag}

\`\`\`dart
final result = await client.${DART_CONFIG.namingConventions.propertyName(resolvedTagName)}.${methodName}();
print(result);
\`\`\``);
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
      return DART_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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

    return `${actionMap[method] || method}${DART_CONFIG.namingConventions.modelName(resource)}`;
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
