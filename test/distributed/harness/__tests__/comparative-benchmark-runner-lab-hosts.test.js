// D25: lab hosts are held under the lab convention in name order and released
// failure-safe; a busy host refuses the campaign naming its holder after the
// holds already taken are released; the thermal gate runs on every held host
// from its own checkout and a refusal stops the campaign before deployment.
// Substituted: the hold session (scripts/lab/probe.js holdLabMachine) and ssh.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {nativeThermalFixture} from '../../../scripts/native-thermal-fixture.js';
import {test} from 'node:test';

import {
  campaignImagesByRole,
  collectHostFacts,
  resolvePinnedImage,
} from '../comparative-benchmark-host-preparation.js';
import {contentIdentityOf} from '../real-product-identity.js';
import {
  measureLoadGeneratorRequirement,
  checkLabThermalHeadroom,
  holdLabBenchmarkHosts,
  selectLabBenchmarkHosts,
} from '../comparative-benchmark-lab-hosts.js';
import {arrayMap, arraySome} from '../real-product-captured-intrinsics.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';

// A load-generator requirement as the runner measures it (see the measurement
// test below); selection compares a host's free checkout space with it.
const REQUIREMENT = Object.freeze({checkoutBytes: 150 * 2 ** 20,
  evidenceMarginBytes: 64 * 2 ** 20, requiredBytes: 214 * 2 ** 20});

const SENSOR_POLICY = Object.freeze({mode: 'sensor-required', cadence_ms: 0, max_concurrency: 4});
const PACED_POLICY = Object.freeze({mode: 'operator-paced', cadence_ms: 5000, max_concurrency: 1});

function thermalFacts(name, outcome = 'READY', policy = SENSOR_POLICY) {
  const thermalEndpoint = {schema: 'native-thermal-endpoint/v1', python: '/usr/bin/python3',
    entry: '/fixture/observer.py', config: '/fixture/config.json',
    sourceSha256: 'a'.repeat(64), configSha256: 'b'.repeat(64), bootId: `boot-${name}`};
  return {thermalEndpoint, thermalStatus: outcome === 'UNAVAILABLE' ? 2 : 0,
    thermalObservation: {schema: 'lab3-thermal-observation/v1', outcome,
      source_sha256: thermalEndpoint.sourceSha256, config_sha256: thermalEndpoint.configSha256,
      boot_id: thermalEndpoint.bootId, observed_at: 1, execution_policy: policy,
      observations: outcome === 'UNAVAILABLE' ? null : {
        cpu: {path: '/fixture/cpu', millidegrees: 40000},
        ssd: {path: '/fixture/ssd', millidegrees: 40000}},
      cooling_reason: outcome === 'HOLD' ? 'COOLING:cpu' : null,
      abort_reason: null, reason: outcome === 'UNAVAILABLE' ? 'no configured sensors' : null}};
}

const HOSTS = arrayMap(['delta', 'alpha', 'charlie'], (name, index) => ({name,
  ip: `10.0.0.${index + 1}`, sshTarget: `bench@${name}`, repoPath: '/srv/lagrange',
  nodePath: '/usr/bin/node'}));

function fakeHold(busyName = null) {
  const log = [];
  const hold = (machine, request) => {
    log.push(['hold', machine.name, request.purpose]);
    return {
      outcome: Promise.resolve(machine.name === busyName ?
        {state: 'busy', holder: {agent: 'codex:other', project: 'x', purpose: 'test:all',
          startedAt: '2026-11-01T09:00:00Z'}} : {state: 'held'}),
      release: async () => {
        log.push(['release', machine.name]);
      },
    };
  };
  return {hold, log};
}

test('holds every host in name order under purpose bench:<campaignId>', async () => {
  const {hold, log} = fakeHold();
  const sessions = await holdLabBenchmarkHosts({hosts: HOSTS, campaignId: 'bench-1',
    waitMs: 1000, expectedMs: 1000, hold});
  assert.equal(sessions.length, 3);
  assert.deepEqual(log, [['hold', 'alpha', 'bench:bench-1'], ['hold', 'charlie',
    'bench:bench-1'], ['hold', 'delta', 'bench:bench-1']]);
});

test('a busy host releases the holds taken and names its holder', async () => {
  const {hold, log} = fakeHold('charlie');
  await assert.rejects(holdLabBenchmarkHosts({hosts: HOSTS, campaignId: 'bench-1',
    waitMs: 1000, expectedMs: 1000, hold}), (error) => {
    assert.equal(error.code, 'lab_host_unavailable');
    assert.match(error.message, /held by codex:other/u);
    return true;
  });
  assert.deepEqual(log.slice(2), [['release', 'alpha'], ['release', 'charlie']]);
});

test('the thermal gate carries the endpoint and a fixed remote deadline through a real shell',
  async (t) => {
    const native = nativeThermalFixture(t);
    const hosts = HOSTS.map((host) => ({...host, repoPath: process.cwd(),
      nodePath: process.execPath, thermalEndpoint: native.endpoint,
      executionPolicy: SENSOR_POLICY}));
    const calls = [];
    const sshRun = async (_ip, _opts, command, timeoutMs) => {
      calls.push({command, timeoutMs});
      const child = await promisify(execFile)('/bin/sh', ['-c', command], {timeout: timeoutMs});
      assert.equal(child.stderr, '', 'the imported owner must not invoke its CLI');
      return child.stdout;
    };
    const results = await checkLabThermalHeadroom({hosts, sshRun, opts: {}});
    assert.equal(calls.length, 3);
    assert.ok(calls.every((call) => call.timeoutMs === 11 * 60 * 1000));
    assert.match(calls[0].command, /600000/u, 'one remote-clock ten-minute budget plus transport slack');
    assert.ok(calls[0].command.includes(native.endpoint.sourceSha256));
    assert.equal(results.alpha.outcome, 'READY');
    assert.equal(results.alpha.config_sha256, native.endpoint.configSha256);
    assert.equal(fs.readFileSync(native.counter, 'utf8'), '3');
    const wrong = {...hosts[0], thermalEndpoint: {...native.endpoint, configSha256: '0'.repeat(64)}};
    await assert.rejects(checkLabThermalHeadroom({hosts: [wrong], sshRun, opts: {}}),
      (error) => error.code === 'thermal_exhausted');
    assert.equal(fs.readFileSync(native.counter, 'utf8'), '3', 'mismatched bytes never invoke observer');
    const staleRepo = path.join(native.root, 'stale-repo');
    const staleGate = path.join(staleRepo, 'scripts/checks/wait-for-thermal-headroom.js');
    fs.mkdirSync(path.dirname(staleGate), {recursive: true});
    fs.writeFileSync(staleGate, 'throw new Error("stale source must not execute");');
    await assert.rejects(checkLabThermalHeadroom({hosts: [{...hosts[0], repoPath: staleRepo}],
      sshRun, opts: {}}), (error) => error.code === 'thermal_exhausted' &&
      /thermal client source differs/u.test(error.message));
  });

function inventory(entries) {
  return {version: 1, nodes: Object.fromEntries(arrayMap(entries, ([name, lock, extra]) =>
    [name, {name, ip: `192.168.9.${name.length}${name.charCodeAt(0)}`, ssh: `b@${name}`,
      os: 'linux', roles: ['harness'], testCapability: {bootId: `boot-${name}`,
        dockerReachable: true, repoPath: '/srv/lagrange', nodePath: '/usr/bin/node',
        nodeVersion: 'v22.23.2', ...thermalFacts(name), dockerRootFreeBytes: 100 * 2 ** 30,
        repoFreeBytes: 100 * 2 ** 30, machineLock: {state: lock, holder: null}}, ...extra}]))};
}

test('selection prefers free hosts, then held ones the hold will wait for; unreachable, ' +
  'docker-less and duplicate machines are excluded', () => {
  const state = inventory([['a', 'busy'], ['b', 'free'], ['c', 'free'],
    ['d', 'free', {lastProbeFailure: {error: 'ssh timeout'}, testCapability: null}],
    ['e', 'stale-record'], ['f', 'busy'], ['g', 'free',
      {testCapability: {bootId: 'boot-b', dockerReachable: true, ...thermalFacts('b'),
        machineLock: {state: 'free'}}}]]);
  const hosts = selectLabBenchmarkHosts({state, dataHostCount: 3, nodeMinimum: '22.12.0', loadGeneratorRequirement: REQUIREMENT});
  assert.deepEqual(arrayMap(hosts, (host) => [host.name, host.role, host.lock.state]),
    [['b', 'data', 'free'], ['c', 'data', 'free'], ['e', 'data', 'stale-record'],
      ['f', 'client', 'busy']]);
});

test('a host whose checkout runs an old Node is never the load generator', () => {
  const old = {testCapability: {bootId: 'boot-old', dockerReachable: true,
    repoPath: '/srv/lagrange', nodePath: '/usr/bin/node', nodeVersion: 'v14.21.3',
    ...thermalFacts('old'), dockerRootFreeBytes: 100 * 2 ** 30,
    machineLock: {state: 'free'}}};
  const state = inventory([['a', 'free', old], ['b', 'free', {testCapability: {...old.testCapability,
    bootId: 'boot-b'}}], ['c', 'free', {testCapability: {...old.testCapability,
    bootId: 'boot-c'}}], ['d', 'free', {testCapability: {...old.testCapability,
    bootId: 'boot-d'}}]]);
  assert.throws(() => selectLabBenchmarkHosts({state, dataHostCount: 3,
    nodeMinimum: '22.12.0', loadGeneratorRequirement: REQUIREMENT}), (error) => error.code === 'refused_insufficient_host_topology' &&
    /node v14\.21\.3 is below the engines floor/u.test(error.message));
  const mixed = inventory([['a', 'free', old], ['b', 'free'], ['c', 'free'], ['d', 'free']]);
  const hosts = selectLabBenchmarkHosts({state: mixed, dataHostCount: 3,
    nodeMinimum: '22.12.0', loadGeneratorRequirement: REQUIREMENT});
  assert.equal(hosts[3].name, 'd');
  assert.equal(hosts[0].name, 'a', 'an old-Node host can still be a data host');
});

test('sensor unavailability refuses while explicit operator pacing preserves unmeasured facts',
  async (t) => {
    for (const policy of [SENSOR_POLICY, PACED_POLICY]) {
      const native = nativeThermalFixture(t, {policy, outcomes: ['UNAVAILABLE']});
      const host = {...HOSTS[0], repoPath: process.cwd(), nodePath: process.execPath,
        thermalEndpoint: native.endpoint, executionPolicy: policy};
      const sshRun = async (_ip, _opts, command, timeoutMs) =>
        (await promisify(execFile)('/bin/sh', ['-c', command], {timeout: timeoutMs})).stdout;
      if (policy === SENSOR_POLICY) {
        await assert.rejects(checkLabThermalHeadroom({hosts: [host], sshRun, opts: {}}),
          (error) => error.code === 'thermal_exhausted');
      } else {
        const result = (await checkLabThermalHeadroom({hosts: [host], sshRun, opts: {}})).delta;
        assert.equal(result.outcome, 'OPERATOR_PACED');
        assert.equal(result.observation_outcome, 'UNAVAILABLE');
        assert.equal(result.observations, null);
      }
    }
    const old = createScriptedSsh([[/wait-for-thermal-headroom/u, 'thermal: ok cpu 51C']]);
    const facts = thermalFacts('delta');
    await assert.rejects(checkLabThermalHeadroom({hosts: [{...HOSTS[0],
      thermalEndpoint: facts.thermalEndpoint, executionPolicy: SENSOR_POLICY}], sshRun: old.sshRun,
    opts: {}}), (error) => error.code === 'thermal_exhausted');
  });

test('selection requires native identity and policy; fresh missing members never use cached facts', () => {
  const state = inventory([['a', 'free'], ['b', 'free'], ['c', 'free'], ['d', 'free']]);
  Object.assign(state.nodes.b.testCapability, thermalFacts('b', 'UNAVAILABLE'));
  delete state.nodes.c.testCapability.thermalEndpoint;
  const select = (fleet = null) => selectLabBenchmarkHosts({state, fleet, dataHostCount: 3,
    nodeMinimum: '22.12.0', loadGeneratorRequirement: REQUIREMENT});
  assert.throws(() => select(), (error) => {
    const reasons = Object.fromEntries(arrayMap(error.diagnostic.excluded,
      (entry) => [entry.name, entry.reason]));
    assert.equal(reasons.b, 'host-ineligible: native thermal decision unavailable');
    assert.equal(reasons.c, reasons.b);
    return error.code === 'refused_insufficient_host_topology';
  });
  Object.assign(state.nodes.b.testCapability, thermalFacts('b', 'UNAVAILABLE', PACED_POLICY));
  Object.assign(state.nodes.c.testCapability, thermalFacts('c', 'HOLD'));
  const hosts = select();
  assert.deepEqual(hosts.find((host) => host.name === 'b').executionPolicy, PACED_POLICY);
  assert.deepEqual(hosts.find((host) => host.name === 'b').thermalEndpoint,
    state.nodes.b.testCapability.thermalEndpoint);
  assert.throws(() => select([]), (error) => /not present in fresh discovery/u.test(error.message));
  state.nodes.b.testCapability.thermalObservation.config_sha256 = '0'.repeat(64);
  assert.throws(() => select(), (error) => error.code === 'refused_insufficient_host_topology');
});

test('the pinned image resolves per host by content identity across image stores; absent ' +
  'is image_unavailable with no pull attempt', async () => {
  const layers = ['sha256:' + 'e'.repeat(64)];
  const content = contentIdentityOf(layers);
  const registryRef = `psvensson/lagrange@sha256:${'1'.repeat(64)}`;
  const manifestId = `sha256:${'c'.repeat(64)}`;
  const configId = `sha256:${'f'.repeat(64)}`;
  const {sshRun, calls} = createScriptedSsh([
    [/docker info --format/u, (_command, host) => (host === '10.0.0.2' ?
      'overlay2|[]' : 'overlayfs|[["driver-type","io.containerd.snapshotter.v1"]]')],
    [/docker image inspect/u, (_command, host) => {
      if (host === '10.0.0.3') return `${configId}|[]|["sha256:${'0'.repeat(64)}"]\n__exit_code=0`;
      return host === '10.0.0.2' ?
        `${configId}|[]|${JSON.stringify(layers)}\n__exit_code=0` :
        `${manifestId}|${JSON.stringify([registryRef])}|${JSON.stringify(layers)}\n__exit_code=0`;
    }]]);
  const resolved = await resolvePinnedImage({hosts: [{ip: '10.0.0.1'}, {ip: '10.0.0.2'}],
    contentIdentity: content, registryRef, sshRun, opts: {}});
  assert.equal(resolved['10.0.0.1'].runRef, registryRef);
  assert.equal(resolved['10.0.0.1'].imageStore, 'containerd');
  assert.equal(resolved['10.0.0.2'].runRef, configId);
  assert.equal(resolved['10.0.0.2'].imageStore, 'overlay2');
  assert.equal(resolved['10.0.0.2'].provenance, `loaded:${configId}`);
  await assert.rejects(resolvePinnedImage({hosts: [{ip: '10.0.0.3'}], contentIdentity: content,
    registryRef, sshRun, opts: {}}), (error) => error.code === 'image_unavailable' &&
    error.diagnostic.reason === 'absent');
  assert.equal(arraySome(calls, (call) => /docker pull/u.test(call.command)), false);
});

test('docker disk is a fleet fact: a host below the data-host requirement is not a data ' +
  'host but may be the load generator (2026-11-01: adam-laptop had 433 MB free)', () => {
  const state = inventory([['adam-laptop', 'free'], ['adams-gamla', 'free'],
    ['carinas-windows', 'free'], ['lenovo-laptop', 'free'], ['tv-dator', 'free']]);
  state.nodes['adam-laptop'].testCapability.dockerRootFreeBytes = 433 * 1024 * 1024;
  Object.assign(state.nodes['carinas-windows'].testCapability,
    thermalFacts('carinas-windows', 'UNAVAILABLE'));
  const hosts = selectLabBenchmarkHosts({state, dataHostCount: 3, nodeMinimum: '22.12.0', loadGeneratorRequirement: REQUIREMENT});
  assert.deepEqual(arrayMap(hosts, (host) => [host.name, host.role]), [
    ['adams-gamla', 'data'], ['lenovo-laptop', 'data'], ['tv-dator', 'data'],
    ['adam-laptop', 'client']]);
  state.nodes['tv-dator'].testCapability.dockerRootFreeBytes = 1024;
  assert.throws(() => selectLabBenchmarkHosts({state, dataHostCount: 3,
    nodeMinimum: '22.12.0', loadGeneratorRequirement: REQUIREMENT}), (error) => error.code === 'refused_insufficient_host_topology' &&
    /host-ineligible: docker_disk_low/u.test(error.message));
});

// Live campaign bench-live-20261101-b: the runner staged EVERY product image on
// every host, the load generator included, so a load generator with little
// docker disk (adam-laptop, 408 MB free) failed staging on images it never
// runs. Data hosts hold the product images and the TiDB readiness client
// (it runs on the TiDB SQL host); the load generator holds no image.
test('product and readiness-client images go to the data hosts; the load generator gets none',
  () => {
    const all = campaignImagesByRole({targets: ['lagrange', 'tidb-tikv', 'pg-single-primary'],
      lagrangeImage: 'psvensson/lagrange@sha256:abc'});
    assert.deepEqual(all.client, []);
    assert.deepEqual([...all.data].sort(), ['mysql:8.4.11', 'pingcap/pd:v8.5.8',
      'pingcap/tidb:v8.5.8', 'pingcap/tikv:v8.5.8', 'postgres:17-alpine',
      'psvensson/lagrange@sha256:abc']);
    const noTidb = campaignImagesByRole({targets: ['lagrange', 'pg-single-primary'],
      lagrangeImage: 'psvensson/lagrange@sha256:abc'});
    assert.deepEqual(noTidb.client, []);
    assert.deepEqual([...noTidb.data].sort(), ['postgres:17-alpine',
      'psvensson/lagrange@sha256:abc']);
  });

// The load generator holds no image; it needs only the checkout worktree at
// the harness commit (prepareLoadGeneratorCheckout), Node at the engines
// floor, and room on its checkout's filesystem for that worktree. A host
// short of the measured requirement is refused as `host-ineligible:
// disk_low`; with no other candidate the campaign is refused for its
// topology, honestly.
test('the load generator needs room for the harness worktree on its checkout filesystem',
  () => {
    const state = inventory([['adam-laptop', 'free'], ['adams-gamla', 'free'],
      ['carinas-windows', 'free'], ['lenovo-laptop', 'free'], ['tv-dator', 'free']]);
    state.nodes['adam-laptop'].testCapability.dockerRootFreeBytes = 390 * 1024 * 1024;
    Object.assign(state.nodes['carinas-windows'].testCapability,
      thermalFacts('carinas-windows', 'UNAVAILABLE'));
    state.nodes['adam-laptop'].testCapability.repoFreeBytes = REQUIREMENT.requiredBytes;
    const select = () => selectLabBenchmarkHosts({state, dataHostCount: 3,
      nodeMinimum: '22.12.0', loadGeneratorRequirement: REQUIREMENT});
    const hosts = select();
    assert.equal(hosts[3].name, 'adam-laptop');
    assert.equal(hosts[3].role, 'client');
    state.nodes['adam-laptop'].testCapability.repoFreeBytes = REQUIREMENT.requiredBytes - 1;
    assert.throws(select, (error) => error.code === 'refused_insufficient_host_topology' &&
      /adam-laptop \(not a load generator: host-ineligible: disk_low/u.test(error.message));
    delete state.nodes['adam-laptop'].testCapability.repoFreeBytes;
    assert.throws(select, (error) => /host-ineligible: disk_low/u.test(error.message));
    assert.throws(() => selectLabBenchmarkHosts({state, dataHostCount: 3,
      nodeMinimum: '22.12.0'}), (error) =>
      error.code === 'refused_load_generator_requirement_unmeasured',
    'never selected unmeasured: a typed refusal');
  });

// Independent verification N3: the requirement is measured at preparation
// time from the tree the load generator will check out (du of the checkout,
// without node_modules, data, test-output and .git), plus the evidence margin;
// never a constant.
test('the load-generator requirement is measured from the checkout tree', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-requirement-'));
  try {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'a.js'), Buffer.alloc(300 * 1024, 1));
    for (const excluded of ['node_modules', 'data', 'test-output', '.git']) {
      fs.mkdirSync(path.join(root, excluded));
      fs.writeFileSync(path.join(root, excluded, 'big'), Buffer.alloc(4 * 1024 * 1024, 1));
    }
    const requirement = measureLoadGeneratorRequirement(root);
    assert.ok(requirement.checkoutBytes >= 300 * 1024, String(requirement.checkoutBytes));
    assert.ok(requirement.checkoutBytes < 4 * 1024 * 1024, 'excluded trees are not counted');
    assert.equal(requirement.requiredBytes,
      requirement.checkoutBytes + requirement.evidenceMarginBytes);
    assert.match(requirement.method, /^du -s -B1 /u);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

// Live campaign bench-live-20261101-b-r3 crashed with an untyped `canonical
// JSON data required`: adam-laptop and adams-gamla run LC_NUMERIC=sv_SE, their
// awk printed MemTotal as `15,5`, Number('15,5') is NaN, and the NaN in the
// run record's host facts failed the record digest. The facts command's
// numbers are locale-independent, and a fact that is not a number is a typed
// failure, never NaN.
test('host facts are read locale-independently; a non-numeric fact is typed', async () => {
  const hosts = [{name: 'adam-laptop', ip: '10.0.0.1'}];
  const good = createScriptedSsh([[/MemTotal/u, (command) => (/LC_ALL=C awk/u.test(command) ?
    'adam|boot-1|8|15.5|eth0' : 'adam|boot-1|8|15,5|eth0')]]);
  const [fact] = await collectHostFacts({hosts, sshRun: good.sshRun, opts: {}});
  assert.equal(fact.memGb, 15.5);
  assert.equal(fact.cpus, 8);
  const comma = createScriptedSsh([[/MemTotal/u, 'adam|boot-1|8|15,5|eth0']]);
  await assert.rejects(collectHostFacts({hosts, sshRun: comma.sshRun, opts: {}}),
    (error) => error.code === 'host_facts_unreadable' && /memGb/u.test(error.message));
});
