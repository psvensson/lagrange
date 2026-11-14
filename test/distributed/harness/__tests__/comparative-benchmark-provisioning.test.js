// Owner decisions D1/D2 (2026-11-14): a campaign never obtains an image, the
// harness commit or a reference-client package itself; placing them is an
// explicit provisioning step. These tests hold provisioning's coverage to the
// campaign's own requirement: a host provisioned by it passes the campaign's
// own checks (ensureProductImages over campaignImagesByRole, the harness-commit
// probe, the offline reference-client install over its lockfile), a fresh host
// fails them, and every provisioning failure is typed and names what is
// missing. Evidence ceiling: the hosts are a scripted stand-in (a small state
// machine answering the same ssh commands); nothing runs on GCP.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  campaignImagesByRole,
  ensureProductImages,
} from '../comparative-benchmark-host-preparation.js';
import {
  comparativeProvisioningPlan,
  provisionComparativeHosts,
  readReferenceClientLock,
  referenceClientTarballs,
} from '../comparative-benchmark-provisioning.js';
import {prepareLoadGeneratorCheckout} from '../comparative-benchmark-workload-call-site.js';
import {COMPARATIVE_TARGET} from '../real-product-cluster-deployers.js';
import {
  arrayEvery,
  arrayFilter,
  arrayIncludes,
  arrayJoin,
  arrayMap,
  arraySome,
  objectKeys,
  stringIncludes,
  stringReplace,
  stringTrim,
} from '../real-product-captured-intrinsics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const LOCK = readReferenceClientLock(ROOT);
const COMMIT = 'c'.repeat(40);
const REPO = '/srv/lagrange-campaign';
const LAGRANGE = `psvensson/lagrange@sha256:${'e'.repeat(64)}`;
const EXIT = '\n__exit_code=';
const DATA = [{ip: '10.0.0.1', role: 'data'}, {ip: '10.0.0.2', role: 'data'},
  {ip: '10.0.0.3', role: 'data'}];
const CLIENT = {ip: '10.0.0.9', role: 'client', repoPath: REPO, nodePath: '/opt/node/bin/node'};
const ALL_TARGETS = Object.values(COMPARATIVE_TARGET);

function exited(code, text = '') {
  return `${text}${EXIT}${code}`;
}

function quotedWord(command, pattern) {
  const match = pattern.exec(command);
  return match ? stringReplace(match[1], /^'|'$/gu, '') : null;
}

// One fresh host: no image, no checkout, an empty npm cache.
function freshHost() {
  return {images: new Set(), commits: new Set(), head: null, cache: new Set(), docker: true};
}

/**
 * A scripted stand-in for the hosts: it answers the ssh commands provisioning
 * and the campaign's checks send, from a per-host state that `docker pull`,
 * the commit push, `git checkout` and `npm cache add` change. Unknown commands
 * fail the test, so nothing is answered by accident.
 */
function createFakeHosts(ips) {
  const hosts = Object.fromEntries(arrayMap(ips, (ip) => [ip, freshHost()]));
  const calls = [];
  const rules = [
    [/^docker info /u, (state) => (state.docker ? exited(0, '27.5.1') :
      exited(1, 'permission denied while trying to connect to the Docker daemon socket'))],
    [/^docker pull /u, (state, command) => {
      state.images.add(quotedWord(command, /^docker pull --quiet (\S+) /u));
      return exited(0, 'sha256:pulled');
    }],
    [/^docker image inspect --format '\{\{\.Id\}\}' /u, (state, command) => {
      const image = quotedWord(command, /^docker image inspect --format '\{\{\.Id\}\}' (\S+) /u);
      return state.images.has(image) ? exited(0, `sha256:${'d'.repeat(64)}`) :
        exited(1, `Error: No such image: ${image}`);
    }],
    [/git init --quiet/u, () => exited(0)],
    [/git checkout --detach --quiet/u, (state, command) => {
      const commit = quotedWord(command, /git checkout --detach --quiet (\S+)/u);
      if (!state.commits.has(commit)) return exited(1, `error: pathspec '${commit}' did not match`);
      state.head = commit;
      return exited(0);
    }],
    [/git cat-file -e/u, (state, command) => (state.commits.has(
      quotedWord(command, /git cat-file -e '([0-9a-f]+)\^\{commit\}'/u)) ? exited(0) :
      exited(128, 'fatal: Not a valid object name'))],
    [/git worktree add/u, (state) => state.head ?? 'no head'],
    [/rev-parse HEAD/u, (state) => exited(0, state.head ?? '')],
    [/npm cache add /u, (state, command) => {
      state.cache.add(quotedWord(command, /npm cache add (\S+) /u));
      return exited(0, '');
    }],
    [/npm ci --offline --prefix test\/distributed\/reference-client/u, (state) => {
      const missing = arrayFilter(referenceClientTarballs(LOCK),
        (tarball) => !state.cache.has(tarball.resolved));
      return missing.length === 0 ? exited(0, 'added 12 packages') : exited(1, arrayJoin(
        arrayMap(missing, (tarball) => `npm error request to ${tarball.resolved} failed: ` +
          'cache mode is \'only-if-cached\' but no cached response is available.'), '\n'));
    }],
    [/ npm ci 2>&1/u, () => exited(0, 'added 900 packages')],
  ];
  async function sshRun(ip, _opts, command) {
    calls.push({ip, command});
    const state = hosts[ip];
    for (const [pattern, answer] of rules) {
      if (pattern.test(command)) return answer(state, command);
    }
    throw new Error(`fake host ${ip} has no answer for: ${command}`);
  }
  const pushHarnessCommit = async ({host, harnessCommit}) => {
    hosts[host.ip].commits.add(harnessCommit);
  };
  return {hosts, calls, sshRun, pushHarnessCommit};
}

function planFor(targets) {
  return comparativeProvisioningPlan({targets, lagrangeImage: LAGRANGE, harnessCommit: COMMIT,
    referenceClientLock: LOCK});
}

// The campaign's own preparation checks, exactly as runCampaign calls them.
async function campaignChecks(fake, targets) {
  const images = campaignImagesByRole({targets, lagrangeImage: LAGRANGE});
  await ensureProductImages({hosts: DATA, role: 'data', images: images.data,
    sshRun: fake.sshRun, opts: {}});
  await ensureProductImages({hosts: [CLIENT], role: 'client', images: images.client,
    sshRun: fake.sshRun, opts: {}});
  return prepareLoadGeneratorCheckout({sshRun: fake.sshRun, opts: {}, host: CLIENT,
    harnessCommit: COMMIT, campaignId: 'bench-x'});
}

function subsets(items) {
  return arrayFilter(arrayMap(Array.from({length: 2 ** items.length}, (_unused, mask) => mask),
    (mask) => arrayFilter(items, (_item, index) => (mask >> index) & 1)),
  (subset) => subset.length > 0);
}

test('the provisioning plan is the campaign\'s own requirement: images per role, the ' +
  'reference-client lockfile, the harness commit', () => {
  for (const targets of subsets(ALL_TARGETS)) {
    const plan = planFor(targets);
    assert.deepEqual(plan.images, campaignImagesByRole({targets, lagrangeImage: LAGRANGE}));
    assert.equal(plan.harnessCommit, COMMIT);
  }
  const locked = arrayFilter(objectKeys(LOCK.packages), (key) => key !== '');
  const tarballs = referenceClientTarballs(LOCK);
  assert.equal(tarballs.length, locked.length);
  assert.ok(arrayIncludes(arrayMap(tarballs, (tarball) => tarball.name), 'mysql2'));
  assert.ok(arrayEvery(tarballs, (tarball) => /^https:\/\/\S+\.tgz$/u.test(tarball.resolved) &&
    /^sha512-/u.test(tarball.integrity)));
});

test('a fresh host fails the campaign\'s checks; after provisioning every target set passes ' +
  'them with nothing left for the campaign to obtain', async () => {
  const fresh = createFakeHosts([...arrayMap(DATA, (host) => host.ip), CLIENT.ip]);
  await assert.rejects(campaignChecks(fresh, ALL_TARGETS),
    (error) => error.code === 'image_unavailable');
  for (const targets of subsets(ALL_TARGETS)) {
    const fake = createFakeHosts([...arrayMap(DATA, (host) => host.ip), CLIENT.ip]);
    const receipt = await provisionComparativeHosts({hosts: [...DATA, CLIENT],
      plan: planFor(targets), sshRun: fake.sshRun, opts: {},
      pushHarnessCommit: fake.pushHarnessCommit});
    const prepared = await campaignChecks(fake, targets);
    assert.equal(prepared.host.driverInstall.status, 'installed', arrayJoin(targets, ','));
    assert.equal(receipt.client.head, COMMIT);
    assert.equal(receipt.client.tarballs.length, referenceClientTarballs(LOCK).length);
    // Provisioning used the network on purpose; the campaign's checks did not.
    const pulls = arrayFilter(fake.calls, (call) => /^docker pull /u.test(call.command));
    const required = campaignImagesByRole({targets, lagrangeImage: LAGRANGE});
    assert.equal(pulls.length, DATA.length * required.data.length + required.client.length);
  }
});

test('each half of provisioning is needed: without the cache the TiDB arm\'s install ' +
  'misses the lockfile\'s tarballs; without the commit the campaign refuses', async () => {
  const fake = createFakeHosts([CLIENT.ip]);
  fake.hosts[CLIENT.ip].commits.add(COMMIT);
  fake.hosts[CLIENT.ip].head = COMMIT;
  const prepared = await prepareLoadGeneratorCheckout({sshRun: fake.sshRun, opts: {},
    host: CLIENT, harnessCommit: COMMIT, campaignId: 'bench-x'});
  assert.deepEqual(prepared.host.driverInstall.missing,
    arrayMap(referenceClientTarballs(LOCK), (tarball) => tarball.resolved));
  const bare = createFakeHosts([CLIENT.ip]);
  await assert.rejects(prepareLoadGeneratorCheckout({sshRun: bare.sshRun, opts: {},
    host: CLIENT, harnessCommit: COMMIT, campaignId: 'bench-x'}),
  (error) => error.code === 'load_generator_commit_absent');
});

async function provisioningFailure(fake, targets = ALL_TARGETS) {
  return provisionComparativeHosts({hosts: [...DATA, CLIENT], plan: planFor(targets),
    sshRun: fake.sshRun, opts: {}, pushHarnessCommit: fake.pushHarnessCommit})
    .then(() => null, (error) => error);
}

test('provisioning failures are typed and name host, role and the missing item', async () => {
  const noDocker = createFakeHosts([...arrayMap(DATA, (host) => host.ip), CLIENT.ip]);
  noDocker.hosts['10.0.0.2'].docker = false;
  const unreachable = await provisioningFailure(noDocker);
  assert.equal(unreachable.code, 'provisioning_docker_unreachable');
  assert.deepEqual([unreachable.diagnostic.host, unreachable.diagnostic.role],
    ['10.0.0.2', 'data']);
  assert.equal(arraySome(noDocker.calls, (call) => call.ip === '10.0.0.2' &&
    /^docker pull/u.test(call.command)), false);

  const refusedPull = createFakeHosts([...arrayMap(DATA, (host) => host.ip), CLIENT.ip]);
  const pull = async (ip, opts, command) => (ip === '10.0.0.3' &&
    stringIncludes(command, 'pingcap/tikv') ? exited(1, 'toomanyrequests: rate limit') :
    refusedPull.sshRun(ip, opts, command));
  const notPlaced = await provisionComparativeHosts({hosts: [...DATA, CLIENT],
    plan: planFor(ALL_TARGETS), sshRun: pull, opts: {},
    pushHarnessCommit: refusedPull.pushHarnessCommit}).then(() => null, (error) => error);
  assert.equal(notPlaced.code, 'provisioning_image_not_placed');
  assert.deepEqual([notPlaced.diagnostic.host, notPlaced.diagnostic.role,
    notPlaced.diagnostic.image], ['10.0.0.3', 'data', 'pingcap/tikv:v8.5.8']);
  assert.match(notPlaced.message, /rate limit/u);

  const noPush = createFakeHosts([...arrayMap(DATA, (host) => host.ip), CLIENT.ip]);
  noPush.pushHarnessCommit = async () => {
    throw new Error('Permission denied (publickey)');
  };
  const notPushed = await provisioningFailure(noPush);
  assert.equal(notPushed.code, 'provisioning_commit_not_placed');
  assert.deepEqual([notPushed.diagnostic.host, notPushed.diagnostic.step,
    notPushed.diagnostic.harnessCommit], [CLIENT.ip, 'push', COMMIT]);
  assert.match(notPushed.message, /publickey/u);
});

test('a cache that does not serve the offline install fails provisioning, naming the tarballs',
  async () => {
    const fake = createFakeHosts([...arrayMap(DATA, (host) => host.ip), CLIENT.ip]);
    const [first] = referenceClientTarballs(LOCK);
    // `npm cache add` reports success yet the cache does not hold the tarball.
    const lossy = async (ip, opts, command) => (stringIncludes(command, 'npm cache add') &&
      stringIncludes(command, first.resolved) ? exited(0) : fake.sshRun(ip, opts, command));
    const failure = await provisionComparativeHosts({hosts: [...DATA, CLIENT],
      plan: planFor(ALL_TARGETS), sshRun: lossy, opts: {},
      pushHarnessCommit: fake.pushHarnessCommit}).then(() => null, (error) => error);
    assert.equal(failure.code, 'provisioning_cache_not_seeded');
    assert.deepEqual(failure.diagnostic.missing, [first.resolved]);
    assert.equal(failure.diagnostic.host, CLIENT.ip);
  });

// The provisioning script places, it does not describe: its placement step
// runs the runner's provisioning mode with the operator's campaign options.
test('provision-gcp.sh is valid bash and its placement step runs the runner\'s provisioning',
  () => {
    const script = path.join(ROOT, 'docs/benchmarks/cloud/provision-gcp.sh');
    const bash = spawnSync('sh', ['-c', 'command -v bash'], {encoding: 'utf8'}).stdout;
    const bashPath = stringTrim(bash);
    const checked = spawnSync(bashPath, ['-n', script], {encoding: 'utf8'});
    assert.equal(checked.status, 0, checked.stderr);
    const text = fs.readFileSync(script, 'utf8');
    assert.match(text, /"\$\{1:-\}" = "--place"/u);
    assert.match(text, /run-comparative-benchmarks\.mjs" --execution-target gcp --provision /u);
  });

test('the runner\'s provisioning mode is GCP only and needs an absolute client checkout',
  () => {
    const runner = path.join(ROOT, 'docs/benchmarks/cloud/run-comparative-benchmarks.mjs');
    const run = (args) => spawnSync(process.execPath, [runner, ...args],
      {encoding: 'utf8', cwd: ROOT, env: {...process.env, EXECUTION_TARGET: ''}});
    const lab = run(['--provision']);
    assert.notEqual(lab.status, 0);
    assert.match(lab.stderr, /--provision is only for --execution-target gcp/u);
    const relative = run(['--execution-target', 'gcp', '--provision',
      '--hosts', '10.0.0.1,10.0.0.2,10.0.0.3,10.0.0.9', '--client-checkout', 'lagrange']);
    assert.notEqual(relative.status, 0);
    assert.match(relative.stderr, /--provision needs --client-checkout <absolute path>/u);
  });
