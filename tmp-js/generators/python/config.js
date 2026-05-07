import { getConstSchemaInfo, getTupleSchemaInfo, pickComposedSchema, resolveSchemaType } from '../../framework/schema.js';
export const PYTHON_CONFIG = {
    language: 'python',
    displayName: 'Python',
    description: 'Generate Python SDK with type hints and requests library',
    fileExtension: '.py',
    supportsTests: true,
    supportsStrictTypes: true,
    supportsAsyncAwait: true,
    defaultIndent: '    ',
    lineEnding: '\n',
    typeMapping: {
        string: 'str',
        number: 'float',
        integer: 'int',
        boolean: 'bool',
        array: 'List[Any]',
        object: 'Dict[str, Any]',
        date: 'str',
        datetime: 'str',
        uuid: 'str',
        email: 'str',
        url: 'str',
    },
    namingConventions: {
        modelName: (name) => toPascalCase(name),
        propertyName: (name) => toPythonIdentifier(name),
        methodName: (name) => toPythonIdentifier(name),
        fileName: (name) => toPythonIdentifier(name),
        packageName: (name) => toPythonIdentifier(name),
    },
};
const PYTHON_RESERVED_WORDS = new Set([
    'false',
    'none',
    'true',
    'and',
    'as',
    'assert',
    'async',
    'await',
    'break',
    'case',
    'class',
    'continue',
    'def',
    'del',
    'elif',
    'else',
    'except',
    'finally',
    'for',
    'from',
    'global',
    'if',
    'import',
    'in',
    'is',
    'lambda',
    'match',
    'nonlocal',
    'not',
    'or',
    'pass',
    'raise',
    'return',
    'try',
    'while',
    'with',
    'yield',
]);
function toPascalCase(str) {
    return str.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/^(.)/, c => c.toUpperCase());
}
function toSnakeCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[-\s]/g, '_').toLowerCase();
}
function toPythonIdentifier(str) {
    const snakeCase = toSnakeCase(str)
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (!snakeCase) {
        return 'value';
    }
    const prefixed = /^\d/.test(snakeCase) ? `_${snakeCase}` : snakeCase;
    return PYTHON_RESERVED_WORDS.has(prefixed) ? `${prefixed}_` : prefixed;
}
export function getPythonType(schema, config) {
    if (!schema || typeof schema !== 'object') {
        return 'Any';
    }
    if (schema.$ref) {
        const refName = schema.$ref.split('/').pop();
        return config.namingConventions.modelName(refName);
    }
    const composed = pickComposedSchema(schema);
    if (composed) {
        return getPythonType(composed, config);
    }
    const constInfo = getConstSchemaInfo(schema);
    if (constInfo) {
        return renderPythonConstType(constInfo.value);
    }
    const type = resolveSchemaType(schema).effectiveType;
    const format = schema.format;
    if (type === 'string') {
        return 'str';
    }
    if (type === 'number') {
        return 'float';
    }
    if (type === 'integer') {
        return 'int';
    }
    if (type === 'boolean') {
        return 'bool';
    }
    if (type === 'array') {
        const tupleInfo = getTupleSchemaInfo(schema);
        if (tupleInfo) {
            const prefixTypes = tupleInfo.prefixItems.map((itemSchema) => getPythonType(itemSchema, config));
            if (tupleInfo.fixedLength) {
                return `Tuple[${prefixTypes.join(', ')}]`;
            }
            const additionalType = tupleInfo.additionalItems === true
                ? 'Any'
                : tupleInfo.additionalItems
                    ? getPythonType(tupleInfo.additionalItems, config)
                    : 'Any';
            return `Tuple[${[...prefixTypes, `...${additionalType}`].join(', ')}]`;
        }
        const itemType = schema.items && typeof schema.items === 'object' ? getPythonType(schema.items, config) : 'Any';
        return `List[${itemType}]`;
    }
    if (type === 'object') {
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const valueType = getPythonType(schema.additionalProperties, config);
            return `Dict[str, ${valueType}]`;
        }
        if (schema.additionalProperties === true) {
            return 'Dict[str, Any]';
        }
        return 'Dict[str, Any]';
    }
    return 'Any';
}
function renderPythonConstType(value) {
    if (value === null) {
        return 'Any';
    }
    if (typeof value === 'string') {
        return `Literal['${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`;
    }
    if (typeof value === 'boolean') {
        return `Literal[${value ? 'True' : 'False'}]`;
    }
    return `Literal[${value}]`;
}
export function getPythonPackageRoot(config) {
    const distributionName = config.packageName || `sdkwork-${config.sdkType}-sdk`;
    const packageRoot = distributionName
        .replace(/[@/.-]+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
    if (!packageRoot) {
        return 'sdkwork_sdk';
    }
    const normalizedRoot = /^\d/.test(packageRoot) ? `sdk_${packageRoot}` : packageRoot;
    return PYTHON_RESERVED_WORDS.has(normalizedRoot) ? `${normalizedRoot}_` : normalizedRoot;
}
