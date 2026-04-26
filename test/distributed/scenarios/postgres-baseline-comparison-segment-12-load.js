import {POSTGRES_BASELINE_COMPARISON_SEGMENT_11} from './postgres-baseline-comparison-segment-11.js';
const {
  BASELINE_SKIP_REASON_SUT_HARD_LOAD_FAILURE,
  BASELINE_STATUS_SKIPPED,
  DISCOVERY_GATE_STATUS_FAILED,
  HEARTBEAT_FRESHNESS_INVARIANT_FAILED_REASON,
  HEARTBEAT_FRESHNESS_LARGE_CLUSTER_MAX_STALL_MS,
  LOAD_PARITY_STATUS_MISMATCHED,
  NO_PROGRESS_REASON_CODE,
  ONE,
  OVERLOAD_POLICY_VIOLATION_REASON,
  POST_LOAD_DRAIN_MODE_FAILED,
  POST_LOAD_DRAIN_STATUS_FAILED,
  POST_LOAD_DRAIN_STATUS_OK,
  PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD,
  REBALANCING_WINDOW_PINNING_VIOLATION_REASON,
  STRICT_PARITY_REASON_MISMATCH,
  WRITE_PRESSURE_THRESHOLD_EXCEEDED_REASON,
  ZERO,
  assert,
  ASSERTION_POLICY,
  CONSISTENCY_VERDICT,
  PHASE_STATUS,
  SCENARIO_PHASE,
  buildLoadParity,
  buildPostLoadDrainRebalancingPressure,
  buildSaturationCounters,
  buildStrictParityGate,
  collectLoadMetricHardFailures,
  emitPhaseMeaningfulChange,
  emitPhaseNoProgressFailure,
  emitPhaseProgress,
  evaluateOverloadPolicy,
  evaluateWritePressure,
  formatHeartbeatFreshnessFailures,
  formatLoadParityReasons,
  formatLoadRebalancingPinningReasons,
  formatOverloadPolicyViolations,
  formatWritePressureViolations,
  markQuietModePhase,
  normalizeLoadMetrics,
  resolveBaselineLoadNodeCountForRun,
  resolveBaselineMetrics,
  runSutSharedLoad,
  waitForSutLoadQuiescence,
} = POSTGRES_BASELINE_COMPARISON_SEGMENT_11;

export function buildLoadPhaseHandlers(context) {
  const {
    cluster,
    nodes,
    benchmarkConfig,
    scenarioOverrides,
    seedNode,
    benchmarkTableName,
    nodeClient,
    state,
    targetSutLoadNodeCount,
    provider,
    networkName,
    nodeClientPolicySnapshot,
  } = context;

  return {
    [SCENARIO_PHASE.LOAD]: async (phaseContext) => {
      markQuietModePhase(state.quietMode, SCENARIO_PHASE.LOAD);
      emitPhaseProgress(phaseContext, 'starting system-under-test load run', {
        admittedNodeIds: state.effectiveSutLoadNodes.map((node) => node.id),
        loadOpsPerSec: benchmarkConfig.loadOpsPerSec,
      });
      const effectiveLoadBenchmarkConfig =
        nodes.length >= PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD ?
          {
            ...benchmarkConfig,
            heartbeatFreshnessMaxStallMs: Math.max(
              Number(benchmarkConfig.heartbeatFreshnessMaxStallMs || ZERO),
              HEARTBEAT_FRESHNESS_LARGE_CLUSTER_MAX_STALL_MS,
            ),
          } :
          benchmarkConfig;
      const sutLoadResult = await runSutSharedLoad({
        nodeClient,
        seedNode,
        loadNodes: state.effectiveSutLoadNodes,
        createLoadGenerator: scenarioOverrides.createLoadGenerator,
        loadOpsPerSec: benchmarkConfig.loadOpsPerSec,
        loadDuration: benchmarkConfig.loadDuration,
        loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
        loadQueryTimeoutMs: benchmarkConfig.loadQueryTimeoutMs,
        loadNodeMaxInFlight: benchmarkConfig.loadNodeMaxInFlight,
        maxPendingQueueDepth: benchmarkConfig.maxPendingQueueDepth,
        earlyRejectOnQueueFull: benchmarkConfig.earlyRejectOnQueueFull,
        tableName: benchmarkTableName,
        nodeFailureThreshold: benchmarkConfig.nodeFailureThreshold,
        nodeFailureCooldownMs: benchmarkConfig.nodeFailureCooldownMs,
        requiredSchemaVersion: state.requiredSchemaVersion,
        benchmarkConfig: effectiveLoadBenchmarkConfig,
        runtimeAdmissionOwnership: state.runtimeAdmissionOwnership,
        onProgress: (message, details) =>
          emitPhaseProgress(phaseContext, message, details),
        progressHeartbeatIntervalMs:
          scenarioOverrides.progressHeartbeatIntervalMs,
      });
      state.loadMetrics = normalizeLoadMetrics(sutLoadResult.metrics);
      state.rebalancingPressure.load = sutLoadResult.rebalancingPressure;
      state.runtimeInternalSignalMessages = Array.isArray(
        sutLoadResult.internalSignalMessages,
      ) ?
        [...sutLoadResult.internalSignalMessages] :
        [];
      state.saturation = buildSaturationCounters({
        loadMetrics: state.loadMetrics,
        internalSignalMessages: state.runtimeInternalSignalMessages,
      });
      emitPhaseMeaningfulChange(
        phaseContext,
        'system-under-test load completed',
        {
          total: state.loadMetrics.total,
          failed: state.loadMetrics.failed,
          attemptErrors: Number(state.loadMetrics.attemptErrors || ZERO),
        },
      );
      const loadPinning = state.rebalancingPressure?.load?.pinning || {};
      if (
        loadPinning.enabled === true &&
        loadPinning.bypassed !== true &&
        loadPinning.violated === true
      ) {
        throw new Error(
          REBALANCING_WINDOW_PINNING_VIOLATION_REASON +
            ': ' +
            formatLoadRebalancingPinningReasons(loadPinning.violationReasons),
        );
      }
      state.heartbeatFreshnessResult =
        state.rebalancingPressure?.load?.heartbeatFreshness || null;
      state.strictBenchmarkGate.heartbeatFreshness =
        state.heartbeatFreshnessResult;
      const allowSoftHeartbeatFreshnessFallback =
        benchmarkConfig.allowPreloadStallSoftFallback === true &&
        state.quiescenceResult?.mode === 'degraded_soft_stall_fallback';
      if (state.heartbeatFreshnessResult?.failed === true) {
        if (allowSoftHeartbeatFreshnessFallback) {
          state.runtimeInternalSignalMessages.push(
            'heartbeat_freshness_degraded_soft_fallback',
          );
          emitPhaseProgress(
            phaseContext,
            'continuing despite heartbeat freshness degradation under soft preload fallback',
            {
              failureCount: Array.isArray(
                state.heartbeatFreshnessResult?.failures,
              ) ?
                state.heartbeatFreshnessResult.failures.length :
                ONE,
            },
          );
        } else {
          return {
            status: PHASE_STATUS.FAIL,
            artifacts: {
              sutLoadNodeIds: state.effectiveSutLoadNodes.map(
                (node) => node.id,
              ),
              loadMetrics: state.loadMetrics,
              rebalancingPressure: state.rebalancingPressure.load,
              heartbeatFreshness: state.heartbeatFreshnessResult,
              saturation: state.saturation,
              strictBenchmarkGate: state.strictBenchmarkGate,
            },
            errors: [
              HEARTBEAT_FRESHNESS_INVARIANT_FAILED_REASON +
                ': ' +
                formatHeartbeatFreshnessFailures(
                  state.heartbeatFreshnessResult,
                ),
            ],
          };
        }
      }
      const hardLoadFailures = collectLoadMetricHardFailures(state.loadMetrics);
      if (hardLoadFailures.length > ZERO) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: {
            sutLoadNodeIds: state.effectiveSutLoadNodes.map((node) => node.id),
            loadMetrics: state.loadMetrics,
            rebalancingPressure: state.rebalancingPressure.load,
            saturation: state.saturation,
            baselineSkipped: {
              status: BASELINE_STATUS_SKIPPED,
              reason: BASELINE_SKIP_REASON_SUT_HARD_LOAD_FAILURE,
              hardFailureCodes: hardLoadFailures.map((failure) =>
                String(failure.code || 'unknown'),
              ),
            },
          },
          errors: hardLoadFailures.map((failure) =>
            String(failure.message || failure),
          ),
        };
      }
      state.overloadPolicyResult = evaluateOverloadPolicy(state.loadMetrics, {
        strictOverloadPolicy: benchmarkConfig.strictOverloadPolicy === true,
        overloadPolicy: benchmarkConfig.overloadPolicy,
      });
      state.strictBenchmarkGate.overload = state.overloadPolicyResult;
      if (
        benchmarkConfig.strictOverloadPolicy === true &&
        state.overloadPolicyResult.status === DISCOVERY_GATE_STATUS_FAILED
      ) {
        throw new Error(
          OVERLOAD_POLICY_VIOLATION_REASON +
            ': ' +
            formatOverloadPolicyViolations(state.overloadPolicyResult),
        );
      }
      state.writePressureResult = evaluateWritePressure(state.loadMetrics, {
        strictWritePressure: benchmarkConfig.strictWritePressure === true,
        writePressureThresholds: benchmarkConfig.writePressureThresholds,
      });
      state.strictBenchmarkGate.writePressure = state.writePressureResult;
      if (
        benchmarkConfig.strictWritePressure === true &&
        state.writePressureResult.status === DISCOVERY_GATE_STATUS_FAILED
      ) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: {
            sutLoadNodeIds: state.effectiveSutLoadNodes.map((node) => node.id),
            loadMetrics: state.loadMetrics,
            rebalancingPressure: state.rebalancingPressure.load,
            loadParity: state.loadParity,
            overloadPolicyResult: state.overloadPolicyResult,
            writePressure: state.writePressureResult,
            saturation: state.saturation,
            strictBenchmarkGate: state.strictBenchmarkGate,
          },
          errors: [
            WRITE_PRESSURE_THRESHOLD_EXCEEDED_REASON +
              ': ' +
              formatWritePressureViolations(state.writePressureResult),
          ],
        };
      }

      const baselineLoadNodeCountForLoadPhase =
        resolveBaselineLoadNodeCountForRun({
          benchmarkConfig,
          targetSutLoadNodeCount,
          effectiveSutLoadNodeCount: state.effectiveSutLoadNodes.length,
        });
      const baseline = await resolveBaselineMetrics({
        cluster,
        benchmarkConfig,
        baselineLoadNodeCountOverride: baselineLoadNodeCountForLoadPhase,
        scenarioOverrides,
        provider,
        networkName,
        benchmarkTableName,
        onProgress: (message, details) =>
          emitPhaseProgress(phaseContext, message, details),
        progressHeartbeatIntervalMs:
          scenarioOverrides.progressHeartbeatIntervalMs,
      });
      state.baselineMetrics = baseline.baselineMetrics;
      state.baselineCacheMetadata = baseline.baselineCacheMetadata;
      state.baselinePrimaryContainerIp = baseline.baselinePrimaryContainerIp;
      state.baselineReplicaContainerIps = baseline.baselineReplicaContainerIps;
      state.baselineLoadNodeCount = baseline.baselineLoadNodeCount;
      state.baselinePoolMaxConnections = baseline.baselinePoolMaxConnections;
      emitPhaseMeaningfulChange(
        phaseContext,
        'baseline load comparison ready',
        {
          baselineOpsPerSec: Number(state.baselineMetrics?.opsPerSec || ZERO),
        },
      );
      state.loadParity = buildLoadParity({
        benchmarkConfig,
        benchmarkTableName,
        sutLoadNodes: state.effectiveSutLoadNodes,
        baselineLoadNodeCount: state.baselineLoadNodeCount,
        baselinePoolMaxConnections: state.baselinePoolMaxConnections,
        nodeClientPolicySnapshot,
      });
      state.strictBenchmarkGate.parity = buildStrictParityGate({
        strictParity: benchmarkConfig.strictParity === true,
        parity: state.loadParity,
      });
      const strictParityMismatch =
        benchmarkConfig.strictParity === true &&
        state.loadParity.status === LOAD_PARITY_STATUS_MISMATCHED;
      const shouldFailOnParityMismatch =
        strictParityMismatch ||
        (benchmarkConfig.failOnLoadParityMismatch &&
          state.loadParity.status === LOAD_PARITY_STATUS_MISMATCHED);
      if (shouldFailOnParityMismatch) {
        const mismatchPrefix = strictParityMismatch ?
          STRICT_PARITY_REASON_MISMATCH :
          'load_parity_mismatch';
        throw new Error(
          mismatchPrefix + ': ' + formatLoadParityReasons(state.loadParity),
        );
      }

      assert.ok(
        state.loadMetrics.total > ZERO,
        'System-under-test load run produced no operations',
      );
      assert.ok(
        Number(state.baselineMetrics?.opsPerSec || ZERO) > ZERO,
        'Postgres baseline load run produced zero throughput',
      );

      return {
        status: PHASE_STATUS.OK,
        artifacts: {
          sutLoadNodeIds: state.effectiveSutLoadNodes.map((node) => node.id),
          loadMetrics: state.loadMetrics,
          rebalancingPressure: state.rebalancingPressure.load,
          loadParity: state.loadParity,
          overloadPolicyResult: state.overloadPolicyResult,
          writePressure: state.writePressureResult,
          saturation: state.saturation,
          strictBenchmarkGate: state.strictBenchmarkGate,
          baselineCache: state.baselineCacheMetadata,
          baselineOpsPerSec: Number(state.baselineMetrics?.opsPerSec || ZERO),
        },
      };
    },
    [SCENARIO_PHASE.POST_LOAD_DRAIN]: async (phaseContext) => {
      emitPhaseProgress(phaseContext, 'waiting for post-load drain', {
        admittedNodeIds: state.effectiveSutLoadNodes.map((node) => node.id),
      });
      try {
        const postLoadDrainResult = await waitForSutLoadQuiescence({
          nodeClient,
          loadNodes: state.effectiveSutLoadNodes,
          seedNode,
          snapshotNodes: state.effectiveSutLoadNodes,
          tableName: benchmarkTableName,
          timeoutMs: benchmarkConfig.postLoadDrainTimeoutMs,
          pollIntervalMs: benchmarkConfig.postLoadDrainPollIntervalMs,
          stableWindowMs: benchmarkConfig.postLoadDrainStableWindowMs,
          noProgressTimeoutMs: benchmarkConfig.postLoadDrainNoProgressTimeoutMs,
          runtimeAdmissionOwnership: state.runtimeAdmissionOwnership,
          timing: scenarioOverrides.timing,
        });
        state.postLoadDrain = {
          status: POST_LOAD_DRAIN_STATUS_OK,
          mode: postLoadDrainResult.mode,
          attempts: postLoadDrainResult.attempts,
          stableElapsedMs: postLoadDrainResult.stableElapsedMs,
          error: null,
          reasonHistogram: postLoadDrainResult.reasonHistogram || {},
          partitionGroupInFlight:
            postLoadDrainResult.partitionGroupInFlight || {},
          includedNodeIds:
            postLoadDrainResult.includedNodeIds ||
            postLoadDrainResult.readyLoadNodes.map((node) => node.id),
          excludedNodeIds: postLoadDrainResult.excludedLoadNodeIds,
        };
        state.rebalancingPressure.postLoadDrain =
          buildPostLoadDrainRebalancingPressure(
            state.postLoadDrain,
            benchmarkConfig,
          );
        emitPhaseMeaningfulChange(phaseContext, 'post-load drain complete', {
          includedNodeIds: state.postLoadDrain.includedNodeIds,
          excludedNodeIds: state.postLoadDrain.excludedNodeIds,
        });
        return {
          status: PHASE_STATUS.OK,
          artifacts: {
            ...state.postLoadDrain,
            rebalancingPressure: state.rebalancingPressure.postLoadDrain,
          },
        };
      } catch (error) {
        const gateResult = error?.gateResult || {};
        const stalledReason =
          Object.keys(gateResult.reasonHistogram || {}).find((reason) =>
            String(reason || '').includes(NO_PROGRESS_REASON_CODE),
          ) || null;
        if (stalledReason) {
          emitPhaseNoProgressFailure(
            phaseContext,
            'post-load drain aborted for no progress',
            {
              reason: stalledReason,
              attempts: Number(gateResult.attempts || ZERO),
              stableElapsedMs: Number(gateResult.stableElapsedMs || ZERO),
              budgetMs: benchmarkConfig.postLoadDrainNoProgressTimeoutMs,
            },
          );
        }
        state.postLoadDrain = {
          status: POST_LOAD_DRAIN_STATUS_FAILED,
          mode: gateResult.mode || POST_LOAD_DRAIN_MODE_FAILED,
          attempts: Number(gateResult.attempts || ZERO),
          stableElapsedMs: Number(gateResult.stableElapsedMs || ZERO),
          error: String(error?.message || error),
          reasonHistogram: gateResult.reasonHistogram || {},
          partitionGroupInFlight: gateResult.partitionGroupInFlight || {},
          includedNodeIds: gateResult.includedNodeIds || [],
          excludedNodeIds: gateResult.excludedNodeIds || [],
        };
        state.rebalancingPressure.postLoadDrain =
          buildPostLoadDrainRebalancingPressure(
            state.postLoadDrain,
            benchmarkConfig,
          );
        state.consistencyVerdict = CONSISTENCY_VERDICT.INSUFFICIENT_EVIDENCE;
        if (
          benchmarkConfig.insufficientEvidencePolicy === ASSERTION_POLICY.HARD
        ) {
          return {
            status: PHASE_STATUS.FAIL,
            artifacts: {
              ...state.postLoadDrain,
              rebalancingPressure: state.rebalancingPressure.postLoadDrain,
            },
            errors: [
              'Post-load drain gate failed and policy requires hard failure: ' +
                state.postLoadDrain.error,
            ],
          };
        }
        return {
          status: PHASE_STATUS.WARN,
          artifacts: {
            ...state.postLoadDrain,
            rebalancingPressure: state.rebalancingPressure.postLoadDrain,
          },
          warnings: [
            'Post-load drain gate failed: ' + state.postLoadDrain.error,
          ],
        };
      }
    },
  };
}
