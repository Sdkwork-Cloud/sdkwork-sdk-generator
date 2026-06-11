import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import { normalizeOperationId, resolveScopedMethodNames, stripTagPrefixFromOperationId, } from '../../framework/naming.js';
import { resolveOpenAIStyleMethodNames, resolveSdkTagNames, selectCanonicalOpenAIStyleOperations } from '../../framework/openai-surface.js';
import { supportsRequestBodyByDefault, toHttpMethodLiteral } from '../../framework/http-methods.js';
import { getSchemaReferenceName, resolveMediaTypeSchema } from '../../framework/schema.js';
import { requiresExplicitOpenApiQuerySerialization, resolveOpenApiParameterSerialization, } from '../../framework/parameter-serialization.js';
import { extractEventStreamResponseInfo } from '../../framework/responses.js';
import { operationSkipsSdkworkAuth } from '../../framework/sdkwork-v3-auth.js';
import { RUBY_CONFIG, getRubyModuleSegments } from './config.js';
export class ApiGenerator {
    generate(ctx, config) {
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSdkTagNames(tags, config);
        const files = [this.generateBaseApi(config)];
        for (const tag of tags) {
            const group = ctx.apiGroups[tag];
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            files.push(this.generateApiFile(tag, resolvedTagName, group.operations, config));
        }
        return files;
    }
    generateBaseApi(config) {
        return {
            path: `lib/${getRubyModuleSegments(config).map((segment) => toSnakeCase(segment)).join('/')}/api/base_api.rb`,
            content: this.format(wrapRubyModules([...getRubyModuleSegments(config), 'Api'], `class BaseApi
  def initialize(client)
    @client = client
  end

  private

  def interpolate_path(path, path_params = {})
    path_params.each do |name, value|
      path = path.gsub("{#{name}}", CGI.escape(value.to_s))
    end

    path
  end

  def serialize_path_parameter(value, spec)
    return '' if value.nil?

    style = spec.style.to_s.empty? ? 'simple' : spec.style
    return serialize_path_array(spec.name, value, style, spec.explode) if value.is_a?(Array)
    return serialize_path_object(spec.name, value, style, spec.explode) if value.is_a?(Hash)

    "#{path_primitive_prefix(spec.name, style)}#{CGI.escape(value.to_s)}"
  end

  def serialize_path_array(name, values, style, explode)
    serialized = values.compact.map { |item| CGI.escape(item.to_s) }
    return path_prefix(name, style) if serialized.empty?
    if style == 'matrix'
      return serialized.map { |item| ";#{name}=#{item}" }.join if explode

      return ";#{name}=#{serialized.join(',')}"
    end

    "#{path_prefix(name, style)}#{serialized.join(explode ? '.' : ',')}"
  end

  def serialize_path_object(name, values, style, explode)
    entries = []
    exploded = []
    values.each do |key, value|
      next if value.nil?

      escaped_key = CGI.escape(key.to_s)
      escaped_value = CGI.escape(value.to_s)
      if explode
        exploded << (style == 'matrix' ? ";#{escaped_key}=#{escaped_value}" : "#{escaped_key}=#{escaped_value}")
      else
        entries << escaped_key
        entries << escaped_value
      end
    end

    if style == 'matrix'
      return exploded.join if explode

      return ";#{name}=#{entries.join(',')}"
    end

    return "#{path_prefix(name, style)}#{exploded.join(style == 'label' ? '.' : ',')}" if explode

    "#{path_prefix(name, style)}#{entries.join(',')}"
  end

  def path_prefix(name, style)
    return '.' if style == 'label'
    return ";#{name}" if style == 'matrix'

    ''
  end

  def path_primitive_prefix(name, style)
    style == 'matrix' ? ";#{name}=" : path_prefix(name, style)
  end

  def append_query_string(path, raw_query_string)
    query = raw_query_string.to_s.sub(/^\?+/, '')
    return path if query.empty?

    path.include?('?') ? "#{path}&#{query}" : "#{path}?#{query}"
  end

  def build_query_string(parameters)
    parameters.flat_map { |parameter| serialize_query_parameter(parameter) }.compact.join('&')
  end

  def serialize_query_parameter(parameter)
    return [] if parameter.value.nil?

    if parameter.content_type && !parameter.content_type.empty?
      return ["#{CGI.escape(parameter.name)}=#{encode_query_value(JSON.generate(parameter.value), parameter.allow_reserved)}"]
    end

    style = parameter.style.to_s.empty? ? 'form' : parameter.style
    value = parameter.value
    return serialize_deep_object_parameter(parameter.name, value, parameter.allow_reserved) if style == 'deepObject' && value.is_a?(Hash)
    return serialize_array_parameter(parameter.name, value, style, parameter.explode, parameter.allow_reserved) if value.is_a?(Array)
    return serialize_object_parameter(parameter.name, value, style, parameter.explode, parameter.allow_reserved) if value.is_a?(Hash)

    ["#{CGI.escape(parameter.name)}=#{encode_query_value(value.to_s, parameter.allow_reserved)}"]
  end

  def serialize_array_parameter(name, values, style, explode, allow_reserved)
    serialized = values.compact.map(&:to_s)
    return [] if serialized.empty?
    return serialized.map { |item| "#{CGI.escape(name)}=#{encode_query_value(item, allow_reserved)}" } if style == 'form' && explode

    ["#{CGI.escape(name)}=#{encode_query_value(serialized.join(','), allow_reserved)}"]
  end

  def serialize_object_parameter(name, values, style, explode, allow_reserved)
    serialized = []
    pairs = []
    values.each do |key, value|
      next if value.nil?
      if style == 'form' && explode
        pairs << "#{CGI.escape(key.to_s)}=#{encode_query_value(value.to_s, allow_reserved)}"
      else
        serialized << key.to_s
        serialized << value.to_s
      end
    end
    return pairs if style == 'form' && explode
    return [] if serialized.empty?

    ["#{CGI.escape(name)}=#{encode_query_value(serialized.join(','), allow_reserved)}"]
  end

  def serialize_deep_object_parameter(name, values, allow_reserved)
    values.filter_map do |key, value|
      next if value.nil?

      "#{CGI.escape("#{name}[#{key}]")}=#{encode_query_value(value.to_s, allow_reserved)}"
    end
  end

  def encode_query_value(value, allow_reserved)
    encoded = CGI.escape(value)
    return encoded unless allow_reserved

    {
      '%3A' => ':', '%2F' => '/', '%3F' => '?', '%23' => '#',
      '%5B' => '[', '%5D' => ']', '%40' => '@', '%21' => '!',
      '%24' => '$', '%26' => '&', '%27' => "'", '%28' => '(',
      '%29' => ')', '%2A' => '*', '%2B' => '+', '%2C' => ',',
      '%3B' => ';', '%3D' => '='
    }.each { |escaped, reserved| encoded = encoded.gsub(escaped, reserved) }
    encoded
  end
end

QueryParameterSpec = Struct.new(:name, :value, :style, :explode, :allow_reserved, :content_type, keyword_init: false)
PathParameterSpec = Struct.new(:name, :style, :explode, keyword_init: false)
HeaderParameterSpec = Struct.new(:value, :style, :explode, :content_type, keyword_init: false)`, ['cgi', 'json'])),
            language: 'ruby',
            description: 'Base API helpers',
        };
    }
    generateApiFile(tag, resolvedTagName, operations, config) {
        operations = selectCanonicalOpenAIStyleOperations(tag, operations, config);
        const moduleSegments = [...getRubyModuleSegments(config), 'Api'];
        const className = `${RUBY_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
        const fileName = RUBY_CONFIG.namingConventions.fileName(resolvedTagName);
        const scopedMethodNames = resolveOpenAIStyleMethodNames(tag, operations, config, RUBY_CONFIG, 'snake')
            || resolveScopedMethodNames(operations, (op) => this.generateOperationId(op.method, op.path, op, tag));
        const methodNames = new Map();
        const referencedModels = new Set();
        for (const op of operations) {
            const scopedName = scopedMethodNames.get(op) || 'operation';
            methodNames.set(op, RUBY_CONFIG.namingConventions.methodName(scopedName));
            this.collectOperationModels(op, referencedModels);
        }
        const requires = [
            "require_relative 'base_api'",
            ...Array.from(referencedModels)
                .sort((left, right) => left.localeCompare(right))
                .map((modelName) => `require_relative '../models/${RUBY_CONFIG.namingConventions.fileName(modelName)}'`),
        ];
        const methods = operations.map((op) => this.generateMethod(op, config, methodNames.get(op) || 'operation')).join('\n\n');
        const needsRequestHeaderHelpers = operations.some((op) => {
            const allParameters = op.allParameters || op.parameters || [];
            return allParameters.some((param) => param?.in === 'header' || param?.in === 'cookie');
        });
        return {
            path: `lib/${getRubyModuleSegments(config).map((segment) => toSnakeCase(segment)).join('/')}/api/${fileName}.rb`,
            content: this.format(wrapRubyModules(moduleSegments, `class ${className} < BaseApi
${methods}
${needsRequestHeaderHelpers ? `\n${this.generateRequestHeaderHelpers()}` : ''}
end`, requires)),
            language: 'ruby',
            description: `${tag} API module`,
        };
    }
    generateMethod(op, config, methodName) {
        const rawPathParams = this.extractPathParams(op.path);
        const allParameters = op.allParameters || op.parameters || [];
        const queryParams = allParameters.filter((param) => param?.in === 'query');
        const queryStringParams = allParameters.filter((param) => param?.in === 'querystring');
        const headerParams = allParameters.filter((param) => param?.in === 'header');
        const cookieParams = allParameters.filter((param) => param?.in === 'cookie');
        const pathOpenApiParams = allParameters.filter((param) => param?.in === 'path');
        const hasQuery = queryParams.length > 0;
        const hasRawQueryString = queryStringParams.length > 0;
        const hasHeaders = headerParams.length > 0 || cookieParams.length > 0;
        const method = String(op.method || '').toLowerCase();
        const httpMethod = String(op.httpMethod || op.method || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const requestBodyInfo = supportsRequestBodyByDefault(method) ? this.extractRequestBodyInfo(op) : undefined;
        const hasBody = Boolean(requestBodyInfo);
        const requestBodySchema = requestBodyInfo?.schema;
        const requestBodyMediaType = (requestBodyInfo?.mediaType || '').toLowerCase();
        const eventStreamInfo = extractEventStreamResponseInfo(op);
        const skipAuth = operationSkipsSdkworkAuth(op);
        const responseSchema = eventStreamInfo?.schema ?? this.extractResponseSchema(op);
        const hasExplicitQuerySerialization = queryParams.some((param) => requiresExplicitOpenApiQuerySerialization(param));
        const pathParamNames = createUniqueIdentifierMap(rawPathParams, (value) => RUBY_CONFIG.namingConventions.propertyName(value), [
            hasBody ? 'body' : '',
            hasQuery ? 'params' : '',
            hasRawQueryString ? 'raw_query_string' : '',
            hasHeaders ? 'request_headers' : '',
            'path',
            hasBody ? 'payload' : '',
        ]);
        const pathParams = rawPathParams.map((rawName) => {
            const parameter = pathOpenApiParams.find((candidate) => candidate?.name === rawName);
            const serialization = resolveOpenApiParameterSerialization(parameter || { name: rawName, in: 'path' });
            return {
                rawName,
                safeName: pathParamNames.get(rawName) || rawName,
                style: serialization.style,
                explode: serialization.explode,
            };
        });
        const parameterReservedNames = [
            ...pathParams.map((param) => param.safeName),
            hasBody ? 'body' : '',
            hasQuery ? 'params' : '',
            hasRawQueryString ? 'raw_query_string' : '',
            hasHeaders ? 'request_headers' : '',
            'path',
            hasBody ? 'payload' : '',
        ];
        const queryBindings = hasExplicitQuerySerialization
            ? this.createQueryParameterBindings(queryParams, parameterReservedNames)
            : [];
        const headerBindings = this.createHeaderParameterBindings(headerParams, [
            ...parameterReservedNames,
            ...queryBindings.map((binding) => binding.safeName),
        ]);
        const cookieBindings = this.createHeaderParameterBindings(cookieParams, [
            ...parameterReservedNames,
            ...queryBindings.map((binding) => binding.safeName),
            ...headerBindings.map((binding) => binding.safeName),
        ]);
        const requiredQueryBindings = queryBindings.filter((binding) => binding.required);
        const optionalQueryBindings = queryBindings.filter((binding) => !binding.required);
        const requiredHeaderBindings = [...headerBindings, ...cookieBindings].filter((binding) => binding.required);
        const optionalHeaderBindings = [...headerBindings, ...cookieBindings].filter((binding) => !binding.required);
        const params = pathParams.map((param) => param.safeName);
        params.push(...requiredQueryBindings.map((binding) => binding.safeName));
        params.push(...requiredHeaderBindings.map((binding) => binding.safeName));
        if (hasBody) {
            params.push('body: nil');
        }
        if (hasRawQueryString) {
            params.push('raw_query_string:');
        }
        if (hasQuery && !hasExplicitQuerySerialization) {
            params.push('params: {}');
        }
        params.push(...optionalQueryBindings.map((binding) => `${binding.safeName}: nil`));
        params.push(...optionalHeaderBindings.map((binding) => `${binding.safeName}: nil`));
        const normalizedPath = this.normalizeOperationPath(op.path, config.apiPrefix);
        const requestPath = this.withApiPrefix(config.apiPrefix, normalizedPath);
        const pathLine = pathParams.length > 0
            ? `      path = interpolate_path('${escapeRubyString(requestPath)}', ${pathParams.map((param) => `${formatRubyPathKey(param.rawName)}: serialize_path_parameter(${param.safeName}, PathParameterSpec.new('${escapeRubyString(param.rawName)}', '${escapeRubyString(param.style)}', ${param.explode ? 'true' : 'false'}))`).join(', ')})`
            : `      path = '${escapeRubyString(requestPath)}'`;
        const rawQueryStringLine = hasRawQueryString
            ? '      path = append_query_string(path, raw_query_string)'
            : '';
        const queryLine = hasExplicitQuerySerialization
            ? `      query = build_query_string([
${this.renderQueryParameterSpecs(queryBindings, 8)}
      ])
      path = append_query_string(path, query)`
            : '';
        const payloadLine = hasBody
            ? `      payload = ${this.serializeRequestBodyExpression(requestBodySchema, 'body')}`
            : '';
        const requestHeaderLine = hasHeaders
            ? `      request_headers = build_request_headers(
${this.renderHeaderParameterHash(headerBindings, 8)},
${this.renderHeaderParameterHash(cookieBindings, 8)}
      )`
            : '';
        const optionLines = [];
        if (skipAuth) {
            optionLines.push('      options[:skip_auth] = true');
        }
        if (hasQuery && !hasExplicitQuerySerialization) {
            optionLines.push('      options[:query] = params unless params.nil? || params.empty?');
        }
        if (hasHeaders) {
            optionLines.push('      options[:headers] = request_headers unless request_headers.empty?');
        }
        if (hasBody) {
            if (requestBodyMediaType === 'multipart/form-data') {
                optionLines.push('      options[:multipart] = payload unless payload.nil?');
            }
            else if (requestBodyMediaType === 'application/x-www-form-urlencoded') {
                optionLines.push('      options[:form] = payload unless payload.nil?');
            }
            else {
                optionLines.push('      options[:json] = payload unless payload.nil?');
            }
        }
        const requestLine = eventStreamInfo
            ? `      @client.stream(:${toHttpMethodLiteral(httpMethod).toLowerCase()}, path, **options).map do |event|\n        ${this.deserializeResponseExpression(responseSchema, 'event')}\n      end`
            : this.isVoidResponse(op)
                ? `      @client.request('${toHttpMethodLiteral(httpMethod)}', path, **options)\n      nil`
                : `      result = @client.request('${toHttpMethodLiteral(httpMethod)}', path, **options)\n      ${this.deserializeResponseExpression(responseSchema, 'result')}`;
        const comment = op.summary ? `    # ${sanitizeComment(op.summary)}\n` : '';
        return `${comment}    def ${methodName}(${params.join(', ')})
${pathLine}
${rawQueryStringLine ? `${rawQueryStringLine}\n` : ''}${queryLine ? `${queryLine}\n` : ''}${hasBody ? `${payloadLine}\n` : ''}${requestHeaderLine ? `${requestHeaderLine}\n` : ''}      options = {}
${optionLines.join('\n')}
${requestLine}
    end`;
    }
    createNamedParameterBindings(parameters, reservedNames) {
        const keys = parameters.map((parameter, index) => `${parameter?.in || 'parameter'}:${parameter?.name || 'value'}:${index}`);
        const rawNameByKey = new Map(keys.map((key, index) => [key, String(parameters[index]?.name || `value${index + 1}`)]));
        const safeNameByKey = createUniqueIdentifierMap(keys, (key) => RUBY_CONFIG.namingConventions.propertyName(rawNameByKey.get(key) || 'value'), reservedNames);
        return parameters.map((parameter, index) => {
            const key = keys[index];
            return {
                parameter,
                safeName: safeNameByKey.get(key) || `value_${index + 1}`,
                required: Boolean(parameter?.required),
            };
        });
    }
    createQueryParameterBindings(parameters, reservedNames) {
        return this.createNamedParameterBindings(parameters, reservedNames).map((binding) => {
            const serialization = resolveOpenApiParameterSerialization(binding.parameter);
            return {
                ...binding,
                style: serialization.style,
                explode: serialization.explode,
                allowReserved: serialization.allowReserved,
                contentType: serialization.contentType,
            };
        });
    }
    createHeaderParameterBindings(parameters, reservedNames) {
        return this.createNamedParameterBindings(parameters, reservedNames).map((binding) => {
            const serialization = resolveOpenApiParameterSerialization(binding.parameter);
            return {
                ...binding,
                style: serialization.style,
                explode: serialization.explode,
                contentType: serialization.contentType,
            };
        });
    }
    renderNamedParameterHash(bindings, indentation) {
        const indent = ' '.repeat(indentation);
        if (bindings.length === 0) {
            return `${indent}{}`;
        }
        const lines = bindings.map((binding) => {
            return `${indent}  '${escapeRubyString(String(binding.parameter?.name || binding.safeName))}' => ${binding.safeName},`;
        });
        return [`${indent}{`, ...lines, `${indent}}`].join('\n');
    }
    renderHeaderParameterHash(bindings, indentation) {
        const indent = ' '.repeat(indentation);
        if (bindings.length === 0) {
            return `${indent}{}`;
        }
        const lines = bindings.map((binding) => {
            return `${indent}  '${escapeRubyString(String(binding.parameter?.name || binding.safeName))}' => HeaderParameterSpec.new(${binding.safeName}, '${escapeRubyString(binding.style)}', ${binding.explode ? 'true' : 'false'}, ${binding.contentType ? `'${escapeRubyString(binding.contentType)}'` : 'nil'}),`;
        });
        return [`${indent}{`, ...lines, `${indent}}`].join('\n');
    }
    renderQueryParameterSpecs(bindings, indentation) {
        const indent = ' '.repeat(indentation);
        return bindings.map((binding) => {
            return `${indent}QueryParameterSpec.new(${[
                `'${escapeRubyString(String(binding.parameter?.name || binding.safeName))}'`,
                binding.safeName,
                `'${escapeRubyString(binding.style)}'`,
                binding.explode ? 'true' : 'false',
                binding.allowReserved ? 'true' : 'false',
                binding.contentType ? `'${escapeRubyString(binding.contentType)}'` : 'nil',
            ].join(', ')}),`;
        }).join('\n');
    }
    serializeRequestBodyExpression(schema, bodyExpr) {
        if (!schema || typeof schema !== 'object') {
            return bodyExpr;
        }
        if (schema.$ref) {
            return `${bodyExpr}.respond_to?(:to_hash) ? ${bodyExpr}.to_hash : ${bodyExpr}`;
        }
        if (Array.isArray(schema.prefixItems)) {
            return `${bodyExpr}.is_a?(Array) ? ${bodyExpr}.map { |item| item } : ${bodyExpr}`;
        }
        if (schema.items && typeof schema.items === 'object') {
            const itemExpr = this.serializeArrayItemExpression(schema.items, 'item');
            return `${bodyExpr}.is_a?(Array) ? ${bodyExpr}.map { |item| ${itemExpr} } : ${bodyExpr}`;
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const itemExpr = this.serializeArrayItemExpression(schema.additionalProperties, 'item');
            return `${bodyExpr}.is_a?(Hash) ? ${bodyExpr}.transform_values { |item| ${itemExpr} } : ${bodyExpr}`;
        }
        return bodyExpr;
    }
    serializeArrayItemExpression(schema, itemExpr) {
        if (schema?.$ref) {
            return `${itemExpr}.respond_to?(:to_hash) ? ${itemExpr}.to_hash : ${itemExpr}`;
        }
        if (Array.isArray(schema?.prefixItems)) {
            return `${itemExpr}.is_a?(Array) ? ${itemExpr}.map { |nested_item| nested_item } : []`;
        }
        if (schema?.items && typeof schema.items === 'object') {
            const nestedExpr = this.serializeArrayItemExpression(schema.items, 'nested_item');
            return `${itemExpr}.is_a?(Array) ? ${itemExpr}.map { |nested_item| ${nestedExpr} } : []`;
        }
        if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
            const nestedExpr = this.serializeArrayItemExpression(schema.additionalProperties, 'nested_item');
            return `${itemExpr}.is_a?(Hash) ? ${itemExpr}.transform_values { |nested_item| ${nestedExpr} } : {}`;
        }
        return itemExpr;
    }
    deserializeResponseExpression(schema, resultExpr) {
        if (!schema || typeof schema !== 'object') {
            return resultExpr;
        }
        if (schema.$ref) {
            const modelName = RUBY_CONFIG.namingConventions.modelName(getSchemaReferenceName(schema.$ref) || 'Model');
            return `${resultExpr}.is_a?(Hash) ? Models::${modelName}.from_hash(${resultExpr}) : nil`;
        }
        if (Array.isArray(schema.prefixItems)) {
            return `${resultExpr}.is_a?(Array) ? ${resultExpr}.map { |item| item } : []`;
        }
        if (schema.items && typeof schema.items === 'object') {
            const itemExpr = this.deserializeArrayItemExpression(schema.items, 'item');
            return `${resultExpr}.is_a?(Array) ? ${resultExpr}.map { |item| ${itemExpr} } : []`;
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const itemExpr = this.deserializeArrayItemExpression(schema.additionalProperties, 'item');
            return `${resultExpr}.is_a?(Hash) ? ${resultExpr}.transform_values { |item| ${itemExpr} } : {}`;
        }
        if (schema.type === 'object' || schema.properties || schema.additionalProperties) {
            return `${resultExpr}.is_a?(Hash) ? ${resultExpr} : {}`;
        }
        if (schema.type === 'array') {
            return `${resultExpr}.is_a?(Array) ? ${resultExpr} : []`;
        }
        return resultExpr;
    }
    deserializeArrayItemExpression(schema, itemExpr) {
        if (schema?.$ref) {
            const modelName = RUBY_CONFIG.namingConventions.modelName(getSchemaReferenceName(schema.$ref) || 'Model');
            return `${itemExpr}.is_a?(Hash) ? Models::${modelName}.from_hash(${itemExpr}) : ${itemExpr}`;
        }
        if (Array.isArray(schema?.prefixItems)) {
            return `${itemExpr}.is_a?(Array) ? ${itemExpr}.map { |nested_item| nested_item } : []`;
        }
        if (schema?.items && typeof schema.items === 'object') {
            const nestedExpr = this.deserializeArrayItemExpression(schema.items, 'nested_item');
            return `${itemExpr}.is_a?(Array) ? ${itemExpr}.map { |nested_item| ${nestedExpr} } : []`;
        }
        if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
            const nestedExpr = this.deserializeArrayItemExpression(schema.additionalProperties, 'nested_item');
            return `${itemExpr}.is_a?(Hash) ? ${itemExpr}.transform_values { |nested_item| ${nestedExpr} } : {}`;
        }
        if (schema?.type === 'object' || schema?.properties) {
            return `${itemExpr}.is_a?(Hash) ? ${itemExpr} : {}`;
        }
        if (schema?.type === 'array') {
            return `${itemExpr}.is_a?(Array) ? ${itemExpr} : []`;
        }
        return itemExpr;
    }
    collectOperationModels(op, models) {
        this.collectSchemaModels(this.extractRequestBodyInfo(op)?.schema, models);
        this.collectSchemaModels(this.extractResponseSchema(op), models);
    }
    collectSchemaModels(schema, models) {
        if (!schema || typeof schema !== 'object') {
            return;
        }
        if (schema.$ref) {
            models.add(RUBY_CONFIG.namingConventions.modelName(getSchemaReferenceName(schema.$ref) || 'Model'));
            return;
        }
        for (const key of ['oneOf', 'anyOf', 'allOf']) {
            if (Array.isArray(schema[key])) {
                schema[key].forEach((entry) => this.collectSchemaModels(entry, models));
            }
        }
        if (Array.isArray(schema.prefixItems)) {
            schema.prefixItems.forEach((entry) => this.collectSchemaModels(entry, models));
        }
        if (schema.items && typeof schema.items === 'object') {
            this.collectSchemaModels(schema.items, models);
        }
        if (schema.properties && typeof schema.properties === 'object') {
            Object.values(schema.properties).forEach((entry) => this.collectSchemaModels(entry, models));
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            this.collectSchemaModels(schema.additionalProperties, models);
        }
    }
    generateOperationId(method, path, op, tag) {
        if (op.operationId) {
            const normalized = normalizeOperationId(op.operationId);
            return RUBY_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
        }
        const pathParts = path.split('/').filter(Boolean);
        const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
        const actionMap = {
            get: path.includes('{') ? 'get' : 'list',
            post: 'create',
            put: 'update',
            patch: 'patch',
            delete: 'delete',
            options: 'options',
            head: 'head',
            trace: 'trace',
            query: 'query',
        };
        return `${actionMap[method] || method}_${resource}`;
    }
    extractPathParams(path) {
        return (path.match(/\{([^}]+)\}/g) || []).map((match) => match.replace(/[{}]/g, ''));
    }
    extractRequestBodyInfo(op) {
        const content = op?.requestBody?.content;
        if (!content || typeof content !== 'object') {
            return undefined;
        }
        const mediaType = this.pickRequestBodyMediaType(content);
        if (!mediaType) {
            return undefined;
        }
        const schema = resolveMediaTypeSchema(content[mediaType]);
        if (!schema) {
            return undefined;
        }
        return {
            mediaType,
            schema,
        };
    }
    pickRequestBodyMediaType(content) {
        const mediaTypes = Object.keys(content);
        if (mediaTypes.length === 0) {
            return undefined;
        }
        const priority = ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded'];
        for (const preferred of priority) {
            const matched = mediaTypes.find((mediaType) => mediaType.toLowerCase() === preferred);
            if (matched) {
                return matched;
            }
        }
        return mediaTypes.find((mediaType) => mediaType.toLowerCase().endsWith('+json')) || mediaTypes[0];
    }
    extractResponseSchema(op) {
        const responses = op?.responses;
        if (!responses || typeof responses !== 'object') {
            return undefined;
        }
        const statusCodes = Object.keys(responses).sort();
        const preferred = statusCodes.filter((code) => /^2\d\d$/.test(code));
        const candidates = preferred.length > 0 ? preferred : statusCodes;
        for (const code of candidates) {
            const content = responses[code]?.content;
            if (!content || typeof content !== 'object') {
                continue;
            }
            const mediaType = this.pickJsonMediaType(content);
            if (mediaType) {
                const schema = resolveMediaTypeSchema(content[mediaType]);
                if (schema) {
                    return schema;
                }
            }
        }
        return undefined;
    }
    pickJsonMediaType(content) {
        const mediaTypes = Object.keys(content);
        return mediaTypes.find((mediaType) => {
            const normalized = mediaType.toLowerCase();
            return normalized === 'application/json' || normalized.endsWith('+json');
        }) || mediaTypes[0];
    }
    isVoidResponse(op) {
        const responses = op?.responses;
        if (!responses || typeof responses !== 'object') {
            return false;
        }
        const statusCodes = Object.keys(responses);
        if (statusCodes.length === 0) {
            return true;
        }
        return statusCodes.every((code) => {
            const content = responses[code]?.content;
            return !content || typeof content !== 'object' || Object.keys(content).length === 0;
        });
    }
    normalizeOperationPath(path, apiPrefix) {
        const normalizedPathRaw = String(path || '').trim();
        if (!normalizedPathRaw) {
            return '/';
        }
        const normalizedPath = normalizedPathRaw.startsWith('/') ? normalizedPathRaw : `/${normalizedPathRaw}`;
        const prefixRaw = String(apiPrefix || '').trim();
        if (!prefixRaw || prefixRaw === '/') {
            return normalizedPath;
        }
        const normalizedPrefix = `/${prefixRaw.replace(/^\/+|\/+$/g, '')}`;
        if (normalizedPath === normalizedPrefix) {
            return '/';
        }
        if (normalizedPath.startsWith(`${normalizedPrefix}/`)) {
            const withoutPrefix = normalizedPath.slice(normalizedPrefix.length);
            return withoutPrefix.startsWith('/') ? withoutPrefix : `/${withoutPrefix}`;
        }
        return normalizedPath;
    }
    generateRequestHeaderHelpers() {
        return `  private

  def build_request_headers(headers = {}, cookies = {})
    request_headers = {}
    headers.each do |name, parameter|
      serialized = serialize_parameter_value(parameter)
      request_headers[name.to_s] = serialized unless serialized.nil?
    end

    cookie_header = build_cookie_header(cookies)
    unless cookie_header.empty?
      request_headers['Cookie'] =
        request_headers.key?('Cookie') && !request_headers['Cookie'].empty? ? "#{request_headers['Cookie']}; #{cookie_header}" : cookie_header
    end

    request_headers
  end

  def build_cookie_header(cookies = {})
    cookies.filter_map do |name, parameter|
      serialized = serialize_parameter_value(parameter)
      next if serialized.nil?

      "#{CGI.escape(name.to_s)}=#{CGI.escape(serialized)}"
    end.join('; ')
  end

  def serialize_parameter_value(parameter)
    value = parameter&.value
    return nil if value.nil?
    return JSON.generate(value) if parameter.content_type && !parameter.content_type.empty?
    return value.compact.map(&:to_s).join(',') if value.is_a?(Array)
    if value.is_a?(Hash)
      serialized = []
      value.each do |key, item|
        next if item.nil?
        if parameter.explode
          serialized << "#{key}=#{item}"
        else
          serialized << key.to_s
          serialized << item.to_s
        end
      end
      return serialized.join(',')
    end
    return value.iso8601 if value.respond_to?(:iso8601)

    value.to_s
  end`;
    }
    withApiPrefix(prefix, path) {
        const normalizedPrefixRaw = (prefix || '').trim();
        const normalizedPrefix = normalizedPrefixRaw ? `/${normalizedPrefixRaw.replace(/^\/+|\/+$/g, '')}` : '';
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        if (!normalizedPrefix || normalizedPrefix === '/') {
            return normalizedPath;
        }
        if (normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`)) {
            return normalizedPath;
        }
        return `${normalizedPrefix}${normalizedPath}`.replace(/\/{2,}/g, '/');
    }
    format(content) {
        return `${content.trim().split('\n').map((line) => line.trimEnd()).join('\n')}\n`;
    }
}
function wrapRubyModules(segments, body, requires = []) {
    const requireBlock = requires.length > 0 ? `${requires.join('\n')}\n\n` : '';
    const opening = segments.map((segment, index) => `${'  '.repeat(index)}module ${segment}`).join('\n');
    const closing = segments.slice().reverse().map((_, index) => `${'  '.repeat(segments.length - index - 1)}end`).join('\n');
    const indentedBody = body
        .split('\n')
        .map((line) => `${'  '.repeat(segments.length)}${line}`)
        .join('\n');
    return `${requireBlock}${opening}\n${indentedBody}\n${closing}`;
}
function toSnakeCase(value) {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}
function escapeRubyString(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function formatRubyPathKey(value) {
    const raw = String(value || '');
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(raw) ? raw : `'${escapeRubyString(raw)}'`;
}
function sanitizeComment(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}
