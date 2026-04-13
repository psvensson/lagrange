/**
 * Live query startup wiring helpers.
 *
 * Creates one startup-owned live query manager path for both seed and joining
 * nodes, and wires cache CDC notifications into registered live subscriptions.
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
import { CDC_OPERATION, TABLES, TYPEOF } from '../constants/index.js';
import { LiveQueryManager } from './live-query-manager.js';
import { LIVE_QUERY_SUBSYSTEM } from './live-query-constants.js';
const PARTITION_ID_FIELD = stryMutAct_9fa48("82784") ? "" : (stryCov_9fa48("82784"), 'partition_id');
const TABLE_NAME_FIELD = stryMutAct_9fa48("82785") ? "" : (stryCov_9fa48("82785"), 'table_name');
const CHANGE_DATA_FIELD = stryMutAct_9fa48("82786") ? "" : (stryCov_9fa48("82786"), 'data');
const CHANGE_OLD_DATA_FIELD = stryMutAct_9fa48("82787") ? "" : (stryCov_9fa48("82787"), 'old_data');
const CHANGE_NEW_FIELD = stryMutAct_9fa48("82788") ? "" : (stryCov_9fa48("82788"), 'new');
const CHANGE_OLD_FIELD = stryMutAct_9fa48("82789") ? "" : (stryCov_9fa48("82789"), 'old');
const CHANGE_OPERATION_FIELD = stryMutAct_9fa48("82790") ? "" : (stryCov_9fa48("82790"), 'operation');
const CHANGE_HLC_FIELD = stryMutAct_9fa48("82791") ? "" : (stryCov_9fa48("82791"), 'hlc_timestamp');
const LOG_MSG_PARTITION_HANDLER_FAILED = stryMutAct_9fa48("82792") ? "" : (stryCov_9fa48("82792"), 'Live query partition topology update failed');
const LOG_MSG_SUBSCRIPTION_HANDLER_FAILED = stryMutAct_9fa48("82793") ? "" : (stryCov_9fa48("82793"), 'Live query cache subscription handler failed');

/**
 * Resolve one partition row by partition id.
 * @param {Object|null} systemTableCache
 * @param {string} partitionId
 * @return {Object|null}
 */
function resolvePartitionRow(systemTableCache, partitionId) {
  if (stryMutAct_9fa48("82794")) {
    {}
  } else {
    stryCov_9fa48("82794");
    if (stryMutAct_9fa48("82797") ? !systemTableCache && !partitionId : stryMutAct_9fa48("82796") ? false : stryMutAct_9fa48("82795") ? true : (stryCov_9fa48("82795", "82796", "82797"), (stryMutAct_9fa48("82798") ? systemTableCache : (stryCov_9fa48("82798"), !systemTableCache)) || (stryMutAct_9fa48("82799") ? partitionId : (stryCov_9fa48("82799"), !partitionId)))) {
      if (stryMutAct_9fa48("82800")) {
        {}
      } else {
        stryCov_9fa48("82800");
        return null;
      }
    }
    if (stryMutAct_9fa48("82803") ? typeof systemTableCache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("82802") ? false : stryMutAct_9fa48("82801") ? true : (stryCov_9fa48("82801", "82802", "82803"), typeof systemTableCache.get === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("82804")) {
        {}
      } else {
        stryCov_9fa48("82804");
        const direct = systemTableCache.get(TABLES.PARTITIONS, partitionId);
        if (stryMutAct_9fa48("82806") ? false : stryMutAct_9fa48("82805") ? true : (stryCov_9fa48("82805", "82806"), direct)) {
          if (stryMutAct_9fa48("82807")) {
            {}
          } else {
            stryCov_9fa48("82807");
            return direct;
          }
        }
      }
    }
    if (stryMutAct_9fa48("82810") ? typeof systemTableCache.find === TYPEOF.FUNCTION : stryMutAct_9fa48("82809") ? false : stryMutAct_9fa48("82808") ? true : (stryCov_9fa48("82808", "82809", "82810"), typeof systemTableCache.find !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("82811")) {
        {}
      } else {
        stryCov_9fa48("82811");
        return null;
      }
    }
    return stryMutAct_9fa48("82814") ? systemTableCache.find(TABLES.PARTITIONS, partition => {
      return partition?.[PARTITION_ID_FIELD] === partitionId;
    }) && null : stryMutAct_9fa48("82813") ? false : stryMutAct_9fa48("82812") ? true : (stryCov_9fa48("82812", "82813", "82814"), systemTableCache.find(TABLES.PARTITIONS, partition => {
      if (stryMutAct_9fa48("82815")) {
        {}
      } else {
        stryCov_9fa48("82815");
        return stryMutAct_9fa48("82818") ? partition?.[PARTITION_ID_FIELD] !== partitionId : stryMutAct_9fa48("82817") ? false : stryMutAct_9fa48("82816") ? true : (stryCov_9fa48("82816", "82817", "82818"), (stryMutAct_9fa48("82819") ? partition[PARTITION_ID_FIELD] : (stryCov_9fa48("82819"), partition?.[PARTITION_ID_FIELD])) === partitionId);
      }
    }) || null);
  }
}

/**
 * Resolve partition table name from cache.
 * @param {Object|null} systemTableCache
 * @param {string} partitionId
 * @return {string|null}
 */
function resolvePartitionTableName(systemTableCache, partitionId) {
  if (stryMutAct_9fa48("82820")) {
    {}
  } else {
    stryCov_9fa48("82820");
    const partition = resolvePartitionRow(systemTableCache, partitionId);
    if (stryMutAct_9fa48("82823") ? false : stryMutAct_9fa48("82822") ? true : stryMutAct_9fa48("82821") ? partition : (stryCov_9fa48("82821", "82822", "82823"), !partition)) {
      if (stryMutAct_9fa48("82824")) {
        {}
      } else {
        stryCov_9fa48("82824");
        return null;
      }
    }
    return stryMutAct_9fa48("82827") ? partition[TABLE_NAME_FIELD] && null : stryMutAct_9fa48("82826") ? false : stryMutAct_9fa48("82825") ? true : (stryCov_9fa48("82825", "82826", "82827"), partition[TABLE_NAME_FIELD] || null);
  }
}

/**
 * Convert cache change payload into live query change shape.
 * @param {string} operation
 * @param {Object|null} record
 * @return {Object|null}
 */
function buildLiveQueryChange(operation, record) {
  if (stryMutAct_9fa48("82828")) {
    {}
  } else {
    stryCov_9fa48("82828");
    const normalizedOperation = stryMutAct_9fa48("82829") ? String(operation || '').toLowerCase() : (stryCov_9fa48("82829"), String(stryMutAct_9fa48("82832") ? operation && '' : stryMutAct_9fa48("82831") ? false : stryMutAct_9fa48("82830") ? true : (stryCov_9fa48("82830", "82831", "82832"), operation || (stryMutAct_9fa48("82833") ? "Stryker was here!" : (stryCov_9fa48("82833"), '')))).toUpperCase());
    if (stryMutAct_9fa48("82836") ? false : stryMutAct_9fa48("82835") ? true : stryMutAct_9fa48("82834") ? record : (stryCov_9fa48("82834", "82835", "82836"), !record)) {
      if (stryMutAct_9fa48("82837")) {
        {}
      } else {
        stryCov_9fa48("82837");
        return null;
      }
    }
    if (stryMutAct_9fa48("82840") ? normalizedOperation !== CDC_OPERATION.DELETE : stryMutAct_9fa48("82839") ? false : stryMutAct_9fa48("82838") ? true : (stryCov_9fa48("82838", "82839", "82840"), normalizedOperation === CDC_OPERATION.DELETE)) {
      if (stryMutAct_9fa48("82841")) {
        {}
      } else {
        stryCov_9fa48("82841");
        return stryMutAct_9fa48("82842") ? {} : (stryCov_9fa48("82842"), {
          [CHANGE_OPERATION_FIELD]: normalizedOperation,
          [CHANGE_DATA_FIELD]: null,
          [CHANGE_OLD_DATA_FIELD]: record,
          [CHANGE_HLC_FIELD]: stryMutAct_9fa48("82845") ? record[CHANGE_HLC_FIELD] && null : stryMutAct_9fa48("82844") ? false : stryMutAct_9fa48("82843") ? true : (stryCov_9fa48("82843", "82844", "82845"), record[CHANGE_HLC_FIELD] || null)
        });
      }
    }
    if (stryMutAct_9fa48("82848") ? normalizedOperation !== CDC_OPERATION.INSERT : stryMutAct_9fa48("82847") ? false : stryMutAct_9fa48("82846") ? true : (stryCov_9fa48("82846", "82847", "82848"), normalizedOperation === CDC_OPERATION.INSERT)) {
      if (stryMutAct_9fa48("82849")) {
        {}
      } else {
        stryCov_9fa48("82849");
        return stryMutAct_9fa48("82850") ? {} : (stryCov_9fa48("82850"), {
          [CHANGE_OPERATION_FIELD]: normalizedOperation,
          [CHANGE_DATA_FIELD]: record,
          [CHANGE_OLD_DATA_FIELD]: null,
          [CHANGE_HLC_FIELD]: stryMutAct_9fa48("82853") ? record[CHANGE_HLC_FIELD] && null : stryMutAct_9fa48("82852") ? false : stryMutAct_9fa48("82851") ? true : (stryCov_9fa48("82851", "82852", "82853"), record[CHANGE_HLC_FIELD] || null)
        });
      }
    }
    if (stryMutAct_9fa48("82856") ? normalizedOperation === CDC_OPERATION.UPDATE && normalizedOperation === CDC_OPERATION.UPSERT : stryMutAct_9fa48("82855") ? false : stryMutAct_9fa48("82854") ? true : (stryCov_9fa48("82854", "82855", "82856"), (stryMutAct_9fa48("82858") ? normalizedOperation !== CDC_OPERATION.UPDATE : stryMutAct_9fa48("82857") ? false : (stryCov_9fa48("82857", "82858"), normalizedOperation === CDC_OPERATION.UPDATE)) || (stryMutAct_9fa48("82860") ? normalizedOperation !== CDC_OPERATION.UPSERT : stryMutAct_9fa48("82859") ? false : (stryCov_9fa48("82859", "82860"), normalizedOperation === CDC_OPERATION.UPSERT)))) {
      if (stryMutAct_9fa48("82861")) {
        {}
      } else {
        stryCov_9fa48("82861");
        return stryMutAct_9fa48("82862") ? {} : (stryCov_9fa48("82862"), {
          [CHANGE_OPERATION_FIELD]: normalizedOperation,
          [CHANGE_DATA_FIELD]: record,
          [CHANGE_OLD_DATA_FIELD]: record,
          [CHANGE_HLC_FIELD]: stryMutAct_9fa48("82865") ? record[CHANGE_HLC_FIELD] && null : stryMutAct_9fa48("82864") ? false : stryMutAct_9fa48("82863") ? true : (stryCov_9fa48("82863", "82864", "82865"), record[CHANGE_HLC_FIELD] || null)
        });
      }
    }
    return null;
  }
}

/**
 * Convert cache partition-row change into topology-change shape.
 * @param {string} operation
 * @param {Object|null} record
 * @return {Object|null}
 */
function buildPartitionTopologyChange(operation, record) {
  if (stryMutAct_9fa48("82866")) {
    {}
  } else {
    stryCov_9fa48("82866");
    const normalizedOperation = stryMutAct_9fa48("82867") ? String(operation || '').toLowerCase() : (stryCov_9fa48("82867"), String(stryMutAct_9fa48("82870") ? operation && '' : stryMutAct_9fa48("82869") ? false : stryMutAct_9fa48("82868") ? true : (stryCov_9fa48("82868", "82869", "82870"), operation || (stryMutAct_9fa48("82871") ? "Stryker was here!" : (stryCov_9fa48("82871"), '')))).toUpperCase());
    if (stryMutAct_9fa48("82874") ? false : stryMutAct_9fa48("82873") ? true : stryMutAct_9fa48("82872") ? record : (stryCov_9fa48("82872", "82873", "82874"), !record)) {
      if (stryMutAct_9fa48("82875")) {
        {}
      } else {
        stryCov_9fa48("82875");
        return null;
      }
    }
    if (stryMutAct_9fa48("82878") ? normalizedOperation !== CDC_OPERATION.DELETE : stryMutAct_9fa48("82877") ? false : stryMutAct_9fa48("82876") ? true : (stryCov_9fa48("82876", "82877", "82878"), normalizedOperation === CDC_OPERATION.DELETE)) {
      if (stryMutAct_9fa48("82879")) {
        {}
      } else {
        stryCov_9fa48("82879");
        return stryMutAct_9fa48("82880") ? {} : (stryCov_9fa48("82880"), {
          [CHANGE_OPERATION_FIELD]: normalizedOperation,
          [CHANGE_OLD_FIELD]: record
        });
      }
    }
    if (stryMutAct_9fa48("82883") ? (normalizedOperation === CDC_OPERATION.INSERT || normalizedOperation === CDC_OPERATION.UPDATE) && normalizedOperation === CDC_OPERATION.UPSERT : stryMutAct_9fa48("82882") ? false : stryMutAct_9fa48("82881") ? true : (stryCov_9fa48("82881", "82882", "82883"), (stryMutAct_9fa48("82885") ? normalizedOperation === CDC_OPERATION.INSERT && normalizedOperation === CDC_OPERATION.UPDATE : stryMutAct_9fa48("82884") ? false : (stryCov_9fa48("82884", "82885"), (stryMutAct_9fa48("82887") ? normalizedOperation !== CDC_OPERATION.INSERT : stryMutAct_9fa48("82886") ? false : (stryCov_9fa48("82886", "82887"), normalizedOperation === CDC_OPERATION.INSERT)) || (stryMutAct_9fa48("82889") ? normalizedOperation !== CDC_OPERATION.UPDATE : stryMutAct_9fa48("82888") ? false : (stryCov_9fa48("82888", "82889"), normalizedOperation === CDC_OPERATION.UPDATE)))) || (stryMutAct_9fa48("82891") ? normalizedOperation !== CDC_OPERATION.UPSERT : stryMutAct_9fa48("82890") ? false : (stryCov_9fa48("82890", "82891"), normalizedOperation === CDC_OPERATION.UPSERT)))) {
      if (stryMutAct_9fa48("82892")) {
        {}
      } else {
        stryCov_9fa48("82892");
        return stryMutAct_9fa48("82893") ? {} : (stryCov_9fa48("82893"), {
          [CHANGE_OPERATION_FIELD]: normalizedOperation,
          [CHANGE_NEW_FIELD]: record
        });
      }
    }
    return null;
  }
}

/**
 * Initialize logger for startup wiring.
 * @return {Object}
 */
function initLogger() {
  if (stryMutAct_9fa48("82894")) {
    {}
  } else {
    stryCov_9fa48("82894");
    try {
      if (stryMutAct_9fa48("82895")) {
        {}
      } else {
        stryCov_9fa48("82895");
        const loggingService = LoggingService.getInstance();
        if (stryMutAct_9fa48("82897") ? false : stryMutAct_9fa48("82896") ? true : (stryCov_9fa48("82896", "82897"), loggingService.isInitialized())) {
          if (stryMutAct_9fa48("82898")) {
            {}
          } else {
            stryCov_9fa48("82898");
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
 * Create adapter that bridges cache CDC notifications to live query handlers.
 * @param {Object} [options]
 * @param {Object|null} [options.systemTableCache]
 * @param {Function|null} [options.onPartitionTopologyChange]
 * @return {{
 *   subscribeToPartition: Function,
 *   unsubscribeFromPartition: Function,
 *   shutdown: Function
 * }}
 */
function createLiveQueryCacheSubscriptionAdapter(options = {}) {
  if (stryMutAct_9fa48("82899")) {
    {}
  } else {
    stryCov_9fa48("82899");
    const systemTableCache = stryMutAct_9fa48("82902") ? options.systemTableCache && null : stryMutAct_9fa48("82901") ? false : stryMutAct_9fa48("82900") ? true : (stryCov_9fa48("82900", "82901", "82902"), options.systemTableCache || null);
    const onPartitionTopologyChange = (stryMutAct_9fa48("82905") ? typeof options.onPartitionTopologyChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("82904") ? false : stryMutAct_9fa48("82903") ? true : (stryCov_9fa48("82903", "82904", "82905"), typeof options.onPartitionTopologyChange === TYPEOF.FUNCTION)) ? options.onPartitionTopologyChange : null;
    const logger = initLogger();

    /** @type {Map<string, Map<string, Object>>} */
    const subscriptionsByQueryId = new Map();
    const cacheListener = (tableName, operation, record) => {
      if (stryMutAct_9fa48("82906")) {
        {}
      } else {
        stryCov_9fa48("82906");
        if (stryMutAct_9fa48("82909") ? false : stryMutAct_9fa48("82908") ? true : stryMutAct_9fa48("82907") ? tableName : (stryCov_9fa48("82907", "82908", "82909"), !tableName)) {
          if (stryMutAct_9fa48("82910")) {
            {}
          } else {
            stryCov_9fa48("82910");
            return;
          }
        }
        if (stryMutAct_9fa48("82913") ? tableName === TABLES.PARTITIONS || onPartitionTopologyChange : stryMutAct_9fa48("82912") ? false : stryMutAct_9fa48("82911") ? true : (stryCov_9fa48("82911", "82912", "82913"), (stryMutAct_9fa48("82915") ? tableName !== TABLES.PARTITIONS : stryMutAct_9fa48("82914") ? true : (stryCov_9fa48("82914", "82915"), tableName === TABLES.PARTITIONS)) && onPartitionTopologyChange)) {
          if (stryMutAct_9fa48("82916")) {
            {}
          } else {
            stryCov_9fa48("82916");
            const topologyChange = buildPartitionTopologyChange(operation, record);
            if (stryMutAct_9fa48("82918") ? false : stryMutAct_9fa48("82917") ? true : (stryCov_9fa48("82917", "82918"), topologyChange)) {
              if (stryMutAct_9fa48("82919")) {
                {}
              } else {
                stryCov_9fa48("82919");
                const maybePromise = onPartitionTopologyChange(topologyChange);
                if (stryMutAct_9fa48("82922") ? maybePromise || typeof maybePromise.catch === TYPEOF.FUNCTION : stryMutAct_9fa48("82921") ? false : stryMutAct_9fa48("82920") ? true : (stryCov_9fa48("82920", "82921", "82922"), maybePromise && (stryMutAct_9fa48("82924") ? typeof maybePromise.catch !== TYPEOF.FUNCTION : stryMutAct_9fa48("82923") ? true : (stryCov_9fa48("82923", "82924"), typeof maybePromise.catch === TYPEOF.FUNCTION)))) {
                  if (stryMutAct_9fa48("82925")) {
                    {}
                  } else {
                    stryCov_9fa48("82925");
                    maybePromise.catch(error => {
                      if (stryMutAct_9fa48("82926")) {
                        {}
                      } else {
                        stryCov_9fa48("82926");
                        logger.warn(LOG_MSG_PARTITION_HANDLER_FAILED, stryMutAct_9fa48("82927") ? {} : (stryCov_9fa48("82927"), {
                          error: error.message
                        }));
                      }
                    });
                  }
                }
              }
            }
          }
        }
        const change = buildLiveQueryChange(operation, record);
        if (stryMutAct_9fa48("82930") ? false : stryMutAct_9fa48("82929") ? true : stryMutAct_9fa48("82928") ? change : (stryCov_9fa48("82928", "82929", "82930"), !change)) {
          if (stryMutAct_9fa48("82931")) {
            {}
          } else {
            stryCov_9fa48("82931");
            return;
          }
        }
        for (const querySubscriptions of subscriptionsByQueryId.values()) {
          if (stryMutAct_9fa48("82932")) {
            {}
          } else {
            stryCov_9fa48("82932");
            let selectedSubscription = null;
            for (const subscription of querySubscriptions.values()) {
              if (stryMutAct_9fa48("82933")) {
                {}
              } else {
                stryCov_9fa48("82933");
                const knownTableName = stryMutAct_9fa48("82936") ? subscription.tableName && resolvePartitionTableName(systemTableCache, subscription.partitionId) : stryMutAct_9fa48("82935") ? false : stryMutAct_9fa48("82934") ? true : (stryCov_9fa48("82934", "82935", "82936"), subscription.tableName || resolvePartitionTableName(systemTableCache, subscription.partitionId));
                if (stryMutAct_9fa48("82939") ? false : stryMutAct_9fa48("82938") ? true : stryMutAct_9fa48("82937") ? knownTableName : (stryCov_9fa48("82937", "82938", "82939"), !knownTableName)) {
                  if (stryMutAct_9fa48("82940")) {
                    {}
                  } else {
                    stryCov_9fa48("82940");
                    continue;
                  }
                }
                if (stryMutAct_9fa48("82943") ? false : stryMutAct_9fa48("82942") ? true : stryMutAct_9fa48("82941") ? subscription.tableName : (stryCov_9fa48("82941", "82942", "82943"), !subscription.tableName)) {
                  if (stryMutAct_9fa48("82944")) {
                    {}
                  } else {
                    stryCov_9fa48("82944");
                    subscription.tableName = knownTableName;
                  }
                }
                if (stryMutAct_9fa48("82947") ? knownTableName === tableName : stryMutAct_9fa48("82946") ? false : stryMutAct_9fa48("82945") ? true : (stryCov_9fa48("82945", "82946", "82947"), knownTableName !== tableName)) {
                  if (stryMutAct_9fa48("82948")) {
                    {}
                  } else {
                    stryCov_9fa48("82948");
                    continue;
                  }
                }
                selectedSubscription = subscription;
                break;
              }
            }
            if (stryMutAct_9fa48("82951") ? false : stryMutAct_9fa48("82950") ? true : stryMutAct_9fa48("82949") ? selectedSubscription : (stryCov_9fa48("82949", "82950", "82951"), !selectedSubscription)) {
              if (stryMutAct_9fa48("82952")) {
                {}
              } else {
                stryCov_9fa48("82952");
                continue;
              }
            }
            try {
              if (stryMutAct_9fa48("82953")) {
                {}
              } else {
                stryCov_9fa48("82953");
                selectedSubscription.handler(change);
              }
            } catch (error) {
              if (stryMutAct_9fa48("82954")) {
                {}
              } else {
                stryCov_9fa48("82954");
                logger.warn(LOG_MSG_SUBSCRIPTION_HANDLER_FAILED, stryMutAct_9fa48("82955") ? {} : (stryCov_9fa48("82955"), {
                  queryId: selectedSubscription.queryId,
                  partitionId: selectedSubscription.partitionId,
                  error: error.message
                }));
              }
            }
          }
        }
      }
    };
    if (stryMutAct_9fa48("82958") ? systemTableCache || typeof systemTableCache.onCacheChange === TYPEOF.FUNCTION : stryMutAct_9fa48("82957") ? false : stryMutAct_9fa48("82956") ? true : (stryCov_9fa48("82956", "82957", "82958"), systemTableCache && (stryMutAct_9fa48("82960") ? typeof systemTableCache.onCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("82959") ? true : (stryCov_9fa48("82959", "82960"), typeof systemTableCache.onCacheChange === TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("82961")) {
        {}
      } else {
        stryCov_9fa48("82961");
        systemTableCache.onCacheChange(cacheListener);
      }
    }
    const subscribeToPartition = async (partitionId, queryId, handler) => {
      if (stryMutAct_9fa48("82962")) {
        {}
      } else {
        stryCov_9fa48("82962");
        if (stryMutAct_9fa48("82965") ? !queryId && typeof handler !== TYPEOF.FUNCTION : stryMutAct_9fa48("82964") ? false : stryMutAct_9fa48("82963") ? true : (stryCov_9fa48("82963", "82964", "82965"), (stryMutAct_9fa48("82966") ? queryId : (stryCov_9fa48("82966"), !queryId)) || (stryMutAct_9fa48("82968") ? typeof handler === TYPEOF.FUNCTION : stryMutAct_9fa48("82967") ? false : (stryCov_9fa48("82967", "82968"), typeof handler !== TYPEOF.FUNCTION)))) {
          if (stryMutAct_9fa48("82969")) {
            {}
          } else {
            stryCov_9fa48("82969");
            return;
          }
        }
        if (stryMutAct_9fa48("82972") ? false : stryMutAct_9fa48("82971") ? true : stryMutAct_9fa48("82970") ? subscriptionsByQueryId.has(queryId) : (stryCov_9fa48("82970", "82971", "82972"), !subscriptionsByQueryId.has(queryId))) {
          if (stryMutAct_9fa48("82973")) {
            {}
          } else {
            stryCov_9fa48("82973");
            subscriptionsByQueryId.set(queryId, new Map());
          }
        }
        const querySubscriptions = subscriptionsByQueryId.get(queryId);
        querySubscriptions.set(partitionId, stryMutAct_9fa48("82974") ? {} : (stryCov_9fa48("82974"), {
          partitionId,
          queryId,
          tableName: resolvePartitionTableName(systemTableCache, partitionId),
          handler
        }));
      }
    };
    const unsubscribeFromPartition = async (partitionId, queryId) => {
      if (stryMutAct_9fa48("82975")) {
        {}
      } else {
        stryCov_9fa48("82975");
        const querySubscriptions = subscriptionsByQueryId.get(queryId);
        if (stryMutAct_9fa48("82978") ? false : stryMutAct_9fa48("82977") ? true : stryMutAct_9fa48("82976") ? querySubscriptions : (stryCov_9fa48("82976", "82977", "82978"), !querySubscriptions)) {
          if (stryMutAct_9fa48("82979")) {
            {}
          } else {
            stryCov_9fa48("82979");
            return;
          }
        }
        querySubscriptions.delete(partitionId);
        if (stryMutAct_9fa48("82982") ? querySubscriptions.size !== 0 : stryMutAct_9fa48("82981") ? false : stryMutAct_9fa48("82980") ? true : (stryCov_9fa48("82980", "82981", "82982"), querySubscriptions.size === 0)) {
          if (stryMutAct_9fa48("82983")) {
            {}
          } else {
            stryCov_9fa48("82983");
            subscriptionsByQueryId.delete(queryId);
          }
        }
      }
    };
    const shutdown = () => {
      if (stryMutAct_9fa48("82984")) {
        {}
      } else {
        stryCov_9fa48("82984");
        if (stryMutAct_9fa48("82987") ? systemTableCache || typeof systemTableCache.offCacheChange === TYPEOF.FUNCTION : stryMutAct_9fa48("82986") ? false : stryMutAct_9fa48("82985") ? true : (stryCov_9fa48("82985", "82986", "82987"), systemTableCache && (stryMutAct_9fa48("82989") ? typeof systemTableCache.offCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("82988") ? true : (stryCov_9fa48("82988", "82989"), typeof systemTableCache.offCacheChange === TYPEOF.FUNCTION)))) {
          if (stryMutAct_9fa48("82990")) {
            {}
          } else {
            stryCov_9fa48("82990");
            systemTableCache.offCacheChange(cacheListener);
          }
        }
        subscriptionsByQueryId.clear();
      }
    };
    return stryMutAct_9fa48("82991") ? {} : (stryCov_9fa48("82991"), {
      subscribeToPartition,
      unsubscribeFromPartition,
      shutdown
    });
  }
}

/**
 * Create startup-owned live query wiring for one node.
 * @param {Object} [options]
 * @param {string} [options.nodeId]
 * @param {Object|null} [options.systemTableCache]
 * @param {Object|null} [options.sqlQueryEngine]
 * @return {{liveQueryManager: LiveQueryManager, shutdown: Function}}
 */
function createLiveQueryStartupWiring(options = {}) {
  if (stryMutAct_9fa48("82992")) {
    {}
  } else {
    stryCov_9fa48("82992");
    const liveQueryManager = new LiveQueryManager(stryMutAct_9fa48("82993") ? {} : (stryCov_9fa48("82993"), {
      nodeId: options.nodeId,
      systemCache: stryMutAct_9fa48("82996") ? options.systemTableCache && null : stryMutAct_9fa48("82995") ? false : stryMutAct_9fa48("82994") ? true : (stryCov_9fa48("82994", "82995", "82996"), options.systemTableCache || null),
      sqlQueryEngine: stryMutAct_9fa48("82999") ? options.sqlQueryEngine && null : stryMutAct_9fa48("82998") ? false : stryMutAct_9fa48("82997") ? true : (stryCov_9fa48("82997", "82998", "82999"), options.sqlQueryEngine || null)
    }));
    const cacheSubscriptionAdapter = createLiveQueryCacheSubscriptionAdapter(stryMutAct_9fa48("83000") ? {} : (stryCov_9fa48("83000"), {
      systemTableCache: stryMutAct_9fa48("83003") ? options.systemTableCache && null : stryMutAct_9fa48("83002") ? false : stryMutAct_9fa48("83001") ? true : (stryCov_9fa48("83001", "83002", "83003"), options.systemTableCache || null),
      onPartitionTopologyChange: change => {
        if (stryMutAct_9fa48("83004")) {
          {}
        } else {
          stryCov_9fa48("83004");
          return liveQueryManager.handlePartitionTopologyChange(change);
        }
      }
    }));
    liveQueryManager.initialize(stryMutAct_9fa48("83005") ? {} : (stryCov_9fa48("83005"), {
      systemCache: stryMutAct_9fa48("83008") ? options.systemTableCache && null : stryMutAct_9fa48("83007") ? false : stryMutAct_9fa48("83006") ? true : (stryCov_9fa48("83006", "83007", "83008"), options.systemTableCache || null),
      sqlQueryEngine: stryMutAct_9fa48("83011") ? options.sqlQueryEngine && null : stryMutAct_9fa48("83010") ? false : stryMutAct_9fa48("83009") ? true : (stryCov_9fa48("83009", "83010", "83011"), options.sqlQueryEngine || null),
      subscribeToPartition: cacheSubscriptionAdapter.subscribeToPartition,
      unsubscribeFromPartition: cacheSubscriptionAdapter.unsubscribeFromPartition
    }));
    let shutdownCompleted = stryMutAct_9fa48("83012") ? true : (stryCov_9fa48("83012"), false);
    const shutdown = () => {
      if (stryMutAct_9fa48("83013")) {
        {}
      } else {
        stryCov_9fa48("83013");
        if (stryMutAct_9fa48("83015") ? false : stryMutAct_9fa48("83014") ? true : (stryCov_9fa48("83014", "83015"), shutdownCompleted)) {
          if (stryMutAct_9fa48("83016")) {
            {}
          } else {
            stryCov_9fa48("83016");
            return;
          }
        }
        shutdownCompleted = stryMutAct_9fa48("83017") ? false : (stryCov_9fa48("83017"), true);
        cacheSubscriptionAdapter.shutdown();
        liveQueryManager.shutdown();
      }
    };
    return stryMutAct_9fa48("83018") ? {} : (stryCov_9fa48("83018"), {
      liveQueryManager,
      shutdown
    });
  }
}
export { createLiveQueryCacheSubscriptionAdapter, createLiveQueryStartupWiring };