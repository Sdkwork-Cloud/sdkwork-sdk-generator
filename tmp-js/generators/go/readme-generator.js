import { normalizeOperationId, resolveSimplifiedTagNames, stripTagPrefixFromOperationId } from '../../framework/naming.js';
import { buildLanguageReadmeTitle, buildMutuallyExclusiveAuthSection, buildPublishSection, resolveApiKeyHeaderPreview, } from '../../framework/readme.js';
import { resolveSdkClientName } from '../../framework/sdk-identity.js';
import { GO_CONFIG } from './config.js';
export class ReadmeGenerator {
    generate(ctx, config) {
        const clientName = resolveSdkClientName(config);
        const moduleName = config.packageName || `github.com/sdkwork/${config.sdkType}-sdk`;
        const tags = Object.keys(ctx.apiGroups);
        const resolvedTagNames = resolveSimplifiedTagNames(tags);
        const allGroups = Object.entries(ctx.apiGroups);
        const preferredModules = new Set(['tenant', 'user', 'app', 'auth', 'workspace']);
        const quickStartTag = tags.find((tag) => preferredModules.has((resolvedTagNames.get(tag) || tag).toLowerCase()))
            || allGroups[0]?.[0];
        const quickStartGroup = quickStartTag ? ctx.apiGroups[quickStartTag] : undefined;
        const quickStartOperation = this.selectQuickStartOperation(quickStartGroup?.operations || []);
        const quickStartResolvedTagName = quickStartTag
            ? (resolvedTagNames.get(quickStartTag) || quickStartTag)
            : 'Example';
        const quickStartModule = GO_CONFIG.namingConventions.modelName(GO_CONFIG.namingConventions.propertyName(quickStartResolvedTagName));
        const quickStartMethod = quickStartOperation
            ? this.generateOperationId(quickStartOperation.method, quickStartOperation.path, quickStartOperation, quickStartTag || '')
            : 'List';
        const modules = tags.map(tag => {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const propName = GO_CONFIG.namingConventions.propertyName(resolvedTagName);
            return `- \`client.${propName}\` - ${tag} API`;
        }).join('\n');
        const readmeTitle = buildLanguageReadmeTitle(config.name, 'Go');
        const authHeaderPreview = resolveApiKeyHeaderPreview(ctx.auth);
        const authSection = buildMutuallyExclusiveAuthSection({
            codeFence: 'go',
            modeAExample: `cfg := sdkhttp.NewDefaultConfig("${config.baseUrl}")
client := ${moduleName}.New${clientName}WithConfig(cfg)
client.SetApiKey("your-api-key")
// Sends: ${authHeaderPreview}`,
            modeBExample: `cfg := sdkhttp.NewDefaultConfig("${config.baseUrl}")
client := ${moduleName}.New${clientName}WithConfig(cfg)
client.SetAuthToken("your-auth-token")
client.SetAccessToken("your-access-token")
// Sends:
// Authorization: Bearer <authToken>
// Access-Token: <accessToken>`,
            apiKeyCall: 'SetApiKey(...)',
            authTokenCall: 'SetAuthToken(...)',
            accessTokenCall: 'SetAccessToken(...)',
        });
        const publishSection = buildPublishSection('go');
        const examples = this.generateExamples(ctx, config, clientName, moduleName, resolvedTagNames);
        return {
            path: 'README.md',
            content: this.format(`# ${readmeTitle}

${config.description || 'Professional Go SDK for SDKWork API.'}

## Installation

\`\`\`bash
go get ${moduleName}
\`\`\`

## Quick Start

\`\`\`go
package main

import (
    "fmt"
    "${moduleName}"
    sdkhttp "${moduleName}/http"
)

func main() {
    cfg := sdkhttp.NewDefaultConfig("${config.baseUrl}")
    client := ${moduleName}.New${clientName}WithConfig(cfg)
    client.SetApiKey("your-api-key")
    
    // Use the SDK
    result, err := client.${quickStartModule}.${quickStartMethod}()
    if err != nil {
        panic(err)
    }
    fmt.Println(result)
}
\`\`\`

${authSection}

## Configuration (Non-Auth)

\`\`\`go
cfg := sdkhttp.NewDefaultConfig("${config.baseUrl}")
client := ${moduleName}.New${clientName}WithConfig(cfg)

// Set custom headers
client.SetHeader("X-Custom-Header", "value")
\`\`\`

## API Modules

${modules}

## Usage Examples

${examples}

## Error Handling

\`\`\`go
result, err := client.${quickStartModule}.${quickStartMethod}()
if err != nil {
    // Handle error
    fmt.Println("Error:", err)
    return
}
\`\`\`

${publishSection}

## License

${config.license || 'MIT'}
`),
            language: 'go',
            description: 'SDK documentation',
        };
    }
    generateExamples(ctx, config, clientName, moduleName, resolvedTagNames) {
        const examples = [];
        for (const [tag, group] of Object.entries(ctx.apiGroups)) {
            const resolvedTagName = resolvedTagNames.get(tag) || tag;
            const propName = GO_CONFIG.namingConventions.propertyName(resolvedTagName);
            const operations = group.operations || [];
            if (operations.length > 0) {
                const op = operations[0];
                const methodName = this.generateOperationId(op.method, op.path, op, tag);
                examples.push(`### ${tag}

\`\`\`go
// ${op.summary || `${op.method.toUpperCase()} ${op.path}`}
result, err := client.${GO_CONFIG.namingConventions.modelName(propName)}.${methodName}()
if err != nil {
    panic(err)
}
fmt.Println(result)
\`\`\``);
            }
        }
        return examples.join('\n\n') || 'No examples available.';
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
    generateOperationId(method, path, op, tag) {
        if (op.operationId) {
            const normalized = normalizeOperationId(op.operationId);
            return GO_CONFIG.namingConventions.methodName(stripTagPrefixFromOperationId(normalized, tag));
        }
        const pathParts = path.split('/').filter(Boolean);
        const resource = pathParts[pathParts.length - 1]?.replace(/[{}]/g, '') || 'resource';
        const actionMap = {
            get: path.includes('{') ? 'Get' : 'List',
            post: 'Create',
            put: 'Update',
            patch: 'Patch',
            delete: 'Delete',
        };
        return `${actionMap[method] || GO_CONFIG.namingConventions.modelName(method)}${GO_CONFIG.namingConventions.modelName(resource)}`;
    }
    format(content) {
        return content.trim() + '\n';
    }
}
