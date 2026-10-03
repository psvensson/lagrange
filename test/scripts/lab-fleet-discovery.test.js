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

import {runHarness} from '../../scripts/lab/harness.js';
import {capture} from '../../scripts/lab/process.js';
import * as labProbe from '../../scripts/lab/probe.js';
import {
  CAPABILITY_SCRIPT, MOVIELENS_FILE, MOVIELENS_SHA256, READINESS, corpusReadiness,
  discoverFleet, fleetRequirement, formatFleet, parseCapability, probeTestCapability,
  recordFleet, runLabTest, runPlacedTestFiles,
} from '../../scripts/lab/probe.js';
import * as selector from '../../scripts/select-change-tests.js';

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
async function probeCheckout(root, repo) {
  const stubBin = path.join(root, 'bin');
  fs.mkdirSync(stubBin, {recursive: true});
  fs.writeFileSync(path.join(stubBin, 'timeout'), '#!/bin/sh\nexit 124\n', {mode: 0o755});
  const env = {...process.env, NVM_DIR: path.join(root, 'no-nvm'), PATH: [stubBin,
    path.dirname(process.execPath), process.env.PATH].join(path.delimiter)};
  return probeTestCapability({repoPath: repo, nodeMajor: '',
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
    const capability = await probeCheckout(root, host);
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

test('a placed commit is measured against its own lockfile and engines floor', async (t) => {
  const repo = tempDir(t, 'fleet-requirement-');
  const git = (...args) => {
    const result = spawnSync('git', ['-C', repo, ...args], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q');
  fs.writeFileSync(path.join(repo, 'package.json'), GRAPH_MANIFEST);
  fs.writeFileSync(path.join(repo, 'package-lock.json'), lockVariant());
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'placed');
  const placed = git('rev-parse', 'HEAD');
  const placedDigest = fleetRequirement(repo).lockGraphSha256;
  // The working tree moves on: another dependency and another floor.
  fs.writeFileSync(path.join(repo, 'package.json'),
    '{"name":"fixture","engines":{"node":">=24.0.0"}}\n');
  fs.writeFileSync(path.join(repo, 'package-lock.json'), lockVariant((lock) => {
    lock.packages['node_modules/a'].version = '1.0.1';
  }));
  const commit = fleetRequirement(repo, placed);
  assert.equal(commit.nodeMinimum, '22.12.0', 'the placed commit\'s engines floor');
  assert.equal(commit.lockGraphSha256, placedDigest, 'the placed commit\'s graph');
  assert.equal(commit.source, placed, 'and it says which commit it describes');
  const tree = fleetRequirement(repo);
  assert.equal(tree.nodeMinimum, '24.0.0', 'with no commit: the working tree');
  assert.notEqual(tree.lockGraphSha256, placedDigest);
  assert.equal(tree.source, labProbe.REQUIREMENT_SOURCE.WORKING_TREE, 'and it says so');
  assert.throws(() => fleetRequirement(repo, 'f'.repeat(40)),
    'a commit that cannot be read has no requirement, never the working tree\'s');

  // Both placement paths hand discovery the commit they place.
  const discovered = [];
  const stop = async (sha) => {
    discovered.push(sha);
    throw new Error('stop after discovery');
  };
  await assert.rejects(runLabTest({plan: [], commit: {sha: placed, release: () => {}},
    root: repo, write: () => {}}, {discover: stop, commitAt: () => null}),
  /stop after discovery/u);
  await runPlacedTestFiles(['a.test.js'], {env: {}, write: () => {},
    planCosts: (files) => files.map((file) => ({file, ms: 60 * 60 * 1000, jobs: 1})),
    runLocal: () => 0, commitAt: () => placed, discover: stop});
  assert.deepEqual(discovered, [placed, placed]);
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
  const capability = await probeCheckout(root, host);
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

test('discovery probes every machine and recognises one reached twice', async () => {
  const seen = [];
  // Two machines installed from one image share /etc/machine-id; the boot id
  // tells them apart, and it is what discovery keys on.
  const identities = {
    'ctl': 'boot-A', 'peer@one': 'boot-B', 'peer@self': 'boot-A', 'peer@two': 'boot-B',
    'peer@clone': 'boot-C',
  };
  const probe = async ({sshTarget, repoPath, nodeMajor}) => {
    seen.push({sshTarget, repoPath, nodeMajor});
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
    ],
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

test('the controller is probed by the same script it sends to a lab node', async () => {
  const capability = await probeTestCapability({repoPath: process.cwd()});
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
    captureCommand: async (command, args, options) => {
      calls.push({command, args, stdin: options.stdin, timeoutMs: options.timeoutMs});
      return 'cores=1';
    },
  });
  assert.equal(calls[0].command, 'ssh');
  assert.equal(calls[0].args.at(-1), QUOTED_PATH_REMOTE,
    'the remote path is quoted for the remote shell, whatever it contains');
  assert.ok(calls[0].args.includes('ConnectTimeout=5'),
    'an address that answers nothing cannot hold discovery');
  assert.ok(calls[0].timeoutMs > 0, 'nor can a machine that answers and then hangs');
  assert.match(calls[0].stdin, /repo_present yes/u, 'the same script travels to the node');
  await assert.rejects(probeTestCapability({sshTarget: '-oProxyCommand=x', repoPath: '/r',
    captureCommand: async () => assert.fail('never run')}), /begins with "-"/u,
  'a target ssh would read as an option is refused');
});

test('the probe observes a checkout and never acts on it', async (t) => {
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
    return probeTestCapability({repoPath, nodeMajor: '99',
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
    const probeHere = () => probeTestCapability({repoPath: process.cwd(),
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

test('a formation holds a node under the lab convention and releases it', async (t) => {
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
