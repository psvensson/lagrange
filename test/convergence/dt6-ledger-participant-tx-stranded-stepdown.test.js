import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import t from 'tap';
import {
  PartitionService,
  RaftRole,
} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Quest ledger-participant-tx-stranded-across-stepdown — deterministic
// reproduction of the run-6 ledger self-move wedge SOURCE.
//
// A 2PC participant hold on the operation ledger is a leader-LOCAL
// db.exec(BEGIN IMMEDIATE) opened on whatever replica is the partition leader
// at enlist time (partition-service-transaction-base.js). The COMMIT is later
// routed to the CURRENT leader and carries no leadership fence. A ledger
// self-move REPLACE/REMOVE churns leadership on the ledger partition itself, so
// leadership can move BETWEEN the participant BEGIN and its COMMIT: the open
// write transaction is STRANDED on the ex-leader (every later write joins it:
// in-memory success, ZERO durability) and freezes the partition for the whole
// ~60s ACTIVE-hold sweep — wedging every sibling control-plane partition.
//
// The shipped 60s sweep (enforcePreparedStateHoldTimeouts) is a downstream
// bound, not a prevention, and loses the race under the flap (the leader can't
// demote-then-heal before re-election). The fix (Leg #1) rolls back an open
// ACTIVE (never-PREPARED) participant transaction on the leadership-loss EDGE
// (onFollower), reusing the shipped crash-equivalent follower-heal sequence
// (isStuckTransactionHealPermitted + committedIndex guard). PREPARED/voted
// transactions are NEVER rolled back by this path (they are in-doubt, and are
// recoverable because PREPARE is raft-replicated). The apply-dedup clear runs
// only when a rollback actually fired (else a leadership flap re-applies).
//
// RED on the unfixed head: the step-down-edge rollback hook does not exist, so
// a stranded ACTIVE BEGIN survives the demotion and db.inTransaction stays
// true. GREEN with the fix: the edge rolls it back, db.inTransaction is false.

const config = ConfigurationManager.getInstance();
config.initialize();
const logging = LoggingService.getInstance();
logging.initialize({level: 'error'});

let tmpDirCounter = 0;
function makeTmpDbPath(t) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), `dt6-stranded-stepdown-${tmpDirCounter++}-`),
  );
  t.teardown(() => fs.rmSync(dir, {recursive: true, force: true}));
  return path.join(dir, 'partition.db');
}

async function createLeaderPartition(t) {
  const partition = new PartitionService({
    partitionId: `replica_operations-p9-${tmpDirCounter}`,
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
  // Widen the group shape AFTER init (peers never join in the fixture): the
  // stranding hazard is a multi-replica concern, so the heal must be permitted
  // by the FOLLOWER role — not by the solo-group carve-out in
  // isStuckTransactionHealPermitted.
  partition.replicaIds = ['replica-1', 'replica-2', 'replica-3'];
  return partition;
}

// Drive the leadership-loss edge exactly as replica-leadership-state.js does:
// applyReplicaDemotion flips the role to FOLLOWER FIRST (so the heal gate is
// open), THEN the onFollower callback fires. The fix's rollback hook must run
// in that callback; the test invokes the same named seam.
function driveStepDownEdge(partition) {
  partition.role = RaftRole.FOLLOWER;
  return partition.rollbackStrandedActiveParticipantTransactionsOnStepDown?.();
}

t.test(
  'a stranded ACTIVE participant BEGIN is rolled back on the step-down edge ' +
    '(RED on the unfixed head)',
  async (t) => {
    const partition = await createLeaderPartition(t);
    try {
      // Open an ACTIVE participant transaction (never prepared): the BEGIN
      // IMMEDIATE alone holds the connection in a transaction — the run-6 zombie
      // precondition. (A replicated executeQuery is avoided so the fixture does
      // not block on a quorum the fake peers can't form.)
      await partition.beginTransaction('tx-strand');
      t.equal(
        partition.db.inTransaction,
        true,
        'precondition: the ACTIVE participant transaction is open on the leader',
      );

      t.equal(
        typeof partition.rollbackStrandedActiveParticipantTransactionsOnStepDown,
        'function',
        'the step-down-edge rollback seam exists (red on the unfixed head)',
      );

      const rolledBack = driveStepDownEdge(partition);

      t.equal(
        partition.db.inTransaction,
        false,
        'the stranded ACTIVE transaction is rolled back at the step-down edge ' +
          '(not left frozen for the 60s sweep)',
      );
      t.ok(
        rolledBack >= 1,
        `the edge reports the rollback it performed (rolledBack=${rolledBack})`,
      );
      t.equal(
        partition.preparedStateLostSessions?.has('tx-strand'),
        true,
        'the rolled-back session is recorded lost (so a later routed COMMIT ' +
          'can be distinguished from a genuine idempotent already-committed miss)',
      );
    } finally {
      await partition.shutdown();
    }
  },
);

t.test(
  'a PREPARED (voted-yes, in-doubt) participant transaction is NEVER rolled ' +
    'back by the step-down edge (2PC safety guard)',
  async (t) => {
    const partition = await createLeaderPartition(t);
    try {
      if (
        typeof partition.rollbackStrandedActiveParticipantTransactionsOnStepDown !==
        'function'
      ) {
        t.equal(
          typeof partition.rollbackStrandedActiveParticipantTransactionsOnStepDown,
          'function',
          'the step-down-edge rollback seam exists (red on the unfixed head)',
        );
        return;
      }
      await partition.beginTransaction('tx-prepared');
      await partition.prepareTransaction('tx-prepared');
      t.equal(
        partition.preparedTransactions?.has('tx-prepared'),
        true,
        'precondition: the transaction is PREPARED (voted-yes / in-doubt)',
      );

      driveStepDownEdge(partition);

      t.equal(
        partition.preparedTransactions?.has('tx-prepared'),
        true,
        'the PREPARED transaction is untouched by the edge (must wait for the ' +
          'coordinator decision — self-abort would violate 2PC)',
      );
      t.notOk(
        partition.preparedStateLostSessions?.has('tx-prepared'),
        'a PREPARED session is never marked lost by the step-down edge',
      );
    } finally {
      await partition.shutdown();
    }
  },
);

t.test(
  'the step-down edge is a no-op when no ACTIVE participant transaction is ' +
    'open (dedup clear only fires on an actual rollback)',
  async (t) => {
    const partition = await createLeaderPartition(t);
    try {
      if (
        typeof partition.rollbackStrandedActiveParticipantTransactionsOnStepDown !==
        'function'
      ) {
        t.equal(
          typeof partition.rollbackStrandedActiveParticipantTransactionsOnStepDown,
          'function',
          'the step-down-edge rollback seam exists (red on the unfixed head)',
        );
        return;
      }
      t.equal(
        partition.db.inTransaction,
        false,
        'precondition: no open transaction',
      );
      const rolledBack = driveStepDownEdge(partition);
      t.equal(
        rolledBack,
        0,
        'no rollback is reported when there is nothing to roll back ' +
          '(the ~19-flap-edge spurious-reapply guard)',
      );
    } finally {
      await partition.shutdown();
    }
  },
);
