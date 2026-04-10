import { BaseGenerator, type GeneratedFile, type SchemaContext, type LanguageConfig } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { PYTHON_CONFIG, getPythonPackageRoot } from './config.js';
import { ModelGenerator } from './model-generator.js';
import { ApiGenerator } from './api-generator.js';
import { HttpClientGenerator } from './http-generator.js';
import { BuildConfigGenerator } from './build-config-generator.js';
import { TestGenerator } from './test-generator.js';
import { normalizeOperationId, resolveSimplifiedTagNames, stripTagPrefixFromOperationId } from '../../framework/naming.js';
import {
  buildLanguageReadmeTitle,
  buildMutuallyExclusiveAuthSection,
  buildPublishSection,
  resolveApiKeyHeaderPreview,
} from '../../framework/readme.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { generatePublishBinScripts } from '../../framework/publish.js';
import { PythonUsagePlanner, renderPythonUsageSnippet } from './usage-planner.js';

export class PythonGenerator extends BaseGenerator {
  private modelGenerator: ModelGenerator;
  private apiGenerator: ApiGenerator;
  private httpClientGenerator: HttpClientGenerator;
  private buildConfigGenerator: BuildConfigGenerator;
  private testGenerator: TestGenerator;

  constructor() {
    super(PYTHON_CONFIG);
    this.modelGenerator = new ModelGenerator();
    this.apiGenerator = new ApiGenerator();
    this.httpClientGenerator = new HttpClientGenerator();
    this.buildConfigGenerator = new BuildConfigGenerator();
    this.testGenerator = new TestGenerator();
  }

  generateModels(ctx: SchemaContext): GeneratedFile[] {
    return this.modelGenerator.generate(ctx, this.config);
  }

  generateApis(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    return this.apiGenerator.generate(ctx, config);
  }

  generateClient(config: GeneratorConfig): GeneratedFile[] {
    return this.httpClientGenerator.generate(this.ctx, config);
  }

  generateBuildConfig(config: GeneratorConfig): GeneratedFile[] {
    return this.buildConfigGenerator.generate(config);
  }

  generateBinScripts(_config: GeneratorConfig): GeneratedFile[] {
    return generatePublishBinScripts('python');
  }

  protected generateTests(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    return this.testGenerator.generate(ctx, config);
  }

  generateReadme(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile {
    const clientName = resolveSdkClientName(config);
    const pkgName = config.packageName || `sdkwork-${config.sdkType}-sdk`;
    const packageRoot = getPythonPackageRoot(config);
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
    const planner = new PythonUsagePlanner(ctx);
    const quickStartPlan = planner.selectQuickStartPlan();
    const quickStartSnippet = quickStartPlan
      ? renderPythonUsageSnippet(quickStartPlan, 'readme')
      : 'result = client.example.list()';
    const errorHandlingSnippet = quickStartPlan
      ? renderPythonUsageSnippet(quickStartPlan, 'readme', { assignResult: false })
      : 'client.example.list()';
    const examples = this.generateReadmeExamples(ctx, planner);
    
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
    const publishSection = buildPublishSection('python');

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
${quickStartSnippet}
\`\`\`

${authSection}

## Configuration (Non-Auth)

\`\`\`python
from ${packageRoot} import ${clientName}, SdkConfig

config = SdkConfig(
    base_url="${config.baseUrl}",
)

client = ${clientName}(config)
client.set_header('X-Custom-Header', 'value')
\`\`\`

## API Modules

${modules}

## Usage Examples

${examples}

## Error Handling

\`\`\`python
try:
${this.indent(errorHandlingSnippet, 4)}
except Exception as error:
    print(f"Error: {error}")
\`\`\`

${publishSection}

## License

${config.license || 'MIT'}
`),
      language: 'python',
      description: 'SDK documentation',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }

  private generateReadmeExamples(ctx: SchemaContext, planner: PythonUsagePlanner): string {
    const examples: string[] = [];

    for (const tag of Object.keys(ctx.apiGroups)) {
      const plan = planner.selectPlanForTag(tag);
      if (!plan) {
        continue;
      }

      const outputLine = '\nprint(result)';
      examples.push(`### ${tag}

\`\`\`python
# ${plan.operation.summary || `${String(plan.operation.method || '').toUpperCase()} ${plan.operation.path}`}
${renderPythonUsageSnippet(plan, 'readme')}${outputLine}
\`\`\``);
    }

    return examples.join('\n\n') || 'No examples available.';
  }

  protected supportsHeaderCookieParameters(): boolean {
    return true;
  }

  protected supportsNonJsonRequestBodyMediaTypes(mediaTypes: string[]): boolean {
    if (!Array.isArray(mediaTypes) || mediaTypes.length === 0) {
      return false;
    }
    const supported = new Set([
      'multipart/form-data',
      'application/x-www-form-urlencoded',
    ]);
    return mediaTypes.every((mediaType) => supported.has(mediaType.toLowerCase()));
  }
}

export { PYTHON_CONFIG } from './config.js';
export { getPythonPackageRoot } from './config.js';
export { ModelGenerator } from './model-generator.js';
export { ApiGenerator } from './api-generator.js';
export { HttpClientGenerator } from './http-generator.js';
export { BuildConfigGenerator } from './build-config-generator.js';
export { TestGenerator } from './test-generator.js';
