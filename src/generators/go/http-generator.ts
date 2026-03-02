import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { resolveSimplifiedTagNames } from '../../framework/naming.js';
import { resolveGoCommonPackage } from '../../framework/common-package.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { GO_CONFIG } from './config.js';

export class HttpClientGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const clientName = resolveSdkClientName(config);
    const tags = Object.keys(ctx.apiGroups);
    const resolvedTagNames = resolveSimplifiedTagNames(tags);
    const apiKeyHeader = ctx.auth.apiKeyHeader || 'Authorization';
    const apiKeyUseBearer = ctx.auth.apiKeyAsBearer;
    const commonPkg = resolveGoCommonPackage(config);

    return [
      this.generateHttpClient(config, apiKeyHeader, apiKeyUseBearer, commonPkg.commonImportPath),
      this.generateHttpIndex(config),
      this.generateSdkClient(clientName, tags, resolvedTagNames, config),
      this.generateMainIndex(config),
    ];
  }

  private getModuleName(config: GeneratorConfig): string {
    return config.packageName || `github.com/sdkwork/${config.sdkType}-sdk`;
  }

  private generateHttpClient(
    config: GeneratorConfig,
    apiKeyHeader: string,
    apiKeyUseBearer: boolean,
    commonImportPath: string,
  ): GeneratedFile {
    const moduleName = this.getModuleName(config);

    return {
      path: 'http/client.go',
      content: this.format(`package http

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "mime/multipart"
    "net/http"
    "net/url"
    "strings"
    "time"

    common "${commonImportPath}"
)

const (
    defaultApiKeyHeader = "${apiKeyHeader}"
    defaultApiKeyUseBearer = ${apiKeyUseBearer ? 'true' : 'false'}
)

// Config wraps sdk-common Go config and adds SDK auth fields.
type Config struct {
    common.SdkConfig
    ApiKey      string
    AuthToken   string
    AccessToken string
}

func NewDefaultConfig(baseURL string) Config {
    timeout := common.DefaultTimeout
    return Config{
        SdkConfig: common.SdkConfig{
            HttpClientConfig: common.HttpClientConfig{
                BaseURL: baseURL,
                Timeout: &timeout,
                Headers: common.HttpHeaders{},
            },
        },
    }
}

type Client struct {
    baseURL    string
    httpClient *http.Client
    headers    common.HttpHeaders
}

func NewClient(config Config) *Client {
    timeoutMs := common.DefaultTimeout
    if config.Timeout != nil && *config.Timeout > 0 {
        timeoutMs = *config.Timeout
    }

    headers := common.HttpHeaders{}
    for key, value := range config.Headers {
        headers[key] = value
    }

    client := &Client{
        baseURL: strings.TrimRight(config.BaseURL, "/"),
        httpClient: &http.Client{
            Timeout: time.Duration(timeoutMs) * time.Millisecond,
        },
        headers: headers,
    }

    if config.ApiKey != "" {
        client.SetApiKey(config.ApiKey)
    }
    if config.AuthToken != "" {
        client.SetAuthToken(config.AuthToken)
    }
    if config.AccessToken != "" {
        client.SetAccessToken(config.AccessToken)
    }

    return client
}

func (c *Client) SetApiKey(apiKey string) {
    if defaultApiKeyUseBearer {
        c.headers[defaultApiKeyHeader] = "Bearer " + apiKey
    } else {
        c.headers[defaultApiKeyHeader] = apiKey
    }
    if defaultApiKeyHeader != "Authorization" {
        delete(c.headers, "Authorization")
    }
    if defaultApiKeyHeader != "Access-Token" {
        delete(c.headers, "Access-Token")
    }
}

func (c *Client) SetAuthToken(token string) {
    if defaultApiKeyHeader != "Authorization" {
        delete(c.headers, defaultApiKeyHeader)
    }
    c.headers["Authorization"] = "Bearer " + token
}

func (c *Client) SetAccessToken(token string) {
    if defaultApiKeyHeader != "Access-Token" {
        delete(c.headers, defaultApiKeyHeader)
    }
    c.headers["Access-Token"] = token
}

func (c *Client) SetHeader(key, value string) {
    c.headers[key] = value
}

func (c *Client) Get(path string, query map[string]interface{}, requestHeaders map[string]string) (interface{}, error) {
    return c.request("GET", path, query, nil, requestHeaders, "")
}

func (c *Client) Post(
    path string,
    body interface{},
    query map[string]interface{},
    requestHeaders map[string]string,
    contentType string,
) (interface{}, error) {
    return c.request("POST", path, query, body, requestHeaders, contentType)
}

func (c *Client) Put(
    path string,
    body interface{},
    query map[string]interface{},
    requestHeaders map[string]string,
    contentType string,
) (interface{}, error) {
    return c.request("PUT", path, query, body, requestHeaders, contentType)
}

func (c *Client) Delete(path string, query map[string]interface{}, requestHeaders map[string]string) (interface{}, error) {
    return c.request("DELETE", path, query, nil, requestHeaders, "")
}

func (c *Client) Patch(
    path string,
    body interface{},
    query map[string]interface{},
    requestHeaders map[string]string,
    contentType string,
) (interface{}, error) {
    return c.request("PATCH", path, query, body, requestHeaders, contentType)
}

func (c *Client) mergeHeaders(requestHeaders map[string]string) common.HttpHeaders {
    merged := common.HttpHeaders{}
    for key, value := range c.headers {
        merged[key] = value
    }
    for key, value := range requestHeaders {
        merged[key] = value
    }
    return merged
}

func (c *Client) buildMultipartBody(body interface{}) (io.Reader, string, error) {
    var buffer bytes.Buffer
    writer := multipart.NewWriter(&buffer)

    writeField := func(name string, value interface{}) error {
        switch typed := value.(type) {
        case nil:
            return writer.WriteField(name, "")
        case []string:
            for _, item := range typed {
                if err := writer.WriteField(name, item); err != nil {
                    return err
                }
            }
            return nil
        case []interface{}:
            for _, item := range typed {
                if err := writer.WriteField(name, fmt.Sprint(item)); err != nil {
                    return err
                }
            }
            return nil
        case []byte:
            part, err := writer.CreateFormFile(name, name)
            if err != nil {
                return err
            }
            _, err = part.Write(typed)
            return err
        default:
            return writer.WriteField(name, fmt.Sprint(typed))
        }
    }

    switch payload := body.(type) {
    case map[string]interface{}:
        for key, value := range payload {
            if err := writeField(key, value); err != nil {
                return nil, "", err
            }
        }
    case map[string]string:
        for key, value := range payload {
            if err := writeField(key, value); err != nil {
                return nil, "", err
            }
        }
    default:
        if body != nil {
            if err := writeField("value", body); err != nil {
                return nil, "", err
            }
        }
    }

    if err := writer.Close(); err != nil {
        return nil, "", err
    }
    return &buffer, writer.FormDataContentType(), nil
}

func (c *Client) buildFormBody(body interface{}) (io.Reader, string, error) {
    values := url.Values{}
    appendField := func(name string, value interface{}) {
        switch typed := value.(type) {
        case nil:
            values.Add(name, "")
        case []string:
            for _, item := range typed {
                values.Add(name, item)
            }
        case []interface{}:
            for _, item := range typed {
                values.Add(name, fmt.Sprint(item))
            }
        default:
            values.Add(name, fmt.Sprint(typed))
        }
    }

    switch payload := body.(type) {
    case map[string]interface{}:
        for key, value := range payload {
            appendField(key, value)
        }
    case map[string]string:
        for key, value := range payload {
            appendField(key, value)
        }
    default:
        if body != nil {
            appendField("value", body)
        }
    }

    return strings.NewReader(values.Encode()), "application/x-www-form-urlencoded", nil
}

func (c *Client) buildRequestBody(body interface{}, contentType string) (io.Reader, string, error) {
    if body == nil {
        return nil, "", nil
    }

    normalizedContentType := strings.ToLower(strings.TrimSpace(contentType))
    if normalizedContentType == "" {
        normalizedContentType = "application/json"
    }

    switch {
    case strings.HasPrefix(normalizedContentType, "multipart/form-data"):
        return c.buildMultipartBody(body)
    case strings.HasPrefix(normalizedContentType, "application/x-www-form-urlencoded"):
        return c.buildFormBody(body)
    default:
        switch typed := body.(type) {
        case []byte:
            return bytes.NewBuffer(typed), normalizedContentType, nil
        case string:
            return strings.NewReader(typed), normalizedContentType, nil
        default:
            jsonBody, marshalErr := json.Marshal(body)
            if marshalErr != nil {
                return nil, "", marshalErr
            }
            return bytes.NewBuffer(jsonBody), "application/json", nil
        }
    }
}

func (c *Client) request(
    method,
    path string,
    query map[string]interface{},
    body interface{},
    requestHeaders map[string]string,
    contentType string,
) (interface{}, error) {
    requestURL, err := url.Parse(c.baseURL + path)
    if err != nil {
        return nil, err
    }

    if len(query) > 0 {
        q := requestURL.Query()
        for key, value := range query {
            q.Set(key, fmt.Sprint(value))
        }
        requestURL.RawQuery = q.Encode()
    }

    reqBody, resolvedContentType, bodyErr := c.buildRequestBody(body, contentType)
    if bodyErr != nil {
        return nil, bodyErr
    }

    req, requestErr := http.NewRequest(method, requestURL.String(), reqBody)
    if requestErr != nil {
        return nil, requestErr
    }

    mergedHeaders := c.mergeHeaders(requestHeaders)
    for key, value := range mergedHeaders {
        req.Header.Set(key, value)
    }
    if reqBody != nil && resolvedContentType != "" && req.Header.Get("Content-Type") == "" {
        req.Header.Set("Content-Type", resolvedContentType)
    }

    resp, doErr := c.httpClient.Do(req)
    if doErr != nil {
        return nil, doErr
    }
    defer resp.Body.Close()

    if resp.StatusCode < 200 || resp.StatusCode >= 300 {
        responseBody, _ := io.ReadAll(resp.Body)
        return nil, fmt.Errorf("http status %d: %s", resp.StatusCode, string(responseBody))
    }

    if resp.StatusCode == 204 {
        return nil, nil
    }

    if resp.ContentLength == 0 {
        return nil, nil
    }

    responseBody, readErr := io.ReadAll(resp.Body)
    if readErr != nil {
        return nil, readErr
    }
    if len(responseBody) == 0 {
        return nil, nil
    }

    contentType := resp.Header.Get("Content-Type")
    if strings.Contains(strings.ToLower(contentType), "application/json") {
        var result interface{}
        if decodeErr := json.Unmarshal(responseBody, &result); decodeErr != nil {
            return nil, decodeErr
        }
        return result, nil
    }

    return string(responseBody), nil
}
`),
      language: 'go',
      description: 'HTTP client implementation',
    };
  }

  private generateHttpIndex(config: GeneratorConfig): GeneratedFile {
    return {
      path: 'http/doc.go',
      content: this.format(`package http

// HTTP client for ${config.name}
`),
      language: 'go',
      description: 'HTTP module exports',
    };
  }

  private generateSdkClient(
    clientName: string,
    tags: string[],
    resolvedTagNames: Map<string, string>,
    config: GeneratorConfig
  ): GeneratedFile {
    const moduleName = this.getModuleName(config);

    const modules = tags.map((tag) => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const propName = GO_CONFIG.namingConventions.propertyName(resolvedTagName);
      const structName = `${GO_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
      return `    ${propName} *api.${structName}`;
    }).join('\n');

    const inits = tags.map((tag) => {
      const resolvedTagName = resolvedTagNames.get(tag) || tag;
      const propName = GO_CONFIG.namingConventions.propertyName(resolvedTagName);
      const structName = `${GO_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
      return `        ${propName}: api.New${structName}(client),`;
    }).join('\n');

    return {
      path: 'sdk.go',
      content: this.format(`package ${config.sdkType}

import (
    "${moduleName}/api"
    sdkhttp "${moduleName}/http"
)

type ${clientName} struct {
    http *sdkhttp.Client
${modules}
}

func New${clientName}(baseURL string) *${clientName} {
    cfg := sdkhttp.NewDefaultConfig(baseURL)
    return New${clientName}WithConfig(cfg)
}

func New${clientName}WithConfig(config sdkhttp.Config) *${clientName} {
    client := sdkhttp.NewClient(config)
    return &${clientName}{
        http: client,
${inits}
    }
}

func (c *${clientName}) SetApiKey(apiKey string) *${clientName} {
    c.http.SetApiKey(apiKey)
    return c
}

func (c *${clientName}) SetAuthToken(token string) *${clientName} {
    c.http.SetAuthToken(token)
    return c
}

func (c *${clientName}) SetAccessToken(token string) *${clientName} {
    c.http.SetAccessToken(token)
    return c
}

func (c *${clientName}) SetHeader(key string, value string) *${clientName} {
    c.http.SetHeader(key, value)
    return c
}

func (c *${clientName}) Http() *sdkhttp.Client {
    return c.http
}
`),
      language: 'go',
      description: 'Main SDK class',
    };
  }

  private generateMainIndex(config: GeneratorConfig): GeneratedFile {
    return {
      path: 'doc.go',
      content: this.format(`package ${config.sdkType}

// ${config.name} SDK
`),
      language: 'go',
      description: 'Main module exports',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
