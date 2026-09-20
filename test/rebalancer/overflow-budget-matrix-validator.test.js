// AUDIT-WITNESS-KIND: guard-grid
// This file drives owners over constructed states. It proves GUARD
// behaviour, never that a production producer can reach that state.
// The validator over the audit's three artifacts (quest
// critical-spread-overflow-budget-audit, receipt
// matrix-and-gate-are-complete-and-in-sync).
//
// It is STRUCTURAL, not descriptive. A field that merely exists proves
// nothing, so every claim in the matrix has to carry the receipt its own
// kind requires:
//
//   - each of the five dependency values carries its own receipt:
//     does_not_depend needs a named differential over the complete stated
//     domain, depends needs a state in which only the budget changes the
//     result, and the other three say structurally why no differential
//     exists;
//   - reachability is TWO claims: producerReachable yes is refused unless
//     its witness test declares itself a real-chain witness in a machine
//     -checkable marker, and a hand-built grid can only prove guard
//     behaviour;
//   - a lab entry either cites one of the owner's four attribution forms or
//     reads the unattributed sentence verbatim, and then upgrades nothing;
//   - a disposition of proved-unreachable or proved-obsolete carries a
//     structured proof, claims no admission class, covers no partition the
//     budget is evaluated for, and cites no formation witness;
//   - a proved-unreachable domain names the grid test that IS its domain,
//     with the same parameter ranges, and may not argue from observation;
//   - a row whose producers can emit a REPLACE, or whose condition is not one
//     of the policy's own spread-cure conditions, may not name the policy as
//     its semantic owner;
//   - no free-text field of any row argues from how often something happened;
//   - every gate status is DERIVED from the contract beside the derivation,
//     and it is MONOTONIC: six mutants that delete a row, a finding, a test,
//     a requirement, a blocking decision or a repair group are each proved
//     unable to promote an item;
//   - the epoch inventory may not claim completeness while unresolved
//     version-like entries remain.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  PLACEMENT_CURE_BY_CONDITION,
  resolvePlacementCure,
} from '../../src/rebalancer/replica-placement-cure-policy.js';
import {MOVE_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {
  deriveGateStatus,
  findingIsGateBlocking,
  renderRowSelection,
  gateContractFor,
  openGateFindings,
  renderDecisionMatrixMarkdown,
  renderEnforcementGateMarkdown,
  renderEpochInventoryMarkdown,
  selectGateRows,
  unmetGateRequirements,
} from './overflow-budget-audit-render.js';
import {
  EPOCH_INVENTORY_JSON,
  EPOCH_INVENTORY_MARKDOWN,
  GATE_MARKDOWN,
  MATRIX_JSON,
  MATRIX_MARKDOWN,
  measurePartitionSets,
  readJsonArtifact,
  readTextArtifact,
} from './overflow-budget-audit-support.js';
import {
  ARITHMETIC_KIND,
  DEPENDENCE_KIND,
  STATE_SLICES,
  DEPENDENCY_KINDS,
  DIMENSION,
  GUARD_STATE_DRIVE_KIND,
  EVIDENCE_RECEIPTS_JSON,
  GUARD_REACHABILITY_KIND,
  GUARD_UNREACHABILITY_KIND,
  INDEPENDENCE_KIND,
  NOT_DRIVEN_KIND,
  REACHABILITY_KIND,
  RECEIPTS_SCHEMA,
  SLICE_PROVENANCE_KIND,
  dependencyProvedByReceipt,
  sliceDescriptor,
} from './overflow-budget-receipt-emission.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

const DISPOSITIONS = Object.freeze(['explicit-authority-required',
  'proved-unreachable', 'proved-obsolete', 'still-unclassified']);
const PROVED = Object.freeze(['proved-unreachable', 'proved-obsolete']);
const UNREACHABLE = 'unreachable_in_stated_domain';
// The five dependency values and the answer each one owes question six.
const BUDGET_REMOVAL_BY_DEPENDENCY = Object.freeze({
  depends: true,
  depends_only_when_census_moved: 'only_when_the_census_moved',
  does_not_depend: false,
  unknown_producer_not_driven: 'unknown',
  unreachable_in_stated_domain: false,
});
const REACHABILITY_VALUES = Object.freeze(['yes', 'no', 'unproven']);
// The owner's four attribution forms, and the sentence for a witness that
// cites none of them.
const ATTRIBUTION_FORMS = Object.freeze([
  'operation-or-producer-id-correlation',
  'payload-uniquely-attributable-to-one-producer',
  'trace-naming-the-producing-owner',
  'structural-proof-excluding-the-other-producers']);
const UNATTRIBUTED =
  'lab witness: transition observed; producer unattributed';
const REAL_CHAIN_MARKER = '// AUDIT-WITNESS-KIND: real-chain';
const WITNESS_KIND_MARKER = /^\/\/ AUDIT-WITNESS-KIND: (real-chain|guard-grid)$/mu;
const GATE_STATUSES = Object.freeze(['demonstrated', 'not-yet',
  'blocked-on-owner-decision']);
const PROMOTED_STATUS = 'demonstrated';
const REQUIRED_ROW_FIELDS = Object.freeze(['path', 'partitionClass',
  'triggeringState', 'currentGuardReason', 'currentBudgetDependency',
  'semanticOwner', 'proposedAuthorizationKind', 'mintingEvidenceAvailable',
  'validationEvidenceAvailable', 'guardReachable', 'producerReachable',
  'enforcementDisposition', 'formationEvidence', 'evidence',
  'producerOperationTypes']);
const EVIDENCE_LABELS = Object.freeze(
  ['MEASURED', 'CODE', 'SCRATCH-PROVEN', 'INFERRED']);
const NONE_WITNESS = 'none';
const NO_FORMATION = 'none_recorded';
const RELATIVE_IMPORT = /from '(\.\/[\w.-]+\.js)'/gu;
const TEST_WITNESS = /^test\/[\w./-]+\.js:.+$/u;
// A witness, a triggering state, an evidence line or a domain may not argue
// from how often something was seen.
const FREQUENCY_WORDS = Object.freeze(['often', 'frequently', 'usually',
  'rarely', 'commonly', 'seldom', 'most runs', 'every run',
  'never observed', 'not observed', 'typically', 'rarely seen',
  'hardly ever', 'almost always']);
// A DOMAIN is a set of states, never a record of what was watched. These
// words in a domain mean the domain is an observation, which is not a proof.
const OBSERVATIONAL_WORDS = Object.freeze(['lab', 'formation', 'observed',
  'seen', 'run ', 'runs', 'witness']);
// Rule 7: no claim of completeness while unresolved entries remain.
const COMPLETENESS_WORDS = Object.freeze(['is complete', 'are complete',
  'complete by', 'is closed', 'are closed', 'closes the domain',
  'exhaustive', 'nothing is missing']);
const SPREAD_CURE_POLICY = 'src/rebalancer/replica-placement-cure-policy.js';
const REPLACE_TYPE = 'REPLACE';
const MINTS_TODAY = 'five-minted-spread-cure-add';
const AUTHORITY_REQUIRED = 'explicit-authority-required';
const UNRESOLVED_GROUP = 'unresolved-version-like-value';
// What a finding may say it does NOT imply: a closed enum, so the disclaimer
// is checkable rather than a sentence a reader has to weigh.
const DOES_NOT_IMPLY = Object.freeze(['no-row-requires-authority']);
// A row whose pinned round-3 guard witness measures the ARITHMETIC dimension
// while the row claims no admission class: that witness measures nothing
// row-specific, so guardReachable=yes rests on the partition-dimension grid
// alone. It states nothing false, so it is not a discrepancy - but a vacuous
// pass is not allowed to be silent, and the set is derived and declared.
const VACUOUS_ARITHMETIC_ID =
  'arithmetic-witness-measures-nothing-row-specific';
const INHERITED_WEAKNESS_IDS = Object.freeze([
  'blocking-findings-are-listed-but-not-required',
  'ledger-rows-are-witnessed-by-a-five-partition-drive',
  VACUOUS_ARITHMETIC_ID]);
const FINDING_KEYS = Object.freeze(['id', 'label', 'text', 'gateItems',
  'contradicts', 'resolution', 'justification', 'doesNotImply']);
const RESOLUTION_KEYS = Object.freeze(['kind', 'path']);
const ARTIFACT_KEYS =
  Object.freeze(['id', 'kind', 'path', 'statement']);
// A placeholder cannot be caught by scanning the DOCUMENT: inherited prose
// says "returns null" and even ends a value with the word. So the guard is
// at the only place a placeholder can originate - the renderer refuses to
// interpolate one - and this test proves that refusal is live.
const PLACEHOLDER_VALUES =
  Object.freeze([undefined, null, Number.NaN, {}]);
// A rendered VALUE that came out undefined or null - the round-1 defect was
// exactly this, on the two corrected rows. Prose that mentions the word (a
// reader returning null) is not a placeholder, so the check is anchored to
// the value position of a rendered field.

const DOES_NOT_DEPEND = 'does_not_depend';
const NO_KIND = 'none';
const NO_STATES = 0;
// The unreachable SUBJECT: a closed two-value enum inside the existing
// proved-unreachable disposition. Round 3's document let that disposition
// mean only the first of these, so the two hand-off rows - whose guard state
// IS reachable and whose measured dependency IS does_not_depend - could not
// take it without falsifying two upheld measurements. Naming the subject
// separates the two propositions the disposition carried (R07); it adds no
// disposition, dependency value, class or row.
const GUARD_STATE_SUBJECT = 'guard-admission-state';
const AUTHORITY_SUBJECT = 'budget-dependent-authority-requirement';
// A closed enum: what a qualification may say stays reachable, and nothing
// else. `guard-state` is cross-checked against the row's own reachability.
const REACHABLE_ASPECTS = Object.freeze(['operation', 'guard-state']);
const GUARD_STATE_ASPECT = 'guard-state';
const REMAINS_REACHABLE = REACHABLE_ASPECTS;
// THE PROOF DISCIPLINE IS SELECTED BY SUBJECT, from this table. There is no
// branch on a row id anywhere in this file: a row is disciplined by the
// proposition it states, so renaming a row changes nothing and stating a
// different proposition changes everything.
const SUBJECT_DISCIPLINE = Object.freeze({
  [GUARD_STATE_SUBJECT]: Object.freeze({
    dependency: UNREACHABLE,
    sliceId: 'whole-stated-grid',
    guardReachable: 'no',
    producerReachableAllowed: null,
    partitionsAreBudgetEvaluated: false,
    requiresGridDomain: true,
    requiresQualification: false,
  }),
  [AUTHORITY_SUBJECT]: Object.freeze({
    dependency: DOES_NOT_DEPEND,
    sliceId: 'relocation-handoff',
    guardReachable: 'yes',
    producerReachableAllowed: Object.freeze(['yes', 'unproven']),
    partitionsAreBudgetEvaluated: true,
    requiresGridDomain: false,
    requiresQualification: true,
  }),
});
const UNREACHABLE_SUBJECTS = Object.freeze(Object.keys(SUBJECT_DISCIPLINE));
// A qualification is checked STRUCTURALLY first; this scan only stops the
// prose contradicting the structure.
const FORBIDDEN_UNREACHABILITY = Object.freeze([
  'the relocation is unreachable', 'relocation itself is unreachable',
  'the operation is unreachable', 'the replacement is unreachable']);

// The evidence receipts, indexed. A row proves nothing by naming a test or
// by a receipt naming it back: it cites MEASUREMENTS, and every rule below
// asks whether the measurement is about this row - whether it covers this
// row's partitions, restricts to the slice this row's classification
// requires, and, where the slice is a state a producer brings about, is
// linked to a producer this row declares.
function readEvidenceReceipts() {
  assert.ok(fs.existsSync(EVIDENCE_RECEIPTS_JSON),
    `the measuring tests' receipts are committed: ${EVIDENCE_RECEIPTS_JSON}`);
  const store = readJsonArtifact(EVIDENCE_RECEIPTS_JSON);
  assert.equal(store.schema, RECEIPTS_SCHEMA,
    'the receipt file names its schema');
  const byId = new Map();
  for (const receipt of store.receipts) {
    assert.equal(byId.has(receipt.id), false,
      `receipt ids are unique: ${receipt.id}`);
    byId.set(receipt.id, receipt);
  }
  return {byId};
}

// Which measurement each classification requires. The slice is the load
// -bearing part: a value is proved over the states it is a claim about, and
// over no others.
// A composite value (the census-conditional one) is proved by the
// CONJUNCTION of its groups, so each group states what its own kind proves.
const EVIDENCE_BY_DEPENDENCY = Object.freeze({
  unreachable_in_stated_domain: Object.freeze([Object.freeze(
    {sliceId: 'whole-stated-grid', kind: GUARD_UNREACHABILITY_KIND,
      proves: UNREACHABLE})]),
  does_not_depend: Object.freeze([Object.freeze(
    {sliceId: 'relocation-handoff', kind: INDEPENDENCE_KIND,
      proves: DOES_NOT_DEPEND})]),
  depends: Object.freeze([Object.freeze(
    {sliceId: 'whole-stated-grid', kind: DEPENDENCE_KIND, proves: 'depends'})]),
  // The budget decides where the census has already moved, and decides
  // nothing in the states the ADD producer itself creates.
  depends_only_when_census_moved: Object.freeze([
    Object.freeze({sliceId: 'census-moved', kind: DEPENDENCE_KIND,
      proves: 'depends'}),
    Object.freeze({sliceId: 'producer-add-at-target', kind: INDEPENDENCE_KIND,
      proves: DOES_NOT_DEPEND})]),
  unknown_producer_not_driven: Object.freeze([Object.freeze(
    {sliceId: null, kind: NOT_DRIVEN_KIND,
      proves: 'unknown_producer_not_driven'})]),
});

function boundReceipts(row, receipts) {
  assert.ok(Array.isArray(row.receipts) && row.receipts.length > 0,
    `row ${row.id} cites the measurements that prove it`);
  return row.receipts.map((id) => {
    const receipt = receipts.byId.get(id);
    assert.ok(receipt, `row ${row.id} cites a known measurement: ${id}`);
    return receipt;
  });
}

function sortedIds(values) {
  return [...new Set(values)].sort();
}

function canonicalOf(value) {
  return JSON.stringify(value);
}

// A stray truthy field is how a forged claim gets carried: these objects
// have closed key sets.
function assertClosedKeys(object, allowed, where) {
  for (const key of Object.keys(object)) {
    assert.ok(allowed.includes(key),
      `${where} carries only its declared keys: ${key}`);
  }
}

// The declared discrepancies name real rows, once each; the inherited
// weaknesses are exactly the three recorded ids.
function assertCorrectionHygiene(matrix, rowIds) {
  const declared = matrix.correctionToRound3.witnessDiscrepancies || [];
  const seen = new Set();
  for (const entry of declared) {
    assert.ok(rowIds.has(entry.row),
      `a declared discrepancy names an existing row: ${entry.row}`);
    assert.equal(seen.has(entry.row), false,
      `and names it once: ${entry.row}`);
    seen.add(entry.row);
  }
  assert.deepEqual(
    sortedIds((matrix.correctionToRound3.inheritedWeaknesses || [])
      .map((weakness) => weakness.id)),
    sortedIds(INHERITED_WEAKNESS_IDS),
    'the recorded inherited weaknesses are exactly the three this quest ' +
      'found and did not repair');
}

// The slice is a state some PRODUCER brings about, so a row may cite it only
// when a drive showed a producer THIS row declares creating that state. This
// is what stops a row from escaping into another row's classification: the
// grid can enumerate any slice, but only a drive can say whose states they
// are.
function assertSliceProvenance(row, sliceId, cited, descriptor) {
  const provenance = cited.filter((receipt) =>
    receipt.kind === SLICE_PROVENANCE_KIND && receipt.sliceId === sliceId);
  assert.equal(provenance.length, 1,
    'a row citing a producer-created slice cites the drive that showed a ' +
      `producer creating it: ${row.id} / ${sliceId} (${descriptor.createdBy})`);
  const receipt = provenance[0];
  assert.ok(row.producers.includes(receipt.producerId),
    'and that producer is one THIS row declares: ' +
      `${row.id} / ${receipt.producerId}`);
  assert.ok(row.producerOperationTypes.includes(receipt.observedOperationType),
    'and the operation it produced is one this row produces: ' +
      `${row.id} / ${receipt.observedOperationType}`);
  // The drive established every fact the provenance states, or it does not
  // license the slice.
  const facts = Object.entries(receipt.producerFacts);
  assert.ok(facts.length > NO_STATES,
    `and carries the facts it established: ${row.id}`);
  for (const [name, value] of facts) {
    assert.equal(value, true,
      `and every one of them held on the drive: ${row.id} / ${name}`);
  }
  assertWitnessForm(`${receipt.witness.file}:${receipt.witness.test}`, row.id);
}

function assertSliceGroup(row, need, cited) {
  const group = cited.filter((receipt) =>
    receipt.kind === need.kind && (receipt.sliceId ?? null) === need.sliceId);
  assert.ok(group.length > 0,
    'this classification is proved over the states it is a claim about: ' +
      `${row.id} needs ${need.kind} over ${need.sliceId}`);
  for (const receipt of group) {
    assert.equal(dependencyProvedByReceipt(receipt), need.proves,
      `a cited measurement proves what its group claims: ${receipt.id}`);
    assertWitnessForm(`${receipt.witness.file}:${receipt.witness.test}`,
      row.id);
  }
  const covered = sortedIds(group.flatMap((receipt) =>
    receipt.measuredPartitions));
  if (need.kind === NOT_DRIVEN_KIND) {
    for (const receipt of group) {
      assert.ok(row.producers.includes(receipt.producerId),
        'an undriven-producer receipt names a producer this row declares: ' +
          `${row.id} / ${receipt.producerId}`);
    }
    for (const partitionId of row.partitionClass) {
      assert.ok(covered.includes(partitionId),
        'and its censused scope covers this row\'s partitions: ' +
          `${row.id} / ${partitionId}`);
    }
    return;
  }
  // EXACT coverage: the measurement speaks for this row's partitions and no
  // others, so a drive on one partition can never carry another's row.
  assert.deepEqual(covered, sortedIds(row.partitionClass),
    'the cited measurements cover exactly this row\'s partition class: ' +
      row.id);
  const descriptor = sliceDescriptor(need.sliceId);
  assert.ok(descriptor, `the slice is registered: ${need.sliceId}`);
  if (descriptor.predicate.operationType !== null) {
    // For a PROVEN independence claim the slice must account for every type
    // the row's producers can emit, not merely intersect with them: a row
    // that can also emit an ADD has states this slice never measured.
    const proves = row.currentBudgetDependency === DOES_NOT_DEPEND ||
      row.unreachableSubject === AUTHORITY_SUBJECT;
    const outside = row.producerOperationTypes
      .filter((type) => type !== descriptor.predicate.operationType);
    assert.ok(
      row.producerOperationTypes.includes(descriptor.predicate.operationType),
      'this row\'s producers can produce the operation the slice is ' +
        `restricted to: ${row.id} / ${descriptor.predicate.operationType}`);
    assert.equal(proves && outside.length > 0, false,
      'a proven independence claim is measured over every operation type ' +
        `this row's producers can emit: ${row.id} leaves ${
          outside.join(', ')} unmeasured`);
  }
  if (descriptor.createdBy !== null) {
    assertSliceProvenance(row, need.sliceId, cited, descriptor);
  }
}

function assertDependencyEvidence(row, receipts) {
  const cited = boundReceipts(row, receipts);
  const required = EVIDENCE_BY_DEPENDENCY[row.currentBudgetDependency];
  assert.ok(required,
    `row ${row.id} names one of the five budget dependencies`);
  for (const need of required) {
    assertSliceGroup(row, need, cited);
  }
  // ...and cites no dependency measurement of a shape it does not need.
  for (const receipt of cited) {
    if (!DEPENDENCY_KINDS.includes(receipt.kind)) {
      continue;
    }
    assert.ok(required.some((need) => need.kind === receipt.kind &&
      need.sliceId === (receipt.sliceId ?? null)),
    'a row cites no measurement its classification does not rest on: ' +
      `${row.id} / ${receipt.id}`);
  }
}

// A discrepancy is a statement that round 3's witness did NOT measure what
// it was cited for. It may be declared only where that is true, and never
// where it is false - both directions are checked.
function assertNoDiscrepancyDeclared(row, declared, why) {
  assert.equal(declared.has(row.id), false,
    'no witness discrepancy may be declared for a row whose pinned round-3 ' +
      `witness did measure it: ${row.id} (${why})`);
}

function assertDiscrepancyDeclared(row, declared, drive, pinned, measuredBy) {
  const entry = declared.get(row.id);
  assert.ok(entry,
    'a row whose pinned round-3 witness drove a partition the row does not ' +
      `cover declares that discrepancy: ${row.id}`);
  assert.equal(entry.pinnedWitness, pinned,
    `and names the pinned witness: ${row.id}`);
  assert.equal(entry.pinnedWitnessDimension, DIMENSION.DRIVE,
    `and what that witness measures: ${row.id}`);
  assert.equal(entry.pinnedWitnessDrivenPartition, drive.measuredPartitions[0],
    `and the partition it drove: ${row.id}`);
  assert.deepEqual([...entry.rowPartitionClass].sort(),
    sortedIds(row.partitionClass),
    `and this row's own partition class: ${row.id}`);
  assert.equal(entry.measuredBy, measuredBy,
    `and the measurement that does cover the row: ${row.id}`);
}

// RULE 1. `producerOperationTypes` is not the row's to choose: it is the
// union of the add-like types the producer census measured from src for the
// producers this row declares. A row cannot give itself a type.
function assertProducerTypesComeFromTheCensus(row, censusById) {
  const union = new Set();
  for (const producerId of row.producers) {
    const producer = censusById.get(producerId);
    assert.ok(producer,
      `row ${row.id} declares a censused producer: ${producerId}`);
    for (const type of producer.addLikeTypes) {
      union.add(type);
    }
  }
  assert.deepEqual(sortedIds(row.producerOperationTypes), sortedIds([...union]),
    'a row\'s operation types are the union of its producers\' censused ' +
      `add-like types, not its own claim: ${row.id}`);
}

// RULE 2. `partitionClass` is not the row's to choose either: it is one of
// the sets the partition-sets receipt measured, or exactly one of the
// owner-named partitions, and it lies inside the censused scope of the
// row's own producers.
function assertPartitionClassIsAMeasuredSet(row, matrix, censusById) {
  const sets = matrix.partitionSets;
  const named = [sets.mintable, sets.budgetEvaluated, sets.bootstrapCritical,
    sets.criticalWithoutMint, sets.remainder, sets.ownerNamedSeven];
  const declared = sortedIds(row.partitionClass);
  const isNamedSet = named
    .some((set) => canonicalOf(sortedIds(set)) === canonicalOf(declared));
  const isOwnerNamed = declared.length === 1 &&
    sets.ownerNamedSeven.includes(declared[0]);
  assert.ok(isNamedSet || isOwnerNamed,
    'a row covers a measured partition set, or exactly one owner-named ' +
      `partition - never a set of its own making: ${row.id}`);
  // A row that stands for one of the owner's named partitions covers that
  // partition and nothing else, so it can never grow into another class.
  if (row.ownerNamedPartition !== undefined) {
    assert.ok(sets.ownerNamedSeven.includes(row.ownerNamedPartition),
      `an owner-named row names one of the owner's seven: ${row.id}`);
    assert.deepEqual(declared, [row.ownerNamedPartition],
      'and covers exactly that partition: ' +
        `${row.id} / ${row.ownerNamedPartition}`);
  }
  const scope = new Set(row.producers
    .flatMap((producerId) => censusById.get(producerId).partitionScope
      .partitionIds));
  for (const partitionId of declared) {
    assert.ok(scope.has(partitionId),
      'and every partition it covers is in its producers\' censused ' +
        `scope: ${row.id} / ${partitionId}`);
  }
}

// RULE 5. The census crossed with the TYPE: a producer that can emit a type
// on a budget-evaluated partition is covered only by a row that declares
// that type, so a row cannot drop a type and leave the pair uncovered.
function assertTypeAwareCoverage(matrix) {
  const evaluated = matrix.partitionSets.budgetEvaluated;
  for (const producer of matrix.producers) {
    for (const partitionId of producer.partitionScope.partitionIds) {
      if (!evaluated.includes(partitionId)) {
        continue;
      }
      for (const type of producer.addLikeTypes) {
        const covering = matrix.rows.filter((row) =>
          row.producers.includes(producer.id) &&
          row.partitionClass.includes(partitionId) &&
          row.producerOperationTypes.includes(type));
        assert.ok(covering.length > 0,
          'every censused producer, budget-evaluated partition and add-like ' +
            `type it can emit is covered by a row: ${producer.id} x ${
              partitionId} x ${type}`);
      }
    }
  }
}

// RULE 3. Two rows may not state the same PROVEN proposition. The key is
// what a reader would have to tell apart: the partitions, the slices the
// evidence was taken over, the dependency, the subject, and the producer
// whose drive licensed the slice. Still-unclassified rows are deliberately
// excluded: by round 3's own design they share producers, partitions and a
// whole-grid `depends`, their distinguishing condition is prose, and they
// claim nothing proven - so uniqueness would be false for them.
function provenProposition(row, receipts) {
  const cited = row.receipts
    .map((id) => receipts.byId.get(id))
    .filter((receipt) => receipt !== undefined);
  const slices = sortedIds(cited
    .filter((receipt) => receipt.sliceId)
    .map((receipt) => receipt.sliceId));
  const provenance = sortedIds(cited
    .filter((receipt) => receipt.kind === SLICE_PROVENANCE_KIND)
    .map((receipt) => receipt.producerId));
  return canonicalOf([sortedIds(row.partitionClass), slices,
    row.currentBudgetDependency, row.unreachableSubject ?? null, provenance]);
}

function assertPropositionsAreUnique(matrix, receipts) {
  const claimed = new Map();
  for (const row of matrix.rows) {
    const proven = row.currentBudgetDependency === DOES_NOT_DEPEND ||
      row.enforcementDisposition === 'proved-unreachable' ||
      row.enforcementDisposition === AUTHORITY_REQUIRED;
    if (!proven) {
      continue;
    }
    const proposition = provenProposition(row, receipts);
    assert.equal(claimed.has(proposition), false,
      'two rows state the same proven proposition - same partitions, ' +
        'slices, dependency, subject and proving producer: ' +
        `${claimed.get(proposition)} and ${row.id}`);
    claimed.set(proposition, row.id);
  }
}

// Derived from the data, never read from the document: the rows whose pinned
// witness is arithmetic-dimension and which claim no class. The declared list
// must be exactly this set.
function assertVacuousArithmeticWitnessesAreDeclared(matrix, receipts) {
  const stored = [...receipts.byId.values()];
  const derived = matrix.rows.filter((row) => {
    if (row.guardReachable.value !== 'yes' ||
        row.admissionClasses.length > NO_STATES) {
      return false;
    }
    const pinned = row.guardReachable.witness.split(':')[0];
    return stored.some((receipt) => receipt.witness.file === pinned &&
      receipt.dimension === DIMENSION.ARITHMETIC);
  }).map((row) => row.id);
  const entry = (matrix.correctionToRound3.inheritedWeaknesses || [])
    .find((weakness) => weakness.id === VACUOUS_ARITHMETIC_ID);
  assert.ok(entry,
    'the rows whose arithmetic witness measures nothing row-specific are ' +
      `recorded as an inherited weakness: ${VACUOUS_ARITHMETIC_ID}`);
  assert.deepEqual(sortedIds(entry.rows), sortedIds(derived),
    'and that record is exactly the set the data derives, neither short ' +
      'nor padded');
}

// Guard reachability is covered by the grid, which evaluates every partition
// on the real guard. What the row's PINNED round-3 witness adds depends on
// what that witness measures, which the receipts themselves say: an
// arithmetic witness measures admission classes and carries no partitions, a
// drive measures one partition, the grid measures the partition dimension.
function assertGuardReachabilityEvidence(row, cited, declared, receipts) {
  const group = cited.filter((receipt) =>
    receipt.kind === GUARD_REACHABILITY_KIND);
  if (row.guardReachable.value !== 'yes') {
    assert.equal(group.length, 0,
      `a row claiming no guard reachability cites none: ${row.id}`);
    assertNoDiscrepancyDeclared(row, declared, 'it claims no reachability');
    return;
  }
  assert.ok(group.length > 0,
    `a guard-reachable row cites the measurement that found it: ${row.id}`);
  assert.deepEqual(
    sortedIds(group.flatMap((receipt) => receipt.measuredPartitions)),
    sortedIds(row.partitionClass),
    `and it covers exactly this row's partitions: ${row.id}`);
  const measuredBy = group[0].witness.file;
  const pinned = row.guardReachable.witness.split(':')[0];
  const fromPinned = [...receipts.byId.values()]
    .filter((receipt) => receipt.witness.file === pinned);
  const dimensions = new Set(fromPinned.map((receipt) => receipt.dimension));
  if (dimensions.has(DIMENSION.PARTITION)) {
    assertNoDiscrepancyDeclared(row, declared,
      'its pinned witness IS the partition measurement');
    return;
  }
  if (dimensions.has(DIMENSION.ARITHMETIC)) {
    // The pinned witness is a genuine half of the evidence: it measures the
    // arithmetic of the classes this row claims. It contributes no partition
    // coverage, and the row may take none from it.
    for (const classId of row.admissionClasses) {
      const receipt = cited.find((entry) =>
        entry.kind === ARITHMETIC_KIND && entry.admissionClassId === classId);
      assert.ok(receipt,
        'a row whose pinned witness measures the arithmetic dimension cites ' +
          `that measurement for every class it claims: ${row.id} / ${classId}`);
      assert.equal(receipt.measuredPartitions, null,
        `and takes no partition coverage from it: ${row.id}`);
    }
    assertNoDiscrepancyDeclared(row, declared,
      'its pinned witness measures the arithmetic of the classes it claims');
    return;
  }
  const drive = fromPinned
    .find((receipt) => receipt.kind === GUARD_STATE_DRIVE_KIND);
  assert.ok(drive,
    `the pinned witness of a guard-reachable row measured it: ${row.id}`);
  if (row.partitionClass.includes(drive.measuredPartitions[0])) {
    assert.ok(cited.some((receipt) => receipt.id === drive.id),
      'a row whose pinned drive ran on a partition it covers cites that ' +
        `drive: ${row.id}`);
    assertNoDiscrepancyDeclared(row, declared,
      'its pinned drive ran on a partition it covers');
    return;
  }
  assertDiscrepancyDeclared(row, declared, drive, pinned, measuredBy);
  assert.equal(cited.some((receipt) => receipt.id === drive.id), false,
    'and does not cite a drive on a partition it does not cover: ' + row.id);
}

// A producer claim rests on a DRIVE: this owner, on a partition this row
// covers, producing an operation this row produces.
function assertProducerReachabilityEvidence(row, cited) {
  const group = cited.filter((receipt) =>
    receipt.kind === REACHABILITY_KIND);
  if (row.producerReachable.value !== 'yes') {
    assert.equal(group.length, 0,
      `a row not claiming producer reachability cites no drive: ${row.id}`);
    return;
  }
  assert.equal(group.length, 1,
    `a producer-reachable row cites one drive: ${row.id}`);
  const receipt = group[0];
  assert.ok(row.producers.includes(receipt.producerId),
    `the drive is of a producer THIS row declares: ${row.id} / ${
      receipt.producerId}`);
  assert.ok(row.producerOperationTypes.includes(receipt.observedOperationType),
    `and produced an operation this row produces: ${row.id} / ${
      receipt.observedOperationType}`);
  for (const partitionId of receipt.measuredPartitions) {
    assert.ok(row.partitionClass.includes(partitionId),
      'and was driven on a partition this row covers: ' +
        `${row.id} / ${partitionId}`);
  }
  assert.ok(readTextArtifact(receipt.witness.file).includes(REAL_CHAIN_MARKER),
    `and the drive is a real chain: ${row.id}`);
  assert.ok(receipt.producerFacts &&
    Object.keys(receipt.producerFacts).length > NO_STATES,
  `and carries the facts it established: ${row.id}`);
}

function witnessSources(file) {
  const source = readTextArtifact(file);
  const directory = path.dirname(file);
  const siblings = [...source.matchAll(RELATIVE_IMPORT)]
    .map((match) => path.join(directory, match[1]))
    .filter((candidate) => fs.existsSync(candidate));
  return [source, ...siblings.map((candidate) => readTextArtifact(candidate))];
}

function assertWitnessForm(witness, rowId) {
  if (witness === NONE_WITNESS) {
    return;
  }
  assert.ok(TEST_WITNESS.test(witness),
    `the witness is a named test in this quest or the literal none: ${rowId}`);
  const [file, ...nameParts] = witness.split(':');
  assert.ok(fs.existsSync(file), `the witness file exists: ${witness}`);
  const testName = nameParts.join(':');
  assert.ok(witnessSources(file).some((source) => source.includes(testName)),
    `the witness file, or a module it registers, carries the named test: ${
      witness}`);
  assert.ok(WITNESS_KIND_MARKER.test(readTextArtifact(file)),
    `the witness test file declares its witness kind: ${file}`);
}

// Rule 2. producer-backed reachability comes only from a test that declares
// itself a real-chain witness; a guard-grid witness proves guard behaviour.
function assertReachability(row) {
  for (const claim of [row.guardReachable, row.producerReachable]) {
    assert.ok(claim && REACHABILITY_VALUES.includes(claim.value),
      `row ${row.id} states a reachability value`);
    assertWitnessForm(claim.witness, row.id);
    // The literal none is available only to a claim of NO reachability. A
    // yes, and an unproven that reports what IS known, must name the test
    // that measured it: a claim without a witness is not a claim.
    assert.equal(claim.witness === NONE_WITNESS, claim.value === 'no',
      `a reachability claim other than "no" names its witness: ${row.id}`);
  }
  if (row.producerReachable.value !== 'yes') {
    return;
  }
  const file = row.producerReachable.witness.split(':')[0];
  assert.ok(readTextArtifact(file).includes(REAL_CHAIN_MARKER),
    'producerReachable yes is refused unless its witness declares itself a ' +
      `real-chain witness: ${row.id} / ${file}`);
}

// Rule 3. Either one of the four forms, or the unattributed sentence.
function assertLabAttribution(formation, where) {
  assert.ok(formation && typeof formation === 'object',
    `${where} carries a structured formation entry`);
  if (formation.producerAttributed === true) {
    assert.ok(ATTRIBUTION_FORMS.includes(formation.attributionForm),
      `${where} cites one of the owner's four attribution forms`);
    assert.ok(formation.attributionArgument &&
      formation.attributionArgument.length > 0,
    `${where} states the argument its attribution form rests on`);
    return;
  }
  assert.equal(formation.attributionForm, null,
    `${where} claims no attribution form when the producer is unattributed`);
  const text = formation.text;
  assert.ok(text === NO_FORMATION || text.includes(UNATTRIBUTED),
    `${where} reads the unattributed sentence verbatim, or records nothing`);
}

// Rule 4. Every dependency value owes its own structural receipt.
const DEPENDENCY_RECEIPTS = Object.freeze({
  depends: (row) => {
    const witness = row.budgetDifferentialWitness;
    assert.ok(witness && witness.test && witness.state,
      'a depends row names the state in which only the budget changes ' +
        `the result: ${row.id}`);
    assertWitnessForm(witness.test, row.id);
  },
  depends_only_when_census_moved: (row) => {
    DEPENDENCY_RECEIPTS.depends(row);
    assert.ok(row.censusMovementCondition &&
      row.censusMovementCondition.length > 0,
    `a census-conditional row states the movement condition: ${row.id}`);
  },
  does_not_depend: (row) => {
    const measurement = row.budgetIndependenceMeasurement;
    assert.ok(measurement && measurement.test &&
      measurement.statesInWhichItHolds,
    'a does_not_depend row names a differential over the complete stated ' +
      `domain: ${row.id}`);
    assertWitnessForm(measurement.test, row.id);
    assert.equal(row.budgetDifferentialWitness, null,
      `and claims no budget-only differential: ${row.id}`);
  },
  unknown_producer_not_driven: (row) => {
    assert.ok(row.dependencyUnknownBecause &&
      row.dependencyUnknownBecause.length > 0,
    `an unknown-dependency row states why nothing was measured: ${row.id}`);
    assert.deepEqual(row.admissionClasses, [],
      `and claims no admission class: ${row.id}`);
    assert.equal(row.enforcementDisposition, 'still-unclassified',
      `and is still-unclassified: ${row.id}`);
  },
  unreachable_in_stated_domain: (row) => {
    assert.ok(PROVED.includes(row.enforcementDisposition),
      `an unreachable row is a proved row: ${row.id}`);
  },
});

function assertDependencyReceipt(row) {
  const receipt = DEPENDENCY_RECEIPTS[row.currentBudgetDependency];
  assert.ok(receipt,
    `row ${row.id} names one of the five budget dependencies`);
  receipt(row);
  if (!row.sixAnswers) {
    return;
  }
  assert.equal(row.sixAnswers.budgetRemovalChangesTheDecision,
    BUDGET_REMOVAL_BY_DEPENDENCY[row.currentBudgetDependency],
    `the sixth answer follows the dependency: ${row.id}`);
}

// Every free-text field of a row, flattened, so a frequency argument cannot
// hide in an evidence line or a formation entry.
function freeText(row) {
  const qualification = row.domainQualification;
  const domain = row.provedUnreachableDomain;
  const differential = row.budgetDifferentialWitness;
  const independence = row.budgetIndependenceMeasurement;
  return [
    row.path, row.triggeringState, row.currentGuardReason,
    row.semanticOwnerReason, row.proposedAuthorizationKindNote,
    row.mintingEvidenceAvailable, row.validationEvidenceAvailable,
    row.stillUnclassifiedBecause, row.groupingCriterion,
    row.requirementToClassify, row.dependencyUnknownBecause,
    row.censusMovementCondition, row.formationEvidence.text,
    ...(row.evidence || []).map((item) => item.text),
    ...(differential ? [differential.state] : []),
    ...(independence ? [independence.statesInWhichItHolds] : []),
    ...(domain ? [domain.statement, domain.codeArgument] : []),
    ...(qualification ?
      [qualification.statement, qualification.codeArgument] :
      []),
  ].filter((value) => typeof value === 'string');
}

function assertNoneOfTheWords(values, words, where) {
  for (const value of values) {
    const lowered = value.toLowerCase();
    for (const word of words) {
      assert.equal(lowered.includes(word), false,
        `${where}: "${word}"`);
    }
  }
}

function assertRowShape(row, receipts, declared) {
  for (const fieldName of REQUIRED_ROW_FIELDS) {
    assert.ok(Object.hasOwn(row, fieldName),
      `row ${row.id} carries the field: ${fieldName}`);
  }
  assert.ok(DISPOSITIONS.includes(row.enforcementDisposition),
    `row ${row.id} names one of the four dispositions`);
  assert.ok(Array.isArray(row.partitionClass) && row.partitionClass.length > 0,
    `row ${row.id} lists every partition id it covers`);
  for (const partitionId of row.partitionClass) {
    assert.equal(partitionId.includes('etc'), false,
      `row ${row.id} lists ids, never an abbreviation`);
  }
  assert.ok(Array.isArray(row.evidence) && row.evidence.length > 0,
    `row ${row.id} carries labelled evidence`);
  for (const item of row.evidence) {
    assert.ok(EVIDENCE_LABELS.includes(item.label),
      `row ${row.id} labels every evidence item: ${item.label}`);
    assert.ok(item.text && item.text.length > 0);
  }
  assertReachability(row);
  assertDependencyReceipt(row);
  // The evidence has to be ABOUT this row: covering its partitions, over the
  // slice its classification is a claim about, linked to its own producers.
  const cited = boundReceipts(row, receipts);
  assertDependencyEvidence(row, receipts);
  assertGuardReachabilityEvidence(row, cited, declared, receipts);
  assertProducerReachabilityEvidence(row, cited);
  // D3, as a rule rather than as a correction: a class whose admission does
  // not depend on the budget needs no authority to replace the budget.
  assert.equal(row.currentBudgetDependency === DOES_NOT_DEPEND &&
    row.enforcementDisposition === AUTHORITY_REQUIRED, false,
  'a class measured does_not_depend may not also require an explicit ' +
    `authority: ${row.id}`);
  assertLabAttribution(row.formationEvidence, `row ${row.id}`);
  assertNoneOfTheWords(freeText(row), FREQUENCY_WORDS,
    `no frequency language in row ${row.id}`);
}

function assertDomainIsAGrid(row, matrix, sets) {
  const domain = row.provedUnreachableDomain;
  assert.ok(domain && typeof domain === 'object',
    `a proved-unreachable row states a structured domain: ${row.id}`);
  const grid = matrix.method.unreachableGrid;
  assert.equal(domain.test, grid.test,
    `the domain names the grid test that IS the domain: ${row.id}`);
  assert.ok(fs.existsSync(domain.test),
    `and that test file exists: ${row.id}`);
  assert.deepEqual(domain.ranges, grid.ranges,
    `the domain's ranges are the grid's own: ${row.id}`);
  assert.equal(domain.statesPerPartition, grid.statesPerPartition,
    `and its state count is the grid's own: ${row.id}`);
  assert.deepEqual([...domain.partitionIds].sort(),
    [...row.partitionClass].sort(),
    `the domain covers exactly the row's partitions: ${row.id}`);
  assert.ok(domain.codeArgument && domain.codeArgument.length > 0,
    `the domain carries the argument for its completeness: ${row.id}`);
  assertNoneOfTheWords([domain.statement, domain.codeArgument],
    OBSERVATIONAL_WORDS,
    `a domain is a set of states, never an observation (${row.id})`);
  for (const partitionId of row.partitionClass) {
    assert.equal(sets.budgetEvaluated.includes(partitionId), false,
      'a proved-unreachable row covers no partition the budget is ' +
        `evaluated for: ${row.id} / ${partitionId}`);
  }
}

// The qualification a subject may require: structure first, and a word scan
// only to stop the prose contradicting the structure.
function assertQualification(row, discipline) {
  const qualification = row.domainQualification;
  assert.ok(qualification && typeof qualification === 'object',
    `this subject states a structured domain qualification: ${row.id}`);
  // ONE subject, one place: the qualification may restate it, but never
  // differ from it.
  assert.equal(qualification.unreachable, row.unreachableSubject,
    'the qualification states the same subject as the row, or the row is ' +
      `saying two different things: ${row.id}`);
  for (const aspect of qualification.remainsReachable) {
    assert.ok(REACHABLE_ASPECTS.includes(aspect),
      `what remains reachable is a closed enum: ${row.id} / ${aspect}`);
  }
  for (const reachable of REMAINS_REACHABLE) {
    assert.ok(qualification.remainsReachable.includes(reachable),
      `and this subject requires all of it: ${row.id} / ${reachable}`);
  }
  // ...and the guard state it says remains reachable must BE reachable on
  // the row's own measured claim.
  assert.equal(
    qualification.remainsReachable.includes(GUARD_STATE_ASPECT) &&
      row.guardReachable.value !== 'yes', false,
    `a qualification may not call an unreachable guard state reachable: ${
      row.id}`);
  assert.equal(qualification.sliceId, discipline.sliceId,
    `over the state slice this subject is proved on: ${row.id}`);
  assertNoneOfTheWords([qualification.statement, qualification.codeArgument]
    .map((value) => value.toLowerCase()), FORBIDDEN_UNREACHABILITY,
  `the qualification never predicates unreachability of the operation (${
    row.id})`);
}

// One discipline, selected by the proposition the row states. Nothing here
// reads a row id.
function assertProvedUnreachableDiscipline(row, matrix, sets) {
  const subject = row.unreachableSubject;
  assert.ok(UNREACHABLE_SUBJECTS.includes(subject),
    'a proved-unreachable row states which proposition it proves ' +
      `unreachable: ${row.id} / ${subject}`);
  const discipline = SUBJECT_DISCIPLINE[subject];
  assert.equal(row.currentBudgetDependency, discipline.dependency,
    `this subject rests on that dependency: ${row.id} / ${subject}`);
  assert.equal(row.guardReachable.value, discipline.guardReachable,
    `and on that guard reachability: ${row.id} / ${subject}`);
  if (discipline.producerReachableAllowed !== null) {
    assert.ok(discipline.producerReachableAllowed
      .includes(row.producerReachable.value),
    `and keeps the producer reachability round 3 upheld: ${row.id}`);
  }
  for (const partitionId of row.partitionClass) {
    assert.equal(sets.budgetEvaluated.includes(partitionId),
      discipline.partitionsAreBudgetEvaluated,
      'this subject is only available where the budget is evaluated ' +
        `exactly as it requires: ${row.id} / ${partitionId}`);
  }
  if (discipline.requiresGridDomain) {
    assertDomainIsAGrid(row, matrix, sets);
  }
  if (discipline.requiresQualification) {
    assertQualification(row, discipline);
  } else {
    assert.equal(row.domainQualification, undefined,
      `this subject qualifies nothing: ${row.id}`);
  }
}

function assertDispositionDiscipline(row, matrix, sets) {
  assert.equal(row.unreachableSubject !== undefined &&
    row.enforcementDisposition !== 'proved-unreachable', false,
  `only a proved-unreachable row states an unreachable subject: ${row.id}`);
  if (row.enforcementDisposition === 'proved-unreachable') {
    assertProvedUnreachableDiscipline(row, matrix, sets);
  }
  if (row.enforcementDisposition === 'proved-obsolete') {
    assert.equal(row.currentBudgetDependency, UNREACHABLE,
      `a proved row states an unreachable dependency: ${row.id}`);
    assert.equal(row.guardReachable.value, 'no',
      `and claims no guard reachability: ${row.id}`);
  }
  if (PROVED.includes(row.enforcementDisposition)) {
    assert.deepEqual(row.admissionClasses, [],
      `a proved row claims no admission class: ${row.id}`);
    assert.equal(row.formationEvidence.text, NO_FORMATION,
      `a proved row cites no formation witness of dependence: ${row.id}`);
    assert.equal(row.proposedAuthorizationKind, NO_KIND,
      `and proposes no authorization kind: ${row.id}`);
  }
  if (row.enforcementDisposition === 'proved-obsolete') {
    const proof = row.provedObsoleteProducer;
    assert.ok(proof && typeof proof === 'object' && proof.producerId &&
      proof.test, `a proved-obsolete row shows the dead producer: ${row.id}`);
  }
  if (row.enforcementDisposition === 'still-unclassified') {
    assert.ok(row.stillUnclassifiedBecause &&
      row.stillUnclassifiedBecause.length > 0,
    `a still-unclassified row states why: ${row.id}`);
    assert.ok(row.requirementToClassify &&
      row.requirementToClassify.length > 0,
    `a still-unclassified row states what would classify it: ${row.id}`);
  }
}

// The owner check is structural. A row whose producers can emit a REPLACE is
// not the cure policy's to own, and a row that names the policy must name one
// of the policy's OWN spread-cure conditions.
function assertOwnerOfTheCondition(row, spreadCureConditions) {
  if (row.semanticOwner !== SPREAD_CURE_POLICY) {
    return;
  }
  assert.equal(row.producerOperationTypes.includes(REPLACE_TYPE), false,
    `a REPLACE-bearing row may not name the cure policy: ${row.id}`);
  assert.ok(spreadCureConditions.has(row.policyCureCondition),
    'a row naming the cure policy names one of its own spread-cure ' +
      `conditions: ${row.id} / ${row.policyCureCondition}`);
  assert.equal(row.proposedAuthorizationKind, 'critical_spread_cure',
    `a spread-cure-owned row proposes the spread-cure kind: ${row.id}`);
}

// The rows whose pinned round-3 guard witness names a drive while the
// measurement that covers them is the grid. Declared in the document, so a
// reader sees the discrepancy rather than the validator hiding it.
function declaredWitnessDiscrepancies(matrix) {
  const declared = (matrix.correctionToRound3 || {}).witnessDiscrepancies || [];
  return new Map(declared.map((entry) => [entry.row, entry]));
}

function spreadCureConditionSet() {
  const conditions = new Set();
  for (const condition of PLACEMENT_CURE_BY_CONDITION.keys()) {
    if (resolvePlacementCure(condition).moveReason ===
        MOVE_REASON.SPREAD_REPLICAS) {
      conditions.add(condition);
    }
  }
  return conditions;
}

function assertGateEntryIsDerived(matrix, entry, rowIds) {
  const contract = gateContractFor(entry.item);
  assert.ok(contract, `gate item ${entry.item} has a contract`);
  assert.ok(GATE_STATUSES.includes(entry.status),
    `gate item ${entry.item} names one of the three statuses`);
  assert.equal(entry.status, deriveGateStatus(matrix, entry),
    `gate item ${entry.item}'s status follows from the contract`);
  assert.deepEqual(entry.rows,
    selectGateRows(matrix, entry.item).map((row) => row.id),
    `gate item ${entry.item}'s rows are SELECTED, never listed`);
  assert.deepEqual(entry.requires, contract.requires,
    `gate item ${entry.item}'s requirements are the contract's`);
  assert.deepEqual(entry.ownerDecisions, contract.ownerDecisions,
    `gate item ${entry.item}'s blocking decisions are the contract's`);
  assert.deepEqual(entry.openFindings, openGateFindings(matrix, entry.item),
    `gate item ${entry.item}'s open findings come from the findings`);
  assert.deepEqual(entry.whatIsMissing, unmetGateRequirements(matrix, entry),
    `gate item ${entry.item} lists exactly the requirements it fails`);
  assert.equal(entry.rowSelection, renderRowSelection(entry.item),
    `gate item ${entry.item}'s row selection renders from the contract`);
  assert.ok(entry.note && entry.note.length > 0,
    `gate item ${entry.item} says why`);
  for (const rowId of entry.rows) {
    assert.ok(rowIds.has(rowId),
      `gate item ${entry.item} cites an existing row: ${rowId}`);
  }
  for (const artifact of entry.requiredExternalArtifacts || []) {
    assertClosedKeys(artifact, ARTIFACT_KEYS,
      `required artifact ${artifact.id}`);
    assert.equal(Object.hasOwn(artifact, 'exists'), false,
      `no required artifact declares its own existence: ${artifact.id}`);
    assert.ok(typeof artifact.kind === 'string' && artifact.kind.length > 0,
      `it states the kind it must be: ${artifact.id}`);
    assert.ok(typeof artifact.path === 'string' && artifact.path.length > 0,
      `and where the repository would hold it: ${artifact.id}`);
  }
  assert.ok(entry.tests.length > 0,
    `gate item ${entry.item} cites at least one test`);
  for (const testFile of entry.tests) {
    assert.ok(fs.existsSync(testFile),
      `gate item ${entry.item} cites an existing test file: ${testFile}`);
  }
}

function assertGateIsDerived(matrix, rowIds) {
  assert.equal(matrix.gate.length, 9, 'the gate has the owner\'s nine items');
  const findingIds = new Set(matrix.findings.map((finding) => finding.id));
  const seenItems = new Set();
  for (const entry of matrix.gate) {
    assert.equal(seenItems.has(entry.item), false);
    seenItems.add(entry.item);
    assertGateEntryIsDerived(matrix, entry, rowIds);
    for (const findingId of entry.openFindings) {
      assert.ok(findingIds.has(findingId),
        `gate item ${entry.item} cites an existing finding: ${findingId}`);
    }
  }
  assert.deepEqual([...seenItems].sort((left, right) => left - right),
    [1, 2, 3, 4, 5, 6, 7, 8, 9]);
}

// Rule 5, mechanically. Each mutant DELETES evidence; no item may be
// promoted to demonstrated by any of them.
const MONOTONICITY_MUTANTS = Object.freeze([
  {id: 'delete-a-still-unclassified-row', mutate: (matrix) => {
    matrix.rows = matrix.rows.filter((row) =>
      row.enforcementDisposition !== 'still-unclassified');
  }},
  {id: 'delete-every-finding', mutate: (matrix) => {
    matrix.findings = [];
  }},
  {id: 'empty-every-item-requirement-list', mutate: (matrix) => {
    for (const entry of matrix.gate) {
      entry.requires = [];
    }
  }},
  {id: 'delete-every-blocking-owner-decision', mutate: (matrix) => {
    for (const entry of matrix.gate) {
      entry.ownerDecisions = [];
    }
  }},
  {id: 'delete-every-cited-test', mutate: (matrix) => {
    for (const entry of matrix.gate) {
      entry.tests = [];
    }
  }},
  {id: 'delete-every-repair-group-and-required-artifact',
    mutate: (matrix) => {
      for (const row of matrix.rows) {
        row.repairGroup = null;
      }
      for (const entry of matrix.gate) {
        entry.requiredExternalArtifacts = [];
      }
    }},
  // D1: the two booleans round 3 carried, re-added by an attacker.
  {id: 'falsely-mark-every-finding-closed', mutate: (matrix) => {
    for (const finding of matrix.findings) {
      finding.open = false;
      finding.resolution = null;
    }
  }},
  {id: 'falsely-mark-every-external-artifact-present', mutate: (matrix) => {
    for (const entry of matrix.gate) {
      for (const artifact of entry.requiredExternalArtifacts || []) {
        artifact.exists = true;
      }
    }
  }},
  {id: 'unlink-every-finding-from-its-item', mutate: (matrix) => {
    for (const finding of matrix.findings) {
      finding.gateItems = [];
    }
  }},
  // D2: the bindings, removed and substituted.
  {id: 'remove-every-row-receipt-binding', mutate: (matrix) => {
    for (const row of matrix.rows) {
      row.receipts = [];
    }
  }},
  {id: 'substitute-another-rows-evidence', mutate: (matrix) => {
    const [first, second] = matrix.rows;
    first.receipts = second.receipts;
    first.evidence = second.evidence;
  }},
  {id: 'substitute-another-requirements-evidence', mutate: (matrix) => {
    const [first, second] = matrix.gate;
    first.tests = second.tests;
    first.requiredExternalArtifacts = second.requiredExternalArtifacts;
  }},
]);

function assertGateIsMonotonic(matrix) {
  const before = new Map(matrix.gate.map((entry) =>
    [entry.item, entry.status]));
  for (const mutant of MONOTONICITY_MUTANTS) {
    const mutated = structuredClone(matrix);
    mutant.mutate(mutated);
    for (const entry of mutated.gate) {
      const after = deriveGateStatus(mutated, entry);
      if (before.get(entry.item) === PROMOTED_STATUS) {
        continue;
      }
      assert.notEqual(after, PROMOTED_STATUS,
        `deleting evidence never demonstrates an item: ${mutant.id} / item ${
          entry.item}`);
    }
  }
}

// Rule 10. Every row's repair group is a proposed quest, nothing is started,
// and no ledger-authority quest is proposed.
function assertRepairGroups(matrix) {
  const groups = new Set(matrix.repairQuests.map((quest) => quest.group));
  assert.ok(groups.size > 0, 'the repair proposal is grouped by cause');
  for (const quest of matrix.repairQuests) {
    assert.equal(quest.notStarted, true,
      `the repair quest is not started: ${quest.group}`);
    assert.ok(quest.cause.length > 0 && quest.proposal.length > 0);
    assert.equal(/ledger.*authority|authority.*ledger/u.test(quest.group),
      false, `no ledger-authority quest is proposed: ${quest.group}`);
  }
  for (const row of matrix.rows) {
    if (row.repairGroup) {
      assert.ok(groups.has(row.repairGroup),
        `a row's repair group is a proposed quest: ${row.id}`);
    }
    if (row.enforcementDisposition !== AUTHORITY_REQUIRED ||
        row.id === MINTS_TODAY) {
      continue;
    }
    assert.ok(row.repairGroup,
      `a row whose owner does not mint carries a repair group: ${row.id}`);
  }
}

// Rule 7. No completeness claim while unresolved entries remain.
function assertInventoryClaimsNoCompleteness(inventory) {
  const unresolved = inventory.tokens
    .filter((token) => token.group === UNRESOLVED_GROUP);
  assert.ok(unresolved.length > 0,
    'the inventory reports its unresolved entries rather than hiding them');
  assert.equal(inventory.domainIsNotClosed.counts[UNRESOLVED_GROUP],
    unresolved.length, 'and counts them');
  assert.equal(inventory.observesAccounting.unknownNotTraced,
    unresolved.length,
    'the untraced count and the unresolved group are the same set');
  assertNoneOfTheWords([
    ...inventory.limits,
    ...Object.values(inventory.method),
    inventory.domainIsNotClosed.statement,
  ].filter((value) => typeof value === 'string'), COMPLETENESS_WORDS,
  'the inventory claims no completeness while entries are unresolved');
}

// Rule 11. An architectural result is recorded, and is NOT turned into a row.
function assertArchitecturalResults(matrix) {
  assert.ok(matrix.architecturalResults.length > 0,
    'the impossibilities are recorded as architectural results');
  const rowIds = new Set(matrix.rows.map((row) => row.id));
  for (const result of matrix.architecturalResults) {
    assert.ok(result.result.length > 0 && result.consequence.length > 0);
    assert.equal(rowIds.has(result.id), false,
      `an architectural result is not encoded as a row: ${result.id}`);
    for (const witness of result.evidence) {
      assertWitnessForm(witness, result.id);
    }
  }
}

// Rule 6. Today's honoured is never described as complete, and the inherited
// requirement is recorded verbatim.
function assertGrantRuleTarget(matrix) {
  const target = matrix.grantRuleTarget;
  assert.equal(target.interimPin, 'honoured && wouldBeWithinAuthorizedBound');
  assert.equal(target.inheritedRequirement,
    'after that quest, the only consumer rule is `outcome === honoured`; ' +
    'every bound and identity failure produces a non-honoured outcome',
    'the inherited requirement is recorded verbatim');
  assert.ok(target.todaysHonouredIsNotComplete.includes('WITHOUT'),
    'today\'s honoured is never described as complete');
}

test('the matrix, the inventory and the gate are complete and in sync', () => {
  const matrix = readJsonArtifact(MATRIX_JSON);
  const inventory = readJsonArtifact(EPOCH_INVENTORY_JSON);
  const sets = measurePartitionSets();
  const receipts = readEvidenceReceipts();
  const censusById = new Map(matrix.producers
    .map((producer) => [producer.id, producer]));
  const spreadCureConditions = spreadCureConditionSet();
  // 1. Every row's fields, enums, receipts, witnesses and discipline.
  assert.ok(matrix.rows.length > 0);
  const rowIds = new Set();
  for (const row of matrix.rows) {
    assert.equal(rowIds.has(row.id), false, `row ids are unique: ${row.id}`);
    rowIds.add(row.id);
    assertRowShape(row, receipts, declaredWitnessDiscrepancies(matrix));
    assertProducerTypesComeFromTheCensus(row, censusById);
    assertPartitionClassIsAMeasuredSet(row, matrix, censusById);
    assertDispositionDiscipline(row, matrix, sets);
    assertOwnerOfTheCondition(row, spreadCureConditions);
  }
  // 2. Coverage: no partition the guard treats as critical is unaccounted
  // for, and each of the owner's seven has at least one row of its own.
  const covered = new Set(matrix.rows.flatMap((row) => row.partitionClass));
  for (const partitionId of sets.bootstrapCritical) {
    assert.ok(covered.has(partitionId),
      `every bootstrap-critical partition is covered by a row: ${partitionId}`);
  }
  const ownerNamed = new Set(matrix.rows
    .filter((row) => row.ownerNamedPartition)
    .map((row) => row.ownerNamedPartition));
  assert.deepEqual([...ownerNamed].sort(),
    [...matrix.partitionSets.ownerNamedSeven].sort(),
    'each of the owner\'s seven partitions has at least one row');
  // 3. The repair proposal, the architectural results and the grant rule.
  assertCorrectionHygiene(matrix, rowIds);
  assertTypeAwareCoverage(matrix);
  assertPropositionsAreUnique(matrix, receipts);
  assertVacuousArithmeticWitnessesAreDeclared(matrix, receipts);
  assertRepairGroups(matrix);
  assertArchitecturalResults(matrix);
  assertGrantRuleTarget(matrix);
  assertLabAttribution(matrix.replaceClassification.labAttribution,
    'the REPLACE classification\'s lab attribution');
  // 4. The three markdown documents are generated from their JSON.
  assert.equal(readTextArtifact(MATRIX_MARKDOWN),
    renderDecisionMatrixMarkdown(matrix, undefined, STATE_SLICES),
    'the matrix markdown is generated from the matrix JSON');
  assert.equal(readTextArtifact(EPOCH_INVENTORY_MARKDOWN),
    renderEpochInventoryMarkdown(inventory),
    'the inventory markdown is generated from the inventory JSON');
  assert.equal(readTextArtifact(GATE_MARKDOWN),
    renderEnforcementGateMarkdown(matrix),
    'the gate markdown is generated from the matrix JSON');
  // The renderer refuses to interpolate a placeholder. Round 2 found eleven
  // lines reading "at undefined" because a renamed field was read; that can
  // no longer reach a document, and each placeholder value is proved
  // refused here rather than hunted for in prose afterwards.
  for (const placeholder of PLACEHOLDER_VALUES) {
    const broken = structuredClone(matrix);
    broken.findings.find((finding) => finding.resolution).resolution.path =
      placeholder;
    assert.throws(
      () => renderDecisionMatrixMarkdown(broken, undefined, STATE_SLICES),
      /a rendered value is a placeholder/u,
      `the renderer refuses to print a placeholder: ${String(placeholder)}`);
  }
  // 5. Every gate status is DERIVED, and deleting evidence never promotes.
  assertGateIsDerived(matrix, rowIds);
  assertGateIsMonotonic(matrix);
  // 6. The inventory claims no completeness, and the quest starts nothing.
  assertInventoryClaimsNoCompleteness(inventory);
  // Rule 12. Nothing in the matrix declares a finding resolved or an
  // artifact present. A finding that gates something is resolved only by a
  // resolution artifact that names it; a finding that gates nothing is a
  // recorded result and carries no resolution at all.
  for (const finding of matrix.findings) {
    assertClosedKeys(finding, FINDING_KEYS, `finding ${finding.id}`);
    assert.ok(EVIDENCE_LABELS.includes(finding.label),
      `finding ${finding.id} is labelled`);
    assert.equal(Object.hasOwn(finding, 'open'), false,
      `no finding declares its own resolution: ${finding.id}`);
    if (!findingIsGateBlocking(finding.id)) {
      assert.equal(Object.hasOwn(finding, 'resolution'), false,
        `a finding that gates nothing carries no resolution: ${finding.id}`);
      continue;
    }
    const resolution = finding.resolution;
    assert.ok(resolution && typeof resolution.path === 'string' &&
      resolution.path.length > 0,
    `a gate-blocking finding names where its resolution would be: ${
      finding.id}`);
    assert.ok(typeof resolution.kind === 'string' && resolution.kind.length > 0,
      `and the kind that artifact must be: ${finding.id}`);
    assertClosedKeys(resolution, RESOLUTION_KEYS,
      `finding resolution ${finding.id}`);
    if (finding.doesNotImply !== undefined) {
      assert.ok(DOES_NOT_IMPLY.includes(finding.doesNotImply),
        `a finding's disclaimer is a closed enum value: ${finding.id}`);
      assert.ok(finding.justification && finding.justification.length > 0,
        `and it states the justification it stands on: ${finding.id}`);
    }
  }
  assert.equal(fs.existsSync('solve/quests/critical-spread-transition-authority'),
    false, 'the enforce quest is not started by this audit');
});
