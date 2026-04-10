import { BaseGenerator } from '../../framework/base.js';
import { generatePublishBinScripts } from '../../framework/publish.js';
import { RUST_CONFIG } from './config.js';
import { ModelGenerator } from './model-generator.js';
import { ApiGenerator } from './api-generator.js';
import { HttpClientGenerator } from './http-generator.js';
import { BuildConfigGenerator } from './build-config-generator.js';
import { ReadmeGenerator } from './readme-generator.js';
import { TestGenerator } from './test-generator.js';
export class RustGenerator extends BaseGenerator {
    constructor() {
        super(RUST_CONFIG);
        this.modelGenerator = new ModelGenerator();
        this.apiGenerator = new ApiGenerator();
        this.httpClientGenerator = new HttpClientGenerator();
        this.buildConfigGenerator = new BuildConfigGenerator();
        this.readmeGenerator = new ReadmeGenerator();
        this.testGenerator = new TestGenerator();
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
        return generatePublishBinScripts('rust');
    }
    generateReadme(ctx, config) {
        return this.readmeGenerator.generate(ctx, config);
    }
    generateTests(ctx, config) {
        return this.testGenerator.generate(ctx, config);
    }
    supportsHeaderCookieParameters() {
        return true;
    }
    supportsNonJsonRequestBodyMediaTypes(mediaTypes) {
        if (!Array.isArray(mediaTypes) || mediaTypes.length === 0) {
            return false;
        }
        return mediaTypes.every((mediaType) => ['multipart/form-data', 'application/x-www-form-urlencoded'].includes(mediaType.toLowerCase()));
    }
}
export { RUST_CONFIG } from './config.js';
export { ModelGenerator } from './model-generator.js';
export { ApiGenerator } from './api-generator.js';
export { HttpClientGenerator } from './http-generator.js';
export { BuildConfigGenerator } from './build-config-generator.js';
export { ReadmeGenerator } from './readme-generator.js';
export { TestGenerator } from './test-generator.js';
