import {
  AUTHORITY_DESCRIPTOR_STATE,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  PROJECTION_READINESS_CONTRACT_STATE,
  PROVISIONING_ELIGIBILITY_STATE,
  RUNTIME_AUTHORITY_PUBLICATION_STATE,
  RUNTIME_AUTHORITY_REPAIR_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
} from './control-plane-readiness-constants.js';
import {
  PROJECTION_READINESS_ACTIVE_GATE_STATE,
  PROJECTION_READINESS_LANE_STATE,
  PROJECTION_READINESS_OPERATOR_STATE,
} from './projection-readiness-constants.js';
import {copyDenseOwnDataArray} from '../utils/strict-own-data.js';
import {
  TOKEN_STATUS,
  appendArrayValue,
  encodeSignatureValues,
} from './readiness-planning-version-contract.js';

const ArrayConstructor = Array;
const numberIsFinite = Number.isFinite;
const numberConstructor = Number;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectKeys = Object.keys;
const objectValues = Object.values;
const setAdd = Function.call.bind(Set.prototype.add);
const setForEach = Function.call.bind(Set.prototype.forEach);
const SetConstructor = Set;
const CAPTURE_UNAVAILABLE = 'unavailable';

function defineRecordValue(record, key, value) {
  objectDefineProperty(record, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function freezeDeferredRecord(values) {
  const record = objectCreate(null);
  const keys = objectKeys(values);
  for (let index = 0; index < keys.length; index++) {
    defineRecordValue(record, keys[index], values[keys[index]]);
  }
  return objectFreeze(record);
}

function hasLiveEvidenceExpired(now, evidenceAt, maxAgeMs) {
  return numberIsFinite(maxAgeMs) &&
    numberIsFinite(evidenceAt) &&
    now - evidenceAt > maxAgeMs;
}

function captureLifecycleState(service) {
  try {
    return typeof service?.nodeLifecycleStateMachine?.getState === 'function' ?
      service.nodeLifecycleStateMachine.getState() :
      '';
  } catch {
    return CAPTURE_UNAVAILABLE;
  }
}

function captureStorageCapacityPolicy(service) {
  const owner = service?.storageAccountingService;
  return encodeSignatureValues([
    owner?.softPressurePercent,
    owner?.hardPressurePercent,
    owner?.minimumReplicaBytes,
    owner?.partitionReplicaOverheadBytes,
    owner?.messageGroupReplicaOverheadBytes,
    owner?.serviceReplicaOverheadBytes,
  ]);
}

function captureMetadataPublicationState(service) {
  try {
    const diagnostics = typeof service?.cdcGroupPropagationService
      ?.getPublicationModeDiagnostics === 'function' ?
      service.cdcGroupPropagationService.getPublicationModeDiagnostics() :
      null;
    return encodeSignatureValues([
      diagnostics?.currentMode,
      diagnostics?.reasonCode,
    ]);
  } catch {
    return CAPTURE_UNAVAILABLE;
  }
}

function captureHeartbeatPublicationState(service) {
  try {
    const owner = service && service.heartbeatService;
    if (!owner) return '';
    const diagnostics =
      typeof owner.getHeartbeatPublicationDiagnostics === 'function' ?
        owner.getHeartbeatPublicationDiagnostics() || {} :
        {};
    // Semantic publication state only — never per-attempt clocks. Embedding
    // lastAttemptAt/lastSuccessAt/lastFailureAt/consecutiveFailures made this
    // signature change on EVERY heartbeat publication attempt, so on a
    // bootstrap seed (whose heartbeat publication fails until the cluster
    // forms) every completed planning snapshot was declared not-live before
    // it could be read, readiness served the all-false deferred contract,
    // query routing denied every candidate, and the cluster could never form
    // — a formation-vs-steady-state liveness circularity. Staleness of live
    // evidence is enforced separately by the expiry checks in
    // capturePositiveDecisionLiveVeto; a genuine semantic transition (mode,
    // path, target identity, failure kind) still invalidates.
    // The steady/maintenance publication-mode decision also oscillates as
    // routine cadence policy, so mode fields stay out of the signature too;
    // the guard pins only durable publication identity and failure kind.
    return encodeSignatureValues([
      diagnostics.lastFailureStage,
      diagnostics.lastFailureReason,
      diagnostics.publicationPath,
      diagnostics.targetAddress,
      diagnostics.targetNodeId,
      diagnostics.targetServiceType,
      diagnostics.targetServiceId,
    ]);
  } catch {
    return CAPTURE_UNAVAILABLE;
  }
}

function captureLiveTransportVeto(service, ownerKey) {
  if (typeof service?.getNodeTransportState !== 'function') return null;
  try {
    const nodeRow = typeof service?.getNodeRow === 'function' ?
      service.getNodeRow(ownerKey) :
      null;
    const state = service.getNodeTransportState(ownerKey, nodeRow);
    return encodeSignatureValues([
      state?.connected === true,
      state?.rowState || '',
      state?.routerState || '',
    ]);
  } catch {
    return null;
  }
}

function capturePositiveDecisionPublicationGuard(service, ownerKey) {
  return encodeSignatureValues([
    captureLiveTransportVeto(service, ownerKey),
    captureLifecycleState(service),
    captureStorageCapacityPolicy(service),
    captureMetadataPublicationState(service),
    captureHeartbeatPublicationState(service),
  ]);
}

function captureNodeLivenessSemanticIdentity(service, ownerKey, now) {
  if (typeof service?.getNodeLivenessSemanticIdentity !== 'function') {
    return CAPTURE_UNAVAILABLE;
  }
  try {
    const identity = service.getNodeLivenessSemanticIdentity(ownerKey, now);
    return encodeSignatureValues([
      identity?.generation,
      identity?.semanticSignature,
    ]);
  } catch {
    return CAPTURE_UNAVAILABLE;
  }
}

function capturePositiveDecisionLiveVeto(
  service,
  ownerKey,
  snapshot,
  capturedAtMs,
  now,
) {
  const maxAgeMs = numberConstructor(
    service?.clusterMemberStaleHeartbeatMaxAgeMs,
  );
  const localTransportDrift =
    typeof service?.hasStoredSnapshotLocalQueryTransportDrift === 'function' &&
    service.hasStoredSnapshotLocalQueryTransportDrift(ownerKey, snapshot);
  return encodeSignatureValues([
    hasLiveEvidenceExpired(now, capturedAtMs, maxAgeMs),
    captureNodeLivenessSemanticIdentity(service, ownerKey, now),
    localTransportDrift,
    capturePositiveDecisionPublicationGuard(service, ownerKey),
  ]);
}

function resolveDeferredDimensionNames(snapshot) {
  const names = objectKeys(snapshot?.dimensions || {});
  return names.length > 0 ?
    names :
    objectValues(CONTROL_PLANE_READINESS_DIMENSION);
}

function buildDeferredProjectionLanes(contract, reasonCodes) {
  const lanes = objectCreate(null);
  const names = objectKeys(contract?.lanes || {});
  for (let index = 0; index < names.length; index++) {
    const name = names[index];
    const state = name === 'operator' ?
      PROJECTION_READINESS_OPERATOR_STATE.BLOCKED :
      PROJECTION_READINESS_LANE_STATE.BLOCKED;
    defineRecordValue(lanes, name, freezeDeferredRecord({
      name,
      state,
      ready: false,
      reasonCodes,
    }));
  }
  return objectFreeze(lanes);
}

function buildDeferredProjectionContract(snapshot, reasonCodes) {
  const contract = snapshot?.projectionReadinessContract || {};
  return freezeDeferredRecord({
    projectionReadinessContract: freezeDeferredRecord({
      semanticOwner: contract.semanticOwner || null,
      state: PROJECTION_READINESS_CONTRACT_STATE.BLOCKED,
      ready: false,
      serveReady: false,
      recoveryOpen: true,
      activeGate: freezeDeferredRecord({
        state: PROJECTION_READINESS_ACTIVE_GATE_STATE.BLOCKED,
        ready: false,
        reasonCodes,
      }),
      lanes: buildDeferredProjectionLanes(contract, reasonCodes),
      publication: freezeDeferredRecord({
        ready: false,
        revisionState: contract.publication?.revisionState || null,
      }),
      readiness: freezeDeferredRecord({
        internalReady: false,
        repairEligible: false,
        recoveryEligible: false,
        serveEligible: false,
        runtimeServeEligible: false,
        operatorReady: false,
      }),
      priorityRecovery: freezeDeferredRecord({
        active: false,
        durableSpreadPending: true,
        reasonCodes,
      }),
      projectionRevision: freezeDeferredRecord({
        ...(contract.projectionRevision || {}),
        stale: true,
      }),
      evidence: freezeDeferredRecord({
        ownerEvidenceAvailable: false,
        processAlive: false,
        clusterMemberHealthy: false,
        repairEligible: false,
        recoveryEligible: false,
        controlPlaneWritable: false,
        runtimeServeEligible: false,
        publicationReady: false,
      }),
      reasonCodes,
    }),
  });
}

function buildDeferredRuntimeAuthority(reasonCodes) {
  return freezeDeferredRecord({
    state: RUNTIME_AUTHORITY_STATE.UNAVAILABLE,
    ready: false,
    authorityAvailable: false,
    processAlive: false,
    clusterMemberHealthy: false,
    routingReady: false,
    writeEligible: false,
    recoveryEligible: false,
    repairEligible: false,
    publication: freezeDeferredRecord({
      state: RUNTIME_AUTHORITY_PUBLICATION_STATE.DEGRADED,
      healthy: false,
      mode: null,
      reasonCode:
        CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING,
    }),
    visibility: freezeDeferredRecord({
      state: RUNTIME_AUTHORITY_VISIBILITY_STATE.UNAVAILABLE,
      published: false,
      priorityRecoveryActive: false,
    }),
    repair: freezeDeferredRecord({
      state: RUNTIME_AUTHORITY_REPAIR_STATE.NOT_ATTEMPTED,
      repaired: false,
    }),
    provisioning: freezeDeferredRecord({
      state: PROVISIONING_ELIGIBILITY_STATE.BLOCKED,
      eligible: false,
    }),
    failure: freezeDeferredRecord({
      state: AUTHORITY_DESCRIPTOR_STATE.PRESENT,
      reason: CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING,
    }),
    reasonCodes,
  });
}

function buildDeferredNodeEvidence() {
  return freezeDeferredRecord({
    status: null,
    rowConnectionState: CAPTURE_UNAVAILABLE,
    routerConnectionState: CAPTURE_UNAVAILABLE,
    transportConnected: false,
    localQueryTransportState: CAPTURE_UNAVAILABLE,
    localQueryTransportReady: false,
    localQueryTransportReason:
      CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING,
    localQueryTransportReasonCode:
      CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING,
    localQueryTransportErrorCode: null,
    localQueryTransportRetryAfterMs: null,
    lastHeartbeat: null,
    heartbeatAgeMs: null,
    readyLeaseExpiresAt: null,
    readyLeaseAgeMs: null,
    staleHeartbeatLimitMs: null,
    readyNow: false,
    readyWhenWritten: false,
  });
}

function collectDeferredReasonCodeSet(snapshot) {
  const reasons = new SetConstructor();
  const snapshotReasons = copyDenseOwnDataArray(snapshot?.reasons);
  if (snapshotReasons !== null) {
    for (let index = 0; index < snapshotReasons.length; index++) {
      const reason = snapshotReasons[index];
      if (typeof reason === 'string') {
        setAdd(reasons, reason);
      } else if (typeof reason?.code === 'string' && reason.code.length > 0) {
        setAdd(reasons, reason.code);
      }
    }
  }
  setAdd(reasons,
    CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING);
  return reasons;
}

function buildDeferredSnapshot(snapshot, token, ownerKey = null) {
  const dimensions = objectCreate(null);
  const dimensionNames = resolveDeferredDimensionNames(snapshot);
  for (let index = 0; index < dimensionNames.length; index++) {
    defineRecordValue(dimensions, dimensionNames[index], false);
  }
  const reasons = collectDeferredReasonCodeSet(snapshot);
  const deferredReasonCodes = new ArrayConstructor();
  // Canonical reason shape: consumers (collectReasonCodes, routing denial
  // summaries) read reason.code records; bare strings silently vanished from
  // every diagnostic downstream.
  const deferredReasons = new ArrayConstructor();
  setForEach(reasons, (reason) => {
    appendArrayValue(deferredReasonCodes, reason);
    appendArrayValue(deferredReasons, freezeDeferredRecord({code: reason}));
  });
  return freezeDeferredRecord({
    nodeId: snapshot?.nodeId || ownerKey,
    lifecycleState: null,
    publication: null,
    membershipPublication: null,
    priorityControlPlaneRecovery: freezeDeferredRecord({
      active: false,
      reasonCodes: objectFreeze(deferredReasonCodes),
    }),
    capacity: null,
    nodeEvidence: buildDeferredNodeEvidence(),
    observedAt: snapshot?.observedAt || null,
    runtimeAuthority: buildDeferredRuntimeAuthority(
      objectFreeze(deferredReasonCodes),
    ),
    recentTransitions: objectFreeze(new ArrayConstructor()),
    dimensions: objectFreeze(dimensions),
    ...dimensions,
    reasons: objectFreeze(deferredReasons),
    readinessPlanningToken: token,
    readinessPlanningTokenStatus: TOKEN_STATUS.STALE,
    ...buildDeferredProjectionContract(
      snapshot,
      objectFreeze(deferredReasonCodes),
    ),
  });
}

export {
  buildDeferredSnapshot,
  capturePositiveDecisionLiveVeto,
  capturePositiveDecisionPublicationGuard,
  defineRecordValue,
};
