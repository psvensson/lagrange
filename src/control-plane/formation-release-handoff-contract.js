import {CONTROL_PLANE_PRIORITY_RECOVERY_REASON} from './control-plane-readiness-constants.js';
import {STARTUP_AUTHORITY_STATE} from './startup-authority-snapshot-owner.js';
import {NODE_STATE, STATE} from '../constants/index.js';
import {formationReleaseCohortIdentity, formationReleaseGenerationIdentity} from './formation-release-handoff-identity.js';
import {
  EVIDENCE_OUTCOME,
  buildAuthorityEvidence,
  buildConnectionEvidenceById,
  buildNodeEvidenceById,
  isAuthorityReadyRetainable,
  isPublishedFenceIdentity,
  listCoversCohort,
  listIsSubset,
  listsAreDisjoint,
  normalizeOwnUniqueStringArray,
} from './formation-release-handoff-evidence.js';
const arrayIsArray = Array.isArray;
const arrayPrototypeIncludes = Function.call.bind(Array.prototype.includes);
const arrayPrototypePush = Function.call.bind(Array.prototype.push);
const arrayPrototypeSlice = Function.call.bind(Array.prototype.slice);
const mapPrototypeGet = Function.call.bind(Map.prototype.get);
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectDefineProperties = Object.defineProperties;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectHasOwn = Object.hasOwn;
const OWN_DATA_VALUE_FIELD = 'value';
const ABSENT = Symbol('formation-release-handoff-absent');
const FORMATION_RELEASE_HANDOFF_STATE = objectFreeze({
  IDLE: 'idle', ACTIVE: 'active', COMPLETE: 'complete', REVOKED: 'revoked',
});
const FORMATION_RELEASE_HANDOFF_REASON = objectFreeze({
  NO_SATISFIED_COHORT: 'no_satisfied_formation_cohort', RETAINED_UNTIL_READY:
    'retained_until_captured_cohort_ready', CAPTURED_COHORT_READY:
    'captured_cohort_ready', AUTHORITY_INCOMPATIBLE:
    'startup_authority_incompatible', COHORT_MEMBER_MISSING:
    'captured_cohort_member_missing', COHORT_INCARNATION_CHANGED:
    'captured_cohort_incarnation_changed', COHORT_MEMBER_INELIGIBLE:
    'captured_cohort_member_ineligible',
});
const RETAINABLE_RECOVERY_REASONS = objectFreeze(
  [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD]);
// Explicit typed-outcome vocabulary (system-guidelines §4.5): a publication
// authorization intent is never encoded as a raw null; absence is explicit.
const AUTHORIZATION_INTENT_OUTCOME = objectFreeze({
  AUTHORIZED: 'authorized',
  REJECTED: 'rejected',
});
// Explicit typed-role vocabulary (system-guidelines §4.5): who validates a
// published contract against current evidence decides which fence witness is
// authoritative. The AUTHORITY (seed) compares the generation fence with its
// own admission fence — that fence IS the authority fence — and vouches for
// every captured member through its own adopted primary connections. A
// CONSUMER (joiner) boots on a different startup branch, so its own admission
// fence is provably not the authority fence, and after the acceptor IDENTIFY
// reply it holds a bound connection only to the authority and to itself; it
// therefore validates the fence the authority PUBLISHED in the durable
// contract, the authority's current boot incarnation, the durable node rows,
// and its own process identity (decision-table
// formation-release-handoff-closure: joiner-consumes-durable-generation), and
// never re-derives release authority from its own admission states.
const CONTRACT_VALIDATION_ROLE = objectFreeze({
  AUTHORITY: 'authority',
  CONSUMER: 'consumer',
});
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
function contractListsAreValid(parts) {
  if (parts.canonicalNodeIds === null) return false;
  if (!parts.requiredCohort) return false;
  if (parts.readyNodeIds === null || parts.pendingNodeIds === null) return false;
  if (parts.recoveryReasonCodes === null) return false;
  if (!listIsSubset(parts.cohortNodeIds, parts.canonicalNodeIds)) return false;
  if (!listIsSubset(parts.readyNodeIds, parts.cohortNodeIds)) return false;
  if (!listIsSubset(parts.pendingNodeIds, parts.cohortNodeIds)) return false;
  return listsAreDisjoint(parts.readyNodeIds, parts.pendingNodeIds);
}
function authorityReadyFlagIsValid(value) {
  if (value === true) return true;
  if (value === false) return true;
  return value === null;
}
function activeProjectionIsValid(parts, allowUnacknowledgedActive) {
  if (parts.reason !== FORMATION_RELEASE_HANDOFF_REASON.RETAINED_UNTIL_READY) return false;
  if (parts.active !== true) return false;
  const releaseValid = parts.releaseAuthorized === true ||
    (allowUnacknowledgedActive && parts.releaseAuthorized === false);
  if (!releaseValid || parts.pendingNodeIds.length === 0) return false;
  return listCoversCohort(parts.readyNodeIds, parts.pendingNodeIds, parts.cohortNodeIds);
}
function completeProjectionIsValid(parts) {
  if (parts.reason !== FORMATION_RELEASE_HANDOFF_REASON.CAPTURED_COHORT_READY) return false;
  if (parts.active !== false || parts.releaseAuthorized !== false) return false;
  if (parts.pendingNodeIds.length !== 0) return false;
  if (parts.readyNodeIds.length !== parts.cohortNodeIds.length) return false;
  return listCoversCohort(parts.readyNodeIds, parts.pendingNodeIds, parts.cohortNodeIds);
}
function revokedProjectionIsValid(parts) {
  const reasons = FORMATION_RELEASE_HANDOFF_REASON;
  const allowedReasons = [
    reasons.AUTHORITY_INCOMPATIBLE, reasons.COHORT_MEMBER_MISSING,
    reasons.COHORT_INCARNATION_CHANGED, reasons.COHORT_MEMBER_INELIGIBLE,
  ];
  if (!arrayPrototypeIncludes(allowedReasons, parts.reason)) return false;
  if (parts.active !== false || parts.releaseAuthorized !== false) return false;
  return parts.readyNodeIds.length === 0 && parts.pendingNodeIds.length === 0;
}
function stateProjectionIsValid(parts, allowUnacknowledgedActive) {
  if (parts.state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE) {
    return activeProjectionIsValid(parts, allowUnacknowledgedActive);
  }
  if (parts.state === FORMATION_RELEASE_HANDOFF_STATE.COMPLETE) {
    return completeProjectionIsValid(parts);
  }
  if (parts.state === FORMATION_RELEASE_HANDOFF_STATE.REVOKED) {
    return revokedProjectionIsValid(parts);
  }
  return false;
}
function normalizeFormationReleaseHandoffContract(
  value,
  {allowUnacknowledgedActive = false} = {},
) {
  if (!value || typeof value !== 'object') return null;
  const parts = buildNormalizedContractParts(value);
  if (!contractIdentityIsValid(parts)) return null;
  if (!contractListsAreValid(parts)) return null;
  if (!authorityReadyFlagIsValid(parts.observedAuthorityReady)) return null;
  if (!stateProjectionIsValid(parts, allowUnacknowledgedActive)) return null;
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
  });
}
function authorizeFormationReleaseHandoffPublicationIntent(value) {
  const normalized = normalizeFormationReleaseHandoffContract(
    value,
    {allowUnacknowledgedActive: true},
  );
  if (!normalized) {
    return objectFreeze({outcome: AUTHORIZATION_INTENT_OUTCOME.REJECTED});
  }
  return objectFreeze({
    outcome: AUTHORIZATION_INTENT_OUTCOME.AUTHORIZED,
    contract: objectFreeze({
      ...normalized,
      releaseAuthorized:
        normalized.state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
    }),
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
  validationRole = CONTRACT_VALIDATION_ROLE.AUTHORITY,
) {
  const authorityResult = buildAuthorityEvidence(startupAuthority);
  const rowsById = buildNodeEvidenceById(nodeRows);
  const connectionsById = buildConnectionEvidenceById(connectionEvidence);
  if (authorityResult.outcome !== EVIDENCE_OUTCOME.PRESENT) return null;
  const authority = authorityResult.value;
  const generation = {
    authorityNodeId: normalizedContract.authorityNodeId,
    authorityBootIncarnation:
      normalizedContract.authorityBootIncarnation,
    publicationEpoch: normalizedContract.capturedPublicationEpoch,
    fenceIdentity: normalizedContract.fenceIdentity,
    canonicalNodeIds: normalizedContract.canonicalNodeIds,
    requiredCohort: normalizedContract.requiredCohort,
  };
  if (!rowsById || !connectionsById) return null;
  if (!numberIsFinite(observedAt)) return null;
  if (!isRetainableAuthority(authority, generation, validationRole)) {
    return null;
  }
  const authorityConnection = mapPrototypeGet(
    connectionsById,
    normalizedContract.authorityNodeId,
  );
  if (!authorityConnection) return null;
  if (authorityConnection.bootIncarnation !==
      normalizedContract.authorityBootIncarnation) return null;
  for (
    let index = 0;
    index < normalizedContract.requiredCohort.length;
    index += 1
  ) {
    const member = normalizedContract.requiredCohort[index];
    const node = mapPrototypeGet(rowsById, member.nodeId);
    const connection = mapPrototypeGet(connectionsById, member.nodeId);
    if (
      !publishedMemberMatchesCurrent(member, node, connection, validationRole)
    ) {
      return null;
    }
  }
  return {authority, rowsById, connectionsById};
}
// The authority vouches for every captured member through its own adopted
// primary connection. A consumer holds a bound connection only to the
// authority and to itself (its local boot-incarnation identity); the other
// members' current connections are the authority's evidence, not the
// consumer's, so an ABSENT consumer connection is not a mismatch — a PRESENT
// connection bound to another incarnation still is (a restarted peer, or the
// consumer's own restarted process).
function publishedMemberConnectionMatchesCurrent(
  member,
  connection,
  validationRole,
) {
  if (!connection) {
    return validationRole === CONTRACT_VALIDATION_ROLE.CONSUMER;
  }
  return connection.bootIncarnation === member.bootIncarnation;
}
function publishedMemberMatchesCurrent(
  member,
  node,
  connection,
  validationRole,
) {
  if (!node) return false;
  if (
    !publishedMemberConnectionMatchesCurrent(member, connection, validationRole)
  ) {
    return false;
  }
  if (node.bootIncarnation > 0 &&
      node.bootIncarnation !== member.bootIncarnation) return false;
  if (node.status !== NODE_STATE.JOINING && node.status !== NODE_STATE.ACTIVE) {
    return false;
  }
  return node.connectionState === STATE.CONNECTED ||
    node.connectionState === STATE.READY;
}
// Authority-identity fencing is exact (epoch, fence, boot incarnation, state).
// The fence witness depends on who validates: the authority compares the
// generation fence with its own admission fence; a consumer validates the
// fence the authority published (its own admission fence is a different
// startup branch's), while the boot incarnation is fenced through the live
// authority connection in validatePublishedContractAgainstCurrent.
function authorityIdentityIsFenced(evidence, generation, validationRole) {
  if (!evidence || evidence.publicationEpoch < generation.publicationEpoch) {
    return false;
  }
  if (validationRole === CONTRACT_VALIDATION_ROLE.CONSUMER) {
    return isPublishedFenceIdentity(generation.fenceIdentity);
  }
  return evidence.fenceIdentity === generation.fenceIdentity;
}
function isRetainableAuthority(
  evidence,
  generation,
  validationRole = CONTRACT_VALIDATION_ROLE.AUTHORITY,
) {
  if (!authorityIdentityIsFenced(evidence, generation, validationRole)) {
    return false;
  }
  // Authority-identity fencing is exact (epoch, fence, boot incarnation, state);
  // formation membership is not. The canonical startup cohort is expected to
  // GROW as JOINING members are admitted under one authority incarnation, so an
  // exact canonicalNodeIds comparison would conflate formation progress with an
  // authority identity change and revoke the retained generation on every live
  // expansion. The retained generation stays valid while every captured cohort
  // member remains present in the live canonical set (cohortBelongsToCanonical);
  // a captured member dropping out is still fatal there and in the owner.
  if (!cohortBelongsToCanonical(evidence, generation)) return false;
  if (evidence.ready === true) return isAuthorityReadyRetainable(evidence);
  // Capture is gated on READY+spread; retention must be monotonic wrt
  // compatible transient recovery (decision-table invariant
  // non-monotone-spread-safe: "Spread is explicitly non-monotone until the
  // captured cohort publishes READY"). A transient BLOCKED instant produced by
  // a compatible recovery while the projection active gate is blocked carries
  // NO recovery disqualifier (empty recoveryReasonCodes) and the spread gap is
  // still open — that is the compatible-reopen case, so the captured generation
  // is retained. A SUBSTANTIVE authority block instead records a concrete
  // non-allowlisted reason (e.g. control_plane_not_writable) and remains fatal
  // via pendingAuthorityIsRetainable's reason allowlist below.
  if (
    evidence.state === STARTUP_AUTHORITY_STATE.BLOCKED &&
    evidence.prioritySpreadSatisfied === false &&
    evidence.recoveryReasonCodes.length === 0
  ) {
    return true;
  }
  return pendingAuthorityIsRetainable(evidence);
}
function cohortBelongsToCanonical(evidence, generation) {
  for (
    let index = 0;
    index < generation.requiredCohort.length;
    index += 1
  ) {
    const member = generation.requiredCohort[index];
    if (!arrayPrototypeIncludes(evidence.canonicalNodeIds, member.nodeId)) {
      return false;
    }
  }
  return true;
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
}) {
  const generationFields = contractGenerationFields(generation);
  return objectFreeze({
    state,
    reason,
    active: state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
    releaseAuthorized:
      state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE &&
      releaseAuthorized === true,
    ...projectContractGenerationIdentity(generationFields),
    canonicalNodeIds: generationFields.canonicalNodeIds,
    observedPublicationEpoch,
    observedAuthorityReady,
    observedRecoveryReasonCodes: objectFreeze(
      arrayPrototypeSlice(observedRecoveryReasonCodes),
    ),
    requiredCohort: generationFields.requiredCohort,
    readyNodeIds: objectFreeze(arrayPrototypeSlice(readyNodeIds)),
    pendingNodeIds: objectFreeze(arrayPrototypeSlice(pendingNodeIds)),
  });
}
/**
 * Project the scalar generation identity onto the published contract field
 * names. `generationFields` is always an object (present or absent shape), so
 * only the absent shape's missing scalars collapse to the published null.
 *
 * @param {Object} generationFields
 * @return {Object}
 */
function projectContractGenerationIdentity(generationFields) {
  return {
    generation: generationFields.id ?? null,
    authorityNodeId: generationFields.authorityNodeId ?? null,
    authorityBootIncarnation: generationFields.authorityBootIncarnation ?? null,
    capturedPublicationEpoch: generationFields.publicationEpoch ?? null,
    fenceIdentity: generationFields.fenceIdentity ?? null,
  };
}
function presentContractGenerationFields(generation) {
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
function absentContractGenerationFields() {
  // An absent generation is projected through the nullish-coalescing accessors
  // in projectContractGenerationIdentity; only the two list projections are
  // materialized here, so no raw-null scalar outcome property is ever
  // constructed (§4.5).
  const empty = objectFreeze([]);
  return {
    canonicalNodeIds: empty,
    requiredCohort: empty,
  };
}
function contractGenerationFields(generation) {
  return generation ?
    presentContractGenerationFields(generation) :
    absentContractGenerationFields();
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
  connectionEvidence = [],
) {
  const normalizedContract = normalizePublishedConsumerContract(contract);
  if (!normalizedContract) {
    return null;
  }
  return validatePublishedContractAgainstCurrent(
    normalizedContract, startupAuthority,
    nodeRows,
    observedAt,
    connectionEvidence,
    CONTRACT_VALIDATION_ROLE.CONSUMER,
  ) ? contract : null;
}
export {
  AUTHORIZATION_INTENT_OUTCOME,
  CONTRACT_VALIDATION_ROLE,
  FORMATION_RELEASE_HANDOFF_REASON, FORMATION_RELEASE_HANDOFF_STATE,
  attachFormationReleaseHandoffToStartupAuthority,
  authorizeFormationReleaseHandoffPublicationIntent, buildContract,
  freezeCohort,
  isRetainableAuthority, normalizeFormationReleaseHandoffContract,
  normalizePublishedConsumerContract,
  validateFormationReleaseHandoffConsumerContract, validatePublishedContractAgainstCurrent,
};
