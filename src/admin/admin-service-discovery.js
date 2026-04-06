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

import {
  COLUMN,
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {
  ENDPOINT_SYNC_BOOLEAN,
  ENDPOINT_SYNC_HEALTH,
} from '../runtime/endpoint-sync-constants.js';
import {buildServiceDiscoveryCatalog} from
  '../runtime/service-discovery-catalog.js';
import {isLoadReadyReplicaRaftRole} from
  '../node/replica-state-machine-constants.js';
import {
  DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP,
  isReplicaOperationInFlight,
  isReplicaOperationStale,
  isReplicaOperationTerminalSuccess,
  normalizeReplicaOperationRecord,
} from '../rebalancer/replica-operation-liveness.js';
import {getSystemCachePrimaryKeyField} from
  '../cache/system-cache-key-descriptor.js';
import {isTableCdcReadinessRelevant} from '../cache/cdc-table-policy.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneSystemTableGateway,
  CONTROL_PLANE_READ_STRATEGY,
} from '../control-plane/control-plane-system-table-gateway.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {getRegisteredControlPlaneSystemTableGateway} from
  '../control-plane/control-plane-gateway-registry.js';
import {
  AUTHORITATIVE_REPAIR_TRIGGER,
  DEFAULT_AUTHORITATIVE_REPAIR_TABLES,
  deriveAuthoritativeRepairTables,
  evaluateAuthoritativeRepairPolicy,
} from
  './admin-authoritative-repair-policy.js';
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
import {evaluateSharedMetadataNodeCoverage} from
  './admin-shared-metadata-consistency.js';
import {shouldAttemptAuthoritativeRepair} from
  './admin-authoritative-repair-evaluation.js';

// ── file-local constants ────────────────────────────────────────────────────
const EMPTY_STRING = '';
const LEADER_RAFT_ROLE = 'leader';
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR = ':';
const AUTHORITATIVE_REPAIR_CAUSE = Object.freeze({
  QUERY_PARTICIPANT_FAILURE: 'query_participant_failure',
  QUERY_TIMEOUT: 'query_timeout',
  CONTROL_PLANE_BACKPRESSURE: 'control_plane_backpressure',
  LEADER_RESOLUTION_GAP: 'leader_resolution_gap',
  REPLAY_BACKLOG: 'replay_backlog',
});
const AUTHORITATIVE_DISCOVERY_REPAIR_REASON_CONTROL_SNAPSHOT =
  'control_snapshot';

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
  [BENCHMARK_DEGRADATION_STATE.HEALTHY]: NUM.ZERO,
  [BENCHMARK_DEGRADATION_STATE.PROMOTION_PENDING]: NUM.ONE,
  [BENCHMARK_DEGRADATION_STATE.MOVE_PENDING]: NUM.TWO,
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
const AUTHORITATIVE_REPAIR_TIMEOUT_FRAGMENT = 'timeout';
const AUTHORITATIVE_REPAIR_LEADER_GAP_FRAGMENTS = Object.freeze([
  'leader is unknown',
  'leader unknown',
  'no handler',
  'no leader',
  'partition_service_not_found',
  'partition service not found',
]);
const AUTHORITATIVE_REPAIR_REPLAY_BACKLOG_FRAGMENTS = Object.freeze([
  'buffered cdc replay',
  'replay backlog',
  'replay buffer',
  'buffered backlog',
]);
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
    return NUM.ZERO;
  }
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left).localeCompare(String(right));
}

function pushUniqueCause(causeChain, cause) {
  if (typeof cause !== TYPEOF.STRING || cause.length === NUM.ZERO) {
    return;
  }
  if (!causeChain.includes(cause)) {
    causeChain.push(cause);
  }
}

function normalizeFirstFailedParticipant(participant, tableName = null) {
  if (!participant || typeof participant !== TYPEOF.OBJECT) {
    return null;
  }
  return {
    partitionId: typeof participant.partitionId === TYPEOF.STRING ?
      participant.partitionId :
      null,
    participantNodeId: typeof participant.participantNodeId === TYPEOF.STRING ?
      participant.participantNodeId :
      null,
    participantAddress:
      typeof participant.participantAddress === TYPEOF.STRING ?
        participant.participantAddress :
        null,
    errorCode: getControlPlaneErrorCode(participant) || null,
    error: getControlPlaneErrorMessage(participant) || null,
    durationMs: Number.isFinite(participant.durationMs) ?
      Math.max(NUM.ZERO, Math.floor(participant.durationMs)) :
      null,
    retryAfterMs: getControlPlaneRetryAfterMs(participant) || null,
    backpressured:
      typeof participant.backpressured === 'boolean' ?
        participant.backpressured :
        isRetryableControlPlaneError(participant),
    failedTable:
      typeof participant.failedTable === TYPEOF.STRING ?
        participant.failedTable :
        tableName,
  };
}

function normalizeLocalQueryTransportDiagnostic(localQueryTransport) {
  if (!localQueryTransport || typeof localQueryTransport !== TYPEOF.OBJECT) {
    return null;
  }
  const ready = typeof localQueryTransport.ready === 'boolean' ?
    localQueryTransport.ready :
    null;
  return {
    state:
      typeof localQueryTransport.state === TYPEOF.STRING &&
        localQueryTransport.state.length > NUM.ZERO ?
        localQueryTransport.state :
        ready === true ?
          'ready' :
          ready === false ?
            'deferred' :
            'unknown',
    ready,
    reason:
      typeof localQueryTransport.reason === TYPEOF.STRING &&
        localQueryTransport.reason.length > NUM.ZERO ?
        localQueryTransport.reason :
        null,
    retryAfterMs: getControlPlaneRetryAfterMs(localQueryTransport) || null,
  };
}

function deriveAuthoritativeRepairCauseChain(error, firstFailedParticipant) {
  const causeChain = [];
  const errorCode = getControlPlaneErrorCode(error);
  const errorMessage = getControlPlaneErrorMessage(error).toLowerCase();
  const participantMessage =
    getControlPlaneErrorMessage(firstFailedParticipant).toLowerCase();

  if (errorCode === 'DISTRIBUTED_PARTICIPANT_FAILURE' ||
      Array.isArray(error?.participantFailures) &&
      error.participantFailures.length > NUM.ZERO ||
      errorMessage.includes('participant failures')) {
    pushUniqueCause(
      causeChain,
      AUTHORITATIVE_REPAIR_CAUSE.QUERY_PARTICIPANT_FAILURE,
    );
  }
  if (errorMessage.includes(AUTHORITATIVE_REPAIR_TIMEOUT_FRAGMENT) ||
      participantMessage.includes(AUTHORITATIVE_REPAIR_TIMEOUT_FRAGMENT)) {
    pushUniqueCause(causeChain, AUTHORITATIVE_REPAIR_CAUSE.QUERY_TIMEOUT);
  }
  if (isRetryableControlPlaneError(error) ||
      isRetryableControlPlaneError(firstFailedParticipant)) {
    pushUniqueCause(
      causeChain,
      AUTHORITATIVE_REPAIR_CAUSE.CONTROL_PLANE_BACKPRESSURE,
    );
  }
  if (AUTHORITATIVE_REPAIR_LEADER_GAP_FRAGMENTS.some((fragment) =>
    errorMessage.includes(fragment) || participantMessage.includes(fragment))) {
    pushUniqueCause(
      causeChain,
      AUTHORITATIVE_REPAIR_CAUSE.LEADER_RESOLUTION_GAP,
    );
  }
  if (AUTHORITATIVE_REPAIR_REPLAY_BACKLOG_FRAGMENTS.some((fragment) =>
    errorMessage.includes(fragment) || participantMessage.includes(fragment))) {
    pushUniqueCause(
      causeChain,
      AUTHORITATIVE_REPAIR_CAUSE.REPLAY_BACKLOG,
    );
  }

  return causeChain;
}

function summarizeAuthoritativeRepairError(tableName, error) {
  const firstFailedParticipant = normalizeFirstFailedParticipant(
    error?.firstFailedParticipant ||
      (Array.isArray(error?.participantFailures) ?
        error.participantFailures[NUM.ZERO] :
        null),
    tableName,
  );
  return {
    tableName,
    error: getControlPlaneErrorMessage(error) || 'unknown_error',
    errorCode: getControlPlaneErrorCode(error) || null,
    retryAfterMs: getControlPlaneRetryAfterMs(error) || null,
    readSource:
      typeof error?.readSource === TYPEOF.STRING ?
        error.readSource :
        null,
    localQueryTransport:
      normalizeLocalQueryTransportDiagnostic(error?.localQueryTransport),
    firstFailedParticipant,
    causeChain:
      deriveAuthoritativeRepairCauseChain(error, firstFailedParticipant),
  };
}

/**
 * Determine whether a service row represents an active voter-ready replica.
 * @param {Object} serviceRow
 * @return {boolean}
 */
function isActiveVoterReadyPartitionReplica(serviceRow) {
  if (!serviceRow || typeof serviceRow !== TYPEOF.OBJECT) {
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
  if (String(status || '').toLowerCase() !== STATUS_ACTIVE) {
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
  const address = firstStringField(
    serviceRow, COLUMN.ADDRESS, 'address',
  );
  return Boolean(address);
}

/**
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
  return compareSchemaVersionValues(candidate, current) >= NUM.ZERO ?
    candidate :
    current;
}

/**
 * Extract the best schema version value from a record.
 * @param {Object} record
 * @return {string|null}
 */
function extractSchemaVersionFromRecord(record) {
  if (!record || typeof record !== TYPEOF.OBJECT) {
    return null;
  }
  for (const fieldName of
    SERVICE_DISCOVERY_SCHEMA_VERSION_FIELD_CANDIDATES) {
    const normalized = normalizeSchemaVersionValue(record[fieldName]);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

/**
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
    if (typeof inputValue !== TYPEOF.STRING) {
      return;
    }

    for (const value of inputValue.split(',')) {
      const trimmedValue = value.trim();
      if (trimmedValue.length > NUM.ZERO) {
        values.push(trimmedValue);
      }
    }
  };

  collectValues(rawValue);
  return uniqueSorted(values);
}

/**
 * Parse optional boolean query value with fallback.
 * @param {*} rawValue
 * @param {boolean} fallback
 * @return {boolean}
 */
function parseDiscoveryBooleanQuery(rawValue, fallback) {
  if (typeof rawValue === TYPEOF.BOOLEAN) {
    return rawValue;
  }
  if (typeof rawValue !== TYPEOF.STRING) {
    return fallback;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  if (normalizedValue === ENDPOINT_SYNC_BOOLEAN.TRUE ||
    normalizedValue === ENDPOINT_SYNC_BOOLEAN.ONE) {
    return true;
  }
  if (normalizedValue === ENDPOINT_SYNC_BOOLEAN.FALSE ||
    normalizedValue === ENDPOINT_SYNC_BOOLEAN.ZERO) {
    return false;
  }
  return fallback;
}

/**
 * Parse local service-discovery SQL with optional tableName/tableId args.
 * @param {string} sql
 * @return {{isQuery: boolean, tableName: (string|null), tableId: (string|null)}}
 */
function parseServiceDiscoverySqlQuery(sql) {
  const normalizedSql = normalizeSql(sql);
  if (normalizedSql ===
      normalizeSql(ADMIN_SERVICE_DISCOVERY.QUERY_SQL)) {
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
      tableId: normalizeDiscoveryTableId(tableAndIdMatch[2]),
    };
  }

  const match = normalizedSql.match(
    SERVICE_DISCOVERY_SQL_WITH_TABLE_PATTERN,
  );
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
}

// ── AdminServiceDiscovery class ─────────────────────────────────────────────

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
      typeof deps.partitionServicesProvider === TYPEOF.FUNCTION ?
        deps.partitionServicesProvider :
        null;
    this.partitionServices =
      deps.partitionServices instanceof Map ?
        deps.partitionServices :
        null;
    this.controlPlaneSystemTableGateway =
      deps.controlPlaneSystemTableGateway ||
      getRegisteredControlPlaneSystemTableGateway() ||
      null;
    this.buildPreflightCacheFreshnessSummary =
      typeof deps.buildPreflightCacheFreshnessSummary === TYPEOF.FUNCTION ?
        deps.buildPreflightCacheFreshnessSummary :
        null;
    this.buildControlSnapshotReplicaOperationSummary =
      typeof deps.buildControlSnapshotReplicaOperationSummary ===
        TYPEOF.FUNCTION ?
        deps.buildControlSnapshotReplicaOperationSummary :
        null;
    this.nowFn =
      typeof deps.nowFn === TYPEOF.FUNCTION ?
        deps.nowFn :
        () => Date.now();

    this.authoritativeDiscoveryRepairPromise = null;
    this.lastAuthoritativeDiscoveryRepairAtMs = NUM.ZERO;
    this.lastAuthoritativeDiscoveryRepairCompletedAtMs = NUM.ZERO;
    this.lastAuthoritativeDiscoveryRepairResult = null;
  }

  /**
   * Build local service-discovery snapshot from system cache only.
   * @param {Object} [options={}]
   * @return {Object}
   */
  buildLocalServiceDiscoverySnapshot(options = {}) {
    if (!this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      throw new Error(
        ADMIN_ERROR_MESSAGE.SERVICE_DISCOVERY_UNAVAILABLE,
      );
    }

    const endpointRows =
      this.systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS);
    const definitionRows =
      this.systemTableCache.getAll(TABLES.SERVICE_DEFINITIONS);
    const readinessContext =
      this.buildServiceDiscoveryReadinessContext(options);
    const discoveredServices = buildServiceDiscoveryCatalog(
      endpointRows, {
        protocolAllowlist:
          options.protocolAllowlist || ADMIN_CACHE_DUMP.EMPTY,
        serviceIdAllowlist:
          options.serviceIdAllowlist || ADMIN_CACHE_DUMP.EMPTY,
        nodeIdAllowlist:
          options.nodeIdAllowlist || ADMIN_CACHE_DUMP.EMPTY,
        healthyOnly: options.healthyOnly === true,
        unhealthyPolicy: options.unhealthyPolicy,
        definitionRows,
      },
    );
    const services = discoveredServices.map((service) => ({
      ...service,
      replicas: service.replicas.map((replica) => {
        const readiness =
          this.buildServiceDiscoveryReplicaReadiness(
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
      NUM.ZERO,
    );

    return {
      schemaVersion: ADMIN_SERVICE_DISCOVERY.SCHEMA_VERSION,
      nodeId: this.nodeId,
      capturedAt: Date.now(),
      serviceCount: services.length,
      replicaCount,
      replicaOperations:
        readinessContext.replicaOperationSummary &&
          typeof readinessContext.replicaOperationSummary === TYPEOF.OBJECT ?
          readinessContext.replicaOperationSummary :
          null,
      services,
    };
  }

  /**
   * Resolve local service discovery snapshot with bounded
   * authoritative repair.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async resolveServiceDiscoverySnapshot(options = {}) {
    const snapshot =
      this.buildLocalServiceDiscoverySnapshot(options);
    const allowAuthoritativeRepair =
      options.allowAuthoritativeRepair === true;
    const repairEvaluation =
      this.evaluateAuthoritativeDiscoveryRepair(
        snapshot,
        options,
      );
    if (!shouldAttemptAuthoritativeRepair({
      repairEvaluation,
      allowAuthoritativeRepair,
    })) {
      return snapshot;
    }
    const repair =
      await this.ensureAuthoritativeDiscoveryCacheRepair({
        reason: 'service_discovery_snapshot',
        tableName: options.tableName || null,
        tableId: options.tableId || null,
        triggerCodes: repairEvaluation.triggerCodes,
      });
    if (repair.applied !== true) {
      return snapshot;
    }
    return this.buildLocalServiceDiscoverySnapshot(options);
  }

  /**
   * Determine whether discovery snapshot warrants authoritative
   * cache repair.
   * @param {Object} snapshot
   * @param {Object} [options={}]
   * @return {boolean}
   */
  evaluateAuthoritativeDiscoveryRepair(
    snapshot, options = {},
  ) {
    if (!this.systemTableCache ||
        !this.cacheMutationTarget ||
        typeof this.cacheMutationTarget.applySystemTableChange !==
          TYPEOF.FUNCTION ||
        !this.canReadAuthoritativeDiscoveryRows()) {
      return null;
    }
    if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
      return null;
    }
    const freshness = this.buildPreflightCacheFreshnessSummary ?
      this.buildPreflightCacheFreshnessSummary({
        capturedAtMs: Date.now(),
      }) :
      null;
    const stalenessMs = Number(freshness?.stalenessMs);
    const cacheRepairEligible =
      !Number.isFinite(stalenessMs) ||
      stalenessMs >=
        AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS;
    const scopedDiscoveryQuery =
      normalizeIdentifier(options.tableName) !== null ||
      normalizeDiscoveryTableId(options.tableId) !== null;
    const services = Array.isArray(snapshot.services) ?
      snapshot.services : [];
    let readyReplicaCount = NUM.ZERO;
    const selectedNodeIds = new Set();
    let hasCacheGapReasons = false;
    for (const service of services) {
      const replicas = Array.isArray(service?.replicas) ?
        service.replicas : [];
      for (const replica of replicas) {
        const nodeId = String(replica?.nodeId || EMPTY_STRING);
        const readiness = replica?.readiness || null;
        if (!readiness ||
            typeof readiness !== TYPEOF.OBJECT) {
          continue;
        }
        const reasons = Array.isArray(readiness.reasons) ?
          readiness.reasons : [];
        if (readiness.benchmarkReady === true ||
            reasons.length === NUM.ZERO) {
          readyReplicaCount += NUM.ONE;
          if (nodeId) {
            selectedNodeIds.add(nodeId);
          }
        }
        for (const reason of reasons) {
          const code = String(reason?.code || EMPTY_STRING);
          if (AUTHORITATIVE_DISCOVERY_CACHE_GAP_REASON_CODES
            .has(code)) {
            hasCacheGapReasons = true;
          }
        }
      }
    }
    const serviceEndpointsCount =
      typeof this.systemTableCache.count === TYPEOF.FUNCTION ?
        this.systemTableCache.count(TABLES.SERVICE_ENDPOINTS) :
        this.systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS).length;
    const nodeCoverage = evaluateSharedMetadataNodeCoverage({
      nodeRows: this.systemTableCache.getAll(TABLES.NODES),
      serviceRows: this.systemTableCache.getAll(TABLES.SERVICES),
      partitionRows: this.systemTableCache.getAll(TABLES.PARTITIONS),
      nodeEndpointRows: this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS),
    });
    const staleReplicaOpsInFlightCount = Number(
      snapshot?.replicaOperations?.staleInFlightCount,
    );
    const evaluation = evaluateAuthoritativeRepairPolicy({
      cacheStalenessMs: stalenessMs,
      staleThresholdMs: AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS,
      cacheRepairEligible,
      scopedQuery: scopedDiscoveryQuery,
      serviceCount: snapshot.serviceCount,
      replicaCount: snapshot.replicaCount,
      readyReplicaCount,
      selectedNodeCount: selectedNodeIds.size,
      serviceEndpointsCount,
      nodeCoverageGap: nodeCoverage.hasCoverageGap,
      staleReplicaOpsInFlightCount,
      hasCacheGapReasons,
    });
    return evaluation;
  }

  /**
   * Determine whether discovery snapshot warrants authoritative
   * cache repair.
   * @param {Object} snapshot
   * @param {Object} [options={}]
   * @return {boolean}
   */
  shouldAttemptAuthoritativeDiscoveryRepair(
    snapshot, options = {},
  ) {
    return this.evaluateAuthoritativeDiscoveryRepair(
      snapshot,
      options,
    )?.shouldRepair === true;
  }

  /**
   * Build per-replica readiness context from local cache state.
   * @param {Object} [options={}]
   * @return {Object}
   */
  buildServiceDiscoveryReadinessContext(options = {}) {
    const tableName = normalizeIdentifier(options.tableName);
    const tableId = normalizeDiscoveryTableId(options.tableId);
    const nodeRows =
      this.systemTableCache.getAll(TABLES.NODES);
    const serviceRows =
      this.systemTableCache.getAll(TABLES.SERVICES);
    const partitionRows =
      this.systemTableCache.getAll(TABLES.PARTITIONS);
    const tableRows =
      this.systemTableCache.getAll(TABLES.TABLES);
    const replicaOperationRows =
      this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS);

    const activeNodeIds = new Set(nodeRows
      .map((row) => ({
        nodeId: firstStringField(
          row, COLUMN.NODE_ID, 'node_id', 'nodeId', 'id',
        ),
        status: firstStringField(
          row, COLUMN.STATUS, 'status',
        ),
      }))
      .filter((entry) =>
        entry.nodeId &&
        String(entry.status || '').toLowerCase() === STATUS_ACTIVE)
      .map((entry) => entry.nodeId));

    const tablePartitionContext =
      this.resolveDiscoveryTablePartitionContext(
        tableName,
        tableId,
        partitionRows,
        tableRows,
      );
    const schemaReady = this.resolveDiscoverySchemaReady(
      tablePartitionContext.partitionIds,
      serviceRows,
    );
    const leadershipStable =
      this.resolveDiscoveryLeadershipStable(
        tablePartitionContext.partitionIds,
        partitionRows,
        serviceRows,
      );
    const localTargetReplicaStateByNodeId =
      this.buildDiscoveryLocalTargetReplicaStateByNodeId(
        tablePartitionContext.partitionIds,
        serviceRows,
      );
    const localTargetPartitionIds =
      this.buildDiscoveryLocalTargetPartitionIds(
        tablePartitionContext.partitionIds,
        serviceRows,
      );
    const localPartitionCdcState =
      this.buildDiscoveryLocalPartitionCdcState({
        localTargetPartitionIds,
        tableName,
        cdcReadinessApplies:
          tablePartitionContext.cdcReadinessApplies,
      });
    const replicaOperationSummary =
      this.buildControlSnapshotReplicaOperationSummary ?
        this.buildControlSnapshotReplicaOperationSummary(
          replicaOperationRows, {
            partitionIds: tablePartitionContext.partitionIds,
            serviceRows,
          },
        ) :
        {
          inFlightCount: NUM.ZERO,
          staleInFlightCount: NUM.ZERO,
          stepHistogram: {},
          oldestInFlightAgeMs: null,
          operationTimelineById: {},
        };
    const replicaOperationDegradationByNodeId =
      this.buildDiscoveryReplicaOperationDegradationByNodeId(
        replicaOperationRows,
        {
          partitionIds: tablePartitionContext.partitionIds,
          serviceRows,
        },
      );

    return {
      tableName,
      tableFound: tablePartitionContext.tableFound,
      appliedSchemaVersion:
        tablePartitionContext.appliedSchemaVersion,
      activeNodeIds,
      schemaReady,
      leadershipStable,
      localTargetReplicaStateByNodeId,
      localPartitionCdcState,
      replicaOpsInFlight:
        replicaOperationSummary.inFlightCount,
      staleReplicaOpsInFlight:
        Number(replicaOperationSummary.staleInFlightCount || NUM.ZERO),
      oldestReplicaOperationAgeMs:
        Number.isFinite(replicaOperationSummary.oldestInFlightAgeMs) ?
          Math.floor(replicaOperationSummary.oldestInFlightAgeMs) :
          null,
      replicaOperationTimelineById:
        replicaOperationSummary.operationTimelineById &&
          typeof replicaOperationSummary.operationTimelineById ===
            TYPEOF.OBJECT ?
          replicaOperationSummary.operationTimelineById :
          {},
      replicaOperationSummary,
      replicaOperationDegradationByNodeId,
    };
  }

  /**
   * Resolve local active target partition IDs for table-scoped
   * discovery.
   * @param {Set<string>} partitionIds
   * @param {Array<Object>} serviceRows
   * @return {Set<string>}
   */
  buildDiscoveryLocalTargetPartitionIds(
    partitionIds, serviceRows,
  ) {
    const localPartitionIds = new Set();
    if (!(partitionIds instanceof Set) ||
        partitionIds.size === NUM.ZERO) {
      return localPartitionIds;
    }

    for (const serviceRow of serviceRows) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        'service_type',
        'serviceType',
        'type',
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        continue;
      }
      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'id',
      );
      if (!partitionId || !partitionIds.has(partitionId)) {
        continue;
      }
      const nodeId = firstStringField(
        serviceRow,
        COLUMN.NODE_ID,
        'node_id',
        'nodeId',
      );
      if (nodeId !== this.nodeId) {
        continue;
      }
      const status = firstStringField(
        serviceRow, COLUMN.STATUS, 'status',
      );
      if (String(status || '').toLowerCase() !== STATUS_ACTIVE) {
        continue;
      }
      localPartitionIds.add(partitionId);
    }
    return localPartitionIds;
  }

  /**
   * Resolve one node-local partition-services registry.
   * @return {Map<string, Object>|null}
   */
  resolveLocalPartitionServices() {
    if (this.partitionServicesProvider) {
      const provided = this.partitionServicesProvider();
      return provided instanceof Map ? provided : null;
    }
    return this.partitionServices instanceof Map ?
      this.partitionServices :
      null;
  }

  /**
   * Return true when the injected authoritative system-table read owner is
   * available.
   * @return {boolean}
   */
  hasAuthoritativeDiscoveryReadOwner() {
    return Boolean(
      this.controlPlaneSystemTableGateway &&
      typeof this.controlPlaneSystemTableGateway.executeRead ===
        TYPEOF.FUNCTION,
    );
  }

  /**
   * Return true when authoritative discovery repair can read canonical rows.
   * @return {boolean}
   */
  canReadAuthoritativeDiscoveryRows() {
    return this.hasAuthoritativeDiscoveryReadOwner();
  }

  /**
   * Resolve one local partition service by partition ID.
   * @param {Map<string, Object>|null} partitionServices
   * @param {string} partitionId
   * @return {Object|null}
   */
  resolveLocalPartitionService(partitionServices, partitionId) {
    if (!(partitionServices instanceof Map) || !partitionId) {
      return null;
    }
    if (partitionServices.has(partitionId)) {
      return partitionServices.get(partitionId) || null;
    }
    for (const partitionService of partitionServices.values()) {
      if (partitionService?.partitionId === partitionId) {
        return partitionService;
      }
    }
    return null;
  }

  /**
   * Read one authoritative system-table row set through the injected CDC
   * owner when available.
   * @param {string} tableName
   * @param {Object} options
   * @return {Promise<{tableName:string,rows:Object[]}|null>}
   * @private
   */
  async readAuthoritativeSystemTableRowsViaOwner(
    tableName, options = {},
  ) {
    if (!this.hasAuthoritativeDiscoveryReadOwner() ||
        typeof this.controlPlaneSystemTableGateway?.executeRead !==
          TYPEOF.FUNCTION) {
      return null;
    }

    const now = options.nowMs || Date.now();
    const reason = String(options.reason || '');
    const controlSnapshotRepairRead =
      reason === AUTHORITATIVE_DISCOVERY_REPAIR_REASON_CONTROL_SNAPSHOT;
    const queryResult =
      await this.controlPlaneSystemTableGateway.executeRead(
        {
          tableName,
          sql: `SELECT * FROM ${tableName}`,
          params: ADMIN_CACHE_DUMP.EMPTY,
          strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED,
          owner: 'admin-service-discovery',
        },
        {
          queryTimeoutMs:
            AUTHORITATIVE_DISCOVERY_REPAIR.QUERY_TIMEOUT_MS,
          allowSqlFallback: true,
          sessionId:
            `${reason || 'repair'}` +
            `:${tableName}:${now}`,
          allowPressureDegrade:
            controlSnapshotRepairRead ? false : undefined,
          workClass:
            controlSnapshotRepairRead ?
              PRESSURE_WORK_CLASS.CRITICAL :
              undefined,
          deliveryPriority: controlSnapshotRepairRead ? 'critical' : undefined,
          routingReadinessDimension:
            CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE,
        },
      );
    if (queryResult?.success !== true) {
      const error = new Error(
        queryResult.error ||
          'authoritative_query_failed',
      );
      error.code = queryResult?.errorCode || null;
      error.retryAfterMs = getControlPlaneRetryAfterMs(queryResult) || null;
      error.readSource =
        typeof queryResult?.source === TYPEOF.STRING ?
          queryResult.source :
          null;
      error.localQueryTransport =
        normalizeLocalQueryTransportDiagnostic(queryResult?.localQueryTransport);
      error.tableName = tableName;
      error.failedPartitions = Array.isArray(queryResult?.failedPartitions) ?
        [...queryResult.failedPartitions] :
        [];
      error.partitionErrors = Array.isArray(queryResult?.partitionErrors) ?
        queryResult.partitionErrors.map((entry) => ({...entry})) :
        [];
      error.participantFailures = Array.isArray(queryResult?.participantFailures) ?
        queryResult.participantFailures.map((entry) => ({...entry})) :
        [];
      error.firstFailedParticipant =
        queryResult?.firstFailedParticipant &&
        typeof queryResult.firstFailedParticipant === TYPEOF.OBJECT ?
          {...queryResult.firstFailedParticipant} :
          null;
      error.distributedMetrics =
        queryResult?.distributedMetrics &&
        typeof queryResult.distributedMetrics === TYPEOF.OBJECT ?
          queryResult.distributedMetrics :
          null;
      throw error;
    }

    return {
      tableName,
      rows: Array.isArray(queryResult?.rows) ?
        queryResult.rows :
        ADMIN_CACHE_DUMP.EMPTY,
    };
  }

  /**
   * Resolve one authoritative row set for bounded discovery repair.
   * Uses the canonical control-plane read gateway only.
   * @param {string} tableName
   * @param {Object} options
   * @return {Promise<{tableName: string, rows: Object[]}>}
   */
  async readAuthoritativeSystemTableRows(
    tableName, options = {},
  ) {
    const ownerRows =
      await this.readAuthoritativeSystemTableRowsViaOwner(
        tableName,
        options,
      );
    if (ownerRows) {
      return ownerRows;
    }
    throw new Error('authoritative_row_source_unavailable');
  }

  /**
   * Build node-local CDC readiness state for active propagated
   * system-table partitions.
   * @param {Object} options
   * @return {Object}
   */
  buildDiscoveryLocalPartitionCdcState(options = {}) {
    const state = {
      applies: false,
      ready: true,
      diagnosticsAvailable: true,
      missingDiagnosticsPartitionIds: [],
      noSubscriberPartitionIds: [],
      bufferedPartitionIds: [],
    };
    const localTargetPartitionIds =
      options.localTargetPartitionIds;
    const tableName = String(options.tableName || '');
    if (options.cdcReadinessApplies !== true ||
        !isTableCdcReadinessRelevant(tableName) ||
        !(localTargetPartitionIds instanceof Set) ||
        localTargetPartitionIds.size === NUM.ZERO) {
      return state;
    }

    const partitionServices =
      this.resolveLocalPartitionServices();
    if (!(partitionServices instanceof Map)) {
      return state;
    }

    state.applies = true;
    for (const partitionId of localTargetPartitionIds) {
      const partitionService =
        this.resolveLocalPartitionService(
          partitionServices,
          partitionId,
        );
      if (!partitionService ||
          typeof partitionService.getCDCSubscriptionDiagnostics !==
            TYPEOF.FUNCTION) {
        state.ready = false;
        state.diagnosticsAvailable = false;
        state.missingDiagnosticsPartitionIds.push(partitionId);
        continue;
      }

      const diagnostics =
        partitionService.getCDCSubscriptionDiagnostics();
      if (!diagnostics ||
          typeof diagnostics !== TYPEOF.OBJECT) {
        state.ready = false;
        state.diagnosticsAvailable = false;
        state.missingDiagnosticsPartitionIds.push(partitionId);
        continue;
      }

      const subscriberCount = Number(
        diagnostics.subscriberCount || NUM.ZERO,
      );
      const bufferedEvents = Number(
        diagnostics.bufferedEvents || NUM.ZERO,
      );
      const replayInFlight =
        diagnostics.bufferReplayInFlight === true;
      if (subscriberCount <= NUM.ZERO) {
        state.ready = false;
        state.noSubscriberPartitionIds.push(partitionId);
      }
      if (bufferedEvents > NUM.ZERO || replayInFlight) {
        state.ready = false;
        state.bufferedPartitionIds.push(partitionId);
      }
    }

    state.missingDiagnosticsPartitionIds = uniqueSorted(
      state.missingDiagnosticsPartitionIds,
    );
    state.noSubscriberPartitionIds = uniqueSorted(
      state.noSubscriberPartitionIds,
    );
    state.bufferedPartitionIds = uniqueSorted(
      state.bufferedPartitionIds,
    );
    return state;
  }

  /**
   * Build per-node local target-replica readiness for table-scoped
   * discovery.
   * @param {Set<string>} partitionIds
   * @param {Array<Object>} serviceRows
   * @return {Map<string, Object>}
   */
  buildDiscoveryLocalTargetReplicaStateByNodeId(
    partitionIds, serviceRows,
  ) {
    const stateByNodeId = new Map();
    if (!(partitionIds instanceof Set) ||
        partitionIds.size === NUM.ZERO) {
      return stateByNodeId;
    }

    for (const serviceRow of serviceRows) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        'service_type',
        'serviceType',
        'type',
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        continue;
      }
      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'id',
      );
      if (!partitionId || !partitionIds.has(partitionId)) {
        continue;
      }
      const status = firstStringField(
        serviceRow, COLUMN.STATUS, 'status',
      );
      if (String(status || '').toLowerCase() !== STATUS_ACTIVE) {
        continue;
      }
      const nodeId = firstStringField(
        serviceRow,
        COLUMN.NODE_ID,
        'node_id',
        'nodeId',
      );
      if (!nodeId) {
        continue;
      }

      const nodeState = stateByNodeId.get(nodeId) || {
        nonVoterPartitionIds: new Set(),
        replicaRoles: new Set(),
      };
      const raftRole = String(firstStringField(
        serviceRow,
        COLUMN.RAFT_ROLE,
        'raft_role',
        'raftRole',
      ) || EMPTY_STRING).toLowerCase();
      if (raftRole.length > NUM.ZERO) {
        nodeState.replicaRoles.add(raftRole);
      }
      if (!isActiveVoterReadyPartitionReplica(serviceRow)) {
        nodeState.nonVoterPartitionIds.add(partitionId);
      }
      stateByNodeId.set(nodeId, nodeState);
    }

    return stateByNodeId;
  }

  /**
   * Resolve partition context for optional table-scoped readiness.
   * @param {string|null} tableName
   * @param {string|null} tableId
   * @param {Array<Object>} partitionRows
   * @param {Array<Object>} tableRows
   * @return {Object}
   */
  resolveDiscoveryTablePartitionContext(
    tableName, tableId, partitionRows, tableRows,
  ) {
    if (!tableName && !tableId) {
      return {
        tableFound: true,
        partitionIds: new Set(),
        appliedSchemaVersion: null,
        cdcReadinessApplies: false,
      };
    }

    const tableIds = new Set();
    const matchingTableRows = [];
    let appliedSchemaVersion = null;
    let cdcReadinessApplies = false;
    for (const tableRow of tableRows) {
      const rowTableName = firstStringField(
        tableRow,
        COLUMN.TABLE_NAME,
        'table_name',
        'tableName',
        'name',
      );
      const rowTableId = firstStringField(
        tableRow,
        COLUMN.TABLE_ID,
        'table_id',
        'tableId',
        'id',
      );
      const matchesTableName =
        tableName && rowTableName === tableName;
      const matchesTableId =
        tableId && rowTableId === tableId;
      if (!matchesTableName && !matchesTableId) {
        continue;
      }
      matchingTableRows.push(tableRow);
      if (rowTableId) {
        tableIds.add(rowTableId);
      }
      if (isTableCdcReadinessRelevant(rowTableName)) {
        cdcReadinessApplies = true;
      }
      const rowSchemaVersion =
        extractSchemaVersionFromRecord(tableRow);
      appliedSchemaVersion = selectNewestSchemaVersion(
        appliedSchemaVersion,
        rowSchemaVersion,
      );
    }
    if (tableId) {
      tableIds.add(tableId);
    }

    const matchingPartitionRows = [];
    for (const partitionRow of partitionRows) {
      const rowTableName = firstStringField(
        partitionRow,
        COLUMN.TABLE_NAME,
        'table_name',
        'tableName',
        'name',
      );
      const rowTableId = firstStringField(
        partitionRow,
        COLUMN.TABLE_ID,
        'table_id',
        'tableId',
      );
      const matchesTableName =
        tableName && rowTableName === tableName;
      const matchesTableId =
        rowTableId && tableIds.has(rowTableId);
      if (matchesTableName || matchesTableId) {
        matchingPartitionRows.push(partitionRow);
        const rowSchemaVersion =
          extractSchemaVersionFromRecord(partitionRow);
        appliedSchemaVersion = selectNewestSchemaVersion(
          appliedSchemaVersion,
          rowSchemaVersion,
        );
      }
    }
    const activeServingPartitionRows =
      filterActiveServingPartitionRows(
        matchingPartitionRows,
        matchingTableRows,
      );
    const partitionIds = new Set();
    for (const partitionRow of activeServingPartitionRows) {
      const partitionId = firstStringField(
        partitionRow,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'id',
      );
      if (!partitionId) {
        continue;
      }
      partitionIds.add(partitionId);
    }

    return {
      tableFound:
        matchingTableRows.length > NUM.ZERO ||
        matchingPartitionRows.length > NUM.ZERO,
      partitionIds,
      appliedSchemaVersion,
      cdcReadinessApplies,
    };
  }

  /**
   * Resolve table-scope schema readiness from active partition
   * coverage.
   * @param {Set<string>} partitionIds
   * @param {Array<Object>} serviceRows
   * @return {boolean}
   */
  resolveDiscoverySchemaReady(partitionIds, serviceRows) {
    if (!(partitionIds instanceof Set) ||
        partitionIds.size === NUM.ZERO) {
      return false;
    }

    const readyPartitionIds = new Set();
    for (const serviceRow of serviceRows) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        'service_type',
        'serviceType',
        'type',
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        continue;
      }
      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'id',
      );
      if (!partitionId || !partitionIds.has(partitionId)) {
        continue;
      }
      const status = firstStringField(
        serviceRow, COLUMN.STATUS, 'status',
      );
      if (String(status || '').toLowerCase() !== STATUS_ACTIVE) {
        continue;
      }
      const nodeId = firstStringField(
        serviceRow,
        COLUMN.NODE_ID,
        'node_id',
        'nodeId',
      );
      if (!nodeId) {
        continue;
      }
      readyPartitionIds.add(partitionId);
    }

    return readyPartitionIds.size === partitionIds.size;
  }

  /**
   * Resolve leader-coverage stability for target partitions.
   * @param {Set<string>} partitionIds
   * @param {Array<Object>} partitionRows
   * @param {Array<Object>} serviceRows
   * @return {boolean}
   */
  resolveDiscoveryLeadershipStable(
    partitionIds, partitionRows, serviceRows,
  ) {
    if (!(partitionIds instanceof Set) ||
        partitionIds.size === NUM.ZERO) {
      return true;
    }

    const activeReplicaNodeIdsByPartition = new Map();
    const advisoryLeaderPartitionIds = new Set();
    for (const serviceRow of serviceRows) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        'service_type',
        'serviceType',
        'type',
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        continue;
      }
      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'id',
      );
      if (!partitionId || !partitionIds.has(partitionId)) {
        continue;
      }
      const status = firstStringField(
        serviceRow, COLUMN.STATUS, 'status',
      );
      if (String(status || '').toLowerCase() !== STATUS_ACTIVE) {
        continue;
      }
      const nodeId = firstStringField(
        serviceRow,
        COLUMN.NODE_ID,
        'node_id',
        'nodeId',
      );
      if (!nodeId) {
        continue;
      }
      let activeReplicaNodeIds =
        activeReplicaNodeIdsByPartition.get(partitionId);
      if (!activeReplicaNodeIds) {
        activeReplicaNodeIds = new Set();
        activeReplicaNodeIdsByPartition.set(
          partitionId, activeReplicaNodeIds,
        );
      }
      activeReplicaNodeIds.add(nodeId);
      const raftRole = firstStringField(
        serviceRow,
        COLUMN.RAFT_ROLE,
        'raft_role',
        'raftRole',
      );
      if (String(raftRole || '').toLowerCase() !==
          LEADER_RAFT_ROLE) {
        continue;
      }
      advisoryLeaderPartitionIds.add(partitionId);
    }

    const partitionRowsById = new Map();
    for (const partitionRow of partitionRows) {
      const partitionId = firstStringField(
        partitionRow,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'id',
      );
      if (!partitionId || !partitionIds.has(partitionId) ||
          partitionRowsById.has(partitionId)) {
        continue;
      }
      partitionRowsById.set(partitionId, partitionRow);
    }

    for (const partitionId of partitionIds) {
      const partitionRow =
        partitionRowsById.get(partitionId) || null;
      const canonicalLeaderNodeId = firstStringField(
        partitionRow,
        COLUMN.LEADER_NODE_ID,
        'leader_node_id',
        'leaderNodeId',
      );
      if (canonicalLeaderNodeId) {
        const activeReplicaNodeIds =
          activeReplicaNodeIdsByPartition.get(partitionId);
        if (!(activeReplicaNodeIds instanceof Set) ||
            !activeReplicaNodeIds.has(canonicalLeaderNodeId)) {
          return false;
        }
        continue;
      }
      const bootstrapLeaderNodeId =
        this.resolveDiscoveryBootstrapLeaderNodeId(partitionId);
      if (bootstrapLeaderNodeId) {
        const activeReplicaNodeIds =
          activeReplicaNodeIdsByPartition.get(partitionId);
        if (activeReplicaNodeIds instanceof Set &&
            activeReplicaNodeIds.has(bootstrapLeaderNodeId)) {
          continue;
        }
      }
      if (!advisoryLeaderPartitionIds.has(partitionId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Resolve one fresh bootstrap leader from the SQL engine routing overlay
   * when cache owner metadata still lacks leader_node_id.
   * @param {string} partitionId
   * @return {string|null}
   */
  resolveDiscoveryBootstrapLeaderNodeId(partitionId) {
    if (typeof partitionId !== TYPEOF.STRING ||
        partitionId.length === NUM.ZERO) {
      return null;
    }

    const queryExecutor = this.sqlQueryEngine?.queryExecutor || null;
    if (!queryExecutor ||
        typeof queryExecutor.getPartitionRoutingSnapshot !==
          TYPEOF.FUNCTION) {
      return null;
    }

    try {
      const routingSnapshot =
        queryExecutor.getPartitionRoutingSnapshot(partitionId);
      const canonicalLeaderNodeId = firstStringField(
        routingSnapshot,
        'canonicalLeaderNodeId',
      );
      if (!canonicalLeaderNodeId) {
        return null;
      }
      const canonicalLeaderServiceCount = Number(
        routingSnapshot?.canonicalLeaderServiceCount,
      );
      return canonicalLeaderServiceCount > NUM.ZERO ?
        canonicalLeaderNodeId :
        null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Build additive canonical readiness block for one discovery
   * replica.
   * @param {Object} replica
   * @param {Object} readinessContext
   * @return {Object}
   */
  buildServiceDiscoveryReplicaReadiness(
    replica, readinessContext,
  ) {
    const nodeId = String(replica?.nodeId || '');
    const healthyEndpoint =
      String(replica?.healthStatus || '').toLowerCase() ===
      ENDPOINT_SYNC_HEALTH.HEALTHY;
    const routingReady = healthyEndpoint &&
      readinessContext.activeNodeIds.has(nodeId);
    const schemaReady = readinessContext.tableName ?
      (readinessContext.tableFound &&
        readinessContext.schemaReady === true) :
      true;
    const localTargetReplicaState =
      readinessContext
        .localTargetReplicaStateByNodeId instanceof Map ?
        readinessContext.localTargetReplicaStateByNodeId
          .get(nodeId) :
        null;
    const localReplicaReady = !localTargetReplicaState ||
      localTargetReplicaState.nonVoterPartitionIds.size ===
        NUM.ZERO;
    const localPartitionCdcState =
      nodeId === this.nodeId &&
      readinessContext.localPartitionCdcState &&
      typeof readinessContext.localPartitionCdcState ===
        TYPEOF.OBJECT ?
        readinessContext.localPartitionCdcState :
        null;
    const localCdcReady = !localPartitionCdcState ||
      localPartitionCdcState.applies !== true ||
      localPartitionCdcState.ready === true;
    const operationDegradation =
      readinessContext
        .replicaOperationDegradationByNodeId instanceof Map ?
        readinessContext.replicaOperationDegradationByNodeId
          .get(nodeId) :
        null;
    const operationDegraded =
      operationDegradation?.degradationState &&
      operationDegradation.degradationState !==
        BENCHMARK_DEGRADATION_STATE.HEALTHY;
    const topologyReady = localReplicaReady &&
      localCdcReady &&
      !operationDegraded &&
      readinessContext.leadershipStable === true;
    const benchmarkReady =
      routingReady && schemaReady && topologyReady;
    const workloadReady = benchmarkReady;
    const reasons = [];

    if (!routingReady) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON
          .ROUTING_NOT_READY,
        detail: 'endpoint unhealthy or node not ACTIVE',
      });
    }
    if (readinessContext.tableName &&
        !readinessContext.tableFound) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON
          .SCHEMA_TABLE_MISSING,
        detail: 'table "' + readinessContext.tableName +
          '" not found',
      });
    } else if (readinessContext.tableName && !schemaReady) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON
          .SCHEMA_PARTITION_UNAVAILABLE,
        detail: 'table "' + readinessContext.tableName +
          '" not query-ready on node',
      });
    }
    if (operationDegraded &&
        Array.isArray(operationDegradation?.reasons)) {
      for (const reason of operationDegradation.reasons) {
        reasons.push({
          code: reason.code,
          detail: reason.detail,
        });
      }
    }
    if (!readinessContext.leadershipStable) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON
          .LEADERSHIP_UNSTABLE,
        detail:
          'leader coverage incomplete for readiness scope',
      });
    }
    if (!localReplicaReady) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON
          .LOCAL_REPLICA_NOT_VOTER_READY,
        detail: uniqueSorted([
          ...localTargetReplicaState.nonVoterPartitionIds,
        ]).join(','),
      });
    }
    if (localPartitionCdcState?.applies === true &&
        localPartitionCdcState.diagnosticsAvailable === false &&
        localPartitionCdcState
          .missingDiagnosticsPartitionIds.length > NUM.ZERO) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON
          .LOCAL_CDC_DIAGNOSTICS_UNAVAILABLE,
        detail: localPartitionCdcState
          .missingDiagnosticsPartitionIds.join(','),
      });
    }
    if (localPartitionCdcState?.applies === true &&
        localPartitionCdcState
          .noSubscriberPartitionIds.length > NUM.ZERO) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON
          .LOCAL_CDC_SUBSCRIBER_MISSING,
        detail: localPartitionCdcState
          .noSubscriberPartitionIds.join(','),
      });
    }
    if (localPartitionCdcState?.applies === true &&
        localPartitionCdcState
          .bufferedPartitionIds.length > NUM.ZERO) {
      reasons.push({
        code: SERVICE_DISCOVERY_READINESS_REASON
          .LOCAL_CDC_BUFFER_NOT_DRAINED,
        detail: localPartitionCdcState
          .bufferedPartitionIds.join(','),
      });
    }

    return {
      workloadReady,
      benchmarkReady,
      routingReady,
      schemaReady,
      topologyReady,
      appliedSchemaVersion: readinessContext.tableName ?
        readinessContext.appliedSchemaVersion :
        null,
      replicaOpsInFlight:
        readinessContext.replicaOpsInFlight,
      leadershipStable:
        readinessContext.leadershipStable,
      tableName: readinessContext.tableName,
      reasons,
    };
  }

  /**
   * Build canonical benchmark-admission block for one discovery
   * replica.
   * @param {Object} replica
   * @param {Object} readinessContext
   * @param {Object} readiness
   * @return {Object}
   */
  buildServiceDiscoveryReplicaBenchmarkAdmission(
    replica,
    readinessContext,
    readiness,
  ) {
    const nodeId =
      String(replica?.nodeId || EMPTY_STRING);
    const operationDegradation =
      readinessContext
        .replicaOperationDegradationByNodeId instanceof Map ?
        readinessContext.replicaOperationDegradationByNodeId
          .get(nodeId) :
        null;
    const localTargetReplicaState =
      readinessContext
        .localTargetReplicaStateByNodeId instanceof Map ?
        readinessContext.localTargetReplicaStateByNodeId
          .get(nodeId) :
        null;
    let localReplicaRole = null;
    if (localTargetReplicaState?.replicaRoles instanceof Set &&
        localTargetReplicaState.replicaRoles.size ===
          NUM.ONE) {
      localReplicaRole =
        [...localTargetReplicaState.replicaRoles][NUM.ZERO];
    } else if (
      localTargetReplicaState?.replicaRoles instanceof Set &&
        localTargetReplicaState.replicaRoles.size > NUM.ONE
    ) {
      localReplicaRole = 'mixed';
    }

    const reasons = Array.isArray(readiness?.reasons) ?
      readiness.reasons.map((reason) => ({
        code: String(reason?.code || EMPTY_STRING),
        detail:
          typeof reason?.detail === TYPEOF.STRING &&
            reason.detail.length > NUM.ZERO ?
            reason.detail :
            null,
      })) :
      [];
    const degradedByOperationIds =
      Array.isArray(operationDegradation?.operationIds) ?
        [...operationDegradation.operationIds] :
        [];
    const timelineByOperationId =
      readinessContext.replicaOperationTimelineById &&
        typeof readinessContext.replicaOperationTimelineById === TYPEOF.OBJECT ?
        readinessContext.replicaOperationTimelineById :
        {};
    const replicaOperationTimeline = [];
    for (const operationId of degradedByOperationIds) {
      const operationTimeline = timelineByOperationId[operationId];
      if (!Array.isArray(operationTimeline)) {
        continue;
      }
      for (const entry of operationTimeline) {
        replicaOperationTimeline.push(entry);
      }
    }

    return {
      tableName: readiness?.tableName || null,
      nodeId,
      state: readiness?.benchmarkReady === true ?
        BENCHMARK_ADMISSION_STATE.READY :
        BENCHMARK_ADMISSION_STATE.BLOCKED,
      degradationState:
        operationDegradation?.degradationState ||
        BENCHMARK_DEGRADATION_STATE.HEALTHY,
      routingReady: readiness?.routingReady === true,
      schemaReady: readiness?.schemaReady === true,
      topologyReady: readiness?.topologyReady === true,
      localReplicaRole,
      degradedByOperationIds,
      reasons,
      replicaOperationTimeline,
    };
  }

  /**
   * Build per-node replica-operation degradation state for
   * benchmark admission.
   * @param {Array<Object>} replicaOperationRows
   * @param {Object} [options={}]
   * @return {Map<string, Object>}
   */
  buildDiscoveryReplicaOperationDegradationByNodeId(
    replicaOperationRows = [],
    options = {},
  ) {
    const degradationByNodeId = new Map();
    const scopedPartitionIds =
      options.partitionIds instanceof Set ?
        options.partitionIds :
        null;
    const serviceRows = Array.isArray(options.serviceRows) ?
      options.serviceRows :
      ADMIN_CACHE_DUMP.EMPTY;
    for (const row of replicaOperationRows) {
      if (!this.isReplicaOperationRelevantToDiscoveryScope(
        row,
        scopedPartitionIds,
      )) {
        continue;
      }
      const normalizedOperation = normalizeReplicaOperationRecord(row);
      const operationId = normalizedOperation.operationId;
      const status = normalizedOperation.status;
      const type = normalizedOperation.type;
      const nodeIds =
        this.resolveReplicaOperationDegradedNodeIds(
          normalizedOperation,
        );
      if (!operationId || nodeIds.length === NUM.ZERO) {
        continue;
      }
      const observedConverged =
        normalizedOperation.status !== 'failed' &&
        !isReplicaOperationTerminalSuccess(normalizedOperation) &&
        !isReplicaOperationInFlight(
          normalizedOperation,
          {
            serviceRows,
          },
        );
      if (isReplicaOperationTerminalSuccess(
        normalizedOperation,
      ) || observedConverged) {
        continue;
      }
      const staleTimeout = isReplicaOperationStale(
        normalizedOperation,
        {
          serviceRows,
          stepTimeoutMsByWorkflowStep:
            DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP,
          nowMs: this.nowFn(),
        },
      );
      const timeoutMs = Number(
        DEFAULT_STEP_TIMEOUT_MS_BY_WORKFLOW_STEP[
          normalizedOperation.workflowStep
        ],
      );

      const degradationState =
        this.resolveReplicaOperationDegradationState(
          type,
          status,
          {
            staleTimeout,
          },
        );
      if (degradationState ===
          BENCHMARK_DEGRADATION_STATE.HEALTHY) {
        continue;
      }
      const reasonCode =
        status === 'failed' ?
          SERVICE_DISCOVERY_READINESS_REASON
            .REPLICA_OPERATION_FAILED :
          (staleTimeout ?
            SERVICE_DISCOVERY_READINESS_REASON
              .REPLICA_OPERATION_STALE_TIMEOUT :
          SERVICE_DISCOVERY_READINESS_REASON
            .REPLICA_OPERATION_IN_FLIGHT);
      const reasonDetail =
        staleTimeout ?
          `${operationId}:${type}:${status}` +
            SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR +
            String(normalizedOperation.workflowStep || EMPTY_STRING) +
            SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR +
            'ageMs=' + String(normalizedOperation.ageMs) +
            SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR +
            'timeoutMs=' + (Number.isFinite(timeoutMs) ?
              String(timeoutMs) :
              EMPTY_STRING) :
          `${operationId}:${type}:${status}`;

      for (const nodeId of nodeIds) {
        const existing =
          degradationByNodeId.get(nodeId) || {
            degradationState:
              BENCHMARK_DEGRADATION_STATE.HEALTHY,
            operationIds: [],
            reasons: [],
          };
        if ((BENCHMARK_DEGRADATION_PRIORITY[
          degradationState] || NUM.ZERO) >
            (BENCHMARK_DEGRADATION_PRIORITY[
              existing.degradationState] || NUM.ZERO)) {
          existing.degradationState = degradationState;
        }
        existing.operationIds = uniqueSorted([
          ...existing.operationIds,
          operationId,
        ]);
        if (!existing.reasons.some((reason) =>
          reason.code === reasonCode &&
          reason.detail === reasonDetail)) {
          existing.reasons.push({
            code: reasonCode,
            detail: reasonDetail,
          });
        }
        degradationByNodeId.set(nodeId, existing);
      }
    }
    return degradationByNodeId;
  }

  /**
   * Resolve which nodes should be benchmark-degraded by one
   * replica operation.
   * ADD/REMOVE rows degrade the node hosting the affected replica.
   * REPLACE rows degrade both the source and the replacement target.
   * @param {Object} operation
   * @return {Array<string>}
   */
  resolveReplicaOperationDegradedNodeIds(operation) {
    const sourceNodeId = String(
      operation?.sourceNodeId || EMPTY_STRING,
    );
    const targetNodeId = String(
      operation?.targetNodeId || EMPTY_STRING,
    );
    if (operation?.type === REPLICA_OPERATION_TYPE.ADD ||
        operation?.type === REPLICA_OPERATION_TYPE.REMOVE) {
      return uniqueSorted([targetNodeId || sourceNodeId]);
    }
    return uniqueSorted([sourceNodeId, targetNodeId]);
  }

  /**
   * Determine whether one replica operation applies to the
   * discovered scope.
   * @param {Object} row
   * @param {Set<string>|null} scopedPartitionIds
   * @return {boolean}
   */
  isReplicaOperationRelevantToDiscoveryScope(
    row, scopedPartitionIds,
  ) {
    if (!(scopedPartitionIds instanceof Set) ||
        scopedPartitionIds.size === NUM.ZERO) {
      return true;
    }
    const partitionId = firstStringField(
      row,
      COLUMN.PARTITION_ID,
      'partition_id',
      'partitionId',
      'entity_id',
      'entityId',
    );
    return Boolean(partitionId) &&
      scopedPartitionIds.has(partitionId);
  }

  /**
   * Resolve one benchmark degradation state from
   * replica-operation type/status.
   * @param {string} type
   * @param {string} status
   * @return {string}
   */
  resolveReplicaOperationDegradationState(type, status, options = {}) {
    if (!type || !status) {
      return BENCHMARK_DEGRADATION_STATE.HEALTHY;
    }
    const isFailed = status === 'failed';
    const staleTimeout = options?.staleTimeout === true;
    const treatAsFailed = isFailed || staleTimeout;
    if (type === REPLICA_OPERATION_TYPE.REPLACE) {
      return treatAsFailed ?
        BENCHMARK_DEGRADATION_STATE.MOVE_FAILED :
        BENCHMARK_DEGRADATION_STATE.MOVE_PENDING;
    }
    if (type === REPLICA_OPERATION_TYPE.ADD) {
      return treatAsFailed ?
        BENCHMARK_DEGRADATION_STATE.PROMOTION_FAILED :
        BENCHMARK_DEGRADATION_STATE.PROMOTION_PENDING;
    }
    if (type === REPLICA_OPERATION_TYPE.REMOVE) {
      return BENCHMARK_DEGRADATION_STATE.DRAIN_BLOCKED;
    }
    return BENCHMARK_DEGRADATION_STATE.HEALTHY;
  }

  /**
   * Ensure bounded authoritative discovery cache repair.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async ensureAuthoritativeDiscoveryCacheRepair(options = {}) {
    if (!this.systemTableCache ||
        !this.cacheMutationTarget ||
        typeof this.cacheMutationTarget.applySystemTableChange !==
          TYPEOF.FUNCTION) {
      return {
        applied: false,
        skipped: true,
        tableCount: NUM.ZERO,
      };
    }
    if (!this.canReadAuthoritativeDiscoveryRows()) {
      return {
        applied: false,
        skipped: true,
        tableCount: NUM.ZERO,
      };
    }

    const now = this.nowFn();
    const repairTableNames =
      this.resolveAuthoritativeDiscoveryRepairTables(options);
    if (repairTableNames.length === NUM.ZERO) {
      return {
        applied: false,
        skipped: true,
        tableCount: NUM.ZERO,
      };
    }
    if (this.authoritativeDiscoveryRepairPromise) {
      return this.authoritativeDiscoveryRepairPromise;
    }
    const recentRepairResult =
      this.resolveRecentAuthoritativeDiscoveryRepair(
        {
          ...options,
          repairTables: repairTableNames,
        },
        now,
      );
    if (recentRepairResult) {
      return recentRepairResult;
    }
    if (options?.bypassReuse !== true &&
        now - this.lastAuthoritativeDiscoveryRepairAtMs <
          AUTHORITATIVE_DISCOVERY_REPAIR.COOLDOWN_MS &&
        this.lastAuthoritativeDiscoveryRepairCoversTables(
          repairTableNames,
        )) {
      return {
        applied: false,
        skipped: true,
        tableCount: NUM.ZERO,
      };
    }

    const runRepair = async () => {
      const causeId =
        'admin-authoritative-discovery-repair:' +
        String(options.reason || 'unknown') +
        ':' + String(now);
      let repairedTableCount = NUM.ZERO;
      let repairedRowCount = NUM.ZERO;
      const repairedTableNames = [];
      const authoritativeRowsByTable = new Map();
      const failedTables = [];
      const errors = [];
      const errorSummaries = [];
      for (const tableName of repairTableNames) {
        try {
          const result = await this.readAuthoritativeSystemTableRows(
            tableName,
            {
              nowMs: now,
              reason: options.reason || 'repair',
            },
          );
          authoritativeRowsByTable.set(tableName, {
            tableName: result.tableName,
            rows: result.rows,
          });
        } catch (error) {
          failedTables.push(tableName);
          errorSummaries.push(
            summarizeAuthoritativeRepairError(tableName, error),
          );
          errors.push(
            `${tableName}:` +
            String(
              error?.message ||
              error ||
              'unknown_error',
            ),
          );
        }
      }

      if (failedTables.length === NUM.ZERO) {
        for (const tableName of repairTableNames) {
          const result = authoritativeRowsByTable.get(tableName);
          try {
            repairedRowCount +=
              await this.applyAuthoritativeSystemTableRows(
                result?.tableName || tableName,
                result?.rows || ADMIN_CACHE_DUMP.EMPTY,
                causeId,
              );
            repairedTableCount += NUM.ONE;
            repairedTableNames.push(tableName);
          } catch (error) {
            failedTables.push(tableName);
            errorSummaries.push(
              summarizeAuthoritativeRepairError(tableName, error),
            );
            errors.push(
              `${tableName}:` +
              String(
                error?.message ||
                error ||
                'unknown_error',
              ),
            );
            break;
          }
        }
      }

      const completedAtMs = this.nowFn();
      this.lastAuthoritativeDiscoveryRepairAtMs = completedAtMs;
      const repairApplied =
        failedTables.length === NUM.ZERO &&
        repairedTableCount === repairTableNames.length;
      if (repairApplied) {
        this.lastAuthoritativeDiscoveryRepairCompletedAtMs =
          completedAtMs;
        this.lastAuthoritativeDiscoveryRepairResult = {
          applied: true,
          skipped: false,
          tableCount: repairedTableCount,
          tableNames: [...repairedTableNames],
          repairedRowCount,
          completedAtMs,
          reused: false,
        };
      } else {
        this.lastAuthoritativeDiscoveryRepairCompletedAtMs = NUM.ZERO;
        this.lastAuthoritativeDiscoveryRepairResult = null;
      }
      const result = this.lastAuthoritativeDiscoveryRepairResult || {
        applied: false,
        skipped: false,
        tableCount: repairedTableCount,
        tableNames: [...repairedTableNames],
        requestedTableCount: repairTableNames.length,
        requestedTableNames: [...repairTableNames],
        repairedRowCount,
        failedTables: [...failedTables],
        errorCount: errors.length,
        errors,
        causeChain: errorSummaries.flatMap((summary) =>
          Array.isArray(summary?.causeChain) ? summary.causeChain : [],
        ).filter((value, index, values) => values.indexOf(value) === index),
        readSource:
          errorSummaries.find((summary) => summary?.readSource)?.readSource ||
          null,
        localQueryTransport:
          errorSummaries.find((summary) => summary?.localQueryTransport)
            ?.localQueryTransport || null,
        firstFailedParticipant:
          errorSummaries.find((summary) => summary?.firstFailedParticipant)
            ?.firstFailedParticipant || null,
        completedAtMs,
        reused: false,
      };
      const errorCodes = [...new Set(
        errorSummaries
          .map((summary) => summary?.errorCode || null)
          .concat(
            errors.map((value) => {
              const message = String(value || '');
              const separatorIndex = message.indexOf(':');
              const summary = separatorIndex >= NUM.ZERO ?
                message.slice(separatorIndex + NUM.ONE).trim() :
                message.trim();
              return summary.length > NUM.ZERO ? summary : null;
            }),
          )
          .filter(Boolean),
      )].slice(NUM.ZERO, 5);
      if (!repairApplied) {
        this.logger?.warn?.(
          'Authoritative discovery cache repair failed', {
            nodeId: this.nodeId,
            reason: options.reason || null,
            tableName: options.tableName || null,
            tableId: options.tableId || null,
            repairTableNames,
            requestedTableCount: repairTableNames.length,
            repairedTableCount,
            repairedRowCount,
            failedTables,
            errorCount: errors.length,
            errorCodes,
            errors,
            causeChain: result.causeChain || [],
            readSource: result.readSource || null,
            localQueryTransport: result.localQueryTransport || null,
            firstFailedParticipant:
              result.firstFailedParticipant || null,
          },
        );
      } else {
        this.logger?.info?.(
          'Authoritative discovery cache repair completed', {
            nodeId: this.nodeId,
            reason: options.reason || null,
            tableName: options.tableName || null,
            tableId: options.tableId || null,
            repairTableNames,
            repairedTableCount,
            repairedRowCount,
          },
        );
      }

      return result;
    };

    this.authoritativeDiscoveryRepairPromise = runRepair()
      .finally(() => {
        this.authoritativeDiscoveryRepairPromise = null;
      });
    return this.authoritativeDiscoveryRepairPromise;
  }

  /**
   * Reuse one recent successful repair result for non-forced callers so
   * repeated local snapshots rebuild from the repaired cache instead of
   * issuing another full discovery repair immediately.
   * @param {Object} options
   * @param {number} nowMs
   * @return {Object|null}
   * @private
   */
  resolveRecentAuthoritativeDiscoveryRepair(options = {}, nowMs = null) {
    if (options?.bypassReuse === true) {
      return null;
    }
    const completedAtMs = Number(
      this.lastAuthoritativeDiscoveryRepairCompletedAtMs,
    );
    if (!Number.isFinite(completedAtMs) || completedAtMs <= NUM.ZERO) {
      return null;
    }
    const reuseWindowMs = Number.isFinite(options?.reuseWindowMs) &&
      options.reuseWindowMs > NUM.ZERO ?
      Math.floor(options.reuseWindowMs) :
      AUTHORITATIVE_DISCOVERY_REPAIR.REUSE_WINDOW_MS;
    if (!Number.isFinite(reuseWindowMs) || reuseWindowMs <= NUM.ZERO) {
      return null;
    }
    const effectiveNowMs = Number.isFinite(nowMs) ? nowMs : this.nowFn();
    if (effectiveNowMs - completedAtMs > reuseWindowMs) {
      return null;
    }
    if (!this.lastAuthoritativeDiscoveryRepairResult ||
        this.lastAuthoritativeDiscoveryRepairResult.applied !== true) {
      return null;
    }
    const requestedRepairTables = Array.isArray(options?.repairTables) ?
      options.repairTables :
      this.resolveAuthoritativeDiscoveryRepairTables(options);
    if (!this.lastAuthoritativeDiscoveryRepairCoversTables(
      requestedRepairTables,
    )) {
      return null;
    }
    return {
      ...this.lastAuthoritativeDiscoveryRepairResult,
      reused: true,
      skipped: false,
      reusedAtMs: effectiveNowMs,
    };
  }

  /**
   * Resolve one canonical authoritative repair table set for the
   * current repair trigger scope.
   * @param {Object} [options={}]
   * @return {string[]}
   */
  resolveAuthoritativeDiscoveryRepairTables(options = {}) {
    const scopedQuery =
      normalizeIdentifier(options.tableName) !== null ||
      normalizeDiscoveryTableId(options.tableId) !== null ||
      options.scopedQuery === true;
    return deriveAuthoritativeRepairTables({
      scopedQuery,
      triggerCodes: options.triggerCodes,
    });
  }

  /**
   * Return true when the last successful repair covered every requested
   * table in the current repair set.
   * @param {string[]} requestedRepairTables
   * @return {boolean}
   */
  lastAuthoritativeDiscoveryRepairCoversTables(
    requestedRepairTables = ADMIN_CACHE_DUMP.EMPTY,
  ) {
    if (!this.lastAuthoritativeDiscoveryRepairResult ||
        this.lastAuthoritativeDiscoveryRepairResult.applied !== true) {
      return false;
    }
    const repairedTables = new Set(
      Array.isArray(this.lastAuthoritativeDiscoveryRepairResult.tableNames) ?
        this.lastAuthoritativeDiscoveryRepairResult.tableNames :
        AUTHORITATIVE_DISCOVERY_REPAIR.TABLES,
    );
    const normalizedRequestedRepairTables =
      Array.isArray(requestedRepairTables) &&
        requestedRepairTables.length > NUM.ZERO ?
        requestedRepairTables :
        AUTHORITATIVE_DISCOVERY_REPAIR.TABLES;
    return normalizedRequestedRepairTables.every((tableName) =>
      repairedTables.has(tableName));
  }

  /**
   * Reconcile one cached system table with authoritative query
   * rows.
   * @param {string} tableName
   * @param {Array<Object>} rows
   * @param {string} causeId
   * @return {number}
   */
  async applyAuthoritativeSystemTableRows(tableName, rows, causeId) {
    const authoritativeRows = Array.isArray(rows) ?
      rows : ADMIN_CACHE_DUMP.EMPTY;
    const primaryKeyField =
      getSystemCachePrimaryKeyField(tableName);
    const cachedRows =
      this.systemTableCache.getAll(tableName);
    const result =
      await this.controlPlaneSystemTableGateway.reconcileAuthoritativeCacheRows(
        tableName,
        authoritativeRows,
        {
          causeId,
          primaryKeyField,
          cachedRows,
          cacheMutationTarget: this.cacheMutationTarget,
          systemTableCache: this.systemTableCache,
        },
      );
    return result?.mutationCount || NUM.ZERO;
  }

  /**
   * Build canonical query_result payload for service discovery
   * query.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async buildServiceDiscoveryQueryResult(options = {}) {
    const snapshot =
      await this.resolveServiceDiscoverySnapshot(options);
    return {
      success: true,
      rows: [snapshot],
      count: NUM.ONE,
      partitions: ADMIN_CACHE_DUMP.EMPTY,
      tableName: ADMIN_SERVICE_DISCOVERY.TABLE_NAME,
    };
  }
}

export {
  AdminServiceDiscovery,
  AUTHORITATIVE_DISCOVERY_REPAIR,
  parseDiscoveryBooleanQuery,
  parseDiscoveryListQuery,
  parseServiceDiscoverySqlQuery,
};
