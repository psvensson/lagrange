/**
 * Endpoint sync source client over Admin WebSocket stream.
 *
 * Executes SQL queries against /api/admin/stream and returns
 * query_result rows with retry/backoff handling.
 *
 * @module runtime/endpoint-sync-source-client
 */

import WebSocket from 'ws';
import {ADMIN_MESSAGE_TYPE} from '../admin/admin-constants.js';
import {BaseError} from '../utils/base-error.js';
import {
  ENDPOINT_SYNC_DEFAULT,
  ENDPOINT_SYNC_ERROR,
  ENDPOINT_SYNC_SOURCE_QUERY,
} from './endpoint-sync-constants.js';
import {
  SOURCE_NODE_INCARNATION_SQL,
  buildEndpointSourceQuery,
  normalizeEndpointRows,
} from './endpoint-sync-source-query.js';
import {selectCurrentEndpointRows} from
  '../control-plane/owners/endpoint-incarnation-currentness.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const LOCAL_STR_ENDPOINTSYNCSOURCECLIENT = 'EndpointSyncSourceClient';
const LOCAL_STR_QUERY = 'query';
const LOCAL_STR_OPEN = 'open';
const LOCAL_STR_MESSAGE = 'message';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_CLOSE = 'close';

const SOURCE_QUERY_WAIT = Object.freeze({
  wait: 'ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_TIMEOUT_MS',
  awaited: 'admin stream query_result for an endpoint source query',
});
const SOURCE_QUERY_RETRY_WAIT = Object.freeze({
  wait: 'ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_MAX_RETRIES',
  awaited: 'one successful endpoint source query',
});
const SOURCE_QUERY_PHASE = Object.freeze({
  CONNECTING: 'connecting',
  QUERY_SENT: 'query_sent',
});

const ADMIN_AUTH_HEADER = 'authorization';
const BEARER_PREFIX = 'Bearer ';

let queryCounter = 0;

/**
 * Build deterministic query id.
 *
 * @return {string}
 */
function nextQueryId() {
  queryCounter += 1;
  return ENDPOINT_SYNC_SOURCE_QUERY.QUERY_ID_PREFIX + queryCounter;
}

/**
 * Sleep helper for retry delay.
 *
 * @param {number} ms - Delay milliseconds.
 * @return {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Typed error for source query failures.
 *
 * @extends BaseError
 */
class EndpointSyncSourceQueryError extends BaseError {
  /**
   * @param {string} message - Error message.
   * @param {Object} [metadata={}] - Context metadata.
   * @param {Error} [cause] - Underlying cause.
   */
  constructor(message, metadata = {}, cause = undefined) {
    super(message, {
      cause,
      context: {
        component: LOCAL_STR_ENDPOINTSYNCSOURCECLIENT,
        operation: LOCAL_STR_QUERY,
        metadata,
      },
    });
  }
}

/**
 * Typed error for source query timeout.
 *
 * @extends EndpointSyncSourceQueryError
 */
class EndpointSyncSourceTimeoutError extends EndpointSyncSourceQueryError {
  /**
   * @param {number} timeoutMs - Timeout duration.
   * @param {Object} [metadata={}] - Context metadata.
   */
  constructor(timeoutMs, metadata = {}) {
    super(ENDPOINT_SYNC_ERROR.SOURCE_QUERY_TIMEOUT, {
      timeoutMs,
      ...metadata,
    });
  }
}

/**
 * Build auth header object from optional token.
 *
 * @param {string|null} token - Optional auth token.
 * @return {Object}
 */
function buildAuthHeaders(token) {
  if (!token || typeof token !== 'string') {
    return {};
  }
  return {
    [ADMIN_AUTH_HEADER]: `${BEARER_PREFIX}${token}`,
  };
}

/**
 * Validate and extract rows from admin query_result message.
 *
 * @param {Object} message - Parsed admin message.
 * @param {string} queryId - Expected query id.
 * @return {{done: boolean, rows?: Array<Object>, error?: Error}}
 */
function readQueryResultMessage(message, queryId) {
  if (!message || typeof message !== 'object') {
    return {done: false};
  }
  if (message.type !== ADMIN_MESSAGE_TYPE.QUERY_RESULT) {
    return {done: false};
  }
  if (message.queryId !== queryId) {
    return {done: false};
  }

  if (message.error) {
    return {
      done: true,
      error: new EndpointSyncSourceQueryError(
        `${ENDPOINT_SYNC_ERROR.QUERY_RESULT_ERROR_PREFIX}: ${message.error}`,
        {queryId},
      ),
    };
  }

  const rows = message.results;
  if (!Array.isArray(rows)) {
    return {
      done: true,
      error: new EndpointSyncSourceQueryError(
        ENDPOINT_SYNC_ERROR.QUERY_RESULT_ROWS_INVALID,
        {queryId},
      ),
    };
  }

  return {
    done: true,
    rows,
  };
}

/**
 * Source query client for endpoint-sync projection.
 */
class EndpointSyncSourceClient {
  /**
   * @param {Object} [options={}] - Client options.
   * @param {*} [options.WebSocketImpl] - WebSocket constructor for testing.
   */
  constructor(options = {}) {
    this._WebSocketImpl = options.WebSocketImpl || WebSocket;
    this._logger = options.logger || null;
  }

  /**
   * Execute endpoint source query with retry/backoff.
   *
   * @param {Object} options - Source query options.
   * @param {string} options.adminStreamUrl - Admin stream URL.
   * @param {string|null} [options.adminAuthToken] - Optional auth token.
   * @param {number} [options.timeoutMs] - Query timeout.
   * @param {number} [options.maxRetries] - Retry count.
   * @param {number} [options.retryDelayMs] - Base retry delay.
   * @param {Array<string>} [options.protocolAllowlist] - Protocol filter.
   * @param {Array<string>} [options.serviceIdAllowlist] - Service filter.
   * @param {boolean} [options.healthyOnly] - Healthy-only source mode.
   * @return {Promise<Array<Object>>} Normalized endpoint rows.
   */
  async fetchEndpointRows(options) {
    const timeoutMs = options.timeoutMs ||
      ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_TIMEOUT_MS;
    const maxRetries = options.maxRetries ||
      ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_MAX_RETRIES;
    const retryDelayMs = options.retryDelayMs ||
      ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_RETRY_DELAY_MS;

    const query = buildEndpointSourceQuery({
      protocolAllowlist: options.protocolAllowlist,
      serviceIdAllowlist: options.serviceIdAllowlist,
      healthyOnly: options.healthyOnly,
    });

    let lastError = null;
    const retryStartedAtMs = Date.now();
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const read = (sql, params) => this._executeQueryOnce({
          adminStreamUrl: options.adminStreamUrl,
          adminAuthToken: options.adminAuthToken || null,
          sql,
          params,
          timeoutMs,
        });
        const rows = await read(query.sql, query.params);
        const nodeRows = await read(SOURCE_NODE_INCARNATION_SQL, []);
        // Only the endpoint incarnation authority's current view is
        // exported: a stale incarnation's endpoint is never advertised.
        return normalizeEndpointRows(selectCurrentEndpointRows(rows, nodeRows));
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) {
          break;
        }
        await sleep(retryDelayMs * (attempt + 1));
      }
    }

    reportWaitBoundSpent(this._logger, {
      ...SOURCE_QUERY_RETRY_WAIT,
      boundMs: null,
      startedAtMs: retryStartedAtMs,
      lastObserved: {
        attempts: maxRetries + 1,
        lastError: lastError?.message || null,
        lastErrorCode: lastError?.code || null,
      },
      scope: {adminStreamUrl: options.adminStreamUrl},
    });
    throw new EndpointSyncSourceQueryError(
      ENDPOINT_SYNC_ERROR.SOURCE_QUERY_FAILED,
      {
        adminStreamUrl: options.adminStreamUrl,
        maxRetries,
      },
      lastError,
    );
  }

  /**
   * Execute one query over admin stream socket.
   *
   * @param {Object} options - Query options.
   * @param {string} options.adminStreamUrl - Stream URL.
   * @param {string|null} options.adminAuthToken - Optional token.
   * @param {string} options.sql - Query SQL.
   * @param {Array<*>} options.params - Query params.
   * @param {number} options.timeoutMs - Timeout.
   * @return {Promise<Array<Object>>}
   * @private
   */
  _executeQueryOnce(options) {
    const queryId = nextQueryId();

    const startedAtMs = Date.now();
    return new Promise((resolve, reject) => {
      let settled = false;
      let phase = SOURCE_QUERY_PHASE.CONNECTING;
      const headers = buildAuthHeaders(options.adminAuthToken);
      const socket = new this._WebSocketImpl(options.adminStreamUrl, {
        headers,
      });

      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        reportWaitBoundSpent(this._logger, {
          ...SOURCE_QUERY_WAIT,
          boundMs: options.timeoutMs,
          startedAtMs,
          lastObserved: {phase},
          scope: {queryId, adminStreamUrl: options.adminStreamUrl},
        });
        try {
          socket.close();
        } catch (_error) {
          // best effort cleanup
        }
        reject(new EndpointSyncSourceTimeoutError(options.timeoutMs, {
          queryId,
          adminStreamUrl: options.adminStreamUrl,
        }));
      }, options.timeoutMs);

      const finalize = (error, rows) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        try {
          socket.close();
        } catch (_error) {
          // best effort cleanup
        }
        if (error) {
          reject(error);
          return;
        }
        resolve(rows);
      };

      socket.on(LOCAL_STR_OPEN, () => {
        phase = SOURCE_QUERY_PHASE.QUERY_SENT;
        const message = {
          type: ADMIN_MESSAGE_TYPE.QUERY,
          queryId,
          sql: options.sql,
          params: options.params,
        };
        socket.send(JSON.stringify(message));
      });

      socket.on(LOCAL_STR_MESSAGE, (frame) => {
        let parsed;
        try {
          parsed = JSON.parse(frame.toString());
        } catch (_error) {
          return;
        }

        const result = readQueryResultMessage(parsed, queryId);
        if (!result.done) {
          return;
        }

        if (result.error) {
          finalize(result.error, null);
          return;
        }
        finalize(null, result.rows);
      });

      socket.on(LOCAL_STR_ERROR, (error) => {
        finalize(new EndpointSyncSourceQueryError(
          ENDPOINT_SYNC_ERROR.SOURCE_QUERY_FAILED,
          {
            queryId,
            adminStreamUrl: options.adminStreamUrl,
          },
          error,
        ), null);
      });

      socket.on(LOCAL_STR_CLOSE, () => {
        if (!settled) {
          finalize(new EndpointSyncSourceQueryError(
            ENDPOINT_SYNC_ERROR.SOURCE_QUERY_UNEXPECTED_MESSAGE,
            {queryId},
          ), null);
        }
      });
    });
  }
}

export {
  EndpointSyncSourceQueryError,
  EndpointSyncSourceTimeoutError,
  nextQueryId,
  sleep,
  buildAuthHeaders,
  readQueryResultMessage,
  EndpointSyncSourceClient,
};
