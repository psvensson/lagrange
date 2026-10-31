#!/usr/bin/env node

import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  executeLockingReadReservations,
} from '../../src/query/sql-locking-read-execution.js';
import {
  clearAllReservations,
  getTransactionReservations,
} from '../../src/partition/partition-locking-read-reservation.js';
import {
  RaftRsDurableStore,
} from '../../src/raft/raft-rs-durable-store.js';
import {
  createTransactionPersistenceGateway,
} from '../../test/test-helpers/transaction-persistence-gateway.js';
import {
  INSERT_SQL,
  TABLE,
  V3,
  beginMessage,
  bindingOf,
  clearFixtureSingletons,
  commitMessage,
  identityOf,
  onFixtureLeader,
  prepareMessage,
  queryMessage,
  resetFixtureSingletons,
  send,
  txMessage,
} from '../../test/test-helpers/participant-transaction-fixture.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringPadEnd = Function.call.bind(String.prototype.padEnd);
const stringRepeat = Function.call.bind(String.prototype.repeat);

const ZERO = 0;
const ONE = 1;
const TWO = 2;
const THREE = 3;
const FOUR = 4;
const FIVE = 5;
const TEN = 10;
const ARGV_OFFSET = 2;
const TX_ID_LEN = 32;
const DIGEST_LEN = 64;
const CHAR_A = 'a';
const CHAR_B = 'b';
const CHAR_C = 'c';
const CHAR_D = 'd';
const CHAR_E = 'e';
const CHAR_F = 'f';
const CHAR_ONE = '1';
const CHAR_TWO = '2';
const CHAR_THREE = '3';
const CHAR_FOUR = '4';
const CHAR_ZERO = '0';
const STR_ONE = '1';
const STR_TWO = '2';
const STR_THREE = '3';
const SESSION_WS2 = 'ws2-session';
const SESSION_F = 'sess-f';
const SESSION_G = 'sess-g';
const SESSION_H = 'sess-h';
const SESSION_I = 'sess-i';
const SESSION_J = 'sess-j';
const RK_ONE = 'rk-1';
const RK_TWO = 'rk-2';
const VAL_RB = 'rb-val';
const VAL_AFTER_RB = 'after-rb-1';
const VAL_AFTER_RB_2 = 'after-rb-2';
const VAL_C1 = 'c-val-1';
const VAL_C2 = 'c-val-2';
const VAL_C1_SECOND = 'c-val-1-second';
const PART_P1 = 'p1';
const PART_P2 = 'p2';
const GROUP_BATCH = 'g-batch';
const GRANULARITY_ROW_KEY = 'row-key';
const MSG_STOCK_PK =
  'stock FOR UPDATE with bound params must resolve PK from WHERE without fallback SELECT';
const MSG_NEW_ORDER_PK =
  'split-PK new_order FOR UPDATE must merge WHERE equalities with projected order_id without fallback SELECT';
const MSG_SKIP_RETAIN =
  'already-admitted participant set must skip redundant retainParticipantSet gateway mutations';
const MSG_SKIP_TRANSIENT =
  'persistDistributedTransactionParticipantRow must skip transient PREPARING/COMMITTING/ROLLING_BACK mutations';
const MSG_PREPARED_PERSIST =
  'PREPARED participant evidence rows must still be persisted before decision';
const MSG_BATCH_ENTRIES =
  'RaftRsDurableStore must track batchedEntryCount across multi-entry Ready persists';
const MSG_MULTI_ENTRY =
  'RaftRsDurableStore must track multiEntryReadyCount when a single Ready persists multiple entries';
const MSG_O1_STAGING =
  'disjoint-row staged writes must validate in O(1) without O(N^2) prefix replay';
const MSG_UPDATE_ROW_KEY =
  'UPDATE with identical params[0] but disjoint WHERE id = ? (params[1]) must not collide';
const MSG_DISJOINT_PREPARE =
  'disjoint-row session txE must PREPARE cleanly after txD commits on the same partition';
const METRIC_FLAG = '--metric';
const JSON_FLAG = '--json';
const JSON_INDENT = 2;
const NEWLINE = '\n';
const PASS_LINE = 'scenario-a-deep-stack-throughput-and-latency-guard: PASS\n';
const FAIL_PREFIX = 'FAIL ';
const COLON_SPACE = ': ';

const QUIET_LOGGER = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
});

function buildPrepareEvidence(partitionId) {
  return {
    preparedDigest: stringPadEnd(`digest-${partitionId}`, DIGEST_LEN, CHAR_ZERO),
    prepareIndex: ONE,
    prepareTerm: ONE,
  };
}

async function checkWorkstream1LockingReadPkAndParams() {
  clearAllReservations();
  let fallbackSelectCalls = ZERO;
  const mockEngine = {
    getTableInfo(tableName) {
      if (tableName === 'stock') {
        return {
          table_name: 'stock',
          primary_key: 'warehouse_id,item_id',
          schema_json: JSON.stringify({
            primaryKey: ['warehouse_id', 'item_id'],
          }),
        };
      }
      if (tableName === 'new_order') {
        return {
          table_name: 'new_order',
          primary_key: 'warehouse_id,district_id,order_id',
          schema_json: JSON.stringify({
            primaryKey: ['warehouse_id', 'district_id', 'order_id'],
          }),
        };
      }
      return null;
    },
    getTablePartitions(tableName) {
      return [{partition_id: `${tableName}-p1`}];
    },
    queryExecutor: {
      async executeSelect() {
        fallbackSelectCalls += ONE;
        return {success: true, rows: []};
      },
    },
  };

  const stockAst = {
    type: 'SELECT',
    locking: {strength: 'UPDATE'},
    columns: [{type: 'column_ref', column: 'quantity'}],
    from: {type: 'table', name: 'stock'},
    where: {
      type: 'binary',
      operator: 'AND',
      left: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'warehouse_id'},
        right: {type: 'parameter', index: ZERO},
      },
      right: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'item_id'},
        right: {type: 'parameter', index: ONE},
      },
    },
  };

  const txId1 = stringRepeat(CHAR_A, TX_ID_LEN);
  const stockOutcome = await executeLockingReadReservations({
    engine: mockEngine,
    ast: stockAst,
    params: [ONE, TEN],
    sessionId: 'sess-lock-1',
    transactionRead: {identity: {transactionId: txId1}},
    selectResult: {
      success: true,
      rows: [{quantity: 50}],
      partitions: ['stock-p1'],
    },
  });
  assert.equal(stockOutcome.success, true);
  assert.equal(
    fallbackSelectCalls,
    ZERO,
    MSG_STOCK_PK,
  );
  assert.equal(getTransactionReservations(txId1).length, ONE);

  const newOrderAst = {
    type: 'SELECT',
    locking: {strength: 'UPDATE'},
    columns: [{type: 'column_ref', column: 'order_id'}],
    from: {type: 'table', name: 'new_order'},
    where: {
      type: 'binary',
      operator: 'AND',
      left: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'warehouse_id'},
        right: {type: 'parameter', index: ZERO},
      },
      right: {
        type: 'binary',
        operator: '=',
        left: {type: 'column_ref', column: 'district_id'},
        right: {type: 'parameter', index: ONE},
      },
    },
  };
  const txId2 = stringRepeat(CHAR_B, TX_ID_LEN);
  const newOrderOutcome = await executeLockingReadReservations({
    engine: mockEngine,
    ast: newOrderAst,
    params: [ONE, TWO],
    sessionId: 'sess-lock-2',
    transactionRead: {identity: {transactionId: txId2}},
    selectResult: {
      success: true,
      rows: [{order_id: 3001}],
      partitions: ['new_order-p1'],
    },
  });
  assert.equal(newOrderOutcome.success, true);
  assert.equal(
    fallbackSelectCalls,
    ZERO,
    MSG_NEW_ORDER_PK,
  );
  assert.equal(getTransactionReservations(txId2).length, ONE);
  clearAllReservations();
}

async function checkWorkstream2CoordinatorConsensusReduction() {
  const gateway = createTransactionPersistenceGateway();
  try {
    const engine = new SQLQueryEngine({
      logger: QUIET_LOGGER,
      controlPlaneSystemTableGateway: gateway,
      autoStartDistributedTransactionRecovery: false,
    });
    try {
      const coordinator = engine.transactionCoordinator;
      coordinator.beginParticipant = async () => {};
      coordinator.prepareParticipant = async (_s, partitionId) =>
        buildPrepareEvidence(partitionId);
      coordinator.commitParticipant = async () => {};

      const begun = await coordinator.begin(SESSION_WS2);
      assert.equal(begun.success, true);

      await coordinator.enlistParticipants(SESSION_WS2, [PART_P1, PART_P2]);
      const beforeRepeatEnlist = gateway.mutations.length;
      await coordinator.enlistParticipants(SESSION_WS2, [PART_P1]);
      await coordinator.enlistParticipants(SESSION_WS2, [PART_P2]);
      const repeatEnlistMutations = gateway.mutations.slice(beforeRepeatEnlist);
      assert.equal(
        repeatEnlistMutations.length,
        ZERO,
        MSG_SKIP_RETAIN,
      );

      const beforeCommit = gateway.mutations.length;
      const committed = await coordinator.commit(SESSION_WS2);
      assert.equal(committed.success, true);
      const commitMutations = gateway.mutations.slice(beforeCommit);
      const transientParticipantWrites = arrayFilter(
        commitMutations,
        (m) =>
          m.tableName === 'sql_transaction_participants' &&
          (m.row?.status === 'PREPARING' ||
            m.row?.status === 'COMMITTING' ||
            m.row?.status === 'ROLLING_BACK'),
      );
      assert.equal(
        transientParticipantWrites.length,
        ZERO,
        MSG_SKIP_TRANSIENT,
      );
      const preparedParticipantWrites = arrayFilter(
        commitMutations,
        (m) =>
          m.tableName === 'sql_transaction_participants' &&
          m.row?.status === 'PREPARED',
      );
      assert.equal(
        preparedParticipantWrites.length,
        TWO,
        MSG_PREPARED_PERSIST,
      );
    } finally {
      await engine.shutdown();
    }
  } finally {
    gateway.db.close();
  }
}

function checkWorkstream3RaftBatchSyncTelemetry() {
  const db = new Database(':memory:');
  const store = new RaftRsDurableStore(db);
  try {
    store.persistReady(GROUP_BATCH, {
      entries: [
        {index: STR_ONE, term: STR_ONE, entryType: ZERO, data: null},
        {index: STR_TWO, term: STR_ONE, entryType: ZERO, data: null},
        {index: STR_THREE, term: STR_ONE, entryType: ZERO, data: null},
      ],
      mustSync: true,
    });
    const stats = store.getDurableSyncStats();
    assert.equal(stats.syncCommitCount, ONE);
    assert.equal(
      stats.batchedEntryCount >= THREE,
      true,
      MSG_BATCH_ENTRIES,
    );
    assert.equal(
      stats.multiEntryReadyCount >= ONE,
      true,
      MSG_MULTI_ENTRY,
    );
  } finally {
    store.close();
  }
}

async function checkWorkstreams4And5RowKeyPrepareAndDisjointStaging() {
  resetFixtureSingletons();
  try {
    await onFixtureLeader(async (leader) => {
      leader.concurrencyGranularity = GRANULARITY_ROW_KEY;
      leader.controllablePort.setProposeHandler(async (entry) => {
        leader.controllablePort.commit(entry);
      });
      const seedTx = identityOf(stringRepeat(CHAR_C, TX_ID_LEN), {
        sessionId: 'sess-seed',
      });
      assert.equal((await send(leader, beginMessage(seedTx))).success, true);
      for (let idx = ONE; idx <= FIVE; idx += ONE) {
        const res = await send(
          leader,
          queryMessage(seedTx, INSERT_SQL, [`rk-${idx}`, `v-${idx}`]),
        );
        assert.equal(res.success, true);
      }
      const replayStats = leader.getStagingReplayStats();
      assert.equal(
        replayStats.disjointDirectValidations >= FOUR,
        true,
        MSG_O1_STAGING,
      );
      const seedPrep = await send(leader, prepareMessage(seedTx));
      assert.equal(seedPrep.success, true);
      assert.equal(
        (await send(leader, commitMessage(seedTx, seedPrep.preparedDigest))).success,
        true,
      );

      // Now test two concurrent UPDATE transactions on disjoint row keys where
      // params[0] is identical ('updated-val') and the PK is in WHERE id = ? (params[1]).
      const txD = identityOf(stringRepeat(CHAR_D, TX_ID_LEN), {
        sessionId: 'sess-d',
      });
      const txE = identityOf(stringRepeat(CHAR_E, TX_ID_LEN), {
        sessionId: 'sess-e',
      });
      assert.equal((await send(leader, beginMessage(txD))).success, true);
      assert.equal((await send(leader, beginMessage(txE))).success, true);

      const updateSql = `UPDATE ${TABLE} SET value = ? WHERE id = ?`;
      const stageD = await send(
        leader,
        queryMessage(txD, updateSql, ['same-val', 'rk-1']),
      );
      assert.equal(stageD.success, true);

      const stageE = await send(
        leader,
        queryMessage(txE, updateSql, ['same-val', 'rk-2']),
      );
      assert.equal(
        stageE.success,
        true,
        MSG_UPDATE_ROW_KEY,
      );

      // Commit txD first, then verify txE (disjoint row key) can still PREPARE and COMMIT!
      const prepD = await send(leader, prepareMessage(txD));
      assert.equal(prepD.success, true);
      assert.equal(
        (await send(leader, commitMessage(txD, prepD.preparedDigest))).success,
        true,
      );

      const prepE = await send(leader, prepareMessage(txE));
      assert.equal(
        prepE.success,
        true,
        MSG_DISJOINT_PREPARE,
      );
      assert.equal(
        (await send(leader, commitMessage(txE, prepE.preparedDigest))).success,
        true,
      );

      await verifyRollbackCleanupAndConflictReplay(leader, updateSql);
    });
  } finally {
    clearFixtureSingletons();
  }
}

async function verifyRollbackCleanupAndConflictReplay(leader, updateSql) {
  // 1. Prepared participant rollback cleans up PREPARED_PARTICIPANT_ROW_KEYS
  // so subsequent transactions on rk-1 can still advance generationBase across disjoint commits.
  const txRb = identityOf(stringRepeat(CHAR_F, TX_ID_LEN), {sessionId: SESSION_F});
  assert.equal((await send(leader, beginMessage(txRb))).success, true);
  assert.equal((await send(leader, queryMessage(txRb, updateSql, [VAL_RB, RK_ONE]))).success, true);
  const prepRb = await send(leader, prepareMessage(txRb));
  assert.equal(prepRb.success, true);
  const rbDecision = txMessage(
    PARTITION_SERVICE_OPERATION.ROLLBACK,
    txRb,
    bindingOf(txRb, V3.DECISION.ROLLBACK, prepRb.preparedDigest),
  );
  assert.equal((await send(leader, rbDecision)).success, true);

  const txAfterRb1 = identityOf(stringRepeat(CHAR_ONE, TX_ID_LEN), {sessionId: SESSION_G});
  const txAfterRb2 = identityOf(stringRepeat(CHAR_TWO, TX_ID_LEN), {sessionId: SESSION_H});
  assert.equal((await send(leader, beginMessage(txAfterRb1))).success, true);
  assert.equal((await send(leader, beginMessage(txAfterRb2))).success, true);
  assert.equal(
    (await send(leader, queryMessage(txAfterRb1, updateSql, [VAL_AFTER_RB_2, RK_TWO]))).success,
    true,
  );
  assert.equal(
    (await send(leader, queryMessage(txAfterRb2, updateSql, [VAL_AFTER_RB, RK_ONE]))).success,
    true,
  );
  const prepAfter1 = await send(leader, prepareMessage(txAfterRb1));
  assert.equal(prepAfter1.success, true);
  assert.equal(
    (await send(leader, commitMessage(txAfterRb1, prepAfter1.preparedDigest))).success,
    true,
  );
  const prepAfter2 = await send(leader, prepareMessage(txAfterRb2));
  assert.equal(prepAfter2.success, true);
  assert.equal(
    (await send(leader, commitMessage(txAfterRb2, prepAfter2.preparedDigest))).success,
    true,
  );

  // 2. Overlapping row-key conflict refusal and same-row / SELECT replay (Constraint 3)
  const txC1 = identityOf(stringRepeat(CHAR_THREE, TX_ID_LEN), {sessionId: SESSION_I});
  const txC2 = identityOf(stringRepeat(CHAR_FOUR, TX_ID_LEN), {sessionId: SESSION_J});
  assert.equal((await send(leader, beginMessage(txC1))).success, true);
  assert.equal((await send(leader, beginMessage(txC2))).success, true);
  assert.equal(
    (await send(leader, queryMessage(txC1, updateSql, [VAL_C1, RK_ONE]))).success,
    true,
  );
  const conflictStage = await send(leader, queryMessage(txC2, updateSql, [VAL_C2, RK_ONE]));
  assert.equal(conflictStage.success, false);
  await send(leader, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, txC2));

  const statsBeforeSameRow = leader.getStagingReplayStats();
  assert.equal(
    (await send(leader, queryMessage(txC1, updateSql, [VAL_C1_SECOND, RK_ONE]))).success,
    true,
  );
  const selectSql = `SELECT value FROM ${TABLE} WHERE id = ?`;
  const selectRes = await send(leader, queryMessage(txC1, selectSql, [RK_ONE]));
  assert.equal(selectRes.success, true);
  assert.equal(selectRes.rows?.[ZERO]?.value, VAL_C1_SECOND);
  const statsAfterSameRow = leader.getStagingReplayStats();
  assert.equal(
    statsAfterSameRow.disjointDirectValidations,
    statsBeforeSameRow.disjointDirectValidations,
  );
  assert.equal(
    statsAfterSameRow.fastReplayedOperations >= statsBeforeSameRow.fastReplayedOperations + THREE,
    true,
  );
  const prepC1 = await send(leader, prepareMessage(txC1));
  assert.equal(prepC1.success, true);
  assert.equal((await send(leader, commitMessage(txC1, prepC1.preparedDigest))).success, true);
}

async function runAllChecks() {
  const checks = [
    ['workstream-1-locking-read-pk-and-params', checkWorkstream1LockingReadPkAndParams],
    ['workstream-2-coordinator-consensus-reduction', checkWorkstream2CoordinatorConsensusReduction],
    ['workstream-3-raft-batch-sync-telemetry', checkWorkstream3RaftBatchSyncTelemetry],
    ['workstreams-4-and-5-row-key-prepare-and-disjoint-staging', checkWorkstreams4And5RowKeyPrepareAndDisjointStaging],
  ];
  const failedChecks = [];
  for (const [name, fn] of checks) {
    try {
      await fn();
    } catch (error) {
      failedChecks.push({name, error: error?.message || String(error)});
    }
  }
  return {
    failures: failedChecks,
    metric: failedChecks.length,
  };
}

const args = process.argv.slice(ARGV_OFFSET);
const isMetric = arrayIncludes(args, METRIC_FLAG);
const isJson = arrayIncludes(args, JSON_FLAG);

const outcome = await runAllChecks();
if (isMetric) {
  process.stdout.write(`${outcome.metric}${NEWLINE}`);
  process.exit(outcome.metric === ZERO ? ZERO : ONE);
}
if (isJson) {
  process.stdout.write(
    `${JSON.stringify(outcome, null, JSON_INDENT)}${NEWLINE}`,
  );
  process.exit(outcome.metric === ZERO ? ZERO : ONE);
}
if (outcome.metric !== ZERO) {
  for (const failure of outcome.failures) {
    process.stderr.write(
      `${FAIL_PREFIX}${failure.name}${COLON_SPACE}${failure.error}${NEWLINE}`,
    );
  }
  process.exit(ONE);
}
process.stdout.write(PASS_LINE);
