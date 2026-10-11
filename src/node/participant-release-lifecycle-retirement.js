import {createHash} from 'node:crypto';
import {readParticipantReleaseLocalCurrent} from
  '../partition/partition-participant-release-local-current.js';
import {raiseParticipantCutoverPause} from
  '../partition/partition-participant-transaction-pause.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {askParticipantRelease} from './participant-release-client.js';

function retirementIdOf(current) {
  return createHash('sha256').update(JSON.stringify([
    current.authorizationId, current.target,
  ])).digest('hex');
}

// A controlled replacement first closes this process's projection, then asks
// the same replicated control slot that granted it to order its retirement.
// The returned result carries no authority by itself: only the committed
// RETIRE apply permits the caller to publish a successor service.
async function retireParticipantReleaseBeforeReplacement(handler, service) {
  const current = readParticipantReleaseLocalCurrent(service);
  if (current === null) return Object.freeze({retired: false});
  const owner = current.controlOwner;
  const deadlineAtMs = handler.timeSource.now() + handler.syncTimeoutMs;
  raiseParticipantCutoverPause(service);
  if (owner === null || typeof owner?.nodeId !== 'string' ||
      !Number.isSafeInteger(deadlineAtMs) ||
      deadlineAtMs <= handler.timeSource.now()) {
    throw new Error('Current participant release has no retirement owner');
  }
  const answer = await askParticipantRelease(handler, owner.nodeId, {
    partitionId: owner.partitionId,
    replicaId: owner.replicaId,
    release: owner.release,
    attempt: owner.attempt,
    target: owner.target,
    action: ACTION.RETIRE,
    deadlineAtMs,
    controlAuthorization: {
      controlPartitionId: owner.partitionId,
      authorizationId: current.authorizationId,
    },
    retiredTarget: current.target,
    retirementId: retirementIdOf(current),
  });
  if (answer.outcome !== OUTCOME.RETIRED) {
    throw new Error('Participant release retirement held replacement: ' +
      JSON.stringify(answer));
  }
  return Object.freeze({retired: true, answer});
}

export {retireParticipantReleaseBeforeReplacement};
