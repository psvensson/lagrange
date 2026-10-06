import {
  buildReplicaLifecycleMutationPredicateFromState,
  rowMatchesReplicaLifecyclePredicate,
} from './replica-state-machine-lifecycle-observation.js';
import {isReplicaCreateAdmissionEvidence} from
  './replica-create-admission-evidence.js';
import {mintServiceRowCreatedAt} from './service-row-incarnation.js';

function buildCreateAdmissionLifecycleIdentity(
  replicaId,
  existingState,
  now,
  context,
) {
  const reservedCreatedAt =
    !existingState &&
    isReplicaCreateAdmissionEvidence(context?.createAdmissionEvidence) &&
    context.createAdmissionEvidence.replicaId === replicaId &&
    context.createAdmissionEvidence.attemptToken ===
      context.createAttemptToken ?
      context.createAdmissionEvidence.replicaCreatedAt : null;
  const createdAt = Number.isFinite(existingState?.createdAt) ?
    existingState.createdAt :
    Number.isSafeInteger(reservedCreatedAt) ? reservedCreatedAt :
      mintServiceRowCreatedAt(now);
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
