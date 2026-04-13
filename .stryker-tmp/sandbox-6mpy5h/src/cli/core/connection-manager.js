/**
 * ConnectionManager - WebSocket connection management with automatic reconnection
 * Handles connection to node's admin API with exponential backoff reconnection
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import WebSocket from 'ws';
import { CLI_STREAM } from '../cli-constants.js';
import { ADMIN_MESSAGE_TYPE } from '../../admin/admin-constants.js';

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
    if (stryMutAct_9fa48("40892")) {
      {}
    } else {
      stryCov_9fa48("40892");
      this.config = config;

      /** @type {WebSocket|null} */
      this.ws = null;

      /** @type {string|null} */
      this.currentAddress = null;

      /** @type {number} */
      this.reconnectAttempts = 0;

      /** @type {number} */
      this.maxReconnectAttempts = stryMutAct_9fa48("40895") ? config.maxReconnectAttempts && 10 : stryMutAct_9fa48("40894") ? false : stryMutAct_9fa48("40893") ? true : (stryCov_9fa48("40893", "40894", "40895"), config.maxReconnectAttempts || 10);

      /** @type {number} */
      this.baseDelay = stryMutAct_9fa48("40898") ? config.baseDelay && 1000 : stryMutAct_9fa48("40897") ? false : stryMutAct_9fa48("40896") ? true : (stryCov_9fa48("40896", "40897", "40898"), config.baseDelay || 1000);

      /** @type {number} */
      this.maxDelay = stryMutAct_9fa48("40901") ? config.maxDelay && 30000 : stryMutAct_9fa48("40900") ? false : stryMutAct_9fa48("40899") ? true : (stryCov_9fa48("40899", "40900", "40901"), config.maxDelay || 30000);

      /** @type {ConnectionStatus} */
      this.status = stryMutAct_9fa48("40902") ? "" : (stryCov_9fa48("40902"), 'disconnected');

      /** @type {NodeJS.Timeout|null} */
      this.reconnectTimer = null;

      /** @type {boolean} */
      this.intentionalDisconnect = stryMutAct_9fa48("40903") ? true : (stryCov_9fa48("40903"), false);

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
  }

  /**
   * Get the current connection status
   * @returns {ConnectionStatus}
   */
  getStatus() {
    if (stryMutAct_9fa48("40904")) {
      {}
    } else {
      stryCov_9fa48("40904");
      return this.status;
    }
  }

  /**
   * Get the current node address
   * @returns {string|null}
   */
  getAddress() {
    if (stryMutAct_9fa48("40905")) {
      {}
    } else {
      stryCov_9fa48("40905");
      return this.currentAddress;
    }
  }

  /**
   * Get the number of reconnection attempts
   * @returns {number}
   */
  getReconnectAttempts() {
    if (stryMutAct_9fa48("40906")) {
      {}
    } else {
      stryCov_9fa48("40906");
      return this.reconnectAttempts;
    }
  }

  /**
   * Calculate the delay for the next reconnection attempt
   * @param {number} attempt - Current attempt number (0-based)
   * @returns {number} Delay in milliseconds
   */
  calculateBackoffDelay(attempt) {
    if (stryMutAct_9fa48("40907")) {
      {}
    } else {
      stryCov_9fa48("40907");
      const delay = stryMutAct_9fa48("40908") ? this.baseDelay / Math.pow(2, attempt) : (stryCov_9fa48("40908"), this.baseDelay * Math.pow(2, attempt));
      return stryMutAct_9fa48("40909") ? Math.max(delay, this.maxDelay) : (stryCov_9fa48("40909"), Math.min(delay, this.maxDelay));
    }
  }

  /**
   * Convert HTTP URL to WebSocket URL
   * @param {string} address - Node address (may include protocol)
   * @returns {string} WebSocket URL
   */
  buildWebSocketUrl(address) {
    if (stryMutAct_9fa48("40910")) {
      {}
    } else {
      stryCov_9fa48("40910");
      let url = address;

      // Add protocol if missing
      if (stryMutAct_9fa48("40913") ? !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('ws://') || !url.startsWith('wss://') : stryMutAct_9fa48("40912") ? false : stryMutAct_9fa48("40911") ? true : (stryCov_9fa48("40911", "40912", "40913"), (stryMutAct_9fa48("40915") ? !url.startsWith('http://') && !url.startsWith('https://') || !url.startsWith('ws://') : stryMutAct_9fa48("40914") ? true : (stryCov_9fa48("40914", "40915"), (stryMutAct_9fa48("40917") ? !url.startsWith('http://') || !url.startsWith('https://') : stryMutAct_9fa48("40916") ? true : (stryCov_9fa48("40916", "40917"), (stryMutAct_9fa48("40918") ? url.startsWith('http://') : (stryCov_9fa48("40918"), !(stryMutAct_9fa48("40919") ? url.endsWith('http://') : (stryCov_9fa48("40919"), url.startsWith(stryMutAct_9fa48("40920") ? "" : (stryCov_9fa48("40920"), 'http://')))))) && (stryMutAct_9fa48("40921") ? url.startsWith('https://') : (stryCov_9fa48("40921"), !(stryMutAct_9fa48("40922") ? url.endsWith('https://') : (stryCov_9fa48("40922"), url.startsWith(stryMutAct_9fa48("40923") ? "" : (stryCov_9fa48("40923"), 'https://')))))))) && (stryMutAct_9fa48("40924") ? url.startsWith('ws://') : (stryCov_9fa48("40924"), !(stryMutAct_9fa48("40925") ? url.endsWith('ws://') : (stryCov_9fa48("40925"), url.startsWith(stryMutAct_9fa48("40926") ? "" : (stryCov_9fa48("40926"), 'ws://')))))))) && (stryMutAct_9fa48("40927") ? url.startsWith('wss://') : (stryCov_9fa48("40927"), !(stryMutAct_9fa48("40928") ? url.endsWith('wss://') : (stryCov_9fa48("40928"), url.startsWith(stryMutAct_9fa48("40929") ? "" : (stryCov_9fa48("40929"), 'wss://')))))))) {
        if (stryMutAct_9fa48("40930")) {
          {}
        } else {
          stryCov_9fa48("40930");
          url = stryMutAct_9fa48("40931") ? `` : (stryCov_9fa48("40931"), `ws://${url}`);
        }
      }

      // Convert http to ws
      url = url.replace(stryMutAct_9fa48("40932") ? /http:/ : (stryCov_9fa48("40932"), /^http:/), stryMutAct_9fa48("40933") ? "" : (stryCov_9fa48("40933"), 'ws:')).replace(stryMutAct_9fa48("40934") ? /https:/ : (stryCov_9fa48("40934"), /^https:/), stryMutAct_9fa48("40935") ? "" : (stryCov_9fa48("40935"), 'wss:'));

      // Add API path if not present
      if (stryMutAct_9fa48("40938") ? false : stryMutAct_9fa48("40937") ? true : stryMutAct_9fa48("40936") ? url.includes(CLI_STREAM.ADMIN_PATH) : (stryCov_9fa48("40936", "40937", "40938"), !url.includes(CLI_STREAM.ADMIN_PATH))) {
        if (stryMutAct_9fa48("40939")) {
          {}
        } else {
          stryCov_9fa48("40939");
          url = stryMutAct_9fa48("40940") ? url.replace(/\/$/, '') - CLI_STREAM.ADMIN_PATH : (stryCov_9fa48("40940"), url.replace(stryMutAct_9fa48("40941") ? /\// : (stryCov_9fa48("40941"), /\/$/), stryMutAct_9fa48("40942") ? "Stryker was here!" : (stryCov_9fa48("40942"), '')) + CLI_STREAM.ADMIN_PATH);
        }
      }
      return url;
    }
  }

  /**
   * Connect to a node's admin API
   * @param {string} nodeAddress - Node address to connect to
   * @returns {Promise<void>}
   */
  async connect(nodeAddress) {
    if (stryMutAct_9fa48("40943")) {
      {}
    } else {
      stryCov_9fa48("40943");
      if (stryMutAct_9fa48("40946") ? this.status !== 'connecting' : stryMutAct_9fa48("40945") ? false : stryMutAct_9fa48("40944") ? true : (stryCov_9fa48("40944", "40945", "40946"), this.status === (stryMutAct_9fa48("40947") ? "" : (stryCov_9fa48("40947"), 'connecting')))) {
        if (stryMutAct_9fa48("40948")) {
          {}
        } else {
          stryCov_9fa48("40948");
          throw new Error(stryMutAct_9fa48("40949") ? "" : (stryCov_9fa48("40949"), 'Connection already in progress'));
        }
      }
      this.currentAddress = nodeAddress;
      this.intentionalDisconnect = stryMutAct_9fa48("40950") ? true : (stryCov_9fa48("40950"), false);
      this.status = stryMutAct_9fa48("40951") ? "" : (stryCov_9fa48("40951"), 'connecting');
      stryMutAct_9fa48("40952") ? this.onStatusChange('connecting') : (stryCov_9fa48("40952"), this.onStatusChange?.(stryMutAct_9fa48("40953") ? "" : (stryCov_9fa48("40953"), 'connecting')));
      const wsUrl = this.buildWebSocketUrl(nodeAddress);
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("40954")) {
          {}
        } else {
          stryCov_9fa48("40954");
          try {
            if (stryMutAct_9fa48("40955")) {
              {}
            } else {
              stryCov_9fa48("40955");
              this.ws = new WebSocket(wsUrl);
            }
          } catch (err) {
            if (stryMutAct_9fa48("40956")) {
              {}
            } else {
              stryCov_9fa48("40956");
              this.status = stryMutAct_9fa48("40957") ? "" : (stryCov_9fa48("40957"), 'disconnected');
              stryMutAct_9fa48("40958") ? this.onStatusChange('disconnected') : (stryCov_9fa48("40958"), this.onStatusChange?.(stryMutAct_9fa48("40959") ? "" : (stryCov_9fa48("40959"), 'disconnected')));
              reject(err);
              return;
            }
          }
          const connectionTimeout = setTimeout(() => {
            if (stryMutAct_9fa48("40960")) {
              {}
            } else {
              stryCov_9fa48("40960");
              if (stryMutAct_9fa48("40963") ? this.status !== 'connecting' : stryMutAct_9fa48("40962") ? false : stryMutAct_9fa48("40961") ? true : (stryCov_9fa48("40961", "40962", "40963"), this.status === (stryMutAct_9fa48("40964") ? "" : (stryCov_9fa48("40964"), 'connecting')))) {
                if (stryMutAct_9fa48("40965")) {
                  {}
                } else {
                  stryCov_9fa48("40965");
                  stryMutAct_9fa48("40966") ? this.ws.close() : (stryCov_9fa48("40966"), this.ws?.close());
                  this.status = stryMutAct_9fa48("40967") ? "" : (stryCov_9fa48("40967"), 'disconnected');
                  stryMutAct_9fa48("40968") ? this.onStatusChange('disconnected') : (stryCov_9fa48("40968"), this.onStatusChange?.(stryMutAct_9fa48("40969") ? "" : (stryCov_9fa48("40969"), 'disconnected')));
                  reject(new Error(stryMutAct_9fa48("40970") ? "" : (stryCov_9fa48("40970"), 'Connection timeout')));
                }
              }
            }
          }, 10000);
          this.ws.on(stryMutAct_9fa48("40971") ? "" : (stryCov_9fa48("40971"), 'open'), () => {
            if (stryMutAct_9fa48("40972")) {
              {}
            } else {
              stryCov_9fa48("40972");
              clearTimeout(connectionTimeout);
              this.status = stryMutAct_9fa48("40973") ? "" : (stryCov_9fa48("40973"), 'connected');
              this.reconnectAttempts = 0;
              stryMutAct_9fa48("40974") ? this.onStatusChange('connected') : (stryCov_9fa48("40974"), this.onStatusChange?.(stryMutAct_9fa48("40975") ? "" : (stryCov_9fa48("40975"), 'connected')));
              resolve();
            }
          });
          this.ws.on(stryMutAct_9fa48("40976") ? "" : (stryCov_9fa48("40976"), 'message'), data => {
            if (stryMutAct_9fa48("40977")) {
              {}
            } else {
              stryCov_9fa48("40977");
              this.handleMessage(data);
            }
          });
          this.ws.on(stryMutAct_9fa48("40978") ? "" : (stryCov_9fa48("40978"), 'close'), () => {
            if (stryMutAct_9fa48("40979")) {
              {}
            } else {
              stryCov_9fa48("40979");
              clearTimeout(connectionTimeout);
              const wasConnected = stryMutAct_9fa48("40982") ? this.status !== 'connected' : stryMutAct_9fa48("40981") ? false : stryMutAct_9fa48("40980") ? true : (stryCov_9fa48("40980", "40981", "40982"), this.status === (stryMutAct_9fa48("40983") ? "" : (stryCov_9fa48("40983"), 'connected')));
              this.status = stryMutAct_9fa48("40984") ? "" : (stryCov_9fa48("40984"), 'disconnected');
              stryMutAct_9fa48("40985") ? this.onStatusChange('disconnected') : (stryCov_9fa48("40985"), this.onStatusChange?.(stryMutAct_9fa48("40986") ? "" : (stryCov_9fa48("40986"), 'disconnected')));

              // Only auto-reconnect if we were connected and didn't intentionally disconnect
              if (stryMutAct_9fa48("40989") ? wasConnected || !this.intentionalDisconnect : stryMutAct_9fa48("40988") ? false : stryMutAct_9fa48("40987") ? true : (stryCov_9fa48("40987", "40988", "40989"), wasConnected && (stryMutAct_9fa48("40990") ? this.intentionalDisconnect : (stryCov_9fa48("40990"), !this.intentionalDisconnect)))) {
                if (stryMutAct_9fa48("40991")) {
                  {}
                } else {
                  stryCov_9fa48("40991");
                  this.scheduleReconnect();
                }
              }
            }
          });
          this.ws.on(stryMutAct_9fa48("40992") ? "" : (stryCov_9fa48("40992"), 'error'), err => {
            if (stryMutAct_9fa48("40993")) {
              {}
            } else {
              stryCov_9fa48("40993");
              clearTimeout(connectionTimeout);
              stryMutAct_9fa48("40994") ? this.onError(err) : (stryCov_9fa48("40994"), this.onError?.(err));

              // If we're still connecting, reject the promise
              if (stryMutAct_9fa48("40997") ? this.status !== 'connecting' : stryMutAct_9fa48("40996") ? false : stryMutAct_9fa48("40995") ? true : (stryCov_9fa48("40995", "40996", "40997"), this.status === (stryMutAct_9fa48("40998") ? "" : (stryCov_9fa48("40998"), 'connecting')))) {
                if (stryMutAct_9fa48("40999")) {
                  {}
                } else {
                  stryCov_9fa48("40999");
                  this.status = stryMutAct_9fa48("41000") ? "" : (stryCov_9fa48("41000"), 'disconnected');
                  stryMutAct_9fa48("41001") ? this.onStatusChange('disconnected') : (stryCov_9fa48("41001"), this.onStatusChange?.(stryMutAct_9fa48("41002") ? "" : (stryCov_9fa48("41002"), 'disconnected')));
                  reject(err);
                }
              }
            }
          });
        }
      });
    }
  }

  /**
   * Handle incoming WebSocket message
   * @param {Buffer|string} data - Raw message data
   */
  handleMessage(data) {
    if (stryMutAct_9fa48("41003")) {
      {}
    } else {
      stryCov_9fa48("41003");
      try {
        if (stryMutAct_9fa48("41004")) {
          {}
        } else {
          stryCov_9fa48("41004");
          const message = JSON.parse(data.toString());
          switch (message.type) {
            case ADMIN_MESSAGE_TYPE.CACHE_DUMP:
              if (stryMutAct_9fa48("41005")) {} else {
                stryCov_9fa48("41005");
                if (stryMutAct_9fa48("41007") ? false : stryMutAct_9fa48("41006") ? true : (stryCov_9fa48("41006", "41007"), this.onCacheDump)) {
                  if (stryMutAct_9fa48("41008")) {
                    {}
                  } else {
                    stryCov_9fa48("41008");
                    this.onCacheDump(message.data);
                  }
                }
                break;
              }
            case ADMIN_MESSAGE_TYPE.CDC_EVENT:
              if (stryMutAct_9fa48("41009")) {} else {
                stryCov_9fa48("41009");
                // Server sends CDC event fields directly in message
                // Transform to format expected by RemoteCache.applyCDCEvent()
                if (stryMutAct_9fa48("41011") ? false : stryMutAct_9fa48("41010") ? true : (stryCov_9fa48("41010", "41011"), this.onCDCEvent)) {
                  if (stryMutAct_9fa48("41012")) {
                    {}
                  } else {
                    stryCov_9fa48("41012");
                    this.onCDCEvent(stryMutAct_9fa48("41013") ? {} : (stryCov_9fa48("41013"), {
                      table: message.table,
                      operation: stryMutAct_9fa48("41015") ? message.operation.toUpperCase() : stryMutAct_9fa48("41014") ? message.operation?.toLowerCase() : (stryCov_9fa48("41014", "41015"), message.operation?.toUpperCase()),
                      data: message.record,
                      key: stryMutAct_9fa48("41016") ? message.record[this.getPrimaryKeyField(message.table)] : (stryCov_9fa48("41016"), message.record?.[this.getPrimaryKeyField(message.table)]),
                      timestamp: message.timestamp
                    }));
                  }
                }
                break;
              }
            case ADMIN_MESSAGE_TYPE.QUERY_RESULT:
              if (stryMutAct_9fa48("41017")) {} else {
                stryCov_9fa48("41017");
                if (stryMutAct_9fa48("41019") ? false : stryMutAct_9fa48("41018") ? true : (stryCov_9fa48("41018", "41019"), this.onQueryResult)) {
                  if (stryMutAct_9fa48("41020")) {
                    {}
                  } else {
                    stryCov_9fa48("41020");
                    this.onQueryResult(message);
                  }
                }
                break;
              }
            case ADMIN_MESSAGE_TYPE.LIVE_QUERY_EVENT:
              if (stryMutAct_9fa48("41021")) {} else {
                stryCov_9fa48("41021");
                if (stryMutAct_9fa48("41023") ? false : stryMutAct_9fa48("41022") ? true : (stryCov_9fa48("41022", "41023"), this.onLiveQueryEvent)) {
                  if (stryMutAct_9fa48("41024")) {
                    {}
                  } else {
                    stryCov_9fa48("41024");
                    this.onLiveQueryEvent(message);
                  }
                }
                break;
              }
            case ADMIN_MESSAGE_TYPE.ERROR:
              if (stryMutAct_9fa48("41025")) {} else {
                stryCov_9fa48("41025");
                if (stryMutAct_9fa48("41027") ? false : stryMutAct_9fa48("41026") ? true : (stryCov_9fa48("41026", "41027"), this.onError)) {
                  if (stryMutAct_9fa48("41028")) {
                    {}
                  } else {
                    stryCov_9fa48("41028");
                    this.onError(new Error(stryMutAct_9fa48("41031") ? (message.error || message.message) && 'Unknown error' : stryMutAct_9fa48("41030") ? false : stryMutAct_9fa48("41029") ? true : (stryCov_9fa48("41029", "41030", "41031"), (stryMutAct_9fa48("41033") ? message.error && message.message : stryMutAct_9fa48("41032") ? false : (stryCov_9fa48("41032", "41033"), message.error || message.message)) || (stryMutAct_9fa48("41034") ? "" : (stryCov_9fa48("41034"), 'Unknown error')))));
                  }
                }
                break;
              }
            default:
              if (stryMutAct_9fa48("41035")) {} else {
                stryCov_9fa48("41035");
                // Unknown message type - ignore
                break;
              }
          }
        }
      } catch (err) {
        if (stryMutAct_9fa48("41036")) {
          {}
        } else {
          stryCov_9fa48("41036");
          if (stryMutAct_9fa48("41038") ? false : stryMutAct_9fa48("41037") ? true : (stryCov_9fa48("41037", "41038"), this.onError)) {
            if (stryMutAct_9fa48("41039")) {
              {}
            } else {
              stryCov_9fa48("41039");
              this.onError(new Error(stryMutAct_9fa48("41040") ? `` : (stryCov_9fa48("41040"), `Failed to parse message: ${err.message}`)));
            }
          }
        }
      }
    }
  }

  /**
   * Get the primary key field name for a table
   * @param {string} tableName - Table name
   * @return {string} Primary key field name
   */
  getPrimaryKeyField(tableName) {
    if (stryMutAct_9fa48("41041")) {
      {}
    } else {
      stryCov_9fa48("41041");
      const primaryKeys = stryMutAct_9fa48("41042") ? {} : (stryCov_9fa48("41042"), {
        nodes: stryMutAct_9fa48("41043") ? "" : (stryCov_9fa48("41043"), 'node_id'),
        services: stryMutAct_9fa48("41044") ? "" : (stryCov_9fa48("41044"), 'service_id'),
        partitions: stryMutAct_9fa48("41045") ? "" : (stryCov_9fa48("41045"), 'partition_id'),
        tables: stryMutAct_9fa48("41046") ? "" : (stryCov_9fa48("41046"), 'table_id'),
        message_groups: stryMutAct_9fa48("41047") ? "" : (stryCov_9fa48("41047"), 'group_id'),
        indices: stryMutAct_9fa48("41048") ? "" : (stryCov_9fa48("41048"), 'index_id'),
        logs: stryMutAct_9fa48("41049") ? "" : (stryCov_9fa48("41049"), 'log_id'),
        config: stryMutAct_9fa48("41050") ? "" : (stryCov_9fa48("41050"), 'key'),
        contexts: stryMutAct_9fa48("41051") ? "" : (stryCov_9fa48("41051"), 'context_id')
      });
      return stryMutAct_9fa48("41054") ? primaryKeys[tableName] && 'id' : stryMutAct_9fa48("41053") ? false : stryMutAct_9fa48("41052") ? true : (stryCov_9fa48("41052", "41053", "41054"), primaryKeys[tableName] || (stryMutAct_9fa48("41055") ? "" : (stryCov_9fa48("41055"), 'id')));
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  scheduleReconnect() {
    if (stryMutAct_9fa48("41056")) {
      {}
    } else {
      stryCov_9fa48("41056");
      if (stryMutAct_9fa48("41058") ? false : stryMutAct_9fa48("41057") ? true : (stryCov_9fa48("41057", "41058"), this.intentionalDisconnect)) {
        if (stryMutAct_9fa48("41059")) {
          {}
        } else {
          stryCov_9fa48("41059");
          return;
        }
      }
      if (stryMutAct_9fa48("41063") ? this.reconnectAttempts < this.maxReconnectAttempts : stryMutAct_9fa48("41062") ? this.reconnectAttempts > this.maxReconnectAttempts : stryMutAct_9fa48("41061") ? false : stryMutAct_9fa48("41060") ? true : (stryCov_9fa48("41060", "41061", "41062", "41063"), this.reconnectAttempts >= this.maxReconnectAttempts)) {
        if (stryMutAct_9fa48("41064")) {
          {}
        } else {
          stryCov_9fa48("41064");
          this.status = stryMutAct_9fa48("41065") ? "" : (stryCov_9fa48("41065"), 'failed');
          stryMutAct_9fa48("41066") ? this.onStatusChange('failed') : (stryCov_9fa48("41066"), this.onStatusChange?.(stryMutAct_9fa48("41067") ? "" : (stryCov_9fa48("41067"), 'failed')));
          return;
        }
      }
      const delay = this.calculateBackoffDelay(this.reconnectAttempts);
      stryMutAct_9fa48("41068") ? this.reconnectAttempts-- : (stryCov_9fa48("41068"), this.reconnectAttempts++);
      this.status = stryMutAct_9fa48("41069") ? "" : (stryCov_9fa48("41069"), 'reconnecting');
      stryMutAct_9fa48("41070") ? this.onStatusChange('reconnecting', delay) : (stryCov_9fa48("41070"), this.onStatusChange?.(stryMutAct_9fa48("41071") ? "" : (stryCov_9fa48("41071"), 'reconnecting'), delay));
      this.reconnectTimer = setTimeout(() => {
        if (stryMutAct_9fa48("41072")) {
          {}
        } else {
          stryCov_9fa48("41072");
          this.reconnectTimer = null;
          if (stryMutAct_9fa48("41075") ? !this.intentionalDisconnect || this.currentAddress : stryMutAct_9fa48("41074") ? false : stryMutAct_9fa48("41073") ? true : (stryCov_9fa48("41073", "41074", "41075"), (stryMutAct_9fa48("41076") ? this.intentionalDisconnect : (stryCov_9fa48("41076"), !this.intentionalDisconnect)) && this.currentAddress)) {
            if (stryMutAct_9fa48("41077")) {
              {}
            } else {
              stryCov_9fa48("41077");
              this.connect(this.currentAddress).catch(() => {
                // Connection failed, scheduleReconnect will be called from close handler
              });
            }
          }
        }
      }, delay);
    }
  }

  /**
   * Cancel any pending reconnection
   */
  cancelReconnect() {
    if (stryMutAct_9fa48("41078")) {
      {}
    } else {
      stryCov_9fa48("41078");
      if (stryMutAct_9fa48("41080") ? false : stryMutAct_9fa48("41079") ? true : (stryCov_9fa48("41079", "41080"), this.reconnectTimer)) {
        if (stryMutAct_9fa48("41081")) {
          {}
        } else {
          stryCov_9fa48("41081");
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      }
    }
  }

  /**
   * Reset reconnection attempts counter
   */
  resetReconnectAttempts() {
    if (stryMutAct_9fa48("41082")) {
      {}
    } else {
      stryCov_9fa48("41082");
      this.reconnectAttempts = 0;
    }
  }

  /**
   * Send a SQL query to the server
   * @param {string} queryId - Unique query identifier
   * @param {string} sql - SQL statement
   * @param {Array} [params=[]] - Query parameters
   * @returns {boolean} Whether the message was sent
   */
  sendQuery(queryId, sql, params = stryMutAct_9fa48("41083") ? ["Stryker was here"] : (stryCov_9fa48("41083"), [])) {
    if (stryMutAct_9fa48("41084")) {
      {}
    } else {
      stryCov_9fa48("41084");
      if (stryMutAct_9fa48("41087") ? !this.ws && this.ws.readyState !== WebSocket.OPEN : stryMutAct_9fa48("41086") ? false : stryMutAct_9fa48("41085") ? true : (stryCov_9fa48("41085", "41086", "41087"), (stryMutAct_9fa48("41088") ? this.ws : (stryCov_9fa48("41088"), !this.ws)) || (stryMutAct_9fa48("41090") ? this.ws.readyState === WebSocket.OPEN : stryMutAct_9fa48("41089") ? false : (stryCov_9fa48("41089", "41090"), this.ws.readyState !== WebSocket.OPEN)))) {
        if (stryMutAct_9fa48("41091")) {
          {}
        } else {
          stryCov_9fa48("41091");
          return stryMutAct_9fa48("41092") ? true : (stryCov_9fa48("41092"), false);
        }
      }
      this.ws.send(JSON.stringify(stryMutAct_9fa48("41093") ? {} : (stryCov_9fa48("41093"), {
        type: ADMIN_MESSAGE_TYPE.QUERY,
        queryId,
        sql,
        params
      })));
      return stryMutAct_9fa48("41094") ? false : (stryCov_9fa48("41094"), true);
    }
  }

  /**
   * Subscribe to a live query
   * @param {string} subscriptionId - Unique subscription identifier
   * @param {string} sql - LIVE SELECT statement
   * @returns {boolean} Whether the message was sent
   */
  subscribeLiveQuery(subscriptionId, sql) {
    if (stryMutAct_9fa48("41095")) {
      {}
    } else {
      stryCov_9fa48("41095");
      if (stryMutAct_9fa48("41098") ? !this.ws && this.ws.readyState !== WebSocket.OPEN : stryMutAct_9fa48("41097") ? false : stryMutAct_9fa48("41096") ? true : (stryCov_9fa48("41096", "41097", "41098"), (stryMutAct_9fa48("41099") ? this.ws : (stryCov_9fa48("41099"), !this.ws)) || (stryMutAct_9fa48("41101") ? this.ws.readyState === WebSocket.OPEN : stryMutAct_9fa48("41100") ? false : (stryCov_9fa48("41100", "41101"), this.ws.readyState !== WebSocket.OPEN)))) {
        if (stryMutAct_9fa48("41102")) {
          {}
        } else {
          stryCov_9fa48("41102");
          return stryMutAct_9fa48("41103") ? true : (stryCov_9fa48("41103"), false);
        }
      }
      this.ws.send(JSON.stringify(stryMutAct_9fa48("41104") ? {} : (stryCov_9fa48("41104"), {
        type: ADMIN_MESSAGE_TYPE.LIVE_QUERY_SUBSCRIBE,
        subscriptionId,
        sql
      })));
      return stryMutAct_9fa48("41105") ? false : (stryCov_9fa48("41105"), true);
    }
  }

  /**
   * Unsubscribe from a live query
   * @param {string} subscriptionId - Subscription identifier
   * @returns {boolean} Whether the message was sent
   */
  unsubscribeLiveQuery(subscriptionId) {
    if (stryMutAct_9fa48("41106")) {
      {}
    } else {
      stryCov_9fa48("41106");
      if (stryMutAct_9fa48("41109") ? !this.ws && this.ws.readyState !== WebSocket.OPEN : stryMutAct_9fa48("41108") ? false : stryMutAct_9fa48("41107") ? true : (stryCov_9fa48("41107", "41108", "41109"), (stryMutAct_9fa48("41110") ? this.ws : (stryCov_9fa48("41110"), !this.ws)) || (stryMutAct_9fa48("41112") ? this.ws.readyState === WebSocket.OPEN : stryMutAct_9fa48("41111") ? false : (stryCov_9fa48("41111", "41112"), this.ws.readyState !== WebSocket.OPEN)))) {
        if (stryMutAct_9fa48("41113")) {
          {}
        } else {
          stryCov_9fa48("41113");
          return stryMutAct_9fa48("41114") ? true : (stryCov_9fa48("41114"), false);
        }
      }
      this.ws.send(JSON.stringify(stryMutAct_9fa48("41115") ? {} : (stryCov_9fa48("41115"), {
        type: ADMIN_MESSAGE_TYPE.LIVE_QUERY_UNSUBSCRIBE,
        subscriptionId
      })));
      return stryMutAct_9fa48("41116") ? false : (stryCov_9fa48("41116"), true);
    }
  }

  /**
   * Request a full cache dump from the server
   * @returns {boolean} Whether the message was sent
   */
  requestCacheDump() {
    if (stryMutAct_9fa48("41117")) {
      {}
    } else {
      stryCov_9fa48("41117");
      if (stryMutAct_9fa48("41120") ? !this.ws && this.ws.readyState !== WebSocket.OPEN : stryMutAct_9fa48("41119") ? false : stryMutAct_9fa48("41118") ? true : (stryCov_9fa48("41118", "41119", "41120"), (stryMutAct_9fa48("41121") ? this.ws : (stryCov_9fa48("41121"), !this.ws)) || (stryMutAct_9fa48("41123") ? this.ws.readyState === WebSocket.OPEN : stryMutAct_9fa48("41122") ? false : (stryCov_9fa48("41122", "41123"), this.ws.readyState !== WebSocket.OPEN)))) {
        if (stryMutAct_9fa48("41124")) {
          {}
        } else {
          stryCov_9fa48("41124");
          return stryMutAct_9fa48("41125") ? true : (stryCov_9fa48("41125"), false);
        }
      }
      this.ws.send(JSON.stringify(stryMutAct_9fa48("41126") ? {} : (stryCov_9fa48("41126"), {
        type: ADMIN_MESSAGE_TYPE.REFRESH
      })));
      return stryMutAct_9fa48("41127") ? false : (stryCov_9fa48("41127"), true);
    }
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (stryMutAct_9fa48("41128")) {
      {}
    } else {
      stryCov_9fa48("41128");
      this.intentionalDisconnect = stryMutAct_9fa48("41129") ? false : (stryCov_9fa48("41129"), true);
      this.cancelReconnect();
      if (stryMutAct_9fa48("41131") ? false : stryMutAct_9fa48("41130") ? true : (stryCov_9fa48("41130", "41131"), this.ws)) {
        if (stryMutAct_9fa48("41132")) {
          {}
        } else {
          stryCov_9fa48("41132");
          this.ws.close();
          this.ws = null;
        }
      }
      this.status = stryMutAct_9fa48("41133") ? "" : (stryCov_9fa48("41133"), 'disconnected');
      stryMutAct_9fa48("41134") ? this.onStatusChange('disconnected') : (stryCov_9fa48("41134"), this.onStatusChange?.(stryMutAct_9fa48("41135") ? "" : (stryCov_9fa48("41135"), 'disconnected')));
    }
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    if (stryMutAct_9fa48("41136")) {
      {}
    } else {
      stryCov_9fa48("41136");
      return stryMutAct_9fa48("41139") ? this.status === 'connected' && this.ws !== null || this.ws.readyState === WebSocket.OPEN : stryMutAct_9fa48("41138") ? false : stryMutAct_9fa48("41137") ? true : (stryCov_9fa48("41137", "41138", "41139"), (stryMutAct_9fa48("41141") ? this.status === 'connected' || this.ws !== null : stryMutAct_9fa48("41140") ? true : (stryCov_9fa48("41140", "41141"), (stryMutAct_9fa48("41143") ? this.status !== 'connected' : stryMutAct_9fa48("41142") ? true : (stryCov_9fa48("41142", "41143"), this.status === (stryMutAct_9fa48("41144") ? "" : (stryCov_9fa48("41144"), 'connected')))) && (stryMutAct_9fa48("41146") ? this.ws === null : stryMutAct_9fa48("41145") ? true : (stryCov_9fa48("41145", "41146"), this.ws !== null)))) && (stryMutAct_9fa48("41148") ? this.ws.readyState !== WebSocket.OPEN : stryMutAct_9fa48("41147") ? true : (stryCov_9fa48("41147", "41148"), this.ws.readyState === WebSocket.OPEN)));
    }
  }
}