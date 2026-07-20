/**
 * Evidence-only Docker log sidecar for the ordered MovieLens formation probes.
 *
 * This process observes containers carrying the distributed-harness cluster
 * label and follows their existing Docker logs. It does not join the cluster,
 * mutate scenario configuration, or affect the probe/report contract.
 *
 * Usage:
 *   node capture-live-probe-logs.js <output-directory> <cluster-count>
 */

import {execFile, spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const DOCKER_COMMAND = 'docker';
const HARNESS_CLUSTER_LABEL = 'ddb-test.cluster';
const HARNESS_NODE_LABEL = 'ddb-test.node-id';
const POLL_INTERVAL_MS = 250;
const FIELD_SEPARATOR = '\t';
const EXPECTED_ARGUMENT_COUNT = 2;

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

async function listHarnessContainers() {
  const format = [
    '{{.ID}}',
    `{{.Label "${HARNESS_CLUSTER_LABEL}"}}`,
    `{{.Label "${HARNESS_NODE_LABEL}"}}`,
  ].join(FIELD_SEPARATOR);
  const {stdout} = await execFileAsync(DOCKER_COMMAND, [
    'ps',
    '--filter',
    `label=${HARNESS_CLUSTER_LABEL}`,
    '--format',
    format,
  ]);
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [containerId, clusterId, nodeId] = line.split(FIELD_SEPARATOR);
      return {containerId, clusterId, nodeId};
    })
    .filter((entry) => entry.containerId && entry.clusterId && entry.nodeId);
}

function serializeCluster(cluster) {
  return {
    clusterId: cluster.clusterId,
    firstSeenAt: cluster.firstSeenAt,
    completedAt: cluster.completedAt,
    nodes: [...cluster.nodes.values()].map((node) => ({
      containerId: node.containerId,
      nodeId: node.nodeId,
      logPath: node.logPath,
      firstSeenAt: node.firstSeenAt,
      completedAt: node.completedAt,
      exitCode: node.exitCode,
    })),
  };
}

async function followContainer(entry, outputDir, cluster, activeFollowers) {
  const clusterDir = resolve(outputDir, cluster.clusterId);
  await mkdir(clusterDir, {recursive: true});
  const logPath = resolve(clusterDir, `${entry.nodeId}.log`);
  const stream = createWriteStream(logPath, {flags: 'a'});
  const child = spawn(
    DOCKER_COMMAND,
    ['logs', '--follow', '--timestamps', entry.containerId],
    {stdio: ['ignore', 'pipe', 'pipe']},
  );
  const node = {
    ...entry,
    logPath,
    firstSeenAt: new Date().toISOString(),
    completedAt: null,
    exitCode: null,
  };
  cluster.nodes.set(entry.containerId, node);
  activeFollowers.set(entry.containerId, child);
  child.stdout.pipe(stream, {end: false});
  child.stderr.pipe(stream, {end: false});
  child.once('close', (code) => {
    node.completedAt = new Date().toISOString();
    node.exitCode = code;
    activeFollowers.delete(entry.containerId);
    stream.end();
  });
}

async function capture(outputDir, expectedClusterCount) {
  await mkdir(outputDir, {recursive: true});
  const clusters = new Map();
  const activeFollowers = new Map();
  for (;;) {
    const containers = await listHarnessContainers();
    for (const entry of containers) {
      let cluster = clusters.get(entry.clusterId);
      if (!cluster) {
        cluster = {
          clusterId: entry.clusterId,
          firstSeenAt: new Date().toISOString(),
          completedAt: null,
          nodes: new Map(),
        };
        clusters.set(entry.clusterId, cluster);
      }
      if (!cluster.nodes.has(entry.containerId)) {
        await followContainer(entry, outputDir, cluster, activeFollowers);
      }
    }
    const enoughClusters = clusters.size >= expectedClusterCount;
    const allFollowersClosed =
      enoughClusters && activeFollowers.size === 0;
    if (allFollowersClosed) {
      const completedAt = new Date().toISOString();
      for (const cluster of clusters.values()) {
        cluster.completedAt = completedAt;
      }
      const manifestPath = resolve(outputDir, 'capture-manifest.json');
      await writeFile(manifestPath, JSON.stringify({
        schemaVersion: 'formation-probe-log-capture-v1',
        expectedClusterCount,
        completedAt,
        clusters: [...clusters.values()].map(serializeCluster),
      }, null, 2));
      console.log(`Probe log capture complete: ${manifestPath}`);
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

const args = process.argv.slice(2);
if (args.length !== EXPECTED_ARGUMENT_COUNT) {
  throw new Error(
    'Usage: node capture-live-probe-logs.js <output-directory> <cluster-count>',
  );
}
const outputDir = resolve(args[0]);
const expectedClusterCount = parsePositiveInteger(args[1], 'cluster-count');
await capture(outputDir, expectedClusterCount);
