import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import LifeRaft from "../raft/liferaft.js";
import { ConfigurationManager } from "../config/configuration-manager.js";
import { CONFIG_KEY } from "../config/config-constants.js";
import { CONTROL_PLANE_READINESS_DIMENSION } from "../control-plane/control-plane-readiness-constants.js";
import { PRESSURE_WORK_CLASS } from "../control-plane/pressure-governor.js";
import { CONTROL_PLANE_MUTATION_OPERATION } from "../control-plane/control-plane-system-table-gateway.js";
import { createControlPlaneRuntimeBundle } from "../control-plane/control-plane-runtime-bundle.js";
import { LoggingService } from "../logging/logging-service.js";
import { HLCClockService } from "../hlc/hlc-clock-service.js";
import {
  UnifiedRebalancer,
  EntityType,
} from "../rebalancer/unified-rebalancer.js";
import {
  OperationType,
  ReplicaStatus,
  TERMINAL_STATUSES,
} from "../rebalancer/replica-status.js";
import { assertCritical } from "../utils/assert.js";
import { PendingRequestTracker } from "./pending-request-tracker.js";
import { ProposalQueue } from "./proposal-queue.js";
import {
  PARTITION_WRITE_COMMIT_MODE,
  buildPartitionWriteEntry,
  buildPartitionWriteFailureResult,
  buildPartitionWriteSideEffectPlan,
  executePartitionWriteStatement,
  resolvePartitionWriteCommitMode,
} from "./partition-write-kernel.js";
import { CDCEventBuffer } from "./cdc-event-buffer.js";
import {
  cloneSplitEntry as cloneSplitRoutingEntry,
  extractSplitRoutingKey as extractPartitionSplitRoutingKey,
  replaySplitEntry as replayPartitionSplitEntry,
  resolveSplitTargetPartitionId as resolvePartitionSplitTargetPartitionId,
  routeSplitMirroredWrite as routePartitionSplitMirroredWrite,
} from "./partition-split-routing.js";
import {
  PARTITION_CDC_EVENT_BUILD_STATE,
  PartitionCDCGenerator,
} from "./partition-cdc-generator.js";
import { PartitionCDCDelivery } from "./partition-cdc-delivery.js";
import { CDCPipelineMetrics } from "../cdc/cdc-pipeline-metrics.js";
import {
  CDC_PIPELINE_METRIC,
  CDC_LIFECYCLE_LOG_MSG,
} from "../constants/cdc-lifecycle-constants.js";
import { isRaftPacket } from "../raft/raft-packet-utils.js";
import { resolveRaftTransportDeliveryOptions } from "../raft/constants.js";
import { SQLiteLogAdapter } from "../raft/sqlite-log-adapter.js";
import { assertRaftProviderContract } from "../raft/raft-provider-contract.js";
import { LiferaftProvider } from "../raft/liferaft-provider.js";
import { AuthoritativeRowMutationHelper } from "../raft/authoritative-row-mutation-helper.js";
import { wireReplicaLifecycleEvents } from "../raft/replica-leadership-state.js";
import { normalizePublishedRaftRole } from "../raft/published-raft-role.js";
import {
  applyRuntimeRaftTiming,
  computeReplicaElectionTimeouts,
} from "../raft/raft-timing-utils.js";
import { LeaderActivationGate } from "../raft/leader-activation-gate.js";
import { LeaderActivationScheduler } from "../raft/leader-activation-scheduler.js";
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from "../bootstrap/system-table-schemas-constants.js";
import { LIFECYCLE_REASON } from "../bootstrap/lifecycle-controller-constants.js";
import { isPriorityControlPlanePartition } from "../bootstrap/system-partition-classification.js";
import {
  buildPriorityRecoveryLearnerPromotion,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  hasPriorityRecoverySpreadGap,
  resolvePriorityRecoveryActiveNodeCohort,
} from "../control-plane/priority-recovery-snapshot.js";
import { buildPriorityRecoveryCompletion } from "../control-plane/priority-recovery-completion.js";
import { runRetryableControlPlaneWrite } from "../bootstrap/shared/retryable-control-plane-write.js";
import {
  attachTrafficReadinessListener,
  getTrafficReadinessSnapshot,
  isBackgroundWorkReady as isBackgroundWorkLifecycleReady,
  isMetadataPublicationReady as isMetadataPublicationLifecycleReady,
} from "../bootstrap/traffic-readiness-utils.js";
import { AddressManager } from "../address/address-manager.js";
import { isSystemTableWriteReady } from "../cache/leader-readiness-gate.js";
import { getSystemCachePrimaryKeyFieldOrFallback } from "../cache/system-cache-key-descriptor.js";
import {
  COLUMN,
  CDC_OPERATION,
  ENTITY_TYPE,
  ERRORS,
  METRICS_LOG_TAG,
  NUM,
  SQL,
  SERVICE_TYPE,
  STRING,
  TABLES,
  TYPEOF,
} from "../constants/index.js";
import {
  PARTITION_RAFT_ROLE,
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_STATE,
  PARTITION_SUBSYSTEM,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from "./partition-constants.js";
import {
  SPLIT_ACK_STATUS,
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_PARTICIPANT_PREFIX,
} from "./split-ack-constants.js";
import { PARTICIPANT_ACK_FIELD } from "../workflow/workflow-constants.js";
import {
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
  PARTITION_SERVICE_MIGRATION_OPERATION,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_REASON,
  PARTITION_SERVICE_RESPONSE,
  PARTITION_SERVICE_ROLE,
  PARTITION_SERVICE_SQL,
  PARTITION_SERVICE_SQL_FRAGMENT,
  PARTITION_SERVICE_STATUS,
  PARTITION_SERVICE_TYPE,
  PARTITION_SERVICE_VALUE,
} from "./partition-service-constants.js";
import {
  PartitionRaftStorage,
  PartitionRaftLogEntry,
} from "./partition-raft-storage.js";
import { TIMEOUT_BUDGET_DEFAULT } from "../control-plane/timeout-budget.js";
import {
  CANONICAL_PARTITION_LEADER_OBSERVATION_STATE,
  resolveCanonicalPartitionLeaderObservation,
} from "../query/canonical-leader-routing.js";
const PARTITION_SERVICE_LITERAL = Object.freeze({
  BOOLEAN: "boolean",
  VALUE_250: 250,
  VALUE_25: 25,
  FAILED_TO_FLUSH_DEFERRED_PARTITION_RAFT_ROLE_UPDATE:
    "Failed to flush deferred partition raft-role update",
  FAILED_TO_FLUSH_DEFERRED_PARTITION_LEADER_UPDATE:
    "Failed to flush deferred partition leader update",
  BACKGROUND: "background",
  READY: "ready",
  NOT_OWNER: "not-owner",
  TICKINTERVALMS: "tickIntervalMs",
  BEGIN: "BEGIN",
  PREPARE: "PREPARE",
  OBJECT: "object",
  INSERT: "INSERT",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  CREATE: "CREATE",
  DROP: "DROP",
  ALTER: "ALTER",
  PREPAREDSTATEHOLDTIMER: "preparedStateHoldTimer",
  SELECT: "select",
  SUPPRESSING_CDC_EVENT_FOR_NO_OP_WRITE:
    "Suppressing CDC event for no-op write",
  BUFFERED_BACKLOG_PRESENT: "buffered_backlog_present",
  SUBSCRIBER_DELIVERY_FAILED: "subscriber_delivery_failed",
  WRITE_ACTIVITY: "write_activity",
  VALUE: "|",
  SQLITE_CONSTRAINT_PRIMARYKEY: "SQLITE_CONSTRAINT_PRIMARYKEY",
  SQLITE_CONSTRAINT: "SQLITE_CONSTRAINT",
  UNIQUE_CONSTRAINT_FAILED: "UNIQUE CONSTRAINT FAILED",
  ENOENT: "ENOENT",
  SIZEUPDATETIMER: "sizeUpdateTimer",
  SIZE_PERSISTENCE_FAILED: "size persistence failed",
  CRITICAL: "critical",
  LEARNERPROMOTIONTIMER: "learnerPromotionTimer",
  LEADER_NOT_DISCOVERED: "leader_not_discovered",
  WOULD_EXCEED_TARGET_REPLICA_COUNT: "would_exceed_target_replica_count",
  WOULD_CAUSE_EVEN_VOTER_COUNT: "would_cause_even_voter_count",
  PARTITION_SERVICE_SHUTDOWN: "Partition service shutdown",
});
const PartitionState = PARTITION_STATE;
const RaftRole = PARTITION_RAFT_ROLE;
const CONTROL_PLANE_PARTITION_IDS = new Set(
  Object.values(INITIAL_PARTITION_IDS),
);
const CDCOperation = CDC_OPERATION;
const ACTIVE_VOTER_ROLES = /* @__PURE__ */ new Set([
  PARTITION_RAFT_ROLE.LEADER,
  PARTITION_RAFT_ROLE.FOLLOWER,
  PARTITION_RAFT_ROLE.CANDIDATE,
]);
const ADD_LIKE_REPLICA_OPERATION_TYPES = /* @__PURE__ */ new Set([
  OperationType.ADD,
  OperationType.REPLACE,
]);
const WRITE_PHASE_FIELD_ENTRY_BUILD_MS = "entryBuildMs";
const WRITE_PHASE_FIELD_LOG_APPEND_MS = "logAppendMs";
const WRITE_PHASE_FIELD_SQLITE_RUN_MS = "sqliteRunMs";
const WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS = "raftCommandDispatchMs";
const WRITE_PHASE_FIELD_FORWARD_DELIVER_MS = "forwardDeliverMs";
const WRITE_PHASE_FIELD_APPLY_WRITE_MS = "applyWriteMs";
const WRITE_PHASE_FIELD_TOTAL_MS = "totalMs";
const SPLIT_SNAPSHOT_BACKFILL_YIELD_EVERY_ROWS = 64;
const DEFAULT_TRANSACTION_SESSION_ID = "default";
const QUERY_PAYLOAD_FIELD_MIGRATION_OPERATION = "migrationOperation";
const QUERY_PAYLOAD_FIELD_MIGRATION_ID = "migrationId";
const PARTITION_REPLICA_COUNT_FIELD = "replica_count";
const CRITICAL_SYSTEM_PARTITION_IDS = new Set(
  Object.values(SYSTEM_TABLE_NAME).map((tableName) => `${tableName}-p1`),
);

export const PARTITION_SERVICE_SHARED = {
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
  buildPriorityRecoveryLearnerPromotion,
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
};
