import {test} from '../../src/test-helpers/tap.js';
import {isPriorityRecoveryOperationContextTerminal} from '../../src/control-plane/priority-recovery-snapshot-rebalancer.js';
import {PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE} from '../../src/control-plane/priority-recovery-snapshot-contract.js';

// Op-retire-on-terminal-timeline reconciliation (unconditional; R2 — collapse the
// workflowStep-vs-timeline two-sources-of-truth seam, flag retired).
// Reproduces the run1 gate wedge: a surplus-drain REMOVE op whose record-level
// `workflowStep` column still reads the non-terminal `STOPPING` (write-through lag)
// while its operation timeline has already reached terminal `REMOVED/removed`. The
// classifier must count this op terminal so the partition can leave
// `spread_satisfied_in_flight` and operation_drain can close — but only within the
// safety scoping (never ADD; REPLACE only when its target is voter-ready; never when
// the timeline entry is still in-flight).

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

test('terminal REMOVED timeline retires a lagging-STOPPING REMOVE drain', (t) => {
  t.equal(
    isPriorityRecoveryOperationContextTerminal(laggingDrainContext),
    true,
    'terminal timeline step is honored over the stale non-terminal record step',
  );
  t.end();
});

test('a genuinely in-progress REMOVE (timeline also STOPPING) stays active', (t) => {
  t.equal(
    isPriorityRecoveryOperationContextTerminal({
      ...laggingDrainContext,
      latestTimelineStep: 'STOPPING',
      latestTimelineStatus: 'removing',
    }),
    false,
    'no terminal timeline step → no promotion; op correctly remains active',
  );
  t.end();
});

test('REPLACE with non-operational target is NOT retired', (t) => {
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
  t.end();
});

test('REPLACE with an operational target retires the lagging source-removal', (t) => {
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
  t.end();
});

test('ADD reaching its terminal step is NOT touched by this reconciliation', (t) => {
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
  t.end();
});

test('an in-flight timeline entry blocks promotion', (t) => {
  t.equal(
    isPriorityRecoveryOperationContextTerminal({
      ...laggingDrainContext,
      latestTimelineInFlight: true,
    }),
    false,
    'latestTimelineInFlight guard prevents retiring a still-in-flight timeline',
  );
  t.end();
});

test('a record-terminal REMOVE remains terminal (no regression)', (t) => {
  t.equal(
    isPriorityRecoveryOperationContextTerminal({
      ...laggingDrainContext,
      workflowStep: 'REMOVED',
      status: 'removed',
    }),
    true,
    'record-level terminal step still classifies terminal',
  );
  t.end();
});
