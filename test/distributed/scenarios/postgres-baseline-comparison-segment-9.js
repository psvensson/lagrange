import { POSTGRES_BASELINE_COMPARISON_SEGMENT_8 } from "./postgres-baseline-comparison-segment-8.js";
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
} = POSTGRES_BASELINE_COMPARISON_SEGMENT_8;

function updateRoutingAdmissionNodeState(
  routingAdmission,
  nodeId,
  nextState = {},
) {
  if (!routingAdmission || !routingAdmission.stateByNodeId) {
    return;
  }
  const normalizedNodeId = String(nodeId || "").trim();
  if (normalizedNodeId.length === ZERO) {
    return;
  }
  if (!routingAdmission.admittedNodeIds.includes(normalizedNodeId)) {
    routingAdmission.admittedNodeIds.push(normalizedNodeId);
    routingAdmission.admittedNodeIds = uniqueSorted(
      routingAdmission.admittedNodeIds,
    );
  }

  const previousState =
    routingAdmission.stateByNodeId[normalizedNodeId] || null;
  const normalizedObservedAtMs = normalizeNonNegativeInteger(
    nextState.observedAtMs,
  );
  const normalizedReady = nextState.ready === true;
  const explicitLastReadyObservedAtMs = normalizeOptionalNonNegativeInteger(
    nextState.lastReadyObservedAtMs,
  );
  const normalizedState = {
    nodeId: normalizedNodeId,
    ready: normalizedReady,
    reasons: normalizeRoutingAdmissionReasons(nextState.reasons),
    source:
      typeof nextState.source === "string" && nextState.source.length > ZERO
        ? nextState.source
        : null,
    observedAtMs: normalizedObservedAtMs,
    lastReadyObservedAtMs: normalizedReady
      ? (explicitLastReadyObservedAtMs ?? normalizedObservedAtMs)
      : explicitLastReadyObservedAtMs,
    grace: normalizeRoutingAdmissionGrace(nextState.grace),
  };
  routingAdmission.stateByNodeId[normalizedNodeId] = normalizedState;

  const previousSignature = previousState
    ? JSON.stringify({
        ready: previousState.ready === true,
        reasons: normalizeRoutingAdmissionReasons(previousState.reasons),
        source:
          typeof previousState.source === "string" &&
          previousState.source.length > ZERO
            ? previousState.source
            : null,
        lastReadyObservedAtMs: normalizeOptionalNonNegativeInteger(
          previousState.lastReadyObservedAtMs,
        ),
        grace: normalizeRoutingAdmissionGrace(previousState.grace),
      })
    : null;
  const nextSignature = JSON.stringify({
    ready: normalizedState.ready,
    reasons: normalizedState.reasons,
    source: normalizedState.source,
    lastReadyObservedAtMs: normalizedState.lastReadyObservedAtMs,
    grace: normalizedState.grace,
  });
  if (previousSignature === nextSignature) {
    return;
  }

  routingAdmission.transitions.push({
    nodeId: normalizedNodeId,
    observedAtMs: normalizedState.observedAtMs,
    previous: previousState
      ? {
          ready: previousState.ready === true,
          reasons: normalizeRoutingAdmissionReasons(previousState.reasons),
          source:
            typeof previousState.source === "string" &&
            previousState.source.length > ZERO
              ? previousState.source
              : null,
          lastReadyObservedAtMs: normalizeOptionalNonNegativeInteger(
            previousState.lastReadyObservedAtMs,
          ),
          grace: normalizeRoutingAdmissionGrace(previousState.grace),
        }
      : null,
    next: {
      ready: normalizedState.ready,
      reasons: normalizedState.reasons,
      source: normalizedState.source,
      lastReadyObservedAtMs: normalizedState.lastReadyObservedAtMs,
      grace: normalizedState.grace,
    },
  });
  if (
    routingAdmission.transitions.length > LOAD_ROUTING_ADMISSION_MAX_TRANSITIONS
  ) {
    routingAdmission.transitions.shift();
  }
}

function buildRoutingAdmissionContext(tableName) {
  const normalizedTableName = normalizeTableName(tableName, "");
  return normalizedTableName.length > ZERO
    ? {
        ...NODE_CLIENT_TRANSIENT_CONTEXT,
        [NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME]: normalizedTableName,
      }
    : NODE_CLIENT_TRANSIENT_CONTEXT;
}

function buildRoutingAdmissionBlockedError(nodeId, reasons) {
  const normalizedNodeId = String(nodeId || DISCOVERY_UNKNOWN_NODE_ID);
  const normalizedReasons = normalizeRoutingAdmissionReasons(reasons);
  const error = new Error(
    LOAD_ROUTING_ADMISSION_ERROR_MESSAGE_PREFIX +
      ": node=" +
      normalizedNodeId +
      ", reasons=" +
      (normalizedReasons.length > ZERO
        ? normalizedReasons.join(LOAD_ROUTING_ADMISSION_REASON_SEPARATOR)
        : DISCOVERY_READINESS_REASON_ROUTING_NOT_READY),
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
    monitoredNodeIds: Array.isArray(options.monitoredNodeIds)
      ? [...options.monitoredNodeIds]
      : [],
    sampleCount: ZERO,
    maxReplicaOpsInFlight: ZERO,
    totalLeaderChanges: ZERO,
    maxLeaderChangesWithinCooldown: ZERO,
    cooldownMs: normalizeNonNegativeInteger(options.cooldownMs),
    minLeaderChangeDelta:
      Number.isInteger(options.minLeaderChangeDelta) &&
      options.minLeaderChangeDelta > ZERO
        ? options.minLeaderChangeDelta
        : BENCHMARK_REBALANCE_HYSTERESIS_MIN_DELTA_DEFAULT,
    pollIntervalMs:
      Number.isInteger(options.pollIntervalMs) && options.pollIntervalMs > ZERO
        ? options.pollIntervalMs
        : BENCHMARK_LOAD_REBALANCE_MONITOR_POLL_INTERVAL_MS_DEFAULT,
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
    monitoredNodeIds: Array.isArray(options.monitoredNodeIds)
      ? [...options.monitoredNodeIds]
      : [],
    maxStallMs:
      Number.isInteger(options.maxStallMs) && options.maxStallMs > ZERO
        ? options.maxStallMs
        : HEARTBEAT_FRESHNESS_MAX_STALL_MS_DEFAULT,
    minSamples:
      Number.isInteger(options.minSamples) && options.minSamples > ZERO
        ? options.minSamples
        : HEARTBEAT_FRESHNESS_MIN_SAMPLES_DEFAULT,
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
    nodeLivenessByNodeId && typeof nodeLivenessByNodeId === "object"
      ? nodeLivenessByNodeId[nodeId]
      : null;
  if (!nodeLiveness || typeof nodeLiveness !== "object") {
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
    readyLeaseExpiresAt: Number.isFinite(readyLeaseExpiresAt)
      ? readyLeaseExpiresAt
      : null,
    readyLeaseLagMs: Number.isFinite(readyLeaseLagMs) ? readyLeaseLagMs : null,
  };
}

function recordHeartbeatFreshnessSample(
  pressure,
  observedAtMs,
  snapshot = null,
) {
  const heartbeatFreshness = pressure?.heartbeatFreshness;
  if (!heartbeatFreshness || typeof heartbeatFreshness !== "object") {
    return;
  }
  const nodeLivenessByNodeId =
    snapshot?.controlPlaneDiagnostics?.nodeLivenessByNodeId &&
    typeof snapshot.controlPlaneDiagnostics.nodeLivenessByNodeId === "object"
      ? snapshot.controlPlaneDiagnostics.nodeLivenessByNodeId
      : null;
  if (!nodeLivenessByNodeId) {
    return;
  }

  heartbeatFreshness.sampleCount += ONE;
  for (const nodeId of heartbeatFreshness.monitoredNodeIds) {
    const nodeLiveness = normalizeControlSnapshotNodeLiveness(
      nodeLivenessByNodeId,
      nodeId,
    );
    const perNode = heartbeatFreshness.perNode[nodeId] || {
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
    if (!nodeLiveness) {
      heartbeatFreshness.perNode[nodeId] = perNode;
      continue;
    }

    perNode.sampleCount += ONE;
    perNode.firstObservedAtMs = Number.isFinite(perNode.firstObservedAtMs)
      ? perNode.firstObservedAtMs
      : observedAtMs;
    perNode.lastObservedAtMs = observedAtMs;
    if (Number.isFinite(nodeLiveness.heartbeatAgeMs)) {
      perNode.currentHeartbeatAgeMs = nodeLiveness.heartbeatAgeMs;
      perNode.maxHeartbeatAgeMs = Number.isFinite(perNode.maxHeartbeatAgeMs)
        ? Math.max(perNode.maxHeartbeatAgeMs, nodeLiveness.heartbeatAgeMs)
        : nodeLiveness.heartbeatAgeMs;
    }
    if (Number.isFinite(nodeLiveness.readyLeaseLagMs)) {
      perNode.currentReadyLeaseLagMs = nodeLiveness.readyLeaseLagMs;
      perNode.maxReadyLeaseLagMs = Number.isFinite(perNode.maxReadyLeaseLagMs)
        ? Math.max(perNode.maxReadyLeaseLagMs, nodeLiveness.readyLeaseLagMs)
        : nodeLiveness.readyLeaseLagMs;
    }
    if (Number.isFinite(nodeLiveness.lastHeartbeat)) {
      perNode.firstLastHeartbeat = Number.isFinite(perNode.firstLastHeartbeat)
        ? perNode.firstLastHeartbeat
        : nodeLiveness.lastHeartbeat;
      if (
        !Number.isFinite(perNode.lastLastHeartbeat) ||
        nodeLiveness.lastHeartbeat > perNode.lastLastHeartbeat
      ) {
        perNode.advanced =
          Number.isFinite(perNode.firstLastHeartbeat) &&
          nodeLiveness.lastHeartbeat > perNode.firstLastHeartbeat;
        perNode.lastLastHeartbeat = nodeLiveness.lastHeartbeat;
        perNode.lastAdvancedAtMs = observedAtMs;
      } else if (Number.isFinite(perNode.lastObservedAtMs)) {
        const stallAnchorMs = Number.isFinite(perNode.lastAdvancedAtMs)
          ? perNode.lastAdvancedAtMs
          : perNode.firstObservedAtMs;
        if (Number.isFinite(stallAnchorMs)) {
          perNode.maxStallDurationMs = Math.max(
            perNode.maxStallDurationMs,
            observedAtMs - stallAnchorMs,
          );
        }
      }
    }
    heartbeatFreshness.perNode[nodeId] = perNode;
  }
}

function finalizeHeartbeatFreshnessState(pressure) {
  const heartbeatFreshness = pressure?.heartbeatFreshness;
  if (!heartbeatFreshness || typeof heartbeatFreshness !== "object") {
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
    const failedReasons = [];
    if (perNode.advanced !== true) {
      failedReasons.push("heartbeat_not_advancing");
    }
    if (
      Number.isFinite(perNode.maxStallDurationMs) &&
      perNode.maxStallDurationMs > heartbeatFreshness.maxStallMs
    ) {
      failedReasons.push(
        "heartbeat_stalled:" + String(perNode.maxStallDurationMs),
      );
    }
    if (
      Number.isFinite(perNode.currentHeartbeatAgeMs) &&
      perNode.currentHeartbeatAgeMs > heartbeatFreshness.maxStallMs
    ) {
      failedReasons.push(
        "heartbeat_age_exceeded:" + String(perNode.currentHeartbeatAgeMs),
      );
    }
    perNode.failedReasons = failedReasons;
    if (failedReasons.length > ZERO) {
      stalledNodeIds.push(nodeId);
      messages.push(
        HEARTBEAT_FRESHNESS_INVARIANT_FAILED_REASON +
          ": node=" +
          nodeId +
          ", reasons=" +
          failedReasons.join("|"),
      );
    }
  }

  heartbeatFreshness.evaluatedNodeIds = evaluatedNodeIds;
  heartbeatFreshness.unavailableNodeIds = unavailableNodeIds;
  heartbeatFreshness.stalledNodeIds = stalledNodeIds;
  heartbeatFreshness.messages = messages;
  heartbeatFreshness.failed = stalledNodeIds.length > ZERO;
  heartbeatFreshness.status =
    stalledNodeIds.length > ZERO
      ? HEARTBEAT_FRESHNESS_STATUS_FAILED
      : evaluatedNodeIds.length > ZERO
        ? HEARTBEAT_FRESHNESS_STATUS_OK
        : HEARTBEAT_FRESHNESS_STATUS_UNAVAILABLE;
  return heartbeatFreshness;
}

function formatHeartbeatFreshnessFailures(heartbeatFreshness) {
  const stalledNodeIds = Array.isArray(heartbeatFreshness?.stalledNodeIds)
    ? heartbeatFreshness.stalledNodeIds
    : [];
  const parts = [];
  for (const nodeId of stalledNodeIds) {
    const failedReasons = Array.isArray(
      heartbeatFreshness?.perNode?.[nodeId]?.failedReasons,
    )
      ? heartbeatFreshness.perNode[nodeId].failedReasons
      : [];
    parts.push(
      "node=" +
        nodeId +
        ", reasons=" +
        (failedReasons.length > ZERO ? failedReasons.join("|") : "unknown"),
    );
  }
  return parts.join("; ");
}

function formatLoadRebalancingPinningReasons(reasons) {
  const normalizedReasons = Array.isArray(reasons)
    ? reasons.map((reason) => String(reason))
    : [];
  return normalizedReasons.length > ZERO
    ? normalizedReasons.join("|")
    : "unknown";
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
      .map((node) => String(node?.id || "").trim())
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
      if (typeof sleepTimerId.unref === "function") {
        sleepTimerId.unref();
      }
    });
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
        const snapshot = await fetchControlSnapshotFromCandidates(
          nodeClient,
          controlSnapshotCandidates,
          NODE_CLIENT_TRANSIENT_CONTEXT,
        );
        recordHeartbeatFreshnessSample(pressure, observedAtMs, snapshot);
        const replicaOperations = snapshot?.replicaOperations || {};
        const inFlightReplicaOps = normalizeNonNegativeInteger(
          replicaOperations?.inFlightCount,
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

        if (
          pressure.pinning.enabled &&
          !pressure.pinning.bypassed &&
          !pressure.pinning.violated
        ) {
          const violationReasons = [];
          if (inFlightReplicaOps > pressure.maxReplicaOpsInFlightLimit) {
            violationReasons.push(
              REBALANCING_PINNING_REASON_IN_FLIGHT_REPLICA_OPS +
                ":observed=" +
                String(inFlightReplicaOps) +
                ",limit=" +
                String(pressure.maxReplicaOpsInFlightLimit),
            );
          }
          if (leaderChangesWithinCooldown >= pressure.minLeaderChangeDelta) {
            violationReasons.push(
              REBALANCING_PINNING_REASON_LEADERSHIP_CHURN +
                ":observed=" +
                String(leaderChangesWithinCooldown) +
                ",min_delta=" +
                String(pressure.minLeaderChangeDelta) +
                ",cooldown_ms=" +
                String(pressure.cooldownMs),
            );
          }
          if (violationReasons.length > ZERO) {
            pressure.pinning.violated = true;
            for (const reason of violationReasons) {
              if (!pressure.pinning.violationReasons.includes(reason)) {
                pressure.pinning.violationReasons.push(reason);
              }
            }
            if (loadRun && typeof loadRun.cancel === "function") {
              pressure.pinning.cancelledLoad = true;
              loadRun.cancel();
            }
          }
        }
      } catch (error) {
        pressure.snapshotErrors.push(String(error?.message || error));
        sample.error = String(error?.message || error);
      }
      let routingDiscoverySnapshot = null;
      let routingDiscoveryError = null;
      try {
        routingDiscoverySnapshot = await fetchServiceDiscoveryFromCandidates(
          nodeClient,
          routingSnapshotCandidates,
          routingAdmissionContext,
        );
      } catch (error) {
        routingDiscoveryError = error;
      }
      const routingAdmission = pressure.routingAdmission;
      let blockedCount = ZERO;
      const blockedNodeIds = [];
      const graceNodeIds = [];
      const routingDiscoveryErrorMessage = routingDiscoveryError
        ? String(routingDiscoveryError?.message || routingDiscoveryError)
        : null;
      for (const node of loadNodes) {
        const nodeId =
          typeof node?.id === "string" && node.id.length > ZERO
            ? node.id
            : DISCOVERY_UNKNOWN_NODE_ID;
        try {
          if (!routingDiscoverySnapshot) {
            throw new Error(
              routingDiscoveryErrorMessage ||
                ROUTING_DISCOVERY_NO_SNAPSHOT_CANDIDATE,
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
          const reasons = ready
            ? []
            : Array.isArray(readiness?.reasons) &&
                readiness.reasons.length > ZERO
              ? readiness.reasons
              : [DISCOVERY_READINESS_REASON_ROUTING_NOT_READY];
          updateRoutingAdmissionNodeState(routingAdmission, nodeId, {
            ready,
            reasons,
            source: LOAD_ROUTING_ADMISSION_SOURCE_DISCOVERY,
            observedAtMs,
          });
          if (!ready) {
            blockedCount += ONE;
            blockedNodeIds.push(nodeId);
          }
        } catch (error) {
          const reason =
            LOAD_ROUTING_ADMISSION_REASON_PROBE_ERROR_PREFIX +
            truncateDiscoveryErrorMessage(String(error?.message || error));
          const previousState =
            routingAdmission.stateByNodeId?.[nodeId] || null;
          routingAdmission.probeErrors.push({
            nodeId,
            observedAtMs,
            error: String(error?.message || error),
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
          } else {
            updateRoutingAdmissionNodeState(routingAdmission, nodeId, {
              ready: false,
              reasons: [reason],
              source: LOAD_ROUTING_ADMISSION_SOURCE_PROBE_ERROR,
              observedAtMs,
              lastReadyObservedAtMs: null,
              grace: null,
            });
            blockedCount += ONE;
            blockedNodeIds.push(nodeId);
          }
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
        typeof nodeId === "string" && nodeId.length > ZERO
          ? nodeId
          : DISCOVERY_UNKNOWN_NODE_ID;
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
      if (typeof sleepResolve === "function") {
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
    pressure.minLeaderChangeDelta > ZERO
      ? pressure.minLeaderChangeDelta
      : BENCHMARK_REBALANCE_HYSTERESIS_MIN_DELTA_DEFAULT;
  return (
    inFlightReplicaOps > maxReplicaOpsInFlightLimit &&
    leaderChangesWithinCooldown >= minLeaderChangeDelta
  );
}

function buildCriticalRebalancingSignalMessage(criticalState) {
  return (
    "Critical rebalancing state detected: episodes=" +
    String(criticalState.sustainedEpisodeCount) +
    ",max_streak=" +
    String(criticalState.maxConsecutiveCriticalSamples) +
    ",threshold=" +
    String(criticalState.sustainedSampleThreshold)
  );
}

function buildRebalancingCriticalState(
  rebalancingPressure,
  benchmarkConfig = {},
) {
  const pressure =
    rebalancingPressure && typeof rebalancingPressure === "object"
      ? rebalancingPressure
      : {};
  const samples = Array.isArray(pressure.samples) ? pressure.samples : [];
  const sustainedSampleThreshold =
    Number.isInteger(benchmarkConfig.criticalRebalancingSustainedSamples) &&
    benchmarkConfig.criticalRebalancingSustainedSamples > ZERO
      ? benchmarkConfig.criticalRebalancingSustainedSamples
      : BENCHMARK_CRITICAL_REBALANCING_SUSTAINED_SAMPLES_DEFAULT;

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

export const POSTGRES_BASELINE_COMPARISON_SEGMENT_9 = {
  ...POSTGRES_BASELINE_COMPARISON_SEGMENT_8,
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
