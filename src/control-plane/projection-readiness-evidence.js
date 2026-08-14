import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  PUBLICATION_OWNER_FRESHNESS_FENCE,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_REVISION_STATE,
  PUBLICATION_OWNER_STREAM_OUTCOME,
} from './publication-owner-constants.js';
import {
  buildPublicationOwnerStreamState,
  isPublicationOwnerStreamReady,
} from './publication-owner-state.js';
import {
  PROJECTION_READINESS_INPUT_CLASS,
  PROJECTION_READINESS_REASON,
} from './projection-readiness-constants.js';
import {
  hasPriorityRecoverySpreadGap,
} from './priority-recovery-planning-intent.js';
import {
  copyDenseOwnDataArray,
  copyStrictOwnDataRecord,
} from '../utils/strict-own-data.js';

const ArrayConstructor = Array;
const arrayIsArray = Array.isArray;
const arraySort = Function.call.bind(Array.prototype.sort);
const numberConstructor = Number;
const numberIsFinite = Number.isFinite;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const SetConstructor = Set;
const stringConstructor = String;
const stringTrim = Function.call.bind(String.prototype.trim);

const PROJECTION_READINESS_EMPTY = objectFreeze({
  LIST: objectFreeze(new ArrayConstructor()),
  OPTIONAL_RECORD: null,
  RECORD: objectFreeze(objectCreate(null)),
  TEXT: '',
});
const PROJECTION_READINESS_FIELD = objectFreeze({
  BOUNDARY_OUTCOME: 'boundaryOutcome',
  PUBLICATION: 'publication',
  PUBLICATION_BOUNDARY_OUTCOME: 'publicationBoundaryOutcome',
  REVISION: 'revision',
});
const PROJECTION_READINESS_INVALID = objectFreeze({
  OWN_DATA_GRAPH: objectFreeze({}),
  PUBLICATION_OWNER_STREAM: objectFreeze({}),
});
const PROJECTION_READINESS_MAX_OWN_DATA_DEPTH = 16;

function appendProjectionReadinessValue(values, value) {
  objectDefineProperty(values, values.length, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function firstProjectionReadinessObject(values) {
  for (let index = 0; index < values.length; index++) {
    if (values[index] && typeof values[index] === 'object') {
      return values[index];
    }
  }
  return null;
}

function freezeProjectionReadinessRecord(value) {
  const normalized = normalizeProjectionReadinessOwnDataGraph(value);
  return normalized === PROJECTION_READINESS_INVALID.OWN_DATA_GRAPH ||
    arrayIsArray(normalized) ?
    PROJECTION_READINESS_EMPTY.OPTIONAL_RECORD :
    normalized;
}

function readProjectionReadinessOwnRecord(record, key) {
  const normalized = freezeProjectionReadinessRecord(record);
  if (!normalized || !objectHasOwn(normalized, key)) return null;
  return freezeProjectionReadinessRecord(normalized[key]);
}

function isProjectionReadinessOwnDataPrimitive(value) {
  return value === null || typeof value === 'undefined' ||
    typeof value === 'string' || typeof value === 'number' ||
    typeof value === 'boolean' || typeof value === 'bigint';
}

function normalizeProjectionReadinessOwnDataArray(values, depth) {
  for (let index = 0; index < values.length; index++) {
    const normalized = normalizeProjectionReadinessOwnDataGraph(
      values[index],
      depth + 1,
    );
    if (normalized === PROJECTION_READINESS_INVALID.OWN_DATA_GRAPH) {
      return normalized;
    }
    objectDefineProperty(values, index, {
      configurable: true,
      enumerable: true,
      value: normalized,
      writable: true,
    });
  }
  return objectFreeze(values);
}

function normalizeProjectionReadinessOwnDataRecord(record, depth) {
  const keys = objectKeys(record);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    const normalized = normalizeProjectionReadinessOwnDataGraph(
      record[key],
      depth + 1,
    );
    if (normalized === PROJECTION_READINESS_INVALID.OWN_DATA_GRAPH) {
      return normalized;
    }
    objectDefineProperty(record, key, {
      configurable: true,
      enumerable: true,
      value: normalized,
      writable: true,
    });
  }
  return objectFreeze(record);
}

function normalizeProjectionReadinessOwnDataGraph(value, depth = 0) {
  if (isProjectionReadinessOwnDataPrimitive(value)) return value;
  if (typeof value !== 'object' ||
      depth >= PROJECTION_READINESS_MAX_OWN_DATA_DEPTH) {
    return PROJECTION_READINESS_INVALID.OWN_DATA_GRAPH;
  }
  const values = copyDenseOwnDataArray(value);
  if (values !== null) {
    return normalizeProjectionReadinessOwnDataArray(values, depth);
  }
  const record = copyStrictOwnDataRecord(value);
  return record === null ?
    PROJECTION_READINESS_INVALID.OWN_DATA_GRAPH :
    normalizeProjectionReadinessOwnDataRecord(record, depth);
}

function normalizeProjectionReadinessPublicationOwnerStream(value) {
  const normalized = normalizeProjectionReadinessOwnDataGraph(value);
  return normalized === PROJECTION_READINESS_INVALID.OWN_DATA_GRAPH ||
    arrayIsArray(normalized) ?
    PROJECTION_READINESS_EMPTY.OPTIONAL_RECORD :
    normalized;
}

function normalizeProjectionReadinessNodeIds(values = []) {
  const candidates = arrayIsArray(values) ?
    values :
    PROJECTION_READINESS_EMPTY.LIST;
  const normalized = new ArrayConstructor();
  const seen = new SetConstructor();
  for (let index = 0; index < candidates.length; index++) {
    const value = stringTrim(stringConstructor(
      candidates[index] || PROJECTION_READINESS_EMPTY.TEXT,
    ));
    if (value.length === 0 || setHas(seen, value)) continue;
    setAdd(seen, value);
    appendProjectionReadinessValue(normalized, value);
  }
  arraySort(normalized);
  return objectFreeze(normalized);
}

function normalizeProjectionReadinessReasonCodes(values = []) {
  return normalizeProjectionReadinessNodeIds(values);
}

function normalizeProjectionReadinessNonNegativeInteger(value) {
  const numericValue = numberConstructor(value);
  return numberIsFinite(numericValue) && numericValue >= 0 ?
    Math.floor(numericValue) :
    0;
}

function normalizeProjectionReadinessRevision(value) {
  const numericValue = numberConstructor(value);
  const available = numberIsFinite(numericValue) && numericValue >= 1;
  return objectFreeze({
    available,
    value: available ? Math.floor(numericValue) : 0,
  });
}

function normalizeProjectionReadinessDimensions(dimensions = null) {
  return freezeProjectionReadinessRecord(dimensions) ||
    PROJECTION_READINESS_EMPTY.RECORD;
}

function normalizeProjectionReadinessRuntimeAuthority(runtimeAuthority = null) {
  return freezeProjectionReadinessRecord(runtimeAuthority);
}

function readProjectionReadinessDimension(dimensions, dimension) {
  return typeof dimensions?.[dimension] === 'boolean' ?
    dimensions[dimension] :
    null;
}

function readProjectionReadinessBoolean(values = []) {
  for (let index = 0; index < values.length; index++) {
    if (typeof values[index] === 'boolean') return values[index];
  }
  return false;
}

function readProjectionReadinessOptionalBoolean(values = []) {
  for (let index = 0; index < values.length; index++) {
    if (typeof values[index] === 'boolean') return values[index];
  }
  return null;
}

function resolveProjectionReadinessPublicationBoundaryOutcome(source = {}) {
  const contractPublication = readProjectionReadinessOwnRecord(
    source.projectionReadinessContract,
    PROJECTION_READINESS_FIELD.PUBLICATION,
  );
  return readProjectionReadinessOwnRecord(
    source,
    PROJECTION_READINESS_FIELD.PUBLICATION_BOUNDARY_OUTCOME,
  ) || readProjectionReadinessOwnRecord(
    source.membershipPublication,
    PROJECTION_READINESS_FIELD.PUBLICATION_BOUNDARY_OUTCOME,
  ) || readProjectionReadinessOwnRecord(
    contractPublication,
    PROJECTION_READINESS_FIELD.BOUNDARY_OUTCOME,
  );
}

function resolveProjectionReadinessPublicationSource(source = {}) {
  const candidates = [
    source.publicationOwnerStreamSource,
    source.membershipPublication,
    source.publicationRecoveryGate,
  ];
  return firstProjectionReadinessObject(candidates);
}

function resolveProjectionReadinessPublicationOwnerStreamCandidate(source = {}) {
  const membershipPublication = freezeProjectionReadinessRecord(
    source.membershipPublication,
  );
  const contract = freezeProjectionReadinessRecord(
    source.projectionReadinessContract,
  );
  const contractPublication = freezeProjectionReadinessRecord(
    contract?.publication,
  );
  const candidates = [
    source.publicationOwnerStream,
    source.publicationStream,
    membershipPublication?.publicationOwnerStream,
    contractPublication?.ownerStream,
  ];
  return firstProjectionReadinessObject(candidates);
}

function buildProjectionPublicationOwnerStreamFromSource(source = null) {
  const ownSource = freezeProjectionReadinessRecord(source);
  if (!ownSource) {
    return null;
  }
  source = ownSource;
  const publicationRecoveryGate = freezeProjectionReadinessRecord(
    source.publicationRecoveryGate,
  ) || source;
  const publicationEpoch =
    source.publicationRevision ??
    source.publicationEpoch ??
    publicationRecoveryGate.publicationEpoch;
  const publicationStatus =
    source.publicationStatus ??
    source.status ??
    publicationRecoveryGate.publicationStatus;
  return buildPublicationOwnerStreamState({
    publicationRevision: publicationEpoch,
    desiredPublicationRevision:
      source.desiredPublicationRevision ?? publicationEpoch,
    committedPublicationRevision:
      source.committedPublicationRevision ??
      source.publishedPublicationRevision ??
      source.publishedPlanningEpoch,
    publicationStatus,
    publicationObservationState:
      source.publicationObservationState ??
      publicationRecoveryGate.publicationObservationState,
    recoveryProtocolState:
      source.recoveryProtocolState ??
      publicationRecoveryGate.recoveryProtocolState,
    requiredAckNodeIds:
      source.requiredAckNodeIds ??
      publicationRecoveryGate.requiredAckNodeIds,
    acknowledgedNodeIds:
      source.acknowledgedNodeIds ??
      publicationRecoveryGate.acknowledgedNodeIds,
    pendingAckNodeIds:
      source.pendingAckNodeIds ??
      publicationRecoveryGate.pendingAckNodeIds,
    pendingAckCount:
      source.pendingAckCount ??
      publicationRecoveryGate.pendingAckCount ??
      0,
    pendingAckEvidenceState:
      source.pendingAckEvidenceState ??
      publicationRecoveryGate.pendingAckEvidenceState,
    missingPublishedNodeIds:
      source.missingPublishedNodeIds ??
      source.missingPublishedRecoveryActiveNodeIds ??
      publicationRecoveryGate.missingPublishedNodeIds,
    missingPublishedCount:
      source.missingPublishedCount ??
      publicationRecoveryGate.missingPublishedCount,
    prioritySpreadPending:
      source.prioritySpreadPending === true ||
      publicationRecoveryGate.prioritySpreadPending === true,
    prioritySpreadEvidenceUnavailable:
      source.prioritySpreadEvidenceUnavailable === true ||
      publicationRecoveryGate.prioritySpreadEvidenceUnavailable === true,
  });
}

function resolveProjectionReadinessPublicationOwnerStream(source = {}) {
  const candidate =
    resolveProjectionReadinessPublicationOwnerStreamCandidate(source);
  if (candidate) {
    return normalizeProjectionReadinessPublicationOwnerStream(candidate) ||
      PROJECTION_READINESS_INVALID.PUBLICATION_OWNER_STREAM;
  }
  return buildProjectionPublicationOwnerStreamFromSource(
    resolveProjectionReadinessPublicationSource(source),
  );
}

function resolveProjectionReadinessPublicationReady({
  publicationOwnerStream,
  publicationOwnerStreamInvalid,
  publicationBoundaryOutcome,
  dimensions,
}) {
  if (publicationOwnerStreamInvalid) return false;
  if (publicationOwnerStream) {
    return isPublicationOwnerStreamReady(publicationOwnerStream);
  }
  if (typeof publicationBoundaryOutcome?.ready === 'boolean') {
    return publicationBoundaryOutcome.ready;
  }
  return dimensions[
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED
  ] === true;
}

function resolveProjectionReadinessPublicationReasonCodes({
  publicationOwnerStream,
  publicationBoundaryOutcome,
}) {
  const reasonCodes = new ArrayConstructor();
  const sources = [
    publicationOwnerStream?.reasonCodes,
    publicationBoundaryOutcome?.reasonCodes,
  ];
  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
    const source = arrayIsArray(sources[sourceIndex]) ?
      sources[sourceIndex] :
      PROJECTION_READINESS_EMPTY.LIST;
    for (let index = 0; index < source.length; index++) {
      appendProjectionReadinessValue(reasonCodes, source[index]);
    }
  }
  return normalizeProjectionReadinessReasonCodes(reasonCodes);
}

function resolveProjectionReadinessPriorityRecovery(source = {}) {
  const contract = freezeProjectionReadinessRecord(
    source.projectionReadinessContract,
  );
  return freezeProjectionReadinessRecord(
    source.priorityControlPlaneRecovery,
  ) || freezeProjectionReadinessRecord(contract?.priorityRecovery);
}

function hasProjectionReadinessStringEvidence(value) {
  return typeof value === 'string' && value.length > 0;
}

function hasProjectionReadinessListEvidence(value) {
  return arrayIsArray(value) && value.length > 0;
}

function hasProjectionReadinessCountEvidence(value) {
  return normalizeProjectionReadinessNonNegativeInteger(value) > 0;
}

function hasProjectionReadinessFiniteNumberEvidence(value) {
  return value !== null &&
    typeof value !== 'undefined' &&
    numberIsFinite(numberConstructor(value));
}

function hasProjectionReadinessPriorityRecoveryGateEvidence(
  publicationRecoveryGate = null,
) {
  if (!publicationRecoveryGate || typeof publicationRecoveryGate !== 'object') {
    return false;
  }
  return Boolean(
    hasProjectionReadinessFiniteNumberEvidence(
      publicationRecoveryGate.publicationEpoch,
    ) ||
    hasProjectionReadinessStringEvidence(
      publicationRecoveryGate.publicationStatus,
    ) ||
    hasProjectionReadinessStringEvidence(
      publicationRecoveryGate.publicationObservationState,
    ) ||
    hasProjectionReadinessStringEvidence(
      publicationRecoveryGate.recoveryProtocolState,
    ) ||
    hasProjectionReadinessListEvidence(
      publicationRecoveryGate.reasonCodes,
    ) ||
    hasProjectionReadinessListEvidence(
      publicationRecoveryGate.requiredAckNodeIds,
    ) ||
    hasProjectionReadinessListEvidence(
      publicationRecoveryGate.acknowledgedNodeIds,
    ) ||
    hasProjectionReadinessListEvidence(
      publicationRecoveryGate.pendingAckNodeIds,
    ) ||
    hasProjectionReadinessCountEvidence(
      publicationRecoveryGate.pendingAckCount,
    ) ||
    hasProjectionReadinessListEvidence(
      publicationRecoveryGate.missingPublishedNodeIds,
    ) ||
    hasProjectionReadinessCountEvidence(
      publicationRecoveryGate.missingPublishedCount,
    ),
  );
}

function hasProjectionReadinessPriorityRecoveryEvidence(
  priorityRecovery = null,
) {
  if (!priorityRecovery || typeof priorityRecovery !== 'object') {
    return false;
  }
  return Boolean(
    hasProjectionReadinessListEvidence(priorityRecovery.reasonCodes) ||
    hasProjectionReadinessFiniteNumberEvidence(
      priorityRecovery.publicationEpoch,
    ) ||
    hasProjectionReadinessStringEvidence(priorityRecovery.publicationStatus) ||
    priorityRecovery.runtimeBlocked === true ||
    priorityRecovery.publicationGateReady === true ||
    hasProjectionReadinessPriorityRecoveryGateEvidence(
      freezeProjectionReadinessRecord(
        priorityRecovery.publicationRecoveryGate,
      ),
    ),
  );
}

function resolveProjectionReadinessDurablePrioritySpreadPending(
  priorityRecovery = null,
) {
  const publicationRecoveryGate = freezeProjectionReadinessRecord(
    priorityRecovery?.publicationRecoveryGate,
  );
  const durablePriorityPartitionSummary = freezeProjectionReadinessRecord(
    publicationRecoveryGate?.durablePriorityPartitionSummary,
  );
  if (
    !durablePriorityPartitionSummary ||
    typeof durablePriorityPartitionSummary !== 'object'
  ) {
    return false;
  }
  return hasPriorityRecoverySpreadGap(durablePriorityPartitionSummary);
}

function resolveProjectionReadinessRevisionEvidence(
  source,
  publicationOwnerStream,
) {
  const nodeEvidence = freezeProjectionReadinessRecord(source.nodeEvidence);
  const localProjectionRevision = normalizeProjectionReadinessRevision(
    source.localProjectionRevision ??
      source.projectionRevision ??
      nodeEvidence?.projectionRevision,
  );
  const requiredPublicationRevision = normalizeProjectionReadinessRevision(
    source.requiredProjectionRevision ??
      source.requiredPublicationRevision ??
      publicationOwnerStream?.revision?.desired?.value ??
      publicationOwnerStream?.revision?.observed?.value,
  );
  return objectFreeze({
    localProjectionRevision,
    requiredPublicationRevision,
    stale:
      localProjectionRevision.available === true &&
      requiredPublicationRevision.available === true &&
      localProjectionRevision.value < requiredPublicationRevision.value,
  });
}

function buildProjectionReadinessEvidence(source = {}) {
  source = freezeProjectionReadinessRecord(source) ||
    PROJECTION_READINESS_EMPTY.RECORD;
  const dimensions = normalizeProjectionReadinessDimensions(source.dimensions);
  const runtimeAuthority =
    normalizeProjectionReadinessRuntimeAuthority(source.runtimeAuthority);
  const publicationBoundaryOutcome =
    resolveProjectionReadinessPublicationBoundaryOutcome(source);
  const resolvedPublicationOwnerStream =
    resolveProjectionReadinessPublicationOwnerStream(source);
  const publicationOwnerStreamInvalid = resolvedPublicationOwnerStream ===
    PROJECTION_READINESS_INVALID.PUBLICATION_OWNER_STREAM;
  const publicationOwnerStream = publicationOwnerStreamInvalid ?
    PROJECTION_READINESS_EMPTY.OPTIONAL_RECORD :
    resolvedPublicationOwnerStream;
  const publicationReady = resolveProjectionReadinessPublicationReady({
    publicationOwnerStream,
    publicationOwnerStreamInvalid,
    publicationBoundaryOutcome,
    dimensions,
  });
  const priorityRecovery =
    resolveProjectionReadinessPriorityRecovery(source);
  const publicationReasonCodes =
    resolveProjectionReadinessPublicationReasonCodes({
      publicationOwnerStream,
      publicationBoundaryOutcome,
    });
  const projectionRevision = resolveProjectionReadinessRevisionEvidence(
    source,
    publicationOwnerStream,
  );
  const projectionReadinessContract = freezeProjectionReadinessRecord(
    source.projectionReadinessContract,
  );
  const projectionReadiness = freezeProjectionReadinessRecord(
    projectionReadinessContract?.readiness,
  );
  const hasDimensionEvidence = objectKeys(dimensions).length > 0;
  const ownerEvidenceAvailable = Boolean(
    hasDimensionEvidence ||
    runtimeAuthority ||
    projectionReadinessContract,
  );
  const processAliveEvidence = readProjectionReadinessOptionalBoolean([
    readProjectionReadinessDimension(
      dimensions,
      CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE,
    ),
    runtimeAuthority?.processAlive,
  ]);
  const clusterMemberHealthy = readProjectionReadinessBoolean([
    readProjectionReadinessDimension(
      dimensions,
      CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
    ),
    runtimeAuthority?.clusterMemberHealthy,
  ]);
  const repairEligible = readProjectionReadinessBoolean([
    source.repairEligible,
    readProjectionReadinessDimension(
      dimensions,
      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    ),
    runtimeAuthority?.repairEligible,
  ]);
  const recoveryEligible = readProjectionReadinessBoolean([
    readProjectionReadinessDimension(
      dimensions,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    ),
    runtimeAuthority?.recoveryEligible,
  ]);
  const runtimeServeEligible = readProjectionReadinessBoolean([
    source.runtimeServeEligible,
    readProjectionReadinessDimension(
      dimensions,
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    ),
    projectionReadiness?.serveEligible,
  ]);

  return objectFreeze({
    ownerEvidenceAvailable,
    inputClasses: objectFreeze({
      [PROJECTION_READINESS_INPUT_CLASS.PUBLICATION_STREAM]:
        publicationOwnerStream ? true : false,
      [PROJECTION_READINESS_INPUT_CLASS.OPERATION_OUTCOME]:
        priorityRecovery ? true : false,
      [PROJECTION_READINESS_INPUT_CLASS.PLACEMENT_INTENT]:
        typeof dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE
        ] === 'boolean',
      [PROJECTION_READINESS_INPUT_CLASS.LOCAL_LIVENESS]:
        typeof dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
        ] === 'boolean' ||
        typeof runtimeAuthority?.clusterMemberHealthy === 'boolean',
      [PROJECTION_READINESS_INPUT_CLASS.DELETION]:
        source.deleted === true || source.deletionOutcome === true,
    }),
    dimensions,
    runtimeAuthority,
    processAlive:
      processAliveEvidence !== false && ownerEvidenceAvailable === true,
    clusterMemberHealthy,
    repairEligible,
    recoveryEligible,
    controlPlaneWritable:
      runtimeAuthority?.writeEligible === true ||
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
      ] === true,
    runtimeServeEligible,
    publicationReady,
    publicationOwnerStreamInvalid,
    publicationOwnerStream,
    publicationBoundaryOutcome,
    publicationReasonCodes,
    publicationFailed:
      publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.FAILED ||
      publicationOwnerStream?.freshnessFence ===
        PUBLICATION_OWNER_FRESHNESS_FENCE.FAILED ||
      publicationOwnerStream?.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.FAILED,
    publicationStreamOutcome:
      publicationOwnerStream?.streamOutcome || null,
    publicationRecoveryOutcome:
      publicationOwnerStream?.recoveryOutcome || null,
    publicationFreshnessFence:
      publicationOwnerStream?.freshnessFence || null,
    publicationRevisionState:
      publicationOwnerStream?.revision?.state ||
      PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE,
    priorityRecoveryActive:
      priorityRecovery?.active === true &&
      hasProjectionReadinessPriorityRecoveryEvidence(priorityRecovery),
    durablePrioritySpreadPending:
      resolveProjectionReadinessDurablePrioritySpreadPending(priorityRecovery),
    priorityRecoveryReasonCodes: normalizeProjectionReadinessReasonCodes(
      priorityRecovery?.reasonCodes,
    ),
    priorityRecovery,
    projectionRevision,
    reasonSeed: ownerEvidenceAvailable ?
      PROJECTION_READINESS_EMPTY.LIST :
      objectFreeze([PROJECTION_READINESS_REASON.OWNER_EVIDENCE_MISSING]),
    pendingAckCount: normalizeProjectionReadinessNonNegativeInteger(
      publicationOwnerStream?.pendingAckCount,
    ),
    missingPublishedCount: normalizeProjectionReadinessNonNegativeInteger(
      publicationOwnerStream?.missingPublishedCount,
    ),
    raw: (() => {
      const normalized = normalizeProjectionReadinessOwnDataGraph(source);
      return normalized === PROJECTION_READINESS_INVALID.OWN_DATA_GRAPH ?
        PROJECTION_READINESS_EMPTY.OPTIONAL_RECORD :
        normalized;
    })(),
  });
}

export {
  buildProjectionReadinessEvidence,
  freezeProjectionReadinessRecord,
  normalizeProjectionReadinessReasonCodes,
};
