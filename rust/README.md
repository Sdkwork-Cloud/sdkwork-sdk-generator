# SDKWork SDK Generator Rust Client

Rust client library for applications that integrate with an SDKWork SDK Generator HTTP service.

The crate is intentionally small: it does not duplicate the generator engine. It wraps the service contract used to submit OpenAPI input, start SDK generation, and download the generated package archive.

## Capabilities

- Generate from an OpenAPI 3.x JSON/YAML URL.
- Generate by uploading an OpenAPI 3.x JSON/YAML file.
- Generate by passing a local OpenAPI file path.
- Query generation job status and metadata.
- Generate and download the finished SDK package with one high-level call.
- Download generated SDK archives as `zip` or `tar.gz`.
- Use a bearer API key when the generator service requires authentication.
- Validate client configuration up front: the service base URL must be absolute `http` or `https`, and polling settings must be non-zero.
- Validate generation requests before HTTP calls: OpenAPI URLs must be absolute HTTP(S) URLs, names and configured text options must be non-empty, uploads must include a file name and file content, and job IDs must be non-empty.
- Return typed job states through `GenerationStatus`, while preserving unknown service statuses for forward compatibility.
- Share the same language and SDK type vocabulary as the Node generator: TypeScript, Dart, Python, Go, Java, Kotlin, Swift, C#, Flutter, Rust, PHP, Ruby and `app`, `backend`, `ai`, `custom`.

## Install

```toml
[dependencies]
sdkwork-sdk-generator-client = { path = "rust" }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

When published independently, use the registry version instead of the path dependency.

## Generate From OpenAPI URL

```rust
use sdkwork_sdk_generator::{
    GenerateFromUrlRequest, SdkGeneratorClient, SdkLanguage, SdkType,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = SdkGeneratorClient::builder("https://generator.example.com")
        .api_key("your-api-key")
        .build()?;

    let job = client
        .generate_from_url(
            GenerateFromUrlRequest::new(
                "https://api.example.com/openapi.yaml",
                SdkLanguage::Rust,
                "Backend",
            )
            .sdk_type(SdkType::Backend)
            .base_url("https://api.example.com")
            .api_prefix("/backend/v3/api")
            .package_name("sdkwork-backend-sdk"),
        )
        .await?;

    println!("generation job: {} ({})", job.job_id, job.status);
    Ok(())
}
```

## Generate By Uploading OpenAPI File Content

```rust
use std::fs;

use sdkwork_sdk_generator::{
    GenerateFromFileRequest, SdkGeneratorClient, SdkLanguage, SdkType,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = SdkGeneratorClient::new("https://generator.example.com")?;
    let openapi = fs::read("openapi.json")?;

    let job = client
        .generate_from_file(
            GenerateFromFileRequest::new(
                "openapi.json",
                openapi,
                SdkLanguage::TypeScript,
                "Frontend",
            )
            .sdk_type(SdkType::App)
            .package_name("@sdkwork/frontend-sdk"),
        )
        .await?;

    println!("generation job: {} ({})", job.job_id, job.status);
    Ok(())
}
```

## Generate From Local OpenAPI Path

```rust
use sdkwork_sdk_generator::{
    GenerateFromPathRequest, SdkGeneratorClient, SdkLanguage, SdkType,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = SdkGeneratorClient::new("https://generator.example.com")?;

    let job = client
        .generate_from_path(
            GenerateFromPathRequest::new(
                "openapi.yaml",
                SdkLanguage::Python,
                "PythonBackend",
            )
            .sdk_type(SdkType::Backend)
            .package_name("sdkwork-python-backend-sdk"),
        )
        .await?;

    println!("generation job: {} ({})", job.job_id, job.status);
    Ok(())
}
```

`generate_from_path` reads the local file and uploads it using the same multipart contract as `generate_from_file`. Files ending in `.json`, `.yaml`, or `.yml` are sent with the OpenAPI media types `application/openapi+json` or `application/openapi+yaml` so the service can parse JSON and YAML deterministically.

## Client Configuration

```rust
use std::time::Duration;

use sdkwork_sdk_generator::SdkGeneratorClient;

let client = SdkGeneratorClient::builder("https://generator.example.com")
    .api_key("your-api-key")
    .poll_interval(Duration::from_secs(1))
    .max_poll_attempts(180)
    .build()?;
```

The base URL must be an absolute `http` or `https` service origin or base path without query or fragment components. When an API key is configured it must be non-empty, and requests include `Authorization: Bearer <api-key>`.

Request text values are normalized before they are sent: surrounding whitespace is removed from URLs, SDK names, configured options, upload file names, and API keys after validation succeeds.

## Query Generation Status

```rust
use sdkwork_sdk_generator::SdkGeneratorClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = SdkGeneratorClient::new("https://generator.example.com")?;
    let job = client.get_generation("job-123").await?;

    println!("{}: {}", job.job_id, job.status);
    Ok(())
}
```

`GenerateResponse.status` is a `GenerationStatus`. Common service values are normalized to `Queued`, `Running`, `Completed`, `Failed`, or `Cancelled`; unrecognized values are returned as `GenerationStatus::Unknown(value)` so newer service states are not discarded.

## Download Generated Package

```rust
use std::fs;

use sdkwork_sdk_generator::{
    GeneratedPackageFormat, SdkGeneratorClient,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = SdkGeneratorClient::new("https://generator.example.com")?;
    let package = client
        .download_package("job-123", GeneratedPackageFormat::Zip)
        .await?;

    let file_name = package.file_name.unwrap_or_else(|| "sdk.zip".to_string());
    fs::write(file_name, package.bytes)?;
    Ok(())
}
```

`GeneratedPackage.file_name` is resolved from `Content-Disposition` and supports both `filename=` and RFC 5987 `filename*=` values.

## Generate And Download In One Call

```rust
use sdkwork_sdk_generator::{
    GenerateFromUrlRequest, GeneratedPackageFormat, SdkGeneratorClient, SdkLanguage, SdkType,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = SdkGeneratorClient::builder("https://generator.example.com")
        .poll_interval(std::time::Duration::from_secs(1))
        .max_poll_attempts(180)
        .build()?;

    let package = client
        .generate_from_url_and_download(
            GenerateFromUrlRequest::new(
                "https://api.example.com/openapi.json",
                SdkLanguage::Rust,
                "Backend",
            )
            .sdk_type(SdkType::Backend),
            GeneratedPackageFormat::Zip,
        )
        .await?;

    let file_name = package.file_name.unwrap_or_else(|| "sdk.zip".to_string());
    std::fs::write(file_name, package.bytes)?;
    Ok(())
}
```

The same high-level flow is available for local files:

```rust
use sdkwork_sdk_generator::{
    GenerateFromPathRequest, GeneratedPackageFormat, SdkGeneratorClient, SdkLanguage, SdkType,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = SdkGeneratorClient::builder("https://generator.example.com")
        .poll_interval(std::time::Duration::from_secs(1))
        .max_poll_attempts(180)
        .build()?;

    let package = client
        .generate_from_path_and_download(
            GenerateFromPathRequest::new(
                "openapi.yaml",
                SdkLanguage::Rust,
                "Backend",
            )
            .sdk_type(SdkType::Backend)
            .package_name("sdkwork-backend-sdk"),
            GeneratedPackageFormat::TarGz,
        )
        .await?;

    let file_name = package.file_name.unwrap_or_else(|| "sdk.tar.gz".to_string());
    std::fs::write(file_name, package.bytes)?;
    Ok(())
}
```

## HTTP Contract

The client uses these service endpoints:

- `POST /v1/sdk-generator/generations` with JSON payload for URL input.
- `POST /v1/sdk-generator/generations:upload` with `multipart/form-data` for file upload.
- `GET /v1/sdk-generator/jobs/{jobId}` for job status.
- `GET /v1/sdk-generator/jobs/{jobId}/download?format=zip|tar.gz` for archive download.

The expected response for generation requests is:

```json
{
  "jobId": "job-123",
  "status": "queued",
  "downloadUrl": null
}
```

The service may also return `id` instead of `jobId`; the Rust client accepts both.
