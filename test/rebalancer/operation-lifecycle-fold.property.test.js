// DT3 — property-based interleaving over a PURE decision kernel.
//
// Instead of sampling operation-workflow races in the docker gate, fold an
// arbitrary (fast-check-generated, shrinking) sequence of lifecycle events
// through the pure `advanceOperationLifecycle` transition and assert the
// workflow invariants hold for EVERY interleaving. These are the CL-017 /
// invariant-engine `checkOperationProgressBoundedSteps` lineage (monotonic
// step sequence; terminal states are absorbing; transitions never crash).
//
// A regression that lets a terminal operation resurrect, or the step sequence
// go backwards, shrinks here to a minimal failing event list in milliseconds —
// no cluster, no docker.

import fc from 'fast-check';
import {test} from '../../src/test-helpers/tap.js';
import {
  advanceOperationLifecycle,
  isOperationProgressTerminalState,
  OPERATION_LIFECYCLE_EVENT_TYPE,
  OPERATION_LIFECYCLE_STATE,
} from '../../src/rebalancer/operation-lifecycle.js';

const EVENT_TYPES = Object.values(OPERATION_LIFECYCLE_EVENT_TYPE);
// PLANNED is the machine's real initial state (createInitialOperationProgress
// starts here). Seeding a non-existent state would make every event an invalid
// transition that self-loops, leaving the fold stuck and the properties vacuous.
const INITIAL_STATE = OPERATION_LIFECYCLE_STATE.PLANNED;
const FC_RUNS = 200;

function eventArbitrary() {
  return fc.record({
    type: fc.constantFrom(...EVENT_TYPES),
    operationId: fc.constantFrom('op-1', 'op-2'),
  });
}

// Fold a sequence of events from the initial state, returning the per-step
// trace (state + monotonic sequence number) for invariant assertions.
function foldLifecycle(events) {
  const trace = [];
  let current = INITIAL_STATE;
  for (const event of events) {
    const result = advanceOperationLifecycle(current, event);
    trace.push({state: result.state, sequence: result.operationProgress.sequence});
    current = result.operationProgress;
  }
  return trace;
}

// Non-vacuity guard: a deterministic happy path must actually traverse the
// machine and REACH a terminal state. If this fails, the property suite below is
// testing a stuck fold and proves nothing (the original 'CREATING' bug).
test('the fold actually advances the machine and reaches a terminal state', (t) => {
  const ev = OPERATION_LIFECYCLE_EVENT_TYPE;
  const happyPath = [
    {type: ev.DISPATCH_REQUESTED, operationId: 'op-1'},
    {type: ev.DISPATCH_ACCEPTED, operationId: 'op-1'},
    {type: ev.PUBLICATION_ACCEPTED, operationId: 'op-1'},
    {type: ev.ACTIVE_GATE_VISIBLE, operationId: 'op-1'},
    {type: ev.OPERATION_COMPLETE, operationId: 'op-1'},
  ];
  const trace = foldLifecycle(happyPath);
  const distinctStates = new Set(trace.map((s) => s.state));
  t.ok(distinctStates.size > 1, 'the fold visits more than one state (not stuck)');
  t.ok(trace.some((s) => isOperationProgressTerminalState(s.state)),
    'a complete sequence reaches a terminal state');
  t.end();
});

test('every event interleaving keeps the step sequence monotonic non-decreasing', (t) => {
  fc.assert(
    fc.property(fc.array(eventArbitrary(), {minLength: 1, maxLength: 40}), (events) => {
      const trace = foldLifecycle(events);
      for (let i = 1; i < trace.length; i += 1) {
        if (trace[i].sequence < trace[i - 1].sequence) return false;
      }
      return true;
    }),
    {numRuns: FC_RUNS},
  );
  t.pass('step sequence is monotonic across all interleavings');
  t.end();
});

test('terminal states are absorbing — no interleaving resurrects a terminal operation', (t) => {
  fc.assert(
    fc.property(fc.array(eventArbitrary(), {minLength: 1, maxLength: 40}), (events) => {
      const trace = foldLifecycle(events);
      let sawTerminal = false;
      for (const step of trace) {
        if (sawTerminal && !isOperationProgressTerminalState(step.state)) {
          return false; // resurrected from terminal to active
        }
        if (isOperationProgressTerminalState(step.state)) sawTerminal = true;
      }
      return true;
    }),
    {numRuns: FC_RUNS},
  );
  t.pass('terminal states stay terminal under all interleavings');
  t.end();
});

test('the kernel never crashes and always yields a non-empty state', (t) => {
  fc.assert(
    fc.property(fc.array(eventArbitrary(), {minLength: 1, maxLength: 40}), (events) => {
      const trace = foldLifecycle(events);
      return trace.every((step) => typeof step.state === 'string' && step.state.length > 0);
    }),
    {numRuns: FC_RUNS},
  );
  t.pass('invalid transitions are handled, never thrown');
  t.end();
});
