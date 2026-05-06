import type { GeneratedFile, SchemaContext } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { PYTHON_CONFIG, getPythonPackageRoot, getPythonType } from './config.js';

export class ModelGenerator {
  generate(ctx: SchemaContext, config: GeneratorConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const packageRoot = getPythonPackageRoot(config);
    const knownModels = new Set<string>(
      Object.keys(ctx.schemas).map((schemaName) => PYTHON_CONFIG.namingConventions.modelName(schemaName))
    );
    const modelNameToFile = new Map<string, string>(
      Object.keys(ctx.schemas).map((schemaName) => {
        const modelName = PYTHON_CONFIG.namingConventions.modelName(schemaName);
        const fileName = PYTHON_CONFIG.namingConventions.fileName(schemaName);
        return [modelName, fileName] as const;
      })
    );
    
    for (const [name, schema] of Object.entries(ctx.schemas)) {
      files.push(this.generateModel(name, schema, packageRoot, knownModels, modelNameToFile));
    }
    
    files.push(this.generateModelsIndex(ctx, packageRoot));
    return files;
  }

  private generateModel(
    name: string,
    schema: any,
    packageRoot: string,
    knownModels: Set<string>,
    modelNameToFile: Map<string, string>
  ): GeneratedFile {
    const modelName = PYTHON_CONFIG.namingConventions.modelName(name);
    const props = schema.properties || {};
    const required = schema.required || [];
    const referencedModels = Array.from(this.collectReferencedModels(schema, knownModels))
      .filter((refModel) => refModel !== modelName)
      .sort((a, b) => a.localeCompare(b));
    const importBlock = referencedModels.length > 0
      ? referencedModels
          .map((refModel) => {
            const refFile = modelNameToFile.get(refModel) ?? PYTHON_CONFIG.namingConventions.fileName(refModel);
            return `    from .${refFile} import ${refModel}`;
          })
          .join('\n')
      : '';

    const orderedEntries = [
      ...Object.entries(props).filter(([propName]) => required.includes(propName)),
      ...Object.entries(props).filter(([propName]) => !required.includes(propName)),
    ];

    const fields = orderedEntries.map(([propName, propSchema]: [string, any]) => {
      const isRequired = required.includes(propName);
      const pyType = getPythonType(propSchema, PYTHON_CONFIG);
      const fieldType = this.renderFieldType(pyType, propSchema, isRequired);
      const defaultValue = isRequired ? '' : ' = None';
      const pyName = PYTHON_CONFIG.namingConventions.propertyName(propName);
      return `    ${pyName}: ${fieldType}${defaultValue}`;
    }).join('\n');

    const docComment = schema.description 
      ? `    """${schema.description}"""\n` 
      : '';

    return {
      path: `${packageRoot}/models/${PYTHON_CONFIG.namingConventions.fileName(name)}.py`,
      content: this.format(`from __future__ import annotations
from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional, List, Dict, Any
${importBlock ? `\nif TYPE_CHECKING:\n${importBlock}\n` : ''}

@dataclass
class ${modelName}:
${docComment}${fields || '    pass'}
`),
      language: 'python',
      description: `${modelName} model`,
    };
  }

  private renderFieldType(pyType: string, schema: any, isRequired: boolean): string {
    if (isRequired && !this.isNullableSchema(schema)) {
      return pyType;
    }
    if (pyType === 'Any' || pyType.startsWith('Optional[')) {
      return pyType;
    }
    return `Optional[${pyType}]`;
  }

  private isNullableSchema(schema: any): boolean {
    if (!schema || typeof schema !== 'object') {
      return false;
    }
    if (schema.nullable === true) {
      return true;
    }
    if (Array.isArray(schema.type) && schema.type.includes('null')) {
      return true;
    }

    for (const key of ['oneOf', 'anyOf'] as const) {
      const values = schema[key];
      if (Array.isArray(values) && values.some((value: any) => this.isNullableSchema(value))) {
        return true;
      }
    }

    return false;
  }

  private collectReferencedModels(
    schema: any,
    knownModels: Set<string>,
    refs: Set<string> = new Set<string>(),
    visited: Set<any> = new Set<any>()
  ): Set<string> {
    if (!schema || typeof schema !== 'object') {
      return refs;
    }

    if (visited.has(schema)) {
      return refs;
    }
    visited.add(schema);

    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop();
      const modelName = PYTHON_CONFIG.namingConventions.modelName(refName ?? '');
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

  private generateModelsIndex(ctx: SchemaContext, packageRoot: string): GeneratedFile {
    const imports = Object.keys(ctx.schemas).map(name => {
      const modelName = PYTHON_CONFIG.namingConventions.modelName(name);
      const fileName = PYTHON_CONFIG.namingConventions.fileName(name);
      return `from .${fileName} import ${modelName}`;
    }).join('\n');

    const exports = Object.keys(ctx.schemas).map(name => {
      return PYTHON_CONFIG.namingConventions.modelName(name);
    }).map(v => `'${v}'`).join(', ');

    return {
      path: `${packageRoot}/models/__init__.py`,
      content: this.format(`from typing import List, Dict, Any

${imports}

__all__ = [${exports}]
`),
      language: 'python',
      description: 'Models index',
    };
  }

  private format(content: string): string {
    return content.trim() + '\n';
  }
}
