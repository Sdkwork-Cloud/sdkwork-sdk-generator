import type { GeneratedFile } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { getPythonPackageRoot } from './config.js';
import { resolvePythonCommonPackage } from '../../framework/common-package.js';

export class BuildConfigGenerator {
  generate(config: GeneratorConfig): GeneratedFile[] {
    return [
      this.generateSetupPy(config),
      this.generatePyprojectToml(config),
      this.generateRequirements(config),
      this.generateManifest(config),
    ];
  }

  private generateSetupPy(config: GeneratorConfig): GeneratedFile {
    const pkgName = config.packageName || `sdkwork-${config.sdkType}-sdk`;
    const commonPkg = resolvePythonCommonPackage(config);
    
    return {
      path: 'setup.py',
      content: this.format(`from setuptools import setup, find_packages

setup(
    name="${pkgName}",
    version="${config.version}",
    description="${config.description || config.name + ' SDK'}",
    author="${config.author || 'SDKWork Team'}",
    author_email="support@sdkwork.com",
    url="https://github.com/sdkwork/${pkgName}",
    packages=find_packages(),
    install_requires=[
        "${commonPkg.requirement}",
    ],
    python_requires=">=3.8",
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
)
`),
      language: 'python',
      description: 'Setup configuration',
    };
  }

  private generatePyprojectToml(config: GeneratorConfig): GeneratedFile {
    const pkgName = config.packageName || `sdkwork-${config.sdkType}-sdk`;
    const commonPkg = resolvePythonCommonPackage(config);
    
    return {
      path: 'pyproject.toml',
      content: this.format(`[build-system]
requires = ["setuptools>=61.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "${pkgName}"
version = "${config.version}"
description = "${config.description || config.name + ' SDK'}"
authors = [{name = "${config.author || 'SDKWork Team'}"}]
requires-python = ">=3.8"
dependencies = [
    "${commonPkg.requirement}",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0.0",
    "pytest-asyncio>=0.21.0",
    "black>=23.0.0",
    "mypy>=1.0.0",
]

[tool.black]
line-length = 100
target-version = ['py38', 'py39', 'py310', 'py311', 'py312']

[tool.mypy]
python_version = "3.8"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = false

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
`),
      language: 'python',
      description: 'Project configuration',
    };
  }

  private generateRequirements(config: GeneratorConfig): GeneratedFile {
    const commonPkg = resolvePythonCommonPackage(config);
    return {
      path: 'requirements.txt',
      content: `${commonPkg.requirement}
`,
      language: 'python',
      description: 'Requirements',
    };
  }

  private generateManifest(config: GeneratorConfig): GeneratedFile {
    const packageRoot = getPythonPackageRoot(config);
    return {
      path: 'MANIFEST.in',
      content: `include README.md
include LICENSE
recursive-include ${packageRoot} *.py
`,
      language: 'python',
      description: 'Package manifest',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
