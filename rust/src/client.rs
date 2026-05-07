use reqwest::header::{AUTHORIZATION, CONTENT_DISPOSITION, CONTENT_TYPE};
use reqwest::multipart::{Form, Part};
use std::time::Duration;

use crate::error::{SdkGeneratorError, SdkGeneratorResult};
use crate::models::{
    GenerateFromFileRequest, GenerateFromPathRequest, GenerateFromUrlPayload,
    GenerateFromUrlRequest, GenerateInputUrl, GenerateResponse, GeneratedPackage,
    GeneratedPackageFormat,
};

#[derive(Clone)]
pub struct SdkGeneratorClient {
    base_url: String,
    api_key: Option<String>,
    http: reqwest::Client,
    poll_interval: Duration,
    max_poll_attempts: usize,
}

impl SdkGeneratorClient {
    pub fn new(base_url: impl Into<String>) -> SdkGeneratorResult<Self> {
        Self::builder(base_url).build()
    }

    pub fn builder(base_url: impl Into<String>) -> SdkGeneratorClientBuilder {
        SdkGeneratorClientBuilder::new(base_url)
    }

    pub async fn generate_from_url(
        &self,
        request: GenerateFromUrlRequest,
    ) -> SdkGeneratorResult<GenerateResponse> {
        validate_generate_from_url_request(&request)?;
        let options = normalize_generate_options(request.options);
        let payload = GenerateFromUrlPayload {
            input: GenerateInputUrl::Url {
                url: normalize_required_text(request.openapi_url),
            },
            language: request.language,
            name: normalize_required_text(request.name),
            options,
        };

        self.send_json("/v1/sdk-generator/generations", &payload)
            .await
    }

    pub async fn generate_from_file(
        &self,
        request: GenerateFromFileRequest,
    ) -> SdkGeneratorResult<GenerateResponse> {
        let request = normalize_generate_from_file_request(request);
        validate_generate_from_file_request(&request)?;
        let openapi_part = match openapi_content_type(&request.file_name) {
            Some(content_type) => Part::bytes(request.file_content)
                .file_name(request.file_name)
                .mime_str(content_type)?,
            None => Part::bytes(request.file_content).file_name(request.file_name),
        };
        let mut form = Form::new()
            .part("openapi", openapi_part)
            .text("language", request.language.as_str().to_string())
            .text("name", request.name);

        if let Some(sdk_type) = request.options.sdk_type {
            form = form.text("sdkType", sdk_type.as_str().to_string());
        }
        if let Some(base_url) = request.options.base_url {
            form = form.text("baseUrl", base_url);
        }
        if let Some(api_prefix) = request.options.api_prefix {
            form = form.text("apiPrefix", api_prefix);
        }
        if let Some(package_name) = request.options.package_name {
            form = form.text("packageName", package_name);
        }
        if let Some(namespace) = request.options.namespace {
            form = form.text("namespace", namespace);
        }
        if let Some(version) = request.options.version {
            form = form.text("version", version);
        }
        if let Some(description) = request.options.description {
            form = form.text("description", description);
        }
        if let Some(author) = request.options.author {
            form = form.text("author", author);
        }
        if let Some(license) = request.options.license {
            form = form.text("license", license);
        }

        let response = self
            .authorized(
                self.http
                    .post(self.url("/v1/sdk-generator/generations:upload")),
            )
            .multipart(form)
            .send()
            .await?;
        self.decode_json(response).await
    }

    pub async fn generate_from_path(
        &self,
        request: GenerateFromPathRequest,
    ) -> SdkGeneratorResult<GenerateResponse> {
        validate_generation_name("name", &request.name)?;
        validate_generate_options(&request.options)?;
        let path = request.path.as_path();
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| {
                SdkGeneratorError::InvalidConfiguration(format!(
                    "openapi path has no valid UTF-8 file name: {}",
                    path.display()
                ))
            })?
            .to_string();
        let content = std::fs::read(path)?;
        self.generate_from_file(GenerateFromFileRequest {
            file_name,
            file_content: content,
            language: request.language,
            name: normalize_required_text(request.name),
            options: normalize_generate_options(request.options),
        })
        .await
    }

    pub async fn get_generation(
        &self,
        job_id: impl AsRef<str>,
    ) -> SdkGeneratorResult<GenerateResponse> {
        let job_id = validate_job_id(job_id.as_ref())?;
        let path = format!("/v1/sdk-generator/jobs/{}", encode_path_segment(job_id));
        let response = self
            .authorized(self.http.get(self.url(&path)))
            .send()
            .await?;
        self.decode_json(response).await
    }

    pub async fn download_package(
        &self,
        job_id: impl AsRef<str>,
        format: GeneratedPackageFormat,
    ) -> SdkGeneratorResult<GeneratedPackage> {
        let job_id = validate_job_id(job_id.as_ref())?;
        let path = format!(
            "/v1/sdk-generator/jobs/{}/download",
            encode_path_segment(job_id)
        );
        let response = self
            .authorized(
                self.http
                    .get(self.url(&path))
                    .query(&[("format", format.as_str())]),
            )
            .send()
            .await?;
        self.decode_package(response).await
    }

    pub async fn generate_from_url_and_download(
        &self,
        request: GenerateFromUrlRequest,
        format: GeneratedPackageFormat,
    ) -> SdkGeneratorResult<GeneratedPackage> {
        let generation = self.generate_from_url(request).await?;
        self.wait_for_generation_and_download(generation.job_id, format)
            .await
    }

    pub async fn generate_from_file_and_download(
        &self,
        request: GenerateFromFileRequest,
        format: GeneratedPackageFormat,
    ) -> SdkGeneratorResult<GeneratedPackage> {
        let generation = self.generate_from_file(request).await?;
        self.wait_for_generation_and_download(generation.job_id, format)
            .await
    }

    pub async fn generate_from_path_and_download(
        &self,
        request: GenerateFromPathRequest,
        format: GeneratedPackageFormat,
    ) -> SdkGeneratorResult<GeneratedPackage> {
        let generation = self.generate_from_path(request).await?;
        self.wait_for_generation_and_download(generation.job_id, format)
            .await
    }

    async fn wait_for_generation_and_download(
        &self,
        job_id: String,
        format: GeneratedPackageFormat,
    ) -> SdkGeneratorResult<GeneratedPackage> {
        for _ in 0..self.max_poll_attempts {
            let generation = self.get_generation(&job_id).await?;
            if generation.status.is_completed() {
                return self.download_package(&job_id, format).await;
            }
            if generation.status.is_failed() {
                return Err(SdkGeneratorError::GenerationFailed {
                    job_id,
                    status: generation.status,
                });
            }
            tokio::time::sleep(self.poll_interval).await;
        }

        Err(SdkGeneratorError::GenerationTimeout {
            job_id,
            attempts: self.max_poll_attempts,
        })
    }

    async fn send_json<T: serde::Serialize>(
        &self,
        path: &str,
        payload: &T,
    ) -> SdkGeneratorResult<GenerateResponse> {
        let response = self
            .authorized(self.http.post(self.url(path)))
            .json(payload)
            .send()
            .await?;
        self.decode_json(response).await
    }

    async fn decode_json(
        &self,
        response: reqwest::Response,
    ) -> SdkGeneratorResult<GenerateResponse> {
        let response = ensure_success(response).await?;
        Ok(response.json::<GenerateResponse>().await?)
    }

    async fn decode_package(
        &self,
        response: reqwest::Response,
    ) -> SdkGeneratorResult<GeneratedPackage> {
        let response = ensure_success(response).await?;
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let file_name = response
            .headers()
            .get(CONTENT_DISPOSITION)
            .and_then(|value| value.to_str().ok())
            .and_then(extract_content_disposition_file_name);
        let bytes = response.bytes().await?;

        Ok(GeneratedPackage {
            bytes,
            content_type,
            file_name,
        })
    }

    fn authorized(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.api_key {
            Some(api_key) if !api_key.is_empty() => {
                request.header(AUTHORIZATION, format!("Bearer {api_key}"))
            }
            _ => request,
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }
}

pub struct SdkGeneratorClientBuilder {
    base_url: String,
    api_key: Option<String>,
    http: Option<reqwest::Client>,
    poll_interval: Duration,
    max_poll_attempts: usize,
}

impl SdkGeneratorClientBuilder {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            api_key: None,
            http: None,
            poll_interval: Duration::from_secs(2),
            max_poll_attempts: 150,
        }
    }

    pub fn api_key(mut self, api_key: impl Into<String>) -> Self {
        self.api_key = Some(api_key.into());
        self
    }

    pub fn http_client(mut self, http: reqwest::Client) -> Self {
        self.http = Some(http);
        self
    }

    pub fn poll_interval(mut self, poll_interval: Duration) -> Self {
        self.poll_interval = poll_interval;
        self
    }

    pub fn max_poll_attempts(mut self, max_poll_attempts: usize) -> Self {
        self.max_poll_attempts = max_poll_attempts;
        self
    }

    pub fn build(self) -> SdkGeneratorResult<SdkGeneratorClient> {
        let base_url = self.base_url.trim().trim_end_matches('/').to_string();
        if base_url.is_empty() {
            return Err(SdkGeneratorError::InvalidConfiguration(
                "base_url must not be empty".to_string(),
            ));
        }
        let parsed_base_url = reqwest::Url::parse(&base_url).map_err(|error| {
            SdkGeneratorError::InvalidConfiguration(format!(
                "base_url must be an absolute http(s) URL: {error}"
            ))
        })?;
        if !matches!(parsed_base_url.scheme(), "http" | "https") {
            return Err(SdkGeneratorError::InvalidConfiguration(
                "base_url scheme must be http or https".to_string(),
            ));
        }
        if parsed_base_url.query().is_some() || parsed_base_url.fragment().is_some() {
            return Err(SdkGeneratorError::InvalidConfiguration(
                "base_url must not include query or fragment components".to_string(),
            ));
        }
        if self.poll_interval.is_zero() {
            return Err(SdkGeneratorError::InvalidConfiguration(
                "poll_interval must be greater than zero".to_string(),
            ));
        }
        if self.max_poll_attempts == 0 {
            return Err(SdkGeneratorError::InvalidConfiguration(
                "max_poll_attempts must be greater than zero".to_string(),
            ));
        }
        if self
            .api_key
            .as_ref()
            .is_some_and(|api_key| api_key.trim().is_empty())
        {
            return Err(SdkGeneratorError::InvalidConfiguration(
                "api_key must not be empty when configured".to_string(),
            ));
        }

        Ok(SdkGeneratorClient {
            base_url,
            api_key: self.api_key.map(normalize_required_text),
            http: self.http.unwrap_or_default(),
            poll_interval: self.poll_interval,
            max_poll_attempts: self.max_poll_attempts,
        })
    }
}

async fn ensure_success(response: reqwest::Response) -> SdkGeneratorResult<reqwest::Response> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }

    let body = response.text().await.unwrap_or_default();
    Err(SdkGeneratorError::HttpStatus {
        status: status.as_u16(),
        body,
    })
}

fn extract_content_disposition_file_name(value: &str) -> Option<String> {
    for part in value.split(';') {
        let trimmed = part.trim();
        if let Some(file_name) = trimmed.strip_prefix("filename*=") {
            if let Some(decoded) = decode_rfc5987_file_name(file_name) {
                return Some(decoded);
            }
        }
    }
    for part in value.split(';') {
        let trimmed = part.trim();
        if let Some(file_name) = trimmed.strip_prefix("filename=") {
            return Some(file_name.trim_matches('"').to_string());
        }
    }
    None
}

fn decode_rfc5987_file_name(value: &str) -> Option<String> {
    let value = value.trim_matches('"');
    let (charset, encoded) = match value.split_once("''") {
        Some((charset, encoded)) => (charset, encoded),
        None => ("UTF-8", value),
    };
    if !charset.eq_ignore_ascii_case("utf-8") {
        return None;
    }
    percent_decode_utf8(encoded)
}

fn percent_decode_utf8(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let high = bytes.get(index + 1).copied().and_then(hex_value)?;
            let low = bytes.get(index + 2).copied().and_then(hex_value)?;
            decoded.push(high * 16 + low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn openapi_content_type(file_name: &str) -> Option<&'static str> {
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".json") {
        return Some("application/openapi+json");
    }
    if lower.ends_with(".yaml") || lower.ends_with(".yml") {
        return Some("application/openapi+yaml");
    }
    None
}

fn normalize_generate_from_file_request(
    request: GenerateFromFileRequest,
) -> GenerateFromFileRequest {
    GenerateFromFileRequest {
        file_name: normalize_required_text(request.file_name),
        file_content: request.file_content,
        language: request.language,
        name: normalize_required_text(request.name),
        options: normalize_generate_options(request.options),
    }
}

fn normalize_generate_options(
    options: crate::models::GenerateRequestOptions,
) -> crate::models::GenerateRequestOptions {
    crate::models::GenerateRequestOptions {
        sdk_type: options.sdk_type,
        base_url: options.base_url.map(normalize_required_text),
        api_prefix: options.api_prefix.map(normalize_required_text),
        package_name: options.package_name.map(normalize_required_text),
        namespace: options.namespace.map(normalize_required_text),
        version: options.version.map(normalize_required_text),
        description: options.description.map(normalize_required_text),
        author: options.author.map(normalize_required_text),
        license: options.license.map(normalize_required_text),
    }
}

fn normalize_required_text(value: String) -> String {
    value.trim().to_string()
}

fn validate_generate_from_url_request(request: &GenerateFromUrlRequest) -> SdkGeneratorResult<()> {
    validate_generation_name("name", &request.name)?;
    validate_generate_options(&request.options)?;
    let openapi_url = request.openapi_url.trim();
    if openapi_url.is_empty() {
        return Err(SdkGeneratorError::InvalidConfiguration(
            "openapi_url must not be empty".to_string(),
        ));
    }
    let parsed = reqwest::Url::parse(openapi_url).map_err(|error| {
        SdkGeneratorError::InvalidConfiguration(format!(
            "openapi_url must be an absolute http or https URL: {error}"
        ))
    })?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(SdkGeneratorError::InvalidConfiguration(
            "openapi_url scheme must be http or https".to_string(),
        ));
    }
    Ok(())
}

fn validate_generate_from_file_request(
    request: &GenerateFromFileRequest,
) -> SdkGeneratorResult<()> {
    validate_generation_name("name", &request.name)?;
    validate_generate_options(&request.options)?;
    if request.file_name.trim().is_empty() {
        return Err(SdkGeneratorError::InvalidConfiguration(
            "file_name must not be empty".to_string(),
        ));
    }
    if request.file_content.is_empty() {
        return Err(SdkGeneratorError::InvalidConfiguration(
            "file_content must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_generate_options(
    options: &crate::models::GenerateRequestOptions,
) -> SdkGeneratorResult<()> {
    validate_optional_text("base_url", options.base_url.as_deref())?;
    validate_optional_text("api_prefix", options.api_prefix.as_deref())?;
    validate_optional_text("package_name", options.package_name.as_deref())?;
    validate_optional_text("namespace", options.namespace.as_deref())?;
    validate_optional_text("version", options.version.as_deref())?;
    validate_optional_text("description", options.description.as_deref())?;
    validate_optional_text("author", options.author.as_deref())?;
    validate_optional_text("license", options.license.as_deref())
}

fn validate_optional_text(field: &str, value: Option<&str>) -> SdkGeneratorResult<()> {
    if value.is_some_and(|value| value.trim().is_empty()) {
        return Err(SdkGeneratorError::InvalidConfiguration(format!(
            "{field} must not be empty when configured"
        )));
    }
    Ok(())
}

fn validate_generation_name(field: &str, value: &str) -> SdkGeneratorResult<()> {
    if value.trim().is_empty() {
        return Err(SdkGeneratorError::InvalidConfiguration(format!(
            "{field} must not be empty"
        )));
    }
    Ok(())
}

fn validate_job_id(job_id: &str) -> SdkGeneratorResult<&str> {
    let job_id = job_id.trim();
    if job_id.is_empty() {
        return Err(SdkGeneratorError::InvalidConfiguration(
            "job_id must not be empty".to_string(),
        ));
    }
    Ok(job_id)
}

fn encode_path_segment(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            _ => {
                let encoded = format!("%{byte:02X}");
                encoded.chars().collect()
            }
        })
        .collect()
}
