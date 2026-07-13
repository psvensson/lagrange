import {VOTER_RAFT_ROLES} from '../raft/replica-voter-readiness.js';
import {normalizeReplicaOperationRecord} from './replica-operation-liveness.js';
import {OperationType, ReplicaStatus} from './replica-status.js';
import {
  REPLICA_INVENTORY_ANOMALY_CODE,
  REPLICA_INVENTORY_CONSISTENCY,
  REPLICA_INVENTORY_EFFECTIVE_VIEW,
  REPLICA_INVENTORY_OBSERVATION_STATE,
  REPLICA_INVENTORY_PROVENANCE,
} from './replica-inventory-constants.js';

export {REPLICA_INVENTORY_EFFECTIVE_VIEW} from './replica-inventory-constants.js';

const ACTIVE = ReplicaStatus.ACTIVE;
const OCCUPIED_STATUSES = new Set([
  ReplicaStatus.PENDING,
  ReplicaStatus.CREATING,
  ReplicaStatus.SYNCING,
  ReplicaStatus.ACTIVE,
]);
const NON_LIVE_STATUSES = new Set([
  ReplicaStatus.FAILED,
  ReplicaStatus.REMOVING,
  ReplicaStatus.REMOVED,
]);
const ADD_TRANSITIONAL_STATUSES = new Set([
  ReplicaStatus.PENDING,
  ReplicaStatus.CREATING,
  ReplicaStatus.SYNCING,
]);
const ADD_TRANSITIONAL_STEPS = new Set([
  'PENDING',
  'SENDING',
  'CREATING',
  'SYNCING',
]);
const ACCOUNTING_FIELD_BY_EFFECTIVE_VIEW = Object.freeze({
  [REPLICA_INVENTORY_EFFECTIVE_VIEW.DEFICIT_FILL]:
    'deficitEffectiveCount',
  [REPLICA_INVENTORY_EFFECTIVE_VIEW.PEAK_CREATION]:
    'creationEffectiveCount',
  [REPLICA_INVENTORY_EFFECTIVE_VIEW.SETTLED_VOTER_TARGET]:
    'settledVoterTargetCount',
});

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstTextField(record, fieldNames) {
  for (const fieldName of fieldNames) {
    const value = text(record?.[fieldName]);
    if (value) {
      return value;
    }
  }
  return '';
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function observationRevision(observation) {
  const candidate =
    observation?.revision ??
    observation?.snapshotVersion;
  return Number.isFinite(candidate) || typeof candidate === 'string' ?
    candidate :
    null;
}

function observationRows(observation, key) {
  const value = observation?.[key];
  return Array.isArray(value) ? value : [];
}

function normalizeObservationState(observation, values) {
  const explicit = text(observation?.state).toLowerCase();
  if (explicit) {
    return explicit;
  }
  if (observation?.available === false) {
    return REPLICA_INVENTORY_OBSERVATION_STATE.UNAVAILABLE;
  }
  return values.length > 0 ?
    REPLICA_INVENTORY_OBSERVATION_STATE.PRESENT :
    REPLICA_INVENTORY_OBSERVATION_STATE.EMPTY;
}

function normalizeReplicaRow(row) {
  const replicaId = firstTextField(row, [
    'replica_id',
    'replicaId',
    'service_id',
    'serviceId',
  ]);
  const nodeId = firstTextField(row, ['node_id', 'nodeId']);
  const status = (firstTextField(row, ['status']) || ACTIVE).toLowerCase();
  const raftRole = firstTextField(row, ['raft_role', 'raftRole']).toLowerCase();
  const hasNode = nodeId.length > 0;
  const live = !NON_LIVE_STATUSES.has(status);
  return {
    replicaId,
    nodeId,
    status,
    raftRole,
    live,
    active: hasNode && status === ACTIVE,
    // Physical one-replica-per-node occupancy is status-inclusive until the
    // row is durably removed. Accounting occupancy remains the narrower
    // pending/creating/syncing/active lifecycle below.
    occupied: hasNode && status !== ReplicaStatus.REMOVED,
    accountingOccupied:
      hasNode && OCCUPIED_STATUSES.has(status),
    voter:
      hasNode && live && VOTER_RAFT_ROLES.has(raftRole),
  };
}

function sameReplicaObservation(left, right) {
  return left.nodeId === right.nodeId &&
    left.status === right.status &&
    left.raftRole === right.raftRole;
}

function isAddTransitional(operation) {
  return ADD_TRANSITIONAL_STEPS.has(operation.workflowStep) ||
    ADD_TRANSITIONAL_STATUSES.has(operation.status);
}

export function isReplicaInventoryAddTransitionalOperation(
  operation,
  capturedAtMs = Date.now(),
) {
  const normalized = normalizeInventoryOperation(operation, capturedAtMs);
  return normalized.addTransitional &&
    (normalized.type === OperationType.ADD ||
      normalized.type === OperationType.REPLACE ||
      normalized.type.length === 0);
}

function normalizeInventoryOperation(row, nowMs) {
  const normalized = normalizeReplicaOperationRecord(row, {nowMs});
  const type = text(normalized.type).toUpperCase();
  const sourceReplicaId = text(normalized.sourceReplicaId);
  const targetReplicaId = text(normalized.replicaId);

  return {
    operationId: text(normalized.operationId),
    type,
    status: text(normalized.status).toLowerCase(),
    workflowStep: text(normalized.workflowStep).toUpperCase(),
    entityType: text(normalized.entityType).toLowerCase(),
    entityId: text(normalized.entityId),
    sourceReplicaId,
    sourceNodeId: text(normalized.sourceNodeId),
    targetReplicaId,
    targetNodeId: text(normalized.targetNodeId),
    addTransitional: isAddTransitional(normalized),
  };
}

function sameOperationObservation(left, right) {
  return left.type === right.type &&
    left.status === right.status &&
    left.workflowStep === right.workflowStep &&
    left.sourceReplicaId === right.sourceReplicaId &&
    left.sourceNodeId === right.sourceNodeId &&
    left.targetReplicaId === right.targetReplicaId &&
    left.targetNodeId === right.targetNodeId;
}

function replicationClassification(replicationStateByReplicaId, replicaId) {
  if (replicationStateByReplicaId instanceof Map) {
    return replicationStateByReplicaId.get(replicaId) || null;
  }
  if (
    replicationStateByReplicaId &&
    typeof replicationStateByReplicaId === 'object'
  ) {
    return replicationStateByReplicaId[replicaId] || null;
  }
  return null;
}

function freezeSnapshot(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    freezeSnapshot(child);
  }
  return Object.freeze(value);
}

/**
 * Build the canonical immutable inventory for one rebalancer entity.
 * Observation envelopes preserve provenance; the builder never claims a
 * cross-table transaction generation when the sources do not provide one.
 *
 * @param {Object} options
 * @return {Object}
 */
export function buildReplicaInventorySnapshot(options = {}) {
  const capturedAtMs = Number.isFinite(options.capturedAtMs) ?
    Math.floor(options.capturedAtMs) :
    Date.now();
  const committedObservation = options.committedRowsObservation || {};
  const operationObservation = options.inFlightOperationObservation || {};
  const rawRows = observationRows(committedObservation, 'rows');
  const rawOperations = observationRows(operationObservation, 'operations');
  const committedState = normalizeObservationState(
    committedObservation,
    rawRows,
  );
  const operationState = normalizeObservationState(
    operationObservation,
    rawOperations,
  );
  const anomalies = [];
  const replicasById = new Map();
  const conflictingReplicaNodes = new Set();

  for (const rawRow of rawRows) {
    const replica = normalizeReplicaRow(rawRow);
    if (!replica.replicaId) {
      if (replica.occupied) {
        conflictingReplicaNodes.add(replica.nodeId);
        anomalies.push({
          code: REPLICA_INVENTORY_ANOMALY_CODE.REPLICA_IDENTITY_UNAVAILABLE,
          nodeIds: [replica.nodeId],
        });
      }
      continue;
    }
    const prior = replicasById.get(replica.replicaId);
    if (!prior) {
      replicasById.set(replica.replicaId, replica);
      continue;
    }
    if (sameReplicaObservation(prior, replica)) {
      continue;
    }
    if (prior.nodeId) {
      conflictingReplicaNodes.add(prior.nodeId);
    }
    if (replica.nodeId) {
      conflictingReplicaNodes.add(replica.nodeId);
    }
    anomalies.push({
      code:
        REPLICA_INVENTORY_ANOMALY_CODE.DUPLICATE_REPLICA_IDENTITY_CONFLICT,
      replicaId: replica.replicaId,
      nodeIds: sorted(new Set([prior.nodeId, replica.nodeId].filter(Boolean))),
    });
  }

  const replicas = [...replicasById.values()].sort((left, right) =>
    left.replicaId.localeCompare(right.replicaId),
  );
  const committedReplicaIds = new Set(replicasById.keys());
  const operationsById = new Map();
  const conflictingOperationTargetNodes = new Set();
  const requestedEntityId = text(options.entityId);
  for (let index = 0; index < rawOperations.length; index += 1) {
    const operation = normalizeInventoryOperation(
      rawOperations[index],
      capturedAtMs,
    );
    if (
      requestedEntityId &&
      operation.entityId &&
      operation.entityId !== REPLICA_INVENTORY_PROVENANCE.UNKNOWN_ENTITY &&
      operation.entityId !== requestedEntityId
    ) {
      continue;
    }
    if (
      operation.type === OperationType.REPLACE &&
      operation.sourceReplicaId.length === 0
    ) {
      anomalies.push({
        code:
          REPLICA_INVENTORY_ANOMALY_CODE.REPLACE_SOURCE_IDENTITY_UNAVAILABLE,
        operationId: operation.operationId,
      });
    }
    const operationKey = operation.operationId || `anonymous:${index}`;
    const prior = operationsById.get(operationKey);
    if (!prior) {
      operationsById.set(operationKey, operation);
      continue;
    }
    if (sameOperationObservation(prior, operation)) {
      continue;
    }
    if (prior.targetNodeId) {
      conflictingOperationTargetNodes.add(prior.targetNodeId);
    }
    if (operation.targetNodeId) {
      conflictingOperationTargetNodes.add(operation.targetNodeId);
    }
    anomalies.push({
      code:
        REPLICA_INVENTORY_ANOMALY_CODE.DUPLICATE_OPERATION_IDENTITY_CONFLICT,
      operationId: operation.operationId,
      targetNodeIds: sorted(new Set([
        prior.targetNodeId,
        operation.targetNodeId,
      ].filter(Boolean))),
    });
  }
  const operations = [...operationsById.values()].sort((left, right) =>
    left.operationId.localeCompare(right.operationId),
  );

  const occupiedNodeIds = new Set([
    ...conflictingReplicaNodes,
    ...conflictingOperationTargetNodes,
  ]);
  const activeReplicaIds = new Set();
  const voterReplicaIds = new Set();
  const learnerReplicaIds = new Set();
  const nonActiveOccupiedByNode = new Map();
  for (const replica of replicas) {
    if (replica.occupied) {
      occupiedNodeIds.add(replica.nodeId);
      if (!replica.active && replica.accountingOccupied) {
        if (!nonActiveOccupiedByNode.has(replica.nodeId)) {
          nonActiveOccupiedByNode.set(replica.nodeId, []);
        }
        nonActiveOccupiedByNode.get(replica.nodeId).push(replica.replicaId);
      }
    }
    if (replica.active) {
      activeReplicaIds.add(replica.replicaId);
    }
    if (replica.voter) {
      voterReplicaIds.add(replica.replicaId);
    } else if (replica.live && replica.accountingOccupied) {
      learnerReplicaIds.add(replica.replicaId);
    }
  }

  const liveAddTargetNodeIds = new Set();
  for (const operation of operations) {
    if (
      operation.addTransitional &&
      (operation.type === OperationType.ADD ||
        operation.type === OperationType.REPLACE) &&
      operation.targetNodeId
    ) {
      liveAddTargetNodeIds.add(operation.targetNodeId);
      occupiedNodeIds.add(operation.targetNodeId);
    }
  }
  const orphanReplicaIds = new Set();
  const voterTargetReplicaIds = new Set();
  const voterTargetNodeIds = new Set();
  const promotableLearnerReplicaIds = new Set();
  for (const replica of replicas) {
    const orphan = replica.active &&
      !replica.voter &&
      !liveAddTargetNodeIds.has(replica.nodeId);
    if (orphan) {
      orphanReplicaIds.add(replica.replicaId);
      continue;
    }
    if (replica.voter || (replica.live && replica.accountingOccupied)) {
      voterTargetReplicaIds.add(replica.replicaId);
      voterTargetNodeIds.add(replica.nodeId);
    }
    const replicationState = replicationClassification(
      options.replicationStateByReplicaId,
      replica.replicaId,
    );
    if (replicationState?.promotable === true) {
      promotableLearnerReplicaIds.add(replica.replicaId);
    }
  }
  for (const operation of operations) {
    if (
      operation.addTransitional &&
      (operation.type === OperationType.ADD ||
        operation.type === OperationType.REPLACE)
    ) {
      if (operation.targetReplicaId) {
        voterTargetReplicaIds.add(operation.targetReplicaId);
      }
      if (operation.targetNodeId) {
        voterTargetNodeIds.add(operation.targetNodeId);
      }
    }
  }
  const settledVoterTargetReplicaIds = new Set(voterTargetReplicaIds);
  for (const operation of operations) {
    if (!operation.addTransitional) {
      continue;
    }
    if (
      operation.type === OperationType.REPLACE &&
      operation.sourceReplicaId &&
      operation.targetReplicaId
    ) {
      settledVoterTargetReplicaIds.delete(operation.sourceReplicaId);
      settledVoterTargetReplicaIds.add(operation.targetReplicaId);
    } else if (
      operation.type === OperationType.ADD &&
      operation.targetReplicaId
    ) {
      settledVoterTargetReplicaIds.add(operation.targetReplicaId);
    }
  }

  let inFlightAddCount = 0;
  let inFlightReplaceInCreationCount = 0;
  for (const operation of operations) {
    if (!operation.addTransitional) {
      continue;
    }
    if (operation.type === OperationType.ADD) {
      if (
        operation.targetReplicaId &&
        committedReplicaIds.has(operation.targetReplicaId)
      ) {
        continue;
      }
      inFlightAddCount += 1;
    } else if (operation.type === OperationType.REPLACE) {
      if (
        operation.targetReplicaId &&
        activeReplicaIds.has(operation.targetReplicaId)
      ) {
        continue;
      }
      inFlightReplaceInCreationCount += 1;
    }
  }

  let drainPhaseReplacementCredit = 0;
  const creditedTargetReplicaIds = new Set();
  for (const operation of operations) {
    if (operation.type !== OperationType.REPLACE) {
      continue;
    }
    if (
      operation.sourceReplicaId &&
      activeReplicaIds.has(operation.sourceReplicaId)
    ) {
      continue;
    }
    const explicitTarget = operation.targetReplicaId &&
      replicasById.get(operation.targetReplicaId);
    const candidates = explicitTarget && !explicitTarget.active &&
      explicitTarget.accountingOccupied ?
      [explicitTarget.replicaId] :
      nonActiveOccupiedByNode.get(operation.targetNodeId) || [];
    const targetReplicaId = candidates.find((replicaId) =>
      replicaId !== operation.sourceReplicaId &&
      !creditedTargetReplicaIds.has(replicaId),
    );
    if (!targetReplicaId) {
      continue;
    }
    creditedTargetReplicaIds.add(targetReplicaId);
    drainPhaseReplacementCredit += 1;
  }

  const rowObservedAtMs = Number.isFinite(committedObservation.observedAtMs) ?
    committedObservation.observedAtMs :
    null;
  const operationObservedAtMs =
    Number.isFinite(operationObservation.observedAtMs) ?
      operationObservation.observedAtMs :
      null;
  const observedAtSkewMs =
    rowObservedAtMs !== null && operationObservedAtMs !== null ?
      Math.abs(rowObservedAtMs - operationObservedAtMs) :
      null;
  const maxObservedAtSkewMs = Number.isFinite(options.maxObservedAtSkewMs) ?
    Math.max(0, options.maxObservedAtSkewMs) :
    1_000;
  const sourceChangedDuringCapture =
    committedObservation.revisionBefore !== undefined &&
      committedObservation.revisionAfter !== undefined &&
      committedObservation.revisionBefore !== committedObservation.revisionAfter ||
    operationObservation.revisionBefore !== undefined &&
      operationObservation.revisionAfter !== undefined &&
      operationObservation.revisionBefore !== operationObservation.revisionAfter;
  const watermarkChangedDuringCapture =
    committedObservation.watermarkBefore !== undefined &&
      committedObservation.watermarkAfter !== undefined &&
      committedObservation.watermarkBefore !== committedObservation.watermarkAfter ||
    operationObservation.watermarkBefore !== undefined &&
      operationObservation.watermarkAfter !== undefined &&
      operationObservation.watermarkBefore !== operationObservation.watermarkAfter;
  const unavailableStates = [
    REPLICA_INVENTORY_OBSERVATION_STATE.DEFERRED,
    REPLICA_INVENTORY_OBSERVATION_STATE.UNAVAILABLE,
  ];
  const sourceUnavailable = unavailableStates.includes(committedState) ||
    unavailableStates.includes(operationState);
  const skewExceeded = observedAtSkewMs !== null &&
    observedAtSkewMs > maxObservedAtSkewMs;
  const hasConflict = anomalies.some((anomaly) =>
    anomaly.code.includes('conflict') ||
      anomaly.code ===
        REPLICA_INVENTORY_ANOMALY_CODE.REPLICA_IDENTITY_UNAVAILABLE ||
      anomaly.code ===
        REPLICA_INVENTORY_ANOMALY_CODE.REPLACE_SOURCE_IDENTITY_UNAVAILABLE,
  );
  const activeCount = activeReplicaIds.size;
  const accounting = {
    activeCount,
    activeVoterCount: voterReplicaIds.size,
    occupiedCount:
      replicas.filter((replica) => replica.accountingOccupied).length,
    inFlightAddCount,
    inFlightReplaceInCreationCount,
    drainPhaseReplacementCredit,
    deficitEffectiveCount:
      activeCount + inFlightAddCount + drainPhaseReplacementCredit,
    creationEffectiveCount:
      activeCount + inFlightAddCount + inFlightReplaceInCreationCount,
    settledVoterTargetCount: settledVoterTargetReplicaIds.size,
  };

  return freezeSnapshot({
    entityType: text(options.entityType).toLowerCase(),
    entityId: text(options.entityId),
    capturedAtMs,
    replicas,
    operations,
    occupiedNodeIds: sorted(occupiedNodeIds),
    voterReplicaIds: sorted(voterReplicaIds),
    learnerReplicaIds: sorted(learnerReplicaIds),
    orphanReplicaIds: sorted(orphanReplicaIds),
    voterTargetReplicaIds: sorted(voterTargetReplicaIds),
    settledVoterTargetReplicaIds: sorted(settledVoterTargetReplicaIds),
    voterTargetNodeIds: sorted(voterTargetNodeIds),
    promotableLearnerReplicaIds: sorted(promotableLearnerReplicaIds),
    replicationClassificationState:
      options.replicationStateByReplicaId ?
        REPLICA_INVENTORY_PROVENANCE.CLASSIFICATION_AVAILABLE :
        REPLICA_INVENTORY_PROVENANCE.CLASSIFICATION_UNAVAILABLE,
    accounting,
    anomalies,
    sourceRevisions: {
      committedRows: observationRevision(committedObservation),
      inFlightOperations: observationRevision(operationObservation),
    },
    sourceWatermarks: {
      committedRows: {
        before: committedObservation.watermarkBefore ?? null,
        after: committedObservation.watermarkAfter ?? null,
        causeId: committedObservation.causeId ?? null,
      },
      inFlightOperations: {
        before: operationObservation.watermarkBefore ?? null,
        after: operationObservation.watermarkAfter ?? null,
        causeId: operationObservation.causeId ?? null,
      },
    },
    provenance: {
      atomicityClaim: REPLICA_INVENTORY_PROVENANCE.ATOMICITY_NOT_CLAIMED,
      committedRowsState: committedState,
      inFlightOperationsState: operationState,
      observedAtSkewMs,
      consistency: sourceChangedDuringCapture || watermarkChangedDuringCapture ?
        REPLICA_INVENTORY_CONSISTENCY.SOURCE_CHANGED_DURING_CAPTURE :
        sourceUnavailable ?
          REPLICA_INVENTORY_CONSISTENCY.SOURCE_UNAVAILABLE :
          skewExceeded ?
            REPLICA_INVENTORY_CONSISTENCY.OBSERVATION_SKEW_EXCEEDED :
            observedAtSkewMs === null ?
              REPLICA_INVENTORY_CONSISTENCY.REVISION_UNAVAILABLE :
              REPLICA_INVENTORY_CONSISTENCY.BOUNDED_OBSERVATION_SKEW,
      topologyIncreaseUsable:
        !sourceChangedDuringCapture &&
        !watermarkChangedDuringCapture &&
        !sourceUnavailable &&
        !skewExceeded &&
        !hasConflict,
    },
  });
}

export function occupiesNode(snapshot, nodeId) {
  const normalizedNodeId = text(nodeId);
  return normalizedNodeId.length > 0 &&
    snapshot?.occupiedNodeIds?.includes(normalizedNodeId) === true;
}

export function countsTowardVoterTarget(snapshot, replicaId) {
  const normalizedReplicaId = text(replicaId);
  return normalizedReplicaId.length > 0 &&
    snapshot?.voterTargetReplicaIds?.includes(normalizedReplicaId) === true;
}

export function inFlightAddInfluenceCount(snapshot) {
  return snapshot?.accounting?.inFlightAddCount || 0;
}

export function effectiveReplicaCountAfterOperations(snapshot, view) {
  const accountingField = ACCOUNTING_FIELD_BY_EFFECTIVE_VIEW[view];
  if (!accountingField) {
    throw new Error(`Unknown replica inventory effective view: ${view}`);
  }
  const count = snapshot?.accounting?.[accountingField];
  if (!Number.isFinite(count)) {
    throw new Error(`Replica inventory accounting unavailable for view: ${view}`);
  }
  return count;
}
