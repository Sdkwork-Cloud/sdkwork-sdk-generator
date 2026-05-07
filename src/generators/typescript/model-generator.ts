import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { collectSchemaReferences, resolveModelSchema } from '../../framework/schema.js';
import { TYPESCRIPT_CONFIG, getTypeScriptType } from './config.js';
import { resolveTypeScriptCommonPackage } from '../../framework/common-package.js';
import { resolveTypeScriptConfigTypeName } from '../../framework/sdk-identity.js';

export class ModelGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const knownModels = new Set<string>(
      Object.keys(ctx.schemas).map((schemaName) => TYPESCRIPT_CONFIG.namingConventions.modelName(schemaName))
    );
    const modelNameToFile = new Map<string, string>(
      Object.keys(ctx.schemas).map((schemaName) => {
        const modelName = TYPESCRIPT_CONFIG.namingConventions.modelName(schemaName);
        const fileName = TYPESCRIPT_CONFIG.namingConventions.fileName(schemaName);
        return [modelName, fileName] as const;
      })
    );

    files.push(this.generateCommonTypes(config));
    
    for (const [name, schema] of Object.entries(ctx.schemas)) {
      files.push(this.generateModel(name, schema, ctx.schemas, knownModels, modelNameToFile));
    }
    
    files.push(this.generateModelIndex(ctx));
    return files;
  }

  private generateCommonTypes(config: GeneratorConfig): GeneratedFile {
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

  private generateModel(
    name: string,
    schema: any,
    schemas: SchemaContext['schemas'],
    knownModels: Set<string>,
    modelNameToFile: Map<string, string>
  ): GeneratedFile {
    const modelSchema = resolveModelSchema(schema, schemas);
    const props = modelSchema.properties || {};
    const required = modelSchema.required || [];
    const fileName = TYPESCRIPT_CONFIG.namingConventions.fileName(name);
    const modelName = TYPESCRIPT_CONFIG.namingConventions.modelName(name);
    const referencedModels = Array.from(collectSchemaReferences(
      modelSchema,
      TYPESCRIPT_CONFIG.namingConventions.modelName,
      knownModels
    ))
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
    
    const fields = Object.entries(props).map(([propName, propSchema]: [string, any]) => {
      const isRequired = required.includes(propName);
      const optional = isRequired ? '' : '?';
      const desc = propSchema.description ? `/** ${propSchema.description} */\n  ` : '';
      const type = getTypeScriptType(propSchema, TYPESCRIPT_CONFIG, knownModels);
      return `${desc}${this.toPropertyKey(propName)}${optional}: ${type};`;
    }).join('\n  ');

    const modelDeclaration = Object.keys(props).length > 0
      ? `${modelSchema.description ? `/** ${modelSchema.description} */\n` : ''}export interface ${modelName} {\n  ${fields}\n}`
      : `${modelSchema.description ? `/** ${modelSchema.description} */\n` : ''}export type ${modelName} = ${getTypeScriptType(modelSchema, TYPESCRIPT_CONFIG, knownModels)};`;
    const content = importBlock ? `${importBlock}\n\n${modelDeclaration}` : modelDeclaration;

    return {
      path: `src/types/${fileName}.ts`,
      content: this.format(content),
      language: 'typescript',
      description: `${modelName} model definition`,
    };
  }

  private toPropertyKey(name: string): string {
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      return name;
    }
    return `'${name.replace(/'/g, "\\'")}'`;
  }

  private generateModelIndex(ctx: SchemaContext): GeneratedFile {
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

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
