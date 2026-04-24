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
} from './join-schema-version-resolver.js';
import {
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
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
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
  getLocalQueryTransportReadiness,
  isLocalQueryTransportReady,
} from './shared/local-query-transport-readiness.js';
import {
  JOIN_MESH_CONNECTIVITY_REPAIR,
  JOIN_READINESS_DEFAULT_TABLE,
  JOIN_READINESS_REASON,
  JOIN_READINESS_REPAIR,
} from './node-joining-constants.js';
import {
  resolveControlPlaneSnapshotRevisionMetadata,
} from '../control-plane/control-plane-snapshot-revision.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';
import {
  createJoinReadinessEvaluatorTailMethods,
} from './join-readiness-evaluator-tail-methods.js';

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
const CANONICAL_JOIN_DISCOVERY_CRITICAL_TABLES = new Set(
  JOIN_READINESS_REPAIR.TABLES.map((tableName) =>
    String(tableName || '').trim().toLowerCase(),
  ).filter((tableName) => tableName.length > NUM.ZERO),
);
const JOIN_READINESS_BLOCKED_ACTION = Object.freeze({
  NONE: 'none',
  REPAIR_TOPOLOGY_VISIBILITY: 'repair_topology_visibility',
});
const JOIN_READINESS_TIMEOUT_FALLBACK_SNAPSHOT = Object.freeze({
  routingReady: false,
  topologyReady: false,
  requiredSchemaVersion: null,
  appliedSchemaVersion: null,
});

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
    this.lastMeshConnectivityRepairAtMs = NUM.ZERO;
    this.meshConnectivityRepairPromise = null;
    this.lastClusterMeshSignature = null;
    this.lastCanonicalJoinBlockedLogAtMs = NUM.ZERO;
    this.highestObservedSnapshotRevision = null;
    this.highestObservedSnapshotResumeToken = null;
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
        const attemptResult =
          await this.collectCanonicalJoinReadinessAttempt();
        return {
          ready: attemptResult.evaluation.ready,
          evaluation: attemptResult.evaluation,
          snapshotError: attemptResult.snapshotError,
          attempts: attempt,
          elapsedMs,
        };
      },
      buildProgressSignature: (attemptResult) =>
        this.buildCanonicalJoinReadinessProgressSignature(
          attemptResult,
        ),
      onBlocked: async (result, context) => {
        return this.handleCanonicalJoinReadinessBlockedAttempt(
          result,
          context,
          pollIntervalMs,
        );
      },
      createTimeoutError: (result, context) => {
        return this.buildCanonicalJoinReadinessTimeoutError(
          result,
          context,
          timeoutMs,
        );
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
        promotionState:
          finalEvaluation?.promotionState || null,
        snapshotRevision:
          finalEvaluation?.snapshotRevision ?? null,
      },
    );
  }

  /**
   * Collect one explicit join-readiness attempt with snapshot, error, and
   * evaluation grouped under one owner result.
   * @return {Promise<Object>}
   */
  async collectCanonicalJoinReadinessAttempt() {
    const snapshotResult =
      await this.collectCanonicalJoinReadinessSnapshot();
    const evaluation = this.evaluateCanonicalJoinReadinessSnapshot(
      snapshotResult.snapshot,
    );
    return Object.freeze({
      snapshot: snapshotResult.snapshot,
      snapshotError: snapshotResult.error,
      evaluation,
    });
  }

  /**
   * Build one stable progress signature for convergence waiting.
   * @param {Object|null} attemptResult
   * @return {string}
   */
  buildCanonicalJoinReadinessProgressSignature(attemptResult = null) {
    const evaluation = attemptResult?.evaluation || null;
    return JSON.stringify({
      reasons: [...(evaluation?.reasons || [])].sort(),
      requiredSchemaVersion:
        evaluation?.requiredSchemaVersion || null,
      appliedSchemaVersion:
        evaluation?.appliedSchemaVersion || null,
      missingLeaders: evaluation?.missingLeaders || {},
      inFlightReplicaOperations:
        evaluation?.inFlightReplicaOperations || NUM.ZERO,
      excludedRemotePriorityControlPlaneCount:
        evaluation?.excludedRemotePriorityControlPlaneCount || NUM.ZERO,
      missingNodeEndpointNodeIds:
        evaluation?.missingNodeEndpointNodeIds || [],
      missingPostgresWireNodeIds:
        evaluation?.missingPostgresWireNodeIds || [],
      snapshotError:
        attemptResult?.snapshotError?.message || null,
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
      promotionState:
        evaluation?.promotionState || null,
      snapshotRevision:
        evaluation?.snapshotRevision ?? null,
      snapshotRevisionState:
        evaluation?.snapshotRevisionState || null,
      snapshotRevisionGap:
        evaluation?.snapshotRevisionGap ?? null,
    });
  }

  /**
   * Resolve one blocked-action plan from the evaluated readiness state.
   * @param {Object|null} evaluation
   * @param {number} pollIntervalMs
   * @return {Object}
   */
  resolveCanonicalJoinBlockedAction(evaluation, pollIntervalMs) {
    const reasons = Array.isArray(evaluation?.reasons) ?
      evaluation.reasons :
      [];
    if (!reasons.includes(JOIN_READINESS_REASON.TOPOLOGY_NOT_READY)) {
      return Object.freeze({
        actionId: JOIN_READINESS_BLOCKED_ACTION.NONE,
        pollIntervalMs: null,
      });
    }
    const normalizedPollIntervalMs = Number.isFinite(pollIntervalMs) ?
      Math.max(NUM.ZERO, Math.floor(pollIntervalMs)) :
      null;
    return Object.freeze({
      actionId:
        JOIN_READINESS_BLOCKED_ACTION.REPAIR_TOPOLOGY_VISIBILITY,
      pollIntervalMs: normalizedPollIntervalMs,
    });
  }

  /**
   * Log and execute one blocked join-readiness attempt.
   * @param {Object|null} attemptResult
   * @param {Object} context
   * @param {number} pollIntervalMs
   * @return {Promise<boolean>}
   */
  async handleCanonicalJoinReadinessBlockedAttempt(
    attemptResult,
    context = {},
    pollIntervalMs,
  ) {
    const evaluation = attemptResult?.evaluation || null;
    if (!evaluation) {
      return false;
    }
    this.logCanonicalJoinReadinessBlocked(evaluation, {
      attempts: attemptResult?.attempts || context.attempt,
      elapsedMs: context.elapsedMs,
      snapshotError: attemptResult?.snapshotError || null,
      force: context.progressChanged,
    });
    const action = this.resolveCanonicalJoinBlockedAction(
      evaluation,
      pollIntervalMs,
    );
    return this.executeCanonicalJoinBlockedAction(action, evaluation);
  }

  /**
   * Execute one blocked join-readiness action plan.
   * @param {Object|null} action
   * @param {Object|null} evaluation
   * @return {Promise<boolean>}
   */
  async executeCanonicalJoinBlockedAction(action, evaluation) {
    switch (action?.actionId) {
      case JOIN_READINESS_BLOCKED_ACTION
        .REPAIR_TOPOLOGY_VISIBILITY:
        return this.repairCanonicalJoinReadinessIfNeeded(
          evaluation,
          action.pollIntervalMs,
        );
      default:
        return false;
    }
  }

  /**
   * Build one canonical timeout error from the final attempt result.
   * @param {Object|null} attemptResult
   * @param {Object} context
   * @param {number} timeoutMs
   * @return {Error}
   */
  buildCanonicalJoinReadinessTimeoutError(
    attemptResult,
    context = {},
    timeoutMs,
  ) {
    const fallbackEvaluation =
      this.evaluateCanonicalJoinReadinessSnapshot(
        JOIN_READINESS_TIMEOUT_FALLBACK_SNAPSHOT,
      );
    const terminalEvaluation =
      attemptResult?.evaluation || fallbackEvaluation;
    const attempts =
      attemptResult?.attempts || context.attempt || NUM.ONE;
    const snapshotErrorMessage =
      attemptResult?.snapshotError?.message || null;
    const error = new Error(
      'join_readiness_timeout: ' +
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
      excludedSelfTargetedCount:
        terminalEvaluation.excludedSelfTargetedCount,
      excludedWarmingTargetCount:
        terminalEvaluation.excludedWarmingTargetCount,
      excludedNonDiscoveryPartitionCount:
        terminalEvaluation.excludedNonDiscoveryPartitionCount,
      excludedRemotePriorityControlPlaneCount:
        terminalEvaluation.excludedRemotePriorityControlPlaneCount,
      excludedRemotePriorityControlPlaneOperationDetails:
        terminalEvaluation.excludedRemotePriorityControlPlaneOperationDetails,
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
      promotionState:
        terminalEvaluation.promotionState,
      promotionReasons:
        terminalEvaluation.promotionReasons,
      snapshotRevision:
        terminalEvaluation.snapshotRevision,
      snapshotRevisionState:
        terminalEvaluation.snapshotRevisionState,
      snapshotExpectedMinimumRevision:
        terminalEvaluation.snapshotExpectedMinimumRevision,
      snapshotRevisionGap:
        terminalEvaluation.snapshotRevisionGap,
      snapshotResumeToken:
        terminalEvaluation.snapshotResumeToken,
      elapsedMs: context.elapsedMs,
      attempts,
      snapshotError: snapshotErrorMessage,
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
        excludedSelfTargetedCount:
          terminalEvaluation.excludedSelfTargetedCount,
        excludedWarmingTargetCount:
          terminalEvaluation.excludedWarmingTargetCount,
        excludedNonDiscoveryPartitionCount:
          terminalEvaluation.excludedNonDiscoveryPartitionCount,
        excludedRemotePriorityControlPlaneCount:
          terminalEvaluation.excludedRemotePriorityControlPlaneCount,
        excludedRemotePriorityControlPlaneOperationDetails:
          terminalEvaluation.excludedRemotePriorityControlPlaneOperationDetails,
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
        promotionState:
          terminalEvaluation.promotionState,
        promotionReasons:
          terminalEvaluation.promotionReasons,
        snapshotRevision:
          terminalEvaluation.snapshotRevision,
        snapshotRevisionState:
          terminalEvaluation.snapshotRevisionState,
        snapshotExpectedMinimumRevision:
          terminalEvaluation.snapshotExpectedMinimumRevision,
        snapshotRevisionGap:
          terminalEvaluation.snapshotRevisionGap,
        snapshotResumeToken:
          terminalEvaluation.snapshotResumeToken,
        snapshotError: snapshotErrorMessage,
        timeoutKind: context.timeoutKind,
        lastProgressElapsedMs:
          context.lastProgressElapsedMs,
      },
    );
    return error;
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
   * Repair mesh-connectivity discovery authority when node rows are visible
   * but canonical websocket endpoints are missing from the propagated cache.
   * @param {string[]|undefined|null} missingNodeIds
   * @return {Promise<boolean>}
   */
  async repairMeshConnectivityAuthorityIfNeeded(missingNodeIds) {
    const normalizedMissingNodeIds = Array.from(new Set(
      (Array.isArray(missingNodeIds) ? missingNodeIds : [])
        .map((nodeId) => String(nodeId || '').trim())
        .filter((nodeId) => nodeId.length > NUM.ZERO && nodeId !== this.nodeId),
    ));
    if (normalizedMissingNodeIds.length === NUM.ZERO) {
      return false;
    }

    const cdcIntegrationService = this.delegates.getCdcIntegrationService?.();
    if (!cdcIntegrationService?.sqlQueryEngine) {
      return false;
    }

    if (this.meshConnectivityRepairPromise) {
      await this.meshConnectivityRepairPromise;
      return true;
    }

    if (this.isLocalRouterBackpressured()) {
      return false;
    }

    const now = this.now();
    if (this.lastMeshConnectivityRepairAtMs > NUM.ZERO &&
        now - this.lastMeshConnectivityRepairAtMs <
          JOIN_MESH_CONNECTIVITY_REPAIR.MIN_INTERVAL_MS) {
      return false;
    }

    this.lastMeshConnectivityRepairAtMs = now;
    const repairPromise = this.delegates
      .backfillPropagatedCacheTables(
        JOIN_MESH_CONNECTIVITY_REPAIR.TABLES,
        {
          blocking: true,
          preferBootstrapSnapshot: false,
          deliveryPriority: 'critical',
        },
      )
      .catch((error) => {
        this.delegates.getLogger().warn(
          'Mesh connectivity authority backfill failed',
          {
            nodeId: this.nodeId,
            error: error.message,
            missingNodeIds: normalizedMissingNodeIds,
          },
        );
      })
      .finally(() => {
        if (this.meshConnectivityRepairPromise === repairPromise) {
          this.meshConnectivityRepairPromise = null;
        }
      });

    this.meshConnectivityRepairPromise = repairPromise;
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
    const workloadProfile = buildControlPlaneWorkloadProfile(
      CONTROL_PLANE_WORKLOAD_CLASS.JOIN_REPAIR,
    );
    return PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter,
    }).isBackpressured({
      workClass: workloadProfile.workClass || PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: workloadProfile.resourceKeys,
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
      expectedMinimumRevision: this.highestObservedSnapshotRevision,
      expectedResumeToken: this.highestObservedSnapshotResumeToken,
    };

    try {
      const provider = this.delegates.getJoinReadinessSnapshotProvider();
      const snapshot = provider ?
        await provider(context) :
        this.buildCanonicalJoinReadinessSnapshot(context);
      this.recordObservedSnapshotFromSnapshot(snapshot);
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
    const expectedResumeToken =
      typeof context.expectedResumeToken === TYPEOF.STRING &&
      context.expectedResumeToken.length > NUM.ZERO ?
        context.expectedResumeToken :
        this.highestObservedSnapshotResumeToken;
    const snapshotRevisionMetadata =
      resolveControlPlaneSnapshotRevisionMetadata({
        topologySnapshotEpoch,
        capturedAt:
          this.delegates.getBootstrapTopologySnapshotHydratedAtMs?.() ||
          null,
      }, {
        expectedResumeToken,
      });
    this.recordObservedSnapshotRevisionMetadata(snapshotRevisionMetadata);

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
      snapshotRevision: snapshotRevisionMetadata.revision,
      snapshotRevisionSource: snapshotRevisionMetadata.revisionSource,
      snapshotRevisionState: snapshotRevisionMetadata.revisionState,
      snapshotExpectedMinimumRevision:
        snapshotRevisionMetadata.expectedMinimumRevision,
      snapshotRevisionGap: snapshotRevisionMetadata.revisionGap,
      snapshotResumeToken: snapshotRevisionMetadata.resumeToken,
      snapshotObservedAt: snapshotRevisionMetadata.observedAt,
      snapshotObservedAtMs: snapshotRevisionMetadata.observedAtMs,
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
      excludedNonDiscoveryPartitionCount:
        topology.excludedNonDiscoveryPartitionCount,
      excludedRemotePriorityControlPlaneCount:
        topology.excludedRemotePriorityControlPlaneCount,
      excludedRemotePriorityControlPlaneOperationDetails:
        topology.excludedRemotePriorityControlPlaneOperationDetails,
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
      const readiness = getLocalQueryTransportReadiness(
        this.delegates.getMessageRouter?.() || null,
      );
      if (isLocalQueryTransportReady(readiness)) {
        return true;
      }
      return this.resolveJoinReadinessTargetCandidates()
        .includes(targetAddress);
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

    if (typeof this.delegates.resolveControlPlaneTargetAddress !==
        TYPEOF.FUNCTION) {
      return [];
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
        const readiness = getLocalQueryTransportReadiness(
          messageRouter || null,
        );
        connectionStates[targetAddress] =
          isLocalQueryTransportReady(readiness) ?
            'self' :
            `self:${readiness.state || 'unknown'}`;
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
   *   excludedNonDiscoveryPartitionCount: number,
   *   excludedRemotePriorityControlPlaneCount: number,
   *   excludedRemotePriorityControlPlaneOperationDetails: Array<Object>,
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
        excludedNonDiscoveryPartitionCount: NUM.ZERO,
        excludedRemotePriorityControlPlaneCount: NUM.ZERO,
        excludedRemotePriorityControlPlaneOperationDetails: [],
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
    const excludedNonDiscoveryPartitionCount =
      operationDetails.excludedNonDiscoveryPartitionCount;
    const excludedRemotePriorityControlPlaneCount =
      operationDetails.excludedRemotePriorityControlPlaneCount;
    return {
      ready: missingCount === NUM.ZERO &&
        inFlightReplicaOperations === NUM.ZERO,
      missingLeaders,
      inFlightReplicaOperations,
      inFlightReplicaOperationDetails,
      excludedSelfTargetedCount,
      excludedWarmingTargetCount,
      excludedNonDiscoveryPartitionCount,
      excludedRemotePriorityControlPlaneCount,
      excludedRemotePriorityControlPlaneOperationDetails:
        operationDetails.excludedRemotePriorityControlPlaneOperationDetails,
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
    const readinessService =
      this.delegates.getControlPlaneReadinessService?.() || null;
    const startupAuthorityNodeIds =
      this.getStartupAuthorityActiveNodeIds(readinessService);
    const cacheActiveNodeIds =
      systemTableCache &&
      typeof systemTableCache.getAll === TYPEOF.FUNCTION ?
        this.getCacheActiveNodeIds(
          systemTableCache.getAll(TABLES.NODES) || [],
        ) :
        [];
    if (!readinessService ||
        !systemTableCache ||
        typeof systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return cacheActiveNodeIds.length > NUM.ZERO ?
        cacheActiveNodeIds :
        startupAuthorityNodeIds;
    }

    const readinessActiveNodeIds =
      this.getReadinessActiveNodeIds(
        readinessService,
        systemTableCache.getAll(TABLES.NODES) || [],
      );
    if (readinessActiveNodeIds.length > NUM.ZERO) {
      return readinessActiveNodeIds;
    }
    if (cacheActiveNodeIds.length > NUM.ZERO) {
      return cacheActiveNodeIds;
    }
    return startupAuthorityNodeIds;
  }

  getCacheActiveNodeIds(nodeRows) {
    const activeNodeIds = [];
    for (const row of Array.isArray(nodeRows) ? nodeRows : []) {
      const normalizedRow = normalizeNodeRow(row);
      const {nodeId, status} = normalizedRow;
      if (nodeId.length === NUM.ZERO) {
        continue;
      }
      if (status === String(NODE_STATE.ACTIVE).toLowerCase()) {
        activeNodeIds.push(nodeId);
      }
    }
    return [...new Set(activeNodeIds)];
  }

  getReadinessActiveNodeIds(readinessService, nodeRows) {
    if (typeof readinessService?.getNodeReadinessSync !== TYPEOF.FUNCTION) {
      return [];
    }
    const activeNodeIds = [];
    for (const row of nodeRows) {
      const normalizedRow = normalizeNodeRow(row);
      const {nodeId} = normalizedRow;
      if (nodeId.length === NUM.ZERO) {
        continue;
      }
      const readiness = readinessService.getNodeReadinessSync(
        nodeId,
        {
          decisionDimension:
            CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE,
        },
      );
      if (readiness?.dimensions?.[
        CONTROL_PLANE_READINESS_DIMENSION
          .CONTROL_PLANE_RECOVERY_ELIGIBLE
      ] === true) {
        activeNodeIds.push(nodeId);
      }
    }
    return activeNodeIds;
  }

  getStartupAuthorityActiveNodeIds(readinessService) {
    if (typeof readinessService?.getStartupAuthoritySnapshotSync !==
        TYPEOF.FUNCTION) {
      return [];
    }
    const startupAuthority = readinessService.getStartupAuthoritySnapshotSync(
      this.nodeId,
      this.now(),
    );
    if (!Array.isArray(startupAuthority?.canonicalStartupNodeIds)) {
      return [];
    }
    return [...new Set(
      startupAuthority.canonicalStartupNodeIds.filter((nodeId) =>
        typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO,
      ),
    )];
  }
}

Object.assign(
  JoinReadinessEvaluator.prototype,
  createJoinReadinessEvaluatorTailMethods({
    joinReadinessReasonPrecedence: JOIN_READINESS_REASON_PRECEDENCE,
    meshIneligibleNodeStates: MESH_INELIGIBLE_NODE_STATES,
    meshConnectedOrInFlightStates: MESH_CONNECTED_OR_IN_FLIGHT_STATES,
    canonicalJoinReadinessLogIntervalMs:
      CANONICAL_JOIN_READINESS_LOG_INTERVAL_MS,
    canonicalJoinDiscoveryCriticalTables:
      CANONICAL_JOIN_DISCOVERY_CRITICAL_TABLES,
  }),
);

export {JoinReadinessEvaluator};
