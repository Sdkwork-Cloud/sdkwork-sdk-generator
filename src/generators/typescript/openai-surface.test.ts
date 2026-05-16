import { describe, expect, it } from 'vitest';
import type { ApiSpec, GeneratorConfig } from '../../framework/types.js';
import { TypeScriptGenerator } from './index.js';

const baseConfig: GeneratorConfig = {
  name: 'OpenAIStyleSDK',
  version: '1.0.0',
  language: 'typescript',
  sdkType: 'ai',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/v1',
};

const objectSchema = { type: 'object', additionalProperties: true };

function schemaRef(name: string): Record<string, unknown> {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonRequestBody(schema: Record<string, unknown>, required = true): Record<string, unknown> {
  return {
    required,
    content: {
      'application/json': {
        schema,
      },
    },
  };
}

function multipartRequestBody(): Record<string, unknown> {
  return {
    required: true,
    content: {
      'multipart/form-data': {
        schema: schemaRef('CreateUploadPartRequest'),
      },
    },
  };
}

function jsonOk(schema: Record<string, unknown>): Record<string, unknown> {
  return {
    '200': {
      description: 'OK',
      content: {
        'application/json': {
          schema,
        },
      },
    },
  };
}

function deleted(): Record<string, unknown> {
  return { '204': { description: 'Deleted' } };
}

function pathParam(name: string): Record<string, unknown> {
  return { name, in: 'path', required: true, schema: { type: 'string' } };
}

const openAiStyleSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'OpenAI Style API', version: '1.0.0' },
  paths: {
    '/v1/responses': {
      post: {
        summary: 'Create response',
        operationId: 'createResponse',
        tags: ['Responses'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateResponseRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ResponseObject' },
              },
            },
          },
        },
      },
    },
    '/v1/responses/{response_id}': {
      get: {
        summary: 'Retrieve response',
        operationId: 'getResponse',
        tags: ['Responses'],
        parameters: [{ name: 'response_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ResponseObject' },
              },
            },
          },
        },
      },
      delete: {
        summary: 'Delete response',
        operationId: 'deleteResponse',
        tags: ['Responses'],
        parameters: [{ name: 'response_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'Deleted' } },
      },
    },
    '/v1/responses/{response_id}/cancel': {
      post: {
        summary: 'Cancel response',
        operationId: 'cancelResponse',
        tags: ['Responses'],
        parameters: [{ name: 'response_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ResponseObject' },
              },
            },
          },
        },
      },
    },
    '/v1/files': {
      get: {
        summary: 'List files',
        operationId: 'listFiles',
        tags: ['Files'],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/FileObject' } },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create file',
        operationId: 'uploadFile',
        tags: ['Files'],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: { $ref: '#/components/schemas/CreateFileRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FileObject' },
              },
            },
          },
        },
      },
    },
    '/v1/chat/completions': {
      post: {
        summary: 'Create chat completion',
        operationId: 'createChatCompletion',
        tags: ['Chat Completions'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateChatCompletionRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatCompletionObject' },
              },
            },
          },
        },
      },
      get: {
        summary: 'List chat completions',
        operationId: 'listChatCompletions',
        tags: ['Chat Completions'],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatCompletionListObject' },
              },
            },
          },
        },
      },
    },
    '/v1/chat/completions/{completion_id}': {
      get: {
        summary: 'Retrieve chat completion',
        operationId: 'getChatCompletion',
        tags: ['Chat Completions'],
        parameters: [{ name: 'completion_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatCompletionObject' },
              },
            },
          },
        },
      },
      post: {
        summary: 'Update chat completion',
        operationId: 'updateChatCompletion',
        tags: ['Chat Completions'],
        parameters: [{ name: 'completion_id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateChatCompletionRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatCompletionObject' },
              },
            },
          },
        },
      },
      delete: {
        summary: 'Delete chat completion',
        operationId: 'deleteChatCompletion',
        tags: ['Chat Completions'],
        parameters: [{ name: 'completion_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'Deleted' } },
      },
    },
    '/v1/chat/completions/{completion_id}/messages': {
      get: {
        summary: 'List chat completion messages',
        operationId: 'listChatCompletionMessages',
        tags: ['Chat Completions'],
        parameters: [{ name: 'completion_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatCompletionMessagesListObject' },
              },
            },
          },
        },
      },
    },
    '/v1/batches': {
      post: {
        summary: 'Create batch',
        operationId: 'createBatch',
        tags: ['Batches'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
    },
    '/v1/batches/{batch_id}/cancel': {
      post: {
        summary: 'Cancel batch',
        operationId: 'cancelBatch',
        tags: ['Batches'],
        parameters: [{ name: 'batch_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
    },
    '/v1/files/{file_id}/content': {
      get: {
        summary: 'Retrieve file content',
        operationId: 'downloadFile',
        tags: ['Files'],
        parameters: [{ name: 'file_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/octet-stream': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
    },
    '/v1/uploads': {
      post: {
        summary: 'Create upload',
        operationId: 'createUpload',
        tags: ['Uploads'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
    },
    '/v1/uploads/{upload_id}/complete': {
      post: {
        summary: 'Complete upload',
        operationId: 'completeUpload',
        tags: ['Uploads'],
        parameters: [{ name: 'upload_id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
    },
    '/v1/threads/{thread_id}/runs/{run_id}/submit_tool_outputs': {
      post: {
        summary: 'Submit tool outputs to run',
        operationId: 'submitToolOutputsToRun',
        tags: ['Threads'],
        parameters: [
          { name: 'thread_id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'run_id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      CreateResponseRequest: {
        type: 'object',
        properties: {
          model: { type: 'string' },
          input: { type: 'string' },
        },
      },
      ResponseObject: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          object: { type: 'string' },
        },
      },
      FileObject: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          object: { type: 'string' },
        },
      },
      CreateFileRequest: {
        type: 'object',
        required: ['file'],
        properties: {
          file: { type: 'string', format: 'binary' },
          fileName: { type: 'string' },
        },
      },
      CreateChatCompletionRequest: {
        type: 'object',
        properties: {
          model: { type: 'string' },
          messages: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
      ChatCompletionObject: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          object: { type: 'string' },
        },
      },
      ChatCompletionListObject: {
        type: 'object',
        properties: {
          object: { type: 'string' },
          data: { type: 'array', items: { $ref: '#/components/schemas/ChatCompletionObject' } },
        },
      },
      UpdateChatCompletionRequest: {
        type: 'object',
        properties: {
          metadata: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
      ChatCompletionMessagesListObject: {
        type: 'object',
        properties: {
          object: { type: 'string' },
          data: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
    },
  },
};

const openAiNestedResourceSpec: ApiSpec = {
  openapi: '3.0.3',
  info: { title: 'OpenAI Nested Resource API', version: '1.0.0' },
  paths: {
    '/v1/uploads/{upload_id}/parts': {
      post: {
        summary: 'Create upload part',
        operationId: 'createUploadPart',
        tags: ['Uploads'],
        parameters: [pathParam('upload_id')],
        requestBody: multipartRequestBody(),
        responses: jsonOk(schemaRef('UploadPartObject')),
      },
    },
    '/v1/vector_stores': {
      get: {
        summary: 'List vector stores',
        operationId: 'listVectorStores',
        tags: ['Vector Stores'],
        responses: jsonOk(schemaRef('ListVectorStoresResponse')),
      },
      post: {
        summary: 'Create vector store',
        operationId: 'createVectorStore',
        tags: ['Vector Stores'],
        requestBody: jsonRequestBody(schemaRef('CreateVectorStoreRequest')),
        responses: jsonOk(schemaRef('VectorStoreObject')),
      },
    },
    '/v1/vector_stores/{vector_store_id}': {
      get: {
        summary: 'Retrieve vector store',
        operationId: 'retrieveVectorStore',
        tags: ['Vector Stores'],
        parameters: [pathParam('vector_store_id')],
        responses: jsonOk(schemaRef('VectorStoreObject')),
      },
      post: {
        summary: 'Update vector store',
        operationId: 'updateVectorStore',
        tags: ['Vector Stores'],
        parameters: [pathParam('vector_store_id')],
        requestBody: jsonRequestBody(schemaRef('UpdateVectorStoreRequest')),
        responses: jsonOk(schemaRef('VectorStoreObject')),
      },
      delete: {
        summary: 'Delete vector store',
        operationId: 'deleteVectorStore',
        tags: ['Vector Stores'],
        parameters: [pathParam('vector_store_id')],
        responses: jsonOk(schemaRef('VectorStoreDeleteResponse')),
      },
    },
    '/v1/vector_stores/{vector_store_id}/search': {
      post: {
        summary: 'Search vector store',
        operationId: 'searchVectorStore',
        tags: ['Vector Stores'],
        parameters: [pathParam('vector_store_id')],
        requestBody: jsonRequestBody(schemaRef('SearchVectorStoreRequest')),
        responses: jsonOk(schemaRef('VectorStoreSearchResponse')),
      },
    },
    '/v1/vector_stores/{vector_store_id}/files': {
      get: {
        summary: 'List vector store files',
        operationId: 'listVectorStoreFiles',
        tags: ['Vector Stores'],
        parameters: [pathParam('vector_store_id')],
        responses: jsonOk(schemaRef('ListVectorStoreFilesResponse')),
      },
      post: {
        summary: 'Create vector store file',
        operationId: 'createVectorStoreFile',
        tags: ['Vector Stores'],
        parameters: [pathParam('vector_store_id')],
        requestBody: jsonRequestBody(schemaRef('CreateVectorStoreFileRequest')),
        responses: jsonOk(schemaRef('VectorStoreFileObject')),
      },
    },
    '/v1/vector_stores/{vector_store_id}/files/{file_id}': {
      get: {
        summary: 'Retrieve vector store file',
        operationId: 'retrieveVectorStoreFile',
        tags: ['Vector Stores'],
        parameters: [pathParam('vector_store_id'), pathParam('file_id')],
        responses: jsonOk(schemaRef('VectorStoreFileObject')),
      },
      delete: {
        summary: 'Delete vector store file',
        operationId: 'deleteVectorStoreFile',
        tags: ['Vector Stores'],
        parameters: [pathParam('vector_store_id'), pathParam('file_id')],
        responses: jsonOk(schemaRef('VectorStoreFileDeleteResponse')),
      },
    },
    '/v1/vector_stores/{vector_store_id}/files/{file_id}/content': {
      get: {
        summary: 'Retrieve vector store file content',
        operationId: 'retrieveVectorStoreFileContent',
        tags: ['Vector Stores'],
        parameters: [pathParam('vector_store_id'), pathParam('file_id')],
        responses: jsonOk(schemaRef('VectorStoreFileContentResponse')),
      },
    },
    '/v1/vector_stores/{vector_store_id}/file_batches': {
      post: {
        summary: 'Create vector store file batch',
        operationId: 'createVectorStoreFileBatch',
        tags: ['Vector Stores'],
        parameters: [pathParam('vector_store_id')],
        requestBody: jsonRequestBody(schemaRef('CreateVectorStoreFileBatchRequest')),
        responses: jsonOk(schemaRef('VectorStoreFileBatchObject')),
      },
    },
    '/v1/vector_stores/{vector_store_id}/file_batches/{batch_id}': {
      get: {
        summary: 'Retrieve vector store file batch',
        operationId: 'retrieveVectorStoreFileBatch',
        tags: ['Vector Stores'],
        parameters: [pathParam('vector_store_id'), pathParam('batch_id')],
        responses: jsonOk(schemaRef('VectorStoreFileBatchObject')),
      },
    },
    '/v1/vector_stores/{vector_store_id}/file_batches/{batch_id}/cancel': {
      post: {
        summary: 'Cancel vector store file batch',
        operationId: 'cancelVectorStoreFileBatch',
        tags: ['Vector Stores'],
        parameters: [pathParam('vector_store_id'), pathParam('batch_id')],
        responses: jsonOk(schemaRef('VectorStoreFileBatchObject')),
      },
    },
    '/v1/vector_stores/{vector_store_id}/file_batches/{batch_id}/files': {
      get: {
        summary: 'List vector store file batch files',
        operationId: 'listVectorStoreFileBatchFiles',
        tags: ['Vector Stores'],
        parameters: [pathParam('vector_store_id'), pathParam('batch_id')],
        responses: jsonOk(schemaRef('ListVectorStoreFilesResponse')),
      },
    },
    '/v1/fine_tuning/jobs': {
      get: {
        summary: 'List fine tuning jobs',
        operationId: 'listFineTuningJobs',
        tags: ['Fine Tuning'],
        responses: jsonOk(schemaRef('ListFineTuningJobsResponse')),
      },
      post: {
        summary: 'Create fine tuning job',
        operationId: 'createFineTuningJob',
        tags: ['Fine Tuning'],
        requestBody: jsonRequestBody(schemaRef('CreateFineTuningJobRequest')),
        responses: jsonOk(schemaRef('FineTuningJobObject')),
      },
    },
    '/v1/fine_tuning/jobs/{fine_tuning_job_id}': {
      get: {
        summary: 'Retrieve fine tuning job',
        operationId: 'retrieveFineTuningJob',
        tags: ['Fine Tuning'],
        parameters: [pathParam('fine_tuning_job_id')],
        responses: jsonOk(schemaRef('FineTuningJobObject')),
      },
    },
    '/v1/fine_tuning/jobs/{fine_tuning_job_id}/cancel': {
      post: {
        summary: 'Cancel fine tuning job',
        operationId: 'cancelFineTuningJob',
        tags: ['Fine Tuning'],
        parameters: [pathParam('fine_tuning_job_id')],
        responses: jsonOk(schemaRef('FineTuningJobObject')),
      },
    },
    '/v1/fine_tuning/jobs/{fine_tuning_job_id}/pause': {
      post: {
        summary: 'Pause fine tuning job',
        operationId: 'pauseFineTuningJob',
        tags: ['Fine Tuning'],
        parameters: [pathParam('fine_tuning_job_id')],
        responses: jsonOk(schemaRef('FineTuningJobObject')),
      },
    },
    '/v1/fine_tuning/jobs/{fine_tuning_job_id}/resume': {
      post: {
        summary: 'Resume fine tuning job',
        operationId: 'resumeFineTuningJob',
        tags: ['Fine Tuning'],
        parameters: [pathParam('fine_tuning_job_id')],
        responses: jsonOk(schemaRef('FineTuningJobObject')),
      },
    },
    '/v1/fine_tuning/jobs/{fine_tuning_job_id}/events': {
      get: {
        summary: 'List fine tuning job events',
        operationId: 'listFineTuningJobEvents',
        tags: ['Fine Tuning'],
        parameters: [pathParam('fine_tuning_job_id')],
        responses: jsonOk(schemaRef('ListFineTuningEventsResponse')),
      },
    },
    '/v1/fine_tuning/jobs/{fine_tuning_job_id}/checkpoints': {
      get: {
        summary: 'List fine tuning job checkpoints',
        operationId: 'listFineTuningJobCheckpoints',
        tags: ['Fine Tuning'],
        parameters: [pathParam('fine_tuning_job_id')],
        responses: jsonOk(schemaRef('ListFineTuningCheckpointsResponse')),
      },
    },
    '/v1/fine_tuning/checkpoints/{fine_tuned_model_checkpoint}/permissions': {
      get: {
        summary: 'Retrieve fine tuning checkpoint permissions',
        operationId: 'retrieveFineTuningCheckpointPermissions',
        tags: ['Fine Tuning'],
        parameters: [pathParam('fine_tuned_model_checkpoint')],
        responses: jsonOk(schemaRef('PermissionRetrieveResponse')),
      },
      post: {
        summary: 'Create fine tuning checkpoint permissions',
        operationId: 'createFineTuningCheckpointPermissions',
        tags: ['Fine Tuning'],
        parameters: [pathParam('fine_tuned_model_checkpoint')],
        requestBody: jsonRequestBody(schemaRef('PermissionCreateRequest')),
        responses: jsonOk(schemaRef('PermissionCreateResponse')),
      },
    },
    '/v1/fine_tuning/checkpoints/{fine_tuned_model_checkpoint}/permissions/{permission_id}': {
      delete: {
        summary: 'Delete fine tuning checkpoint permission',
        operationId: 'deleteFineTuningCheckpointPermission',
        tags: ['Fine Tuning'],
        parameters: [pathParam('fine_tuned_model_checkpoint'), pathParam('permission_id')],
        responses: jsonOk(schemaRef('PermissionDeleteResponse')),
      },
    },
  },
  components: {
    schemas: {
      CreateVectorStoreRequest: objectSchema,
      UpdateVectorStoreRequest: objectSchema,
      SearchVectorStoreRequest: objectSchema,
      VectorStoreSearchResponse: objectSchema,
      VectorStoreObject: objectSchema,
      ListVectorStoresResponse: objectSchema,
      VectorStoreDeleteResponse: objectSchema,
      CreateVectorStoreFileRequest: objectSchema,
      VectorStoreFileObject: objectSchema,
      ListVectorStoreFilesResponse: objectSchema,
      VectorStoreFileDeleteResponse: objectSchema,
      VectorStoreFileContentResponse: objectSchema,
      CreateVectorStoreFileBatchRequest: objectSchema,
      VectorStoreFileBatchObject: objectSchema,
      CreateUploadPartRequest: {
        type: 'object',
        required: ['file'],
        properties: {
          file: { type: 'string', format: 'binary' },
          fileName: { type: 'string' },
        },
      },
      UploadPartObject: objectSchema,
      CreateFineTuningJobRequest: objectSchema,
      FineTuningJobObject: objectSchema,
      ListFineTuningJobsResponse: objectSchema,
      ListFineTuningEventsResponse: objectSchema,
      ListFineTuningCheckpointsResponse: objectSchema,
      PermissionRetrieveResponse: objectSchema,
      PermissionCreateRequest: objectSchema,
      PermissionCreateResponse: objectSchema,
      PermissionDeleteResponse: objectSchema,
    },
  },
};

function getGeneratedFile(files: Array<{ path: string; content: string }>, path: string): { path: string; content: string } {
  const file = files.find((candidate) => candidate.path === path);
  expect(file).toBeDefined();
  return file!;
}

describe('TypeScript OpenAI-style SDK surface', () => {
  it('uses plural resource properties with create/list/retrieve/delete-style methods for AI SDKs', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, openAiStyleSpec);

    expect(result.errors).toEqual([]);

    const sdkFile = getGeneratedFile(result.files, 'src/sdk.ts');
    expect(sdkFile.content).toContain('public readonly responses: ResponsesApi;');
    expect(sdkFile.content).toContain('this.responses = createResponsesApi(this.httpClient);');
    expect(sdkFile.content).toContain('public readonly files: FilesApi;');
    expect(sdkFile.content).toContain('this.files = createFilesApi(this.httpClient);');
    expect(sdkFile.content).not.toContain('public readonly response:');
    expect(sdkFile.content).not.toContain('public readonly file:');

    const httpClient = getGeneratedFile(result.files, 'src/http/client.ts');
    expect(httpClient.content).toContain("if (normalizedContentType === 'multipart/form-data')");
    expect(httpClient.content).toContain('return this.encodeMultipartBody(body);');

    const responsesApi = getGeneratedFile(result.files, 'src/api/responses.ts');
    expect(responsesApi.content).toContain('export class ResponsesApi');
    expect(responsesApi.content).toContain('async create(body: CreateResponseRequest): Promise<ResponseObject>');
    expect(responsesApi.content).toContain('async retrieve(responseId: string): Promise<ResponseObject>');
    expect(responsesApi.content).toContain('async delete(responseId: string): Promise<void>');
    expect(responsesApi.content).toContain('async cancel(responseId: string): Promise<ResponseObject>');
    expect(responsesApi.content).not.toContain('async createResponse(');
    expect(responsesApi.content).not.toContain('async getResponse(');
    expect(responsesApi.content).not.toContain('async deleteResponse(');

    const filesApi = getGeneratedFile(result.files, 'src/api/files.ts');
    expect(filesApi.content).toContain('async list(): Promise<ListFilesResponse>');
    expect(filesApi.content).toContain('async create(body?: CreateFileRequest): Promise<FileObject>');
    expect(filesApi.content).not.toContain('body?: FormData');
    expect(filesApi.content).toContain('async content(fileId: string): Promise<Blob>');
    expect(filesApi.content).not.toContain('listFiles');
    expect(filesApi.content).not.toContain('uploadFile');
    expect(filesApi.content).not.toContain('public readonly content:');

    const chatApi = getGeneratedFile(result.files, 'src/api/chat.ts');
    expect(chatApi.content).toContain('public readonly completions: ChatCompletionsApi;');
    expect(chatApi.content).toContain('this.completions = new ChatCompletionsApi(client);');
    expect(chatApi.content).toContain('export class ChatCompletionsApi');
    expect(chatApi.content).toContain('public readonly messages: ChatCompletionsMessagesApi;');
    expect(chatApi.content).toContain('this.messages = new ChatCompletionsMessagesApi(client);');
    expect(chatApi.content).toContain('export class ChatCompletionsMessagesApi');
    expect(chatApi.content).toContain('async create(body: CreateChatCompletionRequest): Promise<ChatCompletionObject>');
    expect(chatApi.content).toContain('async list(): Promise<ChatCompletionListObject>');
    expect(chatApi.content).toContain('async retrieve(completionId: string): Promise<ChatCompletionObject>');
    expect(chatApi.content).toContain('async update(completionId: string, body: UpdateChatCompletionRequest): Promise<ChatCompletionObject>');
    expect(chatApi.content).toContain('async delete(completionId: string): Promise<void>');
    expect(chatApi.content).toContain('async list(completionId: string): Promise<ChatCompletionMessagesListObject>');
    expect(chatApi.content).not.toContain('createChatCompletion');
    expect(chatApi.content).not.toContain('retrieveCompletions');
    expect(chatApi.content).not.toContain('retrieveCompletionsMessages');

    const batchesApi = getGeneratedFile(result.files, 'src/api/batches.ts');
    expect(sdkFile.content).toContain('public readonly batches: BatchesApi;');
    expect(batchesApi.content).toContain('export class BatchesApi');
    expect(batchesApi.content).toContain('async create(body: CreateBatchRequest): Promise<CreateBatchResponse>');
    expect(batchesApi.content).toContain('async cancel(batchId: string): Promise<CancelBatchResponse>');
    expect(batchesApi.content).not.toContain('public readonly cancel:');

    const uploadsApi = getGeneratedFile(result.files, 'src/api/uploads.ts');
    expect(sdkFile.content).toContain('public readonly uploads: UploadsApi;');
    expect(uploadsApi.content).toContain('async create(body: CreateUploadRequest): Promise<CreateUploadResponse>');
    expect(uploadsApi.content).toContain('async complete(uploadId: string, body: CompleteUploadRequest): Promise<CompleteUploadResponse>');
    expect(uploadsApi.content).not.toContain('public readonly complete:');

    const threadsApi = getGeneratedFile(result.files, 'src/api/threads.ts');
    expect(sdkFile.content).toContain('public readonly threads: ThreadsApi;');
    expect(threadsApi.content).toContain('public readonly runs: ThreadsRunsApi;');
    expect(threadsApi.content).toContain('async submitToolOutputs(threadId: string, runId: string, body: SubmitToolOutputsToRunRequest): Promise<SubmitToolOutputsToRunResponse>');
    expect(threadsApi.content).not.toContain('public readonly submitToolOutputs:');
  });

  it('maps nested OpenAI resources and collection actions to standard client chains', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, openAiNestedResourceSpec);

    expect(result.errors).toEqual([]);

    const sdkFile = getGeneratedFile(result.files, 'src/sdk.ts');
    expect(sdkFile.content).toContain('public readonly vectorStores: VectorStoresApi;');
    expect(sdkFile.content).toContain('public readonly fineTuning: FineTuningApi;');
    expect(sdkFile.content).toContain('public readonly uploads: UploadsApi;');

    const uploadsApi = getGeneratedFile(result.files, 'src/api/uploads.ts');
    expect(uploadsApi.content).toContain('public readonly parts: UploadsPartsApi;');
    expect(uploadsApi.content).toContain('async create(uploadId: string, body: CreateUploadPartRequest): Promise<UploadPartObject>');
    expect(uploadsApi.content).not.toContain('body: FormData');

    const vectorStoresApi = getGeneratedFile(result.files, 'src/api/vector-stores.ts');
    expect(vectorStoresApi.content).toContain('export class VectorStoresApi');
    expect(vectorStoresApi.content).toContain('public readonly files: VectorStoresFilesApi;');
    expect(vectorStoresApi.content).toContain('public readonly fileBatches: VectorStoresFileBatchesApi;');
    expect(vectorStoresApi.content).toContain('async create(body: CreateVectorStoreRequest): Promise<VectorStoreObject>');
    expect(vectorStoresApi.content).toContain('async list(): Promise<ListVectorStoresResponse>');
    expect(vectorStoresApi.content).toContain('async retrieve(vectorStoreId: string): Promise<VectorStoreObject>');
    expect(vectorStoresApi.content).toContain('async update(vectorStoreId: string, body: UpdateVectorStoreRequest): Promise<VectorStoreObject>');
    expect(vectorStoresApi.content).toContain('async delete(vectorStoreId: string): Promise<VectorStoreDeleteResponse>');
    expect(vectorStoresApi.content).toContain('async search(vectorStoreId: string, body: SearchVectorStoreRequest): Promise<VectorStoreSearchResponse>');
    expect(vectorStoresApi.content).toContain('async create(vectorStoreId: string, body: CreateVectorStoreFileRequest): Promise<VectorStoreFileObject>');
    expect(vectorStoresApi.content).toContain('async retrieve(vectorStoreId: string, fileId: string): Promise<VectorStoreFileObject>');
    expect(vectorStoresApi.content).toContain('async content(vectorStoreId: string, fileId: string): Promise<VectorStoreFileContentResponse>');
    expect(vectorStoresApi.content).toContain('async cancel(vectorStoreId: string, batchId: string): Promise<VectorStoreFileBatchObject>');
    expect(vectorStoresApi.content).toContain('async listFiles(vectorStoreId: string, batchId: string): Promise<ListVectorStoreFilesResponse>');
    expect(vectorStoresApi.content).not.toContain('public readonly content:');
    expect(vectorStoresApi.content).not.toContain('public readonly cancel:');
    expect(vectorStoresApi.content).not.toContain('public readonly files: VectorStoresFileBatchesFilesApi;');

    const fineTuningApi = getGeneratedFile(result.files, 'src/api/fine-tuning.ts');
    expect(fineTuningApi.content).toContain('export class FineTuningApi');
    expect(fineTuningApi.content).toContain('public readonly jobs: FineTuningJobsApi;');
    expect(fineTuningApi.content).toContain('public readonly checkpoints: FineTuningCheckpointsApi;');
    expect(fineTuningApi.content).toContain('public readonly checkpoints: FineTuningJobsCheckpointsApi;');
    expect(fineTuningApi.content).toContain('public readonly permissions: FineTuningCheckpointsPermissionsApi;');
    expect(fineTuningApi.content).toContain('async create(body: CreateFineTuningJobRequest): Promise<FineTuningJobObject>');
    expect(fineTuningApi.content).toContain('async list(): Promise<ListFineTuningJobsResponse>');
    expect(fineTuningApi.content).toContain('async retrieve(fineTuningJobId: string): Promise<FineTuningJobObject>');
    expect(fineTuningApi.content).toContain('async cancel(fineTuningJobId: string): Promise<FineTuningJobObject>');
    expect(fineTuningApi.content).toContain('async pause(fineTuningJobId: string): Promise<FineTuningJobObject>');
    expect(fineTuningApi.content).toContain('async resume(fineTuningJobId: string): Promise<FineTuningJobObject>');
    expect(fineTuningApi.content).toContain('async listEvents(fineTuningJobId: string): Promise<ListFineTuningEventsResponse>');
    expect(fineTuningApi.content).toContain('async list(fineTuningJobId: string): Promise<ListFineTuningCheckpointsResponse>');
    expect(fineTuningApi.content).toContain('async create(fineTunedModelCheckpoint: string, body: PermissionCreateRequest): Promise<PermissionCreateResponse>');
    expect(fineTuningApi.content).toContain('async retrieve(fineTunedModelCheckpoint: string): Promise<PermissionRetrieveResponse>');
    expect(fineTuningApi.content).toContain('async delete(fineTunedModelCheckpoint: string, permissionId: string): Promise<PermissionDeleteResponse>');
    expect(fineTuningApi.content).not.toContain('public readonly events:');
  });

  it('keeps canonical OpenAI method names when duplicate prefixed paths exist', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(baseConfig, {
      openapi: '3.0.3',
      info: { title: 'Duplicate Path API', version: '1.0.0' },
      paths: {
        '/v1/chat/completions/{completion_id}': {
          get: {
            summary: 'Retrieve chat completion',
            operationId: 'getCompletion',
            tags: ['Chat'],
            parameters: [pathParam('completion_id')],
            responses: jsonOk(schemaRef('ChatCompletionObject')),
          },
        },
        '/ai/v3/chat/completions/{completion_id}': {
          get: {
            summary: 'Retrieve chat completion',
            operationId: 'chat__getCompletion',
            tags: ['chat'],
            parameters: [pathParam('completion_id')],
            responses: jsonOk(schemaRef('ChatCompletionObject')),
          },
        },
        '/v1/chat/completions': {
          get: {
            summary: 'List chat completions',
            operationId: 'listCompletions',
            tags: ['Chat'],
            responses: jsonOk(schemaRef('ChatCompletionListObject')),
          },
          post: {
            summary: 'Create chat completion',
            operationId: 'createChatCompletion',
            tags: ['Chat'],
            requestBody: jsonRequestBody(schemaRef('CreateChatCompletionRequest')),
            responses: jsonOk(schemaRef('ChatCompletionObject')),
          },
        },
        '/ai/v3/chat/completions': {
          get: {
            summary: 'List chat completions',
            operationId: 'chat__listCompletions',
            tags: ['chat'],
            responses: jsonOk(schemaRef('ChatCompletionListObject')),
          },
          post: {
            summary: 'Create chat completion',
            operationId: 'chat__createChatCompletion',
            tags: ['chat'],
            requestBody: jsonRequestBody(schemaRef('CreateChatCompletionRequest')),
            responses: jsonOk(schemaRef('ChatCompletionObject')),
          },
        },
      },
      components: {
        schemas: {
          ChatCompletionObject: objectSchema,
          ChatCompletionListObject: objectSchema,
          CreateChatCompletionRequest: objectSchema,
        },
      },
    });

    expect(result.errors).toEqual([]);

    const chatApi = getGeneratedFile(result.files, 'src/api/chat.ts');
    expect(chatApi.content).toContain('async retrieve(completionId: string): Promise<ChatCompletionObject>');
    expect(chatApi.content).toContain('async list(): Promise<ChatCompletionListObject>');
    expect(chatApi.content).toContain('async create(body: CreateChatCompletionRequest): Promise<ChatCompletionObject>');
    expect(chatApi.content).not.toContain('async getRetrieve(');
    expect(chatApi.content).not.toContain('async getList(');
    expect(chatApi.content).not.toContain('async createCreateChatCompletion(');
  });

  it('can enable nested resource surface for one app SDK tag without sdkwork-v3 global validation', async () => {
    const generator = new TypeScriptGenerator();
    const result = await generator.generate(
      {
        ...baseConfig,
        name: 'SdkworkAppSdk',
        sdkType: 'app',
        apiPrefix: '/app/v3/api',
      },
      {
        openapi: '3.0.3',
        info: { title: 'SDKWork app API', version: '1.0.0' },
        tags: [
          {
            name: 'billing',
            'x-sdk-nested-resource-surface': true,
          },
        ],
        paths: {
          '/app/v3/api/billing/account/summary': {
            get: {
              summary: 'Retrieve account summary',
              operationId: 'account.summary.retrieve',
              tags: ['billing'],
              responses: jsonOk(schemaRef('AccountSummaryResult')),
            },
          },
          '/app/v3/api/billing/account/points/recharges': {
            post: {
              summary: 'Create points recharge',
              operationId: 'account.points.recharges.create',
              tags: ['billing'],
              requestBody: jsonRequestBody(schemaRef('PointsRechargeRequest')),
              responses: jsonOk(schemaRef('PointsRechargeResult')),
            },
          },
          '/app/v3/api/billing/vip/purchase/renew': {
            post: {
              summary: 'Renew VIP purchase',
              operationId: 'vip.purchase.renew',
              tags: ['billing'],
              requestBody: jsonRequestBody(schemaRef('VipPurchaseRequest')),
              responses: jsonOk(schemaRef('VipPurchaseResult')),
            },
          },
          '/app/v3/api/profile/current': {
            get: {
              summary: 'Legacy profile operation remains flat',
              operationId: 'profile__current',
              tags: ['profile'],
              responses: jsonOk(schemaRef('ProfileResult')),
            },
          },
        },
        components: {
          schemas: {
            AccountSummaryResult: objectSchema,
            PointsRechargeRequest: objectSchema,
            PointsRechargeResult: objectSchema,
            VipPurchaseRequest: objectSchema,
            VipPurchaseResult: objectSchema,
            ProfileResult: objectSchema,
          },
        },
      },
    );

    expect(result.errors).toEqual([]);

    const sdkFile = getGeneratedFile(result.files, 'src/sdk.ts');
    expect(sdkFile.content).toContain('public readonly billing: BillingApi;');
    expect(sdkFile.content).not.toContain('public readonly account:');
    expect(sdkFile.content).not.toContain('public readonly vip:');

    const billingApi = getGeneratedFile(result.files, 'src/api/billing.ts');
    expect(billingApi.content).toContain('public readonly account: BillingAccountApi;');
    expect(billingApi.content).toContain('public readonly vip: BillingVipApi;');
    expect(billingApi.content).toContain('public readonly summary: BillingAccountSummaryApi;');
    expect(billingApi.content).toContain('public readonly points: BillingAccountPointsApi;');
    expect(billingApi.content).toContain('public readonly recharges: BillingAccountPointsRechargesApi;');
    expect(billingApi.content).toContain('public readonly purchase: BillingVipPurchaseApi;');
    expect(billingApi.content).toContain('async retrieve(): Promise<AccountSummaryResult>');
    expect(billingApi.content).toContain('async create(body: PointsRechargeRequest): Promise<PointsRechargeResult>');
    expect(billingApi.content).toContain('async renew(body: VipPurchaseRequest): Promise<VipPurchaseResult>');
    expect(billingApi.content).not.toContain('async accountSummaryRetrieve');
    expect(billingApi.content).not.toContain('async vipPurchaseRenew');

    const profileApi = getGeneratedFile(result.files, 'src/api/profile.ts');
    expect(profileApi.content).toContain('async current(): Promise<ProfileResult>');
    expect(profileApi.content).not.toContain('public readonly current:');
  });
});
