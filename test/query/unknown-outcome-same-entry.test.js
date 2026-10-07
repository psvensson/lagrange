// An unknown-outcome write is resolved only under its own entry identity
// (owner ruling on the raft-rs cutover, R6-B: the joiner-registration retry
// is required for cutover correctness; rule R07: a semantic outcome is a
// named state).
//
// The lab chain: a runtime replacement (or a leader change) cuts a write in
// flight, so its partition answers OUTCOME_UNKNOWN. That answer crossed the
// remote-query hop as TEXT (no code, no entryId), the executor did not
// re-deliver it, the write applied anyway, and the caller's re-drive
// INSERTed under a FRESH entry: `UNIQUE constraint failed` -> "Node
// registration at this boot incarnation was not confirmed" -> join failed.
//
// The repaired contract, witnessed here with production classes (the real
// SQLQueryEngine, QueryExecutor, distributed write coordinator, control-plane
// gateway and PartitionService on the real rs-raft WASM core; the runtime
// replacement is the runtime owner's setCoreFaultInjector trap):
// - the typed outcome and its entryId survive every hop (W3);
// - the executor - the one re-delivery owner - re-delivers it under the same
//   entryId within its budget, and a spent budget answers the typed unknown
//   with its entryId and one spent-wait report (W4);
// - a caller's re-drive of the same logical write is the same entry (W5),
//   so it is answered applied with its original result, and nothing applies
//   twice (W6); end to end the registration is ACCEPTED (W1) and a leader
//   change ends with the original result, once (W2).

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {TABLES} from '../../src/constants/index.js';
import {ERRORS} from '../../src/constants/errors.js';
import * as writeKernel from '../../src/partition/partition-write-kernel.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  NODE_REGISTRATION_OUTCOME,
  writeNodeRegistrationAtIncarnation,
} from '../../src/control-plane/owners/node-registration-incarnation-write.js';
import {MembershipPublicationRuntimeOwner} from
  '../../src/control-plane/owners/membership-publication-runtime-owner.js';
import {ENDPOINT_INCARNATION_OUTCOME} from
  '../../src/control-plane/owners/endpoint-incarnation-authority.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  OperationType,
  createOperation,
} from '../../src/rebalancer/replica-status.js';
import {PARTITION_SETTLED_REPLAY} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {
  EXECUTOR_RETRY_DELAY_MS,
  JOINER_ID,
  JOIN_WRITE_OPTIONS,
  NODE_ID,
  SETTLE_BUDGET_MS,
  SPENT_BUDGET_MS,
  SURFACE_INSERT,
  USER_TABLE,
  appliedRow,
  lastLogIndexOf,
  logEntriesOf,
  nodeRow,
  rowsOf,
  releaseTrapOnAuthoritativeRead,
  reservationCoordinator,
  spendFirstAttempt,
  trapCore,
  waitFor,
  withGroupSurface,
  withMutedConsoleError,
  withSurface,
} from './unknown-outcome-surface-fixture.js';

const OUTCOME_UNKNOWN =
  writeKernel.PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN;
const TEMP_PREFIX = 'unknown-outcome-same-entry-';
const TEST_TIMEOUT_MS = 60000;
// A CDC routed write's budget: room for several engine attempts (each gets
// at least the CDC service's one-second floor).
const CDC_ROUTED_BUDGET_MS = 4000;
const BOOT_INCARNATION = 7;

const unavailableAuthority = async () => ({available: false, row: null});

// ---------------------------------------------------------------------------
// W1: the verifier's R6-B scenario, end to end with no authoritative read.

test('W1 (R6-B): a registration INSERT cut by a runtime replacement, with no ' +
  'authoritative read, ends ACCEPTED - one row, no UNIQUE error, never "not ' +
  'confirmed"', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([USER_TABLE], async ({engine, deliveries, of}) => {
    const surface = of(USER_TABLE);
    assert.equal((await engine.executeQuery(SURFACE_INSERT, ['row-0', 's']))
      .success, true, 'setup: the engine serves a write');
    deliveries.length = 0;
    let trap = null;
    const attempts = [];
    const outcome = await withMutedConsoleError(() =>
      writeNodeRegistrationAtIncarnation({
        row: {node_id: JOINER_ID, value: 'v'},
        bootIncarnation: BOOT_INCARNATION,
        observe: unavailableAuthority,
        insert: async (row) => {
          trap ??= trapCore(surface.partitionId, {once: true});
          const result = await engine.executeQuery(
            `INSERT INTO ${USER_TABLE} (node_id, value) VALUES (?, ?)`,
            [row.node_id, row.value]);
          attempts.push(result);
          return {success: result.success, partitionResult: result};
        },
        advance: async () => {
          throw new Error('no advance is planned for an absent row');
        },
      }));
    assert.equal(trap.count, 1, 'setup: the core trapped mid-INSERT');
    assert.equal(outcome.outcome, NODE_REGISTRATION_OUTCOME.ACCEPTED,
      `the registration is accepted (${JSON.stringify(outcome)})`);
    assert.equal(outcome.error, null, 'no failure surfaced');
    assert.equal(attempts.length, 1, 'one INSERT: no blind second birth');
    assert.ok(!JSON.stringify(attempts).includes('UNIQUE'),
      'no UNIQUE error anywhere in its answer');
    assert.ok(await appliedRow(surface, JOINER_ID), 'the row is there');
    assert.deepEqual(rowsOf(surface.dbPath, USER_TABLE, 'node_id')
      .filter((key) => key === JOINER_ID), [JOINER_ID], 'exactly one row');
    assert.ok(deliveries.length >= 2, 'the unknown outcome was re-delivered ' +
      `(${deliveries.length} deliveries)`);
    assert.equal(new Set(deliveries.map((d) => d.entryId)).size, 1,
      'under its one entryId');
  });
});


// The re-drive carries the first attempt's row (the same instance), or a
// row the join built again (new timestamps: a different logical write of the
// name, issued only after the pending instance was resolved under its own
// entry).
for (const [label, rebuildRow] of [['the same row', false],
  ['a rebuilt row', true]]) {
  test(`W1/W5/W6: the joiner's registration re-driven (${label}) after its ` +
    'unknown outcome resolves the first entry - ACCEPTED with one row, never ' +
    '"not confirmed" (real gateway, nodes table)', {timeout: TEST_TIMEOUT_MS},
  async () => {
    await withSurface([TABLES.NODES], async ({engine, gateway, deliveries,
      of}) => {
      const surface = of(TABLES.NODES);
      const firstRow = nodeRow();
      // The joiner's authoritative read is unavailable, as in the lab run.
      const register = (row) => withMutedConsoleError(() =>
        writeNodeRegistrationAtIncarnation({
          row, bootIncarnation: BOOT_INCARNATION,
          observe: unavailableAuthority,
          insert: (stamped, identity) => gateway.insertSystemTableRow(
            TABLES.NODES, stamped, {...JOIN_WRITE_OPTIONS, ...identity}),
          advance: (where, stamped, identity) => gateway.updateSystemTableRow(
            TABLES.NODES, where, stamped, {...JOIN_WRITE_OPTIONS, ...identity}),
        }));
      const {first, trap} = await spendFirstAttempt({engine, surface,
        attempt: () => register(firstRow)});
      assert.ok(trap.count >= 1, 'setup: the core trapped the write');
      assert.equal(first.outcome, NODE_REGISTRATION_OUTCOME.UNRESOLVED,
        'setup: the first attempt ends unresolved (unknown, no read)');
      assert.ok(await appliedRow(surface, JOINER_ID),
        'setup: the entry then commits in the replaced runtime');
      const firstEntries = new Set(deliveries.map((d) => d.entryId));
      assert.equal(firstEntries.size, 1, 'setup: one entry');
      const [firstEntry] = firstEntries;
      const mark = deliveries.length;
      engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;

      const redrive = await register(rebuildRow ?
        {...nodeRow(), last_heartbeat: firstRow.last_heartbeat + 1} :
        firstRow);
      assert.equal(redrive.outcome, NODE_REGISTRATION_OUTCOME.ACCEPTED,
        `the re-drive is accepted (${JSON.stringify(redrive)})`);
      assert.equal(redrive.error, null, 'no failure surfaced');
      const redriven = deliveries.slice(mark);
      assert.equal(redriven[0].entryId, firstEntry,
        'the first entry is delivered first');
      assert.equal(redriven[0].answer.settledReplay,
        PARTITION_SETTLED_REPLAY.OUTCOME_RETAINED,
        'answered from its outcome row: the original result');
      if (rebuildRow) {
        // The rebuilt row is a new logical write of the name; the first
        // instance applied, and the registration's owner says an applied
        // instance settles it: the rebuilt row is not issued (it could only
        // collide with the row the first wrote).
        assert.equal(redriven.length, 1, 'nothing else is delivered');
        assert.equal(redrive.observedRow, null,
          'accepted on the pending instance, not on a read');
      } else {
        assert.equal(redriven.length, 1, 'the same instance: nothing else');
      }
      assert.ok(!JSON.stringify(deliveries.map((d) => d.answer))
        .includes('UNIQUE'), 'no delivery was answered UNIQUE');
      assert.deepEqual(rowsOf(surface.dbPath, TABLES.NODES, 'node_id'),
        [JOINER_ID], 'exactly one row (W6)');
    });
  });
}

// ---------------------------------------------------------------------------
// W3/W4: every hop carries the typed outcome and its entryId; the executor
// re-delivers under the same entryId, bounded; a spent budget answers the
// typed unknown with its entryId and one spent-wait report.

test('W3/W4: the typed unknown outcome and its entryId survive every hop; ' +
  're-delivery is under the same entryId and bounded; the spent budget ' +
  'reports once', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([USER_TABLE], async ({engine, gateway, deliveries,
    of}) => {
    const surface = of(USER_TABLE);
    assert.equal((await engine.executeQuery(SURFACE_INSERT, ['row-0', 's']))
      .success, true, 'setup');
    deliveries.length = 0;
    const executorResults = [];
    const executeOnPartition = engine.queryExecutor.executeOnPartition
      .bind(engine.queryExecutor);
    engine.queryExecutor.executeOnPartition = async (...args) => {
      const result = await executeOnPartition(...args);
      executorResults.push(result);
      return result;
    };
    const startedAt = Date.now();
    const {first: engineResult, warnings} = await spendFirstAttempt({
      engine, surface,
      attempt: () => engine.executeQuery(SURFACE_INSERT, ['row-1', 'v'],
        {idempotencyKey: 'w3-key'}),
    });
    const elapsedMs = Date.now() - startedAt;
    const entryId = deliveries[0]?.entryId;
    assert.equal(typeof entryId, 'string', 'setup: the write carried an entryId');

    // W4: re-delivered, bounded, same entryId.
    assert.ok(deliveries.length >= 2, `re-delivered (${deliveries.length})`);
    assert.ok(deliveries.every((d) => d.entryId === entryId),
      'every re-delivery under the same entryId');
    assert.ok(elapsedMs < SPENT_BUDGET_MS + SETTLE_BUDGET_MS,
      `bounded by the executor budget (${elapsedMs} ms)`);
    const spentReports = warnings.filter((w) =>
      w.context?.entryId === entryId && w.context?.deliveries >= 1);
    assert.equal(spentReports.length, 1, 'one spent-wait report ' +
      `(${JSON.stringify(warnings.map((w) => w.message))})`);

    assertHopsCarryTheUnknown({deliveries, executorResults, engineResult,
      entryId});
    assert.equal(engineResult.success, false, 'never told it applied');
    assert.ok(String(executorResults.at(-1).error)
      .includes(ERRORS.WRITE_OUTCOME_UNKNOWN), 'nor that it failed');
    await assertSettledReplayAndTypedFailure({engine, gateway, surface,
      executorResults});
  });
});

// W3: hop by hop, the typed code, the entryId and the spent wait.
function assertHopsCarryTheUnknown({deliveries, executorResults,
  engineResult, entryId}) {
  const hops = [
    ['partition remote-query envelope', deliveries[0].answer],
    ['executor partition delivery', executorResults.at(-1)],
    ['distributed coordinator participant failure',
      engineResult.participantFailures?.[0]],
    ['engine result first failed participant',
      engineResult.firstFailedParticipant],
  ];
  for (const [hop, answer] of hops) {
    assert.equal(answer?.failureCode, OUTCOME_UNKNOWN,
      `${hop}: the typed code survives (${JSON.stringify(answer)})`);
    assert.equal(answer?.entryId, entryId, `${hop}: the entryId survives`);
  }
  for (const [hop, answer] of hops.slice(1)) {
    assert.equal(answer?.spentWait?.entryId, entryId,
      `${hop}: the spent wait travels with it`);
    assert.ok(answer.spentWait.deliveries >= 2 &&
        typeof answer.spentWait.waitedMs === 'number' &&
        answer.spentWait.lastObservedState?.state === OUTCOME_UNKNOWN,
    `${hop}: it says what was awaited and what was last seen ` +
        `(${JSON.stringify(answer.spentWait)})`);
  }
}

// The same key is the same entry at the gateway; a settled failure keeps its
// typed fields across the same hops.
async function assertSettledReplayAndTypedFailure({engine, gateway, surface,
  executorResults}) {
  assert.ok(await appliedRow(surface, 'row-1'), 'setup: it commits later');
  const replay = await gateway.executeQuery(SURFACE_INSERT, ['row-1', 'v'],
    {idempotencyKey: 'w3-key'});
  assert.equal(replay.success, true, 'the same key is the same entry: ' +
      `answered applied (${JSON.stringify(replay.error ?? null)})`);
  assert.equal(replay.affectedRows, 1, 'with its original result');
  assert.deepEqual(rowsOf(surface.dbPath, USER_TABLE, 'node_id').sort(),
    ['row-0', 'row-1'], 'applied once (W6)');

  // A settled failure keeps its typed fields across the same hops: the
  // committed statement's failure is not an unknown outcome.
  const duplicate = await engine.executeQuery(SURFACE_INSERT,
    ['row-1', 'other']);
  const settledFailure = executorResults.at(-1);
  assert.equal(duplicate.success, false, 'setup: a duplicate key fails');
  assert.equal(settledFailure.committed, true, 'executor: the committed ' +
      `failure stays typed (${JSON.stringify(settledFailure)})`);
  assert.equal(typeof settledFailure.failureCode, 'string',
    'executor: with its code');
  assert.notEqual(settledFailure.failureCode, OUTCOME_UNKNOWN,
    'never the unknown outcome');
  assert.equal(duplicate.participantFailures?.[0]?.committed, true,
    'coordinator: still the committed failure');
}

test('W5/W6: a control-plane owner write retried by its retry loop after ' +
  'an unknown outcome is the same entry (one identity per call)',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([TABLES.NODE_ENDPOINTS], async ({engine, gateway,
    deliveries, of}) => {
    const surface = of(TABLES.NODE_ENDPOINTS);
    const owner = new MembershipPublicationRuntimeOwner({nodeId: NODE_ID,
      controlPlaneSystemTableGateway: gateway,
      controlPlaneWriteRetryTimeoutMs: SETTLE_BUDGET_MS});
    const now = Date.now();
    const row = {endpoint_id: 'ep-uo-retry-ws', node_id: JOINER_ID,
      transport_type: 'websocket', address: 'ws://uo-joiner:2', priority: 0,
      metadata: '{}', status: 'active', boot_incarnation: BOOT_INCARNATION,
      created_at: now, updated_at: now};
    engine.queryExecutor.queryTimeoutMs = SPENT_BUDGET_MS;
    const trap = trapCore(surface.partitionId, {once: false});
    // The trap lasts until the first engine attempt's budget is spent (its
    // one spent-wait report); the owner's retry loop then retries.
    const logger = engine.queryExecutor.logger;
    engine.queryExecutor.logger = {...logger, debug: () => undefined,
      info: () => undefined, error: () => undefined,
      warn: (_message, context) => {
        if (context?.awaited !== undefined) {
          trap.release();
        }
      }};
    let result;
    try {
      result = await withMutedConsoleError(() =>
        owner.nodeEndpointsOwner.insertRow(row, {...JOIN_WRITE_OPTIONS}));
    } finally {
      trap.release();
      engine.queryExecutor.logger = logger;
    }
    assert.ok(trap.count >= 1, 'setup: the core trapped the write');
    assert.equal(result?.success, true, 'the retry loop ends applied ' +
      `(${JSON.stringify(result?.error ?? null)})`);
    assert.equal(new Set(deliveries.map((d) => d.entryId)).size, 1,
      'every attempt of the loop was one entry');
    assert.deepEqual(rowsOf(surface.dbPath, TABLES.NODE_ENDPOINTS,
      'endpoint_id'), [row.endpoint_id], 'one row (W6)');
  });
});

test('W3: the control-plane gateway hop carries the typed unknown outcome',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    await withSurface([TABLES.NODES], async ({engine, gateway, of}) => {
      const surface = of(TABLES.NODES);
      const {first} = await spendFirstAttempt({engine, surface,
        attempt: () => gateway.insertSystemTableRow(TABLES.NODES,
          {...nodeRow(), boot_incarnation: BOOT_INCARNATION},
          {...JOIN_WRITE_OPTIONS})});
      assert.equal(first.success, false, 'setup: unknown');
      const failure = first.participantFailures?.[0];
      assert.equal(failure?.failureCode, OUTCOME_UNKNOWN,
        `gateway result: typed code (${JSON.stringify(failure)})`);
      assert.equal(typeof failure?.entryId, 'string',
        'gateway result: entryId');
      assert.equal(failure?.spentWait?.entryId, failure?.entryId,
        'gateway result: spent wait');
      assert.ok(await appliedRow(surface, JOINER_ID),
        'the entry commits once the trap is gone');
    });
  });

// ---------------------------------------------------------------------------
// W5: the endpoint birth and a reservation-shaped birth re-driven after an
// unknown outcome are the same entry.

test('W5/W6: an endpoint birth re-driven after its unknown outcome is the ' +
  'same entry - applied once, never UNIQUE', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withSurface([TABLES.NODE_ENDPOINTS], async ({engine, gateway,
    deliveries, of}) => {
    const surface = of(TABLES.NODE_ENDPOINTS);
    const owner = new MembershipPublicationRuntimeOwner({nodeId: NODE_ID,
      controlPlaneSystemTableGateway: gateway,
      controlPlaneWriteRetryTimeoutMs: 0});
    const now = Date.now();
    const row = {endpoint_id: 'ep-uo-joiner-ws', node_id: JOINER_ID,
      transport_type: 'websocket', address: 'ws://uo-joiner:1', priority: 0,
      metadata: '{}', status: 'active', created_at: now, updated_at: now};
    // The authority is unreadable here (no owner RPC): only a birth is
    // planned, and an unknown outcome stays unresolved.
    const write = () => withMutedConsoleError(() =>
      owner.writeJoinEndpointAtIncarnation(TABLES.NODE_ENDPOINTS, row,
        BOOT_INCARNATION, {...JOIN_WRITE_OPTIONS}));
    const {first} = await spendFirstAttempt({engine, surface,
      attempt: write});
    assert.notEqual(first.outcome, ENDPOINT_INCARNATION_OUTCOME.APPLIED,
      `setup: the first birth is not confirmed (${first.outcome})`);
    assert.ok(await appliedRow(surface, row.endpoint_id),
      `setup: it commits later (${first.outcome})`);
    engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
    const redrive = await write();
    assert.equal(redrive.outcome, ENDPOINT_INCARNATION_OUTCOME.APPLIED,
      `the re-driven birth is answered applied (${redrive.outcome}, ` +
      `${redrive.error?.message ?? ''})`);
    assert.equal(new Set(deliveries.map((d) => d.entryId)).size, 1,
      'every delivery carried one entryId');
    assert.deepEqual(rowsOf(surface.dbPath, TABLES.NODE_ENDPOINTS,
      'endpoint_id'), [row.endpoint_id], 'one row');
  });
});

test('W5/W6: a reservation birth ensured again after its lost answer is the ' +
  'same entry (the named write identity held while unknown)',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([TABLES.STORAGE_RESERVATIONS], async ({engine, gateway,
    deliveries, of}) => {
    const surface = of(TABLES.STORAGE_RESERVATIONS);
    const now = Date.now();
    const insert = () => gateway.executeQuery(
      `INSERT INTO ${TABLES.STORAGE_RESERVATIONS} (reservation_id, ` +
      'operation_id, entity_type, entity_id, partition_id, target_node_id, ' +
      'estimated_bytes, amplification_factor, status, created_at, ' +
      'updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['res-op-1', 'op-1', 'partition', 'p-1', 'p-1', 'n-1', 1, 1,
        'active', now, now, now + 1000],
      {writeIdentity: `${TABLES.STORAGE_RESERVATIONS}:res-op-1:birth`,
        skipCacheWait: true});
    const {first} = await spendFirstAttempt({engine, surface,
      attempt: insert});
    assert.equal(first.success, false, 'setup: the first answer is unknown');
    assert.ok(await appliedRow(surface, 'res-op-1'), 'setup: it commits');
    engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
    const again = await insert();
    assert.equal(again.success, true, 'ensured again: answered applied ' +
      `(${JSON.stringify(again.error ?? null)})`);
    assert.equal(again.affectedRows, 1, 'with its original result');
    assert.equal(new Set(deliveries.map((d) => d.entryId)).size, 1,
      'one entryId for both calls');
    const settledAgain = await insert();
    assert.equal(settledAgain.success, false, 'once answered known, the ' +
      'name is released: a later write of it is a new entry (the UNIQUE ' +
      'conflict it is)');
    assert.deepEqual(rowsOf(surface.dbPath, TABLES.STORAGE_RESERVATIONS,
      'reservation_id'), ['res-op-1'], 'one row');
  });
});

test('W5/W6: the rebalancer\'s reservation birth (its own method) created ' +
  'again after its unknown outcome resolves the first entry and is answered ' +
  'by the authority - ALREADY_ACTIVE, one row', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withSurface([TABLES.REPLICA_OPERATIONS, TABLES.STORAGE_RESERVATIONS],
    async ({engine, gateway, deliveries, messageRouter,
      cdcIntegrationService, of}) => {
      const surface = of(TABLES.STORAGE_RESERVATIONS);
      const coordinator = reservationCoordinator({engine, gateway,
        messageRouter, cdcIntegrationService});
      const operation = Object.assign(createOperation({operationId: 'op-w5',
        type: OperationType.ADD, partitionId: 'p-w5', sourceNodeId: NODE_ID,
        targetNodeId: 'n-w5'}), {entityType: 'partition', entityId: 'p-w5'});
      await coordinator.persistNewOperation(operation);
      deliveries.length = 0;
      const authorityReads = releaseTrapOnAuthoritativeRead(gateway);
      const {first} = await spendFirstAttempt({engine, surface, attempt: () =>
        coordinator.createReservationForOperation(operation)});
      assert.notEqual(first.outcome, 'created',
        `setup: the first birth is not confirmed (${JSON.stringify(first)})`);
      assert.ok(await appliedRow(surface, 'res-op-w5'), 'setup: it commits');
      const [firstEntry] = new Set(deliveries.map((d) => d.entryId));
      const mark = deliveries.length;
      authorityReads.length = 0;
      engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
      // Created again: its timestamps are new, so it is a new logical write of
      // the name. The first entry is resolved first; it applied, which settles
      // a reservation birth: the new one is not issued, the authority answers.
      const again = await coordinator.createReservationForOperation(operation);
      assert.equal(again.outcome, 'already_active', 'answered by the ' +
      `authority: the first birth's reservation is ACTIVE (${JSON.stringify(
        again)})`);
      const redriven = deliveries.slice(mark);
      const redrivenWrites = redriven.filter((delivery) =>
        /^\s*(INSERT|UPDATE|DELETE)\b/iu.test(delivery.sql || ''));
      assert.equal(redrivenWrites[0].entryId, firstEntry,
        'the first entry is resolved first');
      assert.equal(redrivenWrites[0].answer.success, true,
        'answered applied from its outcome row');
      assert.equal(redrivenWrites.length, 1,
        'no second reservation mutation is delivered');
      assert.equal(authorityReads.some((read) =>
        read.tableName === TABLES.REPLICA_OPERATIONS &&
      read.options?.authoritativeReadMode ===
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED &&
      read.result?.success === true), true,
      'the retry consumes the strict durable operation owner');
      assert.ok(!JSON.stringify(deliveries.map((d) => d.answer))
        .includes('UNIQUE'), 'never answered UNIQUE');
      assert.deepEqual(rowsOf(surface.dbPath, TABLES.STORAGE_RESERVATIONS,
        'reservation_id'), ['res-op-w5'], 'one row (W6)');
      await coordinator.shutdown();
    }, {cdc: true});
});

test('W5/W6: the CDC service\'s routed write retries every engine attempt ' +
  'under one entry, and a call that ends unknown re-driven under its key ' +
  'is that entry', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([TABLES.NODES], async ({engine, deliveries, of}) => {
    const surface = of(TABLES.NODES);
    const cdc = new CDCIntegrationService({nodeId: NODE_ID,
      sqlQueryEngine: engine});
    cdc.initialize();
    cdc.retryDelayMs = EXECUTOR_RETRY_DELAY_MS;
    const row = {...nodeRow(), boot_incarnation: BOOT_INCARNATION};
    const engineCalls = {count: 0};
    const executeQuery = engine.executeQuery.bind(engine);
    engine.executeQuery = (...args) => {
      engineCalls.count += 1;
      return executeQuery(...args);
    };
    const insert = () => cdc.insertSystemTableRow(TABLES.NODES, row,
      {skipCacheWait: true, queryTimeoutMs: CDC_ROUTED_BUDGET_MS,
        idempotencyKey: 'w5-cdc-key'});
    let firstError = null;
    const {first} = await spendFirstAttempt({engine, surface,
      attempt: () => insert().catch((error) => {
        firstError = error;
        return null;
      })});
    assert.equal(first, null, 'setup: the routed write ends unknown');
    assert.ok(firstError, 'setup: thrown');
    const firstCallEngineAttempts = engineCalls.count;
    const engineAttempts = new Set(deliveries.map((d) => d.entryId));
    assert.equal(engineAttempts.size, 1, 'every engine attempt of the routed ' +
      `write was one entry (${[...engineAttempts]})`);
    assert.ok(await appliedRow(surface, JOINER_ID), 'setup: it commits');
    engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
    const again = await insert();
    assert.equal(again.success, true, 'the re-drive under its key is ' +
      'answered applied');
    assert.equal(new Set(deliveries.map((d) => d.entryId)).size, 1,
      'the same entry');
    assert.deepEqual(rowsOf(surface.dbPath, TABLES.NODES, 'node_id'),
      [JOINER_ID], 'one row (W6)');
    assert.ok(firstCallEngineAttempts >= 2, 'the CDC loop retried its ' +
      `engine attempt within the first call (${firstCallEngineAttempts}), ` +
      'each under the one entry');
    cdc.shutdown?.();
  });
});

// ---------------------------------------------------------------------------
// W2: a leader change mid-write through the engine.

test('W2: an INSERT whose proposer loses leadership mid-write commits ' +
  'under the new leader, and the caller ends with the original result, ' +
  'exactly once', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withGroupSurface({partitionId: 'uo-lc', table: USER_TABLE,
    tempPrefix: TEMP_PREFIX}, async ({engine, services, members, peers,
    blocked, sent, dbFileOf}) => {
    const [, r2] = services;
    const served = await engine.executeQuery(SURFACE_INSERT, ['row-0', 's']);
    assert.equal(served.success, true, 'setup: the group serves a write ' +
      `(${JSON.stringify(served.error ?? null)} ` +
      `${JSON.stringify(served.participantFailures ?? null)})`);
    sent.length = 0;
    const [p1, p2, p3] = peers;
    // r1's appends reach r2 only, and no follower's answer reaches r1: the
    // write is on r1's and r2's logs, uncommitted.
    for (const pair of [`${p1}>${p3}`, `${p2}>${p1}`, `${p3}>${p1}`]) {
      blocked.add(pair);
    }
    const write = engine.executeQuery(SURFACE_INSERT, ['row-1', 'v'],
      {timeoutMs: SETTLE_BUDGET_MS});
    assert.equal(await waitFor(() => lastLogIndexOf(dbFileOf(members[1])) ===
      lastLogIndexOf(dbFileOf(members[0])) &&
      sent.some((d) => d.entryId && logEntriesOf(dbFileOf(members[1]),
        d.entryId).length === 1)), true, 'setup: the entry reached r2');
    await r2.raft.campaign();
    assert.equal(await waitFor(() => r2.raft.readStatus().role ===
      RAFT_ROLE.LEADER), true, 'setup: r2 leads');
    assert.equal(await waitFor(() => rowsOf(dbFileOf(members[1]), USER_TABLE,
      'node_id').includes('row-1')), true,
    'setup: the new leader committed the entry');
    blocked.clear();
    const answered = await write;
    assert.equal(answered.success, true, 'the caller is told it applied ' +
      `(${JSON.stringify(answered.error ?? null)})`);
    assert.equal(answered.affectedRows, 1, 'with its original result');
    assert.ok(sent.length >= 2, `re-delivered (${JSON.stringify(sent)})`);
    assert.equal(new Set(sent.map((d) => d.entryId)).size, 1,
      'every delivery of the write under its one entryId');
    assert.equal(await waitFor(() => members.every((member) =>
      rowsOf(dbFileOf(member), USER_TABLE, 'node_id').sort().join() ===
      'row-0,row-1')), true, 'every replica holds the row once');
  });
});
