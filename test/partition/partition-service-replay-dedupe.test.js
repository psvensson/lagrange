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

    partition.applyCommittedEntry(capturedEntry);

    await t.resolves(
      () => Promise.resolve(partition.applyCommittedEntry({
        ...capturedEntry,
        proposedAt: Number(capturedEntry.proposedAt || 0) + 1,
        timestamp: String(Number(capturedEntry.timestamp || 0) + 1),
      })),
      'replayed committed entry should dedupe even if metadata drifts',
    );

    const rowCount = partition.db
      .prepare('SELECT COUNT(*) AS count FROM dedupe_table WHERE id = ?')
      .get('row-2')
      .count;
    t.equal(rowCount, 1, 'metadata-drift replay should not insert twice');

    await partition.shutdown();
  },
);
