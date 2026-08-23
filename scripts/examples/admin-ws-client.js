import {randomUUID} from 'node:crypto';
import WebSocket from 'ws';
import {
  DEFAULT_TARGET,
  DEFAULT_TIMEOUT_MS,
  MESSAGE_TYPE,
  WS_OPEN_STATE,
} from './examples-runner-constants.js';

const LOCAL_STR_OPEN = 'open';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_ADMIN_EXAMPLES_SOCKET_CLOSED = 'Admin examples socket closed';
const LOCAL_STR_MESSAGE = 'message';
const LOCAL_STR_CLOSE = 'close';
const ADMIN_EXAMPLES_ERROR_CODE = Object.freeze({
  CONNECT_TIMEOUT: 'ADMIN_CONNECT_TIMEOUT',
  RESPONSE_TIMEOUT: 'ADMIN_RESPONSE_TIMEOUT',
});

function buildAdminConnectTimeoutError(target, timeoutMs) {
  const error = new Error(
    `Timed out opening admin websocket: ${target}`,
  );
  error.code = ADMIN_EXAMPLES_ERROR_CODE.CONNECT_TIMEOUT;
  error.deferRetry = true;
  error.target = target;
  error.timeoutMs = timeoutMs;
  return error;
}

function buildAdminResponseTimeoutError(queryId, timeoutMs) {
  const error = new Error(
    `Timed out waiting for admin response: ${queryId}`,
  );
  error.code = ADMIN_EXAMPLES_ERROR_CODE.RESPONSE_TIMEOUT;
  error.deferRetry = true;
  error.queryId = queryId;
  error.timeoutMs = timeoutMs;
  return error;
}

/**
 * Admin websocket client used by the examples runner.
 */
class AdminWsClient {
  /**
   * @param {{target?: string, timeoutMs?: number}} options
   */
  constructor(options = {}) {
    this.target = options.target || DEFAULT_TARGET;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.socket = null;
    this.openingSocket = null;
    this.socketReady = null;
    this.pending = new Map();
  }

  /**
   * Connect the client to the admin websocket endpoint.
   *
   * @return {Promise<WebSocket>}
   */
  async connect() {
    if (this.socket && this.socket.readyState === WS_OPEN_STATE) {
      return this.socket;
    }
    if (this.socketReady) {
      return this.socketReady;
    }

    const socket = new WebSocket(this.target);
    this.openingSocket = socket;
    let openingPromise = null;
    openingPromise = new Promise((resolve, reject) => {
      let timeout = null;

      const releaseOpening = () => {
        if (this.openingSocket === socket) {
          this.openingSocket = null;
        }
        if (this.socketReady === openingPromise) {
          this.socketReady = null;
        }
      };

      let onOpen = null;
      let onOpenError = null;
      const clearOpening = () => {
        if (timeout !== null) {
          clearTimeout(timeout);
          timeout = null;
        }
        socket.off(LOCAL_STR_OPEN, onOpen);
        socket.off(LOCAL_STR_ERROR, onOpenError);
      };

      onOpen = () => {
        clearOpening();
        releaseOpening();
        this._bindSocket(socket);
        this.socket = socket;
        resolve(socket);
      };

      onOpenError = (error) => {
        clearOpening();
        releaseOpening();
        reject(error);
      };

      socket.once(LOCAL_STR_OPEN, onOpen);
      socket.once(LOCAL_STR_ERROR, onOpenError);
      timeout = setTimeout(() => {
        clearOpening();
        releaseOpening();
        socket.once(LOCAL_STR_ERROR, () => undefined);
        socket.terminate();
        reject(buildAdminConnectTimeoutError(this.target, this.timeoutMs));
      }, this.timeoutMs);
    });
    this.socketReady = openingPromise;

    return openingPromise;
  }

  /**
   * Close socket and reject all pending requests.
   *
   * @return {Promise<void>}
   */
  async close() {
    this._rejectPending(LOCAL_STR_ADMIN_EXAMPLES_SOCKET_CLOSED);
    try {
      if (this.socket) {
        this.socket.close();
      }
      if (this.openingSocket) {
        this.openingSocket.terminate();
      }
    } finally {
      this._resetSocket();
    }
  }

  /**
   * Submit a SQL query request over admin websocket.
   *
   * @param {string} sql
   * @param {Array} params
   * @return {Promise<Object>}
   */
  async query(sql, params = []) {
    return this._sendRequest({
      type: MESSAGE_TYPE.QUERY,
      sql,
      params,
    });
  }

  /**
   * Execute partition callback request over admin websocket.
   *
   * @param {Object} payload
   * @return {Promise<Object>}
   */
  async partitionCallback(payload) {
    return this._sendRequest({
      type: MESSAGE_TYPE.PARTITION_CALLBACK,
      statement: payload.statement,
      parameters: payload.parameters || [],
      callbackModuleRef: payload.callbackModuleRef,
      callbackExport: payload.callbackExport,
      runtimeKind: payload.runtimeKind,
    });
  }

  /**
   * Send a request and await the matching `query_result` frame.
   *
   * @param {Object} payload
   * @return {Promise<Object>}
   * @private
   */
  async _sendRequest(payload) {
    const socket = await this.connect();
    const queryId = `examples-${Date.now()}-${randomUUID()}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(queryId);
        reject(buildAdminResponseTimeoutError(queryId, this.timeoutMs));
      }, this.timeoutMs);

      this.pending.set(queryId, {resolve, reject, timeout});

      try {
        socket.send(JSON.stringify({
          ...payload,
          queryId,
          timeoutMs: this.timeoutMs,
        }));
      } catch (error) {
        this.pending.delete(queryId);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Bind socket listeners once open.
   *
   * @param {WebSocket} socket
   * @private
   */
  _bindSocket(socket) {
    socket.on(LOCAL_STR_MESSAGE, (data) => {
      let parsed = null;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      this._handleMessage(parsed);
    });

    socket.on(LOCAL_STR_ERROR, (error) => {
      this._rejectPending(`Admin examples socket error: ${error.message}`);
      this._resetSocket();
    });

    socket.on(LOCAL_STR_CLOSE, () => {
      this._rejectPending(LOCAL_STR_ADMIN_EXAMPLES_SOCKET_CLOSED);
      this._resetSocket();
    });
  }

  /**
   * Route response frames to the corresponding pending request promise.
   *
   * @param {Object} message
   * @private
   */
  _handleMessage(message) {
    if (!message || message.type !== MESSAGE_TYPE.QUERY_RESULT) {
      return;
    }

    const pending = this.pending.get(message.queryId);
    if (!pending) {
      return;
    }

    this.pending.delete(message.queryId);
    clearTimeout(pending.timeout);

    if (message.error) {
      pending.reject(new Error(message.error));
      return;
    }

    pending.resolve(message);
  }

  /**
   * Reject all pending request promises.
   *
   * @param {string} message
   * @private
   */
  _rejectPending(message) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }

  /**
   * Reset socket ownership state.
   *
   * @private
   */
  _resetSocket() {
    this.socket = null;
    this.openingSocket = null;
    this.socketReady = null;
  }
}

export {AdminWsClient};
