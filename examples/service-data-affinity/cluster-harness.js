import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir, readFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {AdminWsClient} from '../../scripts/examples/admin-ws-client.js';
import {DEFAULT_TARGET} from './lagrange-loader.js';

const DEFAULT_NODE_COUNT = 5;
const BASE_REST_PORT = 8080;
const BASE_ADMIN_PORT = 8081;
// Local mode: each node opens REST, admin WS, and node-to-node WS transport
// (REST + 2), so co-located nodes need a stride of 4 to avoid collisions.
const PORT_STRIDE = 4;
const DOCKER_ADMIN_PORT = 8081;
const CLUSTER_DATA_ROOT = 'data/examples/movielens-lagrange-cluster';
const CLUSTER_FORM_TIMEOUT_MS = 180000;
const CLUSTER_POLL_INTERVAL_MS = 2000;
const NODE_STATUS_ACTIVE = 'active';
const LOCAL_CLUSTER_ROLLBACK_FAILURE_NOTICE =
  'Local cluster rollback also failed; preserving the startup failure.\n';

function nodePorts(index) {
  return {
    restPort: BASE_REST_PORT + index * PORT_STRIDE,
    adminPort: BASE_ADMIN_PORT + index * PORT_STRIDE,
  };
}

async function startLocalNode(index, dataRoot) {
  const {restPort, adminPort} = nodePorts(index);
  const dataDir = resolve(dataRoot, `node-${index}`);
  await mkdir(dataDir, {recursive: true});
  const logStream = createWriteStream(resolve(dataRoot, `node-${index}.log`));

  const env = {
    ...process.env,
    NODE_ADDRESS: `localhost:${restPort}`,
    REST_API_PORT: String(restPort),
    ADMIN_WS_PORT: String(adminPort),
    DATA_DIR: dataDir,
    LOG_LEVEL: 'info',
  };
  const args = ['src/index.js', '--data-dir', dataDir];
  if (index > 0) {
    env.SEED_NODE_ADDRESS = `localhost:${BASE_REST_PORT}`;
    args.push('--seed', `localhost:${BASE_REST_PORT}`);
  }

  const child = spawn('node', args, {env, stdio: ['ignore', 'pipe', 'pipe']});
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  return {index, restPort, adminPort, dataDir, process: child};
}

async function queryRows(target, sql) {
  const client = new AdminWsClient({target, timeoutMs: 10000});
  try {
    const result = await client.query(sql);
    return result?.results || result?.rows || [];
  } finally {
    await client.close();
  }
}

async function waitForAdmin(target, timeoutMs = 60000) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      await queryRows(target, 'SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }
  throw new Error(
    `Timed out waiting for admin endpoint at ${target}: ` +
    `${lastError?.message || 'no response'}`,
  );
}

async function waitForClusterSize(target, expectedCount) {
  const start = Date.now();
  let lastSeen = 0;
  while (Date.now() - start < CLUSTER_FORM_TIMEOUT_MS) {
    let rows = [];
    try {
      rows = await queryRows(target, 'SELECT node_id, status FROM nodes');
    } catch {
      rows = [];
    }
    const active = rows.filter((row) => row.status === NODE_STATUS_ACTIVE);
    if (active.length !== lastSeen) {
      console.log(`Cluster membership: ${active.length}/${expectedCount} active nodes`);
      lastSeen = active.length;
    }
    if (active.length >= expectedCount) {
      return Date.now() - start;
    }
    await sleep(CLUSTER_POLL_INTERVAL_MS);
  }
  throw new Error(
    `Cluster did not reach ${expectedCount} active nodes within ` +
    `${CLUSTER_FORM_TIMEOUT_MS}ms (saw ${lastSeen})`,
  );
}

async function stopLocalNodes(nodes) {
  for (const node of nodes) {
    if (node?.process && node.process.exitCode === null) {
      node.process.kill('SIGTERM');
    }
  }
  const deadline = Date.now() + 15000;
  for (const node of nodes) {
    while (
      node?.process &&
      node.process.exitCode === null &&
      Date.now() < deadline
    ) {
      await sleep(250);
    }
    if (node?.process && node.process.exitCode === null) {
      node.process.kill('SIGKILL');
    }
  }
}

async function startLocalCluster(
  nodeCount,
  dataRoot,
  target,
  dependencies = {},
) {
  const startNode = dependencies.startNode || startLocalNode;
  const awaitAdmin = dependencies.waitForAdmin || waitForAdmin;
  const awaitClusterSize =
    dependencies.waitForClusterSize || waitForClusterSize;
  const stopNodes = dependencies.stopNodes || stopLocalNodes;
  console.log(`Starting ${nodeCount}-node local Lagrange cluster...`);
  await rm(dataRoot, {recursive: true, force: true});
  await mkdir(dataRoot, {recursive: true});

  const nodes = [];
  try {
    nodes.push(await startNode(0, dataRoot));
    console.log('Waiting for seed admin endpoint...');
    await awaitAdmin(target);

    for (let i = 1; i < nodeCount; i += 1) {
      nodes.push(await startNode(i, dataRoot));
    }
    console.log('Waiting for cluster formation...');
    const clusterFormationMs = await awaitClusterSize(target, nodeCount);
    console.log(`Cluster formed in ${clusterFormationMs}ms.`);

    return {
      mode: 'local-processes',
      target,
      clusterFormationMs,
      getNodeLogs: () => readLocalNodeLogs(nodes, dataRoot),
      stop: () => stopNodes(nodes),
    };
  } catch (error) {
    // This function owns every child until it returns the cluster handle.
    // Formation failure cannot transfer that ownership to a caller, so the
    // acquisition owner must roll back every child before surfacing the cause.
    try {
      await stopNodes(nodes);
    } catch {
      // Never decorate the primary failure here. It may be frozen, sealed, a
      // hostile proxy, or even a primitive; attempting to mutate it can replace
      // the acquisition cause with a TypeError. Cleanup remains best-effort and
      // the ownership boundary always rethrows the original value unchanged.
      process.stderr.write(LOCAL_CLUSTER_ROLLBACK_FAILURE_NOTICE);
    }
    throw error;
  }
}

/**
 * Read the per-node log files a local cluster writes (plain text). One
 * unreadable log must not fail the whole harvest - the entry degrades to
 * empty text with a readError the consumer can surface.
 * @param {Object[]} nodes
 * @param {string} dataRoot
 * @return {Promise<Array<{nodeId: string, text: string,
 *   readError?: string}>>}
 */
async function readLocalNodeLogs(nodes, dataRoot) {
  return Promise.all(nodes.map(async (node) => {
    const nodeId = `node-${node.index}`;
    try {
      return {
        nodeId,
        text: await readFile(resolve(dataRoot, `${nodeId}.log`), 'utf8'),
      };
    } catch (error) {
      return {nodeId, text: '', readError: error?.message || String(error)};
    }
  }));
}

async function startDockerCluster(nodeCount) {
  const {mergeWithDefaults} =
    await import('../../test/distributed/harness/config-parser.js');
  const {CLUSTER_FACTORY_LAYER} =
    await import('../../test/distributed/harness/cluster-factory-layer.js');
  const {createCluster} = CLUSTER_FACTORY_LAYER;
  const {buildImage} = await import('../../test/distributed/run.js');
  const {applySourceFingerprintConfig} = await import(
    '../../test/distributed/source-fingerprint-config.js'
  );

  console.log(`Starting ${nodeCount}-node Lagrange cluster in Docker...`);
  const config = await applySourceFingerprintConfig(
    mergeWithDefaults({size: nodeCount}),
  );
  console.log(`Ensuring image ${config.image} is current...`);
  await buildImage(config, false);

  const cluster = createCluster(config);
  if (typeof cluster.setScenarioName === 'function') {
    cluster.setScenarioName('movielens-service-data-affinity-demo');
  }
  const formationStart = Date.now();
  await cluster.start();
  const clusterFormationMs = Date.now() - formationStart;
  console.log(`Cluster formed in ${clusterFormationMs}ms.`);

  const seed = cluster.getNodes()[0];
  return {
    mode: 'docker',
    target: `ws://${seed.ip}:${DOCKER_ADMIN_PORT}/api/admin/stream`,
    clusterFormationMs,
    getNodeLogs: () => Promise.all(cluster.getNodes().map(async (node) => {
      try {
        return {nodeId: node.id, text: await node.getLogs()};
      } catch (error) {
        return {
          nodeId: node.id,
          text: '',
          readError: error?.message || String(error),
        };
      }
    })),
    stop: () => cluster.stop(),
  };
}

/**
 * Start (or attach to) a demo cluster using the demo's mode selection:
 * noStart attaches to a running cluster, local starts local node
 * processes, and the default is the Docker harness.
 * @param {Object} options
 * @param {boolean} [options.noStart]
 * @param {boolean} [options.local]
 * @param {number} [options.nodeCount]
 * @param {string} [options.dataDir]
 * @param {string} [options.target]
 * @return {Promise<Object>} handle {mode, target, clusterFormationMs,
 *   getNodeLogs?, stop?}
 */
async function startCluster(options = {}) {
  const nodeCount = options.nodeCount || DEFAULT_NODE_COUNT;
  if (options.noStart === true) {
    console.log('Using already-running cluster (--no-start).');
    const target = options.target || DEFAULT_TARGET;
    await waitForAdmin(target);
    return {mode: 'external', target, clusterFormationMs: null};
  }
  if (options.local === true) {
    return startLocalCluster(
      nodeCount,
      options.dataDir || CLUSTER_DATA_ROOT,
      options.target || DEFAULT_TARGET,
    );
  }
  return startDockerCluster(nodeCount);
}

export {
  queryRows,
  startCluster,
  startDockerCluster,
  startLocalCluster,
  waitForAdmin,
  waitForClusterSize,
};
