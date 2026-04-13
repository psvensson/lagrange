/**
 * Seed Registration Phase — handles Phase 4 of seed bootstrap:
 * registering all services, tables, partitions, and configuration
 * in system tables using bootstrap-mode direct writes.
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
import { DynamicConfigService } from '../../config/dynamic-config-service.js';
import { CONFIG_SEED_SOURCE, CONFIG_VALUE_TYPE } from '../../config/config-constants.js';
import { assertCritical } from '../../utils/assert.js';
import { EPOCH_CONFIG_KEY } from '../../cdc/cdc-integration-service.js';
import { BootstrapSystemTableWriter, RoutedSqlSystemTableWriter } from '../system-table-writer.js';
import { MessageGroupServiceRowOwner } from '../../message-group/message-group-service-row-owner.js';
import { PartitionServiceRowOwner } from '../../partition/partition-service-row-owner.js';
import { activatePartitionServiceRows } from '../shared/partition-service-activation.js';
import { registerBuiltInMetaServiceDefinitions, registerBuiltInMetaServiceEndpoints } from '../shared/meta-service-definition-registration.js';
import { BOOTSTRAP_EPOCH, BOOTSTRAP_ERROR, BOOTSTRAP_LOG_MSG, BOOTSTRAP_MESSAGE_GROUP, BOOTSTRAP_SQL } from '../bootstrap-constants.js';
import { SYSTEM_TABLE_NAME, SYSTEM_TABLE_SCHEMAS, INITIAL_MESSAGE_GROUP_ID, INITIAL_PARTITION_IDS, INITIAL_REPLICA_IDS } from '../system-table-schemas-constants.js';
import { PARTITION_STATE } from '../../partition/partition-constants.js';
import { RAFT_ROLE } from '../../raft/constants.js';
import { ADDRESS, COLUMN, ENTITY_TYPE, NUM, SERVICE_STATUS, SERVICE_TYPE } from '../../constants/index.js';
import { SeedRegistrationRuntimeOwner } from '../owners/seed-registration-runtime-owner.js';
import { createBootstrapCacheHydrationApplier } from '../bootstrap-cache-hydration-applier.js';
const EPOCH_EXISTS_SQL = BOOTSTRAP_SQL.EPOCH_EXISTS;
const REGISTRATION_REQUIRED_LEADER_TABLES = Object.freeze(stryMutAct_9fa48("27294") ? [] : (stryCov_9fa48("27294"), [SYSTEM_TABLE_NAME.PARTITIONS, SYSTEM_TABLE_NAME.SERVICES, SYSTEM_TABLE_NAME.TABLES, SYSTEM_TABLE_NAME.MESSAGE_GROUPS]));
const REGISTRATION_REQUIRED_LEADER_PARTITION_IDS = Object.freeze(stryMutAct_9fa48("27295") ? REGISTRATION_REQUIRED_LEADER_TABLES.map(tableName => INITIAL_PARTITION_IDS[tableName]) : (stryCov_9fa48("27295"), REGISTRATION_REQUIRED_LEADER_TABLES.map(stryMutAct_9fa48("27296") ? () => undefined : (stryCov_9fa48("27296"), tableName => INITIAL_PARTITION_IDS[tableName])).filter(Boolean)));

/**
 * Handles the registration phase of seed bootstrap.
 */
class SeedRegistrationPhase {
  /**
   * @param {Object} options
   * @param {Object} options.delegates - Callbacks into the bootstrap
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("27297")) {
      {}
    } else {
      stryCov_9fa48("27297");
      this.delegates = stryMutAct_9fa48("27300") ? options.delegates && {} : stryMutAct_9fa48("27299") ? false : stryMutAct_9fa48("27298") ? true : (stryCov_9fa48("27298", "27299", "27300"), options.delegates || {});
      this.runtimeOwner = new SeedRegistrationRuntimeOwner(stryMutAct_9fa48("27301") ? {} : (stryCov_9fa48("27301"), {
        delegates: this.delegates
      }));
    }
  }

  /**
   * Phase 4: Service registration.
   * Register all services in system tables using bootstrap mode.
   * @return {Promise<void>}
   */
  async phaseRegistration() {
    if (stryMutAct_9fa48("27302")) {
      {}
    } else {
      stryCov_9fa48("27302");
      const d = this.delegates;
      const logger = d.getLogger();
      const timestamp = Date.now();
      await d.waitForPartitionLeadership(stryMutAct_9fa48("27303") ? {} : (stryCov_9fa48("27303"), {
        partitionIds: REGISTRATION_REQUIRED_LEADER_PARTITION_IDS
      }));
      const systemTableWriter = this.ensureSystemTableWriter();
      logger.debug(BOOTSTRAP_LOG_MSG.BOOTSTRAP_MODE_ENABLED, stryMutAct_9fa48("27304") ? {} : (stryCov_9fa48("27304"), {
        nodeId: d.getNodeId(),
        partitionCount: d.getPartitionServices().size
      }));
      systemTableWriter.enable();
      await this.registerMessageGroup(timestamp);
      await this.registerServices(timestamp);
      await this.registerMetaServiceDefinitions();
      await this.registerSystemTables(timestamp);
      await this.updatePartitionSizes();
      await this.seedDynamicConfiguration();
      await this.persistCurrentEpochIfMissing();
      logger.debug(BOOTSTRAP_LOG_MSG.SERVICE_REGISTRATION_COMPLETE, stryMutAct_9fa48("27305") ? {} : (stryCov_9fa48("27305"), {
        nodeId: d.getNodeId(),
        servicesCreated: d.getServicesCreated()
      }));
    }
  }

  /**
   * Register the initial message group.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   */
  async registerMessageGroup(now) {
    if (stryMutAct_9fa48("27306")) {
      {}
    } else {
      stryCov_9fa48("27306");
      const d = this.delegates;
      const logger = d.getLogger();
      const systemTableWriter = this.ensureSystemTableWriter();
      const leaderService = d.getLeaderMessageGroupService();
      const leaderNodeId = stryMutAct_9fa48("27309") ? leaderService?.nodeId && d.getNodeId() : stryMutAct_9fa48("27308") ? false : stryMutAct_9fa48("27307") ? true : (stryCov_9fa48("27307", "27308", "27309"), (stryMutAct_9fa48("27310") ? leaderService.nodeId : (stryCov_9fa48("27310"), leaderService?.nodeId)) || d.getNodeId());
      const groupData = stryMutAct_9fa48("27311") ? {} : (stryCov_9fa48("27311"), {
        group_id: INITIAL_MESSAGE_GROUP_ID,
        group_name: BOOTSTRAP_MESSAGE_GROUP.NAME,
        replica_count: BOOTSTRAP_MESSAGE_GROUP.REPLICA_COUNT,
        [COLUMN.LEADER_NODE_ID]: leaderNodeId,
        policy: JSON.stringify(BOOTSTRAP_MESSAGE_GROUP.POLICY),
        created_at: now,
        updated_at: now
      });
      try {
        if (stryMutAct_9fa48("27312")) {
          {}
        } else {
          stryCov_9fa48("27312");
          await systemTableWriter.upsertSystemTableRow(SYSTEM_TABLE_NAME.MESSAGE_GROUPS, groupData);
          logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_REGISTERED, stryMutAct_9fa48("27313") ? {} : (stryCov_9fa48("27313"), {
            groupId: INITIAL_MESSAGE_GROUP_ID
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("27314")) {
          {}
        } else {
          stryCov_9fa48("27314");
          logger.error(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_REGISTER_FAILED, stryMutAct_9fa48("27315") ? {} : (stryCov_9fa48("27315"), {
            groupId: INITIAL_MESSAGE_GROUP_ID,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Register all services in the services table.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   */
  async registerServices(now) {
    if (stryMutAct_9fa48("27316")) {
      {}
    } else {
      stryCov_9fa48("27316");
      const d = this.delegates;
      const logger = d.getLogger();
      const systemTableWriter = this.ensureSystemTableWriter();
      const nodeId = d.getNodeId();
      const messageGroupServiceRowOwner = new MessageGroupServiceRowOwner(stryMutAct_9fa48("27317") ? {} : (stryCov_9fa48("27317"), {
        systemTableWriter,
        now: stryMutAct_9fa48("27318") ? () => undefined : (stryCov_9fa48("27318"), () => now)
      }));
      const partitionServiceRowOwner = new PartitionServiceRowOwner(stryMutAct_9fa48("27319") ? {} : (stryCov_9fa48("27319"), {
        systemTableWriter,
        now: stryMutAct_9fa48("27320") ? () => undefined : (stryCov_9fa48("27320"), () => now)
      }));

      // Register message group replicas
      for (const [replicaId, service] of d.getMessageGroupServices()) {
        if (stryMutAct_9fa48("27321")) {
          {}
        } else {
          stryCov_9fa48("27321");
          const serviceData = MessageGroupServiceRowOwner.buildServiceRow(stryMutAct_9fa48("27322") ? {} : (stryCov_9fa48("27322"), {
            groupId: INITIAL_MESSAGE_GROUP_ID,
            replicaId,
            nodeId,
            service,
            timestamp: now
          }));
          logger.debug(BOOTSTRAP_LOG_MSG.REGISTERING_SERVICE, stryMutAct_9fa48("27323") ? {} : (stryCov_9fa48("27323"), {
            serviceId: replicaId,
            serviceType: SERVICE_TYPE.MESSAGE_GROUP,
            raftRole: serviceData.raft_role,
            address: serviceData.address,
            nodeId
          }));
          try {
            if (stryMutAct_9fa48("27324")) {
              {}
            } else {
              stryCov_9fa48("27324");
              await messageGroupServiceRowOwner.registerReplica(stryMutAct_9fa48("27325") ? {} : (stryCov_9fa48("27325"), {
                groupId: INITIAL_MESSAGE_GROUP_ID,
                replicaId,
                nodeId,
                service,
                timestamp: now,
                status: SERVICE_STATUS.STOPPED
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("27326")) {
              {}
            } else {
              stryCov_9fa48("27326");
              logger.error(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_SERVICE_REGISTER_FAILED, stryMutAct_9fa48("27327") ? {} : (stryCov_9fa48("27327"), {
                replicaId,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }

      // Register partition replicas
      for (const [replicaId, service] of d.getPartitionServices()) {
        if (stryMutAct_9fa48("27328")) {
          {}
        } else {
          stryCov_9fa48("27328");
          try {
            if (stryMutAct_9fa48("27329")) {
              {}
            } else {
              stryCov_9fa48("27329");
              await partitionServiceRowOwner.registerReplica(stryMutAct_9fa48("27330") ? {} : (stryCov_9fa48("27330"), {
                partitionId: service.partitionId,
                replicaId,
                nodeId,
                service,
                timestamp: now,
                status: SERVICE_STATUS.STOPPED
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("27331")) {
              {}
            } else {
              stryCov_9fa48("27331");
              logger.error(BOOTSTRAP_LOG_MSG.PARTITION_SERVICE_REGISTER_FAILED, stryMutAct_9fa48("27332") ? {} : (stryCov_9fa48("27332"), {
                replicaId,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }
      await activatePartitionServiceRows(stryMutAct_9fa48("27333") ? {} : (stryCov_9fa48("27333"), {
        nodeId,
        systemTableWriter,
        messageRouter: (stryMutAct_9fa48("27336") ? typeof d.getMessageRouter !== 'function' : stryMutAct_9fa48("27335") ? false : stryMutAct_9fa48("27334") ? true : (stryCov_9fa48("27334", "27335", "27336"), typeof d.getMessageRouter === (stryMutAct_9fa48("27337") ? "" : (stryCov_9fa48("27337"), 'function')))) ? d.getMessageRouter() : null,
        deferTransientFailures: stryMutAct_9fa48("27338") ? false : (stryCov_9fa48("27338"), true),
        onDeferredActivation: ({
          partitionId,
          replicaId,
          error
        }) => {
          if (stryMutAct_9fa48("27339")) {
            {}
          } else {
            stryCov_9fa48("27339");
            logger.warn(stryMutAct_9fa48("27340") ? "" : (stryCov_9fa48("27340"), 'Deferring seed partition service row activation during startup'), stryMutAct_9fa48("27341") ? {} : (stryCov_9fa48("27341"), {
              nodeId,
              partitionId,
              replicaId,
              error: stryMutAct_9fa48("27344") ? error?.message && String(error) : stryMutAct_9fa48("27343") ? false : stryMutAct_9fa48("27342") ? true : (stryCov_9fa48("27342", "27343", "27344"), (stryMutAct_9fa48("27345") ? error.message : (stryCov_9fa48("27345"), error?.message)) || String(error))
            }));
          }
        },
        partitionServices: d.getPartitionServices(),
        now: stryMutAct_9fa48("27346") ? () => undefined : (stryCov_9fa48("27346"), () => now)
      }));
      logger.debug(BOOTSTRAP_LOG_MSG.SERVICES_REGISTERED, stryMutAct_9fa48("27347") ? {} : (stryCov_9fa48("27347"), {
        messageGroupServices: d.getMessageGroupServices().size,
        partitionServices: d.getPartitionServices().size
      }));
    }
  }

  /**
   * Register built-in runtime service definitions.
   * @return {Promise<void>}
   */
  async registerMetaServiceDefinitions() {
    if (stryMutAct_9fa48("27348")) {
      {}
    } else {
      stryCov_9fa48("27348");
      const d = this.delegates;
      const logger = d.getLogger();
      const systemTableWriter = this.ensureSystemTableWriter();
      const metaServices = await registerBuiltInMetaServiceDefinitions(stryMutAct_9fa48("27349") ? {} : (stryCov_9fa48("27349"), {
        upsertRow: async (tableName, row) => {
          if (stryMutAct_9fa48("27350")) {
            {}
          } else {
            stryCov_9fa48("27350");
            await systemTableWriter.upsertSystemTableRow(tableName, row);
          }
        }
      }));
      const metaEndpoints = await registerBuiltInMetaServiceEndpoints(stryMutAct_9fa48("27351") ? {} : (stryCov_9fa48("27351"), {
        upsertRow: async (tableName, row) => {
          if (stryMutAct_9fa48("27352")) {
            {}
          } else {
            stryCov_9fa48("27352");
            await systemTableWriter.upsertSystemTableRow(tableName, row);
            this.projectBootstrapRowToCache(tableName, row);
          }
        },
        nodeId: d.getNodeId(),
        nodeAddress: d.getNodeAddress(),
        advertisedNodeWsAddress: stryMutAct_9fa48("27355") ? d.getAdvertisedNodeWsAddress?.() && null : stryMutAct_9fa48("27354") ? false : stryMutAct_9fa48("27353") ? true : (stryCov_9fa48("27353", "27354", "27355"), (stryMutAct_9fa48("27356") ? d.getAdvertisedNodeWsAddress() : (stryCov_9fa48("27356"), d.getAdvertisedNodeWsAddress?.())) || null),
        wsPort: d.getWsPort()
      }));
      logger.debug(BOOTSTRAP_LOG_MSG.SERVICES_REGISTERED, stryMutAct_9fa48("27357") ? {} : (stryCov_9fa48("27357"), {
        metaServices,
        metaEndpoints
      }));
    }
  }

  /**
   * Project bootstrap-time system-table rows into the local cache when a
   * writable cache is available so later bootstrap steps observe the same
   * canonical metadata without waiting on cache convergence.
   * @param {string} tableName
   * @param {Object} row
   * @return {void}
   */
  projectBootstrapRowToCache(tableName, row) {
    if (stryMutAct_9fa48("27358")) {
      {}
    } else {
      stryCov_9fa48("27358");
      const systemTableCache = stryMutAct_9fa48("27359") ? this.delegates.getSystemTableCache() : (stryCov_9fa48("27359"), this.delegates.getSystemTableCache?.());
      if (stryMutAct_9fa48("27362") ? false : stryMutAct_9fa48("27361") ? true : stryMutAct_9fa48("27360") ? systemTableCache : (stryCov_9fa48("27360", "27361", "27362"), !systemTableCache)) {
        if (stryMutAct_9fa48("27363")) {
          {}
        } else {
          stryCov_9fa48("27363");
          return;
        }
      }
      const applyBootstrapCacheHydration = createBootstrapCacheHydrationApplier(systemTableCache);
      applyBootstrapCacheHydration(tableName, stryMutAct_9fa48("27364") ? "" : (stryCov_9fa48("27364"), 'INSERT'), row);
    }
  }

  /**
   * Register system tables metadata.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   */
  async registerSystemTables(now) {
    if (stryMutAct_9fa48("27365")) {
      {}
    } else {
      stryCov_9fa48("27365");
      const d = this.delegates;
      const logger = d.getLogger();
      const systemTableWriter = this.ensureSystemTableWriter();
      for (const schema of SYSTEM_TABLE_SCHEMAS) {
        if (stryMutAct_9fa48("27366")) {
          {}
        } else {
          stryCov_9fa48("27366");
          const tableName = schema.tableName;
          const partitionId = INITIAL_PARTITION_IDS[tableName];
          const tableData = stryMutAct_9fa48("27367") ? {} : (stryCov_9fa48("27367"), {
            table_id: tableName,
            table_name: tableName,
            schema_definition: JSON.stringify(schema),
            partition_key: schema.columns[NUM.ZERO].name,
            table_policies: JSON.stringify({}),
            partition_count: NUM.ONE,
            active_partition_version: NUM.ONE,
            pending_partition_version: null,
            partition_transition_state: null,
            partition_transition_metadata: null,
            created_at: now,
            updated_at: now
          });
          try {
            if (stryMutAct_9fa48("27368")) {
              {}
            } else {
              stryCov_9fa48("27368");
              await systemTableWriter.upsertSystemTableRow(SYSTEM_TABLE_NAME.TABLES, tableData);
            }
          } catch (error) {
            if (stryMutAct_9fa48("27369")) {
              {}
            } else {
              stryCov_9fa48("27369");
              logger.error(BOOTSTRAP_LOG_MSG.TABLE_REGISTER_FAILED, stryMutAct_9fa48("27370") ? {} : (stryCov_9fa48("27370"), {
                tableName,
                error: error.message
              }));
              throw error;
            }
          }
          const partitionData = stryMutAct_9fa48("27371") ? {} : (stryCov_9fa48("27371"), {
            partition_id: partitionId,
            table_id: tableName,
            table_name: tableName,
            partition_key_start: null,
            partition_key_end: null,
            partition_version: NUM.ONE,
            replica_count: NUM.THREE,
            size_bytes: NUM.ZERO,
            leader_node_id: d.getNodeId(),
            state: PARTITION_STATE.NORMAL,
            created_at: now,
            updated_at: now
          });
          try {
            if (stryMutAct_9fa48("27372")) {
              {}
            } else {
              stryCov_9fa48("27372");
              await systemTableWriter.upsertSystemTableRow(SYSTEM_TABLE_NAME.PARTITIONS, partitionData);
            }
          } catch (error) {
            if (stryMutAct_9fa48("27373")) {
              {}
            } else {
              stryCov_9fa48("27373");
              logger.error(BOOTSTRAP_LOG_MSG.PARTITION_REGISTER_FAILED, stryMutAct_9fa48("27374") ? {} : (stryCov_9fa48("27374"), {
                partitionId,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }
      logger.debug(BOOTSTRAP_LOG_MSG.SYSTEM_TABLES_REGISTERED, stryMutAct_9fa48("27375") ? {} : (stryCov_9fa48("27375"), {
        tableCount: SYSTEM_TABLE_SCHEMAS.length
      }));
    }
  }

  /**
   * Update partition sizes in the partitions table.
   * @return {Promise<void>}
   */
  async updatePartitionSizes() {
    if (stryMutAct_9fa48("27376")) {
      {}
    } else {
      stryCov_9fa48("27376");
      const d = this.delegates;
      const logger = d.getLogger();
      const systemTableWriter = this.ensureSystemTableWriter();
      const updatedPartitions = new Set();
      let updatedCount = NUM.ZERO;
      for (const [_replicaId, partitionService] of d.getPartitionServices()) {
        if (stryMutAct_9fa48("27377")) {
          {}
        } else {
          stryCov_9fa48("27377");
          const partitionId = partitionService.partitionId;
          if (stryMutAct_9fa48("27379") ? false : stryMutAct_9fa48("27378") ? true : (stryCov_9fa48("27378", "27379"), updatedPartitions.has(partitionId))) {
            if (stryMutAct_9fa48("27380")) {
              {}
            } else {
              stryCov_9fa48("27380");
              continue;
            }
          }
          try {
            if (stryMutAct_9fa48("27381")) {
              {}
            } else {
              stryCov_9fa48("27381");
              const sizeBytes = await partitionService.calculatePartitionSize();
              await systemTableWriter.updateSystemTableRow(SYSTEM_TABLE_NAME.PARTITIONS, stryMutAct_9fa48("27382") ? {} : (stryCov_9fa48("27382"), {
                partition_id: partitionId
              }), stryMutAct_9fa48("27383") ? {} : (stryCov_9fa48("27383"), {
                size_bytes: sizeBytes,
                updated_at: Date.now()
              }));
              updatedPartitions.add(partitionId);
              stryMutAct_9fa48("27384") ? updatedCount-- : (stryCov_9fa48("27384"), updatedCount++);
              logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_SIZE_UPDATED, stryMutAct_9fa48("27385") ? {} : (stryCov_9fa48("27385"), {
                partitionId,
                sizeBytes
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("27386")) {
              {}
            } else {
              stryCov_9fa48("27386");
              logger.error(BOOTSTRAP_LOG_MSG.PARTITION_SIZE_UPDATE_FAILED, stryMutAct_9fa48("27387") ? {} : (stryCov_9fa48("27387"), {
                partitionId,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }
      logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_SIZES_UPDATED, stryMutAct_9fa48("27388") ? {} : (stryCov_9fa48("27388"), {
        updatedCount,
        totalPartitions: updatedPartitions.size
      }));
    }
  }

  /**
   * Seed dynamic configuration into the config system table.
   * @return {Promise<void>}
   */
  async seedDynamicConfiguration() {
    if (stryMutAct_9fa48("27389")) {
      {}
    } else {
      stryCov_9fa48("27389");
      const d = this.delegates;
      const logger = d.getLogger();
      const configPartition = this.runtimeOwner.findLeaderPartition(SYSTEM_TABLE_NAME.CONFIG);
      if (stryMutAct_9fa48("27392") ? configPartition.isLeader : stryMutAct_9fa48("27391") ? false : stryMutAct_9fa48("27390") ? true : (stryCov_9fa48("27390", "27391", "27392"), configPartition?.isLeader)) {
        if (stryMutAct_9fa48("27393")) {
          {}
        } else {
          stryCov_9fa48("27393");
          try {
            if (stryMutAct_9fa48("27394")) {
              {}
            } else {
              stryCov_9fa48("27394");
              const result = await configPartition.executeQuery(BOOTSTRAP_SQL.CONFIG_COUNT);
              if (stryMutAct_9fa48("27397") ? result && result.rows && result.rows.length > NUM.ZERO || result.rows[NUM.ZERO].count > NUM.ZERO : stryMutAct_9fa48("27396") ? false : stryMutAct_9fa48("27395") ? true : (stryCov_9fa48("27395", "27396", "27397"), (stryMutAct_9fa48("27399") ? result && result.rows || result.rows.length > NUM.ZERO : stryMutAct_9fa48("27398") ? true : (stryCov_9fa48("27398", "27399"), (stryMutAct_9fa48("27401") ? result || result.rows : stryMutAct_9fa48("27400") ? true : (stryCov_9fa48("27400", "27401"), result && result.rows)) && (stryMutAct_9fa48("27404") ? result.rows.length <= NUM.ZERO : stryMutAct_9fa48("27403") ? result.rows.length >= NUM.ZERO : stryMutAct_9fa48("27402") ? true : (stryCov_9fa48("27402", "27403", "27404"), result.rows.length > NUM.ZERO)))) && (stryMutAct_9fa48("27407") ? result.rows[NUM.ZERO].count <= NUM.ZERO : stryMutAct_9fa48("27406") ? result.rows[NUM.ZERO].count >= NUM.ZERO : stryMutAct_9fa48("27405") ? true : (stryCov_9fa48("27405", "27406", "27407"), result.rows[NUM.ZERO].count > NUM.ZERO)))) {
                if (stryMutAct_9fa48("27408")) {
                  {}
                } else {
                  stryCov_9fa48("27408");
                  logger.info(BOOTSTRAP_LOG_MSG.CONFIG_ALREADY_SEEDED, stryMutAct_9fa48("27409") ? {} : (stryCov_9fa48("27409"), {
                    existingCount: result.rows[NUM.ZERO].count
                  }));
                  return;
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("27410")) {
              {}
            } else {
              stryCov_9fa48("27410");
              logger.debug(BOOTSTRAP_LOG_MSG.CONFIG_CHECK_FAILED, stryMutAct_9fa48("27411") ? {} : (stryCov_9fa48("27411"), {
                error: error.message
              }));
              throw error;
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("27412")) {
          {}
        } else {
          stryCov_9fa48("27412");
          logger.debug(BOOTSTRAP_LOG_MSG.CONFIG_LEADER_MISSING, stryMutAct_9fa48("27413") ? {} : (stryCov_9fa48("27413"), {
            strategy: stryMutAct_9fa48("27414") ? "" : (stryCov_9fa48("27414"), 'direct_bootstrap_seed')
          }));
        }
      }
      const systemTableCache = d.getSystemTableCache();
      const cdcIntegrationService = d.ensureBootstrapCdcIntegrationService();
      const dynamicConfigService = new DynamicConfigService(stryMutAct_9fa48("27415") ? {} : (stryCov_9fa48("27415"), {
        cdcIntegrationService,
        systemTableCache,
        nodeId: d.getNodeId()
      }));
      await dynamicConfigService.initialize();
      try {
        if (stryMutAct_9fa48("27416")) {
          {}
        } else {
          stryCov_9fa48("27416");
          const result = await dynamicConfigService.seedConfiguration(CONFIG_SEED_SOURCE.SYSTEM, stryMutAct_9fa48("27417") ? {} : (stryCov_9fa48("27417"), {
            skipExistingCheck: stryMutAct_9fa48("27418") ? false : (stryCov_9fa48("27418"), true),
            useDirectCdcMutations: stryMutAct_9fa48("27419") ? false : (stryCov_9fa48("27419"), true)
          }));
          logger.info(BOOTSTRAP_LOG_MSG.CONFIG_SEEDED, stryMutAct_9fa48("27420") ? {} : (stryCov_9fa48("27420"), {
            seeded: result.seeded.length,
            skipped: result.skipped.length
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("27421")) {
          {}
        } else {
          stryCov_9fa48("27421");
          logger.error(BOOTSTRAP_LOG_MSG.CONFIG_SEED_FAILED, stryMutAct_9fa48("27422") ? {} : (stryCov_9fa48("27422"), {
            error: error.message,
            stack: error.stack
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Persist the authoritative assignment epoch in config table.
   * @return {Promise<void>}
   */
  async persistCurrentEpochIfMissing() {
    if (stryMutAct_9fa48("27423")) {
      {}
    } else {
      stryCov_9fa48("27423");
      const d = this.delegates;
      const epochManager = d.getEpochManager();
      if (stryMutAct_9fa48("27426") ? false : stryMutAct_9fa48("27425") ? true : stryMutAct_9fa48("27424") ? epochManager : (stryCov_9fa48("27424", "27425", "27426"), !epochManager)) {
        if (stryMutAct_9fa48("27427")) {
          {}
        } else {
          stryCov_9fa48("27427");
          return;
        }
      }
      const configPartition = this.runtimeOwner.findLeaderPartition(SYSTEM_TABLE_NAME.CONFIG);
      if (stryMutAct_9fa48("27430") ? configPartition.isLeader : stryMutAct_9fa48("27429") ? false : stryMutAct_9fa48("27428") ? true : (stryCov_9fa48("27428", "27429", "27430"), configPartition?.isLeader)) {
        if (stryMutAct_9fa48("27431")) {
          {}
        } else {
          stryCov_9fa48("27431");
          const result = await configPartition.executeQuery(EPOCH_EXISTS_SQL, stryMutAct_9fa48("27432") ? [] : (stryCov_9fa48("27432"), [EPOCH_CONFIG_KEY]));
          const hasEpoch = stryMutAct_9fa48("27435") ? result?.success && Array.isArray(result.rows) || result.rows.length > NUM.ZERO : stryMutAct_9fa48("27434") ? false : stryMutAct_9fa48("27433") ? true : (stryCov_9fa48("27433", "27434", "27435"), (stryMutAct_9fa48("27437") ? result?.success || Array.isArray(result.rows) : stryMutAct_9fa48("27436") ? true : (stryCov_9fa48("27436", "27437"), (stryMutAct_9fa48("27438") ? result.success : (stryCov_9fa48("27438"), result?.success)) && Array.isArray(result.rows))) && (stryMutAct_9fa48("27441") ? result.rows.length <= NUM.ZERO : stryMutAct_9fa48("27440") ? result.rows.length >= NUM.ZERO : stryMutAct_9fa48("27439") ? true : (stryCov_9fa48("27439", "27440", "27441"), result.rows.length > NUM.ZERO)));
          if (stryMutAct_9fa48("27443") ? false : stryMutAct_9fa48("27442") ? true : (stryCov_9fa48("27442", "27443"), hasEpoch)) {
            if (stryMutAct_9fa48("27444")) {
              {}
            } else {
              stryCov_9fa48("27444");
              return;
            }
          }
        }
      }
      const epoch = epochManager.getCurrentEpoch();
      const serializedEpoch = epoch.toJSON();
      const now = Date.now();
      const systemTableWriter = this.ensureSystemTableWriter();
      await systemTableWriter.upsertSystemTableRow(SYSTEM_TABLE_NAME.CONFIG, stryMutAct_9fa48("27445") ? {} : (stryCov_9fa48("27445"), {
        [COLUMN.CONFIG_KEY]: EPOCH_CONFIG_KEY,
        [COLUMN.CONFIG_VALUE]: serializedEpoch,
        [COLUMN.VALUE_TYPE]: CONFIG_VALUE_TYPE.JSON,
        [COLUMN.REQUIRES_RESTART]: NUM.ZERO,
        [COLUMN.DESCRIPTION]: BOOTSTRAP_EPOCH.CONFIG_DESCRIPTION,
        [COLUMN.DEFAULT_VALUE]: serializedEpoch,
        [COLUMN.UPDATED_BY]: d.getNodeId(),
        [COLUMN.UPDATED_AT]: now,
        [COLUMN.CREATED_AT]: now
      }));
    }
  }

  /**
   * Ensure system table writer is initialized.
   * @return {BootstrapSystemTableWriter|RoutedSqlSystemTableWriter}
   */
  ensureSystemTableWriter() {
    if (stryMutAct_9fa48("27446")) {
      {}
    } else {
      stryCov_9fa48("27446");
      const d = this.delegates;
      let systemTableWriter = d.getSystemTableWriter();
      if (stryMutAct_9fa48("27449") ? false : stryMutAct_9fa48("27448") ? true : stryMutAct_9fa48("27447") ? systemTableWriter : (stryCov_9fa48("27447", "27448", "27449"), !systemTableWriter)) {
        if (stryMutAct_9fa48("27450")) {
          {}
        } else {
          stryCov_9fa48("27450");
          const cdcIntegrationService = d.ensureBootstrapCdcIntegrationService();
          systemTableWriter = new BootstrapSystemTableWriter(cdcIntegrationService, d.getPartitionServices());
          d.setSystemTableWriter(systemTableWriter);
        }
      }
      return systemTableWriter;
    }
  }

  /**
   * Swap writer to routed SQL implementation once cache is hydrated.
   */
  swapSystemTableWriter() {
    if (stryMutAct_9fa48("27451")) {
      {}
    } else {
      stryCov_9fa48("27451");
      const d = this.delegates;
      const logger = d.getLogger();
      const cdcIntegrationService = d.getCdcIntegrationService();
      if (stryMutAct_9fa48("27454") ? false : stryMutAct_9fa48("27453") ? true : stryMutAct_9fa48("27452") ? cdcIntegrationService : (stryCov_9fa48("27452", "27453", "27454"), !cdcIntegrationService)) {
        if (stryMutAct_9fa48("27455")) {
          {}
        } else {
          stryCov_9fa48("27455");
          return;
        }
      }
      const currentWriter = d.getSystemTableWriter();
      if (stryMutAct_9fa48("27458") ? currentWriter || currentWriter.disable : stryMutAct_9fa48("27457") ? false : stryMutAct_9fa48("27456") ? true : (stryCov_9fa48("27456", "27457", "27458"), currentWriter && currentWriter.disable)) {
        if (stryMutAct_9fa48("27459")) {
          {}
        } else {
          stryCov_9fa48("27459");
          currentWriter.disable();
          logger.debug(BOOTSTRAP_LOG_MSG.BOOTSTRAP_MODE_DISABLED, stryMutAct_9fa48("27460") ? {} : (stryCov_9fa48("27460"), {
            nodeId: d.getNodeId()
          }));
        }
      }
      const newWriter = new RoutedSqlSystemTableWriter(cdcIntegrationService);
      newWriter.enable();
      d.setSystemTableWriter(newWriter);
    }
  }
}
export { SeedRegistrationPhase };