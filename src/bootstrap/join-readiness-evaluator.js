/**
 * Join Readiness Evaluator — evaluates whether a joining node has
 * converged to a ready state by inspecting topology, schema versions,
 * endpoint visibility, and routing reachability.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {NodeService} from '../node/node-service.js';
import {
  getMissingSystemServiceLeaderCount,
} from '../cache/leader-readiness-gate.js';
import {
  resolveCanonicalRequiredSchemaVersion,
  resolveCanonicalAppliedSchemaVersion,
  normalizeJoinSchemaVersion,
  compareJoinSchemaVersions,
} from './join-schema-version-resolver.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  NUM,
  SERVICE_STATUS,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
  TYPEOF,
} from '../constants/index.js';
import {ENDPOINT_SYNC_HEALTH} from '../runtime/endpoint-sync-constants.js';
import {META_SERVICE_ID} from '../constants/wasm-meta.js';
import {
  isReplicaOperationInFlight,
  normalizeReplicaOperationRecord,
} from '../rebalancer/replica-operation-liveness.js';
import {
  JOIN_READINESS_DEFAULT_TABLE,
  JOIN_READINESS_REASON,
  JOIN_READINESS_REPAIR,
} from './node-joining-constants.js';

const JOIN_READINESS_REASON_PRECEDENCE = Object.freeze([
  JOIN_READINESS_REASON.ROUTING_NOT_READY,
  JOIN_READINESS_REASON.SCHEMA_VERSION_UNKNOWN,
  JOIN_READINESS_REASON.SCHEMA_VERSION_LAG,
  JOIN_READINESS_REASON.TOPOLOGY_NOT_READY,
]);

/**
 * Evaluates join readiness convergence for a joining node.
 */
class JoinReadinessEvaluator {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - This node's ID.
   * @param {Object} options.config - Joining configuration.
   * @param {Object} options.logger - Logger instance.
   * @param {Function} options.now - Time provider function.
   * @param {Function} options.sleep - Sleep function.
   * @param {Object} options.delegates - Callbacks into the joining service.
   * @param {Function} options.delegates.resolveControlPlaneTargetAddress
   * @param {Function} options.delegates.getMissingSystemServiceLeaders
   * @param {Function} options.delegates.getBlockingSystemServiceLeaders
   * @param {Function} options.delegates.backfillPropagatedCacheTables
   * @param {Function} options.delegates.getMessageRouter
   * @param {Function} options.delegates.getBootstrapResponse
   * @param {Function} options.delegates.getSystemCacheHydrated
   * @param {Function} options.delegates.getJoinReadinessSnapshotProvider
   * @param {Function} options.delegates.getCdcIntegrationService
   * @param {Function} options.delegates.getLogger
   * @param {Function} options.delegates.getConfig
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.now = options.now;
    this.sleep = options.sleep;
    this.delegates = options.delegates || {};

    // Mutable convergence state
    this.lastCanonicalJoinRepairAtMs = NUM.ZERO;
    this.canonicalJoinRepairPromise = null;
    this.lastClusterMeshSignature = null;
  }

  /**
   * Wait for canonical join readiness convergence before transitioning READY.
   * The gate is snapshot-only and mirrors strict pre-load semantics.
   * @return {Promise<void>}
   */
  async waitForCanonicalJoinReadinessConvergence() {
    if (this.delegates.getSystemCacheHydrated() !== true) {
      return;
    }

    const timeoutMs = this.resolveJoinReadinessTimeoutMs();
    if (!Number.isFinite(timeoutMs) || timeoutMs <= NUM.ZERO) {
      return;
    }

    const pollIntervalMs = this.resolveJoinReadinessPollIntervalMs();
    const startTime = this.now();
    let attempts = NUM.ZERO;
    let lastEvaluation = null;
    let lastSnapshotError = null;
    let lastProgressSignature = null;
    let lastProgressAtMs = startTime;

    while (this.now() - startTime < timeoutMs) {
      attempts += NUM.ONE;
      const snapshotResult =
        await this.collectCanonicalJoinReadinessSnapshot();
      if (snapshotResult.error) {
        lastSnapshotError = snapshotResult.error;
      }

      lastEvaluation = this.evaluateCanonicalJoinReadinessSnapshot(
        snapshotResult.snapshot,
      );
      const progressSignature = JSON.stringify({
        reasons: [...lastEvaluation.reasons].sort(),
        requiredSchemaVersion:
          lastEvaluation.requiredSchemaVersion || null,
        appliedSchemaVersion:
          lastEvaluation.appliedSchemaVersion || null,
        missingLeaders: lastEvaluation.missingLeaders || {},
        inFlightReplicaOperations:
          lastEvaluation.inFlightReplicaOperations || NUM.ZERO,
        missingNodeEndpointNodeIds:
          lastEvaluation.missingNodeEndpointNodeIds || [],
        missingPostgresWireNodeIds:
          lastEvaluation.missingPostgresWireNodeIds || [],
        snapshotError: lastSnapshotError?.message || null,
      });
      if (progressSignature !== lastProgressSignature) {
        lastProgressSignature = progressSignature;
        lastProgressAtMs = this.now();
      }
      if (lastEvaluation.ready) {
        this.delegates.getLogger().info(
          'Join canonical readiness converged',
          {
            nodeId: this.nodeId,
            attempts,
            elapsedMs: this.now() - startTime,
            requiredSchemaVersion:
              lastEvaluation.requiredSchemaVersion,
            appliedSchemaVersion:
              lastEvaluation.appliedSchemaVersion,
          },
        );
        return;
      }

      await this.repairCanonicalJoinReadinessIfNeeded(
        lastEvaluation,
        pollIntervalMs,
      );
      await this.sleep(pollIntervalMs);
    }

    const fallbackEvaluation = this.evaluateCanonicalJoinReadinessSnapshot({
      routingReady: false,
      topologyReady: false,
      requiredSchemaVersion: null,
      appliedSchemaVersion: null,
    });
    const terminalEvaluation = lastEvaluation || fallbackEvaluation;
    const reasonText = terminalEvaluation.reasons.join(', ');
    const error = new Error(
      `join_readiness_timeout: ${reasonText} after ${timeoutMs}ms`,
    );
    error.code = 'JOIN_READINESS_TIMEOUT';
    error.joinReadiness = {
      reasons: terminalEvaluation.reasons,
      requiredSchemaVersion: terminalEvaluation.requiredSchemaVersion,
      appliedSchemaVersion: terminalEvaluation.appliedSchemaVersion,
      requiredVsObservedByNode:
        this.buildJoinSchemaDiagnosticsByNode(terminalEvaluation),
      missingLeaders: terminalEvaluation.missingLeaders,
      inFlightReplicaOperations:
        terminalEvaluation.inFlightReplicaOperations,
      inFlightReplicaOperationDetails:
        terminalEvaluation.inFlightReplicaOperationDetails,
      missingNodeEndpointNodeIds:
        terminalEvaluation.missingNodeEndpointNodeIds,
      missingPostgresWireNodeIds:
        terminalEvaluation.missingPostgresWireNodeIds,
      elapsedMs: this.now() - startTime,
      attempts,
      snapshotError: lastSnapshotError?.message || null,
      timeoutKind: lastProgressAtMs === startTime ?
        'no_progress' :
        'absolute_deadline_exhausted',
      lastProgressElapsedMs:
        Math.max(NUM.ZERO, lastProgressAtMs - startTime),
    };

    this.delegates.getLogger().error(
      'Join canonical readiness timed out',
      {
        nodeId: this.nodeId,
        timeoutMs,
        attempts,
        reasons: terminalEvaluation.reasons,
        requiredSchemaVersion:
          terminalEvaluation.requiredSchemaVersion,
        appliedSchemaVersion:
          terminalEvaluation.appliedSchemaVersion,
        missingLeaders: terminalEvaluation.missingLeaders,
        inFlightReplicaOperations:
          terminalEvaluation.inFlightReplicaOperations,
        inFlightReplicaOperationDetails:
          terminalEvaluation.inFlightReplicaOperationDetails,
        missingNodeEndpointNodeIds:
          terminalEvaluation.missingNodeEndpointNodeIds,
        missingPostgresWireNodeIds:
          terminalEvaluation.missingPostgresWireNodeIds,
        snapshotError: lastSnapshotError?.message || null,
        timeoutKind: error.joinReadiness.timeoutKind,
        lastProgressElapsedMs:
          error.joinReadiness.lastProgressElapsedMs,
      },
    );
    throw error;
  }

  /**
   * Resolve join-readiness timeout.
   * @return {number}
   */
  resolveJoinReadinessTimeoutMs() {
    const config = this.delegates.getConfig();
    if (Number.isFinite(config.joinReadinessTimeoutMs)) {
      return Math.max(
        NUM.ZERO,
        Math.floor(config.joinReadinessTimeoutMs),
      );
    }
    return config.leadershipWaitTimeoutMs;
  }

  /**
   * Resolve join-readiness poll interval.
   * @return {number}
   */
  resolveJoinReadinessPollIntervalMs() {
    const config = this.delegates.getConfig();
    if (Number.isFinite(config.joinReadinessPollIntervalMs)) {
      return Math.max(
        NUM.ONE,
        Math.floor(config.joinReadinessPollIntervalMs),
      );
    }
    return Math.max(
      NUM.ONE,
      Math.floor(config.leadershipWaitInitialDelayMs),
    );
  }

  /**
   * Refresh discovery-critical propagated tables while canonical join
   * readiness is blocked on topology visibility.
   * @param {Object|null} evaluation
   * @param {number} pollIntervalMs
   * @return {Promise<void>}
   */
  async repairCanonicalJoinReadinessIfNeeded(evaluation, pollIntervalMs) {
    if (!evaluation ||
        !Array.isArray(evaluation.reasons) ||
        !evaluation.reasons.includes(
          JOIN_READINESS_REASON.TOPOLOGY_NOT_READY,
        )) {
      return;
    }

    const cdcIntegrationService = this.delegates.getCdcIntegrationService();
    if (!cdcIntegrationService?.sqlQueryEngine) {
      return;
    }

    if (this.canonicalJoinRepairPromise) {
      return;
    }

    const minIntervalMs = Math.max(
      JOIN_READINESS_REPAIR.MIN_INTERVAL_MS,
      Number.isFinite(pollIntervalMs) ?
        Math.floor(pollIntervalMs) :
        NUM.ZERO,
    );
    const now = this.now();
    if (this.lastCanonicalJoinRepairAtMs > NUM.ZERO &&
        now - this.lastCanonicalJoinRepairAtMs < minIntervalMs) {
      return;
    }

    this.lastCanonicalJoinRepairAtMs = now;
    const repairPromise = this.delegates
      .backfillPropagatedCacheTables(JOIN_READINESS_REPAIR.TABLES)
      .catch((error) => {
        this.delegates.getLogger().warn(
          'Canonical join readiness repair backfill failed',
          {
            nodeId: this.nodeId,
            error: error.message,
            missingNodeEndpointNodeIds:
              evaluation.missingNodeEndpointNodeIds,
            missingPostgresWireNodeIds:
              evaluation.missingPostgresWireNodeIds,
          },
        );
      })
      .finally(() => {
        if (this.canonicalJoinRepairPromise === repairPromise) {
          this.canonicalJoinRepairPromise = null;
        }
      });

    this.canonicalJoinRepairPromise = repairPromise;
    await repairPromise;
  }

  /**
   * Determine the table scope for canonical join schema checks.
   * @return {string}
   */
  resolveJoinReadinessTableName() {
    const config = this.delegates.getConfig();
    if (typeof config.joinReadinessTableName === TYPEOF.STRING) {
      const normalized =
        config.joinReadinessTableName.trim().toLowerCase();
      if (normalized.length > NUM.ZERO) {
        return normalized;
      }
    }
    return JOIN_READINESS_DEFAULT_TABLE;
  }

  /**
   * Collect one canonical join-readiness snapshot.
   * Provider errors are folded into a fail-closed snapshot.
   * @return {Promise<{snapshot: Object, error: Error|null}>}
   */
  async collectCanonicalJoinReadinessSnapshot() {
    const messageRouter = this.delegates.getMessageRouter();
    const context = {
      nodeId: this.nodeId,
      tableName: this.resolveJoinReadinessTableName(),
      bootstrapResponse: this.delegates.getBootstrapResponse(),
      systemTableCache: NodeService.getInstance().getSystemTableCache(),
      messageRouter,
    };

    try {
      const provider = this.delegates.getJoinReadinessSnapshotProvider();
      const snapshot = provider ?
        await provider(context) :
        this.buildCanonicalJoinReadinessSnapshot(context);
      return {
        snapshot,
        error: null,
      };
    } catch (error) {
      return {
        snapshot: {
          nodeId: this.nodeId,
          tableName: context.tableName,
          routingReady: false,
          topologyReady: false,
          requiredSchemaVersion: null,
          appliedSchemaVersion: null,
        },
        error,
      };
    }
  }

  /**
   * Build canonical join-readiness snapshot from local control-plane state.
   * @param {Object} context
   * @return {Object}
   */
  buildCanonicalJoinReadinessSnapshot(context = {}) {
    const systemTableCache = context.systemTableCache ||
      NodeService.getInstance().getSystemTableCache();
    const tableName =
      context.tableName || this.resolveJoinReadinessTableName();
    const targetAddress =
      this.delegates.resolveControlPlaneTargetAddress(
        {allowBootstrapHints: false},
      ) ||
      this.delegates.resolveControlPlaneTargetAddress(
        {allowBootstrapHints: true},
      );
    const routingReady =
      this.isControlPlaneAddressReachable(targetAddress);
    const topology =
      this.evaluateCanonicalJoinTopologyReadiness(systemTableCache);
    const bootstrapResponse = this.delegates.getBootstrapResponse();
    const requiredSchemaVersion = resolveCanonicalRequiredSchemaVersion(
      tableName,
      systemTableCache,
      bootstrapResponse?.systemTableSnapshots,
    );
    const appliedSchemaVersion = resolveCanonicalAppliedSchemaVersion(
      tableName,
      systemTableCache,
    );

    return {
      nodeId: this.nodeId,
      tableName,
      routingReady,
      topologyReady: topology.ready,
      requiredSchemaVersion,
      appliedSchemaVersion,
      requiredNodeIds:
        this.resolveJoinReadinessRequiredNodeIds(systemTableCache),
      missingLeaders: topology.missingLeaders,
      inFlightReplicaOperations: topology.inFlightReplicaOperations,
      inFlightReplicaOperationDetails:
        topology.inFlightReplicaOperationDetails,
      missingNodeEndpointNodeIds:
        topology.missingNodeEndpointNodeIds,
      missingPostgresWireNodeIds:
        topology.missingPostgresWireNodeIds,
    };
  }

  /**
   * Check whether control-plane target address is currently reachable.
   * @param {string|null} targetAddress
   * @return {boolean}
   */
  isControlPlaneAddressReachable(targetAddress) {
    if (typeof targetAddress !== TYPEOF.STRING ||
        targetAddress.length === NUM.ZERO) {
      return false;
    }

    const match = targetAddress.match(/^([^/]+)\//);
    const targetNodeId = match ? match[NUM.ONE] : null;
    if (!targetNodeId) {
      return false;
    }
    if (targetNodeId === this.nodeId) {
      return true;
    }

    const messageRouter = this.delegates.getMessageRouter();
    if (typeof messageRouter?.getConnectionState !== TYPEOF.FUNCTION) {
      return true;
    }
    return messageRouter.getConnectionState(targetNodeId) ===
      STATE.CONNECTED;
  }

  /**
   * Evaluate topology readiness for canonical join convergence.
   * @param {Object|null} systemTableCache
   * @return {{
   *   ready: boolean,
   *   missingLeaders: Object|null,
   *   inFlightReplicaOperations: number,
   *   inFlightReplicaOperationDetails: Array<Object>,
   *   missingNodeEndpointNodeIds: string[],
   *   missingPostgresWireNodeIds: string[],
   * }}
   */
  evaluateCanonicalJoinTopologyReadiness(systemTableCache) {
    if (!systemTableCache) {
      return {
        ready: false,
        missingLeaders: null,
        inFlightReplicaOperations: NUM.ZERO,
        inFlightReplicaOperationDetails: [],
        missingNodeEndpointNodeIds: [],
        missingPostgresWireNodeIds: [],
      };
    }

    let missingLeaders = null;
    let missingCount = Number.POSITIVE_INFINITY;
    try {
      const missing =
        this.delegates.getMissingSystemServiceLeaders(systemTableCache);
      missingLeaders = this.delegates.getBlockingSystemServiceLeaders(
        missing,
        systemTableCache,
      );
      missingCount = getMissingSystemServiceLeaderCount(missingLeaders);
    } catch (_evalErr) {
      missingLeaders = null;
      missingCount = Number.POSITIVE_INFINITY;
    }

    const inFlightReplicaOperationDetails =
      this.collectCanonicalInFlightReplicaOperationDetails(
        systemTableCache,
      );
    const inFlightReplicaOperations =
      inFlightReplicaOperationDetails.length;
    const endpointVisibility =
      this.evaluateCanonicalJoinEndpointVisibility(systemTableCache);

    return {
      ready: missingCount === NUM.ZERO &&
        inFlightReplicaOperations === NUM.ZERO &&
        endpointVisibility.ready === true,
      missingLeaders,
      inFlightReplicaOperations,
      inFlightReplicaOperationDetails,
      missingNodeEndpointNodeIds:
        endpointVisibility.missingNodeEndpointNodeIds,
      missingPostgresWireNodeIds:
        endpointVisibility.missingPostgresWireNodeIds,
    };
  }

  /**
   * Ensure local discovery-critical endpoint rows cover every ACTIVE node.
   * @param {Object|null} systemTableCache
   * @return {{
   *   ready: boolean,
   *   missingNodeEndpointNodeIds: string[],
   *   missingPostgresWireNodeIds: string[],
   * }}
   */
  evaluateCanonicalJoinEndpointVisibility(systemTableCache) {
    if (!systemTableCache ||
        typeof systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return {
        ready: false,
        missingNodeEndpointNodeIds: [],
        missingPostgresWireNodeIds: [],
      };
    }

    const activeNodeIds =
      this.getCanonicalJoinActiveNodeIds(systemTableCache);
    if (activeNodeIds.length === NUM.ZERO) {
      return {
        ready: false,
        missingNodeEndpointNodeIds: [],
        missingPostgresWireNodeIds: [],
      };
    }

    const nodeEndpointRows =
      systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || [];
    const serviceEndpointRows =
      systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS) || [];
    const visibleNodeEndpointNodeIds = new Set();
    const visiblePostgresWireNodeIds = new Set();

    for (const row of nodeEndpointRows) {
      const nodeId = String(
        row?.[COLUMN.NODE_ID] || row?.node_id || row?.nodeId || '',
      );
      const transportType = String(
        row?.[COLUMN.TRANSPORT_TYPE] ||
          row?.transport_type ||
          row?.transportType ||
          '',
      ).toLowerCase();
      const status = String(
        row?.[COLUMN.STATUS] || row?.status || '',
      ).toLowerCase();
      if (nodeId.length === NUM.ZERO) {
        continue;
      }
      if (status !==
          String(ENDPOINT_STATUS.ACTIVE).toLowerCase()) {
        continue;
      }
      if (transportType !==
          String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase()) {
        continue;
      }
      visibleNodeEndpointNodeIds.add(nodeId);
    }

    for (const row of serviceEndpointRows) {
      const nodeId = String(
        row?.[COLUMN.NODE_ID] || row?.node_id || row?.nodeId || '',
      );
      const serviceId = String(
        row?.[COLUMN.SERVICE_ID] ||
          row?.service_id ||
          row?.serviceId ||
          '',
      );
      const healthStatus = String(
        row?.health_status || row?.healthStatus || '',
      ).toLowerCase();
      if (nodeId.length === NUM.ZERO) {
        continue;
      }
      if (serviceId !== META_SERVICE_ID.POSTGRES_WIRE) {
        continue;
      }
      if (healthStatus !==
          String(ENDPOINT_SYNC_HEALTH.HEALTHY).toLowerCase()) {
        continue;
      }
      visiblePostgresWireNodeIds.add(nodeId);
    }

    const missingNodeEndpointNodeIds = activeNodeIds.filter(
      (nodeId) => !visibleNodeEndpointNodeIds.has(nodeId),
    );
    const missingPostgresWireNodeIds = activeNodeIds.filter(
      (nodeId) => !visiblePostgresWireNodeIds.has(nodeId),
    );

    return {
      ready: missingNodeEndpointNodeIds.length === NUM.ZERO &&
        missingPostgresWireNodeIds.length === NUM.ZERO,
      missingNodeEndpointNodeIds,
      missingPostgresWireNodeIds,
    };
  }

  /**
   * Return ACTIVE node ids visible in the local cache.
   * @param {Object|null} systemTableCache
   * @return {string[]}
   */
  getCanonicalJoinActiveNodeIds(systemTableCache) {
    if (!systemTableCache ||
        typeof systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return [];
    }

    const nodeRows = systemTableCache.getAll(TABLES.NODES) || [];
    const activeNodeIds = [];
    for (const row of nodeRows) {
      const nodeId = String(
        row?.[COLUMN.NODE_ID] || row?.node_id || row?.nodeId || '',
      );
      const status = String(
        row?.[COLUMN.STATUS] || row?.status || '',
      ).toLowerCase();
      if (nodeId.length === NUM.ZERO) {
        continue;
      }
      if (status !==
          String(SERVICE_STATUS.ACTIVE).toLowerCase()) {
        continue;
      }
      activeNodeIds.push(nodeId);
    }
    return activeNodeIds;
  }

  /**
   * Resolve node rows used for mesh connectivity.
   * Prefer the authoritative nodes cache over the initial bootstrap snapshot
   * so later joiners are not stranded when membership changes after bootstrap.
   * @return {{source: string, rows: Object[]}}
   */
  resolveMeshConnectivityNodeRows() {
    const systemTableCache =
      NodeService.getInstance().getSystemTableCache();
    if (systemTableCache &&
        typeof systemTableCache.getAll === TYPEOF.FUNCTION) {
      const cacheRows =
        (systemTableCache.getAll(TABLES.NODES) || []).filter((row) => {
          const nodeId = String(
            row?.[COLUMN.NODE_ID] ||
              row?.node_id ||
              row?.nodeId ||
              '',
          );
          return nodeId.length > NUM.ZERO;
        });
      if (cacheRows.length > NUM.ZERO) {
        return {
          source: 'system_table_cache',
          rows: cacheRows,
        };
      }
    }

    const bootstrapResponse = this.delegates.getBootstrapResponse();
    const snapshotRows = Array.isArray(
      bootstrapResponse?.systemTableSnapshots?.nodes,
    ) ?
      bootstrapResponse.systemTableSnapshots.nodes :
      [];
    return {
      source: 'bootstrap_snapshot',
      rows: snapshotRows,
    };
  }

  /**
   * Build a stable mesh-membership signature for connection reconciliation.
   * @param {Array<Object>} nodeRows
   * @return {string}
   */
  buildClusterMeshSignature(nodeRows) {
    if (!Array.isArray(nodeRows) || nodeRows.length === NUM.ZERO) {
      return '';
    }

    const members = nodeRows
      .map((row) => {
        const nodeId = String(
          row?.[COLUMN.NODE_ID] ||
            row?.node_id ||
            row?.nodeId ||
            '',
        );
        if (nodeId.length === NUM.ZERO || nodeId === this.nodeId) {
          return null;
        }
        const nodeAddress = String(
          row?.[COLUMN.NODE_ADDRESS] ||
            row?.node_address ||
            row?.nodeAddress ||
            '',
        );
        const status = String(
          row?.[COLUMN.STATUS] || row?.status || '',
        ).toLowerCase();
        return `${nodeId}|${nodeAddress}|${status}`;
      })
      .filter(Boolean)
      .sort();

    return members.join(',');
  }

  /**
   * Determine whether steady-state READY heartbeats need mesh
   * reconciliation.
   * @return {boolean}
   */
  shouldReconnectClusterMesh() {
    const messageRouter = this.delegates.getMessageRouter();
    if (!messageRouter) {
      return false;
    }

    const {rows: nodesSnapshot} = this.resolveMeshConnectivityNodeRows();
    if (!Array.isArray(nodesSnapshot) ||
        nodesSnapshot.length === NUM.ZERO) {
      return false;
    }

    const signature = this.buildClusterMeshSignature(nodesSnapshot);
    if (signature !== this.lastClusterMeshSignature) {
      return true;
    }

    const hasConnectionState =
      typeof messageRouter.getConnectionState === TYPEOF.FUNCTION;
    if (!hasConnectionState) {
      return false;
    }

    return nodesSnapshot.some((node) => {
      const nodeId = String(
        node?.[COLUMN.NODE_ID] ||
          node?.node_id ||
          node?.nodeId ||
          '',
      );
      return nodeId.length > NUM.ZERO &&
        nodeId !== this.nodeId &&
        messageRouter.getConnectionState(nodeId) !== STATE.CONNECTED;
    });
  }

  /**
   * Collect non-terminal replica operations from local cache.
   * @param {Object|null} systemTableCache
   * @return {Array<Object>}
   */
  collectCanonicalInFlightReplicaOperationDetails(systemTableCache) {
    if (!systemTableCache ||
        typeof systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return [];
    }

    const rows =
      systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || [];
    const inFlightOperations = [];
    for (const row of rows) {
      const normalizedOperation = normalizeReplicaOperationRecord(row);
      if (isReplicaOperationInFlight(normalizedOperation)) {
        inFlightOperations.push({
          operationId: normalizedOperation.operationId,
          type: normalizedOperation.type,
          partitionId: normalizedOperation.partitionGroupId,
          replicaId: String(
            row?.replica_id || row?.replicaId || '',
          ),
          sourceNodeId: normalizedOperation.sourceNodeId,
          targetNodeId: normalizedOperation.targetNodeId,
          status: normalizedOperation.status,
          workflowStep: normalizedOperation.workflowStep,
          completedAt: normalizedOperation.completedAt,
          ageMs: normalizedOperation.ageMs,
        });
      }
    }
    return inFlightOperations;
  }

  /**
   * Resolve node IDs required for join-readiness diagnostics.
   * @param {Object|null} systemTableCache
   * @return {Array<string>}
   */
  resolveJoinReadinessRequiredNodeIds(systemTableCache) {
    if (!systemTableCache ||
        typeof systemTableCache.filter !== TYPEOF.FUNCTION) {
      return [this.nodeId];
    }

    const activeNodes = systemTableCache.filter(TABLES.NODES, (row) => {
      const status = String(row?.status || '').toLowerCase();
      return status === SERVICE_STATUS.ACTIVE;
    });

    const nodeIds = [...new Set(activeNodes
      .map((row) => row?.node_id || row?.nodeId)
      .filter((value) =>
        typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
      ),
    )];

    if (!nodeIds.includes(this.nodeId)) {
      nodeIds.push(this.nodeId);
    }
    return nodeIds;
  }

  /**
   * Evaluate one canonical join-readiness snapshot.
   * @param {Object} snapshot
   * @return {Object}
   */
  evaluateCanonicalJoinReadinessSnapshot(snapshot) {
    const normalized =
      this.normalizeCanonicalJoinReadinessSnapshot(snapshot);
    const reasons =
      this.classifyCanonicalJoinReadinessReasons(normalized);
    return {
      ...normalized,
      reasons,
      ready: reasons.length === NUM.ZERO,
    };
  }

  /**
   * Classify canonical join-readiness reasons with stable precedence.
   * @param {Object} snapshot
   * @return {Array<string>}
   */
  classifyCanonicalJoinReadinessReasons(snapshot) {
    const reasons = [];
    if (snapshot?.routingReady !== true) {
      reasons.push(JOIN_READINESS_REASON.ROUTING_NOT_READY);
    }

    const requiredVersion = normalizeJoinSchemaVersion(
      snapshot?.requiredSchemaVersion,
    );
    const appliedVersion = normalizeJoinSchemaVersion(
      snapshot?.appliedSchemaVersion,
    );
    if (!requiredVersion || !appliedVersion) {
      reasons.push(JOIN_READINESS_REASON.SCHEMA_VERSION_UNKNOWN);
    } else if (compareJoinSchemaVersions(
      appliedVersion,
      requiredVersion,
    ) < NUM.ZERO) {
      reasons.push(JOIN_READINESS_REASON.SCHEMA_VERSION_LAG);
    }

    if (snapshot?.topologyReady !== true) {
      reasons.push(JOIN_READINESS_REASON.TOPOLOGY_NOT_READY);
    }

    return reasons.sort((left, right) => {
      const leftRank = this.getJoinReadinessReasonRank(left);
      const rightRank = this.getJoinReadinessReasonRank(right);
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return String(left).localeCompare(String(right));
    });
  }

  /**
   * Normalize one canonical join-readiness snapshot.
   * @param {Object} snapshot
   * @return {Object}
   */
  normalizeCanonicalJoinReadinessSnapshot(snapshot) {
    const source = snapshot && typeof snapshot === TYPEOF.OBJECT ?
      snapshot :
      {};
    const requiredVersion = normalizeJoinSchemaVersion(
      source.requiredSchemaVersion,
    );
    const appliedVersion = normalizeJoinSchemaVersion(
      source.appliedSchemaVersion,
    );
    const requiredNodeIds = Array.isArray(source.requiredNodeIds) ?
      source.requiredNodeIds.filter((value) =>
        typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
      ) :
      [this.nodeId];

    return {
      nodeId: source.nodeId || this.nodeId,
      tableName:
        source.tableName || this.resolveJoinReadinessTableName(),
      routingReady: source.routingReady === true,
      topologyReady: source.topologyReady === true,
      requiredSchemaVersion: requiredVersion,
      appliedSchemaVersion: appliedVersion,
      requiredNodeIds,
      missingLeaders:
        source.missingLeaders &&
        typeof source.missingLeaders === TYPEOF.OBJECT ?
          source.missingLeaders :
          null,
      inFlightReplicaOperations:
        Number.isFinite(source.inFlightReplicaOperations) ?
          Math.max(
            NUM.ZERO,
            Math.floor(source.inFlightReplicaOperations),
          ) :
          NUM.ZERO,
      inFlightReplicaOperationDetails:
        Array.isArray(source.inFlightReplicaOperationDetails) ?
          source.inFlightReplicaOperationDetails :
          [],
      missingNodeEndpointNodeIds:
        Array.isArray(source.missingNodeEndpointNodeIds) ?
          source.missingNodeEndpointNodeIds.filter((value) =>
            typeof value === TYPEOF.STRING &&
            value.length > NUM.ZERO,
          ) :
          [],
      missingPostgresWireNodeIds:
        Array.isArray(source.missingPostgresWireNodeIds) ?
          source.missingPostgresWireNodeIds.filter((value) =>
            typeof value === TYPEOF.STRING &&
            value.length > NUM.ZERO,
          ) :
          [],
      observedSchemaByNodeId:
        source.observedSchemaByNodeId &&
        typeof source.observedSchemaByNodeId === TYPEOF.OBJECT ?
          source.observedSchemaByNodeId :
          null,
    };
  }

  /**
   * Build per-node schema diagnostics for join timeout reporting.
   * @param {Object} evaluation
   * @return {Object}
   */
  buildJoinSchemaDiagnosticsByNode(evaluation) {
    const requiredVersion =
      evaluation?.requiredSchemaVersion || null;
    const observedVersion =
      evaluation?.appliedSchemaVersion || null;
    const reasons = Array.isArray(evaluation?.reasons) ?
      evaluation.reasons :
      [];
    const requiredNodeIds =
      Array.isArray(evaluation?.requiredNodeIds) &&
      evaluation.requiredNodeIds.length > NUM.ZERO ?
        evaluation.requiredNodeIds :
        [this.nodeId];
    const observedByNodeId =
      evaluation?.observedSchemaByNodeId &&
      typeof evaluation.observedSchemaByNodeId === TYPEOF.OBJECT ?
        evaluation.observedSchemaByNodeId :
        {};

    const diagnostics = {};
    for (const nodeId of requiredNodeIds) {
      diagnostics[nodeId] = {
        requiredSchemaVersion: requiredVersion,
        observedSchemaVersion:
          normalizeJoinSchemaVersion(observedByNodeId[nodeId]) ||
          observedVersion,
        unmetReasons: reasons,
      };
    }
    return diagnostics;
  }

  /**
   * Rank one join-readiness reason according to stable precedence.
   * @param {string} reason
   * @return {number}
   */
  getJoinReadinessReasonRank(reason) {
    const index = JOIN_READINESS_REASON_PRECEDENCE.indexOf(reason);
    return index >= NUM.ZERO ?
      index :
      JOIN_READINESS_REASON_PRECEDENCE.length;
  }
}

export {JoinReadinessEvaluator};
