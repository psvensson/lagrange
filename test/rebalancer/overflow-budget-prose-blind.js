// The prose-blind projection (quest overflow-budget-audit-evidence-binding,
// the owner's freeze invariant).
//
// The invariant: a reader who sees only the structured matrix and the
// validated receipts, and reads NO explanatory prose, can still determine
// exactly what proposition each disposition asserts and what evidence proves
// it. This module is the machine form of that reader.
//
// It declares, by name, which fields are free text. Everything it does not
// name is structural and is left alone. It then NEUTRALISES every free-text
// value - replacing it with a fixed placeholder rather than deleting the key
// - and the projection is what the validator and the gate derivation are run
// against. Neutralising rather than deleting is deliberate and is the one
// place this implementation is weaker than "strip": a field's PRESENCE can
// still carry a structural bit, and `censusMovementCondition` is exactly such
// a case in the inherited matrix - it is the only thing that distinguishes
// `depends_only_when_census_moved` from `depends`. `presenceBoundFields`
// below measures that rather than hiding it: it deletes each free-text field
// in turn and reports the ones whose ABSENCE changes validation. That result
// is a finding about the inherited rows, not something this quest repairs.
//
// Out of scope, and said plainly: section-level prose (the method notes, the
// limits, the grant-rule target's verbatim quotations of an owner's words) is
// not projected. Those are verbatim pins of someone's exact words, which the
// validator compares for identity rather than reads for meaning.
const PLACEHOLDER = 'structural placeholder';

// Free text on a ROW: narration a reader could skip. `formationEvidence.text`
// is deliberately NOT here - it is a sentinel (`none_recorded`) the
// disposition discipline compares for identity, not prose.
const ROW_FREE_TEXT = Object.freeze(['path', 'triggeringState',
  'currentGuardReason', 'semanticOwnerReason', 'proposedAuthorizationKindNote',
  'mintingEvidenceAvailable', 'validationEvidenceAvailable',
  'stillUnclassifiedBecause', 'groupingCriterion', 'requirementToClassify',
  'dependencyUnknownBecause', 'censusMovementCondition',
  'ledgerAuthorityResult']);
const ROW_NESTED_FREE_TEXT = Object.freeze({
  budgetDifferentialWitness: Object.freeze(['state']),
  budgetIndependenceMeasurement: Object.freeze(['statesInWhichItHolds']),
  provedUnreachableDomain: Object.freeze(['statement', 'codeArgument']),
  domainQualification: Object.freeze(['statement', 'codeArgument']),
  formationEvidence: Object.freeze(['attributionArgument']),
});
// `doesNotImply` is NOT here: it is a closed-enum token, which is structure.
const FINDING_FREE_TEXT = Object.freeze(['text', 'justification']);
const GATE_FREE_TEXT = Object.freeze(['text', 'note']);
const SLICE_FREE_TEXT = Object.freeze(['statement', 'createdBy']);
// Every declared free-text field name, for a verifier to attack as one list.
const FREE_TEXT_FIELD_NAMES = Object.freeze([
  ...ROW_FREE_TEXT,
  ...Object.values(ROW_NESTED_FREE_TEXT).flatMap((names) => [...names]),
  ...FINDING_FREE_TEXT, ...GATE_FREE_TEXT, ...SLICE_FREE_TEXT,
]);

function neutralise(container, names) {
  for (const name of names) {
    if (typeof container[name] === 'string') {
      container[name] = PLACEHOLDER;
    }
  }
}

function neutraliseRow(row) {
  neutralise(row, ROW_FREE_TEXT);
  for (const [holder, names] of Object.entries(ROW_NESTED_FREE_TEXT)) {
    if (row[holder] && typeof row[holder] === 'object') {
      neutralise(row[holder], names);
    }
  }
  for (const item of row.evidence || []) {
    item.text = PLACEHOLDER;
  }
}

/**
 * The matrix and the receipts as a prose-blind reader sees them.
 * @param {Object} matrix the decision matrix
 * @param {Object} store the evidence receipts
 * @return {Object} {matrix, store} with every declared free-text value
 *   replaced by a fixed placeholder
 */
function proseBlindProjection(matrix, store) {
  const projected = structuredClone(matrix);
  const receipts = structuredClone(store);
  for (const row of projected.rows) {
    neutraliseRow(row);
  }
  for (const finding of projected.findings) {
    neutralise(finding, FINDING_FREE_TEXT);
  }
  for (const entry of projected.gate) {
    neutralise(entry, GATE_FREE_TEXT);
  }
  // The slice registry's prose goes; its structural PREDICATE stays, which
  // is what a prose-blind reader needs to know which states a row covers.
  for (const slice of receipts.slices || []) {
    neutralise(slice, SLICE_FREE_TEXT);
  }
  return {matrix: projected, store: receipts};
}

/**
 * The closed-form proposition one row asserts, derived from STRUCTURE alone:
 * what it is disposed as, which proposition that disposition claims, what the
 * budget dependency is, what is reachable, and which receipts - of which
 * kinds, proving which values, in which domains - carry it.
 * @param {Object} row one matrix row
 * @param {Object} store the evidence receipts
 * @return {Object} the proposition
 */
function structuralProposition(row, store) {
  return {
    disposition: row.enforcementDisposition,
    unreachableSubject: row.unreachableSubject ?? null,
    dependency: row.currentBudgetDependency,
    guardReachable: row.guardReachable.value,
    producerReachable: row.producerReachable.value,
    admissionClasses: [...row.admissionClasses],
    proposedAuthorizationKind: row.proposedAuthorizationKind,
    receipts: [...row.receipts].sort().map((id) => {
      const receipt = store.receipts.find((entry) => entry.id === id);
      return receipt === undefined ? {id, missing: true} : {
        id, kind: receipt.kind, field: receipt.field ?? null,
        expected: receipt.expected ?? null, sliceId: receipt.sliceId ?? null,
        measuredPartitions: receipt.measuredPartitions,
        producerId: receipt.producerId ?? null, result: receipt.result,
      };
    }),
  };
}

export {
  FREE_TEXT_FIELD_NAMES,
  PLACEHOLDER,
  ROW_FREE_TEXT,
  proseBlindProjection,
  structuralProposition,
};
