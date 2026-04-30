/**
 * ConnectionManager - WebSocket connection management with automatic reconnection
 * Handles connection to node's admin API with exponential backoff reconnection
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import WebSocket from 'ws';
import {CLI_STREAM} from '../cli-constants.js';
import {ADMIN_MESSAGE_TYPE} from '../../admin/admin-constants.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_10 = 10;
const LOCAL_NUM_1000 = 1000;
const LOCAL_NUM_30000 = 30000;
const LOCAL_STR_DISCONNECTED = 'disconnected';
const LOCAL_STR_HTTP = 'http://';
const LOCAL_STR_HTTPS = 'https://';
const LOCAL_STR_WS = 'ws://';
const LOCAL_STR_WSS = 'wss://';
const LOCAL_STR_WS_2 = 'ws:';
const LOCAL_STR_WSS_2 = 'wss:';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_CONNECTING = 'connecting';
const LOCAL_STR_13QTI = 'Connection already in progress';
const LOCAL_STR_OPEN = 'open';
const LOCAL_STR_CONNECTED = 'connected';
const LOCAL_STR_MESSAGE = 'message';
const LOCAL_STR_CLOSE = 'close';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_UNKNOWN_ERROR = 'Unknown error';
const LOCAL_STR_ID = 'id';
const LOCAL_STR_FAILED = 'failed';
const LOCAL_STR_RECONNECTING = 'reconnecting';

/**
 * @typedef {'disconnected'|'connecting'|'connected'|'reconnecting'|'failed'} ConnectionStatus
 */

/**
 * @typedef {Object} ConnectionConfig
 * @property {number} [maxReconnectAttempts=10] - Maximum reconnection attempts
 * @property {number} [baseDelay=1000] - Base delay for exponential backoff (ms)
 * @property {number} [maxDelay=30000] - Maximum delay between reconnection attempts (ms)
 */

export class ConnectionManager {
  /**
   * @param {ConnectionConfig} config - Connection configuration
   */
  constructor(config = {}) {
    this.config = config;

    /** @type {WebSocket|null} */
    this.ws = null;

    /** @type {string|null} */
    this.currentAddress = null;

    /** @type {number} */
    this.reconnectAttempts = LOCAL_NUM_ZERO;

    /** @type {number} */
    this.maxReconnectAttempts = config.maxReconnectAttempts || LOCAL_NUM_10;

    /** @type {number} */
    this.baseDelay = config.baseDelay || LOCAL_NUM_1000;

    /** @type {number} */
    this.maxDelay = config.maxDelay || LOCAL_NUM_30000;

    /** @type {ConnectionStatus} */
    this.status = LOCAL_STR_DISCONNECTED;

    /** @type {NodeJS.Timeout|null} */
    this.reconnectTimer = null;

    /** @type {boolean} */
    this.intentionalDisconnect = false;

    // Callbacks
    /** @type {Function|null} */
    this.onCacheDump = null;

    /** @type {Function|null} */
    this.onCDCEvent = null;

    /** @type {Function|null} */
    this.onQueryResult = null;

    /** @type {Function|null} */
    this.onStatusChange = null;

    /** @type {Function|null} */
    this.onError = null;
  }

  /**
   * Get the current connection status
   * @returns {ConnectionStatus}
   */
  getStatus() {
    return this.status;
  }

  /**
   * Get the current node address
   * @returns {string|null}
   */
  getAddress() {
    return this.currentAddress;
  }

  /**
   * Get the number of reconnection attempts
   * @returns {number}
   */
  getReconnectAttempts() {
    return this.reconnectAttempts;
  }

  /**
   * Calculate the delay for the next reconnection attempt
   * @param {number} attempt - Current attempt number (0-based)
   * @returns {number} Delay in milliseconds
   */
  calculateBackoffDelay(attempt) {
    const delay = this.baseDelay * Math.pow(2, attempt);
    return Math.min(delay, this.maxDelay);
  }

  /**
   * Convert HTTP URL to WebSocket URL
   * @param {string} address - Node address (may include protocol)
   * @returns {string} WebSocket URL
   */
  buildWebSocketUrl(address) {
    let url = address;

    // Add protocol if missing
    if (!url.startsWith(LOCAL_STR_HTTP) && !url.startsWith(LOCAL_STR_HTTPS) &&
        !url.startsWith(LOCAL_STR_WS) && !url.startsWith(LOCAL_STR_WSS)) {
      url = `ws://${url}`;
    }

    // Convert http to ws
    url = url.replace(/^http:/, LOCAL_STR_WS_2).replace(/^https:/, LOCAL_STR_WSS_2);

    // Add API path if not present
    if (!url.includes(CLI_STREAM.ADMIN_PATH)) {
      url = url.replace(/\/$/, LOCAL_STR_EMPTY) + CLI_STREAM.ADMIN_PATH;
    }

    return url;
  }

  /**
   * Connect to a node's admin API
   * @param {string} nodeAddress - Node address to connect to
   * @returns {Promise<void>}
   */
  async connect(nodeAddress) {
    if (this.status === LOCAL_STR_CONNECTING) {
      throw new Error(LOCAL_STR_13QTI);
    }

    this.currentAddress = nodeAddress;
    this.intentionalDisconnect = false;
    this.status = LOCAL_STR_CONNECTING;
    this.onStatusChange?.(LOCAL_STR_CONNECTING);

    const wsUrl = this.buildWebSocketUrl(nodeAddress);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);
      } catch (err) {
        this.status = LOCAL_STR_DISCONNECTED;
        this.onStatusChange?.(LOCAL_STR_DISCONNECTED);
        reject(err);
        return;
      }

      const connectionTimeout = setTimeout(() => {
        if (this.status === 'connecting') {
          this.ws?.close();
          this.status = 'disconnected';
          this.onStatusChange?.('disconnected');
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      this.ws.on(LOCAL_STR_OPEN, () => {
        clearTimeout(connectionTimeout);
        this.status = LOCAL_STR_CONNECTED;
        this.reconnectAttempts = LOCAL_NUM_ZERO;
        this.onStatusChange?.(LOCAL_STR_CONNECTED);
        resolve();
      });

      this.ws.on(LOCAL_STR_MESSAGE, (data) => {
        this.handleMessage(data);
      });

      this.ws.on(LOCAL_STR_CLOSE, () => {
        clearTimeout(connectionTimeout);
        const wasConnected = this.status === 'connected';
        this.status = LOCAL_STR_DISCONNECTED;
        this.onStatusChange?.(LOCAL_STR_DISCONNECTED);

        // Only auto-reconnect if we were connected and didn't intentionally disconnect
        if (wasConnected && !this.intentionalDisconnect) {
          this.scheduleReconnect();
        }
      });

      this.ws.on(LOCAL_STR_ERROR, (err) => {
        clearTimeout(connectionTimeout);
        this.onError?.(err);

        // If we're still connecting, reject the promise
        if (this.status === LOCAL_STR_CONNECTING) {
          this.status = LOCAL_STR_DISCONNECTED;
          this.onStatusChange?.(LOCAL_STR_DISCONNECTED);
          reject(err);
        }
      });
    });
  }

  /**
   * Handle incoming WebSocket message
   * @param {Buffer|string} data - Raw message data
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
      case ADMIN_MESSAGE_TYPE.CACHE_DUMP:
        if (this.onCacheDump) {
          this.onCacheDump(message.data);
        }
        break;
      case ADMIN_MESSAGE_TYPE.CDC_EVENT:
        // Server sends CDC event fields directly in message
        // Transform to format expected by RemoteCache.applyCDCEvent()
        if (this.onCDCEvent) {
          this.onCDCEvent({
            table: message.table,
            operation: message.operation?.toUpperCase(),
            data: message.record,
            key: message.record?.[this.getPrimaryKeyField(message.table)],
            timestamp: message.timestamp,
          });
        }
        break;
      case ADMIN_MESSAGE_TYPE.QUERY_RESULT:
        if (this.onQueryResult) {
          this.onQueryResult(message);
        }
        break;
      case ADMIN_MESSAGE_TYPE.LIVE_QUERY_EVENT:
        if (this.onLiveQueryEvent) {
          this.onLiveQueryEvent(message);
        }
        break;
      case ADMIN_MESSAGE_TYPE.ERROR:
        if (this.onError) {
          this.onError(
            new Error(message.error || message.message || LOCAL_STR_UNKNOWN_ERROR),
          );
        }
        break;
      default:
        // Unknown message type - ignore
        break;
      }
    } catch (err) {
      if (this.onError) {
        this.onError(new Error(`Failed to parse message: ${err.message}`));
      }
    }
  }

  /**
   * Get the primary key field name for a table
   * @param {string} tableName - Table name
   * @return {string} Primary key field name
   */
  getPrimaryKeyField(tableName) {
    const primaryKeys = {
      nodes: 'node_id',
      services: 'service_id',
      partitions: 'partition_id',
      tables: 'table_id',
      message_groups: 'group_id',
      indices: 'index_id',
      logs: 'log_id',
      config: 'key',
      contexts: 'context_id',
    };
    return primaryKeys[tableName] || LOCAL_STR_ID;
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  scheduleReconnect() {
    if (this.intentionalDisconnect) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.status = LOCAL_STR_FAILED;
      this.onStatusChange?.(LOCAL_STR_FAILED);
      return;
    }

    const delay = this.calculateBackoffDelay(this.reconnectAttempts);
    this.reconnectAttempts++;
    this.status = LOCAL_STR_RECONNECTING;
    this.onStatusChange?.(LOCAL_STR_RECONNECTING, delay);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalDisconnect && this.currentAddress) {
        this.connect(this.currentAddress).catch(() => {
          // Connection failed, scheduleReconnect will be called from close handler
        });
      }
    }, delay);
  }

  /**
   * Cancel any pending reconnection
   */
  cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Reset reconnection attempts counter
   */
  resetReconnectAttempts() {
    this.reconnectAttempts = LOCAL_NUM_ZERO;
  }

  /**
   * Send a SQL query to the server
   * @param {string} queryId - Unique query identifier
   * @param {string} sql - SQL statement
   * @param {Array} [params=[]] - Query parameters
   * @returns {boolean} Whether the message was sent
   */
  sendQuery(queryId, sql, params = []) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.ws.send(JSON.stringify({
      type: ADMIN_MESSAGE_TYPE.QUERY,
      queryId,
      sql,
      params,
    }));

    return true;
  }

  /**
   * Subscribe to a live query
   * @param {string} subscriptionId - Unique subscription identifier
   * @param {string} sql - LIVE SELECT statement
   * @returns {boolean} Whether the message was sent
   */
  subscribeLiveQuery(subscriptionId, sql) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.ws.send(JSON.stringify({
      type: ADMIN_MESSAGE_TYPE.LIVE_QUERY_SUBSCRIBE,
      subscriptionId,
      sql,
    }));

    return true;
  }

  /**
   * Unsubscribe from a live query
   * @param {string} subscriptionId - Subscription identifier
   * @returns {boolean} Whether the message was sent
   */
  unsubscribeLiveQuery(subscriptionId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.ws.send(JSON.stringify({
      type: ADMIN_MESSAGE_TYPE.LIVE_QUERY_UNSUBSCRIBE,
      subscriptionId,
    }));

    return true;
  }

  /**
   * Request a full cache dump from the server
   * @returns {boolean} Whether the message was sent
   */
  requestCacheDump() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.ws.send(JSON.stringify({
      type: ADMIN_MESSAGE_TYPE.REFRESH,
    }));

    return true;
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    this.intentionalDisconnect = true;
    this.cancelReconnect();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.status = LOCAL_STR_DISCONNECTED;
    this.onStatusChange?.(LOCAL_STR_DISCONNECTED);
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this.status === LOCAL_STR_CONNECTED &&
           this.ws !== null &&
           this.ws.readyState === WebSocket.OPEN;
  }
}
