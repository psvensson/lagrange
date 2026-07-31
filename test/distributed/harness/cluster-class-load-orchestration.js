import {CLUSTER_CLASS_SHARED_CONTEXT} from './cluster-class-shared-context.js';
import {
  buildLoadLaneTableAdmissionProbeSql,
} from '../../../src/admin/load-lane-table-admission-probe.js';

const {
  ACTIVE_POLL_INTERVAL_MS,
  ADMIN_QUERY_TIMEOUT_MS,
  ADMIN_SOCKET_LANE_SNAPSHOT,
  BENCHMARK_ADMISSION_DEGRADATION_STATE_HEALTHY,
  BENCHMARK_ADMISSION_LOCAL_REPLICA_ROLE_UNKNOWN,
  BENCHMARK_LOAD_ADMISSION_REASON_DISCOVERY_PRESSURED,
  BENCHMARK_LOAD_ADMISSION_REASON_PUBLICATION_EPOCH_MISMATCH,
  BENCHMARK_LOAD_ADMISSION_REASON_RECOVERY_GATE_CLOSED,
  CLUSTER_READINESS_MODE_LOAD,
  CONTAINER_RUNNING_STATUS,
  CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
  LOAD_READINESS_STABILITY_TIMEOUT_MS,
  LOAD_READINESS_STABLE_WINDOW_MS,
  MIN_TIMEOUT_MS,
  ONE,
  RESTART_POLL_INTERVAL_MS,
  UNKNOWN_STATE,
  ZERO,
  buildBenchmarkCriticalControlPlaneStabilitySnapshot,
  buildBenchmarkLoadAdmissionEvaluation,
  buildBenchmarkLoadAdmissionSnapshot,
  buildServiceDiscoverySql,
  collectBenchmarkAdmissionReasonCodes,
  evaluateLoadPublishedConvergence,
  extractBenchmarkAdmissionReasonCodesFromError,
  inspectLocalBenchmarkAdmissionFromDiscovery,
  isRetryableBenchmarkAdmissionError,
  normalizeBenchmarkAdmissionRetryAfterMs,
  normalizeProbeError,
  pollUntilCondition,
  resolvePositiveTimeoutMs,
  verifyBenchmarkLoadLaneAdmission,
} = CLUSTER_CLASS_SHARED_CONTEXT;
import {ClusterLifecycleBase} from './cluster-class-lifecycle-base.js';

const RESTART_RECOVERY_FIELD_NONE = 'none';

/**
 * Evaluate restart-recovery readiness from one reachability probe.
 * Provisional admin reachability is not recovery: the restarted target must
 * have consumed canonical startup authority, completed infrastructure join,
 * and finished transaction replay before the harness may declare
 * recovery-ready.
 * @param {Object} options
 * @param {Object|null} options.diagnostics
 * @param {boolean} options.requireAdminReady
 * @param {number|null} options.expectedPublicationEpoch
 * @return {boolean}
 */
function evaluateRestartRecoveryReadiness({
  diagnostics,
  requireAdminReady,
  expectedPublicationEpoch,
}) {
  const startupHandoff =
    diagnostics?.startupRuntimeHandoff &&
    typeof diagnostics.startupRuntimeHandoff === 'object' ?
      diagnostics.startupRuntimeHandoff :
      null;
  const startupHandoffComplete =
    startupHandoff !== null &&
    startupHandoff.infrastructureJoinComplete === true &&
    startupHandoff.canonicalAuthorityConsumed === true &&
    startupHandoff.transactionRecoveryReady === true;
  const readinessObserved =
    requireAdminReady === true ?
      diagnostics?.adminReady === true :
      diagnostics?.adminReady === true ||
        diagnostics?.controlPlaneRecoveryReady === true;
  const epochMatches =
    expectedPublicationEpoch === null ||
    Number(diagnostics?.publishedControlPlaneEpoch) ===
      expectedPublicationEpoch;
  return startupHandoffComplete && readinessObserved && epochMatches;
}

const RESTART_RECOVERY_REASON_SEPARATOR = '|';
const RESTART_RECOVERY_FIELD_SEPARATOR = ', ';
const RESTART_RECOVERY_FIELD_VALUE_SEPARATOR = '=';
const RESTART_RECOVERY_FIELD_BOOTSTRAP_JOIN_PROJECTION_BLOCKER =
  'bootstrapJoinProjectionBlocker';
const RESTART_RECOVERY_FIELD_BOOTSTRAP_JOIN_PROJECTION_RULE =
  'bootstrapJoinProjectionRule';
const RESTART_RECOVERY_FIELD_STARTUP_PHASE = 'startupPhase';
const RESTART_RECOVERY_FIELD_SEED_CONTACT_OUTCOME = 'seedContactOutcome';
const RESTART_RECOVERY_FIELD_SEED_CONTACT_ATTEMPT = 'seedContactAttempt';
const RESTART_RECOVERY_FIELD_SEED_CONTACT_REMAINING_BUDGET_MS =
  'seedContactRemainingBudgetMs';
const RESTART_RECOVERY_FIELD_SEED_CONTACT_AUTHORITY_SOURCE =
  'seedContactAuthoritySource';
const RESTART_RECOVERY_FIELD_CANONICAL_AUTHORITY_CONSUMED =
  'canonicalAuthorityConsumed';
const RESTART_RECOVERY_FIELD_TRANSACTION_RECOVERY_STATE =
  'transactionRecoveryState';
const RESTART_RECOVERY_FIELD_TRANSACTION_RECOVERY_READY =
  'transactionRecoveryReady';
// CL-025: a single ready probe is satisfiable by a node mid-crash (admin came
// up early in boot, process exited between the probe and the recovered
// declaration — observed in stat-gate 085908Z-run2). Readiness must hold
// across consecutive probes, and must still hold after the post-restart
// boundary snapshot.
const RESTART_RECOVERY_CONSECUTIVE_READY_PROBES = 2;
const RESTART_RECOVERY_HOLD_RECHECK_TIMEOUT_MS = 15000;

class ClusterLoadOrchestration extends ClusterLifecycleBase {
  _formatRestartShutdownBoundary(observation) {
    if (!observation) {
      return 'none';
    }
    const activeNodeIds =
      Array.isArray(observation.peerActiveNodeIds) &&
      observation.peerActiveNodeIds.length > ZERO ?
        observation.peerActiveNodeIds.join('|') :
        'none';
    return (
      'containerState=' +
      String(observation.containerState || 'unknown') +
      ', containerRunning=' +
      String(observation.containerRunning ?? 'unknown') +
      ', reachable=' +
      String(observation.reachable ?? 'unknown') +
      ', adminReady=' +
      String(observation.adminReady ?? 'unknown') +
      ', reachableBy=' +
      String(observation.reachableBy || 'none') +
      ', peerObserved=' +
      String(observation.peerObserved ?? 'unknown') +
      ', peerObserver=' +
      String(observation.peerObserverNodeId || 'none') +
      ', peerCapturedAtMs=' +
      String(observation.peerCapturedAtMs ?? 'none') +
      ', peerActiveNodeIds=' +
      activeNodeIds +
      ', peerServeEligible=' +
      String(observation.peerServeEligible ?? 'unknown') +
      ', peerRepairEligible=' +
      String(observation.peerRepairEligible ?? 'unknown') +
      ', error=' +
      String(observation.error || 'none') +
      ', peerError=' +
      String(observation.peerError || 'none')
    );
  }

  _formatRestartShutdownObservation(observation) {
    if (!observation) {
      return 'none';
    }
    const activeNodeIds =
      Array.isArray(observation.activeNodeIds) &&
      observation.activeNodeIds.length > ZERO ?
        observation.activeNodeIds.join('|') :
        'none';
    return (
      'observer=' +
      String(observation.observerNodeId || 'none') +
      ', capturedAtMs=' +
      String(observation.capturedAtMs ?? 'none') +
      ', activeNodeIds=' +
      activeNodeIds +
      ', serveEligible=' +
      String(observation.serveEligible ?? 'unknown') +
      ', repairEligible=' +
      String(observation.repairEligible ?? 'unknown') +
      ', reachable=' +
      String(observation.reachable ?? 'unknown') +
      ', reachableBy=' +
      String(observation.reachableBy || 'none') +
      ', error=' +
      String(observation.error || 'none')
    );
  }

  _isNewerRestartShutdownObservation(candidate, current) {
    if (!candidate) {
      return false;
    }
    if (!current) {
      return true;
    }
    const candidateCapturedAtMs = Number.isFinite(candidate.capturedAtMs) ?
      candidate.capturedAtMs :
      -1;
    const currentCapturedAtMs = Number.isFinite(current.capturedAtMs) ?
      current.capturedAtMs :
      -1;
    if (candidateCapturedAtMs !== currentCapturedAtMs) {
      return candidateCapturedAtMs > currentCapturedAtMs;
    }
    if (candidate.error && !current.error) {
      return false;
    }
    if (!candidate.error && current.error) {
      return true;
    }
    return false;
  }

  async _probeRestartShutdownBoundary(targetNodeId, deadline) {
    const targetNode = this._nodes.get(targetNodeId) || null;
    if (!targetNode) {
      return {
        observed: false,
        containerState: null,
        containerRunning: null,
        reachable: null,
        adminReady: null,
        reachableBy: null,
        peerObserved: null,
        peerObserverNodeId: null,
        peerCapturedAtMs: null,
        peerActiveNodeIds: [],
        peerServeEligible: null,
        peerRepairEligible: null,
        error: 'Node "' + targetNodeId + '" not found in cluster',
        peerError: null,
      };
    }

    let containerState = null;
    let containerRunning = null;
    let error = null;

    if (
      this._dockerProvider &&
      typeof this._dockerProvider.inspectContainer === 'function' &&
      typeof targetNode.containerId === 'string' &&
      targetNode.containerId.length > ZERO
    ) {
      try {
        const inspect = await this._dockerProvider.inspectContainer(
          targetNode.containerId,
        );
        containerState =
          typeof inspect?.State?.Status === 'string' &&
          inspect.State.Status.length > ZERO ?
            inspect.State.Status :
            UNKNOWN_STATE;
        containerRunning = containerState === CONTAINER_RUNNING_STATUS;
      } catch (inspectError) {
        error = normalizeProbeError(inspectError);
        containerState = 'inspect_error';
      }
    }

    let diagnostics = null;
    try {
      diagnostics = await targetNode.getReachabilityDiagnostics({
        timeoutMs: Math.max(MIN_TIMEOUT_MS, deadline - Date.now()),
      });
    } catch (probeError) {
      if (!error) {
        error = normalizeProbeError(probeError);
      }
    }

    const reachable = diagnostics?.reachable === true;
    const adminReady = diagnostics?.adminReady === true;
    const observed =
      (containerRunning === false || containerRunning === null) &&
      reachable !== true &&
      adminReady !== true &&
      !error;

    return {
      observed,
      containerState,
      containerRunning,
      reachable,
      adminReady,
      reachableBy: diagnostics?.reachableBy || null,
      peerObserved: null,
      peerObserverNodeId: null,
      peerCapturedAtMs: null,
      peerActiveNodeIds: [],
      peerServeEligible: null,
      peerRepairEligible: null,
      error: error || diagnostics?.lastError || null,
      peerError: null,
    };
  }

  async _probeRestartShutdownObservation(targetNodeId, deadline) {
    const peerNodes = [...this._nodes.values()].filter(
      (node) => node?.id !== targetNodeId,
    );
    let bestObservation = null;
    let lastError = null;

    for (const peerNode of peerNodes) {
      const remainingMs = Math.max(MIN_TIMEOUT_MS, deadline - Date.now());
      const timeoutMs = Math.min(
        CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
        remainingMs,
      );
      try {
        const snapshotResult = await peerNode.getControlSnapshot({
          timeoutMs,
          lane: ADMIN_SOCKET_LANE_SNAPSHOT,
        });
        const snapshotPayload =
          this._extractControlSnapshotPayload(snapshotResult) || {};
        const snapshotSummary =
          this._extractControlSnapshotSummary(snapshotResult);
        const readinessByNodeId =
          snapshotPayload?.controlPlaneDiagnostics?.readinessByNodeId &&
          typeof snapshotPayload.controlPlaneDiagnostics.readinessByNodeId ===
            'object' ?
            snapshotPayload.controlPlaneDiagnostics.readinessByNodeId :
            {};
        const readiness = readinessByNodeId[targetNodeId] || null;
        const activeNodeIds = Array.isArray(snapshotSummary.nodes) ?
          snapshotSummary.nodes :
          [];
        const observed =
          !activeNodeIds.includes(targetNodeId) ||
          (readiness && readiness.serveEligible !== true);
        const observation = {
          observed,
          observerNodeId: peerNode.id,
          capturedAtMs: snapshotSummary.capturedAtMs,
          activeNodeIds,
          serveEligible: readiness?.serveEligible ?? null,
          repairEligible: readiness?.repairEligible ?? null,
          error: null,
        };
        if (observation.observed) {
          return observation;
        }
        if (
          this._isNewerRestartShutdownObservation(observation, bestObservation)
        ) {
          bestObservation = observation;
        }
      } catch (error) {
        lastError = normalizeProbeError(error);
      }
    }

    const targetNode = this._nodes.get(targetNodeId) || null;
    if (
      peerNodes.length === ZERO &&
      targetNode &&
      typeof targetNode.getReachabilityDiagnostics === 'function'
    ) {
      try {
        const diagnostics = await targetNode.getReachabilityDiagnostics({
          timeoutMs: Math.max(MIN_TIMEOUT_MS, deadline - Date.now()),
        });
        return {
          observed: diagnostics?.reachable !== true,
          observerNodeId: targetNodeId,
          capturedAtMs: null,
          activeNodeIds: [],
          serveEligible: null,
          repairEligible: null,
          reachable: diagnostics?.reachable === true,
          reachableBy: diagnostics?.reachableBy || null,
          error: diagnostics?.lastError || null,
        };
      } catch (error) {
        lastError = normalizeProbeError(error);
      }
    }

    return (
      bestObservation || {
        observed: false,
        observerNodeId: null,
        capturedAtMs: null,
        activeNodeIds: [],
        serveEligible: null,
        repairEligible: null,
        reachable: null,
        reachableBy: null,
        error: lastError || 'restart_shutdown_not_observed',
      }
    );
  }

  async _waitForRestartShutdownBoundary(targetNodeId) {
    const timeoutMs = this._resolveRestartShutdownObservationTimeoutMs();
    const deadline = Date.now() + timeoutMs;
    const pollResult = await pollUntilCondition({
      deadline,
      intervalMs: RESTART_POLL_INTERVAL_MS,
      sleep: (ms) => this._sleep(ms),
      probe: () => this._probeRestartShutdownBoundary(targetNodeId, deadline),
      isSuccess: (result) => result?.observed === true,
    });

    if (pollResult.success) {
      return;
    }

    let peerObservation = null;
    try {
      peerObservation = await this._probeRestartShutdownObservation(
        targetNodeId,
        Date.now() + CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
      );
    } catch (peerObservationError) {
      peerObservation = {
        observed: false,
        observerNodeId: null,
        capturedAtMs: null,
        activeNodeIds: [],
        serveEligible: null,
        repairEligible: null,
        error: normalizeProbeError(peerObservationError),
      };
    }

    const lastResult = {
      ...(pollResult.lastResult || {}),
      peerObserved: peerObservation?.observed === true,
      peerObserverNodeId: peerObservation?.observerNodeId || null,
      peerCapturedAtMs: peerObservation?.capturedAtMs ?? null,
      peerActiveNodeIds: Array.isArray(peerObservation?.activeNodeIds) ?
        peerObservation.activeNodeIds :
        [],
      peerServeEligible: peerObservation?.serveEligible ?? null,
      peerRepairEligible: peerObservation?.repairEligible ?? null,
      peerError: peerObservation?.error || null,
    };

    await this._collectFailureLogs();
    throw new Error(
      'Restart shutdown boundary was not observed within ' +
        timeoutMs +
        'ms for node ' +
        targetNodeId +
        ' (' +
        this._formatRestartShutdownBoundary(lastResult) +
        ')',
    );
  }

  async _waitForNodeAdminReadiness(targetNodeId, options = {}) {
    const node = this._nodes.get(targetNodeId);
    if (!node) {
      throw new Error('Node "' + targetNodeId + '" not found in cluster');
    }
    const timeoutOverrideMs = Number(options?.readinessTimeoutMs);
    const timeoutMs =
      Number.isFinite(timeoutOverrideMs) && timeoutOverrideMs > ZERO ?
        Math.max(MIN_TIMEOUT_MS, Math.floor(timeoutOverrideMs)) :
        this._resolveRestartAdminReadinessTimeoutMs();
    const expectedPublicationEpoch =
      Number.isInteger(options?.expectedPublicationEpoch) &&
      options.expectedPublicationEpoch > ZERO ?
        options.expectedPublicationEpoch :
        null;
    const requireAdminReady = options?.requireAdminReady === true;
    const deadline = Date.now() + timeoutMs;
    let consecutiveReadyProbeCount = 0;
    const pollResult = await pollUntilCondition({
      deadline,
      intervalMs: RESTART_POLL_INTERVAL_MS,
      sleep: (ms) => this._sleep(ms),
      probe: async () => {
        try {
          const diagnostics = await node.getReachabilityDiagnostics({
            timeoutMs: Math.max(MIN_TIMEOUT_MS, deadline - Date.now()),
          });
          const ready = evaluateRestartRecoveryReadiness({
            diagnostics,
            requireAdminReady,
            expectedPublicationEpoch,
          });
          consecutiveReadyProbeCount = ready ?
            consecutiveReadyProbeCount + 1 :
            ZERO;
          return {
            ...diagnostics,
            ready,
            consecutiveReadyProbeCount,
          };
        } catch (error) {
          consecutiveReadyProbeCount = ZERO;
          return {
            nodeId: targetNodeId,
            ready: false,
            adminReady: false,
            controlPlaneRecoveryReady: false,
            recoveryStage: null,
            recoveryStageRank: null,
            reachable: false,
            reachableBy: null,
            lastError: normalizeProbeError(error),
          };
        }
      },
      isSuccess: (result) =>
        result?.ready === true &&
        result?.consecutiveReadyProbeCount >=
          RESTART_RECOVERY_CONSECUTIVE_READY_PROBES,
    });

    if (pollResult.success) {
      return;
    }

    await this._collectFailureLogs();
    const lastResult = pollResult.lastResult || {};
    throw new Error(
      'Restarted node did not become recovery-ready within ' +
        timeoutMs +
        'ms for node ' +
        targetNodeId +
        ' (' +
        this._formatRestartRecoveryReadinessObservation(
          lastResult,
          expectedPublicationEpoch,
        ) +
        ')',
    );
  }

  /**
   * Re-verify that a restarted node still satisfies the recovery-ready
   * predicate after the post-restart boundary snapshot. A node whose process
   * exits right after the readiness wait must fail the restart action loudly
   * instead of being declared recovered (CL-025).
   * @param {string} targetNodeId
   * @param {Object} [options={}]
   * @return {Promise<void>}
   */
  async _assertRestartedNodeRecoveryHeld(targetNodeId, options = {}) {
    const configuredRecheckTimeoutMs = Number(
      this._config?.timeouts?.restartRecoveryHoldRecheckMs,
    );
    const recheckTimeoutMs =
      Number.isFinite(configuredRecheckTimeoutMs) &&
      configuredRecheckTimeoutMs > ZERO ?
        Math.floor(configuredRecheckTimeoutMs) :
        RESTART_RECOVERY_HOLD_RECHECK_TIMEOUT_MS;
    try {
      await this._waitForNodeAdminReadiness(targetNodeId, {
        ...options,
        readinessTimeoutMs: recheckTimeoutMs,
      });
    } catch (error) {
      throw new Error(
        'Restarted node lost recovery readiness after the post-restart ' +
          'boundary for node ' +
          targetNodeId +
          ': ' +
          (error?.message || String(error)),
      );
    }
  }

  _formatRestartRecoveryReadinessObservation(
    observation,
    expectedPublicationEpoch,
  ) {
    const bootstrapReadiness =
      observation?.bootstrapReadiness &&
      typeof observation.bootstrapReadiness === 'object' ?
        observation.bootstrapReadiness :
        null;
    const readinessReasons =
      Array.isArray(bootstrapReadiness?.reasons) &&
      bootstrapReadiness.reasons.length > ZERO ?
        bootstrapReadiness.reasons.join(RESTART_RECOVERY_REASON_SEPARATOR) :
        RESTART_RECOVERY_FIELD_NONE;
    const bootstrapJoinProjection =
      bootstrapReadiness?.bootstrapJoinProjection &&
      typeof bootstrapReadiness.bootstrapJoinProjection === 'object' ?
        bootstrapReadiness.bootstrapJoinProjection :
        null;
    const seedContact =
      bootstrapReadiness?.seedContact &&
      typeof bootstrapReadiness.seedContact === 'object' ?
        bootstrapReadiness.seedContact :
        null;
    const startupRuntimeHandoff =
      observation?.startupRuntimeHandoff &&
      typeof observation.startupRuntimeHandoff === 'object' ?
        observation.startupRuntimeHandoff :
        bootstrapReadiness?.startupRuntimeHandoff &&
          typeof bootstrapReadiness.startupRuntimeHandoff === 'object' ?
          bootstrapReadiness.startupRuntimeHandoff :
          null;
    return (
      'reachable=' +
      String(observation.reachable === true) +
      ', ready=' +
      String(observation.ready === true) +
      ', adminReady=' +
      String(observation.adminReady === true) +
      ', controlPlaneRecoveryReady=' +
      String(observation.controlPlaneRecoveryReady === true) +
      ', publishedControlPlaneEpoch=' +
      String(observation.publishedControlPlaneEpoch ?? UNKNOWN_STATE) +
      ', expectedPublicationEpoch=' +
      String(expectedPublicationEpoch ?? RESTART_RECOVERY_FIELD_NONE) +
      ', readinessPhase=' +
      String(bootstrapReadiness?.phase || UNKNOWN_STATE) +
      ', readinessStage=' +
      String(observation.readinessStage || UNKNOWN_STATE) +
      ', readinessStageRank=' +
      String(observation.readinessStageRank ?? UNKNOWN_STATE) +
      ', readinessReasons=' +
      readinessReasons +
      ', recoveryStage=' +
      String(observation.recoveryStage || UNKNOWN_STATE) +
      ', ' +
      RESTART_RECOVERY_FIELD_BOOTSTRAP_JOIN_PROJECTION_BLOCKER +
      '=' +
      String(
        bootstrapJoinProjection?.blockerReason ||
          RESTART_RECOVERY_FIELD_NONE,
      ) +
      ', ' +
      RESTART_RECOVERY_FIELD_BOOTSTRAP_JOIN_PROJECTION_RULE +
      '=' +
      String(
        bootstrapJoinProjection?.projectionRule ||
          RESTART_RECOVERY_FIELD_NONE,
      ) +
      RESTART_RECOVERY_FIELD_SEPARATOR +
      RESTART_RECOVERY_FIELD_STARTUP_PHASE +
      RESTART_RECOVERY_FIELD_VALUE_SEPARATOR +
      String(seedContact?.phase || RESTART_RECOVERY_FIELD_NONE) +
      RESTART_RECOVERY_FIELD_SEPARATOR +
      RESTART_RECOVERY_FIELD_SEED_CONTACT_OUTCOME +
      RESTART_RECOVERY_FIELD_VALUE_SEPARATOR +
      String(seedContact?.lastOutcome || RESTART_RECOVERY_FIELD_NONE) +
      RESTART_RECOVERY_FIELD_SEPARATOR +
      RESTART_RECOVERY_FIELD_SEED_CONTACT_ATTEMPT +
      RESTART_RECOVERY_FIELD_VALUE_SEPARATOR +
      String(seedContact?.attempt ?? RESTART_RECOVERY_FIELD_NONE) +
      RESTART_RECOVERY_FIELD_SEPARATOR +
      RESTART_RECOVERY_FIELD_SEED_CONTACT_REMAINING_BUDGET_MS +
      RESTART_RECOVERY_FIELD_VALUE_SEPARATOR +
      String(seedContact?.remainingBudgetMs ?? RESTART_RECOVERY_FIELD_NONE) +
      RESTART_RECOVERY_FIELD_SEPARATOR +
      RESTART_RECOVERY_FIELD_SEED_CONTACT_AUTHORITY_SOURCE +
      RESTART_RECOVERY_FIELD_VALUE_SEPARATOR +
      String(seedContact?.authoritySource || RESTART_RECOVERY_FIELD_NONE) +
      RESTART_RECOVERY_FIELD_SEPARATOR +
      RESTART_RECOVERY_FIELD_CANONICAL_AUTHORITY_CONSUMED +
      RESTART_RECOVERY_FIELD_VALUE_SEPARATOR +
      String(
        startupRuntimeHandoff?.canonicalAuthorityConsumed ??
          RESTART_RECOVERY_FIELD_NONE,
      ) +
      RESTART_RECOVERY_FIELD_SEPARATOR +
      RESTART_RECOVERY_FIELD_TRANSACTION_RECOVERY_STATE +
      RESTART_RECOVERY_FIELD_VALUE_SEPARATOR +
      String(
        startupRuntimeHandoff?.transactionRecoveryState ||
          RESTART_RECOVERY_FIELD_NONE,
      ) +
      RESTART_RECOVERY_FIELD_SEPARATOR +
      RESTART_RECOVERY_FIELD_TRANSACTION_RECOVERY_READY +
      RESTART_RECOVERY_FIELD_VALUE_SEPARATOR +
      String(
        startupRuntimeHandoff?.transactionRecoveryReady ??
          RESTART_RECOVERY_FIELD_NONE,
      ) +
      ', reachableBy=' +
      String(observation.reachableBy || RESTART_RECOVERY_FIELD_NONE) +
      ', lastError=' +
      String(observation.lastError || RESTART_RECOVERY_FIELD_NONE)
    );
  }

  async partitionNetwork(groupA, groupB) {
    return this._runChaosAction(
      'partitionNetwork',
      'network',
      {groupA, groupB},
      () => this._chaos.partitionNetwork(groupA, groupB),
    );
  }

  async healPartition() {
    return this._runChaosAction('healPartition', 'network', null, () =>
      this._chaos.healPartition(),
    );
  }

  async slowNetwork(nodeId, options) {
    return this._runChaosAction('slowNetwork', nodeId, options, () =>
      this._chaos.slowNetwork(nodeId, options),
    );
  }

  async clearNetworkSlowdown(nodeId) {
    return this._runChaosAction('clearNetworkSlowdown', nodeId, null, () =>
      this._chaos.clearNetworkSlowdown(nodeId),
    );
  }

  async corruptDisk(nodeId, path) {
    return this._runChaosAction('corruptDisk', nodeId, {path}, () =>
      this._chaos.corruptDisk(nodeId, path),
    );
  }

  async fillDisk(nodeId, options = {}) {
    return this._runChaosAction('fillDisk', nodeId, options, () =>
      this._chaos.fillDisk(nodeId, options),
    );
  }

  async releaseDiskPressure(nodeId, options = {}) {
    return this._runChaosAction('releaseDiskPressure', nodeId, options, () =>
      this._chaos.releaseDiskPressure(nodeId, options),
    );
  }

  // S6 live rebuild: destroy one replica's durable state (db + WAL/SHM sidecars
  // + checkpoints dir) inside the container so a restarted node must rebuild it
  // from a leader snapshot transfer. The node must be stopped first (no open
  // handle). options: {partitionId, replicaId}.
  async wipeReplicaData(nodeId, options = {}) {
    return this._runChaosAction('wipeReplicaData', nodeId, options, () =>
      this._chaos.wipeReplicaData(nodeId, options),
    );
  }

  async resolveBenchmarkLoadAdmissionSnapshot(options = {}) {
    const nodes = Array.from(this._nodes.values());
    if (nodes.length === ZERO) {
      return buildBenchmarkLoadAdmissionSnapshot();
    }
    const timeoutMs = resolvePositiveTimeoutMs(
      options?.timeoutMs,
      ADMIN_QUERY_TIMEOUT_MS,
    );
    const discoverySql = buildServiceDiscoverySql({
      tableName: options?.tableName,
      tableId: options?.tableId,
    });
    const loadAdmissionProbeSql = buildLoadLaneTableAdmissionProbeSql(
      options?.tableName,
    );
    const requiredPublicationEpoch =
      Number.isInteger(options?.requiredPublicationEpoch) &&
      options.requiredPublicationEpoch > ZERO ?
        options.requiredPublicationEpoch :
        null;
    const allowRoutedNodeLoadLaneFallback =
      this._config?.benchmark?.strictDiscovery === false;
    const criticalControlPlaneStability =
      await this.resolveBenchmarkCriticalControlPlaneStabilitySnapshot({
        timeoutMs,
        forceRepair: options.forceRepair === true,
      });
    const evaluations = [];

    for (const node of nodes) {
      if (!node || typeof node !== 'object') {
        continue;
      }
      try {
        let discoverySnapshot = null;
        let discoveryError = null;
        try {
          discoverySnapshot =
            typeof node.queryWithTimeout === 'function' ?
              await node.queryWithTimeout(discoverySql, [], {
                lane: ADMIN_SOCKET_LANE_SNAPSHOT,
                timeoutMs,
              }) :
              await node.query(discoverySql, []);
        } catch (error) {
          discoveryError = error;
        }
        const localDiscoveryAdmission = discoverySnapshot ?
          inspectLocalBenchmarkAdmissionFromDiscovery(
            discoverySnapshot,
            node.id,
          ) :
          {
            localReplicaSeen: false,
            localAdmissionReady: false,
            loadLaneProbeEligible: false,
            readyNodeId: '',
            routingReady: false,
            schemaReady: false,
            topologyReady: false,
            localReplicaRole: BENCHMARK_ADMISSION_LOCAL_REPLICA_ROLE_UNKNOWN,
            localReplicaVoterReady: false,
            leadershipStable: false,
            degradationState: BENCHMARK_ADMISSION_DEGRADATION_STATE_HEALTHY,
            degradedByOperationIds: [],
            discoveryReasonDetails: [],
            discoveryReasonCodes: [],
          };
        let diagnostics = null;
        if (typeof node.getReachabilityDiagnostics === 'function') {
          try {
            diagnostics = await node.getReachabilityDiagnostics({
              timeoutMs,
            });
          } catch (_error) {
            diagnostics = null;
          }
        }
        const admissionCheckEligible =
          !diagnostics ||
          diagnostics.adminReady === true ||
          diagnostics.controlPlaneRecoveryReady === true;
        const discoveryPressured =
          discoverySnapshot === null &&
          isRetryableBenchmarkAdmissionError(discoveryError);
        const discoveryRetryAfterMs = normalizeBenchmarkAdmissionRetryAfterMs(
          discoveryError?.retryAfterMs,
        );
        const localAdmissionReady =
          localDiscoveryAdmission.localAdmissionReady === true;
        const routedNodeLoadLaneFallback =
          !localAdmissionReady &&
          !discoveryPressured &&
          allowRoutedNodeLoadLaneFallback &&
          discoverySnapshot !== null &&
          localDiscoveryAdmission.localReplicaSeen !== true;
        const evaluationOptions = {
          node,
          nodeId: node.id,
          localReplicaSeen: localDiscoveryAdmission.localReplicaSeen,
          localAdmissionReady,
          admissionReady: false,
          admissionCheckEligible,
          discoveryPressured,
          routingReady: localDiscoveryAdmission.routingReady === true,
          schemaReady: localDiscoveryAdmission.schemaReady === true,
          topologyReady: localDiscoveryAdmission.topologyReady === true,
          localReplicaRole: localDiscoveryAdmission.localReplicaRole,
          localReplicaVoterReady:
            localDiscoveryAdmission.localReplicaVoterReady === true,
          leadershipStable: localDiscoveryAdmission.leadershipStable === true,
          degradationState: localDiscoveryAdmission.degradationState,
          degradedByOperationIds:
            localDiscoveryAdmission.degradedByOperationIds,
          discoveryReasonDetails:
            localDiscoveryAdmission.discoveryReasonDetails,
          discoveryReasonCodes: localDiscoveryAdmission.discoveryReasonCodes,
          loadLaneReasonCodes: [],
          retryAfterMs: discoveryRetryAfterMs,
          reasonCodes: collectBenchmarkAdmissionReasonCodes(
            localDiscoveryAdmission.discoveryReasonCodes,
            discoveryPressured ?
              BENCHMARK_LOAD_ADMISSION_REASON_DISCOVERY_PRESSURED :
              '',
          ),
        };
        if (!admissionCheckEligible) {
          evaluations.push(
            buildBenchmarkLoadAdmissionEvaluation({
              ...evaluationOptions,
              reasonCodes: collectBenchmarkAdmissionReasonCodes(
                evaluationOptions.reasonCodes,
                BENCHMARK_LOAD_ADMISSION_REASON_RECOVERY_GATE_CLOSED,
              ),
            }),
          );
          continue;
        }
        if (requiredPublicationEpoch !== null) {
          const publishedControlPlaneEpoch = Number(
            diagnostics?.publishedControlPlaneEpoch,
          );
          if (publishedControlPlaneEpoch !== requiredPublicationEpoch) {
            evaluations.push(
              buildBenchmarkLoadAdmissionEvaluation({
                ...evaluationOptions,
                reasonCodes: collectBenchmarkAdmissionReasonCodes(
                  evaluationOptions.reasonCodes,
                  BENCHMARK_LOAD_ADMISSION_REASON_PUBLICATION_EPOCH_MISMATCH,
                ),
              }),
            );
            continue;
          }
        }
        const loadLaneProbeEligible =
          localAdmissionReady ||
          discoveryPressured ||
          routedNodeLoadLaneFallback ||
          localDiscoveryAdmission.loadLaneProbeEligible === true;
        if (!loadLaneProbeEligible) {
          evaluations.push(
            buildBenchmarkLoadAdmissionEvaluation(evaluationOptions),
          );
          continue;
        }
        const loadLaneAdmission = await verifyBenchmarkLoadLaneAdmission(
          node,
          loadAdmissionProbeSql,
          timeoutMs,
        );
        evaluations.push(
          buildBenchmarkLoadAdmissionEvaluation({
            ...evaluationOptions,
            admissionReady: loadLaneAdmission.admissionReady === true,
            loadLaneReasonCodes: loadLaneAdmission.reasonCodes,
            retryAfterMs: Math.max(
              evaluationOptions.retryAfterMs,
              loadLaneAdmission.retryAfterMs,
            ),
            reasonCodes:
              loadLaneAdmission.admissionReady === true ?
                evaluationOptions.reasonCodes :
                collectBenchmarkAdmissionReasonCodes(
                  evaluationOptions.reasonCodes,
                  loadLaneAdmission.reasonCodes,
                ),
          }),
        );
      } catch (error) {
        evaluations.push(
          buildBenchmarkLoadAdmissionEvaluation({
            node,
            nodeId: node.id,
            localReplicaSeen: false,
            localAdmissionReady: false,
            admissionReady: false,
            admissionCheckEligible: true,
            discoveryPressured: isRetryableBenchmarkAdmissionError(error),
            retryAfterMs: normalizeBenchmarkAdmissionRetryAfterMs(
              error?.retryAfterMs,
            ),
            discoveryReasonCodes:
              extractBenchmarkAdmissionReasonCodesFromError(error),
            reasonCodes: collectBenchmarkAdmissionReasonCodes(
              extractBenchmarkAdmissionReasonCodesFromError(error),
              isRetryableBenchmarkAdmissionError(error) ?
                BENCHMARK_LOAD_ADMISSION_REASON_DISCOVERY_PRESSURED :
                '',
            ),
          }),
        );
      }
    }

    return buildBenchmarkLoadAdmissionSnapshot({
      criticalControlPlaneStability,
      evaluations,
    });
  }

  async resolveBenchmarkCriticalControlPlaneStabilitySnapshot(options = {}) {
    const expectedNodeIds = Array.from(this._nodes.keys())
      .map((nodeId) => String(nodeId || '').trim())
      .filter((nodeId) => nodeId.length > ZERO);
    if (expectedNodeIds.length === ZERO) {
      return buildBenchmarkCriticalControlPlaneStabilitySnapshot();
    }
    const timeoutMs = resolvePositiveTimeoutMs(
      options?.timeoutMs,
      ADMIN_QUERY_TIMEOUT_MS,
    );
    try {
      const snapshotCoverage = await this._probeControlSnapshotCoverage(
        Date.now() + timeoutMs,
        expectedNodeIds,
        {
          forceRepair: options?.forceRepair === true,
          readinessMode: CLUSTER_READINESS_MODE_LOAD,
        },
      );
      const publicationConvergenceGate = evaluateLoadPublishedConvergence(
        snapshotCoverage,
        expectedNodeIds,
      );
      const hasCoverageWitness =
        Number.isInteger(snapshotCoverage?.bestCoverageNodeCount) &&
        snapshotCoverage.bestCoverageNodeCount > ZERO;
      const selectedError =
        typeof snapshotCoverage?.selectedError === 'string' &&
        snapshotCoverage.selectedError.length > ZERO ?
          snapshotCoverage.selectedError :
          null;
      return buildBenchmarkCriticalControlPlaneStabilitySnapshot({
        publicationConvergenceGate,
        controlPlaneOwnerQueueDepth:
          snapshotCoverage?.selectedControlPlaneOwnerQueueDepth,
        cdcReplayLag: snapshotCoverage?.selectedCdcReplayLag,
        snapshotUnavailable:
          hasCoverageWitness !== true && selectedError !== null,
        snapshotCoverageComplete: snapshotCoverage?.completeCoverage === true,
        snapshotCoverageNodeCount: snapshotCoverage?.bestCoverageNodeCount,
        expectedNodeCount: expectedNodeIds.length,
        selectedNodeId: snapshotCoverage?.selectedSnapshotNodeId,
        controlPlaneDiagnosticsAvailable:
          snapshotCoverage?.selectedControlPlaneDiagnosticsAvailable === true,
        selectedError,
      });
    } catch (error) {
      return buildBenchmarkCriticalControlPlaneStabilitySnapshot({
        snapshotUnavailable: true,
        expectedNodeCount: expectedNodeIds.length,
        selectedError: String(error?.message || error || ''),
      });
    }
  }

  async resolveBenchmarkReadyLoadNodes(options = {}) {
    const snapshot = await this.resolveBenchmarkLoadAdmissionSnapshot(options);
    return Array.isArray(snapshot?.admissionReadyNodes) ?
      snapshot.admissionReadyNodes :
      [];
  }

  async waitForBenchmarkReadyLoadNodes(options = {}) {
    const minNodeCount =
      Number.isInteger(options?.minNodeCount) && options.minNodeCount > ZERO ?
        options.minNodeCount :
        ONE;
    const stableWindowMs = resolvePositiveTimeoutMs(
      options?.stableWindowMs,
      LOAD_READINESS_STABLE_WINDOW_MS,
    );
    const timeoutMs = resolvePositiveTimeoutMs(
      options?.timeoutMs,
      LOAD_READINESS_STABILITY_TIMEOUT_MS,
    );
    const pollIntervalMs = resolvePositiveTimeoutMs(
      options?.pollIntervalMs,
      ACTIVE_POLL_INTERVAL_MS,
    );
    const tableName =
      typeof options?.tableName === 'string' ? options.tableName.trim() : '';
    const deadlineAtMs = Date.now() + timeoutMs;
    let readySinceMs = null;
    let lastReadyNodes = [];
    const sleep =
      typeof this._sleep === 'function' ?
        (ms) => this._sleep(ms) :
        (ms) =>
          new Promise((resolve) => {
            setTimeout(resolve, ms);
          });

    while (true) {
      const readyNodes = await this.resolveBenchmarkReadyLoadNodes({
        tableName,
        tableId: options?.tableId,
        timeoutMs: options?.queryTimeoutMs,
      });
      lastReadyNodes = readyNodes;

      if (readyNodes.length >= minNodeCount) {
        const nowMs = Date.now();
        if (stableWindowMs <= ZERO) {
          return readyNodes;
        }
        if (readySinceMs === null) {
          readySinceMs = nowMs;
        }
        if (nowMs - readySinceMs >= stableWindowMs) {
          return readyNodes;
        }
      } else {
        readySinceMs = null;
      }

      const nowMs = Date.now();
      if (nowMs > deadlineAtMs && readySinceMs === null) {
        break;
      }

      await sleep(pollIntervalMs);
    }

    throw new Error(
      'Timed out after ' +
        timeoutMs +
        'ms waiting for at least ' +
        minNodeCount +
        ' benchmark-ready load nodes' +
        (tableName.length > ZERO ? ' for table ' + tableName : '') +
        '; lastReadyNodeCount=' +
        lastReadyNodes.length,
    );
  }
}

export {ClusterLoadOrchestration};
