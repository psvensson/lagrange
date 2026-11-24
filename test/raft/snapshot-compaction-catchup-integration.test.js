import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {RAFT_COMPACTION_OUTCOME} from '../../src/raft/compaction-policy.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  RaftRsPeerIdentityRegistry,
} from '../../src/raft/raft-rs-peer-identity.js';
import {
  compactRaftRsCommittedEntries,
} from '../../src/raft/snapshot-compaction.js';
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
import {
  createInProcWebSocketPair,
} from '../../src/transport/inproc-transport.js';
import {
  installSealedGeneration,
} from './snapshot-catchup-fixture.js';

// S5 integration (quest raft-snapshot-retention-compaction): a replica that
// PHYSICALLY compacted its committed prefix at K (with proof) still serves a
// typed install_snapshot decision, transfers the proof generation, and lets a
// fresh follower install and reopen exactly at the compacted boundary.
// Post-compaction checkpoint creation seals a non-regressed maxCommittedHlc.

const PARTITION_ID = 'compaction_catchup-p1';
const STATE_TABLE = 'compaction_catchup';
const TERM = 5;
const BOUNDARY_ENTRY_COUNT = 3;
const HEAD_ENTRY_COUNT = 5;
const HLC_BASE_MS = 1710000000000;
const HLC_STEP_MS = 1000;
const FOLLOWER_ADDRESS = 'node-f/partition/compaction_catchup-p1-r2';
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-compaction-catchup',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: 3,
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

function seedRaftRsLeaderDatabase(db, headEntryCount) {
  const registry = new RaftRsPeerIdentityRegistry(db);
  const leaderPeer = registry.registerReplica(`${PARTITION_ID}-r1`);
  const followerPeer = registry.registerReplica(`${PARTITION_ID}-r2`);
  const confState = {
    voters: [leaderPeer, followerPeer],
    learners: [],
    votersOutgoing: [],
    learnersNext: [],
    autoLeave: false,
  };
  const store = new RaftRsDurableStore(db);
  db.exec(`CREATE TABLE IF NOT EXISTS ${STATE_TABLE} ` +
    '(id TEXT PRIMARY KEY, payload TEXT)');
  const entries = [];
  for (let ordinal = 1; ordinal <= headEntryCount; ordinal += 1) {
    db.prepare(
      `INSERT INTO ${STATE_TABLE} (id, payload) VALUES (?, ?)`,
    ).run(`row-${ordinal}`, `payload-${ordinal}`);
    entries.push({
      index: String(ordinal),
      term: String(TERM),
      entryType: 0,
      data: Buffer.from(JSON.stringify(plainCommand(ordinal)))
        .toString('base64'),
    });
  }
  store.transaction(() => {
    store.putBootstrapAppliedState(PARTITION_ID, confState, {
      bootstrapIndex: '0',
      admissionIndex: '0',
      membershipGenerationIndex: '0',
    });
    store.appendEntries(PARTITION_ID, entries);
    store.putAppliedState(
      PARTITION_ID,
      String(BOUNDARY_ENTRY_COUNT),
      confState,
      undefined,
      String(IDENTITY.membershipEpoch),
    );
    store.putHardState(PARTITION_ID, {
      term: String(TERM),
      vote: '0',
      commit: String(headEntryCount),
    });
  });
  return {confState, store};
}

// Leader replica: BOUNDARY_ENTRY_COUNT committed+applied, a sealed raft-rs
// proof generation at the boundary, HEAD_ENTRY_COUNT total applied, then a
// proof-gated physical compaction at the boundary.
async function createCompactedLeaderContext() {
  const workDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'raft-compaction-catchup-'));
  const checkpointsRoot = path.join(workDir, 'checkpoints');
  const dbPath = path.join(workDir, 'leader.db');
  const db = new Database(dbPath);
  const {confState, store} = seedRaftRsLeaderDatabase(db, HEAD_ENTRY_COUNT);
  const created = await createSqliteStateMachineCheckpoint({
    db,
    identity: IDENTITY,
    checkpointsRoot,
    raftRsGroupId: PARTITION_ID,
  });
  store.putAppliedState(
    PARTITION_ID,
    String(HEAD_ENTRY_COUNT),
    confState,
    undefined,
    String(IDENTITY.membershipEpoch),
  );
  const compacted = compactRaftRsCommittedEntries(db, PARTITION_ID, {
    toIndex: BOUNDARY_ENTRY_COUNT,
    proof: {checkpointDir: created.checkpointDir},
  });
  return {
    workDir,
    checkpointsRoot,
    dbPath,
    db,
    created,
    compacted,
    close() {
      db.close();
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

test('a compacted leader serves and installs its sealed boundary snapshot',
  async (t) => {
    const leader = await createCompactedLeaderContext();
    const followerWorkDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'raft-compaction-follower-'));
    let followerDb = null;
    try {
      t.equal(leader.compacted.outcome, RAFT_COMPACTION_OUTCOME.COMPACTED,
        'anti-vacuous: the leader really compacted at K');
      t.equal(leader.db.prepare(
        'SELECT MIN(log_index) AS m FROM _raft_rs_log WHERE group_id = ?',
      ).get(PARTITION_ID).m,
      BOUNDARY_ENTRY_COUNT + 1,
      'anti-vacuous: the leader prefix at or below K is physically gone');

      const decision = buildSnapshotCatchupDecision({
        outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
        followerAddress: FOLLOWER_ADDRESS,
        startIndex: 1,
        failedIndex: BOUNDARY_ENTRY_COUNT + 1,
        leaderBoundary: BOUNDARY_ENTRY_COUNT,
      });
      t.equal(decision.outcome,
        RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
        'the backend-neutral decision names snapshot installation');
      t.equal(decision.leaderBoundary, BOUNDARY_ENTRY_COUNT,
        'the decision carries the compacted boundary');

      const followerRoot = path.join(followerWorkDir, 'checkpoints');
      const followerDbPath = path.join(followerWorkDir, 'follower.db');
      const {a, b} = createInProcWebSocketPair();
      const [dispatched, received] = await Promise.all([
        dispatchSnapshotCatchup({
          decision,
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
        'the dispatch serves the sealed compaction proof generation');
      t.equal(dispatched.generationIndex, BOUNDARY_ENTRY_COUNT,
        'the served generation is the compaction proof generation');
      t.equal(received.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
        'the follower-side receive completes');

      await installSealedGeneration({
        replicaDbPath: followerDbPath,
        checkpointsRoot: followerRoot,
        generationIndex: BOUNDARY_ENTRY_COUNT,
        identity: IDENTITY,
      });
      followerDb = new Database(followerDbPath, {readonly: true});
      const followerRecord = RaftRsDurableStore.readDurableRecordIn(
        followerDb, PARTITION_ID);
      t.equal(Number(followerRecord.appliedIndex), BOUNDARY_ENTRY_COUNT,
        'the installed follower boots at the compacted raft-rs boundary');
      t.equal(Number(followerRecord.hardState.term), TERM,
        'the installed follower carries the sealed boundary term');
    } finally {
      if (followerDb) followerDb.close();
      leader.close();
      fs.rmSync(followerWorkDir, {recursive: true, force: true});
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
      t.equal(leader.compacted.outcome, RAFT_COMPACTION_OUTCOME.COMPACTED,
        'raft-rs prefix compacts');
      const preCompactionMax = rowHlc(1).toString();
      const created = await createSqliteStateMachineCheckpoint({
        db: leader.db,
        identity: IDENTITY,
        checkpointsRoot: leader.checkpointsRoot,
        raftRsGroupId: PARTITION_ID,
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
