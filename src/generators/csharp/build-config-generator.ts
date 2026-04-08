import fs from 'node:fs';
import path from 'node:path';

import type { GeneratedFile } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { getCSharpNamespace, getCSharpPackageId } from './config.js';
import { resolveCSharpCommonPackage } from '../../framework/common-package.js';

export class BuildConfigGenerator {
  generate(config: GeneratorConfig): GeneratedFile[] {
    return [
      this.generateCsProj(config),
    ];
  }

  private generateCsProj(config: GeneratorConfig): GeneratedFile {
    const namespace = getCSharpNamespace(config);
    const packageId = getCSharpPackageId(config);
    const commonPkg = resolveCSharpCommonPackage(config);
    const localCommonProjectPath = this.findLocalCommonProjectPath(
      config.outputPath,
      ['sdk', 'sdkwork-sdk-commons', 'sdkwork-sdk-common-csharp', 'SDKwork.Common.csproj'],
    );
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

  private format(content: string): string {
    return content.trim() + '\n';
  }

  private findLocalCommonProjectPath(outputPath: string, targetSegments: string[]): string | null {
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
