/**
 * Observation, readiness polling, system-table sampling, and identity/version
 * probes for the Lagrange comparative deployer (`real-product-deployer-
 * lagrange.js`). Keeping these probes in their own module keeps each file
 * compact and ensures every HTTP/SQL/docker-inspect call carries bounded
 * per-call timeouts, column projections, and structured error metadata.
 */
import {
  arrayEvery,
  arrayFilter,
  arrayFind,
  arrayFlatMap,
  arrayIsArray,
  arrayMap,
  dateNow,
  jsonParse,
  numberIsFinite,
  numberIsInteger,
  objectHasOwn,
  stringIndexOf,
  stringSlice,
  stringStartsWith,
  toStringValue as stringOf,
} from './real-product-captured-intrinsics.js';
import {
  DEFAULT_INSPECT_TIMEOUT_MS,
  DEPLOYMENT_FAILURE,
  attachRemoteCommandAttribution,
  deploymentFailure,
  isDeploymentFailure,
  withExplicitSignalOption,
} from './real-product-deployment-contract.js';
import {
  evaluateLagrangeClusterReadiness,
  evaluateLagrangeServeLane,
  summarizePartitionSpread,
} from './real-product-lagrange-readiness-evaluation.js';
import {pollReadiness} from './real-product-readiness.js';
import {
  classifyRemoteCommandError,
  errorText,
  httpFromHost,
  inspectContainerStateCommand,
  settleConcurrentBatch,
  shellWord,
} from './real-product-remote-shell.js';

const PORT = Object.freeze({REST: 8080, ADMIN: 8081, TRANSPORT: 8082});
const NODE_ROLE = 'lagrange-node';
const PG_WIRE_SERVICE_ID = 'sys-postgres-wire';
const HTTP_OK = 200;
const HEALTHY = 'healthy';
const PG_WIRE_DESIRED_STATE = Object.freeze({
  replicaCount: 1,
  runtimeConfig: Object.freeze({host: '0.0.0.0', authMode: 'password', tlsMode: 'disable'}),
});
const SYSTEM_TABLE_QUERIES = Object.freeze({
  nodes: 'SELECT node_id, status, connection_state, ready_lease_expires_at, ' +
    'last_heartbeat FROM nodes',
  endpoints: 'SELECT service_id, node_id, protocol, port, health_status ' +
    'FROM service_endpoints',
  partitions: 'SELECT partition_id, table_name, replica_count, ' +
    'leader_node_id FROM partitions',
  services: 'SELECT partition_id, node_id, status, raft_role FROM services ' +
    'WHERE service_type = \'partition\'',
});
const PROBE_TABLE = 'bench_readiness_probe';
const PROBE_VISIBILITY_SINGLE_LISTENER = 'single-listener';
const BOOT_PROVENANCE_MARKER = 'bootedSrcFingerprint';
const NO_SUCH_CONTAINER_PATTERN = /\bNo such (?:container|object)\b/u;
const INSPECT_TIMEOUT_MS = DEFAULT_INSPECT_TIMEOUT_MS;
const DEFAULT_HTTP_PROBE_TIMEOUT_MS = DEFAULT_INSPECT_TIMEOUT_MS;
const CONTROL_SNAPSHOT_SERVE_LANE_TIMEOUT_MS = 5000;
const PROBE_CREATE_TABLE_TIMEOUT_MS = 30000;
const BOOT_PROVENANCE_TIMEOUT_MS = DEFAULT_INSPECT_TIMEOUT_MS;
const BOOT_PROVENANCE_MAX_BYTES = 4096;
const EXITED_CONTAINER_LOG_TAIL_LINES = 80;

function tagProbeError(message, flags) {
  return Object.assign(new Error(message), flags);
}

function resolveProbeSignal(ctx, pollContext) {
  if (pollContext?.signal !== undefined) return pollContext.signal;
  if (ctx?.signal !== undefined) return ctx.signal;
  return undefined;
}

function resolveProbeDeadlineAtMs(ctx, pollContext) {
  return pollContext?.deadlineAtMs !== undefined ?
    pollContext.deadlineAtMs : (ctx?.deadlineAtMs ?? null);
}

function probeCallOptions(ctx, pollContext = null, maxTimeoutMs = DEFAULT_HTTP_PROBE_TIMEOUT_MS) {
  const signal = resolveProbeSignal(ctx, pollContext);
  if (signal?.aborted) {
    throw tagProbeError('readiness probe aborted', {
      aborted: true,
      deadlineExpired: false,
      transportError: false,
      observerInfrastructure: false,
    });
  }
  const deadlineAtMs = resolveProbeDeadlineAtMs(ctx, pollContext);
  if (!numberIsFinite(deadlineAtMs)) {
    return {signal, timeoutMs: numberIsFinite(maxTimeoutMs) ? maxTimeoutMs : undefined};
  }
  const clock = typeof ctx?.now === 'function' ? ctx.now : dateNow;
  const remainingMs = deadlineAtMs - clock();
  if (remainingMs <= 0) {
    throw tagProbeError('readiness probe deadline expired', {
      aborted: false,
      deadlineExpired: true,
      transportError: false,
      observerInfrastructure: false,
    });
  }
  const timeoutMs = numberIsFinite(maxTimeoutMs) ?
    boundedTimeoutMs(remainingMs, maxTimeoutMs) :
    Math.max(1, Math.floor(remainingMs));
  return {signal, timeoutMs};
}

function boundedTimeoutMs(requestedMs, defaultMs) {
  if (!numberIsFinite(requestedMs)) return defaultMs;
  return Math.max(1, Math.min(defaultMs, Math.floor(requestedMs)));
}

async function getJson(ctx, url, pollContext = null) {
  const callOptions = pollContext ? probeCallOptions(ctx, pollContext) :
    probeCallOptions(ctx, null);
  return httpFromHost({
    sshRun: ctx.sshRun,
    opts: ctx.opts,
    from: ctx.clientIp,
    url,
    signal: callOptions.signal,
    timeoutMs: callOptions.timeoutMs,
  });
}

function getFacts(ctx, host, pollContext = null) {
  const callOptions = pollContext ? probeCallOptions(ctx, pollContext) :
    probeCallOptions(ctx, null);
  return httpFromHost({
    sshRun: ctx.sshRun,
    opts: ctx.opts,
    from: ctx.clientIp,
    url: `http://${host}:${PORT.REST}/management/v1/facts`,
    basicAuth: ctx.connection,
    signal: callOptions.signal,
    timeoutMs: callOptions.timeoutMs,
  });
}

function stateFieldOrNull(record, key) {
  if (!record || typeof record !== 'object' || !objectHasOwn(record, key)) {
    return null;
  }
  return record[key];
}

function exitedContainerObservation(role, state, logTail = null) {
  const inspectState = state && typeof state === 'object' ? state : {};
  return {
    containerExited: true,
    host: role.host,
    role: role.role,
    nodeId: stateFieldOrNull(role, 'nodeId'),
    containerId: role.containerId,
    status: stateFieldOrNull(inspectState, 'Status'),
    running: inspectState.Running === true,
    exitCode: stateFieldOrNull(inspectState, 'ExitCode'),
    oomKilled: stateFieldOrNull(inspectState, 'OOMKilled'),
    finishedAt: stateFieldOrNull(inspectState, 'FinishedAt'),
    error: inspectState.Error || null,
    logTail,
  };
}

function buildExitedContainerFailure({component, role, state, pollContext, logTail = null}) {
  const observation = exitedContainerObservation(role, state, logTail);
  const attempt = pollContext?.attempt ?? 1;
  const diagnostic = {
    component,
    attempt,
    attempts: attempt,
    containerExited: true,
    exitedRole: observation,
    last: observation,
    lastObservation: observation,
    lastCompletedObservation: observation,
  };
  const failure = deploymentFailure(
    DEPLOYMENT_FAILURE.READINESS_EXHAUSTED,
    `${component} aborted: ${role.role} on ${role.host} (${role.containerId}) ` +
      `exited (status=${observation.status}, exitCode=${observation.exitCode})`,
    diagnostic,
  );
  failure.terminal = true;
  failure.containerExited = true;
  failure.attempt = attempt;
  failure.attempts = attempt;
  failure.lastObservation = observation;
  failure.lastCompletedObservation = observation;
  return failure;
}

function parseInspectState(raw) {
  let parsed;
  try {
    parsed = jsonParse(stringOf(raw ?? ''));
  } catch (error) {
    throw tagProbeError(`docker inspect answered invalid JSON: ${error.message}`, {
      parseError: true,
      observerInfrastructure: true,
    });
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.Running !== 'boolean') {
    throw new Error('docker inspect answered without container State');
  }
  return parsed;
}

async function captureExitedContainerLogTail(ctx, role, inspectOpts, timeoutMs) {
  try {
    const rawLogs = await ctx.sshRun(
      role.host,
      inspectOpts,
      `docker logs --tail ${EXITED_CONTAINER_LOG_TAIL_LINES} ${shellWord(role.containerId)} 2>&1`,
      timeoutMs,
    );
    const text = stringOf(rawLogs ?? '');
    return text === '' ? null : text;
  } catch {
    return null;
  }
}

async function inspectWatchedRole(ctx, component, role, pollContext, callOptions) {
  const timeoutMs = boundedTimeoutMs(callOptions.timeoutMs, INSPECT_TIMEOUT_MS);
  const inspectOpts = {
    ...withExplicitSignalOption(ctx.opts, callOptions.signal),
    timeoutMs,
  };
  let raw;
  try {
    raw = await ctx.sshRun(
      role.host,
      inspectOpts,
      inspectContainerStateCommand(role.containerId),
      timeoutMs,
    );
  } catch (error) {
    const text = errorText(error);
    const classified = classifyRemoteCommandError(error);
    const absent = !classified.aborted && !classified.deadlineExpired && !classified.timedOut &&
      !classified.observerInfrastructure &&
      (classified.exitCode === null || classified.exitCode === 1) &&
      NO_SUCH_CONTAINER_PATTERN.test(text);
    if (absent) {
      throw buildExitedContainerFailure({
        component, role,
        state: {Running: false, Status: 'absent', ExitCode: null, Error: text},
        pollContext,
      });
    }
    throw attachRemoteCommandAttribution(new Error(classified.message), classified, error);
  }
  const state = parseInspectState(raw);
  if (state.Running !== true) {
    const logTail = await captureExitedContainerLogTail(ctx, role, inspectOpts, timeoutMs);
    throw buildExitedContainerFailure({component, role, state, pollContext, logTail});
  }
}

async function assertWatchedRolesRunning(ctx, component, pollContext) {
  if (!arrayIsArray(ctx.watchedRoles) || ctx.watchedRoles.length === 0) return;
  const callOptions = pollContext ? probeCallOptions(ctx, pollContext) :
    probeCallOptions(ctx, null);
  await settleConcurrentBatch(
    ctx.watchedRoles,
    (role) => inspectWatchedRole(ctx, component, role, pollContext, callOptions),
    ctx.settleInFlight ?? null,
  );
}

function markDeadlineCappedProbeTimeout(ctx, pollContext, error) {
  const deadlineAtMs = resolveProbeDeadlineAtMs(ctx, pollContext);
  const clock = typeof ctx?.now === 'function' ? ctx.now : dateNow;
  if (error && typeof error === 'object' && error.timedOut === true &&
      numberIsFinite(deadlineAtMs) && clock() >= deadlineAtMs) {
    error.deadlineExpired = true;
    error.observerInfrastructure = false;
  }
}

const STAGE_COMPONENT = Object.freeze({
  MEMBERSHIP: 'lagrange-membership',
  PUBLIC_PG_WIRE: 'lagrange-public-pg-wire',
  PARTITION_LEADERS: 'lagrange-partition-leaders',
  SYSTEM_TABLES: 'lagrange-system-tables',
  CANONICAL_ROUTABLE: 'lagrange-canonical-tables-routable',
  PROBE_WRITE_READBACK: 'lagrange-probe-write-readback',
});

function resolveInitialStageNodes(seed, ctx) {
  if (arrayIsArray(seed.nodes)) return [...seed.nodes];
  if (arrayIsArray(ctx.nodes)) return [...ctx.nodes];
  return [];
}

function resolveInitialSystemTables(seed, ctx) {
  return seed.systemTables ?? seed.cluster ?? ctx.systemTables ?? ctx.cluster ?? null;
}

function createInitialCompletedStageStore(ctx) {
  const seed = ctx.completedStages && typeof ctx.completedStages === 'object' ?
    ctx.completedStages : {};
  return {
    nodes: resolveInitialStageNodes(seed, ctx),
    membership: seed.membership ?? ctx.membership ?? null,
    publicPgWire: seed.publicPgWire ?? ctx.publicPgWire ?? null,
    leaders: seed.leaders ?? ctx.leaders ?? null,
    systemTables: resolveInitialSystemTables(seed, ctx),
    canonicalTablesRoutable: seed.canonicalTablesRoutable ?? null,
    probe: seed.probe ?? null,
  };
}

function ensureCompletedStageStore(ctx) {
  if (!ctx || typeof ctx !== 'object') return null;
  if (!ctx.completedReadinessStages) {
    ctx.completedReadinessStages = createInitialCompletedStageStore(ctx);
  }
  return ctx.completedReadinessStages;
}

function buildCompletedStageSnapshot(store) {
  if (!store) return null;
  const hasAny = store.nodes.length > 0 || Boolean(
    store.membership || store.publicPgWire || store.leaders ||
    store.systemTables || store.canonicalTablesRoutable,
  );
  if (!hasAny) return null;
  return {
    nodes: [...store.nodes],
    membership: store.membership,
    ...(store.publicPgWire ? {publicPgWire: store.publicPgWire} : {}),
    ...(store.leaders ? {leaders: store.leaders} : {}),
    systemTables: store.systemTables,
    ...(store.systemTables ? {cluster: store.systemTables} : {}),
    ...(store.canonicalTablesRoutable ?
      {canonicalTablesRoutable: store.canonicalTablesRoutable} : {}),
  };
}

function recordCompletedReadinessStage(ctx, component, ready) {
  const store = ensureCompletedStageStore(ctx);
  if (!store) return ready;
  if (stringStartsWith(String(component || ''), `${NODE_ROLE}@`)) {
    store.nodes.push(ready);
  } else if (component === STAGE_COMPONENT.MEMBERSHIP) {
    store.membership = ready;
  } else if (component === STAGE_COMPONENT.PUBLIC_PG_WIRE) {
    store.publicPgWire = ready;
  } else if (component === STAGE_COMPONENT.PARTITION_LEADERS) {
    store.leaders = ready;
  } else if (component === STAGE_COMPONENT.SYSTEM_TABLES) {
    store.systemTables = ready;
  } else if (component === STAGE_COMPONENT.CANONICAL_ROUTABLE) {
    store.canonicalTablesRoutable = ready;
  } else if (component === STAGE_COMPONENT.PROBE_WRITE_READBACK) {
    store.probe = ready;
  }
  ctx.completedStages = buildCompletedStageSnapshot(store);
  return ready;
}

function applyCompletedStagesToTarget(target, snapshot) {
  if (!target || typeof target !== 'object') return;
  target.completedStages = snapshot;
  if (snapshot.nodes.length > 0) target.nodes = snapshot.nodes;
  if (snapshot.membership) target.membership = snapshot.membership;
  if (snapshot.publicPgWire) target.publicPgWire = snapshot.publicPgWire;
  if (snapshot.leaders) target.leaders = snapshot.leaders;
  if (snapshot.systemTables) {
    target.systemTables = snapshot.systemTables;
    target.cluster = snapshot.systemTables;
  }
}

function attachCompletedReadinessStagesToError(ctx, error) {
  const snapshot = buildCompletedStageSnapshot(ensureCompletedStageStore(ctx));
  if (!snapshot || !error || typeof error !== 'object') return error;
  applyCompletedStagesToTarget(error, snapshot);
  applyCompletedStagesToTarget(error.diagnostic, snapshot);
  return error;
}

async function readinessOf(ctx, component, probe, stablePolls = 1) {
  ensureCompletedStageStore(ctx);
  try {
    const ready = await pollReadiness({
      component,
      probe: async (pollContext) => {
        try {
          await assertWatchedRolesRunning(ctx, component, pollContext);
          return await probe(pollContext);
        } catch (error) {
          markDeadlineCappedProbeTimeout(ctx, pollContext, error);
          throw error;
        } finally {
          if (ctx.settleInFlight) await ctx.settleInFlight();
        }
      },
      attempts: ctx.budget.attempts,
      intervalMs: ctx.budget.intervalMs,
      sleep: ctx.sleep,
      now: ctx.now,
      stablePolls,
      deadlineAtMs: ctx.deadlineAtMs ?? null,
      deadlineMs: ctx.deadlineMs ?? null,
      signal: ctx.signal ?? null,
    });
    return recordCompletedReadinessStage(ctx, component, ready);
  } catch (error) {
    throw attachCompletedReadinessStagesToError(ctx, error);
  }
}

function compactReadyzDiagnostic(answer) {
  if (answer.error !== null || answer.parseError !== null || answer.status === null ||
      !answer.json || typeof answer.json !== 'object') {
    return answer;
  }
  const reasons = arrayIsArray(answer.json.reasons) ? answer.json.reasons : [];
  return {
    status: answer.status,
    json: {
      ready: answer.json.ready === true,
      phase: stateFieldOrNull(answer.json, 'phase'),
      state: stateFieldOrNull(answer.json, 'state'),
      reasons,
    },
    error: null,
  };
}

function nodeReady(ctx, host) {
  return readinessOf(ctx, `${NODE_ROLE}@${host}`, async (pollContext) => {
    const answer = await getJson(ctx, `http://${host}:${PORT.REST}/readyz`, pollContext);
    return {
      ready: answer.status === HTTP_OK && answer.json?.ready === true,
      diagnostic: compactReadyzDiagnostic(answer),
    };
  });
}

const FORMATION_STATE_FORMED = 'FORMED';

function isFormationFactReady(facts) {
  const formation = facts?.cluster?.formation;
  return !formation || formation.state === FORMATION_STATE_FORMED;
}

function membershipReady(ctx, seedHost, nodeCount) {
  return readinessOf(ctx, 'lagrange-membership', async (pollContext) => {
    const answer = await getFacts(ctx, seedHost, pollContext);
    const facts = answer.json?.facts;
    return {
      ready:
        facts?.topology?.readyNodeCount === nodeCount &&
        isFormationFactReady(facts),
      diagnostic: answer,
    };
  });
}

function healthyListener(services, roles) {
  const replicas = arrayFlatMap(arrayIsArray(services) ? services : [],
    (service) => (arrayIsArray(service?.replicas) ? service.replicas : []));
  const replica = arrayFind(replicas, (one) => one?.serviceId === PG_WIRE_SERVICE_ID &&
    one?.healthStatus === HEALTHY && numberIsInteger(Number(one?.port)) && one?.port > 0);
  const node = replica && arrayFind(roles, (role) => role.nodeId === replica.nodeId);
  return node ? {host: node.host, port: Number(replica.port), nodeId: replica.nodeId} : null;
}

function isUnusableProbeHttpAnswer(answer) {
  return Boolean(
    answer.aborted || answer.deadlineExpired || answer.observerInfrastructure ||
      answer.parseError !== null || answer.status === null,
  );
}

function isAppliedScaleAnswer(scale) {
  return scale.json?.success === true && scale.json?.outcome === 'applied';
}

async function publicPgWireReady(ctx, seedHost, roles) {
  const admin = `http://${seedHost}:${PORT.ADMIN}`;
  let listener = null;
  await readinessOf(ctx, 'lagrange-public-pg-wire', async (pollContext) => {
    const scaleCall = probeCallOptions(ctx, pollContext);
    const scale = await httpFromHost({
      sshRun: ctx.sshRun,
      opts: ctx.opts,
      from: ctx.clientIp,
      url: `${admin}/api/admin/services/${PG_WIRE_SERVICE_ID}/scale`,
      method: 'POST',
      body: PG_WIRE_DESIRED_STATE,
      signal: scaleCall.signal,
      timeoutMs: scaleCall.timeoutMs,
    });
    if (isUnusableProbeHttpAnswer(scale)) {
      return {ready: false, diagnostic: scale};
    }
    if (!isAppliedScaleAnswer(scale)) {
      return {ready: false, diagnostic: {scale}};
    }
    const found = await getJson(ctx,
      `${admin}/api/admin/discovery/services?serviceId=${PG_WIRE_SERVICE_ID}`, pollContext);
    if (isUnusableProbeHttpAnswer(found)) {
      return {ready: false, diagnostic: found};
    }
    listener = healthyListener(found.json?.services, roles);
    return {ready: listener !== null, diagnostic: {discovery: found}};
  });
  return listener;
}

// A field of the product's partition diagnostics: the product answers it (its
// value may be null, e.g. a partition without a leader); a missing field is
// an unreadable answer, never a default.
function partitionField(record, key) {
  if (!record || typeof record !== 'object' || !objectHasOwn(record, key)) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `partition diagnostics answered without ${key}`, {record});
  }
  return record[key];
}

function deploymentHostOf(roles, nodeId) {
  const role = arrayFind(roles, (one) => one.nodeId === nodeId);
  return role === undefined ? null : role.host;
}

function mergeAnswerFlag(answer, classified, key) {
  return Boolean(answer?.[key] === true || classified[key]);
}

function partitionDiagnosticsFailure(message, answer) {
  const classified = classifyRemoteCommandError(answer);
  const flags = {
    aborted: mergeAnswerFlag(answer, classified, 'aborted'),
    deadlineExpired: mergeAnswerFlag(answer, classified, 'deadlineExpired'),
    timedOut: mergeAnswerFlag(answer, classified, 'timedOut'),
    httpTimedOut: mergeAnswerFlag(answer, classified, 'httpTimedOut'),
    transportError: mergeAnswerFlag(answer, classified, 'transportError'),
    observerInfrastructure: mergeAnswerFlag(answer, classified, 'observerInfrastructure'),
  };
  const code = flags.aborted || flags.deadlineExpired ?
    DEPLOYMENT_FAILURE.READINESS_EXHAUSTED : DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED;
  const failure = deploymentFailure(code, message, {answer, ...flags});
  return Object.assign(failure, flags);
}

function isOkDiagnosticsAnswer(answer) {
  return Boolean(
    answer && answer.status === HTTP_OK && !answer.aborted &&
      !answer.deadlineExpired && answer.parseError === null,
  );
}

function assertDiagnosticsWindowOpen(ctx, answer) {
  if (ctx?.signal?.aborted) {
    throw partitionDiagnosticsFailure('readiness probe aborted', {
      ...(answer || {}),
      aborted: true,
    });
  }
  if (numberIsFinite(ctx?.deadlineAtMs)) {
    const clock = typeof ctx?.now === 'function' ? ctx.now : dateNow;
    if (clock() >= ctx.deadlineAtMs) {
      throw partitionDiagnosticsFailure('readiness probe deadline expired', {
        ...(answer || {}),
        deadlineExpired: true,
      });
    }
  }
}

function placementOf(answer, roles, observedAt) {
  if (!isOkDiagnosticsAnswer(answer)) {
    throw partitionDiagnosticsFailure('partition diagnostics did not answer', answer);
  }
  const partitions = Object.values(partitionField(answer.json, 'partitionsById'));
  return {
    observedAt,
    source: '/api/admin/diagnostics/partitions',
    replicasByPartition: arrayMap(partitions, (partition) => ({
      partitionId: partitionField(partition, 'partitionId'),
      tableName: partitionField(partition, 'tableName'),
      leaderNodeId: partitionField(partition, 'leaderNodeId'),
      leaderHost: deploymentHostOf(roles, partitionField(partition, 'leaderNodeId')),
      replicas: arrayMap(partitionField(partition, 'replicas'), (replica) => ({
        nodeId: partitionField(replica, 'nodeId'),
        host: deploymentHostOf(roles, partitionField(replica, 'nodeId')),
        status: partitionField(replica, 'status'),
      })),
    })),
  };
}

async function readPartitions(ctx, seedHost, pollContext = null) {
  let answer;
  try {
    answer = await getJson(
      ctx,
      `http://${seedHost}:${PORT.ADMIN}/api/admin/diagnostics/partitions?view=placement`,
      pollContext,
    );
  } catch (error) {
    if (isDeploymentFailure(error)) throw error;
    throw partitionDiagnosticsFailure(errorText(error), error);
  }
  assertDiagnosticsWindowOpen(ctx, answer);
  if (!isOkDiagnosticsAnswer(answer)) {
    throw partitionDiagnosticsFailure('partition diagnostics did not answer', answer);
  }
  return answer;
}

function readPartitionLeaders(ctx, seedHost, pollContext = null) {
  return getJson(
    ctx,
    `http://${seedHost}:${PORT.ADMIN}/api/admin/diagnostics/partitions?view=leaders`,
    pollContext,
  );
}

async function observedLeaders(ctx, seedHost) {
  let answer;
  try {
    answer = await readPartitionLeaders(ctx, seedHost);
  } catch (error) {
    if (isDeploymentFailure(error)) throw error;
    throw partitionDiagnosticsFailure(errorText(error), error);
  }
  assertDiagnosticsWindowOpen(ctx, answer);
  if (!isOkDiagnosticsAnswer(answer)) {
    throw partitionDiagnosticsFailure('partition diagnostics did not answer', answer);
  }
  return partitionField(answer.json, 'leaders');
}

function leadersReady(ctx, seedHost) {
  return readinessOf(ctx, 'lagrange-partition-leaders', async (pollContext) => {
    const answer = await readPartitionLeaders(ctx, seedHost, pollContext);
    if (answer.status !== HTTP_OK || !answer.json) {
      return {ready: false, diagnostic: answer};
    }
    const leaders = partitionField(answer.json, 'leaders');
    const leaderEntries = leaders && typeof leaders === 'object' ? Object.values(leaders) : [];
    const partitionCount = partitionField(answer.json, 'partitionCount');
    return {
      ready: numberIsInteger(partitionCount) && partitionCount > 0 &&
        leaderEntries.length === partitionCount && arrayEvery(leaderEntries, Boolean),
      diagnostic: {partitionCount, leaders},
    };
  });
}

async function readSystemTables(query, ctx = null, pollContext = null) {
  const callOptions = pollContext ? probeCallOptions(ctx, pollContext, null) :
    (ctx ? probeCallOptions(ctx, null, null) : {});
  const entries = await settleConcurrentBatch(
    Object.entries(SYSTEM_TABLE_QUERIES),
    async ([name, sql]) => [name, await query(sql, callOptions)],
    ctx?.settleInFlight ?? null,
  );
  return Object.fromEntries(entries);
}

function isFailedControlSnapshotAnswer(answer) {
  return Boolean(
    answer.aborted || answer.deadlineExpired || answer.observerInfrastructure ||
      answer.parseError !== null || answer.status === null,
  );
}

function toControlSnapshotEntry(role, answer) {
  if (isFailedControlSnapshotAnswer(answer)) {
    throw tagProbeError(
      `control-snapshot probe for ${role.nodeId} failed: ${answer.error || answer.parseError}`,
      {
        aborted: answer.aborted === true,
        deadlineExpired: answer.deadlineExpired === true,
        transportError: answer.transportError === true,
        observerInfrastructure: answer.observerInfrastructure === true,
        parseError: answer.parseError,
      },
    );
  }
  return {
    nodeId: role.nodeId,
    snapshot: answer.status === HTTP_OK && answer.json ? answer.json : null,
  };
}

async function controlSnapshots(ctx, roles, pollContext = null) {
  const callOptions = probeCallOptions(ctx, pollContext);
  const snapshotTimeoutMs = boundedTimeoutMs(
    callOptions.timeoutMs, CONTROL_SNAPSHOT_SERVE_LANE_TIMEOUT_MS);
  const queryUrlForRole = (role) =>
    `http://${role.host}:${PORT.ADMIN}/api/admin/control-snapshot` +
    `?scope=local&view=serve-lane&timeoutMs=${snapshotTimeoutMs}`;
  const answers = await settleConcurrentBatch(roles, async (role) => ({
    role,
    answer: await httpFromHost({
      sshRun: ctx.sshRun,
      opts: ctx.opts,
      from: ctx.clientIp,
      url: queryUrlForRole(role),
      signal: callOptions.signal,
      timeoutMs: callOptions.timeoutMs,
    }),
  }), ctx.settleInFlight ?? null);
  return arrayMap(answers, ({role, answer}) => toControlSnapshotEntry(role, answer));
}

function isFatalTableRoutingError(error) {
  return Boolean(
    error?.aborted === true || error?.deadlineExpired === true ||
      error?.observerInfrastructure === true || error?.parseError === true,
  );
}

function tableRoutingCallOptions(ctx, pollContext) {
  if (pollContext) return probeCallOptions(ctx, pollContext, null);
  return ctx ? probeCallOptions(ctx, null, null) : {};
}

async function tableRoutingDenials(query, requiredTables, ctx = null, pollContext = null) {
  const denials = [];
  if (requiredTables === null) return denials;
  const callOptions = tableRoutingCallOptions(ctx, pollContext);
  for (const table of requiredTables) {
    try {
      await query(`SELECT COUNT(*) AS row_count FROM ${table}`, callOptions);
    } catch (error) {
      if (isFatalTableRoutingError(error)) {
        throw error;
      }
      denials.push(`table_not_routable:${table}:${errorText(error)}`);
    }
  }
  return denials;
}

function recordTableRoutability(tableReadyAt, tables, context) {
  if (context.requiredTables === null) return;
  for (const table of context.requiredTables) {
    if (tableReadyAt[table] !== undefined) continue;
    const own = evaluateLagrangeClusterReadiness({
      ...tables,
      expectedNodeIds: context.expectedNodeIds,
      requiredServiceIds: [],
      requiredTables: [table],
      now: context.now,
    });
    if (own.ready) tableReadyAt[table] = context.now - context.startedAt;
  }
}

async function clusterReady(ctx, component, query, nodeRoles, requiredTables = null) {
  const expectedNodeIds = arrayMap(nodeRoles, (role) => role.nodeId);
  const clock = typeof ctx.now === 'function' ? ctx.now : dateNow;
  const startedAt = clock();
  const tableReadyAt = {};
  const readiness = await readinessOf(ctx, component, async (pollContext) => {
    const tables = await readSystemTables(query, ctx, pollContext);
    const now = clock();
    recordTableRoutability(tableReadyAt, tables, {
      requiredTables,
      expectedNodeIds,
      now,
      startedAt,
    });
    const verdict = evaluateLagrangeClusterReadiness({
      ...tables,
      expectedNodeIds,
      requiredServiceIds: [PG_WIRE_SERVICE_ID],
      requiredTables,
      now,
    });
    const lane = evaluateLagrangeServeLane({
      snapshots: await controlSnapshots(ctx, nodeRoles, pollContext),
    });
    const routing = verdict.ready && lane.ready ?
      await tableRoutingDenials(query, requiredTables, ctx, pollContext) : [];
    const denials = [...verdict.denials, ...lane.denials, ...routing];
    const partitionIds = arrayMap(
      tables.partitions,
      (row) => row.partition_id,
    );
    const tableNames = [...new Set(arrayFilter(
      arrayMap(tables.partitions, (row) => row.table_name),
      Boolean,
    ))];
    return {
      ready: denials.length === 0,
      diagnostic: {
        denials,
        nodes: tables.nodes.length,
        tables: tableNames.length,
        partitions: tables.partitions.length,
        partitionIds,
        tableNames,
        spreadSummary: summarizePartitionSpread({
          partitions: tables.partitions,
          services: tables.services,
          expectedNodeIds,
        }),
        tableTimeToRoutableMs: {...tableReadyAt},
      },
    };
  }, ctx.budget.stablePolls);
  const enriched = requiredTables ?
    {...readiness, tableTimeToRoutableMs: {...tableReadyAt}} :
    readiness;
  return recordCompletedReadinessStage(ctx, component, enriched);
}

function probeVisibility(listenerNodeId, nodeRoles) {
  return {
    status: PROBE_VISIBILITY_SINGLE_LISTENER,
    readFrom: [listenerNodeId],
    notReadFrom: arrayFilter(arrayMap(nodeRoles, (role) => role.nodeId),
      (nodeId) => nodeId !== listenerNodeId),
  };
}

function probeWriteReadback(ctx, sql, campaignId, visibility) {
  const clock = typeof ctx.now === 'function' ? ctx.now : dateNow;
  return readinessOf(ctx, 'lagrange-probe-write-readback', async (pollContext) => {
    const id = clock();
    const token = `${campaignId}-${id}`;
    await sql.statement(
      `CREATE TABLE IF NOT EXISTS ${PROBE_TABLE} (id BIGINT PRIMARY KEY, token TEXT)`,
      {
        ...probeCallOptions(ctx, pollContext, PROBE_CREATE_TABLE_TIMEOUT_MS),
        maxProbeTimeoutMs: PROBE_CREATE_TABLE_TIMEOUT_MS,
      },
    );
    const insert = await sql.statement(
      `INSERT INTO ${PROBE_TABLE} (id, token) VALUES (${id}, '${token}')`,
      probeCallOptions(ctx, pollContext, null),
    );
    const rows = await sql.query(
      `SELECT token FROM ${PROBE_TABLE} WHERE id = ${id}`,
      probeCallOptions(ctx, pollContext, null),
    );
    return {
      ready: insert.rowCount === 1 && rows.length === 1 && rows[0].token === token,
      diagnostic: {
        written: token,
        insertTag: insert.tag,
        insertRowCount: insert.rowCount,
        readBack: rows,
        visibility,
      },
    };
  });
}

function bootLogField(parsed, key) {
  if (!objectHasOwn(parsed, key)) throw new Error(`boot provenance line without ${key}`);
  return parsed[key];
}

function parseBootProvenanceLine(line, facts) {
  const parsed = jsonParse(stringSlice(line, stringIndexOf(line, '{')));
  const release = facts?.status === HTTP_OK ? facts.json?.facts?.release : null;
  const gitCommit = parsed.gitCommit ?? release?.gitCommit ?? null;
  return {
    version: bootLogField(parsed, 'version'),
    bootedSrcFingerprint: bootLogField(parsed, 'bootedSrcFingerprint'),
    subsystem: bootLogField(parsed, 'subsystem'),
    ...(typeof gitCommit === 'string' && gitCommit !== '' ? {gitCommit} : {}),
  };
}

function isAbortOrDeadlineError(error) {
  if (error?.aborted === true || error?.deadlineExpired === true) return true;
  const classified = classifyRemoteCommandError(error);
  return classified.aborted || classified.deadlineExpired;
}

async function bootProvenance(ctx, product, facts = null) {
  try {
    const callOpts = probeCallOptions(ctx, null, BOOT_PROVENANCE_TIMEOUT_MS);
    const cmd = `docker logs ${shellWord(product.containerId)} 2>&1 | ` +
      `grep -m 1 ${BOOT_PROVENANCE_MARKER} | head -c ${BOOT_PROVENANCE_MAX_BYTES}`;
    const line = stringOf(await ctx.sshRun(
      product.host,
      {
        ...withExplicitSignalOption(ctx.opts, callOpts.signal),
        timeoutMs: callOpts.timeoutMs,
      },
      cmd,
      callOpts.timeoutMs,
    ));
    return parseBootProvenanceLine(line, facts);
  } catch (error) {
    if (isAbortOrDeadlineError(error)) throw error;
    return {unavailable: errorText(error)};
  }
}

function reportedVersionOf(facts) {
  const version = facts.status === HTTP_OK ? facts.json?.facts?.release?.version : undefined;
  if (typeof version === 'string' && version !== '') {
    return {reportedVersion: version, reportedVersionError: null};
  }
  return {
    reportedVersion: null,
    reportedVersionError: `facts answered ${JSON.stringify({
      status: facts.status,
      error: facts.error,
      version: version === undefined ? 'absent' : version,
    })}`,
  };
}

async function reportedVersions(ctx, products) {
  await settleConcurrentBatch(products, async (product) => {
    const facts = await getFacts(ctx, product.host);
    Object.assign(product, reportedVersionOf(facts));
    product.bootProvenance = await bootProvenance(ctx, product, facts);
  }, ctx.settleInFlight ?? null);
  return products;
}

export {
  clusterReady,
  leadersReady,
  membershipReady,
  nodeReady,
  observedLeaders,
  placementOf,
  probeVisibility,
  probeWriteReadback,
  publicPgWireReady,
  readPartitions,
  readSystemTables,
  reportedVersions,
};
