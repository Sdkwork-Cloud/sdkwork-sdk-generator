import { describe, expect, it } from 'vitest';

import { TYPESCRIPT_CONFIG, getTypeScriptType } from './config.js';

describe('TypeScript config', () => {
    it('treats additionalProperties schemas as records even when upstream type is string', () => {
        const type = getTypeScriptType(
            {
                type: 'string',
                additionalProperties: true,
            },
            TYPESCRIPT_CONFIG,
        );

        expect(type).toBe('Record<string, unknown>');
    });

    it('preserves additionalProperties value schema types', () => {
        const type = getTypeScriptType(
            {
                type: 'object',
                additionalProperties: {
                    type: 'string',
                },
            },
            TYPESCRIPT_CONFIG,
        );

        expect(type).toBe('Record<string, string>');
    });

    it('preserves required and optional fields on inline object schemas', () => {
        const type = getTypeScriptType(
            {
                type: 'object',
                required: ['item'],
                properties: {
                    item: { $ref: '#/components/schemas/AgentRecord' },
                    'next-cursor': { type: 'string' },
                },
            },
            TYPESCRIPT_CONFIG,
            new Set(['AgentRecord']),
        );

        expect(type).toBe("{ item: AgentRecord; 'next-cursor'?: string; }");
    });

    it('preserves inline fields when additional properties are allowed', () => {
        const type = getTypeScriptType(
            {
                type: 'object',
                required: ['items'],
                properties: {
                    items: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/AgentRecord' },
                    },
                },
                additionalProperties: true,
            },
            TYPESCRIPT_CONFIG,
            new Set(['AgentRecord']),
        );

        expect(type).toBe('{ items: AgentRecord[]; } & Record<string, unknown>');
    });

    it('wraps union item types before applying array suffixes', () => {
        const type = getTypeScriptType(
            {
                type: 'array',
                items: {
                    type: 'string',
                    enum: ['WEB', 'APP'],
                },
            },
            TYPESCRIPT_CONFIG,
        );

        expect(type).toBe("('WEB' | 'APP')[]");
    });

    it('maps OpenAPI 3.1 nullable type arrays to nullable TypeScript unions', () => {
        const type = getTypeScriptType(
            {
                type: ['string', 'null'],
            },
            TYPESCRIPT_CONFIG,
        );

        expect(type).toBe('string | null');
    });

    it('preserves nullability for formatted OpenAPI string types', () => {
        for (const format of ['date', 'date-time', 'uuid', 'email', 'uri']) {
            expect(getTypeScriptType(
                { type: ['string', 'null'], format },
                TYPESCRIPT_CONFIG,
            )).toBe('string | null');
        }
    });

    it('maps OpenAPI binary string schemas to Blob for typed multipart request DTOs', () => {
        const type = getTypeScriptType(
            {
                type: 'string',
                format: 'binary',
            },
            TYPESCRIPT_CONFIG,
        );

        expect(type).toBe('Blob');
    });

    it('maps nullable oneOf and anyOf schemas without unknown null branches', () => {
        expect(getTypeScriptType(
            {
                oneOf: [{ type: 'null' }, { type: 'string' }],
            },
            TYPESCRIPT_CONFIG,
        )).toBe('string | null');

        expect(getTypeScriptType(
            {
                anyOf: [{ type: ['null'] }, { type: 'integer' }],
            },
            TYPESCRIPT_CONFIG,
        )).toBe('number | null');
    });

    it('maps nullable allOf schemas without unknown intersection branches', () => {
        const type = getTypeScriptType(
            {
                allOf: [{ type: 'null' }, { $ref: '#/components/schemas/UserRef' }],
            },
            TYPESCRIPT_CONFIG,
            new Set(['UserRef']),
        );

        expect(type).toBe('UserRef');
    });
});
