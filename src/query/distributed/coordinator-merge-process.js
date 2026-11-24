/**
 * CoordinatorMergeProcessPool: bounded child-process pool for
 * COORDINATOR_EVALUATED merge plans (design coordinator-sqlite-merge §2.8).
 *
 * Runs uninterruptible SQLite coordinator work in lazily spawned child
 * processes so deadline or CPU-budget expiration terminates the child via
 * SIGKILL and respawns the slot on demand. Partition fragments are forwarded
 * in chunks of at most 10,000 rows per IPC send with event-loop yields between
 * chunks.
 *
 * @module query/distributed/coordinator-merge-process
 */

import {fork} from 'node:child_process';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

import {NUM} from '../../constants/index.js';
import {
  DEFAULT_QUERY_BUDGET,
  isNormalizedQueryBudget,
  normalizeQueryBudget,
} from '../../wasm-service/query-budget-constants.js';
import {QUERY_ERROR_CODE} from '../query-constants.js';
import {
  assembleTypedRowSet,
  decodeTypedParams,
  decodeTypedRowSet,
  encodeTypedParams,
  encodeTypedRowSet,
} from '../sql-value-codec.js';
import {
  CoordinatorMergeSession,
  buildLazyMergedRowResult,
  createMergeError,
} from './coordinator-merge-session.js';

const WORKER_FLAG = '--lagrange-coordinator-merge-worker';
const WORKER_MODULE_PATH = fileURLToPath(import.meta.url);
const FORWARD_CHUNK_MAX_ROWS = NUM.TEN_THOUSAND;
const DEFAULT_POOL_SIZE = 2;
const KILL_SIGNAL = 'SIGKILL';

const PROCESS_EVENT = Object.freeze({
  DISCONNECT: 'disconnect',
  MESSAGE: 'message',
  EXIT: 'exit',
  ERROR: 'error',
  ABORT: 'abort',
});

const CANCEL_POLL_INTERVAL_MS = NUM.TEN;

const STDIO_MODE = Object.freeze({
  IGNORE: 'ignore',
  IPC: 'ipc',
});

const WORKER_STDIO = Object.freeze([
  STDIO_MODE.IGNORE,
  STDIO_MODE.IGNORE,
  STDIO_MODE.IGNORE,
  STDIO_MODE.IPC,
]);

const IPC_MSG_TYPE = Object.freeze({
  INIT_SESSION: 'INIT_SESSION',
  INIT_ACK: 'INIT_ACK',
  INGEST_CHUNK: 'INGEST_CHUNK',
  INGEST_ACK: 'INGEST_ACK',
  EXECUTE_MERGE: 'EXECUTE_MERGE',
  MERGE_EXECUTION_STARTED: 'MERGE_EXECUTION_STARTED',
  MERGE_RESULT: 'MERGE_RESULT',
  ABORT_SESSION: 'ABORT_SESSION',
  ERROR: 'ERROR',
});

const PROCESS_ERROR_MSG = Object.freeze({
  DEADLINE_KILLED:
    'Coordinator-evaluated merge process killed after exceeding execution time budget',
  CHILD_EXITED:
    'Coordinator-evaluated merge child process exited unexpectedly',
});

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function serializeWorkerError(error) {
  return {
    type: IPC_MSG_TYPE.ERROR,
    code: typeof error?.code === 'string' ? error.code : QUERY_ERROR_CODE.INTERNAL_ERROR,
    message: String(error?.message || error),
    details: error?.details ?? null,
  };
}

function reconstructWorkerError(payload) {
  const hasMessage = typeof payload?.message === 'string' && payload.message.length > 0;
  const error = new Error(hasMessage ? payload.message : PROCESS_ERROR_MSG.CHILD_EXITED);
  if (typeof payload?.code === 'string') {
    error.code = payload.code;
  }
  if (payload?.details && typeof payload.details === 'object') {
    error.details = Object.freeze({...payload.details});
  }
  return error;
}

function createWorkerSessionFromInit(message) {
  const session = new CoordinatorMergeSession(message.sessionOptions || {});
  const tables = Array.isArray(message.tables) ? message.tables : [];
  for (const table of tables) {
    session.createTable(
      table.tableName,
      table.schema || null,
      table.declaredColumns || null,
    );
  }
  return session;
}

async function handleWorkerIngestChunk(activeSession, message) {
  const rowSet = assembleTypedRowSet(message.columns, message.encodedRows);
  await activeSession.ingestTableFragments(message.tableName, [{
    rowSet,
    byteLength: message.byteLength,
    executionEnvelope: message.executionEnvelope ?? null,
  }]);
  process.send({type: IPC_MSG_TYPE.INGEST_ACK});
}

function sendMergeExecutionStartedObservation({sqliteBusy, firstRowStepped}) {
  return new Promise((resolve) => {
    if (!process.connected) {
      resolve();
      return;
    }
    process.send(
      {
        type: IPC_MSG_TYPE.MERGE_EXECUTION_STARTED,
        pid: process.pid,
        sqliteBusy,
        firstRowStepped,
      },
      () => resolve(),
    );
  });
}

async function handleWorkerExecuteMerge(activeSession, message) {
  const params = message.typedParams ?
    decodeTypedParams(message.typedParams) :
    [];
  const expectedColumns = message.expectedColumns || null;
  const result = message.notifyExecutionStarted === true ?
    await activeSession.executeMergeSqlWithObservation(message.sql, params, {
      expectedColumns,
      onSqliteExecutionEntered: sendMergeExecutionStartedObservation,
    }) :
    activeSession.executeMergeSql(message.sql, params, {
      expectedColumns,
    });
  process.send({
    type: IPC_MSG_TYPE.MERGE_RESULT,
    rowSet: result.rowSet,
    byteLength: result.byteLength,
  });
}

function startMergeWorkerLoop() {
  let activeSession = null;

  const closeActiveSession = () => {
    if (activeSession !== null) {
      activeSession.close();
      activeSession = null;
    }
  };

  process.on(PROCESS_EVENT.DISCONNECT, () => {
    closeActiveSession();
    process.exit(0);
  });

  process.on(PROCESS_EVENT.MESSAGE, async (message) => {
    try {
      const msgType = message?.type;
      if (msgType === IPC_MSG_TYPE.INIT_SESSION) {
        closeActiveSession();
        activeSession = createWorkerSessionFromInit(message);
        process.send({type: IPC_MSG_TYPE.INIT_ACK});
        return;
      }
      if (msgType === IPC_MSG_TYPE.INGEST_CHUNK) {
        await handleWorkerIngestChunk(activeSession, message);
        return;
      }
      if (msgType === IPC_MSG_TYPE.EXECUTE_MERGE) {
        try {
          await handleWorkerExecuteMerge(activeSession, message);
        } finally {
          closeActiveSession();
        }
        return;
      }
      if (msgType === IPC_MSG_TYPE.ABORT_SESSION) {
        closeActiveSession();
      }
    } catch (error) {
      closeActiveSession();
      if (process.connected) {
        process.send(serializeWorkerError(error));
      }
    }
  });
}

if (process.argv.includes(WORKER_FLAG)) {
  startMergeWorkerLoop();
}

function resolveFragmentColumnList(fragment, declaredColumns, rows) {
  if (Array.isArray(fragment?.columns)) return fragment.columns;
  if (Array.isArray(rows) && rows.length > 0 && !Array.isArray(rows[0])) {
    return Object.keys(rows[0]);
  }
  return Array.isArray(declaredColumns) ? declaredColumns : [];
}

function toTupleRow(row, columns) {
  if (Array.isArray(row)) return row;
  return columns.map((col) => (row && col in row ? row[col] : null));
}

function normalizeFragmentToRowSet(fragment, declaredColumns = null) {
  const byteLength = fragment?.byteLength ?? 0;
  const executionEnvelope = fragment?.executionEnvelope ?? null;
  if (fragment?.rowSet) {
    return {
      rowSet: fragment.rowSet,
      byteLength,
      executionEnvelope,
    };
  }
  if (Array.isArray(fragment?.rawRows)) {
    const columns = resolveFragmentColumnList(fragment, declaredColumns, null);
    return {
      rowSet: encodeTypedRowSet(columns, fragment.rawRows),
      byteLength,
      executionEnvelope,
    };
  }
  const rows = Array.isArray(fragment?.rows) ? fragment.rows : [];
  const columns = resolveFragmentColumnList(fragment, declaredColumns, rows);
  const tupleRows = rows.map((row) => toTupleRow(row, columns));
  return {
    rowSet: encodeTypedRowSet(columns, tupleRows),
    byteLength,
    executionEnvelope,
  };
}

function unrefChild(child) {
  child.channel?.unref?.();
  child.unref?.();
}

function refChild(child) {
  child.ref?.();
  child.channel?.ref?.();
}

function resolveSessionBudget(sessionOptions) {
  if (isNormalizedQueryBudget(sessionOptions.budget)) {
    return sessionOptions.budget;
  }
  return normalizeQueryBudget(sessionOptions.budget || DEFAULT_QUERY_BUDGET);
}

function resolveRequestDeadlineMs(deadlineMs, timeoutMs) {
  if (Number.isSafeInteger(deadlineMs) && deadlineMs > 0) {
    return deadlineMs;
  }
  if (Number.isSafeInteger(timeoutMs) && timeoutMs > 0) {
    return Date.now() + timeoutMs;
  }
  return null;
}

function buildIpcSessionOptions(sessionOptions, budget, deadlineMs) {
  return {
    budget,
    memoryLimitBytes: sessionOptions.memoryLimitBytes,
    mergeInputMaxRows: sessionOptions.mergeInputMaxRows,
    resultMaxRows: sessionOptions.resultMaxRows,
    resultMaxBytes: sessionOptions.resultMaxBytes,
    deadlineMs,
    expectedEngineEnvelope: sessionOptions.expectedEngineEnvelope ?? null,
  };
}

function isCancellationRequested(sessionOptions) {
  if (sessionOptions?.signal?.aborted === true) return true;
  if (sessionOptions?.cancellationToken?.isCancelled?.() === true) return true;
  return Boolean(sessionOptions?.isCancelled && sessionOptions.isCancelled() === true);
}

function attachCancellationWatcher(sessionOptions, onTrigger) {
  if (!sessionOptions) return () => {};
  const cleanups = [];
  const signal = sessionOptions.signal;
  if (signal && typeof signal === 'object') {
    const onAbort = () => onTrigger();
    signal.addEventListener?.(PROCESS_EVENT.ABORT, onAbort, {once: true});
    cleanups.push(() => signal.removeEventListener?.(PROCESS_EVENT.ABORT, onAbort));
  }
  const token = sessionOptions.cancellationToken;
  if (token?.onCancel) {
    const off = token.onCancel(() => onTrigger());
    if (off) cleanups.push(off);
  }
  if (sessionOptions.isCancelled || (token && !token.onCancel)) {
    const poll = setInterval(() => {
      if (isCancellationRequested(sessionOptions)) {
        onTrigger();
      }
    }, CANCEL_POLL_INTERVAL_MS);
    poll.unref?.();
    cleanups.push(() => clearInterval(poll));
  }
  return () => {
    for (const fn of cleanups) fn();
  };
}

function serializeInitTables(tables) {
  if (!Array.isArray(tables)) return [];
  return tables.map((table) => ({
    tableName: table.tableName,
    schema: table.schema || null,
    declaredColumns: table.declaredColumns || null,
  }));
}

function isFatalWorkerCondition(error, child) {
  return (
    error?.code === QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED ||
    !child.connected ||
    Boolean(child.killed) ||
    child.exitCode !== null
  );
}

class CoordinatorMergeProcessPool {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxWorkers=2]
   * @param {string} [options.spillDir]
   */
  constructor(options = {}) {
    this.maxWorkers = Number.isSafeInteger(options.maxWorkers) && options.maxWorkers > 0 ?
      options.maxWorkers :
      DEFAULT_POOL_SIZE;
    this.spillDir = typeof options.spillDir === 'string' && options.spillDir.length > 0 ?
      options.spillDir :
      os.tmpdir();
    this.idleWorkers = [];
    this.activeWorkers = new Set();
    this.activeCount = 0;
    this.waitQueue = [];
  }

  spawnWorker() {
    const child = fork(WORKER_MODULE_PATH, [WORKER_FLAG], {
      env: {
        ...process.env,
        SQLITE_TMPDIR: this.spillDir,
      },
      stdio: WORKER_STDIO,
    });
    unrefChild(child);
    return child;
  }

  acquireWorker(deadlineMs, sessionOptions = null) {
    if (isCancellationRequested(sessionOptions)) {
      return Promise.reject(createMergeError(
        QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED,
        PROCESS_ERROR_MSG.DEADLINE_KILLED,
      ));
    }
    while (this.idleWorkers.length > 0) {
      const candidate = this.idleWorkers.pop();
      if (candidate.connected && candidate.exitCode === null && !candidate.killed) {
        this.activeCount += 1;
        this.activeWorkers.add(candidate);
        refChild(candidate);
        return Promise.resolve(candidate);
      }
    }
    if (this.activeCount < this.maxWorkers) {
      this.activeCount += 1;
      const child = this.spawnWorker();
      this.activeWorkers.add(child);
      refChild(child);
      return Promise.resolve(child);
    }
    return new Promise((resolve, reject) => {
      let timer = null;
      let detachCancel = null;
      const clearWaiters = () => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        if (detachCancel !== null) {
          const detach = detachCancel;
          detachCancel = null;
          detach();
        }
      };
      const entry = {
        settled: false,
        isCancelled: () => isCancellationRequested(sessionOptions),
        abortWait: () => {
          if (entry.settled) return;
          entry.settled = true;
          const idx = this.waitQueue.indexOf(entry);
          if (idx >= 0) this.waitQueue.splice(idx, 1);
          clearWaiters();
          reject(createMergeError(
            QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED,
            PROCESS_ERROR_MSG.DEADLINE_KILLED,
          ));
        },
        resolve: (worker) => {
          if (entry.settled) return false;
          entry.settled = true;
          clearWaiters();
          resolve(worker);
          return true;
        },
        reject: (err) => {
          if (entry.settled) return false;
          entry.settled = true;
          clearWaiters();
          reject(err);
          return true;
        },
      };
      detachCancel = attachCancellationWatcher(sessionOptions, entry.abortWait);
      if (entry.isCancelled()) {
        entry.abortWait();
        return;
      }
      if (Number.isSafeInteger(deadlineMs) && deadlineMs > 0) {
        const waitMs = Math.max(0, deadlineMs - Date.now());
        timer = setTimeout(entry.abortWait, waitMs);
      }
      this.waitQueue.push(entry);
    });
  }

  dequeueNextLiveWaiter() {
    while (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      if (next.settled) {
        continue;
      }
      if (next.isCancelled()) {
        next.abortWait();
        continue;
      }
      return next;
    }
    return null;
  }

  releaseWorker(child, usable) {
    const next = this.dequeueNextLiveWaiter();
    if (usable && child.connected && child.exitCode === null && !child.killed) {
      if (next !== null) {
        this.activeWorkers.add(child);
        next.resolve(child);
        return;
      }
      this.activeWorkers.delete(child);
      this.activeCount = Math.max(0, this.activeCount - 1);
      unrefChild(child);
      this.idleWorkers.push(child);
      return;
    }
    this.activeWorkers.delete(child);
    if (!child.killed && child.exitCode === null) {
      child.kill(KILL_SIGNAL);
    }
    if (next !== null) {
      const replacement = this.spawnWorker();
      this.activeWorkers.add(replacement);
      refChild(replacement);
      next.resolve(replacement);
      return;
    }
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  sendAndWait(child, payload, timeoutMs, sessionOptions = null) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      let detachCancel = null;
      let listenersAttached = false;
      let onMessage = null;
      let onExit = null;
      let onError = null;

      const cleanup = () => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        if (detachCancel !== null) {
          const detach = detachCancel;
          detachCancel = null;
          detach();
        }
        if (listenersAttached) {
          listenersAttached = false;
          child.removeListener(PROCESS_EVENT.MESSAGE, onMessage);
          child.removeListener(PROCESS_EVENT.EXIT, onExit);
          child.removeListener(PROCESS_EVENT.ERROR, onError);
        }
      };

      const abortChildForDeadlineOrCancel = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (!child.killed && child.exitCode === null) {
          child.kill(KILL_SIGNAL);
        }
        reject(createMergeError(
          QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED,
          PROCESS_ERROR_MSG.DEADLINE_KILLED,
        ));
      };

      if (isCancellationRequested(sessionOptions)) {
        abortChildForDeadlineOrCancel();
        return;
      }

      if (child.killed || !child.connected || child.exitCode !== null) {
        settled = true;
        reject(createMergeError(
          QUERY_ERROR_CODE.INTERNAL_ERROR,
          PROCESS_ERROR_MSG.CHILD_EXITED,
        ));
        return;
      }

      onMessage = (response) => {
        if (settled) return;
        if (response?.type === IPC_MSG_TYPE.MERGE_EXECUTION_STARTED) {
          sessionOptions?.onMergeExecutionStarted?.(response);
          return;
        }
        settled = true;
        cleanup();
        if (response?.type === IPC_MSG_TYPE.ERROR) {
          reject(reconstructWorkerError(response));
          return;
        }
        resolve(response);
      };

      onExit = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(createMergeError(
          QUERY_ERROR_CODE.INTERNAL_ERROR,
          PROCESS_ERROR_MSG.CHILD_EXITED,
        ));
      };

      onError = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      detachCancel = attachCancellationWatcher(
        sessionOptions,
        abortChildForDeadlineOrCancel,
      );
      if (settled) {
        cleanup();
        return;
      }

      if (Number.isFinite(timeoutMs) && timeoutMs >= 0) {
        timer = setTimeout(abortChildForDeadlineOrCancel, timeoutMs);
      }

      listenersAttached = true;
      child.on(PROCESS_EVENT.MESSAGE, onMessage);
      child.once(PROCESS_EVENT.EXIT, onExit);
      child.once(PROCESS_EVENT.ERROR, onError);
      try {
        child.send(payload, (sendErr) => {
          if (sendErr) {
            onError(sendErr);
          }
        });
      } catch (sendErr) {
        onError(sendErr);
      }
    });
  }

  computeRemainingTimeoutMs(budget, deadlineMs) {
    const cpuLimitMs = budget.CPU_TIME_LIMIT_MS;
    const wallLimitMs = budget.WALL_TIME_LIMIT_MS;
    if (Number.isSafeInteger(deadlineMs) && deadlineMs > 0) {
      return Math.min(Math.max(0, deadlineMs - Date.now()), cpuLimitMs);
    }
    return Math.min(wallLimitMs, cpuLimitMs);
  }

  /**
   * Execute a COORDINATOR_EVALUATED merge plan in a pooled child process.
   * @param {Object} request
   * @param {Array<Object>} request.tables - [{tableName, schema, declaredColumns, fragments}]
   * @param {string} request.sql - Coordinator merge SQL.
   * @param {Array<*>} [request.params] - Bound parameters.
   * @param {string[]} [request.expectedColumns] - Expected result column names.
   * @param {Object} [request.sessionOptions] - Budget and envelope options.
   * @return {Promise<{
   *   columns: string[],
   *   rawRows: Array<Array<*>>,
   *   rows: Array<Object>,
   *   rowSet: Object,
   *   byteLength: number
   * }>}
   */
  async execute(request) {
    const sessionOptions = request.sessionOptions || {};
    const budget = resolveSessionBudget(sessionOptions);
    const deadlineMs = resolveRequestDeadlineMs(
      sessionOptions.deadlineMs,
      sessionOptions.timeoutMs,
    );
    const child = await this.acquireWorker(deadlineMs, sessionOptions);
    let workerUsable = true;
    try {
      const timeoutMs = this.computeRemainingTimeoutMs(budget, deadlineMs);
      await this.sendAndWait(child, {
        type: IPC_MSG_TYPE.INIT_SESSION,
        sessionOptions: buildIpcSessionOptions(sessionOptions, budget, deadlineMs),
        tables: serializeInitTables(request.tables),
      }, timeoutMs, sessionOptions);

      const tables = Array.isArray(request.tables) ? request.tables : [];
      for (const table of tables) {
        await this.forwardTableFragments(
          child,
          table,
          budget,
          deadlineMs,
          sessionOptions,
        );
      }

      const typedParams = encodeTypedParams(request.params || []);
      const mergeTimeoutMs = this.computeRemainingTimeoutMs(budget, deadlineMs);
      const response = await this.sendAndWait(child, {
        type: IPC_MSG_TYPE.EXECUTE_MERGE,
        sql: request.sql,
        typedParams,
        expectedColumns: request.expectedColumns || null,
        notifyExecutionStarted: Boolean(sessionOptions.onMergeExecutionStarted),
      }, mergeTimeoutMs, sessionOptions);

      const decoded = decodeTypedRowSet(response.rowSet);
      return buildLazyMergedRowResult(
        decoded.columns,
        decoded.rows,
        response.rowSet,
        response.byteLength,
      );
    } catch (error) {
      if (isFatalWorkerCondition(error, child)) {
        workerUsable = false;
      }
      throw error;
    } finally {
      this.releaseWorker(child, workerUsable);
    }
  }

  async forwardTableFragments(
    child,
    table,
    budget,
    deadlineMs,
    sessionOptions = null,
  ) {
    const fragments = Array.isArray(table.fragments) ? table.fragments : [];
    for (const fragment of fragments) {
      if (!fragment) continue;
      const normalized = normalizeFragmentToRowSet(
        fragment,
        table.declaredColumns || null,
      );
      const {columns, rows} = normalized.rowSet;
      if (rows.length === 0) {
        const timeoutMs = this.computeRemainingTimeoutMs(budget, deadlineMs);
        await this.sendAndWait(child, {
          type: IPC_MSG_TYPE.INGEST_CHUNK,
          tableName: table.tableName,
          columns,
          encodedRows: [],
          byteLength: normalized.byteLength,
          executionEnvelope: normalized.executionEnvelope,
        }, timeoutMs, sessionOptions);
        continue;
      }
      for (let offset = 0; offset < rows.length; offset += FORWARD_CHUNK_MAX_ROWS) {
        const end = Math.min(offset + FORWARD_CHUNK_MAX_ROWS, rows.length);
        const chunkRows = rows.slice(offset, end);
        const chunkBytes = offset === 0 ? normalized.byteLength : 0;
        const timeoutMs = this.computeRemainingTimeoutMs(budget, deadlineMs);
        await this.sendAndWait(child, {
          type: IPC_MSG_TYPE.INGEST_CHUNK,
          tableName: table.tableName,
          columns,
          encodedRows: chunkRows,
          byteLength: chunkBytes,
          executionEnvelope: offset === 0 ? normalized.executionEnvelope : null,
        }, timeoutMs, sessionOptions);
        if (end < rows.length) {
          await yieldToEventLoop();
        }
      }
    }
  }

  shutdown() {
    while (this.waitQueue.length > 0) {
      const entry = this.waitQueue.shift();
      entry.abortWait();
    }
    while (this.idleWorkers.length > 0) {
      const worker = this.idleWorkers.pop();
      if (!worker.killed && worker.exitCode === null) {
        worker.kill(KILL_SIGNAL);
      }
    }
    for (const worker of this.activeWorkers) {
      if (!worker.killed && worker.exitCode === null) {
        worker.kill(KILL_SIGNAL);
      }
    }
    this.activeWorkers.clear();
    this.activeCount = 0;
  }

  close() {
    this.shutdown();
  }
}

let defaultMergeProcessPool = null;

function getDefaultMergeProcessPool() {
  if (defaultMergeProcessPool === null) {
    defaultMergeProcessPool = new CoordinatorMergeProcessPool();
  }
  return defaultMergeProcessPool;
}

export {
  CoordinatorMergeProcessPool,
  getDefaultMergeProcessPool,
};
