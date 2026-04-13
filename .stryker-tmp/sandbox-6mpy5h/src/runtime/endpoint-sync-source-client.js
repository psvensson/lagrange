/**
 * Endpoint sync source client over Admin WebSocket stream.
 *
 * Executes SQL queries against /api/admin/stream and returns
 * query_result rows with retry/backoff handling.
 *
 * @module runtime/endpoint-sync-source-client
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
import { TYPEOF } from '../constants/index.js';
import { ADMIN_MESSAGE_TYPE } from '../admin/admin-constants.js';
import { BaseError } from '../utils/base-error.js';
import { ENDPOINT_SYNC_DEFAULT, ENDPOINT_SYNC_ERROR, ENDPOINT_SYNC_SOURCE_QUERY } from './endpoint-sync-constants.js';
import { buildEndpointSourceQuery, normalizeEndpointRows } from './endpoint-sync-source-query.js';
const ADMIN_AUTH_HEADER = stryMutAct_9fa48("146121") ? "" : (stryCov_9fa48("146121"), 'authorization');
const BEARER_PREFIX = stryMutAct_9fa48("146122") ? "" : (stryCov_9fa48("146122"), 'Bearer ');
let queryCounter = 0;

/**
 * Build deterministic query id.
 *
 * @return {string}
 */
function nextQueryId() {
  if (stryMutAct_9fa48("146123")) {
    {}
  } else {
    stryCov_9fa48("146123");
    stryMutAct_9fa48("146124") ? queryCounter -= 1 : (stryCov_9fa48("146124"), queryCounter += 1);
    return stryMutAct_9fa48("146125") ? ENDPOINT_SYNC_SOURCE_QUERY.QUERY_ID_PREFIX - queryCounter : (stryCov_9fa48("146125"), ENDPOINT_SYNC_SOURCE_QUERY.QUERY_ID_PREFIX + queryCounter);
  }
}

/**
 * Sleep helper for retry delay.
 *
 * @param {number} ms - Delay milliseconds.
 * @return {Promise<void>}
 */
function sleep(ms) {
  if (stryMutAct_9fa48("146126")) {
    {}
  } else {
    stryCov_9fa48("146126");
    return new Promise(stryMutAct_9fa48("146127") ? () => undefined : (stryCov_9fa48("146127"), resolve => setTimeout(resolve, ms)));
  }
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
    if (stryMutAct_9fa48("146128")) {
      {}
    } else {
      stryCov_9fa48("146128");
      super(message, stryMutAct_9fa48("146129") ? {} : (stryCov_9fa48("146129"), {
        cause,
        context: stryMutAct_9fa48("146130") ? {} : (stryCov_9fa48("146130"), {
          component: stryMutAct_9fa48("146131") ? "" : (stryCov_9fa48("146131"), 'EndpointSyncSourceClient'),
          operation: stryMutAct_9fa48("146132") ? "" : (stryCov_9fa48("146132"), 'query'),
          metadata
        })
      }));
    }
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
    if (stryMutAct_9fa48("146133")) {
      {}
    } else {
      stryCov_9fa48("146133");
      super(ENDPOINT_SYNC_ERROR.SOURCE_QUERY_TIMEOUT, stryMutAct_9fa48("146134") ? {} : (stryCov_9fa48("146134"), {
        timeoutMs,
        ...metadata
      }));
    }
  }
}

/**
 * Build auth header object from optional token.
 *
 * @param {string|null} token - Optional auth token.
 * @return {Object}
 */
function buildAuthHeaders(token) {
  if (stryMutAct_9fa48("146135")) {
    {}
  } else {
    stryCov_9fa48("146135");
    if (stryMutAct_9fa48("146138") ? !token && typeof token !== TYPEOF.STRING : stryMutAct_9fa48("146137") ? false : stryMutAct_9fa48("146136") ? true : (stryCov_9fa48("146136", "146137", "146138"), (stryMutAct_9fa48("146139") ? token : (stryCov_9fa48("146139"), !token)) || (stryMutAct_9fa48("146141") ? typeof token === TYPEOF.STRING : stryMutAct_9fa48("146140") ? false : (stryCov_9fa48("146140", "146141"), typeof token !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("146142")) {
        {}
      } else {
        stryCov_9fa48("146142");
        return {};
      }
    }
    return stryMutAct_9fa48("146143") ? {} : (stryCov_9fa48("146143"), {
      [ADMIN_AUTH_HEADER]: stryMutAct_9fa48("146144") ? `` : (stryCov_9fa48("146144"), `${BEARER_PREFIX}${token}`)
    });
  }
}

/**
 * Validate and extract rows from admin query_result message.
 *
 * @param {Object} message - Parsed admin message.
 * @param {string} queryId - Expected query id.
 * @return {{done: boolean, rows?: Array<Object>, error?: Error}}
 */
function readQueryResultMessage(message, queryId) {
  if (stryMutAct_9fa48("146145")) {
    {}
  } else {
    stryCov_9fa48("146145");
    if (stryMutAct_9fa48("146148") ? !message && typeof message !== TYPEOF.OBJECT : stryMutAct_9fa48("146147") ? false : stryMutAct_9fa48("146146") ? true : (stryCov_9fa48("146146", "146147", "146148"), (stryMutAct_9fa48("146149") ? message : (stryCov_9fa48("146149"), !message)) || (stryMutAct_9fa48("146151") ? typeof message === TYPEOF.OBJECT : stryMutAct_9fa48("146150") ? false : (stryCov_9fa48("146150", "146151"), typeof message !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("146152")) {
        {}
      } else {
        stryCov_9fa48("146152");
        return stryMutAct_9fa48("146153") ? {} : (stryCov_9fa48("146153"), {
          done: stryMutAct_9fa48("146154") ? true : (stryCov_9fa48("146154"), false)
        });
      }
    }
    if (stryMutAct_9fa48("146157") ? message.type === ADMIN_MESSAGE_TYPE.QUERY_RESULT : stryMutAct_9fa48("146156") ? false : stryMutAct_9fa48("146155") ? true : (stryCov_9fa48("146155", "146156", "146157"), message.type !== ADMIN_MESSAGE_TYPE.QUERY_RESULT)) {
      if (stryMutAct_9fa48("146158")) {
        {}
      } else {
        stryCov_9fa48("146158");
        return stryMutAct_9fa48("146159") ? {} : (stryCov_9fa48("146159"), {
          done: stryMutAct_9fa48("146160") ? true : (stryCov_9fa48("146160"), false)
        });
      }
    }
    if (stryMutAct_9fa48("146163") ? message.queryId === queryId : stryMutAct_9fa48("146162") ? false : stryMutAct_9fa48("146161") ? true : (stryCov_9fa48("146161", "146162", "146163"), message.queryId !== queryId)) {
      if (stryMutAct_9fa48("146164")) {
        {}
      } else {
        stryCov_9fa48("146164");
        return stryMutAct_9fa48("146165") ? {} : (stryCov_9fa48("146165"), {
          done: stryMutAct_9fa48("146166") ? true : (stryCov_9fa48("146166"), false)
        });
      }
    }
    if (stryMutAct_9fa48("146168") ? false : stryMutAct_9fa48("146167") ? true : (stryCov_9fa48("146167", "146168"), message.error)) {
      if (stryMutAct_9fa48("146169")) {
        {}
      } else {
        stryCov_9fa48("146169");
        return stryMutAct_9fa48("146170") ? {} : (stryCov_9fa48("146170"), {
          done: stryMutAct_9fa48("146171") ? false : (stryCov_9fa48("146171"), true),
          error: new EndpointSyncSourceQueryError(stryMutAct_9fa48("146172") ? `` : (stryCov_9fa48("146172"), `${ENDPOINT_SYNC_ERROR.QUERY_RESULT_ERROR_PREFIX}: ${message.error}`), stryMutAct_9fa48("146173") ? {} : (stryCov_9fa48("146173"), {
            queryId
          }))
        });
      }
    }
    const rows = message.results;
    if (stryMutAct_9fa48("146176") ? false : stryMutAct_9fa48("146175") ? true : stryMutAct_9fa48("146174") ? Array.isArray(rows) : (stryCov_9fa48("146174", "146175", "146176"), !Array.isArray(rows))) {
      if (stryMutAct_9fa48("146177")) {
        {}
      } else {
        stryCov_9fa48("146177");
        return stryMutAct_9fa48("146178") ? {} : (stryCov_9fa48("146178"), {
          done: stryMutAct_9fa48("146179") ? false : (stryCov_9fa48("146179"), true),
          error: new EndpointSyncSourceQueryError(ENDPOINT_SYNC_ERROR.QUERY_RESULT_ROWS_INVALID, stryMutAct_9fa48("146180") ? {} : (stryCov_9fa48("146180"), {
            queryId
          }))
        });
      }
    }
    return stryMutAct_9fa48("146181") ? {} : (stryCov_9fa48("146181"), {
      done: stryMutAct_9fa48("146182") ? false : (stryCov_9fa48("146182"), true),
      rows
    });
  }
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
    if (stryMutAct_9fa48("146183")) {
      {}
    } else {
      stryCov_9fa48("146183");
      this._WebSocketImpl = stryMutAct_9fa48("146186") ? options.WebSocketImpl && WebSocket : stryMutAct_9fa48("146185") ? false : stryMutAct_9fa48("146184") ? true : (stryCov_9fa48("146184", "146185", "146186"), options.WebSocketImpl || WebSocket);
    }
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
    if (stryMutAct_9fa48("146187")) {
      {}
    } else {
      stryCov_9fa48("146187");
      const timeoutMs = stryMutAct_9fa48("146190") ? options.timeoutMs && ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_TIMEOUT_MS : stryMutAct_9fa48("146189") ? false : stryMutAct_9fa48("146188") ? true : (stryCov_9fa48("146188", "146189", "146190"), options.timeoutMs || ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_TIMEOUT_MS);
      const maxRetries = stryMutAct_9fa48("146193") ? options.maxRetries && ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_MAX_RETRIES : stryMutAct_9fa48("146192") ? false : stryMutAct_9fa48("146191") ? true : (stryCov_9fa48("146191", "146192", "146193"), options.maxRetries || ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_MAX_RETRIES);
      const retryDelayMs = stryMutAct_9fa48("146196") ? options.retryDelayMs && ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_RETRY_DELAY_MS : stryMutAct_9fa48("146195") ? false : stryMutAct_9fa48("146194") ? true : (stryCov_9fa48("146194", "146195", "146196"), options.retryDelayMs || ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_RETRY_DELAY_MS);
      const query = buildEndpointSourceQuery(stryMutAct_9fa48("146197") ? {} : (stryCov_9fa48("146197"), {
        protocolAllowlist: options.protocolAllowlist,
        serviceIdAllowlist: options.serviceIdAllowlist,
        healthyOnly: options.healthyOnly
      }));
      let lastError = null;
      for (let attempt = 0; stryMutAct_9fa48("146200") ? attempt > maxRetries : stryMutAct_9fa48("146199") ? attempt < maxRetries : stryMutAct_9fa48("146198") ? false : (stryCov_9fa48("146198", "146199", "146200"), attempt <= maxRetries); stryMutAct_9fa48("146201") ? attempt-- : (stryCov_9fa48("146201"), attempt++)) {
        if (stryMutAct_9fa48("146202")) {
          {}
        } else {
          stryCov_9fa48("146202");
          try {
            if (stryMutAct_9fa48("146203")) {
              {}
            } else {
              stryCov_9fa48("146203");
              const rows = await this._executeQueryOnce(stryMutAct_9fa48("146204") ? {} : (stryCov_9fa48("146204"), {
                adminStreamUrl: options.adminStreamUrl,
                adminAuthToken: stryMutAct_9fa48("146207") ? options.adminAuthToken && null : stryMutAct_9fa48("146206") ? false : stryMutAct_9fa48("146205") ? true : (stryCov_9fa48("146205", "146206", "146207"), options.adminAuthToken || null),
                sql: query.sql,
                params: query.params,
                timeoutMs
              }));
              return normalizeEndpointRows(rows);
            }
          } catch (error) {
            if (stryMutAct_9fa48("146208")) {
              {}
            } else {
              stryCov_9fa48("146208");
              lastError = error;
              if (stryMutAct_9fa48("146211") ? attempt !== maxRetries : stryMutAct_9fa48("146210") ? false : stryMutAct_9fa48("146209") ? true : (stryCov_9fa48("146209", "146210", "146211"), attempt === maxRetries)) {
                if (stryMutAct_9fa48("146212")) {
                  {}
                } else {
                  stryCov_9fa48("146212");
                  break;
                }
              }
              await sleep(stryMutAct_9fa48("146213") ? retryDelayMs / (attempt + 1) : (stryCov_9fa48("146213"), retryDelayMs * (stryMutAct_9fa48("146214") ? attempt - 1 : (stryCov_9fa48("146214"), attempt + 1))));
            }
          }
        }
      }
      throw new EndpointSyncSourceQueryError(ENDPOINT_SYNC_ERROR.SOURCE_QUERY_FAILED, stryMutAct_9fa48("146215") ? {} : (stryCov_9fa48("146215"), {
        adminStreamUrl: options.adminStreamUrl,
        maxRetries
      }), lastError);
    }
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
    if (stryMutAct_9fa48("146216")) {
      {}
    } else {
      stryCov_9fa48("146216");
      const queryId = nextQueryId();
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("146217")) {
          {}
        } else {
          stryCov_9fa48("146217");
          let settled = stryMutAct_9fa48("146218") ? true : (stryCov_9fa48("146218"), false);
          const headers = buildAuthHeaders(options.adminAuthToken);
          const socket = new this._WebSocketImpl(options.adminStreamUrl, stryMutAct_9fa48("146219") ? {} : (stryCov_9fa48("146219"), {
            headers
          }));
          const timeoutId = setTimeout(() => {
            if (stryMutAct_9fa48("146220")) {
              {}
            } else {
              stryCov_9fa48("146220");
              if (stryMutAct_9fa48("146222") ? false : stryMutAct_9fa48("146221") ? true : (stryCov_9fa48("146221", "146222"), settled)) {
                if (stryMutAct_9fa48("146223")) {
                  {}
                } else {
                  stryCov_9fa48("146223");
                  return;
                }
              }
              settled = stryMutAct_9fa48("146224") ? false : (stryCov_9fa48("146224"), true);
              try {
                if (stryMutAct_9fa48("146225")) {
                  {}
                } else {
                  stryCov_9fa48("146225");
                  socket.close();
                }
              } catch (_error) {
                // best effort cleanup
              }
              reject(new EndpointSyncSourceTimeoutError(options.timeoutMs, stryMutAct_9fa48("146226") ? {} : (stryCov_9fa48("146226"), {
                queryId,
                adminStreamUrl: options.adminStreamUrl
              })));
            }
          }, options.timeoutMs);
          const finalize = (error, rows) => {
            if (stryMutAct_9fa48("146227")) {
              {}
            } else {
              stryCov_9fa48("146227");
              if (stryMutAct_9fa48("146229") ? false : stryMutAct_9fa48("146228") ? true : (stryCov_9fa48("146228", "146229"), settled)) {
                if (stryMutAct_9fa48("146230")) {
                  {}
                } else {
                  stryCov_9fa48("146230");
                  return;
                }
              }
              settled = stryMutAct_9fa48("146231") ? false : (stryCov_9fa48("146231"), true);
              clearTimeout(timeoutId);
              try {
                if (stryMutAct_9fa48("146232")) {
                  {}
                } else {
                  stryCov_9fa48("146232");
                  socket.close();
                }
              } catch (_error) {
                // best effort cleanup
              }
              if (stryMutAct_9fa48("146234") ? false : stryMutAct_9fa48("146233") ? true : (stryCov_9fa48("146233", "146234"), error)) {
                if (stryMutAct_9fa48("146235")) {
                  {}
                } else {
                  stryCov_9fa48("146235");
                  reject(error);
                  return;
                }
              }
              resolve(rows);
            }
          };
          socket.on(stryMutAct_9fa48("146236") ? "" : (stryCov_9fa48("146236"), 'open'), () => {
            if (stryMutAct_9fa48("146237")) {
              {}
            } else {
              stryCov_9fa48("146237");
              const message = stryMutAct_9fa48("146238") ? {} : (stryCov_9fa48("146238"), {
                type: ADMIN_MESSAGE_TYPE.QUERY,
                queryId,
                sql: options.sql,
                params: options.params
              });
              socket.send(JSON.stringify(message));
            }
          });
          socket.on(stryMutAct_9fa48("146239") ? "" : (stryCov_9fa48("146239"), 'message'), frame => {
            if (stryMutAct_9fa48("146240")) {
              {}
            } else {
              stryCov_9fa48("146240");
              let parsed;
              try {
                if (stryMutAct_9fa48("146241")) {
                  {}
                } else {
                  stryCov_9fa48("146241");
                  parsed = JSON.parse(frame.toString());
                }
              } catch (_error) {
                if (stryMutAct_9fa48("146242")) {
                  {}
                } else {
                  stryCov_9fa48("146242");
                  return;
                }
              }
              const result = readQueryResultMessage(parsed, queryId);
              if (stryMutAct_9fa48("146245") ? false : stryMutAct_9fa48("146244") ? true : stryMutAct_9fa48("146243") ? result.done : (stryCov_9fa48("146243", "146244", "146245"), !result.done)) {
                if (stryMutAct_9fa48("146246")) {
                  {}
                } else {
                  stryCov_9fa48("146246");
                  return;
                }
              }
              if (stryMutAct_9fa48("146248") ? false : stryMutAct_9fa48("146247") ? true : (stryCov_9fa48("146247", "146248"), result.error)) {
                if (stryMutAct_9fa48("146249")) {
                  {}
                } else {
                  stryCov_9fa48("146249");
                  finalize(result.error, null);
                  return;
                }
              }
              finalize(null, result.rows);
            }
          });
          socket.on(stryMutAct_9fa48("146250") ? "" : (stryCov_9fa48("146250"), 'error'), error => {
            if (stryMutAct_9fa48("146251")) {
              {}
            } else {
              stryCov_9fa48("146251");
              finalize(new EndpointSyncSourceQueryError(ENDPOINT_SYNC_ERROR.SOURCE_QUERY_FAILED, stryMutAct_9fa48("146252") ? {} : (stryCov_9fa48("146252"), {
                queryId,
                adminStreamUrl: options.adminStreamUrl
              }), error), null);
            }
          });
          socket.on(stryMutAct_9fa48("146253") ? "" : (stryCov_9fa48("146253"), 'close'), () => {
            if (stryMutAct_9fa48("146254")) {
              {}
            } else {
              stryCov_9fa48("146254");
              if (stryMutAct_9fa48("146257") ? false : stryMutAct_9fa48("146256") ? true : stryMutAct_9fa48("146255") ? settled : (stryCov_9fa48("146255", "146256", "146257"), !settled)) {
                if (stryMutAct_9fa48("146258")) {
                  {}
                } else {
                  stryCov_9fa48("146258");
                  finalize(new EndpointSyncSourceQueryError(ENDPOINT_SYNC_ERROR.SOURCE_QUERY_UNEXPECTED_MESSAGE, stryMutAct_9fa48("146259") ? {} : (stryCov_9fa48("146259"), {
                    queryId
                  })), null);
                }
              }
            }
          });
        }
      });
    }
  }
}
export { EndpointSyncSourceQueryError, EndpointSyncSourceTimeoutError, nextQueryId, sleep, buildAuthHeaders, readQueryResultMessage, EndpointSyncSourceClient };