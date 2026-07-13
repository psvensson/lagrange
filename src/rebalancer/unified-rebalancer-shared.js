/**
 * Unified Rebalancer - Manages replica placement for partitions and message groups.
 * Uses the same algorithm for all scenarios, driven by policies.
 * Operates fully autonomously - operators never manually specify replica placement.
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.10
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY} from '../cdc/cdc-integration-service.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  classifySystemPartition,
  getPartitionRowFromCache,
  isCriticalTransportControlPlanePartition as isCriticalTransportControlPlanePartitionTable,
} from '../bootstrap/system-partition-classification.js';
import {isBackgroundWorkReadySnapshot as isBackgroundWorkLifecycleReadySnapshot} from '../bootstrap/traffic-readiness-utils.js';
import {StartupRecoveryCoordinator} from '../bootstrap/startup-recovery-coordinator.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from '../control-plane/control-plane-system-table-gateway.js';
import {MovePlanner} from './move-planner.js';
import {StoragePressureBehavior} from './storage-pressure-behavior.js';
import {
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  OperationType,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  REPLICA_OPERATION_TERMINAL_RECORD_SQL_CLAUSE,
  ReplicaStatus,
  TERMINAL_STATUSES,
  isReplaceRemoveDispatchPhase,
  TERMINAL_STATUS_SQL_CLAUSE,
  buildReplicaOperationProgressSnapshot,
  isCoordinatorOwnedOperationType,
  isTerminalReplicaOperationSemanticPhase,
  isTerminalReplicaOperationRecord,
  isTerminalStep,
  isValidWorkflowStep,
  resolveReplicaOperationSemanticPhase,
} from './replica-status.js';
import {REPLICA_OPERATION_VISIBILITY_READ_MODE} from './replica-operation-repository.js';
import {assertCritical} from '../utils/assert.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../control-plane/control-plane-readiness-constants.js';
import {ControlPlaneReadinessService} from '../control-plane/control-plane-readiness-service.js';
import {createControlPlaneRuntimeBundle} from '../control-plane/control-plane-runtime-bundle.js';
import {
  isNodeReadyWithConnection,
  isNodeReadyWithTransport,
  isNodeReadyLeaseExplicitlyCleared,
  isNodeRecordReady,
  wasNodeRecordReadyWhenWritten,
} from '../node/node-readiness-policy.js';
import {
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {getLocalControlPlaneMutationReadinessBlocker} from '../control-plane/control-plane-mutation-readiness.js';
import {
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryBlockedPartitions,
  buildPriorityRecoveryPartitionAssessment,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  hasPriorityRecoverySpreadGap,
  isPriorityRecoveryEmergencyPartition,
  resolvePriorityRecoveryActiveNodeCohort,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  shouldPriorityRecoveryOperationBlockPlanning,
} from '../control-plane/priority-recovery-snapshot.js';
import {buildPublicationRecoveryGateSnapshot} from '../control-plane/publication-recovery-gate.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from '../control-plane/control-plane-publication-merge.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {LIFECYCLE_PHASE} from '../bootstrap/lifecycle-controller-constants.js';
import {
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_DEFAULT_POLICY,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCER_ERROR_MSG,
  REBALANCER_EVENT,
  REBALANCER_LOG_MSG,
  MOVE_REASON,
  REBALANCER_MOVE_TYPE,
  REBALANCER_NODE_STATUS,
  REBALANCER_QUEUE_NAME,
  REBALANCER_SKIP_REASON,
  REBALANCER_SUBSYSTEM,
  REBALANCER_TRIGGER,
  READINESS_SKIP_DETAIL,
  STABILIZATION_RESET_TRIGGER,
} from './rebalancer-constants.js';
import {CLUSTER_READINESS_TIMEOUT_MS} from '../constants/cdc-lifecycle-constants.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  META_SERVICE_ID,
  NUM,
  STATE,
  SERVICE_STATUS,
  TABLES,
  TRANSPORT_TYPE,
  TYPEOF,
  WORKFLOW_STEP,
} from '../constants/index.js';
import {ENDPOINT_SYNC_HEALTH} from '../runtime/endpoint-sync-constants.js';
import {
  normalizeNodeRow,
  normalizeNodeEndpointRow,
  normalizeServiceEndpointRow,
  normalizeServiceRow,
} from '../control-plane/system-row-normalizers.js';
import {OwnerKeyReconcileQueue} from '../workflow/owner-key-reconcile-queue.js';
import {RECONCILE_REASON} from '../workflow/reconcile-queue-constants.js';
import {
  adjustToOddCount,
  getNextOddCount,
  getPreviousOddCount,
  isOddReplicaCount,
} from './odd-replica-count.js';
import {
  isReplicaOperationInFlight,
  isReplicaOperationStale,
  normalizeReplicaOperationRecord,
} from './replica-operation-liveness.js';
const UNIFIED_REBALANCER_LITERAL = Object.freeze({
  ADMISSION_DENIED: 'admission_denied',
  BACKGROUND: 'background',
  BOOTSTRAPREADINESSSTATE: 'bootstrapReadinessState',
  CDCINTEGRATIONSERVICE: 'cdcIntegrationService',
  CRITICAL: 'critical',
  EMPTY_STRING: '',
  FUNCTION: 'function',
  MESSAGEROUTER: 'messageRouter',
  MOVE: 'move',
  NODES: 'nodes',
  NUMBER: 'number',
  ONE: 1,
  ONE_POINT_FIVE: 1.5,
  READ: 'read',
  REBALANCECOORDINATOR: 'rebalanceCoordinator',
  REBALANCER_COLON_SCHEDULE: 'rebalancer:schedule',
  SCHEDULED: 'scheduled',
  SERVICES: 'services',
  SQLQUERYENGINE: 'sqlQueryEngine',
  STARTUPRECOVERYCOORDINATOR: 'startupRecoveryCoordinator',
  SYSTEMTABLECACHE: 'systemTableCache',
  TABLEPOLICYSERVICE: 'tablePolicyService',
  THOUSAND: 1000,
  TWO: 2,
  UPDATE: 'UPDATE',
  ZERO: 0,
});

const EntityType = REBALANCER_ENTITY_TYPE;

const TriggerType = REBALANCER_TRIGGER;

const MoveType = REBALANCER_MOVE_TYPE;

const NodeStatus = REBALANCER_NODE_STATUS;

const DEFAULT_TABLE_POLICY = REBALANCER_DEFAULT_POLICY.TABLE;

const DEFAULT_MESSAGE_GROUP_POLICY = REBALANCER_DEFAULT_POLICY.MESSAGE_GROUP;

const SQL_BUDGET = Object.freeze({
  SELECT_REBALANCE_BUDGET:
    'SELECT config_value FROM config WHERE config_key = ? LIMIT 1',
  SELECT_IN_FLIGHT_COUNT: `SELECT COUNT(*) AS total_count FROM replica_operations
     WHERE type IN (${COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE})
     AND NOT (${REPLICA_OPERATION_TERMINAL_RECORD_SQL_CLAUSE})`,
});

const PRIORITY_BUDGET_BYPASS_COORDINATOR_OPTIONS = Object.freeze({
  concurrentBudgetReadMode:
    REBALANCER_CONCURRENT_BUDGET_READ_MODE.OWNER_RPC_RECHECK_ON_SATURATION,
  bypassEmptyQueryDelay: true,
});

const REBALANCER_BUDGET_READ_OPTIONS = Object.freeze({
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
  localReadConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
  replicaFallbackConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
});

const PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT = 3;

const CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON = Object.freeze({
  NODE_READY_LEASE_INCOMPLETE: 'node_ready_lease_incomplete',
  TRANSITIONAL_NODE_MEMBERSHIP: 'transitional_node_membership',
  TRANSPORT_MEMBERSHIP_EXCEEDS_NODES_CACHE:
    'transport_membership_exceeds_nodes_cache',
  ENDPOINT_VISIBILITY_INCOMPLETE: 'endpoint_visibility_incomplete',
  TOPOLOGY_OPERATIONS_IN_FLIGHT: 'topology_operations_in_flight',
});

const TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE = Object.freeze({
  CACHE: 'cache',
  AUTHORITATIVE: 'authoritative',
});

const CRITICAL_SYSTEM_ENDPOINT_VISIBILITY_AUTHORITATIVE_READ = Object.freeze({
  OWNER: REBALANCER_SUBSYSTEM.UNIFIED,
});

const REBALANCER_RUNTIME_REASON = Object.freeze({
  NODE_BECAME_READY: 'node_became_ready',
  NODE_FAILED: 'node_failed',
  NODE_LEFT_READY: 'node_left_ready',
  NOT_LEADER: 'not_leader',
  NO_AVAILABLE_NODES: 'no_available_nodes',
  NO_CHANGES_NEEDED: 'no_changes_needed',
  SHUTDOWN_IN_PROGRESS: 'shutdown_in_progress',
});

/**
 * UnifiedRebalancer manages replica placement for both partitions and message groups.
 * Each partition/message group leader runs its own rebalancer instance.
 * Leaders make independent decisions that converge to optimal state.
 *
 * NOTE: This class delegates operation execution to RebalanceCoordinator.
 */

export const UNIFIED_REBALANCER_SHARED = {
  CLUSTER_READINESS_TIMEOUT_MS,
  COLUMN,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_WORKLOAD_CLASS,
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  CRITICAL_SYSTEM_ENDPOINT_VISIBILITY_AUTHORITATIVE_READ,
  CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON,
  ConfigurationManager,
  ControlPlaneReadinessService,
  DEFAULT_MESSAGE_GROUP_POLICY,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  DEFAULT_TABLE_POLICY,
  ENDPOINT_STATUS,
  ENDPOINT_SYNC_HEALTH,
  EntityType,
  EventEmitter,
  LIFECYCLE_PHASE,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LoggingService,
  META_SERVICE_ID,
  MovePlanner,
  MoveType,
  NUM,
  NodeStatus,
  OperationType,
  OwnerKeyReconcileQueue,
  PRESSURE_WORK_CLASS,
  PRIORITY_BUDGET_BYPASS_COORDINATOR_OPTIONS,
  PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT,
  PressureGovernor,
  RAFT_ROLE,
  READINESS_SKIP_DETAIL,
  REBALANCER_BUDGET_READ_OPTIONS,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_DEFAULT_POLICY,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_ERROR_MSG,
  REBALANCER_EVENT,
  REBALANCER_LOG_MSG,
  MOVE_REASON,
  REBALANCER_MOVE_TYPE,
  REBALANCER_NODE_STATUS,
  REBALANCER_QUEUE_NAME,
  REBALANCER_RUNTIME_REASON,
  REBALANCER_SKIP_REASON,
  REBALANCER_SUBSYSTEM,
  REBALANCER_TRIGGER,
  RECONCILE_REASON,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  REPLICA_OPERATION_TERMINAL_RECORD_SQL_CLAUSE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaStatus,
  SERVICE_STATUS,
  SQL_BUDGET,
  STABILIZATION_RESET_TRIGGER,
  STATE,
  SYSTEM_TABLE_NAME,
  StartupRecoveryCoordinator,
  StoragePressureBehavior,
  TABLES,
  TERMINAL_STATUSES,
  TERMINAL_STATUS_SQL_CLAUSE,
  TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE,
  TRANSPORT_TYPE,
  TYPEOF,
  TriggerType,
  UNIFIED_REBALANCER_LITERAL,
  WORKFLOW_STEP,
  adjustToOddCount,
  assertCritical,
  buildReplicaOperationProgressSnapshot,
  buildControlPlaneWorkloadProfile,
  buildPriorityRecoveryBlockedPartitions,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  buildPublicationRecoveryGateSnapshot,
  classifySystemPartition,
  createControlPlaneRuntimeBundle,
  getControlPlaneRetryAfterMs,
  getLocalControlPlaneMutationReadinessBlocker,
  getNextOddCount,
  getPartitionRowFromCache,
  getPreviousOddCount,
  hasPriorityRecoverySpreadGap,
  isBackgroundWorkLifecycleReadySnapshot,
  isCoordinatorOwnedOperationType,
  isCriticalTransportControlPlanePartitionTable,
  isPriorityRecoveryEmergencyPartition,
  isNodeReadyLeaseExplicitlyCleared,
  isNodeReadyWithConnection,
  isNodeReadyWithTransport,
  isNodeRecordReady,
  isOddReplicaCount,
  isReplaceRemoveDispatchPhase,
  isReplicaOperationInFlight,
  isReplicaOperationStale,
  isRetryableControlPlaneError,
  isTerminalReplicaOperationSemanticPhase,
  isTerminalReplicaOperationRecord,
  isTerminalStep,
  isValidWorkflowStep,
  normalizeNodeEndpointRow,
  normalizeNodeRow,
  normalizeReplicaOperationRecord,
  normalizeServiceEndpointRow,
  normalizeServiceRow,
  resolvePriorityRecoveryActiveNodeCohort,
  resolveReplicaOperationSemanticPhase,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  shouldPriorityRecoveryOperationBlockPlanning,
  wasNodeRecordReadyWhenWritten,
};
