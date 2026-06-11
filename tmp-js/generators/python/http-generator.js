import { resolveSdkTagNames } from '../../framework/openai-surface.js';
import { PYTHON_CONFIG, getPythonPackageRoot } from './config.js';
import { resolvePythonCommonPackage } from '../../framework/common-package.js';
import { resolveLegacySdkClientName, resolveSdkClientName } from '../../framework/sdk-identity.js';
export class HttpClientGenerator {
    generate(ctx, config) {
        const clientName = resolveSdkClientName(config);
        const legacyClientName = resolveLegacySdkClientName(config);
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSdkTagNames(tags, config);
        const packageRoot = getPythonPackageRoot(config);
        const apiKeyHeader = (ctx.auth.apiKeyHeader || 'Authorization').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const apiKeyUseBearer = ctx.auth.apiKeyAsBearer;
        return [
            this.generateHttpClient(config, packageRoot, apiKeyHeader, apiKeyUseBearer),
            this.generateSdkClient(clientName, legacyClientName, tags, resolvedTagNames, config, packageRoot),
            this.generatePackageInit(clientName, legacyClientName, config, packageRoot),
        ];
    }
    generateHttpClient(config, packageRoot, apiKeyHeader, apiKeyUseBearer) {
        const commonPkg = resolvePythonCommonPackage(config);
        const commonRoot = commonPkg.moduleImportRoot;
        return {
            path: `${packageRoot}/http_client.py`,
            content: this.format(`import json as json_module
import requests

from ${commonRoot}.core.types import SdkConfig as CommonSdkConfig
from ${commonRoot}.http import BaseHttpClient

SdkConfig = CommonSdkConfig
API_KEY_HEADER = '${apiKeyHeader}'
API_KEY_USE_BEARER = ${apiKeyUseBearer ? 'True' : 'False'}


class HttpClient(BaseHttpClient):
    """
    SDK HTTP client wrapper based on sdkwork-common.

    Auth headers:
    - api_key -> Authorization: Bearer {api_key}
    - auth_token -> Authorization: Bearer {auth_token}
    - access_token -> Access-Token: {access_token}
    """

    def _update_auth_headers(self) -> None:
        if self._session is None:
            return

        self._session.headers.pop('Authorization', None)
        self._session.headers.pop('Access-Token', None)
        self._session.headers.pop('X-API-Key', None)

        if self._api_key:
            self._session.headers[API_KEY_HEADER] = f'Bearer {self._api_key}' if API_KEY_USE_BEARER else self._api_key
        if self._auth_token:
            self._session.headers['Authorization'] = f'Bearer {self._auth_token}'
        if self._access_token:
            self._session.headers['Access-Token'] = self._access_token

    def set_api_key(self, api_key: str) -> 'HttpClient':
        self._api_key = api_key
        self._auth_token = None
        self._access_token = None
        self._update_auth_headers()
        return self

    def set_auth_token(self, token: str) -> 'HttpClient':
        self._auth_token = token
        if API_KEY_HEADER.lower() != 'authorization':
            self._api_key = None
        self._update_auth_headers()
        return self

    def set_access_token(self, token: str) -> 'HttpClient':
        self._access_token = token
        if API_KEY_HEADER.lower() != 'access-token':
            self._api_key = None
        self._update_auth_headers()
        return self

    def set_header(self, key: str, value: str) -> 'HttpClient':
        self.headers[key] = value
        if self._session is not None:
            self._session.headers[key] = value
        return self

    def _request_headers(self, headers=None, skip_auth: bool = False):
        if skip_auth:
            request_headers = dict(headers or {})
            return request_headers
        return headers

    def _request_session(self, skip_auth: bool = False):
        if not skip_auth:
            return self._get_session()
        session = requests.Session()
        session.headers.clear()
        return session

    def request(self, method: str, path: str, params=None, data=None, json=None, headers=None, skip_auth: bool = False):
        response = self._request_session(skip_auth).request(
            method=method,
            url=f"{self.base_url}{path}",
            params=params,
            data=data,
            json=json,
            headers=self._request_headers(headers, skip_auth),
            timeout=self.timeout / 1000,
        )
        response.raise_for_status()
        if not response.content:
            return None
        return response.json()

    def get(self, path: str, params=None, headers=None, skip_auth: bool = False):
        return self.request('GET', path, params=params, headers=headers, skip_auth=skip_auth)

    def post(self, path: str, params=None, data=None, json=None, headers=None, skip_auth: bool = False):
        return self.request('POST', path, params=params, data=data, json=json, headers=headers, skip_auth=skip_auth)

    def put(self, path: str, params=None, data=None, json=None, headers=None, skip_auth: bool = False):
        return self.request('PUT', path, params=params, data=data, json=json, headers=headers, skip_auth=skip_auth)

    def patch(self, path: str, params=None, data=None, json=None, headers=None, skip_auth: bool = False):
        return self.request('PATCH', path, params=params, data=data, json=json, headers=headers, skip_auth=skip_auth)

    def delete(self, path: str, params=None, headers=None, skip_auth: bool = False):
        return self.request('DELETE', path, params=params, headers=headers, skip_auth=skip_auth)

    def stream_json(self, path: str, method: str = 'POST', params=None, data=None, json=None, headers=None, skip_auth: bool = False):
        response = self._request_session(skip_auth).request(
            method=method,
            url=f"{self.base_url}{path}",
            params=params,
            data=data,
            json=json,
            headers=self._request_headers({'Accept': 'text/event-stream', **(headers or {})}, skip_auth),
            timeout=self.timeout / 1000,
            stream=True,
        )
        response.raise_for_status()
        for line in response.iter_lines(decode_unicode=True):
            if not line or line.startswith(':'):
                continue
            if not line.startswith('data:'):
                continue
            data = line[5:].strip()
            if data == '[DONE]':
                break
            yield json_module.loads(data)
`),
            language: 'python',
            description: 'HTTP client wrapper based on sdkwork-common',
        };
    }
    generateSdkClient(clientName, legacyClientName, tags, resolvedTagNames, config, packageRoot) {
        const imports = tags.map((tag) => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const className = `${PYTHON_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            const fileName = PYTHON_CONFIG.namingConventions.fileName(resolvedTagName);
            return `from .api.${fileName} import ${className}`;
        }).join('\n');
        const modules = tags.map((tag) => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const propName = PYTHON_CONFIG.namingConventions.propertyName(resolvedTagName);
            const className = `${PYTHON_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            return `        self.${propName}: ${className}`;
        }).join('\n');
        const inits = tags.map((tag) => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const propName = PYTHON_CONFIG.namingConventions.propertyName(resolvedTagName);
            const className = `${PYTHON_CONFIG.namingConventions.modelName(resolvedTagName)}Api`;
            return `        self.${propName} = ${className}(self._client)`;
        }).join('\n');
        const legacyAlias = legacyClientName ? `\n${legacyClientName} = ${clientName}\n` : '';
        return {
            path: `${packageRoot}/client.py`,
            content: this.format(`from .http_client import HttpClient, SdkConfig
${imports}


class ${clientName}:
    """${config.name} SDK Client."""

    def __init__(self, config: SdkConfig):
        self._client = HttpClient(config)
${modules}

        # Initialize API modules
${inits}

    def set_api_key(self, api_key: str) -> '${clientName}':
        """Set API key for authentication."""
        self._client.set_api_key(api_key)
        return self

    def set_auth_token(self, token: str) -> '${clientName}':
        """Set auth token for authentication."""
        self._client.set_auth_token(token)
        return self

    def set_access_token(self, token: str) -> '${clientName}':
        """Set access token for authentication."""
        self._client.set_access_token(token)
        return self

    def set_header(self, key: str, value: str) -> '${clientName}':
        """Set custom header."""
        self._client.set_header(key, value)
        return self

    @property
    def http(self) -> HttpClient:
        """Get the underlying HTTP client."""
        return self._client


def create_client(config: SdkConfig) -> ${clientName}:
    """Create a new SDK client instance."""
    return ${clientName}(config)
${legacyAlias}
`),
            language: 'python',
            description: 'Main SDK client',
        };
    }
    generatePackageInit(clientName, legacyClientName, config, packageRoot) {
        const clientImports = [clientName, legacyClientName, 'create_client'].filter(Boolean).join(', ');
        const clientExports = [clientName, legacyClientName].filter(Boolean);
        return {
            path: `${packageRoot}/__init__.py`,
            content: this.format(`from .client import ${clientImports}
from .http_client import HttpClient, SdkConfig
from .models import *
from .api import *

__version__ = "${config.version}"

__all__ = [
${clientExports.map((entry) => `    '${entry}',`).join('\n')}
    'create_client',
    'HttpClient',
    'SdkConfig',
]
`),
            language: 'python',
            description: 'Package init',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
