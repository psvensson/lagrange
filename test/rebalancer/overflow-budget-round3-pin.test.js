// The inherited content, pinned, and the read-only promise, measured (quest
// overflow-budget-audit-evidence-binding, receipts
// inherited-round-3-content-unchanged-except-d3 and
// no-production-file-changed).
//
// Round 3 upheld 25 of 27 rows as written, all nine gate statuses and three
// architectural results. The successor does not re-audit any of it. What it
// DOES change is the form of three things - how a receipt is cited, how a
// finding is resolved, how a required external artifact is observed - and one
// content value, the two hand-off rows' disposition.
//
// So the pin is taken over the ROUND-3 artifacts, and the authorized change
// is DECLARED rather than excluded: the two corrected rows are digested with
// their round-3 disposition substituted back, so they stay pinned on
// everything else they say. What genuinely has no round-3 value - a new field
// - is excluded and carries its reason; what was REMOVED is pinned by value
// instead, and the test asserts the derivation reproduces it: every finding's
// round-3 open flag, every gate item's round-3 status, rows, missing
// requirements and open findings, and the round-3 satisfaction of every
// required external artifact. A verifier reads the exclusion list rather than
// inferring it from a diff, and no reason may be recorded for a field that is
// in fact pinned.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  deriveGateStatus,
  findingDerivedOpen,
  gateContractFor,
  openGateFindings,
  renderRowSelection,
  selectGateRows,
  unmetGateRequirements,
} from './overflow-budget-audit-render.js';
import {
  observeExternalArtifact,
} from './overflow-budget-audit-observation.js';
import {
  D3_ROW_IDS,
  PRODUCTION_TREES,
  ROUND3_PIN_JSON,
  changedRepositoryPaths,
  digestOfFile,
  readMatrix,
  round3PinDigests,
} from './overflow-budget-evidence-support.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

const PIN_SCHEMA = 'overflow-budget-round3-pin/1';
const UTF8 = 'utf8';
const INHERITED_ROW_COUNT = 27;
const EXCLUSION_GROUPS = Object.freeze(
  ['rows', 'gate', 'gateArtifacts', 'findings', 'sections']);
const DERIVED_GATE_FIELDS = Object.freeze(
  ['status', 'rows', 'whatIsMissing', 'openFindings', 'rowSelection']);
const GATE_ITEM_THREE = '3';
const GUARD_SUBJECT = 'guard-admission-state';
const AUTHORITY_SUBJECT = 'budget-dependent-authority-requirement';
// Every row gains the receipt binding; the nine proved rows gain the subject;
// the two corrected rows gain the qualification; the ledger row gains the
// owner's replacement-allowance sentence. Nothing else is added anywhere, and
// this is the list a verifier attacks.
const ADDED_FIELDS_BY_ROW = Object.freeze({
  every: Object.freeze(['receipts']),
  proved: Object.freeze(['unreachableSubject']),
  corrected: Object.freeze(['domainQualification']),
  ledger: Object.freeze(['ledgerAuthorityResult']),
});

function readPin() {
  assert.ok(fs.existsSync(ROUND3_PIN_JSON),
    `the round-3 content of everything inherited is pinned: ${ROUND3_PIN_JSON}`);
  const pin = JSON.parse(fs.readFileSync(ROUND3_PIN_JSON, UTF8));
  assert.equal(pin.schema, PIN_SCHEMA, 'the pin names its schema');
  assert.ok(typeof pin.inheritedFromHead === 'string' &&
    pin.inheritedFromHead.length > 0,
  'and the head whose content it pins');
  return pin;
}

function assertExclusionsAreDeclared(pin) {
  const exclusions = pin.exclusions;
  assert.ok(exclusions && typeof exclusions === 'object',
    'the pin declares which fields it does NOT digest');
  for (const group of EXCLUSION_GROUPS) {
    assert.ok(Array.isArray(exclusions[group]),
      `the exclusion list names the group: ${group}`);
  }
  const reasons = pin.exclusionReasons;
  assert.ok(reasons && typeof reasons === 'object',
    'and says why each excluded field is excluded');
  const excluded = new Set(EXCLUSION_GROUPS
    .flatMap((group) => exclusions[group]));
  for (const field of excluded) {
    assert.ok(typeof reasons[field] === 'string' && reasons[field].length > 0,
      `every excluded field carries its reason: ${field}`);
  }
  for (const field of Object.keys(reasons)) {
    assert.ok(excluded.has(field),
      `and no reason is recorded for a field that IS pinned: ${field}`);
  }
}

// The owner's rule for the seven inherited proved rows: ONE field added, and
// it states the proposition they already proved. Checked as a set difference
// against the pin's own exclusion list, so an extra field cannot ride along.
function assertOnlyDeclaredFieldsWereAdded(matrix, pin) {
  const declared = pin.guardAdmissionStateSubjectAdded;
  assert.equal(declared.field, ADDED_FIELDS_BY_ROW.proved[0],
    'the pin declares which field the inherited proved rows gained');
  const guardRows = matrix.rows
    .filter((row) => row.unreachableSubject === GUARD_SUBJECT)
    .map((row) => row.id).sort();
  assert.deepEqual(guardRows, [...declared.rows].sort(),
    'and exactly those rows carry it');
  const excluded = new Set(pin.exclusions.rows);
  for (const row of matrix.rows) {
    const present = Object.keys(row).filter((key) => excluded.has(key)).sort();
    const expected = [...ADDED_FIELDS_BY_ROW.every];
    if (row.unreachableSubject !== undefined) {
      expected.push(...ADDED_FIELDS_BY_ROW.proved);
    }
    if (row.unreachableSubject === AUTHORITY_SUBJECT) {
      expected.push(...ADDED_FIELDS_BY_ROW.corrected);
    }
    if (row.id === pin.ledgerAuthorityResult.row) {
      expected.push(...ADDED_FIELDS_BY_ROW.ledger);
    }
    assert.deepEqual(present, expected.sort(),
      `this row gained exactly the declared fields and no others: ${row.id}`);
  }
  const ledgerRow = matrix.rows
    .find((row) => row.id === pin.ledgerAuthorityResult.row);
  assert.equal(ledgerRow.ledgerAuthorityResult, pin.ledgerAuthorityResult.text,
    'the ledger row carries the owner\'s replacement-allowance result verbatim');
}

// The authorized change, undone for the purpose of the digest: the two rows
// are pinned on everything they say EXCEPT the one value the lead ruled on.
function withRoundThreeDispositions(matrix, pin) {
  const restored = structuredClone(matrix);
  for (const rowId of D3_ROW_IDS) {
    const declared = pin.d3[rowId];
    assert.ok(declared, `the corrected row's change is declared: ${rowId}`);
    const row = restored.rows.find((entry) => entry.id === rowId);
    assert.equal(row.enforcementDisposition, declared.correctedDisposition,
      `the corrected row carries the authorized disposition: ${rowId}`);
    row.enforcementDisposition = declared.roundThreeDisposition;
  }
  return restored;
}

function assertFindingsDeriveTheirRoundThreeState(matrix, pin) {
  assert.deepEqual(matrix.findings.map((finding) => finding.id).sort(),
    Object.keys(pin.roundThreeFindingOpen).sort(),
    'every round-3 finding is still here, and no finding was added');
  for (const finding of matrix.findings) {
    assert.equal(findingDerivedOpen(matrix, finding.id),
      pin.roundThreeFindingOpen[finding.id],
      'the DERIVED open state reproduces the round-3 flag that was ' +
        `removed: ${finding.id}`);
  }
}

function assertGateDerivesItsRoundThreeValues(matrix, pin) {
  for (const entry of matrix.gate) {
    const pinned = pin.roundThreeGate[String(entry.item)];
    assert.ok(pinned, `gate item ${entry.item} is pinned`);
    const derived = {
      status: deriveGateStatus(matrix, entry),
      rows: selectGateRows(matrix, entry.item).map((row) => row.id),
      whatIsMissing: unmetGateRequirements(matrix, entry),
      openFindings: openGateFindings(matrix, entry.item),
      rowSelection: renderRowSelection(entry.item),
    };
    const declared = pin.declaredGateDifferences[String(entry.item)];
    const differences = new Map((declared ? declared.differences : [])
      .map((entry2) => [entry2.field, entry2]));
    for (const fieldName of DERIVED_GATE_FIELDS) {
      const expected = differences.has(fieldName) ?
        differences.get(fieldName).corrected :
        pinned[fieldName];
      assert.deepEqual(derived[fieldName], expected,
        `gate item ${entry.item} derives its round-3 ${fieldName}`);
    }
  }
  // The one declared difference, and what makes it mechanical.
  const declared = pin.declaredGateDifferences[GATE_ITEM_THREE];
  assert.ok(declared, 'item 3 is the single declared gate difference');
  assert.equal(Object.keys(pin.declaredGateDifferences).length, 1,
    'and it is the only one');
  assert.equal(gateContractFor(Number(GATE_ITEM_THREE)).minimumRowCount,
    declared.selectionMinimumAfter,
    'the selection minimum moved with the selected set');
  const rowsDifference = declared.differences
    .find((entry) => entry.field === 'rows');
  assert.equal(rowsDifference.corrected.length, declared.selectionMinimumAfter,
    'and is the size of that set');
}

function assertExternalArtifactsDeriveRoundThree(matrix, pin) {
  for (const entry of matrix.gate) {
    for (const artifact of entry.requiredExternalArtifacts || []) {
      assert.equal(observeExternalArtifact(artifact).satisfied,
        pin.roundThreeExternalArtifactSatisfied[artifact.id],
        'the OBSERVED satisfaction reproduces the round-3 flag that was ' +
          `removed: ${artifact.id}`);
    }
  }
}

test('every inherited round-3 value is pinned and unchanged except the D3 correction',
  () => {
    const pin = readPin();
    assertExclusionsAreDeclared(pin);
    const matrix = readMatrix();
    assert.equal(matrix.rows.length, INHERITED_ROW_COUNT,
      'the inherited rows are neither added to nor dropped');
    assertOnlyDeclaredFieldsWereAdded(matrix, pin);
    const measured =
      round3PinDigests(withRoundThreeDispositions(matrix, pin), pin.exclusions);
    assert.deepEqual(Object.keys(measured.rows).sort(),
      Object.keys(pin.rows).sort(),
      'every row in the matrix is pinned, and every pinned row is in it');
    for (const [rowId, expected] of Object.entries(pin.rows)) {
      assert.equal(measured.rows[rowId], expected,
        `the inherited content of this row is unchanged: ${rowId}`);
    }
    assert.deepEqual(Object.keys(measured.sections).sort(),
      Object.keys(pin.sections).sort(),
      'every other section of the matrix is pinned');
    for (const [section, expected] of Object.entries(pin.sections)) {
      assert.equal(measured.sections[section], expected,
        `the inherited content of this section is unchanged: ${section}`);
    }
    // What was REMOVED is pinned by value and re-derived, not excluded.
    assertFindingsDeriveTheirRoundThreeState(matrix, pin);
    assertGateDerivesItsRoundThreeValues(matrix, pin);
    assertExternalArtifactsDeriveRoundThree(matrix, pin);
    // The artifacts the successor does not touch at all are pinned by bytes.
    for (const [file, expected] of Object.entries(pin.files)) {
      assert.equal(digestOfFile(file), expected,
        `this inherited artifact is byte-identical: ${file}`);
    }
  });

test('no production file changed in this quest\'s worktree', () => {
  const changed = changedRepositoryPaths();
  const offending = changed.filter((file) =>
    PRODUCTION_TREES.some((tree) => file.startsWith(tree)));
  assert.deepEqual(offending, [],
    'the audit and its successor are read-only over production: ' +
      `${offending.join(', ')}`);
});
