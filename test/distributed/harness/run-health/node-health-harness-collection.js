/**
 * The harness's use of the node health collection function: one
 * collectClusterHealth call over the nodes' admin diagnostics route at the
 * end of a run, written to the scenario directory as `node-health.json`.
 *
 * The harness holds every node's admin endpoint, so it is the caller that
 * asks each member. A node that does not answer within the bound, answers
 * with an error status (an image without the route), or has no admin
 * endpoint is an explicit `unreachable` entry in the file.
 */

import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ADMIN_ROUTE} from '../../../../src/admin/admin-constants.js';
import {
  collectClusterHealth,
} from '../../../../src/diagnostics/node-health-collection.js';
import {PLAYBACK} from '../constants.js';
import {NODE_HEALTH_FILENAME} from './run-health-artifacts.js';
import {
  arrayMap,
} from './captured-intrinsics.js';

const TEXT_ENCODING = 'utf8';
const SINCE_QUERY = '?sinceMs=';
const NO_ADMIN_ENDPOINT = 'node handle has no admin endpoint';

async function requestNodeHealth(node, {sinceMs, timeoutMs}, fetchImpl) {
  if (!node?.ip || !node?._adminApiPort) throw new Error(NO_ADMIN_ENDPOINT);
  const response = await fetchImpl(
    `http://${node.ip}:${node._adminApiPort}${ADMIN_ROUTE.NODE_HEALTH}${SINCE_QUERY}${sinceMs}`,
    {signal: globalThis.AbortSignal.timeout(timeoutMs)});
  if (!response.ok) throw new Error(`admin route answered status ${response.status}`);
  return (await response.json()).health;
}

/**
 * @param {Object} options
 * @param {Array<Object>} options.nodes - The cluster's node handles.
 * @param {number} options.sinceMs - The run's start.
 * @param {number} [options.timeoutMs] - The bound for each node.
 * @param {Function} [options.fetchImpl] - fetch stand-in (tests).
 * @return {Promise<Object>} collectClusterHealth's result.
 */
function collectClusterNodeHealth({nodes, sinceMs,
  timeoutMs = PLAYBACK.resourceDiagnosticsTimeoutMs, fetchImpl = fetch}) {
  const byId = new Map(arrayMap(nodes, (node) => [String(node?.id), node]));
  return collectClusterHealth({
    memberNodeIds: [...byId.keys()],
    sinceMs,
    timeoutMs,
    requestNodeHealth: (nodeId, bound) => requestNodeHealth(byId.get(nodeId), bound, fetchImpl),
  });
}

/**
 * Collect once and write `node-health.json` into the scenario directory.
 * @param {Object} options - As collectClusterNodeHealth, plus scenarioDir.
 * @return {Promise<Object>} What was written.
 */
async function writeClusterNodeHealth({scenarioDir, ...options}) {
  const clusterHealth = await collectClusterNodeHealth(options);
  await writeFile(join(scenarioDir, NODE_HEALTH_FILENAME),
    JSON.stringify(clusterHealth), TEXT_ENCODING);
  return clusterHealth;
}

export {collectClusterNodeHealth, writeClusterNodeHealth};
