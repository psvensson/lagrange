/**
 * Registration Phase - Fourth phase of bootstrap process.
 *
 * Registers all services in system tables using CDCIntegrationService
 * bootstrap mode for direct partition writes. Bootstrap mode bypasses
 * SQL routing since the cache is not yet populated.
 *
 * Requirements: 2.4, 3.1, 3.3, 3.4, 6.4, 6.7
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../../logging/logging-service.js';
import {DynamicConfigService} from '../../config/dynamic-config-service.js';
import {CONFIG_SEED_SOURCE} from '../../config/config-constants.js';
import {assertCritical} from '../../utils/assert.js';
import {
  COLUMN,
  NUM,
  SERVICE_TYPE,
  STATE,
  ADDRESS,
  ENTITY_TYPE,
} from '../../constants/index.js';
import {RAFT_ROLE} from '../../raft/constants.js';
import {PARTITION_STATE} from '../../partition/partition-constants.js';
import {
  BOOTSTRAP_SUBSYSTEM,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_DEFAULT,
  BOOTSTRAP_MESSAGE_GROUP,
  BOOTSTRAP_SQL,
} from '../bootstrap-constants.js';
import {
  SystemTableName,
  SYSTEM_TABLE_SCHEMAS,
  INITIAL_PARTITION_IDS,
  INITIAL_MESSAGE_GROUP_ID,
  generateCreateTableSQL,
  generateCreateIndexSQL,
  getSchemaByTableName,
} from '../system-table-schemas-constants.js';

/**
 * Phase constants for registration.
 */
const REGISTRATION_PHASE = {
  NAME: 'registration',
  EVENT_START: 'registration:start',
  EVENT_COMPLETE: 'registration:complete',
  EVENT_FAILED: 'registration:failed',
};

/**
 * Required system tables that must exist before CDC operations.
 * These tables are needed for service registration and CDC event handling.
 */
const REQUIRED_SYSTEM_TABLES = [
  SystemTableName.NODES,
  SystemTableName.SERVICES,
  SystemTableName.PARTITIONS,
  SystemTableName.TABLES,
  SystemTableName.MESSAGE_GROUPS,
  SystemTableName.REPLICA_OPERATIONS,
];

/**
 * SQL for checking table existence.
 */
const REGISTRATION_SQL = {
  CHECK_TABLE_EXISTS: 'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?',
};

/**
 * RegistrationPhase handles the fourth phase of bootstrap.
 * Registers all services in system tables using direct partition writes.
 */
class RegistrationPhase extends EventEmitter {
  /**
   * Create registration phase.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (REQUIRED).
   * @param {Map} options.partitionServices - Partition services map (REQUIRED).
   * @param {Map} options.messageGroupServices - Message group services map (REQUIRED).
   * @param {Object} options.cdcIntegrationService - CDC integration service (REQUIRED).
   * @param {Function} options.getLeaderMessageGroupService - Function to get leader
   *   (REQUIRED).
   * @param {Function} options.getSystemTableCache - Function to get system cache
   *   (REQUIRED).
   * @param {Object} options.config - Bootstrap configuration.
   */
  constructor(options = {}) {
    super();

    this.nodeId = assertCritical(
      options.nodeId,
      'nodeId is required for RegistrationPhase',
    );
    this.partitionServices = assertCritical(
      options.partitionServices,
      'partitionServices is required for RegistrationPhase',
    );
    this.messageGroupServices = assertCritical(
      options.messageGroupServices,
      'messageGroupServices is required for RegistrationPhase',
    );
    this.cdcIntegrationService = assertCritical(
      options.cdcIntegrationService,
      'cdcIntegrationService is required for RegistrationPhase',
    );
    this.getLeaderMessageGroupService = assertCritical(
      options.getLeaderMessageGroupService,
      'getLeaderMessageGroupService is required for RegistrationPhase',
    );
    this.getSystemTableCache = assertCritical(
      options.getSystemTableCache,
      'getSystemTableCache is required for RegistrationPhase',
    );

    this.config = {...BOOTSTRAP_DEFAULT, ...options.config};

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.SERVICE) : console;
  }

  /**
   * Execute the registration phase.
   * @return {Promise<Object>} Phase result.
   */
  async execute() {
    const startTime = Date.now();

    this.emit(REGISTRATION_PHASE.EVENT_START, {
      nodeId: this.nodeId,
    });

    try {
      const timestamp = Date.now();

      // Wait for partition leadership before attempting writes
      await this.waitForPartitionLeadership();

      // Enable bootstrap mode on CDCIntegrationService for direct writes
      // Requirements: 3.1, 3.3
      this.cdcIntegrationService.setBootstrapMode(
        true, this.partitionServices,
      );

      this.logger.debug(BOOTSTRAP_LOG_MSG.BOOTSTRAP_MODE_ENABLED, {
        nodeId: this.nodeId,
        partitionCount: this.partitionServices.size,
      });

      // Step 1: Ensure all system tables exist before CDC operations
      // This prevents "Table not found" errors during registration
      await this.ensureSystemTablesExist();

      // Register message group
      await this.registerMessageGroup(timestamp);

      // Register all services
      await this.registerServices(timestamp);

      // Register system tables metadata
      await this.registerSystemTables(timestamp);

      // Update partition sizes
      await this.updatePartitionSizes();

      // Seed dynamic configuration
      await this.seedDynamicConfiguration();

      // Disable bootstrap mode after registration
      // Requirements: 3.4
      this.cdcIntegrationService.clearBootstrapMode();

      this.logger.debug(BOOTSTRAP_LOG_MSG.SERVICE_REGISTRATION_COMPLETE, {
        nodeId: this.nodeId,
      });

      const duration = Date.now() - startTime;

      const result = {
        phaseName: REGISTRATION_PHASE.NAME,
        duration,
        services: {},
        metadata: {
          messageGroupsRegistered: NUM.ONE,
          servicesRegistered:
            this.messageGroupServices.size + this.partitionServices.size,
          tablesRegistered: SYSTEM_TABLE_SCHEMAS.length,
        },
      };

      this.emit(REGISTRATION_PHASE.EVENT_COMPLETE, result);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.emit(REGISTRATION_PHASE.EVENT_FAILED, {
        phaseName: REGISTRATION_PHASE.NAME,
        duration,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Wait for partition leadership to be established.
   * @return {Promise<void>}
   * @private
   */
  async waitForPartitionLeadership() {
    const startTime = Date.now();
    const timeoutMs = this.config.leadershipWaitTimeoutMs ||
      BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs;
    let delay = this.config.leadershipWaitInitialDelayMs ||
      BOOTSTRAP_DEFAULT.leadershipWaitInitialDelayMs;
    const maxDelay = this.config.leadershipWaitMaxDelayMs ||
      BOOTSTRAP_DEFAULT.leadershipWaitMaxDelayMs;
    const backoffMultiplier = this.config.leadershipWaitBackoffMultiplier ||
      BOOTSTRAP_DEFAULT.leadershipWaitBackoffMultiplier;

    const partitionIds = new Set();
    for (const partition of this.partitionServices.values()) {
      partitionIds.add(partition.partitionId);
    }

    this.logger.debug(BOOTSTRAP_LOG_MSG.WAITING_PARTITION_LEADERS, {
      partitionCount: partitionIds.size,
      timeoutMs,
      nodeId: this.nodeId,
    });

    // Check immediately first
    const leadersFound = this.checkPartitionLeaders(partitionIds);
    if (leadersFound.size === partitionIds.size) {
      return;
    }

    while (Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffMultiplier, maxDelay);

      const leaders = this.checkPartitionLeaders(partitionIds);
      if (leaders.size === partitionIds.size) {
        this.logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_LEADERS_FOUND, {
          partitionCount: partitionIds.size,
          elapsedMs: Date.now() - startTime,
        });
        return;
      }
    }

    const leaders = this.checkPartitionLeaders(partitionIds);
    const missing = [...partitionIds].filter((id) => !leaders.has(id));
    const missingList = missing.join(', ');
    throw new Error(`Partition leadership timeout after ${timeoutMs}ms. Missing: ${missingList}`);
  }

  /**
   * Check which partitions have leaders.
   * @param {Set<string>} partitionIds - Partition IDs to check.
   * @return {Set<string>} Partition IDs that have leaders.
   * @private
   */
  checkPartitionLeaders(partitionIds) {
    const leadersFound = new Set();
    for (const partition of this.partitionServices.values()) {
      if (partition.isLeader && partitionIds.has(partition.partitionId)) {
        leadersFound.add(partition.partitionId);
      }
    }
    return leadersFound;
  }

  /**
   * Ensure all required system tables exist before CDC operations.
   * This prevents "Table not found" errors during service registration.
   * Creates tables if they are missing during bootstrap.
   *
   * Requirements: 1.1, 1.2, 1.3
   * @return {Promise<void>}
   * @private
   */
  async ensureSystemTablesExist() {
    this.logger.debug(BOOTSTRAP_LOG_MSG.ENSURING_SYSTEM_TABLES, {
      nodeId: this.nodeId,
      tableCount: REQUIRED_SYSTEM_TABLES.length,
    });

    for (const tableName of REQUIRED_SYSTEM_TABLES) {
      await this.verifyTableExists(tableName);
    }

    this.logger.debug(BOOTSTRAP_LOG_MSG.ALL_SYSTEM_TABLES_VERIFIED, {
      nodeId: this.nodeId,
      tableCount: REQUIRED_SYSTEM_TABLES.length,
    });
  }

  /**
   * Verify a system table exists, creating it if missing.
   * @param {string} tableName - System table name to verify.
   * @return {Promise<void>}
   * @throws {Error} If table cannot be verified or created.
   * @private
   */
  async verifyTableExists(tableName) {
    this.logger.debug(BOOTSTRAP_LOG_MSG.VERIFYING_TABLE_EXISTS, {
      nodeId: this.nodeId,
      tableName,
    });

    // Find the partition service for this table
    const partitionId = INITIAL_PARTITION_IDS[tableName];
    if (!partitionId) {
      throw new Error(`No partition ID configured for system table: ${tableName}`);
    }

    // Find the leader partition service
    let leaderPartition = null;
    for (const partition of this.partitionServices.values()) {
      if (partition.partitionId === partitionId && partition.isLeader) {
        leaderPartition = partition;
        break;
      }
    }

    if (!leaderPartition) {
      throw new Error(`No leader partition found for system table: ${tableName}`);
    }

    // Check if table exists using sqlite_master
    const checkResult = await leaderPartition.executeLocalQuery(
      REGISTRATION_SQL.CHECK_TABLE_EXISTS,
      [tableName],
    );

    const tableExists = checkResult &&
      checkResult.success !== false &&
      checkResult.rows &&
      checkResult.rows.length > NUM.ZERO;

    if (tableExists) {
      this.logger.debug(BOOTSTRAP_LOG_MSG.TABLE_EXISTS, {
        nodeId: this.nodeId,
        tableName,
      });
      return;
    }

    // Table doesn't exist, create it
    this.logger.debug(BOOTSTRAP_LOG_MSG.TABLE_MISSING_CREATING, {
      nodeId: this.nodeId,
      tableName,
    });

    const schema = getSchemaByTableName(tableName);
    if (!schema) {
      throw new Error(`No schema found for system table: ${tableName}`);
    }

    // Create the table
    const createTableSql = generateCreateTableSQL(schema);
    const createResult = await leaderPartition.executeLocalQuery(createTableSql, []);

    if (!createResult || createResult.success === false) {
      const errorMsg = createResult?.error || 'Unknown error';
      this.logger.error(BOOTSTRAP_LOG_MSG.TABLE_CREATE_FAILED, {
        nodeId: this.nodeId,
        tableName,
        error: errorMsg,
      });
      throw new Error(`Failed to create system table ${tableName}: ${errorMsg}`);
    }

    // Create indices for the table
    const indexStatements = generateCreateIndexSQL(schema);
    for (const indexSql of indexStatements) {
      const indexResult = await leaderPartition.executeLocalQuery(indexSql, []);
      if (!indexResult || indexResult.success === false) {
        this.logger.warn(BOOTSTRAP_LOG_MSG.TABLE_CREATE_FAILED, {
          nodeId: this.nodeId,
          tableName,
          indexSql,
          error: indexResult?.error || 'Unknown error',
        });
        // Continue with other indices even if one fails
      }
    }

    this.logger.debug(BOOTSTRAP_LOG_MSG.TABLE_CREATED, {
      nodeId: this.nodeId,
      tableName,
    });
  }

  /**
   * Register the initial message group.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async registerMessageGroup(now) {
    const leaderService = this.getLeaderMessageGroupService();
    const leaderNodeId = leaderService?.nodeId || this.nodeId;

    const groupData = {
      group_id: INITIAL_MESSAGE_GROUP_ID,
      group_name: BOOTSTRAP_MESSAGE_GROUP.NAME,
      replica_count: BOOTSTRAP_MESSAGE_GROUP.REPLICA_COUNT,
      [COLUMN.LEADER_NODE_ID]: leaderNodeId,
      policy: JSON.stringify(BOOTSTRAP_MESSAGE_GROUP.POLICY),
      created_at: now,
      updated_at: now,
    };

    await this.cdcIntegrationService.upsertSystemTableRow(
      SystemTableName.MESSAGE_GROUPS,
      groupData,
    );

    this.logger.debug(BOOTSTRAP_LOG_MSG.MESSAGE_GROUP_REGISTERED, {
      groupId: INITIAL_MESSAGE_GROUP_ID,
    });
  }

  /**
   * Register all services in the services table.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async registerServices(now) {
    // Register message group replicas
    for (const [replicaId, service] of this.messageGroupServices) {
      const isLeader = service.isLeaderReplica && service.isLeaderReplica();
      const currentRole = service.getRole ? service.getRole() : null;
      const raftRole = isLeader ?
        RAFT_ROLE.LEADER :
        currentRole || RAFT_ROLE.FOLLOWER;
      const unifiedAddress =
        `${this.nodeId}${ADDRESS.SEPARATOR}${ENTITY_TYPE.MESSAGE_GROUP}` +
        `${ADDRESS.SEPARATOR}${replicaId}`;

      const serviceData = {
        service_id: replicaId,
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: this.nodeId,
        partition_id: null,
        group_id: INITIAL_MESSAGE_GROUP_ID,
        replica_id: replicaId,
        raft_role: raftRole,
        status: STATE.ACTIVE,
        address: unifiedAddress,
        created_at: now,
        updated_at: now,
      };

      await this.cdcIntegrationService.upsertSystemTableRow(
        SystemTableName.SERVICES,
        serviceData,
      );
    }

    // Register partition replicas
    for (const [replicaId, service] of this.partitionServices) {
      const isLeader = service.isLeader === true;
      const currentRole = service.getRole ? service.getRole() : service.role;
      const raftRole = isLeader ?
        RAFT_ROLE.LEADER :
        currentRole || RAFT_ROLE.FOLLOWER;

      const serviceData = {
        service_id: replicaId,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: this.nodeId,
        partition_id: service.partitionId,
        group_id: null,
        replica_id: replicaId,
        raft_role: raftRole,
        status: STATE.ACTIVE,
        address: `${this.nodeId}${ADDRESS.SEPARATOR}` +
          `${ENTITY_TYPE.PARTITION}${ADDRESS.SEPARATOR}${replicaId}`,
        created_at: now,
        updated_at: now,
      };

      await this.cdcIntegrationService.upsertSystemTableRow(
        SystemTableName.SERVICES,
        serviceData,
      );
    }

    this.logger.debug(BOOTSTRAP_LOG_MSG.SERVICES_REGISTERED, {
      messageGroupServices: this.messageGroupServices.size,
      partitionServices: this.partitionServices.size,
    });
  }

  /**
   * Register system tables metadata.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async registerSystemTables(now) {
    for (const schema of SYSTEM_TABLE_SCHEMAS) {
      const tableName = schema.tableName;
      const partitionId = INITIAL_PARTITION_IDS[tableName];

      // Register table
      const tableData = {
        table_id: tableName,
        table_name: tableName,
        schema_definition: JSON.stringify(schema),
        partition_key: schema.columns[NUM.ZERO].name,
        table_policies: JSON.stringify({}),
        partition_count: NUM.ONE,
        created_at: now,
        updated_at: now,
      };

      await this.cdcIntegrationService.upsertSystemTableRow(
        SystemTableName.TABLES,
        tableData,
      );

      // Register partition
      const partitionData = {
        partition_id: partitionId,
        table_id: tableName,
        table_name: tableName,
        partition_key_start: null,
        partition_key_end: null,
        replica_count: NUM.THREE,
        size_bytes: NUM.ZERO,
        leader_node_id: this.nodeId,
        state: PARTITION_STATE.NORMAL,
        created_at: now,
        updated_at: now,
      };

      await this.cdcIntegrationService.upsertSystemTableRow(
        SystemTableName.PARTITIONS,
        partitionData,
      );
    }

    this.logger.debug(BOOTSTRAP_LOG_MSG.SYSTEM_TABLES_REGISTERED, {
      tableCount: SYSTEM_TABLE_SCHEMAS.length,
    });
  }

  /**
   * Update partition sizes in the partitions table.
   * @return {Promise<void>}
   * @private
   */
  async updatePartitionSizes() {
    const updatedPartitions = new Set();

    for (const [_replicaId, partitionService] of this.partitionServices) {
      const partitionId = partitionService.partitionId;

      if (updatedPartitions.has(partitionId)) {
        continue;
      }

      const sizeBytes = await partitionService.calculatePartitionSize();

      await this.cdcIntegrationService.updateSystemTableRow(
        SystemTableName.PARTITIONS,
        {partition_id: partitionId},
        {
          size_bytes: sizeBytes,
          updated_at: Date.now(),
        },
      );

      updatedPartitions.add(partitionId);

      this.logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_SIZE_UPDATED, {
        partitionId,
        sizeBytes,
      });
    }

    this.logger.debug(BOOTSTRAP_LOG_MSG.PARTITION_SIZES_UPDATED, {
      updatedCount: updatedPartitions.size,
    });
  }

  /**
   * Seed dynamic configuration into the config system table.
   * @return {Promise<void>}
   * @private
   */
  async seedDynamicConfiguration() {
    // Get the config partition to check if data already exists
    const configPartition = this.getLeaderPartition(SystemTableName.CONFIG);
    if (!configPartition || !configPartition.isLeader) {
      this.logger.warn(BOOTSTRAP_LOG_MSG.CONFIG_LEADER_MISSING);
      return;
    }

    // Check if config already exists
    try {
      const result = await configPartition.executeQuery(BOOTSTRAP_SQL.CONFIG_COUNT);
      if (result && result.rows && result.rows.length > NUM.ZERO &&
          result.rows[NUM.ZERO].count > NUM.ZERO) {
        this.logger.info(BOOTSTRAP_LOG_MSG.CONFIG_ALREADY_SEEDED, {
          existingCount: result.rows[NUM.ZERO].count,
        });
        return;
      }
    } catch (error) {
      this.logger.debug(BOOTSTRAP_LOG_MSG.CONFIG_CHECK_FAILED, {
        error: error.message,
      });
      throw error;
    }

    const systemTableCache = this.getSystemTableCache();

    // Use the CDCIntegrationService directly - it's in bootstrap mode
    // so writes go directly to local partitions
    const dynamicConfigService = new DynamicConfigService({
      cdcIntegrationService: this.cdcIntegrationService,
      systemTableCache,
      nodeId: this.nodeId,
    });
    await dynamicConfigService.initialize();

    try {
      const result = await dynamicConfigService.seedConfiguration(CONFIG_SEED_SOURCE.SYSTEM);
      this.logger.info(BOOTSTRAP_LOG_MSG.CONFIG_SEEDED, {
        seeded: result.seeded.length,
        skipped: result.skipped.length,
      });
    } catch (error) {
      this.logger.error(BOOTSTRAP_LOG_MSG.CONFIG_SEED_FAILED, {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get the leader partition for a table.
   * @param {string} tableName - Table name.
   * @return {Object|null} Leader partition service or null.
   * @private
   */
  getLeaderPartition(tableName) {
    const partitionId = INITIAL_PARTITION_IDS[tableName];
    if (!partitionId) {
      return null;
    }

    for (const partition of this.partitionServices.values()) {
      if (partition.partitionId === partitionId && partition.isLeader) {
        return partition;
      }
    }
    return null;
  }

  /**
   * Clean up resources on failure.
   * @return {Promise<void>}
   */
  async cleanup() {
    if (this.cdcIntegrationService && this.cdcIntegrationService.bootstrapMode) {
      this.cdcIntegrationService.clearBootstrapMode();
    }
  }
}

export {RegistrationPhase, REGISTRATION_PHASE};
