import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSimplifiedTagNames } from '../../framework/naming.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { RUST_CONFIG } from './config.js';

export class HttpClientGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const clientName = resolveSdkClientName(config);
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
    const apiKeyHeader = ctx.auth.apiKeyHeader || 'Authorization';
    const apiKeyUseBearer = ctx.auth.apiKeyAsBearer;

    return [
      this.generateHttpClient(apiKeyHeader, apiKeyUseBearer, config),
      this.generateHttpIndex(),
      this.generateSdkClient(clientName, tags, resolvedTagNames, config),
      this.generateLibFile(config),
    ];
  }

  private generateHttpClient(
    apiKeyHeader: string,
    apiKeyUseBearer: boolean,
    config: GeneratorConfig
  ): GeneratedFile {
    return {
      path: 'src/http/client.rs',
      content: this.format(`use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use reqwest::multipart::Form;
use reqwest::{Client, Method, Response};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use thiserror::Error;

pub type QueryParams = HashMap<String, Value>;
pub type RequestHeaders = HashMap<String, String>;

const DEFAULT_API_KEY_HEADER: &str = "${apiKeyHeader}";
const DEFAULT_API_KEY_USE_BEARER: bool = ${apiKeyUseBearer ? 'true' : 'false'};

#[derive(Debug, Clone)]
pub struct SdkworkConfig {
    pub base_url: String,
    pub timeout_ms: u64,
    pub headers: RequestHeaders,
}

impl SdkworkConfig {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            timeout_ms: 30_000,
            headers: RequestHeaders::new(),
        }
    }
}

#[derive(Debug, Error)]
pub enum SdkworkError {
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("invalid header name: {0}")]
    InvalidHeaderName(#[from] reqwest::header::InvalidHeaderName),
    #[error("invalid header value: {0}")]
    InvalidHeaderValue(#[from] reqwest::header::InvalidHeaderValue),
    #[error("http status {status}: {body}")]
    HttpStatus { status: u16, body: String },
}

#[derive(Clone)]
pub struct SdkworkHttpClient {
    base_url: String,
    client: Client,
    headers: Arc<RwLock<RequestHeaders>>,
}

impl SdkworkHttpClient {
    pub fn new(config: SdkworkConfig) -> Result<Self, SdkworkError> {
        let client = Client::builder()
            .timeout(Duration::from_millis(config.timeout_ms.max(1)))
            .build()?;

        Ok(Self {
            base_url: config.base_url.trim_end_matches('/').to_string(),
            client,
            headers: Arc::new(RwLock::new(config.headers)),
        })
    }

    pub fn set_api_key(&self, api_key: impl Into<String>) {
        let value = api_key.into();
        let mut headers = self.headers.write().expect("sdk headers poisoned");
        if DEFAULT_API_KEY_USE_BEARER {
            headers.insert(DEFAULT_API_KEY_HEADER.to_string(), format!("Bearer {}", value));
        } else {
            headers.insert(DEFAULT_API_KEY_HEADER.to_string(), value);
        }
        if DEFAULT_API_KEY_HEADER != "Authorization" {
            headers.remove("Authorization");
        }
        if DEFAULT_API_KEY_HEADER != "Access-Token" {
            headers.remove("Access-Token");
        }
    }

    pub fn set_auth_token(&self, token: impl Into<String>) {
        let mut headers = self.headers.write().expect("sdk headers poisoned");
        if DEFAULT_API_KEY_HEADER != "Authorization" {
            headers.remove(DEFAULT_API_KEY_HEADER);
        }
        headers.insert("Authorization".to_string(), format!("Bearer {}", token.into()));
    }

    pub fn set_access_token(&self, token: impl Into<String>) {
        let mut headers = self.headers.write().expect("sdk headers poisoned");
        if DEFAULT_API_KEY_HEADER != "Access-Token" {
            headers.remove(DEFAULT_API_KEY_HEADER);
        }
        headers.insert("Access-Token".to_string(), token.into());
    }

    pub fn set_header(&self, key: impl Into<String>, value: impl Into<String>) {
        let mut headers = self.headers.write().expect("sdk headers poisoned");
        headers.insert(key.into(), value.into());
    }

    pub async fn get<T>(
        &self,
        path: &str,
        query: Option<&QueryParams>,
        headers: Option<&RequestHeaders>,
    ) -> Result<T, SdkworkError>
    where
        T: DeserializeOwned,
    {
        self.request(Method::GET, path, query, Option::<&Value>::None, headers, None).await
    }

    pub async fn post<T, B>(
        &self,
        path: &str,
        body: Option<&B>,
        query: Option<&QueryParams>,
        headers: Option<&RequestHeaders>,
        content_type: Option<&str>,
    ) -> Result<T, SdkworkError>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        self.request(Method::POST, path, query, body, headers, content_type).await
    }

    pub async fn put<T, B>(
        &self,
        path: &str,
        body: Option<&B>,
        query: Option<&QueryParams>,
        headers: Option<&RequestHeaders>,
        content_type: Option<&str>,
    ) -> Result<T, SdkworkError>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        self.request(Method::PUT, path, query, body, headers, content_type).await
    }

    pub async fn patch<T, B>(
        &self,
        path: &str,
        body: Option<&B>,
        query: Option<&QueryParams>,
        headers: Option<&RequestHeaders>,
        content_type: Option<&str>,
    ) -> Result<T, SdkworkError>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        self.request(Method::PATCH, path, query, body, headers, content_type).await
    }

    pub async fn delete<T>(
        &self,
        path: &str,
        query: Option<&QueryParams>,
        headers: Option<&RequestHeaders>,
    ) -> Result<T, SdkworkError>
    where
        T: DeserializeOwned,
    {
        self.request(Method::DELETE, path, query, Option::<&Value>::None, headers, None).await
    }

    async fn request<T, B>(
        &self,
        method: Method,
        path: &str,
        query: Option<&QueryParams>,
        body: Option<&B>,
        headers: Option<&RequestHeaders>,
        content_type: Option<&str>,
    ) -> Result<T, SdkworkError>
    where
        T: DeserializeOwned,
        B: Serialize + ?Sized,
    {
        let mut request = self.client.request(method, self.build_url(path));
        if let Some(query_values) = query {
            request = request.query(&normalize_query(query_values));
        }

        let merged_headers = self.merge_headers(headers)?;
        request = request.headers(merged_headers);

        if let Some(payload) = body {
            request = apply_body(request, payload, content_type)?;
        }

        let response = request.send().await?;
        decode_response(response).await
    }

    fn build_url(&self, path: &str) -> String {
        if path.starts_with("http://") || path.starts_with("https://") {
            return path.to_string();
        }
        if path.starts_with('/') {
            return format!("{}{}", self.base_url, path);
        }
        format!("{}/{}", self.base_url, path)
    }

    fn merge_headers(&self, headers: Option<&RequestHeaders>) -> Result<HeaderMap, SdkworkError> {
        let mut merged = HeaderMap::new();
        for (key, value) in self.headers.read().expect("sdk headers poisoned").iter() {
            insert_header(&mut merged, key, value)?;
        }
        if let Some(values) = headers {
            for (key, value) in values {
                insert_header(&mut merged, key, value)?;
            }
        }
        Ok(merged)
    }
}

fn apply_body<B>(
    request: reqwest::RequestBuilder,
    body: &B,
    content_type: Option<&str>,
) -> Result<reqwest::RequestBuilder, SdkworkError>
where
    B: Serialize + ?Sized,
{
    let normalized_content_type = content_type.unwrap_or("application/json").trim().to_ascii_lowercase();
    if normalized_content_type.starts_with("multipart/form-data") {
        let payload = serde_json::to_value(body)?;
        return Ok(request.multipart(build_multipart_form(&payload)));
    }
    if normalized_content_type.starts_with("application/x-www-form-urlencoded") {
        return Ok(request.form(body));
    }

    let request = request.json(body);
    if !normalized_content_type.is_empty() && normalized_content_type != "application/json" {
        return Ok(request.header(CONTENT_TYPE, normalized_content_type));
    }
    Ok(request)
}

fn build_multipart_form(value: &Value) -> Form {
    match value {
        Value::Object(entries) => {
            let mut form = Form::new();
            for (key, field_value) in entries {
                form = append_form_value(form, key, field_value);
            }
            form
        }
        other => Form::new().text("value", stringify_value(other)),
    }
}

fn append_form_value(mut form: Form, key: &str, value: &Value) -> Form {
    match value {
        Value::Array(items) => {
            for item in items {
                form = append_form_value(form, key, item);
            }
            form
        }
        _ => form.text(key.to_string(), stringify_value(value)),
    }
}

fn normalize_query(query: &QueryParams) -> Vec<(String, String)> {
    query
        .iter()
        .map(|(key, value)| (key.clone(), stringify_value(value)))
        .collect()
}

fn stringify_value(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::Bool(inner) => inner.to_string(),
        Value::Number(inner) => inner.to_string(),
        Value::String(inner) => inner.clone(),
        Value::Array(_) | Value::Object(_) => value.to_string(),
    }
}

fn insert_header(headers: &mut HeaderMap, key: &str, value: &str) -> Result<(), SdkworkError> {
    let name = HeaderName::from_bytes(key.as_bytes())?;
    let value = HeaderValue::from_str(value)?;
    headers.insert(name, value);
    Ok(())
}

async fn decode_response<T>(response: Response) -> Result<T, SdkworkError>
where
    T: DeserializeOwned,
{
    let status = response.status();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = response.bytes().await?;

    if !status.is_success() {
        return Err(SdkworkError::HttpStatus {
            status: status.as_u16(),
            body: String::from_utf8_lossy(&body).to_string(),
        });
    }

    if body.is_empty() {
        return Ok(serde_json::from_str("null")?);
    }

    if content_type.to_ascii_lowercase().contains("json") {
        return Ok(serde_json::from_slice(&body)?);
    }

    let text = String::from_utf8_lossy(&body).to_string();
    Ok(serde_json::from_value(Value::String(text))?)
}`),
      language: 'rust',
      description: `Rust HTTP client for ${config.name}`,
    };
  }

  private generateHttpIndex(): GeneratedFile {
    return {
      path: 'src/http/mod.rs',
      content: this.format(`pub mod client;

pub use client::{QueryParams, RequestHeaders, SdkworkConfig, SdkworkError, SdkworkHttpClient};`),
      language: 'rust',
      description: 'Rust HTTP module exports',
    };
  }

  private generateSdkClient(
    clientName: string,
    tags: string[],
    resolvedTagNames: Map<string, string>,
    _config: GeneratorConfig
  ): GeneratedFile {
    const getters = tags.map((tag) => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const getterName = RUST_CONFIG.namingConventions.propertyName(resolvedTagName);
      const structName = `${RUST_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
      return `pub fn ${getterName}(&self) -> ${structName} {
        ${structName}::new(Arc::clone(&self.http))
    }`;
    }).join('\n\n');

    return {
      path: 'src/client.rs',
      content: this.format(`use std::sync::Arc;

use crate::api::{${tags.map((tag) => {
  const resolvedTagName = resolvedTagNames.get(tag) || tag;
  return `${RUST_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
}).join(', ')}};
use crate::http::{SdkworkConfig, SdkworkError, SdkworkHttpClient};

#[derive(Clone)]
pub struct ${clientName} {
    http: Arc<SdkworkHttpClient>,
}

impl ${clientName} {
    pub fn new(config: SdkworkConfig) -> Result<Self, SdkworkError> {
        Ok(Self {
            http: Arc::new(SdkworkHttpClient::new(config)?),
        })
    }

    pub fn new_with_base_url(base_url: impl Into<String>) -> Result<Self, SdkworkError> {
        Self::new(SdkworkConfig::new(base_url))
    }

    pub fn set_api_key(&self, api_key: impl Into<String>) -> &Self {
        self.http.set_api_key(api_key);
        self
    }

    pub fn set_auth_token(&self, token: impl Into<String>) -> &Self {
        self.http.set_auth_token(token);
        self
    }

    pub fn set_access_token(&self, token: impl Into<String>) -> &Self {
        self.http.set_access_token(token);
        self
    }

    pub fn set_header(&self, key: impl Into<String>, value: impl Into<String>) -> &Self {
        self.http.set_header(key, value);
        self
    }

    pub fn http_client(&self) -> Arc<SdkworkHttpClient> {
        Arc::clone(&self.http)
    }

${this.indent(getters, 4)}
}`),
      language: 'rust',
      description: 'Main Rust SDK client',
    };
  }

  private generateLibFile(config: GeneratorConfig): GeneratedFile {
    return {
      path: 'src/lib.rs',
      content: this.format(`pub mod api;
mod client;
pub mod http;
pub mod models;

pub use client::${resolveSdkClientName(config)};
pub use http::{QueryParams, RequestHeaders, SdkworkConfig, SdkworkError, SdkworkHttpClient};
pub use models::*;`),
      language: 'rust',
      description: 'Rust crate entrypoint',
    };
  }

  private indent(content: string, spaces: number): string {
    const prefix = ' '.repeat(spaces);
    return content
      .split('\n')
      .map((line) => (line ? `${prefix}${line}` : line))
      .join('\n');
  }

  private format(content: string): string {
    return `${content.trim()}\n`;
  }
}
