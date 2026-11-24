import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  RaftRsPeerIdentityRegistry,
} from '../../src/raft/raft-rs-peer-identity.js';
import {
  RaftRsReplicaLifecycleOwner,
} from '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {
  createSqliteStateMachineCheckpoint,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {requestSnapshotInstall} from '../../src/raft/snapshot-install.js';
import {
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
} from '../../src/raft/snapshot-install-constants.js';

// Shared S4 guard fixture (quest raft-snapshot-compacted-follower-catchup):
// build a SOURCE replica with canonical raft-rs durable state and seal one
// RAFT_RS_REPLICA_IMAGE checkpoint generation from it, and install a sealed
// generation into an established follower receiver database.

const FIXTURE_PAYLOAD_FILL = 'x';
const FIXTURE_DEFAULT_LARGE_ROW_PAYLOAD_BYTES = 64 * 1024;
const INITIAL_MEMBERSHIP_GENERATION = '0';

function buildRowPayload(ordinal, payloadBytes) {
  const base = `payload-${ordinal}`;
  if (!Number.isSafeInteger(payloadBytes) || payloadBytes <= base.length) {
    return base;
  }
  return base + FIXTURE_PAYLOAD_FILL.repeat(payloadBytes - base.length);
}

function defaultFollowerReplicaId(partitionId) {
  return `${partitionId}-r2`;
}

function defaultLeaderReplicaId(partitionId) {
  return `${partitionId}-r1`;
}

/**
 * Seed an established raft-rs follower receiver database so canonical
 * RAFT_RS_FOLLOWER_CATCHUP snapshot installation can replace it.
 * @param {Object} options
 * @param {string} options.replicaDbPath target sqlite path
 * @param {string} options.partitionId raft group id
 * @param {string} [options.replicaId] receiver replica identity
 * @param {string} [options.leaderReplicaId] leader replica identity
 * @param {number|string} [options.term] local durable term
 * @param {number|string} [options.vote] local durable vote
 * @param {number|string} [options.appliedIndex] local durable applied index
 * @return {{peerId: string, replicaId: string}}
 */
function seedEstablishedFollowerReceiver(options) {
  const {replicaDbPath, partitionId} = options;
  const leaderReplicaId =
    options.leaderReplicaId || defaultLeaderReplicaId(partitionId);
  const replicaId = options.replicaId || defaultFollowerReplicaId(partitionId);
  const term = String(options.term ?? 1);
  const vote = String(options.vote ?? 0);
  const appliedIndex = String(options.appliedIndex ?? 0);
  fs.mkdirSync(path.dirname(replicaDbPath), {recursive: true});
  const db = new Database(replicaDbPath);
  try {
    const registry = new RaftRsPeerIdentityRegistry(db);
    const leaderPeerId = registry.registerReplica(leaderReplicaId);
    const followerPeerId = registry.registerReplica(replicaId);
    const confState = {
      voters: [leaderPeerId, followerPeerId],
      learners: [],
      votersOutgoing: [],
      learnersNext: [],
      autoLeave: false,
    };
    const lifecycle = new RaftRsReplicaLifecycleOwner({
      db,
      groupId: partitionId,
      peerId: followerPeerId,
      replicaIdentity: replicaId,
    });
    const store = new RaftRsDurableStore(db);
    store.transaction(() => {
      lifecycle.recordOpeningHistory(lifecycle.incarnation);
      store.putBootstrapAppliedState(partitionId, confState, {
        bootstrapIndex: '0',
        admissionIndex: '0',
        membershipGenerationIndex: INITIAL_MEMBERSHIP_GENERATION,
      });
      store.putAppliedState(
        partitionId,
        appliedIndex,
        confState,
        undefined,
        INITIAL_MEMBERSHIP_GENERATION,
      );
      store.putHardState(partitionId, {
        term,
        vote,
        commit: appliedIndex,
      });
    });
    return {peerId: followerPeerId, replicaId};
  } finally {
    db.close();
  }
}

/**
 * Build a source replica with `entryCount` committed+applied rows in
 * `stateTable` and canonical raft-rs durable state, and seal a
 * RAFT_RS_REPLICA_IMAGE checkpoint generation into `checkpointsRoot`.
 * @param {Object} options {workDir, checkpointsRoot, partitionId,
 *   stateTable, term, identity, entryCount, inProcessPins, payloadBytes,
 *   followerReplicaId, leaderReplicaId, entryTimestamp}
 * @return {Promise<Object>} {created, sourceDbPath, boundaryIndex,
 *   followerReplicaId, leaderReplicaId}
 */
async function createSealedSourceGeneration(options) {
  const {
    workDir, checkpointsRoot, partitionId, stateTable, term, identity,
    entryCount, inProcessPins, payloadBytes, entryTimestamp,
  } = options;
  const leaderReplicaId =
    options.leaderReplicaId || defaultLeaderReplicaId(partitionId);
  const followerReplicaId =
    options.followerReplicaId || defaultFollowerReplicaId(partitionId);
  const sourceDbPath = path.join(workDir, 'source.db');
  const sourceDb = new Database(sourceDbPath);
  const registry = new RaftRsPeerIdentityRegistry(sourceDb);
  const leaderPeerId = registry.registerReplica(leaderReplicaId);
  const followerPeerId = registry.registerReplica(followerReplicaId);
  const confState = {
    voters: [leaderPeerId, followerPeerId],
    learners: [],
    votersOutgoing: [],
    learnersNext: [],
    autoLeave: false,
  };
  const store = new RaftRsDurableStore(sourceDb);
  sourceDb.exec(`CREATE TABLE IF NOT EXISTS ${stateTable} ` +
    '(id TEXT PRIMARY KEY, payload TEXT)');
  const insertStatement = sourceDb.prepare(
    `INSERT INTO ${stateTable} (id, payload) VALUES (?, ?)`);
  const membershipGenerationIndex = String(identity?.membershipEpoch ?? 0);
  const insertAllRows = () => {
    const entries = [];
    for (let ordinal = 1; ordinal <= entryCount; ordinal += 1) {
      insertStatement.run(
        `row-${ordinal}`, buildRowPayload(ordinal, payloadBytes));
      const timestamp = typeof entryTimestamp === 'function' ?
        entryTimestamp(ordinal) :
        entryTimestamp;
      const command = timestamp ?
        {sql: `row-${ordinal}`, timestamp} :
        {sql: `row-${ordinal}`};
      entries.push({
        index: String(ordinal),
        term: String(term),
        entryType: 0,
        data: Buffer.from(JSON.stringify(command)).toString('base64'),
      });
    }
    store.putBootstrapAppliedState(partitionId, confState, {
      bootstrapIndex: '0',
      admissionIndex: '0',
      membershipGenerationIndex: INITIAL_MEMBERSHIP_GENERATION,
    });
    store.appendEntries(partitionId, entries);
    store.putAppliedState(
      partitionId,
      String(entryCount),
      confState,
      undefined,
      membershipGenerationIndex,
    );
    store.putHardState(partitionId, {
      term: String(term),
      vote: '0',
      commit: String(entryCount),
    });
  };
  store.transaction(insertAllRows);
  const created = await createSqliteStateMachineCheckpoint({
    db: sourceDb,
    identity,
    checkpointsRoot,
    raftRsGroupId: partitionId,
    inProcessPins,
  });
  sourceDb.close();
  return {
    created,
    sourceDbPath,
    boundaryIndex: entryCount,
    leaderReplicaId,
    followerReplicaId,
  };
}

/**
 * Build a LARGE sealed generation (S6 multi-chunk fixture): fat rows sized
 * so the sealed payload spans many transfer chunks.
 * @param {Object} options createSealedSourceGeneration options plus
 *   {totalPayloadBytes, rowPayloadBytes}
 * @return {Promise<Object>}
 */
async function createLargeSealedSourceGeneration(options) {
  const rowPayloadBytes = options.rowPayloadBytes ||
    FIXTURE_DEFAULT_LARGE_ROW_PAYLOAD_BYTES;
  const entryCount = Math.ceil(options.totalPayloadBytes / rowPayloadBytes);
  const generation = await createSealedSourceGeneration({
    ...options,
    entryCount,
    payloadBytes: rowPayloadBytes,
  });
  return {...generation, entryCount, rowPayloadBytes};
}

/**
 * Install one sealed RAFT_RS_REPLICA_IMAGE generation into a follower
 * database (seeding an established follower receiver if absent), throwing on
 * any non-INSTALLED outcome.
 * @param {Object} options {replicaDbPath, checkpointsRoot, generationIndex,
 *   identity, expectedReplicaIdentity, localTerm, localVote}
 * @return {Promise<Object>} the typed install result
 */
async function installSealedGeneration(options) {
  const {replicaDbPath, checkpointsRoot, generationIndex, identity} = options;
  const expectedReplicaIdentity = options.expectedReplicaIdentity ||
    defaultFollowerReplicaId(identity.raftGroupId);
  if (!fs.existsSync(replicaDbPath)) {
    seedEstablishedFollowerReceiver({
      replicaDbPath,
      partitionId: identity.raftGroupId,
      replicaId: expectedReplicaIdentity,
      term: options.localTerm ?? 1,
      vote: options.localVote ?? 0,
    });
  }
  const installed = await requestSnapshotInstall({
    replicaDbPath,
    checkpointsRoot,
    generationIndex,
    expectedIdentity: identity,
    expectedReplicaIdentity,
  });
  if (installed.outcome !== RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED) {
    throw new Error(`install fixture failed: ${installed.outcome} (${installed.reason ?? ''})`);
  }
  return installed;
}

export {
  createLargeSealedSourceGeneration,
  createSealedSourceGeneration,
  defaultFollowerReplicaId,
  defaultLeaderReplicaId,
  installSealedGeneration,
  seedEstablishedFollowerReceiver,
};
