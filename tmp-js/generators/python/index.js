import { BaseGenerator } from '../../framework/base.js';
import { PYTHON_CONFIG, getPythonPackageRoot } from './config.js';
import { ModelGenerator } from './model-generator.js';
import { ApiGenerator } from './api-generator.js';
import { HttpClientGenerator } from './http-generator.js';
import { BuildConfigGenerator } from './build-config-generator.js';
import { normalizeOperationId, resolveSimplifiedTagNames, stripTagPrefixFromOperationId } from '../../framework/naming.js';
import { buildLanguageReadmeTitle, buildMutuallyExclusiveAuthSection, resolveApiKeyHeaderPreview, } from '../../framework/readme.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { generatePublishBinScripts } from '../../framework/publish.js';
export class PythonGenerator extends BaseGenerator {
    constructor() {
        super(PYTHON_CONFIG);
        this.modelGenerator = new ModelGenerator();
        this.apiGenerator = new ApiGenerator();
        this.httpClientGenerator = new HttpClientGenerator();
        this.buildConfigGenerator = new BuildConfigGenerator();
    }
    generateModels(ctx) {
        return this.modelGenerator.generate(ctx, this.config);
    }
    generateApis(ctx, config) {
        return this.apiGenerator.generate(ctx, config);
    }
    generateClient(config) {
        return this.httpClientGenerator.generate(this.ctx, config);
    }
    generateBuildConfig(config) {
        return this.buildConfigGenerator.generate(config);
    }
    generateBinScripts(_config) {
        return generatePublishBinScripts('python');
    }
    generateReadme(ctx, config) {
        const clientName = resolveSdkClientName(config);
        const pkgName = config.packageName || `sdkwork-${config.sdkType}-sdk`;
        const packageRoot = getPythonPackageRoot(config);
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const allGroups = Object.entries(ctx.apiGroups);
        const preferredModules = new Set(['tenant', 'user', 'app', 'auth', 'workspace']);
        const quickStartTag = tags.find((tag) => preferredModules.has((resolvedTagNames.get(tag) || tag).toLowerCase()))
            || allGroups[0]?.[0];
        const quickStartGroup = quickStartTag ? ctx.apiGroups[quickStartTag] : undefined;
        const quickStartOperation = this.selectQuickStartOperation(quickStartGroup?.operations || []);
        const quickStartModule = quickStartTag
            ? PYTHON_CONFIG.namingConventions.propertyName(resolvedTagNames.get(quickStartTag) || quickStartTag)
            : 'example';
        const quickStartMethod = quickStartOperation
            ? this.generateReadmeOperationId(quickStartOperation.method, quickStartOperation.path, quickStartOperation, quickStartTag || '')
            : 'list';
        const modules = tags.map(tag => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const propName = PYTHON_CONFIG.namingConventions.propertyName(resolvedTagName);
            return `- \`client.${propName}\` - ${tag} API`;
        }).join('\n');
        const readmeTitle = buildLanguageReadmeTitle(config.name, 'Python');
        const authHeaderPreview = resolveApiKeyHeaderPreview(ctx.auth);
        const authSection = buildMutuallyExclusiveAuthSection({
            codeFence: 'python',
            modeAExample: `config = SdkConfig(base_url="${config.baseUrl}")
client = ${clientName}(config)
client.set_api_key("your-api-key")
# Sends: ${authHeaderPreview}`,
            modeBExample: `config = SdkConfig(base_url="${config.baseUrl}")
client = ${clientName}(config)
client.set_auth_token("your-auth-token")
client.set_access_token("your-access-token")
# Sends:
# Authorization: Bearer <authToken>
# Access-Token: <accessToken>`,
            apiKeyCall: 'set_api_key(...)',
            authTokenCall: 'set_auth_token(...)',
            accessTokenCall: 'set_access_token(...)',
        });
        return {
            path: 'README.md',
            content: this.format(`# ${readmeTitle}

${config.description || 'Professional Python SDK for SDKWork API.'}

## Installation

\`\`\`bash
pip install ${pkgName}
\`\`\`

## Quick Start

\`\`\`python
from ${packageRoot} import ${clientName}, SdkConfig

config = SdkConfig(
    base_url="${config.baseUrl}",
)

client = ${clientName}(config)
client.set_api_key("your-api-key")

# Use the SDK
result = client.${quickStartModule}.${quickStartMethod}()
\`\`\`

${authSection}

## API Modules

${modules}

## License

${config.license || 'MIT'}
`),
            language: 'python',
            description: 'SDK documentation',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
    supportsHeaderCookieParameters() {
        return true;
    }
    supportsNonJsonRequestBodyMediaTypes(mediaTypes) {
        if (!Array.isArray(mediaTypes) || mediaTypes.length === 0) {
            return false;
        }
        return mediaTypes.every((mediaType) => mediaType.toLowerCase() === 'multipart/form-data');
    }
    selectQuickStartOperation(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            return undefined;
        }
        const getWithoutPathParam = operations.find((op) => op?.method === 'get' && typeof op?.path === 'string' && !op.path.includes('{'));
        if (getWithoutPathParam) {
            return getWithoutPathParam;
        }
        return operations[0];
    }
    generateReadmeOperationId(method, path, op, tag) {
        if (op.operationId) {
            const normalized = normalizeOperationId(op.operationId);
            return PYTHON_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
        }
        const pathParts = path.split('/').filter(Boolean);
        const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
        const actionMap = {
            get: path.includes('{') ? 'get' : 'list',
            post: 'create',
            put: 'update',
            patch: 'patch',
            delete: 'delete',
        };
        return PYTHON_CONFIG.namingConventions.methodName(`${actionMap[method] || method}_${resource}`);
    }
}
export { PYTHON_CONFIG } from './config.js';
export { getPythonPackageRoot } from './config.js';
export { ModelGenerator } from './model-generator.js';
export { ApiGenerator } from './api-generator.js';
export { HttpClientGenerator } from './http-generator.js';
export { BuildConfigGenerator } from './build-config-generator.js';
