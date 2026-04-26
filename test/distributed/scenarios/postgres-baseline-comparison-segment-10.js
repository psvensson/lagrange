import {POSTGRES_BASELINE_COMPARISON_SEGMENT_9} from './postgres-baseline-comparison-segment-9.js';
const {
  BASELINE_CACHE_HIT_REASON,
  BASELINE_CACHE_INVALID_REASON,
  BENCHMARK_CONTAINER_NAME_PREFIX,
  BENCHMARK_POOL_CONNECTION_TIMEOUT_MS,
  BENCHMARK_POOL_IDLE_TIMEOUT_MS,
  BENCHMARK_PRIMARY_SUFFIX,
  BENCHMARK_REPLICA_SUFFIX_PREFIX,
  DISCOVERY_ADMISSION_SOURCE,
  FAILURE_NODE_ID_PATTERN,
  LOCALHOST,
  NO_PROGRESS_REASON_CODE,
  ONE,
  PHASE_CLASS_DISCOVERY,
  PHASE_CLASS_LOAD,
  PHASE_CLASS_STARTUP,
  PHASE_CLASS_TEARDOWN,
  PHASE_CLASS_TOPOLOGY,
  PHASE_CLASS_UNKNOWN,
  PHASE_CLASS_VERIFY,
  PHASE_PROGRESS_ARTIFACT_KEY,
  PHASE_REASON_SUMMARY_MAX_ENTRIES,
  POSTGRES_ENV_AUTH_METHOD_KEY,
  POSTGRES_ENV_AUTH_METHOD_VALUE,
  POSTGRES_ENV_DB_KEY,
  POSTGRES_ENV_PASSWORD_KEY,
  POSTGRES_ENV_USER_KEY,
  QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX,
  REASON_CLASS_DISCOVERY,
  REASON_CLASS_LOAD,
  REASON_CLASS_STARTUP,
  REASON_CLASS_TOPOLOGY,
  REASON_CLASS_UNKNOWN,
  REASON_CLASS_VERIFY,
  SHELL_COMMAND,
  SHELL_LOGIN_ARG,
  SCENARIO_PHASE,
  STARTUP_DECISION_SCHEMA_VERSION,
  STRICT_DOMINANT_REASON_PRECEDENCE,
  STRICT_PRELOAD_NODE_REASON_ENTRY_SEPARATOR,
  STRICT_PRELOAD_NODE_REASON_VALUE_SEPARATOR,
  STRICT_PRELOAD_READINESS_NODE_REASONS_PREFIX,
  ZERO,
  buildBaselineCacheIdentity,
  buildBaselineCacheMetadata,
  buildReplicaBootstrapCommand,
  configurePrimaryReplication,
  ensurePostgresBenchmarkTable,
  loadBaselineMetricsFromCache,
  normalizeNonNegativeInteger,
  resolveCacheBaseDir,
  runBaselineSharedLoad,
  storeBaselineMetricsInCache,
  waitForPostgresReady,
  waitForStreamingReplicas,
} = POSTGRES_BASELINE_COMPARISON_SEGMENT_9;

async function resolveBaselineMetrics({
  cluster,
  benchmarkConfig,
  baselineLoadNodeCountOverride,
  scenarioOverrides,
  provider,
  networkName,
  benchmarkTableName,
  onProgress,
  progressHeartbeatIntervalMs,
}) {
  const effectiveBaselineLoadNodeCount =
    Number.isInteger(baselineLoadNodeCountOverride) &&
    baselineLoadNodeCountOverride > ZERO ?
      baselineLoadNodeCountOverride :
      benchmarkConfig.baselineLoadNodeCount;
  const baselineBenchmarkConfig =
    effectiveBaselineLoadNodeCount === benchmarkConfig.baselineLoadNodeCount ?
      benchmarkConfig :
      {
        ...benchmarkConfig,
        baselineLoadNodeCount: effectiveBaselineLoadNodeCount,
      };
  const cacheBaseDir = resolveCacheBaseDir(cluster);
  const baselineCacheIdentity = buildBaselineCacheIdentity(
    baselineBenchmarkConfig,
    cacheBaseDir,
  );
  let cacheMetadata = buildBaselineCacheMetadata(baselineCacheIdentity, {
    enabled: baselineBenchmarkConfig.cacheBaselineMetrics === true,
  });
  const cachedBaseline = await loadBaselineMetricsFromCache(
    baselineCacheIdentity,
    baselineBenchmarkConfig,
  );
  cacheMetadata = cachedBaseline.metadata;

  const baselineContainers = [];
  let baselinePrimaryContainerId = null;
  let baselinePrimaryContainerIp = null;
  const baselineReplicaContainerIps = [];
  let baselineMetrics = cachedBaseline.metrics || null;
  let baselineLoadNodeCount = baselineBenchmarkConfig.baselineLoadNodeCount;
  let baselinePoolMaxConnections = baselineBenchmarkConfig.loadMaxInFlight;

  if (baselineMetrics) {
    onProgress?.('reusing cached baseline metrics', {
      cacheHit: true,
      cacheReason: cacheMetadata.reason || BASELINE_CACHE_HIT_REASON,
    });
  }

  if (!baselineMetrics) {
    let baselinePool = null;
    try {
      onProgress?.('preparing baseline comparison environment', {
        cacheHit: false,
        replicationFactor: baselineBenchmarkConfig.replicationFactor,
      });
      const benchmarkRunId = Date.now();
      const primaryContainerName =
        BENCHMARK_CONTAINER_NAME_PREFIX +
        benchmarkRunId +
        BENCHMARK_PRIMARY_SUFFIX;
      const primaryContainer = await provider.createContainer({
        name: primaryContainerName,
        image: baselineBenchmarkConfig.baselineImage,
        network: networkName,
        env: {
          [POSTGRES_ENV_USER_KEY]: baselineBenchmarkConfig.user,
          [POSTGRES_ENV_PASSWORD_KEY]: baselineBenchmarkConfig.password,
          [POSTGRES_ENV_DB_KEY]: baselineBenchmarkConfig.database,
          [POSTGRES_ENV_AUTH_METHOD_KEY]: POSTGRES_ENV_AUTH_METHOD_VALUE,
        },
        resourceLimits: cluster?._config?.resourceLimits || {},
        startTimeout: cluster?._config?.timeouts?.nodeStartup,
      });
      baselineContainers.push(primaryContainer);
      baselinePrimaryContainerId = primaryContainer.containerId;
      baselinePrimaryContainerIp = primaryContainer.ip;

      await waitForPostgresReady(provider, baselinePrimaryContainerId, {
        host: LOCALHOST,
        port: baselineBenchmarkConfig.port,
        user: baselineBenchmarkConfig.user,
        database: baselineBenchmarkConfig.database,
        timeoutMs: baselineBenchmarkConfig.readyTimeoutMs,
        pollIntervalMs: baselineBenchmarkConfig.readyPollIntervalMs,
      });
      onProgress?.('baseline primary ready', {
        replicationFactor: baselineBenchmarkConfig.replicationFactor,
      });
      await configurePrimaryReplication(
        provider,
        baselinePrimaryContainerId,
        baselineBenchmarkConfig,
      );

      for (
        let replicaIndex = ONE;
        replicaIndex < baselineBenchmarkConfig.replicationFactor;
        replicaIndex += ONE
      ) {
        const replicaName =
          BENCHMARK_CONTAINER_NAME_PREFIX +
          benchmarkRunId +
          BENCHMARK_REPLICA_SUFFIX_PREFIX +
          replicaIndex;
        const replicaBootstrapCommand = buildReplicaBootstrapCommand(
          primaryContainerName,
          replicaName,
          baselineBenchmarkConfig,
        );
        const replicaContainer = await provider.createContainer({
          name: replicaName,
          image: baselineBenchmarkConfig.baselineImage,
          network: networkName,
          env: {
            [POSTGRES_ENV_USER_KEY]: baselineBenchmarkConfig.user,
            [POSTGRES_ENV_PASSWORD_KEY]: baselineBenchmarkConfig.password,
            [POSTGRES_ENV_DB_KEY]: baselineBenchmarkConfig.database,
            [POSTGRES_ENV_AUTH_METHOD_KEY]: POSTGRES_ENV_AUTH_METHOD_VALUE,
          },
          command: [SHELL_COMMAND, SHELL_LOGIN_ARG, replicaBootstrapCommand],
          resourceLimits: cluster?._config?.resourceLimits || {},
          startTimeout: cluster?._config?.timeouts?.nodeStartup,
        });
        baselineContainers.push(replicaContainer);
        baselineReplicaContainerIps.push(replicaContainer.ip);

        await waitForPostgresReady(provider, replicaContainer.containerId, {
          host: LOCALHOST,
          port: baselineBenchmarkConfig.port,
          user: baselineBenchmarkConfig.user,
          database: baselineBenchmarkConfig.database,
          timeoutMs: baselineBenchmarkConfig.readyTimeoutMs,
          pollIntervalMs: baselineBenchmarkConfig.readyPollIntervalMs,
        });
      }

      await waitForStreamingReplicas(
        provider,
        baselinePrimaryContainerId,
        baselineBenchmarkConfig,
      );
      onProgress?.('baseline replicas synchronized', {
        replicaCount: Math.max(
          ZERO,
          baselineBenchmarkConfig.replicationFactor - ONE,
        ),
      });
      const loadNodeCount = Math.max(
        ONE,
        baselineBenchmarkConfig.baselineLoadNodeCount,
      );
      const poolMaxConnections = Math.max(
        ONE,
        baselineBenchmarkConfig.loadMaxInFlight,
      );
      baselineLoadNodeCount = loadNodeCount;
      baselinePoolMaxConnections = poolMaxConnections;
      baselinePool = scenarioOverrides.createPostgresPool({
        host: baselinePrimaryContainerIp,
        port: baselineBenchmarkConfig.port,
        user: baselineBenchmarkConfig.user,
        password: baselineBenchmarkConfig.password,
        database: baselineBenchmarkConfig.database,
        max: poolMaxConnections,
        idleTimeoutMillis: BENCHMARK_POOL_IDLE_TIMEOUT_MS,
        connectionTimeoutMillis: BENCHMARK_POOL_CONNECTION_TIMEOUT_MS,
      });

      await ensurePostgresBenchmarkTable(baselinePool, benchmarkTableName);
      onProgress?.('starting baseline load run', {
        baselineLoadNodeCount: loadNodeCount,
        loadOpsPerSec: baselineBenchmarkConfig.loadOpsPerSec,
      });
      baselineMetrics = await runBaselineSharedLoad({
        pool: baselinePool,
        createLoadGenerator: scenarioOverrides.createLoadGenerator,
        loadNodeCount,
        loadOpsPerSec: baselineBenchmarkConfig.loadOpsPerSec,
        loadDuration: baselineBenchmarkConfig.loadDuration,
        loadMaxInFlight: baselineBenchmarkConfig.loadMaxInFlight,
        loadNodeMaxInFlight: baselineBenchmarkConfig.loadNodeMaxInFlight,
        maxPendingQueueDepth: baselineBenchmarkConfig.maxPendingQueueDepth,
        earlyRejectOnQueueFull: baselineBenchmarkConfig.earlyRejectOnQueueFull,
        nodeFailureThreshold: baselineBenchmarkConfig.nodeFailureThreshold,
        nodeFailureCooldownMs: baselineBenchmarkConfig.nodeFailureCooldownMs,
        tableName: benchmarkTableName,
        onProgress,
        progressHeartbeatIntervalMs,
      });
      try {
        cacheMetadata = await storeBaselineMetricsInCache(
          baselineCacheIdentity,
          baselineBenchmarkConfig,
          baselineMetrics,
        );
      } catch (_cacheStoreErr) {
        cacheMetadata.reason = BASELINE_CACHE_INVALID_REASON;
      }
    } finally {
      if (baselinePool && typeof baselinePool.end === 'function') {
        try {
          await baselinePool.end();
        } catch (_poolEndErr) {
          // Best-effort cleanup.
        }
      }
      for (
        let index = baselineContainers.length - ONE;
        index >= ZERO;
        index--
      ) {
        const containerId = baselineContainers[index]?.containerId;
        if (!containerId) {
          continue;
        }
        try {
          await provider.stopContainer(containerId);
        } catch (_stopErr) {
          // Best-effort cleanup.
        }
        try {
          await provider.removeContainer(containerId);
        } catch (_removeErr) {
          // Best-effort cleanup.
        }
      }
    }
  }

  return {
    baselineMetrics,
    baselineCacheMetadata: cacheMetadata,
    baselinePrimaryContainerIp,
    baselineReplicaContainerIps,
    baselineLoadNodeCount,
    baselinePoolMaxConnections,
  };
}

function mapPhaseArtifacts(phaseResults) {
  const artifacts = {};
  for (const phaseResult of phaseResults) {
    artifacts[phaseResult.phase] = phaseResult.artifacts || {};
  }
  return artifacts;
}

function mapPhaseTimeline(phaseResults) {
  return phaseResults.map((phaseResult) => ({
    phase: phaseResult.phase,
    status: phaseResult.status,
    durationMs: phaseResult.durationMs,
    startedAtMs: phaseResult.startedAtMs,
    endedAtMs: phaseResult.endedAtMs,
    warnings: phaseResult.warnings || [],
    errors: phaseResult.errors || [],
  }));
}

function buildFailedPhaseDiagnostics(phaseResult) {
  if (!phaseResult || typeof phaseResult !== 'object') {
    return null;
  }
  return {
    phase: String(phaseResult.phase || 'unknown'),
    status: String(phaseResult.status || 'unknown'),
    durationMs: Number(phaseResult.durationMs || ZERO),
    startedAtMs: Number(phaseResult.startedAtMs || ZERO),
    endedAtMs: Number(phaseResult.endedAtMs || ZERO),
    warnings: phaseResult.warnings || [],
    errors: phaseResult.errors || [],
    artifacts: phaseResult.artifacts || {},
  };
}

function emitPhaseProgress(phaseContext, message, details = null) {
  if (typeof phaseContext?.emitPhaseProgress !== 'function') {
    return;
  }
  phaseContext.emitPhaseProgress({
    message,
    ...(details && typeof details === 'object' ? {details} : {}),
  });
}

function emitPhaseMeaningfulChange(phaseContext, message, details = null) {
  if (typeof phaseContext?.emitPhaseLastMeaningfulChange !== 'function') {
    return;
  }
  phaseContext.emitPhaseLastMeaningfulChange({
    message,
    ...(details && typeof details === 'object' ? {details} : {}),
  });
}

function emitPhaseNoProgressFailure(phaseContext, message, details = null) {
  if (typeof phaseContext?.emitPhaseFailedNoProgress !== 'function') {
    return;
  }
  phaseContext.emitPhaseFailedNoProgress({
    message,
    ...(details && typeof details === 'object' ? {details} : {}),
  });
}

function buildNoProgressDiagnostics(phaseResult) {
  const phaseProgress = phaseResult?.artifacts?.[PHASE_PROGRESS_ARTIFACT_KEY];
  if (!phaseProgress || typeof phaseProgress !== 'object') {
    return null;
  }
  const failedNoProgress =
    phaseProgress.failedNoProgress &&
    typeof phaseProgress.failedNoProgress === 'object' ?
      phaseProgress.failedNoProgress :
      null;
  const reasonHistogram =
    phaseResult?.artifacts?.reasonHistogram &&
    typeof phaseResult.artifacts.reasonHistogram === 'object' ?
      phaseResult.artifacts.reasonHistogram :
      {};
  const stalledReason =
    Object.keys(reasonHistogram).find((reason) =>
      String(reason || '').includes(NO_PROGRESS_REASON_CODE),
    ) || null;
  if (!failedNoProgress && !stalledReason) {
    return null;
  }
  return {
    reasonCode: NO_PROGRESS_REASON_CODE,
    phase: String(phaseResult?.phase || 'unknown'),
    stalledReason,
    lastProgressEvent: phaseProgress.lastProgressEvent || null,
    lastMeaningfulChange: phaseProgress.lastMeaningfulChange || null,
    heartbeatCount: Number(phaseProgress.heartbeatCount || ZERO),
    warningCount: Number(phaseProgress.noProgressWarningCount || ZERO),
    failedNoProgress,
  };
}

function createAdmissionRuntimeOwnershipAudit() {
  return {
    selection: {byNodeId: {}},
    localReplicaConfirmation: {byNodeId: {}},
    readinessGate: {byNodeId: {}},
  };
}

function recordAdmissionRuntimeOwnership(audit, stage, nodeId, source) {
  if (!audit || typeof audit !== 'object') {
    return;
  }
  if (typeof nodeId !== 'string' || nodeId.length === ZERO) {
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(audit, stage)) {
    return;
  }
  if (!Object.values(DISCOVERY_ADMISSION_SOURCE).includes(source)) {
    return;
  }
  audit[stage].byNodeId[nodeId] = source;
}

function buildAdmissionRuntimeOwnershipStageSummary(stage = {}) {
  const byNodeId =
    stage?.byNodeId && typeof stage.byNodeId === 'object' ? stage.byNodeId : {};
  const counts = {
    [DISCOVERY_ADMISSION_SOURCE.RUNTIME]: ZERO,
    [DISCOVERY_ADMISSION_SOURCE.LEGACY]: ZERO,
    [DISCOVERY_ADMISSION_SOURCE.MISSING]: ZERO,
  };
  const legacyFallbackNodeIds = [];
  const missingAdmissionNodeIds = [];
  for (const [nodeId, source] of Object.entries(byNodeId)) {
    if (!Object.prototype.hasOwnProperty.call(counts, source)) {
      continue;
    }
    counts[source] += ONE;
    if (source === DISCOVERY_ADMISSION_SOURCE.LEGACY) {
      legacyFallbackNodeIds.push(nodeId);
    } else if (source === DISCOVERY_ADMISSION_SOURCE.MISSING) {
      missingAdmissionNodeIds.push(nodeId);
    }
  }
  return {
    byNodeId: {...byNodeId},
    counts,
    legacyFallbackNodeIds: legacyFallbackNodeIds.sort(),
    missingAdmissionNodeIds: missingAdmissionNodeIds.sort(),
  };
}

function buildAdmissionRuntimeOwnershipSummary(audit) {
  return {
    selection: buildAdmissionRuntimeOwnershipStageSummary(audit?.selection),
    localReplicaConfirmation: buildAdmissionRuntimeOwnershipStageSummary(
      audit?.localReplicaConfirmation,
    ),
    readinessGate: buildAdmissionRuntimeOwnershipStageSummary(
      audit?.readinessGate,
    ),
  };
}

function incrementReasonHistogram(reasonHistogram, reason, phase) {
  if (!Object.prototype.hasOwnProperty.call(reasonHistogram, reason)) {
    reasonHistogram[reason] = {
      reason,
      count: ZERO,
      phases: new Set(),
    };
  }
  reasonHistogram[reason].count += ONE;
  reasonHistogram[reason].phases.add(phase);
}

function summarizeReasons(reasonHistogram) {
  return Object.values(reasonHistogram)
    .sort((left, right) => right.count - left.count)
    .slice(ZERO, PHASE_REASON_SUMMARY_MAX_ENTRIES)
    .map((entry) => ({
      reason: entry.reason,
      count: entry.count,
      phases: [...entry.phases].sort(),
    }));
}

function resolvePhaseClass(phase) {
  switch (phase) {
  case SCENARIO_PHASE.PRE_FLIGHT:
    return PHASE_CLASS_STARTUP;
  case SCENARIO_PHASE.CONVERGE:
    return PHASE_CLASS_DISCOVERY;
  case SCENARIO_PHASE.PRE_LOAD_GATE:
  case SCENARIO_PHASE.POST_LOAD_DRAIN:
    return PHASE_CLASS_TOPOLOGY;
  case SCENARIO_PHASE.LOAD:
    return PHASE_CLASS_LOAD;
  case SCENARIO_PHASE.VERIFY:
    return PHASE_CLASS_VERIFY;
  case SCENARIO_PHASE.TEARDOWN:
    return PHASE_CLASS_TEARDOWN;
  default:
    return PHASE_CLASS_UNKNOWN;
  }
}

function classifyReason(reason) {
  const normalizedReason = String(reason || '').toLowerCase();
  if (
    normalizedReason.includes('bootstrap') ||
    normalizedReason.includes('startup') ||
    normalizedReason.includes('active state')
  ) {
    return REASON_CLASS_STARTUP;
  }
  if (
    normalizedReason.includes('discovery') ||
    normalizedReason.includes('schema') ||
    normalizedReason.includes('readiness')
  ) {
    return REASON_CLASS_DISCOVERY;
  }
  if (
    normalizedReason.includes('in_flight') ||
    normalizedReason.includes('leadership') ||
    normalizedReason.includes('topology') ||
    normalizedReason.includes('stalled_no_progress')
  ) {
    return REASON_CLASS_TOPOLOGY;
  }
  if (
    normalizedReason.includes('load') ||
    normalizedReason.includes('circuit') ||
    normalizedReason.includes('budget_exhausted') ||
    normalizedReason.includes('operation') ||
    normalizedReason.includes('write_pressure')
  ) {
    return REASON_CLASS_LOAD;
  }
  if (
    normalizedReason.includes('consistency') ||
    normalizedReason.includes('fallback') ||
    normalizedReason.includes('verification')
  ) {
    return REASON_CLASS_VERIFY;
  }
  return REASON_CLASS_UNKNOWN;
}

function buildReasonClassHistogram(reasons = []) {
  const histogram = {};
  for (const reason of reasons) {
    const reasonClass = classifyReason(reason);
    histogram[reasonClass] = (histogram[reasonClass] || ZERO) + ONE;
  }
  return histogram;
}

function mergeReasonClassHistograms(target = {}, source = {}) {
  const merged = {...target};
  for (const [reasonClass, count] of Object.entries(source)) {
    merged[reasonClass] = (merged[reasonClass] || ZERO) + Number(count || ZERO);
  }
  return merged;
}

function buildStartupDecisionRecord(phaseDecisions = []) {
  let reasonClassHistogram = {};
  for (const phaseDecision of phaseDecisions) {
    reasonClassHistogram = mergeReasonClassHistograms(
      reasonClassHistogram,
      phaseDecision.reasonClassHistogram || {},
    );
  }
  return {
    schemaVersion: STARTUP_DECISION_SCHEMA_VERSION,
    phaseCount: phaseDecisions.length,
    phaseDecisions,
    reasonClassHistogram,
  };
}

function buildPhaseReasonSummary(phaseResults) {
  const warningHistogram = {};
  const errorHistogram = {};
  for (const phaseResult of phaseResults) {
    const phase = String(phaseResult.phase || 'unknown');
    for (const warning of phaseResult.warnings || []) {
      incrementReasonHistogram(warningHistogram, String(warning), phase);
    }
    for (const error of phaseResult.errors || []) {
      incrementReasonHistogram(errorHistogram, String(error), phase);
    }
  }
  return {
    dominantWarnings: summarizeReasons(warningHistogram),
    dominantErrors: summarizeReasons(errorHistogram),
  };
}

function buildVerificationArtifacts(state, options = {}) {
  const artifacts = {
    consistencyVerdict: state.consistencyVerdict,
    coverage: state.consistencyEvaluation.coverage,
    mismatches: state.consistencyEvaluation.mismatches,
    evidenceWarnings: state.consistencyEvaluation.evidenceWarnings,
    snapshotRefresh: state.verificationSnapshotRefresh,
    invariantBreaches: state.assertionPolicyResult?.invariantBreaches || null,
    internalSignalCounts: state.internalSignalCounts,
    internalSignalThresholdResult: state.internalSignalThresholdResult,
    cdcTelemetry: state.cdcTelemetry,
    authoritativeFallbackResult: state.authoritativeFallbackResult,
  };
  if (options.includeLoadMetrics === true) {
    artifacts.loadMetrics = state.loadMetrics;
  }
  if (
    typeof state.assertionPolicyResult?.status === 'string' &&
    state.assertionPolicyResult.status.length > ZERO
  ) {
    artifacts.assertionStatus = state.assertionPolicyResult.status;
  }
  if (options.includeVerificationNodes === true) {
    artifacts.verificationNodeIds = state.verificationNodeIds;
    artifacts.verificationExcludedNodeIds = state.verificationExcludedNodeIds;
  }
  if (options.includeConsistencyAssertionAttempts === true) {
    artifacts.consistencyAssertionAttempts = Number(
      state.consistencyResult?.attempts || ZERO,
    );
  }
  return artifacts;
}

function resolvePhasePolicy(phase, benchmarkConfig) {
  switch (phase) {
  case SCENARIO_PHASE.PRE_LOAD_GATE:
    return {
      timeoutMs: benchmarkConfig.quiescentTimeoutMs,
      pollIntervalMs: benchmarkConfig.quiescentPollIntervalMs,
      stableWindowMs: benchmarkConfig.quiescentStableWindowMs,
    };
  case SCENARIO_PHASE.POST_LOAD_DRAIN:
    return {
      timeoutMs: benchmarkConfig.postLoadDrainTimeoutMs,
      pollIntervalMs: benchmarkConfig.postLoadDrainPollIntervalMs,
      stableWindowMs: benchmarkConfig.postLoadDrainStableWindowMs,
      insufficientEvidencePolicy: benchmarkConfig.insufficientEvidencePolicy,
    };
  case SCENARIO_PHASE.LOAD:
    return {
      loadOpsPerSec: benchmarkConfig.loadOpsPerSec,
      loadDuration: benchmarkConfig.loadDuration,
      loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
      loadQueryTimeoutMs: benchmarkConfig.loadQueryTimeoutMs,
      loadNodeMaxInFlight: benchmarkConfig.loadNodeMaxInFlight,
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
    };
  case SCENARIO_PHASE.VERIFY:
    return {
      consistencyAssertMaxAttempts:
          benchmarkConfig.consistencyAssertMaxAttempts,
      consistencyAssertRetryDelayMs:
          benchmarkConfig.consistencyAssertRetryDelayMs,
      insufficientEvidencePolicy: benchmarkConfig.insufficientEvidencePolicy,
    };
  default:
    return {};
  }
}

function collectPhaseReasons(phaseResult) {
  const reasons = [];
  for (const warning of phaseResult.warnings || []) {
    reasons.push(String(warning));
  }
  for (const error of phaseResult.errors || []) {
    reasons.push(String(error));
  }
  const reasonHistogram = phaseResult.artifacts?.reasonHistogram || {};
  for (const reason of Object.keys(reasonHistogram)) {
    if (!reasons.includes(reason)) {
      reasons.push(reason);
    }
  }
  return reasons;
}

function buildPhaseDecisions(phaseResults, benchmarkConfig) {
  return phaseResults.map((phaseResult) => {
    const reasons = collectPhaseReasons(phaseResult);
    return {
      phase: phaseResult.phase,
      phaseClass: resolvePhaseClass(phaseResult.phase),
      status: phaseResult.status,
      policy: resolvePhasePolicy(phaseResult.phase, benchmarkConfig),
      reasons,
      reasonClassHistogram: buildReasonClassHistogram(reasons),
      includedNodeIds: phaseResult.artifacts?.includedNodeIds || [],
      excludedNodeIds: phaseResult.artifacts?.excludedNodeIds || [],
    };
  });
}

function resolveReasonClassFromPhaseClass(phaseClass) {
  switch (phaseClass) {
  case PHASE_CLASS_STARTUP:
    return REASON_CLASS_STARTUP;
  case PHASE_CLASS_DISCOVERY:
    return REASON_CLASS_DISCOVERY;
  case PHASE_CLASS_TOPOLOGY:
    return REASON_CLASS_TOPOLOGY;
  case PHASE_CLASS_LOAD:
    return REASON_CLASS_LOAD;
  case PHASE_CLASS_VERIFY:
    return REASON_CLASS_VERIFY;
  default:
    return REASON_CLASS_UNKNOWN;
  }
}

function buildFailureReasonCounts(phaseResult) {
  const reasonCounts = {};
  const artifactReasonHistogram = phaseResult?.artifacts?.reasonHistogram;
  if (artifactReasonHistogram && typeof artifactReasonHistogram === 'object') {
    for (const [reason, count] of Object.entries(artifactReasonHistogram)) {
      const normalizedReason = String(reason || '');
      const normalizedCount = Number(count);
      if (
        !normalizedReason ||
        !Number.isFinite(normalizedCount) ||
        normalizedCount <= ZERO
      ) {
        continue;
      }
      reasonCounts[normalizedReason] = Math.max(
        ZERO,
        Math.floor(normalizedCount),
      );
    }
  }
  if (Object.keys(reasonCounts).length > ZERO) {
    return reasonCounts;
  }
  for (const reason of collectPhaseReasons(phaseResult)) {
    if (!reasonCounts[reason]) {
      reasonCounts[reason] = ZERO;
    }
    reasonCounts[reason] += ONE;
  }
  return reasonCounts;
}

function collectCanonicalStrictReasonsFromText(reasonText) {
  const normalizedReasonText = String(reasonText || '').toLowerCase();
  if (normalizedReasonText.length === ZERO) {
    return [];
  }
  const canonicalReasons = [];
  for (const reasonCode of STRICT_DOMINANT_REASON_PRECEDENCE) {
    if (normalizedReasonText.includes(reasonCode)) {
      canonicalReasons.push(reasonCode);
    }
  }
  return canonicalReasons;
}

function resolveFailureNodeReasonsByNodeId(phaseResult) {
  const artifactNodeReasons = phaseResult?.artifacts?.nodeReasonsByNodeId;
  if (artifactNodeReasons && typeof artifactNodeReasons === 'object') {
    return artifactNodeReasons;
  }
  const versionNodes = phaseResult?.artifacts?.versionConvergence?.nodes;
  if (versionNodes && typeof versionNodes === 'object') {
    const derived = {};
    for (const [nodeId, snapshot] of Object.entries(versionNodes)) {
      const unmetReasons = Array.isArray(snapshot?.unmetReasons) ?
        [...snapshot.unmetReasons] :
        [];
      if (unmetReasons.length > ZERO) {
        derived[String(nodeId)] = unmetReasons;
      }
    }
    return derived;
  }
  return {};
}

function buildCanonicalStrictReasonCounts(
  nodeReasonsByNodeId,
  fallbackReasonCounts,
) {
  const canonicalReasonCounts = {};
  for (const reasons of Object.values(nodeReasonsByNodeId || {})) {
    if (!Array.isArray(reasons)) {
      continue;
    }
    for (const reasonText of reasons) {
      const canonicalReasons =
        collectCanonicalStrictReasonsFromText(reasonText);
      for (const reasonCode of canonicalReasons) {
        canonicalReasonCounts[reasonCode] =
          (canonicalReasonCounts[reasonCode] || ZERO) + ONE;
      }
    }
  }
  if (Object.keys(canonicalReasonCounts).length > ZERO) {
    return canonicalReasonCounts;
  }

  for (const [reasonText, count] of Object.entries(
    fallbackReasonCounts || {},
  )) {
    const canonicalReasons = collectCanonicalStrictReasonsFromText(reasonText);
    for (const reasonCode of canonicalReasons) {
      canonicalReasonCounts[reasonCode] =
        (canonicalReasonCounts[reasonCode] || ZERO) +
        normalizeNonNegativeInteger(count);
    }
  }
  return canonicalReasonCounts;
}

function resolveDominantStrictReason(reasonCounts) {
  const entries = Object.entries(reasonCounts || {});
  if (entries.length === ZERO) {
    return null;
  }

  let dominantReason = null;
  let dominantPrecedenceRank = Number.POSITIVE_INFINITY;
  let dominantCount = ZERO;

  for (const [reasonCode, count] of entries) {
    const precedenceIndex =
      STRICT_DOMINANT_REASON_PRECEDENCE.indexOf(reasonCode);
    const precedenceRank =
      precedenceIndex >= ZERO ?
        precedenceIndex :
        STRICT_DOMINANT_REASON_PRECEDENCE.length;
    const normalizedCount = normalizeNonNegativeInteger(count);
    if (
      dominantReason === null ||
      precedenceRank < dominantPrecedenceRank ||
      (precedenceRank === dominantPrecedenceRank &&
        normalizedCount > dominantCount) ||
      (precedenceRank === dominantPrecedenceRank &&
        normalizedCount === dominantCount &&
        String(reasonCode).localeCompare(String(dominantReason)) < ZERO)
    ) {
      dominantReason = String(reasonCode);
      dominantPrecedenceRank = precedenceRank;
      dominantCount = normalizedCount;
    }
  }
  return dominantReason;
}

function parseNodeIdFromNodeProbeReason(reason) {
  const detail = String(reason || '').slice(
    QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX.length,
  );
  const separatorIndex = detail.indexOf('=');
  if (separatorIndex <= ZERO) {
    return null;
  }
  const nodeId = detail.slice(ZERO, separatorIndex);
  return nodeId.length > ZERO ? nodeId : null;
}

function extractNodeIdsFromFailureErrorMessage(errorMessage) {
  const nodeIds = [];
  const seenNodeIds = new Set();
  const text = String(errorMessage || '');
  FAILURE_NODE_ID_PATTERN.lastIndex = ZERO;
  const discoveredNodeIdMatches = text.matchAll(FAILURE_NODE_ID_PATTERN);
  for (const nodeIdMatch of discoveredNodeIdMatches) {
    const nodeId = String(nodeIdMatch?.[1] || '');
    if (!nodeId || seenNodeIds.has(nodeId)) {
      continue;
    }
    seenNodeIds.add(nodeId);
    nodeIds.push(nodeId);
  }
  if (!text.includes(STRICT_PRELOAD_READINESS_NODE_REASONS_PREFIX)) {
    return nodeIds;
  }
  const nodeReasonFragment = text.slice(
    text.indexOf(STRICT_PRELOAD_READINESS_NODE_REASONS_PREFIX) +
      STRICT_PRELOAD_READINESS_NODE_REASONS_PREFIX.length,
  );
  const entries = nodeReasonFragment.split(
    STRICT_PRELOAD_NODE_REASON_ENTRY_SEPARATOR,
  );
  for (const entry of entries) {
    const trimmedEntry = String(entry || '').trim();
    if (!trimmedEntry || trimmedEntry === 'none') {
      continue;
    }
    const separatorIndex = trimmedEntry.indexOf(
      STRICT_PRELOAD_NODE_REASON_VALUE_SEPARATOR,
    );
    const nodeId =
      separatorIndex >= ZERO ?
        trimmedEntry.slice(ZERO, separatorIndex) :
        trimmedEntry;
    if (nodeId.length > ZERO && !seenNodeIds.has(nodeId)) {
      seenNodeIds.add(nodeId);
      nodeIds.push(nodeId);
    }
  }
  return nodeIds;
}

function collectAffectedNodeIdsFromLoadMetrics(loadMetrics, targetSet) {
  if (!loadMetrics || typeof loadMetrics !== 'object' || !targetSet) {
    return;
  }
  const perNodeMetrics =
    loadMetrics?.perNode &&
    typeof loadMetrics.perNode === 'object' &&
    !Array.isArray(loadMetrics.perNode) ?
      loadMetrics.perNode :
      {};
  for (const [nodeId, nodeMetrics] of Object.entries(perNodeMetrics)) {
    const attemptErrors = Number(nodeMetrics?.attemptErrors || ZERO);
    const dispatched = Number(nodeMetrics?.dispatched || ZERO);
    const success = Number(nodeMetrics?.success || ZERO);
    const rejected = Number(nodeMetrics?.rejected || ZERO);
    if (attemptErrors > ZERO || dispatched > success || rejected > ZERO) {
      targetSet.add(nodeId);
    }
  }
  const distinctErrors = Array.isArray(loadMetrics?.distinctErrors) ?
    loadMetrics.distinctErrors :
    [];
  for (const errorText of distinctErrors) {
    for (const nodeId of extractNodeIdsFromFailureErrorMessage(errorText)) {
      targetSet.add(nodeId);
    }
  }
}

function buildFailureAffectedNodeIds(phaseResult, loadMetrics = null) {
  const affectedNodeIds = new Set();
  const artifacts = phaseResult?.artifacts || {};
  const artifactNodeIdFields = [
    'includedNodeIds',
    'excludedNodeIds',
    'verificationNodeIds',
    'verificationExcludedNodeIds',
  ];
  for (const field of artifactNodeIdFields) {
    const nodeIds = artifacts[field];
    if (!Array.isArray(nodeIds)) {
      continue;
    }
    for (const nodeId of nodeIds) {
      if (typeof nodeId === 'string' && nodeId.length > ZERO) {
        affectedNodeIds.add(nodeId);
      }
    }
  }

  const reasonHistogram = artifacts.reasonHistogram;
  if (reasonHistogram && typeof reasonHistogram === 'object') {
    for (const reason of Object.keys(reasonHistogram)) {
      if (!reason.startsWith(QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX)) {
        continue;
      }
      const nodeId = parseNodeIdFromNodeProbeReason(reason);
      if (nodeId) {
        affectedNodeIds.add(nodeId);
      }
    }
  }

  const errors = Array.isArray(phaseResult?.errors) ? phaseResult.errors : [];
  for (const errorMessage of errors) {
    for (const nodeId of extractNodeIdsFromFailureErrorMessage(errorMessage)) {
      affectedNodeIds.add(nodeId);
    }
  }
  collectAffectedNodeIdsFromLoadMetrics(loadMetrics, affectedNodeIds);
  return [...affectedNodeIds].sort();
}

function resolveFailureRootCauseClass(phaseResult, reasonCounts) {
  const reasonClassHistogram = buildReasonClassHistogram(
    Object.keys(reasonCounts || {}),
  );
  let topClass = REASON_CLASS_UNKNOWN;
  let topCount = ZERO;
  for (const [reasonClass, count] of Object.entries(reasonClassHistogram)) {
    if (count > topCount) {
      topClass = reasonClass;
      topCount = count;
    }
  }
  if (topCount > ZERO && topClass !== REASON_CLASS_UNKNOWN) {
    return topClass;
  }
  const phaseClass = resolvePhaseClass(phaseResult?.phase);
  return resolveReasonClassFromPhaseClass(phaseClass);
}

function isStrictBenchmarkMode(benchmarkConfig) {
  return (
    benchmarkConfig?.strictDiscovery === true ||
    benchmarkConfig?.strictPreloadReadiness === true ||
    benchmarkConfig?.strictParity === true ||
    benchmarkConfig?.strictCdcTelemetrySchema === true ||
    benchmarkConfig?.strictAuthoritativeFallback === true ||
    benchmarkConfig?.strictOverloadPolicy === true ||
    benchmarkConfig?.strictWritePressure === true
  );
}

function resolveReplicaOperationTimelineByOperationId(phaseResult) {
  const timelineByOperationId = {};
  const appendTimeline = (candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return;
    }
    for (const [operationId, entries] of Object.entries(candidate)) {
      if (!operationId || !Array.isArray(entries)) {
        continue;
      }
      const existing = timelineByOperationId[operationId];
      if (!Array.isArray(existing) || entries.length > existing.length) {
        timelineByOperationId[operationId] = entries;
      }
    }
  };
  appendTimeline(phaseResult?.artifacts?.replicaOperationTimelineByOperationId);
  appendTimeline(
    phaseResult?.artifacts?.gateResult?.replicaOperationTimelineByOperationId,
  );

  const preflightSnapshots =
    phaseResult?.artifacts?.preflightCriticalPathSnapshots;
  if (preflightSnapshots && typeof preflightSnapshots === 'object') {
    for (const snapshot of Object.values(preflightSnapshots)) {
      appendTimeline(
        snapshot?.controlPlaneDiagnostics?.replicaOperations
          ?.operationTimelineById,
      );
      appendTimeline(snapshot?.replicaOperations?.operationTimelineById);
    }
  }
  return timelineByOperationId;
}

export const POSTGRES_BASELINE_COMPARISON_SEGMENT_10 = {
  ...POSTGRES_BASELINE_COMPARISON_SEGMENT_9,
  resolveBaselineMetrics,
  mapPhaseArtifacts,
  mapPhaseTimeline,
  buildFailedPhaseDiagnostics,
  emitPhaseProgress,
  emitPhaseMeaningfulChange,
  emitPhaseNoProgressFailure,
  buildNoProgressDiagnostics,
  createAdmissionRuntimeOwnershipAudit,
  recordAdmissionRuntimeOwnership,
  buildAdmissionRuntimeOwnershipStageSummary,
  buildAdmissionRuntimeOwnershipSummary,
  incrementReasonHistogram,
  summarizeReasons,
  resolvePhaseClass,
  classifyReason,
  buildReasonClassHistogram,
  mergeReasonClassHistograms,
  buildStartupDecisionRecord,
  buildPhaseReasonSummary,
  buildVerificationArtifacts,
  resolvePhasePolicy,
  collectPhaseReasons,
  buildPhaseDecisions,
  resolveReasonClassFromPhaseClass,
  buildFailureReasonCounts,
  collectCanonicalStrictReasonsFromText,
  resolveFailureNodeReasonsByNodeId,
  buildCanonicalStrictReasonCounts,
  resolveDominantStrictReason,
  parseNodeIdFromNodeProbeReason,
  extractNodeIdsFromFailureErrorMessage,
  collectAffectedNodeIdsFromLoadMetrics,
  buildFailureAffectedNodeIds,
  resolveFailureRootCauseClass,
  isStrictBenchmarkMode,
  resolveReplicaOperationTimelineByOperationId,
};
