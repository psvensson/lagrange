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
import {createSqlRequest} from '../query/sql-request.js';
import {EXECUTION_MODE} from '../query/sql-adapter-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {ControlPlaneSystemTableGateway} from
  '../control-plane/control-plane-system-table-gateway.js';
import {getRegisteredControlPlaneSystemTableGateway} from
  '../control-plane/control-plane-gateway-registry.js';
import {
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
  firstStringField,
  normalizeDiscoveryTableId,
  normalizeIdentifier,
  normalizeSchemaVersionValue,
  normalizeSql,
  uniqueSorted,
} from './admin-helpers.js';

// ── file-local constants ────────────────────────────────────────────────────
const EMPTY_STRING = '';
const LEADER_RAFT_ROLE = 'leader';
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR = ':';

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
   * @param {Object|null} deps.cdcIntegrationService
   * @param {Function|null} deps.partitionServicesProvider
   * @param {Map|null} deps.partitionServices
   * @param {Function} deps.buildPreflightCacheFreshnessSummary
   * @param {Function} deps.buildControlSnapshotReplicaOperationSummary
   * @param {Function} deps.executeSqlRequestWithTimeout
   */
  constructor(deps = {}) {
    this.systemTableCache = deps.systemTableCache || null;
    this.nodeId = deps.nodeId || null;
    this.logger = deps.logger || null;
    this.cacheMutationTarget = deps.cacheMutationTarget || null;
    this.cdcIntegrationService =
      deps.cdcIntegrationService || null;
    this.partitionServicesProvider =
      typeof deps.partitionServicesProvider === TYPEOF.FUNCTION ?
        deps.partitionServicesProvider :
        null;
    this.partitionServices =
      deps.partitionServices instanceof Map ?
        deps.partitionServices :
        null;
    this.sqlQueryEngine = deps.sqlQueryEngine || null;
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
    this.executeSqlRequestWithTimeout =
      typeof deps.executeSqlRequestWithTimeout === TYPEOF.FUNCTION ?
        deps.executeSqlRequestWithTimeout :
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
      options.allowAuthoritativeRepair !== false;
    const repairEvaluation =
      this.evaluateAuthoritativeDiscoveryRepair(
        snapshot,
        options,
      );
    if (!allowAuthoritativeRepair) {
      return snapshot;
    }
    if (repairEvaluation?.shouldRepair !== true) {
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
      this.cdcIntegrationService &&
      typeof this.cdcIntegrationService.executeAuthoritativeSystemTableRead ===
        TYPEOF.FUNCTION,
    );
  }

  /**
   * Return true when authoritative discovery repair can read canonical rows.
   * @return {boolean}
   */
  canReadAuthoritativeDiscoveryRows() {
    if (this.hasAuthoritativeDiscoveryReadOwner()) {
      return true;
    }
    const hasLocalSource =
      this.resolveLocalPartitionServices() instanceof Map;
    const hasSqlFallback =
      typeof this.executeSqlRequestWithTimeout ===
      TYPEOF.FUNCTION;
    return hasLocalSource || hasSqlFallback;
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
   * Resolve every local partition service that hosts one partition.
   * @param {Map<string, Object>|null} partitionServices
   * @param {string} partitionId
   * @return {Object[]}
   */
  resolveLocalPartitionServicesForPartition(
    partitionServices, partitionId,
  ) {
    if (!(partitionServices instanceof Map) || !partitionId) {
      return ADMIN_CACHE_DUMP.EMPTY;
    }

    const matches = [];
    const seenServices = new Set();
    const directMatch = partitionServices.get(partitionId) || null;
    if (directMatch && !seenServices.has(directMatch)) {
      matches.push(directMatch);
      seenServices.add(directMatch);
    }

    for (const partitionService of partitionServices.values()) {
      if (!partitionService ||
          partitionService.partitionId !== partitionId ||
          seenServices.has(partitionService)) {
        continue;
      }
      matches.push(partitionService);
      seenServices.add(partitionService);
    }

    return matches;
  }

  /**
   * Resolve cached system-table partition IDs for one table.
   * @param {string} tableName
   * @return {string[]}
   */
  resolveSystemTablePartitionIds(tableName) {
    if (!this.systemTableCache) {
      return ADMIN_CACHE_DUMP.EMPTY;
    }

    const partitionPredicate = (row) => {
      const rowTableName = firstStringField(
        row,
        COLUMN.TABLE_NAME,
        'table_name',
        'tableName',
      );
      const rowTableId = firstStringField(
        row,
        COLUMN.TABLE_ID,
        'table_id',
        'tableId',
      );
      return rowTableName === tableName || rowTableId === tableName;
    };
    const partitionRows =
      typeof this.systemTableCache.filter === TYPEOF.FUNCTION ?
        this.systemTableCache.filter(
          TABLES.PARTITIONS,
          partitionPredicate,
        ) :
        typeof this.systemTableCache.getAll === TYPEOF.FUNCTION ?
          (this.systemTableCache.getAll(TABLES.PARTITIONS) || [])
            .filter(partitionPredicate) :
          ADMIN_CACHE_DUMP.EMPTY;
    return [...new Set(partitionRows
      .map((row) =>
        firstStringField(
          row,
          COLUMN.PARTITION_ID,
          'partition_id',
          'partitionId',
          'id',
        ))
      .filter(Boolean))];
  }

  /**
   * Query authoritative rows from node-local partition replicas.
   * @param {string} tableName
   * @return {{available: boolean, rows: Object[]}}
   */
  queryLocalAuthoritativeSystemTableRows(tableName) {
    const partitionServices = this.resolveLocalPartitionServices();
    if (!(partitionServices instanceof Map)) {
      return {
        available: false,
        rows: ADMIN_CACHE_DUMP.EMPTY,
      };
    }

    const partitionIds =
      this.resolveSystemTablePartitionIds(tableName);
    if (partitionIds.length === NUM.ZERO) {
      return {
        available: false,
        rows: ADMIN_CACHE_DUMP.EMPTY,
      };
    }

    const sql = `SELECT * FROM ${tableName}`;
    const rowSets = [];
    let available = false;
    for (const partitionId of partitionIds) {
      const localServices =
        this.resolveLocalPartitionServicesForPartition(
          partitionServices,
          partitionId,
        );
      for (const partitionService of localServices) {
        if (partitionService?.initialized !== true ||
            typeof partitionService?.db?.prepare !== TYPEOF.FUNCTION) {
          continue;
        }
        try {
          const rows = partitionService.db.prepare(sql).all();
          rowSets.push(Array.isArray(rows) ? rows : ADMIN_CACHE_DUMP.EMPTY);
          available = true;
        } catch (error) {
          this.logger?.warn?.(
            'Failed to read authoritative discovery rows ' +
              'from local partition replica',
            {
              nodeId: this.nodeId,
              tableName,
              partitionId,
              replicaId:
                partitionService?.replicaId ||
                partitionService?.service_id ||
                null,
              error: error.message,
            },
          );
        }
      }
    }

    return {
      available,
      rows: available ?
        this.mergeAuthoritativeSystemTableRowSets(tableName, rowSets) :
        ADMIN_CACHE_DUMP.EMPTY,
    };
  }

  /**
   * Merge replicated authoritative row sets by primary key.
   * @param {string} tableName
   * @param {Object[][]} rowSets
   * @return {Object[]}
   */
  mergeAuthoritativeSystemTableRowSets(tableName, rowSets) {
    const keyField =
      getSystemCachePrimaryKeyField(tableName) || 'id';
    const mergedRows = new Map();

    for (const rowSet of rowSets) {
      const rows = Array.isArray(rowSet) ?
        rowSet :
        ADMIN_CACHE_DUMP.EMPTY;
      for (const row of rows) {
        const key = row?.[keyField] ?? row?.id;
        if (typeof key === TYPEOF.UNDEFINED ||
            key === null) {
          continue;
        }
        const existing = mergedRows.get(key);
        if (!existing ||
            this.isAuthoritativeRepairRowNewer(row, existing)) {
          mergedRows.set(key, row);
        }
      }
    }

    return [...mergedRows.values()];
  }

  /**
   * Prefer the fresher authoritative repair row.
   * @param {Object} candidate
   * @param {Object} existing
   * @return {boolean}
   */
  isAuthoritativeRepairRowNewer(candidate, existing) {
    const candidateVersion =
      extractSchemaVersionFromRecord(candidate);
    const existingVersion =
      extractSchemaVersionFromRecord(existing);
    if (candidateVersion && existingVersion) {
      return compareSchemaVersionValues(
        candidateVersion,
        existingVersion,
      ) > NUM.ZERO;
    }
    if (candidateVersion && !existingVersion) {
      return true;
    }
    if (!candidateVersion && existingVersion) {
      return false;
    }

    return JSON.stringify(candidate).length >
      JSON.stringify(existing).length;
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
    if (!this.hasAuthoritativeDiscoveryReadOwner()) {
      return null;
    }

    const now = options.nowMs || Date.now();
    const queryResult =
      await this.cdcIntegrationService.executeAuthoritativeSystemTableRead(
        tableName,
        `SELECT * FROM ${tableName}`,
        ADMIN_CACHE_DUMP.EMPTY,
        {
          queryOptions: {
            timeoutMs:
              AUTHORITATIVE_DISCOVERY_REPAIR.QUERY_TIMEOUT_MS,
            sessionId:
              `${String(options.reason || 'repair')}` +
              `:${tableName}:${now}`,
            routingReadinessDimension:
              CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
          },
        },
      );
    if (queryResult?.success === false) {
      throw new Error(
        queryResult.error ||
          'authoritative_query_failed',
      );
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
   * Prefers the injected CDC authoritative-read owner, then falls back to
   * direct local partition reads so control snapshots do not depend on the
   * hot routed SQL lane when the owner is unavailable.
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

    const localRows =
      this.queryLocalAuthoritativeSystemTableRows(tableName);
    if (localRows.available) {
      return {
        tableName,
        rows: localRows.rows,
      };
    }

    if (typeof this.executeSqlRequestWithTimeout !==
        TYPEOF.FUNCTION) {
      throw new Error('authoritative_row_source_unavailable');
    }

    const now = options.nowMs || Date.now();
    const queryResult =
      await this.executeSqlRequestWithTimeout(
        createSqlRequest({
          statement: `SELECT * FROM ${tableName}`,
          parameters: ADMIN_CACHE_DUMP.EMPTY,
          sessionId:
            `${String(options.reason || 'repair')}` +
            `:${tableName}:${now}`,
          executionMode:
            EXECUTION_MODE.SQL_STATEMENT,
        }),
        AUTHORITATIVE_DISCOVERY_REPAIR
          .QUERY_TIMEOUT_MS,
      );
    if (queryResult?.success === false) {
      throw new Error(
        queryResult.error ||
          'authoritative_query_failed',
      );
    }
    return {
      tableName,
      rows: Array.isArray(queryResult?.rows) ?
        queryResult.rows :
        ADMIN_CACHE_DUMP.EMPTY,
    };
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

    const partitionIds = new Set();
    for (const partitionRow of partitionRows) {
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
        partitionIds.add(partitionId);
        const rowSchemaVersion =
          extractSchemaVersionFromRecord(partitionRow);
        appliedSchemaVersion = selectNewestSchemaVersion(
          appliedSchemaVersion,
          rowSchemaVersion,
        );
      }
    }

    return {
      tableFound: partitionIds.size > NUM.ZERO,
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
   * @param {Array<Object>} serviceRows
   * @return {boolean}
   */
  resolveDiscoveryLeadershipStable(partitionIds, serviceRows) {
    if (!(partitionIds instanceof Set) ||
        partitionIds.size === NUM.ZERO) {
      return true;
    }

    const partitionsWithLeaders = new Set();
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
      partitionsWithLeaders.add(partitionId);
    }

    return partitionsWithLeaders.size === partitionIds.size;
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
    if (now - this.lastAuthoritativeDiscoveryRepairAtMs <
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
      const errors = [];
      for (const tableName of repairTableNames) {
        let result = null;
        try {
          result = await this.readAuthoritativeSystemTableRows(
            tableName,
            {
              nowMs: now,
              reason: options.reason || 'repair',
            },
          );
        } catch (error) {
          errors.push(String(
            error?.message ||
            error ||
            'unknown_error',
          ));
          continue;
        }
        repairedRowCount +=
          await this.applyAuthoritativeSystemTableRows(
            result.tableName,
            result.rows,
            causeId,
          );
        repairedTableCount += NUM.ONE;
      }

      const completedAtMs = this.nowFn();
      this.lastAuthoritativeDiscoveryRepairAtMs = completedAtMs;
      if (repairedTableCount > NUM.ZERO) {
        this.lastAuthoritativeDiscoveryRepairCompletedAtMs =
          completedAtMs;
        this.lastAuthoritativeDiscoveryRepairResult = {
          applied: true,
          skipped: false,
          tableCount: repairedTableCount,
          tableNames: [...repairTableNames],
          repairedRowCount,
          completedAtMs,
          reused: false,
        };
      } else {
        this.lastAuthoritativeDiscoveryRepairCompletedAtMs = NUM.ZERO;
        this.lastAuthoritativeDiscoveryRepairResult = null;
      }
      if (errors.length > NUM.ZERO) {
        this.logger.warn(
          'Authoritative discovery cache repair ' +
            'completed with errors', {
            nodeId: this.nodeId,
            reason: options.reason || null,
            tableName: options.tableName || null,
            tableId: options.tableId || null,
            repairTableNames,
            repairedTableCount,
            repairedRowCount,
            errorCount: errors.length,
            errors,
          },
        );
      } else {
        this.logger.info(
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

      return this.lastAuthoritativeDiscoveryRepairResult || {
        applied: false,
        skipped: false,
        tableCount: repairedTableCount,
      };
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
