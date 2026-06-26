// Per-entity in-flight ADD serialization
// (default-off LAGRANGE_PR_ENTITY_INFLIGHT_ADD_SERIALIZE).
//
// The per-entity add-like create lane (ensureEntityAddLikeCreateLaneAvailable) runs for
// both ADD and REPLACE creation, but findEntityAddLikeConflictingOperation only treats a
// non-terminal REPLACE in its source-removal phase as a conflict — so a partition that
// already has a non-terminal ADD in flight still admits ADD N+1, N+2, ... = the
// replica_operations re-decision storm (analyze:redecision-storm; gate 081328Z =
// replica_operations-p1 at 27 dispatches/~1.2s cadence vs the ~5s settle). With the flag
// on, a non-terminal ADD for the entity becomes a conflict, so the next add-like op is
// deferred until it terminalizes — the in-flight-action memory / loop hysteresis the
// metastable + control-theory literature prescribes (settle-time >= re-action interval).
// State-based (not a time cooldown), it covers EVERY partition the creation chokepoint
// flows through, and touches only ADD-side serialization — never the REMOVE-side quorum
// floor (whose count-projection direction was refuted).

import {test} from '../../src/test-helpers/tap.js';
import {applyRebalanceCoordinatorPriorityBudgetAdmissionMethods} from '../../src/rebalancer/rebalance-coordinator-priority-budget-admission.js';

const FLAG = 'LAGRANGE_PR_ENTITY_INFLIGHT_ADD_SERIALIZE';

class AdmissionHarness {}
applyRebalanceCoordinatorPriorityBudgetAdmissionMethods(AdmissionHarness);

// Minimal harness: findEntityAddLikeConflictingOperation depends only on
// isOperationTerminal + isReplaceRemoveDispatchPhase, both stubbed off the fixture.
function buildHarness() {
  const harness = new AdmissionHarness();
  harness.isOperationTerminal = (op) => op?.terminal === true;
  harness.isReplaceRemoveDispatchPhase = (op) => op?.replaceRemovePhase === true;
  return harness;
}

const NON_TERMINAL_ADD = Object.freeze({operationId: 'op-add-1', type: 'ADD', terminal: false});
const TERMINAL_ADD = Object.freeze({operationId: 'op-add-done', type: 'ADD', terminal: true});
const REPLACE_REMOVE_PHASE = Object.freeze({
  operationId: 'op-rep-1', type: 'REPLACE', terminal: false, replaceRemovePhase: true,
});
const REPLACE_NOT_REMOVE_PHASE = Object.freeze({
  operationId: 'op-rep-2', type: 'REPLACE', terminal: false, replaceRemovePhase: false,
});

function withFlag(value, fn) {
  return async (t) => {
    const previous = process.env[FLAG];
    if (value === null) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = value;
    }
    try {
      await fn(t);
    } finally {
      if (previous === undefined) {
        delete process.env[FLAG];
      } else {
        process.env[FLAG] = previous;
      }
    }
  };
}

test('flag-off: a non-terminal ADD is NOT a conflict (byte-identical baseline)',
  withFlag(null, async (t) => {
    const harness = buildHarness();
    t.equal(harness.findEntityAddLikeConflictingOperation([NON_TERMINAL_ADD]), null,
      'an in-flight ADD does not block the lane when the flag is off');
    t.end();
  }));

// RED-ON-REVERT: reverting the flag-gated ADD branch makes this return null and FAIL.
test('flag-on: a non-terminal ADD IS a conflict (in-flight-action memory)',
  withFlag('true', async (t) => {
    const harness = buildHarness();
    t.equal(harness.findEntityAddLikeConflictingOperation([NON_TERMINAL_ADD]), NON_TERMINAL_ADD,
      'a non-terminal ADD owns the entity add lane → defer the next add-like op');
    t.end();
  }));

test('flag-on: a TERMINAL ADD is NOT a conflict (gate opens once it settles — no deadlock)',
  withFlag('true', async (t) => {
    const harness = buildHarness();
    t.equal(harness.findEntityAddLikeConflictingOperation([TERMINAL_ADD]), null,
      'a settled ADD no longer blocks → the next corrective ADD is admitted');
    t.end();
  }));

test('a non-terminal REPLACE in its source-removal phase stays a conflict under BOTH flag states',
  async (t) => {
    for (const value of [null, 'true']) {
      await withFlag(value, async () => {
        const harness = buildHarness();
        t.equal(harness.findEntityAddLikeConflictingOperation([REPLACE_REMOVE_PHASE]),
          REPLACE_REMOVE_PHASE,
          `existing REPLACE-source-removal serialization preserved (flag=${value})`);
      })(t);
    }
    t.end();
  });

test('flag-on: a non-terminal REPLACE NOT in its source-removal phase is still not a conflict',
  withFlag('true', async (t) => {
    const harness = buildHarness();
    t.equal(harness.findEntityAddLikeConflictingOperation([REPLACE_NOT_REMOVE_PHASE]), null,
      'only the ADD branch is added; non-removal-phase REPLACE behavior is unchanged');
    t.end();
  }));

test('flag-on: the first non-terminal ADD in the set is returned as the conflict',
  withFlag('true', async (t) => {
    const harness = buildHarness();
    t.equal(
      harness.findEntityAddLikeConflictingOperation([TERMINAL_ADD, NON_TERMINAL_ADD]),
      NON_TERMINAL_ADD,
      'terminal ADDs are skipped; the live one is the conflict');
    t.end();
  }));
