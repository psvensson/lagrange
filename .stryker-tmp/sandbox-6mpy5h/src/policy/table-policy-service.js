/**
 * Table Policy Service - Manages table policies for partition behavior.
 * Stores policies in the tables system table and provides policy retrieval.
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
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
import { NUM, TABLES } from '../constants/index.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { CONTROL_PLANE_MUTATION_OPERATION, CONTROL_PLANE_READ_STRATEGY } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { DEFAULT_MESSAGE_GROUP_POLICY, DEFAULT_TABLE_POLICY, MESSAGE_GROUP_POLICY_FIELD_TYPES, POLICY_DEFAULT, POLICY_ERROR_MSG, POLICY_EVENT, POLICY_FIELD_TYPES, POLICY_LOG_MSG, POLICY_SUBSYSTEM, POLICY_VALUE, TYPEOF } from './policy-constants.js';
import { STORAGE_PLACEMENT_CONSTRAINT } from '../rebalancer/storage-capacity-constants.js';

/**
 * Extract storage-related placement constraints from a constraints
 * object. Returns only the storage capacity keys defined in
 * STORAGE_PLACEMENT_CONSTRAINT.
 * @param {Object} constraints - Full placement constraints.
 * @return {Object} Storage-only constraint values.
 */
function extractStorageConstraints(constraints) {
  if (stryMutAct_9fa48("107930")) {
    {}
  } else {
    stryCov_9fa48("107930");
    const pc = stryMutAct_9fa48("107933") ? constraints && {} : stryMutAct_9fa48("107932") ? false : stryMutAct_9fa48("107931") ? true : (stryCov_9fa48("107931", "107932", "107933"), constraints || {});
    return stryMutAct_9fa48("107934") ? {} : (stryCov_9fa48("107934"), {
      [STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE]: pc[STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE],
      [STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT]: pc[STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT],
      [STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM]: pc[STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM]
    });
  }
}

/**
 * TablePolicyService manages table policies for partition behavior.
 * Policies control splitting thresholds, merging criteria, and replication factors.
 */
class TablePolicyService extends EventEmitter {
  /**
   * Create a new TablePolicyService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("107935")) {
      {}
    } else {
      stryCov_9fa48("107935");
      super();
      this.systemTableCache = stryMutAct_9fa48("107938") ? options.systemTableCache && null : stryMutAct_9fa48("107937") ? false : stryMutAct_9fa48("107936") ? true : (stryCov_9fa48("107936", "107937", "107938"), options.systemTableCache || null);
      this.cdcIntegrationService = stryMutAct_9fa48("107941") ? options.cdcIntegrationService && null : stryMutAct_9fa48("107940") ? false : stryMutAct_9fa48("107939") ? true : (stryCov_9fa48("107939", "107940", "107941"), options.cdcIntegrationService || null);
      this.sqlQueryEngine = stryMutAct_9fa48("107944") ? options.sqlQueryEngine && null : stryMutAct_9fa48("107943") ? false : stryMutAct_9fa48("107942") ? true : (stryCov_9fa48("107942", "107943", "107944"), options.sqlQueryEngine || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("107947") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("107946") ? false : stryMutAct_9fa48("107945") ? true : (stryCov_9fa48("107945", "107946", "107947"), options.controlPlaneSystemTableGateway || null);

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.defaultReplicaCount = stryMutAct_9fa48("107950") ? config.get(CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT) && POLICY_DEFAULT.REPLICA_COUNT : stryMutAct_9fa48("107949") ? false : stryMutAct_9fa48("107948") ? true : (stryCov_9fa48("107948", "107949", "107950"), config.get(CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT) || POLICY_DEFAULT.REPLICA_COUNT);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(POLICY_SUBSYSTEM.TABLE_POLICY) : console;

      // Local policy cache for performance
      this.policyCache = new Map();
      this.cacheTTLMs = stryMutAct_9fa48("107953") ? config.get(CONFIG_KEY.POLICY_CACHE_TTL_MS) && POLICY_DEFAULT.CACHE_TTL_MS : stryMutAct_9fa48("107952") ? false : stryMutAct_9fa48("107951") ? true : (stryCov_9fa48("107951", "107952", "107953"), config.get(CONFIG_KEY.POLICY_CACHE_TTL_MS) || POLICY_DEFAULT.CACHE_TTL_MS);
      this.initialized = stryMutAct_9fa48("107954") ? true : (stryCov_9fa48("107954"), false);
    }
  }

  /**
   * Initialize the table policy service.
   */
  initialize() {
    if (stryMutAct_9fa48("107955")) {
      {}
    } else {
      stryCov_9fa48("107955");
      if (stryMutAct_9fa48("107957") ? false : stryMutAct_9fa48("107956") ? true : (stryCov_9fa48("107956", "107957"), this.initialized)) {
        if (stryMutAct_9fa48("107958")) {
          {}
        } else {
          stryCov_9fa48("107958");
          return;
        }
      }
      this.logger.info(POLICY_LOG_MSG.TABLE_POLICY_INITIALIZED);
      this.initialized = stryMutAct_9fa48("107959") ? false : (stryCov_9fa48("107959"), true);
    }
  }

  /**
   * Get the default table policy.
   * @return {Object} Default policy object.
   */
  getDefaultPolicy() {
    if (stryMutAct_9fa48("107960")) {
      {}
    } else {
      stryCov_9fa48("107960");
      return stryMutAct_9fa48("107961") ? {} : (stryCov_9fa48("107961"), {
        ...DEFAULT_TABLE_POLICY
      });
    }
  }

  /**
   * Lookup one table row from the local system cache.
   * @param {string} tableId - Table ID.
   * @return {Object|null} Cached row when present.
   * @private
   */
  lookupCachedTable(tableId) {
    if (stryMutAct_9fa48("107962")) {
      {}
    } else {
      stryCov_9fa48("107962");
      if (stryMutAct_9fa48("107965") ? !tableId && !this.systemTableCache : stryMutAct_9fa48("107964") ? false : stryMutAct_9fa48("107963") ? true : (stryCov_9fa48("107963", "107964", "107965"), (stryMutAct_9fa48("107966") ? tableId : (stryCov_9fa48("107966"), !tableId)) || (stryMutAct_9fa48("107967") ? this.systemTableCache : (stryCov_9fa48("107967"), !this.systemTableCache)))) {
        if (stryMutAct_9fa48("107968")) {
          {}
        } else {
          stryCov_9fa48("107968");
          return null;
        }
      }
      if (stryMutAct_9fa48("107971") ? typeof this.systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("107970") ? false : stryMutAct_9fa48("107969") ? true : (stryCov_9fa48("107969", "107970", "107971"), typeof this.systemTableCache.filter === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("107972")) {
          {}
        } else {
          stryCov_9fa48("107972");
          const rows = stryMutAct_9fa48("107973") ? this.systemTableCache : (stryCov_9fa48("107973"), this.systemTableCache.filter(TABLES.TABLES, stryMutAct_9fa48("107974") ? () => undefined : (stryCov_9fa48("107974"), table => stryMutAct_9fa48("107977") ? table?.table_id === tableId && table?.tableId === tableId : stryMutAct_9fa48("107976") ? false : stryMutAct_9fa48("107975") ? true : (stryCov_9fa48("107975", "107976", "107977"), (stryMutAct_9fa48("107979") ? table?.table_id !== tableId : stryMutAct_9fa48("107978") ? false : (stryCov_9fa48("107978", "107979"), (stryMutAct_9fa48("107980") ? table.table_id : (stryCov_9fa48("107980"), table?.table_id)) === tableId)) || (stryMutAct_9fa48("107982") ? table?.tableId !== tableId : stryMutAct_9fa48("107981") ? false : (stryCov_9fa48("107981", "107982"), (stryMutAct_9fa48("107983") ? table.tableId : (stryCov_9fa48("107983"), table?.tableId)) === tableId))))));
          return stryMutAct_9fa48("107986") ? rows[0] && null : stryMutAct_9fa48("107985") ? false : stryMutAct_9fa48("107984") ? true : (stryCov_9fa48("107984", "107985", "107986"), rows[0] || null);
        }
      }
      if (stryMutAct_9fa48("107989") ? typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("107988") ? false : stryMutAct_9fa48("107987") ? true : (stryCov_9fa48("107987", "107988", "107989"), typeof this.systemTableCache.getAll === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("107990")) {
          {}
        } else {
          stryCov_9fa48("107990");
          const rows = stryMutAct_9fa48("107993") ? this.systemTableCache.getAll(TABLES.TABLES) && [] : stryMutAct_9fa48("107992") ? false : stryMutAct_9fa48("107991") ? true : (stryCov_9fa48("107991", "107992", "107993"), this.systemTableCache.getAll(TABLES.TABLES) || (stryMutAct_9fa48("107994") ? ["Stryker was here"] : (stryCov_9fa48("107994"), [])));
          return stryMutAct_9fa48("107997") ? rows.find(table => table?.table_id === tableId || table?.tableId === tableId) && null : stryMutAct_9fa48("107996") ? false : stryMutAct_9fa48("107995") ? true : (stryCov_9fa48("107995", "107996", "107997"), rows.find(stryMutAct_9fa48("107998") ? () => undefined : (stryCov_9fa48("107998"), table => stryMutAct_9fa48("108001") ? table?.table_id === tableId && table?.tableId === tableId : stryMutAct_9fa48("108000") ? false : stryMutAct_9fa48("107999") ? true : (stryCov_9fa48("107999", "108000", "108001"), (stryMutAct_9fa48("108003") ? table?.table_id !== tableId : stryMutAct_9fa48("108002") ? false : (stryCov_9fa48("108002", "108003"), (stryMutAct_9fa48("108004") ? table.table_id : (stryCov_9fa48("108004"), table?.table_id)) === tableId)) || (stryMutAct_9fa48("108006") ? table?.tableId !== tableId : stryMutAct_9fa48("108005") ? false : (stryCov_9fa48("108005", "108006"), (stryMutAct_9fa48("108007") ? table.tableId : (stryCov_9fa48("108007"), table?.tableId)) === tableId))))) || null);
        }
      }
      return null;
    }
  }

  /**
   * Lookup one partition row from the local system cache.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Cached row when present.
   * @private
   */
  lookupCachedPartition(partitionId) {
    if (stryMutAct_9fa48("108008")) {
      {}
    } else {
      stryCov_9fa48("108008");
      if (stryMutAct_9fa48("108011") ? !partitionId && !this.systemTableCache : stryMutAct_9fa48("108010") ? false : stryMutAct_9fa48("108009") ? true : (stryCov_9fa48("108009", "108010", "108011"), (stryMutAct_9fa48("108012") ? partitionId : (stryCov_9fa48("108012"), !partitionId)) || (stryMutAct_9fa48("108013") ? this.systemTableCache : (stryCov_9fa48("108013"), !this.systemTableCache)))) {
        if (stryMutAct_9fa48("108014")) {
          {}
        } else {
          stryCov_9fa48("108014");
          return null;
        }
      }
      if (stryMutAct_9fa48("108017") ? typeof this.systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("108016") ? false : stryMutAct_9fa48("108015") ? true : (stryCov_9fa48("108015", "108016", "108017"), typeof this.systemTableCache.filter === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("108018")) {
          {}
        } else {
          stryCov_9fa48("108018");
          const rows = stryMutAct_9fa48("108019") ? this.systemTableCache : (stryCov_9fa48("108019"), this.systemTableCache.filter(TABLES.PARTITIONS, stryMutAct_9fa48("108020") ? () => undefined : (stryCov_9fa48("108020"), partition => stryMutAct_9fa48("108023") ? partition?.partition_id === partitionId && partition?.partitionId === partitionId : stryMutAct_9fa48("108022") ? false : stryMutAct_9fa48("108021") ? true : (stryCov_9fa48("108021", "108022", "108023"), (stryMutAct_9fa48("108025") ? partition?.partition_id !== partitionId : stryMutAct_9fa48("108024") ? false : (stryCov_9fa48("108024", "108025"), (stryMutAct_9fa48("108026") ? partition.partition_id : (stryCov_9fa48("108026"), partition?.partition_id)) === partitionId)) || (stryMutAct_9fa48("108028") ? partition?.partitionId !== partitionId : stryMutAct_9fa48("108027") ? false : (stryCov_9fa48("108027", "108028"), (stryMutAct_9fa48("108029") ? partition.partitionId : (stryCov_9fa48("108029"), partition?.partitionId)) === partitionId))))));
          return stryMutAct_9fa48("108032") ? rows[0] && null : stryMutAct_9fa48("108031") ? false : stryMutAct_9fa48("108030") ? true : (stryCov_9fa48("108030", "108031", "108032"), rows[0] || null);
        }
      }
      if (stryMutAct_9fa48("108035") ? typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("108034") ? false : stryMutAct_9fa48("108033") ? true : (stryCov_9fa48("108033", "108034", "108035"), typeof this.systemTableCache.getAll === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("108036")) {
          {}
        } else {
          stryCov_9fa48("108036");
          const rows = stryMutAct_9fa48("108039") ? this.systemTableCache.getAll(TABLES.PARTITIONS) && [] : stryMutAct_9fa48("108038") ? false : stryMutAct_9fa48("108037") ? true : (stryCov_9fa48("108037", "108038", "108039"), this.systemTableCache.getAll(TABLES.PARTITIONS) || (stryMutAct_9fa48("108040") ? ["Stryker was here"] : (stryCov_9fa48("108040"), [])));
          return stryMutAct_9fa48("108043") ? rows.find(partition => partition?.partition_id === partitionId || partition?.partitionId === partitionId) && null : stryMutAct_9fa48("108042") ? false : stryMutAct_9fa48("108041") ? true : (stryCov_9fa48("108041", "108042", "108043"), rows.find(stryMutAct_9fa48("108044") ? () => undefined : (stryCov_9fa48("108044"), partition => stryMutAct_9fa48("108047") ? partition?.partition_id === partitionId && partition?.partitionId === partitionId : stryMutAct_9fa48("108046") ? false : stryMutAct_9fa48("108045") ? true : (stryCov_9fa48("108045", "108046", "108047"), (stryMutAct_9fa48("108049") ? partition?.partition_id !== partitionId : stryMutAct_9fa48("108048") ? false : (stryCov_9fa48("108048", "108049"), (stryMutAct_9fa48("108050") ? partition.partition_id : (stryCov_9fa48("108050"), partition?.partition_id)) === partitionId)) || (stryMutAct_9fa48("108052") ? partition?.partitionId !== partitionId : stryMutAct_9fa48("108051") ? false : (stryCov_9fa48("108051", "108052"), (stryMutAct_9fa48("108053") ? partition.partitionId : (stryCov_9fa48("108053"), partition?.partitionId)) === partitionId))))) || null);
        }
      }
      return null;
    }
  }

  /**
   * Get the policy for a specific table.
   * @param {string} tableId - Table ID.
   * @return {Promise<Object>} Table policy (merged with defaults).
   */
  async getTablePolicy(tableId) {
    if (stryMutAct_9fa48("108054")) {
      {}
    } else {
      stryCov_9fa48("108054");
      if (stryMutAct_9fa48("108057") ? false : stryMutAct_9fa48("108056") ? true : stryMutAct_9fa48("108055") ? tableId : (stryCov_9fa48("108055", "108056", "108057"), !tableId)) {
        if (stryMutAct_9fa48("108058")) {
          {}
        } else {
          stryCov_9fa48("108058");
          return this.getDefaultPolicy();
        }
      }

      // Check local cache first
      const cached = this.policyCache.get(tableId);
      if (stryMutAct_9fa48("108061") ? cached || Date.now() - cached.timestamp < this.cacheTTLMs : stryMutAct_9fa48("108060") ? false : stryMutAct_9fa48("108059") ? true : (stryCov_9fa48("108059", "108060", "108061"), cached && (stryMutAct_9fa48("108064") ? Date.now() - cached.timestamp >= this.cacheTTLMs : stryMutAct_9fa48("108063") ? Date.now() - cached.timestamp <= this.cacheTTLMs : stryMutAct_9fa48("108062") ? true : (stryCov_9fa48("108062", "108063", "108064"), (stryMutAct_9fa48("108065") ? Date.now() + cached.timestamp : (stryCov_9fa48("108065"), Date.now() - cached.timestamp)) < this.cacheTTLMs)))) {
        if (stryMutAct_9fa48("108066")) {
          {}
        } else {
          stryCov_9fa48("108066");
          return cached.policy;
        }
      }
      const table = await this.readTableRow(tableId);
      if (stryMutAct_9fa48("108069") ? false : stryMutAct_9fa48("108068") ? true : stryMutAct_9fa48("108067") ? table : (stryCov_9fa48("108067", "108068", "108069"), !table)) {
        if (stryMutAct_9fa48("108070")) {
          {}
        } else {
          stryCov_9fa48("108070");
          this.logger.debug(POLICY_LOG_MSG.TABLE_NOT_FOUND_DEFAULT, stryMutAct_9fa48("108071") ? {} : (stryCov_9fa48("108071"), {
            tableId
          }));
          return this.getDefaultPolicy();
        }
      }

      // Parse stored policy
      let storedPolicy = POLICY_VALUE.EMPTY_POLICY;
      if (stryMutAct_9fa48("108073") ? false : stryMutAct_9fa48("108072") ? true : (stryCov_9fa48("108072", "108073"), table.table_policies)) {
        if (stryMutAct_9fa48("108074")) {
          {}
        } else {
          stryCov_9fa48("108074");
          try {
            if (stryMutAct_9fa48("108075")) {
              {}
            } else {
              stryCov_9fa48("108075");
              storedPolicy = (stryMutAct_9fa48("108078") ? typeof table.table_policies !== TYPEOF.STRING : stryMutAct_9fa48("108077") ? false : stryMutAct_9fa48("108076") ? true : (stryCov_9fa48("108076", "108077", "108078"), typeof table.table_policies === TYPEOF.STRING)) ? JSON.parse(table.table_policies) : table.table_policies;
            }
          } catch (error) {
            if (stryMutAct_9fa48("108079")) {
              {}
            } else {
              stryCov_9fa48("108079");
              this.logger.warn(POLICY_LOG_MSG.POLICY_PARSE_FAILED, stryMutAct_9fa48("108080") ? {} : (stryCov_9fa48("108080"), {
                tableId,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }

      // Merge with defaults
      const mergedPolicy = this.mergeWithDefaults(storedPolicy);

      // Update cache
      this.policyCache.set(tableId, stryMutAct_9fa48("108081") ? {} : (stryCov_9fa48("108081"), {
        policy: mergedPolicy,
        timestamp: Date.now()
      }));
      return mergedPolicy;
    }
  }

  /**
   * Get the policy for a partition by looking up its table.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<Object>} Table policy for the partition's table.
   */
  async getPolicyForPartition(partitionId) {
    if (stryMutAct_9fa48("108082")) {
      {}
    } else {
      stryCov_9fa48("108082");
      const partition = await this.readPartitionRow(partitionId);
      if (stryMutAct_9fa48("108085") ? false : stryMutAct_9fa48("108084") ? true : stryMutAct_9fa48("108083") ? partition : (stryCov_9fa48("108083", "108084", "108085"), !partition)) {
        if (stryMutAct_9fa48("108086")) {
          {}
        } else {
          stryCov_9fa48("108086");
          this.logger.debug(POLICY_LOG_MSG.PARTITION_NOT_FOUND_DEFAULT, stryMutAct_9fa48("108087") ? {} : (stryCov_9fa48("108087"), {
            partitionId
          }));
          return this.getDefaultPolicy();
        }
      }
      return this.getTablePolicy(partition.table_id);
    }
  }

  /**
   * Merge a stored policy with defaults.
   * @param {Object} storedPolicy - Policy from storage.
   * @return {Object} Merged policy with all fields.
   */
  mergeWithDefaults(storedPolicy) {
    if (stryMutAct_9fa48("108088")) {
      {}
    } else {
      stryCov_9fa48("108088");
      const merged = stryMutAct_9fa48("108089") ? {} : (stryCov_9fa48("108089"), {
        ...DEFAULT_TABLE_POLICY
      });
      for (const [key, value] of Object.entries(storedPolicy)) {
        if (stryMutAct_9fa48("108090")) {
          {}
        } else {
          stryCov_9fa48("108090");
          if (stryMutAct_9fa48("108093") ? key === 'placementConstraints' || typeof value === 'object' : stryMutAct_9fa48("108092") ? false : stryMutAct_9fa48("108091") ? true : (stryCov_9fa48("108091", "108092", "108093"), (stryMutAct_9fa48("108095") ? key !== 'placementConstraints' : stryMutAct_9fa48("108094") ? true : (stryCov_9fa48("108094", "108095"), key === (stryMutAct_9fa48("108096") ? "" : (stryCov_9fa48("108096"), 'placementConstraints')))) && (stryMutAct_9fa48("108098") ? typeof value !== 'object' : stryMutAct_9fa48("108097") ? true : (stryCov_9fa48("108097", "108098"), typeof value === (stryMutAct_9fa48("108099") ? "" : (stryCov_9fa48("108099"), 'object')))))) {
            if (stryMutAct_9fa48("108100")) {
              {}
            } else {
              stryCov_9fa48("108100");
              merged.placementConstraints = stryMutAct_9fa48("108101") ? {} : (stryCov_9fa48("108101"), {
                ...DEFAULT_TABLE_POLICY.placementConstraints,
                ...value
              });
            }
          } else if (stryMutAct_9fa48("108103") ? false : stryMutAct_9fa48("108102") ? true : (stryCov_9fa48("108102", "108103"), key in DEFAULT_TABLE_POLICY)) {
            if (stryMutAct_9fa48("108104")) {
              {}
            } else {
              stryCov_9fa48("108104");
              merged[key] = value;
            }
          }
        }
      }
      return merged;
    }
  }

  /**
   * Validate a policy object.
   * @param {Object} policy - Policy to validate.
   * @return {Object} Validation result {valid, errors}.
   */
  validatePolicy(policy) {
    if (stryMutAct_9fa48("108105")) {
      {}
    } else {
      stryCov_9fa48("108105");
      const errors = stryMutAct_9fa48("108106") ? ["Stryker was here"] : (stryCov_9fa48("108106"), []);

      // Validate field types
      for (const [field, expectedType] of Object.entries(POLICY_FIELD_TYPES)) {
        if (stryMutAct_9fa48("108107")) {
          {}
        } else {
          stryCov_9fa48("108107");
          if (stryMutAct_9fa48("108110") ? policy[field] === undefined : stryMutAct_9fa48("108109") ? false : stryMutAct_9fa48("108108") ? true : (stryCov_9fa48("108108", "108109", "108110"), policy[field] !== undefined)) {
            if (stryMutAct_9fa48("108111")) {
              {}
            } else {
              stryCov_9fa48("108111");
              const actualType = typeof policy[field];
              if (stryMutAct_9fa48("108114") ? actualType === expectedType : stryMutAct_9fa48("108113") ? false : stryMutAct_9fa48("108112") ? true : (stryCov_9fa48("108112", "108113", "108114"), actualType !== expectedType)) {
                if (stryMutAct_9fa48("108115")) {
                  {}
                } else {
                  stryCov_9fa48("108115");
                  errors.push(POLICY_ERROR_MSG.fieldTypeMismatch(field, expectedType, actualType));
                }
              }
            }
          }
        }
      }

      // Validate replica counts
      if (stryMutAct_9fa48("108118") ? policy.replicaCount === undefined : stryMutAct_9fa48("108117") ? false : stryMutAct_9fa48("108116") ? true : (stryCov_9fa48("108116", "108117", "108118"), policy.replicaCount !== undefined)) {
        if (stryMutAct_9fa48("108119")) {
          {}
        } else {
          stryCov_9fa48("108119");
          if (stryMutAct_9fa48("108123") ? policy.replicaCount >= 1 : stryMutAct_9fa48("108122") ? policy.replicaCount <= 1 : stryMutAct_9fa48("108121") ? false : stryMutAct_9fa48("108120") ? true : (stryCov_9fa48("108120", "108121", "108122", "108123"), policy.replicaCount < 1)) {
            if (stryMutAct_9fa48("108124")) {
              {}
            } else {
              stryCov_9fa48("108124");
              errors.push(POLICY_ERROR_MSG.REPLICA_COUNT_MIN);
            }
          }
          if (stryMutAct_9fa48("108127") ? policy.replicaCount % 2 !== 0 : stryMutAct_9fa48("108126") ? false : stryMutAct_9fa48("108125") ? true : (stryCov_9fa48("108125", "108126", "108127"), (stryMutAct_9fa48("108128") ? policy.replicaCount * 2 : (stryCov_9fa48("108128"), policy.replicaCount % 2)) === 0)) {
            if (stryMutAct_9fa48("108129")) {
              {}
            } else {
              stryCov_9fa48("108129");
              errors.push(POLICY_ERROR_MSG.REPLICA_COUNT_ODD);
            }
          }
        }
      }
      if (stryMutAct_9fa48("108132") ? policy.minReplicaCount === undefined : stryMutAct_9fa48("108131") ? false : stryMutAct_9fa48("108130") ? true : (stryCov_9fa48("108130", "108131", "108132"), policy.minReplicaCount !== undefined)) {
        if (stryMutAct_9fa48("108133")) {
          {}
        } else {
          stryCov_9fa48("108133");
          if (stryMutAct_9fa48("108137") ? policy.minReplicaCount >= 1 : stryMutAct_9fa48("108136") ? policy.minReplicaCount <= 1 : stryMutAct_9fa48("108135") ? false : stryMutAct_9fa48("108134") ? true : (stryCov_9fa48("108134", "108135", "108136", "108137"), policy.minReplicaCount < 1)) {
            if (stryMutAct_9fa48("108138")) {
              {}
            } else {
              stryCov_9fa48("108138");
              errors.push(POLICY_ERROR_MSG.MIN_REPLICA_COUNT_MIN);
            }
          }
          if (stryMutAct_9fa48("108141") ? policy.minReplicaCount % 2 !== 0 : stryMutAct_9fa48("108140") ? false : stryMutAct_9fa48("108139") ? true : (stryCov_9fa48("108139", "108140", "108141"), (stryMutAct_9fa48("108142") ? policy.minReplicaCount * 2 : (stryCov_9fa48("108142"), policy.minReplicaCount % 2)) === 0)) {
            if (stryMutAct_9fa48("108143")) {
              {}
            } else {
              stryCov_9fa48("108143");
              errors.push(POLICY_ERROR_MSG.MIN_REPLICA_COUNT_ODD);
            }
          }
        }
      }
      if (stryMutAct_9fa48("108146") ? policy.maxReplicaCount === undefined : stryMutAct_9fa48("108145") ? false : stryMutAct_9fa48("108144") ? true : (stryCov_9fa48("108144", "108145", "108146"), policy.maxReplicaCount !== undefined)) {
        if (stryMutAct_9fa48("108147")) {
          {}
        } else {
          stryCov_9fa48("108147");
          if (stryMutAct_9fa48("108151") ? policy.maxReplicaCount >= 1 : stryMutAct_9fa48("108150") ? policy.maxReplicaCount <= 1 : stryMutAct_9fa48("108149") ? false : stryMutAct_9fa48("108148") ? true : (stryCov_9fa48("108148", "108149", "108150", "108151"), policy.maxReplicaCount < 1)) {
            if (stryMutAct_9fa48("108152")) {
              {}
            } else {
              stryCov_9fa48("108152");
              errors.push(POLICY_ERROR_MSG.MAX_REPLICA_COUNT_MIN);
            }
          }
          if (stryMutAct_9fa48("108155") ? policy.maxReplicaCount % 2 !== 0 : stryMutAct_9fa48("108154") ? false : stryMutAct_9fa48("108153") ? true : (stryCov_9fa48("108153", "108154", "108155"), (stryMutAct_9fa48("108156") ? policy.maxReplicaCount * 2 : (stryCov_9fa48("108156"), policy.maxReplicaCount % 2)) === 0)) {
            if (stryMutAct_9fa48("108157")) {
              {}
            } else {
              stryCov_9fa48("108157");
              errors.push(POLICY_ERROR_MSG.MAX_REPLICA_COUNT_ODD);
            }
          }
        }
      }

      // Validate min <= replica <= max
      const min = stryMutAct_9fa48("108160") ? policy.minReplicaCount && DEFAULT_TABLE_POLICY.minReplicaCount : stryMutAct_9fa48("108159") ? false : stryMutAct_9fa48("108158") ? true : (stryCov_9fa48("108158", "108159", "108160"), policy.minReplicaCount || DEFAULT_TABLE_POLICY.minReplicaCount);
      const max = stryMutAct_9fa48("108163") ? policy.maxReplicaCount && DEFAULT_TABLE_POLICY.maxReplicaCount : stryMutAct_9fa48("108162") ? false : stryMutAct_9fa48("108161") ? true : (stryCov_9fa48("108161", "108162", "108163"), policy.maxReplicaCount || DEFAULT_TABLE_POLICY.maxReplicaCount);
      const replica = stryMutAct_9fa48("108166") ? policy.replicaCount && DEFAULT_TABLE_POLICY.replicaCount : stryMutAct_9fa48("108165") ? false : stryMutAct_9fa48("108164") ? true : (stryCov_9fa48("108164", "108165", "108166"), policy.replicaCount || DEFAULT_TABLE_POLICY.replicaCount);
      if (stryMutAct_9fa48("108170") ? min <= max : stryMutAct_9fa48("108169") ? min >= max : stryMutAct_9fa48("108168") ? false : stryMutAct_9fa48("108167") ? true : (stryCov_9fa48("108167", "108168", "108169", "108170"), min > max)) {
        if (stryMutAct_9fa48("108171")) {
          {}
        } else {
          stryCov_9fa48("108171");
          errors.push(POLICY_ERROR_MSG.MIN_GT_MAX);
        }
      }
      if (stryMutAct_9fa48("108174") ? replica < min && replica > max : stryMutAct_9fa48("108173") ? false : stryMutAct_9fa48("108172") ? true : (stryCov_9fa48("108172", "108173", "108174"), (stryMutAct_9fa48("108177") ? replica >= min : stryMutAct_9fa48("108176") ? replica <= min : stryMutAct_9fa48("108175") ? false : (stryCov_9fa48("108175", "108176", "108177"), replica < min)) || (stryMutAct_9fa48("108180") ? replica <= max : stryMutAct_9fa48("108179") ? replica >= max : stryMutAct_9fa48("108178") ? false : (stryCov_9fa48("108178", "108179", "108180"), replica > max)))) {
        if (stryMutAct_9fa48("108181")) {
          {}
        } else {
          stryCov_9fa48("108181");
          errors.push(POLICY_ERROR_MSG.REPLICA_BETWEEN);
        }
      }

      // Validate thresholds
      if (stryMutAct_9fa48("108184") ? policy.splitStorageThreshold !== undefined || policy.splitStorageThreshold < 0 : stryMutAct_9fa48("108183") ? false : stryMutAct_9fa48("108182") ? true : (stryCov_9fa48("108182", "108183", "108184"), (stryMutAct_9fa48("108186") ? policy.splitStorageThreshold === undefined : stryMutAct_9fa48("108185") ? true : (stryCov_9fa48("108185", "108186"), policy.splitStorageThreshold !== undefined)) && (stryMutAct_9fa48("108189") ? policy.splitStorageThreshold >= 0 : stryMutAct_9fa48("108188") ? policy.splitStorageThreshold <= 0 : stryMutAct_9fa48("108187") ? true : (stryCov_9fa48("108187", "108188", "108189"), policy.splitStorageThreshold < 0)))) {
        if (stryMutAct_9fa48("108190")) {
          {}
        } else {
          stryCov_9fa48("108190");
          errors.push(POLICY_ERROR_MSG.SPLIT_STORAGE_NONNEGATIVE);
        }
      }
      if (stryMutAct_9fa48("108193") ? policy.splitTrafficThreshold !== undefined || policy.splitTrafficThreshold < 0 : stryMutAct_9fa48("108192") ? false : stryMutAct_9fa48("108191") ? true : (stryCov_9fa48("108191", "108192", "108193"), (stryMutAct_9fa48("108195") ? policy.splitTrafficThreshold === undefined : stryMutAct_9fa48("108194") ? true : (stryCov_9fa48("108194", "108195"), policy.splitTrafficThreshold !== undefined)) && (stryMutAct_9fa48("108198") ? policy.splitTrafficThreshold >= 0 : stryMutAct_9fa48("108197") ? policy.splitTrafficThreshold <= 0 : stryMutAct_9fa48("108196") ? true : (stryCov_9fa48("108196", "108197", "108198"), policy.splitTrafficThreshold < 0)))) {
        if (stryMutAct_9fa48("108199")) {
          {}
        } else {
          stryCov_9fa48("108199");
          errors.push(POLICY_ERROR_MSG.SPLIT_TRAFFIC_NONNEGATIVE);
        }
      }
      if (stryMutAct_9fa48("108202") ? policy.mergeStorageThreshold !== undefined || policy.mergeStorageThreshold < 0 : stryMutAct_9fa48("108201") ? false : stryMutAct_9fa48("108200") ? true : (stryCov_9fa48("108200", "108201", "108202"), (stryMutAct_9fa48("108204") ? policy.mergeStorageThreshold === undefined : stryMutAct_9fa48("108203") ? true : (stryCov_9fa48("108203", "108204"), policy.mergeStorageThreshold !== undefined)) && (stryMutAct_9fa48("108207") ? policy.mergeStorageThreshold >= 0 : stryMutAct_9fa48("108206") ? policy.mergeStorageThreshold <= 0 : stryMutAct_9fa48("108205") ? true : (stryCov_9fa48("108205", "108206", "108207"), policy.mergeStorageThreshold < 0)))) {
        if (stryMutAct_9fa48("108208")) {
          {}
        } else {
          stryCov_9fa48("108208");
          errors.push(POLICY_ERROR_MSG.MERGE_STORAGE_NONNEGATIVE);
        }
      }
      if (stryMutAct_9fa48("108211") ? policy.mergeTrafficThreshold !== undefined || policy.mergeTrafficThreshold < 0 : stryMutAct_9fa48("108210") ? false : stryMutAct_9fa48("108209") ? true : (stryCov_9fa48("108209", "108210", "108211"), (stryMutAct_9fa48("108213") ? policy.mergeTrafficThreshold === undefined : stryMutAct_9fa48("108212") ? true : (stryCov_9fa48("108212", "108213"), policy.mergeTrafficThreshold !== undefined)) && (stryMutAct_9fa48("108216") ? policy.mergeTrafficThreshold >= 0 : stryMutAct_9fa48("108215") ? policy.mergeTrafficThreshold <= 0 : stryMutAct_9fa48("108214") ? true : (stryCov_9fa48("108214", "108215", "108216"), policy.mergeTrafficThreshold < 0)))) {
        if (stryMutAct_9fa48("108217")) {
          {}
        } else {
          stryCov_9fa48("108217");
          errors.push(POLICY_ERROR_MSG.MERGE_TRAFFIC_NONNEGATIVE);
        }
      }
      if (stryMutAct_9fa48("108220") ? policy.placementConstraints !== undefined && policy.placementConstraints || typeof policy.placementConstraints === TYPEOF.OBJECT : stryMutAct_9fa48("108219") ? false : stryMutAct_9fa48("108218") ? true : (stryCov_9fa48("108218", "108219", "108220"), (stryMutAct_9fa48("108222") ? policy.placementConstraints !== undefined || policy.placementConstraints : stryMutAct_9fa48("108221") ? true : (stryCov_9fa48("108221", "108222"), (stryMutAct_9fa48("108224") ? policy.placementConstraints === undefined : stryMutAct_9fa48("108223") ? true : (stryCov_9fa48("108223", "108224"), policy.placementConstraints !== undefined)) && policy.placementConstraints)) && (stryMutAct_9fa48("108226") ? typeof policy.placementConstraints !== TYPEOF.OBJECT : stryMutAct_9fa48("108225") ? true : (stryCov_9fa48("108225", "108226"), typeof policy.placementConstraints === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("108227")) {
          {}
        } else {
          stryCov_9fa48("108227");
          errors.push(...this.validatePlacementConstraints(policy.placementConstraints));
        }
      }
      return stryMutAct_9fa48("108228") ? {} : (stryCov_9fa48("108228"), {
        valid: stryMutAct_9fa48("108231") ? errors.length !== 0 : stryMutAct_9fa48("108230") ? false : stryMutAct_9fa48("108229") ? true : (stryCov_9fa48("108229", "108230", "108231"), errors.length === 0),
        errors
      });
    }
  }

  /**
   * Validate placement constraints in the policy.
   * @param {Object} placementConstraints - Placement constraints.
   * @return {string[]} Array of validation error messages.
   */
  validatePlacementConstraints(placementConstraints) {
    if (stryMutAct_9fa48("108232")) {
      {}
    } else {
      stryCov_9fa48("108232");
      const errors = stryMutAct_9fa48("108233") ? ["Stryker was here"] : (stryCov_9fa48("108233"), []);
      for (const [field, defaultValue] of Object.entries(DEFAULT_TABLE_POLICY.placementConstraints)) {
        if (stryMutAct_9fa48("108234")) {
          {}
        } else {
          stryCov_9fa48("108234");
          if (stryMutAct_9fa48("108237") ? placementConstraints[field] === undefined : stryMutAct_9fa48("108236") ? false : stryMutAct_9fa48("108235") ? true : (stryCov_9fa48("108235", "108236", "108237"), placementConstraints[field] !== undefined)) {
            if (stryMutAct_9fa48("108238")) {
              {}
            } else {
              stryCov_9fa48("108238");
              const expectedType = typeof defaultValue;
              const actualType = typeof placementConstraints[field];
              if (stryMutAct_9fa48("108241") ? actualType === expectedType : stryMutAct_9fa48("108240") ? false : stryMutAct_9fa48("108239") ? true : (stryCov_9fa48("108239", "108240", "108241"), actualType !== expectedType)) {
                if (stryMutAct_9fa48("108242")) {
                  {}
                } else {
                  stryCov_9fa48("108242");
                  errors.push(POLICY_ERROR_MSG.fieldTypeMismatch(field, expectedType, actualType));
                }
              }
            }
          }
        }
      }
      const minFree = placementConstraints[STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE];
      if (stryMutAct_9fa48("108245") ? typeof minFree === TYPEOF.NUMBER || minFree < NUM.ZERO : stryMutAct_9fa48("108244") ? false : stryMutAct_9fa48("108243") ? true : (stryCov_9fa48("108243", "108244", "108245"), (stryMutAct_9fa48("108247") ? typeof minFree !== TYPEOF.NUMBER : stryMutAct_9fa48("108246") ? true : (stryCov_9fa48("108246", "108247"), typeof minFree === TYPEOF.NUMBER)) && (stryMutAct_9fa48("108250") ? minFree >= NUM.ZERO : stryMutAct_9fa48("108249") ? minFree <= NUM.ZERO : stryMutAct_9fa48("108248") ? true : (stryCov_9fa48("108248", "108249", "108250"), minFree < NUM.ZERO)))) {
        if (stryMutAct_9fa48("108251")) {
          {}
        } else {
          stryCov_9fa48("108251");
          errors.push(POLICY_ERROR_MSG.PLACEMENT_MIN_FREE_NONNEGATIVE);
        }
      }
      const maxUtil = placementConstraints[STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT];
      if (stryMutAct_9fa48("108254") ? typeof maxUtil === TYPEOF.NUMBER || maxUtil < NUM.ZERO || maxUtil > NUM.HUNDRED : stryMutAct_9fa48("108253") ? false : stryMutAct_9fa48("108252") ? true : (stryCov_9fa48("108252", "108253", "108254"), (stryMutAct_9fa48("108256") ? typeof maxUtil !== TYPEOF.NUMBER : stryMutAct_9fa48("108255") ? true : (stryCov_9fa48("108255", "108256"), typeof maxUtil === TYPEOF.NUMBER)) && (stryMutAct_9fa48("108258") ? maxUtil < NUM.ZERO && maxUtil > NUM.HUNDRED : stryMutAct_9fa48("108257") ? true : (stryCov_9fa48("108257", "108258"), (stryMutAct_9fa48("108261") ? maxUtil >= NUM.ZERO : stryMutAct_9fa48("108260") ? maxUtil <= NUM.ZERO : stryMutAct_9fa48("108259") ? false : (stryCov_9fa48("108259", "108260", "108261"), maxUtil < NUM.ZERO)) || (stryMutAct_9fa48("108264") ? maxUtil <= NUM.HUNDRED : stryMutAct_9fa48("108263") ? maxUtil >= NUM.HUNDRED : stryMutAct_9fa48("108262") ? false : (stryCov_9fa48("108262", "108263", "108264"), maxUtil > NUM.HUNDRED)))))) {
        if (stryMutAct_9fa48("108265")) {
          {}
        } else {
          stryCov_9fa48("108265");
          errors.push(POLICY_ERROR_MSG.PLACEMENT_MAX_UTIL_RANGE);
        }
      }
      return errors;
    }
  }

  /**
   * Update the policy for a table.
   * Writes to the tables system table via CDC.
   * @param {string} tableId - Table ID.
   * @param {Object} policyUpdates - Policy fields to update.
   * @return {Promise<Object>} Update result.
   */
  async updateTablePolicy(tableId, policyUpdates) {
    if (stryMutAct_9fa48("108266")) {
      {}
    } else {
      stryCov_9fa48("108266");
      if (stryMutAct_9fa48("108269") ? false : stryMutAct_9fa48("108268") ? true : stryMutAct_9fa48("108267") ? tableId : (stryCov_9fa48("108267", "108268", "108269"), !tableId)) {
        if (stryMutAct_9fa48("108270")) {
          {}
        } else {
          stryCov_9fa48("108270");
          throw new Error(POLICY_ERROR_MSG.TABLE_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("108273") ? false : stryMutAct_9fa48("108272") ? true : stryMutAct_9fa48("108271") ? this.cdcIntegrationService : (stryCov_9fa48("108271", "108272", "108273"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("108274")) {
          {}
        } else {
          stryCov_9fa48("108274");
          throw new Error(POLICY_ERROR_MSG.CDC_REQUIRED_FOR_UPDATE);
        }
      }

      // Validate the policy updates
      const validation = this.validatePolicy(policyUpdates);
      if (stryMutAct_9fa48("108277") ? false : stryMutAct_9fa48("108276") ? true : stryMutAct_9fa48("108275") ? validation.valid : (stryCov_9fa48("108275", "108276", "108277"), !validation.valid)) {
        if (stryMutAct_9fa48("108278")) {
          {}
        } else {
          stryCov_9fa48("108278");
          throw new Error(stryMutAct_9fa48("108279") ? `` : (stryCov_9fa48("108279"), `${POLICY_ERROR_MSG.INVALID_POLICY_PREFIX}${validation.errors.join(stryMutAct_9fa48("108280") ? "" : (stryCov_9fa48("108280"), ', '))}`));
        }
      }

      // Get current policy
      const currentPolicy = await this.getTablePolicy(tableId);

      // Merge updates with current policy
      const newPolicy = this.mergeWithDefaults(stryMutAct_9fa48("108281") ? {} : (stryCov_9fa48("108281"), {
        ...currentPolicy,
        ...policyUpdates
      }));

      // Validate the merged policy
      const mergedValidation = this.validatePolicy(newPolicy);
      if (stryMutAct_9fa48("108284") ? false : stryMutAct_9fa48("108283") ? true : stryMutAct_9fa48("108282") ? mergedValidation.valid : (stryCov_9fa48("108282", "108283", "108284"), !mergedValidation.valid)) {
        if (stryMutAct_9fa48("108285")) {
          {}
        } else {
          stryCov_9fa48("108285");
          throw new Error(stryMutAct_9fa48("108286") ? `` : (stryCov_9fa48("108286"), `${POLICY_ERROR_MSG.INVALID_MERGED_POLICY_PREFIX}${mergedValidation.errors.join(stryMutAct_9fa48("108287") ? "" : (stryCov_9fa48("108287"), ', '))}`));
        }
      }
      this.logger.info(POLICY_LOG_MSG.UPDATE_TABLE_POLICY, stryMutAct_9fa48("108288") ? {} : (stryCov_9fa48("108288"), {
        tableId,
        updates: policyUpdates
      }));
      try {
        if (stryMutAct_9fa48("108289")) {
          {}
        } else {
          stryCov_9fa48("108289");
          // Update via CDC integration service
          await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("108290") ? {} : (stryCov_9fa48("108290"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
            tableName: TABLES.TABLES,
            whereClause: stryMutAct_9fa48("108291") ? {} : (stryCov_9fa48("108291"), {
              table_id: tableId
            }),
            data: stryMutAct_9fa48("108292") ? {} : (stryCov_9fa48("108292"), {
              table_policies: JSON.stringify(newPolicy),
              updated_at: Date.now()
            })
          }), stryMutAct_9fa48("108293") ? {} : (stryCov_9fa48("108293"), {
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("108294") ? "" : (stryCov_9fa48("108294"), 'critical')
          }));

          // Invalidate cache
          this.policyCache.delete(tableId);
          this.emit(POLICY_EVENT.POLICY_UPDATED, stryMutAct_9fa48("108295") ? {} : (stryCov_9fa48("108295"), {
            tableId,
            oldPolicy: currentPolicy,
            newPolicy
          }));
          return stryMutAct_9fa48("108296") ? {} : (stryCov_9fa48("108296"), {
            success: stryMutAct_9fa48("108297") ? false : (stryCov_9fa48("108297"), true),
            tableId,
            policy: newPolicy
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("108298")) {
          {}
        } else {
          stryCov_9fa48("108298");
          this.logger.error(POLICY_LOG_MSG.UPDATE_TABLE_POLICY_FAILED, stryMutAct_9fa48("108299") ? {} : (stryCov_9fa48("108299"), {
            tableId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Set the complete policy for a table (replaces existing).
   * @param {string} tableId - Table ID.
   * @param {Object} policy - Complete policy object.
   * @return {Promise<Object>} Update result.
   */
  async setTablePolicy(tableId, policy) {
    if (stryMutAct_9fa48("108300")) {
      {}
    } else {
      stryCov_9fa48("108300");
      if (stryMutAct_9fa48("108303") ? false : stryMutAct_9fa48("108302") ? true : stryMutAct_9fa48("108301") ? tableId : (stryCov_9fa48("108301", "108302", "108303"), !tableId)) {
        if (stryMutAct_9fa48("108304")) {
          {}
        } else {
          stryCov_9fa48("108304");
          throw new Error(POLICY_ERROR_MSG.TABLE_ID_REQUIRED);
        }
      }

      // Merge with defaults to ensure all fields are present
      const completePolicy = this.mergeWithDefaults(policy);

      // Validate
      const validation = this.validatePolicy(completePolicy);
      if (stryMutAct_9fa48("108307") ? false : stryMutAct_9fa48("108306") ? true : stryMutAct_9fa48("108305") ? validation.valid : (stryCov_9fa48("108305", "108306", "108307"), !validation.valid)) {
        if (stryMutAct_9fa48("108308")) {
          {}
        } else {
          stryCov_9fa48("108308");
          throw new Error(stryMutAct_9fa48("108309") ? `` : (stryCov_9fa48("108309"), `${POLICY_ERROR_MSG.INVALID_POLICY_PREFIX}${validation.errors.join(stryMutAct_9fa48("108310") ? "" : (stryCov_9fa48("108310"), ', '))}`));
        }
      }
      return this.updateTablePolicy(tableId, completePolicy);
    }
  }

  /**
   * Get split thresholds for a table.
   * @param {string} tableId - Table ID.
   * @return {Promise<Object>} Split thresholds.
   */
  async getSplitThresholds(tableId) {
    if (stryMutAct_9fa48("108311")) {
      {}
    } else {
      stryCov_9fa48("108311");
      const policy = await this.getTablePolicy(tableId);
      return stryMutAct_9fa48("108312") ? {} : (stryCov_9fa48("108312"), {
        storageThreshold: policy.splitStorageThreshold,
        trafficThreshold: policy.splitTrafficThreshold
      });
    }
  }

  /**
   * Get merge thresholds for a table.
   * @param {string} tableId - Table ID.
   * @return {Promise<Object>} Merge thresholds.
   */
  async getMergeThresholds(tableId) {
    if (stryMutAct_9fa48("108313")) {
      {}
    } else {
      stryCov_9fa48("108313");
      const policy = await this.getTablePolicy(tableId);
      return stryMutAct_9fa48("108314") ? {} : (stryCov_9fa48("108314"), {
        storageThreshold: policy.mergeStorageThreshold,
        trafficThreshold: policy.mergeTrafficThreshold
      });
    }
  }

  /**
   * Get replication settings for a table.
   * @param {string} tableId - Table ID.
   * @return {Promise<Object>} Replication settings.
   */
  async getReplicationSettings(tableId) {
    if (stryMutAct_9fa48("108315")) {
      {}
    } else {
      stryCov_9fa48("108315");
      const policy = await this.getTablePolicy(tableId);
      return stryMutAct_9fa48("108316") ? {} : (stryCov_9fa48("108316"), {
        replicaCount: policy.replicaCount,
        minReplicaCount: policy.minReplicaCount,
        maxReplicaCount: policy.maxReplicaCount
      });
    }
  }

  /**
   * Get placement constraints for a table.
   * @param {string} tableId - Table ID.
   * @return {Promise<Object>} Placement constraints.
   */
  async getPlacementConstraints(tableId) {
    if (stryMutAct_9fa48("108317")) {
      {}
    } else {
      stryCov_9fa48("108317");
      const policy = await this.getTablePolicy(tableId);
      return stryMutAct_9fa48("108318") ? {} : (stryCov_9fa48("108318"), {
        ...policy.placementConstraints
      });
    }
  }

  /**
   * Get the default message group policy.
   * @return {Object} Default message group policy.
   */
  getDefaultMessageGroupPolicy() {
    if (stryMutAct_9fa48("108319")) {
      {}
    } else {
      stryCov_9fa48("108319");
      return stryMutAct_9fa48("108320") ? {} : (stryCov_9fa48("108320"), {
        ...DEFAULT_MESSAGE_GROUP_POLICY,
        placementConstraints: stryMutAct_9fa48("108321") ? {} : (stryCov_9fa48("108321"), {
          ...DEFAULT_MESSAGE_GROUP_POLICY.placementConstraints
        })
      });
    }
  }

  /**
   * Get the policy for a specific message group.
   * Reads from the message_groups table and merges with defaults.
   * @param {string} groupId - Message group ID.
   * @return {Promise<Object>} Message group policy (merged with defaults).
   */
  async getMessageGroupPolicy(groupId) {
    if (stryMutAct_9fa48("108322")) {
      {}
    } else {
      stryCov_9fa48("108322");
      if (stryMutAct_9fa48("108325") ? false : stryMutAct_9fa48("108324") ? true : stryMutAct_9fa48("108323") ? groupId : (stryCov_9fa48("108323", "108324", "108325"), !groupId)) {
        if (stryMutAct_9fa48("108326")) {
          {}
        } else {
          stryCov_9fa48("108326");
          return this.getDefaultMessageGroupPolicy();
        }
      }

      // Check local cache
      const cacheKey = stryMutAct_9fa48("108327") ? `` : (stryCov_9fa48("108327"), `mg:${groupId}`);
      const cached = this.policyCache.get(cacheKey);
      if (stryMutAct_9fa48("108330") ? cached || Date.now() - cached.timestamp < this.cacheTTLMs : stryMutAct_9fa48("108329") ? false : stryMutAct_9fa48("108328") ? true : (stryCov_9fa48("108328", "108329", "108330"), cached && (stryMutAct_9fa48("108333") ? Date.now() - cached.timestamp >= this.cacheTTLMs : stryMutAct_9fa48("108332") ? Date.now() - cached.timestamp <= this.cacheTTLMs : stryMutAct_9fa48("108331") ? true : (stryCov_9fa48("108331", "108332", "108333"), (stryMutAct_9fa48("108334") ? Date.now() + cached.timestamp : (stryCov_9fa48("108334"), Date.now() - cached.timestamp)) < this.cacheTTLMs)))) {
        if (stryMutAct_9fa48("108335")) {
          {}
        } else {
          stryCov_9fa48("108335");
          return cached.policy;
        }
      }

      // Prefer the propagated system cache when available. Joining nodes may
      // observe newly registered self-hosted message-group metadata here before
      // a routed SQL engine is available.
      const group = await this.readMessageGroupRow(groupId);
      if (stryMutAct_9fa48("108338") ? false : stryMutAct_9fa48("108337") ? true : stryMutAct_9fa48("108336") ? group : (stryCov_9fa48("108336", "108337", "108338"), !group)) {
        if (stryMutAct_9fa48("108339")) {
          {}
        } else {
          stryCov_9fa48("108339");
          this.logger.debug(POLICY_LOG_MSG.MESSAGE_GROUP_NOT_FOUND_DEFAULT, stryMutAct_9fa48("108340") ? {} : (stryCov_9fa48("108340"), {
            groupId
          }));
          return this.getDefaultMessageGroupPolicy();
        }
      }

      // Parse stored policy
      let storedPolicy = POLICY_VALUE.EMPTY_POLICY;
      if (stryMutAct_9fa48("108342") ? false : stryMutAct_9fa48("108341") ? true : (stryCov_9fa48("108341", "108342"), group.policy)) {
        if (stryMutAct_9fa48("108343")) {
          {}
        } else {
          stryCov_9fa48("108343");
          try {
            if (stryMutAct_9fa48("108344")) {
              {}
            } else {
              stryCov_9fa48("108344");
              storedPolicy = (stryMutAct_9fa48("108347") ? typeof group.policy !== TYPEOF.STRING : stryMutAct_9fa48("108346") ? false : stryMutAct_9fa48("108345") ? true : (stryCov_9fa48("108345", "108346", "108347"), typeof group.policy === TYPEOF.STRING)) ? JSON.parse(group.policy) : group.policy;
            }
          } catch (error) {
            if (stryMutAct_9fa48("108348")) {
              {}
            } else {
              stryCov_9fa48("108348");
              this.logger.warn(POLICY_LOG_MSG.POLICY_PARSE_FAILED, stryMutAct_9fa48("108349") ? {} : (stryCov_9fa48("108349"), {
                groupId,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }

      // Merge with defaults
      const mergedPolicy = this.mergeMessageGroupWithDefaults(storedPolicy);

      // Update cache
      this.policyCache.set(cacheKey, stryMutAct_9fa48("108350") ? {} : (stryCov_9fa48("108350"), {
        policy: mergedPolicy,
        timestamp: Date.now()
      }));
      return mergedPolicy;
    }
  }

  /**
   * Lookup one message-group row from the local system cache.
   * @param {string} groupId - Message group ID.
   * @return {Object|null} Cached row when present.
   * @private
   */
  lookupCachedMessageGroup(groupId) {
    if (stryMutAct_9fa48("108351")) {
      {}
    } else {
      stryCov_9fa48("108351");
      if (stryMutAct_9fa48("108354") ? !groupId && !this.systemTableCache : stryMutAct_9fa48("108353") ? false : stryMutAct_9fa48("108352") ? true : (stryCov_9fa48("108352", "108353", "108354"), (stryMutAct_9fa48("108355") ? groupId : (stryCov_9fa48("108355"), !groupId)) || (stryMutAct_9fa48("108356") ? this.systemTableCache : (stryCov_9fa48("108356"), !this.systemTableCache)))) {
        if (stryMutAct_9fa48("108357")) {
          {}
        } else {
          stryCov_9fa48("108357");
          return null;
        }
      }
      if (stryMutAct_9fa48("108360") ? typeof this.systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("108359") ? false : stryMutAct_9fa48("108358") ? true : (stryCov_9fa48("108358", "108359", "108360"), typeof this.systemTableCache.filter === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("108361")) {
          {}
        } else {
          stryCov_9fa48("108361");
          const rows = stryMutAct_9fa48("108362") ? this.systemTableCache : (stryCov_9fa48("108362"), this.systemTableCache.filter(TABLES.MESSAGE_GROUPS, stryMutAct_9fa48("108363") ? () => undefined : (stryCov_9fa48("108363"), group => stryMutAct_9fa48("108366") ? group?.group_id === groupId && group?.groupId === groupId : stryMutAct_9fa48("108365") ? false : stryMutAct_9fa48("108364") ? true : (stryCov_9fa48("108364", "108365", "108366"), (stryMutAct_9fa48("108368") ? group?.group_id !== groupId : stryMutAct_9fa48("108367") ? false : (stryCov_9fa48("108367", "108368"), (stryMutAct_9fa48("108369") ? group.group_id : (stryCov_9fa48("108369"), group?.group_id)) === groupId)) || (stryMutAct_9fa48("108371") ? group?.groupId !== groupId : stryMutAct_9fa48("108370") ? false : (stryCov_9fa48("108370", "108371"), (stryMutAct_9fa48("108372") ? group.groupId : (stryCov_9fa48("108372"), group?.groupId)) === groupId))))));
          return stryMutAct_9fa48("108375") ? rows[0] && null : stryMutAct_9fa48("108374") ? false : stryMutAct_9fa48("108373") ? true : (stryCov_9fa48("108373", "108374", "108375"), rows[0] || null);
        }
      }
      if (stryMutAct_9fa48("108378") ? typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("108377") ? false : stryMutAct_9fa48("108376") ? true : (stryCov_9fa48("108376", "108377", "108378"), typeof this.systemTableCache.getAll === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("108379")) {
          {}
        } else {
          stryCov_9fa48("108379");
          const rows = stryMutAct_9fa48("108382") ? this.systemTableCache.getAll(TABLES.MESSAGE_GROUPS) && [] : stryMutAct_9fa48("108381") ? false : stryMutAct_9fa48("108380") ? true : (stryCov_9fa48("108380", "108381", "108382"), this.systemTableCache.getAll(TABLES.MESSAGE_GROUPS) || (stryMutAct_9fa48("108383") ? ["Stryker was here"] : (stryCov_9fa48("108383"), [])));
          return stryMutAct_9fa48("108386") ? rows.find(group => group?.group_id === groupId || group?.groupId === groupId) && null : stryMutAct_9fa48("108385") ? false : stryMutAct_9fa48("108384") ? true : (stryCov_9fa48("108384", "108385", "108386"), rows.find(stryMutAct_9fa48("108387") ? () => undefined : (stryCov_9fa48("108387"), group => stryMutAct_9fa48("108390") ? group?.group_id === groupId && group?.groupId === groupId : stryMutAct_9fa48("108389") ? false : stryMutAct_9fa48("108388") ? true : (stryCov_9fa48("108388", "108389", "108390"), (stryMutAct_9fa48("108392") ? group?.group_id !== groupId : stryMutAct_9fa48("108391") ? false : (stryCov_9fa48("108391", "108392"), (stryMutAct_9fa48("108393") ? group.group_id : (stryCov_9fa48("108393"), group?.group_id)) === groupId)) || (stryMutAct_9fa48("108395") ? group?.groupId !== groupId : stryMutAct_9fa48("108394") ? false : (stryCov_9fa48("108394", "108395"), (stryMutAct_9fa48("108396") ? group.groupId : (stryCov_9fa48("108396"), group?.groupId)) === groupId))))) || null);
        }
      }
      return null;
    }
  }

  /**
   * Merge a stored message group policy with defaults.
   * @param {Object} storedPolicy - Policy from storage.
   * @return {Object} Merged policy with all fields.
   */
  mergeMessageGroupWithDefaults(storedPolicy) {
    if (stryMutAct_9fa48("108397")) {
      {}
    } else {
      stryCov_9fa48("108397");
      const merged = this.getDefaultMessageGroupPolicy();
      for (const [key, value] of Object.entries(storedPolicy)) {
        if (stryMutAct_9fa48("108398")) {
          {}
        } else {
          stryCov_9fa48("108398");
          if (stryMutAct_9fa48("108401") ? key === 'placementConstraints' || typeof value === 'object' : stryMutAct_9fa48("108400") ? false : stryMutAct_9fa48("108399") ? true : (stryCov_9fa48("108399", "108400", "108401"), (stryMutAct_9fa48("108403") ? key !== 'placementConstraints' : stryMutAct_9fa48("108402") ? true : (stryCov_9fa48("108402", "108403"), key === (stryMutAct_9fa48("108404") ? "" : (stryCov_9fa48("108404"), 'placementConstraints')))) && (stryMutAct_9fa48("108406") ? typeof value !== 'object' : stryMutAct_9fa48("108405") ? true : (stryCov_9fa48("108405", "108406"), typeof value === (stryMutAct_9fa48("108407") ? "" : (stryCov_9fa48("108407"), 'object')))))) {
            if (stryMutAct_9fa48("108408")) {
              {}
            } else {
              stryCov_9fa48("108408");
              merged.placementConstraints = stryMutAct_9fa48("108409") ? {} : (stryCov_9fa48("108409"), {
                ...DEFAULT_MESSAGE_GROUP_POLICY.placementConstraints,
                ...value
              });
            }
          } else if (stryMutAct_9fa48("108411") ? false : stryMutAct_9fa48("108410") ? true : (stryCov_9fa48("108410", "108411"), key in DEFAULT_MESSAGE_GROUP_POLICY)) {
            if (stryMutAct_9fa48("108412")) {
              {}
            } else {
              stryCov_9fa48("108412");
              merged[key] = value;
            }
          }
        }
      }
      return merged;
    }
  }

  /**
   * Validate a message group policy object.
   * Uses the same canonical validation path for placement constraints.
   * @param {Object} policy - Policy to validate.
   * @return {Object} Validation result {valid, errors}.
   */
  validateMessageGroupPolicy(policy) {
    if (stryMutAct_9fa48("108413")) {
      {}
    } else {
      stryCov_9fa48("108413");
      const errors = stryMutAct_9fa48("108414") ? ["Stryker was here"] : (stryCov_9fa48("108414"), []);

      // Validate field types
      for (const [field, expectedType] of Object.entries(MESSAGE_GROUP_POLICY_FIELD_TYPES)) {
        if (stryMutAct_9fa48("108415")) {
          {}
        } else {
          stryCov_9fa48("108415");
          if (stryMutAct_9fa48("108418") ? policy[field] === undefined : stryMutAct_9fa48("108417") ? false : stryMutAct_9fa48("108416") ? true : (stryCov_9fa48("108416", "108417", "108418"), policy[field] !== undefined)) {
            if (stryMutAct_9fa48("108419")) {
              {}
            } else {
              stryCov_9fa48("108419");
              const actualType = typeof policy[field];
              if (stryMutAct_9fa48("108422") ? actualType === expectedType : stryMutAct_9fa48("108421") ? false : stryMutAct_9fa48("108420") ? true : (stryCov_9fa48("108420", "108421", "108422"), actualType !== expectedType)) {
                if (stryMutAct_9fa48("108423")) {
                  {}
                } else {
                  stryCov_9fa48("108423");
                  errors.push(POLICY_ERROR_MSG.fieldTypeMismatch(field, expectedType, actualType));
                }
              }
            }
          }
        }
      }

      // Validate replica counts
      if (stryMutAct_9fa48("108426") ? policy.targetReplicaCount === undefined : stryMutAct_9fa48("108425") ? false : stryMutAct_9fa48("108424") ? true : (stryCov_9fa48("108424", "108425", "108426"), policy.targetReplicaCount !== undefined)) {
        if (stryMutAct_9fa48("108427")) {
          {}
        } else {
          stryCov_9fa48("108427");
          if (stryMutAct_9fa48("108431") ? policy.targetReplicaCount >= NUM.ONE : stryMutAct_9fa48("108430") ? policy.targetReplicaCount <= NUM.ONE : stryMutAct_9fa48("108429") ? false : stryMutAct_9fa48("108428") ? true : (stryCov_9fa48("108428", "108429", "108430", "108431"), policy.targetReplicaCount < NUM.ONE)) {
            if (stryMutAct_9fa48("108432")) {
              {}
            } else {
              stryCov_9fa48("108432");
              errors.push(POLICY_ERROR_MSG.REPLICA_COUNT_MIN);
            }
          }
          if (stryMutAct_9fa48("108435") ? policy.targetReplicaCount % NUM.TWO !== NUM.ZERO : stryMutAct_9fa48("108434") ? false : stryMutAct_9fa48("108433") ? true : (stryCov_9fa48("108433", "108434", "108435"), (stryMutAct_9fa48("108436") ? policy.targetReplicaCount * NUM.TWO : (stryCov_9fa48("108436"), policy.targetReplicaCount % NUM.TWO)) === NUM.ZERO)) {
            if (stryMutAct_9fa48("108437")) {
              {}
            } else {
              stryCov_9fa48("108437");
              errors.push(POLICY_ERROR_MSG.REPLICA_COUNT_ODD);
            }
          }
        }
      }
      if (stryMutAct_9fa48("108440") ? policy.maxReplicaCount === undefined : stryMutAct_9fa48("108439") ? false : stryMutAct_9fa48("108438") ? true : (stryCov_9fa48("108438", "108439", "108440"), policy.maxReplicaCount !== undefined)) {
        if (stryMutAct_9fa48("108441")) {
          {}
        } else {
          stryCov_9fa48("108441");
          if (stryMutAct_9fa48("108445") ? policy.maxReplicaCount >= NUM.ONE : stryMutAct_9fa48("108444") ? policy.maxReplicaCount <= NUM.ONE : stryMutAct_9fa48("108443") ? false : stryMutAct_9fa48("108442") ? true : (stryCov_9fa48("108442", "108443", "108444", "108445"), policy.maxReplicaCount < NUM.ONE)) {
            if (stryMutAct_9fa48("108446")) {
              {}
            } else {
              stryCov_9fa48("108446");
              errors.push(POLICY_ERROR_MSG.MAX_REPLICA_COUNT_MIN);
            }
          }
          if (stryMutAct_9fa48("108449") ? policy.maxReplicaCount % NUM.TWO !== NUM.ZERO : stryMutAct_9fa48("108448") ? false : stryMutAct_9fa48("108447") ? true : (stryCov_9fa48("108447", "108448", "108449"), (stryMutAct_9fa48("108450") ? policy.maxReplicaCount * NUM.TWO : (stryCov_9fa48("108450"), policy.maxReplicaCount % NUM.TWO)) === NUM.ZERO)) {
            if (stryMutAct_9fa48("108451")) {
              {}
            } else {
              stryCov_9fa48("108451");
              errors.push(POLICY_ERROR_MSG.MAX_REPLICA_COUNT_ODD);
            }
          }
        }
      }

      // Validate target <= max
      const target = stryMutAct_9fa48("108454") ? policy.targetReplicaCount && DEFAULT_MESSAGE_GROUP_POLICY.targetReplicaCount : stryMutAct_9fa48("108453") ? false : stryMutAct_9fa48("108452") ? true : (stryCov_9fa48("108452", "108453", "108454"), policy.targetReplicaCount || DEFAULT_MESSAGE_GROUP_POLICY.targetReplicaCount);
      const max = stryMutAct_9fa48("108457") ? policy.maxReplicaCount && DEFAULT_MESSAGE_GROUP_POLICY.maxReplicaCount : stryMutAct_9fa48("108456") ? false : stryMutAct_9fa48("108455") ? true : (stryCov_9fa48("108455", "108456", "108457"), policy.maxReplicaCount || DEFAULT_MESSAGE_GROUP_POLICY.maxReplicaCount);
      if (stryMutAct_9fa48("108461") ? target <= max : stryMutAct_9fa48("108460") ? target >= max : stryMutAct_9fa48("108459") ? false : stryMutAct_9fa48("108458") ? true : (stryCov_9fa48("108458", "108459", "108460", "108461"), target > max)) {
        if (stryMutAct_9fa48("108462")) {
          {}
        } else {
          stryCov_9fa48("108462");
          errors.push(POLICY_ERROR_MSG.REPLICA_BETWEEN);
        }
      }

      // Reuse canonical placement constraint validation
      if (stryMutAct_9fa48("108465") ? policy.placementConstraints !== undefined && policy.placementConstraints || typeof policy.placementConstraints === TYPEOF.OBJECT : stryMutAct_9fa48("108464") ? false : stryMutAct_9fa48("108463") ? true : (stryCov_9fa48("108463", "108464", "108465"), (stryMutAct_9fa48("108467") ? policy.placementConstraints !== undefined || policy.placementConstraints : stryMutAct_9fa48("108466") ? true : (stryCov_9fa48("108466", "108467"), (stryMutAct_9fa48("108469") ? policy.placementConstraints === undefined : stryMutAct_9fa48("108468") ? true : (stryCov_9fa48("108468", "108469"), policy.placementConstraints !== undefined)) && policy.placementConstraints)) && (stryMutAct_9fa48("108471") ? typeof policy.placementConstraints !== TYPEOF.OBJECT : stryMutAct_9fa48("108470") ? true : (stryCov_9fa48("108470", "108471"), typeof policy.placementConstraints === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("108472")) {
          {}
        } else {
          stryCov_9fa48("108472");
          errors.push(...this.validatePlacementConstraints(policy.placementConstraints));
        }
      }
      return stryMutAct_9fa48("108473") ? {} : (stryCov_9fa48("108473"), {
        valid: stryMutAct_9fa48("108476") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("108475") ? false : stryMutAct_9fa48("108474") ? true : (stryCov_9fa48("108474", "108475", "108476"), errors.length === NUM.ZERO),
        errors
      });
    }
  }

  /**
   * Get effective storage placement constraints for a table.
   * Extracts only storage-related constraint values from the
   * merged policy. Req 6.5.
   * @param {string} tableId - Table ID.
   * @return {Promise<Object>} Storage placement constraints.
   */
  async getEffectiveStorageConstraints(tableId) {
    if (stryMutAct_9fa48("108477")) {
      {}
    } else {
      stryCov_9fa48("108477");
      const policy = await this.getTablePolicy(tableId);
      return extractStorageConstraints(policy.placementConstraints);
    }
  }

  /**
   * Get effective storage placement constraints for a message group.
   * Extracts only storage-related constraint values from the
   * merged policy. Req 6.5.
   * @param {string} groupId - Message group ID.
   * @return {Promise<Object>} Storage placement constraints.
   */
  async getEffectiveMessageGroupStorageConstraints(groupId) {
    if (stryMutAct_9fa48("108478")) {
      {}
    } else {
      stryCov_9fa48("108478");
      const policy = await this.getMessageGroupPolicy(groupId);
      return extractStorageConstraints(policy.placementConstraints);
    }
  }

  /**
   * Check if a partition should be split based on its table's policy.
   * @param {string} partitionId - Partition ID.
   * @param {Object} metrics - Partition metrics.
   * @return {Promise<boolean>} True if partition should be split.
   */
  async shouldSplitPartition(partitionId, metrics) {
    if (stryMutAct_9fa48("108479")) {
      {}
    } else {
      stryCov_9fa48("108479");
      const policy = await this.getPolicyForPartition(partitionId);
      const sizeBytes = stryMutAct_9fa48("108482") ? metrics.sizeBytes && 0 : stryMutAct_9fa48("108481") ? false : stryMutAct_9fa48("108480") ? true : (stryCov_9fa48("108480", "108481", "108482"), metrics.sizeBytes || 0);
      const queriesPerMinute = stryMutAct_9fa48("108485") ? metrics.queriesPerMinute && 0 : stryMutAct_9fa48("108484") ? false : stryMutAct_9fa48("108483") ? true : (stryCov_9fa48("108483", "108484", "108485"), metrics.queriesPerMinute || 0);

      // Split if EITHER threshold is exceeded
      return stryMutAct_9fa48("108488") ? sizeBytes >= policy.splitStorageThreshold && queriesPerMinute >= policy.splitTrafficThreshold : stryMutAct_9fa48("108487") ? false : stryMutAct_9fa48("108486") ? true : (stryCov_9fa48("108486", "108487", "108488"), (stryMutAct_9fa48("108491") ? sizeBytes < policy.splitStorageThreshold : stryMutAct_9fa48("108490") ? sizeBytes > policy.splitStorageThreshold : stryMutAct_9fa48("108489") ? false : (stryCov_9fa48("108489", "108490", "108491"), sizeBytes >= policy.splitStorageThreshold)) || (stryMutAct_9fa48("108494") ? queriesPerMinute < policy.splitTrafficThreshold : stryMutAct_9fa48("108493") ? queriesPerMinute > policy.splitTrafficThreshold : stryMutAct_9fa48("108492") ? false : (stryCov_9fa48("108492", "108493", "108494"), queriesPerMinute >= policy.splitTrafficThreshold)));
    }
  }

  /**
   * Check if two partitions should be merged.
   * @param {string} leftPartitionId - Left partition ID.
   * @param {string} rightPartitionId - Right partition ID.
   * @param {Object} leftMetrics - Left partition metrics.
   * @param {Object} rightMetrics - Right partition metrics.
   * @return {Promise<boolean>} True if partitions should be merged.
   */
  async shouldMergePartitions(leftPartitionId, rightPartitionId, leftMetrics, rightMetrics) {
    if (stryMutAct_9fa48("108495")) {
      {}
    } else {
      stryCov_9fa48("108495");
      const policy = await this.getPolicyForPartition(leftPartitionId);
      const combinedStorage = stryMutAct_9fa48("108496") ? (leftMetrics.sizeBytes || 0) - (rightMetrics.sizeBytes || 0) : (stryCov_9fa48("108496"), (stryMutAct_9fa48("108499") ? leftMetrics.sizeBytes && 0 : stryMutAct_9fa48("108498") ? false : stryMutAct_9fa48("108497") ? true : (stryCov_9fa48("108497", "108498", "108499"), leftMetrics.sizeBytes || 0)) + (stryMutAct_9fa48("108502") ? rightMetrics.sizeBytes && 0 : stryMutAct_9fa48("108501") ? false : stryMutAct_9fa48("108500") ? true : (stryCov_9fa48("108500", "108501", "108502"), rightMetrics.sizeBytes || 0)));
      const combinedTraffic = stryMutAct_9fa48("108503") ? (leftMetrics.queriesPerMinute || 0) - (rightMetrics.queriesPerMinute || 0) : (stryCov_9fa48("108503"), (stryMutAct_9fa48("108506") ? leftMetrics.queriesPerMinute && 0 : stryMutAct_9fa48("108505") ? false : stryMutAct_9fa48("108504") ? true : (stryCov_9fa48("108504", "108505", "108506"), leftMetrics.queriesPerMinute || 0)) + (stryMutAct_9fa48("108509") ? rightMetrics.queriesPerMinute && 0 : stryMutAct_9fa48("108508") ? false : stryMutAct_9fa48("108507") ? true : (stryCov_9fa48("108507", "108508", "108509"), rightMetrics.queriesPerMinute || 0)));

      // Merge if BOTH thresholds are satisfied
      return stryMutAct_9fa48("108512") ? combinedStorage <= policy.mergeStorageThreshold || combinedTraffic <= policy.mergeTrafficThreshold : stryMutAct_9fa48("108511") ? false : stryMutAct_9fa48("108510") ? true : (stryCov_9fa48("108510", "108511", "108512"), (stryMutAct_9fa48("108515") ? combinedStorage > policy.mergeStorageThreshold : stryMutAct_9fa48("108514") ? combinedStorage < policy.mergeStorageThreshold : stryMutAct_9fa48("108513") ? true : (stryCov_9fa48("108513", "108514", "108515"), combinedStorage <= policy.mergeStorageThreshold)) && (stryMutAct_9fa48("108518") ? combinedTraffic > policy.mergeTrafficThreshold : stryMutAct_9fa48("108517") ? combinedTraffic < policy.mergeTrafficThreshold : stryMutAct_9fa48("108516") ? true : (stryCov_9fa48("108516", "108517", "108518"), combinedTraffic <= policy.mergeTrafficThreshold)));
    }
  }

  /**
   * Clear the policy cache.
   */
  clearCache() {
    if (stryMutAct_9fa48("108519")) {
      {}
    } else {
      stryCov_9fa48("108519");
      this.policyCache.clear();
      this.logger.debug(POLICY_LOG_MSG.POLICY_CACHE_CLEARED);
    }
  }

  /**
   * Invalidate cache for a specific table.
   * @param {string} tableId - Table ID.
   */
  invalidateCache(tableId) {
    if (stryMutAct_9fa48("108520")) {
      {}
    } else {
      stryCov_9fa48("108520");
      this.policyCache.delete(tableId);
      this.logger.debug(POLICY_LOG_MSG.POLICY_CACHE_INVALIDATED, stryMutAct_9fa48("108521") ? {} : (stryCov_9fa48("108521"), {
        tableId
      }));
    }
  }
  async readTableRow(tableId) {
    if (stryMutAct_9fa48("108522")) {
      {}
    } else {
      stryCov_9fa48("108522");
      if (stryMutAct_9fa48("108524") ? false : stryMutAct_9fa48("108523") ? true : (stryCov_9fa48("108523", "108524"), this.systemTableCache)) {
        if (stryMutAct_9fa48("108525")) {
          {}
        } else {
          stryCov_9fa48("108525");
          const result = await this.getControlPlaneSystemTableGateway().executeRead(stryMutAct_9fa48("108526") ? {} : (stryCov_9fa48("108526"), {
            tableName: TABLES.TABLES,
            strategy: CONTROL_PLANE_READ_STRATEGY.CACHE,
            readFromCache: () => {
              if (stryMutAct_9fa48("108527")) {
                {}
              } else {
                stryCov_9fa48("108527");
                const row = this.lookupCachedTable(tableId);
                return row ? stryMutAct_9fa48("108528") ? [] : (stryCov_9fa48("108528"), [row]) : stryMutAct_9fa48("108529") ? ["Stryker was here"] : (stryCov_9fa48("108529"), []);
              }
            }
          }));
          return stryMutAct_9fa48("108532") ? result.rows?.[0] && null : stryMutAct_9fa48("108531") ? false : stryMutAct_9fa48("108530") ? true : (stryCov_9fa48("108530", "108531", "108532"), (stryMutAct_9fa48("108533") ? result.rows[0] : (stryCov_9fa48("108533"), result.rows?.[0])) || null);
        }
      }
      const result = await this.getControlPlaneSystemTableGateway().readRows(TABLES.TABLES, stryMutAct_9fa48("108534") ? "" : (stryCov_9fa48("108534"), 'SELECT * FROM tables WHERE table_id = ?'), stryMutAct_9fa48("108535") ? [] : (stryCov_9fa48("108535"), [tableId]));
      return stryMutAct_9fa48("108538") ? result.rows?.[0] && null : stryMutAct_9fa48("108537") ? false : stryMutAct_9fa48("108536") ? true : (stryCov_9fa48("108536", "108537", "108538"), (stryMutAct_9fa48("108539") ? result.rows[0] : (stryCov_9fa48("108539"), result.rows?.[0])) || null);
    }
  }
  async readPartitionRow(partitionId) {
    if (stryMutAct_9fa48("108540")) {
      {}
    } else {
      stryCov_9fa48("108540");
      if (stryMutAct_9fa48("108542") ? false : stryMutAct_9fa48("108541") ? true : (stryCov_9fa48("108541", "108542"), this.systemTableCache)) {
        if (stryMutAct_9fa48("108543")) {
          {}
        } else {
          stryCov_9fa48("108543");
          const result = await this.getControlPlaneSystemTableGateway().executeRead(stryMutAct_9fa48("108544") ? {} : (stryCov_9fa48("108544"), {
            tableName: TABLES.PARTITIONS,
            strategy: CONTROL_PLANE_READ_STRATEGY.CACHE,
            readFromCache: () => {
              if (stryMutAct_9fa48("108545")) {
                {}
              } else {
                stryCov_9fa48("108545");
                const row = this.lookupCachedPartition(partitionId);
                return row ? stryMutAct_9fa48("108546") ? [] : (stryCov_9fa48("108546"), [row]) : stryMutAct_9fa48("108547") ? ["Stryker was here"] : (stryCov_9fa48("108547"), []);
              }
            }
          }));
          return stryMutAct_9fa48("108550") ? result.rows?.[0] && null : stryMutAct_9fa48("108549") ? false : stryMutAct_9fa48("108548") ? true : (stryCov_9fa48("108548", "108549", "108550"), (stryMutAct_9fa48("108551") ? result.rows[0] : (stryCov_9fa48("108551"), result.rows?.[0])) || null);
        }
      }
      const result = await this.getControlPlaneSystemTableGateway().readRows(TABLES.PARTITIONS, stryMutAct_9fa48("108552") ? "" : (stryCov_9fa48("108552"), 'SELECT * FROM partitions WHERE partition_id = ?'), stryMutAct_9fa48("108553") ? [] : (stryCov_9fa48("108553"), [partitionId]));
      return stryMutAct_9fa48("108556") ? result.rows?.[0] && null : stryMutAct_9fa48("108555") ? false : stryMutAct_9fa48("108554") ? true : (stryCov_9fa48("108554", "108555", "108556"), (stryMutAct_9fa48("108557") ? result.rows[0] : (stryCov_9fa48("108557"), result.rows?.[0])) || null);
    }
  }
  async readMessageGroupRow(groupId) {
    if (stryMutAct_9fa48("108558")) {
      {}
    } else {
      stryCov_9fa48("108558");
      if (stryMutAct_9fa48("108560") ? false : stryMutAct_9fa48("108559") ? true : (stryCov_9fa48("108559", "108560"), this.systemTableCache)) {
        if (stryMutAct_9fa48("108561")) {
          {}
        } else {
          stryCov_9fa48("108561");
          const result = await this.getControlPlaneSystemTableGateway().executeRead(stryMutAct_9fa48("108562") ? {} : (stryCov_9fa48("108562"), {
            tableName: TABLES.MESSAGE_GROUPS,
            strategy: CONTROL_PLANE_READ_STRATEGY.CACHE,
            readFromCache: () => {
              if (stryMutAct_9fa48("108563")) {
                {}
              } else {
                stryCov_9fa48("108563");
                const row = this.lookupCachedMessageGroup(groupId);
                return row ? stryMutAct_9fa48("108564") ? [] : (stryCov_9fa48("108564"), [row]) : stryMutAct_9fa48("108565") ? ["Stryker was here"] : (stryCov_9fa48("108565"), []);
              }
            }
          }));
          return stryMutAct_9fa48("108568") ? result.rows?.[0] && null : stryMutAct_9fa48("108567") ? false : stryMutAct_9fa48("108566") ? true : (stryCov_9fa48("108566", "108567", "108568"), (stryMutAct_9fa48("108569") ? result.rows[0] : (stryCov_9fa48("108569"), result.rows?.[0])) || null);
        }
      }
      const result = await this.getControlPlaneSystemTableGateway().readRows(TABLES.MESSAGE_GROUPS, stryMutAct_9fa48("108570") ? "" : (stryCov_9fa48("108570"), 'SELECT * FROM message_groups WHERE group_id = ?'), stryMutAct_9fa48("108571") ? [] : (stryCov_9fa48("108571"), [groupId]));
      return stryMutAct_9fa48("108574") ? result.rows?.[0] && null : stryMutAct_9fa48("108573") ? false : stryMutAct_9fa48("108572") ? true : (stryCov_9fa48("108572", "108573", "108574"), (stryMutAct_9fa48("108575") ? result.rows[0] : (stryCov_9fa48("108575"), result.rows?.[0])) || null);
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("108576")) {
      {}
    } else {
      stryCov_9fa48("108576");
      if (stryMutAct_9fa48("108578") ? false : stryMutAct_9fa48("108577") ? true : (stryCov_9fa48("108577", "108578"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("108579")) {
          {}
        } else {
          stryCov_9fa48("108579");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("108580") ? {} : (stryCov_9fa48("108580"), {
        getCdcIntegrationService: stryMutAct_9fa48("108581") ? () => undefined : (stryCov_9fa48("108581"), () => this.cdcIntegrationService),
        getSqlQueryEngine: stryMutAct_9fa48("108582") ? () => undefined : (stryCov_9fa48("108582"), () => this.sqlQueryEngine),
        getSystemTableCache: stryMutAct_9fa48("108583") ? () => undefined : (stryCov_9fa48("108583"), () => this.systemTableCache)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }

  /**
   * Shutdown the service.
   */
  shutdown() {
    if (stryMutAct_9fa48("108584")) {
      {}
    } else {
      stryCov_9fa48("108584");
      this.clearCache();
      this.removeAllListeners();
      this.logger.info(POLICY_LOG_MSG.TABLE_POLICY_SHUTDOWN);
    }
  }
}
export { TablePolicyService };