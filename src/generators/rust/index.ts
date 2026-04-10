import { BaseGenerator, type GeneratedFile, type SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { generatePublishBinScripts } from '../../framework/publish.js';
import { RUST_CONFIG } from './config.js';
import { ModelGenerator } from './model-generator.js';
import { ApiGenerator } from './api-generator.js';
import { HttpClientGenerator } from './http-generator.js';
import { BuildConfigGenerator } from './build-config-generator.js';
import { ReadmeGenerator } from './readme-generator.js';
import { TestGenerator } from './test-generator.js';

export class RustGenerator extends BaseGenerator {
  private modelGenerator: ModelGenerator;
  private apiGenerator: ApiGenerator;
  private httpClientGenerator: HttpClientGenerator;
  private buildConfigGenerator: BuildConfigGenerator;
  private readmeGenerator: ReadmeGenerator;
  private testGenerator: TestGenerator;

  constructor() {
    super(RUST_CONFIG);
    this.modelGenerator = new ModelGenerator();
    this.apiGenerator = new ApiGenerator();
    this.httpClientGenerator = new HttpClientGenerator();
    this.buildConfigGenerator = new BuildConfigGenerator();
    this.readmeGenerator = new ReadmeGenerator();
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
    return generatePublishBinScripts('rust');
  }

  generateReadme(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile {
    return this.readmeGenerator.generate(ctx, config);
  }

  protected generateTests(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    return this.testGenerator.generate(ctx, config);
  }

  protected supportsHeaderCookieParameters(): boolean {
    return true;
  }

  protected supportsNonJsonRequestBodyMediaTypes(mediaTypes: string[]): boolean {
    if (!Array.isArray(mediaTypes) || mediaTypes.length === 0) {
      return false;
    }
    return mediaTypes.every((mediaType) =>
      ['multipart/form-data', 'application/x-www-form-urlencoded'].includes(mediaType.toLowerCase())
    );
  }
}

export { RUST_CONFIG } from './config.js';
export { ModelGenerator } from './model-generator.js';
export { ApiGenerator } from './api-generator.js';
export { HttpClientGenerator } from './http-generator.js';
export { BuildConfigGenerator } from './build-config-generator.js';
export { ReadmeGenerator } from './readme-generator.js';
export { TestGenerator } from './test-generator.js';
