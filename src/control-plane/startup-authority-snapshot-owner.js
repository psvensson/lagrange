import {
  AUTHORITY_PUBLICATION_OBSERVATION_STATE,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from './control-plane-readiness-constants.js';
import {
  STARTUP_AUTHORITY_ADMISSION_STATE,
  buildStartupAuthoritySnapshotContract,
  isStartupProjectionActiveGateBlocked,
  isStartupProjectionActiveGateRecoveryOpen,
  normalizeStartupProjectionActiveGate,
  normalizeStartupProjectionReadinessContract,
} from './startup-authority-snapshot-contract.js';
import {
  resolvePriorityRecoveryActiveNodeCohort,
} from './priority-recovery-snapshot.js';
import {
  PUBLICATION_RECOVERY_GATE_STATE,
  buildPublicationRecoveryGateSnapshot,
} from './publication-recovery-gate.js';
import {
  PROJECTION_READINESS_ACTIVE_GATE_STATE,
  PROJECTION_READINESS_REASON,
} from './projection-readiness-constants.js';

const arrayIsArray = Array.isArray;
const arrayPrototypeIncludes = Function.call.bind(Array.prototype.includes);
const arrayPrototypePush = Function.call.bind(Array.prototype.push);
const arrayPrototypeSort = Function.call.bind(Array.prototype.sort);
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectHasOwn = Object.hasOwn;
const PRIORITY_PARTITION_SUMMARY_FIELD = 'priorityPartitionSummary';
const reflectOwnKeys = Reflect.ownKeys;
const OWN_DATA_VALUE_FIELD = 'value';
const ARRAY_INDEX_ZERO_FIELD = '0';
const ARRAY_INDEX_ONE_FIELD = '1';
const ABSENT = Symbol('startup-authority-snapshot-absent');

function readOwnData(target, field) {
  if (!target || typeof target !== 'object' || !objectHasOwn(target, field)) {
    return ABSENT;
  }
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD) ?
    descriptor.value : ABSENT;
}

function copyOwnDataObject(value) {
  if (!value || typeof value !== 'object') return null;
  const copy = {};
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    if (!descriptor || !objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD)) {
      continue;
    }
    objectDefineProperty(copy, key, {
      value: descriptor.value,
      enumerable: descriptor.enumerable,
      configurable: true,
      writable: true,
    });
  }
  return copy;
}

function normalizePriorityPartitionSummary(value) {
  const summary = copyOwnDataObject(value);
  if (!summary) return {summary: null, satisfied: ABSENT};
  const satisfied = readOwnData(summary, 'satisfied');
  return {
    summary: objectFreeze(summary),
    satisfied:
      satisfied === true || satisfied === false ? satisfied : ABSENT,
  };
}

function appendOwnUniqueStrings(target, values, allowed = null) {
  if (!arrayIsArray(values)) return;
  for (let index = 0; index < values.length; index += 1) {
    const value = readOwnData(values, String(index));
    if (typeof value !== 'string' || value.length === 0) continue;
    if (allowed && !arrayPrototypeIncludes(allowed, value)) continue;
    if (!arrayPrototypeIncludes(target, value)) arrayPrototypePush(target, value);
  }
}

function buildUniqueStringList(first, second = null, finalValue = null) {
  const values = [];
  appendOwnUniqueStrings(values, first);
  appendOwnUniqueStrings(values, second);
  if (
    typeof finalValue === 'string' && finalValue.length > 0 &&
    !arrayPrototypeIncludes(values, finalValue)
  ) {
    arrayPrototypePush(values, finalValue);
  }
  return values;
}

function isStartupProjectionActiveGateServeEligibleInFlight(
  activeGate,
  prioritySpreadDurablySatisfied,
) {
  // Only the stronger REPAIR_READY state (repair lane ready, serve blocked)
  // is eligible; INTERNAL_READY means the repair lane itself is not ready.
  if (
    activeGate?.state !==
    PROJECTION_READINESS_ACTIVE_GATE_STATE.REPAIR_READY
  ) {
    return false;
  }
  if (prioritySpreadDurablySatisfied !== true) {
    return false;
  }
  const reasonCodes = arrayIsArray(activeGate?.reasonCodes) ?
    activeGate.reasonCodes :
    [];
  // FAIL-CLOSED allowlist: relax only when the active gate's serve-lane
  // reasonCodes are EXACTLY priority_recovery_active — i.e. the sole thing
  // keeping the serve lane closed is the in-flight recovery op, with no other
  // disqualifier (serve_not_eligible, publication_stream_*, AND internal-lane
  // reasons such as cluster_member_unhealthy that can ride along in
  // REPAIR_READY). Any other reason, or a summarized snapshot whose reasonCodes
  // were dropped to bound the served payload, keeps the node conservatively
  // RECOVERY_PENDING. An allowlist (not a disqualifier blocklist) stays safe if
  // new lane reasons are added later.
  return (
    arrayPrototypeIncludes(
      reasonCodes,
      PROJECTION_READINESS_REASON.PRIORITY_RECOVERY_ACTIVE,
    ) && reasonCodes.length === 1
  );
}

export {
  STARTUP_AUTHORITY_ADMISSION_STATE,
  buildPriorityRecoveryHealthDetailsFromStartupAuthority,
  buildStartupAuthorityAdmissionDescriptor,
  buildStartupAuthorityFailureDescriptor,
  buildStartupAuthorityPriorityPartitionDescriptor,
  buildStartupAuthorityPublicationDescriptor,
  buildStartupAuthorityRecoveryProtocolDescriptor,
  buildStartupAuthoritySnapshotContract,
  buildStartupAuthorityTargetParticipationDescriptor,
} from './startup-authority-snapshot-contract.js';

const LOCAL_STR_CONTROL_PLANE_RECOVERY_SERVICE_UNAVAILAB = 'control_plane_recovery_service_unavailable';
const LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_PROVIDER = 'control_plane_recovery_planning_provider_unavailable';
const LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_READ_FAI = 'control_plane_recovery_planning_read_failed';
const LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_UNAVAILA = 'control_plane_recovery_planning_unavailable';
const LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_INCOMPLE = 'control_plane_recovery_planning_incomplete';
const LOCAL_STR_READY = 'ready';
const LOCAL_STR_RECOVERY_PENDING = 'recovery_pending';
const LOCAL_STR_SEED_LOCALLY_READY_UNPUBLISHED = 'seed_locally_ready_unpublished';
const LOCAL_STR_AUTHORITY_UNAVAILABLE = 'authority_unavailable';
const LOCAL_STR_BLOCKED = 'blocked';

export const PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE = Object.freeze({
  SERVICE_UNAVAILABLE: LOCAL_STR_CONTROL_PLANE_RECOVERY_SERVICE_UNAVAILAB,
  PLANNING_PROVIDER_UNAVAILABLE:
    LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_PROVIDER,
  PLANNING_READ_FAILED: LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_READ_FAI,
  PLANNING_UNAVAILABLE: LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_UNAVAILA,
  PLANNING_INCOMPLETE: LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_INCOMPLE,
});

export const STARTUP_AUTHORITY_STATE = Object.freeze({
  READY: LOCAL_STR_READY,
  RECOVERY_PENDING: LOCAL_STR_RECOVERY_PENDING,
  SEED_LOCALLY_READY_UNPUBLISHED: LOCAL_STR_SEED_LOCALLY_READY_UNPUBLISHED,
  AUTHORITY_UNAVAILABLE: LOCAL_STR_AUTHORITY_UNAVAILABLE,
  BLOCKED: LOCAL_STR_BLOCKED,
});

function projectionSynchronizationReasonsAreExact(reasonCodes, spread) {
  if (!arrayIsArray(reasonCodes)) return false;
  const publicationPending =
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING;
  const spreadPending =
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD;
  if (spread === true) {
    return reasonCodes.length === 1 &&
      readOwnData(reasonCodes, ARRAY_INDEX_ZERO_FIELD) === publicationPending;
  }
  return spread === false && reasonCodes.length === 2 &&
    readOwnData(reasonCodes, ARRAY_INDEX_ZERO_FIELD) === publicationPending &&
    readOwnData(reasonCodes, ARRAY_INDEX_ONE_FIELD) === spreadPending;
}

export function isStartupAuthorityProjectionSynchronization(evidence) {
  if (!evidence || typeof evidence !== 'object') return false;
  const ready = readOwnData(evidence, 'ready');
  const state = readOwnData(evidence, 'state');
  const spread = readOwnData(evidence, 'prioritySpreadSatisfied');
  const reasonCodes = readOwnData(evidence, 'recoveryReasonCodes');
  return ready === false &&
    state === STARTUP_AUTHORITY_STATE.RECOVERY_PENDING &&
    projectionSynchronizationReasonsAreExact(reasonCodes, spread);
}

const STARTUP_AUTHORITY_PUBLICATION_STATE = Object.freeze({
  AUTHORITATIVE: 'authoritative',
  ESTABLISHING: 'establishing',
});
const STARTUP_AUTHORITY_TRANSITIONAL_RECOVERY_GATE_STATE = objectFreeze([
  PUBLICATION_RECOVERY_GATE_STATE.PUBLICATION_PENDING,
  PUBLICATION_RECOVERY_GATE_STATE.ACK_PENDING,
  PUBLICATION_RECOVERY_GATE_STATE.PRIORITY_SPREAD_PENDING,
]);
const STARTUP_AUTHORITY_PRIORITY_RECOVERY_REASON_CODES = objectFreeze([
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.RECOVERY_ELIGIBILITY_PENDING,
]);

function hasKnownStartupAuthorityString(value) {
  return typeof value === 'string' && value.length > 0;
}

function hasStartupAuthorityTargetParticipationEvidence(targetParticipation) {
  return targetParticipation && typeof targetParticipation === 'object';
}

function normalizeStartupAuthorityTargetParticipationRecoveryReasons(
  targetParticipation,
) {
  const normalized = [];
  const reasons = readOwnData(targetParticipation, 'reasons');
  appendOwnUniqueStrings(
    normalized,
    reasons,
    STARTUP_AUTHORITY_PRIORITY_RECOVERY_REASON_CODES,
  );
  return objectFreeze(normalized);
}

function hasStartupAuthorityPriorityPartitionEvidence(priorityPartitionSummary) {
  return priorityPartitionSummary &&
    typeof priorityPartitionSummary === 'object';
}

export function hasTransitionalStartupAuthorityEvidence(options = {}) {
  const publicationRecoveryGate =
    options.publicationRecoveryGate &&
      typeof options.publicationRecoveryGate === 'object' ?
      options.publicationRecoveryGate :
      null;
  const canonicalStartupNodeIds = Array.isArray(options.canonicalStartupNodeIds) ?
    options.canonicalStartupNodeIds :
    [];
  if (!publicationRecoveryGate || canonicalStartupNodeIds.length === 0) {
    return false;
  }
  const activeGate =
    publicationRecoveryGate.active === true ||
    arrayPrototypeIncludes(
      STARTUP_AUTHORITY_TRANSITIONAL_RECOVERY_GATE_STATE,
      publicationRecoveryGate.state,
    );
  if (!activeGate) {
    return false;
  }
  return hasKnownStartupAuthorityString(options.publicationStatus) ||
    hasStartupAuthorityPriorityPartitionEvidence(
      options.priorityPartitionSummary,
    ) ||
    hasKnownStartupAuthorityString(options.recoveryProtocolState) ||
    hasStartupAuthorityTargetParticipationEvidence(options.targetParticipation) ||
    (Array.isArray(publicationRecoveryGate.reasonCodes) &&
      publicationRecoveryGate.reasonCodes.length > 0);
}

export function buildStartupAuthorityUnavailableSnapshot(
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
  return buildStartupAuthoritySnapshotContract({
    state: STARTUP_AUTHORITY_STATE.AUTHORITY_UNAVAILABLE,
    ready: false,
    authorityAvailable: false,
    publicationEpoch:
      Number.isFinite(details.publicationEpoch) ?
        details.publicationEpoch :
        undefined,
    publicationStatus:
      typeof details.publicationStatus === 'string' &&
      details.publicationStatus.length > 0 ?
        details.publicationStatus :
        undefined,
    publicationObservationState:
      typeof details.publicationObservationState === 'string' &&
      details.publicationObservationState.length > 0 ?
        details.publicationObservationState :
        AUTHORITY_PUBLICATION_OBSERVATION_STATE.OBSERVATION_UNAVAILABLE,
    priorityPartitionSummary:
      details.priorityPartitionSummary &&
      typeof details.priorityPartitionSummary === 'object' ?
        details.priorityPartitionSummary :
        undefined,
    recoveryProtocolState:
      typeof details.recoveryProtocolState === 'string' &&
      details.recoveryProtocolState.length > 0 ?
        details.recoveryProtocolState :
        undefined,
    targetParticipation:
      details.targetParticipation &&
      typeof details.targetParticipation === 'object' ?
        details.targetParticipation :
        undefined,
    projectionReadinessContract:
      details.projectionReadinessContract &&
      typeof details.projectionReadinessContract === 'object' ?
        details.projectionReadinessContract :
        undefined,
    priorityRecoveryReasonCodes: [],
    canonicalStartupNodeIds: details.canonicalStartupNodeIds,
    failureReason,
  });
}

// The startup-authority snapshot is a pure derivation of the planning
// answer, yet it was rebuilt (with a fresh recovery-gate construction) on
// every getStartupAuthorityNodeIdSet call — the top-ranked producer of the
// live gate-build storm (x699 per cycle; archived run
// 18-53-48-768Z-natural-manual). One snapshot per answer identity; callers
// that mint fresh answers per read simply miss.
const STARTUP_AUTHORITY_SNAPSHOT_BY_ANSWER = new WeakMap();

export function buildStartupAuthoritySnapshotFromPlanningAnswer(
  planningSnapshot,
) {
  if (!planningSnapshot || typeof planningSnapshot !== 'object') {
    return buildStartupAuthorityUnavailableSnapshot(
      PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_UNAVAILABLE,
    );
  }
  const memoized = STARTUP_AUTHORITY_SNAPSHOT_BY_ANSWER.get(planningSnapshot);
  if (memoized) {
    return memoized;
  }
  const snapshot =
    buildStartupAuthoritySnapshotFromPlanningAnswerUncached(planningSnapshot);
  STARTUP_AUTHORITY_SNAPSHOT_BY_ANSWER.set(planningSnapshot, snapshot);
  return snapshot;
}

function buildStartupAuthoritySnapshotFromPlanningAnswerUncached(
  planningSnapshot,
) {
  const safePlanningSnapshot = copyOwnDataObject(planningSnapshot);
  const planningPriorityPartition = normalizePriorityPartitionSummary(
    readOwnData(safePlanningSnapshot, PRIORITY_PARTITION_SUMMARY_FIELD),
  );
  if (planningPriorityPartition.summary) {
    objectDefineProperty(
      safePlanningSnapshot,
      PRIORITY_PARTITION_SUMMARY_FIELD,
      {
        value: planningPriorityPartition.summary,
        enumerable: true,
        configurable: true,
        writable: true,
      },
    );
  }
  const publicationRecoveryGate =
    buildPublicationRecoveryGateSnapshot(safePlanningSnapshot);
  const projectionReadinessContract =
    normalizeStartupProjectionReadinessContract(planningSnapshot);
  const projectionReadinessActiveGate =
    normalizeStartupProjectionActiveGate(projectionReadinessContract);
  const publicationStatus = publicationRecoveryGate.publicationStatus || null;
  const gatePriorityPartition = normalizePriorityPartitionSummary(
    readOwnData(publicationRecoveryGate, 'priorityPartitionSummary'),
  );
  const priorityPartitionEvidence = gatePriorityPartition.summary ?
    gatePriorityPartition : planningPriorityPartition;
  const priorityPartitionSummary = priorityPartitionEvidence.summary;
  const prioritySpreadSatisfied = priorityPartitionEvidence.satisfied;
  const recoveryActiveNodeIds =
    resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds;
  const formationPlacementNodeIds =
    planningSnapshot.membershipLifecycleSummary?.formationPlacementNodeIds;
  const canonicalStartupNodeIds = buildUniqueStringList(
    recoveryActiveNodeIds,
    formationPlacementNodeIds,
  );
  arrayPrototypeSort(canonicalStartupNodeIds);
  const publicationObservationState =
    publicationRecoveryGate.publicationObservationState;
  const targetParticipation =
    planningSnapshot.targetParticipation &&
    typeof planningSnapshot.targetParticipation === 'object' ?
      planningSnapshot.targetParticipation :
      null;
  const admissionState =
    typeof planningSnapshot.admissionState === 'string' ?
      planningSnapshot.admissionState :
      undefined;
  const admissionReasonCodes = Array.isArray(
    planningSnapshot.admissionReasonCodes,
  ) ?
    planningSnapshot.admissionReasonCodes :
    [];
  const clusterIncarnationFence =
    planningSnapshot.clusterIncarnationFence &&
      typeof planningSnapshot.clusterIncarnationFence === 'object' ?
      planningSnapshot.clusterIncarnationFence :
      null;
  const targetParticipationReasons =
    normalizeStartupAuthorityTargetParticipationRecoveryReasons(
      targetParticipation,
    );
  // The priority summary is the canonical spread predicate.  Publication
  // stream fields and their derived reason list can advance on adjacent cache
  // observations, so bind a negative predicate to its recovery state here in
  // the snapshot owner.  No consumer may observe READY alongside an explicit
  // false spread summary merely because the stream reason arrived one event
  // later.
  const prioritySpreadUnsatisfied = prioritySpreadSatisfied === false;
  const priorityRecoveryReasonCodes = buildUniqueStringList(
    publicationRecoveryGate.reasonCodes,
    targetParticipationReasons,
    prioritySpreadUnsatisfied ?
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD :
      null,
  );
  const explicitAdmissionBlocked =
    admissionState === STARTUP_AUTHORITY_ADMISSION_STATE.BLOCKED;

  if (explicitAdmissionBlocked) {
    return buildStartupAuthoritySnapshotContract({
      state: STARTUP_AUTHORITY_STATE.BLOCKED,
      ready: false,
      authorityAvailable: true,
      publicationEpoch:
        Number.isFinite(planningSnapshot.publicationEpoch) ?
          planningSnapshot.publicationEpoch :
          undefined,
      publicationStatus:
        typeof publicationStatus === 'string' &&
          publicationStatus.length > 0 ?
          publicationStatus :
          undefined,
      publicationObservationState,
      priorityPartitionSummary: priorityPartitionSummary || undefined,
      recoveryProtocolState:
        typeof planningSnapshot.recoveryProtocolState === 'string' ?
          planningSnapshot.recoveryProtocolState :
          undefined,
      targetParticipation: targetParticipation || undefined,
      admissionState,
      admissionReasonCodes,
      clusterIncarnationFence,
      priorityRecoveryReasonCodes,
      canonicalStartupNodeIds,
      publicationRecoveryGate,
      projectionReadinessContract,
    });
  }

  if (
    publicationRecoveryGate.state ===
      PUBLICATION_RECOVERY_GATE_STATE.UNPUBLISHED_OBSERVATION ||
    publicationObservationState ===
      AUTHORITY_PUBLICATION_OBSERVATION_STATE.UNPUBLISHED
  ) {
    const priorityRecoveryReasonCodes = buildUniqueStringList(
      publicationRecoveryGate.reasonCodes,
      null,
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    );
    return buildStartupAuthoritySnapshotContract({
      state: STARTUP_AUTHORITY_STATE.SEED_LOCALLY_READY_UNPUBLISHED,
      ready: false,
      authorityAvailable: true,
      publicationObservationState,
      priorityPartitionSummary: priorityPartitionSummary || undefined,
      recoveryProtocolState:
        typeof planningSnapshot.recoveryProtocolState === 'string' ?
          planningSnapshot.recoveryProtocolState :
          undefined,
      targetParticipation:
        planningSnapshot.targetParticipation &&
        typeof planningSnapshot.targetParticipation === 'object' ?
          planningSnapshot.targetParticipation :
          undefined,
      admissionState,
      admissionReasonCodes,
      clusterIncarnationFence,
      priorityRecoveryReasonCodes,
      canonicalStartupNodeIds,
      publicationRecoveryGate,
      projectionReadinessContract,
    });
  }

  const transitionalRecoveryPending =
    hasTransitionalStartupAuthorityEvidence({
      publicationRecoveryGate,
      publicationStatus,
      priorityPartitionSummary,
      recoveryProtocolState: planningSnapshot.recoveryProtocolState,
      targetParticipation,
      canonicalStartupNodeIds,
    });

  if (
    typeof publicationStatus !== 'string' ||
    publicationStatus.length === 0
  ) {
    if (transitionalRecoveryPending) {
      return buildStartupAuthoritySnapshotContract({
        state: STARTUP_AUTHORITY_STATE.RECOVERY_PENDING,
        ready: false,
        authorityAvailable: true,
        publicationEpoch:
          Number.isFinite(planningSnapshot.publicationEpoch) ?
            planningSnapshot.publicationEpoch :
            undefined,
        publicationObservationState:
          publicationObservationState ||
          STARTUP_AUTHORITY_PUBLICATION_STATE.ESTABLISHING,
        priorityPartitionSummary: priorityPartitionSummary || undefined,
        recoveryProtocolState:
          typeof planningSnapshot.recoveryProtocolState === 'string' ?
            planningSnapshot.recoveryProtocolState :
            undefined,
        targetParticipation: targetParticipation || undefined,
        admissionState,
        admissionReasonCodes,
        clusterIncarnationFence,
        priorityRecoveryReasonCodes,
        canonicalStartupNodeIds,
        publicationRecoveryGate,
        projectionReadinessContract,
      });
    }
    return buildStartupAuthorityUnavailableSnapshot(
      PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_INCOMPLETE,
      null,
      {
        publicationEpoch:
          Number.isFinite(planningSnapshot.publicationEpoch) ?
            planningSnapshot.publicationEpoch :
            undefined,
        publicationStatus: publicationStatus || undefined,
        publicationObservationState,
        canonicalStartupNodeIds,
        admissionState,
        admissionReasonCodes,
        clusterIncarnationFence,
        publicationRecoveryGate,
        projectionReadinessContract,
      },
    );
  }

  if (
    !priorityPartitionSummary ||
    prioritySpreadSatisfied === ABSENT
  ) {
    if (transitionalRecoveryPending) {
      return buildStartupAuthoritySnapshotContract({
        state: STARTUP_AUTHORITY_STATE.RECOVERY_PENDING,
        ready: false,
        authorityAvailable: true,
        publicationEpoch:
          Number.isFinite(planningSnapshot.publicationEpoch) ?
            planningSnapshot.publicationEpoch :
            undefined,
        publicationStatus,
        publicationObservationState:
          publicationObservationState ||
          STARTUP_AUTHORITY_PUBLICATION_STATE.ESTABLISHING,
        priorityPartitionSummary: priorityPartitionSummary || undefined,
        recoveryProtocolState:
          typeof planningSnapshot.recoveryProtocolState === 'string' ?
            planningSnapshot.recoveryProtocolState :
            undefined,
        targetParticipation: targetParticipation || undefined,
        admissionState,
        admissionReasonCodes,
        clusterIncarnationFence,
        priorityRecoveryReasonCodes,
        canonicalStartupNodeIds,
        publicationRecoveryGate,
        projectionReadinessContract,
      });
    }
    return buildStartupAuthorityUnavailableSnapshot(
      PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_INCOMPLETE,
      null,
      {
        publicationEpoch:
          Number.isFinite(planningSnapshot.publicationEpoch) ?
            planningSnapshot.publicationEpoch :
            undefined,
        publicationStatus,
        priorityPartitionSummary,
        recoveryProtocolState:
          typeof planningSnapshot.recoveryProtocolState === 'string' ?
            planningSnapshot.recoveryProtocolState :
            undefined,
        targetParticipation:
          planningSnapshot.targetParticipation &&
          typeof planningSnapshot.targetParticipation === 'object' ?
            planningSnapshot.targetParticipation :
            undefined,
        admissionState,
        admissionReasonCodes,
        clusterIncarnationFence,
        canonicalStartupNodeIds,
        publicationRecoveryGate,
        projectionReadinessContract,
      },
    );
  }

  const blocked =
    (
      targetParticipationReasons.length > 0 &&
      canonicalStartupNodeIds.length === 0
    ) ||
    isStartupProjectionActiveGateBlocked(projectionReadinessActiveGate);
  // A node whose voter-ready (durable) priority spread is satisfied is
  // serve-eligible even while a recovery operation is still in flight, PROVIDED
  // the only thing the projection active gate is waiting on is that in-flight
  // op (no serve/publication disqualifier). Treating spread_satisfied_in_flight
  // as recovery_pending withheld serve-eligibility cluster-wide — the root of
  // the rolling-restart run3 (seed LEADER_METADATA_INCOMPLETE) and run7 (load
  // nodeSlotUnavailable) gate failures. The durable summary (not the optimistic
  // closure-witness one) keeps this voter-ready-sound regardless of the in-flight
  // spread optimism (which the stall un-mask only withdraws once a remove-dispatch
  // op is stalled past its budget without a voter-ready target).
  const prioritySpreadDurablySatisfied =
    publicationRecoveryGate.durablePriorityPartitionSummary?.satisfied === true;
  const activeGateRecoveryServeEligible =
    isStartupProjectionActiveGateServeEligibleInFlight(
      projectionReadinessActiveGate,
      prioritySpreadDurablySatisfied,
    );
  const activeGateRecoveryBlocksReadiness =
    isStartupProjectionActiveGateRecoveryOpen(projectionReadinessActiveGate) &&
    !activeGateRecoveryServeEligible;
  const state = blocked ?
    STARTUP_AUTHORITY_STATE.BLOCKED :
    (priorityRecoveryReasonCodes.length > 0 ||
      activeGateRecoveryBlocksReadiness ?
      STARTUP_AUTHORITY_STATE.RECOVERY_PENDING :
      STARTUP_AUTHORITY_STATE.READY);

  return buildStartupAuthoritySnapshotContract({
    state,
    ready: state === STARTUP_AUTHORITY_STATE.READY,
    authorityAvailable: true,
    publicationEpoch:
      Number.isFinite(planningSnapshot.publicationEpoch) ?
        planningSnapshot.publicationEpoch :
        undefined,
    publicationStatus,
    publicationObservationState:
      publicationObservationState ||
      (state === STARTUP_AUTHORITY_STATE.READY ?
        STARTUP_AUTHORITY_PUBLICATION_STATE.AUTHORITATIVE :
        STARTUP_AUTHORITY_PUBLICATION_STATE.ESTABLISHING),
    priorityPartitionSummary,
    recoveryProtocolState:
      typeof planningSnapshot.recoveryProtocolState === 'string' ?
        planningSnapshot.recoveryProtocolState :
        undefined,
    targetParticipation: targetParticipation || undefined,
    admissionState,
    admissionReasonCodes,
    clusterIncarnationFence,
    priorityRecoveryReasonCodes,
    canonicalStartupNodeIds,
    publicationRecoveryGate,
    projectionReadinessContract,
  });
}
