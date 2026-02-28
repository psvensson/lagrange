import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';

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

    partition.db.prepare('INSERT INTO dedupe_table (id) VALUES (?)').run('row-1');

    const leaderEntry = {
      entryId: 'entry-1',
      type: 'INSERT',
      sql: 'INSERT INTO dedupe_table (id) VALUES (?)',
      params: ['row-1'],
      proposedBy: 'replica-1',
      proposedAt: 1,
      timestamp: '1',
    };
    partition.trackAppliedEntryKey(partition.getCommittedEntryKey(leaderEntry));

    t.doesNotThrow(() => {
      partition.applyCommittedEntry({
        ...leaderEntry,
        proposedAt: 2,
        timestamp: '2',
      });
    }, 'committed replay should be skipped instead of re-inserting');

    const rowCount = partition.db
      .prepare('SELECT COUNT(*) AS count FROM dedupe_table WHERE id = ?')
      .get('row-1')
      .count;
    t.equal(rowCount, 1, 'replayed write should not create a duplicate row');

    await partition.shutdown();
  });
