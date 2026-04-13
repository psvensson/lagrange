// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const TEST_TABLE_NAME = 'tx_table';
const CDC_INSERT_OPERATION = 'INSERT';
const rowIdArb = fc.stringMatching(/^[a-z][a-z0-9]{2,11}$/);
const valueArb = fc.stringMatching(/^[a-z]{1,8}$/);

function createTransactionPartition() {
  return new PartitionService({
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
  });
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
// Property 12: Prepare replicates through Raft before returning
// Validates: Requirements 1.3, 8.1
// ---------------------------------------------------------------------------
test(
  'Property 12: successful prepare records durable raft log index in prepared state',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        rowIdArb,
        valueArb,
        async (rowId, value) => {
          const partition = createTransactionPartition();
          await partition.initialize();

          try {
            const sessionId = 'prepare-durable';
            await partition.beginTransaction(sessionId, 500);
            await partition.executeQuery(
              `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES ('${rowId}', '${value}')`,
              [],
              {sessionId},
            );

            const prepareResult = await partition.prepareTransaction(sessionId);
            if (!prepareResult.success ||
              prepareResult.operation !== PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION) {
              return false;
            }

            const preparedState = partition.preparedTransactions.get(sessionId);
            if (!preparedState) {
              return false;
            }

            return Number.isInteger(preparedState.raftLogIndex) &&
              preparedState.raftLogIndex === prepareResult.raftLogIndex;
          } finally {
            await partition.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('prepare durability metadata is persisted before success response');
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

// ---------------------------------------------------------------------------
// Property 13: Prepared state reconstruction after leader election
// Validates: Requirements 8.2, 8.3, 8.4
// ---------------------------------------------------------------------------
test(
  'Property 13: reconstructed prepared state allows commit/rollback after simulated leader change',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        rowIdArb,
        valueArb,
        fc.boolean(),
        async (rowId, value, shouldCommit) => {
          const partition = createTransactionPartition();
          await partition.initialize();
          const sessionId = 'reconstruct-prepared';

          try {
            await partition.beginTransaction(sessionId, 1_100);
            await partition.executeQuery(
              `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES ('${rowId}', '${value}')`,
              [],
              {sessionId},
            );
            const prepareResult = await partition.prepareTransaction(sessionId);
            if (!prepareResult.success) {
              return false;
            }

            partition.preparedTransactions.clear();
            partition.syncLegacyTransactionAliases();
            const reconstruction = partition.reconstructPreparedState();
            if (reconstruction.preparedTransactionCount < 1) {
              return false;
            }

            if (shouldCommit) {
              const commitResult = await partition.commitTransaction(sessionId);
              if (!commitResult.success || !commitResult.committed) {
                return false;
              }
              const committedRows = await partition.executeQuery(
                `SELECT id FROM ${TEST_TABLE_NAME} WHERE id = '${rowId}'`,
                [],
              );
              return committedRows.rows.length === 1;
            }

            const rollbackResult = await partition.rollbackTransaction(sessionId);
            if (!rollbackResult.success || !rollbackResult.rolledBack) {
              return false;
            }
            const rolledBackRows = await partition.executeQuery(
              `SELECT id FROM ${TEST_TABLE_NAME} WHERE id = '${rowId}'`,
              [],
            );
            return rolledBackRows.rows.length === 0;
          } finally {
            await partition.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('prepared state reconstruction preserves commit/rollback behavior');
  },
);

// ---------------------------------------------------------------------------
// Property 15: Participant prepared-state hold timeout
// Validates: Requirements 9.3
// ---------------------------------------------------------------------------
test(
  'Property 15: prepared-state hold timeout releases prepared state autonomously',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        rowIdArb,
        valueArb,
        async (rowId, value) => {
          const holdTimeoutMs = 5;
          const partition = new PartitionService({
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
            preparedStateHoldTimeoutMs: holdTimeoutMs,
          });
          await partition.initialize();

          try {
            const sessionId = 'prepared-timeout';
            await partition.beginTransaction(sessionId, 1_200);
            await partition.executeQuery(
              `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES ('${rowId}', '${value}')`,
              [],
              {sessionId},
            );
            const prepareResult = await partition.prepareTransaction(sessionId);
            if (!prepareResult.success) {
              return false;
            }
            const preparedState = partition.preparedTransactions.get(sessionId);
            if (!preparedState) {
              return false;
            }

            const releasedCount = partition.enforcePreparedStateHoldTimeouts(
              preparedState.preparedAt + holdTimeoutMs + 1,
            );
            if (releasedCount !== 1) {
              return false;
            }
            if (partition.preparedTransactions.has(sessionId)) {
              return false;
            }

            const commitAfterTimeout = await partition.commitTransaction(sessionId);
            if (commitAfterTimeout.success !== false ||
              commitAfterTimeout.error !== PARTITION_SERVICE_ERROR_MSG.PREPARE_LOST) {
              return false;
            }

            const rows = await partition.executeQuery(
              `SELECT id FROM ${TEST_TABLE_NAME} WHERE id = '${rowId}'`,
              [],
            );
            return rows.rows.length === 0;
          } finally {
            await partition.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('prepared hold timeout releases state and subsequent commit returns PREPARE_LOST');
  },
);
