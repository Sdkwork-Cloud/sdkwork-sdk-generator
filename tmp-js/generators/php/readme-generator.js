import { buildLanguageReadmeTitle, buildMutuallyExclusiveAuthSection, buildPublishSection, resolveApiKeyHeaderPreview, } from '../../framework/readme.js';
import { normalizeOperationId, resolveSimplifiedTagNames, stripTagPrefixFromOperationId } from '../../framework/naming.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { PHP_CONFIG, getPhpNamespace, getPhpPackageName } from './config.js';
export class ReadmeGenerator {
    generate(ctx, config) {
        const clientName = resolveSdkClientName(config);
        const packageName = getPhpPackageName(config);
        const namespace = getPhpNamespace(config);
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const preferredModules = new Set(['tenant', 'user', 'app', 'auth', 'workspace']);
        const quickStartTag = tags.find((tag) => preferredModules.has((resolvedTagNames.get(tag) || tag).toLowerCase()))
            || tags[0];
        const quickStartGroup = quickStartTag ? ctx.apiGroups[quickStartTag] : undefined;
        const quickStartOperation = this.selectQuickStartOperation(quickStartGroup?.operations || []);
        const quickStartModule = quickStartTag
            ? PHP_CONFIG.namingConventions.propertyName(resolvedTagNames.get(quickStartTag) || quickStartTag)
            : 'example';
        const quickStartMethod = quickStartOperation
            ? this.generateReadmeOperationId(quickStartOperation.method, quickStartOperation.path, quickStartOperation, quickStartTag || '')
            : 'list';
        const modules = tags.map((tag) => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const propName = PHP_CONFIG.namingConventions.propertyName(resolvedTagName);
            return `- \`$client->${propName}\` - ${tag} API`;
        }).join('\n');
        const authHeaderPreview = resolveApiKeyHeaderPreview(ctx.auth);
        const authSection = buildMutuallyExclusiveAuthSection({
            codeFence: 'php',
            modeAExample: `$config = new SdkConfig(baseUrl: "${config.baseUrl}");
$client = new ${clientName}($config);
$client->setApiKey('your-api-key');
// Sends: ${authHeaderPreview}`,
            modeBExample: `$config = new SdkConfig(baseUrl: "${config.baseUrl}");
$client = new ${clientName}($config);
$client->setAuthToken('your-auth-token');
$client->setAccessToken('your-access-token');
// Sends:
// Authorization: Bearer <authToken>
// Access-Token: <accessToken>`,
            apiKeyCall: 'setApiKey(...)',
            authTokenCall: 'setAuthToken(...)',
            accessTokenCall: 'setAccessToken(...)',
        });
        const publishSection = buildPublishSection('php');
        const readmeTitle = buildLanguageReadmeTitle(config.name, 'PHP');
        return {
            path: 'README.md',
            content: this.format(`# ${readmeTitle}

${config.description || 'Professional PHP SDK for SDKWork API.'}

## Installation

\`\`\`bash
composer require ${packageName}
\`\`\`

## Quick Start

\`\`\`php
<?php

use ${namespace}\\${clientName};
use ${namespace}\\SdkConfig;

$config = new SdkConfig(baseUrl: '${config.baseUrl}');
$client = new ${clientName}($config);
$client->setApiKey('your-api-key');

$result = $client->${quickStartModule}->${quickStartMethod}();
\`\`\`

${authSection}

## API Modules

${modules}

${publishSection}

## License

${config.license || 'MIT'}
`),
            language: 'php',
            description: 'SDK documentation',
        };
    }
    selectQuickStartOperation(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            return undefined;
        }
        const getWithoutPathParam = operations.find((op) => op?.method === 'get' && typeof op?.path === 'string' && !op.path.includes('{'));
        if (getWithoutPathParam) {
            return getWithoutPathParam;
        }
        return operations[0];
    }
    generateReadmeOperationId(method, path, op, tag) {
        if (op.operationId) {
            const normalized = normalizeOperationId(op.operationId);
            return PHP_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
        }
        const pathParts = path.split('/').filter(Boolean);
        const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
        const actionMap = {
            get: path.includes('{') ? 'get' : 'list',
            post: 'create',
            put: 'update',
            patch: 'patch',
            delete: 'delete',
        };
        return PHP_CONFIG.namingConventions.methodName(`${actionMap[method] || method}_${resource}`);
    }
    format(content) {
        return `${content.trim()}\n`;
    }
}
