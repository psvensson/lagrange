/** Durable membership permit codec, subordinate to ReplicaOperationRepository.
 * Inputs are encoded row values, not caller-owned objects or execution grants.
 */
import {deriveRaftRsPeerId} from '../raft/raft-rs-peer-identity.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE} from
  '../raft/raft-operation-port-constants.js';

const MEMBERSHIP_BRANCH = Object.freeze({PROMOTE: 'promote',
  ABORT_LEARNER: 'abort_learner'});
const MEMBERSHIP_PHASE = Object.freeze({LEARNER_REQUESTED: 'learner_requested',
  LEARNER_IN_FLIGHT: 'learner_proposal_in_flight', LEARNER_COMMITTED: 'learner_committed',
  PROMOTION_IN_FLIGHT: 'promotion_proposal_in_flight',
  TARGET_REMOVAL_IN_FLIGHT: 'target_removal_proposal_in_flight'});
const MEMBERSHIP_PERMIT_STATE = Object.freeze({COMMITTED: 'committed',
  IN_FLIGHT: 'in_flight'});
// NONCOMMITTED: the recorder's exact read proves an in-flight learner action can
// never commit (its origin is absent where a newer term's leader has applied an
// entry of that term). It records nothing; only an ordered successor follows.
const MEMBERSHIP_AUTHORIZATION_OUTCOME = Object.freeze({RECORDED: 'recorded',
  CONFLICT: 'conflict', UNAVAILABLE: 'unavailable', UNKNOWN: 'unknown',
  INVALID: 'invalid', STALE_OWNER: 'stale_owner', NONCOMMITTED: 'noncommitted'});
const MEMBERSHIP_OBLIGATION = Object.freeze({INTENT_RECORDED: 'intent_recorded',
  UNKNOWN: 'unknown'});
/** Typed outcomes of one membership-debt reconciliation turn. Only RECORDED
 * means the exact learner outcome is durable; every other state keeps the debt.
 * SUCCESSOR_ISSUED: the ordered successor attempt is durably issued; its
 * native proposal and exact outcome are still owed. */
const MEMBERSHIP_DEBT_RECOVERY_OUTCOME = Object.freeze({
  RECORDED: 'recorded', RETAINED: 'retained', NO_HOSTED_WITNESS: 'no_hosted_witness',
  SUCCESSOR_ISSUED: 'successor_issued',
  HELD_ELSEWHERE: 'held_elsewhere', CLAIM_REFUSED: 'claim_refused',
  PHASE_NOT_OWNED: 'phase_not_owned', INVALID_ROW: 'invalid_row', INVALID_INPUT: 'invalid_input',
  CONFLICT: 'conflict', NOT_CURRENT: 'not_current', LANE_BUSY: 'lane_busy'});
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
// Typed subsets of the record keys above: which keys are positive integers and
// which are non-empty text. Each key is spelled once, in its owner list.
const IDENTITY_INTEGER_KEYS = Object.freeze(['sourceCreatedAt']);
const PERMIT_INTEGER_KEYS = Object.freeze(['membershipLeaseExpiresAt',
  'proposerBootIncarnation', 'destinationBootIncarnation', 'leaderTerm']);
const CLAIM_TEXT_KEYS = Object.freeze(['operationId', 'transitionIdentity', 'ownerNodeId']);
const CLAIM_INTEGER_KEYS = Object.freeze(['ownerBootIncarnation', 'generation', 'expiresAt']);
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
  if (!value || !IDENTITY_KEYS.filter((key) => !IDENTITY_INTEGER_KEYS.includes(key))
    .every((key) => text(value[key])) || !integer(value.sourceCreatedAt, 1) ||
    value.sourceReplicaId === value.targetReplicaId ||
    value.membershipLaneKey !== messageGroupMembershipLaneKey(value.groupId) ||
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
    !PERMIT_INTEGER_KEYS.every((key) => integer(value[key], 1)) ||
    !integer(value.runtimeGeneration) ||
    deriveRaftRsPeerId(value.replicaIdentity) !== value.peerId) return null;
  const stamp = value.leaderConfigurationStamp;
  if (!exactKeys(stamp, CONFIG_KEYS) || !text(stamp.configurationKey) ||
    !integer(stamp.membershipGenerationIndex)) return null;
  if (value.permitState === MEMBERSHIP_PERMIT_STATE.IN_FLIGHT ?
    value.proposalIndex !== null : !integer(value.proposalIndex, 1)) return null;
  return Object.freeze({...value, leaderConfigurationStamp: Object.freeze(stamp)});
}
const inKeyOrder = (record, keys) => Object.fromEntries(keys.map((key) => [key, record[key]]));
/** The canonical encoding of a permit record: compact JSON with the codec's key
 * order (the stamp's too), accepted only when the codec decodes it; else null. */
function encodeMembershipPermit(record) {
  if (!exactKeys(record, PERMIT_KEYS)) return null;
  const encoded = JSON.stringify(inKeyOrder(record, PERMIT_KEYS), (_key, value) =>
    exactKeys(value, CONFIG_KEYS) ? inKeyOrder(value, CONFIG_KEYS) : value);
  return decodeMembershipPermit(encoded) === null ? null : encoded;
}
function decodeMembershipOwnerClaim(encoded) {
  const value = parseRecord(encoded, CLAIM_KEYS);
  if (!value || value.version !== 1 ||
    !CLAIM_TEXT_KEYS.every((key) => text(value[key])) ||
    !CLAIM_INTEGER_KEYS.every((key) => integer(value[key], 1))) {
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
const MEMBERSHIP_LANE_KEY_PREFIX = 'message-group:';
/** The one durable lane a group's membership obligations serialize on. */
function messageGroupMembershipLaneKey(groupId) {
  return `${MEMBERSHIP_LANE_KEY_PREFIX}${groupId}`;
}

export {MEMBERSHIP_PHASE, MEMBERSHIP_PERMIT_STATE,
  MEMBERSHIP_AUTHORIZATION_OUTCOME, MEMBERSHIP_OBLIGATION,
  decodeMembershipIdentity, decodeMembershipPermit, membershipBranchSpec,
  decodeMembershipOwnerClaim, membershipOwnerClaimFence,
  messageGroupMembershipLaneKey, encodeMembershipPermit,
  MEMBERSHIP_DEBT_RECOVERY_OUTCOME};
