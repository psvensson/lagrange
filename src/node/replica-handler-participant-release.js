// The lifecycle recipient survives a PartitionService replacement. Each
// mutation checks the canonical release, leader term and exact target
// lifetime. Reopen uses retained-storage admission and the production factory.
import {RAFT_ROLE} from '../raft/constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from '../raft/raft-committed-membership-constants.js';
import {buildReplacementServiceOptions} from '../partition/partition-reopen-options.js';
import {isReleaseDrained, releaseAnswer, releaseCensusDefect, releaseIdentityValid,
  sameReplicaGeneration} from
  '../partition/partition-participant-release-contract.js';
import {raiseParticipantCutoverPause, readParticipantReleaseFacts,
  resumeParticipantCutoverAdmission} from
  '../partition/partition-participant-transaction-pause.js';
import {enableParticipantTransactionAdmission} from
  '../partition/partition-participant-transaction-request.js';
import {PARTICIPANT_RELEASE_ACTION as ACTION, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME} from
  '../partition/partition-participant-transaction-cutover-constants.js';

function attemptMatches(request, facts) {
  return request.attempt?.term === facts.membership.term &&
    request.attempt?.leaderReplicaId === facts.leaderReplicaId &&
    request.release.configurationKey === facts.membership.configurationKey &&
    request.release.membershipGenerationIndex === facts.membership.membershipGenerationIndex;
}

async function reopenReplica(handler, service, request, facts) {
  if (!isReleaseDrained(facts.work)) return releaseAnswer(OUTCOME.DRAIN_PENDING, request);
  if (facts.connection.servedLegacy === false) return facts;
  if (facts.role === RAFT_ROLE.LEADER && facts.membership.voters.length > 1) {
    return releaseAnswer(OUTCOME.REOPEN_REQUIRED, request);
  }
  try {
    await handler.requireActiveReplicaStorageAdmission(service.replicaId, service.partitionId);
    const current = await readParticipantReleaseFacts(handler, service);
    if (current.outcome !== OUTCOME.OBSERVED || !attemptMatches(request, current) ||
        !sameReplicaGeneration(request.target, current.generation) ||
        !isReleaseDrained(current.work)) return releaseAnswer(OUTCOME.STALE, request);
    const options = buildReplacementServiceOptions(service);
    await service.shutdown();
    const replacement = await handler.createPartitionService(options);
    // The lifecycle factory can return an initialized service, as snapshot
    // install does. Initialization is idempotent; never reinitialize old.
    await replacement.initialize();
    raiseParticipantCutoverPause(replacement);
    handler.replaceLocalReplicaService(service.replicaId, replacement);
    return releaseAnswer(OUTCOME.REOPENED, request,
      {replicaId: replacement.replicaId, reconstructionRequired: true});
  } catch (error) {
    return releaseAnswer(OUTCOME.REOPEN_REFUSED, request,
      {owner: 'replica-lifecycle', reason: String(error?.message ?? error),
        operatorRequired: service.isShutdown === true});
  }
}

async function executeReleaseAction(handler, service, request, facts) {
  switch (request.action) {
  case ACTION.PAUSE:
    raiseParticipantCutoverPause(service);
    return readParticipantReleaseFacts(handler, service);
  case ACTION.DRAIN:
    return isReleaseDrained(facts.work) ? facts :
      releaseAnswer(OUTCOME.DRAIN_PENDING, request, {facts});
  case ACTION.REOPEN:
    return reopenReplica(handler, service, request, facts);
  case ACTION.ENABLE: {
    if (facts.role !== RAFT_ROLE.LEADER) return releaseAnswer(OUTCOME.NOT_LEADER, request);
    const defect = releaseCensusDefect(request.release, request.census, facts,
      {originRequired: false, attempt: request.attempt,
        queryDrainProof: request.queryDrainProof});
    if (defect !== null) return releaseAnswer(defect, request);
    const answer = await enableParticipantTransactionAdmission(service);
    return answer.success === true ? readParticipantReleaseFacts(handler, service) :
      releaseAnswer(OUTCOME.ENABLE_REFUSED, request, {answer});
  }
  case ACTION.RESUME:
    return releaseAnswer(
      await resumeParticipantCutoverAdmission(handler, service, request), request);
  default:
    return releaseAnswer(OUTCOME.INVALID, request);
  }
}

async function receiveParticipantRelease(handler, request) {
  try {
    if (Number.isSafeInteger(request.deadlineAtMs) &&
        handler.timeSource.now() >= request.deadlineAtMs) {
      return releaseAnswer(OUTCOME.UNAVAILABLE, request,
        {missingFact: 'release_deadline'});
    }
    const service = handler.localServices.get(request.replicaId);
    if (!service || service.partitionId !== request.partitionId) {
      return releaseAnswer(OUTCOME.UNAVAILABLE, request, {missingFact: 'hosted_replica'});
    }
    const purpose = request.action === ACTION.INSPECT && request.leaderCohort === true ?
      COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT :
      COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS;
    const facts = await readParticipantReleaseFacts(handler, service, purpose);
    if (request.action === ACTION.INSPECT || facts.outcome !== OUTCOME.OBSERVED) return facts;
    if (!releaseIdentityValid(request.release) ||
        request.release.partitionId !== service.partitionId) {
      return releaseAnswer(OUTCOME.INVALID, request);
    }
    if (!sameReplicaGeneration(request.target, facts.generation) ||
        !attemptMatches(request, facts)) {
      return releaseAnswer(OUTCOME.STALE, request);
    }
    if (request.action !== ACTION.PAUSE && facts.paused !== true &&
        request.action !== ACTION.RESUME) {
      return releaseAnswer(OUTCOME.STALE, request);
    }
    // A release request always closes new work even on a mixed-build node.
    if (request.action === ACTION.PAUSE) raiseParticipantCutoverPause(service);
    if (facts.buildDigest !== request.release.targetBuildDigest) {
      return releaseAnswer(OUTCOME.BUILD_MISMATCH, request);
    }
    const status = service.raft.readStatus();
    if (status.term !== request.attempt.term ||
        status.leaderId !== request.attempt.leaderReplicaId ||
        status.configurationKey !== request.release.configurationKey ||
        (service.replicaId === request.attempt.leaderReplicaId &&
          status.lifecycleIncarnation !== request.attempt.leaderLifecycleIncarnation)) {
      return releaseAnswer(OUTCOME.STALE, request);
    }
    return executeReleaseAction(handler, service, request, facts);
  } catch (error) {
    return releaseAnswer(OUTCOME.INVALID, request, {reason: String(error?.message ?? error)});
  }
}

export {receiveParticipantRelease};
