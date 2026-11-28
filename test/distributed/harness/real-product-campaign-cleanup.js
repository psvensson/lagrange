/**
 * Teardown of one benchmark campaign's containers: only containers carrying
 * `lagrange.bench.campaign=<campaignId>` on the campaign's own hosts, never a
 * name pattern that matches another agent's or campaign's containers (D20).
 * What could not be closed is returned, per host, for the run record's
 * `closure`; teardown never throws on a host failure.
 */
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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
// The last lines of each product container's log kept when a run fails before its window: at
// a few hundred bytes a line, a few hundred kilobytes per node, which fits the evidence
// margin and the ssh answer buffer while covering formation, which logs at its start.
// A research run keeps the whole log of every node up to this many bytes per node (the cap is
// stated in the record when it is reached: the bytes kept and the bytes the log held).
const NODE_LOG_BYTE_CAP = 48 * 1024 * 1024;
const NODE_LOG_SSH_TIMEOUT_MS = 120000;
const NODE_LOG_SUBDIR = 'node-logs';
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

async function closeHostContainers({host, campaignId, sshRun, opts}) {
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

// The campaign's own Docker networks (the research first look runs its nodes on
// one): listed by the campaign label, removed once the containers are gone. A
// network that is left behind is an unclosed resource like a left container.
async function closeHostNetworks({host, campaignId, sshRun, opts}) {
  const listCommand = `docker network ls -q --filter label=${BENCH_LABEL.CAMPAIGN}=${campaignId}`;
  const unclosed = (networkIds, reason) => ({host, confirmedClosed: false, removed: null,
    unclosed: {host, containerIds: null, networkIds, reason}});
  let networkIds;
  try {
    networkIds = parseContainerIds(await sshRun(host, opts, listCommand, opts?.timeoutMs));
    if (networkIds.length === 0) {
      return {host, confirmedClosed: true, removed: null, unclosed: null};
    }
    await sshRun(host, opts, `docker network rm ${arrayJoin(arrayMap(networkIds, shellWord), ' ')}`,
      opts?.timeoutMs);
    const remaining = parseContainerIds(await sshRun(host, opts, listCommand, opts?.timeoutMs));
    if (remaining.length > 0) return unclosed(remaining, 'networks still present after removal');
  } catch (error) {
    return unclosed(networkIds ?? null, `network closure failed: ${errorText(error)}`);
  }
  return {host, confirmedClosed: true, removed: {host, containerIds: [], networkIds},
    unclosed: null};
}

async function closeHost({host, campaignId, sshRun, opts, campaignNetwork}) {
  const containers = await closeHostContainers({host, campaignId, sshRun, opts});
  if (!campaignNetwork || !containers.confirmedClosed) return containers;
  const networks = await closeHostNetworks({host, campaignId, sshRun, opts});
  return networks.unclosed ? networks : {...containers,
    removed: containers.removed ?? networks.removed};
}

/**
 * @param {{hosts: Array<string>, campaignId: string, sshRun: Function,
 *   opts: Object, campaignNetwork?: boolean}} input campaignNetwork: the campaign created a
 *   Docker network on its hosts, which closes with its containers
 * @return {Promise<{complete: boolean, removed: Array<Object>,
 *   unclosed: Array<Object>, confirmedClosedHosts: Array<string>}>}
 */
async function removeCampaignContainers({hosts, campaignId, sshRun, opts,
  campaignNetwork = false}) {
  requireCampaignId(campaignId);
  const cleanupOpts = cleanupCallOpts(opts);
  const uniqueHosts = [...new Set(hosts)];
  const outcomes = await settleConcurrentBatch(
    uniqueHosts,
    (host) => closeHost({host, campaignId, sshRun, opts: cleanupOpts, campaignNetwork}),
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
  campaignNetwork = false,
  storageRoot = null,
  pendingStorageByHost = null,
  sshRun,
  opts,
}) {
  const closed = await removeCampaignContainers({hosts, campaignId, sshRun, opts,
    campaignNetwork});
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
      campaignNetwork,
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

/**
 * The `docker logs` of every distinct product container, whole up to a byte cap per node,
 * written into the campaign evidence beside the raw record before teardown. A log that could not be collected is a
 * typed entry with its reason, never an absence.
 * @param {{containers: Array<{host: string, containerId: string, role: string}>,
 *   runId: string, evidenceDir: string, sshRun: Function, opts: Object}} input
 * @return {Promise<Array<Object>>} {containerId, role, host, path, bytes, sha256} or
 *   {containerId, role, host, unavailable}
 */
async function collectContainerLogs({containers, runId, evidenceDir, sshRun, opts}) {
  const callOpts = cleanupCallOpts(opts);
  const seen = new Set();
  const entries = [];
  for (const {host, containerId, role} of containers) {
    if (seen.has(containerId)) continue;
    seen.add(containerId);
    try {
      const logCommand = `docker logs ${shellWord(containerId)} 2>&1`;
      const text = String(await sshRun(host, callOpts, `${logCommand} | head -c ${NODE_LOG_BYTE_CAP}`,
        NODE_LOG_SSH_TIMEOUT_MS) ?? '');
      const bytes = Buffer.byteLength(text);
      const truncated = bytes >= NODE_LOG_BYTE_CAP ? {truncated: {capBytes: NODE_LOG_BYTE_CAP,
        keptBytes: bytes, totalBytes: Number(String(await sshRun(host, callOpts,
          `${logCommand} | wc -c`, NODE_LOG_SSH_TIMEOUT_MS)).trim())}} : {};
      const relative = path.join(runId, NODE_LOG_SUBDIR, `${role}-${containerId.slice(0, 12)}.log`);
      fs.mkdirSync(path.dirname(path.join(evidenceDir, relative)), {recursive: true});
      fs.writeFileSync(path.join(evidenceDir, relative), text);
      entries.push({containerId, role, host, path: relative, bytes,
        sha256: createHash('sha256').update(text).digest('hex'), ...truncated});
    } catch (error) {
      entries.push({containerId, role, host, unavailable: errorText(error)});
    }
  }
  return entries;
}

export {
  collectContainerLogs,
  removeCampaignContainers,
  teardownCampaignDeployment,
};
