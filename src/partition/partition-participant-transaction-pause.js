// Reconstructed release execution state. Every service lifetime starts
// closed. Only an exact complete census checked against the current owners
// resumes it; origin remains the durable legacy-retirement fact.
import {ERRORS} from '../constants/errors.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from './partition-write-kernel.js';
import {readParticipantReleaseFacts, replicaGenerationOf} from
  './partition-participant-release-facts.js';
import {releaseCensusDefect, sameReplicaGeneration} from './partition-participant-release-contract.js';
import {PARTICIPANT_CUTOVER_BOUND, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION} from
  './partition-participant-transaction-cutover-constants.js';
import {parseJson, targetEntryValid} from
  './partition-participant-release-command.js';
import {readParticipantReleaseState} from
  './partition-participant-transaction-store.js';
import {invalidateParticipantReleaseLocalCurrent} from
  './partition-participant-release-local-current.js';

const ADMISSIONS = new WeakMap();
let nextAdmissionGeneration = 0;

function newPause(service) {
  // Closing admission revokes the process-local projection immediately. The
  // durable claim/receipt remains with the control owner until its ordered
  // retirement command applies; reconnecting cannot recreate this projection.
  invalidateParticipantReleaseLocalCurrent(service);
  nextAdmissionGeneration += 1;
  const admission = Object.freeze({state: ADMISSION.CLOSED,
    raisedAtMs: service.timeSource.now(), generation: nextAdmissionGeneration, releaseId: null});
  ADMISSIONS.set(service, admission);
  return admission;
}

function participantReleaseAdmissionOf(service) {
  return ADMISSIONS.get(service) ?? newPause(service);
}

function raiseParticipantCutoverPause(service) {
  const current = participantReleaseAdmissionOf(service);
  return current.state === ADMISSION.CLOSED ? current : newPause(service);
}

function participantCutoverPauseOf(service) {
  // Events wake recovery, but every mutation also checks the current owner
  // synchronously so a delayed event cannot preserve an old permission.
  invalidateParticipantReleaseAdmission(service);
  const admission = participantReleaseAdmissionOf(service);
  return admission.state === ADMISSION.CLOSED ? admission : null;
}

function invalidateParticipantReleaseAdmission(service) {
  const admission = participantReleaseAdmissionOf(service);
  if (admission.state === ADMISSION.CLOSED) return;
  const status = service.raft?.readStatus();
  const proof = admission.proof;
  if (status?.term !== proof.term || status?.leaderId !== proof.leaderId ||
      status?.configurationKey !== proof.configurationKey ||
      status?.membershipGenerationIndex !== proof.membershipGenerationIndex ||
      status?.runtimeGeneration !== proof.runtimeGeneration ||
      status?.lifecycleIncarnation !== proof.lifecycleIncarnation) {
    invalidateParticipantReleaseLocalCurrent(service);
    raiseParticipantCutoverPause(service);
  }
}

async function resumeParticipantCutoverAdmission(handler, service, request) {
  const current = participantReleaseAdmissionOf(service);
  if (current.state === ADMISSION.OPEN) {
    invalidateParticipantReleaseAdmission(service);
    if (participantReleaseAdmissionOf(service) === current &&
        current.releaseId === request.release?.releaseId &&
        current.authorizationId ===
          request.controlAuthorization?.authorizationId) return OUTCOME.RESUMED;
    return OUTCOME.STALE;
  }
  const durable = readParticipantReleaseState(service.db);
  const authorization = parseJson(durable.authorizationText);
  const targets = parseJson(authorization?.targetEntriesText);
  const target = Array.isArray(targets) ? targets.find((candidate) =>
    candidate?.replicaIdentity === service.replicaId) : null;
  if (authorization === null || !targetEntryValid(target) ||
      authorization.controlPartitionId !==
        request.controlAuthorization?.controlPartitionId ||
      authorization.controlAuthorizationId !==
        request.controlAuthorization?.authorizationId ||
      authorization.controlAuthorizationRevision !==
        request.controlAuthorization?.authorizationRevision ||
      authorization.dependentReleaseText !== JSON.stringify(request.release) ||
      authorization.expectedPauseGeneration !== durable.pauseGeneration ||
      authorization.authorizationIndex !== durable.authorizationIndex ||
      authorization.authorizationTerm !== durable.authorizationTerm) {
    return OUTCOME.STALE;
  }
  const facts = await readParticipantReleaseFacts(handler, service);
  if (facts.outcome !== OUTCOME.OBSERVED) return facts.outcome;
  if (facts.paused !== true) return OUTCOME.STALE;
  const defect = releaseCensusDefect(request.release, request.census, facts,
    {attempt: request.attempt, queryDrainProof: request.queryDrainProof,
      // A committed set-wide RESUME can be retried after another exact target
      // already opened. The current recipient is still CLOSED here; mixed
      // peer admission projections cannot invalidate the replicated command.
      pausedRequired: false});
  if (defect !== null) return defect;
  // No await separates the final generation/leadership check from resume.
  const status = service.raft.readStatus();
  if (handler.localServices.get(service.replicaId) !== service ||
      !sameReplicaGeneration(facts.generation, replicaGenerationOf(handler, service, status)) ||
      status.term !== facts.membership.term || status.leaderId !== facts.leaderReplicaId ||
      status.configurationKey !== request.release.configurationKey) return OUTCOME.STALE;
  const generation = facts.generation;
  if (target.replicaIdentity !== service.replicaId ||
      target.peerId !== String(facts.peers.find((peer) =>
        peer.replicaIdentity === service.replicaId)?.peerId ??
        Object.entries(facts.membership.identities).find(([, replicaIdentity]) =>
          replicaIdentity === service.replicaId)?.[0] ?? '') ||
      target.nodeId !== generation.nodeId ||
      target.ownerIncarnation !== generation.ownerIncarnation ||
      target.lifecycleIncarnation !== generation.lifecycleIncarnation ||
      target.runtimeGeneration !== generation.runtimeGeneration ||
      target.connectionGeneration !== generation.connectionGeneration ||
      target.admissionGeneration !== generation.admissionGeneration ||
      target.buildDigest !== facts.buildDigest) return OUTCOME.STALE;
  ADMISSIONS.set(service, Object.freeze({...current, state: ADMISSION.OPEN,
    releaseId: request.release.releaseId,
    authorizationId: authorization.controlAuthorizationId,
    proof: Object.freeze({term: status.term,
      leaderId: status.leaderId, configurationKey: status.configurationKey,
      membershipGenerationIndex: status.membershipGenerationIndex,
      runtimeGeneration: status.runtimeGeneration,
      lifecycleIncarnation: status.lifecycleIncarnation})}));
  return OUTCOME.RESUMED;
}

function pausedWriteAnswerOf(service) {
  if (participantCutoverPauseOf(service) === null) return null;
  return {success: false, error: ERRORS.WRITE_CUTOVER_PAUSED,
    failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.CUTOVER_PAUSED,
    deferRetry: true, retryAfterMs: PARTICIPANT_CUTOVER_BOUND.PAUSE_RETRY_AFTER_MS,
    partitionId: service.partitionId};
}

export {
  invalidateParticipantReleaseAdmission, participantCutoverPauseOf,
  participantReleaseAdmissionOf, pausedWriteAnswerOf, raiseParticipantCutoverPause,
  resumeParticipantCutoverAdmission,
};
