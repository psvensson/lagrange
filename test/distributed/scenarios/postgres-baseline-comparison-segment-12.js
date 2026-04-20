import { POSTGRES_BASELINE_COMPARISON_SEGMENT_11 } from "./postgres-baseline-comparison-segment-11.js";
import { buildPreflightPhaseHandlers } from "./postgres-baseline-comparison-segment-12-preflight.js";
import { buildLoadPhaseHandlers } from "./postgres-baseline-comparison-segment-12-load.js";
import { buildVerificationPhaseHandlers } from "./postgres-baseline-comparison-segment-12-verify.js";
const {
  assert,
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
  CONSISTENCY_VERDICT,
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
  NodeClient,
  ConsistencyEvaluatorV2,
  PhaseOrchestrator,
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
  buildRootCauseBundle,
  buildUnifiedFailureArtifact,
  buildVerificationArtifacts,
  collectAdminQueryTraceByNodeId,
  collectBenchmarkMetadataSnapshot,
  collectCdcTelemetryByNode,
  collectFailureControlSnapshots,
  collectPreflightCriticalPathSnapshots,
  collectControlSnapshotsFromNodes,
  createQuietModeState,
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
  exitQuietMode,
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
  normalizeRequiredSchemaVersion,
  normalizeTableName,
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
  summarizeInvariantBreaches,
  uniqueSorted,
  waitForSutBenchmarkTableReady,
  waitForSutLoadQuiescence,
} = POSTGRES_BASELINE_COMPARISON_SEGMENT_11;

async function run(cluster) {
  const nodes = cluster.getNodes();
  assert.ok(nodes.length >= ONE, "Scenario requires at least one node");

  const benchmarkConfig = resolveBenchmarkConfig(cluster);
  const scenarioOverrides = resolveScenarioOverrides(cluster);
  const seedNode = nodes.find((node) => node.role === "seed") || nodes[ZERO];
  assert.equal(
    typeof seedNode?.queryWithTimeout,
    "function",
    "Seed node must provide queryWithTimeout for NodeClient control channel",
  );
  assert.equal(
    typeof seedNode?.getReachabilityDiagnostics,
    "function",
    "Seed node must provide getReachabilityDiagnostics for probe channel",
  );
  const benchmarkTableName = normalizeTableName(
    benchmarkConfig.tableName,
    BENCHMARK_EVENT_TABLE_FALLBACK,
  );
  const provider = resolvePrimaryProvider(cluster);
  const networkName = String(cluster?._networkName || "");
  assert.ok(networkName, "Cluster network name is not available");
  const nodeClientChannelPolicyOverrides =
    resolveNodeClientChannelPolicyOverrides(cluster);

  const nodeClient = new NodeClient({
    benchmarkConfig,
    ...(nodeClientChannelPolicyOverrides
      ? { channelPolicies: nodeClientChannelPolicyOverrides }
      : {}),
  });
  const nodeClientPolicySnapshot = nodeClient.getPolicySnapshot();
  const availableSutLoadCandidates = nodes.filter((node) =>
    isLoadNodeCandidate(node),
  ).length;
  const strictBenchmarkMode = isStrictBenchmarkMode(benchmarkConfig);
  const clusterCandidateLoadNodeCount = availableSutLoadCandidates;
  const explicitRequiredSutLoadNodeCount =
    benchmarkConfig.hasExplicitRequiredSutLoadNodeCount === true &&
    Number.isInteger(benchmarkConfig.requiredSutLoadNodeCount) &&
    benchmarkConfig.requiredSutLoadNodeCount > ZERO
      ? benchmarkConfig.requiredSutLoadNodeCount
      : null;
  const strictDefaultRequiredSutLoadNodeCount = Math.max(
    ONE,
    clusterCandidateLoadNodeCount,
  );
  const requestedSutLoadNodeCount =
    explicitRequiredSutLoadNodeCount !== null
      ? explicitRequiredSutLoadNodeCount
      : strictBenchmarkMode
        ? strictDefaultRequiredSutLoadNodeCount
        : Number.isInteger(benchmarkConfig.baselineLoadNodeCount) &&
            benchmarkConfig.baselineLoadNodeCount > ZERO
          ? benchmarkConfig.baselineLoadNodeCount
          : ONE;
  const targetSutLoadNodeCount =
    benchmarkConfig.strictDiscovery === true
      ? Math.max(ONE, requestedSutLoadNodeCount)
      : Math.max(
          ONE,
          Math.min(availableSutLoadCandidates, requestedSutLoadNodeCount),
        );
  const effectiveSutLoadDiscoveryTimeoutMs =
    benchmarkConfig.strictDiscovery === true &&
    benchmarkConfig.strictPreloadReadiness === true &&
    Number.isInteger(benchmarkConfig.quiescentTimeoutMs) &&
    benchmarkConfig.quiescentTimeoutMs > ZERO
      ? Math.max(
          benchmarkConfig.readyTimeoutMs,
          benchmarkConfig.quiescentTimeoutMs,
        )
      : benchmarkConfig.readyTimeoutMs;
  const baselineLoadNodeCountForRun = resolveBaselineLoadNodeCountForRun({
    benchmarkConfig,
    targetSutLoadNodeCount,
  });
  const strictFanoutOptOut =
    strictBenchmarkMode &&
    explicitRequiredSutLoadNodeCount !== null &&
    explicitRequiredSutLoadNodeCount < strictDefaultRequiredSutLoadNodeCount;
  const strictFanoutOptOutReason = strictFanoutOptOut
    ? "requiredSutLoadNodeCount=" +
      String(explicitRequiredSutLoadNodeCount) +
      ",clusterCandidateLoadNodeCount=" +
      String(clusterCandidateLoadNodeCount)
    : null;
  const consistencyEvaluator = new ConsistencyEvaluatorV2();
  const phaseEvents = [];
  const state = {
    convergence: null,
    convergenceTimeline: [],
    convergenceTimelineSignatures: new Set(),
    requiredSchemaVersion: null,
    requiredSchemaVersionSource: null,
    requiredSchemaVersionMetadataNodeId: null,
    requiredSchemaTableId: null,
    benchmarkMetadataFlow: {
      createCommitted: null,
      createAttempt: null,
      nodeSnapshots: {},
    },
    sutLoadNodes: [],
    sutLoadDiscovery: null,
    strictDiscoveryGate: null,
    strictBenchmarkGate: {
      discovery: null,
      invariants: null,
      parity: null,
      authoritativeFallback: null,
      overload: null,
      writePressure: null,
    },
    quietMode: createQuietModeState({
      enabled: benchmarkConfig.quietModeEnabled === true,
      activePhases: QUIET_MODE_ACTIVE_PHASES,
    }),
    systemTableReadPath: {
      mode: SYSTEM_TABLE_READ_PATH_MODE_CANONICAL,
      candidateNodeIds: [],
    },
    effectiveSutLoadNodes: [],
    excludedSutLoadNodeIds: [],
    quiescenceResult: null,
    preLoadInvariantEvaluation: {
      invariants: [],
      dominantInvariant: null,
      rootCauseCode: null,
      rootCauseClass: null,
    },
    loadMetrics: null,
    baselineMetrics: null,
    baselineCacheMetadata: null,
    baselinePrimaryContainerIp: null,
    baselineReplicaContainerIps: [],
    baselineLoadNodeCount: baselineLoadNodeCountForRun,
    baselinePoolMaxConnections: benchmarkConfig.loadMaxInFlight,
    loadParity: null,
    overloadPolicyResult: {
      strictOverloadPolicy: benchmarkConfig.strictOverloadPolicy === true,
      policy: benchmarkConfig.overloadPolicy,
      rejectedOperations: ZERO,
      queueDelayP99Ms: ZERO,
      status: DISCOVERY_GATE_STATUS_PASSED,
      violations: [],
    },
    authoritativeFallbackResult: evaluateAuthoritativeFallbackPolicy(null, {
      strictAuthoritativeFallback:
        benchmarkConfig.strictAuthoritativeFallback === true,
      authoritativeFallbackThresholds:
        benchmarkConfig.authoritativeFallbackThresholds,
    }),
    writePressureResult: evaluateWritePressure(null, {
      strictWritePressure: benchmarkConfig.strictWritePressure === true,
      writePressureThresholds: benchmarkConfig.writePressureThresholds,
    }),
    saturation: createEmptySaturationCounters(),
    internalSignalCounts: {
      errorsByClass: createEmptyInternalSignalClassCounts(),
      warningsByClass: createEmptyInternalSignalClassCounts(),
      messages: [],
    },
    runtimeInternalSignalMessages: [],
    internalSignalThresholdResult: {
      failOnThresholdBreach: false,
      breached: false,
      breaches: [],
    },
    cdcTelemetry: {
      schemaVersion: CDC_TELEMETRY_SCHEMA_VERSION,
      byNode: {},
      summary: {
        nodeCount: ZERO,
        totalSubscriberCount: ZERO,
        totalBufferedEvents: ZERO,
        maxCatchupLagEvents: ZERO,
        avgCatchupThroughputEventsPerSec: ZERO,
        catchupNodeCount: ZERO,
        steadyNodeCount: ZERO,
        authoritativeFallback: {
          totalCount: ZERO,
          windowCount: ZERO,
          steadyStateWindowCount: ZERO,
        },
      },
      schema: {
        strict: benchmarkConfig.strictCdcTelemetrySchema === true,
        valid: true,
        errors: [],
      },
    },
    rebalancingPressure: {
      schemaVersion: REBALANCING_PRESSURE_SCHEMA_VERSION,
      preLoadGate: null,
      load: null,
      postLoadDrain: null,
    },
    diagnosticsCoverage: resolveDiagnosticsCoverage(null),
    effectiveAdmissionPolicy: buildEffectiveAdmissionPolicy({
      benchmarkConfig,
      nodeClientPolicySnapshot,
      nodeClientChannelPolicyOverrides,
    }),
    runtimeAdmissionOwnership: createAdmissionRuntimeOwnershipAudit(),
    postLoadDrain: createInitialPostLoadDrain([], []),
    consistencyVerdict: CONSISTENCY_VERDICT.CONSISTENT,
    consistencyResult: { attempts: ZERO },
    consistencyEvaluation: {
      coverage: {
        reachableNodes: ZERO,
        snapshotNodes: ZERO,
      },
      mismatches: [],
      evidenceWarnings: [],
    },
    verificationSnapshotRefresh: createVerificationSnapshotRefreshResult(),
    verificationNodeIds: [],
    verificationExcludedNodeIds: [],
    assertionPolicyResult: evaluateAssertionPolicy({
      consistencyVerdict: CONSISTENCY_VERDICT.CONSISTENT,
      invariants: [],
      loadMetrics: {
        total: ONE,
        success: ONE,
        failed: ZERO,
        errors: ZERO,
        opsPerSec: ONE,
      },
      policy: {
        insufficientEvidence: benchmarkConfig.insufficientEvidencePolicy,
      },
    }),
  };

  function recordConvergenceEvent(event) {
    if (!event || typeof event !== "object") {
      return;
    }
    const normalizedEvent = {
      type: String(event.type || "unknown"),
      nodeId: typeof event.nodeId === "string" ? event.nodeId : null,
      tableId: typeof event.tableId === "string" ? event.tableId : null,
      tableName: typeof event.tableName === "string" ? event.tableName : null,
      requiredSchemaVersion: normalizeRequiredSchemaVersion(
        event.requiredSchemaVersion,
      ),
      observedSchemaVersion: normalizeRequiredSchemaVersion(
        event.observedSchemaVersion,
      ),
      reasons: Array.isArray(event.reasons)
        ? event.reasons.map((reason) => String(reason))
        : [],
      ready: event.ready === true,
      timestampMs: Number.isFinite(event.timestampMs)
        ? event.timestampMs
        : Date.now(),
    };
    const signature = JSON.stringify({
      type: normalizedEvent.type,
      nodeId: normalizedEvent.nodeId,
      tableId: normalizedEvent.tableId,
      tableName: normalizedEvent.tableName,
      requiredSchemaVersion: normalizedEvent.requiredSchemaVersion,
      observedSchemaVersion: normalizedEvent.observedSchemaVersion,
      reasons: normalizedEvent.reasons,
      ready: normalizedEvent.ready,
    });
    if (state.convergenceTimelineSignatures.has(signature)) {
      return;
    }
    state.convergenceTimelineSignatures.add(signature);
    state.convergenceTimeline.push(normalizedEvent);
  }

  function recordBenchmarkMetadataSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
      return;
    }
    const nodeId = typeof snapshot.nodeId === "string" ? snapshot.nodeId : null;
    if (snapshot.stage === BENCHMARK_METADATA_STAGE_CREATE_COMMITTED) {
      state.benchmarkMetadataFlow.createCommitted = snapshot;
    }
    if (!nodeId) {
      return;
    }
    state.benchmarkMetadataFlow.nodeSnapshots[nodeId] = snapshot;
  }

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

  const orchestrator = new PhaseOrchestrator({
    onEvent: (event) => {
      phaseEvents.push(event);
      emitScenarioPhaseEvent(scenarioOverrides.phaseEventSink, event);
    },
  });

  const phaseHandlerContext = {
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
    recordBenchmarkMetadataSnapshot,
    recordConvergenceEvent,
  };

  const phaseHandlers = {
    ...buildPreflightPhaseHandlers(phaseHandlerContext),
    ...buildLoadPhaseHandlers(phaseHandlerContext),
    ...buildVerificationPhaseHandlers(phaseHandlerContext),
  };

  let orchestrationResult = null;
  try {
    orchestrationResult = await orchestrator.run(phaseHandlers);
  } finally {
    exitQuietMode(
      state.quietMode,
      SCENARIO_PHASE.TEARDOWN,
      QUIET_MODE_REASON_RUN_FINALIZE,
    );
  }
  const failedPhase = orchestrationResult.phases.find(
    (phaseResult) => phaseResult.status === PHASE_STATUS.FAIL,
  );
  if (failedPhase) {
    const error = new Error(
      "postgres-baseline-comparison failed in phase " +
        failedPhase.phase +
        ": " +
        failedPhase.errors.join("; "),
    );
    const failureArtifact = buildUnifiedFailureArtifact(
      failedPhase,
      benchmarkConfig,
      {
        loadMetrics: state.loadMetrics,
      },
    );
    const failureDiagnosticNodes = selectFailureDiagnosticNodes({
      nodes,
      state,
      failureArtifact,
    });
    const shouldCapturePreflightSnapshots =
      failureArtifact.strictMode === true &&
      (failureArtifact.phase === SCENARIO_PHASE.PRE_FLIGHT ||
        failureArtifact.phase === SCENARIO_PHASE.PRE_LOAD_GATE);
    const snapshotNodes = failureDiagnosticNodes;
    const failureSnapshots =
      snapshotNodes.length > ZERO
        ? shouldCapturePreflightSnapshots
          ? {
              snapshotsByNodeId: await collectPreflightCriticalPathSnapshots({
                nodeClient,
                nodes: snapshotNodes,
                context: NODE_CLIENT_TRANSIENT_CONTEXT,
              }),
              controlPlaneLedgerSnapshotsByNodeId: null,
            }
          : await collectFailureControlSnapshots({
              nodeClient,
              nodes: snapshotNodes,
              context: NODE_CLIENT_TRANSIENT_CONTEXT,
            })
        : null;
    const snapshotsByNodeId = failureSnapshots?.snapshotsByNodeId || null;
    const snapshotKind = snapshotsByNodeId
      ? shouldCapturePreflightSnapshots
        ? ROOT_CAUSE_SNAPSHOT_KIND_PREFLIGHT_CRITICAL_PATH
        : ROOT_CAUSE_SNAPSHOT_KIND_CONTROL_SNAPSHOT
      : null;
    const adminQueryTraceByNodeId =
      failureDiagnosticNodes.length > ZERO
        ? collectAdminQueryTraceByNodeId(failureDiagnosticNodes)
        : null;
    const channelMetrics =
      typeof nodeClient?.getMetricsSnapshot === "function"
        ? nodeClient.getMetricsSnapshot()
        : null;
    const channelStateByChannel =
      typeof nodeClient?.getChannelStateSnapshot === "function"
        ? nodeClient.getChannelStateSnapshot()
        : null;
    const rootCauseBundle = buildRootCauseBundle({
      failureArtifact,
      snapshotsByNodeId,
      controlPlaneLedgerSnapshotsByNodeId:
        failureSnapshots?.controlPlaneLedgerSnapshotsByNodeId || null,
      adminQueryTraceByNodeId,
      snapshotKind,
      evaluateInvariants: shouldCapturePreflightSnapshots,
      channelMetrics,
      channelStateByChannel,
    });
    const noProgressDiagnostics = buildNoProgressDiagnostics(failedPhase);
    error.diagnostics = {
      failure: failureArtifact,
      loadMetrics: state.loadMetrics,
      failedPhase: buildFailedPhaseDiagnostics(failedPhase),
      noProgress: noProgressDiagnostics,
      invariantBreaches: summarizeInvariantBreaches(
        rootCauseBundle?.invariants,
      ),
      channelMetrics,
      channelStateByChannel,
      rootCauseBundle,
    };
    throw error;
  }

  const comparison = buildComparison(state.loadMetrics, state.baselineMetrics);
  const phaseDecisions = buildPhaseDecisions(
    orchestrationResult.phases,
    benchmarkConfig,
  );
  const startupDecisionRecord = buildStartupDecisionRecord(phaseDecisions);
  const sutLoadDiscoveryExcludedReadinessByNodeId =
    aggregateDiscoveryReadinessExclusionsByNodeId(state.sutLoadDiscovery);

  return {
    loadMetrics: state.loadMetrics,
    details: {
      benchmark: {
        tool: "shared-load-generator",
        workload: BENCHMARK_WORKLOAD_PROFILE,
        durationSeconds: parseDurationToMs(benchmarkConfig.loadDuration) / 1000,
        clients: benchmarkConfig.baselineLoadNodeCount,
        baselineLoadNodeCountConfigured: benchmarkConfig.baselineLoadNodeCount,
        baselineLoadNodeCountApplied: state.baselineLoadNodeCount,
        sutEligibleLoadNodeCount: state.sutLoadNodes.length,
        sutLoadNodeCount: state.effectiveSutLoadNodes.length,
        sutExcludedLoadNodeIds: state.excludedSutLoadNodeIds,
        strictMode: strictBenchmarkMode,
        strictDiscovery: benchmarkConfig.strictDiscovery === true,
        clusterCandidateLoadNodeCount,
        requestedSutLoadNodeCount,
        requiredSutLoadNodeCount: targetSutLoadNodeCount,
        explicitRequiredSutLoadNodeCount,
        strictFanoutOptOut,
        strictFanoutOptOutReason,
        strictParity: benchmarkConfig.strictParity === true,
        strictPreloadReadiness: benchmarkConfig.strictPreloadReadiness === true,
        strictCdcTelemetrySchema:
          benchmarkConfig.strictCdcTelemetrySchema === true,
        strictAuthoritativeFallback:
          benchmarkConfig.strictAuthoritativeFallback === true,
        strictOverloadPolicy: benchmarkConfig.strictOverloadPolicy === true,
        strictWritePressure: benchmarkConfig.strictWritePressure === true,
        quietMode: buildQuietModeDetails(state.quietMode, {
          defaultActivePhases: QUIET_MODE_ACTIVE_PHASES,
        }),
        authoritativeFallbackThresholds:
          benchmarkConfig.authoritativeFallbackThresholds,
        overloadPolicy: benchmarkConfig.overloadPolicy,
        writePressureThresholds: benchmarkConfig.writePressureThresholds,
        forceLocalSystemTableReadShortcut:
          benchmarkConfig.forceLocalSystemTableReadShortcut === true,
        systemTableReadPath: state.systemTableReadPath,
        requiredSchemaVersion: state.requiredSchemaVersion,
        requiredSchemaVersionSource: state.requiredSchemaVersionSource,
        requiredSchemaVersionMetadataNodeId:
          state.requiredSchemaVersionMetadataNodeId,
        requiredSchemaTableId: state.requiredSchemaTableId,
        benchmarkMetadataFlow: buildBenchmarkMetadataFlow(
          state,
          benchmarkTableName,
        ),
        convergenceTimeline: state.convergenceTimeline,
        strictDiscoveryGate: state.strictDiscoveryGate,
        strictBenchmarkGate: state.strictBenchmarkGate,
        jobs: benchmarkConfig.jobs,
        loadTargetOpsPerSec: benchmarkConfig.loadOpsPerSec,
        loadDuration: benchmarkConfig.loadDuration,
        loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
        loadQueryTimeoutMs: benchmarkConfig.loadQueryTimeoutMs,
        loadNodeMaxInFlight: benchmarkConfig.loadNodeMaxInFlight,
        maxPendingQueueDepth: benchmarkConfig.maxPendingQueueDepth,
        earlyRejectOnQueueFull: benchmarkConfig.earlyRejectOnQueueFull === true,
        failOnLoadParityMismatch: benchmarkConfig.failOnLoadParityMismatch,
        internalSignalThresholds: benchmarkConfig.internalSignalThresholds,
        internalSignalCounts: state.internalSignalCounts,
        internalSignalThresholdResult: state.internalSignalThresholdResult,
        cdcTelemetry: state.cdcTelemetry,
        authoritativeFallbackResult: state.authoritativeFallbackResult,
        overloadPolicyResult: state.overloadPolicyResult,
        writePressure: state.writePressureResult,
        saturation: state.saturation,
        nodeFailureThreshold: benchmarkConfig.nodeFailureThreshold || null,
        nodeFailureCooldownMs: benchmarkConfig.nodeFailureCooldownMs || null,
        quiescentTimeoutMs: benchmarkConfig.quiescentTimeoutMs,
        quiescentPollIntervalMs: benchmarkConfig.quiescentPollIntervalMs,
        quiescentStableWindowMs: benchmarkConfig.quiescentStableWindowMs,
        quiescentNoProgressTimeoutMs:
          benchmarkConfig.quiescentNoProgressTimeoutMs,
        preloadRequiredStableMs: benchmarkConfig.preloadRequiredStableMs,
        preloadMaxReplicaOpsInFlight:
          benchmarkConfig.preloadMaxReplicaOpsInFlight,
        pinRebalancingDuringLoad:
          benchmarkConfig.pinRebalancingDuringLoad === true,
        allowLoadRebalancePinningBypass:
          benchmarkConfig.allowLoadRebalancePinningBypass === true,
        rebalanceHysteresisCooldownMs:
          benchmarkConfig.rebalanceHysteresisCooldownMs,
        rebalanceHysteresisMinDelta:
          benchmarkConfig.rebalanceHysteresisMinDelta,
        loadRebalanceMonitorPollIntervalMs:
          benchmarkConfig.loadRebalanceMonitorPollIntervalMs,
        loadRebalanceMaxReplicaOpsInFlight:
          benchmarkConfig.loadRebalanceMaxReplicaOpsInFlight,
        rebalancingPressure: state.rebalancingPressure,
        consistencyAssertMaxAttempts:
          benchmarkConfig.consistencyAssertMaxAttempts,
        consistencyAssertRetryDelayMs:
          benchmarkConfig.consistencyAssertRetryDelayMs,
        consistencyAssertionAttempts: state.consistencyResult.attempts,
        sutLoadDiscovery: state.sutLoadDiscovery,
        sutLoadDiscoveryExcludedReadinessByNodeId,
        insufficientEvidencePolicy: benchmarkConfig.insufficientEvidencePolicy,
        postLoadDrainStatus: state.postLoadDrain.status,
        postLoadDrainMode: state.postLoadDrain.mode,
        postLoadDrainAttempts: state.postLoadDrain.attempts,
        postLoadDrainStableElapsedMs: state.postLoadDrain.stableElapsedMs,
        postLoadDrainNoProgressTimeoutMs:
          benchmarkConfig.postLoadDrainNoProgressTimeoutMs,
        postLoadDrainError: state.postLoadDrain.error,
        postLoadDrainReasonHistogram: state.postLoadDrain.reasonHistogram,
        postLoadDrainPartitionGroupInFlight:
          state.postLoadDrain.partitionGroupInFlight,
        postLoadDrainIncludedNodeIds: state.postLoadDrain.includedNodeIds,
        postLoadDrainExcludedNodeIds: state.postLoadDrain.excludedNodeIds,
        operations: BENCHMARK_WORKLOAD_OPERATIONS,
        tableName: benchmarkTableName,
        tablePolicies: benchmarkConfig.benchmarkTablePolicies,
      },
      parity: state.loadParity,
      strictBenchmarkGate: state.strictBenchmarkGate,
      overloadPolicyResult: state.overloadPolicyResult,
      writePressure: state.writePressureResult,
      saturation: state.saturation,
      effectiveAdmissionPolicy: state.effectiveAdmissionPolicy,
      baseline: {
        engine: "postgres",
        image: benchmarkConfig.baselineImage,
        containerIp: state.baselinePrimaryContainerIp,
        replicaContainerIps: state.baselineReplicaContainerIps,
        replicationFactor: benchmarkConfig.replicationFactor,
        syncReplicaAcks: benchmarkConfig.syncReplicaAcks,
        loadNodeCount: state.baselineLoadNodeCount,
        poolMaxConnections: state.baselinePoolMaxConnections,
        cache: state.baselineCacheMetadata,
        metrics: state.baselineMetrics,
      },
      systemUnderTest: {
        seedNodeId: seedNode.id,
        metrics: {
          opsPerSec: state.loadMetrics.opsPerSec,
          latency: state.loadMetrics.latency,
          total: state.loadMetrics.total,
          success: state.loadMetrics.success,
          failed: state.loadMetrics.failed,
          errors: state.loadMetrics.errors,
          attemptErrors: Number(state.loadMetrics.attemptErrors || ZERO),
          loadTargetOpsPerSec: benchmarkConfig.loadOpsPerSec,
          loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
        },
      },
      comparison,
      convergence: state.convergence,
      verification: {
        verdict: state.consistencyVerdict,
        confidence: state.assertionPolicyResult.verificationConfidence,
        hardFailures: state.assertionPolicyResult.hardFailures,
        softWarnings: state.assertionPolicyResult.softWarnings,
        invariantBreaches: state.assertionPolicyResult.invariantBreaches,
        coverage: state.consistencyEvaluation.coverage,
        mismatches: state.consistencyEvaluation.mismatches,
        evidenceWarnings: state.consistencyEvaluation.evidenceWarnings,
        snapshotRefresh: state.verificationSnapshotRefresh,
        verificationNodeIds: state.verificationNodeIds,
        verificationExcludedNodeIds: state.verificationExcludedNodeIds,
      },
      policy: {
        insufficientEvidence:
          state.assertionPolicyResult.policy.insufficientEvidence,
        assertionStatus: state.assertionPolicyResult.status,
      },
      diagnosticsCoverage: state.diagnosticsCoverage,
      runtimeAdmissionOwnership: buildAdmissionRuntimeOwnershipSummary(
        state.runtimeAdmissionOwnership,
      ),
      phaseTimeline: mapPhaseTimeline(orchestrationResult.phases),
      phaseArtifacts: mapPhaseArtifacts(orchestrationResult.phases),
      phaseReasonSummary: buildPhaseReasonSummary(orchestrationResult.phases),
      phaseDecisions,
      startupDecisionRecord,
      phaseEvents,
      channelMetrics: nodeClient.getMetricsSnapshot(),
    },
  };
}

export const POSTGRES_BASELINE_COMPARISON_SEGMENT_12 = {
  ...POSTGRES_BASELINE_COMPARISON_SEGMENT_11,
  run,
};
