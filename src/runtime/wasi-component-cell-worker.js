import {parentPort, workerData} from 'node:worker_threads';

import {transpileBytes} from '@bytecodealliance/jco-transpile';
import {capComponentCoreMemory} from
  './wasi-component-core-memory-budget.js';
import {
  RequestCellTableReadBoundError,
  indexRequestCellTableReads,
  readIndexedRequestCellTable,
  requestCellTableIndexEstimatedBytes,
  requestCellTableIndexRowBound,
} from './request-cell-table-read-index.js';

const WORKER_MESSAGE = Object.freeze({
  INVOKE: 'invoke',
  INVOKE_RESULT: 'invoke_result',
  PING: 'ping',
  PONG: 'pong',
  READY: 'ready',
  START_FAILED: 'start_failed',
});

const WORKER_ERROR_CODE = Object.freeze({
  BUDGET_EXHAUSTED: 'request_cell_budget_exhausted',
  CAPABILITY_DENIED: 'request_cell_capability_denied',
  EXPORT_MISSING: 'request_cell_export_missing',
  INVOCATION_FAILED: 'request_cell_invocation_failed',
  TABLE_READ_DENIED: 'request_cell_table_read_denied',
  TABLE_WRITE_DENIED: 'request_cell_table_write_denied',
});
const CONTEXT_BUDGET_FIELD = 'context_bytes';
const WORKER_EVENT = Object.freeze({
  MESSAGE: 'message',
});
const CELL_WORLD = Object.freeze({
  CALL: 'call-cell',
  REQUEST: 'request-cell',
});
const CELL_IMPORT_NAMESPACE = Object.freeze({
  CALL_CONTEXT: 'lagrange:cell/call-context',
  CONTEXT: 'lagrange:cell/context',
});
const WORKER_DENY_CODE = Object.freeze({
  BUDGET_EXHAUSTED: 'budget-exhausted',
  UNDECLARED_CAPABILITY: 'undeclared-capability',
});
// Closed code set for the typed `binding-call-error` record of
// `lagrange:cell/context#call-binding` (wit/world.wit). The WIT `code`
// field is a string so this host-owned set can grow without resealing
// the ABI; guests must treat unknown codes as non-retryable failures.
const BINDING_CALL_ERROR_CODE = Object.freeze({
  CALL_BRIDGE_UNAVAILABLE: 'call_bridge_unavailable',
  NOT_AVAILABLE_IN_CALL_MODE: 'not_available_in_call_mode',
});
const BRIDGE_UNAVAILABLE_MESSAGE =
  'No request-call bridge is available for this invocation';
const EMIT_BUFFER_META_SLOTS = 2;
const EMIT_LENGTH_INDEX = 0;
const EMIT_ERROR_INDEX = 1;
const EMIT_DATA_OFFSET = EMIT_BUFFER_META_SLOTS * 4;
const EMIT_OVERFLOW_MARKER = '__call_cell_emit_overflow__';
const BYTE_ENCODING = 'utf8';

function createWorkerDeny(code) {
  const error = new Error(code);
  error.payload = code;
  return error;
}

function createBindingCallDeny(code, message) {
  const error = new Error(message);
  error.payload = {code, message, retryable: false};
  return error;
}
const TABLE_ACCESS = Object.freeze({
  READ: 'read',
  WRITE: 'write',
});

class ComponentPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const cellWorld = workerData.world || CELL_WORLD.REQUEST;

let componentExports = null;
let selectedExport = null;
let currentEffects = null;
let currentTableReads = null;
let currentTables = null;
let currentCallContext = null;
let currentBindingCallBridge = null;

function requireTable(index, access) {
  const table = currentTables.find((entry) => entry.slot === index);
  if (!table || !table[access]) {
    const code = access === TABLE_ACCESS.READ ?
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
    const table = requireTable(tableIndex, TABLE_ACCESS.READ);
    return readIndexedRequestCellTable(
      currentTableReads,
      table.context,
      key,
    );
  },
  write(tableIndex, key, value) {
    const table = requireTable(tableIndex, TABLE_ACCESS.WRITE);
    currentEffects.push({
      context: table.context,
      key,
      operation: TABLE_ACCESS.WRITE,
      value,
    });
  },
});

function requireCallInvocationContext(unavailableMessage) {
  if (currentCallContext === null) {
    throw new ComponentPolicyError(
      WORKER_ERROR_CODE.INVOCATION_FAILED,
      unavailableMessage,
    );
  }
  return currentCallContext;
}

function denyNestedCallWhenUndeclared() {
  if (currentCallContext?.onCallBounded !== true) {
    throw createWorkerDeny(WORKER_DENY_CODE.UNDECLARED_CAPABILITY);
  }
  throw createWorkerDeny(WORKER_DENY_CODE.BUDGET_EXHAUSTED);
}

// The invoke payload carries a per-invocation request-call bridge hook
// (installed by the parent runtime for authorized request invocations);
// without one, `call-binding` fails closed with the typed error.
function invokeBindingCallBridge(name, argumentsJson) {
  if (currentBindingCallBridge === null) {
    throw createBindingCallDeny(
      BINDING_CALL_ERROR_CODE.CALL_BRIDGE_UNAVAILABLE,
      BRIDGE_UNAVAILABLE_MESSAGE,
    );
  }
  return currentBindingCallBridge(name, argumentsJson);
}

// Request invocation mode: the full `lagrange:cell/context` surface is
// live; the call-context surface fails closed with the typed deny-code.
const requestModeContextImports = Object.freeze({
  ...componentContext,
  callBinding(name, argumentsJson) {
    return invokeBindingCallBridge(name, argumentsJson);
  },
});
const requestModeCallContextImports = Object.freeze({
  callBounded(_exportName, _argument) {
    throw createWorkerDeny(WORKER_DENY_CODE.UNDECLARED_CAPABILITY);
  },
  emit(_key, _partial) {
    throw createWorkerDeny(WORKER_DENY_CODE.UNDECLARED_CAPABILITY);
  },
});

// Call invocation mode: the request-context surface fails closed by
// invocation mode — explicitly, not incidentally via missing tables.
function denyRequestContextInCallMode(code, surface) {
  return new ComponentPolicyError(
    code,
    `Request ${surface} host import is unavailable in call invocation mode`,
  );
}

const callModeContextImports = Object.freeze({
  callBinding(_name, _argumentsJson) {
    throw createBindingCallDeny(
      BINDING_CALL_ERROR_CODE.NOT_AVAILABLE_IN_CALL_MODE,
      'call-binding host import is unavailable in call invocation mode',
    );
  },
  capability(_index) {
    throw denyRequestContextInCallMode(
      WORKER_ERROR_CODE.CAPABILITY_DENIED,
      'capability',
    );
  },
  read(_tableIndex, _key) {
    throw denyRequestContextInCallMode(
      WORKER_ERROR_CODE.TABLE_READ_DENIED,
      'table read',
    );
  },
  write(_tableIndex, _key, _value) {
    throw denyRequestContextInCallMode(
      WORKER_ERROR_CODE.TABLE_WRITE_DENIED,
      'table write',
    );
  },
});
const callModeCallContextImports = Object.freeze({
  emit(key, partial) {
    const context = requireCallInvocationContext(
      'Call Cell emit host import is unavailable for this invocation',
    );
    if (context.emits.length >= context.emitBudget) {
      throw createWorkerDeny(WORKER_DENY_CODE.BUDGET_EXHAUSTED);
    }
    context.emits.push([key, partial]);
  },
  callBounded(_exportName, _argument) {
    const context = requireCallInvocationContext(
      'Call Cell call-bounded host import is unavailable ' +
        'for this invocation',
    );
    context.nestedCalls += 1;
    if (context.nestedCalls > context.nestedCallBudget) {
      throw createWorkerDeny(WORKER_DENY_CODE.BUDGET_EXHAUSTED);
    }
    return denyNestedCallWhenUndeclared();
  },
});

// Both namespaces are always supplied so a combined service-cell
// component instantiates; the per-Cell invocation mode (workerData.world,
// stamped by the driver) decides which surface is live. No mode gains
// authority merely because the component imports both interfaces.
function resolveWorkerHostImports() {
  const callMode = cellWorld === CELL_WORLD.CALL;
  return Object.freeze({
    [CELL_IMPORT_NAMESPACE.CALL_CONTEXT]: callMode ?
      callModeCallContextImports :
      requestModeCallContextImports,
    [CELL_IMPORT_NAMESPACE.CONTEXT]: callMode ?
      callModeContextImports :
      requestModeContextImports,
  });
}

async function instantiateComponent() {
  const transpiled = await transpileBytes(
    new Uint8Array(workerData.bytes),
    {
      emitTypescriptDeclarations: false,
      instantiation: 'async',
      name: cellWorld,
    },
  );
  const boundedCoreModules = capComponentCoreMemory(
    transpiled.files,
    workerData.memoryBytes,
  );
  const moduleBytes = transpiled.files[`${cellWorld}.js`];
  const moduleUrl = `data:text/javascript;base64,${
    Buffer.from(moduleBytes).toString('base64')}`;
  const generated = await import(moduleUrl);
  componentExports = await generated.instantiate(
    async (path) => globalThis.WebAssembly.compile(
      boundedCoreModules[path] || transpiled.files[path],
    ),
    resolveWorkerHostImports(),
  );
  selectedExport = componentExports[workerData.exportName];
  if (typeof selectedExport !== 'function') {
    throw new ComponentPolicyError(
      WORKER_ERROR_CODE.EXPORT_MISSING,
      `Component export '${workerData.exportName}' is unavailable`,
    );
  }
}

function requireInvocationExport(message) {
  if (message.exportName === undefined) return selectedExport;
  const exported = componentExports[message.exportName];
  if (typeof exported !== 'function') {
    throw new ComponentPolicyError(
      WORKER_ERROR_CODE.EXPORT_MISSING,
      `Component export '${message.exportName}' is unavailable`,
    );
  }
  return exported;
}

function buildWorkerInvocationFailure(error, message) {
  const contextBudgetExceeded =
    error instanceof RequestCellTableReadBoundError;
  return {
    error: {
      code: contextBudgetExceeded ?
        WORKER_ERROR_CODE.BUDGET_EXHAUSTED :
        error.code || WORKER_ERROR_CODE.INVOCATION_FAILED,
      message: contextBudgetExceeded ?
        `Binding ${CONTEXT_BUDGET_FIELD} budget exhausted (` +
          `${requestCellTableIndexEstimatedBytes(error.actualRows)} > ` +
          `${workerData.contextBytes})` :
        error.message,
    },
    id: message.id,
    type: WORKER_MESSAGE.INVOKE_RESULT,
  };
}

async function invoke(message) {
  currentEffects = [];
  try {
    currentTableReads = indexRequestCellTableReads(
      message.tableReads,
      requestCellTableIndexRowBound(workerData.contextBytes),
    );
    currentTables = Array.isArray(message.tables) ? message.tables : [];
    const invocationExport = requireInvocationExport(message);
    const value = await invocationExport(...message.args);
    const result = {
      effects: currentEffects,
      id: message.id,
      type: WORKER_MESSAGE.INVOKE_RESULT,
      value,
    };
    flushCallEmits(currentCallContext);
    parentPort.postMessage(result);
  } catch (error) {
    parentPort.postMessage(buildWorkerInvocationFailure(error, message));
  } finally {
    currentEffects = null;
    currentTableReads = null;
    currentTables = null;
    currentCallContext = null;
    currentBindingCallBridge = null;
  }
}

// Per-invocation request-call bridge seam: the request-call bridge quest
// installs a synchronous hook here (built from the invoke payload's
// bridge descriptor). Contract: bridge(name, argumentsJson) -> string;
// typed failures throw with error.payload = {code, message, retryable}
// where code comes from BINDING_CALL_ERROR_CODE.
function resolveMessageBindingCallBridge(message) {
  return typeof message.bindingCallBridge === 'function' ?
    message.bindingCallBridge :
    null;
}

function resolveMessageCallContext(message) {
  if (message.callContext === undefined) return null;
  return {
    emitBudget: Number.isSafeInteger(message.callContext.emitBudget) ?
      message.callContext.emitBudget :
      0,
    emitBuffer: message.callContext.emitBuffer,
    emits: [],
    nestedCallBudget:
      Number.isSafeInteger(message.callContext.nestedCallBudget) ?
        message.callContext.nestedCallBudget :
        0,
    nestedCalls: 0,
    onCallBounded: message.callContext.onCallBounded === true,
  };
}

function flushCallEmits(context) {
  if (context === null) return;
  const partialsJson = JSON.stringify(context.emits);
  const meta = new Int32Array(context.emitBuffer, 0, EMIT_BUFFER_META_SLOTS);
  const capacity = context.emitBuffer.byteLength - EMIT_DATA_OFFSET;
  const encoded = Buffer.from(partialsJson, BYTE_ENCODING);
  const view = new Uint8Array(context.emitBuffer);
  if (encoded.byteLength > capacity) {
    const marker = Buffer.from(EMIT_OVERFLOW_MARKER, BYTE_ENCODING);
    view.set(marker, EMIT_DATA_OFFSET);
    Atomics.store(meta, EMIT_LENGTH_INDEX, marker.byteLength);
    Atomics.store(meta, EMIT_ERROR_INDEX, 1);
    return;
  }
  view.set(encoded, EMIT_DATA_OFFSET);
  Atomics.store(meta, EMIT_LENGTH_INDEX, encoded.byteLength);
}

parentPort.on(WORKER_EVENT.MESSAGE, (message) => {
  if (message.type === WORKER_MESSAGE.PING) {
    parentPort.postMessage({id: message.id, type: WORKER_MESSAGE.PONG});
  } else if (message.type === WORKER_MESSAGE.INVOKE) {
    currentCallContext = resolveMessageCallContext(message);
    currentBindingCallBridge = resolveMessageBindingCallBridge(message);
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
