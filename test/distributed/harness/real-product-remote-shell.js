/**
 * The remote-shell seam of the comparative-benchmark deployers: everything a
 * deployer does on a host goes through the runner's `sshRun(host, opts,
 * command, timeoutMs)` (stdout, throws on a non-zero exit). This owner builds
 * the commands - quoted words, campaign-labelled `docker run`, HTTP requests
 * made from a named host with curl - and adapts the seam to the `provider`
 * interface the TiDB lifecycle and placement owners consume.
 */
import {
  BENCH_LABEL,
  DEPLOYMENT_FAILURE,
  deploymentFailure,
  requireCampaignId,
} from './real-product-deployment-contract.js';
import {
  arrayMap,
  numberIsFinite,
  numberIsInteger,
  numberIsSafeInteger,
  objectHasOwn,
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
const DEFAULT_INSPECT_TIMEOUT_MS = 10000;
const DEFAULT_LOGS_TIMEOUT_MS = 10000;
const DEFAULT_EXEC_TIMEOUT_MS = 10000;
const MS_PER_SECOND = 1000;
const MIN_CURL_TIMEOUT_SECONDS = 1;
const DIAGNOSTIC_LOG_TAIL = 80;
const SSH_EXIT_CODE_TRANSPORT_FAILURE = 255;
const DOCKER_EXIT_CODE_CLIENT_ERROR_MIN = 125;
const DOCKER_EXIT_CODE_COMMAND_NOT_FOUND = 127;

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
  return String(error?.stderr || error?.message || error);
}

function clipBodySnippet(payload, maxChars = HTTP_BODY_SNIPPET_MAX_CHARS) {
  const text = String(payload ?? '');
  if (text.length <= maxChars) {
    return {body: text, truncated: false, bodyLength: text.length};
  }
  return {
    body: `${stringSlice(text, 0, maxChars)}...`,
    truncated: true,
    bodyLength: text.length,
  };
}

function resolveNumericExitCode(rawCode) {
  if (rawCode === null || rawCode === undefined || rawCode === '') {
    return null;
  }
  const parsed = Number(rawCode);
  return numberIsSafeInteger(parsed) ? parsed : null;
}

function isAbortCommandError(error, message, lower) {
  if (error?.name === 'AbortError' || error?.aborted === true) {
    return true;
  }
  if (message === 'aborted') {
    return true;
  }
  return stringIncludes(lower, 'operation aborted') ||
    stringIncludes(lower, 'readiness probe aborted');
}

function isTimeoutCommandError(error, rawCode, lower) {
  if (error?.timedOut === true || rawCode === 'ETIMEDOUT') {
    return true;
  }
  return stringIncludes(lower, 'ssh timed out') ||
    stringIncludes(lower, 'command timed out') ||
    stringIncludes(lower, 'etimedout');
}

function isSshTransportCommandError(numericCode, lower) {
  if (numericCode === SSH_EXIT_CODE_TRANSPORT_FAILURE) {
    return true;
  }
  const trimmed = stringTrim(lower);
  return stringStartsWith(trimmed, 'ssh:') ||
    stringIncludes(lower, '\nssh:') ||
    stringIncludes(lower, 'kex_exchange_identification');
}

function isDockerDaemonCommandError(numericCode, lower) {
  if (stringIncludes(lower, 'curl: (')) {
    return false;
  }
  const clientCode = numericCode !== null &&
    numericCode >= DOCKER_EXIT_CODE_CLIENT_ERROR_MIN &&
    numericCode <= DOCKER_EXIT_CODE_COMMAND_NOT_FOUND;
  return clientCode ||
    stringIncludes(lower, 'cannot connect to the docker daemon') ||
    stringIncludes(lower, 'error response from daemon');
}

function classifyRemoteCommandError(error) {
  const message = errorText(error);
  const lower = stringToLowerCase(message);
  const rawCode = error?.exitCode ?? error?.code ?? null;
  const numericCode = resolveNumericExitCode(rawCode);
  const aborted = isAbortCommandError(error, message, lower);
  const deadlineExpired = error?.deadlineExpired === true ||
    stringIncludes(lower, 'deadline expired');
  const timedOut = isTimeoutCommandError(error, rawCode, lower);
  const isCurlFailure = stringIncludes(lower, 'curl: (');
  const sshTransport = isSshTransportCommandError(numericCode, lower);
  const dockerDaemon = isDockerDaemonCommandError(numericCode, lower);
  const transportError = !aborted && (sshTransport || timedOut || isCurlFailure);
  const infraCause = sshTransport || timedOut || dockerDaemon ||
    error?.observerInfrastructure === true;
  const observerInfrastructure = Boolean(!aborted && !deadlineExpired && infraCause);
  return {
    message,
    exitCode: rawCode,
    aborted,
    deadlineExpired,
    timedOut,
    transportError,
    observerInfrastructure,
  };
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
    return {
      status,
      body: payload,
      json: null,
      error: null,
      aborted: false,
      deadlineExpired: false,
      parseError: null,
      transportError: false,
      observerInfrastructure: false,
    };
  }
  try {
    return {
      status,
      json: JSON.parse(payload),
      error: null,
      aborted: false,
      deadlineExpired: false,
      parseError: null,
      transportError: false,
      observerInfrastructure: false,
    };
  } catch (parseErr) {
    const clipped = clipBodySnippet(payload);
    return {
      status,
      body: clipped.body,
      bodyTruncated: clipped.truncated,
      bodyLength: clipped.bodyLength,
      json: null,
      parseError: parseErr.message,
      error: `invalid_json_response: ${parseErr.message}`,
      aborted: false,
      deadlineExpired: false,
      transportError: false,
      observerInfrastructure: false,
    };
  }
}

async function httpFromHost({sshRun, opts, from, url, method = 'GET', body = undefined,
  basicAuth = undefined, signal = undefined, timeoutMs = undefined}) {
  const effectiveSignal = resolveEffectiveSignal(opts, signal);
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
  const {effectiveTimeoutMs, sshTimeoutMs} = boundedSshTimeoutMs(
    timeoutMs, HTTP_TIMEOUT_SECONDS * MS_PER_SECOND);
  const command = buildCurlHttpCommand({url, method, body, basicAuth, effectiveTimeoutMs});
  const callOpts = mergeCallOpts(opts, {signal: effectiveSignal, timeoutMs: sshTimeoutMs});
  try {
    const raw = await sshRun(from, callOpts, command, sshTimeoutMs);
    const {before: payload, value} = splitTrailer(String(raw ?? ''), HTTP_STATUS_MARKER);
    const status = value === null ? null : Number(value);
    if (value === null || !numberIsInteger(status)) {
      const clipped = clipBodySnippet(payload);
      return {
        status: null,
        body: clipped.body,
        bodyTruncated: clipped.truncated,
        bodyLength: clipped.bodyLength,
        json: null,
        parseError: null,
        error: 'missing_http_status_trailer',
        aborted: false,
        deadlineExpired: false,
        transportError: true,
        observerInfrastructure: false,
      };
    }
    return buildHttpJsonResponse(status, payload);
  } catch (error) {
    const classified = classifyRemoteCommandError(error);
    return {
      status: null,
      body: null,
      json: null,
      error: classified.message,
      aborted: classified.aborted,
      deadlineExpired: classified.deadlineExpired,
      parseError: null,
      transportError: classified.transportError,
      observerInfrastructure: classified.observerInfrastructure,
    };
  }
}

/**
 * Run a command and keep its exit status instead of throwing on it: the
 * status is printed after the command's own output.
 */
async function execWithStatus(sshRun, host, opts, command, timeoutMs = undefined,
  signal = undefined) {
  const callOpts = mergeCallOpts(opts, {signal, timeoutMs});
  const raw = String(await sshRun(host, callOpts,
    `${command}; printf '\\n${EXIT_MARKER}%s' "$?"`, timeoutMs) ?? '');
  const {before, value} = splitTrailer(raw, EXIT_MARKER);
  return {exitCode: value === null ? null : Number(value), stdout: before, stderr: ''};
}

function inspectContainerCommand(containerId) {
  return `docker inspect --type container --format '{{json .}}' ${shellWord(containerId)}`;
}

function inspectContainerStateCommand(containerId) {
  return `docker inspect --type container --format '{{json .State}}' ${shellWord(containerId)}`;
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
    execInContainer: (containerId, argv, callOptions = undefined) => {
      const {sshTimeoutMs} = boundedSshTimeoutMs(
        callOptions?.timeoutMs, DEFAULT_EXEC_TIMEOUT_MS);
      return execWithStatus(
        sshRun,
        host(containerId),
        opts,
        `docker exec ${shellWord(containerId)} ${arrayMap(argv, shellQuote).join(' ')}`,
        sshTimeoutMs,
        callOptions?.signal,
      );
    },
    inspectContainer: async (containerId, callOptions = undefined) => {
      const {sshTimeoutMs} = boundedSshTimeoutMs(
        callOptions?.timeoutMs, DEFAULT_INSPECT_TIMEOUT_MS);
      const effectiveCallOptions = {...(callOptions || {}), timeoutMs: sshTimeoutMs};
      return JSON.parse(await sshRun(
        host(containerId),
        mergeCallOpts(opts, effectiveCallOptions),
        inspectContainerCommand(containerId),
        sshTimeoutMs,
      ));
    },
    inspectContainerState: async (containerId, callOptions = undefined) => {
      const {sshTimeoutMs} = boundedSshTimeoutMs(
        callOptions?.timeoutMs, DEFAULT_INSPECT_TIMEOUT_MS);
      const effectiveCallOptions = {...(callOptions || {}), timeoutMs: sshTimeoutMs};
      return JSON.parse(await sshRun(
        host(containerId),
        mergeCallOpts(opts, effectiveCallOptions),
        inspectContainerStateCommand(containerId),
        sshTimeoutMs,
      ));
    },
    getContainerLogs: (containerId, {tail = DIAGNOSTIC_LOG_TAIL, signal = undefined,
      timeoutMs = undefined} = {}) => {
      const {sshTimeoutMs} = boundedSshTimeoutMs(timeoutMs, DEFAULT_LOGS_TIMEOUT_MS);
      return sshRun(
        host(containerId),
        mergeCallOpts(opts, {signal, timeoutMs: sshTimeoutMs}),
        `docker logs --tail ${tail} ${shellWord(containerId)} 2>&1`,
        sshTimeoutMs,
      );
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
      return Promise.reject(new Error('ssh operation aborted before start'));
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
        reject(new Error('ssh operation aborted'));
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
  createTrackedSshRun,
  dockerRunDetached,
  dockerRunOnceCommand,
  errorText,
  execWithStatus,
  httpFromHost,
  inspectContainerCommand,
  inspectContainerStateCommand,
  shellQuote,
  shellWord,
};
