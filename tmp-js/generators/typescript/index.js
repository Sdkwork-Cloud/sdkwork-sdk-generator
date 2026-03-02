import { BaseGenerator } from '../../framework/base.js';
import { TYPESCRIPT_CONFIG } from './config.js';
import { ModelGenerator } from './model-generator.js';
import { ApiGenerator } from './api-generator.js';
import { HttpClientGenerator } from './http-generator.js';
import { BuildConfigGenerator } from './build-config-generator.js';
import { ReadmeGenerator } from './readme-generator.js';
export class TypeScriptGenerator extends BaseGenerator {
    constructor() {
        super(TYPESCRIPT_CONFIG);
        this.modelGenerator = new ModelGenerator();
        this.apiGenerator = new ApiGenerator();
        this.httpClientGenerator = new HttpClientGenerator();
        this.buildConfigGenerator = new BuildConfigGenerator();
        this.readmeGenerator = new ReadmeGenerator();
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
    generateBinScripts(config) {
        const name = this.toPascalCase(config.sdkType);
        return [
            {
                path: 'bin/sdk-gen.bat',
                content: `@echo off
echo SDKWork ${name} SDK
if "%1"=="" goto help
if "%1"=="build" goto build
:help
echo Usage: sdk-gen.bat build
:build
cd /d "%~dp0.."
npm install && npm run build
`,
                language: 'typescript',
                description: 'Windows build script',
            },
            {
                path: 'bin/sdk-gen.sh',
                content: `#!/bin/bash
echo "SDKWork ${name} SDK"
case "$1" in
  build)
    cd "$(dirname "$0")/.." && npm install && npm run build
    ;;
  *)
    echo "Usage: $0 build"
    ;;
esac
`,
                language: 'typescript',
                description: 'Unix build script',
            },
        ];
    }
    generateReadme(ctx, config) {
        return this.readmeGenerator.generate(ctx, config);
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
}
export { TYPESCRIPT_CONFIG } from './config.js';
export { ModelGenerator } from './model-generator.js';
export { ApiGenerator } from './api-generator.js';
export { HttpClientGenerator } from './http-generator.js';
export { BuildConfigGenerator } from './build-config-generator.js';
export { ReadmeGenerator } from './readme-generator.js';
