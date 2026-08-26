import {CONTROL_PLANE_PRIORITY_RECOVERY_REASON} from './control-plane-readiness-constants.js';
import {STARTUP_AUTHORITY_STATE} from './startup-authority-snapshot-owner.js';
import {COLUMN, NODE_STATE, STATE} from '../constants/index.js';
import {
  formationReleaseCohortContainsNodeId,
  formationReleaseCohortIdentity,
  formationReleaseGenerationIdentity,
} from './formation-release-handoff-identity.js';
import {
  formationReleaseAuthorityReadyFlagIsValid, formationReleaseContractListsAreValid,
  formationReleaseObservedNodeBootMatchesExpected,
  formationReleaseStateProjectionIsValid,
} from './formation-release-handoff-state-grammar.js';
const arrayIsArray = Array.isArray;
const arrayPrototypeIncludes = Function.call.bind(Array.prototype.includes);
const arrayPrototypeJoin = Function.call.bind(Array.prototype.join);
const arrayPrototypePush = Function.call.bind(Array.prototype.push);
const arrayPrototypeSlice = Function.call.bind(Array.prototype.slice);
const arrayPrototypeSort = Function.call.bind(Array.prototype.sort);
const mapPrototypeGet = Function.call.bind(Map.prototype.get);
const mapPrototypeSet = Function.call.bind(Map.prototype.set);
const SafeMap = Map;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectDefineProperties = Object.defineProperties;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectHasOwn = Object.hasOwn;
const stringPrototypeToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const OWN_DATA_VALUE_FIELD = 'value';
const EMPTY_FENCE_IDENTITY = 'none';
const FENCE_IDENTITY_SEPARATOR = ':';
const ABSENT = Symbol('formation-release-handoff-absent');
const INVALID_FORMATION_RELEASE_CONTRACT = null;
const FORMATION_RELEASE_HANDOFF_STATE = objectFreeze({
  IDLE: 'idle', ACTIVE: 'active', TERMINAL_PENDING: 'terminal_pending',
  COMPLETE: 'complete', REVOKED: 'revoked',
});
const FORMATION_RELEASE_HANDOFF_REASON = objectFreeze({
  NO_SATISFIED_COHORT: 'no_satisfied_formation_cohort', RETAINED_UNTIL_READY:
    'retained_until_captured_cohort_ready', CAPTURED_COHORT_READY:
    'captured_cohort_ready', AUTHORITY_INCOMPATIBLE:
    'startup_authority_incompatible', COHORT_MEMBER_MISSING:
    'captured_cohort_member_missing', COHORT_INCARNATION_CHANGED:
    'captured_cohort_incarnation_changed', COHORT_MEMBER_INELIGIBLE:
    'captured_cohort_member_ineligible', TERMINAL_DURABILITY_PENDING:
    'terminal_durability_pending',
});
const RETAINABLE_RECOVERY_REASONS = objectFreeze(
  [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD]);
function readOwnData(target, field) {
  if (!target || typeof target !== 'object' || !objectHasOwn(target, field)) {
    return ABSENT;
  }
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  if (!descriptor || !objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD)) {
    return ABSENT;
  }
  return descriptor.value;
}
function readOwnString(target, field) {
  const value = readOwnData(target, field);
  return typeof value === 'string' && value.length > 0 ? value : ABSENT;
}
function readOwnSafeInteger(target, field) {
  const value = readOwnData(target, field);
  return numberIsSafeInteger(value) && value >= 0 ? value : ABSENT;
}
function normalizeOwnStringArray(target, field) {
  const values = readOwnData(target, field);
  if (!arrayIsArray(values)) {
    return null;
  }
  const normalized = [];
  for (let index = 0; index < values.length; index += 1) {
    if (!objectHasOwn(values, index)) {
      return null;
    }
    const descriptor = objectGetOwnPropertyDescriptor(values, index);
    if (
      !descriptor ||
      !objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD) ||
      typeof descriptor.value !== 'string' ||
      descriptor.value.length === 0
    ) {
      return null;
    }
    if (!arrayPrototypeIncludes(normalized, descriptor.value)) {
      arrayPrototypePush(normalized, descriptor.value);
    }
  }
  arrayPrototypeSort(normalized);
  return normalized;
}
function buildFenceEvidence(startupAuthority) {
  const admission = readOwnData(startupAuthority, 'admission');
  if (!admission || typeof admission !== 'object') {
    return objectFreeze({identity: EMPTY_FENCE_IDENTITY, admission: null});
  }
  const fence = readOwnData(admission, 'clusterIncarnationFence');
  if (fence === ABSENT || fence === null) {
    return objectFreeze({identity: EMPTY_FENCE_IDENTITY, admission: null});
  }
  if (!fence || typeof fence !== 'object') {
    return null;
  }
  const allowed = readOwnData(fence, 'allowed');
  if (allowed !== true) {
    return null;
  }
  const identityFields = [
    'state',
    'localIdentityState',
    'durableMembershipState',
    'peerProofState',
  ];
  const parts = ['allowed'];
  const fenceProjection = {allowed: true};
  for (let index = 0; index < identityFields.length; index += 1) {
    const field = identityFields[index];
    const value = readOwnData(fence, field);
    if (value !== ABSENT && typeof value !== 'string') {
      return null;
    }
    arrayPrototypePush(parts, value === ABSENT ? '' : value);
    if (value !== ABSENT) fenceProjection[field] = value;
  }
  return objectFreeze({
    identity: arrayPrototypeJoin(parts, FENCE_IDENTITY_SEPARATOR),
    admission: objectFreeze({
      clusterIncarnationFence: objectFreeze(fenceProjection),
    }),
  });
}
function buildAuthorityEvidence(startupAuthority) {
  if (!startupAuthority || typeof startupAuthority !== 'object') {
    return INVALID_FORMATION_RELEASE_CONTRACT;
  }
  const authorityAvailable = readOwnData(
    startupAuthority,
    'authorityAvailable',
  );
  const ready = readOwnData(startupAuthority, 'ready');
  const state = readOwnString(startupAuthority, 'state');
  const publicationEpoch = readOwnSafeInteger(
    startupAuthority,
    'publicationEpoch',
  );
  const publicationStatus = readOwnString(
    startupAuthority,
    'publicationStatus',
  );
  const canonicalNodeIds = normalizeOwnStringArray(
    startupAuthority,
    'canonicalStartupNodeIds',
  );
  const recoveryReasonCodes = normalizeOwnUniqueStringArray(
    startupAuthority,
    'priorityRecoveryReasonCodes',
  );
  const prioritySummary = readOwnData(
    startupAuthority,
    'priorityPartitionSummary',
  );
  const prioritySpreadSatisfied =
    prioritySummary && typeof prioritySummary === 'object' ?
      readOwnData(prioritySummary, 'satisfied') :
      ABSENT;
  const fenceEvidence = buildFenceEvidence(startupAuthority);
  const fenceIdentity = fenceEvidence?.identity || null;
  if (!authorityScalarEvidenceValid({
    authorityAvailable,
    ready,
    state,
    publicationEpoch,
    publicationStatus,
    prioritySpreadSatisfied,
    fenceIdentity,
  })) return INVALID_FORMATION_RELEASE_CONTRACT;
  if (canonicalNodeIds === null || recoveryReasonCodes === null) {
    return INVALID_FORMATION_RELEASE_CONTRACT;
  }
  return objectFreeze({
    ready,
    state,
    publicationEpoch,
    publicationStatus,
    canonicalNodeIds: objectFreeze(canonicalNodeIds),
    recoveryReasonCodes: objectFreeze(recoveryReasonCodes),
    prioritySpreadSatisfied,
    fenceIdentity,
    admission: fenceEvidence.admission,
  });
}
function authorityScalarEvidenceValid(evidence) {
  if (evidence.authorityAvailable !== true) return false;
  if (evidence.ready !== true && evidence.ready !== false) return false;
  if (evidence.state === ABSENT) return false;
  if (evidence.publicationEpoch === ABSENT) return false;
  if (evidence.publicationStatus === ABSENT) return false;
  if (evidence.prioritySpreadSatisfied === ABSENT) return false;
  return evidence.fenceIdentity !== null;
}
function buildNodeEvidence(nodeRow) {
  if (!nodeRow || typeof nodeRow !== 'object') {
    return null;
  }
  const nodeId = readOwnString(nodeRow, COLUMN.NODE_ID);
  const status = readOwnString(nodeRow, COLUMN.STATUS);
  const connectionState = readOwnString(nodeRow, COLUMN.CONNECTION_STATE);
  const bootIncarnation = readOwnSafeInteger(
    nodeRow,
    COLUMN.BOOT_INCARNATION,
  );
  const readyLeaseExpiresAt = readOwnData(
    nodeRow,
    COLUMN.READY_LEASE_EXPIRES_AT,
  );
  if (
    nodeId === ABSENT ||
    status === ABSENT ||
    connectionState === ABSENT ||
    bootIncarnation === ABSENT ||
    (
      readyLeaseExpiresAt !== null &&
      !numberIsFinite(readyLeaseExpiresAt)
    )
  ) {
    return null;
  }
  return objectFreeze({
    nodeId,
    status,
    connectionState: stringPrototypeToLowerCase(connectionState),
    bootIncarnation,
    readyLeaseExpiresAt,
  });
}
function buildNodeEvidenceById(nodeRows) {
  if (!arrayIsArray(nodeRows)) {
    return null;
  }
  const rowsById = new SafeMap();
  for (let index = 0; index < nodeRows.length; index += 1) {
    if (!objectHasOwn(nodeRows, index)) {
      return null;
    }
    const descriptor = objectGetOwnPropertyDescriptor(nodeRows, index);
    if (!descriptor || !objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD)) {
      return null;
    }
    const evidence = buildNodeEvidence(descriptor.value);
    if (!evidence) {
      return null;
    }
    mapPrototypeSet(rowsById, evidence.nodeId, evidence);
  }
  return rowsById;
}
function buildConnectionEvidenceById(connectionEvidence) {
  if (!arrayIsArray(connectionEvidence)) {
    return null;
  }
  const evidenceById = new SafeMap();
  for (let index = 0; index < connectionEvidence.length; index += 1) {
    if (!objectHasOwn(connectionEvidence, index)) {
      return null;
    }
    const descriptor = objectGetOwnPropertyDescriptor(connectionEvidence, index);
    if (!descriptor || !objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD)) {
      return null;
    }
    const value = descriptor.value;
    const nodeId = readOwnString(value, 'nodeId');
    const bootIncarnation = readOwnSafeInteger(value, 'bootIncarnation');
    const connectionId = readOwnString(value, 'connectionId');
    if (
      nodeId === ABSENT ||
      bootIncarnation === ABSENT ||
      bootIncarnation <= 0 ||
      connectionId === ABSENT
    ) {
      return null;
    }
    mapPrototypeSet(evidenceById, nodeId, objectFreeze({
      nodeId,
      bootIncarnation,
      connectionId,
    }));
  }
  return evidenceById;
}
function normalizePublishedCohort(contract) {
  const values = readOwnData(contract, 'requiredCohort');
  if (!arrayIsArray(values) || values.length === 0) {
    return null;
  }
  const cohort = [];
  const nodeIds = [];
  for (let index = 0; index < values.length; index += 1) {
    if (!objectHasOwn(values, index)) {
      return null;
    }
    const descriptor = objectGetOwnPropertyDescriptor(values, index);
    if (!descriptor || !objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD)) {
      return null;
    }
    const nodeId = readOwnString(descriptor.value, 'nodeId');
    const bootIncarnation = readOwnSafeInteger(
      descriptor.value,
      'bootIncarnation',
    );
    if (
      nodeId === ABSENT ||
      bootIncarnation === ABSENT ||
      bootIncarnation <= 0 ||
      arrayPrototypeIncludes(nodeIds, nodeId)
    ) {
      return null;
    }
    arrayPrototypePush(nodeIds, nodeId);
    arrayPrototypePush(cohort, objectFreeze({nodeId, bootIncarnation}));
  }
  return objectFreeze(cohort);
}
function normalizeOwnUniqueStringArray(target, field) {
  const values = readOwnData(target, field);
  if (!arrayIsArray(values)) {
    return null;
  }
  const normalized = [];
  for (let index = 0; index < values.length; index += 1) {
    if (!objectHasOwn(values, index)) {
      return null;
    }
    const descriptor = objectGetOwnPropertyDescriptor(values, index);
    const value = descriptor && objectHasOwn(
      descriptor,
      OWN_DATA_VALUE_FIELD,
    ) ? descriptor.value : ABSENT;
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      arrayPrototypeIncludes(normalized, value)
    ) {
      return null;
    }
    arrayPrototypePush(normalized, value);
  }
  return normalized;
}
function buildNormalizedContractParts(value) {
  const parts = {
    state: readOwnString(value, 'state'),
    reason: readOwnString(value, 'reason'),
    generation: readOwnString(value, 'generation'),
    authorityNodeId: readOwnString(value, 'authorityNodeId'),
    authorityBootIncarnation:
      readOwnSafeInteger(value, 'authorityBootIncarnation'),
    capturedPublicationEpoch:
      readOwnSafeInteger(value, 'capturedPublicationEpoch'),
    observedPublicationEpoch:
      readOwnSafeInteger(value, 'observedPublicationEpoch'),
    fenceIdentity: readOwnString(value, 'fenceIdentity'),
    canonicalNodeIds: normalizeOwnUniqueStringArray(value, 'canonicalNodeIds'),
    requiredCohort: normalizePublishedCohort(value),
    readyNodeIds: normalizeOwnUniqueStringArray(value, 'readyNodeIds'),
    pendingNodeIds: normalizeOwnUniqueStringArray(value, 'pendingNodeIds'),
    recoveryReasonCodes: normalizeOwnUniqueStringArray(
      value,
      'observedRecoveryReasonCodes',
    ),
    releaseAuthorized: readOwnData(value, 'releaseAuthorized'),
    active: readOwnData(value, 'active'),
    observedAuthorityReady: readOwnData(value, 'observedAuthorityReady'),
    pendingTerminalState: readOwnData(value, 'pendingTerminalState'),
    pendingTerminalReason: readOwnData(value, 'pendingTerminalReason'),
    cohortNodeIds: [],
  };
  if (!parts.requiredCohort) return parts;
  for (let index = 0; index < parts.requiredCohort.length; index += 1) {
    arrayPrototypePush(parts.cohortNodeIds, parts.requiredCohort[index].nodeId);
  }
  return parts;
}
function expectedContractGeneration(parts) {
  return formationReleaseGenerationIdentity(parts.capturedPublicationEpoch,
    parts.authorityNodeId, parts.authorityBootIncarnation, parts.requiredCohort);
}
function contractIdentityIsValid(parts) {
  if (parts.reason === ABSENT || parts.generation === ABSENT) return false;
  if (parts.authorityNodeId === ABSENT) return false;
  if (parts.authorityBootIncarnation === ABSENT) return false;
  if (parts.authorityBootIncarnation <= 0) return false;
  if (parts.capturedPublicationEpoch === ABSENT) return false;
  if (parts.capturedPublicationEpoch <= 0) return false;
  if (parts.observedPublicationEpoch === ABSENT) return false;
  if (parts.observedPublicationEpoch < parts.capturedPublicationEpoch) {
    return false;
  }
  if (parts.fenceIdentity === ABSENT) return false;
  return parts.generation === expectedContractGeneration(parts);
}
function normalizeFormationReleaseHandoffContract(
  value,
  {allowUnacknowledgedActive = false} = {},
) {
  if (!value || typeof value !== 'object') return null;
  const parts = buildNormalizedContractParts(value);
  if (!contractIdentityIsValid(parts)) return null;
  if (!formationReleaseContractListsAreValid(parts)) return null;
  if (!formationReleaseAuthorityReadyFlagIsValid(
    parts.observedAuthorityReady,
  )) return null;
  if (!formationReleaseStateProjectionIsValid(
    parts,
    allowUnacknowledgedActive,
    FORMATION_RELEASE_HANDOFF_STATE,
    FORMATION_RELEASE_HANDOFF_REASON,
  )) return null;
  return objectFreeze({
    state: parts.state,
    reason: parts.reason,
    active: parts.active,
    releaseAuthorized: parts.releaseAuthorized,
    generation: parts.generation,
    authorityNodeId: parts.authorityNodeId,
    authorityBootIncarnation: parts.authorityBootIncarnation,
    capturedPublicationEpoch: parts.capturedPublicationEpoch,
    observedPublicationEpoch: parts.observedPublicationEpoch,
    observedAuthorityReady: parts.observedAuthorityReady,
    fenceIdentity: parts.fenceIdentity,
    canonicalNodeIds: objectFreeze(parts.canonicalNodeIds),
    requiredCohort: objectFreeze(parts.requiredCohort),
    readyNodeIds: objectFreeze(parts.readyNodeIds),
    pendingNodeIds: objectFreeze(parts.pendingNodeIds),
    observedRecoveryReasonCodes: objectFreeze(parts.recoveryReasonCodes),
    pendingTerminalState: parts.pendingTerminalState,
    pendingTerminalReason: parts.pendingTerminalReason,
  });
}
function normalizePublishedRecoveryContract(contract) {
  const normalized = normalizeFormationReleaseHandoffContract(contract);
  if (!normalized) return null;
  if (
    normalized.state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE &&
    normalized.releaseAuthorized !== true
  ) {
    return null;
  }
  return normalized;
}
function authorizeFormationReleaseHandoffPublicationIntent(value) {
  const normalized = normalizeFormationReleaseHandoffContract(
    value,
    {allowUnacknowledgedActive: true},
  );
  if (!normalized) {
    return INVALID_FORMATION_RELEASE_CONTRACT;
  }
  return objectFreeze({
    ...normalized,
    releaseAuthorized:
      normalized.state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
  });
}
function normalizePublishedConsumerContract(contract) {
  const normalized = normalizeFormationReleaseHandoffContract(contract);
  if (
    !normalized ||
    normalized.state !== FORMATION_RELEASE_HANDOFF_STATE.ACTIVE ||
    normalized.releaseAuthorized !== true
  ) {
    return null;
  }
  const requiredCohort = normalized.requiredCohort;
  const cohortSignature = formationReleaseCohortIdentity(requiredCohort);
  return objectFreeze({
    generation: normalized.generation,
    authorityNodeId: normalized.authorityNodeId,
    authorityBootIncarnation: normalized.authorityBootIncarnation,
    capturedPublicationEpoch: normalized.capturedPublicationEpoch,
    fenceIdentity: normalized.fenceIdentity,
    canonicalNodeIds: normalized.canonicalNodeIds,
    requiredCohort,
    cohortSignature,
  });
}
function validatePublishedContractAgainstCurrent(
  normalizedContract,
  startupAuthority,
  nodeRows,
  observedAt,
  connectionEvidence,
) {
  const authority = buildAuthorityEvidence(startupAuthority);
  const rowsById = buildNodeEvidenceById(nodeRows);
  const connectionsById = buildConnectionEvidenceById(connectionEvidence);
  const generation = {
    authorityNodeId: normalizedContract.authorityNodeId,
    authorityBootIncarnation:
      normalizedContract.authorityBootIncarnation,
    publicationEpoch: normalizedContract.capturedPublicationEpoch,
    fenceIdentity: normalizedContract.fenceIdentity,
    canonicalNodeIds: normalizedContract.canonicalNodeIds,
    requiredCohort: normalizedContract.requiredCohort,
  };
  if (!authority || !rowsById || !connectionsById) return null;
  if (!numberIsFinite(observedAt)) return null;
  if (!isRetainableAuthority(authority, generation)) return null;
  return formationReleaseHandoffPhysicalEvidenceMatches(
    normalizedContract,
    rowsById,
    connectionsById,
  ) ? {authority, rowsById, connectionsById} : null;
}
function formationReleaseHandoffPhysicalEvidenceMatches(
  normalizedContract,
  rowsById,
  connectionsById,
) {
  const authorityConnection = mapPrototypeGet(
    connectionsById,
    normalizedContract.authorityNodeId,
  );
  if (!authorityConnection) return false;
  if (authorityConnection.bootIncarnation !==
      normalizedContract.authorityBootIncarnation) return false;
  for (
    let index = 0;
    index < normalizedContract.requiredCohort.length;
    index += 1
  ) {
    const member = normalizedContract.requiredCohort[index];
    const node = mapPrototypeGet(rowsById, member.nodeId);
    const connection = mapPrototypeGet(connectionsById, member.nodeId);
    if (!publishedMemberMatchesCurrent(member, node, connection)) return false;
  }
  return true;
}
function formationReleaseHandoffConsumerEvidenceMatches(
  normalizedContract,
  projectionNodeId,
  rowsById,
  connectionsById,
) {
  const authorityConnection = mapPrototypeGet(
    connectionsById,
    normalizedContract.authorityNodeId,
  );
  if (
    !authorityConnection ||
    authorityConnection.bootIncarnation !==
      normalizedContract.authorityBootIncarnation
  ) {
    return false;
  }
  for (
    let index = 0;
    index < normalizedContract.requiredCohort.length;
    index += 1
  ) {
    const member = normalizedContract.requiredCohort[index];
    if (member.nodeId !== projectionNodeId) continue;
    return publishedMemberMatchesCurrent(
      member,
      mapPrototypeGet(rowsById, member.nodeId),
      mapPrototypeGet(connectionsById, member.nodeId),
    );
  }
  return false;
}
function publishedMemberMatchesCurrent(member, node, connection) {
  if (!node || !connection) return false;
  if (connection.bootIncarnation !== member.bootIncarnation) return false;
  if (!formationReleaseObservedNodeBootMatchesExpected(member.bootIncarnation,
    node.bootIncarnation)) return false;
  if (node.status !== NODE_STATE.JOINING && node.status !== NODE_STATE.ACTIVE) {
    return false;
  }
  return node.connectionState === STATE.CONNECTED ||
    node.connectionState === STATE.READY;
}
function isConnectedFormationMember(node) {
  return node.status === NODE_STATE.JOINING &&
    (
      node.connectionState === STATE.CONNECTED ||
      node.connectionState === STATE.READY
    );
}
function isCurrentReadyMember(node, observedAt) {
  return node.status === NODE_STATE.ACTIVE &&
    numberIsFinite(node.readyLeaseExpiresAt) &&
    node.readyLeaseExpiresAt > observedAt &&
    (
      node.connectionState === STATE.CONNECTED ||
      node.connectionState === STATE.READY
    );
}
function isRetainableAuthority(evidence, generation) {
  if (!evidence || evidence.publicationEpoch < generation.publicationEpoch) {
    return false;
  }
  if (evidence.fenceIdentity !== generation.fenceIdentity) {
    return false;
  }
  if (evidence.ready === true) return readyAuthorityIsRetainable(evidence);
  return pendingAuthorityIsRetainable(evidence);
}
function formationReleaseHandoffAuthorizesNode(contract, nodeId) {
  const normalized = normalizePublishedConsumerContract(contract);
  return normalized !== null &&
    formationReleaseCohortContainsNodeId(normalized, nodeId);
}
function readyAuthorityIsRetainable(evidence) {
  return evidence.state === STARTUP_AUTHORITY_STATE.READY &&
    evidence.prioritySpreadSatisfied === true;
}
function pendingAuthorityIsRetainable(evidence) {
  if (
    evidence.state !== STARTUP_AUTHORITY_STATE.RECOVERY_PENDING ||
    evidence.prioritySpreadSatisfied !== false
  ) return false;
  if (evidence.recoveryReasonCodes.length === 0) return false;
  for (
    let index = 0;
    index < evidence.recoveryReasonCodes.length;
    index += 1
  ) {
    if (!arrayPrototypeIncludes(
      RETAINABLE_RECOVERY_REASONS,
      evidence.recoveryReasonCodes[index],
    )) {
      return false;
    }
  }
  return true;
}
function isExactFormationReleaseSpreadReopen(evidence) {
  return evidence?.ready === false && pendingAuthorityIsRetainable(evidence);
}
function freezeCohort(values) {
  const cohort = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    arrayPrototypePush(cohort, objectFreeze({
      nodeId: value.nodeId,
      bootIncarnation: value.bootIncarnation,
    }));
  }
  return objectFreeze(cohort);
}
function buildContract({
  state,
  reason,
  generation = null,
  readyNodeIds = [],
  pendingNodeIds = [],
  observedPublicationEpoch = null,
  observedAuthorityReady = null,
  observedRecoveryReasonCodes = [],
  releaseAuthorized = false,
  pendingTerminalState = null,
  pendingTerminalReason = null,
}) {
  const generationFields = contractGenerationFields(generation);
  return objectFreeze({
    state,
    reason,
    active: state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
    releaseAuthorized:
      state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE &&
      releaseAuthorized === true,
    generation: generationFields.id,
    authorityNodeId: generationFields.authorityNodeId,
    authorityBootIncarnation: generationFields.authorityBootIncarnation,
    capturedPublicationEpoch: generationFields.publicationEpoch,
    fenceIdentity: generationFields.fenceIdentity,
    canonicalNodeIds: generationFields.canonicalNodeIds,
    observedPublicationEpoch,
    observedAuthorityReady,
    observedRecoveryReasonCodes: objectFreeze(
      arrayPrototypeSlice(observedRecoveryReasonCodes),
    ),
    requiredCohort: generationFields.requiredCohort,
    readyNodeIds: objectFreeze(arrayPrototypeSlice(readyNodeIds)),
    pendingNodeIds: objectFreeze(arrayPrototypeSlice(pendingNodeIds)),
    pendingTerminalState,
    pendingTerminalReason,
  });
}
function contractGenerationFields(generation) {
  if (!generation) {
    const empty = objectFreeze([]);
    return {
      id: INVALID_FORMATION_RELEASE_CONTRACT,
      authorityNodeId: INVALID_FORMATION_RELEASE_CONTRACT,
      authorityBootIncarnation: INVALID_FORMATION_RELEASE_CONTRACT,
      publicationEpoch: INVALID_FORMATION_RELEASE_CONTRACT,
      fenceIdentity: INVALID_FORMATION_RELEASE_CONTRACT,
      canonicalNodeIds: empty,
      requiredCohort: empty,
    };
  }
  return {
    id: generation.id,
    authorityNodeId: generation.authorityNodeId,
    authorityBootIncarnation: generation.authorityBootIncarnation,
    publicationEpoch: generation.publicationEpoch,
    fenceIdentity: generation.fenceIdentity,
    canonicalNodeIds: generation.canonicalNodeIds,
    requiredCohort: generation.requiredCohort,
  };
}
function attachFormationReleaseHandoffToStartupAuthority(
  startupAuthority,
  formationReleaseHandoff,
) {
  if (!startupAuthority || typeof startupAuthority !== 'object') {
    return startupAuthority;
  }
  const descriptors = objectGetOwnPropertyDescriptors(startupAuthority);
  descriptors.formationReleaseHandoff = {
    configurable: false,
    enumerable: true,
    value: formationReleaseHandoff,
    writable: false,
  };
  if (formationReleaseHandoff?.releaseAuthorized === true) {
    descriptors.ready = {
      configurable: false,
      enumerable: true,
      value: true,
      writable: false,
    };
    descriptors.state = {
      configurable: false,
      enumerable: true,
      value: STARTUP_AUTHORITY_STATE.READY,
      writable: false,
    };
  }
  const result = {};
  objectDefineProperties(result, descriptors);
  return objectFreeze(result);
}
function validateFormationReleaseHandoffConsumerContract(
  contract,
  startupAuthority,
  nodeRows,
  observedAt,
  projectionNodeId,
  connectionEvidence = [],
) {
  const normalizedContract = normalizePublishedConsumerContract(contract);
  if (
    !normalizedContract ||
    !formationReleaseCohortContainsNodeId(
      normalizedContract,
      projectionNodeId,
    )
  ) {
    return null;
  }
  const authority = buildAuthorityEvidence(startupAuthority);
  const rowsById = buildNodeEvidenceById(nodeRows);
  const connectionsById = buildConnectionEvidenceById(connectionEvidence);
  if (
    !authority || !rowsById || !connectionsById ||
    !numberIsFinite(observedAt) ||
    !isRetainableAuthority(authority, normalizedContract) ||
    !formationReleaseHandoffConsumerEvidenceMatches(
      normalizedContract,
      projectionNodeId,
      rowsById,
      connectionsById,
    )
  ) {
    return null;
  }
  return contract;
}
export {
  FORMATION_RELEASE_HANDOFF_REASON, FORMATION_RELEASE_HANDOFF_STATE,
  attachFormationReleaseHandoffToStartupAuthority,
  authorizeFormationReleaseHandoffPublicationIntent, buildAuthorityEvidence,
  buildConnectionEvidenceById, buildContract, buildNodeEvidenceById,
  formationReleaseCohortContainsNodeId,
  formationReleaseHandoffPhysicalEvidenceMatches,
  formationReleaseHandoffConsumerEvidenceMatches,
  formationReleaseHandoffAuthorizesNode, freezeCohort,
  isConnectedFormationMember, isCurrentReadyMember,
  isExactFormationReleaseSpreadReopen, isRetainableAuthority,
  normalizeFormationReleaseHandoffContract, normalizePublishedConsumerContract,
  normalizePublishedRecoveryContract, validateFormationReleaseHandoffConsumerContract,
  validatePublishedContractAgainstCurrent,
};
