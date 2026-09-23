import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';

// A committed entry reaches the application through the partition's own
// port: a lone rs-raft leader commits and applies its proposal before
// propose() returns, and an application failure is a non-OK outcome.
async function commitThroughPort(partition, command) {
  return (await partition.raft.propose(command)).outcome;
}

test('PartitionService skips replayed committed entries when entryId is stable',
  async (t) => {
    const partition = new PartitionService({
      partitionId: 'test-partition',
      tableId: 'dedupe_table',
      tableName: 'dedupe_table',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      schema: {
        columns: [
          {name: 'id', type: 'TEXT', primaryKey: true},
        ],
      },
      dbPath: ':memory:',
    });

    await partition.initialize();

    const leaderEntry = {
      entryId: 'entry-1',
      type: 'INSERT',
      sql: 'INSERT INTO dedupe_table (id) VALUES (?)',
      params: ['row-1'],
      proposedBy: 'replica-1',
      proposedAt: 1,
      timestamp: '1',
    };
    t.equal(await commitThroughPort(partition, leaderEntry),
      RAFT_OPERATION_OUTCOME.CORE_OK, 'the entry commits and applies');

    t.equal(await commitThroughPort(partition, {
      ...leaderEntry,
      proposedAt: 2,
      timestamp: '2',
    }), RAFT_OPERATION_OUTCOME.CORE_OK,
    'committed replay should be skipped instead of re-inserting');

    const rowCount = partition.db
      .prepare('SELECT COUNT(*) AS count FROM dedupe_table WHERE id = ?')
      .get('row-1')
      .count;
    t.equal(rowCount, 1, 'replayed write should not create a duplicate row');

    // The in-memory replay set is a cache in front of the durable outcome
    // record, never the authority: a key it holds without a recorded
    // outcome does not stop the statement from running.
    const cacheOnlyEntry = {...leaderEntry, entryId: 'entry-cache-only',
      params: ['row-cache-only']};
    partition.trackAppliedEntryKey(
      partition.getCommittedEntryKey(cacheOnlyEntry));
    t.equal(await commitThroughPort(partition, cacheOnlyEntry),
      RAFT_OPERATION_OUTCOME.CORE_OK, 'the cache-only key commits');
    t.equal(partition.db
      .prepare('SELECT COUNT(*) AS count FROM dedupe_table WHERE id = ?')
      .get('row-cache-only').count, 1,
    'a cached key without a recorded outcome is executed');

    await partition.shutdown();
  });

test(
  'PartitionService proposeWrite stamps stable entryId for replay dedupe',
  async (t) => {
    const partition = new PartitionService({
      partitionId: 'test-partition',
      tableId: 'dedupe_table',
      tableName: 'dedupe_table',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      schema: {
        columns: [
          {name: 'id', type: 'TEXT', primaryKey: true},
        ],
      },
      dbPath: ':memory:',
    });

    await partition.initialize();

    let capturedEntry = null;
    partition.role = 'leader';
    partition.applyWrite = async (entry) => {
      capturedEntry = {...entry};
      return {
        success: true,
        partitionId: partition.partitionId,
      };
    };

    const writeResult = await partition.proposeWrite({
      type: 'INSERT',
      sql: 'INSERT INTO dedupe_table (id) VALUES (?)',
      params: ['row-2'],
    });

    t.equal(writeResult.success, true, 'leader write should succeed');
    t.ok(capturedEntry, 'proposeWrite should build a committed entry');
    t.type(capturedEntry.entryId, 'string',
      'proposeWrite should stamp a stable entryId');

    t.equal(await commitThroughPort(partition, capturedEntry),
      RAFT_OPERATION_OUTCOME.CORE_OK, 'the captured entry commits');

    t.equal(await commitThroughPort(partition, {
      ...capturedEntry,
      proposedAt: Number(capturedEntry.proposedAt || 0) + 1,
      timestamp: String(Number(capturedEntry.timestamp || 0) + 1),
    }), RAFT_OPERATION_OUTCOME.CORE_OK,
    'replayed committed entry should dedupe even if metadata drifts');

    const rowCount = partition.db
      .prepare('SELECT COUNT(*) AS count FROM dedupe_table WHERE id = ?')
      .get('row-2')
      .count;
    t.equal(rowCount, 1, 'metadata-drift replay should not insert twice');

    await partition.shutdown();
  },
);

test(
  'PartitionService consumes a duplicate-key INSERT with no applied instance of its entry identity as a failed statement, not a replay',
  async (t) => {
    const partition = new PartitionService({
      partitionId: 'test-partition',
      tableId: 'dedupe_table',
      tableName: 'dedupe_table',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      schema: {
        columns: [
          {name: 'id', type: 'TEXT', primaryKey: true},
        ],
      },
      dbPath: ':memory:',
    });

    await partition.initialize();

    partition.db.prepare('INSERT INTO dedupe_table (id) VALUES (?)').run('row-3');

    const replayedEntry = {
      entryId: 'entry-replay-after-restart',
      type: 'INSERT',
      sql: 'INSERT INTO dedupe_table (id) VALUES (?)',
      params: ['row-3'],
      proposedBy: 'replica-1',
      proposedAt: 3,
      timestamp: '3',
    };

    t.equal(await commitThroughPort(partition, replayedEntry),
      RAFT_OPERATION_OUTCOME.CORE_OK,
      'the failed statement is consumed; the partition keeps serving');
    t.equal(partition.recentlyAppliedEntryKeys.has(
      partition.getCommittedEntryKey(replayedEntry)), false,
    'no applied instance of the entry identity exists, so it is not ' +
    'recorded as an applied replay');

    const rowCount = partition.db
      .prepare('SELECT COUNT(*) AS count FROM dedupe_table WHERE id = ?')
      .get('row-3')
      .count;
    t.equal(rowCount, 1, 'the failed statement preserves single row state');

    await partition.shutdown();
  },
);
