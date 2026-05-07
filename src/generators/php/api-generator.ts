import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import {
  normalizeOperationId,
  resolveScopedMethodNames,
  resolveSimplifiedTagNames,
  stripTagPrefixFromOperationId,
} from '../../framework/naming.js';
import { supportsRequestBodyByDefault, toHttpMethodLiteral } from '../../framework/http-methods.js';
import { resolveMediaTypeSchema } from '../../framework/schema.js';
import {
  extractOpenApiParameterContentSchema,
  requiresExplicitOpenApiQuerySerialization,
  resolveOpenApiParameterSerialization,
} from '../../framework/parameter-serialization.js';
import { PHP_CONFIG, getPhpNamespace, getPhpType } from './config.js';

interface NamedParameterBinding {
  parameter: any;
  safeName: string;
  required: boolean;
  type: string;
}

interface QueryParameterBinding extends NamedParameterBinding {
  style: string;
  explode: boolean;
  allowReserved: boolean;
  contentType?: string;
}

export class ApiGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
    const files: GeneratedFile[] = [this.generateBaseApi(config)];

    for (const tag of tags) {
      const group = ctx.apiGroups[tag];
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      files.push(this.generateApiFile(tag, resolvedTagName, group.operations, config));
    }

    return files;
  }

  private generateBaseApi(config: GeneratorConfig): GeneratedFile {
    const baseNamespace = getPhpNamespace(config);

    return {
      path: 'src/Api/BaseApi.php',
      content: this.format(`<?php

declare(strict_types=1);

namespace ${baseNamespace}\\Api;

use ${baseNamespace}\\Http\\HttpClient;

abstract class BaseApi
{
    public function __construct(protected HttpClient $client)
    {
    }

    protected function interpolatePath(string $path, array $pathParams): string
    {
        foreach ($pathParams as $name => $value) {
            $path = str_replace('{' . $name . '}', rawurlencode((string) $value), $path);
        }

        return $path;
    }

    protected function appendQueryString(string $path, string $rawQueryString): string
    {
        $query = ltrim($rawQueryString, '?');
        if ($query === '') {
            return $path;
        }

        return str_contains($path, '?') ? $path . '&' . $query : $path . '?' . $query;
    }

    protected function buildQueryString(array $parameters): string
    {
        $pairs = [];
        foreach ($parameters as $parameter) {
            $this->appendSerializedParameter($pairs, $parameter);
        }

        return implode('&', $pairs);
    }

    private function appendSerializedParameter(array &$pairs, QueryParameterSpec $parameter): void
    {
        if ($parameter->value === null) {
            return;
        }

        if ($parameter->contentType !== null && trim($parameter->contentType) !== '') {
            $pairs[] = rawurlencode($parameter->name) . '=' . $this->encodeQueryValue((string) json_encode($parameter->value, JSON_UNESCAPED_SLASHES), $parameter->allowReserved);
            return;
        }

        $style = $parameter->style !== '' ? $parameter->style : 'form';
        if ($style === 'deepObject' && is_array($parameter->value)) {
            $this->appendDeepObjectParameter($pairs, $parameter->name, $parameter->value, $parameter->allowReserved);
            return;
        }
        if (is_array($parameter->value)) {
            $this->appendArrayOrObjectParameter($pairs, $parameter->name, $parameter->value, $style, $parameter->explode, $parameter->allowReserved);
            return;
        }

        $pairs[] = rawurlencode($parameter->name) . '=' . $this->encodeQueryValue((string) $parameter->value, $parameter->allowReserved);
    }

    private function appendArrayOrObjectParameter(array &$pairs, string $name, array $value, string $style, bool $explode, bool $allowReserved): void
    {
        $isList = array_is_list($value);
        $serialized = [];
        foreach ($value as $key => $item) {
            if ($item === null) {
                continue;
            }
            if (!$isList && $style === 'form' && $explode) {
                $pairs[] = rawurlencode((string) $key) . '=' . $this->encodeQueryValue((string) $item, $allowReserved);
                continue;
            }
            if ($isList) {
                $serialized[] = (string) $item;
            } else {
                $serialized[] = (string) $key;
                $serialized[] = (string) $item;
            }
        }
        if ($serialized === []) {
            return;
        }
        if ($isList && $style === 'form' && $explode) {
            foreach ($serialized as $item) {
                $pairs[] = rawurlencode($name) . '=' . $this->encodeQueryValue($item, $allowReserved);
            }
            return;
        }
        if (!(!$isList && $style === 'form' && $explode)) {
            $pairs[] = rawurlencode($name) . '=' . $this->encodeQueryValue(implode(',', $serialized), $allowReserved);
        }
    }

    private function appendDeepObjectParameter(array &$pairs, string $name, array $value, bool $allowReserved): void
    {
        foreach ($value as $key => $item) {
            if ($item !== null) {
                $pairs[] = rawurlencode($name . '[' . $key . ']') . '=' . $this->encodeQueryValue((string) $item, $allowReserved);
            }
        }
    }

    private function encodeQueryValue(string $value, bool $allowReserved): string
    {
        $encoded = rawurlencode($value);
        if (!$allowReserved) {
            return $encoded;
        }

        return strtr($encoded, [
            '%3A' => ':', '%2F' => '/', '%3F' => '?', '%23' => '#',
            '%5B' => '[', '%5D' => ']', '%40' => '@', '%21' => '!',
            '%24' => '$', '%26' => '&', '%27' => "'", '%28' => '(',
            '%29' => ')', '%2A' => '*', '%2B' => '+', '%2C' => ',',
            '%3B' => ';', '%3D' => '=',
        ]);
    }
}

final class QueryParameterSpec
{
    public function __construct(
        public string $name,
        public mixed $value,
        public string $style,
        public bool $explode,
        public bool $allowReserved,
        public ?string $contentType,
    ) {
    }
}
`),
      language: 'php',
      description: 'Base API helpers',
    };
  }

  private generateApiFile(
    tag: string,
    resolvedTagName: string,
    operations: any[],
    config: GeneratorConfig
  ): GeneratedFile {
    const baseNamespace = getPhpNamespace(config);
    const namespace = `${baseNamespace}\\Api`;
    const className = `${PHP_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
    const fileName = PHP_CONFIG.namingConventions.fileName(resolvedTagName);
    const scopedMethodNames = resolveScopedMethodNames(operations, (op) =>
      this.generateOperationId(op.method, op.path, op, tag)
    );
    const methodNames = new Map<any, string>();
    const referencedModels = new Set<string>();

    for (const op of operations) {
      const scopedName = scopedMethodNames.get(op) || 'operation';
      methodNames.set(op, PHP_CONFIG.namingConventions.methodName(scopedName));
      this.collectOperationModels(op, referencedModels);
    }

    const useStatements = Array.from(referencedModels)
      .sort((left, right) => left.localeCompare(right))
      .map((modelName) => `use ${baseNamespace}\\Models\\${modelName};`)
      .join('\n');
    const useBlock = useStatements ? `${useStatements}\n\n` : '';
    const methods = operations.map((op) => this.generateMethod(op, config, methodNames.get(op) || 'operation')).join('\n\n');
    const needsRequestHeaderHelpers = operations.some((op) => {
      const allParameters = op.allParameters || op.parameters || [];
      return allParameters.some((param: any) => param?.in === 'header' || param?.in === 'cookie');
    });

    return {
      path: `src/Api/${fileName}.php`,
      content: this.format(`<?php

declare(strict_types=1);

namespace ${namespace};

${useBlock}final class ${className} extends BaseApi
{
${methods}
${needsRequestHeaderHelpers ? `\n${this.generateRequestHeaderHelpers()}` : ''}
}
`),
      language: 'php',
      description: `${tag} API module`,
    };
  }

  private generateMethod(op: any, config: GeneratorConfig, methodName: string): string {
    const rawPathParams = this.extractPathParams(op.path);
    const allParameters = op.allParameters || op.parameters || [];
    const queryParams = allParameters.filter((param: any) => param?.in === 'query');
    const queryStringParams = allParameters.filter((param: any) => param?.in === 'querystring');
    const headerParams = allParameters.filter((param: any) => param?.in === 'header');
    const cookieParams = allParameters.filter((param: any) => param?.in === 'cookie');
    const hasQuery = queryParams.length > 0;
    const hasRawQueryString = queryStringParams.length > 0;
    const hasHeaders = headerParams.length > 0 || cookieParams.length > 0;
    const method = String(op.method || '').toLowerCase();
    const httpMethod = String(op.httpMethod || op.method || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const requestBodyInfo = supportsRequestBodyByDefault(method) ? this.extractRequestBodyInfo(op) : undefined;
    const hasBody = Boolean(requestBodyInfo);
    const requestBodySchema = requestBodyInfo?.schema;
    const requestBodyRequired = Boolean(hasBody && op?.requestBody?.required);
    const requestBodyMediaType = (requestBodyInfo?.mediaType || '').toLowerCase();
    const responseSchema = this.extractResponseSchema(op);
    const returnType = this.resolveReturnType(op, responseSchema);
    const hasExplicitQuerySerialization = queryParams.some((param: any) => requiresExplicitOpenApiQuerySerialization(param));
    const params: string[] = [];
    const pathParamNames = createUniqueIdentifierMap(
      rawPathParams,
      (value) => PHP_CONFIG.namingConventions.propertyName(value),
      [
        hasBody ? 'body' : '',
        hasQuery ? 'params' : '',
        hasRawQueryString ? 'rawQueryString' : '',
        hasHeaders ? 'requestHeaders' : '',
        'path',
        hasBody ? 'payload' : '',
      ]
    );
    const pathParams = rawPathParams.map((rawName) => ({
      rawName,
      safeName: pathParamNames.get(rawName) || rawName,
    }));
    const parameterReservedNames = [
      ...pathParams.map((param) => param.safeName),
      hasBody ? 'body' : '',
      hasQuery ? 'params' : '',
      hasRawQueryString ? 'rawQueryString' : '',
      hasHeaders ? 'requestHeaders' : '',
      'path',
      hasBody ? 'payload' : '',
    ];
    const queryBindings = hasExplicitQuerySerialization
      ? this.createQueryParameterBindings(queryParams, parameterReservedNames)
      : [];
    const headerBindings = this.createNamedParameterBindings(headerParams, parameterReservedNames);
    const cookieBindings = this.createNamedParameterBindings(cookieParams, [
      ...parameterReservedNames,
      ...queryBindings.map((binding) => binding.safeName),
      ...headerBindings.map((binding) => binding.safeName),
    ]);
    const requiredQueryBindings = queryBindings.filter((binding) => binding.required);
    const optionalQueryBindings = queryBindings.filter((binding) => !binding.required);
    const requiredHeaderBindings = [...headerBindings, ...cookieBindings].filter((binding) => binding.required);
    const optionalHeaderBindings = [...headerBindings, ...cookieBindings].filter((binding) => !binding.required);

    for (const pathParam of pathParams) {
      params.push(`string $${pathParam.safeName}`);
    }
    if (hasBody && requestBodyRequired) {
      params.push(this.resolveBodyParameterSignature(requestBodySchema, requestBodyRequired));
    }
    if (hasRawQueryString) {
      params.push('string $rawQueryString');
    }
    params.push(...requiredQueryBindings.map((binding) => this.renderMethodParameter(binding)));
    params.push(...requiredHeaderBindings.map((binding) => this.renderMethodParameter(binding)));
    if (hasBody && !requestBodyRequired) {
      params.push(this.resolveBodyParameterSignature(requestBodySchema, requestBodyRequired));
    }
    if (hasQuery && !hasExplicitQuerySerialization) {
      params.push('array $params = []');
    }
    params.push(...optionalQueryBindings.map((binding) => this.renderMethodParameter(binding)));
    params.push(...optionalHeaderBindings.map((binding) => this.renderMethodParameter(binding)));

    const normalizedPath = this.normalizeOperationPath(op.path, config.apiPrefix);
    const requestPath = this.withApiPrefix(config.apiPrefix, normalizedPath);
    const pathLine = pathParams.length > 0
      ? `        $path = $this->interpolatePath('${escapePhpString(requestPath)}', [${pathParams.map((param) => `'${param.rawName}' => $${param.safeName}`).join(', ')}]);`
      : `        $path = '${escapePhpString(requestPath)}';`;
    const rawQueryStringLine = hasRawQueryString
      ? `        $path = $this->appendQueryString($path, $rawQueryString);`
      : '';
    const queryLine = hasExplicitQuerySerialization
      ? `        $query = $this->buildQueryString([
${this.renderQueryParameterSpecs(queryBindings, 12)}
        ]);
        $path = $this->appendQueryString($path, $query);`
      : '';
    const payloadLine = hasBody
      ? `        $payload = ${this.serializeRequestBodyExpression(requestBodySchema, '$body')};`
      : '';
    const requestHeaderLine = hasHeaders
      ? `        $requestHeaders = $this->buildRequestHeaders(
${this.renderNamedParameterArray(headerBindings, 12)},
${this.renderNamedParameterArray(cookieBindings, 12)}
        );`
      : '';
    const requestOptions = this.buildRequestOptions(hasQuery && !hasExplicitQuerySerialization, hasHeaders, hasBody, requestBodyMediaType);
    const requestMethod = toHttpMethodLiteral(httpMethod);
    const requestLine = returnType === 'void'
      ? `        $this->client->request('${requestMethod}', $path, ${requestOptions});`
      : `        $result = $this->client->request('${requestMethod}', $path, ${requestOptions});`;
    const returnLine = returnType === 'void'
      ? '        return;'
      : `        return ${this.deserializeResponseExpression(responseSchema, '$result')};`;
    const docComment = op.summary
      ? `    /** ${sanitizeDocComment(op.summary)} */\n`
      : '';

    return `${docComment}    public function ${methodName}(${params.join(', ')}): ${returnType}
    {
${pathLine}
${rawQueryStringLine ? `${rawQueryStringLine}\n` : ''}${queryLine ? `${queryLine}\n` : ''}${payloadLine ? `${payloadLine}\n` : ''}${requestHeaderLine ? `${requestHeaderLine}\n` : ''}${requestLine}
${returnLine}
    }`;
  }

  private resolveBodyParameterSignature(schema: any, required: boolean): string {
    if (schema?.$ref) {
      const modelName = PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
      return required ? `array|${modelName} $body` : `array|${modelName}|null $body = null`;
    }

    const type = getPhpType(schema, PHP_CONFIG);
    if (type === 'array') {
      return required ? 'array $body' : '?array $body = null';
    }
    if (isTypedPhpScalar(type)) {
      return required ? `${type} $body` : `?${type} $body = null`;
    }

    return required ? 'mixed $body' : 'mixed $body = null';
  }

  private createNamedParameterBindings(parameters: any[], reservedNames: Iterable<string>): NamedParameterBinding[] {
    const keys = parameters.map((parameter, index) => `${parameter?.in || 'parameter'}:${parameter?.name || 'value'}:${index}`);
    const rawNameByKey = new Map(keys.map((key, index) => [key, String(parameters[index]?.name || `value${index + 1}`)]));
    const safeNameByKey = createUniqueIdentifierMap(
      keys,
      (key) => PHP_CONFIG.namingConventions.propertyName(rawNameByKey.get(key) || 'value'),
      reservedNames,
    );

    return parameters.map((parameter, index) => {
      const key = keys[index];
      return {
        parameter,
        safeName: safeNameByKey.get(key) || `value${index + 1}`,
        required: Boolean(parameter?.required),
        type: this.getNamedParameterType(parameter),
      };
    });
  }

  private createQueryParameterBindings(parameters: any[], reservedNames: Iterable<string>): QueryParameterBinding[] {
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

  private getNamedParameterType(parameter: any): string {
    const type = getPhpType(extractOpenApiParameterContentSchema(parameter) || parameter?.schema, PHP_CONFIG);
    if (type === 'array') {
      return 'array';
    }
    return isTypedPhpScalar(type) ? type : 'mixed';
  }

  private renderMethodParameter(binding: NamedParameterBinding): string {
    if (!binding.required) {
      return binding.type === 'mixed'
        ? `mixed $${binding.safeName} = null`
        : `?${binding.type} $${binding.safeName} = null`;
    }
    return binding.type === 'mixed'
      ? `mixed $${binding.safeName}`
      : `${binding.type} $${binding.safeName}`;
  }

  private renderNamedParameterArray(bindings: NamedParameterBinding[], indentation: number): string {
    const indent = ' '.repeat(indentation);
    if (bindings.length === 0) {
      return `${indent}[]`;
    }
    const lines = bindings.map((binding) => {
      return `${indent}    '${escapePhpString(String(binding.parameter?.name || binding.safeName))}' => $${binding.safeName},`;
    });
    return [`${indent}[`, ...lines, `${indent}]`].join('\n');
  }

  private renderQueryParameterSpecs(bindings: QueryParameterBinding[], indentation: number): string {
    const indent = ' '.repeat(indentation);
    return bindings.map((binding) => {
      return `${indent}new QueryParameterSpec(${[
        `'${escapePhpString(String(binding.parameter?.name || binding.safeName))}'`,
        `$${binding.safeName}`,
        `'${escapePhpString(binding.style)}'`,
        binding.explode ? 'true' : 'false',
        binding.allowReserved ? 'true' : 'false',
        binding.contentType ? `'${escapePhpString(binding.contentType)}'` : 'null',
      ].join(', ')}),`;
    }).join('\n');
  }

  private resolveReturnType(op: any, responseSchema: any): string {
    if (!responseSchema) {
      return this.isVoidResponse(op) ? 'void' : 'mixed';
    }

    if (responseSchema.$ref) {
      return `?${PHP_CONFIG.namingConventions.modelName(responseSchema.$ref.split('/').pop() || 'Model')}`;
    }

    const baseType = getPhpType(responseSchema, PHP_CONFIG);
    if (baseType === 'array') {
      return 'array';
    }
    if (isTypedPhpScalar(baseType)) {
      return baseType;
    }
    if (baseType === 'mixed') {
      return this.isVoidResponse(op) ? 'void' : 'mixed';
    }
    return 'mixed';
  }

  private serializeRequestBodyExpression(schema: any, bodyExpr: string): string {
    if (!schema || typeof schema !== 'object') {
      return bodyExpr;
    }

    if (schema.$ref) {
      const modelName = PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
      return `${bodyExpr} instanceof ${modelName} ? ${bodyExpr}->toArray() : ${bodyExpr}`;
    }

    if (Array.isArray(schema.prefixItems)) {
      return `is_array(${bodyExpr})
            ? array_values(${bodyExpr})
            : ${bodyExpr}`;
    }

    if (schema.items && typeof schema.items === 'object') {
      const itemExpr = this.serializeArrayItemExpression(schema.items, '$item');
      return `is_array(${bodyExpr})
            ? array_values(array_map(static fn($item) => ${itemExpr}, ${bodyExpr}))
            : ${bodyExpr}`;
    }

    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const entryExpr = this.serializeArrayItemExpression(schema.additionalProperties, '$item');
      return `is_array(${bodyExpr})
            ? array_map(static fn($item) => ${entryExpr}, ${bodyExpr})
            : ${bodyExpr}`;
    }

    return bodyExpr;
  }

  private serializeArrayItemExpression(schema: any, itemExpr: string): string {
    if (schema?.$ref) {
      const modelName = PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
      return `${itemExpr} instanceof ${modelName} ? ${itemExpr}->toArray() : ${itemExpr}`;
    }

    if (Array.isArray(schema?.prefixItems)) {
      return `is_array(${itemExpr}) ? array_values(${itemExpr}) : []`;
    }

    if (schema?.items && typeof schema.items === 'object') {
      const nestedExpr = this.serializeArrayItemExpression(schema.items, '$nestedItem');
      return `is_array(${itemExpr})
                        ? array_values(array_map(static fn($nestedItem) => ${nestedExpr}, ${itemExpr}))
                        : []`;
    }

    if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
      const mapExpr = this.serializeArrayItemExpression(schema.additionalProperties, '$nestedItem');
      return `is_array(${itemExpr})
                        ? array_map(static fn($nestedItem) => ${mapExpr}, ${itemExpr})
                        : []`;
    }

    return itemExpr;
  }

  private deserializeResponseExpression(schema: any, resultExpr: string): string {
    if (!schema || typeof schema !== 'object') {
      return resultExpr;
    }

    if (schema.$ref) {
      const modelName = PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
      return `is_array(${resultExpr}) ? ${modelName}::fromArray(${resultExpr}) : null`;
    }

    if (Array.isArray(schema.prefixItems)) {
      return `is_array(${resultExpr}) ? array_values(${resultExpr}) : []`;
    }

    if (schema.items && typeof schema.items === 'object') {
      const itemExpr = this.deserializeArrayItemExpression(schema.items, '$item');
      return `is_array(${resultExpr})
            ? array_values(array_map(static fn($item) => ${itemExpr}, ${resultExpr}))
            : []`;
    }

    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const entryExpr = this.deserializeArrayItemExpression(schema.additionalProperties, '$item');
      return `is_array(${resultExpr})
            ? array_map(static fn($item) => ${entryExpr}, ${resultExpr})
            : []`;
    }

    if (getPhpType(schema, PHP_CONFIG) === 'array') {
      return `is_array(${resultExpr}) ? ${resultExpr} : []`;
    }

    return resultExpr;
  }

  private deserializeArrayItemExpression(schema: any, itemExpr: string): string {
    if (schema?.$ref) {
      const modelName = PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model');
      return `is_array(${itemExpr}) ? ${modelName}::fromArray(${itemExpr}) : ${itemExpr}`;
    }

    if (Array.isArray(schema?.prefixItems)) {
      return `is_array(${itemExpr}) ? array_values(${itemExpr}) : []`;
    }

    if (schema?.items && typeof schema.items === 'object') {
      const nestedExpr = this.deserializeArrayItemExpression(schema.items, '$nestedItem');
      return `is_array(${itemExpr})
                        ? array_values(array_map(static fn($nestedItem) => ${nestedExpr}, ${itemExpr}))
                        : []`;
    }

    if (schema?.additionalProperties && typeof schema.additionalProperties === 'object') {
      const mapExpr = this.deserializeArrayItemExpression(schema.additionalProperties, '$nestedItem');
      return `is_array(${itemExpr})
                        ? array_map(static fn($nestedItem) => ${mapExpr}, ${itemExpr})
                        : []`;
    }

    if (getPhpType(schema, PHP_CONFIG) === 'array') {
      return `is_array(${itemExpr}) ? ${itemExpr} : []`;
    }

    return itemExpr;
  }

  private buildRequestOptions(
    hasQuery: boolean,
    hasHeaders: boolean,
    hasBody: boolean,
    requestBodyMediaType: string
  ): string {
    const lines: string[] = [];
    if (hasQuery) {
      lines.push(`'query' => $params,`);
    }
    if (hasHeaders) {
      lines.push(`'headers' => $requestHeaders,`);
    }
    if (hasBody) {
      if (requestBodyMediaType === 'multipart/form-data') {
        lines.push(`'multipart' => $payload,`);
      } else if (requestBodyMediaType === 'application/x-www-form-urlencoded') {
        lines.push(`'form_params' => $payload,`);
      } else {
        lines.push(`'json' => $payload,`);
      }
    }

    if (lines.length === 0) {
      return '[]';
    }

    return `[
${lines.map((line) => `            ${line}`).join('\n')}
        ]`;
  }

  private generateRequestHeaderHelpers(): string {
    return `    private function buildRequestHeaders(array $headers, array $cookies): array
    {
        $requestHeaders = [];
        foreach ($headers as $name => $value) {
            $serialized = $this->serializeParameterValue($value);
            if ($serialized !== null) {
                $requestHeaders[(string) $name] = $serialized;
            }
        }

        $cookieHeader = $this->buildCookieHeader($cookies);
        if ($cookieHeader !== '') {
            $requestHeaders['Cookie'] = isset($requestHeaders['Cookie']) && $requestHeaders['Cookie'] !== ''
                ? $requestHeaders['Cookie'] . '; ' . $cookieHeader
                : $cookieHeader;
        }

        return $requestHeaders;
    }

    private function buildCookieHeader(array $cookies): string
    {
        $pairs = [];
        foreach ($cookies as $name => $value) {
            $serialized = $this->serializeParameterValue($value);
            if ($serialized !== null) {
                $pairs[] = rawurlencode((string) $name) . '=' . rawurlencode($serialized);
            }
        }

        return implode('; ', $pairs);
    }

    private function serializeParameterValue(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (is_array($value)) {
            return implode(',', array_filter(array_map(fn($item) => $this->serializeParameterValue($item), $value), fn($item) => $item !== null));
        }
        if ($value instanceof \\Stringable) {
            return (string) $value;
        }

        return (string) $value;
    }`;
  }

  private collectOperationModels(op: any, models: Set<string>): void {
    const requestBodySchema = this.extractRequestBodyInfo(op)?.schema;
    const responseSchema = this.extractResponseSchema(op);

    this.collectSchemaModels(requestBodySchema, models);
    this.collectSchemaModels(responseSchema, models);
  }

  private collectSchemaModels(schema: any, models: Set<string>): void {
    if (!schema || typeof schema !== 'object') {
      return;
    }

    if (schema.$ref) {
      models.add(PHP_CONFIG.namingConventions.modelName(schema.$ref.split('/').pop() || 'Model'));
      return;
    }

    for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
      if (Array.isArray(schema[key])) {
        schema[key].forEach((entry: any) => this.collectSchemaModels(entry, models));
      }
    }
    if (Array.isArray(schema.prefixItems)) {
      for (const itemSchema of schema.prefixItems) {
        this.collectSchemaModels(itemSchema, models);
      }
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

  private generateOperationId(method: string, path: string, op: any, tag: string): string {
    if (op.operationId) {
      const normalized = normalizeOperationId(op.operationId);
      return PHP_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
    }

    const pathParts = path.split('/').filter(Boolean);
    const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
    const actionMap: Record<string, string> = {
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

  private extractPathParams(path: string): string[] {
    return (path.match(/\{([^}]+)\}/g) || []).map((match) => match.replace(/[{}]/g, ''));
  }

  private extractRequestBodyInfo(op: any): { schema: any; mediaType: string } | undefined {
    const content = op?.requestBody?.content;
    if (!content || typeof content !== 'object') {
      return undefined;
    }

    const mediaType = this.pickRequestBodyMediaType(content as Record<string, any>);
    if (!mediaType) {
      return undefined;
    }

    const schema = resolveMediaTypeSchema((content as Record<string, any>)[mediaType]);
    if (!schema) {
      return undefined;
    }

    return {
      mediaType,
      schema,
    };
  }

  private pickRequestBodyMediaType(content: Record<string, any>): string | undefined {
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

  private extractResponseSchema(op: any): any | undefined {
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

  private pickJsonMediaType(content: Record<string, any>): string | undefined {
    const mediaTypes = Object.keys(content);
    return mediaTypes.find((mediaType) => {
      const normalized = mediaType.toLowerCase();
      return normalized === 'application/json' || normalized.endsWith('+json');
    }) || mediaTypes[0];
  }

  private isVoidResponse(op: any): boolean {
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

  private normalizeOperationPath(path: string, apiPrefix: string): string {
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

  private withApiPrefix(prefix: string, path: string): string {
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

  private format(content: string): string {
    return `${content.trim()}\n`;
  }
}

function escapePhpString(value: string): string {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function sanitizeDocComment(value: string): string {
  return String(value || '').replace(/\*\//g, '* /').trim();
}

function isTypedPhpScalar(type: string): boolean {
  return type === 'string'
    || type === 'int'
    || type === 'float'
    || type === 'bool';
}
