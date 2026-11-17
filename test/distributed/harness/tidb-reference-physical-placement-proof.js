import {
  arrayEvery,
  arrayFilter,
  arrayMap,
  arraySome,
  dateNow,
  numberIsFinite,
  numberIsInteger,
  objectHasOwn,
  stringSplit,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {withExplicitSignalOption} from './real-product-deployment-contract.js';
import {
  classifyRemoteCommandError,
  errorText,
} from './real-product-remote-shell.js';
import {sleepWithAbortSignal as sleep} from './tidb-reference-lifecycle.js';

const ZERO = 0;
const ONE = 1;
const DEFAULT_REPLICA_TARGET = 3;
const DEFAULT_TIMEOUT_MS = 90000;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_PLACEMENT_OP_TIMEOUT_MS = 10000;
const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/u;

function assertIdentifier(value, label) {
  const text = String(value || '');
  if (!IDENTIFIER_PATTERN.test(text)) {
    throw new Error(`${label} must be a simple SQL identifier`);
  }
  return text;
}

function mysqlCommand(endpoint, sql) {
  return [
    'mysql',
    '--protocol=TCP',
    `--host=${endpoint.host}`,
    `--port=${endpoint.port}`,
    '--user=root',
    '--connect-timeout=5',
    '--batch',
    '--skip-column-names',
    '--execute',
    sql,
  ];
}

function storeStatusSql() {
  return [
    'SELECT STORE_ID, ADDRESS, STORE_STATE_NAME',
    'FROM INFORMATION_SCHEMA.TIKV_STORE_STATUS',
    'WHERE STORE_STATE_NAME = \'Up\'',
    'ORDER BY STORE_ID;',
  ].join(' ');
}

function regionPeerPlacementSql(databaseName, tableName) {
  const database = assertIdentifier(databaseName, 'TiDB placement database');
  const table = assertIdentifier(tableName, 'TiDB placement table');
  return [
    'SELECT r.REGION_ID, p.PEER_ID, p.STORE_ID, s.ADDRESS,',
    'p.IS_LEARNER, p.IS_LEADER, p.STATUS',
    'FROM (',
    'SELECT DISTINCT REGION_ID',
    'FROM INFORMATION_SCHEMA.TIKV_REGION_STATUS',
    `WHERE DB_NAME = '${database}'`,
    `AND TABLE_NAME = '${table}'`,
    'AND IS_INDEX = 0',
    ') AS r',
    'JOIN INFORMATION_SCHEMA.TIKV_REGION_PEERS AS p',
    'ON p.REGION_ID = r.REGION_ID',
    'JOIN INFORMATION_SCHEMA.TIKV_STORE_STATUS AS s',
    'ON s.STORE_ID = p.STORE_ID',
    'ORDER BY r.REGION_ID, p.STORE_ID;',
  ].join(' ');
}

function parseStoreRows(stdout) {
  const text = stringTrim(String(stdout || ''));
  if (!text) return [];
  return arrayMap(arrayFilter(stringSplit(text, /\r?\n/u), Boolean), (line) => {
    const [storeId, address, state] = stringSplit(stringTrim(line), /\s+/u);
    return {storeId, address, state};
  });
}

function parsePeerRows(stdout) {
  const text = stringTrim(String(stdout || ''));
  if (!text) return [];
  return arrayMap(arrayFilter(stringSplit(text, /\r?\n/u), Boolean), (line) => {
    const [
      regionId,
      peerId,
      storeId,
      address,
      isLearner,
      isLeader,
      status,
    ] = stringSplit(stringTrim(line), /\s+/u);
    return {
      regionId,
      peerId,
      storeId,
      address,
      isLearner: Number.parseInt(isLearner, 10),
      isLeader: Number.parseInt(isLeader, 10),
      status,
    };
  });
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function normalizeExpectedAddresses(addresses, replicaTarget) {
  if (!Array.isArray(addresses)) {
    throw new Error('TiDB physical placement expected addresses must be an array');
  }
  const normalized = sortedUnique(arrayMap(addresses, (value) => stringTrim(String(value))));
  if (normalized.length !== replicaTarget || arraySome(normalized, (value) => !value)) {
    throw new Error(
      `TiDB physical placement requires ${replicaTarget} distinct expected addresses`,
    );
  }
  return normalized;
}

function groupPeerRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.regionId)) grouped.set(row.regionId, []);
    grouped.get(row.regionId).push(row);
  }
  return arrayMap(
    [...grouped.entries()],
    ([regionId, peers]) => ({regionId, peers}),
  ).sort((left, right) => String(left.regionId).localeCompare(String(right.regionId)));
}

function evaluatePhysicalPlacement(options = {}) {
  const replicaTarget = options.replicaTarget ?? DEFAULT_REPLICA_TARGET;
  if (!Number.isInteger(replicaTarget) || replicaTarget < ONE) {
    throw new Error('TiDB physical placement requires positive replicaTarget');
  }
  const expectedAddresses = normalizeExpectedAddresses(
    options.expectedAddresses,
    replicaTarget,
  );
  const stores = Array.isArray(options.stores) ? options.stores : [];
  const peerRows = Array.isArray(options.peers) ? options.peers : [];

  const upStoreAddresses = sortedUnique(
    arrayMap(arrayFilter(stores, ({state}) => state === 'Up'), ({address}) => address),
  );
  const storesReady =
    upStoreAddresses.length === replicaTarget &&
    JSON.stringify(upStoreAddresses) === JSON.stringify(expectedAddresses);

  const regions = arrayMap(groupPeerRows(peerRows), ({regionId, peers}) => {
    const addresses = sortedUnique(arrayMap(peers, ({address}) => address));
    const storeIds = sortedUnique(arrayMap(peers, ({storeId}) => storeId));
    const learnerCount = peers.reduce(
      (sum, peer) => sum + (peer.isLearner === ONE ? ONE : ZERO),
      ZERO,
    );
    const leaderCount = peers.reduce(
      (sum, peer) => sum + (peer.isLeader === ONE ? ONE : ZERO),
      ZERO,
    );
    const normalCount = peers.reduce(
      (sum, peer) => sum + (peer.status === 'NORMAL' ? ONE : ZERO),
      ZERO,
    );
    const ready =
      peers.length === replicaTarget &&
      storeIds.length === replicaTarget &&
      addresses.length === replicaTarget &&
      JSON.stringify(addresses) === JSON.stringify(expectedAddresses) &&
      learnerCount === ZERO &&
      leaderCount === ONE &&
      normalCount === replicaTarget;
    return {
      regionId,
      peerCount: peers.length,
      storeCount: storeIds.length,
      addresses,
      learnerCount,
      leaderCount,
      normalCount,
      ready,
    };
  });

  return {
    ready: storesReady && regions.length > ZERO && arrayEvery(regions, ({ready}) => ready),
    replicaTarget,
    expectedAddresses,
    storesReady,
    upStores: stores,
    regions,
  };
}

function resolvePlacementClock(options) {
  if (typeof options.now === 'function') return options.now;
  return typeof options.nowFn === 'function' ? options.nowFn : dateNow;
}

function resolvePlacementTarget(options) {
  const provider = options.provider;
  if (!provider || typeof provider.execInContainer !== 'function') {
    throw new Error('TiDB physical placement proof requires provider.execInContainer');
  }
  const clientContainerId = stringTrim(String(options.clientContainerId || ''));
  if (!clientContainerId) {
    throw new Error('TiDB physical placement proof requires clientContainerId');
  }
  const endpoint = options.endpoint;
  if (!endpoint?.host || !Number.isInteger(Number(endpoint.port))) {
    throw new Error('TiDB physical placement proof requires endpoint');
  }
  const replicaTarget = options.replicaTarget ?? DEFAULT_REPLICA_TARGET;
  if (!numberIsInteger(replicaTarget) || replicaTarget < ONE) {
    throw new Error('TiDB physical placement requires positive replicaTarget');
  }
  return {
    provider, clientContainerId, endpoint, replicaTarget,
    expectedAddresses: normalizeExpectedAddresses(options.expectedAddresses, replicaTarget),
  };
}

function resolvePlacementOptions(options = {}) {
  const target = resolvePlacementTarget(options);
  return {
    ...target,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    hasExplicitSignal: objectHasOwn(options, 'signal'),
    signal: options.signal ?? null,
    deadlineAtMs: numberIsFinite(options.deadlineAtMs) ? options.deadlineAtMs : null,
    now: resolvePlacementClock(options),
    peerSql: regionPeerPlacementSql(options.databaseName, options.tableName),
  };
}

function isObserverInfraPlacementResult(result) {
  if (!result || result.exitCode === null || result.exitCode === undefined) {
    return true;
  }
  const classified = classifyRemoteCommandError({
    exitCode: result.exitCode,
    message: result.stderr || result.stdout || '',
  });
  return classified.observerInfrastructure;
}

function evaluatePlacementAttempt(
  lastStoreResult,
  lastPeerResult,
  expectedAddresses,
  replicaTarget,
) {
  if (lastStoreResult?.exitCode !== ZERO || lastPeerResult?.exitCode !== ZERO) {
    return null;
  }
  return evaluatePhysicalPlacement({
    stores: parseStoreRows(lastStoreResult.stdout),
    peers: parsePeerRows(lastPeerResult.stdout),
    expectedAddresses,
    replicaTarget,
  });
}

function formatPlacementTimeoutError(
  timeoutMs,
  lastStoreResult,
  lastPeerResult,
  lastEvaluation,
  lastError = null,
) {
  const storesExit = lastStoreResult?.exitCode ?? 'unknown';
  const peersExit = lastPeerResult?.exitCode ?? 'unknown';
  const evaluation = JSON.stringify(lastEvaluation);
  const errorSuffix = lastError ? ` lastError=${errorText(lastError)}` : '';
  return new Error(
    `TiDB physical table placement did not converge within ${timeoutMs}ms; ` +
    `storesExit=${storesExit} peersExit=${peersExit} evaluation=${evaluation}${errorSuffix}`,
  );
}

function buildPlacementCallOptions(cfg, effectiveEndMs) {
  if (cfg.signal?.aborted) return null;
  const remainingMs = effectiveEndMs - cfg.now();
  if (remainingMs <= ZERO) return null;
  const opMs = Math.max(ONE, Math.min(DEFAULT_PLACEMENT_OP_TIMEOUT_MS, Math.floor(remainingMs)));
  return withExplicitSignalOption(
    {timeoutMs: opMs},
    cfg.hasExplicitSignal ? cfg.signal : undefined,
  );
}

function recordNonReadyPlacementResult(state, storeResult, peerResult) {
  if (isObserverInfraPlacementResult(storeResult) ||
      isObserverInfraPlacementResult(peerResult)) {
    state.observerInfraCount += ONE;
  } else {
    state.hadProductDenial = true;
  }
}

function recordPlacementAttemptError(state, error, cfg, effectiveEndMs) {
  state.lastError = error;
  const classified = classifyRemoteCommandError(error);
  if (cfg.signal?.aborted || classified.aborted) {
    state.abortedByError = true;
    return false;
  }
  if (classified.deadlineExpired || error?.deadlineExpired === true) {
    state.deadlineExpiredByError = true;
    return false;
  }
  if (classified.observerInfrastructure) state.observerInfraCount += ONE;
  else state.hadProductDenial = true;
  return cfg.now() < effectiveEndMs;
}

async function runPlacementAttempt(cfg, state, storeSql, effectiveEndMs) {
  const storeCallOptions = buildPlacementCallOptions(cfg, effectiveEndMs);
  if (!storeCallOptions) return {stop: true, evaluation: null};
  state.attempts += ONE;
  const storeResult = await cfg.provider.execInContainer(
    cfg.clientContainerId, mysqlCommand(cfg.endpoint, storeSql), storeCallOptions,
  );
  state.lastStoreResult = storeResult;
  const peerCallOptions = buildPlacementCallOptions(cfg, effectiveEndMs);
  if (!peerCallOptions) {
    if (storeResult?.exitCode !== ZERO) {
      recordNonReadyPlacementResult(state, storeResult, {exitCode: ZERO});
    }
    return {stop: true, evaluation: null};
  }
  const peerResult = await cfg.provider.execInContainer(
    cfg.clientContainerId, mysqlCommand(cfg.endpoint, cfg.peerSql), peerCallOptions,
  );
  state.lastPeerResult = peerResult;
  const evaluation = evaluatePlacementAttempt(
    storeResult, peerResult, cfg.expectedAddresses, cfg.replicaTarget,
  );
  if (evaluation) {
    state.lastEvaluation = evaluation;
    if (!evaluation.ready) state.hadProductDenial = true;
  } else {
    recordNonReadyPlacementResult(state, storeResult, peerResult);
  }
  if (cfg.signal?.aborted || cfg.now() >= effectiveEndMs) return {stop: true, evaluation: null};
  return {stop: Boolean(evaluation?.ready), evaluation};
}

function buildPlacementFailure(cfg, state, started) {
  const aborted = Boolean(cfg.signal?.aborted || state.abortedByError);
  const pastDeadline = cfg.deadlineAtMs !== null && cfg.now() >= cfg.deadlineAtMs;
  const deadlineExpired = Boolean(!aborted && (state.deadlineExpiredByError || pastDeadline));
  const timedOut = Boolean(!aborted && !deadlineExpired && cfg.now() - started >= cfg.timeoutMs);
  const observerInfrastructure = Boolean(
    !aborted && !state.hadProductDenial && state.observerInfraCount > ZERO,
  );
  const failure = formatPlacementTimeoutError(
    cfg.timeoutMs, state.lastStoreResult, state.lastPeerResult,
    state.lastEvaluation, state.lastError,
  );
  failure.aborted = aborted;
  failure.deadlineExpired = deadlineExpired;
  failure.timedOut = timedOut;
  failure.hadProductDenial = state.hadProductDenial;
  failure.observerInfrastructure = observerInfrastructure;
  failure.lastEvaluation = state.lastEvaluation;
  if (state.lastError) failure.lastError = errorText(state.lastError);
  return failure;
}

async function waitForPhysicalTablePlacement(options = {}) {
  const cfg = resolvePlacementOptions(options);
  const started = cfg.now();
  const effectiveEndMs = cfg.deadlineAtMs !== null ?
    Math.min(started + cfg.timeoutMs, cfg.deadlineAtMs) : started + cfg.timeoutMs;
  const storeSql = storeStatusSql();
  const state = {
    attempts: ZERO, lastEvaluation: null, lastStoreResult: null, lastPeerResult: null,
    lastError: null, hadProductDenial: false, observerInfraCount: ZERO,
    abortedByError: false, deadlineExpiredByError: false,
  };
  while (cfg.now() < effectiveEndMs && !cfg.signal?.aborted) {
    try {
      const outcome = await runPlacementAttempt(cfg, state, storeSql, effectiveEndMs);
      if (outcome.evaluation?.ready) return {...outcome.evaluation, attempts: state.attempts};
      if (outcome.stop) break;
    } catch (error) {
      if (!recordPlacementAttemptError(state, error, cfg, effectiveEndMs)) break;
    }
    const waitMs = Math.max(ZERO, Math.min(cfg.pollIntervalMs, effectiveEndMs - cfg.now()));
    if (waitMs > ZERO) await sleep(waitMs, cfg.signal);
  }
  throw buildPlacementFailure(cfg, state, started);
}

export {
  mysqlCommand as buildTiDbPhysicalMysqlCommand,
  waitForPhysicalTablePlacement,
};
