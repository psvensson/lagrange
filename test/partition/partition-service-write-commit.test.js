import {
  afterEach,
  beforeEach,
  test,
} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  ControllablePartitionRaftProvider,
  createControllablePartitionService,
} from './partition-service-test-support.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_STATEMENT_RECORD_STATE} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {
  PARTITION_COMMITTED_COMMAND_ERROR_CODE,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_PERSISTENCE_ADMISSION} from
  '../../src/raft/raft-rs-durable-store-constants.js';


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

// The applied index the rs-raft durable store holds for the partition's
// group, read from the store owner on the partition's own database.
function durableAppliedIndex(partition) {
  return Number(new RaftRsDurableStore(partition.db)
    .readDurableRecord(partition.partitionId).appliedIndex);
}

function countEffectFailureLogs(partition) {
  const failures = [];
  const logError = partition.logger.error.bind(partition.logger);
  partition.logger.error = (message, fields) => {
    if (message === PARTITION_SERVICE_ERROR_MSG.COMMITTED_ENTRY_EFFECT_FAILED) {
      failures.push(fields);
    }
    return logError(message, fields);
  };
  return failures;
}

function createPartition(id, replicaIds) {
  return createControllablePartitionService({
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
  }, new ControllablePartitionRaftProvider());
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
    partition.controllableProvider.setRole(RAFT_ROLE.LEADER);

    let proposedEntry = null;
    partition.controllableProvider.setProposeHandler(async (entry) => {
      proposedEntry = {...entry};
    });

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

    partition.controllableProvider.commit(proposedEntry);

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
    // Production construction: a lone rs-raft leader commits and applies its
    // own proposal.
    const partition = new PartitionService({
      partitionId: 'commit-replay',
      tableId: 'test_table',
      tableName: 'test_table',
      replicaId: 'commit-replay-r1',
      replicaIds: ['commit-replay-r1'],
      nodeId: 'test-node',
      schema: {
        columns: [
          {name: 'id', type: 'TEXT', primaryKey: true},
          {name: 'value', type: 'TEXT'},
        ],
      },
      dbPath: ':memory:',
    });
    await partition.initialize();

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
    partition.controllableProvider.setRole(RAFT_ROLE.LEADER);

    let proposedEntry = null;
    partition.controllableProvider.setProposeHandler(async (entry) => {
      proposedEntry = {...entry};
    });

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

    partition.controllableProvider.setRole(RAFT_ROLE.FOLLOWER);

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
    // F-z: the write was handed to consensus before the replica stopped
    // leading, so its outcome is not known here: the answer says so, names
    // the entry a retry must reuse, and is not a missing-leader refusal.
    t.equal(demotionOutcome.kind, 'result',
      'the released write is answered, not thrown');
    t.equal(
      demotionOutcome.result?.success,
      false,
      'the stale owner does not acknowledge the write',
    );
    t.ok(
      typeof PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN === 'string' &&
        demotionOutcome.result?.failureCode ===
          PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
      'a proposed write released on demotion is answered OUTCOME_UNKNOWN ' +
        `(${JSON.stringify(demotionOutcome.result)})`,
    );
    t.equal(demotionOutcome.result?.entryId, proposedEntry?.entryId,
      'the answer names the proposed entry, so a retry is idempotent');
    t.equal(
      partition.db
        .prepare('SELECT COUNT(*) AS count FROM test_table WHERE id = ?')
        .get('row-demoted')
        .count,
      0,
      'a demoted stale leader must not retain an uncommitted local row',
    );

    if (demotionOutcome.kind === 'test-timeout') {
      partition.releasePendingCommittedWrites(() => ({
        success: false, error: 'test cleanup'}));
      await writeOutcomePromise;
    }
    await partition.shutdown();
  },
);

test(
  'PartitionService publishes no apply effects when a committed entry ' +
    'application rolls back',
  async (t) => {
    const partition = createPartition('commit-rollback', [
      'commit-rollback-r1',
      'commit-rollback-r2',
      'commit-rollback-r3',
    ]);
    await partition.initialize();
    const provider = partition.controllableProvider;
    const firstCommand = {
      type: 'INSERT',
      entryId: 'rollback-entry-1',
      sql: 'INSERT INTO test_table (id, value) VALUES (?, ?)',
      params: ['rollback-row-1', 'value-1'],
    };
    const secondCommand = {
      type: 'INSERT',
      entryId: 'rollback-entry-2',
      sql: 'INSERT INTO test_table (id, value) VALUES (?, ?)',
      params: ['rollback-row-2', 'value-2'],
    };
    const committedEvents = [];
    partition.on(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, (event) => {
      committedEvents.push(event.command.entryId);
    });
    const appliedBefore = durableAppliedIndex(partition);
    // The applied-state write of the same transaction fails, so the whole
    // application transaction rolls back.
    partition.db.exec(
      'CREATE TRIGGER fail_applied_progress ' +
      'BEFORE INSERT ON _raft_rs_applied_state ' +
      'BEGIN SELECT RAISE(ABORT, \'applied progress failed\'); END');

    t.throws(
      () => provider.commit(firstCommand),
      /applied progress failed/,
      'the failed applied-state write fails the application transaction',
    );
    t.equal(durableAppliedIndex(partition), appliedBefore,
      'the rs-raft applied state does not advance');
    t.equal(
      partition.db.prepare('SELECT COUNT(*) AS count FROM test_table').get()
        .count,
      0,
      'the SQL application rolls back with the applied state',
    );
    t.same(committedEvents, [],
      'no committed event escapes the failed transaction');
    t.equal(
      readCommittedStatementOutcome(partition,
        partition.getCommittedEntryKey(firstCommand)).state,
      PARTITION_COMMITTED_STATEMENT_RECORD_STATE.UNSETTLED,
      'no outcome is recorded for rolled-back SQL',
    );

    partition.db.exec('DROP TRIGGER fail_applied_progress');
    const effectFailures = countEffectFailureLogs(partition);
    partition.on(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, () => {
      throw new Error('injected post-commit observer failure');
    });
    provider.commit(firstCommand);
    provider.commit(secondCommand);

    t.equal(durableAppliedIndex(partition), provider.committedIndex,
      'the rs-raft applied state covers every durably applied entry');
    t.equal(
      partition.db.prepare('SELECT COUNT(*) AS count FROM test_table').get()
        .count,
      2,
      'both committed rows apply exactly once',
    );
    t.same(committedEvents, ['rollback-entry-1', 'rollback-entry-2'],
      'observable commit effects publish only after durable success');
    t.equal(effectFailures.length, 2,
      'post-commit observer failures are logged and cannot reclassify ' +
      'the durable apply');

    await partition.shutdown();
  },
);

test(
  'a failed statement on a single-replica rs-raft partition is a consumed ' +
    'outcome, not a host failure',
  async (t) => {
    // Production construction: a lone rs-raft leader.
    const partition = new PartitionService({
      partitionId: 'statement-failed',
      tableId: 'test_table',
      tableName: 'test_table',
      replicaId: 'statement-failed-r1',
      replicaIds: ['statement-failed-r1'],
      nodeId: 'test-node',
      schema: {
        columns: [
          {name: 'id', type: 'TEXT', primaryKey: true},
          {name: 'value', type: 'TEXT'},
        ],
      },
      dbPath: ':memory:',
    });
    await partition.initialize();
    try {
      const appliedBefore = durableAppliedIndex(partition);
      const failed = await partition.applyWrite({
        type: 'INSERT',
        entryId: 'statement-failed-entry',
        sql: 'INSERT INTO missing_table (id) VALUES (?)',
        params: ['never'],
      });
      t.equal(failed.success, false, 'the failed statement reports failure');
      t.match(failed.error, /missing_table/,
        'the failure carries the statement error');
      t.equal(failed.partitionId, partition.partitionId);
      t.ok(Number.isSafeInteger(failed.logIndex),
        'the failure names the committed entry that consumed it');
      t.equal(failed.durableCommitWitness?.logIndex, failed.logIndex,
        'the proposer carries the durable commit witness of that entry');

      const succeeded = await partition.applyWrite({
        type: 'INSERT',
        entryId: 'statement-after-failure-entry',
        sql: 'INSERT INTO test_table (id, value) VALUES (?, ?)',
        params: ['row-after-failure', 'value'],
      });
      t.equal(succeeded.success, true, 'the next write succeeds');
      t.equal(partition.raft.readStatus().role, RAFT_ROLE.LEADER,
        'the group stays leader');
      t.equal(durableAppliedIndex(partition), appliedBefore + 2,
        'both entries were consumed by the application');
      t.same(
        partition.db.prepare('SELECT id FROM test_table').all()
          .map(({id}) => id),
        ['row-after-failure'],
        'only the successful statement changed the state machine');
    } finally {
      await partition.shutdown();
    }
  },
);

test(
  'PartitionService transaction outcome rolls back with the rs-raft ' +
    'applied state',
  async (t) => {
    const partition = createPartition('commit-outcome-rollback', [
      'commit-outcome-rollback-r1',
      'commit-outcome-rollback-r2',
      'commit-outcome-rollback-r3',
    ]);
    await partition.initialize();
    const provider = partition.controllableProvider;
    const command = {
      type: PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT,
      entryId: 'transaction-outcome-entry',
      sessionId: 'transaction-outcome-session',
      transactionEpoch: 7,
      operations: [],
    };
    const committedEvents = [];
    partition.on(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, (event) => {
      committedEvents.push(event.command.entryId);
    });
    const appliedBefore = durableAppliedIndex(partition);
    const recordOutcome = partition.recordTransactionCommitOutcome;
    partition.recordTransactionCommitOutcome = () => {
      throw new Error('injected transaction outcome failure');
    };

    t.throws(
      () => provider.commit(command),
      /injected transaction outcome failure/,
      'a durable outcome failure fails the application transaction',
    );
    t.equal(durableAppliedIndex(partition), appliedBefore,
      'the rs-raft applied state rolls back with the outcome');
    t.equal(
      partition.db.prepare(
        'SELECT COUNT(*) AS count FROM _transaction_outcomes',
      ).get().count,
      0,
      'no transaction outcome survives the failed apply',
    );
    t.same(committedEvents, [],
      'no observable commit event escapes the failed outcome write');

    partition.recordTransactionCommitOutcome = recordOutcome;
    provider.commit(command);
    t.equal(durableAppliedIndex(partition), provider.committedIndex,
      'retry advances the rs-raft applied state');
    t.same(
      partition.db.prepare(
        'SELECT outcome, transaction_epoch AS transactionEpoch ' +
        'FROM _transaction_outcomes WHERE session_id = ?',
      ).get(command.sessionId),
      {outcome: 'COMMITTED', transactionEpoch: command.transactionEpoch},
      'retry durably records the matching transaction outcome',
    );
    t.same(committedEvents, [command.entryId],
      'observable commit publishes only after the outcome is durable');

    await partition.shutdown();
  },
);

test(
  'PartitionService fails an unrecognised committed command closed',
  async (t) => {
    const partition = createPartition('commit-unrecognised', [
      'commit-unrecognised-r1',
      'commit-unrecognised-r2',
      'commit-unrecognised-r3',
    ]);
    await partition.initialize();
    const provider = partition.controllableProvider;
    const committedEvents = [];
    partition.on(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, (event) => {
      committedEvents.push(event.command);
    });
    const appliedBefore = durableAppliedIndex(partition);
    let failure = null;
    try {
      provider.commit({type: 'NOT_A_PARTITION_COMMAND', entryId: 'unknown'});
    } catch (error) {
      failure = error;
    }

    t.equal(failure?.code, PARTITION_COMMITTED_COMMAND_ERROR_CODE.UNRECOGNISED,
      'an unrecognised committed command is a typed application failure');
    t.equal(durableAppliedIndex(partition), appliedBefore,
      'the applied state does not advance past an unrecognised command');
    t.same(committedEvents, [],
      'no committed event is published for an unrecognised command');

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
    partition.controllableProvider.setRole(RAFT_ROLE.LEADER);

    let proposalCount = 0;
    partition.controllableProvider.setProposeHandler(async () => {
      proposalCount += 1;
    });
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

    partition.controllableProvider.setRole(RAFT_ROLE.FOLLOWER);
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
    partition.controllableProvider.setRole(RAFT_ROLE.LEADER);

    let proposalCount = 0;
    partition.controllableProvider.setProposeHandler(async (entry) => {
      proposalCount += 1;
      partition.controllableProvider.commit(entry);
    });
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

// F-z: a write the port deferred (a user session held the connection, so
// nothing entered the core) is queued again, not proposed. Released on
// demotion in that state it was never proposed: it is answered NOT_LEADER
// and never handed to consensus afterwards. With the production runtime a
// role change cannot happen while a session holds the connection (nothing
// enters the core), so the port's deferral answer is given by the
// controllable port.
test('PartitionService answers a queued write released on demotion ' +
  'NOT_LEADER and never proposes it afterwards', async (t) => {
  const replicaIds = ['queued-demotion-r1', 'queued-demotion-r2',
    'queued-demotion-r3'];
  const partition = createPartition('queued-demotion', replicaIds);
  await partition.initialize();
  partition.controllableProvider.setRole(RAFT_ROLE.LEADER);
  const proposals = [];
  // The port's own deferral answer while a user transaction holds the
  // connection: a retryable host failure that leaves the group usable.
  partition.controllableProvider.setProposeHandler(async (entry) => {
    proposals.push(entry.entryId);
    return {
      outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
      reason: RAFT_RS_PERSISTENCE_ADMISSION.USER_TRANSACTION_OPEN,
      retryable: true,
      recoveryRequired: false,
    };
  });
  const answer = partition.applyWrite({
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: 'INSERT INTO test_table (id, value) VALUES (?, ?)',
    params: ['row-queued', 'queued'],
    entryId: 'queued-entry',
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  t.ok(proposals.length >= 1, 'setup: the port deferred the proposal');
  partition.controllableProvider.setRole(RAFT_ROLE.FOLLOWER);
  const proposedBeforeRelease = proposals.length;
  const result = await Promise.race([answer, new Promise((resolve) =>
    setTimeout(() => resolve({kind: 'test-timeout'}), 500))]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.ok(
    typeof PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER === 'string' &&
      result?.failureCode === PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER,
    'a queued write released on demotion is answered NOT_LEADER ' +
      `(${JSON.stringify(result)})`,
  );
  t.equal(result?.entryId, 'queued-entry', 'the answer names the entry');
  t.equal(proposals.length, proposedBeforeRelease,
    'a released write is never proposed afterwards');
  await partition.shutdown();
});

test('PartitionService rejects multi-replica leader writes when Raft is not leader',
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
    partition.controllableProvider.setRole(RAFT_ROLE.FOLLOWER);

    let proposeCalled = false;
    partition.controllableProvider.setProposeHandler(async () => {
      proposeCalled = true;
    });

    await t.rejects(
      partition.insertData('test_table', {
        id: 'row-2',
        value: 'value-2',
      }),
      /No leader available for write operation/,
      'write should reject until raft leadership is active',
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
