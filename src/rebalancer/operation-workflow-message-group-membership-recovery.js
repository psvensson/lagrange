/** Owned discovery and reentry for message-group membership debt.
 *
 * One algorithm, three legitimate triggers: the restart scan (handleRecovery,
 * authoritative census), the periodic timeout/orphan sweep (replicated-cache
 * hint census: no round trip while nothing owes), and the replicated-row
 * observer. Each turn re-reads the authoritative row, holds the operation lane
 * for one turn, keeps or adopts the membership claim through the repository's
 * existing claim CAS only while an initial learner action is still unrecorded,
 * selects an explicitly HOSTED witness from the service census (never the
 * target the operation has not created; rotating past an unreachable one),
 * and asks the existing recorder to recover the exact learner outcome by
 * operation ID. RECORDED is a historical fact: no CREATE, promotion, removal,
 * cleanup, successor attempt or lane release follows from here. Unresolved
 * outcomes keep the debt and name the trigger that reconsiders them.
 */
import {SERVICE_TYPE} from '../constants/service.js';
import {SERVICE_STATUS} from '../constants/service-status.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE} from '../raft/raft-operation-port-constants.js';
import {MEMBERSHIP_PHASE as PHASE, MEMBERSHIP_OBLIGATION, MEMBERSHIP_PERMIT_STATE,
  MEMBERSHIP_AUTHORIZATION_OUTCOME as RECORDER, MEMBERSHIP_DEBT_RECOVERY_OUTCOME as DEBT,
  decodeMembershipIdentity, decodeMembershipPermit, decodeMembershipOwnerClaim,
  messageGroupMembershipLaneKey} from './replica-operation-message-group-membership-permit.js';
import {observeMembershipOperation} from
  './replica-operation-message-group-membership-owner-claim.js';
import {operationCarriesMessageGroupMembership} from
  './replica-operation-message-group-membership-fields.js';
import {REBALANCE_COORDINATOR_LOG_MSG as LOG} from './rebalancer-constants.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {recoverMessageGroupLearnerInline} from
  './operation-workflow-message-group-native-read.js';

const {OPERATION_WORKFLOW_OWNER_LITERAL} = OPERATION_WORKFLOW_OWNER_SHARED;
const CLAIM_HELD = 'held';
const INITIAL_LEARNER_PHASES = Object.freeze(new Set([
  PHASE.LEARNER_IN_FLIGHT, PHASE.LEARNER_COMMITTED]));
const RETAINED_RECORDER_OUTCOMES = Object.freeze(new Set([
  RECORDER.UNKNOWN, RECORDER.UNAVAILABLE, RECORDER.STALE_OWNER]));
const REFUSED_OUTCOMES = Object.freeze(new Set([
  DEBT.INVALID_ROW, DEBT.INVALID_INPUT, DEBT.CONFLICT]));
const WAKE = Object.freeze({
  HOSTED_WITNESS: 'an active services row of another replica of the group',
  NEXT_TRIGGER: 'the next restart scan, periodic sweep or replicated-row change',
  CLAIM_EXPIRY: 'expiry of the live holder claim',
});
/** Row fields a refusal names; the operation row owner spells them. */
const DEBT_ROW_FIELD = Object.freeze({
  DEBT: 'messageGroupMembershipObligationState',
  IDENTITY: 'messageGroupMembershipIdentity',
  CLAIM: 'messageGroupMembershipOwnerClaim',
});
/** The census a trigger starts from: the authoritative read (restart scan) or
 * the replicated cache as a hint (periodic sweep). Every candidate is re-read
 * authoritatively before anything is decided. */
const DEBT_CENSUS = Object.freeze({AUTHORITATIVE: 'authoritative', CACHE_HINT: 'cache_hint'});
const answer = (outcome, detail = {}) => Object.freeze({outcome, ...detail});

function hostedWitnessRows(repository, identity) {
  const rows = repository.getEntityServiceRows({partitionId: identity.groupId,
    entityType: SERVICE_TYPE.MESSAGE_GROUP, entityId: identity.groupId});
  return rows.filter((row) => row?.status === SERVICE_STATUS.ACTIVE &&
    typeof row.node_id === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
    typeof row.replica_id === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
    row.replica_id !== identity.targetReplicaId);
}
function witnessRotation(owner) {
  if (!(owner.membershipDebtWitnessRotation instanceof Map)) {
    owner.membershipDebtWitnessRotation = new Map();
  }
  return owner.membershipDebtWitnessRotation;
}
/** Hosted replicas of the group, the source first, then the rest in a stable
 * order; the turn's rotation index skips past a witness that did not answer.
 * The census is a route hint; the native answer at the witness is the evidence. */
function selectHostedMessageGroupWitness(owner, identity) {
  const hosted = hostedWitnessRows(owner.repository, identity);
  const isSource = (row) => row.replica_id === identity.sourceReplicaId &&
    row.node_id === identity.sourceNodeId;
  const ordered = [...hosted.filter(isSource),
    ...hosted.filter((row) => !isSource(row))
      .sort((a, b) => a.replica_id.localeCompare(b.replica_id))];
  if (ordered.length === 0) return null;
  const turn = witnessRotation(owner).get(identity.operationId) || 0;
  const chosen = ordered[turn % ordered.length];
  return Object.freeze({nodeId: chosen.node_id, replicaId: chosen.replica_id});
}
function carriesMembershipDebt(operation) {
  return operationCarriesMessageGroupMembership(operation) &&
    operation.entityType === SERVICE_TYPE.MESSAGE_GROUP &&
    operation.messageGroupMembershipObligationState === MEMBERSHIP_OBLIGATION.UNKNOWN;
}
// This owner recovers the initial learner action only; promotion and removal
// debt keep their later owners and are reported, not touched.
function initialLearnerPermit(operation) {
  const permit = decodeMembershipPermit(operation.messageGroupMembershipPermit);
  return permit !== null &&
    permit.permitStage === RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER &&
    permit.permitSequence === 1 &&
    INITIAL_LEARNER_PHASES.has(operation.messageGroupMembershipPhase) ? permit : null;
}
// An initial action whose exact outcome is already durable owes this owner
// nothing more: no claim is touched and no witness is asked.
function learnerOutcomeSettled(operation, permit) {
  return operation.messageGroupMembershipPhase === PHASE.LEARNER_COMMITTED &&
    permit.permitState === MEMBERSHIP_PERMIT_STATE.COMMITTED &&
    operation.messageGroupLearnerStamp !== null;
}
function claimIsLive(repository, claim) {
  return claim.expiresAt > repository.timeSource.now();
}
function claimIsLocal(repository, claim) {
  return claim.ownerNodeId === repository.nodeId &&
    claim.ownerBootIncarnation === repository.membershipOwnerBootIncarnation;
}
/** Keep a live local claim, wait on a live foreign one, adopt an expired one
 * through the existing claim CAS. Adoption is holder replacement, never a
 * grant for any successor action. */
async function holdMembershipClaim(repository, operation, identity) {
  const encoded = operation.messageGroupMembershipOwnerClaim;
  const claim = decodeMembershipOwnerClaim(encoded);
  if (!claim) return answer(DEBT.INVALID_ROW, {field: DEBT_ROW_FIELD.CLAIM});
  if (claimIsLive(repository, claim)) {
    return claimIsLocal(repository, claim) ? answer(CLAIM_HELD) :
      answer(DEBT.HELD_ELSEWHERE, {holder: claim.ownerNodeId, wake: WAKE.CLAIM_EXPIRY});
  }
  const adopted = await repository.claimMessageGroupMembershipOwner({
    operationId: identity.operationId, identity: operation.messageGroupMembershipIdentity,
    expectedClaim: encoded});
  return adopted.outcome === RECORDER.RECORDED ? answer(CLAIM_HELD) :
    answer(DEBT.CLAIM_REFUSED, {claim: adopted.outcome, wake: WAKE.NEXT_TRIGGER});
}
function classifyRecorderAnswer(owner, operationId, recovered, witness) {
  const rotation = witnessRotation(owner);
  if (recovered.outcome === RECORDER.RECORDED) {
    rotation.delete(operationId);
    return answer(DEBT.RECORDED, {witness});
  }
  if (recovered.outcome === RECORDER.INVALID) {
    return answer(DEBT.INVALID_INPUT, {witness, recorder: recovered.outcome});
  }
  if (RETAINED_RECORDER_OUTCOMES.has(recovered.outcome)) {
    if (recovered.outcome === RECORDER.UNAVAILABLE) {
      rotation.set(operationId, (rotation.get(operationId) || 0) + 1);
    }
    return answer(DEBT.RETAINED, {witness, recorder: recovered.outcome, wake: WAKE.NEXT_TRIGGER});
  }
  return answer(DEBT.CONFLICT, {witness, recorder: recovered.outcome});
}
/** One reconciliation turn on the authoritative row. The caller MUST hold this
 * operation's lane and pass its lane turn; the inline recorder refuses otherwise. */
async function recoverMessageGroupMembershipDebtInline(owner, operation, laneTurn) {
  const repository = owner.repository;
  if (!carriesMembershipDebt(operation)) {
    return answer(DEBT.INVALID_ROW, {field: DEBT_ROW_FIELD.DEBT});
  }
  const identity = decodeMembershipIdentity(operation.messageGroupMembershipIdentity);
  if (!identity || identity.operationId !== operation.operationId) {
    return answer(DEBT.INVALID_ROW, {field: DEBT_ROW_FIELD.IDENTITY});
  }
  const permit = initialLearnerPermit(operation);
  if (!permit) return answer(DEBT.PHASE_NOT_OWNED, {phase: operation.messageGroupMembershipPhase});
  if (learnerOutcomeSettled(operation, permit)) return answer(DEBT.RECORDED, {settled: true});
  if (owner.isShuttingDown) return answer(DEBT.NOT_CURRENT);
  const held = await holdMembershipClaim(repository, operation, identity);
  if (held.outcome !== CLAIM_HELD) return held;
  const witness = selectHostedMessageGroupWitness(owner, identity);
  if (!witness) return answer(DEBT.NO_HOSTED_WITNESS, {wake: WAKE.HOSTED_WITNESS});
  const recovered = await recoverMessageGroupLearnerInline(
    owner, operation.operationId, witness, laneTurn);
  return classifyRecorderAnswer(owner, operation.operationId, recovered, witness);
}
/** Take the operation lane for one turn. A turn already in flight for this
 * operation is not inherited: the debt stays and the next trigger retries. */
async function recoverMessageGroupMembershipDebtOperation(owner, operation) {
  let ran = false;
  const result = await owner.operationWorkflowRunExclusive(
    owner.getOperationOwnerSingleFlightKey(operation.operationId), (laneTurn) => {
      ran = true;
      return recoverMessageGroupMembershipDebtInline(owner, operation, laneTurn);
    });
  return ran ? result : answer(DEBT.LANE_BUSY, {wake: WAKE.NEXT_TRIGGER});
}
function logDebtOutcome(owner, operation, result) {
  const event = {nodeId: owner.nodeId, operationId: operation.operationId,
    groupId: operation.entityId, ...result};
  if (result.outcome === DEBT.RECORDED && result.settled !== true) {
    owner.logger.info(LOG.MEMBERSHIP_DEBT_RECORDED, event);
  } else if (REFUSED_OUTCOMES.has(result.outcome)) {
    owner.logger.warn(LOG.MEMBERSHIP_DEBT_REFUSED, event);
  } else if (result.outcome !== DEBT.RECORDED) {
    owner.logger.debug(LOG.MEMBERSHIP_DEBT_RETAINED, event);
  }
}
async function recoverAndLog(owner, operation) {
  const result = await recoverMessageGroupMembershipDebtOperation(owner, operation);
  logDebtOutcome(owner, operation, result);
  return result;
}
// The replicated cache as a hint of which operations may owe debt: no round
// trip, and the turn re-reads every candidate's row authoritatively.
function cacheHintCandidateIds(repository) {
  const rows = repository.filterReplicaOperationRowsFromCache((row) =>
    row?.entity_type === SERVICE_TYPE.MESSAGE_GROUP &&
    row.message_group_membership_obligation_state === MEMBERSHIP_OBLIGATION.UNKNOWN) || [];
  return {available: true, ids: rows.map((row) => row.operation_id)
    .filter((id) => typeof id === OPERATION_WORKFLOW_OWNER_LITERAL.STRING)};
}
// The authoritative census; an unreadable census is reported, never guessed.
async function authoritativeCandidateIds(repository) {
  const result = await repository.queryAuthoritativeMessageGroupMembershipDebtOperations();
  return {available: result.available,
    ids: result.operations.map((operation) => operation.operationId)};
}
function censusReadsCache(repository, census) {
  return census === DEBT_CENSUS.CACHE_HINT &&
    repository.hasReplicaOperationCacheObservationBoundary();
}
function tally(summary, result) {
  if (result.outcome === DEBT.RECORDED && result.settled === true) {
    summary.settled += 1;
  } else if (result.outcome === DEBT.RECORDED) {
    summary.recorded += 1;
  } else if (REFUSED_OUTCOMES.has(result.outcome)) {
    summary.refused += 1;
  } else {
    summary.retained += 1;
  }
}
async function recoverDebtRow(owner, observed) {
  const operation = observed?.available ? observed.row : null;
  return operation && carriesMembershipDebt(operation) ? recoverAndLog(owner, operation) : null;
}
/** Restart-scan (authoritative) or periodic-sweep (cache hint) entry: census
 * every operation still owing a membership obligation, one lane turn each. */
async function reconcileMessageGroupMembershipDebt(owner, census = DEBT_CENSUS.CACHE_HINT) {
  const summary = {available: false, found: 0, recorded: 0, settled: 0, retained: 0, refused: 0};
  if (owner.isShuttingDown) return Object.freeze(summary);
  const candidates = censusReadsCache(owner.repository, census) ?
    cacheHintCandidateIds(owner.repository) :
    await authoritativeCandidateIds(owner.repository);
  if (!candidates.available) {
    owner.logger.warn(LOG.MEMBERSHIP_DEBT_SWEEP_UNAVAILABLE, {nodeId: owner.nodeId, census});
    return Object.freeze(summary);
  }
  summary.available = true;
  for (const operationId of candidates.ids) {
    const result = await recoverDebtRow(owner,
      await observeMembershipOperation(owner.repository, operationId));
    if (result === null) continue;
    summary.found += 1;
    tally(summary, result);
  }
  return Object.freeze(summary);
}
/** The replicated row is a route hint only: it names which operation or lane to
 * re-read. It decides nothing; the authoritative row read below does. */
function debtWakeRoute(tableName, cacheOperation, record) {
  if (!record || cacheOperation === OPERATION_WORKFLOW_OWNER_LITERAL.DELETE) return null;
  if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
    record.entity_type === SERVICE_TYPE.MESSAGE_GROUP &&
    record.message_group_membership_obligation_state === MEMBERSHIP_OBLIGATION.UNKNOWN &&
    typeof record.operation_id === OPERATION_WORKFLOW_OWNER_LITERAL.STRING) {
    return Object.freeze({operationId: record.operation_id});
  }
  if (tableName === SYSTEM_TABLE_NAME.SERVICES &&
    record.service_type === SERVICE_TYPE.MESSAGE_GROUP &&
    record.status === SERVICE_STATUS.ACTIVE &&
    typeof record.group_id === OPERATION_WORKFLOW_OWNER_LITERAL.STRING) {
    return Object.freeze({laneKey: messageGroupMembershipLaneKey(record.group_id)});
  }
  return null;
}
async function observeDebtWakeRoute(repository, route) {
  if (route.operationId) return observeMembershipOperation(repository, route.operationId);
  const holder = await repository.queryAuthoritativeOperationByMessageGroupMembershipLane(
    route.laneKey);
  return {available: holder !== null, row: holder};
}
/** Replicated-row wake: an operation row still owing debt, or a hosted replica
 * of a group whose lane holder owes debt, re-enters the same algorithm. */
async function wakeMessageGroupMembershipDebtForRow(owner, tableName, cacheOperation, record) {
  const route = owner.isShuttingDown ? null : debtWakeRoute(tableName, cacheOperation, record);
  if (!route) return null;
  return recoverDebtRow(owner, await observeDebtWakeRoute(owner.repository, route));
}
export {DEBT_CENSUS, reconcileMessageGroupMembershipDebt, wakeMessageGroupMembershipDebtForRow};
