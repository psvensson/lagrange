import {test} from '../../src/test-helpers/tap.js';
import {
  PRIORITY_RECOVERY_COMPLETION_REASON,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  buildPriorityRecoveryCompletion,
} from '../../src/control-plane/priority-recovery-completion.js';
const PRIORITY_RECOVERY_TEST_TARGET_REPLICA_COUNT = 3;
const PRIORITY_RECOVERY_TEST_ACTIVE_VOTER_COUNT = 3;
const PRIORITY_RECOVERY_TEST_MULTI_LEARNER_COUNT = 2;
const PRIORITY_RECOVERY_TEST_TEMPORARY_OVERFLOW_VOTER_BUDGET = 2;

test('priority recovery completion reports authoritative owner-read defer explicitly',
  async (t) => {
    const completion = buildPriorityRecoveryCompletion({
      authoritativeOperationReadDeferred: true,
      priorityRecoveryActive: true,
      retryAfterMs: 250,
    });

    t.equal(
      completion.state,
      PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED,
      'authoritative read pressure should surface the canonical deferred completion state',
    );
    t.equal(
      completion.reasonCode,
      PRIORITY_RECOVERY_COMPLETION_REASON.AUTHORITATIVE_OPERATION_READ_DEFERRED,
      'deferred owner reads should preserve the canonical reason code',
    );
    t.equal(
      completion.retryAfterMs,
      250,
      'deferred owner reads should preserve bounded retry guidance',
    );
    t.equal(
      completion.allowTemporaryOverflowPromotion,
      false,
      'authoritative read defers should not imply learner-promotion overflow',
    );
  });

test('priority recovery completion keeps bounded overflow promotion available while planner spread is unresolved',
  async (t) => {
    const completion = buildPriorityRecoveryCompletion({
      assessment: {
        planner: {
          ready: false,
          spreadGap: 1,
        },
        spreadCompletion: {
          satisfied: false,
          reasonCode: 'unsatisfied',
        },
        activeOperationContexts: [],
      },
      targetReplicaCount: 3,
      activeVoterCount: 4,
      learnerCount: 1,
      priorityRecoveryActive: true,
    });

    t.equal(
      completion.state,
      PRIORITY_RECOVERY_COMPLETION_STATE.TEMPORARY_OVER_TARGET_ALLOWED,
      'an unresolved planner spread should keep the bounded overflow completion state active even before operation rows are visible',
    );
    t.equal(
      completion.reasonCode,
      PRIORITY_RECOVERY_COMPLETION_REASON.TEMPORARY_OVER_TARGET_ALLOWED,
      'bounded overflow promotion should expose one canonical reason code',
    );
    t.equal(
      completion.allowTemporaryOverflowPromotion,
      true,
      'the completion contract should explicitly authorize the bounded overflow promotion',
    );
    t.equal(
      completion.blocked,
      false,
      'bounded overflow promotion should not remain in a blocked completion state',
    );
  });

test('priority recovery completion keeps bounded overflow promotion active while multi-learner recovery still needs voter promotion',
  async (t) => {
    const completion = buildPriorityRecoveryCompletion({
      assessment: {
        planner: {
          ready: true,
          spreadGap: 0,
        },
        spreadCompletion: {
          satisfied: true,
          reasonCode: 'planner_ready',
        },
        activeOperationContexts: [
          {operationId: 'op-replace-1'},
          {operationId: 'op-replace-2'},
        ],
      },
      targetReplicaCount: PRIORITY_RECOVERY_TEST_TARGET_REPLICA_COUNT,
      activeVoterCount: PRIORITY_RECOVERY_TEST_ACTIVE_VOTER_COUNT,
      learnerCount: PRIORITY_RECOVERY_TEST_MULTI_LEARNER_COUNT,
      priorityRecoveryActive: true,
    });

    t.equal(
      completion.state,
      PRIORITY_RECOVERY_COMPLETION_STATE.TEMPORARY_OVER_TARGET_ALLOWED,
      'planner-ready recovery should keep the canonical overflow-completion state while replacement learners still need promotion',
    );
    t.equal(
      completion.reasonCode,
      PRIORITY_RECOVERY_COMPLETION_REASON.TEMPORARY_OVER_TARGET_ALLOWED,
      'multi-learner overflow should preserve the canonical completion reason',
    );
    t.equal(
      completion.temporaryOverflowVoterBudget,
      PRIORITY_RECOVERY_TEST_TEMPORARY_OVERFLOW_VOTER_BUDGET,
      'the completion contract should own the bounded overflow voter budget explicitly',
    );
    t.equal(
      completion.allowTemporaryOverflowPromotion,
      true,
      'the completion contract should keep overflow promotion enabled until replacement recovery finishes',
    );
  });
