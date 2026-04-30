import assert from 'node:assert';
import {test} from '../../../../src/test-helpers/tap.js';
import {
  POST_REBALANCE_CLOSURE_DIMENSION,
  POST_REBALANCE_CLOSURE_REASON,
  POST_REBALANCE_CLOSURE_STATE,
  buildPostRebalanceClosureSnapshot,
  countCacheVisibleSatisfiedPriorityRecoveryOperations,
} from '../post-rebalance-closure-contract.js';

const TARGET_VOTER_COUNT = 3;
const OVER_TARGET_VOTER_COUNT = 4;
const MAX_SUSTAINED_OVERTARGET_MS = 10000;
const DURABLE_OVERTARGET_MS = 121272;
const TRANSIENT_OVERTARGET_MS = 50;
const RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT = 1;
const EFFECTIVE_CLOSED_REPLICA_OPERATION_COUNT = 0;
const NO_REPLICA_OPERATION_COUNT = 0;
const PARTITION_ONE = 'control_plane_publications-p1';
const PARTITION_TWO = 'sql_transactions-p1';
const PARTITION_THREE = 'sql_write_operations-p1';
const NODE_ONE = 'node-1';
const NODE_TWO = 'node-2';
const NODE_THREE = 'node-3';
const NODE_FOUR = 'node-4';
const NODE_FIVE = 'node-5';
const LEADER_NODE_ID = NODE_ONE;
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const MEMBERSHIP_FREEZE_REASON_BROAD_SUSPICION = 'broad_suspicion';
const MEMBERSHIP_TRIM_OPEN_BLOCKER_ID = 'membership_trim_open';
const NO_OVER_TARGET_OPEN_BLOCKER_ID = 'no_over_target_open';
const MEMBERSHIP_TRIM_SOFT_CLOSED_ID = 'membership_trim_soft_closed';
const NO_OVER_TARGET_SOFT_CLOSED_ID = 'no_over_target_soft_closed';
const OPERATION_DRAIN_SOFT_CLOSED_ID = 'operation_drain_soft_closed';
const PUBLICATION_VISIBLE_OPEN_BLOCKER_ID = 'publication_visible_open';
const PUBLICATION_VISIBLE_SOFT_CLOSED_ID = 'publication_visible_soft_closed';
const CDC_PROJECTION_VISIBLE_OPEN_BLOCKER_ID = 'cdc_projection_visible_open';
const CDC_PROJECTION_VISIBLE_SOFT_CLOSED_ID =
  'cdc_projection_visible_soft_closed';
const PUBLICATION_STATUS_ACK_PENDING = 'ACK_PENDING';
const PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT =
  'spread_satisfied_in_flight';
const PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE = 'cache_visible';
const PRIORITY_RECOVERY_COMPLETION_STATE_CONVERGED = 'converged';
const CDC_PROJECTION_OWNER_OPERATION_ID_ONE =
  'op-cdc-projection-owner-one';
const CDC_PROJECTION_OWNER_OPERATION_ID_TWO =
  'op-cdc-projection-owner-two';
const ACTIVE_NODE_IDS_THREE = Object.freeze([NODE_ONE, NODE_TWO, NODE_THREE]);
const ACTIVE_NODE_IDS_FOUR = Object.freeze([
  NODE_ONE,
  NODE_TWO,
  NODE_THREE,
  NODE_FOUR,
]);
const ACTIVE_NODE_IDS_FIVE = Object.freeze([
  NODE_ONE,
  NODE_TWO,
  NODE_THREE,
  NODE_FOUR,
  NODE_FIVE,
]);
const EFFECTIVE_SOURCE_PUBLISHED_MEMBERSHIP = 'published_membership';
const PUBLICATION_VISIBILITY_SOURCE_PUBLISHED_MEMBERSHIP_OBSERVATION =
  'published_membership_observation';
const EXPECTED_PARTITION_IDS = Object.freeze([
  PARTITION_ONE,
  PARTITION_TWO,
  PARTITION_THREE,
]);
const OVER_TARGET_VOTER_COUNTS = Object.freeze({
  [PARTITION_ONE]: OVER_TARGET_VOTER_COUNT,
  [PARTITION_TWO]: OVER_TARGET_VOTER_COUNT,
  [PARTITION_THREE]: OVER_TARGET_VOTER_COUNT,
});
const OVER_TARGET_DURATIONS = Object.freeze({
  [PARTITION_ONE]: DURABLE_OVERTARGET_MS,
  [PARTITION_TWO]: DURABLE_OVERTARGET_MS,
  [PARTITION_THREE]: DURABLE_OVERTARGET_MS,
});
const STABLE_LEADERS = Object.freeze({
  [PARTITION_ONE]: LEADER_NODE_ID,
  [PARTITION_TWO]: LEADER_NODE_ID,
  [PARTITION_THREE]: LEADER_NODE_ID,
});
const PARTIAL_LEADERS = Object.freeze({
  [PARTITION_ONE]: LEADER_NODE_ID,
});
const TARGET_VOTER_COUNTS = Object.freeze({
  [PARTITION_ONE]: TARGET_VOTER_COUNT,
  [PARTITION_TWO]: TARGET_VOTER_COUNT,
  [PARTITION_THREE]: TARGET_VOTER_COUNT,
});
const OWNER_COVERED_MISSING_PARTITION_IDS = Object.freeze([
  PARTITION_TWO,
  PARTITION_THREE,
]);
const OWNER_UNCOVERED_MISSING_PARTITION_IDS = Object.freeze([PARTITION_THREE]);
const PARTITION_ONLY_PRIORITY_RECOVERY_OPERATION_COUNT = 1;

function buildCacheVisiblePriorityRecoverySnapshot(partitionId, operationId) {
  return {
    partitionId,
    operationId,
    semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
    observation: {
      visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
    },
    completion: {
      state: PRIORITY_RECOVERY_COMPLETION_STATE_CONVERGED,
    },
  };
}

test('post-rebalance closure classifies durable over-target trim debt after operation drain closes',
  async () => {
    const closure = buildPostRebalanceClosureSnapshot({
      expectedPartitionIds: EXPECTED_PARTITION_IDS,
      leaders: STABLE_LEADERS,
      voterCounts: OVER_TARGET_VOTER_COUNTS,
      overTargetDurations: OVER_TARGET_DURATIONS,
      maxOverTargetMs: DURABLE_OVERTARGET_MS,
      maxSustainedOverTargetMs: MAX_SUSTAINED_OVERTARGET_MS,
      targetVoterCount: TARGET_VOTER_COUNT,
      inFlightReplicaOperationCount: NO_REPLICA_OPERATION_COUNT,
      effectiveInFlightReplicaOperationCount:
        EFFECTIVE_CLOSED_REPLICA_OPERATION_COUNT,
      publishedActiveNodeIds: ACTIVE_NODE_IDS_FIVE,
      projectedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: ACTIVE_NODE_IDS_FIVE,
        },
        activeNodeViews: {
          projectedNodeIds: ACTIVE_NODE_IDS_THREE,
        },
      },
    });

    assert.strictEqual(closure.state, POST_REBALANCE_CLOSURE_STATE.OPEN);
    assert.strictEqual(
      closure.dimensions[POST_REBALANCE_CLOSURE_DIMENSION.OPERATION_DRAIN].state,
      POST_REBALANCE_CLOSURE_STATE.CLOSED,
    );
    assert.strictEqual(
      closure.dimensions[POST_REBALANCE_CLOSURE_DIMENSION.PUBLICATION_VISIBLE].state,
      POST_REBALANCE_CLOSURE_STATE.CLOSED,
    );
    assert.strictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.CDC_PROJECTION_VISIBLE
      ].state,
      POST_REBALANCE_CLOSURE_STATE.CLOSED,
    );
    assert.deepStrictEqual(
      closure.blockers.map((blocker) => blocker.id).sort(),
      [
        MEMBERSHIP_TRIM_OPEN_BLOCKER_ID,
        NO_OVER_TARGET_OPEN_BLOCKER_ID,
      ],
    );
    assert.deepStrictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.MEMBERSHIP_TRIM
      ].reasonCodes,
      [POST_REBALANCE_CLOSURE_REASON.PUBLISHED_MEMBERSHIP_TRIM_DEBT],
    );
    assert.deepStrictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.NO_OVER_TARGET
      ].reasonCodes,
      [POST_REBALANCE_CLOSURE_REASON.OVERTARGET_BUDGET_EXCEEDED],
    );
  });

test('post-rebalance closure does not classify retained published members as trim debt during membership freeze',
  async () => {
    const closure = buildPostRebalanceClosureSnapshot({
      expectedPartitionIds: [PARTITION_ONE],
      leaders: {[PARTITION_ONE]: LEADER_NODE_ID},
      voterCounts: {[PARTITION_ONE]: OVER_TARGET_VOTER_COUNT},
      overTargetDurations: {[PARTITION_ONE]: DURABLE_OVERTARGET_MS},
      maxOverTargetMs: DURABLE_OVERTARGET_MS,
      maxSustainedOverTargetMs: MAX_SUSTAINED_OVERTARGET_MS,
      targetVoterCount: TARGET_VOTER_COUNT,
      inFlightReplicaOperationCount: RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
      effectiveInFlightReplicaOperationCount:
        EFFECTIVE_CLOSED_REPLICA_OPERATION_COUNT,
      staleInFlightReplicaOperationCount:
        RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
      ignoreStaleInFlightReplicaOperations: true,
      publishedActiveNodeIds: ACTIVE_NODE_IDS_FIVE,
      projectedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: ACTIVE_NODE_IDS_FIVE,
        },
        activeNodeViews: {
          projectedNodeIds: ACTIVE_NODE_IDS_THREE,
          membershipFreeze: {
            active: true,
            reasonCode: MEMBERSHIP_FREEZE_REASON_BROAD_SUSPICION,
            retainedPublishedNodeIds: ACTIVE_NODE_IDS_FIVE,
          },
        },
      },
    });

    assert.strictEqual(
      closure.state,
      POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
    );
    assert.deepStrictEqual(closure.blockers, []);
    assert.deepStrictEqual(
      closure.softClosures.map((softClosure) => softClosure.id).sort(),
      [
        MEMBERSHIP_TRIM_SOFT_CLOSED_ID,
        NO_OVER_TARGET_SOFT_CLOSED_ID,
        OPERATION_DRAIN_SOFT_CLOSED_ID,
      ],
    );
  });

test('post-rebalance closure soft-closes a frozen speculative publication when published membership remains effective',
  async () => {
    const closure = buildPostRebalanceClosureSnapshot({
      expectedPartitionIds: [PARTITION_ONE],
      leaders: {[PARTITION_ONE]: LEADER_NODE_ID},
      voterCounts: {[PARTITION_ONE]: OVER_TARGET_VOTER_COUNT},
      overTargetDurations: {[PARTITION_ONE]: TRANSIENT_OVERTARGET_MS},
      maxOverTargetMs: TRANSIENT_OVERTARGET_MS,
      maxSustainedOverTargetMs: MAX_SUSTAINED_OVERTARGET_MS,
      targetVoterCount: TARGET_VOTER_COUNT,
      inFlightReplicaOperationCount: RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
      effectiveInFlightReplicaOperationCount:
        EFFECTIVE_CLOSED_REPLICA_OPERATION_COUNT,
      staleInFlightReplicaOperationCount:
        RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
      ignoreStaleInFlightReplicaOperations: true,
      publishedActiveNodeIds: ACTIVE_NODE_IDS_FIVE,
      projectedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
          publishedActiveNodeIds: ACTIVE_NODE_IDS_FIVE,
          pendingAckNodeIds: [NODE_FIVE],
        },
        publishedMembershipObservation: {
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: ACTIVE_NODE_IDS_FOUR,
          pendingAckNodeIds: [],
        },
        activeNodeViews: {
          effectiveSource: EFFECTIVE_SOURCE_PUBLISHED_MEMBERSHIP,
          publishedMembershipAvailable: true,
          publishedNodeIds: ACTIVE_NODE_IDS_FOUR,
          projectedNodeIds: ACTIVE_NODE_IDS_THREE,
          membershipFreeze: {
            active: true,
            reasonCode: MEMBERSHIP_FREEZE_REASON_BROAD_SUSPICION,
            retainedPublishedNodeIds: ACTIVE_NODE_IDS_FOUR,
          },
        },
      },
    });

    assert.strictEqual(
      closure.state,
      POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
    );
    assert.ok(
      !closure.blockers.some(
        (blocker) => blocker.id === PUBLICATION_VISIBLE_OPEN_BLOCKER_ID,
      ),
    );
    assert.strictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.PUBLICATION_VISIBLE
      ].state,
      POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
    );
    assert.deepStrictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.PUBLICATION_VISIBLE
      ].reasonCodes,
      [
        POST_REBALANCE_CLOSURE_REASON
          .EFFECTIVE_PUBLISHED_MEMBERSHIP_DURING_FREEZE,
      ],
    );
    assert.strictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.PUBLICATION_VISIBLE
      ].evidence.publicationStatus,
      PUBLICATION_STATUS_PUBLISHED,
    );
    assert.strictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.PUBLICATION_VISIBLE
      ].evidence.rawPublicationStatus,
      PUBLICATION_STATUS_ACK_PENDING,
    );
    assert.strictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.PUBLICATION_VISIBLE
      ].evidence.publicationVisibilitySource,
      PUBLICATION_VISIBILITY_SOURCE_PUBLISHED_MEMBERSHIP_OBSERVATION,
    );
    assert.ok(
      closure.softClosures.some(
        (softClosure) => softClosure.id === PUBLICATION_VISIBLE_SOFT_CLOSED_ID,
      ),
    );
  });

test('post-rebalance closure keeps ack-pending publication open without an effective frozen published membership',
  async () => {
    const closure = buildPostRebalanceClosureSnapshot({
      expectedPartitionIds: [PARTITION_ONE],
      leaders: {[PARTITION_ONE]: LEADER_NODE_ID},
      voterCounts: {[PARTITION_ONE]: TARGET_VOTER_COUNT},
      overTargetDurations: {},
      maxOverTargetMs: TRANSIENT_OVERTARGET_MS,
      maxSustainedOverTargetMs: MAX_SUSTAINED_OVERTARGET_MS,
      targetVoterCount: TARGET_VOTER_COUNT,
      inFlightReplicaOperationCount: NO_REPLICA_OPERATION_COUNT,
      effectiveInFlightReplicaOperationCount:
        EFFECTIVE_CLOSED_REPLICA_OPERATION_COUNT,
      publishedActiveNodeIds: ACTIVE_NODE_IDS_FIVE,
      projectedActiveNodeIds: ACTIVE_NODE_IDS_FIVE,
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationStatus: PUBLICATION_STATUS_ACK_PENDING,
          publishedActiveNodeIds: ACTIVE_NODE_IDS_FIVE,
          pendingAckNodeIds: [NODE_FIVE],
        },
        activeNodeViews: {
          projectedNodeIds: ACTIVE_NODE_IDS_FIVE,
        },
      },
    });

    assert.strictEqual(closure.state, POST_REBALANCE_CLOSURE_STATE.OPEN);
    assert.deepStrictEqual(
      closure.blockers.map((blocker) => blocker.id),
      [PUBLICATION_VISIBLE_OPEN_BLOCKER_ID],
    );
    assert.deepStrictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.PUBLICATION_VISIBLE
      ].reasonCodes,
      [POST_REBALANCE_CLOSURE_REASON.PUBLICATION_PENDING],
    );
  });

test('post-rebalance closure preserves stale-operation soft closure semantics',
  async () => {
    const closure = buildPostRebalanceClosureSnapshot({
      expectedPartitionIds: [PARTITION_ONE],
      leaders: {[PARTITION_ONE]: LEADER_NODE_ID},
      voterCounts: {[PARTITION_ONE]: OVER_TARGET_VOTER_COUNT},
      overTargetDurations: {[PARTITION_ONE]: TRANSIENT_OVERTARGET_MS},
      maxOverTargetMs: TRANSIENT_OVERTARGET_MS,
      maxSustainedOverTargetMs: MAX_SUSTAINED_OVERTARGET_MS,
      targetVoterCount: TARGET_VOTER_COUNT,
      inFlightReplicaOperationCount: RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
      effectiveInFlightReplicaOperationCount:
        EFFECTIVE_CLOSED_REPLICA_OPERATION_COUNT,
      staleInFlightReplicaOperationCount:
        RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
      ignoreStaleInFlightReplicaOperations: true,
      publishedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
      projectedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
        },
      },
    });

    assert.strictEqual(
      closure.state,
      POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
    );
    assert.deepStrictEqual(closure.blockers, []);
    assert.deepStrictEqual(
      closure.softClosures.map((softClosure) => softClosure.id).sort(),
      [
        MEMBERSHIP_TRIM_SOFT_CLOSED_ID,
        NO_OVER_TARGET_SOFT_CLOSED_ID,
        OPERATION_DRAIN_SOFT_CLOSED_ID,
      ],
    );
  });

test('post-rebalance closure soft-closes CDC projection leader gaps covered by priority recovery owner evidence',
  async () => {
    const closure = buildPostRebalanceClosureSnapshot({
      expectedPartitionIds: EXPECTED_PARTITION_IDS,
      leaders: PARTIAL_LEADERS,
      voterCounts: TARGET_VOTER_COUNTS,
      overTargetDurations: {},
      maxOverTargetMs: TRANSIENT_OVERTARGET_MS,
      maxSustainedOverTargetMs: MAX_SUSTAINED_OVERTARGET_MS,
      targetVoterCount: TARGET_VOTER_COUNT,
      inFlightReplicaOperationCount: RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
      effectiveInFlightReplicaOperationCount:
        EFFECTIVE_CLOSED_REPLICA_OPERATION_COUNT,
      staleInFlightReplicaOperationCount:
        RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
      ignoreStaleInFlightReplicaOperations: true,
      publishedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
      projectedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
        },
        priorityRecoveryDecisionSnapshots: {
          snapshots: [
            buildCacheVisiblePriorityRecoverySnapshot(
              PARTITION_TWO,
              CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
            ),
            buildCacheVisiblePriorityRecoverySnapshot(
              PARTITION_THREE,
              CDC_PROJECTION_OWNER_OPERATION_ID_TWO,
            ),
          ],
        },
      },
    });

    assert.strictEqual(
      closure.state,
      POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
    );
    assert.ok(
      !closure.blockers.some(
        (blocker) => blocker.id === CDC_PROJECTION_VISIBLE_OPEN_BLOCKER_ID,
      ),
    );
    assert.ok(
      closure.softClosures.some(
        (softClosure) =>
          softClosure.id === CDC_PROJECTION_VISIBLE_SOFT_CLOSED_ID,
      ),
    );
    assert.strictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.CDC_PROJECTION_VISIBLE
      ].state,
      POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
    );
    assert.deepStrictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.CDC_PROJECTION_VISIBLE
      ].reasonCodes,
      [POST_REBALANCE_CLOSURE_REASON.IGNORED_STALE_REPLICA_OPERATIONS],
    );
    assert.deepStrictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.CDC_PROJECTION_VISIBLE
      ].evidence.coveredMissingLeaderPartitionIds,
      OWNER_COVERED_MISSING_PARTITION_IDS,
    );
    assert.deepStrictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.CDC_PROJECTION_VISIBLE
      ].evidence.uncoveredMissingLeaderPartitionIds,
      [],
    );
  });

test('post-rebalance closure ignores historical satisfied priority recovery states',
  async () => {
    const closure = buildPostRebalanceClosureSnapshot({
      expectedPartitionIds: [PARTITION_ONE, PARTITION_TWO],
      leaders: {[PARTITION_ONE]: LEADER_NODE_ID},
      voterCounts: {
        [PARTITION_ONE]: TARGET_VOTER_COUNT,
        [PARTITION_TWO]: TARGET_VOTER_COUNT,
      },
      overTargetDurations: {},
      maxOverTargetMs: TRANSIENT_OVERTARGET_MS,
      maxSustainedOverTargetMs: MAX_SUSTAINED_OVERTARGET_MS,
      targetVoterCount: TARGET_VOTER_COUNT,
      inFlightReplicaOperationCount: RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
      effectiveInFlightReplicaOperationCount:
        EFFECTIVE_CLOSED_REPLICA_OPERATION_COUNT,
      ignoreStaleInFlightReplicaOperations: true,
      publishedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
      projectedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
          priorityRecoveryPartitionSemanticStateHistory: [{
            partitionId: PARTITION_TWO,
            semanticStateIds: [
              PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
            ],
          }],
        },
      },
    });

    assert.strictEqual(closure.state, POST_REBALANCE_CLOSURE_STATE.OPEN);
    assert.deepStrictEqual(
      closure.blockers.map((blocker) => blocker.id),
      [CDC_PROJECTION_VISIBLE_OPEN_BLOCKER_ID],
    );
    assert.deepStrictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.CDC_PROJECTION_VISIBLE
      ].evidence.coveredMissingLeaderPartitionIds,
      [],
    );
    assert.deepStrictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.CDC_PROJECTION_VISIBLE
      ].evidence.uncoveredMissingLeaderPartitionIds,
      [PARTITION_TWO],
    );
  });

test('post-rebalance closure counts partition-only priority recovery evidence',
  async () => {
    assert.strictEqual(
      countCacheVisibleSatisfiedPriorityRecoveryOperations(
        {
          publicationConvergence: {
            priorityRecoveryPartitionIdsBySemanticState: {
              [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [
                PARTITION_TWO,
              ],
            },
          },
        },
        [],
      ),
      PARTITION_ONLY_PRIORITY_RECOVERY_OPERATION_COUNT,
    );
  });

test('post-rebalance closure keeps CDC projection leader gaps open without full owner coverage',
  async () => {
    const closure = buildPostRebalanceClosureSnapshot({
      expectedPartitionIds: EXPECTED_PARTITION_IDS,
      leaders: PARTIAL_LEADERS,
      voterCounts: TARGET_VOTER_COUNTS,
      overTargetDurations: {},
      maxOverTargetMs: TRANSIENT_OVERTARGET_MS,
      maxSustainedOverTargetMs: MAX_SUSTAINED_OVERTARGET_MS,
      targetVoterCount: TARGET_VOTER_COUNT,
      inFlightReplicaOperationCount: RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
      effectiveInFlightReplicaOperationCount:
        EFFECTIVE_CLOSED_REPLICA_OPERATION_COUNT,
      staleInFlightReplicaOperationCount:
        RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
      ignoreStaleInFlightReplicaOperations: true,
      publishedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
      projectedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
        },
        priorityRecoveryDecisionSnapshots: {
          snapshots: [
            buildCacheVisiblePriorityRecoverySnapshot(
              PARTITION_TWO,
              CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
            ),
          ],
        },
      },
    });

    assert.strictEqual(closure.state, POST_REBALANCE_CLOSURE_STATE.OPEN);
    assert.deepStrictEqual(
      closure.blockers.map((blocker) => blocker.id),
      [CDC_PROJECTION_VISIBLE_OPEN_BLOCKER_ID],
    );
    assert.deepStrictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.CDC_PROJECTION_VISIBLE
      ].reasonCodes,
      [POST_REBALANCE_CLOSURE_REASON.MISSING_PARTITION_LEADERS],
    );
    assert.deepStrictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.CDC_PROJECTION_VISIBLE
      ].evidence.uncoveredMissingLeaderPartitionIds,
      OWNER_UNCOVERED_MISSING_PARTITION_IDS,
    );
  });
