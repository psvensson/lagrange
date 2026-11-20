import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {assertOperationUpdateSubject} from './replica-operation-update-outcome.js';

const REMOTE_REENTRY_BINDING_FIELDS = Object.freeze([
  'targetClaimKey',
  'membershipPublicationEpoch',
  'createAdmissionToken',
  'createAdmissionReplicaCreatedAt',
  'createAdmissionAttemptToken',
  'createAdmissionAttemptSeq',
  'createAdmissionOwnerIncarnation',
]);

function matchesRemoteReentryOperation(expected, operation) {
  if (!operation || operation.completedAt !== null ||
      operation.replicaId !== expected.replicaId ||
      operation.createdAt !== expected.createdAt ||
      !REMOTE_REENTRY_BINDING_FIELDS.every((field) =>
        (operation[field] ?? null) === (expected[field] ?? null))) {
    return false;
  }
  try {
    assertOperationUpdateSubject(expected, operation);
    return true;
  } catch {
    return false;
  }
}

async function observeRemoteReentryAuthority(repository, expected) {
  const observation = await repository.queryAuthoritativeOperationVisibilityObservation(
    expected.operationId,
    {
      authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      requireCompleteExactKey: true,
    },
  );
  if (observation.deferredOutcome) return observation;
  return {
    operation: matchesRemoteReentryOperation(expected, observation.operation) ?
      observation.operation : null,
    deferredOutcome: null,
  };
}

export {observeRemoteReentryAuthority};
