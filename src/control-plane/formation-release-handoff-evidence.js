import {STARTUP_AUTHORITY_STATE} from './startup-authority-snapshot-owner.js';
import {COLUMN, NODE_STATE, STATE} from '../constants/index.js';

const arrayIsArray = Array.isArray;
const arrayPrototypeIncludes = Function.call.bind(Array.prototype.includes);
const arrayPrototypeJoin = Function.call.bind(Array.prototype.join);
const arrayPrototypePush = Function.call.bind(Array.prototype.push);
const arrayPrototypeSort = Function.call.bind(Array.prototype.sort);
const mapPrototypeSet = Function.call.bind(Map.prototype.set);
const SafeMap = Map;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const stringPrototypeStartsWith = Function.call.bind(String.prototype.startsWith);
const stringPrototypeToLowerCase = Function.call.bind(String.prototype.toLowerCase);

const OWN_DATA_VALUE_FIELD = 'value';
const NO_FENCE_IDENTITY = 'none';
const FENCE_FIELD_ADMISSION = 'admission';
const FENCE_FIELD_CLUSTER_INCARNATION_FENCE = 'clusterIncarnationFence';
const FENCE_FIELD_ALLOWED = 'allowed';
const FENCE_FIELD_STATE = 'state';
const FENCE_FIELD_LOCAL_IDENTITY_STATE = 'localIdentityState';
const FENCE_FIELD_DURABLE_MEMBERSHIP_STATE = 'durableMembershipState';
const FENCE_FIELD_PEER_PROOF_STATE = 'peerProofState';
const FENCE_PARTS_HEAD = 'allowed';
const FENCE_PART_SEPARATOR = ':';
const EMPTY_STRING = '';
const ABSENT = Symbol('formation-release-handoff-absent');

// Explicit typed-outcome vocabulary (system-guidelines §4.5): evidence
// lookups never encode "no usable evidence" as a raw null/undefined. Every
// normalization/binding helper returns an EVIDENCE_OUTCOME-tagged result.
const EVIDENCE_OUTCOME = objectFreeze({
  PRESENT: 'present',
  ABSENT: 'absent',
  INVALID: 'invalid',
});

function evidencePresent(value) {
  return objectFreeze({outcome: EVIDENCE_OUTCOME.PRESENT, value});
}
function evidenceAbsent() {
  return objectFreeze({outcome: EVIDENCE_OUTCOME.ABSENT});
}
function evidenceInvalid() {
  return objectFreeze({outcome: EVIDENCE_OUTCOME.INVALID});
}

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
function listIsSubset(values, allowed) {
  for (let index = 0; index < values.length; index += 1) {
    if (!arrayPrototypeIncludes(allowed, values[index])) {
      return false;
    }
  }
  return true;
}
function listsAreDisjoint(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (arrayPrototypeIncludes(right, left[index])) {
      return false;
    }
  }
  return true;
}
function listCoversCohort(readyNodeIds, pendingNodeIds, cohortNodeIds) {
  if (readyNodeIds.length + pendingNodeIds.length !== cohortNodeIds.length) {
    return false;
  }
  for (let index = 0; index < cohortNodeIds.length; index += 1) {
    if (
      !arrayPrototypeIncludes(readyNodeIds, cohortNodeIds[index]) &&
      !arrayPrototypeIncludes(pendingNodeIds, cohortNodeIds[index])
    ) {
      return false;
    }
  }
  return true;
}
function buildFenceIdentity(startupAuthority) {
  const admission = readOwnData(startupAuthority, FENCE_FIELD_ADMISSION);
  if (!admission || typeof admission !== 'object') {
    return NO_FENCE_IDENTITY;
  }
  const fence = readOwnData(admission, FENCE_FIELD_CLUSTER_INCARNATION_FENCE);
  if (fence === ABSENT || fence === null) {
    return NO_FENCE_IDENTITY;
  }
  if (!fence || typeof fence !== 'object') {
    return null;
  }
  const allowed = readOwnData(fence, FENCE_FIELD_ALLOWED);
  if (allowed !== true) {
    return null;
  }
  const identityFields = [
    FENCE_FIELD_STATE,
    FENCE_FIELD_LOCAL_IDENTITY_STATE,
    FENCE_FIELD_DURABLE_MEMBERSHIP_STATE,
    FENCE_FIELD_PEER_PROOF_STATE,
  ];
  const parts = [FENCE_PARTS_HEAD];
  for (let index = 0; index < identityFields.length; index += 1) {
    const field = identityFields[index];
    const value = readOwnData(fence, field);
    if (value !== ABSENT && typeof value !== 'string') {
      return null;
    }
    arrayPrototypePush(parts, value === ABSENT ? EMPTY_STRING : value);
  }
  return arrayPrototypeJoin(parts, FENCE_PART_SEPARATOR);
}
// A fence identity the authority PUBLISHED in its durable contract is either
// the explicit no-fence token or an allowed admission fence rendered by
// buildFenceIdentity above; a consumer validates that published grammar rather
// than re-deriving a fence from its own admission states.
function isPublishedFenceIdentity(fenceIdentity) {
  if (typeof fenceIdentity !== 'string') return false;
  if (fenceIdentity === NO_FENCE_IDENTITY) return true;
  return stringPrototypeStartsWith(
    fenceIdentity,
    FENCE_PARTS_HEAD + FENCE_PART_SEPARATOR,
  );
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
function buildAuthorityEvidence(startupAuthority) {
  if (!startupAuthority || typeof startupAuthority !== 'object') {
    return evidenceAbsent();
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
  const recoveryReasonCodes = normalizeOwnStringArray(
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
  const fenceIdentity = buildFenceIdentity(startupAuthority);
  if (!authorityScalarEvidenceValid({
    authorityAvailable,
    ready,
    state,
    publicationEpoch,
    publicationStatus,
    prioritySpreadSatisfied,
    fenceIdentity,
  })) return evidenceInvalid();
  if (canonicalNodeIds === null || recoveryReasonCodes === null) {
    return evidenceInvalid();
  }
  return evidencePresent(objectFreeze({
    ready,
    state,
    publicationEpoch,
    publicationStatus,
    canonicalNodeIds: objectFreeze(canonicalNodeIds),
    recoveryReasonCodes: objectFreeze(recoveryReasonCodes),
    prioritySpreadSatisfied,
    fenceIdentity,
  }));
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
function isAuthorityReadyRetainable(evidence) {
  return evidence.state === STARTUP_AUTHORITY_STATE.READY &&
    evidence.prioritySpreadSatisfied === true;
}

export {
  EVIDENCE_OUTCOME,
  buildAuthorityEvidence,
  buildConnectionEvidenceById,
  buildNodeEvidenceById,
  isAuthorityReadyRetainable,
  isConnectedFormationMember,
  isCurrentReadyMember,
  isPublishedFenceIdentity,
  listCoversCohort,
  listIsSubset,
  listsAreDisjoint,
  normalizeOwnUniqueStringArray,
};
