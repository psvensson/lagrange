import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {PartitionServiceSegment1Part2} from './partition-service-segment-1-part-2.js';

const {
  COLUMN,
  PARTITION_SERVICE_COLUMN,
  PARTITION_SERVICE_COLUMN_SQL,
  PARTITION_SERVICE_LOG_MSG,
  SYSTEM_TABLE_NAME,
} = PARTITION_SERVICE_SHARED;

class PartitionServiceSegment1 extends PartitionServiceSegment1Part2 {
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
    const columns = this.db
      .prepare(`PRAGMA table_info(${this.tableName})`)
      .all();
    const hasActivePartitionVersion = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.ACTIVE_PARTITION_VERSION,
    );
    const hasPendingPartitionVersion = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.PENDING_PARTITION_VERSION,
    );
    const hasPartitionTransitionState = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.PARTITION_TRANSITION_STATE,
    );
    const hasPartitionTransitionMetadata = columns.some(
      (col) =>
        col.name === PARTITION_SERVICE_COLUMN.PARTITION_TRANSITION_METADATA,
    );
    if (!hasActivePartitionVersion) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_ACTIVE_PARTITION_VERSION,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.ADDED_ACTIVE_PARTITION_VERSION,
        {tableName: this.tableName, partitionId: this.partitionId},
      );
    }
    if (!hasPendingPartitionVersion) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_PENDING_PARTITION_VERSION,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.ADDED_PENDING_PARTITION_VERSION,
        {tableName: this.tableName, partitionId: this.partitionId},
      );
    }
    if (!hasPartitionTransitionState) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_PARTITION_TRANSITION_STATE,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.ADDED_PARTITION_TRANSITION_STATE,
        {tableName: this.tableName, partitionId: this.partitionId},
      );
    }
    if (!hasPartitionTransitionMetadata) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_PARTITION_TRANSITION_METADATA,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.ADDED_PARTITION_TRANSITION_METADATA,
        {tableName: this.tableName, partitionId: this.partitionId},
      );
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

export {PartitionServiceSegment1};
