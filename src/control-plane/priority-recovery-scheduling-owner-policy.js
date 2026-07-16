import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {SERVICE_STATUS} from '../constants/service-status.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {normalizeServiceRow} from './system-row-normalizers.js';

const PRIORITY_RECOVERY_SCHEDULING_OWNER_MODE = Object.freeze({
  CURRENT_OWNER: 'current_owner',
  SURROGATE_OWNER: 'surrogate_owner',
  TARGET_OWNER_FALLBACK: 'target_owner_fallback',
});

const PRIORITY_RECOVERY_SCHEDULING_OWNER_EVIDENCE_SOURCE = Object.freeze({
  LIVE_PRIORITY_PARTITION_LEADERS: 'live_priority_partition_leaders',
  TARGET_PARTITION_FALLBACK: 'target_partition_fallback',
});

const PRIORITY_RECOVERY_SCHEDULING_OWNER_STATE = Object.freeze({
  CURRENT_LEADER_AVAILABLE: 'current_leader_available',
  SURROGATE_LEADER_AVAILABLE: 'surrogate_leader_available',
  LIVE_LEADER_EVIDENCE_UNAVAILABLE: 'live_leader_evidence_unavailable',
});

const PRIORITY_RECOVERY_SCHEDULING_OWNER_STATE_TABLE = Object.freeze([
  Object.freeze({
    state:
      PRIORITY_RECOVERY_SCHEDULING_OWNER_STATE.CURRENT_LEADER_AVAILABLE,
    matches: (evidence) => evidence.currentLeaderAvailable === true,
    select: (evidence) => Object.freeze({
      partitionId: evidence.targetPartitionId,
      mode: PRIORITY_RECOVERY_SCHEDULING_OWNER_MODE.CURRENT_OWNER,
      candidatePartitionIds: evidence.candidatePartitionIds,
      evidenceSource:
        PRIORITY_RECOVERY_SCHEDULING_OWNER_EVIDENCE_SOURCE
          .LIVE_PRIORITY_PARTITION_LEADERS,
    }),
  }),
  Object.freeze({
    state:
      PRIORITY_RECOVERY_SCHEDULING_OWNER_STATE.SURROGATE_LEADER_AVAILABLE,
    matches: (evidence) => evidence.candidatePartitionIds.length > 0,
    select: (evidence) => Object.freeze({
      partitionId: evidence.candidatePartitionIds[0],
      mode: PRIORITY_RECOVERY_SCHEDULING_OWNER_MODE.SURROGATE_OWNER,
      candidatePartitionIds: evidence.candidatePartitionIds,
      evidenceSource:
        PRIORITY_RECOVERY_SCHEDULING_OWNER_EVIDENCE_SOURCE
          .LIVE_PRIORITY_PARTITION_LEADERS,
    }),
  }),
  Object.freeze({
    state:
      PRIORITY_RECOVERY_SCHEDULING_OWNER_STATE
        .LIVE_LEADER_EVIDENCE_UNAVAILABLE,
    matches: () => true,
    select: (evidence) => Object.freeze({
      partitionId: evidence.targetPartitionId,
      mode: PRIORITY_RECOVERY_SCHEDULING_OWNER_MODE.TARGET_OWNER_FALLBACK,
      candidatePartitionIds: evidence.candidatePartitionIds,
      evidenceSource:
        PRIORITY_RECOVERY_SCHEDULING_OWNER_EVIDENCE_SOURCE
          .TARGET_PARTITION_FALLBACK,
    }),
  }),
]);

function normalizePriorityRecoverySchedulingOwnerId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveLivePriorityRecoverySchedulingOwnerPartitionIds(
  serviceRows = [],
  availableNodeIds = [],
) {
  const availableNodeIdSet = new Set(
    (Array.isArray(availableNodeIds) ? availableNodeIds : [])
      .map(normalizePriorityRecoverySchedulingOwnerId)
      .filter((nodeId) => nodeId.length > 0),
  );
  const liveLeaderPartitionIds = new Set();
  for (const serviceRow of Array.isArray(serviceRows) ? serviceRows : []) {
    const normalizedService = normalizeServiceRow(serviceRow);
    if (
      !availableNodeIdSet.has(normalizedService.nodeId) ||
      normalizedService.status !== SERVICE_STATUS.ACTIVE ||
      normalizedService.raftRole !== RAFT_ROLE.LEADER ||
      !classifySystemPartition({
        partitionId: normalizedService.partitionId,
      }).priorityControlPlane
    ) {
      continue;
    }
    liveLeaderPartitionIds.add(normalizedService.partitionId);
  }
  return Object.freeze(
    [...liveLeaderPartitionIds].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
}

function buildPriorityRecoverySchedulingOwnerEvidence(
  targetPartitionId,
  candidatePartitionIds,
) {
  const normalizedTargetPartitionId =
    normalizePriorityRecoverySchedulingOwnerId(targetPartitionId);
  const normalizedCandidatePartitionIds = Object.freeze(
    [...new Set(
      (Array.isArray(candidatePartitionIds) ? candidatePartitionIds : [])
        .map(normalizePriorityRecoverySchedulingOwnerId)
        .filter((partitionId) => partitionId.length > 0),
    )].sort((left, right) => left.localeCompare(right)),
  );
  return Object.freeze({
    targetPartitionId: normalizedTargetPartitionId,
    candidatePartitionIds: normalizedCandidatePartitionIds,
    currentLeaderAvailable:
      normalizedCandidatePartitionIds.includes(normalizedTargetPartitionId),
  });
}

function resolvePriorityRecoverySchedulingOwner(evidence = {}) {
  const tableEntry = PRIORITY_RECOVERY_SCHEDULING_OWNER_STATE_TABLE.find(
    (entry) => entry.matches(evidence),
  );
  return tableEntry.select(evidence);
}

function buildPriorityRecoverySchedulingOwnersByPartitionId(options = {}) {
  const partitionIds = [...new Set(
    (Array.isArray(options.partitionIds) ? options.partitionIds : [])
      .map(normalizePriorityRecoverySchedulingOwnerId)
      .filter((partitionId) => partitionId.length > 0),
  )].sort((left, right) => left.localeCompare(right));
  const candidatePartitionIds =
    resolveLivePriorityRecoverySchedulingOwnerPartitionIds(
      options.serviceRows,
      options.availableNodeIds,
    );
  const schedulingOwnersByPartitionId = new Map();
  for (const partitionId of partitionIds) {
    const evidence = buildPriorityRecoverySchedulingOwnerEvidence(
      partitionId,
      candidatePartitionIds,
    );
    schedulingOwnersByPartitionId.set(
      partitionId,
      resolvePriorityRecoverySchedulingOwner(evidence),
    );
  }
  return schedulingOwnersByPartitionId;
}

function isPriorityRecoverySchedulingOwner(
  decisionSnapshot = null,
  consumerPartitionId = '',
) {
  const normalizedConsumerPartitionId =
    normalizePriorityRecoverySchedulingOwnerId(consumerPartitionId);
  const declaredOwnerPartitionId =
    normalizePriorityRecoverySchedulingOwnerId(
      decisionSnapshot?.schedulingOwner?.partitionId,
    );
  if (declaredOwnerPartitionId.length > 0) {
    return declaredOwnerPartitionId === normalizedConsumerPartitionId;
  }
  const targetPartitionId =
    normalizePriorityRecoverySchedulingOwnerId(
      decisionSnapshot?.partitionId || decisionSnapshot?.partition_id,
    );
  return (
    targetPartitionId.length > 0 &&
    targetPartitionId === normalizedConsumerPartitionId
  );
}

function inheritPriorityRecoverySchedulingOwner(
  decisionSnapshot = null,
  sourceDecisionSnapshot = null,
) {
  const schedulingOwner = sourceDecisionSnapshot?.schedulingOwner;
  if (!decisionSnapshot || !schedulingOwner) {
    return decisionSnapshot;
  }
  return Object.freeze({
    ...decisionSnapshot,
    schedulingOwner,
  });
}

export {
  PRIORITY_RECOVERY_SCHEDULING_OWNER_EVIDENCE_SOURCE,
  PRIORITY_RECOVERY_SCHEDULING_OWNER_MODE,
  PRIORITY_RECOVERY_SCHEDULING_OWNER_STATE,
  PRIORITY_RECOVERY_SCHEDULING_OWNER_STATE_TABLE,
  buildPriorityRecoverySchedulingOwnerEvidence,
  buildPriorityRecoverySchedulingOwnersByPartitionId,
  inheritPriorityRecoverySchedulingOwner,
  isPriorityRecoverySchedulingOwner,
  resolveLivePriorityRecoverySchedulingOwnerPartitionIds,
  resolvePriorityRecoverySchedulingOwner,
};
