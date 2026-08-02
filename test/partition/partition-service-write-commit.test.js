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
    nodeId: 'test-node',
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
    const beforeCommitCount = partition.db
      .prepare('SELECT COUNT(*) AS count FROM test_table WHERE id = ?')
      .get('row-1')
      .count;
    t.equal(
      beforeCommitCount,
      0,
      'an uncommitted Raft proposal must not mutate the local state machine',
    );

    partition.applyCommittedEntry(proposedEntry);

    const result = await writePromise;
    t.equal(result.success, true, 'write should succeed after commit');
    t.ok(Number.isFinite(result.logIndex), 'write result should include log index');
    t.same(
      result.durableCommitWitness,
      {
        partitionId: 'commit-wait',
        leaderNodeId: 'test-node',
        leaderReplicaId: 'commit-wait-r1',
        term: result.durableCommitWitness?.term,
        logIndex: result.logIndex,
        entryId: proposedEntry.entryId,
      },
      'a successful result should expose the exact durable Raft commit',
    );
    t.ok(
      Number.isSafeInteger(result.durableCommitWitness?.term),
      'the durable commit witness should include the Raft term',
    );
    t.equal(result.acceptingNodeId, 'test-node');
    t.ok(Number.isSafeInteger(result.acknowledgedAtMs));
    const row = partition.db
      .prepare('SELECT value FROM test_table WHERE id = ?')
      .get('row-1');
    t.equal(row?.value, 'value-1', 'row should be persisted once the write commits');

    await partition.shutdown();
  });

test('PartitionService retains the durable witness for completed idempotent replay',
  async (t) => {
    const partition = createPartition('commit-replay', ['commit-replay-r1']);
    await partition.initialize();
    partition.role = 'leader';
    partition.isLeader = true;

    const operation = {
      type: 'INSERT',
      entryId: 'stable-replay-entry',
      sql: 'INSERT INTO test_table (id, value) VALUES (?, ?)',
      params: ['row-replay', 'value-replay'],
    };
    const first = await partition.proposeWrite(operation);
    const replay = await partition.proposeWrite(operation);

    t.equal(first.success, true);
    t.equal(replay.success, true);
    t.equal(replay.idempotentReplay, true);
    t.same(
      replay.durableCommitWitness,
      first.durableCommitWitness,
      'a replay acknowledgment must retain the original durable identity',
    );
    t.equal(replay.acceptingNodeId, 'test-node');
    t.ok(Number.isSafeInteger(replay.acknowledgedAtMs));

    await partition.shutdown();
  });

test(
  'PartitionService rejects an uncommitted write immediately on leadership loss',
  async (t) => {
    const replicaIds = [
      'commit-demotion-r1',
      'commit-demotion-r2',
      'commit-demotion-r3',
    ];
    const partition = createPartition('commit-demotion', replicaIds);
    await partition.initialize();

    partition.role = 'leader';
    partition.isLeader = true;
    partition.leaderId = partition.replicaId;
    partition.raft.state = LifeRaft.LEADER;

    let proposedEntry = null;
    partition.raftProvider.propose = async (_raft, entry) => {
      proposedEntry = {...entry};
    };

    const writeOutcomePromise = partition.insertData('test_table', {
      id: 'row-demoted',
      value: 'must-not-leak',
    }).then(
      (result) => ({kind: 'result', result}),
      (error) => ({kind: 'error', error}),
    );

    await Promise.resolve();
    await Promise.resolve();

    t.ok(proposedEntry?.entryId, 'fixture should hold one pending proposal');
    t.equal(
      partition.db
        .prepare('SELECT COUNT(*) AS count FROM test_table WHERE id = ?')
        .get('row-demoted')
        .count,
      0,
      'the pending proposal must remain invisible before quorum commit',
    );

    partition.raft.change({state: LifeRaft.FOLLOWER});

    const demotionOutcome = await Promise.race([
      writeOutcomePromise,
      new Promise((resolve) => {
        setTimeout(() => resolve({kind: 'test-timeout'}), 50);
      }),
    ]);

    t.not(
      demotionOutcome.kind,
      'test-timeout',
      'leadership loss should release the write owner without waiting for the 30s commit timer',
    );
    if (demotionOutcome.kind === 'result') {
      t.equal(
        demotionOutcome.result.success,
        false,
        'the stale owner should return a retryable failure',
      );
      t.equal(
        demotionOutcome.result.error,
        'No leader available for write operation',
        'demotion should surface the canonical leader-unavailable outcome',
      );
    } else if (demotionOutcome.kind === 'error') {
      t.equal(
        demotionOutcome.error.message,
        'No leader available for write operation',
        'demotion should reject with the canonical leader-unavailable outcome',
      );
    }
    t.equal(
      partition.db
        .prepare('SELECT COUNT(*) AS count FROM test_table WHERE id = ?')
        .get('row-demoted')
        .count,
      0,
      'a demoted stale leader must not retain an uncommitted local row',
    );

    if (demotionOutcome.kind === 'test-timeout') {
      partition.clearPendingCommittedWrites('test cleanup');
      await writeOutcomePromise;
    }
    await partition.shutdown();
  },
);

test(
  'PartitionService joins overlapping redelivery to one pending write owner',
  async (t) => {
    const replicaIds = [
      'commit-redelivery-r1',
      'commit-redelivery-r2',
      'commit-redelivery-r3',
    ];
    const partition = createPartition('commit-redelivery', replicaIds);
    await partition.initialize();

    partition.role = 'leader';
    partition.isLeader = true;
    partition.leaderId = partition.replicaId;
    partition.raft.state = LifeRaft.LEADER;

    let proposalCount = 0;
    partition.raftProvider.propose = async () => {
      proposalCount += 1;
    };
    const entryId = 'overlapping-redelivery-entry';
    const request = {
      type: 'QUERY',
      sql: 'INSERT INTO test_table (id, value) VALUES (?, ?)',
      params: ['row-redelivery', 'must-not-leak'],
      entryId,
      operationId: 'overlapping-redelivery-operation',
      idempotencyKey: 'overlapping-redelivery-operation',
    };

    const firstResponsePromise = partition.handleRemoteQuery(request);
    await Promise.resolve();
    await Promise.resolve();
    const firstPendingOwner = partition.proposalQueue.get(entryId);
    const secondResponsePromise = partition.handleRemoteQuery(request);
    await Promise.resolve();
    await Promise.resolve();

    t.equal(
      partition.proposalQueue.get(entryId),
      firstPendingOwner,
      'redelivery must preserve the original pending owner',
    );
    t.equal(
      proposalCount,
      1,
      'overlapping redelivery must not append and propose a duplicate entry',
    );

    partition.raft.change({state: LifeRaft.FOLLOWER});
    const outcomes = await Promise.race([
      Promise.all([firstResponsePromise, secondResponsePromise]),
      new Promise((resolve) => {
        setTimeout(() => resolve(null), 50);
      }),
    ]);

    t.ok(
      outcomes,
      'demotion must release every waiter joined to the pending owner',
    );
    if (outcomes) {
      t.equal(outcomes.length, 2, 'both redeliveries should settle');
      t.ok(
        outcomes.every((outcome) => outcome.success === false),
        'both redeliveries should expose the retryable demotion outcome',
      );
    } else {
      clearTimeout(firstPendingOwner?.timeoutId);
      firstPendingOwner?.reject?.(new Error('test cleanup'));
      await Promise.all([firstResponsePromise, secondResponsePromise]);
    }
    t.equal(
      partition.db
        .prepare('SELECT COUNT(*) AS count FROM test_table WHERE id = ?')
        .get('row-redelivery')
        .count,
      0,
      'overlapping uncommitted delivery must leave SQLite unchanged',
    );

    await partition.shutdown();
  },
);

test(
  'PartitionService retains redelivery ownership through post-commit effects',
  async (t) => {
    const replicaIds = [
      'commit-side-effect-r1',
      'commit-side-effect-r2',
      'commit-side-effect-r3',
    ];
    const partition = createPartition('commit-side-effect', replicaIds);
    await partition.initialize();

    partition.role = 'leader';
    partition.isLeader = true;
    partition.leaderId = partition.replicaId;
    partition.raft.state = LifeRaft.LEADER;

    let proposalCount = 0;
    partition.raftProvider.propose = async (_raft, entry) => {
      proposalCount += 1;
      partition.applyCommittedEntry(entry);
    };
    let releaseSideEffect = null;
    const sideEffectGate = new Promise((resolve) => {
      releaseSideEffect = resolve;
    });
    let markSideEffectStarted = null;
    const sideEffectStarted = new Promise((resolve) => {
      markSideEffectStarted = resolve;
    });
    let sideEffectCount = 0;
    partition.handleSplitReplicationAfterWrite = async () => {
      sideEffectCount += 1;
      markSideEffectStarted();
      await sideEffectGate;
    };
    const entryId = 'post-commit-side-effect-entry';
    const request = {
      type: 'QUERY',
      sql: 'INSERT INTO test_table (id, value) VALUES (?, ?)',
      params: ['row-side-effect', 'value-side-effect'],
      entryId,
      operationId: 'post-commit-side-effect-operation',
      idempotencyKey: 'post-commit-side-effect-operation',
    };

    const firstResponsePromise = partition.handleRemoteQuery(request);
    await sideEffectStarted;
    t.equal(
      partition.proposalQueue.has(entryId),
      false,
      'Raft commit should release the narrower proposal-queue owner',
    );
    t.equal(
      partition.pendingWriteOutcomes.has(entryId),
      true,
      'full write ownership must remain while post-commit effects are pending',
    );

    let redeliverySettled = false;
    const redeliveryResponsePromise = partition
      .handleRemoteQuery(request)
      .then((response) => {
        redeliverySettled = true;
        return response;
      });
    await Promise.resolve();
    await Promise.resolve();

    t.equal(
      redeliverySettled,
      false,
      'redelivery must not acknowledge before the original side effects finish',
    );
    t.equal(proposalCount, 1, 'redelivery must still join one Raft proposal');
    releaseSideEffect();
    const outcomes = await Promise.all([
      firstResponsePromise,
      redeliveryResponsePromise,
    ]);

    t.ok(
      outcomes.every((outcome) => outcome.success === true),
      'both waiters should receive the completed write outcome',
    );
    t.equal(sideEffectCount, 1, 'post-commit side effects should run once');
    t.equal(
      partition.pendingWriteOutcomes.has(entryId),
      false,
      'full-outcome ownership must clear after completion',
    );
    t.equal(
      partition.db
        .prepare('SELECT COUNT(*) AS count FROM test_table WHERE id = ?')
        .get('row-side-effect')
        .count,
      1,
      'joined redelivery must not apply the committed row twice',
    );

    await partition.shutdown();
  },
);

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
