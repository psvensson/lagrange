import {COLUMN, TABLES} from '../constants/index.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  createTimeoutBudget,
  createTimeoutBudgetError,
  getRemainingBudgetMs,
} from '../control-plane/timeout-budget.js';
import {
  isReplicaOperationInFlight,
  normalizeReplicaOperationRecord,
} from '../rebalancer/replica-operation-liveness.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_CONTROL_SNAPSHOT_LITERAL,
  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
  ADMIN_ERROR_MESSAGE,
} from './admin-constants.js';
import {firstStringField} from './admin-helpers.js';
import {selectDurablePublishedMembershipObservation} from
  './admin-control-snapshot-node-view-projection.js';

const LOCAL_NESTED_OPERATION_CONTROL_SNAPSHOT =
  'admin_control_snapshot_query';
const SINGLE_FLIGHT_KEY_SERVE_LANE = 'serve-lane';
const REQUEST_CLOSE_EVENT = 'close';
const DISCONNECT_SENTINEL = Symbol('controlSnapshotClientDisconnected');
const TIMEOUT_SENTINEL = Symbol('controlSnapshotTimeout');

function ensureInFlightSnapshotMap(owner) {
  if (!(owner.inFlightLocalSnapshotByKey instanceof Map)) {
    owner.inFlightLocalSnapshotByKey = new Map();
  }
  return owner.inFlightLocalSnapshotByKey;
}

function projectServeLaneReadinessByNodeId(rawReadinessByNodeId) {
  if (!rawReadinessByNodeId || typeof rawReadinessByNodeId !== 'object') {
    return {};
  }
  const projected = {};
  for (const [nodeId, entry] of Object.entries(rawReadinessByNodeId)) {
    if (!entry || typeof entry !== 'object') continue;
    projected[nodeId] = {
      ...(entry.dimensions && typeof entry.dimensions === 'object' ?
        {dimensions: {serveEligible: entry.dimensions.serveEligible === true}} :
        {}),
      ...(Array.isArray(entry.reasons) ? {reasons: entry.reasons} : {}),
    };
  }
  return projected;
}

function projectServeLaneControlSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const rawInFlightCount = snapshot.replicaOperations?.inFlightCount;
  const replicaOperations =
    typeof rawInFlightCount === 'number' && Number.isFinite(rawInFlightCount) ?
      {inFlightCount: rawInFlightCount} :
      {};
  return {
    schemaVersion: snapshot.schemaVersion,
    nodeId: snapshot.nodeId,
    capturedAt: snapshot.capturedAt,
    nodes: Array.isArray(snapshot.nodes) ? snapshot.nodes : [],
    ...(snapshot.observationMode !== undefined ?
      {observationMode: snapshot.observationMode} :
      {}),
    controlPlaneDiagnostics: {
      readinessByNodeId: projectServeLaneReadinessByNodeId(
        snapshot.controlPlaneDiagnostics?.readinessByNodeId,
      ),
    },
    replicaOperations,
  };
}

function countInFlightReplicaOperations(rows = [], options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const livenessOptions = {
    nowMs,
    serviceRows: Array.isArray(options.serviceRows) ?
      options.serviceRows :
      ADMIN_CACHE_DUMP.EMPTY,
    ignorePreRestart: options.ignorePreRestart === true,
    localNodeId: options.localNodeId || null,
  };
  let count = 0;
  for (const row of rows) {
    const record = normalizeReplicaOperationRecord(row, {nowMs});
    if (isReplicaOperationInFlight(record, livenessOptions)) count += 1;
  }
  return count;
}

function buildRawReadinessByNodeId(readinessEntries) {
  const rawReadinessByNodeId = {};
  const entries = Array.isArray(readinessEntries) ?
    readinessEntries :
    ADMIN_CACHE_DUMP.EMPTY;
  for (const readiness of entries) {
    const nodeId = firstStringField(
      readiness,
      COLUMN.NODE_ID,
      ADMIN_CONTROL_SNAPSHOT_LITERAL.NODEID,
    );
    if (nodeId) rawReadinessByNodeId[nodeId] = readiness;
  }
  return rawReadinessByNodeId;
}

async function buildLocalServeLaneControlSnapshotForCacheOwner(
  owner,
  cacheOwner,
  options = {},
) {
  const systemTableCache = cacheOwner?.systemTableCache;
  if (!systemTableCache || !systemTableCache.getAll) {
    throw new Error(ADMIN_ERROR_MESSAGE.CONTROL_SNAPSHOT_UNAVAILABLE);
  }
  const capturedAt = owner.nowFn();
  const readinessEntries = await owner.resolveControlPlaneReadinessEntries({
    allowAuthoritativeRefresh: false,
    allowStaleOnCacheChange: true,
  });
  if (!options.cacheOwner && !owner.isCurrentCacheOwner(cacheOwner)) return null;
  const rawReadinessByNodeId = buildRawReadinessByNodeId(readinessEntries);
  const nodeRows = systemTableCache.getAll(TABLES.NODES);
  const serviceRows = systemTableCache.getAll(TABLES.SERVICES);
  const nodeEndpointRows = systemTableCache.getAll(TABLES.NODE_ENDPOINTS);
  const publicationRows =
    systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS);
  const replicaOperationRows =
    systemTableCache.getAll(TABLES.REPLICA_OPERATIONS);
  const observedMembership = await owner.ensureMembershipPublicationObservation({
    boundedObservationProbe: true,
  });
  const observedPublished = await owner.ensurePublishedMembershipObservation(
    observedMembership,
    {boundedObservationProbe: true},
  );
  if (!options.cacheOwner && !owner.isCurrentCacheOwner(cacheOwner)) return null;
  const publicationConvergence = owner.resolvePublicationConvergenceDiagnostics(
    readinessEntries,
    observedMembership,
    {boundedObservationProbe: true},
  );
  const publishedMembershipObservation =
    owner.resolvePublicationConvergenceDiagnostics(
      ADMIN_CACHE_DUMP.EMPTY,
      observedPublished,
      {boundedObservationProbe: true},
    );
  const pubRows = Array.isArray(publicationRows) ? publicationRows.slice() : [];
  const durablePublished =
    selectDurablePublishedMembershipObservation(publishedMembershipObservation);
  if (durablePublished) pubRows.push(durablePublished);
  const activeNodeViews = owner.resolveControlSnapshotNodeViews(
    nodeRows,
    serviceRows,
    nodeEndpointRows,
    {
      readinessByNodeId: rawReadinessByNodeId,
      publicationConvergence,
      publishedMembershipObservation,
    },
    pubRows,
  );
  const inFlightCount = countInFlightReplicaOperations(replicaOperationRows, {
    nowMs: capturedAt,
    serviceRows,
    ignorePreRestart: options.ignorePreRestart === true,
    localNodeId: owner.nodeId,
  });
  return {
    schemaVersion: ADMIN_CONTROL_SNAPSHOT.SCHEMA_VERSION,
    nodeId: owner.nodeId,
    capturedAt,
    nodes: [...activeNodeViews.effectiveActiveNodeIds],
    observationMode: ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.LOCAL_CACHE,
    controlPlaneDiagnostics: {
      readinessByNodeId: projectServeLaneReadinessByNodeId(rawReadinessByNodeId),
    },
    replicaOperations: {inFlightCount},
  };
}

function runSingleFlightLocalSnapshot(owner, key, runFn, options = {}) {
  if (options?.forceAuthoritativeRepair === true || options?.cacheOwner) {
    return Promise.resolve().then(() => runFn());
  }
  const inFlightMap = ensureInFlightSnapshotMap(owner);
  const generation = Number.isInteger(owner?.cacheOwnerGeneration) ?
    owner.cacheOwnerGeneration :
    0;
  const scopedKey = `${generation}:${key}`;
  const existing = inFlightMap.get(scopedKey);
  if (existing) return existing;
  const promise = Promise.resolve()
    .then(() => runFn())
    .finally(() => {
      if (inFlightMap.get(scopedKey) === promise) inFlightMap.delete(scopedKey);
    });
  inFlightMap.set(scopedKey, promise);
  return promise;
}

function buildLocalServeLaneControlSnapshot(owner, options = {}) {
  if (options.cacheOwner) {
    return buildLocalServeLaneControlSnapshotForCacheOwner(
      owner,
      options.cacheOwner,
      options,
    );
  }
  return runSingleFlightLocalSnapshot(
    owner,
    SINGLE_FLIGHT_KEY_SERVE_LANE,
    () => owner.resolveCacheOwnerSnapshot((cacheOwner) =>
      buildLocalServeLaneControlSnapshotForCacheOwner(owner, cacheOwner, options),
    ),
    options,
  );
}

function throwControlSnapshotTimeoutError(configuredBudgetMs, budget, nowFn) {
  throw createTimeoutBudgetError({
    message: ADMIN_ERROR_MESSAGE.queryTimeout(configuredBudgetMs),
    budget,
    classification: TIMEOUT_BUDGET_CLASSIFICATION.QUERY_TIMEOUT,
    nestedOperation: LOCAL_NESTED_OPERATION_CONTROL_SNAPSHOT,
    now: nowFn,
  });
}

function isHttpClientDisconnected(request, reply) {
  const reqRaw = request?.raw || null;
  const resRaw = reply?.raw || null;
  if (reqRaw?.destroyed === true || resRaw?.destroyed === true) return true;
  return Boolean(resRaw && resRaw.closed === true && !resRaw.writableEnded);
}

function resolveRequestBudget(timeoutMs, existingBudget, nowFn) {
  const hasDeadline = Number.isFinite(timeoutMs) && timeoutMs > 0;
  if (!hasDeadline) return null;
  const configuredBudgetMs = existingBudget?.configuredBudgetMs ??
    Math.floor(timeoutMs);
  const timeoutBudget = existingBudget ||
    createTimeoutBudget({configuredBudgetMs, now: nowFn});
  const remainingMs = getRemainingBudgetMs(timeoutBudget, {now: nowFn});
  if (remainingMs <= 0) {
    throwControlSnapshotTimeoutError(configuredBudgetMs, timeoutBudget, nowFn);
  }
  return {configuredBudgetMs, timeoutBudget, remainingMs};
}

function registerDisconnectRace(racers, resRaw) {
  if (!resRaw || !resRaw.on) return null;
  let closeListener = null;
  racers.push(new Promise((resolve) => {
    closeListener = () => {
      if (!resRaw.writableEnded) resolve(DISCONNECT_SENTINEL);
    };
    resRaw.on(REQUEST_CLOSE_EVENT, closeListener);
  }));
  return closeListener;
}

function cleanupLifecycleRace(timerId, closeListener, resRaw) {
  if (timerId !== null) clearTimeout(timerId);
  if (closeListener && resRaw && resRaw.removeListener) {
    resRaw.removeListener(REQUEST_CLOSE_EVENT, closeListener);
  }
}

function resolveLifecycleOutcome(outcome, budgetState, request, reply, nowFn) {
  if (outcome === DISCONNECT_SENTINEL || isHttpClientDisconnected(request, reply)) {
    return {disconnected: true, snapshot: null};
  }
  if (outcome === TIMEOUT_SENTINEL) {
    throwControlSnapshotTimeoutError(
      budgetState.configuredBudgetMs,
      budgetState.timeoutBudget,
      nowFn,
    );
  }
  return {disconnected: false, snapshot: outcome};
}

async function awaitSnapshotWithRequestLifecycle(promise, options = {}) {
  const {request = null, reply = null, timeoutMs, nowFn, existingBudget = null} =
    options;
  const guardedPromise = Promise.resolve(promise);
  guardedPromise.catch((_error) => {
    void _error;
  });
  if (isHttpClientDisconnected(request, reply)) {
    return {disconnected: true, snapshot: null};
  }
  const budgetState = resolveRequestBudget(timeoutMs, existingBudget, nowFn);
  const resRaw = reply?.raw || null;
  let timerId = null;
  const racers = [guardedPromise];
  if (budgetState) {
    racers.push(new Promise((resolve) => {
      timerId = setTimeout(() => resolve(TIMEOUT_SENTINEL), budgetState.remainingMs);
    }));
  }
  const closeListener = registerDisconnectRace(racers, resRaw);
  try {
    const outcome = racers.length === 1 ?
      await guardedPromise :
      await Promise.race(racers);
    return resolveLifecycleOutcome(outcome, budgetState, request, reply, nowFn);
  } finally {
    cleanupLifecycleRace(timerId, closeListener, resRaw);
  }
}

async function awaitWithTimeoutBudget(
  promise,
  timeoutMs,
  nowFn,
  existingBudget = null,
) {
  const result = await awaitSnapshotWithRequestLifecycle(promise, {
    timeoutMs,
    nowFn,
    existingBudget,
  });
  return result.snapshot;
}

export {
  awaitSnapshotWithRequestLifecycle,
  awaitWithTimeoutBudget,
  buildLocalServeLaneControlSnapshot,
  countInFlightReplicaOperations,
  projectServeLaneControlSnapshot,
  runSingleFlightLocalSnapshot,
};
