import { describe, expect, it } from 'vitest';

import type { GeneratorConfig } from '../../framework/types.js';
import { getGenerator } from '../../index.js';
import { discriminatedContentSpec } from '../../../test-support/discriminated-content-spec.js';

const pythonConfig: GeneratorConfig = {
  name: 'SdkworkAppSdk',
  version: '1.0.0',
  language: 'python' as any,
  sdkType: 'app',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/app/v3/api',
  packageName: 'sdkwork-notes-app-sdk-python',
};

describe('Python generator regressions', () => {
  it('generates oneOf content parts as a discriminated union instead of one wide dataclass', async () => {
    const generator = getGenerator('python' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(pythonConfig, discriminatedContentSpec);
    const contentPartFile = result.files.find(
      (file) => file.path === 'sdkwork_notes_app_sdk_python/models/content_part.py'
    );
    const mediaContentPartFile = result.files.find(
      (file) => file.path === 'sdkwork_notes_app_sdk_python/models/media_content_part.py'
    );

    expect(result.errors).toEqual([]);
    expect(contentPartFile).toBeDefined();
    expect(mediaContentPartFile).toBeDefined();
    expect(contentPartFile!.content).toContain('ContentPart = Union[TextContentPart, DataContentPart, MediaContentPart, SignalContentPart, StreamRefContentPart]');
    expect(contentPartFile!.content).toContain('def content_part_from_dict(value: Dict[str, Any]) -> ContentPart:');
    expect(contentPartFile!.content).toContain("if kind == 'media':");
    expect(contentPartFile!.content).toContain('return MediaContentPart(**value)');
    expect(contentPartFile!.content).not.toContain('class ContentPart:');
    expect(contentPartFile!.content).not.toContain('drive: Optional[DriveReference]');
    expect(mediaContentPartFile!.content).toContain('class MediaContentPart:');
    expect(mediaContentPartFile!.content).toContain('drive: DriveReference');
    expect(mediaContentPartFile!.content).toContain('resource: MediaResource');
    expect(mediaContentPartFile!.content).not.toContain('drive: Optional[DriveReference]');
    expect(mediaContentPartFile!.content).not.toContain('resource: Optional[MediaResource]');
  });
});
