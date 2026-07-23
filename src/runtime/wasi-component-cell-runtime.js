import {
  Worker,
} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {
  resolveModuleDirectory,
  resolvePackagedRuntimeFile,
} from '../sea/runtime-file-resolution.js';

const BYTE_ENCODING = 'utf8';
const STARTUP_TIMEOUT_MS = 10_000;
const HEALTH_TIMEOUT_MS = 1_000;
const CPU_SAMPLE_INTERVAL_MS = 2;
const CELL_WORKER_SOURCE_FILE = 'wasi-component-cell-worker.js';
const CELL_WORKER_BUNDLE_FILE = 'request-cell-worker.bundle.mjs';
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
  return Buffer.byteLength(JSON.stringify(value), BYTE_ENCODING);
}

function budgetFailure(field, actual, limit) {
  return new WasiComponentCellError(
    WASI_COMPONENT_CELL_ERROR_CODE.BUDGET_EXHAUSTED,
    `Binding ${field} budget exhausted (${actual} > ${limit})`,
  );
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

  async _start(cell) {
    const existing = this.cells.get(cell.serviceId);
    if (existing && await this.health(cell.serviceId)) return;
    if (existing) await this._stop(cell.serviceId);

    const worker = new Worker(this.workerPath, {
      workerData: {
        bytes: new Uint8Array(cell.bytes),
        capabilities: cell.capabilities,
        exportName: cell.exportName,
        memoryBytes: cell.budgets.memory_bytes,
        requestCellWorker: true,
        tables: cell.tables,
      },
    });
    const state = {
      busy: false,
      cell,
      pending: new Map(),
      ready: false,
      worker,
    };
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

  async invoke(
    serviceId,
    args,
    readContexts,
    writeEffects,
    cancelOperation = () => {},
    options = {},
  ) {
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
    const wallTimeLimitMs = state.cell.budgets.wall_time_ms;
    const configuredDeadlineMs = Date.now() + wallTimeLimitMs;
    const wallDeadlineMs =
      Number.isFinite(options.deadlineMs) ?
        Math.min(configuredDeadlineMs, options.deadlineMs) :
        configuredDeadlineMs;
    const inputBytes = encodedBytes(args);
    if (inputBytes > state.cell.budgets.input_bytes) {
      await this.stop(serviceId);
      throw budgetFailure(
        CELL_BUDGET_FIELD.INPUT_BYTES,
        inputBytes,
        state.cell.budgets.input_bytes,
      );
    }
    state.busy = true;
    const wallBudget = Object.freeze({
      configuredBudgetMs: wallTimeLimitMs,
      deadlineMs: wallDeadlineMs,
      startedAtMs: wallDeadlineMs - wallTimeLimitMs,
    });
    try {
      const tableReads = await this.runWithinWallBudget(
        () => readContexts(wallBudget),
        wallDeadlineMs,
        wallTimeLimitMs,
        cancelOperation,
      );
      const initialContextBytes = encodedBytes(tableReads);
      if (initialContextBytes > state.cell.budgets.context_bytes) {
        throw budgetFailure(
          CELL_BUDGET_FIELD.CONTEXT_BYTES,
          initialContextBytes,
          state.cell.budgets.context_bytes,
        );
      }
      const initialCpu = await state.worker.cpuUsage();
      if (typeof options.beforeComponentInvoke === 'function') {
        options.beforeComponentInvoke();
      }
      const cpuMonitor = this.monitorCpuBudget(
        state,
        initialCpu,
        state.cell.budgets.cpu_time_ms,
      );
      let result;
      try {
        result = await Promise.race([
          this.send(
            state,
            CELL_MESSAGE.INVOKE,
            {args, tableReads},
            this.remainingWallBudgetMs(
              wallDeadlineMs,
              wallTimeLimitMs,
            ),
            wallTimeLimitMs,
          ),
          cpuMonitor.promise,
        ]);
      } finally {
        cpuMonitor.cancel();
      }
      await this.assertCpuBudget(
        state,
        initialCpu,
        state.cell.budgets.cpu_time_ms,
      );
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
      await this.runWithinWallBudget(
        () => writeEffects(result.effects, wallBudget),
        wallDeadlineMs,
        wallTimeLimitMs,
        cancelOperation,
      );
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
