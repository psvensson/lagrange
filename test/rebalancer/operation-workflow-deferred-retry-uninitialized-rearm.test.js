/**
 * Deferred owner-retry re-arm tests for the dispatch-rearm evidence module.
 *
 * Proves that a deferred dispatch retry and a deferred safety retry whose
 * durable timer fires during a transient uninitialized window are RE-ARMED
 * (bounded by the operation budget) instead of being silently dropped, while
 * a genuine shutdown still aborts. This isolates the wake guarantee for
 * deferred owner transitions from teardown.
 *
 * Mirrors the transition-retry precedent
 * (operation-workflow-transition-retry.js) which already re-arms on
 * !isInitialized and aborts on isShuttingDown.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  deferDispatchRetry,
  scheduleDeferredSafetyRetry,
} from '../../src/rebalancer/operation-workflow-dispatch-rearm-evidence.js';

const REARM_DROPPED_MSG =
  'Dropped deferred replica operation retry: not re-armed while ' +
  'uninitialized after operation budget exhausted';

function buildFakeOwner(operation) {
  const timers = [];
  const owner = {
    isShuttingDown: false,
    isInitialized: false,
    dispatchRetryTimerByOperationId: new Map(),
    safetyDeferredRetryTimerByOperationId: new Map(),
    warnings: [],
    logger: {
      warn(message, context) {
        owner.warnings.push({message, context});
      },
      info() {},
      error() {},
    },
    capturedTimers: timers,
    dropWarnings() {
      return owner.warnings.filter((w) => w.message === REARM_DROPPED_MSG);
    },
    setTimeoutFn(callback) {
      const handle = {id: timers.length + 1};
      timers.push({callback, handle});
      return handle;
    },
    shouldDeferRetryableDispatchFailure() {
      return true;
    },
    isDispatchRetryableWorkflowStep() {
      return true;
    },
    isSafetyDeferredRetryableOperation() {
      return true;
    },
    normalizeErrorMessage(errorLike, fallback) {
      return errorLike?.message || fallback;
    },
    deferDispatchRetry(op, errorLike) {
      return deferDispatchRetry(owner, op, errorLike);
    },
    scheduleDeferredSafetyRetry(op, deferReason, errorMessage) {
      return scheduleDeferredSafetyRetry(owner, op, deferReason, errorMessage);
    },
    operationWorkflowRunExclusive() {
      return Promise.resolve();
    },
    getOperationOwnerSingleFlightKey(operationId) {
      return operationId;
    },
  };
  owner.operation = operation;
  return owner;
}

function freshOperation(overrides = {}) {
  return {
    operationId: 'op-1',
    partitionId: 'part-1',
    targetNodeId: 'node-2',
    workflowStep: 'CREATE',
    createdAt: Date.now(),
    ...overrides,
  };
}

test('deferred dispatch retry re-arms while uninitialized within budget', (t) => {
  const operation = freshOperation();
  const owner = buildFakeOwner(operation);
  const error = {message: 'control-plane unavailable'};

  t.equal(owner.deferDispatchRetry(operation, error), true, 'arms first timer');
  t.equal(owner.capturedTimers.length, 1, 'one timer armed');
  t.ok(
    owner.dispatchRetryTimerByOperationId.has('op-1'),
    'timer tracked',
  );

  owner.capturedTimers[0].callback();

  t.equal(owner.capturedTimers.length, 2, 're-armed a fresh timer');
  t.ok(
    owner.dispatchRetryTimerByOperationId.has('op-1'),
    'timer re-tracked after re-arm',
  );
  t.equal(owner.dropWarnings().length, 0, 'no drop warning while within budget');
  t.end();
});

test('deferred dispatch retry is dropped once the operation budget expires', (t) => {
  const operation = freshOperation({createdAt: 0});
  const owner = buildFakeOwner(operation);
  const error = {message: 'control-plane unavailable'};

  t.equal(owner.deferDispatchRetry(operation, error), true, 'arms first timer');
  owner.capturedTimers[0].callback();

  t.equal(owner.capturedTimers.length, 1, 'no re-arm after budget expiry');
  t.notOk(
    owner.dispatchRetryTimerByOperationId.has('op-1'),
    'timer cleared on drop',
  );
  const drops = owner.dropWarnings();
  t.equal(drops.length, 1, 'emits one drop warning');
  t.equal(drops[0].message, REARM_DROPPED_MSG, 'drop warning message');
  t.equal(drops[0].context.retryKind, 'dispatch_retry', 'retry kind');
  t.end();
});

test('deferred dispatch retry aborts on shutdown without re-arm', (t) => {
  const operation = freshOperation();
  const owner = buildFakeOwner(operation);
  const error = {message: 'control-plane unavailable'};

  owner.deferDispatchRetry(operation, error);
  owner.isShuttingDown = true;
  owner.capturedTimers[0].callback();

  t.equal(owner.capturedTimers.length, 1, 'no re-arm on shutdown');
  t.equal(owner.dropWarnings().length, 0, 'no drop warning on shutdown');
  t.notOk(
    owner.dispatchRetryTimerByOperationId.has('op-1'),
    'timer cleared on shutdown abort',
  );
  t.end();
});

test('deferred safety retry re-arms while uninitialized within budget', (t) => {
  const operation = freshOperation();
  const owner = buildFakeOwner(operation);

  t.equal(
    owner.scheduleDeferredSafetyRetry(operation, 'quorum', 'deferred'),
    true,
    'arms first safety timer',
  );
  owner.capturedTimers[0].callback();

  t.equal(owner.capturedTimers.length, 2, 're-armed a fresh safety timer');
  t.ok(
    owner.safetyDeferredRetryTimerByOperationId.has('op-1'),
    'safety timer re-tracked after re-arm',
  );
  t.equal(owner.dropWarnings().length, 0, 'no drop warning while within budget');
  t.end();
});

test('deferred safety retry is dropped once the operation budget expires', (t) => {
  const operation = freshOperation({createdAt: 0});
  const owner = buildFakeOwner(operation);

  owner.scheduleDeferredSafetyRetry(operation, 'quorum', 'deferred');
  owner.capturedTimers[0].callback();

  t.equal(owner.capturedTimers.length, 1, 'no re-arm after budget expiry');
  const drops = owner.dropWarnings();
  t.equal(drops.length, 1, 'emits one drop warning');
  t.equal(drops[0].context.retryKind, 'safety_retry', 'retry kind');
  t.end();
});
