// The active-gate handoff decision: one total table over named evidence
// states. Every combination of the five evidence dimensions maps to exactly
// one row (checked when this module loads and by the generated test); no row
// depends on the order of the rows or on a list having been emptied.
//
// Precedence it encodes, in words:
//   - the publication owner acts whenever it has something to do: an
//     acknowledgement to complete, an unpublished observation to publish, or
//     a missing node it can publish (RECONCILE). The cluster recovery gate
//     never takes that away: publishing is one of the things that clears it;
//   - it waits (WAIT_OWNER_RECOVERY) only when nothing is left for it: either
//     every remaining node is itself waiting (a per-node fact), or everything
//     is published and the recovery gate is still active, so the recovery
//     owner's progress is what remains;
//   - missing coverage that no list assigns is DEGRADED (observe).
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECONCILE_REQUIREMENT,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
} from './publication-active-gate-handoff-contract-constants.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE,
} from './publication-active-gate-handoff-contract-recovery-evidence.js';

const ACK_COMPLETION = Object.freeze({
  // The owner-driven reconcile names acknowledgements it must still close.
  PENDING: 'pending',
  NONE: 'none',
});
const COHORT = Object.freeze({
  AVAILABLE: 'available',
  // No expected node is known.
  UNAVAILABLE: 'unavailable',
});
const COVERAGE = Object.freeze({
  // At least one missing node the publication owner can publish.
  PUBLISHABLE_MISSING: 'publishable_missing',
  // No publishable missing node, and at least one node is itself waiting.
  NODE_WAIT: 'node_wait',
  // Missing nodes that neither the reconcile list nor a node wait names.
  UNASSIGNED_MISSING: 'unassigned_missing',
  // Nothing missing and no node waiting.
  COVERED: 'covered',
});
const REQUIREMENT = PUBLICATION_ACTIVE_GATE_HANDOFF_RECONCILE_REQUIREMENT;
const GATE = PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE;

const PUBLICATION_ACTIVE_GATE_HANDOFF_EVIDENCE_STATE = Object.freeze({
  ACK_COMPLETION,
  COHORT,
  COVERAGE,
});

const valuesOf = (vocabulary) => Object.freeze(Object.values(vocabulary));
const PUBLICATION_ACTIVE_GATE_HANDOFF_DECISION_DIMENSIONS = Object.freeze({
  ackCompletion: valuesOf(ACK_COMPLETION),
  reconcileRequirement: valuesOf(REQUIREMENT),
  cohort: valuesOf(COHORT),
  coverage: valuesOf(COVERAGE),
  recoveryGate: valuesOf(GATE),
});
const DIMENSION_NAMES = Object.freeze(
  Object.keys(PUBLICATION_ACTIVE_GATE_HANDOFF_DECISION_DIMENSIONS));

const ACTION = PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION;
const RECONCILE = Object.freeze({
  state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
  reasonCode: PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
  nextAction: ACTION.RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
  runtimePromotionAllowed: false,
});
const WAIT = Object.freeze({
  state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
  reasonCode: PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
  nextAction: ACTION.WAIT_OWNER_RECOVERY,
  runtimePromotionAllowed: false,
});
const COHORT_UNAVAILABLE = Object.freeze({
  state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.UNAVAILABLE,
  reasonCode:
    PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.EXPECTED_COHORT_UNAVAILABLE,
  nextAction: ACTION.OBSERVE_OWNER_HANDOFF,
  runtimePromotionAllowed: false,
});
const DEGRADED = Object.freeze({
  state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.DEGRADED,
  reasonCode:
    PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.PUBLISHED_ACTIVE_COVERAGE_INCOMPLETE,
  nextAction: ACTION.OBSERVE_OWNER_HANDOFF,
  runtimePromotionAllowed: false,
});
const COMPLETE = Object.freeze({
  state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.COMPLETE,
  reasonCode: PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.COMPLETE,
  nextAction: ACTION.ADMIT_ACTIVE_GATE,
  runtimePromotionAllowed: true,
});

const NOT_NODE_WAIT = Object.freeze([
  COVERAGE.PUBLISHABLE_MISSING,
  COVERAGE.UNASSIGNED_MISSING,
  COVERAGE.COVERED,
]);

// A row states the values it accepts for the dimensions it names; a dimension
// it does not name accepts every value. Rows are mutually exclusive.
const PUBLICATION_ACTIVE_GATE_HANDOFF_DECISION_TABLE = Object.freeze([
  {
    id: 'acknowledgement_completion_pending',
    when: {ackCompletion: [ACK_COMPLETION.PENDING]},
    outcome: RECONCILE,
  },
  {
    id: 'unpublished_observation_required',
    when: {
      ackCompletion: [ACK_COMPLETION.NONE],
      reconcileRequirement: [REQUIREMENT.REQUIRED],
      coverage: NOT_NODE_WAIT,
    },
    outcome: RECONCILE,
  },
  {
    id: 'expected_cohort_unavailable',
    when: {
      ackCompletion: [ACK_COMPLETION.NONE],
      reconcileRequirement: [REQUIREMENT.NOT_REQUIRED],
      cohort: [COHORT.UNAVAILABLE],
    },
    outcome: COHORT_UNAVAILABLE,
  },
  {
    id: 'expected_cohort_unavailable_node_wait',
    when: {
      ackCompletion: [ACK_COMPLETION.NONE],
      reconcileRequirement: [REQUIREMENT.REQUIRED],
      cohort: [COHORT.UNAVAILABLE],
      coverage: [COVERAGE.NODE_WAIT],
    },
    outcome: COHORT_UNAVAILABLE,
  },
  {
    id: 'missing_node_publishable',
    when: {
      ackCompletion: [ACK_COMPLETION.NONE],
      reconcileRequirement: [REQUIREMENT.NOT_REQUIRED],
      cohort: [COHORT.AVAILABLE],
      coverage: [COVERAGE.PUBLISHABLE_MISSING],
    },
    outcome: RECONCILE,
  },
  {
    id: 'node_wait',
    when: {
      ackCompletion: [ACK_COMPLETION.NONE],
      cohort: [COHORT.AVAILABLE],
      coverage: [COVERAGE.NODE_WAIT],
    },
    outcome: WAIT,
  },
  {
    id: 'missing_node_unassigned',
    when: {
      ackCompletion: [ACK_COMPLETION.NONE],
      reconcileRequirement: [REQUIREMENT.NOT_REQUIRED],
      cohort: [COHORT.AVAILABLE],
      coverage: [COVERAGE.UNASSIGNED_MISSING],
    },
    outcome: DEGRADED,
  },
  {
    id: 'covered_recovery_gate_active',
    when: {
      ackCompletion: [ACK_COMPLETION.NONE],
      reconcileRequirement: [REQUIREMENT.NOT_REQUIRED],
      cohort: [COHORT.AVAILABLE],
      coverage: [COVERAGE.COVERED],
      recoveryGate: [GATE.ACTIVE],
    },
    outcome: WAIT,
  },
  {
    id: 'covered_recovery_gate_clear',
    when: {
      ackCompletion: [ACK_COMPLETION.NONE],
      reconcileRequirement: [REQUIREMENT.NOT_REQUIRED],
      cohort: [COHORT.AVAILABLE],
      coverage: [COVERAGE.COVERED],
      recoveryGate: [GATE.CLEAR],
    },
    outcome: COMPLETE,
  },
  {
    // The builder was given no readiness entry, so it did not observe the
    // gate. Coverage is complete; promotion still needs the catch-up fence
    // and a fresh publication epoch (the contract builder).
    id: 'covered_recovery_gate_unobserved',
    when: {
      ackCompletion: [ACK_COMPLETION.NONE],
      reconcileRequirement: [REQUIREMENT.NOT_REQUIRED],
      cohort: [COHORT.AVAILABLE],
      coverage: [COVERAGE.COVERED],
      recoveryGate: [GATE.UNAVAILABLE],
    },
    outcome: COMPLETE,
  },
].map((row) => Object.freeze({
  id: row.id,
  when: Object.freeze(row.when),
  ...row.outcome,
})));

function rowAccepts(row, states) {
  return DIMENSION_NAMES.every((name) =>
    !Object.hasOwn(row.when, name) || row.when[name].includes(states[name]));
}

function enumerateStates() {
  return DIMENSION_NAMES.reduce(
    (combinations, name) => combinations.flatMap((combination) =>
      PUBLICATION_ACTIVE_GATE_HANDOFF_DECISION_DIMENSIONS[name].map((value) =>
        ({...combination, [name]: value}))),
    [{}],
  );
}

function decisionKey(states) {
  return DIMENSION_NAMES.map((name) => states[name]).join('|');
}

// Every combination resolved once; a combination with no row, or with two,
// is a defect in the table and stops the module from loading.
const DECISION_BY_KEY = new Map(enumerateStates().map((states) => {
  const rows = PUBLICATION_ACTIVE_GATE_HANDOFF_DECISION_TABLE.filter((row) =>
    rowAccepts(row, states));
  if (rows.length !== 1) {
    throw new Error(
      `active-gate handoff decision table: ${decisionKey(states)} matches ` +
      `${rows.length} rows (${rows.map((row) => row.id).join(',')})`);
  }
  return [decisionKey(states), rows[0]];
}));

/**
 * The named evidence states of one handoff's node lists.
 * @param {Object} evidence the contract builder's node lists and gate
 * @return {Object} one value per decision dimension
 */
function classifyPublicationActiveGateHandoffEvidence(evidence) {
  const published = new Set(evidence.publishedActiveNodeIds);
  const publishable = evidence.pendingReconcileNodeIds
    .some((nodeId) => !published.has(nodeId));
  let coverage = COVERAGE.COVERED;
  if (publishable) {
    coverage = COVERAGE.PUBLISHABLE_MISSING;
  } else if (evidence.pendingRecoveryNodeIds.length > 0) {
    coverage = COVERAGE.NODE_WAIT;
  } else if (evidence.missingPublishedNodeIds.length > 0) {
    coverage = COVERAGE.UNASSIGNED_MISSING;
  }
  return Object.freeze({
    ackCompletion: evidence.ownerAckCompletionPendingNodeIds.length > 0 ?
      ACK_COMPLETION.PENDING : ACK_COMPLETION.NONE,
    reconcileRequirement: evidence.reconcileRequirement,
    cohort: evidence.expectedNodeIds.length > 0 ?
      COHORT.AVAILABLE : COHORT.UNAVAILABLE,
    coverage,
    recoveryGate: evidence.recoveryGate.state,
  });
}

/**
 * The one row of the table for these evidence states.
 * @param {Object} states one value per decision dimension
 * @return {Object} the row: id, state, reasonCode, nextAction, promotion
 */
function decidePublicationActiveGateHandoffStates(states) {
  const row = DECISION_BY_KEY.get(decisionKey(states));
  if (!row) {
    throw new TypeError(
      `active-gate handoff evidence state is not named: ${decisionKey(states)}`);
  }
  return row;
}

function decidePublicationActiveGateHandoff(evidence) {
  return decidePublicationActiveGateHandoffStates(
    classifyPublicationActiveGateHandoffEvidence(evidence));
}

export {
  PUBLICATION_ACTIVE_GATE_HANDOFF_DECISION_DIMENSIONS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_DECISION_TABLE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_EVIDENCE_STATE,
  classifyPublicationActiveGateHandoffEvidence,
  decidePublicationActiveGateHandoff,
  decidePublicationActiveGateHandoffStates,
};
