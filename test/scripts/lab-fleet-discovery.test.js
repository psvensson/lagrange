// Fleet discovery records what each machine can actually run, so placement
// can choose at run time from facts rather than from host names written into
// setup (owner direction, 2026-09-18). Every capability it reports is one a
// real run has tripped over: missing helm, psql or the pinned MovieLens
// dataset reds five files for setup reasons, and a node older than the
// engines floor cannot run the corpus at all.

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {parse} from 'yaml';

import {capture} from '../../scripts/lab/process.js';
import {
  MOVIELENS_FILE, MOVIELENS_SHA256, READINESS, corpusReadiness,
  discoverFleet, formatFleet, parseCapability, probeTestCapability, recordFleet,
} from '../../scripts/lab/probe.js';

const LOCK = 'a'.repeat(64);
const FULL = [
  'repo_path=/srv/repo',
  'boot_id=boot-1',
  'cores=12',
  'mem_kib=16000000',
  'node_path=/opt/node/bin/node',
  'node_version=v22.22.3',
  'tool_git=yes', 'tool_docker=yes', 'tool_helm=no', 'tool_wasm-tools=no',
  'tool_psql=no', 'tool_g++=yes',
  'docker_reachable=yes',
  'repo_present=yes',
  'repo_head=' + 'c'.repeat(40),
  `lock_sha256=${LOCK}`,
  'node_modules=yes',
  'dependencies_current=yes',
  `movielens_sha256=${MOVIELENS_SHA256}`,
  'cpu_sample_ms=208',
].join('\n');
const REQUIREMENT = Object.freeze({lockSha256: LOCK, nodeMinimum: '22.12.0'});
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
    'wasm-tools': false, 'psql': false, 'g++': true});
  assert.equal(capability.repo.present, true);
  assert.equal(capability.repo.lockSha256, LOCK);
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
  const noRepo = parseCapability('repo_present=no\nlock_sha256=' + LOCK +
    '\ndependencies_current=yes');
  assert.equal(noRepo.repo.present, false);
  assert.equal(noRepo.repo.lockSha256, null,
    'a lockfile hash is not believed when the repository is absent');
  assert.equal(noRepo.repo.dependenciesCurrent, null);
});

test('readiness names every reason a machine cannot run the corpus', () => {
  assert.deepEqual(readiness(FULL), {
    ready: true,
    missing: [],
    gaps: ['no-helm', 'no-wasm-tools', 'no-psql'],
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
    [FULL.replace(`lock_sha256=${LOCK}`, `lock_sha256=${'b'.repeat(64)}`),
      [READINESS.LOCKFILE_DIFFERS], 'another lockfile means other dependencies'],
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
  for (const lockSha256 of [null, '', 'not-a-digest']) {
    const verdict = readiness(FULL, {...REQUIREMENT, lockSha256});
    assert.ok(verdict.missing.includes(READINESS.NO_REQUIREMENT),
      `a requirement of ${JSON.stringify(lockSha256)} is no requirement`);
    assert.equal(verdict.ready, false, 'nothing to compare is never a match');
  }
  for (const nodeMinimum of ['22', '>=22.12.0', '', null]) {
    const verdict = readiness(FULL, {...REQUIREMENT, nodeMinimum});
    assert.deepEqual(verdict.missing, [READINESS.NO_NODE_FLOOR],
      `an engines floor of ${JSON.stringify(nodeMinimum)} is named, not blamed on the node`);
    assert.equal(verdict.ready, false);
  }
  const noLockAnywhere = readiness(FULL.replace(`lock_sha256=${LOCK}\n`, ''),
    {...REQUIREMENT, lockSha256: null});
  assert.equal(noLockAnywhere.ready, false,
    'a machine without a lockfile does not match a controller without one');
  const noData = readiness(FULL.replace(`movielens_sha256=${MOVIELENS_SHA256}`,
    'movielens_sha256=' + 'd'.repeat(64)));
  assert.ok(noData.gaps.includes(READINESS.NO_DATASET),
    'a dataset with the wrong digest is not the pinned dataset');
  assert.equal(noData.ready, true, 'a dataset gap does not disqualify');
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
  const pidFile = path.join(os.tmpdir(), `fleet-deadline-${process.pid}`);
  const started = Date.now();
  await assert.rejects(capture('sh', ['-c', `echo $$ > '${pidFile}'; sleep 5`],
    {timeoutMs: 200}), /timed out after 200 ms/u);
  assert.ok(Date.now() - started < 2000, 'the deadline answers on time');
  const hung = Number(fs.readFileSync(pidFile, 'utf8'));
  fs.rmSync(pidFile, {force: true});
  let alive = true;
  for (let poll = 0; poll < 50 && alive; poll += 1) {
    try {
      process.kill(hung, 0);
      await new Promise((resolve) => setTimeout(resolve, 20));
    } catch {
      alive = false;
    }
  }
  assert.equal(alive, false, 'and the hung child is killed, not left running');
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
  assert.equal(matching.repo.lockSha256,
    createHash('sha256').update(lockText).digest('hex'), 'and the lockfile is hashed');
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
