import { resolveSwiftCommonPackage } from '../../framework/common-package.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { resolveSwiftPackageTargetName, resolveSwiftTestTargetName } from './build-config-generator.js';
import { SwiftUsagePlanner, renderSwiftUsageSnippet, resolveSwiftExpectedRequestPath, } from './usage-planner.js';
export class TestGenerator {
    generate(ctx, config) {
        const planner = new SwiftUsagePlanner(ctx);
        const plan = planner.selectQuickStartPlan();
        if (!plan) {
            throw new Error('Swift generateTests requires at least one API operation to build a smoke test.');
        }
        const sdkTargetName = resolveSwiftPackageTargetName(config);
        return [{
                path: `Tests/${resolveSwiftTestTargetName(config)}/GeneratedSdkSmokeTests.swift`,
                content: this.generateSmokeTest(plan, config, sdkTargetName),
                language: 'swift',
                description: 'Generated SDK smoke test',
            }];
    }
    generateSmokeTest(plan, config, sdkTargetName) {
        const commonPkg = resolveSwiftCommonPackage(config);
        const clientName = resolveSdkClientName(config);
        const expectedPath = resolveSwiftExpectedRequestPath(plan.operation.path, config.apiPrefix);
        const setupAndCall = this.indent(renderSwiftUsageSnippet(plan, 'test', { assignResult: plan.hasReturnValue }), 8);
        const assertions = this.indent(this.buildAssertions(plan, expectedPath), 8);
        const responseTuple = this.indent(this.buildResponseTuple(plan), 12);
        return this.format(`import Foundation
import XCTest
import ${commonPkg.productName}
@testable import ${sdkTargetName}

final class GeneratedSdkSmokeTests: XCTestCase {
    func generatedSdkForwardsRequestMetadata() async throws {
        let encoder = JSONEncoder()
        var capturedPath = ""
        var capturedQuery = [String: String]()
        var capturedHeaders = [String: String]()
        var capturedBody = Data()
        var capturedContentType = ""

        MockURLProtocol.requestHandler = { request in
            capturedPath = request.url?.path ?? ""
            capturedQuery = Self.parseQuery(request.url)
            capturedHeaders = request.allHTTPHeaderFields ?? [:]
            capturedBody = request.httpBody ?? Data()
            capturedContentType = request.value(forHTTPHeaderField: "Content-Type") ?? ""
${responseTuple}
        }
        URLProtocol.registerClass(MockURLProtocol.self)
        defer {
            URLProtocol.unregisterClass(MockURLProtocol.self)
            MockURLProtocol.requestHandler = nil
        }

        let config = SdkConfig(baseUrl: "https://example.com")
        let client = ${clientName}(config: config)

${setupAndCall}

${assertions}
    }

    private static func parseQuery(_ url: URL?) -> [String: String] {
        guard let url, let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return [:]
        }
        var values = [String: String]()
        for item in components.queryItems ?? [] {
            values[item.name] = item.value ?? ""
        }
        return values
    }

    private func assertJSONEqual(_ expected: Data, _ actual: Data) throws {
        let expectedObject = try JSONSerialization.jsonObject(with: expected)
        let actualObject = try JSONSerialization.jsonObject(with: actual)
        let expectedCanonical = try JSONSerialization.data(withJSONObject: expectedObject, options: [.sortedKeys])
        let actualCanonical = try JSONSerialization.data(withJSONObject: actualObject, options: [.sortedKeys])
        XCTAssertEqual(expectedCanonical, actualCanonical)
    }

    private func encodeJSONBody(_ value: Any, encoder: JSONEncoder) throws -> Data {
        if JSONSerialization.isValidJSONObject(value) {
            return try JSONSerialization.data(withJSONObject: value)
        }
        if let encodableValue = value as? any Encodable {
            return try encoder.encode(AnyEncodable(encodableValue))
        }
        throw NSError(domain: "GeneratedSdkSmokeTests", code: 1, userInfo: nil)
    }

    private struct AnyEncodable: Encodable {
        private let encodeClosure: (Encoder) throws -> Void

        init(_ value: any Encodable) {
            self.encodeClosure = value.encode(to:)
        }

        func encode(to encoder: Encoder) throws {
            try encodeClosure(encoder)
        }
    }

    private final class MockURLProtocol: URLProtocol {
        static var requestHandler: ((URLRequest) throws -> (statusCode: Int, headers: [String: String], data: Data?))?

        override class func canInit(with request: URLRequest) -> Bool {
            guard let scheme = request.url?.scheme?.lowercased() else {
                return false
            }
            return scheme == "http" || scheme == "https"
        }

        override class func canonicalRequest(for request: URLRequest) -> URLRequest {
            request
        }

        override func startLoading() {
            guard let handler = Self.requestHandler else {
                client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
                return
            }

            do {
                let result = try handler(request)
                let response = HTTPURLResponse(
                    url: request.url ?? URL(string: "https://example.com")!,
                    statusCode: result.statusCode,
                    httpVersion: nil,
                    headerFields: result.headers
                )!
                client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                if let data = result.data {
                    client?.urlProtocol(self, didLoad: data)
                }
                client?.urlProtocolDidFinishLoading(self)
            } catch {
                client?.urlProtocol(self, didFailWithError: error)
            }
        }

        override func stopLoading() {}
    }
}
`);
    }
    buildResponseTuple(plan) {
        if (plan.responseBody) {
            return [
                `let data = ${this.quote(plan.responseBody)}.data(using: .utf8)!`,
                `return (${plan.responseStatusCode}, ["Content-Type": "application/json"], data)`,
            ].join('\n');
        }
        return 'return (204, [:], nil)';
    }
    buildAssertions(plan, expectedPath) {
        const lines = [`XCTAssertEqual(${this.quote(expectedPath)}, capturedPath)`];
        for (const expectation of plan.queryExpectations) {
            lines.push(`XCTAssertEqual(${this.quote(expectation.expected)}, capturedQuery[${this.quote(expectation.name)}])`);
        }
        for (const expectation of plan.headerExpectations) {
            lines.push(`XCTAssertEqual(${this.quote(expectation.expected)}, capturedHeaders[${this.quote(expectation.name)}])`);
        }
        if (plan.bodyAssertion) {
            if (plan.bodyAssertion.contentTypeMatch === 'prefix') {
                lines.push(`XCTAssertTrue(capturedContentType.hasPrefix(${this.quote(plan.bodyAssertion.contentType)}))`);
            }
            else {
                lines.push(`XCTAssertEqual(${this.quote(plan.bodyAssertion.contentType)}, capturedContentType)`);
            }
            if (plan.bodyAssertion.kind === 'json' && plan.bodyAssertion.encodedBodyExpression) {
                lines.push(`try assertJSONEqual(${plan.bodyAssertion.encodedBodyExpression}, capturedBody)`);
            }
            if (plan.bodyAssertion.kind === 'non-empty') {
                lines.push('XCTAssertFalse(capturedBody.isEmpty)');
            }
        }
        lines.push(...plan.responseAssertions);
        return lines.join('\n');
    }
    indent(content, spaces) {
        const prefix = ' '.repeat(Math.max(0, spaces));
        return content.split('\n').map((line) => (line ? `${prefix}${line}` : line)).join('\n');
    }
    quote(value) {
        return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    format(content) {
        return content.trim() + '\n';
    }
}
