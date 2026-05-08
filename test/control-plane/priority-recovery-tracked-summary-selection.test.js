import {test} from '../../src/test-helpers/tap.js';
import {
  buildTrackedPriorityRecoveryDecisionSnapshots,
} from '../../src/control-plane/priority-recovery-snapshot.js';

const TEST_NAME =
  'tracked priority recovery summary keeps operation spread progress canonical';
const MESSAGE_SYNTHETIC_BLOCKER_CLEARED =
  'later synthetic no-operation rows should not own the blocker bucket once operation spread progress exists';
const MESSAGE_SPREAD_PROGRESS_CANONICAL =
  'operation-bearing spread progress should remain the canonical partition state';
const MESSAGE_SYNTHETIC_NEEDS_OPERATION_CLEARED =
  'synthetic needs-operation rows should not supersede operation-bearing spread progress';
const PARTITION_ID = 'replica_operations-p1';
const PUBLICATION_EPOCH = 12;
const OPERATION_PROGRESS_CAPTURED_AT_MS = 2000;
const SYNTHETIC_NO_OPERATION_CAPTURED_AT_MS = 4500;
const OPERATION_ID = 'op-eligible-remove-phase';
const SYNTHETIC_OPERATION_UNKNOWN_ID = 'operation_unknown';
const SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT =
  'spread_satisfied_in_flight';
const SEMANTIC_STATE_NEEDS_OPERATION = 'needs_operation';
const SEMANTIC_STATE_COORDINATION_MISMATCH = 'coordination_mismatch';
const BLOCKER_REASON_ELIGIBLE_NO_OPERATION =
  'eligible_but_no_operation_created';
const BLOCKER_REASON_OPERATION_NO_TRANSITIONS =
  'operation_created_but_no_step_transitions';
const BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED =
  'publication_recovery_eligible_but_coordinator_excludes_node';
const COMPLETION_STATE_SPREAD_SATISFIED_IN_FLIGHT =
  'spread_satisfied_in_flight';
const STATUS_ACTIVE = 'active';
const WORKFLOW_STEP_ACTIVE = 'ACTIVE';
const OPERATION_COUNT = 1;
const EMPTY_LIST = Object.freeze([]);
const OPERATION_PROGRESS_CORRELATION_KEY =
  `${PARTITION_ID}|${PUBLICATION_EPOCH}|${OPERATION_ID}`;
const SYNTHETIC_NO_OPERATION_CORRELATION_KEY =
  `${PARTITION_ID}|${PUBLICATION_EPOCH}|${SYNTHETIC_OPERATION_UNKNOWN_ID}`;

test(TEST_NAME, async (t) => {
  const trackedDecisionSnapshots = buildTrackedPriorityRecoveryDecisionSnapshots({
    publicationEpoch: PUBLICATION_EPOCH,
    blockerPartitionIdsByReason: {
      [BLOCKER_REASON_ELIGIBLE_NO_OPERATION]: [PARTITION_ID],
      [BLOCKER_REASON_OPERATION_NO_TRANSITIONS]: EMPTY_LIST,
      [BLOCKER_REASON_RECOVERY_ELIGIBLE_EXCLUDED]: EMPTY_LIST,
    },
    partitionIdsBySemanticState: {
      [SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT]: EMPTY_LIST,
      [SEMANTIC_STATE_NEEDS_OPERATION]: [PARTITION_ID],
      [SEMANTIC_STATE_COORDINATION_MISMATCH]: EMPTY_LIST,
    },
    snapshots: [{
      partitionId: PARTITION_ID,
      epoch: PUBLICATION_EPOCH,
      capturedAt: OPERATION_PROGRESS_CAPTURED_AT_MS,
      operationId: OPERATION_ID,
      correlationKey: OPERATION_PROGRESS_CORRELATION_KEY,
      semanticState: SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
      blockerReasons: EMPTY_LIST,
      spreadCompletion: {
        satisfied: true,
      },
      completion: {
        state: COMPLETION_STATE_SPREAD_SATISFIED_IN_FLIGHT,
      },
      coordinator: {
        operationCount: OPERATION_COUNT,
        operationIds: [OPERATION_ID],
        operation: {
          operationId: OPERATION_ID,
          partitionId: PARTITION_ID,
          status: STATUS_ACTIVE,
          workflowStep: WORKFLOW_STEP_ACTIVE,
          updatedAtMs: OPERATION_PROGRESS_CAPTURED_AT_MS,
        },
      },
    }, {
      partitionId: PARTITION_ID,
      epoch: PUBLICATION_EPOCH,
      capturedAt: SYNTHETIC_NO_OPERATION_CAPTURED_AT_MS,
      correlationKey: SYNTHETIC_NO_OPERATION_CORRELATION_KEY,
      semanticState: SEMANTIC_STATE_NEEDS_OPERATION,
      blockerReasons: [BLOCKER_REASON_ELIGIBLE_NO_OPERATION],
    }],
  });

  t.same(
    trackedDecisionSnapshots.blockerPartitionIdsByReason[
      BLOCKER_REASON_ELIGIBLE_NO_OPERATION
    ],
    EMPTY_LIST,
    MESSAGE_SYNTHETIC_BLOCKER_CLEARED,
  );
  t.same(
    trackedDecisionSnapshots.partitionIdsBySemanticState[
      SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT
    ],
    [PARTITION_ID],
    MESSAGE_SPREAD_PROGRESS_CANONICAL,
  );
  t.same(
    trackedDecisionSnapshots.partitionIdsBySemanticState[
      SEMANTIC_STATE_NEEDS_OPERATION
    ],
    EMPTY_LIST,
    MESSAGE_SYNTHETIC_NEEDS_OPERATION_CLEARED,
  );
});
