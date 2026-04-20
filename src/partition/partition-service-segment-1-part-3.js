import { PARTITION_SERVICE_SHARED } from "./partition-service-shared.js";
import { PartitionServiceSegment1Part2 } from "./partition-service-segment-1-part-2.js";

const {
  ACTIVE_VOTER_ROLES,
  ADD_LIKE_REPLICA_OPERATION_TYPES,
  AddressManager,
  AuthoritativeRowMutationHelper,
  CANONICAL_PARTITION_LEADER_OBSERVATION_STATE,
  CDCEventBuffer,
  CDCOperation,
  CDCPipelineMetrics,
  CDC_LIFECYCLE_LOG_MSG,
  CDC_OPERATION,
  CDC_PIPELINE_METRIC,
  COLUMN,
  CONFIG_KEY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_PARTITION_IDS,
  CONTROL_PLANE_READINESS_DIMENSION,
  CRITICAL_SYSTEM_PARTITION_IDS,
  ConfigurationManager,
  DEFAULT_TRANSACTION_SESSION_ID,
  Database,
  ENTITY_TYPE,
  ERRORS,
  EntityType,
  EventEmitter,
  HLCClockService,
  INITIAL_PARTITION_IDS,
  LIFECYCLE_REASON,
  LeaderActivationGate,
  LeaderActivationScheduler,
  LifeRaft,
  LiferaftProvider,
  LoggingService,
  METRICS_LOG_TAG,
  NUM,
  OperationType,
  PARTICIPANT_ACK_FIELD,
  PARTITION_CDC_EVENT_BUILD_STATE,
  PARTITION_RAFT_ROLE,
  PARTITION_REPLICA_COUNT_FIELD,
  PARTITION_SERVICE_ADDRESS,
  PARTITION_SERVICE_COLUMN,
  PARTITION_SERVICE_COLUMN_SQL,
  PARTITION_SERVICE_DB,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_INIT_STAGE,
  PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON,
  PARTITION_SERVICE_LIFERAFT_TIMER,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_MIGRATION_OPERATION,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_REASON,
  PARTITION_SERVICE_RESPONSE,
  PARTITION_SERVICE_ROLE,
  PARTITION_SERVICE_SQL,
  PARTITION_SERVICE_SQL_FRAGMENT,
  PARTITION_SERVICE_STATUS,
  PARTITION_SERVICE_TYPE,
  PARTITION_SERVICE_VALUE,
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_STATE,
  PARTITION_SUBSYSTEM,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  PARTITION_WRITE_COMMIT_MODE,
  PRESSURE_WORK_CLASS,
  PartitionCDCDelivery,
  PartitionCDCGenerator,
  PartitionRaftLogEntry,
  PartitionRaftStorage,
  PartitionState,
  PendingRequestTracker,
  ProposalQueue,
  QUERY_PAYLOAD_FIELD_MIGRATION_ID,
  QUERY_PAYLOAD_FIELD_MIGRATION_OPERATION,
  RaftRole,
  ReplicaStatus,
  SERVICE_TYPE,
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
  SPLIT_SNAPSHOT_BACKFILL_YIELD_EVERY_ROWS,
  SQL,
  SQLiteLogAdapter,
  STRING,
  SYSTEM_TABLE_NAME,
  TABLES,
  TERMINAL_STATUSES,
  TIMEOUT_BUDGET_DEFAULT,
  TYPEOF,
  UnifiedRebalancer,
  WRITE_PHASE_FIELD_APPLY_WRITE_MS,
  WRITE_PHASE_FIELD_ENTRY_BUILD_MS,
  WRITE_PHASE_FIELD_FORWARD_DELIVER_MS,
  WRITE_PHASE_FIELD_LOG_APPEND_MS,
  WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS,
  WRITE_PHASE_FIELD_SQLITE_RUN_MS,
  WRITE_PHASE_FIELD_TOTAL_MS,
  applyRuntimeRaftTiming,
  assertCritical,
  assertRaftProviderContract,
  attachTrafficReadinessListener,
  buildPartitionWriteEntry,
  buildPartitionWriteFailureResult,
  buildPartitionWriteSideEffectPlan,
  buildPriorityRecoveryCompletion,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  cloneSplitRoutingEntry,
  computeReplicaElectionTimeouts,
  createControlPlaneRuntimeBundle,
  executePartitionWriteStatement,
  extractPartitionSplitRoutingKey,
  fs,
  getSystemCachePrimaryKeyFieldOrFallback,
  getTrafficReadinessSnapshot,
  hasPriorityRecoverySpreadGap,
  isBackgroundWorkLifecycleReady,
  isMetadataPublicationLifecycleReady,
  isPriorityControlPlanePartition,
  isRaftPacket,
  isSystemTableWriteReady,
  normalizePublishedRaftRole,
  path,
  replayPartitionSplitEntry,
  resolveCanonicalPartitionLeaderObservation,
  resolvePartitionSplitTargetPartitionId,
  resolvePartitionWriteCommitMode,
  resolvePriorityRecoveryActiveNodeCohort,
  resolveRaftTransportDeliveryOptions,
  routePartitionSplitMirroredWrite,
  runRetryableControlPlaneWrite,
  wireReplicaLifecycleEvents,
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
        { tableName: this.tableName, partitionId: this.partitionId },
      );
    }
    if (!hasPendingPartitionVersion) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_PENDING_PARTITION_VERSION,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.ADDED_PENDING_PARTITION_VERSION,
        { tableName: this.tableName, partitionId: this.partitionId },
      );
    }
    if (!hasPartitionTransitionState) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_PARTITION_TRANSITION_STATE,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.ADDED_PARTITION_TRANSITION_STATE,
        { tableName: this.tableName, partitionId: this.partitionId },
      );
    }
    if (!hasPartitionTransitionMetadata) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_PARTITION_TRANSITION_METADATA,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.ADDED_PARTITION_TRANSITION_METADATA,
        { tableName: this.tableName, partitionId: this.partitionId },
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

export { PartitionServiceSegment1 };
