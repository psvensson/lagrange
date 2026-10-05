// One entry identity never stands for two logical writes (verifier finding
// B1 on the raft-rs cutover line: a NAME standing in for an INSTANCE), and
// every statement kind carries the typed unknown outcome to its caller (B2).
//
// A named control-plane write is delivered under an identity derived from its
// name, the instance of the logical write it is, and a digest of the exact
// content it carries (src/control-plane/control-plane-write-identity.js):
// - changed content is never answered with another content's outcome;
// - the instance lives for one logical write: once its owner classified it
//   (or deleted its row), the next write of the name is a new instance and
//   executes, even with identical content;
// - a write of a name whose earlier instance is still unknown first resolves
//   that instance under its own entry, then executes; unresolved, it is the
//   typed unknown naming the pending instance - never applied for content
//   that was not written.
//
// Production classes throughout: the real SQLQueryEngine, QueryExecutor,
// distributed write coordinator, control-plane gateway, owners and
// PartitionService on the real rs-raft WASM core; the runtime replacement is
// the runtime owner's setCoreFaultInjector trap.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {TABLES} from '../../src/constants/index.js';
import * as writeKernel from '../../src/partition/partition-write-kernel.js';
import {
  NODE_REGISTRATION_OUTCOME,
} from '../../src/control-plane/owners/node-registration-incarnation-write.js';
import {MembershipPublicationRuntimeOwner} from
  '../../src/control-plane/owners/membership-publication-runtime-owner.js';
import {
  ENDPOINT_INCARNATION_OUTCOME,
  writeEndpointAtIncarnation,
} from '../../src/control-plane/owners/endpoint-incarnation-authority.js';
import {deriveEndpointId} from '../../src/runtime/runtime-endpoint-writer.js';
import {wireRuntimeEndpointPublication} from
  '../../src/runtime/runtime-endpoint-publication-wiring.js';
import {runRetryableControlPlaneWrite} from
  '../../src/bootstrap/shared/retryable-control-plane-write.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationRepository} from
  '../../src/rebalancer/replica-operation-repository.js';
import {
  COUNTER_TABLE,
  JOINER_ID,
  JOIN_WRITE_OPTIONS,
  NODE_ID,
  SETTLE_BUDGET_MS,
  SURFACE_INSERT,
  USER_TABLE,
  appliedRow,
  authoritativeLeaderReads,
  nodeRow,
  rowsOf,
  selectRows,
  spendFirstAttempt,
  spendOneBudget,
  waitFor,
  withMutedConsoleError,
  withSurface,
} from './unknown-outcome-surface-fixture.js';

const OUTCOME_UNKNOWN =
  writeKernel.PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN;
const TEST_TIMEOUT_MS = 60000;
const BOOT_INCARNATION = 7;
const RESERVATION_INSERT = `INSERT INTO ${TABLES.STORAGE_RESERVATIONS} ` +
  '(reservation_id, operation_id, entity_type, entity_id, partition_id, ' +
  'target_node_id, estimated_bytes, amplification_factor, status, ' +
  'created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ' +
  '?, ?, ?)';
const RUNTIME_SERVICE_ID = 'svc-uo';
const RUNTIME_REPLICA_ID = `${RUNTIME_SERVICE_ID}-r1`;
const RUNTIME_ENDPOINT_ID = deriveEndpointId(RUNTIME_SERVICE_ID, NODE_ID);
// The counter increment as a read-modify-write CAS: `SET n = n + 1` cannot
// be the witness while the SQL parser turns a SET expression into NULL (a
// separate, recorded parser defect); this form is non-idempotent in effect
// the same way - a second application answers zero rows.
const COUNTER_INCREMENT = `UPDATE ${COUNTER_TABLE} SET n = ? ` +
  'WHERE id = ? AND n = ?';

// A clock whose `stamp()` makes the NEXT Date.now() - the one a write's
// owner stamps its content with - answer one fixed instant, so two writes
// built after it carry identical content; every other reading (budgets,
// waits) stays real.
function pinnedStamps() {
  const pinned = Date.now();
  return {stamp() {
    const now = Date.now;
    Date.now = () => {
      Date.now = now;
      return pinned;
    };
  }};
}

// ---------------------------------------------------------------------------
// B1, the verifier's V3: birth (unknown past the budget, then commits) ->
// the row is deleted -> a second birth of the same name with new content.

test('V3: a second birth of a held name after the row was deleted executes - ' +
  'the row exists with the new content', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withSurface([TABLES.STORAGE_RESERVATIONS], async ({engine, gateway,
    deliveries, of}) => {
    const surface = of(TABLES.STORAGE_RESERVATIONS);
    const now = Date.now();
    const birth = (bytes) => gateway.executeQuery(RESERVATION_INSERT,
      ['res-op-v3', 'op-v3', 'partition', 'p-1', 'p-1', 'n-1', bytes, 1,
        'active', now, now, now + 1000],
      {writeIdentity: `${TABLES.STORAGE_RESERVATIONS}:res-op-v3:birth`,
        skipCacheWait: true});
    const {first} = await spendFirstAttempt({engine, surface,
      attempt: () => birth(111)});
    assert.equal(first.success, false, 'setup: the first birth is unknown');
    assert.ok(await appliedRow(surface, 'res-op-v3'), 'setup: it commits');
    engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
    const removed = await gateway.executeQuery(
      `DELETE FROM ${TABLES.STORAGE_RESERVATIONS} WHERE reservation_id = ?`,
      ['res-op-v3'], {skipCacheWait: true});
    assert.equal(removed.success, true, 'setup: the row is deleted');
    const firstEntry = deliveries[0].entryId;
    const again = await birth(222);
    assert.deepEqual(selectRows(surface.dbPath, 'SELECT reservation_id, ' +
      `estimated_bytes FROM ${TABLES.STORAGE_RESERVATIONS}`),
    [{reservation_id: 'res-op-v3', estimated_bytes: 222}],
    `the second birth executed (${JSON.stringify(again)})`);
    assert.equal(again.success, true, 'and is answered applied');
    assert.equal(again.affectedRows, 1, 'with its own count');
    assert.ok(deliveries.at(-1).entryId !== firstEntry,
      'under its own entry, never the first birth\'s');
  });
});

// ---------------------------------------------------------------------------
// B1, the production endpoint shape through the runtime endpoint owner: a
// birth unknown past its budget is resolved by the owner's readback; the
// replica stops and its endpoint row is deleted; the replica restarts on the
// same node in the same boot.

async function withRuntimeEndpointOwner({engine, gateway, surface,
  mutationContext}, body) {
  authoritativeLeaderReads(gateway, surface);
  const owner = new MembershipPublicationRuntimeOwner({nodeId: NODE_ID,
    controlPlaneSystemTableGateway: gateway,
    controlPlaneWriteRetryTimeoutMs: 0});
  const lifecycle = {};
  wireRuntimeEndpointPublication({
    bootIncarnation: BOOT_INCARNATION,
    nodeId: NODE_ID,
    serviceEndpointsOwner: owner.serviceEndpointsOwner,
    serviceRuntimeLifecycle: {
      setEndpointWriter: (writer) => {
        lifecycle.write = writer;
      },
      setEndpointRemover: (remover) => {
        lifecycle.remove = remover;
      },
    },
    systemTableCache: {getAll: (type) => (type ===
      TABLES.SERVICE_DEFINITIONS ? [{service_id: RUNTIME_SERVICE_ID}] : [])},
  });
  // The lifecycle reports ENDPOINT_REGISTERED exactly when its endpoint
  // writer settles without throwing and the write completed.
  const register = (port) => withMutedConsoleError(async () => {
    try {
      const result = await lifecycle.write(RUNTIME_REPLICA_ID, 'wasm',
        {port, protocol: 'websocket'}, mutationContext);
      return {registered: result?.success !== false, result};
    } catch (error) {
      return {registered: false, error};
    }
  });
  await body({engine, register, remove: () => withMutedConsoleError(() =>
    lifecycle.remove(RUNTIME_REPLICA_ID, NODE_ID, mutationContext))});
}

// Both write paths: the CDC routed path (the runtime writer's), and the SQL
// path (the join scope's).
for (const [label, pinClock, cdc] of [
  ['CDC path, new timestamps', false, true],
  ['CDC path, identical content', true, true],
  ['SQL path, new timestamps', false, false],
  ['SQL path, identical content', true, false],
]) {
  test(`endpoint shape (${label}): an unknown birth resolved by readback, ` +
    'its row deleted, the replica born again on the same node in the same ' +
    'boot - the row exists and ENDPOINT_REGISTERED is true',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    await withSurface([TABLES.SERVICE_ENDPOINTS], async ({engine, gateway,
      of}) => {
      const surface = of(TABLES.SERVICE_ENDPOINTS);
      const clock = pinnedStamps();
      const stamp = () => (pinClock ? clock.stamp() : undefined);
      await withRuntimeEndpointOwner({engine, gateway, surface,
        mutationContext: cdc ? {} : {...JOIN_WRITE_OPTIONS}},
      async ({register, remove}) => {
        stamp();
        const {first} = await spendFirstAttempt({engine, surface,
          attempt: () => register(9001)});
        assert.equal(first.registered, true, 'setup: the unknown birth ' +
            `is resolved by the owner's readback (${first.error?.message})`);
        engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
        const removed = await remove();
        assert.notEqual(removed?.success, false,
          `setup: the stopped replica's row is deleted (${removed?.outcome})`);
        assert.deepEqual(rowsOf(surface.dbPath, TABLES.SERVICE_ENDPOINTS,
          'endpoint_id'), [], 'setup: no endpoint row');
        stamp();
        const reborn = await register(9001);
        assert.equal(reborn.registered, true, 'ENDPOINT_REGISTERED ' +
            `(${reborn.error?.message ?? reborn.result?.outcome})`);
        assert.deepEqual(rowsOf(surface.dbPath, TABLES.SERVICE_ENDPOINTS,
          'endpoint_id'), [RUNTIME_ENDPOINT_ID], 'and the row exists');
      });
    }, {cdc});
  });
}

// ---------------------------------------------------------------------------
// B1, changed content: a same-incarnation refresh with a new port while the
// previous refresh's outcome is unknown.

test('endpoint refresh: a new port while the previous refresh is unknown ' +
  'ends with the NEW port, or a typed unknown - never applied with the old ' +
  'port', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([TABLES.SERVICE_ENDPOINTS], async ({engine, gateway,
    deliveries, of}) => {
    const surface = of(TABLES.SERVICE_ENDPOINTS);
    authoritativeLeaderReads(gateway, surface);
    const owner = new MembershipPublicationRuntimeOwner({nodeId: NODE_ID,
      controlPlaneSystemTableGateway: gateway,
      controlPlaneWriteRetryTimeoutMs: 0});
    const endpoints = owner.serviceEndpointsOwner;
    const now = Date.now();
    const rowAt = (port) => ({endpoint_id: RUNTIME_ENDPOINT_ID,
      service_id: RUNTIME_SERVICE_ID, node_id: NODE_ID,
      protocol: 'websocket', address: NODE_ID, port,
      health_status: 'healthy', metadata: '{}', created_at: now,
      updated_at: now});
    // The heartbeat-shaped writer: it observes the row it last wrote.
    let lastWritten = null;
    const refresh = (port) => withMutedConsoleError(() =>
      writeEndpointAtIncarnation({row: rowAt(port),
        bootIncarnation: BOOT_INCARNATION,
        observe: async () => ({available: true, row: lastWritten}),
        readback: async () => ({available: false, row: null}),
        insert: (row, identity) => endpoints.insertEndpoint(row,
          {...JOIN_WRITE_OPTIONS, ...identity}),
        update: (where, data, identity) => endpoints.updateWhere(where,
          data, {...JOIN_WRITE_OPTIONS, ...identity}),
      }));
    const born = await refresh(1);
    assert.equal(born.outcome, ENDPOINT_INCARNATION_OUTCOME.APPLIED,
      'setup: born with port 1');
    lastWritten = {...rowAt(1), boot_incarnation: BOOT_INCARNATION};
    const {first: second} = await spendFirstAttempt({engine, surface,
      attempt: () => refresh(2)});
    assert.notEqual(second.outcome, ENDPOINT_INCARNATION_OUTCOME.APPLIED,
      `setup: the port-2 refresh is not confirmed (${second.outcome})`);
    assert.equal(await waitFor(() => {
      surface.partition.raft.readStatus();
      return selectRows(surface.dbPath, 'SELECT port FROM ' +
        `${TABLES.SERVICE_ENDPOINTS}`)[0]?.port === 2;
    }), true, 'setup: the port-2 refresh commits later');
    engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
    const mark = deliveries.length;
    const third = await refresh(3);
    const port = selectRows(surface.dbPath,
      `SELECT port FROM ${TABLES.SERVICE_ENDPOINTS}`)[0]?.port;
    if (third.outcome === ENDPOINT_INCARNATION_OUTCOME.APPLIED) {
      assert.equal(port, 3, 'answered applied: the row has the NEW port ' +
        `(port ${port}; ${JSON.stringify(deliveries.slice(mark).map((d) =>
          ({entryId: d.entryId, settledReplay: d.answer?.settledReplay})))})`);
    } else {
      assert.equal(third.error?.failureCode ??
        third.result?.failureCode, OUTCOME_UNKNOWN,
      `otherwise the typed unknown (${third.outcome})`);
    }
  });
});

// ---------------------------------------------------------------------------
// B1, the reservation owner: a re-ensure after the reservation was released.

function reservationCoordinator(gateway) {
  const coordinator = Object.create(RebalanceCoordinator.prototype);
  Object.assign(coordinator, {
    storageAccountingService: {estimateReplicaBytes: () => 1},
    resolveEntitySizeBytes: () => 1,
    config: {reservationTtlMs: 60000},
    stats: {reservationsCreated: 0, reservationsReleased: 0},
    logger: {warn: () => undefined, info: () => undefined,
      debug: () => undefined, error: () => undefined},
    emit: () => undefined,
    repository: Object.create(ReplicaOperationRepository.prototype),
    controlPlaneSystemTableGateway: gateway,
    executeOperationMutationWithRetry: (sql, params, options) =>
      gateway.executeQuery(sql, params, {...options, skipCacheWait: true}),
  });
  return coordinator;
}

for (const [label, pinClock] of [['new timestamps', false],
  ['identical content', true]]) {
  test(`reservation (${label}): a birth ensured again after the reservation ` +
    'was released is answered truthfully - never "created" over a released ' +
    'row', {timeout: TEST_TIMEOUT_MS}, async () => {
    await withSurface([TABLES.STORAGE_RESERVATIONS], async ({engine, gateway,
      of}) => {
      const surface = of(TABLES.STORAGE_RESERVATIONS);
      const coordinator = reservationCoordinator(gateway);
      const operation = {operationId: 'op-rel', type: OperationType.ADD,
        entityType: 'partition', entityId: 'p-rel', partitionId: 'p-rel',
        targetNodeId: 'n-rel'};
      const clock = pinnedStamps();
      const stamp = () => (pinClock ? clock.stamp() : undefined);
      {
        stamp();
        const {first} = await spendFirstAttempt({engine, surface,
          attempt: () => coordinator.createReservationForOperation(
            operation)});
        assert.notEqual(first.outcome, 'created',
          'setup: the first birth is not confirmed');
        assert.ok(await appliedRow(surface, 'res-op-rel'),
          'setup: it commits');
        engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
        const released = await coordinator.transitionActiveReservationById(
          'res-op-rel', 'released', Date.now());
        assert.equal(released.changed, true, 'setup: released');
        stamp();
        const again = await coordinator.createReservationForOperation(
          operation);
        const [row] = selectRows(surface.dbPath, 'SELECT status FROM ' +
          TABLES.STORAGE_RESERVATIONS);
        assert.equal(row.status, 'released', 'setup: the row stays released');
        assert.notEqual(again.outcome, 'created', 'never "created" while ' +
          `the reservation is released (${JSON.stringify(again)})`);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// The R6-B joiner registration (the verifier's V1): the real registration
// owner, its unknown outlasting the budget, re-driven by the join with a row
// built again (new timestamps), and no authoritative read.

test('V1: the joiner registration re-driven after an unknown that outlasts ' +
  'the budget is ACCEPTED with one row', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withSurface([TABLES.NODES], async ({engine, gateway, deliveries,
    of}) => {
    const surface = of(TABLES.NODES);
    const owner = new MembershipPublicationRuntimeOwner({nodeId: NODE_ID,
      controlPlaneSystemTableGateway: gateway,
      controlPlaneWriteRetryTimeoutMs: 0});
    const register = () => withMutedConsoleError(() =>
      owner.registerJoinNodeAtIncarnation(nodeRow(), BOOT_INCARNATION,
        {...JOIN_WRITE_OPTIONS}));
    const {first} = await spendFirstAttempt({engine, surface,
      attempt: register});
    assert.equal(first.outcome, NODE_REGISTRATION_OUTCOME.UNRESOLVED,
      'setup: unresolved (unknown, no authoritative read)');
    assert.ok(await appliedRow(surface, JOINER_ID), 'setup: it commits');
    engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
    const redrive = await register();
    assert.equal(redrive.outcome, NODE_REGISTRATION_OUTCOME.ACCEPTED,
      `the re-drive is ACCEPTED (${redrive.error?.message ?? ''}; ` +
      `${JSON.stringify(deliveries.slice(-3).map((d) => d.answer?.error))})`);
    assert.deepEqual(rowsOf(surface.dbPath, TABLES.NODES, 'node_id'),
      [JOINER_ID], 'one row');
  });
});

// ---------------------------------------------------------------------------
// B2: UPDATE and DELETE carry the typed unknown outcome to the engine result
// exactly as INSERT does (the verifier's V6).

for (const [label, sql, params] of [
  ['UPDATE', `UPDATE ${USER_TABLE} SET value = ? WHERE node_id = ?`,
    ['u', 'row-0']],
  ['DELETE', `DELETE FROM ${USER_TABLE} WHERE node_id = ?`, ['row-0']],
  ['INSERT', SURFACE_INSERT, ['row-ins', 'v']],
]) {
  test(`V6 ${label}: the engine result carries the typed unknown, its ` +
    'entryId and the spent wait', {timeout: TEST_TIMEOUT_MS}, async () => {
    await withSurface([USER_TABLE], async ({engine, deliveries, of}) => {
      const surface = of(USER_TABLE);
      await engine.executeQuery(SURFACE_INSERT, ['row-0', 's']);
      deliveries.length = 0;
      const {first} = await spendFirstAttempt({engine, surface,
        attempt: () => engine.executeQuery(sql, params,
          {idempotencyKey: `v6-${label}`})});
      const entryId = deliveries[0]?.entryId;
      assert.equal(typeof entryId, 'string', 'setup: delivered');
      assert.equal(first.success, false, 'setup: not answered applied');
      for (const [hop, answer] of [
        ['participantFailures[0]', first.participantFailures?.[0]],
        ['firstFailedParticipant', first.firstFailedParticipant],
      ]) {
        assert.equal(answer?.failureCode, OUTCOME_UNKNOWN,
          `${hop}: typed code (${JSON.stringify(answer)})`);
        assert.equal(answer?.entryId, entryId, `${hop}: its entryId`);
        assert.equal(answer?.spentWait?.entryId, entryId,
          `${hop}: the spent wait`);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// B2: a non-idempotent UPDATE behind the generic retry helper, across a
// forced runtime replacement, applies exactly once and is answered with its
// original count; a cas-from UPDATE keeps one entry across the retry loop.

test('a counter UPDATE behind the generic retry helper across a runtime ' +
  'replacement applies exactly once, answered with its original count',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([COUNTER_TABLE], async ({engine, gateway, deliveries,
    of}) => {
    const surface = of(COUNTER_TABLE);
    await engine.executeQuery(`INSERT INTO ${COUNTER_TABLE} (id, n) ` +
      'VALUES (?, ?)', ['c', 0]);
    deliveries.length = 0;
    const {result, trap} = await spendOneBudget({engine, surface,
      attempt: () => runRetryableControlPlaneWrite((identity) =>
        gateway.executeQuery(COUNTER_INCREMENT, [1, 'c', 0],
          {...identity, skipCacheWait: true}),
      {timeoutMs: SETTLE_BUDGET_MS, baseDelayMs: 20})});
    assert.ok(trap.count >= 1, 'setup: the core trapped the UPDATE');
    assert.equal(result?.success, true,
      `the helper ends applied (${JSON.stringify(result?.error ?? null)})`);
    assert.equal(result.affectedRows, 1, 'with its original count');
    assert.equal(await waitFor(() => {
      surface.partition.raft.readStatus();
      return selectRows(surface.dbPath,
        `SELECT n FROM ${COUNTER_TABLE}`)[0].n >= 1;
    }), true, 'setup: applied');
    assert.deepEqual(selectRows(surface.dbPath,
      `SELECT n FROM ${COUNTER_TABLE}`), [{n: 1}], 'applied exactly once');
    assert.equal(new Set(deliveries.map((d) => d.entryId)).size, 1,
      'every attempt of the loop one entry');
  });
});

test('a cas-from endpoint UPDATE keeps one entryId across its owner\'s ' +
  'retry loop while its first attempt is unknown', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withSurface([TABLES.NODE_ENDPOINTS], async ({engine, gateway,
    deliveries, of}) => {
    const surface = of(TABLES.NODE_ENDPOINTS);
    const owner = new MembershipPublicationRuntimeOwner({nodeId: NODE_ID,
      controlPlaneSystemTableGateway: gateway,
      controlPlaneWriteRetryTimeoutMs: SETTLE_BUDGET_MS});
    const now = Date.now();
    const row = {endpoint_id: 'ep-cas', node_id: JOINER_ID,
      transport_type: 'websocket', address: 'ws://h:1', priority: 0,
      metadata: '{}', status: 'active', boot_incarnation: BOOT_INCARNATION,
      created_at: now, updated_at: now};
    await owner.nodeEndpointsOwner.insertEndpoint(row, {...JOIN_WRITE_OPTIONS});
    deliveries.length = 0;
    const {result: outcome, trap} = await spendOneBudget({engine, surface,
      attempt: () => writeEndpointAtIncarnation({
        row: {...row, address: 'ws://h:2'}, bootIncarnation: BOOT_INCARNATION,
        observe: async () => ({available: true, row}),
        readback: async () => ({available: false, row: null}),
        insert: (r, identity) => owner.nodeEndpointsOwner.insertEndpoint(r,
          {...JOIN_WRITE_OPTIONS, ...identity}),
        update: (where, data, identity) => owner.nodeEndpointsOwner
          .updateWhere(where, data, {...JOIN_WRITE_OPTIONS, ...identity}),
      })});
    assert.ok(trap.count >= 1, 'setup: the core trapped the CAS');
    assert.equal(new Set(deliveries.map((d) => d.entryId)).size, 1,
      `one entryId across the loop (${deliveries.length} deliveries)`);
    assert.equal(outcome.outcome, ENDPOINT_INCARNATION_OUTCOME.APPLIED,
      'answered applied by its own entry');
    assert.deepEqual(selectRows(surface.dbPath,
      `SELECT address FROM ${TABLES.NODE_ENDPOINTS}`),
    [{address: 'ws://h:2'}], 'the CAS applied once');
  });
});
