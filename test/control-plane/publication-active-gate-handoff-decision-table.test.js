/**
 * The active-gate handoff decision is one total table over named evidence
 * states. This test is generated from the table's own dimensions: every
 * combination maps to exactly one row, and an independent statement of the
 * contract (the oracle below, written from the contract text and not from the
 * rows) agrees with the row for every combination.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION as ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECONCILE_REQUIREMENT as REQUIREMENT,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE as STATE,
} from '../../src/control-plane/publication-active-gate-handoff-contract-constants.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_DECISION_DIMENSIONS as DIMENSIONS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_DECISION_TABLE as TABLE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_EVIDENCE_STATE as EVIDENCE,
  classifyPublicationActiveGateHandoffEvidence,
  decidePublicationActiveGateHandoff,
  decidePublicationActiveGateHandoffStates,
} from '../../src/control-plane/publication-active-gate-handoff-contract-decision-table.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE as GATE,
} from '../../src/control-plane/publication-active-gate-handoff-contract-recovery-evidence.js';

const {ACK_COMPLETION, COHORT, COVERAGE} = EVIDENCE;
const NAMES = Object.keys(DIMENSIONS);

function allCombinations() {
  return NAMES.reduce(
    (combinations, name) => combinations.flatMap((combination) =>
      DIMENSIONS[name].map((value) => ({...combination, [name]: value}))),
    [{}],
  );
}

function matchingRows(states) {
  return TABLE.filter((row) => NAMES.every((name) =>
    !Object.hasOwn(row.when, name) || row.when[name].includes(states[name])));
}

// The contract, stated independently of the rows.
function oracle(states) {
  if (states.ackCompletion === ACK_COMPLETION.PENDING) {
    return ACTION.RECONCILE_OWNER_MEMBERSHIP_PUBLICATION;
  }
  if (
    states.reconcileRequirement === REQUIREMENT.REQUIRED &&
    states.coverage !== COVERAGE.NODE_WAIT
  ) {
    return ACTION.RECONCILE_OWNER_MEMBERSHIP_PUBLICATION;
  }
  if (states.cohort === COHORT.UNAVAILABLE) {
    return ACTION.OBSERVE_OWNER_HANDOFF;
  }
  return {
    [COVERAGE.PUBLISHABLE_MISSING]:
      ACTION.RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
    [COVERAGE.NODE_WAIT]: ACTION.WAIT_OWNER_RECOVERY,
    [COVERAGE.UNASSIGNED_MISSING]: ACTION.OBSERVE_OWNER_HANDOFF,
    [COVERAGE.COVERED]: states.recoveryGate === GATE.ACTIVE ?
      ACTION.WAIT_OWNER_RECOVERY : ACTION.ADMIT_ACTIVE_GATE,
  }[states.coverage];
}

test('the dimensions are the five named evidence vocabularies', async (t) => {
  t.same(NAMES, ['ackCompletion', 'reconcileRequirement', 'cohort',
    'coverage', 'recoveryGate']);
  t.same(DIMENSIONS.ackCompletion, Object.values(ACK_COMPLETION));
  t.same(DIMENSIONS.reconcileRequirement, Object.values(REQUIREMENT));
  t.same(DIMENSIONS.cohort, Object.values(COHORT));
  t.same(DIMENSIONS.coverage, Object.values(COVERAGE));
  t.same(DIMENSIONS.recoveryGate, Object.values(GATE));
  t.equal(allCombinations().length, 2 * 2 * 2 * 4 * 3);
});

test('every evidence combination maps to exactly one row, and the row is ' +
  'the contract\'s action', async (t) => {
  const usedRowIds = new Set();
  for (const states of allCombinations()) {
    const label = NAMES.map((name) => states[name]).join('|');
    const rows = matchingRows(states);
    t.equal(rows.length, 1, `${label} matches exactly one row`);
    const decision = decidePublicationActiveGateHandoffStates(states);
    t.equal(decision.id, rows[0].id, `${label} decides by its row`);
    t.equal(decision.nextAction, oracle(states), `${label} action`);
    t.equal(decision.runtimePromotionAllowed,
      decision.nextAction === ACTION.ADMIT_ACTIVE_GATE,
      `${label} promotes only on admit`);
    usedRowIds.add(decision.id);
  }
  t.same([...usedRowIds].sort(), TABLE.map((row) => row.id).sort(),
    'no row is unreachable');
});

test('the recovery gate never changes the action while the publication ' +
  'owner has a node to publish or an acknowledgement to complete',
async (t) => {
  for (const states of allCombinations()) {
    if (states.recoveryGate !== GATE.CLEAR) {
      continue;
    }
    const clear = decidePublicationActiveGateHandoffStates(states);
    for (const recoveryGate of [GATE.ACTIVE, GATE.UNAVAILABLE]) {
      const other = decidePublicationActiveGateHandoffStates(
        {...states, recoveryGate});
      const gateDecides = states.ackCompletion === ACK_COMPLETION.NONE &&
        states.reconcileRequirement === REQUIREMENT.NOT_REQUIRED &&
        states.cohort === COHORT.AVAILABLE &&
        states.coverage === COVERAGE.COVERED;
      if (!gateDecides) {
        t.equal(other.nextAction, clear.nextAction);
      }
    }
  }
  t.equal(decidePublicationActiveGateHandoffStates({
    ackCompletion: ACK_COMPLETION.NONE,
    reconcileRequirement: REQUIREMENT.NOT_REQUIRED,
    cohort: COHORT.AVAILABLE,
    coverage: COVERAGE.PUBLISHABLE_MISSING,
    recoveryGate: GATE.ACTIVE,
  }).nextAction, ACTION.RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
  'a missing publishable node is reconciled while the gate is active');
});

test('an unnamed evidence state is refused, never defaulted', async (t) => {
  t.throws(() => decidePublicationActiveGateHandoffStates({
    ackCompletion: ACK_COMPLETION.NONE,
    reconcileRequirement: REQUIREMENT.NOT_REQUIRED,
    cohort: COHORT.AVAILABLE,
    coverage: COVERAGE.COVERED,
    recoveryGate: undefined,
  }), TypeError);
});

test('node lists classify into the named coverage states', async (t) => {
  const base = {
    expectedNodeIds: ['a', 'b', 'c'],
    publishedActiveNodeIds: ['a', 'b'],
    missingPublishedNodeIds: ['c'],
    pendingRecoveryNodeIds: [],
    pendingReconcileNodeIds: ['c'],
    ownerAckCompletionPendingNodeIds: [],
    reconcileRequirement: REQUIREMENT.NOT_REQUIRED,
    recoveryGate: {state: GATE.ACTIVE, reasonCode: 'x'},
  };
  const coverageOf = (overrides) =>
    classifyPublicationActiveGateHandoffEvidence({...base, ...overrides})
      .coverage;
  t.equal(coverageOf({}), COVERAGE.PUBLISHABLE_MISSING);
  t.equal(coverageOf({pendingRecoveryNodeIds: ['a']}),
    COVERAGE.PUBLISHABLE_MISSING,
    'another node waiting does not hide a publishable missing node');
  t.equal(coverageOf({pendingRecoveryNodeIds: ['c'],
    pendingReconcileNodeIds: []}), COVERAGE.NODE_WAIT);
  t.equal(coverageOf({pendingReconcileNodeIds: []}),
    COVERAGE.UNASSIGNED_MISSING);
  t.equal(coverageOf({publishedActiveNodeIds: ['a', 'b', 'c'],
    missingPublishedNodeIds: [], pendingReconcileNodeIds: []}),
  COVERAGE.COVERED);
  t.equal(decidePublicationActiveGateHandoff(base).nextAction,
    ACTION.RECONCILE_OWNER_MEMBERSHIP_PUBLICATION);
  t.equal(decidePublicationActiveGateHandoff(base).state, STATE.PENDING);
});
