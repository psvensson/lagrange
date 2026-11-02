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
  const {sshRun, calls} = createScriptedSsh([
    [/docker ps -aq --filter/u, (_command, host) => (host === '10.0.0.2' ?
      new Error('ssh: connect to host 10.0.0.2 port 22: No route to host') : 'c1\nc2')],
    [/docker rm -f/u, (_command, host) => (host === '10.0.0.3' ?
      new Error('Error response from daemon: removal in progress') : '')],
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
  assert.equal(result.complete, false);
});

test('D20: teardown refuses a campaign id that could widen the filter', async () => {
  const {sshRun} = createScriptedSsh();
  await assert.rejects(deployers.removeCampaignContainers({hosts: HOSTS, campaignId: '',
    sshRun, opts: {}}));
  await assert.rejects(deployers.removeCampaignContainers({hosts: HOSTS,
    campaignId: 'x y', sshRun, opts: {}}));
});
