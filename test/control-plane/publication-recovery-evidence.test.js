import {test} from '../../src/test-helpers/tap.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from
  '../../src/control-plane/control-plane-publication-merge.js';
import {RECOVERY_PROTOCOL_STATE} from
  '../../src/control-plane/membership-lifecycle-constants.js';
import {buildCanonicalPublicationRecoveryEvidence} from
  '../../src/control-plane/publication-recovery-evidence.js';

const TEST_PUBLICATION_EPOCH = 9;
const TEST_PRIORITY_PARTITION_ID = 'replica_operations-p1';
const TEST_NODE_ID = Object.freeze({
  FIRST: 'node-a',
  SECOND: 'node-b',
  THIRD: 'node-c',
});
const TEST_CLOSURE_RECORD_ID = 'CL-003';
const TEST_CLOSURE_WITNESS_CLASS =
  'publication_converged_priority_spread_pending';
const TEST_CLOSURE_WITNESS_STATE = 'closure_satisfied_stale_publication';
const TEST_STALE_REASON_CODE = 'priority_partitions_not_spread';
const TEST_NON_PRIORITY_PARTITION_ID =
  'tbl-b932fa03-3835-4a50-87b4-bd158daed0ea-p1';
const TEST_STALE_PRIORITY_PARTITION_SUMMARY = Object.freeze({
  satisfied: false,
  requiredDistinctNodeCount: 3,
  readyEligibleNodeCount: 3,
  totalPriorityPartitionCount: 1,
  missingPartitionIds: [TEST_PRIORITY_PARTITION_ID],
  blockedPartitions: [{
    partitionId: TEST_PRIORITY_PARTITION_ID,
    requiredDistinctNodeCount: 3,
    readyDistinctNodeCount: 2,
    spreadGap: 1,
  }],
  blockedPartitionCount: 1,
  largestSpreadGap: 1,
  totalSpreadGap: 1,
});
const TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY = Object.freeze({
  satisfied: true,
  requiredDistinctNodeCount: 3,
  readyEligibleNodeCount: 3,
  totalPriorityPartitionCount: 1,
  missingPartitionIds: [],
  blockedPartitions: [],
  blockedPartitionCount: 0,
  largestSpreadGap: 0,
  totalSpreadGap: 0,
});

function buildDecisionSnapshots() {
  return {
    capturedAt: 2000,
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
    partitionIdsBySemanticState: {
      converged: [],
      spread_satisfied_in_flight: [TEST_PRIORITY_PARTITION_ID],
      needs_operation: [],
      operation_stalled: [],
      learner_promotion_blocked: [],
      coordination_mismatch: [],
      recovering_in_flight: [],
      blocked_unclassified: [],
    },
    snapshots: [{
      partitionId: TEST_PRIORITY_PARTITION_ID,
      publication: {
        concreteEligibleNodeIds: [
          TEST_NODE_ID.FIRST,
          TEST_NODE_ID.SECOND,
          TEST_NODE_ID.THIRD,
        ],
      },
    }],
  };
}

test('buildCanonicalPublicationRecoveryEvidence closes stale spread metadata from the decision-layer closure witness',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
        publishedActiveNodeIds: [
          TEST_NODE_ID.FIRST,
          TEST_NODE_ID.SECOND,
          TEST_NODE_ID.THIRD,
        ],
        pendingAckNodeIds: [],
        priorityRecoveryReasonCodes: [TEST_STALE_REASON_CODE],
        priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
      },
      publicationConvergenceGate: {
        state: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
        ready: false,
        active: true,
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
        reasonCodes: [TEST_STALE_REASON_CODE],
        priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [],
        publicationPending: false,
        prioritySpreadPending: true,
      },
      priorityRecoveryDecisionSnapshots: buildDecisionSnapshots(),
    });

    t.equal(evidence.publicationConvergenceGate.ready, true);
    t.equal(evidence.publicationConvergenceGate.prioritySpreadPending, false);
    t.equal(
      evidence.publicationConvergenceGate.closureRecordId,
      TEST_CLOSURE_RECORD_ID,
    );
    t.equal(
      evidence.publicationConvergenceGate.closureWitnessClass,
      TEST_CLOSURE_WITNESS_CLASS,
    );
    t.same(
      evidence.publicationConvergenceGate.priorityPartitionSummary,
      TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
    );
    t.same(evidence.publicationConvergenceGate.reasonCodes, []);
    t.equal(evidence.priorityRecoveryObservation.prioritySpreadPending, false);
    t.equal(
      evidence.priorityRecoveryObservation.priorityRecoveryClosureState,
      TEST_CLOSURE_WITNESS_STATE,
    );
    t.equal(
      evidence.priorityRecoveryObservation.priorityPartitionSummary?.satisfied,
      true,
    );
    t.equal(
      evidence.priorityRecoveryObservation.priorityPartitionSummary
        ?.blockedPartitionCount,
      0,
    );
    t.equal(evidence.publicationConvergence.prioritySpreadPending, false);
    t.equal(
      evidence.publicationConvergence.closureRecordId,
      TEST_CLOSURE_RECORD_ID,
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence rebuilds a stale observation from the canonical publication gate',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        priorityRecoveryReasonCodes: [TEST_STALE_REASON_CODE],
        priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING,
        priorityRecoveryReasonCodes: [TEST_STALE_REASON_CODE],
        prioritySpreadPending: true,
        priorityPartitionSummary: TEST_STALE_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryDecisionSnapshots: buildDecisionSnapshots(),
    });

    t.equal(evidence.publicationConvergenceGate.ready, true);
    t.same(evidence.publicationConvergenceGate.reasonCodes, []);
    t.equal(evidence.priorityRecoveryObservation.prioritySpreadPending, false);
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryReasonCodes,
      [],
    );
    t.equal(
      evidence.priorityRecoveryObservation.priorityPartitionSummary?.satisfied,
      true,
    );
    t.equal(
      evidence.priorityRecoveryObservation.priorityPartitionSummary
        ?.blockedPartitionCount,
      0,
    );
    t.equal(evidence.publicationConvergence.prioritySpreadPending, false);
    t.same(evidence.publicationConvergence.priorityRecoveryReasonCodes, []);
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence prefers the derived current observation when a stale observation keeps old blocked semantic states on the same ready gate',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        priorityRecoveryReasonCodes: [],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        priorityRecoveryReasonCodes: [],
        prioritySpreadPending: false,
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
        priorityRecoveryProgressClassIds: [],
        priorityRecoverySemanticStateIds: ['recovering_in_flight'],
        priorityRecoveryBlockedPartitionIds: [TEST_PRIORITY_PARTITION_ID],
        priorityRecoveryPartitionIdsBySemanticState: {
          converged: [],
          spread_satisfied_in_flight: [TEST_PRIORITY_PARTITION_ID],
          needs_operation: [],
          operation_stalled: [],
          learner_promotion_blocked: [],
          coordination_mismatch: [],
          recovering_in_flight: [TEST_PRIORITY_PARTITION_ID],
          blocked_unclassified: [],
        },
      },
      priorityRecoveryDecisionSnapshots: buildDecisionSnapshots(),
    });

    t.same(
      evidence.priorityRecoveryObservation.priorityRecoverySemanticStateIds,
      [],
      'the decision-layer current summary should retire stale unresolved semantic states even when the gate state is already ready',
    );
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryBlockedPartitionIds,
      [],
      'current blocked partition ids should be rebuilt from the canonical decision summary',
    );
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionIdsBySemanticState
        .recovering_in_flight,
      [],
      'historical in-flight states should not survive as the current semantic-state contract',
    );
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionIdsBySemanticState
        .spread_satisfied_in_flight,
      [TEST_PRIORITY_PARTITION_ID],
      'the spread-satisfied lane should remain the current canonical semantic state',
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence scopes current priority-recovery blockers to tracked priority partitions',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        priorityRecoveryReasonCodes: [],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        priorityRecoveryReasonCodes: [],
        prioritySpreadPending: false,
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
        priorityRecoveryProgressClassIds: [
          'operation_created_but_no_step_transitions',
        ],
        priorityRecoverySemanticStateIds: ['operation_stalled'],
        priorityRecoveryBlockedPartitionIds: [TEST_NON_PRIORITY_PARTITION_ID],
        priorityRecoveryPartitionIdsBySemanticState: {
          converged: [],
          spread_satisfied_in_flight: [TEST_PRIORITY_PARTITION_ID],
          needs_operation: [],
          operation_stalled: [TEST_NON_PRIORITY_PARTITION_ID],
          learner_promotion_blocked: [],
          coordination_mismatch: [],
          recovering_in_flight: [],
          blocked_unclassified: [],
        },
      },
      priorityRecoveryDecisionSnapshots: {
        capturedAt: 2000,
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
        partitionIdsBySemanticState: {
          converged: [],
          spread_satisfied_in_flight: [TEST_PRIORITY_PARTITION_ID],
          needs_operation: [],
          operation_stalled: [TEST_NON_PRIORITY_PARTITION_ID],
          learner_promotion_blocked: [],
          coordination_mismatch: [],
          recovering_in_flight: [],
          blocked_unclassified: [],
        },
        snapshots: [{
          partitionId: TEST_PRIORITY_PARTITION_ID,
          publication: {
            concreteEligibleNodeIds: [
              TEST_NODE_ID.FIRST,
              TEST_NODE_ID.SECOND,
              TEST_NODE_ID.THIRD,
            ],
          },
        }, {
          partitionId: TEST_NON_PRIORITY_PARTITION_ID,
          blockerReasons: ['operation_created_but_no_step_transitions'],
          completion: {
            state: 'operation_stalled',
          },
          publication: {
            concreteEligibleNodeIds: [
              TEST_NODE_ID.FIRST,
              TEST_NODE_ID.SECOND,
              TEST_NODE_ID.THIRD,
            ],
          },
        }],
      },
    });

    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryProgressClassIds,
      [],
      'derived canonical evidence should retire non-priority workflow blockers from the current priority-recovery class summary',
    );
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoverySemanticStateIds,
      [],
      'derived canonical evidence should retire non-priority semantic blockers from the current priority-recovery summary',
    );
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryBlockedPartitionIds,
      [],
      'derived canonical evidence should not keep non-priority stalled partitions as current priority-recovery blockers',
    );
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionIdsBySemanticState
        .spread_satisfied_in_flight,
      [TEST_PRIORITY_PARTITION_ID],
      'the tracked priority partition should remain the canonical current semantic state',
    );
    t.same(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionIdsBySemanticState
        .operation_stalled,
      [],
      'non-priority partitions should be excluded from the canonical current semantic-state map',
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence preserves observation-only witness diagnostics when no independent canonical source exists',
  (t) => {
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      priorityRecoveryObservation: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        priorityRecoveryReasonCodes: [],
        prioritySpreadPending: false,
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
        priorityRecoveryProgressClassIds: [],
        priorityRecoveryProgressClassCount: 0,
        priorityRecoverySemanticStateIds: [],
        priorityRecoverySemanticStateCount: 0,
        priorityRecoveryBlockedPartitionIds: [],
        priorityRecoveryBlockedPartitionCount: 0,
        priorityRecoveryPartitionWitnesses: [{
          partitionId: TEST_PRIORITY_PARTITION_ID,
          semanticStateId: 'spread_satisfied_in_flight',
          completionState: 'converged',
          workflowState: 'remove_phase',
          visibilityState: 'cache_visible',
          operationIds: ['op-spread-satisfied-active'],
        }],
      },
    });

    t.equal(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionWitnesses
        .length,
      1,
      'observation-only witness lists should remain available as diagnostics instead of being erased by a gate derived from the same observation',
    );
    t.equal(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionWitnesses[0]
        ?.partitionId,
      TEST_PRIORITY_PARTITION_ID,
    );
    t.equal(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionWitnesses[0]
        ?.semanticStateId,
      'spread_satisfied_in_flight',
    );
    t.end();
  });

test('buildCanonicalPublicationRecoveryEvidence preserves witness diagnostics when publication convergence only mirrors the same ready observation',
  (t) => {
    const observation = {
      publicationEpoch: TEST_PUBLICATION_EPOCH,
      publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
      priorityRecoveryReasonCodes: [],
      prioritySpreadPending: false,
      priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      priorityRecoveryProgressClassIds: [],
      priorityRecoveryProgressClassCount: 0,
      priorityRecoverySemanticStateIds: [],
      priorityRecoverySemanticStateCount: 0,
      priorityRecoveryBlockedPartitionIds: [],
      priorityRecoveryBlockedPartitionCount: 0,
      priorityRecoveryPartitionWitnesses: [{
        partitionId: TEST_PRIORITY_PARTITION_ID,
        semanticStateId: 'spread_satisfied_in_flight',
        completionState: 'converged',
        workflowState: 'remove_phase',
        visibilityState: 'cache_visible',
        operationIds: ['op-spread-satisfied-active'],
      }],
    };
    const evidence = buildCanonicalPublicationRecoveryEvidence({
      publicationConvergence: {
        publicationEpoch: TEST_PUBLICATION_EPOCH,
        publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        recoveryProtocolState: RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED,
        pendingAckNodeIds: [],
        priorityRecoveryReasonCodes: [],
        priorityPartitionSummary: TEST_SATISFIED_PRIORITY_PARTITION_SUMMARY,
      },
      priorityRecoveryObservation: observation,
    });

    t.equal(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionWitnesses
        .length,
      1,
      'a publication-convergence projection of the same ready observation should not erase retained witness diagnostics',
    );
    t.equal(
      evidence.priorityRecoveryObservation.priorityRecoveryPartitionWitnesses[0]
        ?.partitionId,
      TEST_PRIORITY_PARTITION_ID,
    );
    t.end();
  });
