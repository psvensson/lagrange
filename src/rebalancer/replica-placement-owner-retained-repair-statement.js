import {resolveTargetNodeIncarnationSnapshot} from './replica-status.js';
// The ordinary placement owner classifies a currently eligible same-ID copy
// repair. This observes its real node/formation/deficit inputs; it never labels
// a historical copy a repair merely to obtain a larger quota.
import {readPlacementCensus} from '../partition/partition-placement-admission-decision.js';
import {SERVE_ELIGIBILITY_STATE} from '../control-plane/serve-eligibility-record-decision.js';
import {readPlacementNodeInputs} from './replica-placement-owner-deficits.js';
import {buildPlacementAdmissionStatement} from './replica-placement-owner-admission-statement.js';
import {UNIFIED_SERVICE_TYPE} from '../constants/unified-service-lifecycle.js';
import {WORKFLOW_STEP} from '../constants/workflow.js';
import {OperationType} from './replica-operation-progress.js';

function promotedVoterReplicaIdsByPartition(census) {
  const byPartition = new Map();
  for (const row of census) {
    if (row.entityType !== UNIFIED_SERVICE_TYPE.PARTITION ||
        row.type !== OperationType.GROWTH_PROMOTE || row.incomplete ||
        row.step !== WORKFLOW_STEP.ACTIVE || row.promoteReplicaIds === null) {
      continue;
    }
    const promoted = byPartition.get(row.entityId) ?? new Set();
    for (const replicaId of row.promoteReplicaIds) promoted.add(replicaId);
    byPartition.set(row.entityId, promoted);
  }
  return byPartition;
}

function buildCurrentRetainedCopyStatement(owner, operation) {
  if (!owner || typeof owner.preparePassOrderedCandidates !== 'function') return null;
  const nodeInput = readPlacementNodeInputs(owner.nodeAuthority, owner.now());
  if (nodeInput.state !== SERVE_ELIGIBILITY_STATE.READY) return null;
  const census = readPlacementCensus(owner.ledgerPartitionService.db);
  const busy = new Set(census.filter((row) => row.incomplete &&
    row.entityType === UNIFIED_SERVICE_TYPE.PARTITION).map((row) => row.entityId));
  // Capacity is arbitrated by native apply, against its own committed cut.
  // Keeping the target out of the saturation filter cannot grant a slot.
  const {ordered, repairWaitingSourceNodeIds, inputsByPartition} = owner.preparePassOrderedCandidates(
    nodeInput, busy, new Set(), owner.readStorageExcludedTargets(nodeInput, owner.now()),
    promotedVoterReplicaIdsByPartition(census));
  const candidate = ordered.find((entry) => entry.partitionId === operation.partitionId &&
    entry.move.type === operation.type && entry.move.targetNodeId === operation.targetNodeId &&
    entry.move.copySourceNodeId === operation.copySourceNodeId &&
    (entry.move.sourceReplicaId ?? null) === (operation.sourceReplicaId ?? null));
  const identity = resolveTargetNodeIncarnationSnapshot(owner.systemTableCache, operation.targetNodeId);
  if (!candidate || !Number.isSafeInteger(operation.targetNodeBootIncarnation) ||
      !Number.isSafeInteger(operation.targetNodeStorageIncarnation) ||
      nodeInput.eligibility.nodeBoots.get(operation.targetNodeId) !==
        operation.targetNodeBootIncarnation || identity.bootIncarnation !==
        operation.targetNodeBootIncarnation || identity.storageIncarnation !==
        operation.targetNodeStorageIncarnation) return null;
  return buildPlacementAdmissionStatement({...candidate,
    move: {...candidate.move, replicaId: operation.replicaId,
      targetNodeBootIncarnation: operation.targetNodeBootIncarnation,
      targetNodeStorageIncarnation: operation.targetNodeStorageIncarnation ?? null}}, {
    sourceNodeId: owner.resolveStatementSourceNodeId(candidate, inputsByPartition),
    repairWaitingSourceNodeIds,
    formationLatchEpoch: nodeInput.formation.latchEpoch,
    membershipPublicationEpoch: operation.membershipPublicationEpoch ?? null,
    positions: {nodesEpoch: nodeInput.epoch?.publicationEpoch ?? null},
  });
}

export {buildCurrentRetainedCopyStatement, promotedVoterReplicaIdsByPartition};
