import {NodeService} from '../node/node-service.js';
import {
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  NUM,
} from '../constants/index.js';
import {
  subscribeToMessageRouterEvents,
  subscribeToSystemTableCacheChanges,
  waitForStartupConvergence,
} from './shared/startup-convergence-gate.js';
import {
  JOIN_MESH_CONNECTIVITY_REPAIR,
  JOIN_READINESS_REASON,
  JOIN_READINESS_REPAIR,
} from './node-joining-constants.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';

const LOCAL_STR_1C87J = 'Join canonical readiness converged';
const LOCAL_STR_ELZSM = 'JOIN_READINESS_TIMEOUT';
const LOCAL_STR_98J4B = 'Join canonical readiness timed out';

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

class JoinReadinessEvaluatorConvergenceMethods {
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
      LOCAL_STR_1C87J,
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
      excludedSelfSourcePriorityControlPlaneCount:
        evaluation?.excludedSelfSourcePriorityControlPlaneCount || NUM.ZERO,
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
    error.code = LOCAL_STR_ELZSM;
    // Readiness not converging YET is transient: the node's join
    // infrastructure is fully up by this segment, so the retryable resume
    // (CL-006) should preserve it and re-enter the readiness wait rather
    // than tear down and re-register under the same pressure.
    error.deferRetry = true;
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
      excludedSelfSourcePriorityControlPlaneCount:
        terminalEvaluation.excludedSelfSourcePriorityControlPlaneCount,
      excludedSelfSourcePriorityControlPlaneOperationDetails:
        terminalEvaluation
          .excludedSelfSourcePriorityControlPlaneOperationDetails,
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
      LOCAL_STR_98J4B,
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
        excludedSelfSourcePriorityControlPlaneCount:
          terminalEvaluation.excludedSelfSourcePriorityControlPlaneCount,
        excludedSelfSourcePriorityControlPlaneOperationDetails:
          terminalEvaluation
            .excludedSelfSourcePriorityControlPlaneOperationDetails,
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
}

function createJoinReadinessEvaluatorConvergenceMethods() {
  const descriptors = Object.getOwnPropertyDescriptors(
    JoinReadinessEvaluatorConvergenceMethods.prototype,
  );
  delete descriptors.constructor;
  return descriptors;
}

export {createJoinReadinessEvaluatorConvergenceMethods};
