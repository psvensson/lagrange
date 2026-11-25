import {POSTGRES_BASELINE_COMPARISON_LOAD_NODE_RESOLUTION_BUNDLE} from './postgres-baseline-comparison-load-node-resolution.js';
const {
  assert,
  osArch,
  osCpus,
  osHostname,
  osPlatform,
  dirname,
  BENCHMARK_DEFAULTS,
  BENCHMARK_METADATA_STAGE_DISCOVERY_ERROR,
  BENCHMARK_METADATA_STAGE_READINESS_POLL,
  BENCHMARK_PRELOAD_MAX_REPLICA_OPS_IN_FLIGHT_DEFAULT,
  BOOTSTRAP_DB_NAME,
  DEFAULT_REPLICATION_PORT,
  DISCOVERY_UNKNOWN_NODE_ID,
  DISCOVERY_READINESS_REASON_ADMIN_NOT_QUERYABLE,
  DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN,
  GATE_RESULT_MODE,
  GateEngine,
  LOCALHOST,
  NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID,
  NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME,
  NODE_CLIENT_TRANSIENT_CONTEXT,
  ONE,
  POSTGRES_BINARY_PATH_EXPORT,
  POSTGRES_ENTRYPOINT_COMMAND,
  PREFLIGHT_CONVERGENCE_ALLOWED_VOTER_SKEW,
  PREFLIGHT_CONVERGENCE_FORCE_REPAIR_AFTER_MS,
  PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_MIN_SETTLE_TIMEOUT_MS,
  PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD,
  PSQL_ON_ERROR_STOP,
  PSQL_TUPLES_ONLY,
  QUIESCENCE_DEFAULT_STABLE_WINDOW_MS,
  QUIESCENCE_IN_FLIGHT_COUNT_PREFIX,
  QUIESCENCE_IN_FLIGHT_ERROR_PREFIX,
  QUIESCENCE_NODE_ERROR_PREFIX,
  QUIESCENCE_NODE_ERROR_SEPARATOR,
  QUIESCENCE_READY_NODE_COUNT_PREFIX,
  QUIESCENCE_REASON_DISCOVERY_NOT_READY_PREFIX,
  QUIESCENCE_REASON_DISCOVERY_REASON_DETAIL_PREFIX,
  QUIESCENCE_REASON_DISCOVERY_REASON_DETAIL_SEPARATOR,
  QUIESCENCE_REASON_IN_FLIGHT_NOT_DRAINED_PREFIX,
  QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX,
  QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX,
  QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX,
  QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX,
  QUIESCENCE_STALL_PREFIX,
  READINESS_TIMELINE_EVENT_POLL_SNAPSHOT,
  READINESS_TIMELINE_EVENT_REASON_TRANSITION,
  REPLICATION_HBA_IPV4,
  REPLICATION_HBA_IPV6,
  REPLICATION_STATE_STREAMING,
  SYNCHRONOUS_COMMIT_ON,
  SYNC_STANDBY_TEMPLATE_PREFIX,
  SYNC_STANDBY_TEMPLATE_SUFFIX,
  ZERO,
  buildReplicaOperationProgressSignature,
  buildSutTableProbeSql,
  buildCanonicalReadinessFromDiscoveryError,
  cloneDiscoveryReadinessState,
  collectBenchmarkMetadataSnapshot,
  execShell,
  fetchControlSnapshotFromCandidates,
  isRetriableTableReadyError,
  normalizeRequiredSchemaVersion,
  resolveControlSnapshotCandidates,
  resolveNodeReadinessFromServiceDiscovery,
  resolvePostgresBaselineBenchmarkConfig,
  resolveScenarioTiming,
  shellQuote,
  sleep,
  summarizeInFlightReplicaOperationTimeline,
} = POSTGRES_BASELINE_COMPARISON_LOAD_NODE_RESOLUTION_BUNDLE;

function resolveQuiescenceWindowOptions({
  stableWindowMs,
  noProgressTimeoutMs,
  maxReplicaOpsInFlight,
}) {
  return {
    effectiveStableWindowMs: Math.max(
      ZERO,
      Number.isFinite(stableWindowMs) ?
        Math.floor(stableWindowMs) :
        QUIESCENCE_DEFAULT_STABLE_WINDOW_MS,
    ),
    effectiveNoProgressTimeoutMs:
      Number.isInteger(noProgressTimeoutMs) && noProgressTimeoutMs > ZERO ?
        noProgressTimeoutMs :
        null,
    effectiveMaxReplicaOpsInFlight:
      Number.isInteger(maxReplicaOpsInFlight) && maxReplicaOpsInFlight >= ZERO ?
        maxReplicaOpsInFlight :
        BENCHMARK_PRELOAD_MAX_REPLICA_OPS_IN_FLIGHT_DEFAULT,
  };
}

function cloneArrayOrEmpty(values) {
  return Array.isArray(values) ? [...values] : [];
}

function buildMetadataSnapshotSignature({
  stage,
  readinessState,
  requiredSchemaVersion,
  probeError,
}) {
  return JSON.stringify({
    stage: String(stage || BENCHMARK_METADATA_STAGE_READINESS_POLL),
    ready: readinessState?.ready === true,
    requiredSchemaVersion:
      readinessState?.requiredSchemaVersion ||
      normalizeRequiredSchemaVersion(requiredSchemaVersion),
    appliedSchemaVersion: readinessState?.appliedSchemaVersion || null,
    reasons: cloneArrayOrEmpty(readinessState?.reasons),
    discoveryReasons: cloneArrayOrEmpty(readinessState?.discoveryReasons),
    probeError:
      typeof probeError === 'string' && probeError.length > ZERO ?
        probeError :
        null,
  });
}

function buildQuiescenceDiscoveryContext(
  tableName,
  requiredSchemaTableId,
  useCanonicalFieldKeys = true,
) {
  if (typeof tableName !== 'string' || tableName.length === ZERO) {
    return {
      ...NODE_CLIENT_TRANSIENT_CONTEXT,
      requireReadiness: true,
    };
  }
  const tableNameKey = useCanonicalFieldKeys ?
    NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME :
    'tableName';
  const tableIdKey = useCanonicalFieldKeys ?
    NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID :
    'tableId';
  return {
    ...NODE_CLIENT_TRANSIENT_CONTEXT,
    requireReadiness: true,
    [tableNameKey]: tableName,
    ...(typeof requiredSchemaTableId === 'string' &&
    requiredSchemaTableId.length > ZERO ?
      {
        [tableIdKey]: requiredSchemaTableId,
      } :
      {}),
  };
}

function emitCanonicalReadinessConvergenceEvents({
  onConvergenceEvent,
  nodeId,
  requiredSchemaTableId,
  tableName,
  requiredSchemaVersion,
  discoveryReadiness,
}) {
  if (typeof onConvergenceEvent !== 'function') {
    return;
  }
  const effectiveRequiredVersion =
    discoveryReadiness.requiredSchemaVersion || requiredSchemaVersion;
  const observedVersion = discoveryReadiness.appliedSchemaVersion || null;
  onConvergenceEvent({
    type: 'cdc_received',
    nodeId,
    tableId: requiredSchemaTableId || null,
    tableName,
    requiredSchemaVersion: effectiveRequiredVersion,
    observedSchemaVersion: observedVersion,
    reasons: discoveryReadiness.reasons,
    ready: discoveryReadiness.ready,
  });
  if (discoveryReadiness.appliedSchemaVersion) {
    onConvergenceEvent({
      type: 'cache_applied_version',
      nodeId,
      tableId: requiredSchemaTableId || null,
      tableName,
      requiredSchemaVersion: effectiveRequiredVersion,
      observedSchemaVersion: discoveryReadiness.appliedSchemaVersion,
      reasons: discoveryReadiness.reasons,
      ready: discoveryReadiness.ready,
    });
  }
  if (discoveryReadiness.ready) {
    onConvergenceEvent({
      type: 'readiness_predicate_pass',
      nodeId,
      tableId: requiredSchemaTableId || null,
      tableName,
      requiredSchemaVersion: effectiveRequiredVersion,
      observedSchemaVersion: observedVersion,
      reasons: [],
      ready: true,
    });
  }
}

function buildCanonicalDiscoveryProbeFailureResult(nodeId, discoveryReadiness) {
  const discoveryReasonDetails =
    Array.isArray(discoveryReadiness.discoveryReasons) &&
    discoveryReadiness.discoveryReasons.length > ZERO ?
      QUIESCENCE_REASON_DISCOVERY_REASON_DETAIL_PREFIX +
        discoveryReadiness.discoveryReasons.join(
          QUIESCENCE_REASON_DISCOVERY_REASON_DETAIL_SEPARATOR,
        ) :
      null;
  const discoveryReasonText =
    discoveryReadiness.reasons.length > ZERO ?
      discoveryReadiness.reasons.join('|') :
      DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN;
  return {
    ready: false,
    reasons: [
      QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX +
        nodeId +
        '=' +
        QUIESCENCE_REASON_DISCOVERY_NOT_READY_PREFIX +
        discoveryReasonText +
        (discoveryReasonDetails ? '|' + discoveryReasonDetails : ''),
    ],
  };
}

function normalizePartitionGroupInFlightMap(rawMap) {
  if (!rawMap || typeof rawMap !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(rawMap)
      .filter((entry) => Number.isInteger(entry[1]) && entry[1] >= ZERO)
      .map(([partitionGroupId, count]) => [
        String(partitionGroupId),
        Number(count),
      ]),
  );
}

function buildPollSnapshotTimelineEvent({
  sequence,
  nodeId,
  readinessState,
  reasons,
  requiredSchemaVersion,
  timestampMs,
}) {
  const source =
    readinessState && typeof readinessState === 'object' ? readinessState : {};
  const readinessStateSnapshot = cloneDiscoveryReadinessState(
    source.readinessState,
  );
  const event = {
    type: READINESS_TIMELINE_EVENT_POLL_SNAPSHOT,
    sequence,
    nodeId,
    ready: source.ready === true,
    reasons,
    requiredSchemaVersion:
      source.requiredSchemaVersion ||
      normalizeRequiredSchemaVersion(requiredSchemaVersion),
    observedSchemaVersion: source.appliedSchemaVersion || null,
    discoveryReasons: cloneArrayOrEmpty(source.discoveryReasons),
    timestampMs,
  };
  if (readinessStateSnapshot) {
    event.readinessState = readinessStateSnapshot;
  }
  return event;
}

function extractControlSnapshotReplicaOperationDetails(controlSnapshot) {
  const replicaOperations =
    controlSnapshot?.replicaOperations &&
    typeof controlSnapshot.replicaOperations === 'object' ?
      controlSnapshot.replicaOperations :
      {};
  const inFlightCount = Number.isInteger(replicaOperations.inFlightCount) ?
    replicaOperations.inFlightCount :
    ZERO;
  const partitionGroupInFlight = normalizePartitionGroupInFlightMap(
    replicaOperations.partitionGroupInFlight,
  );
  const operationTimelineByOperationId =
    replicaOperations.operationTimelineById &&
    typeof replicaOperations.operationTimelineById === 'object' ?
      replicaOperations.operationTimelineById :
      {};
  return {
    inFlightCount,
    partitionGroupInFlight,
    operationTimelineByOperationId,
    operationTimelineSignature: buildReplicaOperationProgressSignature(
      operationTimelineByOperationId,
    ),
    operationLiveness: summarizeInFlightReplicaOperationTimeline(
      operationTimelineByOperationId,
    ),
  };
}

function extractSortedLeaderEntries(controlSnapshot) {
  const leaders =
    controlSnapshot?.leaders && typeof controlSnapshot.leaders === 'object' ?
      controlSnapshot.leaders :
      {};
  return Object.entries(leaders).sort((left, right) =>
    left[0].localeCompare(right[0]),
  );
}

function buildGlobalQuiescenceConditionReasons(
  inFlightCount,
  effectiveMaxReplicaOpsInFlight,
  leadershipStable,
  leaderQuietElapsedMs,
) {
  const reasons = [];
  if (inFlightCount > effectiveMaxReplicaOpsInFlight) {
    reasons.push(
      QUIESCENCE_REASON_IN_FLIGHT_NOT_DRAINED_PREFIX + String(inFlightCount),
    );
  }
  if (!leadershipStable) {
    reasons.push(
      QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX +
        String(leaderQuietElapsedMs),
    );
  }
  return reasons;
}

function buildQuiescenceFailureDetails(reasonHistogram, readyLoadNodeCount) {
  const reasonKeys = Object.keys(reasonHistogram || {});
  const filterByPrefix = (prefix) =>
    reasonKeys.filter((reason) => reason.startsWith(prefix));
  const nodeProbeReasons = filterByPrefix(
    QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX,
  );
  const inFlightQueryReasons = filterByPrefix(
    QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX,
  );
  const inFlightCountReasons = filterByPrefix(
    QUIESCENCE_REASON_IN_FLIGHT_NOT_DRAINED_PREFIX,
  );
  const leadershipReasons = filterByPrefix(
    QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX,
  );
  const stallReasons = filterByPrefix(
    QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX,
  );

  const details = [];
  if (nodeProbeReasons.length > ZERO) {
    details.push(
      QUIESCENCE_NODE_ERROR_PREFIX +
        nodeProbeReasons.join(QUIESCENCE_NODE_ERROR_SEPARATOR),
    );
  }
  if (inFlightQueryReasons.length > ZERO) {
    details.push(
      QUIESCENCE_IN_FLIGHT_ERROR_PREFIX + inFlightQueryReasons.join(','),
    );
  }
  if (inFlightCountReasons.length > ZERO) {
    details.push(
      QUIESCENCE_IN_FLIGHT_COUNT_PREFIX + inFlightCountReasons.join(','),
    );
  }
  if (leadershipReasons.length > ZERO) {
    details.push('leadershipStability=' + leadershipReasons.join(','));
  }
  if (stallReasons.length > ZERO) {
    details.push(QUIESCENCE_STALL_PREFIX + stallReasons.join(','));
  }
  if (readyLoadNodeCount > ZERO) {
    details.push(QUIESCENCE_READY_NODE_COUNT_PREFIX + String(readyLoadNodeCount));
  }
  return details;
}

function shouldSuppressQuiescenceStallAbort(inFlightCount, operationLiveness) {
  return (
    Number.isInteger(inFlightCount) &&
    inFlightCount > ZERO &&
    Number.isInteger(operationLiveness?.inFlightOperationCount) &&
    operationLiveness.inFlightOperationCount > ZERO &&
    Number.isInteger(operationLiveness?.nearestInFlightTimeoutRemainingMs) &&
    operationLiveness.hasStaleInFlightOperation !== true
  );
}

async function waitForSutLoadQuiescence({
  nodeClient,
  loadNodes,
  seedNode,
  snapshotNodes,
  tableName,
  timeoutMs,
  pollIntervalMs,
  stableWindowMs,
  noProgressTimeoutMs,
  maxReplicaOpsInFlight,
  strictCanonicalReadiness,
  requiredSchemaVersion,
  requiredSchemaTableId,
  onConvergenceEvent,
  onBenchmarkMetadataSnapshot,
  runtimeAdmissionOwnership,
  timing: configuredTiming,
}) {
  const timing = resolveScenarioTiming(configuredTiming);
  const tableProbeSql = buildSutTableProbeSql(tableName);
  const requireCanonicalReadiness = strictCanonicalReadiness === true;
  const {
    effectiveStableWindowMs,
    effectiveNoProgressTimeoutMs,
    effectiveMaxReplicaOpsInFlight,
  } = resolveQuiescenceWindowOptions({
    stableWindowMs,
    noProgressTimeoutMs,
    maxReplicaOpsInFlight,
  });
  let lastLeaderSignature = null;
  let lastLeaderChangeAtMs = timing.now();
  let lastProgressAtMs = timing.now();
  let lowestInFlightCount = Number.POSITIVE_INFINITY;
  let maxLeaderQuietElapsedMs = ZERO;
  let maxIncludedNodeCount = ZERO;
  let lastOperationTimelineSignature = null;
  const gateProgressState = {
    inFlightCount: null,
    leaderQuietElapsedMs: ZERO,
    partitionGroupInFlight: {},
    operationTimelineByOperationId: {},
    operationTimelineSignature: null,
    operationLiveness: {
      inFlightOperationCount: ZERO,
      hasStaleInFlightOperation: false,
      nearestInFlightTimeoutRemainingMs: null,
    },
  };
  const versionedReadinessByNodeId = {};
  const requiredNodeIds = loadNodes.map((node) =>
    String(node?.id || DISCOVERY_UNKNOWN_NODE_ID),
  );
  const readinessTimeline = [];
  const readinessReasonSignatureByNodeId = {};
  const benchmarkMetadataSignatureByNodeId = {};
  let readinessTimelineSequence = ZERO;

  async function maybeCaptureBenchmarkMetadataSnapshot(
    node,
    stage,
    readinessState,
    probeError,
  ) {
    if (typeof onBenchmarkMetadataSnapshot !== 'function') {
      return;
    }
    const nodeId = String(node?.id || DISCOVERY_UNKNOWN_NODE_ID);
    const signature = buildMetadataSnapshotSignature({
      stage,
      readinessState,
      requiredSchemaVersion,
      probeError,
    });
    if (benchmarkMetadataSignatureByNodeId[nodeId] === signature) {
      return;
    }
    benchmarkMetadataSignatureByNodeId[nodeId] = signature;
    const snapshot = await collectBenchmarkMetadataSnapshot({
      nodeClient,
      node,
      tableName,
      tableId: requiredSchemaTableId,
      requiredSchemaVersion:
        readinessState?.requiredSchemaVersion || requiredSchemaVersion,
      stage,
      readinessState: readinessState?.readinessState,
      probeError,
    });
    onBenchmarkMetadataSnapshot(snapshot);
  }

  function recordVersionedReadiness(nodeId, readinessState) {
    versionedReadinessByNodeId[nodeId] = {
      requiredSchemaVersion:
        readinessState?.requiredSchemaVersion ||
        normalizeRequiredSchemaVersion(requiredSchemaVersion),
      appliedSchemaVersion: readinessState?.appliedSchemaVersion || null,
      ready: readinessState?.ready === true,
      reasons: cloneArrayOrEmpty(readinessState?.reasons),
      discoveryReasons: cloneArrayOrEmpty(readinessState?.discoveryReasons),
      readinessState: cloneDiscoveryReadinessState(
        readinessState?.readinessState,
      ),
    };
  }

  function recordReadinessObservation(nodeId, readinessState) {
    if (!requireCanonicalReadiness) {
      return;
    }
    const reasons = cloneArrayOrEmpty(readinessState?.reasons);
    const reasonSignature = reasons.join('|');
    const hasPreviousReasonSignature = Object.prototype.hasOwnProperty.call(
      readinessReasonSignatureByNodeId,
      nodeId,
    );
    const previousReasonSignature = hasPreviousReasonSignature ?
      readinessReasonSignatureByNodeId[nodeId] :
      null;

    readinessTimelineSequence += ONE;
    readinessTimeline.push(
      buildPollSnapshotTimelineEvent({
        sequence: readinessTimelineSequence,
        nodeId,
        readinessState,
        reasons,
        requiredSchemaVersion,
        timestampMs: timing.now(),
      }),
    );

    if (
      !hasPreviousReasonSignature ||
      previousReasonSignature !== reasonSignature
    ) {
      readinessTimelineSequence += ONE;
      readinessTimeline.push({
        type: READINESS_TIMELINE_EVENT_REASON_TRANSITION,
        sequence: readinessTimelineSequence,
        nodeId,
        from: previousReasonSignature,
        to: reasonSignature,
        timestampMs: timing.now(),
      });
      readinessReasonSignatureByNodeId[nodeId] = reasonSignature;
    }
  }

  function buildVersionConvergenceSnapshot() {
    const requiredVersion = normalizeRequiredSchemaVersion(
      requiredSchemaVersion,
    );
    const nodes = {};
    for (const nodeId of requiredNodeIds) {
      const snapshot = versionedReadinessByNodeId[nodeId];
      nodes[nodeId] = {
        requiredSchemaVersion:
          snapshot?.requiredSchemaVersion || requiredVersion,
        observedSchemaVersion: snapshot?.appliedSchemaVersion || null,
        ready: snapshot?.ready === true,
        unmetReasons: Array.isArray(snapshot?.reasons) ?
          [...snapshot.reasons] :
          [DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN],
        discoveryReasons: cloneArrayOrEmpty(snapshot?.discoveryReasons),
        readinessState: cloneDiscoveryReadinessState(snapshot?.readinessState),
      };
    }
    return {
      requiredSchemaVersion: requiredVersion,
      nodes,
    };
  }

  async function probeCanonicalReadinessForNode(node, nodeId) {
    try {
      const discoveryContext = buildQuiescenceDiscoveryContext(
        tableName,
        requiredSchemaTableId,
        true,
      );
      const discoverySnapshot = await nodeClient.fetchServiceDiscovery(
        node,
        discoveryContext,
      );
      const discoveryReadiness = resolveNodeReadinessFromServiceDiscovery(
        discoverySnapshot,
        nodeId,
        {
          enforceCanonicalVersionedReadiness: true,
          adminQueryable: true,
          requiredSchemaVersion,
          admissionRuntimeOwnership: runtimeAdmissionOwnership,
        },
      );
      await maybeCaptureBenchmarkMetadataSnapshot(
        node,
        BENCHMARK_METADATA_STAGE_READINESS_POLL,
        discoveryReadiness,
        null,
      );
      recordVersionedReadiness(nodeId, discoveryReadiness);
      recordReadinessObservation(nodeId, discoveryReadiness);
      emitCanonicalReadinessConvergenceEvents({
        onConvergenceEvent,
        nodeId,
        requiredSchemaTableId,
        tableName,
        requiredSchemaVersion,
        discoveryReadiness,
      });
      if (discoveryReadiness.ready) {
        return {
          ready: true,
          reasons: [],
        };
      }
      return buildCanonicalDiscoveryProbeFailureResult(
        nodeId,
        discoveryReadiness,
      );
    } catch (error) {
      const canonicalReadiness = buildCanonicalReadinessFromDiscoveryError({
        error,
        requiredSchemaVersion,
      });
      const probeErrorMessage = String(error?.message || error);
      await maybeCaptureBenchmarkMetadataSnapshot(
        node,
        BENCHMARK_METADATA_STAGE_DISCOVERY_ERROR,
        canonicalReadiness,
        probeErrorMessage,
      );
      recordVersionedReadiness(nodeId, canonicalReadiness);
      recordReadinessObservation(nodeId, canonicalReadiness);
      const canonicalReasonText =
        canonicalReadiness.reasons.length > ZERO ?
          canonicalReadiness.reasons.join('|') :
          DISCOVERY_READINESS_REASON_ADMIN_NOT_QUERYABLE;
      return {
        ready: false,
        reasons: [
          QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX +
            nodeId +
            '=' +
            QUIESCENCE_REASON_DISCOVERY_NOT_READY_PREFIX +
            canonicalReasonText +
            '|probe_error=' +
            probeErrorMessage,
        ],
      };
    }
  }

  async function probeTableReadinessForNode(node, nodeId) {
    try {
      await nodeClient.queryControl(
        node,
        tableProbeSql,
        [],
        NODE_CLIENT_TRANSIENT_CONTEXT,
      );
      return {
        ready: true,
        reasons: [],
      };
    } catch (error) {
      const probeErrorMessage = String(error?.message || error);
      if (isRetriableTableReadyError(error)) {
        try {
          const discoverySnapshot = await nodeClient.fetchServiceDiscovery(
            node,
            buildQuiescenceDiscoveryContext(
              tableName,
              requiredSchemaTableId,
              false,
            ),
          );
          const discoveryReadiness = resolveNodeReadinessFromServiceDiscovery(
            discoverySnapshot,
            nodeId,
            {
              admissionRuntimeOwnership: runtimeAdmissionOwnership,
            },
          );
          if (!discoveryReadiness.ready) {
            return {
              ready: false,
              reasons: [
                QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX +
                  nodeId +
                  '=' +
                  QUIESCENCE_REASON_DISCOVERY_NOT_READY_PREFIX +
                  discoveryReadiness.reasons.join('|') +
                  '|probe_error=' +
                  probeErrorMessage,
              ],
            };
          }
        } catch (_discoveryError) {
          // Fall through to the original probe error path.
        }
      }
      return {
        ready: false,
        reasons: [
          QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX +
            nodeId +
            '=' +
            probeErrorMessage,
        ],
      };
    }
  }

  function hasQuiescenceProgressAdvanced(includedNodeIds) {
    let progressObserved = false;
    const inFlightCount = gateProgressState.inFlightCount;
    if (
      Number.isInteger(inFlightCount) &&
      inFlightCount < lowestInFlightCount
    ) {
      lowestInFlightCount = inFlightCount;
      progressObserved = true;
    }

    const leaderQuietElapsedMs = Number.isFinite(
      gateProgressState.leaderQuietElapsedMs,
    ) ?
      gateProgressState.leaderQuietElapsedMs :
      ZERO;
    if (
      inFlightCount === ZERO &&
      leaderQuietElapsedMs > maxLeaderQuietElapsedMs
    ) {
      maxLeaderQuietElapsedMs = leaderQuietElapsedMs;
      progressObserved = true;
    }

    const includedCount = Array.isArray(includedNodeIds) ?
      includedNodeIds.length :
      ZERO;
    if (includedCount > maxIncludedNodeCount) {
      maxIncludedNodeCount = includedCount;
      progressObserved = true;
    }

    const operationTimelineSignature =
      typeof gateProgressState.operationTimelineSignature === 'string' ?
        gateProgressState.operationTimelineSignature :
        null;
    if (
      operationTimelineSignature !== null &&
      operationTimelineSignature !== lastOperationTimelineSignature
    ) {
      lastOperationTimelineSignature = operationTimelineSignature;
      progressObserved = true;
    }
    return progressObserved;
  }

  const gateEngine = new GateEngine({
    now: timing.now,
    sleep: timing.sleep,
  });
  const controlSnapshotCandidates = resolveControlSnapshotCandidates(
    seedNode,
    snapshotNodes,
  );
  const gateResult = await gateEngine.waitForGate({
    nodes: loadNodes,
    timeoutMs,
    pollIntervalMs,
    stableWindowMs: effectiveStableWindowMs,
    probeNode: async (node) => {
      const nodeId = String(node?.id || DISCOVERY_UNKNOWN_NODE_ID);
      if (requireCanonicalReadiness) {
        return probeCanonicalReadinessForNode(node, nodeId);
      }
      return probeTableReadinessForNode(node, nodeId);
    },
    evaluateGlobalCondition: async () => {
      try {
        const controlSnapshot = await fetchControlSnapshotFromCandidates(
          nodeClient,
          controlSnapshotCandidates,
          NODE_CLIENT_TRANSIENT_CONTEXT,
        );
        const {
          inFlightCount,
          partitionGroupInFlight,
          operationTimelineByOperationId,
          operationTimelineSignature,
          operationLiveness,
        } = extractControlSnapshotReplicaOperationDetails(controlSnapshot);
        const leaderEntries = extractSortedLeaderEntries(controlSnapshot);
        const leaderSignature = JSON.stringify(leaderEntries);
        if (
          lastLeaderSignature === null ||
          lastLeaderSignature !== leaderSignature
        ) {
          lastLeaderChangeAtMs = timing.now();
        }
        lastLeaderSignature = leaderSignature;

        const leaderQuietElapsedMs = timing.now() - lastLeaderChangeAtMs;
        const leadershipStable =
          leaderEntries.length > ZERO &&
          leaderQuietElapsedMs >= effectiveStableWindowMs;
        const reasons = buildGlobalQuiescenceConditionReasons(
          inFlightCount,
          effectiveMaxReplicaOpsInFlight,
          leadershipStable,
          leaderQuietElapsedMs,
        );

        gateProgressState.inFlightCount = inFlightCount;
        gateProgressState.leaderQuietElapsedMs = leaderQuietElapsedMs;
        gateProgressState.partitionGroupInFlight = partitionGroupInFlight;
        gateProgressState.operationTimelineByOperationId =
          operationTimelineByOperationId;
        gateProgressState.operationTimelineSignature =
          operationTimelineSignature;
        gateProgressState.operationLiveness = operationLiveness;

        return {
          ready: reasons.length === ZERO,
          reasons,
        };
      } catch (error) {
        return {
          ready: false,
          reasons: [
            QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX +
              String(error?.message || error),
          ],
        };
      }
    },
    abortIf: ({nowMs, includedNodeIds}) => {
      if (effectiveNoProgressTimeoutMs === null) {
        return null;
      }
      if (hasQuiescenceProgressAdvanced(includedNodeIds)) {
        lastProgressAtMs = nowMs;
        return null;
      }

      const stalledMs = nowMs - lastProgressAtMs;
      if (
        stalledMs < effectiveNoProgressTimeoutMs ||
        shouldSuppressQuiescenceStallAbort(
          gateProgressState.inFlightCount,
          gateProgressState.operationLiveness,
        )
      ) {
        return null;
      }
      return {
        abort: true,
        reason: QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX + String(stalledMs),
      };
    },
  });

  const includedNodeIds = new Set(gateResult.includedNodeIds || []);
  const readyLoadNodes = loadNodes.filter((node) =>
    includedNodeIds.has(node.id),
  );
  const excludedLoadNodeIds = loadNodes
    .map((node) => node.id)
    .filter((nodeId) => !includedNodeIds.has(nodeId));

  if (gateResult.mode === GATE_RESULT_MODE.ALL_READY) {
    return {
      mode: gateResult.mode,
      attempts: gateResult.attempts,
      stableElapsedMs: gateResult.stableElapsedMs,
      inFlightCount: ZERO,
      readyLoadNodes,
      excludedLoadNodeIds,
      partitionGroupInFlight: {
        ...gateProgressState.partitionGroupInFlight,
      },
      replicaOperationTimelineByOperationId: {
        ...gateProgressState.operationTimelineByOperationId,
      },
      reasonHistogram: gateResult.reasonHistogram || {},
      includedNodeIds: gateResult.includedNodeIds || [],
      ...(requireCanonicalReadiness ?
        {
          readinessTimeline: [...readinessTimeline],
          versionConvergence: buildVersionConvergenceSnapshot(),
        } :
        {}),
    };
  }

  const details = buildQuiescenceFailureDetails(
    gateResult.reasonHistogram,
    readyLoadNodes.length,
  );
  const errorPrefix =
    gateResult.aborted === true ?
      'SUT load nodes did not reach quiescent state; gate aborted due to ' +
        'stalled progress' :
      'SUT load nodes did not reach quiescent state within ' +
        timeoutMs +
        'ms';
  const error = new Error(
    errorPrefix +
      (details.length > ZERO ? ' (' + details.join(', ') + ')' : ''),
  );
  error.gateResult = {
    ...gateResult,
    partitionGroupInFlight: {
      ...gateProgressState.partitionGroupInFlight,
    },
    replicaOperationTimelineByOperationId: {
      ...gateProgressState.operationTimelineByOperationId,
    },
    includedNodeIds: gateResult.includedNodeIds || [],
    excludedNodeIds: gateResult.excludedNodeIds || [],
    reasonHistogram: gateResult.reasonHistogram || {},
    ...(requireCanonicalReadiness ?
      {
        readinessTimeline: [...readinessTimeline],
        versionConvergence: buildVersionConvergenceSnapshot(),
      } :
      {}),
  };
  throw error;
}

function buildPsqlCommand(options = {}) {
  const host = String(options.host || LOCALHOST);
  const port = Number.isInteger(options.port) ?
    options.port :
    DEFAULT_REPLICATION_PORT;
  const user = String(options.user || 'postgres');
  const password = String(options.password || '');
  const database = String(options.database || 'postgres');
  const sql = String(options.sql || '');
  const tuplesOnly = options.tuplesOnly === true ? PSQL_TUPLES_ONLY : '';

  return [
    `PGPASSWORD='${shellQuote(password)}'`,
    'psql',
    PSQL_ON_ERROR_STOP,
    tuplesOnly,
    `-h '${shellQuote(host)}'`,
    `-p ${port}`,
    `-U '${shellQuote(user)}'`,
    `-d '${shellQuote(database)}'`,
    `-c '${shellQuote(sql)}'`,
  ]
    .filter((part) => part.length > ZERO)
    .join(' ');
}

function buildSynchronousStandbySetting(syncReplicaAcks) {
  return (
    SYNC_STANDBY_TEMPLATE_PREFIX +
    String(syncReplicaAcks) +
    SYNC_STANDBY_TEMPLATE_SUFFIX
  );
}

function buildReplicaBootstrapCommand(
  primaryContainerName,
  replicaName,
  benchmarkConfig,
) {
  const basebackupConnectionString = [
    `host=${primaryContainerName}`,
    `port=${benchmarkConfig.port}`,
    `user=${benchmarkConfig.user}`,
    `password=${benchmarkConfig.password}`,
    `dbname=${BOOTSTRAP_DB_NAME}`,
    `application_name=${replicaName}`,
  ].join(' ');

  return [
    'set -e',
    'if [ ! -s "$PGDATA/PG_VERSION" ]; then',
    '  rm -rf "$PGDATA"/*',
    `  until pg_isready -h '${shellQuote(primaryContainerName)}' ` +
      `-p ${benchmarkConfig.port} -U '${shellQuote(benchmarkConfig.user)}'; do`,
    '    sleep 1',
    '  done',
    `  pg_basebackup --dbname='${shellQuote(basebackupConnectionString)}' ` +
      '-D "$PGDATA" -Fp -Xs -P -R',
    'fi',
    POSTGRES_BINARY_PATH_EXPORT,
    `exec ${POSTGRES_ENTRYPOINT_COMMAND}`,
  ].join('\n');
}

async function configurePrimaryReplication(
  provider,
  containerId,
  benchmarkConfig,
) {
  if (benchmarkConfig.replicationFactor <= ONE) {
    return;
  }

  const syncSetting = buildSynchronousStandbySetting(
    benchmarkConfig.syncReplicaAcks,
  );
  const commands = [
    `echo "${REPLICATION_HBA_IPV4}" >> "$PGDATA/pg_hba.conf"`,
    `echo "${REPLICATION_HBA_IPV6}" >> "$PGDATA/pg_hba.conf"`,
    buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql: `ALTER SYSTEM SET synchronous_commit = '${SYNCHRONOUS_COMMIT_ON}'`,
    }),
    buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql: `ALTER SYSTEM SET synchronous_standby_names = '${syncSetting}'`,
    }),
    buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql: 'SELECT pg_reload_conf()',
    }),
  ];

  const shellCommand = commands.join(' && ');
  await execShell(
    provider,
    containerId,
    shellCommand,
    'configure postgres primary replication',
  );
}

async function waitForStreamingReplicas(
  provider,
  primaryContainerId,
  benchmarkConfig,
) {
  const requiredReplicaCount = benchmarkConfig.replicationFactor - ONE;
  if (requiredReplicaCount <= ZERO) {
    return;
  }

  const deadline = Date.now() + benchmarkConfig.readyTimeoutMs;
  while (Date.now() < deadline) {
    const queryCommand = buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql:
        'SELECT count(*) FROM pg_stat_replication ' +
        `WHERE state = '${REPLICATION_STATE_STREAMING}'`,
      tuplesOnly: true,
    });

    const output = await execShell(
      provider,
      primaryContainerId,
      queryCommand,
      'check postgres replication status',
    );
    const replicaCount = Number.parseInt(String(output).trim(), 10);
    if (
      Number.isInteger(replicaCount) &&
      replicaCount >= requiredReplicaCount
    ) {
      return;
    }
    await sleep(benchmarkConfig.readyPollIntervalMs);
  }

  throw new Error(
    'Postgres replicas did not reach streaming state within ' +
      benchmarkConfig.readyTimeoutMs +
      'ms',
  );
}

function resolveBenchmarkConfig(cluster) {
  return resolvePostgresBaselineBenchmarkConfig(
    cluster?._config?.benchmark || {},
  );
}

function normalizePositiveFiniteIntegerOrZero(value) {
  return Number.isFinite(value) && value > ZERO ? Math.floor(value) : ZERO;
}

function normalizePositiveFiniteIntegerOrNull(value) {
  return Number.isFinite(value) && value > ZERO ? Math.floor(value) : null;
}

function resolvePreflightConvergenceOptions(
  cluster,
  benchmarkConfig,
  nodeCount,
) {
  const convergenceConfig = cluster?._config?.convergence;
  const isLargeCluster =
    nodeCount >= PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD;
  let settleTimeoutMs = Math.max(
    normalizePositiveFiniteIntegerOrZero(convergenceConfig?.settleTimeoutMs),
    normalizePositiveFiniteIntegerOrZero(benchmarkConfig?.readyTimeoutMs),
    normalizePositiveFiniteIntegerOrZero(benchmarkConfig?.quiescentTimeoutMs),
  );
  let targetVoterCount = normalizePositiveFiniteIntegerOrNull(
    convergenceConfig?.targetVoterCount,
  );

  if (isLargeCluster) {
    settleTimeoutMs = Math.max(
      settleTimeoutMs,
      PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_MIN_SETTLE_TIMEOUT_MS,
    );
    if (targetVoterCount !== null) {
      targetVoterCount += PREFLIGHT_CONVERGENCE_ALLOWED_VOTER_SKEW;
    }
  }

  if (settleTimeoutMs <= ZERO) {
    settleTimeoutMs = BENCHMARK_DEFAULTS.readyTimeoutMs;
  }

  return {
    settleTimeoutMs,
    quietWindowMs: convergenceConfig?.quietWindowMs,
    targetVoterCount,
    ...(isLargeCluster ?
      {forceRepairAfterMs: PREFLIGHT_CONVERGENCE_FORCE_REPAIR_AFTER_MS} :
      {}),
  };
}

function resolvePrimaryProvider(cluster) {
  const hostAssignment = cluster?._hostAssignment;
  const providers = cluster?._providers;
  const primaryIndex =
    Array.isArray(hostAssignment) && hostAssignment.length > ZERO ?
      hostAssignment[ZERO] :
      ZERO;

  const provider = Array.isArray(providers) ? providers[primaryIndex] : null;
  assert.ok(provider, 'Primary Docker provider is not available on cluster');
  return provider;
}

function resolveCacheBaseDir(cluster) {
  const configuredOutputDir = cluster?._config?.outputDir;
  if (
    typeof configuredOutputDir !== 'string' ||
    configuredOutputDir.length === ZERO
  ) {
    return null;
  }
  const normalizedPath = configuredOutputDir.trim();
  if (normalizedPath.length === ZERO) {
    return null;
  }
  const lowerPath = normalizedPath.toLowerCase();
  if (lowerPath.endsWith('.json')) {
    return dirname(normalizedPath);
  }
  return normalizedPath;
}

function resolveMachineProfile() {
  const cpuList = osCpus() || [];
  const firstCpu = cpuList[ZERO] || {};
  return {
    platform: osPlatform(),
    arch: osArch(),
    hostname: osHostname(),
    cpuCount: cpuList.length,
    cpuModel: String(firstCpu.model || 'unknown'),
  };
}

export const POSTGRES_BASELINE_COMPARISON_QUIESCENCE_AND_REPLICATION_BUNDLE = {
  ...POSTGRES_BASELINE_COMPARISON_LOAD_NODE_RESOLUTION_BUNDLE,
  waitForSutLoadQuiescence,
  buildPsqlCommand,
  buildSynchronousStandbySetting,
  buildReplicaBootstrapCommand,
  configurePrimaryReplication,
  waitForStreamingReplicas,
  resolveBenchmarkConfig,
  resolvePreflightConvergenceOptions,
  resolvePrimaryProvider,
  resolveCacheBaseDir,
  resolveMachineProfile,
};
