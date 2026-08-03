/**
 * Unit proof of the worker-to-parent host-call protocol owner
 * (src/runtime/cell-host-call-protocol.js) over a REAL SharedArrayBuffer
 * with the blocking client running inside a REAL worker_threads Worker
 * (Atomics.wait is forbidden on the main thread, so the client side of
 * every test executes production-true on a worker thread via an inline
 * eval fixture), while the async responder runs on the test main thread.
 *
 * Covers the brief's worker-bridge rules: success round trip, typed
 * terminal and retryable failures, delegate-internals containment,
 * deadline timeout with a LATE parent write dropped and a SECOND call on
 * the same buffer left uncorrupted (request-id epoch proof), oversized
 * response refusal, malformed shared-state refusal, the one-outstanding /
 * nested-call budget, and worker termination while the parent is pending.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Worker} from 'node:worker_threads';

import {
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
  isHostCallCodeRetryable,
} from '../../src/runtime/cell-host-call-protocol.js';

const PROTOCOL_MODULE_URL =
  new URL('../../src/runtime/cell-host-call-protocol.js', import.meta.url)
    .href;

// Inline CommonJS eval fixture: drives the production blocking client on
// a worker thread. Instructions arrive over parentPort; each client call
// blocks the worker (Atomics.wait) until the main-thread responder
// answers through the shared buffer or the client deadline expires.
const CLIENT_WORKER_SOURCE = `
const {parentPort, workerData} = require('node:worker_threads');
const protocolPromise = import(workerData.protocolModuleUrl);
let client = null;
parentPort.on('message', (instruction) => {
  void protocolPromise.then((protocol) => {
    if (instruction.op === 'create-client') {
      client = protocol.createWorkerHostCallClient({
        deadlineMs: Date.now() + instruction.waitBudgetMs,
        descriptor: workerData.descriptor,
        maxCalls: instruction.maxCalls,
        postToParent: (request) => parentPort.postMessage(request),
      });
      parentPort.postMessage({kind: 'created'});
      return;
    }
    try {
      const ok = client.call(instruction.name, instruction.argumentsJson);
      parentPort.postMessage({kind: 'call-result', ok});
    } catch (error) {
      parentPort.postMessage({
        kind: 'call-result',
        payload: error.payload ?? {message: error.message},
      });
    }
  });
});
parentPort.postMessage({kind: 'online'});
`;

const GENEROUS_WAIT_BUDGET_MS = 5000;
const SHORT_WAIT_BUDGET_MS = 250;
const UNKNOWN_RESPONSE_KIND = 9;
const MALFORMED_RESPONSE_LENGTH = 4;

class ClientHarness {
  constructor(onHostCallRequest) {
    this.descriptor = createHostCallDescriptor();
    this.received = [];
    this.waiters = [];
    this.worker = new Worker(CLIENT_WORKER_SOURCE, {
      eval: true,
      workerData: {
        descriptor: this.descriptor,
        protocolModuleUrl: PROTOCOL_MODULE_URL,
      },
    });
    this.worker.on('message', (message) => {
      if (message.type === HOST_CALL_MESSAGE.REQUEST) {
        onHostCallRequest(message);
        return;
      }
      const waiter = this.waiters.shift();
      if (waiter) waiter(message);
      else this.received.push(message);
    });
  }

  nextMessage() {
    if (this.received.length > 0) {
      return Promise.resolve(this.received.shift());
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async ready() {
    const message = await this.nextMessage();
    assert.equal(message.kind, 'online');
  }

  async createClient(waitBudgetMs, maxCalls) {
    this.worker.postMessage({maxCalls, op: 'create-client', waitBudgetMs});
    const message = await this.nextMessage();
    assert.equal(message.kind, 'created');
  }

  async call(name, argumentsJson) {
    this.worker.postMessage({argumentsJson, name, op: 'call'});
    const message = await this.nextMessage();
    assert.equal(message.kind, 'call-result');
    return message;
  }

  async close() {
    await this.worker.terminate();
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, reject, resolve};
}

test('protocol bounds and retryability map stay sealed', () => {
  assert.equal(MAX_OUTSTANDING_HOST_CALLS, 1);
  assert.equal(MAX_NESTED_BINDING_CALLS, 1);
  assert.ok(HOST_CALL_BUFFER_BYTES >
      HOST_CALL_MAX_REQUEST_BYTES + HOST_CALL_MAX_RESPONSE_BYTES);
  assert.equal(
    isHostCallCodeRetryable(HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE),
    true,
  );
  for (const code of Object.values(HOST_CALL_ERROR_CODE)) {
    if (code === HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE) continue;
    assert.equal(isHostCallCodeRetryable(code), false, code);
  }
});

test('success round trip: blocked worker client gets the delegate result',
  async () => {
    const seen = [];
    let responder = null;
    const harness = new ClientHarness(
      (message) => void responder.handleRequest(message),
    );
    responder = createParentHostCallResponder({
      delegate: async (call) => {
        seen.push(call);
        return JSON.stringify({echo: call.name});
      },
      descriptor: harness.descriptor,
    });
    try {
      await harness.ready();
      await harness.createClient(GENEROUS_WAIT_BUDGET_MS);
      const result = await harness.call('account-summary', '{"a":1}');
      assert.equal(result.ok, JSON.stringify({echo: 'account-summary'}));
      assert.deepEqual(seen, [
        {argumentsJson: '{"a":1}', name: 'account-summary'},
      ]);
    } finally {
      await harness.close();
    }
  });

test('typed terminal and retryable failures cross the buffer intact',
  async () => {
    let failure = null;
    let responder = null;
    const harness = new ClientHarness(
      (message) => void responder.handleRequest(message),
    );
    responder = createParentHostCallResponder({
      delegate: async () => {
        throw failure;
      },
      descriptor: harness.descriptor,
    });
    try {
      await harness.ready();
      await harness.createClient(GENEROUS_WAIT_BUDGET_MS, 3);

      failure = Object.assign(new Error('binding not allowed'), {
        code: HOST_CALL_ERROR_CODE.TARGET_NOT_ALLOWED,
      });
      const terminal = await harness.call('restricted', '{}');
      assert.deepEqual(terminal.payload, {
        code: HOST_CALL_ERROR_CODE.TARGET_NOT_ALLOWED,
        message: 'binding not allowed',
        retryable: false,
      });

      failure = Object.assign(new Error('target replica warming'), {
        code: HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE,
      });
      const retryable = await harness.call('warming', '{}');
      assert.equal(retryable.payload.code,
        HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE);
      assert.equal(retryable.payload.retryable, true);

      failure = new Error('secret parent internals');
      const unknown = await harness.call('boom', '{}');
      assert.equal(unknown.payload.code,
        HOST_CALL_ERROR_CODE.TARGET_FAILED);
      assert.equal(unknown.payload.retryable, false);
      assert.doesNotMatch(unknown.payload.message, /secret/u);
    } finally {
      await harness.close();
    }
  });

test('deadline timeout poisons the request id: the late parent write is ' +
    'dropped and a second call on the same buffer stays uncorrupted',
async () => {
  const delegateGate = deferred();
  let delegateValue = null;
  const requestHandled = [];
  let responder = null;
  const harness = new ClientHarness((message) => {
    requestHandled.push(responder.handleRequest(message));
  });
  responder = createParentHostCallResponder({
    delegate: async () => {
      if (delegateValue !== null) return delegateValue;
      return delegateGate.promise;
    },
    descriptor: harness.descriptor,
  });
  try {
    await harness.ready();
    await harness.createClient(SHORT_WAIT_BUDGET_MS);
    const timedOut = await harness.call('slow-binding', '{}');
    assert.equal(timedOut.payload.code,
      HOST_CALL_ERROR_CODE.DEADLINE_EXHAUSTED);
    assert.equal(timedOut.payload.retryable, false);

    // The delegate now completes LATE; the responder must drop the
    // write because the client bumped the request-id epoch on timeout.
    delegateGate.resolve('late-value-must-not-leak');
    const lateOutcome = await requestHandled[0];
    assert.equal(lateOutcome.status,
      HOST_CALL_RESPONDER_STATUS.DROPPED_STALE);

    // Second call over the SAME descriptor: fresh client, prompt
    // delegate; it must see its own response, not the late value.
    delegateValue = 'fresh-value';
    await harness.createClient(GENEROUS_WAIT_BUDGET_MS);
    const second = await harness.call('fresh-binding', '{}');
    assert.equal(second.ok, 'fresh-value');
  } finally {
    await harness.close();
  }
});

test('oversized delegate response is refused with the typed bound failure',
  async () => {
    let responder = null;
    const harness = new ClientHarness(
      (message) => void responder.handleRequest(message),
    );
    responder = createParentHostCallResponder({
      delegate: async () =>
        'x'.repeat(HOST_CALL_MAX_RESPONSE_BYTES + 1),
      descriptor: harness.descriptor,
    });
    try {
      await harness.ready();
      await harness.createClient(GENEROUS_WAIT_BUDGET_MS);
      const result = await harness.call('huge', '{}');
      assert.equal(result.payload.code,
        HOST_CALL_ERROR_CODE.RESPONSE_TOO_LARGE);
      assert.equal(result.payload.retryable, false);
    } finally {
      await harness.close();
    }
  });

test('oversized request arguments are refused client-side before posting',
  async () => {
    const requests = [];
    const harness = new ClientHarness((message) => requests.push(message));
    try {
      await harness.ready();
      await harness.createClient(GENEROUS_WAIT_BUDGET_MS, 2);
      const oversized = await harness.call(
        'binding',
        'y'.repeat(HOST_CALL_MAX_REQUEST_BYTES + 1),
      );
      assert.equal(oversized.payload.code,
        HOST_CALL_ERROR_CODE.INVALID_ARGUMENTS);
      const unnamed = await harness.call('', '{}');
      assert.equal(unnamed.payload.code,
        HOST_CALL_ERROR_CODE.INVALID_ARGUMENTS);
      assert.equal(requests.length, 0,
        'refused calls never reach the parent');
    } finally {
      await harness.close();
    }
  });

test('malformed shared state (unknown response kind) is refused typed',
  async () => {
    const control =
        [];
    const harness = new ClientHarness((message) => {
      // Manual malformed response: correct request id, unknown kind.
      const view = new Int32Array(harness.descriptor.buffer);
      control.push(message.requestId);
      Atomics.store(view, HOST_CALL_SLOT.RESPONSE_REQUEST_ID,
        message.requestId);
      Atomics.store(view, HOST_CALL_SLOT.RESPONSE_KIND,
        UNKNOWN_RESPONSE_KIND);
      Atomics.store(view, HOST_CALL_SLOT.RESPONSE_LENGTH,
        MALFORMED_RESPONSE_LENGTH);
      Atomics.compareExchange(view, HOST_CALL_SLOT.STATE,
        HOST_CALL_STATE.PENDING, HOST_CALL_STATE.RESPONDED);
      Atomics.notify(view, HOST_CALL_SLOT.STATE);
    });
    try {
      await harness.ready();
      await harness.createClient(GENEROUS_WAIT_BUDGET_MS);
      const result = await harness.call('binding', '{}');
      assert.equal(result.payload.code,
        HOST_CALL_ERROR_CODE.PROTOCOL_VIOLATION);
      assert.equal(control.length, 1);
      assert.notEqual(HOST_CALL_RESPONSE_KIND.OK, UNKNOWN_RESPONSE_KIND);
    } finally {
      await harness.close();
    }
  });

test('second nested binding call in one invocation refuses typed',
  async () => {
    let responder = null;
    const harness = new ClientHarness(
      (message) => void responder.handleRequest(message),
    );
    responder = createParentHostCallResponder({
      delegate: async () => 'first-result',
      descriptor: harness.descriptor,
    });
    try {
      await harness.ready();
      // Default budget: MAX_NESTED_BINDING_CALLS (1).
      await harness.createClient(GENEROUS_WAIT_BUDGET_MS);
      const first = await harness.call('binding', '{}');
      assert.equal(first.ok, 'first-result');
      const second = await harness.call('binding', '{}');
      assert.equal(second.payload.code,
        HOST_CALL_ERROR_CODE.RECURSION_REFUSED);
      assert.equal(second.payload.retryable, false);
    } finally {
      await harness.close();
    }
  });

test('worker termination while the parent is pending: the responder ' +
    'write is dropped without throwing',
async () => {
  const delegateGate = deferred();
  const requestHandled = [];
  let responder = null;
  const harness = new ClientHarness((message) => {
    requestHandled.push(responder.handleRequest(message));
  });
  responder = createParentHostCallResponder({
    delegate: () => delegateGate.promise,
    descriptor: harness.descriptor,
  });
  await harness.ready();
  await harness.createClient(GENEROUS_WAIT_BUDGET_MS);
  harness.worker.postMessage({argumentsJson: '{}', name: 'hang', op: 'call'});
  // Wait until the request reached the parent, then kill the worker
  // (the runtime retires the responder when the invocation settles).
  while (requestHandled.length === 0) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  await harness.close();
  responder.retire();
  delegateGate.resolve('late-after-termination');
  const outcome = await requestHandled[0];
  assert.equal(outcome.status,
    HOST_CALL_RESPONDER_STATUS.DROPPED_RETIRED);
});
