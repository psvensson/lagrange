/**
 * QueryRouter handles routing queries to partition leaders.
 * Responsibilities:
 * - Finding service candidates for partitions
 * - Retry logic with exponential backoff
 * - Leader redirect following
 * - Timeout management
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * @interface
 * @constructor
 * @param {Object} options - Configuration options
 * @param {Object} options.systemCache - System table cache (REQUIRED)
 * @param {Object} options.messageRouter - Message router (REQUIRED)
 * @param {number} [options.timeoutMs] - Query timeout in milliseconds
 * @param {number} [options.retryAttempts] - Number of retry attempts
 * @param {number} [options.retryDelayMs] - Base delay between retries
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
import { LoggingService } from '../logging/logging-service.js';
import { assertCritical } from '../utils/assert.js';
import { generateCorrelationId } from '../utils/correlation.js';
import { COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES, NUM, TYPEOF } from '../constants/index.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { QUERY_CONFIG_KEY, QUERY_DEFAULTS, QUERY_RESPONSE_TYPE, QUERY_ROUTER_ERROR_MSG, QUERY_ROUTER_LOG_MSG, QUERY_SUBSYSTEM } from './query-constants.js';
import { ConfigurationManager } from '../config/configuration-manager.js';

/**
 * QueryRouter handles routing queries to partition leaders with retry logic,
 * leader redirect following, and timeout management.
 */
class QueryRouter {
  /**
   * Create a new QueryRouter instance.
   * @param {Object} options - Configuration options
   * @param {Object} options.systemCache - System table cache (REQUIRED)
   * @param {Object} options.messageRouter - Message router (REQUIRED)
   * @param {number} [options.timeoutMs] - Query timeout in milliseconds
   * @param {number} [options.retryAttempts] - Number of retry attempts
   * @param {number} [options.retryDelayMs] - Base delay between retries
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("118174")) {
      {}
    } else {
      stryCov_9fa48("118174");
      // Validate required dependencies (Requirements 3.1)
      this.systemCache = assertCritical(options.systemCache, QUERY_ROUTER_ERROR_MSG.SYSTEM_CACHE_REQUIRED);
      this.messageRouter = assertCritical(options.messageRouter, QUERY_ROUTER_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
      this.bootstrapTopologySnapshotOwner = stryMutAct_9fa48("118177") ? options.bootstrapTopologySnapshotOwner && null : stryMutAct_9fa48("118176") ? false : stryMutAct_9fa48("118175") ? true : (stryCov_9fa48("118175", "118176", "118177"), options.bootstrapTopologySnapshotOwner || null);

      // Configuration with defaults (Requirements 3.3, 3.5)
      const config = ConfigurationManager.getInstance();
      this.timeoutMs = stryMutAct_9fa48("118180") ? (options.timeoutMs || config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS)) && QUERY_DEFAULTS.QUERY_TIMEOUT_MS : stryMutAct_9fa48("118179") ? false : stryMutAct_9fa48("118178") ? true : (stryCov_9fa48("118178", "118179", "118180"), (stryMutAct_9fa48("118182") ? options.timeoutMs && config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS) : stryMutAct_9fa48("118181") ? false : (stryCov_9fa48("118181", "118182"), options.timeoutMs || config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS))) || QUERY_DEFAULTS.QUERY_TIMEOUT_MS);
      this.retryAttempts = stryMutAct_9fa48("118185") ? (options.retryAttempts || config.get(QUERY_CONFIG_KEY.LEADER_RETRY_ATTEMPTS)) && QUERY_DEFAULTS.LEADER_RETRY_ATTEMPTS : stryMutAct_9fa48("118184") ? false : stryMutAct_9fa48("118183") ? true : (stryCov_9fa48("118183", "118184", "118185"), (stryMutAct_9fa48("118187") ? options.retryAttempts && config.get(QUERY_CONFIG_KEY.LEADER_RETRY_ATTEMPTS) : stryMutAct_9fa48("118186") ? false : (stryCov_9fa48("118186", "118187"), options.retryAttempts || config.get(QUERY_CONFIG_KEY.LEADER_RETRY_ATTEMPTS))) || QUERY_DEFAULTS.LEADER_RETRY_ATTEMPTS);
      this.retryDelayMs = stryMutAct_9fa48("118190") ? (options.retryDelayMs || config.get(QUERY_CONFIG_KEY.LEADER_RETRY_DELAY_MS)) && QUERY_DEFAULTS.LEADER_RETRY_DELAY_MS : stryMutAct_9fa48("118189") ? false : stryMutAct_9fa48("118188") ? true : (stryCov_9fa48("118188", "118189", "118190"), (stryMutAct_9fa48("118192") ? options.retryDelayMs && config.get(QUERY_CONFIG_KEY.LEADER_RETRY_DELAY_MS) : stryMutAct_9fa48("118191") ? false : (stryCov_9fa48("118191", "118192"), options.retryDelayMs || config.get(QUERY_CONFIG_KEY.LEADER_RETRY_DELAY_MS))) || QUERY_DEFAULTS.LEADER_RETRY_DELAY_MS);

      // Initialize logger
      this.logger = this.initLogger();
    }
  }

  /**
   * Set optional bootstrap topology owner used for canonical leader metadata.
   * @param {Object|null} owner
   */
  setBootstrapTopologySnapshotOwner(owner) {
    if (stryMutAct_9fa48("118193")) {
      {}
    } else {
      stryCov_9fa48("118193");
      this.bootstrapTopologySnapshotOwner = stryMutAct_9fa48("118196") ? owner && null : stryMutAct_9fa48("118195") ? false : stryMutAct_9fa48("118194") ? true : (stryCov_9fa48("118194", "118195", "118196"), owner || null);
    }
  }

  /**
   * Initialize logger for the QueryRouter.
   * @return {Object} Logger instance
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("118197")) {
      {}
    } else {
      stryCov_9fa48("118197");
      const loggingService = LoggingService.getInstance();
      if (stryMutAct_9fa48("118199") ? false : stryMutAct_9fa48("118198") ? true : (stryCov_9fa48("118198", "118199"), loggingService.isInitialized())) {
        if (stryMutAct_9fa48("118200")) {
          {}
        } else {
          stryCov_9fa48("118200");
          return loggingService.forSubsystem(QUERY_SUBSYSTEM.QUERY_ROUTER);
        }
      }
      return console;
    }
  }

  /**
   * Route a message to a partition with retry logic and timeout management.
   * Requirements: 3.1, 3.3, 3.4, 3.5
   *
   * @param {string} partitionId - Target partition ID
   * @param {Object} message - Message to route
   * @param {Object} [options] - Routing options
   * @param {string} [options.correlationId] - Correlation ID for tracing
   * @param {boolean} [options.preferLeader] - Whether to prefer leader replicas
   * @return {Promise<Object>} Routing result with success status and response
   */
  async routeToPartition(partitionId, message, options = {}) {
    if (stryMutAct_9fa48("118201")) {
      {}
    } else {
      stryCov_9fa48("118201");
      const correlationId = stryMutAct_9fa48("118204") ? options.correlationId && generateCorrelationId() : stryMutAct_9fa48("118203") ? false : stryMutAct_9fa48("118202") ? true : (stryCov_9fa48("118202", "118203", "118204"), options.correlationId || generateCorrelationId());
      const preferLeader = stryMutAct_9fa48("118207") ? options.preferLeader === false : stryMutAct_9fa48("118206") ? false : stryMutAct_9fa48("118205") ? true : (stryCov_9fa48("118205", "118206", "118207"), options.preferLeader !== (stryMutAct_9fa48("118208") ? true : (stryCov_9fa48("118208"), false)));
      const preferSameLatencyGroup = stryMutAct_9fa48("118211") ? options.preferSameLatencyGroup !== true : stryMutAct_9fa48("118210") ? false : stryMutAct_9fa48("118209") ? true : (stryCov_9fa48("118209", "118210", "118211"), options.preferSameLatencyGroup === (stryMutAct_9fa48("118212") ? false : (stryCov_9fa48("118212"), true)));
      const localNodeId = stryMutAct_9fa48("118215") ? options.localNodeId && null : stryMutAct_9fa48("118214") ? false : stryMutAct_9fa48("118213") ? true : (stryCov_9fa48("118213", "118214", "118215"), options.localNodeId || null);
      const startTime = Date.now();
      this.logger.debug(QUERY_ROUTER_LOG_MSG.ROUTING_TO_PARTITION, stryMutAct_9fa48("118216") ? {} : (stryCov_9fa48("118216"), {
        partitionId,
        correlationId,
        preferLeader,
        preferSameLatencyGroup,
        localNodeId
      }));

      // Get initial candidates (Requirements 3.2)
      let candidates = this.findServiceCandidates(partitionId, preferLeader, stryMutAct_9fa48("118217") ? {} : (stryCov_9fa48("118217"), {
        preferSameLatencyGroup,
        localNodeId
      }));
      for (let attempt = NUM.ZERO; stryMutAct_9fa48("118220") ? attempt >= this.retryAttempts : stryMutAct_9fa48("118219") ? attempt <= this.retryAttempts : stryMutAct_9fa48("118218") ? false : (stryCov_9fa48("118218", "118219", "118220"), attempt < this.retryAttempts); stryMutAct_9fa48("118221") ? attempt-- : (stryCov_9fa48("118221"), attempt++)) {
        if (stryMutAct_9fa48("118222")) {
          {}
        } else {
          stryCov_9fa48("118222");
          // Check timeout (Requirements 3.5)
          const elapsed = stryMutAct_9fa48("118223") ? Date.now() + startTime : (stryCov_9fa48("118223"), Date.now() - startTime);
          if (stryMutAct_9fa48("118227") ? elapsed < this.timeoutMs : stryMutAct_9fa48("118226") ? elapsed > this.timeoutMs : stryMutAct_9fa48("118225") ? false : stryMutAct_9fa48("118224") ? true : (stryCov_9fa48("118224", "118225", "118226", "118227"), elapsed >= this.timeoutMs)) {
            if (stryMutAct_9fa48("118228")) {
              {}
            } else {
              stryCov_9fa48("118228");
              this.logger.warn(QUERY_ROUTER_LOG_MSG.TIMEOUT_EXCEEDED, stryMutAct_9fa48("118229") ? {} : (stryCov_9fa48("118229"), {
                partitionId,
                correlationId,
                elapsed,
                timeoutMs: this.timeoutMs
              }));
              throw new Error(QUERY_ROUTER_ERROR_MSG.routingTimeout(partitionId, this.timeoutMs));
            }
          }

          // Check if we have candidates
          if (stryMutAct_9fa48("118232") ? candidates.length !== NUM.ZERO : stryMutAct_9fa48("118231") ? false : stryMutAct_9fa48("118230") ? true : (stryCov_9fa48("118230", "118231", "118232"), candidates.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("118233")) {
              {}
            } else {
              stryCov_9fa48("118233");
              this.logger.warn(QUERY_ROUTER_LOG_MSG.NO_CANDIDATES, stryMutAct_9fa48("118234") ? {} : (stryCov_9fa48("118234"), {
                partitionId,
                correlationId,
                attempt
              }));

              // Refresh candidates on retry
              if (stryMutAct_9fa48("118238") ? attempt >= this.retryAttempts - NUM.ONE : stryMutAct_9fa48("118237") ? attempt <= this.retryAttempts - NUM.ONE : stryMutAct_9fa48("118236") ? false : stryMutAct_9fa48("118235") ? true : (stryCov_9fa48("118235", "118236", "118237", "118238"), attempt < (stryMutAct_9fa48("118239") ? this.retryAttempts + NUM.ONE : (stryCov_9fa48("118239"), this.retryAttempts - NUM.ONE)))) {
                if (stryMutAct_9fa48("118240")) {
                  {}
                } else {
                  stryCov_9fa48("118240");
                  await this.delay(this.calculateBackoffDelay(attempt));
                  candidates = this.findServiceCandidates(partitionId, preferLeader, stryMutAct_9fa48("118241") ? {} : (stryCov_9fa48("118241"), {
                    preferSameLatencyGroup,
                    localNodeId
                  }));
                  continue;
                }
              }
              throw new Error(QUERY_ROUTER_ERROR_MSG.noServiceCandidates(partitionId));
            }
          }

          // Try routing to candidates
          const result = await this.tryRoute(candidates, message, correlationId, partitionId);
          if (stryMutAct_9fa48("118243") ? false : stryMutAct_9fa48("118242") ? true : (stryCov_9fa48("118242", "118243"), result.success)) {
            if (stryMutAct_9fa48("118244")) {
              {}
            } else {
              stryCov_9fa48("118244");
              this.logger.debug(QUERY_ROUTER_LOG_MSG.ROUTE_SUCCESS, stryMutAct_9fa48("118245") ? {} : (stryCov_9fa48("118245"), {
                partitionId,
                correlationId,
                attempt
              }));
              return result;
            }
          }

          // Handle leader redirect (Requirements 3.4)
          if (stryMutAct_9fa48("118248") ? result.redirect || result.redirectAddress : stryMutAct_9fa48("118247") ? false : stryMutAct_9fa48("118246") ? true : (stryCov_9fa48("118246", "118247", "118248"), result.redirect && result.redirectAddress)) {
            if (stryMutAct_9fa48("118249")) {
              {}
            } else {
              stryCov_9fa48("118249");
              this.logger.debug(QUERY_ROUTER_LOG_MSG.FOLLOWING_REDIRECT, stryMutAct_9fa48("118250") ? {} : (stryCov_9fa48("118250"), {
                partitionId,
                correlationId,
                redirectAddress: result.redirectAddress
              }));

              // Add redirect target to front of candidates
              candidates = stryMutAct_9fa48("118251") ? [] : (stryCov_9fa48("118251"), [stryMutAct_9fa48("118252") ? {} : (stryCov_9fa48("118252"), {
                address: result.redirectAddress
              }), ...(stryMutAct_9fa48("118253") ? candidates : (stryCov_9fa48("118253"), candidates.filter(stryMutAct_9fa48("118254") ? () => undefined : (stryCov_9fa48("118254"), c => stryMutAct_9fa48("118257") ? c.address === result.redirectAddress : stryMutAct_9fa48("118256") ? false : stryMutAct_9fa48("118255") ? true : (stryCov_9fa48("118255", "118256", "118257"), c.address !== result.redirectAddress)))))]);
              continue;
            }
          }

          // Retry with backoff (Requirements 3.3)
          if (stryMutAct_9fa48("118261") ? attempt >= this.retryAttempts - NUM.ONE : stryMutAct_9fa48("118260") ? attempt <= this.retryAttempts - NUM.ONE : stryMutAct_9fa48("118259") ? false : stryMutAct_9fa48("118258") ? true : (stryCov_9fa48("118258", "118259", "118260", "118261"), attempt < (stryMutAct_9fa48("118262") ? this.retryAttempts + NUM.ONE : (stryCov_9fa48("118262"), this.retryAttempts - NUM.ONE)))) {
            if (stryMutAct_9fa48("118263")) {
              {}
            } else {
              stryCov_9fa48("118263");
              const backoffDelay = this.calculateBackoffDelay(attempt);
              this.logger.debug(QUERY_ROUTER_LOG_MSG.RETRY_ATTEMPT, stryMutAct_9fa48("118264") ? {} : (stryCov_9fa48("118264"), {
                partitionId,
                correlationId,
                attempt: stryMutAct_9fa48("118265") ? attempt - NUM.ONE : (stryCov_9fa48("118265"), attempt + NUM.ONE),
                backoffDelay
              }));
              await this.delay(backoffDelay);

              // Refresh candidates for next attempt
              candidates = this.findServiceCandidates(partitionId, preferLeader, stryMutAct_9fa48("118266") ? {} : (stryCov_9fa48("118266"), {
                preferSameLatencyGroup,
                localNodeId
              }));
            }
          }
        }
      }
      this.logger.error(QUERY_ROUTER_LOG_MSG.ROUTE_FAILED, stryMutAct_9fa48("118267") ? {} : (stryCov_9fa48("118267"), {
        partitionId,
        correlationId,
        attempts: this.retryAttempts
      }));
      throw new Error(QUERY_ROUTER_ERROR_MSG.routingFailed(partitionId, this.retryAttempts));
    }
  }

  /**
   * Find service candidates for a partition.
   * Returns candidates ordered by preference (leader first if preferLeader).
   * Requirements: 3.2
   *
   * @param {string} partitionId - Partition ID to find candidates for
   * @param {boolean} [preferLeader=true] - Whether to prefer leader replicas
   * @return {Array<Object>} Array of service candidates with address and metadata
   */
  findServiceCandidates(partitionId, preferLeader = stryMutAct_9fa48("118268") ? false : (stryCov_9fa48("118268"), true), options = {}) {
    if (stryMutAct_9fa48("118269")) {
      {}
    } else {
      stryCov_9fa48("118269");
      if (stryMutAct_9fa48("118272") ? !this.systemCache && typeof this.systemCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("118271") ? false : stryMutAct_9fa48("118270") ? true : (stryCov_9fa48("118270", "118271", "118272"), (stryMutAct_9fa48("118273") ? this.systemCache : (stryCov_9fa48("118273"), !this.systemCache)) || (stryMutAct_9fa48("118275") ? typeof this.systemCache.filter === TYPEOF.FUNCTION : stryMutAct_9fa48("118274") ? false : (stryCov_9fa48("118274", "118275"), typeof this.systemCache.filter !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("118276")) {
          {}
        } else {
          stryCov_9fa48("118276");
          return stryMutAct_9fa48("118277") ? ["Stryker was here"] : (stryCov_9fa48("118277"), []);
        }
      }

      // Query services table for partition services
      const services = stryMutAct_9fa48("118280") ? this.systemCache.filter(TABLES.SERVICES, s => s.partition_id === partitionId && s.service_type === SERVICE_TYPE.PARTITION && s.status === SERVICE_STATUS.ACTIVE) && [] : stryMutAct_9fa48("118279") ? false : stryMutAct_9fa48("118278") ? true : (stryCov_9fa48("118278", "118279", "118280"), (stryMutAct_9fa48("118281") ? this.systemCache : (stryCov_9fa48("118281"), this.systemCache.filter(TABLES.SERVICES, stryMutAct_9fa48("118282") ? () => undefined : (stryCov_9fa48("118282"), s => stryMutAct_9fa48("118285") ? s.partition_id === partitionId && s.service_type === SERVICE_TYPE.PARTITION || s.status === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("118284") ? false : stryMutAct_9fa48("118283") ? true : (stryCov_9fa48("118283", "118284", "118285"), (stryMutAct_9fa48("118287") ? s.partition_id === partitionId || s.service_type === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("118286") ? true : (stryCov_9fa48("118286", "118287"), (stryMutAct_9fa48("118289") ? s.partition_id !== partitionId : stryMutAct_9fa48("118288") ? true : (stryCov_9fa48("118288", "118289"), s.partition_id === partitionId)) && (stryMutAct_9fa48("118291") ? s.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("118290") ? true : (stryCov_9fa48("118290", "118291"), s.service_type === SERVICE_TYPE.PARTITION)))) && (stryMutAct_9fa48("118293") ? s.status !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("118292") ? true : (stryCov_9fa48("118292", "118293"), s.status === SERVICE_STATUS.ACTIVE))))))) || (stryMutAct_9fa48("118294") ? ["Stryker was here"] : (stryCov_9fa48("118294"), [])));
      if (stryMutAct_9fa48("118297") ? services.length !== NUM.ZERO : stryMutAct_9fa48("118296") ? false : stryMutAct_9fa48("118295") ? true : (stryCov_9fa48("118295", "118296", "118297"), services.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("118298")) {
          {}
        } else {
          stryCov_9fa48("118298");
          return stryMutAct_9fa48("118299") ? ["Stryker was here"] : (stryCov_9fa48("118299"), []);
        }
      }
      const localGroupId = this.resolveNodeLatencyGroupId(options.localNodeId);
      const preferSameLatencyGroup = stryMutAct_9fa48("118302") ? options.preferSameLatencyGroup !== true : stryMutAct_9fa48("118301") ? false : stryMutAct_9fa48("118300") ? true : (stryCov_9fa48("118300", "118301", "118302"), options.preferSameLatencyGroup === (stryMutAct_9fa48("118303") ? false : (stryCov_9fa48("118303"), true)));
      const orderedServices = this.orderServicesByLatencyPreference(services, localGroupId, preferSameLatencyGroup);
      const canonicalLeaderNodeId = this.resolveCanonicalPartitionLeaderNodeId(partitionId);
      const candidates = stryMutAct_9fa48("118304") ? ["Stryker was here"] : (stryCov_9fa48("118304"), []);
      const seen = new Set();

      /**
       * Add a service to candidates if not already seen.
       * @param {Object} service - Service to add
       */
      const addService = service => {
        if (stryMutAct_9fa48("118305")) {
          {}
        } else {
          stryCov_9fa48("118305");
          if (stryMutAct_9fa48("118308") ? !service && !service.address : stryMutAct_9fa48("118307") ? false : stryMutAct_9fa48("118306") ? true : (stryCov_9fa48("118306", "118307", "118308"), (stryMutAct_9fa48("118309") ? service : (stryCov_9fa48("118309"), !service)) || (stryMutAct_9fa48("118310") ? service.address : (stryCov_9fa48("118310"), !service.address)))) {
            if (stryMutAct_9fa48("118311")) {
              {}
            } else {
              stryCov_9fa48("118311");
              return;
            }
          }
          const key = stryMutAct_9fa48("118314") ? (service.service_id || service.replica_id) && service.address : stryMutAct_9fa48("118313") ? false : stryMutAct_9fa48("118312") ? true : (stryCov_9fa48("118312", "118313", "118314"), (stryMutAct_9fa48("118316") ? service.service_id && service.replica_id : stryMutAct_9fa48("118315") ? false : (stryCov_9fa48("118315", "118316"), service.service_id || service.replica_id)) || service.address);
          if (stryMutAct_9fa48("118318") ? false : stryMutAct_9fa48("118317") ? true : (stryCov_9fa48("118317", "118318"), seen.has(key))) {
            if (stryMutAct_9fa48("118319")) {
              {}
            } else {
              stryCov_9fa48("118319");
              return;
            }
          }
          seen.add(key);
          candidates.push(stryMutAct_9fa48("118320") ? {} : (stryCov_9fa48("118320"), {
            address: service.address,
            nodeId: service.node_id,
            replicaId: stryMutAct_9fa48("118323") ? service.service_id && service.replica_id : stryMutAct_9fa48("118322") ? false : stryMutAct_9fa48("118321") ? true : (stryCov_9fa48("118321", "118322", "118323"), service.service_id || service.replica_id),
            isLeader: stryMutAct_9fa48("118326") ? service.raft_role !== RAFT_ROLE.LEADER : stryMutAct_9fa48("118325") ? false : stryMutAct_9fa48("118324") ? true : (stryCov_9fa48("118324", "118325", "118326"), service.raft_role === RAFT_ROLE.LEADER)
          }));
        }
      };
      if (stryMutAct_9fa48("118328") ? false : stryMutAct_9fa48("118327") ? true : (stryCov_9fa48("118327", "118328"), preferLeader)) {
        if (stryMutAct_9fa48("118329")) {
          {}
        } else {
          stryCov_9fa48("118329");
          if (stryMutAct_9fa48("118332") ? typeof canonicalLeaderNodeId === TYPEOF.STRING || canonicalLeaderNodeId.length > NUM.ZERO : stryMutAct_9fa48("118331") ? false : stryMutAct_9fa48("118330") ? true : (stryCov_9fa48("118330", "118331", "118332"), (stryMutAct_9fa48("118334") ? typeof canonicalLeaderNodeId !== TYPEOF.STRING : stryMutAct_9fa48("118333") ? true : (stryCov_9fa48("118333", "118334"), typeof canonicalLeaderNodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("118337") ? canonicalLeaderNodeId.length <= NUM.ZERO : stryMutAct_9fa48("118336") ? canonicalLeaderNodeId.length >= NUM.ZERO : stryMutAct_9fa48("118335") ? true : (stryCov_9fa48("118335", "118336", "118337"), canonicalLeaderNodeId.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("118338")) {
              {}
            } else {
              stryCov_9fa48("118338");
              stryMutAct_9fa48("118339") ? orderedServices.forEach(addService) : (stryCov_9fa48("118339"), orderedServices.filter(stryMutAct_9fa48("118340") ? () => undefined : (stryCov_9fa48("118340"), service => stryMutAct_9fa48("118343") ? service?.node_id !== canonicalLeaderNodeId : stryMutAct_9fa48("118342") ? false : stryMutAct_9fa48("118341") ? true : (stryCov_9fa48("118341", "118342", "118343"), (stryMutAct_9fa48("118344") ? service.node_id : (stryCov_9fa48("118344"), service?.node_id)) === canonicalLeaderNodeId))).forEach(addService));
            }
          }
          // Add leaders first
          const leaders = stryMutAct_9fa48("118345") ? orderedServices : (stryCov_9fa48("118345"), orderedServices.filter(stryMutAct_9fa48("118346") ? () => undefined : (stryCov_9fa48("118346"), s => stryMutAct_9fa48("118349") ? s.raft_role !== RAFT_ROLE.LEADER : stryMutAct_9fa48("118348") ? false : stryMutAct_9fa48("118347") ? true : (stryCov_9fa48("118347", "118348", "118349"), s.raft_role === RAFT_ROLE.LEADER))));
          leaders.forEach(addService);
        }
      }

      // Add remaining services
      orderedServices.forEach(addService);
      return candidates;
    }
  }

  /**
   * Resolve node latency-group assignment from cache.
   * @param {string|null} nodeId - Node ID.
   * @return {string|null}
   * @private
   */
  resolveNodeLatencyGroupId(nodeId) {
    if (stryMutAct_9fa48("118350")) {
      {}
    } else {
      stryCov_9fa48("118350");
      if (stryMutAct_9fa48("118353") ? !nodeId && typeof this.systemCache?.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("118352") ? false : stryMutAct_9fa48("118351") ? true : (stryCov_9fa48("118351", "118352", "118353"), (stryMutAct_9fa48("118354") ? nodeId : (stryCov_9fa48("118354"), !nodeId)) || (stryMutAct_9fa48("118356") ? typeof this.systemCache?.get === TYPEOF.FUNCTION : stryMutAct_9fa48("118355") ? false : (stryCov_9fa48("118355", "118356"), typeof (stryMutAct_9fa48("118357") ? this.systemCache.get : (stryCov_9fa48("118357"), this.systemCache?.get)) !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("118358")) {
          {}
        } else {
          stryCov_9fa48("118358");
          return null;
        }
      }
      const nodeRow = this.systemCache.get(TABLES.NODES, nodeId);
      return stryMutAct_9fa48("118361") ? nodeRow?.[COLUMN.LATENCY_GROUP_ID] && null : stryMutAct_9fa48("118360") ? false : stryMutAct_9fa48("118359") ? true : (stryCov_9fa48("118359", "118360", "118361"), (stryMutAct_9fa48("118362") ? nodeRow[COLUMN.LATENCY_GROUP_ID] : (stryCov_9fa48("118362"), nodeRow?.[COLUMN.LATENCY_GROUP_ID])) || null);
    }
  }

  /**
   * Resolve canonical leader node metadata for one partition.
   * Prefer the owner-row leader_node_id when present and only fall back to
   * services.raft_role when the owner row has not converged yet.
   * @param {string} partitionId
   * @return {string|null}
   * @private
   */
  resolveCanonicalPartitionLeaderNodeId(partitionId) {
    if (stryMutAct_9fa48("118363")) {
      {}
    } else {
      stryCov_9fa48("118363");
      if (stryMutAct_9fa48("118366") ? typeof partitionId !== TYPEOF.STRING && partitionId.length === NUM.ZERO : stryMutAct_9fa48("118365") ? false : stryMutAct_9fa48("118364") ? true : (stryCov_9fa48("118364", "118365", "118366"), (stryMutAct_9fa48("118368") ? typeof partitionId === TYPEOF.STRING : stryMutAct_9fa48("118367") ? false : (stryCov_9fa48("118367", "118368"), typeof partitionId !== TYPEOF.STRING)) || (stryMutAct_9fa48("118370") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("118369") ? false : (stryCov_9fa48("118369", "118370"), partitionId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("118371")) {
          {}
        } else {
          stryCov_9fa48("118371");
          return null;
        }
      }
      if (stryMutAct_9fa48("118374") ? typeof this.bootstrapTopologySnapshotOwner?.resolveCanonicalPartitionLeaderNodeId !== 'function' : stryMutAct_9fa48("118373") ? false : stryMutAct_9fa48("118372") ? true : (stryCov_9fa48("118372", "118373", "118374"), typeof (stryMutAct_9fa48("118375") ? this.bootstrapTopologySnapshotOwner.resolveCanonicalPartitionLeaderNodeId : (stryCov_9fa48("118375"), this.bootstrapTopologySnapshotOwner?.resolveCanonicalPartitionLeaderNodeId)) === (stryMutAct_9fa48("118376") ? "" : (stryCov_9fa48("118376"), 'function')))) {
        if (stryMutAct_9fa48("118377")) {
          {}
        } else {
          stryCov_9fa48("118377");
          const ownerLeaderNodeId = this.bootstrapTopologySnapshotOwner.resolveCanonicalPartitionLeaderNodeId(partitionId);
          if (stryMutAct_9fa48("118380") ? typeof ownerLeaderNodeId === TYPEOF.STRING || ownerLeaderNodeId.length > NUM.ZERO : stryMutAct_9fa48("118379") ? false : stryMutAct_9fa48("118378") ? true : (stryCov_9fa48("118378", "118379", "118380"), (stryMutAct_9fa48("118382") ? typeof ownerLeaderNodeId !== TYPEOF.STRING : stryMutAct_9fa48("118381") ? true : (stryCov_9fa48("118381", "118382"), typeof ownerLeaderNodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("118385") ? ownerLeaderNodeId.length <= NUM.ZERO : stryMutAct_9fa48("118384") ? ownerLeaderNodeId.length >= NUM.ZERO : stryMutAct_9fa48("118383") ? true : (stryCov_9fa48("118383", "118384", "118385"), ownerLeaderNodeId.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("118386")) {
              {}
            } else {
              stryCov_9fa48("118386");
              return ownerLeaderNodeId;
            }
          }
        }
      }
      let partitionRow = null;
      if (stryMutAct_9fa48("118389") ? typeof this.systemCache?.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("118388") ? false : stryMutAct_9fa48("118387") ? true : (stryCov_9fa48("118387", "118388", "118389"), typeof (stryMutAct_9fa48("118390") ? this.systemCache.get : (stryCov_9fa48("118390"), this.systemCache?.get)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("118391")) {
          {}
        } else {
          stryCov_9fa48("118391");
          partitionRow = stryMutAct_9fa48("118394") ? this.systemCache.get(TABLES.PARTITIONS, partitionId) && null : stryMutAct_9fa48("118393") ? false : stryMutAct_9fa48("118392") ? true : (stryCov_9fa48("118392", "118393", "118394"), this.systemCache.get(TABLES.PARTITIONS, partitionId) || null);
        }
      }
      if (stryMutAct_9fa48("118397") ? !partitionRow || typeof this.systemCache?.filter === TYPEOF.FUNCTION : stryMutAct_9fa48("118396") ? false : stryMutAct_9fa48("118395") ? true : (stryCov_9fa48("118395", "118396", "118397"), (stryMutAct_9fa48("118398") ? partitionRow : (stryCov_9fa48("118398"), !partitionRow)) && (stryMutAct_9fa48("118400") ? typeof this.systemCache?.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("118399") ? true : (stryCov_9fa48("118399", "118400"), typeof (stryMutAct_9fa48("118401") ? this.systemCache.filter : (stryCov_9fa48("118401"), this.systemCache?.filter)) === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("118402")) {
          {}
        } else {
          stryCov_9fa48("118402");
          partitionRow = stryMutAct_9fa48("118405") ? (this.systemCache.filter(TABLES.PARTITIONS, partition => {
            return partition?.[COLUMN.PARTITION_ID] === partitionId;
          }) || [])[NUM.ZERO] && null : stryMutAct_9fa48("118404") ? false : stryMutAct_9fa48("118403") ? true : (stryCov_9fa48("118403", "118404", "118405"), (stryMutAct_9fa48("118408") ? this.systemCache.filter(TABLES.PARTITIONS, partition => {
            return partition?.[COLUMN.PARTITION_ID] === partitionId;
          }) && [] : stryMutAct_9fa48("118407") ? false : stryMutAct_9fa48("118406") ? true : (stryCov_9fa48("118406", "118407", "118408"), (stryMutAct_9fa48("118409") ? this.systemCache : (stryCov_9fa48("118409"), this.systemCache.filter(TABLES.PARTITIONS, partition => {
            if (stryMutAct_9fa48("118410")) {
              {}
            } else {
              stryCov_9fa48("118410");
              return stryMutAct_9fa48("118413") ? partition?.[COLUMN.PARTITION_ID] !== partitionId : stryMutAct_9fa48("118412") ? false : stryMutAct_9fa48("118411") ? true : (stryCov_9fa48("118411", "118412", "118413"), (stryMutAct_9fa48("118414") ? partition[COLUMN.PARTITION_ID] : (stryCov_9fa48("118414"), partition?.[COLUMN.PARTITION_ID])) === partitionId);
            }
          }))) || (stryMutAct_9fa48("118415") ? ["Stryker was here"] : (stryCov_9fa48("118415"), []))))[NUM.ZERO] || null);
        }
      }
      const leaderNodeId = stryMutAct_9fa48("118418") ? (partitionRow?.[COLUMN.LEADER_NODE_ID] || partitionRow?.leader_node_id || partitionRow?.leaderNodeId) && null : stryMutAct_9fa48("118417") ? false : stryMutAct_9fa48("118416") ? true : (stryCov_9fa48("118416", "118417", "118418"), (stryMutAct_9fa48("118420") ? (partitionRow?.[COLUMN.LEADER_NODE_ID] || partitionRow?.leader_node_id) && partitionRow?.leaderNodeId : stryMutAct_9fa48("118419") ? false : (stryCov_9fa48("118419", "118420"), (stryMutAct_9fa48("118422") ? partitionRow?.[COLUMN.LEADER_NODE_ID] && partitionRow?.leader_node_id : stryMutAct_9fa48("118421") ? false : (stryCov_9fa48("118421", "118422"), (stryMutAct_9fa48("118423") ? partitionRow[COLUMN.LEADER_NODE_ID] : (stryCov_9fa48("118423"), partitionRow?.[COLUMN.LEADER_NODE_ID])) || (stryMutAct_9fa48("118424") ? partitionRow.leader_node_id : (stryCov_9fa48("118424"), partitionRow?.leader_node_id)))) || (stryMutAct_9fa48("118425") ? partitionRow.leaderNodeId : (stryCov_9fa48("118425"), partitionRow?.leaderNodeId)))) || null);
      return (stryMutAct_9fa48("118428") ? typeof leaderNodeId === TYPEOF.STRING || leaderNodeId.length > NUM.ZERO : stryMutAct_9fa48("118427") ? false : stryMutAct_9fa48("118426") ? true : (stryCov_9fa48("118426", "118427", "118428"), (stryMutAct_9fa48("118430") ? typeof leaderNodeId !== TYPEOF.STRING : stryMutAct_9fa48("118429") ? true : (stryCov_9fa48("118429", "118430"), typeof leaderNodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("118433") ? leaderNodeId.length <= NUM.ZERO : stryMutAct_9fa48("118432") ? leaderNodeId.length >= NUM.ZERO : stryMutAct_9fa48("118431") ? true : (stryCov_9fa48("118431", "118432", "118433"), leaderNodeId.length > NUM.ZERO)))) ? leaderNodeId : null;
    }
  }

  /**
   * Order services to prefer same latency-group replicas when requested.
   * @param {Object[]} services - Partition service rows.
   * @param {string|null} localGroupId - Local latency group.
   * @param {boolean} preferSameLatencyGroup - Whether preference is enabled.
   * @return {Object[]}
   * @private
   */
  orderServicesByLatencyPreference(services, localGroupId, preferSameLatencyGroup) {
    if (stryMutAct_9fa48("118434")) {
      {}
    } else {
      stryCov_9fa48("118434");
      if (stryMutAct_9fa48("118437") ? (!preferSameLatencyGroup || !localGroupId) && typeof this.systemCache?.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("118436") ? false : stryMutAct_9fa48("118435") ? true : (stryCov_9fa48("118435", "118436", "118437"), (stryMutAct_9fa48("118439") ? !preferSameLatencyGroup && !localGroupId : stryMutAct_9fa48("118438") ? false : (stryCov_9fa48("118438", "118439"), (stryMutAct_9fa48("118440") ? preferSameLatencyGroup : (stryCov_9fa48("118440"), !preferSameLatencyGroup)) || (stryMutAct_9fa48("118441") ? localGroupId : (stryCov_9fa48("118441"), !localGroupId)))) || (stryMutAct_9fa48("118443") ? typeof this.systemCache?.get === TYPEOF.FUNCTION : stryMutAct_9fa48("118442") ? false : (stryCov_9fa48("118442", "118443"), typeof (stryMutAct_9fa48("118444") ? this.systemCache.get : (stryCov_9fa48("118444"), this.systemCache?.get)) !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("118445")) {
          {}
        } else {
          stryCov_9fa48("118445");
          return services;
        }
      }
      const nodeGroupById = new Map();
      return stryMutAct_9fa48("118446") ? [...services] : (stryCov_9fa48("118446"), (stryMutAct_9fa48("118447") ? [] : (stryCov_9fa48("118447"), [...services])).sort((left, right) => {
        if (stryMutAct_9fa48("118448")) {
          {}
        } else {
          stryCov_9fa48("118448");
          const leftNodeId = stryMutAct_9fa48("118449") ? left.node_id : (stryCov_9fa48("118449"), left?.node_id);
          const rightNodeId = stryMutAct_9fa48("118450") ? right.node_id : (stryCov_9fa48("118450"), right?.node_id);
          const leftGroupId = this.getNodeGroupFromCache(leftNodeId, nodeGroupById);
          const rightGroupId = this.getNodeGroupFromCache(rightNodeId, nodeGroupById);
          const leftPreferred = stryMutAct_9fa48("118453") ? leftGroupId !== localGroupId : stryMutAct_9fa48("118452") ? false : stryMutAct_9fa48("118451") ? true : (stryCov_9fa48("118451", "118452", "118453"), leftGroupId === localGroupId);
          const rightPreferred = stryMutAct_9fa48("118456") ? rightGroupId !== localGroupId : stryMutAct_9fa48("118455") ? false : stryMutAct_9fa48("118454") ? true : (stryCov_9fa48("118454", "118455", "118456"), rightGroupId === localGroupId);
          if (stryMutAct_9fa48("118459") ? leftPreferred || !rightPreferred : stryMutAct_9fa48("118458") ? false : stryMutAct_9fa48("118457") ? true : (stryCov_9fa48("118457", "118458", "118459"), leftPreferred && (stryMutAct_9fa48("118460") ? rightPreferred : (stryCov_9fa48("118460"), !rightPreferred)))) {
            if (stryMutAct_9fa48("118461")) {
              {}
            } else {
              stryCov_9fa48("118461");
              return NUM.NEGATIVE_ONE;
            }
          }
          if (stryMutAct_9fa48("118464") ? !leftPreferred || rightPreferred : stryMutAct_9fa48("118463") ? false : stryMutAct_9fa48("118462") ? true : (stryCov_9fa48("118462", "118463", "118464"), (stryMutAct_9fa48("118465") ? leftPreferred : (stryCov_9fa48("118465"), !leftPreferred)) && rightPreferred)) {
            if (stryMutAct_9fa48("118466")) {
              {}
            } else {
              stryCov_9fa48("118466");
              return NUM.ONE;
            }
          }
          return NUM.ZERO;
        }
      }));
    }
  }

  /**
   * Resolve and memoize node group assignments.
   * @param {string} nodeId - Node ID.
   * @param {Map<string, string|null>} nodeGroupById - Memoization map.
   * @return {string|null}
   * @private
   */
  getNodeGroupFromCache(nodeId, nodeGroupById) {
    if (stryMutAct_9fa48("118467")) {
      {}
    } else {
      stryCov_9fa48("118467");
      if (stryMutAct_9fa48("118470") ? false : stryMutAct_9fa48("118469") ? true : stryMutAct_9fa48("118468") ? nodeId : (stryCov_9fa48("118468", "118469", "118470"), !nodeId)) {
        if (stryMutAct_9fa48("118471")) {
          {}
        } else {
          stryCov_9fa48("118471");
          return null;
        }
      }
      if (stryMutAct_9fa48("118473") ? false : stryMutAct_9fa48("118472") ? true : (stryCov_9fa48("118472", "118473"), nodeGroupById.has(nodeId))) {
        if (stryMutAct_9fa48("118474")) {
          {}
        } else {
          stryCov_9fa48("118474");
          return nodeGroupById.get(nodeId);
        }
      }
      const nodeRow = this.systemCache.get(TABLES.NODES, nodeId);
      const groupId = stryMutAct_9fa48("118477") ? nodeRow?.[COLUMN.LATENCY_GROUP_ID] && null : stryMutAct_9fa48("118476") ? false : stryMutAct_9fa48("118475") ? true : (stryCov_9fa48("118475", "118476", "118477"), (stryMutAct_9fa48("118478") ? nodeRow[COLUMN.LATENCY_GROUP_ID] : (stryCov_9fa48("118478"), nodeRow?.[COLUMN.LATENCY_GROUP_ID])) || null);
      nodeGroupById.set(nodeId, groupId);
      return groupId;
    }
  }

  /**
   * Try to route a message to one of the candidates.
   * Returns on first successful delivery or after trying all candidates.
   *
   * @param {Array<Object>} candidates - Service candidates to try
   * @param {Object} message - Message to route
   * @param {string} correlationId - Correlation ID for tracing
   * @param {string} partitionId - Partition ID for logging
   * @return {Promise<Object>} Result with success, redirect, or error info
   * @private
   */
  async tryRoute(candidates, message, correlationId, partitionId) {
    if (stryMutAct_9fa48("118479")) {
      {}
    } else {
      stryCov_9fa48("118479");
      let lastError = null;
      for (const candidate of candidates) {
        if (stryMutAct_9fa48("118480")) {
          {}
        } else {
          stryCov_9fa48("118480");
          const {
            address
          } = candidate;
          const response = await this.messageRouter.deliver(address, stryMutAct_9fa48("118481") ? {} : (stryCov_9fa48("118481"), {
            ...message,
            correlationId
          }));

          // Check for successful response
          if (stryMutAct_9fa48("118484") ? response.acknowledged || response.success : stryMutAct_9fa48("118483") ? false : stryMutAct_9fa48("118482") ? true : (stryCov_9fa48("118482", "118483", "118484"), response.acknowledged && response.success)) {
            if (stryMutAct_9fa48("118485")) {
              {}
            } else {
              stryCov_9fa48("118485");
              return stryMutAct_9fa48("118486") ? {} : (stryCov_9fa48("118486"), {
                success: stryMutAct_9fa48("118487") ? false : (stryCov_9fa48("118487"), true),
                response,
                correlationId,
                address
              });
            }
          }

          // Check for leader redirect (Requirements 3.4)
          if (stryMutAct_9fa48("118490") ? response.redirect === QUERY_RESPONSE_TYPE.LEADER_REDIRECT || response.leaderAddress : stryMutAct_9fa48("118489") ? false : stryMutAct_9fa48("118488") ? true : (stryCov_9fa48("118488", "118489", "118490"), (stryMutAct_9fa48("118492") ? response.redirect !== QUERY_RESPONSE_TYPE.LEADER_REDIRECT : stryMutAct_9fa48("118491") ? true : (stryCov_9fa48("118491", "118492"), response.redirect === QUERY_RESPONSE_TYPE.LEADER_REDIRECT)) && response.leaderAddress)) {
            if (stryMutAct_9fa48("118493")) {
              {}
            } else {
              stryCov_9fa48("118493");
              return stryMutAct_9fa48("118494") ? {} : (stryCov_9fa48("118494"), {
                success: stryMutAct_9fa48("118495") ? true : (stryCov_9fa48("118495"), false),
                redirect: stryMutAct_9fa48("118496") ? false : (stryCov_9fa48("118496"), true),
                redirectAddress: response.leaderAddress,
                correlationId
              });
            }
          }

          // Track error for reporting
          lastError = stryMutAct_9fa48("118499") ? response.error && 'Unknown routing error' : stryMutAct_9fa48("118498") ? false : stryMutAct_9fa48("118497") ? true : (stryCov_9fa48("118497", "118498", "118499"), response.error || (stryMutAct_9fa48("118500") ? "" : (stryCov_9fa48("118500"), 'Unknown routing error')));
        }
      }
      return stryMutAct_9fa48("118501") ? {} : (stryCov_9fa48("118501"), {
        success: stryMutAct_9fa48("118502") ? true : (stryCov_9fa48("118502"), false),
        error: lastError,
        correlationId,
        partitionId
      });
    }
  }

  /**
   * Calculate exponential backoff delay for retry attempts.
   * Requirements: 3.3
   *
   * @param {number} attempt - Current attempt number (0-indexed)
   * @return {number} Delay in milliseconds
   * @private
   */
  calculateBackoffDelay(attempt) {
    if (stryMutAct_9fa48("118503")) {
      {}
    } else {
      stryCov_9fa48("118503");
      // Exponential backoff: baseDelay * 2^attempt
      return stryMutAct_9fa48("118504") ? this.retryDelayMs / Math.pow(NUM.TWO, attempt) : (stryCov_9fa48("118504"), this.retryDelayMs * Math.pow(NUM.TWO, attempt));
    }
  }

  /**
   * Delay helper for retry backoff.
   * @param {number} ms - Delay duration in milliseconds
   * @return {Promise<void>}
   * @private
   */
  delay(ms) {
    if (stryMutAct_9fa48("118505")) {
      {}
    } else {
      stryCov_9fa48("118505");
      return new Promise(stryMutAct_9fa48("118506") ? () => undefined : (stryCov_9fa48("118506"), resolve => setTimeout(resolve, ms)));
    }
  }
}
export { QueryRouter };