import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

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

// S4 (quest raft-snapshot-compacted-follower-catchup) dispatcher attacks over
// REAL adapters: the corruption decision never mints a checkpoint, dispatch
// is per-follower single-flight, the newest eligible generation is served
// over the injected socket, identity pinning, and below-boundary generations
// are skipped.
//
// The leader decision-site cases (b1, b2, absent callback, boundary-0 gap,
// non-boundary batch) drove the retired runtime's append-fail handler and are
// deleted with it. raft-rs does not yet consume the catch-up decision or
// handle a snapshot message, so leader-side catch-up dispatch is an open
// release-blocking frontier of epic raft-rs-full-cutover R5 ("snapshot/
// restart/catch-up under rs-raft durable state"); nothing here certifies it.

const PARTITION_ID = 'sql_transactions-p1';
const STATE_TABLE = 'sql_transactions';
const TERM = 4;
const SEALED_EPOCH = 7;
const ENTRY_COUNT = 3;
const FOLLOWER_ADDRESS = 'node-f/partition/sql_transactions-p1-r2';
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-1234',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: SEALED_EPOCH,
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
