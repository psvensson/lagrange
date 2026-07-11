import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../control-plane/control-plane-readiness-constants.js';
import {
  firstStringField,
  uniqueSorted,
} from './admin-helpers.js';

const EMPTY_TEXT = '';
const PRIORITY_RECOVERY_DECISION_SNAPSHOT_SCHEMA_VERSION = 1;
const PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION = 'partition';
const PRIORITY_RECOVERY_RAFT_ROLE_LEARNER = 'learner';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID = 'operation_id';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_PARTITION_ID = 'partition_id';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_ID = 'entity_id';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_TYPE = 'entity_type';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS = 'status';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP = 'workflow_step';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_TARGET_NODE_ID =
  'target_node_id';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_SOURCE_NODE_ID =
  'source_node_id';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_REPLICA_ID = 'replica_id';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT = 'created_at';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT = 'updated_at';
const PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE = 'raft_role';
const PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID = 'node_id';
const PRIORITY_RECOVERY_SERVICE_FIELD_STATUS = 'status';
const PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID = 'partition_id';
const PRIORITY_RECOVERY_STATUS_ACTIVE = 'active';
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE =
  'not_control_plane_recovery_eligible';
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY =
  'recovery_eligible_not_repair_eligible';
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS = 'readiness_unknown';
const PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP =
  'priority_spread_gap';
const PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING =
  'priority_partition_missing';

function normalizePriorityRecoveryInteger(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? Math.floor(parsedValue) : null;
}

function normalizePriorityRecoveryStringList(values = []) {
  return uniqueSorted(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || EMPTY_TEXT).trim())
      .filter((value) => value.length > 0),
  );
}

function inferPriorityRecoveryTableNameFromPartitionId(partitionId) {
  const normalizedPartitionId = String(partitionId || '');
  if (normalizedPartitionId.length === 0) {
    return null;
  }
  const partitionSuffixIndex = normalizedPartitionId.lastIndexOf('-p');
  if (partitionSuffixIndex <= 0) {
    return normalizedPartitionId;
  }
  const suffix = normalizedPartitionId.slice(partitionSuffixIndex + 2);
  if (!/^\d+$/.test(suffix)) {
    return normalizedPartitionId;
  }
  return normalizedPartitionId.slice(0, partitionSuffixIndex);
}

function resolvePriorityRecoveryReasonCodesFromReadiness(readinessEntry) {
  const reasons = Array.isArray(readinessEntry?.reasons) ?
    readinessEntry.reasons :
    [];
  return normalizePriorityRecoveryStringList(
    reasons.map((reason) => String(reason?.code || EMPTY_TEXT).trim()),
  );
}

function buildPriorityRecoveryPlannerByPartitionId(priorityPartitionSummary) {
  const normalizedSummary =
    priorityPartitionSummary &&
    typeof priorityPartitionSummary === 'object' ?
      priorityPartitionSummary :
      null;
  const blockedPartitions = Array.isArray(normalizedSummary?.blockedPartitions) ?
    normalizedSummary.blockedPartitions :
    [];
  const missingPartitionIds = normalizePriorityRecoveryStringList(
    normalizedSummary?.missingPartitionIds,
  );
  const plannerByPartitionId = {};
  for (const partition of blockedPartitions) {
    const partitionId = String(partition?.partitionId || '').trim();
    if (partitionId.length === 0) {
      continue;
    }
    const spreadGap = Math.max(
      0,
      normalizePriorityRecoveryInteger(partition?.spreadGap) || 0,
    );
    plannerByPartitionId[partitionId] = {
      partitionId,
      requiredDistinctNodeCount: normalizePriorityRecoveryInteger(
        partition?.requiredDistinctNodeCount,
      ),
      readyDistinctNodeCount: normalizePriorityRecoveryInteger(
        partition?.readyDistinctNodeCount,
      ),
      spreadGap,
      ready: spreadGap === 0,
      reasons:
        spreadGap > 0 ?
          [PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP] :
          [],
    };
  }
  for (const partitionId of missingPartitionIds) {
    if (plannerByPartitionId[partitionId]) {
      if (
        !plannerByPartitionId[partitionId].reasons.includes(
          PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING,
        )
      ) {
        plannerByPartitionId[partitionId].reasons.push(
          PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING,
        );
      }
      continue;
    }
    plannerByPartitionId[partitionId] = {
      partitionId,
      requiredDistinctNodeCount: normalizePriorityRecoveryInteger(
        normalizedSummary?.requiredDistinctNodeCount,
      ),
      readyDistinctNodeCount: 0,
      spreadGap:
        normalizePriorityRecoveryInteger(
          normalizedSummary?.requiredDistinctNodeCount,
        ) || 1,
      ready: false,
      reasons: [PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING],
    };
  }
  return plannerByPartitionId;
}

function buildPriorityRecoveryReplicaOperationContexts(
  replicaOperationRows = [],
  replicaOperationsSummary = null,
) {
  const operationTimelineById =
    replicaOperationsSummary?.operationTimelineById &&
    typeof replicaOperationsSummary.operationTimelineById === 'object' ?
      replicaOperationsSummary.operationTimelineById :
      {};
  const byOperationId = {};
  const byPartitionId = {};
  for (const replicaOperationRow of Array.isArray(replicaOperationRows) ?
    replicaOperationRows :
    []) {
    const operationId = firstStringField(
      replicaOperationRow,
      PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID,
      'operationId',
    );
    if (!operationId) {
      continue;
    }
    const entityType = String(
      firstStringField(
        replicaOperationRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_TYPE,
        'entityType',
        'service_type',
        'serviceType',
      ) || PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION,
    ).toLowerCase();
    if (
      entityType !== PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION
    ) {
      continue;
    }
    const partitionId = firstStringField(
      replicaOperationRow,
      PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_PARTITION_ID,
      'partitionId',
      PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_ENTITY_ID,
      'entityId',
    );
    if (!partitionId) {
      continue;
    }
    const timeline = Array.isArray(operationTimelineById[operationId]) ?
      operationTimelineById[operationId] :
      [];
    const timelineSteps = normalizePriorityRecoveryStringList(
      timeline.map((entry) => String(entry?.step || '').trim()),
    );
    const latestTimelineEntry =
      timeline.length > 0 ? timeline[timeline.length - 1] : null;
    const context = {
      operationId,
      partitionId,
      tableName: inferPriorityRecoveryTableNameFromPartitionId(partitionId),
      type: String(
        firstStringField(
          replicaOperationRow,
          'type',
          'operation_type',
          'operationType',
        ) || '',
      ).toUpperCase(),
      status: String(
        firstStringField(
          replicaOperationRow,
          PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_STATUS,
          'status',
        ) || '',
      ).toLowerCase(),
      workflowStep: String(
        firstStringField(
          replicaOperationRow,
          PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_WORKFLOW_STEP,
          'workflowStep',
        ) || '',
      ).toUpperCase(),
      sourceNodeId: firstStringField(
        replicaOperationRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_SOURCE_NODE_ID,
        'sourceNodeId',
      ),
      targetNodeId: firstStringField(
        replicaOperationRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_TARGET_NODE_ID,
        'targetNodeId',
      ),
      replicaId: firstStringField(
        replicaOperationRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_REPLICA_ID,
        'replicaId',
        'service_id',
        'serviceId',
      ),
      createdAtMs: normalizePriorityRecoveryInteger(
        replicaOperationRow[
          PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT
        ] ?? replicaOperationRow.createdAt,
      ),
      updatedAtMs: normalizePriorityRecoveryInteger(
        replicaOperationRow[
          PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT
        ] ?? replicaOperationRow.updatedAt,
      ),
      timelineLength: timeline.length,
      timelineStepCount: timelineSteps.length,
      latestTimelineStep:
        String(latestTimelineEntry?.step || '').toUpperCase() || null,
      latestTimelineStatus:
        String(latestTimelineEntry?.status || '').toLowerCase() || null,
      latestTimelineInFlight: latestTimelineEntry?.inFlight === true,
    };
    byOperationId[operationId] = context;
    if (!byPartitionId[partitionId]) {
      byPartitionId[partitionId] = [];
    }
    byPartitionId[partitionId].push(context);
  }
  for (const partitionId of Object.keys(byPartitionId)) {
    byPartitionId[partitionId].sort((left, right) =>
      String(left.operationId).localeCompare(String(right.operationId)),
    );
  }
  return {
    byOperationId,
    byPartitionId,
  };
}

function buildPriorityRecoveryLearnerPromotionByPartitionId(
  serviceRows = [],
  readinessByNodeId = {},
) {
  const learnerByPartitionId = {};
  for (const serviceRow of Array.isArray(serviceRows) ? serviceRows : []) {
    const partitionId = firstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID,
      'partitionId',
    );
    if (!partitionId) {
      continue;
    }
    const status = String(
      firstStringField(
        serviceRow,
        PRIORITY_RECOVERY_SERVICE_FIELD_STATUS,
        'status',
      ) || '',
    ).toLowerCase();
    const raftRole = String(
      firstStringField(
        serviceRow,
        PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE,
        'raftRole',
      ) || '',
    ).toLowerCase();
    if (
      status !== PRIORITY_RECOVERY_STATUS_ACTIVE ||
      raftRole !== PRIORITY_RECOVERY_RAFT_ROLE_LEARNER
    ) {
      continue;
    }
    const nodeId = firstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID,
      'nodeId',
    );
    if (!nodeId) {
      continue;
    }
    if (!learnerByPartitionId[partitionId]) {
      learnerByPartitionId[partitionId] = [];
    }
    learnerByPartitionId[partitionId].push(nodeId);
  }
  const learnerPromotionByPartitionId = {};
  for (const [partitionId, learnerNodeIds] of Object.entries(
    learnerByPartitionId,
  )) {
    const learnerHoldByNodeId = {};
    const promotableLearnerNodeIds = [];
    for (const nodeId of normalizePriorityRecoveryStringList(learnerNodeIds)) {
      const readiness = readinessByNodeId[nodeId] || null;
      const dimensions =
        readiness?.dimensions && typeof readiness.dimensions === 'object' ?
          readiness.dimensions :
          {};
      const repairEligible =
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true;
      const recoveryEligible =
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
        ] === true;
      if (repairEligible) {
        promotableLearnerNodeIds.push(nodeId);
        continue;
      }
      const reasonCodes =
        resolvePriorityRecoveryReasonCodesFromReadiness(readiness);
      learnerHoldByNodeId[nodeId] = {
        holdReason: readiness ?
          recoveryEligible ?
            PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY :
            PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE :
          PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS,
        reasonCodes,
      };
    }
    learnerPromotionByPartitionId[partitionId] = {
      activeLearnerNodeIds: normalizePriorityRecoveryStringList(learnerNodeIds),
      promotableLearnerNodeIds,
      activeLearnerNodeCount: learnerNodeIds.length,
      promotableLearnerNodeCount: promotableLearnerNodeIds.length,
      learnerHoldByNodeId,
    };
  }
  return learnerPromotionByPartitionId;
}

export {
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_SCHEMA_VERSION,
  buildPriorityRecoveryLearnerPromotionByPartitionId,
  buildPriorityRecoveryPlannerByPartitionId,
  buildPriorityRecoveryReplicaOperationContexts,
  inferPriorityRecoveryTableNameFromPartitionId,
  resolvePriorityRecoveryReasonCodesFromReadiness,
};
