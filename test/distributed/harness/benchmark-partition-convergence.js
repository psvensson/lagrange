const ZERO = 0;
const BENCHMARK_LOAD_ADMISSION_REASON_RECOVERY_GATE_CLOSED =
  'recovery_gate_closed';
const BENCHMARK_LOAD_ADMISSION_REASON_PUBLICATION_EPOCH_MISMATCH =
  'publication_epoch_mismatch';
const BENCHMARK_LOAD_ADMISSION_REASON_LOAD_LANE_DENIED =
  'load_lane_denied';
const BENCHMARK_LOAD_ADMISSION_REASON_DISCOVERY_PRESSURED =
  'discovery_pressured';

const BENCHMARK_LOAD_ADMISSION_STATE_LOCAL_READY = 'local_ready';
const BENCHMARK_LOAD_ADMISSION_STATE_ROUTED_READY = 'routed_ready';
const BENCHMARK_LOAD_ADMISSION_STATE_LOCAL_BLOCKED = 'local_blocked';
const BENCHMARK_LOAD_ADMISSION_STATE_DISCOVERY_PRESSURED =
  'discovery_pressured';
const BENCHMARK_LOAD_ADMISSION_STATE_GATE_BLOCKED = 'gate_blocked';
const BENCHMARK_LOAD_ADMISSION_STATE_UNAVAILABLE = 'unavailable';

const BENCHMARK_LOAD_ADMISSION_STATE = Object.freeze({
  LOCAL_READY: BENCHMARK_LOAD_ADMISSION_STATE_LOCAL_READY,
  ROUTED_READY: BENCHMARK_LOAD_ADMISSION_STATE_ROUTED_READY,
  LOCAL_BLOCKED: BENCHMARK_LOAD_ADMISSION_STATE_LOCAL_BLOCKED,
  DISCOVERY_PRESSURED: BENCHMARK_LOAD_ADMISSION_STATE_DISCOVERY_PRESSURED,
  GATE_BLOCKED: BENCHMARK_LOAD_ADMISSION_STATE_GATE_BLOCKED,
  UNAVAILABLE: BENCHMARK_LOAD_ADMISSION_STATE_UNAVAILABLE,
});

const BENCHMARK_PARTITION_CONVERGENCE_STATE_READY_REPLICA = 'ready_replica';
const BENCHMARK_PARTITION_CONVERGENCE_STATE_REPLICA_BLOCKED =
  'replica_blocked';
const BENCHMARK_PARTITION_CONVERGENCE_STATE_ROUTED_ADMISSION_ONLY =
  'routed_admission_only';
const BENCHMARK_PARTITION_CONVERGENCE_STATE_ABSENT = 'absent';

const BENCHMARK_PARTITION_CONVERGENCE_STATE = Object.freeze({
  READY_REPLICA: BENCHMARK_PARTITION_CONVERGENCE_STATE_READY_REPLICA,
  REPLICA_BLOCKED: BENCHMARK_PARTITION_CONVERGENCE_STATE_REPLICA_BLOCKED,
  ROUTED_ADMISSION_ONLY:
    BENCHMARK_PARTITION_CONVERGENCE_STATE_ROUTED_ADMISSION_ONLY,
  ABSENT: BENCHMARK_PARTITION_CONVERGENCE_STATE_ABSENT,
});

const BENCHMARK_PARTITION_DISPATCH_MODE_LOCAL_READY_ONLY =
  'local_ready_only';
const BENCHMARK_PARTITION_DISPATCH_MODE_BOOTSTRAP_BACKFILL_REQUIRED =
  'bootstrap_backfill_required';

const BENCHMARK_PARTITION_DISPATCH_MODE = Object.freeze({
  LOCAL_READY_ONLY: BENCHMARK_PARTITION_DISPATCH_MODE_LOCAL_READY_ONLY,
  BOOTSTRAP_BACKFILL_REQUIRED:
    BENCHMARK_PARTITION_DISPATCH_MODE_BOOTSTRAP_BACKFILL_REQUIRED,
});

const BENCHMARK_DISPATCH_CONTRIBUTION_STATE_LOCAL_PRIMARY =
  'local_primary';
const BENCHMARK_DISPATCH_CONTRIBUTION_STATE_LOCAL_BLOCKED =
  'local_blocked';
const BENCHMARK_DISPATCH_CONTRIBUTION_STATE_ROUTED_SUPPORT =
  'routed_support';
const BENCHMARK_DISPATCH_CONTRIBUTION_STATE_NONE = 'none';

const BENCHMARK_DISPATCH_CONTRIBUTION_STATE = Object.freeze({
  LOCAL_PRIMARY: BENCHMARK_DISPATCH_CONTRIBUTION_STATE_LOCAL_PRIMARY,
  LOCAL_BLOCKED: BENCHMARK_DISPATCH_CONTRIBUTION_STATE_LOCAL_BLOCKED,
  ROUTED_SUPPORT: BENCHMARK_DISPATCH_CONTRIBUTION_STATE_ROUTED_SUPPORT,
  NONE: BENCHMARK_DISPATCH_CONTRIBUTION_STATE_NONE,
});

const BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE_READY = 'ready';
const BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE_PENDING = 'pending';
const BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE_UNAVAILABLE =
  'unavailable';
const BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_SNAPSHOT_UNAVAILABLE =
  'critical_control_snapshot_unavailable';
const BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_OWNER_BACKPRESSURED =
  'critical_control_owner_backpressured';
const BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_PENDING_WRITE_GROWTH =
  'critical_control_pending_write_growth';
const BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_RETAINED_BACKLOG_GROWTH =
  'critical_control_retained_backlog_growth';
const BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_REPLAY_BUFFER_GROWTH =
  'critical_control_replay_buffer_growth';
const BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_REPLAY_RETRY_DEPTH =
  'critical_control_replay_retry_depth';

const BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE = Object.freeze({
  READY: BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE_READY,
  PENDING: BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE_PENDING,
  UNAVAILABLE: BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE_UNAVAILABLE,
});

const BENCHMARK_DEGRADATION_STATE_HEALTHY = 'healthy';
const BENCHMARK_DEGRADATION_STATE_UNKNOWN = 'unknown';

const BENCHMARK_DEGRADATION_STATE = Object.freeze({
  HEALTHY: BENCHMARK_DEGRADATION_STATE_HEALTHY,
  UNKNOWN: BENCHMARK_DEGRADATION_STATE_UNKNOWN,
});

const BENCHMARK_LOCAL_REPLICA_ROLE_UNKNOWN = 'unknown';
const BENCHMARK_CONVERGENCE_EVALUATION_SUMMARY_FIELDS = Object.freeze([
  'nodeId',
  'state',
  'dispatchContributionState',
  'replicaBearing',
  'localReplicaSeen',
  'localAdmissionReady',
  'admissionReady',
  'routingReady',
  'schemaReady',
  'topologyReady',
  'localReplicaRole',
  'localReplicaVoterReady',
  'leadershipStable',
  'degradationState',
  'degradedByOperationIds',
  'reasonCodes',
  'discoveryReasonCodes',
  'loadLaneReasonCodes',
  'retryAfterMs',
]);

function normalizePositiveInteger(value, fallback) {
  const normalizedValue = Number(value);
  if (!Number.isFinite(normalizedValue)) {
    return fallback;
  }
  const boundedValue = Math.floor(normalizedValue);
  return boundedValue > ZERO ? boundedValue : fallback;
}

function normalizeNodeId(node, fallbackNodeId) {
  const explicitNodeId = typeof fallbackNodeId === 'string' ?
    fallbackNodeId.trim() :
    '';
  if (explicitNodeId.length > ZERO) {
    return explicitNodeId;
  }
  return String(node?.id || '').trim();
}

function normalizeReasonCodes(reasonCodes) {
  return Array.isArray(reasonCodes) ?
    [...new Set(reasonCodes
      .map((reasonCode) => String(reasonCode || '').trim())
      .filter((reasonCode) => reasonCode.length > ZERO))] :
    [];
}

function normalizeReasonDetails(reasonDetails) {
  const normalizedReasonDetails = [];
  const seenDetails = new Set();
  for (const reasonDetail of Array.isArray(reasonDetails) ? reasonDetails : []) {
    const code = typeof reasonDetail === 'string' ?
      reasonDetail.trim() :
      String(reasonDetail?.code || '').trim();
    if (code.length <= ZERO) {
      continue;
    }
    const detail = typeof reasonDetail === 'object' &&
      typeof reasonDetail?.detail === 'string' ?
      reasonDetail.detail.trim() :
      '';
    const dedupeKey = code + '::' + detail;
    if (seenDetails.has(dedupeKey)) {
      continue;
    }
    seenDetails.add(dedupeKey);
    normalizedReasonDetails.push({
      code,
      detail,
    });
  }
  return normalizedReasonDetails;
}

function normalizeReplicaOperationIds(operationIds) {
  return Array.isArray(operationIds) ?
    [...new Set(operationIds
      .map((operationId) => String(operationId || '').trim())
      .filter((operationId) => operationId.length > ZERO))] :
    [];
}

function normalizeNamedState(value, fallbackState) {
  const normalizedValue = String(value || '').trim();
  return normalizedValue.length > ZERO ? normalizedValue : fallbackState;
}

function buildHistogram(evaluations, valueResolver) {
  const histogram = {};
  for (const evaluation of Array.isArray(evaluations) ? evaluations : []) {
    const values = valueResolver(evaluation);
    for (const value of values) {
      histogram[value] = Number(histogram[value] || ZERO) + 1;
    }
  }
  return Object.keys(histogram).length > ZERO ? histogram : null;
}

function buildReasonCodeHistogram(evaluations) {
  return buildHistogram(
    evaluations,
    (evaluation) => normalizeReasonCodes(evaluation?.reasonCodes),
  );
}

function buildConvergenceStateHistogram(evaluations) {
  return buildHistogram(
    evaluations,
    (evaluation) => {
      const state = String(evaluation?.state || '').trim();
      return state.length > ZERO ? [state] : [];
    },
  );
}

function buildDispatchContributionHistogram(evaluations) {
  return buildHistogram(
    evaluations,
    (evaluation) => {
      const state = String(evaluation?.dispatchContributionState || '').trim();
      return state.length > ZERO ? [state] : [];
    },
  );
}

function buildBenchmarkCriticalControlPlaneStabilitySnapshot(options = {}) {
  const publicationConvergenceGate =
    options.publicationConvergenceGate &&
      typeof options.publicationConvergenceGate === 'object' ?
      options.publicationConvergenceGate :
      null;
  const ownerQueueDepth =
    options.controlPlaneOwnerQueueDepth &&
      typeof options.controlPlaneOwnerQueueDepth === 'object' ?
      {...options.controlPlaneOwnerQueueDepth} :
      null;
  const cdcReplayLag =
    options.cdcReplayLag && typeof options.cdcReplayLag === 'object' ?
      {...options.cdcReplayLag} :
      null;
  const reasonCodes = normalizeReasonCodes([
    ...(Array.isArray(publicationConvergenceGate?.reasons) ?
      publicationConvergenceGate.reasons :
      []),
    ...(Array.isArray(options.reasonCodes) ? options.reasonCodes : []),
    options.snapshotUnavailable === true ?
      BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_SNAPSHOT_UNAVAILABLE :
      '',
    ownerQueueDepth?.sharedPressureBackpressured === true ?
      BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_OWNER_BACKPRESSURED :
      '',
    Number(ownerQueueDepth?.pendingWriteGrowthCount) > ZERO ?
      BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_PENDING_WRITE_GROWTH :
      '',
    Number(ownerQueueDepth?.retainedBacklogGrowthCount) > ZERO ?
      BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_RETAINED_BACKLOG_GROWTH :
      '',
    Number(cdcReplayLag?.replayBufferGrowthCount) > ZERO ?
      BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_REPLAY_BUFFER_GROWTH :
      '',
    Number(cdcReplayLag?.replayRetryDepth) > 1 ?
      BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_REPLAY_RETRY_DEPTH :
      '',
  ]);
  const state = options.snapshotUnavailable === true ?
    BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE.UNAVAILABLE :
    (reasonCodes.length > ZERO ?
      BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE.PENDING :
      BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE.READY);
  return {
    state,
    reasonCodes,
    retryAfterMs: normalizePositiveInteger(options.retryAfterMs, ZERO),
    publicationStatus:
      typeof publicationConvergenceGate?.publicationStatus === 'string' ?
        publicationConvergenceGate.publicationStatus :
        null,
    recoveryProtocolState:
      typeof publicationConvergenceGate?.recoveryProtocolState === 'string' ?
        publicationConvergenceGate.recoveryProtocolState :
        null,
    pendingAckNodeIds: normalizeReasonCodes(
      publicationConvergenceGate?.pendingAckNodeIds,
    ),
    missingPublishedNodeIds: normalizeReasonCodes(
      publicationConvergenceGate?.missingPublishedNodeIds,
    ),
    missingRecoveryActiveNodeIds: normalizeReasonCodes(
      publicationConvergenceGate?.missingRecoveryActiveNodeIds,
    ),
    controlPlaneOwnerQueueDepth: ownerQueueDepth,
    cdcReplayLag,
    snapshotCoverageComplete: options.snapshotCoverageComplete === true,
    snapshotCoverageNodeCount: normalizePositiveInteger(
      options.snapshotCoverageNodeCount,
      ZERO,
    ),
    expectedNodeCount: normalizePositiveInteger(options.expectedNodeCount, ZERO),
    selectedNodeId:
      typeof options.selectedNodeId === 'string' &&
      options.selectedNodeId.length > ZERO ?
        options.selectedNodeId :
        null,
    controlPlaneDiagnosticsAvailable:
      options.controlPlaneDiagnosticsAvailable === true,
    selectedError:
      typeof options.selectedError === 'string' && options.selectedError.length > ZERO ?
        options.selectedError :
        null,
  };
}

function isBenchmarkCriticalControlPlaneStable(snapshot) {
  return snapshot?.state ===
    BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE.READY;
}

function buildDegradationStateHistogram(evaluations) {
  return buildHistogram(
    evaluations,
    (evaluation) => {
      const degradationState = String(evaluation?.degradationState || '').trim();
      return degradationState.length > ZERO ? [degradationState] : [];
    },
  );
}

function buildBenchmarkLoadAdmissionEvaluation(options = {}) {
  const node = options.node && typeof options.node === 'object' ?
    options.node :
    null;
  const nodeId = normalizeNodeId(node, options.nodeId);
  const discoveryReasonDetails = normalizeReasonDetails(
    options.discoveryReasonDetails,
  );
  const explicitDiscoveryReasonCodes = normalizeReasonCodes(
    options.discoveryReasonCodes,
  );
  const discoveryReasonCodes = explicitDiscoveryReasonCodes.length > ZERO ?
    explicitDiscoveryReasonCodes :
    discoveryReasonDetails.map((reasonDetail) => reasonDetail.code);
  const loadLaneReasonCodes = normalizeReasonCodes(options.loadLaneReasonCodes);
  const explicitReasonCodes = normalizeReasonCodes(options.reasonCodes);
  const fallbackReasonCodes = normalizeReasonCodes([
    ...discoveryReasonCodes,
    ...loadLaneReasonCodes,
    options.discoveryPressured === true ?
      BENCHMARK_LOAD_ADMISSION_REASON_DISCOVERY_PRESSURED :
      '',
  ]);
  const combinedReasonCodes = explicitReasonCodes.length > ZERO ?
    explicitReasonCodes :
    fallbackReasonCodes;
  return {
    node,
    nodeId,
    localReplicaSeen: options.localReplicaSeen === true,
    localAdmissionReady: options.localAdmissionReady === true,
    admissionReady: options.admissionReady === true,
    admissionCheckEligible: options.admissionCheckEligible === true,
    discoveryPressured: options.discoveryPressured === true,
    routingReady: options.routingReady === true,
    schemaReady: options.schemaReady === true,
    topologyReady: options.topologyReady === true,
    localReplicaRole: normalizeNamedState(
      options.localReplicaRole,
      BENCHMARK_LOCAL_REPLICA_ROLE_UNKNOWN,
    ),
    localReplicaVoterReady: options.localReplicaVoterReady === true,
    leadershipStable: options.leadershipStable === true,
    degradationState: normalizeNamedState(
      options.degradationState,
      BENCHMARK_DEGRADATION_STATE.UNKNOWN,
    ),
    degradedByOperationIds: normalizeReplicaOperationIds(
      options.degradedByOperationIds,
    ),
    discoveryReasonDetails,
    discoveryReasonCodes,
    loadLaneReasonCodes,
    retryAfterMs: normalizePositiveInteger(options.retryAfterMs, ZERO),
    reasonCodes: combinedReasonCodes,
    state: BENCHMARK_LOAD_ADMISSION_STATE.UNAVAILABLE,
  };
}

function resolveBenchmarkLoadAdmissionState(evaluation) {
  if (evaluation?.admissionReady === true &&
      evaluation?.localAdmissionReady === true) {
    return BENCHMARK_LOAD_ADMISSION_STATE.LOCAL_READY;
  }
  if (evaluation?.admissionReady === true) {
    return BENCHMARK_LOAD_ADMISSION_STATE.ROUTED_READY;
  }
  if (evaluation?.admissionCheckEligible !== true) {
    return BENCHMARK_LOAD_ADMISSION_STATE.GATE_BLOCKED;
  }
  if (evaluation?.localReplicaSeen === true) {
    return BENCHMARK_LOAD_ADMISSION_STATE.LOCAL_BLOCKED;
  }
  if (evaluation?.discoveryPressured === true) {
    return BENCHMARK_LOAD_ADMISSION_STATE.DISCOVERY_PRESSURED;
  }
  return BENCHMARK_LOAD_ADMISSION_STATE.UNAVAILABLE;
}

function buildBenchmarkLoadAdmissionSnapshot(options = {}) {
  const criticalControlPlaneStability =
    options.criticalControlPlaneStability &&
      typeof options.criticalControlPlaneStability === 'object' ?
      options.criticalControlPlaneStability :
      buildBenchmarkCriticalControlPlaneStabilitySnapshot();
  const normalizedEvaluations = (Array.isArray(options.evaluations) ?
    options.evaluations :
    []).map((evaluation) => {
    const normalizedEvaluation =
      buildBenchmarkLoadAdmissionEvaluation(evaluation);
    return {
      ...normalizedEvaluation,
      state: resolveBenchmarkLoadAdmissionState(normalizedEvaluation),
    };
  });
  const admissionReadyEvaluations = normalizedEvaluations
    .filter((evaluation) => evaluation.admissionReady === true);
  const localReadyEvaluations = normalizedEvaluations
    .filter((evaluation) =>
      evaluation.state === BENCHMARK_LOAD_ADMISSION_STATE.LOCAL_READY,
    );
  const blockedEvaluations = normalizedEvaluations
    .filter((evaluation) =>
      evaluation.state !== BENCHMARK_LOAD_ADMISSION_STATE.LOCAL_READY &&
      evaluation.state !== BENCHMARK_LOAD_ADMISSION_STATE.ROUTED_READY &&
      evaluation.reasonCodes.length > ZERO,
    );
  return {
    criticalControlPlaneStability,
    evaluations: normalizedEvaluations,
    admissionReadyNodes: admissionReadyEvaluations
      .map((evaluation) => evaluation.node)
      .filter((node) => node && typeof node === 'object'),
    admissionReadyNodeIds: admissionReadyEvaluations
      .map((evaluation) => evaluation.nodeId)
      .filter((nodeId) => nodeId.length > ZERO),
    localReadyNodes: localReadyEvaluations
      .map((evaluation) => evaluation.node)
      .filter((node) => node && typeof node === 'object'),
    localReadyNodeIds: localReadyEvaluations
      .map((evaluation) => evaluation.nodeId)
      .filter((nodeId) => nodeId.length > ZERO),
    degradationStateHistogram: buildDegradationStateHistogram(
      normalizedEvaluations,
    ),
    readinessReasonHistogram: buildReasonCodeHistogram(blockedEvaluations),
  };
}

function resolveBenchmarkPartitionConvergenceState(evaluation) {
  if (evaluation?.replicaBearing === true &&
      evaluation?.localAdmissionReady === true) {
    return BENCHMARK_PARTITION_CONVERGENCE_STATE.READY_REPLICA;
  }
  if (evaluation?.replicaBearing === true) {
    return BENCHMARK_PARTITION_CONVERGENCE_STATE.REPLICA_BLOCKED;
  }
  if (evaluation?.admissionReady === true) {
    return BENCHMARK_PARTITION_CONVERGENCE_STATE.ROUTED_ADMISSION_ONLY;
  }
  return BENCHMARK_PARTITION_CONVERGENCE_STATE.ABSENT;
}

function resolveBenchmarkDispatchContributionState(evaluation) {
  if (evaluation?.state ===
      BENCHMARK_PARTITION_CONVERGENCE_STATE.READY_REPLICA) {
    return BENCHMARK_DISPATCH_CONTRIBUTION_STATE.LOCAL_PRIMARY;
  }
  if (evaluation?.state ===
      BENCHMARK_PARTITION_CONVERGENCE_STATE.REPLICA_BLOCKED) {
    return BENCHMARK_DISPATCH_CONTRIBUTION_STATE.LOCAL_BLOCKED;
  }
  if (evaluation?.state ===
      BENCHMARK_PARTITION_CONVERGENCE_STATE.ROUTED_ADMISSION_ONLY) {
    return BENCHMARK_DISPATCH_CONTRIBUTION_STATE.ROUTED_SUPPORT;
  }
  return BENCHMARK_DISPATCH_CONTRIBUTION_STATE.NONE;
}

function buildBenchmarkPartitionConvergenceSnapshot(options = {}) {
  const admissionSnapshot = options.admissionSnapshot &&
    typeof options.admissionSnapshot === 'object' ?
      options.admissionSnapshot :
      buildBenchmarkLoadAdmissionSnapshot();
  const criticalControlPlaneStability =
    options.criticalControlPlaneStability &&
      typeof options.criticalControlPlaneStability === 'object' ?
      options.criticalControlPlaneStability :
      (
        admissionSnapshot?.criticalControlPlaneStability &&
          typeof admissionSnapshot.criticalControlPlaneStability === 'object' ?
          admissionSnapshot.criticalControlPlaneStability :
          buildBenchmarkCriticalControlPlaneStabilitySnapshot()
      );
  const replicaBearingNodeIds = new Set(
    (Array.isArray(options.replicaBearingNodeIds) ?
      options.replicaBearingNodeIds :
      [])
      .map((nodeId) => String(nodeId || '').trim())
      .filter((nodeId) => nodeId.length > ZERO),
  );
  const evaluations = (Array.isArray(admissionSnapshot.evaluations) ?
    admissionSnapshot.evaluations :
    []).map((evaluation) => {
    const nodeId = String(evaluation?.nodeId || '').trim();
    const discoveryReplicaBearing = evaluation?.localReplicaSeen === true;
    const replicaBearing = replicaBearingNodeIds.has(
      nodeId,
    ) || discoveryReplicaBearing;
    const convergenceEvaluation = {
      ...evaluation,
      replicaBearing,
    };
    const state = resolveBenchmarkPartitionConvergenceState(
      convergenceEvaluation,
    );
    return {
      ...convergenceEvaluation,
      state,
      dispatchContributionState: resolveBenchmarkDispatchContributionState({
        ...convergenceEvaluation,
        state,
      }),
    };
  });
  const readyReplicaEvaluations = evaluations
    .filter((evaluation) =>
      evaluation.state ===
        BENCHMARK_PARTITION_CONVERGENCE_STATE.READY_REPLICA,
    );
  const replicaBlockedEvaluations = evaluations
    .filter((evaluation) =>
      evaluation.state ===
        BENCHMARK_PARTITION_CONVERGENCE_STATE.REPLICA_BLOCKED,
    );
  const replicaBearingEvaluations = evaluations
    .filter((evaluation) => evaluation.replicaBearing === true);
  const admissionReadyEvaluations = evaluations
    .filter((evaluation) => evaluation.admissionReady === true);
  const localPrimaryEvaluations = evaluations
    .filter((evaluation) =>
      evaluation.dispatchContributionState ===
        BENCHMARK_DISPATCH_CONTRIBUTION_STATE.LOCAL_PRIMARY,
    );
  const routedSupportEvaluations = evaluations
    .filter((evaluation) =>
      evaluation.dispatchContributionState ===
        BENCHMARK_DISPATCH_CONTRIBUTION_STATE.ROUTED_SUPPORT,
    );
  return {
    criticalControlPlaneStability,
    evaluations,
    readyReplicaNodes: readyReplicaEvaluations
      .map((evaluation) => evaluation.node)
      .filter((node) => node && typeof node === 'object'),
    readyReplicaNodeIds: readyReplicaEvaluations
      .map((evaluation) => evaluation.nodeId)
      .filter((nodeId) => nodeId.length > ZERO),
    replicaBlockedNodes: replicaBlockedEvaluations
      .map((evaluation) => evaluation.node)
      .filter((node) => node && typeof node === 'object'),
    replicaBlockedNodeIds: replicaBlockedEvaluations
      .map((evaluation) => evaluation.nodeId)
      .filter((nodeId) => nodeId.length > ZERO),
    replicaBearingNodes: replicaBearingEvaluations
      .map((evaluation) => evaluation.node)
      .filter((node) => node && typeof node === 'object'),
    replicaBearingNodeIds: replicaBearingEvaluations
      .map((evaluation) => evaluation.nodeId)
      .filter((nodeId) => nodeId.length > ZERO),
    admissionReadyNodes: admissionReadyEvaluations
      .map((evaluation) => evaluation.node)
      .filter((node) => node && typeof node === 'object'),
    admissionReadyNodeIds: admissionReadyEvaluations
      .map((evaluation) => evaluation.nodeId)
      .filter((nodeId) => nodeId.length > ZERO),
    localPrimaryNodes: localPrimaryEvaluations
      .map((evaluation) => evaluation.node)
      .filter((node) => node && typeof node === 'object'),
    localPrimaryNodeIds: localPrimaryEvaluations
      .map((evaluation) => evaluation.nodeId)
      .filter((nodeId) => nodeId.length > ZERO),
    routedSupportNodes: routedSupportEvaluations
      .map((evaluation) => evaluation.node)
      .filter((node) => node && typeof node === 'object'),
    routedSupportNodeIds: routedSupportEvaluations
      .map((evaluation) => evaluation.nodeId)
      .filter((nodeId) => nodeId.length > ZERO),
    degradationStateHistogram: buildDegradationStateHistogram(evaluations),
    readinessReasonHistogram: buildReasonCodeHistogram(
      replicaBlockedEvaluations,
    ),
    convergenceStateHistogram: buildConvergenceStateHistogram(evaluations),
    dispatchContributionHistogram: buildDispatchContributionHistogram(
      evaluations,
    ),
  };
}

function buildBenchmarkConvergenceEvaluationSummary(evaluation) {
  const summary = {};
  for (const field of BENCHMARK_CONVERGENCE_EVALUATION_SUMMARY_FIELDS) {
    if (!Object.hasOwn(evaluation || {}, field)) {
      continue;
    }
    const value = evaluation[field];
    if (Array.isArray(value)) {
      summary[field] = [...value];
      continue;
    }
    summary[field] = value;
  }
  return summary;
}

function buildBenchmarkConvergenceEvaluationSummaries(snapshot) {
  return (Array.isArray(snapshot?.evaluations) ? snapshot.evaluations : [])
    .map((evaluation) => buildBenchmarkConvergenceEvaluationSummary(evaluation));
}

function resolveBenchmarkPartitionDispatchMode(options = {}) {
  const convergenceSnapshot = options.convergenceSnapshot &&
    typeof options.convergenceSnapshot === 'object' ?
      options.convergenceSnapshot :
      null;
  const criticalControlPlaneStability =
    options.criticalControlPlaneStability &&
      typeof options.criticalControlPlaneStability === 'object' ?
      options.criticalControlPlaneStability :
      (
        convergenceSnapshot?.criticalControlPlaneStability &&
          typeof convergenceSnapshot.criticalControlPlaneStability === 'object' ?
          convergenceSnapshot.criticalControlPlaneStability :
          buildBenchmarkCriticalControlPlaneStabilitySnapshot()
      );
  if (!isBenchmarkCriticalControlPlaneStable(criticalControlPlaneStability)) {
    return BENCHMARK_PARTITION_DISPATCH_MODE.BOOTSTRAP_BACKFILL_REQUIRED;
  }
  const localPrimaryNodeCount = convergenceSnapshot ?
    (Array.isArray(convergenceSnapshot.localPrimaryNodeIds) ?
      convergenceSnapshot.localPrimaryNodeIds.length :
      ZERO) :
    Math.max(
      ZERO,
      Math.floor(Number(options.localPrimaryNodeCount) || ZERO),
    );
  const readyReplicaNodeCount = convergenceSnapshot ?
    (Array.isArray(convergenceSnapshot.readyReplicaNodeIds) ?
      convergenceSnapshot.readyReplicaNodeIds.length :
      ZERO) :
    Math.max(
      ZERO,
      Math.floor(Number(options.readyReplicaNodeCount) || ZERO),
    );
  const bootstrapRequiredNodeCount = normalizePositiveInteger(
    options.bootstrapRequiredNodeCount,
    1,
  );
  const targetNodeCount = normalizePositiveInteger(
    options.targetNodeCount,
    bootstrapRequiredNodeCount,
  );
  const requiredLocalContributorCount = Math.max(
    bootstrapRequiredNodeCount,
    targetNodeCount,
  );
  const effectiveLocalPrimaryNodeCount = Math.max(
    localPrimaryNodeCount,
    readyReplicaNodeCount,
  );
  if (effectiveLocalPrimaryNodeCount >= requiredLocalContributorCount) {
    return BENCHMARK_PARTITION_DISPATCH_MODE.LOCAL_READY_ONLY;
  }
  return BENCHMARK_PARTITION_DISPATCH_MODE.BOOTSTRAP_BACKFILL_REQUIRED;
}

export {
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_OWNER_BACKPRESSURED,
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_PENDING_WRITE_GROWTH,
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_REPLAY_BUFFER_GROWTH,
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_REPLAY_RETRY_DEPTH,
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_RETAINED_BACKLOG_GROWTH,
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_SNAPSHOT_UNAVAILABLE,
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE,
  BENCHMARK_DEGRADATION_STATE,
  BENCHMARK_DISPATCH_CONTRIBUTION_STATE,
  BENCHMARK_LOAD_ADMISSION_REASON_DISCOVERY_PRESSURED,
  BENCHMARK_LOAD_ADMISSION_REASON_LOAD_LANE_DENIED,
  BENCHMARK_LOAD_ADMISSION_REASON_PUBLICATION_EPOCH_MISMATCH,
  BENCHMARK_LOAD_ADMISSION_REASON_RECOVERY_GATE_CLOSED,
  BENCHMARK_LOAD_ADMISSION_STATE,
  BENCHMARK_PARTITION_DISPATCH_MODE,
  BENCHMARK_PARTITION_CONVERGENCE_STATE,
  buildBenchmarkCriticalControlPlaneStabilitySnapshot,
  buildBenchmarkLoadAdmissionEvaluation,
  buildBenchmarkLoadAdmissionSnapshot,
  buildBenchmarkConvergenceEvaluationSummaries,
  buildBenchmarkConvergenceEvaluationSummary,
  buildBenchmarkPartitionConvergenceSnapshot,
  isBenchmarkCriticalControlPlaneStable,
  resolveBenchmarkDispatchContributionState,
  resolveBenchmarkPartitionDispatchMode,
  resolveBenchmarkLoadAdmissionState,
  resolveBenchmarkPartitionConvergenceState,
};
