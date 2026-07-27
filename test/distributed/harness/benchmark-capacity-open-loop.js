import {performance} from 'node:perf_hooks';
import {
  appendOwnArrayValue,
  hasExactOwnDataKeys,
  isNonNegativeSafeInteger,
  isPlainDataRecord,
} from './benchmark-semantic-integrity.js';
import {
  BENCHMARK_CAPACITY_MILLISECONDS_PER_SECOND,
  BENCHMARK_CAPACITY_MAX_OPERATIONS_PER_WINDOW,
  BENCHMARK_CAPACITY_OUTCOME,
  BENCHMARK_CAPACITY_PHASE,
} from './benchmark-capacity-protocol-constants.js';
import {
  createBenchmarkCapacityRunSample,
} from './benchmark-capacity-run-sample.js';

const DEFAULT_CLOCK = Object.freeze({
  now: performance.now.bind(performance),
  sleep: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
});
const promiseResolve = Promise.resolve.bind(Promise);
const promiseRace = Promise.race.bind(Promise);
const promiseThen = Function.call.bind(Promise.prototype.then);
const arrayShift = Function.call.bind(Array.prototype.shift);
const mathFloor = Math.floor;
const mathMax = Math.max;
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const setHas = Function.call.bind(Set.prototype.has);
const OPTION_KEYS = [
  'sideId',
  'phase',
  'blockIndex',
  'offeredLoadPerSecond',
  'windowDurationMs',
  'operationTimeoutMs',
  'semanticFinalizerTimeoutMs',
  'maxReleaseLagMs',
  'clientMaxInFlight',
  'clientMaxQueueDepth',
  'semanticDialect',
  'finalizeSemanticReceipt',
  'executeOperation',
  'signal',
];
const CLOCK_KEYS = ['now', 'sleep'];
const OUTCOME_KEYS = ['status'];
const OUTCOME_VALUES = new Set(Object.values(BENCHMARK_CAPACITY_OUTCOME));

function assertOptionShape(options) {
  if (!hasExactOwnDataKeys(options, OPTION_KEYS)) {
    throw new TypeError(
      'open-loop capacity options must have the exact schema',
    );
  }
}

function signalIsValid(signal) {
  return signal === null ||
    (
      typeof signal === 'object' &&
      typeof signal.addEventListener === 'function' &&
      typeof signal.removeEventListener === 'function' &&
      typeof signal.aborted === 'boolean'
    );
}

function assertOptionIdentity(options) {
  if (
    typeof options.sideId !== 'string' ||
    options.sideId.length === 0 ||
    (
      options.phase !== BENCHMARK_CAPACITY_PHASE.WARMUP &&
      options.phase !== BENCHMARK_CAPACITY_PHASE.MEASURED
    ) ||
    typeof options.executeOperation !== 'function' ||
    (
      options.finalizeSemanticReceipt !== null &&
      typeof options.finalizeSemanticReceipt !== 'function'
    ) ||
    !signalIsValid(options.signal)
  ) {
    throw new TypeError('invalid open-loop capacity identity');
  }
}

function assertOptionIntegers(options) {
  const integerFields = [
    ['blockIndex', true],
    ['offeredLoadPerSecond', false],
    ['windowDurationMs', false],
    ['operationTimeoutMs', false],
    ['semanticFinalizerTimeoutMs', false],
    ['maxReleaseLagMs', true],
    ['clientMaxInFlight', false],
    ['clientMaxQueueDepth', false],
  ];
  for (let index = 0; index < integerFields.length; index += 1) {
    const key = integerFields[index][0];
    const allowZero = integerFields[index][1];
    if (
      !isNonNegativeSafeInteger(options[key]) ||
      (!allowZero && options[key] === 0)
    ) {
      throw new TypeError(`invalid open-loop capacity option: ${key}`);
    }
  }
}

function assertOptions(options) {
  assertOptionShape(options);
  assertOptionIdentity(options);
  assertOptionIntegers(options);
}

function createCounts() {
  return {
    offered: 0,
    dispatched: 0,
    correct: 0,
    rejected: 0,
    timedOut: 0,
    errored: 0,
    queueOverflow: 0,
    undispatched: 0,
    cancelled: 0,
  };
}

function createRejectedByReason() {
  return {queueFull: 0, flowControl: 0, admission: 0};
}

function frozenArrayCopy(values) {
  const copied = [];
  for (let index = 0; index < values.length; index += 1) {
    appendOwnArrayValue(copied, values[index]);
  }
  return objectFreeze(copied);
}

function normalizeOutcome(value) {
  if (
    !isPlainDataRecord(value) ||
    !objectHasOwn(value, OUTCOME_KEYS[0]) ||
    objectKeys(value).length !== OUTCOME_KEYS.length ||
    !setHas(OUTCOME_VALUES, value.status)
  ) {
    return BENCHMARK_CAPACITY_OUTCOME.ERRORED;
  }
  return value.status;
}

function recordOutcome(state, operation, status, completedAtMs) {
  const queueDelayMs = mathMax(
    0,
    operation.dispatchedAtMs - operation.scheduledAtMs,
  );
  const endToEndLatencyMs = mathMax(
    0,
    completedAtMs - operation.scheduledAtMs,
  );
  if (status === BENCHMARK_CAPACITY_OUTCOME.CORRECT) {
    state.counts.correct += 1;
    appendOwnArrayValue(
      state.correctOperationIndexes,
      operation.operationIndex,
    );
    appendOwnArrayValue(state.endToEndLatencyMs, endToEndLatencyMs);
    appendOwnArrayValue(state.clientQueueDelayMs, queueDelayMs);
    return;
  }
  if (status === BENCHMARK_CAPACITY_OUTCOME.REJECTED) {
    state.rejectedByReason.admission += 1;
    state.counts.rejected += 1;
    return;
  }
  if (status === BENCHMARK_CAPACITY_OUTCOME.TIMED_OUT) {
    state.counts.timedOut += 1;
    return;
  }
  if (status === BENCHMARK_CAPACITY_OUTCOME.CANCELLED) {
    state.counts.cancelled += 1;
    return;
  }
  state.counts.errored += 1;
}

function createTimedOutcome(state, operation, options) {
  let timerId;
  let resolveTimeout;
  const timeoutPromise = new Promise((resolve) => {
    resolveTimeout = resolve;
    timerId = setTimeout(() => {
      operation.controller.abort();
      resolve(BENCHMARK_CAPACITY_OUTCOME.TIMED_OUT);
    }, options.operationTimeoutMs);
  });
  const cancel = () => {
    clearTimeout(timerId);
    operation.controller.abort();
    resolveTimeout(BENCHMARK_CAPACITY_OUTCOME.CANCELLED);
  };
  state.activeCancellations[operation.operationIndex] = cancel;
  return {timeoutPromise, timerId};
}

function finishOperation(state, operation, timerId) {
  clearTimeout(timerId);
  delete state.activeCancellations[operation.operationIndex];
}

function waitForExecutionSettlement(execution, timeoutMs) {
  let timerId;
  const settlement = promiseThen(execution, () => true, () => true);
  const bounded = new Promise((resolve) => {
    timerId = setTimeout(() => resolve(false), timeoutMs);
  });
  return promiseThen(
    promiseRace([settlement, bounded]),
    (settled) => {
      clearTimeout(timerId);
      return settled;
    },
  );
}

function finishOperationSlot(state, operation, timed, options, clock, settle) {
  finishOperation(state, operation, timed.timerId);
  state.active -= 1;
  const next = state.cancelled ? undefined : arrayShift(state.queue);
  if (next !== undefined) {
    beginOperation(state, next, options, clock, settle);
  }
  settle();
}

function beginOperation(state, operation, options, clock, settle) {
  state.active += 1;
  state.counts.dispatched += 1;
  operation.dispatchedAtMs = clock.now();
  operation.controller = new AbortController();
  const timed = createTimedOutcome(state, operation, options);
  let executionSettled = false;
  let executionOutcome;
  const invoked = promiseThen(promiseResolve(), () =>
    options.executeOperation({
      sideId: options.sideId,
      phase: options.phase,
      blockIndex: options.blockIndex,
      offeredLoadPerSecond: options.offeredLoadPerSecond,
      operationIndex: operation.operationIndex,
      scheduledAtMs: operation.scheduledAtMs,
      dispatchedAtMs: operation.dispatchedAtMs,
      signal: operation.controller.signal,
    }));
  const execution = promiseThen(
    invoked,
    (value) => {
      executionSettled = true;
      executionOutcome = normalizeOutcome(value);
      return executionOutcome;
    },
    () => {
      executionSettled = true;
      executionOutcome = BENCHMARK_CAPACITY_OUTCOME.ERRORED;
      return executionOutcome;
    },
  );
  const completion = promiseThen(
    promiseRace([execution, timed.timeoutPromise]),
    async (status) => {
      recordOutcome(state, operation, status, clock.now());
      const abortTerminal =
        status === BENCHMARK_CAPACITY_OUTCOME.TIMED_OUT ||
        status === BENCHMARK_CAPACITY_OUTCOME.CANCELLED;
      if (abortTerminal && !executionSettled) {
        const settled = await waitForExecutionSettlement(
          execution,
          options.operationTimeoutMs,
        );
        if (!settled) {
          state.executionLeak = {
            operationIndex: operation.operationIndex,
            terminalStatus: status,
            postAbortDrainMs: options.operationTimeoutMs,
          };
          cancelWindow(state);
        } else if (executionOutcome === BENCHMARK_CAPACITY_OUTCOME.CORRECT) {
          state.lateCompletion = {
            operationIndex: operation.operationIndex,
            terminalStatus: status,
          };
          cancelWindow(state);
        }
      }
    },
  );
  promiseThen(
    completion,
    () => finishOperationSlot(
      state,
      operation,
      timed,
      options,
      clock,
      settle,
    ),
    (error) => {
      state.internalError = error;
      cancelWindow(state);
      finishOperationSlot(
        state,
        operation,
        timed,
        options,
        clock,
        settle,
      );
    },
  );
}

function releaseOperation(state, operation, options, clock, settle) {
  if (state.cancelled) {
    state.counts.undispatched += 1;
    return;
  }
  if (state.active < options.clientMaxInFlight) {
    beginOperation(state, operation, options, clock, settle);
    return;
  }
  if (state.queue.length < options.clientMaxQueueDepth) {
    appendOwnArrayValue(state.queue, operation);
    return;
  }
  state.rejectedByReason.queueFull += 1;
  state.counts.rejected += 1;
  state.counts.queueOverflow += 1;
}

function createDrain(state) {
  let resolveDrain;
  const promise = new Promise((resolve) => {
    resolveDrain = resolve;
  });
  const settle = () => {
    if (state.releasesComplete && state.active === 0 && state.queue.length === 0) {
      resolveDrain();
    }
  };
  return {promise, settle};
}

function cancelWindow(state) {
  if (state.cancelled) return;
  state.cancelled = true;
  if (state.releaseCancel !== undefined) {
    state.releaseCancel();
  }
  state.counts.undispatched += state.queue.length;
  state.queue.length = 0;
  const cancellationKeys = objectKeys(state.activeCancellations);
  for (let index = 0; index < cancellationKeys.length; index += 1) {
    state.activeCancellations[cancellationKeys[index]]();
  }
}

async function runSemanticFinalizer(options, state) {
  const controller = new AbortController();
  let timeoutId;
  const invoked = promiseThen(promiseResolve(), () =>
    options.finalizeSemanticReceipt({
      sideId: options.sideId,
      phase: options.phase,
      blockIndex: options.blockIndex,
      offeredLoadPerSecond: options.offeredLoadPerSecond,
      windowDurationMs: options.windowDurationMs,
      counts: {...state.counts},
      rejectedByReason: {...state.rejectedByReason},
      correctOperationIndexes: frozenArrayCopy(
        state.correctOperationIndexes,
      ),
      signal: controller.signal,
    }));
  const completed = promiseThen(
    invoked,
    (value) => ({status: 'completed', value}),
    (error) => ({status: 'failed', error}),
  );
  const timedOut = new Promise((resolve) => {
    timeoutId = setTimeout(
      () => resolve({status: 'timed_out'}),
      options.semanticFinalizerTimeoutMs,
    );
  });
  const result = await promiseRace([completed, timedOut]);
  clearTimeout(timeoutId);
  if (result.status === 'completed') {
    return result.value;
  }
  if (result.status === 'failed') {
    throw result.error;
  }
  controller.abort();
  const settled = await waitForExecutionSettlement(
    invoked,
    options.semanticFinalizerTimeoutMs,
  );
  const error = new Error(
    settled ?
      'capacity semantic receipt finalizer exceeded sealed timeout' :
      'capacity semantic receipt finalizer ignored bounded abort',
  );
  error.code = settled ?
    'BENCHMARK_CAPACITY_SEMANTIC_FINALIZER_TIMEOUT' :
    'BENCHMARK_CAPACITY_SEMANTIC_FINALIZER_LEAK';
  throw error;
}

function populateReleasePlan(state, scheduledOperations, options) {
  for (let operationIndex = 0;
    operationIndex < scheduledOperations;
    operationIndex += 1) {
    appendOwnArrayValue(
      state.releaseOffsetsMs,
      mathFloor(
        operationIndex * BENCHMARK_CAPACITY_MILLISECONDS_PER_SECOND /
        options.offeredLoadPerSecond,
      ),
    );
    appendOwnArrayValue(state.releaseLagMs, null);
  }
}

async function releaseScheduledOperations({
  state,
  scheduledOperations,
  startMs,
  options,
  clock,
  settle,
}) {
  for (let operationIndex = 0;
    operationIndex < scheduledOperations;
    operationIndex += 1) {
    if (state.cancelled) {
      state.counts.undispatched += scheduledOperations - operationIndex;
      state.unreleasedOperations += scheduledOperations - operationIndex;
      break;
    }
    const releaseOffsetMs = state.releaseOffsetsMs[operationIndex];
    const scheduledAtMs = startMs + releaseOffsetMs;
    const delayMs = mathMax(0, scheduledAtMs - clock.now());
    if (delayMs > 0) {
      let releaseCancel;
      const cancelledRelease = new Promise((resolve) => {
        releaseCancel = resolve;
      });
      state.releaseCancel = releaseCancel;
      await promiseRace([clock.sleep(delayMs), cancelledRelease]);
      state.releaseCancel = undefined;
    }
    if (state.cancelled) {
      state.counts.undispatched += scheduledOperations - operationIndex;
      state.unreleasedOperations += scheduledOperations - operationIndex;
      break;
    }
    const releaseLagMs = mathMax(0, clock.now() - scheduledAtMs);
    state.releaseLagMs[operationIndex] = releaseLagMs;
    if (releaseLagMs > options.maxReleaseLagMs) {
      state.schedulerSaturation = {
        operationIndex,
        releaseLagMs,
        maxReleaseLagMs: options.maxReleaseLagMs,
      };
      state.counts.undispatched += scheduledOperations - operationIndex;
      state.unreleasedOperations += scheduledOperations - operationIndex;
      cancelWindow(state);
      break;
    }
    releaseOperation(
      state,
      {operationIndex, scheduledAtMs, dispatchedAtMs: scheduledAtMs},
      options,
      clock,
      settle,
    );
  }
}

function throwTerminalStateErrors(state) {
  const failures = [
    [state.internalError, null, null],
    [
      state.executionLeak,
      'BENCHMARK_CAPACITY_EXECUTION_LEAK',
      'capacity operation ignored abort beyond bounded post-abort drain',
    ],
    [
      state.schedulerSaturation,
      'BENCHMARK_CAPACITY_SCHEDULER_SATURATION',
      'capacity scheduler release lag exceeded sealed tolerance',
    ],
    [
      state.lateCompletion,
      'BENCHMARK_CAPACITY_LATE_CORRECT_COMPLETION',
      'capacity operation completed correct after terminal timeout/cancel',
    ],
  ];
  for (let index = 0; index < failures.length; index += 1) {
    if (failures[index][0] === null) continue;
    if (index === 0) throw failures[index][0];
    const error = new Error(failures[index][2]);
    error.code = failures[index][1];
    error.detail = failures[index][0];
    throw error;
  }
}

function assertClock(clock) {
  if (
    !hasExactOwnDataKeys(clock, CLOCK_KEYS) ||
    typeof clock.now !== 'function' ||
    typeof clock.sleep !== 'function'
  ) {
    throw new TypeError('open-loop clock must expose now and sleep');
  }
}

function assertScheduledOperationBound(scheduledOperations) {
  if (
    scheduledOperations === 0 ||
    scheduledOperations > BENCHMARK_CAPACITY_MAX_OPERATIONS_PER_WINDOW
  ) {
    throw new RangeError(
      'open-loop scheduled operation count outside sealed bound',
    );
  }
}

function attachExternalCancellation(options, state, settle) {
  const externalSignal = options.signal;
  const cancelListener = () => {
    cancelWindow(state);
    settle();
  };
  if (
    externalSignal &&
    typeof externalSignal.addEventListener === 'function'
  ) {
    externalSignal.addEventListener('abort', cancelListener, {once: true});
    if (externalSignal.aborted) cancelListener();
  }
  return {externalSignal, cancelListener};
}

function detachExternalCancellation(binding) {
  if (
    binding.externalSignal &&
    typeof binding.externalSignal.removeEventListener === 'function'
  ) {
    binding.externalSignal.removeEventListener(
      'abort',
      binding.cancelListener,
    );
  }
}

async function resolveSemanticReceipt(options, state) {
  if (state.counts.correct === 0) return null;
  if (typeof options.finalizeSemanticReceipt !== 'function') {
    throw new TypeError(
      'correct capacity sample requires semantic receipt finalizer',
    );
  }
  return runSemanticFinalizer(options, state);
}

export async function runBenchmarkCapacityOpenLoopWindow(
  options,
  clock = DEFAULT_CLOCK,
) {
  assertOptions(options);
  assertClock(clock);
  const scheduledOperations = mathFloor(
    options.offeredLoadPerSecond *
    options.windowDurationMs /
    BENCHMARK_CAPACITY_MILLISECONDS_PER_SECOND,
  );
  assertScheduledOperationBound(scheduledOperations);
  const startMs = clock.now();
  const state = {
    active: 0,
    queue: [],
    activeCancellations: objectCreate(null),
    cancelled: false,
    releaseCancel: undefined,
    releasesComplete: false,
    counts: createCounts(),
    rejectedByReason: createRejectedByReason(),
    endToEndLatencyMs: [],
    clientQueueDelayMs: [],
    releaseOffsetsMs: [],
    releaseLagMs: [],
    correctOperationIndexes: [],
    unreleasedOperations: 0,
    executionLeak: null,
    internalError: null,
    schedulerSaturation: null,
    lateCompletion: null,
  };
  const drain = createDrain(state);
  state.counts.offered = scheduledOperations;
  populateReleasePlan(state, scheduledOperations, options);
  const cancellationBinding = attachExternalCancellation(
    options,
    state,
    drain.settle,
  );
  await releaseScheduledOperations({
    state,
    scheduledOperations,
    startMs,
    options,
    clock,
    settle: drain.settle,
  });
  state.releasesComplete = true;
  drain.settle();
  await drain.promise;
  const observationEndedAtMs = clock.now();
  detachExternalCancellation(cancellationBinding);
  throwTerminalStateErrors(state);
  const semanticReceipt = await resolveSemanticReceipt(options, state);
  return createBenchmarkCapacityRunSample({
    sideId: options.sideId,
    phase: options.phase,
    blockIndex: options.blockIndex,
    offeredLoadPerSecond: options.offeredLoadPerSecond,
    windowDurationMs: options.windowDurationMs,
    observationStartedAtMs: startMs,
    observationEndedAtMs,
    operationTimeoutMs: options.operationTimeoutMs,
    maxReleaseLagMs: options.maxReleaseLagMs,
    clientMaxInFlight: options.clientMaxInFlight,
    clientMaxQueueDepth: options.clientMaxQueueDepth,
    counts: state.counts,
    rejectedByReason: state.rejectedByReason,
    endToEndLatencyMs: state.endToEndLatencyMs,
    clientQueueDelayMs: state.clientQueueDelayMs,
    releaseOffsetsMs: state.releaseOffsetsMs,
    releaseLagMs: state.releaseLagMs,
    unreleasedOperations: state.unreleasedOperations,
    semanticDialect: options.semanticDialect,
    semanticReceipt,
  });
}
