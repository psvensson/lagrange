/**
 * Live Query Manager - Manages live query subscriptions and query grouping.
 * Handles CDC subscriptions, client grouping, and lifecycle management.
 * Requirements: 33.4, 33.5, 33.6, 33.7, 33.8, 33.9, 33.10, 33.11, 33.12,
 *               33.13, 33.14, 33.15, 33.18, 33.19, 33.20
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
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { TABLES } from '../constants/index.js';
import { LIVE_QUERY_AST_TYPE, LIVE_QUERY_CONFIG_KEY, LIVE_QUERY_CURSOR, LIVE_QUERY_DEFAULTS, LIVE_QUERY_DEFAULT_VALUE, LIVE_QUERY_EMIT, LIVE_QUERY_ERROR_MSG, LIVE_QUERY_EVENT, LIVE_QUERY_LOG_MSG, LIVE_QUERY_OPERATION, LIVE_QUERY_SQL, LIVE_QUERY_SUBSYSTEM, TYPEOF } from './live-query-constants.js';
import { compilePredicate, canonicalizePredicate, extractPartitionKeyValue } from './live-query-service.js';
const DEFAULT_PARTITION_VERSION = 1;
const ACTIVE_PARTITION_STATE = stryMutAct_9fa48("81832") ? "" : (stryCov_9fa48("81832"), 'NORMAL');

/**
 * QueryGroup manages clients with identical queries sharing CDC subscriptions.
 */
class QueryGroup extends EventEmitter {
  /**
   * Create a new QueryGroup.
   * @param {Object} options - Configuration options.
   * @param {Object} options.parsedQuery - Parsed SELECT query AST.
   * @param {Object} options.systemCache - System table cache.
   * @param {string} options.nodeId - Node ID.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("81833")) {
      {}
    } else {
      stryCov_9fa48("81833");
      super();
      this.queryId = uuidv4();
      this.parsedQuery = stryMutAct_9fa48("81836") ? options.parsedQuery && null : stryMutAct_9fa48("81835") ? false : stryMutAct_9fa48("81834") ? true : (stryCov_9fa48("81834", "81835", "81836"), options.parsedQuery || null);
      this.systemCache = stryMutAct_9fa48("81839") ? options.systemCache && null : stryMutAct_9fa48("81838") ? false : stryMutAct_9fa48("81837") ? true : (stryCov_9fa48("81837", "81838", "81839"), options.systemCache || null);
      this.nodeId = stryMutAct_9fa48("81842") ? options.nodeId && LIVE_QUERY_DEFAULT_VALUE.UNKNOWN : stryMutAct_9fa48("81841") ? false : stryMutAct_9fa48("81840") ? true : (stryCov_9fa48("81840", "81841", "81842"), options.nodeId || LIVE_QUERY_DEFAULT_VALUE.UNKNOWN);

      // Extract table name
      this.table = stryMutAct_9fa48("81845") ? this.parsedQuery?.from?.name && null : stryMutAct_9fa48("81844") ? false : stryMutAct_9fa48("81843") ? true : (stryCov_9fa48("81843", "81844", "81845"), (stryMutAct_9fa48("81847") ? this.parsedQuery.from?.name : stryMutAct_9fa48("81846") ? this.parsedQuery?.from.name : (stryCov_9fa48("81846", "81847"), this.parsedQuery?.from?.name)) || null);

      // Compile predicate
      this.predicate = compilePredicate(stryMutAct_9fa48("81848") ? this.parsedQuery.where : (stryCov_9fa48("81848"), this.parsedQuery?.where));
      this.whereClause = stryMutAct_9fa48("81851") ? this.parsedQuery?.where && null : stryMutAct_9fa48("81850") ? false : stryMutAct_9fa48("81849") ? true : (stryCov_9fa48("81849", "81850", "81851"), (stryMutAct_9fa48("81852") ? this.parsedQuery.where : (stryCov_9fa48("81852"), this.parsedQuery?.where)) || null);

      // Clients in this group: clientId -> ClientSubscription
      this.clients = new Map();

      // Subscribed partitions
      this.subscribedPartitions = new Set();

      // CDC subscription handlers
      this.cdcHandlers = new Map();

      // Configuration
      this.config = ConfigurationManager.getInstance();
      this.ttlMs = stryMutAct_9fa48("81855") ? this.config.get(LIVE_QUERY_CONFIG_KEY.DEFAULT_TTL_MS) && LIVE_QUERY_DEFAULTS.DEFAULT_TTL_MS : stryMutAct_9fa48("81854") ? false : stryMutAct_9fa48("81853") ? true : (stryCov_9fa48("81853", "81854", "81855"), this.config.get(LIVE_QUERY_CONFIG_KEY.DEFAULT_TTL_MS) || LIVE_QUERY_DEFAULTS.DEFAULT_TTL_MS);

      // Partition key info
      this.partitionKeyColumn = null;
      this.partitionKeyValue = null;

      // Status
      this.active = stryMutAct_9fa48("81856") ? true : (stryCov_9fa48("81856"), false);
      this.createdAt = Date.now();
      this.lastActivityAt = Date.now();

      // Logging
      this.logger = this.initLogger();
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("81857")) {
      {}
    } else {
      stryCov_9fa48("81857");
      try {
        if (stryMutAct_9fa48("81858")) {
          {}
        } else {
          stryCov_9fa48("81858");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("81860") ? false : stryMutAct_9fa48("81859") ? true : (stryCov_9fa48("81859", "81860"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("81861")) {
              {}
            } else {
              stryCov_9fa48("81861");
              return loggingService.forSubsystem(LIVE_QUERY_SUBSYSTEM.QUERY_GROUP);
            }
          }
        }
      } catch {
        // Logging not available
      }
      return console;
    }
  }

  /**
   * Add a client to this group.
   * @param {Object} client - Client connection.
   * @return {Object} Client subscription info.
   */
  addClient(client) {
    if (stryMutAct_9fa48("81862")) {
      {}
    } else {
      stryCov_9fa48("81862");
      const clientId = stryMutAct_9fa48("81865") ? client.id && uuidv4() : stryMutAct_9fa48("81864") ? false : stryMutAct_9fa48("81863") ? true : (stryCov_9fa48("81863", "81864", "81865"), client.id || uuidv4());
      const subscription = stryMutAct_9fa48("81866") ? {} : (stryCov_9fa48("81866"), {
        client,
        clientId,
        lastRenewal: Date.now(),
        lastSeenHLC: null,
        ttlMs: this.ttlMs
      });
      this.clients.set(clientId, subscription);
      this.lastActivityAt = Date.now();
      this.logger.info(LIVE_QUERY_LOG_MSG.CLIENT_JOINED, stryMutAct_9fa48("81867") ? {} : (stryCov_9fa48("81867"), {
        queryId: this.queryId,
        clientId,
        clientCount: this.clients.size
      }));
      return subscription;
    }
  }

  /**
   * Remove a client from this group.
   * @param {string} clientId - Client ID.
   * @return {boolean} True if group should be removed (no clients left).
   */
  removeClient(clientId) {
    if (stryMutAct_9fa48("81868")) {
      {}
    } else {
      stryCov_9fa48("81868");
      this.clients.delete(clientId);
      this.lastActivityAt = Date.now();
      this.logger.info(LIVE_QUERY_LOG_MSG.CLIENT_LEFT, stryMutAct_9fa48("81869") ? {} : (stryCov_9fa48("81869"), {
        queryId: this.queryId,
        clientId,
        clientCount: this.clients.size
      }));
      return stryMutAct_9fa48("81872") ? this.clients.size !== 0 : stryMutAct_9fa48("81871") ? false : stryMutAct_9fa48("81870") ? true : (stryCov_9fa48("81870", "81871", "81872"), this.clients.size === 0);
    }
  }

  /**
   * Renew a client's subscription.
   * @param {string} clientId - Client ID.
   * @param {string} cursor - Last seen HLC timestamp.
   * @return {Object|null} Renewal result or null if client not found.
   */
  renewClient(clientId, cursor) {
    if (stryMutAct_9fa48("81873")) {
      {}
    } else {
      stryCov_9fa48("81873");
      const subscription = this.clients.get(clientId);
      if (stryMutAct_9fa48("81876") ? false : stryMutAct_9fa48("81875") ? true : stryMutAct_9fa48("81874") ? subscription : (stryCov_9fa48("81874", "81875", "81876"), !subscription)) return null;
      subscription.lastRenewal = Date.now();
      if (stryMutAct_9fa48("81878") ? false : stryMutAct_9fa48("81877") ? true : (stryCov_9fa48("81877", "81878"), cursor)) {
        if (stryMutAct_9fa48("81879")) {
          {}
        } else {
          stryCov_9fa48("81879");
          subscription.lastSeenHLC = cursor;
        }
      }
      this.lastActivityAt = Date.now();
      return stryMutAct_9fa48("81880") ? {} : (stryCov_9fa48("81880"), {
        queryId: this.queryId,
        clientId,
        expiresAt: stryMutAct_9fa48("81881") ? subscription.lastRenewal - subscription.ttlMs : (stryCov_9fa48("81881"), subscription.lastRenewal + subscription.ttlMs),
        renewBefore: stryMutAct_9fa48("81882") ? subscription.lastRenewal - Math.floor(subscription.ttlMs * 0.7) : (stryCov_9fa48("81882"), subscription.lastRenewal + Math.floor(stryMutAct_9fa48("81883") ? subscription.ttlMs / 0.7 : (stryCov_9fa48("81883"), subscription.ttlMs * 0.7)))
      });
    }
  }

  /**
   * Check if a client subscription has expired.
   * @param {Object} subscription - Client subscription.
   * @return {boolean} True if expired.
   */
  isSubscriptionExpired(subscription) {
    if (stryMutAct_9fa48("81884")) {
      {}
    } else {
      stryCov_9fa48("81884");
      return stryMutAct_9fa48("81888") ? Date.now() <= subscription.lastRenewal + subscription.ttlMs : stryMutAct_9fa48("81887") ? Date.now() >= subscription.lastRenewal + subscription.ttlMs : stryMutAct_9fa48("81886") ? false : stryMutAct_9fa48("81885") ? true : (stryCov_9fa48("81885", "81886", "81887", "81888"), Date.now() > (stryMutAct_9fa48("81889") ? subscription.lastRenewal - subscription.ttlMs : (stryCov_9fa48("81889"), subscription.lastRenewal + subscription.ttlMs)));
    }
  }

  /**
   * Get expired client subscriptions.
   * @return {Array} Array of expired client IDs.
   */
  getExpiredClients() {
    if (stryMutAct_9fa48("81890")) {
      {}
    } else {
      stryCov_9fa48("81890");
      const expired = stryMutAct_9fa48("81891") ? ["Stryker was here"] : (stryCov_9fa48("81891"), []);
      for (const [clientId, subscription] of this.clients) {
        if (stryMutAct_9fa48("81892")) {
          {}
        } else {
          stryCov_9fa48("81892");
          if (stryMutAct_9fa48("81894") ? false : stryMutAct_9fa48("81893") ? true : (stryCov_9fa48("81893", "81894"), this.isSubscriptionExpired(subscription))) {
            if (stryMutAct_9fa48("81895")) {
              {}
            } else {
              stryCov_9fa48("81895");
              expired.push(clientId);
            }
          }
        }
      }
      return expired;
    }
  }

  /**
   * Get the partition key column for the table.
   * @return {string|null} Partition key column name.
   */
  getPartitionKeyColumn() {
    if (stryMutAct_9fa48("81896")) {
      {}
    } else {
      stryCov_9fa48("81896");
      if (stryMutAct_9fa48("81898") ? false : stryMutAct_9fa48("81897") ? true : (stryCov_9fa48("81897", "81898"), this.partitionKeyColumn)) {
        if (stryMutAct_9fa48("81899")) {
          {}
        } else {
          stryCov_9fa48("81899");
          return this.partitionKeyColumn;
        }
      }
      if (stryMutAct_9fa48("81902") ? !this.systemCache && !this.table : stryMutAct_9fa48("81901") ? false : stryMutAct_9fa48("81900") ? true : (stryCov_9fa48("81900", "81901", "81902"), (stryMutAct_9fa48("81903") ? this.systemCache : (stryCov_9fa48("81903"), !this.systemCache)) || (stryMutAct_9fa48("81904") ? this.table : (stryCov_9fa48("81904"), !this.table)))) {
        if (stryMutAct_9fa48("81905")) {
          {}
        } else {
          stryCov_9fa48("81905");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("81906")) {
          {}
        } else {
          stryCov_9fa48("81906");
          const tableInfo = this.getTableInfo();
          if (stryMutAct_9fa48("81908") ? false : stryMutAct_9fa48("81907") ? true : (stryCov_9fa48("81907", "81908"), tableInfo)) {
            if (stryMutAct_9fa48("81909")) {
              {}
            } else {
              stryCov_9fa48("81909");
              this.partitionKeyColumn = stryMutAct_9fa48("81912") ? (tableInfo.primary_key || tableInfo.primaryKey) && LIVE_QUERY_DEFAULT_VALUE.PRIMARY_KEY_FALLBACK : stryMutAct_9fa48("81911") ? false : stryMutAct_9fa48("81910") ? true : (stryCov_9fa48("81910", "81911", "81912"), (stryMutAct_9fa48("81914") ? tableInfo.primary_key && tableInfo.primaryKey : stryMutAct_9fa48("81913") ? false : (stryCov_9fa48("81913", "81914"), tableInfo.primary_key || tableInfo.primaryKey)) || LIVE_QUERY_DEFAULT_VALUE.PRIMARY_KEY_FALLBACK);
              return this.partitionKeyColumn;
            }
          }
        }
      } catch {
        // Cache not available
      }
      return LIVE_QUERY_DEFAULT_VALUE.PRIMARY_KEY_FALLBACK;
    }
  }

  /**
   * Extract partition key value from WHERE clause.
   * @return {*} Partition key value or null.
   */
  extractPartitionKeyValue() {
    if (stryMutAct_9fa48("81915")) {
      {}
    } else {
      stryCov_9fa48("81915");
      if (stryMutAct_9fa48("81918") ? this.partitionKeyValue === null : stryMutAct_9fa48("81917") ? false : stryMutAct_9fa48("81916") ? true : (stryCov_9fa48("81916", "81917", "81918"), this.partitionKeyValue !== null)) {
        if (stryMutAct_9fa48("81919")) {
          {}
        } else {
          stryCov_9fa48("81919");
          return this.partitionKeyValue;
        }
      }
      const keyColumn = this.getPartitionKeyColumn();
      this.partitionKeyValue = extractPartitionKeyValue(this.whereClause, keyColumn);
      return this.partitionKeyValue;
    }
  }

  /**
   * Find partitions for the query based on partition key.
   * @return {Promise<Set>} Set of partition IDs.
   */
  async findPartitionsForQuery() {
    if (stryMutAct_9fa48("81920")) {
      {}
    } else {
      stryCov_9fa48("81920");
      const keyValue = this.extractPartitionKeyValue();
      if (stryMutAct_9fa48("81923") ? false : stryMutAct_9fa48("81922") ? true : stryMutAct_9fa48("81921") ? this.systemCache : (stryCov_9fa48("81921", "81922", "81923"), !this.systemCache)) {
        if (stryMutAct_9fa48("81924")) {
          {}
        } else {
          stryCov_9fa48("81924");
          return new Set();
        }
      }
      try {
        if (stryMutAct_9fa48("81925")) {
          {}
        } else {
          stryCov_9fa48("81925");
          const tableInfo = this.getTableInfo();
          const activePartitionVersion = this.resolveActivePartitionVersion(tableInfo);
          const partitions = stryMutAct_9fa48("81926") ? this.systemCache.filter(TABLES.PARTITIONS, p => p.table_name === this.table || p.tableName === this.table) || [] : (stryCov_9fa48("81926"), (stryMutAct_9fa48("81929") ? this.systemCache.filter(TABLES.PARTITIONS, p => p.table_name === this.table || p.tableName === this.table) && [] : stryMutAct_9fa48("81928") ? false : stryMutAct_9fa48("81927") ? true : (stryCov_9fa48("81927", "81928", "81929"), (stryMutAct_9fa48("81930") ? this.systemCache : (stryCov_9fa48("81930"), this.systemCache.filter(TABLES.PARTITIONS, stryMutAct_9fa48("81931") ? () => undefined : (stryCov_9fa48("81931"), p => stryMutAct_9fa48("81934") ? p.table_name === this.table && p.tableName === this.table : stryMutAct_9fa48("81933") ? false : stryMutAct_9fa48("81932") ? true : (stryCov_9fa48("81932", "81933", "81934"), (stryMutAct_9fa48("81936") ? p.table_name !== this.table : stryMutAct_9fa48("81935") ? false : (stryCov_9fa48("81935", "81936"), p.table_name === this.table)) || (stryMutAct_9fa48("81938") ? p.tableName !== this.table : stryMutAct_9fa48("81937") ? false : (stryCov_9fa48("81937", "81938"), p.tableName === this.table))))))) || (stryMutAct_9fa48("81939") ? ["Stryker was here"] : (stryCov_9fa48("81939"), [])))).filter(stryMutAct_9fa48("81940") ? () => undefined : (stryCov_9fa48("81940"), partition => this.isPartitionVisibleForRouting(partition, activePartitionVersion))));
          if (stryMutAct_9fa48("81943") ? keyValue !== null : stryMutAct_9fa48("81942") ? false : stryMutAct_9fa48("81941") ? true : (stryCov_9fa48("81941", "81942", "81943"), keyValue === null)) {
            if (stryMutAct_9fa48("81944")) {
              {}
            } else {
              stryCov_9fa48("81944");
              // No partition key filter - subscribe to all partitions
              this.logger.warn(LIVE_QUERY_LOG_MSG.NO_PARTITION_KEY_FILTER, stryMutAct_9fa48("81945") ? {} : (stryCov_9fa48("81945"), {
                queryId: this.queryId,
                table: this.table
              }));
              return new Set(partitions.map(stryMutAct_9fa48("81946") ? () => undefined : (stryCov_9fa48("81946"), p => stryMutAct_9fa48("81949") ? p.partition_id && p.partitionId : stryMutAct_9fa48("81948") ? false : stryMutAct_9fa48("81947") ? true : (stryCov_9fa48("81947", "81948", "81949"), p.partition_id || p.partitionId))));
            }
          }

          // Find partitions containing the key value(s)
          const matching = new Set();
          const keyValues = Array.isArray(keyValue) ? keyValue : stryMutAct_9fa48("81950") ? [] : (stryCov_9fa48("81950"), [keyValue]);
          for (const partition of partitions) {
            if (stryMutAct_9fa48("81951")) {
              {}
            } else {
              stryCov_9fa48("81951");
              for (const kv of keyValues) {
                if (stryMutAct_9fa48("81952")) {
                  {}
                } else {
                  stryCov_9fa48("81952");
                  if (stryMutAct_9fa48("81954") ? false : stryMutAct_9fa48("81953") ? true : (stryCov_9fa48("81953", "81954"), this.isKeyInPartition(kv, partition))) {
                    if (stryMutAct_9fa48("81955")) {
                      {}
                    } else {
                      stryCov_9fa48("81955");
                      matching.add(stryMutAct_9fa48("81958") ? partition.partition_id && partition.partitionId : stryMutAct_9fa48("81957") ? false : stryMutAct_9fa48("81956") ? true : (stryCov_9fa48("81956", "81957", "81958"), partition.partition_id || partition.partitionId));
                    }
                  }
                }
              }
            }
          }
          return matching;
        }
      } catch (error) {
        if (stryMutAct_9fa48("81959")) {
          {}
        } else {
          stryCov_9fa48("81959");
          this.logger.error(LIVE_QUERY_LOG_MSG.PARTITIONS_LOOKUP_FAILED, stryMutAct_9fa48("81960") ? {} : (stryCov_9fa48("81960"), {
            queryId: this.queryId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Check if a key value falls within a partition's range.
   * @param {*} key - Key value.
   * @param {Object} partition - Partition info.
   * @return {boolean} True if key in partition.
   */
  isKeyInPartition(key, partition) {
    if (stryMutAct_9fa48("81961")) {
      {}
    } else {
      stryCov_9fa48("81961");
      const start = stryMutAct_9fa48("81962") ? partition.partition_key_start && partition.keyRange?.start : (stryCov_9fa48("81962"), partition.partition_key_start ?? (stryMutAct_9fa48("81963") ? partition.keyRange.start : (stryCov_9fa48("81963"), partition.keyRange?.start)));
      const end = stryMutAct_9fa48("81964") ? partition.partition_key_end && partition.keyRange?.end : (stryCov_9fa48("81964"), partition.partition_key_end ?? (stryMutAct_9fa48("81965") ? partition.keyRange.end : (stryCov_9fa48("81965"), partition.keyRange?.end)));

      // NULL start/end means unbounded
      if (stryMutAct_9fa48("81968") ? start === null || start === undefined || end === null || end === undefined : stryMutAct_9fa48("81967") ? false : stryMutAct_9fa48("81966") ? true : (stryCov_9fa48("81966", "81967", "81968"), (stryMutAct_9fa48("81970") ? start === null && start === undefined : stryMutAct_9fa48("81969") ? true : (stryCov_9fa48("81969", "81970"), (stryMutAct_9fa48("81972") ? start !== null : stryMutAct_9fa48("81971") ? false : (stryCov_9fa48("81971", "81972"), start === null)) || (stryMutAct_9fa48("81974") ? start !== undefined : stryMutAct_9fa48("81973") ? false : (stryCov_9fa48("81973", "81974"), start === undefined)))) && (stryMutAct_9fa48("81976") ? end === null && end === undefined : stryMutAct_9fa48("81975") ? true : (stryCov_9fa48("81975", "81976"), (stryMutAct_9fa48("81978") ? end !== null : stryMutAct_9fa48("81977") ? false : (stryCov_9fa48("81977", "81978"), end === null)) || (stryMutAct_9fa48("81980") ? end !== undefined : stryMutAct_9fa48("81979") ? false : (stryCov_9fa48("81979", "81980"), end === undefined)))))) {
        if (stryMutAct_9fa48("81981")) {
          {}
        } else {
          stryCov_9fa48("81981");
          return stryMutAct_9fa48("81982") ? false : (stryCov_9fa48("81982"), true);
        }
      }
      if (stryMutAct_9fa48("81985") ? start === null && start === undefined : stryMutAct_9fa48("81984") ? false : stryMutAct_9fa48("81983") ? true : (stryCov_9fa48("81983", "81984", "81985"), (stryMutAct_9fa48("81987") ? start !== null : stryMutAct_9fa48("81986") ? false : (stryCov_9fa48("81986", "81987"), start === null)) || (stryMutAct_9fa48("81989") ? start !== undefined : stryMutAct_9fa48("81988") ? false : (stryCov_9fa48("81988", "81989"), start === undefined)))) {
        if (stryMutAct_9fa48("81990")) {
          {}
        } else {
          stryCov_9fa48("81990");
          return stryMutAct_9fa48("81994") ? this.compareValues(key, end) >= 0 : stryMutAct_9fa48("81993") ? this.compareValues(key, end) <= 0 : stryMutAct_9fa48("81992") ? false : stryMutAct_9fa48("81991") ? true : (stryCov_9fa48("81991", "81992", "81993", "81994"), this.compareValues(key, end) < 0);
        }
      }
      if (stryMutAct_9fa48("81997") ? end === null && end === undefined : stryMutAct_9fa48("81996") ? false : stryMutAct_9fa48("81995") ? true : (stryCov_9fa48("81995", "81996", "81997"), (stryMutAct_9fa48("81999") ? end !== null : stryMutAct_9fa48("81998") ? false : (stryCov_9fa48("81998", "81999"), end === null)) || (stryMutAct_9fa48("82001") ? end !== undefined : stryMutAct_9fa48("82000") ? false : (stryCov_9fa48("82000", "82001"), end === undefined)))) {
        if (stryMutAct_9fa48("82002")) {
          {}
        } else {
          stryCov_9fa48("82002");
          return stryMutAct_9fa48("82006") ? this.compareValues(key, start) < 0 : stryMutAct_9fa48("82005") ? this.compareValues(key, start) > 0 : stryMutAct_9fa48("82004") ? false : stryMutAct_9fa48("82003") ? true : (stryCov_9fa48("82003", "82004", "82005", "82006"), this.compareValues(key, start) >= 0);
        }
      }
      return stryMutAct_9fa48("82009") ? this.compareValues(key, start) >= 0 || this.compareValues(key, end) < 0 : stryMutAct_9fa48("82008") ? false : stryMutAct_9fa48("82007") ? true : (stryCov_9fa48("82007", "82008", "82009"), (stryMutAct_9fa48("82012") ? this.compareValues(key, start) < 0 : stryMutAct_9fa48("82011") ? this.compareValues(key, start) > 0 : stryMutAct_9fa48("82010") ? true : (stryCov_9fa48("82010", "82011", "82012"), this.compareValues(key, start) >= 0)) && (stryMutAct_9fa48("82015") ? this.compareValues(key, end) >= 0 : stryMutAct_9fa48("82014") ? this.compareValues(key, end) <= 0 : stryMutAct_9fa48("82013") ? true : (stryCov_9fa48("82013", "82014", "82015"), this.compareValues(key, end) < 0)));
    }
  }

  /**
   * Read current table metadata from the system cache.
   * @return {Object|null} Table metadata row.
   * @private
   */
  getTableInfo() {
    if (stryMutAct_9fa48("82016")) {
      {}
    } else {
      stryCov_9fa48("82016");
      if (stryMutAct_9fa48("82019") ? !this.systemCache && !this.table : stryMutAct_9fa48("82018") ? false : stryMutAct_9fa48("82017") ? true : (stryCov_9fa48("82017", "82018", "82019"), (stryMutAct_9fa48("82020") ? this.systemCache : (stryCov_9fa48("82020"), !this.systemCache)) || (stryMutAct_9fa48("82021") ? this.table : (stryCov_9fa48("82021"), !this.table)))) {
        if (stryMutAct_9fa48("82022")) {
          {}
        } else {
          stryCov_9fa48("82022");
          return null;
        }
      }
      return stryMutAct_9fa48("82025") ? (this.systemCache.get(TABLES.TABLES, this.table) || this.systemCache.find(TABLES.TABLES, t => t.table_name === this.table || t.tableName === this.table)) && null : stryMutAct_9fa48("82024") ? false : stryMutAct_9fa48("82023") ? true : (stryCov_9fa48("82023", "82024", "82025"), (stryMutAct_9fa48("82027") ? this.systemCache.get(TABLES.TABLES, this.table) && this.systemCache.find(TABLES.TABLES, t => t.table_name === this.table || t.tableName === this.table) : stryMutAct_9fa48("82026") ? false : (stryCov_9fa48("82026", "82027"), this.systemCache.get(TABLES.TABLES, this.table) || this.systemCache.find(TABLES.TABLES, stryMutAct_9fa48("82028") ? () => undefined : (stryCov_9fa48("82028"), t => stryMutAct_9fa48("82031") ? t.table_name === this.table && t.tableName === this.table : stryMutAct_9fa48("82030") ? false : stryMutAct_9fa48("82029") ? true : (stryCov_9fa48("82029", "82030", "82031"), (stryMutAct_9fa48("82033") ? t.table_name !== this.table : stryMutAct_9fa48("82032") ? false : (stryCov_9fa48("82032", "82033"), t.table_name === this.table)) || (stryMutAct_9fa48("82035") ? t.tableName !== this.table : stryMutAct_9fa48("82034") ? false : (stryCov_9fa48("82034", "82035"), t.tableName === this.table))))))) || null);
    }
  }

  /**
   * Resolve active partition version from table metadata.
   * Missing values default to version 1 for compatibility.
   * @param {Object|null} tableInfo
   * @return {number}
   * @private
   */
  resolveActivePartitionVersion(tableInfo) {
    if (stryMutAct_9fa48("82036")) {
      {}
    } else {
      stryCov_9fa48("82036");
      const value = stryMutAct_9fa48("82037") ? tableInfo?.active_partition_version && tableInfo?.activePartitionVersion : (stryCov_9fa48("82037"), (stryMutAct_9fa48("82038") ? tableInfo.active_partition_version : (stryCov_9fa48("82038"), tableInfo?.active_partition_version)) ?? (stryMutAct_9fa48("82039") ? tableInfo.activePartitionVersion : (stryCov_9fa48("82039"), tableInfo?.activePartitionVersion)));
      const parsed = Number(value);
      if (stryMutAct_9fa48("82042") ? !Number.isInteger(parsed) && parsed < DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("82041") ? false : stryMutAct_9fa48("82040") ? true : (stryCov_9fa48("82040", "82041", "82042"), (stryMutAct_9fa48("82043") ? Number.isInteger(parsed) : (stryCov_9fa48("82043"), !Number.isInteger(parsed))) || (stryMutAct_9fa48("82046") ? parsed >= DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("82045") ? parsed <= DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("82044") ? false : (stryCov_9fa48("82044", "82045", "82046"), parsed < DEFAULT_PARTITION_VERSION)))) {
        if (stryMutAct_9fa48("82047")) {
          {}
        } else {
          stryCov_9fa48("82047");
          return DEFAULT_PARTITION_VERSION;
        }
      }
      return parsed;
    }
  }

  /**
   * Determine whether a partition participates in current table routing.
   * @param {Object} partition
   * @param {number} activePartitionVersion
   * @return {boolean}
   * @private
   */
  isPartitionVisibleForRouting(partition, activePartitionVersion) {
    if (stryMutAct_9fa48("82048")) {
      {}
    } else {
      stryCov_9fa48("82048");
      const partitionVersion = Number(stryMutAct_9fa48("82049") ? partition?.partition_version && partition?.partitionVersion : (stryCov_9fa48("82049"), (stryMutAct_9fa48("82050") ? partition.partition_version : (stryCov_9fa48("82050"), partition?.partition_version)) ?? (stryMutAct_9fa48("82051") ? partition.partitionVersion : (stryCov_9fa48("82051"), partition?.partitionVersion))));
      const normalizedVersion = (stryMutAct_9fa48("82054") ? Number.isInteger(partitionVersion) || partitionVersion >= DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("82053") ? false : stryMutAct_9fa48("82052") ? true : (stryCov_9fa48("82052", "82053", "82054"), Number.isInteger(partitionVersion) && (stryMutAct_9fa48("82057") ? partitionVersion < DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("82056") ? partitionVersion > DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("82055") ? true : (stryCov_9fa48("82055", "82056", "82057"), partitionVersion >= DEFAULT_PARTITION_VERSION)))) ? partitionVersion : DEFAULT_PARTITION_VERSION;
      if (stryMutAct_9fa48("82060") ? normalizedVersion === activePartitionVersion : stryMutAct_9fa48("82059") ? false : stryMutAct_9fa48("82058") ? true : (stryCov_9fa48("82058", "82059", "82060"), normalizedVersion !== activePartitionVersion)) {
        if (stryMutAct_9fa48("82061")) {
          {}
        } else {
          stryCov_9fa48("82061");
          return stryMutAct_9fa48("82062") ? true : (stryCov_9fa48("82062"), false);
        }
      }
      const state = stryMutAct_9fa48("82063") ? String(partition?.state ?? ACTIVE_PARTITION_STATE).toLowerCase() : (stryCov_9fa48("82063"), String(stryMutAct_9fa48("82064") ? partition?.state && ACTIVE_PARTITION_STATE : (stryCov_9fa48("82064"), (stryMutAct_9fa48("82065") ? partition.state : (stryCov_9fa48("82065"), partition?.state)) ?? ACTIVE_PARTITION_STATE)).toUpperCase());
      return stryMutAct_9fa48("82068") ? state !== ACTIVE_PARTITION_STATE : stryMutAct_9fa48("82067") ? false : stryMutAct_9fa48("82066") ? true : (stryCov_9fa48("82066", "82067", "82068"), state === ACTIVE_PARTITION_STATE);
    }
  }

  /**
   * Compare two values.
   * @param {*} a - First value.
   * @param {*} b - Second value.
   * @return {number} Comparison result.
   */
  compareValues(a, b) {
    if (stryMutAct_9fa48("82069")) {
      {}
    } else {
      stryCov_9fa48("82069");
      if (stryMutAct_9fa48("82072") ? a !== b : stryMutAct_9fa48("82071") ? false : stryMutAct_9fa48("82070") ? true : (stryCov_9fa48("82070", "82071", "82072"), a === b)) return 0;
      if (stryMutAct_9fa48("82075") ? a !== null : stryMutAct_9fa48("82074") ? false : stryMutAct_9fa48("82073") ? true : (stryCov_9fa48("82073", "82074", "82075"), a === null)) return stryMutAct_9fa48("82076") ? +1 : (stryCov_9fa48("82076"), -1);
      if (stryMutAct_9fa48("82079") ? b !== null : stryMutAct_9fa48("82078") ? false : stryMutAct_9fa48("82077") ? true : (stryCov_9fa48("82077", "82078", "82079"), b === null)) return 1;
      if (stryMutAct_9fa48("82082") ? typeof a === TYPEOF.STRING || typeof b === TYPEOF.STRING : stryMutAct_9fa48("82081") ? false : stryMutAct_9fa48("82080") ? true : (stryCov_9fa48("82080", "82081", "82082"), (stryMutAct_9fa48("82084") ? typeof a !== TYPEOF.STRING : stryMutAct_9fa48("82083") ? true : (stryCov_9fa48("82083", "82084"), typeof a === TYPEOF.STRING)) && (stryMutAct_9fa48("82086") ? typeof b !== TYPEOF.STRING : stryMutAct_9fa48("82085") ? true : (stryCov_9fa48("82085", "82086"), typeof b === TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("82087")) {
          {}
        } else {
          stryCov_9fa48("82087");
          return a.localeCompare(b);
        }
      }
      if (stryMutAct_9fa48("82090") ? typeof a === TYPEOF.NUMBER || typeof b === TYPEOF.NUMBER : stryMutAct_9fa48("82089") ? false : stryMutAct_9fa48("82088") ? true : (stryCov_9fa48("82088", "82089", "82090"), (stryMutAct_9fa48("82092") ? typeof a !== TYPEOF.NUMBER : stryMutAct_9fa48("82091") ? true : (stryCov_9fa48("82091", "82092"), typeof a === TYPEOF.NUMBER)) && (stryMutAct_9fa48("82094") ? typeof b !== TYPEOF.NUMBER : stryMutAct_9fa48("82093") ? true : (stryCov_9fa48("82093", "82094"), typeof b === TYPEOF.NUMBER)))) {
        if (stryMutAct_9fa48("82095")) {
          {}
        } else {
          stryCov_9fa48("82095");
          return stryMutAct_9fa48("82096") ? a + b : (stryCov_9fa48("82096"), a - b);
        }
      }
      return String(a).localeCompare(String(b));
    }
  }

  /**
   * Handle a CDC event from a partition.
   * Evaluates predicate and fans out to all clients.
   * @param {Object} change - CDC change event.
   */
  handleCDCEvent(change) {
    if (stryMutAct_9fa48("82097")) {
      {}
    } else {
      stryCov_9fa48("82097");
      const result = this.evaluateChange(change);
      if (stryMutAct_9fa48("82099") ? false : stryMutAct_9fa48("82098") ? true : (stryCov_9fa48("82098", "82099"), result)) {
        if (stryMutAct_9fa48("82100")) {
          {}
        } else {
          stryCov_9fa48("82100");
          this.lastActivityAt = Date.now();

          // Fan-out to all clients
          for (const [clientId, subscription] of this.clients) {
            if (stryMutAct_9fa48("82101")) {
              {}
            } else {
              stryCov_9fa48("82101");
              try {
                if (stryMutAct_9fa48("82102")) {
                  {}
                } else {
                  stryCov_9fa48("82102");
                  if (stryMutAct_9fa48("82105") ? subscription.client || typeof subscription.client.send === TYPEOF.FUNCTION : stryMutAct_9fa48("82104") ? false : stryMutAct_9fa48("82103") ? true : (stryCov_9fa48("82103", "82104", "82105"), subscription.client && (stryMutAct_9fa48("82107") ? typeof subscription.client.send !== TYPEOF.FUNCTION : stryMutAct_9fa48("82106") ? true : (stryCov_9fa48("82106", "82107"), typeof subscription.client.send === TYPEOF.FUNCTION)))) {
                    if (stryMutAct_9fa48("82108")) {
                      {}
                    } else {
                      stryCov_9fa48("82108");
                      subscription.client.send(JSON.stringify(result));
                    }
                  }
                  subscription.lastSeenHLC = stryMutAct_9fa48("82111") ? change.hlc_timestamp && change.hlcTimestamp : stryMutAct_9fa48("82110") ? false : stryMutAct_9fa48("82109") ? true : (stryCov_9fa48("82109", "82110", "82111"), change.hlc_timestamp || change.hlcTimestamp);
                }
              } catch (error) {
                if (stryMutAct_9fa48("82112")) {
                  {}
                } else {
                  stryCov_9fa48("82112");
                  this.logger.warn(LIVE_QUERY_LOG_MSG.FAILED_SEND_CLIENT, stryMutAct_9fa48("82113") ? {} : (stryCov_9fa48("82113"), {
                    queryId: this.queryId,
                    clientId,
                    error: error.message
                  }));
                  throw error;
                }
              }
            }
          }
          this.emit(LIVE_QUERY_EMIT.CHANGE, result);
        }
      }
    }
  }

  /**
   * Evaluate a CDC change against the predicate.
   * @param {Object} change - CDC change event.
   * @return {Object|null} Event to send to clients or null.
   */
  evaluateChange(change) {
    if (stryMutAct_9fa48("82114")) {
      {}
    } else {
      stryCov_9fa48("82114");
      const {
        operation,
        data: newRow,
        old_data: oldRow
      } = change;
      const hlc = stryMutAct_9fa48("82117") ? change.hlc_timestamp && change.hlcTimestamp : stryMutAct_9fa48("82116") ? false : stryMutAct_9fa48("82115") ? true : (stryCov_9fa48("82115", "82116", "82117"), change.hlc_timestamp || change.hlcTimestamp);
      switch (stryMutAct_9fa48("82119") ? operation.toUpperCase() : stryMutAct_9fa48("82118") ? operation?.toLowerCase() : (stryCov_9fa48("82118", "82119"), operation?.toUpperCase())) {
        case LIVE_QUERY_OPERATION.INSERT:
          if (stryMutAct_9fa48("82120")) {} else {
            stryCov_9fa48("82120");
            if (stryMutAct_9fa48("82123") ? newRow || this.predicate(newRow) : stryMutAct_9fa48("82122") ? false : stryMutAct_9fa48("82121") ? true : (stryCov_9fa48("82121", "82122", "82123"), newRow && this.predicate(newRow))) {
              if (stryMutAct_9fa48("82124")) {
                {}
              } else {
                stryCov_9fa48("82124");
                return stryMutAct_9fa48("82125") ? {} : (stryCov_9fa48("82125"), {
                  type: LIVE_QUERY_EVENT.INSERT,
                  queryId: this.queryId,
                  row: newRow,
                  hlc
                });
              }
            }
            break;
          }
        case LIVE_QUERY_OPERATION.UPDATE:
          if (stryMutAct_9fa48("82126")) {} else {
            stryCov_9fa48("82126");
            {
              if (stryMutAct_9fa48("82127")) {
                {}
              } else {
                stryCov_9fa48("82127");
                const oldMatched = stryMutAct_9fa48("82130") ? oldRow || this.predicate(oldRow) : stryMutAct_9fa48("82129") ? false : stryMutAct_9fa48("82128") ? true : (stryCov_9fa48("82128", "82129", "82130"), oldRow && this.predicate(oldRow));
                const newMatched = stryMutAct_9fa48("82133") ? newRow || this.predicate(newRow) : stryMutAct_9fa48("82132") ? false : stryMutAct_9fa48("82131") ? true : (stryCov_9fa48("82131", "82132", "82133"), newRow && this.predicate(newRow));
                if (stryMutAct_9fa48("82136") ? !oldMatched || newMatched : stryMutAct_9fa48("82135") ? false : stryMutAct_9fa48("82134") ? true : (stryCov_9fa48("82134", "82135", "82136"), (stryMutAct_9fa48("82137") ? oldMatched : (stryCov_9fa48("82137"), !oldMatched)) && newMatched)) {
                  if (stryMutAct_9fa48("82138")) {
                    {}
                  } else {
                    stryCov_9fa48("82138");
                    // Row now matches predicate - treat as insert
                    return stryMutAct_9fa48("82139") ? {} : (stryCov_9fa48("82139"), {
                      type: LIVE_QUERY_EVENT.INSERT,
                      queryId: this.queryId,
                      row: newRow,
                      hlc
                    });
                  }
                } else if (stryMutAct_9fa48("82142") ? oldMatched || !newMatched : stryMutAct_9fa48("82141") ? false : stryMutAct_9fa48("82140") ? true : (stryCov_9fa48("82140", "82141", "82142"), oldMatched && (stryMutAct_9fa48("82143") ? newMatched : (stryCov_9fa48("82143"), !newMatched)))) {
                  if (stryMutAct_9fa48("82144")) {
                    {}
                  } else {
                    stryCov_9fa48("82144");
                    // Row no longer matches - treat as delete
                    return stryMutAct_9fa48("82145") ? {} : (stryCov_9fa48("82145"), {
                      type: LIVE_QUERY_EVENT.DELETE,
                      queryId: this.queryId,
                      row: oldRow,
                      hlc
                    });
                  }
                } else if (stryMutAct_9fa48("82148") ? oldMatched || newMatched : stryMutAct_9fa48("82147") ? false : stryMutAct_9fa48("82146") ? true : (stryCov_9fa48("82146", "82147", "82148"), oldMatched && newMatched)) {
                  if (stryMutAct_9fa48("82149")) {
                    {}
                  } else {
                    stryCov_9fa48("82149");
                    // Row still matches - send update
                    return stryMutAct_9fa48("82150") ? {} : (stryCov_9fa48("82150"), {
                      type: LIVE_QUERY_EVENT.UPDATE,
                      queryId: this.queryId,
                      old: oldRow,
                      new: newRow,
                      hlc
                    });
                  }
                }
                break;
              }
            }
          }
        case LIVE_QUERY_OPERATION.DELETE:
          if (stryMutAct_9fa48("82151")) {} else {
            stryCov_9fa48("82151");
            if (stryMutAct_9fa48("82154") ? oldRow || this.predicate(oldRow) : stryMutAct_9fa48("82153") ? false : stryMutAct_9fa48("82152") ? true : (stryCov_9fa48("82152", "82153", "82154"), oldRow && this.predicate(oldRow))) {
              if (stryMutAct_9fa48("82155")) {
                {}
              } else {
                stryCov_9fa48("82155");
                return stryMutAct_9fa48("82156") ? {} : (stryCov_9fa48("82156"), {
                  type: LIVE_QUERY_EVENT.DELETE,
                  queryId: this.queryId,
                  row: oldRow,
                  hlc
                });
              }
            }
            break;
          }
      }
      return null;
    }
  }

  /**
   * Update partition subscriptions (for split/merge handling).
   * @param {Function} subscribeToPartition - Function to subscribe to a partition.
   * @param {Function} unsubscribeFromPartition - Function to unsubscribe.
   * @return {Promise<void>}
   */
  async updatePartitionSubscriptions(subscribeToPartition, unsubscribeFromPartition) {
    if (stryMutAct_9fa48("82157")) {
      {}
    } else {
      stryCov_9fa48("82157");
      const relevantPartitions = await this.findPartitionsForQuery();

      // Unsubscribe from partitions no longer relevant
      for (const partitionId of this.subscribedPartitions) {
        if (stryMutAct_9fa48("82158")) {
          {}
        } else {
          stryCov_9fa48("82158");
          if (stryMutAct_9fa48("82161") ? false : stryMutAct_9fa48("82160") ? true : stryMutAct_9fa48("82159") ? relevantPartitions.has(partitionId) : (stryCov_9fa48("82159", "82160", "82161"), !relevantPartitions.has(partitionId))) {
            if (stryMutAct_9fa48("82162")) {
              {}
            } else {
              stryCov_9fa48("82162");
              if (stryMutAct_9fa48("82164") ? false : stryMutAct_9fa48("82163") ? true : (stryCov_9fa48("82163", "82164"), unsubscribeFromPartition)) {
                if (stryMutAct_9fa48("82165")) {
                  {}
                } else {
                  stryCov_9fa48("82165");
                  await unsubscribeFromPartition(partitionId, this.queryId);
                }
              }
              this.subscribedPartitions.delete(partitionId);
              this.logger.debug(LIVE_QUERY_LOG_MSG.UNSUBSCRIBED_PARTITION, stryMutAct_9fa48("82166") ? {} : (stryCov_9fa48("82166"), {
                queryId: this.queryId,
                partitionId
              }));
            }
          }
        }
      }

      // Subscribe to new partitions
      for (const partitionId of relevantPartitions) {
        if (stryMutAct_9fa48("82167")) {
          {}
        } else {
          stryCov_9fa48("82167");
          if (stryMutAct_9fa48("82170") ? false : stryMutAct_9fa48("82169") ? true : stryMutAct_9fa48("82168") ? this.subscribedPartitions.has(partitionId) : (stryCov_9fa48("82168", "82169", "82170"), !this.subscribedPartitions.has(partitionId))) {
            if (stryMutAct_9fa48("82171")) {
              {}
            } else {
              stryCov_9fa48("82171");
              if (stryMutAct_9fa48("82173") ? false : stryMutAct_9fa48("82172") ? true : (stryCov_9fa48("82172", "82173"), subscribeToPartition)) {
                if (stryMutAct_9fa48("82174")) {
                  {}
                } else {
                  stryCov_9fa48("82174");
                  await subscribeToPartition(partitionId, this.queryId, change => {
                    if (stryMutAct_9fa48("82175")) {
                      {}
                    } else {
                      stryCov_9fa48("82175");
                      this.handleCDCEvent(change);
                    }
                  });
                }
              }
              this.subscribedPartitions.add(partitionId);
              this.logger.debug(LIVE_QUERY_LOG_MSG.SUBSCRIBED_PARTITION, stryMutAct_9fa48("82176") ? {} : (stryCov_9fa48("82176"), {
                queryId: this.queryId,
                partitionId
              }));
            }
          }
        }
      }
    }
  }

  /**
   * Get query signature for grouping.
   * @return {string} Query signature.
   */
  getQuerySignature() {
    if (stryMutAct_9fa48("82177")) {
      {}
    } else {
      stryCov_9fa48("82177");
      return (stryMutAct_9fa48("82178") ? `` : (stryCov_9fa48("82178"), `${this.table}${LIVE_QUERY_CURSOR.SEPARATOR}`)) + (stryMutAct_9fa48("82179") ? `` : (stryCov_9fa48("82179"), `${canonicalizePredicate(this.whereClause)}`));
    }
  }

  /**
   * Get group metadata for monitoring.
   * @return {Object} Group metadata.
   */
  getMetadata() {
    if (stryMutAct_9fa48("82180")) {
      {}
    } else {
      stryCov_9fa48("82180");
      return stryMutAct_9fa48("82181") ? {} : (stryCov_9fa48("82181"), {
        queryId: this.queryId,
        table: this.table,
        predicateHash: stryMutAct_9fa48("82182") ? canonicalizePredicate(this.whereClause) : (stryCov_9fa48("82182"), canonicalizePredicate(this.whereClause).substring(0, 32)),
        partitionKeyValue: this.partitionKeyValue,
        clientCount: this.clients.size,
        subscribedPartitions: Array.from(this.subscribedPartitions),
        createdAt: this.createdAt,
        lastActivityAt: this.lastActivityAt,
        active: this.active
      });
    }
  }

  /**
   * Clean up resources.
   */
  cleanup() {
    if (stryMutAct_9fa48("82183")) {
      {}
    } else {
      stryCov_9fa48("82183");
      this.active = stryMutAct_9fa48("82184") ? true : (stryCov_9fa48("82184"), false);
      this.clients.clear();
      this.subscribedPartitions.clear();
      this.cdcHandlers.clear();
      this.removeAllListeners();
      this.logger.info(LIVE_QUERY_LOG_MSG.GROUP_CLEANED_UP, stryMutAct_9fa48("82185") ? {} : (stryCov_9fa48("82185"), {
        queryId: this.queryId,
        table: this.table
      }));
    }
  }
}

/**
 * LiveQueryManager manages all live query subscriptions.
 */
class LiveQueryManager extends EventEmitter {
  /**
   * Create a new LiveQueryManager.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache.
   * @param {Object} options.sqlQueryEngine - SQL query engine for snapshots.
   * @param {string} options.nodeId - Node ID.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("82186")) {
      {}
    } else {
      stryCov_9fa48("82186");
      super();
      this.systemCache = stryMutAct_9fa48("82189") ? options.systemCache && null : stryMutAct_9fa48("82188") ? false : stryMutAct_9fa48("82187") ? true : (stryCov_9fa48("82187", "82188", "82189"), options.systemCache || null);
      this.sqlQueryEngine = stryMutAct_9fa48("82192") ? options.sqlQueryEngine && null : stryMutAct_9fa48("82191") ? false : stryMutAct_9fa48("82190") ? true : (stryCov_9fa48("82190", "82191", "82192"), options.sqlQueryEngine || null);
      this.nodeId = stryMutAct_9fa48("82195") ? options.nodeId && LIVE_QUERY_DEFAULT_VALUE.UNKNOWN : stryMutAct_9fa48("82194") ? false : stryMutAct_9fa48("82193") ? true : (stryCov_9fa48("82193", "82194", "82195"), options.nodeId || LIVE_QUERY_DEFAULT_VALUE.UNKNOWN);

      // Query groups: groupKey -> QueryGroup
      this.queryGroups = new Map();

      // Client subscriptions: clientId -> Set<queryId>
      this.clientSubscriptions = new Map();

      // Client query counts for limits
      this.clientQueryCounts = new Map();

      // Configuration
      this.config = ConfigurationManager.getInstance();
      this.maxQueriesPerClient = stryMutAct_9fa48("82198") ? this.config.get(LIVE_QUERY_CONFIG_KEY.MAX_PER_CLIENT) && LIVE_QUERY_DEFAULTS.MAX_PER_CLIENT : stryMutAct_9fa48("82197") ? false : stryMutAct_9fa48("82196") ? true : (stryCov_9fa48("82196", "82197", "82198"), this.config.get(LIVE_QUERY_CONFIG_KEY.MAX_PER_CLIENT) || LIVE_QUERY_DEFAULTS.MAX_PER_CLIENT);
      this.cleanupIntervalMs = stryMutAct_9fa48("82201") ? this.config.get(LIVE_QUERY_CONFIG_KEY.CLEANUP_INTERVAL_MS) && LIVE_QUERY_DEFAULTS.CLEANUP_INTERVAL_MS : stryMutAct_9fa48("82200") ? false : stryMutAct_9fa48("82199") ? true : (stryCov_9fa48("82199", "82200", "82201"), this.config.get(LIVE_QUERY_CONFIG_KEY.CLEANUP_INTERVAL_MS) || LIVE_QUERY_DEFAULTS.CLEANUP_INTERVAL_MS);
      this.cursorRetentionMs = stryMutAct_9fa48("82204") ? this.config.get(LIVE_QUERY_CONFIG_KEY.CURSOR_RETENTION_MS) && LIVE_QUERY_DEFAULTS.CURSOR_RETENTION_MS : stryMutAct_9fa48("82203") ? false : stryMutAct_9fa48("82202") ? true : (stryCov_9fa48("82202", "82203", "82204"), this.config.get(LIVE_QUERY_CONFIG_KEY.CURSOR_RETENTION_MS) || LIVE_QUERY_DEFAULTS.CURSOR_RETENTION_MS);

      // Cleanup interval
      this.cleanupInterval = null;

      // CDC subscription functions (injected)
      this.subscribeToPartition = null;
      this.unsubscribeFromPartition = null;

      // Partition topology handler
      this.partitionTopologyHandler = null;

      // Status
      this.initialized = stryMutAct_9fa48("82205") ? true : (stryCov_9fa48("82205"), false);

      // Logging
      this.logger = this.initLogger();
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("82206")) {
      {}
    } else {
      stryCov_9fa48("82206");
      try {
        if (stryMutAct_9fa48("82207")) {
          {}
        } else {
          stryCov_9fa48("82207");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("82209") ? false : stryMutAct_9fa48("82208") ? true : (stryCov_9fa48("82208", "82209"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("82210")) {
              {}
            } else {
              stryCov_9fa48("82210");
              return loggingService.forSubsystem(LIVE_QUERY_SUBSYSTEM.LIVE_QUERY_MANAGER);
            }
          }
        }
      } catch {
        // Logging not available
      }
      return console;
    }
  }

  /**
   * Initialize the manager.
   * @param {Object} options - Initialization options.
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("82211")) {
      {}
    } else {
      stryCov_9fa48("82211");
      if (stryMutAct_9fa48("82213") ? false : stryMutAct_9fa48("82212") ? true : (stryCov_9fa48("82212", "82213"), options.systemCache)) {
        if (stryMutAct_9fa48("82214")) {
          {}
        } else {
          stryCov_9fa48("82214");
          this.systemCache = options.systemCache;
        }
      }
      if (stryMutAct_9fa48("82216") ? false : stryMutAct_9fa48("82215") ? true : (stryCov_9fa48("82215", "82216"), options.sqlQueryEngine)) {
        if (stryMutAct_9fa48("82217")) {
          {}
        } else {
          stryCov_9fa48("82217");
          this.sqlQueryEngine = options.sqlQueryEngine;
        }
      }
      if (stryMutAct_9fa48("82219") ? false : stryMutAct_9fa48("82218") ? true : (stryCov_9fa48("82218", "82219"), options.subscribeToPartition)) {
        if (stryMutAct_9fa48("82220")) {
          {}
        } else {
          stryCov_9fa48("82220");
          this.subscribeToPartition = options.subscribeToPartition;
        }
      }
      if (stryMutAct_9fa48("82222") ? false : stryMutAct_9fa48("82221") ? true : (stryCov_9fa48("82221", "82222"), options.unsubscribeFromPartition)) {
        if (stryMutAct_9fa48("82223")) {
          {}
        } else {
          stryCov_9fa48("82223");
          this.unsubscribeFromPartition = options.unsubscribeFromPartition;
        }
      }

      // Start cleanup loop
      this.startCleanupLoop();
      this.initialized = stryMutAct_9fa48("82224") ? false : (stryCov_9fa48("82224"), true);
      this.logger.info(LIVE_QUERY_LOG_MSG.MANAGER_INITIALIZED, stryMutAct_9fa48("82225") ? {} : (stryCov_9fa48("82225"), {
        nodeId: this.nodeId,
        maxQueriesPerClient: this.maxQueriesPerClient
      }));
    }
  }

  /**
   * Register a live query for a client.
   * @param {Object} parsedQuery - Parsed SELECT query AST.
   * @param {Object} client - Client connection.
   * @return {Promise<Object>} Registration result.
   */
  async registerLiveQuery(parsedQuery, client) {
    if (stryMutAct_9fa48("82226")) {
      {}
    } else {
      stryCov_9fa48("82226");
      const clientId = stryMutAct_9fa48("82229") ? client.id && client.clientId : stryMutAct_9fa48("82228") ? false : stryMutAct_9fa48("82227") ? true : (stryCov_9fa48("82227", "82228", "82229"), client.id || client.clientId);

      // Check client query limit
      const currentCount = stryMutAct_9fa48("82232") ? this.clientQueryCounts.get(clientId) && 0 : stryMutAct_9fa48("82231") ? false : stryMutAct_9fa48("82230") ? true : (stryCov_9fa48("82230", "82231", "82232"), this.clientQueryCounts.get(clientId) || 0);
      if (stryMutAct_9fa48("82236") ? currentCount < this.maxQueriesPerClient : stryMutAct_9fa48("82235") ? currentCount > this.maxQueriesPerClient : stryMutAct_9fa48("82234") ? false : stryMutAct_9fa48("82233") ? true : (stryCov_9fa48("82233", "82234", "82235", "82236"), currentCount >= this.maxQueriesPerClient)) {
        if (stryMutAct_9fa48("82237")) {
          {}
        } else {
          stryCov_9fa48("82237");
          throw new Error((stryMutAct_9fa48("82238") ? `` : (stryCov_9fa48("82238"), `${LIVE_QUERY_ERROR_MSG.MAX_QUERIES_EXCEEDED_PREFIX}`)) + (stryMutAct_9fa48("82239") ? `` : (stryCov_9fa48("82239"), `${this.maxQueriesPerClient}`)) + (stryMutAct_9fa48("82240") ? `` : (stryCov_9fa48("82240"), `${LIVE_QUERY_ERROR_MSG.MAX_QUERIES_EXCEEDED_SUFFIX}`)));
        }
      }

      // Compute group key
      const table = stryMutAct_9fa48("82242") ? parsedQuery.from?.name : stryMutAct_9fa48("82241") ? parsedQuery?.from.name : (stryCov_9fa48("82241", "82242"), parsedQuery?.from?.name);
      const groupKey = (stryMutAct_9fa48("82243") ? `` : (stryCov_9fa48("82243"), `${table}${LIVE_QUERY_CURSOR.SEPARATOR}`)) + (stryMutAct_9fa48("82244") ? `` : (stryCov_9fa48("82244"), `${canonicalizePredicate(stryMutAct_9fa48("82245") ? parsedQuery.where : (stryCov_9fa48("82245"), parsedQuery?.where))}`));
      let group = this.queryGroups.get(groupKey);
      let isNewGroup = stryMutAct_9fa48("82246") ? true : (stryCov_9fa48("82246"), false);
      if (stryMutAct_9fa48("82248") ? false : stryMutAct_9fa48("82247") ? true : (stryCov_9fa48("82247", "82248"), group)) {
        if (stryMutAct_9fa48("82249")) {
          {}
        } else {
          stryCov_9fa48("82249");
          // Join existing group
          group.addClient(client);
          this.logger.info(LIVE_QUERY_LOG_MSG.CLIENT_JOINED_EXISTING, stryMutAct_9fa48("82250") ? {} : (stryCov_9fa48("82250"), {
            groupKey,
            queryId: group.queryId,
            clientId,
            clientCount: group.clients.size
          }));
        }
      } else {
        if (stryMutAct_9fa48("82251")) {
          {}
        } else {
          stryCov_9fa48("82251");
          // Create new group
          group = new QueryGroup(stryMutAct_9fa48("82252") ? {} : (stryCov_9fa48("82252"), {
            parsedQuery,
            systemCache: this.systemCache,
            nodeId: this.nodeId
          }));
          group.addClient(client);
          this.queryGroups.set(groupKey, group);
          isNewGroup = stryMutAct_9fa48("82253") ? false : (stryCov_9fa48("82253"), true);

          // Start CDC subscriptions
          await group.updatePartitionSubscriptions(this.subscribeToPartition, this.unsubscribeFromPartition);
          group.active = stryMutAct_9fa48("82254") ? false : (stryCov_9fa48("82254"), true);
          this.logger.info(LIVE_QUERY_LOG_MSG.GROUP_CREATED, stryMutAct_9fa48("82255") ? {} : (stryCov_9fa48("82255"), {
            groupKey,
            queryId: group.queryId,
            partitionCount: group.subscribedPartitions.size
          }));
        }
      }

      // Track client subscriptions
      if (stryMutAct_9fa48("82258") ? false : stryMutAct_9fa48("82257") ? true : stryMutAct_9fa48("82256") ? this.clientSubscriptions.has(clientId) : (stryCov_9fa48("82256", "82257", "82258"), !this.clientSubscriptions.has(clientId))) {
        if (stryMutAct_9fa48("82259")) {
          {}
        } else {
          stryCov_9fa48("82259");
          this.clientSubscriptions.set(clientId, new Set());
        }
      }
      this.clientSubscriptions.get(clientId).add(group.queryId);

      // Update client query count
      this.clientQueryCounts.set(clientId, stryMutAct_9fa48("82260") ? currentCount - 1 : (stryCov_9fa48("82260"), currentCount + 1));

      // Log creation event
      this.logger.info(LIVE_QUERY_LOG_MSG.SUBSCRIPTION_CREATED, stryMutAct_9fa48("82261") ? {} : (stryCov_9fa48("82261"), {
        queryId: group.queryId,
        clientId,
        table,
        isNewGroup
      }));
      this.emit(LIVE_QUERY_EMIT.SUBSCRIPTION_CREATED, stryMutAct_9fa48("82262") ? {} : (stryCov_9fa48("82262"), {
        queryId: group.queryId,
        clientId,
        table,
        groupKey
      }));
      return stryMutAct_9fa48("82263") ? {} : (stryCov_9fa48("82263"), {
        queryId: group.queryId,
        expiresAt: stryMutAct_9fa48("82264") ? Date.now() - group.ttlMs : (stryCov_9fa48("82264"), Date.now() + group.ttlMs),
        renewBefore: stryMutAct_9fa48("82265") ? Date.now() - Math.floor(group.ttlMs * 0.7) : (stryCov_9fa48("82265"), Date.now() + Math.floor(stryMutAct_9fa48("82266") ? group.ttlMs / 0.7 : (stryCov_9fa48("82266"), group.ttlMs * 0.7))),
        partitions: Array.from(group.subscribedPartitions)
      });
    }
  }

  /**
   * Send initial snapshot to a client.
   * @param {Object} group - Query group.
   * @param {Object} client - Client connection.
   * @return {Promise<void>}
   */
  async sendSnapshotToClient(group, client) {
    if (stryMutAct_9fa48("82267")) {
      {}
    } else {
      stryCov_9fa48("82267");
      if (stryMutAct_9fa48("82270") ? false : stryMutAct_9fa48("82269") ? true : stryMutAct_9fa48("82268") ? this.sqlQueryEngine : (stryCov_9fa48("82268", "82269", "82270"), !this.sqlQueryEngine)) {
        if (stryMutAct_9fa48("82271")) {
          {}
        } else {
          stryCov_9fa48("82271");
          this.logger.warn(LIVE_QUERY_LOG_MSG.SNAPSHOT_ENGINE_UNAVAILABLE, stryMutAct_9fa48("82272") ? {} : (stryCov_9fa48("82272"), {
            queryId: group.queryId
          }));
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("82273")) {
          {}
        } else {
          stryCov_9fa48("82273");
          // Build SELECT query from parsed query
          const sql = this.buildSelectSQL(group.parsedQuery);
          const result = await this.sqlQueryEngine.executeQuery(sql);
          const snapshot = stryMutAct_9fa48("82274") ? {} : (stryCov_9fa48("82274"), {
            type: LIVE_QUERY_EVENT.SNAPSHOT,
            queryId: group.queryId,
            rows: stryMutAct_9fa48("82277") ? result.results && [] : stryMutAct_9fa48("82276") ? false : stryMutAct_9fa48("82275") ? true : (stryCov_9fa48("82275", "82276", "82277"), result.results || (stryMutAct_9fa48("82278") ? ["Stryker was here"] : (stryCov_9fa48("82278"), []))),
            count: stryMutAct_9fa48("82281") ? result.count && 0 : stryMutAct_9fa48("82280") ? false : stryMutAct_9fa48("82279") ? true : (stryCov_9fa48("82279", "82280", "82281"), result.count || 0)
          });
          if (stryMutAct_9fa48("82284") ? client || typeof client.send === TYPEOF.FUNCTION : stryMutAct_9fa48("82283") ? false : stryMutAct_9fa48("82282") ? true : (stryCov_9fa48("82282", "82283", "82284"), client && (stryMutAct_9fa48("82286") ? typeof client.send !== TYPEOF.FUNCTION : stryMutAct_9fa48("82285") ? true : (stryCov_9fa48("82285", "82286"), typeof client.send === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("82287")) {
              {}
            } else {
              stryCov_9fa48("82287");
              client.send(JSON.stringify(snapshot));
            }
          }
          this.logger.debug(LIVE_QUERY_LOG_MSG.SNAPSHOT_SENT, stryMutAct_9fa48("82288") ? {} : (stryCov_9fa48("82288"), {
            queryId: group.queryId,
            clientId: client.id,
            rowCount: snapshot.count
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("82289")) {
          {}
        } else {
          stryCov_9fa48("82289");
          this.logger.error(LIVE_QUERY_LOG_MSG.SNAPSHOT_FAILED, stryMutAct_9fa48("82290") ? {} : (stryCov_9fa48("82290"), {
            queryId: group.queryId,
            error: error.message
          }));

          // Send error to client
          if (stryMutAct_9fa48("82293") ? client || typeof client.send === TYPEOF.FUNCTION : stryMutAct_9fa48("82292") ? false : stryMutAct_9fa48("82291") ? true : (stryCov_9fa48("82291", "82292", "82293"), client && (stryMutAct_9fa48("82295") ? typeof client.send !== TYPEOF.FUNCTION : stryMutAct_9fa48("82294") ? true : (stryCov_9fa48("82294", "82295"), typeof client.send === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("82296")) {
              {}
            } else {
              stryCov_9fa48("82296");
              client.send(JSON.stringify(stryMutAct_9fa48("82297") ? {} : (stryCov_9fa48("82297"), {
                type: LIVE_QUERY_EVENT.ERROR,
                queryId: group.queryId,
                error: error.message
              })));
            }
          }
          throw error;
        }
      }
    }
  }

  /**
   * Build SELECT SQL from parsed query.
   * @param {Object} parsedQuery - Parsed query AST.
   * @return {string} SQL string.
   * @private
   */
  buildSelectSQL(parsedQuery) {
    if (stryMutAct_9fa48("82298")) {
      {}
    } else {
      stryCov_9fa48("82298");
      // Simple reconstruction - in production would use proper SQL builder
      const parts = stryMutAct_9fa48("82299") ? [] : (stryCov_9fa48("82299"), [LIVE_QUERY_SQL.SELECT]);

      // Columns
      if (stryMutAct_9fa48("82301") ? false : stryMutAct_9fa48("82300") ? true : (stryCov_9fa48("82300", "82301"), parsedQuery.columns)) {
        if (stryMutAct_9fa48("82302")) {
          {}
        } else {
          stryCov_9fa48("82302");
          const cols = parsedQuery.columns.map(c => {
            if (stryMutAct_9fa48("82303")) {
              {}
            } else {
              stryCov_9fa48("82303");
              if (stryMutAct_9fa48("82306") ? c.type !== LIVE_QUERY_AST_TYPE.STAR : stryMutAct_9fa48("82305") ? false : stryMutAct_9fa48("82304") ? true : (stryCov_9fa48("82304", "82305", "82306"), c.type === LIVE_QUERY_AST_TYPE.STAR)) return LIVE_QUERY_SQL.STAR;
              if (stryMutAct_9fa48("82309") ? c.expression?.type !== LIVE_QUERY_AST_TYPE.COLUMN_REF : stryMutAct_9fa48("82308") ? false : stryMutAct_9fa48("82307") ? true : (stryCov_9fa48("82307", "82308", "82309"), (stryMutAct_9fa48("82310") ? c.expression.type : (stryCov_9fa48("82310"), c.expression?.type)) === LIVE_QUERY_AST_TYPE.COLUMN_REF)) {
                if (stryMutAct_9fa48("82311")) {
                  {}
                } else {
                  stryCov_9fa48("82311");
                  const col = stryMutAct_9fa48("82314") ? c.expression.column && c.expression.name : stryMutAct_9fa48("82313") ? false : stryMutAct_9fa48("82312") ? true : (stryCov_9fa48("82312", "82313", "82314"), c.expression.column || c.expression.name);
                  return c.alias ? stryMutAct_9fa48("82315") ? `` : (stryCov_9fa48("82315"), `${col} AS ${c.alias}`) : col;
                }
              }
              return LIVE_QUERY_SQL.STAR;
            }
          });
          parts.push(cols.join(stryMutAct_9fa48("82316") ? "" : (stryCov_9fa48("82316"), ', ')));
        }
      } else {
        if (stryMutAct_9fa48("82317")) {
          {}
        } else {
          stryCov_9fa48("82317");
          parts.push(LIVE_QUERY_SQL.STAR);
        }
      }

      // FROM
      parts.push(LIVE_QUERY_SQL.FROM, stryMutAct_9fa48("82320") ? parsedQuery.from?.name && LIVE_QUERY_DEFAULT_VALUE.UNKNOWN : stryMutAct_9fa48("82319") ? false : stryMutAct_9fa48("82318") ? true : (stryCov_9fa48("82318", "82319", "82320"), (stryMutAct_9fa48("82321") ? parsedQuery.from.name : (stryCov_9fa48("82321"), parsedQuery.from?.name)) || LIVE_QUERY_DEFAULT_VALUE.UNKNOWN));

      // WHERE (simplified - would need full AST to SQL conversion)
      // For now, we rely on the original SQL being available

      return parts.join(stryMutAct_9fa48("82322") ? "" : (stryCov_9fa48("82322"), ' '));
    }
  }

  /**
   * Renew a live query subscription.
   * @param {string} queryId - Query ID.
   * @param {string} clientId - Client ID.
   * @param {string} cursor - Last seen HLC timestamp.
   * @return {Object|null} Renewal result or null.
   */
  renewLiveQuery(queryId, clientId, cursor) {
    if (stryMutAct_9fa48("82323")) {
      {}
    } else {
      stryCov_9fa48("82323");
      const group = this.findGroupByQueryId(queryId);
      if (stryMutAct_9fa48("82326") ? false : stryMutAct_9fa48("82325") ? true : stryMutAct_9fa48("82324") ? group : (stryCov_9fa48("82324", "82325", "82326"), !group)) {
        if (stryMutAct_9fa48("82327")) {
          {}
        } else {
          stryCov_9fa48("82327");
          return null;
        }
      }
      const result = group.renewClient(clientId, cursor);
      if (stryMutAct_9fa48("82329") ? false : stryMutAct_9fa48("82328") ? true : (stryCov_9fa48("82328", "82329"), result)) {
        if (stryMutAct_9fa48("82330")) {
          {}
        } else {
          stryCov_9fa48("82330");
          this.logger.debug(LIVE_QUERY_LOG_MSG.QUERY_RENEWED, stryMutAct_9fa48("82331") ? {} : (stryCov_9fa48("82331"), {
            queryId,
            clientId,
            cursor
          }));
          this.emit(LIVE_QUERY_EMIT.SUBSCRIPTION_RENEWED, stryMutAct_9fa48("82332") ? {} : (stryCov_9fa48("82332"), {
            queryId,
            clientId,
            cursor
          }));
        }
      }
      return result;
    }
  }

  /**
   * Resume a live query from cursor position.
   * @param {string} queryId - Query ID.
   * @param {string} clientId - Client ID.
   * @param {string} cursor - HLC cursor to resume from.
   * @return {Promise<Object>} Resume result.
   */
  async resumeLiveQuery(queryId, clientId, cursor) {
    if (stryMutAct_9fa48("82333")) {
      {}
    } else {
      stryCov_9fa48("82333");
      const group = this.findGroupByQueryId(queryId);
      if (stryMutAct_9fa48("82336") ? false : stryMutAct_9fa48("82335") ? true : stryMutAct_9fa48("82334") ? group : (stryCov_9fa48("82334", "82335", "82336"), !group)) {
        if (stryMutAct_9fa48("82337")) {
          {}
        } else {
          stryCov_9fa48("82337");
          throw new Error(stryMutAct_9fa48("82338") ? `` : (stryCov_9fa48("82338"), `${LIVE_QUERY_ERROR_MSG.QUERY_GROUP_NOT_FOUND_PREFIX}${queryId}`));
        }
      }

      // Validate cursor is within retention window
      const cursorTime = this.parseCursorTime(cursor);
      const oldestAllowed = stryMutAct_9fa48("82339") ? Date.now() + this.cursorRetentionMs : (stryCov_9fa48("82339"), Date.now() - this.cursorRetentionMs);
      if (stryMutAct_9fa48("82343") ? cursorTime >= oldestAllowed : stryMutAct_9fa48("82342") ? cursorTime <= oldestAllowed : stryMutAct_9fa48("82341") ? false : stryMutAct_9fa48("82340") ? true : (stryCov_9fa48("82340", "82341", "82342", "82343"), cursorTime < oldestAllowed)) {
        if (stryMutAct_9fa48("82344")) {
          {}
        } else {
          stryCov_9fa48("82344");
          throw new Error(LIVE_QUERY_ERROR_MSG.CURSOR_TOO_OLD);
        }
      }

      // Re-add client to group
      const client = stryMutAct_9fa48("82345") ? {} : (stryCov_9fa48("82345"), {
        id: clientId
      });
      group.addClient(client);

      // Track subscription
      if (stryMutAct_9fa48("82348") ? false : stryMutAct_9fa48("82347") ? true : stryMutAct_9fa48("82346") ? this.clientSubscriptions.has(clientId) : (stryCov_9fa48("82346", "82347", "82348"), !this.clientSubscriptions.has(clientId))) {
        if (stryMutAct_9fa48("82349")) {
          {}
        } else {
          stryCov_9fa48("82349");
          this.clientSubscriptions.set(clientId, new Set());
        }
      }
      this.clientSubscriptions.get(clientId).add(queryId);

      // Update query count
      const currentCount = stryMutAct_9fa48("82352") ? this.clientQueryCounts.get(clientId) && 0 : stryMutAct_9fa48("82351") ? false : stryMutAct_9fa48("82350") ? true : (stryCov_9fa48("82350", "82351", "82352"), this.clientQueryCounts.get(clientId) || 0);
      this.clientQueryCounts.set(clientId, stryMutAct_9fa48("82353") ? currentCount - 1 : (stryCov_9fa48("82353"), currentCount + 1));
      this.logger.info(LIVE_QUERY_LOG_MSG.QUERY_RESUMED, stryMutAct_9fa48("82354") ? {} : (stryCov_9fa48("82354"), {
        queryId,
        clientId,
        cursor
      }));
      return stryMutAct_9fa48("82355") ? {} : (stryCov_9fa48("82355"), {
        queryId,
        resumed: stryMutAct_9fa48("82356") ? false : (stryCov_9fa48("82356"), true),
        fromCursor: cursor,
        expiresAt: stryMutAct_9fa48("82357") ? Date.now() - group.ttlMs : (stryCov_9fa48("82357"), Date.now() + group.ttlMs)
      });
    }
  }

  /**
   * Parse cursor time from HLC string.
   * @param {string} cursor - HLC cursor string.
   * @return {number} Physical time in milliseconds.
   * @private
   */
  parseCursorTime(cursor) {
    if (stryMutAct_9fa48("82358")) {
      {}
    } else {
      stryCov_9fa48("82358");
      if (stryMutAct_9fa48("82361") ? false : stryMutAct_9fa48("82360") ? true : stryMutAct_9fa48("82359") ? cursor : (stryCov_9fa48("82359", "82360", "82361"), !cursor)) return 0;

      // HLC format: "physical:logical:nodeId" or just timestamp
      const parts = cursor.split(LIVE_QUERY_CURSOR.SEPARATOR);
      const physical = parseInt(parts[0], 10);
      return isNaN(physical) ? 0 : physical;
    }
  }

  /**
   * Unregister a live query for a client.
   * @param {string} queryId - Query ID.
   * @param {string} clientId - Client ID.
   */
  unregisterLiveQuery(queryId, clientId) {
    if (stryMutAct_9fa48("82362")) {
      {}
    } else {
      stryCov_9fa48("82362");
      const group = this.findGroupByQueryId(queryId);
      if (stryMutAct_9fa48("82365") ? false : stryMutAct_9fa48("82364") ? true : stryMutAct_9fa48("82363") ? group : (stryCov_9fa48("82363", "82364", "82365"), !group)) return;
      const shouldRemove = group.removeClient(clientId);

      // Update tracking
      const subscriptions = this.clientSubscriptions.get(clientId);
      if (stryMutAct_9fa48("82367") ? false : stryMutAct_9fa48("82366") ? true : (stryCov_9fa48("82366", "82367"), subscriptions)) {
        if (stryMutAct_9fa48("82368")) {
          {}
        } else {
          stryCov_9fa48("82368");
          subscriptions.delete(queryId);
          if (stryMutAct_9fa48("82371") ? subscriptions.size !== 0 : stryMutAct_9fa48("82370") ? false : stryMutAct_9fa48("82369") ? true : (stryCov_9fa48("82369", "82370", "82371"), subscriptions.size === 0)) {
            if (stryMutAct_9fa48("82372")) {
              {}
            } else {
              stryCov_9fa48("82372");
              this.clientSubscriptions.delete(clientId);
            }
          }
        }
      }

      // Update query count
      const currentCount = stryMutAct_9fa48("82375") ? this.clientQueryCounts.get(clientId) && 0 : stryMutAct_9fa48("82374") ? false : stryMutAct_9fa48("82373") ? true : (stryCov_9fa48("82373", "82374", "82375"), this.clientQueryCounts.get(clientId) || 0);
      if (stryMutAct_9fa48("82379") ? currentCount <= 0 : stryMutAct_9fa48("82378") ? currentCount >= 0 : stryMutAct_9fa48("82377") ? false : stryMutAct_9fa48("82376") ? true : (stryCov_9fa48("82376", "82377", "82378", "82379"), currentCount > 0)) {
        if (stryMutAct_9fa48("82380")) {
          {}
        } else {
          stryCov_9fa48("82380");
          this.clientQueryCounts.set(clientId, stryMutAct_9fa48("82381") ? currentCount + 1 : (stryCov_9fa48("82381"), currentCount - 1));
        }
      }

      // Remove empty group
      if (stryMutAct_9fa48("82383") ? false : stryMutAct_9fa48("82382") ? true : (stryCov_9fa48("82382", "82383"), shouldRemove)) {
        if (stryMutAct_9fa48("82384")) {
          {}
        } else {
          stryCov_9fa48("82384");
          this.removeGroup(group);
        }
      }
      this.logger.info(LIVE_QUERY_LOG_MSG.QUERY_UNREGISTERED, stryMutAct_9fa48("82385") ? {} : (stryCov_9fa48("82385"), {
        queryId,
        clientId,
        groupRemoved: shouldRemove
      }));
      this.emit(LIVE_QUERY_EMIT.SUBSCRIPTION_REMOVED, stryMutAct_9fa48("82386") ? {} : (stryCov_9fa48("82386"), {
        queryId,
        clientId
      }));
    }
  }

  /**
   * Find a query group by query ID.
   * @param {string} queryId - Query ID.
   * @return {QueryGroup|null} Query group or null.
   */
  findGroupByQueryId(queryId) {
    if (stryMutAct_9fa48("82387")) {
      {}
    } else {
      stryCov_9fa48("82387");
      for (const group of this.queryGroups.values()) {
        if (stryMutAct_9fa48("82388")) {
          {}
        } else {
          stryCov_9fa48("82388");
          if (stryMutAct_9fa48("82391") ? group.queryId !== queryId : stryMutAct_9fa48("82390") ? false : stryMutAct_9fa48("82389") ? true : (stryCov_9fa48("82389", "82390", "82391"), group.queryId === queryId)) {
            if (stryMutAct_9fa48("82392")) {
              {}
            } else {
              stryCov_9fa48("82392");
              return group;
            }
          }
        }
      }
      return null;
    }
  }

  /**
   * Remove a query group.
   * @param {QueryGroup} group - Query group to remove.
   * @private
   */
  removeGroup(group) {
    if (stryMutAct_9fa48("82393")) {
      {}
    } else {
      stryCov_9fa48("82393");
      const groupKey = group.getQuerySignature();
      group.cleanup();
      this.queryGroups.delete(groupKey);
      this.logger.info(LIVE_QUERY_LOG_MSG.GROUP_REMOVED, stryMutAct_9fa48("82394") ? {} : (stryCov_9fa48("82394"), {
        queryId: group.queryId,
        groupKey
      }));
    }
  }

  /**
   * Handle client disconnection.
   * @param {string} clientId - Client ID.
   */
  handleClientDisconnection(clientId) {
    if (stryMutAct_9fa48("82395")) {
      {}
    } else {
      stryCov_9fa48("82395");
      this.removeAllClientSubscriptions(clientId);
      this.logger.info(LIVE_QUERY_LOG_MSG.CLIENT_DISCONNECTED_CLEANUP, stryMutAct_9fa48("82396") ? {} : (stryCov_9fa48("82396"), {
        clientId
      }));
    }
  }

  /**
   * Remove all subscriptions for a client.
   * @param {string} clientId - Client ID.
   */
  removeAllClientSubscriptions(clientId) {
    if (stryMutAct_9fa48("82397")) {
      {}
    } else {
      stryCov_9fa48("82397");
      const subscriptions = this.clientSubscriptions.get(clientId);
      if (stryMutAct_9fa48("82399") ? false : stryMutAct_9fa48("82398") ? true : (stryCov_9fa48("82398", "82399"), subscriptions)) {
        if (stryMutAct_9fa48("82400")) {
          {}
        } else {
          stryCov_9fa48("82400");
          for (const queryId of subscriptions) {
            if (stryMutAct_9fa48("82401")) {
              {}
            } else {
              stryCov_9fa48("82401");
              const group = this.findGroupByQueryId(queryId);
              if (stryMutAct_9fa48("82403") ? false : stryMutAct_9fa48("82402") ? true : (stryCov_9fa48("82402", "82403"), group)) {
                if (stryMutAct_9fa48("82404")) {
                  {}
                } else {
                  stryCov_9fa48("82404");
                  const shouldRemove = group.removeClient(clientId);
                  if (stryMutAct_9fa48("82406") ? false : stryMutAct_9fa48("82405") ? true : (stryCov_9fa48("82405", "82406"), shouldRemove)) {
                    if (stryMutAct_9fa48("82407")) {
                      {}
                    } else {
                      stryCov_9fa48("82407");
                      this.removeGroup(group);
                    }
                  }
                }
              }
            }
          }
          this.clientSubscriptions.delete(clientId);
        }
      }
      this.clientQueryCounts.delete(clientId);
    }
  }

  /**
   * Handle partition topology change (split/merge).
   * @param {Object} change - Partition CDC change event.
   */
  async handlePartitionTopologyChange(change) {
    if (stryMutAct_9fa48("82408")) {
      {}
    } else {
      stryCov_9fa48("82408");
      const tableName = stryMutAct_9fa48("82411") ? change.new?.table_name && change.old?.table_name : stryMutAct_9fa48("82410") ? false : stryMutAct_9fa48("82409") ? true : (stryCov_9fa48("82409", "82410", "82411"), (stryMutAct_9fa48("82412") ? change.new.table_name : (stryCov_9fa48("82412"), change.new?.table_name)) || (stryMutAct_9fa48("82413") ? change.old.table_name : (stryCov_9fa48("82413"), change.old?.table_name)));

      // Find all groups for this table
      for (const group of this.queryGroups.values()) {
        if (stryMutAct_9fa48("82414")) {
          {}
        } else {
          stryCov_9fa48("82414");
          if (stryMutAct_9fa48("82417") ? group.table !== tableName : stryMutAct_9fa48("82416") ? false : stryMutAct_9fa48("82415") ? true : (stryCov_9fa48("82415", "82416", "82417"), group.table === tableName)) {
            if (stryMutAct_9fa48("82418")) {
              {}
            } else {
              stryCov_9fa48("82418");
              this.logger.info(LIVE_QUERY_LOG_MSG.SUBSCRIPTIONS_PARTITION_CHANGE, stryMutAct_9fa48("82419") ? {} : (stryCov_9fa48("82419"), {
                queryId: group.queryId,
                table: tableName,
                operation: change.operation
              }));
              await group.updatePartitionSubscriptions(this.subscribeToPartition, this.unsubscribeFromPartition);
            }
          }
        }
      }
    }
  }

  /**
   * Start the cleanup loop for expired subscriptions.
   * @private
   */
  startCleanupLoop() {
    if (stryMutAct_9fa48("82420")) {
      {}
    } else {
      stryCov_9fa48("82420");
      if (stryMutAct_9fa48("82422") ? false : stryMutAct_9fa48("82421") ? true : (stryCov_9fa48("82421", "82422"), this.cleanupInterval)) {
        if (stryMutAct_9fa48("82423")) {
          {}
        } else {
          stryCov_9fa48("82423");
          clearInterval(this.cleanupInterval);
        }
      }
      this.cleanupInterval = setInterval(() => {
        if (stryMutAct_9fa48("82424")) {
          {}
        } else {
          stryCov_9fa48("82424");
          this.cleanupExpiredSubscriptions();
        }
      }, this.cleanupIntervalMs);
      this.cleanupInterval.unref();
    }
  }

  /**
   * Clean up expired subscriptions.
   * @private
   */
  cleanupExpiredSubscriptions() {
    if (stryMutAct_9fa48("82425")) {
      {}
    } else {
      stryCov_9fa48("82425");
      for (const [groupKey, group] of this.queryGroups) {
        if (stryMutAct_9fa48("82426")) {
          {}
        } else {
          stryCov_9fa48("82426");
          const expiredClients = group.getExpiredClients();
          for (const clientId of expiredClients) {
            if (stryMutAct_9fa48("82427")) {
              {}
            } else {
              stryCov_9fa48("82427");
              group.removeClient(clientId);

              // Update tracking
              const subscriptions = this.clientSubscriptions.get(clientId);
              if (stryMutAct_9fa48("82429") ? false : stryMutAct_9fa48("82428") ? true : (stryCov_9fa48("82428", "82429"), subscriptions)) {
                if (stryMutAct_9fa48("82430")) {
                  {}
                } else {
                  stryCov_9fa48("82430");
                  subscriptions.delete(group.queryId);
                  if (stryMutAct_9fa48("82433") ? subscriptions.size !== 0 : stryMutAct_9fa48("82432") ? false : stryMutAct_9fa48("82431") ? true : (stryCov_9fa48("82431", "82432", "82433"), subscriptions.size === 0)) {
                    if (stryMutAct_9fa48("82434")) {
                      {}
                    } else {
                      stryCov_9fa48("82434");
                      this.clientSubscriptions.delete(clientId);
                    }
                  }
                }
              }
              const currentCount = stryMutAct_9fa48("82437") ? this.clientQueryCounts.get(clientId) && 0 : stryMutAct_9fa48("82436") ? false : stryMutAct_9fa48("82435") ? true : (stryCov_9fa48("82435", "82436", "82437"), this.clientQueryCounts.get(clientId) || 0);
              if (stryMutAct_9fa48("82441") ? currentCount <= 0 : stryMutAct_9fa48("82440") ? currentCount >= 0 : stryMutAct_9fa48("82439") ? false : stryMutAct_9fa48("82438") ? true : (stryCov_9fa48("82438", "82439", "82440", "82441"), currentCount > 0)) {
                if (stryMutAct_9fa48("82442")) {
                  {}
                } else {
                  stryCov_9fa48("82442");
                  this.clientQueryCounts.set(clientId, stryMutAct_9fa48("82443") ? currentCount + 1 : (stryCov_9fa48("82443"), currentCount - 1));
                }
              }
              this.logger.info(LIVE_QUERY_LOG_MSG.SUBSCRIPTION_EXPIRED, stryMutAct_9fa48("82444") ? {} : (stryCov_9fa48("82444"), {
                queryId: group.queryId,
                clientId
              }));
              this.emit(LIVE_QUERY_EMIT.SUBSCRIPTION_EXPIRED, stryMutAct_9fa48("82445") ? {} : (stryCov_9fa48("82445"), {
                queryId: group.queryId,
                clientId
              }));
            }
          }

          // Remove empty groups
          if (stryMutAct_9fa48("82448") ? group.clients.size !== 0 : stryMutAct_9fa48("82447") ? false : stryMutAct_9fa48("82446") ? true : (stryCov_9fa48("82446", "82447", "82448"), group.clients.size === 0)) {
            if (stryMutAct_9fa48("82449")) {
              {}
            } else {
              stryCov_9fa48("82449");
              this.removeGroup(group);
              this.queryGroups.delete(groupKey);
            }
          }
        }
      }
    }
  }

  /**
   * Get all live queries for monitoring.
   * @return {Array} Array of query metadata.
   */
  getAllQueries() {
    if (stryMutAct_9fa48("82450")) {
      {}
    } else {
      stryCov_9fa48("82450");
      const queries = stryMutAct_9fa48("82451") ? ["Stryker was here"] : (stryCov_9fa48("82451"), []);
      for (const group of this.queryGroups.values()) {
        if (stryMutAct_9fa48("82452")) {
          {}
        } else {
          stryCov_9fa48("82452");
          queries.push(group.getMetadata());
        }
      }
      return queries;
    }
  }

  /**
   * Get statistics.
   * @return {Object} Manager statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("82453")) {
      {}
    } else {
      stryCov_9fa48("82453");
      let totalClients = 0;
      for (const group of this.queryGroups.values()) {
        if (stryMutAct_9fa48("82454")) {
          {}
        } else {
          stryCov_9fa48("82454");
          stryMutAct_9fa48("82455") ? totalClients -= group.clients.size : (stryCov_9fa48("82455"), totalClients += group.clients.size);
        }
      }
      return stryMutAct_9fa48("82456") ? {} : (stryCov_9fa48("82456"), {
        queryGroupCount: this.queryGroups.size,
        totalClientSubscriptions: totalClients,
        uniqueClients: this.clientSubscriptions.size
      });
    }
  }

  /**
   * Check if manager is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("82457")) {
      {}
    } else {
      stryCov_9fa48("82457");
      return this.initialized;
    }
  }

  /**
   * Shutdown the manager.
   */
  shutdown() {
    if (stryMutAct_9fa48("82458")) {
      {}
    } else {
      stryCov_9fa48("82458");
      if (stryMutAct_9fa48("82460") ? false : stryMutAct_9fa48("82459") ? true : (stryCov_9fa48("82459", "82460"), this.cleanupInterval)) {
        if (stryMutAct_9fa48("82461")) {
          {}
        } else {
          stryCov_9fa48("82461");
          clearInterval(this.cleanupInterval);
          this.cleanupInterval = null;
        }
      }

      // Clean up all groups
      for (const group of this.queryGroups.values()) {
        if (stryMutAct_9fa48("82462")) {
          {}
        } else {
          stryCov_9fa48("82462");
          group.cleanup();
        }
      }
      this.queryGroups.clear();
      this.clientSubscriptions.clear();
      this.clientQueryCounts.clear();
      this.initialized = stryMutAct_9fa48("82463") ? true : (stryCov_9fa48("82463"), false);
      this.removeAllListeners();
      this.logger.info(LIVE_QUERY_LOG_MSG.MANAGER_SHUTDOWN, stryMutAct_9fa48("82464") ? {} : (stryCov_9fa48("82464"), {
        nodeId: this.nodeId
      }));
    }
  }
}
export { LiveQueryManager, QueryGroup };