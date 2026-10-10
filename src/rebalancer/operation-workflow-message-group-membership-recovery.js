/** Owned discovery and reentry for message-group membership debt.
 *
 * One algorithm, three legitimate triggers: the restart scan (handleRecovery),
 * the periodic timeout/orphan sweep, and the replicated-row observer. Each
 * finds operations that still owe a serialized membership obligation, holds
 * the operation lane, keeps or adopts the membership claim through the
 * repository's existing claim CAS, selects an explicitly HOSTED witness from
 * the service census (never the target the operation has not created), and
 * asks the existing recorder to recover the exact learner outcome by operation
 * ID. RECORDED is a historical fact: no CREATE, promotion, removal, cleanup,
 * successor attempt or lane release follows from here. Unresolved outcomes
 * keep the debt and name the trigger that reconsiders them.
 */
import {SERVICE_TYPE} from '../constants/service.js';
import {SERVICE_STATUS} from '../constants/service-status.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE} from '../raft/raft-operation-port-constants.js';
import {MEMBERSHIP_PHASE as PHASE, MEMBERSHIP_OBLIGATION,
  MEMBERSHIP_AUTHORIZATION_OUTCOME as RECORDER, decodeMembershipIdentity,
  decodeMembershipPermit, decodeMembershipOwnerClaim, messageGroupMembershipLaneKey} from
  './replica-operation-message-group-membership-permit.js';
import {observeMembershipOperation} from
  './replica-operation-message-group-membership-owner-claim.js';
import {operationCarriesMessageGroupMembership} from
  './replica-operation-message-group-membership-fields.js';
import {REBALANCE_COORDINATOR_LOG_MSG as LOG} from './rebalancer-constants.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {recoverMessageGroupLearnerInline} from
  './operation-workflow-message-group-native-read.js';

const {OPERATION_WORKFLOW_OWNER_LITERAL} = OPERATION_WORKFLOW_OWNER_SHARED;
/** Typed outcomes of one debt reconciliation turn. Only RECORDED means the
 * exact learner outcome is durable; every other state keeps the debt. */
const MEMBERSHIP_DEBT_RECOVERY_OUTCOME = Object.freeze({
  RECORDED: 'recorded',
  RETAINED: 'retained',
  NO_HOSTED_WITNESS: 'no_hosted_witness',
  HELD_ELSEWHERE: 'held_elsewhere',
  CLAIM_REFUSED: 'claim_refused',
  PHASE_NOT_OWNED: 'phase_not_owned',
  INVALID_ROW: 'invalid_row',
  CONFLICT: 'conflict',
  NOT_CURRENT: 'not_current',
  LANE_BUSY: 'lane_busy',
});
const DEBT = MEMBERSHIP_DEBT_RECOVERY_OUTCOME;
const CLAIM_HELD = 'held';
const INITIAL_LEARNER_PHASES = Object.freeze(new Set([
  PHASE.LEARNER_IN_FLIGHT, PHASE.LEARNER_COMMITTED]));
const RETAINED_RECORDER_OUTCOMES = Object.freeze(new Set([
  RECORDER.UNKNOWN, RECORDER.UNAVAILABLE, RECORDER.STALE_OWNER]));
const REFUSED_OUTCOMES = Object.freeze(new Set([DEBT.INVALID_ROW, DEBT.CONFLICT]));
const WAKE = Object.freeze({
  HOSTED_WITNESS: 'an active services row of another replica of the group',
  NEXT_TRIGGER: 'the next restart scan, periodic sweep or replicated-row change',
  CLAIM_EXPIRY: 'expiry of the live holder claim',
});
const answer = (outcome, detail = {}) => Object.freeze({outcome, ...detail});
/** Row fields a refusal names; the operation row owner spells them. */
const DEBT_ROW_FIELD = Object.freeze({
  DEBT: 'messageGroupMembershipObligationState',
  IDENTITY: 'messageGroupMembershipIdentity',
  CLAIM: 'messageGroupMembershipOwnerClaim',
});

function hostedWitnessRows(repository, identity) {
  const rows = repository.getEntityServiceRows({partitionId: identity.groupId,
    entityType: SERVICE_TYPE.MESSAGE_GROUP, entityId: identity.groupId});
  return rows.filter((row) => row?.status === SERVICE_STATUS.ACTIVE &&
    typeof row.node_id === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
    typeof row.replica_id === OPERATION_WORKFLOW_OWNER_LITERAL.STRING &&
    row.replica_id !== identity.targetReplicaId);
}
/** An explicitly hosted replica of the group, preferring the source. The
 * census is a route hint; the native answer at the witness is the evidence. */
function selectHostedMessageGroupWitness(repository, identity) {
  const hosted = hostedWitnessRows(repository, identity);
  const source = hosted.find((row) => row.replica_id === identity.sourceReplicaId &&
    row.node_id === identity.sourceNodeId);
  const chosen = source ||
    [...hosted].sort((a, b) => a.replica_id.localeCompare(b.replica_id))[0];
  return chosen ? Object.freeze({nodeId: chosen.node_id, replicaId: chosen.replica_id}) : null;
}
function carriesMembershipDebt(operation) {
  return operationCarriesMessageGroupMembership(operation) &&
    operation.entityType === SERVICE_TYPE.MESSAGE_GROUP &&
    operation.messageGroupMembershipObligationState === MEMBERSHIP_OBLIGATION.UNKNOWN;
}
// This owner recovers the initial learner action only; promotion and removal
// debt keep their later owners and are reported, not touched.
function initialLearnerDebtPhase(operation) {
  const permit = decodeMembershipPermit(operation.messageGroupMembershipPermit);
  return permit !== null &&
    permit.permitStage === RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER &&
    permit.permitSequence === 1 &&
    INITIAL_LEARNER_PHASES.has(operation.messageGroupMembershipPhase);
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
function classifyRecorderAnswer(recovered, witness) {
  if (recovered.outcome === RECORDER.RECORDED) return answer(DEBT.RECORDED, {witness});
  if (RETAINED_RECORDER_OUTCOMES.has(recovered.outcome)) {
    return answer(DEBT.RETAINED, {witness, recorder: recovered.outcome, wake: WAKE.NEXT_TRIGGER});
  }
  return answer(DEBT.CONFLICT, {witness, recorder: recovered.outcome});
}
/** One reconciliation turn. The caller MUST already hold this operation's
 * lane; the inline recorder refuses otherwise instead of deadlocking. */
async function recoverMessageGroupMembershipDebtInline(owner, operation) {
  const repository = owner.repository;
  if (!carriesMembershipDebt(operation)) {
    return answer(DEBT.INVALID_ROW, {field: DEBT_ROW_FIELD.DEBT});
  }
  const identity = decodeMembershipIdentity(operation.messageGroupMembershipIdentity);
  if (!identity || identity.operationId !== operation.operationId) {
    return answer(DEBT.INVALID_ROW, {field: DEBT_ROW_FIELD.IDENTITY});
  }
  if (!initialLearnerDebtPhase(operation)) {
    return answer(DEBT.PHASE_NOT_OWNED, {phase: operation.messageGroupMembershipPhase});
  }
  if (owner.isShuttingDown) return answer(DEBT.NOT_CURRENT);
  const held = await holdMembershipClaim(repository, operation, identity);
  if (held.outcome !== CLAIM_HELD) return held;
  const witness = selectHostedMessageGroupWitness(repository, identity);
  if (!witness) return answer(DEBT.NO_HOSTED_WITNESS, {wake: WAKE.HOSTED_WITNESS});
  return classifyRecorderAnswer(
    await recoverMessageGroupLearnerInline(owner, operation.operationId, witness), witness);
}
/** Take the operation lane for one turn. A turn already in flight for this
 * operation is not inherited: the debt stays and the next trigger retries. */
async function recoverMessageGroupMembershipDebtOperation(owner, operation) {
  let ran = false;
  const result = await owner.operationWorkflowRunExclusive(
    owner.getOperationOwnerSingleFlightKey(operation.operationId), () => {
      ran = true;
      return recoverMessageGroupMembershipDebtInline(owner, operation);
    });
  return ran ? result : answer(DEBT.LANE_BUSY, {wake: WAKE.NEXT_TRIGGER});
}
function logDebtOutcome(owner, operation, result) {
  const event = {nodeId: owner.nodeId, operationId: operation.operationId,
    groupId: operation.entityId, ...result};
  if (result.outcome === DEBT.RECORDED) {
    owner.logger.info(LOG.MEMBERSHIP_DEBT_RECORDED, event);
  } else if (REFUSED_OUTCOMES.has(result.outcome)) {
    owner.logger.warn(LOG.MEMBERSHIP_DEBT_REFUSED, event);
  } else {
    owner.logger.debug(LOG.MEMBERSHIP_DEBT_RETAINED, event);
  }
}
async function recoverAndLog(owner, operation) {
  const result = await recoverMessageGroupMembershipDebtOperation(owner, operation);
  logDebtOutcome(owner, operation, result);
  return result;
}
/** Restart-scan / periodic-sweep entry: census every debt row, one lane turn each. */
async function reconcileMessageGroupMembershipDebt(owner) {
  const summary = {available: false, found: 0, recorded: 0, retained: 0, refused: 0};
  if (owner.isShuttingDown) return Object.freeze(summary);
  const census = await owner.repository.queryAuthoritativeMessageGroupMembershipDebtOperations();
  if (!census.available) {
    owner.logger.warn(LOG.MEMBERSHIP_DEBT_SWEEP_UNAVAILABLE, {nodeId: owner.nodeId});
    return Object.freeze(summary);
  }
  summary.available = true;
  for (const operation of census.operations) {
    summary.found += 1;
    const result = await recoverAndLog(owner, operation);
    if (result.outcome === DEBT.RECORDED) summary.recorded += 1;
    else if (REFUSED_OUTCOMES.has(result.outcome)) summary.refused += 1;
    else summary.retained += 1;
  }
  return Object.freeze(summary);
}
async function recoverDebtRow(owner, observed) {
  const operation = observed?.available ? observed.row : null;
  return operation && carriesMembershipDebt(operation) ? recoverAndLog(owner, operation) : null;
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
export {MEMBERSHIP_DEBT_RECOVERY_OUTCOME, recoverMessageGroupMembershipDebtOperation,
  reconcileMessageGroupMembershipDebt, wakeMessageGroupMembershipDebtForRow};
