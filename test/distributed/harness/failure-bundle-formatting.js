import {
  FAILURE_BUNDLE_SCHEMA_VERSION,
  ZERO,
  MARKDOWN_SECTION_BREAK,
  UNKNOWN_VALUE,
  NO_PROGRESS_REASON_CODE,
  isRecord,
} from './failure-bundle-artifact-foundation.js';
import {
  normalizeActiveGateReadinessDelay,
  normalizeReadinessFailure,
} from './failure-bundle-publication-reason-counts.js';
import {
  formatList,
  formatObservedList,
  formatCountEntries,
  formatStabilityGateSummary,
  formatReasonPartitionEntries,
  formatProjectionDiagnostics,
  formatPriorityRecoveryInvariantFailures,
} from './failure-bundle-triage-summary.js';
import {
  CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON,
} from '../../../src/diagnostics/control-plane-quiescence-snapshot.js';
import {
  formatPriorityRecoveryPartitionBlockerHistory,
  formatPriorityRecoveryPartitionSemanticStateHistory,
  formatPriorityRecoveryPartitionWitnesses,
} from './failure-bundle-priority-recovery-formatters.js';

import {formatLogWindowCoverageVerdict} from './failure-bundle-artifact-foundation.js';
import {renderLogWindowSections} from './failure-bundle-log-window-markdown.js';

const NODE_DIAGNOSTICS_LINE_LATEST_STARTUP_FAILURE =
  '- Latest Startup Failure: ';
const NODE_DIAGNOSTICS_LINE_LATEST_RETRYABLE_JOIN_RESUME =
  '- Latest Retryable Join Resume: ';

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
  const parts = [
    'state=' + String(quiescence.state || UNKNOWN_VALUE),
    'blocker=' + String(quiescence.canonicalBlocker || UNKNOWN_VALUE),
    'reasons=' + formatList(quiescence.reasonCodes),
  ];
  const candidateWindowResetReason = String(
    quiescence.candidateWindowReset?.reason || '',
  ).trim();
  if (
    candidateWindowResetReason.length > ZERO &&
    candidateWindowResetReason !==
      CONTROL_PLANE_QUIESCENCE_CANDIDATE_WINDOW_RESET_REASON.NONE
  ) {
    parts.push('candidateWindowReset=' + candidateWindowResetReason);
  }
  return parts.join(', ');
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
      '- Log Window Coverage: ' +
        formatLogWindowCoverageVerdict(bundle.summary.logWindowCoverage),
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
    const activeGate = bundle.publicationConvergence.activeGate || null;
    const activeGateBlockerEntries = Array.isArray(
      activeGate?.blockerHistory,
    ) ?
      activeGate.blockerHistory :
      [];
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
              activeGate?.bestProgress,
            ),
          '- Active Gate No-Progress: ' +
            (activeGate ?
              'attemptsSinceProgress=' +
                String(
                  activeGate.attemptsSinceProgress ?? UNKNOWN_VALUE,
                ) +
                '/' +
                String(activeGate.maxAttempts ?? UNKNOWN_VALUE) +
                ', stalled=' +
                String(activeGate.state === 'stalled') :
              UNKNOWN_VALUE),
          '- Active Gate Blocker History: ' +
            (activeGateBlockerEntries.length > ZERO ?
              activeGateBlockerEntries
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
          ...(bundle.publicationConvergence.activeGateSnapshotHistorical ===
          true ?
            [
              '- Active Gate Snapshot Provenance: historical_startup (stage=' +
                String(
                  bundle.publicationConvergence.activeGateSnapshotStage ||
                    UNKNOWN_VALUE,
                ) +
                ', observedAt=' +
                String(
                  bundle.publicationConvergence.activeGateObservedAt ||
                    UNKNOWN_VALUE,
                ) +
                ')',
            ] :
            []),
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

  sections.push(...renderLogWindowSections(bundle));

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
            if (nodeDiagnostic?.decisionArtifacts?.latestStartupFailure) {
              lines.push(
                NODE_DIAGNOSTICS_LINE_LATEST_STARTUP_FAILURE +
                  JSON.stringify(
                    nodeDiagnostic.decisionArtifacts.latestStartupFailure,
                  ),
              );
            }
            if (nodeDiagnostic?.decisionArtifacts?.latestRetryableJoinResume) {
              lines.push(
                NODE_DIAGNOSTICS_LINE_LATEST_RETRYABLE_JOIN_RESUME +
                  JSON.stringify(
                    nodeDiagnostic.decisionArtifacts
                      .latestRetryableJoinResume,
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

export {
  buildRunFailureBundle,
  renderRunFailureBundleMarkdown,
  renderScenarioFailureBundleMarkdown,
};
