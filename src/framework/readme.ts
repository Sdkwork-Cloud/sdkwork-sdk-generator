import type { AuthContext, GeneratedFile } from './types.js';

export type AuthSectionOptions = {
  codeFence: string;
  modeAExample: string;
  modeBExample: string;
  apiKeyCall: string;
  authTokenCall: string;
  accessTokenCall: string;
};

export function resolveApiKeyHeaderPreview(auth: AuthContext): string {
  const header = auth.apiKeyHeader || 'Authorization';
  const value = auth.apiKeyAsBearer ? 'Bearer <apiKey>' : '<apiKey>';
  return `${header}: ${value}`;
}

export function buildLanguageReadmeTitle(configName: string, languageLabel: string): string {
  const trimmedName = (configName || '').trim() || 'SDKWork SDK';
  const trimmedLanguage = (languageLabel || '').trim() || 'SDK';
  if (/\bsdk$/i.test(trimmedName)) {
    return `${trimmedName} (${trimmedLanguage})`;
  }
  return `${trimmedName} ${trimmedLanguage} SDK`;
}

export function buildMutuallyExclusiveAuthSection(options: AuthSectionOptions): string {
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

export function normalizeReadmeFile(file: GeneratedFile): { file: GeneratedFile; warning?: string } {
  const normalizedPath = (file.path || '').replace(/\\/g, '/');
  const normalizedContent = (file.content || '').trim();
  const nextFile: GeneratedFile = {
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
