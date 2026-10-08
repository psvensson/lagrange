/** Durable membership permit codec, subordinate to ReplicaOperationRepository.
 * Inputs are encoded row values, not caller-owned objects or execution grants.
 */
import {deriveRaftRsPeerId} from '../raft/raft-rs-peer-identity.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE} from
  '../raft/raft-operation-port-constants.js';

const MEMBERSHIP_BRANCH = Object.freeze({PROMOTE: 'promote',
  ABORT_LEARNER: 'abort_learner'});
const MEMBERSHIP_PHASE = Object.freeze({LEARNER_COMMITTED: 'learner_committed',
  PROMOTION_IN_FLIGHT: 'promotion_proposal_in_flight',
  TARGET_REMOVAL_IN_FLIGHT: 'target_removal_proposal_in_flight'});
const MEMBERSHIP_PERMIT_STATE = Object.freeze({COMMITTED: 'committed',
  IN_FLIGHT: 'in_flight'});
const MEMBERSHIP_AUTHORIZATION_OUTCOME = Object.freeze({RECORDED: 'recorded',
  CONFLICT: 'conflict', UNAVAILABLE: 'unavailable', UNKNOWN: 'unknown',
  INVALID: 'invalid', STALE_OWNER: 'stale_owner'});
const MEMBERSHIP_OBLIGATION = Object.freeze({UNKNOWN: 'unknown'});
const PERMIT_VERSION = 2;
const MAX_RECORD_BYTES = 16384;
const IDENTITY_KEYS = Object.freeze(['operationId', 'groupId',
  'sourceReplicaId', 'sourceNodeId', 'sourceCreatedAt',
  'sourceCreateAttemptToken', 'targetReplicaId', 'targetPeerId',
  'targetNodeId', 'targetAddress', 'transitionIdentity', 'membershipLaneKey']);
const PERMIT_KEYS = Object.freeze(['version', 'transitionIdentity',
  'permitSequence', 'permitStage', 'permitState', 'workflowOwnerNodeId',
  'workflowOwnerFence', 'membershipLeaseExpiresAt', 'proposerNodeId',
  'proposerBootIncarnation', 'destinationNodeId', 'destinationBootIncarnation',
  'replicaLifecycleIncarnation', 'runtimeGeneration', 'leaderTerm',
  'leaderConfigurationStamp', 'proposalIndex', 'replicaIdentity', 'peerId']);
const CLAIM_KEYS = Object.freeze(['version', 'operationId', 'transitionIdentity',
  'ownerNodeId', 'ownerBootIncarnation', 'generation', 'expiresAt']);
const CONFIG_KEYS = Object.freeze(['configurationKey', 'membershipGenerationIndex']);
const text = (value) => typeof value === 'string' && value.length > 0;
const integer = (value, minimum = 0) => Number.isSafeInteger(value) &&
  !Object.is(value, -0) && value >= minimum;
function exactKeys(record, keys) {
  return record !== null && typeof record === 'object' &&
    !Array.isArray(record) && Object.keys(record).length === keys.length &&
    keys.every((key) => Object.hasOwn(record, key));
}
function parseRecord(encoded, keys) {
  if (!text(encoded) || Buffer.byteLength(encoded) > MAX_RECORD_BYTES) return null;
  try {
    const record = JSON.parse(encoded);
    return exactKeys(record, keys) ? record : null;
  } catch {
    return null;
  }
}
function decodeMembershipIdentity(encoded) {
  const value = parseRecord(encoded, IDENTITY_KEYS);
  if (!value || !IDENTITY_KEYS.filter((key) => key !== 'sourceCreatedAt')
    .every((key) => text(value[key])) || !integer(value.sourceCreatedAt, 1) ||
    value.sourceReplicaId === value.targetReplicaId ||
    value.membershipLaneKey !== `message-group:${value.groupId}` ||
    deriveRaftRsPeerId(value.targetReplicaId) !== value.targetPeerId) return null;
  return Object.freeze(value);
}
function decodeMembershipPermit(encoded) {
  const value = parseRecord(encoded, PERMIT_KEYS);
  if (!value || value.version !== PERMIT_VERSION ||
    !integer(value.permitSequence, 1) ||
    !Object.values(RAFT_MEMBERSHIP_TRANSITION_STAGE).includes(value.permitStage) ||
    !Object.values(MEMBERSHIP_PERMIT_STATE).includes(value.permitState)) return null;
  const strings = ['transitionIdentity', 'workflowOwnerNodeId',
    'workflowOwnerFence', 'proposerNodeId', 'destinationNodeId',
    'replicaLifecycleIncarnation', 'replicaIdentity', 'peerId'];
  if (!strings.every((key) => text(value[key])) ||
    !['membershipLeaseExpiresAt', 'proposerBootIncarnation',
      'destinationBootIncarnation', 'leaderTerm'].every((key) => integer(value[key], 1)) ||
    !integer(value.runtimeGeneration) ||
    deriveRaftRsPeerId(value.replicaIdentity) !== value.peerId) return null;
  const stamp = value.leaderConfigurationStamp;
  if (!exactKeys(stamp, CONFIG_KEYS) || !text(stamp.configurationKey) ||
    !integer(stamp.membershipGenerationIndex)) return null;
  if (value.permitState === MEMBERSHIP_PERMIT_STATE.IN_FLIGHT ?
    value.proposalIndex !== null : !integer(value.proposalIndex, 1)) return null;
  return Object.freeze({...value, leaderConfigurationStamp: Object.freeze(stamp)});
}
function decodeMembershipOwnerClaim(encoded) {
  const value = parseRecord(encoded, CLAIM_KEYS);
  if (!value || value.version !== 1 ||
    !['operationId', 'transitionIdentity', 'ownerNodeId'].every((key) => text(value[key])) ||
    !['ownerBootIncarnation', 'generation', 'expiresAt'].every((key) => integer(value[key], 1))) {
    return null;
  }
  return Object.freeze(value);
}
function membershipOwnerClaimFence(claim) {
  return `${claim.ownerNodeId}:${claim.ownerBootIncarnation}:${claim.generation}`;
}
function membershipBranchSpec(branch) {
  if (branch === MEMBERSHIP_BRANCH.PROMOTE) {
    return Object.freeze({
      phase: MEMBERSHIP_PHASE.PROMOTION_IN_FLIGHT,
      stage: RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE});
  }
  if (branch === MEMBERSHIP_BRANCH.ABORT_LEARNER) {
    return Object.freeze({
      phase: MEMBERSHIP_PHASE.TARGET_REMOVAL_IN_FLIGHT,
      stage: RAFT_MEMBERSHIP_TRANSITION_STAGE.REMOVE});
  }
  return null;
}
export {MEMBERSHIP_PHASE, MEMBERSHIP_PERMIT_STATE,
  MEMBERSHIP_AUTHORIZATION_OUTCOME, MEMBERSHIP_OBLIGATION,
  decodeMembershipIdentity, decodeMembershipPermit, membershipBranchSpec,
  decodeMembershipOwnerClaim, membershipOwnerClaimFence};
