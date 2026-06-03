import { describe, expect, it } from 'vitest';

import type { GeneratorConfig } from '../../framework/types.js';
import { getGenerator } from '../../index.js';
import { discriminatedContentSpec } from '../../../test-support/discriminated-content-spec.js';

const goConfig: GeneratorConfig = {
  name: 'SdkworkAppSdk',
  version: '1.0.0',
  language: 'go' as any,
  sdkType: 'app',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/app/v3/api',
};

describe('Go generator regressions', () => {
  it('generates oneOf content parts as a kind-dispatched union instead of one wide DTO', async () => {
    const generator = getGenerator('go' as any);
    expect(generator).toBeDefined();

    const result = await generator!.generate(goConfig, discriminatedContentSpec);
    const contentPartFile = result.files.find((file) => file.path === 'types/content_part.go');
    const mediaContentPartFile = result.files.find((file) => file.path === 'types/media_content_part.go');

    expect(result.errors).toEqual([]);
    expect(contentPartFile).toBeDefined();
    expect(mediaContentPartFile).toBeDefined();
    expect(contentPartFile!.content).toContain('type ContentPart struct {');
    expect(contentPartFile!.content).toContain('Value ContentPartValue');
    expect(contentPartFile!.content).toContain('type ContentPartValue interface {');
    expect(contentPartFile!.content).toContain('isContentPart()');
    expect(contentPartFile!.content).toContain('func (v MediaContentPart) isContentPart() {}');
    expect(contentPartFile!.content).toContain('func (v *ContentPart) UnmarshalJSON(data []byte) error');
    expect(contentPartFile!.content).toContain('case "media":');
    expect(contentPartFile!.content).toContain('var value MediaContentPart');
    expect(contentPartFile!.content).toContain('func (v ContentPart) MarshalJSON() ([]byte, error)');
    expect(contentPartFile!.content).not.toContain('Encoding string `json:"encoding"`');
    expect(contentPartFile!.content).not.toContain('Drive DriveReference `json:"drive"`');
    expect(mediaContentPartFile!.content).toContain('Drive DriveReference `json:"drive"`');
    expect(mediaContentPartFile!.content).toContain('Resource MediaResource `json:"resource"`');
  });
});
