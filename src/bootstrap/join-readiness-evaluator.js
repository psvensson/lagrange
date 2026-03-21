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
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  ControlPlaneMessageType,
  getControlPlaneMessageRequiredTables,
} from '../control-plane/control-plane-constants.js';
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
  NODE_STATE,
  NUM,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
  TYPEOF,
} from '../constants/index.js';
import {CONNECTION_STATE} from '../constants/transport.js';
import {ENDPOINT_SYNC_HEALTH} from '../runtime/endpoint-sync-constants.js';
import {META_SERVICE_ID} from '../constants/wasm-meta.js';
import {
  isReplicaOperationInFlight,
  normalizeReplicaOperationRecord,
} from '../rebalancer/replica-operation-liveness.js';
import {
  normalizeNodeEndpointRow,
  normalizeNodeRow,
  normalizeServiceEndpointRow,
} from '../control-plane/system-row-normalizers.js';
import {
  subscribeToMessageRouterEvents,
  subscribeToSystemTableCacheChanges,
  waitForStartupConvergence,
} from './shared/startup-convergence-gate.js';
import {
  JOIN_READINESS_DEFAULT_TABLE,
  JOIN_READINESS_REASON,
  JOIN_READINESS_REPAIR,
  JOINING_LOG_MSG,
} from './node-joining-constants.js';

const JOIN_READINESS_REASON_PRECEDENCE = Object.freeze([
  JOIN_READINESS_REASON.ROUTING_NOT_READY,
  JOIN_READINESS_REASON.SCHEMA_VERSION_UNKNOWN,
  JOIN_READINESS_REASON.SCHEMA_VERSION_LAG,
  JOIN_READINESS_REASON.TOPOLOGY_NOT_READY,
]);
const MESH_INELIGIBLE_NODE_STATES = new Set([
  String(NODE_STATE.DRAINING).toLowerCase(),
  String(NODE_STATE.FAILED).toLowerCase(),
  String(NODE_STATE.SHUTTING_DOWN).toLowerCase(),
  String(NODE_STATE.STOPPED).toLowerCase(),
]);
const MESH_CONNECTED_OR_IN_FLIGHT_STATES = new Set([
  CONNECTION_STATE.CONNECTED,
  CONNECTION_STATE.CONNECTING,
  CONNECTION_STATE.RECONNECTING,
]);
const CANONICAL_JOIN_READINESS_LOG_INTERVAL_MS = 5000;

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
   * @param {Function} [options.delegates.resolveControlPlaneTargetAddressCandidates]
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
    this.lastCanonicalJoinBlockedLogAtMs = NUM.ZERO;
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
    let lastSnapshotError = null;
    const result = await waitForStartupConvergence({
      timeoutMs,
      now: this.now,
      subscriptions: [
        (notify) => subscribeToSystemTableCacheChanges(
          NodeService.getInstance().getSystemTableCache(),
          notify,
        ),
        (notify) => subscribeToMessageRouterEvents(
          this.delegates.getMessageRouter?.() || null,
          notify,
        ),
      ],
      evaluate: async ({attempt, elapsedMs}) => {
        const snapshotResult =
          await this.collectCanonicalJoinReadinessSnapshot();
        if (snapshotResult.error) {
          lastSnapshotError = snapshotResult.error;
        }
        const evaluation = this.evaluateCanonicalJoinReadinessSnapshot(
          snapshotResult.snapshot,
        );
        return {
          ready: evaluation.ready,
          evaluation,
          attempts: attempt,
          elapsedMs,
        };
      },
      buildProgressSignature: (result) => {
        const evaluation = result?.evaluation || null;
        return JSON.stringify({
          reasons: [...(evaluation?.reasons || [])].sort(),
          requiredSchemaVersion:
            evaluation?.requiredSchemaVersion || null,
          appliedSchemaVersion:
            evaluation?.appliedSchemaVersion || null,
          missingLeaders: evaluation?.missingLeaders || {},
          inFlightReplicaOperations:
            evaluation?.inFlightReplicaOperations || NUM.ZERO,
          missingNodeEndpointNodeIds:
            evaluation?.missingNodeEndpointNodeIds || [],
          missingPostgresWireNodeIds:
            evaluation?.missingPostgresWireNodeIds || [],
          snapshotError: lastSnapshotError?.message || null,
          controlPlaneTargetAddress:
            evaluation?.controlPlaneTargetAddress || null,
          controlPlaneTargetCandidates:
            evaluation?.controlPlaneTargetCandidates || [],
          controlPlaneTargetConnectionStates:
            evaluation?.controlPlaneTargetConnectionStates || null,
          topologySnapshotEpoch:
            evaluation?.topologySnapshotEpoch ?? null,
          appliedTopologyEpoch:
            evaluation?.appliedTopologyEpoch ?? null,
        });
      },
      onBlocked: async (result, context) => {
        const evaluation = result?.evaluation || null;
        if (!evaluation) {
          return;
        }
        this.logCanonicalJoinReadinessBlocked(evaluation, {
          attempts: result?.attempts || context.attempt,
          elapsedMs: context.elapsedMs,
          snapshotError: lastSnapshotError,
          force: context.progressChanged,
        });
        return this.repairCanonicalJoinReadinessIfNeeded(
          evaluation,
          pollIntervalMs,
        );
      },
      createTimeoutError: (result, context) => {
        const fallbackEvaluation =
          this.evaluateCanonicalJoinReadinessSnapshot({
            routingReady: false,
            topologyReady: false,
            requiredSchemaVersion: null,
            appliedSchemaVersion: null,
          });
        const terminalEvaluation =
          result?.evaluation || fallbackEvaluation;
        const attempts =
          result?.attempts || context.attempt || NUM.ONE;
        const error = new Error(
          `join_readiness_timeout: ` +
          `${terminalEvaluation.reasons.join(', ')} ` +
          `after ${timeoutMs}ms`,
        );
        error.code = 'JOIN_READINESS_TIMEOUT';
        error.joinReadiness = {
          reasons: terminalEvaluation.reasons,
          requiredSchemaVersion:
            terminalEvaluation.requiredSchemaVersion,
          appliedSchemaVersion:
            terminalEvaluation.appliedSchemaVersion,
          requiredVsObservedByNode:
            this.buildJoinSchemaDiagnosticsByNode(
              terminalEvaluation,
            ),
          missingLeaders: terminalEvaluation.missingLeaders,
          inFlightReplicaOperations:
            terminalEvaluation.inFlightReplicaOperations,
          inFlightReplicaOperationDetails:
            terminalEvaluation.inFlightReplicaOperationDetails,
          missingNodeEndpointNodeIds:
            terminalEvaluation.missingNodeEndpointNodeIds,
          missingPostgresWireNodeIds:
            terminalEvaluation.missingPostgresWireNodeIds,
          controlPlaneTargetAddress:
            terminalEvaluation.controlPlaneTargetAddress,
          controlPlaneTargetCandidates:
            terminalEvaluation.controlPlaneTargetCandidates,
          controlPlaneTargetConnectionStates:
            terminalEvaluation.controlPlaneTargetConnectionStates,
          topologySnapshotEpoch:
            terminalEvaluation.topologySnapshotEpoch,
          appliedTopologyEpoch:
            terminalEvaluation.appliedTopologyEpoch,
          elapsedMs: context.elapsedMs,
          attempts,
          snapshotError: lastSnapshotError?.message || null,
          timeoutKind: context.timeoutKind,
          lastProgressElapsedMs:
            context.lastProgressElapsedMs,
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
            controlPlaneTargetAddress:
              terminalEvaluation.controlPlaneTargetAddress,
            controlPlaneTargetCandidates:
              terminalEvaluation.controlPlaneTargetCandidates,
            controlPlaneTargetConnectionStates:
              terminalEvaluation.controlPlaneTargetConnectionStates,
            topologySnapshotEpoch:
              terminalEvaluation.topologySnapshotEpoch,
            appliedTopologyEpoch:
              terminalEvaluation.appliedTopologyEpoch,
            snapshotError: lastSnapshotError?.message || null,
            timeoutKind: context.timeoutKind,
            lastProgressElapsedMs:
              context.lastProgressElapsedMs,
          },
        );
        return error;
      },
    });

    const finalEvaluation = result?.evaluation || null;
    this.delegates.getLogger().info(
      'Join canonical readiness converged',
      {
        nodeId: this.nodeId,
        attempts: result?.attempts || NUM.ONE,
        elapsedMs: result?.elapsedMs || NUM.ZERO,
        requiredSchemaVersion:
          finalEvaluation?.requiredSchemaVersion || null,
        appliedSchemaVersion:
          finalEvaluation?.appliedSchemaVersion || null,
      },
    );
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
   * @return {Promise<boolean>}
   */
  async repairCanonicalJoinReadinessIfNeeded(evaluation, pollIntervalMs) {
    if (!evaluation ||
        !Array.isArray(evaluation.reasons) ||
        !evaluation.reasons.includes(
          JOIN_READINESS_REASON.TOPOLOGY_NOT_READY,
        )) {
      return false;
    }

    const cdcIntegrationService = this.delegates.getCdcIntegrationService();
    if (!cdcIntegrationService?.sqlQueryEngine) {
      return false;
    }

    if (this.canonicalJoinRepairPromise) {
      return false;
    }

    if (this.isLocalRouterBackpressured()) {
      return false;
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
      return false;
    }

    this.lastCanonicalJoinRepairAtMs = now;
    const repairPromise = this.delegates
      .backfillPropagatedCacheTables(JOIN_READINESS_REPAIR.TABLES, {
        blocking: true,
      })
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
    return true;
  }

  /**
   * Determine whether the local router is currently backpressured.
   * @return {boolean}
   * @private
   */
  isLocalRouterBackpressured() {
    const messageRouter = this.delegates.getMessageRouter?.() || null;
    return PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter,
    }).isBackpressured({
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: ['join:repair'],
    });
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
   * This is the owner that combines topology, endpoint visibility, routing,
   * and topology-epoch convergence into one readiness view.
   * @param {Object} context
   * @return {Object}
   */
  buildCanonicalJoinReadinessSnapshot(context = {}) {
    const systemTableCache = context.systemTableCache ||
      NodeService.getInstance().getSystemTableCache();
    const tableName =
      context.tableName || this.resolveJoinReadinessTableName();
    const topologySnapshotEpoch =
      this.resolveBootstrapTopologySnapshotEpoch();
    const appliedTopologyEpoch =
      this.resolveAppliedTopologyEpoch(systemTableCache);
    const targetCandidates =
      this.resolveJoinReadinessTargetCandidates();
    const targetAddress = targetCandidates[NUM.ZERO] || null;
    const routingReady =
      this.isControlPlaneAddressReachable(targetAddress);
    const topology =
      this.evaluateCanonicalJoinTopologyReadiness(systemTableCache);
    const endpointVisibility =
      this.evaluateCanonicalJoinEndpointVisibility(systemTableCache);
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
      topologyReady: topology.ready &&
        endpointVisibility.ready === true &&
        this.isBootstrapTopologyEpochSatisfied({
          topologySnapshotEpoch,
          appliedTopologyEpoch,
        }),
      controlPlaneTargetAddress: targetAddress,
      controlPlaneTargetCandidates: targetCandidates,
      controlPlaneTargetConnectionStates:
        this.resolveControlPlaneTargetConnectionStates(
          targetCandidates,
        ),
      topologySnapshotEpoch,
      appliedTopologyEpoch,
      requiredSchemaVersion,
      appliedSchemaVersion,
      requiredNodeIds:
        this.resolveJoinReadinessRequiredNodeIds(systemTableCache),
      missingLeaders: topology.missingLeaders,
      inFlightReplicaOperations: topology.inFlightReplicaOperations,
      inFlightReplicaOperationDetails:
        topology.inFlightReplicaOperationDetails,
      excludedSelfTargetedCount:
        topology.excludedSelfTargetedCount,
      excludedWarmingTargetCount:
        topology.excludedWarmingTargetCount,
      missingNodeEndpointNodeIds:
        endpointVisibility.missingNodeEndpointNodeIds,
      missingPostgresWireNodeIds:
        endpointVisibility.missingPostgresWireNodeIds,
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
   * Resolve ordered control-plane target candidates for readiness checks.
   * Local ingress is included because READY publication is allowed to route
   * through a live local kernel path when available.
   * @return {Array<string>}
   */
  resolveJoinReadinessTargetCandidates() {
    if (
      typeof this.delegates.resolveControlPlaneTargetAddressCandidates ===
      TYPEOF.FUNCTION
    ) {
      const candidates =
        this.delegates.resolveControlPlaneTargetAddressCandidates({
          allowBootstrapHints: true,
          allowSelfTarget: true,
          localTargetMode: 'any_replica',
          requiredTables: getControlPlaneMessageRequiredTables(
            ControlPlaneMessageType.NODE_STATE_UPDATE,
          ),
        });
      return Array.isArray(candidates) ?
        [...new Set(candidates.filter((value) =>
          typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
        ))] :
        [];
    }

    const candidates = [
      this.delegates.resolveControlPlaneTargetAddress({
        allowBootstrapHints: false,
        allowSelfTarget: true,
        localTargetMode: 'any_replica',
        requiredTables: getControlPlaneMessageRequiredTables(
          ControlPlaneMessageType.NODE_STATE_UPDATE,
        ),
      }),
      this.delegates.resolveControlPlaneTargetAddress({
        allowBootstrapHints: true,
        allowSelfTarget: true,
        localTargetMode: 'any_replica',
        requiredTables: getControlPlaneMessageRequiredTables(
          ControlPlaneMessageType.NODE_STATE_UPDATE,
        ),
      }),
    ];
    return [...new Set(candidates.filter((value) =>
      typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
    ))];
  }

  /**
   * Resolve per-target router connection states for diagnostics.
   * @param {Array<string>} targetCandidates
   * @return {Object|null}
   */
  resolveControlPlaneTargetConnectionStates(targetCandidates) {
    if (!Array.isArray(targetCandidates) ||
        targetCandidates.length === NUM.ZERO) {
      return null;
    }

    const messageRouter = this.delegates.getMessageRouter();
    const connectionStates = {};
    for (const targetAddress of targetCandidates) {
      if (typeof targetAddress !== TYPEOF.STRING ||
          targetAddress.length === NUM.ZERO) {
        continue;
      }
      const match = targetAddress.match(/^([^/]+)\//);
      const targetNodeId = match ? match[NUM.ONE] : null;
      if (!targetNodeId) {
        connectionStates[targetAddress] = null;
        continue;
      }
      if (targetNodeId === this.nodeId) {
        connectionStates[targetAddress] = 'self';
        continue;
      }
      if (typeof messageRouter?.getConnectionState !== TYPEOF.FUNCTION) {
        connectionStates[targetAddress] = null;
        continue;
      }
      connectionStates[targetAddress] =
        messageRouter.getConnectionState(targetNodeId) || null;
    }
    return Object.keys(connectionStates).length > NUM.ZERO ?
      connectionStates :
      null;
  }

  /**
   * Evaluate topology readiness for canonical join convergence.
   * @param {Object|null} systemTableCache
   * @return {{
   *   ready: boolean,
   *   missingLeaders: Object|null,
   *   inFlightReplicaOperations: number,
   *   inFlightReplicaOperationDetails: Array<Object>,
   *   excludedSelfTargetedCount: number,
   *   excludedWarmingTargetCount: number,
   * }}
   */
  evaluateCanonicalJoinTopologyReadiness(systemTableCache) {
    if (!systemTableCache) {
      return {
        ready: false,
        missingLeaders: null,
        inFlightReplicaOperations: NUM.ZERO,
        inFlightReplicaOperationDetails: [],
        excludedSelfTargetedCount: NUM.ZERO,
        excludedWarmingTargetCount: NUM.ZERO,
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

    const operationDetails =
      this.collectCanonicalInFlightReplicaOperationDetails(
        systemTableCache,
      );
    const inFlightReplicaOperationDetails =
      operationDetails.inFlightOperations;
    const inFlightReplicaOperations =
      inFlightReplicaOperationDetails.length;
    const excludedSelfTargetedCount =
      operationDetails.excludedSelfTargetedCount;
    const excludedWarmingTargetCount =
      operationDetails.excludedWarmingTargetCount;
    return {
      ready: missingCount === NUM.ZERO &&
        inFlightReplicaOperations === NUM.ZERO,
      missingLeaders,
      inFlightReplicaOperations,
      inFlightReplicaOperationDetails,
      excludedSelfTargetedCount,
      excludedWarmingTargetCount,
      missingNodeEndpointNodeIds: [],
      missingPostgresWireNodeIds: [],
    };
  }

  /**
   * Ensure local discovery-critical endpoint rows cover this joining node.
   * Peer endpoint visibility converges independently and should not block the
   * local node from becoming ready once authoritative topology is otherwise
   * settled.
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

    const requiredNodeIds = [this.nodeId];

    const nodeEndpointRows =
      systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || [];
    const serviceEndpointRows =
      systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS) || [];
    const visibleNodeEndpointNodeIds = new Set();
    const visiblePostgresWireNodeIds = new Set();

    for (const row of nodeEndpointRows) {
      const normalizedRow = normalizeNodeEndpointRow(row);
      const {nodeId, transportType, status} = normalizedRow;
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
      const normalizedRow = normalizeServiceEndpointRow(row);
      const {nodeId, serviceId, healthStatus} = normalizedRow;
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

    const missingNodeEndpointNodeIds = requiredNodeIds.filter(
      (nodeId) => !visibleNodeEndpointNodeIds.has(nodeId),
    );
    const missingPostgresWireNodeIds = requiredNodeIds.filter(
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
    const fallbackNodeIds =
      this.resolveBootstrapTopologySnapshotActiveNodeIds();
    if (!systemTableCache ||
        typeof systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return fallbackNodeIds;
    }

    const nodeRows = systemTableCache.getAll(TABLES.NODES) || [];
    const activeNodeIds = [];
    for (const row of nodeRows) {
      const normalizedRow = normalizeNodeRow(row);
      const {nodeId, status} = normalizedRow;
      if (nodeId.length === NUM.ZERO) {
        continue;
      }
      if (status !== String(NODE_STATE.ACTIVE).toLowerCase()) {
        continue;
      }
      activeNodeIds.push(nodeId);
    }
    if (activeNodeIds.length > NUM.ZERO) {
      return activeNodeIds;
    }
    return fallbackNodeIds;
  }

  /**
   * Resolve one node id from a mesh-connectivity row shape.
   * @param {Object|null} row
   * @return {string}
   */
  resolveMeshConnectivityNodeId(row) {
    return normalizeNodeRow(row).nodeId;
  }

  /**
   * Resolve one node status from a mesh-connectivity row shape.
   * @param {Object|null} row
   * @return {string}
   */
  resolveMeshConnectivityNodeStatus(row) {
    return normalizeNodeRow(row).status;
  }

  /**
   * Resolve lifecycle-state tokens relevant to peer mesh eligibility.
   * Mesh reconciliation is a transport concern, so any non-terminal node with
   * authoritative endpoint metadata should be considered connectable.
   * @param {Object|null} row
   * @return {string[]}
   */
  resolveMeshConnectivityLifecycleTokens(row) {
    return Array.from(new Set([
      row?.[COLUMN.STATUS],
      row?.status,
      row?.[COLUMN.CONNECTION_STATE],
      row?.connection_state,
      row?.connectionState,
    ].map((value) => {
      return String(value || '').toLowerCase();
    }).filter((value) => value.length > NUM.ZERO)));
  }

  /**
   * Determine whether a node row should participate in mesh reconciliation.
   * Nodes without lifecycle state are retained so bootstrap snapshots remain
   * usable before canonical readiness data has fully propagated. For steady
   * state, only explicitly terminal lifecycle states are excluded.
   * @param {Object|null} row
   * @return {boolean}
   */
  isMeshEligibleNodeRow(row) {
    const nodeId = this.resolveMeshConnectivityNodeId(row);
    if (nodeId.length === NUM.ZERO) {
      return false;
    }

    const lifecycleTokens =
      this.resolveMeshConnectivityLifecycleTokens(row);
    if (lifecycleTokens.length === NUM.ZERO) {
      return true;
    }

    return !lifecycleTokens.some((token) => {
      return MESH_INELIGIBLE_NODE_STATES.has(token);
    });
  }

  /**
   * Resolve node rows used for mesh connectivity.
   * Prefer the authoritative nodes cache over the initial bootstrap snapshot
   * so later joiners are not stranded when membership changes after bootstrap.
   * @return {{source: string, rows: Object[]}}
   */
  resolveMeshConnectivityNodeRows() {
    const bootstrapActiveNodeIds = new Set(
      this.resolveBootstrapTopologySnapshotActiveNodeIds(),
    );
    const systemTableCache =
      NodeService.getInstance().getSystemTableCache();
    if (systemTableCache &&
        typeof systemTableCache.getAll === TYPEOF.FUNCTION) {
      const cacheRows =
        (systemTableCache.getAll(TABLES.NODES) || []).filter((row) => {
          return this.isMeshEligibleNodeRow(row);
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
      bootstrapResponse.systemTableSnapshots.nodes.filter((row) => {
        if (bootstrapActiveNodeIds.size > NUM.ZERO) {
          const nodeId =
            this.resolveMeshConnectivityNodeId(row);
          return nodeId.length > NUM.ZERO &&
            bootstrapActiveNodeIds.has(nodeId);
        }
        return this.isMeshEligibleNodeRow(row);
      }) :
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
        const nodeId = this.resolveMeshConnectivityNodeId(row);
        if (nodeId.length === NUM.ZERO ||
            nodeId === this.nodeId ||
            !this.isMeshEligibleNodeRow(row)) {
          return null;
        }
        const nodeAddress = String(
          row?.[COLUMN.NODE_ADDRESS] ||
            row?.node_address ||
            row?.nodeAddress ||
            '',
        );
        const lifecycleSignature =
          this.resolveMeshConnectivityLifecycleTokens(row)
            .sort()
            .join('+');
        return `${nodeId}|${nodeAddress}|${lifecycleSignature}`;
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
      const nodeId = this.resolveMeshConnectivityNodeId(node);
      return nodeId.length > NUM.ZERO &&
        nodeId !== this.nodeId &&
        !MESH_CONNECTED_OR_IN_FLIGHT_STATES.has(
          messageRouter.getConnectionState(nodeId),
        );
    });
  }

  /**
   * Collect non-terminal replica operations from local cache.
   * Self-targeted operations (where targetNodeId matches this node)
   * and warming-node-targeted operations (where the target node is
   * NOT in ACTIVE state) are excluded to prevent join-readiness
   * deadlock.
   * @param {Object|null} systemTableCache
   * @return {{
   *   inFlightOperations: Array<Object>,
   *   excludedSelfTargetedCount: number,
   *   excludedWarmingTargetCount: number,
   * }}
   */
  collectCanonicalInFlightReplicaOperationDetails(systemTableCache) {
    if (!systemTableCache ||
        typeof systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return {
        inFlightOperations: [],
        excludedSelfTargetedCount: NUM.ZERO,
        excludedWarmingTargetCount: NUM.ZERO,
      };
    }

    const activeNodeIds = new Set(
      this.getCanonicalJoinActiveNodeIds(systemTableCache),
    );

    const rows =
      systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || [];
    const serviceRows =
      systemTableCache.getAll(TABLES.SERVICES) || [];
    const inFlightOperations = [];
    let excludedSelfTargetedCount = NUM.ZERO;
    let excludedWarmingTargetCount = NUM.ZERO;
    for (const row of rows) {
      const normalizedOperation = normalizeReplicaOperationRecord(row);
      if (isReplicaOperationInFlight(normalizedOperation, {serviceRows})) {
        if (normalizedOperation.targetNodeId === this.nodeId) {
          excludedSelfTargetedCount++;
          continue;
        }
        if (!activeNodeIds.has(normalizedOperation.targetNodeId)) {
          excludedWarmingTargetCount++;
          continue;
        }
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
    return {
      inFlightOperations,
      excludedSelfTargetedCount,
      excludedWarmingTargetCount,
    };
  }

  /**
   * Resolve node IDs required for join-readiness diagnostics.
   * @param {Object|null} systemTableCache
   * @return {Array<string>}
   */
  resolveJoinReadinessRequiredNodeIds(systemTableCache) {
    const nodeIds = [...new Set(
      this.getCanonicalJoinActiveNodeIds(systemTableCache),
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
      topologySnapshotEpoch:
        Number.isFinite(source.topologySnapshotEpoch) ?
          Math.max(NUM.ZERO, Math.floor(source.topologySnapshotEpoch)) :
          null,
      appliedTopologyEpoch:
        Number.isFinite(source.appliedTopologyEpoch) ?
          Math.max(NUM.ZERO, Math.floor(source.appliedTopologyEpoch)) :
          null,
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
      excludedSelfTargetedCount:
        Number.isFinite(source.excludedSelfTargetedCount) ?
          Math.max(
            NUM.ZERO,
            Math.floor(source.excludedSelfTargetedCount),
          ) :
          NUM.ZERO,
      excludedWarmingTargetCount:
        Number.isFinite(source.excludedWarmingTargetCount) ?
          Math.max(
            NUM.ZERO,
            Math.floor(source.excludedWarmingTargetCount),
          ) :
          NUM.ZERO,
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
      controlPlaneTargetAddress:
        typeof source.controlPlaneTargetAddress === TYPEOF.STRING &&
        source.controlPlaneTargetAddress.length > NUM.ZERO ?
          source.controlPlaneTargetAddress :
          null,
      controlPlaneTargetCandidates:
        Array.isArray(source.controlPlaneTargetCandidates) ?
          source.controlPlaneTargetCandidates.filter((value) =>
            typeof value === TYPEOF.STRING &&
            value.length > NUM.ZERO,
          ) :
          [],
      controlPlaneTargetConnectionStates:
        source.controlPlaneTargetConnectionStates &&
        typeof source.controlPlaneTargetConnectionStates === TYPEOF.OBJECT ?
          source.controlPlaneTargetConnectionStates :
          null,
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
   * Emit throttled diagnostics while canonical readiness remains blocked.
   * @param {Object|null} evaluation
   * @param {Object} options
   * @param {number} options.attempts
   * @param {number} options.elapsedMs
   * @param {Error|null} [options.snapshotError]
   * @param {boolean} [options.force=false]
   * @return {void}
   */
  logCanonicalJoinReadinessBlocked(evaluation, options = {}) {
    if (!evaluation || evaluation.ready === true) {
      return;
    }

    const nowMs = this.now();
    const force = options.force === true;
    if (!force &&
        this.lastCanonicalJoinBlockedLogAtMs > NUM.ZERO &&
        nowMs - this.lastCanonicalJoinBlockedLogAtMs <
          CANONICAL_JOIN_READINESS_LOG_INTERVAL_MS) {
      return;
    }

    this.lastCanonicalJoinBlockedLogAtMs = nowMs;
    this.delegates.getLogger().warn(
      JOINING_LOG_MSG.CANONICAL_READINESS_BLOCKED,
      {
        nodeId: this.nodeId,
        attempts: Number.isFinite(options.attempts) ?
          options.attempts :
          null,
        elapsedMs: Number.isFinite(options.elapsedMs) ?
          options.elapsedMs :
          null,
        reasons: evaluation.reasons,
        routingReady: evaluation.routingReady,
        topologyReady: evaluation.topologyReady,
        requiredSchemaVersion: evaluation.requiredSchemaVersion,
        appliedSchemaVersion: evaluation.appliedSchemaVersion,
        missingLeaders: evaluation.missingLeaders,
        inFlightReplicaOperations:
          evaluation.inFlightReplicaOperations,
        inFlightReplicaOperationDetails:
          evaluation.inFlightReplicaOperationDetails,
        excludedSelfTargetedCount:
          evaluation.excludedSelfTargetedCount,
        excludedWarmingTargetCount:
          evaluation.excludedWarmingTargetCount,
        missingNodeEndpointNodeIds:
          evaluation.missingNodeEndpointNodeIds,
        missingPostgresWireNodeIds:
          evaluation.missingPostgresWireNodeIds,
        controlPlaneTargetAddress:
          evaluation.controlPlaneTargetAddress,
        controlPlaneTargetCandidates:
          evaluation.controlPlaneTargetCandidates,
        controlPlaneTargetConnectionStates:
          evaluation.controlPlaneTargetConnectionStates,
        topologySnapshotEpoch:
          evaluation.topologySnapshotEpoch,
        appliedTopologyEpoch:
          evaluation.appliedTopologyEpoch,
        snapshotError: options.snapshotError?.message || null,
      },
    );
  }

  /**
   * Resolve the published bootstrap topology snapshot metadata.
   * @return {Object|null}
   * @private
   */
  resolveBootstrapTopologySnapshotMeta() {
    const delegateMeta =
      this.delegates.getBootstrapTopologySnapshotMeta?.();
    if (delegateMeta && typeof delegateMeta === TYPEOF.OBJECT) {
      return delegateMeta;
    }

    const bootstrapResponse = this.delegates.getBootstrapResponse?.();
    const responseMeta = bootstrapResponse?.topologySnapshotMeta;
    return responseMeta && typeof responseMeta === TYPEOF.OBJECT ?
      responseMeta :
      null;
  }

  /**
   * Resolve active node IDs published with the bootstrap topology snapshot.
   * @return {Array<string>}
   * @private
   */
  resolveBootstrapTopologySnapshotActiveNodeIds() {
    const topologySnapshotMeta =
      this.resolveBootstrapTopologySnapshotMeta();
    if (!Array.isArray(topologySnapshotMeta?.activeNodeIds)) {
      return [];
    }

    return [...new Set(topologySnapshotMeta.activeNodeIds.filter((value) =>
      typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
    ))];
  }

  /**
   * Resolve the published bootstrap topology epoch.
   * @return {number|null}
   * @private
   */
  resolveBootstrapTopologySnapshotEpoch() {
    const topologySnapshotMeta =
      this.resolveBootstrapTopologySnapshotMeta();
    if (Number.isFinite(topologySnapshotMeta?.topologyEpoch)) {
      return Math.max(
        NUM.ZERO,
        Math.floor(topologySnapshotMeta.topologyEpoch),
      );
    }

    const bootstrapResponse = this.delegates.getBootstrapResponse?.();
    if (Number.isFinite(bootstrapResponse?.currentEpoch?.epoch)) {
      return Math.max(
        NUM.ZERO,
        Math.floor(bootstrapResponse.currentEpoch.epoch),
      );
    }
    return null;
  }

  /**
   * Resolve the locally applied topology epoch watermark.
   * @param {Object|null} systemTableCache
   * @return {number}
   * @private
   */
  resolveAppliedTopologyEpoch(systemTableCache) {
    if (typeof systemTableCache?.getEpoch === TYPEOF.FUNCTION) {
      const cacheEpoch = systemTableCache.getEpoch();
      if (Number.isFinite(cacheEpoch)) {
        return Math.max(NUM.ZERO, Math.floor(cacheEpoch));
      }
    }
    return NUM.ZERO;
  }

  /**
   * Determine whether the local cache has applied the bootstrap topology epoch.
   * @param {Object} options
   * @param {number|null} options.topologySnapshotEpoch
   * @param {number} options.appliedTopologyEpoch
   * @return {boolean}
   * @private
   */
  isBootstrapTopologyEpochSatisfied(options = {}) {
    if (!Number.isFinite(options.topologySnapshotEpoch)) {
      return true;
    }
    return Number.isFinite(options.appliedTopologyEpoch) &&
      options.appliedTopologyEpoch >= options.topologySnapshotEpoch;
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
