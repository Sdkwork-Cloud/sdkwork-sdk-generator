import type { GeneratedFile } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { KOTLIN_CONFIG } from './config.js';
import { resolveJvmCommonPackage } from '../../framework/common-package.js';

export class BuildConfigGenerator {
  generate(config: GeneratorConfig): GeneratedFile[] {
    return [
      this.generateBuildGradle(config),
    ];
  }

  private generateBuildGradle(config: GeneratorConfig): GeneratedFile {
    const artifactId = `${config.sdkType}-sdk`;
    const commonPkg = resolveJvmCommonPackage(config);
    
    return {
      path: 'build.gradle.kts',
      content: this.format(`plugins {
    kotlin("jvm") version "1.9.0"
}

group = "com.sdkwork"
version = "${config.version}"

repositories {
    mavenCentral()
}

dependencies {
    implementation("${commonPkg.groupId}:${commonPkg.artifactId}:${commonPkg.version}")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.fasterxml.jackson.core:jackson-databind:2.16.0")
    implementation(kotlin("stdlib"))
}

tasks.test {
    useJUnitPlatform()
}

kotlin {
    jvmToolchain(11)
}
`),
      language: 'kotlin',
      description: 'Gradle configuration',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
