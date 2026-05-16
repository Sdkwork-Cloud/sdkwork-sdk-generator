import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const normalizer = path.join(projectRoot, 'bin', 'normalize-openapi-parameters.mjs');

function runNormalizer(document: unknown) {
  const directory = mkdtempSync(path.join(tmpdir(), 'sdkwork-openapi-normalize-'));
  const input = path.join(directory, 'openapi.json');
  writeFileSync(input, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  for (let index = 0; index < 2; index += 1) {
    const result = spawnSync(process.execPath, [normalizer, '--input', input, '--output', input], {
      cwd: projectRoot,
      encoding: 'utf8',
      shell: false,
    });
    expect(result.status, result.stderr).toBe(0);
  }

  return JSON.parse(readFileSync(input, 'utf8'));
}

describe('normalize-openapi-parameters', () => {
  it('normalizes query object parameters into explicit SDKWork v3 wire parameters', () => {
    const normalized = runNormalizer({
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/items': {
          get: {
            parameters: [
              {
                name: 'request',
                in: 'query',
                schema: { $ref: '#/components/schemas/ListItemsQuery' },
              },
            ],
            responses: { 200: { description: 'OK' } },
          },
        },
      },
      components: {
        schemas: {
          ListItemsQuery: {
            type: 'object',
            properties: {
              keyword: { type: 'string' },
              pageSize: { type: 'integer', format: 'int32' },
              workspaceId: { type: 'string' },
              'scope.workspaceId': { type: 'string' },
            },
          },
        },
      },
    });

    expect(normalized.paths['/items'].get.parameters.map((parameter: { name: string }) => parameter.name)).toEqual([
      'q',
      'page_size',
      'workspace_id',
      'scope_workspace_id',
    ]);
  });

  it('normalizes generic search text request schema properties to q without touching response fields', () => {
    const normalized = runNormalizer({
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/app/v3/api/search/history': {
          post: {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SearchHistoryAddRequest' },
                },
              },
            },
            responses: { 200: { description: 'OK' } },
          },
        },
        '/backend/v3/api/search/inline': {
          post: {
            requestBody: {
              required: false,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['search'],
                    properties: {
                      search: { type: 'string', maxLength: 64 },
                      status: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: { 200: { description: 'OK' } },
          },
        },
        '/backend/v3/api/rtc/room/list': {
          post: {
            requestBody: {
              required: false,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/RtcRoomQuery' },
                },
              },
            },
            responses: { 200: { description: 'OK' } },
          },
        },
      },
      components: {
        schemas: {
          SearchHistoryAddRequest: {
            type: 'object',
            required: ['keyword', 'tenantId'],
            properties: {
              keyword: { type: 'string', maxLength: 128 },
              searchQuery: { type: 'string', maxLength: 128 },
              tenantId: { type: 'string' },
            },
          },
          RtcRoomQuery: {
            type: 'object',
            required: ['search'],
            properties: {
              search: { type: 'string' },
              status: { type: 'string' },
              page: { type: 'integer', format: 'int32' },
              pageSize: { type: 'integer', format: 'int32' },
            },
          },
          SearchHistoryVO: {
            type: 'object',
            properties: {
              keyword: { type: 'string' },
            },
          },
          OpenAiVectorStoreSearchResponse: {
            type: 'object',
            properties: {
              search_query: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    });

    const requestSchema = normalized.components.schemas.SearchHistoryAddRequest;
    expect(Object.keys(requestSchema.properties)).toEqual(['q', 'tenantId']);
    expect(requestSchema.properties.q).toEqual({ type: 'string', maxLength: 128 });
    expect(requestSchema.required).toEqual(['q', 'tenantId']);

    const inlineSchema = normalized.paths['/backend/v3/api/search/inline'].post.requestBody.content['application/json'].schema;
    expect(Object.keys(inlineSchema.properties)).toEqual(['q', 'status']);
    expect(inlineSchema.required).toEqual(['q']);

    const querySchema = normalized.components.schemas.RtcRoomQuery;
    expect(Object.keys(querySchema.properties)).toEqual(['q', 'status', 'page', 'pageSize']);
    expect(querySchema.required).toEqual(['q']);

    expect(normalized.components.schemas.SearchHistoryVO.properties.keyword).toEqual({ type: 'string' });
    expect(normalized.components.schemas.OpenAiVectorStoreSearchResponse.properties.search_query).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('canonicalizes access-token header names idempotently', () => {
    const normalized = runNormalizer({
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/items': {
          get: {
            description: 'Requires Sdkwork-Sdkwork-Access-Token or Access-Token.',
            parameters: [
              {
                name: 'Sdkwork-Sdkwork-Access-Token',
                in: 'header',
                schema: { type: 'string' },
              },
            ],
            responses: { 200: { description: 'OK' } },
          },
        },
      },
      components: {
        securitySchemes: {
          SdkworkAccessToken: {
            type: 'apiKey',
            in: 'header',
            name: 'Access-Token',
          },
        },
      },
    });

    const operation = normalized.paths['/items'].get;
    expect(operation.description).toBe('Requires Sdkwork-Access-Token or Sdkwork-Access-Token.');
    expect(operation.parameters[0].name).toBe('Sdkwork-Access-Token');
    expect(normalized.components.securitySchemes.SdkworkAccessToken.name).toBe('Sdkwork-Access-Token');
  });

  it('normalizes SDKWork v3 paths tags and operationIds from legacy controller names', () => {
    const normalized = runNormalizer({
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/app/v3/api/voice-speakers/{speaker_id}': {
          get: {
            operationId: 'voice_speaker__getSpeakerDetail',
            tags: ['voice_speaker'],
            responses: { 200: { description: 'OK' } },
          },
        },
        '/app/v3/api/tenants': {
          post: {
            operationId: 'tenant__create',
            tags: ['Tenant Management'],
            responses: { 200: { description: 'OK' } },
          },
        },
        '/app/v3/api/settings/security/2fa': {
          put: {
            operationId: 'settings__updateTwoFactorAuth',
            tags: ['settings'],
            responses: { 200: { description: 'OK' } },
          },
        },
      },
    });

    expect(normalized.paths['/app/v3/api/voice_speakers/{speakerId}'].get.tags).toEqual(['voiceSpeaker']);
    expect(normalized.paths['/app/v3/api/voice_speakers/{speakerId}'].get.operationId).toBe('speakers.retrieve');
    expect(normalized.paths['/app/v3/api/tenants'].post.tags).toEqual(['tenant']);
    expect(normalized.paths['/app/v3/api/tenants'].post.operationId).toBe('tenants.create');
    expect(normalized.paths['/app/v3/api/settings/security/2fa'].put.operationId).toBe('security.twofa.update');
  });

  it('removes stale backend auth namespace paths from backend snapshots', () => {
    const normalized = runNormalizer({
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/backend/v3/api/auth/sessions': {
          post: {
            operationId: 'auth__login',
            tags: ['Auth Management'],
            responses: { 200: { description: 'OK' } },
          },
        },
        '/backend/v3/api/system/users': {
          get: {
            operationId: 'system_user__listByPage',
            tags: ['system_user'],
            responses: { 200: { description: 'OK' } },
          },
        },
      },
    });

    expect(normalized.paths['/backend/v3/api/auth/sessions']).toBeUndefined();
    expect(normalized.paths['/backend/v3/api/system/users'].get.tags).toEqual(['system']);
    expect(normalized.paths['/backend/v3/api/system/users'].get.operationId).toBe('users.list');
  });
});
