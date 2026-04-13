/**
 * PostgreSQL wire runtime module — lifecycle-capable native JS
 * module resolved by `runtime_ref = 'postgres-wire-runtime'`.
 *
 * Implements the runtime lifecycle contract:
 *   prepare(definition, context) — validates runtime config
 *   start(replicaContext)        — binds TCP listener, returns
 *                                  endpoint intent
 *   stop(replicaContext)         — closes listener and connections
 *   health(replicaContext)       — reports bind/session health
 *
 * The module does NOT write system tables directly. Endpoint
 * intent returned from start() is published by the lifecycle
 * owner through the SQL/CDC path.
 *
 * Requirements: 2.1, 6.1, 7.1, 9.1
 *
 * @module runtime/pgwire-runtime-module
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
import net from 'node:net';
import { TYPEOF } from '../constants/types.js';
import { WASM_SERVICE_PROTOCOL } from '../wasm-service/wasm-service-constants.js';
import { validatePgwireRuntimeConfig, PGWIRE_CONFIG_FIELD } from './pgwire-descriptor.js';
import { PREPARE_STATUS, START_STATUS, HEALTH_STATUS } from './runtime-driver.js';
import { classifyBindError } from './pgwire-port-allocator.js';

// --- Default configuration values ---

const PGWIRE_DEFAULT = Object.freeze(stryMutAct_9fa48("148318") ? {} : (stryCov_9fa48("148318"), {
  HOST: stryMutAct_9fa48("148319") ? "" : (stryCov_9fa48("148319"), '0.0.0.0'),
  PORT: 5432,
  MAX_SESSIONS: 100
}));

// --- Error messages ---

const PGWIRE_MODULE_ERROR = Object.freeze(stryMutAct_9fa48("148320") ? {} : (stryCov_9fa48("148320"), {
  DEFINITION_REQUIRED: stryMutAct_9fa48("148321") ? "" : (stryCov_9fa48("148321"), 'service definition is required'),
  REPLICA_CONTEXT_REQUIRED: stryMutAct_9fa48("148322") ? "" : (stryCov_9fa48("148322"), 'replicaContext is required'),
  SERVICE_ID_REQUIRED: stryMutAct_9fa48("148323") ? "" : (stryCov_9fa48("148323"), 'replicaContext.serviceId is required'),
  NOT_PREPARED: stryMutAct_9fa48("148324") ? "" : (stryCov_9fa48("148324"), 'module has not been prepared for this service'),
  NOT_STARTED: stryMutAct_9fa48("148325") ? "" : (stryCov_9fa48("148325"), 'service is not started'),
  ALREADY_STARTED: stryMutAct_9fa48("148326") ? "" : (stryCov_9fa48("148326"), 'listener is already started for this service'),
  CONFIG_INVALID: stryMutAct_9fa48("148327") ? "" : (stryCov_9fa48("148327"), 'runtime config validation failed'),
  BIND_FAILED: stryMutAct_9fa48("148328") ? "" : (stryCov_9fa48("148328"), 'TCP listener bind failed'),
  LISTENER_NOT_ACCEPTING: stryMutAct_9fa48("148329") ? "" : (stryCov_9fa48("148329"), 'TCP listener is not accepting connections')
}));

// --- Module state constants ---

const LISTENER_STATE = Object.freeze(stryMutAct_9fa48("148330") ? {} : (stryCov_9fa48("148330"), {
  BOUND: stryMutAct_9fa48("148331") ? "" : (stryCov_9fa48("148331"), 'bound'),
  CLOSED: stryMutAct_9fa48("148332") ? "" : (stryCov_9fa48("148332"), 'closed')
}));
const PGWIRE_EVENT = Object.freeze(stryMutAct_9fa48("148333") ? {} : (stryCov_9fa48("148333"), {
  CONNECTION: stryMutAct_9fa48("148334") ? "" : (stryCov_9fa48("148334"), 'connection'),
  CLOSE: stryMutAct_9fa48("148335") ? "" : (stryCov_9fa48("148335"), 'close'),
  ERROR: stryMutAct_9fa48("148336") ? "" : (stryCov_9fa48("148336"), 'error')
}));
const PGWIRE_CONTEXT_FIELD = Object.freeze(stryMutAct_9fa48("148337") ? {} : (stryCov_9fa48("148337"), {
  SERVICE_ID: stryMutAct_9fa48("148338") ? "" : (stryCov_9fa48("148338"), 'serviceId'),
  SERVICE_ID_LEGACY: stryMutAct_9fa48("148339") ? "" : (stryCov_9fa48("148339"), 'service_id')
}));
const PGWIRE_RESULT_FIELD = Object.freeze(stryMutAct_9fa48("148340") ? {} : (stryCov_9fa48("148340"), {
  ERROR: stryMutAct_9fa48("148341") ? "" : (stryCov_9fa48("148341"), 'error'),
  DETAIL: stryMutAct_9fa48("148342") ? "" : (stryCov_9fa48("148342"), 'detail')
}));
const PGWIRE_SEPARATOR = Object.freeze(stryMutAct_9fa48("148343") ? {} : (stryCov_9fa48("148343"), {
  DETAIL: stryMutAct_9fa48("148344") ? "" : (stryCov_9fa48("148344"), ': '),
  ERROR_LIST: stryMutAct_9fa48("148345") ? "" : (stryCov_9fa48("148345"), '; ')
}));
function buildStatusResult(status, detailKey, detailValueKey, detailValue) {
  if (stryMutAct_9fa48("148346")) {
    {}
  } else {
    stryCov_9fa48("148346");
    const result = stryMutAct_9fa48("148347") ? {} : (stryCov_9fa48("148347"), {
      status
    });
    if (stryMutAct_9fa48("148350") ? detailKey || detailValue : stryMutAct_9fa48("148349") ? false : stryMutAct_9fa48("148348") ? true : (stryCov_9fa48("148348", "148349", "148350"), detailKey && detailValue)) {
      if (stryMutAct_9fa48("148351")) {
        {}
      } else {
        stryCov_9fa48("148351");
        result[detailKey] = detailValue;
      }
    }
    if (stryMutAct_9fa48("148354") ? detailValueKey === undefined : stryMutAct_9fa48("148353") ? false : stryMutAct_9fa48("148352") ? true : (stryCov_9fa48("148352", "148353", "148354"), detailValueKey !== undefined)) {
      if (stryMutAct_9fa48("148355")) {
        {}
      } else {
        stryCov_9fa48("148355");
        result[detailValueKey] = detailValue;
      }
    }
    return result;
  }
}
function buildPgwireServiceScopedError(baseMessage, serviceId) {
  if (stryMutAct_9fa48("148356")) {
    {}
  } else {
    stryCov_9fa48("148356");
    return stryMutAct_9fa48("148357") ? `` : (stryCov_9fa48("148357"), `${baseMessage}: '${serviceId}'`);
  }
}

/**
 * Parse and resolve runtime config from a service definition.
 *
 * @param {Object} definition - The service definition.
 * @param {Object} [overrides] - Optional overrides from replica
 *   context (e.g. dynamic port allocation).
 * @return {{host: string, port: number, maxSessions: number}}
 */
function resolveConfig(definition, overrides) {
  if (stryMutAct_9fa48("148358")) {
    {}
  } else {
    stryCov_9fa48("148358");
    const raw = stryMutAct_9fa48("148359") ? definition.runtimeConfig && definition.runtime_config : (stryCov_9fa48("148359"), definition.runtimeConfig ?? definition.runtime_config);
    let parsed = {};
    if (stryMutAct_9fa48("148362") ? raw || typeof raw === TYPEOF.STRING : stryMutAct_9fa48("148361") ? false : stryMutAct_9fa48("148360") ? true : (stryCov_9fa48("148360", "148361", "148362"), raw && (stryMutAct_9fa48("148364") ? typeof raw !== TYPEOF.STRING : stryMutAct_9fa48("148363") ? true : (stryCov_9fa48("148363", "148364"), typeof raw === TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("148365")) {
        {}
      } else {
        stryCov_9fa48("148365");
        parsed = JSON.parse(raw);
      }
    } else if (stryMutAct_9fa48("148368") ? raw || typeof raw === TYPEOF.OBJECT : stryMutAct_9fa48("148367") ? false : stryMutAct_9fa48("148366") ? true : (stryCov_9fa48("148366", "148367", "148368"), raw && (stryMutAct_9fa48("148370") ? typeof raw !== TYPEOF.OBJECT : stryMutAct_9fa48("148369") ? true : (stryCov_9fa48("148369", "148370"), typeof raw === TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("148371")) {
        {}
      } else {
        stryCov_9fa48("148371");
        parsed = raw;
      }
    }
    return stryMutAct_9fa48("148372") ? {} : (stryCov_9fa48("148372"), {
      host: stryMutAct_9fa48("148373") ? (overrides?.host ?? parsed[PGWIRE_CONFIG_FIELD.HOST]) && PGWIRE_DEFAULT.HOST : (stryCov_9fa48("148373"), (stryMutAct_9fa48("148374") ? overrides?.host && parsed[PGWIRE_CONFIG_FIELD.HOST] : (stryCov_9fa48("148374"), (stryMutAct_9fa48("148375") ? overrides.host : (stryCov_9fa48("148375"), overrides?.host)) ?? parsed[PGWIRE_CONFIG_FIELD.HOST])) ?? PGWIRE_DEFAULT.HOST),
      port: stryMutAct_9fa48("148376") ? (overrides?.port ?? parsed[PGWIRE_CONFIG_FIELD.PORT]) && PGWIRE_DEFAULT.PORT : (stryCov_9fa48("148376"), (stryMutAct_9fa48("148377") ? overrides?.port && parsed[PGWIRE_CONFIG_FIELD.PORT] : (stryCov_9fa48("148377"), (stryMutAct_9fa48("148378") ? overrides.port : (stryCov_9fa48("148378"), overrides?.port)) ?? parsed[PGWIRE_CONFIG_FIELD.PORT])) ?? PGWIRE_DEFAULT.PORT),
      maxSessions: stryMutAct_9fa48("148379") ? (overrides?.maxSessions ?? parsed[PGWIRE_CONFIG_FIELD.MAX_SESSIONS]) && PGWIRE_DEFAULT.MAX_SESSIONS : (stryCov_9fa48("148379"), (stryMutAct_9fa48("148380") ? overrides?.maxSessions && parsed[PGWIRE_CONFIG_FIELD.MAX_SESSIONS] : (stryCov_9fa48("148380"), (stryMutAct_9fa48("148381") ? overrides.maxSessions : (stryCov_9fa48("148381"), overrides?.maxSessions)) ?? parsed[PGWIRE_CONFIG_FIELD.MAX_SESSIONS])) ?? PGWIRE_DEFAULT.MAX_SESSIONS)
    });
  }
}

/**
 * PostgresWireRuntimeModule — lifecycle-capable native JS module
 * for the sys-postgres-wire replicated service.
 *
 * Each prepared service gets a config snapshot. Each started
 * service gets a TCP server and connection tracking.
 */
class PostgresWireRuntimeModule {
  constructor() {
    if (stryMutAct_9fa48("148382")) {
      {}
    } else {
      stryCov_9fa48("148382");
      /** @type {Map<string, Object>} Prepared config by serviceId */
      this._prepared = new Map();

      /** @type {Map<string, Object>} Running state by serviceId */
      this._running = new Map();
    }
  }

  /**
   * Validate runtime config and prepare the module for a service.
   *
   * @param {Object} definition - The service definition.
   * @param {Object} [_context] - Preparation context (unused).
   * @return {Promise<{status: string, error?: string}>}
   */
  async prepare(definition, _context) {
    if (stryMutAct_9fa48("148383")) {
      {}
    } else {
      stryCov_9fa48("148383");
      let result;
      if (stryMutAct_9fa48("148386") ? !definition && typeof definition !== TYPEOF.OBJECT : stryMutAct_9fa48("148385") ? false : stryMutAct_9fa48("148384") ? true : (stryCov_9fa48("148384", "148385", "148386"), (stryMutAct_9fa48("148387") ? definition : (stryCov_9fa48("148387"), !definition)) || (stryMutAct_9fa48("148389") ? typeof definition === TYPEOF.OBJECT : stryMutAct_9fa48("148388") ? false : (stryCov_9fa48("148388", "148389"), typeof definition !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("148390")) {
          {}
        } else {
          stryCov_9fa48("148390");
          result = buildStatusResult(PREPARE_STATUS.FAILED, PGWIRE_RESULT_FIELD.ERROR, undefined, PGWIRE_MODULE_ERROR.DEFINITION_REQUIRED);
        }
      } else {
        if (stryMutAct_9fa48("148391")) {
          {}
        } else {
          stryCov_9fa48("148391");
          const configStr = stryMutAct_9fa48("148392") ? definition.runtimeConfig && definition.runtime_config : (stryCov_9fa48("148392"), definition.runtimeConfig ?? definition.runtime_config);
          const validation = validatePgwireRuntimeConfig(configStr);
          if (stryMutAct_9fa48("148395") ? false : stryMutAct_9fa48("148394") ? true : stryMutAct_9fa48("148393") ? validation.valid : (stryCov_9fa48("148393", "148394", "148395"), !validation.valid)) {
            if (stryMutAct_9fa48("148396")) {
              {}
            } else {
              stryCov_9fa48("148396");
              result = buildStatusResult(PREPARE_STATUS.FAILED, PGWIRE_RESULT_FIELD.ERROR, undefined, (stryMutAct_9fa48("148397") ? `` : (stryCov_9fa48("148397"), `${PGWIRE_MODULE_ERROR.CONFIG_INVALID}`)) + (stryMutAct_9fa48("148398") ? `` : (stryCov_9fa48("148398"), `${PGWIRE_SEPARATOR.DETAIL}`)) + (stryMutAct_9fa48("148399") ? `` : (stryCov_9fa48("148399"), `${validation.errors.join(PGWIRE_SEPARATOR.ERROR_LIST)}`)));
            }
          } else {
            if (stryMutAct_9fa48("148400")) {
              {}
            } else {
              stryCov_9fa48("148400");
              const serviceId = stryMutAct_9fa48("148401") ? definition[PGWIRE_CONTEXT_FIELD.SERVICE_ID] && definition[PGWIRE_CONTEXT_FIELD.SERVICE_ID_LEGACY] : (stryCov_9fa48("148401"), definition[PGWIRE_CONTEXT_FIELD.SERVICE_ID] ?? definition[PGWIRE_CONTEXT_FIELD.SERVICE_ID_LEGACY]);
              const config = resolveConfig(definition);
              this._prepared.set(serviceId, stryMutAct_9fa48("148402") ? {} : (stryCov_9fa48("148402"), {
                config,
                definition
              }));
              result = buildStatusResult(PREPARE_STATUS.READY);
            }
          }
        }
      }
      return result;
    }
  }

  /**
   * Bind a TCP listener and return endpoint intent.
   *
   * The listener accepts PostgreSQL client connections. Actual
   * protocol handling is wired externally (Task 12); this module
   * owns only the listener lifecycle.
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<{status: string, endpointIntent?: Object,
   *   error?: string}>}
   */
  async start(replicaContext) {
    if (stryMutAct_9fa48("148403")) {
      {}
    } else {
      stryCov_9fa48("148403");
      if (stryMutAct_9fa48("148406") ? !replicaContext && typeof replicaContext !== TYPEOF.OBJECT : stryMutAct_9fa48("148405") ? false : stryMutAct_9fa48("148404") ? true : (stryCov_9fa48("148404", "148405", "148406"), (stryMutAct_9fa48("148407") ? replicaContext : (stryCov_9fa48("148407"), !replicaContext)) || (stryMutAct_9fa48("148409") ? typeof replicaContext === TYPEOF.OBJECT : stryMutAct_9fa48("148408") ? false : (stryCov_9fa48("148408", "148409"), typeof replicaContext !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("148410")) {
          {}
        } else {
          stryCov_9fa48("148410");
          return buildStatusResult(START_STATUS.FAILED, PGWIRE_RESULT_FIELD.ERROR, undefined, PGWIRE_MODULE_ERROR.REPLICA_CONTEXT_REQUIRED);
        }
      }
      const serviceId = stryMutAct_9fa48("148411") ? replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID] && replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID_LEGACY] : (stryCov_9fa48("148411"), replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID] ?? replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID_LEGACY]);
      if (stryMutAct_9fa48("148414") ? false : stryMutAct_9fa48("148413") ? true : stryMutAct_9fa48("148412") ? serviceId : (stryCov_9fa48("148412", "148413", "148414"), !serviceId)) {
        if (stryMutAct_9fa48("148415")) {
          {}
        } else {
          stryCov_9fa48("148415");
          return buildStatusResult(START_STATUS.FAILED, PGWIRE_RESULT_FIELD.ERROR, undefined, PGWIRE_MODULE_ERROR.SERVICE_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("148418") ? false : stryMutAct_9fa48("148417") ? true : stryMutAct_9fa48("148416") ? this._prepared.has(serviceId) : (stryCov_9fa48("148416", "148417", "148418"), !this._prepared.has(serviceId))) {
        if (stryMutAct_9fa48("148419")) {
          {}
        } else {
          stryCov_9fa48("148419");
          return buildStatusResult(START_STATUS.FAILED, PGWIRE_RESULT_FIELD.ERROR, undefined, buildPgwireServiceScopedError(PGWIRE_MODULE_ERROR.NOT_PREPARED, serviceId));
        }
      }
      if (stryMutAct_9fa48("148421") ? false : stryMutAct_9fa48("148420") ? true : (stryCov_9fa48("148420", "148421"), this._running.has(serviceId))) {
        if (stryMutAct_9fa48("148422")) {
          {}
        } else {
          stryCov_9fa48("148422");
          const state = this._running.get(serviceId);
          return stryMutAct_9fa48("148423") ? {} : (stryCov_9fa48("148423"), {
            status: START_STATUS.RUNNING,
            endpointIntent: state.endpointIntent
          });
        }
      }
      const prepared = this._prepared.get(serviceId);
      const overrides = stryMutAct_9fa48("148424") ? {} : (stryCov_9fa48("148424"), {
        host: replicaContext.host,
        port: replicaContext.port,
        maxSessions: replicaContext.maxSessions
      });
      const config = resolveConfig(prepared.definition, overrides);
      const server = net.createServer();
      const connections = new Set();
      server.on(PGWIRE_EVENT.CONNECTION, socket => {
        if (stryMutAct_9fa48("148425")) {
          {}
        } else {
          stryCov_9fa48("148425");
          if (stryMutAct_9fa48("148429") ? connections.size < config.maxSessions : stryMutAct_9fa48("148428") ? connections.size > config.maxSessions : stryMutAct_9fa48("148427") ? false : stryMutAct_9fa48("148426") ? true : (stryCov_9fa48("148426", "148427", "148428", "148429"), connections.size >= config.maxSessions)) {
            if (stryMutAct_9fa48("148430")) {
              {}
            } else {
              stryCov_9fa48("148430");
              socket.destroy();
              return;
            }
          }
          connections.add(socket);
          socket.on(PGWIRE_EVENT.CLOSE, stryMutAct_9fa48("148431") ? () => undefined : (stryCov_9fa48("148431"), () => connections.delete(socket)));
        }
      });
      const boundPort = await new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("148432")) {
          {}
        } else {
          stryCov_9fa48("148432");
          server.once(PGWIRE_EVENT.ERROR, stryMutAct_9fa48("148433") ? () => undefined : (stryCov_9fa48("148433"), err => reject(err)));
          server.listen(config.port, config.host, () => {
            if (stryMutAct_9fa48("148434")) {
              {}
            } else {
              stryCov_9fa48("148434");
              server.removeAllListeners(PGWIRE_EVENT.ERROR);
              const addr = server.address();
              resolve(addr.port);
            }
          });
        }
      }).catch(err => {
        if (stryMutAct_9fa48("148435")) {
          {}
        } else {
          stryCov_9fa48("148435");
          throw classifyBindError(err, config.port);
        }
      });
      const endpointIntent = stryMutAct_9fa48("148436") ? {} : (stryCov_9fa48("148436"), {
        host: config.host,
        port: boundPort,
        protocol: WASM_SERVICE_PROTOCOL.POSTGRESQL
      });
      this._running.set(serviceId, stryMutAct_9fa48("148437") ? {} : (stryCov_9fa48("148437"), {
        server,
        connections,
        config,
        endpointIntent,
        state: LISTENER_STATE.BOUND
      }));
      return stryMutAct_9fa48("148438") ? {} : (stryCov_9fa48("148438"), {
        status: START_STATUS.RUNNING,
        endpointIntent
      });
    }
  }

  /**
   * Close the TCP listener and all active connections.
   *
   * Deterministic cleanup: destroys all sockets, then closes
   * the server. Idempotent: stopping an already-stopped service
   * is a no-op.
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<void>}
   */
  async stop(replicaContext) {
    if (stryMutAct_9fa48("148439")) {
      {}
    } else {
      stryCov_9fa48("148439");
      if (stryMutAct_9fa48("148442") ? !replicaContext && typeof replicaContext !== TYPEOF.OBJECT : stryMutAct_9fa48("148441") ? false : stryMutAct_9fa48("148440") ? true : (stryCov_9fa48("148440", "148441", "148442"), (stryMutAct_9fa48("148443") ? replicaContext : (stryCov_9fa48("148443"), !replicaContext)) || (stryMutAct_9fa48("148445") ? typeof replicaContext === TYPEOF.OBJECT : stryMutAct_9fa48("148444") ? false : (stryCov_9fa48("148444", "148445"), typeof replicaContext !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("148446")) {
          {}
        } else {
          stryCov_9fa48("148446");
          return;
        }
      }
      const serviceId = stryMutAct_9fa48("148447") ? replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID] && replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID_LEGACY] : (stryCov_9fa48("148447"), replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID] ?? replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID_LEGACY]);
      if (stryMutAct_9fa48("148450") ? false : stryMutAct_9fa48("148449") ? true : stryMutAct_9fa48("148448") ? serviceId : (stryCov_9fa48("148448", "148449", "148450"), !serviceId)) {
        if (stryMutAct_9fa48("148451")) {
          {}
        } else {
          stryCov_9fa48("148451");
          return;
        }
      }
      const entry = this._running.get(serviceId);
      if (stryMutAct_9fa48("148454") ? false : stryMutAct_9fa48("148453") ? true : stryMutAct_9fa48("148452") ? entry : (stryCov_9fa48("148452", "148453", "148454"), !entry)) {
        if (stryMutAct_9fa48("148455")) {
          {}
        } else {
          stryCov_9fa48("148455");
          // Idempotent: not running, clean up prepared state
          this._prepared.delete(serviceId);
          return;
        }
      }

      // Destroy all active connections first
      for (const socket of entry.connections) {
        if (stryMutAct_9fa48("148456")) {
          {}
        } else {
          stryCov_9fa48("148456");
          socket.destroy();
        }
      }
      entry.connections.clear();

      // Close the TCP server
      await new Promise(resolve => {
        if (stryMutAct_9fa48("148457")) {
          {}
        } else {
          stryCov_9fa48("148457");
          entry.server.close(stryMutAct_9fa48("148458") ? () => undefined : (stryCov_9fa48("148458"), () => resolve()));
        }
      });
      entry.state = LISTENER_STATE.CLOSED;
      this._running.delete(serviceId);
      this._prepared.delete(serviceId);
    }
  }

  /**
   * Report listener bind and session health.
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<{status: string, detail?: string,
   *   sessions?: number, maxSessions?: number}>}
   */
  async health(replicaContext) {
    if (stryMutAct_9fa48("148459")) {
      {}
    } else {
      stryCov_9fa48("148459");
      let result;
      if (stryMutAct_9fa48("148462") ? !replicaContext && typeof replicaContext !== TYPEOF.OBJECT : stryMutAct_9fa48("148461") ? false : stryMutAct_9fa48("148460") ? true : (stryCov_9fa48("148460", "148461", "148462"), (stryMutAct_9fa48("148463") ? replicaContext : (stryCov_9fa48("148463"), !replicaContext)) || (stryMutAct_9fa48("148465") ? typeof replicaContext === TYPEOF.OBJECT : stryMutAct_9fa48("148464") ? false : (stryCov_9fa48("148464", "148465"), typeof replicaContext !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("148466")) {
          {}
        } else {
          stryCov_9fa48("148466");
          result = buildStatusResult(HEALTH_STATUS.UNKNOWN, PGWIRE_RESULT_FIELD.DETAIL, undefined, PGWIRE_MODULE_ERROR.REPLICA_CONTEXT_REQUIRED);
        }
      } else {
        if (stryMutAct_9fa48("148467")) {
          {}
        } else {
          stryCov_9fa48("148467");
          const serviceId = stryMutAct_9fa48("148468") ? replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID] && replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID_LEGACY] : (stryCov_9fa48("148468"), replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID] ?? replicaContext[PGWIRE_CONTEXT_FIELD.SERVICE_ID_LEGACY]);
          if (stryMutAct_9fa48("148471") ? false : stryMutAct_9fa48("148470") ? true : stryMutAct_9fa48("148469") ? serviceId : (stryCov_9fa48("148469", "148470", "148471"), !serviceId)) {
            if (stryMutAct_9fa48("148472")) {
              {}
            } else {
              stryCov_9fa48("148472");
              result = buildStatusResult(HEALTH_STATUS.UNKNOWN, PGWIRE_RESULT_FIELD.DETAIL, undefined, PGWIRE_MODULE_ERROR.SERVICE_ID_REQUIRED);
            }
          } else if (stryMutAct_9fa48("148475") ? false : stryMutAct_9fa48("148474") ? true : stryMutAct_9fa48("148473") ? this._running.has(serviceId) : (stryCov_9fa48("148473", "148474", "148475"), !this._running.has(serviceId))) {
            if (stryMutAct_9fa48("148476")) {
              {}
            } else {
              stryCov_9fa48("148476");
              result = buildStatusResult(HEALTH_STATUS.UNHEALTHY, PGWIRE_RESULT_FIELD.DETAIL, undefined, buildPgwireServiceScopedError(PGWIRE_MODULE_ERROR.NOT_STARTED, serviceId));
            }
          } else {
            if (stryMutAct_9fa48("148477")) {
              {}
            } else {
              stryCov_9fa48("148477");
              const entry = this._running.get(serviceId);
              if (stryMutAct_9fa48("148480") ? false : stryMutAct_9fa48("148479") ? true : stryMutAct_9fa48("148478") ? entry.server.listening : (stryCov_9fa48("148478", "148479", "148480"), !entry.server.listening)) {
                if (stryMutAct_9fa48("148481")) {
                  {}
                } else {
                  stryCov_9fa48("148481");
                  result = buildStatusResult(HEALTH_STATUS.UNHEALTHY, PGWIRE_RESULT_FIELD.DETAIL, undefined, PGWIRE_MODULE_ERROR.LISTENER_NOT_ACCEPTING);
                }
              } else {
                if (stryMutAct_9fa48("148482")) {
                  {}
                } else {
                  stryCov_9fa48("148482");
                  result = stryMutAct_9fa48("148483") ? {} : (stryCov_9fa48("148483"), {
                    status: HEALTH_STATUS.HEALTHY,
                    sessions: entry.connections.size,
                    maxSessions: entry.config.maxSessions
                  });
                }
              }
            }
          }
        }
      }
      return result;
    }
  }
}
export { PostgresWireRuntimeModule, PGWIRE_MODULE_ERROR, PGWIRE_DEFAULT, LISTENER_STATE, resolveConfig };