/**
 * Seed Registration Phase — handles Phase 4 of seed bootstrap:
 * registering all services, tables, partitions, and configuration
 * in system tables using bootstrap-mode direct writes.
 *
 * Extracted from BootstrapService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {DynamicConfigService} from '../../config/dynamic-config-service.js';
import {
  CONFIG_SEED_SOURCE,
  CONFIG_VALUE_TYPE,
} from '../../config/config-constants.js';
import {assertCritical} from '../../utils/assert.js';
import {EPOCH_CONFIG_KEY} from '../../cdc/cdc-integration-service.js';
import {
  BootstrapSystemTableWriter,
  RoutedSqlSystemTableWriter,
} from '../system-table-writer.js';
import {MessageGroupServiceRowOwner} from
  '../../message-group/message-group-service-row-owner.js';
import {
  registerBuiltInMetaServiceDefinitions,
  registerBuiltInMetaServiceEndpoints,
} from '../shared/meta-service-definition-registration.js';
import {
  BOOTSTRAP_EPOCH,
  BOOTSTRAP_ERROR,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_MESSAGE_GROUP,
  BOOTSTRAP_SQL,
} from '../bootstrap-constants.js';
import {
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_SCHEMAS,
  INITIAL_MESSAGE_GROUP_ID,
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
} from '../system-table-schemas-constants.js';
import {PARTITION_STATE} from '../../partition/partition-constants.js';
import {RAFT_ROLE} from '../../raft/constants.js';
import {
  ADDRESS,
  COLUMN,
  ENTITY_TYPE,
  NUM,
  SERVICE_STATUS,
  SERVICE_TYPE,
} from '../../constants/index.js';

const EPOCH_EXISTS_SQL = BOOTSTRAP_SQL.EPOCH_EXISTS;

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
    this.delegates = options.delegates || {};
  }

  /**
   * Phase 4: Service registration.
   * Register all services in system tables using bootstrap mode.
   * @return {Promise<void>}
   */
  async phaseRegistration() {
    const d = this.delegates;
    const logger = d.getLogger();
    const timestamp = Date.now();

    await d.waitForPartitionLeadership();
    const systemTableWriter = this.ensureSystemTableWriter();

    logger.debug(BOOTSTRAP_LOG_MSG.BOOTSTRAP_MODE_ENABLED, {
      nodeId: d.getNodeId(),
      partitionCount: d.getPartitionServices().size,
    });
    systemTableWriter.enable();

    await this.registerMessageGroup(timestamp);
    await this.registerServices(timestamp);
    await this.registerMetaServiceDefinitions();
    await this.registerSystemTables(timestamp);
    await this.updatePartitionSizes();
    await this.seedDynamicConfiguration();
    await this.persistCurrentEpochIfMissing();

    logger.debug(BOOTSTRAP_LOG_MSG.SERVICE_REGISTRATION_COMPLETE, {
      nodeId: d.getNodeId(),
      servicesCreated: d.getServicesCreated(),
    });
  }

  /**
   * Register the initial message group.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   */
  async registerMessageGroup(now) {
    const d = this.delegates;
    const logger = d.getLogger();
    const systemTableWriter = this.ensureSystemTableWriter();

    const leaderService = d.getLeaderMessageGroupService();
    const leaderNodeId = leaderService?.nodeId || d.getNodeId();

    const groupData = {
      group_id: INITIAL_MESSAGE_GROUP_ID,
      group_name: BOOTSTRAP_MESSAGE_GROUP.NAME,
      replica_count: BOOTSTRAP_MESSAGE_GROUP.REPLICA_COUNT,
      [COLUMN.LEADER_NODE_ID]: leaderNodeId,
      policy: JSON.stringify(BOOTSTRAP_MESSAGE_GROUP.POLICY),
      created_at: now,
      updated_at: now,
    };

    try {
      await systemTableWriter.upsertSystemTableRow(
        SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
        groupData,
      );
      logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_REGISTERED, {
        groupId: INITIAL_MESSAGE_GROUP_ID,
      });
    } catch (error) {
      logger.error(
        BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_REGISTER_FAILED, {
          groupId: INITIAL_MESSAGE_GROUP_ID,
          error: error.message,
        });
      throw error;
    }
  }

  /**
   * Register all services in the services table.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   */
  async registerServices(now) {
    const d = this.delegates;
    const logger = d.getLogger();
    const systemTableWriter = this.ensureSystemTableWriter();
    const nodeId = d.getNodeId();
    const messageGroupServiceRowOwner =
      new MessageGroupServiceRowOwner({
        systemTableWriter,
        now: () => now,
      });

    // Register message group replicas
    for (const [replicaId, service] of
      d.getMessageGroupServices()) {
      const serviceData =
        MessageGroupServiceRowOwner.buildServiceRow({
          groupId: INITIAL_MESSAGE_GROUP_ID,
          replicaId,
          nodeId,
          service,
          timestamp: now,
        });

      logger.debug(
        BOOTSTRAP_LOG_MSG.REGISTERING_SERVICE, {
          serviceId: replicaId,
          serviceType: SERVICE_TYPE.MESSAGE_GROUP,
          raftRole: serviceData.raft_role,
          address: serviceData.address,
          nodeId,
        });

      try {
        await messageGroupServiceRowOwner.registerReplica({
          groupId: INITIAL_MESSAGE_GROUP_ID,
          replicaId,
          nodeId,
          service,
          timestamp: now,
        });
      } catch (error) {
        logger.error(
          BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_SERVICE_REGISTER_FAILED,
          {replicaId, error: error.message},
        );
        throw error;
      }
    }

    // Register partition replicas
    for (const [replicaId, service] of
      d.getPartitionServices()) {
      const isLeader = service.isLeader === true;
      const currentRole = service.getRole ?
        service.getRole() : service.role;
      const raftRole = isLeader ?
        RAFT_ROLE.LEADER :
        currentRole || RAFT_ROLE.FOLLOWER;
      const serviceData = {
        service_id: replicaId,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: nodeId,
        partition_id: service.partitionId,
        group_id: null,
        replica_id: replicaId,
        raft_role: raftRole,
        status: SERVICE_STATUS.ACTIVE,
        address: `${nodeId}${ADDRESS.SEPARATOR}` +
          `${ENTITY_TYPE.PARTITION}${ADDRESS.SEPARATOR}` +
          `${replicaId}`,
        created_at: now,
        updated_at: now,
      };

      try {
        await systemTableWriter.upsertSystemTableRow(
          SYSTEM_TABLE_NAME.SERVICES,
          serviceData,
        );
      } catch (error) {
        logger.error(
          BOOTSTRAP_LOG_MSG.PARTITION_SERVICE_REGISTER_FAILED,
          {replicaId, error: error.message},
        );
        throw error;
      }
    }

    logger.debug(BOOTSTRAP_LOG_MSG.SERVICES_REGISTERED, {
      messageGroupServices: d.getMessageGroupServices().size,
      partitionServices: d.getPartitionServices().size,
    });
  }

  /**
   * Register built-in runtime service definitions.
   * @return {Promise<void>}
   */
  async registerMetaServiceDefinitions() {
    const d = this.delegates;
    const logger = d.getLogger();
    const systemTableWriter = this.ensureSystemTableWriter();
    const metaServices =
      await registerBuiltInMetaServiceDefinitions({
        upsertRow: async (tableName, row) => {
          await systemTableWriter.upsertSystemTableRow(
            tableName, row,
          );
        },
      });
    const metaEndpoints =
      await registerBuiltInMetaServiceEndpoints({
        upsertRow: async (tableName, row) => {
          await systemTableWriter.upsertSystemTableRow(
            tableName, row,
          );
        },
        nodeId: d.getNodeId(),
        nodeAddress: d.getNodeAddress(),
        wsPort: d.getWsPort(),
      });

    logger.debug(BOOTSTRAP_LOG_MSG.SERVICES_REGISTERED, {
      metaServices,
      metaEndpoints,
    });
  }

  /**
   * Register system tables metadata.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   */
  async registerSystemTables(now) {
    const d = this.delegates;
    const logger = d.getLogger();
    const systemTableWriter = this.ensureSystemTableWriter();

    for (const schema of SYSTEM_TABLE_SCHEMAS) {
      const tableName = schema.tableName;
      const partitionId = INITIAL_PARTITION_IDS[tableName];

      const tableData = {
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
        updated_at: now,
      };

      try {
        await systemTableWriter.upsertSystemTableRow(
          SYSTEM_TABLE_NAME.TABLES,
          tableData,
        );
      } catch (error) {
        logger.error(BOOTSTRAP_LOG_MSG.TABLE_REGISTER_FAILED, {
          tableName,
          error: error.message,
        });
        throw error;
      }

      const partitionData = {
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
        updated_at: now,
      };

      try {
        await systemTableWriter.upsertSystemTableRow(
          SYSTEM_TABLE_NAME.PARTITIONS,
          partitionData,
        );
      } catch (error) {
        logger.error(
          BOOTSTRAP_LOG_MSG.PARTITION_REGISTER_FAILED, {
            partitionId,
            error: error.message,
          });
        throw error;
      }
    }

    logger.debug(BOOTSTRAP_LOG_MSG.SYSTEM_TABLES_REGISTERED, {
      tableCount: SYSTEM_TABLE_SCHEMAS.length,
    });
  }

  /**
   * Update partition sizes in the partitions table.
   * @return {Promise<void>}
   */
  async updatePartitionSizes() {
    const d = this.delegates;
    const logger = d.getLogger();
    const systemTableWriter = this.ensureSystemTableWriter();

    const updatedPartitions = new Set();
    let updatedCount = NUM.ZERO;

    for (const [_replicaId, partitionService] of
      d.getPartitionServices()) {
      const partitionId = partitionService.partitionId;

      if (updatedPartitions.has(partitionId)) {
        continue;
      }

      try {
        const sizeBytes =
          await partitionService.calculatePartitionSize();

        await systemTableWriter.updateSystemTableRow(
          SYSTEM_TABLE_NAME.PARTITIONS,
          {partition_id: partitionId},
          {size_bytes: sizeBytes, updated_at: Date.now()},
        );

        updatedPartitions.add(partitionId);
        updatedCount++;

        logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_SIZE_UPDATED, {
          partitionId,
          sizeBytes,
        });
      } catch (error) {
        logger.error(
          BOOTSTRAP_LOG_MSG.PARTITION_SIZE_UPDATE_FAILED, {
            partitionId,
            error: error.message,
          });
        throw error;
      }
    }

    logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_SIZES_UPDATED, {
      updatedCount,
      totalPartitions: updatedPartitions.size,
    });
  }

  /**
   * Seed dynamic configuration into the config system table.
   * @return {Promise<void>}
   */
  async seedDynamicConfiguration() {
    const d = this.delegates;
    const logger = d.getLogger();

    const configPartition =
      this.getLeaderPartition(SYSTEM_TABLE_NAME.CONFIG);
    if (!configPartition || !configPartition.isLeader) {
      logger.warn(BOOTSTRAP_LOG_MSG.CONFIG_LEADER_MISSING);
      return;
    }

    try {
      const result = await configPartition.executeQuery(
        BOOTSTRAP_SQL.CONFIG_COUNT,
      );
      if (result && result.rows && result.rows.length > NUM.ZERO &&
          result.rows[NUM.ZERO].count > NUM.ZERO) {
        logger.info(BOOTSTRAP_LOG_MSG.CONFIG_ALREADY_SEEDED, {
          existingCount: result.rows[NUM.ZERO].count,
        });
        return;
      }
    } catch (error) {
      logger.debug(BOOTSTRAP_LOG_MSG.CONFIG_CHECK_FAILED, {
        error: error.message,
      });
      throw error;
    }

    const systemTableCache = d.getSystemTableCache();
    const cdcIntegrationService =
      d.ensureBootstrapCdcIntegrationService();

    const dynamicConfigService = new DynamicConfigService({
      cdcIntegrationService,
      systemTableCache,
      nodeId: d.getNodeId(),
    });
    await dynamicConfigService.initialize();

    try {
      const result = await dynamicConfigService.seedConfiguration(
        CONFIG_SEED_SOURCE.SYSTEM,
      );
      logger.info(BOOTSTRAP_LOG_MSG.CONFIG_SEEDED, {
        seeded: result.seeded.length,
        skipped: result.skipped.length,
      });
    } catch (error) {
      logger.error(BOOTSTRAP_LOG_MSG.CONFIG_SEED_FAILED, {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Persist the authoritative assignment epoch in config table.
   * @return {Promise<void>}
   */
  async persistCurrentEpochIfMissing() {
    const d = this.delegates;
    const epochManager = d.getEpochManager();
    if (!epochManager) {
      return;
    }

    const configPartition =
      this.getLeaderPartition(SYSTEM_TABLE_NAME.CONFIG);
    if (!configPartition || !configPartition.isLeader) {
      throw new Error(BOOTSTRAP_LOG_MSG.CONFIG_LEADER_MISSING);
    }

    const result = await configPartition.executeQuery(
      EPOCH_EXISTS_SQL,
      [EPOCH_CONFIG_KEY],
    );
    const hasEpoch = result?.success &&
      Array.isArray(result.rows) &&
      result.rows.length > NUM.ZERO;
    if (hasEpoch) {
      return;
    }

    const epoch = epochManager.getCurrentEpoch();
    const serializedEpoch = epoch.toJSON();
    const now = Date.now();
    const systemTableWriter = this.ensureSystemTableWriter();

    await systemTableWriter.upsertSystemTableRow(
      SYSTEM_TABLE_NAME.CONFIG, {
        [COLUMN.CONFIG_KEY]: EPOCH_CONFIG_KEY,
        [COLUMN.CONFIG_VALUE]: serializedEpoch,
        [COLUMN.VALUE_TYPE]: CONFIG_VALUE_TYPE.JSON,
        [COLUMN.REQUIRES_RESTART]: NUM.ZERO,
        [COLUMN.DESCRIPTION]:
          BOOTSTRAP_EPOCH.CONFIG_DESCRIPTION,
        [COLUMN.DEFAULT_VALUE]: serializedEpoch,
        [COLUMN.UPDATED_BY]: d.getNodeId(),
        [COLUMN.UPDATED_AT]: now,
        [COLUMN.CREATED_AT]: now,
      });
  }

  /**
   * Ensure system table writer is initialized.
   * @return {BootstrapSystemTableWriter|RoutedSqlSystemTableWriter}
   */
  ensureSystemTableWriter() {
    const d = this.delegates;
    let systemTableWriter = d.getSystemTableWriter();
    if (!systemTableWriter) {
      const cdcIntegrationService =
        d.ensureBootstrapCdcIntegrationService();
      systemTableWriter = new BootstrapSystemTableWriter(
        cdcIntegrationService,
        d.getPartitionServices(),
      );
      d.setSystemTableWriter(systemTableWriter);
    }
    return systemTableWriter;
  }

  /**
   * Swap writer to routed SQL implementation once cache is hydrated.
   */
  swapSystemTableWriter() {
    const d = this.delegates;
    const logger = d.getLogger();
    const cdcIntegrationService = d.getCdcIntegrationService();
    if (!cdcIntegrationService) {
      return;
    }

    const currentWriter = d.getSystemTableWriter();
    if (currentWriter && currentWriter.disable) {
      currentWriter.disable();
      logger.debug(BOOTSTRAP_LOG_MSG.BOOTSTRAP_MODE_DISABLED, {
        nodeId: d.getNodeId(),
      });
    }

    const newWriter = new RoutedSqlSystemTableWriter(
      cdcIntegrationService,
    );
    newWriter.enable();
    d.setSystemTableWriter(newWriter);
  }

  /**
   * Get the leader partition for a system table.
   * @param {string} tableName
   * @return {PartitionService|null}
   */
  getLeaderPartition(tableName) {
    const d = this.delegates;
    const replicaIds = INITIAL_REPLICA_IDS[tableName];
    assertCritical(
      replicaIds,
      BOOTSTRAP_ERROR.PARTITION_REPLICAS_MISSING,
    );

    for (const replicaId of replicaIds) {
      const partition =
        d.getPartitionServices().get(replicaId);
      if (partition && partition.isLeader) {
        return partition;
      }
    }

    throw new Error(BOOTSTRAP_ERROR.PARTITION_LEADER_MISSING);
  }
}

export {SeedRegistrationPhase};
