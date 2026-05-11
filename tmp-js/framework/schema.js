export function normalizeSchemaTypeValue(type) {
    if (typeof type === 'string') {
        const normalized = type.trim();
        if (!normalized) {
            return { type: undefined, types: [], nullable: false };
        }
        if (normalized === 'null') {
            return { type: undefined, types: [], nullable: true };
        }
        return {
            type: normalized,
            types: [normalized],
            nullable: false,
        };
    }
    if (Array.isArray(type)) {
        const seen = new Set();
        let nullable = false;
        for (const entry of type) {
            if (typeof entry !== 'string') {
                continue;
            }
            const normalized = entry.trim();
            if (!normalized) {
                continue;
            }
            if (normalized === 'null') {
                nullable = true;
                continue;
            }
            seen.add(normalized);
        }
        const types = Array.from(seen);
        return {
            type: types[0],
            types,
            nullable,
        };
    }
    return { type: undefined, types: [], nullable: false };
}
export function inferImplicitSchemaType(schema) {
    if (!schema || typeof schema !== 'object') {
        return undefined;
    }
    const constInfo = getConstSchemaInfo(schema);
    if (constInfo && constInfo.type !== 'null') {
        return constInfo.type;
    }
    if (schema.properties && typeof schema.properties === 'object') {
        return 'object';
    }
    if (schema.additionalProperties !== undefined) {
        return 'object';
    }
    if (Array.isArray(schema.prefixItems) || schema.items) {
        return 'array';
    }
    return undefined;
}
export function resolveSchemaType(schema) {
    const normalized = normalizeSchemaTypeValue(schema?.type);
    const constInfo = getConstSchemaInfo(schema);
    const nullable = Boolean(schema?.nullable) || normalized.nullable || constInfo?.type === 'null';
    const effectiveType = normalized.type || inferImplicitSchemaType(schema);
    return {
        type: normalized.type,
        effectiveType,
        types: normalized.types,
        nullable,
    };
}
export function getConstSchemaInfo(schema) {
    if (!schema || typeof schema !== 'object' || !Object.prototype.hasOwnProperty.call(schema, 'const')) {
        return undefined;
    }
    const value = schema.const;
    if (value === null) {
        return { value, type: 'null' };
    }
    if (typeof value === 'string') {
        return { value, type: 'string' };
    }
    if (typeof value === 'boolean') {
        return { value, type: 'boolean' };
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return { value, type: Number.isInteger(value) ? 'integer' : 'number' };
    }
    return undefined;
}
export function isNullSchema(schema) {
    if (!schema || typeof schema !== 'object') {
        return false;
    }
    const normalized = normalizeSchemaTypeValue(schema.type);
    return normalized.nullable && normalized.types.length === 0;
}
export function pickComposedSchema(schema) {
    if (!schema || typeof schema !== 'object') {
        return undefined;
    }
    const orderedKeys = ['allOf', 'oneOf', 'anyOf'];
    for (const key of orderedKeys) {
        const values = schema[key];
        if (!Array.isArray(values) || values.length === 0) {
            continue;
        }
        const candidate = values.find((entry) => entry && typeof entry === 'object' && !isNullSchema(entry));
        return candidate || values[0];
    }
    return undefined;
}
export function resolveMediaTypeSchema(mediaTypeObject) {
    if (!mediaTypeObject || typeof mediaTypeObject !== 'object') {
        return undefined;
    }
    const media = mediaTypeObject;
    if (media.schema) {
        return media.schema;
    }
    if (media.itemSchema) {
        return {
            type: 'array',
            items: media.itemSchema,
        };
    }
    return undefined;
}
export function getTupleSchemaInfo(schema) {
    if (!schema || typeof schema !== 'object' || !Array.isArray(schema.prefixItems) || schema.prefixItems.length === 0) {
        return undefined;
    }
    const additionalItems = schema.items === undefined ? true : schema.items;
    return {
        prefixItems: schema.prefixItems,
        additionalItems,
        fixedLength: additionalItems === false
            || (typeof schema.maxItems === 'number' && schema.maxItems <= schema.prefixItems.length),
    };
}
export function isTupleSchema(schema) {
    return Boolean(getTupleSchemaInfo(schema));
}
export function getArrayItemSchema(schema) {
    if (!schema || typeof schema !== 'object' || !schema.items || typeof schema.items !== 'object') {
        return undefined;
    }
    return schema.items;
}
export function collectSchemaReferences(schema, naming, knownModels, refs = new Set(), visited = new Set()) {
    if (!schema || typeof schema !== 'object') {
        return refs;
    }
    if (visited.has(schema)) {
        return refs;
    }
    visited.add(schema);
    if (schema.$ref) {
        const refName = getSchemaReferenceName(schema.$ref);
        const modelName = naming(refName);
        if (!knownModels || knownModels.has(modelName)) {
            refs.add(modelName);
        }
        return refs;
    }
    for (const key of ['oneOf', 'anyOf', 'allOf']) {
        const candidates = schema[key];
        if (Array.isArray(candidates)) {
            for (const candidate of candidates) {
                collectSchemaReferences(candidate, naming, knownModels, refs, visited);
            }
        }
    }
    if (Array.isArray(schema.prefixItems)) {
        for (const itemSchema of schema.prefixItems) {
            collectSchemaReferences(itemSchema, naming, knownModels, refs, visited);
        }
    }
    if (schema.items && typeof schema.items === 'object') {
        collectSchemaReferences(schema.items, naming, knownModels, refs, visited);
    }
    if (schema.properties && typeof schema.properties === 'object') {
        for (const propSchema of Object.values(schema.properties)) {
            collectSchemaReferences(propSchema, naming, knownModels, refs, visited);
        }
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        collectSchemaReferences(schema.additionalProperties, naming, knownModels, refs, visited);
    }
    if (schema.not && typeof schema.not === 'object') {
        collectSchemaReferences(schema.not, naming, knownModels, refs, visited);
    }
    return refs;
}
export function parseLocalJsonPointerRef(ref) {
    if (!ref) {
        return undefined;
    }
    if (ref === '#') {
        return [];
    }
    if (!ref.startsWith('#/')) {
        return undefined;
    }
    return ref
        .slice(2)
        .split('/')
        .map(decodeJsonPointerSegment);
}
export function getSchemaReferenceName(ref) {
    const segments = parseLocalJsonPointerRef(ref);
    if (segments && segments.length > 0) {
        return segments[segments.length - 1] || '';
    }
    if (!ref) {
        return '';
    }
    const normalizedRef = String(ref);
    const slashIndex = normalizedRef.lastIndexOf('/');
    const lastSegment = slashIndex >= 0 ? normalizedRef.slice(slashIndex + 1) : normalizedRef;
    return decodeJsonPointerSegment(lastSegment);
}
export function toLocalJsonPointerRef(segments) {
    if (segments.length === 0) {
        return '#';
    }
    return `#/${segments.map(encodeJsonPointerSegment).join('/')}`;
}
export function canonicalizeLocalJsonPointerRef(ref) {
    const segments = parseLocalJsonPointerRef(ref);
    return segments ? toLocalJsonPointerRef(segments) : undefined;
}
export function resolveLocalJsonPointerReference(ref, documentRoot) {
    const segments = parseLocalJsonPointerRef(ref);
    if (!segments) {
        return undefined;
    }
    let current = documentRoot;
    for (const segment of segments) {
        if (!current || typeof current !== 'object' || !(segment in current)) {
            return undefined;
        }
        current = current[segment];
    }
    return current;
}
export function resolveSchemaReference(ref, schemas = {}, documentRoot) {
    const root = documentRoot ?? {
        components: {
            schemas,
        },
    };
    const current = resolveLocalJsonPointerReference(ref, root);
    return current && typeof current === 'object' ? current : undefined;
}
export function resolveModelSchema(schema, schemas = {}, documentRoot) {
    return resolveModelSchemaInternal(schema, schemas, new Set(), documentRoot);
}
function resolveModelSchemaInternal(schema, schemas, visitedRefs, documentRoot) {
    if (!schema || typeof schema !== 'object') {
        return {};
    }
    if (schema.$ref) {
        const referencedSchema = resolveSchemaReference(schema.$ref, schemas, documentRoot);
        if (!referencedSchema || visitedRefs.has(schema.$ref)) {
            return { ...schema };
        }
        visitedRefs.add(schema.$ref);
        const resolvedReference = resolveModelSchemaInternal(referencedSchema, schemas, visitedRefs, documentRoot);
        visitedRefs.delete(schema.$ref);
        const siblingSchema = omitSchemaKeys(schema, ['$ref']);
        if (!hasSchemaContent(siblingSchema)) {
            return { ...resolvedReference };
        }
        return mergeAllOfSchema({ ...siblingSchema, allOf: [resolvedReference, siblingSchema] }, schemas, visitedRefs, documentRoot);
    }
    if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
        return mergeAllOfSchema(schema, schemas, visitedRefs, documentRoot);
    }
    return { ...schema };
}
function mergeAllOfSchema(schema, schemas, visitedRefs, documentRoot) {
    const baseSchema = omitSchemaKeys(schema, ['allOf']);
    const mergedProperties = {};
    const required = new Set(Array.isArray(baseSchema.required) ? baseSchema.required : []);
    const nonNullBranches = [];
    let hasObjectShape = hasObjectSchemaShape(baseSchema);
    for (const branch of schema.allOf ?? []) {
        if (!branch || typeof branch !== 'object' || isNullSchema(branch)) {
            continue;
        }
        const resolvedBranch = resolveModelSchemaInternal(branch, schemas, visitedRefs, documentRoot);
        if (isNullSchema(resolvedBranch)) {
            continue;
        }
        nonNullBranches.push(resolvedBranch);
        hasObjectShape = hasObjectShape || hasObjectSchemaShape(resolvedBranch);
        if (Array.isArray(resolvedBranch.required)) {
            for (const propName of resolvedBranch.required) {
                required.add(propName);
            }
        }
        if (resolvedBranch.properties && typeof resolvedBranch.properties === 'object') {
            mergeProperties(mergedProperties, resolvedBranch.properties, schemas, visitedRefs, documentRoot);
        }
        if (baseSchema.additionalProperties === undefined &&
            resolvedBranch.additionalProperties !== undefined &&
            mergedProperties.additionalProperties === undefined) {
            baseSchema.additionalProperties = resolvedBranch.additionalProperties;
        }
    }
    if (baseSchema.properties && typeof baseSchema.properties === 'object') {
        mergeProperties(mergedProperties, baseSchema.properties, schemas, visitedRefs, documentRoot);
        hasObjectShape = true;
    }
    if (!hasObjectShape && nonNullBranches.length === 1) {
        return {
            ...nonNullBranches[0],
            ...baseSchema,
        };
    }
    if (!hasObjectShape) {
        return { ...schema };
    }
    const normalizedBaseType = normalizeSchemaTypeValue(baseSchema.type);
    const result = {
        ...baseSchema,
        type: normalizedBaseType.type ?? 'object',
        properties: mergedProperties,
    };
    if (required.size > 0) {
        result.required = Array.from(required);
    }
    else {
        delete result.required;
    }
    if (Object.keys(mergedProperties).length === 0) {
        delete result.properties;
    }
    return result;
}
function mergeProperties(target, source, schemas, visitedRefs, documentRoot) {
    for (const [propName, propSchema] of Object.entries(source)) {
        if (!target[propName]) {
            target[propName] = propSchema;
            continue;
        }
        target[propName] = mergeDuplicatePropertySchema(target[propName], propSchema, schemas, visitedRefs, documentRoot);
    }
}
function mergeDuplicatePropertySchema(existing, next, schemas, visitedRefs, documentRoot) {
    if (JSON.stringify(existing) === JSON.stringify(next)) {
        return existing;
    }
    const resolvedExisting = resolveModelSchemaInternal(existing, schemas, visitedRefs, documentRoot);
    const resolvedNext = resolveModelSchemaInternal(next, schemas, visitedRefs, documentRoot);
    if (hasObjectSchemaShape(resolvedExisting) && hasObjectSchemaShape(resolvedNext)) {
        return mergeAllOfSchema({ allOf: [resolvedExisting, resolvedNext] }, schemas, visitedRefs, documentRoot);
    }
    return { allOf: [existing, next] };
}
function hasObjectSchemaShape(schema) {
    if (!schema || typeof schema !== 'object') {
        return false;
    }
    return resolveSchemaType(schema).effectiveType === 'object';
}
function hasSchemaContent(schema) {
    return Object.keys(schema).length > 0;
}
function omitSchemaKeys(schema, keys) {
    const omitted = new Set(keys);
    return Object.fromEntries(Object.entries(schema).filter(([key]) => !omitted.has(key)));
}
export function decodeJsonPointerSegment(segment) {
    return decodeURIComponent(segment).replace(/~1/g, '/').replace(/~0/g, '~');
}
export function encodeJsonPointerSegment(segment) {
    return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}
