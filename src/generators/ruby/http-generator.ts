import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSimplifiedTagNames } from '../../framework/naming.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { getRubyModuleSegments, getRubyRootRequirePath, RUBY_CONFIG } from './config.js';

export class HttpClientGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const clientName = resolveSdkClientName(config);
    const tags = Object.keys(ctx.apiGroups);
    const schemas = Object.keys(ctx.schemas);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
    const apiKeyHeader = (ctx.auth.apiKeyHeader || 'Authorization').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const apiKeyUseBearer = ctx.auth.apiKeyAsBearer;

    return [
      this.generateVersionFile(config),
      this.generateSdkConfig(config),
      this.generateHttpClient(config, apiKeyHeader, apiKeyUseBearer),
      this.generateSdkClient(clientName, tags, resolvedTagNames, config),
      this.generateRootRequireFile(config, schemas, tags, resolvedTagNames),
    ];
  }

  private generateVersionFile(config: GeneratorConfig): GeneratedFile {
    const moduleSegments = getRubyModuleSegments(config);
    const pathRoot = moduleSegments.map((segment) => toSnakeCase(segment)).join('/');

    return {
      path: `lib/${pathRoot}/version.rb`,
      content: this.format(wrapRubyModules(moduleSegments, `VERSION = '${escapeRubyString(config.version)}'`)),
      language: 'ruby',
      description: 'Ruby gem version',
    };
  }

  private generateSdkConfig(config: GeneratorConfig): GeneratedFile {
    const moduleSegments = getRubyModuleSegments(config);
    const pathRoot = moduleSegments.map((segment) => toSnakeCase(segment)).join('/');

    return {
      path: `lib/${pathRoot}/sdk_config.rb`,
      content: this.format(wrapRubyModules(moduleSegments, `class SdkConfig
  attr_accessor :base_url, :timeout, :headers, :connection_options

  def initialize(base_url: '${escapeRubyString(config.baseUrl)}', timeout: 30, headers: {}, connection_options: {})
    @base_url = base_url
    @timeout = timeout
    @headers = headers || {}
    @connection_options = connection_options || {}
  end
end`)),
      language: 'ruby',
      description: 'SDK configuration',
    };
  }

  private generateHttpClient(
    config: GeneratorConfig,
    apiKeyHeader: string,
    apiKeyUseBearer: boolean,
  ): GeneratedFile {
    const moduleSegments = [...getRubyModuleSegments(config), 'Http'];
    const pathRoot = getRubyModuleSegments(config).map((segment) => toSnakeCase(segment)).join('/');

    return {
      path: `lib/${pathRoot}/http/client.rb`,
      content: this.format(wrapRubyModules(moduleSegments, `class Client
  attr_reader :connection, :headers

  def initialize(config)
    @config = config
    @headers = (config.headers || {}).dup
    @api_key = nil
    @auth_token = nil
    @access_token = nil
    connection_options = normalize_connection_options(config.connection_options)
    test_stubs = connection_options.delete(:test_stubs)
    adapter = connection_options.delete(:adapter)
    adapter_options = connection_options.delete(:adapter_options)
    @connection = Faraday.new({ url: config.base_url }.merge(connection_options)) do |faraday|
      faraday.options.timeout = config.timeout
      if test_stubs
        faraday.adapter :test, test_stubs
      elsif adapter_options
        faraday.adapter adapter || Faraday.default_adapter, adapter_options
      else
        faraday.adapter adapter || Faraday.default_adapter
      end
    end
  end

  def set_api_key(api_key)
    @api_key = api_key
    @auth_token = nil
    @access_token = nil
    self
  end

  def set_auth_token(token)
    @auth_token = token
    @api_key = nil unless '${apiKeyHeader}'.downcase == 'authorization'
    self
  end

  def set_access_token(token)
    @access_token = token
    @api_key = nil unless '${apiKeyHeader}'.downcase == 'access-token'
    self
  end

  def set_header(key, value)
    @headers[key] = value
    self
  end

  def request(method, path, query: {}, headers: {}, json: nil, form: nil, multipart: nil)
    response = @connection.run_request(method.to_sym, path, nil, build_headers(headers)) do |request|
      request.params.update(query) unless query.nil? || query.empty?

      if multipart
        request.body = normalize_multipart(multipart)
        request.headers['Content-Type'] = 'multipart/form-data'
      elsif form
        request.body = form
        request.headers['Content-Type'] = 'application/x-www-form-urlencoded'
      elsif !json.nil?
        request.body = JSON.generate(json)
        request.headers['Content-Type'] = 'application/json'
      end
    end

    parse_response(response)
  rescue Faraday::Error => e
    raise RuntimeError, "SDK request failed: #{e.message}"
  end

  private

  def build_headers(request_headers)
    auth_headers = {}
    auth_headers['${apiKeyHeader}'] = ${apiKeyUseBearer ? "format_bearer(@api_key)" : '@api_key'} if @api_key && !@api_key.empty?
    auth_headers['Authorization'] = format_bearer(@auth_token) if @auth_token && !@auth_token.empty?
    auth_headers['Access-Token'] = @access_token if @access_token && !@access_token.empty?
    auth_headers.merge(@headers).merge(request_headers || {})
  end

  def parse_response(response)
    body = response.body.to_s
    return nil if body.empty?

    JSON.parse(body)
  rescue JSON::ParserError
    body
  end

  def normalize_multipart(payload)
    return [] unless payload.is_a?(Hash)

    payload.map do |name, value|
      {
        name: name.to_s,
        content_type: value.is_a?(Hash) || value.is_a?(Array) ? 'application/json' : nil,
        value: value.is_a?(Hash) || value.is_a?(Array) ? JSON.generate(value) : value,
      }.compact
    end
  end

  def format_bearer(value)
    "Bearer #{value}"
  end

  def normalize_connection_options(options)
    return {} unless options.is_a?(Hash)

    options.each_with_object({}) do |(key, value), normalized|
      normalized[key.respond_to?(:to_sym) ? key.to_sym : key] = value
    end
  end
end`, [
        "require 'faraday'",
        "require 'json'",
      ])),
      language: 'ruby',
      description: 'HTTP client wrapper',
    };
  }

  private generateSdkClient(
    clientName: string,
    tags: string[],
    resolvedTagNames: Map<string, string>,
    config: GeneratorConfig
  ): GeneratedFile {
    const moduleSegments = getRubyModuleSegments(config);
    const pathRoot = moduleSegments.map((segment) => toSnakeCase(segment)).join('/');
    const apiInitializers = tags.map((tag) => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const propertyName = RUBY_CONFIG.namingConventions.propertyName(resolvedTagName);
      const className = `${RUBY_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
      return `    @${propertyName} = Api::${className}.new(@http)`;
    }).join('\n');
    const attrReaders = tags.length > 0
      ? `  attr_reader :http, ${tags.map((tag) => `:${RUBY_CONFIG.namingConventions.propertyName(resolvedTagNames.get(tag) || tag)}`).join(', ')}`
      : '  attr_reader :http';

    return {
      path: `lib/${pathRoot}/client.rb`,
      content: this.format(wrapRubyModules(moduleSegments, `class ${clientName}
${attrReaders}
  def initialize(config)
    @http = Http::Client.new(config)
${apiInitializers}
  end

  def set_api_key(api_key)
    @http.set_api_key(api_key)
    self
  end

  def set_auth_token(token)
    @http.set_auth_token(token)
    self
  end

  def set_access_token(token)
    @http.set_access_token(token)
    self
  end

  def set_header(key, value)
    @http.set_header(key, value)
    self
  end
end`)),
      language: 'ruby',
      description: 'Main SDK client',
    };
  }

  private generateRootRequireFile(
    config: GeneratorConfig,
    schemas: string[],
    tags: string[],
    resolvedTagNames: Map<string, string>
  ): GeneratedFile {
    const moduleSegments = getRubyModuleSegments(config);
    const rootRequirePath = getRubyRootRequirePath(config);
    const requires = [
      `require_relative '${rootRequirePath}/version'`,
      `require_relative '${rootRequirePath}/sdk_config'`,
      ...schemas.map((schemaName) => `require_relative '${rootRequirePath}/models/${RUBY_CONFIG.namingConventions.fileName(schemaName)}'`),
      `require_relative '${rootRequirePath}/http/client'`,
      `require_relative '${rootRequirePath}/api/base_api'`,
      ...tags.map((tag) => `require_relative '${rootRequirePath}/api/${RUBY_CONFIG.namingConventions.fileName(resolvedTagNames.get(tag) || tag)}'`),
      `require_relative '${rootRequirePath}/client'`,
    ];
    const clientName = resolveSdkClientName(config);

    return {
      path: `lib/${rootRequirePath}.rb`,
      content: this.format(`${requires.join('\n')}\n\n${wrapRubyModules(moduleSegments, `def self.create_client(config = SdkConfig.new)
  ${clientName}.new(config)
end`)}`),
      language: 'ruby',
      description: 'Ruby root require file',
    };
  }

  private format(content: string): string {
    return `${content.trim()}\n`;
  }
}

function wrapRubyModules(segments: string[], body: string, requires: string[] = []): string {
  const requireBlock = requires.length > 0 ? `${requires.join('\n')}\n\n` : '';
  const opening = segments.map((segment, index) => `${'  '.repeat(index)}module ${segment}`).join('\n');
  const closing = segments.slice().reverse().map((_, index) => `${'  '.repeat(segments.length - index - 1)}end`).join('\n');
  const indentedBody = body
    .split('\n')
    .map((line) => `${'  '.repeat(segments.length)}${line}`)
    .join('\n');
  return `${requireBlock}${opening}\n${indentedBody}\n${closing}`;
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function escapeRubyString(value: string): string {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
