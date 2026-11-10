/**
 * Owner contract:
 * Owner: ControlPlaneReadinessService late-bound collaborator wiring.
 * Inputs: one syncOwnerDependencies wiring (any subset of the late-bound
 *   collaborators, wired at different times by control-plane setup, the
 *   heartbeat service, the coordinator lifecycle and the SQL-runtime handoff).
 * Canonical output: the wired collaborators; each wiring is validated once,
 *   at that point (a malformed collaborator is a typed refusal before any
 *   state changes), and a replacement is a named transition that clears what
 *   was derived from the previous collaborator.
 * Prohibited fallbacks: no member probe on a wired collaborator.
 * Primary tests: test/control-plane/control-plane-readiness-service-construction.test.js.
 */
import {
  CONTROL_PLANE_READINESS_COLLABORATOR,
  CONTROL_PLANE_READINESS_COLLABORATOR_UNWIRED,
} from './control-plane-readiness-constants.js';
import {
  assertLateBoundCollaborators, readWiredCollaborator,
} from './control-plane-readiness-collaborators.js';

const COLLABORATOR = CONTROL_PLANE_READINESS_COLLABORATOR;
const UNWIRED = CONTROL_PLANE_READINESS_COLLABORATOR_UNWIRED;
const LOCAL_STR_CDCINTEGRATIONSERVICE = 'cdcIntegrationService';
const LOCAL_STR_CACHEMUTATIONTARGET = 'cacheMutationTarget';
const LOCAL_STR_CONTROLPLANESYSTEMTABLEGATEWAY = 'controlPlaneSystemTableGateway';
const LOCAL_STR_LOCALCLUSTERINCARNATIONFENCEPROVIDER = 'localClusterIncarnationFenceProvider';
const LOCAL_STR_APPLYSYSTEMTABLECHANGE = 'applySystemTableChange';
const MESSAGE_ROUTER_OWNER = COLLABORATOR.MESSAGE_ROUTER;
const NULLABLE_OWNER_DEPENDENCIES = Object.freeze([
  COLLABORATOR.MESSAGE_ROUTER, COLLABORATOR.NODE_LIFECYCLE,
  LOCAL_STR_CDCINTEGRATIONSERVICE, COLLABORATOR.STORAGE_ACCOUNTING,
  COLLABORATOR.CDC_GROUP_PROPAGATION, COLLABORATOR.HEARTBEAT,
  COLLABORATOR.NODES_OWNER, COLLABORATOR.SERVICES_OWNER,
  LOCAL_STR_CONTROLPLANESYSTEMTABLEGATEWAY, COLLABORATOR.AUTHORITATIVE_VIEW,
  LOCAL_STR_LOCALCLUSTERINCARNATIONFENCEPROVIDER,
]);
const objectEntries = Object.entries;
const objectHasOwn = Object.hasOwn;

function isWritableCacheTarget(target) {
  return Boolean(
    target && typeof target === 'object' && LOCAL_STR_APPLYSYSTEMTABLECHANGE in target,
  );
}

function resolveWritableCacheMutationTarget(
  candidateTarget, systemTableCache, cdcIntegrationService,
) {
  const explicitTarget = candidateTarget || systemTableCache || null;
  if (isWritableCacheTarget(explicitTarget)) {
    return explicitTarget;
  }
  const cdcTarget = cdcIntegrationService?.cacheMutationTarget || null;
  if (isWritableCacheTarget(cdcTarget)) {
    return cdcTarget;
  }
  return explicitTarget;
}

function recordChangedReadinessOwnerDependencies(
  readinessPlanningSnapshotOwner,
  service,
  previousOwnerDependencies,
) {
  for (const [ownerName, previousOwner] of objectEntries(
    previousOwnerDependencies,
  )) {
    if (previousOwner === service[ownerName]) continue;
    readinessPlanningSnapshotOwner?.recordOwnerDependencyReplacement(
      ownerName,
    );
    if (ownerName === MESSAGE_ROUTER_OWNER) {
      service.refreshNodeLivenessSourceSubscriptions();
      service.nodeLivenessSemanticProjectionOwner?.recordAllSourceChanges();
    }
  }
}

function syncNullableOwnerDependency(service, options, ownerName) {
  if (objectHasOwn(options, ownerName)) {
    service[ownerName] = options[ownerName] || null;
  }
}

// The memos derived from the planning snapshot source's reads (CL-033 the
// planning projection, CL-034 the snapshot merge, the derivation memos and
// the diagnostics memo). The per-build context memo is a WeakMap keyed by
// per-build snapshot objects and needs no clear.
function clearPlanningSourceDerivedMemos(service) {
  service.clearMembershipPublicationDiagnosticsMemo();
  service.priorityRecoveryPlanningProjectionMemoByNodeId?.clear();
  service.membershipPublicationPlanningSnapshotMemoByNodeId?.clear();
  service.membershipPlanningSnapshotSyncMemoByPublisher?.clear();
  service.membershipPlanningSnapshotAsyncMemoByPublisher?.clear();
}

/**
 * Replacement transition of the planning snapshot source: a different
 * membership-publication owner (or its unwiring) clears every memo derived
 * from the previous owner's reads and is recorded as a membership owner
 * replacement. Wiring the same owner again changes nothing.
 * @param {Object} service - The readiness service.
 * @param {Object|null} next - The owner being wired, or null to unwire.
 * @return {void}
 */
function replaceMembershipPublicationService(service, next) {
  if (service.membershipPublicationService === next) return;
  clearPlanningSourceDerivedMemos(service);
  service.membershipPublicationService = next;
  service.readinessPlanningSnapshotOwner?.recordMembershipOwnerReplacement();
}

/**
 * Replacement transition of the system-table cache (CL-019): the listeners
 * move from the previous cache to the new one, and snapshots and memos
 * built from the previous cache never survive as trusted reuse candidates
 * (the new cache's change events never covered them).
 * @param {Object} service - The readiness service, already holding the new cache.
 * @param {Object|null} previousSystemTableCache - The replaced cache.
 * @return {void}
 */
function replaceSystemTableCache(service, previousSystemTableCache) {
  if (
    service.cacheChangeListener &&
    previousSystemTableCache !== null && previousSystemTableCache !== undefined
  ) {
    previousSystemTableCache.offCacheChange(service.cacheChangeListener);
  }
  service.cacheChangeListener = null;
  service.detachCacheApplyChangeListener(previousSystemTableCache);
  service.lastReadinessSnapshotByNodeId.clear();
  service.lastReadinessSnapshotAtMsByNodeId.clear();
  service.lastReadinessSnapshotInvalidatedAtMsByNodeId.clear();
  service.lastReadinessSnapshotClusterInvalidatedAtMs = 0;
  service.membershipPublicationPlanningSourceRevision += 1;
  service.projectionReadinessEvidenceOwner?.invalidateAll();
  clearPlanningSourceDerivedMemos(service);
  service.subscribeToCacheChanges();
  service.nodeLivenessSemanticProjectionOwner?.recordAllSourceChanges();
  service.readinessPlanningSnapshotOwner?.recordCacheReplacement();
}

function syncCacheMutationTarget(service, options, systemTableCacheProvided) {
  if (objectHasOwn(options, LOCAL_STR_CACHEMUTATIONTARGET)) {
    service.cacheMutationTarget = resolveWritableCacheMutationTarget(
      options[LOCAL_STR_CACHEMUTATIONTARGET] || null,
      service.systemTableCache,
      service.cdcIntegrationService,
    );
  } else if (
    systemTableCacheProvided ||
    objectHasOwn(options, LOCAL_STR_CDCINTEGRATIONSERVICE)
  ) {
    service.cacheMutationTarget = resolveWritableCacheMutationTarget(
      service.cacheMutationTarget,
      service.systemTableCache,
      service.cdcIntegrationService,
    );
  }
}

function snapshotOwnerDependencies(service) {
  return {
    nodesOwner: service.nodesOwner,
    servicesOwner: service.servicesOwner,
    messageRouter: service.messageRouter,
    nodeLifecycleStateMachine: service.nodeLifecycleStateMachine,
    storageAccountingService: service.storageAccountingService,
    cdcIntegrationService: service.cdcIntegrationService,
    cacheMutationTarget: service.cacheMutationTarget,
    cdcGroupPropagationService: service.cdcGroupPropagationService,
    heartbeatService: service.heartbeatService,
    controlPlaneSystemTableGateway: service.controlPlaneSystemTableGateway,
    authoritativeControlPlaneView: service.authoritativeControlPlaneView,
    localClusterIncarnationFenceProvider:
      service.localClusterIncarnationFenceProvider,
  };
}

/**
 * Wire late-bound collaborators after construction. Every wiring validates
 * the collaborators it names before anything changes; a second wiring of a
 * collaborator is a replacement (a production path: each wiring owner wires
 * different fields at different times).
 * @param {Object} service - The readiness service.
 * @param {Object} [options={}] - The collaborators this wiring names.
 * @return {void}
 */
function syncOwnerDependencies(service, options = {}) {
  assertLateBoundCollaborators(options);
  const previousSystemTableCache = service.systemTableCache;
  const previousOwnerDependencies = snapshotOwnerDependencies(service);
  const systemTableCacheProvided =
    objectHasOwn(options, COLLABORATOR.SYSTEM_TABLE_CACHE);
  const replacementStorageAccountingService =
    objectHasOwn(options, COLLABORATOR.STORAGE_ACCOUNTING) ?
      options[COLLABORATOR.STORAGE_ACCOUNTING] || null :
      service.storageAccountingService;
  if (replacementStorageAccountingService !==
      service.storageAccountingService) {
    service.readinessPlanningSnapshotOwner
      ?.prepareCapacitySemanticOwnerReplacement();
  }
  if (systemTableCacheProvided) {
    service.systemTableCache = options.systemTableCache || null;
  }
  syncCacheMutationTarget(service, options, systemTableCacheProvided);
  for (const ownerName of NULLABLE_OWNER_DEPENDENCIES) {
    syncNullableOwnerDependency(service, options, ownerName);
  }
  if (objectHasOwn(options, COLLABORATOR.MEMBERSHIP_PUBLICATION)) {
    replaceMembershipPublicationService(service,
      options[COLLABORATOR.MEMBERSHIP_PUBLICATION] || null);
  }
  const view = readWiredCollaborator(service, COLLABORATOR.AUTHORITATIVE_VIEW);
  if (view !== UNWIRED) {
    view.syncOwnerDependencies({
      cdcIntegrationService: service.cdcIntegrationService,
      messageRouter: service.messageRouter,
    });
  }
  service.authoritativeNodeEvidenceReconciler.syncOwnerDependencies({
    cdcIntegrationService: service.cdcIntegrationService,
    cacheMutationTarget: service.cacheMutationTarget,
    systemTableCache: service.systemTableCache,
    controlPlaneSystemTableGateway: service.controlPlaneSystemTableGateway,
  });
  if (
    systemTableCacheProvided &&
    previousSystemTableCache !== service.systemTableCache
  ) {
    replaceSystemTableCache(service, previousSystemTableCache);
  }
  service.configureStorageCapacitySemanticProjection();
  recordChangedReadinessOwnerDependencies(
    service.readinessPlanningSnapshotOwner, service, previousOwnerDependencies);
}

export {
  recordChangedReadinessOwnerDependencies,
  resolveWritableCacheMutationTarget,
  syncNullableOwnerDependency,
  syncOwnerDependencies,
};
