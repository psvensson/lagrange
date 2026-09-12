import mysql from 'mysql2/promise';

const ZERO = 0;
const ONE = 1;
const MAX_PORT = 65535;
const DEADLOCK_TIMEOUT_MS = 15000;
const CYCLE_ARM_DELAY_MS = 100;

function normalizeEndpoint(value = {}) {
  const host = String(value.host || '').trim();
  const port = Number(value.port);
  if (!host) throw new Error('TiDB conflict probe requires endpoint.host');
  if (!Number.isInteger(port) || port < ONE || port > MAX_PORT) {
    throw new Error('TiDB conflict probe requires a valid endpoint.port');
  }
  return Object.freeze({host, port});
}

function connectionOptions(endpoint, databaseName) {
  return {
    host: endpoint.host,
    port: endpoint.port,
    user: 'root',
    password: '',
    database: databaseName,
    decimalNumbers: true,
    multipleStatements: false,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function settleQuery(promise, side) {
  return promise.then(
    () => Object.freeze({side, succeeded: true, error: null}),
    (error) => Object.freeze({side, succeeded: false, error}),
  );
}

async function withTimeout(promise, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`TiDB conflict probe timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function safeRollback(connection) {
  if (!connection) return;
  try {
    await connection.rollback();
  } catch {
    // A deadlock victim may already have been rolled back by TiDB.
  }
}

async function safeEnd(connection) {
  if (!connection) return;
  try {
    await connection.end();
  } catch {
    // Preserve the semantic result; cleanup failure is not the conflict signal.
  }
}

function normalizeError(error, side) {
  return Object.freeze({
    side,
    code: String(error?.code || ''),
    errno: Number(error?.errno || ZERO),
    sqlState: String(error?.sqlState || '').trim().toUpperCase(),
    sqlMessage: String(error?.sqlMessage || error?.message || ''),
  });
}

async function induceTiDbRetryableConflict(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const databaseName = String(options.databaseName || '').trim();
  if (!databaseName) throw new Error('TiDB conflict probe requires databaseName');
  const connect = options.createConnection || mysql.createConnection;
  const cycleArmDelayMs = Number.isFinite(options.cycleArmDelayMs) ?
    Math.max(ZERO, Number(options.cycleArmDelayMs)) : CYCLE_ARM_DELAY_MS;
  const timeoutMs = Number.isFinite(options.timeoutMs) ?
    Math.max(ONE, Number(options.timeoutMs)) : DEADLOCK_TIMEOUT_MS;
  let left = null;
  let right = null;

  try {
    left = await connect(connectionOptions(endpoint, databaseName));
    right = await connect(connectionOptions(endpoint, databaseName));
    await left.query("SET SESSION tidb_txn_mode = 'pessimistic'");
    await right.query("SET SESSION tidb_txn_mode = 'pessimistic'");
    await left.beginTransaction();
    await right.beginTransaction();

    await left.execute(
      'UPDATE stock SET quantity = quantity + 1 ' +
        'WHERE warehouse_id = ? AND item_id = ?',
      [ONE, ONE],
    );
    await right.execute(
      'UPDATE stock SET quantity = quantity + 1 ' +
        'WHERE warehouse_id = ? AND item_id = ?',
      [ONE, 2],
    );

    const leftWait = settleQuery(left.execute(
      'UPDATE stock SET quantity = quantity + 1 ' +
        'WHERE warehouse_id = ? AND item_id = ?',
      [ONE, 2],
    ), 'left');
    await sleep(cycleArmDelayMs);
    const rightWait = settleQuery(right.execute(
      'UPDATE stock SET quantity = quantity + 1 ' +
        'WHERE warehouse_id = ? AND item_id = ?',
      [ONE, ONE],
    ), 'right');

    const results = await withTimeout(
      Promise.all([leftWait, rightWait]),
      timeoutMs,
    );
    const failures = results.filter(({succeeded}) => !succeeded);
    if (failures.length !== ONE) {
      throw new Error(
        `TiDB conflict probe expected exactly one deadlock victim, got ${failures.length}`,
      );
    }
    return Object.freeze({
      victim: normalizeError(failures[ZERO].error, failures[ZERO].side),
      results: Object.freeze(results.map(({side, succeeded, error}) =>
        Object.freeze({
          side,
          succeeded,
          error: error ? normalizeError(error, side) : null,
        }))),
    });
  } finally {
    await Promise.all([safeRollback(left), safeRollback(right)]);
    await Promise.all([safeEnd(left), safeEnd(right)]);
  }
}

export {
  induceTiDbRetryableConflict,
};
