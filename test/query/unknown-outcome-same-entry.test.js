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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/index.js';
import {ERRORS} from '../../src/constants/errors.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CDCOperation,
  PartitionService,
} from '../../src/partition/partition-service.js';
import * as writeKernel from '../../src/partition/partition-write-kernel.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {setCoreFaultInjector} from
  '../../src/raft/raft-rs-runtime-owner.js';
import {createControlPlaneRuntimeBundle} from
  '../../src/control-plane/control-plane-runtime-bundle.js';
import {CONTROL_PLANE_PHASE_SCOPE} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  NODE_REGISTRATION_OUTCOME,
  writeNodeRegistrationAtIncarnation,
} from '../../src/control-plane/owners/node-registration-incarnation-write.js';
import {MembershipPublicationRuntimeOwner} from
  '../../src/control-plane/owners/membership-publication-runtime-owner.js';
import {ENDPOINT_INCARNATION_OUTCOME} from
  '../../src/control-plane/owners/endpoint-incarnation-authority.js';
import {getSchemaByTableName} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {PARTITION_SETTLED_REPLAY} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';

const OUTCOME_UNKNOWN =
  writeKernel.PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN;
const TEMP_PREFIX = 'unknown-outcome-same-entry-';
const TEST_TIMEOUT_MS = 60000;
const NODE_ID = 'uo-node';
const EXECUTOR_RETRY_DELAY_MS = 5;
// The executor budget of a delivery the trap outlasts.
const SPENT_BUDGET_MS = 600;
// A CDC routed write's budget: room for several engine attempts (each gets
// at least the CDC service's one-second floor).
const CDC_ROUTED_BUDGET_MS = 4000;
const SETTLE_BUDGET_MS = 8000;
const POLL_MS = 10;
const ADVANCE_APPEND = 'advance_append';
const TRAP_MESSAGE = 'unreachable';
const BOOT_INCARNATION = 7;
const JOINER_ID = 'uo-joiner';
const USER_TABLE = 'uo_rows';
const SURFACE_INSERT = `INSERT INTO ${USER_TABLE} (node_id, value) ` +
  'VALUES (?, ?)';
const ACTIVE_PARTITION_VERSION = 1;
const GROUP_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});
const GROUP_BUDGET_MS = 10000;
const JOIN_WRITE_OPTIONS = Object.freeze({
  deliveryPriority: 'critical',
  phaseScope: CONTROL_PLANE_PHASE_SCOPE.JOIN,
  skipCacheWait: true,
});

function quietEnvironment(raft = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}, raft});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, budgetMs = SETTLE_BUDGET_MS) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await sleep(POLL_MS);
  }
  return false;
}

function rowsOf(dbPath, table, keyColumn) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return independent.prepare(`SELECT ${keyColumn} AS k FROM ${table}`)
      .all().map((row) => row.k);
  } finally {
    independent.close();
  }
}

// The partition schema of a system table: its real columns, its key.
function partitionSchemaOf(table) {
  if (table === USER_TABLE) {
    return {columns: [
      {name: 'node_id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]};
  }
  return {columns: getSchemaByTableName(table).columns.map(
    ({name, type, primaryKey}) => ({name, type, primaryKey: primaryKey === true}))};
}

function keyOf(table) {
  return partitionSchemaOf(table).columns.find((column) => column.primaryKey)
    .name;
}

// A trap of the shared core on `groupId`'s light-Ready advance (after the
// write's entry is durable, before it commits), as a trapped WASM instance
// throws: `once` traps the next one; otherwise every one until released.
function trapCore(groupId, {once}) {
  const trap = {count: 0, armed: true};
  setCoreFaultInjector((stepGroupId, operation) => {
    if (trap.armed && stepGroupId === groupId &&
        operation === ADVANCE_APPEND) {
      trap.count += 1;
      if (once) {
        trap.armed = false;
        setCoreFaultInjector(null);
      }
      throw new globalThis.WebAssembly.RuntimeError(TRAP_MESSAGE);
    }
  });
  trap.release = () => {
    trap.armed = false;
    setCoreFaultInjector(null);
  };
  return trap;
}

async function withMutedConsoleError(body) {
  const original = console.error;
  console.error = () => undefined;
  try {
    return await body();
  } finally {
    console.error = original;
  }
}

// Lone rs-raft leaders, one per table, behind the production engine and a
// router that delivers to each partition's remote-query handler; the
// control-plane gateway (SQL path, as the joiner's) on that engine.
async function withSurface(tables, body) {
  quietEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const surfaces = new Map();
  const tableRows = [];
  const partitionRows = [];
  const serviceRows = [];
  const deliveries = [];
  try {
    for (const table of tables) {
      const partitionId = `${table}-p1`;
      const replicaId = `${partitionId}-r1`;
      const address = `${NODE_ID}/partition/${replicaId}`;
      const dbPath = path.join(directory, `${partitionId}.sqlite`);
      const tableRow = {table_name: table, primaryKey: keyOf(table),
        active_partition_version: ACTIVE_PARTITION_VERSION};
      const partition = new PartitionService(withFoundingStamp({
        tableId: table, tableName: table, partitionId, replicaId,
        replicaIds: [replicaId], nodeId: NODE_ID, dbPath,
        systemTableCache: {get: (type, key) => (type === TABLES.TABLES &&
          key === table ? tableRow : null)},
        schema: partitionSchemaOf(table),
      }));
      await partition.initialize();
      partition.startElection();
      // Leading, as the core says and as the service's write path sees it.
      assert.equal(await waitFor(() => partition.raft.readStatus().role ===
        RAFT_ROLE.LEADER && partition.role === RAFT_ROLE.LEADER), true,
      `setup: ${partitionId} leads`);
      surfaces.set(address, {partition, dbPath, partitionId, table});
      tableRows.push(tableRow);
      partitionRows.push({partition_id: partitionId, table_name: table,
        leader_node_id: NODE_ID, partition_key_start: null,
        partition_key_end: null});
      serviceRows.push({service_id: replicaId, service_type: 'partition',
        partition_id: partitionId, node_id: NODE_ID, raft_role: 'leader',
        address, status: 'active'});
    }
    const byType = {tables: tableRows, partitions: partitionRows,
      services: serviceRows};
    const messageRouter = {
      async deliver(address, message) {
        const surface = surfaces.get(address);
        const answer = await surface.partition.handleRemoteQuery(message);
        deliveries.push({table: surface.table, entryId: message.entryId,
          answer});
        return answer;
      },
    };
    const engine = new SQLQueryEngine({
      nodeId: NODE_ID,
      systemCache: {
        get(type, key) {
          if (type === TABLES.TABLES) {
            return tableRows.find((row) => row.table_name === key);
          }
          if (type === TABLES.PARTITIONS) {
            return partitionRows.find((row) => row.partition_id === key) ||
              null;
          }
          return null;
        },
        filter: (type, predicate) => (byType[type] || []).filter(predicate),
        getAll: (type) => byType[type] || [],
      },
      messageRouter,
      cdcIntegrationService: {
        async upsertSystemTableRow() {
          return {success: true};
        },
      },
    });
    engine.persistDistributedWriteOperationRow = async () => ({success: true});
    engine.queryExecutor.leaderRetryDelayMs = EXECUTOR_RETRY_DELAY_MS;
    const gateway = createControlPlaneRuntimeBundle({nodeId: NODE_ID,
      sqlQueryEngine: engine, messageRouter}).controlPlaneSystemTableGateway;
    const of = (table) => [...surfaces.values()].find((surface) =>
      surface.table === table);
    await body({engine, gateway, deliveries, of});
  } finally {
    setCoreFaultInjector(null);
    for (const {partition} of surfaces.values()) {
      // A group the trap left held is restored before its partition stops
      // (a group stopped while held keeps the shared core from electing the
      // next test's groups - recorded as a runtime-owner finding).
      await waitFor(() => partition.raft.readStatus().role ===
        RAFT_ROLE.LEADER);
      await partition.shutdown();
    }
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
}

// Wait until the partition applied a row with this key (the replaced
// runtime commits the trapped entry; reads drive the runtime).
async function appliedRow(surface, key) {
  return waitFor(() => {
    surface.partition.raft.readStatus();
    return rowsOf(surface.dbPath, surface.table, keyOf(surface.table))
      .includes(key);
  });
}

function nodeRow() {
  const now = Date.now();
  return {node_id: JOINER_ID, node_address: 'ws://uo-joiner:1',
    cpu_cores: 1, memory_mb: 1, disk_gb: 1, status: 'joining',
    connection_state: 'connected', last_heartbeat: now,
    latency_assignment_state: 'unassigned', created_at: now};
}

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

// ---------------------------------------------------------------------------
// The budget-spent shape (the lab chain): the trap outlasts the executor's
// budget, so the first attempt ends unknown; the joiner's re-drive of the
// same registration must be the same entry.

async function spendFirstAttempt({engine, surface, attempt}) {
  engine.queryExecutor.queryTimeoutMs = SPENT_BUDGET_MS;
  const warnings = [];
  const logger = engine.queryExecutor.logger;
  engine.queryExecutor.logger = {...logger,
    warn: (message, context) => warnings.push({message, context}),
    debug: () => undefined, info: () => undefined, error: () => undefined};
  const trap = trapCore(surface.partitionId, {once: false});
  let first;
  try {
    first = await withMutedConsoleError(attempt);
  } finally {
    trap.release();
    engine.queryExecutor.logger = logger;
  }
  return {first, trap, warnings};
}

test('W1/W5/W6: the joiner\'s registration re-driven after its unknown ' +
  'outcome is the same entry - ACCEPTED with one row, never UNIQUE, never ' +
  '"not confirmed" (real gateway, nodes table)', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withSurface([TABLES.NODES], async ({engine, gateway, deliveries,
    of}) => {
    const surface = of(TABLES.NODES);
    // The joiner's authoritative read is unavailable, as in the lab run.
    const register = () => withMutedConsoleError(() =>
      writeNodeRegistrationAtIncarnation({
        row: nodeRow(), bootIncarnation: BOOT_INCARNATION,
        observe: unavailableAuthority,
        insert: (row, identity) => gateway.insertSystemTableRow(TABLES.NODES,
          row, {...JOIN_WRITE_OPTIONS, ...identity}),
        advance: (where, row, identity) => gateway.updateSystemTableRow(
          TABLES.NODES, where, row, {...JOIN_WRITE_OPTIONS, ...identity}),
      }));
    const {first, trap} = await spendFirstAttempt({engine, surface,
      attempt: register});
    assert.ok(trap.count >= 1, 'setup: the core trapped the write');
    assert.equal(first.outcome, NODE_REGISTRATION_OUTCOME.UNRESOLVED,
      'setup: the first attempt ends unresolved (unknown, no read)');
    assert.ok(await appliedRow(surface, JOINER_ID),
      'setup: the entry then commits in the replaced runtime');
    const firstEntries = new Set(deliveries.map((d) => d.entryId));
    engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;

    const redrive = await register();
    assert.equal(redrive.outcome, NODE_REGISTRATION_OUTCOME.ACCEPTED,
      `the re-drive is accepted (${JSON.stringify(redrive)})`);
    assert.equal(redrive.error, null, 'no failure surfaced');
    assert.ok(!JSON.stringify(deliveries.map((d) => d.answer))
      .includes('UNIQUE'), 'no delivery was answered UNIQUE');
    assert.equal(new Set(deliveries.map((d) => d.entryId)).size, 1,
      'every delivery of both attempts carried one entryId ' +
      `(${[...new Set(deliveries.map((d) => d.entryId))]})`);
    assert.deepEqual([...firstEntries], [deliveries.at(-1).entryId],
      'the re-drive is the first attempt\'s entry');
    assert.equal(deliveries.at(-1).answer.settledReplay,
      PARTITION_SETTLED_REPLAY.OUTCOME_RETAINED,
      'answered from the outcome row: the original result');
    assert.deepEqual(rowsOf(surface.dbPath, TABLES.NODES, 'node_id'),
      [JOINER_ID], 'exactly one row (W6)');
  });
});

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

test('W5/W6: the rebalancer\'s reservation birth (its own method) ensured ' +
  'again after its unknown outcome is CREATED from the same entry - one row, ' +
  'never UNIQUE', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withSurface([TABLES.STORAGE_RESERVATIONS], async ({engine, gateway,
    deliveries, of}) => {
    const surface = of(TABLES.STORAGE_RESERVATIONS);
    // The coordinator's reservation owner over the real gateway; its retry
    // loop's own delivery is the gateway's.
    const coordinator = Object.create(RebalanceCoordinator.prototype);
    Object.assign(coordinator, {
      storageAccountingService: {estimateReplicaBytes: () => 1},
      resolveEntitySizeBytes: () => 1,
      config: {reservationTtlMs: 60000},
      stats: {reservationsCreated: 0},
      logger: {warn: () => undefined, info: () => undefined,
        debug: () => undefined, error: () => undefined},
      emit: () => undefined,
      executeOperationMutationWithRetry: (sql, params, options) =>
        gateway.executeQuery(sql, params, {...options, skipCacheWait: true}),
    });
    const operation = {operationId: 'op-w5', type: OperationType.ADD,
      entityType: 'partition', entityId: 'p-w5', partitionId: 'p-w5',
      targetNodeId: 'n-w5'};
    const {first} = await spendFirstAttempt({engine, surface,
      attempt: () => coordinator.createReservationForOperation(operation)});
    assert.notEqual(first.outcome, 'created',
      `setup: the first birth is not confirmed (${JSON.stringify(first)})`);
    assert.ok(await appliedRow(surface, 'res-op-w5'), 'setup: it commits');
    engine.queryExecutor.queryTimeoutMs = SETTLE_BUDGET_MS;
    const again = await coordinator.createReservationForOperation(operation);
    assert.equal(again.outcome, 'created', 'ensured again: CREATED from the ' +
      `same entry (${JSON.stringify(again)})`);
    assert.equal(new Set(deliveries.map((d) => d.entryId)).size, 1,
      'one entryId for both calls');
    assert.ok(!JSON.stringify(deliveries.map((d) => d.answer))
      .includes('UNIQUE'), 'never answered UNIQUE');
    assert.deepEqual(rowsOf(surface.dbPath, TABLES.STORAGE_RESERVATIONS,
      'reservation_id'), ['res-op-w5'], 'one row (W6)');
  });
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
  quietEnvironment(GROUP_TIMING);
  const partitionId = 'uo-lc';
  const members = [[`${partitionId}-r1`, 'node-1'],
    [`${partitionId}-r2`, 'node-2'], [`${partitionId}-r3`, 'node-3']];
  const group = await formAdmittedGroup({partitionId, members,
    tempPrefix: TEMP_PREFIX, budgetMs: GROUP_BUDGET_MS,
    serviceOptions: {tableId: USER_TABLE, tableName: USER_TABLE,
      schema: partitionSchemaOf(USER_TABLE)}});
  const {services, dbFileOf, addressOf} = group;
  const [r1, r2] = services;
  const network = r1.transport;
  const deliver = network.deliver;
  const blocked = new Set();
  network.deliver = (address, envelope, ...rest) => {
    const packet = envelope?.payload ?? envelope;
    return blocked.has(`${packet?.from}>${packet?.to}`) ?
      Promise.resolve({acknowledged: true}) :
      deliver.call(network, address, envelope, ...rest);
  };
  try {
    const tableRow = {table_id: USER_TABLE, table_name: USER_TABLE,
      primaryKey: 'node_id',
      active_partition_version: ACTIVE_PARTITION_VERSION};
    // Each replica validates the engine's epoch fence against its own
    // tables row.
    for (const service of services) {
      service.systemTableCache.applySystemTableChange(TABLES.TABLES,
        CDCOperation.INSERT, tableRow);
    }
    const partitionRows = [{partition_id: partitionId, table_name: USER_TABLE,
      leader_node_id: 'node-1', partition_key_start: null,
      partition_key_end: null}];
    const serviceRows = members.map((member, index) => ({
      service_id: member[0], service_type: 'partition', partition_id:
        partitionId, node_id: member[1], address: addressOf(member),
      raft_role: index === 0 ? 'leader' : 'follower', status: 'active'}));
    const byType = {tables: [tableRow], partitions: partitionRows,
      services: serviceRows};
    const sent = [];
    const engine = new SQLQueryEngine({
      systemCache: {
        get: (type, key) => (type === TABLES.TABLES ?
          byType.tables.find((row) => row.table_name === key) :
          byType.partitions.find((row) => row.partition_id === key) || null),
        filter: (type, predicate) => (byType[type] || []).filter(predicate),
        getAll: (type) => byType[type] || [],
      },
      messageRouter: {
        async deliver(address, message) {
          sent.push({address, entryId: message.entryId});
          return services[members.findIndex((member) =>
            addressOf(member) === address)].handleRemoteQuery(message);
        },
      },
      cdcIntegrationService: {async upsertSystemTableRow() {
        return {success: true};
      }},
    });
    engine.persistDistributedWriteOperationRow = async () => ({success: true});
    engine.queryExecutor.leaderRetryDelayMs = EXECUTOR_RETRY_DELAY_MS;
    const served = await engine.executeQuery(SURFACE_INSERT, ['row-0', 's']);
    assert.equal(served.success, true, 'setup: the group serves a write ' +
      `(${JSON.stringify(served.error ?? null)} ` +
      `${JSON.stringify(served.participantFailures ?? null)})`);
    const [p1, p2, p3] = services.map((service) =>
      String(service.raft.readStatus().peerId));
    // r1's appends reach r2 only, and no follower's answer reaches r1: the
    // write is on r1's and r2's logs, uncommitted.
    for (const pair of [`${p1}>${p3}`, `${p2}>${p1}`, `${p3}>${p1}`]) {
      blocked.add(pair);
    }
    const write = engine.executeQuery(SURFACE_INSERT, ['row-1', 'v'],
      {timeoutMs: SETTLE_BUDGET_MS});
    assert.equal(await waitFor(() => rowsOf(dbFileOf(members[1]), USER_TABLE,
      'node_id').length >= 1 && r2.raft.readStatus().lastIndex ===
      r1.raft.readStatus().lastIndex), true, 'setup: the entry reached r2');
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
    assert.equal(new Set(sent.slice(1).map((d) => d.entryId)).size, 1,
      'under the one entryId');
    assert.equal(await waitFor(() => members.every((member) =>
      rowsOf(dbFileOf(member), USER_TABLE, 'node_id').sort().join() ===
      'row-0,row-1')), true, 'every replica holds the row once');
  } finally {
    network.deliver = deliver;
    await group.dispose();
    resetEnvironment();
  }
});
