import {mkdir, mkdtemp, readFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createLocalProcessCluster} from
  '../../../examples/service-data-affinity/cluster-harness.js';
import {AdminWsClient} from '../../../scripts/examples/admin-ws-client.js';
import {getTestPort} from '../../../src/test-helpers/port-allocator.js';
import {JOINING_LOG_MSG} from '../../../src/bootstrap/node-joining-constants.js';
import {BOOTSTRAP_API_ROUTE} from '../../../src/bootstrap/bootstrap-api-constants.js';
import {ENTRYPOINT_LOG_MSG} from '../../../src/constants/entrypoint.js';
import {ADMIN_ROUTE, ADMIN_STATUS} from '../../../src/admin/admin-constants.js';
import {HTTP_STATUS, NODE_STATE} from '../../../src/constants/index.js';
import {createBootstrapContactFaultProxy} from
  './bootstrap-contact-fault-proxy.js';

const FORMATION_BUDGET_MS = 30000;
// Failure-only headroom for the process owner's 15-second grace, force-stop,
// child close and log flush. A successful authored test still must fit 30s.
const FORMATION_CLEANUP_CEILING_MS = 60000;
const POLL_INTERVAL_MS = 100;
const OUTPUT_ROOT = resolve('test-output/process-formation');

function scenarioError(code, details, cause) {
  return Object.assign(new Error(code, {cause}), {code, details});
}

async function readNodeLog(node) {
  const text = await readFile(node.logPath, 'utf8');
  // A pipe can be read between writes. Only complete JSON lines are evidence;
  // console output remains diagnostic text, never positive readiness evidence.
  const lines = text.split('\n');
  lines.pop();
  const entries = [];
  for (const line of lines) {
    if (!line.startsWith('{')) continue;
    try {
      entries.push(JSON.parse(line));
    } catch (cause) {
      throw scenarioError('node_log_invalid', {nodeId: node.nodeId, line}, cause);
    }
  }
  return entries;
}

function messageIs(entry, message) {
  return entry.msg === message;
}

async function readHttp(url, signal) {
  try {
    const response = await fetch(url, {signal});
    return {status: response.status, body: await response.json()};
  } catch (cause) {
    if (cause.cause?.code === 'ECONNREFUSED') {
      return {status: null, diagnostic: 'listener_not_open'};
    }
    throw cause;
  }
}

async function queryNode(node, sql, {remainingMs, signal}) {
  signal.throwIfAborted();
  const client = new AdminWsClient({
    target: `ws://127.0.0.1:${node.adminPort}${ADMIN_ROUTE.STREAM}`,
    timeoutMs: remainingMs,
  });
  const cancellation = Promise.withResolvers();
  const abort = () => cancellation.reject(signal.reason);
  signal.addEventListener('abort', abort, {once: true});
  const deadlineMs = Date.now() + remainingMs;
  let connecting = true;
  try {
    await Promise.race([client.connect(), cancellation.promise]);
    connecting = false;
    client.timeoutMs = Math.max(1, deadlineMs - Date.now());
    const result = await Promise.race([client.query(sql), cancellation.promise]);
    return result.results || result.rows || [];
  } catch (cause) {
    if (signal.aborted) throw signal.reason;
    if (connecting && (cause.code === 'ECONNREFUSED' || cause.deferRetry === true)) {
      throw scenarioError('admin_listener_unavailable', {nodeId: node.nodeId}, cause);
    }
    throw scenarioError('admin_query_failed', {nodeId: node.nodeId, sql}, cause);
  } finally {
    signal.removeEventListener('abort', abort);
    // The canonical client owns sockets; the harness must not reconstruct its
    // lifetime. Its close-completion defect is a blocking follow-on owner repair.
    await client.close();
  }
}

async function createProcessFormationScenario(t, testFileId) {
  const startedAt = Date.now();
  const deadlineMs = startedAt + FORMATION_BUDGET_MS;
  await mkdir(OUTPUT_ROOT, {recursive: true});
  const dataRoot = await mkdtemp(resolve(OUTPUT_ROOT, 'run-'));
  const cluster = createLocalProcessCluster({dataRoot});
  const resources = [];
  const acquisitions = new Set();
  let stopPromise = null;

  function waitFor(node, probe, code) {
    return cluster.waitFor(node, async (context) => {
      try {
        return await probe(context);
      } catch (error) {
        if (error.code !== 'admin_listener_unavailable') throw error;
        return {ready: false, diagnostic: error};
      }
    }, {
      deadlineMs, code, pollIntervalMs: POLL_INTERVAL_MS,
    });
  }

  async function startNode(nodeId, seedAddresses = []) {
    const index = cluster.nodes.length;
    return cluster.startNode({
      index, nodeId, seedAddresses,
      dataDir: resolve(dataRoot, `node-${index}`),
      restPort: getTestPort(testFileId),
      adminPort: getTestPort(testFileId),
      transportPort: getTestPort(testFileId),
    }, {deadlineMs});
  }

  async function createBootstrapContactProxy(upstream) {
    if (stopPromise) throw scenarioError('formation_stopping', {deadlineMs});
    const controller = new AbortController();
    const remainingMs = deadlineMs - Date.now();
    const deadlineFailure = scenarioError('formation_deadline_exhausted', {deadlineMs});
    const timer = remainingMs > 0 ? setTimeout(() => {
      controller.abort(deadlineFailure);
    }, remainingMs) : null;
    timer?.unref();
    if (!timer) controller.abort(deadlineFailure);
    const record = {controller, outcome: null};
    record.outcome = Promise.resolve()
      .then(() => createBootstrapContactFaultProxy(upstream, {signal: controller.signal}))
      .then(
        (resource) => ({status: 'fulfilled', resource}),
        (reason) => ({status: 'rejected', reason}),
      );
    acquisitions.add(record);
    try {
      const outcome = await record.outcome;
      if (outcome.status === 'rejected') throw outcome.reason;
      if (stopPromise) {
        await outcome.resource.stop();
        throw scenarioError('formation_stopping', {deadlineMs});
      }
      resources.push(outcome.resource);
      return outcome.resource;
    } finally {
      if (timer) clearTimeout(timer);
      acquisitions.delete(record);
    }
  }

  async function findLog(node, predicate, code) {
    return waitFor(node, async () => {
      const entry = (await readNodeLog(node)).find(predicate);
      return {ready: Boolean(entry), value: entry};
    }, code);
  }

  async function ready(node) {
    return waitFor(node, async ({signal}) => {
      const entries = await readNodeLog(node);
      const operational = entries.some((entry) =>
        entry.nodeId === node.nodeId && messageIs(entry, ENTRYPOINT_LOG_MSG.NODE_READY),
      );
      if (!operational) return {ready: false, diagnostic: 'runtime_handoff_pending'};
      const response = await readHttp(
        `http://127.0.0.1:${node.restPort}${BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY}`, signal,
      );
      return {
        ready: response.status === HTTP_STATUS.OK && response.body?.ready === true,
        value: response.body,
        diagnostic: response,
      };
    }, 'readiness_deadline_exhausted');
  }

  async function joined(node) {
    const completion = await waitFor(node, async () => {
      const entries = await readNodeLog(node);
      const completion = entries.find((entry) =>
        messageIs(entry, JOINING_LOG_MSG.COMPLETED) &&
        entry.nodeId === node.nodeId && entry.lifecycleState === NODE_STATE.READY,
      );
      return {ready: Boolean(completion), value: completion};
    }, 'join_completion_not_observed');
    await ready(node);
    return completion;
  }

  function stop() {
    if (stopPromise) return stopPromise;
    const completion = Promise.withResolvers();
    stopPromise = completion.promise;
    const stoppingReason = scenarioError('formation_stopping', {deadlineMs});
    const pendingAcquisitions = [...acquisitions];
    for (const acquisition of pendingAcquisitions) {
      acquisition.controller.abort(stoppingReason);
    }
    const actions = [
      () => cluster.stop(),
      ...resources.map((resource) => () => resource.stop()),
      ...pendingAcquisitions.map((acquisition) => async () => {
        const outcome = await acquisition.outcome;
        if (outcome.status === 'fulfilled') return outcome.resource.stop();
        if (outcome.reason?.cause === stoppingReason) return;
        throw outcome.reason;
      }),
    ];
    Promise.allSettled(actions.map((action) => Promise.resolve().then(action)))
      .then((results) => {
        const failures = results.filter((result) => result.status === 'rejected')
          .map((result) => result.reason);
        if (failures.length) {
          t.comment(`Process formation failure logs retained at ${dataRoot}`);
          completion.reject(new AggregateError(failures, 'formation_teardown_failed'));
        } else {
          completion.resolve();
        }
      });
    return stopPromise;
  }
  t.teardown(stop);

  return {
    cluster, dataRoot, startNode, ready, joined, waitFor, findLog,
    createBootstrapContactProxy,
    own: (resource) => resources.push(resource),
    address: (node) => `http://127.0.0.1:${node.restPort}`,
    query: (node, sql) => waitFor(node, async (context) => ({
      ready: true, value: await queryNode(node, sql, context),
    }), 'admin_query_failed'),
    health: (node) => waitFor(node, async ({signal}) => {
      const response = await readHttp(`http://127.0.0.1:${node.adminPort}${ADMIN_ROUTE.HEALTH}`, signal);
      return {
        ready: response.status === HTTP_STATUS.OK && response.body?.status === ADMIN_STATUS.HEALTHY,
        value: response, diagnostic: response,
      };
    }, 'admin_health_unavailable'),
    async finish() {
      await stop();
      const inBudget = Date.now() - startedAt <= FORMATION_BUDGET_MS;
      t.ok(inBudget,
        'formation and full graceful teardown meet the 30-second integration budget');
      if (inBudget && t.passing()) await rm(dataRoot, {recursive: true});
    },
  };
}

export {
  FORMATION_CLEANUP_CEILING_MS,
  createProcessFormationScenario, messageIs, readNodeLog, queryNode,
};
