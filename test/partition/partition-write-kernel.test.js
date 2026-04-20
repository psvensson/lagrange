import {test} from '../../src/test-helpers/tap.js';
import {
  PARTITION_WRITE_COMMIT_MODE,
  buildPartitionWriteEntry,
  buildPartitionWriteFailureResult,
  buildPartitionWriteSideEffectPlan,
  executePartitionWriteStatement,
  resolvePartitionWriteCommitMode,
} from '../../src/partition/partition-write-kernel.js';

const TEST_ENTRY_ID = 'entry-1';
const TEST_PROPOSED_AT = 1234;
const TEST_TIMESTAMP = '987654321';
const TEST_PARTITION_ID = 'partition-1';
const TEST_LOG_INDEX = 7;

test('partition write kernel builds canonical write entries', async (t) => {
  const entry = buildPartitionWriteEntry(
    {
      type: 'INSERT',
      sql: 'INSERT INTO test_table (id) VALUES (?)',
      params: ['r1'],
      entryId: TEST_ENTRY_ID,
    },
    {
      timestamp: TEST_TIMESTAMP,
      proposedBy: 'replica-1',
      proposedAt: TEST_PROPOSED_AT,
    },
  );

  t.equal(entry.entryId, TEST_ENTRY_ID);
  t.equal(entry.timestamp, TEST_TIMESTAMP);
  t.equal(entry.proposedBy, 'replica-1');
  t.equal(entry.proposedAt, TEST_PROPOSED_AT);
});

test('partition write kernel resolves direct, raft, and rejected commit modes',
  async (t) => {
    t.equal(
      resolvePartitionWriteCommitMode({
        replicaIds: ['r1'],
        raftState: 'leader',
        raftLeaderState: 'leader',
      }),
      PARTITION_WRITE_COMMIT_MODE.DIRECT,
      'single-replica writes should be direct',
    );
    t.equal(
      resolvePartitionWriteCommitMode({
        replicaIds: ['r1', 'r2'],
        raftState: 'leader',
        raftLeaderState: 'leader',
      }),
      PARTITION_WRITE_COMMIT_MODE.RAFT,
      'multi-replica leader writes should use raft commit mode',
    );
    t.equal(
      resolvePartitionWriteCommitMode({
        replicaIds: ['r1', 'r2'],
        raftState: 'follower',
        raftLeaderState: 'leader',
      }),
      PARTITION_WRITE_COMMIT_MODE.REJECTED,
      'multi-replica follower writes should be rejected before apply',
    );
  });

test('partition write kernel executes SQL once and shapes the canonical result',
  async (t) => {
    const runCalls = [];
    const db = {
      prepare(sql) {
        return {
          run(...params) {
            runCalls.push({sql, params});
            return {
              changes: 1,
              lastInsertRowid: 99,
            };
          },
        };
      },
    };

    const result = executePartitionWriteStatement(
      db,
      {
        sql: 'INSERT INTO test_table (id) VALUES (?)',
        params: ['r1'],
      },
      TEST_PARTITION_ID,
      TEST_LOG_INDEX,
    );

    t.same(runCalls, [{
      sql: 'INSERT INTO test_table (id) VALUES (?)',
      params: ['r1'],
    }]);
    t.same(
      result,
      {
        success: true,
        changes: 1,
        lastInsertRowid: 99,
        partitionId: TEST_PARTITION_ID,
        logIndex: TEST_LOG_INDEX,
      },
      'kernel execution should shape the canonical success result',
    );
  });

test('partition write kernel separates commit/apply from replayable side effects',
  async (t) => {
    const sideEffectPlan = buildPartitionWriteSideEffectPlan(
      {
        type: 'UPDATE',
        sql: 'UPDATE test_table SET value = ? WHERE id = ?',
        params: ['b', 'r1'],
      },
      {
        success: true,
        changes: 1,
      },
    );
    const failurePlan = buildPartitionWriteSideEffectPlan(
      {
        type: 'UPDATE',
        sql: 'UPDATE test_table SET value = ? WHERE id = ?',
        params: ['b', 'r1'],
      },
      buildPartitionWriteFailureResult(
        new Error('write failed'),
        TEST_PARTITION_ID,
      ),
    );

    t.same(
      sideEffectPlan,
      {
        emitCdcEntry: {
          type: 'UPDATE',
          sql: 'UPDATE test_table SET value = ? WHERE id = ?',
          params: ['b', 'r1'],
          changes: 1,
        },
        splitReplicationEntry: {
          type: 'UPDATE',
          sql: 'UPDATE test_table SET value = ? WHERE id = ?',
          params: ['b', 'r1'],
          changes: 1,
        },
        scheduleSizeUpdate: true,
        requestManagedSplitEvaluation: true,
      },
      'successful apply should return one explicit side-effect plan',
    );
    t.same(
      failurePlan,
      {
        emitCdcEntry: null,
        splitReplicationEntry: null,
        scheduleSizeUpdate: false,
        requestManagedSplitEvaluation: false,
      },
      'failed apply should not plan replayable side effects',
    );
  });
