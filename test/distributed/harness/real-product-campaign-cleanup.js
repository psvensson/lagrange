/**
 * Teardown of one benchmark campaign's containers: only containers carrying
 * `lagrange.bench.campaign=<campaignId>` on the campaign's own hosts, never a
 * name pattern that matches another agent's or campaign's containers (D20).
 * What could not be closed is returned, per host, for the run record's
 * `closure`; teardown never throws on a host failure.
 */
import {
  arrayFilter,
  arrayFind,
  arrayIncludes,
  arrayJoin,
  arrayMap,
  stringSplit,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {
  BENCH_LABEL,
  POSTGRES_IMAGE_DEFAULT,
  requireCampaignId,
} from './real-product-deployment-contract.js';
import {
  errorText,
  settleConcurrentBatch,
  shellWord,
} from './real-product-remote-shell.js';

const CLEANUP_SSH_TIMEOUT_MS = 15000;
const STORAGE_SUBDIR_PATTERN = /^[A-Za-z0-9._-]+$/u;

function cleanupCallOpts(opts) {
  return {
    ...(opts || {}),
    signal: null,
    deadlineAtMs: null,
    deadlineMs: null,
    timeoutMs: CLEANUP_SSH_TIMEOUT_MS,
  };
}

function parseContainerIds(output) {
  return arrayFilter(
    arrayMap(stringSplit(String(output ?? ''), /\s+/u), (id) => stringTrim(id)),
    Boolean,
  );
}

function requireSafeStorageSubdir(subDir) {
  const value = typeof subDir === 'string' ? subDir : '';
  if (!value || value === '.' || value === '..' || !STORAGE_SUBDIR_PATTERN.test(value)) {
    throw new Error(`unsafe storage cleanup subdirectory: ${String(subDir)}`);
  }
  return value;
}

async function closeHost({host, campaignId, sshRun, opts}) {
  const listCommand = `docker ps -aq --filter label=${BENCH_LABEL.CAMPAIGN}=${campaignId}`;
  let containerIds;
  try {
    const listed = await sshRun(host, opts, listCommand, opts?.timeoutMs);
    containerIds = parseContainerIds(listed);
  } catch (error) {
    return {
      host,
      confirmedClosed: false,
      removed: null,
      unclosed: {
        host,
        containerIds: null,
        reason: `listing failed: ${errorText(error)}`,
      },
    };
  }
  if (containerIds.length === 0) {
    return {host, confirmedClosed: true, removed: null, unclosed: null};
  }
  try {
    await sshRun(
      host,
      opts,
      `docker rm -f ${arrayJoin(arrayMap(containerIds, shellWord), ' ')}`,
      opts?.timeoutMs,
    );
  } catch (error) {
    return {
      host,
      confirmedClosed: false,
      removed: null,
      unclosed: {
        host,
        containerIds,
        reason: `removal failed: ${errorText(error)}`,
      },
    };
  }
  try {
    const verified = await sshRun(host, opts, listCommand, opts?.timeoutMs);
    const remainingIds = parseContainerIds(verified);
    if (remainingIds.length > 0) {
      return {
        host,
        confirmedClosed: false,
        removed: null,
        unclosed: {
          host,
          containerIds: remainingIds,
          reason: 'containers still present after docker rm -f',
        },
      };
    }
  } catch (error) {
    return {
      host,
      confirmedClosed: false,
      removed: null,
      unclosed: {
        host,
        containerIds,
        reason: `post-removal verification failed: ${errorText(error)}`,
      },
    };
  }
  return {host, confirmedClosed: true, removed: {host, containerIds}, unclosed: null};
}

/**
 * @param {{hosts: Array<string>, campaignId: string, sshRun: Function,
 *   opts: Object}} input
 * @return {Promise<{complete: boolean, removed: Array<Object>,
 *   unclosed: Array<Object>, confirmedClosedHosts: Array<string>}>}
 */
async function removeCampaignContainers({hosts, campaignId, sshRun, opts}) {
  requireCampaignId(campaignId);
  const cleanupOpts = cleanupCallOpts(opts);
  const uniqueHosts = [...new Set(hosts)];
  const outcomes = await settleConcurrentBatch(
    uniqueHosts,
    (host) => closeHost({host, campaignId, sshRun, opts: cleanupOpts}),
  );
  const removed = arrayMap(arrayFilter(outcomes, (one) => one.removed), (one) => one.removed);
  const unclosed = arrayMap(arrayFilter(outcomes, (one) => one.unclosed),
    (one) => one.unclosed);
  const confirmedClosedHosts = arrayMap(
    arrayFilter(outcomes, (one) => one.confirmedClosed),
    (one) => one.host,
  );
  const containersClosed = unclosed.length === 0;
  return {
    complete: containersClosed,
    containersClosed,
    storageClosed: true,
    removed,
    unclosed,
    confirmedClosedHosts,
  };
}

async function cleanupConfirmedClosedHostStorage({
  campaignId,
  storageRoot,
  pendingStorageByHost,
  confirmedClosedHosts,
  sshRun,
  opts,
}) {
  const removedHosts = [];
  const deferredHosts = [];
  const errors = [];
  const helperLaunchedHosts = [];
  if (!storageRoot || !(pendingStorageByHost instanceof Map) || pendingStorageByHost.size === 0) {
    return {removedHosts, deferredHosts, errors, helperLaunchedHosts};
  }
  const cleanupOpts = cleanupCallOpts(opts);
  const closedSet = new Set(Array.isArray(confirmedClosedHosts) ? confirmedClosedHosts : []);
  const entries = [...pendingStorageByHost.entries()];
  await settleConcurrentBatch(entries, async ([hostIp, subDirs]) => {
    if (!(subDirs instanceof Set) || subDirs.size === 0) return;
    const dirs = [...subDirs];
    if (!closedSet.has(hostIp)) {
      deferredHosts.push({
        host: hostIp,
        subDirs: dirs,
        reason: 'container_closure_unconfirmed',
      });
      return;
    }
    try {
      const safeDirs = arrayMap(dirs, requireSafeStorageSubdir);
      const labelFlag = `${BENCH_LABEL.CAMPAIGN}=${campaignId}`;
      const command =
        `docker run --rm --pull=never --label ${shellWord(labelFlag)} --user 0:0 ` +
        `-v ${shellWord(`${storageRoot}:/bench-cleanup`)} --entrypoint sh ` +
        `${shellWord(POSTGRES_IMAGE_DEFAULT)} -ceu ` +
        '\'for d in "$@"; do rm -rf -- "/bench-cleanup/$d"; done\' sh ' +
        arrayJoin(arrayMap(safeDirs, shellWord), ' ');
      helperLaunchedHosts.push(hostIp);
      await sshRun(hostIp, cleanupOpts, command, cleanupOpts.timeoutMs);
      subDirs.clear();
      removedHosts.push({host: hostIp, subDirs: safeDirs});
    } catch (error) {
      errors.push({host: hostIp, subDirs: dirs, error: errorText(error)});
    }
  });
  return {removedHosts, deferredHosts, errors, helperLaunchedHosts};
}

function mergePostHelperContainerClosure(hosts, initialClosed, postHelperClosed) {
  const uniqueHosts = [...new Set(hosts)];
  const helperHostSet = new Set([
    ...arrayMap(postHelperClosed.removed, (entry) => entry.host),
    ...arrayMap(postHelperClosed.unclosed, (entry) => entry.host),
    ...postHelperClosed.confirmedClosedHosts,
  ]);
  const removed = [];
  const unclosed = [];
  const confirmedClosedHosts = [];
  for (const host of uniqueHosts) {
    const initialRemoved = arrayFind(initialClosed.removed, (one) => one.host === host);
    const postRemoved = arrayFind(postHelperClosed.removed, (one) => one.host === host);
    const combinedRemovedIds = [
      ...new Set([
        ...(initialRemoved?.containerIds || []),
        ...(postRemoved?.containerIds || []),
      ]),
    ];
    if (combinedRemovedIds.length > 0) {
      removed.push({host, containerIds: combinedRemovedIds});
    }
    if (helperHostSet.has(host)) {
      const postUnclosed = arrayFind(postHelperClosed.unclosed, (one) => one.host === host);
      if (postUnclosed) {
        unclosed.push(postUnclosed);
      } else if (arrayIncludes(postHelperClosed.confirmedClosedHosts, host)) {
        confirmedClosedHosts.push(host);
      }
    } else {
      const initialUnclosed = arrayFind(initialClosed.unclosed, (one) => one.host === host);
      if (initialUnclosed) {
        unclosed.push(initialUnclosed);
      } else if (arrayIncludes(initialClosed.confirmedClosedHosts, host)) {
        confirmedClosedHosts.push(host);
      }
    }
  }
  return {removed, unclosed, confirmedClosedHosts};
}

async function teardownCampaignDeployment({
  hosts,
  campaignId,
  storageRoot = null,
  pendingStorageByHost = null,
  sshRun,
  opts,
}) {
  const closed = await removeCampaignContainers({hosts, campaignId, sshRun, opts});
  if (!storageRoot || !(pendingStorageByHost instanceof Map) || pendingStorageByHost.size === 0) {
    return {
      ...closed,
      containersClosed: closed.complete,
      storageClosed: true,
      complete: closed.complete,
    };
  }
  let storageCleanup;
  try {
    storageCleanup = await cleanupConfirmedClosedHostStorage({
      campaignId,
      storageRoot,
      pendingStorageByHost,
      confirmedClosedHosts: closed.confirmedClosedHosts,
      sshRun,
      opts,
    });
  } catch (error) {
    storageCleanup = {
      removedHosts: [],
      deferredHosts: [],
      errors: [{host: null, subDirs: [], error: errorText(error)}],
      helperLaunchedHosts: [],
    };
  }
  const helperLaunchedHosts = storageCleanup.helperLaunchedHosts || [];
  let finalClosure = {
    removed: closed.removed,
    unclosed: closed.unclosed,
    confirmedClosedHosts: closed.confirmedClosedHosts,
  };
  if (helperLaunchedHosts.length > 0) {
    const postHelperClosed = await removeCampaignContainers({
      hosts: helperLaunchedHosts,
      campaignId,
      sshRun,
      opts,
    });
    finalClosure = mergePostHelperContainerClosure(hosts, closed, postHelperClosed);
  }
  const containersClosed = finalClosure.unclosed.length === 0;
  const storageClosed = storageCleanup.errors.length === 0 &&
    storageCleanup.deferredHosts.length === 0;
  return {
    complete: containersClosed && storageClosed,
    containersClosed,
    storageClosed,
    removed: finalClosure.removed,
    unclosed: finalClosure.unclosed,
    confirmedClosedHosts: finalClosure.confirmedClosedHosts,
    storageCleanup,
  };
}

export {
  removeCampaignContainers,
  teardownCampaignDeployment,
};
