// The lifecycle recipient survives a PartitionService replacement. Each
// mutation checks the canonical release, leader term and exact target
// lifetime.
import {RAFT_ROLE} from '../raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from '../raft/raft-committed-membership-constants.js';
import {originEqual, participantReleaseGenerationValid,
  releaseAnswer, releaseCensusDefect, releaseIdentityValid, sameReplicaGeneration} from
  '../partition/partition-participant-release-contract.js';
import {participantCutoverPauseOf, participantReleaseReplicaGenerationOf,
  raiseParticipantCutoverPause, readParticipantReleaseFacts,
  readParticipantReleaseObservationAssessment, resumeParticipantCutoverAdmission} from
  '../partition/partition-participant-transaction-pause.js';
import {enableParticipantTransactionAdmission} from
  '../partition/partition-participant-transaction-request.js';
import {PARTICIPANT_RELEASE_ACTION as ACTION, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING_FACT, PARTICIPANT_RELEASE_TYPE} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {observeParticipantAppliedPosition} from
  './participant-release-applied-position-observation.js';
import {participantReleaseSafeClockInteger} from
  './participant-release-diagnostic-observation.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {REPLICA_HANDLER_PARTICIPANT_RELEASE_DISPATCH_KIND as DISPATCH_KIND} from
  './replica-handler-constants.js';

const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const RELEASE_NESTED_FIELDS = objectFreeze(['release', 'attempt', 'target', 'origin']);
// The leader fields an observation's status and its captured context must
// each carry (null allowed) before they can be compared.
const OBSERVATION_FIELD = objectFreeze({STATUS_LEADER: 'leaderId',
  CONTEXT_LEADER: 'leaderReplicaId'});

function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}

function positiveInteger(value) {
  return participantReleaseSafeClockInteger(value) && value > 0;
}

function validIncarnation(value) {
  return nonempty(value) || positiveInteger(value);
}

function record(value) {
  return value !== null && typeof value === 'object';
}

function actionRequiresIdentity(action) {
  return action === ACTION.PAUSE || action === ACTION.ENABLE ||
    action === ACTION.OBSERVE_APPLIED_POSITION || action === ACTION.RESUME;
}

function releaseScalarsValid(release) {
  return record(release) && nonempty(release.partitionId) &&
    nonempty(release.targetBuildDigest) && nonempty(release.configurationKey) &&
    nonempty(release.releaseId) &&
    participantReleaseSafeClockInteger(release.protocolVersion) &&
    participantReleaseSafeClockInteger(release.membershipGenerationIndex) &&
    release.membershipGenerationIndex >= 0;
}

function attemptScalarsValid(attempt) {
  return record(attempt) && positiveInteger(attempt.term) &&
    nonempty(attempt.leaderReplicaId) &&
    validIncarnation(attempt.leaderLifecycleIncarnation) &&
    participantReleaseSafeClockInteger(attempt.deadlineAtMs) &&
    attempt.deadlineAtMs >= 0;
}

function originScalarsValid(origin) {
  return record(origin) && positiveInteger(origin.originIndex) &&
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
  return objectFreeze({kind: DISPATCH_KIND.RELEASE, request,
    refusal: releaseAnswer(OUTCOME.INVALID, safeInvalidRequest(request)),
    observationValidated: false});
}

function captureReleaseNestedRecords(request) {
  let valid = true;
  for (let index = 0; index < RELEASE_NESTED_FIELDS.length; index += 1) {
    const field = RELEASE_NESTED_FIELDS[index];
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
    return objectFreeze({kind: DISPATCH_KIND.MALFORMED});
  }
  if (request.type !== PARTICIPANT_RELEASE_TYPE) {
    return objectFreeze({kind: DISPATCH_KIND.ORDINARY, type: request.type,
      operationId: request.operationId});
  }
  const nestedValid = captureReleaseNestedRecords(request);
  const captured = objectFreeze(request);
  if (!nestedValid || typeof captured.action !== 'string') {
    return invalidReleaseDispatch(captured);
  }
  if (!releaseRequestIdentityValid(captured)) return invalidReleaseDispatch(captured);
  if (captured.action !== ACTION.OBSERVE_APPLIED_POSITION) {
    return objectFreeze({kind: DISPATCH_KIND.RELEASE, request: captured, refusal: null,
      observationValidated: false});
  }
  return observationRequestCoherent(captured) ? objectFreeze({kind: DISPATCH_KIND.RELEASE,
    request: captured, refusal: null, observationValidated: true}) :
    invalidReleaseDispatch(captured);
}

function attemptMatches(request, facts) {
  return request.attempt?.term === facts.membership.term &&
    request.attempt?.leaderReplicaId === facts.leaderReplicaId &&
    request.release.configurationKey === facts.membership.configurationKey &&
    request.release.membershipGenerationIndex === facts.membership.membershipGenerationIndex;
}

async function executeReleaseAction(handler, service, request, facts) {
  switch (request.action) {
  case ACTION.PAUSE: {
    const pause = raiseParticipantCutoverPause(service);
    return facts.paused === true &&
      pause.generation === facts.generation?.admissionGeneration ?
      facts : objectFreeze({...facts, paused: true,
        generation: objectFreeze({...facts.generation,
          admissionGeneration: pause.generation})});
  }
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

// The post-await recipient fence must distinguish a KNOWN changed identity
// from a status whose current identity is unavailable. A boolean mismatch
// would incorrectly turn either into STALE.
function observationStatusDisposition(handler, service, request, context, status) {
  let generation;
  try {
    generation = participantReleaseReplicaGenerationOf(handler, service, status);
  } catch {
    return OUTCOME.UNAVAILABLE;
  }
  if (!participantReleaseGenerationValid(generation)) return OUTCOME.UNAVAILABLE;
  if (!sameReplicaGeneration(request.target, generation) ||
      !sameReplicaGeneration(context.generation, generation)) return OUTCOME.STALE;

  // CORE_OK alone does not prove all of the fields compared below are
  // present and measurable. Unknown fields cannot establish a known veto.
  if (!Number.isSafeInteger(status.term) || status.term < 0 ||
      !Number.isSafeInteger(status.appliedIndex) || status.appliedIndex < 0 ||
      !Number.isSafeInteger(status.membershipGenerationIndex) ||
      status.membershipGenerationIndex < 0 ||
      !nonempty(status.configurationKey) ||
      !objectHasOwn(status, OBSERVATION_FIELD.STATUS_LEADER) ||
      (status.leaderId !== null && !nonempty(status.leaderId)) ||
      !Number.isSafeInteger(context.appliedIndex) || context.appliedIndex < 0 ||
      !Number.isSafeInteger(context.membershipGenerationIndex) ||
      context.membershipGenerationIndex < 0 ||
      !nonempty(context.configurationKey) ||
      !objectHasOwn(context, OBSERVATION_FIELD.CONTEXT_LEADER)) return OUTCOME.UNAVAILABLE;

  return releaseStatusMatches(service, request, status) &&
    status.membershipGenerationIndex === request.release.membershipGenerationIndex &&
    status.term === context.term && status.leaderId === context.leaderReplicaId &&
    status.configurationKey === context.configurationKey &&
    status.membershipGenerationIndex === context.membershipGenerationIndex &&
    status.appliedIndex >= context.appliedIndex ? null : OUTCOME.STALE;
}

function observationContextDisposition(handler, service, request, context, expectedPort) {
  if (!observationLifecycleCurrent(handler, service, request, expectedPort)) {
    return OUTCOME.STALE;
  }
  if (context.buildDigest !== request.release.targetBuildDigest ||
      context.paused !== true || participantCutoverPauseOf(service) === null) {
    return OUTCOME.STALE;
  }
  const status = expectedPort.readStatus();
  if (status?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    return OUTCOME.UNAVAILABLE;
  }
  const disposition = observationStatusDisposition(handler, service, request,
    context, status);
  if (!observationLifecycleCurrent(handler, service, request, expectedPort)) {
    return OUTCOME.STALE;
  }
  return disposition;
}

function adjudicateParticipantReleaseObservation(handler, service, request,
  expectedPort, assessment) {
  if (!observationLifecycleCurrent(handler, service, request, expectedPort)) {
    return {answer: releaseAnswer(OUTCOME.STALE, request), refreshEligible: false};
  }
  if (assessment.context === null) {
    return {answer: observationAnswer(request, assessment.answer), refreshEligible: false};
  }
  const disposition = observationContextDisposition(handler, service, request,
    assessment.context, expectedPort);
  if (disposition === OUTCOME.STALE) {
    return {answer: releaseAnswer(OUTCOME.STALE, request), refreshEligible: false};
  }
  if (disposition === OUTCOME.UNAVAILABLE) {
    return {answer: assessment.answer.outcome === OUTCOME.UNAVAILABLE ?
      observationAnswer(request, assessment.answer) :
      releaseAnswer(OUTCOME.UNAVAILABLE, request, {
        missingFact: MISSING_FACT.CURRENT_REPLICA_GENERATION}), refreshEligible: false};
  }
  return {answer: observationAnswer(request, assessment.answer),
    refreshEligible: assessment.refreshEligible};
}

function requestDeadlineSpent(handler, request) {
  return request.action !== ACTION.OBSERVE_APPLIED_POSITION &&
    Number.isSafeInteger(request.deadlineAtMs) &&
    handler.timeSource.now() >= request.deadlineAtMs;
}

function isEligiblePausedResumeRequest(service, request) {
  return request.action === ACTION.RESUME &&
    participantCutoverPauseOf(service) !== null &&
    releaseIdentityValid(request.release) &&
    request.release.partitionId === service.partitionId;
}

function canFastPathPausedResume(handler, service, request) {
  if (!isEligiblePausedResumeRequest(service, request)) {
    return false;
  }
  try {
    const status = service.raft?.readStatus?.();
    if (status?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK ||
        status.membershipGenerationIndex !==
          request.release.membershipGenerationIndex ||
        !releaseStatusMatches(service, request, status)) {
      return false;
    }
    const generation = participantReleaseReplicaGenerationOf(
      handler, service, status);
    return participantReleaseGenerationValid(generation) &&
      sameReplicaGeneration(request.target, generation);
  } catch {
    return false;
  }
}

async function receiveCurrentParticipantRelease(handler, service, request) {
  const purpose = request.action === ACTION.INSPECT && request.leaderCohort === true ?
    COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT :
    COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS;
  if (canFastPathPausedResume(handler, service, request)) {
    const outcome = await resumeParticipantCutoverAdmission(
      handler, service, request);
    if (outcome !== OUTCOME.UNAVAILABLE) {
      return releaseAnswer(outcome, request);
    }
  }
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
        {missingFact: MISSING_FACT.RELEASE_DEADLINE});
    }
    const service = handler.localServices.get(request.replicaId);
    if (!service || service.partitionId !== request.partitionId) {
      return releaseAnswer(OUTCOME.UNAVAILABLE, request,
        {missingFact: MISSING_FACT.HOSTED_REPLICA});
    }
    if (request.action === ACTION.OBSERVE_APPLIED_POSITION) {
      if (!observationValidated) return releaseAnswer(OUTCOME.INVALID, request);
      return observeParticipantAppliedPosition(handler, service, request,
        readParticipantReleaseObservationAssessment,
        adjudicateParticipantReleaseObservation);
    }
    return receiveCurrentParticipantRelease(handler, service, request);
  } catch (error) {
    return releaseAnswer(OUTCOME.INVALID, request, {reason: String(error?.message ?? error)});
  }
}

export {captureParticipantReleaseDispatch, receiveParticipantRelease};
