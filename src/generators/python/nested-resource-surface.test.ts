import { describe, expect, it } from 'vitest';
import type { ApiSpec, GeneratorConfig } from '../../framework/types.js';
import { PythonGenerator } from './index.js';

const objectSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
  },
};

const baseConfig: GeneratorConfig = {
  name: 'SdkworkAppSdk',
  version: '1.0.0',
  language: 'python',
  sdkType: 'app',
  outputPath: './test-output',
  apiSpecPath: './openapi.json',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/app/v3/api',
  packageName: 'sdkwork-app-sdk-python',
  generateTests: true,
};

function schemaRef(name: string): { $ref: string } {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonOk(schema: { $ref: string }): { description: string; content: Record<string, unknown> } {
  return {
    description: 'Success',
    content: {
      'application/json': { schema },
    },
  };
}

function jsonRequestBody(schema: { $ref: string }): { required: boolean; content: Record<string, unknown> } {
  return {
    required: true,
    content: {
      'application/json': { schema },
    },
  };
}

function getGeneratedFile(files: Array<{ path: string; content: string }>, path: string): { path: string; content: string } {
  const file = files.find((candidate) => candidate.path === path);
  expect(file).toBeDefined();
  return file!;
}

const billingNestedSurfaceSpec: ApiSpec = {
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
        responses: { '200': jsonOk(schemaRef('AccountSummaryResult')) },
      },
    },
    '/app/v3/api/billing/account/points/recharges': {
      post: {
        summary: 'Create points recharge',
        operationId: 'account.points.recharges.create',
        tags: ['billing'],
        requestBody: jsonRequestBody(schemaRef('PointsRechargeRequest')),
        responses: { '200': jsonOk(schemaRef('PointsRechargeResult')) },
      },
    },
    '/app/v3/api/billing/vip/purchase/renew': {
      post: {
        summary: 'Renew VIP purchase',
        operationId: 'vip.purchase.renew',
        tags: ['billing'],
        requestBody: jsonRequestBody(schemaRef('VipPurchaseRequest')),
        responses: { '200': jsonOk(schemaRef('VipPurchaseResult')) },
      },
    },
    '/app/v3/api/profile/current': {
      get: {
        summary: 'Profile stays flat',
        operationId: 'profile.current',
        tags: ['profile'],
        responses: { '200': jsonOk(schemaRef('ProfileResult')) },
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
};

describe('Python nested resource surface', () => {
  it('can enable nested billing resources for one app SDK tag without flattening methods', async () => {
    const result = await new PythonGenerator().generate(baseConfig, billingNestedSurfaceSpec);

    expect(result.errors).toEqual([]);

    const clientFile = getGeneratedFile(result.files, 'sdkwork_app_sdk_python/client.py');
    expect(clientFile.content).toContain('self.billing: BillingApi');
    expect(clientFile.content).not.toContain('self.account:');
    expect(clientFile.content).not.toContain('self.vip:');

    const billingApi = getGeneratedFile(result.files, 'sdkwork_app_sdk_python/api/billing.py');
    expect(billingApi.content).toContain('class BillingApi:');
    expect(billingApi.content).toContain('self.account = BillingAccountApi(client)');
    expect(billingApi.content).toContain('class BillingAccountApi:');
    expect(billingApi.content).toContain('self.summary = BillingAccountSummaryApi(client)');
    expect(billingApi.content).toContain('self.points = BillingAccountPointsApi(client)');
    expect(billingApi.content).toContain('class BillingAccountPointsRechargesApi:');
    expect(billingApi.content).toContain('class BillingVipPurchaseApi:');
    expect(billingApi.content).toContain('def retrieve(self) -> AccountSummaryResult:');
    expect(billingApi.content).toContain('def create(self, body: PointsRechargeRequest) -> PointsRechargeResult:');
    expect(billingApi.content).toContain('def renew(self, body: VipPurchaseRequest) -> VipPurchaseResult:');
    expect(billingApi.content).not.toContain('def account_summary_retrieve');
    expect(billingApi.content).not.toContain('def vip_purchase_renew');

    const profileApi = getGeneratedFile(result.files, 'sdkwork_app_sdk_python/api/profile.py');
    expect(profileApi.content).toContain('def current(self) -> ProfileResult:');
    expect(profileApi.content).not.toContain('self.current =');

    const readme = getGeneratedFile(result.files, 'README.md');
    expect(readme.content).toContain('result = client.billing.account.summary.retrieve()');
    expect(readme.content).not.toContain('client.billing.account_summary_retrieve');

    const smokeTest = getGeneratedFile(result.files, 'tests/test_sdk_smoke.py');
    expect(smokeTest.content).toContain('client.billing.account.summary.retrieve()');
    expect(smokeTest.content).not.toContain('client.billing.account_summary_retrieve');
  });
});
