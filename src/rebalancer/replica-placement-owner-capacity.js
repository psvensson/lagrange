// Public entry: summarizeCopyOccupancy, saturatedTargetsOf, isCopyWithinCapacity, recordAdmittedCopyOccupancy, classifyNodeStorageExclusion, COPY_MOVE_TYPES.
// Required collaborators: none (pure functions of the census and the candidate).
// Durable authority / commit point: none - the ledger's apply arbitrates copy capacity.
// Permitted post-commit work: none.
// Recovery / wake entry: none.
// Representative production tests: test/rebalancer/replica-placement-owner-core.test.js.
//
// The replica placement owner's copy-capacity view of one pass (owner
// decision D2: K_src copies per source, K_tgt per target): the copy-phase
// occupancy of the census, the saturated targets, whether a copy candidate
// fits, the occupancy after an admission, and a node's storage exclusion.
import {isOccupyingCopy} from '../partition/partition-placement-admission-decision.js';
import {OperationType} from './replica-operation-progress.js';
import {PRESSURE_STATE} from './storage-capacity-constants.js';
import {resolveSourceCapacityForClass} from './replica-placement-owner-admission-statement.js';
import {PLACEMENT_COPY_CAPACITY, PLACEMENT_WAITING_REASON} from
  './replica-placement-owner-constants.js';

const COPY_MOVE_TYPES = Object.freeze(new Set([OperationType.ADD, OperationType.REPLACE]));

function summarizeCopyOccupancy(census) {
  const copies = census.filter(isOccupyingCopy);
  const bySource = new Map();
  const byTarget = new Map();
  let unrecordedSourceCopies = 0;
  for (const row of copies) {
    if (row.copySourceNodeId === null) {
      unrecordedSourceCopies += 1;
    } else {
      bySource.set(row.copySourceNodeId, (bySource.get(row.copySourceNodeId) ?? 0) + 1);
    }
    byTarget.set(row.targetNodeId, (byTarget.get(row.targetNodeId) ?? 0) + 1);
  }
  return {copies, bySource, byTarget, unrecordedSourceCopies};
}

function saturatedTargetsOf(byTarget) {
  const saturated = new Set();
  for (const [nodeId, count] of byTarget.entries()) {
    if (count >= PLACEMENT_COPY_CAPACITY.K_TGT) saturated.add(nodeId);
  }
  return saturated;
}

function isCopyWithinCapacity(candidate, repairWaitingSourceNodeIds, occupancy) {
  const kSrcForClass = resolveSourceCapacityForClass({
    placementClass: candidate.placementClass,
    repair: candidate.repair,
    copySourceNodeId: candidate.move.copySourceNodeId,
    repairWaitingSourceNodeIds,
    kSrc: PLACEMENT_COPY_CAPACITY.K_SRC,
  });
  const sourceOcc = occupancy.unrecordedSourceCopies +
    (occupancy.bySource.get(candidate.move.copySourceNodeId) ?? 0);
  const targetOcc = occupancy.byTarget.get(candidate.move.targetNodeId) ?? 0;
  return sourceOcc < kSrcForClass && targetOcc < PLACEMENT_COPY_CAPACITY.K_TGT;
}

function recordAdmittedCopyOccupancy(candidate, occupancy, saturatedTargets) {
  if (!COPY_MOVE_TYPES.has(candidate.move.type)) return 0;
  occupancy.bySource.set(
    candidate.move.copySourceNodeId,
    (occupancy.bySource.get(candidate.move.copySourceNodeId) ?? 0) + 1,
  );
  const nextTargetOcc = (occupancy.byTarget.get(candidate.move.targetNodeId) ?? 0) + 1;
  occupancy.byTarget.set(candidate.move.targetNodeId, nextTargetOcc);
  if (nextTargetOcc >= PLACEMENT_COPY_CAPACITY.K_TGT) {
    saturatedTargets.add(candidate.move.targetNodeId);
  }
  return 1;
}

function classifyNodeStorageExclusion(identity) {
  const capacity = identity?.projection?.capacity;
  if (!capacity || capacity.budgetBytes === null) {
    return PLACEMENT_WAITING_REASON.TARGET_STORAGE_UNKNOWN;
  }
  if (capacity.pressureState === PRESSURE_STATE.HARD ||
      capacity.pressureState === PRESSURE_STATE.EXHAUSTED) {
    return PLACEMENT_WAITING_REASON.TARGET_STORAGE_CONSTRAINED;
  }
  return null;
}

export {
  COPY_MOVE_TYPES,
  classifyNodeStorageExclusion,
  isCopyWithinCapacity,
  recordAdmittedCopyOccupancy,
  saturatedTargetsOf,
  summarizeCopyOccupancy,
};
