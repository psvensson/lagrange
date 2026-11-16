/**
 * The remote-shell seam of the comparative-benchmark deployers: everything a
 * deployer does on a host goes through the runner's `sshRun(host, opts,
 * command, timeoutMs)` (stdout, throws on a non-zero exit). This owner builds
 * the commands - quoted words, campaign-labelled `docker run`, HTTP requests
 * made from a named host with curl - and adapts the seam to the `provider`
 * interface the TiDB lifecycle and placement owners consume.
 */
import {execFile} from 'node:child_process';
import {
  BENCH_LABEL,
  DEFAULT_INSPECT_TIMEOUT_MS,
  DEPLOYMENT_FAILURE,
  deploymentFailure,
  requireCampaignId,
} from './real-product-deployment-contract.js';
import {
  MapConstructor,
  arrayIsArray,
  arrayMap,
  mapGet,
  numberIsFinite,
  numberIsInteger,
  numberIsSafeInteger,
  objectHasOwn,
  promiseAllSettled,
  stringIncludes,
  stringLastIndexOf,
  stringReplace,
  stringSlice,
  stringSplit,
  stringStartsWith,
  stringToLowerCase,
  stringTrim,
} from './real-product-captured-intrinsics.js';

const SAFE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/u;
const SINGLE_QUOTE = '\'';
const ESCAPED_SINGLE_QUOTE = '\'\\\'\'';
const HTTP_STATUS_MARKER = 'http_status=';
const EXIT_MARKER = '__exit_code=';
// A campaign container runs only from an image already on the host: a run
// never pulls (owner decision D1, 2026-11-14); placing images is provisioning.
const NEVER_PULL = '--pull=never';
const HTTP_TIMEOUT_SECONDS = 10;
const HTTP_MAX_FILESIZE_BYTES = 1024 * 1024;
const HTTP_BODY_SNIPPET_MAX_CHARS = 512;
const SSH_TRANSPORT_GRACE_MS = 2000;
const DEFAULT_LOGS_TIMEOUT_MS = 10000;
const DEFAULT_EXEC_TIMEOUT_MS = 10000;
const DEFAULT_SSH_TIMEOUT_MS = 120000;
const DEFAULT_SSH_MAX_BUFFER = 64 * 1024 * 1024;
const MS_PER_SECOND = 1000;
const MIN_CURL_TIMEOUT_SECONDS = 1;
const DIAGNOSTIC_LOG_TAIL = 80;
const SSH_EXIT_CODE_TRANSPORT_FAILURE = 255;
const DOCKER_EXIT_CODE_CLIENT_ERROR_MIN = 125;
const DOCKER_EXIT_CODE_COMMAND_NOT_FOUND = 127;
const MAXBUFFER_ERROR_CODE = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
const ABORT_ERROR_CODE = 'ABORT_ERR';
const REJECTION_PRIORITY_TERMINAL = 4;
const REJECTION_PRIORITY_ABORTED = 3;
const REJECTION_PRIORITY_DEADLINE = 2;
const REJECTION_PRIORITY_INFRA = 1;
const REJECTION_PRIORITY_DEFAULT = 0;
const LOCAL_INFRA_ERROR_CODES = Object.freeze(new Set([
  'ENOENT', 'EACCES', 'EAGAIN', 'EMFILE', 'ENFILE', 'ENOMEM', 'EPIPE',
  'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', MAXBUFFER_ERROR_CODE,
]));

function shellQuote(value) {
  return `${SINGLE_QUOTE}${stringSplit(String(value), SINGLE_QUOTE).join(ESCAPED_SINGLE_QUOTE)}` +
    SINGLE_QUOTE;
}

function shellWord(value) {
  const text = String(value);
  return SAFE_WORD.test(text) ? text : shellQuote(text);
}

// Output followed by `MARKER<value>` on its own last line.
function splitTrailer(text, marker) {
  const at = stringLastIndexOf(text, marker);
  if (at < 0) return {before: text, value: null};
  return {before: stringReplace(text.slice(0, at), /\n$/u, ''),
    value: stringTrim(text.slice(at + marker.length))};
}

function errorText(error) {
  const stderr = typeof error?.stderr === 'string' ? stringTrim(error.stderr) : '';
  const message = typeof error?.message === 'string' ? stringTrim(error.message) : '';
  if (stderr && message) {
    if (stringIncludes(stderr, message)) return stderr;
    if (stringIncludes(message, stderr)) return message;
    return `${message}; stderr: ${stderr}`;
  }
  return String(stderr || message || error);
}

function clipBodySnippet(payload, maxChars = HTTP_BODY_SNIPPET_MAX_CHARS) {
  const text = String(payload ?? '');
  if (text.length <= maxChars) return {body: text, truncated: false, bodyLength: text.length};
  return {body: `${stringSlice(text, 0, maxChars)}...`, truncated: true, bodyLength: text.length};
}

function resolveNumericExitCode(rawCode) {
  if (rawCode === null || rawCode === undefined || rawCode === '') return null;
  const parsed = Number(rawCode);
  return numberIsSafeInteger(parsed) ? parsed : null;
}

function isAbortCommandError(error, rawCode, message, lower) {
  if (error?.name === 'AbortError' || error?.aborted === true || rawCode === ABORT_ERROR_CODE) {
    return true;
  }
  return message === 'aborted' ||
    stringIncludes(lower, 'operation aborted') ||
    stringIncludes(lower, 'readiness probe aborted');
}

function isTimeoutCommandError(error, rawCode, aborted, lower) {
  if (aborted) return false;
  if (error?.timedOut === true || rawCode === 'ETIMEDOUT') return true;
  if (error?.killed === true && rawCode !== MAXBUFFER_ERROR_CODE) return true;
  return stringIncludes(lower, 'ssh timed out') ||
    stringIncludes(lower, 'ssh command timed out') ||
    stringIncludes(lower, 'command timed out') ||
    stringIncludes(lower, 'etimedout');
}

function isLocalProcessCommandError(error, rawCode, numericCode, aborted) {
  if (aborted) return false;
  if (typeof error?.syscall === 'string' && stringStartsWith(error.syscall, 'spawn')) return true;
  if (typeof rawCode === 'string' && LOCAL_INFRA_ERROR_CODES.has(rawCode)) return true;
  return numericCode === null && typeof error?.signal === 'string' && error.signal !== '';
}

function isSshTransportCommandError(numericCode, lower) {
  if (numericCode === SSH_EXIT_CODE_TRANSPORT_FAILURE) return true;
  const trimmed = stringTrim(lower);
  return stringStartsWith(trimmed, 'ssh:') ||
    stringIncludes(lower, '\nssh:') ||
    stringIncludes(lower, 'stderr: ssh:') ||
    stringIncludes(lower, 'kex_exchange_identification');
}

function isDockerDaemonCommandError(numericCode, lower) {
  if (stringIncludes(lower, 'curl: (')) return false;
  const clientCode = numericCode !== null &&
    numericCode >= DOCKER_EXIT_CODE_CLIENT_ERROR_MIN &&
    numericCode <= DOCKER_EXIT_CODE_COMMAND_NOT_FOUND;
  return clientCode ||
    stringIncludes(lower, 'cannot connect to the docker daemon') ||
    stringIncludes(lower, 'error response from daemon');
}

function resolveRawCommandExitCode(error) {
  return error?.exitCode ?? error?.code ?? null;
}

function isDeadlineExpiredError(error, aborted, lower) {
  if (aborted) return false;
  return error?.deadlineExpired === true || stringIncludes(lower, 'deadline expired');
}

function computeRemoteTransportAndInfra({
  error,
  aborted,
  deadlineExpired,
  sshTransport,
  timedOut,
  localProcess,
  isCurlFailure,
  dockerDaemon,
}) {
  const baseInfra = sshTransport || timedOut || localProcess;
  const transportError = Boolean(
    !aborted && (baseInfra || isCurlFailure || error?.transportError === true),
  );
  const infraCause = baseInfra || dockerDaemon || error?.observerInfrastructure === true;
  const observerInfrastructure = Boolean(!aborted && !deadlineExpired && infraCause);
  return {transportError, observerInfrastructure};
}

function classifyRemoteCommandError(error) {
  const message = errorText(error);
  const lower = stringToLowerCase(message);
  const rawCode = resolveRawCommandExitCode(error);
  const numericCode = resolveNumericExitCode(rawCode);
  const aborted = isAbortCommandError(error, rawCode, message, lower);
  const deadlineExpired = isDeadlineExpiredError(error, aborted, lower);
  const timedOut = isTimeoutCommandError(error, rawCode, aborted, lower);
  const localProcess = isLocalProcessCommandError(error, rawCode, numericCode, aborted);
  const isCurlFailure = stringIncludes(lower, 'curl: (');
  const sshTransport = isSshTransportCommandError(numericCode, lower);
  const dockerDaemon = isDockerDaemonCommandError(numericCode, lower);
  const {transportError, observerInfrastructure} = computeRemoteTransportAndInfra({
    error, aborted, deadlineExpired, sshTransport, timedOut, localProcess,
    isCurlFailure, dockerDaemon,
  });
  return {message, exitCode: rawCode, aborted, deadlineExpired, timedOut, transportError,
    observerInfrastructure};
}

function createAbortCommandError(message) {
  return Object.assign(new Error(message), {
    name: 'AbortError', code: ABORT_ERROR_CODE, aborted: true, deadlineExpired: false,
    timedOut: false, transportError: false, observerInfrastructure: false,
  });
}

function createDeadlineExpiredCommandError(message) {
  return Object.assign(new Error(message), {
    aborted: false, deadlineExpired: true, timedOut: false,
    transportError: false, observerInfrastructure: false,
  });
}

function tagClassifiedRemoteError(error) {
  const classified = classifyRemoteCommandError(error);
  const err = error instanceof Error ? error : new Error(classified.message);
  if (classified.message && err.message !== classified.message) err.message = classified.message;
  Object.assign(err, {
    aborted: classified.aborted,
    deadlineExpired: classified.deadlineExpired,
    timedOut: classified.timedOut,
    transportError: classified.transportError,
    observerInfrastructure: classified.observerInfrastructure,
    ...(classified.timedOut ? {killed: true} : {}),
  });
  if (classified.aborted && err.name !== 'AbortError') err.name = 'AbortError';
  return err;
}

function boundedSshTimeoutMs(requestedTimeoutMs, defaultTimeoutMs) {
  const hasFinite = numberIsFinite(requestedTimeoutMs);
  const effectiveTimeoutMs = hasFinite ?
    Math.min(defaultTimeoutMs, Math.max(1, Math.floor(requestedTimeoutMs))) :
    defaultTimeoutMs;
  const cappedRequestedMs = hasFinite ?
    Math.min(Math.floor(requestedTimeoutMs), effectiveTimeoutMs + SSH_TRANSPORT_GRACE_MS) :
    null;
  const sshTimeoutMs = cappedRequestedMs !== null ?
    Math.max(1, cappedRequestedMs) :
    effectiveTimeoutMs + SSH_TRANSPORT_GRACE_MS;
  return {hasFinite, effectiveTimeoutMs, sshTimeoutMs};
}

function resolveEffectiveSignal(opts, signal) {
  if (signal !== undefined) return signal;
  if (opts && objectHasOwn(opts, 'signal')) return opts.signal;
  return undefined;
}

function mergeCallOpts(opts, {signal = undefined, timeoutMs = undefined} = {}) {
  const effectiveSignal = resolveEffectiveSignal(opts, signal);
  if (effectiveSignal === undefined && timeoutMs === undefined) return opts;
  return {
    ...(opts || {}),
    ...(effectiveSignal !== undefined ? {signal: effectiveSignal} : {}),
    ...(numberIsFinite(timeoutMs) ? {timeoutMs} : {}),
  };
}

/**
 * One HTTP request made FROM `from` (the host whose view matters, normally the
 * load-generator host) with curl. Never throws: a transport failure is a
 * `{status: null, error}` answer the caller decides on.
 */
function buildCurlHttpCommand({url, method, body, basicAuth, effectiveTimeoutMs}) {
  const curlTimeoutSeconds = Math.max(MIN_CURL_TIMEOUT_SECONDS,
    Math.ceil(effectiveTimeoutMs / MS_PER_SECOND));
  const words = ['curl', '-sS', '--max-time', String(curlTimeoutSeconds),
    '--max-filesize', String(HTTP_MAX_FILESIZE_BYTES)];
  if (method !== 'GET') words.push('-X', method);
  if (basicAuth !== undefined) {
    words.push('-u', shellQuote(`${basicAuth.user}:${basicAuth.password}`));
  }
  if (body !== undefined) {
    words.push('-H', shellQuote('content-type: application/json'),
      '--data', shellQuote(JSON.stringify(body)));
  }
  words.push('-w', shellQuote(`\\n${HTTP_STATUS_MARKER}%{http_code}`), shellQuote(url));
  return words.join(' ');
}

function buildHttpJsonResponse(status, payload) {
  if (!payload) {
    return {status, body: payload, json: null, error: null, aborted: false,
      deadlineExpired: false, parseError: null, transportError: false,
      observerInfrastructure: false};
  }
  try {
    return {status, json: JSON.parse(payload), error: null, aborted: false,
      deadlineExpired: false, parseError: null, transportError: false,
      observerInfrastructure: false};
  } catch (parseErr) {
    const clipped = clipBodySnippet(payload);
    return {status, body: clipped.body, bodyTruncated: clipped.truncated,
      bodyLength: clipped.bodyLength, json: null, parseError: parseErr.message,
      error: `invalid_json_response: ${parseErr.message}`, aborted: false,
      deadlineExpired: false, transportError: false, observerInfrastructure: false};
  }
}

function precheckHttpFromHost(effectiveSignal, timeoutMs) {
  if (effectiveSignal?.aborted) {
    return {status: null, body: null, json: null, error: 'aborted',
      aborted: true, deadlineExpired: false, parseError: null,
      transportError: false, observerInfrastructure: false};
  }
  if (numberIsFinite(timeoutMs) && timeoutMs <= 0) {
    return {status: null, body: null, json: null, error: 'deadline_expired',
      aborted: false, deadlineExpired: true, parseError: null,
      transportError: false, observerInfrastructure: false};
  }
  return null;
}

function decodeCurlRawOutput(raw) {
  const {before: payload, value} = splitTrailer(String(raw ?? ''), HTTP_STATUS_MARKER);
  const status = value === null ? null : Number(value);
  if (value === null || !numberIsInteger(status)) {
    const clipped = clipBodySnippet(payload);
    return {status: null, body: clipped.body, bodyTruncated: clipped.truncated,
      bodyLength: clipped.bodyLength, json: null, parseError: null,
      error: 'missing_http_status_trailer', aborted: false, deadlineExpired: false,
      transportError: true, observerInfrastructure: false};
  }
  return buildHttpJsonResponse(status, payload);
}

async function httpFromHost({sshRun, opts, from, url, method = 'GET', body = undefined,
  basicAuth = undefined, signal = undefined, timeoutMs = undefined}) {
  const effectiveSignal = resolveEffectiveSignal(opts, signal);
  const early = precheckHttpFromHost(effectiveSignal, timeoutMs);
  if (early !== null) return early;
  const {effectiveTimeoutMs, sshTimeoutMs} = boundedSshTimeoutMs(
    timeoutMs, HTTP_TIMEOUT_SECONDS * MS_PER_SECOND);
  const command = buildCurlHttpCommand({url, method, body, basicAuth, effectiveTimeoutMs});
  const callOpts = mergeCallOpts(opts, {signal: effectiveSignal, timeoutMs: sshTimeoutMs});
  try {
    const raw = await sshRun(from, callOpts, command, sshTimeoutMs);
    return decodeCurlRawOutput(raw);
  } catch (error) {
    const classified = classifyRemoteCommandError(error);
    return {status: null, body: null, json: null, error: classified.message,
      aborted: classified.aborted, deadlineExpired: classified.deadlineExpired,
      parseError: null, transportError: classified.transportError,
      observerInfrastructure: classified.observerInfrastructure};
  }
}

function isDockerClientExitCode(exitCode) {
  return exitCode !== null &&
    exitCode >= DOCKER_EXIT_CODE_CLIENT_ERROR_MIN &&
    exitCode <= DOCKER_EXIT_CODE_COMMAND_NOT_FOUND;
}

function buildStatusResult(raw) {
  const {before, value} = splitTrailer(raw, EXIT_MARKER);
  const exitCode = value === null ? null : Number(value);
  return {
    exitCode,
    stdout: before,
    stderr: '',
    ...(isDockerClientExitCode(exitCode) ? {observerInfrastructure: true} : {}),
  };
}

/**
 * Run a command and keep its exit status instead of throwing on it: the
 * status is printed after the command's own output.
 */
async function execWithStatus(sshRun, host, opts, command, timeoutMs = undefined,
  signal = undefined) {
  const effectiveSignal = assertProviderCallPreconditions(opts, {signal, timeoutMs});
  const callOpts = mergeCallOpts(opts, {signal: effectiveSignal, timeoutMs});
  let raw;
  try {
    raw = String(await sshRun(host, callOpts,
      `${command}; printf '\\n${EXIT_MARKER}%s' "$?"`, timeoutMs) ?? '');
  } catch (error) {
    throw tagClassifiedRemoteError(error);
  }
  return buildStatusResult(raw);
}

function inspectContainerCommand(containerId) {
  return `docker inspect --type container --format '{{json .}}' ${shellWord(containerId)}`;
}

function inspectContainerStateCommand(containerId) {
  return `docker inspect --type container --format '{{json .State}}' ${shellWord(containerId)}`;
}

function assertProviderCallPreconditions(opts, callOptions) {
  const effectiveSignal = resolveEffectiveSignal(opts, callOptions?.signal);
  if (effectiveSignal?.aborted) {
    throw createAbortCommandError('docker provider operation aborted');
  }
  if (numberIsFinite(callOptions?.timeoutMs) && callOptions.timeoutMs <= 0) {
    throw createDeadlineExpiredCommandError('docker provider operation deadline expired');
  }
  return effectiveSignal;
}

function parseProviderInspectJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const parseErr = new Error(`docker inspect answered invalid JSON: ${error.message}`);
    parseErr.parseError = true;
    parseErr.observerInfrastructure = true;
    throw parseErr;
  }
}

/**
 * The `provider` the TiDB lifecycle/placement owners consume
 * (execInContainer, inspectContainer, inspectContainerState, getContainerLogs),
 * over ssh. `hostOf` names the host a container runs on.
 */
function createRemoteDockerProvider({sshRun, opts, hostOf}) {
  const host = (containerId) => {
    const found = hostOf(containerId);
    if (!found) throw new Error(`no host recorded for container ${containerId}`);
    return found;
  };
  return Object.freeze({
    execInContainer: async (containerId, argv, callOptions = undefined) => {
      const effectiveSignal = assertProviderCallPreconditions(opts, callOptions);
      const {sshTimeoutMs} = boundedSshTimeoutMs(
        callOptions?.timeoutMs, DEFAULT_EXEC_TIMEOUT_MS);
      return execWithStatus(
        sshRun,
        host(containerId),
        opts,
        `docker exec ${shellWord(containerId)} ${arrayMap(argv, shellQuote).join(' ')}`,
        sshTimeoutMs,
        effectiveSignal,
      );
    },
    inspectContainer: async (containerId, callOptions = undefined) => {
      const effectiveSignal = assertProviderCallPreconditions(opts, callOptions);
      const {sshTimeoutMs} = boundedSshTimeoutMs(
        callOptions?.timeoutMs, DEFAULT_INSPECT_TIMEOUT_MS);
      const effectiveCallOptions = {signal: effectiveSignal, timeoutMs: sshTimeoutMs};
      let raw;
      try {
        raw = await sshRun(
          host(containerId),
          mergeCallOpts(opts, effectiveCallOptions),
          inspectContainerCommand(containerId),
          sshTimeoutMs,
        );
      } catch (error) {
        throw tagClassifiedRemoteError(error);
      }
      return parseProviderInspectJson(raw);
    },
    inspectContainerState: async (containerId, callOptions = undefined) => {
      const effectiveSignal = assertProviderCallPreconditions(opts, callOptions);
      const {sshTimeoutMs} = boundedSshTimeoutMs(
        callOptions?.timeoutMs, DEFAULT_INSPECT_TIMEOUT_MS);
      const effectiveCallOptions = {signal: effectiveSignal, timeoutMs: sshTimeoutMs};
      let raw;
      try {
        raw = await sshRun(
          host(containerId),
          mergeCallOpts(opts, effectiveCallOptions),
          inspectContainerStateCommand(containerId),
          sshTimeoutMs,
        );
      } catch (error) {
        throw tagClassifiedRemoteError(error);
      }
      return parseProviderInspectJson(raw);
    },
    getContainerLogs: async (containerId, {tail = DIAGNOSTIC_LOG_TAIL, signal = undefined,
      timeoutMs = undefined} = {}) => {
      const effectiveSignal = assertProviderCallPreconditions(opts, {signal, timeoutMs});
      const {sshTimeoutMs} = boundedSshTimeoutMs(timeoutMs, DEFAULT_LOGS_TIMEOUT_MS);
      try {
        return await sshRun(
          host(containerId),
          mergeCallOpts(opts, {signal: effectiveSignal, timeoutMs: sshTimeoutMs}),
          `docker logs --tail ${tail} ${shellWord(containerId)} 2>&1`,
          sshTimeoutMs,
        );
      } catch (error) {
        throw tagClassifiedRemoteError(error);
      }
    },
  });
}

/**
 * Start one campaign-labelled product container and return its full id. The
 * name and both labels are the only handles cleanup and evidence use.
 */
async function dockerRunDetached({sshRun, opts, host, campaignId, role, ordinal = 1, image,
  dockerArgs = [], commandArgs = []}) {
  requireCampaignId(campaignId);
  const name = `bench-${campaignId}-${role}-${ordinal}`;
  const command = ['docker run -d', '--name', name,
    '--label', `${BENCH_LABEL.CAMPAIGN}=${campaignId}`, '--label', `${BENCH_LABEL.ROLE}=${role}`,
    '--network host', NEVER_PULL, ...arrayMap(dockerArgs, shellWord), shellWord(image),
    ...arrayMap(commandArgs, shellWord)].join(' ');
  let out;
  try {
    out = await sshRun(host, opts, command);
  } catch (error) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.DEPLOYMENT_COMMAND_FAILED,
      `docker run of ${role} on ${host} failed: ${errorText(error)}`, {host, role, image});
  }
  const containerId = stringSplit(stringTrim(String(out ?? '')), /\s+/u).pop();
  if (!/^[0-9a-f]{12,64}$/u.test(containerId || '')) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.DEPLOYMENT_COMMAND_FAILED,
      `docker run of ${role} on ${host} returned no container id`, {host, role, out});
  }
  return {role, host, name, containerId, image};
}

/**
 * A one-shot, campaign-labelled client container on `host` (psql, mysql):
 * `docker run --rm`, so its lifetime is the command's.
 */
function dockerRunOnceCommand({campaignId, image, dockerArgs = [], commandArgs = []}) {
  requireCampaignId(campaignId);
  return ['docker run --rm', '--label', `${BENCH_LABEL.CAMPAIGN}=${campaignId}`,
    '--network host', NEVER_PULL, ...arrayMap(dockerArgs, shellWord), shellWord(image),
    ...arrayMap(commandArgs, shellWord)].join(' ');
}

/**
 * Track arbitrary asynchronous operations in a Set so callers can await
 * settlement of all in-flight work (`settleInFlight()`) before tearing down
 * containers or exiting a stage after cancellation.
 */
function createInFlightTracker() {
  const inFlightOps = new Set();
  const trackInFlight = (promiseOrFn) => {
    const opPromise = typeof promiseOrFn === 'function' ?
      Promise.resolve().then(promiseOrFn) : Promise.resolve(promiseOrFn);
    inFlightOps.add(opPromise);
    opPromise.finally(() => {
      inFlightOps.delete(opPromise);
    }).catch(() => {});
    return opPromise;
  };
  const settleInFlight = async () => {
    while (inFlightOps.size > 0) {
      await Promise.allSettled([...inFlightOps]);
    }
  };
  return {trackInFlight, settleInFlight, inFlightOps};
}

function rejectionPriority(reason) {
  if (reason?.terminal === true) return REJECTION_PRIORITY_TERMINAL;
  if (reason?.aborted === true || reason?.name === 'AbortError') {
    return REJECTION_PRIORITY_ABORTED;
  }
  if (reason?.deadlineExpired === true) return REJECTION_PRIORITY_DEADLINE;
  if (reason?.observerInfrastructure === true) return REJECTION_PRIORITY_INFRA;
  return REJECTION_PRIORITY_DEFAULT;
}

async function settleConcurrentBatch(items, runItem, settleInFlight = null) {
  const list = arrayIsArray(items) ? items : [...(items || [])];
  const settled = await promiseAllSettled(
    arrayMap(list, (item, index) => Promise.resolve().then(() => runItem(item, index))),
  );
  if (typeof settleInFlight === 'function') {
    await settleInFlight();
  }
  let hasRejection = false;
  let bestPriority = -1;
  let chosenReason = null;
  const values = [];
  for (const outcome of settled) {
    if (outcome.status === 'rejected') {
      const priority = rejectionPriority(outcome.reason);
      if (!hasRejection || priority > bestPriority) {
        hasRejection = true;
        bestPriority = priority;
        chosenReason = outcome.reason;
      }
    } else {
      values.push(outcome.value);
    }
  }
  if (hasRejection) {
    throw chosenReason;
  }
  return values;
}

function sshOptions(opts = {}) {
  return ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    ...(opts?.sshKey ? ['-i', opts.sshKey] : [])];
}

function didSshChildTimeOut({signal, timedOutByWrapper, child, error}) {
  if (signal?.aborted) return false;
  if (timedOutByWrapper) return true;
  return child?.killed === true && error?.code !== MAXBUFFER_ERROR_CODE;
}

function buildWrapperTimeoutError({boundedTimeoutMs, target, command, child, outText, errText}) {
  return Object.assign(
    new Error(`Command timed out after ${boundedTimeoutMs}ms: ssh ${target} ${command}`),
    {
      code: child?.exitCode ?? 0,
      signal: child?.signalCode ?? 'SIGTERM',
      killed: true,
      timedOut: true,
      aborted: false,
      deadlineExpired: false,
      stdout: outText,
      stderr: errText,
      transportError: true,
      observerInfrastructure: true,
    },
  );
}

function settleSshExecCallback({
  error,
  stdout,
  stderr,
  signal,
  timedOutByWrapper,
  child,
  boundedTimeoutMs,
  target,
  command,
  resolve,
  reject,
}) {
  const outText = String(stdout ?? '');
  const errText = String(stderr ?? '');
  const childTimedOut = didSshChildTimeOut({signal, timedOutByWrapper, child, error});
  if (!error && childTimedOut) {
    reject(buildWrapperTimeoutError({boundedTimeoutMs, target, command, child, outText, errText}));
    return;
  }
  if (error) {
    if (error.stdout === undefined) error.stdout = outText;
    if (error.stderr === undefined) error.stderr = errText;
    if (childTimedOut) Object.assign(error, {timedOut: true, killed: true});
    reject(tagClassifiedRemoteError(error));
    return;
  }
  resolve(stringTrim(outText));
}

function executeSshCommand({execFileImpl, target, command, sshOpts, signal,
  boundedTimeoutMs, maxBuffer}) {
  if (signal?.aborted) {
    return Promise.reject(createAbortCommandError('ssh operation aborted before start'));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOutByWrapper = false;
    let child = null;
    const wrapperTimer = numberIsFinite(boundedTimeoutMs) && boundedTimeoutMs > 0 ?
      setTimeout(() => {
        timedOutByWrapper = true;
        if (child && typeof child.kill === 'function') child.kill('SIGTERM');
      }, boundedTimeoutMs) : null;
    const execArgs = [...sshOptions(sshOpts), target, command];
    const execOptions = {timeout: boundedTimeoutMs, maxBuffer, ...(signal ? {signal} : {})};
    child = execFileImpl('ssh', execArgs, execOptions, (error, stdout = '', stderr = '') => {
      if (settled) return;
      settled = true;
      if (wrapperTimer !== null) clearTimeout(wrapperTimer);
      settleSshExecCallback({
        error, stdout, stderr, signal, timedOutByWrapper, child,
        boundedTimeoutMs, target, command, resolve, reject,
      });
    });
  });
}

function resolveRunnerTarget(targetOf, ip, callOpts) {
  const target = targetOf !== null ? mapGet(targetOf, ip) : (callOpts?.sshTarget || ip);
  if (!target) throw new Error(`host ${ip} is not part of this campaign`);
  return target;
}

function resolveRunnerSignal(baseOpts, callOpts) {
  if (callOpts && objectHasOwn(callOpts, 'signal')) return callOpts.signal;
  if (baseOpts && objectHasOwn(baseOpts, 'signal')) return baseOpts.signal;
  return undefined;
}

function resolveRunnerTimeoutMs(callOpts, timeoutMs, defaultTimeoutMs) {
  const effectiveDefaultMs = numberIsFinite(timeoutMs) ?
    Math.max(1, Math.floor(timeoutMs)) : defaultTimeoutMs;
  if (!numberIsFinite(callOpts?.timeoutMs)) return effectiveDefaultMs;
  return Math.max(1, Math.min(effectiveDefaultMs, Math.floor(callOpts.timeoutMs)));
}

function createSshCommandRunner({
  hosts = null,
  opts: baseOpts = undefined,
  execFileImpl = execFile,
  defaultTimeoutMs = DEFAULT_SSH_TIMEOUT_MS,
  maxBuffer = DEFAULT_SSH_MAX_BUFFER,
} = {}) {
  const targetOf = arrayIsArray(hosts) ?
    new MapConstructor(arrayMap(hosts, (host) => [host.ip, host.sshTarget || host.ip])) : null;
  return async (ip, callOpts = {}, command = '', timeoutMs = defaultTimeoutMs) => {
    const target = resolveRunnerTarget(targetOf, ip, callOpts);
    const signal = resolveRunnerSignal(baseOpts, callOpts);
    const boundedTimeoutMs = resolveRunnerTimeoutMs(callOpts, timeoutMs, defaultTimeoutMs);
    const sshOpts = callOpts?.sshKey ? callOpts : (baseOpts || callOpts || {});
    return executeSshCommand({execFileImpl, target, command, sshOpts, signal,
      boundedTimeoutMs, maxBuffer});
  };
}

/**
 * Wrap `sshRun` to track in-flight remote operations in a Set, forward the
 * active AbortSignal, and reject immediately when `signal` aborts while an
 * operation is in flight. `settleInFlight()` awaits all underlying operations
 * via `Promise.allSettled` before container cleanup runs.
 */
function createTrackedSshRun(sshRun, defaultSignal = null) {
  const {trackInFlight, settleInFlight, inFlightOps} = createInFlightTracker();
  const trackedSshRun = (host, callOpts, command, timeoutMs) => {
    const hasExplicitSignal = Boolean(callOpts && objectHasOwn(callOpts, 'signal'));
    const signal = hasExplicitSignal ? callOpts.signal : (defaultSignal ?? null);
    if (signal?.aborted) {
      return Promise.reject(createAbortCommandError('ssh operation aborted before start'));
    }
    const effectiveOpts = hasExplicitSignal ? callOpts :
      (signal && (!callOpts || callOpts.signal !== signal) ?
        {...(callOpts || {}), signal} : callOpts);
    const opPromise = trackInFlight(() =>
      sshRun(host, effectiveOpts, command, timeoutMs));
    if (!signal) return opPromise;
    return new Promise((resolve, reject) => {
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        reject(createAbortCommandError('ssh operation aborted'));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, {once: true});
      opPromise.then(
        (value) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  };
  return {trackedSshRun, trackInFlight, settleInFlight, inFlightOps};
}

export {
  classifyRemoteCommandError,
  createInFlightTracker,
  createRemoteDockerProvider,
  createSshCommandRunner,
  createTrackedSshRun,
  dockerRunDetached,
  dockerRunOnceCommand,
  errorText,
  execWithStatus,
  httpFromHost,
  inspectContainerCommand,
  inspectContainerStateCommand,
  settleConcurrentBatch,
  shellQuote,
  shellWord,
  sshOptions,
};
