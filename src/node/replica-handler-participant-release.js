// The lifecycle recipient survives a PartitionService replacement. Each
// mutation checks the canonical release, leader term and exact target
// lifetime. Reopen uses retained-storage admission and the production factory.
import {RAFT_ROLE} from '../raft/constants.js';
import {TABLES} from '../constants/tables.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from '../raft/raft-committed-membership-constants.js';
import {buildReplacementServiceOptions} from '../partition/partition-reopen-options.js';
import {isReleaseDrained, readParticipantReleaseFacts} from
  '../partition/partition-participant-release-facts.js';
import {releaseAnswer, releaseCensusDefect, releaseIdentityValid, sameReplicaGeneration} from
  '../partition/partition-participant-release-contract.js';
import {raiseParticipantCutoverPause, resumeParticipantCutoverAdmission} from
  '../partition/partition-participant-transaction-pause.js';
import {enableParticipantTransactionAdmission} from
  '../partition/partition-participant-transaction-request.js';
import {targetEntryOf, RELEASE_APPLY_RESULT} from
  '../partition/partition-participant-release-command.js';
import {pauseParticipantAdmission, resumeParticipantAdmission} from
  '../partition/partition-participant-release-request.js';
import {confirmParticipantRelease, dispatchParticipantRelease,
  finalizeParticipantRelease} from
  '../partition/partition-participant-release-request.js';
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
  case ACTION.PAUSE: {
    raiseParticipantCutoverPause(service);
    const paused = await pauseParticipantAdmission(service,
      request.pauseInvocationId);
    if (paused?.outcome !== RELEASE_APPLY_RESULT.PAUSED) {
      return releaseAnswer(OUTCOME.UNAVAILABLE, request,
        {missingFact: 'committed_dependent_pause', paused});
    }
    return readParticipantReleaseFacts(handler, service);
  }
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
  case ACTION.AUTHORIZE: {
    if (service.tableName !== TABLES.SQL_TRANSACTIONS ||
        request.controlAuthorization?.controlPartitionId !== service.partitionId) {
      return releaseAnswer(OUTCOME.INVALID, request);
    }
    const controlDefect = releaseCensusDefect(request.release,
      request.controlCensus, facts,
      {attempt: request.attempt, queryDrainProof: request.controlQueryDrainProof,
        pausedRequired: false});
    const dependentLocal = request.dependentCensus?.find((candidate) =>
      candidate?.generation?.replicaId === request.dependentLeaderReplicaId);
    const dependentDefect = dependentLocal === undefined ? OUTCOME.INVALID :
      releaseCensusDefect(request.dependentRelease,
        request.dependentCensus, dependentLocal,
        {attempt: request.dependentAttempt,
          queryDrainProof: request.dependentQueryDrainProof});
    if (controlDefect !== null || dependentDefect !== null) {
      return releaseAnswer(controlDefect ?? dependentDefect, request);
    }
    const finalized = await finalizeParticipantRelease(service, {
      dependentRelease: request.dependentRelease,
      controlRelease: request.release,
      controlCensus: request.controlCensus,
      dependentCensus: request.dependentCensus,
      authorizationId: request.controlAuthorization.authorizationId,
      deadlineAtMs: request.deadlineAtMs,
    });
    const dispatched = finalized?.outcome === RELEASE_APPLY_RESULT.AUTHORIZED ?
      await dispatchParticipantRelease(service, {
        authorizationId: finalized.authorizationId}) : null;
    return dispatched?.outcome === RELEASE_APPLY_RESULT.DISPATCHED ?
      releaseAnswer(OUTCOME.AUTHORIZED, request, {
        controlPartitionId: service.partitionId,
        authorizationId: finalized.authorizationId,
        authorizationRevision: finalized.authorizationRevision,
        controlIndex: finalized.controlIndex,
        controlTerm: finalized.controlTerm,
        dispatchIndex: dispatched.dispatchIndex,
        dispatchTerm: dispatched.dispatchTerm}) :
      releaseAnswer(finalized?.outcome === RELEASE_APPLY_RESULT.STALE ?
        OUTCOME.STALE : OUTCOME.UNAVAILABLE, request,
      {missingFact: finalized?.outcome === RELEASE_APPLY_RESULT.AUTHORIZED ?
        'committed_control_dispatch' : 'committed_control_authorization',
      finalized, dispatched});
  }
  case ACTION.RESUME: {
    const factsForTarget = request.census?.find((candidate) =>
      candidate?.generation?.replicaId === service.replicaId);
    const target = targetEntryOf(factsForTarget);
    const control = request.controlAuthorization;
    if (target === null || control?.targetReplicaIdentity !== service.replicaId) {
      return releaseAnswer(OUTCOME.INVALID, request);
    }
    const resumed = await resumeParticipantAdmission(service, {
      dependentRelease: request.release,
      controlPartitionId: control.controlPartitionId,
      controlAuthorizationId: control.authorizationId,
      controlAuthorizationRevision: control.authorizationRevision,
      target, census: request.census,
    });
    if (resumed?.outcome !== RELEASE_APPLY_RESULT.RESUMED) {
      return releaseAnswer(resumed?.outcome === RELEASE_APPLY_RESULT.STALE ?
        OUTCOME.STALE : OUTCOME.UNAVAILABLE, request,
      {missingFact: 'committed_dependent_resume', resumed});
    }
    return releaseAnswer(
      await resumeParticipantCutoverAdmission(handler, service, request),
      request,
      {resumeEntryId: resumed.resumeEntryId,
        authorizationIndex: resumed.authorizationIndex,
        authorizationTerm: resumed.authorizationTerm,
        pauseGeneration: resumed.pauseGeneration});
  }
  case ACTION.CONFIRM: {
    if (service.tableName !== TABLES.SQL_TRANSACTIONS ||
        request.controlAuthorization?.controlPartitionId !== service.partitionId) {
      return releaseAnswer(OUTCOME.INVALID, request);
    }
    const confirmed = await confirmParticipantRelease(service, {
      authorizationId: request.controlAuthorization.authorizationId,
      receipts: request.receipts,
    });
    return confirmed?.outcome === RELEASE_APPLY_RESULT.CONFIRMED ?
      releaseAnswer(OUTCOME.CONFIRMED, request, {
        controlRevision: confirmed.controlRevision,
        confirmationIndex: confirmed.confirmationIndex,
        confirmationTerm: confirmed.confirmationTerm}) :
      releaseAnswer(confirmed?.outcome === RELEASE_APPLY_RESULT.STALE ?
        OUTCOME.STALE : OUTCOME.UNAVAILABLE, request,
      {missingFact: 'committed_control_confirmation', confirmed});
  }
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
    if (![ACTION.PAUSE, ACTION.RESUME, ACTION.AUTHORIZE,
      ACTION.CONFIRM].includes(request.action) && facts.paused !== true) {
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
