import {test} from '../../src/test-helpers/tap.js';
import {isPriorityRecoveryOperationContextTerminal} from '../../src/control-plane/priority-recovery-snapshot-rebalancer.js';
import {PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE} from '../../src/control-plane/priority-recovery-snapshot-contract.js';

const FLAG = 'LAGRANGE_PR_OP_RETIRE_ON_TIMELINE_REMOVED';

// Directed test for the op-retire-on-timeline-REMOVED lever (default-off).
// Reproduces the run1 gate wedge: a surplus-drain REMOVE op whose record-level
// `workflowStep` column still reads the non-terminal `STOPPING` (write-through lag)
// while its operation timeline has already reached terminal `REMOVED/removed`. The
// classifier must count this op terminal ONLY when the lever is on, so the partition
// can leave `spread_satisfied_in_flight` and operation_drain can close.

function withFlag(value, fn) {
  const prior = process.env[FLAG];
  if (value === undefined) {
    delete process.env[FLAG];
  } else {
    process.env[FLAG] = value;
  }
  try {
    fn();
  } finally {
    if (prior === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = prior;
    }
  }
}

// The exact run1 shape: REMOVE drain, stale STOPPING record column, terminal
// REMOVED/removed timeline.
const laggingDrainContext = Object.freeze({
  operationId: 'op-drain',
  type: 'REMOVE',
  workflowStep: 'STOPPING',
  status: 'removing',
  latestTimelineStep: 'REMOVED',
  latestTimelineStatus: 'removed',
  latestTimelineInFlight: false,
});

test('lever OFF: lagging-STOPPING REMOVE drain stays counted active (the bug)', (t) => {
  withFlag(undefined, () => {
    t.equal(
      isPriorityRecoveryOperationContextTerminal(laggingDrainContext),
      false,
      'record STOPPING short-circuits the terminal REMOVED timeline → wrongly active',
    );
  });
  withFlag('false', () => {
    t.equal(
      isPriorityRecoveryOperationContextTerminal(laggingDrainContext),
      false,
      'flag literal false is byte-identical to unset',
    );
  });
  t.end();
});

test('lever ON: terminal REMOVED timeline retires the lagging REMOVE drain', (t) => {
  withFlag('true', () => {
    t.equal(
      isPriorityRecoveryOperationContextTerminal(laggingDrainContext),
      true,
      'terminal timeline step is honored over the stale non-terminal record step',
    );
  });
  t.end();
});

test('lever ON: a genuinely in-progress REMOVE (timeline also STOPPING) stays active', (t) => {
  withFlag('true', () => {
    t.equal(
      isPriorityRecoveryOperationContextTerminal({
        ...laggingDrainContext,
        latestTimelineStep: 'STOPPING',
        latestTimelineStatus: 'removing',
      }),
      false,
      'no terminal timeline step → no promotion; op correctly remains active',
    );
  });
  t.end();
});

test('lever ON: REPLACE with non-operational target is NOT retired', (t) => {
  withFlag('true', () => {
    t.equal(
      isPriorityRecoveryOperationContextTerminal({
        ...laggingDrainContext,
        type: 'REPLACE',
        targetVisibilityState:
          PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_NON_OPERATIONAL,
      }),
      false,
      'a still-building replacement target blocks the timeline-terminal promotion',
    );
    t.equal(
      isPriorityRecoveryOperationContextTerminal({
        ...laggingDrainContext,
        type: 'REPLACE',
        targetVisibilityState:
          PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL,
      }),
      true,
      'once the replacement target is operational the lagging source-removal retires',
    );
  });
  t.end();
});

test('lever ON: ADD reaching its terminal step is NOT touched by this lever', (t) => {
  withFlag('true', () => {
    t.equal(
      isPriorityRecoveryOperationContextTerminal({
        operationId: 'op-add',
        type: 'ADD',
        workflowStep: 'SENDING',
        status: 'syncing',
        latestTimelineStep: 'ACTIVE',
        latestTimelineStatus: 'active',
        latestTimelineInFlight: false,
      }),
      false,
      'ADD ops are excluded from the removal-completing promotion (own completion path)',
    );
  });
  t.end();
});

test('lever ON: an in-flight timeline entry blocks promotion', (t) => {
  withFlag('true', () => {
    t.equal(
      isPriorityRecoveryOperationContextTerminal({
        ...laggingDrainContext,
        latestTimelineInFlight: true,
      }),
      false,
      'latestTimelineInFlight guard prevents retiring a still-in-flight timeline',
    );
  });
  t.end();
});

test('lever ON: a record-terminal REMOVE remains terminal (no regression)', (t) => {
  withFlag('true', () => {
    t.equal(
      isPriorityRecoveryOperationContextTerminal({
        ...laggingDrainContext,
        workflowStep: 'REMOVED',
        status: 'removed',
      }),
      true,
      'record-level terminal step still classifies terminal',
    );
  });
  t.end();
});
