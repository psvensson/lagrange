/**
 * ReplicaHandler - Handles replica operations on target node.
 *
 * Simplified from ReplicaLifecycleManager - only handles execution,
 * not tracking (that's the coordinator's job).
 *
 * Requirements: 10.2, 3.1
 */
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { AddressManager } from "../address/address-manager.js";
import { LoggingService } from "../logging/logging-service.js";
import { ConfigurationManager } from "../config/configuration-manager.js";
import { CONFIG_KEY } from "../config/config-constants.js";
import { SYSTEM_TABLE_NAME } from "../bootstrap/system-table-schemas-constants.js";
import { STORAGE_DEFAULT } from "../storage/storage-constants.js";
import { NUM, WORKFLOW_STEP } from "../constants/index.js";
import { assertCritical } from "../utils/assert.js";
import { CONTROL_PLANE_MUTATION_OPERATION } from "../control-plane/control-plane-system-table-gateway.js";
import { createControlPlaneRuntimeBundle } from "../control-plane/control-plane-runtime-bundle.js";
import { PRESSURE_WORK_CLASS } from "../control-plane/pressure-governor.js";
import { PartitionServiceRowOwner } from "../partition/partition-service-row-owner.js";
import { createSystemMetadataGatewayRequiredError } from "../control-plane/system-metadata-access-error.js";
import { runRetryableControlPlaneWrite } from "../bootstrap/shared/retryable-control-plane-write.js";
import { OperationType, ReplicaStatus } from "../rebalancer/replica-status.js";
import { EXECUTOR_OUTCOME_TYPE } from "../rebalancer/executor-outcome-constants.js";
import {
  ReplicaOperationMessageType,
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from "../rebalancer/replica-operation-constants.js";
import {
  REPLICA_HANDLER_ADDRESS,
  REPLICA_HANDLER_DEFAULT,
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_ERRNO,
  REPLICA_HANDLER_EVENT,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_NUM,
  REPLICA_HANDLER_PROGRESS,
  REPLICA_HANDLER_SERVICE,
  REPLICA_HANDLER_SUBSYSTEM,
  REPLICA_HANDLER_TYPEOF,
} from "./replica-handler-constants.js";
import { PARTITION_SERVICE_INIT_STAGE } from "../partition/partition-service-constants.js";
import { RAFT_ROLE } from "../raft/constants.js";
import { isNodeRecordReady } from "./node-readiness-policy.js";
import { ReplicaCreationProgressReporter } from "../utils/replica-creation-progress-reporter.js";
import { ReplicaStateMachine } from "./replica-state-machine.js";
import LifeRaft from "../raft/liferaft.js";
import { assignReplicaHandlerRuntimeMethods } from "./replica-handler-runtime-methods.js";
import { ReplicaHandler } from './replica-handler-class-part-2.js';
const REPLICA_HANDLER_LEADER_HANDOFF_STATE = Object.freeze({
  COMPLETED: "completed",
  NOT_APPLICABLE: "not_applicable",
  NOT_SUPPORTED: "not_supported",
});
const REPLICA_HANDLER_LEADER_HANDOFF_LITERAL = Object.freeze({
  EMPTY_LEADER_ID: "",
});
const REPLICA_HANDLER_LITERAL = Object.freeze({
  READY_LEASE_EXPIRES_AT: "ready_lease_expires_at",
  READYLEASEEXPIRESAT: "readyLeaseExpiresAt",
  READYLEASEEXPIRESATMS: "readyLeaseExpiresAtMs",
  READYLEASEEXPIRES: "readyLeaseExpires",
  VALUE: "",
  DURABLE_REMOVE_CLEANUP_COMPLETE: "durable_remove_cleanup_complete",
  ADD: "ADD",
  REPLICAHANDLER: "ReplicaHandler",
  READ: "read",
  SYSTEM_TABLE_QUERY_FAILED: "system table query failed",
});
const CRITICAL_SYSTEM_PARTITION_IDS = new Set(
  Object.values(SYSTEM_TABLE_NAME).map((tableName) => `${tableName}-p1`),
);
const VOTER_READY_CHECK_INTERVAL_MS = 250;
const METADATA_RESOLUTION_POLL_INTERVAL_MS = 50;
const partitionMetadataMissingError =
  REPLICA_HANDLER_ERROR_MSG.PARTITION_METADATA_MISSING;
const tableMetadataMissingError =
  REPLICA_HANDLER_ERROR_MSG.TABLE_METADATA_MISSING;
const PARTITION_METADATA_MISSING_PREFIX = partitionMetadataMissingError("");
const TABLE_METADATA_MISSING_PREFIX = tableMetadataMissingError("");
const ESTABLISHED_VOTER_ROLES = new Set([
  RAFT_ROLE.LEADER,
  RAFT_ROLE.FOLLOWER,
  RAFT_ROLE.CANDIDATE,
]);
const CRITICAL_VOTER_READY_GATED_OPERATION_TYPES = new Set([
  OperationType.ADD,
  OperationType.REPLACE,
]);
const CRITICAL_VOTER_READY_FALLBACK_OPERATION_TYPES = new Set([
  OperationType.REMOVE,
  OperationType.REPLACE,
]);
const SYSTEM_TABLE_HYDRATION_SQL = Object.freeze({
  PARTITION_BY_ID: `SELECT * FROM ${SYSTEM_TABLE_NAME.PARTITIONS} WHERE partition_id = ?`,
  TABLE_BY_ID: `SELECT * FROM ${SYSTEM_TABLE_NAME.TABLES} WHERE table_id = ?`,
  PARTITION_SERVICES:
    `SELECT * FROM ${SYSTEM_TABLE_NAME.SERVICES} ` +
    "WHERE partition_id = ? AND service_type = ?",
});
function resolveSnapshotStateForTransition(
  existingStatus,
  localStatus,
  targetStatus,
) {
  if (existingStatus) {
    return existingStatus;
  }
  if (localStatus && localStatus !== targetStatus) {
    return localStatus;
  }
  switch (targetStatus) {
    case ReplicaStatus.CREATING:
      return ReplicaStatus.PENDING;
    case ReplicaStatus.SYNCING:
      return ReplicaStatus.CREATING;
    case ReplicaStatus.ACTIVE:
      return ReplicaStatus.SYNCING;
    case ReplicaStatus.REMOVING:
      return ReplicaStatus.ACTIVE;
    case ReplicaStatus.REMOVED:
      return ReplicaStatus.REMOVING;
    default:
      return localStatus || ReplicaStatus.ACTIVE;
  }
}
function isFreshPartitionBootstrapWindow(partition) {
  if (!partition || partition.leader_node_id) {
    return false;
  }
  return (
    Number.isFinite(partition.created_at) &&
    Number.isFinite(partition.updated_at) &&
    partition.created_at === partition.updated_at
  );
}
function hasExplicitReadyLeaseMetadata(nodeRow) {
  return Boolean(
    nodeRow &&
    typeof nodeRow === REPLICA_HANDLER_TYPEOF.OBJECT &&
    (Object.prototype.hasOwnProperty.call(
      nodeRow,
      REPLICA_HANDLER_LITERAL.READY_LEASE_EXPIRES_AT,
    ) ||
      Object.prototype.hasOwnProperty.call(
        nodeRow,
        REPLICA_HANDLER_LITERAL.READYLEASEEXPIRESAT,
      ) ||
      Object.prototype.hasOwnProperty.call(
        nodeRow,
        REPLICA_HANDLER_LITERAL.READYLEASEEXPIRESATMS,
      ) ||
      Object.prototype.hasOwnProperty.call(
        nodeRow,
        REPLICA_HANDLER_LITERAL.READYLEASEEXPIRES,
      )),
  );
}
function isReplicaJoinNodeViable(nodeRow, options = {}) {
  if (!nodeRow) {
    return true;
  }
  if (nodeRow.status !== ReplicaStatus.ACTIVE) {
    return false;
  }
  if (!hasExplicitReadyLeaseMetadata(nodeRow)) {
    return true;
  }
  return isNodeRecordReady(nodeRow, {
    now: options.now,
    requireActiveStatus: true,
  });
}
/**
 * ReplicaHandler handles replica creation and removal requests on target nodes.
 * Returns immediately with status, then performs async work.
 */
assignReplicaHandlerRuntimeMethods(ReplicaHandler, {
  AddressManager,
  ESTABLISHED_VOTER_ROLES,
  METADATA_RESOLUTION_POLL_INTERVAL_MS,
  NUM,
  PRESSURE_WORK_CLASS,
  PARTITION_METADATA_MISSING_PREFIX,
  PartitionServiceRowOwner,
  REPLICA_HANDLER_ADDRESS,
  REPLICA_HANDLER_ERRNO,
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_EVENT,
  REPLICA_HANDLER_LITERAL,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_NUM,
  REPLICA_HANDLER_SERVICE,
  REPLICA_HANDLER_TYPEOF,
  ReplicaStatus,
  STORAGE_DEFAULT,
  SYSTEM_TABLE_HYDRATION_SQL,
  SYSTEM_TABLE_NAME,
  TABLE_METADATA_MISSING_PREFIX,
  createControlPlaneRuntimeBundle,
  createSystemMetadataGatewayRequiredError,
  fs,
  isFreshPartitionBootstrapWindow,
  isReplicaJoinNodeViable,
  path,
  partitionMetadataMissingError,
});
export { ReplicaHandler };
