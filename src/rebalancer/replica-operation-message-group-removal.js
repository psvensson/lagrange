/** Source voter removal, pre-promotion target learner removal recording,
 * source-own applied absence exit, and exact-generation source cleanup
 * (FreshMG 6.C slices C3 & C4), subordinate to ReplicaOperationRepository.
 */
import fs from 'node:fs';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE as STAGE} from
  '../raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_ANSWER_KIND} from
  '../raft/raft-committed-membership-constants.js';
import {deriveRaftRsPeerId} from '../raft/raft-rs-peer-identity.js';
import {namesExactLearner} from '../raft/learner-catch-up-acknowledgement.js';
import {readMessageGroupCommittedMembership} from
  '../message-group/message-group-consensus-port.js';
import {SERVICE_STATUS} from '../constants/service-status.js';
import {
  MEMBERSHIP_PHASE as PHASE,
  MEMBERSHIP_PERMIT_STATE as STATE,
  MEMBERSHIP_AUTHORIZATION_OUTCOME as OUTCOME,
  MEMBERSHIP_OBLIGATION,
  decodeMembershipIdentity,
  decodeMembershipPermit,
  decodeMembershipOwnerClaim,
  membershipOwnerClaimFence,
  encodeMembershipPermit,
  membershipActionMatches,
  sourceRemovalActionMatches,
} from './replica-operation-message-group-membership-permit.js';
import {
  observeMembershipOperation,
  membershipRowIdentityMatches,
  membershipClaimIsLocalAndLive,
  membershipBootIsCurrent,
  membershipRowWhere,
} from './replica-operation-message-group-membership-owner-claim.js';
import {
  actionRecordingInput,
  recordMembershipActionOutcome,
  recordingInvocation,
  recordingSettlementAllowed,
  learnerObservationRefusal,
  learnerWitnessUnavailable,
  noteUncertainMembershipWrite,
} from './replica-operation-message-group-membership-authorization.js';
import {canonicalBootIncarnation} from
  './replica-operation-message-group-learner-successor.js';
import {
  recordedVoterFactIsValid,
  recordedStamp,
  sameMembers,
} from './replica-operation-message-group-promotion.js';

const SOURCE_REMOVAL_CAS_SQL =
  'UPDATE replica_operations SET message_group_membership_phase = ?, ' +
  'message_group_membership_permit = ? WHERE';
const REMOVAL_RECEIPT_SET =
  'message_group_membership_phase = ?, message_group_membership_permit = ?, ' +
  'message_group_removal_stamp = ?, ' +
  'message_group_membership_obligation_state = ?, ' +
  'message_group_membership_lane_key = NULL';
// ends-on: source replica's own applied configuration omits its peer ID
const DEFAULT_EXIT_BACKSTOP_MS = 5000;
// ends-on: source replica's own applied configuration omits its peer ID
const DEFAULT_EXIT_POLL_MS = 10;
const INVALID_SOURCE_LIFECYCLE_CLAIM = Object.freeze({valid: false});
const REPLICA_CONSENSUS_EXIT_REASON = Object.freeze({
  REMOVAL_APPLIED: 'own-removal-applied',
  BACKSTOP: 'removal-commit-backstop-elapsed',
});
const SOURCE_RETIREMENT_OUTCOME = Object.freeze({
  RETIRED: 'retired',
  GENERATION_MISMATCH: 'generation_mismatch',
  NOT_REMOVED: 'source_not_removed_by_quorum',
  BACKSTOP_ALARM: 'backstop_alarm',
});
const SQLITE_ARTIFACT_SUFFIXES = Object.freeze(['', '-wal', '-shm']);
const SERVICES_TABLE = 'services';
const SELECT_SERVICE_ROW_SQL = 'SELECT * FROM services WHERE service_id = ?';

const result = (outcome, operation = null, extra = {}) =>
  Object.freeze({outcome, operation, ...extra});
const nonempty = (value) => typeof value === 'string' && value.length > 0;

function removalActionMatches(permit, identity) {
  return sourceRemovalActionMatches(permit, identity) ||
    membershipActionMatches(permit, identity, STAGE.REMOVE);
}

function removalRequest(request) {
  const data = copyStrictOwnDataRecord(request);
  if (!data || !nonempty(data.operationId) ||
      !nonempty(data.destinationNodeId) ||
      !nonempty(data.destinationReplicaId)) {
    return null;
  }
  return Object.freeze({
    operationId: data.operationId,
    destinationNodeId: data.destinationNodeId,
    destinationReplicaId: data.destinationReplicaId,
  });
}

function sourceRemovalSelected(row) {
  const identity = decodeMembershipIdentity(row?.messageGroupMembershipIdentity);
  const permit = decodeMembershipPermit(row?.messageGroupMembershipPermit);
  return identity !== null && permit !== null &&
    (membershipRowIdentityMatches(
      row, identity, row.messageGroupMembershipIdentity) ||
      membershipRowIdentityMatches(
        row, identity, row.messageGroupMembershipIdentity, null)) &&
    [PHASE.SOURCE_REMOVAL_IN_FLIGHT, PHASE.SOURCE_REMOVED].includes(
      row.messageGroupMembershipPhase) &&
    sourceRemovalActionMatches(permit, identity);
}

function recordedVoterBasis(repository, row) {
  const encodedIdentity = row?.messageGroupMembershipIdentity;
  const identity = decodeMembershipIdentity(encodedIdentity);
  if (identity === null ||
      !recordedVoterFactIsValid(row, identity, encodedIdentity) ||
      row.messageGroupMembershipObligationState !==
        MEMBERSHIP_OBLIGATION.UNKNOWN ||
      repository.isOperationTerminal(row) || row.completedAt !== null) {
    return null;
  }
  return Object.freeze({
    identity,
    encodedIdentity,
    prior: decodeMembershipPermit(row.messageGroupMembershipPermit),
    encodedPermit: row.messageGroupMembershipPermit,
    voter: recordedStamp(row.messageGroupVoterStamp),
  });
}

function stampFromObservation(membership) {
  if (!membership || typeof membership !== 'object') return null;
  return recordedStamp(JSON.stringify(membership));
}

function leaderMatchesStamp(status, membership, destinationReplicaId) {
  return status?.role === RAFT_ROLE.LEADER &&
    status.replicaIdentity === destinationReplicaId &&
    membership.leaderId === destinationReplicaId &&
    status.term === membership.term &&
    status.configurationKey === membership.configurationKey &&
    status.membershipGenerationIndex ===
      membership.membershipGenerationIndex &&
    status.currentTermApplied === true;
}

function configurationRetainsPromotedVoters(membership, voter, identity) {
  const sourcePeer = deriveRaftRsPeerId(identity.sourceReplicaId);
  return membership.membershipGenerationIndex >=
      voter.membershipGenerationIndex &&
    membership.term >= voter.term &&
    membership.voters.includes(identity.targetPeerId) &&
    membership.voters.includes(sourcePeer) &&
    sameMembers(membership.voters, voter.voters) &&
    sameMembers(membership.learners, voter.learners);
}

function evaluateHandoffProof(observation, basis, input) {
  if (input.destinationReplicaId === basis.identity.sourceReplicaId ||
      observation?.sourceStatus?.role === RAFT_ROLE.LEADER) {
    return {refusal: OUTCOME.HANDOFF_REQUIRED};
  }
  const membership = stampFromObservation(observation?.membership);
  const status = observation?.status;
  if (membership === null ||
      !leaderMatchesStamp(status, membership, input.destinationReplicaId) ||
      !configurationRetainsPromotedVoters(
        membership, basis.voter, basis.identity)) {
    return {refusal: OUTCOME.HANDOFF_REQUIRED};
  }
  return {proof: Object.freeze({membership, status})};
}

async function observeLeaderHandoff(observeLeader, basis, input) {
  try {
    const observation = await observeLeader(Object.freeze({
      groupId: basis.identity.groupId,
      sourceReplicaId: basis.identity.sourceReplicaId,
      targetReplicaId: basis.identity.targetReplicaId,
      destinationReplicaId: input.destinationReplicaId,
    }));
    return evaluateHandoffProof(observation, basis, input);
  } catch {
    return {refusal: OUTCOME.UNAVAILABLE};
  }
}

function sourceRemovalPermit(repository, basis, claim, proof, destination) {
  const {prior, identity} = basis;
  const {membership, status} = proof;
  return encodeMembershipPermit({
    version: prior.version,
    transitionIdentity: prior.transitionIdentity,
    permitSequence: prior.permitSequence + 1,
    permitStage: STAGE.REMOVE,
    permitState: STATE.IN_FLIGHT,
    workflowOwnerNodeId: claim.ownerNodeId,
    workflowOwnerFence: membershipOwnerClaimFence(claim),
    membershipLeaseExpiresAt: claim.expiresAt,
    proposerNodeId: repository.nodeId,
    proposerBootIncarnation: repository.membershipOwnerBootIncarnation,
    destinationNodeId: destination.nodeId,
    destinationBootIncarnation: destination.bootIncarnation,
    replicaLifecycleIncarnation: status.lifecycleIncarnation,
    runtimeGeneration: status.runtimeGeneration,
    leaderTerm: membership.term,
    leaderConfigurationStamp: {
      configurationKey: membership.configurationKey,
      membershipGenerationIndex: membership.membershipGenerationIndex,
    },
    proposalIndex: null,
    replicaIdentity: identity.sourceReplicaId,
    peerId: deriveRaftRsPeerId(identity.sourceReplicaId),
  });
}

async function submitSourceRemovalSelection(
  repository, row, basis, claim, nextPermit, isCurrent,
) {
  const where = membershipRowWhere(row);
  const submissionIsCurrent = () => isCurrent() &&
    membershipClaimIsLocalAndLive(repository, claim, basis.identity);
  const beforeAttempt = async () => submissionIsCurrent() &&
    await membershipBootIsCurrent(repository);
  try {
    await repository.executeOperationMutationWithRetry(
      `${SOURCE_REMOVAL_CAS_SQL} ${where.where}`,
      [PHASE.SOURCE_REMOVAL_IN_FLIGHT, nextPermit, ...where.params],
      {beforeAttempt, submissionIsCurrent});
  } catch (error) {
    noteUncertainMembershipWrite(repository, basis.identity.operationId, error);
  }
  if (!isCurrent()) return result(OUTCOME.UNKNOWN);
  const after = await observeMembershipOperation(
    repository, basis.identity.operationId);
  if (!after.available) return result(OUTCOME.UNKNOWN);
  return result(
    sourceRemovalSelected(after.row) ? OUTCOME.RECORDED : OUTCOME.UNKNOWN,
    after.row);
}

async function selectSourceRemovalOverHandoff(
  repository, input, basis, proof, isCurrent,
) {
  const bootIncarnation = await canonicalBootIncarnation(
    repository, input.destinationNodeId);
  if (bootIncarnation === null || !await membershipBootIsCurrent(repository) ||
      !isCurrent()) {
    return result(OUTCOME.UNAVAILABLE);
  }
  const current = await observeMembershipOperation(repository, input.operationId);
  if (!current.available || !isCurrent()) return result(OUTCOME.UNAVAILABLE);
  if (sourceRemovalSelected(current.row)) {
    return result(OUTCOME.RECORDED, current.row);
  }
  const latestBasis = recordedVoterBasis(repository, current.row);
  if (!latestBasis ||
      current.row.messageGroupMembershipPermit !== basis.encodedPermit) {
    return result(OUTCOME.CONFLICT, current.row);
  }
  const claim = decodeMembershipOwnerClaim(
    current.row.messageGroupMembershipOwnerClaim);
  if (!membershipClaimIsLocalAndLive(repository, claim, latestBasis.identity)) {
    return result(OUTCOME.STALE_OWNER, current.row);
  }
  const nextPermit = sourceRemovalPermit(repository, latestBasis, claim, proof,
    {nodeId: input.destinationNodeId, bootIncarnation});
  if (nextPermit === null) return result(OUTCOME.INVALID, current.row);
  return submitSourceRemovalSelection(
    repository, current.row, latestBasis, claim, nextPermit, isCurrent);
}

/** Select the source voter removal after a recorded voter stamp when, and only
 * when, a surviving voter other than the source leads with its own term applied
 * in a committed configuration at or past the voter stamp. */
async function selectMessageGroupSourceRemoval(
  repository, request, observeLeader, isInvocationCurrent = () => true,
) {
  const input = removalRequest(request);
  if (!input || typeof observeLeader !== 'function' ||
      typeof isInvocationCurrent !== 'function') {
    return result(OUTCOME.INVALID);
  }
  const isCurrent = recordingInvocation(repository, isInvocationCurrent);
  if (!isCurrent()) return result(OUTCOME.UNAVAILABLE);
  const before = await observeMembershipOperation(repository, input.operationId);
  if (!before.available || !isCurrent()) return result(OUTCOME.UNAVAILABLE);
  if (sourceRemovalSelected(before.row)) {
    return result(OUTCOME.RECORDED, before.row);
  }
  const basis = recordedVoterBasis(repository, before.row);
  if (!basis) return result(OUTCOME.CONFLICT, before.row);
  if (input.destinationReplicaId === basis.identity.sourceReplicaId) {
    return result(OUTCOME.HANDOFF_REQUIRED, before.row);
  }
  const handoff = await observeLeaderHandoff(observeLeader, basis, input);
  if (handoff.refusal) return result(handoff.refusal, before.row);
  return selectSourceRemovalOverHandoff(
    repository, input, basis, handoff.proof, isCurrent);
}

// --- Removal-stamp recording -----------------------------------------------

function isSourceRemovalPermit(permit, identity) {
  return sourceRemovalActionMatches(permit, identity);
}

function committedRemovalPhase(permit, identity) {
  return isSourceRemovalPermit(permit, identity) ?
    PHASE.SOURCE_REMOVED : PHASE.TARGET_REMOVED;
}

function inFlightRemovalPhase(permit, identity) {
  return isSourceRemovalPermit(permit, identity) ?
    PHASE.SOURCE_REMOVAL_IN_FLIGHT : PHASE.TARGET_REMOVAL_IN_FLIGHT;
}

function sourceRemovalStampFollows(stamp, voter, identity, permit) {
  const sourcePeer = deriveRaftRsPeerId(identity.sourceReplicaId);
  return voter !== null &&
    sameMembers(
      stamp.voters, voter.voters.filter((peer) => peer !== sourcePeer)) &&
    stamp.voters.includes(identity.targetPeerId) &&
    sameMembers(stamp.learners, voter.learners) &&
    stamp.membershipGenerationIndex >
      permit.leaderConfigurationStamp.membershipGenerationIndex &&
    stamp.term >= permit.leaderTerm;
}

function targetRemovalStampFollows(stamp, learner, identity, permit) {
  const sourcePeer = deriveRaftRsPeerId(identity.sourceReplicaId);
  return learner !== null && namesExactLearner(learner, identity) &&
    sameMembers(stamp.voters, learner.voters) &&
    stamp.voters.includes(sourcePeer) &&
    sameMembers(
      stamp.learners,
      learner.learners.filter((peer) => peer !== identity.targetPeerId)) &&
    stamp.membershipGenerationIndex >
      permit.leaderConfigurationStamp.membershipGenerationIndex &&
    stamp.term >= permit.leaderTerm;
}

function removalStampFollowsPredecessor(row, stamp, identity, permit) {
  if (isSourceRemovalPermit(permit, identity)) {
    const voter = recordedStamp(row.messageGroupVoterStamp);
    return row.messageGroupVoterStamp === JSON.stringify(voter) &&
      sourceRemovalStampFollows(stamp, voter, identity, permit);
  }
  const learner = recordedStamp(row.messageGroupLearnerStamp);
  return row.messageGroupVoterStamp === null &&
    row.messageGroupLearnerStamp === JSON.stringify(learner) &&
    targetRemovalStampFollows(stamp, learner, identity, permit);
}

function recordedRemovalPermit(row, identity, encodedIdentity) {
  const permit = decodeMembershipPermit(row?.messageGroupMembershipPermit);
  if (permit === null || !removalActionMatches(permit, identity)) return null;
  const expectedPhase = committedRemovalPhase(permit, identity);
  return membershipRowIdentityMatches(row, identity, encodedIdentity, null) &&
    row.messageGroupMembershipPhase === expectedPhase &&
    row.messageGroupMembershipObligationState ===
      MEMBERSHIP_OBLIGATION.SETTLED &&
    row.messageGroupMembershipLaneKey === null &&
    row.messageGroupMembershipPermit === JSON.stringify(permit) ? permit : null;
}

/** The one validity predicate of a recorded removal fact (source voter removal
 * or pre-promotion target learner removal). Pure. */
function recordedRemovalFactIsValid(row, identity, encodedIdentity) {
  const permit = recordedRemovalPermit(row, identity, encodedIdentity);
  const removal = permit === null ?
    null : recordedStamp(row.messageGroupRemovalStamp);
  return removal !== null &&
    row.messageGroupRemovalStamp === JSON.stringify(removal) &&
    removal.membershipGenerationIndex === permit.proposalIndex &&
    removalStampFollowsPredecessor(row, removal, identity, permit);
}

function committedRemovalPermit(input, index) {
  return JSON.stringify({
    ...input.permit,
    permitState: STATE.COMMITTED,
    proposalIndex: index,
  });
}

function exactRecordedRemoval(row, input) {
  const permit = recordedRemovalPermit(
    row, input.identity, input.encodedIdentity);
  return permit !== null &&
    recordedRemovalFactIsValid(row, input.identity, input.encodedIdentity) &&
    row.messageGroupMembershipPermit ===
      committedRemovalPermit(input, permit.proposalIndex);
}

function inFlightRemovalIntent(row, input) {
  const source = isSourceRemovalPermit(input.permit, input.identity);
  return row.messageGroupMembershipPhase ===
      inFlightRemovalPhase(input.permit, input.identity) &&
    row.messageGroupMembershipPermit === input.encodedPermit &&
    row.messageGroupMembershipObligationState ===
      MEMBERSHIP_OBLIGATION.UNKNOWN &&
    row.messageGroupMembershipLaneKey === input.identity.membershipLaneKey &&
    row.messageGroupLearnerStamp !== null &&
    (row.messageGroupVoterStamp !== null) === source &&
    row.messageGroupRemovalStamp === null;
}

function removalRowIdentityMatches(row, input) {
  return membershipRowIdentityMatches(
    row, input.identity, input.encodedIdentity) ||
    membershipRowIdentityMatches(
      row, input.identity, input.encodedIdentity, null);
}

function removalBasisRefusal(repository, row, input) {
  if (!removalRowIdentityMatches(row, input) ||
      row.messageGroupMembershipOwnerClaim !== input.executionClaim ||
      !recordingSettlementAllowed(repository, row)) {
    return OUTCOME.CONFLICT;
  }
  if (!membershipClaimIsLocalAndLive(repository, input.claim, input.identity)) {
    return OUTCOME.STALE_OWNER;
  }
  if (input.permit.permitState === STATE.COMMITTED) {
    return exactRecordedRemoval(row, input) ? null : OUTCOME.CONFLICT;
  }
  return inFlightRemovalIntent(row, input) || exactRecordedRemoval(row, input) ?
    null : OUTCOME.CONFLICT;
}

function removalOutcomeEvidence(observed, input, _query, row) {
  const refusal = learnerObservationRefusal(observed, input.permit);
  if (refusal !== null) return {refusal};
  if (learnerWitnessUnavailable(observed.membership)) {
    return {refusal: OUTCOME.UNAVAILABLE};
  }
  const stamp = stampFromObservation(observed.membership);
  if (stamp === null ||
      stamp.appliedIndex !== observed.observedAppliedIndex ||
      !removalStampFollowsPredecessor(
        row, stamp, input.identity, input.permit)) {
    return {refusal: OUTCOME.CONFLICT};
  }
  return {
    phase: committedRemovalPhase(input.permit, input.identity),
    committedPermit: committedRemovalPermit(
      input, stamp.membershipGenerationIndex),
    stamp: JSON.stringify(stamp),
  };
}

const REMOVAL_RECORDING = Object.freeze({
  basisRefusal: removalBasisRefusal,
  recorded: exactRecordedRemoval,
  evidence: removalOutcomeEvidence,
  receipt: (evidence) => ({
    set: REMOVAL_RECEIPT_SET,
    params: [
      evidence.phase,
      evidence.committedPermit,
      evidence.stamp,
      MEMBERSHIP_OBLIGATION.SETTLED,
    ],
  }),
  readback: (repository, row, input, evidence) =>
    removalBasisRefusal(repository, row, input) === null &&
    row.messageGroupRemovalStamp === evidence.stamp &&
    row.messageGroupMembershipObligationState ===
      MEMBERSHIP_OBLIGATION.SETTLED &&
    row.messageGroupMembershipLaneKey === null,
});

/** Record the exact committed outcome of an issued removal (source voter
 * removal or pre-promotion target learner removal) and release the group's
 * membership lane atomically. */
function recordMessageGroupRemovalOutcome(
  repository, request, readCommittedAction, isInvocationCurrent,
) {
  const input = actionRecordingInput(request, removalActionMatches);
  if (!input || typeof readCommittedAction !== 'function' ||
      (isInvocationCurrent !== undefined &&
        typeof isInvocationCurrent !== 'function')) {
    return Promise.resolve(result(OUTCOME.INVALID));
  }
  return recordMembershipActionOutcome(
    repository, input, REMOVAL_RECORDING, readCommittedAction,
    recordingInvocation(repository, isInvocationCurrent));
}

/** Recover a removal outcome by operation ID from the authoritative row. */
async function recoverMessageGroupRemovalOutcome(
  repository, operationId, readCommittedAction, isInvocationCurrent,
) {
  if (!nonempty(operationId)) return result(OUTCOME.INVALID);
  const observed = await observeMembershipOperation(repository, operationId);
  if (!observed.available) return result(OUTCOME.UNAVAILABLE);
  if (!observed.row) return result(OUTCOME.CONFLICT);
  return recordMessageGroupRemovalOutcome(repository, {
    operationId,
    identity: observed.row.messageGroupMembershipIdentity,
    permit: observed.row.messageGroupMembershipPermit,
    executionClaim: observed.row.messageGroupMembershipOwnerClaim,
  }, readCommittedAction, isInvocationCurrent);
}

// --- Source-own applied absence & exact-generation cleanup -----------------

function sourceAppliedOwnAbsence(service, replicaId) {
  const answer = readMessageGroupCommittedMembership(service);
  const peerId = deriveRaftRsPeerId(replicaId);
  if (answer?.kind !== COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED ||
      answer.gateOpen !== true) {
    return null;
  }
  return !answer.voters.includes(peerId) && !answer.learners.includes(peerId) ?
    answer : null;
}

/** Wait until the source replica's own applied configuration omits its peer ID
 * (REMOVAL_APPLIED), or return BACKSTOP when the backstop elapses. */
async function awaitMessageGroupSourceConsensusExit(
  service,
  {
    replicaId = service?.replicaId,
    backstopMs = DEFAULT_EXIT_BACKSTOP_MS,
    pollMs = DEFAULT_EXIT_POLL_MS,
  } = {},
) {
  const immediate = sourceAppliedOwnAbsence(service, replicaId);
  if (immediate !== null) {
    return Object.freeze({
      exit: REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED,
      membership: immediate,
    });
  }
  const deadline = Date.now() + Math.max(0, backstopMs);
  while (Date.now() < deadline) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(pollMs, Math.max(1, deadline - Date.now()))));
    const observed = sourceAppliedOwnAbsence(service, replicaId);
    if (observed !== null) {
      return Object.freeze({
        exit: REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED,
        membership: observed,
      });
    }
  }
  const finalCheck = sourceAppliedOwnAbsence(service, replicaId);
  return finalCheck !== null ?
    Object.freeze({
      exit: REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED,
      membership: finalCheck,
    }) :
    Object.freeze({
      exit: REPLICA_CONSENSUS_EXIT_REASON.BACKSTOP,
      membership: null,
    });
}

function decodeSourceLifecycleClaim(encoded) {
  try {
    const parsed = JSON.parse(encoded);
    if (!parsed || typeof parsed !== 'object' ||
        !nonempty(parsed.replicaId) ||
        !Number.isSafeInteger(parsed.createdAt) ||
        !nonempty(parsed.createAttemptToken)) {
      return INVALID_SOURCE_LIFECYCLE_CLAIM;
    }
    return Object.freeze(parsed);
  } catch {
    return INVALID_SOURCE_LIFECYCLE_CLAIM;
  }
}

function removeSqliteArtifacts(dbPath) {
  if (!nonempty(dbPath)) return false;
  let removed = false;
  for (const suffix of SQLITE_ARTIFACT_SUFFIXES) {
    const target = `${dbPath}${suffix}`;
    if (fs.existsSync(target)) {
      fs.rmSync(target, {force: true});
      removed = true;
    }
  }
  return removed;
}

function sourceGenerationMatchesRow(liveRow, claim) {
  if (!liveRow) return true;
  return liveRow.created_at === claim.createdAt &&
    liveRow.create_attempt_token === claim.createAttemptToken;
}

async function readLiveSourceServiceRow(serviceRowOwner, replicaId) {
  const writer = serviceRowOwner?.systemTableWriter;
  if (!writer) return null;
  if (typeof writer.readAuthoritativeRows === 'function') {
    const result = await writer.readAuthoritativeRows(
      SERVICES_TABLE, SELECT_SERVICE_ROW_SQL, [replicaId]);
    return result?.rows?.[0] ?? null;
  }
  return null;
}

async function executeSourceRetirementCleanup({
  serviceRowOwner,
  sourceService,
  shutdownSource,
  identity,
  claim,
  liveRow,
  dbPath,
}) {
  let stoppedRow = null;
  if (serviceRowOwner && liveRow) {
    try {
      stoppedRow = await serviceRowOwner.updateReplicaStatus({
        groupId: identity.groupId,
        replicaId: identity.sourceReplicaId,
        nodeId: identity.sourceNodeId,
        status: SERVICE_STATUS.STOPPED,
        registrationEvidence: liveRow,
      });
    } catch {
      return Object.freeze({
        outcome: SOURCE_RETIREMENT_OUTCOME.GENERATION_MISMATCH,
        stopped: false,
        deleted: false,
      });
    }
    if (!sourceGenerationMatchesRow(stoppedRow, claim)) {
      return Object.freeze({
        outcome: SOURCE_RETIREMENT_OUTCOME.GENERATION_MISMATCH,
        stopped: false,
        deleted: false,
      });
    }
  }
  if (typeof shutdownSource === 'function') {
    await shutdownSource();
  } else if (typeof sourceService?.shutdown === 'function') {
    await sourceService.shutdown();
  }
  let rowDeleted = true;
  if (serviceRowOwner && stoppedRow) {
    rowDeleted = await serviceRowOwner.removeReplica({
      replicaId: identity.sourceReplicaId,
      stoppedRow,
    });
  }
  const filesRemoved = removeSqliteArtifacts(dbPath);
  return Object.freeze({
    outcome: SOURCE_RETIREMENT_OUTCOME.RETIRED,
    exit: REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED,
    stopped: true,
    deleted: rowDeleted === true,
    filesRemoved,
  });
}

async function observedRemovedSourceBasis(repository, operationId) {
  const observed = await observeMembershipOperation(repository, operationId);
  const row = observed?.row;
  const identity = decodeMembershipIdentity(row?.messageGroupMembershipIdentity);
  const claim = decodeSourceLifecycleClaim(row?.messageGroupSourceLifecycleClaim);
  if (!row || !identity || claim === INVALID_SOURCE_LIFECYCLE_CLAIM ||
      row.messageGroupMembershipPhase !== PHASE.SOURCE_REMOVED ||
      !recordedRemovalFactIsValid(
        row, identity, row.messageGroupMembershipIdentity)) {
    return null;
  }
  return {identity, claim};
}

/** Retire a removed message-group source replica only after quorum removal is
 * recorded on the operation row AND the source replica's own applied
 * configuration omits it, enforcing exact lifecycle-generation cleanup. */
async function retireRemovedMessageGroupSourceReplica({
  repository,
  operationId,
  sourceService,
  shutdownSource,
  serviceRowOwner = null,
  dbPath = null,
  backstopMs = DEFAULT_EXIT_BACKSTOP_MS,
  pollMs = DEFAULT_EXIT_POLL_MS,
} = {}) {
  const basis = await observedRemovedSourceBasis(repository, operationId);
  if (!basis) {
    return Object.freeze({
      outcome: SOURCE_RETIREMENT_OUTCOME.NOT_REMOVED,
      stopped: false,
      deleted: false,
    });
  }
  const {identity, claim} = basis;
  const liveRow = await readLiveSourceServiceRow(
    serviceRowOwner, identity.sourceReplicaId);
  if (!sourceGenerationMatchesRow(liveRow, claim)) {
    return Object.freeze({
      outcome: SOURCE_RETIREMENT_OUTCOME.GENERATION_MISMATCH,
      stopped: false,
      deleted: false,
    });
  }
  const exitResult = await awaitMessageGroupSourceConsensusExit(sourceService, {
    replicaId: identity.sourceReplicaId,
    backstopMs,
    pollMs,
  });
  if (exitResult.exit !== REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED) {
    return Object.freeze({
      outcome: SOURCE_RETIREMENT_OUTCOME.BACKSTOP_ALARM,
      exit: exitResult.exit,
      stopped: false,
      deleted: false,
    });
  }
  const latestRow = await readLiveSourceServiceRow(
    serviceRowOwner, identity.sourceReplicaId);
  if (!sourceGenerationMatchesRow(latestRow, claim)) {
    return Object.freeze({
      outcome: SOURCE_RETIREMENT_OUTCOME.GENERATION_MISMATCH,
      stopped: false,
      deleted: false,
    });
  }
  return executeSourceRetirementCleanup({
    serviceRowOwner,
    sourceService,
    shutdownSource,
    identity,
    claim,
    liveRow: latestRow,
    dbPath,
  });
}

export {
  selectMessageGroupSourceRemoval,
  recordMessageGroupRemovalOutcome,
  recoverMessageGroupRemovalOutcome,
  recordedRemovalFactIsValid,
  awaitMessageGroupSourceConsensusExit,
  retireRemovedMessageGroupSourceReplica,
};
