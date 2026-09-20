// The audit's evidence receipts: what a measuring RUN observed (quest
// overflow-budget-audit-evidence-binding, D2, repaired after verification
// round 1).
//
// Round 1 rejected the first attempt at this module for a reason worth
// stating plainly: the emitters looped the matrix rows and took the row id,
// the proof kind, the domain and the producer FROM THE ROW. The receipt then
// agreed with the row by construction, so an attacker who edited the matrix
// and regenerated got green receipts for claims nothing had measured - a
// ledger row holding a receipt from a drive on another partition, and a
// still-unclassified ADD row escaping into the hand-off subject.
//
// So a receipt here names no row. It names what the run observed:
//   - measuredPartitions: the partition ids this measurement actually
//     evaluated or drove;
//   - sliceId: which STATE SLICE it restricted to, from the registry below,
//     whose predicate descriptor is structural and is checked against the
//     predicate function the measuring test uses;
//   - producerId and observedOperationType: taken at the CALL SITE of the
//     drive, from the owner that was invoked and the move the real builder
//     produced;
//   - the counters the loop incremented.
//
// The VALIDATOR does the matching: a row's evidence must cover the row's own
// partition class, restrict to the slice its dependency and subject require,
// and - where the slice is a state some producer creates - be linked to that
// producer by a provenance receipt naming a producer the row declares. Row
// binding is the validator proving the measurement is ABOUT the row, never
// an emitter stamping a row id on it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const EPIC_DIR = path.join('solve', 'epics', 'formation-seed-decoupling');
const EVIDENCE_RECEIPTS_JSON =
  path.join(EPIC_DIR, 'overflow-budget-evidence-receipts.json');
const RECEIPTS_SCHEMA = 'overflow-budget-evidence-receipts/2';
const QUEST_ID = 'overflow-budget-audit-evidence-binding';
const RECEIPT_EMIT_DIR_ENV = 'LAGRANGE_AUDIT_RECEIPT_EMIT_DIR';

// ONE RECEIPT KIND PER PROOF SHAPE.
const GUARD_UNREACHABILITY_KIND = 'guard-unreachability';
const INDEPENDENCE_KIND = 'budget-independence-differential';
const DEPENDENCE_KIND = 'budget-dependence';
const NOT_DRIVEN_KIND = 'producer-not-driven';
const REACHABILITY_KIND = 'producer-reachability';
const GUARD_REACHABILITY_KIND = 'guard-reachability';
const SLICE_PROVENANCE_KIND = 'slice-provenance';
// The guard-visible state observed on a real DRIVE, and the arithmetic
// dimension of the guard, which has no partition dimension at all.
const GUARD_STATE_DRIVE_KIND = 'guard-state-drive';
const ARITHMETIC_KIND = 'arithmetic-admission-class';
// What a measurement is a measurement OF. A row's pinned round-3 witness is
// read through this: an arithmetic witness measures classes, a drive measures
// one partition, the grid measures the partition dimension.
const DIMENSION = Object.freeze({
  PARTITION: 'partition', ARITHMETIC: 'arithmetic', DRIVE: 'drive',
  CENSUS: 'census',
});
const DEPENDENCY_KINDS = Object.freeze([GUARD_UNREACHABILITY_KIND,
  INDEPENDENCE_KIND, DEPENDENCE_KIND, NOT_DRIVEN_KIND]);
const DEPENDENCY_FIELD = 'currentBudgetDependency';
const GUARD_REACHABILITY_FIELD = 'guardReachable';
const REACHABILITY_FIELD = 'producerReachable';
const REACHABLE = 'yes';
const UTF8 = 'utf8';
const JSON_INDENT = 2;
const NEWLINE = '\n';
const EMIT_SUFFIX = '.json';
const NO_STATES = 0;
const ID_SEPARATOR = '/';

// THE STATE SLICES. A slice is a set of states described STRUCTURALLY - the
// registry is the definition, not the prose - and `createdBy` says whether
// the slice is a state some producer brings about. A measuring test's own
// predicate function is checked against the descriptor before it may emit.
const VOTER_CENSUS = Object.freeze({
  ANY: 'any', EQUALS_TARGET: 'equals-target', ABOVE_TARGET: 'above-target',
});
const STATE_SLICES = Object.freeze([
  Object.freeze({
    id: 'whole-stated-grid',
    statement: 'every state of the exhaustive promotion-guard grid',
    predicate: Object.freeze({voterCensus: VOTER_CENSUS.ANY,
      ownedAddLikeOperation: null, operationType: null}),
    createdBy: null,
  }),
  Object.freeze({
    id: 'relocation-handoff',
    statement: 'the states a single promote-then-remove RELOCATION hand-off ' +
      'creates: the voter census equals the target and this learner owns ' +
      'the REPLACE that put it there',
    predicate: Object.freeze({voterCensus: VOTER_CENSUS.EQUALS_TARGET,
      ownedAddLikeOperation: true, operationType: 'REPLACE'}),
    createdBy: 'a producer that emits a relocation REPLACE',
  }),
  Object.freeze({
    id: 'census-moved',
    statement: 'the states in which the voter census already stands above ' +
      'the declared target',
    predicate: Object.freeze({voterCensus: VOTER_CENSUS.ABOVE_TARGET,
      ownedAddLikeOperation: null, operationType: null}),
    createdBy: null,
  }),
  Object.freeze({
    id: 'producer-add-at-target',
    statement: 'the states an ADD producer itself creates: the voter census ' +
      'equals the target and this learner owns the ADD that put it there',
    predicate: Object.freeze({voterCensus: VOTER_CENSUS.EQUALS_TARGET,
      ownedAddLikeOperation: true, operationType: 'ADD'}),
    // No provenance requirement: the ADD operation type in the descriptor
    // already restricts which rows may cite it, and this audit drives no
    // ledger-side ADD producer to link it further.
    createdBy: null,
  }),
]);
const SLICE_IDS = Object.freeze(STATE_SLICES.map((slice) => slice.id));

/**
 * The registry's own slice predicate, as a function. A measuring test asks
 * for it rather than writing its own, so the states a receipt speaks for are
 * the states the descriptor describes.
 * @param {string} sliceId the slice
 * @return {Function} (state) => boolean over {voters, target, owned,
 *   operations, operationType}
 */
function sliceMatcher(sliceId) {
  const slice = STATE_SLICES.find((entry) => entry.id === sliceId);
  assert.ok(slice, `a measurement restricts to a registered slice: ${sliceId}`);
  const wanted = slice.predicate;
  return (state) => {
    if (wanted.voterCensus === VOTER_CENSUS.EQUALS_TARGET &&
        state.voters !== state.target) {
      return false;
    }
    if (wanted.voterCensus === VOTER_CENSUS.ABOVE_TARGET &&
        state.voters <= state.target) {
      return false;
    }
    if (wanted.ownedAddLikeOperation === true &&
        !(state.owned && state.operations > NO_STATES)) {
      return false;
    }
    return wanted.operationType === null ||
      wanted.operationType === state.operationType;
  };
}

function sliceDescriptor(sliceId) {
  return STATE_SLICES.find((entry) => entry.id === sliceId) ?? null;
}

// THE witnesses of this audit, as a code constant. The emission check runs
// exactly these; discovering them from the store it is checking would let a
// store that dropped a witness's receipts pass by omission.
const MEASURING_WITNESSES = Object.freeze([
  Object.freeze({file: 'test/partition/overflow-budget-unmintable-partitions.test.js',
    test: 'every unmintable admitted partition is audited on the real guard'}),
  Object.freeze({file: 'test/partition/overflow-budget-admitted-case-grid.test.js',
    test: 'every budget-admitted state grid row maps to exactly one admission class'}),
  Object.freeze({file: 'test/rebalancer/overflow-budget-unhealthy-source-replace.test.js',
    test: 'the priority-recovery relocation REPLACE is traced end to end and classified'}),
  Object.freeze({file: 'test/rebalancer/overflow-budget-mintable-five-routes.test.js',
    test: 'every alternate route to the five carries the mint or is a matrix row'}),
  Object.freeze({file: 'test/rebalancer/overflow-budget-add-like-producer-census.test.js',
    test: 'every production producer of an add-like operation is in the matrix'}),
]);

/**
 * Canonical JSON: keys sorted at every depth.
 * @param {*} value anything JSON can hold
 * @return {string} the canonical serialization
 */
function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

// Every state of the slice was EVALUATED TWICE, and the counts say so.
function evaluatedTwiceOverTheSlice(result) {
  return result.statesEnumerated > NO_STATES &&
    result.evaluationsWithActualBudget === result.statesEnumerated &&
    result.evaluationsWithBudgetForcedToZero === result.statesEnumerated;
}

// One definition of "difference" for every differential kind: the guard's
// admission decision changed when the budget was forced to zero, counted
// over the states of THIS receipt's slice and no others.
const RESULT_DISCIPLINE = Object.freeze({
  [GUARD_UNREACHABILITY_KIND]: (result) =>
    evaluatedTwiceOverTheSlice(result) &&
    result.statesWhereTheCompletionOwnerWasConsulted === NO_STATES &&
    result.statesWithANonZeroBudget === NO_STATES &&
    result.admissionDifferences === NO_STATES,
  [INDEPENDENCE_KIND]: (result) =>
    evaluatedTwiceOverTheSlice(result) &&
    result.statesWhereTheCompletionOwnerWasConsulted > NO_STATES &&
    result.admissionDifferences === NO_STATES,
  [DEPENDENCE_KIND]: (result) =>
    evaluatedTwiceOverTheSlice(result) &&
    result.admissionDifferences > NO_STATES,
  [NOT_DRIVEN_KIND]: (result) =>
    result.producerDriven === false && result.statesEnumerated === NO_STATES,
});
const DEPENDENCY_BY_KIND = Object.freeze({
  [GUARD_UNREACHABILITY_KIND]: 'unreachable_in_stated_domain',
  [INDEPENDENCE_KIND]: 'does_not_depend',
  [DEPENDENCE_KIND]: 'depends',
  [NOT_DRIVEN_KIND]: 'unknown_producer_not_driven',
});

/**
 * The dependency value one receipt's kind and numbers support.
 * @param {Object} receipt one dependency receipt
 * @return {string|null} the value, or null when the result does not have the
 *   shape its kind requires
 */
function dependencyProvedByReceipt(receipt) {
  const discipline = RESULT_DISCIPLINE[receipt.kind];
  if (discipline === undefined || !discipline(receipt.result)) {
    return null;
  }
  return DEPENDENCY_BY_KIND[receipt.kind];
}

// The kind a differential's own numbers support, so a measuring test does not
// choose what its measurement means.
function differentialKind(result) {
  for (const kind of [GUARD_UNREACHABILITY_KIND, INDEPENDENCE_KIND,
    DEPENDENCE_KIND]) {
    if (RESULT_DISCIPLINE[kind](result)) {
      return kind;
    }
  }
  return null;
}

function assertPartitions(measuredPartitions, where) {
  assert.ok(Array.isArray(measuredPartitions) &&
    measuredPartitions.length > NO_STATES,
  `${where} names the partitions it measured`);
}

function assertWitness(witness, where) {
  assert.ok(witness && typeof witness.file === 'string' &&
    typeof witness.test === 'string',
  `${where} names the witness that produced it`);
  assert.ok(fs.existsSync(witness.file), `${where} names a real file`);
  assert.ok(fs.readFileSync(witness.file, UTF8).includes(witness.test),
    `${where} names a test that file carries`);
}

/**
 * One differential measured over one slice of one partition. The KIND comes
 * from the numbers, not from the caller.
 * @param {Object} input {partitionId, sliceId, witness, result}
 * @return {Object} a frozen receipt
 */
function sliceDifferentialReceipt(input) {
  const kind = differentialKind(input.result);
  const where = [kind, input.sliceId, input.partitionId].join(ID_SEPARATOR);
  assert.ok(kind, `${where} measured a differential of some shape`);
  assert.ok(SLICE_IDS.includes(input.sliceId),
    `${where} restricts to a registered slice`);
  assertWitness(input.witness, where);
  return Object.freeze({
    id: where,
    kind,
    dimension: DIMENSION.PARTITION,
    field: DEPENDENCY_FIELD,
    expected: DEPENDENCY_BY_KIND[kind],
    sliceId: input.sliceId,
    measuredPartitions: Object.freeze([input.partitionId]),
    witness: Object.freeze({...input.witness}),
    result: Object.freeze({holds: true, ...input.result}),
  });
}

/**
 * The guard-visible states of one partition: the completion owner was
 * consulted there, so the guard evaluates this partition at all.
 * @param {Object} input {partitionId, witness, result}
 * @return {Object} a frozen receipt
 */
function guardReachabilityReceipt(input) {
  const where = [GUARD_REACHABILITY_KIND, input.partitionId]
    .join(ID_SEPARATOR);
  assertWitness(input.witness, where);
  assert.ok(input.result.statesWhereTheCompletionOwnerWasConsulted >
    NO_STATES, `${where} observed the guard evaluating this partition`);
  return Object.freeze({
    id: where,
    kind: GUARD_REACHABILITY_KIND,
    dimension: DIMENSION.PARTITION,
    field: GUARD_REACHABILITY_FIELD,
    expected: REACHABLE,
    sliceId: 'whole-stated-grid',
    measuredPartitions: Object.freeze([input.partitionId]),
    witness: Object.freeze({...input.witness}),
    result: Object.freeze({holds: true, ...input.result}),
  });
}

/**
 * A producer was DRIVEN on a partition and the operation it produced reached
 * the guard. The producer id and the operation type are taken at the drive's
 * own call site, never from a matrix row.
 * @param {Object} input {producerId, partitionId, observedOperationType,
 *   witness, facts}
 * @return {Object} a frozen receipt
 */
function producerReachabilityReceipt(input) {
  const where = [REACHABILITY_KIND, input.producerId, input.partitionId]
    .join(ID_SEPARATOR);
  assertWitness(input.witness, where);
  assert.ok(input.facts && Object.keys(input.facts).length > NO_STATES,
    `${where} carries the facts its drive established`);
  assert.ok(typeof input.observedOperationType === 'string',
    `${where} names the operation type the builder produced`);
  return Object.freeze({
    id: where,
    kind: REACHABILITY_KIND,
    dimension: DIMENSION.DRIVE,
    field: REACHABILITY_FIELD,
    expected: REACHABLE,
    producerId: input.producerId,
    observedOperationType: input.observedOperationType,
    measuredPartitions: Object.freeze([input.partitionId]),
    witness: Object.freeze({...input.witness}),
    producerFacts: Object.freeze({...input.facts}),
    result: Object.freeze({holds: true}),
  });
}

/**
 * A producer was driven and the state it created falls in a named slice.
 * This is what links a slice to the producers whose rows may cite it: the
 * grid can enumerate a slice, but only a drive can show whose state it is.
 * @param {Object} input {sliceId, producerId, partitionId,
 *   observedOperationType, witness, facts}
 * @return {Object} a frozen receipt
 */
function sliceProvenanceReceipt(input) {
  const where = [SLICE_PROVENANCE_KIND, input.sliceId, input.producerId]
    .join(ID_SEPARATOR);
  assert.ok(SLICE_IDS.includes(input.sliceId),
    `${where} names a registered slice`);
  assertWitness(input.witness, where);
  assert.ok(input.facts && Object.keys(input.facts).length > NO_STATES,
    `${where} carries the facts its drive established`);
  // The drive must actually have established them: a provenance receipt
  // whose facts are not all true proves nothing about the slice.
  for (const [name, value] of Object.entries(input.facts)) {
    assert.equal(value, true,
      `${where} states a fact its drive established: ${name}`);
  }
  return Object.freeze({
    id: where,
    kind: SLICE_PROVENANCE_KIND,
    dimension: DIMENSION.DRIVE,
    sliceId: input.sliceId,
    producerId: input.producerId,
    observedOperationType: input.observedOperationType,
    measuredPartitions: Object.freeze([input.partitionId]),
    witness: Object.freeze({...input.witness}),
    producerFacts: Object.freeze({...input.facts}),
    result: Object.freeze({holds: true}),
  });
}

/**
 * A producer the census found but nothing drove.
 * @param {Object} input {producerId, measuredPartitions, witness, result}
 * @return {Object} a frozen receipt
 */
function producerNotDrivenReceipt(input) {
  const where = [NOT_DRIVEN_KIND, input.producerId].join(ID_SEPARATOR);
  assertPartitions(input.measuredPartitions, where);
  assertWitness(input.witness, where);
  return Object.freeze({
    id: where,
    kind: NOT_DRIVEN_KIND,
    dimension: DIMENSION.CENSUS,
    // The partitions here are the producer's CENSUSED scope, not something
    // this receipt drove: it is a census echo and says so.
    measuredPartitionsSource: 'producer-census',
    field: DEPENDENCY_FIELD,
    expected: DEPENDENCY_BY_KIND[NOT_DRIVEN_KIND],
    sliceId: null,
    producerId: input.producerId,
    measuredPartitions: Object.freeze([...input.measuredPartitions]),
    witness: Object.freeze({...input.witness}),
    result: Object.freeze({holds: true, ...input.result}),
  });
}

/**
 * The guard-visible state of ONE partition, observed on a real drive rather
 * than enumerated. A row whose pinned round-3 witness is that drive rests on
 * this by membership; the grid adds the rest of its partition class.
 * @param {Object} input {producerId, partitionId, witness, facts}
 * @return {Object} a frozen receipt
 */
function guardStateDriveReceipt(input) {
  const where = [GUARD_STATE_DRIVE_KIND, input.producerId, input.partitionId]
    .join(ID_SEPARATOR);
  assertWitness(input.witness, where);
  assert.ok(input.facts && Object.keys(input.facts).length > NO_STATES,
    `${where} carries what the guard decided`);
  return Object.freeze({
    id: where,
    kind: GUARD_STATE_DRIVE_KIND,
    dimension: DIMENSION.DRIVE,
    field: GUARD_REACHABILITY_FIELD,
    expected: REACHABLE,
    producerId: input.producerId,
    measuredPartitions: Object.freeze([input.partitionId]),
    witness: Object.freeze({...input.witness}),
    guardFacts: Object.freeze({...input.facts}),
    result: Object.freeze({holds: true}),
  });
}

/**
 * One admission class of the ARITHMETIC dimension. The grid that measures it
 * has no partition dimension - it enumerates the count check's arithmetic
 * over constructed states - so the receipt carries no partitions and says so.
 * @param {Object} input {admissionClassId, witness, result}
 * @return {Object} a frozen receipt
 */
function arithmeticAdmissionClassReceipt(input) {
  const where = [ARITHMETIC_KIND, input.admissionClassId].join(ID_SEPARATOR);
  assertWitness(input.witness, where);
  assert.ok(input.result.admittedStates > NO_STATES,
    `${where} found states this class admits`);
  return Object.freeze({
    id: where,
    kind: ARITHMETIC_KIND,
    dimension: DIMENSION.ARITHMETIC,
    admissionClassId: input.admissionClassId,
    // No partition dimension: this witness measures arithmetic, and a row
    // may never take partition coverage from it.
    measuredPartitions: null,
    witness: Object.freeze({...input.witness}),
    result: Object.freeze({holds: true, ...input.result}),
  });
}

function readCommittedStore() {
  if (!fs.existsSync(EVIDENCE_RECEIPTS_JSON)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(EVIDENCE_RECEIPTS_JSON, UTF8));
}

/**
 * A measuring test's last act: emit what it observed and assert it is what
 * the repository carries. In collection mode it writes instead, so the
 * emission check can compare a fresh emission with the committed file.
 * @param {string} fileKey a stable name for the emitting file
 * @param {Array<Object>} receipts the receipts this run produced
 * @return {void}
 */
function emitAndAssertReceipts(fileKey, receipts) {
  const directory = process.env[RECEIPT_EMIT_DIR_ENV];
  if (typeof directory === 'string' && directory.length > NO_STATES) {
    fs.mkdirSync(directory, {recursive: true});
    fs.writeFileSync(path.join(directory, `${fileKey}${EMIT_SUFFIX}`),
      `${JSON.stringify(receipts, null, JSON_INDENT)}${NEWLINE}`);
    return;
  }
  const store = readCommittedStore();
  assert.ok(store, `the repository carries ${EVIDENCE_RECEIPTS_JSON}`);
  const byId = new Map(store.receipts.map((entry) => [entry.id, entry]));
  for (const receipt of receipts) {
    const committed = byId.get(receipt.id);
    assert.ok(committed,
      `the committed receipts carry this measurement: ${receipt.id}`);
    assert.equal(canonicalJson(receipt), canonicalJson(committed),
      `the committed receipt is the one this measurement produced: ${
        receipt.id}`);
  }
}

/**
 * The whole receipt file, from a collected emission.
 * @param {Array<Object>} receipts every emitted receipt
 * @return {Object} the store
 */
function buildReceiptStore(receipts) {
  return {
    schema: RECEIPTS_SCHEMA,
    quest: QUEST_ID,
    slices: STATE_SLICES.map((slice) => ({...slice})),
    receipts: [...receipts]
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export {
  ARITHMETIC_KIND,
  MEASURING_WITNESSES,
  DIMENSION,
  DEPENDENCE_KIND,
  GUARD_STATE_DRIVE_KIND,
  DEPENDENCY_KINDS,
  EVIDENCE_RECEIPTS_JSON,
  GUARD_REACHABILITY_KIND,
  GUARD_UNREACHABILITY_KIND,
  INDEPENDENCE_KIND,
  NOT_DRIVEN_KIND,
  RECEIPTS_SCHEMA,
  RECEIPT_EMIT_DIR_ENV,
  REACHABILITY_KIND,
  SLICE_IDS,
  SLICE_PROVENANCE_KIND,
  STATE_SLICES,
  arithmeticAdmissionClassReceipt,
  buildReceiptStore,
  canonicalJson,
  guardStateDriveReceipt,
  dependencyProvedByReceipt,
  emitAndAssertReceipts,
  guardReachabilityReceipt,
  producerNotDrivenReceipt,
  producerReachabilityReceipt,
  sliceDescriptor,
  sliceDifferentialReceipt,
  sliceMatcher,
  sliceProvenanceReceipt,
};
