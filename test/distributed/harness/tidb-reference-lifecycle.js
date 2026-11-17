import {
  arrayMap,
  dateNow,
  numberIsFinite,
  numberIsSafeInteger,
  objectHasOwn,
  objectKeys,
  stringIncludes,
  stringStartsWith,
  stringToLowerCase,
  stringTrim,
} from './real-product-captured-intrinsics.js';

const DEFAULTS = Object.freeze({
  // TiDB 8.5 is the current LTS line; pin the exact patch so benchmark
  // comparisons do not silently change underneath historical evidence.
  pdImage: 'pingcap/pd:v8.5.8',
  tikvImage: 'pingcap/tikv:v8.5.8',
  tidbImage: 'pingcap/tidb:v8.5.8',
  // Readiness uses an ephemeral client container. It is never part of the
  // measured topology, but is pinned so the readiness contract is reproducible.
  mysqlClientImage: 'mysql:8.4.11',
  pdClientPort: 2379,
  pdPeerPort: 2380,
  tikvPort: 20160,
  tidbPort: 4000,
  tidbStatusPort: 10080,
  tikvNofileLimit: 262144,
  tikvStoreCount: 1,
  readinessTimeoutMs: 120000,
  readinessPollIntervalMs: 1000,
});

const ZERO = 0;
const ONE = 1;
const MAX_TIKV_STORE_COUNT = 9;
const READY_VALUE = '1';
const READINESS_CLIENT_KEEPALIVE_SECONDS = '300';
const DIAGNOSTIC_LOG_TAIL_LINES = 80;
const DIAGNOSTIC_LOG_MAX_CHARS = 6000;
const DEFAULT_PROVIDER_OP_TIMEOUT_MS = 10000;
const DIAGNOSTIC_DEADLINE_MS = 30000;
const DIAGNOSTIC_DEADLINE_EXPIRED = 'post-failure diagnostic deadline expired';
const SSH_TRANSPORT_EXIT_CODE = 255;
const DOCKER_ERROR_EXIT_MIN = 125;
const DOCKER_ERROR_EXIT_MAX = 127;

function withExplicitSignal(baseOpts, signal) {
  return signal === undefined ? {...(baseOpts || {})} : {...(baseOpts || {}), signal};
}

function errorMessageOf(error) {
  return String(error?.stderr || error?.message || error);
}

function taggedError(message, props) {
  return Object.assign(new Error(message), props);
}

function parseNumericExitCode(rawCode) {
  if (rawCode === null || rawCode === undefined || rawCode === '') return null;
  const num = Number(rawCode);
  return numberIsSafeInteger(num) ? num : null;
}

function isAbortedObserverError(error, message, lower) {
  if (error?.name === 'AbortError' || error?.aborted === true || error?.code === 'ABORT_ERR') {
    return true;
  }
  return message === 'aborted' || stringIncludes(lower, 'operation aborted') ||
    stringIncludes(lower, 'readiness probe aborted');
}

function isTimedOutObserverError(error, rawCode, lower) {
  if (error?.timedOut === true || rawCode === 'ETIMEDOUT') return true;
  if (error?.killed === true && rawCode !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return true;
  return stringIncludes(lower, 'ssh timed out') || stringIncludes(lower, 'command timed out') ||
    stringIncludes(lower, 'etimedout');
}

function isSshTransportObserverError(intCode, lower) {
  if (intCode === SSH_TRANSPORT_EXIT_CODE) return true;
  return stringStartsWith(stringTrim(lower), 'ssh:') || stringIncludes(lower, '\nssh:') ||
    stringIncludes(lower, 'kex_exchange_identification');
}

function isDockerDaemonObserverError(intCode, lower) {
  const clientErr = intCode !== null && intCode >= DOCKER_ERROR_EXIT_MIN &&
    intCode <= DOCKER_ERROR_EXIT_MAX;
  return clientErr || stringIncludes(lower, 'cannot connect to the docker daemon') ||
    stringIncludes(lower, 'error response from daemon');
}

function isObserverInfraCause(error, intCode, lower, rawCode) {
  return isSshTransportObserverError(intCode, lower) ||
    isTimedOutObserverError(error, rawCode, lower) ||
    isDockerDaemonObserverError(intCode, lower) ||
    error?.observerInfrastructure === true;
}

function classifyObserverError(error) {
  const message = errorMessageOf(error);
  const lower = stringToLowerCase(message);
  const rawCode = error?.exitCode ?? error?.code ?? null;
  const intCode = parseNumericExitCode(rawCode);
  const aborted = isAbortedObserverError(error, message, lower);
  const deadlineExpired = Boolean(error?.deadlineExpired || stringIncludes(lower, 'deadline expired'));
  const timedOut = isTimedOutObserverError(error, rawCode, lower);
  const sshTransport = isSshTransportObserverError(intCode, lower);
  const infra = isObserverInfraCause(error, intCode, lower, rawCode);
  return {
    message, aborted, deadlineExpired, timedOut,
    transportError: !aborted && (sshTransport || timedOut),
    observerInfrastructure: Boolean(!aborted && !deadlineExpired && infra),
  };
}

function boundedProviderCallOptions(callOptions, defaultMs = DEFAULT_PROVIDER_OP_TIMEOUT_MS) {
  const rawTimeout = callOptions?.timeoutMs;
  const timeoutMs = numberIsFinite(rawTimeout) ?
    Math.max(ONE, Math.min(defaultMs, Math.floor(rawTimeout))) : defaultMs;
  const hasSignal = Boolean(callOptions && objectHasOwn(callOptions, 'signal'));
  return withExplicitSignal({timeoutMs}, hasSignal ? callOptions.signal : undefined);
}

function buildReadinessSql(tikvStoreCount = DEFAULTS.tikvStoreCount) {
  return 'SELECT CASE WHEN ' +
    '(SELECT COUNT(*) FROM INFORMATION_SCHEMA.TIKV_STORE_STATUS ' +
    'WHERE STORE_STATE_NAME = \'Up\') >= ' + tikvStoreCount + ' ' +
    'AND (SELECT COUNT(*) FROM mysql.user) >= 1 ' +
    'THEN 1 ELSE 0 END;';
}

const READINESS_SQL = buildReadinessSql();

function sleep(ms, signal = null) {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, {once: true});
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
  });
}

function normalizeStoreCount(value) {
  const count = value ?? DEFAULTS.tikvStoreCount;
  if (!Number.isInteger(count) || count < ONE || count > MAX_TIKV_STORE_COUNT) {
    throw new Error(
      'TiDB reference tikvStoreCount must be an integer from 1 to ' +
      String(MAX_TIKV_STORE_COUNT),
    );
  }
  return count;
}

function validateProviderAndNetwork(provider, network) {
  if (!provider) {
    throw new Error('TiDB reference lifecycle requires provider');
  }
  if (!network) {
    throw new Error('TiDB reference lifecycle requires network');
  }
  if (typeof provider.execInContainer !== 'function') {
    throw new Error(
      'TiDB reference lifecycle requires provider.execInContainer for SQL readiness',
    );
  }
}

function normalizeImages(images) {
  return {
    pd: images?.pd || DEFAULTS.pdImage,
    tikv: images?.tikv || DEFAULTS.tikvImage,
    tidb: images?.tidb || DEFAULTS.tidbImage,
    mysqlClient:
      images?.mysqlClient || DEFAULTS.mysqlClientImage,
  };
}

function normalizeOptions(options = {}) {
  const provider = options.provider;
  const network = options.network;
  validateProviderAndNetwork(provider, network);
  return {
    provider,
    network,
    tikvStoreCount: normalizeStoreCount(options.tikvStoreCount),
    resourceLimits: options.resourceLimits || {},
    readinessResourceLimits: options.readinessResourceLimits || {},
    images: normalizeImages(options.images),
    readinessTimeoutMs:
      options.readinessTimeoutMs || DEFAULTS.readinessTimeoutMs,
    readinessPollIntervalMs:
      options.readinessPollIntervalMs || DEFAULTS.readinessPollIntervalMs,
    namePrefix: options.namePrefix || 'tidb-reference',
    signal: options.signal ?? null,
    deadlineAtMs: numberIsFinite(options.deadlineAtMs) ? options.deadlineAtMs : null,
    now: typeof options.now === 'function' ? options.now :
      (typeof options.nowFn === 'function' ? options.nowFn : dateNow),
  };
}

function networkHostConfig(network) {
  return {NetworkMode: network};
}

function tikvHostConfig(network) {
  return {
    NetworkMode: network,
    Ulimits: [{
      Name: 'nofile',
      Soft: DEFAULTS.tikvNofileLimit,
      Hard: DEFAULTS.tikvNofileLimit,
    }],
  };
}

function tikvStoreNames(namePrefix, storeCount) {
  if (storeCount === ONE) return [`${namePrefix}-tikv`];
  return Array.from(
    {length: storeCount},
    (_unused, index) => `${namePrefix}-tikv-${index + ONE}`,
  );
}

function boundedLog(value) {
  const text = stringTrim(String(value || ''));
  if (text.length <= DIAGNOSTIC_LOG_MAX_CHARS) return text;
  return text.slice(text.length - DIAGNOSTIC_LOG_MAX_CHARS);
}

async function fetchContainerInspect(provider, containerId,
  timeoutMs = DEFAULT_PROVIDER_OP_TIMEOUT_MS) {
  try {
    const inspect = await provider.inspectContainer(
      containerId,
      boundedProviderCallOptions({signal: null, timeoutMs}),
    );
    return {inspect, inspectError: null};
  } catch (error) {
    return {inspect: null, inspectError: errorMessageOf(error)};
  }
}

async function fetchContainerLogs(provider, containerId,
  timeoutMs = DEFAULT_PROVIDER_OP_TIMEOUT_MS) {
  if (typeof provider.getContainerLogs !== 'function') {
    return {logs: '', logError: null};
  }
  try {
    const boundedMs = numberIsFinite(timeoutMs) ?
      Math.max(ONE, Math.min(DEFAULT_PROVIDER_OP_TIMEOUT_MS, Math.floor(timeoutMs))) :
      DEFAULT_PROVIDER_OP_TIMEOUT_MS;
    const logs = boundedLog(await provider.getContainerLogs(
      containerId,
      {tail: DIAGNOSTIC_LOG_TAIL_LINES, signal: null, timeoutMs: boundedMs},
    ));
    return {logs, logError: null};
  } catch (error) {
    return {logs: '', logError: errorMessageOf(error)};
  }
}

function extractNetworkNames(inspect) {
  const networks = inspect?.NetworkSettings?.Networks;
  return networks ? objectKeys(networks) : [];
}

function extractInspectStatus(state) {
  return {
    running: state?.Running ?? null,
    status: state?.Status ?? null,
    exitCode: state?.ExitCode ?? null,
  };
}

function extractInspectErrors(state) {
  return {
    oomKilled: state?.OOMKilled ?? null,
    stateError: state?.Error || null,
  };
}

async function collectContainerDiagnostic(provider, watched, deadlineAtMs, clock) {
  const remainingInspect = deadlineAtMs - clock();
  const {inspect, inspectError} = remainingInspect > ZERO ?
    await fetchContainerInspect(provider, watched.containerId, remainingInspect) :
    {inspect: null, inspectError: DIAGNOSTIC_DEADLINE_EXPIRED};
  const remainingLogs = deadlineAtMs - clock();
  const {logs, logError} = remainingLogs > ZERO ?
    await fetchContainerLogs(provider, watched.containerId, remainingLogs) :
    {logs: '', logError: DIAGNOSTIC_DEADLINE_EXPIRED};

  return {
    role: watched.role,
    containerId: watched.containerId,
    ...extractInspectStatus(inspect?.State),
    ...extractInspectErrors(inspect?.State),
    networkNames: extractNetworkNames(inspect),
    inspectError,
    logError,
    logs,
  };
}

async function collectReadinessDiagnostics(provider, watchedContainers = [], clock = dateNow) {
  const deadlineAtMs = clock() + DIAGNOSTIC_DEADLINE_MS;
  const diagnostics = [];
  for (const watched of watchedContainers) {
    if (deadlineAtMs - clock() <= ZERO) {
      diagnostics.push({
        role: watched.role,
        containerId: watched.containerId,
        ...extractInspectStatus(null),
        ...extractInspectErrors(null),
        networkNames: [],
        inspectError: DIAGNOSTIC_DEADLINE_EXPIRED,
        logError: DIAGNOSTIC_DEADLINE_EXPIRED,
        logs: '',
      });
      continue;
    }
    diagnostics.push(await collectContainerDiagnostic(provider, watched, deadlineAtMs, clock));
  }
  return diagnostics;
}

function anyFlag(first, second) {
  return Boolean(first || second);
}

function buildInspectErrorProps(error, callOptions) {
  const classified = classifyObserverError(error);
  const aborted = anyFlag(callOptions?.signal?.aborted, classified.aborted);
  const deadlineExpired = anyFlag(error?.deadlineExpired, classified.deadlineExpired);
  const props = {
    aborted,
    deadlineExpired,
    timedOut: anyFlag(error?.timedOut, classified.timedOut),
    transportError: anyFlag(error?.transportError, classified.transportError),
    observerInfrastructure: !aborted && !deadlineExpired && classified.observerInfrastructure,
  };
  if (typeof error?.code === 'string' && /^[a-z][a-z0-9_-]*$/u.test(error.code)) {
    props.code = error.code;
  }
  return props;
}

async function inspectWatchedOrThrow(provider, watched, watchedContainers, callOptions, clock) {
  try {
    return await provider.inspectContainer(watched.containerId,
      boundedProviderCallOptions(callOptions));
  } catch (error) {
    const props = buildInspectErrorProps(error, callOptions);
    if (props.aborted) {
      throw taggedError(`TiDB reference SQL readiness aborted: ${errorMessageOf(error)}`, props);
    }
    const diagnostics = await collectReadinessDiagnostics(provider, watchedContainers, clock);
    throw taggedError(
      `TiDB reference ${watched.role} inspection failed before SQL readiness: ` +
      `${errorMessageOf(error)}; diagnostics=${JSON.stringify(diagnostics)}`,
      props,
    );
  }
}

async function assertWatchedContainersRunning(provider, watchedContainers = [],
  callOptions = undefined, clock = dateNow) {
  for (const watched of watchedContainers) {
    if (callOptions?.signal?.aborted) {
      throw taggedError('TiDB reference SQL readiness aborted', {
        aborted: true, deadlineExpired: false, timedOut: false,
        transportError: false, observerInfrastructure: false,
      });
    }
    const inspect = await inspectWatchedOrThrow(
      provider, watched, watchedContainers, callOptions, clock,
    );
    if (inspect?.State?.Running !== true) {
      const diagnostics = await collectReadinessDiagnostics(provider, watchedContainers, clock);
      throw taggedError(
        `TiDB reference ${watched.role} stopped before SQL readiness; ` +
        `diagnostics=${JSON.stringify(diagnostics)}`,
        {
          aborted: false, deadlineExpired: false, timedOut: false,
          transportError: false, observerInfrastructure: false, hadProductDenial: true,
        },
      );
    }
  }
}

function resolveRunningWindow(options, clock) {
  const deadlineAtMs = numberIsFinite(options.deadlineAtMs) ? options.deadlineAtMs : null;
  const end = deadlineAtMs !== null ?
    Math.min(clock() + options.timeoutMs, deadlineAtMs) : clock() + options.timeoutMs;
  return {deadlineAtMs, effectiveEndMs: end};
}

function buildRunningInspectCallOpts(options, remainingMs) {
  const signal = options.signal ?? null;
  return boundedProviderCallOptions(withExplicitSignal(
    {timeoutMs: remainingMs},
    objectHasOwn(options, 'signal') ? signal : undefined,
  ));
}

async function probeContainerRunningState(provider, containerId, options, effectiveEndMs, clock) {
  const remainingMs = effectiveEndMs - clock();
  if (remainingMs <= ZERO) return {done: true, state: null};
  const state = await provider.inspectContainer(
    containerId,
    buildRunningInspectCallOpts(options, remainingMs),
  );
  if (options.signal?.aborted) {
    throw taggedError(`TiDB reference container ${containerId} startup aborted`, {aborted: true});
  }
  if (clock() >= effectiveEndMs) return {done: true, state: null};
  return {done: state?.State?.Running === true, state};
}

function throwContainerNotRunning(containerId, options, deadlineAtMs, clock, lastError) {
  const aborted = Boolean(options.signal?.aborted);
  const deadlineExpired = Boolean(!aborted && deadlineAtMs !== null && clock() >= deadlineAtMs);
  throw taggedError(
    `TiDB reference container ${containerId} was not running within ${options.timeoutMs}ms` +
    (lastError ? `: ${lastError.message}` : ''),
    {aborted, deadlineExpired},
  );
}

async function tryRunningProbe(provider, containerId, options, effectiveEndMs, clock) {
  try {
    return {
      outcome: await probeContainerRunningState(
        provider, containerId, options, effectiveEndMs, clock,
      ),
      error: null,
    };
  } catch (error) {
    if (error?.aborted || options.signal?.aborted) throw error;
    return {outcome: null, error};
  }
}

async function waitForContainerRunning(provider, containerId, options) {
  const clock = typeof options.now === 'function' ? options.now : dateNow;
  const signal = options.signal ?? null;
  const {deadlineAtMs, effectiveEndMs} = resolveRunningWindow(options, clock);
  let lastError = null;
  while (clock() < effectiveEndMs && !signal?.aborted) {
    const attempt = await tryRunningProbe(provider, containerId, options, effectiveEndMs, clock);
    if (attempt.outcome?.state) return attempt.outcome.state;
    if (attempt.outcome?.done) break;
    if (attempt.error) lastError = attempt.error;
    await sleep(Math.max(ZERO, Math.min(options.pollIntervalMs, effectiveEndMs - clock())), signal);
  }
  throwContainerNotRunning(containerId, options, deadlineAtMs, clock, lastError);
}

function buildSqlReadinessCommand(endpoint, sql = READINESS_SQL) {
  return [
    'mysql', '--protocol=TCP', `--host=${endpoint.host}`, `--port=${endpoint.port}`,
    '--user=root', '--connect-timeout=2', '--batch', '--skip-column-names', '--execute', sql,
  ];
}

function formatSqlReadinessDetail(lastError, lastResult) {
  const parts = [];
  if (lastResult) {
    const exitCode = lastResult.exitCode ?? 'unknown';
    const stdout = JSON.stringify(lastResult.stdout || '');
    const stderr = JSON.stringify(lastResult.stderr || '');
    parts.push(`exit=${exitCode} stdout=${stdout} stderr=${stderr}`);
  }
  if (lastError) {
    parts.push(`lastError=${lastError.message}`);
  }
  return parts.length > 0 ? parts.join('; ') : 'no attempts recorded';
}

function isSqlReadinessSuccessful(result) {
  return result?.exitCode === ZERO &&
    stringTrim(String(result.stdout || '')) === READY_VALUE;
}

async function executeSqlReadinessAttempt(provider, clientContainerId, command,
  callOptions = undefined) {
  try {
    const result = await provider.execInContainer(clientContainerId, command, callOptions);
    return {result, error: null};
  } catch (error) {
    return {result: null, error};
  }
}

function isObserverInfraResult(result) {
  if (!result || result.exitCode === null || result.exitCode === undefined) {
    return true;
  }
  const classified = classifyObserverError({
    exitCode: result.exitCode,
    message: result.stderr || result.stdout || '',
  });
  return classified.observerInfrastructure;
}

function resolveSqlReadyConfig(options) {
  const clock = typeof options.now === 'function' ? options.now :
    (typeof options.nowFn === 'function' ? options.nowFn : dateNow);
  const started = clock();
  const deadlineAtMs = numberIsFinite(options.deadlineAtMs) ? options.deadlineAtMs : null;
  const effectiveEndMs = deadlineAtMs !== null ?
    Math.min(started + options.timeoutMs, deadlineAtMs) : started + options.timeoutMs;
  const readinessSql = options.readinessSql || READINESS_SQL;
  return {
    clock, started, deadlineAtMs, effectiveEndMs, readinessSql,
    hasExplicitSignal: objectHasOwn(options, 'signal'),
    signal: options.signal ?? null,
    watchedContainers: options.watchedContainers || [],
  };
}

function buildSqlAttemptCallOptions(cfg) {
  if (cfg.signal?.aborted) return null;
  const remainingMs = cfg.effectiveEndMs - cfg.clock();
  if (remainingMs <= ZERO) return null;
  const opMs = Math.max(ONE, Math.min(DEFAULT_PROVIDER_OP_TIMEOUT_MS, Math.floor(remainingMs)));
  return withExplicitSignal({timeoutMs: opMs}, cfg.hasExplicitSignal ? cfg.signal : undefined);
}

function applySqlAttemptError(state, error, signal) {
  state.lastError = error;
  const classified = classifyObserverError(error);
  if (signal?.aborted || classified.aborted) {
    state.abortedByError = true;
    return false;
  }
  if (classified.deadlineExpired || error?.deadlineExpired === true) {
    state.deadlineExpiredByError = true;
    return false;
  }
  if (classified.observerInfrastructure) state.observerInfraCount += ONE;
  else state.hadProductDenial = true;
  return true;
}

function applySqlAttemptResult(state, result, cfg) {
  state.lastResult = result;
  const readyNow = isSqlReadinessSuccessful(result);
  if (!readyNow) {
    if (isObserverInfraResult(result)) state.observerInfraCount += ONE;
    else state.hadProductDenial = true;
  }
  if (cfg.signal?.aborted || cfg.clock() >= cfg.effectiveEndMs) return {stop: true, ready: false};
  return {stop: readyNow, ready: readyNow};
}

async function throwSqlReadinessFailure(provider, options, cfg, state) {
  const aborted = Boolean(cfg.signal?.aborted || state.abortedByError);
  const pastDeadline = cfg.deadlineAtMs !== null && cfg.clock() >= cfg.deadlineAtMs;
  const deadlineExpired = Boolean(!aborted && (state.deadlineExpiredByError || pastDeadline));
  const timedOut = Boolean(!aborted && !deadlineExpired &&
    cfg.clock() - cfg.started >= options.timeoutMs);
  const observerInfrastructure = Boolean(
    !aborted && !state.hadProductDenial && state.observerInfraCount > ZERO,
  );
  const detail = formatSqlReadinessDetail(state.lastError, state.lastResult);
  const diagnostics = aborted ? [] :
    await collectReadinessDiagnostics(provider, cfg.watchedContainers, cfg.clock);
  throw taggedError(
    `TiDB reference SQL readiness failed within ${options.timeoutMs}ms: ` +
    `${detail}; diagnostics=${JSON.stringify(diagnostics)}`,
    {
      aborted, deadlineExpired, timedOut, observerInfrastructure,
      hadProductDenial: state.hadProductDenial,
      lastResult: state.lastResult,
      lastError: state.lastError ? errorMessageOf(state.lastError) : null,
    },
  );
}

async function waitForSqlReady(provider, clientContainerId, endpoint, options) {
  const cfg = resolveSqlReadyConfig(options);
  const command = buildSqlReadinessCommand(endpoint, cfg.readinessSql);
  const state = {
    attempts: ZERO, lastError: null, lastResult: null, hadProductDenial: false,
    observerInfraCount: ZERO, abortedByError: false, deadlineExpiredByError: false,
  };
  while (cfg.clock() < cfg.effectiveEndMs) {
    const callOptions = buildSqlAttemptCallOptions(cfg);
    if (!callOptions) break;
    state.attempts += ONE;
    try {
      await assertWatchedContainersRunning(provider, cfg.watchedContainers, callOptions, cfg.clock);
    } catch (inspectError) {
      if (state.hadProductDenial) {
        inspectError.hadProductDenial = true;
        inspectError.observerInfrastructure = false;
      }
      throw inspectError;
    }
    const outcome = await executeSqlReadinessAttempt(
      provider, clientContainerId, command, callOptions,
    );
    if (outcome.error) {
      if (!applySqlAttemptError(state, outcome.error, cfg.signal)) break;
    } else {
      const verdict = applySqlAttemptResult(state, outcome.result, cfg);
      if (verdict.ready) {
        return {attempts: state.attempts, sql: cfg.readinessSql, clientContainerId};
      }
      if (verdict.stop) break;
    }
    if (cfg.signal?.aborted || cfg.clock() >= cfg.effectiveEndMs) break;
    await sleep(Math.min(options.pollIntervalMs, Math.max(ZERO, cfg.effectiveEndMs - cfg.clock())),
      cfg.signal);
  }
  await throwSqlReadinessFailure(provider, options, cfg, state);
}

async function stopTiDbReferenceCluster(provider, created) {
  const failures = [];
  for (let index = created.length - ONE; index >= ZERO; index -= ONE) {
    const container = created[index];
    try {
      const inspect = await provider.inspectContainer(container.containerId);
      if (inspect?.State?.Running === true) {
        await provider.stopContainer(container.containerId);
      }
    } catch (error) {
      failures.push(error);
    }
    try {
      await provider.removeContainer(container.containerId);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > ZERO) {
    const message = arrayMap(failures, (error) => error.message).join('; ');
    throw new Error(`TiDB reference cleanup failed: ${message}`);
  }
}

async function startTiKvStores(options, names, created, runningOptions) {
  const stores = [];
  for (const storeName of names.tikvStores) {
    const tikv = await options.provider.createContainer({
      name: storeName, image: options.images.tikv, network: options.network,
      resourceLimits: options.resourceLimits, hostConfigExtras: tikvHostConfig(options.network),
      command: [
        `--addr=0.0.0.0:${DEFAULTS.tikvPort}`, `--advertise-addr=${storeName}:${DEFAULTS.tikvPort}`,
        `--pd=${names.pd}:${DEFAULTS.pdClientPort}`,
      ],
    });
    created.push(tikv);
    stores.push(tikv);
    await waitForContainerRunning(options.provider, tikv.containerId, runningOptions);
  }
  return stores;
}

function watchedTopology(pd, tikvStores, tidb) {
  return [
    {role: 'pd', containerId: pd.containerId},
    ...arrayMap(tikvStores, (tikv, index) => ({
      role: `tikv-${index + ONE}`, containerId: tikv.containerId,
    })),
    {role: 'tidb', containerId: tidb.containerId},
  ];
}

async function startTiDbReferenceCluster(rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const created = [];
  const storeNames = tikvStoreNames(options.namePrefix, options.tikvStoreCount);
  const names = {
    pd: `${options.namePrefix}-pd`, tikv: storeNames[ZERO], tikvStores: storeNames,
    tidb: `${options.namePrefix}-tidb`, readiness: `${options.namePrefix}-sql-readiness`,
  };
  const runningOptions = {
    timeoutMs: options.readinessTimeoutMs, pollIntervalMs: options.readinessPollIntervalMs,
    signal: options.signal, deadlineAtMs: options.deadlineAtMs, now: options.now,
  };

  try {
    // DockerProvider.createContainer is the lifecycle owner for create + start
    // + running-state wait. This adapter must not issue a second start.
    const pd = await options.provider.createContainer({
      name: names.pd, image: options.images.pd, network: options.network,
      resourceLimits: options.resourceLimits, hostConfigExtras: networkHostConfig(options.network),
      command: [
        '--name=pd', `--client-urls=http://0.0.0.0:${DEFAULTS.pdClientPort}`,
        `--peer-urls=http://0.0.0.0:${DEFAULTS.pdPeerPort}`,
        `--advertise-client-urls=http://${names.pd}:${DEFAULTS.pdClientPort}`,
        `--advertise-peer-urls=http://${names.pd}:${DEFAULTS.pdPeerPort}`,
        `--initial-cluster=pd=http://${names.pd}:${DEFAULTS.pdPeerPort}`,
      ],
    });
    created.push(pd);
    await waitForContainerRunning(options.provider, pd.containerId, runningOptions);

    const tikvStores = await startTiKvStores(options, names, created, runningOptions);

    const tidb = await options.provider.createContainer({
      name: names.tidb, image: options.images.tidb, network: options.network,
      resourceLimits: options.resourceLimits, hostConfigExtras: networkHostConfig(options.network),
      command: [
        '--store=tikv', `--path=${names.pd}:${DEFAULTS.pdClientPort}`, '--host=0.0.0.0',
        `-P=${DEFAULTS.tidbPort}`, `--status=${DEFAULTS.tidbStatusPort}`,
      ],
    });
    created.push(tidb);
    await waitForContainerRunning(options.provider, tidb.containerId, runningOptions);

    const readinessClient = await options.provider.createContainer({
      name: names.readiness, image: options.images.mysqlClient, network: options.network,
      resourceLimits: options.readinessResourceLimits,
      hostConfigExtras: networkHostConfig(options.network),
      entrypoint: ['sleep'], command: [READINESS_CLIENT_KEEPALIVE_SECONDS],
    });
    created.push(readinessClient);
    await waitForContainerRunning(options.provider, readinessClient.containerId, runningOptions);

    const watchedContainers = watchedTopology(pd, tikvStores, tidb);
    const readinessSql = buildReadinessSql(options.tikvStoreCount);
    let readiness;
    try {
      readiness = await waitForSqlReady(
        options.provider,
        readinessClient.containerId,
        {host: names.tidb, port: DEFAULTS.tidbPort},
        {...runningOptions, watchedContainers, readinessSql},
      );
    } finally {
      await stopTiDbReferenceCluster(options.provider, [readinessClient]);
      created.pop();
    }

    return {
      images: options.images,
      names,
      containers: {
        pd,
        tikv: tikvStores[ZERO],
        tikvStores,
        tidb,
      },
      endpoints: {
        mysql: {host: names.tidb, port: DEFAULTS.tidbPort},
        status: {host: names.tidb, port: DEFAULTS.tidbStatusPort},
        pd: {host: names.pd, port: DEFAULTS.pdClientPort},
      },
      readiness: {
        ...readiness,
        tikvStoreCount: options.tikvStoreCount,
      },
      async stop() {
        await stopTiDbReferenceCluster(options.provider, created);
      },
    };
  } catch (error) {
    try {
      await stopTiDbReferenceCluster(options.provider, created);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'TiDB reference startup and cleanup both failed',
      );
    }
    throw error;
  }
}

export {
  DEFAULTS as TIDB_REFERENCE_DEFAULTS,
  buildReadinessSql as buildTiDbReferenceReadinessSql,
  sleep as sleepWithAbortSignal,
  startTiDbReferenceCluster,
  stopTiDbReferenceCluster,
  waitForSqlReady as waitForTiDbReferenceSqlReady,
};
