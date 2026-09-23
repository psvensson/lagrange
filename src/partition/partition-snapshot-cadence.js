// Leader checkpoint cadence owner (quest raft-snapshot-live-rebuild, spec
// solve/specs/raft-snapshot-transfer-install/live-rebuild-design.md, S6
// Phase A link 1). A tick riding the existing 1s prepared-state-hold sweep
// (partition-service-transaction-base.js — the durability-fitness
// precedent). The sweep fires on ALL roles every second, so THE TICK owns
// its own role gate (leader-only).
//
// Checkpoint creation and proof-gated compaction measured their trigger and
// their proof against the retired backend's committed log. The rs-raft
// partition path has no such log (the rs-raft durable store is the only
// consensus record), and checkpointing is not yet owned on that store
// (epic raft-rs-full-cutover finding F5: snapshot/catch-up ownership is its
// own quest). A leader tick therefore reports that explicitly instead of
// reaching for a log that is not there.
//
// Decision table (evaluated top-down, first row wins):
//   in-memory dbPath or control-plane partition -> UNSUPPORTED_PARTITION
//   role !== leader, shut down, or db closed    -> NOT_LEADER
//   otherwise                                   -> COMMITTED_LOG_UNSUPPORTED

import {RAFT_ROLE} from '../raft/constants.js';

import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  CONTROL_PLANE_PARTITION_IDS,
  PARTITION_SERVICE_DEFAULT,
} = PARTITION_SERVICE_SHARED;

// Typed outcomes of one cadence tick.
const RAFT_SNAPSHOT_CADENCE_OUTCOME = Object.freeze({
  NOT_LEADER: 'not_leader',
  UNSUPPORTED_PARTITION: 'unsupported_partition',
  COMMITTED_LOG_UNSUPPORTED: 'committed_log_unsupported',
});

function tickResult(outcome, extra = {}) {
  return Object.freeze({outcome, ...extra});
}

function isUnsupportedPartition(service) {
  return service.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH ||
    CONTROL_PLANE_PARTITION_IDS.has(service.partitionId);
}

/**
 * Create the checkpoint cadence owner for one partition service. The
 * returned tick NEVER rejects — every path is a typed frozen outcome, so the
 * fire-and-forget sweep call site cannot leak a rejection.
 * @param {Object} options cadence options
 * @param {Object} options.service the owning PartitionService
 * @return {Object} frozen {tick(nowMs)}
 */
function createPartitionSnapshotCadence(options) {
  const {service} = options;
  return Object.freeze({
    async tick(_nowMs) {
      if (isUnsupportedPartition(service)) {
        return tickResult(
          RAFT_SNAPSHOT_CADENCE_OUTCOME.UNSUPPORTED_PARTITION, {
            partitionId: service.partitionId,
          });
      }
      if (service.role !== RAFT_ROLE.LEADER || service.isShutdown ||
          !service.db?.open) {
        return tickResult(RAFT_SNAPSHOT_CADENCE_OUTCOME.NOT_LEADER, {
          role: service.role,
        });
      }
      return tickResult(
        RAFT_SNAPSHOT_CADENCE_OUTCOME.COMMITTED_LOG_UNSUPPORTED, {
          partitionId: service.partitionId,
        });
    },
  });
}

export {
  RAFT_SNAPSHOT_CADENCE_OUTCOME,
  createPartitionSnapshotCadence,
};
