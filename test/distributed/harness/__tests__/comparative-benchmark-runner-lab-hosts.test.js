// D25: lab hosts are held under the lab convention in name order and released
// failure-safe; a busy host refuses the campaign naming its holder after the
// holds already taken are released; the thermal gate runs on every held host
// from its own checkout and a refusal stops the campaign before deployment.
// Substituted: the hold session (scripts/lab/probe.js holdLabMachine) and ssh.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {resolvePinnedImage} from '../comparative-benchmark-host-preparation.js';
import {
  checkLabThermalHeadroom,
  holdLabBenchmarkHosts,
  selectLabBenchmarkHosts,
} from '../comparative-benchmark-lab-hosts.js';
import {arrayMap, arraySome} from '../real-product-captured-intrinsics.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';

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

test('the thermal gate runs on every host from its checkout; a refusal is typed',
  async () => {
    const ok = createScriptedSsh([[/wait-for-thermal-headroom/u, 'thermal: ok cpu 51C']]);
    const results = await checkLabThermalHeadroom({hosts: HOSTS, sshRun: ok.sshRun,
      opts: {}});
    assert.equal(ok.calls.length, 3);
    assert.match(ok.calls[0].command,
      /^cd '\/srv\/lagrange' && '\/usr\/bin\/node' scripts\/checks\/wait-for-thermal/u);
    assert.equal(results.alpha.outcome, 'ok');
    const hot = createScriptedSsh([[/wait-for-thermal-headroom/u,
      new Error('thermal: headroom exhausted')]]);
    await assert.rejects(checkLabThermalHeadroom({hosts: HOSTS, sshRun: hot.sshRun,
      opts: {}}), (error) => error.code === 'thermal_exhausted');
  });

function inventory(entries) {
  return {version: 1, nodes: Object.fromEntries(arrayMap(entries, ([name, lock, extra]) =>
    [name, {name, ip: `192.168.9.${name.length}${name.charCodeAt(0)}`, ssh: `b@${name}`,
      os: 'linux', roles: ['harness'], testCapability: {bootId: `boot-${name}`,
        dockerReachable: true, repoPath: '/srv/lagrange', nodePath: '/usr/bin/node',
        nodeVersion: 'v22.23.2', thermal: 'measured',
        machineLock: {state: lock, holder: null}}, ...extra}]))};
}

test('selection prefers free hosts, then held ones the hold will wait for; unreachable, ' +
  'docker-less and duplicate machines are excluded', () => {
  const state = inventory([['a', 'busy'], ['b', 'free'], ['c', 'free'],
    ['d', 'free', {lastProbeFailure: {error: 'ssh timeout'}, testCapability: null}],
    ['e', 'stale-record'], ['f', 'busy'], ['g', 'free',
      {testCapability: {bootId: 'boot-b', dockerReachable: true,
        machineLock: {state: 'free'}}}]]);
  const hosts = selectLabBenchmarkHosts({state, dataHostCount: 3, nodeMinimum: '22.12.0'});
  assert.deepEqual(arrayMap(hosts, (host) => [host.name, host.role, host.lock.state]),
    [['b', 'data', 'free'], ['c', 'data', 'free'], ['a', 'data', 'busy'],
      ['e', 'client', 'stale-record']]);
});

test('a host whose checkout runs an old Node is never the load generator', () => {
  const old = {testCapability: {bootId: 'boot-old', dockerReachable: true,
    repoPath: '/srv/lagrange', nodePath: '/usr/bin/node', nodeVersion: 'v14.21.3',
    thermal: 'measured',
    machineLock: {state: 'free'}}};
  const state = inventory([['a', 'free', old], ['b', 'free', {testCapability: {...old.testCapability,
    bootId: 'boot-b'}}], ['c', 'free', {testCapability: {...old.testCapability,
    bootId: 'boot-c'}}], ['d', 'free', {testCapability: {...old.testCapability,
    bootId: 'boot-d'}}]]);
  assert.throws(() => selectLabBenchmarkHosts({state, dataHostCount: 3,
    nodeMinimum: '22.12.0'}), (error) => error.code === 'refused_insufficient_host_topology' &&
    /node v14\.21\.3 is below the engines floor/u.test(error.message));
  const mixed = inventory([['a', 'free', old], ['b', 'free'], ['c', 'free'], ['d', 'free']]);
  const hosts = selectLabBenchmarkHosts({state: mixed, dataHostCount: 3,
    nodeMinimum: '22.12.0'});
  assert.equal(hosts[3].name, 'd');
  assert.equal(hosts[0].name, 'a', 'an old-Node host can still be a data host');
});

test('a host without thermal sensors is a typed refusal', async () => {
  const {sshRun} = createScriptedSsh([[/wait-for-thermal-headroom/u,
    'thermal: unmeasurable (no sensors)']]);
  await assert.rejects(checkLabThermalHeadroom({hosts: HOSTS, sshRun, opts: {}}),
    (error) => error.code === 'thermal_unmeasurable');
});

test('a host whose thermal sources are unmeasurable (WSL2) is never selected; an unprobed ' +
  'host is not either', () => {
  const state = inventory([['a', 'free'], ['b', 'free'], ['c', 'free'], ['d', 'free'],
    ['w', 'free']]);
  state.nodes.b.testCapability.thermal = 'unmeasurable';
  delete state.nodes.c.testCapability.thermal;
  assert.throws(() => selectLabBenchmarkHosts({state, dataHostCount: 3,
    nodeMinimum: '22.12.0'}), (error) => {
    const reasons = Object.fromEntries(arrayMap(error.diagnostic.excluded,
      (entry) => [entry.name, entry.reason]));
    assert.equal(reasons.b, 'host-ineligible: thermal_unmeasurable');
    assert.equal(reasons.c, 'host-ineligible: thermal_unknown');
    return error.code === 'refused_insufficient_host_topology';
  });
});

test('the pinned image resolves per host by content; absent is image_unavailable with no ' +
  'pull attempt', async () => {
  const imageId = `sha256:${'a'.repeat(64)}`;
  const registryRef = `psvensson/lagrange@sha256:${'1'.repeat(64)}`;
  const answer = (repoDigests) => `${JSON.stringify({Id: imageId,
    RepoDigests: repoDigests})}\n__exit_code=0`;
  const {sshRun, calls} = createScriptedSsh([[/docker image inspect/u, (_command, host) => {
    if (host === '10.0.0.3') return 'Error: No such image\n__exit_code=1';
    return answer(host === '10.0.0.2' ? [] : [registryRef]);
  }]]);
  const hosts = [{ip: '10.0.0.1'}, {ip: '10.0.0.2'}];
  const resolved = await resolvePinnedImage({hosts, imageId, registryRef, sshRun, opts: {}});
  assert.deepEqual(resolved['10.0.0.1'], {runRef: registryRef, imageId,
    provenance: `registry:${registryRef}`});
  assert.deepEqual(resolved['10.0.0.2'], {runRef: imageId, imageId,
    provenance: `loaded:${imageId}`});
  await assert.rejects(resolvePinnedImage({hosts: [{ip: '10.0.0.3'}], imageId, registryRef,
    sshRun, opts: {}}), (error) => error.code === 'image_unavailable' &&
    error.diagnostic.reason === 'absent');
  assert.equal(arraySome(calls, (call) => /docker pull/u.test(call.command)), false);
});
