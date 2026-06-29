import {
  EDGE_ID,
} from '../src/diagnostics/topology-convergence-constants.js';
import {
  buildTopologyConvergenceGraph,
  buildTopologyConvergenceGraphFromArtifacts,
} from '../src/diagnostics/topology-convergence-graph.js';

const SCHEMA_VERSION_ROLLING_RESTART_LIVENESS_VERDICT_V1 =
  'rolling-restart-liveness-verdict-v1';

const ABSENT_VALUE = 'absent';
const EMPTY_TEXT = '';
const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const NUM_ZERO = 0;
const NUM_ONE = 1;
const FIRST_INDEX = 0;
const SECOND_INDEX = 1;

const PROPERTY_FAILURE_BUNDLE = 'failureBundle';
const PROPERTY_REPORT = 'report';
const PROPERTY_SCENARIOS = 'scenarios';
const PROPERTY_TRIAGE_SUMMARY = 'triageSummary';
const PROPERTY_PUBLICATION_CONVERGENCE = 'publicationConvergence';
const PROPERTY_ACTIVE_GATE = 'activeGate';
const PROPERTY_PROGRESS = 'progress';
const PROPERTY_BEST_PROGRESS = 'bestProgress';
const PROPERTY_PRIORITY_RECOVERY_PROGRESS_SUMMARY =
  'priorityRecoveryProgressSummary';
const PROPERTY_PRIORITY_RECOVERY_PROGRESS_CLASSES =
  'priorityRecoveryProgressClasses';
const PROPERTY_ROLLING_RESTART_LIVENESS_EVIDENCE =
  'rollingRestartLivenessEvidence';
const PROPERTY_ROLLING_RESTART_LIVENESS_SAMPLES =
  'rollingRestartLivenessSamples';
const PROPERTY_SOURCE_ARTIFACT = 'sourceArtifact';
const PROPERTY_FULL_LOG_REPLAY = 'fullLogReplay';

const EVIDENCE_PATH_ARTIFACT = 'artifact';
const EVIDENCE_PATH_ACTIVE_GATE_PROGRESS =
  'report.scenarios[0].publicationConvergence.activeGate.progress';
const EVIDENCE_PATH_ACTIVE_GATE_BEST_PROGRESS =
  'report.scenarios[0].publicationConvergence.activeGate.bestProgress';
const EVIDENCE_PATH_LIVENESS_EVIDENCE =
  'rollingRestartLivenessEvidence.samples';
const EVIDENCE_PATH_PRIORITY_RECOVERY =
  'report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary';

const OWNER_STARTUP_ACTIVE_GATE = 'startup_active_gate_owner';
const OWNER_TOPOLOGY_PUBLICATION = 'topology_publication_owner';
const OWNER_OPERATION_WORKFLOW = 'operation_workflow_owner';
const BOUNDARY_PUBLICATION_VISIBILITY = 'publication_visibility';
const BOUNDARY_PUBLICATION_CONVERGENCE = 'publication_convergence';
const BOUNDARY_WORKFLOW_PROGRESS = 'workflow_progress';
const ACTION_RECONCILE_OWNER_MEMBERSHIP_PUBLICATION =
  'reconcile_owner_membership_publication';
const ACTION_WAIT_FOR_OPERATION_PROGRESS = 'wait_for_operation_progress';
const ACTION_ABSENT = ABSENT_VALUE;

const HANDOFF_OUTCOME_OWNER_RECONCILE_ENQUEUED =
  'owner_reconcile_enqueued';
const HANDOFF_REASON_OWNER_RECONCILE_PENDING = 'owner_reconcile_pending';
const HANDOFF_STATE_WRITE_DEFERRED = 'write_deferred';
const ACTION_EVENT_OWNER_RECONCILE_ENQUEUED = 'owner_reconcile_enqueued';
const ACTION_EVENT_RECONCILE_STARTED = 'reconcile_started';
const ACTION_EVENT_RECONCILE_COMPLETED = 'reconcile_completed';
const ACTION_EVENT_PUBLICATION_WRITTEN = 'publication_written';
const ACTION_STATE_EXECUTED = 'executed';

const WITNESS_STATE_OBSERVED = 'observed';
const QUEUE_STATE_OBSERVED = 'observed';
const QUEUE_STATE_ABSENT = ABSENT_VALUE;
const EVIDENCE_COMPLETENESS_COMPLETE = 'complete';
const EVIDENCE_COMPLETENESS_SPARSE = 'sparse';
const EVIDENCE_FULL_LOG_REPLAY_ABSENT = Object.freeze({
  state: ABSENT_VALUE,
  evidencePath: ABSENT_VALUE,
  filesScanned: NUM_ZERO,
  linesScanned: NUM_ZERO,
  decisionTraceCount: NUM_ZERO,
  matchedSampleCount: NUM_ZERO,
});
const EVIDENCE_GAP_FULL_OWNER_EXECUTION_TRACE =
  'full_owner_execution_trace';
const EVIDENCE_GAP_POST_ENQUEUE_PROGRESS_SAMPLES =
  'post_enqueue_progress_samples';
const EVIDENCE_GAP_PUBLICATION_READBACK_AFTER_RECONCILE =
  'publication_readback_after_reconcile';

const PROGRESS_WITNESS_ABSENT = Object.freeze({
  state: ABSENT_VALUE,
  kind: ABSENT_VALUE,
  evidencePath: ABSENT_VALUE,
  timestamp: ABSENT_VALUE,
  before: ABSENT_VALUE,
  after: ABSENT_VALUE,
});

const METRIC_RULES = Object.freeze([
  Object.freeze({
    field: 'ownerQueueDepth',
    kind: 'owner_queue_depth_decreased',
    decreasing: true,
  }),
  Object.freeze({
    field: 'inFlightDepth',
    kind: 'in_flight_depth_decreased',
    decreasing: true,
  }),
  Object.freeze({
    field: 'missingPublishedCount',
    kind: 'missing_published_shrank',
    decreasing: true,
  }),
  Object.freeze({
    field: 'cdcLag',
    kind: 'cdc_lag_decreased',
    decreasing: true,
  }),
  Object.freeze({
    field: 'publicationEpoch',
    kind: 'publication_epoch_changed',
    changing: true,
  }),
  Object.freeze({
    field: 'readbackEpoch',
    kind: 'publication_readback_changed',
    changing: true,
  }),
]);

const EXECUTION_PROGRESS_EVENTS = Object.freeze(new Set([
  ACTION_EVENT_RECONCILE_STARTED,
  ACTION_EVENT_RECONCILE_COMPLETED,
  ACTION_EVENT_PUBLICATION_WRITTEN,
]));

const ENABLED_ACTION_EVENTS = Object.freeze(new Set([
  ACTION_EVENT_OWNER_RECONCILE_ENQUEUED,
  HANDOFF_OUTCOME_OWNER_RECONCILE_ENQUEUED,
]));

const ROLLING_RESTART_LIVENESS_VERDICT = Object.freeze({
  OBSERVED_PROGRESSING_BUDGET_EXHAUSTED:
    'observed_progressing_budget_exhausted',
  STUCK_NO_ENABLED_ACTION: 'stuck_no_enabled_action',
  STUCK_ENABLED_ACTION_NOT_EXECUTED: 'stuck_enabled_action_not_executed',
  STUCK_EXECUTED_NO_VISIBILITY: 'stuck_executed_no_visibility',
  STUCK_DOWNSTREAM_WORKFLOW_PROGRESS: 'stuck_downstream_workflow_progress',
  INSUFFICIENT_EVIDENCE: 'insufficient_evidence',
});

const REQUIRED_VERDICTS = Object.freeze([
  ROLLING_RESTART_LIVENESS_VERDICT.OBSERVED_PROGRESSING_BUDGET_EXHAUSTED,
  ROLLING_RESTART_LIVENESS_VERDICT.STUCK_NO_ENABLED_ACTION,
  ROLLING_RESTART_LIVENESS_VERDICT.STUCK_ENABLED_ACTION_NOT_EXECUTED,
  ROLLING_RESTART_LIVENESS_VERDICT.STUCK_EXECUTED_NO_VISIBILITY,
  ROLLING_RESTART_LIVENESS_VERDICT.STUCK_DOWNSTREAM_WORKFLOW_PROGRESS,
  ROLLING_RESTART_LIVENESS_VERDICT.INSUFFICIENT_EVIDENCE,
]);

function buildRollingRestartLivenessVerdict(artifact = {}, options = {}) {
  const graph = buildGraphForArtifact(artifact);
  const scenario = selectScenario(artifact);
  const publication = selectPublicationConvergence(artifact, scenario);
  const progress = selectActiveGateProgress(publication);
  const bestProgress = selectActiveGateBestProgress(publication);
  const livenessEvidence = selectLivenessEvidence(artifact, scenario, publication);
  const samples = normalizeLivenessSamples(livenessEvidence.samples);
  const sourceArtifact = textValue(
    options[PROPERTY_SOURCE_ARTIFACT],
    artifact[PROPERTY_SOURCE_ARTIFACT],
    EVIDENCE_PATH_ARTIFACT,
  );
  const downstream = classifyDownstreamWorkflow({
    graph,
    publication,
    progress,
  });
  const actionEvidence = buildActionEvidence(progress, samples);
  const progressWitness = selectProgressWitness(samples, actionEvidence);
  const publicationDelta = buildPublicationDelta({
    samples,
    progress,
    bestProgress,
  });
  const queueState = buildQueueState(progress, samples);
  const executedWithoutVisibility = isExecutedWithoutVisibility({
    actionEvidence,
    progressWitness,
    publicationDelta,
  });
  const base = {
    schemaVersion: SCHEMA_VERSION_ROLLING_RESTART_LIVENESS_VERDICT_V1,
    scenario: textValue(scenario.scenario, graph.scenario, 'rolling-restart'),
    sourceArtifact,
    requiredVerdicts: REQUIRED_VERDICTS.slice(),
    topologyFrontier: buildTopologyFrontier(graph),
    queueState,
    publicationDelta,
    progressWitness,
    fullLogReplay: livenessEvidence.fullLogReplay,
  };

  if (downstream.blocked) {
    return finalizeVerdict(base, {
      verdict: ROLLING_RESTART_LIVENESS_VERDICT.STUCK_DOWNSTREAM_WORKFLOW_PROGRESS,
      owner: downstream.owner,
      boundary: downstream.boundary,
      enabledAction: downstream.enabledAction,
      lastProgressTimestamp: downstream.lastProgressTimestamp,
      evidencePath: downstream.evidencePath,
      evidenceGaps: [],
    });
  }

  if (progressWitness.state !== ABSENT_VALUE) {
    return finalizeVerdict(base, {
      verdict:
        ROLLING_RESTART_LIVENESS_VERDICT.OBSERVED_PROGRESSING_BUDGET_EXHAUSTED,
      owner: actionEvidence.owner,
      boundary: actionEvidence.boundary,
      enabledAction: actionEvidence.enabledAction,
      lastProgressTimestamp: progressWitness.timestamp,
      evidencePath: progressWitness.evidencePath,
      evidenceGaps: [],
    });
  }

  if (!actionEvidence.enabled) {
    return finalizeVerdict(base, {
      verdict: ROLLING_RESTART_LIVENESS_VERDICT.STUCK_NO_ENABLED_ACTION,
      owner: actionEvidence.owner,
      boundary: actionEvidence.boundary,
      enabledAction: ACTION_ABSENT,
      lastProgressTimestamp: ABSENT_VALUE,
      evidencePath: actionEvidence.evidencePath,
      evidenceGaps: [],
    });
  }

  if (executedWithoutVisibility) {
    return finalizeVerdict(base, {
      verdict: ROLLING_RESTART_LIVENESS_VERDICT.STUCK_EXECUTED_NO_VISIBILITY,
      owner: actionEvidence.owner,
      boundary: BOUNDARY_PUBLICATION_VISIBILITY,
      enabledAction: actionEvidence.enabledAction,
      lastProgressTimestamp: actionEvidence.executionTimestamp,
      evidencePath: actionEvidence.evidencePath,
      evidenceGaps: [],
    });
  }

  if (actionEvidence.enabled && livenessEvidence.complete) {
    return finalizeVerdict(base, {
      verdict:
        ROLLING_RESTART_LIVENESS_VERDICT.STUCK_ENABLED_ACTION_NOT_EXECUTED,
      owner: actionEvidence.owner,
      boundary: actionEvidence.boundary,
      enabledAction: actionEvidence.enabledAction,
      lastProgressTimestamp: ABSENT_VALUE,
      evidencePath: actionEvidence.evidencePath,
      evidenceGaps: [],
    });
  }

  return finalizeVerdict(base, {
    verdict: ROLLING_RESTART_LIVENESS_VERDICT.INSUFFICIENT_EVIDENCE,
    owner: actionEvidence.owner,
    boundary: actionEvidence.boundary,
    enabledAction: actionEvidence.enabledAction,
    lastProgressTimestamp: ABSENT_VALUE,
    evidencePath: actionEvidence.evidencePath,
    evidenceGaps: [
      EVIDENCE_GAP_FULL_OWNER_EXECUTION_TRACE,
      EVIDENCE_GAP_POST_ENQUEUE_PROGRESS_SAMPLES,
      EVIDENCE_GAP_PUBLICATION_READBACK_AFTER_RECONCILE,
    ],
  });
}

function buildGraphForArtifact(artifact) {
  if (
    isRecord(artifact[PROPERTY_FAILURE_BUNDLE]) ||
    isRecord(artifact[PROPERTY_TRIAGE_SUMMARY])
  ) {
    return buildTopologyConvergenceGraphFromArtifacts({
      failureBundle: artifact[PROPERTY_FAILURE_BUNDLE] || {},
      triageSummary: artifact[PROPERTY_TRIAGE_SUMMARY] || {},
      report: artifact[PROPERTY_REPORT] || artifact,
    });
  }
  return buildTopologyConvergenceGraph(artifact[PROPERTY_REPORT] || artifact);
}

function selectScenario(artifact) {
  const report = artifact[PROPERTY_REPORT] || artifact;
  const scenarios = Array.isArray(report[PROPERTY_SCENARIOS]) ?
    report[PROPERTY_SCENARIOS] :
    [];
  return isRecord(scenarios[FIRST_INDEX]) ? scenarios[FIRST_INDEX] : {};
}

function selectPublicationConvergence(artifact, scenario) {
  return firstRecord(
    scenario[PROPERTY_PUBLICATION_CONVERGENCE],
    artifact[PROPERTY_PUBLICATION_CONVERGENCE],
    artifact[PROPERTY_FAILURE_BUNDLE]?.[PROPERTY_PUBLICATION_CONVERGENCE],
    artifact[PROPERTY_TRIAGE_SUMMARY]?.[PROPERTY_PUBLICATION_CONVERGENCE],
  );
}

function selectActiveGateProgress(publication) {
  const activeGate = firstRecord(publication[PROPERTY_ACTIVE_GATE]);
  return firstRecord(
    activeGate[PROPERTY_PROGRESS],
    publication.activeGateProgress,
    publication[PROPERTY_PROGRESS],
  );
}

function selectActiveGateBestProgress(publication) {
  const activeGate = firstRecord(publication[PROPERTY_ACTIVE_GATE]);
  return firstRecord(activeGate[PROPERTY_BEST_PROGRESS]);
}

function selectLivenessEvidence(artifact, scenario, publication) {
  const evidence = firstRecord(
    artifact[PROPERTY_ROLLING_RESTART_LIVENESS_EVIDENCE],
    scenario[PROPERTY_ROLLING_RESTART_LIVENESS_EVIDENCE],
    publication[PROPERTY_ROLLING_RESTART_LIVENESS_EVIDENCE],
    publication[PROPERTY_ACTIVE_GATE]?.[PROPERTY_ROLLING_RESTART_LIVENESS_EVIDENCE],
  );
  const sampleList = firstArray(
    evidence.samples,
    artifact[PROPERTY_ROLLING_RESTART_LIVENESS_SAMPLES],
    scenario[PROPERTY_ROLLING_RESTART_LIVENESS_SAMPLES],
    publication[PROPERTY_ROLLING_RESTART_LIVENESS_SAMPLES],
    publication[PROPERTY_ACTIVE_GATE]?.[PROPERTY_ROLLING_RESTART_LIVENESS_SAMPLES],
  );
  const completeness = evidence.complete === true ||
    evidence.completeness === EVIDENCE_COMPLETENESS_COMPLETE;
  return {
    complete: completeness,
    completeness: completeness ?
      EVIDENCE_COMPLETENESS_COMPLETE :
      EVIDENCE_COMPLETENESS_SPARSE,
    samples: sampleList,
    fullLogReplay: firstRecord(
      evidence[PROPERTY_FULL_LOG_REPLAY],
      EVIDENCE_FULL_LOG_REPLAY_ABSENT,
    ),
  };
}

function normalizeLivenessSamples(samples) {
  return samples
    .filter(isRecord)
    .map((sample, index) => ({
      index,
      timestamp: normalizeTimestamp(sample.timestamp ?? sample.ts),
      event: textValue(sample.event, sample.action, sample.type),
      actionState: textValue(sample.actionState, sample.state),
      ownerQueueDepth: normalizeNumber(
        sample.ownerQueueDepth ??
        sample.queueDepth ??
        sample.pendingWrites,
      ),
      inFlightDepth: normalizeNumber(sample.inFlightDepth),
      missingPublishedCount: normalizeNumber(sample.missingPublishedCount),
      cdcLag: normalizeNumber(sample.cdcLag ?? sample.bufferedEvents),
      publicationEpoch: normalizeNumber(sample.publicationEpoch),
      readbackEpoch: normalizeNumber(sample.readbackEpoch),
      evidencePath: textValue(
        sample.evidencePath,
        `${EVIDENCE_PATH_LIVENESS_EVIDENCE}[${index}]`,
      ),
    }))
    .sort((left, right) => left.index - right.index);
}

function buildActionEvidence(progress, samples) {
  const sampleEvidence = selectSampleActionEvidence(samples);
  if (sampleEvidence.enabled) {
    return sampleEvidence;
  }
  const pendingReconcileCount = normalizeNumber(
    progress.publicationActiveGateHandoffPendingReconcileCount ??
    progress.activeGateOwnerCohortPendingReconcileCount,
  );
  const outcomeReason = textValue(
    progress.membershipPublicationHandoffOutcomeReasonCode,
  );
  const outcomeState = textValue(
    progress.membershipPublicationHandoffOutcomeState,
  );
  const enqueued = progress.membershipPublicationHandoffOutcomeEnqueued === true;
  const nextAction = textValue(
    progress.publicationActiveGateHandoffNextAction,
    pendingReconcileCount > NUM_ZERO ?
      ACTION_RECONCILE_OWNER_MEMBERSHIP_PUBLICATION :
      ACTION_ABSENT,
  );
  const enabled = enqueued ||
    pendingReconcileCount > NUM_ZERO ||
    outcomeReason === HANDOFF_OUTCOME_OWNER_RECONCILE_ENQUEUED ||
    outcomeReason === HANDOFF_REASON_OWNER_RECONCILE_PENDING ||
    outcomeState === HANDOFF_STATE_WRITE_DEFERRED;
  return {
    enabled,
    executed: false,
    owner: enabled ? OWNER_STARTUP_ACTIVE_GATE : OWNER_TOPOLOGY_PUBLICATION,
    boundary: enabled ?
      BOUNDARY_PUBLICATION_VISIBILITY :
      BOUNDARY_PUBLICATION_CONVERGENCE,
    enabledAction: enabled ? nextAction : ACTION_ABSENT,
    enabledTimestamp: ABSENT_VALUE,
    executionTimestamp: ABSENT_VALUE,
    evidencePath: EVIDENCE_PATH_ACTIVE_GATE_PROGRESS,
  };
}

function selectSampleActionEvidence(samples) {
  let enabledSample = EMPTY_TEXT;
  let executionSample = EMPTY_TEXT;
  for (const sample of samples) {
    if (!isRecord(enabledSample) && isEnabledActionSample(sample)) {
      enabledSample = sample;
    }
    if (isExecutedActionSample(sample)) {
      executionSample = sample;
    }
  }
  const enabled = isRecord(enabledSample);
  const executed = isRecord(executionSample);
  return {
    enabled,
    executed,
    owner: OWNER_STARTUP_ACTIVE_GATE,
    boundary: BOUNDARY_PUBLICATION_VISIBILITY,
    enabledAction: enabled ?
      ACTION_RECONCILE_OWNER_MEMBERSHIP_PUBLICATION :
      ACTION_ABSENT,
    enabledTimestamp: enabled ? enabledSample.timestamp : ABSENT_VALUE,
    executionTimestamp: executed ? executionSample.timestamp : ABSENT_VALUE,
    evidencePath: enabled ?
      enabledSample.evidencePath :
      EVIDENCE_PATH_LIVENESS_EVIDENCE,
  };
}

function isEnabledActionSample(sample) {
  return ENABLED_ACTION_EVENTS.has(sample.event) ||
    sample.actionState === HANDOFF_OUTCOME_OWNER_RECONCILE_ENQUEUED ||
    sample.actionState === HANDOFF_REASON_OWNER_RECONCILE_PENDING;
}

function isExecutedActionSample(sample) {
  return EXECUTION_PROGRESS_EVENTS.has(sample.event) ||
    sample.actionState === ACTION_STATE_EXECUTED;
}

function selectProgressWitness(samples, actionEvidence) {
  if (!actionEvidence.enabled || samples.length < SECOND_INDEX) {
    return PROGRESS_WITNESS_ABSENT;
  }
  const enabledIndex = selectEnabledActionIndex(samples, actionEvidence);
  for (let index = enabledIndex + NUM_ONE; index < samples.length; index += NUM_ONE) {
    const eventWitness = buildExecutionProgressWitness(samples[index]);
    if (eventWitness.state !== ABSENT_VALUE) {
      return eventWitness;
    }
    const metricWitness = compareProgressSamples(
      samples[index - NUM_ONE],
      samples[index],
    );
    if (metricWitness.state !== ABSENT_VALUE) {
      return metricWitness;
    }
  }
  return PROGRESS_WITNESS_ABSENT;
}

function selectEnabledActionIndex(samples, actionEvidence) {
  const directIndex = samples.findIndex(isEnabledActionSample);
  if (directIndex >= NUM_ZERO) {
    return directIndex;
  }
  if (actionEvidence.enabledTimestamp === ABSENT_VALUE) {
    return FIRST_INDEX;
  }
  const timestampIndex = samples.findIndex(
    (sample) => sample.timestamp === actionEvidence.enabledTimestamp,
  );
  return timestampIndex >= NUM_ZERO ? timestampIndex : FIRST_INDEX;
}

function buildExecutionProgressWitness(sample) {
  if (!EXECUTION_PROGRESS_EVENTS.has(sample.event)) {
    return PROGRESS_WITNESS_ABSENT;
  }
  return {
    state: WITNESS_STATE_OBSERVED,
    kind: sample.event,
    evidencePath: sample.evidencePath,
    timestamp: sample.timestamp,
    before: ABSENT_VALUE,
    after: sample.event,
  };
}

function compareProgressSamples(previous, current) {
  for (const rule of METRIC_RULES) {
    const before = previous[rule.field];
    const after = current[rule.field];
    if (!Number.isFinite(before) || !Number.isFinite(after)) {
      continue;
    }
    const moved = rule.decreasing ? after < before : after !== before;
    if (moved) {
      return {
        state: WITNESS_STATE_OBSERVED,
        kind: rule.kind,
        evidencePath: current.evidencePath,
        timestamp: current.timestamp,
        before,
        after,
      };
    }
  }
  return PROGRESS_WITNESS_ABSENT;
}

function classifyDownstreamWorkflow({graph, publication, progress}) {
  const prioritySummary = firstRecord(
    publication[PROPERTY_PRIORITY_RECOVERY_PROGRESS_SUMMARY],
  );
  const dominantWitness = firstRecord(prioritySummary.dominantWitness);
  const progressClasses = firstRecord(
    progress[PROPERTY_PRIORITY_RECOVERY_PROGRESS_CLASSES],
  );
  const blockedPartitionCount = normalizeNumber(
    progress.priorityRecoveryBlockedPartitionCount ??
    progress.priorityBlockedPartitionCount ??
    progressClasses.blockedPartitionCount,
  );
  const unresolvedSemanticStateCount = normalizeNumber(
    progress.priorityRecoveryUnresolvedSemanticStateCount ??
    progressClasses.unresolvedSemanticStateCount,
  );
  const missingPublishedCount = normalizeNumber(publication.missingPublishedCount);
  const priorityEdge = graph.edges.find(
    (edge) => edge.id === EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
  );
  const blocked = missingPublishedCount === NUM_ZERO &&
    (
      blockedPartitionCount > NUM_ZERO ||
      unresolvedSemanticStateCount > NUM_ZERO ||
      isRecord(dominantWitness)
    );
  if (!blocked) {
    return {blocked: false};
  }
  return {
    blocked: true,
    owner: textValue(
      dominantWitness.currentOwner,
      dominantWitness.actuationOwner,
      priorityEdge?.owner,
      OWNER_OPERATION_WORKFLOW,
    ),
    boundary: textValue(
      dominantWitness.blockingBoundary,
      priorityEdge?.boundary,
      BOUNDARY_WORKFLOW_PROGRESS,
    ),
    enabledAction: textValue(
      dominantWitness.nextRequiredAction,
      dominantWitness.progressNextAction,
      ACTION_WAIT_FOR_OPERATION_PROGRESS,
    ),
    lastProgressTimestamp: normalizeTimestamp(
      dominantWitness.lastProgressAtMs,
    ),
    evidencePath: EVIDENCE_PATH_PRIORITY_RECOVERY,
  };
}

function buildPublicationDelta({samples, progress, bestProgress}) {
  if (samples.length >= SECOND_INDEX) {
    const firstSample = samples[FIRST_INDEX];
    const lastSample = samples[samples.length - NUM_ONE];
    return {
      evidencePath: EVIDENCE_PATH_LIVENESS_EVIDENCE,
      fromPublicationEpoch: valueOrAbsent(firstSample.publicationEpoch),
      toPublicationEpoch: valueOrAbsent(lastSample.publicationEpoch),
      fromReadbackEpoch: valueOrAbsent(firstSample.readbackEpoch),
      toReadbackEpoch: valueOrAbsent(lastSample.readbackEpoch),
      fromMissingPublishedCount: valueOrAbsent(firstSample.missingPublishedCount),
      toMissingPublishedCount: valueOrAbsent(lastSample.missingPublishedCount),
      changed: didPublicationChange(firstSample, lastSample),
    };
  }
  return {
    evidencePath: EVIDENCE_PATH_ACTIVE_GATE_BEST_PROGRESS,
    fromPublicationEpoch: valueOrAbsent(bestProgress.publicationEpoch),
    toPublicationEpoch: valueOrAbsent(progress.publicationEpoch),
    fromReadbackEpoch: ABSENT_VALUE,
    toReadbackEpoch: ABSENT_VALUE,
    fromMissingPublishedCount: valueOrAbsent(bestProgress.missingPublishedCount),
    toMissingPublishedCount: valueOrAbsent(progress.missingPublishedCount),
    changed: didPublicationChange(bestProgress, progress),
  };
}

function didPublicationChange(left, right) {
  return changedNumber(left.publicationEpoch, right.publicationEpoch) ||
    changedNumber(left.readbackEpoch, right.readbackEpoch) ||
    decreasedNumber(left.missingPublishedCount, right.missingPublishedCount);
}

function buildQueueState(progress, samples) {
  const lastSample = samples[samples.length - NUM_ONE] || {};
  const depthRecord = firstRecord(progress.selectedControlPlaneOwnerQueueDepth);
  const pendingWrites = firstFiniteNumber(
    depthRecord.pendingWrites,
    lastSample.ownerQueueDepth,
  );
  if (!Number.isFinite(pendingWrites)) {
    return {
      state: QUEUE_STATE_ABSENT,
      evidencePath: ABSENT_VALUE,
      pendingWrites: ABSENT_VALUE,
      pendingWriteGrowthCount: ABSENT_VALUE,
      inFlightDepth: valueOrAbsent(lastSample.inFlightDepth),
    };
  }
  return {
    state: QUEUE_STATE_OBSERVED,
    evidencePath: samples.length > NUM_ZERO ?
      lastSample.evidencePath :
      EVIDENCE_PATH_ACTIVE_GATE_PROGRESS,
    pendingWrites,
    pendingWriteGrowthCount: valueOrAbsent(depthRecord.pendingWriteGrowthCount),
    inFlightDepth: valueOrAbsent(lastSample.inFlightDepth),
  };
}

function isExecutedWithoutVisibility({
  actionEvidence,
  progressWitness,
  publicationDelta,
}) {
  return actionEvidence.executed &&
    progressWitness.state === ABSENT_VALUE &&
    publicationDelta.changed === false;
}

function buildTopologyFrontier(graph) {
  const frontier = graph.frontier?.[FIRST_INDEX] || {};
  return {
    edgeId: textValue(frontier.id, graph.summary?.firstFrontierEdgeId, ABSENT_VALUE),
    owner: textValue(frontier.owner, graph.summary?.firstFrontierOwner, ABSENT_VALUE),
    boundary: textValue(
      frontier.boundary,
      graph.summary?.firstFrontierBoundary,
      ABSENT_VALUE,
    ),
    reason: textValue(
      frontier.dominantReason,
      graph.summary?.firstFrontierReason,
      ABSENT_VALUE,
    ),
    evidencePath: textValue(frontier.evidencePath, ABSENT_VALUE),
  };
}

function finalizeVerdict(base, fields) {
  return {
    ...base,
    verdict: fields.verdict,
    owner: fields.owner,
    boundary: fields.boundary,
    enabledAction: fields.enabledAction,
    lastProgressTimestamp: fields.lastProgressTimestamp,
    evidencePath: fields.evidencePath,
    evidenceGaps: fields.evidenceGaps,
  };
}

function firstRecord(...values) {
  return values.find(isRecord) || {};
}

function firstArray(...values) {
  return values.find(Array.isArray) || [];
}

function isRecord(value) {
  return Boolean(value) &&
    typeof value === TYPEOF_OBJECT &&
    !Array.isArray(value);
}

function textValue(...values) {
  for (const value of values) {
    if (typeof value === TYPEOF_STRING && value.length > NUM_ZERO) {
      return value;
    }
  }
  return EMPTY_TEXT;
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = normalizeNumber(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return Number.NaN;
}

function normalizeTimestamp(value) {
  const number = normalizeNumber(value);
  if (Number.isFinite(number)) {
    return number;
  }
  if (typeof value === TYPEOF_STRING && value.length > NUM_ZERO) {
    return value;
  }
  return ABSENT_VALUE;
}

function valueOrAbsent(value) {
  return Number.isFinite(value) ? value : ABSENT_VALUE;
}

function changedNumber(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && left !== right;
}

function decreasedNumber(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && right < left;
}

export {
  REQUIRED_VERDICTS,
  ROLLING_RESTART_LIVENESS_VERDICT,
  SCHEMA_VERSION_ROLLING_RESTART_LIVENESS_VERDICT_V1,
  buildRollingRestartLivenessVerdict,
};
