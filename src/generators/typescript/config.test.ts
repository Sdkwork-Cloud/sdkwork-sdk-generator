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
});
