import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {PRIORITY_RECOVERY_WORKFLOW_TIMEOUT_STEPS} from './replica-operation-step-policy.js';

const {
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DIMENSION,
  DEFAULT_MIN_REPLICA_COUNT,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  INITIAL_PARTITION_IDS,
  NUM,
  OPERATION_HANDLER,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  PRIORITY_PUBLICATION_SOURCE_ROLE_STATE,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  RAFT_ROLE,
  REBALANCER_SKIP_REASON,
  REMOVE_SAFETY_HANDOFF_FAILURE_POLICY,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
  REMOVE_SAFETY_READ_QUERY_OPTIONS,
  REMOVE_SAFETY_SQL,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationReason,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  SERVICE_TYPE,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  WORKFLOW_STEP,
  buildPriorityRecoveryDecisionSnapshot,
  buildPriorityRecoveryOperationContextFromRecord,
  isPriorityControlPlanePartition,
  isSystemTablePartition,
  readAuthoritativeControlPlaneRows,
  resolveOperationHandlerType,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const STOP_PHASE_SOURCE_ABSENT_RESPONSE_STATUSES = Object.freeze(
  new Set([
    ReplicaOperationResponseStatus.NOT_FOUND,
  ]),
);
const VOTER_READY_REPLICA_TOPOLOGY_STATUSES = Object.freeze(
  new Set([
    ReplicaStatus.ACTIVE,
    ReplicaStatus.SYNCING,
  ]),
);
const PRIORITY_RECOVERY_OPERATION_RECORD_FIELD = Object.freeze({
  ENTITY_ID: 'entityId',
  ENTITY_ID_SNAKE: 'entity_id',
  PARTITION_ID: 'partitionId',
  PARTITION_ID_SNAKE: 'partition_id',
});

const REMOVE_SAFETY_HANDOFF_CONTINUATION_STATE = Object.freeze({
  NOT_APPLICABLE: 'not_applicable',
  EXACT_TARGET_ELECTION_EVIDENCE_RECORDED:
    'exact_target_election_evidence_recorded',
});

const REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION = Object.freeze({
  CONTINUE: 'continue',
  WAIT: 'wait',
});

const REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION_BY_STATE = Object.freeze(
  new Map([
    [
      REMOVE_SAFETY_HANDOFF_CONTINUATION_STATE.NOT_APPLICABLE,
      REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION.WAIT,
    ],
    [
      REMOVE_SAFETY_HANDOFF_CONTINUATION_STATE
        .EXACT_TARGET_ELECTION_EVIDENCE_RECORDED,
      REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION.CONTINUE,
    ],
  ]),
);
const PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_STATE =
  Object.freeze({
    SAFE: 'safe',
    HOLD: 'hold',
  });
const PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_TABLE =
  Object.freeze([
    Object.freeze({
      state: PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_STATE.SAFE,
      matches: (evidence) =>
        evidence.priorityRecoveryCompletionSafe === true &&
        evidence.sourceLeadershipReleaseObserved === true &&
        evidence.replacementTopologyVoterSufficient === true &&
        (evidence.partitionLeaderStillSource !== true ||
          evidence.coLocatedLeaderSiblingObserved === true) &&
        evidence.publicationPartition !== true,
    }),
    Object.freeze({
      state: PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_STATE.HOLD,
      matches: () => true,
    }),
  ]);

function decidePriorityPublicationFollowerSourceRemovalSafety(evidence) {
  const decision =
    PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_TABLE.find((entry) =>
      entry.matches(evidence),
    );
  return Object.freeze({
    state:
      decision?.state ||
      PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_STATE.HOLD,
  });
}

function normalizePriorityRecoveryOperationPartitionId(operation = null) {
  return String(
    operation?.[PRIORITY_RECOVERY_OPERATION_RECORD_FIELD.PARTITION_ID] ||
      operation?.[
        PRIORITY_RECOVERY_OPERATION_RECORD_FIELD.PARTITION_ID_SNAKE
      ] ||
      operation?.[PRIORITY_RECOVERY_OPERATION_RECORD_FIELD.ENTITY_ID] ||
      operation?.[PRIORITY_RECOVERY_OPERATION_RECORD_FIELD.ENTITY_ID_SNAKE] ||
      OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
  ).trim();
}

const OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED = Object.freeze({
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DIMENSION,
  DEFAULT_MIN_REPLICA_COUNT,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  INITIAL_PARTITION_IDS,
  NUM,
  OPERATION_HANDLER,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OPERATION_WORKFLOW_OWNER_SHARED,
  OperationType,
  PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_STATE,
  PRIORITY_PUBLICATION_FOLLOWER_SOURCE_REMOVAL_SAFETY_TABLE,
  PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  PRIORITY_PUBLICATION_SOURCE_ROLE_STATE,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_RECOVERY_OPERATION_RECORD_FIELD,
  PRIORITY_RECOVERY_WORKFLOW_TIMEOUT_STEPS,
  RAFT_ROLE,
  REBALANCER_SKIP_REASON,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION,
  REMOVE_SAFETY_HANDOFF_CONTINUATION_ACTION_BY_STATE,
  REMOVE_SAFETY_HANDOFF_CONTINUATION_STATE,
  REMOVE_SAFETY_HANDOFF_FAILURE_POLICY,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
  REMOVE_SAFETY_READ_QUERY_OPTIONS,
  REMOVE_SAFETY_SQL,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationReason,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  SERVICE_TYPE,
  STOP_PHASE_SOURCE_ABSENT_RESPONSE_STATUSES,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  VOTER_READY_REPLICA_TOPOLOGY_STATUSES,
  WORKFLOW_STEP,
  buildPriorityRecoveryDecisionSnapshot,
  buildPriorityRecoveryOperationContextFromRecord,
  decidePriorityPublicationFollowerSourceRemovalSafety,
  isPriorityControlPlanePartition,
  isSystemTablePartition,
  normalizePriorityRecoveryOperationPartitionId,
  readAuthoritativeControlPlaneRows,
  resolveOperationHandlerType,
});

export {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED};
