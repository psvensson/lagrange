// D25: lab hosts are held under the lab convention in name order and released
// failure-safe; a busy host refuses the campaign naming its holder after the
// holds already taken are released; the thermal gate runs on every held host
// from its own checkout and a refusal stops the campaign before deployment.
// Substituted: the hold session (scripts/lab/probe.js holdLabMachine) and ssh.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {test} from 'node:test';

import {THERMAL_SKIP_ENV, THERMAL_SOURCE, readThermalHeadroom, waitForThermalHeadroom}
  from '../../../../scripts/checks/wait-for-thermal-headroom.js';
import {capture} from '../../../../scripts/lab/process.js';
import {CAPABILITY_SCRIPT, discoverFleet, probeTestCapability, recordFleet}
  from '../../../../scripts/lab/probe.js';

import {
  campaignImagesByRole,
  collectHostFacts,
  ensureProductImages,
  resolvePinnedImage,
} from '../comparative-benchmark-host-preparation.js';
import {
  createSshCommandRunner,
  dockerRunDetached,
  dockerRunOnceCommand,
  fixedLocaleCommand,
} from '../real-product-remote-shell.js';
import {contentIdentityOf} from '../real-product-identity.js';
import {
  measureLoadGeneratorRequirement,
  checkLabThermalHeadroom,
  holdLabBenchmarkHosts,
  selectLabBenchmarkHosts,
} from '../comparative-benchmark-lab-hosts.js';
import {
  arrayEvery,
  arrayFind,
  arrayMap,
  arraySome,
  stringIncludes,
  stringReplace,
  stringStartsWith,
} from '../real-product-captured-intrinsics.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';

// A load-generator requirement as the runner measures it (see the measurement
// test below); selection compares a host's free checkout space with it.
const REQUIREMENT = Object.freeze({checkoutBytes: 150 * 2 ** 20,
  evidenceMarginBytes: 64 * 2 ** 20, requiredBytes: 214 * 2 ** 20});

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

// What `sensors -j` answers on a host: the CPU package and the NVMe hot
// sensor the thermal owner reads first (scripts/checks/wait-for-thermal-headroom.js).
function sensorsDocument(celsius) {
  return {'coretemp-isa-0000': {'Adapter': 'ISA adapter', 'Package id 0': {temp1_input: celsius}},
    'nvme-pci-0100': {'Adapter': 'PCI adapter', 'Sensor 2': {temp3_input: celsius}}};
}

function stubSensorsPath(t, celsius) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-thermal-sensors-'));
  t.after(() => fs.rmSync(bin, {recursive: true, force: true}));
  fs.writeFileSync(path.join(bin, 'sensors'),
    `#!/bin/sh\necho '${JSON.stringify(sensorsDocument(celsius))}'\n`, {mode: 0o755});
  return `${bin}${path.delimiter}${process.env.PATH}`;
}

// The held host runs the controller's thermal owner, byte-identical, from its
// own checkout through a real shell, as a library caller; its decision record
// comes back. The host's sensors are a stub on its PATH, so the real owner
// reads them and never this machine's.
test('the thermal gate runs the controller\'s thermal owner on every held host through a ' +
  'real shell, bounded by the gate\'s own wait', async (t) => {
  const hosts = arrayMap(HOSTS, (host) => ({...host, repoPath: process.cwd(),
    nodePath: process.execPath}));
  const calls = [];
  const env = {...process.env, PATH: stubSensorsPath(t, 41)};
  delete env[THERMAL_SKIP_ENV];
  const shell = (hostEnv) => async (_ip, _opts, command, timeoutMs) => {
    calls.push({command, timeoutMs});
    const child = await promisify(execFile)('/bin/sh', ['-c', command],
      {timeout: timeoutMs, env: hostEnv});
    assert.equal(child.stderr, '', 'the imported owner must not invoke its CLI');
    return child.stdout;
  };
  const results = await checkLabThermalHeadroom({hosts, sshRun: shell(env), opts: {}});
  assert.equal(calls.length, 3);
  assert.ok(arrayEvery(calls, (call) => call.timeoutMs === 11 * 60 * 1000),
    'the gate\'s own bound (twenty 30 s polls) plus one minute of ssh slack');
  assert.equal(results.alpha.outcome, 'headroom-ok');
  assert.equal(results.alpha.reading.cpuSource, 'coretemp/Package id 0');
  assert.equal(results.alpha.reading.nvmeSource, 'nvme/Sensor 2');
  // A host told to skip the gate measured nothing: refused, never a pass.
  await assert.rejects(checkLabThermalHeadroom({hosts: [hosts[0]],
    sshRun: shell({...env, [THERMAL_SKIP_ENV]: '1'}), opts: {}}), (error) =>
    error.code === 'thermal_unmeasurable' &&
    error.diagnostic.result.outcome === 'headroom-skipped');
  const staleRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-thermal-stale-'));
  t.after(() => fs.rmSync(staleRepo, {recursive: true, force: true}));
  const staleGate = path.join(staleRepo, 'scripts/checks/wait-for-thermal-headroom.js');
  fs.mkdirSync(path.dirname(staleGate), {recursive: true});
  fs.writeFileSync(staleGate, 'throw new Error("stale source must not execute");');
  await assert.rejects(checkLabThermalHeadroom({hosts: [{...hosts[0], repoPath: staleRepo}],
    sshRun: shell(env), opts: {}}), (error) => error.code === 'thermal_exhausted' &&
    /thermal gate source differs/u.test(error.message));
});

function inventory(entries) {
  return {version: 1, nodes: Object.fromEntries(arrayMap(entries, ([name, lock, extra]) =>
    [name, {name, ip: `192.168.9.${name.length}${name.charCodeAt(0)}`, ssh: `b@${name}`,
      os: 'linux', roles: ['harness'], testCapability: {bootId: `boot-${name}`,
        dockerReachable: true, repoPath: '/srv/lagrange', nodePath: '/usr/bin/node',
        nodeVersion: 'v22.23.2', thermal: THERMAL_SOURCE.MEASURED,
        dockerRootFreeBytes: 100 * 2 ** 30, repoFreeBytes: 100 * 2 ** 30,
        machineLock: {state: lock, holder: null}}, ...extra}]))};
}

test('selection prefers free hosts, then held ones the hold will wait for; unreachable, ' +
  'docker-less and duplicate machines are excluded', () => {
  const state = inventory([['a', 'busy'], ['b', 'free'], ['c', 'free'],
    ['d', 'free', {lastProbeFailure: {error: 'ssh timeout'}, testCapability: null}],
    ['e', 'stale-record'], ['f', 'busy'], ['g', 'free',
      {testCapability: {bootId: 'boot-b', dockerReachable: true, thermal: THERMAL_SOURCE.MEASURED,
        machineLock: {state: 'free'}}}]]);
  const hosts = selectLabBenchmarkHosts({state, dataHostCount: 3, nodeMinimum: '22.12.0', loadGeneratorRequirement: REQUIREMENT});
  assert.deepEqual(arrayMap(hosts, (host) => [host.name, host.role, host.lock.state]),
    [['b', 'data', 'free'], ['c', 'data', 'free'], ['e', 'data', 'stale-record'],
      ['f', 'client', 'busy']]);
});

test('a host whose checkout runs an old Node is never the load generator', () => {
  const old = {testCapability: {bootId: 'boot-old', dockerReachable: true,
    repoPath: '/srv/lagrange', nodePath: '/usr/bin/node', nodeVersion: 'v14.21.3',
    thermal: THERMAL_SOURCE.MEASURED, dockerRootFreeBytes: 100 * 2 ** 30,
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

// Only measured headroom admits a held host. Each outcome is the thermal
// owner's own decision record (its readings from a sensors document, no sysfs).
test('only measured headroom admits a held host: exhausted headroom refuses as ' +
  'thermal_exhausted, a gate that measured nothing refuses as thermal_unmeasurable', async (t) => {
  const noSysfs = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-thermal-sysfs-'));
  t.after(() => fs.rmSync(noSysfs, {recursive: true, force: true}));
  const decide = (document, env = {}) => waitForThermalHeadroom({env, attempts: 1,
    sleep: () => {}, read: () => readThermalHeadroom({sensors: () => document,
      sysRoot: noSysfs})});
  const gate = async (result) => checkLabThermalHeadroom({hosts: [HOSTS[0]],
    sshRun: async () => JSON.stringify(result), opts: {}});
  const cool = decide(sensorsDocument(41));
  assert.equal((await gate(cool)).delta.outcome, 'headroom-ok');
  const hot = decide(sensorsDocument(90));
  assert.equal(hot.outcome, 'headroom-exhausted');
  await assert.rejects(gate(hot), (error) => error.code === 'thermal_exhausted' &&
    /CPU package 90C >= 75C/u.test(error.message));
  for (const blind of [decide(null), decide(sensorsDocument(41), {[THERMAL_SKIP_ENV]: '1'})]) {
    await assert.rejects(gate(blind), (error) => error.code === 'thermal_unmeasurable' &&
      error.diagnostic.host === 'delta' && error.diagnostic.result.outcome === blind.outcome);
  }
  // An answer that is not the owner's decision record is refused.
  const old = createScriptedSsh([[/wait-for-thermal-headroom/u, 'thermal: ok cpu 51C']]);
  await assert.rejects(checkLabThermalHeadroom({hosts: [HOSTS[0]], sshRun: old.sshRun,
    opts: {}}), (error) => error.code === 'thermal_exhausted');
});

test('selection requires the probe\'s measured thermal fact, each exclusion typed; fresh ' +
  'missing members never use cached facts', () => {
  const state = inventory([['a', 'free'], ['b', 'free'], ['c', 'free'], ['d', 'free'],
    ['e', 'free']]);
  state.nodes.b.testCapability.thermal = THERMAL_SOURCE.UNMEASURABLE;
  delete state.nodes.c.testCapability.thermal;
  state.nodes.d.testCapability.thermal = 'hot';
  const select = (fleet = null) => selectLabBenchmarkHosts({state, fleet, dataHostCount: 3,
    nodeMinimum: '22.12.0', loadGeneratorRequirement: REQUIREMENT});
  assert.throws(() => select(), (error) => {
    const reasons = Object.fromEntries(arrayMap(error.diagnostic.excluded,
      (entry) => [entry.name, entry.reason]));
    // Each exclusion keeps its own typed cause: no sensor source, no fact
    // recorded, a word the probe does not write. None is admitted by default.
    assert.equal(reasons.b, 'host-ineligible: thermal_unmeasurable (the thermal gate has no ' +
      'sensor source there)');
    assert.equal(reasons.c, 'host-ineligible: thermal_unrecorded (the lab probe recorded no ' +
      'thermal fact)');
    assert.equal(reasons.d, 'host-ineligible: thermal_unrecognized ("hot")');
    return error.code === 'refused_insufficient_host_topology';
  });
  state.nodes.c.testCapability.thermal = THERMAL_SOURCE.MEASURED;
  state.nodes.d.testCapability.thermal = THERMAL_SOURCE.MEASURED;
  const hosts = select();
  assert.deepEqual(arrayMap(hosts, ({name, role}) => [name, role]),
    [['a', 'data'], ['c', 'data'], ['d', 'data'], ['e', 'client']]);
  assert.throws(() => select([]), (error) => /not present in fresh discovery/u.test(error.message));
});

// The lab target over the lab probe's real output. The probe's own capability
// script runs in a real shell per host (ssh substituted by a local shell; each
// host's boot id, sensors, docker and disks answered by stubs on its PATH),
// through probeTestCapability, discoverFleet and recordFleet; the real
// selector reads the fleet fresh and as recorded. carinas-windows has no
// sensor source (a WSL2 VM), so the probe says so and it is excluded, typed.
const PROBED_LAB = Object.freeze({'adam-laptop': true, 'adams-gamla': true,
  'carinas-windows': false, 'lenovo-laptop': true, 'tv-dator': true});
const PROBE_CONTROLLER = 'controller';

function stubLabHost(root, name, measured) {
  const bin = path.join(root, name, 'bin');
  const repo = path.join(root, name, 'repo');
  fs.mkdirSync(bin, {recursive: true});
  fs.mkdirSync(path.join(repo, '.git'), {recursive: true});
  const stub = (tool, body) => fs.writeFileSync(path.join(bin, tool), `#!/bin/sh\n${body}\n`,
    {mode: 0o755});
  const real = (tool) => `PATH="$LAB_STUB_REAL_PATH" exec ${tool} "$@"`;
  stub('cat', `if [ "$1" = /proc/sys/kernel/random/boot_id ]; then echo boot-${name}; ` +
    `exit 0; fi\n${real('cat')}`);
  stub('sensors', measured ? 'echo \'{}\'' : 'exit 1');
  stub('ls', `case "$1" in /sys/*) exit ${measured ? 0 : 2};; esac\n${real('ls')}`);
  stub('docker', 'if [ "$2" = --format ]; then echo /var/lib/docker; fi');
  stub('df', 'printf \'Filesystem 1-blocks Used Available Capacity Mounted\\n' +
    'stub 1 1 107374182400 1%% /\\n\'');
  return {bin, repo};
}

async function probeLab(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-probe-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const hosts = Object.fromEntries(arrayMap([...Object.entries(PROBED_LAB),
    [PROBE_CONTROLLER, true]], ([name, measured]) => [name, stubLabHost(root, name, measured)]));
  const empty = path.join(root, 'empty');
  fs.mkdirSync(empty);
  const shellOf = (name) => ({...process.env, LAB_STUB_REAL_PATH: process.env.PATH,
    PATH: `${hosts[name].bin}${path.delimiter}${process.env.PATH}`, NVM_DIR: empty,
    LAB_LOCK_DIR: empty});
  // ssh <options> <target> '<remote command>': the remote shell's answer.
  const transport = (command, args, options) => {
    assert.equal(options.stdin, `${CAPABILITY_SCRIPT}\n`, 'the probe\'s own script');
    if (command !== 'ssh') return capture(command, args, {...options, env: shellOf(PROBE_CONTROLLER)});
    const name = stringReplace(args[args.length - 2], /^bench@/u, '');
    return capture('sh', ['-c', args[args.length - 1]], {...options, env: shellOf(name)});
  };
  const state = {version: 1, controller: {}, nodes: Object.fromEntries(arrayMap(
    Object.keys(PROBED_LAB), (name, index) => [name, {name, ip: `192.168.20.${index + 1}`,
      ssh: `bench@${name}`, os: 'linux', roles: ['harness'], repoPath: hosts[name].repo}]))};
  const fleet = await discoverFleet({nodes: Object.values(state.nodes),
    controllerRepoPath: hosts[PROBE_CONTROLLER].repo, lockGraphSha256: 'a'.repeat(64),
    nodeMinimum: '22.12.0',
    probe: (input) => probeTestCapability({...input, captureCommand: transport})});
  return {state, fleet};
}

test('the lab target selects from the lab probe\'s real output: a host the thermal gate ' +
  'can measure is eligible, carinas-windows (no sensors) is excluded typed', {timeout: 120000},
async (t) => {
  const {state, fleet} = await probeLab(t);
  const capabilityOf = (name) => arrayFind(fleet, (entry) => entry.name === name).capability;
  assert.equal(capabilityOf('carinas-windows').thermal, THERMAL_SOURCE.UNMEASURABLE);
  assert.equal(capabilityOf('tv-dator').thermal, THERMAL_SOURCE.MEASURED);
  const select = (input) => selectLabBenchmarkHosts({dataHostCount: 3, nodeMinimum: '22.12.0',
    loadGeneratorRequirement: REQUIREMENT, ...input});
  const roles = (hosts) => arrayMap(hosts, ({name, role}) => [name, role]);
  const fresh = select({state, fleet});
  assert.deepEqual(roles(fresh), [['adam-laptop', 'data'], ['adams-gamla', 'data'],
    ['lenovo-laptop', 'data'], ['tv-dator', 'client']]);
  recordFleet(state, fleet);
  assert.deepEqual(roles(select({state, fleet: null})), roles(fresh),
    'the recorded facts select as the fresh ones do');
  // Four registered hosts, one of them without sensors: refused for its
  // topology, naming why carinas-windows is excluded; never run on it.
  const four = {...state, nodes: {...state.nodes}};
  delete four.nodes['lenovo-laptop'];
  assert.throws(() => select({state: four, fleet}), (error) =>
    error.code === 'refused_insufficient_host_topology' &&
    arraySome(error.diagnostic.excluded, (entry) => entry.name === 'carinas-windows' &&
      stringStartsWith(entry.reason, 'host-ineligible: thermal_unmeasurable')));
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

// Decision D1 (2026-11-14): a run never places an image. An image absent on a
// host is a typed refusal naming host, role and image; nothing is pulled.
test('an image absent on a host refuses the campaign naming host, role and image; no pull',
  async () => {
    const {sshRun, calls} = createScriptedSsh([
      [/docker image inspect --format '\{\{\.Id\}\}' '?pingcap\/tikv:v8\.5\.8/u,
        'Error: No such image: pingcap/tikv:v8.5.8\n__exit_code=1'],
      [/docker image inspect/u, `sha256:${'d'.repeat(64)}\n__exit_code=0`]]);
    const present = await ensureProductImages({hosts: [{ip: '10.0.0.1'}], role: 'data',
      images: ['postgres:17-alpine'], sshRun, opts: {}});
    assert.deepEqual(present, [{host: '10.0.0.1', role: 'data', image: 'postgres:17-alpine',
      imageId: `sha256:${'d'.repeat(64)}`}]);
    await assert.rejects(ensureProductImages({hosts: [{ip: '10.0.0.2'}], role: 'data',
      images: ['postgres:17-alpine', 'pingcap/tikv:v8.5.8'], sshRun, opts: {}}), (error) => {
      assert.equal(error.code, 'image_unavailable');
      assert.deepEqual({host: error.diagnostic.host, role: error.diagnostic.role,
        image: error.diagnostic.image, reason: error.diagnostic.reason},
      {host: '10.0.0.2', role: 'data', image: 'pingcap/tikv:v8.5.8', reason: 'absent'});
      assert.match(error.message, /pingcap\/tikv:v8\.5\.8.*10\.0\.0\.2.*data/u);
      return true;
    });
    assert.equal(arraySome(calls, (call) => /docker pull/u.test(call.command)), false);
  });

// Decision D1: no container the campaign starts may pull implicitly.
test('every campaign docker run refuses to pull (--pull=never)', async () => {
  const {sshRun, calls} = createScriptedSsh([[/docker run -d/u, 'a'.repeat(64)]]);
  await dockerRunDetached({sshRun, opts: {}, host: '10.0.0.1', campaignId: 'bench-x',
    role: 'pd', image: 'pingcap/pd:v8.5.8'});
  assert.match(calls[0].command, / --pull=never .*'?pingcap\/pd:v8\.5\.8'?$/u);
  assert.match(dockerRunOnceCommand({campaignId: 'bench-x', image: 'postgres:17-alpine',
    commandArgs: ['psql']}), /^docker run --rm .* --pull=never .*postgres:17-alpine'? '?psql'?$/u);
});

test('docker disk is a fleet fact: a host below the data-host requirement is not a data ' +
  'host but may be the load generator (2026-11-01: adam-laptop had 433 MB free)', () => {
  const state = inventory([['adam-laptop', 'free'], ['adams-gamla', 'free'],
    ['carinas-windows', 'free'], ['lenovo-laptop', 'free'], ['tv-dator', 'free']]);
  state.nodes['adam-laptop'].testCapability.dockerRootFreeBytes = 433 * 1024 * 1024;
  // The probe's fact for carinas-windows: no sensor source (a WSL2 VM).
  state.nodes['carinas-windows'].testCapability.thermal = THERMAL_SOURCE.UNMEASURABLE;
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
// (it runs on the TiDB SQL host). The load generator holds exactly the psql
// client image the Lagrange deployer runs from it (real-product-sql-clients.js
// psqlText, `from: clientIp`), and only when Lagrange is a target.
test('product and readiness-client images go to the data hosts; the load generator holds ' +
  'only the psql client image', () => {
  const all = campaignImagesByRole({targets: ['lagrange', 'tidb-tikv', 'pg-single-primary'],
    lagrangeImage: 'psvensson/lagrange@sha256:abc'});
  assert.deepEqual(all.client, ['postgres:17-alpine']);
  assert.deepEqual([...all.data].sort(), ['mysql:8.4.11', 'pingcap/pd:v8.5.8',
    'pingcap/tidb:v8.5.8', 'pingcap/tikv:v8.5.8', 'postgres:17-alpine',
    'psvensson/lagrange@sha256:abc']);
  const noTidb = campaignImagesByRole({targets: ['lagrange', 'pg-single-primary'],
    lagrangeImage: 'psvensson/lagrange@sha256:abc'});
  assert.deepEqual(noTidb.client, ['postgres:17-alpine']);
  assert.deepEqual(campaignImagesByRole({targets: ['tidb-tikv', 'pg-single-primary'],
    lagrangeImage: 'psvensson/lagrange@sha256:abc'}).client, []);
  assert.deepEqual([...noTidb.data].sort(), ['postgres:17-alpine',
    'psvensson/lagrange@sha256:abc']);
});

// Besides the psql client image, the load generator needs the checkout worktree at
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
    state.nodes['carinas-windows'].testCapability.thermal = THERMAL_SOURCE.UNMEASURABLE;
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
// run record's host facts failed the record digest. The facts command reaches a
// host only through the ssh runner, which runs every command in the fixed C
// locale; a fact that is not a number is a typed failure, never NaN.
test('host facts are read locale-independently; a non-numeric fact is typed', async () => {
  const hosts = [{name: 'adam-laptop', ip: '10.0.0.1'}];
  const transported = [];
  // ssh to a decimal-comma host: its awk prints `15,5` unless the command it
  // receives sets the fixed locale for itself.
  const sshRun = createSshCommandRunner({hosts,
    execFileImpl: (_file, args, _options, callback) => {
      const command = args[args.length - 1];
      transported.push(command);
      const memGb = stringStartsWith(command, fixedLocaleCommand('')) ? '15.5' : '15,5';
      process.nextTick(() => callback(null, `adam|boot-1|8|${memGb}|eth0\n`, ''));
      return {killed: false, kill: () => {}};
    }});
  const [fact] = await collectHostFacts({hosts, sshRun, opts: {}});
  assert.equal(transported.length, 1);
  assert.ok(stringIncludes(transported[0], 'MemTotal'));
  assert.equal(fact.memGb, 15.5);
  assert.equal(fact.cpus, 8);
  const comma = createScriptedSsh([[/MemTotal/u, 'adam|boot-1|8|15,5|eth0']]);
  await assert.rejects(collectHostFacts({hosts, sshRun: comma.sshRun, opts: {}}),
    (error) => error.code === 'host_facts_unreadable' && /memGb/u.test(error.message));
});

// Original feature controls retained from the measured and sealed red checkpoint.
test('an explicit registered load generator is reserved before data-host selection', () => {
  const state = inventory([['adam-laptop', 'free'], ['adams-gamla', 'free'],
    ['carinas-windows', 'free'], ['tv-dator', 'free']]);
  const hosts = selectLabBenchmarkHosts({state, dataHostCount: 3,
    nodeMinimum: '22.12.0', loadGeneratorRequirement: REQUIREMENT,
    loadGeneratorName: 'adam-laptop'});
  assert.deepEqual(arrayMap(hosts, ({name, role}) => [name, role]), [
    ['adams-gamla', 'data'], ['carinas-windows', 'data'], ['tv-dator', 'data'],
    ['adam-laptop', 'client'],
  ]);
});

test('an unknown explicit load generator refuses rather than selecting another host', () => {
  const state = inventory([['adam-laptop', 'free'], ['adams-gamla', 'free'],
    ['carinas-windows', 'free'], ['tv-dator', 'free']]);
  assert.throws(() => selectLabBenchmarkHosts({state, dataHostCount: 3,
    nodeMinimum: '22.12.0', loadGeneratorRequirement: REQUIREMENT,
    loadGeneratorName: 'not-registered'}), (error) =>
    error.code === 'refused_load_generator_selection' &&
    stringIncludes(error.message, 'not-registered'));
});

// Selection with an explicit load generator over a five-host inventory.
function selectExplicit(state, name, fleet = null) {
  return selectLabBenchmarkHosts({state, fleet, dataHostCount: 3, nodeMinimum: '22.12.0',
    loadGeneratorRequirement: REQUIREMENT, loadGeneratorName: name});
}

function refusedFor(name, reason) {
  return (error) => error.code === 'refused_load_generator_selection' &&
    error.diagnostic.loadGeneratorName === name && reason.test(error.diagnostic.reason) &&
    stringIncludes(error.message, name);
}

test('a held explicit load generator is kept for the hold to wait for, not replaced', () => {
  const state = inventory([['a', 'busy'], ['b', 'free'], ['c', 'free'],
    ['d', 'free'], ['e', 'free']]);
  const hosts = selectExplicit(state, 'a');
  assert.deepEqual(arrayMap(hosts, ({name, role}) => [name, role]),
    [['b', 'data'], ['c', 'data'], ['d', 'data'], ['a', 'client']]);
  assert.equal(hosts[3].lock.state, 'busy');
});

test('an ineligible explicit load generator is refused with its reason and no substitute', () => {
  const cases = [
    [{roles: ['runner']}, {}, /no harness role/u],
    [{}, {dockerReachable: false}, /docker not reachable/u],
    [{}, {thermal: THERMAL_SOURCE.UNMEASURABLE}, /thermal_unmeasurable/u],
    [{}, {thermal: null}, /thermal_unrecorded/u],
    [{}, {repoPath: ''}, /no checkout/u],
    [{}, {nodeVersion: 'v18.0.0'}, /below the engines floor/u],
    [{}, {repoFreeBytes: 0}, /disk_low/u],
  ];
  for (const [node, capability, reason] of cases) {
    const state = inventory([['a', 'free'], ['b', 'free'], ['c', 'free'],
      ['d', 'free'], ['e', 'free']]);
    Object.assign(state.nodes.a, node);
    Object.assign(state.nodes.a.testCapability, capability);
    assert.throws(() => selectExplicit(state, 'a'), refusedFor('a', reason));
  }
});

test('an explicit physical alias or a host absent from fresh discovery is refused', () => {
  const state = inventory([['a', 'free'], ['b', 'free'], ['c', 'free'],
    ['d', 'free'], ['z', 'free']]);
  state.nodes.z.testCapability = {...state.nodes.a.testCapability};
  assert.throws(() => selectExplicit(state, 'z'), refusedFor('z', /same machine/u));
  const fleet = arrayMap(['b', 'c', 'd', 'z'],
    (name) => ({name, capability: state.nodes[name].testCapability}));
  assert.throws(() => selectExplicit(state, 'a', fleet),
    refusedFor('a', /not present in fresh discovery/u));
});

test('the explicit load generator leaves the data hosts their disk policy and topology', () => {
  const state = inventory([['a', 'free'], ['b', 'free'], ['c', 'free'], ['d', 'free']]);
  state.nodes.d.testCapability.dockerRootFreeBytes = 2 ** 30;
  const roles = (hosts) => arrayMap(hosts, ({name, role}) => [name, role]);
  assert.deepEqual(roles(selectLabBenchmarkHosts({state, dataHostCount: 3,
    loadGeneratorRequirement: REQUIREMENT})),
  [['a', 'data'], ['b', 'data'], ['c', 'data'], ['d', 'client']], 'automatic is unchanged');
  assert.deepEqual(roles(selectExplicit(state, 'd')),
    [['a', 'data'], ['b', 'data'], ['c', 'data'], ['d', 'client']],
    'a client holds no product image, so its docker root is not a data-host gap');
  assert.throws(() => selectExplicit(state, 'a'), (error) =>
    error.code === 'refused_insufficient_host_topology' && error.diagnostic.available === 0 &&
    arraySome(error.diagnostic.excluded, (entry) => entry.name === 'd' &&
      /docker_disk_low/u.test(entry.reason)));
});
