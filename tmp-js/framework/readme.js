export function resolveApiKeyHeaderPreview(auth) {
    const header = auth.apiKeyHeader || 'Authorization';
    const value = auth.apiKeyAsBearer ? 'Bearer <apiKey>' : '<apiKey>';
    return `${header}: ${value}`;
}
export function buildLanguageReadmeTitle(configName, languageLabel) {
    const trimmedName = (configName || '').trim() || 'SDKWork SDK';
    const trimmedLanguage = (languageLabel || '').trim() || 'SDK';
    if (/\bsdk$/i.test(trimmedName)) {
        return `${trimmedName} (${trimmedLanguage})`;
    }
    return `${trimmedName} ${trimmedLanguage} SDK`;
}
export function buildMutuallyExclusiveAuthSection(options) {
    const intro = 'Choose exactly one mode for the same client instance.';
    const note = `Do not call \`${options.apiKeyCall}\` together with \`${options.authTokenCall}\` + \`${options.accessTokenCall}\` on the same client.`;
    return [
        '## Authentication Modes (Mutually Exclusive)',
        '',
        intro,
        '',
        '### Mode A: API Key',
        '',
        `\`\`\`${options.codeFence}`,
        options.modeAExample.trim(),
        '```',
        '',
        '### Mode B: Dual Token',
        '',
        `\`\`\`${options.codeFence}`,
        options.modeBExample.trim(),
        '```',
        '',
        `> ${note}`,
    ].join('\n');
}
function resolvePublishEnvHint(language) {
    switch (language) {
        case 'typescript':
            return 'Set `NPM_TOKEN` (and optional `NPM_REGISTRY_URL`) before release publish.';
        case 'dart':
            return 'Ensure `dart pub publish --dry-run` passes before release publish.';
        case 'python':
            return 'Set `PYPI_TOKEN` for release (or `TEST_PYPI_TOKEN` for test channel).';
        case 'java':
            return 'Use Maven `settings.xml` credentials and optional `MAVEN_PUBLISH_PROFILE`.';
        case 'kotlin':
            return 'Configure Gradle publishing credentials and optional `GRADLE_PUBLISH_TASK`.';
        case 'go':
            return 'Set `GO_RELEASE_TAG` (or `SDKWORK_RELEASE_TAG`) and push tag if needed.';
        case 'rust':
            return 'Set cargo registry credentials before `cargo publish` and use `--dry-run` first.';
        case 'swift':
            return 'Set `SWIFT_RELEASE_TAG` (or `SDKWORK_RELEASE_TAG`) for tag-based release.';
        case 'flutter':
            return 'Ensure `dart pub publish --dry-run` passes before release publish.';
        case 'csharp':
            return 'Set `NUGET_API_KEY` for release (or `NUGET_TEST_API_KEY` for test channel).';
        case 'php':
            return 'Set `PHP_RELEASE_TAG` (or `SDKWORK_RELEASE_TAG`) for Composer/Packagist tag-based release.';
        case 'ruby':
            return 'Set `GEM_HOST_API_KEY` (or `RUBYGEMS_API_KEY`) before `gem push`.';
        default:
            return 'Prepare registry credentials before publish.';
    }
}
export function buildPublishSection(language) {
    const envHint = resolvePublishEnvHint(language);
    return [
        '## Publishing',
        '',
        'This SDK includes cross-platform publish scripts in `bin/`:',
        '- `bin/publish-core.mjs`',
        '- `bin/publish.sh`',
        '- `bin/publish.ps1`',
        '',
        '### Check',
        '',
        '```bash',
        './bin/publish.sh --action check',
        '```',
        '',
        '### Publish',
        '',
        '```bash',
        './bin/publish.sh --action publish --channel release',
        '```',
        '',
        '```powershell',
        '.\\bin\\publish.ps1 --action publish --channel test --dry-run',
        '```',
        '',
        `> ${envHint}`,
    ].join('\n');
}
export function buildRegenerationContractSection() {
    return [
        '## Regeneration Contract',
        '',
        '- Generator-owned files are tracked in `.sdkwork/sdkwork-generator-manifest.json`.',
        '- Each run also writes `.sdkwork/sdkwork-generator-changes.json` so automation can inspect created, updated, deleted, unchanged, scaffolded, and backed-up files plus the classified impact areas, verification plan, and execution decision for the latest generation.',
        '- Apply mode also writes `.sdkwork/sdkwork-generator-report.json` with the full execution report, including `schemaVersion`, `generator`, stable artifact paths, and the execution handoff commands that match CLI `--json` output.',
        '- CLI JSON output also includes an execution handoff with concrete next commands, including reviewed apply commands for dry-run flows.',
        '- Put hand-written wrappers, adapters, and orchestration in `custom/`.',
        '- Files scaffolded under `custom/` are created once and preserved across regenerations.',
        '- If a generated-owned file was modified locally, its previous content is copied to `.sdkwork/manual-backups/` before overwrite or removal.',
    ].join('\n');
}
export function normalizeReadmeFile(file) {
    const normalizedPath = (file.path || '').replace(/\\/g, '/');
    const normalizedContent = appendRegenerationContract((file.content || '').trim());
    const nextFile = {
        ...file,
        path: 'README.md',
        content: `${normalizedContent}\n`,
    };
    if (normalizedPath.toLowerCase() !== 'readme.md') {
        return {
            file: nextFile,
            warning: `Language ${file.language} generated README at "${file.path}". Normalized to "README.md".`,
        };
    }
    if (!normalizedContent) {
        return {
            file: nextFile,
            warning: `Language ${file.language} generated an empty README.md. A placeholder README was emitted.`,
        };
    }
    return { file: nextFile };
}
function appendRegenerationContract(content) {
    if (content.includes('## Regeneration Contract')) {
        return content;
    }
    const trimmedContent = content.trim();
    if (!trimmedContent) {
        return buildRegenerationContractSection();
    }
    return `${trimmedContent}\n\n${buildRegenerationContractSection()}`;
}
