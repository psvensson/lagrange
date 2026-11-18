import {
  buildReplicaOperationProgressSnapshot,
  getOperationMetadataObject,
  getOperationMetadataValue,
  isCoordinatorOwnedOperationType,
  isReplaceRemoveDispatchPhase,
} from './replica-status.js';
import {
  normalizeReplicaOperationRecord,
} from './replica-operation-liveness.js';
import {
  COMMITTED_MEMBERSHIP_STAMP_KIND,
} from '../raft/raft-committed-membership-constants.js';
import {
  OPERATION_METADATA_KEY,
  OperationType,
} from './replica-operation-progress.js';

/**
 * Whether a replica operation FOUNDS its partition: the ADD a table or
 * system-table provisioning creates for one founder of a new cohort. Its
 * durable steps record says so, before stamping (bootstrap dispatch held
 * until the cohort is stamped) and after (the GENESIS bootstrap membership).
 * Founding work is created by provisioning, which no rebalancer fence gates:
 * it is never work a release fence released.
 * @param {Object} operation a replica_operations row or record
 * @param {number} observedAt
 * @return {boolean}
 */
function isFoundingTopologyOperation(operation, observedAt) {
  const record = normalizeReplicaOperationRecord(operation, {
    nowMs: observedAt,
  });
  if (record.type !== OperationType.ADD) {
    return false;
  }
  return getOperationMetadataValue(record.stepsHistory,
    OPERATION_METADATA_KEY.BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED) === true ||
    getOperationMetadataObject(record.stepsHistory,
      OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP)?.kind ===
      COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS;
}

function isDrainedTopologyShapingOperation(operation, observedAt) {
  const record = normalizeReplicaOperationRecord(operation, {
    nowMs: observedAt,
  });
  return isCoordinatorOwnedOperationType(record.type) &&
    buildReplicaOperationProgressSnapshot(record).terminal === true &&
    !isReplaceRemoveDispatchPhase(record) &&
    record.operationId.length > 0;
}

/**
 * The identities of every retained, drained (terminal) coordinator-owned
 * topology-shaping operation among `operations`. The identity of a drain is
 * the operation, never its remote completion timestamp: a set of ids cannot
 * hide a fast transition stamped earlier than another, and no future-stamped
 * row can tie or flip it.
 * @param {Array<Object>} operations
 * @param {Object} options
 * @param {number} options.observedAt
 * @return {Array<string>} sorted operation ids
 */
function resolveDrainedTopologyShapingOperationIds(operations, options) {
  return operations
    .filter((operation) =>
      isDrainedTopologyShapingOperation(operation, options.observedAt))
    .map((operation) => normalizeReplicaOperationRecord(operation, {
      nowMs: options.observedAt,
    }).operationId)
    .sort();
}

/**
 * The latest retained drain by its remote completion stamp (clamped to the
 * observing instant). Kept only for the demo preload gate
 * (examples/service-data-affinity/affinity-demo-preload-gate.js); the
 * release fence no longer reads it: a remote stamp can hide a fast
 * transition stamped earlier than another, which is why the fence keys on
 * resolveDrainedTopologyShapingOperationIds. Finding routed to that
 * consumer's owner.
 * @param {Array<Object>} operations
 * @param {Object} [options]
 * @param {number} [options.observedAt]
 * @return {{drainedAtMs:number,operationId:string,operationType:string}|null}
 */
function resolveLatestTopologyShapingOperationDrain(operations, options = {}) {
  if (!Array.isArray(operations)) {
    return null;
  }
  const observedAt = Number.isFinite(options.observedAt) ?
    Math.floor(options.observedAt) :
    Date.now();
  let latestDrain = null;
  for (const operation of operations) {
    if (!isDrainedTopologyShapingOperation(operation, observedAt)) continue;
    const record = normalizeReplicaOperationRecord(operation, {
      nowMs: observedAt,
    });
    const drainedAtMs = Number.isFinite(record.completedAt) ?
      record.completedAt : record.updatedAt;
    if (!Number.isFinite(drainedAtMs)) continue;
    const candidate = Object.freeze({
      drainedAtMs: Math.min(observedAt, Math.floor(drainedAtMs)),
      operationId: record.operationId,
      operationType: record.type,
    });
    if (!latestDrain || candidate.drainedAtMs > latestDrain.drainedAtMs) {
      latestDrain = candidate;
    }
  }
  return latestDrain;
}

export {
  isFoundingTopologyOperation,
  resolveDrainedTopologyShapingOperationIds,
  resolveLatestTopologyShapingOperationDrain,
};
