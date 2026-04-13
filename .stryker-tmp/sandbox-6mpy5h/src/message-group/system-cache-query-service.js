/**
 * System Cache Query Service - API for local services to query system information.
 * Routes queries to any local message group replica.
 * Requirements: 4.5, 4.8
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
import { EventEmitter } from 'events';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { ERRORS } from '../constants/index.js';

/**
 * Query types supported by the service.
 */
const QueryType = stryMutAct_9fa48("89802") ? {} : (stryCov_9fa48("89802"), {
  GET: stryMutAct_9fa48("89803") ? "" : (stryCov_9fa48("89803"), 'get'),
  FIND: stryMutAct_9fa48("89804") ? "" : (stryCov_9fa48("89804"), 'find'),
  FILTER: stryMutAct_9fa48("89805") ? "" : (stryCov_9fa48("89805"), 'filter'),
  GET_ALL: stryMutAct_9fa48("89806") ? "" : (stryCov_9fa48("89806"), 'getAll'),
  HAS: stryMutAct_9fa48("89807") ? "" : (stryCov_9fa48("89807"), 'has'),
  COUNT: stryMutAct_9fa48("89808") ? "" : (stryCov_9fa48("89808"), 'count')
});

/**
 * SystemCacheQueryService provides an API for local services to query
 * system information from message group caches.
 */
class SystemCacheQueryService extends EventEmitter {
  /**
   * Create a new SystemCacheQueryService.
   * @param {Object} options - Configuration options.
   * @param {Function} options.getLocalReplica - Function to get local message group replica.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("89809")) {
      {}
    } else {
      stryCov_9fa48("89809");
      super();
      this.getLocalReplica = stryMutAct_9fa48("89812") ? options.getLocalReplica && null : stryMutAct_9fa48("89811") ? false : stryMutAct_9fa48("89810") ? true : (stryCov_9fa48("89810", "89811", "89812"), options.getLocalReplica || null);
      this.messageGroupServices = stryMutAct_9fa48("89815") ? options.messageGroupServices && new Map() : stryMutAct_9fa48("89814") ? false : stryMutAct_9fa48("89813") ? true : (stryCov_9fa48("89813", "89814", "89815"), options.messageGroupServices || new Map());

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.queryTimeoutMs = stryMutAct_9fa48("89818") ? config.get(CONFIG_KEY.MESSAGE_GROUP_CACHE_TTL_MS) && 30000 : stryMutAct_9fa48("89817") ? false : stryMutAct_9fa48("89816") ? true : (stryCov_9fa48("89816", "89817", "89818"), config.get(CONFIG_KEY.MESSAGE_GROUP_CACHE_TTL_MS) || 30000);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(stryMutAct_9fa48("89819") ? "" : (stryCov_9fa48("89819"), 'cache-query')) : console;

      // Statistics
      this.queryCount = 0;
      this.cacheHits = 0;
      this.cacheMisses = 0;
    }
  }

  /**
   * Register a message group service for query routing.
   * @param {string} serviceId - Service ID.
   * @param {MessageGroupService} service - Message group service instance.
   */
  registerMessageGroup(serviceId, service) {
    if (stryMutAct_9fa48("89820")) {
      {}
    } else {
      stryCov_9fa48("89820");
      this.messageGroupServices.set(serviceId, service);
      this.logger.debug(stryMutAct_9fa48("89821") ? "" : (stryCov_9fa48("89821"), 'Registered message group for queries'), stryMutAct_9fa48("89822") ? {} : (stryCov_9fa48("89822"), {
        serviceId
      }));
    }
  }

  /**
   * Unregister a message group service.
   * @param {string} serviceId - Service ID.
   */
  unregisterMessageGroup(serviceId) {
    if (stryMutAct_9fa48("89823")) {
      {}
    } else {
      stryCov_9fa48("89823");
      this.messageGroupServices.delete(serviceId);
      this.logger.debug(stryMutAct_9fa48("89824") ? "" : (stryCov_9fa48("89824"), 'Unregistered message group from queries'), stryMutAct_9fa48("89825") ? {} : (stryCov_9fa48("89825"), {
        serviceId
      }));
    }
  }

  /**
   * Get a local message group replica for querying.
   * @return {MessageGroupService|null} Active message group service or null.
   * @private
   */
  getActiveReplica() {
    if (stryMutAct_9fa48("89826")) {
      {}
    } else {
      stryCov_9fa48("89826");
      // Use provided function if available
      if (stryMutAct_9fa48("89828") ? false : stryMutAct_9fa48("89827") ? true : (stryCov_9fa48("89827", "89828"), this.getLocalReplica)) {
        if (stryMutAct_9fa48("89829")) {
          {}
        } else {
          stryCov_9fa48("89829");
          return this.getLocalReplica();
        }
      }

      // Find first active replica
      for (const service of this.messageGroupServices.values()) {
        if (stryMutAct_9fa48("89830")) {
          {}
        } else {
          stryCov_9fa48("89830");
          if (stryMutAct_9fa48("89832") ? false : stryMutAct_9fa48("89831") ? true : (stryCov_9fa48("89831", "89832"), service.initialized)) {
            if (stryMutAct_9fa48("89833")) {
              {}
            } else {
              stryCov_9fa48("89833");
              return service;
            }
          }
        }
      }
      return null;
    }
  }

  /**
   * Query the system table cache.
   * Routes to any local message group replica.
   * @param {string} tableName - System table name.
   * @param {Object} query - Query parameters.
   * @return {Promise<*>} Query result.
   */
  async querySystemCache(tableName, query = {}) {
    if (stryMutAct_9fa48("89834")) {
      {}
    } else {
      stryCov_9fa48("89834");
      stryMutAct_9fa48("89835") ? this.queryCount-- : (stryCov_9fa48("89835"), this.queryCount++);
      const replica = this.getActiveReplica();
      if (stryMutAct_9fa48("89838") ? false : stryMutAct_9fa48("89837") ? true : stryMutAct_9fa48("89836") ? replica : (stryCov_9fa48("89836", "89837", "89838"), !replica)) {
        if (stryMutAct_9fa48("89839")) {
          {}
        } else {
          stryCov_9fa48("89839");
          stryMutAct_9fa48("89840") ? this.cacheMisses-- : (stryCov_9fa48("89840"), this.cacheMisses++);
          throw new Error(stryMutAct_9fa48("89841") ? "" : (stryCov_9fa48("89841"), 'No active local message group replica available'));
        }
      }
      this.logger.debug(stryMutAct_9fa48("89842") ? "" : (stryCov_9fa48("89842"), 'Routing query to message group'), stryMutAct_9fa48("89843") ? {} : (stryCov_9fa48("89843"), {
        tableName,
        queryType: this.getQueryType(query),
        replicaId: replica.replicaId
      }));
      try {
        if (stryMutAct_9fa48("89844")) {
          {}
        } else {
          stryCov_9fa48("89844");
          const result = await replica.querySystemCache(tableName, query);
          stryMutAct_9fa48("89845") ? this.cacheHits-- : (stryCov_9fa48("89845"), this.cacheHits++);
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("89846")) {
          {}
        } else {
          stryCov_9fa48("89846");
          stryMutAct_9fa48("89847") ? this.cacheMisses-- : (stryCov_9fa48("89847"), this.cacheMisses++);
          this.logger.error(ERRORS.QUERY_FAILED, stryMutAct_9fa48("89848") ? {} : (stryCov_9fa48("89848"), {
            tableName,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Get a single record by key.
   * @param {string} tableName - System table name.
   * @param {string} key - Record key.
   * @return {Promise<Object|undefined>} Record or undefined.
   */
  async get(tableName, key) {
    if (stryMutAct_9fa48("89849")) {
      {}
    } else {
      stryCov_9fa48("89849");
      return this.querySystemCache(tableName, stryMutAct_9fa48("89850") ? {} : (stryCov_9fa48("89850"), {
        key
      }));
    }
  }

  /**
   * Find the first record matching a predicate.
   * @param {string} tableName - System table name.
   * @param {Function} predicate - Predicate function.
   * @return {Promise<Object|undefined>} First matching record or undefined.
   */
  async find(tableName, predicate) {
    if (stryMutAct_9fa48("89851")) {
      {}
    } else {
      stryCov_9fa48("89851");
      return this.querySystemCache(tableName, stryMutAct_9fa48("89852") ? {} : (stryCov_9fa48("89852"), {
        predicate,
        findOne: stryMutAct_9fa48("89853") ? false : (stryCov_9fa48("89853"), true)
      }));
    }
  }

  /**
   * Filter records matching a predicate.
   * @param {string} tableName - System table name.
   * @param {Function} predicate - Predicate function.
   * @return {Promise<Array<Object>>} Matching records.
   */
  async filter(tableName, predicate) {
    if (stryMutAct_9fa48("89854")) {
      {}
    } else {
      stryCov_9fa48("89854");
      return this.querySystemCache(tableName, stryMutAct_9fa48("89855") ? {} : (stryCov_9fa48("89855"), {
        predicate
      }));
    }
  }

  /**
   * Get all records from a table.
   * @param {string} tableName - System table name.
   * @return {Promise<Array<Object>>} All records.
   */
  async getAll(tableName) {
    if (stryMutAct_9fa48("89856")) {
      {}
    } else {
      stryCov_9fa48("89856");
      return this.querySystemCache(tableName, {});
    }
  }

  /**
   * Check if a record exists.
   * @param {string} tableName - System table name.
   * @param {string} key - Record key.
   * @return {Promise<boolean>} True if exists.
   */
  async has(tableName, key) {
    if (stryMutAct_9fa48("89857")) {
      {}
    } else {
      stryCov_9fa48("89857");
      const record = await this.get(tableName, key);
      return stryMutAct_9fa48("89860") ? record === undefined : stryMutAct_9fa48("89859") ? false : stryMutAct_9fa48("89858") ? true : (stryCov_9fa48("89858", "89859", "89860"), record !== undefined);
    }
  }

  /**
   * Get the count of records in a table.
   * @param {string} tableName - System table name.
   * @return {Promise<number>} Record count.
   */
  async count(tableName) {
    if (stryMutAct_9fa48("89861")) {
      {}
    } else {
      stryCov_9fa48("89861");
      const records = await this.getAll(tableName);
      return records.length;
    }
  }

  /**
   * Get nodes from the cache.
   * @param {Object} filter - Optional filter criteria.
   * @return {Promise<Array<Object>>} Node records.
   */
  async getNodes(filter = {}) {
    if (stryMutAct_9fa48("89862")) {
      {}
    } else {
      stryCov_9fa48("89862");
      if (stryMutAct_9fa48("89864") ? false : stryMutAct_9fa48("89863") ? true : (stryCov_9fa48("89863", "89864"), filter.nodeId)) {
        if (stryMutAct_9fa48("89865")) {
          {}
        } else {
          stryCov_9fa48("89865");
          const node = await this.get(stryMutAct_9fa48("89866") ? "" : (stryCov_9fa48("89866"), 'nodes'), filter.nodeId);
          return node ? stryMutAct_9fa48("89867") ? [] : (stryCov_9fa48("89867"), [node]) : stryMutAct_9fa48("89868") ? ["Stryker was here"] : (stryCov_9fa48("89868"), []);
        }
      }
      if (stryMutAct_9fa48("89870") ? false : stryMutAct_9fa48("89869") ? true : (stryCov_9fa48("89869", "89870"), filter.status)) {
        if (stryMutAct_9fa48("89871")) {
          {}
        } else {
          stryCov_9fa48("89871");
          return stryMutAct_9fa48("89872") ? this : (stryCov_9fa48("89872"), this.filter(stryMutAct_9fa48("89873") ? "" : (stryCov_9fa48("89873"), 'nodes'), stryMutAct_9fa48("89874") ? () => undefined : (stryCov_9fa48("89874"), n => stryMutAct_9fa48("89877") ? n.status !== filter.status : stryMutAct_9fa48("89876") ? false : stryMutAct_9fa48("89875") ? true : (stryCov_9fa48("89875", "89876", "89877"), n.status === filter.status))));
        }
      }
      return this.getAll(stryMutAct_9fa48("89878") ? "" : (stryCov_9fa48("89878"), 'nodes'));
    }
  }

  /**
   * Get partitions from the cache.
   * @param {Object} filter - Optional filter criteria.
   * @return {Promise<Array<Object>>} Partition records.
   */
  async getPartitions(filter = {}) {
    if (stryMutAct_9fa48("89879")) {
      {}
    } else {
      stryCov_9fa48("89879");
      if (stryMutAct_9fa48("89881") ? false : stryMutAct_9fa48("89880") ? true : (stryCov_9fa48("89880", "89881"), filter.partitionId)) {
        if (stryMutAct_9fa48("89882")) {
          {}
        } else {
          stryCov_9fa48("89882");
          const partition = await this.get(stryMutAct_9fa48("89883") ? "" : (stryCov_9fa48("89883"), 'partitions'), filter.partitionId);
          return partition ? stryMutAct_9fa48("89884") ? [] : (stryCov_9fa48("89884"), [partition]) : stryMutAct_9fa48("89885") ? ["Stryker was here"] : (stryCov_9fa48("89885"), []);
        }
      }
      if (stryMutAct_9fa48("89887") ? false : stryMutAct_9fa48("89886") ? true : (stryCov_9fa48("89886", "89887"), filter.tableId)) {
        if (stryMutAct_9fa48("89888")) {
          {}
        } else {
          stryCov_9fa48("89888");
          return stryMutAct_9fa48("89889") ? this : (stryCov_9fa48("89889"), this.filter(stryMutAct_9fa48("89890") ? "" : (stryCov_9fa48("89890"), 'partitions'), stryMutAct_9fa48("89891") ? () => undefined : (stryCov_9fa48("89891"), p => stryMutAct_9fa48("89894") ? p.tableId !== filter.tableId : stryMutAct_9fa48("89893") ? false : stryMutAct_9fa48("89892") ? true : (stryCov_9fa48("89892", "89893", "89894"), p.tableId === filter.tableId))));
        }
      }
      return this.getAll(stryMutAct_9fa48("89895") ? "" : (stryCov_9fa48("89895"), 'partitions'));
    }
  }

  /**
   * Get tables from the cache.
   * @param {Object} filter - Optional filter criteria.
   * @return {Promise<Array<Object>>} Table records.
   */
  async getTables(filter = {}) {
    if (stryMutAct_9fa48("89896")) {
      {}
    } else {
      stryCov_9fa48("89896");
      if (stryMutAct_9fa48("89898") ? false : stryMutAct_9fa48("89897") ? true : (stryCov_9fa48("89897", "89898"), filter.tableId)) {
        if (stryMutAct_9fa48("89899")) {
          {}
        } else {
          stryCov_9fa48("89899");
          const table = await this.get(stryMutAct_9fa48("89900") ? "" : (stryCov_9fa48("89900"), 'tables'), filter.tableId);
          return table ? stryMutAct_9fa48("89901") ? [] : (stryCov_9fa48("89901"), [table]) : stryMutAct_9fa48("89902") ? ["Stryker was here"] : (stryCov_9fa48("89902"), []);
        }
      }
      if (stryMutAct_9fa48("89904") ? false : stryMutAct_9fa48("89903") ? true : (stryCov_9fa48("89903", "89904"), filter.tableName)) {
        if (stryMutAct_9fa48("89905")) {
          {}
        } else {
          stryCov_9fa48("89905");
          return stryMutAct_9fa48("89906") ? this : (stryCov_9fa48("89906"), this.filter(stryMutAct_9fa48("89907") ? "" : (stryCov_9fa48("89907"), 'tables'), stryMutAct_9fa48("89908") ? () => undefined : (stryCov_9fa48("89908"), t => stryMutAct_9fa48("89911") ? t.name !== filter.tableName : stryMutAct_9fa48("89910") ? false : stryMutAct_9fa48("89909") ? true : (stryCov_9fa48("89909", "89910", "89911"), t.name === filter.tableName))));
        }
      }
      return this.getAll(stryMutAct_9fa48("89912") ? "" : (stryCov_9fa48("89912"), 'tables'));
    }
  }

  /**
   * Get services from the cache.
   * @param {Object} filter - Optional filter criteria.
   * @return {Promise<Array<Object>>} Service records.
   */
  async getServices(filter = {}) {
    if (stryMutAct_9fa48("89913")) {
      {}
    } else {
      stryCov_9fa48("89913");
      if (stryMutAct_9fa48("89915") ? false : stryMutAct_9fa48("89914") ? true : (stryCov_9fa48("89914", "89915"), filter.serviceId)) {
        if (stryMutAct_9fa48("89916")) {
          {}
        } else {
          stryCov_9fa48("89916");
          const service = await this.get(stryMutAct_9fa48("89917") ? "" : (stryCov_9fa48("89917"), 'services'), filter.serviceId);
          return service ? stryMutAct_9fa48("89918") ? [] : (stryCov_9fa48("89918"), [service]) : stryMutAct_9fa48("89919") ? ["Stryker was here"] : (stryCov_9fa48("89919"), []);
        }
      }
      if (stryMutAct_9fa48("89921") ? false : stryMutAct_9fa48("89920") ? true : (stryCov_9fa48("89920", "89921"), filter.nodeId)) {
        if (stryMutAct_9fa48("89922")) {
          {}
        } else {
          stryCov_9fa48("89922");
          return stryMutAct_9fa48("89923") ? this : (stryCov_9fa48("89923"), this.filter(stryMutAct_9fa48("89924") ? "" : (stryCov_9fa48("89924"), 'services'), stryMutAct_9fa48("89925") ? () => undefined : (stryCov_9fa48("89925"), s => stryMutAct_9fa48("89928") ? s.nodeId !== filter.nodeId : stryMutAct_9fa48("89927") ? false : stryMutAct_9fa48("89926") ? true : (stryCov_9fa48("89926", "89927", "89928"), s.nodeId === filter.nodeId))));
        }
      }
      if (stryMutAct_9fa48("89930") ? false : stryMutAct_9fa48("89929") ? true : (stryCov_9fa48("89929", "89930"), filter.type)) {
        if (stryMutAct_9fa48("89931")) {
          {}
        } else {
          stryCov_9fa48("89931");
          return stryMutAct_9fa48("89932") ? this : (stryCov_9fa48("89932"), this.filter(stryMutAct_9fa48("89933") ? "" : (stryCov_9fa48("89933"), 'services'), stryMutAct_9fa48("89934") ? () => undefined : (stryCov_9fa48("89934"), s => stryMutAct_9fa48("89937") ? s.type !== filter.type : stryMutAct_9fa48("89936") ? false : stryMutAct_9fa48("89935") ? true : (stryCov_9fa48("89935", "89936", "89937"), s.type === filter.type))));
        }
      }
      return this.getAll(stryMutAct_9fa48("89938") ? "" : (stryCov_9fa48("89938"), 'services'));
    }
  }

  /**
   * Get message groups from the cache.
   * @param {Object} filter - Optional filter criteria.
   * @return {Promise<Array<Object>>} Message group records.
   */
  async getMessageGroups(filter = {}) {
    if (stryMutAct_9fa48("89939")) {
      {}
    } else {
      stryCov_9fa48("89939");
      if (stryMutAct_9fa48("89941") ? false : stryMutAct_9fa48("89940") ? true : (stryCov_9fa48("89940", "89941"), filter.groupId)) {
        if (stryMutAct_9fa48("89942")) {
          {}
        } else {
          stryCov_9fa48("89942");
          const group = await this.get(stryMutAct_9fa48("89943") ? "" : (stryCov_9fa48("89943"), 'message_groups'), filter.groupId);
          return group ? stryMutAct_9fa48("89944") ? [] : (stryCov_9fa48("89944"), [group]) : stryMutAct_9fa48("89945") ? ["Stryker was here"] : (stryCov_9fa48("89945"), []);
        }
      }
      return this.getAll(stryMutAct_9fa48("89946") ? "" : (stryCov_9fa48("89946"), 'message_groups'));
    }
  }

  /**
   * Get indices from the cache.
   * @param {Object} filter - Optional filter criteria.
   * @return {Promise<Array<Object>>} Index records.
   */
  async getIndices(filter = {}) {
    if (stryMutAct_9fa48("89947")) {
      {}
    } else {
      stryCov_9fa48("89947");
      if (stryMutAct_9fa48("89949") ? false : stryMutAct_9fa48("89948") ? true : (stryCov_9fa48("89948", "89949"), filter.indexId)) {
        if (stryMutAct_9fa48("89950")) {
          {}
        } else {
          stryCov_9fa48("89950");
          const index = await this.get(stryMutAct_9fa48("89951") ? "" : (stryCov_9fa48("89951"), 'indices'), filter.indexId);
          return index ? stryMutAct_9fa48("89952") ? [] : (stryCov_9fa48("89952"), [index]) : stryMutAct_9fa48("89953") ? ["Stryker was here"] : (stryCov_9fa48("89953"), []);
        }
      }
      if (stryMutAct_9fa48("89955") ? false : stryMutAct_9fa48("89954") ? true : (stryCov_9fa48("89954", "89955"), filter.tableId)) {
        if (stryMutAct_9fa48("89956")) {
          {}
        } else {
          stryCov_9fa48("89956");
          return stryMutAct_9fa48("89957") ? this : (stryCov_9fa48("89957"), this.filter(stryMutAct_9fa48("89958") ? "" : (stryCov_9fa48("89958"), 'indices'), stryMutAct_9fa48("89959") ? () => undefined : (stryCov_9fa48("89959"), i => stryMutAct_9fa48("89962") ? i.tableId !== filter.tableId : stryMutAct_9fa48("89961") ? false : stryMutAct_9fa48("89960") ? true : (stryCov_9fa48("89960", "89961", "89962"), i.tableId === filter.tableId))));
        }
      }
      return this.getAll(stryMutAct_9fa48("89963") ? "" : (stryCov_9fa48("89963"), 'indices'));
    }
  }

  /**
   * Determine query type from query parameters.
   * @param {Object} query - Query parameters.
   * @return {string} Query type.
   * @private
   */
  getQueryType(query) {
    if (stryMutAct_9fa48("89964")) {
      {}
    } else {
      stryCov_9fa48("89964");
      if (stryMutAct_9fa48("89966") ? false : stryMutAct_9fa48("89965") ? true : (stryCov_9fa48("89965", "89966"), query.key)) return QueryType.GET;
      if (stryMutAct_9fa48("89969") ? query.predicate || query.findOne : stryMutAct_9fa48("89968") ? false : stryMutAct_9fa48("89967") ? true : (stryCov_9fa48("89967", "89968", "89969"), query.predicate && query.findOne)) return QueryType.FIND;
      if (stryMutAct_9fa48("89971") ? false : stryMutAct_9fa48("89970") ? true : (stryCov_9fa48("89970", "89971"), query.predicate)) return QueryType.FILTER;
      return QueryType.GET_ALL;
    }
  }

  /**
   * Get query statistics.
   * @return {Object} Query statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("89972")) {
      {}
    } else {
      stryCov_9fa48("89972");
      return stryMutAct_9fa48("89973") ? {} : (stryCov_9fa48("89973"), {
        queryCount: this.queryCount,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        hitRate: (stryMutAct_9fa48("89977") ? this.queryCount <= 0 : stryMutAct_9fa48("89976") ? this.queryCount >= 0 : stryMutAct_9fa48("89975") ? false : stryMutAct_9fa48("89974") ? true : (stryCov_9fa48("89974", "89975", "89976", "89977"), this.queryCount > 0)) ? (stryMutAct_9fa48("89978") ? this.cacheHits / this.queryCount / 100 : (stryCov_9fa48("89978"), (stryMutAct_9fa48("89979") ? this.cacheHits * this.queryCount : (stryCov_9fa48("89979"), this.cacheHits / this.queryCount)) * 100)).toFixed(2) + (stryMutAct_9fa48("89980") ? "" : (stryCov_9fa48("89980"), '%')) : stryMutAct_9fa48("89981") ? "" : (stryCov_9fa48("89981"), '0%'),
        registeredReplicas: this.messageGroupServices.size
      });
    }
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    if (stryMutAct_9fa48("89982")) {
      {}
    } else {
      stryCov_9fa48("89982");
      this.queryCount = 0;
      this.cacheHits = 0;
      this.cacheMisses = 0;
    }
  }
}
export { SystemCacheQueryService, QueryType };