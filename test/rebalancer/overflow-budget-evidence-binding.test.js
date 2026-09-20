// D2: evidence that is BOUND to the row and the value it proves (quest
// overflow-budget-audit-evidence-binding, receipts
// every-dependency-receipt-is-row-field-value-domain-bound,
// every-producer-reachability-receipt-is-row-and-producer-bound,
// measuring-tests-emit-the-receipts-they-are-cited-for and
// receipt-binding-mutants-all-fail-structurally).
//
// Round 3's second defect: a row's receipt was a POINTER - a path to a test
// file and a test name. A pointer proves that a test exists, not that the
// test measured this row's value, so a dependency flipped to its opposite
// stayed green while citing an unrelated test, and any row could claim its
// producer was reachable by citing a file that declares itself a real-chain
// witness without ever driving that row's producer.
//
// A receipt here is data a measuring test EMITS from the numbers it measured.
// It carries the row it is about, the KIND - one per proof shape, so a
// measurement of one shape can never stand in for another - the field, the
// value that shape and those numbers derive, the named domain, the witness,
// and the result. The validator resolves the row's receipt ids and compares
// field by field.
//
// The last two tests are the structural claims the owner asked for: that the
// validator selects a row's discipline from what the row SAYS and never from
// which row it is, and that the committed receipt file is what the measuring
// tests emit rather than a document anyone can edit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEPENDENCY_KINDS,
  MEASURING_WITNESSES,
  GUARD_REACHABILITY_KIND,
  INDEPENDENCE_KIND,
  REACHABILITY_KIND,
  RECEIPT_EMIT_DIR_ENV,
  SLICE_PROVENANCE_KIND,
  buildReceiptStore,
  canonicalJson,
  dependencyProvedByReceipt,
} from './overflow-budget-receipt-emission.js';
import {
  D3_ROW_IDS,
  MATRIX_VALIDATOR_TEST,
  readMatrix,
  readReceiptStore,
  rederiveGate,
  runNamedTestHere,
  runRealValidatorOn,
} from './overflow-budget-evidence-support.js';
import {readTextArtifact} from './overflow-budget-audit-support.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

const RECEIPTS_SCHEMA = 'overflow-budget-evidence-receipts/2';
const DEPENDENCY_FIELD = 'currentBudgetDependency';
const REACHABLE = 'yes';
const DEPENDS = 'depends';
const REAL_CHAIN_MARKER = '// AUDIT-WITNESS-KIND: real-chain';
const UTF8 = 'utf8';
const EMIT_PREFIX = 'overflow-budget-emit-';
const EMIT_SUFFIX = '.json';
const ONE = 1;
const RENAMED_SUFFIX = '-renamed-by-a-mutant';

// The modules that decide anything about a row. None of them may name a
// hand-off row: the discipline follows the proposition, not the identity.
const DECIDING_MODULES = Object.freeze([
  MATRIX_VALIDATOR_TEST,
  'test/rebalancer/overflow-budget-audit-render.js',
  'test/rebalancer/overflow-budget-audit-observation.js',
  'test/rebalancer/overflow-budget-receipt-emission.js',
]);

function loadStore() {
  const store = readReceiptStore();
  assert.equal(store.schema, RECEIPTS_SCHEMA,
    'the receipt file names its schema');
  assert.ok(Array.isArray(store.receipts) && store.receipts.length > 0,
    'and carries receipts');
  assert.ok(Array.isArray(store.slices) && store.slices.length > 0,
    'and a copy of the slice registry, for a reader - the validator uses ' +
      'the registry in code, never this copy');
  return store;
}

function receiptIndex(store) {
  const byId = new Map();
  for (const receipt of store.receipts) {
    assert.equal(byId.has(receipt.id), false,
      `receipt ids are unique: ${receipt.id}`);
    byId.set(receipt.id, receipt);
  }
  return byId;
}

function resolveRowReceipts(row, byId) {
  assert.ok(Array.isArray(row.receipts) && row.receipts.length > 0,
    `row ${row.id} references the receipts that prove it`);
  return row.receipts.map((id) => {
    const receipt = byId.get(id);
    assert.ok(receipt, `row ${row.id} references a known receipt: ${id}`);
    return receipt;
  });
}

function assertWitnessCarriesTheTest(receipt) {
  const witness = receipt.witness;
  assert.ok(witness && typeof witness.file === 'string' &&
    typeof witness.test === 'string',
  `receipt ${receipt.id} names the witness that produced it`);
  assert.ok(fs.existsSync(witness.file),
    `and that witness file exists: ${receipt.id}`);
  assert.ok(readTextArtifact(witness.file).includes(witness.test),
    `and carries the named test: ${receipt.id}`);
}

function coveredPartitions(group) {
  return [...new Set(group.flatMap((receipt) => receipt.measuredPartitions))]
    .sort();
}

function ofKind(receipts, kinds) {
  return receipts.filter((receipt) => kinds.includes(receipt.kind));
}

test('every dependency receipt binds the row, the field, the value and the domain',
  () => {
    const matrix = readMatrix();
    const store = loadStore();
    const byId = receiptIndex(store);
    // A receipt names NO row. What makes it this row's evidence is that the
    // measurement covers this row's partitions, over the slice this row's
    // classification is a claim about.
    for (const receipt of store.receipts) {
      assert.equal(Object.hasOwn(receipt, 'rowId'), false,
        `a receipt records a measurement, not a row: ${receipt.id}`);
      const serialized = canonicalJson(receipt);
      for (const row of matrix.rows) {
        assert.equal(serialized.includes(row.id), false,
          `and no row id appears anywhere in it: ${receipt.id} / ${row.id}`);
      }
    }
    for (const row of matrix.rows) {
      const resolved = resolveRowReceipts(row, byId);
      const dependency = ofKind(resolved, DEPENDENCY_KINDS);
      assert.ok(dependency.length > 0,
        `row ${row.id} cites the measurement of its dependency`);
      for (const receipt of dependency) {
        const derived = dependencyProvedByReceipt(receipt);
        assert.ok(derived,
          `receipt ${receipt.id} measured what its kind claims`);
        assert.equal(receipt.field, DEPENDENCY_FIELD,
          `and names the field it settles: ${receipt.id}`);
        assertWitnessCarriesTheTest(receipt);
      }
      // Coverage, not a stamp: the cited measurements speak for this row's
      // partitions and for no others.
      if (dependency[0].kind !== 'producer-not-driven') {
        const perSlice = new Map();
        for (const receipt of dependency) {
          perSlice.set(receipt.sliceId,
            [...(perSlice.get(receipt.sliceId) || []), receipt]);
        }
        for (const [sliceId, group] of perSlice) {
          assert.deepEqual(coveredPartitions(group),
            [...row.partitionClass].sort(),
            `the ${sliceId} measurement covers exactly this row's ` +
              `partitions: ${row.id}`);
        }
      }
    }
  });

test('every producer-reachability receipt binds the row and the producer it drove',
  () => {
    const matrix = readMatrix();
    const store = loadStore();
    const byId = receiptIndex(store);
    let bound = 0;
    for (const row of matrix.rows) {
      const resolved = resolveRowReceipts(row, byId);
      const reachability = ofKind(resolved, [REACHABILITY_KIND]);
      if (row.producerReachable.value !== REACHABLE) {
        assert.equal(reachability.length, 0,
          `a row not claiming reachability cites no drive: ${row.id}`);
        continue;
      }
      assert.equal(reachability.length, ONE,
        `a producer-reachable row cites one drive: ${row.id}`);
      const receipt = reachability[0];
      assert.ok(row.producers.includes(receipt.producerId),
        `the drive is of a producer THIS row declares: ${row.id} / ${
          receipt.producerId}`);
      assert.ok(
        row.producerOperationTypes.includes(receipt.observedOperationType),
        `and produced an operation this row produces: ${row.id}`);
      for (const partitionId of receipt.measuredPartitions) {
        assert.ok(row.partitionClass.includes(partitionId),
          `and was driven on a partition this row covers: ${row.id} / ${
            partitionId}`);
      }
      assert.ok(readTextArtifact(receipt.witness.file)
        .includes(REAL_CHAIN_MARKER),
      `and the drive is a real chain: ${row.id}`);
      assert.ok(Object.keys(receipt.producerFacts).length > 0,
        `and carries the facts it established: ${row.id}`);
      bound += ONE;
    }
    assert.ok(bound > 0, 'the producer-reachable rows are bound');
  });

function freshEmission() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), EMIT_PREFIX));
  try {
    // The witnesses are a CODE constant, never discovered from the store
    // under check: a store that dropped a witness's receipts would
    // otherwise pass by omission.
    for (const witness of MEASURING_WITNESSES) {
      const run = runNamedTestHere(witness.file, `^${witness.test}$`,
        {[RECEIPT_EMIT_DIR_ENV]: directory});
      assert.equal(run.passed, true,
        `the measuring test runs and passes: ${witness.file}`);
    }
    const emitted = [];
    for (const name of fs.readdirSync(directory)) {
      if (!name.endsWith(EMIT_SUFFIX)) {
        continue;
      }
      emitted.push(...JSON.parse(
        fs.readFileSync(path.join(directory, name), UTF8)));
    }
    return emitted;
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

test('the committed receipts are the ones the measuring tests emit', () => {
  const emitted = freshEmission();
  // The WHOLE committed file, not only its receipts: the slice registry it
  // carries is compared too, so a hand-edited definition is caught here as
  // well as ignored by the validator (which reads the code registry).
  assert.equal(canonicalJson(buildReceiptStore(emitted)),
    canonicalJson(readReceiptStore()),
    'the committed receipt file is what the measuring tests emitted; it ' +
      'cannot be hand-written and it cannot go stale');
});

// The verifier's round-1 exploits, and the owner's binding mutants. Every one
// runs against the REAL validator over a mutated copy, and - this is the
// point of the repair - the PIN is not in the picture: these die on the
// evidence itself.
function bindingMutants(matrix) {
  const rows = matrix.rows.filter((row) => row.receipts.length > 0);
  const [first, second] = rows;
  const citedOfKind = (data, id, kinds) => {
    const row = data.matrix.rows.find((entry) => entry.id === id);
    return row.receipts
      .map((rid) => data.store.receipts.find((r) => r.id === rid))
      .filter((receipt) => kinds.includes(receipt.kind));
  };
  const rowIn = (data, id) => data.matrix.rows.find((row) => row.id === id);
  const ledgerHandoff = 'ledger-relocation-handoff-overlap';
  const fiveHandoff = 'five-relocation-handoff-overlap';
  const escapeRows = matrix.rows
    .filter((row) => row.enforcementDisposition === 'still-unclassified' &&
      row.currentBudgetDependency === DEPENDS &&
      row.producerOperationTypes.join() === 'ADD')
    .slice(0, 3).map((row) => row.id);
  return [
    // X1 (verifier): the ledger hand-off row claims producer reachability
    // and takes the receipt of the drive on sql_transactions-p1.
    {id: 'X1-ledger-row-claims-a-drive-on-another-partition',
      mutate: (data) => {
        const row = rowIn(data, ledgerHandoff);
        const drive = data.store.receipts.find((receipt) =>
          receipt.kind === REACHABILITY_KIND &&
          row.producers.includes(receipt.producerId));
        row.producerReachable = {value: REACHABLE,
          witness: row.guardReachable.witness};
        row.receipts = [...row.receipts, drive.id].sort();
      }},
    // X2 (verifier): still-unclassified ADD rows escape into the hand-off
    // subject by matrix edits and regeneration.
    {id: 'X2-still-unclassified-add-rows-escape-into-the-handoff-subject',
      mutate: (data) => {
        const source = rowIn(data, fiveHandoff);
        for (const rowId of escapeRows) {
          const row = rowIn(data, rowId);
          row.currentBudgetDependency = 'does_not_depend';
          row.budgetDifferentialWitness = null;
          row.budgetIndependenceMeasurement =
            structuredClone(source.budgetIndependenceMeasurement);
          row.censusMovementCondition = null;
          row.enforcementDisposition = 'proved-unreachable';
          row.unreachableSubject = source.unreachableSubject;
          row.domainQualification = structuredClone(source.domainQualification);
          row.admissionClasses = [];
          row.proposedAuthorizationKind = 'none';
          row.formationEvidence = structuredClone(source.formationEvidence);
          row.stillUnclassifiedBecause = null;
          row.requirementToClassify = null;
          if (row.sixAnswers) {
            row.sixAnswers.budgetRemovalChangesTheDecision = false;
          }
          row.receipts = [...source.receipts];
        }
      }},
    {id: 'swap-the-evidence-of-two-rows', mutate: (data) => {
      const left = rowIn(data, first.id);
      const right = rowIn(data, second.id);
      const carried = left.receipts;
      left.receipts = right.receipts;
      right.receipts = carried;
    }},
    {id: 'drop-a-partition-from-the-coverage', mutate: (data) => {
      const row = rowIn(data, second.id);
      row.receipts = row.receipts.slice(1);
    }},
    {id: 'cite-a-measurement-of-another-partition', mutate: (data) => {
      const row = rowIn(data, first.id);
      const foreign = data.store.receipts.find((receipt) =>
        DEPENDENCY_KINDS.includes(receipt.kind) &&
        !receipt.measuredPartitions.some((p) => row.partitionClass.includes(p)));
      row.receipts = [...row.receipts, foreign.id].sort();
    }},
    {id: 'point-at-an-unknown-measurement', mutate: (data) => {
      rowIn(data, first.id).receipts = ['no-such-receipt'];
    }},
    {id: 'claim-more-states-than-were-evaluated', mutate: (data) => {
      const receipt = citedOfKind(data, first.id, DEPENDENCY_KINDS)[0];
      receipt.result = {...receipt.result,
        evaluationsWithBudgetForcedToZero:
          receipt.result.evaluationsWithBudgetForcedToZero - 1};
    }},
    {id: 'claim-a-differential-over-zero-states', mutate: (data) => {
      const receipt = citedOfKind(data, first.id, DEPENDENCY_KINDS)[0];
      receipt.result = {...receipt.result, statesEnumerated: 0,
        evaluationsWithActualBudget: 0,
        evaluationsWithBudgetForcedToZero: 0};
    }},
    {id: 'claim-independence-with-an-admission-difference', mutate: (data) => {
      const receipt = citedOfKind(data, fiveHandoff, [INDEPENDENCE_KIND])[0];
      receipt.result = {...receipt.result, admissionDifferences: 1};
    }},
    {id: 'move-a-measurement-to-another-slice', mutate: (data) => {
      const receipt = citedOfKind(data, fiveHandoff, [INDEPENDENCE_KIND])[0];
      receipt.sliceId = 'whole-stated-grid';
    }},
    {id: 'strip-the-producer-facts-a-drive-established', mutate: (data) => {
      const receipt = citedOfKind(data, fiveHandoff, [REACHABILITY_KIND])[0];
      receipt.producerFacts = {};
    }},
    {id: 'drop-the-drive-that-links-the-slice-to-a-producer',
      mutate: (data) => {
        const row = rowIn(data, fiveHandoff);
        row.receipts = row.receipts.filter((id) =>
          !id.startsWith(`${SLICE_PROVENANCE_KIND}/`));
      }},
    {id: 'claim-the-slice-through-another-producers-drive',
      mutate: (data) => {
        const receipt = citedOfKind(data, fiveHandoff,
          [SLICE_PROVENANCE_KIND])[0];
        receipt.producerId = 'provisioning-create-operation';
      }},
    {id: 'take-the-guard-measurement-of-another-partition',
      mutate: (data) => {
        const row = rowIn(data, ledgerHandoff);
        const foreign = data.store.receipts.find((receipt) =>
          receipt.kind === GUARD_REACHABILITY_KIND &&
          !row.partitionClass.includes(receipt.measuredPartitions[0]));
        row.receipts = [...row.receipts.filter((id) =>
          !id.startsWith(`${GUARD_REACHABILITY_KIND}/`)), foreign.id].sort();
      }},
    {id: 'use-the-grid-guard-path-without-declaring-the-discrepancy',
      mutate: (data) => {
        data.matrix.correctionToRound3.witnessDiscrepancies =
          data.matrix.correctionToRound3.witnessDiscrepancies
            .filter((entry) => entry.row !== ledgerHandoff);
      }},
    // ...and the other direction: a discrepancy declared where the pinned
    // witness DID measure the row is a false statement about round 3.
    {id: 'declare-a-discrepancy-where-the-pinned-witness-did-measure-the-row',
      mutate: (data) => {
        const declared = data.matrix.correctionToRound3.witnessDiscrepancies;
        data.matrix.correctionToRound3.witnessDiscrepancies = [...declared,
          {...declared[0], row: fiveHandoff,
            rowPartitionClass: [...rowIn(data, fiveHandoff).partitionClass]
              .sort()}];
      }},
    {id: 'declare-a-discrepancy-for-a-row-whose-witness-is-arithmetic',
      mutate: (data) => {
        const declared = data.matrix.correctionToRound3.witnessDiscrepancies;
        const row = data.matrix.rows.find((entry) =>
          entry.guardReachable.value === REACHABLE &&
          entry.admissionClasses.length > 0 &&
          entry.receipts.some((id) => id.startsWith('arithmetic-')));
        data.matrix.correctionToRound3.witnessDiscrepancies = [...declared,
          {...declared[0], row: row.id,
            rowPartitionClass: [...row.partitionClass].sort()}];
      }},
    // The vacuous-arithmetic record must be exactly the derived set.
    {id: 'drop-a-row-from-the-vacuous-arithmetic-record', mutate: (data) => {
      const entry = data.matrix.correctionToRound3.inheritedWeaknesses
        .find((weakness) =>
          weakness.id === 'arithmetic-witness-measures-nothing-row-specific');
      entry.rows = entry.rows.slice(1);
    }},
    {id: 'add-a-class-claiming-row-to-the-vacuous-arithmetic-record',
      mutate: (data) => {
        const entry = data.matrix.correctionToRound3.inheritedWeaknesses
          .find((weakness) =>
            weakness.id === 'arithmetic-witness-measures-nothing-row-specific');
        const claiming = data.matrix.rows.find((row) =>
          row.admissionClasses.length > 0 &&
          row.receipts.some((id) => id.startsWith('arithmetic-')));
        entry.rows = [...entry.rows, claiming.id];
      }},
    // Round 2's correction-record attacks.
    {id: 'declare-a-discrepancy-for-a-row-that-does-not-exist',
      mutate: (data) => {
        const declared = data.matrix.correctionToRound3.witnessDiscrepancies;
        declared.push({...declared[0], row: 'no-such-row'});
      }},
    {id: 'declare-the-same-discrepancy-twice', mutate: (data) => {
      const declared = data.matrix.correctionToRound3.witnessDiscrepancies;
      declared.unshift({...declared[0],
        pinnedWitnessDrivenPartition: 'bogus-partition'});
    }},
    {id: 'delete-a-recorded-inherited-weakness', mutate: (data) => {
      data.matrix.correctionToRound3.inheritedWeaknesses =
        data.matrix.correctionToRound3.inheritedWeaknesses
          .filter((weakness) =>
            weakness.id !== 'blocking-findings-are-listed-but-not-required');
    }},
    {id: 'carry-a-stray-field-on-a-finding', mutate: (data) => {
      data.matrix.findings[0].resolvedByFiat = true;
    }},
    {id: 'carry-a-stray-field-on-a-required-artifact', mutate: (data) => {
      for (const entry of data.matrix.gate) {
        for (const artifact of entry.requiredExternalArtifacts || []) {
          artifact.exists = true;
        }
      }
    }},
    {id: 'give-a-row-an-operation-type-its-producers-cannot-emit',
      mutate: (data) => {
        const row = data.matrix.rows
          .find((entry) => entry.producerOperationTypes.join() === 'ADD');
        row.producerOperationTypes = ['ADD', 'REPLACE'];
      }},
    {id: 'give-a-row-a-partition-set-of-its-own-making', mutate: (data) => {
      const row = data.matrix.rows
        .find((entry) => entry.partitionClass.length === 5);
      row.partitionClass = row.partitionClass.slice(0, 3);
    }},
    {id: 'drop-the-arithmetic-half-of-a-rows-guard-evidence',
      mutate: (data) => {
        const row = data.matrix.rows.find((entry) =>
          entry.receipts.some((id) => id.startsWith('arithmetic-')));
        row.receipts = row.receipts
          .filter((id) => !id.startsWith('arithmetic-'));
      }},
    {id: 'take-partition-coverage-from-the-arithmetic-witness',
      mutate: (data) => {
        const row = data.matrix.rows.find((entry) =>
          entry.receipts.some((id) => id.startsWith('arithmetic-')));
        const arithmetic = data.store.receipts.find((entry) =>
          entry.id === row.receipts
            .find((id) => id.startsWith('arithmetic-')));
        arithmetic.measuredPartitions = [...row.partitionClass];
        row.receipts = row.receipts
          .filter((id) => !id.startsWith('guard-reachability/'));
      }},
  ];
}

test('every receipt-binding mutant fails structurally', () => {
  const matrix = readMatrix();
  const store = readReceiptStore();
  // The discipline is selected by what a row SAYS, never by which row it is.
  for (const module of DECIDING_MODULES) {
    const source = readTextArtifact(module);
    for (const rowId of D3_ROW_IDS) {
      assert.equal(source.includes(rowId), false,
        `no rule branches on a hand-off row id: ${module} / ${rowId}`);
    }
  }
  // Renaming a row consistently changes nothing, because no receipt names a
  // row at all: only the row's own citation list moves.
  const renamed = {matrix: structuredClone(matrix), store};
  const oldId = D3_ROW_IDS[0];
  const renamedRow = renamed.matrix.rows.find((row) => row.id === oldId);
  renamedRow.id = `${oldId}${RENAMED_SUFFIX}`;
  renamed.matrix.correctionToRound3.rows =
    renamed.matrix.correctionToRound3.rows
      .map((id) => (id === oldId ? renamedRow.id : id));
  renamed.matrix.correctionToRound3.witnessDiscrepancies =
    renamed.matrix.correctionToRound3.witnessDiscrepancies
      .map((entry) => (entry.row === oldId ?
        {...entry, row: renamedRow.id} : entry));
  rederiveGate(renamed.matrix);
  assert.equal(runRealValidatorOn(renamed.matrix, {receipts: store}).green,
    true,
    'a row renamed in the matrix alone stays valid: its evidence never ' +
      'named it, so there is nothing to keep in step');
  for (const mutant of bindingMutants(matrix)) {
    const data = {matrix: structuredClone(matrix),
      store: structuredClone(store)};
    mutant.mutate(data);
    rederiveGate(data.matrix);
    const run = runRealValidatorOn(data.matrix, {receipts: data.store});
    assert.equal(run.green, false,
      `the validator refuses the mutant: ${mutant.id}`);
  }
});
