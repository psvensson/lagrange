import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {assertOperationUpdateSubject} from './replica-operation-update-outcome.js';

function matchesRemoteReentryOperation(expected, operation) {
  if (!operation || operation.completedAt !== null ||
      operation.replicaId !== expected.replicaId ||
      operation.createdAt !== expected.createdAt) {
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
