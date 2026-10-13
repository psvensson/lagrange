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

const ADMISSIONS = new WeakMap();
let nextAdmissionGeneration = 0;

function newPause(service) {
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

function admissionProofMatchesStatus(proof, status) {
  return status?.term === proof.term && status.leaderId === proof.leaderId &&
    status.configurationKey === proof.configurationKey &&
    status.membershipGenerationIndex === proof.membershipGenerationIndex &&
    status.runtimeGeneration === proof.runtimeGeneration &&
    status.lifecycleIncarnation === proof.lifecycleIncarnation;
}

function invalidateParticipantReleaseAdmission(service) {
  const admission = participantReleaseAdmissionOf(service);
  if (admission.state === ADMISSION.CLOSED) return;
  const status = service.raft?.readStatus();
  if (!admissionProofMatchesStatus(admission.proof, status)) {
    raiseParticipantCutoverPause(service);
  }
}

function resumeLifecycleIsCurrent(handler, service) {
  return handler.shuttingDown !== true && service.isShutdown !== true &&
    handler.localServices.get(service.replicaId) === service;
}

function refuseStaleResume(handler, service) {
  if (resumeLifecycleIsCurrent(handler, service)) return null;
  raiseParticipantCutoverPause(service);
  return OUTCOME.STALE;
}

function finalResumeFactsMatch(handler, service, facts, request, status) {
  return sameReplicaGeneration(facts.generation, replicaGenerationOf(handler, service, status)) &&
    status.term === facts.membership.term && status.leaderId === facts.leaderReplicaId &&
    status.configurationKey === request.release.configurationKey;
}

async function resumeParticipantCutoverAdmission(handler, service, request) {
  const lifecycleRefusal = refuseStaleResume(handler, service);
  if (lifecycleRefusal !== null) return lifecycleRefusal;
  const current = participantReleaseAdmissionOf(service);
  if (current.state === ADMISSION.OPEN) {
    invalidateParticipantReleaseAdmission(service);
    const postStatusLifecycleRefusal = refuseStaleResume(handler, service);
    if (postStatusLifecycleRefusal !== null) return postStatusLifecycleRefusal;
    if (participantReleaseAdmissionOf(service) === current &&
        current.releaseId === request.release?.releaseId) return OUTCOME.RESUMED;
    return OUTCOME.STALE;
  }
  const facts = await readParticipantReleaseFacts(handler, service);
  const postFactsLifecycleRefusal = refuseStaleResume(handler, service);
  if (postFactsLifecycleRefusal !== null) return postFactsLifecycleRefusal;
  if (facts.outcome !== OUTCOME.OBSERVED) return facts.outcome;
  const defect = releaseCensusDefect(request.release, request.census, facts,
    {attempt: request.attempt, queryDrainProof: request.queryDrainProof});
  if (defect !== null) return defect;
  // No await separates the final generation/leadership check from resume.
  const status = service.raft.readStatus();
  if (refuseStaleResume(handler, service) !== null ||
      !finalResumeFactsMatch(handler, service, facts, request, status)) return OUTCOME.STALE;
  ADMISSIONS.set(service, Object.freeze({...current, state: ADMISSION.OPEN,
    releaseId: request.release.releaseId, proof: Object.freeze({term: status.term,
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
