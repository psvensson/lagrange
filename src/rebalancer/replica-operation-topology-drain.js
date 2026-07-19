import {
  buildReplicaOperationProgressSnapshot,
  isCoordinatorOwnedOperationType,
  isReplaceRemoveDispatchPhase,
} from './replica-status.js';
import {
  normalizeReplicaOperationRecord,
} from './replica-operation-liveness.js';

function buildTopologyShapingDrainCandidate(operation, observedAt) {
  const normalizedOperation = normalizeReplicaOperationRecord(operation, {
    nowMs: observedAt,
  });
  if (
    !isCoordinatorOwnedOperationType(normalizedOperation.type) ||
    buildReplicaOperationProgressSnapshot(normalizedOperation)
      .terminal !== true ||
    isReplaceRemoveDispatchPhase(normalizedOperation)
  ) {
    return null;
  }
  const drainedAtMs =
    Number.isFinite(normalizedOperation.completedAt) ?
      normalizedOperation.completedAt :
      normalizedOperation.updatedAt;
  if (!Number.isFinite(drainedAtMs)) {
    return null;
  }
  return Object.freeze({
    drainedAtMs: Math.min(observedAt, Math.floor(drainedAtMs)),
    operationId: normalizedOperation.operationId,
    operationType: normalizedOperation.type,
  });
}

/**
 * Resolve the latest retained drain watermark for coordinator-owned
 * topology-shaping work.
 *
 * @param {Array<Object>} operations
 * @param {Object} [options]
 * @param {number} [options.observedAt]
 * @return {{drainedAtMs:number,operationId:string,operationType:string}|null}
 */
function resolveLatestTopologyShapingOperationDrain(
  operations,
  options = {},
) {
  if (!Array.isArray(operations)) {
    return null;
  }
  const observedAt = Number.isFinite(options.observedAt) ?
    Math.floor(options.observedAt) :
    Date.now();
  let latestDrain = null;

  for (const operation of operations) {
    const candidate = buildTopologyShapingDrainCandidate(
      operation,
      observedAt,
    );
    if (
      candidate &&
      (!latestDrain || candidate.drainedAtMs > latestDrain.drainedAtMs)
    ) {
      latestDrain = candidate;
    }
  }

  return latestDrain;
}

export {resolveLatestTopologyShapingOperationDrain};
