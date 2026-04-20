import { NUM, TYPEOF } from "../constants/index.js";
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from "./control-plane-readiness-constants.js";

function normalizeIsoTimestamp(nowValue) {
  return new Date(nowValue).toISOString();
}

export function buildReadinessTransitionState(context = {}, nowValue = Date.now()) {
  const observedAt =
    typeof context.observedAt === TYPEOF.STRING &&
    context.observedAt.length > NUM.ZERO ?
      context.observedAt :
      normalizeIsoTimestamp(nowValue);
  const reasonCodes = Array.isArray(context.reasons) ?
    [...new Set(
      context.reasons
        .map((reason) => String(reason?.code || ""))
        .filter(Boolean),
    )].sort() :
    [];
  const nodeEvidence =
    context.nodeEvidence && typeof context.nodeEvidence === TYPEOF.OBJECT ?
      context.nodeEvidence :
      {};
  const dimensions =
    context.dimensions && typeof context.dimensions === TYPEOF.OBJECT ?
      context.dimensions :
      {};
  const publication =
    context.publication && typeof context.publication === TYPEOF.OBJECT ?
      context.publication :
      {};
  const priorityControlPlaneRecovery =
    context.priorityControlPlaneRecovery &&
    typeof context.priorityControlPlaneRecovery === TYPEOF.OBJECT ?
      context.priorityControlPlaneRecovery :
      {};
  const runtimeAuthority =
    context.runtimeAuthority &&
    typeof context.runtimeAuthority === TYPEOF.OBJECT ?
      context.runtimeAuthority :
      {};

  return Object.freeze({
    observedAt,
    observedAtMs: nowValue,
    serveEligible:
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === true,
    repairEligible:
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true,
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
        typeof nodeEvidence.localQueryTransportState === TYPEOF.STRING ?
          nodeEvidence.localQueryTransportState :
          null,
      localQueryTransportReady:
        typeof nodeEvidence.localQueryTransportReady === TYPEOF.BOOLEAN ?
          nodeEvidence.localQueryTransportReady :
          null,
      localQueryTransportReason:
        typeof nodeEvidence.localQueryTransportReason === TYPEOF.STRING ?
          nodeEvidence.localQueryTransportReason :
          null,
      localQueryTransportRetryAfterMs:
        Number.isFinite(nodeEvidence.localQueryTransportRetryAfterMs) ?
          nodeEvidence.localQueryTransportRetryAfterMs :
          null,
      publicationMode:
        typeof publication.currentMode === TYPEOF.STRING ?
          publication.currentMode :
          null,
      publicationReasonCode:
        typeof publication.reasonCode === TYPEOF.STRING ?
          publication.reasonCode :
          null,
      membershipPublicationStatus:
        typeof context.membershipPublication?.status === TYPEOF.STRING ?
          context.membershipPublication.status :
          null,
      priorityControlPlaneRecoveryActive:
        priorityControlPlaneRecovery.active === true,
      priorityControlPlaneRecoveryReasonCodes:
        Array.isArray(priorityControlPlaneRecovery.reasonCodes) ?
          Object.freeze([...priorityControlPlaneRecovery.reasonCodes]) :
          Object.freeze([]),
      runtimeAuthorityState:
        typeof runtimeAuthority.state === TYPEOF.STRING ?
          runtimeAuthority.state :
          null,
      runtimeAuthorityVisibilityState:
        typeof runtimeAuthority.visibility?.state === TYPEOF.STRING ?
          runtimeAuthority.visibility.state :
          null,
      runtimeAuthorityRepairState:
        typeof runtimeAuthority.repair?.state === TYPEOF.STRING ?
          runtimeAuthority.repair.state :
          null,
      runtimeAuthorityProvisioningState:
        typeof runtimeAuthority.provisioning?.state === TYPEOF.STRING ?
          runtimeAuthority.provisioning.state :
          null,
    }),
  });
}
