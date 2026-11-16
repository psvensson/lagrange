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
  arrayIncludes,
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

test('Counterexample 2A: lingering /bench-cleanup helper container after storage cleanup ' +
  'SSH timeout is swept by post-helper removeCampaignContainers and complete is false',
async () => {
  // Subcase 1: post-helper sweep removes cleanup-helper-1; storageClosed is false -> complete: false
  const pending1 = new Map([['10.0.0.1', new Set(['run-1-d1'])]]);
  const liveOnHost1 = new Set(['c1']);
  const {sshRun: sshRun1} = createScriptedSsh([
    [/docker ps -aq --filter/u, () => [...liveOnHost1].join('\n')],
    [/docker rm -f/u, (command) => {
      if (stringIncludes(command, 'c1')) liveOnHost1.delete('c1');
      if (stringIncludes(command, 'cleanup-helper-1')) liveOnHost1.delete('cleanup-helper-1');
      return '';
    }],
    [/\/bench-cleanup/u, () => {
      liveOnHost1.add('cleanup-helper-1');
      return new Error('ssh: command timed out while /bench-cleanup was running');
    }],
  ]);
  const swept = await deployers.teardownCampaignDeployment({
    hosts: ['10.0.0.1'],
    campaignId: 'camp-2a',
    storageRoot: '/var/lib/bench-data',
    pendingStorageByHost: pending1,
    sshRun: sshRun1,
    opts: {},
  });
  assert.equal(liveOnHost1.size, 0, 'post-helper pass must sweep lingering cleanup-helper-1');
  assert.deepEqual(swept.removed, [{
    host: '10.0.0.1',
    containerIds: ['c1', 'cleanup-helper-1'],
  }]);
  assert.deepEqual(swept.unclosed, []);
  assert.deepEqual(swept.confirmedClosedHosts, ['10.0.0.1']);
  assert.equal(swept.containersClosed, true);
  assert.equal(swept.storageClosed, false);
  assert.equal(swept.complete, false);
  assert.equal(swept.storageCleanup.errors.length, 1);

  // Subcase 2: post-helper sweep cannot remove cleanup-helper-1 -> containersClosed: false
  const pending2 = new Map([['10.0.0.1', new Set(['run-1-d1'])]]);
  const liveOnHost2 = new Set(['c1']);
  const {sshRun: sshRun2} = createScriptedSsh([
    [/docker ps -aq --filter/u, () => [...liveOnHost2].join('\n')],
    [/docker rm -f/u, (command) => {
      if (stringIncludes(command, 'c1')) {
        liveOnHost2.delete('c1');
        return '';
      }
      return new Error('Error response from daemon: device or resource busy');
    }],
    [/\/bench-cleanup/u, () => {
      liveOnHost2.add('cleanup-helper-1');
      return new Error('ssh: connection reset by peer');
    }],
  ]);
  const stuck = await deployers.teardownCampaignDeployment({
    hosts: ['10.0.0.1'],
    campaignId: 'camp-2a-stuck',
    storageRoot: '/var/lib/bench-data',
    pendingStorageByHost: pending2,
    sshRun: sshRun2,
    opts: {},
  });
  assert.equal(stuck.containersClosed, false);
  assert.equal(stuck.storageClosed, false);
  assert.equal(stuck.complete, false);
  assert.deepEqual(stuck.confirmedClosedHosts, []);
  assert.equal(stuck.unclosed.length, 1);
  assert.deepEqual(stuck.unclosed[0].containerIds, ['cleanup-helper-1']);
});

test('Counterexample 2C: isolated storage cleanup failure with closed containers sets ' +
  'containersClosed: true, storageClosed: false, complete: false', async () => {
  const pending = new Map([['10.0.0.1', new Set(['run-1-d1'])]]);
  let c1Removed = false;
  const {sshRun} = createScriptedSsh([
    [/docker ps -aq --filter/u, () => (c1Removed ? '' : 'c1')],
    [/docker rm -f/u, () => {
      c1Removed = true;
      return '';
    }],
    [/\/bench-cleanup/u, () => new Error('rm: cannot remove /bench-cleanup/run-1-d1: EACCES')],
  ]);
  const closed = await deployers.teardownCampaignDeployment({
    hosts: ['10.0.0.1'],
    campaignId: 'camp-2c',
    storageRoot: '/var/lib/bench-data',
    pendingStorageByHost: pending,
    sshRun,
    opts: {},
  });
  assert.equal(closed.containersClosed, true);
  assert.equal(closed.storageClosed, false);
  assert.equal(closed.complete, false);
  assert.deepEqual(closed.unclosed, []);
  assert.equal(closed.storageCleanup.errors.length, 1);
  assert.deepEqual([...pending.get('10.0.0.1')], ['run-1-d1']);
});

test('Counterexample 2B: deployLagrangeCluster with cleanupOnFailure sweeps lingering ' +
  'psql --rm helper container on clientIp alongside data hosts', {timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  const clientContainers = new Set();
  const {sshRun} = createScriptedSsh([
    [/^docker ps -aq --filter label=lagrange\.bench\.campaign=/u, (_command, host) => {
      if (host === '10.0.0.9') return [...clientContainers].join('\n');
      const ids = [];
      for (const entry of ledger.containers.values()) {
        if (entry.host === host && !entry.removed) ids.push(entry.id);
      }
      return ids.join('\n');
    }],
    [/^docker rm -f /u, (command, host) => {
      if (host === '10.0.0.9') {
        if (stringIncludes(command, 'psql-helper-99')) {
          clientContainers.delete('psql-helper-99');
        }
        return '';
      }
      for (const [id, entry] of ledger.containers.entries()) {
        if (entry.host === host && stringIncludes(command, id)) {
          entry.removed = true;
          ledger.containers.delete(id);
        }
      }
      return '';
    }],
    [/FROM nodes'/u, () => {
      clientContainers.add('psql-helper-99');
      return new Error('ssh: command timed out while psql was running on clientIp');
    }],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  await assert.rejects(
    deployers.deployLagrangeCluster({
      hosts: HOSTS,
      clientIp: '10.0.0.9',
      sshRun,
      campaignId: 'camp-2b',
      sleep: async () => {},
      opts: {
        lagrangeImage: LAGRANGE_IMAGE,
        cleanupOnFailure: true,
        readiness: {stablePolls: 1, attempts: 1, intervalMs: 0},
      },
    }),
    (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      assert.equal(error.cleanup.complete, true);
      assert.equal(
        arrayEvery(
          ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.9'],
          (h) => arrayIncludes(error.cleanup.confirmedClosedHosts, h),
        ),
        true,
      );
      return true;
    },
  );
  assert.equal(clientContainers.size, 0, 'clientIp psql helper container must be swept');
  assert.equal(ledger.containers.size, 0, 'data host containers must be swept');
});

test('releaseLabBenchmarkHosts settles all session releases before rethrowing', async () => {
  const {releaseLabBenchmarkHosts} = await import('../comparative-benchmark-lab-hosts.js');
  const settledOrder = [];
  const sessions = [
    {
      release: async () => {
        settledOrder.push('s1-rejected');
        throw new Error('session 1 release failed');
      },
    },
    {
      release: () => new Promise((resolve) => {
        setTimeout(() => {
          settledOrder.push('s2-resolved');
          resolve();
        }, 15);
      }),
    },
  ];
  await assert.rejects(
    releaseLabBenchmarkHosts(sessions),
    /session 1 release failed/u,
  );
  assert.deepEqual(settledOrder, ['s1-rejected', 's2-resolved']);
});
