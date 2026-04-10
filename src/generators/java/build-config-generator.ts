import type { GeneratedFile } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { JAVA_CONFIG } from './config.js';
import { resolveJvmCommonPackage } from '../../framework/common-package.js';
import { resolveJvmSdkIdentity } from '../../framework/jvm-sdk-identity.js';

export class BuildConfigGenerator {
  generate(config: GeneratorConfig): GeneratedFile[] {
    return [
      this.generatePomXml(config),
    ];
  }

  private generatePomXml(config: GeneratorConfig): GeneratedFile {
    const identity = resolveJvmSdkIdentity(config);
    const commonPkg = resolveJvmCommonPackage(config);
    const testDependencies = config.generateTests === true ? `
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>5.10.2</version>
            <scope>test</scope>
        </dependency>` : '';
    const surefirePlugin = config.generateTests === true ? `
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.2.5</version>
            </plugin>` : '';
    
    return {
      path: 'pom.xml',
      content: this.format(`<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>${identity.groupId}</groupId>
    <artifactId>${identity.artifactId}</artifactId>
    <version>${identity.version}</version>
    <packaging>jar</packaging>

    <name>${config.name}</name>
    <description>${config.description || config.name + ' SDK'}</description>

    <properties>
        <maven.compiler.source>11</maven.compiler.source>
        <maven.compiler.target>11</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <dependencies>
        <dependency>
            <groupId>${commonPkg.groupId}</groupId>
            <artifactId>${commonPkg.artifactId}</artifactId>
            <version>${commonPkg.version}</version>
        </dependency>
        <dependency>
            <groupId>com.squareup.okhttp3</groupId>
            <artifactId>okhttp</artifactId>
            <version>4.12.0</version>
        </dependency>
        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-databind</artifactId>
            <version>2.16.0</version>
        </dependency>
${testDependencies}
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.11.0</version>
                <configuration>
                    <source>11</source>
                    <target>11</target>
                </configuration>
            </plugin>
${surefirePlugin}
        </plugins>
    </build>
</project>
`),
      language: 'java',
      description: 'Maven configuration',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
