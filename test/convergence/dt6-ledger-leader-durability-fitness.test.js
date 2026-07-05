import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import t from 'tap';
import {
  PartitionService,
  RaftRole,
} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Quest formation-ledger-leader-local-persistence-wedge (P1) — deterministic
// reproduction of the run-23 ledger-leader durability freeze:
//
//   A distributed-transaction participant BEGIN IMMEDIATE was delivered to the
//   operation-ledger leader and then orphaned (its 2PC coordinator committed
//   against an empty participant set), so the leader's single better-sqlite3
//   connection sat inside an open transaction forever. Every later write on
//   that connection joined the zombie: in-memory success, same-connection read
//   consistency (replication and index minting stayed correct), ZERO
//   durability, silent rollback at shutdown. The leader stayed leader for the
//   rest of the run with zero warnings; all sql-routed transition UPDATEs and
//   owner-local confirms died cluster-wide.
//
// This test drives the REAL PartitionService transaction seam (the exact
// participant path: service.beginTransaction) on a REAL file-backed sqlite db,
// abandons the transaction, and asserts the fix's leadership-fitness contract:
//   - the durability-fitness detector (riding the same 1s sweep as
//     enforcePreparedStateHoldTimeouts, nowMs-overridable) observes the
//     connection stuck in a transaction beyond the max legal hold;
//   - after the strike bound it marks the replica durability-unfit, invokes
//     the injected unfitness hook LOUDLY (the replica handler wires this to
//     requestTrackedPartitionLeaderHandoff), and keeps re-asserting candidacy
//     deferral while unfit (an alive zombie's in-memory log matches the
//     followers', so vote rules do NOT disfavor it — re-assertion is what
//     prevents the CL-033/034 re-election churn).
//
// HONEST SCOPE: detection + demotion signaling live here (this quest); the
// transaction-lifecycle HEAL (ACTIVE-hold sweep with follower-gated rollback)
// is the companion quest ledger-participant-transaction-zombie-lifecycle —
// a leader must NEVER bare-rollback (it re-mints acked indices and followers
// truncate committed entries), which is why demotion is the prerequisite.

const config = ConfigurationManager.getInstance();
config.initialize();
const logging = LoggingService.getInstance();
logging.initialize({level: 'error'});

const START_MS = 9_000_000;
// The max legal transaction hold (mirrors PREPARED_HOLD_TIMEOUT_MS /
// TRANSACTION_BUDGET_MS = 60s) plus the 3-strike cadence at the 1s sweep.
const LEGAL_HOLD_MS = 60_000;
const SWEEP_TICK_MS = 1_000;
const STRIKE_TICKS = 3;

let tmpDirCounter = 0;
function makeTmpDbPath(t) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), `dt6-durability-fitness-${tmpDirCounter++}-`),
  );
  t.teardown(() => fs.rmSync(dir, {recursive: true, force: true}));
  return path.join(dir, 'partition.db');
}

async function createLeaderPartition(t, {unfitEvents}) {
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
  if (typeof partition.setLeaderDurabilityUnfitHook === 'function') {
    partition.setLeaderDurabilityUnfitHook((evidence) => {
      unfitEvents.push(evidence);
    });
  }
  return partition;
}

function driveFitnessTicks(partition, {fromMs, ticks}) {
  const observed = [];
  for (let i = 0; i < ticks; i++) {
    const nowMs = fromMs + i * SWEEP_TICK_MS;
    if (typeof partition.enforceLeaderDurabilityFitness === 'function') {
      observed.push(partition.enforceLeaderDurabilityFitness(nowMs));
    } else {
      observed.push(null);
    }
  }
  return observed;
}

t.test(
  'run-23 physics: an abandoned participant BEGIN makes every later write ' +
    'non-durable while reads stay consistent (documents the zombie; green on ' +
    'any head)',
  async (t) => {
    const unfitEvents = [];
    const partition = await createLeaderPartition(t, {unfitEvents});
    try {
      await partition.beginTransaction('tx-zombie');
      // Sessionless write after the zombie opens: absorbed into the open
      // transaction — succeeds, visible to same-connection reads.
      await partition.executeQuery(
        'INSERT INTO replica_operations (id, value) VALUES (1, ?)',
        ['ghost'],
      );
      const sameConnection = await partition.executeQuery(
        'SELECT COUNT(*) AS cnt FROM replica_operations',
      );
      t.equal(
        sameConnection.rows[0].cnt,
        1,
        'the same connection sees the absorbed write (why replication and ' +
          'index minting stayed correct in run-23)',
      );
      t.equal(
        partition.db.inTransaction,
        true,
        'better-sqlite3 exposes the open transaction honestly (the detection signal)',
      );
      // A second, readonly connection sees only DURABLE state: nothing.
      const readonly = new Database(partition.dbPath, {readonly: true});
      try {
        const durable = readonly
          .prepare(
            'SELECT COUNT(*) AS cnt FROM sqlite_master ' +
              'WHERE name = \'replica_operations\'',
          )
          .get();
        const durableRows =
          durable.cnt === 0 ?
            0 :
            readonly
              .prepare('SELECT COUNT(*) AS cnt FROM replica_operations')
              .get().cnt;
        t.equal(
          durableRows,
          0,
          'a readonly second connection sees ZERO durable effect (run-23: ' +
            'followers/restart lose everything after the zombie opened)',
        );
      } finally {
        readonly.close();
      }
      await partition.rollbackTransaction().catch(() => {});
    } finally {
      await partition.shutdown();
    }
  },
);

t.test(
  'fitness contract: the durability detector marks the leader unfit after ' +
    'the strike bound and re-asserts candidacy deferral while unfit ' +
    '(RED on the unfixed head)',
  async (t) => {
    const unfitEvents = [];
    const partition = await createLeaderPartition(t, {unfitEvents});
    try {
      t.equal(
        typeof partition.enforceLeaderDurabilityFitness,
        'function',
        'the durability-fitness detector exists on the partition service',
      );
      t.equal(
        typeof partition.setLeaderDurabilityUnfitHook,
        'function',
        'the unfitness hook seam exists (replica handler wires it to the ' +
          'tracked leader handoff)',
      );
      // The single-replica fixture has no real successor; the probe seam is
      // what a cluster-informed caller supplies (CL-039 viability gate).
      if (typeof partition.setLeaderDurabilitySuccessorProbe === 'function') {
        partition.setLeaderDurabilitySuccessorProbe(() => true);
      }
      const deferCandidacyCalls = [];
      if (partition.raft && typeof partition.raft.deferCandidacy === 'function') {
        const original = partition.raft.deferCandidacy.bind(partition.raft);
        partition.raft.deferCandidacy = (...args) => {
          deferCandidacyCalls.push(args);
          return original(...args);
        };
      }

      await partition.beginTransaction('tx-zombie');
      // Healthy window: ticks well inside the legal hold must not detect.
      driveFitnessTicks(partition, {fromMs: START_MS + 1_000, ticks: 5});
      t.equal(
        unfitEvents.length,
        0,
        'no detection while the transaction is inside its legal hold',
      );

      // Past the legal hold: STRIKE_TICKS consecutive sweep ticks.
      driveFitnessTicks(partition, {
        fromMs: START_MS + LEGAL_HOLD_MS + SWEEP_TICK_MS,
        ticks: STRIKE_TICKS,
      });
      t.ok(
        unfitEvents.length >= 1,
        `the unfitness hook fired after ${STRIKE_TICKS} strikes past the ` +
          `legal hold (events: ${unfitEvents.length})`,
      );
      t.match(
        unfitEvents[0] || {},
        {partitionId: partition.partitionId},
        'the unfitness evidence names the partition',
      );
      t.equal(
        partition.isLeaderDurabilityUnfit === true,
        true,
        'the replica is marked durability-unfit',
      );

      // While unfit, every further tick re-asserts candidacy deferral — the
      // alive zombie is fully electable otherwise (its in-memory log matches
      // the followers'), which would re-elect it into CL-033/034 churn.
      const deferralsBefore = deferCandidacyCalls.length;
      driveFitnessTicks(partition, {
        fromMs: START_MS + LEGAL_HOLD_MS + 10 * SWEEP_TICK_MS,
        ticks: 3,
      });
      t.ok(
        deferCandidacyCalls.length > deferralsBefore,
        'candidacy deferral is re-asserted on ticks while unfit ' +
          `(${deferralsBefore} -> ${deferCandidacyCalls.length})`,
      );
      await partition.rollbackTransaction().catch(() => {});
    } finally {
      await partition.shutdown();
    }
  },
);

t.test(
  'control: a transaction that commits inside its legal hold never trips ' +
    'the detector',
  async (t) => {
    const unfitEvents = [];
    const partition = await createLeaderPartition(t, {unfitEvents});
    try {
      await partition.beginTransaction('tx-legal');
      await partition.executeQuery(
        'INSERT INTO replica_operations (id, value) VALUES (2, ?)',
        ['fine'],
        {sessionId: 'tx-legal'},
      ).catch(async () => {
        // Session plumbing differs across write paths; the transaction itself
        // is what the control needs — commit it promptly either way.
      });
      await partition.commitTransaction('tx-legal').catch(() => {});
      driveFitnessTicks(partition, {
        fromMs: START_MS + LEGAL_HOLD_MS + SWEEP_TICK_MS,
        ticks: STRIKE_TICKS + 2,
      });
      t.equal(
        unfitEvents.length,
        0,
        'no unfitness detection for a promptly committed transaction',
      );
      t.notOk(
        partition.isLeaderDurabilityUnfit === true,
        'the replica stays fit',
      );
    } finally {
      await partition.shutdown();
    }
  },
);

t.test(
  'control: strikes must be CONSECUTIVE — a transaction closing between ' +
    'ticks resets the count',
  async (t) => {
    const unfitEvents = [];
    const partition = await createLeaderPartition(t, {unfitEvents});
    try {
      if (typeof partition.enforceLeaderDurabilityFitness !== 'function') {
        t.equal(
          typeof partition.enforceLeaderDurabilityFitness,
          'function',
          'detector exists (red on the unfixed head)',
        );
        return;
      }
      await partition.beginTransaction('tx-blip');
      // One strike past the bound...
      partition.enforceLeaderDurabilityFitness(
        START_MS + LEGAL_HOLD_MS + SWEEP_TICK_MS,
      );
      // ...then the transaction resolves before the next tick.
      await partition.rollbackTransaction('tx-blip').catch(() => {});
      driveFitnessTicks(partition, {
        fromMs: START_MS + LEGAL_HOLD_MS + 2 * SWEEP_TICK_MS,
        ticks: STRIKE_TICKS + 2,
      });
      t.equal(
        unfitEvents.length,
        0,
        'a resolved transaction between ticks never accumulates to unfitness',
      );
    } finally {
      await partition.shutdown();
    }
  },
);

t.test(
  'control: without a viable successor the detector is SURFACE-ONLY — unfit ' +
    'and loud, but never deposed (a successor-less group must keep serving)',
  async (t) => {
    const unfitEvents = [];
    const partition = await createLeaderPartition(t, {unfitEvents});
    try {
      if (typeof partition.enforceLeaderDurabilityFitness !== 'function') {
        t.equal(
          typeof partition.enforceLeaderDurabilityFitness,
          'function',
          'detector exists (red on the unfixed head)',
        );
        return;
      }
      // No successor probe override: the single-replica default is not viable.
      await partition.beginTransaction('tx-zombie-lonely');
      // Anchor the observation, then cross the legal hold.
      driveFitnessTicks(partition, {fromMs: START_MS + 1_000, ticks: 1});
      driveFitnessTicks(partition, {
        fromMs: START_MS + 1_000 + LEGAL_HOLD_MS + SWEEP_TICK_MS,
        ticks: STRIKE_TICKS + 2,
      });
      t.equal(
        partition.isLeaderDurabilityUnfit,
        true,
        'the replica is marked unfit (and the ERROR log fired)',
      );
      t.equal(
        unfitEvents.length,
        0,
        'the demotion hook never fires without a viable successor',
      );
      t.equal(
        partition.role,
        RaftRole.LEADER,
        'the successor-less leader keeps serving (never deposed)',
      );
      await partition.rollbackTransaction().catch(() => {});
    } finally {
      await partition.shutdown();
    }
  },
);

t.test(
  'signal (b): declared-commit vs durable-watermark divergence must SUSTAIN ' +
    'the full legal hold before it counts (a legal in-session quorum commit ' +
    'diverges legally for the session length)',
  async (t) => {
    const unfitEvents = [];
    const partition = await createLeaderPartition(t, {unfitEvents});
    try {
      if (typeof partition.enforceLeaderDurabilityFitness !== 'function') {
        t.equal(
          typeof partition.enforceLeaderDurabilityFitness,
          'function',
          'detector exists (red on the unfixed head)',
        );
        return;
      }
      partition.setLeaderDurabilitySuccessorProbe(() => true);
      // The run-23 divergence shape at the adapter seam: commit intent
      // declared, durable watermark never advancing (the zombie swallowed
      // setCommittedIndex). Stamp the declared side directly — the fixture's
      // single-replica path never calls adapter.commit().
      partition.logAdapter.lastDeclaredCommitIndex = 149;

      // Divergence inside the legal window: NOT stuck (a healthy leader
      // running a legal participant session looks exactly like this).
      driveFitnessTicks(partition, {fromMs: START_MS + 1_000, ticks: 5});
      t.equal(
        unfitEvents.length,
        0,
        'legal-window divergence never accumulates strikes',
      );
      t.notOk(
        partition.isLeaderDurabilityUnfit === true,
        'the leader stays fit through a legal divergence window',
      );

      // Sustained past the legal hold: stuck.
      driveFitnessTicks(partition, {
        fromMs: START_MS + 1_000 + LEGAL_HOLD_MS + SWEEP_TICK_MS,
        ticks: STRIKE_TICKS,
      });
      t.ok(
        unfitEvents.length >= 1,
        'sustained divergence past the legal hold trips the detector',
      );
      t.match(
        unfitEvents[0] || {},
        {reason: 'leader_durability_unfit_commit_durability_divergence'},
        'the evidence carries the divergence reason',
      );
    } finally {
      await partition.shutdown();
    }
  },
);

t.test('single-replica leaders still become leader (fixture sanity)', async (t) => {
  const unfitEvents = [];
  const partition = await createLeaderPartition(t, {unfitEvents});
  try {
    t.equal(
      partition.role,
      RaftRole.LEADER,
      'the single-replica fixture partition is the raft leader',
    );
  } finally {
    await partition.shutdown();
  }
});
