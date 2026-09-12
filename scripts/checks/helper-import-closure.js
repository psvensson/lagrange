// Test support code has no subsystem of its own. A fixture under
// test/bootstrap/ or a helper under src/test-helpers/ is imported by tests
// across subsystems, and the path taxonomy can only route it to
// test-infrastructure - so on 2026-09-05 (a6d99aa3d) a change to
// test/bootstrap/bootstrap-api-test-fixtures.js proved test-infrastructure
// while the consumers it broke were placement-rebalance tests, and main went
// red on a later, innocent push that happened to widen into them. The sealed
// import graph names every importer, so a changed helper selects every test
// whose import closure reaches it - IN ADDITION to the taxonomy's subsystem,
// never instead of it: the graph only ever adds proof.
//
// Freshness. The graph is accepted when it is the one the committed seal
// binds. A working-tree edit that ADDS an import of the helper lives in a
// changed test, which the selector already selects as changed-test; an edit
// that REMOVES one only over-selects. So the sealed graph is complete for
// every UNCHANGED test, which is exactly the set this closure exists to find.
// A missing graph, or one that is not the sealed graph, is a refusal - never a
// guess - and the push gate answers a refusal with the whole corpus.
//
// v1 scope: import edges only. A fixture a test reads through fs (JSON, SQL,
// golden files) is not test support code here and still widens only to
// test-infrastructure; a test importer the classification no longer knows is
// dropped, since it cannot be run. Both are the same boundary the receipts
// quest draws (test-file-content-receipts).

import fs from 'node:fs';
import path from 'node:path';

import {
  appendArrayValue,
  createOrderedStringSet,
  orderedStringSetAdd,
  orderedStringSetHas,
  orderedStringSetValues,
  sortStrings,
} from './change-proof-string-collections.js';
import {
  IMPORT_GRAPH_PATH,
  IMPORT_GRAPH_SEAL_PATH,
} from './impact-proof-cone-constants.js';

// Intrinsics captured at module load: the graph is external data, and this
// module decides part of what the push gate proves.
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayIsArray = Array.isArray;
const arraySome = Function.call.bind(Array.prototype.some);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const jsonParse = JSON.parse.bind(JSON);
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;

const UTF8 = 'utf8';
const TEST_SUFFIX = '.test.js';
const JAVASCRIPT_SUFFIXES = Object.freeze(['.js', '.mjs', '.cjs']);
// Non-test JavaScript that exists to be imported by tests.
const TEST_SUPPORT_PREFIXES = Object.freeze(['test/', 'src/test-helpers/']);
const GRAPH_IMPORTERS_FIELD = 'importers';
const GRAPH_MISSING_PROBLEM = 'import graph is not generated';
const SEAL_MISSING_PROBLEM = 'import graph seal is missing';
const GRAPH_UNSEALED_PROBLEM =
  'import graph is not the one the committed seal binds';
const GRAPH_SHAPE_PROBLEM =
  'import graph importers must map paths to path arrays';

/**
 * Whether a changed path is test support code: non-test JavaScript under
 * test/ or src/test-helpers/, whose consumers the taxonomy cannot name.
 * @param {string} changedPath repository-relative
 * @return {boolean}
 */
export function isTestSupportPath(changedPath) {
  return arraySome(TEST_SUPPORT_PREFIXES,
    (prefix) => stringStartsWith(changedPath, prefix)) &&
    !stringEndsWith(changedPath, TEST_SUFFIX) &&
    arraySome(JAVASCRIPT_SUFFIXES,
      (suffix) => stringEndsWith(changedPath, suffix));
}

function readJson(root, relative) {
  try {
    return jsonParse(fs.readFileSync(path.join(root, relative), UTF8));
  } catch {
    return null;
  }
}

function isPathArrayMap(value) {
  if (!value || typeof value !== 'object' || arrayIsArray(value)) return false;
  return arrayEvery(objectKeys(value), (key) =>
    arrayIsArray(value[key]) &&
    arrayEvery(value[key], (entry) => typeof entry === 'string'));
}

function sealBindsGraph(seal, graph) {
  return seal.importGraphSchemaVersion === graph.schemaVersion &&
    seal.sourceDigest === graph.sourceDigest &&
    seal.snapshotDigest === graph.snapshotDigest;
}

/**
 * The importer map of the sealed import graph, or the reason there is none.
 * @param {string} root repository root
 * @return {{ok: true, importers: Object<string, string[]>}|
 *   {ok: false, problem: string}}
 */
export function loadSealedImporters(root) {
  const graph = readJson(root, IMPORT_GRAPH_PATH);
  if (!graph) return {ok: false, problem: GRAPH_MISSING_PROBLEM};
  const seal = readJson(root, IMPORT_GRAPH_SEAL_PATH);
  if (!seal) return {ok: false, problem: SEAL_MISSING_PROBLEM};
  if (!sealBindsGraph(seal, graph)) {
    return {ok: false, problem: GRAPH_UNSEALED_PROBLEM};
  }
  const importers = graph[GRAPH_IMPORTERS_FIELD];
  if (!isPathArrayMap(importers)) {
    return {ok: false, problem: GRAPH_SHAPE_PROBLEM};
  }
  return {ok: true, importers};
}

/**
 * Every classified test whose import closure reaches helperPath. Breadth-first
 * over importers (the frontier is a growing list read by cursor): a non-test
 * importer is followed (a helper of a helper), a test importer is selected
 * and not followed.
 * @param {Object<string, string[]>} importers path -> paths importing it
 * @param {string} helperPath the changed support file
 * @param {Object<string, string>} classes the subsystem classification
 * @return {string[]} sorted test paths
 */
export function helperImportClosure(importers, helperPath, classes) {
  const visited = createOrderedStringSet([helperPath]);
  const frontier = [helperPath];
  const tests = createOrderedStringSet();
  for (let cursor = 0; cursor < frontier.length; cursor += 1) {
    const current = frontier[cursor];
    const direct = objectHasOwn(importers, current) ? importers[current] : [];
    for (let index = 0; index < direct.length; index += 1) {
      const importer = direct[index];
      if (orderedStringSetHas(visited, importer)) continue;
      orderedStringSetAdd(visited, importer);
      if (!stringEndsWith(importer, TEST_SUFFIX)) {
        appendArrayValue(frontier, importer);
      } else if (objectHasOwn(classes, importer)) {
        orderedStringSetAdd(tests, importer);
      }
    }
  }
  return sortStrings(orderedStringSetValues(tests));
}
