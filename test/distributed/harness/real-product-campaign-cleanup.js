/**
 * Teardown of one benchmark campaign's containers: only containers carrying
 * `lagrange.bench.campaign=<campaignId>` on the campaign's own hosts, never a
 * name pattern that matches another agent's or campaign's containers (D20).
 * What could not be closed is returned, per host, for the run record's
 * `closure`; teardown never throws on a host failure.
 */
import {
  arrayFilter,
  arrayJoin,
  arrayMap,
  stringSplit,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {
  BENCH_LABEL,
  requireCampaignId,
} from './real-product-deployment-contract.js';
import {errorText, shellWord} from './real-product-remote-shell.js';

async function closeHost({host, campaignId, sshRun, opts}) {
  let containerIds;
  try {
    const listed = await sshRun(host, opts,
      `docker ps -aq --filter label=${BENCH_LABEL.CAMPAIGN}=${campaignId}`);
    containerIds = arrayFilter(arrayMap(stringSplit(String(listed ?? ''), /\s+/u),
      (id) => stringTrim(id)), Boolean);
  } catch (error) {
    return {host, removed: null, unclosed: {host, containerIds: null,
      reason: `listing failed: ${errorText(error)}`}};
  }
  if (containerIds.length === 0) return {host, removed: null, unclosed: null};
  try {
    await sshRun(host, opts, `docker rm -f ${arrayJoin(arrayMap(containerIds, shellWord), ' ')}`);
  } catch (error) {
    return {host, removed: null, unclosed: {host, containerIds,
      reason: `removal failed: ${errorText(error)}`}};
  }
  return {host, removed: {host, containerIds}, unclosed: null};
}

/**
 * @param {{hosts: Array<string>, campaignId: string, sshRun: Function,
 *   opts: Object}} input
 * @return {Promise<{complete: boolean, removed: Array<Object>,
 *   unclosed: Array<Object>}>}
 */
async function removeCampaignContainers({hosts, campaignId, sshRun, opts}) {
  requireCampaignId(campaignId);
  const outcomes = await Promise.all(arrayMap([...new Set(hosts)],
    (host) => closeHost({host, campaignId, sshRun, opts})));
  const removed = arrayMap(arrayFilter(outcomes, (one) => one.removed), (one) => one.removed);
  const unclosed = arrayMap(arrayFilter(outcomes, (one) => one.unclosed),
    (one) => one.unclosed);
  return {complete: unclosed.length === 0, removed, unclosed};
}

export {removeCampaignContainers};
