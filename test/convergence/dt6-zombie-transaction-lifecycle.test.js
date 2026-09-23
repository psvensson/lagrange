import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import t from 'tap';
import {
  PartitionService,
  RaftRole,
} from '../../src/partition/partition-service.js';
import {readPartitionAppliedIndex} from
  '../../src/partition/partition-committed-log.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {DurableWorkflowCoordinator} from '../../src/workflow/durable-workflow-coordinator.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Quest ledger-participant-transaction-zombie-lifecycle (P1, companion to the
// landed leader-durability-fitness) — the transaction-lifecycle HEAL for the
// run-23 zombie class:
//
//   A 2PC participant BEGIN IMMEDIATE was orphaned when its coordinator
//   committed against an EMPTY participant set — recovery had replaced the
//   live in-memory transaction with a cache-derived copy whose participants
//   Map was rebuilt from CDC-lagging rows. The open transaction absorbed
//   every later write on the connection; the whole ledger went non-durable
//   in silence.
//
// The fix set under test:
//   1. ACTIVE participant holds sweep under the same 60s legal bound as
//      prepared holds — but the heal (bare ROLLBACK) is ROLE-GATED: safe on
//      a follower/learner (crash-equivalent) or a SOLO group (no follower
//      exists to truncate); a LEADER or CANDIDATE must wait for the
//      durability-fitness demotion (a leader rollback re-mints acked raft
//      indices and followers truncate committed entries).
//   2. The heal is NOT crash-equivalent for JS memory (verifier finding Z1):
//      it must clear the apply-dedup set, and the committed/applied
//      watermark the replica acts on must be the DURABLE one, or post-heal
//      catch-up silently skips re-execution and clamps the durable watermark
//      forever. On rs-raft the watermark has no JS-memory cache to strand
//      (the retired adapter's `_committedIndexCache` is gone): it is the
//      rs-raft store's applied-state row, written in each committed entry's
//      own transaction. So the re-anchor claim is read from production
//      observables - the partition's own committed-log reader on its
//      connection, the store read on an INDEPENDENT connection, and the
//      port's readStatus() - never from a seeded private field.
//   3. The coordinator never commits against lost enlistment state: recovery
//      never clobbers a LIVE workflow's participant registry with a staler
//      cache view, and a stage over an empty/missing registry fails instead
//      of silently succeeding.
//   4. Sessionless writes are never silently absorbed into a FOREIGN open
//      transaction (the DEFAULT session keeps its adoption by design).

const config = ConfigurationManager.getInstance();
config.initialize();
const logging = LoggingService.getInstance();
logging.initialize({level: 'error'});

const LEGAL_HOLD_MS = 60_000;
// The sweep compares against the transaction's real begin timestamp, so the
// deterministic drive anchors past it in real time.
const pastLegalHold = () => Date.now() + LEGAL_HOLD_MS + 1_000;

let tmpDirCounter = 0;
function makeTmpDbPath(t) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), `dt6-zombie-lifecycle-${tmpDirCounter++}-`),
  );
  t.teardown(() => fs.rmSync(dir, {recursive: true, force: true}));
  return path.join(dir, 'partition.db');
}

// What the rs-raft durable store of the partition holds, read on a
// connection of the test's own (DDL-free readers): the durable applied index
// and the applied proposals.
function readDurableRecordIndependently(partition) {
  const independent = new Database(partition.dbPath, {readonly: true});
  try {
    return {
      appliedIndex: RaftRsDurableStore.readAppliedIndexIn(
        independent, partition.partitionId),
      proposals: RaftRsDurableStore.readCommittedEntriesIn(
        independent, partition.partitionId),
    };
  } finally {
    independent.close();
  }
}

// A real single-replica PartitionService (peers cannot initialize without a
// transport registry); multi-replica GROUP SHAPE is modeled by overriding the
// replicaIds field after init — the exact input of the solo-group predicate.
async function createPartition(t, {groupReplicaIds = ['replica-1']} = {}) {
  const warnings = [];
  const partition = new PartitionService({
    partitionId: `replica_operations-p8-${tmpDirCounter}`,
    tableId: 'replica_operations',
    tableName: 'replica_operations',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-test',
    schema: {
      columns: [
        {name: 'id', type: 'INTEGER', primaryKey: true},
        {name: 'value', type: 'TEXT'},
      ],
    },
    dbPath: makeTmpDbPath(t),
  });
  await partition.initialize();
  partition.replicaIds = groupReplicaIds;
  const originalWarn = partition.logger.warn.bind(partition.logger);
  partition.logger = Object.create(partition.logger);
  partition.logger.warn = (message, payload) => {
    warnings.push({message, payload});
    return originalWarn(message, payload);
  };
  return {partition, warnings};
}

t.test(
  'follower heal: an ACTIVE hold past the legal window is rolled back with ' +
    'the JS-memory state cleared (RED on the unfixed head)',
  async (t) => {
    const {partition, warnings} = await createPartition(t, {
      groupReplicaIds: ['replica-1', 'replica-2', 'replica-3'],
    });
    try {
      partition.role = RaftRole.FOLLOWER;
      // The durable watermark before the zombie opens: the core's commit
      // index on the port, and the store's applied index on an independent
      // connection.
      const durableBefore = readDurableRecordIndependently(partition);
      const commitIndexBefore = partition.raft.readStatus().commitIndex;
      await partition.beginTransaction('tx-zombie');

      const swept = partition.enforcePreparedStateHoldTimeouts(
        pastLegalHold(),
      );
      t.ok(swept >= 1, 'the ACTIVE hold was swept');
      t.equal(
        partition.db.inTransaction,
        false,
        'the zombie transaction was rolled back on a follower',
      );
      t.notOk(
        partition.activeTransactions.has('tx-zombie'),
        'the session bookkeeping is cleared',
      );
      t.ok(
        partition.preparedStateLostSessions.has('tx-zombie'),
        'the session is marked lost for late commit/rollback callers',
      );
      // Z1: there is no JS-memory apply-dedup state for the heal to strand.
      // Whether a statement re-executes is its durable outcome row's answer
      // (quest raft-rs-single-path-partition-cutover, B2/F-o), and that row
      // rolls back with the transaction exactly like the applied watermark
      // asserted below.
      const durableAfter = readDurableRecordIndependently(partition);
      t.equal(
        readPartitionAppliedIndex(partition),
        durableAfter.appliedIndex,
        'Z1: the applied watermark the partition reads on its own ' +
          'connection is the DURABLE one (the rs-raft store, read on an ' +
          'independent connection)',
      );
      t.equal(
        durableAfter.appliedIndex,
        durableBefore.appliedIndex,
        'Z1: the heal leaves the durable applied watermark where it was ' +
          'before the zombie opened',
      );
      t.equal(
        partition.raft.readStatus().commitIndex,
        commitIndexBefore,
        'Z1: the core commit index is untouched by the heal',
      );
      t.same(
        durableAfter.proposals,
        [],
        'Z1: nothing was ever durably committed (no applied proposal in the ' +
          'rs-raft store)',
      );
      t.ok(
        warnings.some(
          (w) => typeof w.message === 'string' && w.message.includes('Active transaction held'),
        ),
        'the heal is loud',
      );
    } finally {
      await partition.shutdown();
    }
  },
);

t.test(
  'leader/candidate defer: a multi-replica LEADER never bare-rollbacks; the ' +
    'heal waits for demotion (RED on the unfixed head — the old sweep would ' +
    'have rolled back a leader)',
  async (t) => {
    const {partition, warnings} = await createPartition(t, {
      groupReplicaIds: ['replica-1', 'replica-2', 'replica-3'],
    });
    try {
      partition.role = RaftRole.LEADER;
      await partition.beginTransaction('tx-zombie');
      const sweptAsLeader = partition.enforcePreparedStateHoldTimeouts(
        pastLegalHold(),
      );
      t.equal(sweptAsLeader, 0, 'no heal ran on the leader');
      t.equal(
        partition.db.inTransaction,
        true,
        'the transaction is untouched on the leader (rollback would re-mint ' +
          'acked raft indices)',
      );
      t.ok(
        partition.activeTransactions.has('tx-zombie'),
        'the session stays visible to future sweeps',
      );
      t.ok(
        warnings.some(
          (w) =>
            typeof w.message === 'string' &&
            w.message.includes('Stuck transaction heal deferred'),
        ),
        'the deferral is loud',
      );

      // Demotion (the durability-fitness consequence) flips the role; the
      // next sweep tick heals crash-equivalently.
      partition.role = RaftRole.FOLLOWER;
      const sweptAsFollower = partition.enforcePreparedStateHoldTimeouts(
        pastLegalHold() + 1_000,
      );
      t.ok(sweptAsFollower >= 1, 'the post-demotion sweep heals');
      t.equal(
        partition.db.inTransaction,
        false,
        'the zombie is rolled back once the replica is a follower',
      );
    } finally {
      await partition.shutdown();
    }
  },
);

t.test(
  'solo carve-out: a single-replica LEADER heals in place (no follower ' +
    'exists to truncate; demotion is structurally impossible)',
  async (t) => {
    const {partition} = await createPartition(t, {});
    try {
      t.equal(partition.role, RaftRole.LEADER, 'solo fixture is the leader');
      await partition.beginTransaction('tx-zombie-solo');
      const swept = partition.enforcePreparedStateHoldTimeouts(
        pastLegalHold(),
      );
      t.ok(swept >= 1, 'the solo leader sweeps its own stuck hold');
      t.equal(
        partition.db.inTransaction,
        false,
        'the solo heal rolled the zombie back in place',
      );
    } finally {
      await partition.shutdown();
    }
  },
);

t.test(
  'absorption removed: a sessionless write with only a FOREIGN transaction ' +
    'open is NOT adopted into its session bookkeeping (RED on the unfixed ' +
    'head - run-23 lost every such write into the zombie)',
  async (t) => {
    const {partition} = await createPartition(t, {});
    try {
      await partition.beginTransaction('tx-foreign');
      await partition.executeQuery(
        'INSERT INTO replica_operations (id, value) VALUES (7, ?)',
        ['independent'],
      );
      const foreignState = partition.activeTransactions.get('tx-foreign');
      t.equal(
        (foreignState?.operations || []).length,
        0,
        'the sessionless write is not registered in the foreign session ' +
          '(it rides the ordinary write path; on a healed replica it ' +
          're-applies durably instead of evaporating with the zombie)',
      );
      await partition.rollbackTransaction('tx-foreign').catch(() => {});
    } finally {
      await partition.shutdown();
    }
  },
);

t.test(
  'coordinator guards: recovery never clobbers a LIVE workflow registry, ' +
    'and a stage never silently succeeds against lost enlistment ' +
    '(RED on the unfixed head — the run-23 empty-set commit)',
  async (t) => {
    const coordinator = new DurableWorkflowCoordinator();
    const workflowId = 'tx-run23';
    await coordinator.registerWorkflow({
      workflowId,
      ownerKey: 'session-run23',
      status: 'ACTIVE',
    });
    await coordinator.upsertParticipant(workflowId, {
      workflowId,
      participantId: 'p-ledger',
      participantKey: 'replica_operations-p1',
      partitionId: 'replica_operations-p1',
      status: 'ACTIVE',
    });

    // The run-23 clobber: a recovery pass whose cache-derived rows lag CDC
    // (participant row not yet visible) replaces the live workflow.
    coordinator.recover({
      workflows: [
        {
          workflowId,
          ownerKey: 'session-run23',
          status: 'ACTIVE',
        },
      ],
      participants: [],
      loadWorkflow: (row) => row,
      loadParticipant: (row) => row,
      isTerminalWorkflow: (workflow) =>
        workflow.status === 'COMMITTED' || workflow.status === 'ROLLED_BACK',
    });
    const workflow = coordinator.getWorkflowById(workflowId);
    t.equal(
      workflow.participants.size,
      1,
      'the LIVE participant registry survives a lagging recovery pass',
    );

    // Even if the registry were lost, a commit stage must refuse to run
    // against nothing when enlistment happened: simulate the loss directly.
    workflow.participants.clear();
    const failures = await coordinator.executeParticipantStage(
      workflowId,
      'COMMITTING',
      'COMMITTED',
      async () => {},
    );
    t.ok(
      failures.length >= 1,
      'a stage against lost enlistment state FAILS instead of silently ' +
        'committing with zero participants',
    );

    // A workflow that never enlisted anyone keeps zero-participant commits
    // legal (the established 2PC-as-theater formation norm).
    await coordinator.registerWorkflow({
      workflowId: 'tx-theater',
      ownerKey: 'session-theater',
      status: 'ACTIVE',
    });
    const theaterFailures = await coordinator.executeParticipantStage(
      'tx-theater',
      'COMMITTING',
      'COMMITTED',
      async () => {},
    );
    t.equal(
      theaterFailures.length,
      0,
      'zero-participant stages stay legal for never-enlisted workflows',
    );
    t.end();
  },
);

t.test(
  'restart recovery still restores workflows and participants (nothing ' +
    'live to protect)',
  async (t) => {
    const coordinator = new DurableWorkflowCoordinator();
    coordinator.recover({
      workflows: [
        {workflowId: 'tx-restart', ownerKey: 'session-restart', status: 'PREPARING'},
      ],
      participants: [
        {
          workflowId: 'tx-restart',
          participantId: 'p-1',
          participantKey: 'part-1',
          partitionId: 'part-1',
          status: 'PREPARED',
        },
      ],
      loadWorkflow: (row) => row,
      loadParticipant: (row) => row,
      isTerminalWorkflow: (workflow) => workflow.status === 'COMMITTED',
    });
    const workflow = coordinator.getWorkflowById('tx-restart');
    t.ok(workflow, 'the workflow is restored after restart');
    t.equal(
      workflow.participants.size,
      1,
      'its participant registry is restored from rows',
    );
    t.end();
  },
);
