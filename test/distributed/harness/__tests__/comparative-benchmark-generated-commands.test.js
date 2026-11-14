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
import {execFileSync, spawnSync} from 'node:child_process';
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
import {storagePreparationScript} from '../real-product-deployer-lagrange.js';
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

function runScript(shell, script) {
  return spawnSync('sh', ['-c', script], {env: shell.env, encoding: 'utf8'});
}

test('storage preparation script, executed: absent, empty and runtime-owned directories ' +
  'are prepared; a non-empty directory of another owner is refused and left untouched', () => {
  assert.notEqual(OWN, RUNTIME, 'the test must not run as the runtime user');
  const shell = createLocalShell();
  const base = path.join(shell.dir, 'storage');
  const absent = path.join(base, 'absent');
  const prepared = runScript(shell, storagePreparationScript({dir: absent, owner: RUNTIME}));
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.ok(fs.statSync(absent).isDirectory(), 'an absent directory is created');
  assert.deepEqual(shell.chowns(), [`${RUNTIME} ${absent}`]);

  const empty = path.join(base, 'empty');
  fs.mkdirSync(empty);
  assert.equal(runScript(shell, storagePreparationScript({dir: empty, owner: RUNTIME})).status,
    0, 'an empty directory of another owner is taken over');
  assert.deepEqual(shell.chowns(), [`${RUNTIME} ${absent}`, `${RUNTIME} ${empty}`]);

  const foreign = path.join(base, 'foreign');
  fs.mkdirSync(foreign);
  fs.writeFileSync(path.join(foreign, 'data'), 'someone else\'s');
  const refused = runScript(shell, storagePreparationScript({dir: foreign, owner: RUNTIME}));
  assert.equal(refused.status, 3);
  assert.equal(stringTrim(refused.stdout), `foreign ${OWN}`);
  assert.equal(arraySome(shell.chowns(), (line) => stringIncludes(line, foreign)), false,
    'foreign data is never re-owned');
  assert.equal(fs.readFileSync(path.join(foreign, 'data'), 'utf8'), 'someone else\'s');

  const own = path.join(base, 'own');
  fs.mkdirSync(own);
  fs.writeFileSync(path.join(own, 'data'), 'an earlier run');
  const reused = runScript(shell, storagePreparationScript({dir: own, owner: OWN}));
  assert.equal(reused.status, 0, 'the runtime user\'s own directory is kept: ' + reused.stdout);
  assert.equal(fs.readFileSync(path.join(own, 'data'), 'utf8'), 'an earlier run');
});

test('storage preparation through the deployer\'s own command line, executed: fresh node ' +
  'directories are prepared; foreign data refuses the node, typed', async () => {
  const content = contentIdentityOf([`sha256:${LAGRANGE_IMAGE_ID.slice(-64)}`]);
  const run = async (prepare) => {
    const shell = createLocalShell();
    const root = path.join(shell.dir, 'root');
    prepare(root);
    const scripted = createScriptedSsh([
      [/^docker run --rm .*\/campaign/u, (command) => shell.sshRun('', {}, command)],
      ...lagrangeHealthyRules(createContainerLedger())]);
    const outcome = await deployers.deployComparativeTarget('lagrange', {
      hosts: ['10.0.0.1', '10.0.0.2', '10.0.0.3'], clientIp: '10.0.0.9',
      sshRun: scripted.sshRun, campaignId: 'camp-exec', sleep: async () => {},
      opts: {lagrangeImage: LAGRANGE_IMAGE, storageRoot: root, lagrangeImageContent: content,
        readiness: {stablePolls: 1, attempts: 2, intervalMs: 0, timeoutMs: 50,
          pollIntervalMs: 1}}}).then((deployment) => ({deployment}), (error) => ({error}));
    return {...outcome, shell, root, calls: scripted.calls};
  };
  const fresh = await run(() => {});
  assert.equal(fresh.error, undefined, fresh.error?.message);
  for (const n of [1, 2, 3]) {
    const dir = path.join(fresh.root, 'camp-exec', `lagrange-${n}`);
    assert.ok(fs.statSync(dir).isDirectory(), dir);
    assert.ok(arrayIncludes(fresh.shell.chowns(), `${RUNTIME} ${dir}`), dir);
  }
  const taken = await run((root) => {
    fs.mkdirSync(path.join(root, 'camp-exec', 'lagrange-2'), {recursive: true});
    fs.writeFileSync(path.join(root, 'camp-exec', 'lagrange-2', 'data'), 'foreign');
  });
  assert.equal(taken.error?.code, 'deployment_command_failed');
  assert.equal(taken.error.diagnostic.reason, 'storage_foreign_owner');
  assert.equal(taken.error.diagnostic.owner, OWN);
  assert.equal(fs.readFileSync(path.join(taken.root, 'camp-exec', 'lagrange-2', 'data'),
    'utf8'), 'foreign');
  assert.equal(arraySome(taken.shell.chowns(), (line) => stringIncludes(line, 'lagrange-2')),
    false);
  assert.equal(arraySome(taken.calls, (call) => call.host === '10.0.0.2' &&
    /^docker run -d .*lagrange-node/u.test(call.command)), false);
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
  const host = {ip: '127.0.0.1', role: 'client', sshTarget: 'bench@127.0.0.1',
    repoPath: path.join(shell.dir, 'client'), nodePath: process.execPath};
  const plan = {images: {data: [], client: []}, harnessCommit: commit, tarballs: []};
  const provision = (target, sshCommand) => provisionComparativeHosts({hosts: [target], plan,
    sshRun: shell.sshRun, opts: {},
    pushHarnessCommit: harnessCommitPusher({controllerRoot: controller, sshCommand})});
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
