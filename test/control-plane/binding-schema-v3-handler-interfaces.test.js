/**
 * Guard test for Binding schema v3 handler interfaces
 * (binding-schema-v3-handler-interfaces).
 *
 * A v3 Binding target declares interface (request_v2/call_v2) plus
 * handler_id and omits export_name; it validates, normalizes, binds
 * against a manifest carrying the *_v2 export declarations, and reaches
 * Cell readiness through the existing owners — with the interface ->
 * fixed-export mapping owned by the deployment-binding contract's single
 * mapping constant (mirroring component-export-resolution). Schema v2
 * bindings and *_v1 interfaces normalize and activate byte-for-byte as
 * before (the backward-compat corpus).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  DEPLOYMENT_BINDING_ERROR_CODE,
  DEPLOYMENT_BINDING_SCHEMA_VERSION_V3,
  DEPLOYMENT_BINDING_V3_FIXED_EXPORT,
  DEPLOYMENT_BINDING_V3_INTERFACE,
  bindDeploymentArtifact,
  buildBindingRow,
  declarationExportName,
  expectedSourceInterface,
  normalizeDeploymentBinding,
  normalizeStoredDeploymentBinding,
  projectBinding,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  EXTERNAL_SERVICE_EXPORT_INTERFACE,
  validateExternalServiceManifest,
} from '../../src/service/external-service-manifest.js';
import {
  buildRuntimeConfigProbe,
  projectRequestCellRuntimeProbe,
} from './helpers/binding-v3-probe.js';

const PACKAGE_ID = `service-package-${'a'.repeat(64)}`;
const MANIFEST_DIGEST = `sha256:${'b'.repeat(64)}`;
const ARTIFACT_DIGEST = `sha256:${'c'.repeat(64)}`;
const BUDGETS = Object.freeze({
  context_bytes: 8192,
  cpu_time_ms: 100,
  input_bytes: 4096,
  memory_bytes: 1048576,
  output_bytes: 4096,
  wall_time_ms: 1000,
});
const SECURITY_CONTEXT = Object.freeze({
  principal: 'tester',
  roles: Object.freeze(['application']),
  tenantId: 'tenant-a',
});
const CREATED_AT = 1_700_000_000_000;

function v3Manifest(exports) {
  const manifest = {
    artifact: {
      digest: ARTIFACT_DIGEST,
      media_type: 'application/wasm',
      ref: 'registry.example.test/services/v3-service:1.0.0',
      size_bytes: 4096,
      type: 'oci',
    },
    exports,
    name: 'v3-service',
    runtime: {kind: 'wasm_component'},
    schema_version: 3,
    version: '1.0.0',
  };
  const validation = validateExternalServiceManifest(manifest);
  assert.equal(validation.valid, true,
    JSON.stringify(validation.errors));
  return validation.manifest ?? manifest;
}

function v3RequestBinding(overrides = {}) {
  return {
    budgets: {...BUDGETS},
    name: 'v3-service--request--account-summary',
    schema_version: DEPLOYMENT_BINDING_SCHEMA_VERSION_V3,
    source: {kind: 'request', method: 'POST', path: '/accounts/summary'},
    target: {
      handler_id: 'accountSummary',
      interface: 'request_v2',
      manifest_digest: MANIFEST_DIGEST,
      package_id: PACKAGE_ID,
    },
    ...overrides,
  };
}

function v3CallBinding() {
  return {
    budgets: {...BUDGETS},
    name: 'v3-service--call--summarize-activity',
    schema_version: DEPLOYMENT_BINDING_SCHEMA_VERSION_V3,
    source: {
      kind: 'call',
      name: 'v3-service--call--summarize-activity',
      statement: 'SELECT amount_cents FROM account_activity',
    },
    target: {
      handler_id: 'summarizeActivity',
      interface: 'call_v2',
      manifest_digest: MANIFEST_DIGEST,
      package_id: PACKAGE_ID,
    },
  };
}

test('v3 request and call targets normalize through the binding ' +
  'contract with handler_id and no export_name',
() => {
  const request = normalizeDeploymentBinding(v3RequestBinding());
  assert.equal(request.schema_version, 3);
  assert.equal(request.target.handler_id, 'accountSummary');
  assert.equal(request.target.interface, 'request_v2');
  assert.equal(Object.hasOwn(request.target, 'export_name'), false,
    'v3 targets never carry a developer-supplied export_name');
  assert.ok(Object.isFrozen(request));

  const call = normalizeDeploymentBinding(v3CallBinding());
  assert.equal(call.target.handler_id, 'summarizeActivity');
  assert.equal(call.target.interface, 'call_v2');

  // The derived fixed exports come from the single mapping constant.
  assert.equal(declarationExportName(request), 'handle-request');
  assert.equal(declarationExportName(call), 'run');
  assert.equal(
    DEPLOYMENT_BINDING_V3_FIXED_EXPORT[
      DEPLOYMENT_BINDING_V3_INTERFACE.request],
    'handle-request');
});

test('v3 rejects export_name, v1 interfaces, unknown v2 interfaces, ' +
  'bad handler ids, and v3 on non-cell source kinds',
() => {
  const invalid = [
    // export_name smuggled alongside the v3 shape
    {
      ...v3RequestBinding(),
      target: {...v3RequestBinding().target, export_name: 'serve'},
    },
    // v1 interface on a v3 record
    {
      ...v3RequestBinding(),
      target: {...v3RequestBinding().target, interface: 'request_v1'},
    },
    // call_v2 interface on a request binding
    {
      ...v3RequestBinding(),
      target: {...v3RequestBinding().target, interface: 'call_v2'},
    },
    // handler_id with kebab/space/leading-digit shapes
    {
      ...v3RequestBinding(),
      target: {...v3RequestBinding().target, handler_id: 'bad-id'},
    },
    {
      ...v3RequestBinding(),
      target: {...v3RequestBinding().target, handler_id: '1bad'},
    },
    {
      ...v3RequestBinding(),
      target: {...v3RequestBinding().target, handler_id: ''},
    },
    // v3 on a source kind with no generic-dispatch interface
    {
      ...v3RequestBinding(),
      source: {kind: 'time', interval_ms: 1000},
    },
    // unknown interface string
    {
      ...v3RequestBinding(),
      target: {...v3RequestBinding().target, interface: 'request_v9'},
    },
  ];
  for (const candidate of invalid) {
    assert.throws(
      () => normalizeDeploymentBinding(candidate),
      (error) => {
        assert.equal(error.name, 'DeploymentBindingError');
        return [
          DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD,
          DEPLOYMENT_BINDING_ERROR_CODE.INTERFACE_MISMATCH,
        ].includes(error.code);
      },
      JSON.stringify(candidate.target ?? candidate.source),
    );
  }
});

test('v3 bindings bind against a manifest carrying *_v2 exports and ' +
  'reach Cell readiness with handler_id in the runtime config',
() => {
  const manifest = v3Manifest([
    {interface: 'call_v2', name: 'run'},
    {interface: 'call_v2', name: 'reduce'},
    {interface: 'request_v2', name: 'handle-request'},
  ]);
  const artifact = {
    artifactDigest: ARTIFACT_DIGEST,
    manifest,
    manifestDigest: MANIFEST_DIGEST,
    packageId: PACKAGE_ID,
  };

  const requestBound = bindDeploymentArtifact(
    normalizeDeploymentBinding(v3RequestBinding()), artifact);
  assert.equal(requestBound.target.interface, 'request_v2');

  const callBound = bindDeploymentArtifact(
    normalizeDeploymentBinding(v3CallBinding()), artifact);
  assert.equal(callBound.target.interface, 'call_v2');

  // A manifest that declares only v1 exports cannot satisfy a v3
  // binding (interface mismatch through the same owner rule).
  const v1OnlyManifest = v3Manifest([
    {interface: 'request_v1', name: 'handle-request'},
    {interface: 'call_v1', name: 'run'},
    {interface: 'call_v1', name: 'reduce'},
  ]);
  assert.throws(
    () => bindDeploymentArtifact(
      normalizeDeploymentBinding(v3RequestBinding()),
      {...artifact, manifest: v1OnlyManifest}),
    (error) => error.code === DEPLOYMENT_BINDING_ERROR_CODE.ARTIFACT_NOT_FOUND ||
      error.code === DEPLOYMENT_BINDING_ERROR_CODE.INTERFACE_MISMATCH,
  );

  // System-table row + projection: the fixed export is derived, never
  // authored, and the row round-trips through the stored-binding
  // normalizer.
  const row = buildBindingRow(requestBound, SECURITY_CONTEXT, CREATED_AT);
  assert.equal(row.export_name, 'handle-request');
  const projected = projectBinding(row);
  assert.equal(
    projected.declaration.target.handler_id, 'accountSummary');
  const restored = normalizeStoredDeploymentBinding(
    JSON.parse(row.normalized_binding));
  assert.equal(restored.schema_version, 3);
  assert.equal(declarationExportName(restored), 'handle-request');

  // Cell readiness: the runtime config the definition owner builds
  // carries the derived fixed export plus the handler id, and the
  // request-cell runtime contract projects it (placement/readiness only
  // — invocation semantics are the next rung).
  const runtimeConfig = buildRuntimeConfigProbe(requestBound, manifest);
  const parsed = JSON.parse(runtimeConfig);
  assert.deepEqual(parsed, {
    export_name: 'handle-request',
    handler_id: 'accountSummary',
  });
  const runtime = projectRequestCellRuntimeProbe({
    binding: requestBound,
    bindingRow: row,
    manifest,
    runtimeConfig,
  });
  assert.equal(runtime.exportName, 'handle-request');
  assert.equal(runtime.handlerId, 'accountSummary');
});

test('schema v2 bindings and *_v1 interfaces normalize byte-for-byte ' +
  'as before (backward-compat corpus)',
() => {
  // Corpus: one binding per source kind at schema v2, normalized
  // through the SAME owner before and after the v3 addition — the
  // normalized output must be identical to the pre-change shape
  // (schema_version pinned to 2, no v3 fields synthesized).
  const corpus = [
    {
      budgets: {...BUDGETS},
      name: 'orders-api',
      schema_version: 2,
      source: {kind: 'request', method: 'POST', path: '/orders'},
      target: {
        export_name: 'serve',
        manifest_digest: MANIFEST_DIGEST,
        package_id: PACKAGE_ID,
      },
    },
    {
      budgets: {...BUDGETS},
      name: 'ledger-call',
      schema_version: 2,
      source: {kind: 'call', name: 'ledger-call'},
      target: {
        export_name: 'run',
        manifest_digest: MANIFEST_DIGEST,
        package_id: PACKAGE_ID,
      },
    },
    {
      budgets: {...BUDGETS},
      name: 'orders-cdc',
      schema_version: 2,
      source: {
        kind: 'change',
        operations: ['insert'],
        tables: ['table:global.orders'],
      },
      target: {
        export_name: 'on-change',
        manifest_digest: MANIFEST_DIGEST,
        package_id: PACKAGE_ID,
      },
    },
    {
      budgets: {...BUDGETS},
      name: 'hourly-sweep',
      schema_version: 2,
      source: {kind: 'time', interval_ms: 3_600_000},
      target: {
        export_name: 'tick',
        manifest_digest: MANIFEST_DIGEST,
        package_id: PACKAGE_ID,
      },
    },
  ];
  for (const declaration of corpus) {
    const normalized = normalizeDeploymentBinding(declaration);
    assert.equal(normalized.schema_version, 2,
      `${declaration.name} stays a v2 record`);
    assert.equal(Object.hasOwn(normalized.target, 'handler_id'), false);
    assert.equal(Object.hasOwn(normalized.target, 'interface'), false);
    assert.equal(normalized.target.export_name,
      declaration.target.export_name);
    // The effective export and expected interface for a v2 record are
    // the authored export and the *_v1 interface — unchanged semantics.
    assert.equal(declarationExportName(normalized),
      declaration.target.export_name);
    assert.match(
      expectedSourceInterface(
        normalized.source.kind, normalized.schema_version),
      /_v1$/u);
  }

  // A v2 request binding activates (bind + row + projection) exactly as
  // before against a v1-interface manifest.
  const manifest = v3Manifest([
    {interface: 'request_v1', name: 'serve'},
  ]);
  const bound = bindDeploymentArtifact(
    normalizeDeploymentBinding(corpus[0]), {
      artifactDigest: ARTIFACT_DIGEST,
      manifest,
      manifestDigest: MANIFEST_DIGEST,
      packageId: PACKAGE_ID,
    });
  const row = buildBindingRow(bound, SECURITY_CONTEXT, CREATED_AT);
  assert.equal(row.export_name, 'serve');
  assert.equal(projectBinding(row).declaration.schema_version, 2);
});

test('the manifest owner admits request_v2 and call_v2 export ' +
  'interfaces alongside the *_v1 set',
() => {
  assert.equal(EXTERNAL_SERVICE_EXPORT_INTERFACE.REQUEST_V2, 'request_v2');
  assert.equal(EXTERNAL_SERVICE_EXPORT_INTERFACE.CALL_V2, 'call_v2');
  const validation = validateExternalServiceManifest({
    artifact: {
      digest: ARTIFACT_DIGEST,
      media_type: 'application/wasm',
      ref: 'registry.example.test/services/v3-service:1.0.0',
      type: 'oci',
    },
    exports: [
      {interface: 'request_v2', name: 'handle-request'},
      {interface: 'call_v2', name: 'run'},
      {interface: 'request_v1', name: 'serve'},
    ],
    name: 'mixed-service',
    runtime: {kind: 'wasm_component'},
    schema_version: 3,
    version: '1.0.0',
  });
  assert.equal(validation.valid, true,
    JSON.stringify(validation.errors));
});
