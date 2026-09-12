// The fixture hole. A changed test support file - non-test JavaScript under
// test/ or src/test-helpers/ - selects every test whose import closure reaches
// it, from the sealed import graph, ON TOP OF the subsystem the taxonomy
// gives it; without the sealed graph the change refuses with the command that
// regenerates it, and an ordinary source change never reads the graph at all.
// Hermetic: a synthetic root carries the manifest, the graph and its seal.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  selectChangedTests,
} from '../../scripts/checks/change-selection.js';
import {
  HELPER_IMPORT_GRAPH_HINT,
  REASON_HELPER_IMPORTER,
  REASON_SUBSYSTEM,
  REFUSAL_UNKNOWN_SCOPE,
  REFUSED_IMPORT_GRAPH_PROBLEM,
  SELECTION_REFUSED,
  SELECTION_WIDENED,
} from '../../scripts/checks/change-selection-constants.js';
import {
  helperImportClosure,
  isTestSupportPath,
  loadSealedImporters,
} from '../../scripts/checks/helper-import-closure.js';
import {
  IMPORT_GRAPH_PATH,
  IMPORT_GRAPH_SEAL_PATH,
} from '../../scripts/checks/impact-proof-cone-constants.js';
import {
  SUBSYSTEM_MANIFEST_PATH,
} from '../../scripts/checks/test-subsystem-classification-constants.js';

const FIXTURE = 'test/bootstrap/api-fixtures.js';
const HELPER_OF_HELPER = 'test/rebalancer/planning-helpers.js';
const BOOTSTRAP_TEST = 'test/bootstrap/api.test.js';
const REBALANCER_TEST = 'test/rebalancer/planning.test.js';
const UNCLASSIFIED_TEST = 'test/rebalancer/retired.test.js';
const INFRA_TEST = 'test/scripts/runner.test.js';
const ORDINARY_SOURCE = 'src/raft/log.js';
const SUBSYSTEM_INFRA = 'test-infrastructure';
const SUBSYSTEM_RAFT = 'storage-raft';
const DIGEST_LENGTH = 64;
const IMPORTERS = Object.freeze({
  [FIXTURE]: [BOOTSTRAP_TEST, HELPER_OF_HELPER],
  // A cycle back to the fixture and a test the manifest no longer knows.
  [HELPER_OF_HELPER]: [REBALANCER_TEST, UNCLASSIFIED_TEST, FIXTURE],
});
const CLASSES = Object.freeze({
  [BOOTSTRAP_TEST]: 'bootstrap-membership',
  [REBALANCER_TEST]: 'placement-rebalance',
  [INFRA_TEST]: SUBSYSTEM_INFRA,
});
const SEAL = Object.freeze({
  schemaVersion: 1,
  importGraphSchemaVersion: 'global-owner-debt-import-graph-v2',
  sourceDigest: 'a'.repeat(DIGEST_LENGTH),
  producerInputDigest: 'b'.repeat(DIGEST_LENGTH),
  resolverStateDigest: 'c'.repeat(DIGEST_LENGTH),
  snapshotDigest: 'd'.repeat(DIGEST_LENGTH),
});
const GRAPH = Object.freeze({
  schemaVersion: SEAL.importGraphSchemaVersion,
  sourceDigest: SEAL.sourceDigest,
  snapshotDigest: SEAL.snapshotDigest,
  importers: IMPORTERS,
});

function writeJson(root, relative, value) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, `${JSON.stringify(value)}\n`);
}

function fixtureRoot({graph = GRAPH, seal = SEAL} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'helper-import-closure-'));
  writeJson(root, SUBSYSTEM_MANIFEST_PATH, {classes: CLASSES});
  if (graph) writeJson(root, IMPORT_GRAPH_PATH, graph);
  if (seal) writeJson(root, IMPORT_GRAPH_SEAL_PATH, seal);
  return root;
}

function select(root, changedPaths) {
  return selectChangedTests({
    root, changedPaths, changedPackageFields: null, lockfileGraphChanged: false,
  });
}

function reasonsByPath(selection) {
  return new Map(selection.tests.map((entry) => [entry.path, entry.reasons]));
}

test('test support code is non-test JavaScript under test/ or src/test-helpers/', () => {
  assert.equal(isTestSupportPath(FIXTURE), true);
  assert.equal(isTestSupportPath('src/test-helpers/clock.js'), true);
  assert.equal(isTestSupportPath('test/distributed/harness/cluster.mjs'), true);
  assert.equal(isTestSupportPath(BOOTSTRAP_TEST), false, 'a test proves itself');
  assert.equal(isTestSupportPath('test/fixtures/rows.json'), false,
    'the import graph does not see data files');
  assert.equal(isTestSupportPath(ORDINARY_SOURCE), false);
});

test('the closure follows helpers of helpers, selects classified tests once and survives a cycle', () => {
  assert.deepEqual(helperImportClosure(IMPORTERS, FIXTURE, CLASSES),
    [BOOTSTRAP_TEST, REBALANCER_TEST]);
  assert.deepEqual(helperImportClosure(IMPORTERS, HELPER_OF_HELPER, CLASSES),
    [BOOTSTRAP_TEST, REBALANCER_TEST],
    'the cycle reaches the fixture and, through it, the bootstrap test');
  assert.deepEqual(helperImportClosure(IMPORTERS, 'test/new-helper.js', CLASSES),
    [], 'a helper the graph never saw has no importers to name');
});

test('only the graph the committed seal binds is an importer authority', () => {
  assert.equal(loadSealedImporters(fixtureRoot()).ok, true);
  assert.equal(loadSealedImporters(fixtureRoot({graph: null})).ok, false,
    'no generated graph');
  assert.equal(loadSealedImporters(fixtureRoot({seal: null})).ok, false,
    'no committed seal');
  const unsealed = loadSealedImporters(fixtureRoot({
    graph: {...GRAPH, snapshotDigest: 'e'.repeat(DIGEST_LENGTH)},
  }));
  assert.equal(unsealed.ok, false, 'a graph the seal does not bind');
  assert.match(unsealed.problem, /seal/u);
});

test('a changed fixture widens to its taxonomy subsystem AND every test importing it', () => {
  const selection = select(fixtureRoot(), [FIXTURE]);
  assert.equal(selection.kind, SELECTION_WIDENED);
  assert.deepEqual(selection.subsystems, [SUBSYSTEM_INFRA],
    'the taxonomy still owns the file');
  const reasons = reasonsByPath(selection);
  assert.deepEqual(reasons.get(INFRA_TEST),
    [`${REASON_SUBSYSTEM}: ${SUBSYSTEM_INFRA}`], 'subsystem widening is kept');
  assert.deepEqual(reasons.get(REBALANCER_TEST),
    [`${REASON_HELPER_IMPORTER}: ${FIXTURE}`],
    'the consumer in another subsystem is selected through the closure');
  assert.deepEqual(reasons.get(BOOTSTRAP_TEST),
    [`${REASON_HELPER_IMPORTER}: ${FIXTURE}`]);
  assert.equal(reasons.has(UNCLASSIFIED_TEST), false,
    'a test the manifest no longer knows cannot be run');
});

test('without the sealed graph a changed fixture refuses with the regeneration hint', () => {
  const selection = select(fixtureRoot({graph: null}), [FIXTURE]);
  assert.equal(selection.kind, SELECTION_REFUSED);
  assert.equal(selection.refusalCode, REFUSAL_UNKNOWN_SCOPE);
  assert.equal(selection.refusals.length, 1);
  assert.match(selection.refusals[0], new RegExp(REFUSED_IMPORT_GRAPH_PROBLEM));
  assert.ok(selection.refusals[0].includes(FIXTURE));
  assert.ok(selection.refusals[0].includes(HELPER_IMPORT_GRAPH_HINT));
});

test('an ordinary source change never reads the graph', () => {
  const selection = select(fixtureRoot({graph: null, seal: null}),
    [ORDINARY_SOURCE]);
  assert.equal(selection.kind, SELECTION_WIDENED);
  assert.deepEqual(selection.subsystems, [SUBSYSTEM_RAFT]);
});
