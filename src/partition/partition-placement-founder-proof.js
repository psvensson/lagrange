import {UNIFIED_SERVICE_TYPE} from '../constants/unified-service-lifecycle.js';
import {COMMITTED_MEMBERSHIP_STAMP_KIND} from '../raft/raft-committed-membership-constants.js';
import {validateBootstrapMembershipStamp} from '../raft/raft-committed-membership-stamp.js';
import {OperationType} from '../rebalancer/replica-operation-progress.js';
import {PLACEMENT_TRANSITION_KIND} from '../rebalancer/replica-placement-owner-constants.js';
import {placementOperationPositionOf, placementReplicaIdOf} from
  './partition-placement-admission-identity.js';

function genesisOf(member) {
  const answer = validateBootstrapMembershipStamp(member.bootstrapMembership);
  return answer.valid && answer.stamp.kind === COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS ?
    answer.stamp : null;
}

function memberMatches(member, partitionId, foundingIntentId, entryId) {
  return member.type === OperationType.ADD &&
    member.partitionId === partitionId &&
    member.entityId === partitionId &&
    member.entityType === UNIFIED_SERVICE_TYPE.PARTITION &&
    member.admission?.transitionKind === PLACEMENT_TRANSITION_KIND.FOUND &&
    member.admission.foundingIntentId === foundingIntentId &&
    member.admission.entryId === entryId &&
    member.replicaId === placementReplicaIdOf(member.operationId);
}

function coversFounders(stamp, nodeByReplicaId) {
  return stamp && stamp.founders.length === nodeByReplicaId.size &&
    stamp.founders.every((id) =>
      nodeByReplicaId.has(id) && stamp.founderNodeIds[id] === nodeByReplicaId.get(id));
}

// Establish a single native FOUND entry and the complete GENESIS set. A
// surviving founder with incomplete history still blocks a duplicate, but
// cannot authorize the caller to take custody of any of its rows.
function provePlacementFounders(members, {partitionId, foundingIntentId}) {
  if (members.length === 0) return null;
  const [first] = members;
  const entryId = first.admission?.entryId;
  if (typeof entryId !== 'string' || entryId.length === 0) return null;

  const nodeByReplicaId = new Map(members.map(({replicaId, targetNodeId}) =>
    [replicaId, targetNodeId]));
  const targetNodeIds = new Set(nodeByReplicaId.values());
  if (nodeByReplicaId.size !== members.length || targetNodeIds.size !== members.length) {
    return null;
  }

  const positions = members.map(({operationId}) =>
    placementOperationPositionOf(operationId, partitionId));
  if (positions.some((position) => !position)) return null;
  const [firstPosition] = positions;
  if (new Set(positions.map(({ordinal}) => ordinal)).size !== members.length ||
      !positions.every(({index, ordinal}) => index === firstPosition.index &&
        ordinal < members.length)) return null;

  return members.every((member) =>
    memberMatches(member, partitionId, foundingIntentId, entryId) &&
    coversFounders(genesisOf(member), nodeByReplicaId)) ?
    Object.freeze({entryId}) : null;
}

export {provePlacementFounders};
