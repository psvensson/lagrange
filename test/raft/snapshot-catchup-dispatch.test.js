import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {
  listCheckpointGenerations,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {
  createSealedSourceGeneration,
  installSealedGeneration,
} from './snapshot-catchup-fixture.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME,
  RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
  buildSnapshotCatchupDecision,
} from '../../src/raft/snapshot-catchup-constants.js';
import {
  buildSnapshotCatchupIdentity,
  dispatchSnapshotCatchup,
} from '../../src/raft/snapshot-catchup.js';
import {
  RAFT_SNAPSHOT_TRANSFER_OUTCOME,
} from '../../src/raft/snapshot-transfer-constants.js';
import {receiveSnapshotTransfer} from '../../src/raft/snapshot-transfer.js';
import {
  createInProcWebSocketPair,
} from '../../src/transport/inproc-transport.js';

// S4 (quest raft-snapshot-compacted-follower-catchup) leader decision-site
// attacks over REAL adapters: an INSTALLED leader (compacted-empty log +
// boundary keys) emits the typed install_snapshot decision at exactly the
// b1 (startIndex <= boundary) and b2 (unrecoverable failedIndex <= boundary)
// sites; a boundary-0 leader with a genuine log gap emits the DISTINCT
// catchup_range_empty decision and NEVER install_snapshot; absent callback
// records an observable typed no-op on the instance; and a normal lagging
// follower still receives a real catch-up batch (non-boundary path
// unchanged). Plus dispatcher refusals: per-follower single-flight and the
// corruption decision never minting a checkpoint.

const PARTITION_ID = 'sql_transactions-p1';
const STATE_TABLE = 'sql_transactions';
const TERM = 4;
const SEALED_EPOCH = 7;
const ENTRY_COUNT = 3;
const EXTRA_ENTRY_COUNT = 2;
const FOLLOWER_ADDRESS = 'node-f/partition/sql_transactions-p1-r2';
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-1234',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: SEALED_EPOCH,
});
const HUGE_TIMERS = Object.freeze({
  'heartbeat': '10s',
  'election min': '20s',
  'election max': '30s',
});

// Build a sealed generation from a source replica with ENTRY_COUNT
// committed+applied entries (the S2 createInstallFixture shape).
async function createSealedGenerationFixture() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-catchup-'));
  const checkpointsRoot = path.join(workDir, 'checkpoints');
  const generation = await createSealedSourceGeneration({
    workDir,
    checkpointsRoot,
    partitionId: PARTITION_ID,
    stateTable: STATE_TABLE,
    term: TERM,
    identity: IDENTITY,
    entryCount: ENTRY_COUNT,
  });
  return {
    workDir,
    checkpointsRoot,
    created: generation.created,
    boundaryIndex: generation.boundaryIndex,
    close() {
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

// INSTALLED leader: install the sealed generation into a fresh replica db,
// open a real SQLiteLogAdapter over it, append EXTRA committed entries above
// the boundary, and promote a huge-timer LifeRaft manually.
async function createInstalledLeaderFixture(raftOptions = {}) {
  const generation = await createSealedGenerationFixture();
  const leaderDbPath = path.join(generation.workDir, 'leader.db');
  await installSealedGeneration({
    replicaDbPath: leaderDbPath,
    checkpointsRoot: generation.checkpointsRoot,
    generationIndex: generation.boundaryIndex,
    identity: IDENTITY,
  });
  const leaderDb = new Database(leaderDbPath);
  const adapter = new SQLiteLogAdapter(
    leaderDb, {address: PARTITION_ID, term: TERM});
  const raft = new LifeRaft('node-l/partition/sql_transactions-p1-r1', {
    ...HUGE_TIMERS,
    'Log': function SQLiteLogFactory() {
      return adapter;
    },
    ...raftOptions,
  });
  for (let ordinal = 1; ordinal <= EXTRA_ENTRY_COUNT; ordinal += 1) {
    const entry = adapter.saveCommand({sql: `extra-${ordinal}`}, TERM);
    adapter.commit(entry.index);
  }
  raft.change({state: LifeRaft.LEADER, term: TERM});
  return {
    ...generation,
    raft,
    boundaryIndex: generation.boundaryIndex,
    headIndex: generation.boundaryIndex + EXTRA_ENTRY_COUNT,
    close() {
      raft.end();
      leaderDb.close();
      generation.close();
    },
  };
}

function appendFailPacket(raft, {failedIndex, followerLast}) {
  return {
    type: 'append fail',
    term: TERM,
    state: LifeRaft.FOLLOWER,
    address: FOLLOWER_ADDRESS,
    leader: raft.address,
    last: followerLast,
    data: {index: failedIndex, term: TERM},
  };
}

async function driveAppendFail(raft, packetFacts) {
  const incoming = raft.listeners('data')[0];
  const writes = [];
  await incoming(appendFailPacket(raft, packetFacts), (packet) => {
    writes.push(packet ?? null);
  });
  return writes;
}

test('b1: fresh follower against an installed leader draws install_snapshot',
  async (t) => {
    const decisions = [];
    const fixture = await createInstalledLeaderFixture({
      onSnapshotCatchupNeeded: (decision) => decisions.push(decision),
    });
    try {
      // The follower fails at a RETAINED index (boundary+1) but its own last
      // index is 0, so the leader's fast-forward start is 1 <= boundary.
      const writes = await driveAppendFail(fixture.raft, {
        failedIndex: fixture.boundaryIndex + 1,
        followerLast: {index: 0, term: 0},
      });
      t.same(writes, [null], 'the append-fail is consumed without a batch');
      t.equal(decisions.length, 1, 'exactly one decision is emitted');
      t.same(decisions[0], {
        outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
        followerAddress: FOLLOWER_ADDRESS,
        startIndex: 1,
        failedIndex: fixture.boundaryIndex + 1,
        leaderBoundary: fixture.boundaryIndex,
      }, 'the decision carries startIndex 1 and the leader boundary');
      t.ok(Object.isFrozen(decisions[0]), 'the decision is frozen');
    } finally {
      fixture.close();
    }
  });

test('b2: an unrecoverable failedIndex at the boundary draws install_snapshot',
  async (t) => {
    const decisions = [];
    const fixture = await createInstalledLeaderFixture({
      onSnapshotCatchupNeeded: (decision) => decisions.push(decision),
    });
    try {
      // APPEND_FAIL names the boundary index itself: get(M) is null on the
      // compacted-empty log, so this reaches the unrecoverable branch.
      const writes = await driveAppendFail(fixture.raft, {
        failedIndex: fixture.boundaryIndex,
        followerLast: {index: 0, term: 0},
      });
      t.same(writes, [null], 'the append-fail is consumed without a batch');
      t.equal(decisions.length, 1, 'exactly one decision is emitted');
      t.equal(decisions[0].outcome,
        RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
        'the unrecoverable branch emits install_snapshot');
      t.equal(decisions[0].failedIndex, fixture.boundaryIndex,
        'the decision names the compacted failed index');
      t.equal(decisions[0].leaderBoundary, fixture.boundaryIndex,
        'the decision carries the leader boundary');
    } finally {
      fixture.close();
    }
  });

test('absent callback records the typed decision as an observable no-op',
  async (t) => {
    const fixture = await createInstalledLeaderFixture();
    try {
      const writes = await driveAppendFail(fixture.raft, {
        failedIndex: fixture.boundaryIndex + 1,
        followerLast: {index: 0, term: 0},
      });
      t.same(writes, [null], 'the append-fail is still consumed silently');
      t.same(fixture.raft._lastSnapshotCatchupDecision, {
        outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
        followerAddress: FOLLOWER_ADDRESS,
        startIndex: 1,
        failedIndex: fixture.boundaryIndex + 1,
        leaderBoundary: fixture.boundaryIndex,
      }, 'the typed decision is recorded on the instance');
      t.ok(Object.isFrozen(fixture.raft._lastSnapshotCatchupDecision),
        'the recorded decision is frozen');
    } finally {
      fixture.close();
    }
  });

test('a boundary-0 genuine gap draws catchup_range_empty, never an install',
  async (t) => {
    const decisions = [];
    const raft = new LifeRaft('node-l/partition/gap-leader', {
      ...HUGE_TIMERS,
      'Log': InMemoryLogAdapter,
      'onSnapshotCatchupNeeded': (decision) => decisions.push(decision),
    });
    try {
      // Torn log: entries exist only at 70..75; the prefix is a genuine gap
      // with NO boundary excuse (in-memory adapters have no boundary at all).
      for (let index = 70; index <= 75; index += 1) {
        await raft.log.saveCommand({type: 'gap-entry', index}, TERM, index);
      }
      raft.change({state: LifeRaft.LEADER, term: TERM});
      const writes = await driveAppendFail(raft, {
        failedIndex: 70,
        followerLast: {index: 0, term: 0},
      });
      t.same(writes, [null], 'the empty read stays a silent write()');
      t.equal(decisions.length, 1, 'exactly one decision is emitted');
      t.equal(decisions[0].outcome,
        RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.CATCHUP_RANGE_EMPTY,
        'the corruption case is the DISTINCT catchup_range_empty decision');
      t.not(decisions[0].outcome,
        RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
        'a boundary-0 gap can never draw install_snapshot');
      t.equal(decisions[0].leaderBoundary, 0,
        'the decision records the boundary-0 evidence');
    } finally {
      raft.end();
    }
  });

test('non-boundary catch-up is unchanged: a lagging follower gets a batch',
  async (t) => {
    const decisions = [];
    const raft = new LifeRaft('node-l/partition/full-leader', {
      ...HUGE_TIMERS,
      'Log': InMemoryLogAdapter,
      'onSnapshotCatchupNeeded': (decision) => decisions.push(decision),
    });
    try {
      for (let index = 1; index <= 10; index += 1) {
        await raft.log.saveCommand({type: 'entry', index}, TERM, index);
      }
      await raft.log.commit(10);
      raft.change({state: LifeRaft.LEADER, term: TERM});
      const writes = await driveAppendFail(raft, {
        failedIndex: 4,
        followerLast: {index: 3, term: TERM},
      });
      t.equal(writes.length, 1, 'one reply is written');
      t.equal(writes[0]?.type, 'append', 'the reply is a catch-up batch');
      t.equal(writes[0].data[0].index, 4,
        'the batch fast-forwards to the follower position');
      t.equal(writes[0].data[writes[0].data.length - 1].index, 10,
        'the batch runs to the leader head');
      t.same(decisions, [], 'no catch-up decision is emitted');
      t.equal(raft._lastSnapshotCatchupDecision, undefined,
        'nothing is recorded on the instance either');
    } finally {
      raft.end();
    }
  });

test('dispatch refuses catchup_range_empty and never mints a checkpoint',
  async (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-catchup-'));
    const checkpointsRoot = path.join(workDir, 'checkpoints');
    try {
      const refusal = await dispatchSnapshotCatchup({
        decision: buildSnapshotCatchupDecision({
          outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.CATCHUP_RANGE_EMPTY,
          followerAddress: FOLLOWER_ADDRESS,
          startIndex: 1,
          failedIndex: 70,
          leaderBoundary: 0,
        }),
        checkpointsRoot,
        identity: IDENTITY,
        db: null,
        socketProvider: () => {
          throw new Error('must not open a channel for corruption decisions');
        },
      });
      t.equal(refusal.outcome,
        RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.NOT_INSTALL_DECISION,
        'the corruption decision is a typed dispatch refusal');
      t.same(listCheckpointGenerations(checkpointsRoot), [],
        'no checkpoint generation is minted to paper over corruption');
    } finally {
      fs.rmSync(workDir, {recursive: true, force: true});
    }
  });

test('dispatch is per-follower single-flight with a typed refusal',
  async (t) => {
    const fixture = await createSealedGenerationFixture();
    try {
      const inflightByFollower = new Map();
      inflightByFollower.set('node-f', true);
      const refusal = await dispatchSnapshotCatchup({
        decision: buildSnapshotCatchupDecision({
          outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
          followerAddress: FOLLOWER_ADDRESS,
          startIndex: 1,
          failedIndex: fixture.boundaryIndex,
          leaderBoundary: fixture.boundaryIndex,
        }),
        checkpointsRoot: fixture.checkpointsRoot,
        identity: IDENTITY,
        db: null,
        inflightByFollower,
        socketProvider: () => {
          throw new Error('must not dial while a dispatch is in flight');
        },
      });
      t.equal(refusal.outcome,
        RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.ALREADY_IN_FLIGHT,
        'a second dispatch to the same follower is a typed refusal');
      t.equal(refusal.followerNodeId, 'node-f',
        'the refusal names the follower');
      t.ok(inflightByFollower.has('node-f'),
        'the pre-existing in-flight entry is left untouched');
    } finally {
      fixture.close();
    }
  });

test('dispatch serves the newest eligible generation over the injected socket',
  async (t) => {
    const fixture = await createSealedGenerationFixture();
    const receiverDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'raft-catchup-recv-'));
    try {
      const {a, b} = createInProcWebSocketPair();
      const [dispatched, received] = await Promise.all([
        dispatchSnapshotCatchup({
          decision: buildSnapshotCatchupDecision({
            outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
            followerAddress: FOLLOWER_ADDRESS,
            startIndex: 1,
            failedIndex: fixture.boundaryIndex,
            leaderBoundary: fixture.boundaryIndex,
          }),
          checkpointsRoot: fixture.checkpointsRoot,
          identity: IDENTITY,
          db: null,
          socketProvider: () => a,
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
      t.equal(dispatched.generationIndex, fixture.boundaryIndex,
        'the newest eligible generation (>= boundary) is selected');
      t.equal(received.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
        'the follower-side receive completes');
      t.same(listCheckpointGenerations(receiverDir),
        [fixture.boundaryIndex],
        'the generation is published on the receiver');
    } finally {
      fs.rmSync(receiverDir, {recursive: true, force: true});
      fixture.close();
    }
  });

test('identity pinning: default clusterId and the membership epoch selector',
  async (t) => {
    const bootstrap = buildSnapshotCatchupIdentity({
      partitionId: PARTITION_ID,
      tableName: STATE_TABLE,
      publicationRows: [],
    });
    t.equal(bootstrap.clusterId, RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
      'clusterId falls back to the deployment default constant');
    t.equal(bootstrap.raftGroupId, PARTITION_ID,
      'raftGroupId is the partition id');
    t.same(bootstrap.entity, {kind: 'partition', id: STATE_TABLE},
      'entity binds the partition kind and state table');
    t.equal(bootstrap.membershipEpoch, 0,
      'membershipEpoch falls back to 0 at bootstrap');

    const published = buildSnapshotCatchupIdentity({
      partitionId: PARTITION_ID,
      tableName: STATE_TABLE,
      publicationRows: [
        {status: 'PUBLISHED', publication_epoch: 4},
        {status: 'OPEN', publication_epoch: 9},
        {status: 'PUBLISHED', publicationEpoch: 6},
      ],
    });
    t.equal(published.membershipEpoch, 6,
      'the largest PUBLISHED publication epoch wins; unpublished rows are ' +
      'ignored');
  });

test('a below-boundary generation is skipped and an eligible one is created',
  async (t) => {
    // Discriminating eligibility pin (landing-verifier MF-1): the serving
    // root holds ONLY a stale generation below the leader boundary. The
    // eligibility rule must SKIP it and mint a fresh generation from the
    // live leader database (the S1 create-if-none fallback); a
    // newest-overall rule would serve the stale generation and re-enter the
    // install-dispatch loop the design names as non-benign.
    const workDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'raft-catchup-eligibility-'));
    const receiverDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'raft-catchup-eligibility-recv-'));
    try {
      const servingRoot = path.join(workDir, 'serving-checkpoints');
      const staleDir = path.join(workDir, 'stale-source');
      fs.mkdirSync(staleDir, {recursive: true});
      const stale = await createSealedSourceGeneration({
        workDir: staleDir,
        checkpointsRoot: servingRoot,
        partitionId: PARTITION_ID,
        stateTable: STATE_TABLE,
        term: TERM,
        identity: IDENTITY,
        entryCount: 1,
      });
      const leaderSourceDir = path.join(workDir, 'leader-source');
      fs.mkdirSync(leaderSourceDir, {recursive: true});
      const leaderRoot = path.join(workDir, 'leader-checkpoints');
      const leaderGeneration = await createSealedSourceGeneration({
        workDir: leaderSourceDir,
        checkpointsRoot: leaderRoot,
        partitionId: PARTITION_ID,
        stateTable: STATE_TABLE,
        term: TERM,
        identity: IDENTITY,
        entryCount: ENTRY_COUNT,
      });
      const leaderDbPath = path.join(workDir, 'leader.db');
      await installSealedGeneration({
        replicaDbPath: leaderDbPath,
        checkpointsRoot: leaderRoot,
        generationIndex: leaderGeneration.boundaryIndex,
        identity: IDENTITY,
      });
      const leaderDb = new Database(leaderDbPath);
      try {
        t.same(listCheckpointGenerations(servingRoot),
          [stale.boundaryIndex],
          'anti-vacuous: the serving root really holds only the stale ' +
          'below-boundary generation');
        t.ok(stale.boundaryIndex < leaderGeneration.boundaryIndex,
          'anti-vacuous: the stale generation sits below the leader boundary');
        const {a, b} = createInProcWebSocketPair();
        const [dispatched, received] = await Promise.all([
          dispatchSnapshotCatchup({
            decision: buildSnapshotCatchupDecision({
              outcome:
                RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
              followerAddress: FOLLOWER_ADDRESS,
              startIndex: 1,
              failedIndex: leaderGeneration.boundaryIndex,
              leaderBoundary: leaderGeneration.boundaryIndex,
            }),
            checkpointsRoot: servingRoot,
            identity: IDENTITY,
            db: leaderDb,
            socketProvider: () => a,
          }),
          receiveSnapshotTransfer({
            socket: b,
            checkpointsRoot: receiverDir,
            expectedIdentity: IDENTITY,
          }),
        ]);
        t.equal(dispatched.outcome,
          RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED,
          'an eligible generation is served despite the stale-only root');
        t.not(dispatched.generationIndex, stale.boundaryIndex,
          'the below-boundary generation is skipped, never served');
        t.ok(dispatched.generationIndex >= leaderGeneration.boundaryIndex,
          'the served generation satisfies index >= leader boundary');
        t.ok(
          listCheckpointGenerations(servingRoot)
            .includes(dispatched.generationIndex),
          'the create-if-none fallback minted the eligible generation from ' +
          'the live leader database');
        t.equal(received.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
          'the receiver completes with the eligible generation');
        t.same(listCheckpointGenerations(receiverDir),
          [dispatched.generationIndex],
          'the receiver publishes the eligible generation, not the stale one');
      } finally {
        leaderDb.close();
      }
    } finally {
      fs.rmSync(receiverDir, {recursive: true, force: true});
      fs.rmSync(workDir, {recursive: true, force: true});
    }
  });
