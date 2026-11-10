import {CONTROL_PLANE_READINESS_PLANNING_SHARED as SHARED} from './control-plane-readiness-planning-shared.js';
import {readWiredCollaborator} from './control-plane-readiness-collaborators.js';
import {
  CONTROL_PLANE_READINESS_COLLABORATOR as COLLABORATOR,
  CONTROL_PLANE_READINESS_COLLABORATOR_UNWIRED as UNWIRED,
} from './control-plane-readiness-constants.js';

const {
  COLUMN,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  LOCAL_STR_PRESENT,
  MISSING_NODE_READINESS_STATE,
  PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE,
  PRIORITY_CONTROL_PLANE_RECOVERY_PROJECTION_STATE,
  SERVICE_STATUS,
  STARTUP_AUTHORITY_STATE,
  buildCanonicalPublicationRecoveryEvidence,
  buildPublicationRecoveryGateSnapshot,
  buildStartupAuthorityFailureOwnerDescriptor,
  buildStartupAuthorityHealthDetails,
  buildStartupAuthorityOwnerContract,
  buildStartupAuthorityOwnerSnapshotFromPlanningAnswer,
  buildStartupAuthorityOwnerUnavailableSnapshot,
  buildStartupAuthorityPriorityPartitionOwnerDescriptor,
  buildStartupAuthorityPublicationOwnerDescriptor,
  buildStartupAuthorityRecoveryProtocolOwnerDescriptor,
  buildStartupAuthorityTargetParticipationOwnerDescriptor,
  normalizeDiagnosticTimestampMs,
  unwrapRowReadResult,
} = SHARED;

async function getLatestPublishedMembershipPublicationRow(service, readOptions = {}) {
  const publicationService =
    readWiredCollaborator(service, COLLABORATOR.MEMBERSHIP_PUBLICATION);
  if (publicationService === UNWIRED) {
    return null;
  }
  return publicationService.getLatestPublishedClusterPublication(
    service.buildMembershipPublicationReadOptions(readOptions),
  );
}

function buildPriorityControlPlaneRecoveryUnavailableHealth(
  service,
  failureReason,
  error = null,
  context = null,
) {
  const details = {
    failureReason,
  };
  if (context && typeof context === 'object') {
    Object.assign(details, context);
  }
  if (error) {
    details.error = error?.message || String(error);
  }
  return Object.freeze({
    healthy: false,
    reasonCode:
      CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
    details,
  });
}

function buildStartupAuthorityFailureDescriptor(service, failureReason) {
  return buildStartupAuthorityFailureOwnerDescriptor(failureReason);
}

function buildStartupAuthorityPublicationDescriptor(service, details = {}) {
  return buildStartupAuthorityPublicationOwnerDescriptor(details);
}

function buildStartupAuthorityPriorityPartitionDescriptor(service, priorityPartitionSummary) {
  return buildStartupAuthorityPriorityPartitionOwnerDescriptor(
    priorityPartitionSummary,
  );
}

function buildStartupAuthorityRecoveryProtocolDescriptor(service, recoveryProtocolState) {
  return buildStartupAuthorityRecoveryProtocolOwnerDescriptor(
    recoveryProtocolState,
  );
}

function buildStartupAuthorityTargetParticipationDescriptor(service, targetParticipation) {
  return buildStartupAuthorityTargetParticipationOwnerDescriptor(
    targetParticipation,
  );
}

function buildStartupAuthoritySnapshotContract(service, options = {}) {
  return buildStartupAuthorityOwnerContract(options);
}

function buildPriorityRecoveryHealthDetailsFromStartupAuthority(
  service,
  startupAuthority,
  reasonCodes = [],
) {
  return buildStartupAuthorityHealthDetails(startupAuthority, reasonCodes);
}

function buildStartupAuthorityUnavailableSnapshot(
  service,
  failureReason,
  error = null,
  context = null,
) {
  return buildStartupAuthorityOwnerUnavailableSnapshot(
    failureReason,
    error,
    context,
  );
}

function buildStartupAuthoritySnapshotFromPlanningAnswer(service, planningSnapshot) {
  return buildStartupAuthorityOwnerSnapshotFromPlanningAnswer(
    planningSnapshot,
  );
}

function getStartupAuthoritySnapshotSync(
  service,
  nodeId = service.nodeId,
  observedAt = service.now(),
) {
  try {
    return service.applyFormationReleaseHandoff(
      service.buildStartupAuthoritySnapshotFromPlanningAnswer(
        service.getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt),
      ),
      observedAt,
      service.formationReleaseAuthorityNodeId,
      {
        projectionNodeId: nodeId,
        observeAuthority:
          nodeId === service.formationReleaseAuthorityNodeId &&
          service.nodeId === service.formationReleaseAuthorityNodeId,
      },
    );
  } catch (error) {
    return service.buildStartupAuthorityUnavailableSnapshot(
      PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_READ_FAILED,
      error,
    );
  }
}

function getFormationReleaseStartupAuthoritySnapshotSync(
  service,
  nodeId = service.nodeId,
  observedAt = service.now(),
) {
  try {
    return service.applyFormationReleaseHandoff(
      service.buildStartupAuthoritySnapshotFromPlanningAnswer(
        service.getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt),
      ),
      observedAt,
      service.formationReleaseAuthorityNodeId,
      {
        projectionNodeId: nodeId,
        observeAuthority:
          nodeId === service.formationReleaseAuthorityNodeId &&
          service.nodeId === service.formationReleaseAuthorityNodeId,
      },
    );
  } catch (error) {
    return service.buildStartupAuthorityUnavailableSnapshot(
      PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_READ_FAILED,
      error,
    );
  }
}

/**
 * Shared async startup-authority projection: read one planning answer via
 * the supplied reader, then apply the formation-release handoff (reading the
 * published handoff from the authority when this node is not observing it).
 * Any read failure collapses to the PLANNING_READ_FAILED unavailable snapshot.
 *
 * @param {function(string, number): Promise<Object>} readPlanningAnswer
 * @param {string} nodeId
 * @param {number} observedAt
 * @return {Promise<Object>}
 * @private
 */
async function resolveStartupAuthoritySnapshotFromPlanningRead(
  service,
  readPlanningAnswer,
  nodeId,
  observedAt,
) {
  try {
    const startupAuthority =
      service.buildStartupAuthoritySnapshotFromPlanningAnswer(
        await readPlanningAnswer(nodeId, observedAt),
      );
    const observeAuthority =
      nodeId === service.formationReleaseAuthorityNodeId &&
      service.nodeId === service.formationReleaseAuthorityNodeId;
    const publishedHandoff = observeAuthority ? null :
      await service.readFormationReleaseHandoffFromAuthority(
        service.formationReleaseAuthorityNodeId,
        service.getFormationReleaseAuthorityBootIncarnation(
          service.formationReleaseAuthorityNodeId,
        ),
      );
    return service.applyFormationReleaseHandoff(
      startupAuthority,
      observedAt,
      service.formationReleaseAuthorityNodeId,
      {
        observeAuthority,
        publishedHandoff,
        projectionNodeId: nodeId,
      },
    );
  } catch (error) {
    return service.buildStartupAuthorityUnavailableSnapshot(
      PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_READ_FAILED,
      error,
    );
  }
}

async function getFormationReleaseStartupAuthoritySnapshot(
  service,
  nodeId = service.nodeId,
  observedAt = service.now(),
) {
  return service.resolveStartupAuthoritySnapshotFromPlanningRead(
    (readNodeId, readObservedAt) =>
      service.getPriorityRecoveryPlanningAnswerForOwnerRead(
        readNodeId,
        readObservedAt,
      ),
    nodeId,
    observedAt,
  );
}

async function getStartupAuthoritySnapshot(
  service,
  nodeId = service.nodeId,
  observedAt = service.now(),
) {
  return service.resolveStartupAuthoritySnapshotFromPlanningRead(
    (readNodeId, readObservedAt) =>
      service.getPriorityRecoveryPlanningAnswerSync(
        readNodeId,
        readObservedAt,
      ),
    nodeId,
    observedAt,
  );
}

function buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer(service, planningSnapshot) {
  const startupAuthority =
    service.buildStartupAuthoritySnapshotFromPlanningAnswer(planningSnapshot);
  if (startupAuthority.authorityAvailable !== true) {
    const details =
      service.buildPriorityRecoveryHealthDetailsFromStartupAuthority(
        startupAuthority,
      );
    return service.buildPriorityControlPlaneRecoveryUnavailableHealth(
      startupAuthority.failure.state === LOCAL_STR_PRESENT ?
        startupAuthority.failure.reason :
        PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_UNAVAILABLE,
      null,
      details,
    );
  }
  const reasonCodes = Array.isArray(
    startupAuthority.priorityRecoveryReasonCodes,
  ) ?
    [...startupAuthority.priorityRecoveryReasonCodes] :
    [];
  return Object.freeze({
    healthy: startupAuthority.state === STARTUP_AUTHORITY_STATE.READY,
    reasonCode:
      CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
    ...(startupAuthority.state !== STARTUP_AUTHORITY_STATE.READY ?
      {
        details:
            service.buildPriorityRecoveryHealthDetailsFromStartupAuthority(
              startupAuthority,
              reasonCodes,
            ),
      } :
      {}),
  });
}

function getPriorityControlPlaneRecoveryHealthSync(
  service,
  nodeId = service.nodeId,
  observedAt = service.now(),
) {
  if (
    readWiredCollaborator(service, COLLABORATOR.MEMBERSHIP_PUBLICATION) ===
      UNWIRED
  ) {
    return service.buildPriorityControlPlaneRecoveryUnavailableHealth(
      PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.SERVICE_UNAVAILABLE,
    );
  }
  try {
    let membershipPublication = null;
    try {
      membershipPublication = service.getMembershipPublicationDiagnosticsSync(
        nodeId,
        observedAt,
      );
    } catch (_error) {
      membershipPublication = null;
    }
    return service.buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer(
      service.resolveNodeMembershipPublicationPlanningAnswerSync(
        nodeId,
        observedAt,
        membershipPublication,
      ),
    );
  } catch (error) {
    return service.buildPriorityControlPlaneRecoveryUnavailableHealth(
      PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_READ_FAILED,
      error,
    );
  }
}

async function getPriorityControlPlaneRecoveryHealth(
  service,
  nodeId = service.nodeId,
  observedAt = service.now(),
) {
  if (
    readWiredCollaborator(service, COLLABORATOR.MEMBERSHIP_PUBLICATION) ===
      UNWIRED
  ) {
    return service.buildPriorityControlPlaneRecoveryUnavailableHealth(
      PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.SERVICE_UNAVAILABLE,
    );
  }
  try {
    let membershipPublication = null;
    try {
      membershipPublication =
        await service.getMembershipPublicationDiagnostics(nodeId, observedAt);
    } catch (_error) {
      membershipPublication = null;
    }
    return service.buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer(
      await service.resolveNodeMembershipPublicationPlanningAnswer(
        nodeId,
        observedAt,
        membershipPublication,
      ),
    );
  } catch (error) {
    return service.buildPriorityControlPlaneRecoveryUnavailableHealth(
      PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_READ_FAILED,
      error,
    );
  }
}

function getCapacitySnapshotSync(service, nodeId, _nodeRow) {
  const accounting =
    readWiredCollaborator(service, COLLABORATOR.STORAGE_ACCOUNTING);
  return accounting === UNWIRED ? null :
    accounting.getCapacitySnapshotForNodeSync(nodeId);
}

function getPriorityControlPlaneRecoveryState(service, context = {}) {
  return service.buildPriorityControlPlaneRecoveryProjection(context);
}

function buildPriorityControlPlaneRecoveryProjection(service, context = {}) {
  const dimensions =
    context.dimensions && typeof context.dimensions === 'object' ?
      context.dimensions :
      {};
  const membershipPublication =
    context.membershipPublication &&
    typeof context.membershipPublication === 'object' ?
      context.membershipPublication :
      null;
  const providedPlanningSnapshot =
    context.membershipPublicationPlanningSnapshot &&
    typeof context.membershipPublicationPlanningSnapshot === 'object' ?
      context.membershipPublicationPlanningSnapshot :
      null;
  const planningSnapshot =
    service.buildPriorityRecoveryPlanningProjection(
      service.resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync(
        context,
      ),
    );
  const publicationEvidence = buildCanonicalPublicationRecoveryEvidence({
    publicationConvergence: planningSnapshot,
    publicationConvergenceGate:
      planningSnapshot?.publicationRecoveryGate || null,
    priorityRecoveryObservation:
      planningSnapshot?.priorityRecoveryObservation || null,
    priorityRecoveryDecisionSnapshots:
      planningSnapshot?.priorityRecoveryDecisionSnapshots || null,
    priorityRecoveryClosureWitness:
      planningSnapshot?.priorityRecoveryClosureWitness || null,
    priorityRecoveryInvariants:
      planningSnapshot?.priorityRecoveryInvariants || null,
  });
  const publicationRecoveryGate =
    publicationEvidence.publicationConvergenceGate ||
    planningSnapshot?.publicationRecoveryGate ||
    buildPublicationRecoveryGateSnapshot(planningSnapshot || {});
  const planningPriorityRecoveryObservation =
    planningSnapshot?.priorityRecoveryObservation &&
    typeof planningSnapshot.priorityRecoveryObservation === 'object' ?
      planningSnapshot.priorityRecoveryObservation :
      null;
  const planningPriorityRecoveryClosureWitness =
    planningSnapshot?.diagnosticPriorityRecoveryClosureWitness &&
    typeof planningSnapshot.diagnosticPriorityRecoveryClosureWitness ===
      'object' ?
      planningSnapshot.diagnosticPriorityRecoveryClosureWitness :
      planningSnapshot?.priorityRecoveryClosureWitness &&
        typeof planningSnapshot.priorityRecoveryClosureWitness ===
          'object' ?
        planningSnapshot.priorityRecoveryClosureWitness :
        providedPlanningSnapshot?.priorityRecoveryClosureWitness &&
          typeof providedPlanningSnapshot.priorityRecoveryClosureWitness ===
            'object' ?
          providedPlanningSnapshot.priorityRecoveryClosureWitness :
          providedPlanningSnapshot?.publicationRecoveryGate
            ?.priorityRecoveryClosureWitness &&
            typeof providedPlanningSnapshot.publicationRecoveryGate
              .priorityRecoveryClosureWitness === 'object' ?
            providedPlanningSnapshot.publicationRecoveryGate
              .priorityRecoveryClosureWitness :
            null;
  const planningPriorityRecoveryObservationHasClosureState =
    typeof planningPriorityRecoveryObservation
      ?.priorityRecoveryClosureState === 'string' &&
    planningPriorityRecoveryObservation.priorityRecoveryClosureState.length >
      0;
  const planningPriorityRecoveryObservationHasReasonCodes =
    Array.isArray(
      planningPriorityRecoveryObservation?.priorityRecoveryReasonCodes,
    ) &&
    planningPriorityRecoveryObservation.priorityRecoveryReasonCodes.length >
      0;
  const planningDiagnosticPriorityRecoveryObservation =
    planningPriorityRecoveryObservationHasClosureState ||
    planningPriorityRecoveryObservationHasReasonCodes ?
      planningPriorityRecoveryObservation :
      (
        publicationRecoveryGate?.ready === true &&
        planningPriorityRecoveryClosureWitness ?
          Object.freeze({
            ...(publicationEvidence.priorityRecoveryObservation || {}),
            priorityRecoveryClosureState:
              planningPriorityRecoveryClosureWitness.state || null,
            priorityRecoveryReasonCodes:
              Array.isArray(
                planningSnapshot.diagnosticPriorityRecoveryReasonCodes,
              ) &&
              planningSnapshot.diagnosticPriorityRecoveryReasonCodes.length >
                0 ?
                [...planningSnapshot.diagnosticPriorityRecoveryReasonCodes] :
                Array.isArray(
                  providedPlanningSnapshot?.priorityRecoveryReasonCodes,
                ) &&
                providedPlanningSnapshot.priorityRecoveryReasonCodes.length >
                  0 ?
                  [...providedPlanningSnapshot.priorityRecoveryReasonCodes] :
                  Array.isArray(
                    providedPlanningSnapshot?.publicationRecoveryGate
                      ?.reasonCodes,
                  ) &&
                  providedPlanningSnapshot.publicationRecoveryGate.reasonCodes
                    .length > 0 ?
                    [
                      ...providedPlanningSnapshot.publicationRecoveryGate
                        .reasonCodes,
                    ] :
                    Array.isArray(planningSnapshot.priorityRecoveryReasonCodes) ?
                      [...planningSnapshot.priorityRecoveryReasonCodes] :
                      [],
          }) :
          planningPriorityRecoveryObservation
      );
  const priorityRecoveryObservation =
    publicationRecoveryGate?.ready === true &&
      planningDiagnosticPriorityRecoveryObservation ?
      planningDiagnosticPriorityRecoveryObservation :
      publicationEvidence.priorityRecoveryObservation ||
        planningDiagnosticPriorityRecoveryObservation ||
        null;
  const priorityPartitionSummary =
    publicationRecoveryGate.priorityPartitionSummary ||
    priorityRecoveryObservation?.priorityPartitionSummary ||
    planningSnapshot?.priorityPartitionSummary ||
    null;
  const gateReasonCodes = Array.isArray(
    publicationRecoveryGate?.reasonCodes,
  ) ?
    [...publicationRecoveryGate.reasonCodes] :
    [];
  const runtimeBlockerReasonCodes = [];
  if (
    dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
    ] !== true
  ) {
    runtimeBlockerReasonCodes.push(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE,
    );
  }
  const publicationPendingReasonCodePresent = gateReasonCodes.includes(
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
  );
  const controlPlaneNotWritable = runtimeBlockerReasonCodes.includes(
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE,
  );
  if (
    dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ] !== true &&
    !publicationPendingReasonCodePresent &&
    !controlPlaneNotWritable
  ) {
    runtimeBlockerReasonCodes.push(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.RECOVERY_ELIGIBILITY_PENDING,
    );
  }

  const dedupedReasonCodes = Object.freeze([
    ...new Set([...gateReasonCodes, ...runtimeBlockerReasonCodes]),
  ]);
  const enteredAt =
    membershipPublication?.createdAt ||
    membershipPublication?.updatedAt ||
    normalizeDiagnosticTimestampMs(context.observedAt) ||
    service.now();
  const state =
    publicationRecoveryGate.active === true ?
      PRIORITY_CONTROL_PLANE_RECOVERY_PROJECTION_STATE
        .PUBLICATION_GATE_PENDING :
      runtimeBlockerReasonCodes.length > 0 ?
        PRIORITY_CONTROL_PLANE_RECOVERY_PROJECTION_STATE.RUNTIME_BLOCKED :
        PRIORITY_CONTROL_PLANE_RECOVERY_PROJECTION_STATE.READY;

  return Object.freeze({
    active: publicationRecoveryGate.active === true,
    publicationGateActive: publicationRecoveryGate.active === true,
    state,
    reasonCodes: dedupedReasonCodes,
    publicationGateReady: publicationRecoveryGate.ready === true,
    runtimeBlocked: runtimeBlockerReasonCodes.length > 0,
    publicationGateReasonCodes: Object.freeze([...gateReasonCodes]),
    runtimeBlockerReasonCodes: Object.freeze([...runtimeBlockerReasonCodes]),
    publicationEpoch:
      publicationRecoveryGate.publicationEpoch ??
      planningSnapshot?.publicationEpoch ??
      membershipPublication?.publicationEpoch ??
      null,
    publicationStatus:
      publicationRecoveryGate.publicationStatus ??
      planningSnapshot?.publicationStatus ??
      (membershipPublication?.status || null),
    publicationRecoveryGate,
    priorityRecoveryObservation,
    priorityPartitionSummary,
    enteredAt,
  });
}

function shouldPreferLocalSelfNodeEvidence(service, context = {}) {
  const nodeId = context?.nodeId || null;
  if (!nodeId || nodeId !== service.nodeId) {
    return false;
  }

  const nodeRow = context?.nodeRow || null;
  const status = String(nodeRow?.[COLUMN.STATUS] || '').toLowerCase();
  const serviceRows = Array.isArray(context?.serviceRows) ?
    context.serviceRows :
    [];
  if (!nodeRow || typeof nodeRow !== 'object') {
    const lifecycleState = service.getLifecycleState(nodeId, null);
    return service.resolveMissingNodeReadinessState({
      nodeId,
      lifecycleState,
      serviceRows,
    }).state === MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE;
  }

  if (status !== SERVICE_STATUS.ACTIVE) {
    return false;
  }
  return service.hasRoutableService(serviceRows) &&
    service.hasWritableControlPlaneService(serviceRows);
}

async function readNodeRow(service, nodeId, options = {}) {
  if (Array.isArray(options.allNodeRows)) {
    return (
      options.allNodeRows.find((row) => row?.[COLUMN.NODE_ID] === nodeId) ||
      null
    );
  }
  const nodesOwner = readWiredCollaborator(service, COLLABORATOR.NODES_OWNER);
  if (nodesOwner === UNWIRED) {
    return service.getNodeRow(nodeId);
  }
  if (options.allowAuthoritativeRefresh === true) {
    // The single-row owner read's unavailability outcome is its typed
    // throw (NodesOwner.getNode), which the caller receives: the dispatch
    // path defers on it. Its answer is a row or null, never a failure.
    const result = await nodesOwner.getNode(nodeId, options);
    return unwrapRowReadResult(result);
  }
  const result = await nodesOwner.getNodeFromCache(nodeId, options);
  return unwrapRowReadResult(result);
}

export {
  getLatestPublishedMembershipPublicationRow,
  buildPriorityControlPlaneRecoveryUnavailableHealth,
  buildStartupAuthorityFailureDescriptor,
  buildStartupAuthorityPublicationDescriptor,
  buildStartupAuthorityPriorityPartitionDescriptor,
  buildStartupAuthorityRecoveryProtocolDescriptor,
  buildStartupAuthorityTargetParticipationDescriptor,
  buildStartupAuthoritySnapshotContract,
  buildPriorityRecoveryHealthDetailsFromStartupAuthority,
  buildStartupAuthorityUnavailableSnapshot,
  buildStartupAuthoritySnapshotFromPlanningAnswer,
  getStartupAuthoritySnapshotSync,
  getFormationReleaseStartupAuthoritySnapshotSync,
  resolveStartupAuthoritySnapshotFromPlanningRead,
  getFormationReleaseStartupAuthoritySnapshot,
  getStartupAuthoritySnapshot,
  buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer,
  getPriorityControlPlaneRecoveryHealthSync,
  getPriorityControlPlaneRecoveryHealth,
  getCapacitySnapshotSync,
  getPriorityControlPlaneRecoveryState,
  buildPriorityControlPlaneRecoveryProjection,
  shouldPreferLocalSelfNodeEvidence,
  readNodeRow,
};
