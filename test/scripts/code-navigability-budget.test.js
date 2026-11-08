// Contract for the code-navigability-and-mistake-resistance acceptance budget.
//
// scripts/checks/code-navigability-budget.js is the epic's `doneWhen`, and
// every other quest of the epic probes a subset of its rows with --rows. Two
// things can go wrong with it.
//
// It can stop measuring: a row that returned a constant or crashed into a
// caught default still prints a number. So every row is measured here
// against two FIXTURE TREES this test builds, one that meets every row and
// one that offends every row, and each row's value is asserted exactly in
// both. The offending tree exceeds every cap, so a cap row that read nothing
// cannot agree with it.
//
// The budget can move: a cap that drifts up to meet the tree proves nothing,
// so the sealed table is restated here by row name and number. This test
// failing because a number changed is the intended behaviour: change it in the
// epic, the script and here together, or not at all.

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  measureNavigabilityBudget,
  measureNavigabilityBudgetWithFailures,
  selectedRows,
  unrecognisedArgument,
} from '../../scripts/checks/code-navigability-budget.js';

const UTF8 = 'utf8';
const REPO_ROOT = process.cwd();
const SCRIPT = 'scripts/checks/code-navigability-budget.js';
const CENSUS_FILE = 'data/fallback-census/census.json';
const CLASSIFICATION_FILE = 'scripts/checks/code-navigability-fallback-classification.json';
const CENSUS_SCHEMA = 'fallback-census/1';
const FAILURE_BUNDLE_FILE = 'test/distributed/harness/failure-bundle-artifact-foundation.js';

const CAP = 'cap';
const ZERO = 'zero';
const CENSUS = 'census';

// The sealed budget table, restated independently of the script, in the
// epic's order: the row name, its kind, its budget, and the value each
// fixture must produce. A cap row is met at or below its budget; a zero row
// and a census row are met only at 0, and a census row whose input is absent
// is null and outstanding.
//
//                                                  kind, budget, met, offending
const SEALED_TABLE = Object.freeze([
  ['navigability_patterns_without_ratchet', ZERO, 0, 0, 12],
  ['owner_port_feature_detection', CAP, 2130, 1, 2131],
  ['owner_port_feature_detection_pilot_owners', ZERO, 0, 0, 2],
  ['identity_keyed_module_state', CAP, 87, 1, 88],
  ['identity_keyed_module_state_admission_path', ZERO, 0, 0, 2],
  ['prototype_copy_bags', CAP, 59, 1, 60],
  ['prototype_copy_bags_partition_service', ZERO, 0, 0, 1],
  ['inheritance_depth_over_two', CAP, 65, 1, 66],
  ['inheritance_depth_over_two_readiness', ZERO, 0, 0, 2],
  ['row_field_alias_reads', CAP, 745, 1, 746],
  ['formation_system_tables_without_decoder', ZERO, 0, 0, 3],
  ['state_read_defaults', ZERO, 0, 0, 1],
  ['value_or_promise_then_checks', ZERO, 0, 0, 1],
  ['source_directories_over_cap', ZERO, 0, 0, 1],
  ['stale_owner_indexes', ZERO, 0, 0, 9],
  ['failure_bundle_log_windows_without_coverage', ZERO, 0, 0, 1],
  ['two_source_fallback_reads', CAP, 1789, 1, 1790],
  ['typeof_dual_paths', CAP, 627, 1, 628],
  ['catch_returns_default', CAP, 387, 1, 388],
  ['reexport_only_modules', CAP, 35, 1, 36],
  ['alias_exports', ZERO, 0, 0, 1],
  ['legacy_term_identifiers', CAP, 2924, 1, 2925],
  // 1790 + 628 + 388 fallback sites, five of them censused.
  ['fallback_sites_uncensused', CENSUS, 0, 0, 2801],
  ['fallback_branches_never_taken', CENSUS, 0, 0, 1],
  ['fallback_branches_only_fallback_taken', CENSUS, 0, 0, 1],
  ['fallback_sites_unclassified', CENSUS, 0, 0, 1],
]);

const AUDITED_PATTERNS = Object.freeze([
  'owner_port_feature_detection', 'identity_keyed_module_state',
  'prototype_copy_bags', 'inheritance_depth_over_two', 'row_field_alias_reads',
  'state_read_defaults', 'value_or_promise_then_checks',
  'two_source_fallback_reads', 'typeof_dual_paths', 'catch_returns_default',
  'alias_exports', 'legacy_term_identifiers',
]);

const DECODERS = Object.freeze({
  'services': 'decodeServicesRow',
  'nodes': 'decodeNodesRow',
  'replica-operations': 'decodeReplicaOperationsRow',
});

// The ESLint runner the fixtures use: no rule promotes anything, and ESLint
// is never spawned against a fixture tree.
function noPromotion() {
  return {status: 0, stdout: JSON.stringify({rules: {}})};
}

function measure(root, eslintRunner = noPromotion) {
  return measureNavigabilityBudget(root, {eslintRunner});
}

function baselineFile(pattern) {
  return `scripts/check-guideline-navigability-baseline-${pattern}.json`;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function write(root, relative, text) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text, UTF8);
}

function writeJson(root, relative, value) {
  write(root, relative, `${JSON.stringify(value, null, 2)}\n`);
}

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'navigability-budget-'));
}

function repeated(count, line) {
  return Array.from({length: count}, (_, index) => line(index)).join('\n');
}

function arrayModule(name, params, count, element) {
  return `export function ${name}(${params}) {\n  return [\n` +
    `${repeated(count, () => `    ${element},`)}\n  ];\n}\n`;
}

// The census record of the nth occurrence of `slice` in `file`, whose text
// is `text`: the hash is the detector's site identity, sha256(file\nslice).
function censusSite(file, text, slice, occurrence, row, siteClass) {
  let start = -1;
  for (let seen = 0; seen <= occurrence; seen += 1) {
    start = text.indexOf(slice, start + 1);
    assert.ok(start >= 0, `fixture ${file} must contain ${slice} ${occurrence + 1} times`);
  }
  return {
    file, row, range: [start, start + slice.length],
    hash: sha256(`${file}\n${slice}`), occurrence, class: siteClass,
    sidesExecuted: {primary: siteClass !== 'never' && siteClass !== 'fallback-only',
      fallback: siteClass === 'fallback-only' || siteClass === 'both'},
    runs: ['corpus-1'],
  };
}

function census(sites) {
  return {
    schema: CENSUS_SCHEMA, generatedAt: '2026-11-08T00:00:00.000Z',
    head: '0'.repeat(40),
    runs: [{id: 'corpus-1', lane: 'corpus', host: 'fixture', commit: '0'.repeat(40),
      startedAt: '2026-11-08T00:00:00.000Z', coverageDigest: '0'.repeat(64)}],
    sites,
  };
}

function classification(row, file, slice, occurrence) {
  return {version: 1, entries: [{
    row, file, hash: sha256(`${file}\n${slice}`), occurrence,
    classification: 'documented-default', reason: 'fixture',
    classifiedBy: 'fixture', verifiedBy: 'fixture', at: '2026-11-08T00:00:00.000Z',
  }]};
}

// A tree in which every row is met. Each cap row is measured at 1 so that a
// row reading nothing (0) is distinguishable; every zero row is 0; the three
// fallback sites are all censused, the `both` one classified.
const MET_FALLBACKS = 'src/fallbacks.js';
const MET_TWO_SOURCE = 'a.x || b.y';
const MET_DUAL_PATH = 'typeof f === \'function\' ? 1 : 0';
const MET_CATCH = 'catch { return null; }';

function metFixture() {
  const root = makeRoot();
  for (const pattern of AUDITED_PATTERNS) {
    writeJson(root, baselineFile(pattern), {version: 1, violations: []});
  }
  write(root, 'src/INDEX.md', '# src\n');
  write(root, 'src/ports.js',
    'export function hasRead(o) {\n  return typeof o.read === \'function\';\n}\n');
  write(root, 'src/state.js',
    'const seen = new WeakMap();\nexport function mark(k) {\n  seen.set(k, true);\n}\n');
  write(root, 'src/bags.js', 'export const names = Object.getOwnPropertyNames(Owner.prototype);\n');
  write(root, 'src/classes.js', 'class M0 {}\nclass M1 extends M0 {}\n' +
    'class M2 extends M1 {}\nexport class M3 extends M2 {}\n');
  write(root, 'src/aliases.js',
    'export function nodeIdOf(row) {\n  return row.node_id || row.nodeId;\n}\n');
  write(root, 'src/barrel.js', 'export * from \'./ports.js\';\n');
  write(root, 'src/legacy.js', 'export const legacyMode = 1;\n');
  write(root, 'src/catalog/INDEX.md', '# catalog\n');
  for (const table of ['services', 'nodes', 'replica-operations']) {
    write(root, `src/catalog/${table}-row-decoder.js`,
      `export function ${DECODERS[table]}(row) {\n  return row;\n}\n`);
  }
  const fallbacks = `export function m(a, b, f) {\n  const v = ${MET_TWO_SOURCE};\n` +
    `  const w = ${MET_DUAL_PATH};\n  try { f(); } ${MET_CATCH}\n  return [v, w];\n}\n`;
  write(root, MET_FALLBACKS, fallbacks);
  writeJson(root, CENSUS_FILE, census([
    censusSite(MET_FALLBACKS, fallbacks, MET_TWO_SOURCE, 0,
      'two_source_fallback_reads', 'primary-only'),
    censusSite(MET_FALLBACKS, fallbacks, MET_DUAL_PATH, 0, 'typeof_dual_paths', 'both'),
    censusSite(MET_FALLBACKS, fallbacks, MET_CATCH, 0, 'catch_returns_default', 'primary-only'),
  ]));
  writeJson(root, CLASSIFICATION_FILE, classification('typeof_dual_paths', MET_FALLBACKS, MET_DUAL_PATH, 0));
  write(root, FAILURE_BUNDLE_FILE, 'export const LOG_TAIL_LINE_COUNT = 50;\n' +
    'export const LOG_WINDOW_COVERAGE = \'recorded\';\n');
  return root;
}

// A tree that offends every row: each cap exceeded by one, each scoped zero
// row hit in its owner files, no ratchet, no decoder, no INDEX.md in any of
// its nine source directories, a 121-file flat directory, a truncating
// bundle writer with no coverage, and a census that leaves most sites
// uncensused and records one never, one fallback-only and one unclassified
// both.
const CATCHES = 'src/fallbacks/catches.js';
const CATCH_SLICE = 'catch { return null; }';

function offendingSourceFixture(root) {
  write(root, 'src/ports.js',
    arrayModule('probe', 'o', 2129, 'typeof o.read === \'function\''));
  write(root, 'src/partition/partition-service-ports.js',
    arrayModule('probe', 'o', 2, 'typeof o.read === \'function\''));
  write(root, 'src/promise.js',
    'export function isThenable(r) {\n  return typeof r.then === \'function\';\n}\n');
  write(root, 'src/state/module-state.js',
    `${repeated(86, (index) => `const cache${index} = new Map();`)}\n`);
  write(root, 'src/partition/partition-service-raft-membership-administration.js',
    'const admitted = new Map();\n');
  write(root, 'src/raft/raft-rs-group-membership-admission.js',
    'const pending = new WeakMap();\n');
  write(root, 'src/bags.js', `${repeated(59, (index) =>
    `Object.getOwnPropertyNames(Owner${index}.prototype);`)}\n`);
  write(root, 'src/partition/partition-service-methods.js',
    'Object.getOwnPropertyNames(PartitionOwner.prototype);\n');
  write(root, 'src/classes/chain.js', 'class C0 {}\nclass C1 extends C0 {}\n' +
    `class C2 extends C1 {}\n${repeated(64, (index) =>
      `class C${index + 5} extends C${index + 4} {}`)}\n`);
  write(root, 'src/control-plane/control-plane-readiness-chain.js',
    'class C3 extends C2 {}\nclass C4 extends C3 {}\n');
  write(root, 'src/aliases.js',
    arrayModule('read', 'row', 746, 'row.node_id || row.nodeId'));
  write(root, 'src/state-defaults.js',
    'export function s(row) {\n  return row.status || \'idle\';\n}\n');
  write(root, 'src/alias-export.js', 'const a = 1;\nexport {a as b};\n');
  write(root, 'src/legacy.js', 'const legacy = 0;\nexport const terms = [\n' +
    `${repeated(2924, () => '  legacy,')}\n];\n`);
  for (let index = 0; index < 121; index += 1) write(root, `src/flat/f${index}.js`, '');
  for (let index = 0; index < 36; index += 1) {
    write(root, `src/reexports/r${index}.js`, 'export * from \'../ports.js\';\n');
  }
  write(root, 'src/fallbacks/two-source.js', arrayModule('two', 'a, b', 1790, 'a.x || b.y'));
  write(root, 'src/fallbacks/dual-paths.js',
    arrayModule('dual', 'f', 628, 'typeof f === \'function\' ? 1 : 0'));
  const catches = 'export function guarded() {\n' +
    `${repeated(388, () => `  try { work(); } ${CATCH_SLICE}`)}\n}\n`;
  write(root, CATCHES, catches);
  return catches;
}

function offendingFixture() {
  const root = makeRoot();
  const catches = offendingSourceFixture(root);
  // Neither a comment nor a baseline of another shape is a ratchet, and a
  // decoder module without its decode<Table>Row export is not a decoder.
  write(root, 'eslint.config.js', '// navigability-rule:alias_exports\nexport default [];\n');
  writeJson(root, baselineFile('alias_exports'), {});
  write(root, 'src/state/services-row-decoder.js',
    'export function decode(row) {\n  return row;\n}\n');
  write(root, FAILURE_BUNDLE_FILE, 'export const LOG_TAIL_LINE_COUNT = 50;\n');
  const site = (occurrence, siteClass) => censusSite(CATCHES, catches, CATCH_SLICE,
    occurrence, 'catch_returns_default', siteClass);
  const stale = {...site(5, 'never'), hash: sha256('a site that no longer exists')};
  writeJson(root, CENSUS_FILE, census([
    site(0, 'never'), site(1, 'fallback-only'), site(2, 'both'), site(3, 'both'),
    site(4, 'primary-only'), stale,
  ]));
  writeJson(root, CLASSIFICATION_FILE, classification('catch_returns_default', CATCHES, CATCH_SLICE, 3));
  return root;
}

function byName(rows) {
  return new Map(rows.map((row) => [row.name, row]));
}

test('every budget row is measured from the fixture tree it is given', () => {
  const met = measure(metFixture());
  const offending = measure(offendingFixture());

  assert.deepEqual(met.map((row) => row.name), SEALED_TABLE.map(([name]) => name),
    'row names and order are the table identity');
  assert.deepEqual(offending.map((row) => row.name), SEALED_TABLE.map(([name]) => name));

  const metRows = byName(met);
  const offendingRows = byName(offending);
  for (const [name, , , metValue, offendingValue] of SEALED_TABLE) {
    assert.equal(metRows.get(name).value, metValue,
      `${name} must measure ${metValue} on the satisfying tree`);
    assert.equal(metRows.get(name).met, true, `${name} is met on the satisfying tree`);
    assert.equal(offendingRows.get(name).value, offendingValue,
      `${name} must measure ${offendingValue} on the offending tree`);
    assert.equal(offendingRows.get(name).met, false,
      `${name} is unmet on the offending tree`);
  }
});

test('no budget number changed', () => {
  const rows = byName(measure(metFixture()));
  assert.equal(rows.size, SEALED_TABLE.length, 'the table must not gain or lose a row');
  for (const [name, kind, budget] of SEALED_TABLE) {
    const row = rows.get(name);
    assert.ok(row, `the sealed row ${name} is missing from the table`);
    assert.equal(row.budget, budget,
      `${name} (${kind}) must keep its sealed budget; change the epic, the ` +
      'script and this test together or not at all');
  }
});

test('census rows are outstanding while the census is absent or foreign', () => {
  const root = metFixture();
  const censusRows = ['fallback_branches_never_taken',
    'fallback_branches_only_fallback_taken', 'fallback_sites_unclassified'];
  const assertOutstanding = (label) => {
    const rows = byName(measure(root));
    for (const name of censusRows) {
      assert.equal(rows.get(name).value, null, `${name} reads null ${label}`);
      assert.equal(rows.get(name).met, false, `${name} is outstanding ${label}`);
    }
    assert.equal(rows.get('fallback_sites_uncensused').value, 3,
      `every fallback site is uncensused ${label}`);
    assert.equal(rows.get('fallback_sites_uncensused').met, false);
  };

  const recorded = JSON.parse(fs.readFileSync(path.join(root, CENSUS_FILE), UTF8));
  fs.rmSync(path.join(root, CENSUS_FILE));
  assertOutstanding('when the census is absent');
  writeJson(root, CENSUS_FILE, {...recorded, schema: 'fallback-census/0'});
  assertOutstanding('when the census has a foreign schema');

  // A census that matches no current site (the source moved under it)
  // censuses nothing and acquits nothing.
  writeJson(root, CENSUS_FILE, {...recorded, sites: recorded.sites.map((site) =>
    ({...site, class: 'never', hash: sha256(`moved ${site.hash}`)}))});
  const rows = byName(measure(root));
  assert.equal(rows.get('fallback_sites_uncensused').value, 3);
  assert.equal(rows.get('fallback_branches_never_taken').value, 0);
});

// Only the four executed classes census a site, and only through exactly
// one record carrying the site's full identity (row, file, hash,
// occurrence): an unloaded file, an unknown or missing class, a duplicate
// record or a record of another row acquits nothing.
test('a census record censuses its site only with one executed class', () => {
  const root = metFixture();
  const text = fs.readFileSync(path.join(root, MET_FALLBACKS), UTF8);
  const record = (slice, row, siteClass) =>
    censusSite(MET_FALLBACKS, text, slice, 0, row, siteClass);
  const two = (siteClass) => record(MET_TWO_SOURCE, 'two_source_fallback_reads', siteClass);
  const dual = (siteClass) => record(MET_DUAL_PATH, 'typeof_dual_paths', siteClass);
  const guarded = (siteClass) => record(MET_CATCH, 'catch_returns_default', siteClass);
  const measureWith = (sites) => {
    writeJson(root, CENSUS_FILE, census(sites));
    return byName(measure(root));
  };

  let rows = measureWith([two('unloaded'), dual('bogus'), guarded('')]);
  assert.equal(rows.get('fallback_sites_uncensused').value, 3,
    'unloaded, unknown and empty classes census nothing');
  assert.equal(rows.get('fallback_branches_never_taken').value, 0);
  const missing = guarded('never');
  delete missing.class;
  rows = measureWith([two('primary-only'), dual('primary-only'), missing]);
  assert.equal(rows.get('fallback_sites_uncensused').value, 1, 'a missing class censuses nothing');

  rows = measureWith([two('never'), two('primary-only'), dual('primary-only'),
    guarded('primary-only')]);
  assert.equal(rows.get('fallback_sites_uncensused').value, 1,
    'two records for one identity leave it uncensused');
  assert.equal(rows.get('fallback_branches_never_taken').value, 0);

  rows = measureWith([{...two('never'), row: 'typeof_dual_paths'}, dual('primary-only'),
    guarded('primary-only')]);
  assert.equal(rows.get('fallback_sites_uncensused').value, 1,
    'a record of another row does not census the site');
  assert.equal(rows.get('fallback_branches_never_taken').value, 0);

  rows = measureWith([two('never'), dual('fallback-only'), guarded('both')]);
  assert.equal(rows.get('fallback_sites_uncensused').value, 0);
  assert.equal(rows.get('fallback_branches_never_taken').value, 1);
  assert.equal(rows.get('fallback_branches_only_fallback_taken').value, 1);
  assert.equal(rows.get('fallback_sites_unclassified').value, 1);
  const entry = classification('catch_returns_default', MET_FALLBACKS, MET_CATCH, 0);
  writeJson(root, CLASSIFICATION_FILE, entry);
  assert.equal(byName(measure(root)).get('fallback_sites_unclassified').value, 0);
  delete entry.entries[0].row;
  writeJson(root, CLASSIFICATION_FILE, entry);
  assert.equal(byName(measure(root)).get('fallback_sites_unclassified').value, 1,
    'a classification without the site row classifies nothing');
});

// The census and classification record contract: a record is an object
// with string row, file and hash, an integer occurrence (never coerced: "0"
// is not 0) and a string class. Anything else is an invalid record that
// censuses or classifies nothing and never crashes the budget; a census file
// that fails the schema is absent.
test('a malformed census or classification record censuses nothing and never throws', () => {
  const root = metFixture();
  const text = fs.readFileSync(path.join(root, MET_FALLBACKS), UTF8);
  const record = (slice, row, siteClass) =>
    censusSite(MET_FALLBACKS, text, slice, 0, row, siteClass);
  const two = (siteClass) => record(MET_TWO_SOURCE, 'two_source_fallback_reads', siteClass);
  const dual = (siteClass) => record(MET_DUAL_PATH, 'typeof_dual_paths', siteClass);
  const guarded = (siteClass) => record(MET_CATCH, 'catch_returns_default', siteClass);
  const measureWith = (sites) => {
    writeJson(root, CENSUS_FILE, census(sites));
    return byName(measure(root));
  };

  let rows = measureWith([null, 7, 'never', [], two('primary-only'), dual('both'),
    guarded('primary-only')]);
  assert.equal(rows.get('fallback_sites_uncensused').value, 0,
    'null, a number, a string and an array are skipped, valid records still count');

  rows = measureWith([{...two('primary-only'), occurrence: '0'}, {...dual('both'),
    occurrence: 0.5}, {...guarded('primary-only'), hash: null}]);
  assert.equal(rows.get('fallback_sites_uncensused').value, 3,
    'a string or fractional occurrence and a null hash have no identity');

  rows = measureWith([two('primary-only'), {...two('primary-only'), class: 42},
    dual('both'), guarded('primary-only')]);
  assert.equal(rows.get('fallback_sites_uncensused').value, 1,
    'a second record of one identity with a malformed class still makes it a duplicate');

  for (const foreign of [null, [], 'census', 3, {schema: CENSUS_SCHEMA, sites: null}]) {
    writeJson(root, CENSUS_FILE, foreign);
    rows = byName(measure(root));
    assert.equal(rows.get('fallback_sites_uncensused').value, 3,
      `${JSON.stringify(foreign)} is no census`);
    assert.equal(rows.get('fallback_branches_never_taken').value, null,
      `${JSON.stringify(foreign)} leaves the census rows outstanding`);
  }

  measureWith([two('primary-only'), dual('both'), guarded('primary-only')]);
  const entry = classification('typeof_dual_paths', MET_FALLBACKS, MET_DUAL_PATH, 0);
  const classifyWith = (entries) => {
    writeJson(root, CLASSIFICATION_FILE, {...entry, entries});
    return byName(measure(root)).get('fallback_sites_unclassified').value;
  };
  assert.equal(classifyWith(entry.entries), 0, 'the valid entry classifies its site');
  assert.equal(classifyWith([null, 1, [], 'x']), 1, 'non-object entries classify nothing');
  assert.equal(classifyWith([{...entry.entries[0], occurrence: '0'}]), 1,
    'a string occurrence is not the integer occurrence');
  assert.equal(classifyWith([{...entry.entries[0], classification: ''}]), 1,
    'an entry without a classification classifies nothing');
  assert.equal(classifyWith([{...entry.entries[0], classification: ' \t\n '}]), 1,
    'a whitespace-only classification is blank and classifies nothing');
  for (const foreign of [null, [], {entries: null}]) {
    writeJson(root, CLASSIFICATION_FILE, foreign);
    assert.equal(byName(measure(root)).get('fallback_sites_unclassified').value, 1,
      `${JSON.stringify(foreign)} classifies nothing`);
  }
});

// A row that names a module or a generator is outstanding until that owner
// answers: an absent or unparsable bundle writer, a generator that fails.
test('name-bound inputs are outstanding until their owner answers', () => {
  const root = metFixture();
  fs.rmSync(path.join(root, FAILURE_BUNDLE_FILE));
  let rows = byName(measure(root));
  assert.equal(rows.get('failure_bundle_log_windows_without_coverage').value, null);
  assert.equal(rows.get('failure_bundle_log_windows_without_coverage').met, false);

  write(root, FAILURE_BUNDLE_FILE, 'export const = ;\n');
  rows = byName(measure(root));
  assert.equal(rows.get('failure_bundle_log_windows_without_coverage').value, null,
    'an unparsable bundle writer has no exports to judge');
  assert.equal(rows.get('failure_bundle_log_windows_without_coverage').met, false);

  // The writer's exports decide the row: the tail without coverage is one
  // window without coverage, coverage answers it, and a writer that names
  // neither cannot be judged (outstanding, never met).
  const windowRow = (text) => {
    write(root, FAILURE_BUNDLE_FILE, text);
    return byName(measure(root)).get('failure_bundle_log_windows_without_coverage');
  };
  assert.deepEqual(windowRow('export const LOG_TAIL_LINE_COUNT = 50;\n'),
    {name: 'failure_bundle_log_windows_without_coverage', value: 1, budget: 0, met: false});
  assert.equal(windowRow('export const LOG_TAIL_LINE_COUNT = 50;\n' +
    'export const LOG_WINDOW_COVERAGE = \'recorded\';\n').value, 0);
  assert.equal(windowRow('const coverage = 1;\nexport {coverage as LOG_WINDOW_COVERAGE};\n')
    .value, 0, 'coverage exported by a specifier answers the row');
  const neither = windowRow('export const LOG_LINES = 50;\nexport function write() {}\n');
  assert.equal(neither.value, null, 'a writer exporting neither name is outstanding');
  assert.equal(neither.met, false);
  assert.equal(windowRow('const LOG_TAIL_LINE_COUNT = 50;\n').value, null,
    'an unexported tail is no export');
  fs.rmSync(path.join(root, FAILURE_BUNDLE_FILE));

  const generator = 'scripts/generate-source-owner-index.js';
  write(root, generator, 'console.log(\'3\');\n');
  assert.equal(byName(measure(root)).get('stale_owner_indexes').value, 3,
    'the generator\'s --check verdict replaces the INDEX.md count');
  write(root, generator, 'console.log(\'0\');\nprocess.exit(1);\n');
  rows = byName(measure(root));
  assert.equal(rows.get('stale_owner_indexes').value, null, 'a failing generator has no verdict');
  assert.equal(rows.get('stale_owner_indexes').met, false);
});

// A pattern is promoted only when ESLint's resolved configuration carries
// a no-restricted-syntax entry whose message names it; the promoted row then
// reads the ESLint reports carrying that marker.
test('an ESLint promotion is read from ESLint and measured by its reports', () => {
  const root = metFixture();
  fs.rmSync(path.join(root, baselineFile('alias_exports')));
  const marker = 'navigability-rule:alias_exports';
  const lintCalls = [];
  const promoting = (lintResult) => (args) => {
    if (args[0] === '--print-config') {
      return {status: 0, stdout: JSON.stringify({rules: {'no-restricted-syntax': ['error',
        {selector: 'ExportSpecifier', message: `${marker}: export the name itself`},
        {selector: 'WithStatement', message: 'navigability-rule:alias_exports_extra'}]}})};
    }
    lintCalls.push(args);
    return lintResult;
  };
  const report = (ruleId, message) => ({ruleId, message});
  const reports = {status: 1, stdout: JSON.stringify([
    {filePath: 'src/a.js', messages: [report('no-restricted-syntax', `${marker}: x`),
      report('no-restricted-syntax', 'navigability-rule:alias_exports_extra'),
      report('no-unused-vars', marker)]},
    {filePath: 'src/b.js', messages: [report('no-restricted-syntax', `${marker}: y`)]},
  ])};

  let rows = byName(measure(root));
  assert.equal(rows.get('navigability_patterns_without_ratchet').value, 1,
    'no baseline and no promotion: unratcheted');
  rows = byName(measure(root, promoting(reports)));
  assert.equal(rows.get('navigability_patterns_without_ratchet').value, 0);
  assert.equal(rows.get('alias_exports').value, 2,
    'the marked no-restricted-syntax reports, not the detector');
  assert.deepEqual(lintCalls, [['--format', 'json', 'src']]);
  rows = byName(measure(root, promoting({status: 2, stdout: ''})));
  assert.equal(rows.get('alias_exports').value, null, 'ESLint that did not complete');
  rows = byName(measure(root, () => ({status: 2, stdout: ''})));
  assert.equal(rows.get('navigability_patterns_without_ratchet').value, 1,
    'a configuration ESLint cannot print promotes nothing');
});

// The marker is a whole token and only an error-severity entry promotes:
// a longer row name, the marker inside another word, a `warn` or `off`
// rule, or a rule with no options promotes nothing.
test('an ESLint promotion needs the whole marker at error severity', () => {
  const root = metFixture();
  fs.rmSync(path.join(root, baselineFile('alias_exports')));
  const configured = (setting) => (args) => (args[0] === '--print-config' ?
    {status: 0, stdout: JSON.stringify({rules: {'no-restricted-syntax': setting}})} :
    {status: 0, stdout: '[]'});
  const entry = (message) => ({selector: 'ExportSpecifier', message});
  const unratcheted = (setting) => byName(measure(root, configured(setting)))
    .get('navigability_patterns_without_ratchet').value;
  const marker = 'navigability-rule:alias_exports';

  assert.equal(unratcheted([2, entry(`${marker}: export the name itself`)]), 0,
    'the printed config\'s numeric error severity promotes');
  assert.equal(unratcheted(['error', entry(marker)]), 0, 'so does \'error\'');
  for (const message of [`${marker}_extra`, `${marker}-v2`, `x${marker}`,
    `pre_${marker}`, 'navigability-rule:alias_export']) {
    assert.equal(unratcheted([2, entry(message)]), 1, `${message} is not the marker`);
  }
  for (const severity of [1, 'warn', 0, 'off']) {
    assert.equal(unratcheted([severity, entry(marker)]), 1,
      `severity ${severity} promotes nothing`);
  }
  assert.equal(unratcheted(2), 1, 'a rule without options carries no marker');
});

test('a cap row is met exactly at its cap', () => {
  const root = metFixture();
  for (let index = 0; index < 34; index += 1) {
    write(root, `src/barrel-${index}.js`, 'export * from \'./ports.js\';\n');
  }
  const row = byName(measure(root)).get('reexport_only_modules');
  assert.equal(row.value, 35);
  assert.equal(row.budget, 35);
  assert.equal(row.met, true, 'at the cap is within it');
});

// A file that does not parse would silently shrink every detector count, so
// it makes every detector-backed row outstanding and is named in the result.
test('an unparsable source file makes every detector-backed row outstanding', () => {
  const root = metFixture();
  write(root, 'src/broken.js', 'const = ;\n');
  const {rows, parseFailures} = measureNavigabilityBudgetWithFailures(root,
    {eslintRunner: noPromotion});
  assert.deepEqual(parseFailures.map((failure) => failure.file), ['src/broken.js']);
  assert.equal(typeof parseFailures[0].message, 'string');
  const treeRows = new Set(['navigability_patterns_without_ratchet',
    'formation_system_tables_without_decoder', 'source_directories_over_cap',
    'stale_owner_indexes', 'failure_bundle_log_windows_without_coverage']);
  for (const row of rows) {
    if (treeRows.has(row.name)) {
      assert.equal(row.value, 0, `${row.name} does not read detector sites`);
      assert.equal(row.met, true);
    } else {
      assert.equal(row.value, null, `${row.name} is unknown while a file does not parse`);
      assert.equal(row.met, false, `${row.name} is outstanding, never met`);
    }
  }
});

// Without `<root>/src` no tree was read: every row that reads detector sites
// or the source tree is outstanding (null, unmet), as for a parse failure,
// and the missing root is reported; never a 0 that reads as met.
const ROWS_NOT_READING_THE_TREE = new Set(['navigability_patterns_without_ratchet',
  'formation_system_tables_without_decoder', 'failure_bundle_log_windows_without_coverage']);

test('an absent source root makes every tree-reading row outstanding', () => {
  const root = metFixture();
  fs.rmSync(path.join(root, 'src'), {recursive: true});
  const {rows, parseFailures, missingRoot} = measureNavigabilityBudgetWithFailures(root,
    {eslintRunner: noPromotion});
  assert.equal(missingRoot, path.join(root, 'src'));
  assert.deepEqual(parseFailures, []);
  for (const row of rows) {
    if (ROWS_NOT_READING_THE_TREE.has(row.name)) continue;
    assert.equal(row.value, null, `${row.name} is unknown without a source root`);
    assert.equal(row.met, false, `${row.name} is outstanding, never met`);
  }
  const byRow = byName(rows);
  assert.equal(byRow.get('navigability_patterns_without_ratchet').value, 0);
  assert.equal(byRow.get('formation_system_tables_without_decoder').value, 3);
  assert.equal(byRow.get('failure_bundle_log_windows_without_coverage').value, 0);

  write(root, 'src/INDEX.md', '# src\n');
  assert.equal(measureNavigabilityBudgetWithFailures(root, {eslintRunner: noPromotion})
    .missingRoot, null, 'an existing root is not missing');
});

// The CLI binds its own checkout, so it runs from a copy whose root has no
// src: the missing root is named on stderr and the tree rows are unmet.
test('the CLI names a missing source root on stderr', () => {
  const root = makeRoot();
  fs.mkdirSync(path.join(root, 'scripts/checks'), {recursive: true});
  for (const name of fs.readdirSync(path.join(REPO_ROOT, 'scripts/checks'))) {
    if (!/^code-navigability-.*\.js$/u.test(name)) continue;
    fs.copyFileSync(path.join(REPO_ROOT, 'scripts/checks', name),
      path.join(root, 'scripts/checks', name));
  }
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(root, 'node_modules'));
  writeJson(root, 'package.json', {type: 'module'});
  const result = spawnSync(process.execPath, [SCRIPT, '--json'],
    {cwd: root, encoding: UTF8, timeout: 60_000});
  assert.equal(result.stderr, `source root absent: ${path.join(root, 'src')}\n`);
  const lines = result.stdout.trimEnd().split('\n');
  const lastLine = lines.pop();
  const rows = byName(JSON.parse(lines.join('\n')).rows);
  assert.equal(rows.get('owner_port_feature_detection').value, null);
  assert.equal(rows.get('source_directories_over_cap').value, null);
  assert.equal(rows.get('stale_owner_indexes').value, null);
  assert.equal(lastLine, '26', 'every row is unmet in a copy with no src and no inputs');
  assert.equal(result.status, 1);
});

// Census and classification records are judged by their own fields: a
// polluted Object.prototype supplying a site identity, a class, a schema,
// sites, entries or a classification acquits nothing.
test('an inherited field never stands in for a census or classification field', () => {
  const root = metFixture();
  const text = fs.readFileSync(path.join(root, MET_FALLBACKS), UTF8);
  const record = censusSite(MET_FALLBACKS, text, MET_TWO_SOURCE, 0,
    'two_source_fallback_reads', 'primary-only');
  const entry = classification('typeof_dual_paths', MET_FALLBACKS, MET_DUAL_PATH, 0).entries[0];
  const pollution = {row: record.row, file: record.file, hash: record.hash,
    occurrence: 0, class: 'primary-only', schema: CENSUS_SCHEMA, sites: [record],
    entries: [entry], classification: 'documented-default'};
  // The hostile process this test stands in for: the prototype every plain
  // object inherits from, polluted only for one measurement and restored.
  const inherited = Object.getPrototypeOf({});
  const polluted = (measureTree) => {
    for (const [key, value] of Object.entries(pollution)) {
      Object.defineProperty(inherited, key,
        {value, configurable: true, writable: true, enumerable: false});
    }
    try {
      return byName(measureTree());
    } finally {
      for (const key of Object.keys(pollution)) delete inherited[key];
    }
  };

  writeJson(root, CENSUS_FILE, census([{}]));
  writeJson(root, CLASSIFICATION_FILE, {version: 1, entries: [{}]});
  let rows = polluted(() => measure(root));
  assert.equal(rows.get('fallback_sites_uncensused').value, 3,
    'a census [{}] censuses nothing under a polluted prototype');
  assert.equal(rows.get('fallback_branches_never_taken').value, 0,
    'the census is present: its own schema and sites');

  writeJson(root, CENSUS_FILE, {});
  writeJson(root, CLASSIFICATION_FILE, {});
  rows = polluted(() => measure(root));
  assert.equal(rows.get('fallback_sites_uncensused').value, 3);
  for (const name of ['fallback_branches_never_taken',
    'fallback_branches_only_fallback_taken', 'fallback_sites_unclassified']) {
    assert.equal(rows.get(name).value, null, `{} is an absent census: ${name} outstanding`);
  }

  // Without pollution the same tree with its own fields still measures.
  writeJson(root, CENSUS_FILE, census([record,
    censusSite(MET_FALLBACKS, text, MET_DUAL_PATH, 0, 'typeof_dual_paths', 'both'),
    censusSite(MET_FALLBACKS, text, MET_CATCH, 0, 'catch_returns_default', 'primary-only')]));
  writeJson(root, CLASSIFICATION_FILE, {version: 1, entries: [{...entry}]});
  rows = polluted(() => measure(root));
  assert.equal(rows.get('fallback_sites_uncensused').value, 0);
  assert.equal(rows.get('fallback_sites_unclassified').value, 0);
  assert.equal(Object.hasOwn(inherited, 'row'), false, 'the pollution is restored');
});

// A probe command is split on whitespace and these names have no spaces, so
// --rows matches the name verbatim; a name that matches no row is itself
// unmet, so a misspelled probe reads red instead of measuring nothing.
test('--rows selects by exact name and counts an unknown name as unmet', () => {
  const rows = [
    {name: 'alias_exports', value: 40, budget: 0, met: false},
    {name: 'reexport_only_modules', value: 35, budget: 35, met: true},
  ];
  assert.deepEqual(selectedRows(rows, ['--metric']), rows, 'no flag: every row');
  assert.deepEqual(selectedRows(rows, ['--rows', 'reexport_only_modules']), [rows[1]]);
  assert.deepEqual(selectedRows(rows, ['--rows', 'alias_exports,reexport_only_modules']),
    rows);
  const unknown = selectedRows(rows, ['--rows', 'reexport only modules']);
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].met, false, 'an unknown row name is unmet');
  assert.equal(selectedRows(rows, ['--rows', 'alias_export'])[0].met, false);
  assert.equal(selectedRows(rows, ['--rows'])[0].met, false, 'a missing value is unmet');
  assert.deepEqual(selectedRows(rows, ['--rows', 'alias_exports,alias_exports']), [rows[0]],
    'a repeated name is one row');
});

function runScript(argv) {
  return spawnSync(process.execPath, [SCRIPT, ...argv],
    {cwd: REPO_ROOT, encoding: UTF8, timeout: 170_000});
}

// An argument the script does not recognise is refused before anything is
// measured: one stderr line, no count on stdout, exit 1, so a probe that
// spelled `--rows=name` reads non-measuring rather than a silent all-rows run.
test('an unrecognised argument is a usage refusal', () => {
  assert.equal(unrecognisedArgument(['--json', '--metric', '--rows', 'a,b']), undefined);
  assert.equal(unrecognisedArgument(['--rows=alias_exports']), '--rows=alias_exports');
  assert.equal(unrecognisedArgument(['--metric', 'alias_exports']), 'alias_exports');
  for (const argv of [['--rows=alias_exports'], ['--metric', '--bogus'], ['rows']]) {
    const result = spawnSync(process.execPath, [SCRIPT, ...argv],
      {cwd: REPO_ROOT, encoding: UTF8, timeout: 30_000});
    assert.equal(result.stdout, '', `${argv.join(' ')} prints no count`);
    assert.equal(result.stderr.split('\n').filter(Boolean).length, 1,
      `${argv.join(' ')} prints one usage line`);
    assert.match(result.stderr, /unrecognised argument: /u);
    assert.equal(result.status, 1);
  }
});

test('the real tree measures every row and every cap row is within its cap',
  {timeout: 180_000}, () => {
    const result = runScript(['--json']);
    assert.equal(result.error, undefined, `the script must finish: ${result.error}`);
    const lines = result.stdout.trimEnd().split('\n');
    const lastLine = lines.pop();
    const {rows, unmet} = JSON.parse(lines.join('\n'));
    const measured = byName(rows);

    assert.deepEqual(rows.map((row) => row.name), SEALED_TABLE.map(([name]) => name),
      'the real tree reports every sealed row');
    for (const [name, kind, budget] of SEALED_TABLE) {
      const row = measured.get(name);
      if (kind === CAP) {
        assert.equal(typeof row.value, 'number', `${name} is measured`);
        assert.ok(row.value <= budget, `${name} measures ${row.value}, over its cap ${budget}`);
        assert.equal(row.met, true, `${name} is met at or below its cap`);
      } else {
        assert.ok(row.value === null || Number.isInteger(row.value),
          `${name} reports a count or null, never a crash`);
        assert.equal(row.met, row.value === 0, `${name} is met only at 0`);
      }
    }
    const counted = rows.filter((row) => !row.met).length;
    assert.equal(unmet, counted, 'the JSON unmet count is the unmet rows');
    assert.equal(lastLine, String(counted), 'the last stdout line is the unmet count');
    assert.equal(result.status === 0, counted === 0, 'exit 0 iff nothing is unmet');

    const probe = runScript(['--metric', '--rows', 'reexport_only_modules,not_a_row']);
    assert.equal(probe.stdout, '1\n',
      '--metric prints only the unmet count; the unknown row is the one unmet');
    assert.notEqual(probe.status, 0);
  });

test('the budget script and the detector module pass the changed-path guideline checkers',
  () => {
    const scripts = fs.readdirSync(path.join(REPO_ROOT, 'scripts/checks'))
      .filter((name) => /^code-navigability-.*\.js$/u.test(name))
      .map((name) => `scripts/checks/${name}`);
    assert.ok(scripts.includes(SCRIPT), `${SCRIPT} exists`);
    assert.ok(scripts.includes('scripts/checks/code-navigability-detectors.js'));
    // The checkers are the authority on their own rules, so they are RUN
    // rather than re-expressed; raw counts exclude any inherited baseline.
    for (const checker of [
      'scripts/check-guideline-literals.js',
      'scripts/check-guideline-ambient-intrinsics.js',
      'scripts/check-guideline-decision-boundaries.js',
    ]) {
      for (const file of scripts) {
        const result = spawnSync(process.execPath, [checker, '--json', file],
          {cwd: REPO_ROOT, encoding: UTF8, timeout: 120_000});
        assert.equal(result.status, 0, `${checker} must exit 0 on ${file}: ${result.stderr}`);
        const report = JSON.parse(result.stdout);
        assert.equal(report.scannedFileCount, 1, `${checker} scanned ${file}`);
        assert.equal(report.rawViolationCount, 0, `${checker} finds nothing in ${file}`);
        assert.deepEqual(report.violations, []);
      }
    }
    const lint = spawnSync('npx', ['eslint', ...scripts],
      {cwd: REPO_ROOT, encoding: UTF8, timeout: 120_000});
    assert.equal(lint.status, 0, `eslint must pass: ${lint.stdout}${lint.stderr}`);
  });
