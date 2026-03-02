import { normalizeOperationId, resolveScopedMethodNames, stripTagPrefixFromOperationId } from '../../framework/naming.js';
import { buildMutuallyExclusiveAuthSection, resolveApiKeyHeaderPreview } from '../../framework/readme.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { TYPESCRIPT_CONFIG } from './config.js';
import { buildTypeScriptTagMetadataMap } from './tag-metadata.js';
export class ReadmeGenerator {
    generate(ctx, config) {
        const clientName = resolveSdkClientName(config);
        const pkgName = config.packageName || `@sdkwork/${config.sdkType}-sdk`;
        const tagMetadataMap = buildTypeScriptTagMetadataMap(Object.keys(ctx.apiGroups));
        const allGroups = Object.entries(ctx.apiGroups);
        const metadataEntries = Array.from(tagMetadataMap.entries());
        const preferredModules = ['tenant', 'user', 'app', 'auth', 'workspace'];
        const quickStartTag = this.selectQuickStartTag(ctx, metadataEntries, preferredModules) || allGroups[0]?.[0];
        const quickStartGroup = (quickStartTag ? ctx.apiGroups[quickStartTag] : undefined);
        const quickStartModule = quickStartTag
            ? (tagMetadataMap.get(quickStartTag)?.clientPropertyName || TYPESCRIPT_CONFIG.namingConventions.propertyName(quickStartTag))
            : 'example';
        const quickStartOperations = quickStartGroup?.operations || [];
        const firstOperation = this.selectQuickStartOperation(quickStartOperations);
        const quickStartMethodNames = this.resolveMethodNames(quickStartTag || '', quickStartOperations);
        const quickStartMethod = firstOperation
            ? (quickStartMethodNames.get(firstOperation)
                || this.generateOperationId(firstOperation.method, firstOperation.path, firstOperation, quickStartTag || ''))
            : 'list';
        const quickStartSnippet = firstOperation
            ? this.buildOperationCallSnippet(quickStartModule, quickStartMethod, firstOperation)
            : `const result = await client.${quickStartModule}.${quickStartMethod}();`;
        const quickStartSnippetInTry = this.indentSnippet(quickStartSnippet, 2);
        const modules = Object.keys(ctx.apiGroups).map(tag => {
            const propName = tagMetadataMap.get(tag)?.clientPropertyName || TYPESCRIPT_CONFIG.namingConventions.propertyName(tag);
            return `- \`client.${propName}\` - ${tag} API`;
        }).join('\n');
        const authHeaderPreview = resolveApiKeyHeaderPreview(ctx.auth);
        const authSection = buildMutuallyExclusiveAuthSection({
            codeFence: 'typescript',
            modeAExample: `const client = new ${clientName}({ baseUrl: '${config.baseUrl}' });
client.setApiKey('your-api-key');
// Sends: ${authHeaderPreview}`,
            modeBExample: `const client = new ${clientName}({ baseUrl: '${config.baseUrl}' });
client.setAuthToken('your-auth-token');
client.setAccessToken('your-access-token');
// Sends:
// Authorization: Bearer <authToken>
// Access-Token: <accessToken>`,
            apiKeyCall: 'setApiKey(...)',
            authTokenCall: 'setAuthToken(...)',
            accessTokenCall: 'setAccessToken(...)',
        });
        const examples = this.generateExamples(ctx, tagMetadataMap);
        return {
            path: 'README.md',
            content: this.format(`# ${config.name}

${config.description || 'Professional TypeScript SDK for SDKWork API.'}

## Installation

\`\`\`bash
npm install ${pkgName}
# or
yarn add ${pkgName}
# or
pnpm add ${pkgName}
\`\`\`

## Quick Start

\`\`\`typescript
import { ${clientName} } from '${pkgName}';

const client = new ${clientName}({
  baseUrl: '${config.baseUrl}',
  timeout: 30000,
});

// Mode A: API Key (recommended for server-to-server calls)
client.setApiKey('your-api-key');

// Use the SDK
${quickStartSnippet}
\`\`\`

${authSection}

## Configuration (Non-Auth)

\`\`\`typescript
import { ${clientName} } from '${pkgName}';

const client = new ${clientName}({
  baseUrl: '${config.baseUrl}',
  timeout: 30000, // Request timeout in ms
  headers: {      // Custom headers
    'X-Custom-Header': 'value',
  },
});
\`\`\`

## API Modules

${modules}

## Usage Examples

${examples}

## Error Handling

\`\`\`typescript
import { ${clientName}, NetworkError, TimeoutError, AuthenticationError } from '${pkgName}';

try {
${quickStartSnippetInTry}
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed:', error.message);
  } else if (error instanceof TimeoutError) {
    console.error('Request timed out:', error.message);
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
  } else {
    throw error;
  }
}
\`\`\`

## License

${config.license || 'MIT'}
`),
            language: 'typescript',
            description: 'SDK documentation',
        };
    }
    generateExamples(ctx, tagMetadataMap) {
        const examples = [];
        for (const [tag, group] of Object.entries(ctx.apiGroups)) {
            const propName = tagMetadataMap.get(tag)?.clientPropertyName
                || TYPESCRIPT_CONFIG.namingConventions.propertyName(tag);
            const operations = group.operations || [];
            if (operations.length > 0) {
                const op = this.selectQuickStartOperation(operations);
                if (!op) {
                    continue;
                }
                const methodNames = this.resolveMethodNames(tag, operations);
                const methodName = methodNames.get(op) || this.generateOperationId(op.method, op.path, op, tag);
                const callSnippet = this.buildOperationCallSnippet(propName, methodName, op);
                examples.push(`### ${tag}

\`\`\`typescript
// ${op.summary || `${op.method.toUpperCase()} ${op.path}`}
${callSnippet}
\`\`\``);
            }
        }
        return examples.join('\n\n') || 'No examples available.';
    }
    resolveMethodNames(tag, operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            return new Map();
        }
        return resolveScopedMethodNames(operations, (op) => this.generateOperationId(op.method, op.path, op, tag));
    }
    selectQuickStartTag(ctx, metadataEntries, preferredModules) {
        const candidates = metadataEntries
            .map(([tag, metadata]) => {
            const operations = (ctx.apiGroups[tag]?.operations || []);
            const selected = this.selectQuickStartOperation(operations);
            return {
                tag,
                preferredIndex: preferredModules.indexOf(metadata.clientPropertyName),
                score: selected ? this.estimateOperationComplexity(selected) : Number.POSITIVE_INFINITY,
            };
        })
            .filter((item) => Number.isFinite(item.score));
        if (candidates.length === 0) {
            return undefined;
        }
        candidates.sort((a, b) => {
            const aPreferred = a.preferredIndex >= 0;
            const bPreferred = b.preferredIndex >= 0;
            if (aPreferred !== bPreferred) {
                return aPreferred ? -1 : 1;
            }
            if (a.score !== b.score) {
                return a.score - b.score;
            }
            if (aPreferred && bPreferred && a.preferredIndex !== b.preferredIndex) {
                return a.preferredIndex - b.preferredIndex;
            }
            return a.tag.localeCompare(b.tag);
        });
        return candidates[0]?.tag;
    }
    selectQuickStartOperation(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            return undefined;
        }
        const ranked = operations
            .map((operation, index) => ({
            operation,
            index,
            score: this.estimateOperationComplexity(operation),
        }))
            .sort((a, b) => (a.score - b.score) || (a.index - b.index));
        return ranked[0]?.operation;
    }
    estimateOperationComplexity(op) {
        const method = String(op?.method || '').toLowerCase();
        const supportsRequestBody = method === 'post' || method === 'put' || method === 'patch';
        const pathParamCount = this.extractPathParams(op?.path || '').length;
        const requestBodyInfo = supportsRequestBody ? this.extractRequestBodyInfo(op) : undefined;
        const hasRequestBody = Boolean(requestBodyInfo);
        const requestBodyRequired = hasRequestBody && Boolean(op?.requestBody?.required);
        const allParameters = op?.allParameters || op?.parameters || [];
        const isQueryOrHeaderParam = (param) => (param?.in === 'query' || param?.in === 'header' || param?.in === 'cookie');
        const requiredParamCount = allParameters.filter((param) => isQueryOrHeaderParam(param) && param?.required).length;
        const optionalParamCount = allParameters.filter((param) => isQueryOrHeaderParam(param) && !param?.required).length;
        let score = 0;
        if (method && method !== 'get') {
            score += 10;
        }
        score += pathParamCount * 30;
        if (requestBodyRequired) {
            score += 20;
        }
        else if (hasRequestBody) {
            score += 8;
        }
        score += requiredParamCount * 12;
        score += optionalParamCount * 3;
        return score;
    }
    buildOperationCallSnippet(moduleName, methodName, op) {
        const setupLines = [];
        const args = [];
        const method = String(op?.method || '').toLowerCase();
        const supportsRequestBody = method === 'post' || method === 'put' || method === 'patch';
        const pathParams = this.extractPathParams(op?.path || '');
        for (let i = 0; i < pathParams.length; i += 1) {
            const rawName = pathParams[i];
            const cleanedName = rawName.replace(/[^a-zA-Z0-9_$]/g, '_');
            const variableName = /^[a-zA-Z_$]/.test(cleanedName) ? cleanedName : `pathParam${i + 1}`;
            const sampleValue = /id$/i.test(variableName) ? '1' : `'${variableName}'`;
            setupLines.push(`const ${variableName} = ${sampleValue};`);
            args.push(variableName);
        }
        const requestBodyInfo = supportsRequestBody ? this.extractRequestBodyInfo(op) : undefined;
        if (requestBodyInfo) {
            if (requestBodyInfo.mediaType.toLowerCase() === 'multipart/form-data') {
                setupLines.push('const body = new FormData();');
            }
            else {
                setupLines.push('const body = {} as any;');
            }
            args.push('body');
        }
        const allParameters = op?.allParameters || op?.parameters || [];
        const hasQueryParams = allParameters.some((param) => param?.in === 'query');
        const hasHeaderParams = allParameters.some((param) => param?.in === 'header' || param?.in === 'cookie');
        if (hasQueryParams) {
            setupLines.push('const params = {} as Record<string, any>;');
            args.push('params');
        }
        if (hasHeaderParams) {
            setupLines.push('const headers = {} as Record<string, string>;');
            args.push('headers');
        }
        const callLine = `const result = await client.${moduleName}.${methodName}(${args.join(', ')});`;
        return setupLines.length > 0 ? `${setupLines.join('\n')}\n${callLine}` : callLine;
    }
    extractPathParams(path) {
        const matches = path.match(/\{([^}]+)\}/g) || [];
        return matches.map((match) => match.replace(/[{}]/g, ''));
    }
    extractRequestBodyInfo(op) {
        const content = op?.requestBody?.content;
        if (!content || typeof content !== 'object') {
            return undefined;
        }
        const mediaType = this.pickRequestBodyMediaType(content);
        return mediaType ? { mediaType } : undefined;
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
        const jsonLike = mediaTypes.find((mediaType) => mediaType.toLowerCase().endsWith('+json'));
        return jsonLike || mediaTypes[0];
    }
    generateOperationId(method, path, op, tag) {
        if (op.operationId) {
            const normalized = normalizeOperationId(op.operationId);
            return TYPESCRIPT_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
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
        return `${actionMap[method] || method}${TYPESCRIPT_CONFIG.namingConventions.modelName(resource)}`;
    }
    indentSnippet(snippet, spaces) {
        const prefix = ' '.repeat(Math.max(0, spaces));
        return snippet
            .split('\n')
            .map((line) => (line ? `${prefix}${line}` : line))
            .join('\n');
    }
    format(content) {
        return content.trim() + '\n';
    }
}
