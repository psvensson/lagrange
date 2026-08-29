/**
 * Service discovery snapshot building for the admin WebSocket API.
 *
 * This module owns all service-discovery readiness evaluation, snapshot
 * construction, and bounded authoritative cache repair. The parent
 * AdminWebSocketAPI instantiates one AdminServiceDiscovery and delegates
 * all discovery-related calls to it.
 *
 * Single-use helpers that exist only for service-discovery logic live here
 * as module-private functions. Shared helpers are imported from
 * admin-helpers.js.
 */

import {COLUMN, NUM, TABLES, TYPEOF} from '../constants/index.js';
import {
  ENDPOINT_SYNC_BOOLEAN,
  ENDPOINT_SYNC_HEALTH,
} from '../runtime/endpoint-sync-constants.js';
import {buildServiceDiscoveryCatalog} from '../runtime/service-discovery-catalog.js';
import {isLoadReadyReplicaRaftRole} from '../node/replica-state-machine-constants.js';
import {
  DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP,
  isReplicaOperationInFlight,
  isReplicaOperationStale,
  isReplicaOperationTerminalSuccess,
  normalizeReplicaOperationRecord,
} from '../rebalancer/replica-operation-liveness.js';
import {getSystemCachePrimaryKeyField} from '../cache/system-cache-key-descriptor.js';
import {isTableCdcReadinessRelevant} from '../cache/cdc-table-policy.js';
import {
  CANONICAL_LEADER_ROUTING_GAP_STATE,
  resolveCanonicalLeaderRoutingGapState,
} from '../query/canonical-leader-routing.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from '../control-plane/control-plane-readiness-constants.js';
import {CONTROL_PLANE_DELIVERY_PRIORITY} from '../control-plane/control-plane-constants.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR,
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE,
  CONTROL_PLANE_CACHE_RECONCILE_INTENT,
} from '../control-plane/control-plane-cache-reconcile-constants.js';
import {CONTROL_PLANE_READ_STRATEGY} from '../control-plane/control-plane-system-table-gateway.js';
import {CONTROL_PLANE_SNAPSHOT_REFRESH_STATE} from '../control-plane/control-plane-snapshot-owner.js';
import {getControlPlaneRetryAfterMs} from '../control-plane/control-plane-error-classification.js';
import {getRegisteredControlPlaneSystemTableGateway} from '../control-plane/control-plane-gateway-registry.js';
import {
  DEFAULT_AUTHORITATIVE_REPAIR_TABLES,
  deriveAuthoritativeRepairTables,
  evaluateAuthoritativeRepairPolicy,
} from './admin-authoritative-repair-policy.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_ERROR_MESSAGE,
  ADMIN_SERVICE_DISCOVERY,
} from './admin-constants.js';
import {
  filterActiveServingPartitionRows,
  firstStringField,
  normalizeDiscoveryTableId,
  normalizeIdentifier,
  normalizeSchemaVersionValue,
  normalizeSql,
  uniqueSorted,
} from './admin-helpers.js';
import {evaluateSharedMetadataNodeCoverage} from './admin-shared-metadata-consistency.js';
import {shouldAttemptAuthoritativeRepair} from './admin-authoritative-repair-evaluation.js';
import {
  computeAuthoritativeRepairFailureRetryAfterMs,
  normalizeAuthoritativeRepairTableNames,
  normalizeLocalQueryTransportDiagnostic,
  resolveAuthoritativeRepairFailureBaseRetryAfterMs,
  resolveAuthoritativeRepairFailureClass,
  resolveAuthoritativeRepairFailureMaxRetryAfterMs,
  shouldAbortAuthoritativeRepairTableReads,
  summarizeAuthoritativeRepairError,
} from './admin-service-discovery-authoritative-repair-failures.js';
import {assignAdminServiceDiscoveryReadinessMethods} from './admin-service-discovery-readiness-methods.js';
import {assignAdminServiceDiscoveryRepairMethods} from './admin-service-discovery-repair-methods.js';

// ── file-local constants ────────────────────────────────────────────────────
const AUTHORITATIVE_REPAIR_FAILURE_ACTION = Object.freeze({
  RUN_REPAIR: 'run_repair',
  DEFER_REPAIR: 'defer_repair',
});
const AUTHORITATIVE_REPAIR_FAILURE_CLASS = Object.freeze({
  TRANSIENT: 'transient',
  PRESSURE_OR_TIMEOUT: 'pressure_or_timeout',
});
const ADMIN_SERVICE_DISCOVERY_LITERAL = Object.freeze({
  BOOLEAN: 'boolean',
  READY: 'ready',
  DEFERRED: 'deferred',
  UNKNOWN: 'unknown',
  DISTRIBUTED_PARTICIPANT_FAILURE: 'DISTRIBUTED_PARTICIPANT_FAILURE',
  PARTICIPANT_FAILURES: 'participant failures',
  UNKNOWN_ERROR: 'unknown_error',
  VALUE: '',
  VALUE_2: 2,
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE: 'authoritative_row_source_unavailable',
  ENDPOINT_UNHEALTHY_OR_NODE_NOT_ACTIVE:
    'endpoint unhealthy or node not ACTIVE',
  TABLE: 'table "',
  NOT_FOUND: '" not found',
  NOT_QUERY_READY_ON_NODE: '" not query-ready on node',
  LEADER_COVERAGE_INCOMPLETE_FOR_READINESS_SCOPE:
    'leader coverage incomplete for readiness scope',
  VALUE_3: ',',
  MIXED: 'mixed',
});
const EMPTY_STRING = '';
const LEADER_RAFT_ROLE = 'leader';
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR = ':';
const DISCOVERY_ROUTING_SNAPSHOT_FIELD = Object.freeze({
  CANONICAL_LEADER_NODE_ID: 'canonicalLeaderNodeId',
  CANONICAL_LEADER_ROUTING_GAP_STATE: 'canonicalLeaderRoutingGapState',
});
const AUTHORITATIVE_DISCOVERY_REPAIR_REASON_CONTROL_SNAPSHOT =
  'control_snapshot';
const AUTHORITATIVE_DISCOVERY_REPAIR_REASON_SERVICE_DISCOVERY_SNAPSHOT =
  'service_discovery_snapshot';
const AUTHORITATIVE_DISCOVERY_REPAIR_CAUSE_ID_PREFIX =
  'admin-authoritative-discovery-repair';
const AUTHORITATIVE_DISCOVERY_REPAIR_DEFAULT_REASON = 'repair';
const AUTHORITATIVE_DISCOVERY_REPAIR_UNKNOWN_REASON = 'unknown';
function markDiscoveryLocalPartitionCdcDiagnosticsMissing(state, partitionId) {
  state.ready = false;
  state.diagnosticsAvailable = false;
  state.missingDiagnosticsPartitionIds.push(partitionId);
}
function markDiscoveryLocalPartitionCdcNoSubscriber(state, partitionId) {
  state.ready = false;
  state.noSubscriberPartitionIds.push(partitionId);
}
function markDiscoveryLocalPartitionCdcBuffered(state, partitionId) {
  state.ready = false;
  state.bufferedPartitionIds.push(partitionId);
}
const SERVICE_DISCOVERY_READINESS_REASON = Object.freeze({
  ROUTING_NOT_READY: 'routing_not_ready',
  SCHEMA_TABLE_MISSING: 'schema_table_missing',
  SCHEMA_PARTITION_UNAVAILABLE: 'schema_partition_unavailable',
  REPLICA_OPERATIONS_IN_FLIGHT: 'replica_operations_in_flight',
  REPLICA_OPERATION_IN_FLIGHT: 'replica_operation_in_flight',
  REPLICA_OPERATION_FAILED: 'replica_operation_failed',
  REPLICA_OPERATION_STALE_TIMEOUT: 'replica_operation_stale_timeout',
  LEADERSHIP_UNSTABLE: 'leadership_unstable',
  LOCAL_REPLICA_NOT_VOTER_READY: 'local_replica_not_voter_ready',
  LOCAL_CDC_DIAGNOSTICS_UNAVAILABLE: 'local_cdc_diagnostics_unavailable',
  LOCAL_CDC_SUBSCRIBER_MISSING: 'local_cdc_subscriber_missing',
  LOCAL_CDC_BUFFER_NOT_DRAINED: 'local_cdc_buffer_not_drained',
});
const BENCHMARK_ADMISSION_STATE = Object.freeze({
  READY: 'ready',
  BLOCKED: 'blocked',
});
const BENCHMARK_DEGRADATION_STATE = Object.freeze({
  HEALTHY: 'healthy',
  MOVE_PENDING: 'move_pending',
  MOVE_FAILED: 'move_failed',
  PROMOTION_PENDING: 'promotion_pending',
  PROMOTION_FAILED: 'promotion_failed',
  DRAIN_BLOCKED: 'drain_blocked',
});
const BENCHMARK_DEGRADATION_PRIORITY = Object.freeze({
  [BENCHMARK_DEGRADATION_STATE.HEALTHY]: 0,
  [BENCHMARK_DEGRADATION_STATE.PROMOTION_PENDING]: 1,
  [BENCHMARK_DEGRADATION_STATE.MOVE_PENDING]: 2,
  [BENCHMARK_DEGRADATION_STATE.DRAIN_BLOCKED]: NUM.THREE,
  [BENCHMARK_DEGRADATION_STATE.PROMOTION_FAILED]: NUM.FOUR,
  [BENCHMARK_DEGRADATION_STATE.MOVE_FAILED]: NUM.FIVE,
});
const REPLICA_OPERATION_TYPE = Object.freeze({
  ADD: 'ADD',
  REMOVE: 'REMOVE',
  REPLACE: 'REPLACE',
});
const SERVICE_DISCOVERY_SCHEMA_VERSION_FIELD_CANDIDATES = Object.freeze([
  'updated_at_hlc',
  'updatedAtHlc',
  'schema_version',
  'schemaVersion',
  'updated_at',
  'updatedAt',
  'created_at',
  'createdAt',
]);
const AUTHORITATIVE_REPAIR_COOLDOWN_MS = 1000;
const AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS = 1500;
const AUTHORITATIVE_REPAIR_STALE_THRESHOLD_MS = 5000;
const AUTHORITATIVE_REPAIR_REUSE_WINDOW_MS =
  AUTHORITATIVE_REPAIR_STALE_THRESHOLD_MS;
const AUTHORITATIVE_DISCOVERY_REPAIR = Object.freeze({
  COOLDOWN_MS: AUTHORITATIVE_REPAIR_COOLDOWN_MS,
  QUERY_TIMEOUT_MS: AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS,
  STALE_THRESHOLD_MS: AUTHORITATIVE_REPAIR_STALE_THRESHOLD_MS,
  REUSE_WINDOW_MS: AUTHORITATIVE_REPAIR_REUSE_WINDOW_MS,
  TABLES: DEFAULT_AUTHORITATIVE_REPAIR_TABLES,
});
const AUTHORITATIVE_DISCOVERY_CACHE_GAP_REASON_CODES = new Set([
  SERVICE_DISCOVERY_READINESS_REASON.SCHEMA_TABLE_MISSING,
  SERVICE_DISCOVERY_READINESS_REASON.SCHEMA_PARTITION_UNAVAILABLE,
  SERVICE_DISCOVERY_READINESS_REASON.LEADERSHIP_UNSTABLE,
]);
const SERVICE_DISCOVERY_SQL_WITH_TABLE_PATTERN =
  /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*\)$/;
const SERVICE_DISCOVERY_SQL_WITH_TABLE_AND_ID_PATTERN =
  /^select \* from service_discovery_local\(\s*'([a-z_][a-z0-9_]*)'\s*,\s*'([a-z0-9_-]+)'\s*\)$/;

// ── single-use helper functions ─────────────────────────────────────────────
/**
 * Compare two schema version values numerically or lexicographically.
 * @param {string} left
 * @param {string} right
 * @return {number}
 */
function compareSchemaVersionValues(left, right) {
  if (left === right) {
    return 0;
  }
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left).localeCompare(String(right));
}
/**
 * Determine whether a service row represents an active voter-ready replica.
 * @param {Object} serviceRow
 * @return {boolean}
 */
function isActiveVoterReadyPartitionReplica(serviceRow) {
  if (!serviceRow || typeof serviceRow !== 'object') {
    return false;
  }
  const serviceType = firstStringField(
    serviceRow,
    COLUMN.SERVICE_TYPE,
    'service_type',
    'serviceType',
    'type',
  );
  if (serviceType !== SERVICE_TYPE_PARTITION) {
    return false;
  }
  const status = firstStringField(serviceRow, COLUMN.STATUS, 'status');
  if (
    String(status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE).toLowerCase() !==
    STATUS_ACTIVE
  ) {
    return false;
  }
  const raftRole = firstStringField(
    serviceRow,
    COLUMN.RAFT_ROLE,
    'raft_role',
    'raftRole',
  );
  if (!isLoadReadyReplicaRaftRole(raftRole)) {
    return false;
  }
  const address = firstStringField(serviceRow, COLUMN.ADDRESS, 'address');
  return Boolean(address);
} /**
 * Select the newest of two schema version values.
 * @param {string|null} current
 * @param {string|null} candidate
 * @return {string|null}
 */
function selectNewestSchemaVersion(current, candidate) {
  if (!candidate) {
    return current;
  }
  if (!current) {
    return candidate;
  }
  return compareSchemaVersionValues(candidate, current) >= 0 ?
    candidate :
    current;
} /**
 * Extract the best schema version value from a record.
 * @param {Object} record
 * @return {string|null}
 */
function extractSchemaVersionFromRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }
  for (const fieldName of SERVICE_DISCOVERY_SCHEMA_VERSION_FIELD_CANDIDATES) {
    const normalized = normalizeSchemaVersionValue(record[fieldName]);
    if (normalized) {
      return normalized;
    }
  }
  return null;
} /**
 * Parse one comma-separated query parameter into sorted unique values.
 * @param {*} rawValue
 * @return {Array<string>}
 */
function parseDiscoveryListQuery(rawValue) {
  const values = [];
  const collectValues = (inputValue) => {
    if (Array.isArray(inputValue)) {
      for (const item of inputValue) {
        collectValues(item);
      }
      return;
    }
    if (typeof inputValue !== 'string') {
      return;
    }
    for (const value of inputValue.split(',')) {
      const trimmedValue = value.trim();
      if (trimmedValue.length > 0) {
        values.push(trimmedValue);
      }
    }
  };
  collectValues(rawValue);
  return uniqueSorted(values);
} /**
 * Parse optional boolean query value with fallback.
 * @param {*} rawValue
 * @param {boolean} fallback
 * @return {boolean}
 */
function parseDiscoveryBooleanQuery(rawValue, fallback) {
  if (typeof rawValue === 'boolean') {
    return rawValue;
  }
  if (typeof rawValue !== 'string') {
    return fallback;
  }
  const normalizedValue = rawValue.trim().toLowerCase();
  if (
    normalizedValue === ENDPOINT_SYNC_BOOLEAN.TRUE ||
    normalizedValue === ENDPOINT_SYNC_BOOLEAN.ONE
  ) {
    return true;
  }
  if (
    normalizedValue === ENDPOINT_SYNC_BOOLEAN.FALSE ||
    normalizedValue === ENDPOINT_SYNC_BOOLEAN.ZERO
  ) {
    return false;
  }
  return fallback;
} /**
 * Parse local service-discovery SQL with optional tableName/tableId args.
 * @param {string} sql
 * @return {{isQuery: boolean, tableName: (string|null), tableId: (string|null)}}
 */
function parseServiceDiscoverySqlQuery(sql) {
  const normalizedSql = normalizeSql(sql);
  if (normalizedSql === normalizeSql(ADMIN_SERVICE_DISCOVERY.QUERY_SQL)) {
    return {
      isQuery: true,
      tableName: null,
      tableId: null,
    };
  }
  const tableAndIdMatch = normalizedSql.match(
    SERVICE_DISCOVERY_SQL_WITH_TABLE_AND_ID_PATTERN,
  );
  if (tableAndIdMatch) {
    return {
      isQuery: true,
      tableName: normalizeIdentifier(tableAndIdMatch[1]),
      tableId: normalizeDiscoveryTableId(
        tableAndIdMatch[ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE_2],
      ),
    };
  }
  const match = normalizedSql.match(SERVICE_DISCOVERY_SQL_WITH_TABLE_PATTERN);
  if (!match) {
    return {
      isQuery: false,
      tableName: null,
      tableId: null,
    };
  }
  return {
    isQuery: true,
    tableName: normalizeIdentifier(match[1]),
    tableId: null,
  };
} // ── AdminServiceDiscovery class ─────────────────────────────────────────────
/**
 * Service discovery snapshot builder.
 *
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (preflight freshness, control-snapshot replica
 * operations, SQL execution) are injected as functions so this module
 * has no back-reference to AdminWebSocketAPI.
 */
class AdminServiceDiscovery {
  /**
   * @param {Object} deps
   * @param {Object} deps.systemTableCache
   * @param {string} deps.nodeId
   * @param {Object} deps.logger
   * @param {Object|null} deps.cacheMutationTarget
   * @param {Function|null} deps.partitionServicesProvider
   * @param {Map|null} deps.partitionServices
   * @param {Function} deps.buildPreflightCacheFreshnessSummary
   * @param {Function} deps.buildControlSnapshotReplicaOperationSummary
   */
  constructor(deps = {}) {
    this.systemTableCache = deps.systemTableCache || null;
    this.nodeId = deps.nodeId || null;
    this.logger = deps.logger || null;
    this.sqlQueryEngine = deps.sqlQueryEngine || null;
    this.cacheMutationTarget = deps.cacheMutationTarget || null;
    this.partitionServicesProvider =
      typeof deps.partitionServicesProvider === 'function' ?
        deps.partitionServicesProvider :
        null;
    this.partitionServices =
      deps.partitionServices instanceof Map ? deps.partitionServices : null;
    this.controlPlaneSystemTableGateway =
      deps.controlPlaneSystemTableGateway ||
      getRegisteredControlPlaneSystemTableGateway() ||
      null;
    this.controlPlaneSnapshotOwner = deps.controlPlaneSnapshotOwner || null;
    this.buildPreflightCacheFreshnessSummary =
      typeof deps.buildPreflightCacheFreshnessSummary === 'function' ?
        deps.buildPreflightCacheFreshnessSummary :
        null;
    this.buildControlSnapshotReplicaOperationSummary =
      typeof deps.buildControlSnapshotReplicaOperationSummary ===
      'function' ?
        deps.buildControlSnapshotReplicaOperationSummary :
        null;
    this.nowFn =
      typeof deps.nowFn === 'function' ? deps.nowFn : () => Date.now();
    this.authoritativeDiscoveryRepairPromise = null;
    this.authoritativeDiscoveryEvidenceProbePromise = null;
    this.lastAuthoritativeDiscoveryRepairAtMs = 0;
    this.lastAuthoritativeDiscoveryRepairCompletedAtMs = 0;
    this.lastAuthoritativeDiscoveryRepairResult = null;
    this.lastAuthoritativeDiscoveryRepairFailureState = null;
  } /**
   * Build local service-discovery snapshot from system cache only.
   * @param {Object} [options={}]
   * @return {Object}
   */
  buildLocalServiceDiscoverySnapshot(options = {}) {
    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.getAll !== 'function'
    ) {
      throw new Error(ADMIN_ERROR_MESSAGE.SERVICE_DISCOVERY_UNAVAILABLE);
    }
    const endpointRows = this.systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS);
    const definitionRows = this.systemTableCache.getAll(
      TABLES.SERVICE_DEFINITIONS,
    );
    const readinessContext =
      this.buildServiceDiscoveryReadinessContext(options);
    const discoveredServices = buildServiceDiscoveryCatalog(endpointRows, {
      protocolAllowlist: options.protocolAllowlist || ADMIN_CACHE_DUMP.EMPTY,
      serviceIdAllowlist: options.serviceIdAllowlist || ADMIN_CACHE_DUMP.EMPTY,
      nodeIdAllowlist: options.nodeIdAllowlist || ADMIN_CACHE_DUMP.EMPTY,
      healthyOnly: options.healthyOnly === true,
      unhealthyPolicy: options.unhealthyPolicy,
      definitionRows,
    });
    const services = discoveredServices.map((service) => ({
      ...service,
      replicas: service.replicas.map((replica) => {
        const readiness = this.buildServiceDiscoveryReplicaReadiness(
          replica,
          readinessContext,
        );
        return {
          ...replica,
          readiness,
          benchmarkAdmission:
            this.buildServiceDiscoveryReplicaBenchmarkAdmission(
              replica,
              readinessContext,
              readiness,
            ),
        };
      }),
    }));
    const replicaCount = services.reduce(
      (count, service) => count + service.observedReplicaCount,
      0,
    );
    return {
      schemaVersion: ADMIN_SERVICE_DISCOVERY.SCHEMA_VERSION,
      nodeId: this.nodeId,
      capturedAt: Date.now(),
      serviceCount: services.length,
      replicaCount,
      replicaOperations:
        readinessContext.replicaOperationSummary &&
        typeof readinessContext.replicaOperationSummary === 'object' ?
          readinessContext.replicaOperationSummary :
          null,
      services,
    };
  } /**
   * Resolve local service discovery snapshot with bounded
   * authoritative repair.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async resolveServiceDiscoverySnapshot(options = {}) {
    const snapshot = this.buildLocalServiceDiscoverySnapshot(options);
    if (
      this.controlPlaneSnapshotOwner &&
      typeof this.controlPlaneSnapshotOwner.resolveServiceDiscoverySnapshot ===
        'function'
    ) {
      return this.controlPlaneSnapshotOwner.resolveServiceDiscoverySnapshot(
        snapshot,
        options,
      );
    }
    const allowAuthoritativeRepair = options.allowAuthoritativeRepair === true;
    const repairEvaluation = this.evaluateAuthoritativeDiscoveryRepair(
      snapshot,
      options,
    );
    if (
      !shouldAttemptAuthoritativeRepair({
        repairEvaluation,
        allowAuthoritativeRepair,
      })
    ) {
      return snapshot;
    }
    const repair = await this.ensureAuthoritativeDiscoveryCacheRepair({
      reason: AUTHORITATIVE_DISCOVERY_REPAIR_REASON_SERVICE_DISCOVERY_SNAPSHOT,
      tableName: options.tableName || null,
      tableId: options.tableId || null,
      triggerCodes: repairEvaluation.triggerCodes,
    });
    if (repair.applied !== true) {
      return snapshot;
    }
    return this.buildLocalServiceDiscoverySnapshot(options);
  }
}

assignAdminServiceDiscoveryReadinessMethods(AdminServiceDiscovery, {
  ADMIN_CACHE_DUMP,
  ADMIN_SERVICE_DISCOVERY_LITERAL,
  AUTHORITATIVE_DISCOVERY_REPAIR_REASON_CONTROL_SNAPSHOT,
  AUTHORITATIVE_DISCOVERY_REPAIR_REASON_SERVICE_DISCOVERY_SNAPSHOT,
  AUTHORITATIVE_DISCOVERY_CACHE_GAP_REASON_CODES,
  AUTHORITATIVE_DISCOVERY_REPAIR,
  BENCHMARK_ADMISSION_STATE,
  BENCHMARK_DEGRADATION_PRIORITY,
  BENCHMARK_DEGRADATION_STATE,
  buildControlPlaneWorkloadProfile,
  CANONICAL_LEADER_ROUTING_GAP_STATE,
  COLUMN,
  CONTROL_PLANE_WORKLOAD_CLASS,
  CONTROL_PLANE_DELIVERY_PRIORITY,
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR,
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READ_STRATEGY,
  DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP,
  DISCOVERY_ROUTING_SNAPSHOT_FIELD,
  EMPTY_STRING,
  ENDPOINT_SYNC_HEALTH,
  LEADER_RAFT_ROLE,
  NUM,
  REPLICA_OPERATION_TYPE,
  SERVICE_DISCOVERY_READINESS_REASON,
  SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR,
  SERVICE_TYPE_PARTITION,
  STATUS_ACTIVE,
  TABLES,
  TYPEOF,
  evaluateAuthoritativeRepairPolicy,
  evaluateSharedMetadataNodeCoverage,
  filterActiveServingPartitionRows,
  firstStringField,
  getControlPlaneRetryAfterMs,
  isReplicaOperationInFlight,
  isReplicaOperationStale,
  isReplicaOperationTerminalSuccess,
  isTableCdcReadinessRelevant,
  isActiveVoterReadyPartitionReplica,
  markDiscoveryLocalPartitionCdcBuffered,
  markDiscoveryLocalPartitionCdcDiagnosticsMissing,
  markDiscoveryLocalPartitionCdcNoSubscriber,
  normalizeLocalQueryTransportDiagnostic,
  normalizeDiscoveryTableId,
  normalizeIdentifier,
  normalizeReplicaOperationRecord,
  resolveCanonicalLeaderRoutingGapState,
  extractSchemaVersionFromRecord,
  selectNewestSchemaVersion,
  uniqueSorted,
});

assignAdminServiceDiscoveryRepairMethods(AdminServiceDiscovery, {
  ADMIN_CACHE_DUMP,
  ADMIN_SERVICE_DISCOVERY,
  ADMIN_SERVICE_DISCOVERY_LITERAL,
  AUTHORITATIVE_DISCOVERY_CACHE_GAP_REASON_CODES,
  AUTHORITATIVE_DISCOVERY_REPAIR,
  AUTHORITATIVE_DISCOVERY_REPAIR_CAUSE_ID_PREFIX,
  AUTHORITATIVE_DISCOVERY_REPAIR_DEFAULT_REASON,
  AUTHORITATIVE_DISCOVERY_REPAIR_REASON_CONTROL_SNAPSHOT,
  AUTHORITATIVE_DISCOVERY_REPAIR_REASON_SERVICE_DISCOVERY_SNAPSHOT,
  AUTHORITATIVE_DISCOVERY_REPAIR_UNKNOWN_REASON,
  AUTHORITATIVE_REPAIR_FAILURE_ACTION,
  AUTHORITATIVE_REPAIR_FAILURE_CLASS,
  BENCHMARK_ADMISSION_STATE,
  BENCHMARK_DEGRADATION_PRIORITY,
  BENCHMARK_DEGRADATION_STATE,
  CANONICAL_LEADER_ROUTING_GAP_STATE,
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR,
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE,
  CONTROL_PLANE_CACHE_RECONCILE_INTENT,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
  DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP,
  DISCOVERY_ROUTING_SNAPSHOT_FIELD,
  EMPTY_STRING,
  ENDPOINT_SYNC_HEALTH,
  NUM,
  REPLICA_OPERATION_TYPE,
  SERVICE_DISCOVERY_READINESS_REASON,
  SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR,
  TABLES,
  TYPEOF,
  computeAuthoritativeRepairFailureRetryAfterMs,
  deriveAuthoritativeRepairTables,
  evaluateAuthoritativeRepairPolicy,
  evaluateSharedMetadataNodeCoverage,
  firstStringField,
  getSystemCachePrimaryKeyField,
  isReplicaOperationInFlight,
  isReplicaOperationStale,
  isReplicaOperationTerminalSuccess,
  normalizeAuthoritativeRepairTableNames,
  normalizeDiscoveryTableId,
  normalizeIdentifier,
  normalizeReplicaOperationRecord,
  resolveAuthoritativeRepairFailureBaseRetryAfterMs,
  resolveAuthoritativeRepairFailureClass,
  resolveAuthoritativeRepairFailureMaxRetryAfterMs,
  resolveCanonicalLeaderRoutingGapState,
  shouldAbortAuthoritativeRepairTableReads,
  summarizeAuthoritativeRepairError,
  uniqueSorted,
});

export {
  AdminServiceDiscovery,
  AUTHORITATIVE_DISCOVERY_REPAIR,
  parseDiscoveryBooleanQuery,
  parseDiscoveryListQuery,
  parseServiceDiscoverySqlQuery,
};
