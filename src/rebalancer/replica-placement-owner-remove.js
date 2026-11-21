// Public entry: canAdmitRemoveUnderPass.
// Required collaborators: the ReplicaPlacementOwner (its workflowOwner and its tenure checkpoint).
// Durable authority / commit point: none - a read-only admissibility check before the admission.
// Permitted post-commit work: none.
// Recovery / wake entry: none.
// Representative production tests: test/rebalancer/placement-owner-authority-await-points.test.js.
//
// Whether a REMOVE candidate of a placement pass may be admitted now: the
// workflow owner's critical replica rows, the remove-safety projection and its
// simple voter-ready floor (operation-workflow-remove-safety-evaluator.js).
// Each of the three awaits is followed by the pass's tenure checkpoint: a pass
// whose tenure ended reads nothing further and admits nothing.
import {UNIFIED_SERVICE_TYPE} from '../constants/unified-service-lifecycle.js';
import {
  REMOVE_SAFETY_PROJECTION_STATE, buildRemoveSafetyProjectionInput, resolveRemoveSafetySimpleFloor,
} from './operation-workflow-remove-safety-evaluator.js';
import {OperationType} from './replica-operation-progress.js';
import {PLACEMENT_PASS_CHECKPOINT as CHECKPOINT} from
  './replica-placement-owner-pass-observation.js';

/**
 * A REMOVE candidate's admissibility under the pass's tenure.
 * @param {Object} owner - The ReplicaPlacementOwner.
 * @param {Object} candidate - The REMOVE candidate.
 * @param {Object} pass - The pass record (its custody).
 * @return {Promise<boolean>} Whether it may be admitted now.
 */
async function canAdmitRemoveUnderPass(owner, candidate, pass) {
  const {workflowOwner} = owner;
  if (!workflowOwner) return false;
  const operation = {
    type: OperationType.REMOVE,
    partitionId: candidate.partitionId,
    entityType: UNIFIED_SERVICE_TYPE.PARTITION,
    entityId: candidate.partitionId,
    replicaId: candidate.move.replicaId,
    targetNodeId: candidate.move.targetNodeId,
  };
  const rows = await workflowOwner.getCriticalReplicaRowsForSafety(candidate.partitionId);
  if (!owner.checkpoint(pass, CHECKPOINT.AFTER_REMOVE_ROWS)) return false;
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const projection = await buildRemoveSafetyProjectionInput(workflowOwner, operation, rows);
  if (!owner.checkpoint(pass, CHECKPOINT.AFTER_REMOVE_PROJECTION)) return false;
  if (projection.state !== REMOVE_SAFETY_PROJECTION_STATE.READY) return false;
  const floor = await resolveRemoveSafetySimpleFloor(workflowOwner, operation,
    projection.projectedVoterReadyRows);
  return owner.checkpoint(pass, CHECKPOINT.AFTER_REMOVE_FLOOR) && floor.floorSatisfied === true;
}

export {canAdmitRemoveUnderPass};
