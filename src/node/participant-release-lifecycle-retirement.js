import {createHash} from 'node:crypto';
import {clearParticipantReleaseLocalRetirement,
  readParticipantReleaseLocalCurrent, readParticipantReleaseLocalRetirement,
  retainParticipantReleaseLocalRetirement} from
  '../partition/partition-participant-release-local-current.js';
import {raiseParticipantCutoverPause} from
  '../partition/partition-participant-transaction-pause.js';
import {releaseIdentityOf} from
  '../partition/partition-participant-release-contract.js';
import {targetEntryOf} from '../partition/partition-participant-release-command.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {askParticipantRelease, releaseNodeOfAddress} from './participant-release-client.js';

function retirementIdOf(current) {
  return createHash('sha256').update(JSON.stringify([
    current.authorizationId, current.target,
  ])).digest('hex');
}

async function currentControlRoute(handler, obligation, deadlineAtMs) {
  let nodeId = obligation.controlOwner.nodeId;
  let replicaId = obligation.controlOwner.replicaId;
  for (let reads = 0; reads < 2; reads += 1) {
    const facts = await askParticipantRelease(handler, nodeId, {
      partitionId: obligation.controlOwner.partitionId,
      replicaId,
      action: ACTION.INSPECT,
      leaderCohort: true,
      deadlineAtMs,
    });
    if (facts?.outcome !== OUTCOME.OBSERVED) return null;
    if (facts.leaderReplicaId !== facts.generation.replicaId) {
      const leader = facts.peers.find((peer) =>
        peer.replicaIdentity === facts.leaderReplicaId);
      const leaderNodeId = releaseNodeOfAddress(leader?.address);
      if (leaderNodeId === null) return null;
      nodeId = leaderNodeId;
      replicaId = facts.leaderReplicaId;
      continue;
    }
    const release = releaseIdentityOf({partitionId: facts.partitionId,
      targetBuildDigest: facts.buildDigest,
      configurationKey: facts.membership.configurationKey,
      membershipGenerationIndex: facts.membership.membershipGenerationIndex});
    const target = targetEntryOf(facts);
    if (release === null || target === null) return null;
    return Object.freeze({nodeId, replicaId, release, target: facts.generation,
      attempt: Object.freeze({leaderReplicaId: facts.leaderReplicaId,
        term: facts.membership.term,
        leaderLifecycleIncarnation: facts.generation.lifecycleIncarnation,
        deadlineAtMs,
        pauseInvocationId: obligation.controlOwner.attempt.pauseInvocationId})});
  }
  return null;
}

// A controlled replacement first closes this process's projection, then asks
// the same replicated control slot that granted it to order its retirement.
// The returned result carries no authority by itself: only the committed
// RETIRE apply permits the caller to publish a successor service.
async function retireParticipantReleaseBeforeReplacement(handler, service,
  {deadlineAtMs} = {}) {
  const current = readParticipantReleaseLocalCurrent(service);
  let obligation = readParticipantReleaseLocalRetirement(service);
  if (current === null && obligation === null) return Object.freeze({retired: false});
  if (!Number.isSafeInteger(deadlineAtMs) || deadlineAtMs <= handler.timeSource.now()) {
    throw new Error('Current participant release has no retirement owner');
  }
  if (obligation === null) {
    obligation = retainParticipantReleaseLocalRetirement(service, current);
  }
  raiseParticipantCutoverPause(service);
  const route = await currentControlRoute(handler, obligation, deadlineAtMs);
  if (route === null) {
    throw new Error('Current participant release retirement route unavailable');
  }
  const request = {
    controlOwnerNodeId: route.nodeId,
    partitionId: route.release.partitionId,
    replicaId: route.replicaId,
    release: route.release,
    attempt: route.attempt,
    target: route.target,
    action: ACTION.RETIRE,
    deadlineAtMs,
    controlAuthorization: {
      controlPartitionId: route.release.partitionId,
      authorizationId: obligation.authorizationId,
    },
    retiredTarget: obligation.retiredTarget,
    retirementId: retirementIdOf({authorizationId: obligation.authorizationId,
      target: obligation.retiredTarget}),
  };
  const answer = await askParticipantRelease(handler,
    request.controlOwnerNodeId, request);
  if (answer.outcome !== OUTCOME.RETIRED) {
    throw new Error('Participant release retirement held replacement: ' +
      JSON.stringify(answer));
  }
  clearParticipantReleaseLocalRetirement(service, obligation);
  return Object.freeze({retired: true, answer});
}

export {retireParticipantReleaseBeforeReplacement};
