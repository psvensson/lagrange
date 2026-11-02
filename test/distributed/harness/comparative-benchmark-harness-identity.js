/**
 * The harness identity a comparative-benchmark campaign records, in the shape
 * stream A's same-harness rule admits: the campaign header carries
 * {gitCommit, checkoutDirty, driverSourceSha256, adapterIds} with the adapter
 * ids of every arm; each run carries the same commit, checkout state and
 * driver digest with its own arm's adapter ids. The driver digest is the
 * workload owner's own function over the executed driver sources
 * (benchmarkDriverSourceIdentity), the adapter ids its own constants.
 */
import {BENCHMARK_SCENARIO_A_ADAPTER_ID} from './benchmark-scenario-a-run.js';
import {arrayMap} from './real-product-captured-intrinsics.js';
import {benchmarkDriverSourceIdentity} from './real-product-workload-drivers.js';

function adapterIdOf(system) {
  const adapterId = BENCHMARK_SCENARIO_A_ADAPTER_ID[system];
  if (!adapterId) throw new Error(`no Scenario A adapter for system ${system}`);
  return adapterId;
}

/**
 * @param {{gitCommit: string, checkoutDirty: boolean, systems: Array<string>,
 *   driverIdentity?: Function}} input
 * @return {Promise<Object>} the campaign header's harness identity
 */
async function composeCampaignHarnessIdentity({gitCommit, checkoutDirty, systems,
  driverIdentity = benchmarkDriverSourceIdentity}) {
  if (typeof gitCommit !== 'string' || !/^[0-9a-f]{40}$/u.test(gitCommit)) {
    throw new Error(`harness identity needs the checkout's commit, got ${gitCommit}`);
  }
  if (typeof checkoutDirty !== 'boolean') {
    throw new Error('harness identity needs the checkout state as a boolean');
  }
  return {gitCommit, checkoutDirty,
    driverSourceSha256: (await driverIdentity()).driverSourceSha256,
    adapterIds: [...new Set(arrayMap(systems, adapterIdOf))].sort()};
}

/**
 * A run's harness identity: the header's commit and checkout state, the
 * driver digest the load generator reported (it differs when the load
 * generator ran other sources, which admission reads as harness-mismatch), and
 * the arm's adapter ids (the arm's own when the workload never reported any).
 * @param {{header: Object, system: string, reported: Object|null}} input
 * @return {Object}
 */
function composeRunHarnessIdentity({header, system, reported}) {
  return {gitCommit: header.gitCommit, checkoutDirty: header.checkoutDirty,
    // A run that never reached the workload ran no driver of its own: it is
    // attributed the campaign's; a reported identity is taken as reported.
    driverSourceSha256: reported ? reported.driverSourceSha256 ?? null :
      header.driverSourceSha256,
    adapterIds: reported?.adapterIds?.length ? [...reported.adapterIds] :
      [adapterIdOf(system)]};
}

export {composeCampaignHarnessIdentity, composeRunHarnessIdentity};
