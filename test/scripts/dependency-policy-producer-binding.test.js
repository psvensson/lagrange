// Binds the dependency policy to the graph PRODUCER.
//
// The classification tests next door are hermetic and fast, but they proved
// only the intended policy: the generator once carried its own duplicate
// specifier logic and never called classifyDependencySpecifier at all, so those
// tests passed against code the canonical graph never executed. This file
// closes that gap from the other side - it drives the real production
// entrypoint over a fixture containing every specifier form and asserts the
// edges and states that come out, so a divergence between the classifier's
// decision and the producer's behaviour fails here.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {refreshImportGraphReport} from
  '../../scripts/generate-global-owner-debt-inventory.js';

const UTF8 = 'utf8';
const SELF_NAME = 'fixture-self';
const DECLARED_PACKAGE = 'declared-pkg';
const OPTIONAL_PACKAGE = 'optional-ext';
const UNDECLARED_PACKAGE = 'undeclared-pkg';
const ENTRY = 'src/entry.js';
const LOCAL = 'src/local.js';
const OPTIONAL_OWNER = ENTRY;

function writeFile(root, relative, contents) {
  const destination = path.join(root, relative);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.writeFileSync(destination, contents, UTF8);
}

// An installed package inside the fixture. The optional external is installed
// DELIBERATELY: the whole contract is that a present package must not reach the
// canonical graph, so a fixture that omitted it would prove nothing.
function installPackage(root, name) {
  writeFile(root, `node_modules/${name}/package.json`,
    `${JSON.stringify({name, version: '1.0.0', main: 'index.js'})}\n`);
  writeFile(root, `node_modules/${name}/index.js`, 'export default 1;\n');
}

function buildFixture(imports, {installOptional = true} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-policy-producer-'));
  fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
  fs.mkdirSync(path.join(root, 'test'), {recursive: true});
  writeFile(root, 'package.json', `${JSON.stringify({
    name: SELF_NAME,
    version: '1.0.0',
    dependencies: {[DECLARED_PACKAGE]: '1.0.0'},
  })}\n`);
  writeFile(root, 'dependency-policy.json', `${JSON.stringify({
    optionalExternals: {
      [OPTIONAL_PACKAGE]: {owner: OPTIONAL_OWNER, reason: 'fixture'},
    },
  })}\n`);
  installPackage(root, DECLARED_PACKAGE);
  if (installOptional) installPackage(root, OPTIONAL_PACKAGE);
  installPackage(root, UNDECLARED_PACKAGE);
  writeFile(root, LOCAL, 'export const local = 1;\n');
  writeFile(root, ENTRY,
    `${imports.map((specifier) => `import '${specifier}';`).join('\n')}\n`);
  return root;
}

// Every specifier form the policy has to classify, in one entry file.
const ALL_FORMS = [
  './local.js', // relative
  DECLARED_PACKAGE, // declared dependency
  OPTIONAL_PACKAGE, // declared optional external
  SELF_NAME, // package self-reference
  'lagrange:cell', // component-model scheme, not an npm package
];

// The producer is always invoked with the working directory AT the root it is
// cruising (the CLI passes process.cwd()). Reproducing that here is not
// incidental: with a mismatched cwd, dependency-cruiser emits some modules
// relative to baseDir and others relative to cwd, so the same file arrives
// under two spellings and the module census double-counts it.
async function produce(root) {
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await refreshImportGraphReport(root, [ENTRY, LOCAL]);
  } finally {
    process.chdir(previous);
  }
}

function probesFrom(report) {
  return Object.fromEntries(
    report.resolverInputs.map((probe) => [probe.specifier, probe]));
}

test('the producer resolves a relative import to a real target node', async () => {
  const root = buildFixture(ALL_FORMS);
  try {
    const report = await produce(root);
    assert.ok(Object.hasOwn(report.degrees, LOCAL),
      'a relative import must become an ordinary node in the graph');
    assert.deepEqual(report.importers[LOCAL], [ENTRY]);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('the producer follows a declared package but never an optional external',
  async () => {
    const root = buildFixture(ALL_FORMS);
    try {
      const report = await produce(root);
      const declaredTarget = `node_modules/${DECLARED_PACKAGE}/index.js`;
      const optionalTarget = `node_modules/${OPTIONAL_PACKAGE}/index.js`;

      assert.ok(Object.hasOwn(report.degrees, declaredTarget),
        'a declared package resolves canonically and is part of the graph');
      assert.ok(Object.hasOwn(report.followedFileDigests, declaredTarget),
        'a declared package contributes a followed-file digest');

      // The optional external IS installed in this fixture, so every one of
      // these would hold the package if the policy were not applied.
      assert.ok(!Object.hasOwn(report.degrees, optionalTarget),
        'an optional external must never become a graph node');
      assert.ok(!Object.hasOwn(report.importers, optionalTarget),
        'an optional external must never collect importer evidence');
      assert.ok(!Object.hasOwn(report.followedFileDigests, optionalTarget),
        'an optional external must never contribute a followed-file digest');
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

test('every specifier form reaches the producer with its policy state',
  async () => {
    const root = buildFixture(ALL_FORMS);
    try {
      const probes = probesFrom(await produce(root));
      assert.equal(probes[OPTIONAL_PACKAGE]?.state, 'optional-external',
        'the optional external keeps its own semantic state');
      assert.equal(probes[DECLARED_PACKAGE]?.state, 'resolved');
      // A scheme import and a self-reference are legal but resolve to nothing
      // here; what matters is that neither is rejected as undeclared.
      assert.equal(probes['lagrange:cell']?.state, 'unresolved');
      assert.equal(probes[SELF_NAME]?.state, 'unresolved');
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

test('an optional external projects into the unresolved accounting', async () => {
  const root = buildFixture(ALL_FORMS);
  try {
    const report = await produce(root);
    const resolvedCount = Object.values(report.degrees)
      .reduce((total, degree) => total + degree.in, 0);
    assert.equal(report.edgeCount, resolvedCount + report.unresolvedCount,
      'every edge either reaches a node or counts as unresolved: an optional ' +
      'external has no target node, so it belongs to the unresolved term');
    assert.equal(Object.keys(report.degrees).length, report.moduleCount,
      'the module census must exclude the optional-external module too');
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

// The regression this exists for: an optional external is cruised under two
// different spellings depending on whether it is installed - as a real file
// under node_modules when present, and as the bare unresolvable specifier when
// absent. A producer that recognises only the installed spelling readmits the
// package as a graph node on exactly the clean checkouts the policy is meant to
// protect, so the two environments disagree again.
test('an optional external is excluded whether or not it is installed',
  async () => {
    const shapeOf = async (installOptional) => {
      const root = buildFixture(ALL_FORMS, {installOptional});
      try {
        const report = await produce(root);
        return {
          moduleCount: report.moduleCount,
          degrees: Object.keys(report.degrees).sort(),
          unresolvedCount: report.unresolvedCount,
          edgeCount: report.edgeCount,
          state: probesFrom(report)[OPTIONAL_PACKAGE]?.state,
        };
      } finally {
        fs.rmSync(root, {recursive: true, force: true});
      }
    };
    const installed = await shapeOf(true);
    const absent = await shapeOf(false);

    assert.ok(!installed.degrees.includes(OPTIONAL_PACKAGE),
      'the bare specifier must never be a node when the package IS installed');
    assert.ok(!absent.degrees.includes(OPTIONAL_PACKAGE),
      'nor when it is absent, where it is cruised as the bare specifier');
    assert.deepEqual(absent, installed,
      'the canonical graph must be identical whether or not an optional ' +
      'external happens to be installed - that is the entire contract');
  });

test('an installed but undeclared package fails the producer closed', async () => {
  const root = buildFixture([...ALL_FORMS, UNDECLARED_PACKAGE]);
  try {
    await assert.rejects(produce(root), (error) => {
      assert.match(error.message, /ambient undeclared dependency/);
      assert.match(error.message, new RegExp(UNDECLARED_PACKAGE));
      return true;
    }, 'a package that resolves only because it happens to be installed must ' +
       'stop the canonical graph rather than silently enter it');
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('a policy entry nobody imports is rejected as stale', async () => {
  const root = buildFixture(ALL_FORMS.filter((s) => s !== OPTIONAL_PACKAGE));
  try {
    await assert.rejects(produce(root), /stale optional-external policy entry/,
      'an exemption nobody uses is how a fail-closed list stops being closed');
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});
