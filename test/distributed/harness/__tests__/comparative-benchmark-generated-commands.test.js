// The shell scripts and remote command lines this change generates, EXECUTED
// (not matched as text): the storage preparation script with the real sh and
// stat against real directories; the image presence probe; the harness-commit
// probe, push and checkout against real git repositories; the offline
// reference-client install with the real npm against a real, empty cache.
// Only what cannot exist in a test is a stand-in (comparative-benchmark-local-
// shell-fixture.js): the docker binary, chown to another uid, the ssh hop.
// Real ownership by another uid (root) is exercised by lab shell job
// (see the quest log), not here: a unit test cannot own files as root.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  COMPARATIVE_SMOKE_PROFILE,
  buildComparativeCampaignManifest,
} from '../comparative-benchmark-campaign-manifest.js';
import {ensureProductImages} from '../comparative-benchmark-host-preparation.js';
import {
  harnessCommitPusher,
  provisionComparativeHosts,
  readReferenceClientLock,
  referenceClientTarballs,
} from '../comparative-benchmark-provisioning.js';
import {
  createRemoteWorkloadRunner,
  installReferenceClient,
  prepareLoadGeneratorCheckout,
} from '../comparative-benchmark-workload-call-site.js';
import * as deployers from '../real-product-cluster-deployers.js';
import {contentIdentityOf} from '../real-product-identity.js';
import {
  arrayIncludes,
  arrayMap,
  arraySome,
  stringIncludes,
  stringTrim,
} from '../real-product-captured-intrinsics.js';
import {createLocalShell} from './comparative-benchmark-local-shell-fixture.js';
import {
  LAGRANGE_IMAGE,
  LAGRANGE_IMAGE_ID,
  createContainerLedger,
  lagrangeHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const OWN = `${process.getuid()}:${process.getgid()}`;
// The deployer's runtime user; the test runs as another uid, so a directory
// the test creates is "another owner's" for it.
const RUNTIME = '10001:10001';
const KEY = '/keys/bench key';

// The deployer with --storage-root through its own command line: the
// preparation container is executed (real sh, stat, ls, mkdir against real
// directories; docker and chown-to-10001 are stand-ins). The runtime user's
// own non-empty directory needs real uid 10001 ownership: lab shell job
// (comparative storage-owner job in the quest log) covers it with real root.
async function deployWithStorage({images = ['postgres:17-alpine'], prepare = () => {},
  runtimeOwner = ''} = {}) {
  const shell = createLocalShell({images, runtimeOwner});
  const root = path.join(shell.dir, 'root');
  prepare(path.join(root, 'camp-exec'));
  const content = contentIdentityOf([`sha256:${LAGRANGE_IMAGE_ID.slice(-64)}`]);
  const scripted = createScriptedSsh([
    [/^docker run --rm .*\/campaign/u, (command) => shell.sshRun('', {}, command)],
    ...lagrangeHealthyRules(createContainerLedger())]);
  const outcome = await deployers.deployComparativeTarget('lagrange', {
    hosts: ['10.0.0.1', '10.0.0.2', '10.0.0.3'], clientIp: '10.0.0.9',
    sshRun: scripted.sshRun, campaignId: 'camp-exec', sleep: async () => {},
    opts: {lagrangeImage: LAGRANGE_IMAGE, storageRoot: root, lagrangeImageContent: content,
      readiness: {stablePolls: 1, attempts: 2, intervalMs: 0, timeoutMs: 50,
        pollIntervalMs: 1}}}).then((deployment) => ({deployment}), (error) => ({error}));
  const started = (host) => arraySome(scripted.calls, (call) => call.host === host &&
    /^docker run -d .*lagrange-node/u.test(call.command));
  return {...outcome, shell, campaign: path.join(root, 'camp-exec'), started};
}

test('storage preparation through the deployer\'s own command line, executed: absent and ' +
  'empty node directories are prepared before each node starts; a non-empty directory of ' +
  'another owner refuses that node, typed, and is left untouched', async () => {
  assert.notEqual(OWN, RUNTIME, 'the test must not run as the runtime user');
  const fresh = await deployWithStorage({prepare: (campaign) =>
    fs.mkdirSync(path.join(campaign, 'lagrange-3'), {recursive: true})});
  assert.equal(fresh.error, undefined, fresh.error?.message);
  for (const n of [1, 2, 3]) {
    const dir = path.join(fresh.campaign, `lagrange-${n}`);
    assert.ok(fs.statSync(dir).isDirectory(), dir);
    assert.ok(arrayIncludes(fresh.shell.chowns(), `${RUNTIME} /campaign/lagrange-${n}`) ||
      arrayIncludes(fresh.shell.chowns(), `${RUNTIME} ${dir}`), dir);
  }
  const taken = await deployWithStorage({prepare: (campaign) => {
    fs.mkdirSync(path.join(campaign, 'lagrange-2'), {recursive: true});
    fs.writeFileSync(path.join(campaign, 'lagrange-2', 'data'), 'foreign');
  }});
  assert.equal(taken.error?.code, 'deployment_command_failed');
  assert.equal(taken.error.diagnostic.reason, 'storage_foreign_owner');
  assert.equal(taken.error.diagnostic.owner, OWN);
  assert.equal(taken.error.diagnostic.host, '10.0.0.2');
  assert.equal(fs.readFileSync(path.join(taken.campaign, 'lagrange-2', 'data'), 'utf8'),
    'foreign');
  assert.equal(arraySome(taken.shell.chowns(), (line) => stringIncludes(line, 'lagrange-2')),
    false, 'foreign data is never re-owned');
  assert.equal(taken.started('10.0.0.1'), true);
  assert.equal(taken.started('10.0.0.2'), false, 'the refused node never starts');
});

// The runtime user's own non-empty directory (an earlier run of the same
// campaign) is kept and the node starts: through the deployer's own command
// line, with the docker stand-in showing the test user as the runtime user
// inside the container (real root-owned and 10001-owned directories: the lab
// job generated by solve/quests/comparative-campaign-explicit-provisioning/
// evidence/gen-storage-owner-job.mjs).
test('storage preparation keeps the runtime user\'s own non-empty directory and starts the ' +
  'node', async () => {
  const kept = await deployWithStorage({runtimeOwner: RUNTIME, prepare: (campaign) => {
    fs.mkdirSync(path.join(campaign, 'lagrange-1'), {recursive: true});
    fs.writeFileSync(path.join(campaign, 'lagrange-1', 'data'), 'an earlier run');
  }});
  assert.equal(kept.error, undefined, kept.error?.message);
  assert.equal(fs.readFileSync(path.join(kept.campaign, 'lagrange-1', 'data'), 'utf8'),
    'an earlier run');
  assert.equal(kept.started('10.0.0.1'), true);
  assert.ok(arraySome(kept.shell.chowns(), (line) =>
    line === `${RUNTIME} ${path.join(kept.campaign, 'lagrange-1')}`));
});

// B4: a preparation container that fails for any other reason (here the
// helper image is absent under --pull=never) refuses the node with
// storage_owner_unprepared; the node never starts on an unprepared directory.
test('storage preparation that fails for a non-foreign reason refuses the node, typed; it ' +
  'never starts', async () => {
  const failed = await deployWithStorage({images: []});
  assert.equal(failed.error?.code, 'deployment_command_failed');
  assert.equal(failed.error.diagnostic.reason, 'storage_owner_unprepared');
  assert.equal(failed.error.diagnostic.host, '10.0.0.1');
  assert.equal(failed.error.diagnostic.path, `${path.dirname(failed.campaign)}/camp-exec/lagrange-1`);
  assert.match(failed.error.diagnostic.output, /No such image: postgres:17-alpine/u);
  assert.equal(failed.started('10.0.0.1'), false);
  assert.equal(fs.existsSync(path.join(failed.campaign, 'lagrange-1')), false);
});

test('image presence probe, executed: a present image answers its id; an absent one refuses',
  async () => {
    const shell = createLocalShell({images: ['postgres:17-alpine']});
    const present = await ensureProductImages({hosts: [{ip: 'h'}], role: 'data',
      images: ['postgres:17-alpine'], sshRun: shell.sshRun, opts: {}});
    assert.match(present[0].imageId, /^sha256:[0-9a-f]{64}$/u);
    await assert.rejects(ensureProductImages({hosts: [{ip: 'h'}], role: 'data',
      images: ['postgres:17-alpine', 'pingcap/tikv:v8.5.8'], sshRun: shell.sshRun, opts: {}}),
    (error) => error.code === 'image_unavailable' &&
      error.diagnostic.image === 'pingcap/tikv:v8.5.8');
  });

function git(cwd, args) {
  return stringTrim(execFileSync('git', ['-c', 'user.name=bench', '-c', 'user.email=b@e',
    '-c', 'init.defaultBranch=main', ...args], {cwd, encoding: 'utf8'}));
}

// A dependency-free controller repository with the layout provisioning uses.
function controllerRepository(dir) {
  const manifest = (name) => JSON.stringify({name, version: '1.0.0', private: true});
  const lock = (name) => JSON.stringify({name, version: '1.0.0', lockfileVersion: 3,
    requires: true, packages: {'': {name, version: '1.0.0'}}});
  const client = path.join(dir, 'test/distributed/reference-client');
  fs.mkdirSync(client, {recursive: true});
  for (const [where, name] of [[dir, 'controller'], [client, 'reference-client']]) {
    fs.writeFileSync(path.join(where, 'package.json'), manifest(name));
    fs.writeFileSync(path.join(where, 'package-lock.json'), lock(name));
  }
  git(dir, ['init', '--quiet']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', 'harness']);
  return git(dir, ['rev-parse', 'HEAD']);
}

test('harness commit, executed with real git: pushed over ssh with the campaign\'s options, ' +
  'checked out, probed; the campaign then prepares its worktree and installs offline; a ' +
  'checkout without the commit refuses; a push without the key or BatchMode fails', async () => {
  const shell = createLocalShell({sshKey: KEY});
  const controller = path.join(shell.dir, 'controller');
  fs.mkdirSync(controller);
  const commit = controllerRepository(controller);
  // The lockfile provisioning seeds from is the harness commit's, not the
  // controller's working tree.
  const lockPath = path.join(controller, 'test/distributed/reference-client/package-lock.json');
  const committedLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  fs.writeFileSync(lockPath, JSON.stringify({...committedLock, packages: {...committedLock.packages,
    'node_modules/uncommitted': {version: '1.0.0', resolved: 'https://example.invalid/u.tgz'}}}));
  assert.deepEqual(readReferenceClientLock(controller, commit), committedLock);
  const host = {ip: '127.0.0.1', role: 'client', sshTarget: 'bench@127.0.0.1',
    repoPath: path.join(shell.dir, 'client'), nodePath: process.execPath};
  const plan = {images: {data: [], client: []}, harnessCommit: commit, tarballs: [],
    vm: {imageFamily: 'f', imageProject: 'p', bootDiskSize: '50GB', bootDiskType: 'pd-ssd', firewallAllow: 'icmp'},
    nodeMinimum: '22.12.0'};
  const provision = (target, sshCommand) => shell.asController(() =>
    provisionComparativeHosts({hosts: [target], plan, sshRun: shell.sshRun, opts: {},
      pushHarnessCommit: harnessCommitPusher({controllerRoot: controller, sshCommand})}));
  const receipt = await provision(host, ['ssh', '-o', 'BatchMode=yes', '-i', KEY]);
  assert.equal(receipt.client.head, commit);
  assert.equal(git(host.repoPath, ['rev-parse', 'HEAD']), commit);
  assert.deepEqual(shell.sshConnections(), [`bench@127.0.0.1 ${KEY}`]);
  assert.equal(receipt.client.driverInstall, 'installed');

  const checkout = await prepareLoadGeneratorCheckout({sshRun: shell.sshRun, opts: {}, host,
    harnessCommit: commit, campaignId: 'bench-exec'});
  assert.equal(git(checkout.host.repoPath, ['rev-parse', 'HEAD']), commit);
  assert.equal(checkout.host.driverInstall.status, 'installed');
  assert.deepEqual(await checkout.release(), {status: 'complete', error: null});

  const empty = {...host, repoPath: path.join(shell.dir, 'empty-client')};
  git(shell.dir, ['init', '--quiet', empty.repoPath]);
  await assert.rejects(prepareLoadGeneratorCheckout({sshRun: shell.sshRun, opts: {},
    host: empty, harnessCommit: commit, campaignId: 'bench-exec'}),
  (error) => error.code === 'load_generator_commit_absent');
  assert.equal(fs.existsSync(path.join(empty.repoPath, 'test-output')), false);

  for (const [name, sshCommand] of [['no-key', ['ssh', '-o', 'BatchMode=yes']],
    ['no-batch-mode', ['ssh', '-i', KEY]]]) {
    const other = {...host, repoPath: path.join(shell.dir, `client-${name}`)};
    await assert.rejects(provision(other, sshCommand), (error) =>
      error.code === 'provisioning_commit_not_placed' && error.diagnostic.step === 'push');
  }
});

test('offline install, executed with the real npm and an empty cache: the tarball npm ' +
  'names is a lockfile tarball, and the TiDB arm refuses offline_cache_incomplete naming it',
async () => {
  const shell = createLocalShell();
  const worktree = path.join(shell.dir, 'worktree');
  const client = path.join(worktree, 'test/distributed/reference-client');
  fs.mkdirSync(client, {recursive: true});
  for (const file of ['package.json', 'package-lock.json']) {
    fs.copyFileSync(path.join(ROOT, 'test/distributed/reference-client', file),
      path.join(client, file));
  }
  const host = {ip: '127.0.0.1', repoPath: worktree, nodePath: process.execPath};
  const install = await installReferenceClient({sshRun: shell.sshRun, opts: {}, host,
    worktree});
  assert.equal(install.status, 'failed');
  const locked = arrayMap(referenceClientTarballs(readReferenceClientLock(ROOT, 'HEAD')),
    (tarball) => tarball.resolved);
  assert.equal(install.missing.length, 1, install.output);
  assert.ok(arrayIncludes(locked, install.missing[0]), install.missing[0]);
  const manifest = buildComparativeCampaignManifest({campaignId: 'bench-exec',
    profile: COMPARATIVE_SMOKE_PROFILE, targets: ['tidb-tikv']});
  await assert.rejects(createRemoteWorkloadRunner({sshRun: shell.sshRun, opts: {},
    host: {...host, driverInstall: install}, harnessCommit: 'x',
    campaignId: 'bench-exec'})({system: 'tidb-tikv'}, manifest.runs[0]),
  (error) => error.diagnostic?.reason === 'offline_cache_incomplete' &&
    stringIncludes(error.message, install.missing[0]));
});
