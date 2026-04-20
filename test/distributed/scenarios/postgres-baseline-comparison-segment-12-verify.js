import { POSTGRES_BASELINE_COMPARISON_SEGMENT_11 } from "./postgres-baseline-comparison-segment-11.js";
const {
  AUTHORITATIVE_FALLBACK_THRESHOLD_EXCEEDED_REASON,
  BASELINE_SKIP_REASON_SUT_HARD_LOAD_FAILURE,
  BASELINE_STATUS_SKIPPED,
  BENCHMARK_EVENT_TABLE_FALLBACK,
  BENCHMARK_METADATA_STAGE_CREATE_COMMITTED,
  BENCHMARK_TABLE_CREATE_LARGE_CLUSTER_RETRY_TIMEOUT_MS,
  BENCHMARK_WORKLOAD_OPERATIONS,
  BENCHMARK_WORKLOAD_PROFILE,
  CDC_TELEMETRY_SCHEMA_MISSING_REASON,
  CDC_TELEMETRY_SCHEMA_VERSION,
  DISCOVERY_GATE_REASON_INSUFFICIENT_REACHABLE_NODES,
  DISCOVERY_GATE_STATUS_FAILED,
  DISCOVERY_GATE_STATUS_PASSED,
  HEARTBEAT_FRESHNESS_INVARIANT_FAILED_REASON,
  HEARTBEAT_FRESHNESS_LARGE_CLUSTER_MAX_STALL_MS,
  INTERNAL_SIGNAL_THRESHOLD_BREACH_REASON,
  LOAD_PARITY_STATUS_MISMATCHED,
  NODE_CLIENT_TRANSIENT_CONTEXT,
  NO_PROGRESS_REASON_CODE,
  ONE,
  OVERLOAD_POLICY_VIOLATION_REASON,
  POST_LOAD_DRAIN_MODE_FAILED,
  POST_LOAD_DRAIN_STATUS_FAILED,
  POST_LOAD_DRAIN_STATUS_OK,
  PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD,
  PRELOAD_QUIESCENCE_LARGE_CLUSTER_MAX_REPLICA_OPS_IN_FLIGHT,
  PRELOAD_QUIESCENCE_LARGE_CLUSTER_STABLE_WINDOW_MS,
  QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX,
  QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX,
  QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX,
  QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX,
  QUIET_MODE_ACTIVE_PHASES,
  QUIET_MODE_REASON_RUN_FINALIZE,
  QUIET_MODE_REASON_STRICT_BENCHMARK_MODE,
  REBALANCING_PRESSURE_SCHEMA_VERSION,
  REBALANCING_WINDOW_PINNING_VIOLATION_REASON,
  REQUIRED_SCHEMA_VERSION_UNAVAILABLE_REASON,
  ROOT_CAUSE_SNAPSHOT_KIND_CONTROL_SNAPSHOT,
  ROOT_CAUSE_SNAPSHOT_KIND_PREFLIGHT_CRITICAL_PATH,
  SNAPSHOT_REFRESH_WARNING_PREFIX,
  SNAPSHOT_REFRESH_WARNING_SKIPPED,
  SNAPSHOT_REFRESH_WARNING_UNRESOLVED,
  SNAPSHOT_WARNING_PREFIX,
  STRICT_INVARIANT_RETRY_MIN_POLL_INTERVAL_MS,
  STRICT_PARITY_REASON_MISMATCH,
  STRICT_PRELOAD_READINESS_NODE_REASONS_PREFIX,
  STRICT_PRELOAD_READINESS_REASON_FAILED,
  SYSTEM_TABLE_READ_PATH_MODE_CANONICAL,
  WRITE_PRESSURE_THRESHOLD_EXCEEDED_REASON,
  ZERO,
  CONSISTENCY_VERDICT,
  NODE_CLIENT_CONTEXT_KEYS,
  PHASE_STATUS,
  SCENARIO_PHASE,
  aggregateDiscoveryReadinessExclusionsByNodeId,
  buildAdmissionRuntimeOwnershipSummary,
  buildBenchmarkMetadataFlow,
  buildCdcTelemetryState,
  buildComparison,
  buildEffectiveAdmissionPolicy,
  buildFailedPhaseDiagnostics,
  buildQuietModeDetails,
  buildInternalSignalCounts,
  buildLoadParity,
  buildNoProgressDiagnostics,
  buildPhaseDecisions,
  buildPhaseReasonSummary,
  buildPostLoadDrainRebalancingPressure,
  buildPreLoadRebalancingPressure,
  buildSaturationCounters,
  buildStartupDecisionRecord,
  buildStrictDiscoveryGate,
  buildStrictParityGate,
  buildUnifiedFailureArtifact,
  buildVerificationArtifacts,
  collectAdminQueryTraceByNodeId,
  collectBenchmarkMetadataSnapshot,
  collectCdcTelemetryByNode,
  collectControlSnapshotsFromNodes,
  createAdmissionRuntimeOwnershipAudit,
  createEmptyInternalSignalClassCounts,
  createEmptySaturationCounters,
  createInitialPostLoadDrain,
  createVerificationSnapshotRefreshResult,
  emitPhaseMeaningfulChange,
  emitPhaseNoProgressFailure,
  emitPhaseProgress,
  emitScenarioPhaseEvent,
  ensureSutBenchmarkTable,
  evaluateAssertionPolicy,
  evaluateAuthoritativeFallbackPolicy,
  evaluateInternalSignalThresholds,
  evaluateOverloadPolicy,
  evaluateStrictPreloadInvariantsFromSnapshots,
  evaluateWritePressure,
  formatAuthoritativeFallbackViolations,
  formatCdcTelemetrySchemaErrors,
  formatHeartbeatFreshnessFailures,
  formatInternalSignalBreaches,
  formatLoadParityReasons,
  formatLoadRebalancingPinningReasons,
  formatOverloadPolicyViolations,
  formatReadinessReasonsByNodeId,
  formatSutLoadDiscoveryDiagnostics,
  formatWritePressureViolations,
  isLoadNodeCandidate,
  isStrictBenchmarkMode,
  mapPhaseArtifacts,
  mapPhaseTimeline,
  normalizeLoadMetrics,
  parseDurationToMs,
  replaceSnapshotsByNodeId,
  resolveBaselineLoadNodeCountForRun,
  resolveBaselineMetrics,
  resolveBenchmarkConfig,
  resolveBenchmarkTableCreateAttempt,
  resolveCanonicalSystemTableWriteNode,
  resolveDiagnosticsCoverage,
  resolveFirstMismatchKind,
  resolveMismatchRefreshNodeIds,
  resolveNodeClientChannelPolicyOverrides,
  resolvePreflightConvergenceOptions,
  resolvePrimaryProvider,
  resolveScenarioOverrides,
  resolveStrictInvariantRetryWindowMs,
  resolveSutLoadNodes,
  resolveSystemTableReadPath,
  revalidateDegradedPreloadLoadNodes,
  runSutSharedLoad,
  selectFailureDiagnosticNodes,
  selectStrictInvariantGateEntries,
  selectVerificationNodes,
  shouldRetryStrictInvariantBreaches,
  assertConsistencyFromSnapshots,
  exitQuietMode,
  uniqueSorted,
  waitForSutBenchmarkTableReady,
  waitForSutLoadQuiescence,
} = POSTGRES_BASELINE_COMPARISON_SEGMENT_11;

export function buildVerificationPhaseHandlers(context) {
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
    effectiveSutLoadDiscoveryTimeoutMs,
    provider,
    networkName,
    nodeClientPolicySnapshot,
    strictBenchmarkMode,
    consistencyEvaluator,
  } = context;

  return {
    [SCENARIO_PHASE.VERIFY]: async (phaseContext) => {
      emitPhaseProgress(phaseContext, "collecting verification snapshots", {
        verificationCandidateCount: state.effectiveSutLoadNodes.length,
      });
      const verificationNodes = selectVerificationNodes(
        state.effectiveSutLoadNodes,
        state.postLoadDrain,
      );
      state.verificationNodeIds = verificationNodes.map((node) => node.id);
      const verificationNodeSet = new Set(state.verificationNodeIds);
      state.verificationExcludedNodeIds = state.effectiveSutLoadNodes
        .map((node) => node.id)
        .filter((nodeId) => !verificationNodeSet.has(nodeId));

      const initialSnapshotCollection = await collectControlSnapshotsFromNodes(
        nodeClient,
        verificationNodes,
        {
          context: NODE_CLIENT_TRANSIENT_CONTEXT,
          warningPrefix: SNAPSHOT_WARNING_PREFIX,
        },
      );
      let snapshots = initialSnapshotCollection.snapshots;
      const snapshotWarnings = [...initialSnapshotCollection.warnings];
      let evaluation =
        state.verificationNodeIds.length <= ONE
          ? {
              verdict: CONSISTENCY_VERDICT.CONSISTENT,
              hardFailure: false,
              coverage: {
                reachableNodes: state.verificationNodeIds.length,
                snapshotNodes: snapshots.length,
              },
              mismatches: [],
              evidenceWarnings: [],
            }
          : consistencyEvaluator.evaluate({
              reachableNodeIds: state.verificationNodeIds,
              snapshots,
            });
      const snapshotRefresh = createVerificationSnapshotRefreshResult();
      const hasMismatches =
        Array.isArray(evaluation.mismatches) &&
        evaluation.mismatches.length > ZERO;
      if (hasMismatches && state.verificationNodeIds.length > ONE) {
        const verificationNodeById = new Map();
        for (const node of verificationNodes) {
          const nodeId = String(node?.id || "");
          if (nodeId.length > ZERO) {
            verificationNodeById.set(nodeId, node);
          }
        }
        snapshotRefresh.attempted = true;
        snapshotRefresh.triggerMismatchKind = resolveFirstMismatchKind(
          evaluation.mismatches,
        );
        snapshotRefresh.targetNodeIds = resolveMismatchRefreshNodeIds(
          evaluation.mismatches,
          state.verificationNodeIds,
        );

        const refreshNodes = snapshotRefresh.targetNodeIds
          .map((nodeId) => verificationNodeById.get(nodeId) || null)
          .filter(Boolean);
        if (refreshNodes.length > ZERO) {
          const refreshSnapshotCollection =
            await collectControlSnapshotsFromNodes(nodeClient, refreshNodes, {
              context: {
                ...NODE_CLIENT_TRANSIENT_CONTEXT,
                [NODE_CLIENT_CONTEXT_KEYS.FORCE_AUTHORITATIVE_REPAIR]: true,
              },
              warningPrefix: SNAPSHOT_REFRESH_WARNING_PREFIX,
            });
          snapshotWarnings.push(...refreshSnapshotCollection.warnings);
          for (const snapshot of refreshSnapshotCollection.snapshots) {
            const nodeId = String(snapshot?.nodeId || "");
            if (nodeId.length > ZERO) {
              snapshotRefresh.refreshedNodeIds.push(nodeId);
            }
          }
          for (const warning of refreshSnapshotCollection.warnings) {
            const [nodeId] = String(warning)
              .replace(SNAPSHOT_REFRESH_WARNING_PREFIX, "")
              .split("=");
            if (nodeId) {
              snapshotRefresh.failedNodeIds.push(nodeId);
            }
          }
          if (refreshSnapshotCollection.snapshots.length > ZERO) {
            snapshots = replaceSnapshotsByNodeId(
              snapshots,
              refreshSnapshotCollection.snapshots,
            );
            evaluation = consistencyEvaluator.evaluate({
              reachableNodeIds: state.verificationNodeIds,
              snapshots,
            });
            snapshotRefresh.resolved = evaluation.mismatches.length === ZERO;
            if (evaluation.mismatches.length > ZERO) {
              snapshotWarnings.push(SNAPSHOT_REFRESH_WARNING_UNRESOLVED);
            }
          }
        } else {
          snapshotRefresh.resolved = false;
          snapshotWarnings.push(SNAPSHOT_REFRESH_WARNING_SKIPPED);
        }
      }
      state.verificationSnapshotRefresh = snapshotRefresh;
      const evidenceWarnings = [
        ...evaluation.evidenceWarnings,
        ...snapshotWarnings,
      ];
      let consistencyVerdict = evaluation.verdict;
      if (
        consistencyVerdict === CONSISTENCY_VERDICT.CONSISTENT &&
        evidenceWarnings.length > ZERO
      ) {
        consistencyVerdict = CONSISTENCY_VERDICT.INSUFFICIENT_EVIDENCE;
      }
      if (
        consistencyVerdict === CONSISTENCY_VERDICT.CONSISTENT &&
        state.postLoadDrain.status === POST_LOAD_DRAIN_STATUS_FAILED
      ) {
        consistencyVerdict = CONSISTENCY_VERDICT.INSUFFICIENT_EVIDENCE;
      }
      state.consistencyVerdict = consistencyVerdict;
      state.consistencyEvaluation = {
        coverage: evaluation.coverage,
        mismatches: evaluation.mismatches,
        evidenceWarnings,
      };

      assertConsistencyFromSnapshots(snapshots);
      state.consistencyResult = { attempts: ONE };
      emitPhaseMeaningfulChange(
        phaseContext,
        "verification consistency evaluated",
        {
          verdict: state.consistencyVerdict,
          snapshotCount: snapshots.length,
        },
      );

      state.assertionPolicyResult = evaluateAssertionPolicy({
        consistencyVerdict: state.consistencyVerdict,
        invariants: selectStrictInvariantGateEntries(
          state.preLoadInvariantEvaluation.invariants,
        ),
        loadMetrics: state.loadMetrics,
        policy: {
          insufficientEvidence: benchmarkConfig.insufficientEvidencePolicy,
        },
      });

      state.internalSignalCounts = buildInternalSignalCounts(
        state.loadMetrics,
        scenarioOverrides,
        state.runtimeInternalSignalMessages,
      );
      state.internalSignalThresholdResult = evaluateInternalSignalThresholds(
        state.internalSignalCounts,
        benchmarkConfig.internalSignalThresholds,
      );
      const cdcTelemetryRawByNode = await collectCdcTelemetryByNode(
        nodeClient,
        verificationNodes,
        scenarioOverrides,
      );
      state.cdcTelemetry = buildCdcTelemetryState({
        rawByNode: cdcTelemetryRawByNode,
        requiredNodeIds: state.verificationNodeIds,
        strict: benchmarkConfig.strictCdcTelemetrySchema === true,
      });
      state.authoritativeFallbackResult = evaluateAuthoritativeFallbackPolicy(
        state.cdcTelemetry,
        {
          strictAuthoritativeFallback:
            benchmarkConfig.strictAuthoritativeFallback === true,
          authoritativeFallbackThresholds:
            benchmarkConfig.authoritativeFallbackThresholds,
        },
      );
      state.strictBenchmarkGate.authoritativeFallback =
        state.authoritativeFallbackResult;
      if (
        benchmarkConfig.strictCdcTelemetrySchema === true &&
        state.cdcTelemetry.schema.valid !== true
      ) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: buildVerificationArtifacts(state, {
            includeLoadMetrics: true,
          }),
          errors: [
            CDC_TELEMETRY_SCHEMA_MISSING_REASON +
              ": " +
              formatCdcTelemetrySchemaErrors(state.cdcTelemetry),
          ],
        };
      }
      if (
        benchmarkConfig.strictAuthoritativeFallback === true &&
        state.authoritativeFallbackResult.status ===
          DISCOVERY_GATE_STATUS_FAILED
      ) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: buildVerificationArtifacts(state, {
            includeLoadMetrics: true,
          }),
          errors: [
            AUTHORITATIVE_FALLBACK_THRESHOLD_EXCEEDED_REASON +
              ": " +
              formatAuthoritativeFallbackViolations(
                state.authoritativeFallbackResult,
              ),
          ],
        };
      }
      if (
        state.internalSignalThresholdResult.failOnThresholdBreach &&
        state.internalSignalThresholdResult.breached
      ) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: buildVerificationArtifacts(state, {
            includeLoadMetrics: true,
          }),
          errors: [
            INTERNAL_SIGNAL_THRESHOLD_BREACH_REASON +
              ": " +
              formatInternalSignalBreaches(state.internalSignalThresholdResult),
          ],
        };
      }

      if (state.assertionPolicyResult.passed !== true) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: buildVerificationArtifacts(state, {
            includeLoadMetrics: true,
          }),
          errors: state.assertionPolicyResult.hardFailures.map((failure) =>
            String(failure?.message || failure),
          ),
        };
      }

      const warnings = state.assertionPolicyResult.softWarnings.map((warning) =>
        String(warning?.message || warning),
      );
      return {
        status: warnings.length > ZERO ? PHASE_STATUS.WARN : PHASE_STATUS.OK,
        artifacts: buildVerificationArtifacts(state, {
          includeVerificationNodes: true,
          includeConsistencyAssertionAttempts: true,
        }),
        warnings,
      };
    },
    [SCENARIO_PHASE.TEARDOWN]: async () => ({
      status: PHASE_STATUS.OK,
      artifacts: (() => {
        exitQuietMode(
          state.quietMode,
          SCENARIO_PHASE.TEARDOWN,
          QUIET_MODE_REASON_RUN_FINALIZE,
        );
        return {
          complete: true,
          quietMode: buildQuietModeDetails(state.quietMode, {
            defaultActivePhases: QUIET_MODE_ACTIVE_PHASES,
          }),
        };
      })(),
    }),
  };
}
