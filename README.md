# SDKWork SDK Generator

Professional SDK code generator for multiple programming languages. Generate type-safe, well-structured SDKs from OpenAPI specifications.

## Features

- **Multi-language Support**: TypeScript, Python, Go, Java, Swift, Kotlin, Flutter, C#
- **Type-safe**: Generate strongly typed models and API clients
- **Modular Architecture**: Each generator has independent sub-modules for models, APIs, HTTP client, build config, and docs
- **README System**: Every generated SDK always includes a top-level `README.md`
- **Unified Client Naming**: `Sdkwork{SdkType}Client` across all languages (for example `SdkworkAiClient`)
- **Auth Clarity**: README examples document API key mode and dual-token mode as mutually exclusive
- **Unified Publish Bin**: Every generated language SDK includes `bin/publish-core.mjs`, `bin/publish.sh`, and `bin/publish.ps1`
- **Unified Imports**: All imports use the main package entry (no sub-path imports)
- **Async/Await**: Modern async patterns for all languages
- **Strict Spec Validation**: Generation fails fast if input is not OpenAPI 3.x, has no `paths`, or is an upstream error payload (`code/msg` wrapper)
## Installation

```bash
npm install @sdkwork/sdk-generator
```

## CLI Usage

### Generate SDK

```bash
sdkgen generate -i ./openapi.json -o ./sdk -n MySDK -l typescript
```

By default the generator resolves the SDK version from the highest available baseline:

- existing generated SDK manifests in the workspace
- the published npm version for the TypeScript package
- an explicitly requested `--sdk-version`

For multi-language batch generation, resolve the version once and pass it back with `--fixed-sdk-version` so every language uses the same release number.

### Options

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-i, --input` | Path to OpenAPI specification | Yes | - |
| `-o, --output` | Output directory | Yes | - |
| `-n, --name` | SDK name | Yes | - |
| `-l, --language` | Target language | No | `typescript` |
| `-t, --type` | SDK type (app, backend, ai) | No | `backend` |
| `--sdk-version` | Requested SDK version, auto-bumped if it is not newer than local/npm baseline | No | Auto-resolved |
| `--fixed-sdk-version` | Use an exact SDK version without auto-increment checks | No | - |
| `--npm-registry` | Registry used for published TypeScript SDK version checks | No | `https://registry.npmjs.org` |
| `--sdk-root` | Workspace root used to scan sibling generated SDK versions | No | - |
| `--sdk-name` | Workspace prefix, for example `sdkwork-app-sdk` | No | - |
| `--no-sync-published-version` | Skip published npm version checks when resolving SDK version | No | `false` |
| `--base-url` | Base URL for API | No | From spec |
| `--api-prefix` | API path prefix | No | `/api/v1` |
| `--package-name` | Package name | No | Auto-generated |
| `--common-package` | Override language common component | No | Language default |
| `--namespace` | Namespace (C#) | No | `SDKWork.SDK` |
| `--author` | Author name | No | `SDKWork Team` |
| `--license` | License | No | `MIT` |
| `--description` | SDK description | No | - |

### Supported Languages

```bash
sdkgen languages
```

| Language | Flag | Description |
|----------|------|-------------|
| TypeScript | `typescript` | TypeScript/JavaScript with full type support |
| Python | `python` | Python 3.8+ with type hints |
| Go | `go` | Go 1.21+ with strong typing |
| Java | `java` | Java 11+ with OkHttp and Jackson |
| Swift | `swift` | Swift 5.7+ for iOS/macOS |
| Kotlin | `kotlin` | Kotlin 1.9+ for Android/JVM |
| Flutter | `flutter` | Flutter/Dart 3.0+ for cross-platform |
| C# | `csharp` | C# .NET 6+ with HttpClient |

### Initialize New SDK Project

```bash
sdkgen init -n MySDK -l typescript -t backend
```

## Programmatic Usage

```typescript
import { TypeScriptGenerator, PythonGenerator, GoGenerator } from '@sdkwork/sdk-generator';
import type { GeneratorConfig, ApiSpec } from '@sdkwork/sdk-generator';
import { readFileSync } from 'fs';

const spec: ApiSpec = JSON.parse(readFileSync('./openapi.json', 'utf-8'));

const config: GeneratorConfig = {
  name: 'MySDK',
  version: '1.0.0',
  language: 'typescript',
  sdkType: 'backend',
  outputPath: './sdk',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/api/v1',
  packageName: '@mycompany/sdk',
  author: 'My Company',
  license: 'MIT',
  description: 'My API SDK',
};

// Using specific generator
const generator = new TypeScriptGenerator();
const result = await generator.generate(config, spec);

console.log(`Generated ${result.files.length} files`);
console.log(`Models: ${result.stats.models}`);
console.log(`APIs: ${result.stats.apis}`);

result.files.forEach(file => {
  console.log(`- ${file.path}`);
});
```

## Architecture

### Modular Generator Structure

Each language generator follows a consistent modular architecture:

```
generators/
|-- typescript/
|   |-- index.ts              # Main generator class
|   |-- config.ts             # Language config & type mapping
|   |-- model-generator.ts    # Model generation
|   |-- api-generator.ts      # API endpoints generation
|   |-- http-generator.ts     # HTTP client generation
|   |-- build-config-generator.ts  # Build configuration
|   -- readme-generator.ts   # Documentation generation
|-- python/
|-- go/
|-- java/
|-- swift/
|-- kotlin/
|-- flutter/
-- csharp/
```

### Generator Components

| Component | Description |
|-----------|-------------|
| `config.ts` | Language configuration, type mappings, naming conventions |
| `model-generator.ts` | Generates data models/DTOs from OpenAPI schemas |
| `api-generator.ts` | Generates API endpoint classes with methods |
| `http-generator.ts` | Generates HTTP client with auth support |
| `build-config-generator.ts` | Generates package config (package.json, pom.xml, etc.) |
| `bin/publish*.{mjs,sh,ps1}` | Generates cross-platform publish scripts for each language package |
| `readme-generator.ts` | Generates README with usage examples |

## SDK Types

### App SDK (`app`)

For mobile and web applications. Includes:
- User authentication
- Public API access
- Mobile-optimized client

### Backend SDK (`backend`)

For server-side applications. Includes:
- Admin authentication
- Full API access
- Management endpoints


## Client Naming And README Rules

- Client class naming is unified as `Sdkwork{SdkType}Client`.
- Example mappings:
  - `app` -> `SdkworkAppClient`
  - `backend` -> `SdkworkBackendClient`
  - `ai` -> `SdkworkAiClient`
- README generation is mandatory for every language and every sdk type.
- Authentication examples in generated README always state that API key mode and dual-token mode are mutually exclusive.
## Generated Structure

### TypeScript

```
sdk/
|-- src/
|   |-- api/
|   |   |-- base.ts           # Base API class
|   |   |-- paths.ts          # API path utilities
|   |   |-- user.ts           # User API module
|   |   -- index.ts          # API exports
|   |-- http/
|   |   |-- client.ts         # HTTP client
|   |   -- index.ts          # HTTP exports
|   |-- auth/
|   |   -- index.ts          # Auth exports
|   |-- types/
|   |   |-- common.ts         # Common types
|   |   |-- user.ts           # Model types
|   |   -- index.ts          # Type exports
|   |-- sdk.ts                # Main SDK class
|   -- index.ts              # Main exports
|-- package.json
|-- tsconfig.json
|-- vite.config.ts
-- README.md
```

### Python

```
sdk/
|-- <python_package_root>/
|   |-- __init__.py
|   |-- client.py             # Main SDK client
|   |-- api/
|   |   |-- __init__.py
|   |   -- user.py           # User API module
|   |-- http_client.py        # HTTP client wrapper
|   |-- models/
|   |   |-- __init__.py
|   |   -- user.py           # Model classes
|-- setup.py
|-- pyproject.toml
|-- requirements.txt
-- README.md
```

### Go

```
sdk/
|-- types/
|   |-- common.go             # Common types
|   |-- user.go               # Model structs
|   -- doc.go                # Package docs
|-- api/
|   |-- base.go               # Base API struct
|   |-- paths.go              # API path utilities
|   |-- user.go               # User API module
|   -- doc.go                # Package docs
|-- http/
|   |-- client.go             # HTTP client
|   -- doc.go                # Package docs
|-- sdk.go                    # Main SDK struct
|-- doc.go                    # Package docs
|-- go.mod
|-- go.sum
-- README.md
```

### Java

```
sdk/
|-- src/main/java/com/sdkwork/backend/
|   |-- SdkworkBackendClient.java    # Main SDK client
|   |-- api/
|   |   |-- ApiPaths.java     # API path utilities
|   |   |-- UserApi.java      # User API class
|   |   -- package-info.java # Package info
|   |-- http/
|   |   -- HttpClient.java   # HTTP client
|   -- model/
|       -- User.java         # Model class
|-- pom.xml
-- README.md
```

### Swift

```
sdk/
|-- Sources/
|   |-- SdkworkBackendClient.swift   # Main SDK client
|   |-- API/
|   |   |-- ApiPaths.swift    # API path utilities
|   |   |-- UserApi.swift     # User API class
|   |   -- API.swift         # API exports
|   |-- HTTP/
|   |   -- HttpClient.swift  # HTTP client
|   -- Models.swift          # Model structs
|-- Package.swift
-- README.md
```

### Kotlin

```
sdk/
|-- src/main/kotlin/com/sdkwork/backend/
|   |-- SdkworkBackendClient.kt      # Main SDK client
|   |-- api/
|   |   |-- ApiPaths.kt       # API path utilities
|   |   |-- UserApi.kt        # User API class
|   |   -- Api.kt            # API exports
|   |-- http/
|   |   -- HttpClient.kt     # HTTP client
|   -- User.kt               # Model class
|-- build.gradle.kts
-- README.md
```

### Flutter/Dart

```
sdk/
|-- lib/
|   |-- backend_client.dart   # Main SDK client
|   |-- src/
|   |   |-- api/
|   |   |   |-- paths.dart    # API path utilities
|   |   |   |-- user.dart     # User API class
|   |   |   -- api.dart      # API exports
|   |   |-- http/
|   |   |   -- client.dart   # HTTP client
|   |   -- models.dart       # Model classes
|-- pubspec.yaml
-- README.md
```

### C# (.NET)

```
sdk/
|-- SdkworkBackendClient.cs          # Main SDK client
|-- Api/
|   |-- ApiPaths.cs           # API path utilities
|   |-- UserApi.cs            # User API class
|   -- Api.cs                # API exports
|-- Http/
|   -- HttpClient.cs         # HTTP client
|-- Models/
|   -- User.cs               # Model class
|-- Backend.csproj
-- README.md
```

## Import Standards

All generated TypeScript SDKs import from the package root:

```typescript
import { SdkError, Page, BaseHttpClient } from '@sdkwork/sdk-common';
```

Sub-path imports are not generated.

## Common Package

Generated SDKs depend on language-specific SDKWork common components:

- TypeScript: `@sdkwork/sdk-common`
- Python: `sdkwork-common`
- Go: `github.com/sdkwork/sdk-common-go`
- Java/Kotlin: `com.sdkwork:sdk-common`
- Swift: `SDKworkCommon` (Swift Package)
- C#: `SDKwork.Common`
- Flutter: `sdkwork_common_flutter`

You can override the common component through CLI:

```bash
sdkgen generate ... --common-package "<language-specific-spec>"
```

`--common-package` accepts language-specific formats:

- TypeScript: `@scope/pkg@^1.2.3` or `@scope/pkg@^1.2.3|@scope/pkg` (root import only; sub-path values are normalized to package root)
- Python: `sdkwork-common>=1.0.0` or `sdkwork-common>=1.0.0|sdkwork.common`
- Java/Kotlin: `group:artifact:version` or `group:artifact:version|com.example.common.core`
- Go: `github.com/org/common-go@v1.2.3` or `github.com/org/common-go@v1.2.3|github.com/org/common-go/common`
- Swift: `https://host/common-swift.git@1.2.3` or `https://host/common-swift.git@1.2.3|CommonProduct`
- C#: `Common.Package@1.2.3` or `Common.Package@1.2.3|Common.Package.Core`
- Flutter: `sdkwork_common_flutter@^1.2.3` or `sdkwork_common_flutter@^1.2.3|package:sdkwork_common_flutter/sdkwork_common_flutter.dart`

These common packages provide:

- **HTTP Client**: Base HTTP client with retry, caching, and interceptors
- **Authentication**: Token management and auth headers
- **Error Handling**: Standardized error classes
- **Types**: Common types like `Page`, `PageResult`, `RequestConfig`
- **Utilities**: Logger, cache store, retry logic

## Scripts

### Generated Package Publish Scripts

Every generated language package includes:

- `bin/publish-core.mjs`
- `bin/publish.sh`
- `bin/publish.ps1`

Use from package root:

```bash
./bin/publish.sh --action check
./bin/publish.sh --action publish --channel release
```

```powershell
.\bin\publish.ps1 --action publish --channel test --dry-run
```

Supported actions:

- `check`
- `build`
- `publish`

### TypeScript Additional Build Helpers

TypeScript packages also include legacy build helpers:

```batch
bin\sdk-gen.bat build
```

```bash
./bin/sdk-gen.sh build
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run dev

# Lint
npm run lint
```

## API Reference

### BaseGenerator

Abstract base class for all language generators:

```typescript
abstract class BaseGenerator {
  readonly language: Language;
  readonly displayName: string;
  readonly description: string;
  readonly fileExtension: string;
  readonly supportsTests: boolean;

  abstract generateModels(ctx: SchemaContext): GeneratedFile[];
  abstract generateApis(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[];
  abstract generateClient(config: GeneratorConfig): GeneratedFile[];
  abstract generateBuildConfig(config: GeneratorConfig): GeneratedFile[];
  abstract generateBinScripts(config: GeneratorConfig): GeneratedFile[];
  abstract generateReadme(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile;

  async generate(config: GeneratorConfig, spec: ApiSpec): Promise<GeneratorResult>;
}
```

### LanguageConfig

Configuration for each language:

```typescript
interface LanguageConfig {
  language: Language;
  displayName: string;
  description: string;
  fileExtension: string;
  supportsTests: boolean;
  supportsStrictTypes: boolean;
  supportsAsyncAwait: boolean;
  defaultIndent: string;
  lineEnding: string;
  typeMapping: TypeMapping;
  namingConventions: NamingConventions;
}
```

## License

MIT


