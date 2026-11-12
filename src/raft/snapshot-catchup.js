// Raft snapshot compacted-follower catch-up orchestrator (quest
// raft-snapshot-compacted-follower-catchup, spec
// solve/specs/raft-snapshot-transfer-install/compacted-follower-catchup-
// design.md, S4). Leader side: turn one typed install_snapshot decision
// (emitted by the consensus catch-up decision owner) into a served snapshot transfer — resolve the
// follower nodeId from the unified address, select the NEWEST eligible
// sealed generation (index >= the leader boundary; anything older is an
// unbounded install-dispatch loop, not benign) that the reader holds valid
// under the leader's current identity, seal one through the caller's
// generation sealer when none is servable, and serve it over an injected
// channel with per-follower single-flight. One channel carries ONE transfer:
// the dispatch closes the channel it was given when it ends, whatever the
// outcome, so the next dispatch is dialled afresh and the follower's
// one-shot offer router is never asked twice. A generation is servable to a
// follower only when its image names that follower (an image sealed before
// this leader applied the follower's admission is refused by its installer,
// every time). The follower side is snapshot-catchup-install.js. Every
// refusal or failure is a typed frozen outcome.

import path from 'node:path';

import {AddressManager} from '../address/address-manager.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-key-constants.js';
import {ENTITY_TYPE} from '../constants/addresses.js';
import {TABLES} from '../constants/tables.js';
import {
  CLUSTER_ID_CONFIG_KEY,
} from '../bootstrap/cluster-identity-constants.js';
import {
  selectLatestPublishedMembershipEpoch,
} from '../control-plane/membership-epoch-contract.js';

import {RaftRsDurableStore} from './raft-rs-durable-store.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from './snapshot-checkpoint-constants.js';
import {
  createSqliteStateMachineCheckpoint,
  listCheckpointGenerations,
  readCheckpoint,
} from './snapshot-checkpoint-store.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME,
  RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
} from './snapshot-catchup-constants.js';
import {snapshotImageAdmitsReceiver} from './snapshot-receiver-admission.js';
import {
  RAFT_SNAPSHOT_TRANSFER_OUTCOME,
} from './snapshot-transfer-constants.js';
import {serveSnapshotTransfer} from './snapshot-transfer.js';

const DISPATCH = RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME;
const CATCHUP_TYPEOF = Object.freeze({
  FUNCTION: 'function',
});
const TRANSFER_ID_PREFIX = 'snapshot-catchup';
const TRANSFER_ID_SEPARATOR = '-';
const IDENTITY_KEY_SEPARATOR = '\u0000';

// Default per-process single-flight registry (nodeId -> in-flight value).
// The value starts as the SELECTION_PENDING placeholder and becomes the
// resolved generationIndex the moment a generation is selected or created
// (recorded synchronously with selection — no await in between), so the S5
// retention sweep can pin every generation currently being served. Tests may
// inject their own map through options.inflightByFollower.
const DEFAULT_INFLIGHT_BY_FOLLOWER = new Map();
const INFLIGHT_SELECTION_PENDING = true;

/**
 * Generation indexes currently pinned by in-flight snapshot dispatches
 * (the S5 retention in-process pin source). Entries still awaiting
 * generation selection carry the boolean placeholder and are excluded.
 * @param {Map} [inflightMap] injected single-flight registry (defaults to
 *   the per-process registry)
 * @return {number[]} frozen in-flight generation indexes
 */
function listInFlightGenerationIndexes(
  inflightMap = DEFAULT_INFLIGHT_BY_FOLLOWER) {
  return Object.freeze([...inflightMap.values()]
    .filter((value) => Number.isSafeInteger(value)));
}

function dispatchResult(outcome, extra = {}) {
  return Object.freeze({outcome, ...extra});
}

/**
 * Compose the checkpoint identity this deployment pins snapshots to:
 * clusterId from the durable cluster identity (the replicated CONFIG-row
 * singleton, threaded in as options.clusterId by the cache-backed builder),
 * falling back to deployment configuration
 * (CONFIG_KEY.RAFT_SNAPSHOT_CLUSTER_ID, defaulted) only while the durable
 * identity is not yet visible; raftGroupId = partitionId, entity from the
 * owning partition service, and membershipEpoch from the latest PUBLISHED
 * membership publication epoch in the cached control_plane_publications rows
 * (0 at bootstrap).
 * @param {Object} options identity facts
 * @param {string} options.partitionId owning partition (raft group) id
 * @param {string} options.tableName partition entity (state table) name
 * @param {Array<Object>} [options.publicationRows] cached
 *   control_plane_publications rows
 * @param {string} [options.clusterId] durable cluster identity (CONFIG row)
 * @return {Object} frozen identity
 *   ({clusterId, raftGroupId, entity, membershipEpoch})
 */
function buildSnapshotCatchupIdentity(options) {
  const configuredClusterId = ConfigurationManager.getInstance()
    .get(CONFIG_KEY.RAFT_SNAPSHOT_CLUSTER_ID);
  return Object.freeze({
    clusterId: options.clusterId || configuredClusterId ||
      RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
    raftGroupId: options.partitionId,
    entity: Object.freeze({
      kind: ENTITY_TYPE.PARTITION,
      id: options.tableName,
    }),
    membershipEpoch: selectLatestPublishedMembershipEpoch(
      options.publicationRows),
  });
}

// Cached control_plane_publications rows from a system-table cache (either
// cache API surface), or the empty bootstrap view when no cache is wired.
function readCachedPublicationRows(systemTableCache) {
  if (typeof systemTableCache?.getAll === CATCHUP_TYPEOF.FUNCTION) {
    return systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [];
  }
  if (typeof systemTableCache?.filter === CATCHUP_TYPEOF.FUNCTION) {
    return systemTableCache.filter(
      TABLES.CONTROL_PLANE_PUBLICATIONS, () => true) || [];
  }
  return [];
}

// Durable cluster identity from the replicated CONFIG-row singleton, read
// through the same cache the publication rows come from. Absent row
// (pre-identity cluster or pre-hydration cache) reads as null, leaving the
// configured/default fallback in buildSnapshotCatchupIdentity untouched.
function readCachedClusterId(systemTableCache) {
  if (typeof systemTableCache?.get !== CATCHUP_TYPEOF.FUNCTION) {
    return null;
  }
  const row = systemTableCache.get(TABLES.CONFIG, CLUSTER_ID_CONFIG_KEY);
  const clusterId = row?.config_value;
  return typeof clusterId === 'string' && clusterId.length > 0 ?
    clusterId :
    null;
}

/**
 * Build the snapshot catch-up identity for one partition service straight
 * from the cached control-plane publication rows (the S6 production wiring
 * shape shared by the checkpoint cadence, the dispatcher seam, and the
 * follower offer router — one author for the identity-from-cache rule).
 * @param {Object} options identity facts
 * @param {string} options.partitionId owning partition (raft group) id
 * @param {string} options.tableName partition entity (state table) name
 * @param {Object} [options.systemTableCache] cached system tables
 * @return {Object} frozen identity
 */
function buildSnapshotCatchupIdentityFromCache(options) {
  return buildSnapshotCatchupIdentity({
    partitionId: options.partitionId,
    tableName: options.tableName,
    publicationRows: readCachedPublicationRows(options.systemTableCache),
    clusterId: readCachedClusterId(options.systemTableCache),
  });
}

/**
 * One comparable key of the part of a checkpoint identity that can change
 * under a running replica (the cluster identity becoming visible, the
 * membership epoch advancing): equal keys seal and accept the same images.
 * @param {Object} identity checkpoint identity
 * @return {string} the identity's key
 */
function snapshotCheckpointIdentityKey(identity) {
  return [identity.clusterId, String(identity.membershipEpoch)]
    .join(IDENTITY_KEY_SEPARATOR);
}

// The follower's node and replica identity as its unified address names
// them (the address the consensus runtime resolved from the committed
// reservation), or the typed unresolved answer.
function resolveFollowerNodeId(followerAddress) {
  try {
    const parsed = AddressManager.getInstance().parse(followerAddress);
    return {resolved: true, nodeId: parsed.nodeId,
      replicaIdentity: parsed.serviceId};
  } catch (error) {
    return {resolved: false, detail: error.message};
  }
}

// Newest sealed generation whose index is at or above the leader boundary
// (strictly `index >= leaderBoundary`: pre-install generations below the
// boundary can exist while retention is S5 scope, and serving one dispatches
// an install the follower immediately outgrows — an unbounded loop) AND that
// the checkpoint reader holds valid under the leader's CURRENT identity AND
// whose image names the follower. A generation the reader refuses (partial,
// corrupt, or sealed under an older membership epoch than the leader's
// identity now carries) is not servable: the sender would abort it as
// generation_unavailable or every receiver at the current epoch would refuse
// it as stale_epoch, for ever. Neither is one sealed before this leader
// applied the follower's admission: its installer refuses an image that does
// not name it, for ever. With none servable the dispatch seals one under the
// current identity and the current configuration (below).
function selectNewestEligibleGeneration(checkpointsRoot, leaderBoundary,
  identity, followerReplicaIdentity) {
  const eligible = listCheckpointGenerations(checkpointsRoot)
    .filter((generationIndex) => generationIndex >= leaderBoundary);
  for (let position = eligible.length - 1; position >= 0; position -= 1) {
    const servable = readCheckpoint({
      checkpointDir: path.join(checkpointsRoot, String(eligible[position])),
      expectedIdentity: identity,
    });
    if (servable.outcome === RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID &&
        snapshotImageAdmitsReceiver(servable.descriptor, followerReplicaIdentity)) {
      return {found: true, generationIndex: eligible[position]};
    }
  }
  return {found: false};
}

/**
 * The generation sealer over one replica database: one S1 creation, as a
 * raft-rs replica image when the database holds a raft-rs record of the
 * identity's group. A partition's checkpoint cadence wraps this one in its
 * standing refusal and is the sealer its dispatcher passes.
 * @param {Object} db live better-sqlite3 handle
 * @return {Function} async ({identity, checkpointsRoot, inProcessPins}) ->
 *   typed creation result
 */
function createCheckpointSealer(db, installTarget) {
  return ({identity, checkpointsRoot, inProcessPins}) => {
    const hasRaftRsRecord = Boolean(db && identity?.raftGroupId &&
      RaftRsDurableStore.hasDurableRecordIn(db, identity.raftGroupId));
    return createSqliteStateMachineCheckpoint({db, identity, checkpointsRoot, installTarget,
      ...(hasRaftRsRecord ? {raftRsGroupId: identity.raftGroupId} : {}),
      inProcessPins});
  };
}

// None servable: the sealer builds one under the current identity and
// configuration, sparing the other dispatches' pins; the image it sealed
// must name the follower too.
async function sealServableGeneration(options) {
  const {checkpointsRoot, identity, follower} = options;
  const created = await options.sealGeneration({identity, checkpointsRoot,
    inProcessPins: listInFlightGenerationIndexes(options.inflightByFollower)});
  if (created.outcome !== RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED) {
    return {ok: false, outcome: DISPATCH.CHECKPOINT_CREATION_FAILED,
      detail: {creation: created}};
  }
  const generationIndex = created.descriptor.lastIncludedIndex;
  const named = snapshotImageAdmitsReceiver(
    created.descriptor, follower.replicaIdentity);
  return named ? {ok: true, generationIndex} :
    {ok: false, outcome: DISPATCH.GENERATION_OMITS_FOLLOWER,
      detail: {generationIndex}};
}

async function resolveServableGeneration(options) {
  const {checkpointsRoot, leaderBoundary, identity, follower} = options;
  const existing = selectNewestEligibleGeneration(
    checkpointsRoot, leaderBoundary, identity, follower.replicaIdentity);
  // Recorded synchronously with selection (no await between select and
  // set): the S5 sweep must never observe a served generation unpinned.
  const generation = existing.found ?
    {ok: true, generationIndex: existing.generationIndex} :
    await sealServableGeneration(options);
  if (generation.ok) {
    options.recordInFlightGeneration(generation.generationIndex);
  }
  return generation;
}

// One turn of the event loop. A dispatch is started from the consensus
// runtime's notification, inside its delivery turn; everything after the
// follower's slot is claimed (reading and hashing a whole image to select
// it, sealing one) runs after this yield, never in that turn.
function nextEventLoopTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

// The transfer of one resolved generation over the channel the provider
// answers, the channel closed when the transfer ends.
async function serveResolvedGeneration(options, follower, generationIndex) {
  const {decision, checkpointsRoot, signal} = options;
  const socket = await options.socketProvider({
    followerNodeId: follower.nodeId,
    followerAddress: decision.followerAddress,
    signal,
  });
  if (!socket) {
    return dispatchResult(DISPATCH.SOCKET_UNAVAILABLE, {
      followerNodeId: follower.nodeId,
      generationIndex,
    });
  }
  try {
    options.onProgress?.();
    const transfer = await serveSnapshotTransfer({
      socket,
      checkpointsRoot,
      generationIndex,
      transferId: options.transferId || [TRANSFER_ID_PREFIX, follower.nodeId,
        String(generationIndex)].join(TRANSFER_ID_SEPARATOR),
      chunkSizeBytes: options.chunkSizeBytes,
      tokenBucket: options.tokenBucket,
      signal,
      onChunkServed: options.onProgress,
    });
    const served =
      transfer.outcome === RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED;
    return dispatchResult(
      served ? DISPATCH.SERVED : DISPATCH.TRANSFER_ABORTED, {
        followerNodeId: follower.nodeId,
        generationIndex,
        transfer,
      });
  } finally {
    // One turn later: a typed abort this side sent is delivered first.
    await nextEventLoopTurn();
    socket.close();
  }
}

/**
 * Leader-side dispatch of one typed install_snapshot catch-up decision:
 * resolve the follower nodeId, select (or create) the newest eligible
 * generation, and serve it via serveSnapshotTransfer over the injected
 * socket. Per-follower single-flight; every refusal is typed. A
 * catchup_range_empty decision is refused outright — it marks log
 * corruption and must never mint or serve a checkpoint.
 * @param {Object} options dispatch request
 * @param {Object} options.decision typed decision from consensus catch-up
 * @param {string} options.checkpointsRoot leader durable checkpoint root
 * @param {Object} options.identity leader checkpoint identity
 * @param {Function} options.sealGeneration async ({identity,
 *   checkpointsRoot, inProcessPins}) -> typed creation result; asked only
 *   when no sealed generation is servable (createCheckpointSealer(db), or a
 *   partition's cadence sealer)
 * @param {Function} options.socketProvider async ({followerNodeId,
 *   followerAddress, signal}) -> socket-like serving channel, owned (and
 *   closed) by this dispatch
 * @param {string} [options.transferId] override transfer id
 * @param {number} [options.chunkSizeBytes] chunk geometry override
 * @param {Object} [options.tokenBucket] sender pacing bucket
 * @param {AbortSignal} [options.signal] cancellation signal: stops the
 *   dial and the transfer; checked before a channel is opened
 * @param {Function} [options.onProgress] called when the generation is
 *   resolved, the channel obtained and each chunk served
 * @param {Map} [options.inflightByFollower] injected single-flight registry
 * @return {Promise<Object>} typed frozen dispatch result
 */
async function dispatchSnapshotCatchup(options) {
  const {decision, checkpointsRoot, identity} = options;
  if (decision?.outcome !==
      RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT) {
    return dispatchResult(DISPATCH.NOT_INSTALL_DECISION, {
      decisionOutcome: decision?.outcome ?? null,
    });
  }
  const follower = resolveFollowerNodeId(decision.followerAddress);
  if (!follower.resolved) {
    return dispatchResult(DISPATCH.FOLLOWER_ADDRESS_INVALID, {
      followerAddress: decision.followerAddress,
      detail: follower.detail,
    });
  }
  const inflightByFollower =
    options.inflightByFollower || DEFAULT_INFLIGHT_BY_FOLLOWER;
  if (inflightByFollower.has(follower.nodeId)) {
    return dispatchResult(DISPATCH.ALREADY_IN_FLIGHT, {
      followerNodeId: follower.nodeId,
    });
  }
  inflightByFollower.set(follower.nodeId, INFLIGHT_SELECTION_PENDING);
  try {
    await nextEventLoopTurn();
    const generation = await resolveServableGeneration({
      checkpointsRoot,
      leaderBoundary: decision.leaderBoundary,
      identity,
      follower,
      sealGeneration: options.sealGeneration,
      inflightByFollower,
      recordInFlightGeneration: (generationIndex) =>
        inflightByFollower.set(follower.nodeId, generationIndex),
    });
    if (!generation.ok) {
      return dispatchResult(generation.outcome,
        {followerNodeId: follower.nodeId, ...generation.detail});
    }
    options.onProgress?.();
    if (options.signal?.aborted) {
      return dispatchResult(DISPATCH.CANCELLED, {
        followerNodeId: follower.nodeId,
        generationIndex: generation.generationIndex,
      });
    }
    return await serveResolvedGeneration(
      options, follower, generation.generationIndex);
  } finally {
    inflightByFollower.delete(follower.nodeId);
  }
}

export {
  buildSnapshotCatchupIdentity,
  buildSnapshotCatchupIdentityFromCache,
  createCheckpointSealer,
  dispatchSnapshotCatchup,
  listInFlightGenerationIndexes,
  resolveFollowerNodeId,
  snapshotCheckpointIdentityKey,
};
