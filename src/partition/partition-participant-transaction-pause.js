// Reconstructed release execution state. Every service lifetime starts
// closed. Only an exact complete census checked against the current owners
// resumes it; origin remains the durable legacy-retirement fact.
import {runtimeBuildProvenance, RUNTIME_BUILD_STATE} from
  '../diagnostics/runtime-build-provenance.js';
import {TABLES} from '../constants/tables.js';
import {ERRORS} from '../constants/errors.js';
import {readTransactionReleaseCensus} from
  '../query/distributed/distributed-transaction-release-census.js';
import {COMMITTED_MEMBERSHIP_ANSWER_KIND, COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../raft/raft-committed-membership-constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {deepFreeze} from '../raft/raft-operation-port.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from './partition-write-kernel.js';
import {participantConnectionStampOf} from './partition-participant-transaction-connection.js';
import {participantReleaseGenerationValid, releaseCensusDefect,
  sameReplicaGeneration} from './partition-participant-release-contract.js';
import {hasParticipantSession} from './partition-participant-transaction-session.js';
import {readPreparedParticipantIds, readPartitionWriteOrigin} from
  './partition-participant-transaction-store.js';
import {readTableShape} from './partition-statement-admission-rowid-rules.js';
import {PARTITION_ROWID_LIMIT} from './partition-statement-admission-constants.js';
import {topologyTransitionOf} from './partition-participant-transaction-topology-fence.js';
import {PARTICIPANT_CUTOVER_BOUND, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION} from
  './partition-participant-transaction-cutover-constants.js';

// Facts project the existing owners for one live replica. They grant no
// admission and never interpret follower matchedIndex as apply.
const FACT = Object.freeze({
  HOSTED: 'current_lifecycle_registry', BUILD: 'measured_boot_content',
  MEMBERSHIP: 'committed_membership_witness', GENERATION: 'current_replica_generation',
  ROWID: 'own_table_rowid', DRAIN: 'accepted_work_owners',
});
const ROWID_KIND = Object.freeze({WITHOUT: 'without_rowid', ROWID: 'rowid'});

function unavailable(missingFact, reason = null) {
  return deepFreeze({outcome: OUTCOME.UNAVAILABLE, missingFact, reason});
}

function readRowidCensus(service) {
  const shape = readTableShape(service.db, service.tableName);
  if (!shape.exists || (!shape.withoutRowid && shape.maxRowid === null)) {
    throw new Error(FACT.ROWID);
  }
  const maximum = shape.withoutRowid ? null : shape.maxRowid.get()?.maximum ?? null;
  return Object.freeze({kind: shape.withoutRowid ? ROWID_KIND.WITHOUT : ROWID_KIND.ROWID,
    maximum: maximum === null ? null : String(maximum),
    belowCeiling: maximum === null || BigInt(maximum) < PARTITION_ROWID_LIMIT.CEILING});
}

function readAcceptedWork(service, membership, status) {
  const proposals = service.proposalQueue?.size;
  const pendingOutcomes = service.pendingWriteOutcomes?.size;
  if (![proposals, pendingOutcomes,
    membership.appliedIndex, status.commitIndex, status.lastIndex]
    .every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error(FACT.DRAIN);
  }
  const prepared = readPreparedParticipantIds(service.db);
  return Object.freeze({sqliteTransactionOpen: service.db.inTransaction === true,
    participantStaging: hasParticipantSession(service),
    participantPrepared: prepared.length, proposals, pendingOutcomes,
    appliedIndex: membership.appliedIndex, commitIndex: status.commitIndex,
    lastIndex: status.lastIndex});
}

function replicaGenerationOf(handler, service, status) {
  const connection = participantConnectionStampOf(service.db);
  const admission = participantReleaseAdmissionOf(service);
  return Object.freeze({nodeId: handler.nodeId, ownerIncarnation: handler.ownerIncarnation,
    replicaId: service.replicaId, lifecycleIncarnation: status.lifecycleIncarnation,
    runtimeGeneration: status.runtimeGeneration, connectionGeneration: connection.generation,
    admissionGeneration: admission.generation});
}

function participantReleaseFactsAssessment(answer, context = null,
  refreshEligible = false) {
  return deepFreeze({answer, context, refreshEligible});
}

function hostedReleaseService(handler, service) {
  return service?.initialized === true && service.isShutdown !== true &&
    handler.localServices.get(service.replicaId) === service;
}

function committedMembershipAvailable(membership, status) {
  return membership.kind === COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED &&
    status.outcome === RAFT_OPERATION_OUTCOME.CORE_OK;
}

function releaseFactsContext(build, generation, paused, status) {
  return deepFreeze({buildDigest: build.digest, generation, paused,
    term: status.term, leaderReplicaId: status.leaderId,
    configurationKey: status.configurationKey,
    membershipGenerationIndex: status.membershipGenerationIndex,
    appliedIndex: status.appliedIndex});
}

function membershipAssessment(membership, status, context,
  requireMembershipGeneration) {
  const sameBaseLineage = membership.configurationKey === status.configurationKey &&
    membership.term === status.term;
  const sameMembershipGeneration = membership.membershipGenerationIndex ===
    status.membershipGenerationIndex;
  const current = sameBaseLineage && membership.appliedIndex === status.appliedIndex &&
    (!requireMembershipGeneration || sameMembershipGeneration);
  if (current) return null;
  const refreshEligible = requireMembershipGeneration && sameBaseLineage &&
    sameMembershipGeneration && membership.appliedIndex < status.appliedIndex;
  return participantReleaseFactsAssessment(
    unavailable(FACT.MEMBERSHIP, membership.reason ?? status.reason),
    refreshEligible ? context : null, refreshEligible);
}

function observedReleaseFacts(service, build, membership, status, generation, paused) {
  return deepFreeze({outcome: OUTCOME.OBSERVED,
    partitionId: service.partitionId,
    generation, buildDigest: build.digest, membership,
    leaderReplicaId: status.leaderId, leaderAddress: status.leaderAddress,
    role: status.role, confChangePending: status.confChangePending,
    peers: status.peers, origin: readPartitionWriteOrigin(service.db),
    connection: participantConnectionStampOf(service.db),
    paused,
    rowid: readRowidCensus(service), work: readAcceptedWork(service, membership, status),
    topology: topologyTransitionOf(service),
    queryCensus: service.tableName === TABLES.SQL_TRANSACTIONS ?
      readTransactionReleaseCensus(service.db) : null});
}

async function readParticipantReleaseFactsAssessment(handler, service,
  purpose = COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS,
  requireMembershipGeneration = false) {
  if (!hostedReleaseService(handler, service)) {
    return participantReleaseFactsAssessment(unavailable(FACT.HOSTED));
  }
  const build = await runtimeBuildProvenance();
  if (build.state !== RUNTIME_BUILD_STATE.MEASURED) {
    return participantReleaseFactsAssessment(unavailable(FACT.BUILD, build.reason));
  }
  try {
    const membership = await service.raft.readCommittedMembership({purpose});
    const status = service.raft.readStatus();
    if (!committedMembershipAvailable(membership, status)) {
      const refusal = unavailable(FACT.MEMBERSHIP,
        membership.reason ?? status.reason);
      // Only the OBSERVE continuation needs independent identity context
      // when the membership owner refuses. Ordinary facts preserve their
      // original refusal precedence and do not touch admission/pause owners.
      if (!requireMembershipGeneration ||
          status.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
        return participantReleaseFactsAssessment(refusal);
      }
      const refusalGeneration = replicaGenerationOf(handler, service, status);
      if (!participantReleaseGenerationValid(refusalGeneration)) {
        return participantReleaseFactsAssessment(refusal);
      }
      return participantReleaseFactsAssessment(refusal,
        releaseFactsContext(build, refusalGeneration,
          participantCutoverPauseOf(service) !== null, status));
    }
    const generation = replicaGenerationOf(handler, service, status);
    if (!participantReleaseGenerationValid(generation)) {
      return participantReleaseFactsAssessment(unavailable(FACT.GENERATION));
    }
    const paused = participantCutoverPauseOf(service) !== null;
    const context = releaseFactsContext(build, generation, paused, status);
    const refused = membershipAssessment(membership, status, context,
      requireMembershipGeneration);
    return refused ?? participantReleaseFactsAssessment(
      observedReleaseFacts(service, build, membership, status, generation, paused),
      context);
  } catch (error) {
    return participantReleaseFactsAssessment(
      unavailable(FACT.MEMBERSHIP, String(error?.message ?? error)));
  }
}

async function readParticipantReleaseObservationAssessment(handler, service) {
  return readParticipantReleaseFactsAssessment(handler, service,
    COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS, true);
}

async function readParticipantReleaseFacts(handler, service,
  purpose = COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS) {
  return (await readParticipantReleaseFactsAssessment(handler, service,
    purpose)).answer;
}

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
  // Current membership may have been awaited beyond the caller's original
  // absolute release deadline. A previously committed origin is durable, but
  // expiry cannot authorize NEW OPEN admission. No await follows this check
  // before the recipient's one authoritative OPEN mutation.
  if (!Number.isSafeInteger(request.deadlineAtMs) || request.deadlineAtMs < 0 ||
      handler.timeSource.now() >= request.deadlineAtMs) return OUTCOME.UNAVAILABLE;
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
  readParticipantReleaseFacts, readParticipantReleaseObservationAssessment,
  replicaGenerationOf as participantReleaseReplicaGenerationOf,
  resumeParticipantCutoverAdmission,
};
