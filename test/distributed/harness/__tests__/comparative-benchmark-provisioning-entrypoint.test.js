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
import {execFileSync, spawnSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

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
  arrayMap,
  arraySome,
  stringIncludes,
  stringTrim,
} from '../real-product-captured-intrinsics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const RUNNER = path.join(ROOT, 'docs/benchmarks/cloud/run-comparative-benchmarks.mjs');
const DATA = ['10.20.0.1', '10.20.0.2', '10.20.0.3'];
const CLIENT = '10.20.0.9';
const CHECKOUT = '/srv/lagrange-campaign';
const LAGRANGE = `psvensson/lagrange@sha256:${'e'.repeat(64)}`;
const TARGETS = ['lagrange', 'tidb-tikv', 'pg-single-primary'];
const COMMON = ['--execution-target', 'gcp', '--hosts', [...DATA, CLIENT].join(','),
  '--ssh-user', 'bench', '--client-checkout', CHECKOUT, '--client-node', '/opt/node/bin/node',
  '--lagrange-image', LAGRANGE, '--targets', TARGETS.join(',')];
const REFUSALS = ['image_unavailable', 'load_generator_commit_absent', 'offline_cache_incomplete'];
const HEAD = stringTrim(execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT,
  encoding: 'utf8'}));
const REQUIRED = campaignImagesByRole({targets: TARGETS, lagrangeImage: LAGRANGE});

function cli(fake, args) {
  return spawnSync(process.execPath, [RUNNER, ...COMMON, ...args], {cwd: ROOT,
    encoding: 'utf8', env: fake.env, timeout: 120000});
}

function hosts() {
  return createFakeRemoteHosts([...DATA, CLIENT]);
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
  assert.equal(JSON.parse(placed.stdout).provisioned.client.head, HEAD);

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
  assert.deepEqual(prepared.host.driverInstall.missing, lockfileTarballs());
  const manifest = buildComparativeCampaignManifest({campaignId: 'bench-entry-2',
    profile: COMPARATIVE_SMOKE_PROFILE, targets: ['tidb-tikv']});
  await assert.rejects(createRemoteWorkloadRunner({sshRun, opts: {}, host: prepared.host,
    harnessCommit: HEAD, campaignId: 'bench-entry-2'})({system: 'tidb-tikv'}, manifest.runs[0]),
  (error) => error.diagnostic?.reason === 'offline_cache_incomplete');
});

// The fixture's ssh answer, in process, for the consumer half of the cache twin.
function runInProcess(fake, ip, command) {
  const writes = [];
  const write = process.stdout.write;
  process.env.FAKE_REMOTE_HOSTS_STATE = fake.env.FAKE_REMOTE_HOSTS_STATE;
  process.stdout.write = (chunk) => writes.push(String(chunk)) > 0;
  let code;
  try {
    code = runFakeProcess('ssh', ['-o', 'BatchMode=yes', `bench@${ip}`, command]);
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
