import {POSTGRES_BASELINE_COMPARISON_BASELINE_CACHE_AND_POLICY_BUNDLE} from './postgres-baseline-comparison-baseline-cache-and-policy.js';
const {
  BENCHMARK_CRITICAL_REBALANCING_SUSTAINED_SAMPLES_DEFAULT,
  BENCHMARK_LOAD_REBALANCE_MONITOR_POLL_INTERVAL_MS_DEFAULT,
  BENCHMARK_REBALANCE_HYSTERESIS_MIN_DELTA_DEFAULT,
  DISCOVERY_READINESS_REASON_ROUTING_NOT_READY,
  DISCOVERY_UNKNOWN_NODE_ID,
  HEARTBEAT_FRESHNESS_INVARIANT_FAILED_REASON,
  HEARTBEAT_FRESHNESS_MAX_STALL_MS_DEFAULT,
  HEARTBEAT_FRESHNESS_MIN_SAMPLES_DEFAULT,
  HEARTBEAT_FRESHNESS_SCHEMA_VERSION,
  HEARTBEAT_FRESHNESS_STATUS_FAILED,
  HEARTBEAT_FRESHNESS_STATUS_OK,
  HEARTBEAT_FRESHNESS_STATUS_UNAVAILABLE,
  LOAD_ROUTING_ADMISSION_ERROR_CODE,
  LOAD_ROUTING_ADMISSION_ERROR_MESSAGE_PREFIX,
  LOAD_ROUTING_ADMISSION_MAX_PROBE_ERRORS,
  LOAD_ROUTING_ADMISSION_MAX_TRANSITIONS,
  LOAD_ROUTING_ADMISSION_REASON_PROBE_ERROR_PREFIX,
  LOAD_ROUTING_ADMISSION_REASON_SEPARATOR,
  LOAD_ROUTING_ADMISSION_SOURCE_DISCOVERY,
  LOAD_ROUTING_ADMISSION_SOURCE_PROBE_ERROR,
  LOAD_ROUTING_ADMISSION_SOURCE_PROBE_ERROR_GRACE,
  NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME,
  NODE_CLIENT_TRANSIENT_CONTEXT,
  ONE,
  REBALANCING_CRITICAL_STATE_SCHEMA_VERSION,
  REBALANCING_PINNING_REASON_IN_FLIGHT_REPLICA_OPS,
  REBALANCING_PINNING_REASON_LEADERSHIP_CHURN,
  REBALANCING_PRESSURE_SCHEMA_VERSION,
  ROUTING_DISCOVERY_NO_SNAPSHOT_CANDIDATE,
  ZERO,
  buildLeaderSignatureFromSnapshot,
  buildLoadRoutingAdmissionState,
  fetchControlSnapshotFromCandidates,
  fetchServiceDiscoveryFromCandidates,
  normalizeTableName,
  normalizeNonNegativeInteger,
  normalizeOptionalNonNegativeInteger,
  normalizeRoutingAdmissionGrace,
  normalizeRoutingAdmissionReasons,
  resolveControlSnapshotCandidates,
  resolveLoadRoutingAdmissionProbeErrorGraceMs,
  resolveNodeReadinessFromServiceDiscovery,
  resolveRoutingAdmissionProbeErrorGraceState,
  truncateDiscoveryErrorMessage,
  uniqueSorted,
} = POSTGRES_BASELINE_COMPARISON_BASELINE_CACHE_AND_POLICY_BUNDLE;

function buildRoutingAdmissionTransitionSnapshot(state) {
  if (!state) {
    return null;
  }
  return {
    ready: state.ready === true,
    reasons: normalizeRoutingAdmissionReasons(state.reasons),
    source:
      typeof state.source === 'string' && state.source.length > ZERO ?
        state.source :
        null,
    lastReadyObservedAtMs: normalizeOptionalNonNegativeInteger(
      state.lastReadyObservedAtMs,
    ),
    grace: normalizeRoutingAdmissionGrace(state.grace),
  };
}

function buildNormalizedRoutingAdmissionNodeState(
  normalizedNodeId,
  nextState = {},
) {
  const normalizedObservedAtMs = normalizeNonNegativeInteger(
    nextState.observedAtMs,
  );
  const normalizedReady = nextState.ready === true;
  const explicitLastReadyObservedAtMs = normalizeOptionalNonNegativeInteger(
    nextState.lastReadyObservedAtMs,
  );
  return {
    nodeId: normalizedNodeId,
    ready: normalizedReady,
    reasons: normalizeRoutingAdmissionReasons(nextState.reasons),
    source:
      typeof nextState.source === 'string' && nextState.source.length > ZERO ?
        nextState.source :
        null,
    observedAtMs: normalizedObservedAtMs,
    lastReadyObservedAtMs: normalizedReady ?
      (explicitLastReadyObservedAtMs ?? normalizedObservedAtMs) :
      explicitLastReadyObservedAtMs,
    grace: normalizeRoutingAdmissionGrace(nextState.grace),
  };
}

function updateRoutingAdmissionNodeState(
  routingAdmission,
  nodeId,
  nextState = {},
) {
  if (!routingAdmission?.stateByNodeId) {
    return;
  }
  const normalizedNodeId = String(nodeId || '').trim();
  if (normalizedNodeId.length === ZERO) {
    return;
  }
  if (!routingAdmission.admittedNodeIds.includes(normalizedNodeId)) {
    routingAdmission.admittedNodeIds = uniqueSorted([
      ...routingAdmission.admittedNodeIds,
      normalizedNodeId,
    ]);
  }

  const previousSnapshot = buildRoutingAdmissionTransitionSnapshot(
    routingAdmission.stateByNodeId[normalizedNodeId] || null,
  );
  const normalizedState = buildNormalizedRoutingAdmissionNodeState(
    normalizedNodeId,
    nextState,
  );
  routingAdmission.stateByNodeId[normalizedNodeId] = normalizedState;

  const nextSnapshot = buildRoutingAdmissionTransitionSnapshot(normalizedState);
  if (JSON.stringify(previousSnapshot) === JSON.stringify(nextSnapshot)) {
    return;
  }

  routingAdmission.transitions.push({
    nodeId: normalizedNodeId,
    observedAtMs: normalizedState.observedAtMs,
    previous: previousSnapshot,
    next: nextSnapshot,
  });
  if (
    routingAdmission.transitions.length > LOAD_ROUTING_ADMISSION_MAX_TRANSITIONS
  ) {
    routingAdmission.transitions.shift();
  }
}

function buildRoutingAdmissionContext(tableName) {
  const normalizedTableName = normalizeTableName(tableName, '');
  return normalizedTableName.length > ZERO ?
    {
      ...NODE_CLIENT_TRANSIENT_CONTEXT,
      [NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME]: normalizedTableName,
    } :
    NODE_CLIENT_TRANSIENT_CONTEXT;
}

function buildRoutingAdmissionBlockedError(nodeId, reasons) {
  const normalizedNodeId = String(nodeId || DISCOVERY_UNKNOWN_NODE_ID);
  const normalizedReasons = normalizeRoutingAdmissionReasons(reasons);
  const error = new Error(
    LOAD_ROUTING_ADMISSION_ERROR_MESSAGE_PREFIX +
      ': node=' +
      normalizedNodeId +
      ', reasons=' +
      (normalizedReasons.length > ZERO ?
        normalizedReasons.join(LOAD_ROUTING_ADMISSION_REASON_SEPARATOR) :
        DISCOVERY_READINESS_REASON_ROUTING_NOT_READY),
  );
  error.code = LOAD_ROUTING_ADMISSION_ERROR_CODE;
  error.nodeId = normalizedNodeId;
  error.reasons = normalizedReasons;
  return error;
}

function buildLoadRebalancingPressureState(options = {}) {
  const startedAtMs = Date.now();
  return {
    schemaVersion: REBALANCING_PRESSURE_SCHEMA_VERSION,
    monitoredNodeIds: Array.isArray(options.monitoredNodeIds) ?
      [...options.monitoredNodeIds] :
      [],
    sampleCount: ZERO,
    maxReplicaOpsInFlight: ZERO,
    totalLeaderChanges: ZERO,
    maxLeaderChangesWithinCooldown: ZERO,
    cooldownMs: normalizeNonNegativeInteger(options.cooldownMs),
    minLeaderChangeDelta:
      Number.isInteger(options.minLeaderChangeDelta) &&
      options.minLeaderChangeDelta > ZERO ?
        options.minLeaderChangeDelta :
        BENCHMARK_REBALANCE_HYSTERESIS_MIN_DELTA_DEFAULT,
    pollIntervalMs:
      Number.isInteger(options.pollIntervalMs) && options.pollIntervalMs > ZERO ?
        options.pollIntervalMs :
        BENCHMARK_LOAD_REBALANCE_MONITOR_POLL_INTERVAL_MS_DEFAULT,
    maxReplicaOpsInFlightLimit: normalizeNonNegativeInteger(
      options.maxReplicaOpsInFlightLimit,
    ),
    startedAtMs,
    endedAtMs: null,
    snapshotErrors: [],
    samples: [],
    pinning: {
      enabled: options.pinningEnabled === true,
      bypassed: options.pinningBypassed === true,
      violated: false,
      cancelledLoad: false,
      violationReasons: [],
    },
    heartbeatFreshness: createHeartbeatFreshnessState({
      monitoredNodeIds: options.monitoredNodeIds,
      maxStallMs: options.heartbeatFreshnessMaxStallMs,
      minSamples: options.heartbeatFreshnessMinSamples,
    }),
    routingAdmission: buildLoadRoutingAdmissionState({
      admittedNodeIds: options.admittedNodeIds,
      probeErrorGraceMs: options.probeErrorGraceMs,
      initialObservedAtMs: startedAtMs,
    }),
  };
}

function createHeartbeatFreshnessState(options = {}) {
  return {
    schemaVersion: HEARTBEAT_FRESHNESS_SCHEMA_VERSION,
    monitoredNodeIds: Array.isArray(options.monitoredNodeIds) ?
      [...options.monitoredNodeIds] :
      [],
    maxStallMs:
      Number.isInteger(options.maxStallMs) && options.maxStallMs > ZERO ?
        options.maxStallMs :
        HEARTBEAT_FRESHNESS_MAX_STALL_MS_DEFAULT,
    minSamples:
      Number.isInteger(options.minSamples) && options.minSamples > ZERO ?
        options.minSamples :
        HEARTBEAT_FRESHNESS_MIN_SAMPLES_DEFAULT,
    sampleCount: ZERO,
    status: HEARTBEAT_FRESHNESS_STATUS_UNAVAILABLE,
    failed: false,
    evaluatedNodeIds: [],
    unavailableNodeIds: [],
    stalledNodeIds: [],
    messages: [],
    perNode: {},
  };
}

function normalizeControlSnapshotNodeLiveness(nodeLivenessByNodeId, nodeId) {
  const nodeLiveness =
    nodeLivenessByNodeId && typeof nodeLivenessByNodeId === 'object' ?
      nodeLivenessByNodeId[nodeId] :
      null;
  if (!nodeLiveness || typeof nodeLiveness !== 'object') {
    return null;
  }
  const lastHeartbeat = Number(nodeLiveness.lastHeartbeat);
  const heartbeatAgeMs = Number(nodeLiveness.heartbeatAgeMs);
  const readyLeaseExpiresAt = Number(nodeLiveness.readyLeaseExpiresAt);
  const readyLeaseLagMs = Number(
    nodeLiveness.readyLeaseLagMs ?? nodeLiveness.readyLeaseAgeMs,
  );
  return {
    lastHeartbeat: Number.isFinite(lastHeartbeat) ? lastHeartbeat : null,
    heartbeatAgeMs: Number.isFinite(heartbeatAgeMs) ? heartbeatAgeMs : null,
    readyLeaseExpiresAt: Number.isFinite(readyLeaseExpiresAt) ?
      readyLeaseExpiresAt :
      null,
    readyLeaseLagMs: Number.isFinite(readyLeaseLagMs) ? readyLeaseLagMs : null,
  };
}

function createEmptyPerNodeHeartbeatFreshnessState() {
  return {
    sampleCount: ZERO,
    firstObservedAtMs: null,
    lastObservedAtMs: null,
    firstLastHeartbeat: null,
    lastLastHeartbeat: null,
    lastAdvancedAtMs: null,
    maxHeartbeatAgeMs: null,
    currentHeartbeatAgeMs: null,
    maxReadyLeaseLagMs: null,
    currentReadyLeaseLagMs: null,
    maxStallDurationMs: ZERO,
    advanced: false,
    failedReasons: [],
  };
}

function updateMaxFiniteMetric(currentMax, nextValue) {
  return Number.isFinite(currentMax) ?
    Math.max(currentMax, nextValue) :
    nextValue;
}

function updateNodeHeartbeatProgression(perNode, lastHeartbeat, observedAtMs) {
  if (!Number.isFinite(lastHeartbeat)) {
    return;
  }
  if (!Number.isFinite(perNode.firstLastHeartbeat)) {
    perNode.firstLastHeartbeat = lastHeartbeat;
  }
  if (
    !Number.isFinite(perNode.lastLastHeartbeat) ||
    lastHeartbeat > perNode.lastLastHeartbeat
  ) {
    perNode.advanced =
      Number.isFinite(perNode.firstLastHeartbeat) &&
      lastHeartbeat > perNode.firstLastHeartbeat;
    perNode.lastLastHeartbeat = lastHeartbeat;
    perNode.lastAdvancedAtMs = observedAtMs;
    return;
  }
  const stallAnchorMs = Number.isFinite(perNode.lastAdvancedAtMs) ?
    perNode.lastAdvancedAtMs :
    perNode.firstObservedAtMs;
  if (Number.isFinite(stallAnchorMs)) {
    perNode.maxStallDurationMs = Math.max(
      perNode.maxStallDurationMs,
      observedAtMs - stallAnchorMs,
    );
  }
}

function updatePerNodeHeartbeatFreshnessSample(
  perNode,
  nodeLiveness,
  observedAtMs,
) {
  perNode.sampleCount += ONE;
  if (!Number.isFinite(perNode.firstObservedAtMs)) {
    perNode.firstObservedAtMs = observedAtMs;
  }
  perNode.lastObservedAtMs = observedAtMs;
  if (Number.isFinite(nodeLiveness.heartbeatAgeMs)) {
    perNode.currentHeartbeatAgeMs = nodeLiveness.heartbeatAgeMs;
    perNode.maxHeartbeatAgeMs = updateMaxFiniteMetric(
      perNode.maxHeartbeatAgeMs,
      nodeLiveness.heartbeatAgeMs,
    );
  }
  if (Number.isFinite(nodeLiveness.readyLeaseLagMs)) {
    perNode.currentReadyLeaseLagMs = nodeLiveness.readyLeaseLagMs;
    perNode.maxReadyLeaseLagMs = updateMaxFiniteMetric(
      perNode.maxReadyLeaseLagMs,
      nodeLiveness.readyLeaseLagMs,
    );
  }
  updateNodeHeartbeatProgression(
    perNode,
    nodeLiveness.lastHeartbeat,
    observedAtMs,
  );
}

function recordHeartbeatFreshnessSample(
  pressure,
  observedAtMs,
  snapshot = null,
) {
  const heartbeatFreshness = pressure?.heartbeatFreshness;
  const nodeLivenessByNodeId =
    snapshot?.controlPlaneDiagnostics?.nodeLivenessByNodeId;
  if (
    !heartbeatFreshness ||
    typeof heartbeatFreshness !== 'object' ||
    !nodeLivenessByNodeId ||
    typeof nodeLivenessByNodeId !== 'object'
  ) {
    return;
  }

  heartbeatFreshness.sampleCount += ONE;
  for (const nodeId of heartbeatFreshness.monitoredNodeIds) {
    const nodeLiveness = normalizeControlSnapshotNodeLiveness(
      nodeLivenessByNodeId,
      nodeId,
    );
    const perNode =
      heartbeatFreshness.perNode[nodeId] ||
      createEmptyPerNodeHeartbeatFreshnessState();
    if (nodeLiveness) {
      updatePerNodeHeartbeatFreshnessSample(
        perNode,
        nodeLiveness,
        observedAtMs,
      );
    }
    heartbeatFreshness.perNode[nodeId] = perNode;
  }
}

function collectPerNodeHeartbeatFailedReasons(perNode, maxStallMs) {
  const failedReasons = [];
  if (perNode.advanced !== true) {
    failedReasons.push('heartbeat_not_advancing');
  }
  if (
    Number.isFinite(perNode.maxStallDurationMs) &&
    perNode.maxStallDurationMs > maxStallMs
  ) {
    failedReasons.push(
      'heartbeat_stalled:' + String(perNode.maxStallDurationMs),
    );
  }
  if (
    Number.isFinite(perNode.currentHeartbeatAgeMs) &&
    perNode.currentHeartbeatAgeMs > maxStallMs
  ) {
    failedReasons.push(
      'heartbeat_age_exceeded:' + String(perNode.currentHeartbeatAgeMs),
    );
  }
  return failedReasons;
}

function resolveHeartbeatFreshnessStatus(stalledNodeIds, evaluatedNodeIds) {
  if (stalledNodeIds.length > ZERO) {
    return HEARTBEAT_FRESHNESS_STATUS_FAILED;
  }
  return evaluatedNodeIds.length > ZERO ?
    HEARTBEAT_FRESHNESS_STATUS_OK :
    HEARTBEAT_FRESHNESS_STATUS_UNAVAILABLE;
}

function finalizeHeartbeatFreshnessState(pressure) {
  const heartbeatFreshness = pressure?.heartbeatFreshness;
  if (!heartbeatFreshness || typeof heartbeatFreshness !== 'object') {
    return null;
  }

  const evaluatedNodeIds = [];
  const unavailableNodeIds = [];
  const stalledNodeIds = [];
  const messages = [];

  for (const nodeId of heartbeatFreshness.monitoredNodeIds) {
    const perNode = heartbeatFreshness.perNode[nodeId] || null;
    if (
      !perNode ||
      !Number.isInteger(perNode.sampleCount) ||
      perNode.sampleCount < heartbeatFreshness.minSamples
    ) {
      unavailableNodeIds.push(nodeId);
      continue;
    }

    evaluatedNodeIds.push(nodeId);
    const failedReasons = collectPerNodeHeartbeatFailedReasons(
      perNode,
      heartbeatFreshness.maxStallMs,
    );
    perNode.failedReasons = failedReasons;
    if (failedReasons.length > ZERO) {
      stalledNodeIds.push(nodeId);
      messages.push(
        HEARTBEAT_FRESHNESS_INVARIANT_FAILED_REASON +
          ': node=' +
          nodeId +
          ', reasons=' +
          failedReasons.join('|'),
      );
    }
  }

  heartbeatFreshness.evaluatedNodeIds = evaluatedNodeIds;
  heartbeatFreshness.unavailableNodeIds = unavailableNodeIds;
  heartbeatFreshness.stalledNodeIds = stalledNodeIds;
  heartbeatFreshness.messages = messages;
  heartbeatFreshness.failed = stalledNodeIds.length > ZERO;
  heartbeatFreshness.status = resolveHeartbeatFreshnessStatus(
    stalledNodeIds,
    evaluatedNodeIds,
  );
  return heartbeatFreshness;
}

function formatHeartbeatFreshnessFailures(heartbeatFreshness) {
  const stalledNodeIds = Array.isArray(heartbeatFreshness?.stalledNodeIds) ?
    heartbeatFreshness.stalledNodeIds :
    [];
  const parts = [];
  for (const nodeId of stalledNodeIds) {
    const failedReasons = Array.isArray(
      heartbeatFreshness?.perNode?.[nodeId]?.failedReasons,
    ) ?
      heartbeatFreshness.perNode[nodeId].failedReasons :
      [];
    parts.push(
      'node=' +
        nodeId +
        ', reasons=' +
        (failedReasons.length > ZERO ? failedReasons.join('|') : 'unknown'),
    );
  }
  return parts.join('; ');
}

function formatLoadRebalancingPinningReasons(reasons) {
  const normalizedReasons = Array.isArray(reasons) ?
    reasons.map((reason) => String(reason)) :
    [];
  return normalizedReasons.length > ZERO ?
    normalizedReasons.join('|') :
    'unknown';
}

function checkAndApplyRebalancingPinningViolation(
  pressure,
  inFlightReplicaOps,
  leaderChangesWithinCooldown,
  loadRun,
) {
  if (
    !pressure.pinning.enabled ||
    pressure.pinning.bypassed ||
    pressure.pinning.violated
  ) {
    return;
  }
  const violationReasons = [];
  if (inFlightReplicaOps > pressure.maxReplicaOpsInFlightLimit) {
    violationReasons.push(
      REBALANCING_PINNING_REASON_IN_FLIGHT_REPLICA_OPS +
        ':observed=' +
        String(inFlightReplicaOps) +
        ',limit=' +
        String(pressure.maxReplicaOpsInFlightLimit),
    );
  }
  if (leaderChangesWithinCooldown >= pressure.minLeaderChangeDelta) {
    violationReasons.push(
      REBALANCING_PINNING_REASON_LEADERSHIP_CHURN +
        ':observed=' +
        String(leaderChangesWithinCooldown) +
        ',min_delta=' +
        String(pressure.minLeaderChangeDelta) +
        ',cooldown_ms=' +
        String(pressure.cooldownMs),
    );
  }
  if (violationReasons.length === ZERO) {
    return;
  }
  pressure.pinning.violated = true;
  for (const reason of violationReasons) {
    if (!pressure.pinning.violationReasons.includes(reason)) {
      pressure.pinning.violationReasons.push(reason);
    }
  }
  if (loadRun && typeof loadRun.cancel === 'function') {
    pressure.pinning.cancelledLoad = true;
    loadRun.cancel();
  }
}

function recordRoutingAdmissionProbeFailure({
  routingAdmission,
  nodeId,
  observedAtMs,
  error,
  graceNodeIds,
  blockedNodeIds,
}) {
  const errorMessage = String(error?.message || error);
  const reason =
    LOAD_ROUTING_ADMISSION_REASON_PROBE_ERROR_PREFIX +
    truncateDiscoveryErrorMessage(errorMessage);
  const previousState = routingAdmission.stateByNodeId?.[nodeId] || null;
  routingAdmission.probeErrors.push({
    nodeId,
    observedAtMs,
    error: errorMessage,
  });
  if (
    routingAdmission.probeErrors.length >
    LOAD_ROUTING_ADMISSION_MAX_PROBE_ERRORS
  ) {
    routingAdmission.probeErrors.shift();
  }
  const retainedState = resolveRoutingAdmissionProbeErrorGraceState(
    previousState,
    observedAtMs,
    routingAdmission.probeErrorGraceMs,
    reason,
  );
  if (retainedState) {
    updateRoutingAdmissionNodeState(routingAdmission, nodeId, {
      ready: true,
      reasons: [],
      source: LOAD_ROUTING_ADMISSION_SOURCE_PROBE_ERROR_GRACE,
      observedAtMs,
      lastReadyObservedAtMs: retainedState.lastReadyObservedAtMs,
      grace: retainedState.grace,
    });
    graceNodeIds.push(nodeId);
    return false;
  }
  updateRoutingAdmissionNodeState(routingAdmission, nodeId, {
    ready: false,
    reasons: [reason],
    source: LOAD_ROUTING_ADMISSION_SOURCE_PROBE_ERROR,
    observedAtMs,
    lastReadyObservedAtMs: null,
    grace: null,
  });
  blockedNodeIds.push(nodeId);
  return true;
}

function evaluateNodeRoutingAdmissionFromDiscovery({
  routingDiscoverySnapshot,
  routingDiscoveryErrorMessage,
  routingAdmission,
  nodeId,
  observedAtMs,
  options,
  blockedNodeIds,
  graceNodeIds,
}) {
  try {
    if (!routingDiscoverySnapshot) {
      throw new Error(
        routingDiscoveryErrorMessage || ROUTING_DISCOVERY_NO_SNAPSHOT_CANDIDATE,
      );
    }
    const readiness = resolveNodeReadinessFromServiceDiscovery(
      routingDiscoverySnapshot,
      nodeId,
      {
        enforceCanonicalRouteReadiness: true,
        adminQueryable: true,
        requiredSchemaVersion: options.requiredSchemaVersion,
        admissionRuntimeOwnership: options.admissionRuntimeOwnership,
      },
    );
    const ready = readiness?.ready === true;
    const hasReasons =
      Array.isArray(readiness?.reasons) && readiness.reasons.length > ZERO;
    const reasons = ready ?
      [] :
      hasReasons ?
        readiness.reasons :
        [DISCOVERY_READINESS_REASON_ROUTING_NOT_READY];
    updateRoutingAdmissionNodeState(routingAdmission, nodeId, {
      ready,
      reasons,
      source: LOAD_ROUTING_ADMISSION_SOURCE_DISCOVERY,
      observedAtMs,
    });
    if (!ready) {
      blockedNodeIds.push(nodeId);
      return true;
    }
    return false;
  } catch (error) {
    return recordRoutingAdmissionProbeFailure({
      routingAdmission,
      nodeId,
      observedAtMs,
      error,
      graceNodeIds,
      blockedNodeIds,
    });
  }
}

async function sampleRoutingAdmissionAcrossLoadNodes({
  nodeClient,
  routingSnapshotCandidates,
  routingAdmissionContext,
  loadNodes,
  pressure,
  observedAtMs,
  options,
  sample,
}) {
  let routingDiscoverySnapshot = null;
  let routingDiscoveryErrorMessage = null;
  try {
    routingDiscoverySnapshot = await fetchServiceDiscoveryFromCandidates(
      nodeClient,
      routingSnapshotCandidates,
      routingAdmissionContext,
    );
  } catch (error) {
    routingDiscoveryErrorMessage = String(error?.message || error);
  }
  const routingAdmission = pressure.routingAdmission;
  let blockedCount = ZERO;
  const blockedNodeIds = [];
  const graceNodeIds = [];
  for (const node of loadNodes) {
    const nodeId =
      typeof node?.id === 'string' && node.id.length > ZERO ?
        node.id :
        DISCOVERY_UNKNOWN_NODE_ID;
    const blocked = evaluateNodeRoutingAdmissionFromDiscovery({
      routingDiscoverySnapshot,
      routingDiscoveryErrorMessage,
      routingAdmission,
      nodeId,
      observedAtMs,
      options,
      blockedNodeIds,
      graceNodeIds,
    });
    if (blocked) {
      blockedCount += ONE;
    }
  }
  routingAdmission.sampleCount += ONE;
  if (blockedCount > ZERO) {
    routingAdmission.blockedSampleCount += ONE;
  } else {
    routingAdmission.allowedSampleCount += ONE;
  }
  if (graceNodeIds.length > ZERO) {
    routingAdmission.graceSampleCount += ONE;
  }
  sample.routingAdmissionBlockedCount = blockedCount;
  sample.routingAdmissionBlockedNodeIds = uniqueSorted(blockedNodeIds);
  sample.routingAdmissionGraceNodeIds = uniqueSorted(graceNodeIds);
}

function startLoadRebalancingPressureMonitor(options = {}) {
  const nodeClient = options.nodeClient;
  const loadNodes = Array.isArray(options.loadNodes) ? options.loadNodes : [];
  const benchmarkConfig = options.benchmarkConfig || {};
  const loadRun = options.loadRun || null;
  const routingAdmissionContext = buildRoutingAdmissionContext(
    options.tableName,
  );
  const admittedNodeIds = uniqueSorted(
    loadNodes
      .map((node) => String(node?.id || '').trim())
      .filter((nodeId) => nodeId.length > ZERO),
  );
  const controlSnapshotCandidates = resolveControlSnapshotCandidates(
    options.seedNode || null,
    loadNodes,
  );
  const routingSnapshotCandidates = resolveControlSnapshotCandidates(
    options.seedNode || null,
    loadNodes,
  );
  const pressure = buildLoadRebalancingPressureState({
    monitoredNodeIds: admittedNodeIds,
    cooldownMs: benchmarkConfig.rebalanceHysteresisCooldownMs,
    minLeaderChangeDelta: benchmarkConfig.rebalanceHysteresisMinDelta,
    pollIntervalMs: benchmarkConfig.loadRebalanceMonitorPollIntervalMs,
    maxReplicaOpsInFlightLimit:
      benchmarkConfig.loadRebalanceMaxReplicaOpsInFlight,
    heartbeatFreshnessMaxStallMs: benchmarkConfig.heartbeatFreshnessMaxStallMs,
    heartbeatFreshnessMinSamples: benchmarkConfig.heartbeatFreshnessMinSamples,
    pinningEnabled: benchmarkConfig.pinRebalancingDuringLoad === true,
    pinningBypassed: benchmarkConfig.allowLoadRebalancePinningBypass === true,
    admittedNodeIds,
    probeErrorGraceMs:
      resolveLoadRoutingAdmissionProbeErrorGraceMs(benchmarkConfig),
  });

  let lastLeaderSignature = null;
  const leaderChangeAtMs = [];
  let stopRequested = false;
  let sleepTimerId = null;
  let sleepResolve = null;

  function waitForNextPoll() {
    return new Promise((resolve) => {
      sleepResolve = resolve;
      sleepTimerId = setTimeout(() => {
        sleepTimerId = null;
        sleepResolve = null;
        resolve();
      }, pressure.pollIntervalMs);
      if (typeof sleepTimerId.unref === 'function') {
        sleepTimerId.unref();
      }
    });
  }

  async function sampleControlPlaneRebalancingPressure(observedAtMs, sample) {
    const snapshot = await fetchControlSnapshotFromCandidates(
      nodeClient,
      controlSnapshotCandidates,
      NODE_CLIENT_TRANSIENT_CONTEXT,
    );
    recordHeartbeatFreshnessSample(pressure, observedAtMs, snapshot);
    const inFlightReplicaOps = normalizeNonNegativeInteger(
      snapshot?.replicaOperations?.inFlightCount,
    );
    sample.inFlightReplicaOps = inFlightReplicaOps;
    pressure.maxReplicaOpsInFlight = Math.max(
      pressure.maxReplicaOpsInFlight,
      inFlightReplicaOps,
    );

    const leaderSignature = buildLeaderSignatureFromSnapshot(snapshot);
    if (
      lastLeaderSignature !== null &&
      leaderSignature !== lastLeaderSignature
    ) {
      leaderChangeAtMs.push(observedAtMs);
      pressure.totalLeaderChanges += ONE;
    }
    lastLeaderSignature = leaderSignature;

    const cooldownFloorMs = observedAtMs - pressure.cooldownMs;
    while (
      leaderChangeAtMs.length > ZERO &&
      leaderChangeAtMs[ZERO] < cooldownFloorMs
    ) {
      leaderChangeAtMs.shift();
    }
    const leaderChangesWithinCooldown = leaderChangeAtMs.length;
    sample.leaderChangesWithinCooldown = leaderChangesWithinCooldown;
    pressure.maxLeaderChangesWithinCooldown = Math.max(
      pressure.maxLeaderChangesWithinCooldown,
      leaderChangesWithinCooldown,
    );
    checkAndApplyRebalancingPinningViolation(
      pressure,
      inFlightReplicaOps,
      leaderChangesWithinCooldown,
      loadRun,
    );
  }

  const monitorLoop = (async () => {
    while (!stopRequested) {
      const observedAtMs = Date.now();
      const sample = {
        observedAtMs,
        inFlightReplicaOps: ZERO,
        leaderChangesWithinCooldown: ZERO,
        routingAdmissionBlockedCount: ZERO,
        routingAdmissionBlockedNodeIds: [],
        routingAdmissionGraceNodeIds: [],
      };
      try {
        await sampleControlPlaneRebalancingPressure(observedAtMs, sample);
      } catch (error) {
        pressure.snapshotErrors.push(String(error?.message || error));
        sample.error = String(error?.message || error);
      }
      await sampleRoutingAdmissionAcrossLoadNodes({
        nodeClient,
        routingSnapshotCandidates,
        routingAdmissionContext,
        loadNodes,
        pressure,
        observedAtMs,
        options,
        sample,
      });

      pressure.samples.push(sample);
      pressure.sampleCount = pressure.samples.length;
      if (stopRequested) {
        break;
      }
      await waitForNextPoll();
    }
  })();

  return {
    assertLoadNodeAdmitted(nodeId) {
      const normalizedNodeId =
        typeof nodeId === 'string' && nodeId.length > ZERO ?
          nodeId :
          DISCOVERY_UNKNOWN_NODE_ID;
      const state =
        pressure.routingAdmission?.stateByNodeId?.[normalizedNodeId];
      if (!state || state.ready === true) {
        return;
      }
      throw buildRoutingAdmissionBlockedError(normalizedNodeId, state.reasons);
    },
    async stop() {
      stopRequested = true;
      if (sleepTimerId !== null) {
        clearTimeout(sleepTimerId);
        sleepTimerId = null;
      }
      if (typeof sleepResolve === 'function') {
        const resolveSleep = sleepResolve;
        sleepResolve = null;
        resolveSleep();
      }
      await monitorLoop;
      pressure.endedAtMs = Date.now();
      pressure.sampleCount = pressure.samples.length;
      finalizeHeartbeatFreshnessState(pressure);
      return pressure;
    },
  };
}

function isCriticalRebalancingSample(sample = {}, pressure = {}) {
  const inFlightReplicaOps = normalizeNonNegativeInteger(
    sample.inFlightReplicaOps,
  );
  const leaderChangesWithinCooldown = normalizeNonNegativeInteger(
    sample.leaderChangesWithinCooldown,
  );
  const maxReplicaOpsInFlightLimit = normalizeNonNegativeInteger(
    pressure.maxReplicaOpsInFlightLimit,
  );
  const minLeaderChangeDelta =
    Number.isInteger(pressure.minLeaderChangeDelta) &&
    pressure.minLeaderChangeDelta > ZERO ?
      pressure.minLeaderChangeDelta :
      BENCHMARK_REBALANCE_HYSTERESIS_MIN_DELTA_DEFAULT;
  return (
    inFlightReplicaOps > maxReplicaOpsInFlightLimit &&
    leaderChangesWithinCooldown >= minLeaderChangeDelta
  );
}

function buildCriticalRebalancingSignalMessage(criticalState) {
  return (
    'Critical rebalancing state detected: episodes=' +
    String(criticalState.sustainedEpisodeCount) +
    ',max_streak=' +
    String(criticalState.maxConsecutiveCriticalSamples) +
    ',threshold=' +
    String(criticalState.sustainedSampleThreshold)
  );
}

function resolveSustainedSampleThreshold(benchmarkConfig) {
  return Number.isInteger(benchmarkConfig?.criticalRebalancingSustainedSamples) &&
    benchmarkConfig.criticalRebalancingSustainedSamples > ZERO ?
    benchmarkConfig.criticalRebalancingSustainedSamples :
    BENCHMARK_CRITICAL_REBALANCING_SUSTAINED_SAMPLES_DEFAULT;
}

function countCriticalRebalancingStreaks(
  samples,
  pressure,
  sustainedSampleThreshold,
) {
  let criticalSampleCount = ZERO;
  let maxConsecutiveCriticalSamples = ZERO;
  let consecutiveCriticalSamples = ZERO;
  let sustainedEpisodeCount = ZERO;
  for (const sample of samples) {
    if (isCriticalRebalancingSample(sample, pressure)) {
      criticalSampleCount += ONE;
      consecutiveCriticalSamples += ONE;
      maxConsecutiveCriticalSamples = Math.max(
        maxConsecutiveCriticalSamples,
        consecutiveCriticalSamples,
      );
      continue;
    }
    if (consecutiveCriticalSamples >= sustainedSampleThreshold) {
      sustainedEpisodeCount += ONE;
    }
    consecutiveCriticalSamples = ZERO;
  }
  if (consecutiveCriticalSamples >= sustainedSampleThreshold) {
    sustainedEpisodeCount += ONE;
  }
  return {
    criticalSampleCount,
    maxConsecutiveCriticalSamples,
    sustainedEpisodeCount,
  };
}

function buildRebalancingCriticalState(
  rebalancingPressure,
  benchmarkConfig = {},
) {
  const pressure =
    rebalancingPressure && typeof rebalancingPressure === 'object' ?
      rebalancingPressure :
      {};
  const samples = Array.isArray(pressure.samples) ? pressure.samples : [];
  const sustainedSampleThreshold =
    resolveSustainedSampleThreshold(benchmarkConfig);
  const {
    criticalSampleCount,
    maxConsecutiveCriticalSamples,
    sustainedEpisodeCount,
  } = countCriticalRebalancingStreaks(
    samples,
    pressure,
    sustainedSampleThreshold,
  );
  const sustained = sustainedEpisodeCount > ZERO;
  const criticalState = {
    schemaVersion: REBALANCING_CRITICAL_STATE_SCHEMA_VERSION,
    sampleCount: samples.length,
    sustainedSampleThreshold,
    criticalSampleCount,
    maxConsecutiveCriticalSamples,
    sustainedEpisodeCount,
    sustained,
    bypassed: pressure?.pinning?.bypassed === true,
    messages: [],
  };
  if (sustained) {
    criticalState.messages.push(
      buildCriticalRebalancingSignalMessage(criticalState),
    );
  }
  return criticalState;
}

export const POSTGRES_BASELINE_COMPARISON_ROUTING_ADMISSION_AND_REBALANCING_BUNDLE = {
  ...POSTGRES_BASELINE_COMPARISON_BASELINE_CACHE_AND_POLICY_BUNDLE,
  updateRoutingAdmissionNodeState,
  buildRoutingAdmissionContext,
  buildRoutingAdmissionBlockedError,
  buildLoadRebalancingPressureState,
  createHeartbeatFreshnessState,
  normalizeControlSnapshotNodeLiveness,
  recordHeartbeatFreshnessSample,
  finalizeHeartbeatFreshnessState,
  formatHeartbeatFreshnessFailures,
  formatLoadRebalancingPinningReasons,
  startLoadRebalancingPressureMonitor,
  isCriticalRebalancingSample,
  buildCriticalRebalancingSignalMessage,
  buildRebalancingCriticalState,
};
