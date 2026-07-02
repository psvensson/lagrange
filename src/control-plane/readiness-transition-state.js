import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  buildProjectionReadinessContract,
} from './eligibility-snapshot.js';

function normalizeIsoTimestamp(nowValue) {
  return new Date(nowValue).toISOString();
}

export function buildReadinessTransitionState(context = {}, nowValue = Date.now()) {
  const observedAt =
    typeof context.observedAt === 'string' &&
    context.observedAt.length > 0 ?
      context.observedAt :
      normalizeIsoTimestamp(nowValue);
  const reasonCodes = Array.isArray(context.reasons) ?
    [...new Set(
      context.reasons
        .map((reason) => String(reason?.code || ''))
        .filter(Boolean),
    )].sort() :
    [];
  const nodeEvidence =
    context.nodeEvidence && typeof context.nodeEvidence === 'object' ?
      context.nodeEvidence :
      {};
  const dimensions =
    context.dimensions && typeof context.dimensions === 'object' ?
      context.dimensions :
      {};
  const publication =
    context.publication && typeof context.publication === 'object' ?
      context.publication :
      {};
  const runtimeAuthority =
    context.runtimeAuthority &&
    typeof context.runtimeAuthority === 'object' ?
      context.runtimeAuthority :
      {};
  const projectionReadinessContract =
    buildProjectionReadinessContract(context);

  return Object.freeze({
    observedAt,
    observedAtMs: nowValue,
    serveEligible:
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === true,
    repairEligible:
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true,
    projectionReadinessContract,
    reasonCodes: Object.freeze(reasonCodes),
    rawInputs: Object.freeze({
      lastHeartbeat:
        Number.isFinite(nodeEvidence.lastHeartbeat) ?
          nodeEvidence.lastHeartbeat :
          null,
      heartbeatAgeMs:
        Number.isFinite(nodeEvidence.heartbeatAgeMs) ?
          nodeEvidence.heartbeatAgeMs :
          null,
      readyLeaseExpiresAt:
        Number.isFinite(nodeEvidence.readyLeaseExpiresAt) ?
          nodeEvidence.readyLeaseExpiresAt :
          null,
      readyLeaseLagMs:
        Number.isFinite(nodeEvidence.readyLeaseAgeMs) ?
          nodeEvidence.readyLeaseAgeMs :
          null,
      staleHeartbeatLimitMs:
        Number.isFinite(nodeEvidence.staleHeartbeatLimitMs) ?
          nodeEvidence.staleHeartbeatLimitMs :
          null,
      controlPlaneWritable:
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
        ] === true,
      controlPlanePublished:
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED
        ] === true,
      routingReady:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] === true,
      loadReady:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] === true,
      clusterMemberHealthy:
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
        ] === true,
      metadataPublicationHealthy:
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY
        ] === true,
      localQueryTransportState:
        typeof nodeEvidence.localQueryTransportState === 'string' ?
          nodeEvidence.localQueryTransportState :
          null,
      localQueryTransportReady:
        typeof nodeEvidence.localQueryTransportReady === 'boolean' ?
          nodeEvidence.localQueryTransportReady :
          null,
      localQueryTransportReason:
        typeof nodeEvidence.localQueryTransportReason === 'string' ?
          nodeEvidence.localQueryTransportReason :
          null,
      localQueryTransportRetryAfterMs:
        Number.isFinite(nodeEvidence.localQueryTransportRetryAfterMs) ?
          nodeEvidence.localQueryTransportRetryAfterMs :
          null,
      publicationMode:
        typeof publication.currentMode === 'string' ?
          publication.currentMode :
          null,
      publicationReasonCode:
        typeof publication.reasonCode === 'string' ?
          publication.reasonCode :
          null,
      membershipPublicationStatus:
        typeof context.membershipPublication?.status === 'string' ?
          context.membershipPublication.status :
          null,
      priorityControlPlaneRecoveryActive:
        projectionReadinessContract.priorityRecovery.active === true,
      priorityControlPlaneRecoveryReasonCodes:
        projectionReadinessContract.priorityRecovery.reasonCodes,
      projectionReadinessState: projectionReadinessContract.state,
      projectionPublicationReady:
        projectionReadinessContract.publication.ready === true,
      projectionPriorityRecoveryActive:
        projectionReadinessContract.priorityRecovery.active === true,
      runtimeAuthorityState:
        typeof runtimeAuthority.state === 'string' ?
          runtimeAuthority.state :
          null,
      runtimeAuthorityVisibilityState:
        typeof runtimeAuthority.visibility?.state === 'string' ?
          runtimeAuthority.visibility.state :
          null,
      runtimeAuthorityRepairState:
        typeof runtimeAuthority.repair?.state === 'string' ?
          runtimeAuthority.repair.state :
          null,
      runtimeAuthorityProvisioningState:
        typeof runtimeAuthority.provisioning?.state === 'string' ?
          runtimeAuthority.provisioning.state :
          null,
    }),
  });
}
