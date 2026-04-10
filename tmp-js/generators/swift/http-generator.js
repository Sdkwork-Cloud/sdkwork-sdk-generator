import { resolveSimplifiedTagNames } from '../../framework/naming.js';
import { resolveSwiftCommonPackage } from '../../framework/common-package.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { SWIFT_CONFIG } from './config.js';
export class HttpClientGenerator {
    generate(ctx, config) {
        const clientName = resolveSdkClientName(config);
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const apiKeyHeader = ctx.auth.apiKeyHeader || 'Authorization';
        const apiKeyUseBearer = ctx.auth.apiKeyAsBearer;
        const commonPkg = resolveSwiftCommonPackage(config);
        return [
            this.generateHttpClient(config, apiKeyHeader, apiKeyUseBearer, commonPkg.productName),
            this.generateSdkClient(clientName, tags, resolvedTagNames, config, commonPkg.productName),
        ];
    }
    generateHttpClient(config, apiKeyHeader, apiKeyUseBearer, commonProductName) {
        return {
            path: 'Sources/HTTP/HttpClient.swift',
            content: this.format(`import Foundation
import ${commonProductName}

public class HttpClient {
    private static let apiKeyHeader = "${apiKeyHeader}"
    private static let apiKeyUseBearer = ${apiKeyUseBearer ? 'true' : 'false'}

    private struct AnyEncodable: Encodable {
        private let encodeClosure: (Encoder) throws -> Void

        init(_ value: any Encodable) {
            self.encodeClosure = value.encode(to:)
        }

        func encode(to encoder: Encoder) throws {
            try encodeClosure(encoder)
        }
    }

    private let baseURL: String
    private let session: URLSession
    private let timeout: TimeInterval
    private var headers: [String: String]
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(baseURL: String, timeout: Int = 30000, headers: [String: String] = [:]) {
        self.baseURL = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        self.session = URLSession.shared
        self.timeout = TimeInterval(timeout) / 1000.0
        self.headers = headers
    }

    public convenience init(config: SdkConfig) {
        self.init(
            baseURL: config.baseUrl,
            timeout: config.timeout ?? 30000,
            headers: config.headers ?? [:]
        )
    }

    public func setApiKey(_ apiKey: String) {
        headers[Self.apiKeyHeader] = Self.apiKeyUseBearer ? "Bearer \\(apiKey)" : apiKey
        if Self.apiKeyHeader.lowercased() != "authorization" {
            headers.removeValue(forKey: "Authorization")
        }
        if Self.apiKeyHeader.lowercased() != "access-token" {
            headers.removeValue(forKey: "Access-Token")
        }
    }

    public func setAuthToken(_ token: String) {
        if Self.apiKeyHeader.lowercased() != "authorization" {
            headers.removeValue(forKey: Self.apiKeyHeader)
        }
        headers["Authorization"] = "Bearer \\(token)"
    }

    public func setAccessToken(_ token: String) {
        if Self.apiKeyHeader.lowercased() != "access-token" {
            headers.removeValue(forKey: Self.apiKeyHeader)
        }
        headers["Access-Token"] = token
    }

    public func setHeader(_ key: String, value: String) {
        headers[key] = value
    }

    private func buildURL(_ path: String, params: [String: Any]? = nil) throws -> URL {
        guard var urlComponents = URLComponents(string: baseURL + path) else {
            throw URLError(.badURL)
        }

        if let params = params, !params.isEmpty {
            urlComponents.queryItems = params.map { URLQueryItem(name: $0.key, value: "\\($0.value)") }
        }

        guard let url = urlComponents.url else {
            throw URLError(.badURL)
        }
        return url
    }

    private func applyHeaders(
        _ request: inout URLRequest,
        requestHeaders: [String: String]? = nil,
        contentType: String? = nil
    ) {
        if let contentType = contentType, !contentType.isEmpty {
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }
        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }
        if let requestHeaders = requestHeaders {
            for (key, value) in requestHeaders {
                request.setValue(value, forHTTPHeaderField: key)
            }
        }
    }

    private func appendMultipartField(
        name: String,
        value: Any,
        boundary: String,
        into data: inout Data
    ) {
        data.append("--\\(boundary)\\r\\n".data(using: .utf8)!)
        data.append("Content-Disposition: form-data; name=\\"\\(name)\\"\\r\\n\\r\\n".data(using: .utf8)!)
        data.append("\\(value)\\r\\n".data(using: .utf8)!)
    }

    private func buildMultipartBody(_ body: Any?, boundary: String) -> Data {
        var data = Data()

        if let fields = body as? [String: Any] {
            for (name, value) in fields {
                if let array = value as? [Any] {
                    for item in array {
                        appendMultipartField(name: name, value: item, boundary: boundary, into: &data)
                    }
                } else {
                    appendMultipartField(name: name, value: value, boundary: boundary, into: &data)
                }
            }
        } else if let body = body {
            appendMultipartField(name: "value", value: body, boundary: boundary, into: &data)
        }

        data.append("--\\(boundary)--\\r\\n".data(using: .utf8)!)
        return data
    }

    private func buildFormBody(_ body: Any?) -> Data {
        let items: [URLQueryItem]
        if let fields = body as? [String: Any] {
            items = fields.flatMap { key, value -> [URLQueryItem] in
                if let array = value as? [Any] {
                    return array.map { URLQueryItem(name: key, value: "\\($0)") }
                }
                return [URLQueryItem(name: key, value: "\\(value)")]
            }
        } else if let body = body {
            items = [URLQueryItem(name: "value", value: "\\(body)")]
        } else {
            items = []
        }

        var components = URLComponents()
        components.queryItems = items
        return Data((components.percentEncodedQuery ?? "").utf8)
    }

    private func createRequestBody(
        body: Any?,
        contentType: String?
    ) throws -> (bodyData: Data?, resolvedContentType: String?) {
        guard let body = body else {
            return (nil, nil)
        }

        let normalized = (contentType ?? "application/json").lowercased()
        if normalized.hasPrefix("multipart/form-data") {
            let boundary = "Boundary-\\(UUID().uuidString)"
            let data = buildMultipartBody(body, boundary: boundary)
            return (data, "multipart/form-data; boundary=\\(boundary)")
        }
        if normalized.hasPrefix("application/x-www-form-urlencoded") {
            return (buildFormBody(body), "application/x-www-form-urlencoded; charset=utf-8")
        }
        if let rawData = body as? Data {
            return (rawData, contentType)
        }
        if let text = body as? String {
            return (Data(text.utf8), contentType ?? "text/plain; charset=utf-8")
        }
        if JSONSerialization.isValidJSONObject(body) {
            return (try JSONSerialization.data(withJSONObject: body), "application/json")
        }
        if let encodableBody = body as? any Encodable {
            return (try encoder.encode(AnyEncodable(encodableBody)), "application/json")
        }
        return (Data("\\(body)".utf8), contentType ?? "text/plain; charset=utf-8")
    }

    private func parseResponse(_ data: Data, _ response: URLResponse) throws -> Any? {
        if let httpResp = response as? HTTPURLResponse, !(200...299).contains(httpResp.statusCode) {
            throw URLError(.badServerResponse)
        }

        if data.isEmpty {
            return nil
        }

        return try JSONSerialization.jsonObject(with: data)
    }

    private func parseResponse<T: Decodable>(_ data: Data, _ response: URLResponse, as type: T.Type) throws -> T? {
        if let httpResp = response as? HTTPURLResponse, !(200...299).contains(httpResp.statusCode) {
            throw URLError(.badServerResponse)
        }

        if data.isEmpty {
            return nil
        }

        return try decoder.decode(T.self, from: data)
    }

    public func get(
        _ path: String,
        params: [String: Any]? = nil,
        headers requestHeaders: [String: String]? = nil
    ) async throws -> Any? {
        var request = URLRequest(url: try buildURL(path, params: params))
        request.httpMethod = "GET"
        request.timeoutInterval = timeout
        applyHeaders(&request, requestHeaders: requestHeaders)

        let (data, response) = try await session.data(for: request)
        return try parseResponse(data, response)
    }

    public func get<T: Decodable>(
        _ path: String,
        params: [String: Any]? = nil,
        headers requestHeaders: [String: String]? = nil,
        responseType: T.Type
    ) async throws -> T? {
        var request = URLRequest(url: try buildURL(path, params: params))
        request.httpMethod = "GET"
        request.timeoutInterval = timeout
        applyHeaders(&request, requestHeaders: requestHeaders)

        let (data, response) = try await session.data(for: request)
        return try parseResponse(data, response, as: responseType)
    }

    public func post(
        _ path: String,
        body: Any? = nil,
        params: [String: Any]? = nil,
        headers requestHeaders: [String: String]? = nil,
        contentType: String? = nil
    ) async throws -> Any? {
        var request = URLRequest(url: try buildURL(path, params: params))
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        let requestBody = try createRequestBody(body: body, contentType: contentType)
        applyHeaders(&request, requestHeaders: requestHeaders, contentType: requestBody.resolvedContentType)
        request.httpBody = requestBody.bodyData

        let (data, response) = try await session.data(for: request)
        return try parseResponse(data, response)
    }

    public func post<T: Decodable>(
        _ path: String,
        body: Any? = nil,
        params: [String: Any]? = nil,
        headers requestHeaders: [String: String]? = nil,
        contentType: String? = nil,
        responseType: T.Type
    ) async throws -> T? {
        var request = URLRequest(url: try buildURL(path, params: params))
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        let requestBody = try createRequestBody(body: body, contentType: contentType)
        applyHeaders(&request, requestHeaders: requestHeaders, contentType: requestBody.resolvedContentType)
        request.httpBody = requestBody.bodyData

        let (data, response) = try await session.data(for: request)
        return try parseResponse(data, response, as: responseType)
    }

    public func put(
        _ path: String,
        body: Any? = nil,
        params: [String: Any]? = nil,
        headers requestHeaders: [String: String]? = nil,
        contentType: String? = nil
    ) async throws -> Any? {
        var request = URLRequest(url: try buildURL(path, params: params))
        request.httpMethod = "PUT"
        request.timeoutInterval = timeout
        let requestBody = try createRequestBody(body: body, contentType: contentType)
        applyHeaders(&request, requestHeaders: requestHeaders, contentType: requestBody.resolvedContentType)
        request.httpBody = requestBody.bodyData

        let (data, response) = try await session.data(for: request)
        return try parseResponse(data, response)
    }

    public func put<T: Decodable>(
        _ path: String,
        body: Any? = nil,
        params: [String: Any]? = nil,
        headers requestHeaders: [String: String]? = nil,
        contentType: String? = nil,
        responseType: T.Type
    ) async throws -> T? {
        var request = URLRequest(url: try buildURL(path, params: params))
        request.httpMethod = "PUT"
        request.timeoutInterval = timeout
        let requestBody = try createRequestBody(body: body, contentType: contentType)
        applyHeaders(&request, requestHeaders: requestHeaders, contentType: requestBody.resolvedContentType)
        request.httpBody = requestBody.bodyData

        let (data, response) = try await session.data(for: request)
        return try parseResponse(data, response, as: responseType)
    }

    public func delete(
        _ path: String,
        params: [String: Any]? = nil,
        headers requestHeaders: [String: String]? = nil
    ) async throws -> Any? {
        var request = URLRequest(url: try buildURL(path, params: params))
        request.httpMethod = "DELETE"
        request.timeoutInterval = timeout
        applyHeaders(&request, requestHeaders: requestHeaders)

        let (data, response) = try await session.data(for: request)
        return try parseResponse(data, response)
    }

    public func delete<T: Decodable>(
        _ path: String,
        params: [String: Any]? = nil,
        headers requestHeaders: [String: String]? = nil,
        responseType: T.Type
    ) async throws -> T? {
        var request = URLRequest(url: try buildURL(path, params: params))
        request.httpMethod = "DELETE"
        request.timeoutInterval = timeout
        applyHeaders(&request, requestHeaders: requestHeaders)

        let (data, response) = try await session.data(for: request)
        return try parseResponse(data, response, as: responseType)
    }

    public func patch(
        _ path: String,
        body: Any? = nil,
        params: [String: Any]? = nil,
        headers requestHeaders: [String: String]? = nil,
        contentType: String? = nil
    ) async throws -> Any? {
        var request = URLRequest(url: try buildURL(path, params: params))
        request.httpMethod = "PATCH"
        request.timeoutInterval = timeout
        let requestBody = try createRequestBody(body: body, contentType: contentType)
        applyHeaders(&request, requestHeaders: requestHeaders, contentType: requestBody.resolvedContentType)
        request.httpBody = requestBody.bodyData

        let (data, response) = try await session.data(for: request)
        return try parseResponse(data, response)
    }

    public func patch<T: Decodable>(
        _ path: String,
        body: Any? = nil,
        params: [String: Any]? = nil,
        headers requestHeaders: [String: String]? = nil,
        contentType: String? = nil,
        responseType: T.Type
    ) async throws -> T? {
        var request = URLRequest(url: try buildURL(path, params: params))
        request.httpMethod = "PATCH"
        request.timeoutInterval = timeout
        let requestBody = try createRequestBody(body: body, contentType: contentType)
        applyHeaders(&request, requestHeaders: requestHeaders, contentType: requestBody.resolvedContentType)
        request.httpBody = requestBody.bodyData

        let (data, response) = try await session.data(for: request)
        return try parseResponse(data, response, as: responseType)
    }
}
`),
            language: 'swift',
            description: 'HTTP client implementation',
        };
    }
    generateSdkClient(clientName, tags, resolvedTagNames, config, commonProductName) {
        const modules = tags.map(tag => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const propName = SWIFT_CONFIG.namingConventions.propertyName(resolvedTagName);
            const className = `${SWIFT_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            return `    public let ${propName}: ${className}`;
        }).join('\n');
        const inits = tags.map(tag => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const propName = SWIFT_CONFIG.namingConventions.propertyName(resolvedTagName);
            const className = `${SWIFT_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            return `        self.${propName} = ${className}(client: httpClient)`;
        }).join('\n');
        return {
            path: `Sources/${clientName}.swift`,
            content: this.format(`import Foundation
import ${commonProductName}

public class ${clientName} {
    private let httpClient: HttpClient
${modules}

    public init(baseURL: String) {
        self.httpClient = HttpClient(baseURL: baseURL)
${inits}
    }

    public init(config: SdkConfig) {
        self.httpClient = HttpClient(config: config)
${inits}
    }

    public func setApiKey(_ apiKey: String) -> ${clientName} {
        httpClient.setApiKey(apiKey)
        return self
    }

    public func setAuthToken(_ token: String) -> ${clientName} {
        httpClient.setAuthToken(token)
        return self
    }

    public func setAccessToken(_ token: String) -> ${clientName} {
        httpClient.setAccessToken(token)
        return self
    }

    public func setHeader(_ key: String, value: String) -> ${clientName} {
        httpClient.setHeader(key, value: value)
        return self
    }
}
`),
            language: 'swift',
            description: 'Main SDK class',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
