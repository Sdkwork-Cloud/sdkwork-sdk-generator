import { generateSdk, getSupportedLanguages } from './index.js';
const testSpec = {
    openapi: '3.0.0',
    info: {
        title: 'Test API',
        version: '1.0.0',
        description: 'A test API for SDK generation',
    },
    paths: {
        '/users': {
            get: {
                summary: 'List all users',
                operationId: 'listUsers',
                tags: ['User'],
                responses: {
                    '200': {
                        description: 'Successful response',
                    },
                },
            },
            post: {
                summary: 'Create a user',
                operationId: 'createUser',
                tags: ['User'],
                responses: {
                    '201': {
                        description: 'User created',
                    },
                },
            },
        },
        '/users/{id}': {
            get: {
                summary: 'Get user by ID',
                operationId: 'getUser',
                tags: ['User'],
                parameters: [
                    {
                        name: 'id',
                        in: 'path',
                        required: true,
                        schema: {
                            type: 'string',
                        },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Successful response',
                    },
                },
            },
            put: {
                summary: 'Update user',
                operationId: 'updateUser',
                tags: ['User'],
                parameters: [
                    {
                        name: 'id',
                        in: 'path',
                        required: true,
                        schema: {
                            type: 'string',
                        },
                    },
                ],
                responses: {
                    '200': {
                        description: 'User updated',
                    },
                },
            },
            delete: {
                summary: 'Delete user',
                operationId: 'deleteUser',
                tags: ['User'],
                parameters: [
                    {
                        name: 'id',
                        in: 'path',
                        required: true,
                        schema: {
                            type: 'string',
                        },
                    },
                ],
                responses: {
                    '204': {
                        description: 'User deleted',
                    },
                },
            },
        },
        '/products': {
            get: {
                summary: 'List all products',
                operationId: 'listProducts',
                tags: ['Product'],
                responses: {
                    '200': {
                        description: 'Successful response',
                    },
                },
            },
        },
    },
    components: {
        schemas: {
            User: {
                type: 'object',
                description: 'A user object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'User ID',
                    },
                    name: {
                        type: 'string',
                        description: 'User name',
                    },
                    email: {
                        type: 'string',
                        description: 'User email',
                    },
                    createdAt: {
                        type: 'string',
                        description: 'Creation timestamp',
                    },
                },
            },
            UserList: {
                type: 'object',
                description: 'List of users',
                properties: {
                    items: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/User',
                        },
                    },
                    total: {
                        type: 'integer',
                    },
                },
            },
            CreateUserRequest: {
                type: 'object',
                description: 'Request to create a user',
                properties: {
                    name: {
                        type: 'string',
                    },
                    email: {
                        type: 'string',
                    },
                },
            },
            UpdateUserRequest: {
                type: 'object',
                description: 'Request to update a user',
                properties: {
                    name: {
                        type: 'string',
                    },
                    email: {
                        type: 'string',
                    },
                },
            },
        },
    },
};
const baseConfig = {
    name: 'Test SDK',
    sdkType: 'app',
    version: '1.0.0',
    baseUrl: 'https://api.example.com',
    apiPrefix: '/api/v1',
    description: 'Test SDK for validation',
    author: 'SDKWork Team',
    license: 'MIT',
    outputPath: './output',
    apiSpecPath: './spec.json',
};
async function testGenerator(language) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing ${language.toUpperCase()} Generator`);
    console.log('='.repeat(60));
    try {
        const result = await generateSdk({ ...baseConfig, language: language }, testSpec);
        console.log(`\n✅ Generation successful!`);
        console.log(`   Files generated: ${result.stats.totalFiles}`);
        console.log(`   Models: ${result.stats.models}`);
        console.log(`   API groups: ${result.stats.apis}`);
        if (result.errors.length > 0) {
            console.log(`\n❌ Errors:`);
            result.errors.forEach(e => console.log(`   - ${e.message}`));
        }
        if (result.warnings.length > 0) {
            console.log(`\n⚠️  Warnings:`);
            result.warnings.forEach(w => console.log(`   - ${w}`));
        }
        console.log(`\n📁 Generated files:`);
        result.files.forEach(file => {
            console.log(`   - ${file.path} (${file.description || file.language})`);
        });
        return true;
    }
    catch (error) {
        console.log(`\n❌ Generation failed: ${error}`);
        return false;
    }
}
async function main() {
    console.log('SDK Generator Test Suite');
    console.log('========================');
    const languages = getSupportedLanguages();
    console.log(`\nSupported languages: ${languages.join(', ')}`);
    const results = {};
    for (const language of languages) {
        results[language] = await testGenerator(language);
    }
    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    for (const [lang, success] of Object.entries(results)) {
        const status = success ? '✅ PASS' : '❌ FAIL';
        console.log(`   ${lang}: ${status}`);
    }
    const passed = Object.values(results).filter(Boolean).length;
    const total = Object.keys(results).length;
    console.log(`\nTotal: ${passed}/${total} generators passed`);
}
main().catch(console.error);
