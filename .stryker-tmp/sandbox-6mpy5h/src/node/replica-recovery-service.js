/**
 * Replica Recovery Service - Creates replacement replicas on healthy nodes.
 * Maintains minimum replica counts when nodes fail.
 * Requirements: 14.2
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
import { v4 as uuidv4 } from 'uuid';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { NUM, SERVICE_TYPE } from '../constants/index.js';
import { assertCritical } from '../utils/assert.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { REPLICA_RECOVERY_DEFAULT, REPLICA_RECOVERY_ENTITY_TYPE, REPLICA_RECOVERY_ERROR_MSG, REPLICA_RECOVERY_EVENT, REPLICA_RECOVERY_KEY_PREFIX, REPLICA_RECOVERY_LOG_MSG, REPLICA_RECOVERY_NODE_STATUS, REPLICA_RECOVERY_NUM, REPLICA_RECOVERY_REPLICA_STATUS, REPLICA_RECOVERY_SUBSYSTEM } from './replica-recovery-constants.js';

/**
 * Node status values.
 */
const NodeStatus = REPLICA_RECOVERY_NODE_STATUS;

/**
 * Replica status values.
 */
const ReplicaStatus = REPLICA_RECOVERY_REPLICA_STATUS;

/**
 * Service types.
 */
const ServiceType = stryMutAct_9fa48("95936") ? {} : (stryCov_9fa48("95936"), {
  PARTITION_REPLICA: SERVICE_TYPE.PARTITION,
  MESSAGE_GROUP_REPLICA: SERVICE_TYPE.MESSAGE_GROUP
});

/**
 * ReplicaRecoveryService monitors for failed replicas and creates replacements.
 * It ensures minimum replica counts are maintained for both partitions and
 * message groups.
 */
class ReplicaRecoveryService extends EventEmitter {
  /**
   * Create a new ReplicaRecoveryService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {string} options.nodeId - This node's ID.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("95937")) {
      {}
    } else {
      stryCov_9fa48("95937");
      super();
      this.systemTableCache = stryMutAct_9fa48("95940") ? options.systemTableCache && null : stryMutAct_9fa48("95939") ? false : stryMutAct_9fa48("95938") ? true : (stryCov_9fa48("95938", "95939", "95940"), options.systemTableCache || null);
      this.cdcIntegrationService = stryMutAct_9fa48("95943") ? options.cdcIntegrationService && null : stryMutAct_9fa48("95942") ? false : stryMutAct_9fa48("95941") ? true : (stryCov_9fa48("95941", "95942", "95943"), options.cdcIntegrationService || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("95946") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("95945") ? false : stryMutAct_9fa48("95944") ? true : (stryCov_9fa48("95944", "95945", "95946"), options.controlPlaneSystemTableGateway || null);
      this.nodeId = stryMutAct_9fa48("95949") ? options.nodeId && null : stryMutAct_9fa48("95948") ? false : stryMutAct_9fa48("95947") ? true : (stryCov_9fa48("95947", "95948", "95949"), options.nodeId || null);

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.checkIntervalMs = stryMutAct_9fa48("95952") ? config.get(CONFIG_KEY.REPLICA_RECOVERY_CHECK_INTERVAL_MS) && REPLICA_RECOVERY_DEFAULT.CHECK_INTERVAL_MS : stryMutAct_9fa48("95951") ? false : stryMutAct_9fa48("95950") ? true : (stryCov_9fa48("95950", "95951", "95952"), config.get(CONFIG_KEY.REPLICA_RECOVERY_CHECK_INTERVAL_MS) || REPLICA_RECOVERY_DEFAULT.CHECK_INTERVAL_MS);
      this.minPartitionReplicas = stryMutAct_9fa48("95955") ? config.get(CONFIG_KEY.REPLICA_RECOVERY_MIN_PARTITION_REPLICAS) && REPLICA_RECOVERY_DEFAULT.MIN_PARTITION_REPLICAS : stryMutAct_9fa48("95954") ? false : stryMutAct_9fa48("95953") ? true : (stryCov_9fa48("95953", "95954", "95955"), config.get(CONFIG_KEY.REPLICA_RECOVERY_MIN_PARTITION_REPLICAS) || REPLICA_RECOVERY_DEFAULT.MIN_PARTITION_REPLICAS);
      this.minMessageGroupReplicas = stryMutAct_9fa48("95958") ? config.get(CONFIG_KEY.REPLICA_RECOVERY_MIN_MESSAGE_GROUP_REPLICAS) && REPLICA_RECOVERY_DEFAULT.MIN_MESSAGE_GROUP_REPLICAS : stryMutAct_9fa48("95957") ? false : stryMutAct_9fa48("95956") ? true : (stryCov_9fa48("95956", "95957", "95958"), config.get(CONFIG_KEY.REPLICA_RECOVERY_MIN_MESSAGE_GROUP_REPLICAS) || REPLICA_RECOVERY_DEFAULT.MIN_MESSAGE_GROUP_REPLICAS);
      this.recoveryDelayMs = stryMutAct_9fa48("95961") ? config.get(CONFIG_KEY.REPLICA_RECOVERY_DELAY_MS) && REPLICA_RECOVERY_DEFAULT.RECOVERY_DELAY_MS : stryMutAct_9fa48("95960") ? false : stryMutAct_9fa48("95959") ? true : (stryCov_9fa48("95959", "95960", "95961"), config.get(CONFIG_KEY.REPLICA_RECOVERY_DELAY_MS) || REPLICA_RECOVERY_DEFAULT.RECOVERY_DELAY_MS);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(REPLICA_RECOVERY_SUBSYSTEM) : console;

      // State
      this.checkTimer = null;
      this.monitoringActive = stryMutAct_9fa48("95962") ? true : (stryCov_9fa48("95962"), false);
      this.currentCheckIntervalMs = this.checkIntervalMs;
      this.pendingRecoveries = new Map(); // entityId -> recovery info
      this.recoveryCount = 0;
      this.initialized = stryMutAct_9fa48("95963") ? true : (stryCov_9fa48("95963"), false);
    }
  }

  /**
   * Initialize the replica recovery service.
   * @param {Object} options - Initialization options.
   */
  initialize(options = {}) {
    if (stryMutAct_9fa48("95964")) {
      {}
    } else {
      stryCov_9fa48("95964");
      if (stryMutAct_9fa48("95966") ? false : stryMutAct_9fa48("95965") ? true : (stryCov_9fa48("95965", "95966"), options.systemTableCache)) {
        if (stryMutAct_9fa48("95967")) {
          {}
        } else {
          stryCov_9fa48("95967");
          this.systemTableCache = options.systemTableCache;
        }
      }
      if (stryMutAct_9fa48("95969") ? false : stryMutAct_9fa48("95968") ? true : (stryCov_9fa48("95968", "95969"), options.cdcIntegrationService)) {
        if (stryMutAct_9fa48("95970")) {
          {}
        } else {
          stryCov_9fa48("95970");
          this.cdcIntegrationService = options.cdcIntegrationService;
        }
      }
      if (stryMutAct_9fa48("95972") ? false : stryMutAct_9fa48("95971") ? true : (stryCov_9fa48("95971", "95972"), options.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("95973")) {
          {}
        } else {
          stryCov_9fa48("95973");
          this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
        }
      }
      if (stryMutAct_9fa48("95975") ? false : stryMutAct_9fa48("95974") ? true : (stryCov_9fa48("95974", "95975"), options.nodeId)) {
        if (stryMutAct_9fa48("95976")) {
          {}
        } else {
          stryCov_9fa48("95976");
          this.nodeId = options.nodeId;
        }
      }
      if (stryMutAct_9fa48("95979") ? false : stryMutAct_9fa48("95978") ? true : stryMutAct_9fa48("95977") ? this.nodeId : (stryCov_9fa48("95977", "95978", "95979"), !this.nodeId)) {
        if (stryMutAct_9fa48("95980")) {
          {}
        } else {
          stryCov_9fa48("95980");
          throw new Error(REPLICA_RECOVERY_ERROR_MSG.MISSING_NODE_ID);
        }
      }
      this.systemTableCache = assertCritical(this.systemTableCache, REPLICA_RECOVERY_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE);
      this.cdcIntegrationService = assertCritical(this.cdcIntegrationService, REPLICA_RECOVERY_ERROR_MSG.MISSING_CDC_SERVICE);
      this.initialized = stryMutAct_9fa48("95981") ? false : (stryCov_9fa48("95981"), true);
      this.logger.info(REPLICA_RECOVERY_LOG_MSG.INITIALIZED, stryMutAct_9fa48("95982") ? {} : (stryCov_9fa48("95982"), {
        nodeId: this.nodeId,
        checkIntervalMs: this.checkIntervalMs,
        minPartitionReplicas: this.minPartitionReplicas,
        minMessageGroupReplicas: this.minMessageGroupReplicas
      }));
    }
  }

  /**
   * Start the replica recovery monitoring loop.
   */
  start() {
    if (stryMutAct_9fa48("95983")) {
      {}
    } else {
      stryCov_9fa48("95983");
      if (stryMutAct_9fa48("95986") ? false : stryMutAct_9fa48("95985") ? true : stryMutAct_9fa48("95984") ? this.initialized : (stryCov_9fa48("95984", "95985", "95986"), !this.initialized)) {
        if (stryMutAct_9fa48("95987")) {
          {}
        } else {
          stryCov_9fa48("95987");
          throw new Error(REPLICA_RECOVERY_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("95989") ? false : stryMutAct_9fa48("95988") ? true : (stryCov_9fa48("95988", "95989"), this.monitoringActive)) {
        if (stryMutAct_9fa48("95990")) {
          {}
        } else {
          stryCov_9fa48("95990");
          return; // Already running
        }
      }
      this.logger.info(REPLICA_RECOVERY_LOG_MSG.STARTING_MONITORING, stryMutAct_9fa48("95991") ? {} : (stryCov_9fa48("95991"), {
        nodeId: this.nodeId,
        intervalMs: this.checkIntervalMs
      }));
      this.monitoringActive = stryMutAct_9fa48("95992") ? false : (stryCov_9fa48("95992"), true);
      this.currentCheckIntervalMs = this.checkIntervalMs;
      this.scheduleNextCheck(this.currentCheckIntervalMs);
    }
  }

  /**
   * Stop the replica recovery monitoring loop.
   */
  stop() {
    if (stryMutAct_9fa48("95993")) {
      {}
    } else {
      stryCov_9fa48("95993");
      this.monitoringActive = stryMutAct_9fa48("95994") ? true : (stryCov_9fa48("95994"), false);
      if (stryMutAct_9fa48("95996") ? false : stryMutAct_9fa48("95995") ? true : (stryCov_9fa48("95995", "95996"), this.checkTimer)) {
        if (stryMutAct_9fa48("95997")) {
          {}
        } else {
          stryCov_9fa48("95997");
          clearTimeout(this.checkTimer);
          this.checkTimer = null;
        }
      }
      this.logger.info(REPLICA_RECOVERY_LOG_MSG.STOPPED_MONITORING, stryMutAct_9fa48("95998") ? {} : (stryCov_9fa48("95998"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Check replica counts for all partitions and message groups.
   * @return {Promise<Object>} Summary of cycle activity.
   */
  async checkReplicaCounts() {
    if (stryMutAct_9fa48("95999")) {
      {}
    } else {
      stryCov_9fa48("95999");
      const partitionSummary = await this.checkPartitionReplicas();
      const messageGroupSummary = await this.checkMessageGroupReplicas();
      const deficitCount = stryMutAct_9fa48("96000") ? partitionSummary.deficitCount - messageGroupSummary.deficitCount : (stryCov_9fa48("96000"), partitionSummary.deficitCount + messageGroupSummary.deficitCount);
      const recoveryCount = stryMutAct_9fa48("96001") ? partitionSummary.recoveryCount - messageGroupSummary.recoveryCount : (stryCov_9fa48("96001"), partitionSummary.recoveryCount + messageGroupSummary.recoveryCount);
      return stryMutAct_9fa48("96002") ? {} : (stryCov_9fa48("96002"), {
        deficitCount,
        recoveryCount,
        hadActivity: stryMutAct_9fa48("96005") ? (deficitCount > REPLICA_RECOVERY_NUM.ZERO || recoveryCount > REPLICA_RECOVERY_NUM.ZERO) && this.pendingRecoveries.size > REPLICA_RECOVERY_NUM.ZERO : stryMutAct_9fa48("96004") ? false : stryMutAct_9fa48("96003") ? true : (stryCov_9fa48("96003", "96004", "96005"), (stryMutAct_9fa48("96007") ? deficitCount > REPLICA_RECOVERY_NUM.ZERO && recoveryCount > REPLICA_RECOVERY_NUM.ZERO : stryMutAct_9fa48("96006") ? false : (stryCov_9fa48("96006", "96007"), (stryMutAct_9fa48("96010") ? deficitCount <= REPLICA_RECOVERY_NUM.ZERO : stryMutAct_9fa48("96009") ? deficitCount >= REPLICA_RECOVERY_NUM.ZERO : stryMutAct_9fa48("96008") ? false : (stryCov_9fa48("96008", "96009", "96010"), deficitCount > REPLICA_RECOVERY_NUM.ZERO)) || (stryMutAct_9fa48("96013") ? recoveryCount <= REPLICA_RECOVERY_NUM.ZERO : stryMutAct_9fa48("96012") ? recoveryCount >= REPLICA_RECOVERY_NUM.ZERO : stryMutAct_9fa48("96011") ? false : (stryCov_9fa48("96011", "96012", "96013"), recoveryCount > REPLICA_RECOVERY_NUM.ZERO)))) || (stryMutAct_9fa48("96016") ? this.pendingRecoveries.size <= REPLICA_RECOVERY_NUM.ZERO : stryMutAct_9fa48("96015") ? this.pendingRecoveries.size >= REPLICA_RECOVERY_NUM.ZERO : stryMutAct_9fa48("96014") ? false : (stryCov_9fa48("96014", "96015", "96016"), this.pendingRecoveries.size > REPLICA_RECOVERY_NUM.ZERO)))
      });
    }
  }

  /**
   * Check partition replica counts and trigger recovery if needed.
   * @return {Promise<Object>} Summary for partition entities.
   * @private
   */
  async checkPartitionReplicas() {
    if (stryMutAct_9fa48("96017")) {
      {}
    } else {
      stryCov_9fa48("96017");
      const partitions = this.getPartitions();
      let deficitCount = REPLICA_RECOVERY_NUM.ZERO;
      let recoveryCount = REPLICA_RECOVERY_NUM.ZERO;
      for (const partition of partitions) {
        if (stryMutAct_9fa48("96018")) {
          {}
        } else {
          stryCov_9fa48("96018");
          const healthyReplicas = this.getHealthyPartitionReplicas(partition.partition_id);
          const targetCount = stryMutAct_9fa48("96021") ? partition.replica_count && this.minPartitionReplicas : stryMutAct_9fa48("96020") ? false : stryMutAct_9fa48("96019") ? true : (stryCov_9fa48("96019", "96020", "96021"), partition.replica_count || this.minPartitionReplicas);
          if (stryMutAct_9fa48("96025") ? healthyReplicas.length >= targetCount : stryMutAct_9fa48("96024") ? healthyReplicas.length <= targetCount : stryMutAct_9fa48("96023") ? false : stryMutAct_9fa48("96022") ? true : (stryCov_9fa48("96022", "96023", "96024", "96025"), healthyReplicas.length < targetCount)) {
            if (stryMutAct_9fa48("96026")) {
              {}
            } else {
              stryCov_9fa48("96026");
              stryMutAct_9fa48("96027") ? deficitCount -= 1 : (stryCov_9fa48("96027"), deficitCount += 1);
              try {
                if (stryMutAct_9fa48("96028")) {
                  {}
                } else {
                  stryCov_9fa48("96028");
                  stryMutAct_9fa48("96029") ? recoveryCount -= await this.triggerPartitionRecovery(partition, healthyReplicas, targetCount) : (stryCov_9fa48("96029"), recoveryCount += await this.triggerPartitionRecovery(partition, healthyReplicas, targetCount));
                }
              } catch (error) {
                if (stryMutAct_9fa48("96030")) {
                  {}
                } else {
                  stryCov_9fa48("96030");
                  if (stryMutAct_9fa48("96033") ? error.isCritical : stryMutAct_9fa48("96032") ? false : stryMutAct_9fa48("96031") ? true : (stryCov_9fa48("96031", "96032", "96033"), error?.isCritical)) {
                    if (stryMutAct_9fa48("96034")) {
                      {}
                    } else {
                      stryCov_9fa48("96034");
                      throw error;
                    }
                  }
                  this.logger.error(REPLICA_RECOVERY_LOG_MSG.CHECK_ERROR, stryMutAct_9fa48("96035") ? {} : (stryCov_9fa48("96035"), {
                    nodeId: this.nodeId,
                    entityType: REPLICA_RECOVERY_ENTITY_TYPE.PARTITION,
                    partitionId: partition.partition_id,
                    error: error.message
                  }));
                }
              }
            }
          }
        }
      }
      return stryMutAct_9fa48("96036") ? {} : (stryCov_9fa48("96036"), {
        deficitCount,
        recoveryCount
      });
    }
  }

  /**
   * Check message group replica counts and trigger recovery if needed.
   * @return {Promise<Object>} Summary for message group entities.
   * @private
   */
  async checkMessageGroupReplicas() {
    if (stryMutAct_9fa48("96037")) {
      {}
    } else {
      stryCov_9fa48("96037");
      const messageGroups = this.getMessageGroups();
      let deficitCount = REPLICA_RECOVERY_NUM.ZERO;
      let recoveryCount = REPLICA_RECOVERY_NUM.ZERO;
      for (const group of messageGroups) {
        if (stryMutAct_9fa48("96038")) {
          {}
        } else {
          stryCov_9fa48("96038");
          const healthyReplicas = this.getHealthyMessageGroupReplicas(group.group_id);
          const targetCount = stryMutAct_9fa48("96041") ? group.replica_count && this.minMessageGroupReplicas : stryMutAct_9fa48("96040") ? false : stryMutAct_9fa48("96039") ? true : (stryCov_9fa48("96039", "96040", "96041"), group.replica_count || this.minMessageGroupReplicas);
          if (stryMutAct_9fa48("96045") ? healthyReplicas.length >= targetCount : stryMutAct_9fa48("96044") ? healthyReplicas.length <= targetCount : stryMutAct_9fa48("96043") ? false : stryMutAct_9fa48("96042") ? true : (stryCov_9fa48("96042", "96043", "96044", "96045"), healthyReplicas.length < targetCount)) {
            if (stryMutAct_9fa48("96046")) {
              {}
            } else {
              stryCov_9fa48("96046");
              stryMutAct_9fa48("96047") ? deficitCount -= 1 : (stryCov_9fa48("96047"), deficitCount += 1);
              try {
                if (stryMutAct_9fa48("96048")) {
                  {}
                } else {
                  stryCov_9fa48("96048");
                  stryMutAct_9fa48("96049") ? recoveryCount -= await this.triggerMessageGroupRecovery(group, healthyReplicas, targetCount) : (stryCov_9fa48("96049"), recoveryCount += await this.triggerMessageGroupRecovery(group, healthyReplicas, targetCount));
                }
              } catch (error) {
                if (stryMutAct_9fa48("96050")) {
                  {}
                } else {
                  stryCov_9fa48("96050");
                  if (stryMutAct_9fa48("96053") ? error.isCritical : stryMutAct_9fa48("96052") ? false : stryMutAct_9fa48("96051") ? true : (stryCov_9fa48("96051", "96052", "96053"), error?.isCritical)) {
                    if (stryMutAct_9fa48("96054")) {
                      {}
                    } else {
                      stryCov_9fa48("96054");
                      throw error;
                    }
                  }
                  this.logger.error(REPLICA_RECOVERY_LOG_MSG.CHECK_ERROR, stryMutAct_9fa48("96055") ? {} : (stryCov_9fa48("96055"), {
                    nodeId: this.nodeId,
                    entityType: REPLICA_RECOVERY_ENTITY_TYPE.MESSAGE_GROUP,
                    groupId: group.group_id,
                    error: error.message
                  }));
                }
              }
            }
          }
        }
      }
      return stryMutAct_9fa48("96056") ? {} : (stryCov_9fa48("96056"), {
        deficitCount,
        recoveryCount
      });
    }
  }

  /**
   * Schedule the next monitoring cycle as a one-shot timer.
   * @param {number} delayMs - Delay before next cycle.
   * @private
   */
  scheduleNextCheck(delayMs) {
    if (stryMutAct_9fa48("96057")) {
      {}
    } else {
      stryCov_9fa48("96057");
      if (stryMutAct_9fa48("96060") ? false : stryMutAct_9fa48("96059") ? true : stryMutAct_9fa48("96058") ? this.monitoringActive : (stryCov_9fa48("96058", "96059", "96060"), !this.monitoringActive)) {
        if (stryMutAct_9fa48("96061")) {
          {}
        } else {
          stryCov_9fa48("96061");
          return;
        }
      }
      const boundedDelay = stryMutAct_9fa48("96062") ? Math.min(this.checkIntervalMs, Math.min(delayMs, REPLICA_RECOVERY_DEFAULT.MAX_CHECK_INTERVAL_MS)) : (stryCov_9fa48("96062"), Math.max(this.checkIntervalMs, stryMutAct_9fa48("96063") ? Math.max(delayMs, REPLICA_RECOVERY_DEFAULT.MAX_CHECK_INTERVAL_MS) : (stryCov_9fa48("96063"), Math.min(delayMs, REPLICA_RECOVERY_DEFAULT.MAX_CHECK_INTERVAL_MS))));
      this.checkTimer = setTimeout(async () => {
        if (stryMutAct_9fa48("96064")) {
          {}
        } else {
          stryCov_9fa48("96064");
          this.checkTimer = null;
          if (stryMutAct_9fa48("96067") ? false : stryMutAct_9fa48("96066") ? true : stryMutAct_9fa48("96065") ? this.monitoringActive : (stryCov_9fa48("96065", "96066", "96067"), !this.monitoringActive)) {
            if (stryMutAct_9fa48("96068")) {
              {}
            } else {
              stryCov_9fa48("96068");
              return;
            }
          }
          let cycleSummary = stryMutAct_9fa48("96069") ? {} : (stryCov_9fa48("96069"), {
            hadActivity: stryMutAct_9fa48("96070") ? true : (stryCov_9fa48("96070"), false)
          });
          try {
            if (stryMutAct_9fa48("96071")) {
              {}
            } else {
              stryCov_9fa48("96071");
              cycleSummary = await this.checkReplicaCounts();
            }
          } catch (error) {
            if (stryMutAct_9fa48("96072")) {
              {}
            } else {
              stryCov_9fa48("96072");
              if (stryMutAct_9fa48("96075") ? error.isCritical : stryMutAct_9fa48("96074") ? false : stryMutAct_9fa48("96073") ? true : (stryCov_9fa48("96073", "96074", "96075"), error?.isCritical)) {
                if (stryMutAct_9fa48("96076")) {
                  {}
                } else {
                  stryCov_9fa48("96076");
                  throw error;
                }
              }
              this.logger.error(REPLICA_RECOVERY_LOG_MSG.CHECK_ERROR, stryMutAct_9fa48("96077") ? {} : (stryCov_9fa48("96077"), {
                nodeId: this.nodeId,
                error: error.message
              }));
            }
          }
          this.updateCheckCadence(cycleSummary);
          this.scheduleNextCheck(this.currentCheckIntervalMs);
        }
      }, boundedDelay);
      this.checkTimer.unref();
    }
  }

  /**
   * Adapt monitoring cadence based on recent activity.
   * @param {Object} cycleSummary - Summary returned from checkReplicaCounts.
   */
  updateCheckCadence(cycleSummary = {}) {
    if (stryMutAct_9fa48("96078")) {
      {}
    } else {
      stryCov_9fa48("96078");
      if (stryMutAct_9fa48("96080") ? false : stryMutAct_9fa48("96079") ? true : (stryCov_9fa48("96079", "96080"), cycleSummary.hadActivity)) {
        if (stryMutAct_9fa48("96081")) {
          {}
        } else {
          stryCov_9fa48("96081");
          this.currentCheckIntervalMs = this.checkIntervalMs;
          return;
        }
      }
      const nextIntervalMs = Math.floor(stryMutAct_9fa48("96082") ? this.currentCheckIntervalMs / REPLICA_RECOVERY_DEFAULT.IDLE_BACKOFF_MULTIPLIER : (stryCov_9fa48("96082"), this.currentCheckIntervalMs * REPLICA_RECOVERY_DEFAULT.IDLE_BACKOFF_MULTIPLIER));
      this.currentCheckIntervalMs = stryMutAct_9fa48("96083") ? Math.max(REPLICA_RECOVERY_DEFAULT.MAX_CHECK_INTERVAL_MS, Math.max(this.checkIntervalMs, nextIntervalMs)) : (stryCov_9fa48("96083"), Math.min(REPLICA_RECOVERY_DEFAULT.MAX_CHECK_INTERVAL_MS, stryMutAct_9fa48("96084") ? Math.min(this.checkIntervalMs, nextIntervalMs) : (stryCov_9fa48("96084"), Math.max(this.checkIntervalMs, nextIntervalMs))));
    }
  }

  /**
   * Trigger recovery for a partition with insufficient replicas.
   * @param {Object} partition - Partition needing recovery.
   * @param {Array<Object>} healthyReplicas - Current healthy replicas.
   * @param {number} targetCount - Target replica count.
   * @return {Promise<number>} Number of replicas created.
   * @private
   */
  async triggerPartitionRecovery(partition, healthyReplicas, targetCount) {
    if (stryMutAct_9fa48("96085")) {
      {}
    } else {
      stryCov_9fa48("96085");
      const needed = stryMutAct_9fa48("96086") ? targetCount + healthyReplicas.length : (stryCov_9fa48("96086"), targetCount - healthyReplicas.length);
      const recoveryKey = stryMutAct_9fa48("96087") ? `` : (stryCov_9fa48("96087"), `${REPLICA_RECOVERY_KEY_PREFIX.PARTITION}${partition.partition_id}`);

      // Check if recovery is already pending
      if (stryMutAct_9fa48("96089") ? false : stryMutAct_9fa48("96088") ? true : (stryCov_9fa48("96088", "96089"), this.pendingRecoveries.has(recoveryKey))) {
        if (stryMutAct_9fa48("96090")) {
          {}
        } else {
          stryCov_9fa48("96090");
          return REPLICA_RECOVERY_NUM.ZERO;
        }
      }
      this.logger.warn(REPLICA_RECOVERY_LOG_MSG.PARTITION_BELOW_MIN, stryMutAct_9fa48("96091") ? {} : (stryCov_9fa48("96091"), {
        partitionId: partition.partition_id,
        tableId: partition.table_id,
        healthyCount: healthyReplicas.length,
        targetCount,
        needed
      }));

      // Find healthy nodes to place new replicas
      const healthyNodes = this.getHealthyNodes();
      const existingNodeIds = new Set(healthyReplicas.map(stryMutAct_9fa48("96092") ? () => undefined : (stryCov_9fa48("96092"), r => r.node_id)));

      // Prefer nodes that don't already have a replica
      const candidateNodes = stryMutAct_9fa48("96093") ? healthyNodes : (stryCov_9fa48("96093"), healthyNodes.filter(stryMutAct_9fa48("96094") ? () => undefined : (stryCov_9fa48("96094"), n => stryMutAct_9fa48("96095") ? existingNodeIds.has(n.node_id) : (stryCov_9fa48("96095"), !existingNodeIds.has(n.node_id)))));

      // If not enough candidate nodes, allow duplicates on existing nodes
      const targetNodes = this.selectTargetNodes(candidateNodes, healthyNodes, needed);
      if (stryMutAct_9fa48("96098") ? targetNodes.length !== REPLICA_RECOVERY_NUM.ZERO : stryMutAct_9fa48("96097") ? false : stryMutAct_9fa48("96096") ? true : (stryCov_9fa48("96096", "96097", "96098"), targetNodes.length === REPLICA_RECOVERY_NUM.ZERO)) {
        if (stryMutAct_9fa48("96099")) {
          {}
        } else {
          stryCov_9fa48("96099");
          this.logger.error(REPLICA_RECOVERY_LOG_MSG.NO_HEALTHY_NODES_PARTITION, stryMutAct_9fa48("96100") ? {} : (stryCov_9fa48("96100"), {
            partitionId: partition.partition_id,
            needed
          }));
          return REPLICA_RECOVERY_NUM.ZERO;
        }
      }

      // Mark recovery as pending
      this.pendingRecoveries.set(recoveryKey, stryMutAct_9fa48("96101") ? {} : (stryCov_9fa48("96101"), {
        type: REPLICA_RECOVERY_ENTITY_TYPE.PARTITION,
        entityId: partition.partition_id,
        startedAt: Date.now(),
        targetNodes
      }));
      try {
        if (stryMutAct_9fa48("96102")) {
          {}
        } else {
          stryCov_9fa48("96102");
          // Create replacement replicas
          let createdCount = REPLICA_RECOVERY_NUM.ZERO;
          for (const node of targetNodes) {
            if (stryMutAct_9fa48("96103")) {
              {}
            } else {
              stryCov_9fa48("96103");
              await this.createPartitionReplica(partition, node.node_id);
              stryMutAct_9fa48("96104") ? createdCount -= 1 : (stryCov_9fa48("96104"), createdCount += 1);
            }
          }
          return createdCount;
        }
      } finally {
        if (stryMutAct_9fa48("96105")) {
          {}
        } else {
          stryCov_9fa48("96105");
          // Clear pending recovery even on failure so the next cycle can retry.
          this.pendingRecoveries.delete(recoveryKey);
        }
      }
    }
  }

  /**
   * Trigger recovery for a message group with insufficient replicas.
   * @param {Object} group - Message group needing recovery.
   * @param {Array<Object>} healthyReplicas - Current healthy replicas.
   * @param {number} targetCount - Target replica count.
   * @return {Promise<number>} Number of replicas created.
   * @private
   */
  async triggerMessageGroupRecovery(group, healthyReplicas, targetCount) {
    if (stryMutAct_9fa48("96106")) {
      {}
    } else {
      stryCov_9fa48("96106");
      const needed = stryMutAct_9fa48("96107") ? targetCount + healthyReplicas.length : (stryCov_9fa48("96107"), targetCount - healthyReplicas.length);
      const recoveryKey = stryMutAct_9fa48("96108") ? `` : (stryCov_9fa48("96108"), `${REPLICA_RECOVERY_KEY_PREFIX.MESSAGE_GROUP}${group.group_id}`);

      // Check if recovery is already pending
      if (stryMutAct_9fa48("96110") ? false : stryMutAct_9fa48("96109") ? true : (stryCov_9fa48("96109", "96110"), this.pendingRecoveries.has(recoveryKey))) {
        if (stryMutAct_9fa48("96111")) {
          {}
        } else {
          stryCov_9fa48("96111");
          return REPLICA_RECOVERY_NUM.ZERO;
        }
      }
      this.logger.warn(REPLICA_RECOVERY_LOG_MSG.MESSAGE_GROUP_BELOW_MIN, stryMutAct_9fa48("96112") ? {} : (stryCov_9fa48("96112"), {
        groupId: group.group_id,
        healthyCount: healthyReplicas.length,
        targetCount,
        needed
      }));

      // Find healthy nodes to place new replicas
      const healthyNodes = this.getHealthyNodes();
      const existingNodeIds = new Set(healthyReplicas.map(stryMutAct_9fa48("96113") ? () => undefined : (stryCov_9fa48("96113"), r => r.node_id)));

      // Prefer nodes that don't already have a replica
      const candidateNodes = stryMutAct_9fa48("96114") ? healthyNodes : (stryCov_9fa48("96114"), healthyNodes.filter(stryMutAct_9fa48("96115") ? () => undefined : (stryCov_9fa48("96115"), n => stryMutAct_9fa48("96116") ? existingNodeIds.has(n.node_id) : (stryCov_9fa48("96116"), !existingNodeIds.has(n.node_id)))));

      // If not enough candidate nodes, allow duplicates on existing nodes
      const targetNodes = this.selectTargetNodes(candidateNodes, healthyNodes, needed);
      if (stryMutAct_9fa48("96119") ? targetNodes.length !== REPLICA_RECOVERY_NUM.ZERO : stryMutAct_9fa48("96118") ? false : stryMutAct_9fa48("96117") ? true : (stryCov_9fa48("96117", "96118", "96119"), targetNodes.length === REPLICA_RECOVERY_NUM.ZERO)) {
        if (stryMutAct_9fa48("96120")) {
          {}
        } else {
          stryCov_9fa48("96120");
          this.logger.error(REPLICA_RECOVERY_LOG_MSG.NO_HEALTHY_NODES_MESSAGE_GROUP, stryMutAct_9fa48("96121") ? {} : (stryCov_9fa48("96121"), {
            groupId: group.group_id,
            needed
          }));
          return REPLICA_RECOVERY_NUM.ZERO;
        }
      }

      // Mark recovery as pending
      this.pendingRecoveries.set(recoveryKey, stryMutAct_9fa48("96122") ? {} : (stryCov_9fa48("96122"), {
        type: REPLICA_RECOVERY_ENTITY_TYPE.MESSAGE_GROUP,
        entityId: group.group_id,
        startedAt: Date.now(),
        targetNodes
      }));
      try {
        if (stryMutAct_9fa48("96123")) {
          {}
        } else {
          stryCov_9fa48("96123");
          // Create replacement replicas
          let createdCount = REPLICA_RECOVERY_NUM.ZERO;
          for (const node of targetNodes) {
            if (stryMutAct_9fa48("96124")) {
              {}
            } else {
              stryCov_9fa48("96124");
              await this.createMessageGroupReplica(group, node.node_id);
              stryMutAct_9fa48("96125") ? createdCount -= 1 : (stryCov_9fa48("96125"), createdCount += 1);
            }
          }
          return createdCount;
        }
      } finally {
        if (stryMutAct_9fa48("96126")) {
          {}
        } else {
          stryCov_9fa48("96126");
          // Clear pending recovery even on failure so the next cycle can retry.
          this.pendingRecoveries.delete(recoveryKey);
        }
      }
    }
  }

  /**
   * Select target nodes for replica placement.
   * @param {Array<Object>} preferredNodes - Nodes without existing replicas.
   * @param {Array<Object>} allNodes - All healthy nodes.
   * @param {number} needed - Number of replicas needed.
   * @return {Array<Object>} Selected target nodes.
   * @private
   */
  selectTargetNodes(preferredNodes, allNodes, needed) {
    if (stryMutAct_9fa48("96127")) {
      {}
    } else {
      stryCov_9fa48("96127");
      const selected = stryMutAct_9fa48("96128") ? ["Stryker was here"] : (stryCov_9fa48("96128"), []);
      const selectedNodeIds = new Set();
      const pushDistinctNode = node => {
        if (stryMutAct_9fa48("96129")) {
          {}
        } else {
          stryCov_9fa48("96129");
          if (stryMutAct_9fa48("96132") ? !node?.node_id && selectedNodeIds.has(node.node_id) : stryMutAct_9fa48("96131") ? false : stryMutAct_9fa48("96130") ? true : (stryCov_9fa48("96130", "96131", "96132"), (stryMutAct_9fa48("96133") ? node?.node_id : (stryCov_9fa48("96133"), !(stryMutAct_9fa48("96134") ? node.node_id : (stryCov_9fa48("96134"), node?.node_id)))) || selectedNodeIds.has(node.node_id))) {
            if (stryMutAct_9fa48("96135")) {
              {}
            } else {
              stryCov_9fa48("96135");
              return stryMutAct_9fa48("96136") ? true : (stryCov_9fa48("96136"), false);
            }
          }
          selected.push(node);
          selectedNodeIds.add(node.node_id);
          return stryMutAct_9fa48("96137") ? false : (stryCov_9fa48("96137"), true);
        }
      };

      // First, use preferred nodes (no existing replicas)
      for (let i = REPLICA_RECOVERY_NUM.ZERO; stryMutAct_9fa48("96140") ? i >= Math.min(needed, preferredNodes.length) : stryMutAct_9fa48("96139") ? i <= Math.min(needed, preferredNodes.length) : stryMutAct_9fa48("96138") ? false : (stryCov_9fa48("96138", "96139", "96140"), i < (stryMutAct_9fa48("96141") ? Math.max(needed, preferredNodes.length) : (stryCov_9fa48("96141"), Math.min(needed, preferredNodes.length)))); stryMutAct_9fa48("96142") ? i-- : (stryCov_9fa48("96142"), i++)) {
        if (stryMutAct_9fa48("96143")) {
          {}
        } else {
          stryCov_9fa48("96143");
          pushDistinctNode(preferredNodes[i]);
        }
      }

      // If still need more, use other healthy nodes before duplicating.
      const remaining = stryMutAct_9fa48("96144") ? needed + selected.length : (stryCov_9fa48("96144"), needed - selected.length);
      if (stryMutAct_9fa48("96147") ? remaining > REPLICA_RECOVERY_NUM.ZERO || allNodes.length > REPLICA_RECOVERY_NUM.ZERO : stryMutAct_9fa48("96146") ? false : stryMutAct_9fa48("96145") ? true : (stryCov_9fa48("96145", "96146", "96147"), (stryMutAct_9fa48("96150") ? remaining <= REPLICA_RECOVERY_NUM.ZERO : stryMutAct_9fa48("96149") ? remaining >= REPLICA_RECOVERY_NUM.ZERO : stryMutAct_9fa48("96148") ? true : (stryCov_9fa48("96148", "96149", "96150"), remaining > REPLICA_RECOVERY_NUM.ZERO)) && (stryMutAct_9fa48("96153") ? allNodes.length <= REPLICA_RECOVERY_NUM.ZERO : stryMutAct_9fa48("96152") ? allNodes.length >= REPLICA_RECOVERY_NUM.ZERO : stryMutAct_9fa48("96151") ? true : (stryCov_9fa48("96151", "96152", "96153"), allNodes.length > REPLICA_RECOVERY_NUM.ZERO)))) {
        if (stryMutAct_9fa48("96154")) {
          {}
        } else {
          stryCov_9fa48("96154");
          const sortedNodes = this.sortNodesByLoad(allNodes);
          for (const node of sortedNodes) {
            if (stryMutAct_9fa48("96155")) {
              {}
            } else {
              stryCov_9fa48("96155");
              if (stryMutAct_9fa48("96159") ? selected.length < needed : stryMutAct_9fa48("96158") ? selected.length > needed : stryMutAct_9fa48("96157") ? false : stryMutAct_9fa48("96156") ? true : (stryCov_9fa48("96156", "96157", "96158", "96159"), selected.length >= needed)) {
                if (stryMutAct_9fa48("96160")) {
                  {}
                } else {
                  stryCov_9fa48("96160");
                  break;
                }
              }
              pushDistinctNode(node);
            }
          }

          // Only duplicate placements when the cluster cannot satisfy the request
          // with distinct healthy nodes.
          for (const node of sortedNodes) {
            if (stryMutAct_9fa48("96161")) {
              {}
            } else {
              stryCov_9fa48("96161");
              if (stryMutAct_9fa48("96165") ? selected.length < needed : stryMutAct_9fa48("96164") ? selected.length > needed : stryMutAct_9fa48("96163") ? false : stryMutAct_9fa48("96162") ? true : (stryCov_9fa48("96162", "96163", "96164", "96165"), selected.length >= needed)) {
                if (stryMutAct_9fa48("96166")) {
                  {}
                } else {
                  stryCov_9fa48("96166");
                  break;
                }
              }
              selected.push(node);
            }
          }
        }
      }
      return selected;
    }
  }

  /**
   * Sort nodes by load (prefer less loaded nodes).
   * @param {Array<Object>} nodes - Nodes to sort.
   * @return {Array<Object>} Sorted nodes.
   * @private
   */
  sortNodesByLoad(nodes) {
    if (stryMutAct_9fa48("96167")) {
      {}
    } else {
      stryCov_9fa48("96167");
      return stryMutAct_9fa48("96168") ? [...nodes] : (stryCov_9fa48("96168"), (stryMutAct_9fa48("96169") ? [] : (stryCov_9fa48("96169"), [...nodes])).sort((a, b) => {
        if (stryMutAct_9fa48("96170")) {
          {}
        } else {
          stryCov_9fa48("96170");
          const loadA = stryMutAct_9fa48("96171") ? (a.cpu_usage_percent || NUM.ZERO) + (a.memory_usage_percent || NUM.ZERO) - (a.disk_usage_percent || NUM.ZERO) : (stryCov_9fa48("96171"), (stryMutAct_9fa48("96172") ? (a.cpu_usage_percent || NUM.ZERO) - (a.memory_usage_percent || NUM.ZERO) : (stryCov_9fa48("96172"), (stryMutAct_9fa48("96175") ? a.cpu_usage_percent && NUM.ZERO : stryMutAct_9fa48("96174") ? false : stryMutAct_9fa48("96173") ? true : (stryCov_9fa48("96173", "96174", "96175"), a.cpu_usage_percent || NUM.ZERO)) + (stryMutAct_9fa48("96178") ? a.memory_usage_percent && NUM.ZERO : stryMutAct_9fa48("96177") ? false : stryMutAct_9fa48("96176") ? true : (stryCov_9fa48("96176", "96177", "96178"), a.memory_usage_percent || NUM.ZERO)))) + (stryMutAct_9fa48("96181") ? a.disk_usage_percent && NUM.ZERO : stryMutAct_9fa48("96180") ? false : stryMutAct_9fa48("96179") ? true : (stryCov_9fa48("96179", "96180", "96181"), a.disk_usage_percent || NUM.ZERO)));
          const loadB = stryMutAct_9fa48("96182") ? (b.cpu_usage_percent || NUM.ZERO) + (b.memory_usage_percent || NUM.ZERO) - (b.disk_usage_percent || NUM.ZERO) : (stryCov_9fa48("96182"), (stryMutAct_9fa48("96183") ? (b.cpu_usage_percent || NUM.ZERO) - (b.memory_usage_percent || NUM.ZERO) : (stryCov_9fa48("96183"), (stryMutAct_9fa48("96186") ? b.cpu_usage_percent && NUM.ZERO : stryMutAct_9fa48("96185") ? false : stryMutAct_9fa48("96184") ? true : (stryCov_9fa48("96184", "96185", "96186"), b.cpu_usage_percent || NUM.ZERO)) + (stryMutAct_9fa48("96189") ? b.memory_usage_percent && NUM.ZERO : stryMutAct_9fa48("96188") ? false : stryMutAct_9fa48("96187") ? true : (stryCov_9fa48("96187", "96188", "96189"), b.memory_usage_percent || NUM.ZERO)))) + (stryMutAct_9fa48("96192") ? b.disk_usage_percent && NUM.ZERO : stryMutAct_9fa48("96191") ? false : stryMutAct_9fa48("96190") ? true : (stryCov_9fa48("96190", "96191", "96192"), b.disk_usage_percent || NUM.ZERO)));
          return stryMutAct_9fa48("96193") ? loadA + loadB : (stryCov_9fa48("96193"), loadA - loadB);
        }
      }));
    }
  }

  /**
   * Create a new partition replica on a node.
   * @param {Object} partition - Partition to replicate.
   * @param {string} nodeId - Target node ID.
   * @return {Promise<Object>} Created replica info.
   * @private
   */
  async createPartitionReplica(partition, nodeId) {
    if (stryMutAct_9fa48("96194")) {
      {}
    } else {
      stryCov_9fa48("96194");
      const serviceId = uuidv4();
      this.logger.info(REPLICA_RECOVERY_LOG_MSG.CREATE_PARTITION_REPLICA, stryMutAct_9fa48("96195") ? {} : (stryCov_9fa48("96195"), {
        partitionId: partition.partition_id,
        tableId: partition.table_id,
        nodeId,
        serviceId
      }));
      try {
        if (stryMutAct_9fa48("96196")) {
          {}
        } else {
          stryCov_9fa48("96196");
          await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("96197") ? {} : (stryCov_9fa48("96197"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
            tableName: SYSTEM_TABLE_NAME.SERVICES,
            row: stryMutAct_9fa48("96198") ? {} : (stryCov_9fa48("96198"), {
              service_id: serviceId,
              node_id: nodeId,
              service_type: ServiceType.PARTITION_REPLICA,
              partition_id: partition.partition_id,
              table_id: partition.table_id,
              status: ReplicaStatus.STARTING,
              created_at: Date.now(),
              id: serviceId
            })
          }), stryMutAct_9fa48("96199") ? {} : (stryCov_9fa48("96199"), {
            workClass: PRESSURE_WORK_CLASS.CRITICAL,
            deliveryPriority: stryMutAct_9fa48("96200") ? "" : (stryCov_9fa48("96200"), 'critical')
          }));
          stryMutAct_9fa48("96201") ? this.recoveryCount-- : (stryCov_9fa48("96201"), this.recoveryCount++);
          this.emit(REPLICA_RECOVERY_EVENT.REPLICA_CREATED, stryMutAct_9fa48("96202") ? {} : (stryCov_9fa48("96202"), {
            type: REPLICA_RECOVERY_ENTITY_TYPE.PARTITION,
            serviceId,
            partitionId: partition.partition_id,
            nodeId
          }));
          return stryMutAct_9fa48("96203") ? {} : (stryCov_9fa48("96203"), {
            success: stryMutAct_9fa48("96204") ? false : (stryCov_9fa48("96204"), true),
            serviceId,
            partitionId: partition.partition_id,
            nodeId
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("96205")) {
          {}
        } else {
          stryCov_9fa48("96205");
          this.logger.error(REPLICA_RECOVERY_LOG_MSG.CREATE_PARTITION_FAILED, stryMutAct_9fa48("96206") ? {} : (stryCov_9fa48("96206"), {
            partitionId: partition.partition_id,
            nodeId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Create a new message group replica on a node.
   * @param {Object} group - Message group to replicate.
   * @param {string} nodeId - Target node ID.
   * @return {Promise<Object>} Created replica info.
   * @private
   */
  async createMessageGroupReplica(group, nodeId) {
    if (stryMutAct_9fa48("96207")) {
      {}
    } else {
      stryCov_9fa48("96207");
      const serviceId = uuidv4();
      this.logger.info(REPLICA_RECOVERY_LOG_MSG.CREATE_MESSAGE_GROUP_REPLICA, stryMutAct_9fa48("96208") ? {} : (stryCov_9fa48("96208"), {
        groupId: group.group_id,
        nodeId,
        serviceId
      }));
      try {
        if (stryMutAct_9fa48("96209")) {
          {}
        } else {
          stryCov_9fa48("96209");
          await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("96210") ? {} : (stryCov_9fa48("96210"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
            tableName: SYSTEM_TABLE_NAME.SERVICES,
            row: stryMutAct_9fa48("96211") ? {} : (stryCov_9fa48("96211"), {
              service_id: serviceId,
              node_id: nodeId,
              service_type: ServiceType.MESSAGE_GROUP_REPLICA,
              group_id: group.group_id,
              status: ReplicaStatus.STARTING,
              created_at: Date.now(),
              id: serviceId
            })
          }), stryMutAct_9fa48("96212") ? {} : (stryCov_9fa48("96212"), {
            workClass: PRESSURE_WORK_CLASS.CRITICAL,
            deliveryPriority: stryMutAct_9fa48("96213") ? "" : (stryCov_9fa48("96213"), 'critical')
          }));
          stryMutAct_9fa48("96214") ? this.recoveryCount-- : (stryCov_9fa48("96214"), this.recoveryCount++);
          this.emit(REPLICA_RECOVERY_EVENT.REPLICA_CREATED, stryMutAct_9fa48("96215") ? {} : (stryCov_9fa48("96215"), {
            type: REPLICA_RECOVERY_ENTITY_TYPE.MESSAGE_GROUP,
            serviceId,
            groupId: group.group_id,
            nodeId
          }));
          return stryMutAct_9fa48("96216") ? {} : (stryCov_9fa48("96216"), {
            success: stryMutAct_9fa48("96217") ? false : (stryCov_9fa48("96217"), true),
            serviceId,
            groupId: group.group_id,
            nodeId
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("96218")) {
          {}
        } else {
          stryCov_9fa48("96218");
          this.logger.error(REPLICA_RECOVERY_LOG_MSG.CREATE_MESSAGE_GROUP_FAILED, stryMutAct_9fa48("96219") ? {} : (stryCov_9fa48("96219"), {
            groupId: group.group_id,
            nodeId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("96220")) {
      {}
    } else {
      stryCov_9fa48("96220");
      if (stryMutAct_9fa48("96222") ? false : stryMutAct_9fa48("96221") ? true : (stryCov_9fa48("96221", "96222"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("96223")) {
          {}
        } else {
          stryCov_9fa48("96223");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("96224") ? {} : (stryCov_9fa48("96224"), {
        nodeId: this.nodeId,
        getCdcIntegrationService: stryMutAct_9fa48("96225") ? () => undefined : (stryCov_9fa48("96225"), () => this.cdcIntegrationService)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }

  /**
   * Get all partitions from cache.
   * @return {Array<Object>} Array of partition objects.
   * @private
   */
  getPartitions() {
    if (stryMutAct_9fa48("96226")) {
      {}
    } else {
      stryCov_9fa48("96226");
      assertCritical(this.systemTableCache, REPLICA_RECOVERY_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE);
      return this.systemTableCache.getAll(SYSTEM_TABLE_NAME.PARTITIONS);
    }
  }

  /**
   * Get all message groups from cache.
   * @return {Array<Object>} Array of message group objects.
   * @private
   */
  getMessageGroups() {
    if (stryMutAct_9fa48("96227")) {
      {}
    } else {
      stryCov_9fa48("96227");
      assertCritical(this.systemTableCache, REPLICA_RECOVERY_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE);
      return this.systemTableCache.getAll(SYSTEM_TABLE_NAME.MESSAGE_GROUPS);
    }
  }

  /**
   * Get healthy partition replicas for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Array of healthy replica objects.
   * @private
   */
  getHealthyPartitionReplicas(partitionId) {
    if (stryMutAct_9fa48("96228")) {
      {}
    } else {
      stryCov_9fa48("96228");
      assertCritical(this.systemTableCache, REPLICA_RECOVERY_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE);
      const services = stryMutAct_9fa48("96229") ? this.systemTableCache : (stryCov_9fa48("96229"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, service => {
        if (stryMutAct_9fa48("96230")) {
          {}
        } else {
          stryCov_9fa48("96230");
          return stryMutAct_9fa48("96233") ? service.partition_id === partitionId && service.service_type === ServiceType.PARTITION_REPLICA || service.status === ReplicaStatus.ACTIVE : stryMutAct_9fa48("96232") ? false : stryMutAct_9fa48("96231") ? true : (stryCov_9fa48("96231", "96232", "96233"), (stryMutAct_9fa48("96235") ? service.partition_id === partitionId || service.service_type === ServiceType.PARTITION_REPLICA : stryMutAct_9fa48("96234") ? true : (stryCov_9fa48("96234", "96235"), (stryMutAct_9fa48("96237") ? service.partition_id !== partitionId : stryMutAct_9fa48("96236") ? true : (stryCov_9fa48("96236", "96237"), service.partition_id === partitionId)) && (stryMutAct_9fa48("96239") ? service.service_type !== ServiceType.PARTITION_REPLICA : stryMutAct_9fa48("96238") ? true : (stryCov_9fa48("96238", "96239"), service.service_type === ServiceType.PARTITION_REPLICA)))) && (stryMutAct_9fa48("96241") ? service.status !== ReplicaStatus.ACTIVE : stryMutAct_9fa48("96240") ? true : (stryCov_9fa48("96240", "96241"), service.status === ReplicaStatus.ACTIVE)));
        }
      }));

      // Also check that the node is healthy
      return stryMutAct_9fa48("96242") ? services : (stryCov_9fa48("96242"), services.filter(service => {
        if (stryMutAct_9fa48("96243")) {
          {}
        } else {
          stryCov_9fa48("96243");
          const node = this.getNode(service.node_id);
          return stryMutAct_9fa48("96246") ? node || node.status === NodeStatus.ACTIVE : stryMutAct_9fa48("96245") ? false : stryMutAct_9fa48("96244") ? true : (stryCov_9fa48("96244", "96245", "96246"), node && (stryMutAct_9fa48("96248") ? node.status !== NodeStatus.ACTIVE : stryMutAct_9fa48("96247") ? true : (stryCov_9fa48("96247", "96248"), node.status === NodeStatus.ACTIVE)));
        }
      }));
    }
  }

  /**
   * Get healthy message group replicas for a message group.
   * @param {string} groupId - Message group ID.
   * @return {Array<Object>} Array of healthy replica objects.
   * @private
   */
  getHealthyMessageGroupReplicas(groupId) {
    if (stryMutAct_9fa48("96249")) {
      {}
    } else {
      stryCov_9fa48("96249");
      assertCritical(this.systemTableCache, REPLICA_RECOVERY_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE);
      const services = stryMutAct_9fa48("96250") ? this.systemTableCache : (stryCov_9fa48("96250"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, service => {
        if (stryMutAct_9fa48("96251")) {
          {}
        } else {
          stryCov_9fa48("96251");
          return stryMutAct_9fa48("96254") ? service.group_id === groupId && service.service_type === ServiceType.MESSAGE_GROUP_REPLICA || service.status === ReplicaStatus.ACTIVE : stryMutAct_9fa48("96253") ? false : stryMutAct_9fa48("96252") ? true : (stryCov_9fa48("96252", "96253", "96254"), (stryMutAct_9fa48("96256") ? service.group_id === groupId || service.service_type === ServiceType.MESSAGE_GROUP_REPLICA : stryMutAct_9fa48("96255") ? true : (stryCov_9fa48("96255", "96256"), (stryMutAct_9fa48("96258") ? service.group_id !== groupId : stryMutAct_9fa48("96257") ? true : (stryCov_9fa48("96257", "96258"), service.group_id === groupId)) && (stryMutAct_9fa48("96260") ? service.service_type !== ServiceType.MESSAGE_GROUP_REPLICA : stryMutAct_9fa48("96259") ? true : (stryCov_9fa48("96259", "96260"), service.service_type === ServiceType.MESSAGE_GROUP_REPLICA)))) && (stryMutAct_9fa48("96262") ? service.status !== ReplicaStatus.ACTIVE : stryMutAct_9fa48("96261") ? true : (stryCov_9fa48("96261", "96262"), service.status === ReplicaStatus.ACTIVE)));
        }
      }));

      // Also check that the node is healthy
      return stryMutAct_9fa48("96263") ? services : (stryCov_9fa48("96263"), services.filter(service => {
        if (stryMutAct_9fa48("96264")) {
          {}
        } else {
          stryCov_9fa48("96264");
          const node = this.getNode(service.node_id);
          return stryMutAct_9fa48("96267") ? node || node.status === NodeStatus.ACTIVE : stryMutAct_9fa48("96266") ? false : stryMutAct_9fa48("96265") ? true : (stryCov_9fa48("96265", "96266", "96267"), node && (stryMutAct_9fa48("96269") ? node.status !== NodeStatus.ACTIVE : stryMutAct_9fa48("96268") ? true : (stryCov_9fa48("96268", "96269"), node.status === NodeStatus.ACTIVE)));
        }
      }));
    }
  }

  /**
   * Get healthy nodes from cache.
   * @return {Array<Object>} Array of healthy node objects.
   * @private
   */
  getHealthyNodes() {
    if (stryMutAct_9fa48("96270")) {
      {}
    } else {
      stryCov_9fa48("96270");
      assertCritical(this.systemTableCache, REPLICA_RECOVERY_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE);
      return stryMutAct_9fa48("96271") ? this.systemTableCache : (stryCov_9fa48("96271"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.NODES, node => {
        if (stryMutAct_9fa48("96272")) {
          {}
        } else {
          stryCov_9fa48("96272");
          return stryMutAct_9fa48("96275") ? node.status !== NodeStatus.ACTIVE : stryMutAct_9fa48("96274") ? false : stryMutAct_9fa48("96273") ? true : (stryCov_9fa48("96273", "96274", "96275"), node.status === NodeStatus.ACTIVE);
        }
      }));
    }
  }

  /**
   * Get a node by ID from cache.
   * @param {string} nodeId - Node ID.
   * @return {Object|null} Node object or null.
   * @private
   */
  getNode(nodeId) {
    if (stryMutAct_9fa48("96276")) {
      {}
    } else {
      stryCov_9fa48("96276");
      assertCritical(this.systemTableCache, REPLICA_RECOVERY_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE);
      const nodes = stryMutAct_9fa48("96277") ? this.systemTableCache : (stryCov_9fa48("96277"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.NODES, node => {
        if (stryMutAct_9fa48("96278")) {
          {}
        } else {
          stryCov_9fa48("96278");
          return stryMutAct_9fa48("96281") ? node.node_id !== nodeId : stryMutAct_9fa48("96280") ? false : stryMutAct_9fa48("96279") ? true : (stryCov_9fa48("96279", "96280", "96281"), node.node_id === nodeId);
        }
      }));
      return stryMutAct_9fa48("96284") ? nodes[NUM.ZERO] && null : stryMutAct_9fa48("96283") ? false : stryMutAct_9fa48("96282") ? true : (stryCov_9fa48("96282", "96283", "96284"), nodes[NUM.ZERO] || null);
    }
  }

  /**
   * Get replica recovery statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    if (stryMutAct_9fa48("96285")) {
      {}
    } else {
      stryCov_9fa48("96285");
      return stryMutAct_9fa48("96286") ? {} : (stryCov_9fa48("96286"), {
        nodeId: this.nodeId,
        checkIntervalMs: this.checkIntervalMs,
        currentCheckIntervalMs: this.currentCheckIntervalMs,
        minPartitionReplicas: this.minPartitionReplicas,
        minMessageGroupReplicas: this.minMessageGroupReplicas,
        pendingRecoveries: this.pendingRecoveries.size,
        recoveryCount: this.recoveryCount,
        isRunning: this.monitoringActive,
        initialized: this.initialized
      });
    }
  }

  /**
   * Check if service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("96287")) {
      {}
    } else {
      stryCov_9fa48("96287");
      return this.initialized;
    }
  }

  /**
   * Check if service is running.
   * @return {boolean} True if running.
   */
  isRunning() {
    if (stryMutAct_9fa48("96288")) {
      {}
    } else {
      stryCov_9fa48("96288");
      return this.monitoringActive;
    }
  }

  /**
   * Shutdown the replica recovery service.
   */
  shutdown() {
    if (stryMutAct_9fa48("96289")) {
      {}
    } else {
      stryCov_9fa48("96289");
      this.stop();
      this.pendingRecoveries.clear();
      this.initialized = stryMutAct_9fa48("96290") ? true : (stryCov_9fa48("96290"), false);
      this.logger.info(REPLICA_RECOVERY_LOG_MSG.SHUTDOWN, stryMutAct_9fa48("96291") ? {} : (stryCov_9fa48("96291"), {
        nodeId: this.nodeId,
        totalRecoveries: this.recoveryCount
      }));
    }
  }
}
export { ReplicaRecoveryService, NodeStatus, ReplicaStatus, ServiceType };