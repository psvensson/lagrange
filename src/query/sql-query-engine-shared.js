/**
 * SQL Query Engine - Main entry point for SQL query processing.
 * Coordinates parsing, partition resolution, and execution.
 *
 * System Cache-Based Routing:
 * - Partition discovery reads the raw observed system cache
 * - Canonical leader identity for critical bootstrap partitions may be
 *   stabilized by `BootstrapTopologySnapshotOwner` through downstream routing
 *   helpers
 * - System cache still provides the base partition metadata surface
 * - No bootstrap directories or fallback mechanisms
 * - All communication through message router using service addresses
 *
 * Query Routing Flow:
 * 1. Parse SQL to determine target table
 * 2. Get partitions from system cache
 * 3. Resolve which partitions to query based on WHERE clause
 * 4. Find partition leader addresses from system cache
 * 5. Route queries through message router to leaders
 * 6. Aggregate and return results
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 15.1, 15.2, 15.3, 15.4, 20.1, 20.2, 20.3,
 *               20.6, 20.7, 20.10, 21.1, 21.2, 21.3
 */

import {createHash} from 'node:crypto';
import {SQLParser} from './sql-parser.js';
import {
  getSchemaByTableName,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {isPriorityControlPlanePartition} from '../bootstrap/system-partition-classification.js';
import {PartitionResolver} from './partition-resolver.js';
import {QueryExecutor} from './query-executor.js';
import {TableCreationService} from './table-creation-service.js';
import {DistributedQueryPlanner} from './distributed/distributed-query-planner.js';
import {DistributedWriteCoordinator} from './distributed/distributed-write-coordinator.js';
import {
  DistributedTransactionCoordinator,
  WRITE_OPERATION_STATUS,
} from './distributed/distributed-transaction-coordinator.js';
import {
  OperationType,
  OPERATION_METADATA_KEY,
} from '../rebalancer/replica-status.js';
import {ReplicaOperationField} from '../rebalancer/replica-operation-constants.js';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  COLUMN,
  ENTITY_TYPE,
  NUM,
  TABLES,
  METRICS_LOG_TAG,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
} from '../constants/index.js';
import {
  QUERY_AST_TYPE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  QUERY_SESSION,
  QUERY_SUBSYSTEM,
  SQL_PARSE_CACHE,
  WRITE_TRACKING_EXCLUDED_TABLES,
} from './query-constants.js';
import {isSqlRequest} from './sql-request.js';
import {PartitionCallbackDispatcher} from './callback/partition-callback-dispatcher.js';
import {CallbackExecutionHost} from './callback/callback-execution-host.js';
import {createCallbackDriverRegistry} from './callback/callback-runtime-driver-registry.js';
import {executeStage} from './call-stage.js';
import {executePlan} from './call-plan.js';
import {ExecutionContext} from './execution-context.js';
import {BudgetEnforcer} from './budget-enforcer.js';
import {resolveBootstrapLeaderSelection} from './bootstrap-leader-selection.js';
import {CancellationToken} from './cancellation-token.js';
import {LineageTracker} from './lineage-tracker.js';
import {DEFAULT_SNAPSHOT_MODE} from './runtime-constants.js';
import {
  EXECUTION_MODE,
  ADAPTER_ERROR_MSG,
  ADAPTER_LOG_MSG,
  CALLBACK_RUNTIME_KIND,
} from './sql-adapter-constants.js';
import {parseCallbackModuleArtifact} from './callback/callback-module-artifact.js';
import {reorderParams} from './pg/pg-translate.js';
import {SqlParseCache} from './sql-parse-cache.js';
import {AddressManager} from '../address/address-manager.js';
import {isNodeRecordReady} from '../node/node-readiness-policy.js';
import {
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
} from '../rebalancer/storage-capacity-constants.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  createTimeoutBudgetError,
  getRemainingBudgetMs,
} from '../control-plane/timeout-budget.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY} from '../cdc/cdc-integration-service.js';
import {AuthoritativeControlPlaneView} from '../control-plane/authoritative-control-plane-view.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from '../control-plane/control-plane-runtime-bundle.js';
import {
  buildLocalControlPlaneMutationReadinessFailure,
  buildSystemTableMutationRoutingGapFailure,
  CONTROL_PLANE_MUTATION_WORK_CLASS,
  getLocalControlPlaneMutationReadinessBlocker,
  getSystemTableMutationRoutingGapBlocker,
  normalizeControlPlaneMutationWorkClass,
} from '../control-plane/control-plane-mutation-readiness.js';
import {
  buildOwnerContractOutcome,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../control-plane/owner-contract-outcome.js';
import {isRetryableControlPlaneError} from '../control-plane/control-plane-error-classification.js';
import {
  buildPressureAdmissionFailure,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../partition/partition-constants.js';
import {isRetryableManagedSplitTransition} from '../partition/managed-split-retry-policy.js';
import {ManagedSplitTopologyAdapter} from '../partition/managed-split-topology-adapter.js';
import {ManagedSplitWorkflow} from '../partition/managed-split-workflow.js';
import {PARTITION_SERVICE_MESSAGE_TYPE} from '../partition/partition-service-constants.js';
import {TimeoutPolicy} from '../workflow/timeout-policy.js';
import {MIGRATION_STATUS} from '../migration/migration-constants.js';
import {MigrationCoordinator} from '../migration/migration-coordinator.js';
import {MigrationPipeline} from '../migration/migration-pipeline.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';

const CODE_LOOKUP_BY_FUNCTION_ID_SQL = `SELECT * FROM ${TABLES.CODE} WHERE function_id = ?`;
const CODE_LOOKUP_BY_FUNCTION_NAME_SQL = `SELECT * FROM ${TABLES.CODE} WHERE function_name = ?`;
const MODULE_MANIFEST_LOOKUP_BY_ARTIFACT_POINTER_SQL =
  `SELECT * FROM ${TABLES.MODULE_MANIFESTS} ` +
  'WHERE artifact_pointer = ? ORDER BY created_at DESC LIMIT 1';
const NATIVE_CALLBACK_EXPORTS_ARG = 'exports';
const NATIVE_CALLBACK_MODULE_ARG = 'module';
const NATIVE_CALLBACK_RETURN_LINE = 'return module.exports;';
const DEFAULT_CODE_VERSION = '1';
const ZERO_SHA256_DIGEST = 'sha256:' + '0'.repeat(64);
const BACKGROUND_SYSTEM_TABLE_DELIVERY_PRIORITY_TABLES = new Set([
  TABLES.SQL_TRANSACTIONS,
  TABLES.SQL_TRANSACTION_PARTICIPANTS,
  TABLES.SQL_WRITE_OPERATIONS,
]);
const RETRYABLE_CONTROL_PLANE_TIMEOUT_CLASSIFICATIONS = new Set([
  TIMEOUT_BUDGET_CLASSIFICATION.QUERY_TIMEOUT,
  TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
  TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
]);
const EXPLAIN_DISTRIBUTED_PREFIX_REGEX = /^\s*EXPLAIN\s+DISTRIBUTED\s+/i;
const STATUS_ACTIVE = 'active';
const CONNECTION_STATE_CONNECTED = String(STATE.CONNECTED).toLowerCase();
const CONNECTION_STATE_READY = String(STATE.READY).toLowerCase();
const DEFAULT_PARTITION_VERSION = 1;
const ACTIVE_PARTITION_STATE = 'NORMAL';
const DUAL_WRITE_ACTIVE_STATUSES = new Set([MIGRATION_STATUS.DUAL_WRITE]);
const TABLE_PARTITION_TARGET_NODE_WAIT = 'table_partition_target_node_wait';
const TABLE_PARTITION_TARGET_NODE_CONVERGENCE_REASON = Object.freeze({
  WAIT_TIMEOUT: 'table_partition_target_node_wait_timeout',
  DEGRADED_FALLBACK_USED: 'table_partition_target_node_fallback_used',
});
const TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS = 10000;
const PROVISIONING_REJECTION_DETAIL_LIMIT = 3;
const PROVISIONING_REJECTION_SUMMARY_NONE = 'none';
const PROVISIONING_REJECTION_REASON_UNKNOWN = 'admission_blocked';
const WRITE_ACTIVITY_SPLIT_EVALUATION_MIN_INTERVAL_MS = 5000;
const BOOTSTRAP_ROUTING_OVERLAY_ENTRY_STATE = Object.freeze({
  AVAILABLE: 'available',
  EXPIRED: 'expired',
  MISSING: 'missing',
  STALE: 'stale',
  SUPERSEDED: 'superseded',
});
const BOOTSTRAP_ROUTING_OVERLAY_PARTITION_STATE = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
});
const BOOTSTRAP_ROUTING_OVERLAY_REASON = Object.freeze({
  CACHE_LEADER_SERVICE_READY: 'cache_leader_service_ready',
  EXPIRED: 'expired',
  FRESH_BOOTSTRAP: 'fresh_bootstrap',
  LEADER_SERVICE_GAP: 'leader_service_gap',
  MISSING: 'missing',
  STALE_FOR_CURRENT_LEADER: 'stale_for_current_leader',
});
const BOOTSTRAP_ROUTING_OVERLAY_REUSE_STATE = Object.freeze({
  CACHE_READY: 'cache_ready',
  FRESH_BOOTSTRAP: 'fresh_bootstrap',
  LEADER_SERVICE_GAP: 'leader_service_gap',
  STALE_FOR_CURRENT_LEADER: 'stale_for_current_leader',
});
const BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE = Object.freeze({
  CACHE_READY: 'cache_ready',
  INSTALL_AVAILABLE: 'install_available',
  INSTALL_SUPERSEDED: 'install_superseded',
  SKIP_INVALID_PARTITION: 'skip_invalid_partition',
  SKIP_NO_ROUTABLE_SERVICES: 'skip_no_routable_services',
  SKIP_NO_SELECTED_LEADER: 'skip_no_selected_leader',
  SKIP_STALE_FOR_CURRENT_LEADER: 'skip_stale_for_current_leader',
});
const BOOTSTRAP_ROUTING_OVERLAY_RETENTION_MODE = Object.freeze({
  PROVISIONING_WINDOW: 'provisioning_window',
  SYSTEM_TABLE_SERVICE_GAP_BRIDGE: 'system_table_service_gap_bridge',
});
const BOOTSTRAP_ROUTING_OVERLAY_NO_EXPIRY_MS = Number.POSITIVE_INFINITY;
const RETRYABLE_CONTROL_PLANE_MUTATION_DEFER_STATE = Object.freeze({
  BYPASS_CRITICAL: 'bypass_critical',
  DEFER: 'defer',
});

function resolveRetryableControlPlaneMutationDeferState(queryOptions = {}) {
  return normalizeControlPlaneMutationWorkClass(queryOptions?.workClass) ===
    CONTROL_PLANE_MUTATION_WORK_CLASS.CRITICAL ?
    RETRYABLE_CONTROL_PLANE_MUTATION_DEFER_STATE.BYPASS_CRITICAL :
    RETRYABLE_CONTROL_PLANE_MUTATION_DEFER_STATE.DEFER;
}

function createEmptyTransactionRecoveryReplaySummary() {
  return {
    totalRecovered: 0,
    resumed: 0,
    failed: 0,
    results: [],
  };
}

function hasActiveAddressedPartitionService(service) {
  return Boolean(
    service &&
    typeof service === LOCAL_STR_OBJECT &&
    service.status === STATUS_ACTIVE &&
    typeof service.address === LOCAL_STR_STRING &&
    service.address.length > 0,
  );
}

function buildBootstrapRoutingOverlayEntryState(options = {}) {
  const state = options.state || BOOTSTRAP_ROUTING_OVERLAY_ENTRY_STATE.MISSING;
  const reason = options.reason || BOOTSTRAP_ROUTING_OVERLAY_REASON.MISSING;
  const partition =
    options.partition && typeof options.partition === 'object' ?
      options.partition :
      null;
  const services = Array.isArray(options.services) ? options.services : [];
  const entry =
    options.entry && typeof options.entry === 'object' ? options.entry : null;
  return Object.freeze({
    state,
    reason,
    partitionState: partition ?
      BOOTSTRAP_ROUTING_OVERLAY_PARTITION_STATE.AVAILABLE :
      BOOTSTRAP_ROUTING_OVERLAY_PARTITION_STATE.UNAVAILABLE,
    partition,
    services: Object.freeze(services),
    entry,
  });
}

function buildBootstrapRoutingOverlayEntry(options = {}) {
  return {
    partition:
      options.partition && typeof options.partition === LOCAL_STR_OBJECT ?
        options.partition :
        null,
    services: Array.isArray(options.services) ?
      options.services.map((service) => ({...service})) :
      [],
    expiresAtMs: Number.isFinite(options.expiresAtMs) ?
      options.expiresAtMs :
      BOOTSTRAP_ROUTING_OVERLAY_NO_EXPIRY_MS,
    retentionMode:
      options.retentionMode ||
      BOOTSTRAP_ROUTING_OVERLAY_RETENTION_MODE.PROVISIONING_WINDOW,
  };
}

/**
 * SQLQueryEngine is the main entry point for SQL query processing.
 * It coordinates parsing, partition resolution, and parallel execution.
 *
 * System Cache-Based Routing:
 * - Routes ALL queries through message router (no local vs remote distinction)
 * - Table partition discovery uses the raw observed system cache
 * - Critical canonical-leader decisions may use the bootstrap owner's
 *   published authority view via the query executor and router
 * - No bootstrap directories or fallback mechanisms
 * - All partition leader addresses are resolved from the routing stack's
 *   canonical authority answer
 */

export const SQL_QUERY_ENGINE_SHARED = {
  ACTIVE_PARTITION_STATE,
  ADAPTER_ERROR_MSG,
  ADAPTER_LOG_MSG,
  AddressManager,
  AuthoritativeControlPlaneView,
  BACKGROUND_SYSTEM_TABLE_DELIVERY_PRIORITY_TABLES,
  BOOTSTRAP_ROUTING_OVERLAY_ENTRY_STATE,
  BOOTSTRAP_ROUTING_OVERLAY_INSTALL_STATE,
  BOOTSTRAP_ROUTING_OVERLAY_NO_EXPIRY_MS,
  BOOTSTRAP_ROUTING_OVERLAY_PARTITION_STATE,
  BOOTSTRAP_ROUTING_OVERLAY_REASON,
  BOOTSTRAP_ROUTING_OVERLAY_RETENTION_MODE,
  BOOTSTRAP_ROUTING_OVERLAY_REUSE_STATE,
  BudgetEnforcer,
  CALLBACK_RUNTIME_KIND,
  CODE_LOOKUP_BY_FUNCTION_ID_SQL,
  CODE_LOOKUP_BY_FUNCTION_NAME_SQL,
  COLUMN,
  CONNECTION_STATE_CONNECTED,
  CONNECTION_STATE_READY,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_WORK_CLASS,
  CONTROL_PLANE_READINESS_DIMENSION,
  CallbackExecutionHost,
  CancellationToken,
  ConfigurationManager,
  DEFAULT_CODE_VERSION,
  DEFAULT_PARTITION_VERSION,
  DEFAULT_SNAPSHOT_MODE,
  DUAL_WRITE_ACTIVE_STATUSES,
  DistributedQueryPlanner,
  DistributedTransactionCoordinator,
  DistributedWriteCoordinator,
  ENTITY_TYPE,
  EXECUTION_MODE,
  EXPLAIN_DISTRIBUTED_PREFIX_REGEX,
  ExecutionContext,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LineageTracker,
  LoggingService,
  METRICS_LOG_TAG,
  MIGRATION_STATUS,
  MODULE_MANIFEST_LOOKUP_BY_ARTIFACT_POINTER_SQL,
  ManagedSplitTopologyAdapter,
  ManagedSplitWorkflow,
  MigrationCoordinator,
  MigrationPipeline,
  NATIVE_CALLBACK_EXPORTS_ARG,
  NATIVE_CALLBACK_MODULE_ARG,
  NATIVE_CALLBACK_RETURN_LINE,
  NUM,
  OPERATION_METADATA_KEY,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  OperationType,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PROVISIONING_REJECTION_DETAIL_LIMIT,
  PROVISIONING_REJECTION_REASON_UNKNOWN,
  PROVISIONING_REJECTION_SUMMARY_NONE,
  PartitionCallbackDispatcher,
  PartitionResolver,
  PressureGovernor,
  QUERY_AST_TYPE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  QUERY_SESSION,
  QUERY_SUBSYSTEM,
  QueryExecutor,
  RETRYABLE_CONTROL_PLANE_MUTATION_DEFER_STATE,
  RETRYABLE_CONTROL_PLANE_TIMEOUT_CLASSIFICATIONS,
  ReplicaOperationField,
  SERVICE_TYPE,
  SERVICE_STATUS,
  SQLParser,
  SQL_PARSE_CACHE,
  STATE,
  STATUS_ACTIVE,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
  SYSTEM_TABLE_NAME,
  SqlParseCache,
  TABLES,
  TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS,
  TABLE_PARTITION_TARGET_NODE_CONVERGENCE_REASON,
  TABLE_PARTITION_TARGET_NODE_WAIT,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  TableCreationService,
  TimeoutPolicy,
  WRITE_ACTIVITY_SPLIT_EVALUATION_MIN_INTERVAL_MS,
  WRITE_OPERATION_STATUS,
  WRITE_TRACKING_EXCLUDED_TABLES,
  ZERO_SHA256_DIGEST,
  buildBootstrapRoutingOverlayEntry,
  buildBootstrapRoutingOverlayEntryState,
  buildLocalControlPlaneMutationReadinessFailure,
  buildOwnerContractOutcome,
  buildPressureAdmissionFailure,
  buildSystemTableMutationRoutingGapFailure,
  createCallbackDriverRegistry,
  createControlPlaneRuntimeBundle,
  createEmptyTransactionRecoveryReplaySummary,
  createHash,
  createTimeoutBudgetError,
  executePlan,
  executeStage,
  getLocalControlPlaneMutationReadinessBlocker,
  getRemainingBudgetMs,
  getSchemaByTableName,
  getSystemTableMutationRoutingGapBlocker,
  hasActiveAddressedPartitionService,
  isNodeRecordReady,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
  isRetryableManagedSplitTransition,
  isSqlRequest,
  normalizeControlPlaneMutationWorkClass,
  parseCallbackModuleArtifact,
  reorderParams,
  resolveBootstrapLeaderSelection,
  resolveRetryableControlPlaneMutationDeferState,
};
