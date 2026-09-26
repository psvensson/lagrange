/**
 * Owner contract:
 * Owner: the creation owner's committed-membership read (owner decision O1,
 * committed-read amendment 1, sections 3.1-3.2): the COMMITTED stamp of every
 * partition join (ADD, REPLACE, formation) comes from the group's leader,
 * read before the operation is persisted.
 * Inputs: the partition id; the partitions row's leader_node_id as a routing
 * hint only (the coordinator's own node without one); the leader address a
 * NOT_LEADER answer carries (one redirect).
 * Canonical output: the frozen COMMITTED stamp (the leader's answer,
 * unchanged), or a typed refusal thrown before anything is persisted.
 * Prohibited: no services row is read as membership and nothing falls back
 * to rows; a hint only routes the question - the answer's leader role is the
 * check, made by the answering replica's own port.
 */
import {AddressManager} from '../address/address-manager.js';
import {COLUMN, ENTITY_TYPE, TABLES} from '../constants/index.js';
import {
  COMMITTED_MEMBERSHIP_REFUSAL,
} from '../raft/raft-committed-membership-constants.js';
import {
  committedStampOfAnswer,
  replicaIdsOfStamp,
  validateBootstrapMembershipStamp,
} from '../raft/raft-committed-membership-stamp.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  './operation-workflow-owner-shared.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from './replica-operation-constants.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  REPLICA_OPERATION_DISPATCH_TIMEOUT_MS,
} = OPERATION_WORKFLOW_OWNER_SHARED;
const REPLICA_HANDLER_TARGET_SUFFIX = '/service/replica-handler';
const COMMITTED_MEMBERSHIP_READ_ERROR = Object.freeze({
  refused: (partitionId, reason) =>
    `committed membership of partition ${partitionId} unreadable: ${reason}`,
});

/**
 * The typed refusal of a creation whose committed membership could not be
 * read: thrown before the operation is persisted, so no operation row and no
 * row-derived stamp exists; the move is re-planned.
 * @param {string} partitionId - The partition.
 * @param {string} reason - A COMMITTED_MEMBERSHIP_REFUSAL.
 * @return {Error} The error, with code/errorCode = reason.
 */
function committedMembershipReadRefused(partitionId, reason) {
  return Object.assign(new Error(COMMITTED_MEMBERSHIP_READ_ERROR.refused(
    partitionId, reason)), {code: reason, errorCode: reason,
    retryable: true});
}

function leaderNodeHintOf(owner, partitionId) {
  const hint = owner.systemTableCache?.get?.(TABLES.PARTITIONS, partitionId)
    ?.[COLUMN.LEADER_NODE_ID];
  return typeof hint === 'string' && hint.length > 0 ? hint : null;
}

function nodeIdOfLeaderAddress(leaderAddress) {
  try {
    return AddressManager.getInstance().getNodeId(leaderAddress);
  } catch {
    // An address that does not parse names no node to redirect to.
    return null;
  }
}

// One node's answer; a delivery that fails or answers no membership is
// unreadable.
async function askNode(owner, nodeId, partitionId) {
  const unreadable = {reason: COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE};
  try {
    const response = await owner.messageRouter.deliver(
      `${nodeId}${REPLICA_HANDLER_TARGET_SUFFIX}`,
      {
        [ReplicaOperationField.TYPE]:
          ReplicaOperationMessageType.READ_COMMITTED_MEMBERSHIP,
        [ReplicaOperationField.PARTITION_ID]: partitionId,
      },
      {
        targetNodeId: nodeId,
        deliveryPriority: OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL,
        timeoutMs: REPLICA_OPERATION_DISPATCH_TIMEOUT_MS,
      },
    );
    return response?.status === ReplicaOperationResponseStatus.COMPLETED &&
      response[ReplicaOperationField.MEMBERSHIP] ?
      response[ReplicaOperationField.MEMBERSHIP] : unreadable;
  } catch {
    // A delivery failure or timeout is the typed unreadable outcome.
    return unreadable;
  }
}

/**
 * Read a partition's committed membership from its leader: first the node
 * the partitions row hints, then - on NOT_LEADER with a resolvable leader
 * address - that one node. Anything else is MEMBERSHIP_UNREADABLE.
 * @param {Object} owner - The creation owner (systemTableCache,
 *   messageRouter).
 * @param {string} partitionId - The partition.
 * @return {Promise<Object>} The frozen COMMITTED stamp.
 * @throws {Error} Typed refusal (code = a COMMITTED_MEMBERSHIP_REFUSAL).
 */
async function readCommittedMembershipStamp(owner, partitionId) {
  // Without a hint the coordinator's own node is asked first: a hint only
  // routes the question, and the answering port's leader role is the check.
  const hintedNodeId = leaderNodeHintOf(owner, partitionId) ?? owner.nodeId;
  if (typeof hintedNodeId !== 'string' || hintedNodeId.length === 0) {
    throw committedMembershipReadRefused(partitionId,
      COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE);
  }
  let answer = await askNode(owner, hintedNodeId, partitionId);
  if (answer.reason === COMMITTED_MEMBERSHIP_REFUSAL.NOT_LEADER) {
    const redirectNodeId = typeof answer.leaderAddress === 'string' ?
      nodeIdOfLeaderAddress(answer.leaderAddress) : null;
    answer = redirectNodeId === null || redirectNodeId === hintedNodeId ?
      {reason: COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE} :
      await askNode(owner, redirectNodeId, partitionId);
  }
  const stamp = committedStampOfAnswer(answer);
  if (stamp === null) {
    throw committedMembershipReadRefused(partitionId,
      answer.reason === COMMITTED_MEMBERSHIP_REFUSAL.NOT_LEADER ?
        COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE :
        answer.reason ?? COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE);
  }
  // Nothing the target would refuse is persisted: a leader that has not
  // applied its first entry answers no committed index yet.
  const validation = validateBootstrapMembershipStamp(stamp);
  if (!validation.valid) {
    throw committedMembershipReadRefused(partitionId, validation.reason);
  }
  return stamp;
}

/**
 * The address book of a new replica: for every replica its stamp names, the
 * address its services row records (or formats from the row's node), and
 * the target's own. Rows are discovery here; they name no member.
 * @param {Array<Object>} serviceRows - The partition's services rows.
 * @param {Array<string>} replicaIds - The stamp's address-hint list.
 * @param {Object} target - {targetNodeId, targetReplicaId}.
 * @return {Array<string>} Unified addresses, one per resolvable replica.
 */
function bootstrapAddressBook(serviceRows, replicaIds, {targetNodeId,
  targetReplicaId}) {
  const addressManager = AddressManager.getInstance();
  const named = new Set(replicaIds);
  const addresses = [];
  for (const row of serviceRows || []) {
    const replicaId = row?.service_id || row?.replica_id;
    if (!named.has(replicaId) || replicaId === targetReplicaId) {
      continue;
    }
    const address = row.address || (row.node_id ? addressManager.format(
      row.node_id, ENTITY_TYPE.PARTITION, replicaId) : null);
    if (address) {
      addresses.push(address);
    }
  }
  addresses.push(addressManager.format(
    targetNodeId, ENTITY_TYPE.PARTITION, targetReplicaId));
  return [...new Set(addresses)];
}

/**
 * The bootstrap topology of a partition join: the COMMITTED stamp read from
 * the group's leader, the address-hint list it yields, and the address book.
 * @param {Object} request - {partitionId, targetNodeId, targetReplicaId,
 *   readStamp, readAddressBook}.
 * @return {Promise<Object>} {replicaIds, peerAddresses, bootstrapMembership}.
 */
async function buildCommittedBootstrapTopology({targetNodeId, targetReplicaId,
  readStamp, readAddressBook}) {
  const bootstrapMembership = await readStamp();
  const replicaIds = replicaIdsOfStamp(bootstrapMembership, targetReplicaId);
  return {
    replicaIds,
    peerAddresses: bootstrapAddressBook(await readAddressBook(), replicaIds,
      {targetNodeId, targetReplicaId}),
    bootstrapMembership,
  };
}

export {buildCommittedBootstrapTopology, readCommittedMembershipStamp};
