// D1: truth that is DERIVED rather than written down, and a gate derivation
// that no edit can improve (quest overflow-budget-audit-evidence-binding,
// receipts finding-resolution-derives-from-resolution-artifacts,
// external-artifacts-are-observed-from-repository-state,
// gate-item-8-stays-not-yet-under-any-audit-metadata-edit,
// gate-derivation-is-monotonic-under-removal-corruption-and-substitution and
// the-three-round-3-attacks-no-longer-work).
//
// Round 3's first defect: a finding said whether it was open and a required
// external artifact said whether it existed, both as hand-written booleans.
// The verifier demonstrated the consequence: setting the bound finding to
// open false, unlinking it from its item and setting the artifact's exists
// flag true made gate item 8 - an item whose own note says the quest it waits
// on does not exist at this head - come out DEMONSTRATED, and items 6 and 7
// the same way with the flag alone.
//
// Here a finding is resolved only by a resolution artifact on disk that names
// it and carries a compatible result, and a required external artifact is
// satisfied only by what the repository holds. Nothing in the matrix declares
// either. The last test is the verifier's own three attacks, run literally
// against the real validator.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  gateContractFor,
  openGateFindings,
  unmetGateRequirements,
} from './overflow-budget-audit-render.js';
import {
  readMatrix,
  readReceiptStore,
  rederiveGate,
  runRealValidatorOn,
} from './overflow-budget-evidence-support.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

const DEMONSTRATED = 'demonstrated';
const GATE_ITEMS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9]);
const ITEM_EIGHT = 8;
const BOUND_FINDING = 'honoured-does-not-include-the-bound';
const CEILING_FINDING = 'membership-ceiling-may-undercount-the-union';
const ROW_TYPE_FINDING = 'row-type-is-not-part-of-authority-identity';
const PARTITION_IDENTITY_FINDING = 'partition-identity-is-not-on-the-record';
const IDENTITY_QUEST_ARTIFACT = 'authorization-identity-and-evaluation-quest';
const EXTERNAL_ARTIFACTS_REQUIREMENT = 'requiredExternalArtifactsExist';
const STILL_UNCLASSIFIED = 'still-unclassified';
const DOES_NOT_DEPEND = 'does_not_depend';
const AUTHORITY_REQUIRED = 'explicit-authority-required';
const REACHABLE = 'yes';
const FLIPPED_ROW = 'five-under-representation-add';
const UNRELATED_DIFFERENTIAL =
  'test/partition/overflow-budget-admitted-case-grid.test.js:every ' +
  'budget-admitted state grid row maps to exactly one admission class';
const UNRELATED_REAL_CHAIN =
  'test/rebalancer/overflow-budget-mintable-five-routes.test.js:every ' +
  'alternate route to the five carries the mint or is a matrix row';
const UNRELATED_REAL_CHAIN_ROW = 'five-initial-provisioning-add';

function blockingFindingIds() {
  const ids = new Set();
  for (const item of GATE_ITEMS) {
    for (const id of gateContractFor(item).blockingFindings) {
      ids.add(id);
    }
  }
  return ids;
}

// Every gate item that comes out demonstrated once the document is
// REGENERATED from the (mutated) evidence - an attacker who edits and then
// re-derives, not one who leaves a stale status behind.
function promotedItems(matrix) {
  rederiveGate(matrix);
  return matrix.gate.filter((entry) => entry.status === DEMONSTRATED)
    .map((entry) => entry.item);
}

function findingById(matrix, id) {
  return matrix.findings.find((finding) => finding.id === id);
}

test('a finding is resolved only by a resolution artifact that names it', () => {
  const matrix = readMatrix();
  const blocking = blockingFindingIds();
  for (const finding of matrix.findings) {
    assert.equal(Object.hasOwn(finding, 'open'), false,
      `no finding declares its own resolution: ${finding.id}`);
    if (!blocking.has(finding.id)) {
      continue;
    }
    const resolution = finding.resolution;
    assert.ok(resolution && typeof resolution === 'object',
      `a gate-blocking finding names the evidence that would resolve it: ${
        finding.id}`);
    assert.ok(typeof resolution.path === 'string' && resolution.path.length > 0,
      `and names the repository path it would live at: ${finding.id}`);
    assert.ok(typeof resolution.kind === 'string' && resolution.kind.length > 0,
      `and the kind of artifact it must be: ${finding.id}`);
    // No resolution artifact exists at this head, so every blocking finding
    // derives OPEN and the statuses are the ones round 3 agreed with.
    assert.equal(fs.existsSync(resolution.path), false,
      `no resolution quest exists at this head: ${finding.id}`);
    for (const item of finding.gateItems) {
      if (!gateContractFor(item).blockingFindings.includes(finding.id)) {
        continue;
      }
      assert.ok(openGateFindings(matrix, item).includes(finding.id),
        `so it still blocks its item: ${finding.id} / ${item}`);
    }
  }
  // Re-adding the flag the round-3 document carried resolves nothing.
  const mutated = readMatrix();
  for (const finding of mutated.findings) {
    finding.open = false;
  }
  assert.deepEqual(promotedItems(mutated), [],
    'a hand-written open flag is not an input to resolution');
});

test('a required external artifact is observed from repository state', () => {
  const matrix = readMatrix();
  for (const entry of matrix.gate) {
    for (const artifact of entry.requiredExternalArtifacts || []) {
      assert.equal(Object.hasOwn(artifact, 'exists'), false,
        `no required artifact declares its own existence: ${artifact.id}`);
      assert.ok(typeof artifact.kind === 'string' && artifact.kind.length > 0,
        `it states the kind it must be: ${artifact.id}`);
      assert.ok(typeof artifact.path === 'string' && artifact.path.length > 0,
        `and where the repository would hold it: ${artifact.id}`);
    }
  }
  const item = matrix.gate.find((entry) => entry.item === ITEM_EIGHT);
  const declared = (item.requiredExternalArtifacts || [])
    .find((artifact) => artifact.id === IDENTITY_QUEST_ARTIFACT);
  assert.ok(declared, 'item 8 waits on the identity and evaluation quest');
  assert.equal(fs.existsSync(declared.path), false,
    'which does not exist at this head');
  assert.ok(unmetGateRequirements(matrix, item)
    .includes(EXTERNAL_ARTIFACTS_REQUIREMENT),
  'so item 8 fails the requirement that waits on it');
});

test('gate item 8 stays not-yet under every audit metadata edit', () => {
  const edits = [
    {id: 'declare-the-artifact-present', mutate: (matrix) => {
      for (const entry of matrix.gate) {
        for (const artifact of entry.requiredExternalArtifacts || []) {
          artifact.exists = true;
        }
      }
    }},
    {id: 'close-the-bound-finding-and-unlink-it', mutate: (matrix) => {
      const finding = findingById(matrix, BOUND_FINDING);
      finding.open = false;
      finding.gateItems = [];
    }},
    {id: 'delete-the-bound-finding', mutate: (matrix) => {
      matrix.findings = matrix.findings
        .filter((finding) => finding.id !== BOUND_FINDING);
    }},
    {id: 'the-round-3-attack-in-full', mutate: (matrix) => {
      const finding = findingById(matrix, BOUND_FINDING);
      finding.open = false;
      finding.gateItems = [];
      for (const entry of matrix.gate) {
        for (const artifact of entry.requiredExternalArtifacts || []) {
          artifact.exists = true;
        }
      }
    }},
  ];
  for (const edit of edits) {
    const mutated = readMatrix();
    edit.mutate(mutated);
    assert.equal(promotedItems(mutated).includes(ITEM_EIGHT), false,
      `item 8 is not demonstrated by metadata: ${edit.id}`);
  }
});

// The owner's six, plus the D1 and D2 cases the direction adds. Each one
// removes, invalidates, disconnects or substitutes evidence; none of them may
// leave any item demonstrated, because no item is demonstrated today.
const MONOTONICITY_MUTANTS = Object.freeze([
  {id: 'delete-a-still-unclassified-row', mutate: (matrix) => {
    matrix.rows = matrix.rows.filter((row) =>
      row.enforcementDisposition !== STILL_UNCLASSIFIED);
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
  {id: 'delete-every-repair-group-and-required-artifact', mutate: (matrix) => {
    for (const row of matrix.rows) {
      row.repairGroup = null;
    }
    for (const entry of matrix.gate) {
      entry.requiredExternalArtifacts = [];
    }
  }},
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

test('gate derivation is monotonic under removal, corruption and substitution',
  () => {
    const before = promotedItems(readMatrix());
    assert.deepEqual(before, [],
      'no gate item is demonstrated at this head');
    for (const mutant of MONOTONICITY_MUTANTS) {
      const mutated = readMatrix();
      mutant.mutate(mutated);
      assert.deepEqual(promotedItems(mutated), [],
        `losing or forging evidence never demonstrates an item: ${mutant.id}`);
    }
  });

// The verifier's three attacks, literally. Each one is run against the REAL
// validator over a mutated copy of the artifacts; the result that matters is
// that the attack is REFUSED, not that the unmutated document is green.
function roundThreeAttacks() {
  return [
    {id: 'D1-item-8-demonstrated-by-metadata', mutate: (matrix) => {
      const finding = findingById(matrix, BOUND_FINDING);
      finding.open = false;
      finding.gateItems = [];
      for (const entry of matrix.gate) {
        for (const artifact of entry.requiredExternalArtifacts || []) {
          artifact.exists = true;
        }
      }
    }},
    {id: 'D1-items-6-and-7-demonstrated-by-a-flag', mutate: (matrix) => {
      for (const id of [CEILING_FINDING, ROW_TYPE_FINDING,
        PARTITION_IDENTITY_FINDING]) {
        findingById(matrix, id).open = false;
      }
    }},
    {id: 'D2-a-flipped-dependency-citing-an-unrelated-test',
      mutate: (matrix) => {
        const row = matrix.rows.find((entry) => entry.id === FLIPPED_ROW);
        row.currentBudgetDependency = DOES_NOT_DEPEND;
        row.budgetDifferentialWitness = null;
        row.budgetIndependenceMeasurement = {
          test: UNRELATED_DIFFERENTIAL,
          statesInWhichItHolds: 'the complete stated domain',
        };
        if (row.sixAnswers) {
          row.sixAnswers.budgetRemovalChangesTheDecision = false;
        }
      }},
    {id: 'D2-producer-reachability-from-a-self-declared-real-chain-file',
      mutate: (matrix) => {
        const row = matrix.rows
          .find((entry) => entry.id === UNRELATED_REAL_CHAIN_ROW);
        row.producerReachable =
          {value: REACHABLE, witness: UNRELATED_REAL_CHAIN};
      }},
    {id: 'D3-does-not-depend-together-with-explicit-authority-required',
      mutate: (matrix) => {
        const row = matrix.rows.find((entry) =>
          entry.currentBudgetDependency === DOES_NOT_DEPEND);
        assert.ok(row,
          'the hand-off rows keep their measured does_not_depend, so the ' +
            'combination round 3 rejected is still expressible and still ' +
            'has to be refused');
        row.enforcementDisposition = AUTHORITY_REQUIRED;
      }},
  ];
}

// Round 2's exploits: a row re-pointing its OWN self-declared fields until
// it stands where another row's measurement was taken. They are monotonicity
// attacks - A4 moved gate item 4 to demonstrated - and they are run here
// against the real validator with the pin and the promoted-items snapshot
// out of the picture, so each must die on a structural rule.
const RELOCATION_PRODUCER = 'follow-up-unhealthy-source-replace';
const GUARD_SUBJECT = 'guard-admission-state';
const FIVE_HANDOFF = 'five-relocation-handoff-overlap';
const LEDGER_HANDOFF = 'ledger-relocation-handoff-overlap';

function rowOf(data, id) {
  return data.matrix.rows.find((row) => row.id === id);
}

// The verifier's own re-pointing: take the hand-off row's whole proposition.
function toHandoff(data, id) {
  const row = rowOf(data, id);
  const source = rowOf(data,
    row.partitionClass.length === 1 ? LEDGER_HANDOFF : FIVE_HANDOFF);
  row.currentBudgetDependency = DOES_NOT_DEPEND;
  row.budgetDifferentialWitness = null;
  row.budgetIndependenceMeasurement =
    structuredClone(source.budgetIndependenceMeasurement);
  row.censusMovementCondition = null;
  row.dependencyUnknownBecause = null;
  row.enforcementDisposition = 'proved-unreachable';
  row.unreachableSubject = source.unreachableSubject;
  row.domainQualification = structuredClone(source.domainQualification);
  row.admissionClasses = [];
  row.proposedAuthorizationKind = 'none';
  row.formationEvidence = structuredClone(source.formationEvidence);
  delete row.stillUnclassifiedBecause;
  delete row.requirementToClassify;
  if (row.sixAnswers) {
    row.sixAnswers.budgetRemovalChangesTheDecision = false;
  }
  if (!row.producers.includes(RELOCATION_PRODUCER)) {
    row.producers = [...row.producers, RELOCATION_PRODUCER];
  }
  if (!row.producerOperationTypes.includes('REPLACE')) {
    row.producerOperationTypes = [...row.producerOperationTypes, 'REPLACE'];
  }
  const keep = row.receipts.filter((receipt) =>
    receipt.startsWith('guard-reachability/') ||
    receipt.startsWith('producer-reachability/') ||
    receipt.startsWith('guard-state-drive/'));
  row.receipts = [...new Set([
    ...row.partitionClass.map((partitionId) =>
      `budget-independence-differential/relocation-handoff/${partitionId}`),
    `slice-provenance/relocation-handoff/${RELOCATION_PRODUCER}`,
    ...row.partitionClass.map((partitionId) =>
      `guard-reachability/${partitionId}`),
    ...keep])].sort();
}

function declareVacuous(data) {
  const entry = data.matrix.correctionToRound3.inheritedWeaknesses
    .find((weakness) =>
      weakness.id === 'arithmetic-witness-measures-nothing-row-specific');
  entry.rows = data.matrix.rows
    .filter((row) => row.guardReachable.value === 'yes' &&
      row.admissionClasses.length === 0 &&
      data.store.receipts.some((receipt) =>
        receipt.witness.file === row.guardReachable.witness.split(':')[0] &&
        receipt.dimension === 'arithmetic'))
    .map((row) => row.id);
}

function repointingMutants(matrix) {
  const nonProved = matrix.rows
    .filter((row) => row.enforcementDisposition !== 'proved-unreachable')
    .map((row) => row.id);
  const single = nonProved.map((id) => ({
    id: `A2-single-row-repointing-${id}`,
    mutate: (data) => {
      toHandoff(data, id);
      declareVacuous(data);
    }}));
  return [...single,
    {id: 'A4-four-rows-repointed-to-demonstrate-gate-item-4',
      mutate: (data) => {
        for (const id of ['five-paired-relocation-replace',
          'ledger-paired-relocation-replace', 'five-under-representation-add',
          'ledger-under-representation-add']) {
          toHandoff(data, id);
          rowOf(data, id).producerOperationTypes = ['REPLACE'];
        }
        for (const row of data.matrix.rows) {
          if (row.id.endsWith('-relocation-census-disagreement-overlap')) {
            row.producerOperationTypes = ['ADD', 'REPLACE'];
          }
        }
        declareVacuous(data);
      }},
    {id: 'p1-ledger-row-claims-the-five-partition-class',
      mutate: (data) => {
        const row = rowOf(data, LEDGER_HANDOFF);
        row.partitionClass = ['replica_operations-p1',
          ...rowOf(data, FIVE_HANDOFF).partitionClass];
        row.producerReachable =
          {value: 'yes', witness: row.guardReachable.witness};
        row.receipts = [...new Set([...row.receipts,
          ...rowOf(data, FIVE_HANDOFF).receipts])].sort();
        data.matrix.correctionToRound3.witnessDiscrepancies =
          data.matrix.correctionToRound3.witnessDiscrepancies
            .filter((entry) => entry.row !== LEDGER_HANDOFF);
      }},
    {id: 'p2-a-row-drops-a-partition-from-its-class',
      mutate: (data) => {
        const row = rowOf(data, 'five-minted-spread-cure-add');
        row.partitionClass = row.partitionClass
          .filter((partitionId) => partitionId !== 'sql_write_operations-p1');
        row.receipts = row.receipts
          .filter((id) => !id.endsWith('/sql_write_operations-p1'));
      }},
    {id: 'p3-a-depends-row-takes-the-guard-admission-subject',
      mutate: (data) => {
        const source = rowOf(data, 'owner-partition-services');
        const row = rowOf(data, 'five-initial-provisioning-add');
        row.partitionClass = ['services-p1'];
        row.currentBudgetDependency = 'unreachable_in_stated_domain';
        row.budgetDifferentialWitness = null;
        row.enforcementDisposition = 'proved-unreachable';
        row.unreachableSubject = GUARD_SUBJECT;
        row.provedUnreachableDomain =
          structuredClone(source.provedUnreachableDomain);
        row.guardReachable = {value: 'no', witness: 'none'};
        row.producerReachable = {value: 'no', witness: 'none'};
        row.admissionClasses = [];
        row.proposedAuthorizationKind = 'none';
        row.formationEvidence = structuredClone(source.formationEvidence);
        delete row.stillUnclassifiedBecause;
        delete row.requirementToClassify;
        row.receipts = [...source.receipts];
      }},
    {id: 'p4-a-depends-add-row-flips-to-does-not-depend',
      mutate: (data) => {
        const row = rowOf(data, 'five-initial-provisioning-add');
        row.currentBudgetDependency = DOES_NOT_DEPEND;
        row.budgetDifferentialWitness = null;
        row.budgetIndependenceMeasurement = structuredClone(
          rowOf(data, FIVE_HANDOFF).budgetIndependenceMeasurement);
        row.producers = [...row.producers, RELOCATION_PRODUCER];
        row.producerOperationTypes = ['ADD', 'REPLACE'];
        row.receipts = [
          ...row.receipts.filter((id) => !id.startsWith('budget-dependence/')),
          ...row.partitionClass.map((partitionId) =>
            `budget-independence-differential/relocation-handoff/${
              partitionId}`),
          `slice-provenance/relocation-handoff/${RELOCATION_PRODUCER}`].sort();
      }},
    {id: 'p5-a-row-replaces-its-producers-outright',
      mutate: (data) => {
        toHandoff(data, 'five-paired-relocation-replace');
        rowOf(data, 'five-paired-relocation-replace').producers =
          [RELOCATION_PRODUCER];
        declareVacuous(data);
      }},
  ];
}

test('every round-2 re-pointing is refused by a structural rule', () => {
  const matrix = readMatrix();
  const store = readReceiptStore();
  const survivors = [];
  for (const mutant of repointingMutants(matrix)) {
    const data = {matrix: structuredClone(matrix),
      store: structuredClone(store)};
    mutant.mutate(data);
    rederiveGate(data.matrix);
    if (runRealValidatorOn(data.matrix, {receipts: data.store}).green) {
      survivors.push(mutant.id);
    }
  }
  assert.deepEqual(survivors, [],
    'a row may not re-point its own self-declared fields until it stands ' +
      `where another row's measurement was taken: ${survivors.join(', ')}`);
});

test('the three round-3 attacks no longer work', () => {
  for (const attack of roundThreeAttacks()) {
    const mutated = readMatrix();
    attack.mutate(mutated);
    rederiveGate(mutated);
    const run = runRealValidatorOn(mutated);
    assert.equal(run.green, false,
      `the validator refuses the round-3 attack: ${attack.id}`);
  }
});
