#!/usr/bin/env node

import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import Database from 'better-sqlite3';

import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  DistributedTransactionCoordinator,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
  DurableWorkflowCoordinator,
} from '../../src/workflow/durable-workflow-coordinator.js';
import {
  resolveCompositeKeyPartitions,
} from '../../src/query/partition-resolver-composite.js';
import {
  KEY_CONDITION_TYPE,
} from '../../src/query/partition-resolver-key-conditions.js';
import * as determinismModule from '../../src/partition/partition-transaction-determinism.js';
import {
  RaftRsDurableStore,
} from '../../src/raft/raft-rs-durable-store.js';
import {
  createLagrangeOltpAdapter,
} from '../../test/distributed/reference-client/lagrange-oltp-adapter.js';
import {
  createTransactionPersistenceGateway,
} from '../../test/test-helpers/transaction-persistence-gateway.js';
import {
  INSERT_SQL,
  ROW,
  ROW_2,
  TABLE,
  beginMessage,
  clearFixtureSingletons,
  identityOf,
  onFixtureLeader,
  queryMessage,
  resetFixtureSingletons,
  send,
} from '../../test/test-helpers/participant-transaction-fixture.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arraySome = Function.call.bind(Array.prototype.some);
const stringPadEnd = Function.call.bind(String.prototype.padEnd);
const stringRepeat = Function.call.bind(String.prototype.repeat);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const ZERO = 0;
const ONE = 1;
const TWO = 2;
const TEN_MS = 10;
const MIN_ITEM_COUNT = 15;
const ARGV_OFFSET = 2;
const DIGEST_LEN = 64;
const CHAR_A = 'a';
const CHAR_B = 'b';
const CHAR_C = 'c';
const CHAR_D = 'd';
const CHAR_ZERO = '0';
const TX_ID_LEN = 32;
const SEED_VAL = 42;
const RANGE_LOWER = 120;
const RANGE_UPPER = 180;
const METRIC_FLAG = '--metric';
const JSON_FLAG = '--json';
const JSON_INDENT = 2;
const NEWLINE = '\n';
const PASS_LINE = 'scenario-a-transaction-coordination-fast-path-guard: PASS\n';
const FAIL_PREFIX = 'FAIL ';
const COLON_SPACE = ': ';

const TYPE_FUNCTION = 'function';
const TYPE_NUMBER = 'number';
const SESSION_TRACE = 'trace-payment-session';
const SESSION_BOOKKEEPING = 'bookkeeping-session';
const SESSION_CONCURRENT = 'concurrent-stage-session';
const SESSION_WORKFLOW = 'sequential-workflow-session';
const SESSION_ROW_KEY_A = 'row-key-session-a';
const SESSION_ROW_KEY_B = 'row-key-session-b';
const TX_TRACE = stringRepeat(CHAR_A, TX_ID_LEN);
const TX_ROW_A = stringRepeat(CHAR_B, TX_ID_LEN);
const TX_ROW_B = stringRepeat(CHAR_C, TX_ID_LEN);
const TX_REPLAY = stringRepeat(CHAR_D, TX_ID_LEN);
const PARTITION_P1 = 'p1';
const PARTITION_P2 = 'p2';
const PARTITION_P3 = 'p3';
const PARTITION_P4 = 'p4';
const PARTITIONS_FOUR = Object.freeze([
  PARTITION_P1,
  PARTITION_P2,
  PARTITION_P3,
  PARTITION_P4,
]);
const PARTITIONS_TWO = Object.freeze([PARTITION_P1, PARTITION_P2]);
const DELAY_MS = 35;
const MAX_CONCURRENT_PHASE_MS = 105;
const DIGEST_PREFIX = 'digest-';
const OP_WRITE_1 = 'op-write-1';
const OP_WRITE_2 = 'op-write-2';
const SQL_WRITE_1 =
  'UPDATE warehouse SET ytd_cents = ytd_cents + 100 WHERE warehouse_id = 1';
const SQL_WRITE_2 =
  'UPDATE district SET ytd_cents = ytd_cents + 100 WHERE warehouse_id = 1 AND district_id = 1';
const TABLE_PARTICIPANTS = 'sql_transaction_participants';
const TABLE_TRANSACTIONS = 'sql_transactions';
const TABLE_WRITE_OPS = 'sql_write_operations';
const STATUS_PREPARING = 'PREPARING';
const STATUS_PREPARED = 'PREPARED';
const STATUS_COMMITTING = 'COMMITTING';
const WORKFLOW_ID_SEQ = 'wf-seq-1';
const KEY_WAREHOUSE_ID = 'warehouse_id';
const KEY_DISTRICT_ID = 'district_id';
const KEY_ORDER_ID = 'order_id';
const KEY_COLUMNS_ORDER_LINE = Object.freeze([
  KEY_WAREHOUSE_ID,
  KEY_DISTRICT_ID,
  KEY_ORDER_ID,
]);
const COMPOSITE_PARTITIONS = Object.freeze([
  Object.freeze({
    partition_id: 'ol-p1',
    partition_key_start: null,
    partition_key_end: '[1,1,100]',
  }),
  Object.freeze({
    partition_id: 'ol-p2',
    partition_key_start: '[1,1,100]',
    partition_key_end: '[1,2,1]',
  }),
  Object.freeze({
    partition_id: 'ol-p3',
    partition_key_start: '[1,2,1]',
    partition_key_end: '[2,1,1]',
  }),
  Object.freeze({
    partition_id: 'ol-p4',
    partition_key_start: '[2,1,1]',
    partition_key_end: null,
  }),
]);
const EXPECTED_PRUNED_PREFIX = Object.freeze(['ol-p1', 'ol-p2']);
const EXPECTED_PRUNED_RANGE = Object.freeze(['ol-p2']);
const EXPECTED_SEQ_ORDER = Object.freeze([
  'start:p1',
  'end:p1',
  'start:p2',
  'end:p2',
]);
const START_PREFIX = 'start:';
const END_PREFIX = 'end:';
const IDX_ORDERS_LATEST_PREFIX =
  'CREATE INDEX IF NOT EXISTS idx_orders_customer_latest ON orders';
const LOCKING_MODE_NATIVE = 'native-for-update';
const ENDPOINT_HOST = '127.0.0.1';
const ENDPOINT_PORT = 5432;
const BENCHMARK_USER = 'benchmark';
const BENCHMARK_DB = 'benchmark';
const ZERO_STR = '0';
const ONE_STR = '1';
const WORKLOAD_MINIMAL = Object.freeze({
  seed: SEED_VAL,
  workers: ONE,
  warmupOperationsPerWorker: ZERO,
  measurementOperationsPerWorker: ONE,
  warehouseCount: ONE,
  districtsPerWarehouse: ONE,
  customersPerDistrict: ONE,
  itemCount: MIN_ITEM_COUNT,
});
const GRANULARITY_ROW_KEY = 'row-key';
const ALREADY_ACTIVE_CODE = 'participant_transaction_already_active';
const CONFLICT_KEY_ID = 'shared-key';
const DISJOINT_KEY_A = 'key-a';
const DISJOINT_KEY_B = 'key-b';
const ROW_VALUE = 'val';
const SELECT_SQL = `SELECT id, value FROM ${TABLE} WHERE id = ?`;
const MEMORY_DB_PATH = ':memory:';
const RAFT_PARTITION_ID = 'p-fast-path-1';

const MSG_PARTICIPANT_ONCE =
  'newly enlisted participant must be persisted once, not duplicated';
const MSG_CAS_NO_READBACK =
  '1-row guarded participant-set CAS update must not require extra authoritative readback';
const MSG_NO_PROGRESS_MUTATION =
  'already-enlisted statement must not emit redundant ACTIVE status progress mutations';
const MSG_WRITE_OP_ONCE =
  'executeWriteStatement must persist sql_write_operations once with outcome';
const MSG_MAX_TWO_MUTATIONS =
  'already-enlisted write statement must perform at most 2 metadata mutations';
const MSG_ZERO_READBACKS =
  'already-enlisted write statement must perform 0 authoritative readbacks on 1-row CAS';
const MSG_ENLIST_CONCURRENT =
  'enlistParticipants across 4 partitions should overlap concurrently';
const MSG_COMMIT_CONCURRENT =
  'prepare + commit across 4 partitions should overlap concurrently';
const MSG_GENERIC_WORKFLOW_SEQ =
  'generic DurableWorkflowCoordinator must remain sequential by default';
const MSG_ROW_KEY_CONCURRENT =
  'row-key concurrency mode must allow concurrent active sessions on the same partition';
const MSG_ROW_KEY_CONFLICT =
  'concurrent staging of the same row key in row-key mode must fail fast';
const MSG_COMPOSITE_PREFIX =
  'leftmost equality prefix must prune composite partitions instead of scattering';
const MSG_COMPOSITE_RANGE =
  'leftmost prefix + next-column range must narrow to overlapping composite partitions';
const MSG_LOCAL_INDEX =
  'adapter setup must create selective local index idx_orders_customer_latest';
const MSG_DETERMINISM_REUSE =
  'repeated classifyTransactionStatement on same schema_version must reuse compiled validation';

const CHECK_ID_TRACER = 'payment-and-scenario-a-transaction-breakdown-tracer';
const CHECK_ID_P1 = 'priority-1-reduced-durable-transaction-bookkeeping';
const CHECK_ID_P2 = 'priority-2-concurrent-participant-prepare-and-commit';
const CHECK_ID_P3 = 'priority-3-partition-holding-time-and-key-concurrency';
const CHECK_ID_P4 = 'priority-4-staging-replay-reduction';
const CHECK_ID_P5 = 'priority-5-composite-partition-pruning-and-local-index';
const CHECK_ID_P6 =
  'priority-6-determinism-compilation-cache-and-raft-sync-telemetry';

const QUIET_LOGGER = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function sleepMs(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildPrepareResult(partitionId) {
  return {
    preparedDigest: stringPadEnd(`${DIGEST_PREFIX}${partitionId}`, DIGEST_LEN, CHAR_ZERO),
    prepareIndex: ONE,
    prepareTerm: ONE,
  };
}

async function withQuietFixtureLeader(fn) {
  resetFixtureSingletons();
  try {
    return await onFixtureLeader(fn);
  } finally {
    clearFixtureSingletons();
  }
}

async function checkTransactionBreakdownTracer() {
  const gateway = createTransactionPersistenceGateway();
  try {
    const engine = new SQLQueryEngine({
      logger: QUIET_LOGGER,
      controlPlaneSystemTableGateway: gateway,
      autoStartDistributedTransactionRecovery: false,
    });
    const coordinator = engine.transactionCoordinator;
    coordinator.beginParticipant = async () => {};
    coordinator.prepareParticipant = async (_s, partitionId) => buildPrepareResult(partitionId);
    coordinator.commitParticipant = async () => {};

    assert.equal(typeof coordinator.getLastTransactionBreakdown, TYPE_FUNCTION);
    assert.equal(typeof coordinator.getTransactionTelemetrySummary, TYPE_FUNCTION);

    const begun = await coordinator.begin(SESSION_TRACE, {transactionId: TX_TRACE});
    assert.equal(begun.success, true);
    await coordinator.executeWriteStatement(
      SESSION_TRACE,
      {operationId: OP_WRITE_1, sql: SQL_WRITE_1, partitionIds: [PARTITION_P1]},
      async () => ({success: true, affectedRows: ONE}),
    );
    const committed = await coordinator.commit(SESSION_TRACE);
    assert.equal(committed.success, true);

    const breakdown = coordinator.getLastTransactionBreakdown(begun.transactionId);
    assert.equal(Boolean(breakdown), true);
    assert.equal(breakdown.transactionId, begun.transactionId);
    assert.equal(typeof breakdown.beginMs, TYPE_NUMBER);
    assert.equal(typeof breakdown.statementsMs, TYPE_NUMBER);
    assert.equal(typeof breakdown.preparePhaseMs, TYPE_NUMBER);
    assert.equal(typeof breakdown.decisionPersistMs, TYPE_NUMBER);
    assert.equal(typeof breakdown.commitPhaseMs, TYPE_NUMBER);
    assert.equal(typeof breakdown.totalMs, TYPE_NUMBER);
    assert.equal(Number.isInteger(breakdown.metadataMutations), true);
    assert.equal(Number.isInteger(breakdown.metadataReads), true);
    assert.equal(breakdown.participantCount, ONE);
    await engine.shutdown();
  } finally {
    gateway.db.close();
  }
}

async function checkPriority1BookkeepingReduction() {
  const gateway = createTransactionPersistenceGateway();
  let authoritativeReads = ZERO;
  const origRead = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (...args) => {
    authoritativeReads += ONE;
    return origRead(...args);
  };
  try {
    const engine = new SQLQueryEngine({
      logger: QUIET_LOGGER,
      controlPlaneSystemTableGateway: gateway,
      autoStartDistributedTransactionRecovery: false,
    });
    const coordinator = engine.transactionCoordinator;
    coordinator.beginParticipant = async () => {};
    coordinator.prepareParticipant = async (_s, partitionId) => buildPrepareResult(partitionId);
    coordinator.commitParticipant = async () => {};

    await coordinator.begin(SESSION_BOOKKEEPING);
    const mutationsBeforeFirst = gateway.mutations.length;
    const readsBeforeFirst = authoritativeReads;

    await coordinator.executeWriteStatement(
      SESSION_BOOKKEEPING,
      {operationId: OP_WRITE_1, sql: SQL_WRITE_1, partitionIds: [PARTITION_P1]},
      async () => ({success: true, affectedRows: ONE}),
    );
    const firstWriteMutations = arraySlice(gateway.mutations, mutationsBeforeFirst);
    const participantMutationsOnEnlist = arrayFilter(
      firstWriteMutations,
      (m) => m.tableName === TABLE_PARTICIPANTS,
    );
    assert.equal(participantMutationsOnEnlist.length, ONE, MSG_PARTICIPANT_ONCE);
    assert.equal(authoritativeReads - readsBeforeFirst, ZERO, MSG_CAS_NO_READBACK);

    const mutationsBeforeSecond = gateway.mutations.length;
    const readsBeforeSecond = authoritativeReads;
    await coordinator.executeWriteStatement(
      SESSION_BOOKKEEPING,
      {operationId: OP_WRITE_2, sql: SQL_WRITE_2, partitionIds: [PARTITION_P1]},
      async () => ({success: true, affectedRows: ONE}),
    );
    const secondWriteMutations = arraySlice(gateway.mutations, mutationsBeforeSecond);
    const txProgressMutations = arrayFilter(
      secondWriteMutations,
      (m) => m.tableName === TABLE_TRANSACTIONS && m.data?.participant_set_state === undefined,
    );
    const writeOpMutations = arrayFilter(
      secondWriteMutations,
      (m) => m.tableName === TABLE_WRITE_OPS,
    );
    assert.equal(txProgressMutations.length, ZERO, MSG_NO_PROGRESS_MUTATION);
    assert.equal(writeOpMutations.length, ONE, MSG_WRITE_OP_ONCE);
    assert.equal(secondWriteMutations.length <= TWO, true, MSG_MAX_TWO_MUTATIONS);
    assert.equal(authoritativeReads - readsBeforeSecond, ZERO, MSG_ZERO_READBACKS);
    await engine.shutdown();
  } finally {
    gateway.db.close();
  }
}

async function checkPriority2ConcurrentParticipantPhases() {
  const coordinator = new DistributedTransactionCoordinator({
    logger: QUIET_LOGGER,
    beginParticipant: async () => {
      await sleepMs(DELAY_MS);
    },
    prepareParticipant: async (_s, partitionId) => {
      await sleepMs(DELAY_MS);
      return buildPrepareResult(partitionId);
    },
    commitParticipant: async () => {
      await sleepMs(DELAY_MS);
    },
  });

  await coordinator.begin(SESSION_CONCURRENT);
  const enlistStart = performance.now();
  await coordinator.enlistParticipants(SESSION_CONCURRENT, [...PARTITIONS_FOUR]);
  const enlistElapsed = performance.now() - enlistStart;
  assert.equal(enlistElapsed < MAX_CONCURRENT_PHASE_MS, true, MSG_ENLIST_CONCURRENT);

  const commitStart = performance.now();
  const committed = await coordinator.commit(SESSION_CONCURRENT);
  const commitElapsed = performance.now() - commitStart;
  assert.equal(committed.success, true);
  assert.equal(commitElapsed < MAX_CONCURRENT_PHASE_MS * TWO, true, MSG_COMMIT_CONCURRENT);

  const order = [];
  const wfCoordinator = new DurableWorkflowCoordinator();
  await wfCoordinator.registerWorkflow({
    workflowId: WORKFLOW_ID_SEQ,
    ownerKey: SESSION_WORKFLOW,
    status: STATUS_PREPARING,
  });
  for (const key of PARTITIONS_TWO) {
    await wfCoordinator.upsertParticipant(WORKFLOW_ID_SEQ, {
      participantId: key,
      participantKey: key,
      partitionId: key,
      status: STATUS_PREPARING,
    });
  }
  await wfCoordinator.executeParticipantStage(
    WORKFLOW_ID_SEQ,
    STATUS_PREPARING,
    STATUS_PREPARED,
    async (_key, participant) => {
      order.push(`${START_PREFIX}${participant.partitionId}`);
      await sleepMs(TEN_MS);
      order.push(`${END_PREFIX}${participant.partitionId}`);
    },
    {
      participantKeys: [...PARTITIONS_TWO],
      failureStatus: STATUS_COMMITTING,
    },
  );
  assert.deepEqual(order, EXPECTED_SEQ_ORDER, MSG_GENERIC_WORKFLOW_SEQ);
}

async function checkPriority3PartitionHoldingAndKeyConcurrency() {
  await withQuietFixtureLeader(async (leader) => {
    const defaultA = identityOf(TX_ROW_A, {sessionId: SESSION_ROW_KEY_A});
    const defaultB = identityOf(TX_ROW_B, {sessionId: SESSION_ROW_KEY_B});
    const begunA = await send(leader, beginMessage(defaultA));
    const deniedB = await send(leader, beginMessage(defaultB));
    assert.equal(begunA.success, true);
    assert.equal(deniedB.success, false);
    assert.equal(deniedB.failureCode, ALREADY_ACTIVE_CODE);
  });

  await withQuietFixtureLeader(async (leader) => {
    leader.concurrencyGranularity = GRANULARITY_ROW_KEY;
    const txA = identityOf(TX_ROW_A, {sessionId: SESSION_ROW_KEY_A});
    const txB = identityOf(TX_ROW_B, {sessionId: SESSION_ROW_KEY_B});
    const beginA = await send(leader, beginMessage(txA));
    const beginB = await send(leader, beginMessage(txB));
    assert.equal(beginA.success, true);
    assert.equal(beginB.success, true, MSG_ROW_KEY_CONCURRENT);
    const writeA = await send(
      leader,
      queryMessage(txA, INSERT_SQL, [DISJOINT_KEY_A, ROW_VALUE]),
    );
    const writeB = await send(
      leader,
      queryMessage(txB, INSERT_SQL, [DISJOINT_KEY_B, ROW_VALUE]),
    );
    assert.equal(writeA.success, true);
    assert.equal(writeB.success, true);

    const collideA = await send(
      leader,
      queryMessage(txA, INSERT_SQL, [CONFLICT_KEY_ID, ROW_VALUE]),
    );
    const collideB = await send(
      leader,
      queryMessage(txB, INSERT_SQL, [CONFLICT_KEY_ID, ROW_VALUE]),
    );
    assert.equal(collideA.success, true);
    assert.equal(collideB.success, false, MSG_ROW_KEY_CONFLICT);
  });
}

async function checkPriority4StagingReplayReduction() {
  await withQuietFixtureLeader(async (leader) => {
    const tx = identityOf(TX_REPLAY);
    await send(leader, beginMessage(tx));
    const readBeforeWrites = await send(leader, queryMessage(tx, SELECT_SQL, [ROW.id]));
    assert.equal(readBeforeWrites.success, true);
    await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value]));
    await send(leader, queryMessage(tx, INSERT_SQL, [ROW_2.id, ROW_2.value]));
    const readAfterWrites = await send(leader, queryMessage(tx, SELECT_SQL, [ROW.id]));
    assert.equal(readAfterWrites.success, true);
    assert.equal(readAfterWrites.rows?.length, ONE);
    assert.equal(typeof leader.getStagingReplayStats, TYPE_FUNCTION);
    const stats = leader.getStagingReplayStats();
    assert.equal(stats.emptyReadDirectExecutions >= ONE, true);
    assert.equal(stats.fastReplayedOperations >= ONE, true);
  });
}

async function checkPriority5CompositePruningAndLocalIndex() {
  const resolverStub = {
    getAllPartitions(partitions) {
      return arrayMap(partitions, (p) => p.partition_id);
    },
  };
  const prefixConditions = new Map([
    [KEY_WAREHOUSE_ID, [{type: KEY_CONDITION_TYPE.EQUALS, value: ONE}]],
    [KEY_DISTRICT_ID, [{type: KEY_CONDITION_TYPE.EQUALS, value: ONE}]],
  ]);
  const prunedPrefix = resolveCompositeKeyPartitions(
    resolverStub,
    COMPOSITE_PARTITIONS,
    KEY_COLUMNS_ORDER_LINE,
    prefixConditions,
  );
  assert.deepEqual(prunedPrefix, EXPECTED_PRUNED_PREFIX, MSG_COMPOSITE_PREFIX);

  const rangeConditions = new Map([
    [KEY_WAREHOUSE_ID, [{type: KEY_CONDITION_TYPE.EQUALS, value: ONE}]],
    [KEY_DISTRICT_ID, [{type: KEY_CONDITION_TYPE.EQUALS, value: ONE}]],
    [
      KEY_ORDER_ID,
      [
        {type: KEY_CONDITION_TYPE.GTE, value: RANGE_LOWER},
        {type: KEY_CONDITION_TYPE.LT, value: RANGE_UPPER},
      ],
    ],
  ]);
  const prunedRange = resolveCompositeKeyPartitions(
    resolverStub,
    COMPOSITE_PARTITIONS,
    KEY_COLUMNS_ORDER_LINE,
    rangeConditions,
  );
  assert.deepEqual(prunedRange, EXPECTED_PRUNED_RANGE, MSG_COMPOSITE_RANGE);

  const queries = [];
  const adapter = await createLagrangeOltpAdapter({
    endpoint: {host: ENDPOINT_HOST, port: ENDPOINT_PORT},
    connection: {user: BENCHMARK_USER, database: BENCHMARK_DB},
    workload: WORKLOAD_MINIMAL,
    lockingReadMode: LOCKING_MODE_NATIVE,
    createClient() {
      return {
        async connect() {},
        async query(text) {
          queries.push(text);
          return {rows: [{row_count: ZERO_STR}], rowCount: ONE};
        },
        async end() {},
      };
    },
  });
  assert.equal(adapter.lockingReadMode, LOCKING_MODE_NATIVE);
  assert.equal(
    arraySome(queries, (q) => stringStartsWith(q, IDX_ORDERS_LATEST_PREFIX)),
    true,
    MSG_LOCAL_INDEX,
  );
  await adapter.close();
}

async function checkPriority6DeterminismReuseAndRaftSyncTelemetry() {
  await withQuietFixtureLeader(async (leader) => {
    const getStats = determinismModule.getDeterminismClassifierStats;
    const before = typeof getStats === TYPE_FUNCTION ?
      getStats(leader.db) :
      null;
    assert.equal(Boolean(before), true);
    const first = determinismModule.classifyTransactionStatement(leader.db, {
      tableName: TABLE,
      sql: INSERT_SQL,
      params: [ROW.id, ROW.value],
    });
    const second = determinismModule.classifyTransactionStatement(leader.db, {
      tableName: TABLE,
      sql: INSERT_SQL,
      params: [ROW_2.id, ROW_2.value],
    });
    assert.equal(first.admitted, true);
    assert.equal(second.admitted, true);
    const after = getStats(leader.db);
    assert.equal(after.compiledHitCount > before.compiledHitCount, true, MSG_DETERMINISM_REUSE);
  });

  const raftDb = new Database(MEMORY_DB_PATH);
  const store = new RaftRsDurableStore(raftDb);
  try {
    assert.equal(typeof store.getDurableSyncStats, TYPE_FUNCTION);
    store.persistReady(RAFT_PARTITION_ID, {
      entries: [{index: ONE_STR, term: ONE_STR, entryType: ZERO, data: null}],
      mustSync: true,
    });
    const stats = store.getDurableSyncStats();
    assert.equal(stats.syncCommitCount >= ONE, true);
    assert.equal(typeof stats.totalSyncMs, TYPE_NUMBER);
  } finally {
    store.close();
  }
}

const CHECKS = Object.freeze([
  [CHECK_ID_TRACER, checkTransactionBreakdownTracer],
  [CHECK_ID_P1, checkPriority1BookkeepingReduction],
  [CHECK_ID_P2, checkPriority2ConcurrentParticipantPhases],
  [CHECK_ID_P3, checkPriority3PartitionHoldingAndKeyConcurrency],
  [CHECK_ID_P4, checkPriority4StagingReplayReduction],
  [CHECK_ID_P5, checkPriority5CompositePruningAndLocalIndex],
  [CHECK_ID_P6, checkPriority6DeterminismReuseAndRaftSyncTelemetry],
]);

async function runSingleCheck([id, fn]) {
  try {
    await fn();
    return {id, passed: true, error: null};
  } catch (error) {
    return {
      id,
      passed: false,
      error: String(error?.message || error),
    };
  }
}

async function evaluateChecks() {
  const results = [];
  for (const entry of CHECKS) {
    results.push(await runSingleCheck(entry));
  }
  const unmet = arrayFilter(results, (r) => !r.passed).length;
  return {results, unmet};
}

function reportFailedChecks(results) {
  const failed = arrayFilter(results, (r) => !r.passed);
  for (const row of failed) {
    process.stderr.write(`${FAIL_PREFIX}${row.id}${COLON_SPACE}${row.error}${NEWLINE}`);
  }
}

function renderStandardOutput(results, unmet) {
  if (unmet === ZERO) {
    process.stdout.write(PASS_LINE);
  } else {
    reportFailedChecks(results);
    process.stdout.write(`${unmet}${NEWLINE}`);
  }
}

async function main(argv) {
  const {results, unmet} = await evaluateChecks();
  if (arrayIncludes(argv, JSON_FLAG)) {
    process.stdout.write(`${JSON.stringify({results, unmet}, null, JSON_INDENT)}${NEWLINE}`);
  } else if (arrayIncludes(argv, METRIC_FLAG)) {
    process.stdout.write(`${unmet}${NEWLINE}`);
  } else {
    renderStandardOutput(results, unmet);
  }
  process.exitCode = Number(unmet > ZERO);
}

main(arraySlice(process.argv, ARGV_OFFSET)).catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || error}${NEWLINE}`);
  process.exitCode = ONE;
});
