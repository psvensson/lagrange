import {
  Worker,
} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {
  resolveModuleDirectory,
  resolvePackagedRuntimeFile,
} from '../sea/runtime-file-resolution.js';
import {
  RequestCellTableReadBoundError,
  indexRequestCellTableReads,
  requestCellTableIndexEstimatedBytes,
  requestCellTableIndexRowBound,
} from './request-cell-table-read-index.js';
import {
  HOST_CALL_MESSAGE,
  createHostCallDescriptor,
  createParentHostCallResponder,
} from './cell-host-call-protocol.js';

const BYTE_ENCODING = 'utf8';
const STARTUP_TIMEOUT_MS = 10_000;
const HEALTH_TIMEOUT_MS = 1_000;
const CPU_SAMPLE_INTERVAL_MS = 2;
const CELL_WORKER_SOURCE_FILE = 'wasi-component-cell-worker.js';
const CELL_WORKER_BUNDLE_FILE = 'request-cell-worker.bundle.mjs';
const CELL_WORLD = Object.freeze({
  CALL: 'call-cell',
  REQUEST: 'request-cell',
});
const CELL_EMIT_BUFFER_BYTES = 16 * 1024 * 1024;
const CELL_EMIT_BUFFER_META_SLOTS = 2;
const CELL_EMIT_LENGTH_INDEX = 0;
const CELL_EMIT_ERROR_INDEX = 1;
const CELL_EMIT_OVERFLOW_MARKER = '__call_cell_emit_overflow__';
const WASI_COMPONENT_CELL_ERROR_NAME = 'WasiComponentCellError';
const WALL_BUDGET_EXHAUSTED_ACTUAL_OFFSET_MS = 1;
const CELL_BUDGET_FIELD = Object.freeze({
  CONTEXT_BYTES: 'context_bytes',
  CPU_TIME_MS: 'cpu_time_ms',
  INPUT_BYTES: 'input_bytes',
  MEMORY_BYTES: 'memory_bytes',
  OUTPUT_BYTES: 'output_bytes',
  WALL_TIME_MS: 'wall_time_ms',
});
const CELL_WORKER_EVENT = Object.freeze({
  ERROR: 'error',
  EXIT: 'exit',
  MESSAGE: 'message',
});
const CELL_OPERATION_TYPE = Object.freeze({
  START: 'start',
  STOP: 'stop',
});
const WASI_COMPONENT_CELL_ERROR_MESSAGE = Object.freeze({
  ALREADY_INVOKING: 'Component instance already has an active invocation',
  INVOCATION_FAILED: 'Component invocation failed',
  NOT_READY: 'Component instance is not ready',
  START_FAILED: 'Component startup failed',
  STOPPED: 'Component instance stopped',
});
const CELL_RUNTIME_MODULE_LOCATION =
  resolveModuleDirectory(resolveModuleDirectory);
const CELL_RUNTIME_MODULE_DIR =
  CELL_RUNTIME_MODULE_LOCATION.startsWith('file:') ?
    fileURLToPath(CELL_RUNTIME_MODULE_LOCATION) :
    CELL_RUNTIME_MODULE_LOCATION;

const WASI_COMPONENT_CELL_ERROR_CODE = Object.freeze({
  BUDGET_EXHAUSTED: 'request_cell_budget_exhausted',
  COMPONENT_FAILED: 'request_cell_component_failed',
  COMPONENT_UNAVAILABLE: 'request_cell_component_unavailable',
  CONCURRENT_INVOCATION: 'request_cell_concurrent_invocation',
  START_FAILED: 'request_cell_start_failed',
});

const CELL_MESSAGE = Object.freeze({
  INVOKE: 'invoke',
  INVOKE_RESULT: 'invoke_result',
  PING: 'ping',
  PONG: 'pong',
  READY: 'ready',
  START_FAILED: 'start_failed',
});

class WasiComponentCellError extends Error {
  constructor(code, message, options = {}) {
    super(message, {cause: options.cause});
    this.name = WASI_COMPONENT_CELL_ERROR_NAME;
    this.code = code;
  }
}

function encodedBytes(value) {
  return Buffer.byteLength(
    JSON.stringify(
      value,
      (_key, entry) => typeof entry === 'bigint' ? String(entry) : entry,
    ),
    BYTE_ENCODING,
  );
}

function budgetFailure(field, actual, limit) {
  return new WasiComponentCellError(
    WASI_COMPONENT_CELL_ERROR_CODE.BUDGET_EXHAUSTED,
    `Binding ${field} budget exhausted (${actual} > ${limit})`,
  );
}

function invocationWallBudget(state, options) {
  const configuredBudgetMs = state.cell.budgets.wall_time_ms;
  const configuredDeadlineMs = Date.now() + configuredBudgetMs;
  const deadlineMs =
    Number.isFinite(options.deadlineMs) ?
      Math.min(configuredDeadlineMs, options.deadlineMs) :
      configuredDeadlineMs;
  return Object.freeze({
    configuredBudgetMs,
    deadlineMs,
    startedAtMs: deadlineMs - configuredBudgetMs,
  });
}

// Attach the per-invocation host-call channel (descriptor in the invoke
// payload + async responder on this thread) when an authorized binding
// call delegate is present. Mode restriction: call-mode Cells never get
// a live bridge, even when the options carry a delegate.
function attachInvocationHostCall(state, payload, options) {
  if (typeof options.bindingCallDelegate !== 'function' ||
      state.cell.world === CELL_WORLD.CALL) {
    return null;
  }
  const descriptor = createHostCallDescriptor();
  payload.hostCall = {descriptor};
  return createParentHostCallResponder({
    delegate: options.bindingCallDelegate,
    descriptor,
  });
}

function releaseInvocationHostCall(state) {
  state.hostCallResponder?.retire();
  state.hostCallResponder = null;
}

function resolveCellWorkerPath() {
  return resolvePackagedRuntimeFile({
    bundledFileName: CELL_WORKER_BUNDLE_FILE,
    moduleDir: CELL_RUNTIME_MODULE_DIR,
    sourceFileName: CELL_WORKER_SOURCE_FILE,
  });
}

class WasiComponentCellRuntime {
  constructor(options = {}) {
    this.cells = new Map();
    this.operations = new Map();
    this.nextGeneration = 1;
    this.nextMessageId = 1;
    this.workerPath = options.workerPath || resolveCellWorkerPath();
  }

  get instanceCount() {
    return this.cells.size;
  }

  start(cell) {
    return this.scheduleOperation(
      cell.serviceId,
      CELL_OPERATION_TYPE.START,
      () => this._start(cell),
    );
  }

  scheduleOperation(serviceId, type, execute) {
    const current = this.operations.get(serviceId);
    if (current?.type === type) return current.promise;
    const promise = Promise.resolve(current?.promise)
      .catch(() => {})
      .then(execute)
      .finally(() => {
        if (this.operations.get(serviceId)?.promise === promise) {
          this.operations.delete(serviceId);
        }
      });
    this.operations.set(serviceId, {promise, type});
    return promise;
  }

  workerDataForCell(cell) {
    return {
      bytes: new Uint8Array(cell.bytes),
      capabilities: cell.capabilities,
      contextBytes: cell.budgets.context_bytes,
      exportName: cell.exportName,
      memoryBytes: cell.budgets.memory_bytes,
      requestCellWorker: true,
      world: cell.world === CELL_WORLD.CALL ?
        CELL_WORLD.CALL :
        CELL_WORLD.REQUEST,
    };
  }

  async _start(cell) {
    const existing = this.cells.get(cell.serviceId);
    if (existing && await this.health(cell.serviceId)) return;
    if (existing) await this._stop(cell.serviceId);

    const worker = new Worker(this.workerPath, {
      workerData: this.workerDataForCell(cell),
    });
    const state = {
      busy: false,
      cell,
      componentInvocationCount: 0,
      generation: `request-cell-generation-${this.nextGeneration}`,
      hostCallResponder: null,
      pending: new Map(),
      ready: false,
      worker,
    };
    this.nextGeneration += 1;
    this.cells.set(cell.serviceId, state);
    worker.on(
      CELL_WORKER_EVENT.MESSAGE,
      (message) => this.onMessage(state, message),
    );
    worker.on(
      CELL_WORKER_EVENT.ERROR,
      (error) => this.onWorkerFailure(state, error),
    );
    worker.on(CELL_WORKER_EVENT.EXIT, (code) => {
      if (this.cells.get(cell.serviceId) !== state) return;
      this.onWorkerFailure(
        state,
        new Error(`Component worker exited with code ${code}`),
      );
    });
    await this.waitForReady(state);
  }

  onMessage(state, message) {
    if (message.type === CELL_MESSAGE.READY) {
      state.ready = true;
      state.readyResolve?.();
      return;
    }
    if (message.type === HOST_CALL_MESSAGE.REQUEST) {
      // Fire-and-forget: the responder resolves the delegate on this
      // thread and answers through the shared buffer, never blocking the
      // parent message loop. handleRequest never rejects.
      void state.hostCallResponder?.handleRequest(message);
      return;
    }
    if (message.type === CELL_MESSAGE.START_FAILED) {
      state.readyReject?.(new WasiComponentCellError(
        message.error?.code ||
          WASI_COMPONENT_CELL_ERROR_CODE.START_FAILED,
        message.error?.message ||
          WASI_COMPONENT_CELL_ERROR_MESSAGE.START_FAILED,
      ));
      return;
    }
    this.onOperationMessage(state, message);
  }

  onOperationMessage(state, message) {
    const pending = state.pending.get(message.id);
    if (!pending) return;
    state.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) {
      pending.reject(new WasiComponentCellError(
        message.error.code ||
          WASI_COMPONENT_CELL_ERROR_CODE.COMPONENT_FAILED,
        message.error.message ||
          WASI_COMPONENT_CELL_ERROR_MESSAGE.INVOCATION_FAILED,
      ));
    } else {
      pending.resolve(message);
    }
  }

  onWorkerFailure(state, error) {
    state.ready = false;
    state.readyReject?.(new WasiComponentCellError(
      WASI_COMPONENT_CELL_ERROR_CODE.START_FAILED,
      error.message,
      {cause: error},
    ));
    for (const pending of state.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new WasiComponentCellError(
        WASI_COMPONENT_CELL_ERROR_CODE.COMPONENT_UNAVAILABLE,
        error.message,
        {cause: error},
      ));
    }
    state.pending.clear();
    if (this.cells.get(state.cell.serviceId) === state) {
      this.cells.delete(state.cell.serviceId);
    }
  }

  waitForReady(state) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new WasiComponentCellError(
          WASI_COMPONENT_CELL_ERROR_CODE.START_FAILED,
          'Component startup timed out',
        ));
      }, STARTUP_TIMEOUT_MS);
      state.readyResolve = () => {
        clearTimeout(timer);
        resolve();
      };
      state.readyReject = (error) => {
        clearTimeout(timer);
        reject(error);
      };
    }).catch(async (error) => {
      await this._stop(state.cell.serviceId);
      throw error;
    });
  }

  send(
    state,
    type,
    payload,
    timeoutMs,
    budgetLimitMs = timeoutMs,
  ) {
    const id = this.nextMessageId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(id);
        reject(budgetFailure(
          CELL_BUDGET_FIELD.WALL_TIME_MS,
          budgetLimitMs + WALL_BUDGET_EXHAUSTED_ACTUAL_OFFSET_MS,
          budgetLimitMs,
        ));
      }, timeoutMs);
      state.pending.set(id, {reject, resolve, timer});
      state.worker.postMessage({...payload, id, type});
    });
  }

  async health(serviceId) {
    const state = this.cells.get(serviceId);
    if (!state?.ready) return false;
    try {
      const result = await this.send(
        state,
        CELL_MESSAGE.PING,
        {},
        HEALTH_TIMEOUT_MS,
      );
      return result.type === CELL_MESSAGE.PONG;
    } catch {
      await this._stop(serviceId);
      return false;
    }
  }

  witness(serviceId) {
    const state = this.cells.get(serviceId);
    if (!state?.ready) return null;
    return Object.freeze({
      componentInvocationCount: state.componentInvocationCount,
      generation: state.generation,
      serviceId,
    });
  }

  requireInvocationState(serviceId) {
    const state = this.cells.get(serviceId);
    if (!state?.ready) {
      throw new WasiComponentCellError(
        WASI_COMPONENT_CELL_ERROR_CODE.COMPONENT_UNAVAILABLE,
        WASI_COMPONENT_CELL_ERROR_MESSAGE.NOT_READY,
      );
    }
    if (state.busy) {
      throw new WasiComponentCellError(
        WASI_COMPONENT_CELL_ERROR_CODE.CONCURRENT_INVOCATION,
        WASI_COMPONENT_CELL_ERROR_MESSAGE.ALREADY_INVOKING,
      );
    }
    return state;
  }

  async requireInputBudget(serviceId, state, args) {
    const inputBytes = encodedBytes(args);
    if (inputBytes <= state.cell.budgets.input_bytes) return;
    await this.stop(serviceId);
    throw budgetFailure(
      CELL_BUDGET_FIELD.INPUT_BYTES,
      inputBytes,
      state.cell.budgets.input_bytes,
    );
  }

  async readInvocationContexts(
    state,
    readContexts,
    wallBudget,
    cancelOperation,
  ) {
    const tableReads = await this.runWithinWallBudget(
      () => readContexts(wallBudget),
      wallBudget.deadlineMs,
      wallBudget.configuredBudgetMs,
      cancelOperation,
    );
    const contextBytes = encodedBytes(tableReads);
    if (contextBytes > state.cell.budgets.context_bytes) {
      throw budgetFailure(
        CELL_BUDGET_FIELD.CONTEXT_BYTES,
        contextBytes,
        state.cell.budgets.context_bytes,
      );
    }
    try {
      indexRequestCellTableReads(
        tableReads,
        requestCellTableIndexRowBound(
          state.cell.budgets.context_bytes,
        ),
      );
    } catch (error) {
      if (!(error instanceof RequestCellTableReadBoundError)) throw error;
      throw budgetFailure(
        CELL_BUDGET_FIELD.CONTEXT_BYTES,
        requestCellTableIndexEstimatedBytes(error.actualRows),
        state.cell.budgets.context_bytes,
      );
    }
    return tableReads;
  }

  async invokeComponent(state, args, tableReads, wallBudget, options) {
    const initialCpu = await state.worker.cpuUsage();
    if (typeof options.beforeComponentInvoke === 'function') {
      options.beforeComponentInvoke();
    }
    const cpuMonitor = this.monitorCpuBudget(
      state,
      initialCpu,
      state.cell.budgets.cpu_time_ms,
    );
    const payload = {
      args,
      deadlineMs: wallBudget.deadlineMs,
      tableReads,
      tables: options.tables || [],
    };
    if (options.exportName !== undefined) {
      payload.exportName = options.exportName;
    }
    state.hostCallResponder =
      attachInvocationHostCall(state, payload, options);
    let emitBuffer;
    if (options.callContext !== undefined) {
      emitBuffer = new SharedArrayBuffer(CELL_EMIT_BUFFER_BYTES);
      payload.callContext = {
        emitBudget: Number.isSafeInteger(options.callContext.emitBudget) ?
          options.callContext.emitBudget :
          0,
        emitBuffer,
        nestedCallBudget:
          Number.isSafeInteger(options.callContext.nestedCallBudget) ?
            options.callContext.nestedCallBudget :
            0,
        onCallBounded: options.callContext.onCallBounded === true,
      };
    }
    let result;
    try {
      result = await Promise.race([
        this.send(
          state,
          CELL_MESSAGE.INVOKE,
          payload,
          this.remainingWallBudgetMs(
            wallBudget.deadlineMs,
            wallBudget.configuredBudgetMs,
          ),
          wallBudget.configuredBudgetMs,
        ),
        cpuMonitor.promise,
      ]);
    } finally {
      cpuMonitor.cancel();
      // Late host-call responses after the invocation settles are
      // dropped: retiring the responder closes the shared channel.
      releaseInvocationHostCall(state);
    }
    state.componentInvocationCount += 1;
    await this.assertCpuBudget(
      state,
      initialCpu,
      state.cell.budgets.cpu_time_ms,
    );
    if (emitBuffer !== undefined) {
      result = this.attachCallEmitPartials(result, emitBuffer);
    }
    return result;
  }

  attachCallEmitPartials(result, emitBuffer) {
    const meta = new Int32Array(emitBuffer, 0, CELL_EMIT_BUFFER_META_SLOTS);
    const length = Atomics.load(meta, CELL_EMIT_LENGTH_INDEX);
    const errorCode = Atomics.load(meta, CELL_EMIT_ERROR_INDEX);
    const byteOffset =
      CELL_EMIT_BUFFER_META_SLOTS * Int32Array.BYTES_PER_ELEMENT;
    const bytes = new Uint8Array(emitBuffer, byteOffset, length);
    const partialsJson = Buffer.from(bytes).toString(BYTE_ENCODING);
    if (errorCode !== 0 || partialsJson === CELL_EMIT_OVERFLOW_MARKER) {
      throw budgetFailure(
        CELL_BUDGET_FIELD.CONTEXT_BYTES,
        CELL_EMIT_BUFFER_BYTES,
        CELL_EMIT_BUFFER_BYTES,
      );
    }
    return {...result, partials: JSON.parse(partialsJson)};
  }

  requireResultBudgets(state, result, tableReads) {
    const outputBytes = encodedBytes(result.value);
    if (outputBytes > state.cell.budgets.output_bytes) {
      throw budgetFailure(
        CELL_BUDGET_FIELD.OUTPUT_BYTES,
        outputBytes,
        state.cell.budgets.output_bytes,
      );
    }
    const contextBytes = encodedBytes({
      effects: result.effects,
      reads: tableReads,
    });
    if (contextBytes > state.cell.budgets.context_bytes) {
      throw budgetFailure(
        CELL_BUDGET_FIELD.CONTEXT_BYTES,
        contextBytes,
        state.cell.budgets.context_bytes,
      );
    }
  }

  async invoke(
    serviceId,
    args,
    readContexts,
    writeEffects,
    cancelOperation = () => {},
    options = {},
  ) {
    const state = this.requireInvocationState(serviceId);
    state.busy = true;
    try {
      const wallBudget = invocationWallBudget(state, options);
      await this.requireInputBudget(serviceId, state, args);
      const tableReads = await this.readInvocationContexts(
        state,
        readContexts,
        wallBudget,
        cancelOperation,
      );
      const result = await this.invokeComponent(
        state,
        args,
        tableReads,
        wallBudget,
        options,
      );
      this.requireResultBudgets(state, result, tableReads);
      await this.runWithinWallBudget(
        () => writeEffects(result.effects, wallBudget),
        wallBudget.deadlineMs,
        wallBudget.configuredBudgetMs,
        cancelOperation,
      );
      if (result.partials !== undefined) {
        return {partials: result.partials, value: result.value};
      }
      return result.value;
    } catch (error) {
      if (error?.preserveReplicaState !== true) {
        cancelOperation(error.message);
        await this.stop(serviceId);
      }
      throw error;
    } finally {
      state.busy = false;
    }
  }

  remainingWallBudgetMs(deadlineMs, limitMs) {
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) {
      throw budgetFailure(
        CELL_BUDGET_FIELD.WALL_TIME_MS,
        limitMs + WALL_BUDGET_EXHAUSTED_ACTUAL_OFFSET_MS,
        limitMs,
      );
    }
    return remainingMs;
  }

  async runWithinWallBudget(
    operation,
    deadlineMs,
    limitMs,
    cancelOperation,
  ) {
    const remainingMs = this.remainingWallBudgetMs(deadlineMs, limitMs);
    let timer = null;
    try {
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            cancelOperation(
              `Binding ${CELL_BUDGET_FIELD.WALL_TIME_MS} budget exhausted`,
            );
            reject(budgetFailure(
              CELL_BUDGET_FIELD.WALL_TIME_MS,
              limitMs + WALL_BUDGET_EXHAUSTED_ACTUAL_OFFSET_MS,
              limitMs,
            ));
          }, remainingMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async assertCpuBudget(state, initialCpu, limitMs) {
    const usage = await state.worker.cpuUsage(initialCpu);
    const actualMs = Math.ceil(
      (usage.system + usage.user) / 1_000,
    );
    if (actualMs > limitMs) {
      throw budgetFailure(
        CELL_BUDGET_FIELD.CPU_TIME_MS,
        actualMs,
        limitMs,
      );
    }
  }

  monitorCpuBudget(state, initialCpu, limitMs) {
    let active = true;
    let timer = null;
    const promise = new Promise((resolve, reject) => {
      const sample = async () => {
        if (!active) return;
        try {
          await this.assertCpuBudget(state, initialCpu, limitMs);
          timer = setTimeout(sample, CPU_SAMPLE_INTERVAL_MS);
          timer.unref();
        } catch (error) {
          reject(error);
        }
      };
      timer = setTimeout(sample, CPU_SAMPLE_INTERVAL_MS);
      timer.unref();
    });
    return {
      cancel() {
        active = false;
        if (timer) clearTimeout(timer);
      },
      promise,
    };
  }

  stop(serviceId) {
    return this.scheduleOperation(
      serviceId,
      CELL_OPERATION_TYPE.STOP,
      () => this._stop(serviceId),
    );
  }

  async _stop(serviceId) {
    const state = this.cells.get(serviceId);
    if (!state) return;
    this.cells.delete(serviceId);
    state.ready = false;
    for (const pending of state.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new WasiComponentCellError(
        WASI_COMPONENT_CELL_ERROR_CODE.COMPONENT_UNAVAILABLE,
        WASI_COMPONENT_CELL_ERROR_MESSAGE.STOPPED,
      ));
    }
    state.pending.clear();
    await state.worker.terminate();
  }
}

export {
  WasiComponentCellRuntime,
};
