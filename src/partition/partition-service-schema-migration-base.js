import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {PartitionServiceRaftInitBase} from './partition-service-raft-init-base.js';

const {
  COLUMN,
  PARTITION_SERVICE_COLUMN,
  PARTITION_SERVICE_COLUMN_SQL,
  PARTITION_SERVICE_LOG_MSG,
  SYSTEM_TABLE_NAME,
} = PARTITION_SERVICE_SHARED;

// The columns the tables table gained after it first shipped: [column, its
// ADD COLUMN clause, the log line of the upgrade].
const TABLES_TABLE_ADDED_COLUMNS = Object.freeze([
  [PARTITION_SERVICE_COLUMN.ACTIVE_PARTITION_VERSION,
    PARTITION_SERVICE_COLUMN_SQL.ADD_ACTIVE_PARTITION_VERSION,
    PARTITION_SERVICE_LOG_MSG.ADDED_ACTIVE_PARTITION_VERSION],
  [PARTITION_SERVICE_COLUMN.PENDING_PARTITION_VERSION,
    PARTITION_SERVICE_COLUMN_SQL.ADD_PENDING_PARTITION_VERSION,
    PARTITION_SERVICE_LOG_MSG.ADDED_PENDING_PARTITION_VERSION],
  [PARTITION_SERVICE_COLUMN.PARTITION_TRANSITION_STATE,
    PARTITION_SERVICE_COLUMN_SQL.ADD_PARTITION_TRANSITION_STATE,
    PARTITION_SERVICE_LOG_MSG.ADDED_PARTITION_TRANSITION_STATE],
  [PARTITION_SERVICE_COLUMN.PARTITION_TRANSITION_METADATA,
    PARTITION_SERVICE_COLUMN_SQL.ADD_PARTITION_TRANSITION_METADATA,
    PARTITION_SERVICE_LOG_MSG.ADDED_PARTITION_TRANSITION_METADATA],
  // The workflow record generation (managed-workflow-record-store.js).
  [PARTITION_SERVICE_COLUMN.PARTITION_TRANSITION_GENERATION,
    PARTITION_SERVICE_COLUMN_SQL.ADD_PARTITION_TRANSITION_GENERATION,
    PARTITION_SERVICE_LOG_MSG.ADDED_PARTITION_TRANSITION_GENERATION],
]);

class PartitionServiceSchemaMigrationBase extends PartitionServiceRaftInitBase {
  /**
   * Ensure services includes the durable cleanup ownership token.
   * @private
   */
  ensureServicesTableColumns() {
    if (this.tableName !== SYSTEM_TABLE_NAME.SERVICES) {
      return;
    }
    const columns = this.db
      .prepare(`PRAGMA table_info(${this.tableName})`)
      .all();
    const hasCleanupToken = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.CLEANUP_TOKEN,
    );
    const hasCreateAttemptToken = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.CREATE_ATTEMPT_TOKEN,
    );
    if (!hasCleanupToken) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_CLEANUP_TOKEN,
      );
      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_SERVICES_CLEANUP_TOKEN, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }
    if (!hasCreateAttemptToken) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_CREATE_ATTEMPT_TOKEN,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.ADDED_SERVICES_CREATE_ATTEMPT_TOKEN,
        {tableName: this.tableName, partitionId: this.partitionId},
      );
    }
  }
  /**
   * Ensure message_groups table includes leader_node_id column.
   * @private
   */
  ensureMessageGroupsTableColumns() {
    if (this.tableName !== SYSTEM_TABLE_NAME.MESSAGE_GROUPS) {
      return;
    }
    const columns = this.db
      .prepare(`PRAGMA table_info(${this.tableName})`)
      .all();
    const hasLeaderNode = columns.some(
      (col) => col.name === COLUMN.LEADER_NODE_ID,
    );
    if (!hasLeaderNode) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_LEADER_NODE_ID,
      );
      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_MESSAGE_GROUP_LEADER, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }
  }
  /**
   * Ensure tables table includes partition lifecycle columns.
   * @private
   */
  ensureTablesTableColumns() {
    if (this.tableName !== SYSTEM_TABLE_NAME.TABLES) {
      return;
    }
    const present = new Set(this.db
      .prepare(`PRAGMA table_info(${this.tableName})`)
      .all().map((col) => col.name));
    for (const [column, addSql, logMessage] of TABLES_TABLE_ADDED_COLUMNS) {
      if (present.has(column)) {
        continue;
      }
      this.db.exec(`ALTER TABLE ${this.tableName} ${addSql}`);
      this.logger.info(logMessage,
        {tableName: this.tableName, partitionId: this.partitionId});
    }
  }
  /**
   * Ensure partitions table includes table_name column for compatibility.
   * @private
   */
  ensurePartitionsTableColumns() {
    if (this.tableName !== SYSTEM_TABLE_NAME.PARTITIONS) {
      return;
    }
    const columns = this.db
      .prepare(`PRAGMA table_info(${this.tableName})`)
      .all();
    const hasTableName = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.TABLE_NAME,
    );
    const hasPartitionVersion = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.PARTITION_VERSION,
    );
    if (!hasTableName) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_TABLE_NAME,
      );
      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_PARTITIONS_TABLE_NAME, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }
    if (!hasPartitionVersion) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_PARTITION_VERSION,
      );
      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_PARTITION_VERSION, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }
  }
}

export {PartitionServiceSchemaMigrationBase};
