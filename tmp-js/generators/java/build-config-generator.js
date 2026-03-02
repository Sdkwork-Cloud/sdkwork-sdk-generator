import { resolveJvmCommonPackage } from '../../framework/common-package.js';
export class BuildConfigGenerator {
    generate(config) {
        return [
            this.generatePomXml(config),
        ];
    }
    generatePomXml(config) {
        const artifactId = `${config.sdkType}-sdk`;
        const commonPkg = resolveJvmCommonPackage(config);
        return {
            path: 'pom.xml',
            content: this.format(`<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.sdkwork</groupId>
    <artifactId>${artifactId}</artifactId>
    <version>${config.version}</version>
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
        </plugins>
    </build>
</project>
`),
            language: 'java',
            description: 'Maven configuration',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
