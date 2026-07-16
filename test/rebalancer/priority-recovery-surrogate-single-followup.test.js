import {test} from '../../src/test-helpers/tap.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';

const OWNER_PARTITION_ID = 'control_plane_publications-p1';
const SETTLED_PARTITION_ID = 'replica_operations-p1';
const FIRST_ELIGIBLE_PARTITION_ID = 'sql_transactions-p1';
const SECOND_ELIGIBLE_PARTITION_ID = 'sql_write_operations-p1';
const SETTLED_STATE = 'spread_satisfied';
const ELIGIBLE_STATE = 'needs_operation';

function decisionSnapshot(partitionId, semanticState) {
  return Object.freeze({partitionId, semanticState});
}

function createSurrogateDecisionOwner(decisionsByPartitionId) {
  const rebalancer = Object.create(UnifiedRebalancer.prototype);
  rebalancer.entityId = OWNER_PARTITION_ID;
  rebalancer.isControlPlanePriorityPartition = () => true;
  rebalancer.resolvePriorityRecoveryClosureWitnessFollowUpPartitionId = () =>
    SETTLED_PARTITION_ID;
  rebalancer.resolvePriorityRecoveryFollowUpPartitionId = (snapshot) =>
    snapshot?.partitionId || '';
  rebalancer.normalizePriorityRecoverySurrogateFollowUpDecisionSnapshot =
    (_planningSnapshot, partitionId) =>
      decisionsByPartitionId.get(partitionId) || null;
  rebalancer.isPriorityRecoveryFollowUpOperationRequired = (snapshot) =>
    snapshot?.semanticState === ELIGIBLE_STATE;
  rebalancer.buildPriorityRecoverySurrogateDecisionFromPlanning = () => null;
  return rebalancer;
}

function planningSnapshot() {
  return Object.freeze({
    priorityRecoveryDecisionSnapshots: Object.freeze({
      snapshots: Object.freeze([
        decisionSnapshot(FIRST_ELIGIBLE_PARTITION_ID, ELIGIBLE_STATE),
        decisionSnapshot(SECOND_ELIGIBLE_PARTITION_ID, ELIGIBLE_STATE),
      ]),
    }),
  });
}

function followUpRecord(snapshot, decision) {
  return Object.freeze({
    planningSnapshot: snapshot,
    decisionSnapshot: decision,
  });
}

test(
  'priority recovery scans past settled candidates but emits one surrogate per pass',
  (t) => {
    const decisionsByPartitionId = new Map([
      [
        SETTLED_PARTITION_ID,
        decisionSnapshot(SETTLED_PARTITION_ID, SETTLED_STATE),
      ],
      [
        FIRST_ELIGIBLE_PARTITION_ID,
        decisionSnapshot(FIRST_ELIGIBLE_PARTITION_ID, ELIGIBLE_STATE),
      ],
      [
        SECOND_ELIGIBLE_PARTITION_ID,
        decisionSnapshot(SECOND_ELIGIBLE_PARTITION_ID, ELIGIBLE_STATE),
      ],
    ]);
    const rebalancer = createSurrogateDecisionOwner(decisionsByPartitionId);
    const snapshot = planningSnapshot();

    t.same(
      rebalancer.buildPriorityRecoverySurrogateFollowUpDecisions(snapshot),
      [
        followUpRecord(
          snapshot,
          decisionsByPartitionId.get(FIRST_ELIGIBLE_PARTITION_ID),
        ),
      ],
      'the first pass emits only the first eligible surrogate',
    );

    decisionsByPartitionId.set(
      FIRST_ELIGIBLE_PARTITION_ID,
      decisionSnapshot(FIRST_ELIGIBLE_PARTITION_ID, SETTLED_STATE),
    );

    t.same(
      rebalancer.buildPriorityRecoverySurrogateFollowUpDecisions(snapshot),
      [
        followUpRecord(
          snapshot,
          decisionsByPartitionId.get(SECOND_ELIGIBLE_PARTITION_ID),
        ),
      ],
      'the next level-triggered pass advances to the next eligible surrogate',
    );
    t.end();
  },
);
