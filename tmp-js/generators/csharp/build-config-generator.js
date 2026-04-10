import fs from 'node:fs';
import path from 'node:path';
import { getCSharpNamespace, getCSharpPackageId } from './config.js';
import { resolveCSharpCommonPackage } from '../../framework/common-package.js';
export class BuildConfigGenerator {
    generate(config) {
        const files = [this.generateCsProj(config)];
        if (config.generateTests === true) {
            files.push(this.generateTestCsProj(config));
        }
        return files;
    }
    generateCsProj(config) {
        const namespace = getCSharpNamespace(config);
        const packageId = getCSharpPackageId(config);
        const commonPkg = resolveCSharpCommonPackage(config);
        const localCommonProjectPath = this.findLocalCommonProjectPath(config.outputPath, ['sdk', 'sdkwork-sdk-commons', 'sdkwork-sdk-common-csharp', 'SDKwork.Common.csproj']);
        const commonReferenceGroup = localCommonProjectPath
            ? `  <ItemGroup Condition="Exists('${localCommonProjectPath}')">
    <ProjectReference Include="${localCommonProjectPath}" />
  </ItemGroup>

  <ItemGroup Condition="!Exists('${localCommonProjectPath}')">
    <PackageReference Include="${commonPkg.packageId}" Version="${commonPkg.version}" />
  </ItemGroup>`
            : `  <ItemGroup>
    <PackageReference Include="${commonPkg.packageId}" Version="${commonPkg.version}" />
  </ItemGroup>`;
        return {
            path: `${packageId}.csproj`,
            content: this.format(`<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <LangVersion>latest</LangVersion>
    <RootNamespace>${namespace}</RootNamespace>
    <AssemblyName>${namespace}</AssemblyName>
    <PackageId>${packageId}</PackageId>
    <Version>${config.version}</Version>
    <Authors>${config.author || 'SDKWork Team'}</Authors>
    <Description>${config.description || config.name + ' SDK'}</Description>
    <PackageLicenseExpression>${config.license || 'MIT'}</PackageLicenseExpression>
  </PropertyGroup>

${commonReferenceGroup}

  <ItemGroup>
    <PackageReference Include="System.Net.Http.Json" Version="6.0.0" />
  </ItemGroup>

</Project>
`),
            language: 'csharp',
            description: 'Project configuration',
        };
    }
    generateTestCsProj(config) {
        const packageId = getCSharpPackageId(config);
        return {
            path: `Tests/${packageId}.Tests.csproj`,
            content: this.format(`<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsTestProject>true</IsTestProject>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="../${packageId}.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.10.0" />
    <PackageReference Include="xunit" Version="2.9.0" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2">
      <PrivateAssets>all</PrivateAssets>
      <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
    </PackageReference>
  </ItemGroup>

</Project>
`),
            language: 'csharp',
            description: 'xUnit smoke-test project',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
    findLocalCommonProjectPath(outputPath, targetSegments) {
        const outputDir = path.resolve(outputPath);
        let currentDir = outputDir;
        while (true) {
            const candidate = path.join(currentDir, ...targetSegments);
            if (fs.existsSync(candidate)) {
                return path.relative(outputDir, candidate).replace(/\\/g, '/');
            }
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                return null;
            }
            currentDir = parentDir;
        }
    }
}
