import {CLUSTER_CLASS_SHARED_CONTEXT} from './cluster-class-shared-context.js';
import {ASSERTIONS_CONVERGENCE_WAIT} from './assertions-convergence-wait.js';
import {
  CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE,
  buildControlPlaneQuiescencePressureSignalsFromDiagnostics,
} from './control-plane-quiescence-snapshot.js';
import {
  ACTIVE_WAIT_TIMEOUT_EVENT_INTERVAL_DIVISOR,
  CONTROL_SNAPSHOT_DEFAULT_PROBE_TIMEOUT_SCALE,
  CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_UNAVAILABLE,
  CONTROL_SNAPSHOT_MISSING_ROWS_ERROR,
  CONTROL_SNAPSHOT_NO_CANDIDATES_ERROR,
  CONTROL_SNAPSHOT_PRIORITY_RECOVERY_DECISION_SNAPSHOTS_UNAVAILABLE,
  CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_UNAVAILABLE,
  CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_GATE_UNAVAILABLE,
  CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_UNAVAILABLE,
  CONTROL_SNAPSHOT_REACHABILITY_SOURCE,
  CONTROL_SNAPSHOT_REVISION_STATE_UNAVAILABLE,
  CONTROL_SNAPSHOT_RETRY_REASON_NOT_APPLICABLE,
  CONTROL_SNAPSHOT_STARTUP_PROBE_TIMEOUT_SCALE,
  CRITICAL_SYSTEM_READY_NODE_IDS_UNAVAILABLE,
  SERVICE_DISCOVERY_NO_CANDIDATES_ERROR,
  TYPEOF_BOOLEAN,
  TYPEOF_STRING,
  aggregateControlSnapshotOwnerRecoveryWitnesses,
  buildControlSnapshotObservationSummary,
  buildControlSnapshotRetryObservationSummary,
  buildTerminalControlSnapshotActiveGateHandoff,
  buildTerminalControlSnapshotRecoveryProgress,
  buildWaitOwnerRecoveryQueueProjection,
  controlSnapshotOwnerRecoveryAllowsBoundedReturn,
  controlSnapshotReasonAllowsActiveGateHandoff,
  hasControlSnapshotReachabilityFallback,
  resetSnapshotLaneAfterTimeout,
  resolveSnapshotRetryReason,
  resolveSnapshotRetryTimeoutMs,
  resolveSnapshotTerminalObservationReason,
  resolveTerminalSnapshotRetryReason,
  selectAlternativeSnapshotWitness,
} from './cluster-control-snapshot-recovery.js';
const {
  countCacheVisibleSatisfiedPriorityRecoveryOperations,
} = ASSERTIONS_CONVERGENCE_WAIT;

const {
  ACTIVE_POLL_INTERVAL_MS,
  ACTIVE_WAIT_MIN_CLUSTER_SIZE,
  ACTIVE_WAIT_TIMEOUT_MAX_MULTIPLIER,
  ACTIVE_WAIT_TIMEOUT_SCALE_PERCENT_DENOMINATOR,
  ACTIVE_WAIT_TIMEOUT_SCALE_PERCENT_PER_EXTRA_NODE,
  ADMIN_QUERY_TIMEOUT_MS,
  ADMIN_SOCKET_LANE_SNAPSHOT,
  BENCHMARK_DEFAULTS,
  CLUSTER_READINESS_MODE_LOAD,
  CLUSTER_READINESS_MODE_STARTUP,
  CONTROL_PLANE_QUIESCENCE_CRITICAL_TABLES,
  CONTROL_SNAPSHOT_LATE_PROBE_TIMEOUT_FLOOR_MS,
  CONTROL_SNAPSHOT_LATE_REACHABILITY_TIMEOUT_FLOOR_MS,
  CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
  CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS,
  LOAD_READINESS_STABILITY_TIMEOUT_MS,
  LOAD_READINESS_STABLE_WINDOW_MS,
  MIN_TIMEOUT_MS,
  NODE_ROLES,
  ONE,
  STARTUP_GATE_WAITING_EVENT_INTERVAL,
  TIMEOUTS,
  ZERO,
  buildReplicaOperationTimelineSignature,
  buildServiceDiscoverySql,
  extractCriticalSystemDiscoverySummary,
  isBetterControlSnapshotCandidate,
  isBetterCriticalSystemDiscoveryCandidate,
  isTimeoutShapedProbeError,
  normalizeDistinctStringArray,
  normalizeProbeError,
  normalizeReplicaOperationPartitionGroupInFlight,
  parseFiniteNumberField,
  resolveMeaningfulProbeTimeoutMs,
  resolveSequentialProbeTimeoutMs,
  withTimeout,
} = CLUSTER_CLASS_SHARED_CONTEXT;
import {ClusterPublicationEvidence} from './cluster-class-publication-evidence.js';

const LOAD_REACHABILITY_PREFLIGHT_RANK_UNKNOWN = 2;
const LOAD_REACHABILITY_PREFLIGHT_RANK_NOT_READY = 3;
const ACTIVE_GATE_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY =
  'wait_owner_recovery';

function loadSelectedRetryNeedsRemainingWitnessPass(result = null) {
  return (
    result?.snapshotTimeoutEncountered === true &&
    result?.snapshotRepairDeferred === true &&
    result?.adminReady === true &&
    result?.controlPlaneDiagnosticsAvailable !== true &&
    result?.publicationActiveGateHandoff?.nextAction ===
      ACTIVE_GATE_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY &&
    result?.missingExpectedNodeCount > ZERO
  );
}

function resolveLoadRemainingWitnessSnapshotTimeoutMs(result = null) {
  const retryAfterMs = parseFiniteNumberField(
    result?.snapshotObservationRetryAfterMs,
  );
  if (retryAfterMs !== null) {
    return Math.max(MIN_TIMEOUT_MS, Math.floor(retryAfterMs));
  }
  const snapshotTimeoutMs = parseFiniteNumberField(result?.snapshotTimeoutMs);
  return snapshotTimeoutMs !== null ?
    Math.max(MIN_TIMEOUT_MS, Math.floor(snapshotTimeoutMs)) :
    MIN_TIMEOUT_MS;
}

function resolveQuiescenceSequentialProbeTimeoutMs(
  deadline,
  remainingProbeCount,
  maxTimeoutMs,
) {
  const fairShareTimeoutMs = resolveSequentialProbeTimeoutMs(
    deadline,
    remainingProbeCount,
    maxTimeoutMs,
  );
  const lateProbeTimeoutFloorMs = Math.min(
    Math.max(MIN_TIMEOUT_MS, Math.floor(maxTimeoutMs || MIN_TIMEOUT_MS)),
    CONTROL_SNAPSHOT_LATE_PROBE_TIMEOUT_FLOOR_MS,
  );
  return Math.max(fairShareTimeoutMs, lateProbeTimeoutFloorMs);
}

class ClusterControlSnapshotRecovery extends ClusterPublicationEvidence {
  async _probeControlSnapshotCoverage(
    deadline,
    expectedNodeIds = [],
    options = {},
  ) {
    const readinessMode =
      options.readinessMode === CLUSTER_READINESS_MODE_LOAD ?
        CLUSTER_READINESS_MODE_LOAD :
        CLUSTER_READINESS_MODE_STARTUP;
    const startupProbeTimeoutScale =
      readinessMode === CLUSTER_READINESS_MODE_STARTUP ?
        CONTROL_SNAPSHOT_STARTUP_PROBE_TIMEOUT_SCALE :
        CONTROL_SNAPSHOT_DEFAULT_PROBE_TIMEOUT_SCALE;
    const expectedNodeSet = new Set(
      expectedNodeIds.map((nodeId) => String(nodeId)),
    );
    const nodes = [...this._nodes.values()];
    nodes.sort((left, right) => {
      const leftRank = left.role === NODE_ROLES.SEED ? 0 : 1;
      const rightRank = right.role === NODE_ROLES.SEED ? 0 : 1;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return String(left.id).localeCompare(String(right.id));
    });

    const resolveSnapshotProbeTimeoutMs = (maxTimeoutMs) => {
      const effectiveMaxTimeoutMs = maxTimeoutMs * startupProbeTimeoutScale;
      return resolveMeaningfulProbeTimeoutMs(
        deadline,
        effectiveMaxTimeoutMs,
        CONTROL_SNAPSHOT_LATE_PROBE_TIMEOUT_FLOOR_MS,
      );
    };
    const resolveReachabilityProbeTimeoutMs = (maxTimeoutMs) => {
      const effectiveMaxTimeoutMs = maxTimeoutMs * startupProbeTimeoutScale;
      return resolveMeaningfulProbeTimeoutMs(
        deadline,
        effectiveMaxTimeoutMs,
        CONTROL_SNAPSHOT_LATE_REACHABILITY_TIMEOUT_FLOOR_MS,
      );
    };
    const queryReachabilityDiagnostics = async (
      node,
      reachabilityTimeoutMs,
    ) => {
      if (typeof node.getReachabilityDiagnostics !== 'function') {
        return {
          diagnostics: null,
          error: null,
        };
      }
      try {
        return {
          diagnostics: await withTimeout(
            node.getReachabilityDiagnostics({
              timeoutMs: reachabilityTimeoutMs,
              skipBootstrapReadiness: true,
            }),
            reachabilityTimeoutMs,
            'Control snapshot reachability probe timed out for ' + node.id,
          ),
          error: null,
        };
      } catch (error) {
        return {
          diagnostics: null,
          error: normalizeProbeError(error),
        };
      }
    };
    const loadReachabilityPreflightByNodeId = new Map();
    const probeNodeSnapshotCoverage = async (
      node,
      snapshotTimeoutMs,
      reachabilityTimeoutMs,
    ) => {
      let reachabilityDiagnostics = null;
      let reachabilityError = null;
      const buildSuccessfulSnapshotCoverageResult = (
        snapshotResult,
        successfulSnapshotTimeoutMs = snapshotTimeoutMs,
        snapshotTimeoutEncountered = false,
      ) => {
        const snapshotPayload =
          this._extractControlSnapshotPayload(snapshotResult);
        const snapshotSummary =
          this._extractControlSnapshotSummary(snapshotResult);
        const snapshotObservationSummary =
          buildControlSnapshotObservationSummary(snapshotPayload);
        const snapshotDiagnostics =
          this._extractControlSnapshotCoverageDiagnostics(snapshotResult);
        const publicationConvergence =
          snapshotDiagnostics.publicationConvergence || null;
        const publicationConvergenceGate =
          snapshotDiagnostics.publicationConvergenceGate || null;
        const publishedActiveNodeIds = normalizeDistinctStringArray(
          publicationConvergence?.publishedActiveNodeIds,
        );
        const pendingAckNodeIds = normalizeDistinctStringArray(
          publicationConvergenceGate?.pendingAckNodeIds ??
            publicationConvergence?.pendingAckNodeIds,
        );
        const missingPublishedNodeIds = [...expectedNodeSet]
          .filter((expectedNodeId) => {
            return !publishedActiveNodeIds.includes(expectedNodeId);
          })
          .sort();
        const observedNodeIds = snapshotSummary.nodes;
        const observedNodeSet = new Set(observedNodeIds);
        let missingExpectedNodeCount = ZERO;
        for (const expectedNodeId of expectedNodeSet) {
          if (!observedNodeSet.has(expectedNodeId)) {
            missingExpectedNodeCount += 1;
          }
        }
        return {
          nodeId: node.id,
          error: null,
          snapshotTimeoutMs: successfulSnapshotTimeoutMs,
          reachabilityTimeoutMs,
          adminReady: reachabilityDiagnostics?.adminReady === true,
          reachable: reachabilityDiagnostics?.reachable === true,
          reachableBy:
            typeof reachabilityDiagnostics?.reachableBy === 'string' &&
            reachabilityDiagnostics.reachableBy.length > ZERO ?
              reachabilityDiagnostics.reachableBy :
              null,
          reachabilityError:
            typeof reachabilityDiagnostics?.lastError === 'string' &&
            reachabilityDiagnostics.lastError.length > ZERO ?
              reachabilityDiagnostics.lastError :
              reachabilityError,
          observedNodeCount: observedNodeSet.size,
          missingExpectedNodeCount,
          capturedAtMs: snapshotSummary.capturedAtMs,
          snapshotRevision: snapshotSummary.snapshotRevision,
          snapshotRevisionState: snapshotSummary.snapshotRevisionState,
          snapshotExpectedMinimumRevision:
            snapshotSummary.snapshotExpectedMinimumRevision,
          snapshotRevisionGap: snapshotSummary.snapshotRevisionGap,
          snapshotResumeToken: snapshotSummary.snapshotResumeToken,
          ...snapshotObservationSummary,
          snapshotTimeoutEncountered,
          observedNodeIds,
          controlPlaneDiagnosticsAvailable:
            snapshotDiagnostics.controlPlaneDiagnosticsAvailable,
          publicationConvergence,
          publicationConvergenceGate,
          publishedMembershipObservation:
            snapshotDiagnostics.publishedMembershipObservation,
          publicationActiveGateHandoff:
            snapshotDiagnostics.publicationActiveGateHandoff,
          membershipPublicationHandoffOutcome:
            snapshotDiagnostics.membershipPublicationHandoffOutcome,
          activeGateOwnerCohort: snapshotDiagnostics.activeGateOwnerCohort,
          priorityRecoveryObservation:
            snapshotDiagnostics.priorityRecoveryObservation,
          priorityRecoveryDecisionSnapshots:
            snapshotDiagnostics.priorityRecoveryDecisionSnapshots,
          controlPlaneOwnerQueueDepth:
            snapshotDiagnostics.controlPlaneOwnerQueueDepth,
          cdcReplayLag: snapshotDiagnostics.cdcReplayLag,
          healthyReadinessNodeIds: snapshotDiagnostics.healthyReadinessNodeIds,
          publishedActiveNodeIds,
          pendingAckNodeIds,
          missingPublishedNodeIds,
        };
      };
      const probeReachabilityDiagnostics = async () => {
        const preflight =
          loadReachabilityPreflightByNodeId.get(String(node.id));
        if (preflight) {
          reachabilityDiagnostics = preflight.diagnostics;
          reachabilityError = preflight.error;
          return;
        }
        const probeResult = await queryReachabilityDiagnostics(
          node,
          reachabilityTimeoutMs,
        );
        reachabilityDiagnostics = probeResult.diagnostics;
        reachabilityError = probeResult.error;
      };
      try {
        const snapshotResult = await node.getControlSnapshot({
          timeoutMs: snapshotTimeoutMs,
          lane: ADMIN_SOCKET_LANE_SNAPSHOT,
          forceRepair: options.forceRepair === true,
          ignorePreRestart: readinessMode === CLUSTER_READINESS_MODE_LOAD,
        });
        await probeReachabilityDiagnostics();
        return buildSuccessfulSnapshotCoverageResult(snapshotResult);
      } catch (error) {
        let snapshotError = normalizeProbeError(error);
        let finalSnapshotTimeoutMs = snapshotTimeoutMs;
        let terminalObservationSummary = buildControlSnapshotObservationSummary();
        const snapshotTimeoutEncountered =
          isTimeoutShapedProbeError(snapshotError) === true;
        resetSnapshotLaneAfterTimeout(node, snapshotError);
        await probeReachabilityDiagnostics();
        const retryReason = resolveSnapshotRetryReason({
          forceRepair: options.forceRepair === true,
          reachabilityDiagnostics,
          snapshotError,
        });
        if (retryReason !== CONTROL_SNAPSHOT_RETRY_REASON_NOT_APPLICABLE) {
          try {
            const ownerRecoveryReconcilePending =
              controlSnapshotReasonAllowsActiveGateHandoff([retryReason]) ===
                true;
            const retrySnapshotTimeoutMs =
              resolveSnapshotRetryTimeoutMs(
                snapshotTimeoutMs,
                startupProbeTimeoutScale,
                {ownerRecoveryReconcilePending},
              );
            finalSnapshotTimeoutMs = retrySnapshotTimeoutMs;
            const retrySnapshotResult = await node.getControlSnapshot({
              timeoutMs: retrySnapshotTimeoutMs,
              lane: ADMIN_SOCKET_LANE_SNAPSHOT,
              forceRepair: false,
              forceAuthoritativeRepair: false,
              ignorePreRestart: readinessMode === CLUSTER_READINESS_MODE_LOAD,
            });
            return buildSuccessfulSnapshotCoverageResult(
              retrySnapshotResult,
              retrySnapshotTimeoutMs,
              snapshotTimeoutEncountered,
            );
          } catch (retryError) {
            snapshotError = normalizeProbeError(retryError);
            resetSnapshotLaneAfterTimeout(node, snapshotError);
            const terminalRetryReason = resolveTerminalSnapshotRetryReason({
              retryReason,
              reachabilityDiagnostics,
              snapshotError,
            });
            terminalObservationSummary =
              buildControlSnapshotRetryObservationSummary({
                retryAfterMs: finalSnapshotTimeoutMs,
                retryReason: terminalRetryReason,
              });
          }
        } else {
          terminalObservationSummary =
            buildControlSnapshotRetryObservationSummary({
              retryAfterMs: finalSnapshotTimeoutMs,
              retryReason: resolveSnapshotTerminalObservationReason({
                reachabilityDiagnostics,
                snapshotError,
              }),
            });
        }
        const terminalAdminReady = reachabilityDiagnostics?.adminReady === true;
        const terminalActiveGateHandoff =
          buildTerminalControlSnapshotActiveGateHandoff({
            expectedNodeIds: [...expectedNodeSet],
            nodeId: node.id,
            terminalObservationSummary,
            selectedAdminReady: terminalAdminReady,
          });
        const terminalOwnerRecoveryQueueProjection =
          buildWaitOwnerRecoveryQueueProjection({
            activeGateHandoff: terminalActiveGateHandoff,
            membershipPublicationHandoffOutcome:
              CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_UNAVAILABLE,
            controlPlaneOwnerQueueDepth: null,
            snapshotObservationSummary: terminalObservationSummary,
          });
        return {
          nodeId: node.id,
          error: snapshotError,
          snapshotTimeoutEncountered,
          snapshotTimeoutMs: finalSnapshotTimeoutMs,
          reachabilityTimeoutMs,
          adminReady: terminalAdminReady,
          reachable: reachabilityDiagnostics?.reachable === true,
          reachableBy:
            typeof reachabilityDiagnostics?.reachableBy === 'string' &&
            reachabilityDiagnostics.reachableBy.length > ZERO ?
              reachabilityDiagnostics.reachableBy :
              null,
          reachabilityError:
            typeof reachabilityDiagnostics?.lastError === 'string' &&
            reachabilityDiagnostics.lastError.length > ZERO ?
              reachabilityDiagnostics.lastError :
              reachabilityError,
          observedNodeCount: 0,
          missingExpectedNodeCount: expectedNodeSet.size,
          capturedAtMs: null,
          snapshotRevision: null,
          snapshotRevisionState: CONTROL_SNAPSHOT_REVISION_STATE_UNAVAILABLE,
          snapshotExpectedMinimumRevision: null,
          snapshotRevisionGap: null,
          snapshotResumeToken: null,
          ...terminalObservationSummary,
          observedNodeIds: [],
          controlPlaneDiagnosticsAvailable: false,
          publicationConvergence:
            CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_UNAVAILABLE,
          publicationConvergenceGate:
            CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_GATE_UNAVAILABLE,
          publishedMembershipObservation: null,
          publicationActiveGateHandoff: terminalActiveGateHandoff,
          membershipPublicationHandoffOutcome:
            terminalOwnerRecoveryQueueProjection
              .membershipPublicationHandoffOutcome,
          activeGateOwnerCohort: terminalActiveGateHandoff,
          priorityRecoveryObservation: null,
          priorityRecoveryDecisionSnapshots:
            CONTROL_SNAPSHOT_PRIORITY_RECOVERY_DECISION_SNAPSHOTS_UNAVAILABLE,
          controlPlaneOwnerQueueDepth:
            terminalOwnerRecoveryQueueProjection.controlPlaneOwnerQueueDepth,
          cdcReplayLag: null,
          healthyReadinessNodeIds: [],
          publishedActiveNodeIds: [],
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
        };
      }
    };
    const snapshotProbeResults = [];
    const loadSnapshotCoverageAttemptDeadlineExpired = () => {
      return readinessMode === CLUSTER_READINESS_MODE_LOAD &&
        Date.now() >= deadline;
    };
    if (nodes.length > ZERO) {
      if (
        readinessMode === CLUSTER_READINESS_MODE_LOAD &&
        nodes.length > ONE
      ) {
        const preflightReachabilityTimeoutMs =
          resolveReachabilityProbeTimeoutMs(
            CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS,
          );
        const originalNodeOrder = new Map(
          nodes.map((node, index) => [String(node.id), index]),
        );
        const preflightResults = await Promise.all(
          nodes.map(async (node) => {
            return {
              node,
              result: await queryReachabilityDiagnostics(
                node,
                preflightReachabilityTimeoutMs,
              ),
            };
          }),
        );
        for (const {node, result} of preflightResults) {
          loadReachabilityPreflightByNodeId.set(String(node.id), result);
        }
        const reachabilityRank = (node) => {
          const preflight =
            loadReachabilityPreflightByNodeId.get(String(node.id));
          const diagnostics = preflight?.diagnostics;
          if (diagnostics?.adminReady === true) {
            return ZERO;
          }
          if (diagnostics?.reachable === true) {
            return ONE;
          }
          if (!preflight || !diagnostics) {
            return LOAD_REACHABILITY_PREFLIGHT_RANK_UNKNOWN;
          }
          return LOAD_REACHABILITY_PREFLIGHT_RANK_NOT_READY;
        };
        nodes.sort((left, right) => {
          const leftRank = reachabilityRank(left);
          const rightRank = reachabilityRank(right);
          if (leftRank !== rightRank) {
            return leftRank - rightRank;
          }
          return (
            (originalNodeOrder.get(String(left.id)) ?? ZERO) -
            (originalNodeOrder.get(String(right.id)) ?? ZERO)
          );
        });
      }
      const firstSnapshotTimeoutMs = resolveSnapshotProbeTimeoutMs(
        CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
      );
      const firstReachabilityTimeoutMs = resolveReachabilityProbeTimeoutMs(
        CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS,
      );
      const firstResult = await probeNodeSnapshotCoverage(
        nodes[0],
        firstSnapshotTimeoutMs,
        firstReachabilityTimeoutMs,
      );
      snapshotProbeResults.push(firstResult);
      const loadAlternativeSnapshotWitnessAvailable =
        readinessMode === CLUSTER_READINESS_MODE_LOAD &&
        nodes.slice(ONE).some((node) => {
          const preflight =
            loadReachabilityPreflightByNodeId.get(String(node.id));
          const diagnostics = preflight?.diagnostics;
          return (
            diagnostics?.adminReady === true ||
            diagnostics?.reachable === true
          );
        });
      const ownerRecoveryHandoffAllowsBoundedReturn =
        readinessMode === CLUSTER_READINESS_MODE_LOAD &&
        controlSnapshotOwnerRecoveryAllowsBoundedReturn({
          result: firstResult,
          expectedNodeIds: [...expectedNodeSet],
          alternativeSnapshotWitnessAvailable:
            loadAlternativeSnapshotWitnessAvailable,
        });
      const loadRemainingWitnessPassRequired =
        readinessMode === CLUSTER_READINESS_MODE_LOAD &&
        ownerRecoveryHandoffAllowsBoundedReturn !== true &&
        loadSelectedRetryNeedsRemainingWitnessPass(firstResult);
      if (
        firstResult.missingExpectedNodeCount !== ZERO &&
        nodes.length > ONE &&
        ownerRecoveryHandoffAllowsBoundedReturn !== true &&
        (loadSnapshotCoverageAttemptDeadlineExpired() !== true ||
          loadRemainingWitnessPassRequired === true)
      ) {
        const remainingSnapshotTimeoutMs =
          loadRemainingWitnessPassRequired === true ?
            resolveLoadRemainingWitnessSnapshotTimeoutMs(firstResult) :
            resolveSnapshotProbeTimeoutMs(CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS);
        const remainingReachabilityTimeoutMs =
          resolveReachabilityProbeTimeoutMs(
            CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS,
          );
        const remainingNodes = nodes.slice(1);
        if (readinessMode === CLUSTER_READINESS_MODE_LOAD) {
          for (const node of remainingNodes) {
            if (
              loadSnapshotCoverageAttemptDeadlineExpired() &&
              loadRemainingWitnessPassRequired !== true
            ) {
              break;
            }
            const remainingResult = await probeNodeSnapshotCoverage(
              node,
              remainingSnapshotTimeoutMs,
              remainingReachabilityTimeoutMs,
            );
            snapshotProbeResults.push(remainingResult);
          }
        } else {
          const remainingResults = await Promise.all(
            remainingNodes.map((node) => {
              return probeNodeSnapshotCoverage(
                node,
                remainingSnapshotTimeoutMs,
                remainingReachabilityTimeoutMs,
              );
            }),
          );
          snapshotProbeResults.push(...remainingResults);
        }
      }
    }
    const bestCoverageNodeCount = snapshotProbeResults.reduce(
      (maxCoverage, result) => Math.max(maxCoverage, result.observedNodeCount),
      0,
    );
    const completeCoverage = snapshotProbeResults.some(
      (result) => result.missingExpectedNodeCount === 0,
    );
    let selectedResult = null;
    for (const result of snapshotProbeResults) {
      if (!selectedResult) {
        selectedResult = result;
        continue;
      }
      if (
        result.missingExpectedNodeCount !==
        selectedResult.missingExpectedNodeCount
      ) {
        if (
          result.missingExpectedNodeCount <
          selectedResult.missingExpectedNodeCount
        ) {
          selectedResult = result;
        }
        continue;
      }
      if (result.observedNodeCount !== selectedResult.observedNodeCount) {
        if (result.observedNodeCount > selectedResult.observedNodeCount) {
          selectedResult = result;
        }
        continue;
      }
      if ((result.error === null) !== (selectedResult.error === null)) {
        if (result.error === null) {
          selectedResult = result;
        }
        continue;
      }
      if (
        result.controlPlaneDiagnosticsAvailable !==
        selectedResult.controlPlaneDiagnosticsAvailable
      ) {
        if (result.controlPlaneDiagnosticsAvailable === true) {
          selectedResult = result;
        }
        continue;
      }
      if (result.adminReady !== selectedResult.adminReady) {
        if (result.adminReady === true) {
          selectedResult = result;
        }
        continue;
      }
      if (result.reachable !== selectedResult.reachable) {
        if (result.reachable === true) {
          selectedResult = result;
        }
        continue;
      }
      const resultHealthyReadinessCount = Array.isArray(
        result.healthyReadinessNodeIds,
      ) ?
        result.healthyReadinessNodeIds.length :
        ZERO;
      const selectedHealthyReadinessCount = Array.isArray(
        selectedResult.healthyReadinessNodeIds,
      ) ?
        selectedResult.healthyReadinessNodeIds.length :
        ZERO;
      if (resultHealthyReadinessCount !== selectedHealthyReadinessCount) {
        if (resultHealthyReadinessCount > selectedHealthyReadinessCount) {
          selectedResult = result;
        }
        continue;
      }
      const resultMissingPublishedCount = Array.isArray(
        result.missingPublishedNodeIds,
      ) ?
        result.missingPublishedNodeIds.length :
        expectedNodeSet.size;
      const selectedMissingPublishedCount = Array.isArray(
        selectedResult.missingPublishedNodeIds,
      ) ?
        selectedResult.missingPublishedNodeIds.length :
        expectedNodeSet.size;
      if (resultMissingPublishedCount !== selectedMissingPublishedCount) {
        if (resultMissingPublishedCount < selectedMissingPublishedCount) {
          selectedResult = result;
        }
        continue;
      }
      const resultPendingAckCount = Array.isArray(result.pendingAckNodeIds) ?
        result.pendingAckNodeIds.length :
        expectedNodeSet.size;
      const selectedPendingAckCount = Array.isArray(
        selectedResult.pendingAckNodeIds,
      ) ?
        selectedResult.pendingAckNodeIds.length :
        expectedNodeSet.size;
      if (resultPendingAckCount !== selectedPendingAckCount) {
        if (resultPendingAckCount < selectedPendingAckCount) {
          selectedResult = result;
        }
        continue;
      }
      const resultPublishedActiveCount = Array.isArray(
        result.publishedActiveNodeIds,
      ) ?
        result.publishedActiveNodeIds.length :
        ZERO;
      const selectedPublishedActiveCount = Array.isArray(
        selectedResult.publishedActiveNodeIds,
      ) ?
        selectedResult.publishedActiveNodeIds.length :
        ZERO;
      if (resultPublishedActiveCount !== selectedPublishedActiveCount) {
        if (resultPublishedActiveCount > selectedPublishedActiveCount) {
          selectedResult = result;
        }
        continue;
      }
      if (
        Number.isFinite(result.capturedAtMs) &&
        (!Number.isFinite(selectedResult.capturedAtMs) ||
          result.capturedAtMs > selectedResult.capturedAtMs)
      ) {
        selectedResult = result;
      }
    }
    selectedResult = selectAlternativeSnapshotWitness(
      snapshotProbeResults,
      selectedResult,
    );
    if (readinessMode === CLUSTER_READINESS_MODE_LOAD) {
      selectedResult = aggregateControlSnapshotOwnerRecoveryWitnesses({
        selectedResult,
        snapshotProbeResults,
        expectedNodeIds: [...expectedNodeSet],
      });
    }
    const selectedReachabilityFallback =
      hasControlSnapshotReachabilityFallback(selectedResult);
    const selectedAdminReady =
      selectedResult?.adminReady === true || selectedReachabilityFallback;
    const selectedReachableBy =
      selectedResult?.reachableBy ||
      (selectedReachabilityFallback ?
        CONTROL_SNAPSHOT_REACHABILITY_SOURCE :
        null);
    const selectedReachabilityError = selectedReachabilityFallback ?
      null :
      selectedResult?.reachabilityError || null;
    const selectedSnapshotObservedNodeIds = normalizeDistinctStringArray(
      selectedResult?.observedNodeIds,
    );
    const selectedTerminalRecoveryProgress =
      buildTerminalControlSnapshotRecoveryProgress({
        activeGateHandoff: selectedResult?.publicationActiveGateHandoff,
        expectedNodeIds: [...expectedNodeSet],
      });
    const selectedObservedNodeIds = normalizeDistinctStringArray([
      ...selectedSnapshotObservedNodeIds,
      ...selectedTerminalRecoveryProgress.observedNodeIds,
    ]);
    const effectiveBestCoverageNodeCount = Math.max(
      bestCoverageNodeCount,
      selectedObservedNodeIds.length,
    );
    const selectedOwnerRecoveryQueueProjection =
      buildWaitOwnerRecoveryQueueProjection({
        activeGateHandoff: selectedResult?.publicationActiveGateHandoff,
        membershipPublicationHandoffOutcome:
          selectedResult?.membershipPublicationHandoffOutcome,
        controlPlaneOwnerQueueDepth: selectedResult?.controlPlaneOwnerQueueDepth,
        snapshotObservationSummary: selectedResult,
      });
    const publicationDisagreementByNodeId = {};
    for (const result of snapshotProbeResults) {
      publicationDisagreementByNodeId[result.nodeId] = Array.isArray(
        result.missingPublishedNodeIds,
      ) ?
        [...result.missingPublishedNodeIds] :
        [];
    }
    return {
      completeCoverage,
      expectedNodeCount: expectedNodeSet.size,
      bestCoverageNodeCount: effectiveBestCoverageNodeCount,
      forceRepair: options.forceRepair === true,
      selectedNodeId: selectedResult?.nodeId || null,
      selectedSnapshotNodeId: selectedResult?.nodeId || null,
      selectedAdminReady,
      selectedSnapshotAdminReady: selectedAdminReady,
      selectedReachable:
        selectedResult?.reachable === true || selectedReachabilityFallback,
      selectedReachableBy,
      selectedSnapshotReachableBy: selectedReachableBy,
      selectedReachabilityError,
      selectedSnapshotReachabilityError: selectedReachabilityError,
      selectedSnapshotTimeoutMs: Number.isFinite(
        selectedResult?.snapshotTimeoutMs,
      ) ?
        Math.max(MIN_TIMEOUT_MS, Math.floor(selectedResult.snapshotTimeoutMs)) :
        null,
      selectedReachabilityTimeoutMs: Number.isFinite(
        selectedResult?.reachabilityTimeoutMs,
      ) ?
        Math.max(
          MIN_TIMEOUT_MS,
          Math.floor(selectedResult.reachabilityTimeoutMs),
        ) :
        null,
      selectedCapturedAtMs: Number.isFinite(selectedResult?.capturedAtMs) ?
        selectedResult.capturedAtMs :
        null,
      selectedSnapshotRevision: Number.isFinite(
        selectedResult?.snapshotRevision,
      ) ?
        Math.floor(selectedResult.snapshotRevision) :
        null,
      selectedSnapshotRevisionState:
        typeof selectedResult?.snapshotRevisionState === TYPEOF_STRING &&
        selectedResult.snapshotRevisionState.length > ZERO ?
          selectedResult.snapshotRevisionState :
          null,
      selectedSnapshotExpectedMinimumRevision: Number.isFinite(
        selectedResult?.snapshotExpectedMinimumRevision,
      ) ?
        Math.floor(selectedResult.snapshotExpectedMinimumRevision) :
        null,
      selectedSnapshotRevisionGap: Number.isFinite(
        selectedResult?.snapshotRevisionGap,
      ) ?
        Math.floor(selectedResult.snapshotRevisionGap) :
        null,
      selectedSnapshotResumeToken:
        typeof selectedResult?.snapshotResumeToken === TYPEOF_STRING &&
        selectedResult.snapshotResumeToken.length > ZERO ?
          selectedResult.snapshotResumeToken :
          null,
      selectedSnapshotObservationMode:
        selectedResult?.snapshotObservationMode || null,
      selectedSnapshotObservationState:
        selectedResult?.snapshotObservationState || null,
      selectedSnapshotObservationContractState:
        selectedResult?.snapshotObservationContractState || null,
      selectedSnapshotObservationRefreshState:
        selectedResult?.snapshotObservationRefreshState || null,
      selectedSnapshotObservationNextAction:
        selectedResult?.snapshotObservationNextAction || null,
      selectedSnapshotObservationReasonCodes: Array.isArray(
        selectedResult?.snapshotObservationReasonCodes,
      ) ?
        [...selectedResult.snapshotObservationReasonCodes] :
        [],
      selectedSnapshotObservationRetryAfterMs: Number.isFinite(
        selectedResult?.snapshotObservationRetryAfterMs,
      ) ?
        Math.floor(selectedResult.snapshotObservationRetryAfterMs) :
        null,
      selectedSnapshotRepairDeferred:
        selectedResult?.snapshotRepairDeferred === true,
      selectedObservedNodeIds,
      selectedPublishedActiveNodeIds: Array.isArray(
        selectedResult?.publishedActiveNodeIds,
      ) ?
        [...selectedResult.publishedActiveNodeIds] :
        [],
      selectedPendingAckNodeIds: Array.isArray(
        selectedResult?.pendingAckNodeIds,
      ) ?
        [...selectedResult.pendingAckNodeIds] :
        [],
      selectedMissingPublishedNodeIds: Array.isArray(
        selectedResult?.missingPublishedNodeIds,
      ) ?
        [...selectedResult.missingPublishedNodeIds] :
        [],
      selectedControlPlaneDiagnosticsAvailable:
        selectedResult?.controlPlaneDiagnosticsAvailable === true,
      selectedPublicationConvergence:
        selectedResult?.publicationConvergence || null,
      selectedPublicationConvergenceGate:
        selectedResult?.publicationConvergenceGate || null,
      selectedPublicationActiveGateHandoff:
        selectedResult?.publicationActiveGateHandoff || null,
      selectedMembershipPublicationHandoffOutcome:
        selectedOwnerRecoveryQueueProjection
          .membershipPublicationHandoffOutcome || null,
      selectedPublishedMembershipObservation:
        selectedResult?.publishedMembershipObservation || null,
      selectedActiveGateOwnerCohort:
        selectedResult?.activeGateOwnerCohort || null,
      selectedPriorityRecoveryObservation:
        selectedResult?.priorityRecoveryObservation || null,
      selectedPriorityRecoveryDecisionSnapshots:
        selectedResult?.priorityRecoveryDecisionSnapshots || null,
      selectedControlPlaneOwnerQueueDepth:
        selectedOwnerRecoveryQueueProjection.controlPlaneOwnerQueueDepth || null,
      selectedCdcReplayLag: selectedResult?.cdcReplayLag || null,
      publicationDisagreementByNodeId,
      selectedHealthyReadinessNodeIds: Array.isArray(
        selectedResult?.healthyReadinessNodeIds,
      ) ?
        [...selectedResult.healthyReadinessNodeIds] :
        [],
      probeWitnesses: snapshotProbeResults.map((result) => {
        return {
          nodeId: result.nodeId,
          snapshotQuerySucceeded: result.error === null,
          adminReady: result.adminReady === true,
          reachable: result.reachable === true,
          reachableBy: result.reachableBy || null,
          reachabilityError: result.reachabilityError || null,
          error: result.error || null,
          observedNodeCount: result.observedNodeCount,
          missingExpectedNodeCount: result.missingExpectedNodeCount,
          capturedAtMs: Number.isFinite(result.capturedAtMs) ?
            result.capturedAtMs :
            null,
          snapshotRevision: Number.isFinite(result.snapshotRevision) ?
            Math.floor(result.snapshotRevision) :
            null,
          snapshotRevisionState:
            typeof result.snapshotRevisionState === TYPEOF_STRING &&
            result.snapshotRevisionState.length > ZERO ?
              result.snapshotRevisionState :
              null,
          snapshotRevisionGap: Number.isFinite(result.snapshotRevisionGap) ?
            Math.floor(result.snapshotRevisionGap) :
            null,
          snapshotObservationMode: result.snapshotObservationMode || null,
          snapshotObservationState: result.snapshotObservationState || null,
          snapshotObservationContractState:
            result.snapshotObservationContractState || null,
          snapshotObservationRefreshState:
            result.snapshotObservationRefreshState || null,
          snapshotObservationNextAction:
            result.snapshotObservationNextAction || null,
          snapshotObservationReasonCodes: Array.isArray(
            result.snapshotObservationReasonCodes,
          ) ?
            [...result.snapshotObservationReasonCodes] :
            [],
          snapshotObservationRetryAfterMs: Number.isFinite(
            result.snapshotObservationRetryAfterMs,
          ) ?
            Math.floor(result.snapshotObservationRetryAfterMs) :
            null,
          snapshotRepairDeferred: result.snapshotRepairDeferred === true,
          snapshotTimeoutEncountered:
            result.snapshotTimeoutEncountered === true,
          ...(result.publicationActiveGateHandoff ?
            {
              publicationActiveGateHandoff:
                result.publicationActiveGateHandoff,
            } :
            {}),
          ...(result.membershipPublicationHandoffOutcome ?
            {
              membershipPublicationHandoffOutcome:
                result.membershipPublicationHandoffOutcome,
            } :
            {}),
          activeGateOwnerCohort: result.activeGateOwnerCohort || null,
          publicationEpoch: Number.isFinite(
            result?.publicationConvergence?.publicationEpoch,
          ) ?
            Math.floor(result.publicationConvergence.publicationEpoch) :
            null,
          publicationStatus:
            typeof result?.publicationConvergence?.publicationStatus ===
              TYPEOF_STRING &&
            result.publicationConvergence.publicationStatus.length > ZERO ?
              result.publicationConvergence.publicationStatus :
              null,
          publishedActiveNodeIds: Array.isArray(result.publishedActiveNodeIds) ?
            [...result.publishedActiveNodeIds] :
            [],
          pendingAckNodeIds: Array.isArray(result.pendingAckNodeIds) ?
            [...result.pendingAckNodeIds] :
            [],
          missingPublishedNodeIds: Array.isArray(result.missingPublishedNodeIds) ?
            [...result.missingPublishedNodeIds] :
            [],
        };
      }),
      selectedError: selectedResult?.error || null,
    };
  }

  async _probeControlPlaneQuiescenceSnapshot(deadline) {
    const nodes = [...this._nodes.values()];
    nodes.sort((left, right) => {
      const leftRank = left.role === NODE_ROLES.SEED ? 0 : 1;
      const rightRank = right.role === NODE_ROLES.SEED ? 0 : 1;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return String(left.id).localeCompare(String(right.id));
    });

    let selectedSnapshot = null;
    let lastError = null;
    for (const [index, node] of nodes.entries()) {
      const snapshotTimeoutMs = resolveQuiescenceSequentialProbeTimeoutMs(
        deadline,
        nodes.length - index,
        CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
      );
      try {
        const snapshotResult = await node.getControlSnapshot({
          timeoutMs: snapshotTimeoutMs,
          lane: ADMIN_SOCKET_LANE_SNAPSHOT,
        });
        const payload = this._extractControlSnapshotPayload(snapshotResult);
        if (!payload) {
          throw new Error(CONTROL_SNAPSHOT_MISSING_ROWS_ERROR);
        }
        const replicaOperations =
          payload.replicaOperations &&
          typeof payload.replicaOperations === 'object' ?
            payload.replicaOperations :
            {};
        const replicaOperationRows = Array.isArray(replicaOperations.rows) ?
          replicaOperations.rows :
          [];
        const controlPlaneDiagnostics =
          payload.controlPlaneDiagnostics &&
          typeof payload.controlPlaneDiagnostics === 'object' ?
            payload.controlPlaneDiagnostics :
            null;
        const cacheVisibleSatisfiedPriorityRecoveryOperationCount =
          countCacheVisibleSatisfiedPriorityRecoveryOperations(
            controlPlaneDiagnostics,
            replicaOperationRows,
          );
        const leaders =
          payload.leaders && typeof payload.leaders === 'object' ?
            payload.leaders :
            {};
        const leaderEntries = Object.entries(leaders).sort((left, right) =>
          left[0].localeCompare(right[0]),
        );
        const candidateSnapshot = {
          nodeId: node.id,
          capturedAtMs: Number.isFinite(payload.capturedAt) ?
            Math.floor(payload.capturedAt) :
            null,
          inFlightCount:
            Number.isInteger(replicaOperations.inFlightCount) &&
            replicaOperations.inFlightCount >= ZERO ?
              replicaOperations.inFlightCount :
              ZERO,
          staleInFlightCount:
            Number.isInteger(replicaOperations.staleInFlightCount) &&
            replicaOperations.staleInFlightCount >= ZERO ?
              replicaOperations.staleInFlightCount :
              ZERO,
          cacheVisibleSatisfiedPriorityRecoveryOperationCount,
          partitionGroupInFlight:
            normalizeReplicaOperationPartitionGroupInFlight(
              replicaOperations.partitionGroupInFlight,
            ),
          leaderSignature: JSON.stringify(leaderEntries),
          leaderCount: leaderEntries.length,
          operationTimelineSignature: buildReplicaOperationTimelineSignature(
            replicaOperations.operationTimelineById,
          ),
          controlPlanePressureSignals:
            buildControlPlaneQuiescencePressureSignalsFromDiagnostics(
              controlPlaneDiagnostics,
            ),
          error: null,
        };
        if (
          isBetterControlSnapshotCandidate(candidateSnapshot, selectedSnapshot)
        ) {
          selectedSnapshot = candidateSnapshot;
        }
      } catch (error) {
        lastError = normalizeProbeError(error);
      }
    }

    if (selectedSnapshot) {
      return selectedSnapshot;
    }
    return {
      nodeId: null,
      capturedAtMs: null,
      inFlightCount: null,
      partitionGroupInFlight: {},
      leaderSignature: null,
      leaderCount: ZERO,
      operationTimelineSignature: null,
      error: lastError || CONTROL_SNAPSHOT_NO_CANDIDATES_ERROR,
    };
  }

  async _probeCriticalSystemTopology(deadline, options = {}) {
    const enabled =
      this._resolveControlPlaneQuiescenceRequireCriticalSystemSpread(options);
    if (!enabled) {
      return {
        enabled: false,
        ready: true,
        observationState:
          CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE.AVAILABLE,
        readyTableCount: ZERO,
        snapshotLaneUnavailableTableCount: ZERO,
        totalSpreadGap: ZERO,
        tables: [],
      };
    }

    const tableNames =
      this._resolveControlPlaneQuiescenceCriticalSystemTableNames(options);
    const requiredDistinctNodeCount =
      this._resolveControlPlaneQuiescenceCriticalSystemRequiredDistinctNodeCount(
        options,
      );
    const tables = [];
    for (const tableName of tableNames) {
      tables.push(
        await this._probeCriticalSystemTableDistribution(
          deadline,
          tableName,
          requiredDistinctNodeCount,
        ),
      );
    }
    const readyTableCount = tables.filter(
      (table) => table.ready === true,
    ).length;
    const snapshotLaneUnavailableTableCount = tables.filter((table) =>
      table.observationState ===
        CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE
          .SNAPSHOT_LANE_UNAVAILABLE,
    ).length;
    const totalSpreadGap = tables.reduce((sum, table) => {
      const spreadGap = Number.isInteger(table?.spreadGap) ?
        table.spreadGap :
        requiredDistinctNodeCount;
      return sum + spreadGap;
    }, ZERO);
    return {
      enabled: true,
      ready:
        snapshotLaneUnavailableTableCount === ZERO &&
        readyTableCount === tables.length,
      observationState:
        snapshotLaneUnavailableTableCount > ZERO ?
          CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE
            .SNAPSHOT_LANE_UNAVAILABLE :
          CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE.AVAILABLE,
      readyTableCount,
      snapshotLaneUnavailableTableCount,
      requiredDistinctNodeCount,
      totalSpreadGap,
      tables,
    };
  }

  async _probeCriticalSystemTableDistribution(
    deadline,
    tableName,
    requiredDistinctNodeCount,
  ) {
    const nodes = [...this._nodes.values()];
    nodes.sort((left, right) => {
      const leftRank = left.role === NODE_ROLES.SEED ? 0 : 1;
      const rightRank = right.role === NODE_ROLES.SEED ? 0 : 1;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return String(left.id).localeCompare(String(right.id));
    });

    const discoverySql = buildServiceDiscoverySql({tableName});
    let selectedSummary = null;
    let lastError = null;
    for (const [index, node] of nodes.entries()) {
      const timeoutMs = resolveQuiescenceSequentialProbeTimeoutMs(
        deadline,
        nodes.length - index,
        CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
      );
      try {
        const discoverySnapshot =
          typeof node.queryWithTimeout === 'function' ?
            await node.queryWithTimeout(discoverySql, [], {
              lane: ADMIN_SOCKET_LANE_SNAPSHOT,
              timeoutMs,
            }) :
            await node.query(discoverySql, []);
        const discoverySummary =
          extractCriticalSystemDiscoverySummary(discoverySnapshot);
        const candidateSummary = {
          tableName,
          selectedNodeId: node.id,
          selectedCapturedAtMs: discoverySummary.capturedAtMs,
          readyNodeIds: discoverySummary.readyNodeIds,
          readyDistinctNodeCount: discoverySummary.readyDistinctNodeCount,
          readyReplicaCount: discoverySummary.readyReplicaCount,
          totalReplicaCount: discoverySummary.totalReplicaCount,
          requiredDistinctNodeCount,
          observationState:
            CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE.AVAILABLE,
          spreadGap: Math.max(
            ZERO,
            requiredDistinctNodeCount - discoverySummary.readyDistinctNodeCount,
          ),
          ready:
            discoverySummary.readyDistinctNodeCount >=
            requiredDistinctNodeCount,
          error: null,
        };
        if (
          isBetterCriticalSystemDiscoveryCandidate(
            candidateSummary,
            selectedSummary,
          )
        ) {
          selectedSummary = candidateSummary;
        }
      } catch (error) {
        lastError = normalizeProbeError(error);
      }
    }

    if (selectedSummary) {
      return selectedSummary;
    }
    return {
      tableName,
      selectedNodeId: null,
      selectedCapturedAtMs: null,
      readyNodeIds: [...CRITICAL_SYSTEM_READY_NODE_IDS_UNAVAILABLE],
      readyDistinctNodeCount: ZERO,
      readyReplicaCount: ZERO,
      totalReplicaCount: ZERO,
      requiredDistinctNodeCount,
      observationState:
        CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE
          .SNAPSHOT_LANE_UNAVAILABLE,
      spreadGap: requiredDistinctNodeCount,
      ready: false,
      error: lastError || SERVICE_DISCOVERY_NO_CANDIDATES_ERROR,
    };
  }

  _resolveActiveWaitTimeoutMs() {
    const baseTimeout = this._resolveActiveWaitBaseTimeoutMs();
    const configuredClusterSize = Number.isInteger(this._config?.size) ?
      this._config.size :
      ZERO;
    const expectedNodeCount = Math.max(
      ACTIVE_WAIT_MIN_CLUSTER_SIZE,
      configuredClusterSize,
      this._nodes.size,
    );
    const extraNodeCount = Math.max(
      ZERO,
      expectedNodeCount - ACTIVE_WAIT_MIN_CLUSTER_SIZE,
    );
    if (extraNodeCount === ZERO) {
      return baseTimeout;
    }
    const scaledTimeout =
      baseTimeout +
      Math.floor(
        (baseTimeout *
          extraNodeCount *
          ACTIVE_WAIT_TIMEOUT_SCALE_PERCENT_PER_EXTRA_NODE) /
          ACTIVE_WAIT_TIMEOUT_SCALE_PERCENT_DENOMINATOR,
      );
    const maxScaledTimeout = baseTimeout * ACTIVE_WAIT_TIMEOUT_MAX_MULTIPLIER;
    return Math.min(scaledTimeout, maxScaledTimeout);
  }

  _resolveActiveWaitBaseTimeoutMs() {
    const configuredConvergenceTimeoutMs = this._config.timeouts?.convergence;
    if (
      Number.isFinite(configuredConvergenceTimeoutMs) &&
      configuredConvergenceTimeoutMs > ZERO
    ) {
      return Math.floor(configuredConvergenceTimeoutMs);
    }
    const configuredScenarioDefaultTimeoutMs =
      this._config.timeouts?.scenarioDefault;
    if (
      Number.isFinite(configuredScenarioDefaultTimeoutMs) &&
      configuredScenarioDefaultTimeoutMs > ZERO
    ) {
      return Math.floor(configuredScenarioDefaultTimeoutMs);
    }
    return TIMEOUTS.CONVERGENCE;
  }

  _resolveNodeHandleAdminQueryTimeoutMs() {
    const benchmarkControlTimeoutMs =
      this._config?.benchmark?.controlQueryTimeoutMs;
    if (
      Number.isInteger(benchmarkControlTimeoutMs) &&
      benchmarkControlTimeoutMs > ZERO
    ) {
      return benchmarkControlTimeoutMs;
    }
    return ADMIN_QUERY_TIMEOUT_MS;
  }

  _resolveActiveWaitNoProgressMaxAttempts(options = {}, timeoutMs = null) {
    if (Number.isInteger(options.noProgressMaxAttempts)) {
      return options.noProgressMaxAttempts > ZERO ?
        options.noProgressMaxAttempts :
        null;
    }
    if (
      Number.isInteger(this._config?.timeouts?.activeWaitNoProgressMaxAttempts)
    ) {
      return this._config.timeouts.activeWaitNoProgressMaxAttempts > ZERO ?
        this._config.timeouts.activeWaitNoProgressMaxAttempts :
        null;
    }
    const resolvedTimeoutMs =
      Number.isInteger(timeoutMs) && timeoutMs > ZERO ?
        timeoutMs :
        this._resolveActiveWaitTimeoutMs();
    const estimatedAttempts = Math.max(
      ONE,
      Math.floor(resolvedTimeoutMs / ACTIVE_POLL_INTERVAL_MS),
    );
    if (estimatedAttempts < STARTUP_GATE_WAITING_EVENT_INTERVAL) {
      return null;
    }
    return Math.max(
      STARTUP_GATE_WAITING_EVENT_INTERVAL,
      Math.floor(estimatedAttempts / ACTIVE_WAIT_TIMEOUT_EVENT_INTERVAL_DIVISOR),
    );
  }

  /**
   * Resolve the TIME-based no-progress budget for active waits. Unlike the
   * attempts-based budget above, this is robust to probe latency: attempts
   * take ~1s on a healthy cluster but ~16s when probes time out, so an
   * attempts threshold either misfires on healthy quiet (the reason the
   * scenario disables it for the promotion gate) or never fires under
   * failure. Elapsed wall time since the last strictly-better progress
   * snapshot has one meaning in both regimes. Disabled (null) unless
   * configured — no default budget.
   * @param {Object} options
   * @return {number|null}
   * @private
   */
  _resolveActiveWaitNoProgressMaxElapsedMs(options = {}) {
    if (Number.isFinite(options.noProgressMaxElapsedMs)) {
      return options.noProgressMaxElapsedMs > ZERO ?
        Math.floor(options.noProgressMaxElapsedMs) :
        null;
    }
    if (
      Number.isFinite(
        this._config?.timeouts?.activeWaitNoProgressMaxElapsedMs,
      )
    ) {
      return this._config.timeouts.activeWaitNoProgressMaxElapsedMs > ZERO ?
        Math.floor(this._config.timeouts.activeWaitNoProgressMaxElapsedMs) :
        null;
    }
    return null;
  }

  _resolveLoadReadinessStableWindowMs(options = {}) {
    if (Number.isFinite(options.stableWindowMs)) {
      return Math.max(ZERO, Math.floor(options.stableWindowMs));
    }
    if (Number.isFinite(this._config?.timeouts?.loadReadinessStableWindowMs)) {
      return Math.max(
        ZERO,
        Math.floor(this._config.timeouts.loadReadinessStableWindowMs),
      );
    }
    return LOAD_READINESS_STABLE_WINDOW_MS;
  }

  _resolveLoadReadinessStabilityTimeoutMs(options = {}) {
    if (Number.isFinite(options.timeoutMs)) {
      return Math.max(MIN_TIMEOUT_MS, Math.floor(options.timeoutMs));
    }
    if (
      Number.isFinite(this._config?.timeouts?.loadReadinessStabilityTimeoutMs)
    ) {
      return Math.max(
        MIN_TIMEOUT_MS,
        Math.floor(this._config.timeouts.loadReadinessStabilityTimeoutMs),
      );
    }
    return LOAD_READINESS_STABILITY_TIMEOUT_MS;
  }

  _resolveControlPlaneQuiescenceStableWindowMs(options = {}) {
    if (
      Number.isFinite(options.stableWindowMs) &&
      options.stableWindowMs >= ZERO
    ) {
      return Math.floor(options.stableWindowMs);
    }
    if (
      Number.isFinite(this._config?.benchmark?.quiescentStableWindowMs) &&
      this._config.benchmark.quiescentStableWindowMs >= ZERO
    ) {
      return Math.floor(this._config.benchmark.quiescentStableWindowMs);
    }
    return BENCHMARK_DEFAULTS.quiescentStableWindowMs;
  }

  _resolveControlPlaneQuiescenceTimeoutMs(options = {}) {
    if (Number.isFinite(options.timeoutMs) && options.timeoutMs > ZERO) {
      return Math.max(MIN_TIMEOUT_MS, Math.floor(options.timeoutMs));
    }
    if (
      Number.isFinite(this._config?.benchmark?.quiescentTimeoutMs) &&
      this._config.benchmark.quiescentTimeoutMs > ZERO
    ) {
      return Math.max(
        MIN_TIMEOUT_MS,
        Math.floor(this._config.benchmark.quiescentTimeoutMs),
      );
    }
    if (
      Number.isFinite(this._config?.benchmark?.readyTimeoutMs) &&
      this._config.benchmark.readyTimeoutMs > ZERO
    ) {
      return Math.max(
        MIN_TIMEOUT_MS,
        Math.floor(this._config.benchmark.readyTimeoutMs),
      );
    }
    return BENCHMARK_DEFAULTS.readyTimeoutMs;
  }

  _resolveControlPlaneQuiescenceNoProgressTimeoutMs(options = {}) {
    if (
      Number.isInteger(options.noProgressTimeoutMs) &&
      options.noProgressTimeoutMs > ZERO
    ) {
      return options.noProgressTimeoutMs;
    }
    if (
      Number.isInteger(this._config?.benchmark?.quiescentNoProgressTimeoutMs) &&
      this._config.benchmark.quiescentNoProgressTimeoutMs > ZERO
    ) {
      return this._config.benchmark.quiescentNoProgressTimeoutMs;
    }
    return null;
  }

  _resolveControlPlaneQuiescenceMaxInFlightCount(options = {}) {
    if (
      Number.isInteger(options.maxInFlightCount) &&
      options.maxInFlightCount >= ZERO
    ) {
      return options.maxInFlightCount;
    }
    if (
      Number.isInteger(this._config?.benchmark?.preloadMaxReplicaOpsInFlight) &&
      this._config.benchmark.preloadMaxReplicaOpsInFlight >= ZERO
    ) {
      return this._config.benchmark.preloadMaxReplicaOpsInFlight;
    }
    return ZERO;
  }

  _resolveControlPlaneQuiescenceRequireCriticalSystemSpread(options = {}) {
    if (typeof options.requireCriticalSystemSpread === TYPEOF_BOOLEAN) {
      return options.requireCriticalSystemSpread;
    }
    return this._config?.benchmark?.strictPreloadReadiness === true;
  }

  _resolveControlPlaneQuiescenceCriticalSystemTableNames(options = {}) {
    if (Array.isArray(options.criticalSystemTableNames)) {
      const tableNames = normalizeDistinctStringArray(
        options.criticalSystemTableNames,
      );
      if (tableNames.length > ZERO) {
        return tableNames;
      }
    }
    return [...CONTROL_PLANE_QUIESCENCE_CRITICAL_TABLES];
  }

  _resolveControlPlaneQuiescenceCriticalSystemRequiredDistinctNodeCount(
    options = {},
  ) {
    if (
      Number.isInteger(options.criticalSystemRequiredDistinctNodeCount) &&
      options.criticalSystemRequiredDistinctNodeCount > ZERO
    ) {
      return options.criticalSystemRequiredDistinctNodeCount;
    }
    const configuredReplicaCount =
      Number.isInteger(this._config?.benchmark?.replicationFactor) &&
      this._config.benchmark.replicationFactor > ZERO ?
        this._config.benchmark.replicationFactor :
        3;
    const clusterNodeCount = Math.max(ONE, this._nodes.size || ONE);
    return Math.max(ONE, Math.min(configuredReplicaCount, clusterNodeCount));
  }
}

export {ClusterControlSnapshotRecovery};
