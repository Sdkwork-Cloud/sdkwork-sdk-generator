import { readFileSync } from 'node:fs';

import type {
  RpcIdempotencyMode,
  RpcMethodDefinition,
  RpcServiceDefinition,
  RpcServiceManifest,
  RpcStreamingMode,
  RpcSurface,
} from '../framework/types.js';

const VALID_SURFACES = new Set<RpcSurface>(['app', 'backend', 'internal', 'common']);
const VALID_STREAMING = new Set<RpcStreamingMode>(['unary', 'server', 'client', 'bidi']);
const VALID_IDEMPOTENCY = new Set<RpcIdempotencyMode>(['none', 'optional', 'required']);

export function loadRpcManifest(manifestPath: string): RpcServiceManifest {
  return validateRpcManifest(JSON.parse(stripJsonBom(readFileSync(manifestPath, 'utf-8'))));
}

export function validateRpcManifest(value: unknown): RpcServiceManifest {
  const manifest = requireRecord(value, 'RPC manifest');
  if (manifest.schemaVersion !== 1) {
    throw new Error('RPC manifest schemaVersion must be 1.');
  }
  if (manifest.kind !== 'sdkwork.rpc.manifest') {
    throw new Error('RPC manifest kind must be sdkwork.rpc.manifest.');
  }

  const domain = requireString(manifest.domain, 'RPC manifest domain');
  const sdkFamily = requireString(manifest.sdkFamily, 'RPC manifest sdkFamily');
  if (!Array.isArray(manifest.services)) {
    throw new Error('RPC manifest services must be an array.');
  }

  const seenMethods = new Set<string>();
  const services: RpcServiceDefinition[] = manifest.services.map((serviceValue, serviceIndex) => {
    const service = requireRecord(serviceValue, `RPC manifest service[${serviceIndex}]`);
    const packageName = requireString(service.package, `RPC manifest service[${serviceIndex}].package`);
    const serviceName = requireString(service.service, `RPC manifest service[${serviceIndex}].service`);
    const surface = requireString(service.surface, `RPC manifest service[${serviceIndex}].surface`) as RpcSurface;
    if (!VALID_SURFACES.has(surface)) {
      throw new Error(`Unsupported RPC surface: ${surface}.`);
    }
    if (!Array.isArray(service.methods)) {
      throw new Error(`RPC manifest service ${serviceName} methods must be an array.`);
    }

    const methods: RpcMethodDefinition[] = service.methods.map((methodValue, methodIndex) => {
      const method = requireRecord(methodValue, `RPC manifest method[${methodIndex}]`);
      const methodName = requireString(method.method, `RPC manifest ${serviceName}.methods[${methodIndex}].method`);
      const operationId = requireString(method.operationId, `RPC manifest ${serviceName}.${methodName}.operationId`);
      const auth = requireString(method.auth, `RPC manifest ${serviceName}.${methodName}.auth`);
      const idempotency = requireString(method.idempotency, `RPC manifest ${serviceName}.${methodName}.idempotency`) as RpcIdempotencyMode;
      if (!VALID_IDEMPOTENCY.has(idempotency)) {
        throw new Error(`Unsupported RPC idempotency mode: ${idempotency}.`);
      }
      const streaming = requireString(method.streaming, `RPC manifest ${serviceName}.${methodName}.streaming`) as RpcStreamingMode;
      if (!VALID_STREAMING.has(streaming)) {
        throw new Error(`Unsupported RPC streaming mode: ${streaming}.`);
      }
      const owner = requireString(method.owner, `RPC manifest ${serviceName}.${methodName}.owner`);
      const compatibility = requireString(method.compatibility, `RPC manifest ${serviceName}.${methodName}.compatibility`);
      const key = `${packageName}.${serviceName}/${methodName}`;
      if (seenMethods.has(key)) {
        throw new Error(`Duplicate RPC method: ${key}.`);
      }
      seenMethods.add(key);
      return {
        method: methodName,
        operationId,
        auth,
        idempotency,
        streaming,
        owner,
        compatibility,
      };
    });

    return {
      package: packageName,
      service: serviceName,
      surface,
      methods,
    };
  });

  return {
    schemaVersion: 1,
    kind: 'sdkwork.rpc.manifest',
    domain,
    sdkFamily,
    services,
  };
}

export function listRpcManifestMethods(manifest: RpcServiceManifest): RpcMethodDefinition[] {
  return manifest.services.flatMap((service) => service.methods);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function stripJsonBom(content: string): string {
  return content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
}
