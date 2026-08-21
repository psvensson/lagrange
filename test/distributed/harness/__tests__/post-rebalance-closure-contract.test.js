import assert from 'node:assert';
import {test} from '../../../../src/test-helpers/tap.js';
import {
  POST_REBALANCE_CLOSURE_DIMENSION,
  POST_REBALANCE_CLOSURE_REASON,
  POST_REBALANCE_CLOSURE_STATE,
  buildPostRebalanceClosureSnapshot,
  countAdditionalPostRebalanceReplicaOperationDiscounts,
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
const RUN15_IN_FLIGHT_REPLICA_OPERATION_COUNT = 6;
const RUN15_STALE_IN_FLIGHT_REPLICA_OPERATION_COUNT = 3;
const RUN15_EFFECTIVE_IN_FLIGHT_REPLICA_OPERATION_COUNT = 2;
const RUN15_ADDITIONAL_IN_FLIGHT_DISCOUNT_COUNT = 1;
const RUN15_MAX_OVERTARGET_MS = 59240;
const RUN15_SECONDARY_OVERTARGET_MS = 16543;
const RUN15_MAX_SUSTAINED_OVERTARGET_MS = 120000;
const PARTITION_ONE = 'control_plane_publications-p1';
const PARTITION_TWO = 'sql_transactions-p1';
const PARTITION_THREE = 'sql_write_operations-p1';
const RUN15_OVERTARGET_PARTITION_ONE = 'module_dependency_locks-p1';
const RUN15_OVERTARGET_PARTITION_TWO = 'wasm_operations-p1';
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
const OPERATION_DRAIN_OPEN_BLOCKER_ID = 'operation_drain_open';
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
const PRIORITY_RECOVERY_VISIBILITY_STATE_UNAVAILABLE = 'unavailable';
const PRIORITY_RECOVERY_COMPLETION_STATE_CONVERGED = 'converged';
const CDC_PROJECTION_OWNER_OPERATION_ID_ONE =
  'op-cdc-projection-owner-one';
const CDC_PROJECTION_OWNER_OPERATION_ID_TWO =
  'op-cdc-projection-owner-two';
const PRIORITY_RECOVERY_WORKFLOW_STATE_REMOVE_PHASE = 'remove_phase';
const PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT = 'in_flight';
const PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE_TERMINAL = 'terminal';
const PRIORITY_RECOVERY_CLOSURE_STATE_SATISFIED_FRESH =
  'closure_satisfied_fresh';
const PRIORITY_RECOVERY_OPERATION_STATUS_FAILED = 'failed';
const PRIORITY_RECOVERY_OPERATION_STATUS_ACTIVE = 'active';
const PRIORITY_RECOVERY_WORKFLOW_STEP_FAILED = 'FAILED';
const PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE = 'ACTIVE';
const PRIORITY_RECOVERY_STATE_TERMINAL_FAILED = 'terminal_failed';
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
const RUN15_OVERTARGET_DURATIONS = Object.freeze({
  [RUN15_OVERTARGET_PARTITION_ONE]: RUN15_MAX_OVERTARGET_MS,
  [RUN15_OVERTARGET_PARTITION_TWO]: RUN15_SECONDARY_OVERTARGET_MS,
});
const OWNER_COVERED_MISSING_PARTITION_IDS = Object.freeze([
  PARTITION_TWO,
  PARTITION_THREE,
]);
const OWNER_UNCOVERED_MISSING_PARTITION_IDS = Object.freeze([PARTITION_THREE]);
const PARTITION_ONLY_PRIORITY_RECOVERY_OPERATION_COUNT = 1;

function buildCacheVisiblePriorityRecoverySnapshot(
  partitionId,
  operationId,
  overrides = {},
) {
  return {
    partitionId,
    operationId,
    semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
    observation: {
      visibilityState: PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE,
      ...(overrides.observation || {}),
    },
    completion: {
      state: PRIORITY_RECOVERY_COMPLETION_STATE_CONVERGED,
      ...(overrides.completion || {}),
    },
    ...overrides,
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
          projectedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
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

test('post-rebalance closure keeps run15 effective in-flight operation drain open',
  async () => {
    const closure = buildPostRebalanceClosureSnapshot({
      expectedPartitionIds: EXPECTED_PARTITION_IDS,
      leaders: STABLE_LEADERS,
      voterCounts: TARGET_VOTER_COUNTS,
      overTargetDurations: RUN15_OVERTARGET_DURATIONS,
      maxOverTargetMs: RUN15_MAX_OVERTARGET_MS,
      maxSustainedOverTargetMs: RUN15_MAX_SUSTAINED_OVERTARGET_MS,
      targetVoterCount: TARGET_VOTER_COUNT,
      inFlightReplicaOperationCount:
        RUN15_IN_FLIGHT_REPLICA_OPERATION_COUNT,
      staleInFlightReplicaOperationCount:
        RUN15_STALE_IN_FLIGHT_REPLICA_OPERATION_COUNT,
      additionalInFlightDiscountCount:
        RUN15_ADDITIONAL_IN_FLIGHT_DISCOUNT_COUNT,
      effectiveInFlightReplicaOperationCount:
        RUN15_EFFECTIVE_IN_FLIGHT_REPLICA_OPERATION_COUNT,
      ignoreStaleInFlightReplicaOperations: true,
      publishedActiveNodeIds: ACTIVE_NODE_IDS_FIVE,
      projectedActiveNodeIds: ACTIVE_NODE_IDS_FIVE,
      controlPlaneDiagnostics: {
        publicationConvergence: {
          publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          publishedActiveNodeIds: ACTIVE_NODE_IDS_FIVE,
        },
        activeNodeViews: {
          projectedActiveNodeIds: ACTIVE_NODE_IDS_FIVE,
        },
      },
    });
    const operationDrain =
      closure.dimensions[POST_REBALANCE_CLOSURE_DIMENSION.OPERATION_DRAIN];

    assert.strictEqual(closure.state, POST_REBALANCE_CLOSURE_STATE.OPEN);
    assert.deepStrictEqual(
      closure.blockers.map((blocker) => blocker.id).sort(),
      [
        NO_OVER_TARGET_OPEN_BLOCKER_ID,
        OPERATION_DRAIN_OPEN_BLOCKER_ID,
      ],
    );
    assert.strictEqual(
      operationDrain.state,
      POST_REBALANCE_CLOSURE_STATE.OPEN,
    );
    assert.deepStrictEqual(
      operationDrain.reasonCodes,
      [POST_REBALANCE_CLOSURE_REASON.IN_FLIGHT_REPLICA_OPERATIONS],
    );
    assert.strictEqual(
      operationDrain.evidence.inFlightReplicaOperationCount,
      RUN15_IN_FLIGHT_REPLICA_OPERATION_COUNT,
    );
    assert.strictEqual(
      operationDrain.evidence.staleInFlightReplicaOperationCount,
      RUN15_STALE_IN_FLIGHT_REPLICA_OPERATION_COUNT,
    );
    assert.strictEqual(
      operationDrain.evidence.additionalInFlightDiscountCount,
      RUN15_ADDITIONAL_IN_FLIGHT_DISCOUNT_COUNT,
    );
    assert.strictEqual(
      operationDrain.evidence.staleDiscountCount,
      RUN15_STALE_IN_FLIGHT_REPLICA_OPERATION_COUNT +
        RUN15_ADDITIONAL_IN_FLIGHT_DISCOUNT_COUNT,
    );
    assert.strictEqual(
      operationDrain.evidence.effectiveInFlightReplicaOperationCount,
      RUN15_EFFECTIVE_IN_FLIGHT_REPLICA_OPERATION_COUNT,
    );
    assert.strictEqual(
      operationDrain.evidence.publicationVisibilityState,
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
    assert.strictEqual(
      closure.dimensions[POST_REBALANCE_CLOSURE_DIMENSION.MEMBERSHIP_TRIM].state,
      POST_REBALANCE_CLOSURE_STATE.UNAVAILABLE,
    );
    assert.deepStrictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.MEMBERSHIP_TRIM
      ].reasonCodes,
      [
        POST_REBALANCE_CLOSURE_REASON
          .MEMBERSHIP_TRIM_BLOCKED_BY_OPERATION_DRAIN,
      ],
    );
    assert.deepStrictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.NO_OVER_TARGET
      ].reasonCodes,
      [POST_REBALANCE_CLOSURE_REASON.CURRENT_OVERTARGET_VOTERS],
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
          projectedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
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
          publishedActiveNodeIds: ACTIVE_NODE_IDS_FOUR,
          projectedActiveNodeIds: ACTIVE_NODE_IDS_THREE,
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
          projectedActiveNodeIds: ACTIVE_NODE_IDS_FIVE,
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

test('post-rebalance closure does not discount active failed priority recovery workflow evidence',
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
          priorityRecoveryDecisionSnapshots: {
            snapshots: [
              buildCacheVisiblePriorityRecoverySnapshot(
                PARTITION_TWO,
                CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
                {
                  workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
                  latestOperationWorkflowStep:
                    PRIORITY_RECOVERY_WORKFLOW_STEP_FAILED,
                  latestOperationStatus:
                    PRIORITY_RECOVERY_OPERATION_STATUS_FAILED,
                },
              ),
            ],
          },
        },
        [{
          operation_id: CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
          partition_id: PARTITION_TWO,
          status: 'creating',
          workflow_step: 'CREATING',
        }],
      ),
      NO_REPLICA_OPERATION_COUNT,
    );
  });

test('post-rebalance closure discounts terminal cache-visible priority recovery workflow evidence',
  async () => {
    assert.strictEqual(
      countCacheVisibleSatisfiedPriorityRecoveryOperations(
        {
          priorityRecoveryDecisionSnapshots: {
            snapshots: [
              buildCacheVisiblePriorityRecoverySnapshot(
                PARTITION_TWO,
                CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
                {
                  workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_REMOVE_PHASE,
                  workflowProgressPhaseId:
                    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE_TERMINAL,
                  latestOperationWorkflowStep:
                    PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
                  latestOperationStatus:
                    PRIORITY_RECOVERY_OPERATION_STATUS_ACTIVE,
                },
              ),
            ],
          },
        },
        [{
          operation_id: CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
          partition_id: PARTITION_TWO,
          status: PRIORITY_RECOVERY_OPERATION_STATUS_ACTIVE,
          workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
        }],
      ),
      RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
    );
  });

test('post-rebalance closure does not discount terminal priority recovery workflow before cache visibility',
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
          priorityRecoveryDecisionSnapshots: {
            snapshots: [
              buildCacheVisiblePriorityRecoverySnapshot(
                PARTITION_TWO,
                CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
                {
                  workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_REMOVE_PHASE,
                  workflowProgressPhaseId:
                    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE_TERMINAL,
                  latestOperationWorkflowStep:
                    PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
                  latestOperationStatus:
                    PRIORITY_RECOVERY_OPERATION_STATUS_ACTIVE,
                  observation: {
                    visibilityState:
                      PRIORITY_RECOVERY_VISIBILITY_STATE_UNAVAILABLE,
                  },
                },
              ),
            ],
          },
        },
        [{
          operation_id: CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
          partition_id: PARTITION_TWO,
          status: PRIORITY_RECOVERY_OPERATION_STATUS_ACTIVE,
          workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
        }],
      ),
      NO_REPLICA_OPERATION_COUNT,
    );
  });

test('post-rebalance closure keeps failed terminal priority recovery carriers open',
  async () => {
    const failureCarrierOverrides = [
      {conditions: {latestOperationStatus: PRIORITY_RECOVERY_OPERATION_STATUS_FAILED}},
      {actuationState: PRIORITY_RECOVERY_STATE_TERMINAL_FAILED},
      {topologyOperatorWitness: {
        currentStepState: PRIORITY_RECOVERY_STATE_TERMINAL_FAILED,
      }},
    ];

    for (const overrides of failureCarrierOverrides) {
      assert.strictEqual(
        countCacheVisibleSatisfiedPriorityRecoveryOperations(
          {
            priorityRecoveryDecisionSnapshots: {
              snapshots: [
                buildCacheVisiblePriorityRecoverySnapshot(
                  PARTITION_TWO,
                  CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
                  {
                    workflowState:
                      PRIORITY_RECOVERY_WORKFLOW_STATE_REMOVE_PHASE,
                    workflowProgressPhaseId:
                      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE_TERMINAL,
                    latestOperationWorkflowStep:
                      PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
                    latestOperationStatus:
                      PRIORITY_RECOVERY_OPERATION_STATUS_ACTIVE,
                    ...overrides,
                  },
                ),
              ],
            },
          },
          [{
            operation_id: CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
            partition_id: PARTITION_TWO,
            status: PRIORITY_RECOVERY_OPERATION_STATUS_ACTIVE,
            workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
          }],
        ),
        NO_REPLICA_OPERATION_COUNT,
      );
    }
  });

test('post-rebalance closure counts additional post-publication topology operation discounts',
  async () => {
    assert.strictEqual(
      countAdditionalPostRebalanceReplicaOperationDiscounts(
        {
          publicationConvergence: {
            publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          },
        },
        [{
          operation_id: 'message-groups-replace',
          type: 'REPLACE',
          partition_id: 'message_groups-p1',
          entity_type: 'partition',
          entity_id: 'message_groups-p1',
          replica_id: 'message_groups-p1-r4',
          source_node_id: NODE_ONE,
          target_node_id: NODE_TWO,
          status: 'pending',
          workflow_step: 'PENDING',
          updated_at: 900,
        }],
        {
          nowMs: 1000,
          allowPostPublicationNonBlockingReplicaOperations: true,
          cdcProjectionVisibleSatisfied: true,
          criticalSystemTopologyReady: true,
        },
      ),
      RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
    );
  });

test('post-rebalance closure counts post-publication discounts when priority summary is satisfied',
  async () => {
    assert.strictEqual(
      countAdditionalPostRebalanceReplicaOperationDiscounts(
        {
          publicationConvergence: {
            publicationStatus: PUBLICATION_STATUS_PUBLISHED,
            priorityPartitionSummary: {
              satisfied: true,
              missingPartitionIds: [],
              blockedPartitions: [],
              blockedPartitionCount: NO_REPLICA_OPERATION_COUNT,
            },
          },
          priorityRecoveryDecisionSnapshots: {
            snapshots: [{
              partitionId: PARTITION_TWO,
              semanticState:
                PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
              workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
            }],
          },
        },
        [{
          operation_id: 'message-group-replace',
          type: 'REPLACE',
          partition_id: 'mg-node-1',
          entity_type: 'message_group',
          entity_id: 'mg-node-1',
          replica_id: 'mg-node-1-r4',
          source_node_id: NODE_ONE,
          target_node_id: NODE_TWO,
          status: 'pending',
          workflow_step: 'PENDING',
          updated_at: 900,
        }],
        {
          nowMs: 1000,
          allowPostPublicationNonBlockingReplicaOperations: true,
          cdcProjectionVisibleSatisfied: true,
          criticalSystemTopologyReady: true,
        },
      ),
      RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
    );
  });

test('post-rebalance closure keeps sparse priority snapshots blocking without satisfied summary',
  async () => {
    assert.strictEqual(
      countAdditionalPostRebalanceReplicaOperationDiscounts(
        {
          publicationConvergence: {
            publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          },
          priorityRecoveryDecisionSnapshots: {
            snapshots: [{
              partitionId: PARTITION_TWO,
              semanticState:
                PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
              workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
            }],
          },
        },
        [{
          operation_id: 'message-group-replace',
          type: 'REPLACE',
          partition_id: 'mg-node-1',
          entity_type: 'message_group',
          entity_id: 'mg-node-1',
          replica_id: 'mg-node-1-r4',
          source_node_id: NODE_ONE,
          target_node_id: NODE_TWO,
          status: 'pending',
          workflow_step: 'PENDING',
          updated_at: 900,
        }],
        {
          nowMs: 1000,
          allowPostPublicationNonBlockingReplicaOperations: true,
          cdcProjectionVisibleSatisfied: true,
          criticalSystemTopologyReady: true,
        },
      ),
      NO_REPLICA_OPERATION_COUNT,
    );
  });

test('post-rebalance closure does not count post-publication topology discounts without explicit PUBLISHED',
  async () => {
    assert.strictEqual(
      countAdditionalPostRebalanceReplicaOperationDiscounts(
        {
          publicationConvergence: {},
        },
        [{
          operation_id: 'message-groups-replace',
          type: 'REPLACE',
          partition_id: 'message_groups-p1',
          entity_type: 'partition',
          entity_id: 'message_groups-p1',
          replica_id: 'message_groups-p1-r4',
          source_node_id: NODE_ONE,
          target_node_id: NODE_TWO,
          status: 'pending',
          workflow_step: 'PENDING',
          updated_at: 900,
        }],
        {
          nowMs: 1000,
          allowPostPublicationNonBlockingReplicaOperations: true,
          cdcProjectionVisibleSatisfied: true,
          criticalSystemTopologyReady: true,
        },
      ),
      NO_REPLICA_OPERATION_COUNT,
    );
  });

test('post-rebalance closure does not count topology discounts with priority recovery residuals',
  async () => {
    assert.strictEqual(
      countAdditionalPostRebalanceReplicaOperationDiscounts(
        {
          publicationConvergence: {
            publicationStatus: PUBLICATION_STATUS_PUBLISHED,
            priorityPartitionSummary: {
              satisfied: false,
              missingPartitionIds: [PARTITION_TWO],
              blockedPartitions: [{partitionId: PARTITION_TWO}],
              blockedPartitionCount: RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
            },
          },
        },
        [{
          operation_id: 'message-groups-replace',
          type: 'REPLACE',
          partition_id: 'message_groups-p1',
          entity_type: 'partition',
          entity_id: 'message_groups-p1',
          replica_id: 'message_groups-p1-r4',
          source_node_id: NODE_ONE,
          target_node_id: NODE_TWO,
          status: 'pending',
          workflow_step: 'PENDING',
          updated_at: 900,
        }],
        {
          nowMs: 1000,
          allowPostPublicationNonBlockingReplicaOperations: true,
          cdcProjectionVisibleSatisfied: true,
          criticalSystemTopologyReady: true,
        },
      ),
      NO_REPLICA_OPERATION_COUNT,
    );
  });

test('post-rebalance closure does not count post-publication topology discounts before safety is enabled',
  async () => {
    assert.strictEqual(
      countAdditionalPostRebalanceReplicaOperationDiscounts(
        {
          publicationConvergence: {
            publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          },
        },
        [{
          operation_id: 'message-groups-replace',
          type: 'REPLACE',
          partition_id: 'message_groups-p1',
          entity_type: 'partition',
          entity_id: 'message_groups-p1',
          replica_id: 'message_groups-p1-r4',
          source_node_id: NODE_ONE,
          target_node_id: NODE_TWO,
          status: 'pending',
          workflow_step: 'PENDING',
          updated_at: 900,
        }],
        {
          nowMs: 1000,
          allowPostPublicationNonBlockingReplicaOperations: false,
        },
      ),
      NO_REPLICA_OPERATION_COUNT,
    );
  });

test('post-rebalance closure does not count active priority recovery as an ordinary topology discount',
  async () => {
    assert.strictEqual(
      countAdditionalPostRebalanceReplicaOperationDiscounts(
        {
          publicationConvergence: {
            publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          },
          priorityRecoveryDecisionSnapshots: {
            snapshots: [
              buildCacheVisiblePriorityRecoverySnapshot(
                PARTITION_ONE,
                CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
                {
                  workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
                },
              ),
            ],
          },
        },
        [{
          operation_id: CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
          type: 'REPLACE',
          partition_id: PARTITION_ONE,
          entity_type: 'partition',
          entity_id: PARTITION_ONE,
          replica_id: 'control_plane_publications-p1-r4',
          source_node_id: NODE_ONE,
          target_node_id: NODE_TWO,
          status: 'pending',
          workflow_step: 'PENDING',
          updated_at: 900,
        }],
        {
          nowMs: 1000,
          allowPostPublicationNonBlockingReplicaOperations: true,
          cdcProjectionVisibleSatisfied: true,
          criticalSystemTopologyReady: true,
        },
      ),
      NO_REPLICA_OPERATION_COUNT,
    );
  });

test('post-rebalance closure does not count summary-only active priority rows without fresh closure witness',
  async () => {
    const activePriorityRow = {
      operation_id: CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
      type: 'REPLACE',
      partition_id: PARTITION_ONE,
      entity_type: 'partition',
      entity_id: PARTITION_ONE,
      replica_id: 'control_plane_publications-p1-r4',
      source_node_id: NODE_ONE,
      target_node_id: NODE_TWO,
      status: PRIORITY_RECOVERY_OPERATION_STATUS_ACTIVE,
      workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
      updated_at: 900,
    };
    const summaryOnlyDiagnostics = (priorityRecoveryClosureWitness = null) => ({
      publicationConvergence: {
        ...(priorityRecoveryClosureWitness ?
          {priorityRecoveryClosureWitness} :
          {}),
        priorityRecoveryPartitionIdsBySemanticState: {
          [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [
            PARTITION_ONE,
          ],
        },
      },
    });
    const invalidClosureWitnesses = [
      null,
      {
        state: PRIORITY_RECOVERY_CLOSURE_STATE_SATISFIED_FRESH,
        blockedPartitionIds: [PARTITION_ONE],
      },
      {
        state: 'closure_satisfied_stale',
        blockedPartitionIds: [],
      },
    ];

    for (const closureWitness of invalidClosureWitnesses) {
      assert.strictEqual(
        countAdditionalPostRebalanceReplicaOperationDiscounts(
          summaryOnlyDiagnostics(closureWitness),
          [activePriorityRow],
          {
            nowMs: 1000,
            inFlightOperationIds: [CDC_PROJECTION_OWNER_OPERATION_ID_ONE],
          },
        ),
        NO_REPLICA_OPERATION_COUNT,
      );
    }
  });

test('post-rebalance closure does not join summary-only priority rows to unrelated closure partitions',
  async () => {
    const activePriorityRow = {
      operation_id: CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
      type: 'REPLACE',
      partition_id: PARTITION_ONE,
      entity_type: 'partition',
      entity_id: PARTITION_ONE,
      replica_id: 'control_plane_publications-p1-r4',
      source_node_id: NODE_ONE,
      target_node_id: NODE_TWO,
      status: PRIORITY_RECOVERY_OPERATION_STATUS_ACTIVE,
      workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
      updated_at: 900,
    };

    assert.strictEqual(
      countAdditionalPostRebalanceReplicaOperationDiscounts(
        {
          publicationConvergence: {
            priorityRecoveryClosureWitness: {
              state: PRIORITY_RECOVERY_CLOSURE_STATE_SATISFIED_FRESH,
              prioritySpreadPending: false,
              publicationRefreshRequired: false,
              blockedPartitionIds: [],
              blockedPartitionCount: NO_REPLICA_OPERATION_COUNT,
              unresolvedSemanticStateIds: [],
              unresolvedSemanticStateCount: NO_REPLICA_OPERATION_COUNT,
              satisfiedPartitionIds: [PARTITION_TWO],
              decisionPartitionIds: [PARTITION_TWO],
            },
            priorityRecoveryPartitionIdsBySemanticState: {
              [PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: [
                PARTITION_ONE,
              ],
            },
          },
        },
        [activePriorityRow],
        {
          nowMs: 1000,
          inFlightOperationIds: [CDC_PROJECTION_OWNER_OPERATION_ID_ONE],
        },
      ),
      NO_REPLICA_OPERATION_COUNT,
    );
  });

test('post-rebalance closure counts closure-satisfied cache-visible active priority rows as exact discounts',
  async () => {
    assert.strictEqual(
      countAdditionalPostRebalanceReplicaOperationDiscounts(
        {
          priorityRecoveryClosureWitness: {
            state: PRIORITY_RECOVERY_CLOSURE_STATE_SATISFIED_FRESH,
            prioritySpreadPending: false,
            publicationRefreshRequired: false,
            blockedPartitionIds: [],
            blockedPartitionCount: NO_REPLICA_OPERATION_COUNT,
            unresolvedSemanticStateIds: [],
            unresolvedSemanticStateCount: NO_REPLICA_OPERATION_COUNT,
          },
          priorityRecoveryDecisionSnapshots: {
            snapshots: [
              buildCacheVisiblePriorityRecoverySnapshot(
                PARTITION_ONE,
                CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
                {
                  workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
                  latestOperationStatus:
                    PRIORITY_RECOVERY_OPERATION_STATUS_ACTIVE,
                  latestOperationWorkflowStep:
                    PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
                },
              ),
            ],
          },
          publicationConvergence: {
            publicationStatus: PUBLICATION_STATUS_PUBLISHED,
          },
        },
        [{
          operation_id: CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
          type: 'REPLACE',
          partition_id: PARTITION_ONE,
          entity_type: 'partition',
          entity_id: PARTITION_ONE,
          replica_id: 'control_plane_publications-p1-r4',
          source_node_id: NODE_ONE,
          target_node_id: NODE_TWO,
          status: PRIORITY_RECOVERY_OPERATION_STATUS_ACTIVE,
          workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
          updated_at: 900,
        }],
        {
          nowMs: 1000,
          inFlightOperationIds: [CDC_PROJECTION_OWNER_OPERATION_ID_ONE],
        },
      ),
      RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
    );
  });

test('post-rebalance closure joins sibling closure witnesses by covered priority partition',
  async () => {
    const activePriorityRow = {
      operation_id: CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
      type: 'REPLACE',
      partition_id: PARTITION_ONE,
      entity_type: 'partition',
      entity_id: PARTITION_ONE,
      replica_id: 'control_plane_publications-p1-r4',
      source_node_id: NODE_ONE,
      target_node_id: NODE_TWO,
      status: PRIORITY_RECOVERY_OPERATION_STATUS_ACTIVE,
      workflow_step: PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
      updated_at: 900,
    };
    const buildClosureWitness = (coveredPartitionIds) => ({
      state: PRIORITY_RECOVERY_CLOSURE_STATE_SATISFIED_FRESH,
      prioritySpreadPending: false,
      publicationRefreshRequired: false,
      blockedPartitionIds: [],
      blockedPartitionCount: NO_REPLICA_OPERATION_COUNT,
      unresolvedSemanticStateIds: [],
      unresolvedSemanticStateCount: NO_REPLICA_OPERATION_COUNT,
      satisfiedPartitionIds: coveredPartitionIds,
      decisionPartitionIds: coveredPartitionIds,
    });
    const siblingDiagnostics = (
      coveredPartitionIds,
      gateNested = false,
    ) => ({
      publicationConvergence: gateNested ?
        {
          publicationConvergenceGate: {
            priorityRecoveryClosureWitness:
              buildClosureWitness(coveredPartitionIds),
          },
        } :
        {
          priorityRecoveryClosureWitness:
            buildClosureWitness(coveredPartitionIds),
        },
      priorityRecoveryDecisionSnapshots: {
        snapshots: [
          buildCacheVisiblePriorityRecoverySnapshot(
            PARTITION_ONE,
            CDC_PROJECTION_OWNER_OPERATION_ID_ONE,
            {
              workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
              latestOperationStatus:
                PRIORITY_RECOVERY_OPERATION_STATUS_ACTIVE,
              latestOperationWorkflowStep:
                PRIORITY_RECOVERY_WORKFLOW_STEP_ACTIVE,
            },
          ),
        ],
      },
    });

    assert.strictEqual(
      countAdditionalPostRebalanceReplicaOperationDiscounts(
        siblingDiagnostics([PARTITION_ONE]),
        [activePriorityRow],
        {
          nowMs: 1000,
          inFlightOperationIds: [CDC_PROJECTION_OWNER_OPERATION_ID_ONE],
        },
      ),
      RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
    );
    assert.strictEqual(
      countAdditionalPostRebalanceReplicaOperationDiscounts(
        siblingDiagnostics([PARTITION_ONE], true),
        [activePriorityRow],
        {
          nowMs: 1000,
          inFlightOperationIds: [CDC_PROJECTION_OWNER_OPERATION_ID_ONE],
        },
      ),
      RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
    );
    assert.strictEqual(
      countAdditionalPostRebalanceReplicaOperationDiscounts(
        siblingDiagnostics([PARTITION_TWO]),
        [activePriorityRow],
        {
          nowMs: 1000,
          inFlightOperationIds: [CDC_PROJECTION_OWNER_OPERATION_ID_ONE],
        },
      ),
      NO_REPLICA_OPERATION_COUNT,
    );
  });

test('post-rebalance closure soft-closes operation drain for additional post-publication discounts',
  async () => {
    const closure = buildPostRebalanceClosureSnapshot({
      expectedPartitionIds: EXPECTED_PARTITION_IDS,
      leaders: STABLE_LEADERS,
      voterCounts: TARGET_VOTER_COUNTS,
      overTargetDurations: {},
      maxOverTargetMs: TRANSIENT_OVERTARGET_MS,
      maxSustainedOverTargetMs: MAX_SUSTAINED_OVERTARGET_MS,
      targetVoterCount: TARGET_VOTER_COUNT,
      inFlightReplicaOperationCount: RAW_IN_FLIGHT_REPLICA_OPERATION_COUNT,
      effectiveInFlightReplicaOperationCount:
        EFFECTIVE_CLOSED_REPLICA_OPERATION_COUNT,
      additionalInFlightDiscountCount:
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

    assert.strictEqual(closure.state, POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED);
    assert.deepStrictEqual(
      closure.softClosures.map((softClosure) => softClosure.id),
      [OPERATION_DRAIN_SOFT_CLOSED_ID],
    );
    assert.deepStrictEqual(
      closure.dimensions[
        POST_REBALANCE_CLOSURE_DIMENSION.OPERATION_DRAIN
      ].reasonCodes,
      [
        POST_REBALANCE_CLOSURE_REASON
          .IGNORED_POST_PUBLICATION_REPLICA_OPERATIONS,
      ],
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
