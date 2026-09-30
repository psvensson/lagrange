import {randomUUID} from 'node:crypto';
import {types} from 'node:util';
import WebSocket from 'ws';
import {copyDenseOwnDataArray, copyStrictOwnDataRecord} from '../../src/utils/strict-own-data.js';
import {appendOwnArrayValue} from '../../src/utils/canonical-json-data.js';
import {
  DEFAULT_TARGET,
  DEFAULT_TIMEOUT_MS,
  MESSAGE_TYPE,
  WS_OPEN_STATE,
} from './examples-runner-constants.js';

const LOCAL_STR_ADMIN_EXAMPLES_SOCKET_CLOSED = 'Admin examples socket closed';
const ADMIN_EXAMPLES_ERROR_CODE = Object.freeze({
  CONNECT_TIMEOUT: 'ADMIN_CONNECT_TIMEOUT',
  RESPONSE_TIMEOUT: 'ADMIN_RESPONSE_TIMEOUT',
  CLIENT_CLOSED: 'ADMIN_CLIENT_CLOSED',
  CLOSE_TIMEOUT: 'ADMIN_CLOSE_TIMEOUT',
  INVALID_TIMEOUT: 'ADMIN_INVALID_TIMEOUT',
  EVIDENCE_UNAVAILABLE: 'ADMIN_CLEANUP_EVIDENCE_UNAVAILABLE',
});
const CLIENT_GENERATION_STATE = Object.freeze({
  OPENING: 'opening', OPEN: 'open', RETIRED: 'retired', CLOSED: 'closed',
});
const CLOSE_GRACE_BUDGET_DIVISOR = 2;
const NO_PRIMARY_FAILURE = Symbol('no primary failure');
const CLEANUP_FAILURES = new WeakMap();
const MAX_PLATFORM_TIMER_DELAY_MS = 2147483647;
const MAX_CLEANUP_EVIDENCE_RECORDS = 256;
const isProxy = types.isProxy;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const hasOwn = Object.hasOwn;
const isSafeInteger = Number.isSafeInteger;

function resolveLifetimeTimeout(value) {
  if (value === undefined || value === null || value === 0) return DEFAULT_TIMEOUT_MS;
  if (!isSafeInteger(value) || value < 1 || value > MAX_PLATFORM_TIMER_DELAY_MS) {
    throw Object.assign(new RangeError('Admin timeout must be a positive platform timer duration'), {
      code: ADMIN_EXAMPLES_ERROR_CODE.INVALID_TIMEOUT,
    });
  }
  return value;
}

function isObjectValue(value) {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function normalizeCleanupFailure(value) {
  if (isObjectValue(value)) return value;
  return new Error('Admin session cleanup rejected a non-Error value', {cause: value});
}

/** Return cleanup evidence without mutating even a frozen primary Error. */
function getAdminCleanupFailure(error) {
  return CLEANUP_FAILURES.get(error) || null;
}

function diagnosticScalar(value) {
  if (value === undefined || value === null || typeof value === 'string') return value;
  if (typeof value === 'number' && isSafeInteger(value)) return value;
  throw new TypeError('Cleanup diagnostics require scalar own data');
}

function ownCleanupData(value, key) {
  if (!isObjectValue(value) || isProxy(value)) throw new TypeError('Opaque cleanup evidence');
  const descriptor = getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!hasOwn(descriptor, 'value')) throw new TypeError('Cleanup accessors are not evidence');
  return descriptor.value;
}

function boundedCleanupArray(value) {
  const length = ownCleanupData(value, 'length');
  if (!isSafeInteger(length) || length < 0 || length > MAX_CLEANUP_EVIDENCE_RECORDS) {
    throw new RangeError('Cleanup evidence exceeds its projection budget');
  }
  const copy = copyDenseOwnDataArray(value);
  if (copy === null) throw new TypeError('Cleanup evidence requires dense own-data arrays');
  return copy;
}

function hasSeenCleanup(seen, value) {
  for (let index = 0; index < seen.length; index += 1) {
    if (seen[index] === value) return true;
  }
  return false;
}

function generationFailureDetails(generations) {
  if (generations === undefined) return undefined;
  const rows = boundedCleanupArray(generations);
  const result = [];
  const count = rows.length;
  for (let index = 0; index < count; index += 1) {
    const entry = copyStrictOwnDataRecord(rows[index]);
    if (!entry) throw new TypeError('Generation evidence requires own-data records');
    appendOwnArrayValue(result, Object.freeze({
      generation: diagnosticScalar(entry.generation), target: diagnosticScalar(entry.target),
      readyState: diagnosticScalar(entry.readyState),
    }));
  }
  return Object.freeze(result);
}

function cleanupFailureDetail(error) {
  const generations = ownCleanupData(error, 'generations');
  return Object.freeze({
    message: diagnosticScalar(ownCleanupData(error, 'message')),
    code: diagnosticScalar(ownCleanupData(error, 'code')),
    target: diagnosticScalar(ownCleanupData(error, 'target')),
    timeoutMs: diagnosticScalar(ownCleanupData(error, 'timeoutMs')),
    deadlineMs: diagnosticScalar(ownCleanupData(error, 'deadlineMs')),
    generations: generationFailureDetails(generations),
  });
}

function projectCleanupFailure(cleanup) {
  if (isProxy(cleanup)) throw new TypeError('Opaque cleanup evidence');
  if (!(cleanup instanceof AggregateError)) return cleanupFailureDetail(cleanup);
  const failures = [];
  const pending = [cleanup];
  const seen = [];
  let visited = 0;
  while (pending.length) {
    if (++visited > MAX_CLEANUP_EVIDENCE_RECORDS) throw new RangeError('Cleanup projection budget');
    const index = pending.length - 1;
    const current = normalizeCleanupFailure(pending[index]);
    pending.length = index;
    if (isProxy(current)) throw new TypeError('Opaque cleanup evidence');
    if (hasSeenCleanup(seen, current)) continue;
    appendOwnArrayValue(seen, current);
    if (current instanceof AggregateError) {
      const errors = boundedCleanupArray(ownCleanupData(current, 'errors'));
      for (let index = errors.length - 1; index >= 0; index -= 1) {
        appendOwnArrayValue(pending, errors[index]);
      }
    } else {
      appendOwnArrayValue(failures, cleanupFailureDetail(current));
    }
  }
  return Object.freeze({
    message: diagnosticScalar(ownCleanupData(cleanup, 'message')), failures: Object.freeze(failures),
  });
}

/** Project every aggregate leaf without letting a diagnostic accessor replace the failure. */
function getAdminCleanupFailureReport(error) {
  const cleanup = getAdminCleanupFailure(error);
  if (!cleanup) return null;
  try {
    return projectCleanupFailure(cleanup);
  } catch {
    return Object.freeze({
      message: 'Admin cleanup evidence could not be projected',
      code: ADMIN_EXAMPLES_ERROR_CODE.EVIDENCE_UNAVAILABLE,
    });
  }
}

/** Incomplete cleanup vetoes retry/degradation without rewriting the primary. */
function rethrowIfAdminCleanupIncomplete(error) {
  if (CLEANUP_FAILURES.has(error)) throw error;
}

/** Own an admin session through operation completion and actual socket close. */
async function withAdminWsClient(client, operation) {
  let primary = NO_PRIMARY_FAILURE;
  let value;
  try {
    value = await operation(client);
  } catch (error) {
    primary = error;
  }
  try {
    await client.close();
  } catch (failure) {
    const cleanup = normalizeCleanupFailure(failure);
    if (primary === NO_PRIMARY_FAILURE) {
      CLEANUP_FAILURES.set(cleanup, cleanup);
      throw cleanup;
    }
    if (!isObjectValue(primary)) {
      const combined = new AggregateError([primary, cleanup], 'Admin operation and cleanup failed');
      CLEANUP_FAILURES.set(combined, cleanup);
      throw combined;
    }
    const previous = CLEANUP_FAILURES.get(primary);
    CLEANUP_FAILURES.set(primary, previous ?
      new AggregateError([previous, cleanup], 'Admin session cleanup failures') : cleanup);
  }
  if (primary !== NO_PRIMARY_FAILURE) throw primary;
  return value;
}

function clientClosedError() {
  return Object.assign(new Error(LOCAL_STR_ADMIN_EXAMPLES_SOCKET_CLOSED), {
    code: ADMIN_EXAMPLES_ERROR_CODE.CLIENT_CLOSED,
  });
}
// Typed error-envelope fields the admin API forwards on a failed query
// result; each one present on the frame rides on the rejected Error so a
// caller can report which participants failed and why, not only the message.
const ADMIN_QUERY_RESULT_ERROR_FIELDS = Object.freeze([
  'errorCode',
  'details',
  'participantFailures',
  'firstFailedParticipant',
  'participantFailuresOmittedCount',
]);

function buildAdminQueryResultError(message) {
  const error = new Error(message.error);
  for (const field of ADMIN_QUERY_RESULT_ERROR_FIELDS) {
    if (message[field] !== undefined) {
      error[field] = message[field];
    }
  }
  return error;
}

function buildAdminConnectTimeoutError(target, timeoutMs) {
  const error = new Error(
    `Timed out opening admin websocket: ${target}`,
  );
  error.code = ADMIN_EXAMPLES_ERROR_CODE.CONNECT_TIMEOUT;
  error.deferRetry = true;
  error.target = target;
  error.timeoutMs = timeoutMs;
  return error;
}

function buildAdminResponseTimeoutError(queryId, timeoutMs) {
  const error = new Error(
    `Timed out waiting for admin response: ${queryId}`,
  );
  error.code = ADMIN_EXAMPLES_ERROR_CODE.RESPONSE_TIMEOUT;
  error.deferRetry = true;
  error.queryId = queryId;
  error.timeoutMs = timeoutMs;
  return error;
}

/**
 * Admin websocket client used by the examples runner.
 */
class AdminWsClient {
  #closeTimeoutMs;
  #current = null;
  #owned = new Set();
  #closing = null;
  #pending = new Map();
  #generationSequence = 0;

  /**
   * @param {{target?: string, timeoutMs?: number}} options
   */
  constructor(options = {}) {
    this.target = options.target || DEFAULT_TARGET;
    this.timeoutMs = resolveLifetimeTimeout(options.timeoutMs);
    // Request budgets may shrink after connect; socket retirement policy is
    // captured once, including ws's constructor-only graceful close setting.
    this.#closeTimeoutMs = this.timeoutMs;
  }

  // Diagnostic projections are never consulted as lifecycle authority. In
  // particular the pending snapshot contains no completion callbacks/timers.
  get pending() {
    return new Map([...this.#pending.keys()].map((queryId) =>
      [queryId, Object.freeze({queryId})]));
  }

  get socket() {
    return this.#current?.state === CLIENT_GENERATION_STATE.OPEN ?
      this.#current.socket : null;
  }

  get openingSocket() {
    return this.#current?.state === CLIENT_GENERATION_STATE.OPENING ?
      this.#current.socket : null;
  }

  get socketReady() {
    return this.#current?.state === CLIENT_GENERATION_STATE.OPENING ?
      this.#current.opening.promise : null;
  }

  /**
   * Connect the client to the admin websocket endpoint.
   *
   * @return {Promise<WebSocket>}
   */
  async connect() {
    return this.#connectGeneration().opening.promise;
  }

  #connectGeneration() {
    if (this.#closing && !this.#closing.done) throw this.#closing.reason;
    const incomplete = [...this.#owned].find((generation) => generation.closeFailure);
    if (incomplete) throw incomplete.closeFailure;
    if (this.#current?.state === CLIENT_GENERATION_STATE.OPEN &&
        this.#current.socket.readyState !== WS_OPEN_STATE) {
      this.#retireGeneration(this.#current, clientClosedError(), false);
    }
    if (this.#current) return this.#current;
    const timeoutMs = resolveLifetimeTimeout(this.timeoutMs);
    this.#closing = null;
    const generation = {
      id: ++this.#generationSequence,
      target: this.target,
      state: CLIENT_GENERATION_STATE.OPENING,
      socket: null,
      opening: Promise.withResolvers(),
      openTimer: null,
      closeTimer: null,
      closeDeadline: Infinity,
      closeFailure: null,
      reason: null,
    };
    this.#current = generation;
    this.#owned.add(generation);
    this.#acquireSocket(generation, timeoutMs);
    return generation;
  }

  #acquireSocket(generation, timeoutMs) {
    try {
      generation.socket = new WebSocket(generation.target, {
        // ws owns its graceful close handshake and force-disposes its TCP
        // socket inside our total completion budget. No second handshake loop.
        closeTimeout: this.#closeTimeoutMs / CLOSE_GRACE_BUDGET_DIVISOR,
      });
    } catch (error) {
      generation.opening.reject(error);
      this.#onSocketClose(generation, null, null);
      return;
    }
    this.#bindSocket(generation);
    generation.openTimer = setTimeout(() => {
      this.#retireGeneration(generation,
        buildAdminConnectTimeoutError(generation.target, timeoutMs), false);
    }, timeoutMs);
  }

  /**
   * Close socket and reject all pending requests.
   *
   * Successful completion means every owned websocket emitted CLOSE. CLOSE
   * codes are retained verbatim; abnormal closure is not a claim about who
   * forced it. A missed completion deadline is a typed cleanup failure.
   * @return {Promise<Object>}
   */
  close() {
    if (this.#closing && (!this.#closing.done || !this.#closing.error)) {
      return this.#closing.completion.promise;
    }
    const closing = {
      completion: Promise.withResolvers(), reason: clientClosedError(), done: false,
      remaining: new Set(this.#owned), outcomes: [], timer: null, error: null,
    };
    this.#closing = closing;
    const deadlineMs = Date.now() + this.#closeTimeoutMs;
    closing.timer = setTimeout(() => {
      closing.timer = null;
      closing.done = true;
      closing.error = this.#closeTimeoutError(closing.remaining, deadlineMs);
      closing.completion.reject(closing.error);
      for (const generation of closing.remaining) {
        generation.closeFailure = closing.error;
        generation.socket.terminate();
      }
    }, this.#closeTimeoutMs);
    for (const generation of closing.remaining) {
      this.#retireGeneration(generation, closing.reason, true, deadlineMs);
    }
    this.#finishClose();
    return closing.completion.promise;
  }

  #finishClose() {
    const closing = this.#closing;
    if (!closing || closing.done || closing.remaining.size) return;
    closing.done = true;
    clearTimeout(closing.timer);
    closing.timer = null;
    closing.completion.resolve(Object.freeze({
      outcome: CLIENT_GENERATION_STATE.CLOSED,
      sockets: Object.freeze(closing.outcomes),
    }));
  }

  #closeTimeoutError(generations, deadlineMs) {
    const remaining = [...generations];
    const targets = new Set(remaining.map((generation) => generation.target));
    const error = Object.assign(new Error('Admin websocket close was not observed'), {
      code: ADMIN_EXAMPLES_ERROR_CODE.CLOSE_TIMEOUT,
      target: targets.size === 1 ? remaining[0].target : null,
      timeoutMs: this.#closeTimeoutMs, deadlineMs,
      generations: Object.freeze(remaining.map((generation) => Object.freeze({
        generation: generation.id, target: generation.target,
        readyState: generation.socket.readyState,
      }))),
    });
    CLEANUP_FAILURES.set(error, error);
    return error;
  }

  #retireGeneration(generation, reason, graceful, deadlineMs) {
    if (generation.state === CLIENT_GENERATION_STATE.CLOSED) return;
    const wasRetired = generation.state === CLIENT_GENERATION_STATE.RETIRED;
    generation.state = CLIENT_GENERATION_STATE.RETIRED;
    generation.reason ||= reason;
    clearTimeout(generation.openTimer);
    generation.openTimer = null;
    generation.opening.reject(generation.reason);
    this.#rejectPending(generation.reason, generation);
    if (this.#current === generation) this.#current = null;
    if (this.#closing && !this.#closing.done && this.#closing.remaining.has(generation)) {
      // Explicit close adopts automatic retirement observation into its one
      // captured deadline. A generation must not fire a competing watchdog.
      clearTimeout(generation.closeTimer);
      generation.closeTimer = null;
      generation.closeDeadline = deadlineMs;
    } else {
      this.#boundClose(generation, deadlineMs);
    }
    if (wasRetired) return;
    const socket = generation.socket;
    if (graceful && socket.readyState === WS_OPEN_STATE) {
      socket.close();
    } else {
      socket.terminate();
    }
  }

  #boundClose(generation, deadlineMs = Date.now() + this.#closeTimeoutMs) {
    if (generation.closeDeadline <= deadlineMs) return;
    clearTimeout(generation.closeTimer);
    generation.closeDeadline = deadlineMs;
    generation.closeTimer = setTimeout(() => {
      generation.closeTimer = null;
      if (generation.state === CLIENT_GENERATION_STATE.CLOSED) return;
      generation.closeFailure = this.#closeTimeoutError([generation], deadlineMs);
      // Never claim CLOSED or forget the socket on timeout. Retain ownership
      // and its CLOSE listener, while giving the caller a bounded failure.
      generation.socket.terminate();
    }, Math.max(0, deadlineMs - Date.now()));
  }

  /**
   * Submit a SQL query request over admin websocket.
   *
   * @param {string} sql
   * @param {Array} params
   * @return {Promise<Object>}
   */
  async query(sql, params = []) {
    return this.#sendRequest({
      type: MESSAGE_TYPE.QUERY,
      sql,
      params,
    });
  }

  /**
   * Execute partition callback request over admin websocket.
   *
   * @param {Object} payload
   * @return {Promise<Object>}
   */
  async partitionCallback(payload) {
    return this.#sendRequest({
      type: MESSAGE_TYPE.PARTITION_CALLBACK,
      statement: payload.statement,
      parameters: payload.parameters || [],
      callbackModuleRef: payload.callbackModuleRef,
      callbackExport: payload.callbackExport,
      runtimeKind: payload.runtimeKind,
    });
  }

  /**
   * Send a request and await the matching `query_result` frame.
   *
   * @param {Object} payload
   * @return {Promise<Object>}
   * @private
   */
  async #sendRequest(payload) {
    const generation = this.#connectGeneration();
    const socket = await generation.opening.promise;
    this.#assertRequestGeneration(generation);
    const queryId = `examples-${Date.now()}-${randomUUID()}`;
    const timeoutMs = resolveLifetimeTimeout(this.timeoutMs);
    // Serialization can synchronously execute caller toJSON/getter code.
    // Complete it before the last admission fence and before owning a timer.
    const frame = JSON.stringify({...payload, queryId, timeoutMs});
    this.#assertRequestGeneration(generation);

    return new Promise((resolve, reject) => {
      const pending = {resolve, reject, timeout: null, generation};
      const timeout = setTimeout(() => {
        if (this.#pending.get(queryId) !== pending) return;
        this.#pending.delete(queryId);
        reject(buildAdminResponseTimeoutError(queryId, timeoutMs));
      }, timeoutMs);

      pending.timeout = timeout;
      this.#pending.set(queryId, pending);

      try {
        socket.send(frame);
      } catch (error) {
        this.#pending.delete(queryId);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  #assertRequestGeneration(generation) {
    if (generation === this.#current && generation.state === CLIENT_GENERATION_STATE.OPEN &&
        generation.socket.readyState === WS_OPEN_STATE) return;
    const reason = generation.reason || clientClosedError();
    if (generation === this.#current) this.#retireGeneration(generation, reason, false);
    throw reason;
  }

  /**
   * Bind one generation from allocation, including pre-OPEN errors and close.
   *
   * @param {Object} generation
   * @private
   */
  #bindSocket(generation) {
    const socket = generation.socket;
    const onOpen = () => {
      if (generation.state !== CLIENT_GENERATION_STATE.OPENING) return;
      clearTimeout(generation.openTimer);
      generation.openTimer = null;
      generation.state = CLIENT_GENERATION_STATE.OPEN;
      generation.opening.resolve(socket);
    };
    const onMessage = (data) => {
      if (generation !== this.#current || generation.state !== CLIENT_GENERATION_STATE.OPEN) return;
      let parsed = null;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      this.#handleMessage(generation, parsed);
    };
    const onError = (error) => {
      if (generation.state === CLIENT_GENERATION_STATE.CLOSED ||
          generation.state === CLIENT_GENERATION_STATE.RETIRED) return;
      this.#retireGeneration(generation, error, false);
    };
    const onClose = (code, reason) => this.#onSocketClose(generation, code, reason);
    generation.listeners = {open: onOpen, message: onMessage, error: onError, close: onClose};
    for (const [event, listener] of Object.entries(generation.listeners)) {
      socket.on(event, listener);
    }
  }

  #onSocketClose(generation, code, reason) {
    if (generation.state === CLIENT_GENERATION_STATE.CLOSED) return;
    generation.state = CLIENT_GENERATION_STATE.CLOSED;
    generation.reason ||= clientClosedError();
    clearTimeout(generation.openTimer);
    clearTimeout(generation.closeTimer);
    generation.openTimer = null;
    generation.closeTimer = null;
    generation.opening.reject(generation.reason);
    this.#rejectPending(generation.reason, generation);
    if (this.#current === generation) this.#current = null;
    for (const [event, listener] of Object.entries(generation.listeners || {})) {
      generation.socket.off(event, listener);
    }
    this.#owned.delete(generation);
    generation.closeFailure = null;
    this.#observeGenerationClose(generation, code, reason);
  }

  #observeGenerationClose(generation, code, reason) {
    if (this.#closing?.remaining.delete(generation) && !this.#closing.done) {
      this.#closing.outcomes.push(Object.freeze({
        generation: generation.id, code, reason: reason?.toString() || null,
      }));
      this.#finishClose();
    }
    if (!this.#owned.size && this.#closing?.error) this.#closing = null;
  }

  /**
   * Route response frames to the corresponding pending request promise.
   *
   * @param {Object} generation
   * @param {Object} message
   * @private
   */
  #handleMessage(generation, message) {
    if (!message || message.type !== MESSAGE_TYPE.QUERY_RESULT) {
      return;
    }

    const pending = this.#pending.get(message.queryId);
    if (!pending || pending.generation !== generation) {
      return;
    }

    this.#pending.delete(message.queryId);
    clearTimeout(pending.timeout);

    if (message.error) {
      pending.reject(buildAdminQueryResultError(message));
      return;
    }

    pending.resolve(message);
  }

  /**
   * Reject all pending request promises.
   *
   * @param {Error} error
   * @param {Object} generation
   * @private
   */
  #rejectPending(error, generation) {
    for (const [queryId, pending] of this.#pending) {
      if (pending.generation !== generation) continue;
      this.#pending.delete(queryId);
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
  }
}

export {
  AdminWsClient, withAdminWsClient, getAdminCleanupFailure, getAdminCleanupFailureReport,
  rethrowIfAdminCleanupIncomplete,
};
