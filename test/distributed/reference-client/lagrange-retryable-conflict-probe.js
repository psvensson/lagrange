import {
  classifyOltpAttemptError,
  executePairedOltpTransactionWithRetry,
} from '../harness/oltp-paired-retry-owner.js';
import {createPgWireClient} from './pg-wire-client.js';

const ONE = 1;
const DEFAULT_WAREHOUSE_ID = 1;
const DEFAULT_WRITE_DELTA_CENTS = 100;
const MAX_PORT = 65535;

function normalizeEndpoint(value = {}) {
  const host = String(value.host || '').trim();
  const port = Number(value.port);
  if (!host) throw new Error('Lagrange conflict probe requires endpoint.host');
  if (!Number.isInteger(port) || port < ONE || port > MAX_PORT) {
    throw new Error('Lagrange conflict probe requires a valid endpoint.port');
  }
  return Object.freeze({host, port});
}

function normalizeConnection(value = {}) {
  const user = String(value.user || '').trim();
  const database = String(value.database || '').trim();
  if (!user) throw new Error('Lagrange conflict probe requires connection.user');
  if (!database) {
    throw new Error('Lagrange conflict probe requires connection.database');
  }
  return Object.freeze({
    user,
    database,
    ...(value.password === undefined ? {} : {password: value.password}),
    ...(value.ssl === undefined ? {} : {ssl: value.ssl}),
  });
}

function clientOptions(endpoint, connection) {
  return {
    host: endpoint.host,
    port: endpoint.port,
    user: connection.user,
    database: connection.database,
    ...(connection.password === undefined ? {} : {password: connection.password}),
    ...(connection.ssl === undefined ? {} : {ssl: connection.ssl}),
    connectionTimeoutMillis: 10000,
  };
}

function normalizeError(error, side) {
  const code = String(error?.code || '');
  const sqlState = String(error?.sqlState || (code === '40001' ? '40001' : code || ''))
    .trim().toUpperCase();
  return Object.freeze({
    side,
    code,
    sqlState,
    message: String(error?.message || ''),
  });
}

async function safeRollback(client) {
  if (!client) return;
  try {
    await client.query('ROLLBACK');
  } catch {
    // Transaction may already be aborted
  }
}

async function safeEnd(client) {
  if (!client) return;
  try {
    await client.end();
  } catch {
    // Preserving semantic result
  }
}

const SELECT_YTD = 'SELECT ytd_cents FROM warehouse WHERE id = $1';
const UPDATE_YTD = 'UPDATE warehouse SET ytd_cents = ytd_cents + $1 WHERE id = $2';
// How the engine resolved the conflict, as observed (a fact, not a contract).
const MECHANISM = Object.freeze({
  BLOCKING_THEN_COMMIT: 'blocking-then-commit',
  SERIALIZATION_CONFLICT: 'serialization-conflict',
  OTHER_ERROR: 'other-error',
});

async function readYtd(client, warehouseId) {
  const result = await client.query(SELECT_YTD, [warehouseId]);
  return Number(result.rows[0].ytd_cents);
}

/**
 * Two concurrent logical requests that update one warehouse row from the same
 * read. The loser's request runs through the retry owner: a retryable
 * conflict (40001) is retried in a fresh transaction; anything else is not.
 * The probe reports what happened - the mechanism, the loser's SQLSTATE,
 * whether its retry committed and the row before and after - and the case
 * evaluates the semantic profile's observable contract on it.
 */
async function induceLagrangeRetryableConflict(options = {}) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const connection = normalizeConnection(options.connection);
  const warehouseId = Number.isInteger(options.warehouseId) ?
    options.warehouseId : DEFAULT_WAREHOUSE_ID;
  const writeDeltaCents = Number.isInteger(options.writeDeltaCents) ?
    options.writeDeltaCents : DEFAULT_WRITE_DELTA_CENTS;
  const createClient = options.createClient || createPgWireClient;
  let left = null;
  let right = null;
  let observer = null;
  try {
    left = createClient(clientOptions(endpoint, connection));
    right = createClient(clientOptions(endpoint, connection));
    observer = createClient(clientOptions(endpoint, connection));
    await left.connect();
    await right.connect();
    await observer.connect();
    const baseline = await readYtd(observer, warehouseId);
    await left.query('BEGIN');
    await right.query('BEGIN');
    await left.query(SELECT_YTD, [warehouseId]);
    await right.query(SELECT_YTD, [warehouseId]);
    await left.query(UPDATE_YTD, [writeDeltaCents, warehouseId]);
    await left.query('COMMIT');
    let firstError = null;
    let retry;
    let retryCommitted;
    try {
      const outcome = await executePairedOltpTransactionWithRetry({
        sleep: options.retrySleep,
        executeAttempt: async ({attempts}) => {
          try {
            if (attempts > ONE) await right.query('BEGIN');
            await right.query(UPDATE_YTD, [writeDeltaCents, warehouseId]);
            await right.query('COMMIT');
          } catch (error) {
            if (!firstError) firstError = error;
            await safeRollback(right);
            throw error;
          }
        },
      });
      retry = outcome.evidence;
      retryCommitted = firstError ? true : null;
    } catch (error) {
      retry = error?.oltpRetryEvidence ?? null;
      retryCommitted = false;
    }
    const final = await readYtd(observer, warehouseId);
    const victim = firstError ? normalizeError(firstError, 'right') : null;
    const classified = victim ? classifyOltpAttemptError({sqlState: victim.sqlState}) : null;
    const mechanism = !victim ? MECHANISM.BLOCKING_THEN_COMMIT :
      (classified.retryable ? MECHANISM.SERIALIZATION_CONFLICT : MECHANISM.OTHER_ERROR);
    const observation = Object.freeze({mechanism, victimSqlState: victim?.sqlState ?? null,
      retryCommitted,
      retry: retry ? Object.freeze({attempts: retry.attempts, retries: retry.retries}) : null,
      effects: Object.freeze({baseline, final, delta: writeDeltaCents})});
    const results = Object.freeze([
      Object.freeze({side: 'left', succeeded: true, error: null}),
      Object.freeze({side: 'right', succeeded: retryCommitted !== false, error: victim}),
    ]);
    return Object.freeze({observation, victim, results});
  } finally {
    await Promise.all([safeRollback(left), safeRollback(right)]);
    await Promise.all([safeEnd(left), safeEnd(right), safeEnd(observer)]);
  }
}

export {
  MECHANISM as RETRYABLE_CONFLICT_MECHANISM,
  induceLagrangeRetryableConflict,
};
