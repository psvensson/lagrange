/**
 * Seed Partitions Phase — handles Phase 3 of seed bootstrap:
 * creating system table partitions with deferred elections,
 * partition leadership wait, epoch manager initialization,
 * and partition replica progress reporting.
 *
 * Extracted from BootstrapService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
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
import { PartitionService } from '../../partition/partition-service.js';
import { assertCritical } from '../../utils/assert.js';
import { AssignmentEpochManager } from '../../rebalancer/assignment-epoch-manager.js';
import { AssignmentEpoch } from '../../rebalancer/assignment-epoch.js';
import { EPOCH_CONFIG_KEY } from '../../cdc/cdc-integration-service.js';
import { StartupRecoveryCoordinator } from '../startup-recovery-coordinator.js';
import { isPriorityControlPlanePartition } from '../system-partition-classification.js';
import { resolveCanonicalLeaderService } from '../../cache/leader-readiness-gate.js';
import { BOOTSTRAP_PHASE, BOOTSTRAP_DEFAULT, BOOTSTRAP_ERROR, BOOTSTRAP_LOG_MSG, BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT, BOOTSTRAP_REPLICA_PROGRESS, BOOTSTRAP_UNIFIED_RECONCILE } from '../bootstrap-constants.js';
import { SYSTEM_TABLE_NAME, SYSTEM_TABLE_SCHEMAS, INITIAL_PARTITION_IDS, INITIAL_REPLICA_IDS, INITIAL_MESSAGE_GROUP_ID, INITIAL_MESSAGE_GROUP_REPLICA_IDS } from '../system-table-schemas-constants.js';
import { PARTITION_SERVICE_INIT_STAGE } from '../../partition/partition-service-constants.js';
import { ADDRESS, COLUMN, ENTITY_TYPE, NUM, SERVICE_DESCRIPTOR_FIELD, SERVICE_LIFECYCLE_STATE, SERVICE_TYPE, STRING, UNIFIED_SERVICE_TYPE } from '../../constants/index.js';

/**
 * Handles the partitions phase of seed bootstrap.
 */
class SeedPartitionsPhase {
  /**
   * @param {Object} options
   * @param {Object} options.delegates - Callbacks into the bootstrap
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("26898")) {
      {}
    } else {
      stryCov_9fa48("26898");
      this.delegates = stryMutAct_9fa48("26901") ? options.delegates && {} : stryMutAct_9fa48("26900") ? false : stryMutAct_9fa48("26899") ? true : (stryCov_9fa48("26899", "26900", "26901"), options.delegates || {});
      this.satisfiedPartitionLeadershipSetKey = null;
    }
  }

  /**
   * Phase 3: Partition creation for system tables.
   * Elections are deferred until ALL partitions are created.
   * @return {Promise<void>}
   */
  async phasePartitions() {
    if (stryMutAct_9fa48("26902")) {
      {}
    } else {
      stryCov_9fa48("26902");
      const d = this.delegates;
      const logger = d.getLogger();
      const config = d.getConfig();
      const replicaStaggerDelayMs = config.replicaStaggerDelayMs;
      let queuedPartitionReplicaCount = NUM.ZERO;
      d.resetPartitionReplicas();
      for (const schema of SYSTEM_TABLE_SCHEMAS) {
        if (stryMutAct_9fa48("26903")) {
          {}
        } else {
          stryCov_9fa48("26903");
          const tableName = schema.tableName;
          const partitionId = INITIAL_PARTITION_IDS[tableName];
          const replicaIds = INITIAL_REPLICA_IDS[tableName];
          logger.debug(BOOTSTRAP_LOG_MSG.CREATING_SYSTEM_PARTITION, stryMutAct_9fa48("26904") ? {} : (stryCov_9fa48("26904"), {
            tableName,
            partitionId,
            replicaCount: replicaIds.length,
            nodeId: d.getNodeId()
          }));
          const nodeId = d.getNodeId();
          const peerAddresses = replicaIds.map(stryMutAct_9fa48("26905") ? () => undefined : (stryCov_9fa48("26905"), replicaId => (stryMutAct_9fa48("26906") ? `` : (stryCov_9fa48("26906"), `${nodeId}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("26907") ? `` : (stryCov_9fa48("26907"), `${ENTITY_TYPE.PARTITION}${ADDRESS.SEPARATOR}${replicaId}`))));
          for (let index = NUM.ZERO; stryMutAct_9fa48("26910") ? index >= replicaIds.length : stryMutAct_9fa48("26909") ? index <= replicaIds.length : stryMutAct_9fa48("26908") ? false : (stryCov_9fa48("26908", "26909", "26910"), index < replicaIds.length); stryMutAct_9fa48("26911") ? index-- : (stryCov_9fa48("26911"), index++)) {
            if (stryMutAct_9fa48("26912")) {
              {}
            } else {
              stryCov_9fa48("26912");
              const replicaId = replicaIds[index];
              const dbPath = d.resolvePartitionDbPath(partitionId, replicaId);
              d.queueBootstrapServiceReplica(d.createBootstrapServiceDescriptor(UNIFIED_SERVICE_TYPE.PARTITION, replicaId), stryMutAct_9fa48("26913") ? {} : (stryCov_9fa48("26913"), {
                serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
                tableName,
                schema,
                partitionId,
                replicaId,
                replicaIds,
                replicaIndex: index,
                peerAddresses,
                dbPath,
                deferElection: stryMutAct_9fa48("26914") ? false : (stryCov_9fa48("26914"), true),
                createDelayMs: (stryMutAct_9fa48("26918") ? index <= NUM.ZERO : stryMutAct_9fa48("26917") ? index >= NUM.ZERO : stryMutAct_9fa48("26916") ? false : stryMutAct_9fa48("26915") ? true : (stryCov_9fa48("26915", "26916", "26917", "26918"), index > NUM.ZERO)) ? stryMutAct_9fa48("26919") ? index / replicaStaggerDelayMs : (stryCov_9fa48("26919"), index * replicaStaggerDelayMs) : NUM.ZERO
              }));
              stryMutAct_9fa48("26920") ? queuedPartitionReplicaCount-- : (stryCov_9fa48("26920"), queuedPartitionReplicaCount++);
            }
          }
        }
      }
      const firstBatchReplicaCount = stryMutAct_9fa48("26921") ? Math.max(queuedPartitionReplicaCount, config.maxConcurrentServiceActions) : (stryCov_9fa48("26921"), Math.min(queuedPartitionReplicaCount, config.maxConcurrentServiceActions));
      logger.info(BOOTSTRAP_LOG_MSG.PARTITION_CREATION_BATCH_STARTING, stryMutAct_9fa48("26922") ? {} : (stryCov_9fa48("26922"), {
        nodeId: d.getNodeId(),
        tableCount: SYSTEM_TABLE_SCHEMAS.length,
        queuedReplicaCount: queuedPartitionReplicaCount,
        firstBatchReplicaCount,
        maxConcurrentServiceActions: config.maxConcurrentServiceActions
      }));
      await d.triggerBootstrapReconciler(BOOTSTRAP_UNIFIED_RECONCILE.PARTITIONS_REASON);
      d.setPartitionsCreated(SYSTEM_TABLE_SCHEMAS.length);
      await this.startDeferredBootstrapReplicaElections();
      const serviceReconciler = d.getServiceReconciler();
      if (stryMutAct_9fa48("26924") ? false : stryMutAct_9fa48("26923") ? true : (stryCov_9fa48("26923", "26924"), serviceReconciler)) {
        if (stryMutAct_9fa48("26925")) {
          {}
        } else {
          stryCov_9fa48("26925");
          serviceReconciler.stop();
        }
      }
      await this.initializeEpochManager();
      logger.debug(BOOTSTRAP_LOG_MSG.PARTITIONS_CREATED, stryMutAct_9fa48("26926") ? {} : (stryCov_9fa48("26926"), {
        partitionsCreated: d.getPartitionsCreated(),
        nodeId: d.getNodeId()
      }));
    }
  }

  /**
   * Unified lifecycle create hook for partition replicas.
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async createBootstrapPartitionReplica(context) {
    if (stryMutAct_9fa48("26927")) {
      {}
    } else {
      stryCov_9fa48("26927");
      const d = this.delegates;
      const logger = d.getLogger();
      const definition = stryMutAct_9fa48("26930") ? context?.definition && {} : stryMutAct_9fa48("26929") ? false : stryMutAct_9fa48("26928") ? true : (stryCov_9fa48("26928", "26929", "26930"), (stryMutAct_9fa48("26931") ? context.definition : (stryCov_9fa48("26931"), context?.definition)) || {});
      const serviceId = definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
      const options = d.resolveBootstrapReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.PARTITION);
      if (stryMutAct_9fa48("26933") ? false : stryMutAct_9fa48("26932") ? true : (stryCov_9fa48("26932", "26933"), d.getPartitionServices().has(options.replicaId))) {
        if (stryMutAct_9fa48("26934")) {
          {}
        } else {
          stryCov_9fa48("26934");
          return stryMutAct_9fa48("26935") ? {} : (stryCov_9fa48("26935"), {
            status: SERVICE_LIFECYCLE_STATE.CREATED
          });
        }
      }
      if (stryMutAct_9fa48("26939") ? options.createDelayMs <= NUM.ZERO : stryMutAct_9fa48("26938") ? options.createDelayMs >= NUM.ZERO : stryMutAct_9fa48("26937") ? false : stryMutAct_9fa48("26936") ? true : (stryCov_9fa48("26936", "26937", "26938", "26939"), options.createDelayMs > NUM.ZERO)) {
        if (stryMutAct_9fa48("26940")) {
          {}
        } else {
          stryCov_9fa48("26940");
          await d.sleep(options.createDelayMs);
        }
      }
      const progress = this.startPartitionReplicaProgress(stryMutAct_9fa48("26941") ? {} : (stryCov_9fa48("26941"), {
        tableName: options.tableName,
        partitionId: options.partitionId,
        replicaId: options.replicaId,
        peerTotal: stryMutAct_9fa48("26942") ? Math.min(NUM.ZERO, options.replicaIds.length - NUM.ONE) : (stryCov_9fa48("26942"), Math.max(NUM.ZERO, stryMutAct_9fa48("26943") ? options.replicaIds.length + NUM.ONE : (stryCov_9fa48("26943"), options.replicaIds.length - NUM.ONE)))
      }));
      try {
        if (stryMutAct_9fa48("26944")) {
          {}
        } else {
          stryCov_9fa48("26944");
          const partition = new PartitionService(stryMutAct_9fa48("26945") ? {} : (stryCov_9fa48("26945"), {
            partitionId: options.partitionId,
            tableId: options.tableName,
            tableName: options.tableName,
            schema: options.schema,
            keyRange: stryMutAct_9fa48("26946") ? {} : (stryCov_9fa48("26946"), {
              start: null,
              end: null
            }),
            replicaId: options.replicaId,
            replicaIds: options.replicaIds,
            peerAddresses: options.peerAddresses,
            nodeId: d.getNodeId(),
            transport: d.getTransport(),
            dbPath: options.dbPath,
            messageGroupService: d.getBootstrapMessageGroupService(),
            messageRouter: d.getMessageRouter(),
            rebalanceCoordinator: d.getRebalanceCoordinator(),
            cdcIntegrationService: d.getCdcIntegrationService(),
            sqlQueryEngine: stryMutAct_9fa48("26949") ? d.getCdcIntegrationService()?.sqlQueryEngine && null : stryMutAct_9fa48("26948") ? false : stryMutAct_9fa48("26947") ? true : (stryCov_9fa48("26947", "26948", "26949"), (stryMutAct_9fa48("26950") ? d.getCdcIntegrationService().sqlQueryEngine : (stryCov_9fa48("26950"), d.getCdcIntegrationService()?.sqlQueryEngine)) || null),
            deferElection: Boolean(options.deferElection),
            bootstrapReadinessState: (stryMutAct_9fa48("26953") ? typeof d.getBootstrapReadinessState !== 'function' : stryMutAct_9fa48("26952") ? false : stryMutAct_9fa48("26951") ? true : (stryCov_9fa48("26951", "26952", "26953"), typeof d.getBootstrapReadinessState === (stryMutAct_9fa48("26954") ? "" : (stryCov_9fa48("26954"), 'function')))) ? d.getBootstrapReadinessState() : null,
            suppressLifecycleLogs: stryMutAct_9fa48("26955") ? false : (stryCov_9fa48("26955"), true),
            onInitializationStage: stryMutAct_9fa48("26956") ? () => undefined : (stryCov_9fa48("26956"), stageEvent => this.updatePartitionReplicaProgress(progress, stageEvent))
          }));
          await partition.initialize();
          d.getPartitionServices().set(options.replicaId, partition);
          d.pushPartitionReplica(partition);
          d.incrementServicesCreated();
          this.finishPartitionReplicaProgress(progress);
          logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_REPLICA_CREATED, stryMutAct_9fa48("26957") ? {} : (stryCov_9fa48("26957"), {
            tableName: options.tableName,
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            replicaIndex: options.replicaIndex,
            nodeId: d.getNodeId()
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("26958")) {
          {}
        } else {
          stryCov_9fa48("26958");
          this.failPartitionReplicaProgress(progress, error);
          throw error;
        }
      }
      return stryMutAct_9fa48("26959") ? {} : (stryCov_9fa48("26959"), {
        status: SERVICE_LIFECYCLE_STATE.CREATED
      });
    }
  }

  /**
   * Unified lifecycle start hook for partition replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async startBootstrapPartitionReplica(replicaHandle, _context) {
    if (stryMutAct_9fa48("26960")) {
      {}
    } else {
      stryCov_9fa48("26960");
      const d = this.delegates;
      const serviceId = stryMutAct_9fa48("26963") ? replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] && replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] : stryMutAct_9fa48("26962") ? false : stryMutAct_9fa48("26961") ? true : (stryCov_9fa48("26961", "26962", "26963"), replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] || replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]);
      const options = d.resolveBootstrapReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.PARTITION);
      const partition = d.getPartitionServices().get(options.replicaId);
      assertCritical(partition, stryMutAct_9fa48("26964") ? `` : (stryCov_9fa48("26964"), `Partition replica ${options.replicaId} missing at start`));
      if (stryMutAct_9fa48("26967") ? false : stryMutAct_9fa48("26966") ? true : stryMutAct_9fa48("26965") ? options.deferElection : (stryCov_9fa48("26965", "26966", "26967"), !options.deferElection)) {
        if (stryMutAct_9fa48("26968")) {
          {}
        } else {
          stryCov_9fa48("26968");
          partition.startElection();
        }
      }
      return stryMutAct_9fa48("26969") ? {} : (stryCov_9fa48("26969"), {
        status: SERVICE_LIFECYCLE_STATE.RUNNING,
        deferred: Boolean(options.deferElection)
      });
    }
  }

  /**
   * Unified lifecycle stop hook for partition replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async stopBootstrapPartitionReplica(replicaHandle, _context) {
    if (stryMutAct_9fa48("26970")) {
      {}
    } else {
      stryCov_9fa48("26970");
      const d = this.delegates;
      const serviceId = stryMutAct_9fa48("26973") ? replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] && replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] : stryMutAct_9fa48("26972") ? false : stryMutAct_9fa48("26971") ? true : (stryCov_9fa48("26971", "26972", "26973"), replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] || replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]);
      const options = d.resolveBootstrapReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.PARTITION);
      const partition = d.getPartitionServices().get(options.replicaId);
      if (stryMutAct_9fa48("26976") ? false : stryMutAct_9fa48("26975") ? true : stryMutAct_9fa48("26974") ? partition : (stryCov_9fa48("26974", "26975", "26976"), !partition)) {
        if (stryMutAct_9fa48("26977")) {
          {}
        } else {
          stryCov_9fa48("26977");
          return stryMutAct_9fa48("26978") ? {} : (stryCov_9fa48("26978"), {
            status: SERVICE_LIFECYCLE_STATE.STOPPED
          });
        }
      }
      if (stryMutAct_9fa48("26980") ? false : stryMutAct_9fa48("26979") ? true : (stryCov_9fa48("26979", "26980"), partition.shutdown)) {
        if (stryMutAct_9fa48("26981")) {
          {}
        } else {
          stryCov_9fa48("26981");
          await partition.shutdown();
        }
      }
      const unifiedAddress = partition.getUnifiedAddress ? partition.getUnifiedAddress() : (stryMutAct_9fa48("26982") ? `` : (stryCov_9fa48("26982"), `${d.getNodeId()}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("26983") ? `` : (stryCov_9fa48("26983"), `${ENTITY_TYPE.PARTITION}${ADDRESS.SEPARATOR}`)) + (stryMutAct_9fa48("26984") ? `` : (stryCov_9fa48("26984"), `${options.replicaId}`));
      const messageRouter = d.getMessageRouter();
      if (stryMutAct_9fa48("26986") ? false : stryMutAct_9fa48("26985") ? true : (stryCov_9fa48("26985", "26986"), messageRouter)) {
        if (stryMutAct_9fa48("26987")) {
          {}
        } else {
          stryCov_9fa48("26987");
          messageRouter.unregister(unifiedAddress);
        }
      }
      d.getPartitionServices().delete(options.replicaId);
      d.filterPartitionReplicas(partition);
      return stryMutAct_9fa48("26988") ? {} : (stryCov_9fa48("26988"), {
        status: SERVICE_LIFECYCLE_STATE.STOPPED
      });
    }
  }

  /**
   * Start deferred elections for message groups then partitions.
   * @return {Promise<void>}
   */
  async startDeferredBootstrapReplicaElections() {
    if (stryMutAct_9fa48("26989")) {
      {}
    } else {
      stryCov_9fa48("26989");
      const d = this.delegates;
      const logger = d.getLogger();
      const messageGroupReplicas = d.getMessageGroupReplicas();
      if (stryMutAct_9fa48("26992") ? messageGroupReplicas || messageGroupReplicas.length > NUM.ZERO : stryMutAct_9fa48("26991") ? false : stryMutAct_9fa48("26990") ? true : (stryCov_9fa48("26990", "26991", "26992"), messageGroupReplicas && (stryMutAct_9fa48("26995") ? messageGroupReplicas.length <= NUM.ZERO : stryMutAct_9fa48("26994") ? messageGroupReplicas.length >= NUM.ZERO : stryMutAct_9fa48("26993") ? true : (stryCov_9fa48("26993", "26994", "26995"), messageGroupReplicas.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("26996")) {
          {}
        } else {
          stryCov_9fa48("26996");
          logger.info(BOOTSTRAP_LOG_MSG.STARTING_MG_ELECTIONS, stryMutAct_9fa48("26997") ? {} : (stryCov_9fa48("26997"), {
            totalReplicas: messageGroupReplicas.length,
            nodeId: d.getNodeId()
          }));
          for (const messageGroup of messageGroupReplicas) {
            if (stryMutAct_9fa48("26998")) {
              {}
            } else {
              stryCov_9fa48("26998");
              messageGroup.startElection();
            }
          }
          await d.waitForMessageGroupLeadership(INITIAL_MESSAGE_GROUP_ID, INITIAL_MESSAGE_GROUP_REPLICA_IDS);
          logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_LEADERSHIP_READY, stryMutAct_9fa48("26999") ? {} : (stryCov_9fa48("26999"), {
            groupId: INITIAL_MESSAGE_GROUP_ID,
            nodeId: d.getNodeId()
          }));
        }
      }
      const partitionReplicas = d.getPartitionReplicas();
      logger.info(BOOTSTRAP_LOG_MSG.STARTING_PARTITION_ELECTIONS, stryMutAct_9fa48("27000") ? {} : (stryCov_9fa48("27000"), {
        totalReplicas: partitionReplicas.length,
        partitionsCreated: d.getPartitionsCreated(),
        nodeId: d.getNodeId()
      }));
      for (const partition of partitionReplicas) {
        if (stryMutAct_9fa48("27001")) {
          {}
        } else {
          stryCov_9fa48("27001");
          partition.startElection();
        }
      }
    }
  }

  /**
   * Wait for all system table partitions to establish leadership.
   * @return {Promise<void>}
   */
  async waitForPartitionLeadership(options = {}) {
    if (stryMutAct_9fa48("27002")) {
      {}
    } else {
      stryCov_9fa48("27002");
      const d = this.delegates;
      const logger = d.getLogger();
      const config = d.getConfig();
      const startTime = Date.now();
      const configuredTimeoutMs = stryMutAct_9fa48("27005") ? config.leadershipWaitTimeoutMs && BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs : stryMutAct_9fa48("27004") ? false : stryMutAct_9fa48("27003") ? true : (stryCov_9fa48("27003", "27004", "27005"), config.leadershipWaitTimeoutMs || BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs);
      const timeoutMs = (stryMutAct_9fa48("27008") ? Number.isFinite(configuredTimeoutMs) || configuredTimeoutMs > NUM.ZERO : stryMutAct_9fa48("27007") ? false : stryMutAct_9fa48("27006") ? true : (stryCov_9fa48("27006", "27007", "27008"), Number.isFinite(configuredTimeoutMs) && (stryMutAct_9fa48("27011") ? configuredTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("27010") ? configuredTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("27009") ? true : (stryCov_9fa48("27009", "27010", "27011"), configuredTimeoutMs > NUM.ZERO)))) ? Math.floor(configuredTimeoutMs) : BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.TIMEOUT_CAP_MS;
      let delay = stryMutAct_9fa48("27014") ? config.leadershipWaitInitialDelayMs && BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.INITIAL_DELAY_MS : stryMutAct_9fa48("27013") ? false : stryMutAct_9fa48("27012") ? true : (stryCov_9fa48("27012", "27013", "27014"), config.leadershipWaitInitialDelayMs || BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.INITIAL_DELAY_MS);
      const maxDelay = BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.MAX_DELAY_MS;
      const backoffMultiplier = BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.BACKOFF_MULTIPLIER;
      const requestedPartitionIds = Array.isArray(options.partitionIds) ? options.partitionIds : options.partitionIds instanceof Set ? stryMutAct_9fa48("27015") ? [] : (stryCov_9fa48("27015"), [...options.partitionIds]) : null;
      const partitionIds = requestedPartitionIds ? new Set(stryMutAct_9fa48("27016") ? requestedPartitionIds : (stryCov_9fa48("27016"), requestedPartitionIds.filter(stryMutAct_9fa48("27017") ? () => undefined : (stryCov_9fa48("27017"), partitionId => stryMutAct_9fa48("27020") ? typeof partitionId === 'string' || partitionId.length > NUM.ZERO : stryMutAct_9fa48("27019") ? false : stryMutAct_9fa48("27018") ? true : (stryCov_9fa48("27018", "27019", "27020"), (stryMutAct_9fa48("27022") ? typeof partitionId !== 'string' : stryMutAct_9fa48("27021") ? true : (stryCov_9fa48("27021", "27022"), typeof partitionId === (stryMutAct_9fa48("27023") ? "" : (stryCov_9fa48("27023"), 'string')))) && (stryMutAct_9fa48("27026") ? partitionId.length <= NUM.ZERO : stryMutAct_9fa48("27025") ? partitionId.length >= NUM.ZERO : stryMutAct_9fa48("27024") ? true : (stryCov_9fa48("27024", "27025", "27026"), partitionId.length > NUM.ZERO))))))) : new Set();
      if (stryMutAct_9fa48("27029") ? false : stryMutAct_9fa48("27028") ? true : stryMutAct_9fa48("27027") ? requestedPartitionIds : (stryCov_9fa48("27027", "27028", "27029"), !requestedPartitionIds)) {
        if (stryMutAct_9fa48("27030")) {
          {}
        } else {
          stryCov_9fa48("27030");
          for (const partition of d.getPartitionServices().values()) {
            if (stryMutAct_9fa48("27031")) {
              {}
            } else {
              stryCov_9fa48("27031");
              partitionIds.add(partition.partitionId);
            }
          }
        }
      }
      const partitionSetKey = this.buildPartitionLeadershipSetKey(partitionIds);
      logger.debug(BOOTSTRAP_LOG_MSG.WAITING_PARTITION_LEADERS, stryMutAct_9fa48("27032") ? {} : (stryCov_9fa48("27032"), {
        partitionCount: partitionIds.size,
        timeoutMs,
        nodeId: d.getNodeId()
      }));
      if (stryMutAct_9fa48("27035") ? this.satisfiedPartitionLeadershipSetKey !== partitionSetKey : stryMutAct_9fa48("27034") ? false : stryMutAct_9fa48("27033") ? true : (stryCov_9fa48("27033", "27034", "27035"), this.satisfiedPartitionLeadershipSetKey === partitionSetKey)) {
        if (stryMutAct_9fa48("27036")) {
          {}
        } else {
          stryCov_9fa48("27036");
          logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_LEADERS_IMMEDIATE, stryMutAct_9fa48("27037") ? {} : (stryCov_9fa48("27037"), {
            partitionCount: partitionIds.size,
            elapsedMs: NUM.ZERO,
            cached: stryMutAct_9fa48("27038") ? false : (stryCov_9fa48("27038"), true)
          }));
          return;
        }
      }
      const leadersFound = this.checkPartitionLeaders(partitionIds);
      if (stryMutAct_9fa48("27041") ? leadersFound.size !== partitionIds.size : stryMutAct_9fa48("27040") ? false : stryMutAct_9fa48("27039") ? true : (stryCov_9fa48("27039", "27040", "27041"), leadersFound.size === partitionIds.size)) {
        if (stryMutAct_9fa48("27042")) {
          {}
        } else {
          stryCov_9fa48("27042");
          this.satisfiedPartitionLeadershipSetKey = partitionSetKey;
          logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_LEADERS_IMMEDIATE, stryMutAct_9fa48("27043") ? {} : (stryCov_9fa48("27043"), {
            partitionCount: partitionIds.size,
            elapsedMs: NUM.ZERO
          }));
          return;
        }
      }
      while (stryMutAct_9fa48("27046") ? Date.now() - startTime >= timeoutMs : stryMutAct_9fa48("27045") ? Date.now() - startTime <= timeoutMs : stryMutAct_9fa48("27044") ? false : (stryCov_9fa48("27044", "27045", "27046"), (stryMutAct_9fa48("27047") ? Date.now() + startTime : (stryCov_9fa48("27047"), Date.now() - startTime)) < timeoutMs)) {
        if (stryMutAct_9fa48("27048")) {
          {}
        } else {
          stryCov_9fa48("27048");
          await d.sleep(delay);
          delay = stryMutAct_9fa48("27049") ? Math.max(delay * backoffMultiplier, maxDelay) : (stryCov_9fa48("27049"), Math.min(stryMutAct_9fa48("27050") ? delay / backoffMultiplier : (stryCov_9fa48("27050"), delay * backoffMultiplier), maxDelay));
          const leaders = this.checkPartitionLeaders(partitionIds);
          if (stryMutAct_9fa48("27053") ? leaders.size !== partitionIds.size : stryMutAct_9fa48("27052") ? false : stryMutAct_9fa48("27051") ? true : (stryCov_9fa48("27051", "27052", "27053"), leaders.size === partitionIds.size)) {
            if (stryMutAct_9fa48("27054")) {
              {}
            } else {
              stryCov_9fa48("27054");
              this.satisfiedPartitionLeadershipSetKey = partitionSetKey;
              logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_LEADERS_FOUND, stryMutAct_9fa48("27055") ? {} : (stryCov_9fa48("27055"), {
                partitionCount: partitionIds.size,
                elapsedMs: stryMutAct_9fa48("27056") ? Date.now() + startTime : (stryCov_9fa48("27056"), Date.now() - startTime)
              }));
              return;
            }
          }
        }
      }
      const leaders = this.checkPartitionLeaders(partitionIds);
      const missing = stryMutAct_9fa48("27057") ? [...partitionIds] : (stryCov_9fa48("27057"), (stryMutAct_9fa48("27058") ? [] : (stryCov_9fa48("27058"), [...partitionIds])).filter(stryMutAct_9fa48("27059") ? () => undefined : (stryCov_9fa48("27059"), id => stryMutAct_9fa48("27060") ? leaders.has(id) : (stryCov_9fa48("27060"), !leaders.has(id)))));
      logger.error(BOOTSTRAP_LOG_MSG.PARTITION_LEADERS_PENDING, stryMutAct_9fa48("27061") ? {} : (stryCov_9fa48("27061"), {
        totalPartitions: partitionIds.size,
        leadersFound: leaders.size,
        missingLeaders: missing,
        elapsedMs: stryMutAct_9fa48("27062") ? Date.now() + startTime : (stryCov_9fa48("27062"), Date.now() - startTime),
        nodeId: d.getNodeId()
      }));
      const error = new Error(BOOTSTRAP_ERROR.partitionLeadershipTimeout(missing, timeoutMs));
      error.missingLeaders = missing;
      error.timeoutMs = timeoutMs;
      throw error;
    }
  }

  /**
   * Check which partitions have leaders.
   * @param {Set<string>} partitionIds
   * @return {Set<string>}
   */
  checkPartitionLeaders(partitionIds) {
    if (stryMutAct_9fa48("27063")) {
      {}
    } else {
      stryCov_9fa48("27063");
      const d = this.delegates;
      const leadersFound = new Set();
      for (const partition of d.getPartitionServices().values()) {
        if (stryMutAct_9fa48("27064")) {
          {}
        } else {
          stryCov_9fa48("27064");
          if (stryMutAct_9fa48("27067") ? false : stryMutAct_9fa48("27066") ? true : stryMutAct_9fa48("27065") ? partitionIds.has(partition.partitionId) : (stryCov_9fa48("27065", "27066", "27067"), !partitionIds.has(partition.partitionId))) {
            if (stryMutAct_9fa48("27068")) {
              {}
            } else {
              stryCov_9fa48("27068");
              continue;
            }
          }
          if (stryMutAct_9fa48("27071") ? (partition.isLeader || this.canBypassCanonicalPartitionLeadership(partition.partitionId)) && this.canBypassLocalPriorityPartitionLeadership(partition.partitionId) : stryMutAct_9fa48("27070") ? false : stryMutAct_9fa48("27069") ? true : (stryCov_9fa48("27069", "27070", "27071"), (stryMutAct_9fa48("27073") ? partition.isLeader && this.canBypassCanonicalPartitionLeadership(partition.partitionId) : stryMutAct_9fa48("27072") ? false : (stryCov_9fa48("27072", "27073"), partition.isLeader || this.canBypassCanonicalPartitionLeadership(partition.partitionId))) || this.canBypassLocalPriorityPartitionLeadership(partition.partitionId))) {
            if (stryMutAct_9fa48("27074")) {
              {}
            } else {
              stryCov_9fa48("27074");
              leadersFound.add(partition.partitionId);
            }
          }
        }
      }
      return leadersFound;
    }
  }
  buildPartitionLeadershipSetKey(partitionIds) {
    if (stryMutAct_9fa48("27075")) {
      {}
    } else {
      stryCov_9fa48("27075");
      return stryMutAct_9fa48("27076") ? [...partitionIds].join(STRING.COMMA) : (stryCov_9fa48("27076"), (stryMutAct_9fa48("27077") ? [] : (stryCov_9fa48("27077"), [...partitionIds])).sort().join(STRING.COMMA));
    }
  }
  canBypassLocalPriorityPartitionLeadership(partitionId) {
    if (stryMutAct_9fa48("27078")) {
      {}
    } else {
      stryCov_9fa48("27078");
      const d = this.delegates;
      if (stryMutAct_9fa48("27081") ? false : stryMutAct_9fa48("27080") ? true : stryMutAct_9fa48("27079") ? this.hasInitializedLocalPartitionReplica(partitionId) : (stryCov_9fa48("27079", "27080", "27081"), !this.hasInitializedLocalPartitionReplica(partitionId))) {
        if (stryMutAct_9fa48("27082")) {
          {}
        } else {
          stryCov_9fa48("27082");
          return stryMutAct_9fa48("27083") ? true : (stryCov_9fa48("27083"), false);
        }
      }
      if (stryMutAct_9fa48("27085") ? false : stryMutAct_9fa48("27084") ? true : (stryCov_9fa48("27084", "27085"), this.canBypassDirectBootstrapPriorityPartitionLeadership(partitionId))) {
        if (stryMutAct_9fa48("27086")) {
          {}
        } else {
          stryCov_9fa48("27086");
          return stryMutAct_9fa48("27087") ? false : (stryCov_9fa48("27087"), true);
        }
      }
      const readinessState = (stryMutAct_9fa48("27090") ? typeof d.getBootstrapReadinessState !== 'function' : stryMutAct_9fa48("27089") ? false : stryMutAct_9fa48("27088") ? true : (stryCov_9fa48("27088", "27089", "27090"), typeof d.getBootstrapReadinessState === (stryMutAct_9fa48("27091") ? "" : (stryCov_9fa48("27091"), 'function')))) ? d.getBootstrapReadinessState() : null;
      if (stryMutAct_9fa48("27094") ? false : stryMutAct_9fa48("27093") ? true : stryMutAct_9fa48("27092") ? readinessState : (stryCov_9fa48("27092", "27093", "27094"), !readinessState)) {
        if (stryMutAct_9fa48("27095")) {
          {}
        } else {
          stryCov_9fa48("27095");
          return stryMutAct_9fa48("27096") ? true : (stryCov_9fa48("27096"), false);
        }
      }
      const startupRecoveryCoordinator = new StartupRecoveryCoordinator(stryMutAct_9fa48("27097") ? {} : (stryCov_9fa48("27097"), {
        readinessState
      }));
      return stryMutAct_9fa48("27100") ? startupRecoveryCoordinator.evaluate({
        partitionId,
        allowBootstrapInitPriorityBypass: true
      }).shouldBypassLocalPriorityControlPlaneStartupReadiness !== true : stryMutAct_9fa48("27099") ? false : stryMutAct_9fa48("27098") ? true : (stryCov_9fa48("27098", "27099", "27100"), startupRecoveryCoordinator.evaluate(stryMutAct_9fa48("27101") ? {} : (stryCov_9fa48("27101"), {
        partitionId,
        allowBootstrapInitPriorityBypass: stryMutAct_9fa48("27102") ? false : (stryCov_9fa48("27102"), true)
      })).shouldBypassLocalPriorityControlPlaneStartupReadiness === (stryMutAct_9fa48("27103") ? false : (stryCov_9fa48("27103"), true)));
    }
  }
  canBypassDirectBootstrapPriorityPartitionLeadership(partitionId) {
    if (stryMutAct_9fa48("27104")) {
      {}
    } else {
      stryCov_9fa48("27104");
      const d = this.delegates;
      if (stryMutAct_9fa48("27107") ? false : stryMutAct_9fa48("27106") ? true : stryMutAct_9fa48("27105") ? isPriorityControlPlanePartition({
        partitionId
      }) : (stryCov_9fa48("27105", "27106", "27107"), !isPriorityControlPlanePartition(stryMutAct_9fa48("27108") ? {} : (stryCov_9fa48("27108"), {
        partitionId
      })))) {
        if (stryMutAct_9fa48("27109")) {
          {}
        } else {
          stryCov_9fa48("27109");
          return stryMutAct_9fa48("27110") ? true : (stryCov_9fa48("27110"), false);
        }
      }
      const phase = (stryMutAct_9fa48("27113") ? typeof d.getPhase !== 'function' : stryMutAct_9fa48("27112") ? false : stryMutAct_9fa48("27111") ? true : (stryCov_9fa48("27111", "27112", "27113"), typeof d.getPhase === (stryMutAct_9fa48("27114") ? "" : (stryCov_9fa48("27114"), 'function')))) ? d.getPhase() : null;
      if (stryMutAct_9fa48("27117") ? phase !== BOOTSTRAP_PHASE.PARTITIONS || phase !== BOOTSTRAP_PHASE.REGISTRATION : stryMutAct_9fa48("27116") ? false : stryMutAct_9fa48("27115") ? true : (stryCov_9fa48("27115", "27116", "27117"), (stryMutAct_9fa48("27119") ? phase === BOOTSTRAP_PHASE.PARTITIONS : stryMutAct_9fa48("27118") ? true : (stryCov_9fa48("27118", "27119"), phase !== BOOTSTRAP_PHASE.PARTITIONS)) && (stryMutAct_9fa48("27121") ? phase === BOOTSTRAP_PHASE.REGISTRATION : stryMutAct_9fa48("27120") ? true : (stryCov_9fa48("27120", "27121"), phase !== BOOTSTRAP_PHASE.REGISTRATION)))) {
        if (stryMutAct_9fa48("27122")) {
          {}
        } else {
          stryCov_9fa48("27122");
          return stryMutAct_9fa48("27123") ? true : (stryCov_9fa48("27123"), false);
        }
      }
      const cdcIntegrationService = (stryMutAct_9fa48("27126") ? typeof d.getCdcIntegrationService !== 'function' : stryMutAct_9fa48("27125") ? false : stryMutAct_9fa48("27124") ? true : (stryCov_9fa48("27124", "27125", "27126"), typeof d.getCdcIntegrationService === (stryMutAct_9fa48("27127") ? "" : (stryCov_9fa48("27127"), 'function')))) ? d.getCdcIntegrationService() : null;
      return stryMutAct_9fa48("27130") ? cdcIntegrationService?.sqlQueryEngine != null : stryMutAct_9fa48("27129") ? false : stryMutAct_9fa48("27128") ? true : (stryCov_9fa48("27128", "27129", "27130"), (stryMutAct_9fa48("27131") ? cdcIntegrationService.sqlQueryEngine : (stryCov_9fa48("27131"), cdcIntegrationService?.sqlQueryEngine)) == null);
    }
  }
  canBypassCanonicalPartitionLeadership(partitionId) {
    if (stryMutAct_9fa48("27132")) {
      {}
    } else {
      stryCov_9fa48("27132");
      if (stryMutAct_9fa48("27135") ? false : stryMutAct_9fa48("27134") ? true : stryMutAct_9fa48("27133") ? this.hasInitializedLocalPartitionReplica(partitionId) : (stryCov_9fa48("27133", "27134", "27135"), !this.hasInitializedLocalPartitionReplica(partitionId))) {
        if (stryMutAct_9fa48("27136")) {
          {}
        } else {
          stryCov_9fa48("27136");
          return stryMutAct_9fa48("27137") ? true : (stryCov_9fa48("27137"), false);
        }
      }
      const d = this.delegates;
      const systemTableCache = (stryMutAct_9fa48("27140") ? typeof d.getSystemTableCacheRef !== 'function' : stryMutAct_9fa48("27139") ? false : stryMutAct_9fa48("27138") ? true : (stryCov_9fa48("27138", "27139", "27140"), typeof d.getSystemTableCacheRef === (stryMutAct_9fa48("27141") ? "" : (stryCov_9fa48("27141"), 'function')))) ? d.getSystemTableCacheRef() : (stryMutAct_9fa48("27144") ? typeof d.getSystemTableCacheSafe !== 'function' : stryMutAct_9fa48("27143") ? false : stryMutAct_9fa48("27142") ? true : (stryCov_9fa48("27142", "27143", "27144"), typeof d.getSystemTableCacheSafe === (stryMutAct_9fa48("27145") ? "" : (stryCov_9fa48("27145"), 'function')))) ? d.getSystemTableCacheSafe() : null;
      if (stryMutAct_9fa48("27148") ? false : stryMutAct_9fa48("27147") ? true : stryMutAct_9fa48("27146") ? systemTableCache : (stryCov_9fa48("27146", "27147", "27148"), !systemTableCache)) {
        if (stryMutAct_9fa48("27149")) {
          {}
        } else {
          stryCov_9fa48("27149");
          return stryMutAct_9fa48("27150") ? true : (stryCov_9fa48("27150"), false);
        }
      }
      return Boolean(resolveCanonicalLeaderService(systemTableCache, SERVICE_TYPE.PARTITION, partitionId, stryMutAct_9fa48("27151") ? {} : (stryCov_9fa48("27151"), {
        requireAddress: stryMutAct_9fa48("27152") ? false : (stryCov_9fa48("27152"), true)
      })).leaderService);
    }
  }
  hasInitializedLocalPartitionReplica(partitionId) {
    if (stryMutAct_9fa48("27153")) {
      {}
    } else {
      stryCov_9fa48("27153");
      const d = this.delegates;
      for (const partition of d.getPartitionServices().values()) {
        if (stryMutAct_9fa48("27154")) {
          {}
        } else {
          stryCov_9fa48("27154");
          if (stryMutAct_9fa48("27157") ? partition?.partitionId === partitionId : stryMutAct_9fa48("27156") ? false : stryMutAct_9fa48("27155") ? true : (stryCov_9fa48("27155", "27156", "27157"), (stryMutAct_9fa48("27158") ? partition.partitionId : (stryCov_9fa48("27158"), partition?.partitionId)) !== partitionId)) {
            if (stryMutAct_9fa48("27159")) {
              {}
            } else {
              stryCov_9fa48("27159");
              continue;
            }
          }
          if (stryMutAct_9fa48("27162") ? partition?.initialized !== false : stryMutAct_9fa48("27161") ? false : stryMutAct_9fa48("27160") ? true : (stryCov_9fa48("27160", "27161", "27162"), (stryMutAct_9fa48("27163") ? partition.initialized : (stryCov_9fa48("27163"), partition?.initialized)) === (stryMutAct_9fa48("27164") ? true : (stryCov_9fa48("27164"), false)))) {
            if (stryMutAct_9fa48("27165")) {
              {}
            } else {
              stryCov_9fa48("27165");
              continue;
            }
          }
          return stryMutAct_9fa48("27166") ? false : (stryCov_9fa48("27166"), true);
        }
      }
      return stryMutAct_9fa48("27167") ? true : (stryCov_9fa48("27167"), false);
    }
  }

  /**
   * Initialize the AssignmentEpochManager with the initial epoch.
   * @return {Promise<void>}
   */
  async initializeEpochManager() {
    if (stryMutAct_9fa48("27168")) {
      {}
    } else {
      stryCov_9fa48("27168");
      const d = this.delegates;
      const logger = d.getLogger();
      const initialAssignments = {};
      const partitionNodes = new Map();
      for (const [_replicaId, partition] of d.getPartitionServices()) {
        if (stryMutAct_9fa48("27169")) {
          {}
        } else {
          stryCov_9fa48("27169");
          const partitionId = partition.partitionId;
          if (stryMutAct_9fa48("27172") ? false : stryMutAct_9fa48("27171") ? true : stryMutAct_9fa48("27170") ? partitionNodes.has(partitionId) : (stryCov_9fa48("27170", "27171", "27172"), !partitionNodes.has(partitionId))) {
            if (stryMutAct_9fa48("27173")) {
              {}
            } else {
              stryCov_9fa48("27173");
              partitionNodes.set(partitionId, stryMutAct_9fa48("27174") ? ["Stryker was here"] : (stryCov_9fa48("27174"), []));
            }
          }
          if (stryMutAct_9fa48("27177") ? false : stryMutAct_9fa48("27176") ? true : stryMutAct_9fa48("27175") ? partitionNodes.get(partitionId).includes(d.getNodeId()) : (stryCov_9fa48("27175", "27176", "27177"), !partitionNodes.get(partitionId).includes(d.getNodeId()))) {
            if (stryMutAct_9fa48("27178")) {
              {}
            } else {
              stryCov_9fa48("27178");
              partitionNodes.get(partitionId).push(d.getNodeId());
            }
          }
        }
      }
      for (const [partitionId, nodes] of partitionNodes) {
        if (stryMutAct_9fa48("27179")) {
          {}
        } else {
          stryCov_9fa48("27179");
          initialAssignments[partitionId] = nodes;
        }
      }
      const epochManager = new AssignmentEpochManager(stryMutAct_9fa48("27180") ? {} : (stryCov_9fa48("27180"), {
        nodeId: d.getNodeId(),
        timestampProvider: stryMutAct_9fa48("27181") ? () => undefined : (stryCov_9fa48("27181"), () => new Date().toISOString())
      }));
      const persistedEpoch = await this.loadPersistedEpochFromLocalConfigPartition();
      if (stryMutAct_9fa48("27183") ? false : stryMutAct_9fa48("27182") ? true : (stryCov_9fa48("27182", "27183"), persistedEpoch)) {
        if (stryMutAct_9fa48("27184")) {
          {}
        } else {
          stryCov_9fa48("27184");
          epochManager.initialize(persistedEpoch);
        }
      } else {
        if (stryMutAct_9fa48("27185")) {
          {}
        } else {
          stryCov_9fa48("27185");
          const initialEpoch = new AssignmentEpoch(stryMutAct_9fa48("27186") ? {} : (stryCov_9fa48("27186"), {
            epoch: NUM.ZERO,
            assignments: initialAssignments,
            timestamp: new Date().toISOString(),
            proposedBy: d.getNodeId()
          }));
          epochManager.initialize(initialEpoch);
        }
      }
      d.setEpochManager(epochManager);
      logger.info(BOOTSTRAP_LOG_MSG.EPOCH_MANAGER_READY, stryMutAct_9fa48("27187") ? {} : (stryCov_9fa48("27187"), {
        nodeId: d.getNodeId(),
        epoch: epochManager.getCurrentEpoch().epoch,
        partitionCount: Object.keys(initialAssignments).length,
        assignments: initialAssignments
      }));
    }
  }

  /**
   * Load persisted assignment epoch from the local config partition.
   * @return {Promise<AssignmentEpoch|null>}
   */
  async loadPersistedEpochFromLocalConfigPartition() {
    if (stryMutAct_9fa48("27188")) {
      {}
    } else {
      stryCov_9fa48("27188");
      const d = this.delegates;
      const logger = d.getLogger();
      const configReplicaIds = stryMutAct_9fa48("27191") ? INITIAL_REPLICA_IDS[SYSTEM_TABLE_NAME.CONFIG] && [] : stryMutAct_9fa48("27190") ? false : stryMutAct_9fa48("27189") ? true : (stryCov_9fa48("27189", "27190", "27191"), INITIAL_REPLICA_IDS[SYSTEM_TABLE_NAME.CONFIG] || (stryMutAct_9fa48("27192") ? ["Stryker was here"] : (stryCov_9fa48("27192"), [])));
      for (const replicaId of configReplicaIds) {
        if (stryMutAct_9fa48("27193")) {
          {}
        } else {
          stryCov_9fa48("27193");
          const configPartition = d.getPartitionServices().get(replicaId);
          if (stryMutAct_9fa48("27196") ? false : stryMutAct_9fa48("27195") ? true : stryMutAct_9fa48("27194") ? configPartition : (stryCov_9fa48("27194", "27195", "27196"), !configPartition)) {
            if (stryMutAct_9fa48("27197")) {
              {}
            } else {
              stryCov_9fa48("27197");
              continue;
            }
          }
          try {
            if (stryMutAct_9fa48("27198")) {
              {}
            } else {
              stryCov_9fa48("27198");
              const result = await configPartition.executeLocalQuery(stryMutAct_9fa48("27199") ? "" : (stryCov_9fa48("27199"), 'SELECT config_value FROM config WHERE config_key = ?'), stryMutAct_9fa48("27200") ? [] : (stryCov_9fa48("27200"), [EPOCH_CONFIG_KEY]));
              const hasRow = stryMutAct_9fa48("27203") ? result?.success && Array.isArray(result.rows) || result.rows.length > NUM.ZERO : stryMutAct_9fa48("27202") ? false : stryMutAct_9fa48("27201") ? true : (stryCov_9fa48("27201", "27202", "27203"), (stryMutAct_9fa48("27205") ? result?.success || Array.isArray(result.rows) : stryMutAct_9fa48("27204") ? true : (stryCov_9fa48("27204", "27205"), (stryMutAct_9fa48("27206") ? result.success : (stryCov_9fa48("27206"), result?.success)) && Array.isArray(result.rows))) && (stryMutAct_9fa48("27209") ? result.rows.length <= NUM.ZERO : stryMutAct_9fa48("27208") ? result.rows.length >= NUM.ZERO : stryMutAct_9fa48("27207") ? true : (stryCov_9fa48("27207", "27208", "27209"), result.rows.length > NUM.ZERO)));
              if (stryMutAct_9fa48("27212") ? false : stryMutAct_9fa48("27211") ? true : stryMutAct_9fa48("27210") ? hasRow : (stryCov_9fa48("27210", "27211", "27212"), !hasRow)) {
                if (stryMutAct_9fa48("27213")) {
                  {}
                } else {
                  stryCov_9fa48("27213");
                  continue;
                }
              }
              const configValue = stryMutAct_9fa48("27214") ? result.rows[NUM.ZERO][COLUMN.CONFIG_VALUE] : (stryCov_9fa48("27214"), result.rows[NUM.ZERO]?.[COLUMN.CONFIG_VALUE]);
              if (stryMutAct_9fa48("27217") ? typeof configValue !== 'string' && configValue.length === NUM.ZERO : stryMutAct_9fa48("27216") ? false : stryMutAct_9fa48("27215") ? true : (stryCov_9fa48("27215", "27216", "27217"), (stryMutAct_9fa48("27219") ? typeof configValue === 'string' : stryMutAct_9fa48("27218") ? false : (stryCov_9fa48("27218", "27219"), typeof configValue !== (stryMutAct_9fa48("27220") ? "" : (stryCov_9fa48("27220"), 'string')))) || (stryMutAct_9fa48("27222") ? configValue.length !== NUM.ZERO : stryMutAct_9fa48("27221") ? false : (stryCov_9fa48("27221", "27222"), configValue.length === NUM.ZERO)))) {
                if (stryMutAct_9fa48("27223")) {
                  {}
                } else {
                  stryCov_9fa48("27223");
                  continue;
                }
              }
              return AssignmentEpoch.fromJSON(configValue);
            }
          } catch (error) {
            if (stryMutAct_9fa48("27224")) {
              {}
            } else {
              stryCov_9fa48("27224");
              logger.warn(BOOTSTRAP_LOG_MSG.CONFIG_CHECK_FAILED, stryMutAct_9fa48("27225") ? {} : (stryCov_9fa48("27225"), {
                nodeId: d.getNodeId(),
                replicaId,
                error: error.message
              }));
            }
          }
        }
      }
      return null;
    }
  }

  // -- Progress reporting methods --

  /**
   * Start progress reporting for one partition replica creation.
   * @param {Object} details
   * @return {Object}
   */
  startPartitionReplicaProgress(details) {
    if (stryMutAct_9fa48("27226")) {
      {}
    } else {
      stryCov_9fa48("27226");
      const d = this.delegates;
      return d.getPartitionReplicaProgressReporter().start(stryMutAct_9fa48("27227") ? {} : (stryCov_9fa48("27227"), {
        ...details,
        stage: PARTITION_SERVICE_INIT_STAGE.STARTING,
        peerTotal: stryMutAct_9fa48("27228") ? Math.min(NUM.ZERO, details.peerTotal || NUM.ZERO) : (stryCov_9fa48("27228"), Math.max(NUM.ZERO, stryMutAct_9fa48("27231") ? details.peerTotal && NUM.ZERO : stryMutAct_9fa48("27230") ? false : stryMutAct_9fa48("27229") ? true : (stryCov_9fa48("27229", "27230", "27231"), details.peerTotal || NUM.ZERO))),
        peerJoined: NUM.ZERO
      }));
    }
  }

  /**
   * Update partition creation progress based on stage callbacks.
   * @param {Object|null} progress
   * @param {Object} stageEvent
   */
  updatePartitionReplicaProgress(progress, stageEvent) {
    if (stryMutAct_9fa48("27232")) {
      {}
    } else {
      stryCov_9fa48("27232");
      if (stryMutAct_9fa48("27235") ? !progress && !stageEvent : stryMutAct_9fa48("27234") ? false : stryMutAct_9fa48("27233") ? true : (stryCov_9fa48("27233", "27234", "27235"), (stryMutAct_9fa48("27236") ? progress : (stryCov_9fa48("27236"), !progress)) || (stryMutAct_9fa48("27237") ? stageEvent : (stryCov_9fa48("27237"), !stageEvent)))) {
        if (stryMutAct_9fa48("27238")) {
          {}
        } else {
          stryCov_9fa48("27238");
          return;
        }
      }
      const update = {};
      if (stryMutAct_9fa48("27240") ? false : stryMutAct_9fa48("27239") ? true : (stryCov_9fa48("27239", "27240"), stageEvent.stage)) {
        if (stryMutAct_9fa48("27241")) {
          {}
        } else {
          stryCov_9fa48("27241");
          update.stage = stageEvent.stage;
        }
      }
      if (stryMutAct_9fa48("27243") ? false : stryMutAct_9fa48("27242") ? true : (stryCov_9fa48("27242", "27243"), Number.isFinite(stageEvent.peerTotal))) {
        if (stryMutAct_9fa48("27244")) {
          {}
        } else {
          stryCov_9fa48("27244");
          update.peerTotal = stryMutAct_9fa48("27245") ? Math.min(NUM.ZERO, stageEvent.peerTotal) : (stryCov_9fa48("27245"), Math.max(NUM.ZERO, stageEvent.peerTotal));
        }
      }
      if (stryMutAct_9fa48("27247") ? false : stryMutAct_9fa48("27246") ? true : (stryCov_9fa48("27246", "27247"), Number.isFinite(stageEvent.peerJoined))) {
        if (stryMutAct_9fa48("27248")) {
          {}
        } else {
          stryCov_9fa48("27248");
          update.peerJoined = stryMutAct_9fa48("27249") ? Math.min(NUM.ZERO, stageEvent.peerJoined) : (stryCov_9fa48("27249"), Math.max(NUM.ZERO, stageEvent.peerJoined));
        }
      }
      if (stryMutAct_9fa48("27251") ? false : stryMutAct_9fa48("27250") ? true : (stryCov_9fa48("27250", "27251"), stageEvent.peerId)) {
        if (stryMutAct_9fa48("27252")) {
          {}
        } else {
          stryCov_9fa48("27252");
          update.peerId = stageEvent.peerId;
        }
      }
      if (stryMutAct_9fa48("27254") ? false : stryMutAct_9fa48("27253") ? true : (stryCov_9fa48("27253", "27254"), Number.isFinite(stageEvent.sizeBytes))) {
        if (stryMutAct_9fa48("27255")) {
          {}
        } else {
          stryCov_9fa48("27255");
          update.sizeBytes = stageEvent.sizeBytes;
        }
      }
      const d = this.delegates;
      d.getPartitionReplicaProgressReporter().update(progress, update);
    }
  }

  /**
   * Complete partition creation progress reporting.
   * @param {Object|null} progress
   */
  finishPartitionReplicaProgress(progress) {
    if (stryMutAct_9fa48("27256")) {
      {}
    } else {
      stryCov_9fa48("27256");
      const d = this.delegates;
      d.getPartitionReplicaProgressReporter().finish(progress, stryMutAct_9fa48("27257") ? {} : (stryCov_9fa48("27257"), {
        stage: PARTITION_SERVICE_INIT_STAGE.READY
      }));
    }
  }

  /**
   * Fail partition creation progress reporting.
   * @param {Object|null} progress
   * @param {Error|string|null} error
   */
  failPartitionReplicaProgress(progress, error) {
    if (stryMutAct_9fa48("27258")) {
      {}
    } else {
      stryCov_9fa48("27258");
      const d = this.delegates;
      d.getPartitionReplicaProgressReporter().fail(progress, error);
    }
  }

  /**
   * Format one partition creation progress line.
   * @param {Object} progress
   * @param {string|null} status
   * @param {Error|string|null} error
   * @return {string}
   */
  formatPartitionReplicaProgressLine(progress, status, error) {
    if (stryMutAct_9fa48("27259")) {
      {}
    } else {
      stryCov_9fa48("27259");
      const d = this.delegates;
      const spinner = stryMutAct_9fa48("27262") ? progress.spinnerFrame && BOOTSTRAP_REPLICA_PROGRESS.SPINNER_IDLE : stryMutAct_9fa48("27261") ? false : stryMutAct_9fa48("27260") ? true : (stryCov_9fa48("27260", "27261", "27262"), progress.spinnerFrame || BOOTSTRAP_REPLICA_PROGRESS.SPINNER_IDLE);
      const peerTotal = Number.isFinite(progress.peerTotal) ? progress.peerTotal : NUM.ZERO;
      const peerJoined = Number.isFinite(progress.peerJoined) ? progress.peerJoined : NUM.ZERO;
      const localReplicas = stryMutAct_9fa48("27263") ? d.getPartitionServices().size - (status ? NUM.ZERO : NUM.ONE) : (stryCov_9fa48("27263"), d.getPartitionServices().size + (status ? NUM.ZERO : NUM.ONE));
      const statusText = status ? stryMutAct_9fa48("27264") ? `` : (stryCov_9fa48("27264"), ` status=${status}`) : stryMutAct_9fa48("27265") ? "Stryker was here!" : (stryCov_9fa48("27265"), '');
      const errorText = error ? stryMutAct_9fa48("27266") ? `` : (stryCov_9fa48("27266"), ` error=${this.formatReplicaCreationError(error)}`) : stryMutAct_9fa48("27267") ? "Stryker was here!" : (stryCov_9fa48("27267"), '');
      return (stryMutAct_9fa48("27268") ? `` : (stryCov_9fa48("27268"), `${BOOTSTRAP_REPLICA_PROGRESS.PREFIX} ${spinner} `)) + (stryMutAct_9fa48("27269") ? `` : (stryCov_9fa48("27269"), `service=${progress.partitionId} `)) + (stryMutAct_9fa48("27270") ? `` : (stryCov_9fa48("27270"), `replica=${progress.replicaId} `)) + (stryMutAct_9fa48("27271") ? `` : (stryCov_9fa48("27271"), `type=${BOOTSTRAP_REPLICA_PROGRESS.TYPE_PARTITION} `)) + (stryMutAct_9fa48("27272") ? `` : (stryCov_9fa48("27272"), `stage=${progress.stage} `)) + (stryMutAct_9fa48("27273") ? `` : (stryCov_9fa48("27273"), `peers=${peerJoined}/${peerTotal} `)) + (stryMutAct_9fa48("27274") ? `` : (stryCov_9fa48("27274"), `local_replicas=${localReplicas}`)) + (stryMutAct_9fa48("27275") ? `` : (stryCov_9fa48("27275"), `${statusText}${errorText}`));
    }
  }

  /**
   * Build structured context for non-interactive partition progress
   * logs.
   * @param {Object} progress
   * @param {string|null} status
   * @param {Error|string|null} error
   * @return {Object}
   */
  buildPartitionReplicaProgressContext(progress, status = null, error = null) {
    if (stryMutAct_9fa48("27276")) {
      {}
    } else {
      stryCov_9fa48("27276");
      const d = this.delegates;
      const context = stryMutAct_9fa48("27277") ? {} : (stryCov_9fa48("27277"), {
        nodeId: d.getNodeId(),
        partitionId: progress.partitionId,
        tableName: progress.tableName,
        replicaId: progress.replicaId,
        stage: progress.stage,
        peerTotal: progress.peerTotal,
        peerJoined: progress.peerJoined,
        localReplicas: d.getPartitionServices().size
      });
      if (stryMutAct_9fa48("27279") ? false : stryMutAct_9fa48("27278") ? true : (stryCov_9fa48("27278", "27279"), status)) {
        if (stryMutAct_9fa48("27280")) {
          {}
        } else {
          stryCov_9fa48("27280");
          context.status = status;
        }
      }
      if (stryMutAct_9fa48("27282") ? false : stryMutAct_9fa48("27281") ? true : (stryCov_9fa48("27281", "27282"), error)) {
        if (stryMutAct_9fa48("27283")) {
          {}
        } else {
          stryCov_9fa48("27283");
          context.error = this.formatReplicaCreationError(error);
        }
      }
      return context;
    }
  }

  /**
   * Normalize replica creation errors for display.
   * @param {Error|string|null} error
   * @return {string}
   */
  formatReplicaCreationError(error) {
    if (stryMutAct_9fa48("27284")) {
      {}
    } else {
      stryCov_9fa48("27284");
      if (stryMutAct_9fa48("27287") ? false : stryMutAct_9fa48("27286") ? true : stryMutAct_9fa48("27285") ? error : (stryCov_9fa48("27285", "27286", "27287"), !error)) {
        if (stryMutAct_9fa48("27288")) {
          {}
        } else {
          stryCov_9fa48("27288");
          return STRING.EMPTY;
        }
      }
      return (stryMutAct_9fa48("27291") ? typeof error !== 'string' : stryMutAct_9fa48("27290") ? false : stryMutAct_9fa48("27289") ? true : (stryCov_9fa48("27289", "27290", "27291"), typeof error === (stryMutAct_9fa48("27292") ? "" : (stryCov_9fa48("27292"), 'string')))) ? error : error.message;
    }
  }

  /**
   * Get the AssignmentEpochManager instance.
   * @return {AssignmentEpochManager|null}
   */
  getEpochManager() {
    if (stryMutAct_9fa48("27293")) {
      {}
    } else {
      stryCov_9fa48("27293");
      return this.delegates.getEpochManager();
    }
  }
}
export { SeedPartitionsPhase };