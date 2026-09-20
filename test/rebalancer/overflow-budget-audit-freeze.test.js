// The freeze, the approval it waits for, and the invariant it enforces
// (quest overflow-budget-audit-evidence-binding, receipt
// freeze-manifest-names-an-approving-verification-and-matches-the-frozen-bytes).
//
// The owner's direction ends with: freeze the corrected matrix, the gate
// document, the validated evidence bindings and the surviving findings - ON
// an independent approving verification. Nobody freezes by hand, so the
// manifest is written by one support function that refuses unless the
// approval is already in this quest's log with no later rejection, AND the
// prose-blind invariant holds.
//
// THE PROSE-BLIND INVARIANT, in the owner's words: a reader that sees only
// the structured matrix and the validated receipts, without reading
// explanatory prose, can determine exactly what proposition each disposition
// asserts and what evidence proves it. It is measured here by neutralising
// every declared free-text value and running the REAL validator and the REAL
// gate derivation over the projection.
//
// Until the approving verification is recorded this receipt is RED, and that
// is the honest state: the audit is not frozen because it is not approved.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  deriveGateStatus,
} from './overflow-budget-audit-render.js';
import {
  FREEZE_REFUSAL,
  FREEZE_TOKEN_PREFIX,
  FROZEN_FILES,
  FROZEN_SOURCES,
  FREEZE_MANIFEST_JSON,
  freezeDigest,
  QUEST_LOG,
  checkFreezeManifest,
  digestOfFile,
  proseBlindInvariantHolds,
  readMatrix,
  readReceiptStore,
  rederiveGate,
  runRealValidatorOn,
  writeFreezeManifest,
} from './overflow-budget-evidence-support.js';
import {
  DEPENDENCE_KIND,
  INDEPENDENCE_KIND,
  canonicalJson,
} from './overflow-budget-receipt-emission.js';
import {
  FREE_TEXT_FIELD_NAMES,
  PLACEHOLDER,
  ROW_FREE_TEXT,
  proseBlindProjection,
  structuralProposition,
} from './overflow-budget-prose-blind.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

const MANIFEST_SCHEMA = 'overflow-budget-audit-freeze/1';
const UTF8 = 'utf8';
const NEWLINE = '\n';
const FIXTURE_PREFIX = 'overflow-budget-freeze-';
const LOG_NAME = 'log.ndjson';
const MANIFEST_NAME = 'manifest.json';
const VERIFIER = 'subagent:fixture-verifier';
const OTHER_VERIFIER = 'subagent:never-recorded';
const APPROVED_AT = '2026-09-20T10:00:00.000Z';
const REJECTED_AT = '2026-09-20T11:00:00.000Z';
const INHERITED_ROW_COUNT = 27;
const GUARD_SUBJECT = 'guard-admission-state';
const AUTHORITY_SUBJECT = 'budget-dependent-authority-requirement';

function fixtureLog(directory, entries) {
  const file = path.join(directory, LOG_NAME);
  fs.writeFileSync(file,
    entries.map((entry) => JSON.stringify(entry)).join(NEWLINE) + NEWLINE);
  return file;
}

function verification(ts, verdict, verifier = VERIFIER, text = 'fixture') {
  return {ts, type: 'verification', text, verifier, verdict};
}

// The same digest the writer computes, over a supplied file map, so a
// fixture can name bytes that differ from the ones on disk.
function digestOfAlteredFiles(files) {
  return createHash('sha256')
    .update(canonicalJson(files)).digest('hex');
}

function approvalNamingTheseBytes(ts) {
  return verification(ts, 'approve', VERIFIER,
    `fixture ${FREEZE_TOKEN_PREFIX}${freezeDigest().digest}`);
}

test('the freeze writer refuses every path but an approval', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX));
  try {
    const outPath = path.join(directory, MANIFEST_NAME);
    // 1. no approving verification at all.
    assert.throws(() => writeFreezeManifest({
      logPath: fixtureLog(directory, [{ts: APPROVED_AT, type: 'finding',
        text: 'sealed'}]), outPath,
    }), new RegExp(FREEZE_REFUSAL.NO_APPROVAL.slice(0, 40).replace(
      /[.*+?^${}()|[\]\\]/gu, '\\$&')),
    'a freeze with no approving verification is refused');
    assert.equal(fs.existsSync(outPath), false,
      'and nothing is written');
    // 2. an approval, then a rejection.
    assert.throws(() => writeFreezeManifest({
      logPath: fixtureLog(directory, [verification(APPROVED_AT, 'approve'),
        verification(REJECTED_AT, 'reject')]), outPath,
    }), new RegExp(FREEZE_REFUSAL.REJECTED_AFTER.slice(0, 40).replace(
      /[.*+?^${}()|[\]\\]/gu, '\\$&')),
    'an approval a later verification withdrew is refused');
    assert.equal(fs.existsSync(outPath), false, 'and nothing is written');
    // 3. this quest's real log holds no approval yet, so the real writer
    // refuses too. That is why this receipt is red.
    assert.throws(() => writeFreezeManifest({outPath}),
      /freeze refused/u,
      'and the real log carries no approval at this head');
    // 3c. FILE ORDER, not `ts`, decides what came later: a rejection
    // appended after the approval withdraws it however its timestamp reads.
    for (const [name, rejection] of [
      ['an earlier timestamp', verification('2026-01-01T00:00:00.000Z',
        'reject')],
      ['no timestamp at all', {type: 'verification', text: 'fixture',
        verifier: VERIFIER, verdict: 'reject'}],
      ['the same timestamp', verification(APPROVED_AT, 'reject')],
    ]) {
      assert.throws(() => writeFreezeManifest({
        logPath: fixtureLog(directory,
          [approvalNamingTheseBytes(APPROVED_AT), rejection]),
        outPath,
      }), /freeze refused/u,
      `a rejection appended after the approval withdraws it, with ${name}`);
    }
    // 4. a manifest naming a verifier the log does not carry.
    // 3b. an approval that names bytes other than the ones on disk.
    assert.throws(() => writeFreezeManifest({
      logPath: fixtureLog(directory, [verification(APPROVED_AT, 'approve')]),
      outPath, gatesHold: true,
    }), /freeze refused/u,
    'an approval carrying no digest token cannot freeze anything');
    const logPath = fixtureLog(directory, [approvalNamingTheseBytes(APPROVED_AT)]);
    const files = {};
    for (const file of [...FROZEN_FILES, ...FROZEN_SOURCES]) {
      files[file] = digestOfFile(file);
    }
    const forged = {schema: MANIFEST_SCHEMA, quest: 'x',
      verification: {verifier: OTHER_VERIFIER, ts: APPROVED_AT}, files};
    assert.equal(checkFreezeManifest(forged, {logPath}).reason,
      FREEZE_REFUSAL.UNKNOWN_VERIFIER,
      'a manifest naming a verification the log does not hold is refused');
    // 5. bytes changed after the freeze.
    const genuine = {...forged,
      verification: {verifier: VERIFIER, ts: APPROVED_AT}};
    assert.equal(checkFreezeManifest(genuine, {logPath}).ok, true,
      'a manifest naming the recorded approval over the bytes that approval ' +
        'names holds');
    const altered = {...genuine,
      files: {...files, [FROZEN_FILES[0]]: 'not-the-digest-of-these-bytes'}};
    assert.equal(checkFreezeManifest(altered, {logPath}).reason,
      FREEZE_REFUSAL.TOKEN_MISMATCH,
      'a manifest edited after the approval no longer matches the digest ' +
        'that approval names');
    // ...and the same edit with the token recomputed to agree with it: the
    // manifest is now self-consistent and simply does not describe the
    // bytes on disk any more.
    const drifted = fixtureLog(directory, [verification(APPROVED_AT,
      'approve', VERIFIER,
      `fixture ${FREEZE_TOKEN_PREFIX}${digestOfAlteredFiles(altered.files)}`)]);
    assert.ok(checkFreezeManifest(altered, {logPath: drifted}).reason
      .startsWith(FREEZE_REFUSAL.BYTES_DIFFER),
    'and a frozen file whose bytes have since changed is refused');
    // 6. a manifest that freezes the wrong set.
    const narrowed = {...genuine, files: {[FROZEN_FILES[0]]: files[FROZEN_FILES[0]]}};
    assert.equal(checkFreezeManifest(narrowed, {logPath}).reason,
      FREEZE_REFUSAL.WRONG_FILES,
      'and a manifest that freezes less than the whole audit is refused');
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

// The owner's invariant. Everything below is derived from structure only.
test('the structured matrix and receipts determine every proposition without prose',
  () => {
    const matrix = readMatrix();
    const store = readReceiptStore();
    const projection = proseBlindProjection(matrix, store);
    // (i) the real validator - disposition, dependency and reachability
    // discipline included - passes on the projection.
    assert.equal(proseBlindInvariantHolds().holds, true,
      'the whole validator holds with every declared free-text value ' +
        'replaced by a placeholder');
    // (ii) every row's proposition is the SAME one, derived from the
    // projection alone, and no two structurally different rows collapse.
    assert.equal(matrix.rows.length, INHERITED_ROW_COUNT);
    const propositions = new Map();
    for (const row of matrix.rows) {
      const projected = projection.matrix.rows
        .find((entry) => entry.id === row.id);
      const fromFull = structuralProposition(row, store);
      const fromProjection =
        structuralProposition(projected, projection.store);
      assert.deepEqual(fromProjection, fromFull,
        `this row's proposition survives the loss of its prose: ${row.id}`);
      assert.ok(fromFull.disposition, `and names a disposition: ${row.id}`);
      if (fromFull.disposition === 'proved-unreachable') {
        assert.ok([GUARD_SUBJECT, AUTHORITY_SUBJECT]
          .includes(fromFull.unreachableSubject),
        `and which proposition it proves unreachable: ${row.id}`);
      }
      assert.ok(fromFull.receipts.length > 0,
        `and the receipts that prove it: ${row.id}`);
      for (const receipt of fromFull.receipts) {
        assert.equal(receipt.missing, undefined,
          `each of which resolves: ${row.id} / ${receipt.id}`);
      }
      propositions.set(row.id, JSON.stringify(fromFull));
    }
    // Rows that differ structurally are distinguishable in the projection.
    const byProposition = new Map();
    for (const [rowId, proposition] of propositions) {
      byProposition.set(proposition,
        [...(byProposition.get(proposition) || []), rowId]);
    }
    for (const [proposition, rowIds] of byProposition) {
      const subjects = new Set(rowIds.map((rowId) =>
        matrix.rows.find((row) => row.id === rowId).unreachableSubject));
      assert.equal(subjects.size, 1,
        'rows sharing a structural proposition share its subject: ' +
          `${rowIds.join(', ')} / ${proposition.slice(0, 40)}`);
    }
    // (iii) neutralising prose changes no gate status; changing a structural
    // field that matters does.
    const projectedGate = rederiveGate(structuredClone(projection.matrix));
    for (const entry of matrix.gate) {
      const after = projectedGate.gate.find((item) => item.item === entry.item);
      assert.equal(after.status, deriveGateStatus(matrix, entry),
        `the gate derivation ignores prose: item ${entry.item}`);
    }
    const structural = structuredClone(matrix);
    structural.rows.find((row) =>
      row.unreachableSubject === AUTHORITY_SUBJECT).unreachableSubject =
        GUARD_SUBJECT;
    assert.equal(runRealValidatorOn(structural, {receipts: store}).green,
      false, 'while a structural field that matters is refused when changed');
    // The declared list is what a verifier attacks, so it is asserted to be
    // non-empty, to be exactly what the projection neutralises, and to leave
    // the sentinel fields alone.
    assert.ok(FREE_TEXT_FIELD_NAMES.length > 0,
      'the free-text field names are declared');
    assert.equal(FREE_TEXT_FIELD_NAMES.includes('text'), true,
      'including the narrative fields');
    assert.equal(ROW_FREE_TEXT.includes('formationEvidence'), false,
      'and NOT the formation sentinel the discipline compares for identity');
    const handoff = projection.matrix.rows
      .find((row) => row.unreachableSubject === AUTHORITY_SUBJECT);
    assert.equal(handoff.domainQualification.statement, PLACEHOLDER,
      'the qualification prose really was neutralised');
    assert.equal(handoff.domainQualification.unreachable, AUTHORITY_SUBJECT,
      'while what it asserts is structural and survived');
  });

test('the freeze manifest names an approving verification and matches the frozen bytes',
  () => {
    // The invariant the writer enforces is measured FIRST, so this receipt
    // reports a prose-bound audit rather than only a missing manifest.
    assert.equal(proseBlindInvariantHolds().holds, true,
      'the structured matrix and receipts determine every proposition ' +
        'without prose');
    assert.ok(fs.existsSync(FREEZE_MANIFEST_JSON),
      `the audit is frozen behind a manifest: ${FREEZE_MANIFEST_JSON}`);
    const manifest =
      JSON.parse(fs.readFileSync(FREEZE_MANIFEST_JSON, UTF8));
    const checked = checkFreezeManifest(manifest, {logPath: QUEST_LOG});
    assert.equal(checked.ok, true,
      `the freeze holds against the log and the bytes: ${checked.reason}`);
    assert.equal(manifest.schema, MANIFEST_SCHEMA,
      'the manifest names its schema');
    assert.deepEqual(Object.keys(manifest.files).sort(),
      [...FROZEN_FILES, ...FROZEN_SOURCES].sort(),
      'and freezes the documents, the evidence bindings and the sources ' +
        'that produce and check them');
  });

// The presence-dependence measurement, and its classification. Neutralising
// a free-text VALUE changes nothing (the test above proves that). DELETING a
// field is different, and the inherited schema notices nine of them. All nine
// are now DOCUMENTATION obligations - the row must carry the field - because
// in every case a structural value already carries the proposition: the
// disposition, the dependency value, the reachability values and the bound
// receipt of the kind that value requires. The last of them,
// `censusMovementCondition`, used to carry the proposition itself; it no
// longer does, because `depends_only_when_census_moved` now has its own
// receipt kind whose result carries both halves it claims. This test pins
// that: the validator's binding path never reads the field.
const CENSUS_FIELD = 'censusMovementCondition';
const DOCUMENTED_PRESENCE = Object.freeze(['path', 'triggeringState',
  'currentGuardReason', 'semanticOwnerReason', 'mintingEvidenceAvailable',
  'validationEvidenceAvailable', 'stillUnclassifiedBecause',
  'requirementToClassify', 'dependencyUnknownBecause', CENSUS_FIELD]);
const BINDING_REFUSAL = 'the row states the dependency its receipt measured';
const CENSUS_DOCUMENTATION_REFUSAL =
  'a census-conditional row states the movement condition';

test('the fields whose presence still carries meaning are measured, not hidden',
  () => {
    const matrix = readMatrix();
    const store = readReceiptStore();
    const measured = [];
    for (const name of ROW_FREE_TEXT) {
      const stripped = structuredClone(matrix);
      let touched = false;
      for (const row of stripped.rows) {
        if (row[name] !== undefined && row[name] !== null) {
          delete row[name];
          touched = true;
        }
      }
      if (!touched) {
        continue;
      }
      const run = runRealValidatorOn(stripped, {receipts: store});
      if (!run.green) {
        measured.push({name, output: run.output});
      }
    }
    assert.deepEqual(measured.map((entry) => entry.name),
      [...DOCUMENTED_PRESENCE],
      'these free-text fields must be PRESENT for the inherited schema');
    // Not one of them is a PROPOSITION: no absence makes a row\'s stated
    // dependency stop being the one its receipt measured.
    for (const entry of measured) {
      assert.equal(entry.output.includes(BINDING_REFUSAL), false,
        'this field\'s absence is a documentation failure, not a lost ' +
          `proposition: ${entry.name}`);
    }
    // ...and the census refinement in particular. Its absence is now
    // refused by the inherited DOCUMENTATION rule ("states the movement
    // condition"), not by the binding: the value rests on its own receipt
    // kind, whose result carries both halves it claims.
    const census = measured.find((entry) => entry.name === CENSUS_FIELD);
    assert.ok(census.output.includes(CENSUS_DOCUMENTATION_REFUSAL),
      'the census-movement condition is a documentation obligation: ' +
        CENSUS_DOCUMENTATION_REFUSAL);
    const censusRows = matrix.rows.filter((row) =>
      row.currentBudgetDependency === 'depends_only_when_census_moved');
    assert.ok(censusRows.length > 0, 'and the rows carrying it are still here');
    for (const row of censusRows) {
      const cited = row.receipts
        .map((id) => store.receipts.find((entry) => entry.id === id));
      const moved = cited.filter((entry) => entry.kind === DEPENDENCE_KIND &&
        entry.sliceId === 'census-moved');
      const atTarget = cited.filter((entry) =>
        entry.kind === INDEPENDENCE_KIND &&
        entry.sliceId === 'producer-add-at-target');
      assert.ok(moved.length > 0 && atTarget.length > 0,
        `each cites both halves its value claims: ${row.id}`);
      assert.ok(moved.every((entry) => entry.result.admissionDifferences > 0),
        `the budget is decisive where the census has moved: ${row.id}`);
      assert.ok(
        atTarget.every((entry) => entry.result.admissionDifferences === 0),
        `and decisive nowhere in the states the ADD producer creates: ${row.id}`);
    }
  });
