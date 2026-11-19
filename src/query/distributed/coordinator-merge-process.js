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
  createMergeError,
  materializeRowObjects,
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
});

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

function handleWorkerExecuteMerge(activeSession, message) {
  const params = message.typedParams ?
    decodeTypedParams(message.typedParams) :
    [];
  const result = activeSession.executeMergeSql(message.sql, params, {
    expectedColumns: message.expectedColumns || null,
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
          handleWorkerExecuteMerge(activeSession, message);
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
    Boolean(child.killed)
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

  acquireWorker(deadlineMs) {
    while (this.idleWorkers.length > 0) {
      const candidate = this.idleWorkers.pop();
      if (candidate.connected && candidate.exitCode === null && !candidate.killed) {
        this.activeCount += 1;
        refChild(candidate);
        return Promise.resolve(candidate);
      }
    }
    if (this.activeCount < this.maxWorkers) {
      this.activeCount += 1;
      const child = this.spawnWorker();
      refChild(child);
      return Promise.resolve(child);
    }
    return new Promise((resolve, reject) => {
      let timer = null;
      const entry = {
        resolve: (worker) => {
          if (timer !== null) clearTimeout(timer);
          resolve(worker);
        },
        reject: (err) => {
          if (timer !== null) clearTimeout(timer);
          reject(err);
        },
      };
      if (Number.isSafeInteger(deadlineMs) && deadlineMs > 0) {
        const waitMs = Math.max(0, deadlineMs - Date.now());
        timer = setTimeout(() => {
          const idx = this.waitQueue.indexOf(entry);
          if (idx >= 0) this.waitQueue.splice(idx, 1);
          reject(createMergeError(
            QUERY_ERROR_CODE.QUERY_EXECUTION_DEADLINE_EXCEEDED,
            PROCESS_ERROR_MSG.DEADLINE_KILLED,
          ));
        }, waitMs);
      }
      this.waitQueue.push(entry);
    });
  }

  releaseWorker(child, usable) {
    if (usable && child.connected && child.exitCode === null && !child.killed) {
      if (this.waitQueue.length > 0) {
        const next = this.waitQueue.shift();
        next.resolve(child);
        return;
      }
      this.activeCount = Math.max(0, this.activeCount - 1);
      unrefChild(child);
      this.idleWorkers.push(child);
      return;
    }
    if (!child.killed && child.exitCode === null) {
      child.kill(KILL_SIGNAL);
    }
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      const replacement = this.spawnWorker();
      refChild(replacement);
      next.resolve(replacement);
      return;
    }
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  sendAndWait(child, payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      let onMessage = null;
      let onExit = null;
      let onError = null;

      const cleanup = () => {
        if (timer !== null) clearTimeout(timer);
        child.removeListener(PROCESS_EVENT.MESSAGE, onMessage);
        child.removeListener(PROCESS_EVENT.EXIT, onExit);
        child.removeListener(PROCESS_EVENT.ERROR, onError);
      };

      onMessage = (response) => {
        if (settled) return;
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

      if (Number.isFinite(timeoutMs) && timeoutMs >= 0) {
        timer = setTimeout(() => {
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
        }, timeoutMs);
      }

      child.on(PROCESS_EVENT.MESSAGE, onMessage);
      child.once(PROCESS_EVENT.EXIT, onExit);
      child.once(PROCESS_EVENT.ERROR, onError);
      child.send(payload);
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
    const deadlineMs = sessionOptions.deadlineMs ?? null;
    const child = await this.acquireWorker(deadlineMs);
    let workerUsable = true;
    try {
      const timeoutMs = this.computeRemainingTimeoutMs(budget, deadlineMs);
      await this.sendAndWait(child, {
        type: IPC_MSG_TYPE.INIT_SESSION,
        sessionOptions: {...sessionOptions, budget},
        tables: serializeInitTables(request.tables),
      }, timeoutMs);

      const tables = Array.isArray(request.tables) ? request.tables : [];
      for (const table of tables) {
        await this.forwardTableFragments(child, table, budget, deadlineMs);
      }

      const typedParams = encodeTypedParams(request.params || []);
      const mergeTimeoutMs = this.computeRemainingTimeoutMs(budget, deadlineMs);
      const response = await this.sendAndWait(child, {
        type: IPC_MSG_TYPE.EXECUTE_MERGE,
        sql: request.sql,
        typedParams,
        expectedColumns: request.expectedColumns || null,
      }, mergeTimeoutMs);

      const decoded = decodeTypedRowSet(response.rowSet);
      return {
        columns: decoded.columns,
        rawRows: decoded.rows,
        rows: materializeRowObjects(decoded.columns, decoded.rows),
        rowSet: response.rowSet,
        byteLength: response.byteLength,
      };
    } catch (error) {
      if (isFatalWorkerCondition(error, child)) {
        workerUsable = false;
      }
      throw error;
    } finally {
      this.releaseWorker(child, workerUsable);
    }
  }

  async forwardTableFragments(child, table, budget, deadlineMs) {
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
        }, timeoutMs);
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
        }, timeoutMs);
        if (end < rows.length) {
          await yieldToEventLoop();
        }
      }
    }
  }

  shutdown() {
    while (this.idleWorkers.length > 0) {
      const worker = this.idleWorkers.pop();
      if (!worker.killed && worker.exitCode === null) {
        worker.kill(KILL_SIGNAL);
      }
    }
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
