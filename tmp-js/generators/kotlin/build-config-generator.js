import { resolveJvmCommonPackage } from '../../framework/common-package.js';
import { resolveJvmSdkIdentity } from '../../framework/jvm-sdk-identity.js';
export class BuildConfigGenerator {
    generate(config) {
        return [
            this.generateBuildGradle(config),
            this.generateSettingsGradle(config),
        ];
    }
    generateBuildGradle(config) {
        const identity = resolveJvmSdkIdentity(config);
        const commonPkg = resolveJvmCommonPackage(config);
        const testDependencies = config.generateTests === true ? `
    testImplementation(kotlin("test"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")` : '';
        return {
            path: 'build.gradle.kts',
            content: this.format(`plugins {
    kotlin("jvm") version "1.9.0"
}

group = "${identity.groupId}"
version = "${identity.version}"

base {
    archiveBaseName.set("${identity.artifactId}")
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("${commonPkg.groupId}:${commonPkg.artifactId}:${commonPkg.version}")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.fasterxml.jackson.core:jackson-databind:2.16.0")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.16.0")
    implementation(kotlin("stdlib"))
${testDependencies}
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
    generateSettingsGradle(config) {
        const identity = resolveJvmSdkIdentity(config);
        return {
            path: 'settings.gradle.kts',
            content: this.format(`rootProject.name = "${identity.artifactId}"`),
            language: 'kotlin',
            description: 'Gradle settings',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
