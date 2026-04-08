import { getPythonPackageRoot } from './config.js';
import { resolvePythonCommonPackage } from '../../framework/common-package.js';
export class BuildConfigGenerator {
    generate(config) {
        return [
            this.generateSetupPy(config),
            this.generatePyprojectToml(config),
            this.generateRequirements(config),
            this.generateManifest(config),
        ];
    }
    generateSetupPy(config) {
        return {
            path: 'setup.py',
            content: this.format(`from setuptools import setup

setup()
`),
            language: 'python',
            description: 'Setup configuration',
        };
    }
    generatePyprojectToml(config) {
        const pkgName = config.packageName || `sdkwork-${config.sdkType}-sdk`;
        const commonPkg = resolvePythonCommonPackage(config);
        const packageRoot = getPythonPackageRoot(config);
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
readme = "README.md"
license = "MIT"
requires-python = ">=3.8"
dependencies = [
    "${commonPkg.requirement}",
]
classifiers = [
    "Development Status :: 4 - Beta",
    "Intended Audience :: Developers",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3.8",
    "Programming Language :: Python :: 3.9",
    "Programming Language :: Python :: 3.10",
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
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

[tool.setuptools.packages.find]
include = ["${packageRoot}*"]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
`),
            language: 'python',
            description: 'Project configuration',
        };
    }
    generateRequirements(config) {
        const commonPkg = resolvePythonCommonPackage(config);
        return {
            path: 'requirements.txt',
            content: `${commonPkg.requirement}
`,
            language: 'python',
            description: 'Requirements',
        };
    }
    generateManifest(config) {
        const packageRoot = getPythonPackageRoot(config);
        return {
            path: 'MANIFEST.in',
            content: `include README.md
recursive-include ${packageRoot} *.py
`,
            language: 'python',
            description: 'Package manifest',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
