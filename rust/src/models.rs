use bytes::Bytes;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SdkLanguage {
    TypeScript,
    Dart,
    Python,
    Go,
    Java,
    Kotlin,
    Swift,
    CSharp,
    Flutter,
    Rust,
    Php,
    Ruby,
}

impl SdkLanguage {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::TypeScript => "typescript",
            Self::Dart => "dart",
            Self::Python => "python",
            Self::Go => "go",
            Self::Java => "java",
            Self::Kotlin => "kotlin",
            Self::Swift => "swift",
            Self::CSharp => "csharp",
            Self::Flutter => "flutter",
            Self::Rust => "rust",
            Self::Php => "php",
            Self::Ruby => "ruby",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SdkType {
    App,
    Backend,
    Ai,
    Custom,
}

impl SdkType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::App => "app",
            Self::Backend => "backend",
            Self::Ai => "ai",
            Self::Custom => "custom",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GeneratedPackageFormat {
    Zip,
    TarGz,
}

impl GeneratedPackageFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Zip => "zip",
            Self::TarGz => "tar.gz",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GenerationStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
    Unknown(String),
}

impl GenerationStatus {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::Unknown(status) => status.as_str(),
        }
    }

    pub fn is_completed(&self) -> bool {
        matches!(self, Self::Completed)
    }

    pub fn is_failed(&self) -> bool {
        matches!(self, Self::Failed | Self::Cancelled)
    }
}

impl fmt::Display for GenerationStatus {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for GenerationStatus {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let status = String::deserialize(deserializer)?;
        let normalized = status.trim().to_ascii_lowercase();
        Ok(match normalized.as_str() {
            "queued" | "pending" => Self::Queued,
            "running" | "processing" | "in_progress" | "in-progress" => Self::Running,
            "completed" | "complete" | "succeeded" | "success" | "ready" => Self::Completed,
            "failed" | "failure" | "error" => Self::Failed,
            "cancelled" | "canceled" => Self::Cancelled,
            _ => Self::Unknown(status),
        })
    }
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRequestOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sdk_type: Option<SdkType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub namespace: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GenerateFromUrlRequest {
    pub openapi_url: String,
    pub language: SdkLanguage,
    pub name: String,
    pub options: GenerateRequestOptions,
}

impl GenerateFromUrlRequest {
    pub fn new(
        openapi_url: impl Into<String>,
        language: SdkLanguage,
        name: impl Into<String>,
    ) -> Self {
        Self {
            openapi_url: openapi_url.into(),
            language,
            name: name.into(),
            options: GenerateRequestOptions::default(),
        }
    }

    pub fn sdk_type(mut self, sdk_type: SdkType) -> Self {
        self.options.sdk_type = Some(sdk_type);
        self
    }

    pub fn base_url(mut self, base_url: impl Into<String>) -> Self {
        self.options.base_url = Some(base_url.into());
        self
    }

    pub fn api_prefix(mut self, api_prefix: impl Into<String>) -> Self {
        self.options.api_prefix = Some(api_prefix.into());
        self
    }

    pub fn package_name(mut self, package_name: impl Into<String>) -> Self {
        self.options.package_name = Some(package_name.into());
        self
    }

    pub fn namespace(mut self, namespace: impl Into<String>) -> Self {
        self.options.namespace = Some(namespace.into());
        self
    }

    pub fn version(mut self, version: impl Into<String>) -> Self {
        self.options.version = Some(version.into());
        self
    }

    pub fn description(mut self, description: impl Into<String>) -> Self {
        self.options.description = Some(description.into());
        self
    }

    pub fn author(mut self, author: impl Into<String>) -> Self {
        self.options.author = Some(author.into());
        self
    }

    pub fn license(mut self, license: impl Into<String>) -> Self {
        self.options.license = Some(license.into());
        self
    }
}

#[derive(Debug, Clone)]
pub struct GenerateFromFileRequest {
    pub file_name: String,
    pub file_content: Vec<u8>,
    pub language: SdkLanguage,
    pub name: String,
    pub options: GenerateRequestOptions,
}

impl GenerateFromFileRequest {
    pub fn new(
        file_name: impl Into<String>,
        file_content: impl Into<Vec<u8>>,
        language: SdkLanguage,
        name: impl Into<String>,
    ) -> Self {
        Self {
            file_name: file_name.into(),
            file_content: file_content.into(),
            language,
            name: name.into(),
            options: GenerateRequestOptions::default(),
        }
    }

    pub fn sdk_type(mut self, sdk_type: SdkType) -> Self {
        self.options.sdk_type = Some(sdk_type);
        self
    }

    pub fn base_url(mut self, base_url: impl Into<String>) -> Self {
        self.options.base_url = Some(base_url.into());
        self
    }

    pub fn api_prefix(mut self, api_prefix: impl Into<String>) -> Self {
        self.options.api_prefix = Some(api_prefix.into());
        self
    }

    pub fn package_name(mut self, package_name: impl Into<String>) -> Self {
        self.options.package_name = Some(package_name.into());
        self
    }

    pub fn namespace(mut self, namespace: impl Into<String>) -> Self {
        self.options.namespace = Some(namespace.into());
        self
    }

    pub fn version(mut self, version: impl Into<String>) -> Self {
        self.options.version = Some(version.into());
        self
    }

    pub fn description(mut self, description: impl Into<String>) -> Self {
        self.options.description = Some(description.into());
        self
    }

    pub fn author(mut self, author: impl Into<String>) -> Self {
        self.options.author = Some(author.into());
        self
    }

    pub fn license(mut self, license: impl Into<String>) -> Self {
        self.options.license = Some(license.into());
        self
    }
}

#[derive(Debug, Clone)]
pub struct GenerateFromPathRequest {
    pub path: PathBuf,
    pub language: SdkLanguage,
    pub name: String,
    pub options: GenerateRequestOptions,
}

impl GenerateFromPathRequest {
    pub fn new(path: impl Into<PathBuf>, language: SdkLanguage, name: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            language,
            name: name.into(),
            options: GenerateRequestOptions::default(),
        }
    }

    pub fn sdk_type(mut self, sdk_type: SdkType) -> Self {
        self.options.sdk_type = Some(sdk_type);
        self
    }

    pub fn base_url(mut self, base_url: impl Into<String>) -> Self {
        self.options.base_url = Some(base_url.into());
        self
    }

    pub fn api_prefix(mut self, api_prefix: impl Into<String>) -> Self {
        self.options.api_prefix = Some(api_prefix.into());
        self
    }

    pub fn package_name(mut self, package_name: impl Into<String>) -> Self {
        self.options.package_name = Some(package_name.into());
        self
    }

    pub fn namespace(mut self, namespace: impl Into<String>) -> Self {
        self.options.namespace = Some(namespace.into());
        self
    }

    pub fn version(mut self, version: impl Into<String>) -> Self {
        self.options.version = Some(version.into());
        self
    }

    pub fn description(mut self, description: impl Into<String>) -> Self {
        self.options.description = Some(description.into());
        self
    }

    pub fn author(mut self, author: impl Into<String>) -> Self {
        self.options.author = Some(author.into());
        self
    }

    pub fn license(mut self, license: impl Into<String>) -> Self {
        self.options.license = Some(license.into());
        self
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GenerateFromUrlPayload {
    pub input: GenerateInputUrl,
    pub language: SdkLanguage,
    pub name: String,
    #[serde(flatten)]
    pub options: GenerateRequestOptions,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub(crate) enum GenerateInputUrl {
    Url { url: String },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResponse {
    #[serde(alias = "id")]
    pub job_id: String,
    pub status: GenerationStatus,
    #[serde(default)]
    pub download_url: Option<String>,
    #[serde(default)]
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct GeneratedPackage {
    pub bytes: Bytes,
    pub content_type: Option<String>,
    pub file_name: Option<String>,
}
