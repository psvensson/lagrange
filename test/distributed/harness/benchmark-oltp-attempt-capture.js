// Capture of one physical OLTP attempt on the wire, beneath the canonical
// adapters: every statement the attempt sends and the product's answer to it
// (rows, affected rows, SQLSTATE), the endpoint and server connection id,
// and whether COMMIT was sent. Connections are owned here: a connection whose
// transaction ended unresolved or on a transport failure is destroyed and is
// never reused; the next transaction on that worker opens a fresh one.
import {AsyncLocalStorage} from 'node:async_hooks';

import {
  FAILURE_CLASS,
  OPERATION_OUTCOME,
  classifyBenchmarkAttemptFailure,
  createBenchmarkHarnessFault,
} from './benchmark-operation-outcome.js';
import {
  isOltpTransportError,
  resolveOltpErrorSqlState,
} from './oltp-error-classification.js';

const arrayMap = Function.call.bind(Array.prototype.map);
const stringToUpperCase = Function.call.bind(String.prototype.toUpperCase);
const stringTrim = Function.call.bind(String.prototype.trim);

const STATEMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  OK: 'ok',
  ERROR: 'error',
});
const TRANSACTION_CONTROL = Object.freeze({
  BEGIN: 'BEGIN',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
});
const DESTROYED_CONNECTION_MESSAGE =
  'Connection destroyed after an unresolved or failed transaction';
const DESTROYING_FAILURE_CLASSES = Object.freeze(new Set([
  FAILURE_CLASS.TRANSPORT_FAILURE,
  FAILURE_CLASS.AMBIGUOUS_COMMIT,
]));

const attemptStorage = new AsyncLocalStorage();

const WIRE_FAMILY = Object.freeze({PGWIRE: 'pgwire', MYSQL: 'mysql'});
// The product's acknowledgement of one statement as the client received it.
// A receipt is recorded, never read as a durability witness (ledger D30):
// durability evidence is the final-state reconciliation.
const RECEIPT_KIND = Object.freeze({
  PGWIRE_COMMAND_COMPLETE: 'pgwire-command-complete',
  MYSQL_OK_PACKET: 'mysql-ok-packet',
  MYSQL_RESULT_SET: 'mysql-result-set',
  MYSQL_TRANSACTION_CONTROL: 'mysql-transaction-control',
});
// How a returned column value was encoded on the wire: a recorded dialect
// fact (Lagrange's PG wire returns integers as decimal text).
const COLUMN_ENCODING = Object.freeze({
  NUMBER: 'number',
  DECIMAL_TEXT: 'decimal-text',
  TEXT: 'text',
  OTHER: 'other',
});
const CANONICAL_DECIMAL_TEXT = /^-?(0|[1-9][0-9]*)$/u;
const STATEMENT_VERB = /^\s*([A-Za-z]+)/u;

function createAttemptTrace() {
  return {
    statements: [],
    connections: new Set(),
    commitSent: false,
    commitAcknowledged: false,
    productAnsweredError: false,
    endpoint: null,
    serverConnectionId: null,
  };
}

function controlWord(sql) {
  return stringToUpperCase(stringTrim(String(sql)));
}

function destroyedConnectionError() {
  const error = new Error(DESTROYED_CONNECTION_MESSAGE);
  error.code = 'ECONNRESET';
  return error;
}

function rowsOfResult(result) {
  if (Array.isArray(result?.rows)) return result.rows;
  return Array.isArray(result) ? result : null;
}

function receiptOf(family, raw, sql) {
  if (family === WIRE_FAMILY.PGWIRE) {
    return Object.freeze({kind: RECEIPT_KIND.PGWIRE_COMMAND_COMPLETE,
      command: typeof raw.command === 'string' ? raw.command : null,
      // An unreported count stays unreported.
      rowCount: Number.isInteger(raw.rowCount) ? raw.rowCount : null});
  }
  if (raw === null) {
    return Object.freeze({kind: RECEIPT_KIND.MYSQL_TRANSACTION_CONTROL,
      statementVerb: controlWord(sql)});
  }
  if (Array.isArray(raw)) {
    return Object.freeze({kind: RECEIPT_KIND.MYSQL_RESULT_SET, rowCount: raw.length});
  }
  return Object.freeze({kind: RECEIPT_KIND.MYSQL_OK_PACKET,
    statementVerb: STATEMENT_VERB.exec(sql)[1],
    affectedRows: Number.isInteger(raw.affectedRows) ? raw.affectedRows : null,
    changedRows: Number.isInteger(raw.changedRows) ? raw.changedRows : null});
}

function encodingOf(value) {
  if (typeof value === 'number') return COLUMN_ENCODING.NUMBER;
  if (typeof value === 'string') {
    return CANONICAL_DECIMAL_TEXT.test(value) ? COLUMN_ENCODING.DECIMAL_TEXT :
      COLUMN_ENCODING.TEXT;
  }
  return COLUMN_ENCODING.OTHER;
}

// Per column, the set of encodings observed across the returned rows.
function columnEncodingsOf(rows) {
  if (!Array.isArray(rows)) return null;
  const byColumn = new Map();
  for (const row of rows) {
    for (const [column, value] of Object.entries(row)) {
      if (value === null) continue;
      if (!byColumn.has(column)) byColumn.set(column, new Set());
      byColumn.get(column).add(encodingOf(value));
    }
  }
  return Object.freeze(Object.fromEntries(arrayMap([...byColumn],
    ([column, encodings]) => [column, [...encodings].sort().join('|')])));
}

function affectedRowsOfResult(result) {
  if (Number.isInteger(result?.rowCount)) return result.rowCount;
  if (Number.isInteger(result?.affectedRows)) return result.affectedRows;
  return null;
}

// One statement's exchange, appended to the attempt that sent it. Statements
// sent outside an attempt (dataset load, snapshots) are not traced.
async function traceStatement(connection, sql, send) {
  const trace = attemptStorage.getStore();
  if (!trace) return send();
  trace.connections.add(connection);
  trace.endpoint = connection.endpoint;
  trace.serverConnectionId = connection.serverConnectionId;
  const word = controlWord(sql);
  if (word === TRANSACTION_CONTROL.COMMIT) trace.commitSent = true;
  const statement = {sql: String(sql), status: STATEMENT_STATUS.PENDING};
  trace.statements.push(statement);
  try {
    const result = await send();
    statement.status = STATEMENT_STATUS.OK;
    statement.affectedRows = affectedRowsOfResult(result.raw);
    statement.rows = rowsOfResult(result.raw);
    statement.receipt = receiptOf(connection.family, result.raw, sql);
    statement.columnEncodings = columnEncodingsOf(statement.rows);
    if (word === TRANSACTION_CONTROL.COMMIT) trace.commitAcknowledged = true;
    return result;
  } catch (error) {
    statement.status = STATEMENT_STATUS.ERROR;
    statement.sqlState = resolveOltpErrorSqlState(error);
    statement.code = typeof error?.code === 'string' ? error.code : null;
    statement.message = String(error?.message || error);
    if (!isOltpTransportError(error)) trace.productAnsweredError = true;
    throw error;
  }
}

function endpointLabel(options) {
  return options?.host ? `${options.host}:${options.port}` : null;
}

function createConnectionRegistry() {
  return {
    connections: new Set(),
    inFlight: new Set(),
    destroyed: 0,
    // A destroyed connection whose close also failed: kept, never swallowed.
    destroyFailures: [],
  };
}

// The connection lifecycle shared by both wire families: a destroyed
// connection reopens only at a transaction start, never mid-transaction.
function createLifecycle(registry, family, open, closeInner, destroyInner) {
  const connection = {
    family,
    inner: null,
    destroyed: false,
    inTransaction: false,
    endpoint: null,
    serverConnectionId: null,
    async ensureOpen(word) {
      if (connection.inner && !connection.destroyed) return;
      if (connection.destroyed && word !== TRANSACTION_CONTROL.BEGIN) {
        throw destroyedConnectionError();
      }
      await open(connection);
      connection.destroyed = false;
    },
    track(word) {
      if (word === TRANSACTION_CONTROL.BEGIN) connection.inTransaction = true;
      if (word === TRANSACTION_CONTROL.COMMIT || word === TRANSACTION_CONTROL.ROLLBACK) {
        connection.inTransaction = false;
      }
    },
    destroy() {
      if (connection.destroyed || !connection.inner) return;
      connection.destroyed = true;
      connection.inTransaction = false;
      registry.destroyed += 1;
      destroyInner(connection.inner, registry);
      connection.inner = null;
    },
    async end() {
      registry.connections.delete(connection);
      if (connection.inner && !connection.destroyed) await closeInner(connection.inner);
      connection.inner = null;
    },
  };
  registry.connections.add(connection);
  return connection;
}

function recordDestroyFailure(registry, error) {
  registry.destroyFailures.push(String(error?.message || error));
}

// pg has no destroy(): the socket is destroyed, then end() releases the
// client; a failure of either is recorded on the registry.
function destroyPgInner(inner, registry) {
  try {
    inner.connection.stream.destroy();
  } catch (error) {
    recordDestroyFailure(registry, error);
  }
  Promise.resolve(inner.end()).catch((error) => recordDestroyFailure(registry, error));
}

// pg-protocol clients (Lagrange public PG wire, PostgreSQL).
function createTrackedPgClientFactory(baseFactory, registry) {
  return (options) => {
    const connection = createLifecycle(registry, WIRE_FAMILY.PGWIRE, async (target) => {
      const inner = baseFactory(options);
      await inner.connect();
      target.inner = inner;
      target.endpoint = endpointLabel(options);
      target.serverConnectionId = Number.isInteger(inner.processID) ? inner.processID : null;
    }, (inner) => inner.end(), destroyPgInner);
    return {
      async connect() {
        await connection.ensureOpen(TRANSACTION_CONTROL.BEGIN);
      },
      async query(sql, parameters) {
        const word = controlWord(sql);
        return (await traceStatement(connection, sql, async () => {
          await connection.ensureOpen(word);
          const result = await connection.inner.query(sql, parameters);
          connection.track(word);
          return {raw: result, value: result};
        })).value;
      },
      async end() {
        await connection.end();
      },
    };
  };
}

function destroyMysqlInner(inner, registry) {
  try {
    inner.destroy();
  } catch (error) {
    recordDestroyFailure(registry, error);
  }
}

// mysql2 connections (TiDB).
function createTrackedMysqlConnectionFactory(baseFactory, registry) {
  return async (options) => {
    const connection = createLifecycle(registry, WIRE_FAMILY.MYSQL, async (target) => {
      const inner = await baseFactory(options);
      target.inner = inner;
      target.endpoint = endpointLabel(options);
      target.serverConnectionId = Number.isInteger(inner.threadId) ? inner.threadId : null;
    }, (inner) => inner.end(), destroyMysqlInner);
    await connection.ensureOpen(TRANSACTION_CONTROL.BEGIN);
    const send = (word, sql, invoke) => traceStatement(connection, sql, async () => {
      await connection.ensureOpen(word);
      const result = await invoke(connection.inner);
      connection.track(word);
      return result;
    });
    const wrapped = (result) => ({raw: result[0], value: result});
    return {
      async beginTransaction() {
        await send(TRANSACTION_CONTROL.BEGIN, TRANSACTION_CONTROL.BEGIN,
          async (inner) => ({raw: null, value: await inner.beginTransaction()}));
      },
      async commit() {
        await send(TRANSACTION_CONTROL.COMMIT, TRANSACTION_CONTROL.COMMIT,
          async (inner) => ({raw: null, value: await inner.commit()}));
      },
      async rollback() {
        await send(TRANSACTION_CONTROL.ROLLBACK, TRANSACTION_CONTROL.ROLLBACK,
          async (inner) => ({raw: null, value: await inner.rollback()}));
      },
      async execute(sql, parameters) {
        return (await send(controlWord(sql), sql,
          async (inner) => wrapped(await inner.execute(sql, parameters)))).value;
      },
      async query(sql, parameters) {
        return (await send(controlWord(sql), sql,
          async (inner) => wrapped(await inner.query(sql, parameters)))).value;
      },
      async end() {
        await connection.end();
      },
      destroy() {
        connection.destroy();
      },
    };
  };
}

function attemptEvidenceOf(trace) {
  return Object.freeze({
    endpoint: trace.endpoint,
    serverConnectionId: trace.serverConnectionId,
    commitSent: trace.commitSent,
    productAnsweredError: trace.productAnsweredError,
    statements: Object.freeze(arrayMap(trace.statements, (statement) =>
      Object.freeze({...statement}))),
  });
}

function destroyTraceConnections(trace) {
  for (const connection of trace.connections) connection.destroy();
}

// Wraps a canonical adapter: an attempt is committed only when the executor
// returned (its success invariants held) and the product acknowledged COMMIT.
function createBenchmarkOutcomeAdapter(adapter, registry) {
  return Object.freeze({
    async executeTransaction(operation) {
      const trace = createAttemptTrace();
      registry.inFlight.add(trace);
      try {
        const result = await attemptStorage.run(trace,
          () => adapter.executeTransaction(operation));
        if (!trace.commitAcknowledged) {
          throw createBenchmarkHarnessFault(
            'OLTP adapter returned without an acknowledged COMMIT');
        }
        return Object.freeze({
          outcome: OPERATION_OUTCOME.COMMITTED,
          result,
          attemptEvidence: attemptEvidenceOf(trace),
        });
      } catch (error) {
        const failure = error && typeof error === 'object' ? error : new Error(String(error));
        const classified = classifyBenchmarkAttemptFailure(failure, trace);
        if (DESTROYING_FAILURE_CLASSES.has(classified.failureClass)) {
          destroyTraceConnections(trace);
        }
        failure.benchmarkAttemptEvidence = attemptEvidenceOf(trace);
        throw failure;
      } finally {
        registry.inFlight.delete(trace);
      }
    },
    // Watchdog: every request it stopped is never retried and its connection
    // is destroyed, whether an attempt was in flight or the request waited
    // between attempts; returns the number of attempts that were in flight.
    abortInFlight() {
      const aborted = registry.inFlight.size;
      for (const trace of registry.inFlight) destroyTraceConnections(trace);
      for (const connection of registry.connections) connection.destroy();
      return aborted;
    },
  });
}

export {
  createBenchmarkOutcomeAdapter,
  createConnectionRegistry as createBenchmarkConnectionRegistry,
  createTrackedMysqlConnectionFactory,
  createTrackedPgClientFactory,
};
