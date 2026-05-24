import {
  normalizePriorityRecoveryActiveGateSnapshot,
} from './active-gate-contract.js';
import {FAILURE_BUNDLE_SEGMENT_2} from './failure-bundle-segment-2.js';
const {
  ZERO,
  UNKNOWN_VALUE,
  NODE_ID_ERROR_PATTERN,
  resolveFailureDiagnostics,
  isRecord,
  normalizeNonNegativeCount,
  normalizeDistinctStringArray,
  normalizePriorityRecoveryDecisionSnapshots,
  mergePriorityRecoveryDecisionSnapshots,
  normalizePriorityRecoveryInvariants,
  mergePriorityRecoveryInvariants,
} = FAILURE_BUNDLE_SEGMENT_2;

const DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD = Object.freeze({
  ACTIVE_GATE: 'activeGate',
  ACTIVE_GATE_PROGRESS: 'activeGateProgress',
  ACTIVE_GATE_ADMISSION_STATE: 'activeGateAdmissionState',
  ACTIVE_GATE_SNAPSHOT_COVERAGE: 'activeGateSnapshotCoverage',
  PRIORITY_RECOVERY_INVARIANTS: 'priorityRecoveryInvariants',
});
const DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD = Object.freeze({
  PUBLICATION_CONVERGENCE: 'publicationConvergence',
  PUBLICATION_CONVERGENCE_GATE: 'publicationConvergenceGate',
  PRIORITY_RECOVERY_OBSERVATION: 'priorityRecoveryObservation',
  PRIORITY_RECOVERY_DECISION_SNAPSHOTS: 'priorityRecoveryDecisionSnapshots',
  PRIORITY_RECOVERY_INVARIANTS: 'priorityRecoveryInvariants',
  STARTUP_RECOVERY: 'startupRecovery',
});
const ACTIVE_GATE_PUBLICATION_GATE_READY_BLOCKER = 'ready';
const EMPTY_STRING = '';
const ONE = 1;
const FAILURE_BUNDLE_SEGMENT_TYPE = Object.freeze({
  OBJECT: 'object',
  STRING: 'string',
});
const WORKFLOW_DENIED_TRANSITION_STATE = Object.freeze({
  BLOCKED: 'blocked',
  DEFERRED: 'deferred',
});

function resolveReadinessSnapshot(entry, playbackReadiness = null) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const failedArtifacts = diagnostics?.failedPhase?.artifacts || {};
  const readinessTimeline = Array.isArray(failedArtifacts.readinessTimeline) ?
    failedArtifacts.readinessTimeline :
    Array.isArray(failedArtifacts?.gateResult?.readinessTimeline) ?
      failedArtifacts.gateResult.readinessTimeline :
      [];
  const artifactNodeReasonsByNodeId = isRecord(
    failedArtifacts.nodeReasonsByNodeId,
  ) ?
    failedArtifacts.nodeReasonsByNodeId :
    null;
  const failureNodeReasonsByNodeId = isRecord(
    diagnostics?.failure?.nodeReasonsByNodeId,
  ) ?
    diagnostics.failure.nodeReasonsByNodeId :
    null;
  const playbackNodeReasonsByNodeId = isRecord(
    playbackReadiness?.nodeReasonsByNodeId,
  ) ?
    playbackReadiness.nodeReasonsByNodeId :
    null;
  const nodeReasonsByNodeId =
    failureNodeReasonsByNodeId ||
    artifactNodeReasonsByNodeId ||
    playbackNodeReasonsByNodeId ||
    null;
  return {
    nodeReasonsByNodeId,
    strictDiscoveryGate: failedArtifacts.strictDiscoveryGate || null,
    sutLoadDiscovery: failedArtifacts.sutLoadDiscovery || null,
    lastReadinessTimelineEntry:
      readinessTimeline.length > ZERO ?
        readinessTimeline[readinessTimeline.length - ONE] :
        playbackReadiness?.lastReadinessTimelineEntry || null,
  };
}

function resolveDirectActiveGateDiagnostics(diagnostics) {
  if (!isRecord(diagnostics)) {
    return null;
  }
  const activeGate = normalizePriorityRecoveryActiveGateSnapshot({
    activeGate: isRecord(
      diagnostics[DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE],
    ) ?
      diagnostics[DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE] :
      null,
    activeGateProgress: isRecord(
      diagnostics[DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE_PROGRESS],
    ) ?
      diagnostics[DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE_PROGRESS] :
      null,
    activeGateAdmissionState: isRecord(
      diagnostics[
        DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE_ADMISSION_STATE
      ],
    ) ?
      diagnostics[
        DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE_ADMISSION_STATE
      ] :
      null,
  });
  const directActiveGateDiagnostics = {
    ...(activeGate ? {activeGate} : {}),
  };
  if (
    isRecord(
      diagnostics[
        DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE_SNAPSHOT_COVERAGE
      ],
    )
  ) {
    directActiveGateDiagnostics.activeGateSnapshotCoverage =
      diagnostics[
        DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.ACTIVE_GATE_SNAPSHOT_COVERAGE
      ];
  }
  if (
    isRecord(
      diagnostics[
        DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.PRIORITY_RECOVERY_INVARIANTS
      ],
    )
  ) {
    directActiveGateDiagnostics.priorityRecoveryInvariants =
      normalizePriorityRecoveryInvariants(
        diagnostics[
          DIRECT_ACTIVE_GATE_DIAGNOSTIC_FIELD.PRIORITY_RECOVERY_INVARIANTS
        ],
      );
  }
  return Object.values(directActiveGateDiagnostics).some((value) => {
    if (Array.isArray(value)) {
      return value.length > ZERO;
    }
    return value !== null && value !== undefined;
  }) ?
    directActiveGateDiagnostics :
    null;
}

function resolveDirectControlPlaneDiagnostics(diagnostics) {
  if (!isRecord(diagnostics)) {
    return null;
  }
  const directDiagnostics = {};
  if (
    isRecord(
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PUBLICATION_CONVERGENCE
      ],
    )
  ) {
    directDiagnostics.publicationConvergence =
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PUBLICATION_CONVERGENCE
      ];
  }
  if (
    isRecord(
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PUBLICATION_CONVERGENCE_GATE
      ],
    )
  ) {
    directDiagnostics.publicationConvergenceGate =
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PUBLICATION_CONVERGENCE_GATE
      ];
  }
  if (
    isRecord(
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PRIORITY_RECOVERY_OBSERVATION
      ],
    )
  ) {
    directDiagnostics.priorityRecoveryObservation =
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PRIORITY_RECOVERY_OBSERVATION
      ];
  }
  if (
    isRecord(
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD
          .PRIORITY_RECOVERY_DECISION_SNAPSHOTS
      ],
    )
  ) {
    directDiagnostics.priorityRecoveryDecisionSnapshots =
      normalizePriorityRecoveryDecisionSnapshots(
        diagnostics[
          DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD
            .PRIORITY_RECOVERY_DECISION_SNAPSHOTS
        ],
      );
  }
  if (
    isRecord(
      diagnostics[
        DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PRIORITY_RECOVERY_INVARIANTS
      ],
    )
  ) {
    directDiagnostics.priorityRecoveryInvariants =
      normalizePriorityRecoveryInvariants(
        diagnostics[
          DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.PRIORITY_RECOVERY_INVARIANTS
        ],
      );
  }
  if (
    isRecord(
      diagnostics[DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.STARTUP_RECOVERY],
    )
  ) {
    directDiagnostics.startupRecovery =
      diagnostics[DIRECT_CONTROL_PLANE_DIAGNOSTIC_FIELD.STARTUP_RECOVERY];
  }
  return Object.keys(directDiagnostics).length > ZERO ?
    directDiagnostics :
    null;
}

function buildDirectActiveGatePublicationGate(activeGate) {
  const progress = isRecord(activeGate?.progress) ?
    activeGate.progress :
    null;
  if (!progress) {
    return null;
  }
  const publicationStatus = String(progress.publicationStatus || '').trim();
  const recoveryProtocolState = String(
    progress.recoveryProtocolState || '',
  ).trim();
  if (
    publicationStatus.length === ZERO &&
    recoveryProtocolState.length === ZERO
  ) {
    return null;
  }
  const reasonCodes = normalizeDistinctStringArray(progress.gateReasons);
  const pendingAckCount =
    normalizeNonNegativeCount(progress.pendingAckCount) || ZERO;
  const missingPublishedCount =
    normalizeNonNegativeCount(progress.missingPublishedCount) || ZERO;
  const priorityBlockedPartitionCount =
    normalizeNonNegativeCount(progress.priorityBlockedPartitionCount) ||
    normalizeNonNegativeCount(progress.priorityRecoveryBlockedPartitionCount) ||
    ZERO;
  const prioritySpreadGap =
    normalizeNonNegativeCount(progress.prioritySpreadGap) || ZERO;
  const prioritySpreadPending =
    progress.prioritySpreadSatisfied === false ||
    priorityBlockedPartitionCount > ZERO ||
    prioritySpreadGap > ZERO;
  const ready =
    activeGate.ready === true ||
    (
      progress.blockerSignature === ACTIVE_GATE_PUBLICATION_GATE_READY_BLOCKER &&
      pendingAckCount === ZERO &&
      missingPublishedCount === ZERO &&
      reasonCodes.length === ZERO &&
      prioritySpreadPending === false
    );
  return {
    publicationEpoch:
      normalizeNonNegativeCount(progress.publicationEpoch) || null,
    publicationStatus:
      publicationStatus.length > ZERO ? publicationStatus : null,
    recoveryProtocolState:
      recoveryProtocolState.length > ZERO ? recoveryProtocolState : null,
    reasonCodes,
    pendingAckNodeIds: [],
    pendingAckCount,
    missingPublishedNodeIds: [],
    missingPublishedCount,
    publicationPending: pendingAckCount > ZERO,
    prioritySpreadPending,
    ready,
    priorityPartitionSummary: {
      satisfied: prioritySpreadPending === false,
      blockedPartitionCount: priorityBlockedPartitionCount,
      blockedPartitions: [],
      largestSpreadGap: prioritySpreadGap,
      totalSpreadGap: prioritySpreadGap,
    },
  };
}

function buildDirectActiveGatePublicationConvergence(
  activeGate,
  publicationGate,
) {
  if (!isRecord(publicationGate)) {
    return null;
  }
  const progress = isRecord(activeGate?.progress) ?
    activeGate.progress :
    null;
  return {
    publicationEpoch: publicationGate.publicationEpoch,
    status: publicationGate.publicationStatus,
    publicationStatus: publicationGate.publicationStatus,
    recoveryProtocolState: publicationGate.recoveryProtocolState,
    priorityRecoveryReasonCodes: publicationGate.reasonCodes,
    priorityPartitionSummary: publicationGate.priorityPartitionSummary,
    publishedActiveNodeIds: normalizeDistinctStringArray(
      progress?.selectedPublishedActiveNodeIds,
    ),
    pendingAckNodeIds: publicationGate.pendingAckNodeIds,
    pendingAckCount: publicationGate.pendingAckCount,
    missingPublishedNodeIds: publicationGate.missingPublishedNodeIds,
    missingPublishedCount: publicationGate.missingPublishedCount,
    publicationPending: publicationGate.publicationPending,
    prioritySpreadPending: publicationGate.prioritySpreadPending,
    publicationRecoveryGate: publicationGate,
  };
}

function resolveControlPlaneDiagnostics(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const directActiveGateDiagnostics =
    resolveDirectActiveGateDiagnostics(diagnostics);
  const directActiveGatePublicationGate = buildDirectActiveGatePublicationGate(
    directActiveGateDiagnostics?.activeGate,
  );
  const directActiveGatePublicationConvergence =
    buildDirectActiveGatePublicationConvergence(
      directActiveGateDiagnostics?.activeGate,
      directActiveGatePublicationGate,
    );
  const directLedgerSnapshotsByNodeId =
    diagnostics?.rootCauseBundle?.controlPlaneLedgerSnapshotsByNodeId &&
    typeof diagnostics.rootCauseBundle.controlPlaneLedgerSnapshotsByNodeId ===
      'object' ?
      diagnostics.rootCauseBundle.controlPlaneLedgerSnapshotsByNodeId :
      null;
  const snapshotsByNodeId = resolveControlSnapshot(entry);
  const directDiagnosticsFromEntry = isRecord(
    entry?.details?.diagnostics?.controlPlaneDiagnostics,
  ) ?
    entry.details.diagnostics.controlPlaneDiagnostics :
    null;
  const directDiagnosticsFromRootCause = isRecord(
    diagnostics?.rootCauseBundle?.controlPlaneDiagnostics,
  ) ?
    diagnostics.rootCauseBundle.controlPlaneDiagnostics :
    null;
  const directDiagnosticsFromTopLevel =
    resolveDirectControlPlaneDiagnostics(diagnostics);
  const directDiagnostics =
    directDiagnosticsFromEntry ||
    directDiagnosticsFromRootCause ||
    (isRecord(diagnostics?.controlPlaneDiagnostics) ?
      diagnostics.controlPlaneDiagnostics :
      null) ||
    directDiagnosticsFromTopLevel;
  const directDiagnosticSnapshotNodeIdCandidate = String(
    diagnostics?.snapshotNodeId || directDiagnostics?.snapshotNodeId || '',
  ).trim();
  const directDiagnosticSnapshotNodeId =
    directDiagnosticSnapshotNodeIdCandidate.length > ZERO ?
      directDiagnosticSnapshotNodeIdCandidate :
      UNKNOWN_VALUE;
  const directDiagnosticSources = directDiagnostics ?
    {
      [directDiagnosticSnapshotNodeId]: {
        controlPlaneDiagnostics: directDiagnostics,
      },
    } :
    null;
  const publicationModeByNodeId = {};
  const heartbeatPublicationByNodeId = {};
  let publicationConvergence =
    directDiagnostics?.publicationConvergence &&
    typeof directDiagnostics.publicationConvergence ===
      FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT ?
      directDiagnostics.publicationConvergence :
      null;
  let priorityRecoveryObservation =
    directDiagnostics?.priorityRecoveryObservation &&
    typeof directDiagnostics.priorityRecoveryObservation ===
      FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT ?
      directDiagnostics.priorityRecoveryObservation :
      null;
  let priorityRecoveryDecisionSnapshots =
    normalizePriorityRecoveryDecisionSnapshots(
      directDiagnostics?.priorityRecoveryDecisionSnapshots,
    );
  let priorityRecoveryInvariants = normalizePriorityRecoveryInvariants(
    directDiagnostics?.priorityRecoveryInvariants,
  );
  const readinessByNodeId = {};
  const nodeLivenessByNodeId = {};
  const readinessTransitionsByNodeId = {};
  const placementEligibilityByNodeId = {};
  const workflowAdmissionsByWorkflowId = {};
  const timeoutClassifications = [];
  const participationDecisions = [];
  const authoritativeReadinessRepairs = [];
  const recoveryEpochsByNodeId = {};
  const controlPlaneOperations = [];
  let startupRecovery =
    directDiagnostics?.startupRecovery &&
    typeof directDiagnostics.startupRecovery ===
      FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT ?
      directDiagnostics.startupRecovery :
      null;

  const diagnosticSources =
    directLedgerSnapshotsByNodeId &&
    Object.keys(directLedgerSnapshotsByNodeId).length > ZERO ?
      directLedgerSnapshotsByNodeId :
      snapshotsByNodeId && Object.keys(snapshotsByNodeId).length > ZERO ?
        snapshotsByNodeId :
        directDiagnosticSources;

  if (
    diagnosticSources &&
    typeof diagnosticSources === FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
  ) {
    for (const [snapshotNodeId, snapshot] of Object.entries(
      diagnosticSources,
    )) {
      const controlPlaneDiagnostics =
        snapshot?.controlPlaneDiagnostics &&
        typeof snapshot.controlPlaneDiagnostics ===
          FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT ?
          snapshot.controlPlaneDiagnostics :
          null;
      if (!controlPlaneDiagnostics) {
        continue;
      }

      if (
        controlPlaneDiagnostics.publicationMode &&
        typeof controlPlaneDiagnostics.publicationMode ===
          FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
      ) {
        publicationModeByNodeId[snapshotNodeId] =
          controlPlaneDiagnostics.publicationMode;
      }
      if (
        !publicationConvergence &&
        controlPlaneDiagnostics.publicationConvergence &&
        typeof controlPlaneDiagnostics.publicationConvergence ===
          FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
      ) {
        publicationConvergence = controlPlaneDiagnostics.publicationConvergence;
      }
      if (
        !priorityRecoveryObservation &&
        controlPlaneDiagnostics.priorityRecoveryObservation &&
        typeof controlPlaneDiagnostics.priorityRecoveryObservation ===
          FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
      ) {
        priorityRecoveryObservation =
          controlPlaneDiagnostics.priorityRecoveryObservation;
      }
      priorityRecoveryDecisionSnapshots =
        mergePriorityRecoveryDecisionSnapshots(
          priorityRecoveryDecisionSnapshots,
          controlPlaneDiagnostics.priorityRecoveryDecisionSnapshots,
        );
      priorityRecoveryInvariants = mergePriorityRecoveryInvariants(
        priorityRecoveryInvariants,
        controlPlaneDiagnostics.priorityRecoveryInvariants,
      );
      if (
        controlPlaneDiagnostics.heartbeatPublication &&
        typeof controlPlaneDiagnostics.heartbeatPublication ===
          FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
      ) {
        heartbeatPublicationByNodeId[snapshotNodeId] =
          controlPlaneDiagnostics.heartbeatPublication;
      }
      if (
        !startupRecovery &&
        controlPlaneDiagnostics.startupRecovery &&
        typeof controlPlaneDiagnostics.startupRecovery ===
          FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
      ) {
        startupRecovery = controlPlaneDiagnostics.startupRecovery;
      }

      const readiness =
        controlPlaneDiagnostics.readinessByNodeId &&
        typeof controlPlaneDiagnostics.readinessByNodeId === 'object' ?
          controlPlaneDiagnostics.readinessByNodeId :
          {};
      Object.assign(readinessByNodeId, readiness);

      const nodeLiveness =
        controlPlaneDiagnostics.nodeLivenessByNodeId &&
        typeof controlPlaneDiagnostics.nodeLivenessByNodeId === 'object' ?
          controlPlaneDiagnostics.nodeLivenessByNodeId :
          {};
      Object.assign(nodeLivenessByNodeId, nodeLiveness);

      const readinessTransitions =
        controlPlaneDiagnostics.readinessTransitionsByNodeId &&
        typeof controlPlaneDiagnostics.readinessTransitionsByNodeId === 'object' ?
          controlPlaneDiagnostics.readinessTransitionsByNodeId :
          {};
      for (const [nodeId, transitions] of Object.entries(
        readinessTransitions,
      )) {
        const existing = readinessTransitionsByNodeId[nodeId] || [];
        readinessTransitionsByNodeId[nodeId] = mergeTransitionHistory(
          existing,
          transitions,
        );
      }

      const placement =
        controlPlaneDiagnostics.placementEligibilityByNodeId &&
        typeof controlPlaneDiagnostics.placementEligibilityByNodeId === 'object' ?
          controlPlaneDiagnostics.placementEligibilityByNodeId :
          {};
      Object.assign(placementEligibilityByNodeId, placement);

      const workflows =
        controlPlaneDiagnostics.workflowAdmissionsByWorkflowId &&
        typeof controlPlaneDiagnostics.workflowAdmissionsByWorkflowId ===
          'object' ?
          controlPlaneDiagnostics.workflowAdmissionsByWorkflowId :
          {};
      Object.assign(workflowAdmissionsByWorkflowId, workflows);

      const timeouts = Array.isArray(
        controlPlaneDiagnostics.timeoutClassifications,
      ) ?
        controlPlaneDiagnostics.timeoutClassifications :
        [];
      for (const timeout of timeouts) {
        if (
          !timeout ||
          typeof timeout !== FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
        ) {
          continue;
        }
        timeoutClassifications.push({
          snapshotNodeId,
          ...timeout,
        });
      }

      const decisions = Array.isArray(
        controlPlaneDiagnostics.participationDecisions,
      ) ?
        controlPlaneDiagnostics.participationDecisions :
        [];
      for (const decision of decisions) {
        if (
          !decision ||
          typeof decision !== FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
        ) {
          continue;
        }
        participationDecisions.push({
          snapshotNodeId,
          ...decision,
        });
      }

      const repairs = Array.isArray(
        controlPlaneDiagnostics.authoritativeReadinessRepairs,
      ) ?
        controlPlaneDiagnostics.authoritativeReadinessRepairs :
        [];
      for (const repair of repairs) {
        if (
          !repair ||
          typeof repair !== FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
        ) {
          continue;
        }
        authoritativeReadinessRepairs.push({
          snapshotNodeId,
          ...repair,
        });
      }

      const recoveryEpochs =
        controlPlaneDiagnostics.recoveryEpochsByNodeId &&
        typeof controlPlaneDiagnostics.recoveryEpochsByNodeId ===
          FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT ?
          controlPlaneDiagnostics.recoveryEpochsByNodeId :
          {};
      for (const [nodeId, epochs] of Object.entries(recoveryEpochs)) {
        const existing = Array.isArray(recoveryEpochsByNodeId[nodeId]) ?
          recoveryEpochsByNodeId[nodeId] :
          [];
        recoveryEpochsByNodeId[nodeId] = [
          ...existing,
          ...(Array.isArray(epochs) ?
            epochs.map((epoch) => ({
              snapshotNodeId,
              ...epoch,
            })) :
            []),
        ];
      }

      const operations = Array.isArray(
        controlPlaneDiagnostics.controlPlaneOperations,
      ) ?
        controlPlaneDiagnostics.controlPlaneOperations :
        [];
      for (const operation of operations) {
        if (
          !operation ||
          typeof operation !== FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
        ) {
          continue;
        }
        controlPlaneOperations.push({
          snapshotNodeId,
          ...operation,
        });
      }
    }
  }

  if (
    Object.keys(publicationModeByNodeId).length === ZERO &&
    publicationConvergence === null &&
    Object.keys(heartbeatPublicationByNodeId).length === ZERO &&
    Object.keys(readinessByNodeId).length === ZERO &&
    Object.keys(nodeLivenessByNodeId).length === ZERO &&
    Object.keys(readinessTransitionsByNodeId).length === ZERO &&
    Object.keys(placementEligibilityByNodeId).length === ZERO &&
    Object.keys(workflowAdmissionsByWorkflowId).length === ZERO &&
    timeoutClassifications.length === ZERO &&
    participationDecisions.length === ZERO &&
    authoritativeReadinessRepairs.length === ZERO &&
    Object.keys(recoveryEpochsByNodeId).length === ZERO &&
    controlPlaneOperations.length === ZERO &&
    startupRecovery === null &&
    priorityRecoveryObservation === null &&
    priorityRecoveryDecisionSnapshots === null &&
    priorityRecoveryInvariants === null &&
    directDiagnostics === null &&
    directActiveGateDiagnostics === null &&
    directActiveGatePublicationGate === null &&
    directActiveGatePublicationConvergence === null
  ) {
    return null;
  }

  return {
    publicationModeByNodeId,
    publicationConvergence,
    heartbeatPublicationByNodeId,
    readinessByNodeId,
    nodeLivenessByNodeId,
    readinessTransitionsByNodeId,
    placementEligibilityByNodeId,
    workflowAdmissionsByWorkflowId,
    timeoutClassifications,
    participationDecisions,
    authoritativeReadinessRepairs,
    recoveryEpochsByNodeId,
    controlPlaneOperations,
    startupRecovery,
    priorityRecoveryObservation,
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryInvariants,
    ...(directDiagnostics || {}),
    ...(directActiveGatePublicationConvergence ?
      {publicationConvergence: directActiveGatePublicationConvergence} :
      {}),
    ...(directActiveGatePublicationGate ?
      {publicationConvergenceGate: directActiveGatePublicationGate} :
      {}),
    ...(directActiveGateDiagnostics || {}),
  };
}

function mergeTransitionHistory(existingEntries, nextEntries) {
  const merged = [];
  const seen = new Set();
  for (const entry of [
    ...(Array.isArray(existingEntries) ? existingEntries : []),
    ...(Array.isArray(nextEntries) ? nextEntries : []),
  ]) {
    if (!entry || typeof entry !== FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT) {
      continue;
    }
    const signature = JSON.stringify({
      nodeId: entry.nodeId || null,
      observedAtMs: Number(entry.observedAtMs || ZERO),
      serveEligible: entry.serveEligible === true,
      repairEligible: entry.repairEligible === true,
      reasonCodes: Array.isArray(entry.reasonCodes) ? entry.reasonCodes : [],
    });
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    merged.push(entry);
  }
  merged.sort(
    (left, right) =>
      Number(left?.observedAtMs || ZERO) - Number(right?.observedAtMs || ZERO),
  );
  return merged;
}

function resolveControlSnapshot(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const snapshotsByNodeId = diagnostics?.rootCauseBundle?.snapshotsByNodeId;
  if (
    snapshotsByNodeId &&
    typeof snapshotsByNodeId === FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
  ) {
    return snapshotsByNodeId;
  }
  return null;
}

function resolveAdminQueryTraceByNodeId(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const traceByNodeId = diagnostics?.rootCauseBundle?.adminQueryTraceByNodeId;
  if (
    traceByNodeId &&
    typeof traceByNodeId === FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT
  ) {
    return traceByNodeId;
  }
  return null;
}

function resolveLoadMetrics(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  if (
    diagnostics?.loadMetrics &&
    typeof diagnostics.loadMetrics === FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT &&
    !Array.isArray(diagnostics.loadMetrics)
  ) {
    return diagnostics.loadMetrics;
  }
  if (
    entry?.loadMetrics &&
    typeof entry.loadMetrics === FAILURE_BUNDLE_SEGMENT_TYPE.OBJECT &&
    !Array.isArray(entry.loadMetrics)
  ) {
    return entry.loadMetrics;
  }
  return null;
}

function extractNodeIdsFromText(value) {
  const nodeIds = [];
  const matches = String(value || EMPTY_STRING).matchAll(
    NODE_ID_ERROR_PATTERN,
  );
  for (const match of matches) {
    const nodeId = String(match?.[ONE] || EMPTY_STRING);
    if (nodeId.length > ZERO) {
      nodeIds.push(nodeId);
    }
  }
  return nodeIds;
}

function resolveRelevantNodeIds(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const loadMetrics = resolveLoadMetrics(entry);
  const affectedNodeIds = Array.isArray(diagnostics?.failure?.affectedNodeIds) ?
    diagnostics.failure.affectedNodeIds :
    [];
  const nodeIds = new Set(affectedNodeIds);
  for (const snapshotNodeId of Object.keys(
    resolveControlSnapshot(entry) || {},
  )) {
    nodeIds.add(snapshotNodeId);
  }
  for (const traceNodeId of Object.keys(
    resolveAdminQueryTraceByNodeId(entry) || {},
  )) {
    nodeIds.add(traceNodeId);
  }
  const perNodeMetrics =
    loadMetrics?.perNode &&
    typeof loadMetrics.perNode === 'object' &&
    !Array.isArray(loadMetrics.perNode) ?
      loadMetrics.perNode :
      {};
  for (const [nodeId, nodeMetrics] of Object.entries(perNodeMetrics)) {
    const attemptedErrors = Number(nodeMetrics?.attemptErrors || ZERO);
    const dispatched = Number(nodeMetrics?.dispatched || ZERO);
    const success = Number(nodeMetrics?.success || ZERO);
    const rejected = Number(nodeMetrics?.rejected || ZERO);
    if (attemptedErrors > ZERO || dispatched > success || rejected > ZERO) {
      nodeIds.add(nodeId);
    }
  }
  const failedPhaseErrors = Array.isArray(diagnostics?.failedPhase?.errors) ?
    diagnostics.failedPhase.errors :
    [];
  const distinctErrors = Array.isArray(loadMetrics?.distinctErrors) ?
    loadMetrics.distinctErrors :
    [];
  for (const errorText of [...failedPhaseErrors, ...distinctErrors]) {
    for (const nodeId of extractNodeIdsFromText(errorText)) {
      nodeIds.add(nodeId);
    }
  }
  return [...nodeIds];
}

function resolveTraceFailureTimestampMs(entry) {
  const candidates = [
    entry?.erroredAtMs,
    entry?.timeoutAtMs,
    entry?.resolvedAtMs,
    entry?.startedAtMs,
  ];
  for (const candidate of candidates) {
    const timestampMs = Number(candidate);
    if (Number.isFinite(timestampMs) && timestampMs > ZERO) {
      return timestampMs;
    }
  }
  return null;
}

function toIsoTimestamp(timestampMs) {
  return Number.isFinite(timestampMs) ?
    new Date(timestampMs).toISOString() :
    null;
}

function resolveWorkflowRelevantNodeIds(workflow) {
  const nodeIds = new Set();
  const addValues = (values) => {
    for (const value of Array.isArray(values) ? values : []) {
      const normalized = String(value || '');
      if (normalized.length > ZERO) {
        nodeIds.add(normalized);
      }
    }
  };
  addValues(workflow?.candidateTargetNodeIds);
  addValues(workflow?.sourceRoutableNodeIds);
  addValues(workflow?.eligibleNodeIds);
  for (const entry of Array.isArray(workflow?.ineligibleNodes) ?
    workflow.ineligibleNodes :
    []) {
    const nodeId = String(entry?.nodeId || '');
    if (nodeId.length > ZERO) {
      nodeIds.add(nodeId);
    }
  }
  const sourceLeaderNodeId = String(workflow?.sourceLeaderNodeId || '');
  if (sourceLeaderNodeId.length > ZERO) {
    nodeIds.add(sourceLeaderNodeId);
  }
  return [...nodeIds];
}

function resolveWorkflowStartTimestampMs(workflow) {
  const candidates = [
    workflow?.topologySnapshotCapturedAt,
    workflow?.admissionDecisionAt,
    workflow?.failedAt,
  ];
  for (const candidate of candidates) {
    const timestampMs = Date.parse(candidate);
    if (Number.isFinite(timestampMs)) {
      return timestampMs;
    }
  }
  return null;
}

function resolveWorkflowDeniedTimestampMs(workflow) {
  const transitionState = String(
    workflow?.transitionState || EMPTY_STRING,
  ).toLowerCase();
  if (
    transitionState !== WORKFLOW_DENIED_TRANSITION_STATE.BLOCKED &&
    transitionState !== WORKFLOW_DENIED_TRANSITION_STATE.DEFERRED
  ) {
    return null;
  }
  const timestampMs = Date.parse(workflow?.admissionDecisionAt);
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function resolveWorkflowFailureTimestampMs(workflow) {
  const timestampMs = Date.parse(workflow?.failedAt);
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function buildNodeTimelineCorrelation(entry, controlPlaneDiagnostics, nodeId) {
  const traceEntries = Array.isArray(
    resolveAdminQueryTraceByNodeId(entry)?.[nodeId],
  ) ?
    resolveAdminQueryTraceByNodeId(entry)[nodeId] :
    [];
  const loadFailureEntries = traceEntries
    .filter(
      (traceEntry) =>
        traceEntry?.lane === 'load' && traceEntry?.outcome !== 'success',
    )
    .map((traceEntry) => ({
      timestampMs: resolveTraceFailureTimestampMs(traceEntry),
      traceEntry,
    }))
    .filter((candidate) => Number.isFinite(candidate.timestampMs))
    .sort((left, right) => left.timestampMs - right.timestampMs);
  const firstLoadFailure = loadFailureEntries[ZERO] || null;

  const readinessTransitions = Array.isArray(
    controlPlaneDiagnostics?.readinessTransitionsByNodeId?.[nodeId],
  ) ?
    [...controlPlaneDiagnostics.readinessTransitionsByNodeId[nodeId]] :
    [];
  readinessTransitions.sort(
    (left, right) =>
      Number(left?.observedAtMs || ZERO) - Number(right?.observedAtMs || ZERO),
  );
  const firstReadinessFlip = readinessTransitions[ZERO] || null;

  const relatedWorkflows = Object.values(
    controlPlaneDiagnostics?.workflowAdmissionsByWorkflowId || {},
  ).filter((workflow) =>
    resolveWorkflowRelevantNodeIds(workflow).includes(nodeId),
  );
  const splitStartTimestamps = relatedWorkflows
    .map((workflow) => resolveWorkflowStartTimestampMs(workflow))
    .filter((timestampMs) => Number.isFinite(timestampMs))
    .sort((left, right) => left - right);
  const splitDeniedTimestamps = relatedWorkflows
    .map((workflow) => resolveWorkflowDeniedTimestampMs(workflow))
    .filter((timestampMs) => Number.isFinite(timestampMs))
    .sort((left, right) => left - right);
  const splitFailureTimestamps = relatedWorkflows
    .map((workflow) => resolveWorkflowFailureTimestampMs(workflow))
    .filter((timestampMs) => Number.isFinite(timestampMs))
    .sort((left, right) => left - right);

  if (
    !firstLoadFailure &&
    !firstReadinessFlip &&
    splitStartTimestamps.length === ZERO &&
    splitDeniedTimestamps.length === ZERO &&
    splitFailureTimestamps.length === ZERO
  ) {
    return null;
  }

  const heartbeatAgeMsAtFirstReadinessFlip = Number(
    firstReadinessFlip?.rawInputs?.heartbeatAgeMs,
  );
  const readyLeaseLagMsAtFirstReadinessFlip = Number(
    firstReadinessFlip?.rawInputs?.readyLeaseLagMs,
  );
  return {
    firstLoadFailureAtMs: firstLoadFailure?.timestampMs || null,
    firstLoadFailureAt: toIsoTimestamp(firstLoadFailure?.timestampMs || null),
    firstLoadFailureQueryId: firstLoadFailure?.traceEntry?.queryId || null,
    firstReadinessFlipAtMs:
      Number(firstReadinessFlip?.observedAtMs || ZERO) || null,
    firstReadinessFlipAt: firstReadinessFlip?.observedAt || null,
    heartbeatAgeMsAtFirstReadinessFlip: Number.isFinite(
      heartbeatAgeMsAtFirstReadinessFlip,
    ) ?
      heartbeatAgeMsAtFirstReadinessFlip :
      null,
    readyLeaseLagMsAtFirstReadinessFlip: Number.isFinite(
      readyLeaseLagMsAtFirstReadinessFlip,
    ) ?
      readyLeaseLagMsAtFirstReadinessFlip :
      null,
    firstSplitStartedAtMs:
      splitStartTimestamps.length > ZERO ? splitStartTimestamps[ZERO] : null,
    firstSplitStartedAt:
      splitStartTimestamps.length > ZERO ?
        toIsoTimestamp(splitStartTimestamps[ZERO]) :
        null,
    firstSplitRejectedAtMs:
      splitDeniedTimestamps.length > ZERO ? splitDeniedTimestamps[ZERO] : null,
    firstSplitRejectedAt:
      splitDeniedTimestamps.length > ZERO ?
        toIsoTimestamp(splitDeniedTimestamps[ZERO]) :
        null,
    firstSplitFailedAtMs:
      splitFailureTimestamps.length > ZERO ?
        splitFailureTimestamps[ZERO] :
        null,
    firstSplitFailedAt:
      splitFailureTimestamps.length > ZERO ?
        toIsoTimestamp(splitFailureTimestamps[ZERO]) :
        null,
    relatedWorkflowIds: relatedWorkflows.map((workflow) => workflow.workflowId),
  };
}

function buildTimelineCorrelationByNodeId(
  entry,
  controlPlaneDiagnostics = null,
) {
  const correlations = {};
  for (const nodeId of resolveRelevantNodeIds(entry)) {
    const correlation = buildNodeTimelineCorrelation(
      entry,
      controlPlaneDiagnostics,
      nodeId,
    );
    if (correlation) {
      correlations[nodeId] = correlation;
    }
  }
  return correlations;
}

export {
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
};
