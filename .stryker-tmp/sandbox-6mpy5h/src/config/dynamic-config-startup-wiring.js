/**
 * Dynamic configuration startup wiring helpers.
 *
 * Creates one startup-owned hot-reload bridge for runtime config keys that
 * can be applied without restart.
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
import { TABLES, TYPEOF } from '../constants/index.js';
import { ConfigurationManager } from './configuration-manager.js';
import { LoggingService } from '../logging/logging-service.js';
import { CONFIG_KEY, CONFIG_SUBSYSTEM } from './config-constants.js';
import { DynamicConfigService } from './dynamic-config-service.js';
import { RaftAdaptiveTimingController } from './raft-adaptive-timing-controller.js';
const DYNAMIC_CONFIG_STARTUP_EVENT = Object.freeze(stryMutAct_9fa48("53797") ? {} : (stryCov_9fa48("53797"), {
  CDC_APPLIED: stryMutAct_9fa48("53798") ? "" : (stryCov_9fa48("53798"), 'cdcApplied')
}));
const DYNAMIC_CONFIG_STARTUP_LOG_MSG = Object.freeze(stryMutAct_9fa48("53799") ? {} : (stryCov_9fa48("53799"), {
  INITIAL_APPLY_FAILED: stryMutAct_9fa48("53800") ? "" : (stryCov_9fa48("53800"), 'Failed to apply initial dynamic config setting'),
  CDC_APPLY_FAILED: stryMutAct_9fa48("53801") ? "" : (stryCov_9fa48("53801"), 'Failed to apply dynamic config CDC update'),
  RAFT_TIMING_APPLY_FAILED: stryMutAct_9fa48("53802") ? "" : (stryCov_9fa48("53802"), 'Failed to apply runtime raft timing config'),
  ADAPTIVE_CONTROLLER_INIT_FAILED: stryMutAct_9fa48("53803") ? "" : (stryCov_9fa48("53803"), 'Failed to initialize raft adaptive timing controller'),
  ADAPTIVE_CONTROLLER_SHUTDOWN_FAILED: stryMutAct_9fa48("53804") ? "" : (stryCov_9fa48("53804"), 'Failed to shutdown raft adaptive timing controller')
}));
const DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS = 300;
const DYNAMIC_CONFIG_STARTUP_CONTROLLER_INIT_TIMEOUT_MS = 300;

/**
 * Resolve startup read timeout for initial dynamic-config hydration.
 * @param {Object} options
 * @return {number}
 */
function resolveInitialReadTimeoutMs(options = {}) {
  if (stryMutAct_9fa48("53805")) {
    {}
  } else {
    stryCov_9fa48("53805");
    const timeoutMs = Number(options.initialReadTimeoutMs);
    if (stryMutAct_9fa48("53808") ? Number.isFinite(timeoutMs) || timeoutMs > 0 : stryMutAct_9fa48("53807") ? false : stryMutAct_9fa48("53806") ? true : (stryCov_9fa48("53806", "53807", "53808"), Number.isFinite(timeoutMs) && (stryMutAct_9fa48("53811") ? timeoutMs <= 0 : stryMutAct_9fa48("53810") ? timeoutMs >= 0 : stryMutAct_9fa48("53809") ? true : (stryCov_9fa48("53809", "53810", "53811"), timeoutMs > 0)))) {
      if (stryMutAct_9fa48("53812")) {
        {}
      } else {
        stryCov_9fa48("53812");
        return Math.floor(timeoutMs);
      }
    }
    return DYNAMIC_CONFIG_STARTUP_INITIAL_READ_TIMEOUT_MS;
  }
}

/**
 * Resolve startup timeout for adaptive timing controller initialization.
 * @param {Object} options
 * @return {number}
 */
function resolveControllerInitTimeoutMs(options = {}) {
  if (stryMutAct_9fa48("53813")) {
    {}
  } else {
    stryCov_9fa48("53813");
    const timeoutMs = Number(options.controllerInitTimeoutMs);
    if (stryMutAct_9fa48("53816") ? Number.isFinite(timeoutMs) || timeoutMs > 0 : stryMutAct_9fa48("53815") ? false : stryMutAct_9fa48("53814") ? true : (stryCov_9fa48("53814", "53815", "53816"), Number.isFinite(timeoutMs) && (stryMutAct_9fa48("53819") ? timeoutMs <= 0 : stryMutAct_9fa48("53818") ? timeoutMs >= 0 : stryMutAct_9fa48("53817") ? true : (stryCov_9fa48("53817", "53818", "53819"), timeoutMs > 0)))) {
      if (stryMutAct_9fa48("53820")) {
        {}
      } else {
        stryCov_9fa48("53820");
        return Math.floor(timeoutMs);
      }
    }
    return DYNAMIC_CONFIG_STARTUP_CONTROLLER_INIT_TIMEOUT_MS;
  }
}

/**
 * Apply timeout to a promise.
 * @param {Promise<*>} promise
 * @param {number} timeoutMs
 * @param {string} errorMessage
 * @return {Promise<*>}
 */
function withTimeout(promise, timeoutMs, errorMessage) {
  if (stryMutAct_9fa48("53821")) {
    {}
  } else {
    stryCov_9fa48("53821");
    return new Promise((resolve, reject) => {
      if (stryMutAct_9fa48("53822")) {
        {}
      } else {
        stryCov_9fa48("53822");
        let settled = stryMutAct_9fa48("53823") ? true : (stryCov_9fa48("53823"), false);
        const timer = setTimeout(() => {
          if (stryMutAct_9fa48("53824")) {
            {}
          } else {
            stryCov_9fa48("53824");
            if (stryMutAct_9fa48("53826") ? false : stryMutAct_9fa48("53825") ? true : (stryCov_9fa48("53825", "53826"), settled)) {
              if (stryMutAct_9fa48("53827")) {
                {}
              } else {
                stryCov_9fa48("53827");
                return;
              }
            }
            settled = stryMutAct_9fa48("53828") ? false : (stryCov_9fa48("53828"), true);
            reject(new Error(errorMessage));
          }
        }, timeoutMs);
        if (stryMutAct_9fa48("53831") ? typeof timer.unref !== TYPEOF.FUNCTION : stryMutAct_9fa48("53830") ? false : stryMutAct_9fa48("53829") ? true : (stryCov_9fa48("53829", "53830", "53831"), typeof timer.unref === TYPEOF.FUNCTION)) {
          if (stryMutAct_9fa48("53832")) {
            {}
          } else {
            stryCov_9fa48("53832");
            timer.unref();
          }
        }
        Promise.resolve(promise).then(result => {
          if (stryMutAct_9fa48("53833")) {
            {}
          } else {
            stryCov_9fa48("53833");
            if (stryMutAct_9fa48("53835") ? false : stryMutAct_9fa48("53834") ? true : (stryCov_9fa48("53834", "53835"), settled)) {
              if (stryMutAct_9fa48("53836")) {
                {}
              } else {
                stryCov_9fa48("53836");
                return;
              }
            }
            settled = stryMutAct_9fa48("53837") ? false : (stryCov_9fa48("53837"), true);
            clearTimeout(timer);
            resolve(result);
          }
        }).catch(error => {
          if (stryMutAct_9fa48("53838")) {
            {}
          } else {
            stryCov_9fa48("53838");
            if (stryMutAct_9fa48("53840") ? false : stryMutAct_9fa48("53839") ? true : (stryCov_9fa48("53839", "53840"), settled)) {
              if (stryMutAct_9fa48("53841")) {
                {}
              } else {
                stryCov_9fa48("53841");
                return;
              }
            }
            settled = stryMutAct_9fa48("53842") ? false : (stryCov_9fa48("53842"), true);
            clearTimeout(timer);
            reject(error);
          }
        });
      }
    });
  }
}

/**
 * Read one dynamic-config key with bounded startup latency.
 * @param {Object} dynamicConfigService
 * @param {string} key
 * @param {number} timeoutMs
 * @return {Promise<*>}
 */
async function readStartupConfigValue(dynamicConfigService, key, timeoutMs) {
  if (stryMutAct_9fa48("53843")) {
    {}
  } else {
    stryCov_9fa48("53843");
    return withTimeout(dynamicConfigService.get(key), timeoutMs, (stryMutAct_9fa48("53844") ? "" : (stryCov_9fa48("53844"), 'Timed out reading startup dynamic config key ')) + key + (stryMutAct_9fa48("53845") ? "" : (stryCov_9fa48("53845"), ' after ')) + timeoutMs + (stryMutAct_9fa48("53846") ? "" : (stryCov_9fa48("53846"), 'ms')));
  }
}

/**
 * Normalize service collection to a flat array.
 * @param {Map<string, Object>|Array<Object>|Object|null} services
 * @return {Array<Object>}
 */
function normalizeServicesCollection(services) {
  if (stryMutAct_9fa48("53847")) {
    {}
  } else {
    stryCov_9fa48("53847");
    if (stryMutAct_9fa48("53850") ? false : stryMutAct_9fa48("53849") ? true : stryMutAct_9fa48("53848") ? services : (stryCov_9fa48("53848", "53849", "53850"), !services)) {
      if (stryMutAct_9fa48("53851")) {
        {}
      } else {
        stryCov_9fa48("53851");
        return stryMutAct_9fa48("53852") ? ["Stryker was here"] : (stryCov_9fa48("53852"), []);
      }
    }
    if (stryMutAct_9fa48("53854") ? false : stryMutAct_9fa48("53853") ? true : (stryCov_9fa48("53853", "53854"), Array.isArray(services))) {
      if (stryMutAct_9fa48("53855")) {
        {}
      } else {
        stryCov_9fa48("53855");
        return services;
      }
    }
    if (stryMutAct_9fa48("53858") ? typeof services.values !== TYPEOF.FUNCTION : stryMutAct_9fa48("53857") ? false : stryMutAct_9fa48("53856") ? true : (stryCov_9fa48("53856", "53857", "53858"), typeof services.values === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("53859")) {
        {}
      } else {
        stryCov_9fa48("53859");
        return Array.from(services.values());
      }
    }
    return stryMutAct_9fa48("53860") ? [] : (stryCov_9fa48("53860"), [services]);
  }
}
const DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD = Object.freeze(stryMutAct_9fa48("53861") ? {} : (stryCov_9fa48("53861"), {
  HEARTBEAT_INTERVAL_MS: stryMutAct_9fa48("53862") ? "" : (stryCov_9fa48("53862"), 'heartbeatIntervalMs'),
  ELECTION_TIMEOUT_MIN_MS: stryMutAct_9fa48("53863") ? "" : (stryCov_9fa48("53863"), 'electionTimeoutMinMs'),
  ELECTION_TIMEOUT_MAX_MS: stryMutAct_9fa48("53864") ? "" : (stryCov_9fa48("53864"), 'electionTimeoutMaxMs'),
  TICK_INTERVAL_MS: stryMutAct_9fa48("53865") ? "" : (stryCov_9fa48("53865"), 'tickIntervalMs')
}));
const DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEY_FIELD = Object.freeze(stryMutAct_9fa48("53866") ? {} : (stryCov_9fa48("53866"), {
  [CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS]: DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.HEARTBEAT_INTERVAL_MS,
  [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS]: DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MIN_MS,
  [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS]: DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MAX_MS,
  [CONFIG_KEY.RAFT_TICK_INTERVAL_MS]: DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.TICK_INTERVAL_MS
}));
const DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEYS = Object.freeze(Object.keys(DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEY_FIELD));

/**
 * Read raft timing values from configuration manager.
 * @param {ConfigurationManager} configManager
 * @return {Object}
 */
function getRaftTimingConfig(configManager) {
  if (stryMutAct_9fa48("53867")) {
    {}
  } else {
    stryCov_9fa48("53867");
    return stryMutAct_9fa48("53868") ? {} : (stryCov_9fa48("53868"), {
      [DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.HEARTBEAT_INTERVAL_MS]: configManager.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS),
      [DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MIN_MS]: configManager.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS),
      [DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MAX_MS]: configManager.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS),
      [DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.TICK_INTERVAL_MS]: configManager.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS)
    });
  }
}

/**
 * Check whether raft timing config values are valid.
 * @param {Object} raftTimingConfig
 * @return {boolean}
 */
function isValidRaftTimingConfig(raftTimingConfig) {
  if (stryMutAct_9fa48("53869")) {
    {}
  } else {
    stryCov_9fa48("53869");
    const heartbeatMs = raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.HEARTBEAT_INTERVAL_MS];
    const electionTimeoutMinMs = raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MIN_MS];
    const electionTimeoutMaxMs = raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MAX_MS];
    const tickIntervalMs = raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.TICK_INTERVAL_MS];
    return stryMutAct_9fa48("53872") ? Number.isFinite(heartbeatMs) && Number.isFinite(electionTimeoutMinMs) && Number.isFinite(electionTimeoutMaxMs) && Number.isFinite(tickIntervalMs) && tickIntervalMs > 0 || electionTimeoutMinMs <= electionTimeoutMaxMs : stryMutAct_9fa48("53871") ? false : stryMutAct_9fa48("53870") ? true : (stryCov_9fa48("53870", "53871", "53872"), (stryMutAct_9fa48("53874") ? Number.isFinite(heartbeatMs) && Number.isFinite(electionTimeoutMinMs) && Number.isFinite(electionTimeoutMaxMs) && Number.isFinite(tickIntervalMs) || tickIntervalMs > 0 : stryMutAct_9fa48("53873") ? true : (stryCov_9fa48("53873", "53874"), (stryMutAct_9fa48("53876") ? Number.isFinite(heartbeatMs) && Number.isFinite(electionTimeoutMinMs) && Number.isFinite(electionTimeoutMaxMs) || Number.isFinite(tickIntervalMs) : stryMutAct_9fa48("53875") ? true : (stryCov_9fa48("53875", "53876"), (stryMutAct_9fa48("53878") ? Number.isFinite(heartbeatMs) && Number.isFinite(electionTimeoutMinMs) || Number.isFinite(electionTimeoutMaxMs) : stryMutAct_9fa48("53877") ? true : (stryCov_9fa48("53877", "53878"), (stryMutAct_9fa48("53880") ? Number.isFinite(heartbeatMs) || Number.isFinite(electionTimeoutMinMs) : stryMutAct_9fa48("53879") ? true : (stryCov_9fa48("53879", "53880"), Number.isFinite(heartbeatMs) && Number.isFinite(electionTimeoutMinMs))) && Number.isFinite(electionTimeoutMaxMs))) && Number.isFinite(tickIntervalMs))) && (stryMutAct_9fa48("53883") ? tickIntervalMs <= 0 : stryMutAct_9fa48("53882") ? tickIntervalMs >= 0 : stryMutAct_9fa48("53881") ? true : (stryCov_9fa48("53881", "53882", "53883"), tickIntervalMs > 0)))) && (stryMutAct_9fa48("53886") ? electionTimeoutMinMs > electionTimeoutMaxMs : stryMutAct_9fa48("53885") ? electionTimeoutMinMs < electionTimeoutMaxMs : stryMutAct_9fa48("53884") ? true : (stryCov_9fa48("53884", "53885", "53886"), electionTimeoutMinMs <= electionTimeoutMaxMs)));
  }
}

/**
 * Write raft timing values to configuration manager for future replicas.
 * @param {ConfigurationManager} configManager
 * @param {Object} raftTimingConfig
 */
function writeRaftTimingConfig(configManager, raftTimingConfig) {
  if (stryMutAct_9fa48("53887")) {
    {}
  } else {
    stryCov_9fa48("53887");
    configManager.setByPath(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS, raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.HEARTBEAT_INTERVAL_MS]);
    configManager.setByPath(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS, raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MIN_MS]);
    configManager.setByPath(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS, raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.ELECTION_TIMEOUT_MAX_MS]);
    configManager.setByPath(CONFIG_KEY.RAFT_TICK_INTERVAL_MS, raftTimingConfig[DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_FIELD.TICK_INTERVAL_MS]);
  }
}

/**
 * Create startup-owned dynamic config runtime wiring.
 * @param {Object} [options]
 * @param {string} [options.nodeId]
 * @param {Object} [options.systemTableCache]
 * @param {Object} [options.sqlQueryEngine]
 * @param {Map<string, Object>|Array<Object>|Object} [options.messageGroupServices]
 * @param {Map<string, Object>|Array<Object>|Object} [options.partitionServices]
 * @param {Object|null} [options.runtimeOwner]
 * @param {number} [options.initialReadTimeoutMs]
 * @return {Promise<{
 *   dynamicConfigService: DynamicConfigService,
  *   shutdown: Function
 * }>}
 */
async function createDynamicConfigStartupWiring(options = {}) {
  if (stryMutAct_9fa48("53888")) {
    {}
  } else {
    stryCov_9fa48("53888");
    const loggingService = LoggingService.getInstance();
    const logger = loggingService.isInitialized() ? loggingService.forSubsystem(CONFIG_SUBSYSTEM.DYNAMIC_CONFIG) : console;
    const dynamicConfigService = new DynamicConfigService(stryMutAct_9fa48("53889") ? {} : (stryCov_9fa48("53889"), {
      nodeId: stryMutAct_9fa48("53892") ? options.nodeId && null : stryMutAct_9fa48("53891") ? false : stryMutAct_9fa48("53890") ? true : (stryCov_9fa48("53890", "53891", "53892"), options.nodeId || null),
      systemTableCache: stryMutAct_9fa48("53895") ? options.systemTableCache && null : stryMutAct_9fa48("53894") ? false : stryMutAct_9fa48("53893") ? true : (stryCov_9fa48("53893", "53894", "53895"), options.systemTableCache || null),
      sqlQueryEngine: stryMutAct_9fa48("53898") ? options.sqlQueryEngine && null : stryMutAct_9fa48("53897") ? false : stryMutAct_9fa48("53896") ? true : (stryCov_9fa48("53896", "53897", "53898"), options.sqlQueryEngine || null)
    }));
    await dynamicConfigService.initialize();
    const configManager = ConfigurationManager.getInstance();
    const raftServices = stryMutAct_9fa48("53899") ? [] : (stryCov_9fa48("53899"), [...normalizeServicesCollection(options.messageGroupServices), ...normalizeServicesCollection(options.partitionServices)]);
    const watcherUnsubscribers = stryMutAct_9fa48("53900") ? ["Stryker was here"] : (stryCov_9fa48("53900"), []);
    const initialReadTimeoutMs = resolveInitialReadTimeoutMs(options);
    const controllerInitTimeoutMs = resolveControllerInitTimeoutMs(options);
    const raftTimingConfig = getRaftTimingConfig(configManager);

    // Runtime timing updates are best-effort per live service:
    // - `true` return value means applied immediately.
    // - `false`/missing method means deferred (restart/new replica path only).
    // ConfigManager is always updated so future replicas see canonical values.
    const applyRaftTimingConfig = nextRaftTimingConfig => {
      if (stryMutAct_9fa48("53901")) {
        {}
      } else {
        stryCov_9fa48("53901");
        if (stryMutAct_9fa48("53904") ? false : stryMutAct_9fa48("53903") ? true : stryMutAct_9fa48("53902") ? isValidRaftTimingConfig(nextRaftTimingConfig) : (stryCov_9fa48("53902", "53903", "53904"), !isValidRaftTimingConfig(nextRaftTimingConfig))) {
          if (stryMutAct_9fa48("53905")) {
            {}
          } else {
            stryCov_9fa48("53905");
            return stryMutAct_9fa48("53906") ? {} : (stryCov_9fa48("53906"), {
              applied: stryMutAct_9fa48("53907") ? true : (stryCov_9fa48("53907"), false),
              runtimeAppliedCount: 0,
              deferredCount: raftServices.length
            });
          }
        }
        writeRaftTimingConfig(configManager, nextRaftTimingConfig);
        let runtimeAppliedCount = 0;
        let deferredCount = 0;
        for (const service of raftServices) {
          if (stryMutAct_9fa48("53908")) {
            {}
          } else {
            stryCov_9fa48("53908");
            if (stryMutAct_9fa48("53911") ? !service && typeof service.applyRaftTimingConfig !== TYPEOF.FUNCTION : stryMutAct_9fa48("53910") ? false : stryMutAct_9fa48("53909") ? true : (stryCov_9fa48("53909", "53910", "53911"), (stryMutAct_9fa48("53912") ? service : (stryCov_9fa48("53912"), !service)) || (stryMutAct_9fa48("53914") ? typeof service.applyRaftTimingConfig === TYPEOF.FUNCTION : stryMutAct_9fa48("53913") ? false : (stryCov_9fa48("53913", "53914"), typeof service.applyRaftTimingConfig !== TYPEOF.FUNCTION)))) {
              if (stryMutAct_9fa48("53915")) {
                {}
              } else {
                stryCov_9fa48("53915");
                stryMutAct_9fa48("53916") ? deferredCount -= 1 : (stryCov_9fa48("53916"), deferredCount += 1);
                continue;
              }
            }
            try {
              if (stryMutAct_9fa48("53917")) {
                {}
              } else {
                stryCov_9fa48("53917");
                const runtimeApplied = service.applyRaftTimingConfig(stryMutAct_9fa48("53918") ? {} : (stryCov_9fa48("53918"), {
                  ...nextRaftTimingConfig
                }));
                if (stryMutAct_9fa48("53920") ? false : stryMutAct_9fa48("53919") ? true : (stryCov_9fa48("53919", "53920"), runtimeApplied)) {
                  if (stryMutAct_9fa48("53921")) {
                    {}
                  } else {
                    stryCov_9fa48("53921");
                    stryMutAct_9fa48("53922") ? runtimeAppliedCount -= 1 : (stryCov_9fa48("53922"), runtimeAppliedCount += 1);
                  }
                } else {
                  if (stryMutAct_9fa48("53923")) {
                    {}
                  } else {
                    stryCov_9fa48("53923");
                    stryMutAct_9fa48("53924") ? deferredCount -= 1 : (stryCov_9fa48("53924"), deferredCount += 1);
                  }
                }
              }
            } catch (error) {
              if (stryMutAct_9fa48("53925")) {
                {}
              } else {
                stryCov_9fa48("53925");
                stryMutAct_9fa48("53926") ? deferredCount -= 1 : (stryCov_9fa48("53926"), deferredCount += 1);
                logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.RAFT_TIMING_APPLY_FAILED, stryMutAct_9fa48("53927") ? {} : (stryCov_9fa48("53927"), {
                  error: error.message
                }));
              }
            }
          }
        }
        return stryMutAct_9fa48("53928") ? {} : (stryCov_9fa48("53928"), {
          applied: stryMutAct_9fa48("53929") ? false : (stryCov_9fa48("53929"), true),
          runtimeAppliedCount,
          deferredCount
        });
      }
    };
    const loggingDynamicAppliers = stryMutAct_9fa48("53930") ? [] : (stryCov_9fa48("53930"), [stryMutAct_9fa48("53931") ? {} : (stryCov_9fa48("53931"), {
      key: CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS,
      apply: value => {
        if (stryMutAct_9fa48("53932")) {
          {}
        } else {
          stryCov_9fa48("53932");
          if (stryMutAct_9fa48("53935") ? typeof value === TYPEOF.BOOLEAN : stryMutAct_9fa48("53934") ? false : stryMutAct_9fa48("53933") ? true : (stryCov_9fa48("53933", "53934", "53935"), typeof value !== TYPEOF.BOOLEAN)) {
            if (stryMutAct_9fa48("53936")) {
              {}
            } else {
              stryCov_9fa48("53936");
              return;
            }
          }
          loggingService.setPersistMetricsLogs(value);
        }
      }
    }), stryMutAct_9fa48("53937") ? {} : (stryCov_9fa48("53937"), {
      key: CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS,
      apply: value => {
        if (stryMutAct_9fa48("53938")) {
          {}
        } else {
          stryCov_9fa48("53938");
          if (stryMutAct_9fa48("53941") ? !Number.isFinite(value) && value < 0 : stryMutAct_9fa48("53940") ? false : stryMutAct_9fa48("53939") ? true : (stryCov_9fa48("53939", "53940", "53941"), (stryMutAct_9fa48("53942") ? Number.isFinite(value) : (stryCov_9fa48("53942"), !Number.isFinite(value))) || (stryMutAct_9fa48("53945") ? value >= 0 : stryMutAct_9fa48("53944") ? value <= 0 : stryMutAct_9fa48("53943") ? false : (stryCov_9fa48("53943", "53944", "53945"), value < 0)))) {
            if (stryMutAct_9fa48("53946")) {
              {}
            } else {
              stryCov_9fa48("53946");
              return;
            }
          }
          loggingService.setMetricsDefaultResolutionMs(value);
        }
      }
    }), stryMutAct_9fa48("53947") ? {} : (stryCov_9fa48("53947"), {
      key: CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_TTL_MS,
      apply: value => {
        if (stryMutAct_9fa48("53948")) {
          {}
        } else {
          stryCov_9fa48("53948");
          if (stryMutAct_9fa48("53951") ? !Number.isFinite(value) && value < 1000 : stryMutAct_9fa48("53950") ? false : stryMutAct_9fa48("53949") ? true : (stryCov_9fa48("53949", "53950", "53951"), (stryMutAct_9fa48("53952") ? Number.isFinite(value) : (stryCov_9fa48("53952"), !Number.isFinite(value))) || (stryMutAct_9fa48("53955") ? value >= 1000 : stryMutAct_9fa48("53954") ? value <= 1000 : stryMutAct_9fa48("53953") ? false : (stryCov_9fa48("53953", "53954", "53955"), value < 1000)))) {
            if (stryMutAct_9fa48("53956")) {
              {}
            } else {
              stryCov_9fa48("53956");
              return;
            }
          }
          loggingService.setMetricsDetailedWindowTtlMs(value);
        }
      }
    }), stryMutAct_9fa48("53957") ? {} : (stryCov_9fa48("53957"), {
      key: CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_ENABLED,
      apply: value => {
        if (stryMutAct_9fa48("53958")) {
          {}
        } else {
          stryCov_9fa48("53958");
          if (stryMutAct_9fa48("53961") ? typeof value === TYPEOF.BOOLEAN : stryMutAct_9fa48("53960") ? false : stryMutAct_9fa48("53959") ? true : (stryCov_9fa48("53959", "53960", "53961"), typeof value !== TYPEOF.BOOLEAN)) {
            if (stryMutAct_9fa48("53962")) {
              {}
            } else {
              stryCov_9fa48("53962");
              return;
            }
          }
          loggingService.setMetricsDetailedWindowEnabled(value);
        }
      }
    })]);
    for (const entry of loggingDynamicAppliers) {
      if (stryMutAct_9fa48("53963")) {
        {}
      } else {
        stryCov_9fa48("53963");
        watcherUnsubscribers.push(dynamicConfigService.watch(entry.key, newValue => {
          if (stryMutAct_9fa48("53964")) {
            {}
          } else {
            stryCov_9fa48("53964");
            entry.apply(newValue);
          }
        }));
      }
    }
    for (const key of DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEYS) {
      if (stryMutAct_9fa48("53965")) {
        {}
      } else {
        stryCov_9fa48("53965");
        watcherUnsubscribers.push(dynamicConfigService.watch(key, newValue => {
          if (stryMutAct_9fa48("53966")) {
            {}
          } else {
            stryCov_9fa48("53966");
            if (stryMutAct_9fa48("53969") ? false : stryMutAct_9fa48("53968") ? true : stryMutAct_9fa48("53967") ? Number.isFinite(newValue) : (stryCov_9fa48("53967", "53968", "53969"), !Number.isFinite(newValue))) {
              if (stryMutAct_9fa48("53970")) {
                {}
              } else {
                stryCov_9fa48("53970");
                return;
              }
            }
            const field = DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEY_FIELD[key];
            if (stryMutAct_9fa48("53973") ? false : stryMutAct_9fa48("53972") ? true : stryMutAct_9fa48("53971") ? field : (stryCov_9fa48("53971", "53972", "53973"), !field)) {
              if (stryMutAct_9fa48("53974")) {
                {}
              } else {
                stryCov_9fa48("53974");
                return;
              }
            }
            raftTimingConfig[field] = newValue;
            applyRaftTimingConfig(raftTimingConfig);
          }
        }));
      }
    }
    const initialReadTasks = stryMutAct_9fa48("53975") ? ["Stryker was here"] : (stryCov_9fa48("53975"), []);
    for (const entry of loggingDynamicAppliers) {
      if (stryMutAct_9fa48("53976")) {
        {}
      } else {
        stryCov_9fa48("53976");
        initialReadTasks.push((async () => {
          if (stryMutAct_9fa48("53977")) {
            {}
          } else {
            stryCov_9fa48("53977");
            try {
              if (stryMutAct_9fa48("53978")) {
                {}
              } else {
                stryCov_9fa48("53978");
                const value = await readStartupConfigValue(dynamicConfigService, entry.key, initialReadTimeoutMs);
                entry.apply(value);
              }
            } catch (error) {
              if (stryMutAct_9fa48("53979")) {
                {}
              } else {
                stryCov_9fa48("53979");
                logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.INITIAL_APPLY_FAILED, stryMutAct_9fa48("53980") ? {} : (stryCov_9fa48("53980"), {
                  key: entry.key,
                  error: error.message
                }));
              }
            }
          }
        })());
      }
    }
    for (const key of DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEYS) {
      if (stryMutAct_9fa48("53981")) {
        {}
      } else {
        stryCov_9fa48("53981");
        initialReadTasks.push((async () => {
          if (stryMutAct_9fa48("53982")) {
            {}
          } else {
            stryCov_9fa48("53982");
            try {
              if (stryMutAct_9fa48("53983")) {
                {}
              } else {
                stryCov_9fa48("53983");
                const value = await readStartupConfigValue(dynamicConfigService, key, initialReadTimeoutMs);
                if (stryMutAct_9fa48("53986") ? false : stryMutAct_9fa48("53985") ? true : stryMutAct_9fa48("53984") ? Number.isFinite(value) : (stryCov_9fa48("53984", "53985", "53986"), !Number.isFinite(value))) {
                  if (stryMutAct_9fa48("53987")) {
                    {}
                  } else {
                    stryCov_9fa48("53987");
                    return;
                  }
                }
                const field = DYNAMIC_CONFIG_STARTUP_RAFT_TIMING_KEY_FIELD[key];
                if (stryMutAct_9fa48("53990") ? false : stryMutAct_9fa48("53989") ? true : stryMutAct_9fa48("53988") ? field : (stryCov_9fa48("53988", "53989", "53990"), !field)) {
                  if (stryMutAct_9fa48("53991")) {
                    {}
                  } else {
                    stryCov_9fa48("53991");
                    return;
                  }
                }
                raftTimingConfig[field] = value;
              }
            } catch (error) {
              if (stryMutAct_9fa48("53992")) {
                {}
              } else {
                stryCov_9fa48("53992");
                logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.INITIAL_APPLY_FAILED, stryMutAct_9fa48("53993") ? {} : (stryCov_9fa48("53993"), {
                  key,
                  error: error.message
                }));
              }
            }
          }
        })());
      }
    }
    await Promise.all(initialReadTasks);
    applyRaftTimingConfig(raftTimingConfig);
    let adaptiveTimingController = null;
    try {
      if (stryMutAct_9fa48("53994")) {
        {}
      } else {
        stryCov_9fa48("53994");
        adaptiveTimingController = new RaftAdaptiveTimingController(stryMutAct_9fa48("53995") ? {} : (stryCov_9fa48("53995"), {
          dynamicConfigService,
          nodeId: stryMutAct_9fa48("53998") ? options.nodeId && null : stryMutAct_9fa48("53997") ? false : stryMutAct_9fa48("53996") ? true : (stryCov_9fa48("53996", "53997", "53998"), options.nodeId || null),
          owner: stryMutAct_9fa48("54001") ? options.runtimeOwner && null : stryMutAct_9fa48("54000") ? false : stryMutAct_9fa48("53999") ? true : (stryCov_9fa48("53999", "54000", "54001"), options.runtimeOwner || null)
        }));
        await withTimeout(adaptiveTimingController.initialize(), controllerInitTimeoutMs, (stryMutAct_9fa48("54002") ? "" : (stryCov_9fa48("54002"), 'Timed out initializing adaptive timing controller after ')) + controllerInitTimeoutMs + (stryMutAct_9fa48("54003") ? "" : (stryCov_9fa48("54003"), 'ms')));
      }
    } catch (error) {
      if (stryMutAct_9fa48("54004")) {
        {}
      } else {
        stryCov_9fa48("54004");
        adaptiveTimingController = null;
        logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.ADAPTIVE_CONTROLLER_INIT_FAILED, stryMutAct_9fa48("54005") ? {} : (stryCov_9fa48("54005"), {
          error: error.message
        }));
      }
    }
    const subscribedServices = stryMutAct_9fa48("54006") ? ["Stryker was here"] : (stryCov_9fa48("54006"), []);
    const handleCdcApplied = cdcEvent => {
      if (stryMutAct_9fa48("54007")) {
        {}
      } else {
        stryCov_9fa48("54007");
        if (stryMutAct_9fa48("54010") ? !cdcEvent && cdcEvent.tableName !== TABLES.CONFIG : stryMutAct_9fa48("54009") ? false : stryMutAct_9fa48("54008") ? true : (stryCov_9fa48("54008", "54009", "54010"), (stryMutAct_9fa48("54011") ? cdcEvent : (stryCov_9fa48("54011"), !cdcEvent)) || (stryMutAct_9fa48("54013") ? cdcEvent.tableName === TABLES.CONFIG : stryMutAct_9fa48("54012") ? false : (stryCov_9fa48("54012", "54013"), cdcEvent.tableName !== TABLES.CONFIG)))) {
          if (stryMutAct_9fa48("54014")) {
            {}
          } else {
            stryCov_9fa48("54014");
            return;
          }
        }
        void dynamicConfigService.handleCDCEvent(cdcEvent).catch(error => {
          if (stryMutAct_9fa48("54015")) {
            {}
          } else {
            stryCov_9fa48("54015");
            logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.CDC_APPLY_FAILED, stryMutAct_9fa48("54016") ? {} : (stryCov_9fa48("54016"), {
              error: error.message
            }));
          }
        });
      }
    };
    for (const messageGroupService of normalizeServicesCollection(options.messageGroupServices)) {
      if (stryMutAct_9fa48("54017")) {
        {}
      } else {
        stryCov_9fa48("54017");
        if (stryMutAct_9fa48("54020") ? (!messageGroupService || typeof messageGroupService.on !== TYPEOF.FUNCTION) && typeof messageGroupService.removeListener !== TYPEOF.FUNCTION : stryMutAct_9fa48("54019") ? false : stryMutAct_9fa48("54018") ? true : (stryCov_9fa48("54018", "54019", "54020"), (stryMutAct_9fa48("54022") ? !messageGroupService && typeof messageGroupService.on !== TYPEOF.FUNCTION : stryMutAct_9fa48("54021") ? false : (stryCov_9fa48("54021", "54022"), (stryMutAct_9fa48("54023") ? messageGroupService : (stryCov_9fa48("54023"), !messageGroupService)) || (stryMutAct_9fa48("54025") ? typeof messageGroupService.on === TYPEOF.FUNCTION : stryMutAct_9fa48("54024") ? false : (stryCov_9fa48("54024", "54025"), typeof messageGroupService.on !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("54027") ? typeof messageGroupService.removeListener === TYPEOF.FUNCTION : stryMutAct_9fa48("54026") ? false : (stryCov_9fa48("54026", "54027"), typeof messageGroupService.removeListener !== TYPEOF.FUNCTION)))) {
          if (stryMutAct_9fa48("54028")) {
            {}
          } else {
            stryCov_9fa48("54028");
            continue;
          }
        }
        messageGroupService.on(DYNAMIC_CONFIG_STARTUP_EVENT.CDC_APPLIED, handleCdcApplied);
        subscribedServices.push(messageGroupService);
      }
    }
    return stryMutAct_9fa48("54029") ? {} : (stryCov_9fa48("54029"), {
      dynamicConfigService,
      shutdown: () => {
        if (stryMutAct_9fa48("54030")) {
          {}
        } else {
          stryCov_9fa48("54030");
          for (const messageGroupService of subscribedServices) {
            if (stryMutAct_9fa48("54031")) {
              {}
            } else {
              stryCov_9fa48("54031");
              messageGroupService.removeListener(DYNAMIC_CONFIG_STARTUP_EVENT.CDC_APPLIED, handleCdcApplied);
            }
          }
          for (const unsubscribe of watcherUnsubscribers) {
            if (stryMutAct_9fa48("54032")) {
              {}
            } else {
              stryCov_9fa48("54032");
              unsubscribe();
            }
          }
          if (stryMutAct_9fa48("54034") ? false : stryMutAct_9fa48("54033") ? true : (stryCov_9fa48("54033", "54034"), adaptiveTimingController)) {
            if (stryMutAct_9fa48("54035")) {
              {}
            } else {
              stryCov_9fa48("54035");
              try {
                if (stryMutAct_9fa48("54036")) {
                  {}
                } else {
                  stryCov_9fa48("54036");
                  adaptiveTimingController.shutdown();
                }
              } catch (error) {
                if (stryMutAct_9fa48("54037")) {
                  {}
                } else {
                  stryCov_9fa48("54037");
                  logger.warn(DYNAMIC_CONFIG_STARTUP_LOG_MSG.ADAPTIVE_CONTROLLER_SHUTDOWN_FAILED, stryMutAct_9fa48("54038") ? {} : (stryCov_9fa48("54038"), {
                    error: error.message
                  }));
                }
              }
            }
          }
        }
      }
    });
  }
}
export { createDynamicConfigStartupWiring };