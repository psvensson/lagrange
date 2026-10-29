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
    const hasPartitionKeyType = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.PARTITION_KEY_TYPE,
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
    if (!hasPartitionKeyType) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_PARTITION_KEY_TYPE,
      );
      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_PARTITION_KEY_TYPE, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }
  }
  /**
   * Ensure indices table includes global index lifecycle columns.
   * @private
   */
  ensureIndicesTableColumns() {
    if (this.tableName !== SYSTEM_TABLE_NAME.INDICES) {
      return;
    }
    const columns = this.db
      .prepare(`PRAGMA table_info(${this.tableName})`)
      .all();
    const present = new Set(columns.map((col) => col.name));
    const addedColumns = [
      ['table_name', 'ADD COLUMN table_name TEXT'],
      ['is_global', 'ADD COLUMN is_global INTEGER NOT NULL DEFAULT 1'],
      ['is_unique', 'ADD COLUMN is_unique INTEGER NOT NULL DEFAULT 0'],
      ['state', 'ADD COLUMN state TEXT NOT NULL DEFAULT \'CREATING\''],
      ['backfill_cursor_partition_id', 'ADD COLUMN backfill_cursor_partition_id TEXT'],
      ['backfill_cursor_pk', 'ADD COLUMN backfill_cursor_pk TEXT'],
      ['backfill_total_rows', 'ADD COLUMN backfill_total_rows INTEGER NOT NULL DEFAULT 0'],
      ['error_message', 'ADD COLUMN error_message TEXT'],
      ['updated_at', 'ADD COLUMN updated_at INTEGER'],
    ];
    for (const [column, addSql] of addedColumns) {
      if (!present.has(column)) {
        this.db.exec(`ALTER TABLE ${this.tableName} ${addSql}`);
        this.logger.info(`Added ${column} column to indices table`, {
          tableName: this.tableName,
          partitionId: this.partitionId,
        });
      }
    }
  }
}

export {PartitionServiceSchemaMigrationBase};
