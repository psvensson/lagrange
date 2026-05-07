import {test} from '../../src/test-helpers/tap.js';
import {
  PARTITION_TRANSITION_OUTCOME,
  PARTITION_TRANSITION_PHASE,
  PARTITION_TRANSITION_STATE,
  buildPartitionTransitionProjection,
  isDeferredPartitionTransitionOutcome,
  isRetryablePartitionTransitionState,
} from '../../src/partition/partition-constants.js';

test('partition transition projection separates phase from outcome', async (t) => {
  t.same(
    buildPartitionTransitionProjection(
      PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    ),
    {
      state: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      phase: PARTITION_TRANSITION_PHASE.SPLIT_BACKFILLING,
      outcome: PARTITION_TRANSITION_OUTCOME.RUNNING,
      retryable: false,
    },
    'split backfill should remain a running phase',
  );

  t.same(
    buildPartitionTransitionProjection(PARTITION_TRANSITION_STATE.DEFERRED),
    {
      state: PARTITION_TRANSITION_STATE.DEFERRED,
      phase: PARTITION_TRANSITION_PHASE.NONE,
      outcome: PARTITION_TRANSITION_OUTCOME.DEFERRED,
      retryable: true,
    },
    'deferred should be an outcome, not a split phase',
  );

  t.ok(
    isDeferredPartitionTransitionOutcome(PARTITION_TRANSITION_STATE.BLOCKED),
    'blocked outcome should classify as deferred manager work',
  );
  t.ok(
    isRetryablePartitionTransitionState(PARTITION_TRANSITION_STATE.DEFERRED),
    'deferred outcome should be state-level retryable',
  );
  t.notOk(
    isRetryablePartitionTransitionState(PARTITION_TRANSITION_STATE.FAILED),
    'failed retryability still depends on failure metadata',
  );
});
