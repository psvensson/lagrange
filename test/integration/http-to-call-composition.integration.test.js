/**
 * Multi-node HTTP-to-call composition proof: one combined service-cell
 * component (handle-request + run + reduce) deployed twice over the
 * shared two-node production composition — call Cells on BOTH nodes
 * (partitions split across them), plus a request Cell driven through the
 * REAL ServiceRuntimeLifecycle + WasmComponentDriver whose
 * RequestCellCallBridge is attached by the REAL attachCallCellInvoker
 * bootstrap module (wasmComponentDriver + the REAL
 * RuntimeAccessPolicyOwner reading a real CONFIG-row v2 calls policy).
 *
 * Proves: the request handler's bridged callBinding reaches the one
 * CallCellInvoker and returns the reduced JSON as the HTTP response;
 * two shard runs genuinely overlap across the nodes (rendezvous
 * barrier); raw shard rows never cross the router; the inner call runs
 * under the system-owned child identity `<outer>#call-1`; an undeclared
 * target surfaces to the guest as typed target_not_allowed before any
 * dispatch; outer replay through the durable invocation fence returns
 * the journaled response without re-running the inner call; and one
 * injected shard failure yields no visible reduce result.
 */

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {describe, it} from 'node:test';

import {componentize} from '@bytecodealliance/componentize-js';
import Database from 'better-sqlite3';

import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schema-sql.js';
import {
  WASM_OPERATIONS_SCHEMA,
} from '../../src/bootstrap/system-table-runtime-schema-definitions.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {canonicalJson} from
  '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  RuntimeAccessPolicyOwner,
} from '../../src/control-plane/owners/runtime-access-policy-owner.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {ServiceRuntimeLifecycle} from
  '../../src/runtime/service-runtime-lifecycle.js';
import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';
import {WasmComponentDriver} from
  '../../src/runtime/wasm-component-driver.js';
import {normalizeExternalServiceManifest} from
  '../../src/service/external-service-manifest.js';
import {
  CALL_SERVICE_NAME,
  DECLARED_TABLE,
  EXPECTED_RESULT_JSON,
  NODE_A,
  NODE_B,
  SECURITY_CONTEXT,
  TENANT_ID,
  TOP_N,
  composeTwoNodeDeployment,
} from './call-cell-two-node-deployment-fixture.js';

const AUTHORING_WORLD = 'service-cell';
const CANONICAL_WIT_DIRECTORY = new URL('../../wit', import.meta.url);
const COMPONENTIZE_DISABLED_FEATURES = Object.freeze([
  'random',
  'stdio',
  'clocks',
  'http',
  'fetch-event',
]);
const REQUEST_EXPORT = 'handle-request';
const REQUEST_SERVICE_ID = 'binding-service-http-to-call';
const REQUEST_ARTIFACT_DIGEST = `sha256:${'e'.repeat(64)}`;
const REQUEST_PACKAGE_ID = `service-package-${'f'.repeat(64)}`;
const REQUEST_BINDING_DIGEST = `sha256:${'a'.repeat(64)}`;
const REQUEST_BINDING_VERSION_ID = 'binding-version-http-to-call';
const REQUEST_ARTIFACT_REF =
  'registry.example.test/acme/http-to-call:1.0.0';
const HTTP_METHOD = 'POST';
const HTTP_PATH = '/accounts/summary';
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_FORBIDDEN = 403;
const TARGET_NOT_ALLOWED_CODE = 'target_not_allowed';
const UNDECLARED_TARGET = 'undeclared-target';
const OUTER_DEADLINE_MS = 60000;
const OUTER_INTENT_DIGEST = `sha256:${'1'.repeat(64)}`;
const OUTER_INVOCATION = Object.freeze({
  FAILED_SHARD: 'http-to-call-outer-shard-failure',
  PRIMARY: 'http-to-call-outer-primary',
  UNDECLARED: 'http-to-call-outer-undeclared',
});
const CHILD_CALL_SUFFIX = '#call-1';
const BARRIER_TIMEOUT_MS = 15000;
const PARALLEL_LIMIT = 2;
const INJECTED_SHARD_FAILURE = 'injected shard failure';
const REQUEST_BUDGETS = Object.freeze({
  context_bytes: 4096,
  cpu_time_ms: 60000,
  input_bytes: 1048576,
  memory_bytes: 512 * 1024 * 1024,
  output_bytes: 1048576,
  wall_time_ms: 300000,
});

// The combined guest: the same top-N shard/reduce logic the two-node
// composition's oracle expects, plus an HTTP handler that invokes the
// declared Call Binding through the bridged host import and owns its
// endpoint's status mapping. `body.target` is the refusal probe: the
// HOST validates it against the outbound-call policy before dispatch.
const COMBINED_GUEST_SOURCE = `
import {callBinding} from 'lagrange:cell/context';
import {emit} from 'lagrange:cell/call-context';

const INNER_CALL_BINDING = '${CALL_SERVICE_NAME}';
const HTTP_STATUS_BY_CALL_ERROR_CODE = {
  deadline_exhausted: 504,
  invalid_arguments: 400,
  target_not_allowed: 403,
  target_unavailable: 503,
};

export function handleRequest(requestJson) {
  const request = JSON.parse(requestJson);
  const target = typeof request.body?.target === 'string' ?
    request.body.target :
    INNER_CALL_BINDING;
  try {
    const result = callBinding(
      target, JSON.stringify({topN: request.body.topN}));
    return JSON.stringify({
      body: result,
      headers: [['content-type', 'application/json']],
      status: 200,
    });
  } catch (error) {
    const failure = error?.payload ?? {};
    return JSON.stringify({
      body: JSON.stringify({code: failure.code ?? 'target_failed'}),
      headers: [['content-type', 'application/json']],
      status: HTTP_STATUS_BY_CALL_ERROR_CODE[failure.code] ?? 500,
    });
  }
}

export function run(batch, argumentsJson) {
  const {topN} = JSON.parse(argumentsJson);
  const scored = [];
  for (const row of batch) {
    let id = null;
    let score = null;
    for (const column of row.columns) {
      if (column.name === 'id' && column.val.tag === 'integer') {
        id = String(column.val.val);
      }
      if (column.name === 'score' && column.val.tag === 'real') {
        score = column.val.val;
      }
    }
    if (id !== null && score !== null) scored.push({id, score});
  }
  scored.sort((a, b) => b.score - a.score);
  for (const candidate of scored) {
    emit(candidate.id, JSON.stringify(candidate.score));
  }
  return JSON.stringify({kept: Math.min(scored.length, topN)});
}

export function reduce(partials, argumentsJson) {
  const {topN} = JSON.parse(argumentsJson);
  const merged = partials.map(([key, partial]) => ({
    key,
    score: JSON.parse(partial),
  }));
  merged.sort((a, b) => b.score - a.score);
  return JSON.stringify(merged.slice(0, topN));
}
`;

let combinedComponentPromise = null;
function componentizeCombinedGuest() {
  combinedComponentPromise ??= componentize(COMBINED_GUEST_SOURCE, {
    disableFeatures: [...COMPONENTIZE_DISABLED_FEATURES],
    witPath: CANONICAL_WIT_DIRECTORY.pathname,
    worldName: AUTHORING_WORLD,
  }).then(({component}) => component);
  return combinedComponentPromise;
}

function sha256Of(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

// ONE manifest for the one combined Artifact: both entry points are
// declared exports of the same digest-pinned component (brief: "One
// Artifact, Two Bindings").
function requestManifest() {
  const result = normalizeExternalServiceManifest({
    artifact: {
      digest: REQUEST_ARTIFACT_DIGEST,
      media_type: 'application/wasm',
      ref: REQUEST_ARTIFACT_REF,
      type: 'oci',
    },
    capabilities: [],
    exports: [
      {interface: 'request_v1', name: REQUEST_EXPORT},
      {interface: 'call_v1', name: 'run'},
    ],
    name: 'http-to-call',
    runtime: {kind: 'wasm_component'},
    schema_version: 3,
    version: '1.0.0',
  });
  assert.equal(result.status, 'accepted');
  return result.manifest;
}

// The request Binding's service definition row, targeting the WIT
// kebab-case export name — the canonical worker-side kebab-to-camel
// resolution is what makes this deployable.
function requestDefinition(manifestDigest) {
  const declaration = {
    budgets: {...REQUEST_BUDGETS},
    capabilities: [],
    name: 'http-to-call-binding',
    schema_version: 2,
    source: {kind: 'request', method: HTTP_METHOD, path: HTTP_PATH},
    target: {
      export_name: REQUEST_EXPORT,
      manifest_digest: manifestDigest,
      package_id: REQUEST_PACKAGE_ID,
    },
  };
  return {
    binding_digest: REQUEST_BINDING_DIGEST,
    binding_projection: JSON.stringify({
      binding_digest: REQUEST_BINDING_DIGEST,
      binding_version_id: REQUEST_BINDING_VERSION_ID,
      declaration,
      tenant_id: TENANT_ID,
    }),
    binding_version_id: REQUEST_BINDING_VERSION_ID,
    resource_budget: JSON.stringify(REQUEST_BUDGETS),
    runtime_config: JSON.stringify({export_name: REQUEST_EXPORT}),
    runtime_kind: 'wasm_component',
    runtime_ref: `${REQUEST_ARTIFACT_REF}@${REQUEST_ARTIFACT_DIGEST}`,
    service_id: REQUEST_SERVICE_ID,
    tenantId: TENANT_ID,
  };
}

// Real durable-fence journal: the registered wasm_operations schema in
// real SQLite, with the journal's $N placeholders mapped positionally.
function createInvocationJournal() {
  const database = new Database(':memory:');
  database.exec(generateCreateTableSQL(WASM_OPERATIONS_SCHEMA));
  for (const indexSql of generateCreateIndexSQL(WASM_OPERATIONS_SCHEMA)) {
    database.exec(indexSql);
  }
  const executeInternal = async (sql, params = []) => {
    const ordered = [];
    const converted = sql.replace(/\$(\d+)/gu, (_match, index) => {
      ordered.push(params[Number(index) - 1]);
      return '?';
    });
    try {
      if (/^\s*SELECT/iu.test(converted)) {
        return {
          rows: database.prepare(converted).all(...ordered),
          success: true,
        };
      }
      const outcome = database.prepare(converted).run(...ordered);
      return {affectedRows: outcome.changes, success: true};
    } catch (error) {
      return {error: error.message, success: false};
    }
  };
  return {
    close: () => database.close(),
    executeInternal,
  };
}

// The REAL RuntimeAccessPolicyOwner over a real CONFIG row in the shared
// system table cache: the stored v2 policy declares exactly one outbound
// call target for the request Cell's derived service identity.
function composeOutboundCallPolicy(systemTableCache) {
  const stored = {
    binding_version_id: REQUEST_BINDING_VERSION_ID,
    calls: [{binding: CALL_SERVICE_NAME}],
    schema_version: 2,
    service_id: REQUEST_SERVICE_ID,
    tables: [],
    tenant_id: TENANT_ID,
  };
  systemTableCache.applySystemTableChange(
    TABLES.CONFIG,
    CDC_OPERATION.UPSERT,
    {
      config_key: `runtime.access.service.${REQUEST_SERVICE_ID}`,
      config_value: JSON.stringify(stored),
      value_type: 'json',
    },
  );
  return new RuntimeAccessPolicyOwner({
    // The read path never resolves Bindings by name; the dependency is
    // required by the owner contract for the CONFIGURE write path only.
    bindingOwner: {getBindingByName: async () => null},
    controlPlaneSystemTableGateway: new ControlPlaneSystemTableGateway({
      nodeId: NODE_A,
      systemTableCache,
    }),
    systemTableCache,
  });
}

async function composeRequestCell(testContext, componentBytes) {
  const manifest = requestManifest();
  const manifestDigest = sha256Of(canonicalJson(manifest));
  const artifact = {
    artifactDigest: REQUEST_ARTIFACT_DIGEST,
    bytes: componentBytes,
    manifest,
    manifestDigest,
    packageId: REQUEST_PACKAGE_ID,
    payloadDigest: sha256Of(Buffer.from(componentBytes)),
  };
  const driver = new WasmComponentDriver({
    artifactLoader: async () => artifact,
    componentRuntime: new WasiComponentCellRuntime(),
  });
  const registry = new RuntimeDriverRegistry();
  registry.register(driver);
  registry.freeze();
  const lifecycle = new ServiceRuntimeLifecycle(registry);
  const journal = createInvocationJournal();
  lifecycle.setQueryExecutorFactory(() => ({
    executeInternal: journal.executeInternal,
    executeRequest: async () => ({rows: [], success: true}),
    getRuntimeAccessPolicy: async () => ({
      policy: {tables: []},
      status: 'resolved',
    }),
  }));
  lifecycle.setStateProjectionWriter(async () => {});
  const replica = {
    definition: requestDefinition(manifestDigest),
    nodeId: NODE_A,
  };
  testContext.after(async () => {
    await lifecycle.stop(replica).catch(() => undefined);
    journal.close();
  });
  return {driver, lifecycle, replica};
}

function buildHttpInvocation(invocationId, body) {
  return {
    args: [JSON.stringify({
      body,
      headers: {},
      method: HTTP_METHOD,
      path: HTTP_PATH,
      query: {},
    })],
    deadlineMs: Date.now() + OUTER_DEADLINE_MS,
    intentDigest: OUTER_INTENT_DIGEST,
    invocationId,
    invocationServiceId: REQUEST_SERVICE_ID,
    securityContext: SECURITY_CONTEXT,
    tenantId: TENANT_ID,
  };
}

function runCounts(nodes) {
  return Object.fromEntries(
    Object.entries(nodes).map(([nodeId, node]) =>
      [nodeId, node.runtimeInvocationOwner.invocations.run.length]));
}

function readCoordinationRows(partitionStores) {
  const slots = partitionStores.databases
    .get(`${TABLES.CALL_CELL_REDUCE_SLOTS}-p1`)
    .prepare(`SELECT * FROM ${TABLES.CALL_CELL_REDUCE_SLOTS}`)
    .all();
  const results = partitionStores.databases
    .get(`${TABLES.CALL_CELL_REDUCE_RESULTS}-p1`)
    .prepare(`SELECT * FROM ${TABLES.CALL_CELL_REDUCE_RESULTS}`)
    .all();
  return {results, slots};
}

describe('HTTP-to-call composition across two production nodes', () => {
  it('bridges handle-request through the one CallCellInvoker with ' +
    'overlapping shard runs, child identity, typed refusal, durable ' +
    'replay, and no visible result on shard failure',
  async (testContext) => {
    // Cross-node rendezvous barrier plus a per-node failure switch on
    // the receiver-side run seam.
    const control = {
      barrierArmed: false,
      entered: [],
      failNode: null,
      waiters: [],
    };
    const onRunEntered = async (nodeId) => {
      if (control.failNode === nodeId) {
        throw new Error(INJECTED_SHARD_FAILURE);
      }
      if (!control.barrierArmed) return;
      control.entered.push(nodeId);
      if (control.entered.length >= 2) {
        for (const release of control.waiters) release();
        control.waiters = [];
        return;
      }
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(
            'no overlap: the second shard run never entered while the ' +
            'first was parked'));
        }, BARRIER_TIMEOUT_MS);
        timer.unref?.();
        control.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    };

    const componentBytes = await componentizeCombinedGuest();
    const {attachInvoker, messageRouter, nodes, partitionStores,
      systemTableCache} = await composeTwoNodeDeployment(testContext, {
      componentBytesProvider: () => componentBytes,
      onRunEntered,
    });
    const {driver, lifecycle, replica} =
      await composeRequestCell(testContext, componentBytes);

    // Production attachment: the SAME call composes the invoker AND
    // injects the RequestCellCallBridge into the real driver against
    // the REAL RuntimeAccessPolicyOwner reading the CONFIG-row policy.
    const policyOwner = composeOutboundCallPolicy(systemTableCache);
    attachInvoker({
      runtimeAccessPolicyOwner: policyOwner,
      tunables: {maxConcurrentShardRuns: PARALLEL_LIMIT},
      wasmComponentDriver: driver,
    });

    const prepared = await lifecycle.prepare(replica.definition, {});
    assert.equal(prepared.status, 'ready', prepared.error);
    const started = await lifecycle.start(replica);
    assert.equal(started.status, 'running', started.error);

    // 1. The composed path: HTTP-shaped request -> handle-request ->
    // bridged callBinding -> run beside both partitions (overlapping)
    // -> reduce -> the reduced JSON as the HTTP response body.
    control.barrierArmed = true;
    const invocation = buildHttpInvocation(
      OUTER_INVOCATION.PRIMARY, {topN: TOP_N});
    const first = await lifecycle.invoke(replica, invocation);
    control.barrierArmed = false;
    assert.equal(first.journaled, true);
    assert.equal(first.replayed, false);
    const response = JSON.parse(first.value);
    assert.equal(response.status, HTTP_STATUS_OK, first.value);
    assert.equal(response.body, EXPECTED_RESULT_JSON,
      'the HTTP response body is the reduced distributed result');
    assert.deepEqual([...control.entered].sort(),
      [NODE_A, NODE_B].sort(),
      'both partition-host nodes entered run while the barrier held');
    assert.deepEqual(runCounts(nodes), {[NODE_A]: 1, [NODE_B]: 1},
      'each shard run executed on its partition host node');
    assert.deepEqual(
      messageRouter.partitionQueryDeliveries
        .filter((partitionId) => partitionId.startsWith(DECLARED_TABLE)),
      [],
      'raw shard rows never crossed the router before run',
    );

    // 2. System-owned child identity in the coordination rows.
    const childInvocationId =
      `${OUTER_INVOCATION.PRIMARY}${CHILD_CALL_SUFFIX}`;
    const coordination = readCoordinationRows(partitionStores);
    assert.ok(coordination.slots.length > 0);
    assert.ok(
      coordination.slots.every(
        (row) => row.invocation_id === childInvocationId),
      'every coordination slot row carries the child invocation id',
    );
    assert.equal(coordination.results.length, 1,
      'exactly one visible result row');
    assert.equal(coordination.results[0].result_id, childInvocationId,
      'the visible result is keyed by the system-owned child identity');
    assert.equal(coordination.results[0].result_json,
      EXPECTED_RESULT_JSON);

    // 3. Outer replay through the durable invocation fence: the SAME
    // invocation identity returns the journaled response and the inner
    // call does not run again.
    const replayed = await lifecycle.invoke(replica, invocation);
    assert.equal(replayed.replayed, true,
      'the second identical invocation is served from the journal');
    assert.equal(replayed.value, first.value,
      'the replayed response is identical to the journaled response');
    assert.deepEqual(runCounts(nodes), {[NODE_A]: 1, [NODE_B]: 1},
      'replay executed zero additional shard runs');
    assert.equal(readCoordinationRows(partitionStores).results.length, 1,
      'replay published no additional result row for the child id');

    // 4. Undeclared target: refused by the durable outbound-call policy
    // BEFORE dispatch, surfaced to the guest as the typed
    // target_not_allowed binding-call-error, mapped by the guest to 403.
    const refused = await lifecycle.invoke(replica, buildHttpInvocation(
      OUTER_INVOCATION.UNDECLARED,
      {target: UNDECLARED_TARGET, topN: TOP_N},
    ));
    const refusedResponse = JSON.parse(refused.value);
    assert.equal(refusedResponse.status, HTTP_STATUS_FORBIDDEN,
      refused.value);
    assert.equal(JSON.parse(refusedResponse.body).code,
      TARGET_NOT_ALLOWED_CODE);
    assert.deepEqual(runCounts(nodes), {[NODE_A]: 1, [NODE_B]: 1},
      'the undeclared target never dispatched a shard run');
    assert.equal(readCoordinationRows(partitionStores).results.length, 1,
      'the refusal produced no coordination result row');

    // 5. One injected shard failure prevents reduce: no visible result
    // row for that invocation's child id, and the guest surfaces a
    // typed non-200 failure instead of a fabricated result.
    control.failNode = NODE_B;
    const failed = await lifecycle.invoke(replica, buildHttpInvocation(
      OUTER_INVOCATION.FAILED_SHARD, {topN: TOP_N}));
    control.failNode = null;
    const failedResponse = JSON.parse(failed.value);
    assert.notEqual(failedResponse.status, HTTP_STATUS_OK,
      'a shard failure never yields a 200 result');
    assert.equal(typeof JSON.parse(failedResponse.body).code, 'string');
    const afterFailure = readCoordinationRows(partitionStores);
    const failedChildRows = afterFailure.results.filter(
      (row) => row.result_id.startsWith(OUTER_INVOCATION.FAILED_SHARD));
    assert.ok(
      failedChildRows.every((row) => row.result_json === ''),
      'incomplete partials never produced a visible reduce result - at ' +
        'most the abandoned-invocation seed sentinel remains',
    );
    assert.deepEqual(
      afterFailure.results
        .filter((row) => row.result_json !== '')
        .map((row) => row.result_id),
      [childInvocationId],
      'the only visible snapshot across the whole scenario is the ' +
        'primary invocation result',
    );
  });
});
