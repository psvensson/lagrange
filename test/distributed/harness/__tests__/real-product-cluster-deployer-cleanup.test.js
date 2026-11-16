// D20: containers carry the campaign label; teardown removes only that label
// on the campaign's hosts and records what it could not close.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import * as deployers from '../real-product-cluster-deployers.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  LAGRANGE_IMAGE,
  createContainerLedger,
  lagrangeHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';
import {
  arrayEvery,
  arrayFilter,
  arrayMap,
  stringIncludes,
  stringStartsWith,
} from '../real-product-captured-intrinsics.js';

const HOSTS = ['10.0.0.1', '10.0.0.2', '10.0.0.3'];

test('D20: every product container the deployer starts carries the campaign label',
  {timeout: 300000}, async () => {
    const ledger = createContainerLedger();
    const {sshRun, calls} = createScriptedSsh(lagrangeHealthyRules(ledger, {hosts: HOSTS}));
    await deployers.deployLagrangeCluster({hosts: HOSTS, clientIp: '10.0.0.9', sshRun,
      opts: {lagrangeImage: LAGRANGE_IMAGE,
        readiness: {stablePolls: 1, attempts: 2, intervalMs: 0}},
      campaignId: 'camp-77', sleep: async () => {}});
    const runs = arrayFilter(calls, (call) => /^docker run /u.test(call.command));
    assert.ok(runs.length >= HOSTS.length);
    for (const run of runs) {
      assert.match(run.command, /--label lagrange\.bench\.campaign=camp-77 /u);
    }
  });

test('D20: teardown filters on the campaign label only and records what it could not ' +
  'close', async () => {
  let host1Removed = false;
  const {sshRun, calls} = createScriptedSsh([
    [/docker ps -aq --filter/u, (_command, host) => {
      if (host === '10.0.0.2') {
        return new Error('ssh: connect to host 10.0.0.2 port 22: No route to host');
      }
      if (host === '10.0.0.1') {
        return host1Removed ? '' : 'c1\nc2';
      }
      return 'c3';
    }],
    [/docker rm -f/u, (_command, host) => {
      if (host === '10.0.0.3') {
        return new Error('Error response from daemon: removal in progress');
      }
      if (host === '10.0.0.1') host1Removed = true;
      return '';
    }],
  ]);
  const result = await deployers.removeCampaignContainers({hosts: HOSTS, campaignId: 'camp-77',
    sshRun, opts: {}});
  for (const call of calls) {
    assert.equal(stringIncludes(call.command, 'name=bench-'), false);
  }
  assert.ok(arrayEvery(arrayFilter(calls, (call) => stringStartsWith(call.command, 'docker ps')), (call) =>
    stringIncludes(call.command, '--filter label=lagrange.bench.campaign=camp-77')));
  assert.deepEqual(result.removed, [{host: '10.0.0.1', containerIds: ['c1', 'c2']}]);
  assert.deepEqual(arrayMap(result.unclosed, (entry) => entry.host).sort(),
    ['10.0.0.2', '10.0.0.3']);
  assert.deepEqual(result.confirmedClosedHosts, ['10.0.0.1']);
  assert.equal(result.complete, false);
});

test('D20: teardown refuses a campaign id that could widen the filter', async () => {
  const {sshRun} = createScriptedSsh();
  await assert.rejects(deployers.removeCampaignContainers({hosts: HOSTS, campaignId: '',
    sshRun, opts: {}}));
  await assert.rejects(deployers.removeCampaignContainers({hosts: HOSTS,
    campaignId: 'x y', sshRun, opts: {}}));
});

test('closure-gated storage cleanup removes only confirmed closed hosts, defers lingering ' +
  'hosts, rejects unsafe subdirs, and never hides container closure failures', async () => {
  const pendingStorageByHost = new Map([
    ['10.0.0.1', new Set(['run-1-d1'])],
    ['10.0.0.2', new Set(['run-1-d1'])],
    ['10.0.0.3', new Set(['../escape'])],
  ]);
  let host1Removed = false;
  const rmRfHosts = [];
  const {sshRun} = createScriptedSsh([
    [/docker ps -aq --filter/u, (_command, host) => {
      if (host === '10.0.0.1') return host1Removed ? '' : 'c1';
      if (host === '10.0.0.2') return 'c2';
      return '';
    }],
    [/docker rm -f/u, (_command, host) => {
      if (host === '10.0.0.1') host1Removed = true;
      return '';
    }],
    [/\/bench-cleanup/u, (_command, host) => {
      rmRfHosts.push(host);
      return '';
    }],
  ]);
  const closed = await deployers.teardownCampaignDeployment({
    hosts: HOSTS,
    campaignId: 'camp-88',
    storageRoot: '/var/lib/bench-data',
    pendingStorageByHost,
    sshRun,
    opts: {},
  });
  assert.equal(closed.complete, false);
  assert.deepEqual(closed.removed, [{host: '10.0.0.1', containerIds: ['c1']}]);
  assert.deepEqual(closed.unclosed, [{
    host: '10.0.0.2',
    containerIds: ['c2'],
    reason: 'containers still present after docker rm -f',
  }]);
  assert.deepEqual(rmRfHosts, ['10.0.0.1']);
  assert.equal(pendingStorageByHost.get('10.0.0.1').size, 0);
  assert.deepEqual([...pendingStorageByHost.get('10.0.0.2')], ['run-1-d1']);
  assert.equal(closed.storageCleanup.deferredHosts[0].host, '10.0.0.2');
  assert.equal(closed.storageCleanup.errors[0].host, '10.0.0.3');
  assert.match(closed.storageCleanup.errors[0].error, /unsafe storage cleanup/u);
});
