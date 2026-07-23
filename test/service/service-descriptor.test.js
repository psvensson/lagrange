import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  assertServiceDescriptor,
  normalizeServiceDescriptor,
  validateServiceDescriptor,
} from '../../src/service/service-descriptor.js';
import {ServiceDescriptorValidationError} from '../../src/service/service-lifecycle-errors.js';
import {RUNTIME_KIND, UNIFIED_SERVICE_TYPE} from '../../src/constants/index.js';

describe('service descriptor normalization', () => {
  it('normalizes snake_case fields into canonical camelCase', () => {
    const normalized = normalizeServiceDescriptor({
      service_id: 'svc-normalized',
      service_type: UNIFIED_SERVICE_TYPE.PARTITION,
      tenant_id: 'tenant-1',
      replica_count: 3,
      runtime_kind: RUNTIME_KIND.NATIVE_JS,
      runtime_ref: null,
      runtime_config: '{"x":1}',
    });

    assert.equal(normalized.serviceId, 'svc-normalized');
    assert.equal(normalized.serviceType, UNIFIED_SERVICE_TYPE.PARTITION);
    assert.equal(normalized.tenantId, 'tenant-1');
    assert.equal(normalized.replicaCount, 3);
    assert.equal(normalized.runtimeKind, RUNTIME_KIND.NATIVE_JS);
    assert.equal(normalized.runtimeConfig, '{"x":1}');
  });

  it('preserves immutable request Cell runtime extensions', () => {
    const normalized = normalizeServiceDescriptor({
      service_id: 'request-cell',
      service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      replica_count: 1,
      runtime_kind: RUNTIME_KIND.WASM_COMPONENT,
      runtime_ref: 'registry.test/request-cell@sha256:abc',
      runtime_config: '{"export_name":"run"}',
      binding_digest: 'sha256:binding',
      binding_projection: '{"binding":"projection"}',
      binding_version_id: 'binding-version',
      resource_budget: '{"memory_bytes":65536}',
    });

    assert.equal(normalized.binding_digest, 'sha256:binding');
    assert.equal(
      normalized.binding_projection,
      '{"binding":"projection"}',
    );
    assert.equal(normalized.binding_version_id, 'binding-version');
    assert.equal(
      normalized.resource_budget,
      '{"memory_bytes":65536}',
    );
  });
});

describe('service descriptor validation by service kind', () => {
  it('accepts partition descriptors with canonical fields', () => {
    const result = validateServiceDescriptor({
      serviceId: 'partition-svc',
      serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
      replicaCount: 3,
      runtimeKind: RUNTIME_KIND.NATIVE_JS,
      runtimeRef: null,
      runtimeConfig: '{"shard":"p1"}',
    });

    assert.equal(result.valid, true);
  });

  it('accepts message-group descriptors with canonical fields', () => {
    const result = validateServiceDescriptor({
      serviceId: 'msg-group-svc',
      serviceType: UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
      replicaCount: 3,
      runtimeKind: RUNTIME_KIND.NATIVE_JS,
      runtimeRef: null,
      runtimeConfig: '{"raft":true}',
    });

    assert.equal(result.valid, true);
  });

  it('accepts runtime-service descriptors with canonical fields', () => {
    const result = validateServiceDescriptor({
      serviceId: 'runtime-svc',
      serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      replicaCount: 2,
      runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
      runtimeRef: 'runtime-svc@sha256:abc',
      runtimeConfig: '{"entry":"run"}',
    });

    assert.equal(result.valid, true);
  });

  it('rejects descriptors missing runtime_kind', () => {
    const result = validateServiceDescriptor({
      serviceId: 'missing-runtime-kind',
      serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      replicaCount: 1,
      runtimeRef: null,
      runtimeConfig: null,
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((entry) => entry.includes('runtime_kind')));
  });

  it('enforces adapter resolution when adapterResolver is configured', () => {
    const result = validateServiceDescriptor(
      {
        serviceId: 'svc-needs-adapter',
        serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
        replicaCount: 1,
        runtimeKind: RUNTIME_KIND.NATIVE_JS,
        runtimeRef: null,
        runtimeConfig: '{}',
      },
      {
        adapterResolver: (_serviceType) => null,
      },
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((entry) => entry.includes('adapterResolver')));
  });

  it('assertServiceDescriptor throws typed validation error', () => {
    assert.throws(
      () => {
        assertServiceDescriptor({
          serviceId: 'bad-descriptor',
          serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
          replicaCount: -1,
          runtimeKind: RUNTIME_KIND.NATIVE_JS,
          runtimeRef: null,
          runtimeConfig: '{}',
        });
      },
      (error) => {
        assert.ok(error instanceof ServiceDescriptorValidationError);
        assert.ok(error.validationErrors.length > 0);
        return true;
      },
    );
  });
});
