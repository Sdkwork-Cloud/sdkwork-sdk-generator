import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export async function loadOpenApiSpec(input) {
    if (isRemoteInput(input)) {
        return loadRemoteSpec(input);
    }
    const inputPath = resolve(input);
    if (!existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
    }
    return parseSpecContent(readFileSync(inputPath, 'utf-8'), {
        source: inputPath,
        contentType: '',
    });
}
function isRemoteInput(input) {
    return input.startsWith('http://') || input.startsWith('https://');
}
async function loadRemoteSpec(input) {
    const response = await fetch(input);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return parseSpecContent(await response.text(), {
        source: input,
        contentType: response.headers.get('content-type') || '',
    });
}
async function parseSpecContent(content, options) {
    if (looksLikeYamlContent(options.source, options.contentType)) {
        const yaml = await import('js-yaml');
        return yaml.load(content);
    }
    try {
        return JSON.parse(content);
    }
    catch {
        const yaml = await import('js-yaml');
        return yaml.load(content);
    }
}
function looksLikeYamlPath(inputPath) {
    const normalized = inputPath.toLowerCase();
    return normalized.endsWith('.yaml') || normalized.endsWith('.yml');
}
function looksLikeYamlContent(input, contentType) {
    return looksLikeYamlPath(input)
        || contentType.includes('yaml')
        || contentType.includes('x-yaml')
        || contentType.includes('text/plain');
}
