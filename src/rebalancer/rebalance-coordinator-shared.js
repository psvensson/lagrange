/**
 * RebalanceCoordinator - Owns the complete rebalancing workflow.
 *
 * Architecture (per system guidelines):
 * - NO in-memory operations cache - system cache is single source of truth
 * - All reads go through SQL engine (which uses system cache first, then partition)
 * - All writes go through SQL engine to partition leader
 * - CDC events update system cache automatically
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 6.1, 6.2
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  isCriticalTransportControlPlanePartition as isCriticalTransportControlPlanePartitionTable,
  isPriorityControlPlanePartition as isPriorityControlPlanePartitionTable,
} from '../bootstrap/system-partition-classification.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from '../control-plane/control-plane-readiness-constants.js';
import {ControlPlaneReadinessService} from '../control-plane/control-plane-readiness-service.js';
import {createControlPlaneRuntimeBundle} from '../control-plane/control-plane-runtime-bundle.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryPartitionAssessment,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  isPriorityRecoveryEmergencyPartition,
  resolvePriorityRecoveryActiveNodeCohort,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  shouldPriorityRecoveryOperationBlockPlanning,
} from '../control-plane/priority-recovery-snapshot.js';
import {StartupRecoveryCoordinator} from '../bootstrap/startup-recovery-coordinator.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';
import {
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {OperationLane} from '../workflow/operation-lane.js';
import {
  WORKFLOW_STEP,
  NUM,
  STRING,
  TIME_MS,
  UNIFIED_SERVICE_TYPE,
} from '../constants/index.js';
import {TRANSPORT_EVENT} from '../constants/transport.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {assertCritical} from '../utils/assert.js';
import {
  buildControlPlaneQueryOptions,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  buildTimeoutClassification,
  createChildTimeoutBudget,
  createTopLevelOperationBudget,
} from '../control-plane/timeout-budget.js';
import {
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  OPERATION_METADATA_KEY,
  OperationType,
  ReplicaStatus,
  createOperation as createOperationRecord,
} from './replica-status.js';
import {ReplicaOperationField} from './replica-operation-constants.js';
import {
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_SKIP_REASON,
  REBALANCER_SUBSYSTEM,
} from './rebalancer-constants.js';
import {
  RESERVATION_REASON,
  RESERVATION_STATUS,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
} from './storage-capacity-constants.js';
import {STORAGE_ADMISSION_DECISION_TYPE} from './storage-admission-constants.js';
import {
  ExecutorOutcomeEmitter,
  OUTCOME_EVENT_NAME,
} from './executor-outcome-emitter.js';
import {
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaOperationRepository,
} from './replica-operation-repository.js';
import {OperationWorkflowOwner} from './operation-workflow-owner.js';
import {ProvisioningAdmissionPolicy} from './provisioning-admission-policy.js';
import {buildReplicatedServiceBootstrapTopology} from '../service/replicated-service-topology.js';

/**
 * SQL queries for replica_operations table access.
 * All system information access must go through SQL engine.
 */
const SQL = Object.freeze({
  SELECT_OPERATION_BY_ID:
    'SELECT * FROM replica_operations WHERE operation_id = ?',
  SELECT_INCOMPLETE_OPERATIONS: `SELECT * FROM replica_operations
    WHERE source_node_id = ?
    AND type IN (${COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE})
    AND (
      workflow_step IN (?, ?, ?, ?, ?)
      OR (workflow_step = ? AND type = ?)
    )`,
  SELECT_OPERATIONS_BY_PARTITION:
    'SELECT * FROM replica_operations WHERE partition_id = ?',
  SELECT_OPERATIONS_BY_ENTITY: `SELECT * FROM replica_operations
    WHERE (
      (entity_type = ? AND entity_id = ?)
      OR ((entity_type IS NULL OR entity_type = '') AND partition_id = ?)
    )`,
  SELECT_IN_FLIGHT_FOR_ENTITY_NODE: `SELECT * FROM replica_operations
    WHERE partition_id = ? AND target_node_id = ?
    AND (
      (entity_type = ? AND entity_id = ?)
      OR (entity_type IS NULL OR entity_type = '')
    )`,
  SELECT_IN_FLIGHT_BY_TYPE: `SELECT * FROM replica_operations 
    WHERE type = ?`,
  INSERT_OPERATION: `INSERT INTO replica_operations (
    operation_id, type, partition_id, replica_id, source_node_id, target_node_id,
    status, workflow_step, created_at, updated_at, completed_at, error_message, steps_history,
    entity_type, entity_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  UPDATE_OPERATION: `UPDATE replica_operations SET 
    status = ?, workflow_step = ?, updated_at = ?, completed_at = ?, 
    error_message = ?, steps_history = ?, replica_id = ?
    WHERE operation_id = ?`,
  SELECT_REPLICA_STATUS: 'SELECT status FROM services WHERE service_id = ?',
  SELECT_REPLICA_BY_PARTITION_NODE: `SELECT status FROM services 
    WHERE partition_id = ? AND node_id = ?`,
  SELECT_PARTITION_SERVICES_BY_ENTITY: `SELECT * FROM services
    WHERE service_type = ? AND partition_id = ?`,
  SELECT_MESSAGE_GROUP_SERVICES_BY_ENTITY: `SELECT * FROM services
    WHERE service_type = ? AND group_id = ?`,
  SELECT_RUNTIME_SERVICES_BY_ENTITY: `SELECT * FROM services
    WHERE service_type = ? AND service_id = ?`,
  INSERT_RESERVATION: `INSERT INTO storage_reservations (
    reservation_id, operation_id, entity_type, entity_id,
    partition_id, target_node_id, estimated_bytes,
    amplification_factor, status, reason_code,
    created_at, updated_at, expires_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  UPDATE_RESERVATION_STATUS_BY_ID: `UPDATE storage_reservations
    SET status = ?, updated_at = ?, released_at = ?
    WHERE reservation_id = ? AND status = ?`,
  SELECT_ACTIVE_RESERVATIONS_BY_OPERATION:
    'SELECT * FROM storage_reservations WHERE operation_id = ? AND status = ?',
  SELECT_ACTIVE_RESERVATIONS:
    'SELECT * FROM storage_reservations WHERE status = ?',
  SELECT_EXPIRED_ACTIVE_RESERVATIONS:
    'SELECT * FROM storage_reservations WHERE status = ? AND expires_at <= ?',
});

const RECENT_INTENT_TTL_MS = 15000;
const INCOMPLETE_OPERATION_EMPTY_QUERY_BACKOFF_MS = TIME_MS.SECOND * NUM.FIVE;
const REPLICA_ID_SEPARATOR = '-r';
const REPLICA_ID_START_INDEX = 1;
const DEFAULT_AMPLIFICATION_FACTOR = 1;

const CONCURRENT_CREATE_BUDGET_SCOPE = Object.freeze({
  ADD: 'add',
  PRIORITY_ADD: 'priority_add',
  EMERGENCY_PRIORITY_ADD: 'emergency_priority_add',
  REMOVE: 'remove',
});
const CONTROL_PLANE_QUERY_OPTIONS = Object.freeze({
  ...buildControlPlaneQueryOptions(),
  routingReadinessDimension:
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
});
const STORAGE_RESERVATION_READ_QUERY_OPTIONS = Object.freeze({
  ...CONTROL_PLANE_QUERY_OPTIONS,
  // Reservation cleanup is an internal recovery path. When the routed
  // authoritative owner is temporarily unavailable, fall back to the local
  // SQL-backed view instead of leaving stale reservations behind.
  allowSqlFallback: true,
});
const STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS = Object.freeze({
  readOptions: {
    authoritativeReadMode:
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  },
});
const PRIORITY_RECENT_INTENT_TTL_MS = TIME_MS.MINUTE * 2;
const RECENT_OPERATION_INTENT_VISIBILITY_STATE = Object.freeze({
  DEFERRED: 'deferred',
  MATCHING: 'matching',
  MISSING: 'missing',
});
const TOPOLOGY_GUARD_DEFAULT_PARTITION_TARGET_REPLICA_COUNT = NUM.THREE;
const TOPOLOGY_GUARD_STATE = Object.freeze({
  ALLOWED: 'allowed',
  TARGET_NODE_OCCUPIED: 'target_node_occupied',
  TARGET_REPLICA_COUNT_SATISFIED: 'target_replica_count_satisfied',
});
const TOPOLOGY_GUARD_REASON = Object.freeze({
  TARGET_NODE_ALREADY_OCCUPIED: 'target_node_already_occupied',
  TARGET_REPLICA_COUNT_ALREADY_SATISFIED:
    'target_replica_count_already_satisfied',
});
const TOPOLOGY_GUARD_ERROR_MSG = Object.freeze({
  BLOCKED_PREFIX: 'Topology guard blocked',
});

/**
 * RebalanceCoordinator manages the complete rebalancing workflow.
 * Uses SQL engine for all system information access (no in-memory cache).
 */

export const REBALANCE_COORDINATOR_SHARED = {
  CONCURRENT_CREATE_BUDGET_SCOPE,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_QUERY_OPTIONS,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_WORKLOAD_CLASS,
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  ConfigurationManager,
  ControlPlaneReadinessService,
  DEFAULT_AMPLIFICATION_FACTOR,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  DurableWorkflowCoordinator,
  EventEmitter,
  ExecutorOutcomeEmitter,
  INCOMPLETE_OPERATION_EMPTY_QUERY_BACKOFF_MS,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  LoggingService,
  NUM,
  OPERATION_METADATA_KEY,
  OUTCOME_EVENT_NAME,
  OperationLane,
  OperationType,
  ReplicaStatus,
  OperationWorkflowOwner,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PRIORITY_RECENT_INTENT_TTL_MS,
  PressureGovernor,
  ProvisioningAdmissionPolicy,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_SKIP_REASON,
  REBALANCER_SUBSYSTEM,
  REBALANCE_COORDINATOR_ERROR_MSG,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  RECENT_INTENT_TTL_MS,
  RECENT_OPERATION_INTENT_VISIBILITY_STATE,
  REPLICA_ID_SEPARATOR,
  REPLICA_ID_START_INDEX,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  RESERVATION_REASON,
  RESERVATION_STATUS,
  ReplicaOperationField,
  TRANSPORT_EVENT,
  ReplicaOperationRepository,
  SERVICE_TYPE,
  STRING,
  SQL,
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
  STORAGE_RESERVATION_READ_QUERY_OPTIONS,
  STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS,
  SYSTEM_TABLE_NAME,
  StartupRecoveryCoordinator,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  TIME_MS,
  TOPOLOGY_GUARD_DEFAULT_PARTITION_TARGET_REPLICA_COUNT,
  TOPOLOGY_GUARD_ERROR_MSG,
  TOPOLOGY_GUARD_REASON,
  TOPOLOGY_GUARD_STATE,
  UNIFIED_SERVICE_TYPE,
  WORKFLOW_STEP,
  assertCritical,
  buildControlPlaneQueryOptions,
  buildControlPlaneWorkloadProfile,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  buildReplicatedServiceBootstrapTopology,
  buildTimeoutClassification,
  createChildTimeoutBudget,
  createControlPlaneRuntimeBundle,
  createOperationRecord,
  createTopLevelOperationBudget,
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
  isCriticalTransportControlPlanePartitionTable,
  isPriorityRecoveryEmergencyPartition,
  isPriorityControlPlanePartitionTable,
  isRetryableControlPlaneError,
  readAuthoritativeControlPlaneRows,
  resolvePriorityRecoveryActiveNodeCohort,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  shouldPriorityRecoveryOperationBlockPlanning,
  uuidv4,
};
