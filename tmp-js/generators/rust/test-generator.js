import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { getRustCrateName } from './config.js';
import { RustUsagePlanner, resolveRustExpectedRequestPath, } from './usage-planner.js';
export class TestGenerator {
    generate(ctx, config) {
        const planner = new RustUsagePlanner(ctx);
        const plan = planner.selectQuickStartPlan();
        if (!plan) {
            throw new Error('Rust generateTests requires at least one API operation to build a smoke test.');
        }
        return [{
                path: 'tests/generated_sdk_smoke.rs',
                content: this.generateSmokeTest(plan, config),
                language: 'rust',
                description: 'Generated Rust SDK smoke test',
            }];
    }
    generateSmokeTest(plan, config) {
        const crateName = getRustCrateName(config);
        const clientName = resolveSdkClientName(config);
        const expectedPath = resolveRustExpectedRequestPath(plan.operation.path, config.apiPrefix);
        const setupLines = this.indent(plan.variables.flatMap((variable) => variable.setupByMode.test).join('\n'), 4);
        const callLine = plan.hasReturnValue
            ? `let result = ${plan.callExpression}.await?;`
            : `${plan.callExpression}.await?;`;
        const assertions = this.indent(this.buildAssertions(plan, expectedPath), 4);
        const responseBodyLine = plan.responseBody
            ? `let response_body = ${this.quote(plan.responseBody)}.into_bytes();`
            : 'let response_body = Vec::new();';
        const responseContentType = plan.responseBody ? 'Some("application/json")' : 'None';
        return this.format(`use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::thread;

use ${crateName}::{${clientName}, SdkworkConfig};
use ${crateName}::*;
use serde_json::Value;

#[derive(Debug)]
struct CapturedRequest {
    path: String,
    query: HashMap<String, String>,
    headers: HashMap<String, String>,
    body: Vec<u8>,
    content_type: String,
}

#[tokio::test]
async fn generated_sdk_forwards_request_metadata() -> Result<(), Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    let (tx, rx) = mpsc::channel();

    let server = thread::spawn(move || -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let (mut stream, _) = listener.accept()?;
        let captured = read_http_request(&mut stream)?;
        ${responseBodyLine}
        let response = build_response_bytes(${plan.responseStatusCode}, ${responseContentType}, &response_body);
        stream.write_all(&response)?;
        tx.send(captured)?;
        Ok(())
    });

    let client = ${clientName}::new(SdkworkConfig::new(format!("http://127.0.0.1:{port}")))?;

${setupLines}
    ${callLine}
    let captured = rx.recv()?;
    let server_result = server
        .join()
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "server thread panicked"))?;
    server_result.map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error.to_string()))?;

${assertions}
    Ok(())
}

fn read_http_request(stream: &mut impl Read) -> Result<CapturedRequest, Box<dyn std::error::Error + Send + Sync>> {
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 4096];
    let mut headers_end = None;
    let mut content_length = 0_usize;

    loop {
        let read = stream.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);

        if headers_end.is_none() {
            if let Some(index) = find_bytes(&buffer, b"\\r\\n\\r\\n") {
                headers_end = Some(index + 4);
                content_length = extract_content_length(&buffer[..index + 4])?;
            }
        }

        if let Some(end) = headers_end {
            if buffer.len() >= end + content_length {
                break;
            }
        }
    }

    let headers_end = headers_end
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidData, "missing request headers"))?;
    let header_text = String::from_utf8_lossy(&buffer[..headers_end]);
    let mut lines = header_text.split("\\r\\n");
    let request_line = lines.next().unwrap_or_default();
    let target = request_line.split_whitespace().nth(1).unwrap_or("/");
    let (path, raw_query) = target.split_once('?').unwrap_or((target, ""));

    let mut headers = HashMap::new();
    for line in lines {
        if line.is_empty() {
            continue;
        }
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }

    let body = buffer[headers_end..headers_end + content_length].to_vec();
    let content_type = headers.get("content-type").cloned().unwrap_or_default();
    Ok(CapturedRequest {
        path: path.to_string(),
        query: parse_query(raw_query),
        headers,
        body,
        content_type,
    })
}

fn extract_content_length(headers: &[u8]) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let text = String::from_utf8_lossy(headers);
    for line in text.split("\\r\\n") {
        if let Some(value) = line.strip_prefix("Content-Length:").or_else(|| line.strip_prefix("content-length:")) {
            return Ok(value.trim().parse::<usize>()?);
        }
    }
    Ok(0)
}

fn parse_query(query: &str) -> HashMap<String, String> {
    let mut values = HashMap::new();
    if query.is_empty() {
        return values;
    }
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        values.insert(key.to_string(), value.to_string());
    }
    values
}

fn build_response_bytes(status_code: u16, content_type: Option<&str>, body: &[u8]) -> Vec<u8> {
    let mut response = format!(
        "HTTP/1.1 {} {}\\r\\nContent-Length: {}\\r\\nConnection: close\\r\\n",
        status_code,
        status_text(status_code),
        body.len()
    );
    if let Some(content_type) = content_type {
        response.push_str(&format!("Content-Type: {}\\r\\n", content_type));
    }
    response.push_str("\\r\\n");

    let mut bytes = response.into_bytes();
    bytes.extend_from_slice(body);
    bytes
}

fn status_text(status_code: u16) -> &'static str {
    match status_code {
        200 => "OK",
        201 => "Created",
        204 => "No Content",
        _ => "OK",
    }
}

fn assert_json_eq(actual: &[u8], expected: &[u8]) {
    let actual_json: Value = serde_json::from_slice(actual).expect("captured request body should be valid json");
    let expected_json: Value = serde_json::from_slice(expected).expect("expected request body should be valid json");
    assert_eq!(actual_json, expected_json);
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|window| window == needle)
}
`);
    }
    buildAssertions(plan, expectedPath) {
        const lines = [`assert_eq!(captured.path, ${this.quote(expectedPath)});`];
        for (const expectation of plan.queryExpectations) {
            lines.push(`assert_eq!(captured.query.get(${this.quote(expectation.name)}).map(String::as_str), Some(${this.quote(expectation.expected)}));`);
        }
        for (const expectation of plan.headerExpectations) {
            lines.push(`assert_eq!(captured.headers.get(${this.quote(expectation.name.toLowerCase())}).map(String::as_str), Some(${this.quote(expectation.expected)}));`);
        }
        if (plan.bodyAssertion) {
            if (plan.bodyAssertion.contentTypeMatch === 'prefix') {
                lines.push(`assert!(captured.content_type.starts_with(${this.quote(plan.bodyAssertion.contentType)}));`);
            }
            else {
                lines.push(`assert_eq!(captured.content_type, ${this.quote(plan.bodyAssertion.contentType)});`);
            }
            if (plan.bodyAssertion.kind === 'json') {
                lines.push('assert_json_eq(&captured.body, &serde_json::to_vec(&body)?);');
            }
            else {
                lines.push('assert!(!captured.body.is_empty());');
            }
        }
        lines.push(...plan.responseAssertions);
        return lines.join('\n');
    }
    quote(value) {
        return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    indent(content, spaces) {
        const prefix = ' '.repeat(Math.max(0, spaces));
        return content.split('\n').map((line) => (line ? `${prefix}${line}` : line)).join('\n');
    }
    format(content) {
        return content.trim() + '\n';
    }
}
