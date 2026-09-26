/**
 * Scenario: public-seam-durability
 *
 * Provider-neutral durability/failure scenario at the PUBLIC seam. An
 * image-like object (`objects(id, body BYTEA, version)` plus an append-only
 * `object_history`) is written in one transaction through a public
 * PostgreSQL-wire client on one node, read back from the others, kept
 * writable while a joiner is stopped, and verified identical and
 * exactly-once on every node after the joiner is started again.
 *
 * It never reads consensus state (no raft state, configuration, terms,
 * leaders, or peers): only public client results plus the harness's own
 * convergence verdicts. The stopped node is chosen by its harness role (a
 * joiner), never by consensus role.
 *
 * Every step is reported with expected/actual and a named outcome; the
 * report ends with a certification line derived from the runtime's
 * provider-control owner. While the legacy provider is the runtime
 * default the status is PREPARED_BLOCKED_ON_RS_RAFT_CUTOVER: a PASS then
 * proves the harness, not an rs-raft certification.
 */

import {CONVERGENCE_DEFAULTS, NODE_ROLES} from '../harness/constants.js';
import {
  resolvePublicSeamDurabilityScenarioConfig,
  resolveScenarioOptions,
} from '../harness/scenario-config.js';
import {
  createObservedClient,
  deriveCertificationStatus,
  discoverPublicEndpoints,
  findTopologyLeakKeys,
  findTopologyLeakValues,
  listHarnessTopologyIdentifiers,
  openPgPublicClient,
  provisionPublicListener,
} from './public-seam-durability-client.js';
import {
  PUBLIC_SEAM_IDENTIFIER_SOURCE,
  PUBLIC_SEAM_INTERIM_RETRY_POLICY,
  PUBLIC_SEAM_NOT_RUN_REASON,
  PUBLIC_SEAM_OBJECT,
  PUBLIC_SEAM_OVERRIDES_KEY,
  PUBLIC_SEAM_SCENARIO_CONFIG_KEY,
  PUBLIC_SEAM_SCENARIO_NAME,
  PUBLIC_SEAM_SQL,
  PUBLIC_SEAM_STEP,
  PUBLIC_SEAM_STEP_OUTCOME,
  PUBLIC_SEAM_VERDICT,
  PUBLIC_SEAM_WRITE_OUTCOME,
} from './public-seam-durability-constants.js';
import {
  createBindingSteps,
  defaultDeployBinding,
} from './public-seam-durability-binding.js';
import {
  canonicalBody,
  buildObjectBody,
  exactlyOnceViolations,
  expectedHistory,
  readObjectState,
  writeObjectVersion,
} from './public-seam-durability-state.js';

const ZERO = 0;
const ONE = 1;
const MIN_NODE_COUNT = 3;
const LEAK_SAMPLE_LIMIT = 20;
const OUTAGE_WRITE_VERSION = 2;
const LOAD_ACTIVE_MODE = 'load';

function defaultSleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function resolveDependencies(cluster) {
  const overrides =
    cluster?._scenarioOverrides?.[PUBLIC_SEAM_OVERRIDES_KEY] || {};
  return {
    deployBinding: overrides.deployBinding || defaultDeployBinding,
    discoverEndpoints: overrides.discoverEndpoints || discoverPublicEndpoints,
    listTopologyIdentifiers: overrides.listTopologyIdentifiers ||
      listHarnessTopologyIdentifiers,
    openPublicClient: overrides.openPublicClient || openPgPublicClient,
    provisionListener: overrides.provisionListener || provisionPublicListener,
    resolveRuntimeProvider: overrides.resolveRuntimeProvider,
    retryPolicy: overrides.retryPolicy || PUBLIC_SEAM_INTERIM_RETRY_POLICY,
    runId: typeof overrides.runId === 'string' ?
      overrides.runId :
      `${PUBLIC_SEAM_SCENARIO_NAME}-${Date.now()}`,
    sleep: overrides.sleep || defaultSleep,
  };
}

/**
 * Poll `probe` until it returns {done: true} or the window closes.
 * @return {Promise<{done: boolean, value: *, lastError: string|null}>}
 */
async function pollUntil(ctx, timeoutMs, probe) {
  const deadline = Date.now() + timeoutMs;
  let last = {done: false, lastError: null, value: null};
  for (;;) {
    try {
      last = {lastError: null, ...await probe()};
    } catch (error) {
      last = {done: false, lastError: error.message, value: last.value};
    }
    if (last.done || Date.now() >= deadline) {
      return last;
    }
    await ctx.deps.sleep(ctx.config.pollIntervalMs);
  }
}

function pass(expected, actual) {
  return {actual, expected, outcome: PUBLIC_SEAM_STEP_OUTCOME.PASS};
}

function fail(expected, actual, reason) {
  return {actual, expected, outcome: PUBLIC_SEAM_STEP_OUTCOME.FAIL, reason};
}

function verdictOf(ok, expected, actual, reason) {
  return ok ? pass(expected, actual) : fail(expected, actual, reason);
}

async function waitForClusterConvergence(ctx) {
  const {cluster, config} = ctx;
  if (typeof cluster.waitForConvergence === 'function') {
    return cluster.waitForConvergence({
      quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
      settleTimeoutMs: config.convergenceTimeoutMs,
      targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
    });
  }
  return cluster.waitForAllActive({
    mode: LOAD_ACTIVE_MODE,
    timeoutMs: config.convergenceTimeoutMs,
  });
}

function clientFor(ctx, node) {
  const client = ctx.clients.get(node.id);
  if (!client) {
    throw new Error(`no public client open for ${node.id}`);
  }
  return client;
}

async function closeClient(ctx, nodeId) {
  const client = ctx.clients.get(nodeId);
  ctx.clients.delete(nodeId);
  if (!client) {
    return;
  }
  try {
    await client.close();
  } catch (error) {
    ctx.closeFailures.push({message: error.message, nodeId});
  }
}

async function tryOpenClient(ctx, node, ports, connectErrors) {
  for (const port of ports) {
    try {
      const raw = await ctx.deps.openPublicClient(node, port);
      ctx.clients.set(node.id, createObservedClient(raw, node.id,
        ctx.observations, ctx.deps.retryPolicy));
      return port;
    } catch (error) {
      connectErrors[node.id] = `${port}: ${error.message}`;
    }
  }
  return null;
}

/**
 * Within one bounded window, discover healthy public endpoints and connect
 * a client on every node that has none yet. A missing row, an unhealthy
 * row, or a connect failure (e.g. a stale port) are all "not yet" until
 * the window closes.
 * @return {Promise<{connected: Object, missing: Array<string>,
 *   connectErrors: Object}>}
 */
async function openClientsForNodes(ctx, nodes) {
  const connected = {};
  const connectErrors = {};
  const pending = () => nodes.filter((node) => !ctx.clients.has(node.id));
  await pollUntil(ctx, ctx.config.publicClient.endpointTimeoutMs,
    async () => {
      const ports = await ctx.deps.discoverEndpoints(ctx.writer);
      for (const node of pending()) {
        const port = await tryOpenClient(ctx, node, ports.get(node.id) || [],
          connectErrors);
        if (port !== null) {
          connected[node.id] = port;
          delete connectErrors[node.id];
        }
      }
      return {done: pending().length === ZERO};
    });
  return {
    connectErrors,
    connected,
    missing: pending().map((node) => node.id),
  };
}

async function stepClusterConverged(ctx) {
  ctx.convergenceTiming = await waitForClusterConvergence(ctx);
  return verdictOf(ctx.nodes.length >= MIN_NODE_COUNT,
    `>= ${MIN_NODE_COUNT} converged nodes`,
    {nodeCount: ctx.nodes.length},
    'scenario needs a writer, a survivor and a stoppable joiner');
}

async function stepPublicClientReady(ctx) {
  if (ctx.config.publicClient.provisionListener) {
    await ctx.deps.provisionListener(ctx.writer, ctx.nodes.length);
  }
  const opened = await openClientsForNodes(ctx, ctx.nodes);
  return verdictOf(opened.missing.length === ZERO,
    'a public PostgreSQL-wire endpoint and client on every node',
    opened, `no public endpoint for ${opened.missing.join(', ')}`);
}

async function waitForSchemaEverywhere(ctx) {
  const probes = [PUBLIC_SEAM_SQL.PROBE_OBJECTS, PUBLIC_SEAM_SQL.PROBE_HISTORY];
  const readiness = {};
  for (const node of ctx.nodes) {
    const client = clientFor(ctx, node);
    const result = await pollUntil(ctx, ctx.config.readTimeoutMs, async () => {
      for (const sql of probes) {
        await client.query(sql);
      }
      return {done: true};
    });
    readiness[node.id] = result.done ? 'readable' : result.lastError;
  }
  return readiness;
}

async function stepObjectWriteCommitted(ctx) {
  const client = clientFor(ctx, ctx.writer);
  await client.query(PUBLIC_SEAM_SQL.CREATE_OBJECTS);
  await client.query(PUBLIC_SEAM_SQL.CREATE_HISTORY);
  const schema = await waitForSchemaEverywhere(ctx);
  const write = await writeObjectVersion(ctx, client,
    PUBLIC_SEAM_OBJECT.INITIAL_VERSION, PUBLIC_SEAM_STEP.OBJECT_WRITE_COMMITTED);
  const committed = write.outcome === PUBLIC_SEAM_WRITE_OUTCOME.COMMITTED ||
    write.outcome === PUBLIC_SEAM_WRITE_OUTCOME.COMMITTED_BY_PRIOR_ATTEMPT;
  if (committed) {
    ctx.committedVersion = PUBLIC_SEAM_OBJECT.INITIAL_VERSION;
  }
  return verdictOf(committed,
    'version 1 + history row committed in one transaction via ' + ctx.writer.id,
    {schema, write}, 'initial object transaction did not commit');
}

function expectedState(ctx, version) {
  return {
    history: expectedHistory(ctx.objectId, version),
    objectRowCount: ONE,
    version,
  };
}

function comparableState(state) {
  return state ? {
    history: state.history,
    objectRowCount: state.objectRowCount,
    version: state.version,
  } : null;
}

async function pollNodeState(ctx, node, isDone) {
  const client = clientFor(ctx, node);
  return pollUntil(ctx, ctx.config.readTimeoutMs, async () => {
    const state = await readObjectState(client, ctx.objectId);
    return {done: isDone(state), value: state};
  });
}

async function stepRemoteReadAgreement(ctx) {
  const expected = expectedState(ctx, PUBLIC_SEAM_OBJECT.INITIAL_VERSION);
  const target = JSON.stringify(expected);
  const actual = {};
  for (const node of ctx.nodes) {
    const result = await pollNodeState(ctx, node,
      (state) => JSON.stringify(comparableState(state)) === target);
    actual[node.id] = result.value;
    ctx.initialBodies[node.id] = result.value?.body || null;
  }
  const agreeing = Object.values(actual)
    .every((state) => JSON.stringify(comparableState(state)) === target);
  return verdictOf(agreeing, expected, actual,
    'a node did not converge on the committed object and history');
}

async function stepBlobRoundTrip(ctx) {
  const expected = canonicalBody(
    buildObjectBody(PUBLIC_SEAM_OBJECT.INITIAL_VERSION));
  const mismatched = Object.entries(ctx.initialBodies)
    .filter(([, body]) => JSON.stringify(body) !== JSON.stringify(expected))
    .map(([nodeId]) => nodeId);
  return verdictOf(mismatched.length === ZERO, expected, ctx.initialBodies,
    `BLOB bytes did not round-trip on ${mismatched.join(', ')}; the ` +
    'observed shape is recorded in actual');
}

async function stepParticipantStopped(ctx) {
  const node = ctx.stoppedNode;
  await ctx.cluster.stopNode(node.id);
  await closeClient(ctx, node.id);
  if (typeof node.isReachable !== 'function') {
    return fail(`joiner ${node.id} unreachable after stopNode`, null,
      'the node handle cannot report reachability; stop is unverified');
  }
  const probe = await pollUntil(ctx, ctx.config.readTimeoutMs,
    async () => ({done: (await node.isReachable()) === false}));
  return verdictOf(probe.done, `joiner ${node.id} unreachable after stopNode`,
    {reachable: !probe.done, stoppedNodeId: node.id},
    'the stopped node still answers the harness reachability probe');
}

async function stepWriteDuringOutage(ctx) {
  const write = await writeObjectVersion(ctx,
    clientFor(ctx, ctx.outageWriter), OUTAGE_WRITE_VERSION,
    PUBLIC_SEAM_STEP.WRITE_DURING_OUTAGE);
  ctx.outageWrite = write;
  if (write.outcome === PUBLIC_SEAM_WRITE_OUTCOME.COMMITTED ||
      write.outcome === PUBLIC_SEAM_WRITE_OUTCOME.COMMITTED_BY_PRIOR_ATTEMPT) {
    ctx.committedVersion = OUTAGE_WRITE_VERSION;
  }
  return verdictOf(write.outcome !== PUBLIC_SEAM_WRITE_OUTCOME.TERMINAL,
    'committed, or a typed retry-safe unavailable outcome (documented)',
    write, 'the outage write ended in a terminal outcome');
}

async function stepSurvivorReadDuringOutage(ctx) {
  const minimum = ctx.committedVersion;
  const result = await pollNodeState(ctx, ctx.outageReader, (state) =>
    state.version !== null && state.version >= minimum &&
    exactlyOnceViolations(state, ctx.objectId).length === ZERO);
  return verdictOf(result.done,
    `version >= ${minimum} with exactly-once history on ` +
    ctx.outageReader.id,
    result.value || result.lastError,
    'the surviving reader did not observe the acknowledged state');
}

async function stepParticipantRestarted(ctx) {
  await ctx.cluster.startNode(ctx.stoppedNode.id);
  ctx.restartConvergenceTiming = await waitForClusterConvergence(ctx);
  const opened = await openClientsForNodes(ctx, ctx.nodes);
  return verdictOf(opened.missing.length === ZERO,
    `${ctx.stoppedNode.id} started, cluster converged, public client ` +
    'on every node', opened,
    `no public endpoint after restart for ${opened.missing.join(', ')}`);
}

async function stepWriteAfterRestart(ctx) {
  const client = clientFor(ctx, ctx.stoppedNode);
  const read = await pollNodeState(ctx, ctx.stoppedNode,
    (state) => state.version !== null && state.version >= ctx.committedVersion);
  if (!read.done) {
    return fail(`restarted node reads version >= ${ctx.committedVersion}`,
      read.value || read.lastError,
      'an acknowledged version is not visible on the restarted node');
  }
  const nextVersion = read.value.version + ONE;
  const write = await writeObjectVersion(ctx, client, nextVersion,
    PUBLIC_SEAM_STEP.WRITE_AFTER_RESTART);
  const committed = write.outcome === PUBLIC_SEAM_WRITE_OUTCOME.COMMITTED ||
    write.outcome === PUBLIC_SEAM_WRITE_OUTCOME.COMMITTED_BY_PRIOR_ATTEMPT;
  if (committed) {
    ctx.finalVersion = nextVersion;
  }
  return verdictOf(committed,
    `version ${nextVersion} committed via restarted ${ctx.stoppedNode.id}`,
    {observedVersionBefore: read.value.version, write},
    'the converged cluster did not accept a write via the restarted node');
}

async function stepFinalStateAgreement(ctx) {
  const expected = expectedState(ctx, ctx.finalVersion);
  const actual = {};
  for (const node of ctx.nodes) {
    const result = await pollNodeState(ctx, node,
      (state) => state.version === ctx.finalVersion);
    actual[node.id] = result.value;
  }
  ctx.finalStates = actual;
  const states = Object.values(actual).map((state) => JSON.stringify(state));
  const identical = states.every((state) => state === states[ZERO]);
  const atFinal = Object.values(actual)
    .every((state) => state?.version === ctx.finalVersion);
  return verdictOf(identical && atFinal,
    {...expected, identicalOnEveryNode: true}, actual,
    'nodes disagree on the final object state');
}

async function stepNoDuplicateEffects(ctx) {
  const violations = {};
  for (const [nodeId, state] of Object.entries(ctx.finalStates)) {
    const found = exactlyOnceViolations(state, ctx.objectId);
    if (found.length > ZERO) {
      violations[nodeId] = found;
    }
  }
  return verdictOf(Object.keys(violations).length === ZERO,
    `exactly one history row per version 1..${ctx.finalVersion}, ` +
    'COUNT(*) equal, no phantom rows',
    {violations}, 'duplicate or phantom effects are visible');
}

async function stepTopologyLeakCheck(ctx) {
  const identifiers = await ctx.deps.listTopologyIdentifiers(ctx);
  const leaks = [];
  for (const observation of ctx.observations) {
    const payload = observation.error || observation.rows ||
      observation.parsed;
    for (const path of [...findTopologyLeakKeys(payload),
      ...findTopologyLeakValues(payload, identifiers.values)]) {
      leaks.push(`${observation.nodeId}:${path}`);
    }
  }
  const complete = identifiers.sources.partitionIds ===
    PUBLIC_SEAM_IDENTIFIER_SOURCE.READ;
  return verdictOf(complete && leaks.length === ZERO,
    'no topology-bearing key or known identifier in any public result or ' +
    'error, scanned with the complete identifier set',
    {
      identifierSources: identifiers.sources,
      leakCount: leaks.length,
      observationCount: ctx.observations.length,
      sample: leaks.slice(ZERO, LEAK_SAMPLE_LIMIT),
      withheld: Math.max(ZERO, leaks.length - LEAK_SAMPLE_LIMIT),
    },
    complete ?
      'public results carry topology-bearing keys or identifiers' :
      'partition identifiers unavailable; the value leak scan is ' +
      `incomplete: ${identifiers.sources.partitionIdError}`);
}

const BINDING_STEPS = createBindingSteps(pollUntil);

// Execution order and dependencies. A step whose requirement did not PASS
// is reported NOT_RUN with the blocking step named.
const STEPS = Object.freeze([
  {name: PUBLIC_SEAM_STEP.CLUSTER_CONVERGED, requires: [],
    run: stepClusterConverged},
  {name: PUBLIC_SEAM_STEP.PUBLIC_CLIENT_READY,
    requires: [PUBLIC_SEAM_STEP.CLUSTER_CONVERGED], run: stepPublicClientReady},
  {name: PUBLIC_SEAM_STEP.OBJECT_WRITE_COMMITTED,
    requires: [PUBLIC_SEAM_STEP.PUBLIC_CLIENT_READY],
    run: stepObjectWriteCommitted},
  {name: PUBLIC_SEAM_STEP.REMOTE_READ_AGREEMENT,
    requires: [PUBLIC_SEAM_STEP.OBJECT_WRITE_COMMITTED],
    run: stepRemoteReadAgreement},
  {name: PUBLIC_SEAM_STEP.BLOB_ROUND_TRIP,
    requires: [PUBLIC_SEAM_STEP.REMOTE_READ_AGREEMENT], run: stepBlobRoundTrip},
  BINDING_STEPS.before,
  {name: PUBLIC_SEAM_STEP.PARTICIPANT_STOPPED,
    requires: [PUBLIC_SEAM_STEP.REMOTE_READ_AGREEMENT],
    run: stepParticipantStopped},
  {name: PUBLIC_SEAM_STEP.WRITE_DURING_OUTAGE,
    requires: [PUBLIC_SEAM_STEP.PARTICIPANT_STOPPED],
    run: stepWriteDuringOutage},
  {name: PUBLIC_SEAM_STEP.SURVIVOR_READ_DURING_OUTAGE,
    requires: [PUBLIC_SEAM_STEP.WRITE_DURING_OUTAGE],
    run: stepSurvivorReadDuringOutage},
  {name: PUBLIC_SEAM_STEP.PARTICIPANT_RESTARTED,
    requires: [PUBLIC_SEAM_STEP.PARTICIPANT_STOPPED],
    run: stepParticipantRestarted},
  {name: PUBLIC_SEAM_STEP.WRITE_AFTER_RESTART,
    requires: [PUBLIC_SEAM_STEP.PARTICIPANT_RESTARTED,
      PUBLIC_SEAM_STEP.WRITE_DURING_OUTAGE],
    run: stepWriteAfterRestart},
  {name: PUBLIC_SEAM_STEP.FINAL_STATE_AGREEMENT,
    requires: [PUBLIC_SEAM_STEP.WRITE_AFTER_RESTART],
    run: stepFinalStateAgreement},
  {name: PUBLIC_SEAM_STEP.NO_DUPLICATE_EFFECTS,
    requires: [PUBLIC_SEAM_STEP.FINAL_STATE_AGREEMENT],
    run: stepNoDuplicateEffects},
  BINDING_STEPS.after,
  {name: PUBLIC_SEAM_STEP.TOPOLOGY_LEAK_CHECK, requires: [],
    run: stepTopologyLeakCheck},
]);

function blockingStep(step, results) {
  return step.requires.find((name) =>
    results.get(name)?.outcome !== PUBLIC_SEAM_STEP_OUTCOME.PASS) || null;
}

async function executeStep(ctx, step, results) {
  const startedAt = Date.now();
  const gated = typeof step.gate === 'function' ? step.gate(ctx) : null;
  const blocker = gated ? null : blockingStep(step, results);
  let result;
  if (gated) {
    result = gated;
  } else if (blocker) {
    result = {
      outcome: PUBLIC_SEAM_STEP_OUTCOME.NOT_RUN,
      reason: `${PUBLIC_SEAM_NOT_RUN_REASON.BLOCKED_BY}${blocker}`,
    };
  } else {
    try {
      result = await step.run(ctx);
    } catch (error) {
      result = {
        actual: error.publicOutcome || null,
        outcome: PUBLIC_SEAM_STEP_OUTCOME.FAIL,
        reason: error.message,
      };
    }
  }
  const recorded = {name: step.name, ...result,
    elapsedMs: Date.now() - startedAt};
  results.set(step.name, recorded);
  return recorded;
}

function selectRoles(nodes) {
  const writer = nodes.find((node) => node.role === NODE_ROLES.SEED) ||
    nodes[ZERO];
  const joiners = nodes.filter((node) => node !== writer);
  return {
    outageReader: writer,
    outageWriter: joiners[ZERO] || writer,
    stoppedNode: joiners[joiners.length - ONE] || writer,
    writer,
  };
}

function createContext(cluster) {
  const config = resolvePublicSeamDurabilityScenarioConfig(
    resolveScenarioOptions({}, cluster, PUBLIC_SEAM_SCENARIO_CONFIG_KEY));
  const deps = resolveDependencies(cluster);
  const nodes = cluster.getNodes();
  return {
    ...selectRoles(nodes),
    binding: null,
    clients: new Map(),
    closeFailures: [],
    cluster,
    committedVersion: null,
    config,
    deps,
    finalStates: {},
    finalVersion: null,
    initialBodies: {},
    nodes,
    objectId: `${PUBLIC_SEAM_OBJECT.ID_PREFIX}${deps.runId}`,
    observations: [],
    rollbackFailures: [],
    typedOutcomes: [],
  };
}

function buildReport(ctx, steps) {
  const certification = deriveCertificationStatus(
    ctx.deps.resolveRuntimeProvider);
  const failed = steps.filter((step) =>
    step.outcome === PUBLIC_SEAM_STEP_OUTCOME.FAIL ||
    (step.outcome === PUBLIC_SEAM_STEP_OUTCOME.NOT_RUN &&
      step.reason !== PUBLIC_SEAM_NOT_RUN_REASON.BINDING_DISABLED));
  return {
    certification: certification.status,
    certificationDerivation: certification,
    certificationLine: certification.line,
    clusterShape: {
      nodeCount: ctx.nodes.length,
      outageReaderNodeId: ctx.outageReader?.id || null,
      outageWriterNodeId: ctx.outageWriter?.id || null,
      stoppedNodeId: ctx.stoppedNode?.id || null,
      writerNodeId: ctx.writer?.id || null,
    },
    closeFailures: ctx.closeFailures,
    convergenceTiming: ctx.convergenceTiming || null,
    failedSteps: failed.map((step) => step.name),
    objectId: ctx.objectId,
    restartConvergenceTiming: ctx.restartConvergenceTiming || null,
    retryPolicy: ctx.deps.retryPolicy,
    rollbackFailures: ctx.rollbackFailures,
    scenario: PUBLIC_SEAM_SCENARIO_NAME,
    steps,
    typedOutcomes: ctx.typedOutcomes,
    verdict: failed.length === ZERO ?
      PUBLIC_SEAM_VERDICT.PASS :
      PUBLIC_SEAM_VERDICT.FAIL,
  };
}

/**
 * Run the public-seam durability scenario.
 * @param {Object} cluster - Harness cluster (or a test double).
 * @return {Promise<Object>} The report; throws with
 *   `diagnostics.partialResult` = the report when the verdict is FAIL.
 */
async function run(cluster) {
  const ctx = createContext(cluster);
  const results = new Map();
  const steps = [];
  try {
    for (const step of STEPS) {
      steps.push(await executeStep(ctx, step, results));
    }
  } finally {
    for (const nodeId of [...ctx.clients.keys()]) {
      await closeClient(ctx, nodeId);
    }
  }
  const report = buildReport(ctx, steps);
  if (report.verdict !== PUBLIC_SEAM_VERDICT.PASS) {
    const error = new Error(
      `${PUBLIC_SEAM_SCENARIO_NAME}: FAIL at ${report.failedSteps.join(', ')}` +
      ` (${report.certificationLine})`);
    error.diagnostics = {partialResult: report};
    throw error;
  }
  return report;
}

export {run};
