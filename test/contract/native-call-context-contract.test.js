/**
 * Contract guard for the sealed native call-context WIT contract.
 *
 * The native-call-context-wit-contract epic
 * (solve/epics/native-call-context-wit-contract.md) seals four decisions
 * that this suite pins against the final text/code state:
 *
 *   1. `lagrange:cell/call-context` is the sole public call/pushdown
 *      invocation surface (architecture/minimal-deployment-surface.md), and
 *      the fixture world still declares `package lagrange:cell` +
 *      `interface call-context`.
 *   2. The call/pushdown Binding source gains an optional declared
 *      partition-local `statement` — in the surface doc's source table and
 *      in SOURCE_OPTIONAL_FIELDS of deployment-binding-contract.js.
 *      SOURCE_OPTIONAL_FIELDS is not exported, so this suite reads the
 *      module source text (the same guard style as
 *      test/service/minimal-deployment-*-guard.test.js).
 *   3. The u32 capability probe is dropped from the WIT world; the typed
 *      `deny-code` refusal stays.
 *   4. The batch memory bound is a Binding-declared budget, and the epic's
 *      decision log records all four decisions as dated entries.
 *
 * If this test fails because one of the sealed decisions was legitimately
 * revised, that is an epic-level decision: update the epic's decision log
 * AND this guard in the same change.
 */

import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';

// Repo-root-relative paths (the fail-closed runner executes from the root).
const GUARDED_FILES = Object.freeze({
  surfaceDoc: 'architecture/minimal-deployment-surface.md',
  epic: 'solve/epics/native-call-context-wit-contract.md',
  worldWit: 'test/wasm-service/fixtures/call-cell-world/wit/world.wit',
  bindingContract: 'src/control-plane/owners/deployment-binding-contract.js',
});

const WIT_PACKAGE_NAME = 'lagrange:cell/call-context';
const WIT_PACKAGE_DECLARATION = 'package lagrange:cell';
const WIT_INTERFACE_DECLARATION = 'interface call-context';
const WIT_DROPPED_PROBE = 'capability:';
const WIT_TYPED_REFUSAL = 'deny-code';

const CALL_SOURCE_ROW_PREFIX = '| `call` |';
const PUSHDOWN_SOURCE_ROW_PREFIX = '| `pushdown` |';
const STATEMENT_FIELD = 'statement';
const BUDGETS_PARAGRAPH_MARKER = 'Budgets';
const BATCH_BOUND_TOKEN = 'batch';

const DECISION_LOG_HEADING = 'Decision log';
const DATED_ENTRY_PATTERN = /^- \d{4}-\d{2}-\d{2}\b/u;
const SEALED_DECISION_TOKENS = Object.freeze([
  'pushdown', 'reduce', 'capability', 'batch',
]);

const EXPECTED_CALL_PUSHDOWN_OPTIONAL_FIELDS = Object.freeze(['statement']);

// Half-width of the context window checked around a distinctive substring:
// large enough to cover one sentence pair, small enough to stay local.
const PROXIMITY_RADIUS = 240;

function readGuarded(path) {
  assert.ok(existsSync(path), `guarded file is missing: ${path}`);
  return readFileSync(path, 'utf8');
}

function windowAround(text, marker) {
  const index = text.indexOf(marker);
  assert.ok(index >= 0, `expected marker not found: ${marker}`);
  return text.slice(
    Math.max(0, index - PROXIMITY_RADIUS),
    index + marker.length + PROXIMITY_RADIUS,
  );
}

function sourceTableRow(doc, rowPrefix) {
  const row = doc.split('\n').find((line) => line.startsWith(rowPrefix));
  assert.ok(row, `Binding source table row not found: ${rowPrefix}`);
  return row;
}

// SOURCE_OPTIONAL_FIELDS is module-private (not in the export list of
// deployment-binding-contract.js), so the guard parses the frozen entry
// straight from the module source instead of importing the contract.
function optionalFieldsEntry(contractSource, kindToken) {
  const marker = 'SOURCE_OPTIONAL_FIELDS';
  const section = contractSource.slice(contractSource.indexOf(marker));
  const pattern = new RegExp(
    `DEPLOYMENT_BINDING_SOURCE_KIND\\.${kindToken}\\]:\\s*` +
    'Object\\.freeze\\(\\[([^\\]]*)\\]\\)',
    'u',
  );
  const match = pattern.exec(section);
  assert.ok(match, `SOURCE_OPTIONAL_FIELDS entry not found for ${kindToken}`);
  return match[1].split(',')
    .map((token) => token.trim().replaceAll('\'', ''))
    .filter((token) => token.length > 0);
}

test('surface doc names lagrange:cell/call-context as the sole public ' +
  'call/pushdown invocation surface and the fixture world declares it',
async () => {
  const doc = readGuarded(GUARDED_FILES.surfaceDoc);
  const surfaceWindow = windowAround(doc, WIT_PACKAGE_NAME);
  assert.ok(
    surfaceWindow.includes('call'),
    'call-context naming must sit in the call invocation context',
  );
  assert.ok(
    surfaceWindow.includes('pushdown'),
    'call-context must be named as the pushdown invocation surface too',
  );

  const wit = readGuarded(GUARDED_FILES.worldWit);
  assert.ok(
    wit.includes(WIT_PACKAGE_DECLARATION),
    'fixture world no longer declares `package lagrange:cell`',
  );
  assert.ok(
    wit.includes(WIT_INTERFACE_DECLARATION),
    'fixture world no longer declares `interface call-context`',
  );
});

test('call and pushdown Binding sources declare the partition-local ' +
  'statement in the surface doc source table', async () => {
  const doc = readGuarded(GUARDED_FILES.surfaceDoc);
  for (const rowPrefix of [CALL_SOURCE_ROW_PREFIX, PUSHDOWN_SOURCE_ROW_PREFIX]) {
    const row = sourceTableRow(doc, rowPrefix);
    assert.ok(
      row.includes(STATEMENT_FIELD),
      `source table row ${rowPrefix} must list the declared statement ` +
        'field; see solve/epics/native-call-context-wit-contract.md',
    );
  }
});

test('SOURCE_OPTIONAL_FIELDS for CALL and PUSHDOWN admit the statement ' +
  'field', async () => {
  const contractSource = readGuarded(GUARDED_FILES.bindingContract);
  for (const kindToken of ['CALL', 'PUSHDOWN']) {
    assert.deepStrictEqual(
      optionalFieldsEntry(contractSource, kindToken),
      [...EXPECTED_CALL_PUSHDOWN_OPTIONAL_FIELDS],
      `SOURCE_OPTIONAL_FIELDS[${kindToken}] must be ['statement']; the ` +
        'optional declared partition-local statement is part of the sealed ' +
        'Binding source contract',
    );
  }
});

test('the u32 capability probe is dropped and the typed deny-code ' +
  'refusal stays in the fixture world', async () => {
  const wit = readGuarded(GUARDED_FILES.worldWit);
  assert.ok(
    !wit.includes(WIT_DROPPED_PROBE),
    'the u32 capability probe must be dropped from call-context; ' +
      'capability admission is Binding-derived, not guest-probed',
  );
  assert.ok(
    wit.includes(WIT_TYPED_REFUSAL),
    'the typed deny-code refusal enum must remain in call-context',
  );
});

test('surface doc budgets cover the Binding-declared batch bound',
  async () => {
    const doc = readGuarded(GUARDED_FILES.surfaceDoc);
    const budgetsWindow = windowAround(doc, BUDGETS_PARAGRAPH_MARKER);
    assert.ok(
      budgetsWindow.includes(BATCH_BOUND_TOKEN),
      'the Binding budgets contract must declare the batch memory bound ' +
      'with its typed budget-exhausted refusal',
    );
  });

test('the epic decision log records all four sealed decisions as dated ' +
  'entries', async () => {
  const epic = readGuarded(GUARDED_FILES.epic);
  const logIndex = epic.indexOf(DECISION_LOG_HEADING);
  assert.ok(logIndex >= 0, 'epic must keep its Decision log section');
  const datedEntries = epic.slice(logIndex).split('\n')
    .filter((line) => DATED_ENTRY_PATTERN.test(line))
    .map((line) => line.toLowerCase());
  assert.ok(datedEntries.length > 0, 'Decision log has no dated entries');
  for (const token of SEALED_DECISION_TOKENS) {
    assert.ok(
      datedEntries.some((entry) => entry.includes(token)),
      `Decision log lacks a dated entry recording the sealed ${token} ` +
        'decision; see solve/epics/native-call-context-wit-contract.md',
    );
  }
});
