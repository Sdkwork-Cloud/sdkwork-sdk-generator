# SDKWork SDK Generator

Professional SDK code generator for multiple programming languages. Generate type-safe, well-structured SDKs from OpenAPI specifications.

## Features

- **Multi-language Support**: TypeScript, Python, Go, Java, Swift, Kotlin, Flutter, C#
- **Type-safe**: Generate strongly typed models and API clients
- **Modular Architecture**: Each generator has independent sub-modules for models, APIs, HTTP client, build config, and docs
- **README System**: Every generated SDK always includes a top-level `README.md`
- **Unified Client Naming**: `Sdkwork{SdkType}Client` across all languages (for example `SdkworkAiClient`)
- **Auth Clarity**: README examples document API key mode and dual-token mode as mutually exclusive
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

### Options

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-i, --input` | Path to OpenAPI specification | Yes | - |
| `-o, --output` | Output directory | Yes | - |
| `-n, --name` | SDK name | Yes | - |
| `-l, --language` | Target language | No | `typescript` |
| `-t, --type` | SDK type (app, backend, ai) | No | `backend` |
| `--sdk-version` | SDK version | No | `1.0.0` |
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
鈹溾攢鈹€ typescript/
鈹?  鈹溾攢鈹€ index.ts              # Main generator class
鈹?  鈹溾攢鈹€ config.ts             # Language config & type mapping
鈹?  鈹溾攢鈹€ model-generator.ts    # Model generation
鈹?  鈹溾攢鈹€ api-generator.ts      # API endpoints generation
鈹?  鈹溾攢鈹€ http-generator.ts     # HTTP client generation
鈹?  鈹溾攢鈹€ build-config-generator.ts  # Build configuration
鈹?  鈹斺攢鈹€ readme-generator.ts   # Documentation generation
鈹溾攢鈹€ python/
鈹溾攢鈹€ go/
鈹溾攢鈹€ java/
鈹溾攢鈹€ swift/
鈹溾攢鈹€ kotlin/
鈹溾攢鈹€ flutter/
鈹斺攢鈹€ csharp/
```

### Generator Components

| Component | Description |
|-----------|-------------|
| `config.ts` | Language configuration, type mappings, naming conventions |
| `model-generator.ts` | Generates data models/DTOs from OpenAPI schemas |
| `api-generator.ts` | Generates API endpoint classes with methods |
| `http-generator.ts` | Generates HTTP client with auth support |
| `build-config-generator.ts` | Generates package config (package.json, pom.xml, etc.) |
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
鈹溾攢鈹€ src/
鈹?  鈹溾攢鈹€ api/
鈹?  鈹?  鈹溾攢鈹€ base.ts           # Base API class
鈹?  鈹?  鈹溾攢鈹€ paths.ts          # API path utilities
鈹?  鈹?  鈹溾攢鈹€ user.ts           # User API module
鈹?  鈹?  鈹斺攢鈹€ index.ts          # API exports
鈹?  鈹溾攢鈹€ http/
鈹?  鈹?  鈹溾攢鈹€ client.ts         # HTTP client
鈹?  鈹?  鈹斺攢鈹€ index.ts          # HTTP exports
鈹?  鈹溾攢鈹€ auth/
鈹?  鈹?  鈹斺攢鈹€ index.ts          # Auth exports
鈹?  鈹溾攢鈹€ types/
鈹?  鈹?  鈹溾攢鈹€ common.ts         # Common types
鈹?  鈹?  鈹溾攢鈹€ user.ts           # Model types
鈹?  鈹?  鈹斺攢鈹€ index.ts          # Type exports
鈹?  鈹溾攢鈹€ sdk.ts                # Main SDK class
鈹?  鈹斺攢鈹€ index.ts              # Main exports
鈹溾攢鈹€ package.json
鈹溾攢鈹€ tsconfig.json
鈹溾攢鈹€ vite.config.ts
鈹斺攢鈹€ README.md
```

### Python

```
sdk/
鈹溾攢鈹€ <python_package_root>/
鈹?  鈹溾攢鈹€ __init__.py
鈹?  鈹溾攢鈹€ client.py             # Main SDK client
鈹?  鈹溾攢鈹€ api/
鈹?  鈹?  鈹溾攢鈹€ __init__.py
鈹?  鈹?  鈹斺攢鈹€ user.py           # User API module
鈹?  鈹溾攢鈹€ http_client.py        # HTTP client wrapper
鈹?  鈹溾攢鈹€ models/
鈹?  鈹?  鈹溾攢鈹€ __init__.py
鈹?  鈹?  鈹斺攢鈹€ user.py           # Model classes
鈹溾攢鈹€ setup.py
鈹溾攢鈹€ pyproject.toml
鈹溾攢鈹€ requirements.txt
鈹斺攢鈹€ README.md
```

### Go

```
sdk/
鈹溾攢鈹€ types/
鈹?  鈹溾攢鈹€ common.go             # Common types
鈹?  鈹溾攢鈹€ user.go               # Model structs
鈹?  鈹斺攢鈹€ doc.go                # Package docs
鈹溾攢鈹€ api/
鈹?  鈹溾攢鈹€ base.go               # Base API struct
鈹?  鈹溾攢鈹€ paths.go              # API path utilities
鈹?  鈹溾攢鈹€ user.go               # User API module
鈹?  鈹斺攢鈹€ doc.go                # Package docs
鈹溾攢鈹€ http/
鈹?  鈹溾攢鈹€ client.go             # HTTP client
鈹?  鈹斺攢鈹€ doc.go                # Package docs
鈹溾攢鈹€ sdk.go                    # Main SDK struct
鈹溾攢鈹€ doc.go                    # Package docs
鈹溾攢鈹€ go.mod
鈹溾攢鈹€ go.sum
鈹斺攢鈹€ README.md
```

### Java

```
sdk/
鈹溾攢鈹€ src/main/java/com/sdkwork/backend/
鈹?  鈹溾攢鈹€ SdkworkBackendClient.java    # Main SDK client
鈹?  鈹溾攢鈹€ api/
鈹?  鈹?  鈹溾攢鈹€ ApiPaths.java     # API path utilities
鈹?  鈹?  鈹溾攢鈹€ UserApi.java      # User API class
鈹?  鈹?  鈹斺攢鈹€ package-info.java # Package info
鈹?  鈹溾攢鈹€ http/
鈹?  鈹?  鈹斺攢鈹€ HttpClient.java   # HTTP client
鈹?  鈹斺攢鈹€ model/
鈹?      鈹斺攢鈹€ User.java         # Model class
鈹溾攢鈹€ pom.xml
鈹斺攢鈹€ README.md
```

### Swift

```
sdk/
鈹溾攢鈹€ Sources/
鈹?  鈹溾攢鈹€ SdkworkBackendClient.swift   # Main SDK client
鈹?  鈹溾攢鈹€ API/
鈹?  鈹?  鈹溾攢鈹€ ApiPaths.swift    # API path utilities
鈹?  鈹?  鈹溾攢鈹€ UserApi.swift     # User API class
鈹?  鈹?  鈹斺攢鈹€ API.swift         # API exports
鈹?  鈹溾攢鈹€ HTTP/
鈹?  鈹?  鈹斺攢鈹€ HttpClient.swift  # HTTP client
鈹?  鈹斺攢鈹€ Models.swift          # Model structs
鈹溾攢鈹€ Package.swift
鈹斺攢鈹€ README.md
```

### Kotlin

```
sdk/
鈹溾攢鈹€ src/main/kotlin/com/sdkwork/backend/
鈹?  鈹溾攢鈹€ SdkworkBackendClient.kt      # Main SDK client
鈹?  鈹溾攢鈹€ api/
鈹?  鈹?  鈹溾攢鈹€ ApiPaths.kt       # API path utilities
鈹?  鈹?  鈹溾攢鈹€ UserApi.kt        # User API class
鈹?  鈹?  鈹斺攢鈹€ Api.kt            # API exports
鈹?  鈹溾攢鈹€ http/
鈹?  鈹?  鈹斺攢鈹€ HttpClient.kt     # HTTP client
鈹?  鈹斺攢鈹€ User.kt               # Model class
鈹溾攢鈹€ build.gradle.kts
鈹斺攢鈹€ README.md
```

### Flutter/Dart

```
sdk/
鈹溾攢鈹€ lib/
鈹?  鈹溾攢鈹€ backend_client.dart   # Main SDK client
鈹?  鈹溾攢鈹€ src/
鈹?  鈹?  鈹溾攢鈹€ api/
鈹?  鈹?  鈹?  鈹溾攢鈹€ paths.dart    # API path utilities
鈹?  鈹?  鈹?  鈹溾攢鈹€ user.dart     # User API class
鈹?  鈹?  鈹?  鈹斺攢鈹€ api.dart      # API exports
鈹?  鈹?  鈹溾攢鈹€ http/
鈹?  鈹?  鈹?  鈹斺攢鈹€ client.dart   # HTTP client
鈹?  鈹?  鈹斺攢鈹€ models.dart       # Model classes
鈹溾攢鈹€ pubspec.yaml
鈹斺攢鈹€ README.md
```

### C# (.NET)

```
sdk/
鈹溾攢鈹€ SdkworkBackendClient.cs          # Main SDK client
鈹溾攢鈹€ Api/
鈹?  鈹溾攢鈹€ ApiPaths.cs           # API path utilities
鈹?  鈹溾攢鈹€ UserApi.cs            # User API class
鈹?  鈹斺攢鈹€ Api.cs                # API exports
鈹溾攢鈹€ Http/
鈹?  鈹斺攢鈹€ HttpClient.cs         # HTTP client
鈹溾攢鈹€ Models/
鈹?  鈹斺攢鈹€ User.cs               # Model class
鈹溾攢鈹€ Backend.csproj
鈹斺攢鈹€ README.md
```

## Import Standards

All generated SDKs follow a unified import pattern:

```typescript
// 鉁?Correct - Import from main package
import { SdkError, Page, HttpClient } from '@sdkwork/sdk-common';

// 鉂?Incorrect - No sub-path imports
import { SdkError } from '@sdkwork/sdk-common/errors';
import { Page } from '@sdkwork/sdk-common/core';
```

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

- TypeScript: `@scope/pkg@^1.2.3` or `@scope/pkg@^1.2.3|@scope/pkg`
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

### Windows

```batch
bin\sdk-gen.bat generate --type backend --lang typescript
bin\sdk-gen.bat build --type app
bin\sdk-gen.bat all
```

### Linux/macOS

```bash
./bin/sdk-gen.sh generate --type backend --lang typescript
./bin/sdk-gen.sh build --type app
./bin/sdk-gen.sh all
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


# sdkwork-sdk-generator
