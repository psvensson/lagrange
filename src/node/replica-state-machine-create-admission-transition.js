import {
  buildReplicaLifecycleMutationPredicateFromState,
  rowMatchesReplicaLifecyclePredicate,
} from './replica-state-machine-lifecycle-observation.js';
import {isReplicaCreateAdmissionEvidence} from
  './replica-create-admission-evidence.js';
import {mintServiceRowCreatedAt} from './service-row-incarnation.js';

const CREATE_ADMISSION_RESERVATION_UNAVAILABLE = Object.freeze({
  available: false,
});

function reservedCreateAdmissionCreatedAt(replicaId, existingState, context) {
  if (existingState) return CREATE_ADMISSION_RESERVATION_UNAVAILABLE;
  const evidence = context?.createAdmissionEvidence;
  if (!isReplicaCreateAdmissionEvidence(evidence)) {
    return CREATE_ADMISSION_RESERVATION_UNAVAILABLE;
  }
  if (evidence.replicaId !== replicaId) {
    return CREATE_ADMISSION_RESERVATION_UNAVAILABLE;
  }
  return evidence.attemptToken === context.createAttemptToken ?
    {available: true, createdAt: evidence.replicaCreatedAt} :
    CREATE_ADMISSION_RESERVATION_UNAVAILABLE;
}

function resolveCreateLifecycleCreatedAt(existingState, reservation, now) {
  if (Number.isFinite(existingState?.createdAt)) return existingState.createdAt;
  return reservation.available === true ? reservation.createdAt :
    mintServiceRowCreatedAt(now);
}

function buildCreateAdmissionLifecycleIdentity(
  replicaId,
  existingState,
  now,
  context,
) {
  const reservation = reservedCreateAdmissionCreatedAt(
    replicaId,
    existingState,
    context,
  );
  const createdAt = resolveCreateLifecycleCreatedAt(
    existingState,
    reservation,
    now,
  );
  return {
    replicaIdentity: existingState?.replicaIdentity || replicaId,
    groupId: existingState?.groupId ?? null,
    createdAt,
    lifecycleIdentityAuthoritative:
      existingState?.lifecycleIdentityAuthoritative === true,
  };
}

function isCreateAdmissionTransitionAllowed(
  stateMachine,
  replicaId,
  currentState,
  context,
  expectedSourceEvidence,
) {
  if (!currentState && context.createAdmissionEvidence &&
      (!isReplicaCreateAdmissionEvidence(context.createAdmissionEvidence) ||
        context.createAdmissionEvidence.replicaId !== replicaId ||
        context.createAdmissionEvidence.attemptToken !==
          context.createAttemptToken)) return false;
  if (!expectedSourceEvidence) return true;
  const tracked = buildReplicaLifecycleMutationPredicateFromState(
    stateMachine.replicas.get(replicaId),
  );
  return rowMatchesReplicaLifecyclePredicate(expectedSourceEvidence, tracked);
}

export {
  buildCreateAdmissionLifecycleIdentity,
  isCreateAdmissionTransitionAllowed,
};
