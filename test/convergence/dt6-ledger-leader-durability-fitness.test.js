import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import t from 'tap';
import {
  PartitionService,
  RaftRole,
} from '../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {LEADER_DURABILITY_CONSEQUENCE_OUTCOME} from
  '../../src/partition/partition-service-durability-fitness.js';

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
// EXPLICIT UNAVAILABILITY ON THE RS-RAFT PORT (epic raft-rs-full-cutover,
// solve/epics/raft-rs-full-cutover/findings-2026-09-23.md, finding F1): the
// frozen operation port has neither a step-down nor a candidacy-deferral
// operation, so neither consequence of unfitness can be carried out. The
// fitness owner (src/partition/partition-service-durability-fitness.js)
// states each as a typed outcome in the unfitness evidence
// (leader_durability_demotion_unsupported /
// leader_durability_candidacy_deferral_unsupported) instead of a call that
// silently does nothing (R11). The subtests that asserted a demotion or a
// re-asserted candidacy deferral are therefore witnesses of those typed
// outcomes: the evidence carries them, the role stays leader on the port, and
// the role-gated heal stays closed. They turn back into the demotion contract
// when the F1 owner quest gives the port the two semantic operations.
//
// The run-23 physics (a sessionless write silently absorbed into the zombie)
// is likewise explicit now: with consensus persistence admitted only outside
// a user session on the partition connection (finding F6, layer 1), the
// write is refused with the typed, retryable user-transaction deferral and
// nothing is absorbed.
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
// C3 bounded fallback (quest formation-ledger-self-move-blocks-cluster-ops):
// a multi-member leader that stays successorless-unfit for this long is
// demoted anyway. Mirrors LEADER_DURABILITY_SUCCESSORLESS_DEMOTION_FALLBACK_MS.
const SUCCESSORLESS_FALLBACK_TICKS = 15;
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
  'run-23 physics, explicit on rs-raft: a sessionless write after an ' +
    'abandoned participant BEGIN is refused with the typed user-transaction ' +
    'deferral instead of being silently absorbed into the zombie (F6 layer 1)',
  async (t) => {
    const unfitEvents = [];
    const partition = await createLeaderPartition(t, {unfitEvents});
    try {
      await partition.beginTransaction('tx-zombie');
      // Sessionless write after the zombie opens. In run-23 it was absorbed
      // into the open transaction (in-memory success, same-connection reads
      // consistent, zero durability). Consensus persistence is now admitted
      // only outside a user session on the partition connection, so the
      // write is refused, typed and retryable - explicit, not silent.
      const sessionlessWrite = await partition.executeQuery(
        'INSERT INTO replica_operations (id, value) VALUES (1, ?)',
        ['ghost'],
      );
      t.match(
        sessionlessWrite,
        {
          success: false,
          deferRetry: true,
          error: PARTITION_SERVICE_ERROR_MSG.WRITE_DEFERRED_USER_TRANSACTION_OPEN,
        },
        'the sessionless write is refused with the typed, retryable ' +
          'user-transaction deferral (never absorbed into the zombie)',
      );
      const sameConnection = await partition.executeQuery(
        'SELECT COUNT(*) AS cnt FROM replica_operations',
      );
      t.equal(
        sameConnection.rows[0].cnt,
        0,
        'the same connection sees no absorbed write (nothing was applied ' +
          'inside the zombie)',
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
      // what a cluster-informed caller supplies (CL-039 viability gate). The
      // group SHAPE is widened too: candidacy deferral is deliberately
      // skipped for solo groups (deferring the only possible leader leaves
      // none), so the re-assertion contract needs a multi-member shape.
      if (typeof partition.setLeaderDurabilitySuccessorProbe === 'function') {
        partition.setLeaderDurabilitySuccessorProbe(() => true);
      }
      partition.replicaIds = ['replica-1', 'replica-2', 'replica-3'];

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

      // While unfit, every further tick would re-assert candidacy deferral —
      // the alive zombie is fully electable otherwise (its in-memory log
      // matches the followers'), which would re-elect it into CL-033/034
      // churn. The frozen port has no candidacy-deferral operation (F1): the
      // unavailability is the typed outcome the evidence carries, and every
      // further tick keeps reporting the replica unfit.
      t.equal(
        partition.raft.deferCandidacy,
        undefined,
        'the frozen operation port carries no candidacy-deferral operation (F1)',
      );
      t.equal(
        unfitEvents[0]?.candidacyDeferral,
        LEADER_DURABILITY_CONSEQUENCE_OUTCOME.CANDIDACY_DEFERRAL_UNSUPPORTED,
        'the unfitness evidence states candidacy deferral as the typed ' +
          'unsupported outcome, not a silent no-op call',
      );
      const unfitTicks = driveFitnessTicks(partition, {
        fromMs: START_MS + LEGAL_HOLD_MS + 10 * SWEEP_TICK_MS,
        ticks: 3,
      });
      t.same(
        unfitTicks.map((observation) => observation?.fit),
        [false, false, false],
        'every further tick while unfit keeps the replica unfit',
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
  'control: a SOLO group without a viable successor is SURFACE-ONLY forever ' +
    '— unfit and loud, but never deposed (deposing the only replica leaves ' +
    'no leader, and its heal is already permitted in place)',
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
      // Anchor the observation, then cross the legal hold — and keep going
      // well past the C3 successorless-demotion fallback bound: a SOLO group
      // is structurally exempt from the fallback, not merely inside it.
      driveFitnessTicks(partition, {fromMs: START_MS + 1_000, ticks: 1});
      driveFitnessTicks(partition, {
        fromMs: START_MS + 1_000 + LEGAL_HOLD_MS + SWEEP_TICK_MS,
        ticks: STRIKE_TICKS + SUCCESSORLESS_FALLBACK_TICKS + 5,
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
  'C3 bounded fallback: a MULTI-MEMBER leader that stays successorless-unfit ' +
    'past the bound hands the hook the fallback evidence with the typed ' +
    'demotion-unsupported outcome; the seat and the closed heal gate are ' +
    'explicit until the port can step down (F1)',
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
      // Multi-member group SHAPE (the same widening as the fitness-contract
      // subtest): membership has followers, so the group is NOT solo — but
      // there is NO successor probe override and no follower acks, so the
      // default 10s-ack-window viability probe reports successorViable:false
      // on every tick. This is the live r4 mechanism (quest formation-ledger-
      // self-move-blocks-cluster-ops, 2026-07-06 artifact): the wedged leader
      // itself starves follower-ack evidence, so ack-recency viability can
      // never be proven even though membership holds active voters — the
      // demotion never fires, the role-gated heal never opens, and the ledger
      // leader stays wedged for the rest of the run.
      partition.replicaIds = ['replica-1', 'replica-2', 'replica-3'];

      await partition.beginTransaction('tx-zombie-successorless');
      // Anchor the observation, then cross the legal hold and strike out.
      driveFitnessTicks(partition, {fromMs: START_MS + 1_000, ticks: 1});
      const strikeBaseMs = START_MS + 1_000 + LEGAL_HOLD_MS + SWEEP_TICK_MS;
      driveFitnessTicks(partition, {fromMs: strikeBaseMs, ticks: STRIKE_TICKS});
      t.equal(
        partition.isLeaderDurabilityUnfit,
        true,
        'the leader is marked durability-unfit',
      );
      t.equal(
        partition.role,
        RaftRole.LEADER,
        'inside the fallback bound the successorless leader keeps the seat ' +
          '(the surface-only window still applies)',
      );
      t.equal(
        unfitEvents.length,
        0,
        'inside the fallback bound no demotion is decided (the hook has not ' +
          'fired)',
      );

      // Hold the successorless-unfit condition past the bounded fallback.
      driveFitnessTicks(partition, {
        fromMs: strikeBaseMs + STRIKE_TICKS * SWEEP_TICK_MS,
        ticks: SUCCESSORLESS_FALLBACK_TICKS + 2,
      });
      // Past the bound the C3 fallback decides to demote even without a
      // provable successor (an unfit leader that starves ack evidence must
      // not hold the seat forever). The port has no step-down operation
      // (F1), so the decision is stated as the typed outcome and the seat is
      // not silently kept as if nothing had been decided.
      t.equal(
        unfitEvents[0]?.demotion,
        LEADER_DURABILITY_CONSEQUENCE_OUTCOME.DEMOTION_UNSUPPORTED,
        'past the bound the fallback demotion is decided and stated as the ' +
          'typed demotion-unsupported outcome (F1: no step-down on the port)',
      );
      t.equal(
        partition.raft.readStatus().role,
        RaftRole.LEADER,
        'the consensus core still holds the seat: no demotion was carried ' +
          'out behind the typed outcome',
      );
      t.ok(
        unfitEvents.length >= 1,
        'the demotion hook fired with the fallback evidence',
      );
      t.equal(
        unfitEvents[0]?.successorViable,
        false,
        'the evidence records that no successor was provable',
      );

      // The consequence of the unavailable demotion: the shipped role-gated
      // heal stays closed on a leader (a leader never bare-rollbacks), so the
      // zombie is NOT rolled back on this node.
      const healedCount = partition.enforcePreparedStateHoldTimeouts(
        Date.now() + LEGAL_HOLD_MS + 2_000,
      );
      t.equal(
        healedCount,
        0,
        'the ACTIVE-hold sweep does not heal while the node still leads',
      );
      t.equal(
        partition.db.inTransaction,
        true,
        'the stuck transaction is not bare-rolled-back on the leader',
      );
      // Once the zombie is gone (here: its session owner rolls it back),
      // fitness recovers on the next tick.
      await partition.rollbackTransaction('tx-zombie-successorless');
      t.equal(
        partition.db.inTransaction,
        false,
        'the session owner\'s rollback ends the zombie transaction',
      );
      driveFitnessTicks(partition, {
        fromMs: strikeBaseMs + 60 * SWEEP_TICK_MS,
        ticks: 1,
      });
      t.notOk(
        partition.isLeaderDurabilityUnfit === true,
        'durability fitness recovers once the zombie is gone',
      );
    } finally {
      await partition.shutdown();
    }
  },
);

t.test(
  'C3 control: a successor becoming viable during the fallback wait hands ' +
    'off on the very next tick (the normal viable-successor handoff owns it; ' +
    'demotion itself is the typed unsupported outcome, F1)',
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
      partition.replicaIds = ['replica-1', 'replica-2', 'replica-3'];
      let probeViable = false;
      partition.setLeaderDurabilitySuccessorProbe(() => probeViable);

      await partition.beginTransaction('tx-zombie-flicker');
      driveFitnessTicks(partition, {fromMs: START_MS + 1_000, ticks: 1});
      const strikeBaseMs = START_MS + 1_000 + LEGAL_HOLD_MS + SWEEP_TICK_MS;
      driveFitnessTicks(partition, {fromMs: strikeBaseMs, ticks: STRIKE_TICKS});
      t.equal(partition.isLeaderDurabilityUnfit, true, 'unfit detected');

      // Run most of the fallback window successorless...
      driveFitnessTicks(partition, {
        fromMs: strikeBaseMs + STRIKE_TICKS * SWEEP_TICK_MS,
        ticks: SUCCESSORLESS_FALLBACK_TICKS - 5,
      });
      t.equal(
        partition.role,
        RaftRole.LEADER,
        'still leader inside the fallback bound',
      );
      t.equal(
        unfitEvents.length,
        0,
        'no handoff inside the fallback bound while no successor is provable',
      );
      // ...then a successor becomes provable: the NORMAL demotion path fires
      // on the next tick (this is the pre-C3 contract, unchanged).
      probeViable = true;
      driveFitnessTicks(partition, {
        fromMs:
          strikeBaseMs +
          (STRIKE_TICKS + SUCCESSORLESS_FALLBACK_TICKS - 5) * SWEEP_TICK_MS,
        ticks: 1,
      });
      t.match(
        unfitEvents[0] || {},
        {
          successorViable: true,
          demotion: LEADER_DURABILITY_CONSEQUENCE_OUTCOME.DEMOTION_UNSUPPORTED,
        },
        'the viable-successor handoff is decided immediately (no fallback ' +
          'wait) and its demotion is the typed unsupported outcome (F1)',
      );
      t.equal(
        partition.raft.readStatus().role,
        RaftRole.LEADER,
        'no demotion was carried out behind the typed outcome',
      );
      t.ok(unfitEvents.length >= 1, 'the demotion hook fired');
      await partition.rollbackTransaction().catch(() => {});
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
