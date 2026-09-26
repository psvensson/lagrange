// A real multi-process Lagrange cluster built from embedded runtimes.
//
// Each node is its own OS process running embedded-node-worker.js, which
// imports only the public package entry and starts one runtime with
// createEmbeddedLagrange().start() (one embedded runtime per process is the
// public contract). The parent test drives each node's application database
// over fork IPC, so every query crosses the exact public seam an application
// uses. The harness itself may read system tables (cluster size, pgwire
// endpoints) to SHAPE and OBSERVE the cluster; consumer code paths never
// need them.
//
// Lifetime: every process, pg client and temporary directory belongs to the
// tap test that created the cluster and is released on its teardown (SIGTERM,
// then SIGKILL after a bounded grace).

import {fork} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {
  managedSleep,
  managedTimeout,
} from '../../../src/test-helpers/managed-timers.js';
import {refuseUnderProbe} from '../../../src/test-helpers/probe-guard.js';
import {getUniqueListenerPorts} from './cluster-test-helpers.js';
import {
  EMBEDDED_STEP_OUTCOME,
  EMBEDDED_WORKER_OP,
  decodeExposure,
  describeExposedError,
  encodeParam,
  exposedProperty,
} from './embedded-node-protocol.js';
import {scaleByMachineFactor} from './test-machine-factor.js';

const EMBEDDED_NODE_ROLE = Object.freeze({
  JOINER: 'joiner',
  SEED: 'seed',
});

// Budgets calibrated on the reference machine (factor 1); scaled per host.
const EMBEDDED_CLUSTER_BUDGET_MS = Object.freeze({
  NODE_START: 60000,
  REQUEST: 30000,
  STOP: 30000,
  KILL_GRACE: 5000,
  CLUSTER_FORMATION: 90000,
  ENDPOINT_DISCOVERY: 90000,
  APPLICATION_WRITES: 240000,
  // One deadline for a whole formation (every start, every join, the first
  // served write), so a stalled formation fails with a log digest inside the
  // suite's own budget instead of being killed silently by the runner.
  FORMATION_TOTAL: 150000,
  VISIBILITY_WINDOW: 20000,
  VISIBILITY_POLL: 100,
  POLL_INTERVAL: 250,
});

const EMBEDDED_CLUSTER_VALUE = Object.freeze({
  ACTIVE_STATUS: 'active',
  HARNESS_APPLICATION_ID: 'embedded-cluster-harness',
  LOCALHOST: 'localhost',
  LOOPBACK_HOST: '127.0.0.1',
  PGWIRE_DATABASE: 'lagrange_acceptance',
  PGWIRE_PASSWORD: 'lagrange-acceptance-password',
  PGWIRE_PROTOCOL: 'postgresql',
  PGWIRE_USER: 'lagrange-acceptance-user',
  TMP_PREFIX: 'lagrange-embedded-cluster-',
  LOG_LEVEL: 'warn',
  LOG_SUFFIX: '.log',
});

const CLUSTER_SQL = Object.freeze({
  NODES: 'SELECT node_id, status FROM nodes',
  WRITE_PROBE_TABLE:
    'CREATE TABLE IF NOT EXISTS embedded_harness_write_probe ' +
    '(id TEXT PRIMARY KEY, written_at INTEGER)',
  WRITE_PROBE_INSERT:
    'INSERT INTO embedded_harness_write_probe (id, written_at) VALUES (?, ?)',
  PGWIRE_ENDPOINTS:
    'SELECT node_id, address, port FROM service_endpoints WHERE protocol = ?',
});

const WORKER_PATH = fileURLToPath(
  new URL('./embedded-node-worker.js', import.meta.url),
);
const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const REFERENCE_SCALE_MS = 1000;
const MIN_REMAINING_BUDGET_MS = 1;

/**
 * The reference (unscaled) budget left until an absolute deadline.
 * @param {number} deadline - epoch ms
 * @return {number}
 */
function referenceBudgetUntil(deadline) {
  const factor = scaleByMachineFactor(REFERENCE_SCALE_MS) / REFERENCE_SCALE_MS;
  return Math.max(MIN_REMAINING_BUDGET_MS,
    Math.floor((deadline - Date.now()) / factor));
}

const LOG_DIGEST = Object.freeze({
  MIN_LEVEL: 40,
  ERROR_LEVEL: 50,
  TOP_MESSAGES: 8,
  LAST_ERRORS: 3,
  LINE_CHARS: 400,
});
// Known cold-formation readiness signatures (owner: the critical-topology
// readiness/rebalancer). Counted in every digest so a failed wait is
// classified against them instead of rediscovered.
const FORMATION_LOG_SIGNATURES = Object.freeze([
  'critical_spread_open',
  'node_ready_lease_incomplete',
  'topology_settling',
  'control_plane_pressure',
  'schema admission',
  'Waiting for transitional cluster membership to settle',
  'control_plane_replicas_not_spread',
  'UNIQUE constraint failed: storage_reservations',
]);
const PARTICIPANT_FAILURE_MARKER = '"participantFailures":[{';
const SIGTERM = 'SIGTERM';
const SIGKILL = 'SIGKILL';

/**
 * The row array an application received from a fulfilled query outcome.
 * @param {{outcome: string, value: *}} outcome
 * @return {Object[]}
 */
function fulfilledRows(outcome) {
  if (outcome.outcome !== EMBEDDED_STEP_OUTCOME.FULFILLED) {
    throw new Error(`query rejected: ${describeExposedError(outcome.value)}`);
  }
  return decodeExposure(outcome.value).rows;
}

function createNodeChannel(t, child, nodeId) {
  const pending = new Map();
  let nextRequestId = 1;
  let exited = null;
  child.on('message', (message) => {
    const waiter = pending.get(message?.id);
    if (!waiter) return;
    pending.delete(message.id);
    waiter.resolve(message);
  });
  child.on('exit', (code, signal) => {
    exited = {code, signal};
    for (const waiter of pending.values()) {
      waiter.reject(new Error(
        `embedded node ${nodeId} exited (${code}/${signal}) mid-request`,
      ));
    }
    pending.clear();
  });

  function request(op, payload = {}, budgetMs = EMBEDDED_CLUSTER_BUDGET_MS.REQUEST) {
    if (exited) {
      return Promise.reject(new Error(`embedded node ${nodeId} has exited`));
    }
    const id = nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = managedTimeout(t, () => {
        pending.delete(id);
        reject(new Error(`embedded node ${nodeId} ${op} exceeded ${budgetMs} ms`));
      }, scaleByMachineFactor(budgetMs));
      pending.set(id, {
        resolve(message) {
          clearTimeout(timer);
          resolve(message);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.send({...payload, id, op});
    });
  }

  return {request, exitState: () => exited};
}

function requireOk(reply, what) {
  if (reply.ok) return reply.value;
  throw new Error(`${what} failed: ${describeExposedError(reply.error)}`);
}

function buildNodeEnvironment(node, role, seedRestPort, credentials, env) {
  const environment = {
    ...process.env,
    ADMIN_WS_PORT: String(node.adminPort),
    DATA_DIR: node.dataDir,
    LOG_LEVEL: EMBEDDED_CLUSTER_VALUE.LOG_LEVEL,
    NODE_ADDRESS: `${EMBEDDED_CLUSTER_VALUE.LOCALHOST}:${node.restPort}`,
    NODE_ID: node.nodeId,
    PGWIRE_AUTH_DATABASE: credentials.database,
    PGWIRE_AUTH_PASSWORD: credentials.password,
    PGWIRE_AUTH_USER: credentials.user,
    REST_API_PORT: String(node.restPort),
    TRANSPORT_WS_PORT: String(node.transportPort),
    ...env,
  };
  delete environment.SEED_NODE_ADDRESS;
  if (role === EMBEDDED_NODE_ROLE.JOINER) {
    environment.SEED_NODE_ADDRESS =
      `${EMBEDDED_CLUSTER_VALUE.LOCALHOST}:${seedRestPort}`;
  }
  return environment;
}

async function stopNode(t, node) {
  if (node.channel.exitState()) return;
  try {
    await node.channel.request(
      EMBEDDED_WORKER_OP.STOP,
      {},
      EMBEDDED_CLUSTER_BUDGET_MS.STOP,
    );
  } catch {
    // A node that cannot stop cleanly is still terminated below.
  }
  if (node.channel.exitState()) return;
  const exited = new Promise((resolve) => node.child.once('exit', resolve));
  node.child.kill(SIGTERM);
  const graceful = await Promise.race([
    exited.then(() => true),
    managedSleep(t, scaleByMachineFactor(EMBEDDED_CLUSTER_BUDGET_MS.KILL_GRACE))
      .then(() => false),
  ]);
  if (!graceful && !node.channel.exitState()) {
    node.child.kill(SIGKILL);
    await exited;
  }
}

/**
 * Run one statement and require that the application received a result.
 * @return {Promise<{outcome: string, value: *}>}
 */
async function mustQuery(node, sessionKey, sql, params = []) {
  const outcome = await node.query(sessionKey, sql, params);
  if (outcome.outcome !== EMBEDDED_STEP_OUTCOME.FULFILLED) {
    throw new Error(`${sql} rejected: ${describeExposedError(outcome.value)}`);
  }
  return outcome;
}

/**
 * Poll a read through one node's public session until `satisfied(rows)`.
 * Cross-node visibility is eventual (follower-local reads, no documented
 * staleness bound), so the window is bounded and measured, never assumed.
 * @return {Promise<{outcome: Object, rows: Object[], windowMs: number}>}
 */
async function readUntil(t, node, sessionKey, sql, params, satisfied,
  windowMs = EMBEDDED_CLUSTER_BUDGET_MS.VISIBILITY_WINDOW) {
  const startedAt = Date.now();
  const deadline = startedAt + scaleByMachineFactor(windowMs);
  let last = null;
  while (Date.now() < deadline) {
    last = await node.query(sessionKey, sql, params);
    if (
      last.outcome === EMBEDDED_STEP_OUTCOME.FULFILLED &&
      satisfied(fulfilledRows(last))
    ) {
      return {outcome: last, rows: fulfilledRows(last),
        windowMs: Date.now() - startedAt};
    }
    await managedSleep(t, EMBEDDED_CLUSTER_BUDGET_MS.VISIBILITY_POLL);
  }
  const observed = last?.outcome === EMBEDDED_STEP_OUTCOME.FULFILLED ?
    JSON.stringify(decodeExposure(last.value)) :
    describeExposedError(last?.value);
  throw new Error(`not visible within ${windowMs} ms (x factor): ` +
    `${sql} ${JSON.stringify(params)} last=${observed}`);
}

async function labelled(label, observation) {
  try {
    return await observation;
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

async function pollUntil(t, budgetMs, read, satisfied, describe) {
  const deadline = Date.now() + scaleByMachineFactor(budgetMs);
  let last;
  while (Date.now() < deadline) {
    try {
      last = await read();
      if (satisfied(last)) return last;
    } catch (error) {
      // An observation that fails is "not yet", recorded for the timeout.
      last = {observationError: error.message};
    }
    await managedSleep(t, EMBEDDED_CLUSTER_BUDGET_MS.POLL_INTERVAL);
  }
  throw new Error(`${describe} not reached within ${budgetMs} ms ` +
    `(x factor); last observation: ${JSON.stringify(last)}`);
}

function parseLogLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/**
 * A bounded digest of one node's warn/error log: the most frequent messages
 * and the last few error lines, so a failed wait says what the node saw.
 * @param {{nodeId: string, role: string, logPath: string}} node
 * @return {string}
 */
function nodeLogDigest(node) {
  let text = '';
  try {
    text = readFileSync(node.logPath, 'utf8');
  } catch (error) {
    return `${node.role} ${node.nodeId}: log unreadable (${error.message})`;
  }
  const counts = new Map();
  const errors = [];
  const participantFailures = [];
  for (const line of text.split('\n')) {
    const entry = parseLogLine(line);
    if (!entry || !(entry.level >= LOG_DIGEST.MIN_LEVEL)) continue;
    counts.set(entry.msg, (counts.get(entry.msg) ?? 0) + 1);
    if (line.includes(PARTICIPANT_FAILURE_MARKER)) {
      participantFailures.push(line.slice(0, LOG_DIGEST.LINE_CHARS * 2));
    }
    if (entry.level >= LOG_DIGEST.ERROR_LEVEL) {
      errors.push(line.slice(0, LOG_DIGEST.LINE_CHARS));
    }
  }
  const signatures = FORMATION_LOG_SIGNATURES
    .map((signature) => [signature, text.split(signature).length - 1])
    .filter(([, count]) => count > 0)
    .map(([signature, count]) => `${count}x ${signature}`);
  const top = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, LOG_DIGEST.TOP_MESSAGES)
    .map(([msg, count]) => `${count}x ${msg}`);
  return `${node.role} ${node.nodeId}: signatures [${signatures.join(' | ')}] ` +
    `top [${top.join(' | ')}] last errors: ` +
    errors.slice(-LOG_DIGEST.LAST_ERRORS).join(' || ') +
    ' last participant failures: ' +
    participantFailures.slice(-LOG_DIGEST.LAST_ERRORS).join(' || ');
}

/**
 * Create a multi-process embedded cluster owned by a tap test.
 * @param {object} t - tap test (owns every process, client and directory)
 * @param {{credentials?: {user: string, password: string, database: string}}}
 *   [options]
 * @return {object} cluster
 */
function createEmbeddedCluster(t, options = {}) {
  refuseUnderProbe('an embedded cluster');
  const rootDir = mkdtempSync(join(tmpdir(), EMBEDDED_CLUSTER_VALUE.TMP_PREFIX));
  const credentials = options.credentials ?? {
    database: EMBEDDED_CLUSTER_VALUE.PGWIRE_DATABASE,
    password: EMBEDDED_CLUSTER_VALUE.PGWIRE_PASSWORD,
    user: EMBEDDED_CLUSTER_VALUE.PGWIRE_USER,
  };
  const nodes = [];
  const pgClients = [];
  let harnessSession = null;
  let stopped = false;

  async function startEmbeddedNode(nodeOptions = {}) {
    const role = nodeOptions.role ?? EMBEDDED_NODE_ROLE.SEED;
    const nodeId = nodeOptions.nodeId ?? randomUUID();
    const listenerPorts = getUniqueListenerPorts();
    const node = {
      adminPort: listenerPorts.adminWebSocketPort,
      dataDir: nodeOptions.dataDir ?? join(rootDir, `node-${nodes.length}`),
      logPath: join(rootDir, `node-${nodes.length}${EMBEDDED_CLUSTER_VALUE.LOG_SUFFIX}`),
      nodeId,
      restPort: listenerPorts.restApiPort,
      role,
      transportPort: listenerPorts.transportWebSocketPort,
    };
    mkdirSync(node.dataDir, {recursive: true});
    const logFd = openSync(node.logPath, 'a');
    const startedAt = Date.now();
    node.child = fork(WORKER_PATH, [], {
      cwd: REPOSITORY_ROOT,
      env: buildNodeEnvironment(
        node,
        role,
        nodeOptions.seedRestPort,
        credentials,
        nodeOptions.env ?? {},
      ),
      stdio: ['ignore', logFd, logFd, 'ipc'],
    });
    closeSync(logFd);
    node.channel = createNodeChannel(t, node.child, nodeId);
    nodes.push(node);
    // The protocol refuses session work before the runtime starts; recorded
    // (not thrown) so a suite can assert the refusal on a real process.
    node.preStartReply = await node.channel.request(
      EMBEDDED_WORKER_OP.OPEN_SESSION,
      {options: {applicationId: EMBEDDED_CLUSTER_VALUE.HARNESS_APPLICATION_ID}},
    );
    requireOk(await node.channel.request(
      EMBEDDED_WORKER_OP.START,
      {configuration: nodeOptions.configuration ?? {}},
      nodeOptions.startBudgetMs ?? EMBEDDED_CLUSTER_BUDGET_MS.NODE_START,
    ), `start ${role} ${nodeId} (log ${node.logPath})`);
    node.startMs = Date.now() - startedAt;

    node.openSession = async (openOptions) => node.channel.request(
      EMBEDDED_WORKER_OP.OPEN_SESSION,
      {options: openOptions},
    );
    node.openApplicationDatabase = async (applicationId) => requireOk(
      await node.openSession({applicationId}),
      `openApplicationDatabase on ${nodeId}`,
    ).sessionKey;
    node.query = async (sessionKey, sql, params = [], extraArgs) => requireOk(
      await node.channel.request(EMBEDDED_WORKER_OP.QUERY, {
        extraArgs,
        params: params.map(encodeParam),
        sessionKey,
        sql,
      }),
      `query on ${nodeId}`,
    );
    node.transaction = async (sessionKey, steps) => requireOk(
      await node.channel.request(EMBEDDED_WORKER_OP.TRANSACTION, {
        sessionKey,
        steps: steps.map((step) => ({
          ...step,
          params: (step.params ?? []).map(encodeParam),
        })),
      }),
      `transaction on ${nodeId}`,
    );
    return node;
  }

  async function seedQueryRows(sql, params = []) {
    const seed = nodes[0];
    harnessSession ??= await seed.openApplicationDatabase(
      EMBEDDED_CLUSTER_VALUE.HARNESS_APPLICATION_ID,
    );
    return fulfilledRows(await seed.query(harnessSession, sql, params));
  }

  // Harness-side evidence (never consumer code): the raw log lines of one
  // node that contain `needle`, so a suite can name the mechanism behind an
  // error the public seam reports only generically.
  function nodeLogLines(node, needle) {
    let text = '';
    try {
      text = readFileSync(node.logPath, 'utf8');
    } catch {
      return [];
    }
    return text.split('\n').filter((line) => line.includes(needle));
  }

  function logDigest() {
    return nodes.map(nodeLogDigest).join('\n');
  }

  async function withLogDigest(wait) {
    try {
      return await wait;
    } catch (error) {
      throw new Error(`${error.message}\nnode logs:\n${logDigest()}`);
    }
  }

  async function waitForClusterSize(expectedCount,
    budgetMs = EMBEDDED_CLUSTER_BUDGET_MS.CLUSTER_FORMATION) {
    const expected = new Set(nodes.map((node) => node.nodeId));
    return withLogDigest(pollUntil(t, budgetMs,
      () => seedQueryRows(CLUSTER_SQL.NODES),
      (rows) => rows.filter((row) =>
        expected.has(row.node_id) &&
        row.status === EMBEDDED_CLUSTER_VALUE.ACTIVE_STATUS).length >=
        expectedCount,
      `${expectedCount} active nodes`));
  }

  // A formed cluster (every node `active`) is not yet a cluster that serves
  // application DDL and writes: the harness waits for one application-level
  // CREATE TABLE IF NOT EXISTS + INSERT to be served through the public
  // session on the seed, and reports how long that took.
  async function waitForApplicationWrites(
    budgetMs = EMBEDDED_CLUSTER_BUDGET_MS.APPLICATION_WRITES,
  ) {
    const startedAt = Date.now();
    let attempts = 0;
    await withLogDigest(pollUntil(t, budgetMs, async () => {
      attempts++;
      await labelled('create', seedQueryRows(CLUSTER_SQL.WRITE_PROBE_TABLE));
      await labelled('insert', seedQueryRows(CLUSTER_SQL.WRITE_PROBE_INSERT,
        [randomUUID(), Date.now()]));
      return true;
    }, (served) => served === true, 'application DDL and writes served'));
    return {attempts, elapsedMs: Date.now() - startedAt};
  }

  // Form a cluster of `size` processes (seed + joiners, each waited to
  // `active`), then wait until it serves application writes. Returns the
  // measured phases for the suite to report.
  async function formCluster(size, nodeOptions = {},
    budgetMs = EMBEDDED_CLUSTER_BUDGET_MS.FORMATION_TOTAL) {
    const startedAt = Date.now();
    const deadline = startedAt + scaleByMachineFactor(budgetMs);
    const remaining = () => referenceBudgetUntil(deadline);
    try {
      const seed = await startEmbeddedNode({...nodeOptions,
        role: EMBEDDED_NODE_ROLE.SEED, startBudgetMs: remaining()});
      for (let index = 1; index < size; index++) {
        await startEmbeddedNode({...nodeOptions, role: EMBEDDED_NODE_ROLE.JOINER,
          seedRestPort: seed.restPort, startBudgetMs: remaining()});
        await waitForClusterSize(index + 1, remaining());
      }
    } catch (error) {
      throw new Error(`formation of ${size} did not complete within ` +
        `${budgetMs} ms (x factor): ${error.message}\nnode logs:\n${logDigest()}`);
    }
    const activeMs = Date.now() - startedAt;
    const writes = await waitForApplicationWrites(remaining());
    return {
      activeMs,
      nodeStartMs: nodes.map((node) => node.startMs),
      writesServedAfterActiveMs: writes.elapsedMs,
      writeAttempts: writes.attempts,
    };
  }

  async function discoverPgwireEndpoints(
    budgetMs = EMBEDDED_CLUSTER_BUDGET_MS.ENDPOINT_DISCOVERY,
  ) {
    const rows = await withLogDigest(pollUntil(t, budgetMs,
      () => seedQueryRows(CLUSTER_SQL.PGWIRE_ENDPOINTS,
        [EMBEDDED_CLUSTER_VALUE.PGWIRE_PROTOCOL]),
      (candidate) => nodes.every((node) =>
        candidate.some((row) => row.node_id === node.nodeId)),
      `a pgwire endpoint on each of ${nodes.length} nodes`));
    const endpoints = new Map();
    for (const row of rows) {
      endpoints.set(row.node_id, {
        host: EMBEDDED_CLUSTER_VALUE.LOOPBACK_HOST,
        nodeId: row.node_id,
        port: Number(row.port),
      });
    }
    return endpoints;
  }

  async function createPgClient(endpoint) {
    const client = new pg.Client({
      database: credentials.database,
      host: endpoint.host,
      password: credentials.password,
      port: endpoint.port,
      ssl: false,
      user: credentials.user,
    });
    await client.connect();
    pgClients.push(client);
    return client;
  }

  async function stopAll() {
    if (stopped) return;
    stopped = true;
    await Promise.allSettled(pgClients.map((client) => client.end()));
    await Promise.allSettled(nodes.map((node) => stopNode(t, node)));
    rmSync(rootDir, {force: true, recursive: true});
  }

  t.teardown(stopAll);

  return {
    createPgClient,
    discoverPgwireEndpoints,
    formCluster,
    logDigest,
    nodeLogLines,
    nodes,
    rootDir,
    seedQueryRows,
    startEmbeddedNode,
    stopAll,
    waitForApplicationWrites,
    waitForClusterSize,
  };
}

export {
  EMBEDDED_STEP_OUTCOME,
  EMBEDDED_WORKER_OP,
  createEmbeddedCluster,
  exposedProperty,
  fulfilledRows,
  mustQuery,
  readUntil,
};
