# SDKWork SDK Generator

Professional SDK code generator for multiple programming languages. Generate type-safe, well-structured SDKs from OpenAPI specifications.

## Features

- **Multi-language Support**: TypeScript, Dart, Python, Go, Java, Kotlin, Swift, C#, Flutter, Rust, PHP, Ruby
- **Type-safe**: Generate strongly typed models and API clients
- **Modular Architecture**: Each generator has independent sub-modules for models, APIs, HTTP client, build config, and docs
- **README System**: Every generated SDK always includes a top-level `README.md`
- **Unified Metadata Manifest**: Every generated SDK also includes `sdkwork-sdk.json` with schema version, SDK identity, machine-readable capability flags, and generated-vs-scaffold ownership boundaries
- **Safe Regeneration**: Generated ownership is tracked in `.sdkwork/sdkwork-generator-manifest.json`, each run writes `.sdkwork/sdkwork-generator-changes.json`, apply mode also writes a versioned `.sdkwork/sdkwork-generator-report.json`, stale generated files are pruned safely, and custom code is preserved
- **Impact-Aware Automation**: Every generation run classifies changed files into machine-readable impact areas so verification and release automation can react to real change scope
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

If your multi-language SDK family uses a custom TypeScript npm package as the published version anchor, pass it explicitly:

```bash
sdkgen generate -i ./openapi.json -o ./sdk -n MySDK -l python --package-name sdkwork-app-sdk-python --npm-package-name @acme/unified-app-sdk
```

To preview what regeneration would change without touching the filesystem, use dry-run mode:

```bash
sdkgen generate -i ./openapi.json -o ./sdk -n MySDK -l typescript --dry-run
```

To let automation consume the full execution result directly, add `--json`:

```bash
sdkgen generate -i ./openapi.json -o ./sdk -n MySDK -l typescript --dry-run --json
```

To lock apply mode to an already reviewed dry-run plan, pass the fingerprint back:

```bash
sdkgen generate -i ./openapi.json -o ./sdk -n MySDK -l typescript --expected-change-fingerprint <fingerprint>
```

### Initialize SDK Workspace

Use `init` when you want a minimal, regeneration-safe workspace before the OpenAPI spec or full SDK package is ready:

```bash
sdkgen init -o ./sdk -n MySDK -l typescript -t backend
```

The init command creates only the stable workspace boundary:

- `README.md` with the next `sdkgen generate` command
- `sdkwork-sdk.json` with SDK identity, capabilities, and ownership boundaries
- `custom/README.md` for hand-written extensions
- `.sdkwork/` control-plane artifacts so `sdkgen inspect` stays healthy

Key rules:

- `init` is idempotent when rerun against its own scaffold
- `init` does not generate API/runtime/build files from OpenAPI
- `init` refuses to replace an already generated SDK control plane
- `init` supports `--dry-run`, `--json`, and `--expected-change-fingerprint` for the same review/apply automation style as `generate`

### Inspect SDK Control Plane

To inspect the persisted regeneration control plane for an existing generated SDK:

```bash
sdkgen inspect -o ./sdk
```

For automation:

```bash
sdkgen inspect -o ./sdk --json
```

The inspect command returns the parsed manifest, change summary, and execution report snapshot together with a unified health evaluation and recommended next action.

To turn inspect into an explicit automation gate:

```bash
sdkgen inspect -o ./sdk --fail-on degraded
sdkgen inspect -o ./sdk --require-action verify
```

Supported inspect gate values:

- `--fail-on`: `empty`, `degraded`, `invalid`
- `--require-action`: `generate`, `review`, `apply`, `verify`, `complete`, `skip`

### Safe Regeneration Contract

Every generated SDK now follows the same regeneration rules:

- Generator-owned files are tracked in `.sdkwork/sdkwork-generator-manifest.json`
- `sdkwork-sdk.json` also declares the SDK schema version, language capabilities, and the stable generated/scaffold boundary used by regeneration-safe workflows
- Each generation run writes `.sdkwork/sdkwork-generator-changes.json` with created, updated, unchanged, deleted, scaffolded, preserved, and backed-up file lists
- The change summary also includes classified impact areas such as `api-surface`, `models`, `runtime`, `build-metadata`, `publish-workflow`, `documentation`, and `custom-scaffold`
- The change summary now also persists the resolved verification plan so CI and agent workflows can continue from a single machine-readable control-plane artifact
- The change summary also persists the resolved execution decision so downstream automation knows whether the next best action is `review`, `apply`, `verify`, `complete`, or `skip`
- Apply mode also writes `.sdkwork/sdkwork-generator-report.json` with the same full execution report structure as CLI `--json`, including `schemaVersion`, `generator`, stable artifact paths, sdk metadata, versioning, stats, warnings, `changeImpact`, `verificationPlan`, `executionDecision`, and `executionHandoff`
- CLI JSON output also includes an execution handoff with concrete next commands, including reviewed apply commands for dry-run flows
- Hand-written extensions belong in `custom/`
- `custom/` is scaffolded once and is never overwritten by later generations
- Modified generated-owned files are backed up to `.sdkwork/manual-backups/` before overwrite or deletion
- Legacy SDK outputs without a prior manifest are preserved on the first safe regeneration pass
- `--dry-run` reuses the same diff engine but does not write files, manifests, change summaries, execution reports, or backups
- `--json` emits a versioned machine-readable report on both success and failure; success matches the apply-mode `.sdkwork/sdkwork-generator-report.json` contract, while failure includes the same `schemaVersion` and `generator` identity plus available artifact paths
- Both text and JSON outputs now include a post-generation verification plan based on impact classification and language-specific verification capability
- `syncSummary.changeFingerprint` provides a stable fingerprint for the planned mutations, and `--expected-change-fingerprint` can require apply mode to match a reviewed dry-run plan before writing

This keeps repeat generation idempotent while avoiding destructive cleanup of custom code.

For programmatic Node.js callers that need the same safe write semantics as the CLI, use the Node-only helper:

```typescript
import { syncGeneratedOutput } from '@sdkwork/sdk-generator/node/output-sync';
```

For programmatic Node.js callers that want the full `resolve version -> generate -> safe sync` pipeline:

```typescript
import { generateSdkProject } from '@sdkwork/sdk-generator/node/generate';
```

For programmatic Node.js callers that want to resolve or read the latest persisted execution report:

```typescript
import {
  parseGenerateExecutionReport,
  readGenerateExecutionReport,
  resolveGenerateExecutionArtifacts,
} from '@sdkwork/sdk-generator/node/execution-report';
```

For downstream agents that want a single health-checked snapshot of manifest, change summary, and execution report:

```typescript
import { readGenerateControlPlaneSnapshot } from '@sdkwork/sdk-generator/node/control-plane';
```

The returned snapshot includes parsed artifacts, structured `issues`, and a unified `evaluation` with `status`, `recommendedAction`, and `summary` so orchestration layers can decide whether to `generate`, `review`, `apply`, `verify`, `complete`, or `skip`.

For downstream agents that want to parse the standardized SDK metadata contract itself:

```typescript
import { parseSdkMetadataManifest } from '@sdkwork/sdk-generator';
```

For programmatic Node.js callers that want to initialize a regeneration-safe SDK workspace before generation:

```typescript
import { initializeSdkWorkspace } from '@sdkwork/sdk-generator/node/init';
```

For automation that needs to classify a planned diff before deciding verification or release steps:

```typescript
import { analyzeChangeImpact } from '@sdkwork/sdk-generator';
```

For automation that needs a machine-readable next-step decision after dry-run or apply:

```typescript
import { buildExecutionDecisionFromContext } from '@sdkwork/sdk-generator';
```

For automation that needs concrete next commands after a generate run:

```typescript
import { buildExecutionHandoff } from '@sdkwork/sdk-generator';
```

### Generate Options

| Option | Description | Required | Default |
|--------|-------------|----------|---------|
| `-i, --input` | Path to OpenAPI specification | Yes | - |
| `-o, --output` | Output directory | Yes | - |
| `-n, --name` | SDK name | Yes | - |
| `-l, --language` | Target language | No | `typescript` |
| `-t, --type` | SDK type (`app`, `backend`, `ai`, `custom`) | No | `backend` |
| `--sdk-version` | Requested SDK version, auto-bumped if it is not newer than local/npm baseline | No | Auto-resolved |
| `--fixed-sdk-version` | Use an exact SDK version without auto-increment checks | No | - |
| `--npm-registry` | Registry used for published TypeScript SDK version checks | No | `https://registry.npmjs.org` |
| `--npm-package-name` | Override the TypeScript npm package used as the published version baseline | No | Auto-derived |
| `--sdk-root` | Workspace root used to scan sibling generated SDK versions | No | - |
| `--sdk-name` | Workspace prefix, for example `sdkwork-app-sdk` | No | - |
| `--no-sync-published-version` | Skip published npm version checks when resolving SDK version | No | `false` |
| `--base-url` | Base URL for API | No | From spec |
| `--api-prefix` | API path prefix | No | empty string |
| `--package-name` | Package name | No | Auto-generated |
| `--common-package` | Override language common component | No | Language default |
| `--namespace` | Namespace override for languages that support it, such as C# and PHP | No | Language-specific |
| `--author` | Author name | No | `SDKWork Team` |
| `--license` | License | No | `MIT` |
| `--description` | SDK description | No | - |
| `--no-clean` | Do not prune stale generated files before generation | No | `false` |
| `--dry-run` | Preview generated, deleted, scaffolded, and backup changes without writing output | No | `false` |
| `--expected-change-fingerprint` | Require apply mode to match a previously reviewed change fingerprint before writing | No | - |
| `--json` | Emit machine-readable JSON output for automation | No | `false` |

### Supported Languages

```bash
sdkgen languages
```

The `languages` command can also emit the full machine-readable capability catalog:

```bash
sdkgen languages --json
```

| Language | Flag | Description |
|----------|------|-------------|
| TypeScript | `typescript` | TypeScript/JavaScript with full type support |
| Dart | `dart` | Standalone Dart 3.0+ with `http` transport |
| Python | `python` | Python 3.8+ with type hints |
| Go | `go` | Go 1.21+ with strong typing |
| Java | `java` | Java 11+ with OkHttp and Jackson |
| Swift | `swift` | Swift 5.7+ for iOS/macOS |
| Kotlin | `kotlin` | Kotlin 1.9+ for Android/JVM |
| Flutter | `flutter` | Flutter 3.0+ for cross-platform UI apps |
| C# | `csharp` | C# .NET 6+ with HttpClient |
| Rust | `rust` | Rust 1.75+ with reqwest and serde |
| PHP | `php` | PHP 8.1+ with Composer and Guzzle |
| Ruby | `ruby` | Ruby 3.0+ with gem packaging and Faraday |

### Language Capability Matrix

Programmatic callers can read the same standardized capability profile used by `sdkwork-sdk.json`:

```typescript
import { getLanguageCapabilities, getLanguageCapability } from '@sdkwork/sdk-generator';
```

| Language | Generated Tests | README | Custom Scaffold | Publish Workflow | Distinct Build Step |
|----------|-----------------|--------|-----------------|------------------|---------------------|
| TypeScript | Yes | Yes | Yes | Yes | Yes |
| Dart | Yes | Yes | Yes | Yes | No |
| Python | Yes | Yes | Yes | Yes | No |
| Go | Yes | Yes | Yes | Yes | No |
| Java | Yes | Yes | Yes | Yes | No |
| Swift | Yes | Yes | Yes | Yes | No |
| Kotlin | Yes | Yes | Yes | Yes | No |
| Flutter | Yes | Yes | Yes | Yes | No |
| C# | Yes | Yes | Yes | Yes | No |
| Rust | Yes | Yes | Yes | Yes | Yes |
| PHP | Yes | Yes | Yes | Yes | No |
| Ruby | Yes | Yes | Yes | Yes | No |

This matrix is intentionally truthful: TypeScript, Dart, Rust, Python, Go, Java, Swift, Kotlin, Flutter, C#, PHP, and Ruby currently support generator-produced smoke tests, while every language supports standardized README generation, regeneration-safe `custom/` scaffolding, and the unified publish workflow.

## Programmatic Usage

```typescript
import {
  TypeScriptGenerator,
  DartGenerator,
  PythonGenerator,
  GoGenerator,
  RustGenerator,
} from '@sdkwork/sdk-generator';
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
|-- dart/
|-- flutter/
|-- csharp/
|-- php/
|-- ruby/
-- rust/
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

All generated SDK layouts also reserve these stable cross-language paths:

```
sdk/
|-- custom/
|   -- README.md                     # Hand-written wrappers and extensions live here
-- .sdkwork/
    |-- sdkwork-generator-manifest.json
    |-- sdkwork-generator-changes.json # Machine-readable change summary from the latest generation run
    |-- sdkwork-generator-report.json  # Full machine-readable execution report from the latest applied run
    -- manual-backups/              # Backups of modified generated-owned files
```

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

### Dart

```
sdk/
|-- lib/
|   |-- app_client.dart       # Main SDK client
|   |-- sdkwork_app_sdk_dart.dart
|   |-- src/
|   |   |-- api/
|   |   |   |-- paths.dart
|   |   |   |-- user.dart
|   |   |   -- api.dart
|   |   |-- http/
|   |   |   |-- client.dart
|   |   |   -- sdk_config.dart
|   |   -- models.dart
|-- pubspec.yaml
|-- analysis_options.yaml
-- README.md
```

### Flutter

```
sdk/
|-- lib/
|   |-- backend_client.dart   # Main SDK client
|   |-- backend_sdk.dart
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

### Rust

```
sdk/
|-- src/
|   |-- api/
|   |   |-- base.rs          # Shared API aliases
|   |   |-- paths.rs         # API path utilities
|   |   |-- user.rs          # User API module
|   |   -- mod.rs            # API exports
|   |-- http/
|   |   |-- client.rs        # Reqwest-based HTTP client
|   |   -- mod.rs            # HTTP exports
|   |-- models/
|   |   |-- common.rs        # Common models
|   |   |-- user.rs          # Model structs
|   |   -- mod.rs            # Model exports
|   |-- client.rs            # Main SDK client
|   -- lib.rs                # Crate entrypoint
|-- Cargo.toml
-- README.md
```

### PHP

```
sdk/
|-- src/
|   |-- Api/
|   |   |-- BaseApi.php
|   |   -- User.php
|   |-- Http/
|   |   -- HttpClient.php
|   |-- Models/
|   |   -- User.php
|   |-- SdkConfig.php
|   -- SdkworkAppClient.php
|-- composer.json
|-- sdkwork-sdk.json
-- README.md
```

### Ruby

```
sdk/
|-- lib/
|   |-- sdkwork/
|   |   |-- app_sdk.rb
|   |   -- app_sdk/
|   |      |-- version.rb
|   |      |-- sdk_config.rb
|   |      |-- client.rb
|   |      |-- http/
|   |      |   -- client.rb
|   |      |-- api/
|   |      |   |-- base_api.rb
|   |      |   -- user.rb
|   |      -- models/
|   |          -- user.rb
|-- sdkwork-app-sdk.gemspec
|-- Gemfile
|-- sdkwork-sdk.json
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
- Dart: self-contained `http`
- Flutter: `sdkwork_common_flutter`
- Rust: self-contained `reqwest` + `serde` + `thiserror`
- PHP: self-contained `guzzlehttp/guzzle`
- Ruby: self-contained `faraday`

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
- Dart: currently self-contained; `--common-package` is ignored
- Flutter: `sdkwork_common_flutter@^1.2.3` or `sdkwork_common_flutter@^1.2.3|package:sdkwork_common_flutter/sdkwork_common_flutter.dart`
- Rust: currently self-contained; `--common-package` is ignored
- PHP: currently self-contained; `--common-package` is ignored
- Ruby: currently self-contained; `--common-package` is ignored

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


