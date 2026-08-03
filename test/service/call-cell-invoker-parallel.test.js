/**
 * Deterministic guard for bounded parallel shard dispatch inside the
 * call-cell invocation owner: independent shard runs overlap up to the
 * policy-owned limit and never beyond it, completion order never affects
 * the published coordination rows or the final result, one shard failure
 * prevents reduction and final publication with the lowest-slot cause
 * surfaced deterministically, a passed deadline stops admission typed,
 * and serial (limit 1) and parallel dispatch produce identical results.
 * Collaborators are stubbed at their real API seams with manually gated
 * promises — no timers, no races.
 */

import {test} from '../../src/test-helpers/tap.js';
import {CallCellInvoker} from
  '../../src/service/call-cell-invoker.js';
import {
  CALL_CELL_PARTIAL_KEY_PREFIX,
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallRoutingFailure,
} from '../../src/service/call-cell-routing-contract.js';

const SECURITY_CONTEXT = Object.freeze({
  tenantId: 'tenant-1',
  principal: 'app-1',
  roles: Object.freeze(['application']),
});
const CALL_NAME = 'ratings-top';
const DECLARED_STATEMENT = 'SELECT user_id, score FROM ratings';
const ARGUMENTS = '{"topN":4}';
const RESULT_JSON = '[{"key":"u4","score":11}]';
const BATCH_ROW_BOUND = 100;
const PARTIAL_LIMIT = 64;
const PARTITION_COUNT = 4;
const LIMIT_TWO = 2;
const LIMIT_ONE = 1;
const LIMIT_WIDE = 8;
const SHARD_FAILURE_MESSAGE = 'shard component failed';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, reject, resolve};
}

function tick() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function partitionIds() {
  return Array.from({length: PARTITION_COUNT},
    (_, index) => `p${index + 1}`);
}

function makeRoute() {
  return Object.freeze({
    bindingVersionId: 'bv-1',
    name: CALL_NAME,
    statement: DECLARED_STATEMENT,
    replicaId: 'replica-1',
    serviceId: 'svc-1',
    tenantId: SECURITY_CONTEXT.tenantId,
  });
}

function emittedPartial(partitionId) {
  const ordinal = Number(partitionId.slice(1));
  return {
    key: `${CALL_CELL_PARTIAL_KEY_PREFIX}u${ordinal}`,
    partial: JSON.stringify(ordinal + 7),
  };
}

// Collaborator stubs at the real seams. `gate` (optional) maps
// partitionId -> deferred whose settlement releases that shard's run
// dispatch, letting each test control overlap and completion order
// explicitly.
function makeCollaborators({gate, failPartitions} = {}) {
  const calls = {
    inFlight: 0,
    peakInFlight: 0,
    published: [],
    reduce: 0,
    runStarted: [],
    snapshot: null,
  };
  const routeResolver = {resolve: () => makeRoute()};
  const batchExecutor = {
    executeBatches: async () => [],
    planShards: () => ({
      shards: partitionIds().map((partitionId) => ({partitionId})),
      tableName: 'ratings',
    }),
  };
  const partitionTopology = {
    resolveShardHost: (tableName, partitionId) => Object.freeze({
      activePartitionVersion: 1,
      hostNodeId: `node-${partitionId}`,
      partitionId,
      partitionReplicaId: `${partitionId}-r1`,
      partitionState: 'NORMAL',
      partitionVersion: 1,
    }),
  };
  const statementAdapter = {
    invoke: async (req) => {
      if (req.exportName === 'reduce') {
        calls.reduce += 1;
        return {componentResult: RESULT_JSON, replicaId: 'replica-1'};
      }
      calls.runStarted.push(req.partitionId);
      calls.inFlight += 1;
      calls.peakInFlight = Math.max(calls.peakInFlight, calls.inFlight);
      try {
        if (gate?.[req.partitionId]) {
          await gate[req.partitionId].promise;
        }
        if (failPartitions?.includes(req.partitionId)) {
          throw createCallRoutingFailure(
            CALL_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED,
            SHARD_FAILURE_MESSAGE,
          );
        }
        return {
          componentResult: '{}',
          partials: [emittedPartial(req.partitionId)],
          replicaId: 'replica-1',
        };
      } finally {
        calls.inFlight -= 1;
      }
    },
  };
  const reduceCoordinator = {
    seedInvocation: async (invocationId, slotIds) => ({slotIds}),
    acquireReduceLease: async (invocationId, replicaId, slotId) =>
      ({slot_id: slotId}),
    publishPartial: async (invocationId, slotId, replicaId, partial) => {
      calls.published.push({partial, slotId});
    },
    resolveCompletePartialSet: async () => ({
      partials: partitionIds().map((partitionId) => {
        const ordinal = Number(partitionId.slice(1));
        return [`u${ordinal}`, ordinal + 7];
      }),
      witness: {schemaVersion: 1, slots: []},
    }),
    publishFinalSnapshot: async (invocationId, resultJson, witness) => {
      calls.snapshot = {resultJson, witness};
    },
  };
  return {batchExecutor, calls, partitionTopology, reduceCoordinator,
    routeResolver, statementAdapter};
}

function makeInvoker(collaborators, options = {}) {
  return new CallCellInvoker({
    batchExecutor: collaborators.batchExecutor,
    batchRowBound: BATCH_ROW_BOUND,
    partialLimit: PARTIAL_LIMIT,
    partitionTopology: collaborators.partitionTopology,
    reduceCoordinator: collaborators.reduceCoordinator,
    routeResolver: collaborators.routeResolver,
    statementAdapter: collaborators.statementAdapter,
    ...options,
  });
}

function invokeRequest() {
  return {
    argumentsJson: ARGUMENTS,
    name: CALL_NAME,
    securityContext: SECURITY_CONTEXT,
  };
}

test('independent shard runs overlap up to the limit and never beyond it',
  async (t) => {
    const gate = Object.fromEntries(
      partitionIds().map((partitionId) => [partitionId, deferred()]));
    const collaborators = makeCollaborators({gate});
    const telemetryRecords = [];
    const invoker = makeInvoker(collaborators, {
      maxConcurrentShardRuns: LIMIT_TWO,
      onInvocationTelemetry: (record) => telemetryRecords.push(record),
    });
    const resultPromise = invoker.invoke(invokeRequest());
    await tick();
    t.same(collaborators.calls.runStarted, ['p1', 'p2'],
      'two shard runs are genuinely in flight at once, in slot order');
    gate.p1.resolve();
    await tick();
    t.same(collaborators.calls.runStarted, ['p1', 'p2', 'p3'],
      'the next shard is admitted as one settles');
    gate.p2.resolve();
    gate.p3.resolve();
    await tick();
    gate.p4.resolve();
    const result = await resultPromise;
    t.equal(result, RESULT_JSON);
    t.equal(collaborators.calls.peakInFlight, LIMIT_TWO,
      'concurrency never exceeds the configured limit');
    t.equal(telemetryRecords.length, 1,
      'one telemetry record per invocation');
    t.equal(telemetryRecords[0].peakConcurrentShardRuns, LIMIT_TWO);
    t.equal(telemetryRecords[0].configuredConcurrency, LIMIT_TWO);
    t.equal(telemetryRecords[0].selectedPartitionCount, PARTITION_COUNT);
    t.equal(telemetryRecords[0].readyCellHits, PARTITION_COUNT);
    t.equal(telemetryRecords[0].failureCode, 'none');
    t.ok(telemetryRecords[0].bytesEmittedAsPartials > 0,
      'emitted partial bytes are measured');
  });

test('completion order never affects coordination rows or the result',
  async (t) => {
    const gate = Object.fromEntries(
      partitionIds().map((partitionId) => [partitionId, deferred()]));
    const collaborators = makeCollaborators({gate});
    const invoker = makeInvoker(collaborators, {
      maxConcurrentShardRuns: LIMIT_WIDE,
    });
    const resultPromise = invoker.invoke(invokeRequest());
    await tick();
    for (const partitionId of [...partitionIds()].reverse()) {
      gate[partitionId].resolve();
      await tick();
    }
    const result = await resultPromise;
    t.equal(result, RESULT_JSON);
    t.same(
      [...collaborators.calls.published].map((entry) => entry.slotId)
        .sort((left, right) => left - right),
      [1, 2, 3, 4],
      'every slot published exactly once despite reversed completion',
    );
    t.equal(collaborators.calls.reduce, 1,
      'reduce runs exactly once over the complete set');
    t.equal(collaborators.calls.snapshot.resultJson, RESULT_JSON,
      'exactly one final snapshot is published');
  });

test('one shard failure prevents reduction, stops admission, and ' +
  'surfaces the lowest-slot cause', async (t) => {
  const gate = Object.fromEntries(
    partitionIds().map((partitionId) => [partitionId, deferred()]));
  const collaborators = makeCollaborators({
    failPartitions: ['p1'],
    gate,
  });
  const invoker = makeInvoker(collaborators, {
    maxConcurrentShardRuns: LIMIT_TWO,
  });
  const resultPromise = invoker.invoke(invokeRequest());
  const settled = resultPromise.then(
    () => ({failed: false}),
    (error) => ({error, failed: true}),
  );
  await tick();
  gate.p1.resolve();
  await tick();
  gate.p2.resolve();
  const outcome = await settled;
  t.ok(outcome.failed, 'the invocation fails closed');
  t.equal(outcome.error.code, CALL_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED,
    'the surfaced failure is the lowest-slot terminal cause');
  t.same(collaborators.calls.runStarted, ['p1', 'p2'],
    'no further shard is admitted after the failure');
  t.equal(collaborators.calls.reduce, 0,
    'a failed shard set never reaches reduce');
  t.equal(collaborators.calls.snapshot, null,
    'no final snapshot becomes visible');
  t.equal(collaborators.calls.published.length, 1,
    'the settled healthy shard published its slot; the incomplete set ' +
      'stays invisible behind the complete-set gate');
});

test('a passed invocation deadline stops admission with the typed ' +
  'deadline refusal', async (t) => {
  const collaborators = makeCollaborators();
  const invoker = makeInvoker(collaborators, {
    maxConcurrentShardRuns: LIMIT_TWO,
  });
  const outcome = await invoker.invoke({
    ...invokeRequest(),
    deadlineMs: Date.now() - 1,
  }).then(
    () => ({failed: false}),
    (error) => ({error, failed: true}),
  );
  t.ok(outcome.failed);
  t.equal(outcome.error.code,
    CALL_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED);
  t.same(collaborators.calls.runStarted, [],
    'no shard run is admitted past the deadline');
  t.equal(collaborators.calls.reduce, 0);
  t.equal(collaborators.calls.snapshot, null);
});

test('shards resolved to the same host node serialize even under a ' +
  'wide limit', async (t) => {
  const collaborators = makeCollaborators();
  collaborators.partitionTopology = {
    resolveShardHost: (tableName, partitionId) => Object.freeze({
      activePartitionVersion: 1,
      hostNodeId: 'node-shared',
      partitionId,
      partitionReplicaId: `${partitionId}-r1`,
      partitionState: 'NORMAL',
      partitionVersion: 1,
    }),
  };
  const result = await makeInvoker(collaborators, {
    maxConcurrentShardRuns: LIMIT_WIDE,
  }).invoke(invokeRequest());
  t.equal(result, RESULT_JSON);
  t.equal(collaborators.calls.peakInFlight, 1,
    'one active invocation per host-node component instance');
  t.equal(collaborators.calls.snapshot.resultJson, RESULT_JSON);
});

test('serial and parallel dispatch return identical results and ' +
  'coordination rows', async (t) => {
  const serial = makeCollaborators();
  const parallel = makeCollaborators();
  const serialResult = await makeInvoker(serial, {
    maxConcurrentShardRuns: LIMIT_ONE,
  }).invoke(invokeRequest());
  const parallelResult = await makeInvoker(parallel, {
    maxConcurrentShardRuns: LIMIT_WIDE,
  }).invoke(invokeRequest());
  t.equal(serialResult, parallelResult,
    'byte-identical final result for the same invocation');
  const normalize = (calls) => [...calls.published]
    .sort((left, right) => left.slotId - right.slotId)
    .map((entry) => ({partial: entry.partial, slotId: entry.slotId}));
  t.same(normalize(parallel.calls), normalize(serial.calls),
    'identical published partial sets slot for slot');
  t.equal(serial.calls.snapshot.resultJson,
    parallel.calls.snapshot.resultJson);
});
