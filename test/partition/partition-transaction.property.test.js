import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {PARTICIPANT_COMMIT_OUTCOME} from '../../src/constants/transactions.js';
import {enableParticipantTransactionAdmission} from
  '../../src/partition/partition-participant-transaction-request.js';
import {
  PARTICIPANT_TRANSACTION_COMMAND,
  PARTICIPANT_TRANSACTION_STATE,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {
  restartOverCommittedCommands,
} from './partition-rs-raft-restart-fixture.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {
  beginMessage,
  commitMessage,
  identityOf,
  pick,
  prepareCommandOf,
  prepareMessage,
  queryMessage,
  send,
  txMessage,
} from '../test-helpers/participant-transaction-fixture.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const TEST_TABLE_NAME = 'tx_table';
const CDC_INSERT_OPERATION = 'INSERT';
const rowIdArb = fc.stringMatching(/^[a-z][a-z0-9]{2,11}$/);
const valueArb = fc.stringMatching(/^[a-z]{1,8}$/);

function createTransactionPartition(selection = {}) {
  return new PartitionService(withFoundingStamp({
    partitionId: `tx-partition-${Date.now()}-${Math.random()}`,
    tableId: TEST_TABLE_NAME,
    tableName: TEST_TABLE_NAME,
    replicaId: 'tx-partition-r1',
    replicaIds: ['tx-partition-r1'],
    schema: {
      columns: [
        {name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'value', type: 'TEXT'},
      ],
    },
    dbPath: ':memory:',
    ...selection,
  }));
}

// ---------------------------------------------------------------------------
// Property 11: Write set tracking and cleanup
// Validates: Requirements 6.3, 6.4, 6.5
// ---------------------------------------------------------------------------
test(
  'Property 11: transaction write set tracks modified keys and is released at terminal state',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(rowIdArb, {minLength: 1, maxLength: 5}),
        fc.boolean(),
        async (rowIds, shouldCommit) => {
          const partition = createTransactionPartition();
          await partition.initialize();

          const sessionId = 'session-write-set';
          const transactionEpoch = 100;

          try {
            const beginResult = await partition.beginTransaction(sessionId, transactionEpoch);
            if (!beginResult.success) {
              return false;
            }

            for (const rowId of rowIds) {
              await partition.executeQuery(
                `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES ('${rowId}', 'value')`,
                [],
                {sessionId},
              );
            }

            const activeState = partition.activeTransactions.get(sessionId);
            if (!activeState) {
              return false;
            }
            const expectedWriteSet = new Set(
              rowIds.map((rowId) => `${TEST_TABLE_NAME}:${rowId}`),
            );
            if (activeState.writeSet.size !== expectedWriteSet.size) {
              return false;
            }
            for (const writeSetKey of expectedWriteSet) {
              if (!activeState.writeSet.has(writeSetKey)) {
                return false;
              }
            }

            if (shouldCommit) {
              const commitResult = await partition.commitTransaction(sessionId);
              if (!commitResult.success) {
                return false;
              }
            } else {
              const rollbackResult = await partition.rollbackTransaction(sessionId);
              if (!rollbackResult.success) {
                return false;
              }
            }

            return !partition.activeTransactions.has(sessionId);
          } finally {
            await partition.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('write set tracking and cleanup hold across transaction terminal states');
  },
);

// ---------------------------------------------------------------------------
// Property 1: Prepare reflects conflict status
// Validates: Requirements 1.1, 1.2, 6.1
// ---------------------------------------------------------------------------
test(
  'Property 1: prepare succeeds iff no higher-epoch committed write conflicts exist',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        rowIdArb,
        rowIdArb,
        valueArb,
        async (firstRowId, secondRowId, value) => {
          const partition = createTransactionPartition();
          await partition.initialize();
          const conflictRowId = firstRowId;
          const nonConflictRowId = firstRowId === secondRowId ?
            `${secondRowId}x` :
            secondRowId;

          try {
            await partition.beginTransaction('higher-epoch', 200);
            await partition.executeQuery(
              `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES ('${conflictRowId}', '${value}')`,
              [],
              {sessionId: 'higher-epoch'},
            );
            await partition.commitTransaction('higher-epoch');

            await partition.beginTransaction('older-conflict', 100);
            await partition.executeQuery(
              `UPDATE ${TEST_TABLE_NAME} SET value = '${value}2' WHERE id = '${conflictRowId}'`,
              [],
              {sessionId: 'older-conflict'},
            );
            const conflictPrepare = await partition.prepareTransaction('older-conflict');
            if (conflictPrepare.success !== false) {
              return false;
            }
            if (conflictPrepare.error !== PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT) {
              return false;
            }
            await partition.rollbackTransaction('older-conflict');

            await partition.beginTransaction('older-no-conflict', 100);
            await partition.executeQuery(
              `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES (` +
              `'${nonConflictRowId}', '${value}3')`,
              [],
              {sessionId: 'older-no-conflict'},
            );
            const noConflictPrepare = await partition.prepareTransaction('older-no-conflict');
            if (noConflictPrepare.success !== true) {
              return false;
            }
            await partition.rollbackTransaction('older-no-conflict');

            return true;
          } finally {
            await partition.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('prepare conflict outcomes match committed-write conflict status');
  },
);

// ---------------------------------------------------------------------------
// Property 12: PREPARE is a committed command, acknowledged after it applies
// Superseded by TX1 design revision 10, section 9.2 (quest
// replicated-transaction-decision-and-apply): a participant session stages
// under F6 c' and never holds a SQLite transaction; PREPARE proposes its
// PARTICIPANT_PREPARE and is acknowledged only after that command applied
// (W1a), the staged row stays invisible while PREPARED, and the bound COMMIT
// decision applies it. Every observation is read on an independent
// connection through the rs-raft store's DDL-free committed-entry reader.
// Validates: Requirements 1.3, 8.1
// ---------------------------------------------------------------------------
function readIndependently(dbPath, read) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return read(independent);
  } finally {
    independent.close();
  }
}

function participantCommandTypes(dbPath, partitionId, participantId) {
  return readIndependently(dbPath, (independent) =>
    RaftRsDurableStore.readCommittedEntriesIn(independent, partitionId)
      .filter((entry) => entry.command?.participantId === participantId)
      .map((entry) => entry.command.type));
}

function visibleRowIds(dbPath, rowId) {
  return readIndependently(dbPath, (independent) => independent
    .prepare(`SELECT id FROM ${TEST_TABLE_NAME} WHERE id = ?`)
    .all(rowId).map((row) => row.id));
}

// A participant transaction on `partition` (its admission enabled), with one
// staged row.
async function stagedParticipant(partition, transactionId, row) {
  const enabled = await enableParticipantTransactionAdmission(partition);
  assert.equal(enabled.success, true, JSON.stringify(enabled));
  const tx = identityOf(transactionId, {partitionId: partition.partitionId,
    sessionId: transactionId});
  await send(partition, beginMessage(tx));
  const staged = await send(partition, queryMessage(tx,
    `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES (?, ?)`, [row.id, row.value]));
  return {tx, staged};
}

test(
  'Property 12: PREPARE is acknowledged only after its committed ' +
  'PARTICIPANT_PREPARE applies, and the bound COMMIT applies the staged row',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        rowIdArb,
        valueArb,
        async (rowId, value) => {
          const directory = fs.mkdtempSync(
            path.join(os.tmpdir(), 'tx-partition-prepare-'));
          const dbPath = path.join(directory, 'partition.sqlite');
          const partition = createTransactionPartition({dbPath});
          await partition.initialize();

          try {
            const {tx, staged} = await stagedParticipant(partition, `p12-${rowId}`,
              {id: rowId, value});
            const prepared = await send(partition, prepareMessage(tx));
            const atPrepare = {
              commands: participantCommandTypes(dbPath, partition.partitionId,
                tx.participantId),
              rows: visibleRowIds(dbPath, rowId),
              connectionHeld: partition.db.inTransaction,
            };
            const committed = await send(partition,
              commitMessage(tx, prepared?.preparedDigest));
            assert.deepEqual({
              staged: staged?.provisional === true,
              prepared: pick(prepared, ['success', 'state']),
              atPrepare,
              committed: pick(committed, ['success', 'state']),
              afterCommit: {
                commands: participantCommandTypes(dbPath, partition.partitionId,
                  tx.participantId),
                rows: visibleRowIds(dbPath, rowId),
              },
            }, {
              staged: true,
              prepared: {success: true, state: PARTICIPANT_TRANSACTION_STATE.PREPARED},
              atPrepare: {commands: [PARTICIPANT_TRANSACTION_COMMAND.PREPARE], rows: [],
                connectionHeld: false},
              committed: {success: true, state: PARTICIPANT_TRANSACTION_STATE.COMMITTED},
              afterCommit: {commands: [PARTICIPANT_TRANSACTION_COMMAND.PREPARE,
                PARTICIPANT_TRANSACTION_COMMAND.DECISION], rows: [rowId]},
            }, 'no row is visible before the decision; each step is a committed ' +
              'command, acknowledged after it applied');
            return true;
          } finally {
            await partition.shutdown();
            fs.rmSync(directory, {recursive: true, force: true});
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('PREPARE and COMMIT are committed participant commands');
  },
);


// ---------------------------------------------------------------------------
// Property 10: Snapshot read visibility
// Validates: Requirements 5.2, 5.3, 7.3
// ---------------------------------------------------------------------------
test(
  'Property 10: snapshot reads include commits before epoch and own writes only',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(rowIdArb, {minLength: 3, maxLength: 3}),
        valueArb,
        async ([olderRowId, newerRowId, ownRowId], value) => {
          const partition = createTransactionPartition();
          await partition.initialize();

          try {
            await partition.beginTransaction('older-writer', 100);
            await partition.executeQuery(
              `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES ('${olderRowId}', '${value}')`,
              [],
              {sessionId: 'older-writer'},
            );
            await partition.commitTransaction('older-writer');

            await partition.beginTransaction('newer-writer', 300);
            await partition.executeQuery(
              `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES ('${newerRowId}', '${value}n')`,
              [],
              {sessionId: 'newer-writer'},
            );
            await partition.commitTransaction('newer-writer');

            await partition.beginTransaction('snapshot-reader', 200);
            await partition.executeQuery(
              `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES ('${ownRowId}', '${value}o')`,
              [],
              {sessionId: 'snapshot-reader'},
            );

            const snapshotRead = await partition.executeQuery(
              `SELECT id, value FROM ${TEST_TABLE_NAME} ORDER BY id`,
              [],
              {sessionId: 'snapshot-reader'},
            );

            if (!snapshotRead.success) {
              return false;
            }
            const observedIds = new Set(snapshotRead.rows.map((row) => row.id));
            if (!observedIds.has(olderRowId)) {
              return false;
            }
            if (!observedIds.has(ownRowId)) {
              return false;
            }
            if (observedIds.has(newerRowId)) {
              return false;
            }

            await partition.rollbackTransaction('snapshot-reader');
            return true;
          } finally {
            await partition.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('snapshot read visibility matches epoch and read-your-own-writes rules');
  },
);

// ---------------------------------------------------------------------------
// Property 5: Commit applies write set and generates CDC events
// Validates: Requirements 2.2, 2.4
// ---------------------------------------------------------------------------
test(
  'Property 5: prepared commit applies transactional writes and emits CDC for each write',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(rowIdArb, {minLength: 1, maxLength: 3}),
        valueArb,
        async (rowIds, value) => {
          const partition = createTransactionPartition();
          await partition.initialize();
          const sessionId = 'commit-cdc';
          const cdcEvents = [];

          try {
            await partition.beginTransaction(sessionId, 700);
            for (const rowId of rowIds) {
              await partition.executeQuery(
                `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES ('${rowId}', '${value}')`,
                [],
                {sessionId},
              );
            }

            const prepareResult = await partition.prepareTransaction(sessionId);
            if (!prepareResult.success) {
              return false;
            }

            partition.subscribeToCDC((event) => {
              cdcEvents.push(event);
            });

            const commitResult = await partition.commitTransaction(sessionId);
            if (!commitResult.success || !commitResult.committed) {
              return false;
            }

            const visibleRows = await partition.executeQuery(
              `SELECT id FROM ${TEST_TABLE_NAME}`,
              [],
            );
            const visibleIds = new Set(visibleRows.rows.map((row) => row.id));
            for (const rowId of rowIds) {
              if (!visibleIds.has(rowId)) {
                return false;
              }
            }

            const insertEvents = cdcEvents.filter((event) =>
              event.tableName === TEST_TABLE_NAME &&
              event.operation === CDC_INSERT_OPERATION,
            );
            return insertEvents.length >= rowIds.length;
          } finally {
            await partition.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('prepared commit durably applies writes and emits CDC events');
  },
);

// ---------------------------------------------------------------------------
// Property 6: Rollback discards write set and releases locks
// Validates: Requirements 3.2, 3.5
// ---------------------------------------------------------------------------
test(
  'Property 6: rollback clears active/prepared state and is idempotent for missing sessions',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        rowIdArb,
        valueArb,
        async (rowId, value) => {
          const partition = createTransactionPartition();
          await partition.initialize();

          try {
            await partition.beginTransaction('active-rollback', 800);
            await partition.executeQuery(
              `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES ('${rowId}', '${value}')`,
              [],
              {sessionId: 'active-rollback'},
            );
            const activeRollback = await partition.rollbackTransaction('active-rollback');
            if (!activeRollback.success || !activeRollback.rolledBack) {
              return false;
            }
            if (partition.activeTransactions.has('active-rollback')) {
              return false;
            }

            await partition.beginTransaction('prepared-rollback', 900);
            await partition.executeQuery(
              `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES ('${rowId}x', '${value}')`,
              [],
              {sessionId: 'prepared-rollback'},
            );
            const prepared = await partition.prepareTransaction('prepared-rollback');
            if (!prepared.success) {
              return false;
            }
            const preparedRollback = await partition.rollbackTransaction('prepared-rollback');
            if (!preparedRollback.success || !preparedRollback.rolledBack) {
              return false;
            }
            if (partition.preparedTransactions.has('prepared-rollback')) {
              return false;
            }

            const idempotentRollback = await partition.rollbackTransaction('missing-session');
            return idempotentRollback.success === true &&
              idempotentRollback.idempotent === true;
          } finally {
            await partition.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('rollback is correct for active/prepared states and idempotent when missing');
  },
);

// Property 13 (leader change) returns with F6 layer 2 (replicated interactive transactions): layer 1 proposes no PREPARE marker to rebuild from.
// ---------------------------------------------------------------------------
// Property 13 across a restart: the PREPARED row is read, nothing is
// reconstructed
// Superseded by TX1 design revision 10, section 9.2 (W12c): a committed
// PARTICIPANT_PREPARE leaves a durable PREPARED row in
// _participant_transactions, written with the applied index; after a restart
// that row, not a scan of the log, answers PREPARED with its digest and log
// index, and the legacy reconstruction finds no prepared session.
// Validates: Requirements 8.2, 8.3, 8.4
// ---------------------------------------------------------------------------
test(
  'Property 13 (restart): a PREPARED participant row survives a restart and ' +
  'is read, not reconstructed',
  async (t) => {
    const partitionId = `tx-partition-restart-${Date.now()}`;
    const tx = identityOf('p13-restart', {partitionId, sessionId: 'restart-prepared'});
    const prepare = prepareCommandOf(tx, [{entryId: 'p13-op',
      sql: `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES (?, ?)`,
      params: ['prepared-row', 'v']}], 0, partitionId);
    const {restarted, committed, dispose} = await restartOverCommittedCommands({
      partitionId,
      tableId: TEST_TABLE_NAME,
      tableName: TEST_TABLE_NAME,
      schema: {
        columns: [
          {name: 'id', type: 'TEXT', primaryKey: true},
          {name: 'value', type: 'TEXT'},
        ],
      },
    }, [prepare]);
    try {
      const outcome = await send(restarted, txMessage(
        PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME, tx));
      t.strictSame({
        outcome: pick(outcome, ['outcome', 'state', 'prepareIndex', 'preparedDigest']),
        legacyPrepared: restarted.reconstructPreparedState().preparedTransactionCount,
      }, {
        outcome: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
          state: PARTICIPANT_TRANSACTION_STATE.PREPARED,
          prepareIndex: committed[0].index, preparedDigest: prepare.preparedDigest},
        legacyPrepared: 0,
      }, 'the durable row is the prepared authority after a restart');
    } finally {
      await dispose();
    }
  },
);

// ---------------------------------------------------------------------------
// Property 15: a PREPARED participant row is never released by time
// Superseded by TX1 design revision 10, section 9.2 (W12d): the hold sweep
// reports a PREPARED row past its window and never terminates it, so the
// bound COMMIT decision applies after the window (no PREPARE_LOST).
// Validates: Requirements 9.3
// ---------------------------------------------------------------------------
test(
  'Property 15: the hold sweep never releases a PREPARED participant row; ' +
  'its bound COMMIT applies after the hold window',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        rowIdArb,
        valueArb,
        async (rowId, value) => {
          const holdTimeoutMs = 5;
          const partition = createTransactionPartition({
            preparedStateHoldTimeoutMs: holdTimeoutMs});
          await partition.initialize();

          try {
            const {tx} = await stagedParticipant(partition, `p15-${rowId}`,
              {id: rowId, value});
            const prepared = await send(partition, prepareMessage(tx));
            const nowMs = Date.now();
            const released = [partition.enforcePreparedStateHoldTimeouts(nowMs),
              partition.enforcePreparedStateHoldTimeouts(nowMs + holdTimeoutMs + 1)];
            const held = await send(partition, txMessage(
              PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME, tx));
            const committed = await send(partition,
              commitMessage(tx, prepared?.preparedDigest));
            const rows = await partition.executeQuery(
              `SELECT id FROM ${TEST_TABLE_NAME} WHERE id = ?`, [rowId]);
            return prepared?.state === PARTICIPANT_TRANSACTION_STATE.PREPARED &&
              released.every((count) => count === 0) &&
              held?.state === PARTICIPANT_TRANSACTION_STATE.PREPARED &&
              committed?.state === PARTICIPANT_TRANSACTION_STATE.COMMITTED &&
              rows.rows.length === 1;
          } finally {
            await partition.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('a PREPARED row is an obligation released only by its decision');
  },
);
