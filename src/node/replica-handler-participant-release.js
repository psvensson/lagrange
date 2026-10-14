// The lifecycle recipient survives a PartitionService replacement. Each
// mutation checks the canonical release, leader term and exact target
// lifetime. Reopen uses retained-storage admission and the production factory.
import {RAFT_ROLE} from '../raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from '../raft/raft-committed-membership-constants.js';
import {buildReplacementServiceOptions} from '../partition/partition-reopen-options.js';
import {isReleaseDrained, originEqual, participantReleaseGenerationValid,
  releaseAnswer, releaseCensusDefect, releaseIdentityValid, sameReplicaGeneration} from
  '../partition/partition-participant-release-contract.js';
import {participantCutoverPauseOf, participantReleaseReplicaGenerationOf,
  raiseParticipantCutoverPause, readParticipantReleaseFacts,
  readParticipantReleaseObservationAssessment, resumeParticipantCutoverAdmission} from
  '../partition/partition-participant-transaction-pause.js';
import {enableParticipantTransactionAdmission} from
  '../partition/partition-participant-transaction-request.js';
import {PARTICIPANT_RELEASE_ACTION as ACTION, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_TYPE} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {observeParticipantAppliedPosition} from
  './participant-release-applied-position-observation.js';
import {participantReleaseSafeClockInteger} from
  './participant-release-diagnostic-observation.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';

const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const RELEASE_NESTED_FIELDS = objectFreeze(['release', 'attempt', 'target', 'origin']);

function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}

function positiveInteger(value) {
  return participantReleaseSafeClockInteger(value) && value > 0;
}

function validIncarnation(value) {
  return nonempty(value) || positiveInteger(value);
}

function actionRequiresIdentity(action) {
  return action === ACTION.PAUSE || action === ACTION.REOPEN ||
    action === ACTION.ENABLE || action === ACTION.OBSERVE_APPLIED_POSITION ||
    action === ACTION.RESUME;
}

function releaseScalarsValid(release) {
  return release !== null && nonempty(release.partitionId) &&
    nonempty(release.targetBuildDigest) && nonempty(release.configurationKey) &&
    nonempty(release.releaseId) &&
    participantReleaseSafeClockInteger(release.protocolVersion) &&
    participantReleaseSafeClockInteger(release.membershipGenerationIndex) &&
    release.membershipGenerationIndex >= 0;
}

function attemptScalarsValid(attempt) {
  return attempt !== null && positiveInteger(attempt.term) &&
    nonempty(attempt.leaderReplicaId) &&
    validIncarnation(attempt.leaderLifecycleIncarnation) &&
    participantReleaseSafeClockInteger(attempt.deadlineAtMs) &&
    attempt.deadlineAtMs >= 0;
}

function originScalarsValid(origin) {
  return origin !== null && positiveInteger(origin.originIndex) &&
    positiveInteger(origin.originTerm) && originEqual(origin, origin);
}

function safeInvalidRequest(request) {
  const releaseId = typeof request.release?.releaseId === 'string' ?
    request.release.releaseId : null;
  return objectFreeze({
    action: typeof request.action === 'string' ? request.action : null,
    partitionId: typeof request.partitionId === 'string' ? request.partitionId : null,
    release: releaseId === null ? null : objectFreeze({releaseId}),
  });
}

function invalidReleaseDispatch(request) {
  return objectFreeze({kind: 'release', request,
    refusal: releaseAnswer(OUTCOME.INVALID, safeInvalidRequest(request)),
    observationValidated: false});
}

function captureReleaseNestedRecords(request) {
  let valid = true;
  for (const field of RELEASE_NESTED_FIELDS) {
    if (!objectHasOwn(request, field) || request[field] === null ||
        request[field] === undefined) continue;
    const nested = copyStrictOwnDataRecord(request[field]);
    request[field] = nested === null ? null : objectFreeze(nested);
    if (nested === null) valid = false;
  }
  return valid;
}

function releaseRequestIdentityValid(request) {
  if (!actionRequiresIdentity(request.action)) return true;
  const scalarsValid = nonempty(request.partitionId) && nonempty(request.replicaId) &&
    releaseScalarsValid(request.release) && attemptScalarsValid(request.attempt) &&
    participantReleaseGenerationValid(request.target) &&
    participantReleaseSafeClockInteger(request.deadlineAtMs) &&
    request.deadlineAtMs >= 0;
  const originValid = request.action !== ACTION.OBSERVE_APPLIED_POSITION ||
    originScalarsValid(request.origin);
  return scalarsValid && originValid && releaseIdentityValid(request.release);
}

function observationDeadlineTupleValid(request) {
  return participantReleaseSafeClockInteger(request.deadlineAtMs) &&
    request.deadlineAtMs >= 0 &&
    participantReleaseSafeClockInteger(request.observationDeadlineAtMs) &&
    request.observationDeadlineAtMs >= 0 &&
    request.observationDeadlineAtMs <= request.deadlineAtMs &&
    request.deadlineAtMs === request.attempt?.deadlineAtMs;
}

function observationIdentityTupleValid(request) {
  return nonempty(request.partitionId) && nonempty(request.replicaId) &&
    request.partitionId === request.release?.partitionId &&
    request.replicaId === request.target?.replicaId;
}

function observationRequestCoherent(request) {
  return observationIdentityTupleValid(request) &&
    observationDeadlineTupleValid(request);
}

function captureParticipantReleaseDispatch(payload) {
  const request = copyStrictOwnDataRecord(payload);
  if (request === null || typeof request.type !== 'string') {
    return objectFreeze({kind: 'malformed'});
  }
  if (request.type !== PARTICIPANT_RELEASE_TYPE) {
    return objectFreeze({kind: 'ordinary', type: request.type,
      operationId: request.operationId});
  }
  const nestedValid = captureReleaseNestedRecords(request);
  const captured = objectFreeze(request);
  if (!nestedValid || typeof captured.action !== 'string') {
    return invalidReleaseDispatch(captured);
  }
  if (!releaseRequestIdentityValid(captured)) return invalidReleaseDispatch(captured);
  if (captured.action !== ACTION.OBSERVE_APPLIED_POSITION) {
    return objectFreeze({kind: 'release', request: captured, refusal: null,
      observationValidated: false});
  }
  return observationRequestCoherent(captured) ? objectFreeze({kind: 'release',
    request: captured, refusal: null, observationValidated: true}) :
    invalidReleaseDispatch(captured);
}

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

function releaseRequestIdentityRefusal(service, request, facts) {
  if (!releaseIdentityValid(request.release) ||
      request.release.partitionId !== service.partitionId) {
    return releaseAnswer(OUTCOME.INVALID, request);
  }
  const generationMatches = sameReplicaGeneration(request.target, facts.generation) &&
    attemptMatches(request, facts);
  const pauseMatches = request.action === ACTION.PAUSE || facts.paused === true ||
    request.action === ACTION.RESUME;
  return generationMatches && pauseMatches ? null :
    releaseAnswer(OUTCOME.STALE, request);
}

function releaseStatusMatches(service, request, status) {
  const statusMatches = status.term === request.attempt.term &&
    status.leaderId === request.attempt.leaderReplicaId &&
    status.configurationKey === request.release.configurationKey;
  const leaderLifecycleMatches = service.replicaId !== request.attempt.leaderReplicaId ||
    status.lifecycleIncarnation === request.attempt.leaderLifecycleIncarnation;
  return statusMatches && leaderLifecycleMatches;
}

function releaseRequestRefusal(_handler, service, request, facts) {
  if (facts.outcome !== OUTCOME.OBSERVED) return facts;
  const identityRefusal = releaseRequestIdentityRefusal(service, request, facts);
  if (identityRefusal !== null) return identityRefusal;
  // A release request always closes new work even on a mixed-build node.
  if (request.action === ACTION.PAUSE) raiseParticipantCutoverPause(service);
  if (facts.buildDigest !== request.release.targetBuildDigest) {
    return releaseAnswer(OUTCOME.BUILD_MISMATCH, request);
  }
  const status = service.raft.readStatus();
  return releaseStatusMatches(service, request, status) ? null :
    releaseAnswer(OUTCOME.STALE, request);
}

function observationAnswer(request, answer) {
  const {outcome, ...fields} = answer;
  return releaseAnswer(outcome, request, fields);
}

function observationLifecycleCurrent(handler, service, request, expectedPort) {
  return handler.shuttingDown !== true && service.initialized === true &&
    service.isShutdown !== true && service.raft === expectedPort &&
    handler.localServices.get(request.replicaId) === service;
}

function observationStatusMatches(handler, service, request, context, status) {
  const generation = participantReleaseReplicaGenerationOf(handler, service, status);
  if (!participantReleaseGenerationValid(generation) ||
      !sameReplicaGeneration(request.target, generation) ||
      !sameReplicaGeneration(context.generation, generation)) return false;
  return releaseStatusMatches(service, request, status) &&
    status.membershipGenerationIndex === request.release.membershipGenerationIndex &&
    status.term === context.term && status.leaderId === context.leaderReplicaId &&
    status.configurationKey === context.configurationKey &&
    status.membershipGenerationIndex === context.membershipGenerationIndex &&
    status.appliedIndex === context.appliedIndex;
}

function observationContextMatches(handler, service, request, context, expectedPort) {
  if (!observationLifecycleCurrent(handler, service, request, expectedPort)) return false;
  if (context.buildDigest !== request.release.targetBuildDigest ||
      context.paused !== true || participantCutoverPauseOf(service) === null) return false;
  const status = expectedPort.readStatus();
  if (status.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) return false;
  return observationStatusMatches(handler, service, request, context, status) &&
    observationLifecycleCurrent(handler, service, request, expectedPort);
}

async function participantReleaseObservationDecision(handler, service, request,
  expectedPort) {
  const assessment = await readParticipantReleaseObservationAssessment(handler, service);
  if (!observationLifecycleCurrent(handler, service, request, expectedPort)) {
    return {answer: releaseAnswer(OUTCOME.STALE, request), refreshEligible: false};
  }
  if (assessment.context === null) {
    return {answer: observationAnswer(request, assessment.answer), refreshEligible: false};
  }
  if (!observationContextMatches(handler, service, request, assessment.context,
    expectedPort)) {
    return {answer: releaseAnswer(OUTCOME.STALE, request), refreshEligible: false};
  }
  return {answer: observationAnswer(request, assessment.answer),
    refreshEligible: assessment.refreshEligible};
}

function requestDeadlineSpent(handler, request) {
  return request.action !== ACTION.OBSERVE_APPLIED_POSITION &&
    Number.isSafeInteger(request.deadlineAtMs) &&
    handler.timeSource.now() >= request.deadlineAtMs;
}

async function receiveCurrentParticipantRelease(handler, service, request) {
  const purpose = request.action === ACTION.INSPECT && request.leaderCohort === true ?
    COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT :
    COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS;
  const facts = await readParticipantReleaseFacts(handler, service, purpose);
  if (request.action === ACTION.INSPECT) return facts;
  const refusal = releaseRequestRefusal(handler, service, request, facts);
  return refusal ?? executeReleaseAction(handler, service, request, facts);
}

async function receiveParticipantRelease(handler, request,
  observationValidated = false) {
  try {
    if (requestDeadlineSpent(handler, request)) {
      return releaseAnswer(OUTCOME.UNAVAILABLE, request,
        {missingFact: 'release_deadline'});
    }
    const service = handler.localServices.get(request.replicaId);
    if (!service || service.partitionId !== request.partitionId) {
      return releaseAnswer(OUTCOME.UNAVAILABLE, request, {missingFact: 'hosted_replica'});
    }
    if (request.action === ACTION.OBSERVE_APPLIED_POSITION) {
      if (!observationValidated) return releaseAnswer(OUTCOME.INVALID, request);
      return observeParticipantAppliedPosition(handler, service, request,
        participantReleaseObservationDecision);
    }
    return receiveCurrentParticipantRelease(handler, service, request);
  } catch (error) {
    return releaseAnswer(OUTCOME.INVALID, request, {reason: String(error?.message ?? error)});
  }
}

export {captureParticipantReleaseDispatch, receiveParticipantRelease};
