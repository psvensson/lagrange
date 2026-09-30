/**
 * The "application" side of the public Binding-invocation seam proof.
 *
 * This module is deliberately what a real consumer of a Lagrange node
 * would write: it imports ONLY the `pg` package (a runtime dependency of
 * `lagrange-server`) and receives nothing but a host, a port, and the
 * password-mode credentials. It never imports a router, a resolver, the
 * call invoker, or any `src/` module, and it never names a node, a
 * partition, or a replica. Every deploy and invoke step is lifecycle SQL
 * over the authenticated PostgreSQL wire
 * (docs/service-deployment-guide.md). The seam test asserts this module's
 * import set structurally.
 */

import pg from 'pg';

const LIFECYCLE_SQL = Object.freeze({
  CALL_BINDING: 'CALL BINDING $1',
  CONFIGURE_ACCESS: 'CONFIGURE SERVICE ACCESS $1',
  CREATE_BINDING: 'CREATE BINDING $1',
  INSTALL_SERVICE: 'INSTALL SERVICE $1',
  SHOW_SERVICE: 'SHOW SERVICE $1',
});
const CALL_PAYLOAD_SCHEMA_VERSION = 2;
const CONSUMER_CONNECT_TIMEOUT_MS = 5_000;
const CONSUMER_SSL_DISABLED = false;
const RETRY_SAFE_DETAIL_FIELD = 'retrySafe';
const CONSUMER_RETRY_OUTCOME = Object.freeze({
  SERVED: 'served',
  GAVE_UP: 'gave_up',
});

/**
 * Open one authenticated consumer session.
 *
 * @param {{host: string, port: number, user: string, password: string,
 *   database: string}} endpoint - Everything the consumer knows.
 * @return {Promise<pg.Client>} Connected client.
 */
async function openConsumerSession(endpoint) {
  const client = new pg.Client({
    connectionTimeoutMillis: CONSUMER_CONNECT_TIMEOUT_MS,
    database: endpoint.database,
    host: endpoint.host,
    password: endpoint.password,
    port: endpoint.port,
    ssl: CONSUMER_SSL_DISABLED,
    user: endpoint.user,
  });
  await client.connect();
  return client;
}

/**
 * Run one parameterized lifecycle statement and return its rows.
 *
 * @param {pg.Client} client - Consumer session.
 * @param {string} statement - One LIFECYCLE_SQL statement.
 * @param {object} payload - JSON payload bound as $1.
 * @return {Promise<object[]>} Result rows.
 */
async function runLifecycle(client, statement, payload) {
  const result = await client.query({
    text: statement,
    values: [JSON.stringify(payload)],
  });
  return result.rows;
}

/**
 * Capture what a `pg` client receives for a failed statement: exactly the
 * ErrorResponse fields node-postgres exposes, nothing reconstructed.
 *
 * @param {Promise} pending - A rejected-or-fulfilled query promise.
 * @return {Promise<object|null>} Observed error fields, or null.
 */
async function observeFailure(pending) {
  try {
    await pending;
    return null;
  } catch (error) {
    return Object.freeze({
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      message: error.message,
      severity: error.severity,
    });
  }
}

/**
 * Invoke a call Binding by name. The payload carries only the contract's
 * schema_version/name/arguments - no execution target of any kind.
 *
 * @param {pg.Client} client - Consumer session.
 * @param {string} name - Binding registration name.
 * @param {object} callArguments - Transient arguments JSON object.
 * @return {Promise<*>} The parsed reduced result.
 */
async function callBinding(client, name, callArguments) {
  const rows = await runLifecycle(client, LIFECYCLE_SQL.CALL_BINDING, {
    arguments: callArguments,
    name,
    schema_version: CALL_PAYLOAD_SCHEMA_VERSION,
  });
  return JSON.parse(rows[0].result);
}

/**
 * The public retry decision a caller reads from a failed CALL: the
 * `retrySafe` field of the ErrorResponse detail. Anything else - no
 * detail, unparsable detail, or no field - is not retry-safe.
 *
 * @param {{detail?: string}} observed - Received error fields.
 * @return {boolean} Whether an automatic retry is safe.
 */
function isPublicRetrySafe(observed) {
  try {
    return JSON.parse(observed.detail)[RETRY_SAFE_DETAIL_FIELD] === true;
  } catch {
    return false;
  }
}

/**
 * Consumer-side retry loop: re-issue the CALL while the caller-supplied
 * predicate classifies the received error as safe to retry.
 *
 * @param {pg.Client} client - Consumer session.
 * @param {object} request - {name, callArguments}.
 * @param {object} policy - {isRetrySafe(observed), deadlineMs, pause()}.
 * @return {Promise<object>} {outcome, result?, attempts, lastFailure?,
 *   retriedDetails: distinct error details that were retried}.
 */
async function callBindingWhileRetrySafe(client, request, policy) {
  let attempts = 0;
  let lastFailure = null;
  const retriedDetails = new Set();
  while (Date.now() < policy.deadlineMs) {
    attempts += 1;
    try {
      const result = await callBinding(
        client, request.name, request.callArguments);
      return Object.freeze({
        attempts,
        outcome: CONSUMER_RETRY_OUTCOME.SERVED,
        result,
        retriedDetails: [...retriedDetails],
      });
    } catch (error) {
      lastFailure = Object.freeze({
        code: error.code,
        detail: error.detail,
        message: error.message,
      });
      if (!policy.isRetrySafe(lastFailure)) break;
      retriedDetails.add(lastFailure.detail);
      await policy.pause();
    }
  }
  return Object.freeze({
    attempts,
    lastFailure,
    outcome: CONSUMER_RETRY_OUTCOME.GAVE_UP,
    retriedDetails: [...retriedDetails],
  });
}

export {
  CALL_PAYLOAD_SCHEMA_VERSION,
  CONSUMER_RETRY_OUTCOME,
  LIFECYCLE_SQL,
  callBinding,
  callBindingWhileRetrySafe,
  isPublicRetrySafe,
  observeFailure,
  openConsumerSession,
  runLifecycle,
};
