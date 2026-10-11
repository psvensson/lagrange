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
import {parseJson, RELEASE_APPLY_RESULT, RELEASE_CONTROL_STATE,
  targetEntryOf, targetEntryValid} from
  '../partition/partition-participant-release-command.js';
import {readParticipantReleaseState} from
  '../partition/partition-participant-transaction-store.js';
import {observeParticipantAdmissionPause, observeParticipantAdmissionResume} from
  '../partition/partition-participant-release-request.js';
import {askParticipantRelease} from './participant-release-client.js';
import {publishParticipantReleaseLocalCurrent} from
  '../partition/partition-participant-release-local-current.js';
import {confirmParticipantRelease, dispatchParticipantRelease,
  finalizeReservedParticipantRelease, publishParticipantReleaseClaim,
  recordParticipantReleaseReceipt, recordParticipantReleaseShare,
  reserveParticipantRelease, retireParticipantRelease} from
  '../partition/partition-participant-release-request.js';
import {PARTICIPANT_RELEASE_ACTION as ACTION, PARTICIPANT_CUTOVER_BOUND as BOUND,
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {retireParticipantReleaseBeforeReplacement} from
  './participant-release-lifecycle-retirement.js';

function attemptMatches(request, facts) {
  return request.attempt?.term === facts.membership.term &&
    request.attempt?.leaderReplicaId === facts.leaderReplicaId &&
    request.release.configurationKey === facts.membership.configurationKey &&
    request.release.membershipGenerationIndex === facts.membership.membershipGenerationIndex;
}

function controlOwnerOf(request) {
  const leader = request.controlCensus?.find((facts) =>
    facts?.generation?.replicaId === request.attempt?.leaderReplicaId);
  const target = targetEntryOf(leader);
  return target === null ? null : Object.freeze({
    partitionId: request.release.partitionId,
    nodeId: leader.generation.nodeId,
    replicaId: leader.generation.replicaId,
    release: request.release,
    attempt: request.attempt,
    generation: leader.generation,
    target,
  });
}

function retainedAuthorizationMatches(service, request) {
  const retained = request.retainedAuthorization;
  const control = parseJson(readParticipantReleaseState(service.db).controlText);
  return retained !== null && typeof retained === 'object' &&
    !Array.isArray(retained) &&
    [RELEASE_CONTROL_STATE.DISPATCHED, RELEASE_CONTROL_STATE.CONFIRMED]
      .includes(control?.state) &&
    control.authorizationId === request.controlAuthorization?.authorizationId &&
    control.authorizationId === retained.controlAuthorizationId &&
    control.authorizationRevision === retained.controlAuthorizationRevision &&
    control.dependentReleaseText === retained.dependentReleaseText &&
    control.targetEntriesText === retained.targetEntriesText &&
    control.targetConfigurationText === retained.targetConfigurationText;
}

function waitForReleaseRetry(handler, deadlineAtMs) {
  const remaining = deadlineAtMs - handler.timeSource.now();
  if (remaining <= 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    const handle = handler.timeSource.setTimeout(() => resolve(true),
      Math.min(BOUND.POLL_INTERVAL_MS, remaining));
    handle?.unref?.();
  });
}

async function askUntilObserved(handler, nodeId, request, acceptedOutcome) {
  let answer = null;
  do {
    answer = await askParticipantRelease(handler, nodeId, request);
    if (answer.outcome === acceptedOutcome ||
        ![OUTCOME.DRAIN_PENDING, OUTCOME.UNAVAILABLE].includes(answer.outcome)) {
      return answer;
    }
  } while (await waitForReleaseRetry(handler, request.deadlineAtMs));
  return releaseAnswer(OUTCOME.UNAVAILABLE, request,
    {missingFact: 'release_deadline', lastOutcome: answer?.outcome ?? null,
      lastMissingFact: answer?.missingFact ?? null});
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
    await retireParticipantReleaseBeforeReplacement(handler, service,
      {deadlineAtMs: request.deadlineAtMs});
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
    const paused = observeParticipantAdmissionPause(service, request.attempt);
    if (paused?.outcome !== RELEASE_APPLY_RESULT.PAUSED) {
      return releaseAnswer(OUTCOME.UNAVAILABLE, request,
        {missingFact: 'committed_dependent_pause', paused,
          retryAfterMs: BOUND.PAUSE_RETRY_AFTER_MS});
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
  case ACTION.CLAIM: {
    const defect = releaseCensusDefect(request.release,
      request.controlCensus, facts,
      {attempt: request.attempt, queryDrainProof: request.controlQueryDrainProof,
        pausedRequired: false});
    const target = targetEntryOf(facts);
    if (defect !== null || target === null ||
        request.controlAuthorization?.authorizationId === undefined) {
      return releaseAnswer(defect ?? OUTCOME.STALE, request);
    }
    return releaseAnswer(OUTCOME.CLAIMED, request, {target});
  }
  case ACTION.SHARE: {
    const defect = releaseCensusDefect(request.release,
      request.controlCensus, facts,
      {attempt: request.attempt, queryDrainProof: request.controlQueryDrainProof,
        pausedRequired: false});
    const target = targetEntryOf(facts);
    if (defect !== null || target === null ||
        JSON.stringify(target) !== JSON.stringify(request.claimTarget) ||
        !Number.isSafeInteger(request.claimRevision) || request.claimRevision <= 0) {
      return releaseAnswer(defect ?? OUTCOME.STALE, request);
    }
    publishParticipantReleaseLocalCurrent(service,
      request.controlAuthorization.authorizationId, target,
      controlOwnerOf(request));
    return releaseAnswer(OUTCOME.SHARED, request,
      {target, claimRevision: request.claimRevision});
  }
  case ACTION.AUTHORIZE: {
    if (service.tableName !== TABLES.SQL_TRANSACTIONS ||
        request.controlAuthorization?.controlPartitionId !== service.partitionId) {
      return releaseAnswer(OUTCOME.INVALID, request);
    }
    const retainedAuthorization = retainedAuthorizationMatches(service, request);
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
          queryDrainProof: request.dependentQueryDrainProof,
          pausedRequired: !retainedAuthorization});
    if (controlDefect !== null || dependentDefect !== null) {
      return releaseAnswer(controlDefect ?? dependentDefect, request);
    }
    if (retainedAuthorization) {
      const retained = parseJson(readParticipantReleaseState(service.db).controlText);
      return releaseAnswer(OUTCOME.AUTHORIZED, request, {
        controlPartitionId: service.partitionId,
        authorizationId: retained.authorizationId,
        authorizationRevision: retained.authorizationRevision,
        controlIndex: retained.controlIndex,
        controlTerm: retained.controlTerm,
        dispatchIndex: retained.dispatchIndex,
        dispatchTerm: retained.dispatchTerm,
        replayed: true});
    }
    const decision = {
      dependentRelease: request.dependentRelease,
      controlRelease: request.release,
      controlCensus: request.controlCensus,
      dependentCensus: request.dependentCensus,
      authorizationId: request.controlAuthorization.authorizationId,
      deadlineAtMs: request.deadlineAtMs,
    };
    const reserved = await reserveParticipantRelease(service, decision);
    if (reserved?.outcome !== RELEASE_APPLY_RESULT.RESERVED &&
        reserved?.outcome !== RELEASE_APPLY_RESULT.AUTHORIZED) {
      return releaseAnswer(reserved?.outcome === RELEASE_APPLY_RESULT.STALE ?
        OUTCOME.STALE : OUTCOME.UNAVAILABLE, request,
      {missingFact: 'committed_control_reservation', reserved});
    }
    if (reserved.outcome === RELEASE_APPLY_RESULT.RESERVED) {
      for (const member of request.controlCensus) {
        const base = {partitionId: request.release.partitionId,
          replicaId: member.generation.replicaId, release: request.release,
          attempt: request.attempt, target: member.generation,
          deadlineAtMs: request.deadlineAtMs,
          controlCensus: request.controlCensus,
          controlQueryDrainProof: request.controlQueryDrainProof,
          controlAuthorization: request.controlAuthorization};
        const claimed = await askUntilObserved(handler,
          member.generation.nodeId, {...base, action: ACTION.CLAIM}, OUTCOME.CLAIMED);
        if (claimed.outcome !== OUTCOME.CLAIMED) return claimed;
        const published = await publishParticipantReleaseClaim(service, {
          authorizationId: decision.authorizationId, target: claimed.target});
        if (published?.outcome !== RELEASE_APPLY_RESULT.RESERVED) {
          return releaseAnswer(OUTCOME.STALE, request,
            {missingFact: 'committed_control_member_claim', published});
        }
        const shared = await askUntilObserved(handler,
          member.generation.nodeId, {...base, action: ACTION.SHARE,
            claimTarget: claimed.target,
            claimRevision: published.claimRevision}, OUTCOME.SHARED);
        if (shared.outcome !== OUTCOME.SHARED) return shared;
        const recorded = await recordParticipantReleaseShare(service, {
          authorizationId: decision.authorizationId, target: shared.target,
          claimRevision: shared.claimRevision});
        if (recorded?.outcome !== RELEASE_APPLY_RESULT.RESERVED) {
          return releaseAnswer(OUTCOME.STALE, request,
            {missingFact: 'committed_control_member_share', recorded});
        }
      }
    }
    const finalized = reserved.outcome === RELEASE_APPLY_RESULT.AUTHORIZED ?
      reserved : await finalizeReservedParticipantRelease(service, decision);
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
    const resumed = observeParticipantAdmissionResume(service, {
      dependentRelease: request.release,
      controlPartitionId: control.controlPartitionId,
      controlAuthorizationId: control.authorizationId,
      controlAuthorizationRevision: control.authorizationRevision,
      census: request.census,
    });
    if (resumed?.outcome !== RELEASE_APPLY_RESULT.RESUMED) {
      return releaseAnswer(resumed?.outcome === RELEASE_APPLY_RESULT.STALE ?
        OUTCOME.STALE : OUTCOME.UNAVAILABLE, request,
      {missingFact: 'committed_dependent_resume', resumed});
    }
    const outcome = await resumeParticipantCutoverAdmission(handler, service, request);
    if (outcome === OUTCOME.RESUMED) {
      publishParticipantReleaseLocalCurrent(service,
        control.authorizationId, target, request.controlOwner ?? null);
    }
    return releaseAnswer(outcome, request,
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
    for (const receipt of request.receipts ?? []) {
      const recorded = await recordParticipantReleaseReceipt(service, {
        authorizationId: request.controlAuthorization.authorizationId,
        receipt});
      if (recorded?.outcome !== RELEASE_APPLY_RESULT.DISPATCHED) {
        return releaseAnswer(recorded?.outcome === RELEASE_APPLY_RESULT.STALE ?
          OUTCOME.STALE : OUTCOME.UNAVAILABLE, request,
        {missingFact: 'committed_target_opened_receipt', recorded});
      }
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
  case ACTION.RETIRE: {
    const retiredTarget = request.retiredTarget;
    if (request.controlAuthorization?.controlPartitionId !== service.partitionId ||
        request.controlAuthorization.authorizationId === undefined ||
        !targetEntryValid(retiredTarget) ||
        typeof request.retirementId !== 'string' ||
        request.retirementId.length === 0) {
      return releaseAnswer(OUTCOME.INVALID, request);
    }
    const retired = await retireParticipantRelease(service, {
      authorizationId: request.controlAuthorization.authorizationId,
      retiredTarget,
      retirementId: request.retirementId,
    });
    return retired?.outcome === RELEASE_APPLY_RESULT.RETIRED ?
      releaseAnswer(OUTCOME.RETIRED, request, {
        controlRevision: retired.controlRevision,
        retirementIndex: retired.retirementIndex,
        retirementTerm: retired.retirementTerm}) :
      releaseAnswer(retired?.outcome === RELEASE_APPLY_RESULT.STALE ?
        OUTCOME.STALE : OUTCOME.UNAVAILABLE, request,
      {missingFact: 'committed_control_retirement', retired});
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
    if (!sameReplicaGeneration(request.target, facts.generation)) {
      return releaseAnswer(OUTCOME.STALE, request,
        {missingFact: 'current_replica_generation', requested: request.target,
          current: facts.generation});
    }
    if (!attemptMatches(request, facts)) {
      return releaseAnswer(OUTCOME.STALE, request,
        {missingFact: 'current_release_attempt'});
    }
    if (![ACTION.PAUSE, ACTION.RESUME, ACTION.CLAIM, ACTION.SHARE, ACTION.AUTHORIZE,
      ACTION.CONFIRM, ACTION.RETIRE].includes(request.action) && facts.paused !== true) {
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
      return releaseAnswer(OUTCOME.STALE, request,
        {missingFact: 'current_runtime_attempt'});
    }
    return executeReleaseAction(handler, service, request, facts);
  } catch (error) {
    return releaseAnswer(OUTCOME.INVALID, request, {reason: String(error?.message ?? error)});
  }
}

export {receiveParticipantRelease};
