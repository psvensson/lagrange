// @ts-nocheck
import {randomUUID} from 'node:crypto';
import WebSocket from 'ws';
import {
  DEFAULT_TARGET,
  DEFAULT_TIMEOUT_MS,
  MESSAGE_TYPE,
  WS_OPEN_STATE,
} from './examples-runner-constants.js';

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

    this.socketReady = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.target);

      const onOpen = () => {
        socket.off('error', onOpenError);
        this._bindSocket(socket);
        this.socket = socket;
        resolve(socket);
      };

      const onOpenError = (error) => {
        socket.off('open', onOpen);
        this._resetSocket();
        reject(error);
      };

      socket.once('open', onOpen);
      socket.once('error', onOpenError);
    });

    return this.socketReady;
  }

  /**
   * Close socket and reject all pending requests.
   *
   * @return {Promise<void>}
   */
  async close() {
    this._rejectPending('Admin examples socket closed');
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Best effort.
      }
    }
    this._resetSocket();
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
        reject(new Error(`Timed out waiting for admin response: ${queryId}`));
      }, this.timeoutMs);

      this.pending.set(queryId, {resolve, reject, timeout});

      try {
        socket.send(JSON.stringify({...payload, queryId}));
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
    socket.on('message', (data) => {
      let parsed = null;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      this._handleMessage(parsed);
    });

    socket.on('error', (error) => {
      this._rejectPending(`Admin examples socket error: ${error.message}`);
      this._resetSocket();
    });

    socket.on('close', () => {
      this._rejectPending('Admin examples socket closed');
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
    this.socketReady = null;
  }
}

export {AdminWsClient};
