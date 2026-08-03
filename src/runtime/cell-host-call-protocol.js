/**
 * Worker-to-parent synchronous host-call protocol owner for the request
 * Cell `call-binding` host import (the "Bridge The Synchronous WASM
 * Import To The Async Invoker" contract in
 * docs/development/http-endpoint-distributed-call-composition-brief.md).
 *
 * Both sides of the protocol live here — the blocking worker-side client
 * (`Atomics.wait` on the WORKER thread only, never the parent) and the
 * async parent-side responder — so the shared-buffer layout, message
 * types, bounds, and typed error taxonomy have exactly one owner.
 *
 * Wire shape: the worker writes the bounded request into the shared
 * buffer, posts a named `host_call_request` message carrying only the
 * request id, and blocks on the control word. The parent resolves the
 * call through the injected async delegate, writes the bounded response
 * (or typed failure) into the shared buffer, flips the control word with
 * a compare-exchange (so a stale write can never satisfy a later call),
 * and wakes the worker with `Atomics.notify`.
 */

const BYTE_ENCODING = 'utf8';

// Named message types (worker -> parent). The parent's answer travels
// through the SharedArrayBuffer, never through postMessage.
const HOST_CALL_MESSAGE = Object.freeze({
  REQUEST: 'host_call_request',
});

// Closed typed-failure code set for bridged binding calls. Extends the
// two worker-owned refusal codes (call_bridge_unavailable /
// not_available_in_call_mode) that fire before a bridge exists. The
// request-call bridge owner maps invoker failures onto these codes.
const HOST_CALL_ERROR_CODE = Object.freeze({
  CALL_BRIDGE_UNAVAILABLE: 'call_bridge_unavailable',
  DEADLINE_EXHAUSTED: 'deadline_exhausted',
  INVALID_ARGUMENTS: 'invalid_arguments',
  NOT_AVAILABLE_IN_CALL_MODE: 'not_available_in_call_mode',
  PROTOCOL_VIOLATION: 'protocol_violation',
  RECURSION_REFUSED: 'recursion_refused',
  RESPONSE_TOO_LARGE: 'response_too_large',
  TARGET_FAILED: 'target_failed',
  TARGET_NOT_ALLOWED: 'target_not_allowed',
  TARGET_NOT_INVOCABLE: 'target_not_invocable',
  TARGET_UNAVAILABLE: 'target_unavailable',
});

const HOST_CALL_KNOWN_CODES =
  Object.freeze(new Set(Object.values(HOST_CALL_ERROR_CODE)));

// Canonical retryability map: only a transiently-unavailable target is
// worth retrying; every other refusal is terminal for this invocation.
const HOST_CALL_RETRYABLE_CODES =
  Object.freeze(new Set([HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE]));

// Control-word states for HOST_CALL_SLOT.STATE.
const HOST_CALL_STATE = Object.freeze({
  IDLE: 0,
  PENDING: 1,
  RESPONDED: 2,
});

const HOST_CALL_RESPONSE_KIND = Object.freeze({
  NONE: 0,
  OK: 1,
  TYPED_FAILURE: 2,
});

// Int32 control slots at the head of the shared buffer. REQUEST_ID is
// the live-request epoch: the client bumps it for every call AND on
// deadline expiry (poisoning), so a late parent write for a dead request
// fails both the pre-write id check and the PENDING compare-exchange.
// RESPONSE_REQUEST_ID lets the woken client refuse a stale response.
const HOST_CALL_SLOT = Object.freeze({
  STATE: 0,
  REQUEST_ID: 1,
  REQUEST_LENGTH: 2,
  RESPONSE_REQUEST_ID: 3,
  RESPONSE_KIND: 4,
  RESPONSE_LENGTH: 5,
});
const HOST_CALL_CONTROL_SLOTS = 8;

const HOST_CALL_MAX_REQUEST_BYTES = 65536;
const HOST_CALL_MAX_RESPONSE_BYTES = 262144;
const HOST_CALL_REQUEST_OFFSET =
  HOST_CALL_CONTROL_SLOTS * Int32Array.BYTES_PER_ELEMENT;
const HOST_CALL_RESPONSE_OFFSET =
  HOST_CALL_REQUEST_OFFSET + HOST_CALL_MAX_REQUEST_BYTES;
const HOST_CALL_BUFFER_BYTES =
  HOST_CALL_RESPONSE_OFFSET + HOST_CALL_MAX_RESPONSE_BYTES;

// One outstanding host call per request Cell, and one bridged binding
// call per invocation: a second nested call refuses recursion_refused.
const MAX_OUTSTANDING_HOST_CALLS = 1;
const MAX_NESTED_BINDING_CALLS = 1;

const HOST_CALL_MAX_BINDING_NAME_CHARS = 256;
const HOST_CALL_MAX_FAILURE_MESSAGE_CHARS = 1024;
// Conservative wait bound used when an invocation carries no absolute
// deadline, so the worker-side Atomics.wait can never hang forever.
const HOST_CALL_DEFAULT_WAIT_BUDGET_MS = 5000;

const HOST_CALL_FAILURE_MESSAGE = Object.freeze({
  DEADLINE_EXHAUSTED:
    'Binding call deadline exhausted before the parent responded',
  INVALID_ARGUMENTS:
    'Binding call name or arguments exceed the host-call protocol bounds',
  PROTOCOL_VIOLATION:
    'Binding call refused: host-call shared state violated the protocol',
  RECURSION_REFUSED:
    'Binding call refused: nested binding-call budget exhausted',
  RESPONSE_TOO_LARGE:
    'Binding call response exceeds the bounded host-call response size',
  TARGET_FAILED: 'Binding call target failed',
});

const HOST_CALL_CONTRACT_MESSAGE = Object.freeze({
  DELEGATE_REQUIRED: 'host-call responder delegate must be a function',
  DESCRIPTOR_INVALID:
    'host-call descriptor must carry the protocol-sized SharedArrayBuffer',
  POST_TO_PARENT_REQUIRED:
    'host-call client postToParent must be a function',
});

// Responder outcome statuses (observable by tests and diagnostics; the
// blocked worker only ever sees the shared-buffer state).
const HOST_CALL_RESPONDER_STATUS = Object.freeze({
  DROPPED_RETIRED: 'dropped_retired',
  DROPPED_STALE: 'dropped_stale',
  FAILED: 'responder_failed',
  RESPONDED: 'responded',
});

function isHostCallCodeRetryable(code) {
  return HOST_CALL_RETRYABLE_CODES.has(code);
}

function hostCallFailureRecord(code, message) {
  return Object.freeze({
    code,
    message: String(message).slice(0, HOST_CALL_MAX_FAILURE_MESSAGE_CHARS),
    retryable: isHostCallCodeRetryable(code),
  });
}

// Thrown-error shape matches the worker's typed binding-call denies:
// jco lifts `error.payload` into the WIT `binding-call-error` record.
function createHostCallFailure(record) {
  const error = new Error(record.message);
  error.payload = record;
  return error;
}

function createHostCallDescriptor() {
  return Object.freeze({
    buffer: new SharedArrayBuffer(HOST_CALL_BUFFER_BYTES),
  });
}

function hostCallViews(descriptor) {
  if (!(descriptor?.buffer instanceof SharedArrayBuffer) ||
      descriptor.buffer.byteLength !== HOST_CALL_BUFFER_BYTES) {
    throw new TypeError(HOST_CALL_CONTRACT_MESSAGE.DESCRIPTOR_INVALID);
  }
  return {
    control: new Int32Array(descriptor.buffer, 0, HOST_CALL_CONTROL_SLOTS),
    requestBytes: new Uint8Array(
      descriptor.buffer,
      HOST_CALL_REQUEST_OFFSET,
      HOST_CALL_MAX_REQUEST_BYTES,
    ),
    responseBytes: new Uint8Array(
      descriptor.buffer,
      HOST_CALL_RESPONSE_OFFSET,
      HOST_CALL_MAX_RESPONSE_BYTES,
    ),
  };
}

function encodeHostCallRequest(name, argumentsJson) {
  if (typeof name !== 'string' || name.length === 0 ||
      name.length > HOST_CALL_MAX_BINDING_NAME_CHARS ||
      typeof argumentsJson !== 'string') {
    return null;
  }
  const encoded = Buffer.from(
    JSON.stringify({argumentsJson, name}),
    BYTE_ENCODING,
  );
  return encoded.byteLength > HOST_CALL_MAX_REQUEST_BYTES ? null : encoded;
}

function clearHostCallResponseSlots(control) {
  Atomics.store(control, HOST_CALL_SLOT.RESPONSE_REQUEST_ID, 0);
  Atomics.store(control, HOST_CALL_SLOT.RESPONSE_KIND,
    HOST_CALL_RESPONSE_KIND.NONE);
  Atomics.store(control, HOST_CALL_SLOT.RESPONSE_LENGTH, 0);
}

// Blocking wait loop (WORKER THREAD ONLY). Handles spurious wakes by
// re-checking the control word; on deadline expiry it poisons the
// request id so a late parent write is dropped, releases the slot, and
// throws the typed deadline failure.
function awaitHostCallResponse(control, deadlineMs, now) {
  while (Atomics.load(control, HOST_CALL_SLOT.STATE) ===
      HOST_CALL_STATE.PENDING) {
    const remainingMs = deadlineMs - now();
    if (remainingMs <= 0) {
      Atomics.add(control, HOST_CALL_SLOT.REQUEST_ID, 1);
      Atomics.store(control, HOST_CALL_SLOT.STATE, HOST_CALL_STATE.IDLE);
      throw createHostCallFailure(hostCallFailureRecord(
        HOST_CALL_ERROR_CODE.DEADLINE_EXHAUSTED,
        HOST_CALL_FAILURE_MESSAGE.DEADLINE_EXHAUSTED,
      ));
    }
    Atomics.wait(control, HOST_CALL_SLOT.STATE, HOST_CALL_STATE.PENDING,
      remainingMs);
  }
}

function decodeHostCallTypedFailure(text) {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (typeof parsed?.code !== 'string' ||
      typeof parsed?.message !== 'string') {
    return createHostCallFailure(hostCallFailureRecord(
      HOST_CALL_ERROR_CODE.PROTOCOL_VIOLATION,
      HOST_CALL_FAILURE_MESSAGE.PROTOCOL_VIOLATION,
    ));
  }
  return createHostCallFailure(Object.freeze({
    code: parsed.code,
    message: parsed.message,
    retryable: parsed.retryable === true,
  }));
}

function readHostCallResponse(control, responseBytes, requestId) {
  const respondedId =
    Atomics.load(control, HOST_CALL_SLOT.RESPONSE_REQUEST_ID);
  const kind = Atomics.load(control, HOST_CALL_SLOT.RESPONSE_KIND);
  const length = Atomics.load(control, HOST_CALL_SLOT.RESPONSE_LENGTH);
  clearHostCallResponseSlots(control);
  Atomics.store(control, HOST_CALL_SLOT.REQUEST_LENGTH, 0);
  Atomics.store(control, HOST_CALL_SLOT.STATE, HOST_CALL_STATE.IDLE);
  const kindKnown = kind === HOST_CALL_RESPONSE_KIND.OK ||
    kind === HOST_CALL_RESPONSE_KIND.TYPED_FAILURE;
  if (respondedId !== requestId || !kindKnown ||
      length < 0 || length > HOST_CALL_MAX_RESPONSE_BYTES) {
    throw createHostCallFailure(hostCallFailureRecord(
      HOST_CALL_ERROR_CODE.PROTOCOL_VIOLATION,
      HOST_CALL_FAILURE_MESSAGE.PROTOCOL_VIOLATION,
    ));
  }
  const text =
    Buffer.from(responseBytes.slice(0, length)).toString(BYTE_ENCODING);
  if (kind === HOST_CALL_RESPONSE_KIND.OK) return text;
  throw decodeHostCallTypedFailure(text);
}

function performHostCall(views, encoded, deadlineMs, now, postToParent) {
  const {control, requestBytes, responseBytes} = views;
  const requestId =
    (Atomics.add(control, HOST_CALL_SLOT.REQUEST_ID, 1) + 1) | 0;
  clearHostCallResponseSlots(control);
  requestBytes.set(encoded, 0);
  Atomics.store(control, HOST_CALL_SLOT.REQUEST_LENGTH, encoded.byteLength);
  Atomics.store(control, HOST_CALL_SLOT.STATE, HOST_CALL_STATE.PENDING);
  postToParent({requestId, type: HOST_CALL_MESSAGE.REQUEST});
  awaitHostCallResponse(control, deadlineMs, now);
  return readHostCallResponse(control, responseBytes, requestId);
}

/**
 * Worker-side blocking client. `call(name, argumentsJson)` returns the
 * parent's result string or throws a typed failure whose `error.payload`
 * is the WIT `binding-call-error` record. MUST only run on a worker
 * thread: it blocks in `Atomics.wait` until the parent responds or the
 * absolute deadline expires.
 *
 * @param {object} options
 * @param {{buffer: SharedArrayBuffer}} options.descriptor
 * @param {(message: object) => void} options.postToParent
 * @param {number} [options.deadlineMs] absolute epoch-ms deadline;
 *   absent -> now + HOST_CALL_DEFAULT_WAIT_BUDGET_MS
 * @param {() => number} [options.nowProvider]
 * @param {number} [options.maxCalls] per-invocation bridged-call budget
 *   (defaults to MAX_NESTED_BINDING_CALLS)
 * @return {{call: (name: string, argumentsJson: string) => string}}
 */
function createWorkerHostCallClient(options) {
  const views = hostCallViews(options.descriptor);
  const postToParent = options.postToParent;
  if (typeof postToParent !== 'function') {
    throw new TypeError(HOST_CALL_CONTRACT_MESSAGE.POST_TO_PARENT_REQUIRED);
  }
  const now = typeof options.nowProvider === 'function' ?
    options.nowProvider :
    Date.now;
  const deadlineMs = Number.isFinite(options.deadlineMs) ?
    options.deadlineMs :
    now() + HOST_CALL_DEFAULT_WAIT_BUDGET_MS;
  const maxCalls =
    Number.isSafeInteger(options.maxCalls) && options.maxCalls > 0 ?
      options.maxCalls :
      MAX_NESTED_BINDING_CALLS;
  let callsStarted = 0;
  let outstanding = 0;
  return Object.freeze({
    call(name, argumentsJson) {
      if (callsStarted >= maxCalls ||
          outstanding >= MAX_OUTSTANDING_HOST_CALLS) {
        throw createHostCallFailure(hostCallFailureRecord(
          HOST_CALL_ERROR_CODE.RECURSION_REFUSED,
          HOST_CALL_FAILURE_MESSAGE.RECURSION_REFUSED,
        ));
      }
      callsStarted += 1;
      const encoded = encodeHostCallRequest(name, argumentsJson);
      if (encoded === null) {
        throw createHostCallFailure(hostCallFailureRecord(
          HOST_CALL_ERROR_CODE.INVALID_ARGUMENTS,
          HOST_CALL_FAILURE_MESSAGE.INVALID_ARGUMENTS,
        ));
      }
      outstanding += 1;
      try {
        return performHostCall(views, encoded, deadlineMs, now,
          postToParent);
      } finally {
        outstanding -= 1;
      }
    },
  });
}

function readHostCallRequest(control, requestBytes) {
  const length = Atomics.load(control, HOST_CALL_SLOT.REQUEST_LENGTH);
  if (length <= 0 || length > HOST_CALL_MAX_REQUEST_BYTES) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(
      Buffer.from(requestBytes.slice(0, length)).toString(BYTE_ENCODING),
    );
  } catch {
    parsed = null;
  }
  if (typeof parsed?.name !== 'string' ||
      typeof parsed?.argumentsJson !== 'string') {
    return null;
  }
  return parsed;
}

// Normalize the async delegate outcome to {ok} | {failure}. A throw
// carrying a KNOWN typed code keeps its (bounded) message; any unknown
// throw maps to the fixed target_failed record so parent-side internals
// never leak into the guest.
async function executeHostCallDelegate(delegate, request) {
  let value;
  try {
    value = await delegate({
      argumentsJson: request.argumentsJson,
      name: request.name,
    });
  } catch (error) {
    const thrownCode = error?.code;
    if (typeof thrownCode === 'string' &&
        HOST_CALL_KNOWN_CODES.has(thrownCode) &&
        thrownCode !== HOST_CALL_ERROR_CODE.TARGET_FAILED) {
      return {failure: hostCallFailureRecord(thrownCode, error.message)};
    }
    return {
      failure: hostCallFailureRecord(
        HOST_CALL_ERROR_CODE.TARGET_FAILED,
        HOST_CALL_FAILURE_MESSAGE.TARGET_FAILED,
      ),
    };
  }
  if (typeof value === 'string') return {ok: value};
  return {
    failure: hostCallFailureRecord(
      HOST_CALL_ERROR_CODE.TARGET_FAILED,
      HOST_CALL_FAILURE_MESSAGE.TARGET_FAILED,
    ),
  };
}

function encodeHostCallOutcome(outcome) {
  if (outcome.ok !== undefined) {
    const bytes = Buffer.from(outcome.ok, BYTE_ENCODING);
    if (bytes.byteLength <= HOST_CALL_MAX_RESPONSE_BYTES) {
      return {bytes, kind: HOST_CALL_RESPONSE_KIND.OK};
    }
    return {
      bytes: Buffer.from(JSON.stringify(hostCallFailureRecord(
        HOST_CALL_ERROR_CODE.RESPONSE_TOO_LARGE,
        HOST_CALL_FAILURE_MESSAGE.RESPONSE_TOO_LARGE,
      )), BYTE_ENCODING),
      kind: HOST_CALL_RESPONSE_KIND.TYPED_FAILURE,
    };
  }
  return {
    bytes: Buffer.from(JSON.stringify(outcome.failure), BYTE_ENCODING),
    kind: HOST_CALL_RESPONSE_KIND.TYPED_FAILURE,
  };
}

/**
 * Parent-side async responder for one invocation's host-call channel.
 * `handleRequest(message)` never throws; it resolves to a status from
 * HOST_CALL_RESPONDER_STATUS. `retire()` closes the channel so any late
 * delegate completion is dropped instead of touching the shared buffer.
 *
 * @param {object} options
 * @param {{buffer: SharedArrayBuffer}} options.descriptor
 * @param {(call: {name: string, argumentsJson: string}) =>
 *   Promise<string>} options.delegate
 * @param {{warn?: Function}} [options.logger]
 * @return {{handleRequest: Function, retire: Function}}
 */
function createParentHostCallResponder(options) {
  const {control, requestBytes, responseBytes} =
    hostCallViews(options.descriptor);
  const delegate = options.delegate;
  if (typeof delegate !== 'function') {
    throw new TypeError(HOST_CALL_CONTRACT_MESSAGE.DELEGATE_REQUIRED);
  }
  const logger = options.logger;
  let closed = false;

  function writeHostCallResponse(requestId, kind, bytes) {
    if (closed) return {status: HOST_CALL_RESPONDER_STATUS.DROPPED_RETIRED};
    if (Atomics.load(control, HOST_CALL_SLOT.REQUEST_ID) !== requestId) {
      return {status: HOST_CALL_RESPONDER_STATUS.DROPPED_STALE};
    }
    responseBytes.set(bytes, 0);
    Atomics.store(control, HOST_CALL_SLOT.RESPONSE_LENGTH, bytes.byteLength);
    Atomics.store(control, HOST_CALL_SLOT.RESPONSE_KIND, kind);
    Atomics.store(control, HOST_CALL_SLOT.RESPONSE_REQUEST_ID, requestId);
    const previous = Atomics.compareExchange(
      control,
      HOST_CALL_SLOT.STATE,
      HOST_CALL_STATE.PENDING,
      HOST_CALL_STATE.RESPONDED,
    );
    if (previous !== HOST_CALL_STATE.PENDING) {
      return {status: HOST_CALL_RESPONDER_STATUS.DROPPED_STALE};
    }
    Atomics.notify(control, HOST_CALL_SLOT.STATE);
    return {status: HOST_CALL_RESPONDER_STATUS.RESPONDED};
  }

  async function respond(message) {
    const requestId = message?.requestId;
    if (closed) return {status: HOST_CALL_RESPONDER_STATUS.DROPPED_RETIRED};
    if (!Number.isSafeInteger(requestId) ||
        Atomics.load(control, HOST_CALL_SLOT.REQUEST_ID) !== requestId ||
        Atomics.load(control, HOST_CALL_SLOT.STATE) !==
          HOST_CALL_STATE.PENDING) {
      return {status: HOST_CALL_RESPONDER_STATUS.DROPPED_STALE};
    }
    const request = readHostCallRequest(control, requestBytes);
    const outcome = request === null ?
      {
        failure: hostCallFailureRecord(
          HOST_CALL_ERROR_CODE.PROTOCOL_VIOLATION,
          HOST_CALL_FAILURE_MESSAGE.PROTOCOL_VIOLATION,
        ),
      } :
      await executeHostCallDelegate(delegate, request);
    const {kind, bytes} = encodeHostCallOutcome(outcome);
    return writeHostCallResponse(requestId, kind, bytes);
  }

  return Object.freeze({
    async handleRequest(message) {
      try {
        return await respond(message);
      } catch (error) {
        logger?.warn?.(HOST_CALL_RESPONDER_STATUS.FAILED, {
          message: error?.message,
        });
        return {status: HOST_CALL_RESPONDER_STATUS.FAILED};
      }
    },
    retire() {
      closed = true;
    },
  });
}

export {
  HOST_CALL_BUFFER_BYTES,
  HOST_CALL_ERROR_CODE,
  HOST_CALL_MAX_REQUEST_BYTES,
  HOST_CALL_MAX_RESPONSE_BYTES,
  HOST_CALL_MESSAGE,
  HOST_CALL_RESPONDER_STATUS,
  HOST_CALL_RESPONSE_KIND,
  HOST_CALL_SLOT,
  HOST_CALL_STATE,
  MAX_NESTED_BINDING_CALLS,
  MAX_OUTSTANDING_HOST_CALLS,
  createHostCallDescriptor,
  createParentHostCallResponder,
  createWorkerHostCallClient,
  isHostCallCodeRetryable,
};
