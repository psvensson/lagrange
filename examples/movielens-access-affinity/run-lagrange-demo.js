import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {AdminWsClient} from '../../scripts/examples/admin-ws-client.js';
import {runExamplesCatalog} from '../../scripts/examples/build-upload-run.js';
import {DEFAULT_TARGET, loadRatingsIntoLagrange} from './lagrange-loader.js';

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
const EXAMPLE_ID = '07-movielens-access-affinity';

function parseArgs(argv) {
  const args = [...argv];
  const flags = new Set(args);
  const nodesIdx = args.indexOf('--nodes');
  const nodesArg = nodesIdx >= 0 ? Number(args[nodesIdx + 1]) : null;
  return {
    noStart: flags.has('--no-start'),
    local: flags.has('--local'),
    nodeCount: nodesArg || Number(process.env.LAGRANGE_NODES) || null,
    target: process.env.LAGRANGE_TARGET,
    dataDir: process.env.LAGRANGE_DATA_DIR,
  };
}

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
    ADMIN_WEBSOCKET_PORT: String(adminPort),
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

async function describeRatingsPartitions(target) {
  try {
    const rows = await queryRows(
      target,
      'SELECT partition_id, leader_node_id, state FROM partitions',
    );
    const userPartitions = rows.filter((row) =>
      String(row.partition_id || '').startsWith('tbl-'),
    );
    return {
      totalPartitionRows: rows.length,
      ratingsPartitions: userPartitions.length,
      ratingsPartitionLeaders: userPartitions.map((row) => ({
        partitionId: row.partition_id,
        leaderNodeId: row.leader_node_id,
      })),
    };
  } catch (error) {
    return {error: error.message};
  }
}

function extractTopMovies(exampleEntry) {
  const hostResult = exampleEntry?.hostResult;
  if (!hostResult) {
    return null;
  }
  const partitionResults =
    hostResult.partitionResults || hostResult.results || null;
  if (Array.isArray(partitionResults)) {
    const returned = partitionResults
      .map((entry) => entry?.result ?? entry?.value ?? entry)
      .filter(Boolean);
    if (returned.length === 1 && Array.isArray(returned[0])) {
      return returned[0];
    }
    return returned;
  }
  return hostResult;
}

async function runExample(target) {
  const artifact = await runExamplesCatalog({
    target,
    include: [EXAMPLE_ID],
    failOnRequired: false,
  });
  console.log(
    `Examples complete: ${artifact.summary?.passed ?? '?'}/` +
    `${artifact.summary?.total ?? '?'} passed`,
  );
  return (artifact.examples || artifact.results || [])
    .find((entry) => entry.id === EXAMPLE_ID) || null;
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

async function startLocalCluster(nodeCount, dataRoot, target) {
  console.log(`Starting ${nodeCount}-node local Lagrange cluster...`);
  await rm(dataRoot, {recursive: true, force: true});
  await mkdir(dataRoot, {recursive: true});

  const nodes = [];
  nodes.push(await startLocalNode(0, dataRoot));
  console.log('Waiting for seed admin endpoint...');
  await waitForAdmin(target);

  for (let i = 1; i < nodeCount; i += 1) {
    nodes.push(await startLocalNode(i, dataRoot));
  }
  console.log('Waiting for cluster formation...');
  const clusterFormationMs = await waitForClusterSize(target, nodeCount);
  console.log(`Cluster formed in ${clusterFormationMs}ms.`);

  return {
    mode: 'local-processes',
    target,
    clusterFormationMs,
    stop: () => stopLocalNodes(nodes),
  };
}

async function startDockerCluster(nodeCount) {
  const {mergeWithDefaults} =
    await import('../../test/distributed/harness/config-parser.js');
  const {CLUSTER_FACTORY_LAYER} =
    await import('../../test/distributed/harness/cluster-factory-layer.js');
  const {createCluster} = CLUSTER_FACTORY_LAYER;
  const {buildImage} = await import('../../test/distributed/run.js');

  console.log(`Starting ${nodeCount}-node Lagrange cluster in Docker...`);
  const config = mergeWithDefaults({size: nodeCount});
  console.log(`Ensuring image ${config.image} is current...`);
  await buildImage(config, false);

  const cluster = createCluster(config);
  if (typeof cluster.setScenarioName === 'function') {
    cluster.setScenarioName('movielens-access-affinity-demo');
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
    stop: () => cluster.stop(),
  };
}

async function runLagrangeDemo(options = null) {
  const resolvedOptions = options || parseArgs(process.argv.slice(2));
  const noStart = resolvedOptions.noStart === true;
  const nodeCount = resolvedOptions.nodeCount || DEFAULT_NODE_COUNT;
  let clusterHandle = null;

  if (noStart) {
    console.log('Using already-running cluster (--no-start).');
    const target = resolvedOptions.target || DEFAULT_TARGET;
    await waitForAdmin(target);
    clusterHandle = {mode: 'external', target, clusterFormationMs: null};
  } else if (resolvedOptions.local === true) {
    clusterHandle = await startLocalCluster(
      nodeCount,
      resolvedOptions.dataDir || CLUSTER_DATA_ROOT,
      resolvedOptions.target || DEFAULT_TARGET,
    );
  } else {
    clusterHandle = await startDockerCluster(nodeCount);
  }

  try {
    const {target} = clusterHandle;
    console.log('Loading ratings into Lagrange...');
    const loadStart = Date.now();
    const totalRows = await loadRatingsIntoLagrange({target});
    const loadDurationMs = Date.now() - loadStart;
    console.log(`Loaded ${totalRows} ratings into Lagrange.`);

    console.log('Running distributed callback example...');
    const callbackStart = Date.now();
    const exampleEntry = await runExample(target);
    const callbackDurationMs = Date.now() - callbackStart;

    const partitions = await describeRatingsPartitions(target);

    return {
      mode: clusterHandle.mode,
      totalRows,
      loadDurationMs,
      callbackDurationMs,
      exampleDurationMs: exampleEntry?.durationMs ?? null,
      examplePassed: exampleEntry?.passed ?? null,
      exampleError: exampleEntry?.error ?? null,
      topMovies: extractTopMovies(exampleEntry),
      partitions,
      nodeCount: clusterHandle.mode === 'external' ? null : nodeCount,
      clusterFormationMs: clusterHandle.clusterFormationMs,
      target: clusterHandle.target,
    };
  } finally {
    if (typeof clusterHandle?.stop === 'function') {
      console.log('Stopping cluster...');
      await clusterHandle.stop();
    }
  }
}

if (process.argv[1]?.includes('run-lagrange-demo.js')) {
  runLagrangeDemo()
    .then((metrics) => {
      console.log('Lagrange demo metrics:');
      console.log(JSON.stringify(metrics, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export {runLagrangeDemo};
