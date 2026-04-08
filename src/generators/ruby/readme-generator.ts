import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import {
  buildLanguageReadmeTitle,
  buildMutuallyExclusiveAuthSection,
  buildPublishSection,
  resolveApiKeyHeaderPreview,
} from '../../framework/readme.js';
import { normalizeOperationId, resolveSimplifiedTagNames, stripTagPrefixFromOperationId } from '../../framework/naming.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { getRubyGemName, getRubyModuleSegments, getRubyRootRequirePath, RUBY_CONFIG } from './config.js';

export class ReadmeGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile {
    const clientName = resolveSdkClientName(config);
    const gemName = getRubyGemName(config);
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
    const preferredModules = new Set(['tenant', 'user', 'app', 'auth', 'workspace']);
    const quickStartTag = tags.find((tag) => preferredModules.has((resolvedTagNames.get(tag) || tag).toLowerCase()))
      || tags[0];
    const quickStartGroup = quickStartTag ? ctx.apiGroups[quickStartTag] : undefined;
    const quickStartOperation = this.selectQuickStartOperation(quickStartGroup?.operations || []);
    const quickStartModule = quickStartTag
      ? RUBY_CONFIG.namingConventions.propertyName(resolvedTagNames.get(quickStartTag) || quickStartTag)
      : 'example';
    const quickStartMethod = quickStartOperation
      ? this.generateReadmeOperationId(
        quickStartOperation.method,
        quickStartOperation.path,
        quickStartOperation,
        quickStartTag || '',
      )
      : 'list';
    const modulePrefix = getRubyModuleSegments(config).join('::');
    const modules = tags.map((tag) => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const propName = RUBY_CONFIG.namingConventions.propertyName(resolvedTagName);
      return `- \`client.${propName}\` - ${tag} API`;
    }).join('\n');
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

result = client.${quickStartModule}.${quickStartMethod}
\`\`\`

${authSection}

## API Modules

${modules}

${publishSection}

## License

${config.license || 'MIT'}
`),
      language: 'ruby',
      description: 'SDK documentation',
    };
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

  private generateReadmeOperationId(method: string, path: string, op: any, tag: string): string {
    if (op.operationId) {
      const normalized = normalizeOperationId(op.operationId);
      return RUBY_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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

    return RUBY_CONFIG.namingConventions.methodName(`${actionMap[method] || method}_${resource}`);
  }

  private format(content: string): string {
    return `${content.trim()}\n`;
  }
}
