import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { collectSchemaReferences, getSchemaReferenceName, pickComposedSchema, resolveModelSchema } from '../../framework/schema.js';
import { RUST_CONFIG, getRustType } from './config.js';
import { sanitizeRustRawIdentifier } from './identifiers.js';

export class ModelGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [this.generateCommonModels()];
    const knownModels = new Set<string>(
      Object.keys(ctx.schemas).map((schemaName) => RUST_CONFIG.namingConventions.modelName(schemaName))
    );
    const exports: string[] = [
      'pub mod common;',
      'pub use common::{BasePlusVo, Page, QueryListForm};',
    ];

    for (const [name, schema] of Object.entries(ctx.schemas)) {
      const fileName = RUST_CONFIG.namingConventions.fileName(name);
      const modelName = RUST_CONFIG.namingConventions.modelName(name);
      files.push(this.generateModel(name, schema, ctx.schemas, knownModels));
      exports.push(`pub mod ${fileName};`);
      exports.push(`pub use ${fileName}::${modelName};`);
    }

    files.push({
      path: 'src/models/mod.rs',
      content: this.format(exports.join('\n')),
      language: 'rust',
      description: `Model exports for ${config.name}`,
    });

    return files;
  }

  private generateCommonModels(): GeneratedFile {
    return {
      path: 'src/models/common.rs',
      content: this.format(`use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct BasePlusVo {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_by: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct QueryListForm {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keyword: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_time: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_time: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order_direction: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct Page<T> {
    #[serde(default)]
    pub content: Vec<T>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_size: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_pages: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_more: Option<bool>,
}`),
      language: 'rust',
      description: 'Common Rust models',
    };
  }

  private generateModel(
    name: string,
    schema: any,
    schemas: SchemaContext['schemas'],
    knownModels: Set<string>
  ): GeneratedFile {
    const modelSchema = resolveModelSchema(schema, schemas);
    const modelName = RUST_CONFIG.namingConventions.modelName(name);
    const fileName = RUST_CONFIG.namingConventions.fileName(name);
    const required = new Set<string>(Array.isArray(modelSchema?.required) ? modelSchema.required : []);
    const properties = modelSchema?.properties && typeof modelSchema.properties === 'object'
      ? Object.entries(modelSchema.properties)
      : [];
    const referencedModels = new Set<string>();
    for (const [, propSchema] of properties) {
      this.collectRenderedModelReferences(propSchema, knownModels, referencedModels);
    }
    referencedModels.delete(modelName);
    const modelImports = referencedModels.size > 0
      ? `use crate::models::{${Array.from(referencedModels).sort().join(', ')}};\n\n`
      : '';

    const fields = properties.length > 0
      ? properties.map(([propName, propSchema]) => this.generateField(propName, propSchema, required, modelName)).join('\n\n')
      : '    #[serde(flatten)]\n    pub additional_properties: std::collections::HashMap<String, serde_json::Value>,';

    const docComment = modelSchema?.description ? `/// ${String(modelSchema.description).trim()}\n` : '';
    return {
      path: `src/models/${fileName}.rs`,
      content: this.format(`use serde::{Deserialize, Serialize};

${modelImports}${docComment}#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct ${modelName} {
${fields}
}`),
      language: 'rust',
      description: `${modelName} Rust model`,
    };
  }

  private generateField(propName: string, propSchema: any, required: Set<string>, modelName: string): string {
    const normalizedName = sanitizeRustIdentifier(RUST_CONFIG.namingConventions.propertyName(propName) || 'value');
    const originalName = String(propName || '').trim();
    const baseFieldType = getRustType(propSchema, RUST_CONFIG);
    const fieldType = isDirectSelfReference(propSchema, modelName)
      ? `Box<${baseFieldType}>`
      : baseFieldType;
    const isRequired = required.has(propName);
    const renderedType = isRequired ? fieldType : `Option<${fieldType}>`;
    const attributes: string[] = [];

    if (normalizedName.replace(/^r#/, '') !== originalName) {
      attributes.push(`#[serde(rename = "${originalName}")]`);
    }
    if (!isRequired) {
      attributes.push('#[serde(default, skip_serializing_if = "Option::is_none")]');
    }

    const docComment = propSchema?.description
      ? `/// ${String(propSchema.description).trim()}`
      : '';

    return [docComment, ...attributes, `pub ${normalizedName}: ${renderedType},`]
      .filter(Boolean)
      .map((line) => `    ${line}`)
      .join('\n');
  }

  private format(content: string): string {
    return `${content.trim()}\n`;
  }

  private collectReferencedModels(
    schema: any,
    knownModels: Set<string>,
    refs: Set<string>
  ): void {
    collectSchemaReferences(schema, RUST_CONFIG.namingConventions.modelName, knownModels, refs);
  }

  private collectRenderedModelReferences(
    schema: any,
    knownModels: Set<string>,
    refs: Set<string>,
    visited: Set<any> = new Set<any>()
  ): void {
    if (!schema || typeof schema !== 'object') {
      return;
    }
    if (visited.has(schema)) {
      return;
    }
    visited.add(schema);

    if (schema.$ref) {
      const modelName = RUST_CONFIG.namingConventions.modelName(getSchemaReferenceName(schema.$ref));
      if (knownModels.has(modelName)) {
        refs.add(modelName);
      }
      return;
    }

    const composed = pickComposedSchema(schema);
    if (composed) {
      this.collectRenderedModelReferences(composed, knownModels, refs, visited);
      return;
    }

    if (schema.items) {
      this.collectRenderedModelReferences(schema.items, knownModels, refs, visited);
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      this.collectRenderedModelReferences(schema.additionalProperties, knownModels, refs, visited);
    }
  }
}

function sanitizeRustIdentifier(value: string): string {
  return sanitizeRustRawIdentifier(value);
}

function isDirectSelfReference(schema: any, modelName: string): boolean {
  if (!schema || typeof schema !== 'object') {
    return false;
  }
  if (schema.$ref) {
    return RUST_CONFIG.namingConventions.modelName(getSchemaReferenceName(schema.$ref)) === modelName;
  }

  const composed = pickComposedSchema(schema);
  if (composed) {
    return isDirectSelfReference(composed, modelName);
  }

  return false;
}
