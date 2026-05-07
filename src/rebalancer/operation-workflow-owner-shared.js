/**
 * OperationWorkflowOwner — single-flight owner keys, transition/claim
 * progression, and observed-progress reconciliation entry.
 *
 * Extracted from RebalanceCoordinator per D7.1 / Requirement 6.2.
 * The coordinator facade delegates workflow progression to this owner.
 */

import {ControlPlaneReadinessService} from '../control-plane/control-plane-readiness-service.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../control-plane/control-plane-publication-merge.js';
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {
  classifyTransportDeliveryOutcome,
  isDeliveredTransportDeliveryOutcome,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
} from '../transport/transport-semantic-outcome.js';
import {TRANSPORT_ERROR_MSG} from '../constants/transport.js';
import {resolvePriorityRecoveryActiveNodeCohort} from '../control-plane/active-node-projection.js';
import {
  buildPriorityRecoveryDecisionSnapshot,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryBlockedPartitionIds,
  hasPriorityRecoverySpreadGap,
} from '../control-plane/priority-recovery-snapshot.js';
import {
  PRIORITY_RECOVERY_COMPLETION_STATE,
  buildPriorityRecoveryCompletion,
} from '../control-plane/priority-recovery-completion.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  isPriorityControlPlanePartition,
  isSystemTablePartition,
} from '../bootstrap/system-partition-classification.js';
import {
  WORKFLOW_STEP,
  NUM,
  TIME_MS,
  METRICS_LOG_TAG,
  TYPEOF,
  UNIFIED_SERVICE_TYPE,
} from '../constants/index.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  buildControlPlaneQueryOptions,
  buildTimeoutClassification,
  createChildTimeoutBudget,
  createTopLevelOperationBudget,
} from '../control-plane/timeout-budget.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  OPERATION_METADATA_KEY,
  ReplicaStatus,
  WORKFLOW_STEP_TO_STATUS,
  OperationType,
  getWorkflowSteps,
  isCoordinatorOwnedOperationType,
} from './replica-status.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationReason,
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from './replica-operation-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
} from './replica-operation-repository.js';
import {
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REBALANCER_SKIP_REASON,
  OPERATION_TRANSITION_REASON,
} from './rebalancer-constants.js';
import {
  EXECUTOR_OUTCOME_TYPE,
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_ACTION,
  EXECUTOR_OUTCOME_ACTION_MAP,
} from './executor-outcome-constants.js';
import {TRANSACTION_STATUS} from '../query/distributed/distributed-transaction-coordinator.js';
import {QUERY_ERROR_MSG} from '../query/query-constants.js';
import {PARTITION_SERVICE_ERROR_MSG} from '../partition/partition-service-constants.js';
import {SQL_RECONCILIATION_REASON} from '../control-plane/read-model-contract.js';
const OPERATION_WORKFLOW_OWNER_LITERAL = Object.freeze({
  CLOSE_PAREN: ')',
  COMMA_SPACE: ', ',
  COMMITTED_REPLICA_OPERATION_TRANSITION_NOT_YET_AUTHORITATIVELY_VISIBLE:
    'Committed replica operation transition not yet authoritatively visible',
  CANNOT_BE_REMOVED_WHILE: ' cannot be removed while',
  CONTROL_PLANE_PRESSURE_DEGRADED: 'CONTROL_PLANE_PRESSURE_DEGRADED',
  CONTROL_PLANE_PRESSURE_DEGRADED_WHILE_CLAIMING_PRIORITY:
    'control_plane_pressure_degraded while claiming priority ',
  COORDINATOR_CREATED_OPERATION: 'coordinator_created_operation',
  COORDINATOR_CREATED_REMOTE_HANDOFF: 'coordinator_created_remote_handoff',
  CRITICAL: 'critical',
  CRITICAL_PARTITION: 'Critical partition ',
  DELETE: 'DELETE',
  DOES_NOT_INCLUDE_PROJECTED_VOTER_DASH_READY_NODES:
    ' does not include projected voter-ready nodes ',
  DISPATCH: 'dispatch',
  DISPATCH_RETRY: 'dispatch_retry',
  DISPATCH_TRANSITION: 'dispatch transition',
  EMPTY_JSON_ARRAY: '[]',
  EMPTY_STRING: '',
  EXECUTE: 'execute',
  EXECUTE_RECONCILE: 'execute_reconcile',
  EXECUTOR_OUTCOME: 'executor_outcome',
  FAILED_TO_READ_AUTHORITATIVE_TRANSITION_PARTICIPANT_STATE:
    'Failed to read authoritative transition participant state',
  FAILED_TO_READ_AUTHORITATIVE_TRANSITION_TRANSACTION_STATE:
    'Failed to read authoritative transition transaction state',
  FAILED_TO_RECOVER_TRANSITION_TRANSACTION:
    'Failed to recover transition transaction',
  FAILED_TO_RESOLVE_MINREPLICACOUNT_FOR_CRITICAL:
    'Failed to resolve minReplicaCount for critical',
  FAILED_TO_ROLL_BACK_TRANSITION_TRANSACTION:
    'Failed to roll back transition transaction',
  FUNCTION: 'function',
  IN_PROGRESS: 'in_progress',
  IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR:
    ' is no longer in the current eligible cohort for ',
  IS_NOT_VOTER_DASH_READY: ' is not voter-ready',
  IS_UNAVAILABLE: ' is unavailable',
  NODE_RECOVERY_DASH_INCOMPLETE_OPERATION:
    'Node recovery - incomplete operation',
  NODE_RECOVERY_DASH_INCOMPLETE_REMOVAL_OPERATION:
    'Node recovery - incomplete removal operation',
  OBJECT: 'object',
  OBSERVED: 'observed',
  OBSERVED_PROGRESS: 'observed_progress',
  OPEN_PAREN: ' (',
  OPERATIONWORKFLOWOWNER_REQUIRES_GETACTUALREPLICASTATUS_OPEN_PAREN_CLOSE_PAREN:
    'OperationWorkflowOwner requires getActualReplicaStatus()',
  PARTITION_SAFETY_CHECK: ' partition safety check',
  PRIORITY_CLAIM_CAS: 'priority_claim_cas',
  PRIORITY_ACTIVE_REPLACE_RESUME: 'priority_active_replace_resume',
  PRIORITY_CONTROL_DASH_PLANE_PARTITION: 'Priority control-plane partition ',
  PRIORITY_RECOVERY_TARGET_NODE: 'Priority recovery target node ',
  PUBLICATION_STATUS_IS: ' publication status is ',
  HANDOFF_PENDING_BEFORE_SAFE_REMOVAL: ' handoff pending before safe removal',
  REPLACEMENT_LEADER_OWNERSHIP_PENDING_BEFORE_SAFE_REMOVAL:
    ' replacement leader ownership pending before safe removal',
  REPLACEMENT_LEADER_ELECTION_RETURNED_NOT_FOUND:
    ' replacement leader election returned not_found before safe removal',
  PRIORITY_SPREAD: 'priority spread',
  PRIORITY_SPREAD_HAS_NOT_CONVERGED: ' priority spread has not converged',
  PROGRESS: 'progress',
  PROJECTED_VOTER_DASH_READY_SPREAD: 'projected voter-ready spread',
  PROJECTED_VOTER_DASH_READY_SPREAD_WOULD_FALL_BELOW_THE_PUBLISHED:
    ' projected voter-ready spread would fall below the published ',
  PUBLISHED_MEMBERSHIP: 'published membership',
  PUBLISHED_MEMBERSHIP_SAFETY_IS_UNAVAILABLE:
    ' published membership safety is unavailable',
  RECOVERY_PROJECTION_MEMBERSHIP: 'recovery projection membership',
  QUESTION_MARK: '?',
  RECOVERY: 'recovery',
  REPLACE_SOURCE_LEADER_HANDOFF: 'replace_source_leader_handoff',
  REPLACE_SOURCE_REMOVAL: 'replace_source_removal',
  REPLACEMENT_REPLICA: ' replacement replica',
  REPLACEMENT_REPLICA_2: ' replacement replica ',
  REPLACEMENT_REPLICA_3: 'replacement replica',
  REPLICA_OPERATION_DISPATCH: 'replica_operation_dispatch',
  REPLICA_FAILED_DURING_OPERATION_RECONCILIATION:
    'Replica failed during operation reconciliation',
  REPLICA_FAILED_DURING_REMOVE_RECONCILIATION:
    'Replica failed during remove reconciliation',
  REPLICA_FAILED_DURING_SYNC: 'Replica failed during sync',
  REPLICA_MISSING_DURING_STOPPING_RECONCILIATION:
    'Replica missing during STOPPING reconciliation',
  REPLICA_NOT_FOUND_DURING_RECOVERY_RECONCILIATION:
    'Replica not found during recovery reconciliation',
  REQUIREMENT: 'requirement',
  RETRYABLE_CONTROL_DASH_PLANE_TRANSITION_FAILURE:
    'Retryable control-plane transition failure',
  ROTATING_TRANSITION_EXECUTION_SESSION_AFTER_STALE_SESSION_COLLISION:
    'Rotating transition execution session after stale session collision',
  SAFETY_CHECK_UNAVAILABLE: ' safety check unavailable',
  SAFETY_CHECK_UNAVAILABLE_2: 'safety check unavailable',
  SAFE_REMOVAL_UNAVAILABLE_SUFFIX: ' is unavailable for safe removal',
  SOURCE_LEADER: ' source leader ',
  STRING: 'string',
  STOPPING_SOURCE_REMOVAL_OBSERVATION_DEFERRED:
    'control_plane_pressure_degraded while observing STOPPING source removal',
  SYNTHETIC_UPSERT: 'UPSERT',
  TRANSACTION: 'transaction',
  TRANSITION_RETRY_RESUME: 'transition_retry_resume',
  TRANSITION_SESSION_RECOVERY_PROBE_FAILED:
    'Transition session recovery probe failed',
  WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM:
    ' would drop voter-ready replicas below minimum',
  WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2:
    'would drop voter-ready replicas below minimum',
});

const DEFAULT_MIN_REPLICA_COUNT = NUM.THREE;
const REMOVE_SAFETY_OWNER_PARTICIPATION_KIND =
  CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ;
const REMOVE_SAFETY_READINESS_DIMENSION =
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;

const FAILURE_LOG_LEVEL = Object.freeze({
  ERROR: 'error',
  WARN: 'warn',
});

const OPERATION_SINGLE_FLIGHT_SCOPE = Object.freeze({
  CREATE: 'create',
  CREATE_BUDGET: 'create-budget',
  OPERATION: 'operation',
});

const OPERATION_OWNER_ACTION = Object.freeze({
  DISPATCH: 'dispatch',
  EXECUTE: 'execute',
});

const EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS = Object.freeze({
  allowPartitionNodeFallback: false,
});
const PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_MATERIALIZED_STATUSES =
  Object.freeze(
    new Set([
      ReplicaStatus.PENDING,
      ReplicaStatus.CREATING,
      ReplicaStatus.SYNCING,
      ReplicaStatus.ACTIVE,
      ReplicaStatus.REMOVING,
    ]),
  );

const OPERATION_LIFECYCLE_ACTION = Object.freeze({
  COMPLETE_PRIORITY_RECOVERY_DRAIN: 'complete_priority_recovery_drain',
  FAIL_PRIORITY_RECOVERY_SUPERSEDED_TARGET:
    'fail_priority_recovery_superseded_target',
  FAIL_PRE_SYNC_RECOVERY: 'fail_pre_sync_recovery',
  FAIL_STOPPING_RECOVERY: 'fail_stopping_recovery',
  EXECUTE_ACTIVE_REPLACE: 'execute_active_replace',
  EXECUTE_REMOVE_DISPATCH: 'execute_remove_dispatch',
  RECONCILE_STOPPING: 'reconcile_stopping',
  RECONCILE_REPLICA_STATUS: 'reconcile_replica_status',
  NOOP: 'noop',
});

const REMOVE_SAFETY_EVALUATION_CLASSIFICATION = Object.freeze({
  SAFE: 'safe',
  DEFER: 'defer',
  FAIL: 'fail',
});

const REMOVE_SAFETY_HANDOFF_FAILURE_POLICY = Object.freeze({
  NONE: 'none',
  FAIL_ON_NOT_FOUND: 'fail_on_not_found',
});

const OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR = ':';

const OPERATION_WORKFLOW_OWNER_REASON = Object.freeze({
  OPERATION_ID_REQUIRED: 'operation_id_required',
  OPERATION_NOT_DISPATCHABLE: 'operation_not_dispatchable',
  OPERATION_NOT_FOUND: 'operation_not_found',
  SHUTDOWN_IN_PROGRESS: 'shutdown_in_progress',
});

const OPERATION_HANDLER = Object.freeze({
  [SERVICE_TYPE.PARTITION]: 'replica-handler',
  [SERVICE_TYPE.MESSAGE_GROUP]: 'message-group-handler',
  [UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE]: 'runtime-service-handler',
});

const OBSERVED_PROGRESS_RELEVANT_SERVICE_STATUSES = Object.freeze(
  new Set([
    ReplicaStatus.PENDING,
    ReplicaStatus.CREATING,
    ReplicaStatus.SYNCING,
    ReplicaStatus.ACTIVE,
    ReplicaStatus.REMOVING,
    ReplicaStatus.FAILED,
  ]),
);

const OBSERVED_PROGRESS_RELEVANT_WORKFLOW_STEPS = Object.freeze(
  new Set([
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
    WORKFLOW_STEP.STOPPING,
  ]),
);

const SAFETY_DEFERRED_LOG_THROTTLE_MS = TIME_MS.SECOND * NUM.FIVE;
const SAFETY_DEFERRED_RETRY_DELAY_MS = TIME_MS.SECOND;
const OBSERVED_PROGRESS_RETRY_DELAY_MS = TIME_MS.SECOND / 4;
const DISPATCH_RETRY_DELAY_MS = TIME_MS.SECOND / 4;
const REPLICA_OPERATION_DISPATCH_TIMEOUT_MS = TIME_MS.SECOND * NUM.FIVE;
const REPLICA_OPERATION_DISPATCH_TIMEOUT_RETRY_AFTER_MS = TIME_MS.SECOND;
const COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS = TIME_MS.SECOND;
const TRANSITION_RETRY_DELAY_MS = TIME_MS.SECOND / 4;

const TRANSITION_STEP_OPTIONS = Object.freeze({
  DEFER_COMMITTED_MARK: Object.freeze({
    markCommitted: false,
  }),
});

const OPERATION_TRANSITION_SESSION_ATTEMPT_PREFIX = 'attempt';
const PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS = TIME_MS.MINUTE;
const RECOVERABLE_TRANSITION_COMMIT_STATUS = Object.freeze(
  new Set([TRANSACTION_STATUS.PREPARED, TRANSACTION_STATUS.COMMITTING]),
);
const RECOVERABLE_TRANSITION_ROLLBACK_STATUS = Object.freeze(
  new Set([
    TRANSACTION_STATUS.ACTIVE,
    TRANSACTION_STATUS.PREPARING,
    TRANSACTION_STATUS.ROLLING_BACK,
  ]),
);
const AUTHORITATIVE_TRANSITION_RECOVERY_STATUS = Object.freeze(
  new Set([
    ...RECOVERABLE_TRANSITION_COMMIT_STATUS,
    ...RECOVERABLE_TRANSITION_ROLLBACK_STATUS,
  ]),
);

const PRIORITY_REMOVE_SAFETY_MEMBERSHIP_SOURCE = Object.freeze({
  PUBLISHED_MEMBERSHIP: 'published membership',
  RECOVERY_PROJECTION_MEMBERSHIP: 'recovery projection membership',
});
const REPLACE_SOURCE_LEADER_HANDOFF_REQUIRED_PARTITION_IDS = new Set([
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS],
]);
const PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE = Object.freeze({
  SAFE: 'safe',
  NOT_APPLICABLE: 'not_applicable',
  PUBLICATION_STATUS_UNAVAILABLE: 'publication_status_unavailable',
  WAIT_PUBLICATION_PUBLISHED: 'wait_publication_published',
  REQUEST_SOURCE_LEADER_HANDOFF: 'request_source_leader_handoff',
  REQUEST_REPLACEMENT_LEADER_ELECTION: 'request_replacement_leader_election',
  FAIL_REPLACEMENT_REPLICA_NOT_FOUND:
    'fail_replacement_replica_not_found',
  WAIT_REPLACEMENT_LEADER_OWNERSHIP: 'wait_replacement_leader_ownership',
});
const PRIORITY_PUBLICATION_SOURCE_ROLE_STATE = Object.freeze({
  FOLLOWER: 'follower',
  LEADER: 'leader',
  UNKNOWN: 'unknown',
});
const PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE = Object.freeze({
  REQUEST_RETRY_AFTER_MS: TIME_MS.SECOND * NUM.FIVE,
  STALE_AFTER_MS: TIME_MS.MINUTE,
});
const TRANSITION_RECOVERY_READ_OPTIONS = Object.freeze({
  ...buildControlPlaneQueryOptions(),
  routingReadinessDimension:
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
});
const TRANSITION_RECOVERY_SQL = Object.freeze({
  SELECT_TRANSACTIONS_BY_SESSION:
    'SELECT * FROM sql_transactions WHERE session_id = ?',
});
const REMOVE_SAFETY_READ_QUERY_OPTIONS = Object.freeze({
  ...buildControlPlaneQueryOptions(),
  routingReadinessDimension:
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
});
const REMOVE_SAFETY_SQL = Object.freeze({
  SELECT_PARTITION_REPLICA_ROWS:
    'SELECT * FROM services WHERE service_type = ? AND partition_id = ?',
  SELECT_PARTITION_ROW:
    'SELECT * FROM partitions WHERE partition_id = ? LIMIT 1',
});

function normalizeNodeIdList(nodeIds) {
  return [
    ...new Set(
      (Array.isArray(nodeIds) ? nodeIds : [])
        .map((nodeId) =>
          typeof nodeId === TYPEOF.STRING ?
            nodeId.trim() :
            OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING,
        )
        .filter((nodeId) => nodeId.length > NUM.ZERO),
    ),
  ];
}

function normalizeReplicaRowNodeIds(rows = []) {
  return normalizeNodeIdList(
    (Array.isArray(rows) ? rows : []).map((row) => {
      return typeof row?.node_id === TYPEOF.STRING ?
        row.node_id.trim() :
        OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING;
    }),
  );
}

function buildSelectRowsByTransactionIdsSql(tableName, transactionIds) {
  return `SELECT * FROM ${tableName} WHERE transaction_id IN (${transactionIds
    .map(() => OPERATION_WORKFLOW_OWNER_LITERAL.QUESTION_MARK)
    .join(OPERATION_WORKFLOW_OWNER_LITERAL.COMMA_SPACE)})`;
}

/**
 * Owns single-flight owner-key execution, workflow step advancement,
 * claim/dispatch progression, and observed-progress reconciliation.
 *
 * Dependencies are injected by the coordinator facade at construction.
 */

export const OPERATION_WORKFLOW_OWNER_SHARED = {
  AUTHORITATIVE_TRANSITION_RECOVERY_STATUS,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS,
  ControlPlaneField,
  ControlPlaneMessageType,
  ControlPlaneReadinessService,
  DEFAULT_MIN_REPLICA_COUNT,
  DISPATCH_RETRY_DELAY_MS,
  EXACT_TARGET_REPLICA_OBSERVATION_OPTIONS,
  EXECUTOR_OUTCOME_ACTION,
  EXECUTOR_OUTCOME_ACTION_MAP,
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_TYPE,
  FAILURE_LOG_LEVEL,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  INITIAL_PARTITION_IDS,
  METRICS_LOG_TAG,
  NUM,
  OBSERVED_PROGRESS_RELEVANT_SERVICE_STATUSES,
  OBSERVED_PROGRESS_RELEVANT_WORKFLOW_STEPS,
  OBSERVED_PROGRESS_RETRY_DELAY_MS,
  OPERATION_HANDLER,
  OPERATION_LIFECYCLE_ACTION,
  OPERATION_METADATA_KEY,
  OPERATION_OWNER_ACTION,
  OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR,
  OPERATION_SINGLE_FLIGHT_SCOPE,
  OPERATION_TRANSITION_REASON,
  OPERATION_TRANSITION_SESSION_ATTEMPT_PREFIX,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OPERATION_WORKFLOW_OWNER_REASON,
  OperationType,
  PARTITION_SERVICE_ERROR_MSG,
  PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS,
  PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  PRIORITY_PUBLICATION_SOURCE_ROLE_STATE,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_MATERIALIZED_STATUSES,
  PRIORITY_REMOVE_SAFETY_MEMBERSHIP_SOURCE,
  QUERY_ERROR_MSG,
  RAFT_ROLE,
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_DEFER_REASON,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  RECOVERABLE_TRANSITION_COMMIT_STATUS,
  RECOVERABLE_TRANSITION_ROLLBACK_STATUS,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
  REMOVE_SAFETY_HANDOFF_FAILURE_POLICY,
  REMOVE_SAFETY_OWNER_PARTICIPATION_KIND,
  REMOVE_SAFETY_READINESS_DIMENSION,
  REMOVE_SAFETY_READ_QUERY_OPTIONS,
  REMOVE_SAFETY_SQL,
  REPLACE_SOURCE_LEADER_HANDOFF_REQUIRED_PARTITION_IDS,
  REPLICA_OPERATION_DISPATCH_TIMEOUT_MS,
  REPLICA_OPERATION_DISPATCH_TIMEOUT_RETRY_AFTER_MS,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationReason,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  SAFETY_DEFERRED_LOG_THROTTLE_MS,
  SAFETY_DEFERRED_RETRY_DELAY_MS,
  SERVICE_TYPE,
  SQL_RECONCILIATION_REASON,
  SYSTEM_TABLE_NAME,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  TIME_MS,
  TRANSPORT_ERROR_MSG,
  TRANSACTION_STATUS,
  TRANSITION_RECOVERY_READ_OPTIONS,
  TRANSITION_RECOVERY_SQL,
  TRANSITION_RETRY_DELAY_MS,
  TRANSITION_STEP_OPTIONS,
  TYPEOF,
  UNIFIED_SERVICE_TYPE,
  WORKFLOW_STEP,
  WORKFLOW_STEP_TO_STATUS,
  buildControlPlaneQueryOptions,
  buildPriorityRecoveryBlockedPartitionIds,
  buildPriorityRecoveryCompletion,
  buildPriorityRecoveryDecisionSnapshot,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryOperationContextFromRecord,
  buildSelectRowsByTransactionIdsSql,
  buildTimeoutClassification,
  classifyTransportDeliveryOutcome,
  createChildTimeoutBudget,
  createTopLevelOperationBudget,
  getControlPlaneRetryAfterMs,
  getWorkflowSteps,
  hasPriorityRecoverySpreadGap,
  isCoordinatorOwnedOperationType,
  isDeliveredTransportDeliveryOutcome,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
  isSystemTablePartition,
  normalizeNodeIdList,
  normalizeReplicaRowNodeIds,
  readAuthoritativeControlPlaneRows,
  resolvePriorityRecoveryActiveNodeCohort,
};
