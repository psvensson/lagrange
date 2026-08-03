/**
 * End-to-end request-call bridge round trip through the REAL
 * WasiComponentCellRuntime + wasi-component-cell-worker.js + the
 * componentized combined service-cell fixture guest: an authorized
 * request invocation carrying `options.bindingCallDelegate` gets a live
 * synchronous `call-binding` host import bridged over the shared-buffer
 * host-call protocol to the async delegate on the parent thread.
 *
 * Proves: the guest receives the delegate's result string; a typed
 * delegate refusal surfaces to the guest as the WIT binding-call-error;
 * without a delegate the existing call_bridge_unavailable refusal
 * stands; and a CALL-mode invocation never receives a live bridge even
 * when the options carry a delegate (mode restriction holds).
 */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {componentize} from '@bytecodealliance/componentize-js';
import {canonicalJson} from
  '../../src/control-plane/owners/deployment-binding-contract.js';
import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';
import {toCellBatch} from
  '../../src/runtime/call-cell-value-mapping.js';
import {HOST_CALL_ERROR_CODE} from
  '../../src/runtime/cell-host-call-protocol.js';
import {
  PREPARE_STATUS,
  START_STATUS,
} from '../../src/runtime/runtime-driver.js';
import {WasmComponentDriver} from
  '../../src/runtime/wasm-component-driver.js';
import {createRequestCellCallBridge} from
  '../../src/service/request-cell-call-bridge.js';
import {normalizeExternalServiceManifest} from
  '../../src/service/external-service-manifest.js';

const CANONICAL_WIT_DIRECTORY = new URL('../../wit', import.meta.url);
const GUEST_SOURCE_URL = new URL(
  '../wasm-service/fixtures/service-cell-world/guest.js',
  import.meta.url,
);
const AUTHORING_WORLD = 'service-cell';
const CELL_WORLD = Object.freeze({
  CALL: 'call-cell',
  REQUEST: 'request-cell',
});
const CELL_EXPORT = Object.freeze({
  HANDLE_REQUEST: 'handleRequest',
  RUN: 'run',
});
const DISABLED_ENGINE_FEATURES = [
  'random',
  'stdio',
  'clocks',
  'http',
  'fetch-event',
];
const EMIT_BUDGET = 4;
const BRIDGE_UNAVAILABLE_CODE = 'call_bridge_unavailable';
const CALL_MODE_REFUSAL_CODE = 'not_available_in_call_mode';
const CELL_BUDGETS = Object.freeze({
  context_bytes: 1024,
  cpu_time_ms: 60000,
  input_bytes: 1048576,
  memory_bytes: 512 * 1024 * 1024,
  output_bytes: 1048576,
  wall_time_ms: 300000,
});
const BATCH_ROWS = Object.freeze([Object.freeze({amount: 5})]);

// Driver-path fixture identity for the production-wiring test: a real
// request-cell binding projection whose bound artifact is a componentized
// request-world guest probing `call-binding`.
const REQUEST_WORLD = 'request-cell';
const REQUEST_WORLD_EXPORT = 'run';
const BRIDGE_SERVICE_ID = 'request-cell-bridge-driver-service';
const BRIDGE_ARTIFACT_DIGEST = `sha256:${'d'.repeat(64)}`;
const BRIDGE_PACKAGE_ID = `service-package-${'e'.repeat(64)}`;
const BRIDGE_BINDING_DIGEST = `sha256:${'f'.repeat(64)}`;
const BRIDGE_BINDING_VERSION_ID = 'binding-version-request-call-bridge';
const BRIDGE_TENANT_ID = 'tenant-bridge';
const BRIDGE_TARGET_NAME = 'account-summary';
const BRIDGE_UNDECLARED_NAME = 'undeclared-target';
const BRIDGE_CANNED_RESULT_JSON = '{"summary":"ok","via":"invoker"}';
const BRIDGE_DEADLINE_DEFAULT_MS = 30000;
const BRIDGE_BUDGETS = Object.freeze({
  context_bytes: 1024,
  cpu_time_ms: 60000,
  input_bytes: 1048576,
  memory_bytes: 512 * 1024 * 1024,
  output_bytes: 1048576,
  wall_time_ms: 300000,
});
const REQUEST_WORLD_GUEST_SOURCE = `
import {callBinding} from 'lagrange:cell/context';

export function run(request) {
  const parsed = JSON.parse(request);
  try {
    return JSON.stringify({
      value: callBinding(parsed.name, parsed.arguments),
    });
  } catch (error) {
    return JSON.stringify({callBinding: error.payload ?? String(error)});
  }
}
`;

let componentPromise = null;
let requestWorldComponentPromise = null;

function componentizeCombinedGuest() {
  componentPromise ??= readFile(GUEST_SOURCE_URL, 'utf8')
    .then((guestSource) => componentize(guestSource, {
      disableFeatures: DISABLED_ENGINE_FEATURES,
      witPath: CANONICAL_WIT_DIRECTORY.pathname,
      worldName: AUTHORING_WORLD,
    }))
    .then(({component}) => component);
  return componentPromise;
}

function componentizeRequestWorldGuest() {
  requestWorldComponentPromise ??=
    componentize(REQUEST_WORLD_GUEST_SOURCE, {
      disableFeatures: DISABLED_ENGINE_FEATURES,
      witPath: CANONICAL_WIT_DIRECTORY.pathname,
      worldName: REQUEST_WORLD,
    }).then(({component}) => component);
  return requestWorldComponentPromise;
}

function sha256Of(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function bridgeManifest() {
  const result = normalizeExternalServiceManifest({
    artifact: {
      digest: BRIDGE_ARTIFACT_DIGEST,
      media_type: 'application/wasm',
      ref: 'registry.example.test/acme/request-call-bridge:1.0.0',
      type: 'oci',
    },
    capabilities: ['clock.read'],
    exports: [{interface: 'request_v1', name: REQUEST_WORLD_EXPORT}],
    name: 'request-call-bridge',
    runtime: {kind: 'wasm_component'},
    schema_version: 3,
    version: '1.0.0',
  });
  assert.equal(result.status, 'accepted');
  return result.manifest;
}

function bridgeDefinition(manifestDigest) {
  const declaration = {
    budgets: {...BRIDGE_BUDGETS},
    capabilities: ['clock.read'],
    name: 'request-call-bridge-binding',
    schema_version: 2,
    source: {kind: 'request', method: 'POST', path: '/bridge'},
    target: {
      export_name: REQUEST_WORLD_EXPORT,
      manifest_digest: manifestDigest,
      package_id: BRIDGE_PACKAGE_ID,
    },
  };
  return {
    binding_digest: BRIDGE_BINDING_DIGEST,
    binding_projection: JSON.stringify({
      binding_digest: BRIDGE_BINDING_DIGEST,
      binding_version_id: BRIDGE_BINDING_VERSION_ID,
      declaration,
      tenant_id: BRIDGE_TENANT_ID,
    }),
    binding_version_id: BRIDGE_BINDING_VERSION_ID,
    resource_budget: JSON.stringify(BRIDGE_BUDGETS),
    runtime_config: JSON.stringify({export_name: REQUEST_WORLD_EXPORT}),
    runtime_kind: 'wasm_component',
    runtime_ref: 'registry.example.test/acme/request-call-bridge:1.0.0@' +
      BRIDGE_ARTIFACT_DIGEST,
    service_id: BRIDGE_SERVICE_ID,
    tenantId: BRIDGE_TENANT_ID,
  };
}

function createCell(componentBytes, world, exportName) {
  return Object.freeze({
    budgets: CELL_BUDGETS,
    bytes: new Uint8Array(componentBytes),
    capabilities: ['declared'],
    exportName,
    serviceId: `service-cell-bridge-${world}`,
    world,
  });
}

function readNoContexts() {
  return [];
}

function writeNoEffects() {}

function callBindingProbe(name, argumentsJson) {
  return [JSON.stringify({
    arguments: argumentsJson,
    name,
    probe: 'call-binding',
  })];
}

async function invokeRequestCell(cellRuntime, cell, args, options) {
  const value = await cellRuntime.invoke(
    cell.serviceId,
    args,
    readNoContexts,
    writeNoEffects,
    () => {},
    options,
  );
  return JSON.parse(value);
}

test('request invocation with a delegate: the guest receives the ' +
    'bridged binding-call result',
async () => {
  const component = await componentizeCombinedGuest();
  const cellRuntime = new WasiComponentCellRuntime();
  const cell = createCell(
    component, CELL_WORLD.REQUEST, CELL_EXPORT.HANDLE_REQUEST);
  const delegateCalls = [];
  await cellRuntime.start(cell);
  try {
    const parsed = await invokeRequestCell(
      cellRuntime,
      cell,
      callBindingProbe('account-summary', '{"month":"2026-07"}'),
      {
        bindingCallDelegate: async (call) => {
          delegateCalls.push(call);
          return JSON.stringify({summary: 'ok', via: call.name});
        },
      },
    );
    assert.deepEqual(
      JSON.parse(parsed.value),
      {summary: 'ok', via: 'account-summary'},
      'the delegate result string reached the guest through the ' +
          'synchronous call-binding import',
    );
    assert.deepEqual(delegateCalls, [{
      argumentsJson: '{"month":"2026-07"}',
      name: 'account-summary',
    }]);
  } finally {
    await cellRuntime.stop(cell.serviceId);
  }
});

test('request invocation with a refusing delegate: the guest sees the ' +
    'typed binding-call-error',
async () => {
  const component = await componentizeCombinedGuest();
  const cellRuntime = new WasiComponentCellRuntime();
  const cell = createCell(
    component, CELL_WORLD.REQUEST, CELL_EXPORT.HANDLE_REQUEST);
  await cellRuntime.start(cell);
  try {
    const parsed = await invokeRequestCell(
      cellRuntime,
      cell,
      callBindingProbe('forbidden-binding', '{}'),
      {
        bindingCallDelegate: async () => {
          throw Object.assign(new Error('binding not authorized'), {
            code: HOST_CALL_ERROR_CODE.TARGET_NOT_ALLOWED,
          });
        },
      },
    );
    assert.deepEqual(parsed.callBinding, {
      code: HOST_CALL_ERROR_CODE.TARGET_NOT_ALLOWED,
      message: 'binding not authorized',
      retryable: false,
    });
  } finally {
    await cellRuntime.stop(cell.serviceId);
  }
});

test('request invocation without a delegate keeps the typed ' +
    'call_bridge_unavailable refusal',
async () => {
  const component = await componentizeCombinedGuest();
  const cellRuntime = new WasiComponentCellRuntime();
  const cell = createCell(
    component, CELL_WORLD.REQUEST, CELL_EXPORT.HANDLE_REQUEST);
  await cellRuntime.start(cell);
  try {
    const parsed = await invokeRequestCell(
      cellRuntime,
      cell,
      callBindingProbe('account-summary', '{}'),
      {},
    );
    assert.equal(parsed.callBinding.code, BRIDGE_UNAVAILABLE_CODE);
    assert.equal(parsed.callBinding.retryable, false);
  } finally {
    await cellRuntime.stop(cell.serviceId);
  }
});

test('production wiring: the driver-injected RequestCellCallBridge ' +
    'authorizes and delegates a guest binding call end to end',
async () => {
  const componentBytes = await componentizeRequestWorldGuest();
  const manifest = bridgeManifest();
  const manifestDigest = sha256Of(canonicalJson(manifest));
  const artifact = {
    artifactDigest: BRIDGE_ARTIFACT_DIGEST,
    bytes: componentBytes,
    manifest,
    manifestDigest,
    packageId: BRIDGE_PACKAGE_ID,
    payloadDigest: sha256Of(Buffer.from(componentBytes)),
  };
  const invokerRequests = [];
  const policyLookups = [];
  const bridge = createRequestCellCallBridge({
    callCellInvoker: {
      invoke: async (request) => {
        invokerRequests.push(request);
        return BRIDGE_CANNED_RESULT_JSON;
      },
    },
    deadlineDefaultMs: BRIDGE_DEADLINE_DEFAULT_MS,
    runtimeAccessPolicyOwner: {
      getOutboundCallPolicy: async (serviceId) => {
        policyLookups.push(serviceId);
        return Object.freeze({
          calls: Object.freeze([BRIDGE_TARGET_NAME]),
          status: 'resolved',
        });
      },
    },
  });
  const driver = new WasmComponentDriver({
    artifactLoader: async () => artifact,
    componentRuntime: new WasiComponentCellRuntime(),
  });
  driver.setRequestCallBridge((bridgeCall) => bridge.invoke(bridgeCall));
  const prepared = await driver.prepare(bridgeDefinition(manifestDigest));
  assert.equal(prepared.status, PREPARE_STATUS.READY, prepared.error);
  const replicaContext = {
    queryExecutor: {
      getRuntimeAccessPolicy: async () => ({
        policy: {tables: []},
        status: 'resolved',
      }),
    },
    serviceId: BRIDGE_SERVICE_ID,
  };
  const started = await driver.start(replicaContext);
  assert.equal(started.status, START_STATUS.RUNNING, started.error);
  try {
    const securityContext = Object.freeze({
      principal: 'app-bridge',
      roles: Object.freeze(['application']),
      tenantId: BRIDGE_TENANT_ID,
    });
    const invocation = {
      args: callBindingProbe(BRIDGE_TARGET_NAME, '{"month":"2026-07"}'),
      deadlineMs: Date.now() + BRIDGE_DEADLINE_DEFAULT_MS,
      invocationId: 'request-invocation-42',
      invocationServiceId: BRIDGE_SERVICE_ID,
      securityContext,
    };
    const value = await driver.invoke(replicaContext, invocation);
    const parsed = JSON.parse(value);
    assert.deepEqual(
      JSON.parse(parsed.value),
      JSON.parse(BRIDGE_CANNED_RESULT_JSON),
      'the invoker result reached the guest through the driver-injected ' +
          'bridge',
    );
    assert.deepEqual(policyLookups, [BRIDGE_SERVICE_ID],
      'the outbound-call policy was read for the source request Cell');
    assert.equal(invokerRequests.length, 1);
    assert.equal(invokerRequests[0].name, BRIDGE_TARGET_NAME);
    assert.equal(invokerRequests[0].argumentsJson, '{"month":"2026-07"}');
    assert.equal(invokerRequests[0].invocationId,
      'request-invocation-42#call-1',
      'the delegated call runs under the system-owned child identity');
    assert.equal(invokerRequests[0].securityContext, securityContext,
      'the receiver-threaded frozen security context is preserved');
    assert.ok(invokerRequests[0].deadlineMs <= invocation.deadlineMs,
      'the composed deadline never exceeds the outer budget');

    const refusedValue = await driver.invoke(replicaContext, {
      ...invocation,
      args: callBindingProbe(BRIDGE_UNDECLARED_NAME, '{}'),
    });
    const refused = JSON.parse(refusedValue);
    assert.equal(refused.callBinding.code,
      HOST_CALL_ERROR_CODE.TARGET_NOT_ALLOWED,
      'an undeclared target surfaces to the guest as target_not_allowed');
    assert.equal(refused.callBinding.retryable, false);
    assert.equal(invokerRequests.length, 1,
      'the undeclared target never reached the invoker');
  } finally {
    await driver.stop(replicaContext);
  }
});

test('call-mode invocation never receives a live bridge even when the ' +
    'options carry a delegate',
async () => {
  const component = await componentizeCombinedGuest();
  const cellRuntime = new WasiComponentCellRuntime();
  const cell = createCell(component, CELL_WORLD.CALL, CELL_EXPORT.RUN);
  let delegateInvocations = 0;
  await cellRuntime.start(cell);
  try {
    const batch = toCellBatch(BATCH_ROWS, BATCH_ROWS.length);
    const runInvocation = await cellRuntime.invoke(
      cell.serviceId,
      [batch, '{}'],
      readNoContexts,
      writeNoEffects,
      () => {},
      {
        bindingCallDelegate: async () => {
          delegateInvocations += 1;
          return 'never-authorized-in-call-mode';
        },
        callContext: {emitBudget: EMIT_BUDGET, nestedCallBudget: 0},
        exportName: CELL_EXPORT.RUN,
      },
    );
    const runResult = JSON.parse(runInvocation.value);
    assert.equal(runResult.callBindingRefusal.code, CALL_MODE_REFUSAL_CODE);
    assert.equal(delegateInvocations, 0,
      'the delegate must never be reached from call mode');
  } finally {
    await cellRuntime.stop(cell.serviceId);
  }
});
