import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  EXTERNAL_SERVICE_MANIFEST_SCHEMA,
  EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
  EXTERNAL_SERVICE_MEDIA_TYPE,
  EXTERNAL_SERVICE_MANIFEST_ERROR_CODE,
  normalizeExternalServiceManifest,
  validateExternalServiceManifest,
} from '../../src/service/external-service-manifest.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';

const SHA256_A = `sha256:${'a'.repeat(64)}`;
const STABLE_EXPORT_INTERFACES = Object.freeze([
  'boot_v1',
  'call_v1',
  'change_v1',
  'once_v1',
  'pushdown_v1',
  'request_v1',
  'time_v1',
]);

function makeManifest(overrides = {}) {
  const manifest = {
    schema_version: EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
    name: 'analytics-worker',
    version: '3.0.0',
    exports: [{name: 'serve', interface: 'request_v1'}],
    artifact: {
      type: 'oci',
      ref: 'registry.example.test/services/analytics-worker:3.0.0',
      digest: SHA256_A,
      media_type: EXTERNAL_SERVICE_MEDIA_TYPE.OCI_CONTAINER,
    },
    runtime: {
      kind: RUNTIME_KIND.OCI_CONTAINER,
      runtime_options: {memory_limit_mb: 512},
    },
  };
  return {
    ...manifest,
    ...overrides,
    artifact: {...manifest.artifact, ...overrides.artifact},
    runtime: {...manifest.runtime, ...overrides.runtime},
  };
}

function rejectionCodes(result) {
  assert.equal(result.status, 'rejected');
  return result.errors.map((error) => error.code);
}

describe('external service manifest contract', () => {
  it('exports an immutable, explicitly versioned schema', () => {
    assert.equal(EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION, 3);
    assert.equal(
      EXTERNAL_SERVICE_MANIFEST_SCHEMA.properties.schema_version.const,
      EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
    );
    assert.equal(Object.isFrozen(EXTERNAL_SERVICE_MANIFEST_SCHEMA), true);
    assert.equal(Object.isFrozen(
      EXTERNAL_SERVICE_MANIFEST_SCHEMA.properties.capabilities.items,
    ), true);
    assert.equal(
      Object.hasOwn(EXTERNAL_SERVICE_MANIFEST_SCHEMA.properties, 'replication'),
      false,
    );
  });

  it('keeps table access out of current Artifact exports', () => {
    const accepted = validateExternalServiceManifest(makeManifest({
      exports: [
        {name: 'write-audit', interface: 'change_v1'},
        {name: 'serve', interface: 'request_v1'},
      ],
    }));
    assert.equal(accepted.valid, true);
    assert.deepEqual(accepted.manifest.exports, [
      {interface: 'request_v1', name: 'serve'},
      {interface: 'change_v1', name: 'write-audit'},
    ]);
    for (const field of ['reads', 'writes']) {
      const rejected = validateExternalServiceManifest(makeManifest({
        exports: [{
          name: 'serve',
          interface: 'request_v1',
          [field]: [],
        }],
      }));
      assert.equal(rejected.valid, false, field);
    }
  });

  it('canonicalizes current export declarations', () => {
    const result = validateExternalServiceManifest(makeManifest({
      exports: [
        {
          name: 'write-audit',
          interface: 'change_v1',
        },
        {
          name: 'serve',
          interface: 'request_v1',
        },
      ],
    }));
    assert.equal(result.valid, true);
    assert.deepEqual(result.manifest.exports, [
      {
        interface: 'request_v1',
        name: 'serve',
      },
      {
        interface: 'change_v1',
        name: 'write-audit',
      },
    ]);
    assert.equal(Object.isFrozen(result.manifest.exports), true);
    assert.equal(Object.isFrozen(result.manifest.exports[0]), true);
  });

  it('rejects caller-owned Cell replication', () => {
    const result = normalizeExternalServiceManifest(makeManifest({
      replication: {
        mode: 'replicated_service',
        replicas: 9,
        placement: {avoid_same_host: true},
      },
    }));

    assert.ok(rejectionCodes(result).includes(
      EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.INVALID_FIELD,
    ));
    assert.ok(result.errors.some((error) => error.path === '/replication'));
  });

  it('accepts every stable interface without carrying access policy', () => {
    for (const [index, interface_] of STABLE_EXPORT_INTERFACES.entries()) {
      const result = validateExternalServiceManifest(makeManifest({
        exports: [{
          name: `handler-${index}`,
          interface: interface_,
        }],
      }));
      assert.equal(result.valid, true, interface_);
      assert.deepEqual(result.manifest.exports[0], {
        interface: interface_,
        name: `handler-${index}`,
      });
    }
  });

  it('rejects ambiguous or non-exact export declarations', () => {
    const attacks = [
      makeManifest({exports: []}),
      makeManifest({exports: [{
        name: 'serve', interface: '',
      }]}),
      makeManifest({exports: [{
        name: 'serve', interface: 'request_v1',
        reads: ['table:global.orders'],
      }]}),
      makeManifest({exports: [{
        name: 'serve', interface: 'request_v1', extra: true,
      }]}),
      makeManifest({exports: [
        {name: 'serve', interface: 'request_v1'},
        {name: 'serve', interface: 'call_v1'},
      ]}),
      makeManifest({exports: [{
        name: 'serve', interface: 'request_v2',
      }]}),
      makeManifest({exports: [{
        name: 'Serve', interface: 'request_v1',
      }]}),
      makeManifest({exports: [{
        name: 'serve',
      }]}),
    ];
    for (const attack of attacks) {
      assert.equal(validateExternalServiceManifest(attack).valid, false);
    }
  });

  it('accepts and deterministically normalizes digest-pinned OCI containers', () => {
    const input = makeManifest({
      display_name: 'Analytics Worker',
      capabilities: ['state.kv'],
      optional_future_field: {ignored: true},
      artifact: {
        size_bytes: 89200000,
        optional_future_field: 'ignored',
      },
      runtime: {
        optional_future_field: 'ignored',
      },
    });

    const first = normalizeExternalServiceManifest(input);
    const second = normalizeExternalServiceManifest(input);

    assert.equal(first.status, 'accepted');
    assert.deepEqual(first, second);
    assert.equal(Object.isFrozen(first.manifest), true);
    assert.equal(Object.isFrozen(first.manifest.artifact), true);
    assert.equal(first.manifest.optional_future_field, undefined);
    assert.equal(first.manifest.artifact.optional_future_field, undefined);
    assert.equal(first.manifest.runtime.optional_future_field, undefined);
    assert.equal(input.optional_future_field.ignored, true);
  });

  it('accepts a digest-pinned WASM component with matching OCI payload media', () => {
    const result = validateExternalServiceManifest(makeManifest({
      name: 'ranking-component',
      artifact: {media_type: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT},
      runtime: {
        kind: RUNTIME_KIND.WASM_COMPONENT,
        entrypoint: 'ranking-component.wasm',
      },
    }));

    assert.equal(result.valid, true);
    assert.equal(result.manifest.runtime.kind, RUNTIME_KIND.WASM_COMPONENT);
  });

  it('rejects native_js and every unknown external runtime kind', () => {
    for (const kind of [RUNTIME_KIND.NATIVE_JS, 'future_runtime']) {
      const codes = rejectionCodes(normalizeExternalServiceManifest(
        makeManifest({runtime: {kind}}),
      ));
      assert.ok(codes.includes(
        EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.UNSUPPORTED_RUNTIME_KIND,
      ));
    }
  });

  it('rejects absent and unsupported schema versions', () => {
    const missing = makeManifest();
    delete missing.schema_version;
    const missingCodes = rejectionCodes(normalizeExternalServiceManifest(missing));
    assert.ok(missingCodes.includes(
      EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.REQUIRED_FIELD,
    ));

    const unsupportedCodes = rejectionCodes(normalizeExternalServiceManifest(
      makeManifest({schema_version: 4}),
    ));
    assert.ok(unsupportedCodes.includes(
      EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.UNSUPPORTED_SCHEMA_VERSION,
    ));
  });

  it('rejects absent or malformed immutable artifact digests', () => {
    for (const digest of [undefined, 'sha256:abc123', `sha256:${'A'.repeat(64)}`]) {
      const manifest = makeManifest({artifact: {digest}});
      if (digest === undefined) delete manifest.artifact.digest;
      const codes = rejectionCodes(normalizeExternalServiceManifest(manifest));
      assert.ok(codes.includes(
        digest === undefined ?
          EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.REQUIRED_FIELD :
          EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.INVALID_DIGEST,
      ));
    }
  });

  it('rejects non-OCI packaging and unrecognized payload media', () => {
    const typeCodes = rejectionCodes(normalizeExternalServiceManifest(
      makeManifest({artifact: {type: 'tar'}}),
    ));
    assert.ok(typeCodes.includes(
      EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.UNSUPPORTED_ARTIFACT_TYPE,
    ));

    const mediaCodes = rejectionCodes(normalizeExternalServiceManifest(
      makeManifest({artifact: {media_type: 'application/octet-stream'}}),
    ));
    assert.ok(mediaCodes.includes(
      EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.UNSUPPORTED_MEDIA_TYPE,
    ));
  });

  it('rejects recognized runtime and media types when their pairing is wrong', () => {
    const result = normalizeExternalServiceManifest(makeManifest({
      artifact: {media_type: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT},
      runtime: {kind: RUNTIME_KIND.OCI_CONTAINER},
    }));

    assert.ok(rejectionCodes(result).includes(
      EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.RUNTIME_MEDIA_MISMATCH,
    ));
  });

  it('fails closed for non-object and non-JSON inputs', () => {
    const cyclic = {};
    cyclic.self = cyclic;

    const objectNormalizingToNull = {toJSON: () => null};
    for (const value of [null, [], 'manifest', objectNormalizingToNull, cyclic]) {
      const codes = rejectionCodes(normalizeExternalServiceManifest(value));
      assert.ok(codes.includes(
        value === cyclic ?
          EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.MANIFEST_NOT_JSON :
          EXTERNAL_SERVICE_MANIFEST_ERROR_CODE.MANIFEST_NOT_OBJECT,
      ));
    }
  });
});
