import {
  buildAuthorityEvidence,
  buildConnectionEvidenceById,
  buildNodeEvidenceById,
  formationReleaseCohortContainsNodeId,
  formationReleaseHandoffConsumerEvidenceMatches,
  normalizeFormationReleaseHandoffContract,
  normalizePublishedConsumerContract,
} from './formation-release-handoff-contract.js';

const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectFreeze = Object.freeze;
const OWN_DATA_VALUE_FIELD = 'value';

function readOwnData(target, field) {
  if (!target || typeof target !== 'object') return undefined;
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD) ?
    descriptor.value : undefined;
}

function authorityContainsProjectionNode(authority, projectionNodeId) {
  if (typeof projectionNodeId !== 'string' || projectionNodeId.length === 0) {
    return false;
  }
  for (let index = 0; index < authority.canonicalNodeIds.length; index += 1) {
    if (authority.canonicalNodeIds[index] === projectionNodeId) return true;
  }
  return false;
}

function buildCanonicalSeedProjection(authority, handoff = null) {
  return objectFreeze({
    state: authority.state,
    ready: authority.ready,
    authorityAvailable: true,
    publicationEpoch: authority.publicationEpoch,
    publicationStatus: authority.publicationStatus,
    admission: authority.admission,
    priorityPartitionSummary: objectFreeze({
      satisfied: authority.prioritySpreadSatisfied,
    }),
    priorityRecoveryReasonCodes: authority.recoveryReasonCodes,
    canonicalStartupNodeIds: authority.canonicalNodeIds,
    formationReleaseHandoff: handoff,
  });
}

function validateFormationReleaseHandoffSeedProjection(
  startupAuthority,
  nodeRows,
  projectionNodeId,
  authorityNodeId,
  connectionEvidence = [],
) {
  const contract = readOwnData(startupAuthority, 'formationReleaseHandoff');
  const authority = buildAuthorityEvidence(startupAuthority);
  if (!authority) return null;
  const normalizedContract = normalizePublishedConsumerContract(contract);
  const completeContract = normalizeFormationReleaseHandoffContract(contract);
  const currentProjectionContainsNode = authorityContainsProjectionNode(
    authority,
    projectionNodeId,
  );
  const capturedCohortContainsNode = normalizedContract !== null &&
    formationReleaseCohortContainsNodeId(
      normalizedContract,
      projectionNodeId,
    );
  if (!currentProjectionContainsNode && !capturedCohortContainsNode) {
    return null;
  }
  const baseProjection = currentProjectionContainsNode ?
    buildCanonicalSeedProjection(authority) : null;
  if (!normalizedContract || !completeContract) return baseProjection;
  const rowsById = buildNodeEvidenceById(nodeRows);
  const connectionsById = buildConnectionEvidenceById(connectionEvidence);
  if (
    !rowsById || !connectionsById ||
    normalizedContract.authorityNodeId !== authorityNodeId ||
    !capturedCohortContainsNode ||
    authority.publicationEpoch < normalizedContract.capturedPublicationEpoch ||
    authority.fenceIdentity !== normalizedContract.fenceIdentity
  ) {
    return baseProjection;
  }
  return formationReleaseHandoffConsumerEvidenceMatches(
    normalizedContract,
    projectionNodeId,
    rowsById,
    connectionsById,
  ) ? buildCanonicalSeedProjection(authority, completeContract) :
    baseProjection;
}

export {validateFormationReleaseHandoffSeedProjection};
