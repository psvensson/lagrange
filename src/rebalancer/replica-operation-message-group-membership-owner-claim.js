/** Exact membership holder in the existing operation row; not an action permit.
 * Ordinary expiry-only orphan adoption does not grant this ownership.
 */
import {readAuthoritativeControlPlaneRows} from
  '../control-plane/control-plane-system-table-gateway.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE, CONTROL_PLANE_READ_LEADER_MODE}
  from '../control-plane/control-plane-system-table-gateway-constants.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {OperationType} from './replica-status.js';
import {REPLICA_OPERATION_OWNER_LEASE_TTL_MS,
  REPLICA_OPERATION_OWNER_LEASE_ADOPTION, resolveOperationOwnerLeaseAdoption} from './replica-operation-owner-lease.js';
import {decodeMembershipIdentity, decodeMembershipOwnerClaim,
  MEMBERSHIP_AUTHORIZATION_OUTCOME as OUTCOME} from
  './replica-operation-message-group-membership-permit.js';

const READ = Object.freeze({authoritativeReadMode:
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED});
const INITIAL_PHASE = 'learner_requested';
const INITIAL_OBLIGATION = 'intent_recorded';
const UNRESOLVED_OBLIGATION = 'unknown';
const answer = (outcome, operation = null, claim = null) =>
  Object.freeze({outcome, operation, claim});
function sourceClaimMatches(encoded, identity) {
  try {
    const claim = JSON.parse(encoded);
    return claim?.replicaId === identity.sourceReplicaId &&
      claim.createdAt === identity.sourceCreatedAt &&
      claim.createAttemptToken === identity.sourceCreateAttemptToken;
  } catch {
    return false;
  }
}
function membershipRowIdentityMatches(row, identity, encodedIdentity) {
  return row?.operationId === identity.operationId && row.type === OperationType.REPLACE &&
    row.partitionId === identity.groupId && row.entityId === identity.groupId &&
    row.entityType === SERVICE_TYPE.MESSAGE_GROUP &&
    row.sourceReplicaId === identity.sourceReplicaId &&
    row.replicaId === identity.targetReplicaId &&
    row.sourceNodeId === identity.sourceNodeId && row.targetNodeId === identity.targetNodeId &&
    row.messageGroupMembershipLaneKey === identity.membershipLaneKey &&
    row.messageGroupMembershipIdentity === encodedIdentity &&
    sourceClaimMatches(row.messageGroupSourceLifecycleClaim, identity);
}

async function observeMembershipOperation(repository, operationId) {
  try {
    const row = await repository.queryAuthoritativeOperationById(operationId, READ);
    return {available: true, row};
  } catch {
    return {available: false, row: null};
  }
}
function membershipClaimIsLocalAndLive(repository, claim, identity) {
  const now = repository.timeSource.now();
  return claim && claim.operationId === identity.operationId &&
    claim.transitionIdentity === identity.transitionIdentity &&
    claim.ownerNodeId === repository.nodeId &&
    claim.ownerBootIncarnation === repository.membershipOwnerBootIncarnation &&
    Number.isSafeInteger(now) && now >= 0 && claim.expiresAt > now;
}
async function membershipBootIsCurrent(repository) {
  if (!Number.isSafeInteger(repository.membershipOwnerBootIncarnation) ||
    repository.membershipOwnerBootIncarnation <= 0) return false;
  try {
    const result = await readAuthoritativeControlPlaneRows(
      repository.controlPlaneSystemTableGateway, 'nodes',
      'SELECT node_id, boot_incarnation FROM nodes WHERE node_id = ?',
      [repository.nodeId], READ);
    return result?.success === true && result.rows?.length === 1 &&
      result.rows[0].node_id === repository.nodeId &&
      result.rows[0].boot_incarnation === repository.membershipOwnerBootIncarnation;
  } catch {
    return false;
  }
}
function initialClaimAllowed(repository, row) {
  return !repository.isOperationTerminal(row) && row.completedAt === null &&
    (repository.resolveOperationOwnerNodeId(row) === repository.nodeId ||
      resolveOperationOwnerLeaseAdoption(row, repository.nodeId, repository.timeSource.now())
        .adoption === REPLICA_OPERATION_OWNER_LEASE_ADOPTION.ADOPT_AS_FENCED_SUCCESSOR) &&
    row.messageGroupMembershipPhase === INITIAL_PHASE &&
    row.messageGroupMembershipObligationState === INITIAL_OBLIGATION &&
    row.messageGroupMembershipPermit === null &&
    row.messageGroupLearnerStamp === null && row.messageGroupVoterStamp === null &&
    row.messageGroupRemovalStamp === null;
}
function claimCandidate(repository, row, identity, expectedClaim) {
  if (row.messageGroupMembershipOwnerClaim !== expectedClaim) return null;
  const now = repository.timeSource.now();
  const expiry = now + REPLICA_OPERATION_OWNER_LEASE_TTL_MS;
  if (!Number.isSafeInteger(now) || now < 0 || Object.is(now, -0) ||
    !Number.isSafeInteger(expiry) || expiry <= now) return null;
  let generation = 1;
  if (expectedClaim === null) {
    if (!initialClaimAllowed(repository, row)) return null;
  } else {
    const old = decodeMembershipOwnerClaim(expectedClaim);
    if (!old || old.operationId !== identity.operationId ||
      old.transitionIdentity !== identity.transitionIdentity ||
      (old.expiresAt > now && !membershipClaimIsLocalAndLive(repository, old, identity))) {
      return null;
    }
    generation = old.generation + 1;
    if (!Number.isSafeInteger(generation) || expiry <= old.expiresAt) return null;
  }
  return JSON.stringify({version: 1, operationId: identity.operationId,
    transitionIdentity: identity.transitionIdentity, ownerNodeId: repository.nodeId,
    ownerBootIncarnation: repository.membershipOwnerBootIncarnation,
    generation, expiresAt: expiry});
}
const CLAIM_FIELDS = Object.freeze([
  ['operation_id', 'operationId'], ['type', 'type'], ['partition_id', 'partitionId'],
  ['entity_type', 'entityType'], ['entity_id', 'entityId'],
  ['source_replica_id', 'sourceReplicaId'], ['replica_id', 'replicaId'],
  ['source_node_id', 'sourceNodeId'], ['target_node_id', 'targetNodeId'],
  ['message_group_membership_identity', 'messageGroupMembershipIdentity'],
  ['message_group_membership_lane_key', 'messageGroupMembershipLaneKey'],
  ['message_group_source_lifecycle_claim', 'messageGroupSourceLifecycleClaim'],
  ['message_group_membership_owner_claim', 'messageGroupMembershipOwnerClaim'],
  ['message_group_membership_phase', 'messageGroupMembershipPhase'],
  ['message_group_membership_obligation_state', 'messageGroupMembershipObligationState'],
  ['message_group_membership_permit', 'messageGroupMembershipPermit'],
  ['message_group_learner_stamp', 'messageGroupLearnerStamp'],
  ['message_group_voter_stamp', 'messageGroupVoterStamp'],
  ['message_group_removal_stamp', 'messageGroupRemovalStamp'],
  ['status', 'status'], ['workflow_step', 'workflowStep'], ['completed_at', 'completedAt'],
]);
function claimUpdate(row, next) {
  const params = [next];
  const fields = row.messageGroupMembershipOwnerClaim === null ?
    [...CLAIM_FIELDS, ['lease_expires_at', 'ownerLeaseExpiresAt']] : CLAIM_FIELDS;
  const predicates = fields.map(([column, field]) => {
    if (row[field] === null) return `${column} IS NULL`;
    params.push(row[field]);
    return `${column} = ?`;
  });
  return {sql: `UPDATE replica_operations SET message_group_membership_owner_claim = ?
    WHERE ${predicates.join(' AND ')}`, params};
}
async function claimMessageGroupMembershipOwner(request) {
  if (!request || typeof request !== 'object') return answer(OUTCOME.INVALID);
  const {operationId, identity: encodedIdentity, expectedClaim} = request;
  const identity = decodeMembershipIdentity(encodedIdentity);
  if (!identity || identity.operationId !== operationId ||
    (expectedClaim !== null && typeof expectedClaim !== 'string')) return answer(OUTCOME.INVALID);
  if (!await membershipBootIsCurrent(this)) return answer(OUTCOME.UNAVAILABLE);
  const before = await observeMembershipOperation(this, operationId);
  if (!before.available) return answer(OUTCOME.UNAVAILABLE);
  const row = before.row;
  if (!membershipRowIdentityMatches(row, identity, encodedIdentity) ||
    ![INITIAL_OBLIGATION, UNRESOLVED_OBLIGATION].includes(row.messageGroupMembershipObligationState)) {
    return answer(OUTCOME.CONFLICT, row);
  }
  const next = claimCandidate(this, row, identity, expectedClaim);
  if (next === null) return answer(OUTCOME.CONFLICT, row);
  const {sql, params} = claimUpdate(row, next);
  try {
    await this.executeOperationMutationWithRetry(sql, params);
  } catch {
    // An uncertain write must be resolved by exact read-back, not assumed lost.
  }
  const after = await observeMembershipOperation(this, operationId);
  if (!after.available || !await membershipBootIsCurrent(this)) return answer(OUTCOME.UNKNOWN);
  if (membershipRowIdentityMatches(after.row, identity, encodedIdentity) &&
    after.row.messageGroupMembershipOwnerClaim === next) {
    return answer(OUTCOME.RECORDED, after.row, next);
  }
  return answer(OUTCOME.UNKNOWN, after.row);
}
export {claimMessageGroupMembershipOwner, observeMembershipOperation,
  membershipRowIdentityMatches, membershipClaimIsLocalAndLive, membershipBootIsCurrent};
