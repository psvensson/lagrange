// GCP provisioning witnessed through the production entrypoint: the real CLI
// (`run-comparative-benchmarks.mjs --execution-target gcp --provision`, as
// provision-gcp.sh --place runs it), then the real campaign entry (the same CLI
// without --provision) on the same hosts. Only the remote executor (`ssh`) and
// the controller's `git push` are scripted (comparative-benchmark-fake-remote-
// hosts-fixture.js); the manifest, the harness identity (the real git HEAD),
// the image requirement, provisioning, host preparation and the campaign's own
// checks run as in production. Negative twins: the same hosts without
// provisioning make the campaign refuse with image_unavailable,
// load_generator_commit_absent and (TiDB arm) offline_cache_incomplete.
// Evidence ceiling: nothing runs on GCP; no docker, registry or npm runs.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {gitProcessEnvironment} from '../../../../scripts/checks/git-process-environment.js';
import {measureCheckoutSourceFingerprint} from '../../../../src/diagnostics/runtime-content-fingerprint.js';
import {execGit} from '../../../../scripts/checks/git-invocation.js';

import {
  COMPARATIVE_SMOKE_PROFILE,
  buildComparativeCampaignManifest,
} from '../comparative-benchmark-campaign-manifest.js';
import {campaignImagesByRole} from '../comparative-benchmark-host-preparation.js';
import {
  createRemoteWorkloadRunner,
  prepareLoadGeneratorCheckout,
} from '../comparative-benchmark-workload-call-site.js';
import {
  createFakeRemoteHosts,
  lockfileTarballs,
  runFakeProcess,
} from './comparative-benchmark-fake-remote-hosts-fixture.js';
import {
  arrayFilter,
  arrayFindIndex,
  arrayIncludes,
  arrayMap,
  arraySome,
  arrayEvery,
  stringIncludes,
  stringReplace,
  stringTrim,
} from '../real-product-captured-intrinsics.js';
import {fixedLocaleCommand} from '../real-product-remote-shell.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const RUNNER = path.join(ROOT, 'docs/benchmarks/cloud/run-comparative-benchmarks.mjs');
const DATA = ['10.20.0.1', '10.20.0.2', '10.20.0.3'];
const CLIENT = '10.20.0.9';
const CHECKOUT = '/srv/lagrange-campaign';
// The operator's key: every ssh connection, the campaign's and the commit
// push's (through GIT_SSH_COMMAND, read by a shell), must offer it.
const SSH_KEY = '/keys/bench key';
const LAGRANGE = `psvensson/lagrange@sha256:${'e'.repeat(64)}`;
const TARGETS = ['lagrange', 'tidb-tikv', 'pg-single-primary'];
const COMMON = ['--execution-target', 'gcp', '--hosts', [...DATA, CLIENT].join(','),
  '--ssh-user', 'bench', '--ssh-key', SSH_KEY, '--client-checkout', CHECKOUT, '--client-node', '/opt/node/bin/node',
  '--lagrange-image', LAGRANGE, '--targets', TARGETS.join(','),
  '--vm-image-family', 'ubuntu-2404-lts-amd64', '--vm-image-project', 'ubuntu-os-cloud',
  '--vm-boot-disk-size', '50GB', '--vm-boot-disk-type', 'pd-ssd',
  '--vm-firewall-allow', 'tcp:1-65535,udp:1-65535,icmp'];
const VM = {imageFamily: 'ubuntu-2404-lts-amd64', imageProject: 'ubuntu-os-cloud',
  bootDiskSize: '50GB', bootDiskType: 'pd-ssd', firewallAllow: 'tcp:1-65535,udp:1-65535,icmp'};
const REFUSALS = ['image_unavailable', 'load_generator_commit_absent', 'offline_cache_incomplete'];
const HEAD = stringTrim(execGit(['rev-parse', 'HEAD'], {cwd: ROOT,
  encoding: 'utf8'}));
const REQUIRED = campaignImagesByRole({targets: TARGETS, lagrangeImage: LAGRANGE});

function cli(fake, args) {
  return spawnSync(process.execPath, [RUNNER, ...COMMON, ...args], {cwd: ROOT,
    encoding: 'utf8', env: fake.env, timeout: 120000});
}

function hosts() {
  return createFakeRemoteHosts([...DATA, CLIENT], {sshKey: SSH_KEY});
}

function commandsOn(state, ip, pattern) {
  return arrayFilter(state.log, (entry) => entry.ip === ip && pattern.test(entry.command));
}

function pulled(state, ip) {
  return arrayMap(commandsOn(state, ip, /^docker pull --quiet /u), (entry) =>
    /^docker pull --quiet '?([^' ]+)'? /u.exec(entry.command)[1]);
}

// The campaign's entry on the same hosts; the scripted hosts stop it at the
// first command after its host preparation.
function campaign(fake) {
  const result = cli(fake, ['--campaign-id', 'bench-entry-1']);
  return {result, state: fake.state(), stderr: result.stderr};
}

test('--provision places, through the real CLI, exactly what the campaign checks for; the ' +
  'campaign then passes its whole host preparation', () => {
  assert.match(HEAD, /^[0-9a-f]{40}$/u);
  const fake = hosts();
  const placed = cli(fake, ['--provision']);
  assert.equal(placed.status, 0, placed.stderr);
  const state = fake.state();
  assert.deepEqual(state.unscripted, []);
  // Docker is checked on every host before anything is placed.
  const firstPlacement = arrayFindIndex(state.log, (entry) =>
    !/^docker info /u.test(entry.command));
  assert.deepEqual(arrayMap(state.log.slice(0, firstPlacement), (entry) => entry.ip),
    [...DATA, CLIENT]);
  // Every required image, by the exact reference, on every host of its role.
  for (const ip of DATA) assert.deepEqual(pulled(state, ip).sort(), [...REQUIRED.data].sort());
  assert.deepEqual(pulled(state, CLIENT), REQUIRED.client);
  // The harness commit is the controller's HEAD: pushed, then checked out.
  assert.deepEqual(state.pushes, [{url: `ssh://bench@${CLIENT}${CHECKOUT}`,
    refspec: `+${HEAD}:refs/bench/harness`}]);
  // The push connected with the campaign's ssh options and the operator's key.
  assert.deepEqual(state.sshRefused, []);
  assert.equal(state.receivePacks.length, 1);
  assert.equal(state.receivePacks[0].command, `git-receive-pack '${CHECKOUT}'`);
  assert.equal(state.receivePacks[0].options.i, SSH_KEY);
  assert.ok(arrayIncludes(state.receivePacks[0].options.o, 'BatchMode=yes'));
  const checkout = commandsOn(state, CLIENT, /git checkout --detach --quiet /u);
  assert.equal(checkout.length, 1);
  assert.ok(stringIncludes(checkout[0].command, HEAD));
  assert.equal(state.hosts[CLIENT].head, HEAD);
  // The checkout's install, then every lockfile tarball into the npm cache.
  assert.equal(commandsOn(state, CLIENT, / npm ci 2>&1/u).length, 1);
  const added = arrayMap(commandsOn(state, CLIENT, /npm cache add /u), (entry) =>
    /npm cache add '?([^' ]+)'? /u.exec(entry.command)[1]);
  assert.deepEqual(added, lockfileTarballs());
  assert.equal(state.hosts[CLIENT].modules, true);
  // The record states, per host, the VM image named and what was observed.
  const record = JSON.parse(placed.stdout).provisioned;
  assert.equal(record.client.head, HEAD);
  for (const entry of [...record.data, record.client]) {
    assert.deepEqual(entry.vm, VM);
    assert.equal(entry.dockerServer, '27.5.1');
    assert.ok(arrayEvery(entry.images, (image) => /^sha256:[0-9a-f]{64}$/u.test(image.imageId)));
  }
  assert.deepEqual(arrayMap(record.data, (entry) => entry.host), DATA);
  assert.equal(record.client.git, 'git version 2.43.0');
  assert.equal(record.client.node, 'v22.23.2');

  const after = campaign(fake);
  assert.equal(after.result.status !== 0 && after.state.pastPreparation, true, after.stderr);
  for (const code of REFUSALS) assert.ok(!stringIncludes(after.stderr, code), after.stderr);
  const install = commandsOn(after.state, CLIENT, /npm ci --offline --prefix /u);
  assert.equal(install[install.length - 1].exitCode, 0, 'the campaign\'s offline install');
  assert.deepEqual(after.state.unscripted, []);
});

test('negative twins: without provisioning the campaign refuses with image_unavailable, ' +
  'load_generator_commit_absent and, for the TiDB arm, offline_cache_incomplete', async () => {
  const fresh = hosts();
  const noImages = campaign(fresh);
  assert.match(noImages.stderr, /^image_unavailable: /mu);
  assert.equal(noImages.state.pastPreparation, false);

  const imagesOnly = hosts();
  imagesOnly.update((state) => {
    for (const ip of DATA) state.hosts[ip].images = [...REQUIRED.data];
    state.hosts[CLIENT].images = [...REQUIRED.client];
  });
  const noCommit = campaign(imagesOnly);
  assert.match(noCommit.stderr, /^load_generator_commit_absent: /mu);
  assert.equal(arraySome(noCommit.state.log, (entry) =>
    stringIncludes(entry.command, 'worktree add')), false);

  const noCache = hosts();
  noCache.update((state) => {
    for (const ip of DATA) state.hosts[ip].images = [...REQUIRED.data];
    state.hosts[CLIENT].images = [...REQUIRED.client];
    state.hosts[CLIENT].commits = [HEAD];
    state.hosts[CLIENT].head = HEAD;
  });
  const uncached = campaign(noCache);
  assert.equal(uncached.state.pastPreparation, true, uncached.stderr);
  const install = commandsOn(uncached.state, CLIENT, /npm ci --offline --prefix /u);
  assert.equal(install[install.length - 1].exitCode, 1);
  // The TiDB arm's refusal is raised when its workload runs, after a deployment
  // the scripted hosts do not perform: the campaign's own preparation and
  // workload runner, over the same scripted executor, refuse it.
  const sshRun = async (ip, _opts, command) => runInProcess(noCache, ip, command);
  const host = {ip: CLIENT, repoPath: CHECKOUT, nodePath: '/opt/node/bin/node'};
  const prepared = await prepareLoadGeneratorCheckout({sshRun, opts: {}, host,
    harnessCommit: HEAD, campaignId: 'bench-entry-2'});
  assert.equal(prepared.host.driverInstall.missing.length, 1);
  assert.ok(arrayIncludes(lockfileTarballs(), prepared.host.driverInstall.missing[0]));
  const manifest = buildComparativeCampaignManifest({campaignId: 'bench-entry-2',
    profile: COMPARATIVE_SMOKE_PROFILE, targets: ['tidb-tikv']});
  await assert.rejects(createRemoteWorkloadRunner({sshRun, opts: {}, host: prepared.host,
    harnessCommit: HEAD, campaignId: 'bench-entry-2'})({system: 'tidb-tikv'}, manifest.runs[0]),
  (error) => error.diagnostic?.reason === 'offline_cache_incomplete');
});

// The fixture's ssh answer, in process, for the consumer half of the cache twin,
// to the command as the campaign's ssh runner sends it.
function runInProcess(fake, ip, command) {
  const writes = [];
  const write = process.stdout.write;
  process.env.FAKE_REMOTE_HOSTS_STATE = fake.env.FAKE_REMOTE_HOSTS_STATE;
  process.stdout.write = (chunk) => writes.push(String(chunk)) > 0;
  let code;
  try {
    code = runFakeProcess('ssh', ['-o', 'BatchMode=yes', `bench@${ip}`,
      fixedLocaleCommand(command)]);
  } finally {
    process.stdout.write = write;
  }
  if (code !== 0) throw new Error(`exit ${code}: ${writes.join('')}`);
  return writes.join('');
}

test('provisioning failures through the CLI: docker is checked everywhere first; nothing ' +
  'is placed after a failed placement; a pull that does not place the image fails the ' +
  'campaign\'s own re-check', () => {
  const noDocker = hosts();
  noDocker.update((state) => {
    state.hosts[DATA[1]].docker = false;
  });
  const unreachable = cli(noDocker, ['--provision']);
  assert.match(unreachable.stderr, /^provisioning_docker_unreachable: .*10\.20\.0\.2/mu);
  assert.equal(arraySome(noDocker.state().log, (entry) =>
    /^docker pull/u.test(entry.command)), false);

  const refused = hosts();
  refused.update((state) => {
    state.hosts[DATA[2]].refusePull = 'pingcap/tikv:v8.5.8';
  });
  const notPlaced = cli(refused, ['--provision']);
  assert.match(notPlaced.stderr, /^provisioning_image_not_placed: .*pingcap\/tikv:v8\.5\.8.*10\.20\.0\.3/mu);
  const log = refused.state().log;
  const failedAt = arrayFindIndex(log, (entry) => entry.exitCode === 1);
  assert.equal(failedAt, log.length - 1, 'nothing after the failed placement');
  assert.deepEqual(refused.state().pushes, []);

  const lossy = hosts();
  lossy.update((state) => {
    state.hosts[DATA[0]].lossyPulls = ['mysql:8.4.11'];
  });
  const unverified = cli(lossy, ['--provision']);
  assert.match(unverified.stderr, /^image_unavailable: image mysql:8\.4\.11 is not on 10\.20\.0\.1/mu);

  const partialCache = hosts();
  const [first] = lockfileTarballs();
  partialCache.update((state) => {
    state.hosts[CLIENT].lossyCacheAdds = [first];
  });
  const unseeded = cli(partialCache, ['--provision']);
  assert.match(unseeded.stderr, /^provisioning_cache_not_seeded: /mu);
  assert.ok(stringIncludes(unseeded.stderr, first));
});

// Every provisioning failure branch, through the real CLI: the typed code and
// its named fields, the failed step is the last thing that ran on its host, and
// provisioning never reports success.
function provisionFailing(change, args = []) {
  const fake = hosts();
  fake.update(change);
  const result = cli(fake, ['--provision', ...args]);
  assert.notEqual(result.status, 0);
  assert.ok(!stringIncludes(result.stdout, 'provisioned'), result.stdout);
  return {stderr: result.stderr, state: fake.state()};
}

function ranOn(state, ip, pattern) {
  return arraySome(state.log, (entry) => entry.ip === ip && pattern.test(entry.command));
}

test('a failed root npm ci is provisioning_dependencies_not_installed; nothing after it runs',
  () => {
    const {stderr, state} = provisionFailing((s) => {
      s.hosts[CLIENT].npmCiFails = true;
    });
    assert.match(stderr, new RegExp('^provisioning_dependencies_not_installed: npm ci failed in ' +
      `${CHECKOUT} on 10\\.20\\.0\\.9$`, 'mu'));
    assert.match(stderr, /^diagnostic: .*"host":"10\.20\.0\.9".*Unable to authenticate/mu);
    assert.equal(ranOn(state, CLIENT, /npm cache add|npm ci --offline/u), false);
    assert.equal(state.hosts[CLIENT].modules, false);
  });

test('a refused cache add is provisioning_cache_not_seeded naming it; no further add and no ' +
  'offline install', () => {
  const [, second] = lockfileTarballs();
  const {stderr, state} = provisionFailing((s) => {
    s.hosts[CLIENT].refuseCacheAdd = second;
  });
  assert.match(stderr, new RegExp(`^provisioning_cache_not_seeded: could not add ${
    stringReplace(second, /[.*+?^${}()|[\]\\/]/gu, '\\$&')} `, 'mu'));
  assert.equal(commandsOn(state, CLIENT, /npm cache add /u).length, 2);
  assert.equal(ranOn(state, CLIENT, /npm ci --offline/u), false);
});

test('a refused checkout and a checkout that lands elsewhere are provisioning_commit_not_placed ' +
  'at their step; the install never runs', () => {
  const refused = provisionFailing((s) => {
    s.hosts[CLIENT].refuseCheckout = true;
  });
  assert.match(refused.stderr, new RegExp('^provisioning_commit_not_placed: could not check out ' +
    `the harness commit ${HEAD} in ${CHECKOUT} on 10\\.20\\.0\\.9: error: Your local changes`, 'mu'));
  assert.match(refused.stderr, /^diagnostic: .*"step":"check out"/mu);
  assert.equal(ranOn(refused.state, CLIENT, / npm ci 2>&1/u), false);
  const elsewhere = 'f'.repeat(40);
  const moved = provisionFailing((s) => {
    s.hosts[CLIENT].checkoutLandsOn = elsewhere;
  });
  assert.match(moved.stderr, new RegExp(`^provisioning_commit_not_placed: checkout ${CHECKOUT} ` +
    `on 10\\.20\\.0\\.9 is at ${elsewhere}, not the harness commit ${HEAD}$`, 'mu'));
  assert.equal(ranOn(moved.state, CLIENT, / npm ci 2>&1/u), false);
});

test('with --lagrange-image-content the data hosts are re-checked by content: content they do ' +
  'not hold is image_unavailable before anything is placed on the load generator', () => {
  const content = `sha256:${'0'.repeat(64)}`;
  const {stderr, state} = provisionFailing(() => {}, ['--lagrange-image-content', content]);
  assert.match(stderr, /^image_unavailable: pinned image on 10\.20\.0\.1: reference_content_mismatch$/mu);
  assert.deepEqual(state.pushes, []);
  assert.equal(ranOn(state, CLIENT, /^docker pull|git (init|checkout)|npm /u), false);
});

test('the load generator\'s git and Node are checked before anything is placed: absent is ' +
  'provisioning_tool_unavailable, below the engines floor provisioning_node_below_floor', () => {
  const noGit = provisionFailing((s) => {
    s.hosts[CLIENT].gitMissing = true;
  });
  assert.match(noGit.stderr, /^provisioning_tool_unavailable: git is not usable on the load generator 10\.20\.0\.9 /mu);
  assert.equal(arraySome(noGit.state.log, (entry) => /^docker pull/u.test(entry.command)), false);
  const oldNode = provisionFailing((s) => {
    s.hosts[CLIENT].nodeVersion = 'v20.11.0';
  });
  assert.match(oldNode.stderr, /^provisioning_node_below_floor: Node v20\.11\.0 at \/opt\/node\/bin\/node on the load generator 10\.20\.0\.9 is below the engines floor \d+\.\d+\.\d+$/mu);
  assert.equal(arraySome(oldNode.state.log, (entry) => /^docker pull/u.test(entry.command)), false);
});

test('campaign CLI binds the expected boot source to the requested product revision before host work',
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-revision-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const runner = path.join(root, path.relative(ROOT, RUNNER));
    fs.mkdirSync(path.dirname(runner), {recursive: true});
    fs.copyFileSync(RUNNER, runner);
    for (const dir of ['test', 'scripts']) fs.symlinkSync(path.join(ROOT, dir), path.join(root, dir));
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(root, 'package.json'));
    fs.mkdirSync(path.join(root, 'src/diagnostics'), {recursive: true});
    for (const name of ['source-fingerprint.js', 'runtime-content-fingerprint.js']) {
      const file = path.join('src/diagnostics', name);
      fs.copyFileSync(path.join(ROOT, file), path.join(root, file));
    }
    const git = (...args) => stringTrim(execGit(args, {cwd: root, encoding: 'utf8',
      env: gitProcessEnvironment()}));
    const commit = () => {
      git('add', '.');
      git('-c', 'user.name=Witness', '-c', 'user.email=witness@example.org',
        '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
      return git('rev-parse', 'HEAD');
    };
    git('init', '-q');
    const old = commit();
    const oldFingerprint = await measureCheckoutSourceFingerprint(root);
    fs.writeFileSync(path.join(root, 'src/build.js'), 'export default 1;\n');
    const product = commit();
    fs.writeFileSync(path.join(root, 'harness.txt'), 'harness-only change\n');
    assert.notEqual(commit(), product);

    const touches = path.join(root, 'ssh-called');
    fs.writeFileSync(path.join(root, 'ssh'), '#!/bin/sh\ntouch "$SSH_WITNESS"\nexit 1\n',
      {mode: 0o755});
    const invoke = (args) => spawnSync(process.execPath, [runner, ...args], {
      cwd: root, encoding: 'utf8', timeout: 30000,
      env: {...gitProcessEnvironment(), EXECUTION_TARGET: 'lab', SSH_WITNESS: touches,
        PATH: root + path.delimiter + process.env.PATH},
    });
    const negative = (args, reason) => {
      const result = invoke(args);
      assert.ok(result.status > 0, result.stderr);
      assert.match(result.stderr, reason);
      assert.equal(fs.existsSync(touches), false);
    };
    const stale = ['--lagrange-revision', old];
    const mismatch = /identity_unverified: requested image revision contradicts/u;
    negative(['--dry-run', '--from-recorded-facts', ...stale], mismatch);
    negative([...COMMON, '--provision', ...stale], mismatch);
    negative([...COMMON, '--dry-run', '--lagrange-revision', product,
      '--lagrange-src-fingerprint', oldFingerprint], mismatch);
    const external = ['--lagrange-revision', 'f'.repeat(40)];
    negative([...COMMON, '--dry-run', ...external], /external image revision requires/u);
    for (const args of [
      ['--lagrange-revision', product],
      [...stale, '--lagrange-src-fingerprint', oldFingerprint],
      [...external, '--lagrange-src-fingerprint', oldFingerprint],
    ]) {
      const result = invoke([...COMMON, '--dry-run', ...args]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).executionTarget, 'gcp');
    }
  });
