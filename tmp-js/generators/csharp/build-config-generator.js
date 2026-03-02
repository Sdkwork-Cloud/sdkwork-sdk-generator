import { CSHARP_CONFIG } from './config.js';
import { resolveCSharpCommonPackage } from '../../framework/common-package.js';
export class BuildConfigGenerator {
    generate(config) {
        return [
            this.generateCsProj(config),
        ];
    }
    generateCsProj(config) {
        const namespace = CSHARP_CONFIG.namingConventions.modelName(config.sdkType);
        const commonPkg = resolveCSharpCommonPackage(config);
        return {
            path: `${namespace}.csproj`,
            content: this.format(`<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <LangVersion>latest</LangVersion>
    <RootNamespace>${namespace}</RootNamespace>
    <AssemblyName>${namespace}</AssemblyName>
    <Version>${config.version}</Version>
    <Authors>${config.author || 'SDKWork Team'}</Authors>
    <Description>${config.description || config.name + ' SDK'}</Description>
    <PackageLicenseExpression>${config.license || 'MIT'}</PackageLicenseExpression>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="${commonPkg.packageId}" Version="${commonPkg.version}" />
    <PackageReference Include="System.Net.Http.Json" Version="6.0.0" />
  </ItemGroup>

</Project>
`),
            language: 'csharp',
            description: 'Project configuration',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
