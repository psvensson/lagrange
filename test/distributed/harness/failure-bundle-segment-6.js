import {
  PRIORITY_RECOVERY_BLOCKER_REASON_FALLBACK,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {FAILURE_BUNDLE_SEGMENT_5} from './failure-bundle-segment-5.js';
const {
  FAILURE_BUNDLE_SCHEMA_VERSION,
  FAILURE_BUNDLE_RUN_DIRNAME,
  FAILURE_BUNDLE_JSON_FILENAME,
  FAILURE_BUNDLE_MARKDOWN_FILENAME,
  TRIAGE_SUMMARY_JSON_FILENAME,
  TRIAGE_SUMMARY_MARKDOWN_FILENAME,
  RUN_FAILURE_BUNDLE_JSON_FILENAME,
  RUN_FAILURE_BUNDLE_MARKDOWN_FILENAME,
  LOG_FILE_EXTENSION,
  TIMELINE_FILENAME,
  ANALYSIS_FILENAME,
  UTF8_ENCODING,
  ZERO,
  LOG_TAIL_LINE_COUNT,
  MARKDOWN_SECTION_BREAK,
  UNKNOWN_VALUE,
  NO_PROGRESS_REASON_CODE,
  READINESS_FAILURE_CLASS_NO_PROGRESS,
  NODE_DIAGNOSTICS_TRACE_LIMIT,
  NODE_ID_ERROR_PATTERN,
  PLAYBACK_EVENTS_FILENAME,
  PLAYBACK_EVENT_TYPE_CLUSTER_STAGE,
  PLAYBACK_EVENT_TYPE_LOAD_STARTED,
  PLAYBACK_EVENT_TYPE_LOAD_PROGRESS,
  PLAYBACK_EVENT_TYPE_LOAD_COMPLETED,
  PLAYBACK_EVENT_TYPE_NODE_RESTART_BOUNDARY,
  PLAYBACK_EVENT_TYPE_PARTITION_CREATED,
  PLAYBACK_EVENT_TYPE_REPLICA_CREATED,
  PLAYBACK_EVENT_TYPE_REPLICA_REMOVED,
  PLAYBACK_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
  ROOT_CAUSE_CLASS_UNKNOWN,
  ROOT_CAUSE_CLASS_STARTUP,
  ROOT_CAUSE_CLASS_DISCOVERY,
  ROOT_CAUSE_CLASS_TOPOLOGY,
  ROOT_CAUSE_CLASS_LOAD,
  ROOT_CAUSE_CLASS_CDC,
  ROOT_CAUSE_CLASS_CACHE,
  FIRST_FAULT_MARKER_QUEUE_PRESSURE,
  FIRST_FAULT_MARKER_ATTEMPT_ERRORS,
  FIRST_FAULT_MARKER_HARD_FAILURE,
  LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
  LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED,
  LOAD_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE,
  LOAD_WAIT_REASON_TIMEOUT_WAITS,
  LOAD_WAIT_REASON_QUEUE_CAPACITY_REJECTED,
  READINESS_REASON_MAX_NODES,
  READINESS_REASON_MAX_PER_NODE,
  AFFECTED_NODE_ID_LIMIT,
  FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
  FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
  FAILURE_CLASS_DISCOVERY_UNAVAILABLE,
  FAILURE_CLASS_TOPOLOGY_UNSTABLE,
  FAILURE_CLASS_LOAD_PRESSURE,
  FAILURE_CLASS_CDC_DEGRADED,
  FAILURE_CLASS_CACHE_STALE,
  FAILURE_CLASS_VERIFICATION_MISMATCH,
  FAILURE_CLASS_UNKNOWN,
  FAILURE_CLASS_CONFIDENCE_HIGH,
  FAILURE_CLASS_CONFIDENCE_MEDIUM,
  FAILURE_CLASS_CONFIDENCE_LOW,
  TRIAGE_CLUSTER_STAGE_LIMIT,
  TRIAGE_RECENT_TOPOLOGY_EVENT_LIMIT,
  TRIAGE_TOP_LOAD_NODE_LIMIT,
  STABILITY_GATE_STATUS_OPEN,
  STABILITY_GATE_STATUS_CLOSED,
  STABILITY_GATE_STATUS_NOT_APPLICABLE,
  STABILITY_GATE_STATUS_UNKNOWN,
  STABILITY_GATE_TYPE_FAILOVER,
  STABILITY_GATE_TYPE_CONVERGENCE,
  STABILITY_GATE_TYPE_RESTART_RECOVERY,
  STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PENDING_ACK_NODES,
  STABILITY_GATE_BLOCKER_BLOCKED_NODES,
  STABILITY_GATE_BLOCKER_CLOSURE_RECORD,
  STABILITY_GATE_BLOCKER_STARTUP_READINESS,
  SCENARIO_NAME_FRAGMENT_RESTART,
  LOAD_WAIT_REASON_KEYS,
  LOAD_REASON_ROOT_CAUSE_CLASS_BY_REASON,
  toWorkspaceRelative,
  sanitizePathSegment,
  sliceLogTail,
  parseStructuredLogLine,
  resolveStructuredLogMessage,
  resolveStructuredLogTimestamp,
  sanitizeStructuredDecisionArtifact,
  extractDecisionArtifactsFromLogContent,
  resolveRoutingDiagnostics,
  resolveFailureDiagnostics,
  addNormalizedReasonCount,
  deriveReasonCountsFromPublicationConvergence,
  isRecord,
  normalizeActiveGateReadinessDelay,
  appendActiveGateReadinessDelaySignals,
  appendReadinessFailureSignals,
  normalizeReadinessFailure,
  resolveReadinessFailure,
  resolveReadinessFailureGuidance,
  normalizeNonNegativeCount,
  resolveCanonicalFailedOperationCount,
  resolveFailureReasonCounts,
  buildTopReasonCounts,
  buildDominantReason,
  mergeReasonCounts,
  normalizeDistinctStringArray,
  buildPriorityRecoveryCorrelationKey,
  normalizePriorityRecoverySemanticStateId,
  inferPriorityRecoverySemanticState,
  normalizePriorityRecoveryDecisionSnapshots,
  mergePriorityRecoveryDecisionSnapshots,
  normalizePriorityRecoveryInvariants,
  mergePriorityRecoveryInvariants,
  summarizePriorityRecoveryDecisionSnapshots,
  deriveReasonCountsFromLoadMetrics,
  deriveReasonCountsFromReadiness,
  resolveRootCauseClassFromReason,
  resolveRootCauseClass,
  resolveSummaryRootCauseClass,
  normalizeAffectedNodeIds,
  buildMarker,
  resolveLoadMetricsFromPlaybackEvent,
  resolveLoadQueuePressureSignalCount,
  buildFirstFaultTimelineFromPlaybackEvents,
  buildPlaybackEventSummary,
  buildReadinessFromPlaybackEvents,
  cloneJsonValue,
  resolvePlaybackPublicationConvergence,
  resolvePlaybackPublishedMembershipObservation,
  scorePlaybackActiveGateDetails,
  buildPlaybackControlPlaneFallback,
  buildRestartBoundariesFromPlaybackEvents,
  collectPlaybackEventInsights,
  resolveReadinessSnapshot,
  resolveControlPlaneDiagnostics,
  mergeTransitionHistory,
  resolveControlSnapshot,
  resolveAdminQueryTraceByNodeId,
  resolveLoadMetrics,
  extractNodeIdsFromText,
  resolveRelevantNodeIds,
  resolveTraceFailureTimestampMs,
  toIsoTimestamp,
  resolveWorkflowRelevantNodeIds,
  resolveWorkflowStartTimestampMs,
  resolveWorkflowDeniedTimestampMs,
  resolveWorkflowFailureTimestampMs,
  buildNodeTimelineCorrelation,
  buildTimelineCorrelationByNodeId,
  collectScenarioLogArtifacts,
  mergeByNodeIdMaps,
  mergeControlPlaneDiagnostics,
  mergeControlSnapshotByNodeId,
  buildFocusedNodeDiagnostics,
  resolveFirstFaultTimeline,
  mapFirstFaultMarkerToReason,
  resolveDominantReasonFromFirstFaultTimeline,
  buildFailureArtifact,
  buildPublicationConvergenceSummary,
  collectReadinessReasonCodes,
  buildRecoveryReadinessSummary,
  buildStabilityGate,
  countRestartBoundaries,
  buildConvergenceStabilityGate,
  buildFailoverStabilityGate,
  buildRestartRecoveryStabilityGate,
  buildStabilityGates,
  buildFailureClassification,
  buildScenarioFailureBundle,
  buildTriageLoadSummary,
  resolvePartitioningDiagnosticsForTriage,
  buildRoutingDiagnosticsSummary,
  buildScenarioTriageSummary,
  renderScenarioTriageSummaryMarkdown,
  formatList,
  formatObservedList,
  formatCountEntries,
  formatPartitioningConvergenceEvaluations,
  formatStabilityGate,
  formatStabilityGateSummary,
  formatReasonPartitionEntries,
  formatProjectionDiagnostics,
  formatPriorityRecoveryInvariantFailures,
} = FAILURE_BUNDLE_SEGMENT_5;

function formatPriorityRecoveryPartitionBlockerHistory(history) {
  const entries = Array.isArray(history) ? history : [];
  if (entries.length === ZERO) {
    return UNKNOWN_VALUE;
  }
  return entries
    .map((entry) => {
      const partitionId = String(entry?.partitionId || '').trim();
      const blockerReasons = normalizeDistinctStringArray(
        Array.isArray(entry?.blockerReasonCodes) ?
          entry.blockerReasonCodes :
          entry?.blockerReasons,
      );
      return (
        (partitionId.length > ZERO ? partitionId : UNKNOWN_VALUE) +
        '[' +
        (blockerReasons.length > ZERO ?
          blockerReasons.join('|') :
          PRIORITY_RECOVERY_BLOCKER_REASON_FALLBACK) +
        ']'
      );
    })
    .join(', ');
}

function formatPriorityRecoveryPartitionSemanticStateHistory(history) {
  const entries = Array.isArray(history) ? history : [];
  if (entries.length === ZERO) {
    return UNKNOWN_VALUE;
  }
  return entries
    .map((entry) => {
      const partitionId = String(entry?.partitionId || '').trim();
      const semanticStates = normalizeDistinctStringArray(
        Array.isArray(entry?.semanticStateIds) ?
          entry.semanticStateIds :
          entry?.semanticStates,
      );
      return (
        (partitionId.length > ZERO ? partitionId : UNKNOWN_VALUE) +
        '[' +
        (semanticStates.length > ZERO ?
          semanticStates.join('|') :
          PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED) +
        ']'
      );
    })
    .join(', ');
}

function formatPriorityRecoveryPartitionWitnesses(witnesses) {
  const entries = Array.isArray(witnesses) ? witnesses : [];
  if (entries.length === ZERO) {
    return UNKNOWN_VALUE;
  }
  return entries
    .map((entry) => {
      const partitionId = String(entry?.partitionId || '').trim();
      const parts = [partitionId.length > ZERO ? partitionId : UNKNOWN_VALUE];
      const semanticState = String(
        entry?.semanticState || entry?.semanticStateId || '',
      ).trim();
      if (semanticState.length > ZERO) {
        parts.push('state=' + semanticState);
      }
      if (Number.isFinite(entry?.spreadGap)) {
        parts.push('gap=' + String(entry.spreadGap));
      }
      const blockerReasons = normalizeDistinctStringArray(
        Array.isArray(entry?.blockerReasonCodes) ?
          entry.blockerReasonCodes :
          Array.isArray(entry?.progressClassIds) ?
            entry.progressClassIds :
            entry?.blockerReasons,
      );
      if (blockerReasons.length > ZERO) {
        parts.push('blockers=' + blockerReasons.join('|'));
      }
      const decisionDimension = String(entry?.decisionDimension || '').trim();
      if (decisionDimension.length > ZERO) {
        parts.push('decision=' + decisionDimension);
      }
      const eligibleNodeCount = Number.isInteger(entry?.eligibleNodeCount) ?
        entry.eligibleNodeCount :
        Array.isArray(entry?.eligibleNodeIds) ?
          entry.eligibleNodeIds.length :
          null;
      if (Number.isInteger(eligibleNodeCount)) {
        parts.push('eligible=' + String(eligibleNodeCount));
      }
      const operationIds = normalizeDistinctStringArray(entry?.operationIds);
      if (operationIds.length > ZERO) {
        parts.push('ops=' + operationIds.join('|'));
      }
      const latestTimelineStep = String(
        entry?.latestOperationTimelineStep || '',
      ).trim();
      if (latestTimelineStep.length > ZERO) {
        parts.push('step=' + latestTimelineStep);
      }
      const latestStatus = String(entry?.latestOperationStatus || '').trim();
      if (latestStatus.length > ZERO) {
        parts.push('status=' + latestStatus);
      }
      const activeLearnerNodeIds = normalizeDistinctStringArray(
        entry?.activeLearnerNodeIds,
      );
      if (activeLearnerNodeIds.length > ZERO) {
        parts.push('learners=' + activeLearnerNodeIds.join('|'));
      }
      const promotableLearnerNodeIds = normalizeDistinctStringArray(
        entry?.promotableLearnerNodeIds,
      );
      if (promotableLearnerNodeIds.length > ZERO) {
        parts.push('promotable=' + promotableLearnerNodeIds.join('|'));
      }
      const excludedNodeIds = normalizeDistinctStringArray(
        entry?.recoveryEligibleExcludedNodeIds,
      );
      if (excludedNodeIds.length > ZERO) {
        parts.push('excluded=' + excludedNodeIds.join('|'));
      }
      return parts.join('#');
    })
    .join(', ');
}

function formatActiveGateProgress(progress) {
  if (!progress || typeof progress !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'active=' +
      String(progress.activeNodeCount ?? ZERO) +
      '/' +
      String(progress.expectedNodeCount ?? ZERO),
    'coverage=' +
      String(progress.snapshotCoverageNodeCount ?? ZERO) +
      '/' +
      String(progress.expectedNodeCount ?? ZERO),
    'publication=' + String(progress.publicationStatus || UNKNOWN_VALUE),
    'pendingAck=' + String(progress.pendingAckCount ?? ZERO),
    'missingPublished=' + String(progress.missingPublishedCount ?? ZERO),
    'prioritySpread=' +
      String(
        progress.prioritySpreadSatisfied === true ?
          'ready' :
          progress.prioritySpreadSatisfied === false ?
            'pending' :
            UNKNOWN_VALUE,
      ),
    'gateReasons=' + formatList(progress.gateReasons),
  ].join(', ');
}

function formatActiveGateReadinessDelay(readinessDelay) {
  const normalized = normalizeActiveGateReadinessDelay(readinessDelay);
  if (!normalized) {
    return UNKNOWN_VALUE;
  }
  const parts = ['timedOut=' + String(normalized.timedOut === true)];
  if (normalized.cause) {
    parts.push('cause=' + normalized.cause);
  }
  if (normalized.recoverability) {
    parts.push('recoverability=' + normalized.recoverability);
  }
  if (normalized.source) {
    parts.push('source=' + normalized.source);
  }
  return parts.join(', ');
}

function formatReadinessFailure(readinessFailure) {
  const normalized = normalizeReadinessFailure(readinessFailure);
  if (!normalized) {
    return UNKNOWN_VALUE;
  }
  const parts = [
    'class=' + String(normalized.classCode || UNKNOWN_VALUE),
    'mode=' + String(normalized.mode || UNKNOWN_VALUE),
    'recoverability=' + String(normalized.recoverability || UNKNOWN_VALUE),
  ];
  if (normalized.source) {
    parts.push('source=' + normalized.source);
  }
  if (normalized.cause) {
    parts.push('cause=' + normalized.cause);
  }
  if (normalized.terminalReason) {
    parts.push('terminalReason=' + normalized.terminalReason);
  }
  if (Number.isInteger(normalized.progressSignal?.attemptsSinceProgress)) {
    const attempts = String(normalized.progressSignal.attemptsSinceProgress);
    const maxAttempts = Number.isInteger(normalized.progressSignal?.maxAttempts) ?
      String(normalized.progressSignal.maxAttempts) :
      UNKNOWN_VALUE;
    parts.push('attemptsSinceProgress=' + attempts + '/' + maxAttempts);
  }
  return parts.join(', ');
}

function formatControlPlaneQuiescence(quiescence) {
  if (!isRecord(quiescence)) {
    return UNKNOWN_VALUE;
  }
  return [
    'state=' + String(quiescence.state || UNKNOWN_VALUE),
    'blocker=' + String(quiescence.canonicalBlocker || UNKNOWN_VALUE),
    'reasons=' + formatList(quiescence.reasonCodes),
  ].join(', ');
}

function formatReadinessDimensions(readiness) {
  const dimensions =
    readiness?.dimensions && typeof readiness.dimensions === 'object' ?
      readiness.dimensions :
      {};
  const entries = Object.entries(dimensions).map(
    ([dimension, value]) =>
      `${dimension}=${value === true ? 'ready' : 'blocked'}`,
  );
  return entries.length > ZERO ? entries.join(', ') : UNKNOWN_VALUE;
}

function formatPublicationMode(publicationMode) {
  if (!publicationMode || typeof publicationMode !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'mode=' + String(publicationMode.currentMode || UNKNOWN_VALUE),
    'reason=' + String(publicationMode.reasonCode || UNKNOWN_VALUE),
  ].join(', ');
}

function formatHeartbeatPublication(publication) {
  if (!publication || typeof publication !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'path=' + String(publication.publicationPath || UNKNOWN_VALUE),
    'target=' + String(publication.targetAddress || UNKNOWN_VALUE),
    'service=' + String(publication.targetServiceId || UNKNOWN_VALUE),
    'lastAttemptAt=' + String(publication.lastAttemptAt || UNKNOWN_VALUE),
    'lastSuccessAt=' + String(publication.lastSuccessAt || UNKNOWN_VALUE),
    'consecutiveFailures=' +
      String(publication.consecutiveFailures ?? UNKNOWN_VALUE),
    'failure=' + String(publication.lastFailureReason || UNKNOWN_VALUE),
  ].join(', ');
}

function formatNodeLiveness(nodeLiveness) {
  if (!nodeLiveness || typeof nodeLiveness !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'lastHeartbeat=' + String(nodeLiveness.lastHeartbeat ?? UNKNOWN_VALUE),
    'heartbeatAgeMs=' + String(nodeLiveness.heartbeatAgeMs ?? UNKNOWN_VALUE),
    'readyLeaseExpiresAt=' +
      String(nodeLiveness.readyLeaseExpiresAt ?? UNKNOWN_VALUE),
    'readyLeaseLagMs=' +
      String(
        nodeLiveness.readyLeaseAgeMs ??
          nodeLiveness.readyLeaseLagMs ??
          UNKNOWN_VALUE,
      ),
  ].join(', ');
}

function formatTimelineCorrelation(correlation) {
  if (!correlation || typeof correlation !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'loadFailureAt=' + String(correlation.firstLoadFailureAt || UNKNOWN_VALUE),
    'readinessFlipAt=' +
      String(correlation.firstReadinessFlipAt || UNKNOWN_VALUE),
    'heartbeatAgeMsAtFlip=' +
      String(correlation.heartbeatAgeMsAtFirstReadinessFlip ?? UNKNOWN_VALUE),
    'splitStartAt=' + String(correlation.firstSplitStartedAt || UNKNOWN_VALUE),
    'splitRejectedAt=' +
      String(correlation.firstSplitRejectedAt || UNKNOWN_VALUE),
    'splitFailedAt=' + String(correlation.firstSplitFailedAt || UNKNOWN_VALUE),
  ].join(', ');
}

function formatReadinessTransition(transition) {
  if (!transition || typeof transition !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'at=' + String(transition.observedAt || UNKNOWN_VALUE),
    'serve=' +
      String(transition.previousServeEligible ?? UNKNOWN_VALUE) +
      '->' +
      String(transition.serveEligible ?? UNKNOWN_VALUE),
    'repair=' +
      String(transition.previousRepairEligible ?? UNKNOWN_VALUE) +
      '->' +
      String(transition.repairEligible ?? UNKNOWN_VALUE),
    'heartbeatAgeMs=' +
      String(transition?.rawInputs?.heartbeatAgeMs ?? UNKNOWN_VALUE),
    'readyLeaseLagMs=' +
      String(transition?.rawInputs?.readyLeaseLagMs ?? UNKNOWN_VALUE),
    'reasons=' + formatList(transition.reasonCodes),
  ].join(', ');
}

function formatWorkflowAdmission(workflow) {
  if (!workflow || typeof workflow !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'state=' + String(workflow.transitionState || UNKNOWN_VALUE),
    'decision=' +
      String(
        workflow?.admission?.decisionType ||
          workflow?.admission?.decision ||
          UNKNOWN_VALUE,
      ),
    'blockingReasons=' +
      formatList(
        Array.isArray(workflow?.blockingReasons) ?
          workflow.blockingReasons.map((reason) => reason?.code || reason) :
          [],
      ),
  ].join(', ');
}

function formatTimeoutClassificationEntry(entry) {
  const timeoutClassification =
    entry?.timeoutClassification &&
    typeof entry.timeoutClassification === 'object' ?
      entry.timeoutClassification :
      {};
  return [
    'workflowId=' + String(entry?.workflowId || UNKNOWN_VALUE),
    'classification=' +
      String(timeoutClassification.classification || UNKNOWN_VALUE),
    'boundaryHit=' + String(timeoutClassification.boundaryHit === true),
    'nestedOperation=' +
      String(timeoutClassification.nestedOperation || UNKNOWN_VALUE),
  ].join(', ');
}

function formatNodeClientChannelMetrics(channel, metrics) {
  if (!metrics || typeof metrics !== 'object') {
    return `- ${channel}: ` + UNKNOWN_VALUE;
  }
  return [
    '- ' + channel + ':',
    'requests=' + String(metrics.requests ?? ZERO),
    'successes=' + String(metrics.successes ?? ZERO),
    'errors=' + String(metrics.errors ?? ZERO),
    'timeouts=' + String(metrics.timeouts ?? ZERO),
    'retries=' + String(metrics.retries ?? ZERO),
    'breakerOpens=' + String(metrics.breakerOpens ?? ZERO),
    'budgetDenials=' + String(metrics.budgetDenials ?? ZERO),
    'timeoutBudgetMismatches=' +
      String(metrics.timeoutBudgetMismatches ?? ZERO),
    'timedOutInFlight=' + String(metrics.timedOutInFlight ?? ZERO),
  ].join(' ');
}

function formatNodeClientChannelState(channel, nodeId, state) {
  if (!state || typeof state !== 'object') {
    return `- ${channel}/${nodeId}: ` + UNKNOWN_VALUE;
  }
  return [
    '- ' + channel + '/' + nodeId + ':',
    'inFlight=' + String(state.inFlight ?? ZERO),
    'consecutiveFailures=' + String(state.consecutiveFailures ?? ZERO),
    'openUntilMs=' + String(state.openUntilMs ?? ZERO),
    'circuitOpen=' + String(state.circuitOpen === true),
  ].join(' ');
}

function formatNodeDiagnosticLoadMetrics(loadMetrics) {
  if (!loadMetrics || typeof loadMetrics !== 'object') {
    return null;
  }
  return [
    'dispatched=' + Number(loadMetrics.dispatched || ZERO),
    'success=' + Number(loadMetrics.success || ZERO),
    'attemptErrors=' + Number(loadMetrics.attemptErrors || ZERO),
    'admissionSignals=' + Number(loadMetrics.admissionSignals || ZERO),
    'queuePressureSignals=' + Number(loadMetrics.queuePressureSignals || ZERO),
    'rejected=' + Number(loadMetrics.rejected || ZERO),
  ].join(', ');
}

function formatRoutingDiagnostics(routingDiagnostics) {
  if (!routingDiagnostics || typeof routingDiagnostics !== 'object') {
    return UNKNOWN_VALUE;
  }
  const deniedByNodeId =
    routingDiagnostics.deniedByNodeId &&
    typeof routingDiagnostics.deniedByNodeId === 'object' ?
      Object.entries(routingDiagnostics.deniedByNodeId).map(
        ([nodeId, summary]) => {
          const reasonCodes = Array.isArray(summary?.reasonCodes) ?
            summary.reasonCodes :
            [];
          return `${nodeId}[${formatList(reasonCodes)}]`;
        },
      ) :
      [];
  return [
    'reason=' + String(routingDiagnostics.reasonCode || UNKNOWN_VALUE),
    'decisionDimension=' +
      String(routingDiagnostics.routingReadinessDimension || UNKNOWN_VALUE),
    'services=' + String(routingDiagnostics.serviceRowCount ?? UNKNOWN_VALUE),
    'activeAddressed=' +
      String(routingDiagnostics.activeAddressedServiceCount ?? UNKNOWN_VALUE),
    'routable=' +
      String(routingDiagnostics.routableServiceCount ?? UNKNOWN_VALUE),
    'leaderKnown=' + String(routingDiagnostics.leaderKnown === true),
    'canonicalLeaderNodeId=' +
      String(routingDiagnostics.canonicalLeaderNodeId || UNKNOWN_VALUE),
    'deniedNodes=' + formatList(deniedByNodeId),
  ].join(', ');
}

function formatAdminQueryTraceEntry(entry) {
  return [
    'outcome=' + String(entry?.outcome || UNKNOWN_VALUE),
    'operation=' + String(entry?.operation || UNKNOWN_VALUE),
    'lane=' + String(entry?.lane || UNKNOWN_VALUE),
    'timeoutMs=' + String(entry?.timeoutMs ?? UNKNOWN_VALUE),
    'durationMs=' + String(entry?.durationMs ?? UNKNOWN_VALUE),
    'error=' + String(entry?.error || UNKNOWN_VALUE),
  ].join(', ');
}

function formatFirstFaultTimeline(firstFaultTimeline) {
  if (!firstFaultTimeline || typeof firstFaultTimeline !== 'object') {
    return '- none';
  }
  const lines = [
    '- Load Start: ' + String(firstFaultTimeline.loadStartAt || UNKNOWN_VALUE),
  ];
  const orderedMarkers = Array.isArray(firstFaultTimeline.orderedMarkers) ?
    firstFaultTimeline.orderedMarkers :
    [];
  if (orderedMarkers.length === ZERO) {
    lines.push('- Markers: none');
    return lines.join('\n');
  }
  lines.push('- Markers:');
  for (const marker of orderedMarkers) {
    lines.push(
      `  - ${marker.marker}: ${String(marker.at || UNKNOWN_VALUE)} ` +
        `(deltaMs=${String(marker.deltaFromLoadStartMs ?? UNKNOWN_VALUE)})`,
    );
  }
  return lines.join('\n');
}

function renderScenarioFailureBundleMarkdown(bundle) {
  const topReasons = Array.isArray(bundle?.topFailures?.topReasons) ?
    bundle.topFailures.topReasons :
    [];
  const relevantLogs =
    bundle?.logs?.nodeLogPaths && typeof bundle.logs.nodeLogPaths === 'object' ?
      Object.entries(bundle.logs.nodeLogPaths) :
      [];
  const sections = [
    '# Failure Bundle',
    [
      `- Scenario: ${bundle.scenario}`,
      `- Phase: ${bundle.summary.phase || UNKNOWN_VALUE}`,
      `- Root Cause Class: ${bundle.summary.rootCauseClass || UNKNOWN_VALUE}`,
      `- Dominant Reason: ${bundle.summary.dominantReason || UNKNOWN_VALUE}`,
      '- Failure Class: ' +
        String(
          bundle.summary.failureClassification?.failureClass || UNKNOWN_VALUE,
        ),
      '- Readiness Failure: ' +
        formatReadinessFailure(bundle.summary.readinessFailure),
      '- Quiescence: ' +
        formatControlPlaneQuiescence(bundle.summary.quiescence),
      `- Bottleneck: ${bundle.summary.bottleneckEstimate?.kind || UNKNOWN_VALUE}`,
      `- Report: ${bundle.reportPath || UNKNOWN_VALUE}`,
    ].join('\n'),
  ];

  if (bundle?.publicationConvergence) {
    const publicationGateReasons = Array.isArray(
      bundle.publicationConvergence.publicationConvergenceGateReasons,
    ) ?
      bundle.publicationConvergence.publicationConvergenceGateReasons :
      [];
    const activeGateBlockerHistory = Array.isArray(
      bundle.publicationConvergence.activeGateBlockerHistory,
    ) ?
      bundle.publicationConvergence.activeGateBlockerHistory :
      [];
    const activeGateNoProgress =
      bundle.publicationConvergence.activeGateNoProgress &&
      typeof bundle.publicationConvergence.activeGateNoProgress === 'object' ?
        bundle.publicationConvergence.activeGateNoProgress :
        null;
    sections.push(
      '## Publication Convergence\n' +
        [
          '- Publication Epoch: ' +
            String(
              bundle.publicationConvergence.publicationEpoch ?? UNKNOWN_VALUE,
            ),
          '- Publication Status: ' +
            String(
              bundle.publicationConvergence.publicationStatus || UNKNOWN_VALUE,
            ),
          '- Pending Ack Count: ' +
            String(bundle.publicationConvergence.pendingAckCount ?? ZERO),
          '- Blocked Node Count: ' +
            String(bundle.publicationConvergence.blockedNodeCount ?? ZERO),
          '- Pending Ack Nodes: ' +
            formatObservedList(bundle.publicationConvergence.pendingAckNodeIds),
          '- Blocked Nodes: ' +
            formatObservedList(bundle.publicationConvergence.blockedNodeIds),
          '- Publication Gate Reasons: ' +
            formatObservedList(publicationGateReasons),
          '- Priority Recovery Progress Classes: ' +
            formatList(
              bundle.publicationConvergence.priorityRecoveryProgressClassIds,
            ),
          '- Priority Recovery Semantic States: ' +
            formatList(
              bundle.publicationConvergence.priorityRecoverySemanticStateIds,
            ),
          '- Priority Recovery Blocked Partition Count: ' +
            String(
              bundle.publicationConvergence
                .priorityRecoveryBlockedPartitionCount ?? ZERO,
            ),
          '- Priority Recovery Blocked Partitions: ' +
            formatList(
              bundle.publicationConvergence.priorityRecoveryBlockedPartitionIds,
            ),
          '- Priority Recovery Unresolved Partition Count: ' +
            String(
              bundle.publicationConvergence
                .priorityRecoveryUnresolvedPartitionCount ?? ZERO,
            ),
          '- Priority Recovery Unresolved Partitions: ' +
            formatList(
              bundle.publicationConvergence
                .priorityRecoveryUnresolvedPartitionIds,
            ),
          '- Priority Recovery Partition Blockers: ' +
            formatReasonPartitionEntries(
              bundle.publicationConvergence
                .priorityRecoveryBlockerPartitionIdsByReason,
            ),
          '- Priority Recovery Partition Semantic States: ' +
            formatReasonPartitionEntries(
              bundle.publicationConvergence
                .priorityRecoveryPartitionIdsBySemanticState,
            ),
          '- Priority Recovery Per-Partition History: ' +
            formatPriorityRecoveryPartitionBlockerHistory(
              bundle.publicationConvergence
                .priorityRecoveryPartitionBlockerHistory,
            ),
          '- Priority Recovery Per-Partition Semantic History: ' +
            formatPriorityRecoveryPartitionSemanticStateHistory(
              bundle.publicationConvergence
                .priorityRecoveryPartitionSemanticStateHistory,
            ),
          '- Priority Recovery Partition Witnesses: ' +
            formatPriorityRecoveryPartitionWitnesses(
              bundle.publicationConvergence.priorityRecoveryPartitionWitnesses,
            ),
          '- Priority Recovery Admission Dimensions: ' +
            formatList(
              bundle.publicationConvergence
                .priorityRecoveryAdmissionDecisionDimensions,
            ),
          '- Priority Recovery Failing Invariants: ' +
            formatList(
              bundle.publicationConvergence.priorityRecoveryInvariantFailingIds,
            ),
          '- Priority Recovery Invariant Failures: ' +
            formatPriorityRecoveryInvariantFailures(
              bundle.publicationConvergence.priorityRecoveryInvariantFailures,
            ),
          '- Closure Record Id: ' +
            String(
              bundle.publicationConvergence.closureRecordId || UNKNOWN_VALUE,
            ),
          '- Closure Witness Class: ' +
            String(
              bundle.publicationConvergence.closureWitnessClass ||
                UNKNOWN_VALUE,
            ),
          '- Projection Diagnostics: ' +
            formatProjectionDiagnostics(
              bundle.publicationConvergence.projectionDiagnostics,
            ),
          '- Active Gate Progress: ' +
            formatActiveGateProgress(
              bundle.publicationConvergence.activeGateProgress,
            ),
          '- Active Gate Best Progress: ' +
            formatActiveGateProgress(
              bundle.publicationConvergence.activeGateBestProgress,
            ),
          '- Active Gate No-Progress: ' +
            (activeGateNoProgress ?
              'attemptsSinceProgress=' +
                String(
                  activeGateNoProgress.attemptsSinceProgress ?? UNKNOWN_VALUE,
                ) +
                '/' +
                String(activeGateNoProgress.maxAttempts ?? UNKNOWN_VALUE) +
                ', stalled=' +
                String(activeGateNoProgress.stalled === true) :
              UNKNOWN_VALUE),
          '- Active Gate Blocker History: ' +
            (activeGateBlockerHistory.length > ZERO ?
              activeGateBlockerHistory
                .map((entry) => {
                  const signature = String(entry?.signature || '').trim();
                  const count = Number(entry?.count || ZERO);
                  return (
                    (signature.length > ZERO ? signature : UNKNOWN_VALUE) +
                      ':' +
                      String(count)
                  );
                })
                .join(', ') :
              UNKNOWN_VALUE),
          '- Active Gate Readiness Delay: ' +
            formatActiveGateReadinessDelay(
              bundle.publicationConvergence.activeGateReadinessDelay,
            ),
        ].join('\n'),
    );
  }

  sections.push(
    '## Stability Gates\n' +
      formatStabilityGateSummary(
        isRecord(bundle?.summary?.stabilityGates) ?
          bundle.summary.stabilityGates :
          bundle?.stabilityGates,
      ),
  );

  if (bundle?.recoveryReadiness) {
    sections.push(
      '## Recovery Readiness\n' +
        [
          '- Routing Dimension Counts: ' +
            formatCountEntries(bundle.recoveryReadiness.routingDimensionCounts),
          '- Repair-Routed Nodes: ' +
            formatList(bundle.recoveryReadiness.repairRoutedNodeIds),
          '- Recovery-Routed Nodes: ' +
            formatList(bundle.recoveryReadiness.recoveryRoutedNodeIds),
          '- Recovery-Only Eligible Nodes: ' +
            formatList(bundle.recoveryReadiness.recoveryOnlyNodeIds),
          '- Repair-Routed Recovery-Only Nodes: ' +
            formatList(
              bundle.recoveryReadiness.repairRoutedRecoveryOnlyNodeIds,
            ),
          '- Write-Unhealthy Nodes: ' +
            formatList(bundle.recoveryReadiness.writeUnhealthyNodeIds),
          '- Publication-Blocked Nodes: ' +
            formatList(bundle.recoveryReadiness.publicationBlockedNodeIds),
          '- Pending Ack Nodes: ' +
            formatList(bundle.recoveryReadiness.pendingAckNodeIds),
          '- Pending Ack Recovery-Only Nodes: ' +
            formatList(bundle.recoveryReadiness.pendingAckRecoveryOnlyNodeIds),
          '- Pending Ack Repair-Eligible Nodes: ' +
            formatList(
              bundle.recoveryReadiness.pendingAckRepairEligibleNodeIds,
            ),
          '- Pending Ack Blocked Nodes: ' +
            formatList(bundle.recoveryReadiness.pendingAckBlockedNodeIds),
        ].join('\n'),
    );
  }

  sections.push(
    '## Top Reasons\n' +
      (topReasons.length > ZERO ?
        topReasons
          .map((entry) => `- ${entry.reason}: ${entry.count}`)
          .join('\n') :
        '- none'),
  );

  if (bundle?.diagnostics?.noProgress) {
    sections.push(
      '## No Progress\n' +
        [
          '- Reason Code: ' +
            String(
              bundle.diagnostics.noProgress.reasonCode ||
                NO_PROGRESS_REASON_CODE,
            ),
          '- Stalled Reason: ' +
            String(
              bundle.diagnostics.noProgress.stalledReason || UNKNOWN_VALUE,
            ),
          '- Last Progress: ' +
            String(
              bundle.diagnostics.noProgress.lastProgressEvent?.message ||
                UNKNOWN_VALUE,
            ),
          '- Last Meaningful Change: ' +
            String(
              bundle.diagnostics.noProgress.lastMeaningfulChange?.message ||
                UNKNOWN_VALUE,
            ),
          '- Readiness Failure: ' +
            formatReadinessFailure(
              bundle.diagnostics.noProgress.readinessFailure,
            ),
        ].join('\n'),
    );
  }

  if (
    bundle?.summary?.failureAction ||
    bundle?.summary?.operatorRecommendation
  ) {
    sections.push(
      '## Readiness Guidance\n' +
        [
          '- Failure Action: ' +
            String(bundle.summary.failureAction || UNKNOWN_VALUE),
          '- Operator Recommendation: ' +
            String(bundle.summary.operatorRecommendation || UNKNOWN_VALUE),
        ].join('\n'),
    );
  }

  sections.push(
    '## Log Paths\n' +
      (relevantLogs.length > ZERO ?
        relevantLogs
          .map(([nodeId, path]) => `- ${nodeId}: ${path}`)
          .join('\n') :
        '- none'),
  );
  if (bundle?.logs?.playbackEventsPath) {
    sections.push(
      '## Playback Events\n' + '- ' + String(bundle.logs.playbackEventsPath),
    );
  }

  if (bundle?.diagnostics?.firstFaultTimeline) {
    sections.push(
      '## First-Fault Timeline\n' +
        formatFirstFaultTimeline(bundle.diagnostics.firstFaultTimeline),
    );
  }

  const excerpts =
    bundle?.logs?.excerptsByNodeId &&
    typeof bundle.logs.excerptsByNodeId === 'object' ?
      Object.entries(bundle.logs.excerptsByNodeId) :
      [];
  if (excerpts.length > ZERO) {
    sections.push(
      '## Log Excerpts\n' +
        excerpts
          .map(([nodeId, lines]) => {
            const content = Array.isArray(lines) ? lines.join('\n') : '';
            return `### ${nodeId}\n\n\`\`\`text\n${content}\n\`\`\``;
          })
          .join(MARKDOWN_SECTION_BREAK),
    );
  }

  const nodeDiagnostics =
    bundle?.nodeDiagnostics && typeof bundle.nodeDiagnostics === 'object' ?
      Object.entries(bundle.nodeDiagnostics) :
      [];
  if (nodeDiagnostics.length > ZERO) {
    sections.push(
      '## Node Diagnostics\n' +
        nodeDiagnostics
          .map(([nodeId, nodeDiagnostic]) => {
            const lines = [];
            if (nodeDiagnostic?.logPath) {
              lines.push(`- Log Path: ${nodeDiagnostic.logPath}`);
            }
            if (nodeDiagnostic?.decisionArtifacts?.latestStartupDecision) {
              lines.push(
                '- Latest Startup Decision: ' +
                  JSON.stringify(
                    nodeDiagnostic.decisionArtifacts.latestStartupDecision,
                  ),
              );
            }
            if (nodeDiagnostic?.decisionArtifacts?.latestRuntimeHandoff) {
              lines.push(
                '- Latest Runtime Handoff: ' +
                  JSON.stringify(
                    nodeDiagnostic.decisionArtifacts.latestRuntimeHandoff,
                  ),
              );
            }
            if (
              Array.isArray(nodeDiagnostic?.restartBoundaries) &&
              nodeDiagnostic.restartBoundaries.length > ZERO
            ) {
              lines.push(
                '- Restart Boundaries: ' +
                  nodeDiagnostic.restartBoundaries
                    .map(
                      (boundary) =>
                        String(boundary.phase || UNKNOWN_VALUE) +
                        '@' +
                        String(boundary.timestamp || UNKNOWN_VALUE),
                    )
                    .join(', '),
              );
            }
            const loadMetrics = formatNodeDiagnosticLoadMetrics(
              nodeDiagnostic?.loadMetrics,
            );
            if (loadMetrics) {
              lines.push(`- Load Metrics: ${loadMetrics}`);
            }
            if (nodeDiagnostic?.readiness) {
              lines.push(
                `- Readiness: ${formatReadinessDimensions(nodeDiagnostic.readiness)}`,
              );
            }
            if (nodeDiagnostic?.placementEligibility) {
              lines.push(
                '- Placement Eligibility: ' +
                  String(
                    nodeDiagnostic.placementEligibility.placementEligible ===
                      true ?
                      'eligible' :
                      'ineligible',
                  ) +
                  ` (failedDimensions=${formatList(
                    nodeDiagnostic.placementEligibility.failedDimensions,
                  )}, reasonCodes=${formatList(
                    nodeDiagnostic.placementEligibility.reasonCodes,
                  )})`,
              );
            }
            if (nodeDiagnostic?.publicationMode) {
              lines.push(
                `- Publication Mode: ${formatPublicationMode(nodeDiagnostic.publicationMode)}`,
              );
            }
            if (nodeDiagnostic?.heartbeatPublication) {
              lines.push(
                '- Heartbeat Publication: ' +
                  formatHeartbeatPublication(
                    nodeDiagnostic.heartbeatPublication,
                  ),
              );
            }
            if (nodeDiagnostic?.nodeLiveness) {
              lines.push(
                `- Node Liveness: ${formatNodeLiveness(nodeDiagnostic.nodeLiveness)}`,
              );
            }
            if (nodeDiagnostic?.timelineCorrelation) {
              lines.push(
                '- Timeline Correlation: ' +
                  formatTimelineCorrelation(nodeDiagnostic.timelineCorrelation),
              );
            }
            if (nodeDiagnostic?.routingDiagnostics) {
              lines.push(
                '- Routing Diagnostics: ' +
                  formatRoutingDiagnostics(nodeDiagnostic.routingDiagnostics),
              );
            }
            const readinessTransitions = Array.isArray(
              nodeDiagnostic?.readinessTransitions,
            ) ?
              nodeDiagnostic.readinessTransitions :
              [];
            if (readinessTransitions.length > ZERO) {
              lines.push(
                '- First Readiness Flip: ' +
                  formatReadinessTransition(readinessTransitions[ZERO]),
              );
            }
            const errors = Array.isArray(nodeDiagnostic?.errors) ?
              nodeDiagnostic.errors :
              [];
            if (errors.length > ZERO) {
              for (const errorText of errors) {
                lines.push(`- Error: ${errorText}`);
              }
            }
            const traces = Array.isArray(nodeDiagnostic?.adminQueryTrace) ?
              nodeDiagnostic.adminQueryTrace :
              [];
            if (traces.length > ZERO) {
              lines.push('```text');
              for (const traceEntry of traces) {
                lines.push(formatAdminQueryTraceEntry(traceEntry));
              }
              lines.push('```');
            }
            return `### ${nodeId}\n\n${lines.join('\n')}`;
          })
          .join(MARKDOWN_SECTION_BREAK),
    );
  }

  const publicationModes =
    bundle?.controlPlane?.publicationModeByNodeId &&
    typeof bundle.controlPlane.publicationModeByNodeId === 'object' ?
      Object.entries(bundle.controlPlane.publicationModeByNodeId) :
      [];
  const heartbeatPublications =
    bundle?.controlPlane?.heartbeatPublicationByNodeId &&
    typeof bundle.controlPlane.heartbeatPublicationByNodeId === 'object' ?
      Object.entries(bundle.controlPlane.heartbeatPublicationByNodeId) :
      [];
  const workflowAdmissions =
    bundle?.controlPlane?.workflowAdmissionsByWorkflowId &&
    typeof bundle.controlPlane.workflowAdmissionsByWorkflowId === 'object' ?
      Object.entries(bundle.controlPlane.workflowAdmissionsByWorkflowId) :
      [];
  const readinessTransitionsByNodeId =
    bundle?.controlPlane?.readinessTransitionsByNodeId &&
    typeof bundle.controlPlane.readinessTransitionsByNodeId === 'object' ?
      Object.entries(bundle.controlPlane.readinessTransitionsByNodeId) :
      [];
  const timeoutClassifications = Array.isArray(
    bundle?.controlPlane?.timeoutClassifications,
  ) ?
    bundle.controlPlane.timeoutClassifications :
    [];
  if (
    publicationModes.length > ZERO ||
    heartbeatPublications.length > ZERO ||
    readinessTransitionsByNodeId.length > ZERO ||
    workflowAdmissions.length > ZERO ||
    timeoutClassifications.length > ZERO
  ) {
    const controlPlaneSections = [];
    if (publicationModes.length > ZERO) {
      controlPlaneSections.push(
        '### Publication Modes\n' +
          publicationModes
            .map(
              ([nodeId, publicationMode]) =>
                `- ${nodeId}: ${formatPublicationMode(publicationMode)}`,
            )
            .join('\n'),
      );
    }
    if (heartbeatPublications.length > ZERO) {
      controlPlaneSections.push(
        '### Heartbeat Publications\n' +
          heartbeatPublications
            .map(
              ([nodeId, publication]) =>
                `- ${nodeId}: ${formatHeartbeatPublication(publication)}`,
            )
            .join('\n'),
      );
    }
    if (workflowAdmissions.length > ZERO) {
      controlPlaneSections.push(
        '### Workflow Admissions\n' +
          workflowAdmissions
            .map(
              ([workflowId, workflow]) =>
                `- ${workflowId}: ${formatWorkflowAdmission(workflow)}`,
            )
            .join('\n'),
      );
    }
    if (readinessTransitionsByNodeId.length > ZERO) {
      controlPlaneSections.push(
        '### Readiness Flips\n' +
          readinessTransitionsByNodeId
            .map(([nodeId, transitions]) => {
              const firstTransition = Array.isArray(transitions) ?
                transitions[ZERO] :
                null;
              return (
                `- ${nodeId}: ` + formatReadinessTransition(firstTransition)
              );
            })
            .join('\n'),
      );
    }
    if (timeoutClassifications.length > ZERO) {
      controlPlaneSections.push(
        '### Timeout Classifications\n' +
          timeoutClassifications
            .map((entry) => `- ${formatTimeoutClassificationEntry(entry)}`)
            .join('\n'),
      );
    }
    sections.push(
      '## Control Plane Diagnostics\n' +
        controlPlaneSections.join(MARKDOWN_SECTION_BREAK),
    );
  }

  const channelMetrics =
    bundle?.diagnostics?.rootCauseBundle?.channelMetrics &&
    typeof bundle.diagnostics.rootCauseBundle.channelMetrics === 'object' ?
      Object.entries(bundle.diagnostics.rootCauseBundle.channelMetrics) :
      [];
  const channelStateByChannel =
    bundle?.diagnostics?.rootCauseBundle?.channelStateByChannel &&
    typeof bundle.diagnostics.rootCauseBundle.channelStateByChannel === 'object' ?
      Object.entries(bundle.diagnostics.rootCauseBundle.channelStateByChannel) :
      [];
  if (channelMetrics.length > ZERO || channelStateByChannel.length > ZERO) {
    const nodeClientSections = [];
    if (channelMetrics.length > ZERO) {
      nodeClientSections.push(
        '### Metrics\n' +
          channelMetrics
            .map(([channel, metrics]) =>
              formatNodeClientChannelMetrics(channel, metrics),
            )
            .join('\n'),
      );
    }
    if (channelStateByChannel.length > ZERO) {
      nodeClientSections.push(
        '### Channel State\n' +
          channelStateByChannel
            .flatMap(([channel, nodeStates]) =>
              Object.entries(
                nodeStates && typeof nodeStates === 'object' ? nodeStates : {},
              ).map(([nodeId, state]) =>
                formatNodeClientChannelState(channel, nodeId, state),
              ),
            )
            .join('\n'),
      );
    }
    sections.push(
      '## Node Client Channels\n' +
        nodeClientSections.join(MARKDOWN_SECTION_BREAK),
    );
  }

  return sections.join(MARKDOWN_SECTION_BREAK) + '\n';
}

function buildRunFailureBundle({
  reportOutputPath,
  reportSummary,
  standardSummary,
  benchmarkRegressionGate,
  scenarioBundles,
}) {
  return {
    schemaVersion: FAILURE_BUNDLE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    reportPath: reportOutputPath,
    reportSummary,
    standardSummary,
    benchmarkRegressionGate: benchmarkRegressionGate || null,
    failedScenarioCount: scenarioBundles.length,
    scenarios: scenarioBundles.map((bundle) => ({
      scenario: bundle.scenario,
      summary: bundle.summary,
      jsonPath: bundle.links.jsonPath,
      markdownPath: bundle.links.markdownPath,
    })),
  };
}

function renderRunFailureBundleMarkdown(bundle) {
  return (
    [
      '# Run Failure Bundle',
      `- Report: ${bundle.reportPath || UNKNOWN_VALUE}`,
      `- Failed Scenarios: ${bundle.failedScenarioCount}`,
      '## Scenarios\n' +
        (Array.isArray(bundle.scenarios) && bundle.scenarios.length > ZERO ?
          bundle.scenarios
            .map(
              (scenario) =>
                `- ${scenario.scenario}: ` +
                  `${scenario.summary.phase || UNKNOWN_VALUE} ` +
                  `[${String(
                    scenario.summary.failureClassification?.failureClass ||
                      UNKNOWN_VALUE,
                  )}] (${scenario.markdownPath})`,
            )
            .join('\n') :
          '- none'),
    ].join(MARKDOWN_SECTION_BREAK) + '\n'
  );
}

export const FAILURE_BUNDLE_SEGMENT_6 = {
  FAILURE_BUNDLE_SCHEMA_VERSION,
  FAILURE_BUNDLE_RUN_DIRNAME,
  FAILURE_BUNDLE_JSON_FILENAME,
  FAILURE_BUNDLE_MARKDOWN_FILENAME,
  TRIAGE_SUMMARY_JSON_FILENAME,
  TRIAGE_SUMMARY_MARKDOWN_FILENAME,
  RUN_FAILURE_BUNDLE_JSON_FILENAME,
  RUN_FAILURE_BUNDLE_MARKDOWN_FILENAME,
  LOG_FILE_EXTENSION,
  TIMELINE_FILENAME,
  ANALYSIS_FILENAME,
  UTF8_ENCODING,
  ZERO,
  LOG_TAIL_LINE_COUNT,
  MARKDOWN_SECTION_BREAK,
  UNKNOWN_VALUE,
  NO_PROGRESS_REASON_CODE,
  READINESS_FAILURE_CLASS_NO_PROGRESS,
  NODE_DIAGNOSTICS_TRACE_LIMIT,
  NODE_ID_ERROR_PATTERN,
  PLAYBACK_EVENTS_FILENAME,
  PLAYBACK_EVENT_TYPE_CLUSTER_STAGE,
  PLAYBACK_EVENT_TYPE_LOAD_STARTED,
  PLAYBACK_EVENT_TYPE_LOAD_PROGRESS,
  PLAYBACK_EVENT_TYPE_LOAD_COMPLETED,
  PLAYBACK_EVENT_TYPE_NODE_RESTART_BOUNDARY,
  PLAYBACK_EVENT_TYPE_PARTITION_CREATED,
  PLAYBACK_EVENT_TYPE_REPLICA_CREATED,
  PLAYBACK_EVENT_TYPE_REPLICA_REMOVED,
  PLAYBACK_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
  ROOT_CAUSE_CLASS_UNKNOWN,
  ROOT_CAUSE_CLASS_STARTUP,
  ROOT_CAUSE_CLASS_DISCOVERY,
  ROOT_CAUSE_CLASS_TOPOLOGY,
  ROOT_CAUSE_CLASS_LOAD,
  ROOT_CAUSE_CLASS_CDC,
  ROOT_CAUSE_CLASS_CACHE,
  FIRST_FAULT_MARKER_QUEUE_PRESSURE,
  FIRST_FAULT_MARKER_ATTEMPT_ERRORS,
  FIRST_FAULT_MARKER_HARD_FAILURE,
  LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
  LOAD_WAIT_REASON_NODE_ADMISSION_BLOCKED,
  LOAD_WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE,
  LOAD_WAIT_REASON_TIMEOUT_WAITS,
  LOAD_WAIT_REASON_QUEUE_CAPACITY_REJECTED,
  READINESS_REASON_MAX_NODES,
  READINESS_REASON_MAX_PER_NODE,
  AFFECTED_NODE_ID_LIMIT,
  FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
  FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
  FAILURE_CLASS_DISCOVERY_UNAVAILABLE,
  FAILURE_CLASS_TOPOLOGY_UNSTABLE,
  FAILURE_CLASS_LOAD_PRESSURE,
  FAILURE_CLASS_CDC_DEGRADED,
  FAILURE_CLASS_CACHE_STALE,
  FAILURE_CLASS_VERIFICATION_MISMATCH,
  FAILURE_CLASS_UNKNOWN,
  FAILURE_CLASS_CONFIDENCE_HIGH,
  FAILURE_CLASS_CONFIDENCE_MEDIUM,
  FAILURE_CLASS_CONFIDENCE_LOW,
  TRIAGE_CLUSTER_STAGE_LIMIT,
  TRIAGE_RECENT_TOPOLOGY_EVENT_LIMIT,
  TRIAGE_TOP_LOAD_NODE_LIMIT,
  STABILITY_GATE_STATUS_OPEN,
  STABILITY_GATE_STATUS_CLOSED,
  STABILITY_GATE_STATUS_NOT_APPLICABLE,
  STABILITY_GATE_STATUS_UNKNOWN,
  STABILITY_GATE_TYPE_FAILOVER,
  STABILITY_GATE_TYPE_CONVERGENCE,
  STABILITY_GATE_TYPE_RESTART_RECOVERY,
  STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PENDING_ACK_NODES,
  STABILITY_GATE_BLOCKER_BLOCKED_NODES,
  STABILITY_GATE_BLOCKER_CLOSURE_RECORD,
  STABILITY_GATE_BLOCKER_STARTUP_READINESS,
  SCENARIO_NAME_FRAGMENT_RESTART,
  LOAD_WAIT_REASON_KEYS,
  LOAD_REASON_ROOT_CAUSE_CLASS_BY_REASON,
  toWorkspaceRelative,
  sanitizePathSegment,
  sliceLogTail,
  parseStructuredLogLine,
  resolveStructuredLogMessage,
  resolveStructuredLogTimestamp,
  sanitizeStructuredDecisionArtifact,
  extractDecisionArtifactsFromLogContent,
  resolveRoutingDiagnostics,
  resolveFailureDiagnostics,
  addNormalizedReasonCount,
  deriveReasonCountsFromPublicationConvergence,
  isRecord,
  normalizeActiveGateReadinessDelay,
  appendActiveGateReadinessDelaySignals,
  appendReadinessFailureSignals,
  normalizeReadinessFailure,
  resolveReadinessFailure,
  resolveReadinessFailureGuidance,
  normalizeNonNegativeCount,
  resolveCanonicalFailedOperationCount,
  resolveFailureReasonCounts,
  buildTopReasonCounts,
  buildDominantReason,
  mergeReasonCounts,
  normalizeDistinctStringArray,
  buildPriorityRecoveryCorrelationKey,
  normalizePriorityRecoverySemanticStateId,
  inferPriorityRecoverySemanticState,
  normalizePriorityRecoveryDecisionSnapshots,
  mergePriorityRecoveryDecisionSnapshots,
  normalizePriorityRecoveryInvariants,
  mergePriorityRecoveryInvariants,
  summarizePriorityRecoveryDecisionSnapshots,
  deriveReasonCountsFromLoadMetrics,
  deriveReasonCountsFromReadiness,
  resolveRootCauseClassFromReason,
  resolveRootCauseClass,
  resolveSummaryRootCauseClass,
  normalizeAffectedNodeIds,
  buildMarker,
  resolveLoadMetricsFromPlaybackEvent,
  resolveLoadQueuePressureSignalCount,
  buildFirstFaultTimelineFromPlaybackEvents,
  buildPlaybackEventSummary,
  buildReadinessFromPlaybackEvents,
  cloneJsonValue,
  resolvePlaybackPublicationConvergence,
  resolvePlaybackPublishedMembershipObservation,
  scorePlaybackActiveGateDetails,
  buildPlaybackControlPlaneFallback,
  buildRestartBoundariesFromPlaybackEvents,
  collectPlaybackEventInsights,
  resolveReadinessSnapshot,
  resolveControlPlaneDiagnostics,
  mergeTransitionHistory,
  resolveControlSnapshot,
  resolveAdminQueryTraceByNodeId,
  resolveLoadMetrics,
  extractNodeIdsFromText,
  resolveRelevantNodeIds,
  resolveTraceFailureTimestampMs,
  toIsoTimestamp,
  resolveWorkflowRelevantNodeIds,
  resolveWorkflowStartTimestampMs,
  resolveWorkflowDeniedTimestampMs,
  resolveWorkflowFailureTimestampMs,
  buildNodeTimelineCorrelation,
  buildTimelineCorrelationByNodeId,
  collectScenarioLogArtifacts,
  mergeByNodeIdMaps,
  mergeControlPlaneDiagnostics,
  mergeControlSnapshotByNodeId,
  buildFocusedNodeDiagnostics,
  resolveFirstFaultTimeline,
  mapFirstFaultMarkerToReason,
  resolveDominantReasonFromFirstFaultTimeline,
  buildFailureArtifact,
  buildPublicationConvergenceSummary,
  collectReadinessReasonCodes,
  buildRecoveryReadinessSummary,
  buildStabilityGate,
  countRestartBoundaries,
  buildConvergenceStabilityGate,
  buildFailoverStabilityGate,
  buildRestartRecoveryStabilityGate,
  buildStabilityGates,
  buildFailureClassification,
  buildScenarioFailureBundle,
  buildTriageLoadSummary,
  resolvePartitioningDiagnosticsForTriage,
  buildRoutingDiagnosticsSummary,
  buildScenarioTriageSummary,
  renderScenarioTriageSummaryMarkdown,
  formatList,
  formatCountEntries,
  formatPartitioningConvergenceEvaluations,
  formatStabilityGate,
  formatStabilityGateSummary,
  formatReasonPartitionEntries,
  formatPriorityRecoveryInvariantFailures,
  formatPriorityRecoveryPartitionBlockerHistory,
  formatPriorityRecoveryPartitionSemanticStateHistory,
  formatPriorityRecoveryPartitionWitnesses,
  formatActiveGateProgress,
  formatActiveGateReadinessDelay,
  formatReadinessFailure,
  formatReadinessDimensions,
  formatPublicationMode,
  formatHeartbeatPublication,
  formatNodeLiveness,
  formatTimelineCorrelation,
  formatReadinessTransition,
  formatWorkflowAdmission,
  formatTimeoutClassificationEntry,
  formatNodeClientChannelMetrics,
  formatNodeClientChannelState,
  formatNodeDiagnosticLoadMetrics,
  formatRoutingDiagnostics,
  formatAdminQueryTraceEntry,
  formatFirstFaultTimeline,
  renderScenarioFailureBundleMarkdown,
  buildRunFailureBundle,
  renderRunFailureBundleMarkdown,
};
