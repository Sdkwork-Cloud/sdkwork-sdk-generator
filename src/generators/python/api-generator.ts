import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { createUniqueIdentifierMap } from '../../framework/identifiers.js';
import {
  normalizeOperationId,
  resolveScopedMethodNames,
  stripTagPrefixFromOperationId,
} from '../../framework/naming.js';
import { resolveOpenAIStyleMethodNames, resolveSdkTagNames, selectCanonicalOpenAIStyleOperations } from '../../framework/openai-surface.js';
import { supportsRequestBodyByDefault, toHttpMethodLiteral } from '../../framework/http-methods.js';
import { collectSchemaReferences, resolveMediaTypeSchema } from '../../framework/schema.js';
import { extractEventStreamResponseInfo } from '../../framework/responses.js';
import { PYTHON_CONFIG, getPythonPackageRoot, getPythonType } from './config.js';
import {
  extractOpenApiParameterContentSchema,
  requiresExplicitOpenApiQuerySerialization,
  resolveOpenApiParameterSerialization,
} from '../../framework/parameter-serialization.js';

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

interface PathParameterBinding {
  rawName: string;
  safeName: string;
  type: string;
  style: string;
  explode: boolean;
}

interface HeaderParameterBinding extends NamedParameterBinding {
  style: string;
  explode: boolean;
  contentType?: string;
}

type GeneratedMethod = {
  content: string;
  referencedModels: Set<string>;
};

export class ApiGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSdkTagNames(tags, config);
    const packageRoot = getPythonPackageRoot(config);
    const knownModels = new Set<string>(
      Object.keys(ctx.schemas).map((schemaName) => PYTHON_CONFIG.namingConventions.modelName(schemaName))
    );

    for (const tag of tags) {
      const group = ctx.apiGroups[tag];
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      files.push(this.generateApiFile(tag, resolvedTagName, group.operations, config, packageRoot, knownModels));
    }

    files.push(this.generateApiIndex(tags, resolvedTagNames, packageRoot));
    return files;
  }

  private generateApiFile(
    tag: string,
    resolvedTagName: string,
    operations: any[],
    config: GeneratorConfig,
    packageRoot: string,
    knownModels: Set<string>
  ): GeneratedFile {
    operations = selectCanonicalOpenAIStyleOperations(tag, operations, config);
    const className = `${PYTHON_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
    const fileName = PYTHON_CONFIG.namingConventions.fileName(resolvedTagName);
    const scopedMethodNames = resolveOpenAIStyleMethodNames(tag, operations, config, PYTHON_CONFIG, 'snake')
      || resolveScopedMethodNames(operations, (op) =>
        this.generateOperationId(op.method, op.path, op, tag)
      );
    const methodNames = new Map<any, string>();
    for (const op of operations) {
      const scopedName = scopedMethodNames.get(op) || 'operation';
      methodNames.set(op, PYTHON_CONFIG.namingConventions.methodName(scopedName));
    }

    const referencedModels = new Set<string>();
    const methods = operations
      .map((op) => {
        const generated = this.generateMethod(op, config, methodNames.get(op) || 'operation', knownModels);
        generated.referencedModels.forEach((modelName) => referencedModels.add(modelName));
        return generated.content;
      })
      .join('\n\n');
    const needsRequestHeaderHelpers = operations.some((op) => {
      const allParameters = op.allParameters || op.parameters || [];
      return allParameters.some((param: any) => param?.in === 'header' || param?.in === 'cookie');
    });
    const needsPathSerializationHelpers = operations.some((op) => this.extractPathParams(op.path).length > 0);
    const needsQuerySerializationHelpers = operations.some((op) => {
      const allParameters = op.allParameters || op.parameters || [];
      return allParameters.some((param: any) => param?.in === 'query' && requiresExplicitOpenApiQuerySerialization(param));
    });

    const needsIteratorImport = operations.some((op) => Boolean(extractEventStreamResponseInfo(op)));
    const typingImports = ['Any', 'Dict', needsIteratorImport ? 'Iterator' : '', 'List', 'Optional']
      .filter(Boolean)
      .join(', ');
    const modelImports = referencedModels.size > 0
      ? `from ..models import ${Array.from(referencedModels).sort((a, b) => a.localeCompare(b)).join(', ')}\n`
      : '';

    return {
      path: `${packageRoot}/api/${fileName}.py`,
      content: this.format(`from typing import ${typingImports}
from ..http_client import HttpClient
${modelImports}
def _append_query_string(path: str, raw_query_string: str) -> str:
    query = raw_query_string.lstrip('?')
    if not query:
        return path
    separator = '&' if '?' in path else '?'
    return f"{path}{separator}{query}"

${needsPathSerializationHelpers ? this.generatePathSerializationHelpers() : ''}
${needsQuerySerializationHelpers ? this.generateQuerySerializationHelpers() : ''}
${needsRequestHeaderHelpers ? this.generateRequestHeaderHelpers() : ''}

class ${className}:
    """${tag} API client."""
    
    def __init__(self, client: HttpClient):
        self._client = client

${methods}
`),
      language: 'python',
      description: `${tag} API module`,
    };
  }

  private generateMethod(
    op: any,
    config: GeneratorConfig,
    methodName: string,
    knownModels: Set<string>
  ): GeneratedMethod {
    const rawPathParams = this.extractPathParams(op.path);
    const allParameters = op.allParameters || op.parameters || [];
    const queryParams = allParameters.filter((param: any) => param?.in === 'query');
    const queryStringParams = allParameters.filter((param: any) => param?.in === 'querystring');
    const headerParams = allParameters.filter((param: any) => param?.in === 'header');
    const cookieParams = allParameters.filter((param: any) => param?.in === 'cookie');
    const pathOpenApiParams = allParameters.filter((param: any) => param?.in === 'path');
    const hasQuery = queryParams.length > 0;
    const hasRawQueryString = queryStringParams.length > 0;
    const hasHeaders = headerParams.length > 0 || cookieParams.length > 0;
    const method = String(op.method || '').toLowerCase();
    const httpMethod = String(op.httpMethod || op.method || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const supportsRequestBody = supportsRequestBodyByDefault(method);
    const requestBodyInfo = supportsRequestBody ? this.extractRequestBodyInfo(op) : undefined;
    const hasBody = Boolean(requestBodyInfo);
    const requestBodyRequired = hasBody && Boolean(op.requestBody?.required);
    const requestBodySchema = requestBodyInfo?.schema;
    const requestBodyMediaType = (requestBodyInfo?.mediaType || '').toLowerCase();
    const useDataArgument = requestBodyMediaType === 'multipart/form-data'
      || requestBodyMediaType === 'application/x-www-form-urlencoded';
    const isFormUrlencodedBody = requestBodyMediaType === 'application/x-www-form-urlencoded';
    const requestType = requestBodySchema
      ? getPythonType(requestBodySchema, PYTHON_CONFIG)
      : 'Any';
    const hasExplicitQuerySerialization = queryParams.some((param: any) => requiresExplicitOpenApiQuerySerialization(param));
    const eventStreamInfo = extractEventStreamResponseInfo(op);
    const isEventStreamResponse = Boolean(eventStreamInfo);
    const responseSchema = eventStreamInfo?.schema ?? this.extractResponseSchema(op);
    const responseType = responseSchema
      ? getPythonType(responseSchema, PYTHON_CONFIG)
      : this.inferFallbackResponseType(op);

    const referencedModels = new Set<string>();
    if (requestBodySchema) {
      this.collectReferencedModels(requestBodySchema, knownModels, referencedModels);
    }
    if (responseSchema) {
      this.collectReferencedModels(responseSchema, knownModels, referencedModels);
    }

    const pathParamNames = createUniqueIdentifierMap(
      rawPathParams,
      (value) => PYTHON_CONFIG.namingConventions.propertyName(value),
      [
        hasBody ? 'body' : '',
        hasQuery ? 'params' : '',
        hasRawQueryString ? 'raw_query_string' : '',
        hasHeaders ? 'request_headers' : '',
      ]
    );
    const pathParams = rawPathParams.map((rawName) => {
      const parameter = pathOpenApiParams.find((candidate: any) => candidate?.name === rawName);
      const serialization = resolveOpenApiParameterSerialization(parameter || { name: rawName, in: 'path' });
      return {
        rawName,
        safeName: pathParamNames.get(rawName) || rawName,
        type: parameter?.schema ? getPythonType(parameter.schema, PYTHON_CONFIG) : 'str',
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
    ];
    const queryBindings = hasExplicitQuerySerialization
      ? this.createQueryParameterBindings(queryParams, knownModels, parameterReservedNames)
      : [];
    const headerBindings = this.createHeaderParameterBindings(headerParams, knownModels, parameterReservedNames);
    const cookieBindings = this.createHeaderParameterBindings(cookieParams, knownModels, [
      ...parameterReservedNames,
      ...queryBindings.map((binding) => binding.safeName),
      ...headerBindings.map((binding) => binding.safeName),
    ]);
    const requiredQueryBindings = queryBindings.filter((binding) => binding.required);
    const optionalQueryBindings = queryBindings.filter((binding) => !binding.required);
    const requiredHeaderBindings = [...headerBindings, ...cookieBindings].filter((binding) => binding.required);
    const optionalHeaderBindings = [...headerBindings, ...cookieBindings].filter((binding) => !binding.required);

    const params: string[] = ['self'];
    if (pathParams.length) {
      params.push(...pathParams.map((param) => `${param.safeName}: ${param.type}`));
    }
    if (hasBody && requestBodyRequired) {
      if (requestBodyRequired) {
        params.push(`body: ${requestType}`);
      } else if (requestType === 'Any') {
        params.push('body: Any = None');
      } else {
        params.push(`body: Optional[${requestType}] = None`);
      }
    }
    if (hasRawQueryString) {
      params.push('raw_query_string: str');
    }
    params.push(...requiredQueryBindings.map((binding) => this.renderMethodParameter(binding)));
    params.push(...requiredHeaderBindings.map((binding) => this.renderMethodParameter(binding)));
    if (hasBody && !requestBodyRequired) {
      if (requestType === 'Any') {
        params.push('body: Any = None');
      } else {
        params.push(`body: Optional[${requestType}] = None`);
      }
    }
    if (hasQuery && !hasExplicitQuerySerialization) {
      params.push('params: Optional[Dict[str, Any]] = None');
    }
    params.push(...optionalQueryBindings.map((binding) => this.renderMethodParameter(binding)));
    params.push(...optionalHeaderBindings.map((binding) => this.renderMethodParameter(binding)));

    const normalizedOperationPath = this.normalizeOperationPath(op.path, config.apiPrefix);
    const rawPath = this.withApiPrefix(config.apiPrefix, normalizedOperationPath);
    const pathTemplate = rawPath.replace(/\{([^}]+)\}/g, (_match, paramName: string) => {
      const binding = pathParams.find((param) => param.rawName === paramName);
      const safeName = binding?.safeName || pathParamNames.get(paramName) || PYTHON_CONFIG.namingConventions.propertyName(paramName);
      const style = binding?.style || 'simple';
      const explode = binding?.explode ? 'True' : 'False';
      return `{serialize_path_parameter(${safeName}, {'name': ${this.formatPythonString(paramName)}, 'style': ${this.formatPythonString(style)}, 'explode': ${explode}})}`;
    });
    const pathExpression = hasRawQueryString
      ? `_append_query_string(f"${pathTemplate}", raw_query_string)`
      : hasExplicitQuerySerialization
        ? `_append_query_string(f"${pathTemplate}", query)`
      : `f"${pathTemplate}"`;
    const formHeaderLine = isFormUrlencodedBody
      ? `        form_headers = {**(${hasHeaders ? 'request_headers' : '{}'} or {}), 'Content-Type': 'application/x-www-form-urlencoded'}\n`
      : '';
    const headersArg = isFormUrlencodedBody
      ? ', headers=form_headers'
      : hasHeaders
        ? ', headers=request_headers'
        : '';
    let call = '';
    
    switch (method) {
      case 'get':
        call = `self._client.get(${pathExpression}${hasQuery && !hasExplicitQuerySerialization ? ', params=params' : ''}${hasHeaders ? ', headers=request_headers' : ''})`;
        break;
      case 'post':
        call = `self._client.post(${pathExpression}${hasBody ? (useDataArgument ? ', data=body' : ', json=body') : ''}${hasQuery && !hasExplicitQuerySerialization ? ', params=params' : ''}${headersArg})`;
        break;
      case 'put':
        call = `self._client.put(${pathExpression}${hasBody ? (useDataArgument ? ', data=body' : ', json=body') : ''}${hasQuery && !hasExplicitQuerySerialization ? ', params=params' : ''}${headersArg})`;
        break;
      case 'delete':
        call = `self._client.delete(${pathExpression}${hasQuery && !hasExplicitQuerySerialization ? ', params=params' : ''}${hasHeaders ? ', headers=request_headers' : ''})`;
        break;
      case 'patch':
        call = `self._client.patch(${pathExpression}${hasBody ? (useDataArgument ? ', data=body' : ', json=body') : ''}${hasQuery && !hasExplicitQuerySerialization ? ', params=params' : ''}${headersArg})`;
        break;
      default:
        call = `self._client.request('${toHttpMethodLiteral(httpMethod)}', ${pathExpression}${hasQuery && !hasExplicitQuerySerialization ? ', params=params' : ''}${hasBody ? (useDataArgument ? ', data=body' : ', json=body') : ''}${headersArg})`;
    }

    const docComment = op.summary 
      ? `        """${op.summary}"""\n` 
      : '';
    const queryBlock = hasExplicitQuerySerialization
      ? `        query = build_query_string([
${this.renderQueryParameterSpecs(queryBindings, 12)}
        ])\n`
      : '';
    const requestHeaderBlock = hasHeaders
      ? `        request_headers = build_request_headers(
${this.renderNamedParameterDict(headerBindings, 12)},
${this.renderNamedParameterDict(cookieBindings, 12)}
        )\n`
      : '';

    if (isEventStreamResponse) {
      const streamArgs = [
        pathExpression,
        `method='${toHttpMethodLiteral(httpMethod)}'`,
        hasBody ? (useDataArgument ? 'data=body' : 'json=body') : '',
        hasQuery && !hasExplicitQuerySerialization ? 'params=params' : '',
        isFormUrlencodedBody ? 'headers=form_headers' : hasHeaders ? 'headers=request_headers' : '',
      ].filter(Boolean).join(', ');

      return {
        content: `    def ${methodName}(${params.join(', ')}) -> Iterator[${responseType}]:
${docComment}${queryBlock}${requestHeaderBlock}${formHeaderLine}        return self._client.stream_json(${streamArgs})`,
        referencedModels,
      };
    }

    return {
      content: `    def ${methodName}(${params.join(', ')}) -> ${responseType}:
${docComment}${queryBlock}${requestHeaderBlock}${formHeaderLine}        return ${call}`,
      referencedModels,
    };
  }

  private createQueryParameterBindings(
    parameters: any[],
    knownModels: Set<string>,
    reservedNames: Iterable<string>
  ): QueryParameterBinding[] {
    return this.createNamedParameterBindings(parameters, knownModels, reservedNames).map((binding) => {
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

  private createHeaderParameterBindings(
    parameters: any[],
    knownModels: Set<string>,
    reservedNames: Iterable<string>
  ): HeaderParameterBinding[] {
    return this.createNamedParameterBindings(parameters, knownModels, reservedNames).map((binding) => {
      const serialization = resolveOpenApiParameterSerialization(binding.parameter);
      return {
        ...binding,
        style: serialization.style,
        explode: serialization.explode,
        contentType: serialization.contentType,
      };
    });
  }

  private createNamedParameterBindings(
    parameters: any[],
    knownModels: Set<string>,
    reservedNames: Iterable<string>
  ): NamedParameterBinding[] {
    const keys = parameters.map((parameter, index) => `${parameter?.in || 'parameter'}:${parameter?.name || 'value'}:${index}`);
    const rawNameByKey = new Map(keys.map((key, index) => [key, String(parameters[index]?.name || `value${index + 1}`)]));
    const safeNameByKey = createUniqueIdentifierMap(
      keys,
      (key) => PYTHON_CONFIG.namingConventions.propertyName(rawNameByKey.get(key) || 'value'),
      reservedNames,
    );

    return parameters.map((parameter, index) => {
      const key = keys[index];
      return {
        parameter,
        safeName: safeNameByKey.get(key) || `value_${index + 1}`,
        required: Boolean(parameter?.required),
        type: this.getNamedParameterType(parameter, knownModels),
      };
    });
  }

  private getNamedParameterType(parameter: any, knownModels: Set<string>): string {
    const contentSchema = extractOpenApiParameterContentSchema(parameter);
    if (contentSchema) {
      return getPythonType(contentSchema, PYTHON_CONFIG);
    }
    if (!parameter?.schema) {
      return 'Any';
    }
    return getPythonType(parameter.schema, PYTHON_CONFIG);
  }

  private renderMethodParameter(binding: NamedParameterBinding): string {
    return binding.required
      ? `${binding.safeName}: ${binding.type}`
      : `${binding.safeName}: Optional[${binding.type}] = None`;
  }

  private renderNamedParameterDict(bindings: HeaderParameterBinding[], indentation: number): string {
    const indent = ' '.repeat(indentation);
    if (bindings.length === 0) {
      return `${indent}{}`;
    }
    const lines = bindings.map((binding) => {
      const parts = [
        `'value': ${binding.safeName}`,
        `'style': ${this.formatPythonString(binding.style)}`,
        `'explode': ${binding.explode ? 'True' : 'False'}`,
      ];
      if (binding.contentType) {
        parts.push(`'content_type': ${this.formatPythonString(binding.contentType)}`);
      }
      return `${indent}    ${this.formatPythonString(String(binding.parameter?.name || binding.safeName))}: {${parts.join(', ')}},`;
    });
    return [`${indent}{`, ...lines, `${indent}}`].join('\n');
  }

  private formatPythonString(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }

  private renderQueryParameterSpecs(bindings: QueryParameterBinding[], indentation: number): string {
    const indent = ' '.repeat(indentation);
    return bindings.map((binding) => {
      const parts = [
        `'name': ${this.formatPythonString(String(binding.parameter?.name || binding.safeName))}`,
        `'value': ${binding.safeName}`,
        `'style': ${this.formatPythonString(binding.style)}`,
        `'explode': ${binding.explode ? 'True' : 'False'}`,
        `'allow_reserved': ${binding.allowReserved ? 'True' : 'False'}`,
      ];
      if (binding.contentType) {
        parts.push(`'content_type': ${this.formatPythonString(binding.contentType)}`);
      }
      return `${indent}{${parts.join(', ')}},`;
    }).join('\n');
  }

  private generateQuerySerializationHelpers(): string {
    return `def build_query_string(parameters: List[Dict[str, Any]]) -> str:
    pairs: List[str] = []
    for parameter in parameters:
        append_serialized_parameter(pairs, parameter)
    return '&'.join(pairs)


def append_serialized_parameter(pairs: List[str], parameter: Dict[str, Any]) -> None:
    value = parameter.get('value')
    if value is None:
        return

    name = str(parameter.get('name') or '')
    allow_reserved = bool(parameter.get('allow_reserved'))
    content_type = parameter.get('content_type')
    if content_type:
        import json

        pairs.append(f"{encode_query_component(name)}={encode_query_value(json.dumps(value, separators=(',', ':')), allow_reserved)}")
        return

    style = str(parameter.get('style') or 'form')
    explode = bool(parameter.get('explode'))
    if style == 'deepObject':
        append_deep_object_parameter(pairs, name, value, allow_reserved)
        return
    if isinstance(value, (list, tuple)):
        append_array_parameter(pairs, name, value, style, explode, allow_reserved)
        return
    if isinstance(value, dict):
        append_object_parameter(pairs, name, value, style, explode, allow_reserved)
        return

    pairs.append(f"{encode_query_component(name)}={encode_query_value(serialize_primitive(value), allow_reserved)}")


def append_array_parameter(
    pairs: List[str],
    name: str,
    value: Any,
    style: str,
    explode: bool,
    allow_reserved: bool,
) -> None:
    values = [serialize_primitive(item) for item in value if item is not None]
    if not values:
        return

    if style == 'form' and explode:
        for item in values:
            pairs.append(f"{encode_query_component(name)}={encode_query_value(item, allow_reserved)}")
        return

    pairs.append(f"{encode_query_component(name)}={encode_query_value(','.join(values), allow_reserved)}")


def append_object_parameter(
    pairs: List[str],
    name: str,
    value: Dict[str, Any],
    style: str,
    explode: bool,
    allow_reserved: bool,
) -> None:
    entries = [(key, entry_value) for key, entry_value in value.items() if entry_value is not None]
    if not entries:
        return

    if style == 'form' and explode:
        for key, entry_value in entries:
            pairs.append(f"{encode_query_component(str(key))}={encode_query_value(serialize_primitive(entry_value), allow_reserved)}")
        return

    serialized = ','.join(
        item
        for key, entry_value in entries
        for item in (str(key), serialize_primitive(entry_value))
    )
    pairs.append(f"{encode_query_component(name)}={encode_query_value(serialized, allow_reserved)}")


def append_deep_object_parameter(pairs: List[str], name: str, value: Any, allow_reserved: bool) -> None:
    if not isinstance(value, dict):
        pairs.append(f"{encode_query_component(name)}={encode_query_value(serialize_primitive(value), allow_reserved)}")
        return

    for key, entry_value in value.items():
        if entry_value is None:
            continue
        pairs.append(f"{encode_query_component(f'{name}[{key}]')}={encode_query_value(serialize_primitive(entry_value), allow_reserved)}")


def serialize_primitive(value: Any) -> str:
    if isinstance(value, dict):
        import json

        return json.dumps(value, separators=(',', ':'))
    return str(value)


def encode_query_component(value: str) -> str:
    from urllib.parse import quote

    return quote(value, safe='')


def encode_query_value(value: str, allow_reserved: bool) -> str:
    from urllib.parse import quote

    return quote(value, safe=':/?#[]@!$&\\'()*+,;=' if allow_reserved else '')
`;
  }

  private generatePathSerializationHelpers(): string {
    return `def serialize_path_parameter(value: Any, spec: Dict[str, Any]) -> str:
    if value is None:
        return ''

    style = str(spec.get('style') or 'simple')
    name = str(spec.get('name') or '')
    explode = bool(spec.get('explode'))
    if isinstance(value, (list, tuple)):
        return serialize_path_array(name, value, style, explode)
    if isinstance(value, dict):
        return serialize_path_object(name, value, style, explode)
    return path_prefix(name, style) + encode_path_value(serialize_path_primitive(value))


def serialize_path_array(name: str, values: Any, style: str, explode: bool) -> str:
    serialized = [encode_path_value(serialize_path_primitive(item)) for item in values if item is not None]
    if not serialized:
        return path_prefix(name, style)
    if style == 'matrix':
        return ''.join(f";{name}={item}" for item in serialized) if explode else f";{name}={','.join(serialized)}"
    return path_prefix(name, style) + ('.' if explode else ',').join(serialized)


def serialize_path_object(name: str, value: Dict[str, Any], style: str, explode: bool) -> str:
    entries = [(key, entry_value) for key, entry_value in value.items() if entry_value is not None]
    if not entries:
        return path_prefix(name, style)
    if style == 'matrix':
        if explode:
            return ''.join(f";{encode_path_value(str(key))}={encode_path_value(serialize_path_primitive(entry_value))}" for key, entry_value in entries)
        serialized = ','.join(item for key, entry_value in entries for item in (encode_path_value(str(key)), encode_path_value(serialize_path_primitive(entry_value))))
        return f";{name}={serialized}"
    if explode:
        separator = '.' if style == 'label' else ','
        serialized = separator.join(f"{encode_path_value(str(key))}={encode_path_value(serialize_path_primitive(entry_value))}" for key, entry_value in entries)
    else:
        serialized = ','.join(item for key, entry_value in entries for item in (encode_path_value(str(key)), encode_path_value(serialize_path_primitive(entry_value))))
    return path_prefix(name, style) + serialized


def path_prefix(name: str, style: str) -> str:
    if style == 'label':
        return '.'
    if style == 'matrix':
        return f";{name}"
    return ''


def encode_path_value(value: str) -> str:
    from urllib.parse import quote

    return quote(value, safe='')


def serialize_path_primitive(value: Any) -> str:
    if isinstance(value, dict):
        import json

        return json.dumps(value, separators=(',', ':'))
    return str(value)

`;
  }

  private generateRequestHeaderHelpers(): string {
    return `def build_request_headers(headers: Dict[str, Dict[str, Any]], cookies: Optional[Dict[str, Dict[str, Any]]] = None) -> Optional[Dict[str, str]]:
    request_headers: Dict[str, str] = {}
    for name, parameter in headers.items():
        serialized = serialize_parameter_value(parameter)
        if serialized is not None:
            request_headers[name] = serialized

    cookie_header = build_cookie_header(cookies or {})
    if cookie_header:
        request_headers['Cookie'] = (
            f"{request_headers['Cookie']}; {cookie_header}"
            if 'Cookie' in request_headers
            else cookie_header
        )

    return request_headers or None


def build_cookie_header(cookies: Dict[str, Dict[str, Any]]) -> Optional[str]:
    from urllib.parse import quote

    pairs: List[str] = []
    for name, parameter in cookies.items():
        serialized = serialize_parameter_value(parameter)
        if serialized is not None:
            pairs.append(f"{quote(str(name), safe='')}={quote(serialized, safe='')}")
    return '; '.join(pairs) if pairs else None


def serialize_parameter_value(parameter: Optional[Dict[str, Any]]) -> Optional[str]:
    value = None if parameter is None else parameter.get('value')
    if value is None:
        return None
    if parameter and parameter.get('content_type'):
        import json

        return json.dumps(value, separators=(',', ':'))
    if isinstance(value, (list, tuple)):
        return ','.join(serialize_header_primitive(item) for item in value if item is not None)
    if isinstance(value, dict):
        return serialize_header_object(value, bool(parameter and parameter.get('explode')))
    return serialize_header_primitive(value)


def serialize_header_object(value: Dict[str, Any], explode: bool) -> str:
    entries = [(key, entry_value) for key, entry_value in value.items() if entry_value is not None]
    if explode:
        return ','.join(f"{key}={serialize_header_primitive(entry_value)}" for key, entry_value in entries)
    return ','.join(item for key, entry_value in entries for item in (str(key), serialize_header_primitive(entry_value)))


def serialize_header_primitive(value: Any) -> str:
    return str(value)
`;
  }

  private generateOperationId(method: string, path: string, op: any, tag: string): string {
    if (op.operationId) {
      const normalized = normalizeOperationId(op.operationId);
      return PYTHON_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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
    
    return `${actionMap[method] || method}_${PYTHON_CONFIG.namingConventions.propertyName(resource)}`;
  }

  private extractPathParams(path: string): string[] {
    const matches = path.match(/\{([^}]+)\}/g) || [];
    return matches.map((m) => m.replace(/[{}]/g, ''));
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
    const jsonLike = mediaTypes.find((mediaType) => mediaType.toLowerCase().endsWith('+json'));
    return jsonLike || mediaTypes[0];
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
    const jsonLike = mediaTypes.find((mediaType) => {
      const normalized = mediaType.toLowerCase();
      return normalized === 'application/json' || normalized.endsWith('+json');
    });
    return jsonLike || mediaTypes[0];
  }

  private inferFallbackResponseType(op: any): string {
    const responses = op?.responses;
    if (!responses || typeof responses !== 'object') {
      return 'Any';
    }

    const statusCodes = Object.keys(responses);
    if (statusCodes.length === 0) {
      return 'Any';
    }

    const allNoContent = statusCodes.every((code) => {
      const content = responses[code]?.content;
      return !content || typeof content !== 'object' || Object.keys(content).length === 0;
    });

    if (allNoContent || responses['204']) {
      return 'None';
    }
    return 'Any';
  }

  private collectReferencedModels(
    schema: any,
    knownModels: Set<string>,
    refs: Set<string>
  ): void {
    collectSchemaReferences(schema, PYTHON_CONFIG.namingConventions.modelName, knownModels, refs);
  }

  private generateApiIndex(tags: string[], resolvedTagNames: Map<string, string>, packageRoot: string): GeneratedFile {
    const imports = tags.map((tag) => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const className = `${PYTHON_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
      const fileName = PYTHON_CONFIG.namingConventions.fileName(resolvedTagName);
      return `from .${fileName} import ${className}`;
    }).join('\n');

    const exports = tags.map((tag) => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      return `${PYTHON_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
    }).map((v) => `'${v}'`).join(', ');

    return {
      path: `${packageRoot}/api/__init__.py`,
      content: this.format(`${imports}

__all__ = [${exports}]
`),
      language: 'python',
      description: 'API module index',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
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
}
