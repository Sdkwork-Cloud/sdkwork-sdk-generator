use std::collections::{HashMap, VecDeque};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use sdkwork_sdk_generator::{
    GenerateFromFileRequest, GenerateFromPathRequest, GenerateFromUrlRequest,
    GeneratedPackageFormat, GenerationStatus, SdkGeneratorClient, SdkGeneratorError, SdkLanguage,
    SdkType,
};

#[tokio::test]
async fn generate_from_openapi_url_posts_standard_json_payload() {
    let server = TestServer::start(json_response(
        200,
        r#"{"jobId":"job-url","status":"completed","downloadUrl":"/v1/sdk-generator/jobs/job-url/download"}"#,
    ));
    let client = SdkGeneratorClient::new(server.base_url()).unwrap();

    let response = client
        .generate_from_url(
            GenerateFromUrlRequest::new(
                "https://api.example.com/openapi.yaml",
                SdkLanguage::Rust,
                "Backend",
            )
            .sdk_type(SdkType::Backend)
            .package_name("sdkwork-notes-backend-sdk")
            .base_url("https://api.example.com")
            .api_prefix("/backend/v3/api"),
        )
        .await
        .unwrap();
    let captured = server.join();

    assert_eq!(response.job_id, "job-url");
    assert_eq!(response.status, GenerationStatus::Completed);
    assert_eq!(captured.method, "POST");
    assert_eq!(captured.path, "/v1/sdk-generator/generations");
    assert!(captured.content_type.starts_with("application/json"));
    assert!(captured
        .body_text()
        .contains(r#""input":{"kind":"url","url":"https://api.example.com/openapi.yaml"}"#));
    assert!(captured.body_text().contains(r#""language":"rust""#));
    assert!(captured.body_text().contains(r#""sdkType":"backend""#));
    assert!(captured
        .body_text()
        .contains(r#""packageName":"sdkwork-notes-backend-sdk""#));
}

#[tokio::test]
async fn generate_from_url_normalizes_request_text_before_sending() {
    let server = TestServer::start(json_response(
        200,
        r#"{"jobId":"job-normalized","status":"completed"}"#,
    ));
    let client = SdkGeneratorClient::new(server.base_url()).unwrap();

    let response = client
        .generate_from_url(
            GenerateFromUrlRequest::new(
                "  https://api.example.com/openapi.yaml  ",
                SdkLanguage::Rust,
                "  Backend  ",
            )
            .package_name("  sdkwork-notes-backend-sdk  ")
            .namespace("  com.sdkwork.notes.backend  ")
            .version("  1.2.3  ")
            .description("  Backend SDK  ")
            .author("  SDKWork  ")
            .license("  MIT  ")
            .base_url("  https://api.example.com  ")
            .api_prefix("  /backend/v3/api  "),
        )
        .await
        .unwrap();
    let captured = server.join();
    let body = captured.body_text();

    assert_eq!(response.status, GenerationStatus::Completed);
    assert!(body.contains(r#""url":"https://api.example.com/openapi.yaml""#));
    assert!(body.contains(r#""name":"Backend""#));
    assert!(body.contains(r#""packageName":"sdkwork-notes-backend-sdk""#));
    assert!(body.contains(r#""namespace":"com.sdkwork.notes.backend""#));
    assert!(body.contains(r#""version":"1.2.3""#));
    assert!(body.contains(r#""description":"Backend SDK""#));
    assert!(body.contains(r#""author":"SDKWork""#));
    assert!(body.contains(r#""license":"MIT""#));
    assert!(body.contains(r#""baseUrl":"https://api.example.com""#));
    assert!(body.contains(r#""apiPrefix":"/backend/v3/api""#));
    assert!(!body.contains("  Backend  "));
}

#[tokio::test]
async fn generate_from_url_rejects_invalid_request_before_http() {
    let client = SdkGeneratorClient::new("http://127.0.0.1:9").unwrap();

    let empty_url = client
        .generate_from_url(GenerateFromUrlRequest::new("", SdkLanguage::Rust, "Demo"))
        .await
        .unwrap_err();
    assert_invalid_configuration(empty_url, "openapi_url");

    let invalid_scheme = client
        .generate_from_url(GenerateFromUrlRequest::new(
            "file:///tmp/openapi.yaml",
            SdkLanguage::Rust,
            "Demo",
        ))
        .await
        .unwrap_err();
    assert_invalid_configuration(invalid_scheme, "http or https");

    let empty_name = client
        .generate_from_url(GenerateFromUrlRequest::new(
            "https://api.example.com/openapi.yaml",
            SdkLanguage::Rust,
            " ",
        ))
        .await
        .unwrap_err();
    assert_invalid_configuration(empty_name, "name");

    let blank_option = client
        .generate_from_url(
            GenerateFromUrlRequest::new(
                "https://api.example.com/openapi.yaml",
                SdkLanguage::Rust,
                "Demo",
            )
            .package_name(" "),
        )
        .await
        .unwrap_err();
    assert_invalid_configuration(blank_option, "package_name");
}

#[test]
fn client_rejects_invalid_service_base_urls() {
    assert!(SdkGeneratorClient::new("").is_err());
    assert!(SdkGeneratorClient::new("generator.example.com").is_err());
    assert!(SdkGeneratorClient::new("ftp://generator.example.com").is_err());
    assert!(SdkGeneratorClient::new("https://generator.example.com?tenant=a").is_err());
    assert!(SdkGeneratorClient::new("https://generator.example.com#sdk").is_err());
}

#[test]
fn client_rejects_empty_api_keys_when_auth_is_configured() {
    assert!(SdkGeneratorClient::builder("https://generator.example.com")
        .api_key(" ")
        .build()
        .is_err());
}

#[tokio::test]
async fn api_key_is_trimmed_before_authorization_header_is_sent() {
    let server = TestServer::start(json_response(
        200,
        r#"{"jobId":"job-auth-trimmed","status":"completed"}"#,
    ));
    let client = SdkGeneratorClient::builder(server.base_url())
        .api_key("  secret-token  ")
        .build()
        .unwrap();

    client.get_generation("job-auth-trimmed").await.unwrap();
    let captured = server.join();

    assert_eq!(
        captured.headers.get("authorization").map(String::as_str),
        Some("Bearer secret-token")
    );
}

#[test]
fn client_rejects_invalid_polling_configuration() {
    assert!(SdkGeneratorClient::builder("https://generator.example.com")
        .poll_interval(Duration::ZERO)
        .build()
        .is_err());
    assert!(SdkGeneratorClient::builder("https://generator.example.com")
        .max_poll_attempts(0)
        .build()
        .is_err());
}

#[tokio::test]
async fn api_key_is_sent_as_bearer_authorization_header() {
    let server = TestServer::start(json_response(
        200,
        r#"{"jobId":"job-auth","status":"completed"}"#,
    ));
    let client = SdkGeneratorClient::builder(server.base_url())
        .api_key("secret-token")
        .build()
        .unwrap();

    client.get_generation("job-auth").await.unwrap();
    let captured = server.join();

    assert_eq!(
        captured.headers.get("authorization").map(String::as_str),
        Some("Bearer secret-token")
    );
}

#[tokio::test]
async fn generate_from_file_normalizes_form_text_before_sending() {
    let server = TestServer::start(json_response(
        202,
        r#"{"jobId":"job-file-normalized","status":"queued"}"#,
    ));
    let client = SdkGeneratorClient::new(server.base_url()).unwrap();

    let response = client
        .generate_from_file(
            GenerateFromFileRequest::new(
                "  openapi.yaml  ",
                "openapi: 3.1.0\ninfo:\n  title: Demo\n  version: 1.0.0\npaths: {}\n",
                SdkLanguage::TypeScript,
                "  Frontend  ",
            )
            .sdk_type(SdkType::App)
            .package_name("  @sdkwork/frontend-sdk  "),
        )
        .await
        .unwrap();
    let captured = server.join();
    let body = captured.body_text();

    assert_eq!(response.status, GenerationStatus::Queued);
    assert!(body.contains(r#"name="openapi"; filename="openapi.yaml""#));
    assert!(body.contains("Frontend"));
    assert!(body.contains("@sdkwork/frontend-sdk"));
    assert!(!body.contains("  openapi.yaml  "));
    assert!(!body.contains("  Frontend  "));
}

#[tokio::test]
async fn generate_from_openapi_file_uploads_multipart_payload() {
    let server = TestServer::start(json_response(
        202,
        r#"{"jobId":"job-file","status":"queued","downloadUrl":null}"#,
    ));
    let client = SdkGeneratorClient::new(server.base_url()).unwrap();

    let response = client
        .generate_from_file(
            GenerateFromFileRequest::new(
                "openapi.yaml",
                "openapi: 3.1.0\ninfo:\n  title: Demo\n  version: 1.0.0\npaths: {}\n",
                SdkLanguage::TypeScript,
                "Frontend",
            )
            .sdk_type(SdkType::App),
        )
        .await
        .unwrap();
    let captured = server.join();

    assert_eq!(response.job_id, "job-file");
    assert_eq!(response.status, GenerationStatus::Queued);
    assert_eq!(captured.method, "POST");
    assert_eq!(captured.path, "/v1/sdk-generator/generations:upload");
    assert!(captured.content_type.starts_with("multipart/form-data"));
    let body = captured.body_text();
    assert!(body.contains(r#"name="openapi"; filename="openapi.yaml""#));
    assert!(body.contains("Content-Type: application/openapi+yaml"));
    assert!(captured.body_text().contains("openapi: 3.1.0"));
    assert!(captured.body_text().contains(r#"name="language""#));
    assert!(captured.body_text().contains("typescript"));
    assert!(captured.body_text().contains(r#"name="sdkType""#));
    assert!(captured.body_text().contains("app"));
}

#[tokio::test]
async fn generate_from_file_rejects_invalid_upload_request_before_http() {
    let client = SdkGeneratorClient::new("http://127.0.0.1:9").unwrap();

    let empty_file_name = client
        .generate_from_file(GenerateFromFileRequest::new(
            "",
            b"openapi: 3.1.0".to_vec(),
            SdkLanguage::TypeScript,
            "Demo",
        ))
        .await
        .unwrap_err();
    assert_invalid_configuration(empty_file_name, "file_name");

    let empty_file_content = client
        .generate_from_file(GenerateFromFileRequest::new(
            "openapi.yaml",
            Vec::<u8>::new(),
            SdkLanguage::TypeScript,
            "Demo",
        ))
        .await
        .unwrap_err();
    assert_invalid_configuration(empty_file_content, "file_content");

    let empty_name = client
        .generate_from_file(GenerateFromFileRequest::new(
            "openapi.yaml",
            b"openapi: 3.1.0".to_vec(),
            SdkLanguage::TypeScript,
            "",
        ))
        .await
        .unwrap_err();
    assert_invalid_configuration(empty_name, "name");
}

#[tokio::test]
async fn generate_from_openapi_path_reads_file_and_uploads_with_file_name() {
    let spec_path = temp_openapi_file("sdkwork-rust-client-openapi.yaml");
    fs::write(
        &spec_path,
        "openapi: 3.1.0\ninfo:\n  title: Path Demo\n  version: 1.0.0\npaths: {}\n",
    )
    .unwrap();
    let server = TestServer::start(json_response(
        202,
        r#"{"jobId":"job-path","status":"queued","downloadUrl":null}"#,
    ));
    let client = SdkGeneratorClient::new(server.base_url()).unwrap();

    let response = client
        .generate_from_path(GenerateFromPathRequest::new(
            &spec_path,
            SdkLanguage::Python,
            "PathSdk",
        ))
        .await
        .unwrap();
    let captured = server.join();

    assert_eq!(response.job_id, "job-path");
    assert_eq!(captured.method, "POST");
    assert_eq!(captured.path, "/v1/sdk-generator/generations:upload");
    assert!(captured
        .body_text()
        .contains(r#"name="openapi"; filename="sdkwork-rust-client-openapi.yaml""#));
    assert!(captured.body_text().contains("title: Path Demo"));
    assert!(captured.body_text().contains("python"));
    cleanup_temp_path(&spec_path);
}

#[tokio::test]
async fn generate_from_openapi_path_accepts_generation_options() {
    let spec_path = temp_openapi_file("sdkwork-rust-client-options-openapi.json");
    fs::write(
        &spec_path,
        r#"{"openapi":"3.1.0","info":{"title":"Options Demo","version":"1.0.0"},"paths":{}}"#,
    )
    .unwrap();
    let server = TestServer::start(json_response(
        202,
        r#"{"jobId":"job-path-options","status":"queued"}"#,
    ));
    let client = SdkGeneratorClient::new(server.base_url()).unwrap();

    let response = client
        .generate_from_path(
            GenerateFromPathRequest::new(&spec_path, SdkLanguage::Ruby, "PathOptions")
                .sdk_type(SdkType::Backend)
                .package_name("sdkwork-path-options")
                .namespace("Sdkwork::PathOptions")
                .version("2.0.0"),
        )
        .await
        .unwrap();
    let captured = server.join();

    assert_eq!(response.job_id, "job-path-options");
    assert_eq!(response.status, GenerationStatus::Queued);
    assert_eq!(captured.method, "POST");
    assert_eq!(captured.path, "/v1/sdk-generator/generations:upload");
    assert!(captured.body_text().contains("ruby"));
    assert!(captured.body_text().contains("backend"));
    assert!(captured.body_text().contains("sdkwork-path-options"));
    assert!(captured.body_text().contains("Sdkwork::PathOptions"));
    assert!(captured.body_text().contains("2.0.0"));
    cleanup_temp_path(&spec_path);
}

#[tokio::test]
async fn generate_from_path_and_download_polls_until_package_is_ready() {
    let spec_path = temp_openapi_file("sdkwork-rust-client-combo-openapi.json");
    fs::write(
        &spec_path,
        r#"{"openapi":"3.1.0","info":{"title":"Combo Path","version":"1.0.0"},"paths":{}}"#,
    )
    .unwrap();
    let server = TestServer::start_many(vec![
        json_response(
            202,
            r#"{"jobId":"job-path-combo","status":"queued","downloadUrl":null}"#,
        ),
        json_response(200, r#"{"jobId":"job-path-combo","status":"ready"}"#),
        binary_response(
            200,
            "application/zip",
            "attachment; filename=\"path-combo-sdk.zip\"",
            b"PK\x03\x04path".to_vec(),
        ),
    ]);
    let client = SdkGeneratorClient::builder(server.base_url())
        .poll_interval(std::time::Duration::from_millis(1))
        .build()
        .unwrap();

    let package = client
        .generate_from_path_and_download(
            GenerateFromPathRequest::new(&spec_path, SdkLanguage::Java, "PathCombo")
                .sdk_type(SdkType::Backend),
            GeneratedPackageFormat::Zip,
        )
        .await
        .unwrap();
    let captured = server.join_all();

    assert_eq!(captured.len(), 3);
    assert_eq!(captured[0].method, "POST");
    assert_eq!(captured[0].path, "/v1/sdk-generator/generations:upload");
    assert!(captured[0]
        .body_text()
        .contains("Content-Type: application/openapi+json"));
    assert_eq!(captured[1].method, "GET");
    assert_eq!(captured[1].path, "/v1/sdk-generator/jobs/job-path-combo");
    assert_eq!(captured[2].method, "GET");
    assert_eq!(
        captured[2].path,
        "/v1/sdk-generator/jobs/job-path-combo/download"
    );
    assert_eq!(package.file_name.as_deref(), Some("path-combo-sdk.zip"));
    assert_eq!(package.bytes.as_ref(), b"PK\x03\x04path");
    cleanup_temp_path(&spec_path);
}

#[tokio::test]
async fn download_generated_package_returns_archive_bytes_and_metadata() {
    let server = TestServer::start(binary_response(
        200,
        "application/zip",
        "attachment; filename=\"backend-sdk.zip\"",
        b"PK\x03\x04sdk".to_vec(),
    ));
    let client = SdkGeneratorClient::new(server.base_url()).unwrap();

    let package = client
        .download_package("job-123", GeneratedPackageFormat::Zip)
        .await
        .unwrap();
    let captured = server.join();

    assert_eq!(captured.method, "GET");
    assert_eq!(captured.path, "/v1/sdk-generator/jobs/job-123/download");
    assert_eq!(
        captured.query.get("format").map(String::as_str),
        Some("zip")
    );
    assert_eq!(package.file_name.as_deref(), Some("backend-sdk.zip"));
    assert_eq!(package.content_type.as_deref(), Some("application/zip"));
    assert_eq!(package.bytes.as_ref(), b"PK\x03\x04sdk");
}

#[tokio::test]
async fn download_generated_package_decodes_rfc5987_file_names() {
    let server = TestServer::start(binary_response(
        200,
        "application/gzip",
        "attachment; filename*=UTF-8''backend%20sdk.tar.gz",
        b"\x1f\x8bsdk".to_vec(),
    ));
    let client = SdkGeneratorClient::new(server.base_url()).unwrap();

    let package = client
        .download_package("job-rfc5987", GeneratedPackageFormat::TarGz)
        .await
        .unwrap();
    let captured = server.join();

    assert_eq!(captured.path, "/v1/sdk-generator/jobs/job-rfc5987/download");
    assert_eq!(package.file_name.as_deref(), Some("backend sdk.tar.gz"));
    assert_eq!(package.bytes.as_ref(), b"\x1f\x8bsdk");
}

#[tokio::test]
async fn get_generation_fetches_status_and_metadata() {
    let server = TestServer::start(json_response(
        200,
        r#"{"jobId":"job-status","status":"running","downloadUrl":null,"metadata":{"progress":60}}"#,
    ));
    let client = SdkGeneratorClient::new(server.base_url()).unwrap();

    let status = client.get_generation("job-status").await.unwrap();
    let captured = server.join();

    assert_eq!(captured.method, "GET");
    assert_eq!(captured.path, "/v1/sdk-generator/jobs/job-status");
    assert_eq!(status.job_id, "job-status");
    assert_eq!(status.status, GenerationStatus::Running);
    assert_eq!(status.metadata["progress"], 60);
}

#[tokio::test]
async fn get_generation_accepts_status_response_without_download_url() {
    let server = TestServer::start(json_response(
        200,
        r#"{"jobId":"job-minimal","status":"running","metadata":{"progress":20}}"#,
    ));
    let client = SdkGeneratorClient::new(server.base_url()).unwrap();

    let status = client.get_generation("job-minimal").await.unwrap();
    let captured = server.join();

    assert_eq!(captured.method, "GET");
    assert_eq!(captured.path, "/v1/sdk-generator/jobs/job-minimal");
    assert_eq!(status.job_id, "job-minimal");
    assert_eq!(status.status, GenerationStatus::Running);
    assert_eq!(status.download_url, None);
    assert_eq!(status.metadata["progress"], 20);
}

#[tokio::test]
async fn get_generation_preserves_unknown_status_values() {
    let server = TestServer::start(json_response(
        200,
        r#"{"jobId":"job-validating","status":"validating","metadata":{"progress":10}}"#,
    ));
    let client = SdkGeneratorClient::new(server.base_url()).unwrap();

    let status = client.get_generation("job-validating").await.unwrap();
    let captured = server.join();

    assert_eq!(captured.method, "GET");
    assert_eq!(captured.path, "/v1/sdk-generator/jobs/job-validating");
    assert_eq!(
        status.status,
        GenerationStatus::Unknown("validating".to_string())
    );
    assert_eq!(status.status.as_str(), "validating");
}

#[test]
fn generation_status_displays_stable_wire_values() {
    assert_eq!(GenerationStatus::Queued.to_string(), "queued");
    assert_eq!(GenerationStatus::Running.to_string(), "running");
    assert_eq!(GenerationStatus::Completed.to_string(), "completed");
    assert_eq!(GenerationStatus::Failed.to_string(), "failed");
    assert_eq!(GenerationStatus::Cancelled.to_string(), "cancelled");
    assert_eq!(
        GenerationStatus::Unknown("validating".to_string()).to_string(),
        "validating"
    );
}

#[tokio::test]
async fn job_operations_reject_empty_job_ids_before_http() {
    let client = SdkGeneratorClient::new("http://127.0.0.1:9").unwrap();

    let status_error = client.get_generation(" ").await.unwrap_err();
    assert_invalid_configuration(status_error, "job_id");

    let download_error = client
        .download_package("", GeneratedPackageFormat::Zip)
        .await
        .unwrap_err();
    assert_invalid_configuration(download_error, "job_id");
}

#[tokio::test]
async fn generate_from_url_and_download_polls_until_package_is_ready() {
    let server = TestServer::start_many(vec![
        json_response(
            202,
            r#"{"jobId":"job-combo","status":"queued","downloadUrl":null}"#,
        ),
        json_response(
            200,
            r#"{"jobId":"job-combo","status":"completed","downloadUrl":"/v1/sdk-generator/jobs/job-combo/download"}"#,
        ),
        binary_response(
            200,
            "application/gzip",
            "attachment; filename=\"combo-sdk.tar.gz\"",
            b"\x1f\x8bcombo".to_vec(),
        ),
    ]);
    let client = SdkGeneratorClient::builder(server.base_url())
        .poll_interval(std::time::Duration::from_millis(1))
        .build()
        .unwrap();

    let package = client
        .generate_from_url_and_download(
            GenerateFromUrlRequest::new(
                "https://api.example.com/openapi.json",
                SdkLanguage::Go,
                "Combo",
            )
            .sdk_type(SdkType::Backend),
            GeneratedPackageFormat::TarGz,
        )
        .await
        .unwrap();
    let captured = server.join_all();

    assert_eq!(captured.len(), 3);
    assert_eq!(captured[0].method, "POST");
    assert_eq!(captured[0].path, "/v1/sdk-generator/generations");
    assert_eq!(captured[1].method, "GET");
    assert_eq!(captured[1].path, "/v1/sdk-generator/jobs/job-combo");
    assert_eq!(captured[2].method, "GET");
    assert_eq!(
        captured[2].path,
        "/v1/sdk-generator/jobs/job-combo/download"
    );
    assert_eq!(
        captured[2].query.get("format").map(String::as_str),
        Some("tar.gz")
    );
    assert_eq!(package.file_name.as_deref(), Some("combo-sdk.tar.gz"));
    assert_eq!(package.bytes.as_ref(), b"\x1f\x8bcombo");
}

#[tokio::test]
async fn generate_from_url_and_download_returns_generation_failed_status() {
    let server = TestServer::start_many(vec![
        json_response(
            202,
            r#"{"jobId":"job-failed","status":"queued","downloadUrl":null}"#,
        ),
        json_response(
            200,
            r#"{"jobId":"job-failed","status":"error","downloadUrl":null}"#,
        ),
    ]);
    let client = SdkGeneratorClient::builder(server.base_url())
        .poll_interval(std::time::Duration::from_millis(1))
        .build()
        .unwrap();

    let error = client
        .generate_from_url_and_download(
            GenerateFromUrlRequest::new(
                "https://api.example.com/openapi.json",
                SdkLanguage::Go,
                "Failure",
            ),
            GeneratedPackageFormat::Zip,
        )
        .await
        .unwrap_err();
    let captured = server.join_all();

    assert_eq!(captured.len(), 2);
    match error {
        SdkGeneratorError::GenerationFailed { job_id, status } => {
            assert_eq!(job_id, "job-failed");
            assert_eq!(status, GenerationStatus::Failed);
        }
        other => panic!("expected generation failure, got {other:?}"),
    }
}

struct TestServer {
    base_url: String,
    handle: thread::JoinHandle<Vec<CapturedRequest>>,
}

impl TestServer {
    fn start(response: Vec<u8>) -> Self {
        Self::start_many(vec![response])
    }

    fn start_many(responses: Vec<Vec<u8>>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = thread::spawn(move || {
            let mut captured_requests = Vec::new();
            let mut responses = VecDeque::from(responses);
            while let Some(response) = responses.pop_front() {
                let (mut stream, _) = listener.accept().unwrap();
                let captured = read_http_request(&mut stream);
                stream.write_all(&response).unwrap();
                captured_requests.push(captured);
            }
            captured_requests
        });

        Self {
            base_url: format!("http://127.0.0.1:{port}"),
            handle,
        }
    }

    fn base_url(&self) -> String {
        self.base_url.clone()
    }

    fn join(self) -> CapturedRequest {
        self.join_all().into_iter().next().unwrap()
    }

    fn join_all(self) -> Vec<CapturedRequest> {
        self.handle.join().unwrap()
    }
}

#[derive(Debug)]
struct CapturedRequest {
    method: String,
    path: String,
    query: HashMap<String, String>,
    headers: HashMap<String, String>,
    body: Vec<u8>,
    content_type: String,
}

impl CapturedRequest {
    fn body_text(&self) -> String {
        String::from_utf8_lossy(&self.body).to_string()
    }
}

fn read_http_request(stream: &mut impl Read) -> CapturedRequest {
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 4096];
    let mut headers_end = None;
    let mut content_length = 0_usize;

    loop {
        let read = stream.read(&mut chunk).unwrap();
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);

        if headers_end.is_none() {
            if let Some(index) = find_bytes(&buffer, b"\r\n\r\n") {
                headers_end = Some(index + 4);
                content_length = extract_content_length(&buffer[..index + 4]);
            }
        }

        if let Some(end) = headers_end {
            if buffer.len() >= end + content_length {
                break;
            }
        }
    }

    let headers_end = headers_end.unwrap();
    let header_text = String::from_utf8_lossy(&buffer[..headers_end]);
    let mut lines = header_text.split("\r\n");
    let request_line = lines.next().unwrap_or_default();
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or_default().to_string();
    let target = request_parts.next().unwrap_or("/");
    let (path, raw_query) = target.split_once('?').unwrap_or((target, ""));

    let mut headers = HashMap::new();
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }

    CapturedRequest {
        method,
        path: path.to_string(),
        query: parse_query(raw_query),
        content_type: headers.get("content-type").cloned().unwrap_or_default(),
        headers,
        body: buffer[headers_end..headers_end + content_length].to_vec(),
    }
}

fn extract_content_length(headers: &[u8]) -> usize {
    let text = String::from_utf8_lossy(headers);
    for line in text.split("\r\n") {
        if let Some(value) = line
            .strip_prefix("Content-Length:")
            .or_else(|| line.strip_prefix("content-length:"))
        {
            return value.trim().parse().unwrap();
        }
    }
    0
}

fn parse_query(query: &str) -> HashMap<String, String> {
    let mut values = HashMap::new();
    for pair in query.split('&').filter(|pair| !pair.is_empty()) {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        values.insert(key.to_string(), value.to_string());
    }
    values
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn json_response(status: u16, body: &str) -> Vec<u8> {
    format!(
        "HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
    .into_bytes()
}

fn binary_response(
    status: u16,
    content_type: &str,
    content_disposition: &str,
    body: Vec<u8>,
) -> Vec<u8> {
    let mut response = format!(
        "HTTP/1.1 {status} OK\r\nContent-Type: {content_type}\r\nContent-Disposition: {content_disposition}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    )
    .into_bytes();
    response.extend_from_slice(&body);
    response
}

fn temp_openapi_file(name: &str) -> PathBuf {
    let mut directory = std::env::temp_dir();
    directory.push(format!(
        "sdkwork-rust-client-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&directory).unwrap();
    directory.join(name)
}

fn cleanup_temp_path(path: &PathBuf) {
    let parent = path.parent().map(PathBuf::from);
    let _ = fs::remove_file(path);
    if let Some(parent) = parent {
        let _ = fs::remove_dir(parent);
    }
}

fn assert_invalid_configuration(error: SdkGeneratorError, expected_fragment: &str) {
    match error {
        SdkGeneratorError::InvalidConfiguration(message) => {
            assert!(
                message.contains(expected_fragment),
                "expected invalid configuration message to contain {expected_fragment:?}, got {message:?}"
            );
        }
        other => panic!("expected invalid configuration, got {other:?}"),
    }
}
