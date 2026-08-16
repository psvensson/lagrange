import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {PartitionRaftStorage} from
  '../../src/partition/partition-raft-storage.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {RAFT_COMPACTION_OUTCOME} from '../../src/raft/compaction-policy.js';
import {
  buildSnapshotCatchupDecision,
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME,
} from '../../src/raft/snapshot-catchup-constants.js';
import {
  dispatchSnapshotCatchup,
  listInFlightGenerationIndexes,
} from '../../src/raft/snapshot-catchup.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
} from '../../src/raft/snapshot-checkpoint-constants.js';
import {
  createSqliteStateMachineCheckpoint,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {
  RAFT_SNAPSHOT_TRANSFER_OUTCOME,
} from '../../src/raft/snapshot-transfer-constants.js';
import {receiveSnapshotTransfer} from '../../src/raft/snapshot-transfer.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {
  createInProcWebSocketPair,
} from '../../src/transport/inproc-transport.js';
import {installSealedGeneration} from './snapshot-catchup-fixture.js';

// S5 integration (quest raft-snapshot-retention-compaction): a leader that
// PHYSICALLY compacted its committed prefix at K (with proof) still closes
// the S4 catch-up loop — a follower below K draws the typed install_snapshot
// decision, the dispatch serves the proof generation, the follower installs
// and resumes exactly at K+1, and ordinary above-K catch-up still batches.
// The refuted stale-boundary hazard is pinned: a SECOND adapter facade over
// the same database, primed BEFORE compaction, answers has/getLastInfo/
// getEntryInfoBefore correctly AFTER compaction via refresh-on-row-miss.
// Post-compaction checkpoint creation seals a non-regressed maxCommittedHlc,
// and a PREPARE+COMMIT pair fully below K compacts without breaking later
// creation (prepared-gate transitivity).

const PARTITION_ID = 'compaction_catchup-p1';
const STATE_TABLE = 'compaction_catchup';
const TERM = 5;
const BOUNDARY_ENTRY_COUNT = 3;
const HEAD_ENTRY_COUNT = 5;
const HLC_BASE_MS = 1710000000000;
const HLC_STEP_MS = 1000;
const LEADER_ADDRESS = 'node-l/partition/compaction_catchup-p1-r1';
const FOLLOWER_ADDRESS = 'node-f/partition/compaction_catchup-p1-r2';
// Second lagging follower for the above-K probe (the per-follower in-flight
// batch dedupe would otherwise absorb a second fail from the same address).
const LAGGING_ADDRESS = 'node-g/partition/compaction_catchup-p1-r3';
const SESSION_ID = 'compaction-2pc-session';
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-compaction-catchup',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: 3,
});
const HUGE_TIMERS = Object.freeze({
  'heartbeat': '10s',
  'election min': '20s',
  'election max': '30s',
});

// Descending clocks: the rows DELETED by compaction carry the largest HLCs,
// so a regressed post-compaction seal is detectable.
function rowHlc(ordinal) {
  return new HLCTimestamp(
    HLC_BASE_MS - (ordinal * HLC_STEP_MS), ordinal, 'catchup-node');
}

function plainCommand(ordinal) {
  return {sql: `row-${ordinal}`, timestamp: rowHlc(ordinal).toString()};
}

function commitApplyCommand(context, ordinal, command) {
  const entry = context.adapter.saveCommand(command, TERM);
  context.adapter.commit(entry.index);
  context.db.prepare(
    `INSERT INTO ${STATE_TABLE} (id, payload) VALUES (?, ?)`,
  ).run(`row-${ordinal}`, `payload-${ordinal}`);
  context.storage.recordAppliedAdvance();
  return entry;
}

// Leader replica: `boundaryCommands` committed+applied, a sealed proof
// generation at the boundary, `headCommands` more above it, then a
// proof-gated physical compaction at the boundary.
async function createCompactedLeaderContext(options = {}) {
  const boundaryCommands = options.boundaryCommands ??
    [1, 2, 3].map((ordinal) => plainCommand(ordinal));
  const workDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'raft-compaction-catchup-'));
  const checkpointsRoot = path.join(workDir, 'checkpoints');
  const dbPath = path.join(workDir, 'leader.db');
  const db = new Database(dbPath);
  const adapter = new SQLiteLogAdapter(db, {address: PARTITION_ID, term: TERM});
  const storage = new PartitionRaftStorage(db, PARTITION_ID, adapter);
  db.exec(`CREATE TABLE IF NOT EXISTS ${STATE_TABLE} ` +
    '(id TEXT PRIMARY KEY, payload TEXT)');
  const context = {db, adapter, storage};
  boundaryCommands.forEach((command, position) =>
    commitApplyCommand(context, position + 1, command));
  const created = await createSqliteStateMachineCheckpoint(
    {db, identity: IDENTITY, checkpointsRoot});
  for (let ordinal = BOUNDARY_ENTRY_COUNT + 1;
    ordinal <= HEAD_ENTRY_COUNT; ordinal += 1) {
    commitApplyCommand(context, ordinal, plainCommand(ordinal));
  }
  const compacted = adapter.compactCommittedEntries({
    toIndex: BOUNDARY_ENTRY_COUNT,
    proof: {checkpointDir: created.checkpointDir},
  });
  return {
    workDir,
    checkpointsRoot,
    dbPath,
    db,
    adapter,
    storage,
    created,
    compacted,
    close() {
      db.close();
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

function promoteLeaderRaft(adapter, raftOptions = {}) {
  const raft = new LifeRaft(LEADER_ADDRESS, {
    ...HUGE_TIMERS,
    'Log': function SQLiteLogFactory() {
      return adapter;
    },
    ...raftOptions,
  });
  raft.change({state: LifeRaft.LEADER, term: TERM});
  return raft;
}

async function driveAppendFail(raft, followerLast, failedIndex, options = {}) {
  const incoming = raft.listeners('data')[0];
  const writes = [];
  await incoming({
    type: 'append fail',
    term: TERM,
    state: LifeRaft.FOLLOWER,
    address: options.address ?? FOLLOWER_ADDRESS,
    leader: raft.address,
    last: followerLast,
    data: {index: failedIndex, term: TERM},
  }, (packet) => writes.push(packet ?? null));
  return writes;
}

test('a compacted leader completes the S4 loop and resumes at K+1',
  async (t) => {
    const leader = await createCompactedLeaderContext();
    const followerWorkDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'raft-compaction-follower-'));
    const decisions = [];
    const raft = promoteLeaderRaft(leader.adapter, {
      onSnapshotCatchupNeeded: (decision) => decisions.push(decision),
    });
    let followerDb = null;
    let followerRaft = null;
    try {
      t.equal(leader.compacted.outcome, RAFT_COMPACTION_OUTCOME.COMPACTED,
        'anti-vacuous: the leader really compacted at K');
      t.equal(leader.db.prepare(
        'SELECT MIN(log_index) AS m FROM _raft_log').get().m,
      BOUNDARY_ENTRY_COUNT + 1,
      'anti-vacuous: the leader prefix at or below K is physically gone');

      // A fresh follower below K draws the typed install_snapshot decision.
      const writes = await driveAppendFail(
        raft, {index: 0, term: 0}, BOUNDARY_ENTRY_COUNT + 1);
      t.same(writes, [null], 'the append-fail is consumed without a batch');
      t.equal(decisions.length, 1, 'exactly one decision is emitted');
      t.equal(decisions[0].outcome,
        RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
        'the compacted leader emits install_snapshot');
      t.equal(decisions[0].leaderBoundary, BOUNDARY_ENTRY_COUNT,
        'the decision carries the COMPACTED boundary');

      // Dispatch serves the proof generation over an in-process pair.
      const followerRoot = path.join(followerWorkDir, 'checkpoints');
      const followerDbPath = path.join(followerWorkDir, 'follower.db');
      const {a, b} = createInProcWebSocketPair();
      const [dispatched, received] = await Promise.all([
        dispatchSnapshotCatchup({
          decision: decisions[0],
          checkpointsRoot: leader.checkpointsRoot,
          identity: IDENTITY,
          db: leader.db,
          socketProvider: () => a,
        }),
        receiveSnapshotTransfer({
          socket: b,
          checkpointsRoot: followerRoot,
          expectedIdentity: IDENTITY,
        }),
      ]);
      t.equal(dispatched.outcome,
        RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED,
        'the dispatch serves to completion from the compacted leader');
      t.equal(dispatched.generationIndex, BOUNDARY_ENTRY_COUNT,
        'the served generation is the compaction proof generation');
      t.equal(received.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
        'the follower-side receive completes');

      // Install into the fresh follower and resume through a real batch.
      await installSealedGeneration({
        replicaDbPath: followerDbPath,
        checkpointsRoot: followerRoot,
        generationIndex: BOUNDARY_ENTRY_COUNT,
        identity: IDENTITY,
      });
      followerDb = new Database(followerDbPath);
      const followerAdapter = new SQLiteLogAdapter(
        followerDb, {address: PARTITION_ID, term: TERM});
      t.same(followerAdapter.getSnapshotBoundary(), {
        lastIncludedIndex: BOUNDARY_ENTRY_COUNT,
        lastIncludedTerm: TERM,
      }, 'the installed follower boots at the compaction boundary');
      followerRaft = new LifeRaft(FOLLOWER_ADDRESS, {
        ...HUGE_TIMERS,
        'Log': function FollowerLogFactory() {
          return followerAdapter;
        },
      });
      followerRaft.message = () => followerRaft;
      followerRaft.change({term: TERM});

      const batchWrites = await driveAppendFail(
        raft,
        {index: BOUNDARY_ENTRY_COUNT, term: TERM,
          committedIndex: BOUNDARY_ENTRY_COUNT},
        BOUNDARY_ENTRY_COUNT + 1);
      t.equal(batchWrites.length, 1, 'the resume cycle writes one reply');
      t.equal(batchWrites[0]?.type, 'append', 'the reply is a real batch');
      t.equal(batchWrites[0].data[0].index, BOUNDARY_ENTRY_COUNT + 1,
        'the batch starts exactly at K+1');
      t.equal(batchWrites[0].data[batchWrites[0].data.length - 1].index,
        HEAD_ENTRY_COUNT, 'the batch runs to the leader head');

      await followerRaft.listeners('data')[0](batchWrites[0], () => {});
      await new Promise((resolve) => setTimeout(resolve, 20));
      t.equal(followerAdapter.getLastInfo().index, HEAD_ENTRY_COUNT,
        'the follower log resumes through the leader head');
      t.equal(followerDb.prepare(
        'SELECT MIN(log_index) AS m FROM _raft_log').get().m,
      BOUNDARY_ENTRY_COUNT + 1,
      'nothing below K+1 was ever appended — resume is exact');

      // Ordinary above-K catch-up still batches (no install decision).
      const aboveK = await driveAppendFail(
        raft,
        {index: BOUNDARY_ENTRY_COUNT + 1, term: TERM,
          committedIndex: BOUNDARY_ENTRY_COUNT + 1},
        BOUNDARY_ENTRY_COUNT + 2,
        {address: LAGGING_ADDRESS});
      t.equal(aboveK[0]?.type, 'append',
        'an above-K lagging follower still gets a plain batch');
      t.equal(aboveK[0].data[0].index, BOUNDARY_ENTRY_COUNT + 2,
        'the above-K batch fast-forwards to the follower position');
      t.equal(decisions.length, 1,
        'no further install decision was emitted');
    } finally {
      if (followerRaft) followerRaft.end();
      if (followerDb) followerDb.close();
      raft.end();
      leader.close();
      fs.rmSync(followerWorkDir, {recursive: true, force: true});
    }
  });

test('a second stale facade answers correctly after compaction (refresh-on-miss)',
  async (t) => {
    const leader = await createCompactedLeaderContext();
    let staleDb = null;
    try {
      t.equal(leader.compacted.outcome, RAFT_COMPACTION_OUTCOME.COMPACTED,
        'anti-vacuous: the first compaction landed');
      staleDb = new Database(leader.dbPath);
      const stale = new SQLiteLogAdapter(
        staleDb, {address: PARTITION_ID, term: TERM});
      // Prime the stale caches: the facade remembers the durable state as it
      // is NOW; the next compaction will invalidate neither cache on it.
      t.same(stale.getSnapshotBoundary(), {
        lastIncludedIndex: BOUNDARY_ENTRY_COUNT,
        lastIncludedTerm: TERM,
      }, 'the second facade primes its boundary cache');
      t.equal(stale.getCommittedIndex(), HEAD_ENTRY_COUNT,
        'the second facade primes its committed cache');

      // Second compaction on the FIRST facade: seal a proof at the head,
      // then compact everything — the log goes compacted-empty.
      const headProof = await createSqliteStateMachineCheckpoint({
        db: leader.db,
        identity: IDENTITY,
        checkpointsRoot: leader.checkpointsRoot,
      });
      t.equal(headProof.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        'a head proof generation seals');
      const compacted = leader.adapter.compactCommittedEntries({
        toIndex: HEAD_ENTRY_COUNT,
        proof: {checkpointDir: headProof.checkpointDir},
      });
      t.equal(compacted.outcome, RAFT_COMPACTION_OUTCOME.COMPACTED,
        'the head compaction lands on the first facade');
      t.equal(leader.db.prepare(
        'SELECT COUNT(*) AS n FROM _raft_log').get().n, 0,
      'anti-vacuous: the log is now compacted-empty');

      // The refuted hazard, pinned: the STALE facade must not resurrect the
      // b2 livelock (has false), disable the prev-log check, or break the
      // CL-042 compacted-empty last-log identity.
      t.equal(stale.has(BOUNDARY_ENTRY_COUNT + 1), true,
        'stale facade: has(k<=K) refreshes and answers compacted lineage');
      t.equal(stale.has(1), true,
        'stale facade: the deepest compacted index still answers true');
      t.equal(stale.has(0), false, 'stale facade: has(0) stays false');
      t.same(stale.getLastInfo(), {
        index: HEAD_ENTRY_COUNT,
        term: TERM,
        committedIndex: HEAD_ENTRY_COUNT,
      }, 'stale facade: getLastInfo answers the advanced boundary identity');
      t.same(stale.getLastEntry(), {
        index: HEAD_ENTRY_COUNT,
        term: TERM,
      }, 'stale facade: getLastEntry floors at the advanced boundary');
      t.same(stale.getEntryInfoBefore({index: HEAD_ENTRY_COUNT + 1}), {
        index: HEAD_ENTRY_COUNT,
        term: TERM,
        committedIndex: HEAD_ENTRY_COUNT,
      }, 'stale facade: getEntryInfoBefore(K+1) floors at {K, termK}');
    } finally {
      if (staleDb) staleDb.close();
      leader.close();
    }
  });

test('the single-flight registry exposes the served generation as a pin',
  async (t) => {
    const leader = await createCompactedLeaderContext();
    const receiverDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'raft-compaction-pins-'));
    try {
      const inflightByFollower = new Map();
      inflightByFollower.set('node-pending', true);
      t.same(listInFlightGenerationIndexes(inflightByFollower), [],
        'a selection-pending placeholder is not a generation pin');
      const pinsAtDialTime = [];
      const {a, b} = createInProcWebSocketPair();
      const [dispatched, received] = await Promise.all([
        dispatchSnapshotCatchup({
          decision: buildSnapshotCatchupDecision({
            outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
            followerAddress: FOLLOWER_ADDRESS,
            startIndex: 1,
            failedIndex: BOUNDARY_ENTRY_COUNT,
            leaderBoundary: BOUNDARY_ENTRY_COUNT,
          }),
          checkpointsRoot: leader.checkpointsRoot,
          identity: IDENTITY,
          db: leader.db,
          inflightByFollower,
          socketProvider: () => {
            // Selection already happened (recorded synchronously, no await
            // in between), so the sweep pin is visible BEFORE any serving IO.
            pinsAtDialTime.push(
              ...listInFlightGenerationIndexes(inflightByFollower));
            return a;
          },
        }),
        receiveSnapshotTransfer({
          socket: b,
          checkpointsRoot: receiverDir,
          expectedIdentity: IDENTITY,
        }),
      ]);
      t.equal(dispatched.outcome,
        RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED,
        'the dispatch serves to completion');
      t.equal(received.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
        'the receive completes');
      t.same(pinsAtDialTime, [BOUNDARY_ENTRY_COUNT],
        'the in-flight registry carried the resolved generation index as ' +
        'its value while the transfer was being served');
      t.same(listInFlightGenerationIndexes(inflightByFollower), [],
        'the pin is released when the dispatch settles');
    } finally {
      fs.rmSync(receiverDir, {recursive: true, force: true});
      leader.close();
    }
  });

test('post-compaction checkpoint creation cannot regress the sealed clock',
  async (t) => {
    const leader = await createCompactedLeaderContext();
    try {
      // The DELETED rows carried the largest HLCs; without the compaction
      // fold a later checkpoint would seal max(rows above K) — a REGRESSED
      // clock. The fold makes creation transitively exact.
      const preCompactionMax = rowHlc(1).toString();
      const created = await createSqliteStateMachineCheckpoint({
        db: leader.db,
        identity: IDENTITY,
        checkpointsRoot: leader.checkpointsRoot,
      });
      t.equal(created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        'post-compaction creation seals');
      t.equal(created.descriptor.lastIncludedIndex, HEAD_ENTRY_COUNT,
        'the new generation seals at the head');
      t.equal(created.descriptor.maxCommittedHlc, preCompactionMax,
        'the sealed maxCommittedHlc equals the pre-compaction maximum ' +
        '(non-regression through the deleted rows)');
    } finally {
      leader.close();
    }
  });

test('a PREPARE+COMMIT pair fully below K compacts fine (gate transitivity)',
  async (t) => {
    const leader = await createCompactedLeaderContext({
      boundaryCommands: [
        {
          type: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
          sessionId: SESSION_ID,
          sql: 'row-1',
          timestamp: rowHlc(1).toString(),
        },
        {
          type: PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT,
          sessionId: SESSION_ID,
          sql: 'row-2',
          timestamp: rowHlc(2).toString(),
        },
        plainCommand(3),
      ],
    });
    try {
      t.equal(leader.created.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        'the boundary proof seals over the DECIDED pair');
      t.equal(leader.compacted.outcome, RAFT_COMPACTION_OUTCOME.COMPACTED,
        'the prefix holding the decided pair compacts');
      const recheck = await createSqliteStateMachineCheckpoint({
        db: leader.db,
        identity: IDENTITY,
        checkpointsRoot: leader.checkpointsRoot,
      });
      t.equal(recheck.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        'creation still succeeds after the pair\'s rows are gone — the ' +
        'prepared gate is transitively sound');
    } finally {
      leader.close();
    }
  });
