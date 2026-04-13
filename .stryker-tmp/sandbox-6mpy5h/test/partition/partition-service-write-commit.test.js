// @ts-nocheck
import {
  afterEach,
  beforeEach,
  test,
} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {PartitionService} from '../../src/partition/partition-service.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function createPartition(id, replicaIds) {
  return new PartitionService({
    partitionId: id,
    tableId: 'test_table',
    tableName: 'test_table',
    replicaId: replicaIds[0],
    replicaIds,
    peerAddresses: replicaIds.map((replicaId) => `test-node/partition/${replicaId}`),
    schema: {
      columns: [
        {name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'value', type: 'TEXT'},
      ],
    },
    dbPath: ':memory:',
  });
}

test('PartitionService waits for committed-entry callback before acking multi-replica writes',
  async (t) => {
    const replicaIds = [
      'commit-wait-r1',
      'commit-wait-r2',
      'commit-wait-r3',
    ];
    const partition = createPartition('commit-wait', replicaIds);
    await partition.initialize();

    partition.role = 'leader';
    partition.isLeader = true;
    partition.leaderId = partition.replicaId;
    partition.raft.state = LifeRaft.LEADER;

    let proposedEntry = null;
    partition.raftProvider.propose = async (_raft, entry) => {
      proposedEntry = {...entry};
    };

    let settled = false;
    const writePromise = partition.insertData('test_table', {
      id: 'row-1',
      value: 'value-1',
    }).then((result) => {
      settled = true;
      return result;
    });

    await Promise.resolve();
    await Promise.resolve();

    t.equal(
      settled,
      false,
      'write should remain pending until the commit callback fires',
    );
    t.ok(proposedEntry?.entryId, 'proposed write should carry a commit correlation id');

    partition.applyCommittedEntry(proposedEntry);

    const result = await writePromise;
    t.equal(result.success, true, 'write should succeed after commit');
    t.ok(Number.isFinite(result.logIndex), 'write result should include log index');
    const row = partition.db
      .prepare('SELECT value FROM test_table WHERE id = ?')
      .get('row-1');
    t.equal(row?.value, 'value-1', 'row should be persisted once the write commits');

    await partition.shutdown();
  });

test('PartitionService rejects multi-replica leader writes when Liferaft is not leader',
  async (t) => {
    const replicaIds = [
      'commit-gate-r1',
      'commit-gate-r2',
      'commit-gate-r3',
    ];
    const partition = createPartition('commit-gate', replicaIds);
    await partition.initialize();

    partition.role = 'leader';
    partition.isLeader = true;
    partition.leaderId = partition.replicaId;
    partition.raft.state = LifeRaft.FOLLOWER;

    let proposeCalled = false;
    partition.raftProvider.propose = async () => {
      proposeCalled = true;
    };

    const result = await partition.insertData('test_table', {
      id: 'row-2',
      value: 'value-2',
    });

    t.equal(result.success, false, 'write should fail until raft leadership is active');
    t.equal(
      result.error,
      'No leader available for write operation',
      'failure should surface the canonical leader-unavailable error',
    );
    t.equal(
      proposeCalled,
      false,
      'write should not be proposed while raft disagrees about leadership',
    );
    const rowCount = partition.db
      .prepare('SELECT COUNT(*) AS count FROM test_table WHERE id = ?')
      .get('row-2')
      .count;
    t.equal(rowCount, 0, 'failed write should not be applied locally');

    await partition.shutdown();
  });
