import { describe, expect, it } from 'vitest';

import type { ApiSpec, GeneratorConfig } from '../../framework/types.js';
import { TypeScriptGenerator } from './index.js';

const baseConfig: GeneratorConfig = {
  name: 'DiscriminatedSdk',
  version: '1.0.0',
  language: 'typescript',
  sdkType: 'custom',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/api/v1',
};

function getGeneratedFile(files: Array<{ path: string; content: string }>, path: string): { path: string; content: string } {
  const file = files.find((candidate) => candidate.path === path);
  expect(file).toBeDefined();
  return file!;
}

describe('TypeScript model generator', () => {
  it('keeps required nullable formatted fields present and nullable', async () => {
    const spec: ApiSpec = {
      openapi: '3.1.2',
      info: { title: 'Session Activity API', version: '1.0.0' },
      paths: {
        '/session_activity_summaries': {
          get: {
            operationId: 'sessionActivitySummaries.list',
            tags: ['agents'],
            responses: { '204': { description: 'No content' } },
          },
        },
      },
      components: {
        schemas: {
          SessionActivityFreshness: {
            type: 'object',
            required: ['observedAt', 'freshUntil'],
            properties: {
              observedAt: { type: ['string', 'null'], format: 'date-time' },
              freshUntil: { type: ['string', 'null'], format: 'date-time' },
            },
          },
        },
      },
    };

    const result = await new TypeScriptGenerator().generate(baseConfig, spec);
    expect(result.errors).toEqual([]);

    const freshnessFile = getGeneratedFile(result.files, 'src/types/session-activity-freshness.ts');
    expect(freshnessFile.content).toContain('observedAt: string | null;');
    expect(freshnessFile.content).toContain('freshUntil: string | null;');
    expect(freshnessFile.content).not.toContain('observedAt?:');
    expect(freshnessFile.content).not.toContain('freshUntil?:');
  });

  it('generates named oneOf object schemas as discriminated unions instead of wide optional-field DTOs', async () => {
    const spec: ApiSpec = {
      openapi: '3.1.2',
      info: { title: 'Discriminated API', version: '1.0.0' },
      paths: {
        '/messages': {
          post: {
            operationId: 'messages.create',
            tags: ['chat'],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      parts: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/ContentPart' },
                      },
                    },
                  },
                },
              },
            },
            responses: { '204': { description: 'No content' } },
          },
        },
      },
      components: {
        schemas: {
          ContentPart: {
            discriminator: { propertyName: 'kind' } as any,
            oneOf: [
              { $ref: '#/components/schemas/TextContentPart' },
              { $ref: '#/components/schemas/MediaContentPart' },
            ],
          },
          TextContentPart: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'text'],
            properties: {
              kind: { type: 'string', enum: ['text'] },
              text: { type: 'string' },
            },
          },
          MediaContentPart: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'drive', 'resource'],
            properties: {
              kind: { type: 'string', enum: ['media'] },
              drive: { $ref: '#/components/schemas/DriveReference' },
              resource: { $ref: '#/components/schemas/MediaResource' },
            },
          },
          DriveReference: {
            type: 'object',
            required: ['driveUri'],
            properties: {
              driveUri: { type: 'string' },
            },
          },
          MediaResource: {
            type: 'object',
            required: ['uri'],
            properties: {
              uri: { type: 'string' },
            },
          },
        },
      },
    };

    const result = await new TypeScriptGenerator().generate(baseConfig, spec);
    expect(result.errors).toEqual([]);

    const contentPartFile = getGeneratedFile(result.files, 'src/types/content-part.ts');
    const mediaContentPartFile = getGeneratedFile(result.files, 'src/types/media-content-part.ts');

    expect(contentPartFile.content).not.toContain('export interface ContentPart');
    expect(contentPartFile.content).toContain("import type { TextContentPart } from './text-content-part';");
    expect(contentPartFile.content).toContain("import type { MediaContentPart } from './media-content-part';");
    expect(contentPartFile.content).toContain('export type ContentPart = TextContentPart | MediaContentPart;');

    expect(mediaContentPartFile.content).toContain("kind: 'media';");
    expect(mediaContentPartFile.content).toContain('drive: DriveReference;');
    expect(mediaContentPartFile.content).toContain('resource: MediaResource;');
  });
});
