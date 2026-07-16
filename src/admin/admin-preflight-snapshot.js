/**
 * Preflight critical path snapshot building for the admin WebSocket API.
 *
 * This module owns all preflight critical-path diagnostics: node address
 * resolution, router connectivity, control-plane partition health, CDC
 * health, cache freshness, row counts, and discovery summary. The parent
 * AdminWebSocketAPI instantiates one AdminPreflightSnapshot and delegates
 * all preflight-related calls to it.
 *
 * Single-use helpers that exist only for preflight logic live here
 * as module-private functions. Shared helpers are imported from
 * admin-helpers.js.
 */

import {
  COLUMN,
  TABLES,
} from '../constants/index.js';
import {CONNECTION_STATE} from '../constants/transport.js';
import {INITIAL_PARTITION_IDS} from
  '../bootstrap/system-table-schemas-constants.js';
import {META_SERVICE_ID} from '../constants/wasm-meta.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_DEFAULT,
  ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT,
} from './admin-constants.js';
import {evaluateAuthoritativeRepairPolicy} from
  './admin-authoritative-repair-policy.js';
import {AUTHORITATIVE_DISCOVERY_REPAIR} from './admin-service-discovery.js';
import {
  firstStringField,
  normalizeSchemaVersionValue,
  uniqueSorted,
} from './admin-helpers.js';
import {evaluatePartitionReplicaTopology} from
  './admin-shared-metadata-consistency.js';

// ── file-local constants ────────────────────────────────────────────────────
const EMPTY_STRING = '';
const PREFLIGHT_AUTHORITATIVE_REPAIR_WAIT_BUDGET_MS = 1000;
const PREFLIGHT_ERROR_CODE = Object.freeze({
  PARTITION_ID_UNKNOWN: 'partition_id_unknown',
  CACHE_UNAVAILABLE: 'cache_unavailable',
  PARTITION_ROW_MISSING: 'partition_row_missing',
  LEADER_SERVICE_MISSING: 'leader_service_missing',
  LEADER_NODE_ID_MISSING: 'leader_node_id_missing',
});
const PREFLIGHT_REPAIR_REASON = 'preflight_critical_path_snapshot';
const PREFLIGHT_CACHE_FRESHNESS_SOURCE = Object.freeze({
  AUTHORITATIVE_OBSERVATION: 'authoritative_observation',
  MUTATION: 'mutation',
});

function readCacheTableEvidence(cache, methodName, tableName) {
  if (typeof cache?.[methodName] !== 'function') {
    return null;
  }
  return cache[methodName](tableName);
}

function normalizeCacheEvidenceAtMs(value) {
  if (value === null || typeof value === 'undefined') {
    return null;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.floor(numericValue) : null;
}

function buildCacheCauseIdSnapshot(cache, tableNames, methodName) {
  const causesByTableName = {};
  for (const tableName of tableNames) {
    causesByTableName[tableName] = readCacheTableEvidence(
      cache,
      methodName,
      tableName,
    );
  }
  return causesByTableName;
}

function selectNewestCacheFreshnessEvidence(
  lastAppliedAtMs,
  lastAuthoritativeObservedAtMs,
) {
  if (
    Number.isFinite(lastAuthoritativeObservedAtMs) &&
    (!Number.isFinite(lastAppliedAtMs) ||
      lastAuthoritativeObservedAtMs >= lastAppliedAtMs)
  ) {
    return {
      observedAtMs: lastAuthoritativeObservedAtMs,
      source: PREFLIGHT_CACHE_FRESHNESS_SOURCE.AUTHORITATIVE_OBSERVATION,
    };
  }
  if (Number.isFinite(lastAppliedAtMs)) {
    return {
      observedAtMs: lastAppliedAtMs,
      source: PREFLIGHT_CACHE_FRESHNESS_SOURCE.MUTATION,
    };
  }
  return {observedAtMs: null, source: null};
}

function calculateCacheStalenessMs(capturedAtMs, observedAtMs) {
  if (!Number.isFinite(capturedAtMs) || !Number.isFinite(observedAtMs)) {
    return null;
  }
  return Math.max(0, Math.floor(capturedAtMs - observedAtMs));
}

// ── AdminPreflightSnapshot class ────────────────────────────────────────────

/**
 * Preflight critical path snapshot builder.
 *
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (service discovery snapshot, authoritative repair)
 * are injected as functions so this module has no back-reference to
 * AdminWebSocketAPI.
 */
class AdminPreflightSnapshot {
  /**
   * @param {Object} deps
   * @param {Object} deps.systemTableCache
   * @param {string} deps.nodeId
   * @param {Object|null} deps.messageRouter
   * @param {Object|null} deps.cacheMutationTarget
   * @param {Object|null} deps.sqlQueryEngine
   * @param {Function|null} deps.buildLocalServiceDiscoverySnapshot
   * @param {Function|null} deps.ensureAuthoritativeDiscoveryCacheRepair
   * @param {Function|null} deps.buildControlPlaneDiagnosticsSnapshot
   */
  constructor(deps = {}) {
    this.systemTableCache = deps.systemTableCache || null;
    this.nodeId = deps.nodeId || null;
    this.messageRouter = deps.messageRouter || null;
    this.cacheMutationTarget = deps.cacheMutationTarget || null;
    this.sqlQueryEngine = deps.sqlQueryEngine || null;
    this.buildLocalServiceDiscoverySnapshot =
      typeof deps.buildLocalServiceDiscoverySnapshot === 'function' ?
        deps.buildLocalServiceDiscoverySnapshot :
        null;
    this.ensureAuthoritativeDiscoveryCacheRepair =
      typeof deps.ensureAuthoritativeDiscoveryCacheRepair === 'function' ?
        deps.ensureAuthoritativeDiscoveryCacheRepair :
        null;
    this.buildControlPlaneDiagnosticsSnapshot =
      typeof deps.buildControlPlaneDiagnosticsSnapshot === 'function' ?
        deps.buildControlPlaneDiagnosticsSnapshot :
        null;
    this.authoritativeRepairWaitBudgetMs =
      Number.isFinite(deps.authoritativeRepairWaitBudgetMs) &&
      deps.authoritativeRepairWaitBudgetMs > 0 ?
        Math.floor(deps.authoritativeRepairWaitBudgetMs) :
        PREFLIGHT_AUTHORITATIVE_REPAIR_WAIT_BUDGET_MS;
  }

  /**
   * Build bounded preflight critical-path snapshot from node-local
   * diagnostics.
   * @return {Object}
   */
  async buildLocalPreflightCriticalPathSnapshot() {
    const capturedAtMs = Date.now();
    const nodeAddress = this.resolvePreflightSnapshotNodeAddress();
    const routerConnectivity =
      this.buildPreflightRouterConnectivitySummary();
    const controlPlanePartitions =
      this.buildPreflightControlPlanePartitionsSummary();
    const cdcHealth = this.buildPreflightCdcHealthSummary();
    const cacheFreshness = this.buildPreflightCacheFreshnessSummary({
      capturedAtMs,
    });
    const rowCounts = this.buildPreflightRowCountsSummary();
    const discovery = this.buildPreflightDiscoverySummary();
    const controlPlaneDiagnostics =
      await this.resolveControlPlaneDiagnosticsSnapshot();

    return {
      schemaVersion:
        ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT.SCHEMA_VERSION,
      capturedAtMs,
      nodeId: this.nodeId,
      address: nodeAddress,
      routerConnectivity,
      controlPlanePartitions,
      cdcHealth,
      cacheFreshness,
      rowCounts,
      discovery,
      controlPlaneDiagnostics,
    };
  }

  /**
   * Resolve local preflight critical-path snapshot with bounded
   * authoritative repair.
   * @return {Promise<Object>}
   */
  async resolvePreflightCriticalPathSnapshot() {
    const snapshot = await this.buildLocalPreflightCriticalPathSnapshot();
    const repairEvaluation =
      this.evaluateAuthoritativePreflightRepair(snapshot);
    if (repairEvaluation?.shouldRepair !== true) {
      return snapshot;
    }
    if (!this.ensureAuthoritativeDiscoveryCacheRepair) {
      return snapshot;
    }
    const repair = await this.awaitAuthoritativeRepairWithinBudget(
      this.ensureAuthoritativeDiscoveryCacheRepair({
        reason: PREFLIGHT_REPAIR_REASON,
        triggerCodes: repairEvaluation.triggerCodes,
      }),
    );
    if (repair.applied !== true) {
      return snapshot;
    }
    return this.buildLocalPreflightCriticalPathSnapshot();
  }

  /**
   * Resolve canonical control-plane diagnostics for preflight snapshots.
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveControlPlaneDiagnosticsSnapshot() {
    if (!this.buildControlPlaneDiagnosticsSnapshot) {
      return null;
    }
    try {
      const diagnostics =
        await this.buildControlPlaneDiagnosticsSnapshot();
      return diagnostics && typeof diagnostics === 'object' ?
        diagnostics :
        null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Wait for authoritative repair only within the preflight budget.
   * Preflight diagnostics must not block on expensive cache repair.
   * @param {Promise<Object>} repairPromise
   * @return {Promise<Object>}
   * @private
   */
  async awaitAuthoritativeRepairWithinBudget(repairPromise) {
    const waitBudgetMs = this.authoritativeRepairWaitBudgetMs;
    const wrappedRepairPromise = Promise.resolve(repairPromise)
      .then((repair) => ({
        kind: 'repair',
        repair,
      }))
      .catch(() => ({
        kind: 'repair',
        repair: {
          applied: false,
          skipped: true,
          tableCount: 0,
        },
      }));
    const timeoutResult = {
      kind: 'timeout',
      repair: {
        applied: false,
        skipped: true,
        tableCount: 0,
      },
    };

    if (!Number.isFinite(waitBudgetMs) || waitBudgetMs <= 0) {
      const result = await wrappedRepairPromise;
      return result.repair;
    }

    let timeoutHandle = null;
    try {
      const timeoutPromise = new Promise((resolve) => {
        timeoutHandle = setTimeout(
          () => resolve(timeoutResult),
          waitBudgetMs,
        );
      });
      const result = await Promise.race([
        wrappedRepairPromise,
        timeoutPromise,
      ]);
      return result.repair;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * Determine whether preflight snapshot warrants authoritative cache
   * repair.
   * @param {Object} snapshot
   * @return {boolean}
   */
  shouldAttemptAuthoritativePreflightRepair(snapshot) {
    return this.evaluateAuthoritativePreflightRepair(snapshot)
      ?.shouldRepair === true;
  }

  /**
   * Determine whether preflight snapshot warrants authoritative cache
   * repair.
   * @param {Object} snapshot
   * @return {Object|null}
   */
  evaluateAuthoritativePreflightRepair(snapshot) {
    if (!this.systemTableCache ||
        !this.cacheMutationTarget ||
        typeof this.cacheMutationTarget.applySystemTableChange !==
          'function' ||
        !this.sqlQueryEngine ||
        typeof this.sqlQueryEngine.executeRequest !==
          'function') {
      return null;
    }
    const selectedNodeIds =
      Array.isArray(snapshot?.discovery?.selectedNodeIds) ?
        snapshot.discovery.selectedNodeIds :
        ADMIN_CACHE_DUMP.EMPTY;
    const serviceEndpointsCount =
      Number(snapshot?.rowCounts?.serviceEndpointsCount);
    const stalenessMs = Number(snapshot?.cacheFreshness?.stalenessMs);
    const evaluation = evaluateAuthoritativeRepairPolicy({
      cacheStalenessMs: stalenessMs,
      staleThresholdMs: AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS,
      selectedNodeCount: selectedNodeIds.length,
      serviceEndpointsCount,
    });
    return evaluation;
  }

  /**
   * Resolve best-effort node address for preflight snapshots.
   * @return {string}
   */
  resolvePreflightSnapshotNodeAddress() {
    const routerAddress =
      typeof this.messageRouter?.nodeAddress === 'string' ?
        this.messageRouter.nodeAddress :
        null;
    if (routerAddress) {
      return routerAddress;
    }

    if (this.systemTableCache &&
        typeof this.systemTableCache.getAll === 'function') {
      const nodes = this.systemTableCache.getAll(TABLES.NODES);
      const localRow = nodes.find((row) =>
        firstStringField(row, COLUMN.NODE_ID, 'id') === this.nodeId,
      );
      const address = firstStringField(
        localRow, COLUMN.NODE_ADDRESS, 'address',
      );
      if (address) {
        return address;
      }
    }

    return this.nodeId || ADMIN_DEFAULT.NODE_ID;
  }

  /**
   * Summarize message-router connectivity by coarse state buckets.
   * @return {Object}
   */
  buildPreflightRouterConnectivitySummary() {
    const defaultSummary = {
      connectedCount: 0,
      reconnectingCount: 0,
      disconnectedCount: 0,
    };
    if (!this.messageRouter ||
        typeof this.messageRouter.getStats !== 'function') {
      return defaultSummary;
    }

    const stats = this.messageRouter.getStats();
    const connections =
      stats?.connections &&
      typeof stats.connections === 'object' ?
        stats.connections :
        {};
    let connectedCount = 0;
    let reconnectingCount = 0;
    let disconnectedCount = 0;
    for (const [nodeId, info] of Object.entries(connections)) {
      if (!nodeId || nodeId === this.nodeId) {
        continue;
      }
      const state = String(info?.state || EMPTY_STRING)
        .trim()
        .toLowerCase();
      if (state === CONNECTION_STATE.CONNECTED) {
        connectedCount += 1;
      } else if (state === CONNECTION_STATE.RECONNECTING) {
        reconnectingCount += 1;
      } else {
        disconnectedCount += 1;
      }
    }
    return {
      connectedCount,
      reconnectingCount,
      disconnectedCount,
    };
  }

  /**
   * Summarize leadership/health for control-plane partitions required
   * for discovery.
   * @return {Object}
   */
  buildPreflightControlPlanePartitionsSummary() {
    const partitionTables = [
      TABLES.NODES,
      TABLES.SERVICES,
      TABLES.NODE_ENDPOINTS,
      TABLES.SERVICE_ENDPOINTS,
    ];
    const summary = {};
    for (const tableName of partitionTables) {
      summary[tableName] =
        this.buildPreflightControlPlanePartitionEntry(tableName);
    }
    return summary;
  }

  /**
   * Build a single control-plane partition entry.
   * @param {string} tableName
   * @return {Object}
   */
  buildPreflightControlPlanePartitionEntry(tableName) {
    const partitionId = INITIAL_PARTITION_IDS[tableName] || null;
    if (!partitionId) {
      return {
        leaderKnown: false,
        leaderNodeId: null,
        isLeaderLocal: false,
        lastErrorCode: PREFLIGHT_ERROR_CODE.PARTITION_ID_UNKNOWN,
      };
    }

    if (!this.systemTableCache ||
        typeof this.systemTableCache.getAll !== 'function') {
      return {
        leaderKnown: false,
        leaderNodeId: null,
        isLeaderLocal: false,
        lastErrorCode: PREFLIGHT_ERROR_CODE.CACHE_UNAVAILABLE,
      };
    }

    const partitionRows =
      this.systemTableCache.getAll(TABLES.PARTITIONS);
    const partitionRow = partitionRows.find((row) =>
      row?.[COLUMN.PARTITION_ID] === partitionId,
    );
    if (!partitionRow) {
      return {
        leaderKnown: false,
        leaderNodeId: null,
        isLeaderLocal: false,
        lastErrorCode: PREFLIGHT_ERROR_CODE.PARTITION_ROW_MISSING,
      };
    }

    const serviceRows =
      this.systemTableCache.getAll(TABLES.SERVICES);
    const requiresAddress = tableName !== TABLES.SERVICES;
    const canonicalLeaderNodeId = firstStringField(
      partitionRow,
      COLUMN.LEADER_NODE_ID,
      'leader_node_id',
      'leaderNodeId',
    );
    const partitionTopology = evaluatePartitionReplicaTopology({
      partitionRow,
      serviceRows,
      requiresAddress,
      requireLeaderNodeId: false,
    });
    if (partitionTopology.leaderKnown !== true) {
      return {
        leaderKnown: false,
        leaderNodeId: null,
        isLeaderLocal: false,
        lastErrorCode: PREFLIGHT_ERROR_CODE.LEADER_SERVICE_MISSING,
      };
    }

    const leaderNodeId = canonicalLeaderNodeId ||
      partitionTopology.leaderRoleNodeIds[0] ||
      null;
    if (!leaderNodeId) {
      return {
        leaderKnown: false,
        leaderNodeId: null,
        isLeaderLocal: false,
        lastErrorCode: PREFLIGHT_ERROR_CODE.LEADER_NODE_ID_MISSING,
      };
    }

    return {
      leaderKnown: true,
      leaderNodeId,
      isLeaderLocal: leaderNodeId === this.nodeId,
      lastErrorCode: null,
    };
  }

  /**
   * Summarize CDC/mutation pipeline health.
   * @return {Object}
   */
  buildPreflightCdcHealthSummary() {
    let bufferDepth = 0;
    let retryCount = 0;
    if (this.messageRouter &&
        typeof this.messageRouter.getStats === 'function') {
      const stats = this.messageRouter.getStats();
      const outboundQueues =
        stats?.outboundQueues &&
        typeof stats.outboundQueues === 'object' ?
          stats.outboundQueues :
          {};
      for (const queue of Object.values(outboundQueues)) {
        bufferDepth += Number(queue?.pending || 0);
      }
      const connections =
        stats?.connections &&
        typeof stats.connections === 'object' ?
          stats.connections :
          {};
      for (const conn of Object.values(connections)) {
        retryCount += Number(conn?.reconnectAttempts || 0);
      }
    }
    return {
      bufferDepth: Number.isFinite(bufferDepth) ?
        Math.max(0, Math.floor(bufferDepth)) :
        0,
      retryCount: Number.isFinite(retryCount) ?
        Math.max(0, Math.floor(retryCount)) :
        0,
      lastErrorCode: null,
      lastForwardAttemptAtMs: null,
    };
  }

  /**
   * Summarize cache freshness/watermark relevant to readiness.
   * @param {Object} options
   * @param {number} options.capturedAtMs
   * @return {Object}
   */
  buildPreflightCacheFreshnessSummary(options) {
    const capturedAtMs = Number(options?.capturedAtMs);
    const lastAppliedAtMs = normalizeCacheEvidenceAtMs(
      readCacheTableEvidence(
        this.systemTableCache,
        'getLastAppliedAtMs',
        TABLES.SERVICE_ENDPOINTS,
      ),
    );
    const lastAuthoritativeObservedAtMs = normalizeCacheEvidenceAtMs(
      readCacheTableEvidence(
        this.systemTableCache,
        'getLastAuthoritativeObservedAtMs',
        TABLES.SERVICE_ENDPOINTS,
      ),
    );
    const tableNames = [
      TABLES.SERVICES,
      TABLES.NODE_ENDPOINTS,
      TABLES.SERVICE_ENDPOINTS,
    ];
    const lastAppliedCauseIdByTableName = buildCacheCauseIdSnapshot(
      this.systemTableCache,
      tableNames,
      'getLastAppliedCauseId',
    );
    const lastAuthoritativeObservedCauseIdByTableName =
      buildCacheCauseIdSnapshot(
        this.systemTableCache,
        tableNames,
        'getLastAuthoritativeObservedCauseId',
      );
    const appliedSchemaVersion = normalizeSchemaVersionValue(
      readCacheTableEvidence(
        this.systemTableCache,
        'getAppliedSchemaVersion',
        TABLES.SERVICE_ENDPOINTS,
      ),
    );
    const freshness = selectNewestCacheFreshnessEvidence(
      lastAppliedAtMs,
      lastAuthoritativeObservedAtMs,
    );
    const stalenessMs = calculateCacheStalenessMs(
      capturedAtMs,
      freshness.observedAtMs,
    );
    return {
      lastAppliedAtMs,
      lastAuthoritativeObservedAtMs,
      freshnessObservedAtMs: freshness.observedAtMs,
      freshnessSource: freshness.source,
      appliedSchemaVersion,
      stalenessMs,
      lastAppliedCauseIdByTableName,
      lastAuthoritativeObservedCauseIdByTableName,
    };
  }

  /**
   * Summarize control-plane row counts relevant to readiness.
   * @return {Object}
   */
  buildPreflightRowCountsSummary() {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.getAll !== 'function') {
      return {
        sysPostgresWireServiceCount: 0,
        nodeEndpointsCount: 0,
        serviceEndpointsCount: 0,
      };
    }

    const serviceDefinitionRows =
      this.systemTableCache.getAll(TABLES.SERVICE_DEFINITIONS);
    const sysPostgresWireServiceCount =
      serviceDefinitionRows.filter((row) =>
        row?.[COLUMN.SERVICE_ID] === META_SERVICE_ID.POSTGRES_WIRE,
      ).length;

    const nodeEndpointsCount =
      typeof this.systemTableCache.count === 'function' ?
        this.systemTableCache.count(TABLES.NODE_ENDPOINTS) :
        this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS).length;
    const serviceEndpointsCount =
      typeof this.systemTableCache.count === 'function' ?
        this.systemTableCache.count(TABLES.SERVICE_ENDPOINTS) :
        this.systemTableCache.getAll(
          TABLES.SERVICE_ENDPOINTS,
        ).length;

    return {
      sysPostgresWireServiceCount,
      nodeEndpointsCount,
      serviceEndpointsCount,
    };
  }

  /**
   * Summarize strict discovery selection/exclusion from local service
   * discovery state.
   * @return {Object}
   */
  buildPreflightDiscoverySummary() {
    const emptySummary = this.buildEmptyPreflightDiscoverySummary();
    try {
      if (!this.buildLocalServiceDiscoverySnapshot) {
        return emptySummary;
      }
      const snapshot = this.buildLocalServiceDiscoverySnapshot({
        serviceIdAllowlist: [META_SERVICE_ID.POSTGRES_WIRE],
      });
      return this.buildPreflightDiscoverySummaryFromSnapshot(snapshot);
    } catch (_error) {
      return emptySummary;
    }
  }

  /**
   * @return {Object}
   * @private
   */
  buildEmptyPreflightDiscoverySummary() {
    return {
      selectedNodeIds: ADMIN_CACHE_DUMP.EMPTY,
      excludedByNodeId: {},
    };
  }

  /**
   * @param {Object} snapshot
   * @return {Object}
   * @private
   */
  buildPreflightDiscoverySummaryFromSnapshot(snapshot) {
    const summary = {
      selectedNodeIds: [],
      excludedByNodeId: {},
    };
    const services = Array.isArray(snapshot?.services) ?
      snapshot.services :
      ADMIN_CACHE_DUMP.EMPTY;

    for (const service of services) {
      const replicas = Array.isArray(service?.replicas) ?
        service.replicas :
        ADMIN_CACHE_DUMP.EMPTY;
      for (const replica of replicas) {
        this.appendPreflightDiscoveryReplicaSummary(summary, replica);
      }
    }

    return {
      selectedNodeIds: uniqueSorted(summary.selectedNodeIds),
      excludedByNodeId: summary.excludedByNodeId,
    };
  }

  /**
   * @param {Object} summary
   * @param {Object} replica
   * @private
   */
  appendPreflightDiscoveryReplicaSummary(summary, replica) {
    const nodeId = typeof replica?.nodeId === 'string' ?
      replica.nodeId :
      null;
    if (!nodeId) {
      return;
    }

    const reasonCodes = this.resolvePreflightDiscoveryReasonCodes(replica);
    if (reasonCodes.length === 0) {
      summary.selectedNodeIds.push(nodeId);
      return;
    }
    summary.excludedByNodeId[nodeId] = reasonCodes;
  }

  /**
   * @param {Object} replica
   * @return {Array<string>}
   * @private
   */
  resolvePreflightDiscoveryReasonCodes(replica) {
    const readiness = replica?.readiness && typeof replica.readiness === 'object' ?
      replica.readiness :
      null;
    const reasons = Array.isArray(readiness?.reasons) ?
      readiness.reasons :
      ADMIN_CACHE_DUMP.EMPTY;
    return uniqueSorted(reasons
      .map((reason) => String(reason?.code || EMPTY_STRING))
      .filter(Boolean));
  }

  /**
   * Build canonical query_result payload for preflight critical-path
   * snapshot query.
   * @return {Promise<Object>}
   */
  async buildPreflightCriticalPathSnapshotQueryResult() {
    const snapshot = await this.resolvePreflightCriticalPathSnapshot();
    return {
      success: true,
      rows: [snapshot],
      count: 1,
      partitions: ADMIN_CACHE_DUMP.EMPTY,
      tableName:
        ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT.TABLE_NAME,
    };
  }
}

export {AdminPreflightSnapshot};
