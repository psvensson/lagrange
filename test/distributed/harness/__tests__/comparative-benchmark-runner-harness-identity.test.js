// The same-harness rule of stream A's admission: the campaign header carries
// {gitCommit, checkoutDirty, driverSourceSha256, adapterIds = union over the
// arms}; each run carries the same commit, checkout state and driver digest
// with its own arm's adapter ids (a non-empty subset). The driver digest is
// B1's own function over the executed driver sources, never a file hash here.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {BENCHMARK_SCENARIO_A_ADAPTER_ID} from '../benchmark-scenario-a-run.js';
import {
  composeCampaignHarnessIdentity,
  composeRunHarnessIdentity,
} from '../comparative-benchmark-harness-identity.js';
import {benchmarkDriverSourceIdentity} from '../real-product-workload-drivers.js';

const COMMIT = 'a'.repeat(40);

test('the header harness is the commit, checkout state, B1 driver digest and the adapter ' +
  'union of the campaign\'s systems, nothing else', async () => {
  const harness = await composeCampaignHarnessIdentity({gitCommit: COMMIT,
    checkoutDirty: false, systems: ['lagrange', 'tidb-tikv', 'postgresql']});
  assert.deepEqual(Object.keys(harness).sort(),
    ['adapterIds', 'checkoutDirty', 'driverSourceSha256', 'gitCommit']);
  assert.equal(harness.driverSourceSha256,
    (await benchmarkDriverSourceIdentity()).driverSourceSha256);
  assert.deepEqual(harness.adapterIds,
    [...Object.values(BENCHMARK_SCENARIO_A_ADAPTER_ID)].sort());
});

test('a run harness keeps the header\'s commit and checkout state, the reported driver ' +
  'digest and its own arm\'s adapter ids', async () => {
  const header = await composeCampaignHarnessIdentity({gitCommit: COMMIT, checkoutDirty: true,
    systems: ['lagrange', 'postgresql']});
  const run = composeRunHarnessIdentity({header, system: 'postgresql',
    reported: {driverSourceSha256: header.driverSourceSha256, driverSources: ['x'],
      adapterIds: [BENCHMARK_SCENARIO_A_ADAPTER_ID.postgresql]}});
  assert.deepEqual(run, {gitCommit: COMMIT, checkoutDirty: true,
    driverSourceSha256: header.driverSourceSha256,
    adapterIds: [BENCHMARK_SCENARIO_A_ADAPTER_ID.postgresql]});
  const unreached = composeRunHarnessIdentity({header, system: 'lagrange', reported: null});
  assert.deepEqual(unreached.adapterIds, [BENCHMARK_SCENARIO_A_ADAPTER_ID.lagrange]);
  await assert.rejects(composeCampaignHarnessIdentity({gitCommit: '', checkoutDirty: false,
    systems: ['lagrange']}));
});
