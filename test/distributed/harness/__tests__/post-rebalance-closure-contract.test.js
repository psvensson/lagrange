import assert from 'node:assert';
import {test} from '../../../../src/test-helpers/tap.js';
import {
  POST_REBALANCE_CLOSURE_DIMENSION,
  POST_REBALANCE_CLOSURE_REASON,
  POST_REBALANCE_CLOSURE_STATE,
  buildPostRebalanceClosureSnapshot,
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
const MEMBERSHIP_TRIM_OPEN_BLOCKER_ID = 'membership_trim_open';
const NO_OVER_TARGET_OPEN_BLOCKER_ID = 'no_over_target_open';
const MEMBERSHIP_TRIM_SOFT_CLOSED_ID = 'membership_trim_soft_closed';
const NO_OVER_TARGET_SOFT_CLOSED_ID = 'no_over_target_soft_closed';
const OPERATION_DRAIN_SOFT_CLOSED_ID = 'operation_drain_soft_closed';
const ACTIVE_NODE_IDS_THREE = Object.freeze([NODE_ONE, NODE_TWO, NODE_THREE]);
const ACTIVE_NODE_IDS_FIVE = Object.freeze([
  NODE_ONE,
  NODE_TWO,
  NODE_THREE,
  NODE_FOUR,
  NODE_FIVE,
]);
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
