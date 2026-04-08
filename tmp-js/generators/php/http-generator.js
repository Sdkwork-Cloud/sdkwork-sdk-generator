import { resolveSimplifiedTagNames } from '../../framework/naming.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { PHP_CONFIG, getPhpNamespace } from './config.js';
export class HttpClientGenerator {
    generate(ctx, config) {
        const clientName = resolveSdkClientName(config);
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const apiKeyHeader = (ctx.auth.apiKeyHeader || 'Authorization').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const apiKeyUseBearer = ctx.auth.apiKeyAsBearer;
        return [
            this.generateSdkConfig(config),
            this.generateHttpClient(config, apiKeyHeader, apiKeyUseBearer),
            this.generateSdkClient(clientName, tags, resolvedTagNames, config),
        ];
    }
    generateSdkConfig(config) {
        const namespace = getPhpNamespace(config);
        return {
            path: 'src/SdkConfig.php',
            content: this.format(`<?php

declare(strict_types=1);

namespace ${namespace};

final class SdkConfig
{
    public function __construct(
        public string $baseUrl = '${escapePhpString(config.baseUrl)}',
        public int $timeout = 30,
        public array $headers = [],
        public array $transportOptions = [],
    ) {
    }
}
`),
            language: 'php',
            description: 'SDK configuration',
        };
    }
    generateHttpClient(config, apiKeyHeader, apiKeyUseBearer) {
        const namespace = `${getPhpNamespace(config)}\\Http`;
        return {
            path: 'src/Http/HttpClient.php',
            content: this.format(`<?php

declare(strict_types=1);

namespace ${namespace};

use ${getPhpNamespace(config)}\\SdkConfig;
use GuzzleHttp\\Client;
use GuzzleHttp\\Exception\\GuzzleException;
use RuntimeException;

final class HttpClient
{
    private Client $client;
    private array $headers;
    private ?string $apiKey = null;
    private ?string $authToken = null;
    private ?string $accessToken = null;

    public function __construct(private SdkConfig $config)
    {
        $this->headers = $config->headers;
        $this->client = new Client(array_merge([
            'base_uri' => rtrim($config->baseUrl, '/'),
            'timeout' => $config->timeout,
        ], $config->transportOptions));
    }

    public function setApiKey(string $apiKey): self
    {
        $this->apiKey = $apiKey;
        $this->authToken = null;
        $this->accessToken = null;
        return $this;
    }

    public function setAuthToken(string $token): self
    {
        $this->authToken = $token;
        if (strtolower('${apiKeyHeader}') !== 'authorization') {
            $this->apiKey = null;
        }
        return $this;
    }

    public function setAccessToken(string $token): self
    {
        $this->accessToken = $token;
        if (strtolower('${apiKeyHeader}') !== 'access-token') {
            $this->apiKey = null;
        }
        return $this;
    }

    public function setHeader(string $key, string $value): self
    {
        $this->headers[$key] = $value;
        return $this;
    }

    public function request(string $method, string $path, array $options = []): mixed
    {
        $requestOptions = [];
        $requestOptions['headers'] = array_merge(
            $this->buildAuthHeaders(),
            $this->headers,
            $options['headers'] ?? []
        );

        if (!empty($options['query'])) {
            $requestOptions['query'] = $options['query'];
        }
        if (array_key_exists('json', $options)) {
            $requestOptions['json'] = $options['json'];
        }
        if (!empty($options['form_params'])) {
            $requestOptions['form_params'] = $options['form_params'];
        }
        if (!empty($options['multipart'])) {
            $requestOptions['multipart'] = $this->normalizeMultipart($options['multipart']);
        }

        try {
            $response = $this->client->request($method, $path, $requestOptions);
        } catch (GuzzleException $exception) {
            throw new RuntimeException('SDK request failed: ' . $exception->getMessage(), (int) $exception->getCode(), $exception);
        }

        $body = (string) $response->getBody();
        if ($body === '') {
            return null;
        }

        $decoded = json_decode($body, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            return $decoded;
        }

        return $body;
    }

    private function buildAuthHeaders(): array
    {
        $headers = [];

        if ($this->apiKey !== null && $this->apiKey !== '') {
            $headers['${apiKeyHeader}'] = ${apiKeyUseBearer ? `$this->formatBearer($this->apiKey)` : '$this->apiKey'};
        }
        if ($this->authToken !== null && $this->authToken !== '') {
            $headers['Authorization'] = $this->formatBearer($this->authToken);
        }
        if ($this->accessToken !== null && $this->accessToken !== '') {
            $headers['Access-Token'] = $this->accessToken;
        }

        return $headers;
    }

    private function normalizeMultipart(mixed $payload): array
    {
        if (!is_array($payload)) {
            return [];
        }

        $parts = [];
        foreach ($payload as $name => $value) {
            if (is_array($value)) {
                $parts[] = [
                    'name' => (string) $name,
                    'contents' => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ];
                continue;
            }

            $parts[] = [
                'name' => (string) $name,
                'contents' => is_string($value) || is_resource($value) ? $value : (string) $value,
            ];
        }

        return $parts;
    }

    private function formatBearer(string $value): string
    {
        return 'Bearer ' . $value;
    }
}
`),
            language: 'php',
            description: 'HTTP client wrapper',
        };
    }
    generateSdkClient(clientName, tags, resolvedTagNames, config) {
        const namespace = getPhpNamespace(config);
        const apiImports = tags.map((tag) => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const className = `${PHP_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            return `use ${namespace}\\Api\\${className};`;
        }).join('\n');
        const apiProperties = tags.map((tag) => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const propertyName = PHP_CONFIG.namingConventions.propertyName(resolvedTagName);
            const className = `${PHP_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            return `    public ${className} $${propertyName};`;
        }).join('\n');
        const apiInitializers = tags.map((tag) => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const propertyName = PHP_CONFIG.namingConventions.propertyName(resolvedTagName);
            const className = `${PHP_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            return `        $this->${propertyName} = new ${className}($this->http);`;
        }).join('\n');
        return {
            path: `src/${clientName}.php`,
            content: this.format(`<?php

declare(strict_types=1);

namespace ${namespace};

use ${namespace}\\Http\\HttpClient;
${apiImports ? `${apiImports}\n` : ''}
final class ${clientName}
{
    public HttpClient $http;
${apiProperties ? `${apiProperties}\n` : ''}
    public function __construct(SdkConfig $config)
    {
        $this->http = new HttpClient($config);
${apiInitializers}
    }

    public function setApiKey(string $apiKey): self
    {
        $this->http->setApiKey($apiKey);
        return $this;
    }

    public function setAuthToken(string $token): self
    {
        $this->http->setAuthToken($token);
        return $this;
    }

    public function setAccessToken(string $token): self
    {
        $this->http->setAccessToken($token);
        return $this;
    }

    public function setHeader(string $key, string $value): self
    {
        $this->http->setHeader($key, $value);
        return $this;
    }
}
`),
            language: 'php',
            description: 'Main SDK client',
        };
    }
    format(content) {
        return `${content.trim()}\n`;
    }
}
function escapePhpString(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
