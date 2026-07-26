// Leader checkpoint cadence owner (quest raft-snapshot-live-rebuild, spec
// solve/specs/raft-snapshot-transfer-install/live-rebuild-design.md, S6
// Phase A link 1). A tick riding the existing 1s prepared-state-hold sweep
// (partition-service-transaction-base.js — the durability-fitness
// precedent). The sweep fires on ALL roles every second and checkpoint
// creation is async and can exceed a second, so THE TICK owns its own role
// gate (leader-only, re-checked after the creation await since role can
// change mid-creation) AND an in-flight flag (the sweep seam provides
// neither — verifier hazard). In-memory and control-plane partitions are
// typed refusals (mirroring calculatePartitionSize's special cases). On
// fire: one S1 checkpoint with the cache-derived identity, then the S5
// retention sweep with the FULL pin set (durable install/transfer markers
// via gatherRetentionPins + the S4 dispatcher's in-flight generations).
//
// Trigger decision table (evaluated top-down, first row wins):
//   in-memory dbPath or control-plane partition -> UNSUPPORTED_PARTITION
//   tick already in flight                      -> ALREADY_IN_FLIGHT
//   role !== leader                             -> NOT_LEADER
//   no committed entries above covered index    -> BELOW_THRESHOLD
//   entries < entryThreshold AND size < byteThreshold -> BELOW_THRESHOLD
//   creation outcome !== CREATED                -> CREATION_REFUSED
//   role lost across the creation await         -> LEADERSHIP_LOST (no sweep)
//   otherwise                                   -> CHECKPOINTED (+ sweep)
// where coveredIndex = max(newest sealed generation, install boundary).

import {CONFIG_KEY} from '../config/config-key-constants.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {RAFT_COMPACTION_OUTCOME} from '../raft/compaction-policy.js';
import {
  buildSnapshotCatchupIdentityFromCache,
  listInFlightGenerationIndexes,
} from '../raft/snapshot-catchup.js';
import {readSnapshotBoundary} from '../raft/snapshot-boundary.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
} from '../raft/snapshot-checkpoint-constants.js';
import {
  createSqliteStateMachineCheckpoint,
  listCheckpointGenerations,
} from '../raft/snapshot-checkpoint-store.js';
import {resolveReplicaCheckpointsRoot} from '../raft/snapshot-install.js';
import {
  gatherRetentionPins,
  sweepCheckpointGenerations,
} from '../raft/snapshot-retention.js';

import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  CONTROL_PLANE_PARTITION_IDS,
  PARTITION_SERVICE_DEFAULT,
} = PARTITION_SERVICE_SHARED;

// Typed outcomes of one cadence tick.
const RAFT_SNAPSHOT_CADENCE_OUTCOME = Object.freeze({
  CHECKPOINTED: 'checkpointed',
  COMPACTED: 'compacted',
  BELOW_THRESHOLD: 'below_threshold',
  NOT_LEADER: 'not_leader',
  ALREADY_IN_FLIGHT: 'already_in_flight',
  UNSUPPORTED_PARTITION: 'unsupported_partition',
  CREATION_REFUSED: 'creation_refused',
  LEADERSHIP_LOST_MID_CREATION: 'leadership_lost_mid_creation',
  TICK_FAILED: 'tick_failed',
});

const CADENCE_KIB = 1024;
const CADENCE_MIB = CADENCE_KIB * CADENCE_KIB;
const RAFT_SNAPSHOT_CADENCE_DEFAULT = Object.freeze({
  // Mirrors the raft.snapshotThreshold config default (the config key is the
  // authoritative source; this constant only backstops an uninitialized or
  // non-numeric config read).
  ENTRY_THRESHOLD: 10000,
  // Byte trigger over the partition's own size computation (this.sizeBytes
  // from calculatePartitionSize): a partition this large checkpoints eagerly
  // on any new committed entry instead of waiting out the entry threshold.
  BYTE_THRESHOLD_BYTES: 256 * CADENCE_MIB,
});

function tickResult(outcome, extra = {}) {
  return Object.freeze({outcome, ...extra});
}

function resolveEntryThreshold(injected) {
  if (Number.isSafeInteger(injected) && injected > 0) {
    return injected;
  }
  const configured = ConfigurationManager.getInstance()
    .get(CONFIG_KEY.RAFT_SNAPSHOT_THRESHOLD);
  return Number.isSafeInteger(configured) && configured > 0 ?
    configured :
    RAFT_SNAPSHOT_CADENCE_DEFAULT.ENTRY_THRESHOLD;
}

function resolveByteThreshold(injected) {
  return Number.isSafeInteger(injected) && injected > 0 ?
    injected :
    RAFT_SNAPSHOT_CADENCE_DEFAULT.BYTE_THRESHOLD_BYTES;
}

// The newest index already covered by durable checkpoint state: the newest
// sealed generation name, or the install boundary when no generation exists
// (an installed replica's prefix is already durably covered).
function readCoveredIndex(service, checkpointsRoot) {
  const generations = listCheckpointGenerations(checkpointsRoot);
  const newestGeneration = generations.length > 0 ?
    generations[generations.length - 1] :
    0;
  const boundary = readSnapshotBoundary(service.db).lastIncludedIndex;
  return Math.max(newestGeneration, boundary);
}

function isUnsupportedPartition(service) {
  return service.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH ||
    CONTROL_PLANE_PARTITION_IDS.has(service.partitionId);
}

// Compact the leader's committed log prefix up to the just-sealed generation,
// using that generation as the durable proof the S5 decision table requires.
// A non-COMPACTED outcome (e.g. ALREADY_COMPACTED, or an adapter that does not
// implement the protocol request) is benign and leaves the log intact.
function compactToGeneration(service, creation) {
  const adapter = service.logAdapter;
  if (!adapter || typeof adapter.compactCommittedEntries !== 'function') {
    return {outcome: RAFT_COMPACTION_OUTCOME.SNAPSHOT_PROTOCOL_UNAVAILABLE};
  }
  return adapter.compactCommittedEntries({
    toIndex: creation.descriptor.lastIncludedIndex,
    proof: {checkpointDir: creation.checkpointDir},
  });
}

/**
 * Create the checkpoint cadence owner for one partition service. The
 * returned tick NEVER rejects — every failure path is a typed frozen
 * outcome, so the fire-and-forget sweep call site cannot leak a rejection.
 * @param {Object} options cadence options
 * @param {Object} options.service the owning PartitionService
 * @param {number} [options.entryThreshold] committed-entry trigger override
 *   (default: the raft.snapshotThreshold config key)
 * @param {number} [options.byteThresholdBytes] partition-size trigger
 *   override (default RAFT_SNAPSHOT_CADENCE_DEFAULT.BYTE_THRESHOLD_BYTES)
 * @return {Object} frozen {tick(nowMs), isInFlight()}
 */
function createPartitionSnapshotCadence(options) {
  const {service} = options;
  const state = {inFlight: false};

  const evaluate = async (_nowMs) => {
    if (isUnsupportedPartition(service)) {
      return tickResult(RAFT_SNAPSHOT_CADENCE_OUTCOME.UNSUPPORTED_PARTITION, {
        partitionId: service.partitionId,
      });
    }
    if (state.inFlight) {
      return tickResult(RAFT_SNAPSHOT_CADENCE_OUTCOME.ALREADY_IN_FLIGHT);
    }
    if (service.role !== RAFT_ROLE.LEADER || service.isShutdown ||
        !service.db?.open) {
      return tickResult(RAFT_SNAPSHOT_CADENCE_OUTCOME.NOT_LEADER, {
        role: service.role,
      });
    }
    const checkpointsRoot = resolveReplicaCheckpointsRoot(service.dbPath);
    const committedIndex = service.logAdapter.getCommittedIndex();
    const coveredIndex = readCoveredIndex(service, checkpointsRoot);
    const pendingEntryCount = committedIndex - coveredIndex;
    const entryThreshold = resolveEntryThreshold(options.entryThreshold);
    const byteThresholdBytes =
      resolveByteThreshold(options.byteThresholdBytes);
    const overEntryThreshold = pendingEntryCount >= entryThreshold;
    const overByteThreshold = Number.isFinite(service.sizeBytes) &&
      service.sizeBytes >= byteThresholdBytes;
    if (pendingEntryCount <= 0 ||
        (!overEntryThreshold && !overByteThreshold)) {
      return tickResult(RAFT_SNAPSHOT_CADENCE_OUTCOME.BELOW_THRESHOLD, {
        pendingEntryCount,
        entryThreshold,
        byteThresholdBytes,
      });
    }
    state.inFlight = true;
    try {
      const identity = buildSnapshotCatchupIdentityFromCache({
        partitionId: service.partitionId,
        tableName: service.tableName,
        systemTableCache: service.systemTableCache,
      });
      const creation = await createSqliteStateMachineCheckpoint({
        db: service.db,
        identity,
        checkpointsRoot,
        inProcessPins: listInFlightGenerationIndexes(),
      });
      if (creation.outcome !== RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED) {
        return tickResult(RAFT_SNAPSHOT_CADENCE_OUTCOME.CREATION_REFUSED, {
          creation,
        });
      }
      // Role re-check AFTER the await: creation can outlast leadership. The
      // sealed generation stays (it is valid state), but the cadence stops
      // acting as a leader — no retention sweep on a demoted replica.
      if (service.role !== RAFT_ROLE.LEADER) {
        return tickResult(
          RAFT_SNAPSHOT_CADENCE_OUTCOME.LEADERSHIP_LOST_MID_CREATION,
          {creation});
      }
      const sweep = sweepCheckpointGenerations({
        checkpointsRoot,
        pinnedGenerationIndexes: gatherRetentionPins({
          checkpointsRoot,
          inProcessPins: listInFlightGenerationIndexes(),
        }),
      });
      // Proof-gated compaction advances the leader's snapshot boundary past
      // the just-sealed generation, so a lagging or from-scratch follower can
      // no longer replay the removed prefix and must be caught up by snapshot
      // install — this is what makes the snapshot chain (not ordinary
      // AppendEntries replay) the recovery path. The proof is the generation
      // sealed above; the S5 decision table refuses anything unproven, so the
      // committed prefix is never removed without durable local proof.
      const compaction = compactToGeneration(service, creation);
      const compacted =
        compaction.outcome === RAFT_COMPACTION_OUTCOME.COMPACTED;
      return tickResult(
        compacted ?
          RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED :
          RAFT_SNAPSHOT_CADENCE_OUTCOME.CHECKPOINTED,
        {creation, sweep, compaction});
    } finally {
      state.inFlight = false;
    }
  };

  return Object.freeze({
    async tick(nowMs) {
      try {
        return await evaluate(nowMs);
      } catch (error) {
        return tickResult(RAFT_SNAPSHOT_CADENCE_OUTCOME.TICK_FAILED, {
          detail: error?.message,
        });
      }
    },
    isInFlight() {
      return state.inFlight;
    },
  });
}

export {
  RAFT_SNAPSHOT_CADENCE_OUTCOME,
  createPartitionSnapshotCadence,
};
