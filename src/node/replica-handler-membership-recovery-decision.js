// Autonomous permanent member loss recovery planner and replacement target
// selector for hosted partition leaders.

import {createHash} from 'node:crypto';
import {
  COLUMN,
  NODE_STATE,
  STATE,
  TABLES,
} from '../constants/index.js';
import {hasLiveTransportEvidence} from
  '../control-plane/live-transport-evidence.js';
import {NodeReadyLeaseAuthority} from
  '../control-plane/node-ready-lease-authority.js';
import {projectNodeLivenessSemantics} from
  '../control-plane/node-liveness-semantic-projection.js';
import {
  PARTITION_MEMBERSHIP_RECOVERY_DEFAULT as DEFAULT_VALUE,
} from '../partition/partition-membership-recovery-constants.js';
import {
  deriveCanonicalPeerIdString,
  readCommittedMembershipRecoveriesIn,
  resolveAuthoritativeMemberBinding,
} from '../partition/partition-membership-recovery.js';
import {
  readPartitionCommittedMembership,
} from '../partition/partition-service-raft-membership-administration.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
} from '../raft/raft-committed-membership-constants.js';
import {
  OperationType,
  isTerminalReplicaOperationRecord,
} from '../rebalancer/replica-operation-progress.js';

const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function sha256Hex(input) {
  return createHash(DIGEST_ALGORITHM).update(input).digest(DIGEST_ENCODING);
}

function observesCommittedNodeLossRow(row) {
  if (!row) return false;
  const boot = Number(row[COLUMN.BOOT_INCARNATION]);
  if (!isPositiveSafeInteger(boot)) return false;
  const status = row[COLUMN.STATUS];
  if (status === NODE_STATE.FAILED || status === NODE_STATE.STOPPED) return true;
  return row[COLUMN.CONNECTION_STATE] === STATE.DISCONNECTED &&
    row[COLUMN.READY_LEASE_EXPIRES_AT] === null;
}

function isNodeEligibleForPermanentLossRecovery(handler, nodeId, nowMs) {
  if (!isNonEmptyString(nodeId) || nodeId === handler?.nodeId) return false;
  if (hasLiveTransportEvidence(nodeId, {messageRouter: handler?.messageRouter})) {
    return false;
  }
  const nodeRow = handler?.systemTableCache?.get?.(TABLES.NODES, nodeId) ?? null;
  if (!nodeRow) return false;
  if (observesCommittedNodeLossRow(nodeRow)) return true;
  const leaseAuthority = NodeReadyLeaseAuthority.fromConfiguration();
  return leaseAuthority.isExpired(nodeRow, nowMs);
}

function isNodeUnreachablePendingExpiry(handler, nodeId, nowMs) {
  if (!isNonEmptyString(nodeId) || nodeId === handler?.nodeId) return false;
  if (hasLiveTransportEvidence(nodeId, {messageRouter: handler?.messageRouter})) {
    return false;
  }
  const nodeRow = handler?.systemTableCache?.get?.(TABLES.NODES, nodeId) ?? null;
  if (!nodeRow) return false;
  if (observesCommittedNodeLossRow(nodeRow)) return false;
  const leaseAuthority = NodeReadyLeaseAuthority.fromConfiguration();
  return !leaseAuthority.isExpired(nodeRow, nowMs);
}

function isClusterNodeRowUnreachableOrDead(handler, nodeRow) {
  const nodeId = nodeRow?.[COLUMN.NODE_ID];
  if (!isNonEmptyString(nodeId) || nodeId === handler?.nodeId) return false;
  if (observesCommittedNodeLossRow(nodeRow)) return true;
  if (nodeRow?.[COLUMN.STATUS] !== NODE_STATE.READY &&
      nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT] === null) {
    return false;
  }
  return !hasLiveTransportEvidence(nodeId, {messageRouter: handler?.messageRouter});
}

function hasAnyUnreachableOrDeadClusterNode(handler) {
  const nodeRows = handler?.systemTableCache?.getAll?.(TABLES.NODES);
  if (!Array.isArray(nodeRows) || nodeRows.length === 0) return false;
  return nodeRows.some((nodeRow) =>
    isClusterNodeRowUnreachableOrDead(handler, nodeRow));
}

function selectEligibleReplacementTargetNode(handler, partitionId, excludedNodeIds, nowMs) {
  const cache = handler?.systemTableCache;
  if (!cache || !cache.getAll) return null;
  const operationRows = cache.getAll(TABLES.REPLICA_OPERATIONS) || [];
  const activeReplace = operationRows.find((row) =>
    row?.partition_id === partitionId &&
    (row?.type === OperationType.REPLACE || row?.type === OperationType.ADD) &&
    !isTerminalReplicaOperationRecord(row) &&
    isNonEmptyString(row.target_node_id) &&
    !excludedNodeIds.has(row.target_node_id));
  const nodeRows = cache.getAll(TABLES.NODES) || [];
  const eligibleNodes = [];
  for (const nodeRow of nodeRows) {
    const nodeId = nodeRow?.[COLUMN.NODE_ID];
    const bootIncarnation = Number(nodeRow?.[COLUMN.BOOT_INCARNATION]);
    if (!isNonEmptyString(nodeId) || excludedNodeIds.has(nodeId) ||
         !isPositiveSafeInteger(bootIncarnation) ||
        observesCommittedNodeLossRow(nodeRow)) {
      continue;
    }
    const transportLive = nodeId === handler.nodeId ||
      hasLiveTransportEvidence(nodeId, {messageRouter: handler.messageRouter});
    if (!transportLive) continue;
    const readyNow = projectNodeLivenessSemantics({nodeRow, nowMs})
      ?.projection?.readyNow === true;
    eligibleNodes.push({nodeId, bootIncarnation, readyNow});
  }
  eligibleNodes.sort((left, right) => {
    if (left.readyNow !== right.readyNow) {
      return left.readyNow ? -1 : 1;
    }
    return left.nodeId.localeCompare(right.nodeId);
  });
  if (activeReplace) {
    const matched = eligibleNodes.find((item) =>
      item.nodeId === activeReplace.target_node_id);
    if (matched) {
      return {
        targetNodeId: matched.nodeId,
        targetNodeBootIncarnation: matched.bootIncarnation,
        targetReplicaId: isNonEmptyString(activeReplace.replica_id) ?
          activeReplace.replica_id : null,
      };
    }
  }
  return eligibleNodes[0] ? {
    targetNodeId: eligibleNodes[0].nodeId,
    targetNodeBootIncarnation: eligibleNodes[0].bootIncarnation,
    targetReplicaId: null,
  } : null;
}

function resolvePeerNodeIdFromMetadata(handler, membership, status, peerId, replicaId) {
  const directNode = membership.nodeIds?.[peerId];
  if (isNonEmptyString(directNode)) return directNode;
  const peerEntry = (status.peers || []).find((p) => p.replicaIdentity === replicaId);
  if (isNonEmptyString(peerEntry?.nodeId)) return peerEntry.nodeId;
  const serviceRow = handler?.systemTableCache?.get?.(TABLES.SERVICES, replicaId);
  return serviceRow?.[COLUMN.NODE_ID] ?? null;
}

function resolveTargetCreatedAtFromMetadata(handler, targetReplicaId, defaultCreatedAt) {
  const existingTargetRow = handler?.systemTableCache?.get?.(
    TABLES.SERVICES, targetReplicaId);
  const cachedCreatedAt = Number(existingTargetRow?.[COLUMN.CREATED_AT]);
  return isPositiveSafeInteger(cachedCreatedAt) ?
    cachedCreatedAt : defaultCreatedAt;
}

async function planAutonomousPermanentLossRecovery(
  handler,
  leaderService,
  hintedDeadNodeId = null,
  hintedDeadReplicaId = null,
) {
  const membership = await readPartitionCommittedMembership(
    leaderService,
    COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT,
  );
  if (membership?.kind !== COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED ||
      (membership.votersOutgoing || []).length > 0 ||
      (membership.learnersNext || []).length > 0) {
    return Object.freeze({plan: null, pendingExpiry: false});
  }
  const status = leaderService.raft?.readStatus?.();
  if (status?.role !== RAFT_ROLE.LEADER || status.confChangePending === true) {
    return Object.freeze({plan: null, pendingExpiry: false});
  }
  const voterPeerIds = (membership.voters || []).map(String);
  const existingRecoveries = readCommittedMembershipRecoveriesIn(leaderService);
  const unfinished = existingRecoveries.find((record) =>
    voterPeerIds.includes(record.sourcePeerId));
  if (unfinished) {
    return Object.freeze({plan: unfinished, pendingExpiry: false});
  }
  const nowMs = handler.timeSource.now();
  let sourcePeerId = null;
  let sourceReplicaId = null;
  let sourceNodeId = null;
  let pendingExpiry = false;
  for (const peerId of voterPeerIds) {
    const replicaId = membership.identities?.[peerId] ?? null;
    if (!isNonEmptyString(replicaId) || replicaId === leaderService.replicaId) {
      continue;
    }
    const nodeId = resolvePeerNodeIdFromMetadata(
      handler, membership, status, peerId, replicaId);
    if (!isNonEmptyString(nodeId)) continue;
    if (isNodeUnreachablePendingExpiry(handler, nodeId, nowMs)) {
      pendingExpiry = true;
    }
    const matchesHint = (hintedDeadNodeId && nodeId === hintedDeadNodeId) ||
      (hintedDeadReplicaId && replicaId === hintedDeadReplicaId);
    if (matchesHint && isNodeEligibleForPermanentLossRecovery(handler, nodeId, nowMs)) {
      sourcePeerId = peerId;
      sourceReplicaId = replicaId;
      sourceNodeId = nodeId;
      break;
    }
    if (!sourcePeerId && isNodeEligibleForPermanentLossRecovery(handler, nodeId, nowMs)) {
      sourcePeerId = peerId;
      sourceReplicaId = replicaId;
      sourceNodeId = nodeId;
    }
  }
  if (!sourcePeerId || !sourceReplicaId || !sourceNodeId) {
    return Object.freeze({plan: null, pendingExpiry});
  }
  const sourceBinding = resolveAuthoritativeMemberBinding(
    leaderService, sourceReplicaId, sourceNodeId);
  if (!sourceBinding.available) {
    return Object.freeze({plan: null, pendingExpiry});
  }
  const occupiedNodeIds = new Set([sourceNodeId]);
  for (const peerId of voterPeerIds) {
    if (peerId === sourcePeerId) continue;
    const replicaId = membership.identities?.[peerId];
    if (replicaId === leaderService.replicaId) {
      occupiedNodeIds.add(handler.nodeId);
      continue;
    }
    const nodeId = resolvePeerNodeIdFromMetadata(
      handler, membership, status, peerId, replicaId);
    if (isNonEmptyString(nodeId)) occupiedNodeIds.add(nodeId);
  }
  const targetSelection = selectEligibleReplacementTargetNode(
    handler, leaderService.partitionId, occupiedNodeIds, nowMs);
  if (!targetSelection) {
    return Object.freeze({plan: null, pendingExpiry: true});
  }
  const existingLearnerPeerId = (membership.learners || []).map(String).find((peerId) => {
    const learnerNodeId = membership.nodeIds?.[peerId];
    return learnerNodeId === targetSelection.targetNodeId;
  }) ?? null;
  const existingLearnerReplicaId = existingLearnerPeerId ?
    membership.identities?.[existingLearnerPeerId] ?? null : null;
  const digest = sha256Hex(
    `${leaderService.partitionId}:${membership.configurationKey}:` +
    `${membership.membershipGenerationIndex}:${sourceReplicaId}:` +
    `${targetSelection.targetNodeId}`,
  ).slice(0, DEFAULT_VALUE.DECISION_DIGEST_SLICE_LEN);
  const decisionId =
    `membership-recovery-${leaderService.partitionId}-` +
    `${membership.membershipGenerationIndex}-` +
    `${digest.slice(0, DEFAULT_VALUE.DECISION_ID_SLICE_LEN)}`;
  let targetReplicaId = `replace-replica-${digest}`;
  if (isNonEmptyString(existingLearnerReplicaId)) {
    targetReplicaId = existingLearnerReplicaId;
  } else if (isNonEmptyString(targetSelection.targetReplicaId)) {
    targetReplicaId = targetSelection.targetReplicaId;
  }
  const defaultCreatedAt = sourceBinding.replicaCreatedAt + 1 +
    Number(membership.membershipGenerationIndex);
  const targetReplicaCreatedAt = resolveTargetCreatedAtFromMetadata(
    handler, targetReplicaId, defaultCreatedAt);
  return Object.freeze({
    pendingExpiry: false,
    plan: Object.freeze({
      decisionId,
      entryId: decisionId,
      partitionId: leaderService.partitionId,
      configurationKey: membership.configurationKey,
      membershipGenerationIndex: Number(membership.membershipGenerationIndex),
      sourcePeerId,
      sourceReplicaId,
      sourceReplicaCreatedAt: sourceBinding.replicaCreatedAt,
      sourceNodeId,
      sourceNodeBootIncarnation: sourceBinding.nodeBootIncarnation,
      targetPeerId: deriveCanonicalPeerIdString(targetReplicaId),
      targetReplicaId,
      targetReplicaCreatedAt,
      targetNodeId: targetSelection.targetNodeId,
      targetNodeBootIncarnation: targetSelection.targetNodeBootIncarnation,
    }),
  });
}

export {
  hasAnyUnreachableOrDeadClusterNode,
  isNodeEligibleForPermanentLossRecovery,
  planAutonomousPermanentLossRecovery,
  selectEligibleReplacementTargetNode,
};
