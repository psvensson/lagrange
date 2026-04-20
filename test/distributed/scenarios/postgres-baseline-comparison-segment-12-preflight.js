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
  assert,
  GATE_RESULT_MODE,
  PHASE_STATUS,
  SCENARIO_PHASE,
  aggregateDiscoveryReadinessExclusionsByNodeId,
  buildAdmissionRuntimeOwnershipSummary,
  buildBenchmarkMetadataFlow,
  buildCdcTelemetryState,
  buildComparison,
  buildEffectiveAdmissionPolicy,
  buildFailedPhaseDiagnostics,
  buildInternalSignalCounts,
  buildLoadParity,
  buildNoProgressDiagnostics,
  buildPhaseDecisions,
  buildPhaseReasonSummary,
  buildQuietModeDetails,
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
  collectPreflightCriticalPathSnapshots,
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
  enterQuietMode,
  ensureSutBenchmarkTable,
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
  formatNodeProbeReasons,
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
  extractNodeProbeReasonsByNodeId,
  buildStrictPreloadNodeReasonSummary,
  markQuietModePhase,
  uniqueSorted,
  waitForSutBenchmarkTableReady,
  waitForSutLoadQuiescence,
} = POSTGRES_BASELINE_COMPARISON_SEGMENT_11;

export function buildPreflightPhaseHandlers(context) {
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
    recordBenchmarkMetadataSnapshot,
    recordConvergenceEvent,
  } = context;

  async function ensureConvergenceResolved() {
    if (state.convergence) {
      return state.convergence;
    }
    state.convergence = await cluster.waitForConvergence(
      resolvePreflightConvergenceOptions(
        cluster,
        benchmarkConfig,
        nodes.length,
      ),
    );
    state.diagnosticsCoverage = resolveDiagnosticsCoverage(state.convergence);
    return state.convergence;
  }

  return {
    [SCENARIO_PHASE.PRE_FLIGHT]: async (phaseContext) => {
      enterQuietMode(
        state.quietMode,
        SCENARIO_PHASE.PRE_FLIGHT,
        QUIET_MODE_REASON_STRICT_BENCHMARK_MODE,
      );
      emitPhaseProgress(phaseContext, "waiting for cluster convergence", {
        tableName: benchmarkTableName,
      });
      await ensureConvergenceResolved();
      emitPhaseMeaningfulChange(phaseContext, "cluster convergence resolved", {
        diagnosticsCoverage: state.diagnosticsCoverage?.status || null,
      });
      const systemTableReadPath = resolveSystemTableReadPath(seedNode, nodes);
      state.systemTableReadPath = {
        mode: systemTableReadPath.mode,
        candidateNodeIds: systemTableReadPath.nodes.map((node) =>
          String(node.id),
        ),
      };
      let tableMetadata;
      try {
        tableMetadata = await ensureSutBenchmarkTable(
          nodeClient,
          systemTableReadPath.nodes,
          benchmarkTableName,
          benchmarkConfig,
          benchmarkConfig.benchmarkTablePolicies,
          {
            timing: scenarioOverrides.timing,
          },
        );
      } catch (error) {
        const createAttempt = resolveBenchmarkTableCreateAttempt(error);
        if (createAttempt && typeof createAttempt === "object") {
          state.benchmarkMetadataFlow.createAttempt = createAttempt;
          if (
            createAttempt.metadataSnapshot &&
            typeof createAttempt.metadataSnapshot === "object"
          ) {
            recordBenchmarkMetadataSnapshot(createAttempt.metadataSnapshot);
          }
        }
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: {
            benchmarkTableName,
            benchmarkMetadataFlow: buildBenchmarkMetadataFlow(
              state,
              benchmarkTableName,
            ),
            systemTableReadPath: state.systemTableReadPath,
          },
          errors: [String(error?.message || error)],
        };
      }
      state.benchmarkMetadataFlow.createAttempt =
        tableMetadata?.createAttempt || null;
      state.requiredSchemaVersion =
        tableMetadata?.requiredSchemaVersion || null;
      state.requiredSchemaVersionSource =
        tableMetadata?.requiredSchemaVersionSourceField || null;
      state.requiredSchemaVersionMetadataNodeId =
        tableMetadata?.metadataNodeId || null;
      state.requiredSchemaTableId = tableMetadata?.tableId || null;
      emitPhaseMeaningfulChange(
        phaseContext,
        "benchmark table metadata resolved",
        {
          tableName: benchmarkTableName,
          tableId: state.requiredSchemaTableId,
          requiredSchemaVersion: state.requiredSchemaVersion,
        },
      );
      if (state.requiredSchemaVersion) {
        recordConvergenceEvent({
          type: "table_create_committed",
          nodeId: state.requiredSchemaVersionMetadataNodeId || seedNode.id,
          tableId: state.requiredSchemaTableId,
          tableName: benchmarkTableName,
          requiredSchemaVersion: state.requiredSchemaVersion,
        });
        recordConvergenceEvent({
          type: "cdc_emitted",
          nodeId: state.requiredSchemaVersionMetadataNodeId || seedNode.id,
          tableId: state.requiredSchemaTableId,
          tableName: benchmarkTableName,
          requiredSchemaVersion: state.requiredSchemaVersion,
          observedSchemaVersion: state.requiredSchemaVersion,
        });
      }
      if (
        benchmarkConfig.strictPreloadReadiness === true &&
        !state.requiredSchemaVersion
      ) {
        throw new Error(
          REQUIRED_SCHEMA_VERSION_UNAVAILABLE_REASON +
            ": table=" +
            benchmarkTableName,
        );
      }
      await waitForSutBenchmarkTableReady(
        nodeClient,
        systemTableReadPath.nodes,
        benchmarkTableName,
        {
          timeoutMs: benchmarkConfig.readyTimeoutMs,
          pollIntervalMs: benchmarkConfig.readyPollIntervalMs,
          timing: scenarioOverrides.timing,
        },
      );
      emitPhaseMeaningfulChange(
        phaseContext,
        "benchmark table ready on system-under-test",
        {
          tableName: benchmarkTableName,
          requiredSchemaVersion: state.requiredSchemaVersion,
        },
      );
      const createCommittedNode =
        systemTableReadPath.nodes.find(
          (node) =>
            node?.id ===
            (tableMetadata?.metadataNodeId ||
              tableMetadata?.writeNodeId ||
              null),
        ) || resolveCanonicalSystemTableWriteNode(systemTableReadPath.nodes);
      const createCommittedSnapshot = await collectBenchmarkMetadataSnapshot({
        nodeClient,
        node: createCommittedNode,
        tableName: benchmarkTableName,
        tableId: state.requiredSchemaTableId,
        requiredSchemaVersion: state.requiredSchemaVersion,
        stage: BENCHMARK_METADATA_STAGE_CREATE_COMMITTED,
        readinessState: null,
        probeError: null,
      });
      recordBenchmarkMetadataSnapshot(createCommittedSnapshot);
      const sutLoadResolution = await resolveSutLoadNodes(
        nodeClient,
        nodes,
        seedNode,
        {
          timeoutMs: effectiveSutLoadDiscoveryTimeoutMs,
          pollIntervalMs: benchmarkConfig.readyPollIntervalMs,
          timing: scenarioOverrides.timing,
          tableName: benchmarkTableName,
          tableId: state.requiredSchemaTableId,
          deferLocalReplicaReadiness:
            benchmarkConfig.strictPreloadReadiness === true,
          minReachableNodeCount: targetSutLoadNodeCount,
          strictMinReachable: benchmarkConfig.strictDiscovery === true,
          admissionRuntimeOwnership: state.runtimeAdmissionOwnership,
          allowSoftDiscoveryNodeFallback:
            benchmarkConfig.allowSoftDiscoveryNodeFallback === true,
        },
      );
      const sutLoadNodes = sutLoadResolution.nodes;
      state.sutLoadDiscovery = sutLoadResolution.diagnostics;
      state.strictDiscoveryGate = buildStrictDiscoveryGate({
        strictMinReachable: benchmarkConfig.strictDiscovery === true,
        requiredReachableNodeCount: targetSutLoadNodeCount,
        nodes: sutLoadNodes,
        diagnostics: state.sutLoadDiscovery,
      });
      state.strictBenchmarkGate.discovery = state.strictDiscoveryGate;
      const discoveryDiagnostics = formatSutLoadDiscoveryDiagnostics(
        state.sutLoadDiscovery,
      );
      const preflightArtifacts = {
        benchmarkTableName,
        requiredSchemaVersion: state.requiredSchemaVersion,
        requiredSchemaVersionSource: state.requiredSchemaVersionSource,
        requiredSchemaVersionMetadataNodeId:
          state.requiredSchemaVersionMetadataNodeId,
        requiredSchemaTableId: state.requiredSchemaTableId,
        benchmarkMetadataFlow: buildBenchmarkMetadataFlow(
          state,
          benchmarkTableName,
        ),
        effectiveReadyTimeoutMs: effectiveSutLoadDiscoveryTimeoutMs,
        systemTableReadPath: state.systemTableReadPath,
        sutLoadNodeIds: sutLoadNodes.map((node) => node.id),
        sutLoadDiscovery: state.sutLoadDiscovery,
        strictDiscoveryGate: state.strictDiscoveryGate,
        strictBenchmarkGate: state.strictBenchmarkGate,
        runtimeAdmissionOwnership: buildAdmissionRuntimeOwnershipSummary(
          state.runtimeAdmissionOwnership,
        ),
        quietMode: buildQuietModeDetails(state.quietMode, {
          defaultActivePhases: QUIET_MODE_ACTIVE_PHASES,
        }),
      };
      emitPhaseProgress(phaseContext, "discovered benchmark load candidates", {
        reachableNodeCount: sutLoadNodes.length,
        requiredNodeCount: targetSutLoadNodeCount,
      });
      if (benchmarkConfig.strictDiscovery === true) {
        const strictDiscoveryErrorDetail =
          DISCOVERY_GATE_REASON_INSUFFICIENT_REACHABLE_NODES +
          ": required=" +
          String(targetSutLoadNodeCount) +
          ", reachable=" +
          String(sutLoadNodes.length);
        if (sutLoadNodes.length < targetSutLoadNodeCount) {
          return {
            status: PHASE_STATUS.FAIL,
            artifacts: preflightArtifacts,
            errors: [
              "No discovered admin-ready load service nodes available for benchmark load" +
                " (" +
                strictDiscoveryErrorDetail +
                (discoveryDiagnostics.length > ZERO
                  ? ", " + discoveryDiagnostics
                  : "") +
                ")",
            ],
          };
        }
      } else {
        if (sutLoadNodes.length <= ZERO) {
          return {
            status: PHASE_STATUS.FAIL,
            artifacts: preflightArtifacts,
            errors: [
              "No discovered admin-ready load service nodes available for benchmark load" +
                (discoveryDiagnostics.length > ZERO
                  ? " (" + discoveryDiagnostics + ")"
                  : ""),
            ],
          };
        }
      }
      state.sutLoadNodes = sutLoadNodes;
      emitPhaseMeaningfulChange(
        phaseContext,
        "benchmark load candidates admitted",
        {
          admittedNodeIds: sutLoadNodes.map((node) => node.id),
        },
      );
      return {
        status: PHASE_STATUS.OK,
        artifacts: preflightArtifacts,
      };
    },
    [SCENARIO_PHASE.CONVERGE]: async (phaseContext) => {
      emitPhaseProgress(phaseContext, "confirming converged control plane");
      await ensureConvergenceResolved();
      emitPhaseMeaningfulChange(
        phaseContext,
        "convergence confirmation complete",
        {
          diagnosticsCoverage: state.diagnosticsCoverage?.status || null,
        },
      );
      return {
        status: PHASE_STATUS.OK,
        artifacts: {
          convergence: state.convergence,
          diagnosticsCoverage: state.diagnosticsCoverage,
        },
      };
    },
    [SCENARIO_PHASE.PRE_LOAD_GATE]: async (phaseContext) => {
      markQuietModePhase(state.quietMode, SCENARIO_PHASE.PRE_LOAD_GATE);
      emitPhaseProgress(
        phaseContext,
        "waiting for quiescent benchmark topology",
        {
          candidateNodeCount: state.sutLoadNodes.length,
        },
      );
      const preLoadStableWindowMs =
        benchmarkConfig.strictPreloadReadiness === true
          ? benchmarkConfig.preloadRequiredStableMs
          : benchmarkConfig.quiescentStableWindowMs;
      const effectivePreLoadStableWindowMs =
        benchmarkConfig.strictPreloadReadiness !== true &&
        nodes.length >= PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD
          ? Math.min(
              preLoadStableWindowMs,
              PRELOAD_QUIESCENCE_LARGE_CLUSTER_STABLE_WINDOW_MS,
            )
          : preLoadStableWindowMs;
      const preLoadQuiescentTimeoutMs =
        nodes.length >= PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD
          ? Math.max(
              benchmarkConfig.quiescentTimeoutMs,
              BENCHMARK_TABLE_CREATE_LARGE_CLUSTER_RETRY_TIMEOUT_MS,
            )
          : benchmarkConfig.quiescentTimeoutMs;
      const effectivePreloadMaxReplicaOpsInFlight =
        benchmarkConfig.strictPreloadReadiness !== true &&
        nodes.length >= PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD
          ? Math.max(
              benchmarkConfig.preloadMaxReplicaOpsInFlight,
              PRELOAD_QUIESCENCE_LARGE_CLUSTER_MAX_REPLICA_OPS_IN_FLIGHT,
            )
          : benchmarkConfig.preloadMaxReplicaOpsInFlight;
      let quiescenceResult;
      try {
        quiescenceResult = await waitForSutLoadQuiescence({
          nodeClient,
          loadNodes: state.sutLoadNodes,
          seedNode,
          snapshotNodes: state.sutLoadNodes,
          tableName: benchmarkTableName,
          timeoutMs: preLoadQuiescentTimeoutMs,
          pollIntervalMs: benchmarkConfig.quiescentPollIntervalMs,
          stableWindowMs: effectivePreLoadStableWindowMs,
          noProgressTimeoutMs: benchmarkConfig.quiescentNoProgressTimeoutMs,
          maxReplicaOpsInFlight: effectivePreloadMaxReplicaOpsInFlight,
          strictCanonicalReadiness:
            benchmarkConfig.strictPreloadReadiness === true,
          requiredSchemaVersion: state.requiredSchemaVersion,
          requiredSchemaTableId: state.requiredSchemaTableId,
          onConvergenceEvent: recordConvergenceEvent,
          onBenchmarkMetadataSnapshot: recordBenchmarkMetadataSnapshot,
          runtimeAdmissionOwnership: state.runtimeAdmissionOwnership,
          timing: scenarioOverrides.timing,
        });
      } catch (error) {
        const gateResult = error?.gateResult || {};
        const gateReasonKeys = Object.keys(gateResult.reasonHistogram || {});
        const includedNodeIdSet = new Set(
          Array.isArray(gateResult.includedNodeIds)
            ? gateResult.includedNodeIds.map((nodeId) => String(nodeId))
            : [],
        );
        const partialReadyLoadNodes = state.sutLoadNodes.filter((node) =>
          includedNodeIdSet.has(String(node?.id || "")),
        );
        const canUsePartialReadyFallback =
          benchmarkConfig.strictPreloadReadiness !== true &&
          nodes.length >= PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD &&
          partialReadyLoadNodes.length > ZERO &&
          gateReasonKeys.length > ZERO &&
          gateReasonKeys.every((reason) => {
            const normalizedReason = String(reason || "");
            return (
              normalizedReason.startsWith(
                QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX,
              ) ||
              normalizedReason.startsWith(
                QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX,
              ) ||
              normalizedReason.startsWith(
                QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX,
              )
            );
          });
        const canUseSoftStallFallback =
          benchmarkConfig.allowPreloadStallSoftFallback === true &&
          benchmarkConfig.strictPreloadReadiness !== true &&
          benchmarkConfig.strictDiscovery !== true &&
          state.sutLoadNodes.length > ZERO &&
          gateReasonKeys.length > ZERO &&
          gateReasonKeys.every((reason) => {
            const normalizedReason = String(reason || "");
            return (
              normalizedReason.startsWith(
                QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX,
              ) ||
              normalizedReason.startsWith(
                QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX,
              ) ||
              normalizedReason.startsWith(
                QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX,
              ) ||
              normalizedReason.startsWith(
                QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX,
              )
            );
          });
        const stalledReason =
          Object.keys(gateResult.reasonHistogram || {}).find((reason) =>
            String(reason || "").includes(NO_PROGRESS_REASON_CODE),
          ) || null;
        if (stalledReason) {
          emitPhaseNoProgressFailure(
            phaseContext,
            "pre-load gate aborted for no progress",
            {
              reason: stalledReason,
              attempts: Number(gateResult.attempts || ZERO),
              stableElapsedMs: Number(gateResult.stableElapsedMs || ZERO),
              budgetMs: benchmarkConfig.quiescentNoProgressTimeoutMs,
            },
          );
        }
        if (benchmarkConfig.strictPreloadReadiness === true) {
          const nodeReasonsByNodeId =
            extractNodeProbeReasonsByNodeId(gateResult);
          const formattedNodeReasons =
            formatNodeProbeReasons(nodeReasonsByNodeId);
          const strictPreloadReasonSummary =
            buildStrictPreloadNodeReasonSummary(gateResult);
          const saturation = buildSaturationCounters({
            reasonHistogram: gateResult.reasonHistogram,
          });
          const strictPreloadError =
            STRICT_PRELOAD_READINESS_REASON_FAILED +
            ": " +
            String(error?.message || error) +
            ", " +
            STRICT_PRELOAD_READINESS_NODE_REASONS_PREFIX +
            formattedNodeReasons;
          return {
            status: PHASE_STATUS.FAIL,
            artifacts: {
              strictPreloadReadiness: true,
              preloadRequiredStableMs: preLoadStableWindowMs,
              preloadMaxReplicaOpsInFlight:
                benchmarkConfig.preloadMaxReplicaOpsInFlight,
              quietMode: buildQuietModeDetails(state.quietMode, {
                defaultActivePhases: QUIET_MODE_ACTIVE_PHASES,
              }),
              nodeReasonsByNodeId,
              strictPreloadReasonCodeHistogram:
                strictPreloadReasonSummary.reasonCodeHistogram,
              strictPreloadStaleReplicaOperationAgeBuckets:
                strictPreloadReasonSummary.staleReplicaOperationAgeBuckets,
              versionConvergence: gateResult.versionConvergence || null,
              readinessTimeline: gateResult.readinessTimeline || [],
              benchmarkMetadataFlow: buildBenchmarkMetadataFlow(
                state,
                benchmarkTableName,
              ),
              saturation,
              gateResult: {
                mode: gateResult.mode || POST_LOAD_DRAIN_MODE_FAILED,
                attempts: Number(gateResult.attempts || ZERO),
                stableElapsedMs: Number(gateResult.stableElapsedMs || ZERO),
                includedNodeIds: gateResult.includedNodeIds || [],
                excludedNodeIds: gateResult.excludedNodeIds || [],
                reasonHistogram: gateResult.reasonHistogram || {},
                partitionGroupInFlight: gateResult.partitionGroupInFlight || {},
                replicaOperationTimelineByOperationId:
                  gateResult.replicaOperationTimelineByOperationId || {},
                readinessTimeline: gateResult.readinessTimeline || [],
              },
            },
            errors: [strictPreloadError],
          };
        }
        if (canUsePartialReadyFallback) {
          const partialReadyNodeIds = partialReadyLoadNodes.map((node) =>
            String(node.id),
          );
          const excludedLoadNodeIds = state.sutLoadNodes
            .map((node) => String(node.id))
            .filter((nodeId) => !includedNodeIdSet.has(nodeId));
          quiescenceResult = {
            mode: "degraded_partial_ready_timeout_fallback",
            attempts: Number(gateResult.attempts || ZERO),
            stableElapsedMs: Number(gateResult.stableElapsedMs || ZERO),
            inFlightCount: null,
            readyLoadNodes: partialReadyLoadNodes,
            excludedLoadNodeIds,
            partitionGroupInFlight: gateResult.partitionGroupInFlight || {},
            replicaOperationTimelineByOperationId:
              gateResult.replicaOperationTimelineByOperationId || {},
            reasonHistogram: gateResult.reasonHistogram || {},
            includedNodeIds: partialReadyNodeIds,
            excludedNodeIds: excludedLoadNodeIds,
            versionConvergence: gateResult.versionConvergence || null,
            readinessTimeline: gateResult.readinessTimeline || [],
          };
          emitPhaseProgress(
            phaseContext,
            "continuing with partial pre-load readiness after transient gate timeout",
            {
              includedNodeIds: partialReadyNodeIds,
              excludedNodeIds: excludedLoadNodeIds,
            },
          );
        } else if (canUseSoftStallFallback) {
          const fallbackReadyLoadNodes =
            partialReadyLoadNodes.length > ZERO
              ? partialReadyLoadNodes
              : state.sutLoadNodes.slice(
                  ZERO,
                  Math.max(
                    ONE,
                    Math.min(state.sutLoadNodes.length, targetSutLoadNodeCount),
                  ),
                );
          const fallbackReadyNodeIds = fallbackReadyLoadNodes.map((node) =>
            String(node.id),
          );
          const fallbackExcludedNodeIds = state.sutLoadNodes
            .map((node) => String(node.id))
            .filter((nodeId) => !fallbackReadyNodeIds.includes(nodeId));
          quiescenceResult = {
            mode: "degraded_soft_stall_fallback",
            attempts: Number(gateResult.attempts || ZERO),
            stableElapsedMs: Number(gateResult.stableElapsedMs || ZERO),
            inFlightCount: null,
            readyLoadNodes: fallbackReadyLoadNodes,
            excludedLoadNodeIds: fallbackExcludedNodeIds,
            partitionGroupInFlight: gateResult.partitionGroupInFlight || {},
            replicaOperationTimelineByOperationId:
              gateResult.replicaOperationTimelineByOperationId || {},
            reasonHistogram: gateResult.reasonHistogram || {},
            includedNodeIds: fallbackReadyNodeIds,
            excludedNodeIds: fallbackExcludedNodeIds,
            versionConvergence: gateResult.versionConvergence || null,
            readinessTimeline: gateResult.readinessTimeline || [],
          };
          emitPhaseProgress(
            phaseContext,
            "continuing with non-strict pre-load readiness after soft stall fallback",
            {
              includedNodeIds: fallbackReadyNodeIds,
              excludedNodeIds: fallbackExcludedNodeIds,
            },
          );
        } else {
          throw error;
        }
      }
      const shouldRevalidateDegradedPreloadNodes =
        quiescenceResult.mode !== GATE_RESULT_MODE.ALL_READY &&
        Array.isArray(quiescenceResult.readyLoadNodes) &&
        quiescenceResult.readyLoadNodes.length > ZERO;
      if (shouldRevalidateDegradedPreloadNodes) {
        emitPhaseProgress(
          phaseContext,
          "revalidating degraded pre-load fallback against load-lane admission",
          {
            candidateNodeIds: quiescenceResult.readyLoadNodes.map(
              (node) => node.id,
            ),
            mode: quiescenceResult.mode,
          },
        );
        const preloadFallbackLoadAdmission =
          await revalidateDegradedPreloadLoadNodes(
            nodeClient,
            quiescenceResult.readyLoadNodes,
            {
              tableName: benchmarkTableName,
              tableId: state.requiredSchemaTableId,
              admissionRuntimeOwnership: state.runtimeAdmissionOwnership,
            },
          );
        if (preloadFallbackLoadAdmission.excludedNodeIds.length > ZERO) {
          emitPhaseProgress(
            phaseContext,
            "excluded degraded pre-load fallback nodes that the load lane will reject",
            {
              admittedNodeIds: preloadFallbackLoadAdmission.admittedNodeIds,
              excludedNodeIds: preloadFallbackLoadAdmission.excludedNodeIds,
            },
          );
        }
        quiescenceResult = {
          ...quiescenceResult,
          readyLoadNodes: preloadFallbackLoadAdmission.nodes,
          excludedLoadNodeIds: uniqueSorted([
            ...(Array.isArray(quiescenceResult.excludedLoadNodeIds)
              ? quiescenceResult.excludedLoadNodeIds.map((nodeId) =>
                  String(nodeId),
                )
              : []),
            ...preloadFallbackLoadAdmission.excludedNodeIds,
          ]),
          preloadFallbackLoadAdmission: {
            candidateNodeIds: quiescenceResult.readyLoadNodes.map(
              (node) => node.id,
            ),
            admittedNodeIds: preloadFallbackLoadAdmission.admittedNodeIds,
            excludedNodeIds: preloadFallbackLoadAdmission.excludedNodeIds,
            probeReadinessByNodeId:
              preloadFallbackLoadAdmission.probeReadinessByNodeId,
            nodeAdmissionTraceByNodeId:
              preloadFallbackLoadAdmission.nodeAdmissionTraceByNodeId,
          },
        };
        if (quiescenceResult.readyLoadNodes.length === ZERO) {
          return {
            status: PHASE_STATUS.FAIL,
            artifacts: {
              mode: quiescenceResult.mode,
              attempts: quiescenceResult.attempts,
              stableElapsedMs: quiescenceResult.stableElapsedMs,
              includedNodeIds: [],
              excludedNodeIds: quiescenceResult.excludedLoadNodeIds,
              partitionGroupInFlight:
                quiescenceResult.partitionGroupInFlight || {},
              replicaOperationTimelineByOperationId:
                quiescenceResult.replicaOperationTimelineByOperationId || {},
              reasonHistogram: quiescenceResult.reasonHistogram || {},
              versionConvergence: quiescenceResult.versionConvergence || null,
              benchmarkMetadataFlow: buildBenchmarkMetadataFlow(
                state,
                benchmarkTableName,
              ),
              preloadFallbackLoadAdmission:
                quiescenceResult.preloadFallbackLoadAdmission,
              quietMode: buildQuietModeDetails(state.quietMode, {
                defaultActivePhases: QUIET_MODE_ACTIVE_PHASES,
              }),
            },
            errors: [
              "degraded pre-load fallback produced no strict load-admissible nodes" +
                (Object.keys(
                  quiescenceResult.preloadFallbackLoadAdmission
                    ?.probeReadinessByNodeId || {},
                ).length > ZERO
                  ? ": " +
                    formatReadinessReasonsByNodeId(
                      quiescenceResult.preloadFallbackLoadAdmission
                        .probeReadinessByNodeId,
                    )
                  : ""),
            ],
          };
        }
      }
      state.quiescenceResult = quiescenceResult;
      state.effectiveSutLoadNodes = quiescenceResult.readyLoadNodes;
      state.excludedSutLoadNodeIds = quiescenceResult.excludedLoadNodeIds;
      emitPhaseMeaningfulChange(phaseContext, "pre-load topology quiescent", {
        includedNodeIds: state.effectiveSutLoadNodes.map((node) => node.id),
        excludedNodeIds: state.excludedSutLoadNodeIds,
      });
      if (benchmarkConfig.strictPreloadReadiness === true) {
        const invariantSnapshotNodes =
          state.effectiveSutLoadNodes.length > ZERO
            ? state.effectiveSutLoadNodes
            : state.sutLoadNodes;
        const strictInvariantRetryPollIntervalMs = Math.max(
          benchmarkConfig.quiescentPollIntervalMs,
          STRICT_INVARIANT_RETRY_MIN_POLL_INTERVAL_MS,
        );
        const strictInvariantRetryWindowMs =
          resolveStrictInvariantRetryWindowMs(
            preLoadStableWindowMs,
            benchmarkConfig,
          );
        const strictInvariantRetryDeadlineMs =
          scenarioOverrides.timing.now() + strictInvariantRetryWindowMs;
        let strictInvariantRetryAttempts = ZERO;
        let preLoadSnapshotsByNodeId =
          invariantSnapshotNodes.length > ZERO
            ? await collectPreflightCriticalPathSnapshots({
                nodeClient,
                nodes: invariantSnapshotNodes,
              })
            : {};
        let strictInvariantEvaluation =
          evaluateStrictPreloadInvariantsFromSnapshots(
            preLoadSnapshotsByNodeId,
          );
        state.preLoadInvariantEvaluation =
          strictInvariantEvaluation.invariantEvaluation;
        let strictInvariantBreaches =
          strictInvariantEvaluation.strictInvariantBreaches;
        while (
          strictInvariantBreaches.hardCount > ZERO &&
          shouldRetryStrictInvariantBreaches(strictInvariantBreaches) &&
          scenarioOverrides.timing.now() < strictInvariantRetryDeadlineMs
        ) {
          strictInvariantRetryAttempts += ONE;
          emitPhaseProgress(
            phaseContext,
            "rechecking transient strict invariant breaches before hard fail",
            {
              retryAttempt: strictInvariantRetryAttempts,
              retryWindowMs: strictInvariantRetryWindowMs,
            },
          );
          await scenarioOverrides.timing.sleep(
            strictInvariantRetryPollIntervalMs,
          );
          preLoadSnapshotsByNodeId =
            invariantSnapshotNodes.length > ZERO
              ? await collectPreflightCriticalPathSnapshots({
                  nodeClient,
                  nodes: invariantSnapshotNodes,
                })
              : {};
          strictInvariantEvaluation =
            evaluateStrictPreloadInvariantsFromSnapshots(
              preLoadSnapshotsByNodeId,
            );
          state.preLoadInvariantEvaluation =
            strictInvariantEvaluation.invariantEvaluation;
          strictInvariantBreaches =
            strictInvariantEvaluation.strictInvariantBreaches;
        }
        state.strictBenchmarkGate.invariants = {
          status:
            strictInvariantBreaches.hardCount > ZERO
              ? PHASE_STATUS.FAIL
              : PHASE_STATUS.OK,
          totalCount: strictInvariantBreaches.totalCount,
          hardCount: strictInvariantBreaches.hardCount,
          softCount: strictInvariantBreaches.softCount,
          retryAttempts: strictInvariantRetryAttempts,
          retryWindowMs: strictInvariantRetryWindowMs,
          dominantInvariant: state.preLoadInvariantEvaluation.dominantInvariant,
          breaches: strictInvariantBreaches.failing,
        };
        if (strictInvariantBreaches.hardCount > ZERO) {
          return {
            status: PHASE_STATUS.FAIL,
            artifacts: {
              strictBenchmarkGate: state.strictBenchmarkGate,
              invariantBreaches: strictInvariantBreaches,
              quietMode: buildQuietModeDetails(state.quietMode, {
                defaultActivePhases: QUIET_MODE_ACTIVE_PHASES,
              }),
            },
            errors: strictInvariantBreaches.hardBreaches.map(
              (breach) =>
                "hard invariant breach: " +
                String(breach.reasonCode || breach.invariantId || "unknown"),
            ),
          };
        }
      }
      state.postLoadDrain = createInitialPostLoadDrain(
        state.effectiveSutLoadNodes,
        state.excludedSutLoadNodeIds,
      );
      state.rebalancingPressure.preLoadGate = buildPreLoadRebalancingPressure(
        quiescenceResult,
        benchmarkConfig,
      );
      assert.ok(
        state.effectiveSutLoadNodes.length > ZERO,
        "No quiescent system-under-test load nodes available for benchmark load",
      );
      return {
        status: PHASE_STATUS.OK,
        artifacts: {
          mode: quiescenceResult.mode,
          attempts: quiescenceResult.attempts,
          stableElapsedMs: quiescenceResult.stableElapsedMs,
          includedNodeIds: quiescenceResult.readyLoadNodes.map(
            (node) => node.id,
          ),
          excludedNodeIds: quiescenceResult.excludedLoadNodeIds,
          partitionGroupInFlight: quiescenceResult.partitionGroupInFlight || {},
          replicaOperationTimelineByOperationId:
            quiescenceResult.replicaOperationTimelineByOperationId || {},
          reasonHistogram: quiescenceResult.reasonHistogram || {},
          versionConvergence: quiescenceResult.versionConvergence || null,
          benchmarkMetadataFlow: buildBenchmarkMetadataFlow(
            state,
            benchmarkTableName,
          ),
          ...(quiescenceResult.preloadFallbackLoadAdmission
            ? {
                preloadFallbackLoadAdmission:
                  quiescenceResult.preloadFallbackLoadAdmission,
              }
            : {}),
          strictPreloadReadiness:
            benchmarkConfig.strictPreloadReadiness === true,
          preloadRequiredStableMs: preLoadStableWindowMs,
          preloadMaxReplicaOpsInFlight:
            benchmarkConfig.preloadMaxReplicaOpsInFlight,
          quietMode: buildQuietModeDetails(state.quietMode, {
            defaultActivePhases: QUIET_MODE_ACTIVE_PHASES,
          }),
        },
      };
    },
  };
}
