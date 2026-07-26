// Raft snapshot compacted-follower catch-up orchestrator (quest
// raft-snapshot-compacted-follower-catchup, spec
// solve/specs/raft-snapshot-transfer-install/compacted-follower-catchup-
// design.md, S4). Leader side: turn one typed install_snapshot decision
// (emitted by liferaft.js) into a served snapshot transfer — resolve the
// follower nodeId from the unified address, select the NEWEST eligible
// sealed generation (index >= the leader boundary; anything older is an
// unbounded install-dispatch loop, not benign), create one via S1 creation
// when none exists (an installed leader re-checkpoints at its own boundary
// thanks to the S2 fallback), and serve it over an injected channel with
// per-follower single-flight. Follower side: drive the received generation
// through the established closed-handle boundary — shutdown, install,
// recreate via the injected PartitionService factory, and hand the
// replacement to the caller's registry callback (this module NEVER mutates
// replica registries itself; production wiring is S6 scope). Every refusal
// or failure is a typed frozen outcome.

import {AddressManager} from '../address/address-manager.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-key-constants.js';
import {ENTITY_TYPE} from '../constants/addresses.js';
import {TABLES} from '../constants/tables.js';
import {
  selectLatestPublishedMembershipEpoch,
} from '../control-plane/membership-epoch-contract.js';

import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
} from './snapshot-checkpoint-constants.js';
import {
  createSqliteStateMachineCheckpoint,
  listCheckpointGenerations,
} from './snapshot-checkpoint-store.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME,
  RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
} from './snapshot-catchup-constants.js';
import {requestSnapshotInstall} from './snapshot-install.js';
import {RAFT_SNAPSHOT_INSTALL_OUTCOME} from './snapshot-install-constants.js';
import {
  RAFT_SNAPSHOT_TRANSFER_OUTCOME,
} from './snapshot-transfer-constants.js';
import {
  receiveSnapshotTransfer,
  serveSnapshotTransfer,
} from './snapshot-transfer.js';

const DISPATCH = RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME;
const INSTALL_ORCHESTRATION = RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME;
const CATCHUP_TYPEOF = Object.freeze({
  FUNCTION: 'function',
});
const TRANSFER_ID_PREFIX = 'snapshot-catchup';
const TRANSFER_ID_SEPARATOR = '-';

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

function orchestrationResult(outcome, extra = {}) {
  return Object.freeze({outcome, ...extra});
}

/**
 * Compose the checkpoint identity this deployment pins snapshots to
 * (S1-S3 recorded deferral, resolved by S4): clusterId from deployment
 * configuration (CONFIG_KEY.RAFT_SNAPSHOT_CLUSTER_ID, defaulted),
 * raftGroupId = partitionId, entity from the owning partition service, and
 * membershipEpoch from the latest PUBLISHED membership publication epoch in
 * the cached control_plane_publications rows (0 at bootstrap).
 * @param {Object} options identity facts
 * @param {string} options.partitionId owning partition (raft group) id
 * @param {string} options.tableName partition entity (state table) name
 * @param {Array<Object>} [options.publicationRows] cached
 *   control_plane_publications rows
 * @return {Object} frozen identity
 *   ({clusterId, raftGroupId, entity, membershipEpoch})
 */
function buildSnapshotCatchupIdentity(options) {
  const configuredClusterId = ConfigurationManager.getInstance()
    .get(CONFIG_KEY.RAFT_SNAPSHOT_CLUSTER_ID);
  return Object.freeze({
    clusterId: configuredClusterId || RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
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
  });
}

function resolveFollowerNodeId(followerAddress) {
  try {
    return {resolved: true, nodeId:
      AddressManager.getInstance().parse(followerAddress).nodeId};
  } catch (error) {
    return {resolved: false, detail: error.message};
  }
}

// Newest sealed generation whose index is at or above the leader boundary
// (strictly `index >= leaderBoundary`: pre-install generations below the
// boundary can exist while retention is S5 scope, and serving one dispatches
// an install the follower immediately outgrows — an unbounded loop).
function selectNewestEligibleGeneration(checkpointsRoot, leaderBoundary) {
  const eligible = listCheckpointGenerations(checkpointsRoot)
    .filter((generationIndex) => generationIndex >= leaderBoundary);
  return eligible.length > 0 ?
    {found: true, generationIndex: eligible[eligible.length - 1]} :
    {found: false};
}

async function resolveServableGeneration(options) {
  const {checkpointsRoot, leaderBoundary, identity, db} = options;
  const existing = selectNewestEligibleGeneration(
    checkpointsRoot, leaderBoundary);
  if (existing.found) {
    // Recorded synchronously with selection (no await between select and
    // set): the S5 sweep must never observe a served generation unpinned.
    options.recordInFlightGeneration(existing.generationIndex);
    return {ok: true, generationIndex: existing.generationIndex};
  }
  // The create-if-none fallback threads the OTHER dispatches' in-flight
  // generation pins into creation so its opportunistic retention sweep
  // cannot remove a generation mid-serve.
  const created = await createSqliteStateMachineCheckpoint({
    db,
    identity,
    checkpointsRoot,
    inProcessPins: listInFlightGenerationIndexes(options.inflightByFollower),
  });
  if (created.outcome !== RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED) {
    return {ok: false, creation: created};
  }
  options.recordInFlightGeneration(created.descriptor.lastIncludedIndex);
  return {ok: true, generationIndex: created.descriptor.lastIncludedIndex};
}

/**
 * Leader-side dispatch of one typed install_snapshot catch-up decision:
 * resolve the follower nodeId, select (or create) the newest eligible
 * generation, and serve it via serveSnapshotTransfer over the injected
 * socket. Per-follower single-flight; every refusal is typed. A
 * catchup_range_empty decision is refused outright — it marks log
 * corruption and must never mint or serve a checkpoint.
 * @param {Object} options dispatch request
 * @param {Object} options.decision typed decision from liferaft emission
 * @param {string} options.checkpointsRoot leader durable checkpoint root
 * @param {Object} options.identity leader checkpoint identity
 * @param {Object} options.db live better-sqlite3 handle (creation fallback)
 * @param {Function} options.socketProvider async ({followerNodeId,
 *   followerAddress}) -> socket-like serving channel
 * @param {string} [options.transferId] override transfer id
 * @param {number} [options.chunkSizeBytes] chunk geometry override
 * @param {Object} [options.tokenBucket] sender pacing bucket
 * @param {AbortSignal} [options.signal] cancellation signal
 * @param {Map} [options.inflightByFollower] injected single-flight registry
 * @return {Promise<Object>} typed frozen dispatch result
 */
async function dispatchSnapshotCatchup(options) {
  const {decision, checkpointsRoot, identity, db} = options;
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
    const generation = await resolveServableGeneration({
      checkpointsRoot,
      leaderBoundary: decision.leaderBoundary,
      identity,
      db,
      inflightByFollower,
      recordInFlightGeneration: (generationIndex) =>
        inflightByFollower.set(follower.nodeId, generationIndex),
    });
    if (!generation.ok) {
      return dispatchResult(DISPATCH.CHECKPOINT_CREATION_FAILED, {
        followerNodeId: follower.nodeId,
        creation: generation.creation,
      });
    }
    const socket = await options.socketProvider({
      followerNodeId: follower.nodeId,
      followerAddress: decision.followerAddress,
    });
    if (!socket) {
      return dispatchResult(DISPATCH.SOCKET_UNAVAILABLE, {
        followerNodeId: follower.nodeId,
        generationIndex: generation.generationIndex,
      });
    }
    const transferId = options.transferId || [
      TRANSFER_ID_PREFIX,
      follower.nodeId,
      String(generation.generationIndex),
    ].join(TRANSFER_ID_SEPARATOR);
    const transfer = await serveSnapshotTransfer({
      socket,
      checkpointsRoot,
      generationIndex: generation.generationIndex,
      transferId,
      chunkSizeBytes: options.chunkSizeBytes,
      tokenBucket: options.tokenBucket,
      signal: options.signal,
    });
    const served =
      transfer.outcome === RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED;
    return dispatchResult(
      served ? DISPATCH.SERVED : DISPATCH.TRANSFER_ABORTED, {
        followerNodeId: follower.nodeId,
        generationIndex: generation.generationIndex,
        transfer,
      });
  } finally {
    inflightByFollower.delete(follower.nodeId);
  }
}

function resolveExpectedIdentityValue(expectedIdentity) {
  return typeof expectedIdentity === CATCHUP_TYPEOF.FUNCTION ?
    expectedIdentity() :
    expectedIdentity;
}

function buildReplacementServiceOptions(service) {
  return Object.freeze({
    partitionId: service.partitionId,
    tableId: service.tableId,
    tableName: service.tableName,
    replicaId: service.replicaId,
    replicaIds: service.replicaIds,
    nodeId: service.nodeId,
    // The production factory derives dbPath deterministically and ignores
    // this option (recorded coupling); guard-injected factories honor it.
    dbPath: service.dbPath,
  });
}

/**
 * Follower-side install orchestration: receive the offered generation, shut
 * the running PartitionService down (the established closed-handle
 * boundary), install atomically, then construct a NEW PartitionService over
 * the same dbPath via the injected factory and hand it to
 * registerReplacementService. A shutdown instance is never re-initialized
 * (isShutdown is one-way) and the remove path (which deletes the db) is
 * never used. On install rejection the old state boots per the S2 marker
 * semantics — no blind recreate. Every stage failure is typed.
 * @param {Object} options orchestration request
 * @param {Object} options.service the running (compacted-behind) service
 * @param {Object} options.receiveOptions receiveSnapshotTransfer options
 *   ({socket, checkpointsRoot, expectedIdentity, ...})
 * @param {Function} options.createPartitionService async factory receiving
 *   the frozen replacement options derived from the old service
 * @param {Function} options.registerReplacementService callback receiving
 *   the new service (registry handoff — the caller swaps its own maps)
 * @return {Promise<Object>} typed frozen orchestration result
 */
async function orchestrateSnapshotCatchupInstall(options) {
  const {service, receiveOptions} = options;
  const transfer = await receiveSnapshotTransfer(receiveOptions);
  if (transfer.outcome !== RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED) {
    return orchestrationResult(INSTALL_ORCHESTRATION.RECEIVE_FAILED,
      {transfer});
  }
  try {
    await service.shutdown();
  } catch (error) {
    return orchestrationResult(INSTALL_ORCHESTRATION.SHUTDOWN_FAILED, {
      transfer,
      detail: error.message,
    });
  }
  const install = await requestSnapshotInstall({
    replicaDbPath: service.dbPath,
    checkpointsRoot: receiveOptions.checkpointsRoot,
    generationIndex: transfer.descriptor.lastIncludedIndex,
    expectedIdentity: resolveExpectedIdentityValue(
      receiveOptions.expectedIdentity),
  });
  if (install.outcome !== RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED) {
    return orchestrationResult(INSTALL_ORCHESTRATION.INSTALL_REJECTED,
      {transfer, install});
  }
  let replacement;
  try {
    replacement = await options.createPartitionService(
      buildReplacementServiceOptions(service));
  } catch (error) {
    return orchestrationResult(INSTALL_ORCHESTRATION.RECREATE_FAILED, {
      transfer,
      install,
      detail: error.message,
    });
  }
  try {
    options.registerReplacementService(replacement);
  } catch (error) {
    return orchestrationResult(INSTALL_ORCHESTRATION.REGISTER_FAILED, {
      transfer,
      install,
      service: replacement,
      detail: error.message,
    });
  }
  return orchestrationResult(INSTALL_ORCHESTRATION.INSTALLED_AND_RECREATED, {
    transfer,
    install,
    service: replacement,
  });
}

export {
  buildSnapshotCatchupIdentity,
  buildSnapshotCatchupIdentityFromCache,
  dispatchSnapshotCatchup,
  listInFlightGenerationIndexes,
  orchestrateSnapshotCatchupInstall,
};
