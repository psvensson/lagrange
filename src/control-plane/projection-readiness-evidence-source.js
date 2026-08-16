// The allowlisted source pick for the projection evidence builder. The
// live call sites spread whole evaluation contexts into the builder, and
// the sealed strict own-data normalization walks EVERY reachable value -
// so junk in a never-read context field (a raw cache row, a Date, a
// function) silently replaced the entire record with the empty one,
// collapsing the serve lane into its everything-false degenerate state
// disguised as owner_evidence_missing (round-13). Producers pick exactly
// what the builder reads before handing evidence to the sealed
// whole-source validation.
import {types as nodeUtilTypes} from 'node:util';

const isProxyValue = nodeUtilTypes.isProxy.bind(nodeUtilTypes);
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const DESCRIPTOR_VALUE_FIELD = 'value';

// The only source fields buildProjectionReadinessEvidence reads.
const PROJECTION_READINESS_EVIDENCE_SOURCE_FIELDS = objectFreeze([
  'acknowledgedNodeIds',
  'committedPublicationRevision',
  'deleted',
  'deletionOutcome',
  'desiredPublicationRevision',
  'dimensions',
  'localProjectionRevision',
  'membershipPublication',
  'missingPublishedCount',
  'missingPublishedNodeIds',
  'missingPublishedRecoveryActiveNodeIds',
  'nodeEvidence',
  'pendingAckCount',
  'pendingAckEvidenceState',
  'pendingAckNodeIds',
  'priorityControlPlaneRecovery',
  'prioritySpreadEvidenceUnavailable',
  'prioritySpreadPending',
  'projectionReadinessContract',
  'projectionRevision',
  'publicationBoundaryOutcome',
  'publicationEpoch',
  'publicationObservationState',
  'publicationOwnerStream',
  'publicationOwnerStreamSource',
  'publicationRecoveryGate',
  'publicationRevision',
  'publicationStatus',
  'publicationStream',
  'publishedPlanningEpoch',
  'publishedPublicationRevision',
  'recoveryProtocolState',
  'repairEligible',
  'requiredAckNodeIds',
  'requiredProjectionRevision',
  'requiredPublicationRevision',
  'runtimeAuthority',
  'runtimeServeEligible',
  'status',
]);

// Hostile-input hardened: own data properties only (inherited properties
// and getters are never read - prototype pollution and live accessors are
// in this module's threat model; an own accessor field is skipped
// unexecuted and simply absent from the picked record), indexed iteration
// only (the live Array iterator is not trusted), captured intrinsics
// only. A proxy root passes through untouched for the sealed whole-source
// validation to reject loudly.
function pickProjectionReadinessEvidenceSource(source) {
  if (!source || typeof source !== 'object' || isProxyValue(source)) {
    return source;
  }
  const picked = {};
  for (
    let index = 0;
    index < PROJECTION_READINESS_EVIDENCE_SOURCE_FIELDS.length;
    index++
  ) {
    const field = PROJECTION_READINESS_EVIDENCE_SOURCE_FIELDS[index];
    const descriptor = objectGetOwnPropertyDescriptor(source, field);
    if (
      descriptor &&
      objectHasOwn(descriptor, DESCRIPTOR_VALUE_FIELD) &&
      descriptor.value !== undefined
    ) {
      objectDefineProperty(picked, field, {
        configurable: true,
        enumerable: true,
        value: descriptor.value,
        writable: true,
      });
    }
  }
  return picked;
}

export {
  PROJECTION_READINESS_EVIDENCE_SOURCE_FIELDS,
  pickProjectionReadinessEvidenceSource,
};
