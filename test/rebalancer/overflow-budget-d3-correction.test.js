// D3, the one content correction the superseded audit needs (quest
// overflow-budget-audit-evidence-binding, receipts
// d3-handoff-rows-corrected-with-domain-qualification and
// gate-item-3-follows-from-the-corrected-rows-by-derivation).
//
// Round 3 upheld the two hand-off rows' MEASUREMENT - does_not_depend across
// the complete stated hand-off domain, on the real guard - and rejected the
// disposition they carry with it. The inherited document let
// proved-unreachable mean only one thing: that the guard admission state
// itself is unreachable. These rows' guard state IS reachable, so the
// proposition each proved row proves is now EXPLICIT on the row, as a closed
// two-value enum, and the validator selects the proof discipline from that
// enum through a table - never from a row id.
//
// The four facts this row rests on are all structural, and all four are
// checked here without reading a word of prose:
//   1. the relocation transition exists - the producer-reachability receipt
//      for the five- row, and whatever round 3 upheld for the ledger- row;
//   2. the guard-visible hand-off state exists - guardReachable yes and its
//      own bound receipt;
//   3. admission does not depend on the budget - a differential receipt over
//      the complete stated domain with zero decision differences;
//   4. therefore no budget-dependent authority requirement is reachable -
//      the disposition and its subject.
//
// The cross-subject mutants at the end are the point: each one states a
// DIFFERENT proposition, and each is refused by the real validator.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveGateStatus,
  gateContractFor,
  openGateFindings,
  selectGateRows,
  unmetGateRequirements,
} from './overflow-budget-audit-render.js';
import {
  GUARD_REACHABILITY_KIND,
  GUARD_UNREACHABILITY_KIND,
  INDEPENDENCE_KIND,
  REACHABILITY_KIND,
  SLICE_PROVENANCE_KIND,
} from './overflow-budget-receipt-emission.js';
import {
  D3_ROW_IDS,
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

const AUTHORITY_REQUIRED = 'explicit-authority-required';
const MEASURED_DEPENDENCY = 'does_not_depend';
const PROVED_UNREACHABLE = 'proved-unreachable';
const GUARD_SUBJECT = 'guard-admission-state';
const AUTHORITY_SUBJECT = 'budget-dependent-authority-requirement';
const NO_KIND = 'none';
const REACHABLE = 'yes';
const SPREAD_RECOVERY_FINDING = 'spread-recovery-decision-has-two-owners';
const SPREAD_RECOVERY_JUSTIFICATION =
  'two modules decide the same spread-recovery semantic';
const LEDGER_RESULT =
  'ordinary +1 relocation is covered by the normal replacement allowance; ' +
  'no ledger-local reason for additional overflow authority has been ' +
  'demonstrated.';
const LEDGER_PREFIX = 'ledger-';
const MINTS_TODAY = 'five-minted-spread-cure-add';
const GATE_ITEM_THREE = 3;
const BLOCKED = 'blocked-on-owner-decision';
const LEDGER_AUTHORITY = /ledger.*authority|authority.*ledger/u;
const NO_DIFFERENCES = 0;

function rowsById(matrix) {
  return new Map(matrix.rows.map((row) => [row.id, row]));
}

// A row's evidence is what it CITES; a receipt names no row, so this is the
// only way to ask what a row rests on.
function receiptsFor(store, row) {
  return row.receipts.map((id) =>
    store.receipts.find((receipt) => receipt.id === id));
}

function ofKind(receipts, kind) {
  return receipts.filter((receipt) => receipt.kind === kind);
}

// Fact 3, structurally: a differential over the complete stated domain, with
// the state count the run enumerated, both executions, and zero differences.
function assertDifferential(receipts, row) {
  const differential = ofKind(receipts, INDEPENDENCE_KIND);
  assert.ok(differential.length > 0,
    `the row rests on a budget-independence differential: ${row.id}`);
  assert.deepEqual(
    [...new Set(differential.flatMap((e) => e.measuredPartitions))].sort(),
    [...row.partitionClass].sort(),
    `measured over exactly this row's partitions: ${row.id}`);
  for (const entry of differential) {
    assert.equal(entry.sliceId, row.domainQualification.sliceId,
      `over the slice the row qualifies: ${row.id}`);
  }
  const result = differential.reduce((sum, entry) => ({
    statesEnumerated: sum.statesEnumerated + entry.result.statesEnumerated,
    evaluationsWithActualBudget: sum.evaluationsWithActualBudget +
      entry.result.evaluationsWithActualBudget,
    evaluationsWithBudgetForcedToZero: sum.evaluationsWithBudgetForcedToZero +
      entry.result.evaluationsWithBudgetForcedToZero,
    admissionDifferences:
      sum.admissionDifferences + entry.result.admissionDifferences,
  }), {statesEnumerated: 0, evaluationsWithActualBudget: 0,
    evaluationsWithBudgetForcedToZero: 0, admissionDifferences: 0});
  assert.ok(result.statesEnumerated > NO_DIFFERENCES,
    `over a domain with states in it: ${row.id}`);
  assert.equal(result.evaluationsWithActualBudget, result.statesEnumerated,
    `each state evaluated with the budget the owner resolved: ${row.id}`);
  assert.equal(result.evaluationsWithBudgetForcedToZero,
    result.statesEnumerated,
    `and each evaluated again with the budget forced to zero: ${row.id}`);
  assert.equal(result.admissionDifferences, NO_DIFFERENCES,
    `and no admission differed: ${row.id}`);
  return result;
}

// Each mutant states a DIFFERENT proposition, or proves one with the wrong
// shape of evidence. Every one is run against the real validator.
function crossSubjectMutants(matrix) {
  const guardRow = matrix.rows
    .find((row) => row.unreachableSubject === GUARD_SUBJECT);
  const handoffRow = matrix.rows
    .find((row) => row.unreachableSubject === AUTHORITY_SUBJECT);
  const rowIn = (data, id) => data.matrix.rows.find((row) => row.id === id);
  const citedOfKind = (data, id, kind) => rowIn(data, id).receipts
    .map((rid) => data.store.receipts.find((receipt) => receipt.id === rid))
    .filter((receipt) => receipt.kind === kind);
  return [
    {id: 'a-inherited-unreachable-row-claims-the-authority-subject',
      mutate: (data) => {
        rowIn(data, guardRow.id).unreachableSubject = AUTHORITY_SUBJECT;
      }},
    {id: 'b-handoff-row-claims-the-guard-admission-subject',
      mutate: (data) => {
        rowIn(data, handoffRow.id).unreachableSubject = GUARD_SUBJECT;
      }},
    {id: 'c-guard-unreachability-receipt-cited-for-an-authority-row',
      mutate: (data) => {
        for (const receipt of citedOfKind(data, handoffRow.id,
          INDEPENDENCE_KIND)) {
          receipt.kind = GUARD_UNREACHABILITY_KIND;
        }
      }},
    {id: 'd-independence-receipt-cited-for-a-guard-unreachability-row',
      mutate: (data) => {
        for (const receipt of citedOfKind(data, guardRow.id,
          GUARD_UNREACHABILITY_KIND)) {
          receipt.kind = INDEPENDENCE_KIND;
        }
      }},
    {id: 'e-guard-reachable-yes-under-the-guard-admission-subject',
      mutate: (data) => {
        rowIn(data, guardRow.id).guardReachable =
          {value: 'yes', witness: handoffRow.guardReachable.witness};
      }},
    {id: 'f-guard-reachable-no-under-the-authority-subject',
      mutate: (data) => {
        rowIn(data, handoffRow.id).guardReachable =
          {value: 'no', witness: 'none'};
      }},
    {id: 'h-the-qualification-states-a-different-subject-than-the-row',
      mutate: (data) => {
        rowIn(data, handoffRow.id).domainQualification.unreachable =
          GUARD_SUBJECT;
      }},
    {id: 'i-what-remains-reachable-is-outside-the-closed-enum',
      mutate: (data) => {
        rowIn(data, handoffRow.id).domainQualification.remainsReachable =
          ['operation', 'guard-state', 'something-nobody-measured'];
      }},
    {id: 'j-what-remains-reachable-drops-the-operation',
      mutate: (data) => {
        rowIn(data, handoffRow.id).domainQualification.remainsReachable =
          ['guard-state'];
      }},
    {id: 'g-ledger-authority-required-while-the-differential-stands',
      mutate: (data) => {
        const ledger = rowIn(data,
          D3_ROW_IDS.find((id) => id.startsWith(LEDGER_PREFIX)));
        ledger.enforcementDisposition = AUTHORITY_REQUIRED;
        ledger.proposedAuthorizationKind = 'ledger_overflow_authority';
        data.matrix.repairQuests.push({group: 'grant-ledger-authority',
          notStarted: true, cause: 'x', proposal: 'y'});
      }},
  ];
}

test('the two hand-off rows carry the disposition that fits a measured does_not_depend',
  () => {
    const matrix = readMatrix();
    const store = readReceiptStore();
    const byId = rowsById(matrix);
    for (const rowId of D3_ROW_IDS) {
      const row = byId.get(rowId);
      assert.ok(row, `the hand-off row is in the matrix: ${rowId}`);
      const receipts = receiptsFor(store, row);
      // The MEASUREMENT is inherited and untouched.
      assert.equal(row.currentBudgetDependency, MEASURED_DEPENDENCY,
        `the inherited measurement stands: ${rowId}`);
      // D3 itself: the combination round 3 rejected is gone, and the
      // proposition the disposition asserts is explicit.
      assert.notEqual(row.enforcementDisposition, AUTHORITY_REQUIRED,
        'a class whose admission does not depend on the budget requires no ' +
          `authority to replace it: ${rowId}`);
      assert.equal(row.enforcementDisposition, PROVED_UNREACHABLE,
        `and takes the existing disposition, with no new taxonomy: ${rowId}`);
      assert.equal(row.unreachableSubject, AUTHORITY_SUBJECT,
        `stating which proposition is unreachable: ${rowId}`);
      assert.equal(row.domainQualification.unreachable, AUTHORITY_SUBJECT,
        `and repeating it structurally: ${rowId}`);
      assert.deepEqual([...row.domainQualification.remainsReachable].sort(),
        ['guard-state', 'operation'],
        `and what stays reachable: ${rowId}`);
      // Fact 2: the guard-visible hand-off state, with its own receipt.
      assert.equal(row.guardReachable.value, REACHABLE,
        `the guard-visible hand-off state exists: ${rowId}`);
      const guard = ofKind(receipts, GUARD_REACHABILITY_KIND);
      assert.deepEqual(
        [...new Set(guard.flatMap((entry) => entry.measuredPartitions))].sort(),
        [...row.partitionClass].sort(),
        `and the guard measurement covers exactly its partitions: ${rowId}`);
      // Fact 1: the transition exists - as round 3 upheld it for this row.
      assert.equal(ofKind(receipts, REACHABILITY_KIND).length,
        row.producerReachable.value === REACHABLE ? 1 : 0,
        `the producer-reachability evidence is as round 3 left it: ${rowId}`);
      // The slice is a state a producer creates, and the drive that showed
      // one creating it names a producer THIS row declares.
      const provenance = ofKind(receipts, SLICE_PROVENANCE_KIND);
      assert.equal(provenance.length, 1,
        `the hand-off slice is linked to a drive: ${rowId}`);
      assert.ok(row.producers.includes(provenance[0].producerId),
        `of a producer this row declares: ${rowId}`);
      // Fact 3.
      assertDifferential(receipts, row);
      // Fact 4, and nothing beyond it.
      assert.equal(row.proposedAuthorizationKind, NO_KIND,
        `no authorization kind is proposed: ${rowId}`);
      assert.equal(ofKind(receipts, GUARD_UNREACHABILITY_KIND).length, 0,
        `and no guard-unreachability is claimed: ${rowId}`);
    }
    // The ledger result, verbatim, on the ledger row.
    const ledger = byId.get(D3_ROW_IDS.find((id) => id.startsWith(LEDGER_PREFIX)));
    assert.equal(ledger.ledgerAuthorityResult, LEDGER_RESULT,
      'the ledger row states the replacement-allowance result verbatim');
    for (const quest of matrix.repairQuests) {
      assert.equal(LEDGER_AUTHORITY.test(quest.group), false,
        `no ledger-authority repair is proposed: ${quest.group}`);
    }
    // The architectural finding stands, and is structurally NOT a reason for
    // any row to require authority.
    const finding = matrix.findings
      .find((entry) => entry.id === SPREAD_RECOVERY_FINDING);
    assert.ok(finding, 'the spread-recovery two-owner finding is kept');
    assert.equal(finding.justification, SPREAD_RECOVERY_JUSTIFICATION,
      'and stands on its own justification');
    assert.ok(openGateFindings(matrix, GATE_ITEM_THREE)
      .includes(SPREAD_RECOVERY_FINDING),
    'and still blocks the item it blocked');
    for (const rowId of D3_ROW_IDS) {
      assert.notEqual(byId.get(rowId).enforcementDisposition,
        AUTHORITY_REQUIRED,
        `and no longer makes this row authority-required: ${rowId}`);
    }
    // The corrected matrix still satisfies the landed validator.
    assert.equal(runRealValidatorOn(matrix).green, true,
      'the corrected matrix passes the real validator unchanged');
    // ...and every cross-subject mutant is refused by it. Each one states a
    // DIFFERENT proposition, or proves one with the wrong shape of evidence.
    for (const mutant of crossSubjectMutants(matrix)) {
      const data = {matrix: structuredClone(matrix),
        store: structuredClone(store)};
      mutant.mutate(data);
      rederiveGate(data.matrix);
      const run = runRealValidatorOn(data.matrix, {receipts: data.store});
      assert.equal(run.green, false,
        `the validator refuses the cross-subject mutant: ${mutant.id}`);
    }
  });

test('gate item 3 selects the corrected rows and derives its own status', () => {
  const matrix = readMatrix();
  const entry = matrix.gate.find((item) => item.item === GATE_ITEM_THREE);
  const contract = gateContractFor(GATE_ITEM_THREE);
  const selected = selectGateRows(matrix, GATE_ITEM_THREE).map((row) => row.id);
  assert.deepEqual(selected, [MINTS_TODAY],
    'after the correction only the row that mints today requires authority');
  assert.deepEqual(entry.rows, selected,
    'the item\'s rows are the selection, never a list');
  // The selection minimum is a PIN of the selected set, so it moves only as
  // the recorded mechanical consequence of the correction.
  assert.equal(contract.minimumRowCount, selected.length,
    'the selection minimum is re-pinned to the corrected selected set');
  const correction = matrix.correctionToRound3;
  assert.ok(correction && typeof correction === 'object',
    'the matrix records the correction round 3 asked for');
  assert.deepEqual([...correction.rows].sort(), [...D3_ROW_IDS].sort(),
    'the note names the two rows it corrects');
  assert.equal(correction.gateItem, GATE_ITEM_THREE,
    'and the one gate item that follows from them');
  assert.equal(correction.selectionMinimumAfter, selected.length,
    'and states the pin it moved to');
  assert.deepEqual(correction.unreachableSubjectEnum,
    [GUARD_SUBJECT, AUTHORITY_SUBJECT],
    'and records the closed enum the subject is');
  assert.equal(correction.ledgerResult, LEDGER_RESULT,
    'and the ledger result it does not change');
  assert.ok(correction.decision.length > 0,
    'and cites the decision that authorized it');
  // Status stays a derivation, and the item stays blocked on the owner's
  // four decisions, which the correction does not touch.
  assert.equal(entry.status, deriveGateStatus(matrix, entry),
    'item 3\'s status follows from the contract');
  assert.equal(entry.status, BLOCKED,
    'and it is still blocked on the owner\'s decisions');
  assert.deepEqual(entry.whatIsMissing, unmetGateRequirements(matrix, entry),
    'and it lists exactly the requirements it fails');
});
