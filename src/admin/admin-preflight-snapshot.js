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
  NUM,
  TABLES,
  TYPEOF,
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
import {AUTHORITATIVE_DISCOVERY_REPAIR} from './admin-service-discovery.js';
import {
  firstStringField,
  normalizeSchemaVersionValue,
  uniqueSorted,
} from './admin-helpers.js';

// ── file-local constants ────────────────────────────────────────────────────
const EMPTY_STRING = '';
const LEADER_RAFT_ROLE = 'leader';
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const PREFLIGHT_ERROR_CODE = Object.freeze({
  PARTITION_ID_UNKNOWN: 'partition_id_unknown',
  CACHE_UNAVAILABLE: 'cache_unavailable',
  PARTITION_ROW_MISSING: 'partition_row_missing',
  LEADER_SERVICE_MISSING: 'leader_service_missing',
  LEADER_NODE_ID_MISSING: 'leader_node_id_missing',
});
const PREFLIGHT_REPAIR_REASON = 'preflight_critical_path_snapshot';

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
   */
  constructor(deps = {}) {
    this.systemTableCache = deps.systemTableCache || null;
    this.nodeId = deps.nodeId || null;
    this.messageRouter = deps.messageRouter || null;
    this.cacheMutationTarget = deps.cacheMutationTarget || null;
    this.sqlQueryEngine = deps.sqlQueryEngine || null;
    this.buildLocalServiceDiscoverySnapshot =
      typeof deps.buildLocalServiceDiscoverySnapshot === TYPEOF.FUNCTION ?
        deps.buildLocalServiceDiscoverySnapshot :
        null;
    this.ensureAuthoritativeDiscoveryCacheRepair =
      typeof deps.ensureAuthoritativeDiscoveryCacheRepair === TYPEOF.FUNCTION ?
        deps.ensureAuthoritativeDiscoveryCacheRepair :
        null;
  }

  /**
   * Build bounded preflight critical-path snapshot from node-local
   * diagnostics.
   * @return {Object}
   */
  buildLocalPreflightCriticalPathSnapshot() {
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
    };
  }

  /**
   * Resolve local preflight critical-path snapshot with bounded
   * authoritative repair.
   * @return {Promise<Object>}
   */
  async resolvePreflightCriticalPathSnapshot() {
    const snapshot = this.buildLocalPreflightCriticalPathSnapshot();
    if (!this.shouldAttemptAuthoritativePreflightRepair(snapshot)) {
      return snapshot;
    }
    if (!this.ensureAuthoritativeDiscoveryCacheRepair) {
      return snapshot;
    }
    const repair = await this.ensureAuthoritativeDiscoveryCacheRepair({
      reason: PREFLIGHT_REPAIR_REASON,
    });
    if (repair.applied !== true) {
      return snapshot;
    }
    return this.buildLocalPreflightCriticalPathSnapshot();
  }

  /**
   * Determine whether preflight snapshot warrants authoritative cache
   * repair.
   * @param {Object} snapshot
   * @return {boolean}
   */
  shouldAttemptAuthoritativePreflightRepair(snapshot) {
    if (!this.systemTableCache ||
        !this.cacheMutationTarget ||
        typeof this.cacheMutationTarget.applySystemTableChange !==
          TYPEOF.FUNCTION ||
        !this.sqlQueryEngine ||
        typeof this.sqlQueryEngine.executeRequest !==
          TYPEOF.FUNCTION) {
      return false;
    }
    const stalenessMs = Number(snapshot?.cacheFreshness?.stalenessMs);
    if (Number.isFinite(stalenessMs) &&
        stalenessMs >=
          AUTHORITATIVE_DISCOVERY_REPAIR.STALE_THRESHOLD_MS) {
      return true;
    }
    const selectedNodeIds =
      Array.isArray(snapshot?.discovery?.selectedNodeIds) ?
        snapshot.discovery.selectedNodeIds :
        ADMIN_CACHE_DUMP.EMPTY;
    const serviceEndpointsCount =
      Number(snapshot?.rowCounts?.serviceEndpointsCount);
    if (selectedNodeIds.length === NUM.ZERO &&
        Number.isFinite(serviceEndpointsCount) &&
        Math.floor(serviceEndpointsCount) > NUM.ZERO) {
      return true;
    }
    return false;
  }

  /**
   * Resolve best-effort node address for preflight snapshots.
   * @return {string}
   */
  resolvePreflightSnapshotNodeAddress() {
    const routerAddress =
      typeof this.messageRouter?.nodeAddress === TYPEOF.STRING ?
        this.messageRouter.nodeAddress :
        null;
    if (routerAddress) {
      return routerAddress;
    }

    if (this.systemTableCache &&
        typeof this.systemTableCache.getAll === TYPEOF.FUNCTION) {
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
      connectedCount: NUM.ZERO,
      reconnectingCount: NUM.ZERO,
      disconnectedCount: NUM.ZERO,
    };
    if (!this.messageRouter ||
        typeof this.messageRouter.getStats !== TYPEOF.FUNCTION) {
      return defaultSummary;
    }

    const stats = this.messageRouter.getStats();
    const connections =
      stats?.connections &&
      typeof stats.connections === TYPEOF.OBJECT ?
        stats.connections :
        {};
    let connectedCount = NUM.ZERO;
    let reconnectingCount = NUM.ZERO;
    let disconnectedCount = NUM.ZERO;
    for (const [nodeId, info] of Object.entries(connections)) {
      if (!nodeId || nodeId === this.nodeId) {
        continue;
      }
      const state = String(info?.state || EMPTY_STRING)
        .trim()
        .toLowerCase();
      if (state === CONNECTION_STATE.CONNECTED) {
        connectedCount += NUM.ONE;
      } else if (state === CONNECTION_STATE.RECONNECTING) {
        reconnectingCount += NUM.ONE;
      } else {
        disconnectedCount += NUM.ONE;
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
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
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
    const leaderService = serviceRows.find((service) => {
      if (service?.[COLUMN.SERVICE_TYPE] !==
          SERVICE_TYPE_PARTITION) {
        return false;
      }
      if (service?.[COLUMN.PARTITION_ID] !== partitionId) {
        return false;
      }
      if (String(service?.[COLUMN.RAFT_ROLE] || EMPTY_STRING)
        .toLowerCase() !== LEADER_RAFT_ROLE) {
        return false;
      }
      if (String(service?.[COLUMN.STATUS] || EMPTY_STRING)
        .toLowerCase() !== STATUS_ACTIVE) {
        return false;
      }
      if (requiresAddress && !service?.[COLUMN.ADDRESS]) {
        return false;
      }
      return true;
    });
    if (!leaderService) {
      return {
        leaderKnown: false,
        leaderNodeId: null,
        isLeaderLocal: false,
        lastErrorCode: PREFLIGHT_ERROR_CODE.LEADER_SERVICE_MISSING,
      };
    }

    const leaderNodeId = firstStringField(
      partitionRow,
      COLUMN.LEADER_NODE_ID,
    ) ||
      firstStringField(
        leaderService, COLUMN.NODE_ID, 'nodeId',
      );
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
    let bufferDepth = NUM.ZERO;
    let retryCount = NUM.ZERO;
    if (this.messageRouter &&
        typeof this.messageRouter.getStats === TYPEOF.FUNCTION) {
      const stats = this.messageRouter.getStats();
      const outboundQueues =
        stats?.outboundQueues &&
        typeof stats.outboundQueues === TYPEOF.OBJECT ?
          stats.outboundQueues :
          {};
      for (const queue of Object.values(outboundQueues)) {
        bufferDepth += Number(queue?.pending || NUM.ZERO);
      }
      const connections =
        stats?.connections &&
        typeof stats.connections === TYPEOF.OBJECT ?
          stats.connections :
          {};
      for (const conn of Object.values(connections)) {
        retryCount += Number(conn?.reconnectAttempts || NUM.ZERO);
      }
    }
    return {
      bufferDepth: Number.isFinite(bufferDepth) ?
        Math.max(NUM.ZERO, Math.floor(bufferDepth)) :
        NUM.ZERO,
      retryCount: Number.isFinite(retryCount) ?
        Math.max(NUM.ZERO, Math.floor(retryCount)) :
        NUM.ZERO,
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
    const lastAppliedAtMs =
      typeof this.systemTableCache?.getLastAppliedAtMs ===
        TYPEOF.FUNCTION ?
        this.systemTableCache.getLastAppliedAtMs(
          TABLES.SERVICE_ENDPOINTS,
        ) :
        null;
    const tableNames = [
      TABLES.SERVICES,
      TABLES.NODE_ENDPOINTS,
      TABLES.SERVICE_ENDPOINTS,
    ];
    const lastAppliedCauseIdByTableName = {};
    for (const tableName of tableNames) {
      lastAppliedCauseIdByTableName[tableName] =
        typeof this.systemTableCache?.getLastAppliedCauseId ===
          TYPEOF.FUNCTION ?
          this.systemTableCache.getLastAppliedCauseId(tableName) :
          null;
    }
    const appliedSchemaVersion =
      typeof this.systemTableCache?.getAppliedSchemaVersion ===
        TYPEOF.FUNCTION ?
        normalizeSchemaVersionValue(
          this.systemTableCache.getAppliedSchemaVersion(
            TABLES.SERVICE_ENDPOINTS,
          ),
        ) :
        null;
    const numericLastAppliedAtMs = Number(lastAppliedAtMs);
    const hasNumericLastAppliedAtMs =
      lastAppliedAtMs !== null &&
      typeof lastAppliedAtMs !== TYPEOF.UNDEFINED &&
      Number.isFinite(numericLastAppliedAtMs);
    const stalenessMs = Number.isFinite(capturedAtMs) &&
      hasNumericLastAppliedAtMs ?
      Math.max(
        NUM.ZERO,
        Math.floor(capturedAtMs - numericLastAppliedAtMs),
      ) :
      null;
    return {
      lastAppliedAtMs: hasNumericLastAppliedAtMs ?
        Math.floor(numericLastAppliedAtMs) :
        null,
      appliedSchemaVersion,
      stalenessMs,
      lastAppliedCauseIdByTableName,
    };
  }

  /**
   * Summarize control-plane row counts relevant to readiness.
   * @return {Object}
   */
  buildPreflightRowCountsSummary() {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return {
        sysPostgresWireServiceCount: NUM.ZERO,
        nodeEndpointsCount: NUM.ZERO,
        serviceEndpointsCount: NUM.ZERO,
      };
    }

    const serviceDefinitionRows =
      this.systemTableCache.getAll(TABLES.SERVICE_DEFINITIONS);
    const sysPostgresWireServiceCount =
      serviceDefinitionRows.filter((row) =>
        row?.[COLUMN.SERVICE_ID] === META_SERVICE_ID.POSTGRES_WIRE,
      ).length;

    const nodeEndpointsCount =
      typeof this.systemTableCache.count === TYPEOF.FUNCTION ?
        this.systemTableCache.count(TABLES.NODE_ENDPOINTS) :
        this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS).length;
    const serviceEndpointsCount =
      typeof this.systemTableCache.count === TYPEOF.FUNCTION ?
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
    try {
      if (!this.buildLocalServiceDiscoverySnapshot) {
        return {
          selectedNodeIds: ADMIN_CACHE_DUMP.EMPTY,
          excludedByNodeId: {},
        };
      }
      const snapshot = this.buildLocalServiceDiscoverySnapshot({
        serviceIdAllowlist: [META_SERVICE_ID.POSTGRES_WIRE],
      });
      const selectedNodeIds = [];
      const excludedByNodeId = {};

      const services = Array.isArray(snapshot?.services) ?
        snapshot.services :
        [];
      for (const service of services) {
        const replicas = Array.isArray(service?.replicas) ?
          service.replicas :
          [];
        for (const replica of replicas) {
          const nodeId = typeof replica?.nodeId === TYPEOF.STRING ?
            replica.nodeId :
            null;
          if (!nodeId) {
            continue;
          }
          const readiness = replica?.readiness || null;
          const reasons = Array.isArray(readiness?.reasons) ?
            readiness.reasons :
            [];
          const reasonCodes = uniqueSorted(reasons
            .map((reason) =>
              String(reason?.code || EMPTY_STRING))
            .filter(Boolean));
          if (reasonCodes.length === NUM.ZERO) {
            selectedNodeIds.push(nodeId);
          } else {
            excludedByNodeId[nodeId] = reasonCodes;
          }
        }
      }

      return {
        selectedNodeIds: uniqueSorted(selectedNodeIds),
        excludedByNodeId,
      };
    } catch (_error) {
      return {
        selectedNodeIds: ADMIN_CACHE_DUMP.EMPTY,
        excludedByNodeId: {},
      };
    }
  }

  /**
   * Build canonical query_result payload for preflight critical-path
   * snapshot query.
   * @return {Promise<Object>}
   */
  async buildPreflightCriticalPathSnapshotQueryResult() {
    const snapshot =
      await this.resolvePreflightCriticalPathSnapshot();
    return {
      success: true,
      rows: [snapshot],
      count: NUM.ONE,
      partitions: ADMIN_CACHE_DUMP.EMPTY,
      tableName:
        ADMIN_PREFLIGHT_CRITICAL_PATH_SNAPSHOT.TABLE_NAME,
    };
  }
}

export {AdminPreflightSnapshot};
