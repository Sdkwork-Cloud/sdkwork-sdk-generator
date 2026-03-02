import { TYPESCRIPT_CONFIG, getTypeScriptType } from './config.js';
import { resolveTypeScriptCommonPackage } from '../../framework/common-package.js';
import { resolveTypeScriptConfigTypeName } from '../../framework/sdk-identity.js';
export class ModelGenerator {
    generate(ctx, config) {
        const files = [];
        const knownModels = new Set(Object.keys(ctx.schemas).map((schemaName) => TYPESCRIPT_CONFIG.namingConventions.modelName(schemaName)));
        const modelNameToFile = new Map(Object.keys(ctx.schemas).map((schemaName) => {
            const modelName = TYPESCRIPT_CONFIG.namingConventions.modelName(schemaName);
            const fileName = TYPESCRIPT_CONFIG.namingConventions.fileName(schemaName);
            return [modelName, fileName];
        }));
        files.push(this.generateCommonTypes(config));
        for (const [name, schema] of Object.entries(ctx.schemas)) {
            files.push(this.generateModel(name, schema, knownModels, modelNameToFile));
        }
        files.push(this.generateModelIndex(ctx));
        return files;
    }
    generateCommonTypes(config) {
        const configName = resolveTypeScriptConfigTypeName(config);
        const commonPkg = resolveTypeScriptCommonPackage(config);
        return {
            path: 'src/types/common.ts',
            content: this.format(`export interface BasePlusVO {
  id?: string | number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface BasePlusEntity extends BasePlusVO {
  deleted?: boolean;
}

export interface QueryListForm {
  keyword?: string;
  status?: string | number;
  startTime?: string;
  endTime?: string;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export type { Page, PageResult, RequestConfig, RequestOptions, QueryParams } from '${commonPkg.importPath}';
export { DEFAULT_TIMEOUT, SUCCESS_CODES } from '${commonPkg.importPath}';
import type { AuthTokenManager, AuthMode, AuthTokens } from '${commonPkg.importPath}';
export type { AuthTokenManager, AuthMode, AuthTokens };

export interface ${configName} {
  baseUrl: string;
  apiKey?: string;
  authToken?: string;
  accessToken?: string;
  tenantId?: string;
  organizationId?: string;
  platform?: string;
  tokenManager?: AuthTokenManager;
  timeout?: number;
  authMode?: AuthMode;
  headers?: Record<string, string>;
}
`),
            language: 'typescript',
            description: 'Common type definitions',
        };
    }
    generateModel(name, schema, knownModels, modelNameToFile) {
        const props = schema.properties || {};
        const required = schema.required || [];
        const fileName = TYPESCRIPT_CONFIG.namingConventions.fileName(name);
        const modelName = TYPESCRIPT_CONFIG.namingConventions.modelName(name);
        const referencedModels = Array.from(this.collectReferencedModels(schema, knownModels))
            .filter((refModel) => refModel !== modelName)
            .sort((a, b) => a.localeCompare(b));
        const importBlock = referencedModels.length > 0
            ? referencedModels
                .map((refModel) => {
                const refFile = modelNameToFile.get(refModel) ?? TYPESCRIPT_CONFIG.namingConventions.fileName(refModel);
                return `import type { ${refModel} } from './${refFile}';`;
            })
                .join('\n')
            : '';
        const fields = Object.entries(props).map(([propName, propSchema]) => {
            const isRequired = required.includes(propName);
            const optional = isRequired ? '' : '?';
            const desc = propSchema.description ? `/** ${propSchema.description} */\n  ` : '';
            const type = getTypeScriptType(propSchema, TYPESCRIPT_CONFIG, knownModels);
            return `${desc}${this.toPropertyKey(propName)}${optional}: ${type};`;
        }).join('\n  ');
        const modelDeclaration = Object.keys(props).length > 0
            ? `${schema.description ? `/** ${schema.description} */\n` : ''}export interface ${modelName} {\n  ${fields}\n}`
            : `${schema.description ? `/** ${schema.description} */\n` : ''}export type ${modelName} = ${getTypeScriptType(schema, TYPESCRIPT_CONFIG, knownModels)};`;
        const content = importBlock ? `${importBlock}\n\n${modelDeclaration}` : modelDeclaration;
        return {
            path: `src/types/${fileName}.ts`,
            content: this.format(content),
            language: 'typescript',
            description: `${modelName} model definition`,
        };
    }
    toPropertyKey(name) {
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
            return name;
        }
        return `'${name.replace(/'/g, "\\'")}'`;
    }
    collectReferencedModels(schema, knownModels, refs = new Set(), visited = new Set()) {
        if (!schema || typeof schema !== 'object') {
            return refs;
        }
        if (visited.has(schema)) {
            return refs;
        }
        visited.add(schema);
        if (schema.$ref) {
            const refName = schema.$ref.split('/').pop();
            const modelName = TYPESCRIPT_CONFIG.namingConventions.modelName(refName ?? '');
            if (knownModels.has(modelName)) {
                refs.add(modelName);
            }
            return refs;
        }
        for (const key of ['oneOf', 'anyOf', 'allOf']) {
            const candidates = schema[key];
            if (Array.isArray(candidates)) {
                for (const candidate of candidates) {
                    this.collectReferencedModels(candidate, knownModels, refs, visited);
                }
            }
        }
        if (schema.items) {
            this.collectReferencedModels(schema.items, knownModels, refs, visited);
        }
        if (schema.properties && typeof schema.properties === 'object') {
            for (const propSchema of Object.values(schema.properties)) {
                this.collectReferencedModels(propSchema, knownModels, refs, visited);
            }
        }
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            this.collectReferencedModels(schema.additionalProperties, knownModels, refs, visited);
        }
        if (schema.not) {
            this.collectReferencedModels(schema.not, knownModels, refs, visited);
        }
        return refs;
    }
    generateModelIndex(ctx) {
        const exports = Object.keys(ctx.schemas).map(name => {
            const modelName = TYPESCRIPT_CONFIG.namingConventions.modelName(name);
            const fileName = TYPESCRIPT_CONFIG.namingConventions.fileName(name);
            return `export type { ${modelName} } from './${fileName}';`;
        }).join('\n');
        return {
            path: 'src/types/index.ts',
            content: this.format(`export * from './common';
${exports}
`),
            language: 'typescript',
            description: 'Type exports',
        };
    }
    format(content) {
        return content.trim() + '\n';
    }
}
