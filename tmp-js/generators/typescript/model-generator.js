import { collectSchemaReferences, resolveModelSchema } from '../../framework/schema.js';
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
            files.push(this.generateModel(name, schema, ctx.schemas, knownModels, modelNameToFile));
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
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface BasePlusEntity extends BasePlusVO {
  deleted?: boolean;
}

export interface QueryListForm {
  q?: string;
  status?: string | number;
  startTime?: string;
  endTime?: string;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export type { Page, RequestConfig, RequestOptions, QueryParams } from '${commonPkg.importPath}';
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
    generateModel(name, schema, schemas, knownModels, modelNameToFile) {
        const modelSchema = resolveModelSchema(schema, schemas);
        const props = modelSchema.properties || {};
        const required = modelSchema.required || [];
        const fileName = TYPESCRIPT_CONFIG.namingConventions.fileName(name);
        const modelName = TYPESCRIPT_CONFIG.namingConventions.modelName(name);
        const referencedModels = Array.from(collectSchemaReferences(modelSchema, TYPESCRIPT_CONFIG.namingConventions.modelName, knownModels))
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
        const modelDeclaration = this.renderModelDeclaration(modelName, modelSchema, props, fields, knownModels, schemas);
        const content = importBlock ? `${importBlock}\n\n${modelDeclaration}` : modelDeclaration;
        return {
            path: `src/types/${fileName}.ts`,
            content: this.format(content),
            language: 'typescript',
            description: `${modelName} model definition`,
        };
    }
    renderModelDeclaration(modelName, modelSchema, props, fields, knownModels, schemas) {
        const description = modelSchema.description ? `/** ${modelSchema.description} */\n` : '';
        if (Object.keys(props).length > 0) {
            return `${description}export interface ${modelName} {\n  ${fields}\n}`;
        }
        if (this.isClosedEmptyObjectSchema(modelSchema)) {
            return `${description}export interface ${modelName} {}`;
        }
        if (modelSchema.additionalProperties && this.needsRecursiveIndexSignature(modelName, modelSchema, knownModels, schemas)) {
            const valueType = modelSchema.additionalProperties === true
                ? 'unknown'
                : getTypeScriptType(modelSchema.additionalProperties, TYPESCRIPT_CONFIG, knownModels);
            return `${description}export interface ${modelName} {\n  [key: string]: ${valueType};\n}`;
        }
        return `${description}export type ${modelName} = ${getTypeScriptType(modelSchema, TYPESCRIPT_CONFIG, knownModels)};`;
    }
    isClosedEmptyObjectSchema(modelSchema) {
        if (!modelSchema || typeof modelSchema !== 'object') {
            return false;
        }
        const hasNoProperties = !modelSchema.properties || Object.keys(modelSchema.properties).length === 0;
        return modelSchema.type === 'object' && hasNoProperties && modelSchema.additionalProperties === false;
    }
    needsRecursiveIndexSignature(modelName, modelSchema, knownModels, schemas) {
        if (!modelSchema.additionalProperties || typeof modelSchema.additionalProperties !== 'object') {
            return false;
        }
        return this.schemaReferencesModel(modelSchema.additionalProperties, modelName, knownModels, schemas, new Set());
    }
    schemaReferencesModel(schema, modelName, knownModels, schemas, visitedModels) {
        const refs = collectSchemaReferences(schema, TYPESCRIPT_CONFIG.namingConventions.modelName, knownModels);
        if (refs.has(modelName)) {
            return true;
        }
        for (const refModel of refs) {
            if (visitedModels.has(refModel)) {
                continue;
            }
            visitedModels.add(refModel);
            const refSchema = this.schemaForModelName(refModel, schemas);
            if (refSchema && this.schemaReferencesModel(refSchema, modelName, knownModels, schemas, visitedModels)) {
                return true;
            }
        }
        return false;
    }
    schemaForModelName(modelName, schemas) {
        for (const [schemaName, schema] of Object.entries(schemas)) {
            if (TYPESCRIPT_CONFIG.namingConventions.modelName(schemaName) === modelName) {
                return schema;
            }
        }
        return undefined;
    }
    toPropertyKey(name) {
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
            return name;
        }
        return `'${name.replace(/'/g, "\\'")}'`;
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
