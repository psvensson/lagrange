import {parentPort, workerData} from 'node:worker_threads';

import {transpileBytes} from '@bytecodealliance/jco-transpile';
import {capComponentCoreMemory} from
  './wasi-component-core-memory-budget.js';

const WORKER_MESSAGE = Object.freeze({
  INVOKE: 'invoke',
  INVOKE_RESULT: 'invoke_result',
  PING: 'ping',
  PONG: 'pong',
  READY: 'ready',
  START_FAILED: 'start_failed',
});

const WORKER_ERROR_CODE = Object.freeze({
  CAPABILITY_DENIED: 'request_cell_capability_denied',
  EXPORT_MISSING: 'request_cell_export_missing',
  INVOCATION_FAILED: 'request_cell_invocation_failed',
  TABLE_READ_DENIED: 'request_cell_table_read_denied',
  TABLE_WRITE_DENIED: 'request_cell_table_write_denied',
});
const WORKER_EVENT = Object.freeze({
  MESSAGE: 'message',
});

class ComponentPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

let selectedExport = null;
let currentEffects = null;
let currentTableReads = null;
let currentTables = null;

function requireTable(index, access) {
  const table = currentTables.find((entry) => entry.slot === index);
  if (!table || !table[access]) {
    const code = access === 'read' ?
      WORKER_ERROR_CODE.TABLE_READ_DENIED :
      WORKER_ERROR_CODE.TABLE_WRITE_DENIED;
    throw new ComponentPolicyError(
      code,
      `Component ${access} access is not configured for table slot ${index}`,
    );
  }
  return table;
}

const componentContext = Object.freeze({
  capability(index) {
    if (workerData.capabilities[index] === undefined) {
      throw new ComponentPolicyError(
        WORKER_ERROR_CODE.CAPABILITY_DENIED,
        `Component capability index ${index} is not declared`,
      );
    }
    return 1;
  },
  read(tableIndex, key) {
    const table = requireTable(tableIndex, 'read');
    const snapshot = currentTableReads.find(
      (entry) => entry.context === table.context,
    );
    const row = snapshot?.rows.find((entry) => entry.key === key);
    return row?.value ?? 0;
  },
  write(tableIndex, key, value) {
    const table = requireTable(tableIndex, 'write');
    currentEffects.push({
      context: table.context,
      key,
      operation: 'write',
      value,
    });
  },
});

async function instantiateComponent() {
  const transpiled = await transpileBytes(
    new Uint8Array(workerData.bytes),
    {
      emitTypescriptDeclarations: false,
      instantiation: 'async',
      name: 'request-cell',
    },
  );
  const boundedCoreModules = capComponentCoreMemory(
    transpiled.files,
    workerData.memoryBytes,
  );
  const moduleBytes = transpiled.files['request-cell.js'];
  const moduleUrl = `data:text/javascript;base64,${
    Buffer.from(moduleBytes).toString('base64')}`;
  const generated = await import(moduleUrl);
  const exports = await generated.instantiate(
    async (path) => globalThis.WebAssembly.compile(
      boundedCoreModules[path] || transpiled.files[path],
    ),
    {'lagrange:cell/context': componentContext},
  );
  selectedExport = exports[workerData.exportName];
  if (typeof selectedExport !== 'function') {
    throw new ComponentPolicyError(
      WORKER_ERROR_CODE.EXPORT_MISSING,
      `Component export '${workerData.exportName}' is unavailable`,
    );
  }
}

async function invoke(message) {
  currentEffects = [];
  currentTableReads = message.tableReads;
  currentTables = Array.isArray(message.tables) ? message.tables : [];
  try {
    const value = await selectedExport(...message.args);
    parentPort.postMessage({
      effects: currentEffects,
      id: message.id,
      type: WORKER_MESSAGE.INVOKE_RESULT,
      value,
    });
  } catch (error) {
    parentPort.postMessage({
      error: {
        code: error.code || WORKER_ERROR_CODE.INVOCATION_FAILED,
        message: error.message,
      },
      id: message.id,
      type: WORKER_MESSAGE.INVOKE_RESULT,
    });
  } finally {
    currentEffects = null;
    currentTableReads = null;
    currentTables = null;
  }
}

parentPort.on(WORKER_EVENT.MESSAGE, (message) => {
  if (message.type === WORKER_MESSAGE.PING) {
    parentPort.postMessage({id: message.id, type: WORKER_MESSAGE.PONG});
  } else if (message.type === WORKER_MESSAGE.INVOKE) {
    void invoke(message);
  }
});

async function startWorker() {
  try {
    await instantiateComponent();
    parentPort.postMessage({type: WORKER_MESSAGE.READY});
  } catch (error) {
    parentPort.postMessage({
      error: {
        code: error.code || WORKER_ERROR_CODE.INVOCATION_FAILED,
        message: error.message,
      },
      type: WORKER_MESSAGE.START_FAILED,
    });
  }
}

void startWorker();
