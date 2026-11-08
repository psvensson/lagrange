// The canonical import graph describes REPOSITORY modules only.
//
// A module that resolves outside the checkout root - a node_modules entry
// symlinked to another directory on this machine - normalises to a `../...`
// spelling whose length depends on how deep the checkout sits. Admitting it
// as a node made two clones of one commit disagree on the snapshot digest, and
// a seal produced on a machine with such a link read as stale on every machine
// without it. These tests drive the real producer over fixture repositories
// whose packages are linked from outside the root and assert that the graph
// is the same as if the link were not there, at any depth.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {refreshImportGraphReport} from
  '../../scripts/generate-global-owner-debt-inventory.js';
import {OWNER_DEBT_RESOLVER_STATE} from
  '../../scripts/global-owner-debt-inventory/constants.js';

const OPTIONAL = 'boundary-optional';
const LINKED = 'boundary-linked';
const ENTRY = 'src/entry.js';
const SOURCES = [ENTRY];
const OUTSIDE_ROOT_KEY = /^(\.\.|\/)/;

function put(file, contents) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, contents);
}

// A package directory with an entry point, written wherever `directory` is.
function packageAt(directory, name) {
  put(path.join(directory, 'package.json'),
    `${JSON.stringify({name, version: '1.0.0', main: 'index.js'})}\n`);
  put(path.join(directory, 'index.js'), 'export default 1;\n');
}

// `outside` holds the package directories the fixture's node_modules link to.
// The optional external lives under an `outside/node_modules/` path, exactly
// like the shared install a worktree's node_modules points at.
function repository(root, outside, {linkOptional, nestedOptional = false}) {
  for (const directory of ['scripts', 'test']) {
    fs.mkdirSync(path.join(root, directory), {recursive: true});
  }
  put(path.join(root, 'package.json'), `${JSON.stringify({
    name: 'boundary-fixture',
    version: '1.0.0',
    dependencies: {[LINKED]: '1.0.0'},
  })}\n`);
  put(path.join(root, 'dependency-policy.json'), `${JSON.stringify({
    optionalExternals: {[OPTIONAL]: {owner: ENTRY, reason: 'fixture'}},
  })}\n`);
  put(path.join(root, ENTRY), `import '${OPTIONAL}';\nimport '${LINKED}';\n`);
  const optionalSource = path.join(outside, 'node_modules', OPTIONAL);
  const linkedSource = path.join(outside, LINKED);
  if (!fs.existsSync(optionalSource)) packageAt(optionalSource, OPTIONAL);
  if (!fs.existsSync(linkedSource)) packageAt(linkedSource, LINKED);
  fs.mkdirSync(path.join(root, 'node_modules'), {recursive: true});
  fs.symlinkSync(linkedSource, path.join(root, 'node_modules', LINKED), 'dir');
  if (linkOptional) {
    fs.symlinkSync(
      optionalSource, path.join(root, 'node_modules', OPTIONAL), 'dir');
  }
  if (nestedOptional) {
    packageAt(path.join(root, 'src', 'node_modules', OPTIONAL), OPTIONAL);
  }
  return root;
}

// The CLI always runs with the working directory at the cruised root.
async function produce(root) {
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await refreshImportGraphReport(root, SOURCES);
  } finally {
    process.chdir(previous);
  }
}

async function withWorkspace(body) {
  const workspace = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'import-graph-boundary-')));
  try {
    return await body(workspace);
  } finally {
    fs.rmSync(workspace, {recursive: true, force: true});
  }
}

function stateOf(report, specifier) {
  return report.resolverInputs.find((probe) => probe.specifier === specifier)
    ?.state;
}

test('an optional external linked from outside the root is never a node',
  () => withWorkspace(async (workspace) => {
    const outside = path.join(workspace, 'outside');
    const report = await produce(repository(
      path.join(workspace, 'linked', 'repo'), outside, {linkOptional: true}));
    for (const key of [
      ...Object.keys(report.degrees), ...Object.keys(report.importers)]) {
      assert.doesNotMatch(key, OUTSIDE_ROOT_KEY,
        `${key} lies outside the repository and must not be a graph node`);
    }
    assert.equal(stateOf(report, OPTIONAL),
      OWNER_DEBT_RESOLVER_STATE.optionalExternal);
    assert.equal(Object.keys(report.degrees).length, report.moduleCount,
      'the module census must not count modules outside the root');
  }));

test('a declared package resolving outside the root is a counted edge with ' +
  'its own state', () => withWorkspace(async (workspace) => {
  const report = await produce(repository(
    path.join(workspace, 'repo'), path.join(workspace, 'outside'),
    {linkOptional: true}));
  const probe = report.resolverInputs.find((p) => p.specifier === LINKED);
  assert.deepEqual(probe, {
    from: ENTRY,
    specifier: LINKED,
    state: OWNER_DEBT_RESOLVER_STATE.outsideRoot,
  });
  assert.deepEqual(Object.keys(report.degrees), [ENTRY]);
  assert.deepEqual(report.importers, {});
  assert.equal(report.degrees[ENTRY].out, 2);
  assert.equal(report.edgeCount, 2);
  assert.equal(report.unresolvedCount, 2,
    'an edge with no repository target belongs to the unresolved term');
}));

test('the snapshot does not depend on an outside link or on checkout depth',
  () => withWorkspace(async (workspace) => {
    const outside = path.join(workspace, 'outside');
    const linked = await produce(repository(
      path.join(workspace, 'linked', 'repo'), outside, {linkOptional: true}));
    const absent = await produce(repository(
      path.join(workspace, 'absent', 'repo'), outside, {linkOptional: false}));
    const deeper = await produce(repository(
      path.join(workspace, 'deeper', 'a', 'b', 'repo'), outside,
      {linkOptional: true}));
    assert.equal(linked.snapshotDigest, absent.snapshotDigest,
      'linking the optional external must not change the graph');
    assert.equal(deeper.snapshotDigest, linked.snapshotDigest,
      'a checkout two directories deeper must produce the same graph');
  }));

test('an optional external is recognised at any node_modules position',
  () => withWorkspace(async (workspace) => {
    const outside = path.join(workspace, 'outside');
    const nested = await produce(repository(
      path.join(workspace, 'nested', 'repo'), outside,
      {linkOptional: false, nestedOptional: true}));
    const absent = await produce(repository(
      path.join(workspace, 'absent', 'repo'), outside, {linkOptional: false}));
    assert.ok(!Object.keys(nested.degrees).some((key) =>
      key.includes(`node_modules/${OPTIONAL}`)),
    'a nested installation of an optional external must not be a node');
    // The nested package's files sit under src/, so they are producer inputs
    // and move that digest (and the snapshot that covers it); the graph
    // itself must not move.
    const {
      producerInputDigest: nestedInputs, snapshotDigest: nestedSnapshot,
      ...nestedGraph
    } = nested;
    const {
      producerInputDigest: absentInputs, snapshotDigest: absentSnapshot,
      ...absentGraph
    } = absent;
    assert.notEqual(nestedInputs, absentInputs);
    assert.notEqual(nestedSnapshot, absentSnapshot);
    assert.deepEqual(nestedGraph, absentGraph);
  }));
