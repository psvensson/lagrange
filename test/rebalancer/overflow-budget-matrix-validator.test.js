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

function assertRowShape(row) {
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

function assertDispositionDiscipline(row, matrix, sets) {
  if (PROVED.includes(row.enforcementDisposition)) {
    assert.equal(row.currentBudgetDependency, UNREACHABLE,
      `a proved row states an unreachable dependency: ${row.id}`);
    assert.deepEqual(row.admissionClasses, [],
      `a proved row claims no admission class: ${row.id}`);
    assert.equal(row.formationEvidence.text, NO_FORMATION,
      `a proved row cites no formation witness of dependence: ${row.id}`);
    assert.equal(row.guardReachable.value, 'no',
      `and claims no guard reachability: ${row.id}`);
  }
  if (row.enforcementDisposition === 'proved-unreachable') {
    assertDomainIsAGrid(row, matrix, sets);
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
  assert.ok(entry.note && entry.note.length > 0,
    `gate item ${entry.item} says why`);
  for (const rowId of entry.rows) {
    assert.ok(rowIds.has(rowId),
      `gate item ${entry.item} cites an existing row: ${rowId}`);
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
  {id: 'delete-every-open-finding', mutate: (matrix) => {
    matrix.findings = matrix.findings.filter((finding) => !finding.open);
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
  const spreadCureConditions = spreadCureConditionSet();
  // 1. Every row's fields, enums, receipts, witnesses and discipline.
  assert.ok(matrix.rows.length > 0);
  const rowIds = new Set();
  for (const row of matrix.rows) {
    assert.equal(rowIds.has(row.id), false, `row ids are unique: ${row.id}`);
    rowIds.add(row.id);
    assertRowShape(row);
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
  assertRepairGroups(matrix);
  assertArchitecturalResults(matrix);
  assertGrantRuleTarget(matrix);
  assertLabAttribution(matrix.replaceClassification.labAttribution,
    'the REPLACE classification\'s lab attribution');
  // 4. The three markdown documents are generated from their JSON.
  assert.equal(readTextArtifact(MATRIX_MARKDOWN),
    renderDecisionMatrixMarkdown(matrix),
    'the matrix markdown is generated from the matrix JSON');
  assert.equal(readTextArtifact(EPOCH_INVENTORY_MARKDOWN),
    renderEpochInventoryMarkdown(inventory),
    'the inventory markdown is generated from the inventory JSON');
  assert.equal(readTextArtifact(GATE_MARKDOWN),
    renderEnforcementGateMarkdown(matrix),
    'the gate markdown is generated from the matrix JSON');
  // 5. Every gate status is DERIVED, and deleting evidence never promotes.
  assertGateIsDerived(matrix, rowIds);
  assertGateIsMonotonic(matrix);
  // 6. The inventory claims no completeness, and the quest starts nothing.
  assertInventoryClaimsNoCompleteness(inventory);
  for (const finding of matrix.findings) {
    assert.ok(EVIDENCE_LABELS.includes(finding.label),
      `finding ${finding.id} is labelled`);
    assert.equal(typeof finding.open, 'boolean',
      `finding ${finding.id} says whether it is open`);
  }
  assert.equal(fs.existsSync('solve/quests/critical-spread-transition-authority'),
    false, 'the enforce quest is not started by this audit');
});
