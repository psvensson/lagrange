// Fleet discovery records what each machine can actually run, so placement
// can choose at run time from facts rather than from host names written into
// setup (owner direction, 2026-09-18). Every capability it reports is one a
// real run has tripped over: missing helm, psql or the pinned MovieLens
// dataset reds five files for setup reasons, and a node older than the
// engines floor cannot run the corpus at all.

import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {isDeepStrictEqual} from 'node:util';
import {parse} from 'yaml';

import {GIT_OUTPUT_BOUND, spawnGit} from '../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {runHarness} from '../../scripts/lab/harness.js';
import {capture, killGroup} from '../../scripts/lab/process.js';
import * as labProbe from '../../scripts/lab/probe.js';
import {
  CAPABILITY_SCRIPT, MOVIELENS_FILE, MOVIELENS_SHA256, READINESS, corpusReadiness,
  discoverFleet, fleetRequirement, formatFleet, parseCapability, probeTestCapability,
  recordFleet, runLabTest, runPlacedTestFiles,
} from '../../scripts/lab/probe.js';
import * as selector from '../../scripts/select-change-tests.js';
import {createEmptyState, loadState, saveState} from '../../scripts/lab/state.js';
import {nativeThermalFixture} from './native-thermal-fixture.js';

// What this process was started with; every scratch lab home restores it.
const ORIGINAL_LAB_HOME = process.env.LAGRANGE_LAB_HOME;
const LOCK = 'a'.repeat(64);
const FULL = [
  'repo_path=/srv/repo',
  'boot_id=boot-1',
  'cores=12',
  'mem_kib=16000000',
  'node_path=/opt/node/bin/node',
  'node_version=v22.22.3',
  'tool_git=yes', 'tool_docker=yes', 'tool_helm=no', 'tool_wasm-tools=no',
  'tool_psql=no', 'tool_g++=yes', 'tool_java=yes', 'tool_rg=no', 'tool_jq=yes',
  'docker_reachable=yes',
  'repo_present=yes',
  'repo_free_bytes=409600000',
  'repo_head=' + 'c'.repeat(40),
  `lock_graph_sha256=${LOCK}`,
  'node_modules=yes',
  'dependencies_current=yes',
  `movielens_sha256=${MOVIELENS_SHA256}`,
  'cpu_sample_ms=208',
].join('\n');
const REQUIREMENT = Object.freeze({lockGraphSha256: LOCK, nodeMinimum: '22.12.0'});
// A path with a single quote in it, and how the remote shell must receive it.
const QUOTED_PATH = '/srv/o\'brien/repo';
const QUOTED_PATH_REMOTE = 'sh -s -- \'/srv/o\'\\\'\'brien/repo\' \'22\'';
const BOOT_ID_FILE = '/proc/sys/kernel/random/boot_id';

function readiness(text, requirement = REQUIREMENT) {
  return corpusReadiness(parseCapability(text), requirement);
}

test('a probe transcript becomes a capability record', () => {
  const capability = parseCapability(FULL, 7);
  assert.equal(capability.probedAt, 7);
  assert.equal(capability.bootId, 'boot-1');
  assert.equal(capability.repoPath, '/srv/repo', 'which checkout was probed');
  assert.equal(capability.nodePath, '/opt/node/bin/node', 'the node a run must use');
  assert.equal(capability.cores, 12);
  assert.equal(capability.nodeVersion, 'v22.22.3');
  assert.deepEqual(capability.tools, {'git': true, 'docker': true, 'helm': false,
    'wasm-tools': false, 'psql': false, 'g++': true, 'java': true, 'rg': false, 'jq': true});
  assert.equal(capability.repo.present, true);
  assert.equal(capability.repo.lockGraphSha256, LOCK);
  assert.equal(capability.repo.dependenciesCurrent, true);
  assert.equal(capability.cpuSampleMs, 208);
  assert.equal(capability.repoFreeBytes, 409600000, 'room on the checkout filesystem');
  assert.deepEqual(parseCapability(FULL.replace(/\n/gu, '\r\n'), 7), capability,
    'CRLF transcripts read the same');
});

test('an unreported fact is unknown, never a capability the machine was not shown to have', () => {
  const capability = parseCapability(
    'garbage\n=no-key\ncores=\nnode_version=\ntool_psql=maybe\nrepo_present=yes\n');
  assert.equal(capability.cores, null);
  assert.equal(capability.nodeVersion, null);
  assert.equal(capability.tools.helm, null, 'not reported is not "absent" and not "present"');
  assert.equal(capability.tools.psql, null, 'a garbled answer is not "absent" either');
  assert.equal(capability.dockerReachable, null);
  assert.equal(capability.repo.nodeModules, null);
  assert.equal(capability.repo.dependenciesCurrent, null,
    'a dependency check that could not run is unknown, not "differs"');
  assert.equal(parseCapability('').repo.present, null);
  const noRepo = parseCapability('repo_present=no\nlock_graph_sha256=' + LOCK +
    '\ndependencies_current=yes');
  assert.equal(noRepo.repo.present, false);
  assert.equal(noRepo.repo.lockGraphSha256, null,
    'a dependency-graph digest is not believed when the repository is absent');
  assert.equal(noRepo.repo.dependenciesCurrent, null);
  assert.equal(parseCapability('repo_present=no\nrepo_free_bytes=5').repoFreeBytes, null,
    'free space of an absent checkout is not believed');
});

test('readiness names every reason a machine cannot run the corpus', () => {
  assert.deepEqual(readiness(FULL), {
    ready: true,
    missing: [],
    gaps: ['no-helm', 'no-wasm-tools', 'no-psql', 'no-rg'],
  }, 'tools only some files need are gaps, not disqualifications');
  assert.deepEqual(corpusReadiness(null, REQUIREMENT),
    {ready: false, missing: [READINESS.NOT_PROBED], gaps: []});
  for (const [version, ok] of [['v18.16.1', false], ['v22.11.9', false],
    ['v22.12.0', true], ['v22.23.2', true], ['v23.0.0', true], ['', false],
    ['nonsense', false], ['v23-garbage', false], ['v22.12x', false],
    ['v 22.12.0', false], ['v22.12', false], ['v22.12.0x', false]]) {
    const verdict = readiness(FULL.replace('v22.22.3', version));
    assert.equal(verdict.missing.includes(READINESS.NODE_TOO_OLD), !ok, `node ${version}`);
    assert.equal(verdict.ready, ok, `node ${version} decides readiness`);
  }
  // Each disqualifier alone, and each one alone makes the machine not ready.
  const disqualifiers = [
    [FULL.replace(`lock_graph_sha256=${LOCK}`, `lock_graph_sha256=${'b'.repeat(64)}`),
      [READINESS.DEPENDENCY_GRAPH_DIFFERS], 'another dependency graph means other packages'],
    [FULL.replace(`lock_graph_sha256=${LOCK}\n`, ''),
      [READINESS.DEPENDENCY_GRAPH_UNKNOWN], 'an unreported graph is unknown, not a match'],
    [FULL.replace('node_modules=yes', 'node_modules=no'),
      [READINESS.NO_DEPENDENCIES], 'no dependencies installed'],
    [FULL.replace('dependencies_current=yes', 'dependencies_current=no'),
      [READINESS.DEPENDENCIES_DIFFER], 'installed packages differ from the lockfile'],
    [FULL.replace('dependencies_current=yes\n', ''),
      [READINESS.DEPENDENCIES_UNKNOWN], 'unknown dependencies are not current ones'],
    ['repo_present=no\nnode_version=v22.23.2',
      [READINESS.NO_REPOSITORY], 'no checkout'],
  ];
  for (const [text, missing, why] of disqualifiers) {
    const verdict = readiness(text);
    assert.deepEqual(verdict.missing, missing, why);
    assert.equal(verdict.ready, false, why);
  }
  // A record stored before the graph was measured has a byte digest and no
  // graph field at all: its graph is unknown, not a different one.
  const stored = parseCapability(FULL);
  const {lockGraphSha256: _measured, ...oldRepo} = stored.repo;
  const oldShape = corpusReadiness({...stored, repo: {...oldRepo, lockSha256: LOCK}},
    REQUIREMENT);
  assert.deepEqual(oldShape.missing, [READINESS.DEPENDENCY_GRAPH_UNKNOWN],
    'an absent graph field is unknown');
  for (const lockGraphSha256 of [null, '', 'not-a-digest']) {
    const verdict = readiness(FULL, {...REQUIREMENT, lockGraphSha256});
    assert.ok(verdict.missing.includes(READINESS.NO_REQUIREMENT),
      `a requirement of ${JSON.stringify(lockGraphSha256)} is no requirement`);
    assert.equal(verdict.ready, false, 'nothing to compare is never a match');
  }
  for (const nodeMinimum of ['22', '>=22.12.0', '', null]) {
    const verdict = readiness(FULL, {...REQUIREMENT, nodeMinimum});
    assert.deepEqual(verdict.missing, [READINESS.NO_NODE_FLOOR],
      `an engines floor of ${JSON.stringify(nodeMinimum)} is named, not blamed on the node`);
    assert.equal(verdict.ready, false);
  }
  const noLockAnywhere = readiness(FULL.replace(`lock_graph_sha256=${LOCK}\n`, ''),
    {...REQUIREMENT, lockGraphSha256: null});
  assert.equal(noLockAnywhere.ready, false,
    'a machine without a lockfile does not match a controller without one');
  const noData = readiness(FULL.replace(`movielens_sha256=${MOVIELENS_SHA256}`,
    'movielens_sha256=' + 'd'.repeat(64)));
  assert.ok(noData.gaps.includes(READINESS.NO_DATASET),
    'a dataset with the wrong digest is not the pinned dataset');
  assert.equal(noData.ready, true, 'a dataset gap does not disqualify');
});

// --- readiness by dependency graph (lab-readiness-by-dependency-graph) -------
// A lab machine is ready for a commit when its installed packages match its
// own lockfile AND that lockfile describes the dependency graph the commit
// requires. The graph is the lockfile less the package's own release
// identity - the top-level `version` and `packages[""].version`, exactly what
// the selector strips - so a version-only release bump (0.2.5 -> 0.2.6 on
// 2026-09-30) leaves every installed machine ready.

const GRAPH_LOCK = Object.freeze({
  name: 'fixture',
  version: '0.2.5',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': {name: 'fixture', version: '0.2.5', license: 'MIT',
      dependencies: {a: '^1.0.0'}, engines: {node: '>=22.12.0'}},
    'node_modules/a': {version: '1.0.0',
      resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz',
      integrity: 'sha512-AAAA', license: 'MIT', os: ['darwin', 'linux']},
  },
});
const GRAPH_MANIFEST = '{"name":"fixture","engines":{"node":">=22.12.0"}}\n';

function lockVariant(mutate = () => {}, space = 2) {
  const lock = JSON.parse(JSON.stringify(GRAPH_LOCK));
  mutate(lock);
  return `${JSON.stringify(lock, null, space)}\n`;
}

function reversedKeys(value) {
  if (Array.isArray(value)) return value.map(reversedKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).reverse()
    .map((key) => [key, reversedKeys(value[key])]));
}

// The one line of the capability script that a lab machine runs to digest
// its lockfile, run exactly as the probe sends it.
function hostGraphDigest(dir, text) {
  const line = CAPABILITY_SCRIPT.split('\n')
    .find((entry) => entry.includes('say lock_graph_sha256'));
  assert.ok(line, 'the capability script digests the lockfile graph');
  fs.writeFileSync(path.join(dir, 'package-lock.json'), text);
  const result = spawnSync('sh', ['-c',
    `say() { printf "%s=%s\\n" "$1" "$2"; }\nrepo="$1"\n${line}`, 'sh', dir],
  {encoding: 'utf8', env: {...process.env, PATH: [path.dirname(process.execPath),
    process.env.PATH].join(path.delimiter)}});
  assert.equal(result.status, 0, result.stderr);
  const value = /^lock_graph_sha256=(.*)$/mu.exec(result.stdout)?.[1] ?? '';
  return value.length > 0 ? value : null;
}

// The controller's digest: the requirement read from a checkout.
function controllerGraphDigest(dir, text) {
  fs.writeFileSync(path.join(dir, 'package-lock.json'), text);
  fs.writeFileSync(path.join(dir, 'package.json'), GRAPH_MANIFEST);
  return fleetRequirement(dir).lockGraphSha256;
}

// A checkout as a lab machine holds it: a lockfile and an install that
// matches that lockfile, so only the graph comparison can disqualify it.
function installedCheckout(dir, text) {
  fs.mkdirSync(path.join(dir, '.git'), {recursive: true});
  fs.mkdirSync(path.join(dir, 'node_modules'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'package-lock.json'), text);
  const packages = {...JSON.parse(text).packages};
  delete packages[''];
  fs.writeFileSync(path.join(dir, 'node_modules', '.package-lock.json'),
    JSON.stringify({packages}));
  return dir;
}

// The whole capability script against a local checkout, with docker's bound
// stubbed out so nothing waits on a daemon.
async function probeCheckout(t, root, repo) {
  const {endpoint} = nativeThermalFixture(t);
  const stubBin = path.join(root, 'bin');
  fs.mkdirSync(stubBin, {recursive: true});
  fs.writeFileSync(path.join(stubBin, 'timeout'), '#!/bin/sh\nexit 124\n', {mode: 0o755});
  const env = {...process.env, NVM_DIR: path.join(root, 'no-nvm'), PATH: [stubBin,
    path.dirname(process.execPath), process.env.PATH].join(path.delimiter)};
  return probeTestCapability({repoPath: repo, nodeMajor: '', thermalEndpoint: endpoint,
    captureCommand: (command, args, options) =>
      capture(command, args, {...options, env, cwd: root})});
}

function tempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}

test('a lockfile that differs only in its release version is the same dependency graph',
  async (t) => {
    const root = tempDir(t, 'fleet-graph-');
    const controller = path.join(root, 'controller');
    fs.mkdirSync(controller);
    controllerGraphDigest(controller, lockVariant());
    const host = installedCheckout(path.join(root, 'host'), lockVariant((lock) => {
      lock.version = '0.2.6';
      lock.packages[''].version = '0.2.6';
    }));
    const capability = await probeCheckout(t, root, host);
    assert.equal(capability.repo.dependenciesCurrent, true, 'the host install is current');
    assert.deepEqual(corpusReadiness(capability, fleetRequirement(controller)).missing, [],
      'the release identity is not a dependency');
    assert.equal(corpusReadiness(capability, fleetRequirement(controller)).ready, true);
  });

test('a real dependency change is a different dependency graph, one change at a time',
  (t) => {
    const root = tempDir(t, 'fleet-graph-');
    const requirement = {lockGraphSha256: controllerGraphDigest(root, lockVariant()),
      nodeMinimum: '22.12.0'};
    const transcript = (digest) => FULL.replace(`lock_graph_sha256=${LOCK}`,
      `lock_graph_sha256=${digest ?? ''}`);
    const changes = [
      ['a package version', (lock) => {
        lock.packages['node_modules/a'].version = '1.0.1';
      }],
      ['a package integrity', (lock) => {
        lock.packages['node_modules/a'].integrity = 'sha512-BBBB';
      }],
      ['an added package', (lock) => {
        lock.packages['node_modules/b'] = {version: '2.0.0', integrity: 'sha512-CCCC'};
      }],
      ['the lockfileVersion', (lock) => {
        lock.lockfileVersion = 2;
      }],
      ['a root dependency range', (lock) => {
        lock.packages[''].dependencies.a = '^1.1.0';
      }],
      ['the root engines', (lock) => {
        lock.packages[''].engines = {node: '>=24.0.0'};
      }],
    ];
    for (const [what, mutate] of changes) {
      const verdict = corpusReadiness(parseCapability(
        transcript(hostGraphDigest(root, lockVariant(mutate)))), requirement);
      assert.deepEqual(verdict.missing, [READINESS.DEPENDENCY_GRAPH_DIFFERS], what);
      assert.equal(verdict.ready, false, `${what} disqualifies`);
    }
    const unreadable = corpusReadiness(parseCapability(
      transcript(hostGraphDigest(root, '{"packages":'))), requirement);
    assert.deepEqual(unreadable.missing, [READINESS.DEPENDENCY_GRAPH_UNKNOWN],
      'a lockfile the machine cannot read is unknown, a named state of its own');
  });

test('the controller and a lab machine compute one dependency-graph digest', (t) => {
  const root = tempDir(t, 'fleet-graph-');
  const base = lockVariant();
  // Equal to the base: the release identity, and how the JSON is written.
  const same = [
    ['the release version', lockVariant((lock) => {
      lock.version = '9.9.9';
      lock.packages[''].version = '9.9.9';
    })],
    ['only the top-level version', lockVariant((lock) => {
      lock.version = '9.9.9';
    })],
    ['only the root package version', lockVariant((lock) => {
      lock.packages[''].version = '9.9.9';
    })],
    ['no release version at all', lockVariant((lock) => {
      delete lock.version;
      delete lock.packages[''].version;
    })],
    ['minified', lockVariant(() => {}, 0).trim()],
    ['tab-indented with CRLF', lockVariant(() => {}, '\t').replace(/\n/gu, '\r\n')],
    ['every key in reverse order', `${JSON.stringify(reversedKeys(GRAPH_LOCK), null, 2)}\n`],
    ['an escaped spelling of the same string', base.replace('"license": "MIT"',
      '"license": "\\u004dIT"')],
    // JSON.parse reads both as the integer 3, as npm does.
    ['another spelling of the same integer', base.replace('"lockfileVersion": 3',
      '"lockfileVersion": 3.0')],
  ];
  // Different from the base: anything npm could install differently, and
  // anything else it reads (erring toward "differs").
  const different = [
    ['a package version', lockVariant((lock) => {
      lock.packages['node_modules/a'].version = '1.0.1';
    })],
    ['a package integrity', lockVariant((lock) => {
      lock.packages['node_modules/a'].integrity = 'sha512-BBBB';
    })],
    ['a package resolved URL', lockVariant((lock) => {
      lock.packages['node_modules/a'].resolved = 'https://mirror.example/a-1.0.0.tgz';
    })],
    ['an added package', lockVariant((lock) => {
      lock.packages['node_modules/b'] = {version: '2.0.0'};
    })],
    ['a removed package', lockVariant((lock) => {
      delete lock.packages['node_modules/a'];
    })],
    ['the lockfileVersion', lockVariant((lock) => {
      lock.lockfileVersion = 2;
    })],
    ['a root dependency range', lockVariant((lock) => {
      lock.packages[''].dependencies.a = '^1.1.0';
    })],
    ['the root engines', lockVariant((lock) => {
      lock.packages[''].engines = {node: '>=24.0.0'};
    })],
    ['root workspaces', lockVariant((lock) => {
      lock.packages[''].workspaces = ['packages/x'];
    })],
    ['a dev flag', lockVariant((lock) => {
      lock.packages['node_modules/a'].dev = true;
    })],
    ['the package name', lockVariant((lock) => {
      lock.name = 'renamed';
    })],
    ['the order of an array', lockVariant((lock) => {
      lock.packages['node_modules/a'].os = ['linux', 'darwin'];
    })],
  ];
  // No digest at all: not a lockfile, or a number that is not a safe integer
  // (JSON.parse may round it, so two different spellings could read equal).
  const unknown = [
    ['malformed JSON', '{"packages":'],
    ['no packages', lockVariant((lock) => {
      delete lock.packages;
    })],
    ['no root package', lockVariant((lock) => {
      delete lock.packages[''];
    })],
    ['a package record that is not an object', lockVariant((lock) => {
      lock.packages['node_modules/a'] = [];
    })],
    ['a fractional number', base.replace('"lockfileVersion": 3', '"lockfileVersion": 3.5')],
    ['an integer beyond the safe range',
      base.replace('"lockfileVersion": 3', '"lockfileVersion": 9007199254740993')],
  ];
  const digests = new Map();
  for (const [what, text] of [['the base', base], ...same, ...different, ...unknown]) {
    const host = hostGraphDigest(root, text);
    assert.equal(controllerGraphDigest(root, text), host,
      `${what}: the controller and a lab machine agree`);
    digests.set(what, host);
  }
  const baseDigest = digests.get('the base');
  assert.match(String(baseDigest), /^[0-9a-f]{64}$/u);
  for (const [what] of same) assert.equal(digests.get(what), baseDigest, `${what} is equal`);
  for (const [what] of different) {
    assert.match(String(digests.get(what)), /^[0-9a-f]{64}$/u, `${what} has a digest`);
    assert.notEqual(digests.get(what), baseDigest, `${what} differs`);
  }
  for (const [what] of unknown) assert.equal(digests.get(what), null, `${what} has none`);
  // The selector's lockfileDependencyGraph is the authority on what the
  // release identity is: equal digests exactly when its graphs are equal.
  const selectorGraph = (text) => selector.lockfileDependencyGraph(JSON.parse(text));
  for (const [what, text] of [...same, ...different]) {
    assert.equal(isDeepStrictEqual(selectorGraph(base), selectorGraph(text)),
      digests.get(what) === baseDigest, `${what}: the selector agrees`);
  }
  for (const [what, text] of unknown.slice(1, 4)) {
    assert.equal(selectorGraph(text), null, `${what}: the selector has no graph either`);
  }
});

// A git repository holding one commit of `files`, and that commit's sha.
function committedRepo(t, files) {
  const repo = tempDir(t, 'fleet-requirement-');
  const git = (...args) => {
    const result = spawnGit(['-C', repo, ...args], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q');
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(repo, file), text);
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'placed');
  return {repo, sha: git('rev-parse', 'HEAD')};
}

// The lab inventory, for one test, in a scratch home of its own (each one
// removed after the test). The value the test found is captured on its first
// call only and restored (or unset) by one hook: per-call hooks run in
// registration order, so a later one would restore a deleted earlier home.
const labHomeRestored = new WeakSet();
function scratchLabHome(t, inventory = null) {
  if (!labHomeRestored.has(t)) {
    labHomeRestored.add(t);
    const original = process.env.LAGRANGE_LAB_HOME;
    t.after(() => {
      if (original === undefined) delete process.env.LAGRANGE_LAB_HOME;
      else process.env.LAGRANGE_LAB_HOME = original;
    });
  }
  const home = tempDir(t, 'fleet-lab-home-');
  if (inventory !== null) fs.writeFileSync(path.join(home, 'inventory.json'), inventory);
  process.env.LAGRANGE_LAB_HOME = home;
  return home;
}

test('concurrent inventory saves in one process publish whole snapshots without temporary-file collisions', async (t) => {
  const home = scratchLabHome(t);
  const states = Array.from({length: 32}, (_unused, index) => ({
    ...createEmptyState(),
    controller: {revision: index, marker: `snapshot-${index}-`.repeat(128)},
  }));
  const results = await Promise.allSettled(states.map((state) => saveState(state)));
  assert.deepEqual(results.filter((result) => result.status === 'rejected'), [],
    'every concurrent writer must finish its own atomic replacement');
  const observed = await loadState({allowMissing: false});
  assert.deepEqual(observed, states[observed.controller.revision],
    'last completed replacement is one complete submitted snapshot, not merged or torn bytes');
  assert.deepEqual(fs.readdirSync(home), ['inventory.json'], 'writers leave no temporary files');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(path.join(home, 'inventory.json')).mode & 0o777, 0o600);
  }
});

const UNREADABLE_SHA = 'f'.repeat(40);
const HOUR_COSTS = (files) => files.map((file) => ({file, ms: 60 * 60 * 1000, jobs: 1}));

test('a placed commit is measured against its own lockfile and engines floor', async (t) => {
  const {repo, sha: placed} = committedRepo(t,
    {'package.json': GRAPH_MANIFEST, 'package-lock.json': lockVariant()});
  const placedDigest = fleetRequirement(repo).lockGraphSha256;
  // The working tree moves on: another dependency, and a floor no node meets.
  fs.writeFileSync(path.join(repo, 'package.json'),
    '{"name":"fixture","engines":{"node":">=99.0.0"}}\n');
  const moved = lockVariant((lock) => {
    lock.packages['node_modules/a'].version = '1.0.1';
  });
  installedCheckout(repo, moved);
  const commit = fleetRequirement(repo, placed);
  assert.equal(commit.nodeMinimum, '22.12.0', 'the placed commit\'s engines floor');
  assert.equal(commit.lockGraphSha256, placedDigest, 'the placed commit\'s graph');
  assert.equal(commit.source, placed, 'and it says which commit it describes');
  const tree = fleetRequirement(repo);
  assert.equal(tree.nodeMinimum, '99.0.0', 'with no commit: the working tree');
  assert.notEqual(tree.lockGraphSha256, placedDigest);
  assert.equal(tree.source, labProbe.REQUIREMENT_SOURCE.WORKING_TREE, 'and it says so');
  assert.throws(() => fleetRequirement(repo, UNREADABLE_SHA),
    {code: labProbe.DISCOVERY_FAILURE.REQUIREMENT_UNREADABLE},
    'a commit that cannot be read has no requirement, never the working tree\'s');

  // The real discovery of both placement paths, on an empty lab inventory:
  // the controller (this checkout, whose working tree holds the moved graph
  // and floor) is measured against the placed commit's requirement.
  const home = scratchLabHome(t);
  const {endpoint} = nativeThermalFixture(t);
  await saveState({...createEmptyState(), controller: {thermalEndpoint: endpoint}});
  const paths = [
    ['lab test', labProbe.labTestDeps({root: repo})],
    ['placement', labProbe.placementDeps({root: repo, planCosts: HOUR_COSTS,
      runLocal: () => 0, lastGreen: () => false})],
  ];
  for (const [what, deps] of paths) {
    const {fleet} = await deps.discover(placed);
    const controller = fleet.find((machine) => machine.controller);
    assert.ok(controller, `${what}: the controller is measured`);
    assert.ok(!controller.readiness.missing.includes(READINESS.NODE_TOO_OLD),
      `${what}: the floor is the placed commit's 22.12.0, not the tree's 99.0.0 ` +
      `(${controller.readiness.missing})`);
    assert.ok(controller.readiness.missing.includes(READINESS.DEPENDENCY_GRAPH_DIFFERS),
      `${what}: the graph is the placed commit's, not the tree's ` +
      `(${controller.readiness.missing})`);
    await assert.rejects(deps.discover(UNREADABLE_SHA),
      {code: labProbe.DISCOVERY_FAILURE.REQUIREMENT_UNREADABLE},
      `${what}: a commit that cannot be read fails discovery`);
  }

  // Both callers hand discovery the commit they place.
  const discovered = [];
  const stop = async (sha) => {
    discovered.push(sha);
    throw new Error('stop after discovery');
  };
  await assert.rejects(runLabTest({plan: [], commit: {sha: placed, release: () => {}},
    root: repo, write: () => {}}, {discover: stop, commitAt: () => null}),
  /stop after discovery/u);
  await runPlacedTestFiles(['a.test.js'], {env: {}, write: () => {},
    planCosts: HOUR_COSTS, runLocal: () => 0, commitAt: () => placed, discover: stop});
  assert.deepEqual(discovered, [placed, placed]);

  // A placed run whose requirement cannot be read stays unavailable;
  // an unreadable inventory is named as that, not as the requirement.
  const placedRun = async (sha) => {
    const lines = [];
    const status = await runPlacedTestFiles(['a.test.js'], {...labProbe.placementDeps({
      root: repo, planCosts: HOUR_COSTS,
      runLocal: () => assert.fail('discovery failure cannot start another execution')}),
    env: {}, write: (line) => lines.push(line), commitAt: () => sha});
    return {status, lines};
  };
  const noRequirement = await placedRun(UNREADABLE_SHA);
  assert.notEqual(noRequirement.status, 0, 'the files remain unavailable');
  assert.match(noRequirement.lines[0], new RegExp('^placement: unavailable - the placed commit\'s ' +
    `requirement could not be read: no requirement: cannot read package\\.json at ${
      UNREADABLE_SHA}$`, 'u'));
  fs.writeFileSync(path.join(home, 'inventory.json'), '{"version":');
  const noInventory = await placedRun(placed);
  assert.notEqual(noInventory.status, 0);
  assert.match(noInventory.lines[0],
    /^placement: unavailable - the lab inventory could not be read: /u);
});

test('the placed-commit witness leaves the lab home as it found it', () => {
  assert.equal(process.env.LAGRANGE_LAB_HOME, ORIGINAL_LAB_HOME,
    'LAGRANGE_LAB_HOME is the value this process started with (or unset)');
});

test('a scratch lab home restores the original once, however often a test asks', async (t) => {
  const homes = [];
  await t.test('three scratch homes in one test', (inner) => {
    homes.push(scratchLabHome(inner), scratchLabHome(inner, '{}'), scratchLabHome(inner));
    assert.equal(process.env.LAGRANGE_LAB_HOME, homes[2], 'the newest home is current');
  });
  assert.equal(process.env.LAGRANGE_LAB_HOME, ORIGINAL_LAB_HOME,
    'the original value, never an earlier scratch home');
  for (const home of homes) assert.ok(!fs.existsSync(home), `${home} is removed`);
});

test('a placed commit\'s lockfile is read whole up to a named bound', (t) => {
  const bound = GIT_OUTPUT_BOUND.COMMAND;
  // Past spawnSync's 1 MiB default, the size the lockfile is growing toward.
  const large = lockVariant((lock) => {
    lock.packages['node_modules/a'].description = 'x'.repeat(2 * 1024 * 1024);
  });
  const within = committedRepo(t, {'package.json': GRAPH_MANIFEST, 'package-lock.json': large});
  const requirement = fleetRequirement(within.repo, within.sha);
  assert.ok(Buffer.byteLength(large) > 1024 * 1024 && Buffer.byteLength(large) < bound);
  assert.match(String(requirement.lockGraphSha256), /^[0-9a-f]{64}$/u,
    'a lockfile past 1 MiB still yields the placed commit\'s requirement');
  assert.equal(requirement.lockGraphSha256, fleetRequirement(within.repo).lockGraphSha256);
  const beyond = committedRepo(t, {'package.json': GRAPH_MANIFEST,
    'package-lock.json': 'x'.repeat(bound + 1)});
  assert.throws(() => fleetRequirement(beyond.repo, beyond.sha), (error) => {
    assert.equal(error.code, labProbe.DISCOVERY_FAILURE.REQUIREMENT_TOO_LARGE);
    assert.equal(error.message, `package-lock.json at ${beyond.sha} is larger than the ` +
      `requirement read bound of ${bound} bytes`);
    return true;
  }, 'beyond the bound: a failure of its own, never a silent null or an unreadable commit');
});

test('a version-only release bump of this repository leaves the fleet ready', async (t) => {
  // The incident: main's lockfile changed only its two release-version
  // strings and every lab machine read `lockfile-differs`.
  const root = tempDir(t, 'fleet-incident-');
  const lockText = fs.readFileSync(path.join(process.cwd(), 'package-lock.json'), 'utf8');
  const {version} = JSON.parse(lockText);
  const [major, minor, patch] = version.split('.').map(Number);
  const previous = `${major}.${minor}.${patch > 0 ? patch - 1 : patch + 1}`;
  let replaced = 0;
  const before = lockText.replace(new RegExp(`"version": "${version.replace(/\./gu, '\\.')}"`,
    'gu'), (match) => (replaced += 1) <= 2 ? `"version": "${previous}"` : match);
  const changedLines = lockText.split('\n')
    .filter((line, index) => line !== before.split('\n')[index]);
  assert.equal(changedLines.length, 2, 'exactly the two release-version lines differ');
  const controller = path.join(root, 'controller');
  fs.mkdirSync(controller);
  fs.writeFileSync(path.join(controller, 'package-lock.json'), lockText);
  fs.copyFileSync(path.join(process.cwd(), 'package.json'),
    path.join(controller, 'package.json'));
  const host = installedCheckout(path.join(root, 'host'), before);
  const capability = await probeCheckout(t, root, host);
  const verdict = corpusReadiness(capability, fleetRequirement(controller));
  assert.equal(capability.repo.dependenciesCurrent, true);
  assert.equal(verdict.missing.length, 0,
    `a machine installed from the previous release is ready: ${verdict.missing}`);
  assert.equal(verdict.ready, true);
});

test('the pinned dataset is the one the canary checks before its corpus', () => {
  const workflow = parse(fs.readFileSync(
    path.join(process.cwd(), '.github/workflows/full-corpus-canary.yml'), 'utf8'));
  const steps = Object.values(workflow.jobs).flatMap((job) => job.steps || []);
  const fetch = steps.find((step) => /MovieLens/u.test(String(step.name)));
  assert.ok(fetch, 'the canary fetches the dataset');
  assert.ok(fetch.run.includes(MOVIELENS_SHA256), 'with the same digest');
  assert.ok(fetch.run.includes(MOVIELENS_FILE), 'for the same file');
});

test('discovery probes every machine and recognises one reached twice', async (t) => {
  const {endpoint} = nativeThermalFixture(t);
  const seen = [];
  // Two machines installed from one image share /etc/machine-id; the boot id
  // tells them apart, and it is what discovery keys on.
  const identities = {
    'ctl': 'boot-A', 'peer@one': 'boot-B', 'peer@self': 'boot-A', 'peer@two': 'boot-B',
    'peer@clone': 'boot-C',
  };
  const probe = async ({sshTarget, repoPath, nodeMajor, thermalEndpoint}) => {
    seen.push({sshTarget, repoPath, nodeMajor, thermalEndpoint});
    if (sshTarget === 'peer@down') throw new Error('ssh: connect refused');
    return parseCapability(FULL.replace('boot_id=boot-1',
      `boot_id=${identities[sshTarget ?? 'ctl']}\nmachine_id=cloned-image`));
  };
  const fleet = await discoverFleet({
    nodes: [
      {name: 'one', ssh: 'peer@one'},
      {name: 'self', ssh: 'peer@self', repoPath: '/srv/repo'},
      {name: 'two', ssh: 'peer@two'},
      {name: 'clone', ssh: 'peer@clone'},
      {name: 'down', ssh: 'peer@down'},
      {name: 'no-ssh'},
    ].map((node) => ({...node, thermalEndpoint: endpoint})),
    controllerThermalEndpoint: endpoint,
    controllerRepoPath: '/here',
    ...REQUIREMENT,
    probe,
  });
  assert.deepEqual(fleet.map((entry) => entry.name),
    ['(controller)', 'one', 'self', 'two', 'clone', 'down'],
    'a node without ssh is not probed');
  assert.equal(fleet[0].controller, true);
  assert.equal(seen[0].sshTarget, null, 'the controller is probed locally');
  assert.equal(seen[0].repoPath, '/here');
  assert.ok(seen.every((call) => call.thermalEndpoint === endpoint),
    'controller and peer probes receive the explicitly configured native endpoint');
  assert.ok(seen.every((call) => call.nodeMajor === '22'),
    'every machine activates the engines-floor major, written down once');
  assert.equal(seen.find((call) => call.sshTarget === 'peer@one').repoPath,
    '~/projects/lagrange', 'a node without a recorded path gets the convention');
  assert.equal(seen.find((call) => call.sshTarget === 'peer@self').repoPath, '/srv/repo');
  const byName = Object.fromEntries(fleet.map((entry) => [entry.name, entry]));
  assert.equal(byName.self.sameMachineAs, '(controller)',
    'the controller listed in the inventory is one machine, not two');
  assert.equal(byName.two.sameMachineAs, 'one');
  assert.equal(byName.one.sameMachineAs, null);
  assert.equal(byName.clone.sameMachineAs, null,
    'a shared machine-id does not merge two running machines');
  assert.equal(byName.down.error, 'ssh: connect refused');
  assert.deepEqual(byName.down.readiness,
    {ready: false, missing: [READINESS.NOT_PROBED], gaps: []},
    'an unreachable machine is reported, never assumed ready');

  const lines = formatFleet(fleet);
  assert.match(lines[0], /^\(controller\) +cores=12 speed x1\.00 ready /u);
  assert.match(lines[2], / same machine as \(controller\)/u);
  assert.match(lines[5], /^down +cores=\? speed x\? unreachable: ssh: connect refused$/u);

  const state = {controller: {}, nodes: {
    one: {name: 'one', testCapability: {cores: 99}},
    down: {name: 'down', testCapability: {cores: 4}, lastProbeFailure: {at: 1, error: 'x'}},
    clone: {name: 'clone', lastProbeFailure: {at: 1, error: 'old'}},
  }};
  recordFleet(state, fleet, 1234);
  assert.equal(state.controller.testCapability.bootId, 'boot-A');
  assert.equal(state.nodes.one.testCapability.cores, 12, 'fresh facts replace old ones');
  assert.deepEqual(state.nodes.down.testCapability, {cores: 4},
    'an unreachable machine keeps its last known facts');
  assert.deepEqual(state.nodes.down.lastProbeFailure,
    {at: 1234, error: 'ssh: connect refused'},
    'and records that they were not confirmed now');
  assert.equal(state.nodes.clone.lastProbeFailure, undefined,
    'an answer clears the failure it had');
  assert.equal(state.nodes.self, undefined, 'discovery never invents inventory entries');
});

test('the controller is probed by the same script it sends to a lab node', async (t) => {
  const {endpoint} = nativeThermalFixture(t);
  const capability = await probeTestCapability({repoPath: process.cwd(),
    thermalEndpoint: endpoint});
  assert.deepEqual(capability.thermalEndpoint, endpoint);
  assert.equal(capability.thermalStatus, 0);
  assert.equal(capability.thermalObservation.outcome, 'READY');
  assert.equal(capability.thermalDecision.outcome, 'READY');
  assert.ok(capability.bootId, 'a machine identity');
  if (fs.existsSync(BOOT_ID_FILE)) {
    assert.equal(capability.bootId, fs.readFileSync(BOOT_ID_FILE, 'utf8').trim(),
      'the kernel per-boot id, not /etc/machine-id');
  }
  assert.ok(capability.cores > 0);
  assert.match(String(capability.nodeVersion), /^v\d+\.\d+\.\d+$/u);
  assert.ok(path.isAbsolute(String(capability.nodePath)), 'the absolute node it used');
  assert.equal(capability.repoPath, process.cwd());
  assert.ok(capability.cpuSampleMs > 0, 'a speed sample');
  assert.equal(capability.repo.present, true,
    'a linked worktree has a .git FILE, and still counts as a repository');

  const calls = [];
  await probeTestCapability({
    sshTarget: 'peer@lab',
    repoPath: QUOTED_PATH,
    nodeMajor: '22',
    thermalEndpoint: endpoint,
    captureCommand: async (command, args, options) => {
      calls.push({command, args, stdin: options.stdin, timeoutMs: options.timeoutMs});
      return `cores=1\nthermal_status=0\nthermal_json=${
        JSON.stringify(capability.thermalObservation)}`;
    },
  });
  assert.equal(calls[0].command, 'ssh');
  assert.equal(calls[0].args.at(-1), `${QUOTED_PATH_REMOTE} '${endpoint.python}' ` +
    `'${endpoint.entry}' '${endpoint.config}'`,
    'the remote path is quoted for the remote shell, whatever it contains');
  assert.ok(calls[0].args.includes('ConnectTimeout=5'),
    'an address that answers nothing cannot hold discovery');
  assert.ok(calls[0].timeoutMs > 0, 'nor can a machine that answers and then hangs');
  assert.match(calls[0].stdin, /repo_present yes/u, 'the same script travels to the node');
  await assert.rejects(probeTestCapability({sshTarget: '-oProxyCommand=x', repoPath: '/r',
    thermalEndpoint: endpoint,
    captureCommand: async () => assert.fail('never run')}), /begins with "-"/u,
  'a target ssh would read as an option is refused');
});

test('the probe observes a checkout and never acts on it', async (t) => {
  const {endpoint} = nativeThermalFixture(t);
  // A repository path with a backslash (dash's echo rewrote those) and a
  // stub nvm that records what it was handed: sourced with the caller's
  // arguments, nvm.sh would act on a path such as `--install`.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-probe-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const repo = path.join(root, 'a\\b');
  const nvmDir = path.join(root, 'nvm');
  fs.mkdirSync(path.join(repo, '.git'), {recursive: true});
  fs.mkdirSync(path.join(repo, 'node_modules'), {recursive: true});
  fs.mkdirSync(nvmDir);
  fs.writeFileSync(path.join(nvmDir, 'nvm.sh'),
    'printf "%s\\n" "$#" > "$NVM_DIR/argument-count"\n' +
    'nvm() { printf "%s\\n" "$*" > "$NVM_DIR/nvm-call"; }\n');
  // A `timeout` that records how it was asked to bound docker, so the bound
  // is witnessed without waiting it out.
  const stubBin = path.join(root, 'bin');
  fs.mkdirSync(stubBin);
  fs.writeFileSync(path.join(stubBin, 'timeout'),
    '#!/bin/sh\nprintf "%s\\n" "$*" > "$NVM_DIR/timeout-call"\nexit 124\n', {mode: 0o755});
  const lock = {packages: {'': {name: 'x'},
    'node_modules/a': {version: '1.0.0'},
    'node_modules/opt': {version: '3.0.0', optional: true}}};
  const lockText = JSON.stringify(lock);
  fs.writeFileSync(path.join(repo, 'package-lock.json'), lockText);
  const env = {...process.env, NVM_DIR: nvmDir, PATH: [stubBin,
    path.dirname(process.execPath), process.env.PATH].join(path.delimiter)};
  const probeWith = (installed, repoPath = repo) => {
    const hidden = path.join(repo, 'node_modules', '.package-lock.json');
    if (installed) fs.writeFileSync(hidden, JSON.stringify({packages: installed}));
    else fs.rmSync(hidden, {force: true});
    // A major no machine has: the stub only records what it was asked.
    return probeTestCapability({repoPath, nodeMajor: '99', thermalEndpoint: endpoint,
      captureCommand: (command, args, options) =>
        capture(command, args, {...options, env, cwd: root})});
  };

  const matching = await probeWith({'node_modules/a': {version: '1.0.0'}});
  assert.equal(fs.readFileSync(path.join(nvmDir, 'argument-count'), 'utf8').trim(), '0',
    'nvm.sh is sourced with no arguments');
  assert.equal(fs.readFileSync(path.join(nvmDir, 'nvm-call'), 'utf8').trim(), 'use 99',
    'and activates the major it was given');
  assert.equal(fs.readFileSync(path.join(nvmDir, 'timeout-call'), 'utf8').trim(),
    '10 docker info', 'docker is asked under a bound');
  assert.equal(matching.dockerReachable, false, 'and a timed-out docker is not reachable');
  assert.equal(matching.repoPath, repo, 'a backslash survives the transcript');
  assert.match(String(matching.repo.lockGraphSha256), /^[0-9a-f]{64}$/u,
    'and the lockfile\'s dependency graph is digested');
  assert.equal(matching.repo.dependenciesCurrent, true,
    'every required package at its locked version; an optional one may be absent');
  assert.equal((await probeWith({'node_modules/a': {version: '1.0.1'},
    'node_modules/opt': {version: '3.0.0'}})).repo.dependenciesCurrent, false,
  'a package at another version differs');
  assert.equal((await probeWith({'node_modules/opt': {version: '3.0.0'}}))
    .repo.dependenciesCurrent, false, 'a missing required package differs');
  assert.equal((await probeWith(null)).repo.dependenciesCurrent, null,
    'no install record is unknown');

  const flag = await probeWith(null, '--install');
  assert.equal(flag.repo.present, false, 'a path that is a flag is only a path');
  assert.equal(fs.readFileSync(path.join(nvmDir, 'argument-count'), 'utf8').trim(), '0',
    'and never reaches nvm');
  // A checkout whose (relative) path is itself a node option: node must read
  // it as the path it is, never as code to evaluate.
  const evalPath = '--eval=require("fs").writeFileSync(process.env.NVM_DIR+"-pwned","x")';
  fs.mkdirSync(path.join(root, evalPath, '.git'), {recursive: true});
  fs.writeFileSync(path.join(root, evalPath, 'package-lock.json'), lockText);
  const evaluated = await probeWith(null, evalPath);
  assert.equal(evaluated.repo.present, true);
  assert.equal(fs.existsSync(`${nvmDir}-pwned`), false, 'the probe ran nothing it was handed');
});

test('a capture deadline kills the whole process group', async (t) => {
  // A shell that backgrounds its real work: killing the shell alone leaves
  // the grandchild running and holding the pipes (verifier round 3).
  const pidFile = path.join(os.tmpdir(), `fleet-deadline-${process.pid}`);
  t.after(() => fs.rmSync(pidFile, {force: true}));
  const started = Date.now();
  await assert.rejects(capture('sh', ['-c', `sleep 5 & echo $! > '${pidFile}'; wait`],
    {timeoutMs: 300}), /timed out after 300 ms/u);
  assert.ok(Date.now() - started < 2000, 'the deadline answers on time');
  const grandchild = Number(fs.readFileSync(pidFile, 'utf8'));
  assert.ok(grandchild > 0);
  let alive = true;
  for (let poll = 0; poll < 50 && alive; poll += 1) {
    try {
      process.kill(grandchild, 0);
      await new Promise((resolve) => setTimeout(resolve, 20));
    } catch {
      alive = false;
    }
  }
  assert.equal(alive, false, 'the hung grandchild is killed, not left running');
});

// ---------------------------------------------------------------------------
// Sharing the lab between agents and projects (owner directive 2026-09-23):
// every lab host has one machine-wide lock and a holder record beside it.
// Discovery reads both without taking the lock, the fleet shows who holds a
// machine, and a formation holds every node it uses before any node starts.

const HOLDER = Object.freeze({project: 'other-project', agent: 'codex:task-7',
  controller: 'laptop', purpose: 'formation:rolling-restart', sha: 'e'.repeat(40),
  startedAt: '2026-09-23T10:00:00Z', expectedMinutes: 25, pid: 4242});
const HELD_BY = 'held by codex:task-7 (other-project, formation:rolling-restart) since ' +
  '2026-09-23T10:00:00Z';
const MINUTE = 60000;

function fleetWithLock(lockLines) {
  return [{name: 'alpha', controller: false, error: null, sameMachineAs: null,
    capability: parseCapability(`${FULL}\n${lockLines}`), readiness: readiness(FULL)}];
}

test('the fleet shows who holds each machine, from its lock and its holder record', () => {
  const record = `machine_holder=${JSON.stringify(HOLDER)}`;
  const busy = fleetWithLock(`machine_lock=held\n${record}\nmachine_holder_pid_alive=yes`);
  assert.match(formatFleet(busy)[0], new RegExp(` \\| busy: ${HELD_BY.replace(/[()]/gu, '\\$&')}` +
    ', expected 25 min$', 'u'), 'held, with the record of who holds it');
  assert.deepEqual(JSON.parse(JSON.stringify(busy))[0].capability.machineLock.holder, HOLDER,
    '--json carries the holder record verbatim');
  assert.match(formatFleet(fleetWithLock('machine_lock=free'))[0], / \| free$/u);
  assert.match(formatFleet(fleetWithLock(
    `machine_lock=free\n${record}\nmachine_holder_pid_alive=no`))[0],
  / \| stale record \(pid dead\)$/u, 'a record without the lock is evidence, not a lock');
  assert.match(formatFleet(fleetWithLock('machine_lock=held'))[0],
    / \| busy: held \(no holder record\)$/u, 'held without a record is still held');
});

// A lock file in a scratch directory, held by a process group of its own.
async function holdScratchLock(t, lock) {
  const holder = spawn('flock', [lock, 'sleep', '60'], {stdio: 'ignore', detached: true});
  const release = async () => {
    try {
      process.kill(-holder.pid, 'SIGKILL');
    } catch {
      // already gone
    }
    if (holder.exitCode === null && holder.signalCode === null) {
      await new Promise((resolve) => holder.once('exit', resolve));
    }
  };
  t.after(release);
  for (let poll = 0; poll < 600 && lockFree(lock); poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return {pid: holder.pid, release};
}

function lockFree(lock) {
  return spawnSync('flock', ['-n', lock, 'true']).status === 0;
}

function scratchLabLock(t, extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-lock-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return {dir, lock: path.join(dir, 'machine.lock'), holder: path.join(dir, 'machine.holder.json'),
    env: {...process.env, LAB_LOCK_DIR: dir, ...extraEnv}};
}

test('the probe reads the machine lock and its holder record and never takes the lock',
  async (t) => {
    const lab = scratchLabLock(t);
    const {endpoint} = nativeThermalFixture(t);
    const probeHere = () => probeTestCapability({repoPath: process.cwd(),
      thermalEndpoint: endpoint,
      captureCommand: (command, args, options) => capture(command, args, {...options,
        env: lab.env})});
    assert.equal((await probeHere()).machineLock?.state, 'free', 'no lock file: free');
    assert.equal(fs.existsSync(lab.lock), false, 'and the probe created nothing');
    const other = await holdScratchLock(t, lab.lock);
    // Another project may write its record over several lines.
    fs.writeFileSync(lab.holder, `${JSON.stringify({...HOLDER, pid: other.pid}, null, 2)}\n`);
    const busy = (await probeHere()).machineLock;
    assert.equal(busy.state, 'busy');
    assert.deepEqual(busy.holder, {...HOLDER, pid: other.pid}, 'the record as its holder wrote it');
    assert.equal(lockFree(lab.lock), false, 'the probe left the lock with its holder');
    await other.release();
    const stale = (await probeHere()).machineLock;
    assert.equal(stale.state, 'stale-record', 'a record whose lock is free is stale');
    assert.equal(stale.holderPidAlive, false, 'and its pid is measured dead');
  });

test('a formation refuses, typed, when a node is held, before any node starts', async () => {
  const events = [];
  const hold = (machine, options) => {
    events.push(`hold ${machine.name} ${options.purpose}`);
    return {
      outcome: Promise.resolve(machine.name === 'b' ? {state: 'busy', holder: HOLDER} :
        {state: 'held'}),
      release: async () => events.push(`release ${machine.name}`),
    };
  };
  await assert.rejects(runHarness({
    nodes: [{name: 'b', ssh: 'lab@b.invalid', ip: '192.0.2.2'},
      {name: 'a', ssh: 'lab@a.invalid', ip: '192.0.2.1'}],
    scenario: 'rolling-restart', verbose: false, hold,
  }), {message: `harness: node b busy, ${HELD_BY}`});
  assert.deepEqual(events, ['hold a formation:rolling-restart', 'hold b formation:rolling-restart',
    'release a', 'release b'], 'every node is held in name order first, and a refusal ' +
    'releases every hold it took');
});

test('a formation acquires its own process group, holds a node and releases it', async (t) => {
  const {holdLabMachine} = labProbe;
  assert.equal(typeof holdLabMachine, 'function',
    'the one owner of the lab convention holds a node for a formation');
  const lab = scratchLabLock(t, {LAGRANGE_LAB_AGENT: 'claude:formation-witness'});
  const here = {name: 'here', sshTarget: null};
  const first = holdLabMachine(here, {waitMs: 2000, purpose: 'formation:rolling-restart',
    expectedMs: 30 * MINUTE, env: lab.env});
  t.after(() => first.release());
  assert.deepEqual(await first.outcome, {state: 'held'});
  const record = JSON.parse(fs.readFileSync(lab.holder, 'utf8'));
  const group = spawnSync('ps', ['-o', 'pgid=', '-p', String(record.pid)], {encoding: 'utf8'});
  assert.equal(group.status, 0, group.stderr);
  assert.equal(Number(group.stdout.trim()), record.pid,
    'the acquired hold session owns the exact group its bounded release may signal');
  assert.deepEqual([record.project, record.agent, record.purpose, record.expectedMinutes],
    ['lagrange', 'claude:formation-witness', 'formation:rolling-restart', 30]);
  assert.equal(lockFree(lab.lock), false, 'the node is held for as long as the session is open');
  const second = holdLabMachine(here, {waitMs: 1000, purpose: 'formation:other',
    expectedMs: MINUTE, env: lab.env});
  assert.deepEqual(await second.outcome, {state: 'busy', holder: record},
    'a second formation waits its budget and is refused, naming the holder');
  await second.release();
  await first.release();
  assert.equal(fs.existsSync(lab.holder), false, 'released: the record is gone');
  assert.equal(lockFree(lab.lock), true, 'and the machine is free');
});

const GROUP_CONTROL_BOUND_MS = 5000;
const GROUP_CONTROL_POLL_MS = 20;

function boundedGroupControl(promise, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: finite control bound expired`)),
      GROUP_CONTROL_BOUND_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function groupControlMarker(file, terminal) {
  const deadline = Date.now() + GROUP_CONTROL_BOUND_MS;
  while (!fs.existsSync(file)) {
    assert.equal(terminal(), null,
      `the owner stopped the child before ${file}: ${JSON.stringify(terminal())}`);
    if (Date.now() >= deadline) assert.fail(`the live child never acknowledged ${file}`);
    await new Promise((resolve) => setTimeout(resolve, GROUP_CONTROL_POLL_MS));
  }
}

// Real finite children make group absence and continued execution observable.
// Cleanup uses the acquisition's declared detached state, never a failed
// group signal as permission to target a different process. No lab service
// or production execution decision is replaced by this fixture.
async function signalGroupFixture(t, {detached, missingExecutable = false}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-group-custody-')));
  let child = null;
  let terminal = null;
  let closed = Promise.resolve();
  t.after(async () => {
    const errors = [];
    if (Number.isInteger(child?.pid) && child.pid > 0 && !terminal) {
      try {
        process.kill(detached ? -child.pid : child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') errors.push(error);
      }
    }
    try {
      await boundedGroupControl(closed, 'owned fixture child closure');
    } catch (error) {
      errors.push(error);
      child?.unref();
    }
    try {
      fs.rmSync(root, {recursive: true, force: true});
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) throw new AggregateError(errors, 'finite process fixture cleanup failed');
  });
  const source = [
    'import fs from \'node:fs\';',
    'import path from \'node:path\';',
    'const root = process.argv[1];',
    'process.on(\'SIGUSR1\', () => fs.writeFileSync(path.join(root, \'ack\'), \'still running\'));',
    'setTimeout(() => {',
    '  fs.writeFileSync(path.join(root, \'natural-completion\'), \'not cancellation\');',
    '  process.exit(0);',
    '}, 10000);',
    'fs.writeFileSync(path.join(root, \'ready.tmp\'), JSON.stringify({pid: process.pid}));',
    'fs.renameSync(path.join(root, \'ready.tmp\'), path.join(root, \'ready\'));',
  ].join('\n');
  const env = gitProcessEnvironment();
  delete env.NODE_TEST_CONTEXT;
  child = spawn(missingExecutable ? path.join(root, 'unavailable-executable') : process.execPath,
    missingExecutable ? [] : ['--input-type=module', '-e', source, root],
    {env, detached, stdio: 'ignore'});
  let spawnError = null;
  closed = new Promise((resolve) => {
    child.once('error', (error) => {
      spawnError = error;
    });
    child.once('close', (code, signal) => {
      terminal = {code, signal, error: spawnError?.message || null};
      resolve(terminal);
    });
  });
  if (missingExecutable) await boundedGroupControl(closed, 'failed spawn closure');
  else {
    await groupControlMarker(path.join(root, 'ready'), () => terminal);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'ready'), 'utf8')).pid, child.pid);
  }
  return {child, root, terminal: () => terminal,
    acknowledge: async () => {
      assert.doesNotThrow(() => process.kill(child.pid, 'SIGUSR1'),
        'the direct child remains available for its actual post-signal acknowledgement');
      await groupControlMarker(path.join(root, 'ack'), () => terminal);
      assert.equal(fs.readFileSync(path.join(root, 'ack'), 'utf8'), 'still running');
      assert.equal(fs.existsSync(path.join(root, 'natural-completion')), false);
    }};
}

test('killGroup never substitutes a live direct child for an absent owned group',
  {timeout: 15000}, async (t) => {
    const fixture = await signalGroupFixture(t, {detached: false});
    const group = spawnSync('ps', ['-o', 'pgid=', '-p', String(fixture.child.pid)],
      {encoding: 'utf8'});
    assert.equal(group.status, 0, group.stderr);
    assert.notEqual(Number(group.stdout.trim()), fixture.child.pid,
      'this acquired direct child is deliberately not a group leader');
    assert.throws(() => process.kill(-fixture.child.pid, 0), {code: 'ESRCH'},
      'the negative group address is genuinely absent before the owner is called');
    killGroup(fixture.child);
    await fixture.acknowledge();
  });

test('killGroup preserves a group signalling refusal without killing the direct child',
  {timeout: 15000}, async (t) => {
    const fixture = await signalGroupFixture(t, {detached: true});
    assert.doesNotThrow(() => process.kill(-fixture.child.pid, 0),
      'the real detached group is present before the injected signal refusal');
    const refusal = Object.assign(new Error('finite group signal permission refusal'),
      {code: 'EPERM'});
    const signal = process.kill;
    // Only the OS signal response for this exact acquired group is replaced.
    // The actual live child, its acknowledgement and all cleanup remain real.
    process.kill = function(pid, name) {
      if (pid === -fixture.child.pid && name === 'SIGKILL') throw refusal;
      return signal.call(process, pid, name);
    };
    try {
      assert.throws(() => killGroup(fixture.child), (error) => error === refusal,
        'the first signal refusal remains explicit instead of selecting another target');
    } finally {
      process.kill = signal;
    }
    await fixture.acknowledge();
  });

test('killGroup refuses a failed spawn with no acquired positive process identity',
  {timeout: 10000}, async (t) => {
    const fixture = await signalGroupFixture(t, {detached: true, missingExecutable: true});
    assert.equal(fixture.child.pid, undefined);
    assert.match(fixture.terminal().error, /ENOENT/u,
      'the actual executable acquisition failed before any process group existed');
    assert.throws(() => killGroup(fixture.child), /unacquired process group/u,
      'an unavailable identity cannot be negated or converted into a direct-child attempt');
  });

// The existing public harness entry owns acquisition and finalization here.
// Only the held-session dependency is finite; neither case admits a tunnel
// or formation. These controls make no physical-host or Docker proof claim.
for (const phase of ['busy admission', 'machine observation']) {
  test(`harness preserves ${phase} failure and attempts every acquired hold release`,
    {timeout: 10000}, async (t) => {
      const directory = tempDir(t, 'fleet-harness-release-');
      const events = [];
      const diagnostics = [];
      const cleanupFailure = new Error('finite first hold release unavailable');
      let observationFailure = null;
      const diagnostic = t.mock.method(process.stderr, 'write', (text) => {
        diagnostics.push(String(text));
        return true;
      });
      const hold = (machine) => {
        events.push(`hold ${machine.name}`);
        return {
          outcome: Promise.resolve(phase === 'busy admission' && machine.name === 'b' ?
            {state: 'busy', holder: HOLDER} : {state: 'held'}),
          release: () => {
            events.push(`release ${machine.name}`);
            if (machine.name === 'a') throw cleanupFailure;
          },
        };
      };
      const observeMachine = () => {
        events.push('observe');
        try {
          fs.readFileSync(directory);
        } catch (error) {
          observationFailure = error;
          throw error;
        }
        assert.fail('reading the real fixture directory must refuse before any tunnel starts');
      };
      try {
        await assert.rejects(runHarness({
          nodes: [{name: 'b', ssh: 'lab@b.invalid', ip: '192.0.2.2'},
            {name: 'a', ssh: 'lab@a.invalid', ip: '192.0.2.1'}],
          scenario: 'rolling-restart', verbose: false, hold, observeMachine,
        }), (error) => {
          assert.notEqual(error, cleanupFailure,
            'the secondary release error never replaces the earlier harness failure');
          if (phase === 'busy admission') {
            assert.equal(error.message, `harness: node b busy, ${HELD_BY}`);
          } else {
            assert.equal(observationFailure?.code, 'EISDIR');
            assert.equal(error.message,
              `harness: no machine identity for node b: ${observationFailure.message}`,
              'the machine observer owner retains its canonical classification and actual detail');
          }
          return true;
        });
      } finally {
        diagnostic.mock.restore();
      }
      assert.deepEqual(events, ['hold a', 'hold b',
        ...(phase === 'machine observation' ? ['observe'] : []), 'release a', 'release b'],
      'each acquired release is attempted once even when the first release throws synchronously');
      assert.ok(diagnostics.some((line) => line.includes(cleanupFailure.message)),
        `the secondary cleanup failure is visible: ${diagnostics.join('')}`);
    });
}

async function directChildEnded(pid) {
  const deadline = Date.now() + GROUP_CONTROL_BOUND_MS;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, GROUP_CONTROL_POLL_MS));
  }
  assert.fail(`the finite direct child ${pid} did not exit`);
}

for (const status of [0, 42]) {
  test(`capture retains closed stdout/stderr after the direct child exits ${status}`,
    {timeout: 15000}, async (t) => {
      const root = tempDir(t, 'fleet-capture-closure-');
      const pidFile = path.join(root, 'pid');
      const release = path.join(root, 'release-tail');
      const complete = path.join(root, 'tail-complete');
      const script = [
        'printf \'%s\\n\' "$$" > "$1.tmp"; mv "$1.tmp" "$1"',
        '(',
        '  n=0; while [ ! -f "$2" ] && [ "$n" -lt 50 ]; do sleep 0.1; n=$((n + 1)); done',
        '  [ -f "$2" ] || exit 79',
        '  printf \'late\\n\'; printf \'late failure detail\\n\' >&2',
        '  printf complete > "$3.tmp"; mv "$3.tmp" "$3"',
        ') &',
        'printf \'early\\n\'',
        'exit "$4"',
      ].join('\n');
      let outcome = null;
      const captured = capture('sh', ['-c', script, 'finite-capture',
        pidFile, release, complete, String(status)], {timeoutMs: GROUP_CONTROL_BOUND_MS})
        .then((output) => {
          outcome = {output};
        }, (error) => {
          outcome = {error};
        });
      let settledBeforeTail;
      try {
        await groupControlMarker(pidFile, () => null);
        const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
        assert.ok(Number.isInteger(pid) && pid > 0, 'the actual direct child named its PID');
        await directChildEnded(pid);
        await new Promise(setImmediate);
        settledBeforeTail = outcome !== null;
      } finally {
        // This is an output-completion witness, not cancellation proof. The
        // fixture releases its finite writer even when the original owner
        // incorrectly settles before the inherited pipes have closed.
        fs.writeFileSync(release, 'go');
        await boundedGroupControl(captured, 'complete capture settlement');
        await groupControlMarker(complete, () => null);
      }
      assert.equal(settledBeforeTail, false,
        'direct exit cannot settle capture while its owned output pipes remain open');
      if (status === 0) assert.equal(outcome.output, 'early\nlate');
      else {
        assert.match(outcome.error.message, /failed \(42\)/u,
          'the original nonzero exit remains the primary outcome');
        assert.match(outcome.error.message, /late failure detail/u,
          'the failure includes the final original stderr bytes');
      }
    });
}

test('a failed capture spawn retains ENOENT and releases its deadline without later signalling',
  {timeout: 10000}, async (t) => {
    const root = tempDir(t, 'fleet-capture-unavailable-');
    const attempts = [];
    const diagnostics = [];
    const signal = process.kill;
    const observedSignal = t.mock.method(process, 'kill', (pid, name) => {
      attempts.push({pid, name});
      return signal.call(process, pid, name);
    });
    const diagnostic = t.mock.method(process.stderr, 'write', (text) => {
      diagnostics.push(String(text));
      return true;
    });
    try {
      await assert.rejects(capture(path.join(root, 'missing-command'), [], {timeoutMs: 30}),
        {code: 'ENOENT'}, 'the actual spawn error is the original capture failure');
      await new Promise((resolve) => setTimeout(resolve, 120));
    } finally {
      diagnostic.mock.restore();
      observedSignal.mock.restore();
    }
    assert.deepEqual(attempts, [], 'no cancelled deadline may later target an absent identity');
    assert.deepEqual(diagnostics, [], 'no later cleanup callback replaces the failed acquisition');
  });

function observedHoldProcesses() {
  const observed = spawnSync('ps', ['-eo', 'pid=,ppid=,pgid=,sid=,stat=,comm='],
    {encoding: 'utf8'});
  assert.equal(observed.status, 0, observed.stderr);
  return observed.stdout.trim().split('\n').map((line) => {
    const [pid, parent, group, session, state, command] = line.trim().split(/\s+/u);
    return {pid: Number(pid), parent: Number(parent), group: Number(group),
      session: Number(session), state, command};
  });
}

function liveOwnedHoldProcesses(owned) {
  const observed = observedHoldProcesses();
  return owned.map((identity) => {
    const actual = observed.find(({pid}) => pid === identity.pid);
    if (!actual || actual.state.startsWith('Z')) return null;
    assert.deepEqual([actual.group, actual.session, actual.command],
      [identity.group, identity.session, identity.command],
      'cleanup addresses only the process identity this finite fixture acquired');
    return actual;
  }).filter(Boolean);
}

test('release preserves actual signal loss after an acquired hold shell exits',
  {timeout: 15000}, async (t) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lost-lab-hold-')));
    const owned = [];
    let held = null;
    let observedRelease = null;
    t.after(async () => {
      const errors = [];
      const attempt = async (action) => {
        try {
          await action();
        } catch (error) {
          errors.push(error);
        }
      };
      if (held && !observedRelease) {
        observedRelease = Promise.resolve().then(() => held.release())
          .then((value) => ({value}), (error) => ({error}));
      }
      // The original hold is not detached. Teardown therefore owns only
      // these observed shell/reader PIDs, never their caller's process group.
      for (const identity of [...owned].reverse()) {
        await attempt(() => {
          if (liveOwnedHoldProcesses([identity]).length === 0) return;
          try {
            process.kill(identity.pid, 'SIGKILL');
          } catch (error) {
            if (error.code !== 'ESRCH') throw error;
          }
        });
      }
      if (observedRelease) {
        await attempt(() => boundedGroupControl(observedRelease, 'owned hold release settlement'));
      }
      await attempt(async () => {
        const deadline = Date.now() + GROUP_CONTROL_BOUND_MS;
        while (liveOwnedHoldProcesses(owned).length && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, GROUP_CONTROL_POLL_MS));
        }
        assert.deepEqual(liveOwnedHoldProcesses(owned), [], 'all acquired fixture processes close');
      });
      if (errors.length) {
        throw new AggregateError(errors, `hold fixture cleanup unavailable: ${root}`);
      }
      fs.rmSync(root, {recursive: true, force: true});
    });
    held = labProbe.holdLabMachine({name: 'finite-local-hold', sshTarget: null},
      {waitMs: 1000, purpose: 'finite lost-session control', expectedMs: MINUTE,
        env: {...gitProcessEnvironment(), LAB_LOCK_DIR: root}});
    assert.deepEqual(await boundedGroupControl(held.outcome, 'actual hold acquisition'),
      {state: 'held'});
    const record = JSON.parse(fs.readFileSync(path.join(root, 'machine.holder.json'), 'utf8'));
    assert.ok(Number.isInteger(record.pid) && record.pid > 1);
    const shell = observedHoldProcesses().find(({pid}) => pid === record.pid);
    assert.ok(shell && !shell.state.startsWith('Z'), 'the actual held shell is live');
    assert.equal(shell.parent, process.pid, 'this public hold acquired the observed direct shell');
    owned.push(shell);
    let reader;
    const deadline = Date.now() + GROUP_CONTROL_BOUND_MS;
    while (!reader && Date.now() < deadline) {
      reader = observedHoldProcesses().find((one) => one.parent === shell.pid &&
        one.command === 'cat' && !one.state.startsWith('Z'));
      if (!reader) await new Promise((resolve) => setTimeout(resolve, GROUP_CONTROL_POLL_MS));
    }
    assert.ok(reader, 'the actual hold is waiting in its foreground input reader');
    assert.ok(Number.isInteger(reader.pid) && reader.pid > 1);
    assert.deepEqual([reader.group, reader.session], [shell.group, shell.session]);
    owned.push(reader);
    process.kill(shell.pid, 'SIGKILL');
    await directChildEnded(shell.pid);
    // ChildProcess may close stdin when its direct child exits. The control
    // measures the actual held-session loss, not assumed reader survival.
    const release = held.release();
    observedRelease = release.then((value) => ({value}), (error) => ({error}));
    assert.equal(held.release(), release, 'release has one cached completion');
    const outcome = await boundedGroupControl(observedRelease,
      'the actual lost hold release must settle within its original bound');
    assert.ok(outcome.error instanceof Error, 'loss of an acquired hold cannot resolve as success');
    assert.match(outcome.error.message, /^lab hold session closed unavailable:/u);
    assert.equal(outcome.error.exitCode, null, 'the actual signalled shell had no integer exit');
    assert.equal(outcome.error.signal, 'SIGKILL', 'the actual shell loss remains visible');
    assert.equal(outcome.error.group, shell.pid);
    assert.equal(shell.group, shell.pid, 'the acquired hold owns its process group');
    assert.deepEqual(liveOwnedHoldProcesses(owned), [],
      'no owned reader is live at release settlement');
    assert.deepEqual(observedHoldProcesses().filter((one) => one.group === shell.group &&
      one.session === shell.session && !one.state.startsWith('Z')), [],
    'the acquired hold group has no live members at release settlement');
  });
